# Kifiya CEO Dashboard — How to run it with real ERP data

The dashboard reads `data.js`. The snapshot script fills `data.js` with live
figures pulled from Business Central. Run the snapshot, open the dashboard.

## One-time setup
1. Make sure you're on the VPN/LAN (so 10.253.99.143 is reachable).
2. `cd snapshot`
3. `cp .env.example .env`  then edit `.env`:
   - set `BC_USER` and `BC_KEY` to a read-only BC user + Web Service Access Key.
4. `npm install`   (installs one dependency: dotenv)

## Generate a fresh snapshot
```
cd snapshot
node snapshot.js
```
It prints a summary like:
```
fetched: actuals 1234 rows, budget 210 rows
Revenue  812M (budget 730M)
EBITDA   289M
...
```
and rewrites `../data.js`.

## View the dashboard
Open `index.html` in a browser. The status dot turns green ("ERP snapshot")
and every tab shows the real figures as of the snapshot time.

## Keep it fresh
See `SCHEDULING.md` — schedule `node snapshot.js` (Task Scheduler / cron)
to run a couple of times a day on the VPN/LAN machine.

## Reading the snapshot output (sanity checks)
- `actuals 0 rows` → the FY date filter or postingDate is off.
- `budget 0 rows`  → BUDGET_NAME in snapshot.js doesn't match BC (it's set to '20.1').
- Revenue looks too big → likely intercompany/elimination accounts inside
  5000–5999; tell your developer and we can exclude them.
- EBITDA should tie to your M-MGT-RPT account schedule for the same period.

## If a run fails
`data.js` is left untouched, so the dashboard keeps showing the last good
snapshot. Most common cause: not on VPN at run time.
