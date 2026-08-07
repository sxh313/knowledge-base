# ============================================
# 一键提交并推送到 GitHub (PowerShell 版)
# 用法: .\deploy.ps1 "提交说明"
# ============================================

Set-Location "$PSScriptRoot\.."

# 清理 lock 文件
if (Test-Path ".git\index.lock") {
    Write-Host "🔧 清理 git lock 文件..." -ForegroundColor Yellow
    Remove-Item ".git\index.lock" -Force
}

# 检查是否有改动
$status = git status -s
if (-not $status) {
    Write-Host "✅ 没有需要提交的改动" -ForegroundColor Green
    exit 0
}

# 提交说明
$msg = if ($args[0]) { $args[0] } else { "auto: $(Get-Date -Format 'yyyy-MM-dd HH:mm') 更新" }

Write-Host "📦 暂存文件..." -ForegroundColor Cyan
git add -A

Write-Host "📝 提交: $msg" -ForegroundColor Cyan
git commit -m $msg

Write-Host "🚀 推送到 GitHub..." -ForegroundColor Cyan
git push origin HEAD

Write-Host ""
Write-Host "✅ 推送完成！" -ForegroundColor Green
git log --oneline -1