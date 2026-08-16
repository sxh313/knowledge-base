# Knowledge Base Electron packaging script.
# Usage: powershell -ExecutionPolicy Bypass -File .\deploy-exe.ps1

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
if ($env:RUNNER_TEMP) {
    $buildOutput = Join-Path $env:RUNNER_TEMP 'kb-release'
} else {
    $buildOutput = Join-Path $env:TEMP 'kb-release'
}
Set-Location $root

Write-Host "Packaging Knowledge Base for Windows..." -ForegroundColor Cyan

# 1. Clean previous outputs.
Write-Host "[1/6] Cleaning previous outputs..." -ForegroundColor Yellow
Remove-Item -Recurse -Force "$root\release" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force $buildOutput -ErrorAction SilentlyContinue

# 2. Validate the PNG icon.
Write-Host "[2/6] Validating icon..." -ForegroundColor Yellow
node "$root\scripts\gen-icon.cjs"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 3. Use mirrors locally and official downloads on GitHub runners.
Write-Host "[3/6] Configuring download source..." -ForegroundColor Yellow
if (-not $env:CI) {
    $env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
    $env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://npmmirror.com/mirrors/electron-builder-binaries/"
}

# 4. Always rebuild the Electron-specific frontend.
Write-Host "[4/6] Building Electron frontend..." -ForegroundColor Yellow
$env:BUILD_TARGET = "electron"
npx tsc -b
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npx vite build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 5. Package in the system temp directory to avoid workspace file locks.
Write-Host "[5/6] Building installer..." -ForegroundColor Yellow
npx electron-builder --win --publish never --config.directories.output="$buildOutput"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 6. Copy outputs back to release/.
Write-Host "[6/6] Copying outputs to release/..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path "$root\release" | Out-Null
Copy-Item "$buildOutput\*" "$root\release" -Recurse -Force

Write-Host ""
Write-Host "Packaging complete." -ForegroundColor Green
$setup = Get-ChildItem "$root\release\*.exe" | Where-Object { $_.Name -like "*Setup*" } | Select-Object -First 1
if ($setup) {
    Write-Host "Installer: $($setup.FullName) ($([math]::Round($setup.Length/1MB,1)) MB)" -ForegroundColor Green
}
Write-Host "Portable directory: $root\release\win-unpacked" -ForegroundColor Green
