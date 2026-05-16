#!/usr/bin/env bash
# 服务器一次性：安装 Python 3.10+ 并创建项目 .venv
# 用法：bash scripts/setup-server-python.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

decorai_init_paths
cd "$DECORAI_ROOT"

echo "=== 当前系统 Python ==="
python3 -V 2>&1 || true
python3 -m pip --version 2>&1 || true

if decorai_find_system_python >/dev/null; then
  echo "=== 已找到可用 Python: $(decorai_find_system_python) ==="
  decorai_find_system_python -V
else
  echo "=== 未找到 Python 3.10+，尝试安装 python3.11 ==="
  if command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y python3.11 python3.11-pip python3.11-devel gcc
  elif command -v yum >/dev/null 2>&1; then
    sudo yum install -y python3.11 python3.11-pip python3.11-devel gcc
  else
    echo "请手动安装 Python 3.10 或更高版本后重试" >&2
    exit 1
  fi
fi

if [[ -d .venv ]]; then
  old_ver="$(.venv/bin/python -V 2>&1 || true)"
  if ! .venv/bin/python -c "import sys; assert sys.version_info[:2] >= (3,10)" 2>/dev/null; then
    echo "=== 删除过旧的 .venv ($old_ver) ==="
    rm -rf .venv
  fi
fi

py="$(decorai_ensure_venv)"
echo "=== 完成 ==="
echo "venv: $py"
"$py" -V
"$py" -m pip --version
echo "下一步: bash scripts/start-all.sh prod"
