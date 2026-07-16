# Spell Guard - shell integration
# 添加到 ~/.zshrc，劫持 claude 命令实现自动联动

SPELL_GUARD_DIR="$HOME/spell-guard"
SPELL_GUARD_STATE="$SPELL_GUARD_DIR/.ai-state"

# 启动 spell-guard 右侧 pane
_spell_guard_open_pane() {
  osascript <<'EOF' 2>/dev/null
tell application "iTerm2"
  tell current session of current tab of current window
    set spellPane to (split vertically with default profile)
  end tell
  tell spellPane
    write text "printf '\\e]0;spell-guard\\a' && cd ~/spell-guard && node index.js"
  end tell
end tell
EOF
}

# 关闭 spell-guard
_spell_guard_close_pane() {
  pkill -f 'node.*spell-guard/index.js' 2>/dev/null || true
  # 关闭 iTerm2 中的 spell-guard session
  osascript -e '
tell application "iTerm2"
  tell current tab of current window
    repeat with s in sessions
      if name of s contains "spell-guard" then
        tell s to close
        exit repeat
      end if
    end repeat
  end tell
end tell
' 2>/dev/null || true
}

# 包装 claude 命令
spell-guard-claude() {
  # 初始状态：idle
  echo "idle" > "$SPELL_GUARD_STATE"

  # 打开右侧练习 pane
  _spell_guard_open_pane

  # 启动独立监控脚本（后台，抑制 job 信息）
  { "$SPELL_GUARD_DIR/monitor.sh" & } 2>/dev/null
  local monitor_pid=$!

  # 运行真正的 claude
  command claude "$@"

  # claude 退出后清理
  kill $monitor_pid 2>/dev/null
  wait $monitor_pid 2>/dev/null
  _spell_guard_close_pane
  rm -f "$SPELL_GUARD_STATE"
}

# 劫持 claude 命令
alias claude='spell-guard-claude'
