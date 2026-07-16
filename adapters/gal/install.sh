#!/bin/bash
# GAL adapter 安装脚本
# 配置 pre_turn 和 post_turn hooks 到 ~/.gal/hooks.yaml

set -e

CODEP_HOME="${CODEP_HOME:-$HOME/codep}"
ADAPTER_DIR="$CODEP_HOME/adapters/gal"
GAL_DIR="$HOME/.gal"
GAL_HOOKS_FILE="$GAL_DIR/hooks.yaml"

mkdir -p "$GAL_DIR"

# 如果 hooks.yaml 不存在，创建一个空文件
if [ ! -f "$GAL_HOOKS_FILE" ]; then
  touch "$GAL_HOOKS_FILE"
fi

# 检查是否已经配置过
if grep -q "codep/adapters/gal/on-busy.sh" "$GAL_HOOKS_FILE" 2>/dev/null; then
  echo "✓ GAL hooks 已存在"
  exit 0
fi

# 追加 codep hooks 到 hooks.yaml
# 使用 Python 来安全地处理 YAML（避免破坏已有配置）
if command -v python3 &>/dev/null; then
  python3 -c "
import sys, os

hooks_file = '$GAL_HOOKS_FILE'
adapter_dir = '$ADAPTER_DIR'

# Read existing content
with open(hooks_file, 'r') as f:
    content = f.read()

# Entries to add
busy_entry = f'  - action: exec\n    command: {adapter_dir}/on-busy.sh\n'
idle_entry = f'  - action: exec\n    command: {adapter_dir}/on-idle.sh\n'

lines = content.rstrip().split('\n') if content.strip() else []

# Check if pre_turn section exists
has_pre_turn = any(l.rstrip() == 'pre_turn:' for l in lines)
has_post_turn = any(l.rstrip() == 'post_turn:' for l in lines)

if has_pre_turn:
    # Insert after pre_turn:
    idx = next(i for i, l in enumerate(lines) if l.rstrip() == 'pre_turn:')
    lines.insert(idx + 1, busy_entry.rstrip())
else:
    # Append pre_turn section
    if lines and lines[-1].strip():
        lines.append('')
    lines.append('pre_turn:')
    lines.append(busy_entry.rstrip())

if has_post_turn:
    # Insert after post_turn:
    idx = next(i for i, l in enumerate(lines) if l.rstrip() == 'post_turn:')
    lines.insert(idx + 1, idle_entry.rstrip())
else:
    # Append post_turn section
    if lines and lines[-1].strip():
        lines.append('')
    lines.append('post_turn:')
    lines.append(idle_entry.rstrip())

with open(hooks_file, 'w') as f:
    f.write('\n'.join(lines) + '\n')
"
else
  # Fallback: 直接追加（简单情况下可用）
  {
    echo ""
    echo "pre_turn:"
    echo "  - action: exec"
    echo "    command: $ADAPTER_DIR/on-busy.sh"
    echo ""
    echo "post_turn:"
    echo "  - action: exec"
    echo "    command: $ADAPTER_DIR/on-idle.sh"
  } >> "$GAL_HOOKS_FILE"
fi

echo "✅ GAL hooks 已配置到 $GAL_HOOKS_FILE"
