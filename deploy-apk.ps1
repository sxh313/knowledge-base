# Knowledge Base Android APK build script.
# 目标:无论本机是否有安卓构建环境,构建完成后本地 release/ 都保留一份 APK。
#   - 本机有 JDK 21 + Android SDK → 本地直接构建(最快)
#   - 本机无环境 → 自动触发 GitHub Actions 云端构建,完成后下载 APK 到本地 release/
# Usage: powershell -ExecutionPolicy Bypass -File .\deploy-apk.ps1

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
Set-Location $root

Write-Host "Building Knowledge Base Android APK..." -ForegroundColor Cyan

# ---------- 1. 读取 .env.local 的同步配置 ----------
function Get-EnvValue($key) {
    $envFile = Join-Path $root '.env.local'
    if (-not (Test-Path $envFile)) { return '' }
    $line = Get-Content $envFile | Where-Object { $_ -match "^$key=" } | Select-Object -First 1
    if ($line) { return ($line -replace "^$key=", '').Trim() }
    return ''
}
$syncToken = Get-EnvValue 'VITE_SYNC_TOKEN'
$syncOwner = Get-EnvValue 'VITE_SYNC_OWNER'
if (-not $syncOwner) { $syncOwner = 'sxh313' }
$syncRepo = Get-EnvValue 'VITE_SYNC_REPO'
if (-not $syncRepo) { $syncRepo = 'knowledge-base' }

# ---------- 2. 检测本地安卓构建环境 ----------
function Test-Command($name) {
    return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}
$hasJava = Test-Command 'java'
$hasAndroidHome = [bool]$env:ANDROID_HOME -or [bool]$env:ANDROID_SDK_ROOT
$canBuildLocal = $hasJava -and $hasAndroidHome

if ($canBuildLocal) {
    Write-Host "[本地构建] 检测到 JDK + Android SDK,使用本地构建..." -ForegroundColor Green
    & "$root\scripts\build-apk-local.ps1"
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    exit 0
}

# ---------- 3. 本机无环境 → 云端构建 + 下载到本地 ----------
Write-Host "[云端构建] 本机未检测到 JDK/Android SDK,改用 GitHub Actions 云端构建并下载到本地..." -ForegroundColor Yellow
if (-not $syncToken) {
    Write-Host "错误:缺少 VITE_SYNC_TOKEN(.env.local),无法触发云端构建。" -ForegroundColor Red
    Write-Host "提示:本机未安装安卓构建环境。可安装 JDK 21 + Android SDK 后本地构建,或配置 VITE_SYNC_TOKEN 走云端构建。" -ForegroundColor Yellow
    exit 1
}

# 触发 workflow_dispatch
$headers = @{ Authorization = "token $syncToken"; Accept = 'application/vnd.github.v3+json' }
$dispatchBody = @{ ref = 'knowledge-base' } | ConvertTo-Json
Write-Host "[1/4] 触发 Android Build workflow..." -ForegroundColor Yellow
try {
    Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$syncOwner/$syncRepo/actions/workflows/android-build.yml/dispatches" -Headers $headers -ContentType 'application/json' -Body $dispatchBody | Out-Null
} catch {
    Write-Host "触发失败: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# 等待 workflow run 出现并获取 runId
Write-Host "[2/4] 等待 workflow 启动..." -ForegroundColor Yellow
$runId = $null
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 5
    try {
        $runs = Invoke-RestMethod -Method Get -Uri "https://api.github.com/repos/$syncOwner/$syncRepo/actions/runs?per_page=5" -Headers $headers
        $run = $runs.workflow_runs | Where-Object { $_.name -eq 'Android Build' -and $_.status -ne 'queued' -and $_.created_at -gt (Get-Date).AddMinutes(-5).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ') } | Select-Object -First 1
        if (-not $run) { $run = $runs.workflow_runs | Select-Object -First 1 }
        if ($run -and $run.name -eq 'Android Build') { $runId = $run.id; break }
    } catch { }
}
if (-not $runId) {
    Write-Host "未能获取 workflow runId,请到 Actions 页手动查看。" -ForegroundColor Red
    exit 1
}
Write-Host "workflow runId: $runId"

# 监控构建直到完成
Write-Host "[3/4] 监控构建进度(runId=$runId)..." -ForegroundColor Yellow
$lastStatus = ''
while ($true) {
    Start-Sleep -Seconds 15
    $res = Invoke-RestMethod -Method Get -Uri "https://api.github.com/repos/$syncOwner/$syncRepo/actions/runs/$runId" -Headers $headers
    $status = $res.status
    if ($status -ne $lastStatus) {
        Write-Host "  状态: $status" -ForegroundColor Cyan
        $lastStatus = $status
    }
    if ($status -eq 'completed') {
        Write-Host "  结论: $($res.conclusion)" -ForegroundColor Cyan
        if ($res.conclusion -ne 'success') {
            Write-Host "云端构建失败,请到 Actions 页查看日志: https://github.com/$syncOwner/$syncRepo/actions/runs/$runId" -ForegroundColor Red
            exit 1
        }
        break
    }
}

# 下载 APK 产物到本地 release/
Write-Host "[4/4] 下载 APK 到本地 release/..." -ForegroundColor Yellow
$releaseDir = Join-Path $root 'release'
New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null

# 从 workflow run 的 artifacts 下载
$artifacts = Invoke-RestMethod -Method Get -Uri "https://api.github.com/repos/$syncOwner/$syncRepo/actions/runs/$runId/artifacts" -Headers $headers
$artifact = $artifacts.artifacts | Where-Object { $_.name -eq 'knowledge-base-apk' } | Select-Object -First 1
if (-not $artifact) {
    Write-Host "未找到 APK 产物 artifact,请到 Actions 页手动下载。" -ForegroundColor Red
    exit 1
}

$zipPath = Join-Path $env:TEMP 'kb-apk.zip'
$extractDir = Join-Path $env:TEMP 'kb-apk-extract'
Remove-Item -Recurse -Force $extractDir -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $extractDir | Out-Null

# 下载 artifact zip(需 Accept: application/vnd.github.v3+json 或 octet-stream)
$headers['Accept'] = 'application/vnd.github.v3+json'
Invoke-WebRequest -Uri $artifact.archive_download_url -Headers $headers -OutFile $zipPath
Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force

# 复制 APK 到 release/
$apks = Get-ChildItem -Path $extractDir -Recurse -Filter '*.apk'
if (-not $apks) {
    Write-Host "下载的产物中未找到 APK 文件。" -ForegroundColor Red
    exit 1
}
foreach ($apk in $apks) {
    Copy-Item $apk.FullName $releaseDir -Force
    $sizeMb = [math]::Round($apk.Length / 1048576, 1)
    Write-Host ("  OK " + $apk.Name + " (" + $sizeMb + " MB)") -ForegroundColor Green
}

Write-Host ""
Write-Host "APK 已保存到: $releaseDir" -ForegroundColor Green
Write-Host "可安装: $releaseDir\app-debug.apk" -ForegroundColor Green
