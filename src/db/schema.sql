CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'admin')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_number TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('incident', 'service')),
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'General',
  priority TEXT NOT NULL DEFAULT 'P3',
  affected_users INTEGER DEFAULT 1,
  business_critical INTEGER DEFAULT 0,
  root_cause TEXT,
  linked_change_id TEXT,
  change_approved INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'New',
  requester_email TEXT NOT NULL,
  resolver_group TEXT DEFAULT 'Service Desk',
  assigned_to TEXT DEFAULT 'Unassigned',
  updated_by TEXT,
  sla_target_hours INTEGER DEFAULT 24,
  sla_due_at DATETIME,
  last_touched DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  detail TEXT,
  performed_by TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ticket_id) REFERENCES tickets (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tickets_requester ON tickets (requester_email);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets (status);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL,
  message TEXT NOT NULL,
  visibility TEXT NOT NULL CHECK (visibility IN ('public', 'internal')),
  author_email TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ticket_id) REFERENCES tickets (id) ON DELETE CASCADE
);
