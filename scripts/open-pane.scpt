#!/usr/bin/osascript

-- 在 iTerm2 当前窗口右侧打开一个新 pane 并运行 spell-guard
tell application "iTerm2"
  tell current session of current tab of current window
    set spellPane to (split vertically with default profile)
  end tell
  tell spellPane
    write text "spell-guard"
  end tell
end tell
