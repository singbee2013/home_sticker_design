#!/usr/bin/env bash
# 停止 start-all.sh 启动的后台进程（原生部署，无容器）
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

MODE="${1:-dev}"
decorai_init_paths

case "$MODE" in
  dev)
    decorai_stop_pidfile backend
    decorai_stop_pidfile frontend
    decorai_log "stopped dev backend + frontend"
    ;;
  prod-backend)
    decorai_stop_pidfile backend-prod
    decorai_log "stopped production backend"
    ;;
  prod)
    decorai_stop_pidfile monitor
    decorai_stop_pidfile backend-prod
    decorai_log "stopped production backend + monitor"
    ;;
  prod-monitor)
    decorai_stop_pidfile monitor
    decorai_log "stopped monitor"
    ;;
  all)
    decorai_stop_pidfile backend
    decorai_stop_pidfile frontend
    decorai_stop_pidfile backend-prod
    decorai_stop_pidfile monitor
    decorai_log "stopped all native processes"
    ;;
  *)
    echo "用法: bash scripts/stop-all.sh [dev|prod|prod-backend|prod-monitor|all]" >&2
    exit 1
    ;;
esac
