@echo off
:: Kifiya Executive Dashboard — auto refresh & deploy
:: Runs snapshot.js (fetches fresh BC data), deploys to Netlify,
:: and pushes code to GitHub + GitLab.
:: Schedule via Windows Task Scheduler to run daily (e.g. 7:00 AM).

cd /d "c:\Users\kmelaku\Documents\CEO Dashboard"

echo [%DATE% %TIME%] Starting snapshot... >> refresh.log
node snapshot.js >> refresh.log 2>&1
if %errorlevel% neq 0 (
    echo [%DATE% %TIME%] snapshot.js FAILED — aborting >> refresh.log
    exit /b 1
)

echo [%DATE% %TIME%] Deploying to Netlify... >> refresh.log
netlify deploy --prod --dir . >> refresh.log 2>&1

echo [%DATE% %TIME%] Pushing to GitHub... >> refresh.log
git push origin main >> refresh.log 2>&1

echo [%DATE% %TIME%] Pushing to GitLab (dashboard branch)... >> refresh.log
git push gitlab >> refresh.log 2>&1

echo [%DATE% %TIME%] Done. >> refresh.log
