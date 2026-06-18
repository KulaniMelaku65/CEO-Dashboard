# Kifiya Executive Dashboard — Hosting & Operations Guide

## Table of Contents
1. [Architecture Overview](#architecture)
2. [Self-Hosting on Your Own Server](#self-hosting)
3. [Daily Data Updates](#daily-updates)
4. [User Management](#user-management)
5. [Historical Data & Backfill](#historical-data)
6. [Troubleshooting](#troubleshooting)

---

## 1. Architecture Overview <a name="architecture"></a>

The dashboard is a **static web application** — no backend server or database is needed to run it. Here is how the pieces fit together:

```
[Business Central OData]
         │
         │  (internal network / VPN only)
         ▼
   [ snapshot.js ]  ← runs on a machine with BC access
         │
         ├──► data.js          (today's live snapshot)
         └──► archive/YYYY-MM-DD.json  (one file per day)
                    │
                    ▼
         [ Web Server (IIS / nginx) ]
                    │
                    ▼
            [ Browser / Dashboard ]
```

### Key files

| File | Purpose | In Git? |
|---|---|---|
| `index.html` | Dashboard UI | Yes |
| `data.js` | Latest data snapshot (auto-generated) | Yes |
| `snapshot.js` | Fetches data from BC and writes data.js | Yes |
| `config.js` | API keys (GROQ, etc.) | **NO — never commit** |
| `users.js` | Login credentials | **NO — never commit** |
| `archive/YYYY-MM-DD.json` | Historical snapshots | Yes |
| `refresh-and-deploy.bat` | Daily update script (Windows) | Yes |
| `.env` | BC credentials for snapshot.js | **NO — never commit** |

---

## 2. Self-Hosting on Your Own Server <a name="self-hosting"></a>

### Prerequisites

- Windows Server 2016+ (or Ubuntu 20.04+)
- The server must be on the **same internal network as Business Central** (or connected via VPN) — this is required for `snapshot.js` to fetch data from `10.253.99.143:7048`
- **Node.js 18 or later** — download from https://nodejs.org
- A web server to serve static files (IIS on Windows, or nginx on Linux)

---

### Option A — Windows Server with IIS

#### Step 1: Copy the project files

Copy the entire project folder to the server. A good location is:
```
C:\inetpub\wwwroot\kifiya-dashboard\
```

You can do this via shared network drive, SCP, or simply copy from your machine.

#### Step 2: Install Node.js dependencies

Open a terminal in the project folder and run:
```
npm install
```

#### Step 3: Create config.js on the server

Create `config.js` in the project folder (this file is not in Git — you must create it manually on each server):
```js
window.DASHBOARD_CONFIG = {
  GROQ_KEY: 'your-groq-api-key-here'
};
```

#### Step 4: Create users.js on the server

Create `users.js` in the project folder (also not in Git):
```js
window.DASHBOARD_USERS = [
  { username: 'munir',   password: 'YourPassword', name: 'Munir Duri',    title: 'Founder & CEO' },
  { username: 'kulani',  password: 'YourPassword', name: 'Kulani Melaku', title: 'Administrator' }
];
```

#### Step 5: Create .env in the project folder

```
BC_BASE=http://10.253.99.143:7048/ERP/ODataV4
BC_COMPANY=KIFIYA FINANCIAL TECHNOLOGY
BC_USER=TestESS
BC_KEY=,hB|4346
BC_ALLOW_SELF_SIGNED=false
```

#### Step 6: Test the snapshot

Open a terminal in the project folder and run:
```
node snapshot.js
```
You should see it fetch data from BC and write `data.js`. If it fails, check that the server has network access to `10.253.99.143:7048`.

#### Step 7: Set up IIS

1. Open **IIS Manager**
2. Right-click **Sites** → **Add Website**
   - Site name: `KifiyaDashboard`
   - Physical path: `C:\inetpub\wwwroot\kifiya-dashboard`
   - Port: `80` (or `443` if you have an SSL certificate)
3. Click **OK**
4. Make sure the **Default Document** includes `index.html`
5. Open a browser and go to `http://your-server-ip/` — the dashboard should load

> **SSL (HTTPS):** If you have a company domain and SSL certificate, bind it to this site in IIS. Contact your IT team to set this up.

---

### Option B — Linux Server with nginx

#### Step 1: Install Node.js
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

#### Step 2: Copy project files
```bash
sudo mkdir -p /var/www/kifiya-dashboard
# Copy files from your machine:
scp -r /path/to/CEO\ Dashboard/* user@your-server:/var/www/kifiya-dashboard/
```

#### Step 3: Install dependencies
```bash
cd /var/www/kifiya-dashboard
npm install
```

#### Step 4: Create config.js, users.js, and .env (same content as Windows steps above)

#### Step 5: Install and configure nginx
```bash
sudo apt install nginx
sudo nano /etc/nginx/sites-available/kifiya-dashboard
```

Paste this configuration:
```nginx
server {
    listen 80;
    server_name your-domain-or-ip;

    root /var/www/kifiya-dashboard;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Enable and start:
```bash
sudo ln -s /etc/nginx/sites-available/kifiya-dashboard /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 3. Daily Data Updates <a name="daily-updates"></a>

The dashboard data is a **snapshot** — it does not update automatically by itself. You must run `snapshot.js` on a schedule to refresh it.

### How it works

Running `node snapshot.js` does two things:
1. Overwrites `data.js` with today's latest figures from Business Central
2. Saves a copy to `archive/YYYY-MM-DD.json` for historical viewing

The web server then serves the updated `data.js` on the next page load.

---

### Option A — Windows Task Scheduler (recommended for Windows Server)

1. Open **Task Scheduler** → **Create Basic Task**
2. Name: `Kifiya Dashboard Daily Refresh`
3. Trigger: **Daily** at **7:00 AM** (before business hours)
4. Action: **Start a program**
   - Program: `C:\Windows\System32\cmd.exe`
   - Arguments: `/c "cd /d C:\inetpub\wwwroot\kifiya-dashboard && node snapshot.js >> refresh.log 2>&1"`
5. Click **Finish**

To verify it works, right-click the task → **Run** and check `refresh.log` in the project folder.

---

### Option B — Linux cron job (recommended for Linux Server)

Open the crontab editor:
```bash
crontab -e
```

Add this line to run every day at 7:00 AM:
```
0 7 * * * cd /var/www/kifiya-dashboard && node snapshot.js >> refresh.log 2>&1
```

Check the log to verify:
```bash
tail -f /var/www/kifiya-dashboard/refresh.log
```

---

### Updating after code changes

When you push new changes to the dashboard code, you need to copy the updated files to the server. Options:

**Manual (simplest):** Copy updated files via network share or SCP each time you make a change.

**Git pull on server (recommended):** Set up Git on the server and pull changes:
```bash
cd /var/www/kifiya-dashboard
git pull origin main
```
Then copy `config.js`, `users.js`, and `.env` manually since they are not in Git.

---

## 4. User Management <a name="user-management"></a>

Users are defined in `users.js` on the server. This file is **never committed to Git** and must be managed manually on each server.

To add or remove a user, edit `users.js` directly on the server:

```js
window.DASHBOARD_USERS = [
  { username: 'munir',   password: 'StrongPassword1', name: 'Munir Duri',    title: 'Founder & CEO' },
  { username: 'kulani',  password: 'StrongPassword2', name: 'Kulani Melaku', title: 'Administrator' },
  { username: 'alazar',  password: 'StrongPassword3', name: 'Alazar Negesu', title: 'Administrator' },
  // Add more users here
];
```

No restart is needed — the change takes effect on the next page load.

> **Security note:** Change all passwords from the default `Kifiya@2026` before going live on a company domain.

---

## 5. Historical Data & Backfill <a name="historical-data"></a>

### How historical snapshots work

Every time `snapshot.js` runs, it saves a copy of that day's data to:
```
archive/YYYY-MM-DD.json
```

The dashboard's date and month pickers load these files directly. No server-side logic is needed.

### Generating archives for past dates (backfill)

If you need to generate archives for dates before you started running the daily schedule, use `backfill.ps1`:

```powershell
# Open PowerShell in the project folder and run:
.\backfill.ps1
```

This loops through every day from `2024-01-01` to today, skipping any dates that already have an archive file. It is safe to run multiple times — it resumes where it left off.

> **Note:** The server running backfill.ps1 must have access to Business Central. Run it from a machine on the internal network.

### Changing the backfill start date

Open `backfill.ps1` and edit line 8:
```powershell
$start = [datetime]"2024-01-01"   # change this date
```

---

## 6. Troubleshooting <a name="troubleshooting"></a>

| Problem | Likely cause | Fix |
|---|---|---|
| Dashboard shows no data | `data.js` missing or empty | Run `node snapshot.js` on a machine with BC access |
| "No snapshot found" on date picker | Archive file missing for that date | Run `.\backfill.ps1` to generate missing archives |
| AI chatbot not responding | GROQ_KEY missing or wrong in `config.js` | Check `config.js` has the correct key |
| Login not working | `users.js` missing from server | Copy `users.js` to the server manually |
| snapshot.js fails with "BC 401" | BC credentials wrong | Check `.env` — `BC_USER` and `BC_KEY` |
| snapshot.js fails with "ECONNREFUSED" | Server cannot reach BC | Check the server is on the internal network or VPN |
| snapshot.js fails with "BC 404" | Wrong company name | Check `BC_COMPANY` in `.env` matches exactly |
| Page loads but charts are empty | Browser blocked `data.js` | Open browser console (F12) and check for errors |

### Checking logs

```bash
# View the last 50 lines of the refresh log
tail -50 refresh.log         # Linux
Get-Content refresh.log -Tail 50   # Windows PowerShell
```

### Manual refresh (run any time)

```bash
# Windows
cd C:\inetpub\wwwroot\kifiya-dashboard
node snapshot.js

# Linux
cd /var/www/kifiya-dashboard
node snapshot.js
```
