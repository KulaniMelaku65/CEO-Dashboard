/**
 * Rebuild all 2026 snapshots from Business Central using live credentials.
 * This picks up the corrected MGT_REV/MGT_COS account sets (including 5026, 6019, 6058)
 * and the dynamic KFT_MGT_RPT_Lines lookup.
 *
 * Run from project root:  node rebuild-snapshots-2026.js
 */

require('./backend/node_modules/dotenv').config({ path: './.env' });

const db                           = require('./backend/db');
const { buildSnapshot }            = require('./backend/services/snapshot-builder');
const { persistSnapshot }          = require('./backend/services/snapshot-sync');
const { isBcConfigured }           = require('./backend/services/bc-client');

if (!isBcConfigured()) {
  console.error('BC credentials not found in backend/.env — aborting.');
  process.exit(1);
}

async function main() {
  const rows = db.prepare(
    "SELECT snapshot_date FROM snapshots WHERE snapshot_date >= '2026-01-01' ORDER BY snapshot_date ASC"
  ).all();

  console.log(`Found ${rows.length} snapshots to rebuild from BC...\n`);

  let success = 0, failed = 0;

  for (const { snapshot_date } of rows) {
    try {
      const data = await buildSnapshot(snapshot_date);
      persistSnapshot(snapshot_date, data);
      const gp  = data.budgetActual?.lines?.find(l => l.name === 'Gross Profit')?.actual ?? '?';
      const rev = data.budgetActual?.lines?.find(l => l.name === 'Revenue')?.actual ?? '?';
      console.log(`  ✓ ${snapshot_date}   Rev=${rev}M   GP=${gp}M`);
      success++;
    } catch (e) {
      console.error(`  ✗ ${snapshot_date}   ${e.message}`);
      failed++;
      // small pause after errors to avoid hammering BC
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  console.log(`\nDone — ${success} rebuilt, ${failed} failed.`);
}

main().catch(e => { console.error(e); process.exit(1); });
