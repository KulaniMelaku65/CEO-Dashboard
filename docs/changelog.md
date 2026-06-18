# CEO Dashboard — Changelog

## v3.0 — BC sync in backend (2026-06-18)

- All Business Central fetching moved into `backend/services/`
- Removed external `scripts/snapshot/` collector, `.bat`, `.ps1`, and GitLab snapshot CI
- Backend runs scheduled sync via `node-cron` + on-demand `POST /api/snapshots/sync`
- BC credentials live only in `backend/.env` (removed `SERVICE_KEY`)

---

## v2.1 — Repository restructure (2026-06-18)

- Moved ops scripts to `scripts/` (`snapshot/`, `migrate-archives.js`, scheduler helpers)
- Moved documentation to `docs/`
- Moved v1 static dashboard to `legacy/v1-static/`
- Historical JSON archives → `data/archives/` (gitignored; import via `npm run migrate-archives`)
- `snapshot.js` now POSTs to backend API instead of writing `data.js`
- Removed tracked `node_modules/`, `frontend/dist/`, and `archive/` from git
- Updated README and deployment guides for v2 layout

---

_Date: 2026-06-15_

---

## What Changed

### 1. Monorepo Structure
The project was reorganised into a proper frontend/backend separation:

```
CEO Dashboard/
├── frontend/
│   └── index.html          ← moved from root
├── backend/
│   ├── server.js           ← Express API
│   ├── db.js               ← SQLite connection + auto-schema
│   ├── seed-users.js       ← creates hashed-password users
│   ├── migrate-archives.js ← one-time import of archive/ → SQLite
│   ├── middleware/
│   │   └── auth.js         ← JWT cookie verification
│   ├── routes/
│   │   ├── auth.js         ← /api/auth (login, logout, me)
│   │   ├── snapshots.js    ← /api/snapshots (CRUD)
│   │   └── ai.js           ← /api/ai/chat (GROQ proxy)
│   ├── package.json
│   └── .env.example
├── data/
│   └── kifiya.db           ← SQLite file (gitignored, auto-created)
├── snapshot.js             ← BC data collector (gitignored)
├── package.json            ← root scripts (delegates to backend/)
└── .gitignore
```

---

### 2. Database — SQLite (no installation needed)
- Replaced all file-based `archive/*.json` storage with **SQLite** via `better-sqlite3`
- Database file lives at `data/kifiya.db` and is **gitignored**
- Schema is created automatically the first time the server starts — no manual setup
- Two tables: `users` and `snapshots`

---

### 3. Token-Based Auth (Frontend ↔ Backend)
- Login POSTs credentials to `POST /api/auth/login`
- Backend verifies password with **bcrypt**, creates a **JWT**, and sets it as an **httpOnly cookie** (JS cannot read it)
- Every frontend fetch uses `credentials: 'include'` so the browser sends the cookie automatically
- Backend `requireAuth` middleware reads the cookie and verifies the JWT on protected routes
- `checkSession()` runs on every page load — if cookie is valid, login screen is skipped
- **GROQ key** is now server-side only — it never reaches the browser

---

### 4. BPASS Collections Fix
`collectionsByBank` now reads from **GL actuals** (revenue accounts 5013–5026), not the bank ledger:

| GL Account | Bank |
|---|---|
| 5013 | BPASS CooP |
| 5014 | BPASS Bunna |
| 5015 | BPASS Enat |
| 5016 | BPASS Wegagen |
| 5017 | BPASS Amhara |
| 5026 | BPASS Zamzam |

Revenue posts as a **negative credit** in BC, so `Math.abs()` is applied before displaying.

---

### 5. Netlify Removed
Deleted: `netlify/` folder, `_redirects`, `.netlifyignore`. The app is now self-hosted via Express.

---

## Setup — First Run (do this once)

```powershell
npm run setup
copy backend\.env.example backend\.env
# Fill JWT_SECRET, GROQ_KEY, and BC_* credentials

npm run seed
npm run migrate-archives
npm run build
npm start
```

---

## Pending Before Go-Live

- [ ] Generate and set `JWT_SECRET` in `backend/.env`
- [ ] Set `GROQ_KEY` and BC credentials in `backend/.env`
- [ ] Change default user passwords in `seed-users.js`, then `npm run seed`
- [ ] Ensure backend server has network access to `BC_BASE`
- [ ] Rotate BC credentials and GROQ key if they appeared in git history

---

## Security Notes

- `backend/.env` is gitignored — never commit it
- `data/` is gitignored — database file stays off git
- BC credentials stay server-side only in `backend/.env`
- httpOnly cookies mean the JWT cannot be stolen via XSS
