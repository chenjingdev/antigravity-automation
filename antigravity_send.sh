#!/bin/zsh
set -euo pipefail

prompt="$(cat)"
[[ -z "$prompt" ]] && { echo "EMPTY_PROMPT" >&2; exit 1; }

final_prompt="${prompt}"

# Antigravity 활성화 -> 새 세션 -> 입력 포커스 -> 붙여넣기 -> 전송
/usr/bin/osascript - "$final_prompt" <<'APPLESCRIPT'
on run argv
  set msg to item 1 of argv
  set the clipboard to msg
  tell application "Antigravity" to activate
  delay 0.2
  tell application "System Events"
    -- 입력 포커스 해제 (웹뷰 포커스 때문에 새 세션 단축키가 씹힐 수 있음)
    key code 53
    delay 0.2

    -- 새 세션 (L + cmd+shift) x2
    key code 37 using {command down, shift down}
    delay 0.2
    key code 37 using {command down, shift down}
    delay 0.2

    -- 붙여넣기 (메뉴 클릭, 실패 시 cmd+v)
    set pasted to false
    try
      tell process "Antigravity"
        if exists menu item "붙여넣기" of menu "편집" of menu bar 1 then
          click menu item "붙여넣기" of menu "편집" of menu bar 1
          set pasted to true
        end if
      end tell
    end try
    try
      tell process "Antigravity"
        if exists menu item "Paste" of menu "Edit" of menu bar 1 then
          click menu item "Paste" of menu "Edit" of menu bar 1
          set pasted to true
        end if
      end tell
    end try
    if pasted is false then
      keystroke "v" using command down
    end if
    delay 0.2

    -- 전송
    keystroke return
  end tell
end run
APPLESCRIPT
