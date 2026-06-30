// urgency.test.js — unit tests for the isUrgent pure function
// These tests have zero DB or HTTP dependencies and run in milliseconds.
// They cover the two business rules: High priority flag and "urgent" keyword.

import { describe, it, expect } from 'vitest';
import { isUrgent } from '../src/urgency.js';

describe('isUrgent', () => {
  // ── Priority-based urgency ─────────────────────────────────────────────────

  it('flags High priority tickets regardless of description', () => {
    expect(isUrgent({ priority: 'High', description: 'routine question' })).toBe(true);
  });

  it('does not flag Medium priority without the word urgent', () => {
    expect(isUrgent({ priority: 'Medium', description: 'routine question' })).toBe(false);
  });

  it('does not flag Low priority without the word urgent', () => {
    expect(isUrgent({ priority: 'Low', description: 'general enquiry' })).toBe(false);
  });

  // ── Keyword-based urgency (case-insensitive) ────────────────────────────────

  it('flags description containing the exact word "urgent" (lowercase)', () => {
    expect(isUrgent({ priority: 'Low', description: 'this is urgent please help' })).toBe(true);
  });

  it('flags description containing "URGENT" (uppercase)', () => {
    expect(isUrgent({ priority: 'Low', description: 'URGENT: server is down' })).toBe(true);
  });

  it('flags description containing "Urgent" (mixed case)', () => {
    expect(isUrgent({ priority: 'Medium', description: 'Urgent issue with billing' })).toBe(true);
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────

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
