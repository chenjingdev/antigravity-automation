# Antigravity 자동화용 쉘 스크립트.

`antigravity_send.sh`는 터미널로 입력으로 받은 프롬프트를 Antigravity에 붙여넣고 전송해줍니다.
macOS에서 동작하며 단축키/접근성 권한이 필요합니다.

![Automation demo](assets/automation.gif)

## Requirements

- macOS
- Antigravity 앱 설치
- 접근성 권한(터미널/osascript에서 키 입력 및 메뉴 제어)

## Setup

1. Antigravity에서 **새 세션 단축키**를 `⌘ + ⇧ + L`로 설정합니다.
2. macOS 설정 → **개인정보 보호 및 보안**:
   - **손쉬운 사용(Accessibility)**: 터미널(또는 사용하는 터미널 앱)과 Antigravity 허용
   - 프롬프트가 뜨면 **Automation** 권한도 허용

## Usage

```sh
echo "김치찌개 이미지 생성해줘." | antigravity_send.sh
```

직접 실행하려면 PATH에 `~/bin`이 포함되어 있어야 합니다.

## Notes

- 새 세션 단축키가 동작하지 않으면 Antigravity의 키 바인딩 중복을 확인합니다.
- 붙여넣기가 실패할 경우 메뉴(편집→붙여넣기) 방식으로 재시도하도록 되어 있습니다.

## API Server (Node)

이 머신에서 API 서버를 띄워 외부에서 프롬프트만 보내면, Antigravity로 전송한 뒤
다운로드 폴더에 생성된 결과 파일을 base64로 반환합니다.
프롬프트는 서버에서 변경하지 않습니다.

### Run

```sh
API_KEY=changeme node server.js
```

### Request

```sh
curl -X POST http://localhost:8787/ \\
  -H 'Content-Type: application/json' \\
  -H 'X-API-Key: changeme' \\
  -d '{\"prompt\":\"김치찌개 이미지 생성해줘\",\"outputType\":\"image\"}'
```

응답은 `{ ok, jobId, filename, mime, bytes, base64 }` 형태로 반환됩니다.
텍스트의 경우 `{ text }`도 포함됩니다.
서버는 요청 시점 이후에 생성된 최신 파일을 반환합니다.

### Options

- `outputType`: `image` | `text` (필수)
- `timeoutMs`: 결과 파일 대기 시간 (기본 180000)
- `pollIntervalMs`: 폴링 간격 (기본 1000)

환경변수:

- `PORT` (기본 8787)
- `API_KEY` (필수)
- `OUTPUT_DIR_IMAGE` (기본 `./images`)
- `OUTPUT_DIR_TEXT` (기본 `./texts`)
- `SCRIPT_PATH` (기본 `./antigravity_send.sh`)
주의: Antigravity가 결과물을 자동으로 파일로 저장하도록 설정되어 있어야 합니다.
또한 이미지/텍스트 결과는 각각 `images/`, `texts/` 폴더로 저장되도록 설정되어 있어야 합니다.
