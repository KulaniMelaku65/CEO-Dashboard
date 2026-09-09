const Database = require('better-sqlite3');
const path = require('path');
const fs   = require('fs');

const DB_PATH = process.env.DB_PATH || require('path').join(__dirname, '..', 'data', 'kifiya.db');

// Make sure the data/ directory exists
const dir = require('path').dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(DB_PATH);

// WAL mode: allows reads while a write is happening (faster for this pattern)
db.pragma('journal_mode = WAL');

// Create tables on first run — safe to call every startup
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name     TEXT,
    title         TEXT,
    created_at    TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS snapshots (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_date TEXT UNIQUE NOT NULL,
    data          TEXT NOT NULL,
    created_at    TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_snapshots_date ON snapshots(snapshot_date DESC);

  -- Last-known job title per employee, updated from the live headcount table on every
  -- sync while the employee is active. Job title is never carried on payroll rows
  -- themselves and disappears once someone leaves (KFT_Employee_Headcount is
  -- active-only), so this is the only way to still show a real title for an
  -- employee's payroll history after they've gone inactive.
  CREATE TABLE IF NOT EXISTS employee_job_titles (
    employee_no TEXT PRIMARY KEY,
    job_title   TEXT NOT NULL,
    updated_at  TEXT DEFAULT (datetime('now'))
  );

  -- Dashboard-only department/section reassignment. Business Central itself is never
  -- written to (our BC integration is read-only) — this table lets the dashboard show an
  -- employee under a different section than BC reports, applied on top of the live
  -- headcount row at snapshot-build time. Set/cleared from the "Department Overrides"
  -- page under HR Analysis.
  CREATE TABLE IF NOT EXISTS department_overrides (
    employee_no    TEXT PRIMARY KEY,
    employee_name  TEXT,
    from_section   TEXT,
    section_code   TEXT NOT NULL,
    updated_by     TEXT,
    updated_at     TEXT DEFAULT (datetime('now'))
  );

  -- Which sidebar pages (App.jsx's ALL_SLIDES ids) a given user can see. Presence of a
  -- row is the grant — no row for a page means no access. Managed from the Admin page.
  CREATE TABLE IF NOT EXISTS user_page_access (
    user_id  INTEGER NOT NULL,
    page_id  TEXT NOT NULL,
    PRIMARY KEY (user_id, page_id)
  );
`);

// users predates the email/is_admin/must_change_password columns (four accounts were
// seeded before this admin feature existed) — ALTER TABLE ADD COLUMN, guarded so it's
// safe to run on every startup once the columns already exist.
function addColumnIfMissing(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}
addColumnIfMissing('users', 'email',                 'email TEXT');
addColumnIfMissing('users', 'is_admin',              'is_admin INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('users', 'must_change_password',  'must_change_password INTEGER NOT NULL DEFAULT 0');

module.exports = db;
