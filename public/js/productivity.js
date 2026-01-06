const prodStatsEl = document.getElementById('prod-stats');
const prodListEl = document.getElementById('prod-list');

const renderStats = (tickets) => {
  if (!prodStatsEl) return;
  const open = tickets.filter((t) => t.status !== 'Resolved').length;
  const resolved = tickets.filter((t) => t.status === 'Resolved').length;
  const atRisk = tickets.filter((t) => t.sla?.status === 'At Risk').length;
  const breached = tickets.filter((t) => t.sla?.status === 'Breached').length;

  prodStatsEl.innerHTML = `
    <div class="stat-card"><div class="stat-value">${tickets.length}</div><div class="stat-label">Assigned</div></div>
    <div class="stat-card"><div class="stat-value">${open}</div><div class="stat-label">Open</div></div>
    <div class="stat-card"><div class="stat-value">${resolved}</div><div class="stat-label">Resolved</div></div>
    <div class="stat-card"><div class="stat-value">${breached || atRisk}</div><div class="stat-label">At Risk / Breached</div></div>
  `;
};

const renderList = (tickets) => {
  if (!prodListEl) return;
  if (!tickets.length) {
    prodListEl.innerHTML = '<p class="muted">No tickets assigned.</p>';
    return;
  }

  prodListEl.innerHTML = tickets
    .slice(0, 5)
    .map(
      (t) => `
      <div class="list-row">
        <div>
          <strong>${t.ticket_number}</strong>
          <div class="muted small">${t.title}</div>
          <div class="muted small">${t.status} • ${t.priority} • ${t.resolver_group || t.assigned_to || ''}</div>
        </div>
        <span class="badge">${t.sla?.status || 'SLA'}</span>
      </div>
    `
    )
    .join('');
};

(async () => {
  const user = await initHeader({ requireRole: window.location.pathname.startsWith('/user') ? 'user' : 'admin' });
  if (!user) return;

  const { tickets } = await api.fetchJSON('/api/tickets');
  let relevant;
  if (user.role === 'admin') {
    relevant = tickets.filter((t) => (t.assigned_to || '').toLowerCase().includes((user.name || '').toLowerCase()));
  } else {
    relevant = tickets;
  }

  renderStats(relevant);
  renderList(relevant);
})();
