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

/** Create default users when the users table is empty. */
async function ensureUsers() {
  const { c } = db.prepare('SELECT COUNT(*) as c FROM users').get();
  if (c > 0) return 0;

  console.log('[startup] Seeding default users…');
  for (const u of DEFAULT_USERS) {
    const hash = await bcrypt.hash(u.password, 12);
    upsert.run(u.username, hash, u.full_name, u.title);
    console.log('  ✓', u.username);
  }
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
