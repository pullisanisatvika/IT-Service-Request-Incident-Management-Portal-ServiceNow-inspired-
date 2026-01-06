const state = {
  tickets: [],
  selectedId: null,
  selectedSet: new Set(),
  filters: {
    q: '',
    status: '',
    priority: '',
    category: '',
    assigned_to: '',
    unassigned: '',
    sla: '',
    critical: '',
    sort: 'created_desc',
    date_range: 'all'
  }
};

const assignees = ['Unassigned', 'Alice Johnson', 'Bob Smith', 'Charlie Nguyen', 'Dana Patel', 'Evan Lee', 'Service Desk'];
const categories = ['Network', 'Accounts', 'Hardware', 'Software', 'General'];
const priorities = ['P1', 'P2', 'P3', 'P4'];
const statuses = ['New', 'In Progress', 'Resolved'];

const queueEl = document.getElementById('ticket-queue');
const queueEmptyEl = document.getElementById('queue-empty');
const detailsEmptyEl = document.getElementById('details-empty');
const detailsContentEl = document.getElementById('details-content');
const bulkCountEl = document.getElementById('bulk-count');

const renderSlaPill = (sla) => {
  if (!sla) return '<span class="pill">--</span>';
  if (sla.status === 'Breached') return `<span class="pill sla-red">Breached</span>`;
  if (sla.status === 'At Risk') return `<span class="pill sla-amber">At Risk (${sla.minutes_remaining}m)</span>`;
  if (sla.status === 'On Track') return `<span class="pill sla-green">On Track (${sla.minutes_remaining}m)</span>`;
  if (sla.status === 'Met/Resolved') return `<span class="pill sla-green">Resolved</span>`;
  return `<span class="pill">${sla.status}</span>`;
};

const priorityClass = (p) => ({
  P1: 'pill-red',
  P2: 'pill-amber',
  P3: 'pill-blue',
  P4: 'pill-muted'
}[p] || 'pill-muted');

const slaHeatClass = (status) => {
  if (status === 'Breached') return 'heat-breach';
  if (status === 'At Risk') return 'heat-warn';
  if (status === 'On Track') return 'heat-ok';
  return '';
};

const asTickets = (value) => (Array.isArray(value) ? value : value?.tickets ?? []);

const buildParams = () => {
  const params = new URLSearchParams();
  Object.entries(state.filters).forEach(([k, v]) => {
    if (v) params.set(k === 'sla' ? 'sla_status' : k, v);
  });
  return params.toString();
};

const loadTickets = async () => {
  const params = buildParams();
  const res = await api.fetchJSON(`/api/tickets${params ? `?${params}` : ''}`);
  state.tickets = asTickets(res);
  renderQueue();
  if (state.selectedId) {
    const selected = state.tickets.find((t) => t.id === state.selectedId);
    if (selected) renderDetails(selected);
    else {
      state.selectedId = null;
      renderDetails(null);
    }
  }
};

const renderQueue = () => {
  const rows = state.tickets
    .map(
      (t) => `
      <div class="queue-row ${state.selectedId === t.id ? 'selected' : ''} ${slaHeatClass(t.sla?.status)}" data-id="${t.id}">
        <label class="queue-check">
          <input type="checkbox" data-id="${t.id}" ${state.selectedSet.has(t.id) ? 'checked' : ''}/>
          <span></span>
        </label>
        <div class="queue-main">
          <div class="queue-top">
            <strong>${t.ticket_number}</strong>
            <span class="muted small">${t.title}</span>
          </div>
          <div class="queue-meta">
            <span class="pill ${priorityClass(t.priority)}">${t.priority}</span>
            ${renderSlaPill(t.sla)}
            <span class="muted small">${t.status}</span>
            <span class="muted small">${t.assigned_to || 'Unassigned'}</span>
          </div>
        </div>
        <div class="queue-right muted small">${new Date(t.updated_at || t.created_at).toLocaleString()}</div>
      </div>
    `
    )
    .join('');

  queueEl.innerHTML = rows || '';
  queueEmptyEl.hidden = !!state.tickets.length;
  queueEl.hidden = !state.tickets.length;

  queueEl.querySelectorAll('.queue-row').forEach((row) => {
    row.addEventListener('click', (e) => {
      if (e.target.tagName.toLowerCase() === 'input') return;
      state.selectedId = Number(row.dataset.id);
      renderQueue();
      const ticket = state.tickets.find((t) => t.id === state.selectedId);
      renderDetails(ticket);
    });
  });

  queueEl.querySelectorAll('input[type="checkbox"]').forEach((box) => {
    box.addEventListener('change', () => {
      const id = Number(box.dataset.id);
      if (box.checked) state.selectedSet.add(id);
      else state.selectedSet.delete(id);
      bulkCountEl.textContent = state.selectedSet.size;
    });
  });

  bulkCountEl.textContent = state.selectedSet.size;
};

const renderComments = (ticket) => {
  const publicC = ticket.comments?.filter((c) => c.visibility === 'public') || [];
  const internalC = ticket.comments?.filter((c) => c.visibility === 'internal') || [];
  const renderList = (list) =>
    list.length
      ? list
          .map(
            (c) => `
          <div class="comment">
            <div class="comment-meta">
              <span>${c.author_email}</span>
              <span class="muted small">${new Date(c.created_at).toLocaleString()}</span>
              <span class="badge">${c.visibility.toUpperCase()}</span>
            </div>
            <p>${c.message}</p>
          </div>`
          )
          .join('')
      : '<p class="muted">No comments</p>';

  return `
    <div class="comment-columns">
      <div>
        <div class="comments-title">Public</div>
        ${renderList(publicC)}
      </div>
      <div>
        <div class="comments-title">Internal</div>
        ${renderList(internalC)}
      </div>
    </div>
  `;
};

const renderTimeline = (ticket) => {
  const events = [
    { label: 'Created', at: ticket.created_at, detail: ticket.requester_email },
    { label: 'Updated', at: ticket.updated_at, detail: ticket.status },
    ticket.sla?.status === 'Breached'
      ? { label: 'SLA Breached', at: ticket.updated_at, detail: ticket.sla?.minutes_remaining ? `${ticket.sla.minutes_remaining}m remaining` : '' }
      : null
  ].filter(Boolean);

  return `
    <ul class="timeline">
      ${events
        .map(
          (e) => `
        <li>
          <div class="timeline-dot"></div>
          <div>
            <strong>${e.label}</strong>
            <div class="muted small">${new Date(e.at).toLocaleString()}</div>
            <div class="muted small">${e.detail || ''}</div>
          </div>
        </li>`
        )
        .join('')}
    </ul>
  `;
};

const renderDetails = (ticket) => {
  if (!ticket) {
    detailsContentEl.hidden = true;
    detailsEmptyEl.hidden = false;
    return;
  }
  detailsEmptyEl.hidden = true;
  detailsContentEl.hidden = false;

  detailsContentEl.innerHTML = `
    <div class="details-header">
      <div>
        <div class="muted small">${ticket.ticket_number}</div>
        <h3>${ticket.title}</h3>
        <div class="muted small">Requester: ${ticket.requester_email}</div>
      </div>
      <div class="details-chips">
        <span class="pill ${priorityClass(ticket.priority)}">${ticket.priority}</span>
        ${renderSlaPill(ticket.sla)}
        <span class="pill">${ticket.status}</span>
      </div>
    </div>

    <div class="field-grid">
      <label>Category
        <select name="category">
          ${categories.map((c) => `<option value="${c}" ${c === ticket.category ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </label>
      <label>Priority
        <select name="priority">
          ${priorities.map((p) => `<option value="${p}" ${p === ticket.priority ? 'selected' : ''}>${p}</option>`).join('')}
        </select>
      </label>
      <label>Status
        <select name="status">
          ${statuses.map((s) => `<option value="${s}" ${s === ticket.status ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </label>
      <label>Assignee
        <select name="assigned_to">
          ${assignees.map((a) => `<option value="${a}" ${a === (ticket.assigned_to || 'Unassigned') ? 'selected' : ''}>${a}</option>`).join('')}
        </select>
      </label>
      <label>Resolver Group
        <input name="resolver_group" value="${ticket.resolver_group || ''}" />
      </label>
      <label>Users Affected
        <input name="affected_users" type="number" min="1" value="${ticket.affected_users || 1}" />
      </label>
      <label>Critical?
        <select name="business_critical">
          <option value="0" ${ticket.business_critical ? '' : 'selected'}>No</option>
          <option value="1" ${ticket.business_critical ? 'selected' : ''}>Yes</option>
        </select>
      </label>
      <label>Root Cause
        <select name="root_cause">
          <option value="">Select</option>
          <option value="Configuration" ${ticket.root_cause === 'Configuration' ? 'selected' : ''}>Configuration</option>
          <option value="Hardware" ${ticket.root_cause === 'Hardware' ? 'selected' : ''}>Hardware</option>
          <option value="Human Error" ${ticket.root_cause === 'Human Error' ? 'selected' : ''}>Human Error</option>
          <option value="Vendor Issue" ${ticket.root_cause === 'Vendor Issue' ? 'selected' : ''}>Vendor Issue</option>
        </select>
      </label>
      <label>Change ID
        <input name="linked_change_id" value="${ticket.linked_change_id || ''}" placeholder="CHG..." />
      </label>
      <label>Change Approved?
        <select name="change_approved">
          <option value="0" ${ticket.change_approved ? '' : 'selected'}>No</option>
          <option value="1" ${ticket.change_approved ? 'selected' : ''}>Yes</option>
        </select>
      </label>
      <label>Justification
        <input name="justification" placeholder="Required for P1 close / priority change" />
      </label>
    </div>

    <div class="details-actions">
      <button class="button ghost" id="save-ticket">Save changes</button>
    </div>

    <div class="details-columns">
      <div>
        <h4>Timeline</h4>
        ${renderTimeline(ticket)}
      </div>
      <div>
        <h4>Comments</h4>
        ${renderComments(ticket)}
        <form class="comment-form" data-ticket="${ticket.id}">
          <input type="text" name="message" placeholder="Add comment" required />
          <select name="visibility">
            <option value="public">Public</option>
            <option value="internal">Internal</option>
          </select>
          <button class="button ghost" type="submit">Post</button>
        </form>
      </div>
    </div>
  `;

  document.getElementById('save-ticket').onclick = async () => {
    const form = detailsContentEl;
    const payload = {
      category: form.querySelector('select[name="category"]').value,
      priority: form.querySelector('select[name="priority"]').value,
      status: form.querySelector('select[name="status"]').value,
      assigned_to: form.querySelector('select[name="assigned_to"]').value,
      resolver_group: form.querySelector('input[name="resolver_group"]').value,
      affected_users: form.querySelector('input[name="affected_users"]').value,
      business_critical: form.querySelector('select[name="business_critical"]').value,
      root_cause: form.querySelector('select[name="root_cause"]').value,
      linked_change_id: form.querySelector('input[name="linked_change_id"]').value,
      change_approved: form.querySelector('select[name="change_approved"]').value,
      justification: form.querySelector('input[name="justification"]').value
    };
    try {
      await api.fetchJSON(`/api/admin/tickets/${ticket.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      await loadTickets();
    } catch (err) {
      alert(err.message || 'Failed to save ticket');
    }
  };

  detailsContentEl.querySelector('.comment-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const message = form.querySelector('input[name="message"]').value;
    const visibility = form.querySelector('select[name="visibility"]').value;
    form.querySelector('button').disabled = true;
    try {
      await api.fetchJSON(`/api/tickets/${ticket.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ message, visibility })
      });
      await loadTickets();
    } catch (err) {
      alert(err.message || 'Failed to add comment');
    } finally {
      form.querySelector('button').disabled = false;
      form.reset();
    }
  });
};

const applyFiltersFromControls = () => {
  state.filters.q = document.getElementById('filter-search').value.trim();
  state.filters.status = document.getElementById('filter-status').value;
  state.filters.priority = document.getElementById('filter-priority').value;
  state.filters.category = document.getElementById('filter-category').value;
  const assigneeVal = document.getElementById('filter-assignee').value;
  state.filters.assigned_to = assigneeVal && assigneeVal !== 'unassigned' ? assigneeVal : '';
  state.filters.unassigned = assigneeVal === 'unassigned' ? '1' : '';
  state.filters.sla = document.getElementById('filter-sla').value;
  state.filters.critical = document.getElementById('filter-critical').value;
  state.filters.sort = document.getElementById('filter-sort').value || 'created_desc';
};

const bindControls = () => {
  ['filter-search', 'filter-status', 'filter-priority', 'filter-category', 'filter-assignee', 'filter-sla', 'filter-critical', 'filter-sort'].forEach(
    (id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', async () => {
        applyFiltersFromControls();
        await loadTickets();
      });
      el.addEventListener('change', async () => {
        applyFiltersFromControls();
        await loadTickets();
      });
    }
  );

  document.querySelectorAll('.time-filters button').forEach((btn) => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.time-filters button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.filters.date_range = btn.dataset.range;
      await loadTickets();
    });
  });

  document.querySelectorAll('.quick-views .pill-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.quick-views .pill-btn').forEach((b) => b.setAttribute('aria-pressed', 'false'));
      btn.setAttribute('aria-pressed', 'true');
      const view = btn.dataset.view;
      state.filters.status = '';
      state.filters.priority = '';
      state.filters.assigned_to = '';
      state.filters.unassigned = '';
      state.filters.sla = '';
      if (view === 'group') state.filters.assigned_to = 'Service Desk';
      if (view === 'unassigned') state.filters.unassigned = '1';
      if (view === 'p1p2') state.filters.priority = 'P1,P2';
      if (view === 'risk') state.filters.sla = 'At Risk';
      if (view === 'breached') state.filters.sla = 'Breached';
      await loadTickets();
    });
  });

  document.getElementById('bulk-apply').addEventListener('click', async () => {
    if (!state.selectedSet.size) return;
    const assign = document.getElementById('bulk-assign').value;
    const status = document.getElementById('bulk-status').value;
    const priority = document.getElementById('bulk-priority').value;
    const updates = [];
    state.selectedSet.forEach((id) => {
      const payload = {};
      if (assign) payload.assigned_to = assign;
      if (status) payload.status = status;
      if (priority) payload.priority = priority;
      if (Object.keys(payload).length) {
        updates.push(api.fetchJSON(`/api/admin/tickets/${id}`, { method: 'PUT', body: JSON.stringify(payload) }));
      }
    });
    try {
      await Promise.all(updates);
      await loadTickets();
    } catch (err) {
      alert(err.message || 'Bulk update failed');
    }
  });
};

(async () => {
  const user = await initHeader({ requireRole: 'admin' });
  if (!user) return;
  bindControls();
  await loadTickets();
})();
