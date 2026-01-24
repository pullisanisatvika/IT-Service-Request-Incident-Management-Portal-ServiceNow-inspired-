const prodStatsEl = document.getElementById('prod-stats');
const attentionEl = document.getElementById('attention');
const trendEl = document.getElementById('trend-cards');
const prodListEl = document.getElementById('prod-list');

const minutesBetween = (from, to) => Math.round((to - new Date(from).getTime()) / 60000);

const renderStats = (tickets) => {
  if (!prodStatsEl) return;
  const open = tickets.filter((t) => t.status !== 'Resolved');
  const nextSla = open
    .filter((t) => typeof t.sla?.minutes_remaining === 'number')
    .sort((a, b) => a.sla.minutes_remaining - b.sla.minutes_remaining)[0];
  const oldest = open
    .slice()
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0];
  const p1Pending = open.filter((t) => t.priority === 'P1').length;
  const escalations = open.filter((t) => t.sla?.status === 'Breached').length;

  const cards = [
    { label: 'Next SLA breach (mins)', value: nextSla ? nextSla.sla.minutes_remaining : '—' },
    { label: 'Oldest open', value: oldest ? `${minutesBetween(oldest.created_at, Date.now())}m` : '—' },
    { label: 'P1 pending', value: p1Pending || 0 },
    { label: 'Escalations today', value: escalations || 0 }
  ];

  prodStatsEl.innerHTML = cards
    .map(
      (c) => `
      <div class="stat-card${c.label.toLowerCase().includes('sla') && c.value !== '—' && c.value <= 30 ? ' alert' : ''}">
        <div class="stat-value">${c.value}</div>
        <div class="stat-label">${c.label}</div>
      </div>
    `
    )
    .join('');
};

const renderAttention = (tickets) => {
  if (!attentionEl) return;
  const now = Date.now();
  const atRisk = tickets.filter((t) => ['At Risk', 'Breached'].includes(t.sla?.status));
  const idle = tickets.filter((t) => t.status !== 'Resolved' && minutesBetween(t.updated_at || t.created_at, now) > 24 * 60);
  const p1Unacked = tickets.filter((t) => t.priority === 'P1' && t.status !== 'Resolved');
  const cards = [
    { title: 'SLA at risk', value: atRisk.length, hint: atRisk.length ? 'Within 30–60 mins or breached' : 'No SLA risk detected in last 24h' },
    { title: 'Idle > 24h', value: idle.length, hint: idle.length ? 'No movement in a day' : 'All tickets touched within 24h' },
    { title: 'P1 unacknowledged', value: p1Unacked.length, hint: p1Unacked.length ? 'Act now on P1s' : 'No P1s waiting' }
  ];

  attentionEl.innerHTML = cards
    .map(
      (c) => `
      <div class="attention-card">
        <strong>${c.title}</strong>
        <div class="stat-value">${c.value}</div>
        <div class="muted small">${c.hint}</div>
      </div>
    `
    )
    .join('');
};

const renderTrends = (tickets) => {
  if (!trendEl) return;
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toDateString();
  const resolvedToday = tickets.filter((t) => t.status === 'Resolved' && new Date(t.updated_at).toDateString() === today).length;
  const resolvedYesterday = tickets.filter((t) => t.status === 'Resolved' && new Date(t.updated_at).toDateString() === yesterday).length;

  const resolvedWeek = tickets.filter(
    (t) => t.status === 'Resolved' && new Date(t.updated_at).getTime() >= Date.now() - 7 * 24 * 60 * 60 * 1000
  );
  const mttr =
    resolvedWeek.length > 0
      ? Math.round(
          resolvedWeek.reduce((acc, t) => acc + Math.max(0, new Date(t.updated_at) - new Date(t.created_at)) / 3600000, 0) /
            resolvedWeek.length
        )
      : '—';
  const slaCompliance =
    resolvedWeek.length > 0
      ? Math.round(
          (resolvedWeek.filter((t) => t.sla?.status !== 'Breached' && t.sla?.status !== 'At Risk').length / resolvedWeek.length) * 100
        )
      : '—';
  const teamComplianceHint = slaCompliance === '—' ? 'Team avg unavailable' : `Your SLA vs team: ${slaCompliance}% vs ~85% target`;

  const cards = [
    { title: 'Resolved today', value: resolvedToday, hint: `Yesterday: ${resolvedYesterday}` },
    { title: 'Avg resolution (hrs, 7d)', value: mttr, hint: 'MTTR this week' },
    { title: 'SLA compliance (7d)', value: slaCompliance === '—' ? '—' : `${slaCompliance}%`, hint: teamComplianceHint }
  ];

  trendEl.innerHTML = cards
    .map(
      (c) => `
      <div class="attention-card">
        <strong>${c.title}</strong>
        <div class="stat-value">${c.value}</div>
        <div class="muted small">${c.hint}</div>
      </div>
    `
    )
    .join('');
};

const renderQueue = (tickets) => {
  if (!prodListEl) return;
  if (!tickets.length) {
    prodListEl.innerHTML =
      '<p class="muted">No tickets assigned — you are available for intake. <a href="/admin" class="inline-link">View unassigned tickets</a></p>';
    return;
  }

  const priorityScore = { P1: 1, P2: 2, P3: 3, P4: 4 };
  const slaScore = { Breached: 0, 'At Risk': 1, 'On Track': 2, 'Met/Resolved': 3 };

  const sorted = tickets
    .filter((t) => t.status !== 'Resolved')
    .sort((a, b) => {
      const pa = priorityScore[a.priority] || 5;
      const pb = priorityScore[b.priority] || 5;
      if (pa !== pb) return pa - pb;
      const sa = slaScore[a.sla?.status] ?? 9;
      const sb = slaScore[b.sla?.status] ?? 9;
      if (sa !== sb) return sa - sb;
      return new Date(a.created_at) - new Date(b.created_at);
    });

  prodListEl.innerHTML = sorted
    .map(
      (t) => `
      <div class="list-row">
        <div>
          <strong>${t.ticket_number}</strong>
          <div class="muted small">${t.title}</div>
          <div class="muted small">${t.priority} • ${t.status} • ${t.resolver_group || t.assigned_to || 'Unassigned'}</div>
        </div>
        <div style="text-align:right;">
          <div class="badge">${t.sla?.status || 'SLA'}</div>
          <div class="muted small">${Math.round(Math.max(0, (Date.now() - new Date(t.created_at)) / 3600000))}h open</div>
        </div>
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
    const name = (user.name || '').toLowerCase();
    relevant = tickets.filter((t) => (t.assigned_to || '').toLowerCase().includes(name));
  } else {
    relevant = tickets;
  }

  renderStats(relevant);
  renderAttention(relevant);
  renderTrends(relevant);
  renderQueue(relevant);
})();
