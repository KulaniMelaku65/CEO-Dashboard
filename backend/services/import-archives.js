const fs   = require('fs');
const path = require('path');
const db   = require('../db');

// Scan both locations: data/archives/ (new, gitignored) and archive/ (root, committed seed data)
const ARCHIVE_DIRS = [
  path.join(__dirname, '..', '..', 'data', 'archives'),
  path.join(__dirname, '..', '..', 'archive'),
];

const insert = db.prepare(
  `INSERT INTO snapshots (snapshot_date, data)
   VALUES (?, ?)
   ON CONFLICT(snapshot_date) DO NOTHING`
);

function snapshotCount() {
  return db.prepare('SELECT COUNT(*) as c FROM snapshots').get().c;
}

/** Import archive JSON files from data/archives/ and archive/ into SQLite.
 *  data/archives/ takes precedence if the same date exists in both. */
function importArchives({ onlyIfEmpty = false } = {}) {
  if (onlyIfEmpty && snapshotCount() > 0) return 0;

  // Collect all dated files, deduplicating by filename (first dir wins)
  const seen = new Map();
  for (const dir of ARCHIVE_DIRS) {
    if (!fs.existsSync(dir)) continue;
    fs.readdirSync(dir)
      .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort()
      .forEach(f => { if (!seen.has(f)) seen.set(f, path.join(dir, f)); });
  }

  if (!seen.size) {
    console.log('[startup] No archive files found — skip archive import.');
    return 0;
  }

  console.log(`[startup] Importing ${seen.size} archive files…`);
  let ok = 0, fail = 0;

  for (const [file, filePath] of seen) {
    const date = file.replace('.json', '');
    try {
      const content = fs.readFileSync(filePath, 'utf8');
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
