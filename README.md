# Kifiya CEO Financial Dashboard

Executive dashboard for Kifiya Financial Technology. The **backend** connects to **Microsoft Dynamics 365 Business Central**, stores daily snapshots in SQLite, and serves a React slideshow UI.

## Project structure

```
kifiya-executive-dashboard/
├── backend/           Express API, BC sync, SQLite, JWT auth
├── frontend/          React + Vite + Tailwind + Recharts
├── data/              SQLite DB + local archive copies (gitignored)
├── docs/              Deployment and operations guides
└── legacy/v1-static/  Old no-build dashboard (reference only)
```

## Quick start

**Prerequisites:** Node.js 18+, server must reach Business Central (VPN/LAN)

```bash
npm run setup

cp backend/.env.example backend/.env
# Set JWT_SECRET, GROQ_KEY, and BC_* credentials

npm run seed
npm run migrate-archives   # one-time: import existing data/archives/*.json

npm run build
npm start
# → http://localhost:4000
```

### Development

```bash
npm run dev:backend      # API on :4000 (starts BC sync scheduler)
npm run dev:frontend     # Vite on :5173 (proxies /api → backend)
```

Set `SNAPSHOT_ON_STARTUP=false` in `backend/.env` only if you do not want a BC pull on every server start.

On every start the backend automatically:
1. Seeds default users if the database has none
2. Pulls the latest snapshot from Business Central (when configured)
3. Falls back to `data/archives/*.json` if BC is unreachable and the DB is empty

## Docker (production)

Secrets stay **outside the image** — inject via `backend/.env` at runtime.

```bash
cp backend/.env.docker.example backend/.env   # or use your existing backend/.env
# Fill JWT_SECRET, GROQ_KEY, BC_* — never commit this file

docker compose up -d --build
# → http://localhost:4000
```

The container must reach Business Central (`BC_BASE`). If BC is on the office LAN, run on a host with VPN access or use `network_mode: host` in `docker-compose.yml` (Linux).

Data persists in the `dashboard-data` volume (`/app/data` — SQLite + archives).

```bash
docker compose logs -f dashboard
docker compose down
```

## Architecture

```
Business Central (OData)
        ↓  backend services (scheduled + on-demand)
SQLite (data/kifiya.db)
        ↓
React SPA (served by Express)
```

The backend syncs automatically via cron (default: 7 AM & 1 PM EAT). Logged-in users can also trigger a sync from the refresh button or `POST /api/snapshots/sync`.

## Documentation

| Guide | Description |
|-------|-------------|
| [docs/deployment.md](docs/deployment.md) | Production deployment |
| [docs/scheduling.md](docs/scheduling.md) | Automatic sync schedule |
| [docs/changelog.md](docs/changelog.md) | Version history |

## Security checklist

- [ ] Set `JWT_SECRET` in `backend/.env`
- [ ] Change default passwords in `backend/seed-users.js`, then `npm run seed`
- [ ] Use a read-only BC web service account
- [ ] Deploy backend on a host with BC network access
