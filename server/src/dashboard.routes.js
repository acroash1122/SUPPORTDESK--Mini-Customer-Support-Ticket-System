// dashboard.routes.js — GET /api/dashboard
// Aggregates stats the support team needs at a glance.

import { Router } from 'express';
import { pool } from './db.js';
import { isUrgent } from './urgency.js';

const router = Router();

// ─── GET /api/dashboard ──────────────────────────────────────────────────────
// Returns five numbers:
//   total       — all tickets
//   open        — tickets with status 'Open'
//   in_progress — tickets with status 'In Progress'
//   resolved    — tickets with status 'Resolved'
//   urgent      — tickets where isUrgent() returns true
//
// Status counts are computed in SQL (efficient, no extra round-trip).
// Urgent count must be computed in JS because urgency is a derived property
// (not stored in the DB). We only fetch the two columns isUrgent needs to
// keep the payload small.
router.get('/', async (req, res, next) => {
  try {
    // COUNT(*) in Postgres returns a bigint, which node-postgres deserialises
    // as a JS string. The ::int cast converts it to a JS number in one step.
    const { rows: [{ count: total }] } = await pool.query(
      `SELECT COUNT(*)::int AS count FROM tickets`
    );

    const { rows: byStatus } = await pool.query(
      `SELECT status, COUNT(*)::int AS count FROM tickets GROUP BY status`
    );

    // Fetch only the columns needed by isUrgent to minimise data transfer.
    const { rows: allTickets } = await pool.query(
      `SELECT priority, description FROM tickets`
    );
    const urgent = allTickets.filter(isUrgent).length;

    // Helper to safely look up a status count; defaults to 0 if no rows exist
    // for that status yet (e.g. a fresh DB with no Resolved tickets).
    const get = (s) => byStatus.find((r) => r.status === s)?.count ?? 0;

    res.json({
      total,
      open: get('Open'),
      in_progress: get('In Progress'),
      resolved: get('Resolved'),
      urgent,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
