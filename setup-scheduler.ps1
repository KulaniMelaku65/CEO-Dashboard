# ================================================================
# Kifiya CEO Dashboard — Task Scheduler Setup
# Run this ONCE on the server (10.254.99.143) as Administrator.
# It registers a scheduled task that runs snapshot.js at 7 AM
# and 1 PM every day to keep the dashboard data fresh.
# ================================================================

# EDIT THIS to match where the project lives on the server:
$projectDir = "C:\CEO Dashboard"

# Create logs folder if it doesn't exist
New-Item -ItemType Directory -Force "$projectDir\logs" | Out-Null

$action = New-ScheduledTaskAction `
  -Execute "cmd.exe" `
  -Argument "/c run-snapshot.bat" `
  -WorkingDirectory $projectDir

$trigger7am  = New-ScheduledTaskTrigger -Daily -At "07:00AM"
$trigger1pm  = New-ScheduledTaskTrigger -Daily -At "01:00PM"

$settings = New-ScheduledTaskSettingsSet `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 10) `
  -RestartCount 2 `
  -RestartInterval (New-TimeSpan -Minutes 5) `
  -StartWhenAvailable

Register-ScheduledTask `
  -TaskName   "Kifiya Dashboard — Daily Snapshot" `
  -TaskPath   "\Kifiya\" `
  -Action     $action `
  -Trigger    $trigger7am, $trigger1pm `
  -Settings   $settings `
  -RunLevel   Highest `
  -Description "Fetches BC data and updates the CEO Dashboard. Logs to $projectDir\logs\snapshot.log" `
  -Force

Write-Host ""
Write-Host "Scheduled task created. Runs at 7:00 AM and 1:00 PM daily." -ForegroundColor Green
Write-Host "Logs: $projectDir\logs\snapshot.log" -ForegroundColor Cyan
Write-Host ""
Write-Host "To run it immediately: Start-ScheduledTask -TaskName 'Kifiya Dashboard — Daily Snapshot' -TaskPath '\Kifiya\'"
