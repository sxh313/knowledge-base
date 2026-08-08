# ============================================
# Auto-deploy: watch file changes, commit & push
# Usage: .\auto-deploy.ps1
# Press Ctrl+C to stop
# ============================================

Set-Location "$PSScriptRoot"

$interval = 10
$lastHash = ""

Write-Host "[auto-deploy] Watching for changes every $interval seconds... (Ctrl+C to stop)" -ForegroundColor Cyan
Write-Host "[auto-deploy] Directory: $(Get-Location)" -ForegroundColor Gray
Write-Host ""

while ($true) {
    Start-Sleep -Seconds $interval

    # Clean lock file
    if (Test-Path ".git\index.lock") {
        Remove-Item ".git\index.lock" -Force -ErrorAction SilentlyContinue
    }

    $status = git status -s 2>&1

    if ($status -and $status.ToString().Trim()) {
        $currentHash = $status | Out-String | ForEach-Object { $_.GetHashCode() }

        if ($currentHash -ne $lastHash) {
            $lastHash = $currentHash
            $time = Get-Date -Format "HH:mm:ss"
            Write-Host "[$time] Changes detected, committing..." -ForegroundColor Yellow

            git add -A 2>&1 | Out-Null
            $msg = "auto: $(Get-Date -Format 'yyyy-MM-dd HH:mm') auto commit"
            git commit -m $msg 2>&1 | Out-Null

            $push = git push origin HEAD 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Host "[$time] Pushed to GitHub OK" -ForegroundColor Green
            } else {
                Write-Host "[$time] Push FAILED:" -ForegroundColor Red
                Write-Host $push -ForegroundColor Red
            }
            Write-Host ""
        }
    }
}