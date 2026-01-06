const express = require('express');

const { requireRole } = require('../middleware/auth');
const { runQuery, getQuery, allQuery } = require('../db/database');
const { derivePriority } = require('./tickets.routes');

const router = express.Router();

const addAuditLog = (ticketId, action, detail, performedBy) =>
  runQuery(
    'INSERT INTO audit_logs (ticket_id, action, detail, performed_by) VALUES (?, ?, ?, ?)',
    [ticketId, action, detail, performedBy]
  );

const SLA_TARGETS = {
  P1: 4,
  P2: 8,
  P3: 24,
  P4: 72
};

const ROOT_CAUSES = ['Configuration', 'Hardware', 'Human Error', 'Vendor Issue'];

router.put('/tickets/:id', requireRole('admin'), async (req, res) => {
  const {
    status,
    priority,
    resolver_group: resolverGroup = 'Service Desk',
    category,
    affected_users,
    business_critical,
    root_cause,
    linked_change_id,
    change_approved,
    justification,
    assigned_to
  } = req.body;
  const ticketId = req.params.id;
  const performedBy = req.session.user.email;

  try {
    const existing = await getQuery('SELECT * FROM tickets WHERE id = ?', [ticketId]);
    if (!existing) {
      res.status(404).json({ message: 'Ticket not found' });
      return;
    }

    const affected = affected_users !== undefined ? Number(affected_users) || 1 : existing.affected_users || 1;
    const businessCritical =
      business_critical !== undefined
        ? business_critical === true || business_critical === 'true' || business_critical === 1 || business_critical === '1'
        : existing.business_critical === 1;

    if (status === 'Resolved') {
      if (!root_cause || !ROOT_CAUSES.includes(root_cause)) {
        res.status(400).json({ message: 'Root cause is required when resolving' });
        return;
      }
      if (existing.linked_change_id && !(change_approved === true || change_approved === 'true' || change_approved === 1 || change_approved === '1')) {
        res.status(400).json({ message: 'Change not approved; cannot resolve' });
        return;
      }
    }

    const priorityChanged = priority && priority !== existing.priority;
    const closingP1 = (status === 'Resolved' || existing.status === 'Resolved') && (priority || existing.priority) === 'P1';
    if ((priorityChanged || closingP1) && !justification) {
      res.status(400).json({ message: 'Justification is required for priority changes or closing P1' });
      return;
    }

    const finalPriority = derivePriority(priority || existing.priority, affected, businessCritical);
    const targetHours = SLA_TARGETS[finalPriority] || existing.sla_target_hours;
    const now = new Date();
    const due = new Date(now.getTime() + targetHours * 60 * 60 * 1000);

    await runQuery(
      `UPDATE tickets
       SET priority = ?,
           status = COALESCE(?, status),
           resolver_group = COALESCE(?, resolver_group),
           category = COALESCE(?, category),
           sla_target_hours = ?,
           sla_due_at = ?,
           affected_users = ?,
           business_critical = ?,
           root_cause = COALESCE(?, root_cause),
           linked_change_id = COALESCE(?, linked_change_id),
           change_approved = COALESCE(?, change_approved),
           assigned_to = COALESCE(?, assigned_to),
           updated_by = ?,
           last_touched = CURRENT_TIMESTAMP,
           resolved_at = CASE WHEN ? = 'Resolved' THEN CURRENT_TIMESTAMP ELSE resolved_at END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        finalPriority,
        status || null,
        resolverGroup || null,
        category || null,
        targetHours,
        due.toISOString(),
        affected,
        businessCritical ? 1 : 0,
        root_cause || null,
        linked_change_id || existing.linked_change_id || null,
        change_approved !== undefined
          ? change_approved === true || change_approved === 'true' || change_approved === 1 || change_approved === '1'
            ? 1
            : 0
          : null,
        assigned_to || null,
        performedBy,
        status || existing.status,
        ticketId
      ]
    );

    const changes = [
      `status -> ${status || existing.status}`,
      `priority -> ${finalPriority}`,
      `resolver -> ${resolverGroup}`,
      `assigned_to -> ${assigned_to || existing.assigned_to || 'n/a'}`,
      `category -> ${category || existing.category}`,
      `affected_users -> ${affected}`,
      `business_critical -> ${businessCritical}`,
      `root_cause -> ${root_cause || existing.root_cause || 'n/a'}`,
      `change -> ${linked_change_id || existing.linked_change_id || 'n/a'}`,
      `SLA -> ${targetHours}h`
    ];
    const detail = justification ? `${changes.join(', ')} | justification: ${justification}` : changes.join(', ');
    await addAuditLog(ticketId, 'Updated', detail, performedBy);

    const ticket = await getQuery('SELECT * FROM tickets WHERE id = ?', [ticketId]);
    res.json({ ticket });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update ticket' });
  }
});

router.get('/tickets/:id/audit', requireRole('admin'), async (req, res) => {
  try {
    const logs = await allQuery(
      'SELECT action, detail, performed_by, created_at FROM audit_logs WHERE ticket_id = ? ORDER BY created_at DESC',
      [req.params.id]
    );
    res.json({ logs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch audit log' });
  }
});

router.get('/analytics', requireRole('admin'), async (_req, res) => {
  try {
    const mttrByPriority = await allQuery(
      `SELECT priority, AVG((julianday(resolved_at) - julianday(created_at)) * 24) AS mttr_hours
       FROM tickets
       WHERE resolved_at IS NOT NULL
       GROUP BY priority`
    );

    const mttrByResolver = await allQuery(
      `SELECT resolver_group, AVG((julianday(resolved_at) - julianday(created_at)) * 24) AS mttr_hours
       FROM tickets
       WHERE resolved_at IS NOT NULL
       GROUP BY resolver_group`
    );

    const topCategories = await allQuery(
      `SELECT category, COUNT(*) as count
       FROM tickets
       GROUP BY category
       ORDER BY count DESC
       LIMIT 5`
    );

    const statusCounts = await allQuery(
      `SELECT status, COUNT(*) as count
       FROM tickets
       GROUP BY status`
    );

    const priorityCounts = await allQuery(
      `SELECT priority, COUNT(*) as count
       FROM tickets
       GROUP BY priority
       ORDER BY priority`
    );

    const dailyCreated = await allQuery(
      `SELECT date(created_at) as day, COUNT(*) as count
       FROM tickets
       WHERE date(created_at) >= date('now', '-6 day')
       GROUP BY day
       ORDER BY day`
    );

    const assigneeCounts = await allQuery(
      `SELECT COALESCE(assigned_to, 'Unassigned') as assigned_to, COUNT(*) as count
       FROM tickets
       GROUP BY assigned_to
       ORDER BY count DESC
       LIMIT 7`
    );

    const criticalCounts = await allQuery(
      `SELECT business_critical as critical, COUNT(*) as count
       FROM tickets
       GROUP BY business_critical`
    );

    res.json({
      mttrByPriority,
      mttrByResolver,
      topCategories,
      statusCounts,
      priorityCounts,
      dailyCreated,
      assigneeCounts,
      criticalCounts
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load analytics' });
  }
});

module.exports = router;
