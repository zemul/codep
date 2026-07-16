#!/bin/bash
# Kiro CLI adapter 安装脚本
# 配置 userPromptSubmit 和 stop hooks 到 Kiro agent

set -e

CODEP_HOME="${CODEP_HOME:-$HOME/codep}"
ADAPTER_DIR="$CODEP_HOME/adapters/kiro"
KIRO_AGENTS_DIR="$HOME/.kiro/agents"
KIRO_AGENT_FILE="$KIRO_AGENTS_DIR/default.json"

mkdir -p "$KIRO_AGENTS_DIR"

# 如果 agent 文件不存在，创建一个最小配置
if [ ! -f "$KIRO_AGENT_FILE" ]; then
  cat > "$KIRO_AGENT_FILE" <<EOF
{
  "name": "default",
  "description": "Default agent with codep hooks",
  "tools": ["*"],
  "hooks": {}
}
EOF
fi

# 检查是否已经配置过
if grep -q "codep/adapters/kiro/on-busy.sh" "$KIRO_AGENT_FILE" 2>/dev/null; then
  echo "✓ Kiro hooks 已存在"
  exit 0
fi

# 注入 hooks 到 agent 配置
node -e "
  const fs = require('fs');
  const f = '$KIRO_AGENT_FILE';
  const s = JSON.parse(fs.readFileSync(f, 'utf8'));

  if (!s.hooks) s.hooks = {};

  // userPromptSubmit → on-busy
  if (!s.hooks.userPromptSubmit) s.hooks.userPromptSubmit = [];
  if (!JSON.stringify(s.hooks.userPromptSubmit).includes('on-busy.sh')) {
    s.hooks.userPromptSubmit.push({
      command: '$ADAPTER_DIR/on-busy.sh'
    });
  }

  // stop → on-idle
  if (!s.hooks.stop) s.hooks.stop = [];
  if (!JSON.stringify(s.hooks.stop).includes('on-idle.sh')) {
    s.hooks.stop.push({
      command: '$ADAPTER_DIR/on-idle.sh'
    });
  }

  fs.writeFileSync(f, JSON.stringify(s, null, 2) + '\n');
"
echo "✅ Kiro hooks 已配置到 $KIRO_AGENT_FILE"
