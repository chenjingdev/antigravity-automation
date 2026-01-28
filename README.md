# shell-scripts

Antigravity 자동화용 쉘 스크립트 모음.

`antigravity_send.sh`는 표준입력으로 받은 프롬프트를 Antigravity에 붙여넣고 전송해준다.
macOS에서 동작하며 단축키/접근성 권한이 필요하다.

![Automation demo](assets/automation.gif)

## Requirements

- macOS
- Antigravity 앱 설치
- 접근성 권한(터미널/osascript에서 키 입력 및 메뉴 제어)

## Setup

1. Antigravity에서 **새 세션 단축키**를 `⌘ + ⇧ + L`로 설정한다.
2. macOS 설정 → **개인정보 보호 및 보안**:
   - **손쉬운 사용(Accessibility)**: 터미널(또는 사용하는 터미널 앱)과 Antigravity 허용
   - 프롬프트가 뜨면 **Automation** 권한도 허용

## Usage

```sh
echo "김치찌개 이미지 생성해줘." | antigravity_send.sh
```

직접 실행하려면 PATH에 `~/bin`이 포함되어 있어야 한다.

## Notes

- 새 세션 단축키가 동작하지 않으면 Antigravity의 키 바인딩 중복을 확인한다.
- 붙여넣기가 실패할 경우 메뉴(편집→붙여넣기) 방식으로 재시도하도록 되어 있다.
