// TicketList.jsx — paginated, searchable, filterable ticket table
// Fetches tickets on mount and re-fetches whenever search/filter/sort state changes.
// All filtering is server-side (query params) to stay consistent with the API contract.

import { useState, useEffect } from 'react';
import { getTickets } from '../api.js';

// Maps a priority string to its CSS badge class.
function priorityBadge(priority) {
  const map = { High: 'badge-high', Medium: 'badge-medium', Low: 'badge-low' };
  return map[priority] || 'badge-low';
}

// Maps a status string to its CSS badge class.
function statusBadge(status) {
  const map = { Open: 'badge-open', 'In Progress': 'badge-progress', Resolved: 'badge-resolved' };
  return map[status] || 'badge-open';
}

// Formats a timestamp as a locale date string without the time portion.
function formatDate(iso) {
  return new Date(iso).toLocaleDateString();
}

export default function TicketList({ onOpenTicket }) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Controlled filter state — each change triggers a fresh fetch.
  const [search, setSearch]     = useState('');
  const [priority, setPriority] = useState('');
  const [status, setStatus]     = useState('');
  const [sort, setSort]         = useState('desc');

  // Re-fetch whenever any filter value changes.
  // The dependency array ensures we don't over-fetch on unrelated re-renders.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
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
      <div className="page-header">
        <div>
          <h2 className="page-title">All Tickets</h2>
          {!loading && (
            <p className="page-subtitle">
              {tickets.length} ticket{tickets.length !== 1 ? 's' : ''}
              {(search || priority || status) ? ' matching filters' : ''}
            </p>
          )}
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className="filter-bar">
        <input
          className="filter-search"
          type="search"
          placeholder="Search name, email or subject…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="">All priorities</option>
          <option value="Low">Low</option>
          <option value="Medium">Medium</option>
          <option value="High">High</option>
        </select>

        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="Open">Open</option>
          <option value="In Progress">In Progress</option>
          <option value="Resolved">Resolved</option>
        </select>

        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="desc">Newest first</option>
          <option value="asc">Oldest first</option>
        </select>
      </div>

      {/* ── Error / loading states ── */}
      {error && <div className="alert alert-error">{error}</div>}
      {loading && <p className="loading-text">Loading tickets…</p>}

      {/* ── Ticket table ──
          Urgent tickets get .row-urgent which draws a red left border on
          the first cell — avoids a dedicated column while still being
          immediately visible when scanning the list. */}
      {!loading && !error && (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Customer</th>
                  <th>Subject</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {tickets.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="empty-state">
                        No tickets match the current filters.
                      </div>
                    </td>
                  </tr>
                ) : (
                  tickets.map((t) => (
                    <tr
                      key={t.id}
                      className={t.is_urgent ? 'row-urgent' : ''}
                      onClick={() => onOpenTicket(t.id)}
                    >
                      <td className="cell-id">#{t.id}</td>
                      <td className="cell-customer">
                        <strong>{t.customer_name}</strong>
                        <span>{t.customer_email}</span>
                      </td>
                      <td>{t.subject}</td>
                      <td>
                        <span className={`badge ${priorityBadge(t.priority)}`}>
                          {t.priority}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${statusBadge(t.status)}`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="cell-date">{formatDate(t.created_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
