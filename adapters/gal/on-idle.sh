#!/bin/bash
# GAL Hook: post_turn
# Agent 回复完成 → 写 idle
CODEP_HOME="${CODEP_HOME:-$HOME/codep}"
echo "idle" > "$CODEP_HOME/.ai-state"
exit 0
