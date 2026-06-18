# Legacy v1 static dashboard

These files powered the original **no-build** dashboard (plain HTML + Chart.js + `data.js`).

The active app is now **React + Express + SQLite** in `frontend/` and `backend/`.

| File | Purpose |
|------|---------|
| `app.js` | Chart rendering for v1 |
| `data.js` | Last auto-generated snapshot (v1 format) |
| `index_legacy.html` | Original dashboard shell |
| `sample-shapes.json` | JSON schema reference for BC → dashboard mapping |

Do not use these for new deployments. Kept for reference only.
