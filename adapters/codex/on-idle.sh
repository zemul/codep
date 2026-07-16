#!/bin/bash
# Codex CLI Hook: Stop
# AI 完成回答 → 写 idle
# 注意：Codex 的 Stop hook 要求 JSON 输出到 stdout
CODEP_HOME="${CODEP_HOME:-$HOME/codep}"
echo "idle" > "$CODEP_HOME/.ai-state"
echo '{"continue": true}'
exit 0
