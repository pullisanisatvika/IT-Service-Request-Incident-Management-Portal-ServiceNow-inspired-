const ticketListEl = document.getElementById('tickets');
const ticketErrorEl = document.getElementById('ticket-error');
const ticketForm = document.getElementById('ticket-form');
const descriptionField = ticketForm?.querySelector('textarea[name="description"]');
const suggestionsEl = document.getElementById('kb-suggestions');
let suggestTimer;

const formatSla = (sla) => {
  if (!sla) return '';
  if (sla.status === 'Met/Resolved') return '<span class="pill sla-green">Resolved</span>';
  if (sla.status === 'Breached') return `<span class="pill sla-red">Breached</span>`;
  if (sla.status === 'At Risk') return `<span class="pill sla-amber">At Risk (${sla.minutes_remaining}m)</span>`;
  if (sla.status === 'On Track') return `<span class="pill sla-green">On Track (${sla.minutes_remaining}m)</span>`;
  return '<span class="pill">SLA</span>';
};

const renderComments = (ticket) => {
  if (!ticket.comments?.length) return '<p class="muted">No comments yet.</p>';
  return ticket.comments
    .map(
      (c) => `
        <div class="comment">
          <div class="comment-meta">
            <span>${c.author_email}</span>
            <span class="muted">${new Date(c.created_at).toLocaleString()}</span>
            <span class="badge">${c.visibility.toUpperCase()}</span>
          </div>
          <p>${c.message}</p>
        </div>
      `
    )
    .join('');
};

const renderTickets = (tickets) => {
  if (!tickets.length) {
    ticketListEl.innerHTML = '<p class="muted">No tickets yet.</p>';
    return;
  }

  ticketListEl.innerHTML = '<div class="ticket-list"></div>';
  const list = ticketListEl.querySelector('.ticket-list');

  const heatClass = (slaStatus) => {
    if (slaStatus === 'Breached') return 'heat-breach';
    if (slaStatus === 'At Risk') return 'heat-warn';
    if (slaStatus === 'On Track') return 'heat-ok';
    return '';
  };

  tickets.forEach((ticket) => {
    const div = document.createElement('div');
    div.className = `ticket ${heatClass(ticket.sla?.status)}`;
    div.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <strong>${ticket.ticket_number}</strong>
        <span class="pill ${ticket.priority}">${ticket.priority}</span>
      </div>
      <p>${ticket.title}</p>
      <p class="muted">${ticket.description || ''}</p>
      <p class="muted">Category: ${ticket.category} | Resolver: ${ticket.resolver_group}</p>
      <p class="muted">Status: <span class="badge">${ticket.status}</span> | SLA: ${formatSla(ticket.sla)}</p>
      <div class="comments">
        <h4>Comments</h4>
        <div>${renderComments(ticket)}</div>
        <form data-ticket="${ticket.id}" class="comment-form">
          <input type="text" name="message" placeholder="Add public comment" required />
          <button class="button ghost" type="submit">Post</button>
        </form>
      </div>
    `;
    list.appendChild(div);
  });

  list.querySelectorAll('.comment-form').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const ticketId = form.dataset.ticket;
      const message = form.querySelector('input[name="message"]').value;
      form.querySelector('button').disabled = true;
      try {
        await api.fetchJSON(`/api/tickets/${ticketId}/comments`, {
          method: 'POST',
          body: JSON.stringify({ message })
        });
        await loadTickets();
      } catch (err) {
        alert(err.message);
      } finally {
        form.querySelector('button').disabled = false;
      }
    });
  });
};

const loadTickets = async () => {
  const { tickets } = await api.fetchJSON('/api/tickets');
  renderTickets(tickets);
};

const renderSuggestions = (items) => {
  if (!suggestionsEl) return;
  if (!items.length) {
    suggestionsEl.innerHTML = '';
    return;
  }
  suggestionsEl.innerHTML = items
    .map(
      (s) => `
      <div class="item">
        <strong>${s.ticket_number}</strong> • ${s.title}
        <div class="muted">${s.description?.slice(0, 120) || ''}</div>
      </div>
    `
    )
    .join('');
};

const fetchSuggestions = async (text) => {
  try {
    const { suggestions } = await api.fetchJSON(`/api/tickets/suggestions?q=${encodeURIComponent(text)}`);
    renderSuggestions(suggestions);
  } catch {
    renderSuggestions([]);
  }
};

ticketForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  ticketErrorEl.textContent = '';
  const formData = new FormData(ticketForm);
  const payload = Object.fromEntries(formData.entries());

  try {
    await api.fetchJSON('/api/tickets', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    ticketForm.reset();
    await loadTickets();
  } catch (err) {
    ticketErrorEl.textContent = err.message;
  }
});

descriptionField?.addEventListener('input', (e) => {
  clearTimeout(suggestTimer);
  const text = e.target.value;
  if (!text || text.length < 8) {
    renderSuggestions([]);
    return;
  }
  suggestTimer = setTimeout(() => fetchSuggestions(text), 300);
});

(async () => {
  const user = await initHeader({ requireRole: 'user' });
  if (!user) return;
  loadTickets().catch((err) => {
    ticketErrorEl.textContent = err.message;
  });
})();
