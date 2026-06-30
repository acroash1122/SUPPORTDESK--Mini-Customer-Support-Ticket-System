// api.js — thin fetch wrappers for every API endpoint
// All functions throw on non-2xx responses so components can catch and
// display errors without checking res.ok themselves.
// The base URL points at the Vite dev-server proxy (/api) in development
// and at the same origin in production.

const BASE = '/api';

// Throws an Error whose message is the server's error string (if JSON)
// or a generic fallback. This lets callers do: catch(err) => setError(err.message)
async function handleResponse(res) {
  if (res.ok) return res.json();
  // Read the body once; a Response body stream can only be consumed once.
  let body = null;
  try { body = await res.json(); } catch (_) { /* not JSON */ }
  const message = body?.error ?? (body ? JSON.stringify(body) : `HTTP ${res.status}`);
  const err = new Error(message);
  err.status = res.status;
  err.body = body;
  throw err;
}

// ─── Tickets ──────────────────────────────────────────────────────────────────

/**
 * Fetch list of tickets with optional filters.
 * @param {{ search?, priority?, status?, sort? }} params
 */
export async function getTickets(params = {}) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== '' && v !== undefined)
  ).toString();
  const res = await fetch(`${BASE}/tickets${qs ? `?${qs}` : ''}`);
  return handleResponse(res);
}

/** Fetch a single ticket by id. */
export async function getTicket(id) {
  const res = await fetch(`${BASE}/tickets/${id}`);
  return handleResponse(res);
}

/**
 * Create a new ticket.
 * @param {object} data - Ticket fields
 * @returns {object} Created ticket (may include duplicate_customer flag)
 */
export async function createTicket(data) {
  const res = await fetch(`${BASE}/tickets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  // For 400 validation errors, re-throw with the errors map attached
  // so TicketForm can label each field.
  if (res.status === 400) {
    const body = await res.json();
    const err = new Error('Validation failed');
    err.status = 400;
    err.errors = body.errors;
    throw err;
  }
  return handleResponse(res);
}

/**
 * Update ticket status only.
 * @param {number|string} id
 * @param {string} status - 'Open' | 'In Progress' | 'Resolved'
 */
export async function updateTicketStatus(id, status) {
  const res = await fetch(`${BASE}/tickets/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  return handleResponse(res);
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

/** Fetch dashboard statistics. */
export async function getDashboard() {
  const res = await fetch(`${BASE}/dashboard`);
  return handleResponse(res);
}

// ─── Customer history (initiative feature) ────────────────────────────────────

/**
 * Fetch all tickets for a given customer email.
 * @param {string} email
 */
export async function getCustomerTickets(email) {
  const res = await fetch(`${BASE}/tickets/customer/${encodeURIComponent(email)}`);
  return handleResponse(res);
}
