// Triggers the backend's own buildSnapshot() for each historical date.
// Run from project root: node run-historical-sync.js
// Backend must be running on http://localhost:4000

const BASE = 'http://localhost:4000';

const DATES = [
  '2026-01-31', '2026-02-28', '2026-03-31',
  '2026-04-30', '2026-05-31',
];

async function run() {
  // 1. Log in to get session cookie
  console.log('Logging in…');
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'kulani', password: 'Kifiya@Admin2' }),
    redirect: 'manual',
  });
  const cookie = loginRes.headers.get('set-cookie');
  if (!loginRes.ok || !cookie) {
    console.error('Login failed:', loginRes.status, await loginRes.text());
    process.exit(1);
  }
  console.log('Logged in.\n');

  // 2. Sync each historical date
  for (const date of DATES) {
    process.stdout.write(`Syncing ${date}… `);
    const r = await fetch(`${BASE}/api/snapshots/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ date }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      console.log(`Revenue ${j.revenue}M  EBITDA ${j.ebitda}M  ✓`);
    } else {
      console.log(`FAILED (${r.status}):`, j.error || JSON.stringify(j));
    }
  }
}

run().catch(e => { console.error(e.message); process.exit(1); });
