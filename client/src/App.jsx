// App.jsx — top-level view router
// A minimal view-state machine replaces a full router library.
// With only four views (list, create, detail, dashboard) this is simpler,
// requires no extra package, and is easy to follow in an interview.

import { useState } from 'react';
import TicketList from './components/TicketList.jsx';
import TicketForm from './components/TicketForm.jsx';
import TicketDetail from './components/TicketDetail.jsx';
import Dashboard from './components/Dashboard.jsx';

// view: 'list' | 'create' | 'detail' | 'dashboard'
export default function App() {
  const [view, setView] = useState('list');
  // selectedId is only meaningful when view === 'detail'
  const [selectedId, setSelectedId] = useState(null);

  // Navigate to the detail view for a specific ticket.
  function openTicket(id) {
    setSelectedId(id);
    setView('detail');
  }

  // Determines which nav item should get the .active class.
  function isActive(navView) {
    if (navView === 'list') return view === 'list' || view === 'detail';
    return view === navView;
  }

  return (
    <div className="layout">

      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand-name">SupportDesk</div>
          <div className="sidebar-brand-sub">Customer Support</div>
        </div>

        <nav className="sidebar-nav">
          <span className="nav-section-label">Navigation</span>

          <button
            className={`nav-item ${isActive('list') ? 'active' : ''}`}
            onClick={() => setView('list')}
          >
            All Tickets
          </button>

          <button
            className={`nav-item ${isActive('create') ? 'active' : ''}`}
            onClick={() => setView('create')}
          >
            New Ticket
          </button>

          <button
            className={`nav-item ${isActive('dashboard') ? 'active' : ''}`}
            onClick={() => setView('dashboard')}
          >
            Dashboard
          </button>
        </nav>
      </aside>

      {/* ── Main content ── */}
      <main className="main-content">
        {view === 'list' && (
          <TicketList onOpenTicket={openTicket} />
        )}

        {view === 'create' && (
          <TicketForm
            onSuccess={(ticket) => {
              // After successful creation navigate straight to the new ticket.
              openTicket(ticket.id);
            }}
            onCancel={() => setView('list')}
          />
        )}

        {view === 'detail' && (
          <TicketDetail
            ticketId={selectedId}
            onBack={() => setView('list')}
            onOpenTicket={openTicket}
          />
        )}

        {view === 'dashboard' && <Dashboard />}
      </main>
    </div>
  );
}
