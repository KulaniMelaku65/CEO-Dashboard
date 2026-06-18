# Automatic data sync

The backend pulls data from Business Central on a schedule — no external scripts required.

## Default schedule

Configured in `backend/.env`:

```env
SNAPSHOT_CRON=0 4,10 * * *
```

This runs at **04:00 and 10:00 UTC** (= 7 AM and 1 PM EAT).

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `SNAPSHOT_CRON` | `0 4,10 * * *` | Cron expression (UTC) |
| `SNAPSHOT_SCHEDULER` | enabled | Set to `false` to disable |
| `SNAPSHOT_ON_STARTUP` | off | Set to `true` to sync when server starts |

## Manual sync

**From the UI:** click the refresh button (pulls latest from BC when viewing "Latest").

**From the API** (authenticated):

```bash
curl -X POST http://localhost:4000/api/snapshots/sync \
  -H 'Content-Type: application/json' \
  --cookie "token=..." 
```

**Historical backfill:**

```bash
curl -X POST http://localhost:4000/api/snapshots/sync \
  -H 'Content-Type: application/json' \
  -d '{"date":"2025-12-31"}' \
  --cookie "token=..."
```

## Requirements

The backend server must have network access to the BC OData endpoint configured in `BC_BASE`.
