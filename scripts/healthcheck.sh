#!/usr/bin/env bash
# 统一健康检查脚本：支持 Docker Compose 和 PM2/Node
#
# 用法：
#   bash scripts/healthcheck.sh
#   APP_PORT=3000 HEALTH_PATH=/api/ai/providers bash scripts/healthcheck.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

APP_PORT="${APP_PORT:-3000}"
HEALTH_PATH="${HEALTH_PATH:-/}"
URL="http://127.0.0.1:${APP_PORT}${HEALTH_PATH}"
APP_CONTAINER_NAME="${APP_CONTAINER_NAME:-decorai-app}"

compose_cmd() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    echo "docker compose"
    return 0
  fi
  if command -v podman-compose >/dev/null 2>&1; then
    echo "podman-compose"
    return 0
  fi
  echo ""
}

echo "=========================================="
echo "  健康检查开始"
echo "  项目路径: $ROOT"
echo "  URL:      $URL"
echo "=========================================="

if [[ -f "docker-compose.yml" ]]; then
  echo ">>> 检测到 Docker Compose 项目，输出容器状态"
  C="$(compose_cmd)"
  if [[ -n "$C" ]]; then
    $C ps || true
  fi
fi

if command -v podman >/dev/null 2>&1; then
  echo ">>> rootless 容器（当前用户）"
  podman ps -a --filter "name=${APP_CONTAINER_NAME}" --format "{{.ID}} {{.Names}} {{.Status}} {{.Ports}}" || true
fi
if command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then
  echo ">>> root 容器（冲突检查）"
  sudo podman ps -a --filter "name=${APP_CONTAINER_NAME}" --format "{{.ID}} {{.Names}} {{.Status}} {{.Ports}}" || true
fi

if command -v pm2 >/dev/null 2>&1; then
  echo ">>> 输出 PM2 状态"
  pm2 status || true
fi

echo ">>> HTTP 检查"
if curl -fsSI "$URL" >/dev/null; then
  echo "健康检查通过：$URL"
else
  echo "健康检查失败：$URL"
  exit 1
fi

if command -v podman >/dev/null 2>&1 && podman ps --format "{{.Names}}" | grep -qx "$APP_CONTAINER_NAME"; then
  echo ">>> 校验 3000 命中容器版本"
  in_hash="$(podman exec "$APP_CONTAINER_NAME" python -c 'from pathlib import Path;t=Path("/app/web/dist/index.html").read_text(encoding="utf-8",errors="ignore");k="/assets/index-";i=t.find(k);j=t.find(".js",i);print(t[i:j+3] if i>=0 and j>i else "none")' 2>/dev/null || true)"
  host_hash="$(python3 -c 'import subprocess;h=subprocess.check_output(["curl","-s","http://127.0.0.1:3000/"]).decode("utf-8","ignore");k="/assets/index-";i=h.find(k);j=h.find(".js",i);print(h[i:j+3] if i>=0 and j>i else "none")' 2>/dev/null || true)"
  echo "container index: ${in_hash:-none}"
  echo "host:3000 index: ${host_hash:-none}"
  if [[ -n "$in_hash" && -n "$host_hash" && "$in_hash" != "$host_hash" ]]; then
    echo "错误：host:3000 未命中当前容器（存在旧容器/端口占用冲突）"
    exit 1
  fi
fi
