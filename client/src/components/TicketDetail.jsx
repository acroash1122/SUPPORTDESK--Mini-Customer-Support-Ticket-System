// TicketDetail.jsx — full ticket view with status updater and customer history
// Shows all fields including description, created/updated timestamps, and
// an urgent badge. The status dropdown PATCHes /status and re-renders in place.
// If the ticket was created with a duplicate email, a "View history" link
// appears linking to the customer's ticket history (initiative feature).

import { useState, useEffect } from 'react';
import { getTicket, updateTicketStatus, getCustomerTickets } from '../api.js';

function formatDateTime(iso) {
  return new Date(iso).toLocaleString();
}

function statusBadge(status) {
  const map = { Open: 'badge-open', 'In Progress': 'badge-progress', Resolved: 'badge-resolved' };
  return map[status] || 'badge-open';
}

function priorityBadge(priority) {
  const map = { High: 'badge-high', Medium: 'badge-medium', Low: 'badge-low' };
  return map[priority] || 'badge-low';
}

export default function TicketDetail({ ticketId, onBack, onOpenTicket }) {
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Status update state
  const [statusValue, setStatusValue] = useState('');
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [statusError, setStatusError] = useState('');

  // Customer history (initiative feature)
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Fetch the ticket on mount and whenever ticketId changes.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const data = await getTicket(ticketId);
        if (!cancelled) {
          setTicket(data);
          setStatusValue(data.status);
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Ticket not found.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [ticketId]);

  // Handles the status dropdown change: PATCHes the server and updates local state.
  async function handleStatusChange(newStatus) {
    setStatusUpdating(true);
    setStatusError('');
    try {
      const updated = await updateTicketStatus(ticketId, newStatus);
      setTicket(updated);
      setStatusValue(updated.status);
    } catch (err) {
      setStatusError(err.message || 'Failed to update status.');
      // Revert the dropdown to the current saved status.
      setStatusValue(ticket.status);
    } finally {
      setStatusUpdating(false);
    }
  }

  // Loads customer history for the initiative feature panel.
  async function toggleHistory() {
    if (showHistory) {
      setShowHistory(false);
      return;
    }
    setHistoryLoading(true);
    try {
      const tickets = await getCustomerTickets(ticket.customer_email);
      setHistory(tickets);
      setShowHistory(true);
    } catch (_) {
      setShowHistory(true); // show empty state rather than crashing
    } finally {
      setHistoryLoading(false);
    }
  }

  if (loading) return <p className="loading-text">Loading ticket…</p>;
  if (error)   return <div className="alert alert-error">{error}</div>;
  if (!ticket) return null;

  // History tickets excluding the currently-viewed one.
  const otherTickets = history.filter((t) => t.id !== ticket.id);

  return (
    <div>
      {/* Back button + title row */}
      <div className="page-header">
        <div className="flex-row">
          <button className="btn btn-ghost btn-sm" onClick={onBack}>← Back</button>
          <h2 className="page-title">Ticket #{ticket.id}</h2>
          {ticket.is_urgent && (
            <span className="badge badge-urgent">Urgent</span>
          )}
        </div>
      </div>

      <div className="card">

        {/* ── Core metadata grid ── */}
        <div className="card-body">
          <div className="detail-meta-grid">
            <div className="meta-field">
              <span className="meta-label">Customer</span>
              <span className="meta-value">{ticket.customer_name}</span>
            </div>
            <div className="meta-field">
              <span className="meta-label">Email</span>
              <span className="meta-value-muted">{ticket.customer_email}</span>
            </div>
            <div className="meta-field">
              <span className="meta-label">Priority</span>
              <span>
                <span className={`badge ${priorityBadge(ticket.priority)}`}>
                  {ticket.priority}
                </span>
              </span>
            </div>
            <div className="meta-field">
              <span className="meta-label">Status</span>
              <span>
                <span className={`badge ${statusBadge(ticket.status)}`}>
                  {ticket.status}
                </span>
              </span>
            </div>
            <div className="meta-field">
              <span className="meta-label">Created</span>
              <span className="meta-value-muted">{formatDateTime(ticket.created_at)}</span>
            </div>
            <div className="meta-field">
              <span className="meta-label">Last Updated</span>
              <span className="meta-value-muted">{formatDateTime(ticket.updated_at)}</span>
            </div>
          </div>
        </div>

        {/* Subject */}
        <div className="card-section">
          <p className="section-label">Subject</p>
          <p className="subject-text">{ticket.subject}</p>
        </div>

        {/* Description */}
        <div className="card-section">
          <p className="section-label">Description</p>
          <p className="description-text">{ticket.description}</p>
        </div>

        {/* ── Status update ──
            Intentionally a separate PATCH endpoint (/status) rather than
            a general update — prevents accidentally overwriting other fields. */}
        <div className="card-section">
          <p className="section-label">Update Status</p>
          <div className="status-row">
            <select
              className="status-select"
              value={statusValue}
              onChange={(e) => setStatusValue(e.target.value)}
              disabled={statusUpdating}
            >
              <option value="Open">Open</option>
              <option value="In Progress">In Progress</option>
              <option value="Resolved">Resolved</option>
            </select>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => handleStatusChange(statusValue)}
              disabled={statusUpdating || statusValue === ticket.status}
            >
              {statusUpdating ? 'Saving…' : 'Save'}
            </button>
          </div>
          {statusError && <p className="field-error" style={{ marginTop: 6 }}>{statusError}</p>}
        </div>

        {/* ── Initiative feature: Customer history ──
            The toggle fetches all tickets for this email and renders them
            inline so the agent can see prior context without leaving the view. */}
        <div className="card-section">
          <button
            className="link-btn"
            onClick={toggleHistory}
            disabled={historyLoading}
          >
            {historyLoading
              ? 'Loading history…'
              : showHistory
              ? 'Hide customer history'
              : `View all tickets for ${ticket.customer_email}`}
          </button>

          {showHistory && (
            <div style={{ marginTop: 14 }}>
              {otherTickets.length === 0 ? (
                <p className="muted text-sm">No other tickets found for this customer.</p>
              ) : (
                <>
                  <p className="muted text-sm" style={{ marginBottom: 10 }}>
                    {otherTickets.length} other ticket{otherTickets.length !== 1 ? 's' : ''} from this customer:
                  </p>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Subject</th>
                          <th>Status</th>
                          <th>Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {otherTickets.map((t) => (
                          <tr key={t.id} onClick={() => onOpenTicket(t.id)}>
                            <td className="cell-id">#{t.id}</td>
                            <td>{t.subject}</td>
                            <td>
                              <span className={`badge ${statusBadge(t.status)}`}>
                                {t.status}
                              </span>
                            </td>
                            <td className="cell-date">
                              {new Date(t.created_at).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
