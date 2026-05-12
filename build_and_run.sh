#!/usr/bin/env bash
# Build + start single-process production server (no Docker, no Nginx).
# Useful for quick local "production-like" tests.
set -euo pipefail
cd "$(dirname "$0")"

PORT_API=8080

# Build SPA
[ -d web/node_modules ] || npm --prefix web install --no-audit --no-fund
npm --prefix web run build

# Free port
pids=$(lsof -ti:$PORT_API 2>/dev/null || true)
[ -n "$pids" ] && kill $pids 2>/dev/null || true
sleep 1

# Run
.venv/bin/python main.py
