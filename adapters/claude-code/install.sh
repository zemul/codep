#!/bin/bash
# Claude Code adapter 安装脚本
# 配置 UserPromptSubmit 和 Stop hooks

set -e

CODEP_HOME="${CODEP_HOME:-$HOME/codep}"
ADAPTER_DIR="$CODEP_HOME/adapters/claude-code"
CLAUDE_SETTINGS="$HOME/.claude/settings.json"

mkdir -p "$HOME/.claude"
if [ ! -f "$CLAUDE_SETTINGS" ]; then
  echo '{}' > "$CLAUDE_SETTINGS"
fi

if ! grep -q "codep/adapters/claude-code/on-busy.sh" "$CLAUDE_SETTINGS" 2>/dev/null; then
  node -e "
    const fs = require('fs');
    const f = '$CLAUDE_SETTINGS';
    const s = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (!s.hooks) s.hooks = {};
    if (!s.hooks.UserPromptSubmit) s.hooks.UserPromptSubmit = [];
    if (!s.hooks.Stop) s.hooks.Stop = [];
    const busyHook = { hooks: [{ type: 'command', command: '$ADAPTER_DIR/on-busy.sh' }] };
    const idleHook = { hooks: [{ type: 'command', command: '$ADAPTER_DIR/on-idle.sh' }] };
    if (!JSON.stringify(s.hooks.UserPromptSubmit).includes('on-busy.sh')) s.hooks.UserPromptSubmit.push(busyHook);
    if (!JSON.stringify(s.hooks.Stop).includes('on-idle.sh')) s.hooks.Stop.push(idleHook);
    fs.writeFileSync(f, JSON.stringify(s, null, 2));
  "
  echo "✅ Claude Code hooks 已配置"
else
  echo "✓ Claude Code hooks 已存在"
fi
