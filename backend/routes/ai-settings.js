const router       = require('express').Router();
const db           = require('../db');
const requireAuth  = require('../middleware/auth');
const requireAdmin = require('../middleware/requireAdmin');

const PROVIDER_IDS = ['gemini', 'openai', 'groq', 'claude'];

const getActiveProvider = () =>
  db.prepare("SELECT value FROM app_settings WHERE key = 'ai_active_provider'").get()?.value || null;

// GET /api/ai-settings — which providers have a DB key configured (never the key itself)
// plus which one is active. Any authenticated user can read this (it's just status, not
// secrets), same visibility level as the chat endpoint itself.
router.get('/', requireAuth, (_req, res) => {
  const rows = db.prepare('SELECT provider, model, updated_at FROM ai_provider_keys').all();
  const configured = Object.fromEntries(rows.map(r => [r.provider, { model: r.model || null, updatedAt: r.updated_at }]));
  res.json({
    providers: PROVIDER_IDS.map(id => ({
      id,
      configured: !!configured[id],
      model: configured[id]?.model || null,
      updatedAt: configured[id]?.updatedAt || null,
    })),
    activeProvider: getActiveProvider(),
  });
});

router.use(requireAuth, requireAdmin);

// PUT /api/ai-settings/:provider — set/update a provider's API key (and optional model override)
router.put('/:provider', (req, res) => {
  const { provider } = req.params;
  if (!PROVIDER_IDS.includes(provider)) return res.status(400).json({ error: 'Unknown provider.' });

  const { apiKey, model } = req.body || {};
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim())
    return res.status(400).json({ error: 'apiKey is required.' });

  db.prepare(`
    INSERT INTO ai_provider_keys (provider, api_key, model, updated_at, updated_by)
    VALUES (?, ?, ?, datetime('now'), ?)
    ON CONFLICT(provider) DO UPDATE SET
      api_key = excluded.api_key, model = excluded.model,
      updated_at = excluded.updated_at, updated_by = excluded.updated_by
  `).run(provider, apiKey.trim(), model?.trim() || null, req.user.username);

  res.json({ ok: true });
});

// DELETE /api/ai-settings/:provider — remove a provider's stored key (falls back to .env again)
router.delete('/:provider', (req, res) => {
  const { provider } = req.params;
  db.prepare('DELETE FROM ai_provider_keys WHERE provider = ?').run(provider);
  res.json({ ok: true });
});

// PUT /api/ai-settings/active/:provider — force which provider the chat endpoint uses
router.put('/active/:provider', (req, res) => {
  const { provider } = req.params;
  if (!PROVIDER_IDS.includes(provider) && provider !== 'auto')
    return res.status(400).json({ error: 'Unknown provider.' });

  const value = provider === 'auto' ? null : provider;
  db.prepare(`
    INSERT INTO app_settings (key, value, updated_at, updated_by)
    VALUES ('ai_active_provider', ?, datetime('now'), ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by
  `).run(value, req.user.username);

  res.json({ ok: true });
});

module.exports = router;
