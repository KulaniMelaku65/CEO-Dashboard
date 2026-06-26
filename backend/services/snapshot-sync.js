const fs   = require('fs');
const path = require('path');
const db   = require('../db');
const { buildSnapshot } = require('./snapshot-builder');
const { isBcConfigured } = require('./bc-client');

const upsert = db.prepare(
  `INSERT INTO snapshots (snapshot_date, data)
   VALUES (?, ?)
   ON CONFLICT(snapshot_date) DO UPDATE SET data = excluded.data, created_at = datetime('now')`
);

let syncInProgress = false;
let lastSync = null;   // { date, ok, at, error? }

function archivePath(date) {
  return path.join(__dirname, '..', '..', 'data', 'archives', `${date}.json`);
}

function saveArchive(date, data) {
  const dir = path.dirname(archivePath(date));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(archivePath(date), JSON.stringify(data, null, 2));
}

function persistSnapshot(date, data) {
  upsert.run(date, JSON.stringify(data));
  saveArchive(date, data);
}

/** Fetch from BC (if configured) and Superset, then store snapshot for the given date (defaults to today). */
async function syncSnapshot(date) {
  const targetDate = date || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate))
    throw new Error('Invalid date — use YYYY-MM-DD.');

  if (syncInProgress)
    throw new Error('A sync is already in progress.');

  syncInProgress = true;
  console.log(`[sync] Fetching BC snapshot for ${targetDate}…`);

  try {
    const data = await buildSnapshot(targetDate);

    // When BC is unavailable, preserve BC-sourced fields from the most recent prior snapshot
    // so that a Superset-only sync does not wipe the financial/HR data.
    if (!isBcConfigured()) {
      const prev = db.prepare(
        'SELECT snapshot_date, data FROM snapshots WHERE snapshot_date < ? ORDER BY snapshot_date DESC LIMIT 1'
      ).get(targetDate);
      if (prev) {
        const p = JSON.parse(prev.data);
        const BC_KEYS = ['budgetActual', 'budgetOverview', 'cashflow', 'reports', 'hr', 'lending', 'dimensionNames'];
        BC_KEYS.forEach(k => { if (p[k]) data[k] = p[k]; });
        console.log(`[sync] BC not configured — carried forward BC fields from ${prev.snapshot_date}`);
      }
    }

    persistSnapshot(targetDate, data);

    const L = data.budgetActual.lines;
    const summary = {
      date: targetDate,
      asOf: data.asOf,
      revenue: L[0].actual,
      ebitda:  L[4].actual
    };
    lastSync = { ...summary, ok: true, at: new Date().toISOString() };
    console.log(`[sync] Done — Revenue ${L[0].actual}M, EBITDA ${L[4].actual}M`);
    return summary;
  } catch (e) {
    lastSync = { date: targetDate, ok: false, at: new Date().toISOString(), error: e.message };
    throw e;
  } finally {
    syncInProgress = false;
  }
}

function getSyncStatus() {
  const latest = db.prepare(
    'SELECT snapshot_date, created_at FROM snapshots ORDER BY snapshot_date DESC LIMIT 1'
  ).get();
  return {
    bcConfigured: isBcConfigured(),
    syncInProgress,
    lastSync,
    latestSnapshot: latest || null
  };
}

module.exports = { syncSnapshot, getSyncStatus, persistSnapshot };
