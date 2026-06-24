const fs   = require('fs');
const path = require('path');
const db   = require('../db');

const ARCHIVE_DIR = path.join(__dirname, '..', '..', 'data', 'archives');

const insert = db.prepare(
  `INSERT INTO snapshots (snapshot_date, data)
   VALUES (?, ?)
   ON CONFLICT(snapshot_date) DO NOTHING`
);

function snapshotCount() {
  return db.prepare('SELECT COUNT(*) as c FROM snapshots').get().c;
}

/** Import data/archives/*.json into SQLite. Returns number of rows inserted. */
function importArchives({ onlyIfEmpty = false } = {}) {
  if (onlyIfEmpty && snapshotCount() > 0) return 0;

  if (!fs.existsSync(ARCHIVE_DIR)) {
    console.log('[startup] No data/archives/ folder — skip archive import.');
    return 0;
  }

  const files = fs.readdirSync(ARCHIVE_DIR)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();

  if (!files.length) return 0;

  console.log(`[startup] Importing ${files.length} archive files…`);
  let ok = 0, fail = 0;

  for (const file of files) {
    const date = file.replace('.json', '');
    try {
      const content = fs.readFileSync(path.join(ARCHIVE_DIR, file), 'utf8');
      JSON.parse(content);
      const result = insert.run(date, content);
      if (result.changes) ok++;
    } catch (e) {
      console.error(`  ✗ ${date}: ${e.message}`);
      fail++;
    }
  }

  console.log(`[startup] Archives imported: ${ok}  skipped/failed: ${fail}`);
  return ok;
}

module.exports = { importArchives, snapshotCount };
