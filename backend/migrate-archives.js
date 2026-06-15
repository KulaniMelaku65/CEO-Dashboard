// One-time migration: imports existing archive/*.json files into SQLite.
// Run from the backend/ folder:  node migrate-archives.js
require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const db   = require('./db');

const ARCHIVE_DIR = path.join(__dirname, '..', 'archive');

if (!fs.existsSync(ARCHIVE_DIR)) {
  console.log('No archive/ folder found — nothing to migrate.');
  process.exit(0);
}

const files = fs.readdirSync(ARCHIVE_DIR)
  .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
  .sort();

console.log(`Found ${files.length} archive files — importing into SQLite…`);

const insert = db.prepare(
  `INSERT INTO snapshots (snapshot_date, data)
   VALUES (?, ?)
   ON CONFLICT(snapshot_date) DO NOTHING`
);

let ok = 0, fail = 0;
for (const file of files) {
  const date = file.replace('.json', '');
  try {
    const content = fs.readFileSync(path.join(ARCHIVE_DIR, file), 'utf8');
    JSON.parse(content); // validate it's real JSON before inserting
    insert.run(date, content);
    ok++;
    process.stdout.write(`  ✓ ${date}\r`);
  } catch (e) {
    console.error(`\n  ✗ ${date}: ${e.message}`);
    fail++;
  }
}
console.log(`\nDone. Imported: ${ok}  Failed: ${fail}`);
console.log(`Database: ${process.env.DB_PATH || '../data/kifiya.db'}`);
