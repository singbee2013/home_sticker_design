#!/usr/bin/env bash
# 本机一键：提交并推送 Git → SSH 远端 git pull → 重启生产服务
#
# 用法（在项目根目录）:
#   bash scripts/push-and-deploy.sh
#   bash scripts/push-and-deploy.sh "fix: GPT Image 轮询"
#
# 可选环境变量:
#   SSH_KEY=~/.ssh/id_ed25519_sg
#   SSH_HOST=admin@43.98.182.55
#   REMOTE_DIR=/home/admin/home_sticker_design_api
#   DEPLOY_BRANCH=main          # 远端拉取分支，默认当前分支
#   SKIP_COMMIT=1               # 跳过 commit（仅 push + 部署）
#   SKIP_PUSH=1                 # 跳过 push（仅远端 pull + 重启）
#   SKIP_DEPLOY=1               # 仅 commit + push，不 SSH
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519_sg}"
SSH_HOST="${SSH_HOST:-admin@43.98.182.55}"
REMOTE_DIR="${REMOTE_DIR:-/home/admin/home_sticker_design_api}"
COMMIT_MSG="${1:-${DEPLOY_COMMIT_MSG:-}}"
BRANCH="${DEPLOY_BRANCH:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)}"

if [[ ! -f "$SSH_KEY" ]]; then
  echo "[push-and-deploy] 找不到 SSH 私钥: $SSH_KEY" >&2
  exit 1
fi

SSH_BASE=(ssh -o StrictHostKeyChecking=accept-new -i "$SSH_KEY" "$SSH_HOST")

echo "=========================================="
echo "  本机目录: $REPO_ROOT"
echo "  分支:     $BRANCH"
echo "  远端:     $SSH_HOST:$REMOTE_DIR"
echo "=========================================="

# ---------- 1. 本地提交并推送 ----------
if [[ "${SKIP_COMMIT:-0}" != "1" ]]; then
  if [[ -n "$(git status --porcelain 2>/dev/null)" ]]; then
    if [[ -z "$COMMIT_MSG" ]]; then
      COMMIT_MSG="deploy: $(date '+%Y-%m-%d %H:%M:%S')"
    fi
    echo ">>> git add -A && git commit …"
    git add -A
    # 避免误提交 .env（若曾被 track）
    if git diff --cached --name-only | grep -qx '\.env'; then
      git reset HEAD -- .env 2>/dev/null || true
      echo ">>> 已从暂存区移除 .env（请勿提交密钥）"
    fi
    if [[ -n "$(git diff --cached --name-only 2>/dev/null)" ]]; then
      git commit -m "$COMMIT_MSG"
    else
      echo ">>> 无有效暂存变更，跳过 commit"
    fi
  else
    echo ">>> 工作区干净，跳过 commit"
  fi
else
  echo ">>> SKIP_COMMIT=1，跳过 commit"
fi

if [[ "${SKIP_PUSH:-0}" != "1" ]]; then
  echo ">>> git push origin $BRANCH …"
  git push -u origin "$BRANCH"
else
  echo ">>> SKIP_PUSH=1，跳过 push"
fi

if [[ "${SKIP_DEPLOY:-0}" == "1" ]]; then
  echo ">>> SKIP_DEPLOY=1，部署结束。"
  exit 0
fi

# ---------- 2 & 3. 远端拉代码并重启 ----------
echo ">>> SSH 远端更新并重启 …"
"${SSH_BASE[@]}" "bash -s" -- "$REMOTE_DIR" "$BRANCH" <<'REMOTE_EOF'
set -euo pipefail
REMOTE_DIR="${1:?REMOTE_DIR missing}"
BRANCH="${2:-main}"

cd "$REMOTE_DIR"
echo ">>> 远端目录: $(pwd)"

if [[ ! -d .git ]]; then
  echo "错误: $REMOTE_DIR 不是 git 仓库，请先在服务器 git clone。" >&2
  exit 1
fi

echo ">>> git fetch / pull ($BRANCH) …"
git fetch origin "$BRANCH" 2>/dev/null || git fetch origin
git checkout "$BRANCH" 2>/dev/null || git checkout -B "$BRANCH" "origin/$BRANCH"
git pull --ff-only origin "$BRANCH" || git pull --ff-only

echo ">>> 停止旧进程 …"
bash scripts/stop-all.sh prod 2>/dev/null || true

echo ">>> 启动生产服务 …"
bash scripts/start-all.sh prod

echo ">>> 健康检查"
curl -fsS --connect-timeout 5 "http://127.0.0.1:${APP_PORT:-3000}/api/health" && echo ""
echo ">>> 远端部署完成"
REMOTE_EOF

echo "=========================================="
echo "  全部完成: https://sticker-design.com"
echo "  远端日志: $REMOTE_DIR/logs/"
echo "=========================================="
