#!/usr/bin/env bash
# 在服务器执行：git pull + 原生脚本启动（无 Docker/Podman 容器）
#
# 用法：
#   bash scripts/deploy-on-server.sh [branch]
# 示例：
#   bash scripts/deploy-on-server.sh main
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

BRANCH="${1:-main}"
APP_PORT="${APP_PORT:-3000}"

# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"
decorai_init_paths

echo ">>> DecorAI 服务器部署（原生进程）"
echo ">>> 目录: $ROOT"
echo ">>> 分支: $BRANCH"

if [[ -d .git ]]; then
  git fetch origin "$BRANCH" 2>/dev/null || git fetch origin
  git checkout "$BRANCH" 2>/dev/null || true
  git pull --ff-only origin "$BRANCH" || git pull --ff-only
fi

if [[ ! -f .env ]] && [[ -f .env.example ]]; then
  cp .env.example .env
  echo ">>> 已从 .env.example 创建 .env，请填写 API 密钥后重新部署"
fi

export PROD_PORT="$APP_PORT"
export DECORAI_ROOT="$ROOT"

echo ">>> 停止旧进程…"
bash "$SCRIPT_DIR/stop-all.sh" prod 2>/dev/null || true

echo ">>> 启动生产栈…"
bash "$SCRIPT_DIR/start-all.sh" prod

echo ">>> 健康检查"
curl -sS "http://127.0.0.1:${APP_PORT}/api/health"
echo ""
echo ">>> 完成。Nginx 应反代到 127.0.0.1:${APP_PORT}"
echo ">>> 日志: $DECORAI_LOG_DIR"
echo ">>> 状态: bash scripts/status-all.sh"
