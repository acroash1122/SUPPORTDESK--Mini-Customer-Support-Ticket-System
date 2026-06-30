// TicketForm.jsx — create ticket form with per-field validation errors
// On submit it POSTs to the server. If the server returns 400 with an errors
// map, each message is displayed under its field so the agent knows exactly
// what to fix. On success it calls onSuccess with the new ticket object.

import { useState } from 'react';
import { createTicket } from '../api.js';

// Initial blank state kept outside the component so it's easy to reset.
const BLANK = {
  customer_name: '',
  customer_email: '',
  subject: '',
  description: '',
  priority: '',
};

export default function TicketForm({ onSuccess, onCancel }) {
  const [fields, setFields] = useState(BLANK);
  // fieldErrors comes from the server's validation response.
  const [fieldErrors, setFieldErrors] = useState({});
  // submitError is for network or unexpected errors.
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // duplicate notice returned when the customer already has tickets.
  const [duplicateInfo, setDuplicateInfo] = useState(null);

  function handleChange(e) {
    const { name, value } = e.target;
    setFields((prev) => ({ ...prev, [name]: value }));
    // Clear the error for this field as the user starts typing.
    if (fieldErrors[name]) {
      setFieldErrors((prev) => { const next = { ...prev }; delete next[name]; return next; });
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setFieldErrors({});
    setSubmitError('');
    setDuplicateInfo(null);

    try {
      const ticket = await createTicket(fields);

      // If the server flagged a returning customer, surface the info
      // but still navigate away — the ticket was created successfully.
      if (ticket.duplicate_customer) {
        setDuplicateInfo({
          email: fields.customer_email,
          count: ticket.previous_ticket_count,
        });
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

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">New Ticket</h2>
          <p className="page-subtitle">Fill in all required fields.</p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 680 }}>
        <div className="card-body">

          {/* Returning customer warning */}
          {duplicateInfo && (
            <div className="alert alert-warning">
              This customer ({duplicateInfo.email}) already has{' '}
              {duplicateInfo.count} previous ticket{duplicateInfo.count !== 1 ? 's' : ''} on file.
              Ticket created — redirecting…
            </div>
          )}

          {/* Network / unexpected errors */}
          {submitError && <div className="alert alert-error">{submitError}</div>}

          <form onSubmit={handleSubmit} noValidate>

            {/* Customer name and email side-by-side — they're short fields
                that naturally belong together and save vertical space. */}
            <div className="form-row">
              <div className="form-group" style={{ margin: 0 }}>
                <label htmlFor="customer_name">Customer Name *</label>
                <input
                  id="customer_name"
                  name="customer_name"
                  type="text"
                  value={fields.customer_name}
                  onChange={handleChange}
                  className={fieldErrors.customer_name ? 'invalid' : ''}
                  placeholder="Ahsan Shahid"
                />
                {fieldErrors.customer_name && (
                  <p className="field-error">{fieldErrors.customer_name}</p>
                )}
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label htmlFor="customer_email">Customer Email *</label>
                <input
                  id="customer_email"
                  name="customer_email"
                  type="email"
                  value={fields.customer_email}
                  onChange={handleChange}
                  className={fieldErrors.customer_email ? 'invalid' : ''}
                  placeholder="ahsan@gmail.com"
                />
                {fieldErrors.customer_email && (
                  <p className="field-error">{fieldErrors.customer_email}</p>
                )}
              </div>
            </div>

            {/* Subject */}
            <div className="form-group">
              <label htmlFor="subject">Subject *</label>
              <input
                id="subject"
                name="subject"
                type="text"
                value={fields.subject}
                onChange={handleChange}
                className={fieldErrors.subject ? 'invalid' : ''}
                placeholder="Brief summary of the issue"
              />
              {fieldErrors.subject && (
                <p className="field-error">{fieldErrors.subject}</p>
              )}
            </div>

            {/* Description */}
            <div className="form-group">
              <label htmlFor="description">Description * <span className="muted text-sm">(min 10 characters)</span></label>
              <textarea
                id="description"
                name="description"
                rows={5}
                value={fields.description}
                onChange={handleChange}
                className={fieldErrors.description ? 'invalid' : ''}
                placeholder="Describe the issue in detail"
              />
              {fieldErrors.description && (
                <p className="field-error">{fieldErrors.description}</p>
              )}
            </div>

            {/* Priority */}
            <div className="form-group">
              <label htmlFor="priority">Priority *</label>
              <select
                id="priority"
                name="priority"
                value={fields.priority}
                onChange={handleChange}
                className={fieldErrors.priority ? 'invalid' : ''}
              >
                <option value="">Select priority…</option>
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
              {fieldErrors.priority && (
                <p className="field-error">{fieldErrors.priority}</p>
              )}
            </div>

            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Submitting…' : 'Create Ticket'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={onCancel}>
                Cancel
              </button>
            </div>

          </form>
        </div>
      </div>
    </div>
  );
}
