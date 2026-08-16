# 知识库 Electron 打包脚本 — 一键生成 Windows .exe 安装包
# 用法: PowerShell 里运行  .\deploy-exe.ps1
# 详细说明见 ELECTRON_BUILD.md

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$buildOutput = if ($env:RUNNER_TEMP) {
    Join-Path $env:RUNNER_TEMP 'kb-release'
} else {
    Join-Path $env:TEMP 'kb-release'
}
Set-Location $root

Write-Host "📦 开始打包知识库 Electron 桌面版..." -ForegroundColor Cyan

# 1. 清理旧产物
Write-Host "[1/6] 清理旧产物..." -ForegroundColor Yellow
Remove-Item -Recurse -Force "$root\release" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force $buildOutput -ErrorAction SilentlyContinue

# 2. 检查 PNG 图标(脚本会保留项目中的自定义图标)
Write-Host "[2/6] 检查 PNG 图标..." -ForegroundColor Yellow
node "$root\scripts\gen-icon.cjs"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 3. 设置国内镜像(必需,否则 NSIS 工具下载超时)
Write-Host "[3/6] 配置国内镜像..." -ForegroundColor Yellow
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://npmmirror.com/mirrors/electron-builder-binaries/"

# 4. 每次都重新生成 Electron 专用前端，避免误打包上一次 Android/PWA 的 dist。
Write-Host "[4/6] 构建 Electron 前端..." -ForegroundColor Yellow
$env:BUILD_TARGET = "electron"
npx tsc -b
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npx vite build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 5. 打包到系统临时目录(避免跨盘或工作区文件锁导致 rename EPERM)
Write-Host "[5/6] 打包中(输出到系统临时目录)..." -ForegroundColor Yellow
npx electron-builder --win --publish never --config.directories.output="$buildOutput"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 6. 复制产物回项目 release/
Write-Host "[6/6] 复制产物到 release/..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path "$root\release" | Out-Null
Copy-Item "$buildOutput\*" "$root\release" -Recurse -Force

Write-Host ""
Write-Host "✅ 打包完成!" -ForegroundColor Green
$setup = Get-ChildItem "$root\release\*.exe" | Where-Object { $_.Name -like "*Setup*" } | Select-Object -First 1
if ($setup) {
    Write-Host "📦 安装包: $($setup.FullName)  ($([math]::Round($setup.Length/1MB,1)) MB)" -ForegroundColor Green
}
Write-Host "📂 便携版: $root\release\win-unpacked\知识库.exe" -ForegroundColor Green
