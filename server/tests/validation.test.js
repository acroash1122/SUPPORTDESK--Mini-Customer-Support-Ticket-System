// validation.test.js — unit tests for the validateTicket pure function
// Covers: missing required fields, invalid email, short description,
// invalid priority value, and a fully valid happy-path input.

import { describe, it, expect } from 'vitest';
import { validateTicket } from '../src/validation.js';

// A fully valid ticket used as the baseline for partial-mutation tests.
const VALID = {
  customer_name: 'Alice Smith',
  customer_email: 'alice@example.com',
  subject: 'Cannot log in',
  description: 'I have been unable to log in since yesterday morning.',
  priority: 'Medium',
};

describe('validateTicket', () => {
  // ── Happy path ─────────────────────────────────────────────────────────────

  it('returns an empty object for fully valid data', () => {
    expect(validateTicket(VALID)).toEqual({});
  });

  // ── Required field checks ──────────────────────────────────────────────────

  it('errors on missing customer_name', () => {
    const errors = validateTicket({ ...VALID, customer_name: '' });
    expect(errors.customer_name).toBeDefined();
  });

  it('errors on whitespace-only customer_name', () => {
    const errors = validateTicket({ ...VALID, customer_name: '   ' });
    expect(errors.customer_name).toBeDefined();
  });

  it('errors on missing customer_email', () => {
    const errors = validateTicket({ ...VALID, customer_email: '' });
    expect(errors.customer_email).toBeDefined();
  });

  it('errors on missing subject', () => {
    const errors = validateTicket({ ...VALID, subject: '' });
    expect(errors.subject).toBeDefined();
  });

  // ── Email format checks ────────────────────────────────────────────────────

  it('errors on email without @', () => {
    const errors = validateTicket({ ...VALID, customer_email: 'notanemail' });
    expect(errors.customer_email).toBeDefined();
  });

  it('errors on email without domain', () => {
    const errors = validateTicket({ ...VALID, customer_email: 'user@' });
    expect(errors.customer_email).toBeDefined();
  });

  it('accepts a valid email address', () => {
    const errors = validateTicket({ ...VALID, customer_email: 'user@domain.org' });
    expect(errors.customer_email).toBeUndefined();
  });

  // ── Description length checks ──────────────────────────────────────────────

  it('errors when description is fewer than 10 characters', () => {
    const errors = validateTicket({ ...VALID, description: 'short' });
    expect(errors.description).toBeDefined();
  });

  it('errors on missing description', () => {
    const errors = validateTicket({ ...VALID, description: undefined });
    expect(errors.description).toBeDefined();
  });

  it('accepts a description of exactly 10 characters', () => {
    const errors = validateTicket({ ...VALID, description: '1234567890' });
    expect(errors.description).toBeUndefined();
  });

  // ── Priority checks ────────────────────────────────────────────────────────

  it('errors on an invalid priority value', () => {
    const errors = validateTicket({ ...VALID, priority: 'Critical' });
    expect(errors.priority).toBeDefined();
  });

  it('errors on an empty priority', () => {
    const errors = validateTicket({ ...VALID, priority: '' });
    expect(errors.priority).toBeDefined();
  });

  it('accepts Low, Medium, and High as valid priorities', () => {
    expect(validateTicket({ ...VALID, priority: 'Low' })).toEqual({});
    expect(validateTicket({ ...VALID, priority: 'Medium' })).toEqual({});
    expect(validateTicket({ ...VALID, priority: 'High' })).toEqual({});
  });

  // ── Multiple simultaneous errors ───────────────────────────────────────────

  it('returns errors for every invalid field simultaneously', () => {
    const errors = validateTicket({
      customer_name: '',
      customer_email: 'bad',
      subject: '',
      description: 'short',
      priority: 'Ultra',
    });
    expect(Object.keys(errors)).toHaveLength(5);
  });
});
