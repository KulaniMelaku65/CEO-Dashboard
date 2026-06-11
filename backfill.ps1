# Kifiya Executive Dashboard — Historical Backfill
# Runs snapshot.js for every day from 2026-01-01 to today.
# Skips dates that already have an archive file (resumable if interrupted).
# Usage: right-click → "Run with PowerShell"  OR  in terminal: .\backfill.ps1

Set-Location "c:\Users\kmelaku\Documents\CEO Dashboard"

$start   = [datetime]"2026-01-01"
$end     = [datetime]::Today
$total   = ($end - $start).Days + 1
$done    = 0
$skipped = 0
$failed  = 0

Write-Host ""
Write-Host "Kifiya Historical Backfill" -ForegroundColor Cyan
Write-Host "Dates: $($start.ToString('yyyy-MM-dd')) to $($end.ToString('yyyy-MM-dd')) ($total days)" -ForegroundColor Cyan
Write-Host ""

$current = $start
while ($current -le $end) {
    $dateStr = $current.ToString("yyyy-MM-dd")
    $done++

    # Skip if archive already exists
    if (Test-Path "archive\$dateStr.json") {
        Write-Host "  [$done/$total] $dateStr — already exists, skipping" -ForegroundColor DarkGray
        $skipped++
        $current = $current.AddDays(1)
        continue
    }

    Write-Host "  [$done/$total] $dateStr — fetching..." -NoNewline

    $output = node snapshot.js $dateStr 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host " saved" -ForegroundColor Green
    } else {
        Write-Host " FAILED" -ForegroundColor Red
        Write-Host "    $output" -ForegroundColor DarkRed
        $failed++
    }

    $current = $current.AddDays(1)
}

Write-Host ""
Write-Host "Done!" -ForegroundColor Cyan
Write-Host "  Fetched : $($done - $skipped - $failed)"
Write-Host "  Skipped : $skipped (already existed)"
Write-Host "  Failed  : $failed"
Write-Host ""
Write-Host "Next step: push the archive files to git so the dashboard can use them:" -ForegroundColor Yellow
Write-Host "  git add archive/ && git commit -m 'Add historical archive snapshots' && git push origin main" -ForegroundColor Yellow
Write-Host ""
