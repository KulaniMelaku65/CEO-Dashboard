// Exports all snapshots from local SQLite as individual JSON files
// into data/archives/ — then run `npm run migrate-archives` on the server.
//
// Usage: cd backend && node ../export-snapshots.js

const fs   = require('fs');
const path = require('path');
const db   = require('./backend/db');

const outDir = path.join(__dirname, '..', 'data', 'archives');
fs.mkdirSync(outDir, { recursive: true });

const rows = db.prepare('SELECT snapshot_date, data FROM snapshots ORDER BY snapshot_date').all();
console.log(`Exporting ${rows.length} snapshots to data/archives/ ...`);

rows.forEach(row => {
  const file = path.join(outDir, `${row.snapshot_date}.json`);
  const payload = typeof row.data === 'string' ? row.data : JSON.stringify(row.data);
  fs.writeFileSync(file, payload, 'utf8');
  console.log('  wrote', `${row.snapshot_date}.json`);
});

console.log(`\nDone. Send the data/archives/ folder to the deployment team.`);
console.log(`On the server, put the files in data/archives/ and run: npm run migrate-archives`);
