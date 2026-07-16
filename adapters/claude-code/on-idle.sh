#!/bin/bash
# Claude Code Hook: Stop
# AI 完成回答 → 写 idle
CODEP_HOME="${CODEP_HOME:-$HOME/codep}"
echo "idle" > "$CODEP_HOME/.ai-state"
exit 0
