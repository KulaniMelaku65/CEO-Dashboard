const router      = require('express').Router();
const db          = require('../db');
const requireAuth = require('../middleware/auth');

function serviceKeyAuth(req, res, next) {
  const key = req.headers['x-service-key'];
  if (!key || key !== process.env.SERVICE_KEY)
    return res.status(401).json({ error: 'Invalid service key.' });
  next();
}

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
    if (!row) return res.status(404).json({ error: 'No snapshots yet.' });
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

// POST /api/snapshots — upsert a snapshot (called by snapshot.js using SERVICE_KEY)
router.post('/', serviceKeyAuth, (req, res) => {
  const { date, data } = req.body || {};
  if (!date || !data)
    return res.status(400).json({ error: 'Body must contain { date, data }.' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    return res.status(400).json({ error: 'Invalid date — use YYYY-MM-DD.' });
  try {
    db.prepare(
      `INSERT INTO snapshots (snapshot_date, data)
       VALUES (?, ?)
       ON CONFLICT(snapshot_date) DO UPDATE SET data = excluded.data, created_at = datetime('now')`
    ).run(date, JSON.stringify(data));
    res.json({ ok: true, date });
  } catch (e) {
    console.error('Snapshot save error:', e.message);
    res.status(500).json({ error: 'Database error.' });
  }
});

module.exports = router;
