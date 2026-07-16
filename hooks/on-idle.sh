#!/bin/bash
# Hook: Stop — AI 完成回答，写 idle（焦点切换由 index.js 在单词间隙处理）
echo "idle" > "$HOME/codep/.ai-state"
exit 0
