#!/bin/bash
# Spell Guard 后台监控脚本（tmux 版）
# 检测 claude 状态，写状态文件 + 用 tmux 切焦点

SPELL_GUARD_DIR="$(cd "$(dirname "$(readlink -f "$0" 2>/dev/null || realpath "$0" 2>/dev/null || echo "$0")")" && pwd)"
STATE_FILE="$SPELL_GUARD_DIR/.ai-state"
SESSION_NAME="spell-guard"

last_state="idle"

while true; do
  sleep 2

  # 检查 tmux session 是否还在
  if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    exit 0
  fi

  # 读取左侧 pane（pane 0）的最后几行内容
  content=$(tmux capture-pane -t "$SESSION_NAME:0.0" -p -S -10 2>/dev/null)

  if [ -z "$content" ]; then
    continue
  fi

  # 判断 AI 是否在忙
  is_busy=false

  if echo "$content" | grep -qi "esc to interrupt\|is working\|Thinking\|Running\|Executing\|Reading\|Writing\|Searching"; then
    is_busy=true
  fi

  # 空闲信号
  if echo "$content" | grep -qi "for shortcuts\|ask a question\|describe a task\|What would you"; then
    if ! echo "$content" | grep -qi "esc to interrupt\|is working"; then
      is_busy=false
    fi
  fi

  # 状态变化时更新
  if [ "$is_busy" = true ] && [ "$last_state" != "busy" ]; then
    last_state="busy"
    echo "busy" > "$STATE_FILE"
    # 切焦点到右侧练习 pane
    tmux select-pane -t "$SESSION_NAME:0.1" 2>/dev/null
  elif [ "$is_busy" = false ] && [ "$last_state" != "idle" ]; then
    last_state="idle"
    echo "idle" > "$STATE_FILE"
    # 注意：不在这里切焦点回左边
    # 让 spell-guard 的 index.js 等用户打完单词后再切
  fi
done
