# Kifiya CEO Dashboard — Deployment Guide

## Overview

The dashboard is a monorepo with two parts:

| Part | Folder | What it does |
|------|--------|--------------|
| **Backend** | `backend/` | Express API + SQLite database (stores all dashboard snapshots) |
| **Frontend** | `frontend/` | React app (built into `frontend/dist/`, served by the backend) |
| **BC sync** | `backend/services/` | Pulls data from Business Central (scheduled + on-demand) |

The backend serves the built frontend as static files — so in production **only the backend needs to run**. The server must have network access to Business Central.

---

## Option A — Run locally on your own PC (for testing)

### Prerequisites
- [Node.js 18+](https://nodejs.org)
- Git
- Network access to the BC server (VPN or direct)

### Step 1 — Clone the repo

```bash
git clone https://gitlab.kifiya.et/kifiya-dashboards/kifiya-executive-dashboard.git
cd kifiya-executive-dashboard
```

### Step 2 — Configure backend

Copy and edit `backend/.env`:

```env
PORT=4000
NODE_ENV=development
DB_PATH=../data/kifiya.db
JWT_SECRET=<generate with: node -e "console.log(require('crypto').randomBytes(64).toString('base64'))">
GROQ_KEY=<Groq API key>
ALLOWED_ORIGINS=http://localhost:5173

# Business Central — server must be on VPN/LAN
BC_BASE=http://your-bc-host:7048/ERP/ODataV4
BC_COMPANY=KIFIYA FINANCIAL TECHNOLOGY
BC_USER=<bc_web_service_user>
BC_KEY=<bc_web_service_key>
BC_ALLOW_SELF_SIGNED=true

# Optional: sync on server start (dev)
SNAPSHOT_ON_STARTUP=true
```

> Do not commit `backend/.env` to git.

### Step 3 — Install dependencies

```bash
npm run setup
```

### Step 4 — Build the frontend

```bash
npm run build
```

This creates `frontend/dist/` which the backend serves automatically.

### Step 5 — Seed the user accounts

```bash
npm run seed
npm run migrate-archives   # one-time: import data/archives/*.json
```

Default accounts created:

| Username | Password | Name |
|----------|----------|------|
| `munir` | `Kifiya@CEO1` | Munir Duri (CEO) |
| `kulani` | `Kifiya@Admin2` | Kulani Melaku |
| `alazar` | `Kifiya@Admin3` | Alazar Negesu |

> Change these passwords in `backend/seed-users.js` before going live, then re-run the script.

### Step 6 — Start the backend

```bash
npm start
```

Open **http://localhost:4000** in your browser. Log in with one of the accounts above.

### Step 7 — Pull data from Business Central

The backend syncs automatically on a schedule (default: 7 AM & 1 PM EAT). For an immediate pull:

- Click the **refresh** button in the dashboard UI, or
- Set `SNAPSHOT_ON_STARTUP=true` in `backend/.env` and restart the server

Historical backfill (authenticated API):

```bash
curl -X POST http://localhost:4000/api/snapshots/sync \
  -H 'Content-Type: application/json' \
  -d '{"date":"2025-12-31"}' \
  --cookie "token=<your-session-cookie>"
```

---

## Option B — Production deployment

### What the deploying person needs to do

1. **Build the frontend** on the server:
   ```bash
   cd frontend && npm run build
   ```
   The built files land in `frontend/dist/`.

2. **Configure `backend/.env`** on the server (must include BC credentials — server needs BC network access):
   ```env
   PORT=4000
   NODE_ENV=production
   DB_PATH=../data/kifiya.db
   JWT_SECRET=<strong random secret>
   GROQ_KEY=<production Groq API key>
   ALLOWED_ORIGINS=https://<your-frontend-domain>

   BC_BASE=http://<bc-host>:7048/ERP/ODataV4
   BC_COMPANY=KIFIYA FINANCIAL TECHNOLOGY
   BC_USER=<bc_web_service_user>
   BC_KEY=<bc_web_service_key>
   BC_ALLOW_SELF_SIGNED=true
   SNAPSHOT_CRON=0 4,10 * * *
   ```

3. **Install backend dependencies**:
   ```bash
   npm install --prefix backend --omit=dev
   ```

4. **Seed users** (first time only):
   ```bash
   cd backend && node seed-users.js
   ```

5. **Start the backend** (use PM2 or a Windows Service to keep it running):
   ```bash
   # With PM2 (recommended):
   npm install -g pm2
   pm2 start backend/server.js --name kifiya-dashboard
   pm2 save
   pm2 startup

   # Or simply (not recommended for production):
   cd backend && node server.js
   ```

The backend serves both the API and the React frontend at the same port. BC sync runs automatically via the built-in scheduler.

---

## Automated sync schedule

Configured in `backend/.env` via `SNAPSHOT_CRON` (default: twice daily). See [scheduling.md](scheduling.md).

The production server **must** be on the network that can reach the BC OData endpoint (`BC_BASE`).

---

## Security checklist before going live

- [ ] Change all default passwords in `backend/seed-users.js` and re-run it
- [ ] Generate a new `JWT_SECRET` (never reuse across environments)
- [ ] Rotate the BC credentials (`BC_USER` / `BC_KEY`)
- [ ] Get a fresh Groq API key for production (`GROQ_KEY`)
- [ ] Set `ALLOWED_ORIGINS` in `backend/.env` to the exact production frontend URL
- [ ] Ensure `backend/.env` is never committed to git (already in `.gitignore`)
- [ ] Enable HTTPS on the production server (nginx reverse proxy recommended)

---

## Troubleshooting

**Dashboard shows no data / blank charts**
→ Check BC credentials in `backend/.env`. Ensure the server can reach `BC_BASE`. Use the refresh button or check server logs for `[sync]` / `[scheduler]` messages.

**"Cannot connect to backend" error in browser**
→ Ensure the backend is running (`npm start`) and `ALLOWED_ORIGINS` includes your frontend URL.

**BC sync fails**
→ Verify VPN/LAN connectivity to BC. Check `BC_USER` / `BC_KEY` (web service access key, not Windows password).

**Forgot a password**
→ Edit the password in `backend/seed-users.js`, then re-run `cd backend && node seed-users.js`.
