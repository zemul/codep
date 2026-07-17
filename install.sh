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
echo "  1) Claude Code（推荐）"
echo "  2) Codex CLI"
echo "  3) Kiro CLI"
echo "  4) GAL"
echo "  5) 全部配置"
echo "  6) 跳过（稍后用 codep --setup 配置）"
echo ""
printf "  请选择 [1-6，默认 1]: "
read -r choice < /dev/tty || choice="1"

case "${choice:-1}" in
  1)
    ADAPTERS="claude-code"
    ;;
  2)
    ADAPTERS="codex"
    ;;
  3)
    ADAPTERS="kiro"
    ;;
  4)
    ADAPTERS="gal"
    ;;
  5)
    ADAPTERS="claude-code codex kiro gal"
    ;;
  6)
    ADAPTERS=""
    ;;
  *)
    ADAPTERS="claude-code"
    ;;
esac

# 安装选中的 adapter
for ADAPTER in $ADAPTERS; do
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
done

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
