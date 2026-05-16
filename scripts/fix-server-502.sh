#!/usr/bin/env bash
# 生产环境一键启动（原生进程，不用容器）。历史名称保留兼容。
# 用法：bash scripts/fix-server-502.sh [/home/admin/home_sticker_design_api]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${REMOTE_ROOT:-${1:-}}"
if [[ -z "$ROOT" ]]; then
  for d in "$HOME/home_sticker_design_api" "$HOME/home_sticker_design" "/home/admin/home_sticker_design_api"; do
    [[ -f "$d/docker-compose.yml" ]] || [[ -f "$d/main.py" ]] && ROOT="$d" && break
  done
fi
if [[ -z "${ROOT:-}" ]] || [[ ! -f "$ROOT/main.py" ]]; then
  echo "[fix-server-502] 找不到项目目录（需含 main.py）" >&2
  exit 1
fi

export DECORAI_ROOT="$ROOT"
exec bash "$SCRIPT_DIR/start-all.sh" prod
