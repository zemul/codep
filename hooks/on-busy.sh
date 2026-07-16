#!/bin/bash
# Hook: UserPromptSubmit — AI 开始工作，写 busy + 直接切焦点到练习 pane
echo "busy" > "$HOME/codep/.ai-state"
# 直接切 tmux 焦点（如果在 codep session 里）
tmux select-pane -t "codep:0.1" 2>/dev/null
exit 0
