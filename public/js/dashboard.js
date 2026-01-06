let statusChart;
let priorityChart;
let dailyChart;
let mttrPriorityChart;
let mttrResolverChart;
let categoryChart;
let assigneeChart;
let criticalChart;
let slaChart;
let sourceTickets = [];
let analyticsCache = {};
let currentRange = 'all';

const statsEl = document.getElementById('stats');
const recentEl = document.getElementById('recent-tickets');
const asTickets = (value) => (Array.isArray(value) ? value : value?.tickets ?? []);

const destroyCharts = () => {
  [statusChart, priorityChart, dailyChart, mttrPriorityChart, mttrResolverChart, categoryChart, assigneeChart, criticalChart, slaChart].forEach(
    (c) => c && c.destroy()
  );
};

const renderStats = (ticketsInput) => {
  const tickets = asTickets(ticketsInput);
  const total = tickets.length;
  const resolved = tickets.filter((t) => t.status === 'Resolved').length;
  const inProgress = tickets.filter((t) => t.status === 'In Progress').length;
  const breached = tickets.filter((t) => t.sla?.status === 'Breached').length;

  statsEl.innerHTML = `
    <div class="stat-card" data-filter="all"><div class="stat-value">${total}</div><div class="stat-label">Total Tickets</div></div>
    <div class="stat-card" data-filter="in-progress"><div class="stat-value">${inProgress}</div><div class="stat-label">In Progress</div></div>
    <div class="stat-card" data-filter="resolved"><div class="stat-value">${resolved}</div><div class="stat-label">Resolved</div></div>
    <div class="stat-card ${breached ? 'alert' : ''}" data-filter="breached"><div class="stat-value">${breached}</div><div class="stat-label">SLA Breached</div></div>
  `;
};

const renderRecent = (ticketsInput) => {
  const tickets = asTickets(ticketsInput);
  if (!tickets.length) {
    recentEl.innerHTML = '<p class="muted">No tickets for this range.</p>';
    return;
  }
  const items = tickets
    .slice(0, 5)
    .map(
      (t) => `
      <div class="recent-item">
        <div>
          <strong>${t.ticket_number}</strong> • ${t.title}
          <div class="muted small">${t.category} • ${t.priority} • ${t.status}</div>
        </div>
        <div class="action-icons">
          <button title="Assign" onclick="location.href='/admin'">Assign</button>
          <button title="Priority" onclick="location.href='/admin'">Priority</button>
          <button title="Comment" onclick="location.href='/admin'">Comment</button>
          <button title="Escalate" onclick="location.href='/admin'">Escalate</button>
        </div>
      </div>
    `
    )
    .join('');
  recentEl.innerHTML = items || '<p class="muted">No tickets yet.</p>';
};

const renderAttention = (ticketsInput) => {
  const tickets = asTickets(ticketsInput);
  const p1 = tickets.filter((t) => t.priority === 'P1' && t.status !== 'Resolved').length;
  const risk = tickets.filter((t) => t.sla?.minutes_remaining !== null && t.sla?.minutes_remaining <= 60 && t.status !== 'Resolved').length;
  const unassigned = tickets.filter((t) => !t.assigned_to || t.assigned_to === 'Unassigned').length;
  document.getElementById('attn-p1').textContent = p1;
  document.getElementById('attn-risk').textContent = risk;
  document.getElementById('attn-unassigned').textContent = unassigned;
};

const renderSlaHeat = (ticketsInput) => {
  const tickets = asTickets(ticketsInput);
  const container = document.getElementById('sla-heat');
  if (!container) return;
  if (!tickets.length) {
    container.innerHTML = '<p class="muted">No data available</p>';
    return;
  }
  const priorities = ['P1', 'P2', 'P3', 'P4'];
  container.innerHTML = priorities
    .map((p) => {
      const subset = tickets.filter((t) => t.priority === p);
      const total = subset.length || 1;
      const green = Math.round((subset.filter((t) => t.sla?.status === 'On Track').length / total) * 100);
      const amber = Math.round((subset.filter((t) => t.sla?.status === 'At Risk').length / total) * 100);
      const red = Math.round((subset.filter((t) => t.sla?.status === 'Breached').length / total) * 100);
      return `
        <div class="sla-bar">
          <div><strong>${p}</strong></div>
          <div class="bar-track"><div class="bar-fill" style="width:${green}%;background:#7cf29c"></div></div>
          <div class="bar-track"><div class="bar-fill" style="width:${amber}%;background:#ffd166"></div></div>
          <div class="bar-track"><div class="bar-fill" style="width:${red}%;background:#ff6b6b"></div></div>
        </div>
      `;
    })
    .join('');
};

const renderNarratives = (ticketsInput) => {
  const tickets = asTickets(ticketsInput);
  const el = document.getElementById('narratives');
  if (!el) return;
  if (!tickets.length) {
    el.innerHTML = '<div class="cardlet"><p class="muted">No data available</p></div>';
    return;
  }
  const p1 = tickets.filter((t) => t.priority === 'P1').length;
  const breached = tickets.filter((t) => t.sla?.status === 'Breached').length;
  const network = tickets.filter((t) => (t.category || '').toLowerCase() === 'network').length;
  const msgs = [
    `P1 incidents: ${p1} ${p1 ? '— act now' : ''}`,
    `SLA breaches: ${breached} ${breached ? 'need escalation' : 'stable'}`,
    `Top category: ${network ? 'Network' : 'Varied'}`
  ];
  el.innerHTML = msgs.map((m) => `<div class="cardlet"><p class="muted">${m}</p></div>`).join('');
};

const renderCharts = (data) => {
  if (typeof Chart === 'undefined') return;
  destroyCharts();

  const statusCtx = document.getElementById('statusChart');
  const priorityCtx = document.getElementById('priorityChart');
  const dailyCtx = document.getElementById('dailyChart');
  const mttrPriorityCtx = document.getElementById('mttrPriorityChart');
  const mttrResolverCtx = document.getElementById('mttrResolverChart');
  const categoryCtx = document.getElementById('categoryChart');
  const assigneeCtx = document.getElementById('assigneeChart');
  const criticalCtx = document.getElementById('criticalChart');
  const slaCtx = document.getElementById('slaChart');
  if (!statusCtx) return;
  const hasData =
    (data.statusCounts && data.statusCounts.some((s) => s.count)) ||
    (data.priorityCounts && data.priorityCounts.some((s) => s.count)) ||
    (data.dailyCreated && data.dailyCreated.some((s) => s.count));
  if (!hasData) {
    const chartsEl = document.querySelector('.charts');
    if (chartsEl) chartsEl.insertAdjacentHTML('beforeend', '<p class="muted">No chart data available</p>');
  }

  statusChart = new Chart(statusCtx, {
    type: 'doughnut',
    data: {
      labels: data.statusCounts?.map((s) => s.status) || [],
      datasets: [
        {
          data: data.statusCounts?.map((s) => s.count) || [],
          backgroundColor: ['#53d8fb', '#ffd166', '#ff6b6b', '#7cf29c', '#9ba3c2']
        }
      ]
    },
    options: { plugins: { legend: { position: 'bottom' } } }
  });

  priorityChart = new Chart(priorityCtx, {
    type: 'bar',
    data: {
      labels: data.priorityCounts?.map((p) => p.priority) || [],
      datasets: [
        {
          label: 'Tickets',
          data: data.priorityCounts?.map((p) => p.count) || [],
          backgroundColor: '#53d8fb'
        }
      ]
    },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
  });

  dailyChart = new Chart(dailyCtx, {
    type: 'line',
    data: {
      labels: data.dailyCreated?.map((d) => d.day) || [],
      datasets: [
        {
          label: 'Tickets',
          data: data.dailyCreated?.map((d) => d.count) || [],
          borderColor: '#7cf29c',
          backgroundColor: 'rgba(124, 242, 156, 0.2)',
          tension: 0.25,
          fill: true
        }
      ]
    },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
  });

  mttrPriorityChart = new Chart(mttrPriorityCtx, {
    type: 'bar',
    data: {
      labels: data.mttrByPriority?.map((p) => p.priority) || [],
      datasets: [
        {
          label: 'MTTR (hrs)',
          data: data.mttrByPriority?.map((p) => Number(p.mttr_hours || 0)) || [],
          backgroundColor: '#ffd166'
        }
      ]
    },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
  });

  mttrResolverChart = new Chart(mttrResolverCtx, {
    type: 'bar',
    data: {
      labels: data.mttrByResolver?.map((r) => r.resolver_group) || [],
      datasets: [
        {
          label: 'MTTR (hrs)',
          data: data.mttrByResolver?.map((r) => Number(r.mttr_hours || 0)) || [],
          backgroundColor: '#9ba3c2'
        }
      ]
    },
    options: {
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true } }
    }
  });

  categoryChart = new Chart(categoryCtx, {
    type: 'bar',
    data: {
      labels: data.topCategories?.map((c) => c.category) || [],
      datasets: [
        {
          label: 'Tickets',
          data: data.topCategories?.map((c) => c.count) || [],
          backgroundColor: '#3189ff'
        }
      ]
    },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
  });

  assigneeChart = new Chart(assigneeCtx, {
    type: 'bar',
    data: {
      labels: data.assigneeCounts?.map((a) => a.assigned_to) || [],
      datasets: [
        {
          label: 'Tickets',
          data: data.assigneeCounts?.map((a) => a.count) || [],
          backgroundColor: '#7cf29c'
        }
      ]
    },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
  });

  criticalChart = new Chart(criticalCtx, {
    type: 'doughnut',
    data: {
      labels: ['Non-critical', 'Business Critical'],
      datasets: [
        {
          data: [
            data.criticalCounts?.find((c) => c.critical == 0)?.count || 0,
            data.criticalCounts?.find((c) => c.critical == 1)?.count || 0
          ],
          backgroundColor: ['#9ba3c3', '#ff6b6b']
        }
      ]
    },
    options: { plugins: { legend: { position: 'bottom' } } }
  });

  const slaBuckets = { 'On Track': 0, 'At Risk': 0, Breached: 0, Resolved: 0 };
  (data._tickets || []).forEach((t) => {
    const status = t.sla?.status || 'On Track';
    if (status === 'Met/Resolved') slaBuckets['Resolved'] += 1;
    else if (slaBuckets[status] !== undefined) slaBuckets[status] += 1;
  });

  slaChart = new Chart(slaCtx, {
    type: 'doughnut',
    data: {
      labels: Object.keys(slaBuckets),
      datasets: [
        {
          data: Object.values(slaBuckets),
          backgroundColor: ['#7cf29c', '#ffd166', '#ff6b6b', '#53d8fb']
        }
      ]
    },
    options: { plugins: { legend: { position: 'bottom' } } }
  });
};

const applyTimeFilter = (range) => {
  currentRange = range;
  document.querySelectorAll('.time-filters button').forEach((btn) => btn.classList.toggle('active', btn.dataset.range === range));
  fetchAndRender(range);
};

const renderAnalytics = (data) => {
  analyticsCache = data;
};

const loadAnalytics = async () => {
  try {
    const data = await api.fetchJSON('/api/admin/analytics');
    renderAnalytics(data);
    return data;
  } catch (err) {
    const el = document.getElementById('analytics');
    if (el) el.innerHTML = `<p class="error">${err.message}</p>`;
    return {};
  }
};

async function fetchAndRender(range = currentRange || 'all') {
  try {
    const user = await initHeader({ requireRole: 'admin' });
    if (!user) return;
    const ticketsRes = await api.fetchJSON(`/api/tickets?date_range=${encodeURIComponent(range)}`);
    const tickets = asTickets(ticketsRes);
    sourceTickets = tickets;
    const analytics = await loadAnalytics();
    analytics._tickets = tickets;
    renderStats(tickets);
    renderRecent(tickets);
    renderAttention(tickets);
    renderSlaHeat(tickets);
    renderNarratives(tickets);
    renderCharts(analytics);
    const now = new Date();
    const refreshEl = document.getElementById('last-refresh');
    if (refreshEl) refreshEl.textContent = now.toLocaleString();
    document.querySelectorAll('.stat-card').forEach((card) =>
      card.addEventListener('click', () => {
        const filter = card.dataset.filter;
        let filtered = sourceTickets;
        if (filter === 'in-progress') filtered = sourceTickets.filter((t) => t.status === 'In Progress');
        if (filter === 'resolved') filtered = sourceTickets.filter((t) => t.status === 'Resolved');
        if (filter === 'breached') filtered = sourceTickets.filter((t) => t.sla?.status === 'Breached');
        renderRecent(filtered);
      })
    );
    document.querySelectorAll('.attention .stat-card').forEach((card) =>
      card.addEventListener('click', () => {
        const f = card.dataset.filter;
        if (f === 'p1') renderRecent(sourceTickets.filter((t) => t.priority === 'P1'));
        if (f === 'risk')
          renderRecent(sourceTickets.filter((t) => t.sla?.minutes_remaining !== null && t.sla?.minutes_remaining <= 60));
        if (f === 'unassigned')
          renderRecent(sourceTickets.filter((t) => !t.assigned_to || t.assigned_to === 'Unassigned'));
      })
    );
    document.querySelectorAll('.time-filters button').forEach((btn) => {
      btn.onclick = () => applyTimeFilter(btn.dataset.range);
    });
  } catch (err) {
    recentEl.innerHTML = `<p class="error">${err.message || 'Failed to load dashboard data'}</p>`;
  }
}

(async () => {
  await fetchAndRender(currentRange);
})();
