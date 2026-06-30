// validation.js — pure validation function, no side effects
// Returns an errors map so the frontend can label each field individually.
// An empty object means the input is valid.

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
