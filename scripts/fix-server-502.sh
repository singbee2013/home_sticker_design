#!/usr/bin/env bash
# 在服务器上执行：自动进入项目目录 → 停旧容器 → 构建并启动 app → 等待本机 3000 可用。
# 用法：
#   bash scripts/fix-server-502.sh
#   bash scripts/fix-server-502.sh /home/admin/home_sticker_design_api
#   REMOTE_ROOT=/path/to/repo bash scripts/fix-server-502.sh
set -euo pipefail

ROOT="${REMOTE_ROOT:-${1:-}}"
if [[ -z "$ROOT" ]]; then
  for d in "$HOME/home_sticker_design_api" "$HOME/home_sticker_design" "/home/admin/home_sticker_design_api"; do
    [[ -f "$d/docker-compose.yml" ]] && ROOT="$d" && break
  done
fi
if [[ -z "${ROOT:-}" ]] || [[ ! -f "$ROOT/docker-compose.yml" ]]; then
  echo "[fix-server-502] 找不到 docker-compose.yml。请指定目录，例如：" >&2
  echo "  bash scripts/fix-server-502.sh /home/admin/home_sticker_design_api" >&2
  exit 1
fi
cd "$ROOT"
echo "[fix-server-502] 项目目录: $ROOT"

# 修正 .env 里错误的相对数据库路径（避免连到容器内临时库 → 历史/图片「消失」）
if [[ -f .env ]]; then
  if grep -qE '^DATABASE_URL=sqlite:///\.?/?\.?/data/app\.db' .env 2>/dev/null; then
    if grep -q '^DATABASE_URL=' .env; then
      sed -i.bak 's|^DATABASE_URL=.*|DATABASE_URL=sqlite:////app/data/app.db|' .env
    else
      echo 'DATABASE_URL=sqlite:////app/data/app.db' >> .env
    fi
    echo "[fix-server-502] 已修正 .env → DATABASE_URL=sqlite:////app/data/app.db"
  fi
else
  echo "[fix-server-502] 提示: 无 .env，compose 将使用默认 sqlite:////app/data/app.db"
fi

# 叠 docker-compose.podman-host.yml（可选）：仅当 export DECORAI_USE_PODMAN_HOST_COMPOSE=1 时启用（默认不用，避免与部分环境不兼容）。
_compose_files=(-f docker-compose.yml)
if [[ -f docker-compose.podman-host.yml ]] && [[ "${DECORAI_USE_PODMAN_HOST_COMPOSE:-0}" == "1" ]]; then
  _compose_files+=(-f docker-compose.podman-host.yml)
  echo "[fix-server-502] 已启用 podman-host 叠加"
fi

compose() {
  if command -v podman-compose >/dev/null 2>&1; then
    podman-compose "${_compose_files[@]}" "$@"
  elif command -v docker >/dev/null 2>&1; then
    docker compose "${_compose_files[@]}" "$@"
  else
    echo "[fix-server-502] 需要 podman-compose 或 docker compose" >&2
    exit 1
  fi
}

echo "[fix-server-502] 清理可能卡住的 decorai-app（Podman lock / 名称占用）…"
if command -v podman >/dev/null 2>&1; then
  podman stop -t 0 decorai-app 2>/dev/null || true
  podman rm -f decorai-app 2>/dev/null || true
fi
echo "[fix-server-502] 停止旧栈（忽略错误）"
compose down 2>/dev/null || true

echo "[fix-server-502] 构建 app 镜像…"
if ! compose build app; then
  echo "[fix-server-502] build 失败，尝试无缓存重建…" >&2
  compose build --no-cache app
fi

echo "[fix-server-502] 启动 app 容器（--force-recreate 避免「名称占用」后误 podman start 旧容器）…"
if compose up -d --force-recreate app 2>/dev/null; then
  :
else
  echo "[fix-server-502] 警告: --force-recreate 不支持或失败，尝试普通 up…" >&2
  compose up -d app
fi
sleep 2
# 若 compose 因名称冲突只执行了 start，旧容器可能没有 3000 映射 → 再删一次并 up
if ! curl -sfS --connect-timeout 2 "http://127.0.0.1:3000/api/health" 2>/dev/null | grep -q '"status"'; then
  if command -v podman >/dev/null 2>&1; then
    echo "[fix-server-502] 本机 3000 仍不可达，二次清理 decorai-app 后重试…"
    podman stop -t 0 decorai-app 2>/dev/null || true
    podman rm -f decorai-app 2>/dev/null || true
    compose up -d app
    sleep 2
  fi
fi

echo "[fix-server-502] 等待 http://127.0.0.1:3000 （最多约 120s）…"
ok=0
for _ in $(seq 1 60); do
  if curl -sfS --connect-timeout 2 "http://127.0.0.1:3000/api/health" 2>/dev/null | grep -q '"status"'; then
    echo "[fix-server-502] 健康检查通过:"
    curl -sS "http://127.0.0.1:3000/api/health"
    echo ""
    ok=1
    break
  fi
  # 旧镜像可能没有 /api/health：至少首页能通说明进程在听
  if curl -sfS --connect-timeout 2 -o /dev/null "http://127.0.0.1:3000/" 2>/dev/null; then
    echo "[fix-server-502] 警告: /api/health 不可用但 / 已响应；建议更新镜像后重试。"
    ok=1
    break
  fi
  sleep 2
done

if [[ "$ok" != 1 ]]; then
  echo "[fix-server-502] 仍无法连接 127.0.0.1:3000。诊断信息：" >&2
  (command -v podman >/dev/null 2>&1 && podman ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}') || true
  (command -v podman >/dev/null 2>&1 && podman port decorai-app 2>/dev/null) || true
  (command -v ss >/dev/null 2>&1 && ss -tlnp 2>/dev/null | grep -E ':3000\b' || true) || true
  echo "[fix-server-502] 若使用 bridge 模式且 PORTS 列为空：确认 compose 端口映射；建议改用 docker-compose.podman-host.yml。" >&2
  (command -v ss >/dev/null 2>&1 && ss -tlnp 2>/dev/null | grep -E '127\.0\.0\.1:3000|:3000' || true) || true
  (command -v podman >/dev/null 2>&1 && podman logs --tail 120 decorai-app) 2>/dev/null || true
  (command -v docker >/dev/null 2>&1 && docker logs --tail 120 decorai-app) 2>/dev/null || true
  exit 1
fi

echo "[fix-server-502] 校验容器内数据库与静态目录…"
if command -v podman >/dev/null 2>&1 && podman ps --format '{{.Names}}' 2>/dev/null | grep -qx decorai-app; then
  podman exec decorai-app python -c "
from app.config import get_settings
from pathlib import Path
s = get_settings()
print('DATABASE_URL=', s.DATABASE_URL)
p = Path(s.DATABASE_URL.replace('sqlite:///', ''))
print('db_exists=', p.is_file(), 'size=', p.stat().st_size if p.is_file() else 0)
st = Path(s.STORAGE_LOCAL_PATH) / 'generated'
print('generated_dir=', st, 'files=', len(list(st.glob('*'))) if st.is_dir() else 0)
" 2>/dev/null || true
fi

echo "[fix-server-502] 完成。请在浏览器强刷站点（并关闭 Chrome「翻译此网站」以免 Gemini 显示为双子座）。"
echo "[fix-server-502] 重要：以后必须在项目目录执行 compose，例如："
echo "         cd $ROOT && podman-compose -f docker-compose.yml up -d app"
echo "         切勿在 ~ 家目录执行，否则会 missing files、容器未起、全站 502。"
if command -v getenforce >/dev/null 2>&1 && [[ "$(getenforce 2>/dev/null)" == "Enforcing" ]]; then
  echo "[fix-server-502] 若 Nginx 仍 502 但本机 curl 127.0.0.1:3000 正常，试 SELinux："
  echo "         sudo setsebool -P httpd_can_network_connect 1 && sudo systemctl reload nginx"
fi
