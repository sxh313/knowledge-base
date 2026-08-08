#!/bin/bash
# ============================================
# 监听文件变化，自动提交并推送到 GitHub
# 用法: ./auto-deploy.sh
# 按 Ctrl+C 停止
# ============================================

cd "$(dirname "$0")"
echo "👁️  监听文件变化中... (Ctrl+C 停止)"
echo "📂 目录: $(pwd)"
echo ""

# 用 inotifywait 监听（Linux）或 fswatch（macOS）
if command -v inotifywait &> /dev/null; then
  WATCH_CMD="inotifywait -r -e modify,create,delete,move --exclude 'node_modules|\.git|dist' src/ public/ *.ts *.js *.json *.html"
elif command -v fswatch &> /dev/null; then
  WATCH_CMD="fswatch -r --exclude 'node_modules|\.git|dist' src/ public/"
else
  # 退化为轮询模式（每 10 秒检查一次）
  echo "⚠️  未找到 inotifywait/fswatch，使用轮询模式（每 10 秒）"
  LAST_HASH=""
  while true; do
    sleep 10
    CURRENT_HASH=$(git status -s | md5sum | cut -d' ' -f1)
    if [ "$CURRENT_HASH" != "$LAST_HASH" ] && [ -n "$(git status -s)" ]; then
      LAST_HASH="$CURRENT_HASH"
      echo "$(date '+%H:%M:%S') 检测到变化，自动提交..."
      bash ./deploy.sh "auto: $(date '+%Y-%m-%d %H:%M') 自动提交"
    fi
  done
fi

while true; do
  $WATCH_CMD
  echo "$(date '+%H:%M:%S') 检测到文件变化..."
  sleep 2  # 等待编辑器写完
  bash ./deploy.sh "auto: $(date '+%Y-%m-%d %H:%M') 自动提交"
done