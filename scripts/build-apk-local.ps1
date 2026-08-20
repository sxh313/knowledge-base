# Knowledge Base Android APK local build script.
# 前置条件:本机已安装 JDK 21 + Android SDK(ANDROID_HOME 已配置)。
# 产物输出到 release/ 目录(与 exe 统一管理)。
# Usage: powershell -ExecutionPolicy Bypass -File .\scripts\build-apk-local.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

Write-Host "Building Android APK locally..." -ForegroundColor Cyan

# 1. 校验环境
Write-Host "[1/5] 校验构建环境..." -ForegroundColor Yellow
if (-not (Get-Command java -ErrorAction SilentlyContinue)) {
    Write-Host "错误:未找到 java。请安装 JDK 21 并加入 PATH。" -ForegroundColor Red
    exit 1
}
if (-not $env:ANDROID_HOME -and -not $env:ANDROID_SDK_ROOT) {
    Write-Host "错误:未设置 ANDROID_HOME / ANDROID_SDK_ROOT。请安装 Android SDK 并配置环境变量。" -ForegroundColor Red
    exit 1
}
Write-Host "  java: $(java -version 2>&1 | Select-Object -First 1)"
Write-Host "  ANDROID_HOME: $env:ANDROID_HOME"

# 2. 生成安卓图标(若 build/icon.png 存在)
Write-Host "[2/5] 生成安卓图标..." -ForegroundColor Yellow
if (Test-Path "$root\build\icon.png") {
    node "$root\scripts\gen-android-icon.cjs"
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} else {
    Write-Host "  跳过(未找到 build/icon.png)"
}

# 3. 构建 Web 前端 + 同步 Capacitor
Write-Host "[3/5] 构建 Web 前端 + 同步 Capacitor..." -ForegroundColor Yellow
$env:BUILD_TARGET = "android"
npx tsc -b
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npx vite build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npx cap sync android
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 4. 构建 Debug + Release APK
Write-Host "[4/5] 构建 Debug + Release APK..." -ForegroundColor Yellow
Push-Location "$root\android"
try {
    .\gradlew.bat assembleDebug
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    .\gradlew.bat assembleRelease
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
    Pop-Location
}

# 5. 复制 APK 到 release/
Write-Host "[5/5] 复制 APK 到 release/..." -ForegroundColor Yellow
$releaseDir = Join-Path $root 'release'
New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null
$apkDirs = @(
    "$root\android\app\build\outputs\apk\debug",
    "$root\android\app\build\outputs\apk\release"
)
foreach ($dir in $apkDirs) {
    if (Test-Path $dir) {
        Get-ChildItem $dir -Filter '*.apk' | ForEach-Object {
            Copy-Item $_.FullName $releaseDir -Force
            $sizeMb = [math]::Round($_.Length / 1048576, 1)
            Write-Host ("  OK " + $_.Name + " (" + $sizeMb + " MB)") -ForegroundColor Green
        }
    }
}

Write-Host ""
Write-Host "APK 已保存到: $releaseDir" -ForegroundColor Green
Write-Host "可安装: $releaseDir\app-debug.apk" -ForegroundColor Green
