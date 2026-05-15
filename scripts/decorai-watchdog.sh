#!/usr/bin/env bash
# DecorAI 可用性守护进程：周期性检查后端存活；连续失败则重启 app 容器。
# 健康判定仅用 /api/health：长耗时 AI 任务已放到独立线程，主进程应始终可响应；避免误杀。
#
# 前台运行（调试）：
#   bash scripts/decorai-watchdog.sh
#
# 后台运行：
#   nohup bash scripts/decorai-watchdog.sh >>/tmp/decorai-watchdog.log 2>&1 &
#
# 推荐（systemd，见 scripts/systemd/decorai-watchdog.service）：
#   sudo cp scripts/systemd/decorai-watchdog.service /etc/systemd/system/
#   sudo systemctl daemon-reload && sudo systemctl enable --now decorai-watchdog
#
# 环境变量（可选）：
#   DECORAI_HOME              项目根目录（默认：脚本所在仓库根）
#   APP_PORT                  应用监听端口（默认 3000）
#   WATCHDOG_INTERVAL         正常探测间隔秒（默认 30）
#   WATCHDOG_MIN_RESTART_GAP  两次重启之间最短间隔秒，防抖动（默认 120）
#   DECORAI_EDGE_URL          若设置则额外探测（如 http://127.0.0.1/ 走本机 Nginx）
#   DECORAI_USE_PODMAN_HOST_COMPOSE=1  与 fix-server-502 一致，叠加 docker-compose.podman-host.yml
#   DECORAI_RELOAD_NGINX_CMD  重启容器后执行的命令（默认空；可设为 "sudo systemctl reload nginx"）
#   WATCHDOG_CONSEC_FAILS     连续探测失败几次才重启（默认 3，避免偶发抖动 / gzip 误判）

set -u

DECORAI_HOME="${DECORAI_HOME:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
APP_PORT="${APP_PORT:-3000}"
WATCHDOG_INTERVAL="${WATCHDOG_INTERVAL:-30}"
WATCHDOG_MIN_RESTART_GAP="${WATCHDOG_MIN_RESTART_GAP:-120}"
WATCHDOG_CONSEC_FAILS="${WATCHDOG_CONSEC_FAILS:-3}"
CONTAINER="${DECORAI_CONTAINER:-decorai-app}"
LOG="${DECORAI_WATCHDOG_LOG:-/tmp/decorai-watchdog.log}"

_base() { echo "http://127.0.0.1:${APP_PORT}"; }

log() {
  local line="[watchdog $(date -Iseconds)] $*"
  printf '%s\n' "$line"
  printf '%s\n' "$line" >>"$LOG" 2>/dev/null || true
}

backend_ok() {
  local b="$(_base)"
  if curl -fsS --max-time 8 "${b}/api/health" 2>/dev/null | grep -q '"status"'; then
    return 0
  fi
  curl -fsS --max-time 10 "${b}/api/ai/providers" >/dev/null 2>&1
}

frontend_ok() {
  local b="$(_base)" code
  # 勿对 HTML 做 grep：上游若 gzip，管道内为二进制 → 恒失败 → 误杀容器 → 全站 502。
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "${b}/" 2>/dev/null || true)"
  [[ "$code" =~ ^2[0-9][0-9]$ ]]
}

edge_ok() {
  [[ -z "${DECORAI_EDGE_URL:-}" ]] && return 0
  curl -fsS --max-time 12 -o /dev/null "${DECORAI_EDGE_URL}"
}

all_ok() {
  backend_ok
}

_compose_files=(-f docker-compose.yml)
if [[ -f "${DECORAI_HOME}/docker-compose.podman-host.yml" ]] && [[ "${DECORAI_USE_PODMAN_HOST_COMPOSE:-0}" == "1" ]]; then
  _compose_files+=(-f docker-compose.podman-host.yml)
fi

compose_up_app() {
  cd "$DECORAI_HOME" || return 1
  if command -v podman-compose >/dev/null 2>&1; then
    podman-compose "${_compose_files[@]}" up -d app
  elif command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    docker compose "${_compose_files[@]}" up -d app
  else
    docker-compose "${_compose_files[@]}" up -d app 2>/dev/null
  fi
}

restart_app() {
  log "restart: removing container ${CONTAINER} (if any)"
  command -v podman >/dev/null 2>&1 && podman rm -f "$CONTAINER" >/dev/null 2>&1 || true
  compose_up_app || { log "restart: compose up failed"; return 1; }
  if [[ -n "${DECORAI_RELOAD_NGINX_CMD:-}" ]]; then
    # shellcheck disable=SC2086
    eval "$DECORAI_RELOAD_NGINX_CMD" >>"$LOG" 2>&1 && log "reload nginx ok" || log "reload nginx failed (ignored)"
  fi
  return 0
}

last_restart_ts=0

maybe_restart() {
  local now reason="$1"
  now=$(date +%s)
  if (( now - last_restart_ts < WATCHDOG_MIN_RESTART_GAP )) && [[ "$last_restart_ts" -ne 0 ]]; then
    log "skip restart (${reason}): within MIN_RESTART_GAP (${WATCHDOG_MIN_RESTART_GAP}s)"
    return 2
  fi
  log "FAIL: ${reason} — restarting app"
  if restart_app; then
    last_restart_ts=$(date +%s)
    log "restart issued; waiting for stack (${WATCHDOG_START_WAIT:-25}s)"
    sleep "${WATCHDOG_START_WAIT:-25}"
  fi
}

trap 'log "signal received, exiting"; exit 0' INT TERM

log "start DECORAI_HOME=${DECORAI_HOME} APP_PORT=${APP_PORT} interval=${WATCHDOG_INTERVAL}s consec_fail_threshold=${WATCHDOG_CONSEC_FAILS}"

consec_bad=0
while true; do
  if all_ok; then
    consec_bad=0
  else
    reasons=()
    backend_ok || reasons+=("backend")
    frontend_ok || reasons+=("frontend")
    edge_ok || reasons+=("edge:${DECORAI_EDGE_URL}")
    consec_bad=$((consec_bad + 1))
    r="$(IFS=+; echo "${reasons[*]}")"
    if [[ "$consec_bad" -ge "$WATCHDOG_CONSEC_FAILS" ]]; then
      maybe_restart "$r"
      consec_bad=0
    else
      log "probe miss (${r}) consec=${consec_bad}/${WATCHDOG_CONSEC_FAILS} (no restart yet)"
    fi
  fi
  sleep "$WATCHDOG_INTERVAL"
done
