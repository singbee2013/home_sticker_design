#!/usr/bin/env bash
# 当宿主机 Nginx 报 502（上游 127.0.0.1:3000 连不上）时，用本脚本自愈。
# 常见根因：rootless Podman 状态损坏、容器 Exited、slirp4netns 异常。
# 不要用 podman system migrate（部分 RHEL Podman 版本会崩溃）；直接删容器再拉起即可。
#
# 用法（服务器 crontab 每分钟一次）：
#   */1 * * * * /home/admin/home_sticker_design_api/scripts/auto-heal-decorai.sh
#
# 或手动：
#   DECORAI_HOME=/path/to/home_sticker_design_api bash scripts/auto-heal-decorai.sh

set -euo pipefail

DECORAI_HOME="${DECORAI_HOME:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
LOG="${DECORAI_HEAL_LOG:-/tmp/decorai-heal.log}"
APP_PORT="${APP_PORT:-3000}"
# 未设置 DECORAI_HEALTH_URL：先试 /api/health（新镜像），再试 /api/ai/providers（旧镜像）
CONTAINER="${DECORAI_CONTAINER:-decorai-app}"

probe_ok() {
  local base="http://127.0.0.1:${APP_PORT}"
  if [[ -n "${DECORAI_HEALTH_URL:-}" ]]; then
    curl -fsS --max-time 6 "$DECORAI_HEALTH_URL" >/dev/null 2>&1
    return $?
  fi
  if curl -fsS --max-time 6 "${base}/api/health" >/dev/null 2>&1; then
    return 0
  fi
  curl -fsS --max-time 8 "${base}/api/ai/providers" >/dev/null 2>&1
}

if probe_ok; then
  exit 0
fi

{
  echo "---- $(date -Iseconds) heal start ----"
  podman rm -f "$CONTAINER" >/dev/null 2>&1 || true
  cd "$DECORAI_HOME"
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    docker compose up -d app
  else
    docker-compose up -d app 2>/dev/null || podman-compose up -d app
  fi
  sleep 3
  if probe_ok; then
    echo "heal OK"
  else
    echo "heal STILL_FAIL curl"
    podman ps -a --filter "name=$CONTAINER" || true
  fi
} >>"$LOG" 2>&1
