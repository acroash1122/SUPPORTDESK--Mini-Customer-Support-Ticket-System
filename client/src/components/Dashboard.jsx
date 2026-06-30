// Dashboard.jsx — five stats cards for at-a-glance support team overview
// Fetches from GET /api/dashboard which aggregates counts in SQL (faster than
// fetching all tickets and counting in JS).

import { useState, useEffect } from 'react';
import { getDashboard } from '../api.js';

// Individual stat card.
// The coloured top border is set via the CSS class; the number and label
// are left-aligned so the card reads top-to-bottom rather than as a centred
// hero graphic that dominates the layout.
function StatCard({ label, value, colorClass }) {
  return (
    <div className={`stat-card ${colorClass}`}>
      <div className="stat-number">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const data = await getDashboard();
        setStats(data);
      } catch (err) {
        setError('Failed to load dashboard data.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <p className="loading-text">Loading dashboard…</p>;
  if (error)   return <div className="alert alert-error">{error}</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">Dashboard</h2>
          <p className="page-subtitle">Live ticket counts across all statuses.</p>
        </div>
      </div>

      {/* Five stat cards — each top-border colour encodes meaning at a glance */}
      <div className="stats-row">
        <StatCard label="Total"       value={stats.total}       colorClass="stat-total" />
        <StatCard label="Open"        value={stats.open}        colorClass="stat-open" />
        <StatCard label="In Progress" value={stats.in_progress} colorClass="stat-progress" />
        <StatCard label="Resolved"    value={stats.resolved}    colorClass="stat-resolved" />
        <StatCard label="Urgent"      value={stats.urgent}      colorClass="stat-urgent" />
      </div>

      {/* Summary callout — only surfaces actionable info, not generic filler */}
      {(stats.open > 0 || stats.urgent > 0) && (
        <div className="alert alert-warning" style={{ maxWidth: 480 }}>
          {stats.open > 0 && (
            <span>
              <strong>{stats.open}</strong> ticket{stats.open !== 1 ? 's' : ''} awaiting response.
            </span>
          )}
          {stats.urgent > 0 && (
            <span style={{ marginLeft: stats.open > 0 ? 8 : 0 }}>
              <strong>{stats.urgent}</strong> marked urgent.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
