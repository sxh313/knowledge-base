#!/bin/bash
# ============================================
# 一键提交并推送到 GitHub
# 用法: ./deploy.sh "提交说明"
# ============================================

set -e

cd "$(dirname "$0")"

# 检查是否有 index.lock 残留
if [ -f ".git/index.lock" ]; then
  echo "🔧 清理 git lock 文件..."
  rm -f .git/index.lock
fi

# 检查是否有改动
if git diff --quiet && git diff --cached --quiet && [ -z "$(git ls-files --others --exclude-standard)" ]; then
  echo "✅ 没有需要提交的改动"
  exit 0
fi

# 提交说明：用参数或自动生成
MSG="${1:-auto: $(date '+%Y-%m-%d %H:%M') 更新}"

echo "📦 暂存文件..."
git add -A

echo "📝 提交: $MSG"
git commit -m "$MSG"

echo "🚀 推送到 GitHub..."
git push origin HEAD

echo ""
echo "✅ 推送完成！"
git log --oneline -1