const db = require('../db');

// Must run after requireAuth (needs req.user already set from the verified JWT).
// Reads is_admin fresh from the DB rather than trusting the JWT claim, so revoking
// admin access takes effect on the very next request instead of waiting out the
// 8-hour token expiry.
module.exports = function requireAdmin(req, res, next) {
  const row = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.user?.id);
  if (!row?.is_admin) return res.status(403).json({ error: 'Admin access required.' });
  next();
};
