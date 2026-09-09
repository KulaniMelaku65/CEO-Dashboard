const router      = require('express').Router();
const bcrypt      = require('bcryptjs');
const jwt         = require('jsonwebtoken');
const rateLimit   = require('express-rate-limit');
const db          = require('../db');
const requireAuth = require('../middleware/auth');

const COOKIE = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge:   8 * 60 * 60 * 1000   // 8-hour session
};

const getPageIds = userId =>
  db.prepare('SELECT page_id FROM user_page_access WHERE user_id = ?').all(userId).map(r => r.page_id);

const signToken = user => jwt.sign(
  { id: user.id, username: user.username, name: user.full_name, title: user.title, isAdmin: !!user.is_admin },
  process.env.JWT_SECRET,
  { expiresIn: '8h' }
);

// Rate limit login attempts only — not /me (hit on every page load/refresh to check the
// existing session) or /logout, which would otherwise share the same brute-force budget
// and get exhausted by normal browsing traffic rather than actual repeated login attempts.
// skipSuccessfulRequests means a correct login doesn't count against the limit either —
// only actual failed/incorrect attempts accumulate toward the 30-per-15-minutes cap.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  skipSuccessfulRequests: true,
  message: { error: 'Too many attempts — try again in 15 minutes.' }
});

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password are required.' });
  try {
    const user = db.prepare('SELECT * FROM users WHERE username = ?')
                   .get(String(username).toLowerCase().trim());
    const valid = user && await bcrypt.compare(String(password), user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Incorrect username or password.' });

    res.cookie('token', signToken(user), COOKIE);
    res.json({
      id: user.id,
      name: user.full_name,
      title: user.title,
      isAdmin: !!user.is_admin,
      mustChangePassword: !!user.must_change_password,
      pageIds: getPageIds(user.id)
    });
  } catch (e) {
    console.error('Login error:', e.message);
    res.status(500).json({ error: 'Server error — try again.' });
  }
});

// POST /api/auth/logout
router.post('/logout', (_req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

// GET /api/auth/me — check current session (called on every page load). isAdmin/
// mustChangePassword/pageIds are re-read from the DB rather than trusted from the JWT,
// since an admin can change any of these mid-session and the next reload should reflect
// it without forcing a re-login.
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) { res.clearCookie('token'); return res.status(401).json({ error: 'Account no longer exists.' }); }
  res.json({
    id: user.id,
    username: user.username,
    name: user.full_name,
    title: user.title,
    isAdmin: !!user.is_admin,
    mustChangePassword: !!user.must_change_password,
    pageIds: getPageIds(user.id)
  });
});

// POST /api/auth/change-password — used both for the forced first-login change and any
// voluntary later change. Always requires the current password, even on the forced
// first change (the user was told the default password, so they re-enter it here).
router.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword)
    return res.status(400).json({ error: 'Current and new password are required.' });
  if (String(newPassword).length < 8)
    return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(401).json({ error: 'Account no longer exists.' });
    const valid = await bcrypt.compare(String(currentPassword), user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect.' });

    const hash = await bcrypt.hash(String(newPassword), 12);
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(hash, user.id);

    const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    res.cookie('token', signToken(fresh), COOKIE);
    res.json({ ok: true });
  } catch (e) {
    console.error('Change-password error:', e.message);
    res.status(500).json({ error: 'Server error — try again.' });
  }
});

module.exports = router;
