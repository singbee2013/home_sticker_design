#!/usr/bin/env bash
# 在本机（Mac）执行：推送 Git → SSH 到新加坡服务器 → 调用 deploy-on-server.sh
#
# 一次性配置（复制到 ~/.zshrc 或每次部署前 export）：
#   export SSH_DEPLOY_HOST="ubuntu@你的服务器公网IP"
#   export SSH_DEPLOY_PATH="/home/ubuntu/home_sticker_design"   # 服务器上仓库路径
#   export PM2_APP_NAME="decor-ai"                                 # 与 pm2 list 里 name 一致
#
# 可选：
#   export DEPLOY_BRANCH="main"    # 默认 main
#   export SKIP_PUSH=1             # 已推送过，只触发服务器构建重启
#
# 执行：
#   bash scripts/deploy-from-local.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

: "${SSH_DEPLOY_HOST:?请先 export SSH_DEPLOY_HOST，例如 ubuntu@203.0.113.10}"
: "${SSH_DEPLOY_PATH:?请先 export SSH_DEPLOY_PATH，例如 /home/ubuntu/home_sticker_design}"
: "${PM2_APP_NAME:?请先 export PM2_APP_NAME，与服务器 pm2 list 中的 name 一致}"

BRANCH="${DEPLOY_BRANCH:-main}"

echo "=========================================="
echo "  本机项目: $ROOT"
echo "  SSH 目标: $SSH_DEPLOY_HOST"
echo "  远端路径: $SSH_DEPLOY_PATH"
echo "  分支:     $BRANCH"
echo "  PM2:      $PM2_APP_NAME"
echo "=========================================="

if [[ "${SKIP_PUSH:-0}" != "1" ]]; then
  if [[ -n "$(git status --porcelain 2>/dev/null)" ]]; then
    echo "提示：当前有未提交的修改。"
    echo "  部署到线上的应是已提交并推送的版本；请先 git add / commit，或暂存后再部署。"
    read -r -p "是否仍继续执行 git push？（可能推送失败） [y/N] " ans
    if [[ ! "${ans:-}" =~ ^[yY]$ ]]; then
      echo "已取消。"
      exit 1
    fi
  fi

  echo ">>> git push origin $BRANCH ..."
  git push origin "$BRANCH"
else
  echo ">>> 已设置 SKIP_PUSH=1，跳过 git push。"
fi

echo ">>> 通过 SSH 在服务器上执行 deploy-on-server.sh ..."
# 注意：SSH_DEPLOY_PATH 中勿含单引号；若路径特殊请改用 ssh 配置文件
ssh -o BatchMode=yes "$SSH_DEPLOY_HOST" "cd '${SSH_DEPLOY_PATH}' && PM2_APP_NAME='${PM2_APP_NAME}' bash scripts/deploy-on-server.sh '${BRANCH}' '${PM2_APP_NAME}'"

echo "=========================================="
echo "  本机触发的远端部署已完成。"
echo "=========================================="
