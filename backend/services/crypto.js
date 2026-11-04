// AES-256-GCM encryption for secrets stored at rest in the SQLite DB (currently just
// ai_provider_keys.api_key — the AI provider API keys entered via Admin — Users & Access).
// Previously stored in plaintext; this is a dedicated helper so any future at-rest secret
// can reuse it instead of re-implementing crypto per table.
const crypto = require('crypto');

// Derives a dedicated 32-byte key via HKDF instead of using a secret directly as the AES
// key — domain-separates this from any other use of the same underlying secret (e.g.
// JWT_SECRET, reused below as a convenience fallback so this works with zero extra
// config) via the `info` label, so the two purposes stay cryptographically independent
// even though they trace back to the same root value. Prefer setting a dedicated
// AI_KEY_ENCRYPTION_SECRET in .env over relying on the JWT_SECRET fallback.
let _key = null;
function getKey() {
  if (_key) return _key;
  const secret = process.env.AI_KEY_ENCRYPTION_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('Neither AI_KEY_ENCRYPTION_SECRET nor JWT_SECRET is set — cannot encrypt/decrypt stored secrets.');
  _key = Buffer.from(crypto.hkdfSync('sha256', Buffer.from(secret, 'utf8'), Buffer.alloc(0), 'kifiya-dashboard:ai-provider-keys', 32));
  return _key;
}

// Returns "iv:authTag:ciphertext", all hex — self-contained, no separate column needed.
function encrypt(plaintext) {
  const iv = crypto.randomBytes(12); // 96-bit, the standard/recommended GCM IV size
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

function decrypt(payload) {
  const [ivHex, authTagHex, ciphertextHex] = String(payload || '').split(':');
  if (!ivHex || !authTagHex || !ciphertextHex) throw new Error('Malformed encrypted payload.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextHex, 'hex')), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt };
