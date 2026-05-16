#!/usr/bin/env bash
# 一键后台启动 DecorAI（不使用 Docker/Podman 容器）
#
# 用法：
#   bash scripts/start-all.sh          # 默认 dev
#   bash scripts/start-all.sh dev      # 开发：后端 8080 + Vite 5173
#   bash scripts/start-all.sh prod     # 生产：构建 web/dist + 单进程 Uvicorn（默认 3000）
#   bash scripts/start-all.sh prod --no-monitor
#   bash scripts/start-all.sh prod --skip-build   # 监控重启时跳过前端构建
#
# 日志：logs/backend/ logs/frontend/ logs/monitor/
# 停止：bash scripts/stop-all.sh [dev|prod]
# 状态：bash scripts/status-all.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

MODE="${1:-dev}"
NO_MONITOR=0
SKIP_BUILD=0
for arg in "${@:2}"; do
  case "$arg" in
    --no-monitor) NO_MONITOR=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
  esac
done

decorai_init_paths
cd "$DECORAI_ROOT"
decorai_load_dotenv
decorai_fix_dotenv_database_url

_start_backend_dev() {
  local pf log py
  pf="$(decorai_pid_file backend)"
  log="$DECORAI_LOG_DIR/backend/uvicorn-dev.log"
  if decorai_is_running "$pf"; then
    decorai_log "backend (dev) already running pid=$(cat "$pf")"
    return 0
  fi
  py="$(decorai_python_bin)"
  export LOG_DIR="$DECORAI_LOG_DIR"
  export PORT="${BACKEND_PORT:-8080}"
  decorai_log "starting backend dev port=$PORT log=$log"
  nohup "$py" -m uvicorn main:app --host 0.0.0.0 --port "$PORT" >>"$log" 2>&1 &
  echo $! >"$pf"
  sleep 2
  if ! decorai_is_running "$pf"; then
    decorai_log "backend dev failed — see $log"
    tail -n 30 "$log" >&2 || true
    exit 1
  fi
  decorai_log "backend dev started pid=$(cat "$pf")"
}

_start_frontend_dev() {
  local pf log
  pf="$(decorai_pid_file frontend)"
  log="$DECORAI_LOG_DIR/frontend/vite.log"
  if decorai_is_running "$pf"; then
    decorai_log "frontend already running pid=$(cat "$pf")"
    return 0
  fi
  if [[ ! -d web/node_modules ]]; then
    decorai_log "installing web deps…"
    (cd web && npm install --no-audit --no-fund)
  fi
  decorai_log "starting frontend dev log=$log"
  (
    cd web
    nohup npm run dev -- --host 0.0.0.0 --port "${FRONTEND_PORT:-5173}" >>"$log" 2>&1 &
    echo $! >"$pf"
  )
  sleep 2
  if ! decorai_is_running "$pf"; then
    decorai_log "frontend failed — see $log"
    tail -n 30 "$log" >&2 || true
    exit 1
  fi
  decorai_log "frontend started pid=$(cat "$pf") url=http://127.0.0.1:${FRONTEND_PORT:-5173}"
}

_build_frontend_prod() {
  local log="$DECORAI_LOG_DIR/frontend/build.log"
  decorai_log "building frontend → web/dist (log=$log)"
  if [[ ! -d web/node_modules ]]; then
    (cd web && npm install --no-audit --no-fund) >>"$log" 2>&1
  fi
  (cd web && npm run build) >>"$log" 2>&1
  if [[ ! -f web/dist/index.html ]]; then
    decorai_log "frontend build failed — see $log"
    tail -n 40 "$log" >&2 || true
    exit 1
  fi
  decorai_log "frontend build ok"
}

_ensure_python_deps() {
  local py log
  py="$(decorai_python_bin)"
  log="$DECORAI_LOG_DIR/deploy/pip-install.log"
  if ! "$py" -c "import fastapi" 2>/dev/null; then
    decorai_log "installing Python deps… (log=$log)"
    if [[ ! -d .venv ]] && { [[ "$py" == python3 ]] || [[ "$py" == python ]]; }; then
      python3 -m venv .venv 2>>"$log" || true
      py="$(decorai_python_bin)"
    fi
    "$py" -m pip install -q -r requirements.txt >>"$log" 2>&1
  fi
}

_start_prod_backend() {
  local pf log py
  pf="$(decorai_pid_file backend-prod)"
  log="$DECORAI_LOG_DIR/backend/uvicorn.log"
  if decorai_is_running "$pf"; then
    decorai_log "production backend already running pid=$(cat "$pf")"
    return 0
  fi
  py="$(decorai_python_bin)"
  export LOG_DIR="$DECORAI_LOG_DIR"
  export PORT="$PROD_PORT"
  export DATABASE_URL="${DATABASE_URL:-sqlite:///${DECORAI_ROOT}/data/app.db}"
  mkdir -p "$DECORAI_ROOT/data" "$DECORAI_ROOT/static/generated" "$DECORAI_ROOT/static/uploads"
  decorai_log "starting production backend (native) port=$PROD_PORT log=$log"
  nohup "$py" -m uvicorn main:app --host 0.0.0.0 --port "$PROD_PORT" >>"$log" 2>&1 &
  echo $! >"$pf"
  sleep 2
  if ! decorai_wait_health "$PROD_PORT" 30; then
    decorai_log "production backend health check failed — see $log"
    tail -n 40 "$log" >&2 || true
    exit 1
  fi
  decorai_log "production backend started pid=$(cat "$pf") health=ok"
}

_start_prod() {
  export LOG_DIR="$DECORAI_LOG_DIR"
  decorai_log "starting production stack (native process, no container)…"
  _ensure_python_deps
  if [[ "$SKIP_BUILD" != 1 ]]; then
    _build_frontend_prod
  else
    decorai_log "skip frontend build (--skip-build)"
    if [[ ! -f web/dist/index.html ]]; then
      decorai_log "web/dist missing — run without --skip-build first"
      exit 1
    fi
  fi
  _start_prod_backend
  if [[ "$NO_MONITOR" != 1 ]]; then
    bash "$SCRIPT_DIR/start-all.sh" prod-monitor
  fi
}

_start_prod_monitor() {
  local pf
  pf="$(decorai_pid_file monitor)"
  if decorai_is_running "$pf"; then
    decorai_log "monitor already running pid=$(cat "$pf")"
    return 0
  fi
  export DECORAI_HOME="$DECORAI_ROOT"
  export DECORAI_WATCHDOG_LOG="$DECORAI_LOG_DIR/monitor/watchdog.log"
  export APP_PORT="$PROD_PORT"
  decorai_log "starting monitor log=$DECORAI_WATCHDOG_LOG"
  nohup bash "$SCRIPT_DIR/decorai-watchdog.sh" >>"$DECORAI_LOG_DIR/monitor/watchdog-stdout.log" 2>&1 &
  echo $! >"$pf"
}

case "$MODE" in
  dev)
    _start_backend_dev
    _start_frontend_dev
    decorai_log "dev ready — API http://127.0.0.1:${BACKEND_PORT:-8080}  UI http://127.0.0.1:${FRONTEND_PORT:-5173}"
    ;;
  prod)
    _start_prod
    ;;
  prod-monitor)
    _start_prod_monitor
    ;;
  *)
    echo "用法: bash scripts/start-all.sh [dev|prod] [--no-monitor] [--skip-build]" >&2
    exit 1
    ;;
esac

echo ""
echo "日志目录: $DECORAI_LOG_DIR"
echo "查看状态: bash scripts/status-all.sh"
echo "停止服务: bash scripts/stop-all.sh $MODE"
