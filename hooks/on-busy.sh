#!/bin/bash
# Hook: UserPromptSubmit — AI 开始工作，写 busy 到状态文件
echo "busy" > "$HOME/codep/.ai-state"
exit 0
