#!/usr/bin/osascript

-- 关闭 iTerm2 中运行 spell-guard 的 pane
tell application "iTerm2"
  tell current tab of current window
    repeat with s in sessions
      if name of s contains "spell-guard" or (is processing of s) = false then
        -- 通过发送 Ctrl+C 然后 exit 来优雅关闭
      end if
    end repeat
  end tell
end tell

-- 更可靠的方式：直接 kill spell-guard 进程，pane 会自动关闭
do shell script "pkill -f 'node.*spell-guard/index.js' 2>/dev/null || true"
