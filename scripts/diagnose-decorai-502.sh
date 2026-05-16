#!/usr/bin/env bash
# 在服务器执行，检查 502 常见原因（无需项目目录）。
set -euo pipefail
echo "=== curl 本机 3000 ==="
curl -sS --connect-timeout 3 http://127.0.0.1:3000/api/health && echo "" || echo "FAIL: 后端未监听 3000 → 先 cd 项目目录再 podman-compose up -d app"
echo "=== 监听 3000 ==="
ss -tlnp 2>/dev/null | grep -E ':3000\b' || echo "(无)"
echo "=== Podman 容器 ==="
podman ps -a --filter name=decorai-app --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null || true
if getenforce 2>/dev/null | grep -q Enforcing; then
  echo "=== SELinux Enforcing：若 curl 正常但网站 502，可执行 ==="
  echo "    sudo setsebool -P httpd_can_network_connect 1 && sudo systemctl reload nginx"
fi
if id nginx >/dev/null 2>&1; then
  echo "=== 以 nginx 用户请求（模拟 worker）==="
  sudo -u nginx curl -sS --connect-timeout 3 http://127.0.0.1:3000/api/health && echo "" || echo "FAIL: nginx 用户访问不到后端"
fi
