// One-time migration: imports existing archive/*.json files into PostgreSQL.
// Run from the backend/ folder: node migrate-archives.js
require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const db   = require('./db');

const ARCHIVE_DIR = path.join(__dirname, '..', 'archive');

(async () => {
  if (!fs.existsSync(ARCHIVE_DIR)) {
    console.log('No archive/ folder found — nothing to migrate.');
    await db.end(); return;
  }
  const files = fs.readdirSync(ARCHIVE_DIR)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();

  console.log(`Found ${files.length} archive files — importing…`);
  let ok = 0, skip = 0, fail = 0;

  for (const file of files) {
    const date = file.replace('.json', '');
    try {
      const data = JSON.parse(fs.readFileSync(path.join(ARCHIVE_DIR, file), 'utf8'));
      await db.query(
        `INSERT INTO snapshots (snapshot_date, data)
         VALUES ($1, $2)
         ON CONFLICT (snapshot_date) DO NOTHING`,
        [date, data]
      );
      ok++;
      process.stdout.write(`  ✓ ${date}\r`);
    } catch (e) {
      console.error(`  ✗ ${date}: ${e.message}`);
      fail++;
    }
  }
  console.log(`\nDone. Imported: ${ok}  Skipped (already exist): ${skip}  Failed: ${fail}`);
  await db.end();
})();
