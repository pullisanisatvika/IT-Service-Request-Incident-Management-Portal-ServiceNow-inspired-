const path = require('path');
const express = require('express');
const session = require('express-session');

const { initDb, allQuery, runQuery } = require('./db/database');
const authRoutes = require('./routes/auth.routes');
const ticketRoutes = require('./routes/tickets.routes');
const adminRoutes = require('./routes/admin.routes');
const { derivePriority } = require('./routes/tickets.routes');
const { requireRole } = require('./middleware/auth');

initDb();

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-session-secret',
    resave: false,
    saveUninitialized: false
  })
);

app.use(express.static(path.join(__dirname, '..', 'public')));

// HTML entry points
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.get('/login', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
});

app.get('/user', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'user.html'));
});

app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});

app.get('/dashboard', requireRole('admin'), (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'dashboard.html'));
});

app.get('/tickets', requireRole('admin'), (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'tickets.html'));
});

app.get('/knowledge', requireRole('admin'), (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'knowledge.html'));
});

app.get('/kb-accounts-access', requireRole('admin'), (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'kb-accounts-access.html'));
});

app.get('/kb-reset-password', requireRole('admin'), (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'kb-reset-password.html'));
});

app.get('/kb-request-access', requireRole('admin'), (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'kb-request-access.html'));
});

app.get('/kb-report-phishing', requireRole('admin'), (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'kb-report-phishing.html'));
});

app.get('/kb-request-hardware', requireRole('admin'), (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'kb-request-hardware.html'));
});

app.get('/kb-devices-hardware', requireRole('admin'), (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'kb-devices-hardware.html'));
});

app.get('/kb-collaboration', requireRole('admin'), (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'kb-collaboration.html'));
});

app.get('/kb-network', requireRole('admin'), (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'kb-network.html'));
});

app.get('/kb-mfa-issues', requireRole('admin'), (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'kb-mfa-issues.html'));
});

app.get('/kb-sso-problems', requireRole('admin'), (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'kb-sso-problems.html'));
});

app.get('/kb-vpn-access', requireRole('admin'), (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'kb-vpn-access.html'));
});

app.get('/productivity', requireRole('admin'), (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'productivity.html'));
});

app.get('/inventory', requireRole('admin'), (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'inventory.html'));
});

app.get('/projects', requireRole('admin'), (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'projects.html'));
});

app.get('/settings', requireRole('admin'), (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'settings.html'));
});

// User pages
app.get('/user-dashboard', requireRole('user'), (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'user-dashboard.html'));
});

app.get('/user-knowledge', requireRole('user'), (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'user-knowledge.html'));
});

app.get('/user-productivity', requireRole('user'), (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'user-productivity.html'));
});

app.get('/user-inventory', requireRole('user'), (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'user-inventory.html'));
});

app.get('/user-projects', requireRole('user'), (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'user-projects.html'));
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/admin', adminRoutes);

// Escalation engine: bump priority for untouched tickets older than 4h
const SLA_TARGETS = {
  P1: 4,
  P2: 8,
  P3: 24,
  P4: 72
};

const escalatePriority = (priority) => {
  if (priority === 'P4') return 'P3';
  if (priority === 'P3') return 'P2';
  if (priority === 'P2') return 'P1';
  return 'P1';
};

const startEscalationEngine = () => {
  const THRESHOLD_HOURS = 4;
  setInterval(async () => {
    try {
      const stale = await allQuery(
        `SELECT * FROM tickets
         WHERE status != 'Resolved'
         AND priority != 'P1'
         AND (julianday('now') - julianday(last_touched)) * 24 >= ?`,
        [THRESHOLD_HOURS]
      );

      for (const ticket of stale) {
        const newPriority = escalatePriority(ticket.priority);
        const targetHours = SLA_TARGETS[newPriority] || SLA_TARGETS.P3;
        const due = new Date(Date.now() + targetHours * 60 * 60 * 1000).toISOString();

        await runQuery(
          `UPDATE tickets
           SET priority = ?,
               sla_target_hours = ?,
               sla_due_at = ?,
               updated_by = 'escalation-engine',
               last_touched = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [newPriority, targetHours, due, ticket.id]
        );
      }
    } catch (err) {
      console.error('Escalation engine failed', err);
    }
  }, 5 * 60 * 1000);
};

startEscalationEngine();

// Fallback
app.use((req, res) => {
  res.status(404).json({ message: `Route not found: ${req.originalUrl}` });
});

module.exports = app;
