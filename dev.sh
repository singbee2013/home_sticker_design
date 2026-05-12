#!/usr/bin/env bash
# DecorAI dev runner — start backend + frontend dev server (foreground)
# Usage: ./dev.sh
set -euo pipefail
cd "$(dirname "$0")"

PORT_API=8080
PORT_WEB=5173

# Kill anything already on these ports
for p in $PORT_API $PORT_WEB; do
  pids=$(lsof -ti:$p 2>/dev/null || true)
  [ -n "$pids" ] && kill $pids 2>/dev/null || true
done
sleep 1

[ -d .venv ] || python3 -m venv .venv
.venv/bin/pip install -q -r requirements.txt

# Backend (FastAPI + SPA on :8080)
.venv/bin/python main.py &
API_PID=$!

# Frontend (Vite dev server on :5173, proxies /api → :8080)
[ -d web/node_modules ] || npm --prefix web install --no-audit --no-fund
npm --prefix web run dev &
WEB_PID=$!

trap "echo; echo 'Stopping…'; kill $API_PID $WEB_PID 2>/dev/null || true; wait 2>/dev/null || true" EXIT INT TERM

cat <<EOF

────────────────────────────────────────────────────
  DecorAI dev servers up
    Vue3 SPA   →  http://localhost:$PORT_WEB
    API + docs →  http://localhost:$PORT_API/docs
  Default login: admin / admin123
  Press Ctrl+C to stop both.
────────────────────────────────────────────────────

EOF

wait
