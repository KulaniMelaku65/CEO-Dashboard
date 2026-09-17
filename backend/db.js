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

  -- Group KPI Dashboard — the 12 functions from the Appendix A metric inventory. IDs are
  -- 'kpi-'-prefixed since a plain 'hr' page id already exists (People & Operations).
  CREATE TABLE IF NOT EXISTS kpi_departments (
    id                TEXT PRIMARY KEY,
    name              TEXT NOT NULL,
    accountable_exec  TEXT,
    sort_order        INTEGER NOT NULL DEFAULT 0
  );

  -- The KPI dictionary — "single source of definition" (PRD 4.1). Nothing appears on the
  -- KPI dashboard that isn't a row here. target_value is nullable: 13 rows in the source
  -- inventory are flagged as still needing a target, and this must show as "pending" rather
  -- than a fabricated number until the CFO fills it in through the dictionary editor.
  CREATE TABLE IF NOT EXISTS kpi_dictionary (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    department_id  TEXT NOT NULL,
    name           TEXT NOT NULL,
    type           TEXT NOT NULL,
    unit           TEXT,
    target_value   REAL,
    target_note    TEXT,
    rag_rule_json  TEXT,
    source         TEXT,
    method         TEXT,
    weight         REAL NOT NULL DEFAULT 1,
    shared_key     TEXT,
    sort_order     INTEGER NOT NULL DEFAULT 0,
    is_active      INTEGER NOT NULL DEFAULT 1,
    created_at     TEXT DEFAULT (datetime('now')),
    updated_at     TEXT DEFAULT (datetime('now'))
  );

  -- Phased monthly targets. A row here only exists once the CFO overrides a specific
  -- month — absent months fall back to a straight-line split of kpi_dictionary.target_value,
  -- computed at read time (PRD 4.4).
  CREATE TABLE IF NOT EXISTS kpi_monthly_targets (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    kpi_id        INTEGER NOT NULL,
    period        TEXT NOT NULL,
    target_value  REAL,
    UNIQUE(kpi_id, period)
  );

  -- One row per KPI per month — both the input-form backing store and the approval record.
  CREATE TABLE IF NOT EXISTS kpi_submissions (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    kpi_id         INTEGER NOT NULL,
    period         TEXT NOT NULL,
    department_id  TEXT NOT NULL,
    actual_value   REAL,
    status         TEXT NOT NULL DEFAULT 'draft',
    reason_note    TEXT,
    action_note    TEXT,
    rag_status     TEXT,
    submitted_by   INTEGER,
    submitted_at   TEXT,
    approved_by    INTEGER,
    approved_at    TEXT,
    updated_at     TEXT DEFAULT (datetime('now')),
    UNIQUE(kpi_id, period)
  );

  -- Append-only audit trail for every dictionary edit, submission, and approval/rejection —
  -- the first real audit log in this codebase (PRD calls for dated, kept changes throughout).
  CREATE TABLE IF NOT EXISTS kpi_audit_log (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type    TEXT NOT NULL,
    entity_id      TEXT,
    action         TEXT NOT NULL,
    actor_user_id  INTEGER,
    detail_json    TEXT,
    created_at     TEXT DEFAULT (datetime('now'))
  );

  -- Small key/value store for CFO-editable global config that doesn't warrant its own table
  -- (roll-up mode/thresholds, default RAG bands per KPI type).
  CREATE TABLE IF NOT EXISTS kpi_settings (
    key         TEXT PRIMARY KEY,
    value_json  TEXT NOT NULL,
    updated_at  TEXT DEFAULT (datetime('now')),
    updated_by  INTEGER
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

// Group KPI Dashboard role — deliberately separate from is_admin (site administration and
// KPI approval are different concerns). null = no KPI module access. kpi_department_id only
// means anything when kpi_role = 'dept_head'. Sidebar visibility still goes through the
// existing user_page_access grants, same as every other page.
addColumnIfMissing('users', 'kpi_role',              'kpi_role TEXT');
addColumnIfMissing('users', 'kpi_department_id',     'kpi_department_id TEXT');

module.exports = db;
