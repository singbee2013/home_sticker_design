#!/usr/bin/env bash
# DecorAI 可用性守护：仅检查 /api/health；失败时用脚本重启原生进程（不用容器）。
#
# 环境变量：
#   DECORAI_HOME / APP_PORT / WATCHDOG_INTERVAL / WATCHDOG_MIN_RESTART_GAP
#   WATCHDOG_CONSEC_FAILS / DECORAI_WATCHDOG_LOG
set -u

DECORAI_HOME="${DECORAI_HOME:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
APP_PORT="${APP_PORT:-3000}"
WATCHDOG_INTERVAL="${WATCHDOG_INTERVAL:-30}"
WATCHDOG_MIN_RESTART_GAP="${WATCHDOG_MIN_RESTART_GAP:-120}"
WATCHDOG_CONSEC_FAILS="${WATCHDOG_CONSEC_FAILS:-3}"
LOG="${DECORAI_WATCHDOG_LOG:-${DECORAI_HOME}/logs/monitor/watchdog.log}"

_base() { echo "http://127.0.0.1:${APP_PORT}"; }

log() {
  local line="[watchdog $(date -Iseconds)] $*"
  mkdir -p "$(dirname "$LOG")" 2>/dev/null || true
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

edge_ok() {
  [[ -z "${DECORAI_EDGE_URL:-}" ]] && return 0
  curl -fsS --max-time 12 -o /dev/null "${DECORAI_EDGE_URL}"
}

all_ok() {
  backend_ok
}

restart_app() {
  log "restart: native backend via start-all.sh prod --skip-build --no-monitor"
  cd "$DECORAI_HOME" || return 1
  bash scripts/stop-all.sh prod-backend 2>>"$LOG" || true
  if ! bash scripts/start-all.sh prod --no-monitor --skip-build >>"$LOG" 2>&1; then
    log "restart: start-all prod failed"
    return 1
  fi
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
    log "restart issued; waiting ${WATCHDOG_START_WAIT:-15}s"
    sleep "${WATCHDOG_START_WAIT:-15}"
  fi
}

trap 'log "signal received, exiting"; exit 0' INT TERM

log "start DECORAI_HOME=${DECORAI_HOME} APP_PORT=${APP_PORT} native mode interval=${WATCHDOG_INTERVAL}s"

consec_bad=0
while true; do
  if all_ok; then
    consec_bad=0
  else
    reasons=()
    backend_ok || reasons+=("backend")
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
