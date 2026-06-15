const router      = require('express').Router();
const db          = require('../db');
const requireAuth = require('../middleware/auth');

// snapshot.js on the office PC authenticates with a shared service key (not a user JWT)
function serviceKeyAuth(req, res, next) {
  const key = req.headers['x-service-key'];
  if (!key || key !== process.env.SERVICE_KEY)
    return res.status(401).json({ error: 'Invalid service key.' });
  next();
}

// GET /api/snapshots/dates — list of all available dates, newest first
router.get('/dates', requireAuth, async (_req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT snapshot_date FROM snapshots ORDER BY snapshot_date DESC'
    );
    res.json(rows.map(r => r.snapshot_date.toISOString().slice(0, 10)));
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: 'Database error.' });
  }
});

// GET /api/snapshots/latest
router.get('/latest', requireAuth, async (_req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT data FROM snapshots ORDER BY snapshot_date DESC LIMIT 1'
    );
    if (!rows.length) return res.status(404).json({ error: 'No snapshots yet.' });
    res.json(rows[0].data);
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: 'Database error.' });
  }
});

// GET /api/snapshots/:date  (YYYY-MM-DD)
router.get('/:date', requireAuth, async (req, res) => {
  const { date } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    return res.status(400).json({ error: 'Invalid date — use YYYY-MM-DD.' });
  try {
    const { rows } = await db.query(
      'SELECT data FROM snapshots WHERE snapshot_date = $1', [date]
    );
    if (!rows.length) return res.status(404).json({ error: `No snapshot for ${date}.` });
    res.json(rows[0].data);
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: 'Database error.' });
  }
});

// POST /api/snapshots — save / overwrite a snapshot (called by snapshot.js via SERVICE_KEY)
router.post('/', serviceKeyAuth, async (req, res) => {
  const { date, data } = req.body || {};
  if (!date || !data)
    return res.status(400).json({ error: 'Body must contain { date, data }.' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    return res.status(400).json({ error: 'Invalid date — use YYYY-MM-DD.' });
  try {
    await db.query(
      `INSERT INTO snapshots (snapshot_date, data)
       VALUES ($1, $2)
       ON CONFLICT (snapshot_date) DO UPDATE SET data = EXCLUDED.data, created_at = NOW()`,
      [date, data]
    );
    res.json({ ok: true, date });
  } catch (e) {
    console.error('Snapshot save error:', e.message);
    res.status(500).json({ error: 'Database error.' });
  }
});

module.exports = router;
