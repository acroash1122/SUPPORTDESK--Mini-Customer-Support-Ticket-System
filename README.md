# SupportDesk — Codebase Documentation

A mini customer support ticket system.  
**Backend:** Node.js + Express + PostgreSQL &nbsp;|&nbsp; **Frontend:** React + Vite &nbsp;|&nbsp; **Tests:** Vitest

---

## Table of Contents

1. [Project Structure](#project-structure)
2. [Quick Start](#quick-start)
3. [Server Files](#server-files)
   - [index.js](#1-srcindexjs--app-entry-point)
   - [db.js](#2-srcdbjs--database-pool--schema)
   - [urgency.js](#3-srcurgencyjs--urgency-logic)
   - [validation.js](#4-srcvalidationjs--input-validation)
   - [tickets.routes.js](#5-srcticketsroutesjs--ticket-endpoints)
   - [dashboard.routes.js](#6-srcdashboardroutesjs--dashboard-endpoint)
4. [Test Files](#test-files)
   - [urgency.test.js](#7-testsurgencytestjs)
   - [validation.test.js](#8-testsvalidationtestjs)
5. [Client Files](#client-files)
   - [api.js](#9-srcapijs--fetch-wrappers)
   - [App.jsx](#10-srcappjsx--view-router--sidebar)
   - [TicketList.jsx](#11-srccomponentsticketlistjsx)
   - [TicketForm.jsx](#12-srccomponentsticketformjsx)
   - [TicketDetail.jsx](#13-srccomponentsticketdetailjsx)
   - [Dashboard.jsx](#14-srccomponentsdashboardjsx)
   - [index.css](#15-srcindexcss--design-tokens--styles)
6. [Database Schema](#database-schema)
7. [API Reference](#api-reference)

---

## Project Structure

```
SupportDesk/
├── README.md
├── server/
│   ├── package.json
│   ├── .env                    ← your local credentials (git-ignored)
│   ├── .env.example            ← committed template
│   ├── src/
│   │   ├── index.js            ← Express entry point
│   │   ├── db.js               ← pg Pool + schema init
│   │   ├── urgency.js          ← pure isUrgent() + withUrgency()
│   │   ├── validation.js       ← pure validateTicket()
│   │   ├── tickets.routes.js   ← /api/tickets endpoints
│   │   └── dashboard.routes.js ← /api/dashboard endpoint
│   └── tests/
│       ├── urgency.test.js
│       └── validation.test.js
└── client/
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        ├── api.js              ← fetch wrappers
        ├── App.jsx             ← view router + sidebar layout
        ├── index.css           ← design tokens + all styles
        └── components/
            ├── TicketList.jsx
            ├── TicketForm.jsx
            ├── TicketDetail.jsx
            └── Dashboard.jsx
```

---

## Quick Start

```bash
# 1. Create the database (once)
createdb supportdesk

# 2. Backend
cd server
cp .env.example .env        # then set your DATABASE_URL password
npm install
npm run dev                 # → http://localhost:4000

# 3. Frontend (separate terminal)
cd client
npm install
npm run dev                 # → http://localhost:5173

# 4. Tests (no database required)
cd server
npm test
```

`.env` format:
```
DATABASE_URL=postgres://postgres:YOUR_PASSWORD@localhost:5432/supportdesk
PORT=4000
```

> If your password contains special characters (e.g. `@`), URL-encode them:  
> `Ahsan@123` → `Ahsan%40123`

---

## Server Files

---

### 1. `src/index.js` — App Entry Point

**What it does:**  
Wires together all Express middleware, mounts the two routers, registers a 404 handler and a central error handler, then calls `initDb()` to guarantee the schema exists before accepting any HTTP request.

**Why `initDb()` runs before `app.listen()`:**  
If the server accepted requests while the table was still being created, the first few requests would crash with "relation does not exist". Running it first eliminates the race.

```js
import express from 'express';
import cors from 'cors';
import 'dotenv/config';

import { initDb } from './db.js';
import ticketsRouter from './tickets.routes.js';
import dashboardRouter from './dashboard.routes.js';

const app = express();
const PORT = process.env.PORT || 4000;

// Allow requests from the Vite dev server (port 5173) during development.
app.use(cors());

// Parse JSON request bodies.
app.use(express.json());

app.use('/api/tickets', ticketsRouter);
app.use('/api/dashboard', dashboardRouter);

// 404 for any route that didn't match above.
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Central error handler — must have four parameters so Express recognises it.
// Logs the full error server-side but returns a generic message to the client
// so internal details (SQL, stack traces) never leak.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

async function start() {
  await initDb();                  // schema first, then open the port
  app.listen(PORT, () => {
    console.log(`SupportDesk API running on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
```

---

### 2. `src/db.js` — Database Pool & Schema

**What it does:**  
Creates one shared `pg.Pool` for the entire process lifetime and exports `initDb()` which runs the `CREATE TABLE IF NOT EXISTS` DDL on startup.

**Why a Pool, not individual clients:**  
A pool keeps a fixed set of idle connections and lends them to concurrent requests. Opening a new client per request would exhaust Postgres connection limits under load and add TCP handshake overhead on every query.

**Why `TIMESTAMPTZ` not `TIMESTAMP`:**  
`TIMESTAMPTZ` stores UTC and converts on read, so the value stays correct if the server's timezone ever changes.

**Why `CHECK` constraints in the DB:**  
They are a second line of defence behind the application-layer validation. Even if a bug bypassed `validateTicket()`, the database would still reject an invalid priority or status.

```js
import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

// One pool for the entire process lifetime; imported by routes.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Creates the tickets table on first run if it doesn't already exist.
// Called once from index.js before app.listen so the schema is guaranteed
// to be present before any request is handled.
export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets (
      id             SERIAL PRIMARY KEY,
      customer_name  TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      subject        TEXT NOT NULL,
      description    TEXT NOT NULL,
      priority       TEXT NOT NULL CHECK (priority IN ('Low','Medium','High')),
      status         TEXT NOT NULL DEFAULT 'Open'
                     CHECK (status IN ('Open','In Progress','Resolved')),
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}
```

---

### 3. `src/urgency.js` — Urgency Logic

**What it does:**  
Exports two pure functions — `isUrgent()` which decides if a ticket is urgent, and `withUrgency()` which is a convenience wrapper that spreads the ticket object and appends the derived `is_urgent` flag.

**Why urgency is computed, not stored:**  
If `is_urgent` were a DB column, it could go stale whenever `priority` or `description` changed. Deriving it on every read means there is exactly one source of truth. The trade-off is a tiny CPU cost per row, which is negligible at this scale.

**Why the regex `/urgent/i` instead of `.includes('urgent')`:**  
`.includes()` is case-sensitive — it would miss "URGENT" or "Urgent". The `/i` flag on the regex handles all cases in one expression.

```js
/**
 * Returns true when a ticket should be flagged as urgent.
 * Rules:
 *   1. Priority is 'High', OR
 *   2. The description contains the word "urgent" (case-insensitive)
 *
 * Kept pure so it is trivial to unit-test and impossible to have a DB bug.
 */
export function isUrgent(ticket) {
  if (ticket.priority === 'High') return true;
  // /urgent/i covers "URGENT", "Urgent", "urgent", etc.
  return /urgent/i.test(ticket.description || '');
}

// Convenience wrapper: spreads the ticket and appends the derived flag.
// Used in route handlers so every response includes is_urgent without
// repeating the isUrgent call at every return site.
export function withUrgency(ticket) {
  return { ...ticket, is_urgent: isUrgent(ticket) };
}
```

---

### 4. `src/validation.js` — Input Validation

**What it does:**  
Exports `validateTicket()` which checks all five required fields and returns an `errors` object mapping field names to human-readable messages. An empty return object means the input is valid.

**Why return an errors object instead of throwing:**  
Throwing stops at the first error. Returning a map lets the server send back all errors in one response, so the frontend can label every invalid field simultaneously rather than forcing the user to fix them one at a time.

**Why a minimal regex for email, not a full RFC 5322 parser:**  
Full email validation is surprisingly complex and rarely necessary. This regex catches the common cases (missing `@`, missing domain, spaces) without producing false positives on valid unusual addresses.

```js
const PRIORITIES = ['Low', 'Medium', 'High'];

// Minimal email check: requires at least one non-whitespace/@ char on each
// side of @ and a dot somewhere after it. Avoids false positives without
// pulling in a full RFC 5322 parser.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates ticket creation/update data.
 * @param {object} data - Raw request body fields
 * @returns {object} errors - Map of field name → human-readable message.
 *                           Empty when all fields are valid.
 */
export function validateTicket(data) {
  const errors = {};

  if (!data.customer_name?.trim()) {
    errors.customer_name = 'Customer name is required';
  }

  if (!data.customer_email?.trim()) {
    errors.customer_email = 'Customer email is required';
  } else if (!EMAIL_RE.test(data.customer_email)) {
    errors.customer_email = 'Email format is invalid';
  }

  if (!data.subject?.trim()) {
    errors.subject = 'Subject is required';
  }

  // Minimum 10 chars ensures the description is actually useful for support staff.
  if (!data.description || data.description.trim().length < 10) {
    errors.description = 'Description must be at least 10 characters';
  }

  if (!PRIORITIES.includes(data.priority)) {
    errors.priority = 'Priority must be Low, Medium, or High';
  }

  return errors;
}
```

---

### 5. `src/tickets.routes.js` — Ticket Endpoints

**What it does:**  
Defines all six `/api/tickets` routes. Every handler is `async` and wraps DB work in `try/catch`, forwarding any error to the central error middleware via `next(err)`.

**Important routing note — `/customer/:email` before `/:id`:**  
Express matches routes in declaration order. If `/:id` were declared first, a request to `/api/tickets/customer/foo@bar.com` would treat `"customer"` as the ticket ID. The static segment `/customer/` must come before the dynamic `/:id`.

**Why `RETURNING *` on INSERT/UPDATE:**  
It returns the saved row in the same round-trip. Without it, a second `SELECT` would be needed to echo the saved data back to the client.

**Why `$1, $2` placeholders, never string concatenation:**  
Parameterized queries are the only defence against SQL injection. Concatenating user input directly into a query string would allow an attacker to run arbitrary SQL.

**Why `COUNT(*)::int`:**  
Postgres returns `COUNT(*)` as a `bigint`, which `node-postgres` deserializes as a JavaScript string (e.g. `"5"` not `5`). The `::int` cast converts it before it leaves the database.

```js
import { Router } from 'express';
import { pool } from './db.js';
import { validateTicket } from './validation.js';
import { isUrgent, withUrgency } from './urgency.js';

const router = Router();

// ── POST / — Create ticket ────────────────────────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
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
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [customer_name, customer_email, subject, description, priority]
    );

    // Include duplicate_customer flag so the frontend can show a non-blocking notice.
    res.status(201).json({
      ...withUrgency(rows[0]),
      duplicate_customer: previousCount > 0,
      previous_ticket_count: previousCount,
    });
  } catch (err) { next(err); }
});

// ── GET / — List with search / filter / sort ──────────────────────────────────
// ?search=   case-insensitive match across name, email, subject (ILIKE)
// ?priority= Low | Medium | High
// ?status=   Open | In Progress | Resolved
// ?sort=     asc | desc  (default desc)
router.get('/', async (req, res, next) => {
  try {
    const clauses = [];
    const params = [];
    let i = 1;

    if (req.query.search) {
      // Reusing $i across three columns avoids pushing three identical values.
      clauses.push(
        `(customer_name ILIKE $${i} OR customer_email ILIKE $${i} OR subject ILIKE $${i})`
      );
      params.push(`%${req.query.search}%`);
      i++;
    }
    if (req.query.priority) { clauses.push(`priority = $${i++}`); params.push(req.query.priority); }
    if (req.query.status)   { clauses.push(`status = $${i++}`);   params.push(req.query.status); }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const order = req.query.sort === 'asc' ? 'ASC' : 'DESC';

    const { rows } = await pool.query(
      `SELECT * FROM tickets ${where} ORDER BY created_at ${order}`, params
    );
    res.json(rows.map(withUrgency));
  } catch (err) { next(err); }
});

// ── GET /customer/:email — Customer ticket history (initiative feature) ────────
// Declared BEFORE /:id so Express doesn't match "customer" as a ticket id.
router.get('/customer/:email', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM tickets WHERE customer_email = $1 ORDER BY created_at DESC`,
      [req.params.email]
    );
    res.json(rows.map(withUrgency));
  } catch (err) { next(err); }
});

// ── GET /:id — Single ticket ──────────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM tickets WHERE id = $1`, [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Ticket not found' });
    res.json(withUrgency(rows[0]));
  } catch (err) { next(err); }
});

// ── PATCH /:id — General update ───────────────────────────────────────────────
router.patch('/:id', async (req, res, next) => {
  try {
    const { rows: existing } = await pool.query(
      `SELECT * FROM tickets WHERE id = $1`, [req.params.id]
    );
    if (existing.length === 0) return res.status(404).json({ error: 'Ticket not found' });

    // Merge incoming fields over the current values, then re-validate.
    const merged = { ...existing[0], ...req.body };
    const errors = validateTicket(merged);
    if (Object.keys(errors).length) return res.status(400).json({ errors });

    const { customer_name, customer_email, subject, description, priority, status } = merged;
    const { rows } = await pool.query(
      `UPDATE tickets SET customer_name=$1, customer_email=$2, subject=$3,
       description=$4, priority=$5, status=$6, updated_at=now()
       WHERE id=$7 RETURNING *`,
      [customer_name, customer_email, subject, description, priority, status, req.params.id]
    );
    res.json(withUrgency(rows[0]));
  } catch (err) { next(err); }
});

// ── PATCH /:id/status — Status-only update ────────────────────────────────────
// Intentionally narrow: callers can't accidentally overwrite other fields.
// updated_at is bumped here — explicit requirement.
router.patch('/:id/status', async (req, res, next) => {
  try {
    const VALID = ['Open', 'In Progress', 'Resolved'];
    if (!VALID.includes(req.body.status)) {
      return res.status(400).json({ error: 'Status must be Open, In Progress, or Resolved' });
    }

    const { rows } = await pool.query(
      `UPDATE tickets SET status=$1, updated_at=now() WHERE id=$2 RETURNING *`,
      [req.body.status, req.params.id]
    );

    // RETURNING * with rows.length === 0 means the id didn't exist — 404 not 500.
    if (rows.length === 0) return res.status(404).json({ error: 'Ticket not found' });
    res.json(withUrgency(rows[0]));
  } catch (err) { next(err); }
});

export default router;
```

---

### 6. `src/dashboard.routes.js` — Dashboard Endpoint

**What it does:**  
Serves `GET /api/dashboard` with five aggregate counts: total, open, in-progress, resolved, and urgent tickets.

**Why status counts are SQL but urgent count is JavaScript:**  
Status is stored in the database so `GROUP BY status` is efficient. Urgency is a derived property (not a column), so it must be evaluated in JavaScript using `isUrgent()`. Only the two columns `isUrgent()` needs (`priority`, `description`) are fetched to keep the query payload small.

```js
import { Router } from 'express';
import { pool } from './db.js';
import { isUrgent } from './urgency.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    // COUNT(*) in Postgres returns a bigint — ::int casts it to a JS number.
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
      open:        get('Open'),
      in_progress: get('In Progress'),
      resolved:    get('Resolved'),
      urgent,
    });
  } catch (err) { next(err); }
});

export default router;
```

---

## Test Files

---

### 7. `tests/urgency.test.js`

**What it does:**  
9 unit tests for `isUrgent()`. Zero database or HTTP dependencies — they run in under 5 ms. Covers High-priority flagging, case-insensitive keyword matching, and edge cases like `undefined` description.

```js
import { describe, it, expect } from 'vitest';
import { isUrgent } from '../src/urgency.js';

describe('isUrgent', () => {
  // ── Priority-based urgency ──────────────────────────────────────────────────

  it('flags High priority tickets regardless of description', () => {
    expect(isUrgent({ priority: 'High', description: 'routine question' })).toBe(true);
  });

  it('does not flag Medium priority without the word urgent', () => {
    expect(isUrgent({ priority: 'Medium', description: 'routine question' })).toBe(false);
  });

  // ── Keyword-based urgency (case-insensitive) ────────────────────────────────

  it('flags description containing "urgent" (lowercase)', () => {
    expect(isUrgent({ priority: 'Low', description: 'this is urgent please help' })).toBe(true);
  });

  it('flags description containing "URGENT" (uppercase)', () => {
    expect(isUrgent({ priority: 'Low', description: 'URGENT: server is down' })).toBe(true);
  });

  it('flags description containing "Urgent" (mixed case)', () => {
    expect(isUrgent({ priority: 'Medium', description: 'Urgent issue with billing' })).toBe(true);
  });

  // ── Edge cases ──────────────────────────────────────────────────────────────

  it('handles a missing description gracefully (no crash)', () => {
    expect(isUrgent({ priority: 'Low', description: undefined })).toBe(false);
  });

  it('handles an empty description', () => {
    expect(isUrgent({ priority: 'Low', description: '' })).toBe(false);
  });

  it('flags High priority even when description is empty', () => {
    expect(isUrgent({ priority: 'High', description: '' })).toBe(true);
  });
});
```

Run with:
```bash
cd server && npm test
```

---

### 8. `tests/validation.test.js`

**What it does:**  
15 unit tests for `validateTicket()`. Uses a `VALID` baseline object and mutates one field per test to confirm that each rule fires independently. Also includes a multi-error test that passes an entirely invalid object and expects all five errors to be returned at once.

```js
import { describe, it, expect } from 'vitest';
import { validateTicket } from '../src/validation.js';

// A fully valid ticket used as the baseline for partial-mutation tests.
const VALID = {
  customer_name:  'Alice Smith',
  customer_email: 'alice@example.com',
  subject:        'Cannot log in',
  description:    'I have been unable to log in since yesterday morning.',
  priority:       'Medium',
};

describe('validateTicket', () => {
  it('returns an empty object for fully valid data', () => {
    expect(validateTicket(VALID)).toEqual({});
  });

  it('errors on missing customer_name', () => {
    expect(validateTicket({ ...VALID, customer_name: '' }).customer_name).toBeDefined();
  });

  it('errors on whitespace-only customer_name', () => {
    expect(validateTicket({ ...VALID, customer_name: '   ' }).customer_name).toBeDefined();
  });

  it('errors on email without @', () => {
    expect(validateTicket({ ...VALID, customer_email: 'notanemail' }).customer_email).toBeDefined();
  });

  it('errors when description is fewer than 10 characters', () => {
    expect(validateTicket({ ...VALID, description: 'short' }).description).toBeDefined();
  });

  it('errors on an invalid priority value', () => {
    expect(validateTicket({ ...VALID, priority: 'Critical' }).priority).toBeDefined();
  });

  it('accepts Low, Medium, and High as valid priorities', () => {
    expect(validateTicket({ ...VALID, priority: 'Low' })).toEqual({});
    expect(validateTicket({ ...VALID, priority: 'Medium' })).toEqual({});
    expect(validateTicket({ ...VALID, priority: 'High' })).toEqual({});
  });

  it('returns errors for every invalid field simultaneously', () => {
    const errors = validateTicket({
      customer_name: '', customer_email: 'bad',
      subject: '', description: 'short', priority: 'Ultra',
    });
    expect(Object.keys(errors)).toHaveLength(5);
  });
});
```

---

## Client Files

---

### 9. `src/api.js` — Fetch Wrappers

**What it does:**  
Thin wrappers around the native `fetch` API for the six endpoints the UI actually calls. All functions throw a typed `Error` on non-2xx responses so React components can simply `catch(err)` and call `setError(err.message)` without inspecting the status code themselves.

**Exported functions:**

| Function | Method | Endpoint | Used by |
|---|---|---|---|
| `getTickets(params)` | GET | `/api/tickets` | `TicketList` |
| `getTicket(id)` | GET | `/api/tickets/:id` | `TicketDetail` |
| `createTicket(data)` | POST | `/api/tickets` | `TicketForm` |
| `updateTicketStatus(id, status)` | PATCH | `/api/tickets/:id/status` | `TicketDetail` |
| `getDashboard()` | GET | `/api/dashboard` | `Dashboard` |
| `getCustomerTickets(email)` | GET | `/api/tickets/customer/:email` | `TicketDetail` |

> The server also exposes `PATCH /api/tickets/:id` (general field update) as a spec requirement, but no client component calls it so no wrapper exists in this file.

**Why `handleResponse` reads the body only once:**  
A `Response` body is a readable stream that can only be consumed once. Reading it twice would throw on the second read. The body is stored in a variable after the first `await res.json()` and reused from there.

**Why `createTicket` has special 400 handling:**  
A 400 from the create endpoint always means a validation errors map (`{ errors: { field: message } }`). The component needs that map to label individual fields, so it's attached to the thrown error as `err.errors` rather than being stringified into the message.

```js
const BASE = '/api';

// Throws an Error whose message is the server's error string.
// The body is read once and stored — a Response stream can't be consumed twice.
async function handleResponse(res) {
  if (res.ok) return res.json();
  let body = null;
  try { body = await res.json(); } catch (_) { /* not JSON */ }
  const message = body?.error ?? (body ? JSON.stringify(body) : `HTTP ${res.status}`);
  const err = new Error(message);
  err.status = res.status;
  err.body = body;
  throw err;
}

// GET /api/tickets  — supports search, priority, status, sort query params.
export async function getTickets(params = {}) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== '' && v !== undefined)
  ).toString();
  const res = await fetch(`${BASE}/tickets${qs ? `?${qs}` : ''}`);
  return handleResponse(res);
}

// GET /api/tickets/:id
export async function getTicket(id) {
  const res = await fetch(`${BASE}/tickets/${id}`);
  return handleResponse(res);
}

// POST /api/tickets — attaches err.errors on 400 so the form can label fields.
export async function createTicket(data) {
  const res = await fetch(`${BASE}/tickets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (res.status === 400) {
    const body = await res.json();
    const err = new Error('Validation failed');
    err.status = 400;
    err.errors = body.errors;
    throw err;
  }
  return handleResponse(res);
}

// PATCH /api/tickets/:id/status
export async function updateTicketStatus(id, status) {
  const res = await fetch(`${BASE}/tickets/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  return handleResponse(res);
}

// GET /api/dashboard
export async function getDashboard() {
  const res = await fetch(`${BASE}/dashboard`);
  return handleResponse(res);
}

// GET /api/tickets/customer/:email  (initiative feature)
export async function getCustomerTickets(email) {
  const res = await fetch(`${BASE}/tickets/customer/${encodeURIComponent(email)}`);
  return handleResponse(res);
}
```

---

### 10. `src/App.jsx` — View Router & Sidebar

**What it does:**  
Top-level component. Manages a `view` state string (`'list' | 'create' | 'detail' | 'dashboard'`) and a `selectedId` for the detail view. Renders a sticky left sidebar for navigation and conditionally renders the correct view component in the main content pane.

**Why no React Router:**  
With only four views and no URL-based deep-linking required, a `useState` switch is simpler, has zero dependencies, and is easy to explain. Every view transition is a single `setView()` call.

```jsx
import { useState } from 'react';
import TicketList   from './components/TicketList.jsx';
import TicketForm   from './components/TicketForm.jsx';
import TicketDetail from './components/TicketDetail.jsx';
import Dashboard    from './components/Dashboard.jsx';

// view: 'list' | 'create' | 'detail' | 'dashboard'
export default function App() {
  const [view, setView]         = useState('list');
  // selectedId is only meaningful when view === 'detail'
  const [selectedId, setSelectedId] = useState(null);

  function openTicket(id) {
    setSelectedId(id);
    setView('detail');
  }

  // Determines which nav item should get the .active class.
  function isActive(navView) {
    if (navView === 'list') return view === 'list' || view === 'detail';
    return view === navView;
  }

  return (
    <div className="layout">

      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand-name">SupportDesk</div>
          <div className="sidebar-brand-sub">Customer Support</div>
        </div>
        <nav className="sidebar-nav">
          <span className="nav-section-label">Navigation</span>
          <button className={`nav-item ${isActive('list')      ? 'active' : ''}`} onClick={() => setView('list')}>All Tickets</button>
          <button className={`nav-item ${isActive('create')    ? 'active' : ''}`} onClick={() => setView('create')}>New Ticket</button>
          <button className={`nav-item ${isActive('dashboard') ? 'active' : ''}`} onClick={() => setView('dashboard')}>Dashboard</button>
        </nav>
      </aside>

      <main className="main-content">
        {view === 'list'      && <TicketList onOpenTicket={openTicket} />}
        {view === 'create'    && <TicketForm onSuccess={(t) => openTicket(t.id)} onCancel={() => setView('list')} />}
        {view === 'detail'    && <TicketDetail ticketId={selectedId} onBack={() => setView('list')} onOpenTicket={openTicket} />}
        {view === 'dashboard' && <Dashboard />}
      </main>

    </div>
  );
}
```

---

### 11. `src/components/TicketList.jsx`

**What it does:**  
Fetches and displays all tickets in a table. Search, priority filter, status filter, and sort are all controlled state values; every change re-runs the `useEffect` which calls `GET /api/tickets` with the updated query params — all filtering is server-side.

**Why a `cancelled` flag in `useEffect`:**  
If the user types quickly, multiple fetches may be in-flight simultaneously. Without the flag, an older, slower response could arrive after a newer one and overwrite the correct state. The flag prevents any state update after the effect has been cleaned up (i.e. after a dependency changed).

**Why no separate "Urgent" column:**  
Instead, urgent rows get the CSS class `row-urgent`, which applies a red left border to the first cell. This keeps the table at 6 columns (not 7) and makes urgency visible without adding cognitive load to every row.

```jsx
import { useState, useEffect } from 'react';
import { getTickets } from '../api.js';

function priorityBadge(priority) {
  return { High: 'badge-high', Medium: 'badge-medium', Low: 'badge-low' }[priority] || 'badge-low';
}

function statusBadge(status) {
  return { Open: 'badge-open', 'In Progress': 'badge-progress', Resolved: 'badge-resolved' }[status] || 'badge-open';
}

export default function TicketList({ onOpenTicket }) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [search,   setSearch]   = useState('');
  const [priority, setPriority] = useState('');
  const [status,   setStatus]   = useState('');
  const [sort,     setSort]     = useState('desc');

  // Re-fetch whenever any filter value changes.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true); setError('');
      try {
        const data = await getTickets({ search, priority, status, sort });
        if (!cancelled) setTickets(data);
      } catch (err) {
        if (!cancelled) setError('Failed to load tickets. Is the server running?');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    // Cleanup flag prevents state updates on unmounted component.
    return () => { cancelled = true; };
  }, [search, priority, status, sort]);

  return (
    <div>
      {/* filter bar, table, empty state … */}
    </div>
  );
}
```

---

### 12. `src/components/TicketForm.jsx`

**What it does:**  
A controlled form that POSTs to `POST /api/tickets`. On a `400` response, the per-field `errors` map from the server is applied directly to `fieldErrors` state so each input shows its own message beneath it. On success, navigates to the new ticket's detail view. If the server returns `duplicate_customer: true`, a warning notice is shown for 2 seconds before navigating.

**Why errors are cleared per-field on `handleChange`:**  
Once the user starts correcting a field, showing the stale error for that specific field while they type is confusing. Clearing only the field being edited (not all errors) means other fields' error messages stay visible.

**Why name + email share a 2-column grid (`form-row`):**  
They are short related fields. Stacking them vertically wastes space and makes the form feel longer than it is.

```jsx
import { useState } from 'react';
import { createTicket } from '../api.js';

const BLANK = { customer_name: '', customer_email: '', subject: '', description: '', priority: '' };

export default function TicketForm({ onSuccess, onCancel }) {
  const [fields,       setFields]       = useState(BLANK);
  // fieldErrors comes from the server's validation response.
  const [fieldErrors,  setFieldErrors]  = useState({});
  // submitError is for network or unexpected errors.
  const [submitError,  setSubmitError]  = useState('');
  const [submitting,   setSubmitting]   = useState(false);
  // duplicate notice returned when the customer already has tickets.
  const [duplicateInfo, setDuplicateInfo] = useState(null);

  function handleChange(e) {
    const { name, value } = e.target;
    setFields(prev => ({ ...prev, [name]: value }));
    // Clear the error for this field as the user starts typing.
    if (fieldErrors[name]) {
      setFieldErrors(prev => { const next = { ...prev }; delete next[name]; return next; });
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true); setFieldErrors({}); setSubmitError(''); setDuplicateInfo(null);
    try {
      const ticket = await createTicket(fields);
      if (ticket.duplicate_customer) {
        setDuplicateInfo({ email: fields.customer_email, count: ticket.previous_ticket_count });
        // Small delay so the user can read the notice before navigating.
        setTimeout(() => onSuccess(ticket), 2000);
      } else {
        onSuccess(ticket);
      }
    } catch (err) {
      if (err.status === 400 && err.errors) {
        // Per-field errors from the server's validateTicket response.
        setFieldErrors(err.errors);
      } else {
        setSubmitError(err.message || 'Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  // JSX: name + email in a .form-row (2-column grid), then subject,
  // description, priority, and form-actions buttons.
}
```

---

### 13. `src/components/TicketDetail.jsx`

**What it does:**  
Loads a single ticket by ID, displays all its fields in a structured card, provides a status dropdown that PATCHes `/status` in-place, and includes the customer ticket history panel (initiative feature).

**Why status updates use `PATCH /:id/status` not `PATCH /:id`:**  
The narrow endpoint prevents accidentally overwriting other fields. A general PATCH requires merging the full current state before sending; the status endpoint only needs one value.

**Why `toggleHistory` keeps the panel visible even on error:**  
Setting `setShowHistory(true)` in the catch block means the panel opens with an empty state rather than crashing or showing nothing. Users see "No other tickets found" instead of a broken UI.

**`updated_at` is always displayed:**  
It's an explicit requirement that status changes bump `updated_at`. Showing the value confirms to agents that the timestamp is being maintained.

```jsx
import { useState, useEffect } from 'react';
import { getTicket, updateTicketStatus, getCustomerTickets } from '../api.js';

export default function TicketDetail({ ticketId, onBack, onOpenTicket }) {
  const [ticket,         setTicket]         = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState('');
  // Status update state
  const [statusValue,    setStatusValue]    = useState('');
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [statusError,    setStatusError]    = useState('');
  // Customer history (initiative feature)
  const [showHistory,    setShowHistory]    = useState(false);
  const [history,        setHistory]        = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Fetch the ticket on mount and whenever ticketId changes.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true); setError('');
      try {
        const data = await getTicket(ticketId);
        if (!cancelled) { setTicket(data); setStatusValue(data.status); }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Ticket not found.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [ticketId]);

  // Handles the status dropdown: PATCHes the server and updates local state.
  async function handleStatusChange(newStatus) {
    setStatusUpdating(true); setStatusError('');
    try {
      const updated = await updateTicketStatus(ticketId, newStatus);
      setTicket(updated); setStatusValue(updated.status);
    } catch (err) {
      setStatusError(err.message || 'Failed to update status.');
      // Revert the dropdown to the current saved status.
      setStatusValue(ticket.status);
    } finally { setStatusUpdating(false); }
  }

  // Loads customer history for the initiative feature panel.
  async function toggleHistory() {
    if (showHistory) { setShowHistory(false); return; }
    setHistoryLoading(true);
    try {
      const tickets = await getCustomerTickets(ticket.customer_email);
      setHistory(tickets); setShowHistory(true);
    } catch (_) {
      setShowHistory(true); // show empty state rather than crashing
    } finally { setHistoryLoading(false); }
  }

  // History tickets excluding the currently-viewed one.
  const otherTickets = history.filter(t => t.id !== ticket?.id);

  // JSX: card with card-section blocks for meta, subject, description,
  // status update row, and customer history toggle panel.
}
```

---

### 14. `src/components/Dashboard.jsx`

**What it does:**  
Fetches `GET /api/dashboard` on mount and renders five stat cards — Total, Open, In Progress, Resolved, and Urgent. Each card has a coloured top border that encodes its meaning at a glance. A summary notice appears below if there are open or urgent tickets.

**Why the urgent count is in JavaScript on the server, not SQL:**  
Urgency is a derived property computed by `isUrgent()` — it has no corresponding column in the database. The server fetches `priority` and `description` for all tickets and filters in JS. This is accurate but does not scale to millions of rows (a known trade-off, listed in the README).

```jsx
import { useState, useEffect } from 'react';
import { getDashboard } from '../api.js';

// Individual stat card — left-aligned number + label, coloured top border.
function StatCard({ label, value, colorClass }) {
  return (
    <div className={`stat-card ${colorClass}`}>
      <div className="stat-number">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export default function Dashboard() {
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    async function load() {
      try       { setStats(await getDashboard()); }
      catch     { setError('Failed to load dashboard data.'); }
      finally   { setLoading(false); }
    }
    load();
  }, []);

  if (loading) return <p className="loading-text">Loading dashboard…</p>;
  if (error)   return <div className="alert alert-error">{error}</div>;

  return (
    <div>
      <div className="stats-row">
        <StatCard label="Total"       value={stats.total}       colorClass="stat-total" />
        <StatCard label="Open"        value={stats.open}        colorClass="stat-open" />
        <StatCard label="In Progress" value={stats.in_progress} colorClass="stat-progress" />
        <StatCard label="Resolved"    value={stats.resolved}    colorClass="stat-resolved" />
        <StatCard label="Urgent"      value={stats.urgent}      colorClass="stat-urgent" />
      </div>
      {/* Warning notice — only shown when there is something actionable */}
    </div>
  );
}
```

---

### 15. `src/index.css` — Design Tokens & Styles

**What it does:**  
Single stylesheet for the entire frontend. Uses CSS custom properties (`--ink`, `--accent`, `--border`, etc.) as a design token system — changing a token here propagates to every component that uses it.

**Key decisions:**

| Decision | Reason |
|---|---|
| CSS variables in `:root` | Single source of truth; no repetition of hex values |
| `border-radius: 4px` on badges (not `20px`) | Chips suit data tables; pills are visually dominant |
| Card borders, no box-shadow | Borders are crisper at small sizes and more precise |
| `row-urgent` left border on table rows | Conveys urgency without a dedicated column |
| Top-colored stat cards (`border-top: 3px solid`) | Encodes meaning via colour; left-aligned numbers are easier to scan than centred hero numbers |
| `-apple-system, BlinkMacSystemFont, 'Segoe UI'` font stack | Uses the OS's native UI font on every platform — no font download |

```css
:root {
  --ink:          #111827;   /* primary text */
  --ink-2:        #374151;   /* secondary text */
  --muted:        #6b7280;   /* tertiary / labels */
  --surface:      #ffffff;
  --ground:       #f9fafb;   /* page background */
  --border:       #e5e7eb;
  --accent:       #2563eb;
  --accent-bg:    #eff6ff;
  --accent-hover: #1d4ed8;
  --red:          #dc2626;
  --red-bg:       #fef2f2;
  --amber:        #b45309;
  --green:        #166534;
  --purple:       #6d28d9;
  --radius-sm:    4px;
  --radius:       6px;
  --radius-lg:    8px;
}

/* Sidebar layout: 220px fixed sidebar + fluid main content */
.layout {
  display: grid;
  grid-template-columns: 220px 1fr;
  min-height: 100vh;
}

/* Active nav item: left border accent + tinted background */
.nav-item.active {
  color: var(--accent);
  background: var(--accent-bg);
  border-left-color: var(--accent);
  font-weight: 600;
}

/* Urgent table rows: red left border on the first cell */
tbody tr.row-urgent td:first-child {
  border-left: 3px solid var(--red);
  padding-left: 11px;
}

/* Stat card colour per type — set via class, not inline style */
.stat-total    { --stat-accent: var(--accent); }
.stat-open     { --stat-accent: #f59e0b; }
.stat-progress { --stat-accent: var(--purple); }
.stat-resolved { --stat-accent: #16a34a; }
.stat-urgent   { --stat-accent: var(--red); }
```

---

## Database Schema

```sql
CREATE TABLE IF NOT EXISTS tickets (
  id             SERIAL PRIMARY KEY,
  customer_name  TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  subject        TEXT NOT NULL,
  description    TEXT NOT NULL,
  priority       TEXT NOT NULL CHECK (priority IN ('Low','Medium','High')),
  status         TEXT NOT NULL DEFAULT 'Open'
                 CHECK (status IN ('Open','In Progress','Resolved')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`is_urgent` is intentionally absent from the schema. It is a derived value computed on every read by `isUrgent()` and appended to the response JSON. Storing it would create a second source of truth that could go stale.

---

## API Reference

| Method | Path | Body / Params | Success | Error | Client wrapper |
|---|---|---|---|---|---|
| `POST` | `/api/tickets` | JSON ticket fields | `201` + ticket | `400 { errors }` | `createTicket()` |
| `GET` | `/api/tickets` | `?search` `?priority` `?status` `?sort` | `200` + array | `500` | `getTickets()` |
| `GET` | `/api/tickets/:id` | — | `200` + ticket | `404` | `getTicket()` |
| `PATCH` | `/api/tickets/:id` | JSON partial fields | `200` + ticket | `400 / 404` | — (server only) |
| `PATCH` | `/api/tickets/:id/status` | `{ status }` | `200` + ticket | `400 / 404` | `updateTicketStatus()` |
| `GET` | `/api/dashboard` | — | `200` + stats object | `500` | `getDashboard()` |
| `GET` | `/api/tickets/customer/:email` | — | `200` + array | `500` | `getCustomerTickets()` |

`PATCH /api/tickets/:id` is implemented on the server as a spec requirement but has no client-side wrapper — no UI component calls it.

Every ticket response includes `is_urgent: boolean` computed at read time.

Dashboard response shape:
```json
{
  "total": 12,
  "open": 5,
  "in_progress": 3,
  "resolved": 4,
  "urgent": 2
}
```
