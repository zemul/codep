#!/bin/bash
# Codep - AI 等待时间背单词
# 用法: codep [claude 参数...]

SPELL_GUARD_DIR="$(cd "$(dirname "$(readlink -f "$0" 2>/dev/null || realpath "$0" 2>/dev/null || echo "$0")")" && pwd)"
SESSION_NAME="codep"
STATE_FILE="$SPELL_GUARD_DIR/.ai-state"

# 检查 tmux
if ! command -v tmux &>/dev/null; then
  echo "❌ 需要安装 tmux"
  echo "   macOS: brew install tmux"
  echo "   Linux: sudo apt install tmux"
  exit 1
fi

# 检查 claude
if ! command -v claude &>/dev/null; then
  echo "❌ 找不到 claude 命令"
  exit 1
fi

# 自动配置 Claude Code Hooks（幂等）
CLAUDE_SETTINGS="$HOME/.claude/settings.json"
mkdir -p "$HOME/.claude"
if [ ! -f "$CLAUDE_SETTINGS" ]; then
  echo '{}' > "$CLAUDE_SETTINGS"
fi

# 检查是否已有 codep hooks
if ! grep -q "codep/hooks/on-busy.sh" "$CLAUDE_SETTINGS" 2>/dev/null; then
  echo "📝 正在配置 Claude Code Hooks..."
  # 用 node 安全地合并 JSON（避免 jq 依赖）
  node -e "
    const fs = require('fs');
    const f = '$CLAUDE_SETTINGS';
    const s = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (!s.hooks) s.hooks = {};
    if (!s.hooks.UserPromptSubmit) s.hooks.UserPromptSubmit = [];
    if (!s.hooks.Stop) s.hooks.Stop = [];
    const busyHook = { hooks: [{ type: 'command', command: '$SPELL_GUARD_DIR/hooks/on-busy.sh' }] };
    const idleHook = { hooks: [{ type: 'command', command: '$SPELL_GUARD_DIR/hooks/on-idle.sh' }] };
    const hasBusy = JSON.stringify(s.hooks.UserPromptSubmit).includes('on-busy.sh');
    const hasIdle = JSON.stringify(s.hooks.Stop).includes('on-idle.sh');
    if (!hasBusy) s.hooks.UserPromptSubmit.push(busyHook);
    if (!hasIdle) s.hooks.Stop.push(idleHook);
    fs.writeFileSync(f, JSON.stringify(s, null, 2));
  "
  echo "✅ Hooks 已配置"
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
  "claude $*; echo idle > $STATE_FILE; tmux kill-session -t $SESSION_NAME"

# 右边开练习 pane（占 40% 宽度）
tmux split-window -h -t "$SESSION_NAME" -l 40% \
  "node $SPELL_GUARD_DIR/index.js"

# 焦点放在左边 claude
tmux select-pane -t "$SESSION_NAME:0.0"

# attach 到 session
tmux attach -t "$SESSION_NAME"

# 退出后清理
rm -f "$STATE_FILE"
