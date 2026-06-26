const express    = require('express');
const router     = express.Router();
const requireAuth = require('../middleware/auth');

const BASE = process.env.SUPERSET_BASE || 'http://213.55.97.58:8088';

router.get('/:chartId', requireAuth, async (req, res) => {
  const chartId = parseInt(req.params.chartId, 10);
  if (!Number.isInteger(chartId) || chartId < 1)
    return res.status(400).json({ error: 'Invalid chart ID.' });

  const controller  = new AbortController();
  const timeout     = setTimeout(() => controller.abort(), 30000);

  try {
    const r = await fetch(`${BASE}/api/v1/chart/${chartId}/data/`, {
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!r.ok) return res.status(r.status).json({ error: 'Superset error' });
    const json = await r.json();
    res.json(json);
  } catch (e) {
    clearTimeout(timeout);
    res.status(502).json({ error: e.message });
  }
});

module.exports = router;
