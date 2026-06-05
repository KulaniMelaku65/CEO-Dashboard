# Keeping the snapshot fresh

The dashboard shows whatever was in `data.js` at the last run. To refresh
automatically, schedule `snapshot.js` on the VPN/LAN machine.

## Windows (Task Scheduler) — most likely your case
1. Create a .bat file next to snapshot.js, e.g. `run-snapshot.bat`:
   ```
   cd /d C:\path\to\kifiya-dashboard\snapshot
   node snapshot.js >> snapshot.log 2>&1
   ```
2. Open Task Scheduler -> Create Task.
3. Triggers: add two (or as many as you want), e.g. Daily 06:00 and 12:00.
4. Action: Start a program -> the .bat file.
5. Tick "Run whether user is logged on or not" if it's on a server.
   (The machine must be on VPN/LAN at run time so it can reach BC.)

## Linux/Mac (cron)
```
0 6,12 * * *  cd /path/to/kifiya-dashboard/snapshot && /usr/bin/node snapshot.js >> snapshot.log 2>&1
```

## Publishing the dashboard
After each run, `data.js` updates in place. If the dashboard is hosted
(e.g. behind enterprise.kifiya.dev as a static page, or on a shared drive),
make sure the host serves the folder where snapshot.js writes `data.js`,
or add a copy step to the .bat/cron to push data.js to the web root.

## If a run fails
The script exits without touching `data.js`, so the dashboard keeps showing
the last good snapshot rather than breaking. Check `snapshot.log`. Most
common cause: the machine wasn't on VPN at run time.
