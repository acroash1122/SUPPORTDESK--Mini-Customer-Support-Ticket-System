// urgency.js — pure function, no DB or HTTP dependencies
// Urgency is *derived* from existing fields rather than stored as a column.
// This means there is one source of truth and it can never go stale if
// priority or description changes.

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
