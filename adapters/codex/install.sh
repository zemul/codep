#!/bin/bash
# Codex CLI adapter 安装脚本
# 配置 UserPromptSubmit 和 Stop hooks 到 ~/.codex/hooks.json

set -e

CODEP_HOME="${CODEP_HOME:-$HOME/codep}"
ADAPTER_DIR="$CODEP_HOME/adapters/codex"
CODEX_DIR="$HOME/.codex"
HOOKS_FILE="$CODEX_DIR/hooks.json"

mkdir -p "$CODEX_DIR"

# 检查是否已经配置过
if [ -f "$HOOKS_FILE" ] && grep -q "codep/adapters/codex/on-busy.sh" "$HOOKS_FILE" 2>/dev/null; then
  echo "✓ Codex hooks 已存在"
  exit 0
fi

# 创建或合并 hooks.json
node -e "
  const fs = require('fs');
  const f = '$HOOKS_FILE';
  let cfg = { hooks: {} };
  if (fs.existsSync(f)) {
    try { cfg = JSON.parse(fs.readFileSync(f, 'utf8')); } catch(e) {}
  }
  if (!cfg.hooks) cfg.hooks = {};

  // UserPromptSubmit → on-busy
  if (!cfg.hooks.UserPromptSubmit) cfg.hooks.UserPromptSubmit = [];
  if (!JSON.stringify(cfg.hooks.UserPromptSubmit).includes('on-busy.sh')) {
    cfg.hooks.UserPromptSubmit.push({
      hooks: [{ type: 'command', command: '$ADAPTER_DIR/on-busy.sh' }]
    });
  }

  // Stop → on-idle
  if (!cfg.hooks.Stop) cfg.hooks.Stop = [];
  if (!JSON.stringify(cfg.hooks.Stop).includes('on-idle.sh')) {
    cfg.hooks.Stop.push({
      hooks: [{ type: 'command', command: '$ADAPTER_DIR/on-idle.sh' }]
    });
  }

  fs.writeFileSync(f, JSON.stringify(cfg, null, 2) + '\n');
"
echo "✅ Codex hooks 已配置到 $HOOKS_FILE"
