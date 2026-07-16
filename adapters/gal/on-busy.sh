#!/bin/bash
# GAL Hook: pre_turn
# 用户输入进入 agent → 写 busy + 切焦点到练习 pane
CODEP_HOME="${CODEP_HOME:-$HOME/codep}"
echo "busy" > "$CODEP_HOME/.ai-state"
tmux select-pane -t "codep:0.1" 2>/dev/null
exit 0
