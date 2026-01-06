const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

const schemaPath = path.join(__dirname, 'schema.sql');
const dbPath = path.join(__dirname, '..', '..', 'data.sqlite');

let db;

const columnExists = async (table, column) => {
  const info = await allQuery(`PRAGMA table_info(${table})`);
  return info.some((col) => col.name === column);
};

const ensureColumn = async (table, column, ddl, options = {}) => {
  const exists = await columnExists(table, column);
  if (!exists) {
    const ddlClause = options.stripDefault ? ddl.replace(/DEFAULT\\s+CURRENT_TIMESTAMP/gi, '').trim() : ddl;
    await runQuery(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddlClause}`);
    if (options.backfillSql) {
      await runQuery(options.backfillSql);
    }
  }
};

const runQuery = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function runCallback(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve(this);
    });
  });

const getQuery = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row);
    });
  });

const allQuery = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
    });
  });

const seedDefaultUsers = async () => {
  const existing = await getQuery('SELECT COUNT(*) as count FROM users');
  if (existing.count > 0) return;

  const adminPassword = bcrypt.hashSync('admin123', 10);
  const userPassword = bcrypt.hashSync('user123', 10);

  await runQuery(
    'INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, ?)',
    ['admin@test.com', adminPassword, 'Admin User', 'admin']
  );
  await runQuery(
    'INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, ?)',
    ['user@test.com', userPassword, 'End User', 'user']
  );
};

const initDb = () => {
  if (db) return db;

  const schema = fs.readFileSync(schemaPath, 'utf-8');
  db = new sqlite3.Database(dbPath);

  db.serialize(() => {
    db.exec(schema);
  });

  // Backfill columns for existing db files
  (async () => {
    try {
      await ensureColumn('tickets', 'category', "TEXT NOT NULL DEFAULT 'General'");
      await ensureColumn('tickets', 'sla_target_hours', 'INTEGER DEFAULT 24');
      await ensureColumn('tickets', 'sla_due_at', 'DATETIME');
      await ensureColumn('tickets', 'affected_users', 'INTEGER DEFAULT 1');
      await ensureColumn('tickets', 'business_critical', 'INTEGER DEFAULT 0');
      await ensureColumn('tickets', 'root_cause', 'TEXT');
      await ensureColumn('tickets', 'linked_change_id', 'TEXT');
      await ensureColumn('tickets', 'change_approved', 'INTEGER DEFAULT 0');
      await ensureColumn('tickets', 'last_touched', 'DATETIME DEFAULT CURRENT_TIMESTAMP', {
        stripDefault: true,
        backfillSql: 'UPDATE tickets SET last_touched = CURRENT_TIMESTAMP WHERE last_touched IS NULL'
      });
      await ensureColumn('tickets', 'resolved_at', 'DATETIME');
      await ensureColumn('tickets', 'assigned_to', "TEXT DEFAULT 'Unassigned'");
    } catch (err) {
      console.error('Failed to backfill schema columns', err);
    }
  })();

  seedDefaultUsers().catch((err) => {
    console.error('Failed to seed default users', err);
  });

  return db;
};

const getDb = () => (db ? db : initDb());

module.exports = {
  initDb,
  getDb,
  runQuery,
  getQuery,
  allQuery
};
