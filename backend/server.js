require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');

const authRoutes      = require('./routes/auth');
const snapshotRoutes  = require('./routes/snapshots');
const aiRoutes        = require('./routes/ai');
const supersetRoutes  = require('./routes/superset');
const bcRoutes        = require('./routes/bc');
const deptOverrideRoutes = require('./routes/department-overrides');
const adminUserRoutes = require('./routes/admin-users');
const { startScheduler } = require('./services/scheduler');
const { runStartup }     = require('./services/startup');

const app = express();

// Security headers (CSP off — Vite build uses inline style chunks in dev)
app.use(helmet({ contentSecurityPolicy: false }));

// CORS — allow frontend origin (same host in prod; add localhost during dev)
const origins = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
if (origins.length) {
  app.use(cors({ origin: origins, credentials: true }));
}

app.use(express.json({ limit: '10mb' })); // snapshots are large JSON blobs
app.use(cookieParser());

app.use('/api/auth',      authRoutes);
app.use('/api/snapshots', snapshotRoutes);
app.use('/api/ai',        aiRoutes);
app.use('/api/superset',  supersetRoutes);
app.use('/api/bc',        bcRoutes);
app.use('/api/department-overrides', deptOverrideRoutes);
app.use('/api/admin/users', adminUserRoutes);

// Serve the built React frontend (run `cd frontend && npm run build` first)
const distDir = path.join(__dirname, '..', 'frontend', 'dist');
if (require('fs').existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
}

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Kifiya Dashboard running on http://localhost:${PORT}`);
  runStartup().catch(e => console.error('[startup] Failed:', e.message));
  startScheduler();
});

