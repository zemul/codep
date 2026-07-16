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
chmod +x "$INSTALL_DIR/adapters/claude-code/on-busy.sh"
chmod +x "$INSTALL_DIR/adapters/claude-code/on-idle.sh"
chmod +x "$INSTALL_DIR/adapters/claude-code/install.sh"

# 配置默认 adapter（Claude Code）
echo "🔗 配置 AI adapter..."
CODEP_HOME="$INSTALL_DIR" bash "$INSTALL_DIR/adapters/claude-code/install.sh"

# 创建软链接到 PATH
if [ -d "/usr/local/bin" ]; then
  ln -sf "$INSTALL_DIR/codep.sh" /usr/local/bin/codep 2>/dev/null || \
    sudo ln -sf "$INSTALL_DIR/codep.sh" /usr/local/bin/codep
fi

echo ""
echo "✅ 安装完成！"
echo ""
echo "   直接运行："
echo "   codep"
echo ""
