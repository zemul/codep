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
find "$INSTALL_DIR/adapters" -name "*.sh" -exec chmod +x {} \;

# 选择 AI agent adapter
echo "🤖 你使用哪个 AI agent？"
echo ""
echo "  1) Claude Code（推荐，自动配置 hooks）"
echo "  2) Codex CLI"
echo "  3) Kiro CLI"
echo "  4) 其他 / 手动配置"
echo ""
printf "  请选择 [1-4，默认 1]: "

# 支持 pipe 模式（curl | bash 时无法交互，默认选 1）
if [ -t 0 ]; then
  read -r choice
else
  choice="1"
  echo "1（非交互模式，默认 Claude Code）"
fi

case "${choice:-1}" in
  1)
    ADAPTER="claude-code"
    ;;
  2)
    ADAPTER="codex"
    ;;
  3)
    ADAPTER="kiro"
    ;;
  4)
    ADAPTER=""
    ;;
  *)
    ADAPTER="claude-code"
    ;;
esac

# 安装选中的 adapter
if [ -n "$ADAPTER" ]; then
  ADAPTER_INSTALL="$INSTALL_DIR/adapters/$ADAPTER/install.sh"
  if [ -f "$ADAPTER_INSTALL" ]; then
    echo ""
    echo "🔗 配置 $ADAPTER adapter..."
    CODEP_HOME="$INSTALL_DIR" bash "$ADAPTER_INSTALL"
  else
    echo ""
    echo "⚠️  $ADAPTER adapter 暂未实现，欢迎贡献！"
    echo "   参考: $INSTALL_DIR/adapters/README.md"
  fi
else
  echo ""
  echo "ℹ️  跳过 adapter 配置。"
  echo "   手动配置方法见: $INSTALL_DIR/adapters/README.md"
fi

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
