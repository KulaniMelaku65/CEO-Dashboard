// Add or update users in the database.
// Edit the passwords below, then run:  cd backend && node seed-users.js
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db     = require('./db');

const USERS = [
  { username: 'munir',  password: 'Kifiya@CEO1',   full_name: 'Munir Duri',    title: 'Founder & CEO' },
  { username: 'kulani', password: 'Kifiya@Admin2',  full_name: 'Kulani Melaku', title: 'Administrator' },
  { username: 'alazar', password: 'Kifiya@Admin3',  full_name: 'Alazar Negesu', title: 'Administrator' }
];

const upsert = db.prepare(
  `INSERT INTO users (username, password_hash, full_name, title)
   VALUES (?, ?, ?, ?)
   ON CONFLICT(username) DO UPDATE SET
     password_hash = excluded.password_hash,
     full_name     = excluded.full_name,
     title         = excluded.title`
);

(async () => {
  console.log('Seeding users…');
  for (const u of USERS) {
    const hash = await bcrypt.hash(u.password, 12);
    upsert.run(u.username, hash, u.full_name, u.title);
    console.log('  ✓', u.username);
  }
  console.log('Done. Change the passwords in this file before going live.');
})();
