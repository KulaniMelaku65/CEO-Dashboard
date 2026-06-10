@echo off
:: Kifiya CEO Dashboard — auto refresh & deploy
:: Runs snapshot.js (fetches fresh BC data) then deploys to Netlify.
:: Schedule this via Windows Task Scheduler to run daily (e.g. 7:00 AM).

cd /d "c:\Users\kmelaku\Documents\CEO Dashboard"

echo [%DATE% %TIME%] Starting snapshot...
node snapshot.js >> refresh.log 2>&1
if %errorlevel% neq 0 (
    echo [%DATE% %TIME%] snapshot.js FAILED — not deploying >> refresh.log
    exit /b 1
)

echo [%DATE% %TIME%] Deploying to Netlify... >> refresh.log
netlify deploy --prod --dir . >> refresh.log 2>&1
echo [%DATE% %TIME%] Done. >> refresh.log
