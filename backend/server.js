require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const path = require('path');

const authRoutes      = require('./routes/auth');
const snapshotRoutes  = require('./routes/snapshots');
const aiRoutes        = require('./routes/ai');

const app = express();

// Security headers (disable CSP so inline scripts in index.html work)
app.use(helmet({ contentSecurityPolicy: false }));

// CORS — allow frontend origin (same host in prod; add localhost during dev)
const origins = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
if (origins.length) {
  app.use(cors({ origin: origins, credentials: true }));
}

app.use(express.json({ limit: '10mb' })); // snapshots are large JSON blobs
app.use(cookieParser());

// Strict rate limit on auth routes to prevent brute-force
app.use('/api/auth', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many attempts — try again in 15 minutes.' }
}));

app.use('/api/auth',      authRoutes);
app.use('/api/snapshots', snapshotRoutes);
app.use('/api/ai',        aiRoutes);

// Serve the frontend static files
const frontendDir = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendDir));
app.get('*', (_req, res) => res.sendFile(path.join(frontendDir, 'index.html')));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Kifiya Dashboard running on http://localhost:${PORT}`));
