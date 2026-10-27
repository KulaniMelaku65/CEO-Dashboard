const router       = require('express').Router();
const db           = require('../db');
const requireAuth  = require('../middleware/auth');
const requireAdmin = require('../middleware/requireAdmin');

// GET /api/page-filter-settings — the enabled page ids. Read by every logged-in user
// (not just admins) since each page needs this to decide whether to render its filter
// bar, same as pageIds on the user object itself.
router.get('/', requireAuth, (_req, res) => {
  try {
    const rows = db.prepare('SELECT page_id FROM page_filter_settings WHERE enabled = 1').all();
    res.json(rows.map(r => r.page_id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/page-filter-settings/:pageId  { enabled: boolean } — admin-only toggle.
router.put('/:pageId', requireAuth, requireAdmin, (req, res) => {
  try {
    const { pageId } = req.params;
    const enabled = req.body?.enabled ? 1 : 0;
    db.prepare(`
      INSERT INTO page_filter_settings (page_id, enabled, updated_at, updated_by)
      VALUES (?, ?, datetime('now'), ?)
      ON CONFLICT(page_id) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at, updated_by = excluded.updated_by
    `).run(pageId, enabled, req.user?.username || null);
    res.json({ ok: true, pageId, enabled: !!enabled });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
