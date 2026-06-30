// index.js — Express app bootstrap
// Sets up middleware, mounts routes, initialises the DB schema, then listens.

import express from 'express';
import cors from 'cors';
import 'dotenv/config';

import { initDb } from './db.js';
import ticketsRouter from './tickets.routes.js';
import dashboardRouter from './dashboard.routes.js';

const app = express();
const PORT = process.env.PORT || 4000;

// ─── Middleware ───────────────────────────────────────────────────────────────

// Allow requests from the Vite dev server (port 5173) during development.
app.use(cors());

// Parse JSON request bodies.
app.use(express.json());

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use('/api/tickets', ticketsRouter);
app.use('/api/dashboard', dashboardRouter);

// ─── 404 handler ──────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── Central error handler ────────────────────────────────────────────────────
// Must have four parameters so Express recognises it as an error handler.
// Logs the full error server-side but only returns a generic message to the
// client so internal details (SQL, stack traces) never leak.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Startup ──────────────────────────────────────────────────────────────────
// initDb() runs the CREATE TABLE IF NOT EXISTS DDL before any request can
// arrive, so the schema is always in place without a manual migration step.

async function start() {
  await initDb();
  app.listen(PORT, () => {
    console.log(`SupportDesk API running on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
