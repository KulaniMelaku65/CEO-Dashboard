const bcrypt = require('bcryptjs');
const db     = require('../db');

const DEFAULT_USERS = [
  { username: 'munir',  password: 'Kifiya@CEO1',  full_name: 'Munir Duri',    title: 'Founder & CEO' },
  { username: 'kulani', password: 'Kifiya@Admin2', full_name: 'Kulani Melaku', title: 'Administrator' },
  { username: 'alazar', password: 'Kifiya@Admin3', full_name: 'Alazar Negesu', title: 'Administrator' },
  { username: 'admin',  password: 'Kifiya@Admin4', full_name: 'Administrator', title: 'Administrator' }
];

const upsert = db.prepare(
  `INSERT INTO users (username, password_hash, full_name, title)
   VALUES (?, ?, ?, ?)
   ON CONFLICT(username) DO UPDATE SET
     password_hash = excluded.password_hash,
     full_name     = excluded.full_name,
     title         = excluded.title`
);

// Pages every pre-existing account could already see before per-user permissions
// existed (App.jsx's old global VISIBLE_IDS) — backfilled once per user below so
// nobody's sidebar goes blank the first time this ships.
const LEGACY_VISIBLE_PAGE_IDS = ['hr-summary', 'hr-page-review', 'department-overrides'];
const DEFAULT_ADMIN_USERNAMES = new Set(['kulani', 'admin']);

// One-time-per-user backfill. Runs over EVERY existing account, not just the 4 known
// seeded ones — a deployment's users table may hold accounts created some other way
// (e.g. directly on a live instance), and skipping those would silently lock them out
// of every page the moment per-user permissions ship. Only touches a user who has
// neither any page grants nor admin rights yet, so it never overwrites a deliberate
// choice made later from the Admin page (e.g. someone revoking a legacy user's access).
function backfillLegacyAccess() {
  const hasAccess = db.prepare('SELECT 1 FROM user_page_access WHERE user_id = ?');
  const grant = db.prepare('INSERT OR IGNORE INTO user_page_access (user_id, page_id) VALUES (?, ?)');
  const setAdmin = db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?');

  db.prepare('SELECT id, username, is_admin FROM users').all().forEach(row => {
    if (!row.is_admin && !hasAccess.get(row.id)) {
      LEGACY_VISIBLE_PAGE_IDS.forEach(pageId => grant.run(row.id, pageId));
    }
    if (DEFAULT_ADMIN_USERNAMES.has(row.username) && !row.is_admin) {
      setAdmin.run(row.id);
    }
  });
}

/** Create default users when the users table is empty. */
async function ensureUsers() {
  const { c } = db.prepare('SELECT COUNT(*) as c FROM users').get();
  if (c > 0) { backfillLegacyAccess(); return 0; }

  console.log('[startup] Seeding default users…');
  for (const u of DEFAULT_USERS) {
    const hash = await bcrypt.hash(u.password, 12);
    upsert.run(u.username, hash, u.full_name, u.title);
    console.log('  ✓', u.username);
  }
  backfillLegacyAccess();
  return DEFAULT_USERS.length;
}

/** Force re-seed all default users (CLI: npm run seed). */
async function seedAllUsers() {
  console.log('Seeding users…');
  for (const u of DEFAULT_USERS) {
    const hash = await bcrypt.hash(u.password, 12);
    upsert.run(u.username, hash, u.full_name, u.title);
    console.log('  ✓', u.username);
  }
  console.log('Done. Change the passwords in services/ensure-users.js before going live.');
}

module.exports = { ensureUsers, seedAllUsers, DEFAULT_USERS };
