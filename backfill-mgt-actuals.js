/**
 * One-time migration: patch budgetActual.lines actuals in all stored snapshots
 * to match the MGT-based values already stored in reports.management.
 *
 * Run from project root:  node backfill-mgt-actuals.js
 */

const db   = require('./backend/db');
const path = require('path');
const fs   = require('fs');

const ARCHIVE_DIR = path.join(__dirname, 'data', 'archives');

const snapshots = db.prepare(
  'SELECT snapshot_date, data FROM snapshots ORDER BY snapshot_date ASC'
).all();

const update = db.prepare(
  'UPDATE snapshots SET data = ?, created_at = datetime(\'now\') WHERE snapshot_date = ?'
);

let updated = 0, skipped = 0;

for (const snap of snapshots) {
  const data  = JSON.parse(snap.data);
  const mgmt  = data.reports?.management;
  const lines = data.budgetActual?.lines;

  if (!mgmt || !lines) { skipped++; continue; }

  const find = metric => {
    const row = mgmt.find(m => m.metric === metric);
    return row?.ytd ?? null;
  };

  const revYTD  = find('Total Revenue');
  const cosYTD  = find('Cost of Sales');
  const opexYTD = find('Total OPEX');
  const gpYTD   = find('Gross Profit');
  const ebYTD   = find('EBITDA');

  if (revYTD === null && gpYTD === null) { skipped++; continue; }

  const before = lines[3]?.actual;

  if (revYTD  !== null && lines[0]) lines[0].actual = revYTD;
  if (cosYTD  !== null && lines[1]) lines[1].actual = cosYTD;
  if (opexYTD !== null && lines[2]) lines[2].actual = opexYTD;
  if (gpYTD   !== null && lines[3]) lines[3].actual = gpYTD;
  if (ebYTD   !== null && lines[4]) lines[4].actual = ebYTD;


  const newData = JSON.stringify(data);

  update.run(newData, snap.snapshot_date);

  const archivePath = path.join(ARCHIVE_DIR, `${snap.snapshot_date}.json`);
  if (fs.existsSync(archivePath)) {
    fs.writeFileSync(archivePath, JSON.stringify(data, null, 2));
  }

  console.log(`  ${snap.snapshot_date}  GP: ${before} → ${lines[3]?.actual}`);
  updated++;
}

console.log(`\nDone — ${updated} updated, ${skipped} skipped (no management data).`);
