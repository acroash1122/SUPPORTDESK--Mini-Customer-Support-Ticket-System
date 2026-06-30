// db.js — single pg connection pool + schema initializer
// Using a Pool (not individual clients) so all route handlers share idle connections
// and we don't exhaust Postgres connection limits under concurrent requests.

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
