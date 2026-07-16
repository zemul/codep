#!/bin/bash
# Codep 一键安装脚本
# 用法: curl -fsSL https://raw.githubusercontent.com/zemul/codep/main/install.sh | bash

set -e

INSTALL_DIR="$HOME/codep"
REPO="https://github.com/zemul/codep.git"

echo "⌨️  Codep 安装中..."
echo ""

# 检查依赖
check_dep() {
  if ! command -v "$1" &>/dev/null; then
    echo "❌ 需要 $1"
    echo "   $2"
    exit 1
  fi
}

check_dep git "请安装 git"
check_dep node "请安装 Node.js 16+: https://nodejs.org"
check_dep tmux "macOS: brew install tmux / Linux: sudo apt install tmux"
check_dep claude "请安装 Claude Code: https://docs.anthropic.com/en/docs/claude-code"

# 克隆或更新
if [ -d "$INSTALL_DIR" ]; then
  echo "📦 更新已有安装..."
  git -C "$INSTALL_DIR" pull --quiet
else
  echo "📦 克隆到 $INSTALL_DIR..."
  git clone --quiet "$REPO" "$INSTALL_DIR"
fi

# 确保脚本可执行
chmod +x "$INSTALL_DIR/codep.sh"
chmod +x "$INSTALL_DIR/hooks/on-busy.sh"
chmod +x "$INSTALL_DIR/hooks/on-idle.sh"

# 配置 Claude Code Hooks
CLAUDE_SETTINGS="$HOME/.claude/settings.json"
mkdir -p "$HOME/.claude"
if [ ! -f "$CLAUDE_SETTINGS" ]; then
  echo '{}' > "$CLAUDE_SETTINGS"
fi

if ! grep -q "spell-guard/hooks/on-busy.sh" "$CLAUDE_SETTINGS" 2>/dev/null; then
  echo "🔗 配置 Claude Code Hooks..."
  node -e "
    const fs = require('fs');
    const f = '$CLAUDE_SETTINGS';
    const s = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (!s.hooks) s.hooks = {};
    if (!s.hooks.UserPromptSubmit) s.hooks.UserPromptSubmit = [];
    if (!s.hooks.Stop) s.hooks.Stop = [];
    const busyHook = { hooks: [{ type: 'command', command: '$INSTALL_DIR/hooks/on-busy.sh' }] };
    const idleHook = { hooks: [{ type: 'command', command: '$INSTALL_DIR/hooks/on-idle.sh' }] };
    if (!JSON.stringify(s.hooks.UserPromptSubmit).includes('on-busy.sh')) s.hooks.UserPromptSubmit.push(busyHook);
    if (!JSON.stringify(s.hooks.Stop).includes('on-idle.sh')) s.hooks.Stop.push(idleHook);
    fs.writeFileSync(f, JSON.stringify(s, null, 2));
  "
fi

# 添加 alias（如果没有）
SHELL_RC="$HOME/.zshrc"
[ -f "$HOME/.bashrc" ] && [ ! -f "$HOME/.zshrc" ] && SHELL_RC="$HOME/.bashrc"

if ! grep -q "alias codep=" "$SHELL_RC" 2>/dev/null; then
  echo "" >> "$SHELL_RC"
  echo "# Codep - AI 等待时间背单词" >> "$SHELL_RC"
  echo "alias codep=\"$INSTALL_DIR/codep.sh\"" >> "$SHELL_RC"
fi

echo ""
echo "✅ 安装完成！"
echo ""
echo "   使用方法："
echo "   codep          # 启动（需要新开终端或 source ~/.zshrc）"
echo "   codep --model sonnet  # 带 claude 参数"
echo ""
echo "   或直接运行："
echo "   ~/codep/codep.sh"
echo ""
