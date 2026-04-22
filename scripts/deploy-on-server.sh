#!/usr/bin/env bash
# 在新加坡服务器上执行：拉代码 → 安装依赖 → 构建 → 重启 PM2
#
# 用法（在服务器、项目根目录下）：
#   export PM2_APP_NAME=你的进程名
#   bash scripts/deploy-on-server.sh
#
# 或指定分支（默认 main）：
#   PM2_APP_NAME=你的进程名 bash scripts/deploy-on-server.sh develop
#
# 或同时指定分支与进程名（进程名会覆盖环境变量）：
#   bash scripts/deploy-on-server.sh main 你的进程名
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

BRANCH="${1:-main}"
if [[ -n "${2:-}" ]]; then
  export PM2_APP_NAME="$2"
fi

if [[ -z "${PM2_APP_NAME:-}" ]]; then
  echo "错误：未设置 PM2_APP_NAME。"
  echo "示例：export PM2_APP_NAME=decor-ai && bash scripts/deploy-on-server.sh"
  exit 1
fi

echo "=========================================="
echo "  项目目录: $ROOT"
echo "  Git 分支: $BRANCH"
echo "  PM2 名称: $PM2_APP_NAME"
echo "=========================================="

if ! command -v git >/dev/null 2>&1; then
  echo "错误：未找到 git，请先安装。"
  exit 1
fi

echo ">>> [1/4] git fetch / checkout / pull ..."
git fetch origin
# 若本地有未提交修改，checkout 可能失败；部署目录应仅为拉代码用途
git checkout "$BRANCH"
git pull origin "$BRANCH"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "错误：未找到 pnpm。"
  echo "可安装：curl -fsSL https://get.pnpm.io/install.sh | sh -"
  exit 1
fi

echo ">>> [2/4] pnpm install ..."
if [[ -f pnpm-lock.yaml ]] && pnpm install --frozen-lockfile; then
  :
else
  echo ">>> （若无 lock 或 frozen 失败则普通安装）pnpm install"
  pnpm install
fi

echo ">>> [3/4] pnpm build ..."
pnpm build

if ! command -v pm2 >/dev/null 2>&1; then
  echo "错误：未找到 pm2。安装：npm install -g pm2"
  exit 1
fi

echo ">>> [4/4] pm2 restart（携带 --update-env 以刷新 .env）..."
if pm2 describe "$PM2_APP_NAME" >/dev/null 2>&1; then
  pm2 restart "$PM2_APP_NAME" --update-env
else
  echo "错误：PM2 中不存在名为「$PM2_APP_NAME」的进程。"
  echo "请先在项目根目录完成首次启动，例如："
  echo "  cd \"$ROOT\""
  echo "  pnpm build"
  echo "  NODE_ENV=production pm2 start dist/index.js --name \"$PM2_APP_NAME\""
  echo "  pm2 save"
  exit 1
fi

echo "=========================================="
echo "  部署完成。"
echo "  查看日志: pm2 logs $PM2_APP_NAME"
echo "=========================================="
