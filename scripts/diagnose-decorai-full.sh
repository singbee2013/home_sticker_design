#!/usr/bin/env bash
# 一键诊断：502、数据库路径、历史图片是否还在磁盘上。
# 用法: bash scripts/diagnose-decorai-full.sh [/home/admin/home_sticker_design_api]
set -euo pipefail

ROOT="${1:-${REMOTE_ROOT:-}}"
if [[ -z "$ROOT" ]]; then
  for d in "$HOME/home_sticker_design_api" "/home/admin/home_sticker_design_api"; do
    [[ -f "$d/docker-compose.yml" ]] && ROOT="$d" && break
  done
fi
[[ -n "$ROOT" ]] && cd "$ROOT" || { echo "找不到项目目录" >&2; exit 1; }

echo "=== 1. 本机健康 ==="
curl -sS --connect-timeout 3 http://127.0.0.1:3000/api/health && echo "" || echo "FAIL: 3000 无响应"

echo "=== 2. 容器与端口 ==="
podman ps -a --filter name=decorai-app --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null || true

echo "=== 3. .env 数据库路径 ==="
grep '^DATABASE_URL=' .env 2>/dev/null || echo "(无 .env 或 DATABASE_URL)"

echo "=== 4. 宿主机数据库与最近任务 ==="
if [[ -f data/app.db ]]; then
  echo "data/app.db size=$(stat -c%s data/app.db 2>/dev/null || stat -f%z data/app.db)"
  sqlite3 data/app.db "SELECT id, status, substr(result_path,1,60) FROM generation_tasks WHERE is_deleted=0 ORDER BY id DESC LIMIT 5;" 2>/dev/null || echo "(sqlite3 不可用)"
else
  echo "WARN: data/app.db 不存在"
fi

echo "=== 5. 静态图文件抽样 ==="
if [[ -d static/generated ]]; then
  ls -la static/generated 2>/dev/null | tail -8
  for id in $(sqlite3 data/app.db "SELECT id FROM generation_tasks WHERE is_deleted=0 AND result_path IS NOT NULL ORDER BY id DESC LIMIT 3;" 2>/dev/null); do
    path=$(sqlite3 data/app.db "SELECT result_path FROM generation_tasks WHERE id=$id;" 2>/dev/null)
    [[ -n "$path" ]] && ls -la "static/$path" 2>&1 || echo "MISSING static/$path"
  done
else
  echo "WARN: static/generated 不存在"
fi

echo "=== 6. API 模型列表 ==="
curl -sS --connect-timeout 3 http://127.0.0.1:3000/api/ai/providers && echo ""

echo "=== 建议 ==="
echo "若 build 后仍报 name already in use: bash scripts/fix-server-502.sh"
echo "若任务在库但图片 MISSING: 文件已删，只能重新生成；勿只删 static/generated"
echo "若网页显示「双子座」: 关闭 Chrome 对此站的自动翻译"
