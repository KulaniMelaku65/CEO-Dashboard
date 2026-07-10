const router      = require('express').Router();
const rateLimit   = require('express-rate-limit');
const db          = require('../db');
const requireAuth = require('../middleware/auth');
const { syncSnapshot, getSyncStatus, persistSnapshot } = require('../services/snapshot-sync');

// POST /api/snapshots — ingest pre-built snapshot from external snapshot.js runner
// Authenticated via x-service-key header (same key in root .env and backend/.env)
router.post('/', (req, res) => {
  const key = req.headers['x-service-key'];
  if (!key || key !== process.env.SERVICE_KEY)
    return res.status(403).json({ error: 'Invalid service key.' });
  const { date, data } = req.body || {};
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return res.status(400).json({ error: 'date (YYYY-MM-DD) is required.' });
  if (!data || typeof data !== 'object')
    return res.status(400).json({ error: 'data object is required.' });
  try {
    persistSnapshot(date, data);
    console.log(`[ingest] Snapshot saved for ${date}`);
    res.json({ ok: true, date });
  } catch (e) {
    console.error('[ingest]', e.message);
    res.status(500).json({ error: e.message });
  }
});

const syncLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  message: { error: 'Too many sync requests — try again in a few minutes.' }
});

// GET /api/snapshots/status — sync health (auth required)
router.get('/status', requireAuth, (_req, res) => {
  res.json(getSyncStatus());
});

// POST /api/snapshots/sync — pull from BC now (auth required)
// Body: { date?: "YYYY-MM-DD" }  (omit for today)
router.post('/sync', requireAuth, syncLimiter, async (req, res) => {
  const { date } = req.body || {};
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return res.status(400).json({ error: 'Invalid date — use YYYY-MM-DD.' });
  try {
    const summary = await syncSnapshot(date);
    res.json({ ok: true, ...summary });
  } catch (e) {
    console.error('[sync]', e.message);
    res.status(502).json({ error: e.message });
  }
});

// GET /api/snapshots/dates — list all available dates, newest first
router.get('/dates', requireAuth, (req, res) => {
  try {
    const rows = db.prepare('SELECT snapshot_date FROM snapshots ORDER BY snapshot_date DESC').all();
    res.json(rows.map(r => r.snapshot_date));
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: 'Database error.' });
  }
});

// GET /api/snapshots/latest
router.get('/latest', requireAuth, (req, res) => {
  try {
    const row = db.prepare('SELECT data FROM snapshots ORDER BY snapshot_date DESC LIMIT 1').get();
    if (!row) return res.status(404).json({ error: 'No snapshots yet — waiting for BC sync.' });
    res.json(JSON.parse(row.data));
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: 'Database error.' });
  }
});

// GET /api/snapshots/:date  (YYYY-MM-DD)
router.get('/:date', requireAuth, (req, res) => {
  const { date } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    return res.status(400).json({ error: 'Invalid date — use YYYY-MM-DD.' });
  try {
    const row = db.prepare('SELECT data FROM snapshots WHERE snapshot_date = ?').get(date);
    if (!row) return res.status(404).json({ error: `No snapshot for ${date}.` });
    res.json(JSON.parse(row.data));
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: 'Database error.' });
  }
});

module.exports = router;
