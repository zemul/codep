#!/bin/bash
# Codep - AI 等待时间背单词
# 用法: codep [-a kiro|claude] [AI agent 参数...]

SPELL_GUARD_DIR="$(cd "$(dirname "$(readlink -f "$0" 2>/dev/null || realpath "$0" 2>/dev/null || echo "$0")")" && pwd)"
SESSION_NAME="codep"
STATE_FILE="$SPELL_GUARD_DIR/.ai-state"

# 解析参数
while [[ $# -gt 0 ]]; do
  case "$1" in
    --update)
      echo "📦 更新 Codep..."
      git -C "$SPELL_GUARD_DIR" pull
      echo "✅ 更新完成"
      exit 0
      ;;
    --import)
      FILE="$2"
      if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
        echo "❌ 用法: codep --import <词库.json>"
        echo "   文件格式: [{\"name\": \"word\", \"trans\": [\"释义\"]}, ...]"
        exit 1
      fi
      # 验证 JSON 格式
      if ! node -e "const d=JSON.parse(require('fs').readFileSync('$FILE','utf8')); if(!Array.isArray(d))throw new Error('not array'); if(!d[0].name)throw new Error('missing name field'); console.log(d.length+' 个单词')" 2>/dev/null; then
        echo "❌ JSON 格式不对"
        echo "   需要: [{\"name\": \"word\", \"trans\": [\"释义\"]}, ...]"
        exit 1
      fi
      # 复制到 dicts 目录
      BASENAME="$(basename "$FILE")"
      cp "$FILE" "$SPELL_GUARD_DIR/dicts/$BASENAME"
      # 计算词数
      COUNT=$(node -e "process.stdout.write(String(JSON.parse(require('fs').readFileSync('$FILE','utf8')).length))")
      DICT_ID="${BASENAME%.json}"
      # 注册到 index.js（如果还没注册）
      if ! grep -q "\"$DICT_ID\"" "$SPELL_GUARD_DIR/index.js"; then
        node -e "
          const fs = require('fs');
          const f = '$SPELL_GUARD_DIR/index.js';
          let code = fs.readFileSync(f, 'utf8');
          const entry = '  { id: \"$DICT_ID\", name: \"$DICT_ID\", file: \"$BASENAME\", description: \"${COUNT} 词 (导入)\" },';
          code = code.replace(
            /^(const DICT_REGISTRY = \[)/m,
            '\$1\n' + entry
          );
          fs.writeFileSync(f, code);
        "
      fi
      echo "✅ 已导入: $BASENAME ($COUNT 个单词)"
      echo "   重启 codep 后可选择该词库"
      exit 0
      ;;
    -h|--help)
      echo "Codep ⌨️  AI 等待时间背单词"
      echo ""
      echo "用法: codep [选项] [AI agent 参数...]"
      echo ""
      echo "选项:"
      echo "  -a, --agent <name>  指定 AI agent（claude-code / kiro / codex）"
      echo "  --import <file>     导入自定义词库 JSON"
      echo "  --update            更新到最新版本"
      echo "  -h, --help          显示帮助"
      echo ""
      echo "示例:"
      echo "  codep                    # 自动检测 agent"
      echo "  codep -a kiro            # 使用 Kiro CLI"
      echo "  codep -a claude-code     # 使用 Claude Code"
      echo "  codep --model sonnet     # 传参数给 AI agent"
      echo ""
      echo "练习快捷键:"
      echo "  Tab    偷看（闪现单词+释义 1s）"
      echo "  ^H     隐藏/显示单词"
      echo "  ^D     隐藏/显示释义"
      echo "  ^F     开关专注模式（练完整章再切回）"
      echo "  ^S     静音/开声"
      echo "  q      退出章节"
      echo ""
      echo "https://github.com/zemul/codep"
      exit 0
      ;;
    -a|--agent)
      CODEP_AGENT="$2"
      shift 2
      ;;
    --agent=*)
      CODEP_AGENT="${1#*=}"
      shift
      ;;
    *)
      break
      ;;
  esac
done

# 检查 tmux
if ! command -v tmux &>/dev/null; then
  echo "📦 未检测到 tmux，正在安装..."
  if [[ "$OSTYPE" == "darwin"* ]]; then
    if command -v brew &>/dev/null; then
      brew install tmux
    else
      echo "❌ 需要先安装 Homebrew: https://brew.sh"
      exit 1
    fi
  elif command -v apt &>/dev/null; then
    sudo apt install -y tmux
  elif command -v yum &>/dev/null; then
    sudo yum install -y tmux
  else
    echo "❌ 无法自动安装 tmux，请手动安装"
    exit 1
  fi
fi

# 自动检测 adapter
if [ -n "$CODEP_AGENT" ]; then
  ADAPTER="$CODEP_AGENT"
elif command -v claude &>/dev/null; then
  ADAPTER="claude-code"
elif command -v kiro-cli &>/dev/null; then
  ADAPTER="kiro"
elif command -v codex &>/dev/null; then
  ADAPTER="codex"
else
  echo "❌ 找不到支持的 AI agent（claude / kiro-cli / codex）"
  echo "   支持: claude, kiro-cli, codex"
  echo "   或设置 CODEP_AGENT=<agent名>"
  exit 1
fi

# 确定 AI 启动命令
case "$ADAPTER" in
  kiro)
    AI_CMD="kiro-cli chat"
    ;;
  claude-code)
    AI_CMD="claude"
    ;;
  codex)
    AI_CMD="codex"
    ;;
  *)
    AI_CMD="$ADAPTER"
    ;;
esac

# 自动配置 adapter hooks
ADAPTER_INSTALL="$SPELL_GUARD_DIR/adapters/$ADAPTER/install.sh"
if [ -f "$ADAPTER_INSTALL" ]; then
  CODEP_HOME="$SPELL_GUARD_DIR" bash "$ADAPTER_INSTALL"
fi

# 如果已经在 tmux 里，不要嵌套
if [ -n "$TMUX" ]; then
  echo "❌ 已经在 tmux 里了，请先退出当前 tmux 会话"
  exit 1
fi

# 清理旧状态
echo "idle" > "$STATE_FILE"

# 杀掉旧的 session（如果存在）
tmux kill-session -t "$SESSION_NAME" 2>/dev/null

# spell-guard 专用 tmux 配置（不影响用户自己的 .tmux.conf）
TMUX_CONF="$SPELL_GUARD_DIR/.tmux.conf"
cat > "$TMUX_CONF" <<'CONF'
# 非焦点 pane 变暗
set -g window-style 'bg=colour235'
set -g window-active-style 'bg=colour0'
# 边框颜色
set -g pane-border-style 'fg=colour238'
set -g pane-active-border-style 'fg=colour39'
# 256 色
set -g default-terminal "xterm-256color"
# 鼠标支持
set -g mouse on
# 隐藏状态栏（更沉浸）
set -g status off
CONF

# 创建 tmux session（使用自定义配置）
tmux -f "$TMUX_CONF" new-session -d -s "$SESSION_NAME" -x "$(tput cols)" -y "$(tput lines)" \
  "$AI_CMD $*; echo idle > $STATE_FILE; tmux kill-session -t $SESSION_NAME"

# 右边开练习 pane（占 40% 宽度）
tmux split-window -h -t "$SESSION_NAME" -l 40% \
  "node $SPELL_GUARD_DIR/index.js"

# 焦点放在左边 claude
tmux select-pane -t "$SESSION_NAME:0.0"

# attach 到 session
tmux attach -t "$SESSION_NAME"

# 退出后清理
rm -f "$STATE_FILE"
