const express = require('express');
const { v4: uuid } = require('uuid');

const { requireAuth } = require('../middleware/auth');
const { runQuery, allQuery, getQuery } = require('../db/database');

const router = express.Router();

const SLA_TARGETS = {
  P1: 4,
  P2: 8,
  P3: 24,
  P4: 72
};

const CATEGORY_ASSIGNMENT = {
  Network: 'Network Team',
  Accounts: 'IAM Team',
  Hardware: 'Desktop Support',
  Software: 'Application Support'
};

const priorityOrder = ['P1', 'P2', 'P3', 'P4'];
const minPriority = (a, b) =>
  priorityOrder.indexOf(a || 'P3') < priorityOrder.indexOf(b || 'P3') ? a || 'P3' : b || 'P3';

const derivePriority = (basePriority = 'P3', affectedUsers = 1, businessCritical = false) => {
  let derived = 'P4';
  if (businessCritical && affectedUsers >= 50) derived = 'P1';
  else if ((businessCritical && affectedUsers >= 10) || affectedUsers >= 100) derived = 'P2';
  else if (businessCritical || affectedUsers >= 50) derived = 'P2';
  else if (affectedUsers >= 10) derived = 'P3';
  else derived = 'P4';
  return minPriority(basePriority, derived);
};

const buildTicketNumber = (type) => {
  const prefix = type === 'service' ? 'SR' : 'INC';
  return `${prefix}-${uuid().split('-')[0].toUpperCase()}`;
};

const addAuditLog = (ticketId, action, detail, performedBy) =>
  runQuery(
    'INSERT INTO audit_logs (ticket_id, action, detail, performed_by) VALUES (?, ?, ?, ?)',
    [ticketId, action, detail, performedBy]
  );

const addComment = (ticketId, message, visibility, authorEmail) =>
  runQuery(
    'INSERT INTO comments (ticket_id, message, visibility, author_email) VALUES (?, ?, ?, ?)',
    [ticketId, message, visibility, authorEmail]
  );

const { computeSla } = require('../utils/sla');

const attachComments = async (tickets, role) => {
  if (!tickets.length) return tickets;
  const ids = tickets.map((t) => t.id);
  const placeholders = ids.map(() => '?').join(',');
  const visibilityClause = role === 'admin' ? '' : "AND visibility = 'public'";
  const comments = await allQuery(
    `SELECT * FROM comments WHERE ticket_id IN (${placeholders}) ${visibilityClause} ORDER BY created_at DESC`,
    ids
  );

  const grouped = comments.reduce((acc, c) => {
    acc[c.ticket_id] = acc[c.ticket_id] || [];
    acc[c.ticket_id].push(c);
    return acc;
  }, {});

  return tickets.map((t) => ({
    ...t,
    comments: grouped[t.id] || []
  }));
};

const decorateTickets = async (tickets, role) => {
  const withComments = await attachComments(tickets, role);
  return withComments.map((t) => ({
    ...t,
    sla: computeSla(t)
  }));
};

const extractKeywords = (text = '') => {
  const matches = text.toLowerCase().match(/[a-z0-9]{4,}/g);
  if (!matches) return [];
  return Array.from(new Set(matches)).slice(0, 5);
};

router.get('/', requireAuth, async (req, res) => {
  try {
    const { role, email } = req.session.user;
    const {
      priority,
      sla_status: slaStatus,
      date_range: dateRange,
      status,
      category,
      assigned_to: assignedTo,
      unassigned,
      critical,
      q,
      sort
    } = req.query;
    const query =
      role === 'admin'
        ? 'SELECT * FROM tickets ORDER BY created_at DESC'
        : 'SELECT * FROM tickets WHERE requester_email = ? ORDER BY created_at DESC';
    const params = role === 'admin' ? [] : [email];
    const tickets = await allQuery(query, params);
    let enriched = await decorateTickets(tickets, role);

    const parseList = (val) => val?.split(',').map((v) => v.trim()).filter(Boolean) || [];

    if (priority) {
      const list = parseList(priority);
      enriched = enriched.filter((t) => list.includes(t.priority));
    }

    if (slaStatus) {
      const statuses = parseList(slaStatus);
      enriched = enriched.filter((t) => statuses.includes(t.sla?.status));
    }

    if (status) {
      const statuses = parseList(status);
      enriched = enriched.filter((t) => statuses.includes(t.status));
    }

    if (category) {
      const cats = parseList(category).map((c) => c.toLowerCase());
      enriched = enriched.filter((t) => cats.includes((t.category || '').toLowerCase()));
    }

    if (critical === '0' || critical === '1') {
      enriched = enriched.filter((t) => String(t.critical || 0) === critical);
    }

    if (assignedTo) {
      const assignees = parseList(assignedTo);
      enriched = enriched.filter((t) => assignees.includes(t.assigned_to));
    }

    if (unassigned === '1') {
      enriched = enriched.filter((t) => !t.assigned_to || t.assigned_to === 'Unassigned');
    }

    if (q) {
      const term = q.toLowerCase();
      enriched = enriched.filter(
        (t) =>
          (t.ticket_number || '').toLowerCase().includes(term) ||
          (t.title || '').toLowerCase().includes(term) ||
          (t.requester_email || '').toLowerCase().includes(term)
      );
    }

    if (dateRange && dateRange !== 'all') {
      const now = Date.now();
      const ranges = {
        '24h': now - 24 * 60 * 60 * 1000,
        '7d': now - 7 * 24 * 60 * 60 * 1000,
        '30d': now - 30 * 24 * 60 * 60 * 1000
      };
      const cutoff = ranges[dateRange] || 0;
      enriched = enriched.filter((t) => {
        const created = new Date(t.created_at || t.updated_at || now).getTime();
        return created >= cutoff;
      });
    }

    if (sort) {
      const sorters = {
        created_desc: (a, b) => new Date(b.created_at) - new Date(a.created_at),
        created_asc: (a, b) => new Date(a.created_at) - new Date(b.created_at),
        priority_desc: (a, b) => (a.priority || '').localeCompare(b.priority || ''),
        priority_asc: (a, b) => (b.priority || '').localeCompare(a.priority || ''),
        sla_asc: (a, b) => (a.sla?.minutes_remaining ?? Infinity) - (b.sla?.minutes_remaining ?? Infinity)
      };
      const fn = sorters[sort];
      if (fn) enriched = enriched.sort(fn);
    }

    res.json({ tickets: enriched });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch tickets' });
  }
});

router.get('/suggestions', requireAuth, async (req, res) => {
  try {
    const keywords = extractKeywords(req.query.q || '');
    if (!keywords.length) {
      res.json({ suggestions: [] });
      return;
    }

    const clauses = keywords.map(() => '(title LIKE ? OR description LIKE ?)').join(' OR ');
    const params = keywords.flatMap((k) => [`%${k}%`, `%${k}%`]);
    const suggestions = await allQuery(
      `SELECT ticket_number, title, description, resolver_group, updated_at
       FROM tickets
       WHERE status = 'Resolved' AND (${clauses})
       ORDER BY updated_at DESC
       LIMIT 5`,
      params
    );

    res.json({ suggestions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load suggestions' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  const {
    type = 'incident',
    title,
    description = '',
    priority = 'P3',
    category = 'General',
    affected_users = 1,
    business_critical = false,
    linked_change_id
  } = req.body;
  if (!title) {
    res.status(400).json({ message: 'Title is required' });
    return;
  }

  try {
    const ticketNumber = buildTicketNumber(type);
    const { email } = req.session.user;
    const affected = Number(affected_users) || 1;
    const businessCritical = business_critical === true || business_critical === 'true';
    const finalPriority = derivePriority(priority, affected, businessCritical);
    const targetHours = SLA_TARGETS[finalPriority] || SLA_TARGETS.P3;
    const now = new Date();
    const due = new Date(now.getTime() + targetHours * 60 * 60 * 1000);
    const resolverGroup = CATEGORY_ASSIGNMENT[category] || 'Service Desk';

    const insertResult = await runQuery(
      `INSERT INTO tickets (ticket_number, type, title, description, priority, requester_email, resolver_group, updated_by, category, sla_target_hours, sla_due_at, affected_users, business_critical, linked_change_id, last_touched, assigned_to)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
      [
        ticketNumber,
        type,
        title,
        description,
        finalPriority,
        email,
        resolverGroup,
        email,
        category,
        targetHours,
        due.toISOString(),
        affected,
        businessCritical ? 1 : 0,
        linked_change_id || null,
        resolverGroup
      ]
    );

    await addAuditLog(insertResult.lastID, 'Created', `Ticket created (${ticketNumber})`, email);

    const ticket = await getQuery('SELECT * FROM tickets WHERE id = ?', [insertResult.lastID]);
    const enriched = (await decorateTickets([ticket], req.session.user.role))[0];
    res.status(201).json({ ticket: enriched });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to create ticket' });
  }
});

router.get('/:id/comments', requireAuth, async (req, res) => {
  try {
    const { role, email } = req.session.user;
    const ticket = await getQuery('SELECT * FROM tickets WHERE id = ?', [req.params.id]);
    if (!ticket) {
      res.status(404).json({ message: 'Ticket not found' });
      return;
    }
    if (role !== 'admin' && ticket.requester_email !== email) {
      res.status(403).json({ message: 'Not allowed' });
      return;
    }
    const visibilityClause = role === 'admin' ? '' : "AND visibility = 'public'";
    const comments = await allQuery(
      `SELECT * FROM comments WHERE ticket_id = ? ${visibilityClause} ORDER BY created_at DESC`,
      [req.params.id]
    );
    res.json({ comments });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch comments' });
  }
});

router.post('/:id/comments', requireAuth, async (req, res) => {
  const { message, visibility = 'public' } = req.body;
  if (!message) {
    res.status(400).json({ message: 'Message is required' });
    return;
  }

  try {
    const { role, email } = req.session.user;
    const ticket = await getQuery('SELECT * FROM tickets WHERE id = ?', [req.params.id]);
    if (!ticket) {
      res.status(404).json({ message: 'Ticket not found' });
      return;
    }
    if (role !== 'admin' && ticket.requester_email !== email) {
      res.status(403).json({ message: 'Not allowed' });
      return;
    }

    const vis = role === 'admin' ? visibility : 'public';
    await addComment(ticket.id, message, vis, email);
    await runQuery(
      `UPDATE tickets SET last_touched = CURRENT_TIMESTAMP, updated_by = ? WHERE id = ?`,
      [email, ticket.id]
    );
    await addAuditLog(ticket.id, 'Comment', `${vis.toUpperCase()} comment added`, email);

    const visibilityClause = role === 'admin' ? '' : "AND visibility = 'public'";
    const comments = await allQuery(
      `SELECT * FROM comments WHERE ticket_id = ? ${visibilityClause} ORDER BY created_at DESC`,
      [ticket.id]
    );
    res.status(201).json({ comments });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to add comment' });
  }
});

module.exports = router;
module.exports.derivePriority = derivePriority;
