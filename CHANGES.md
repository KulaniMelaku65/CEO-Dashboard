# CEO Dashboard — Refactor Summary
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
# 1. Install backend dependencies
cd backend
npm install

# 2. Create backend/.env
copy .env.example .env
# Open .env and fill in JWT_SECRET, SERVICE_KEY, GROQ_KEY
# Generate JWT_SECRET:  node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"
# Generate SERVICE_KEY: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 3. (Optional) Change default passwords in seed-users.js before running
node seed-users.js

# 4. Import existing archive JSON files into the database (one-time)
node migrate-archives.js

# 5. Start the server
node server.js
# → http://localhost:4000
```

For `snapshot.js` (on the BC data collector PC), add to root `.env`:
```
BACKEND_URL=http://your-server-ip:4000
SERVICE_KEY=same_value_as_backend_env
```

---

## Pending Before Go-Live

- [ ] Generate and set `JWT_SECRET` and `SERVICE_KEY` in `backend/.env`
- [ ] Set `GROQ_KEY` in `backend/.env`
- [ ] Change default user passwords in `seed-users.js` (munir, kulani, alazar)
- [ ] Run `npm install` in `backend/`
- [ ] Run `node seed-users.js`
- [ ] Run `node migrate-archives.js`
- [ ] Add `BACKEND_URL` + `SERVICE_KEY` to root `.env` for `snapshot.js`
- [ ] Rotate BC credentials (ask BC admin to regenerate TestESS Web Service Access Key)
- [ ] Rotate GROQ API key at console.groq.com (old key appeared in git history)
- [ ] On the server: configure nginx `auth_basic` as an extra layer of protection

---

## Security Notes

- `backend/.env` is gitignored — never commit it
- `data/` is gitignored — database file stays off git
- `snapshot.js` is gitignored — contains BC credentials
- Old GROQ key and BC credentials appeared in early git commits — **rotate both**
- httpOnly cookies mean the JWT cannot be stolen via XSS
