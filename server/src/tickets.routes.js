// tickets.routes.js — all /api/tickets endpoints
// Every handler is async and wraps DB work in try/catch so an unexpected
// Postgres error is forwarded to the central error middleware rather than
// crashing the request silently.

import { Router } from 'express';
import { pool } from './db.js';
import { validateTicket } from './validation.js';
import { isUrgent, withUrgency } from './urgency.js';

const router = Router();

// ─── POST /api/tickets ───────────────────────────────────────────────────────
// Creates a new ticket.
// Also checks for an existing ticket with the same email so the frontend
// can warn the agent about a returning customer (see section 8 of the guide).
router.post('/', async (req, res, next) => {
  try {
    // Validate first — never trust client data.
    const errors = validateTicket(req.body);
    if (Object.keys(errors).length) {
      return res.status(400).json({ errors });
    }

    const { customer_name, customer_email, subject, description, priority } = req.body;

    // Check for existing tickets from the same email to surface history warning.
    const { rows: [{ count: previousCount }] } = await pool.query(
      `SELECT COUNT(*)::int AS count FROM tickets WHERE customer_email = $1`,
      [customer_email]
    );

    // RETURNING * lets us echo the saved row back without a second SELECT.
    const { rows } = await pool.query(
      `INSERT INTO tickets (customer_name, customer_email, subject, description, priority)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [customer_name, customer_email, subject, description, priority]
    );

    const ticket = withUrgency(rows[0]);

    // Include duplicate_customer flag so the frontend can show a non-blocking
    // notice: "This customer has N previous tickets. [View history]"
    res.status(201).json({
      ...ticket,
      duplicate_customer: previousCount > 0,
      previous_ticket_count: previousCount,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/tickets ────────────────────────────────────────────────────────
// Lists tickets with optional search, filter, and sort query params.
// ?search=   — case-insensitive substring match across name, email, subject
// ?priority= — exact match: Low | Medium | High
// ?status=   — exact match: Open | In Progress | Resolved
// ?sort=     — asc | desc  (defaults to desc / newest first)
router.get('/', async (req, res, next) => {
  try {
    const clauses = [];
    const params = [];
    let i = 1;

    if (req.query.search) {
      // ILIKE is Postgres-specific case-insensitive LIKE — no extra extension needed.
      // Reusing $i across three columns avoids pushing three identical values.
      clauses.push(
        `(customer_name ILIKE $${i} OR customer_email ILIKE $${i} OR subject ILIKE $${i})`
      );
      params.push(`%${req.query.search}%`);
      i++;
    }

    if (req.query.priority) {
      clauses.push(`priority = $${i++}`);
      params.push(req.query.priority);
    }

    if (req.query.status) {
      clauses.push(`status = $${i++}`);
      params.push(req.query.status);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    // Default to DESC (newest first); only switch to ASC on explicit "asc".
    const order = req.query.sort === 'asc' ? 'ASC' : 'DESC';

    const { rows } = await pool.query(
      `SELECT * FROM tickets ${where} ORDER BY created_at ${order}`,
      params
    );

    res.json(rows.map(withUrgency));
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/tickets/customer/:email ────────────────────────────────────────
// Initiative feature: Customer ticket history.
// Must be declared BEFORE /:id so Express doesn't match "customer" as an id.
// Returns all tickets for a given email address, newest first.
router.get('/customer/:email', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM tickets WHERE customer_email = $1 ORDER BY created_at DESC`,
      [req.params.email]
    );

    res.json(rows.map(withUrgency));
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/tickets/:id ────────────────────────────────────────────────────
// Returns a single ticket by ID, or 404 if not found.
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM tickets WHERE id = $1`,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    res.json(withUrgency(rows[0]));
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/tickets/:id ───────────────────────────────────────────────────
// General update — allows changing any editable field on the ticket.
// Re-validates the full ticket data to enforce consistency.
router.patch('/:id', async (req, res, next) => {
  try {
    // Fetch current ticket so we can merge with the partial update.
    const { rows: existing } = await pool.query(
      `SELECT * FROM tickets WHERE id = $1`,
      [req.params.id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Merge incoming fields over the current values, then validate the result.
    const merged = { ...existing[0], ...req.body };
    const errors = validateTicket(merged);
    if (Object.keys(errors).length) {
      return res.status(400).json({ errors });
    }

    const { customer_name, customer_email, subject, description, priority, status } = merged;

    const { rows } = await pool.query(
      `UPDATE tickets
       SET customer_name  = $1,
           customer_email = $2,
           subject        = $3,
           description    = $4,
           priority       = $5,
           status         = $6,
           updated_at     = now()
       WHERE id = $7
       RETURNING *`,
      [customer_name, customer_email, subject, description, priority, status, req.params.id]
    );

    res.json(withUrgency(rows[0]));
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/tickets/:id/status ───────────────────────────────────────────
// Status-only update. Intentionally narrow so callers can't accidentally
// overwrite other fields when they only intend to move the ticket along.
// updated_at is bumped here — it's an explicit requirement in the brief.
router.patch('/:id/status', async (req, res, next) => {
  try {
    const VALID_STATUSES = ['Open', 'In Progress', 'Resolved'];

    if (!VALID_STATUSES.includes(req.body.status)) {
      return res.status(400).json({ error: 'Status must be Open, In Progress, or Resolved' });
    }

    const { rows } = await pool.query(
      `UPDATE tickets
       SET status     = $1,
           updated_at = now()
       WHERE id = $2
       RETURNING *`,
      [req.body.status, req.params.id]
    );

    // RETURNING * with rows.length === 0 means the id didn't exist — return 404.
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    res.json(withUrgency(rows[0]));
  } catch (err) {
    next(err);
  }
});

export default router;
