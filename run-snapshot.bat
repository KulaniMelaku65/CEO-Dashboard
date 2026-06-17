@echo off
REM Kifiya CEO Dashboard — Daily Snapshot Runner
REM Task Scheduler runs this twice a day (7 AM and 1 PM).
cd /d "%~dp0"
node snapshot.js >> logs\snapshot.log 2>&1
