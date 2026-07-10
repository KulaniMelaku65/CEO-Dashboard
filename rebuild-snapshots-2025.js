/**
 * Rebuild all 2025 snapshots from Business Central using live credentials.
 * Same as rebuild-snapshots-2026.js but for the prior fiscal year — picks up
 * the newer Superset chart fields (Lending/Risk/Financial tabs) and other
 * buildSnapshot() additions that older stored snapshots don't have.
 *
 * Run from project root:  node rebuild-snapshots-2025.js
 */

require('./backend/node_modules/dotenv').config({ path: './.env' });

// buildSnapshot() reads BC_FY_START once at module load to filter postingDate.
// It defaults to 2026-01-01 (current FY), which would produce an empty/invalid
// range for 2025 dates — override it before requiring snapshot-builder.
process.env.BC_FY_START = '2025-01-01';

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
    "SELECT snapshot_date FROM snapshots WHERE snapshot_date >= '2025-01-01' AND snapshot_date < '2026-01-01' ORDER BY snapshot_date ASC"
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
