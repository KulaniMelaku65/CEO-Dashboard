# Kifiya CEO Financial Dashboard

A self-contained, Power BI–free CEO dashboard. Branded for Kifiya Financial Technology.
Works **today** with embedded demo data; flips to **live Microsoft Dynamics 365** by editing one file.

## What's inside
```
index.html          The dashboard (open directly in a browser)
config.js           ← THE ONLY FILE YOU EDIT to go demo → live
data.js             Demo data + the exact JSON shapes live data must match
app.js              Rendering & charts (no build step, pure JS + Chart.js CDN)
proxy/              Node server that bridges browser ↔ Dynamics 365
```

## Tabs (matches your spec)
- **Budget vs Actual** — Revenue, Cost of Sales, Expenses, GP, EBITDA (KPIs + bars + variance + table)
- **Budget Overview** — allocation by business unit, month-to-month, YTD utilization
- **Cash Flow** — collections per bank, daily bank balances, other inflows, debt utilisation, operating outflows, CAPEX utilisation
- **Reports** — balance-sheet margins & ratios, P&L income/expense bridge, monthly management summary

## Use it RIGHT NOW (0 setup)
Just open `index.html` in any browser. It runs on realistic demo numbers so you have
something to present this afternoon. Edit the numbers in `data.js` if you want them closer to reality.

## Going live with Business Central ON-PREM (why you need the proxy)
A browser page **cannot** call BC OData directly: cross-origin (CORS) calls are blocked,
and you must never put the BC username / web access key in client-side JS. The `proxy/`
server solves this — it runs on a machine that can reach your BC server, holds the
credentials, queries OData, and returns clean JSON the dashboard reads.

**On-prem is simpler than cloud:** no Azure AD, no OAuth. Your server uses
NavUserPassword (Basic Auth) — username + a Web Service Access Key, over HTTPS,
against your own server (e.g. `https://bc-server:7048/BC/ODataV4/`). The proxy and
dashboard just need network line-of-sight to the BC server (same LAN / VPN).

### Steps
1. **In BC**: open the Users page → pick the integration user → under "Web Service
   Access" generate a **Web Service Access Key** (this is the password the proxy uses,
   NOT the Windows login password). Copy it.
2. **In BC**: search the "Web Services" page → publish the pages/queries you need →
   note each Service Name (that's what goes in the OData URL).
3. `cd proxy && cp .env.example .env` → fill in `BC_BASE`, `BC_COMPANY`, `BC_USER`,
   `BC_KEY`. Set `BC_ALLOW_SELF_SIGNED=true` only if your server uses a self-signed cert.
4. `npm install && npm start`. Then hit `http://localhost:8080/probe` — if it returns
   your company list, auth + connectivity are working before you touch any GL mapping.
5. In each `app.get('/api/...')` handler in `server.js`, replace the `SAMPLE.*` return
   with a real `bc("<YourServiceName>", "?$select=...")` call and map your fields into
   the documented output keys. Shapes are in `data.js` and `proxy/sample-shapes.json`.
6. In `config.js` set `MODE: "live"` and `PROXY_BASE` to the proxy URL. Done.

> Ask IT for the exact host, instance name, and OData port (7048 is the default).

If a live fetch ever fails, the dashboard automatically falls back to demo data and
shows "Live failed — demo" in the status indicator, so it never breaks in front of the CEO.

## Notes
- Auto-refresh every 5 min (change `REFRESH_SECONDS` in config.js).
- All figures ETB millions; logo & colors approximate Kifiya brand (navy + gold).
  Swap the inline SVG in `index.html` for the official logo file if you have it.
```
```
