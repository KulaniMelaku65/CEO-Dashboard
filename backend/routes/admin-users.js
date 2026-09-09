const router      = require('express').Router();
const bcrypt      = require('bcryptjs');
const crypto      = require('crypto');
const db          = require('../db');
const requireAuth = require('../middleware/auth');
const requireAdmin = require('../middleware/requireAdmin');

// 12 chars from an unambiguous alphabet (no 0/O/1/l) — used for Reset Password only.
// User creation takes an admin-chosen username/password directly (see POST / below) —
// the admin sends both to the person manually, since email sending isn't wired up yet.
function generatePassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  const bytes = crypto.randomBytes(12);
  return Array.from(bytes).map(b => chars[b % chars.length]).join('');
}

const getPageIds = userId =>
  db.prepare('SELECT page_id FROM user_page_access WHERE user_id = ?').all(userId).map(r => r.page_id);

const setPageIds = db.transaction((userId, pageIds) => {
  db.prepare('DELETE FROM user_page_access WHERE user_id = ?').run(userId);
  const ins = db.prepare('INSERT INTO user_page_access (user_id, page_id) VALUES (?, ?)');
  (pageIds || []).forEach(id => ins.run(userId, id));
});

const shapeUser = (u) => ({
  id: u.id, username: u.username, email: u.email, name: u.full_name, title: u.title,
  isAdmin: !!u.is_admin, mustChangePassword: !!u.must_change_password, createdAt: u.created_at,
  pageIds: getPageIds(u.id)
});

router.use(requireAuth, requireAdmin);

// GET /api/admin/users
router.get('/', (_req, res) => {
  try {
    const users = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
    res.json(users.map(shapeUser));
  } catch (e) {
    console.error('[admin/users]', e.message);
    res.status(500).json({ error: 'Database error.' });
  }
});

// POST /api/admin/users — create a viewer with an admin-chosen username and password.
// The admin sends both to the person manually (email, Slack, in person) — email sending
// isn't wired up yet. must_change_password is still forced, so whatever password is set
// here only works for the one first login.
router.post('/', async (req, res) => {
  const { name, email, username, password, title, isAdmin, pageIds } = req.body || {};
  if (!name || !email) return res.status(400).json({ error: 'Name and email are required.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email address.' });
  const cleanUsername = String(username || '').toLowerCase().trim();
  if (!/^[a-z0-9._-]{3,32}$/.test(cleanUsername))
    return res.status(400).json({ error: 'Username must be 3-32 characters: letters, numbers, dot, underscore, or hyphen.' });
  if (!password || String(password).length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  try {
    // email has no DB-level UNIQUE constraint — it was added via ALTER TABLE onto a
    // table with existing rows, which SQLite can't retrofit a uniqueness constraint
    // onto directly — so uniqueness is enforced here instead (username still has one).
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email))
      return res.status(409).json({ error: 'A user with that email already exists.' });
    if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(cleanUsername))
      return res.status(409).json({ error: 'That username is already taken.' });
    const hash = await bcrypt.hash(String(password), 12);
    const info = db.prepare(
      `INSERT INTO users (username, password_hash, full_name, title, email, is_admin, must_change_password)
       VALUES (?, ?, ?, ?, ?, ?, 1)`
    ).run(cleanUsername, hash, name, title || null, email, isAdmin ? 1 : 0);
    setPageIds(info.lastInsertRowid, pageIds || []);
    const created = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(shapeUser(created));
  } catch (e) {
    console.error('[admin/users create]', e.message);
    const dup = /UNIQUE/.test(e.message);
    res.status(dup ? 409 : 500).json({ error: dup ? 'That username or email is already in use.' : 'Server error.' });
  }
});

// PUT /api/admin/users/:id — update profile fields and/or replace page access.
// Pass only the fields being changed; page access is replaced wholesale when pageIds
// is provided (this is what each toggle click in the admin UI sends).
router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const { name, email, title, isAdmin, pageIds } = req.body || {};
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    if (email != null && email !== user.email) {
      const dup = db.prepare('SELECT 1 FROM users WHERE email = ? AND id != ?').get(email, id);
      if (dup) return res.status(409).json({ error: 'A user with that email already exists.' });
    }
    db.prepare('UPDATE users SET full_name = ?, email = ?, title = ?, is_admin = ? WHERE id = ?').run(
      name  != null ? name  : user.full_name,
      email != null ? email : user.email,
      title != null ? title : user.title,
      isAdmin != null ? (isAdmin ? 1 : 0) : user.is_admin,
      id
    );
    if (pageIds != null) setPageIds(id, pageIds);
    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    res.json(shapeUser(updated));
  } catch (e) {
    console.error('[admin/users update]', e.message);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/users/:id/reset-password — regenerate a default password (locked
// out, forgot it, etc.) — shown once on-screen, same as at creation.
router.post('/:id/reset-password', async (req, res) => {
  const id = Number(req.params.id);
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    const password = generatePassword();
    const hash = await bcrypt.hash(password, 12);
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?').run(hash, id);
    res.json({ ok: true, generatedPassword: password });
  } catch (e) {
    console.error('[admin/users reset-password]', e.message);
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/admin/users/:id
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: "You can't delete your own account." });
  try {
    db.prepare('DELETE FROM user_page_access WHERE user_id = ?').run(id);
    const info = db.prepare('DELETE FROM users WHERE id = ?').run(id);
    if (info.changes === 0) return res.status(404).json({ error: 'User not found.' });
    res.json({ ok: true });
  } catch (e) {
    console.error('[admin/users delete]', e.message);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
