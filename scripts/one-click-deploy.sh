#!/usr/bin/env bash
# 在你本机（Mac）项目根目录执行：同步代码到服务器 → SSH 在服务器上跑 fix-server-502。
# 用法（在项目根）:
#   bash scripts/one-click-deploy.sh
#   bash scripts/one-click-deploy.sh admin@43.98.182.55
# 环境变量（可选）:
#   SSH_KEY=~/.ssh/id_ed25519_sg  REMOTE_DIR=/home/admin/home_sticker_design_api
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

SSH_HOST="${1:-${SSH_HOST:-admin@43.98.182.55}}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519_sg}"
REMOTE_DIR="${REMOTE_DIR:-/home/admin/home_sticker_design_api}"

if [[ ! -f "$SSH_KEY" ]]; then
  echo "[one-click-deploy] 找不到 SSH 私钥: $SSH_KEY" >&2
  echo "  请设置: export SSH_KEY=/path/to/key" >&2
  exit 1
fi

SSH_BASE=(ssh -o StrictHostKeyChecking=accept-new -i "$SSH_KEY" "$SSH_HOST")
RSYNC_BASE=(rsync -az --mkpath -e "ssh -o StrictHostKeyChecking=accept-new -i $SSH_KEY")

echo "[one-click-deploy] 同步代码到 $SSH_HOST:$REMOTE_DIR …"
"${SSH_BASE[@]}" "mkdir -p \"$REMOTE_DIR\""
"${RSYNC_BASE[@]}" \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude '.venv/' \
  --exclude '.venv_local/' \
  --exclude '__pycache__/' \
  --exclude '.idea/' \
  --exclude '.DS_Store' \
  --exclude 'data/*.db' \
  --exclude 'data/*.db-journal' \
  --exclude 'static/generated/' \
  --exclude 'static/uploads/' \
  "$REPO_ROOT/" "$SSH_HOST:$REMOTE_DIR/"

echo "[one-click-deploy] 在服务器上原生启动（无容器）…"
"${SSH_BASE[@]}" "REMOTE_ROOT=$REMOTE_DIR bash -s" <<'REMOTE_EOF'
set -euo pipefail
cd "${REMOTE_ROOT:?REMOTE_ROOT missing}"
command -v podman >/dev/null 2>&1 && { podman stop -t 0 decorai-app 2>/dev/null || true; podman rm -f decorai-app 2>/dev/null || true; }
sudo systemctl stop decorai-watchdog 2>/dev/null || true
bash scripts/deploy-on-server.sh main
REMOTE_EOF

echo "[one-click-deploy] 全部完成。打开站点并 Cmd+Shift+R 强刷。"
