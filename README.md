# Antigravity 자동화용 쉘 스크립트 + API 서버

## ⚠️ 중요: 계정 차단 위험 주의사항

**과도한 자동화 사용 시 계정이 차단될 수 있습니다!**

실제 사용 경험에 따르면, 하루에 약 10건씩 2주 정도 반복적으로 사용하니 계정 로그인이 차단되었습니다. 특히 다음 사항들을 주의하세요:

- **구조화된 프롬프트 반복 전송**: 동일하거나 유사한 형식의 프롬프트를 반복적으로 보내면 봇으로 감지될 가능성이 높습니다.
- **프롬프트 다양화 권장**: 매번 프롬프트의 형식이나 내용을 조금씩 바꾸면 탐지를 피할 수 있을 것으로 보입니다.
- **재로그인 어려움**: 계정이 차단되면 재로그인 기회가 주어지지만, 두 번째 로그인 시도는 매우 어렵습니다. 특히 오디오 CAPTCHA의 경우 알아듣기 어려운 소리가 나올 수 있습니다.
- **사용 빈도 조절**: 하루 사용 횟수를 제한하고, 사용 간격을 충분히 두는 것을 권장합니다.

이 도구는 개인적인 용도로 가끔 사용하는 것을 전제로 하며, 대량/반복 작업에는 적합하지 않을 수 있습니다.

---

`antigravity_send.sh`는 표준 입력으로 받은 텍스트를 Antigravity에 붙여넣고 전송합니다.
macOS에서 동작하며 단축키/접근성 권한이 필요합니다.

![Automation demo](assets/automation.gif)

## Requirements

- macOS
- Antigravity 앱 설치
- 접근성 권한(터미널/osascript에서 키 입력 및 메뉴 제어)
- Python 3 (API 서버 사용 시)

## Setup

1. Antigravity에서 **새 세션 단축키**를 `⌘ + ⇧ + L`로 설정합니다.
2. macOS 설정 → **개인정보 보호 및 보안**:
   - **손쉬운 사용(Accessibility)**: 터미널(또는 사용하는 터미널 앱)과 Antigravity 허용
   - 프롬프트가 뜨면 **Automation** 권한도 허용

## Usage (Shell Script)

```sh
echo "김치찌개 이미지 생성해줘." | ./antigravity_send.sh
```

직접 실행하려면 PATH에 `~/bin`이 포함되어 있어야 합니다.

## API Server (FastAPI)

API 서버를 띄워 외부에서 프롬프트를 보내면,
`antigravity_send.sh`를 실행해 Antigravity로 전달합니다.

## API Overview

- Base URL: `http://localhost:<PORT>`
- 인증: `/send`, `/history`는 `X-API-Key` 헤더 필요 (`/health`, `/results`는 불필요)
- 요청 형식: JSON
- 결과 파일: `OUTPUT_DIR`에 저장되며 파일명이 `jobId`로 시작해야 조회됩니다.
- 정적 파일: `/results/<filename>` 경로로 결과 파일을 다운로드할 수 있습니다.

### Endpoints

**POST** `/send`

- 설명: 프롬프트를 전송하고 작업을 큐에 넣습니다.
- 요청 본문:
  - `type`: `image` | `text`
  - `prompt`: 문자열
- 응답 (202):
  - `{ ok: true, status: "accepted", jobId }`
  - 응답 형태: `{ ok, status, jobId }`

**GET** `/history/<JOB_ID>`

- 설명: 해당 `jobId` 결과 파일이 생성되었는지 확인합니다.
- 응답:
  - 완료 (200): `{ ok: true, status: "done", jobId, filename, mime }`
  - 진행 중 (202): `{ ok: false, status: "pending", jobId }`
  - 타임아웃 (408): `{ ok: false, status: "timeout", jobId, message }`

**GET** `/results/<filename>`

- 설명: 결과 파일 다운로드 (이미지/텍스트)

**GET** `/health`

- 설명: 헬스체크
- 응답: `{ ok: true }`

### Install

```sh
pip install -r requirements.txt
```

### Environment

`.env` 파일을 만들거나 환경변수를 지정합니다.

```sh
API_KEY=<YOUR_API_KEY>
SCRIPT_PATH=<PATH_TO_SCRIPT>
OUTPUT_DIR=<PATH_TO_RESULTS_DIR>
PORT=<PORT>
```

### Run

```sh
python server.py
```

### Notes

- `/send` 요청 시 서버는 JSON 문자열(`type`, `jobId`, `prompt`)을 스크립트 표준 입력으로 전달합니다.
- 서버는 `OUTPUT_DIR`에서 **파일명이 `jobId`로 시작하는 결과 파일**을 찾습니다. 결과 파일이 이 규칙을 따르도록 Antigravity 저장 설정/후처리를 맞춰야 합니다.

## Tips

- Antigravity가 “파일을 생성할까요?” 같은 확인 얼럿을 띄우면 자동화가 끊깁니다. 텍스트 생성 스킬에는 얼럿을 피하기 위해 `run_command`로 파일을 쓰고 `SafeToAutoRun=true`로 설정하라고 명시했습니다.
- 프롬프트에 따라 얼럿이 뜨거나 안 뜰 수 있습니다. 특히 “파일 생성/저장”을 암시하는 문구가 들어가면 더 잘 뜹니다.
- 셸로만 입력을 받으면 사람이 치는 과정에서 포맷이 흔들려 의도치 않은 결과가 나오기 쉽습니다. 이 프로젝트는 API로 감싸 **요청 포맷을 고정**하고, 결과 처리도 일관되게 만들었습니다.

## n8n × Antigravity 연동 데모

![Demo](assets/demo.gif)
