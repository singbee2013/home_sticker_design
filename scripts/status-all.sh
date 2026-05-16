#!/usr/bin/env bash
# 查看 DecorAI 原生进程状态
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

decorai_init_paths
cd "$DECORAI_ROOT"

echo "=== DecorAI 状态 (native, $DECORAI_ROOT) ==="
echo "日志目录: $DECORAI_LOG_DIR"
echo "生产端口: $PROD_PORT"
echo ""

_show() {
  local name="$1"
  local pf
  pf="$(decorai_pid_file "$name")"
  if decorai_is_running "$pf"; then
    echo "  $name: running (pid $(cat "$pf"))"
  else
    echo "  $name: stopped"
  fi
}

_show backend
_show frontend
_show backend-prod
_show monitor

echo ""
echo "=== 端口探测 ==="
curl -fsS --connect-timeout 2 "http://127.0.0.1:${BACKEND_PORT:-8080}/api/health" 2>/dev/null \
  && echo "  dev backend :${BACKEND_PORT:-8080}/api/health OK" || echo "  dev backend :${BACKEND_PORT:-8080} —"
curl -fsS --connect-timeout 2 "http://127.0.0.1:${FRONTEND_PORT:-5173}/" -o /dev/null 2>/dev/null \
  && echo "  dev frontend :${FRONTEND_PORT:-5173} OK" || echo "  dev frontend :${FRONTEND_PORT:-5173} —"
curl -fsS --connect-timeout 2 "http://127.0.0.1:${PROD_PORT}/api/health" 2>/dev/null \
  && echo "  prod backend :${PROD_PORT}/api/health OK" || echo "  prod backend :${PROD_PORT} —"

if [[ -f web/dist/index.html ]]; then
  echo "  web/dist: present"
else
  echo "  web/dist: missing (run: bash scripts/start-all.sh prod)"
fi

echo ""
echo "=== 最近日志 ==="
for f in \
  "$DECORAI_LOG_DIR/backend/uvicorn.log" \
  "$DECORAI_LOG_DIR/backend/app.log" \
  "$DECORAI_LOG_DIR/frontend/vite.log" \
  "$DECORAI_LOG_DIR/frontend/build.log" \
  "$DECORAI_LOG_DIR/monitor/watchdog.log"; do
  if [[ -f "$f" ]]; then
    echo "--- $f (last 5 lines) ---"
    tail -n 5 "$f" 2>/dev/null || true
  fi
done
