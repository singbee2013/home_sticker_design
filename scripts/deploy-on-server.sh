#!/usr/bin/env bash
# 在服务器执行：拉取代码并发布（Docker Compose 或 PM2）
#
# 用法：
#   bash scripts/deploy-on-server.sh [branch] [app_name]
# 示例：
#   bash scripts/deploy-on-server.sh main decor-ai
#
# 说明：
# - 自动识别部署模式：
#   1) 有 docker-compose.yml -> Docker Compose
#   2) 否则回退到 PM2（Node 项目）
# - 需要在仓库根目录执行，或由上层脚本先 cd 到仓库目录。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

BRANCH="${1:-main}"
APP_NAME="${2:-${PM2_APP_NAME:-decor-ai}}"
HEALTH_PATH="${HEALTH_PATH:-/}"
APP_PORT="${APP_PORT:-3000}"
# Compose 健康检查必须打 127.0.0.1:APP_PORT，不要误用 :80。
# 未设置 COMPOSE_HEALTH_URL 时：先试 /api/health（新代码），再试 /api/ai/providers（旧镜像无 health 路由）。
# 若检查必须经宿主机 Nginx：export COMPOSE_HEALTH_URL=http://127.0.0.1/api/ai/providers
COMPOSE_HEALTH_URL="${COMPOSE_HEALTH_URL:-}"
APP_CONTAINER_NAME="${APP_CONTAINER_NAME:-decorai-app}"
NGINX_CONTAINER_NAME="${NGINX_CONTAINER_NAME:-decorai-nginx}"

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

CURRENT_COMPOSE_CMD="$(compose_cmd)"

compose_probe_ok() {
  local base="http://127.0.0.1:${APP_PORT}"
  if [[ -n "$COMPOSE_HEALTH_URL" ]]; then
    curl -fsS --max-time 10 "$COMPOSE_HEALTH_URL" >/dev/null
    return $?
  fi
  if curl -fsS --max-time 6 "${base}/api/health" >/dev/null 2>&1; then
    return 0
  fi
  curl -fsS --max-time 10 "${base}/api/ai/providers" >/dev/null
}

cleanup_rootful_stale_containers() {
  # Root/admin mixed runtime causes "old UI still served" incidents.
  if [[ "$(id -u)" -eq 0 ]]; then
    return 0
  fi
  if ! command -v sudo >/dev/null 2>&1; then
    return 0
  fi
  if ! sudo -n true >/dev/null 2>&1; then
    echo ">>> sudo 无免密，跳过 root 容器自动清理（建议配置免密 sudo）"
    return 0
  fi

  echo ">>> 扫描并清理 root 旧容器（避免与 admin rootless 冲突）..."
  for n in "$APP_CONTAINER_NAME" "$NGINX_CONTAINER_NAME"; do
    if sudo podman ps -a --format "{{.Names}}" | grep -qx "$n"; then
      echo "    - 删除 root 容器: $n"
      sudo podman rm -f "$n" >/dev/null || true
    fi
  done
}

verify_port_owner_consistency() {
  # Ensure host port serves the same frontend bundle as the running app container.
  if [[ -z "$CURRENT_COMPOSE_CMD" ]]; then
    return 0
  fi
  if ! command -v podman >/dev/null 2>&1; then
    return 0
  fi
  if ! podman ps --format "{{.Names}}" | grep -qx "$APP_CONTAINER_NAME"; then
    return 0
  fi
  echo ">>> 校验 3000 端口是否命中新容器..."
  local in_hash host_hash
  in_hash="$(podman exec "$APP_CONTAINER_NAME" python -c 'from pathlib import Path;t=Path("/app/web/dist/index.html").read_text(encoding="utf-8",errors="ignore");k="/assets/index-";i=t.find(k);j=t.find(".js",i);print(t[i:j+3] if i>=0 and j>i else "none")' 2>/dev/null || true)"
  host_hash="$(python3 -c 'import subprocess;h=subprocess.check_output(["curl","-s","http://127.0.0.1:3000/"]).decode("utf-8","ignore");k="/assets/index-";i=h.find(k);j=h.find(".js",i);print(h[i:j+3] if i>=0 and j>i else "none")' 2>/dev/null || true)"
  echo "    container index: ${in_hash:-none}"
  echo "    host:3000 index: ${host_hash:-none}"
  if [[ -n "$in_hash" && -n "$host_hash" && "$in_hash" != "$host_hash" ]]; then
    echo "错误：端口 3000 未命中新容器（可能仍有旧 rootful 监听残留）。"
    echo "请执行：sudo podman ps -a && sudo podman rm -f $APP_CONTAINER_NAME $NGINX_CONTAINER_NAME"
    exit 1
  fi
}

echo "=========================================="
echo "  服务器部署开始"
echo "  项目路径: $ROOT"
echo "  分支:     $BRANCH"
echo "  标识:     $APP_NAME"
echo "=========================================="

echo ">>> git fetch origin ..."
git fetch origin

echo ">>> 切换并同步分支: $BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

if [[ -f "docker-compose.yml" ]]; then
  echo ">>> 识别为 Docker Compose 项目"
  if [[ ! -f ".env" ]]; then
    echo "错误：缺少 .env，请先 cp .env.example .env 并填写配置。"
    exit 1
  fi

  if [[ -z "$CURRENT_COMPOSE_CMD" ]]; then
    echo "错误：未找到 docker compose 或 podman-compose"
    exit 1
  fi
  cleanup_rootful_stale_containers
  echo ">>> ${CURRENT_COMPOSE_CMD} up -d --build ..."
  ${CURRENT_COMPOSE_CMD} up -d --build

  echo ">>> ${CURRENT_COMPOSE_CMD} ps"
  ${CURRENT_COMPOSE_CMD} ps

  if [[ -n "$COMPOSE_HEALTH_URL" ]]; then
    echo ">>> 健康检查（最多重试 20 次，固定 URL）: $COMPOSE_HEALTH_URL"
  else
    echo ">>> 健康检查（最多重试 20 次）: ${APP_PORT} 端口 /api/health 或 /api/ai/providers"
  fi
  ok=0
  for i in $(seq 1 20); do
    if compose_probe_ok; then
      ok=1
      echo "健康检查通过。"
      break
    fi
    echo "第 $i 次检查未通过，2 秒后重试..."
    sleep 2
  done

  if [[ "$ok" != "1" ]]; then
    echo "健康检查未通过，输出 app 日志用于排查："
    ${CURRENT_COMPOSE_CMD} logs --tail=120 app || true
    exit 1
  fi

  verify_port_owner_consistency

  echo ">>> 最近日志（app/nginx）"
  ${CURRENT_COMPOSE_CMD} logs --tail=80 app nginx || true
else
  echo ">>> 未发现 docker-compose.yml，回退到 PM2 发布模式"
  if [[ ! -f "package.json" ]]; then
    echo "错误：既不是 Compose 项目，也没有 package.json，无法自动发布。"
    exit 1
  fi

  if command -v pnpm >/dev/null 2>&1 && [[ -f "pnpm-lock.yaml" ]]; then
    echo ">>> pnpm install --frozen-lockfile"
    pnpm install --frozen-lockfile
    echo ">>> pnpm build"
    pnpm build
  else
    echo ">>> npm ci"
    npm ci
    echo ">>> npm run build"
    npm run build
  fi

  if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
    echo ">>> PM2 已存在进程，执行 restart --update-env"
    pm2 restart "$APP_NAME" --update-env
  else
    echo ">>> PM2 不存在进程，执行首次 start"
    NODE_ENV=production pm2 start dist/index.js --name "$APP_NAME"
  fi
  pm2 save

  echo ">>> 健康检查（最多重试 20 次）"
  ok=0
  for i in $(seq 1 20); do
    if curl -fsS "http://127.0.0.1:${APP_PORT}${HEALTH_PATH}" >/dev/null; then
      ok=1
      echo "健康检查通过。"
      break
    fi
    echo "第 $i 次检查未通过，2 秒后重试..."
    sleep 2
  done

  if [[ "$ok" != "1" ]]; then
    echo "健康检查未通过，输出 PM2 日志用于排查："
    pm2 logs "$APP_NAME" --lines 120 --nostream || true
    exit 1
  fi

  echo ">>> PM2 状态"
  pm2 status "$APP_NAME" || pm2 status
fi

echo "=========================================="
echo "  部署完成："
echo "  - 首页:   http://<服务器IP>/"
echo "  - API:    http://<服务器IP>/api/..."
echo "  - Swagger:http://<服务器IP>/docs"
echo "=========================================="
