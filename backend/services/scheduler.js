const cron = require('node-cron');
const { syncSnapshot } = require('./snapshot-sync');
const { isBcConfigured } = require('./bc-client');

function startScheduler() {
  if (!isBcConfigured()) {
    console.log('[scheduler] BC not configured — automatic sync disabled.');
    return;
  }

  if (process.env.SNAPSHOT_SCHEDULER === 'false') {
    console.log('[scheduler] SNAPSHOT_SCHEDULER=false — automatic sync disabled.');
    return;
  }

  // Default: 7 AM & 1 PM EAT (UTC+3) → 04:00 and 10:00 UTC
  const schedule = process.env.SNAPSHOT_CRON || '0 4,10 * * *';

  if (!cron.validate(schedule)) {
    console.error(`[scheduler] Invalid SNAPSHOT_CRON: ${schedule}`);
    return;
  }

  cron.schedule(schedule, async () => {
    try {
      await syncSnapshot();
    } catch (e) {
      console.error('[scheduler] Sync failed:', e.message);
    }
  });

  console.log(`[scheduler] BC snapshot cron active: ${schedule}`);
}

module.exports = { startScheduler };
