# shellcheck shell=bash
# Shared paths for DecorAI service scripts.

decorai_repo_root() {
  (cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
}

decorai_init_paths() {
  DECORAI_ROOT="${DECORAI_ROOT:-$(decorai_repo_root)}"
  export DECORAI_ROOT
  DECORAI_LOG_DIR="${DECORAI_LOG_DIR:-$DECORAI_ROOT/logs}"
  export DECORAI_LOG_DIR
  DECORAI_RUN_DIR="${DECORAI_RUN_DIR:-$DECORAI_ROOT/run}"
  export DECORAI_RUN_DIR
  PROD_PORT="${PROD_PORT:-${APP_PORT:-3000}}"
  export PROD_PORT
  mkdir -p \
    "$DECORAI_LOG_DIR/backend" \
    "$DECORAI_LOG_DIR/frontend" \
    "$DECORAI_LOG_DIR/monitor" \
    "$DECORAI_LOG_DIR/deploy" \
    "$DECORAI_RUN_DIR"
}

decorai_load_dotenv() {
  if [[ -f "$DECORAI_ROOT/.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "$DECORAI_ROOT/.env"
    set +a
  fi
}

decorai_fix_dotenv_database_url() {
  if [[ ! -f "$DECORAI_ROOT/.env" ]]; then
    return 0
  fi
  if grep -qE '^DATABASE_URL=sqlite:///\.?/?\.?/data/app\.db' "$DECORAI_ROOT/.env" 2>/dev/null; then
    sed -i.bak 's|^DATABASE_URL=.*|DATABASE_URL=sqlite:////app/data/app.db|' "$DECORAI_ROOT/.env" 2>/dev/null \
      || sed -i '' 's|^DATABASE_URL=.*|DATABASE_URL=sqlite:////app/data/app.db|' "$DECORAI_ROOT/.env"
    decorai_log "fixed .env DATABASE_URL → sqlite:////app/data/app.db (use DECORAI_ROOT/data on host)"
  fi
  # Host native deploy: absolute path under project data/
  local db_path="$DECORAI_ROOT/data/app.db"
  if grep -qE '^DATABASE_URL=sqlite:////app/' "$DECORAI_ROOT/.env" 2>/dev/null \
    || grep -qE '^DATABASE_URL=sqlite:///\.?/?\.?/data/' "$DECORAI_ROOT/.env" 2>/dev/null; then
    sed -i.bak "s|^DATABASE_URL=.*|DATABASE_URL=sqlite:///${db_path}|" "$DECORAI_ROOT/.env" 2>/dev/null \
      || sed -i '' "s|^DATABASE_URL=.*|DATABASE_URL=sqlite:///${db_path}|" "$DECORAI_ROOT/.env"
    decorai_log "native deploy: DATABASE_URL → sqlite:///${db_path}"
  fi
}

decorai_python_bin() {
  if [[ -x "$DECORAI_ROOT/.venv/bin/python" ]]; then
    printf '%s\n' "$DECORAI_ROOT/.venv/bin/python"
  elif [[ -x "$DECORAI_ROOT/.venv_local/bin/python" ]]; then
    printf '%s\n' "$DECORAI_ROOT/.venv_local/bin/python"
  elif command -v python3 >/dev/null 2>&1; then
    printf '%s\n' python3
  else
    printf '%s\n' python
  fi
}

decorai_log() {
  local line="[decorai $(date '+%Y-%m-%d %H:%M:%S')] $*"
  printf '%s\n' "$line"
  printf '%s\n' "$line" >>"${DECORAI_LOG_DIR}/deploy/service.log" 2>/dev/null || true
}

decorai_pid_file() {
  printf '%s/%s.pid\n' "$DECORAI_RUN_DIR" "$1"
}

decorai_is_running() {
  local pf="$1"
  [[ -f "$pf" ]] || return 1
  local pid
  pid="$(cat "$pf" 2>/dev/null)" || return 1
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

decorai_stop_pidfile() {
  local name="$1"
  local pf
  pf="$(decorai_pid_file "$name")"
  if decorai_is_running "$pf"; then
    local pid
    pid="$(cat "$pf")"
    kill "$pid" 2>/dev/null || true
    sleep 1
    kill -9 "$pid" 2>/dev/null || true
  fi
  rm -f "$pf"
}

decorai_wait_health() {
  local port="$1"
  local tries="${2:-30}"
  local i
  for ((i = 1; i <= tries; i++)); do
    if curl -fsS --max-time 3 "http://127.0.0.1:${port}/api/health" 2>/dev/null | grep -q '"status"'; then
      return 0
    fi
    sleep 2
  done
  return 1
}
