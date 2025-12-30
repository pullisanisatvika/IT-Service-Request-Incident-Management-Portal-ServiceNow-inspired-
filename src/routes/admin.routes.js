const express = require("express");
const { db } = require("../db/database");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();

function now() {
  return new Date().toISOString();
}

router.get("/tickets", requireAdmin, (req, res) => {
  const tickets = db.prepare(
    `SELECT id, ticket_number, type, category, short_description, priority, status, resolver_group,
            created_at, updated_at, resolved_at
     FROM tickets
     ORDER BY id DESC`
  ).all();
  res.json({ tickets });
});

router.patch("/tickets/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { status, priority, resolver_group } = req.body;

  const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(id);
  if (!ticket) return res.status(404).json({ error: "Not found" });

  const updatedAt = now();

  // update fields (keep existing if not provided)
  const nextStatus = status ?? ticket.status;
  const nextPriority = priority ?? ticket.priority;
  const nextGroup = resolver_group ?? ticket.resolver_group;

  db.prepare(
    `UPDATE tickets
     SET status = ?, priority = ?, resolver_group = ?, updated_at = ?, resolved_at = ?
     WHERE id = ?`
  ).run(
    nextStatus,
    nextPriority,
    nextGroup,
    updatedAt,
    nextStatus === "RESOLVED" ? updatedAt : ticket.resolved_at,
    id
  );

  // audit logging (log only changed fields)
  const actorId = req.session.user.id;
  const insertAudit = db.prepare(
    `INSERT INTO audit_log (ticket_id, actor_id, action, from_value, to_value, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  if (ticket.status !== nextStatus) insertAudit.run(id, actorId, "STATUS_CHANGE", ticket.status, nextStatus, updatedAt);
  if (ticket.priority !== nextPriority) insertAudit.run(id, actorId, "PRIORITY_CHANGE", ticket.priority, nextPriority, updatedAt);
  if (ticket.resolver_group !== nextGroup) insertAudit.run(id, actorId, "ASSIGN_GROUP", ticket.resolver_group, nextGroup, updatedAt);

  res.json({ ok: true });
});

router.post("/tickets/:id/comments", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { body, visibility = "INTERNAL" } = req.body;

  const ticket = db.prepare("SELECT id FROM tickets WHERE id = ?").get(id);
  if (!ticket) return res.status(404).json({ error: "Not found" });

  const createdAt = now();

  db.prepare(
    `INSERT INTO comments (ticket_id, author_id, visibility, body, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, req.session.user.id, visibility, body, createdAt);

  db.prepare(
    `INSERT INTO audit_log (ticket_id, actor_id, action, from_value, to_value, created_at)
     VALUES (?, ?, 'ADD_COMMENT', NULL, ?, ?)`
  ).run(id, req.session.user.id, visibility, createdAt);

  res.status(201).json({ ok: true });
});

router.get("/dashboard", requireAdmin, (req, res) => {
  const byStatus = db.prepare(
    `SELECT status, COUNT(*) as count FROM tickets GROUP BY status`
  ).all();

  const byPriority = db.prepare(
    `SELECT priority, COUNT(*) as count FROM tickets GROUP BY priority`
  ).all();

  res.json({ byStatus, byPriority });
});

module.exports = router;
