#!/bin/bash
# Hook: Stop — AI 完成回答，写 idle 到状态文件
echo "idle" > "$HOME/codep/.ai-state"
exit 0
