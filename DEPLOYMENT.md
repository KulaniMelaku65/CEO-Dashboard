# Kifiya CEO Dashboard — Deployment Guide

## Overview

The dashboard is a monorepo with two parts:

| Part | Folder | What it does |
|------|--------|--------------|
| **Backend** | `backend/` | Express API + SQLite database (stores all dashboard snapshots) |
| **Frontend** | `frontend/` | React app (built into `frontend/dist/`, served by the backend) |
| **Snapshot script** | `snapshot.js` (root) | Fetches data from Business Central and saves it to the backend |

The backend serves the built frontend as static files — so in production **only the backend needs to run**. There is no separate frontend server.

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

### Step 2 — Create environment files

**Root `.env`** (for the snapshot script — needs BC credentials):

```env
BC_BASE=http://10.253.99.143:7048/ERP/ODataV4
BC_COMPANY=KIFIYA FINANCIAL TECHNOLOGY
BC_USER=<bc_username>
BC_KEY=<bc_password>
BC_ALLOW_SELF_SIGNED=true
BACKEND_URL=http://localhost:4000
SERVICE_KEY=<get this from the team>
```

**`backend/.env`** (for the API server):

```env
PORT=4000
NODE_ENV=development
DB_PATH=../data/kifiya.db
JWT_SECRET=<any long random string — generate with: node -e "console.log(require('crypto').randomBytes(64).toString('base64'))">
SERVICE_KEY=<same value as root .env SERVICE_KEY>
GROQ_KEY=<Groq API key — get from the team>
ALLOWED_ORIGINS=http://localhost:5173
```

> Ask Kulani or Alazar for the actual credential values. Do not commit either `.env` file to git.

### Step 3 — Install dependencies

```bash
npm install                    # root (snapshot script deps)
npm install --prefix backend   # backend deps
npm install --prefix frontend  # frontend deps
```

### Step 4 — Build the frontend

```bash
cd frontend && npm run build && cd ..
```

This creates `frontend/dist/` which the backend serves automatically.

### Step 5 — Seed the user accounts

```bash
cd backend && node seed-users.js && cd ..
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
cd backend && node server.js
```

Open **http://localhost:4000** in your browser. Log in with one of the accounts above.

### Step 7 — (Optional) Pull a fresh snapshot

If the database is empty or you want the latest BC data:

```bash
node snapshot.js
```

This fetches today's data from BC and saves it. The dashboard will show it immediately.

To load a specific past date:

```bash
node snapshot.js 2025-12-31
```

---

## Option B — Production deployment (via GitLab)

### What the deploying person needs to do

1. **Build the frontend** on the server:
   ```bash
   cd frontend && npm run build
   ```
   The built files land in `frontend/dist/`.

2. **Configure `backend/.env`** on the server:
   ```env
   PORT=4000
   NODE_ENV=production
   DB_PATH=../data/kifiya.db
   JWT_SECRET=<strong random secret>
   SERVICE_KEY=<shared secret — must match root .env>
   GROQ_KEY=<production Groq API key>
   ALLOWED_ORIGINS=https://<your-frontend-domain>
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

The backend serves both the API and the React frontend at the same port.

---

## Option C — Automated daily snapshots via GitLab CI/CD

The `.gitlab-ci.yml` in this repo runs `snapshot.js` on a schedule so the dashboard data stays fresh without any manual work.

### One-time setup in GitLab

**1. Add CI/CD Variables** (Settings → CI/CD → Variables)

Mark each one as **Protected** and **Masked**:

| Variable | Value |
|----------|-------|
| `BC_BASE` | `http://10.253.99.143:7048/ERP/ODataV4` |
| `BC_COMPANY` | `KIFIYA FINANCIAL TECHNOLOGY` |
| `BC_USER` | *(BC username)* |
| `BC_KEY` | *(BC password)* |
| `BC_ALLOW_SELF_SIGNED` | `true` |
| `SERVICE_KEY` | *(same as backend SERVICE_KEY)* |
| `BACKEND_URL` | `http://<backend-host>:<port>` ← **fill in when backend URL is confirmed** |

**2. Create Schedules** (CI/CD → Schedules)

| Name | Cron | Timezone | Branch |
|------|------|----------|--------|
| Morning snapshot | `0 4 * * *` | UTC (= 7:00 AM Addis Ababa) | `main` |
| Afternoon snapshot | `0 10 * * *` | UTC (= 1:00 PM Addis Ababa) | `main` |

**3. Confirm runner access**

The GitLab runner must be able to reach `10.253.99.143` (BC server). Runners on the internal `gitlab.kifiya.et` instance should have this access by default (both VPN and direct network work).

To test immediately without waiting for the schedule:
- Go to CI/CD → Schedules → click **Run** on either schedule

---

## Security checklist before going live

- [ ] Change all default passwords in `backend/seed-users.js` and re-run it
- [ ] Generate a new `JWT_SECRET` (never reuse across environments)
- [ ] Rotate the BC credentials (`BC_USER` / `BC_KEY`)
- [ ] Get a fresh Groq API key for production (`GROQ_KEY`)
- [ ] Set `ALLOWED_ORIGINS` in `backend/.env` to the exact production frontend URL
- [ ] Ensure `backend/.env` and root `.env` are never committed to git (already in `.gitignore`)
- [ ] Enable HTTPS on the production server (nginx reverse proxy recommended)

---

## Troubleshooting

**Dashboard shows no data / blank charts**
→ Run `node snapshot.js` manually to load today's data. Check the output for BC connection errors.

**"Cannot connect to backend" error in browser**
→ Ensure the backend is running (`node backend/server.js`) and `ALLOWED_ORIGINS` includes your frontend URL.

**Snapshot CI job fails**
→ Check that `BACKEND_URL` CI variable is set and reachable from the runner. Check runner logs in GitLab → CI/CD → Jobs.

**Forgot a password**
→ Edit the password in `backend/seed-users.js`, then re-run `cd backend && node seed-users.js`.
