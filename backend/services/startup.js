const { ensureUsers } = require('./ensure-users');
const { importArchives, snapshotCount } = require('./import-archives');
const { syncSnapshot } = require('./snapshot-sync');
const { isBcConfigured, missingBcVars } = require('./bc-client');

function startupSyncEnabled() {
  return process.env.SNAPSHOT_ON_STARTUP !== 'false';
}

/** Runs on every server start: seed users, pull BC, fall back to archives. */
async function runStartup() {
  console.log('[startup] Bootstrapping…');

  try {
    const seeded = await ensureUsers();
    if (seeded) console.log(`[startup] Created ${seeded} default user(s).`);
  } catch (e) {
    console.error('[startup] User seed failed:', e.message);
  }

  const hadSnapshots = snapshotCount() > 0;

  if (startupSyncEnabled() && isBcConfigured()) {
    try {
      await syncSnapshot();
      console.log('[startup] Latest data pulled from Business Central.');
      return;
    } catch (e) {
      console.error('[startup] BC pull failed:', e.message);
      if (!hadSnapshots && snapshotCount() === 0) {
        console.log('[startup] Falling back to archive import…');
      }
    }
  } else if (!isBcConfigured()) {
    console.warn('[startup] BC not configured — missing:', missingBcVars().join(', '));
  }

  if (snapshotCount() === 0) {
    const imported = importArchives({ onlyIfEmpty: true });
    if (imported === 0) {
      console.warn('[startup] No snapshot data available. Connect BC or add files to data/archives/.');
    }
  } else if (!hadSnapshots) {
    console.log(`[startup] ${snapshotCount()} snapshot(s) ready.`);
  }
}

module.exports = { runStartup };
