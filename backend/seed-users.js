// Run once (or any time you need to add/update users):
//   cd backend && node seed-users.js
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db     = require('./db');

const USERS = [
  { username: 'munir',  password: 'Kifiya@CEO1',   full_name: 'Munir Duri',    title: 'Founder & CEO' },
  { username: 'kulani', password: 'Kifiya@Admin2',  full_name: 'Kulani Melaku', title: 'Administrator' },
  { username: 'alazar', password: 'Kifiya@Admin3',  full_name: 'Alazar Negesu', title: 'Administrator' }
];

(async () => {
  console.log('Seeding users…');
  for (const u of USERS) {
    const hash = await bcrypt.hash(u.password, 12);
    await db.query(
      `INSERT INTO users (username, password_hash, full_name, title)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (username) DO UPDATE
         SET password_hash = EXCLUDED.password_hash,
             full_name     = EXCLUDED.full_name,
             title         = EXCLUDED.title`,
      [u.username, hash, u.full_name, u.title]
    );
    console.log('  ✓', u.username);
  }
  console.log('Done — change the passwords above before going live.');
  await db.end();
})();
