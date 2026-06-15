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
`);

module.exports = db;
