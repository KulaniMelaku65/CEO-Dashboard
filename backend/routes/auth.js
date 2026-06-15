const router      = require('express').Router();
const bcrypt      = require('bcryptjs');
const jwt         = require('jsonwebtoken');
const db          = require('../db');
const requireAuth = require('../middleware/auth');

const COOKIE = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge:   8 * 60 * 60 * 1000   // 8-hour working-day session
};

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password are required.' });
  try {
    const { rows } = await db.query(
      'SELECT * FROM users WHERE username = $1',
      [String(username).toLowerCase().trim()]
    );
    const user = rows[0];
    const valid = user && await bcrypt.compare(String(password), user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Incorrect username or password.' });

    const token = jwt.sign(
      { id: user.id, username: user.username, name: user.full_name, title: user.title },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );
    res.cookie('token', token, COOKIE);
    res.json({ name: user.full_name, title: user.title });
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

// GET /api/auth/me — check current session
router.get('/me', requireAuth, (req, res) => {
  res.json({ username: req.user.username, name: req.user.name, title: req.user.title });
});

module.exports = router;
