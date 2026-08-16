# 知识库 Electron 打包脚本 — 一键生成 Windows .exe 安装包
# 用法: PowerShell 里运行  .\deploy-exe.ps1
# 详细说明见 ELECTRON_BUILD.md

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
Set-Location $root

Write-Host "📦 开始打包知识库 Electron 桌面版..." -ForegroundColor Cyan

# 1. 清理旧产物
Write-Host "[1/5] 清理旧产物..." -ForegroundColor Yellow
Remove-Item -Recurse -Force "$root\release" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "$env:TEMP\kb-release" -ErrorAction SilentlyContinue

# 2. 检查 PNG 图标(脚本会保留项目中的自定义图标)
Write-Host "[2/5] 检查 PNG 图标..." -ForegroundColor Yellow
node "$root\scripts\gen-icon.cjs"

# 3. 设置国内镜像(必需,否则 NSIS 工具下载超时)
Write-Host "[3/5] 配置国内镜像..." -ForegroundColor Yellow
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://npmmirror.com/mirrors/electron-builder-binaries/"

# 4. 打包到 C 盘临时目录(关键:输出到 C 盘,避免 D 盘 rename EPERM)
Write-Host "[4/5] 打包中(输出到 C 盘临时目录)..." -ForegroundColor Yellow
npx electron-builder --win --config.directories.output="$env:TEMP\kb-release"

# 5. 复制产物回项目 release/
Write-Host "[5/5] 复制产物到 release/..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path "$root\release" | Out-Null
Copy-Item "$env:TEMP\kb-release\*" "$root\release" -Recurse -Force

Write-Host ""
Write-Host "✅ 打包完成!" -ForegroundColor Green
$setup = Get-ChildItem "$root\release\*.exe" | Where-Object { $_.Name -like "*Setup*" } | Select-Object -First 1
if ($setup) {
    Write-Host "📦 安装包: $($setup.FullName)  ($([math]::Round($setup.Length/1MB,1)) MB)" -ForegroundColor Green
}
Write-Host "📂 便携版: $root\release\win-unpacked\知识库.exe" -ForegroundColor Green
