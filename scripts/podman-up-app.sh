#!/usr/bin/env bash
# 已改为原生部署；此脚本转调 start-all.sh prod（不再使用 Podman/Docker）。
echo "[podman-up-app] 已弃用容器模式，使用原生进程启动…" >&2
exec "$(cd "$(dirname "$0")" && pwd)/start-all.sh" prod "$@"
