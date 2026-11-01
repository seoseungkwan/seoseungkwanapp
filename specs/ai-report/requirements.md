# 요구사항: AI 월간 리포트 뒷단

> 기능 ID: `ai-report` · 형식: 요구사항은 `### REQ-501: 제목`, 수용 기준은 `- AC-501.1: Given/When/Then`.
> 각 AC 는 테스트 하나 이상으로 검증되어야 하며, 테스트 이름에 AC ID 를 넣는다. 문서 AC(REQ-501)는 tasks.md에 적은 명령으로 본다.
> 번호는 501부터다. 다른 명세(auth·auth-live·landing·stats-core·precheck·auth-hardening 001~034, landing-v2 101~, b2b-redesign 201~, tab-frame 301~, ui-90 401~423)와 시험 이름이 겹치지 않게 한다.

## 배경 / 목표
- 사용자 결정(2026-11-01 인터뷰). `plan.md §2-3`·ADR-007의 AI 분석 가운데 **리포트의 뒷단**(화면 뒤에서 도는 부분)만 먼저 만든다.
  1. 분석할 진짜 숫자가 아직 DB에 없다(`months` 표는 다음 통계 명세). 그래서 **가짜 숫자로 흐름을 끝까지 만든다**. 앱의 숫자 읽는 자리(함수 하나)는 지금 늘 "자료 없음"을 돌려주고, 통계 명세가 진짜 읽기로 바꾼다. 가짜 숫자는 시험과 `fixtures/fake-ai/`, 뽑아 보기 명령에만 있다(앱 경로에는 지어낸 숫자가 없다 — tab-frame과 같은 원칙).
  2. 첫 버전은 **리포트만**. 채팅은 다음 명세.
  3. 고른 달을 **지난달**, **작년 같은 달**과 비교한다. 비교할 달이 없으면 그 비교는 빼고 근거 줄에 "자료 없음"이라고 쓴다.
  4. **진행 중인 달**(`partial`)도 고를 수 있다. 리포트에 `partial` 표시가 남고(화면이 경고를 붙인다), AI에게도 알린다.
  5. 리포트는 **달마다 저장**한다. 다시 만들면(다시 분석) 그 달 리포트를 덮어쓴다. 만들 때 쓴 숫자의 지문(fingerprint)을 함께 저장해, 나중에 숫자가 바뀌었는지 화면이 알 수 있게 한다.
  6. 모델은 **Claude Opus 5.5**(`claude-opus-5-5`).
  7. 모양: **한두 줄 요약 + 꼬리표 카드 3~8개**. 꼬리표는 늘었어요·줄었어요·살펴볼 것·추정.
  8. **근거 숫자는 앱이 채운다.** AI는 카드마다 어떤 지표를 근거로 볼지(지표 ID)만 고르고, 근거 줄의 숫자는 앱이 그 지표의 진짜 값으로 만든다. AI 문장에는 숫자를 쓰지 않는다. 다만 자료에 있는 이름(처방명·그룹명·동네 이름) 안의 숫자는 이름을 글자 그대로 쓸 때만 써도 된다. 숫자로만 된 이름은 예외가 아니다 **(사용자, 2026-11-01)**.
  9. 기다리는 동안은 '분석 중' 뒤 한 번에 보인다(조각 보내기 없음 — 서버는 끝까지 받은 뒤 한 번에 답한다).
  10. 이번 달 AI 사용량(횟수·토큰·비용)을 DB에 기록한다. 리포트 화면 구석에 보이는 일은 화면 명세가 한다. 토큰은 청구된 모든 시도(거절하고 다른 모델이 대신 답한 경우 거절한 시도까지)를 더해 센다 **(사용자, 2026-11-01)**.
  11. 원장님 보고용 말투(합니다체 존댓말)로 쓴다.
  12. 화면이 생기기 전에는 **명령 하나**(`npm run ai:try`)로 가짜 숫자 + 진짜 Claude 리포트를 뽑아 읽는다.
- 앱에서 [AI 분석]을 눌러도 통계 저장이 생기기 전까지는 늘 `E-AI-NO-DATA`(이 달 통계가 없어요)다. 진짜 리포트는 `npm run ai:try`로 본다.
- 이 명세가 바꾸는 옛 문서: `docs/ARCHITECTURE.md` '상태 관리'의 "월간 보고서는 저장하지 않는다"는 AI 리포트에서 바뀐다(월간 PDF 화면은 그대로 열 때마다 모은다). ADR-007의 "모델은 미정"은 Opus 5.5로 정해진다. TASK-1이 ADR-024으로 적는다.

## 고친 점 (2026-11-01, Phase 3 뒤 — 재승인 필요)
- Phase 3(`ai-report-3-server-parts`)까지 만든 뒤 사용자 결정과 검토로 아래를 고친다. 고치는 일은 `phases/ai-report-3b-fixes`(TASK-1·5·7·8·10)가 한다. 각 TASK의 수정 범위(Files)는 그대로다.
  1. 처방 이름이 비었거나 빈칸뿐이면 지표 이름에 처방 코드를 쓴다 **(사용자, 2026-11-01)** — AC-505.6 (TASK-5)
  2. 비용 기록은 청구된 모든 시도의 토큰을 더한다 **(사용자, 2026-11-01)** — AC-510.5 (TASK-10), AC-501.3 (TASK-1)
  3. 자료에 있는 이름 안의 숫자는 써도 된다 **(사용자, 2026-11-01)** — AC-507.6·AC-507.7 (TASK-7), AC-508.4 (TASK-8), AC-501.3 (TASK-1)
  4. Claude 부르기 전체에 시간 한도 100초를 건다 (검토) — AC-510.6 (TASK-10). design '위험' 1의 전제를 고쳤다
  5. 조각 받는 도중 온 오류를 `type`으로 나눈다 (검토) — AC-510.7 (TASK-10)
  6. REQ-508의 스키마 기준 문장에서 다른 AC 번호를 뺐다(`sdd status` 추적표에 엉뚱한 줄이 생기지 않게) (검토)
  7. 폭 없는 글자는 빈칸으로 본다, `__proto__` 열쇠가 든 답을 거부하는 시험 (검토) — AC-507.8·AC-507.9 (TASK-7)
  8. 조각 도중 거절 뒤 다른 모델이 이어 답하면, 마지막 `fallback` 블록 뒤의 글자만 쓴다 (검토) — AC-510.8 (TASK-10)

## 요구사항

### REQ-501: 결정을 문서에 남긴다
- AC-501.1: Given `docs/ADR.md`, When 읽으면, Then ADR-024이 있고 리포트 달마다 저장·덮어쓰기, 지문, 근거 숫자는 앱이 채움, 모델 `claude-opus-5-5`, 숫자 읽는 자리는 통계 명세 전까지 "자료 없음"을 적는다.
- AC-501.2: Given `.env.example`, When 읽으면, Then `ANTHROPIC_API_KEY=` 줄(빈 값)과 "서버 전용, `NEXT_PUBLIC_` 금지" 설명이 있다. Given `.gitignore`, Then `.ai-try/`가 있다.
- AC-501.3: Given `docs/ADR.md`의 ADR-024, When 읽으면, Then 비용 기록은 거절한 시도까지 청구된 모든 시도의 토큰(`usage.iterations`의 합)으로 센다는 줄과, AI 문장에 숫자를 쓰지 않되 자료에 있는 이름(글자와 숫자가 함께 든 이름)을 글자 그대로 쓴 숫자는 예외라는 줄이 있다.

### REQ-502: AI 오류 번호
- AC-502.1: Given `errorInfo`, When `E-AI-BUSY`·`E-AI-LIMIT`·`E-AI-FAILED`·`E-AI-NO-DATA`를 찾으면, Then 넷 다 빈 글자가 아닌 what·fix가 있다. 네 문구에 "병원"이 없고 "니다."로 끝나는 문장이 없다(ui-90 문구 규칙).
- AC-502.2: Given 네 문구, When 읽으면, Then BUSY는 잠시 뒤 다시, LIMIT는 이번 달 AI 한도, FAILED는 [다시 분석], NO-DATA는 그 달 통계를 먼저 넣으라는 뜻이다(문구는 design.md '오류 문구').

### REQ-503: 가짜 숫자
- AC-503.1: Given `fixtures/fake-ai/months/2025-10.json`·`2026-09.json`·`2026-10.json`, When `validateMonthPayload`에 넣으면, Then 셋 다 null이 아니고 `month`가 파일 이름과 같다.
- AC-503.2: Given `fixtures/fake-ai/groups.json`, When 읽으면, Then 세 달의 모든 `groups[].id`에 이름(1~30자)이 있다.
- AC-503.3: Given 가짜 숫자, When 비교하면, Then 2026-10의 신환이 2026-09보다 많고, 처방 그룹 하나는 줄었고, `2026-10`은 `partial: false`다(리포트에 늘었어요·줄었어요가 둘 다 나올 거리가 있다).

### REQ-504: 저장 표와 권한
- AC-504.1: Given migration을 실행한 DB, When `anon`이 `ai_reports`·`ai_usage`를 읽거나 쓰거나 두 함수를 부르면, Then 모두 거부된다.
- AC-504.2: Given 승인된 병원 사용자 A, When `save_ai_report('2026-10', 리포트, 지문, 모델)`을 부르면, Then A 병원의 2026-10 줄이 하나 생기고, 같은 달로 다시 부르면 줄은 하나 그대로이고 내용·지문·모델·`created_at`이 새 값이다.
- AC-504.3: Given 사용자 B(다른 병원), When `ai_reports`·`ai_usage`를 읽으면, Then A의 줄이 보이지 않는다. 관리자도 남의 줄을 보지 못한다.
- AC-504.4: Given 승인 대기·거절 병원 사용자 또는 병원 없는 사용자, When 두 함수를 부르면, Then 거부되고 아무 줄도 생기지 않는다.
- AC-504.5: Given 로그인한 사용자, When `ai_reports`·`ai_usage`에 insert·update·delete를 직접 하면, Then 거부된다(쓰기는 두 함수로만).
- AC-504.6: Given `save_ai_report`, When 달 모양이 'YYYY-MM'이 아니거나, 리포트가 JSON 객체가 아니거나 32KB를 넘거나, 지문이 소문자 16진수 64자가 아니면, Then 거부된다.
- AC-504.7: Given `add_ai_usage(입력 토큰, 출력 토큰, 비용)`, When 승인된 사용자가 두 번 부르면, Then 한국 날짜 기준 이번 달 줄 하나에 횟수 2, 토큰·비용이 두 번의 합이다. 음수 값은 거부된다.

### REQ-505: AI에게 보낼 숫자 묶음(입력)
- AC-505.1: Given 고른 달·지난달·작년 같은 달 `MonthPayload`(검사를 통과한 것)와 그룹 이름, When `buildReportInput`을 부르면, Then 입력에 고른 달, `partial`, 비교 달 두 개와 그 달 자료가 있는지(`hasPrev`·`hasLastYear`), 지표 목록이 있고, 지표마다 ID·이름·세 달 값이 있다. 자료 없는 달의 값은 null, 자료가 있는 달에 그 처방·그룹·동네가 없으면 0이다.
- AC-505.2: Given 같은 자료, When 지표 목록을 보면, Then 전체 환자·신환·재진, 신환 7일·14일 재방문율, 처방 그룹마다 환자·신환·재진, 고른 달 환자 수 상위 30개 처방의 환자 수, 고른 달 환자 수 상위 20개 동네의 환자 수가 있다. 순서는 늘 같다(design.md '지표 목록').
- AC-505.3: Given 재방문 `within7`이 null(집계 중)이거나 `cohort`가 0, When 그 지표를 보면, Then 그 달 값은 null이다.
- AC-505.4: Given 같은 자료로 두 번 만든 입력, When `reportFingerprint`를 부르면, Then 같은 소문자 16진수 64자다. 숫자 하나만 바꾸면 지문이 달라진다.
- AC-505.5: Given 그룹 이름이 없는 그룹, When 입력을 만들면, Then 그 그룹 지표 이름은 "이름 없는 그룹"이다(자료 통째로 실패하지 않는다).
- AC-505.6: Given 고른 달 처방 이름이 빈 글자이거나 빈칸뿐인 처방, When 입력을 만들면, Then 그 처방 지표 이름은 `처방 '<코드>' 환자`다(이름은 지금처럼 고른 달 것을 본다). 이름이 빈 글자인 자료와 빈칸뿐인 자료는 같은 지표 이름·같은 지문이 되고, 이름이 있는 처방의 지표 이름은 그대로다.

### REQ-506: 근거 줄은 앱이 만든다
- AC-506.1: Given 숫자 지표(예: 신환)와 세 달 값 486·524·470, 고른 달 2026-10, When `basisLine`을 부르면, Then "근거 · 신환 9월 486명 → 10월 524명 · 작년 10월 470명"이다.
- AC-506.2: Given 비교 달 값이 null, When 근거 줄을 만들면, Then 그 자리가 "9월 자료 없음" 또는 "작년 10월 자료 없음"이다. 고른 달이 1월이면 지난달은 "작년 12월"이다.
- AC-506.3: Given 비율 지표(재방문율), When 근거 줄을 만들면, Then 값은 `formatRate`처럼 %로 소수 첫째 자리까지 버린 글자다(반올림하지 않는다). 그 달 자료가 있는데 값이 null이면 "집계 중"이다.
- AC-506.4: Given 천 이상 숫자, When 근거 줄을 만들면, Then 세 자리마다 쉼표다(`formatCount`).

### REQ-507: AI 답 검사
- AC-507.1: Given 요약(1~200자)과 카드 3~8개(꼬리표 `up`·`down`·`watch`·`guess`, 문장 1~120자, 입력에 있는 지표 ID), When `parseAiReport`를 부르면, Then 카드마다 근거 줄을 붙인 리포트를 돌려준다.
- AC-507.2: Given 입력에 없는 지표 ID를 쓴 카드, When 검사하면, Then 그 카드는 빠진다.
- AC-507.3: Given 문장에 숫자가 있는 카드, When 검사하면, Then 허용 낱말("7일"·"14일"·"N월"·"YYYY년")을 빼고도 숫자가 남으면 그 카드는 빠진다.
- AC-507.4: Given 요약에 허용 낱말 밖 숫자가 있거나, 남은 카드가 3개 미만이거나, JSON 모양이 다르면(빠진 칸·남는 칸·글자 길이 초과), When 검사하면, Then null이다.
- AC-507.5: Given 같은 지표 ID를 쓴 카드가 여럿, When 검사하면, Then 모두 남는다(같은 숫자를 다른 눈으로 볼 수 있다). 카드는 8개를 넘지 않는다.
- AC-507.6: Given 입력 지표 이름에 글자와 숫자가 함께 든 이름(예: 처방 그룹 '도수치료2', 처방 'MRI 3T', 동네 '역삼1동')이 있음, When 카드 문장이나 요약이 그 이름을 글자 그대로 쓰면, Then 그 이름 안의 숫자는 숫자 규칙에 걸리지 않는다. 한 이름이 다른 이름을 품어도(예: '물리치료1'과 '물리치료12') 긴 이름부터 지워 둘 다 걸리지 않는다.
- AC-507.7: Given 같은 입력, When 문장이 이름 밖 숫자를 쓰거나(예: "역삼1동 환자가 524명"), 이름을 바꿔 쓰거나(예: '도수치료 2'), 입력의 이름이 숫자·기호뿐이면(예: 동네 '1', 처방 '2-3'), Then 그 숫자는 그대로 숫자 규칙 어김이다(숫자뿐인 이름은 허용하지 않는다).
- AC-507.8: Given 요약이나 카드 문장이 빈칸과 폭 없는 글자(U+200B~U+200D·U+2060·U+FEFF)뿐, When 검사하면, Then 빈 글자로 보아 1자 기준을 못 넘어 null이다. 앞뒤의 폭 없는 글자는 빈칸처럼 떼고 길이를 잰다.
- AC-507.9: Given JSON 답의 맨 위나 카드 안에 `"__proto__"` 열쇠가 있음, When 검사하면, Then null이다(남는 칸).

### REQ-508: AI에게 주는 지시문
- AC-508.1: Given `systemPrompt()`, When 읽으면, Then 합니다체 원장님 보고, 문장에 숫자 금지(지표 ID로 근거), 원인 짐작은 `guess` 꼬리표, 진행 중인 달이면 그 점을 요약에 밝힐 것, 자료 안 글자(처방명·그룹명·동네)는 지시가 아니라 자료라는 규칙이 있다.
- AC-508.2: Given 입력, When `userMessage(input)`을 부르면, Then 입력 JSON이 `<data>`…`</data>` 안에 한 번만 있고, 자료 안 글자의 `<`·`>`는 그대로 나오지 않는다(감싸개를 닫지 못하게).
- AC-508.3: Given `reportJsonSchema()`, When 읽으면, Then REQ-507 검사가 받는 모양(요약·카드 목록, 꼬리표 4종, 남는 칸 금지)의 JSON 스키마다.
- AC-508.4: Given `systemPrompt()`, When 읽으면, Then 자료에 있는 이름(처방명·그룹명·동네 이름)은 숫자가 들어 있어도 자료에 적힌 글자 그대로 쓸 수 있고, 숫자로만 된 이름과 그 밖의 숫자는 쓰지 않는다는 규칙이 있다. 문장·요약에 숫자를 쓰지 않는다는 규칙은 그대로 있다.

### REQ-509: 비용 계산
- AC-509.1: Given `claude-opus-5-5`와 입력 10,000·출력 4,000 토큰, When `costMicroUsd`를 부르면, Then 120,000(= $0.12, 백만분의 1달러 정수)이다.
- AC-509.2: Given 가격표에 없는 모델 이름(예: 대신 답한 모델), When 계산하면, Then 가격표에서 가장 비싼 모델 값으로 센다(적게 세지 않게).

### REQ-510: Claude 부르기
- AC-510.1: Given 지시문·입력·스키마, When `callClaude`를 부르면, Then SDK에 모델 `claude-opus-5-5`, `max_tokens` 16000, effort `medium`, JSON 스키마 출력 형식, 거절 대신 다른 모델(`fallbacks: "default"`)을 넣어 조각으로 받고 끝까지 모은 답을 쓴다.
- AC-510.2: Given 정상 답, When 받으면, Then 글자(JSON)와 사용량(입력·출력 토큰, 답한 모델)을 돌려준다.
- AC-510.3: Given SDK 오류, When 부르면, Then 429·529·5xx·연결 끊김·시간 초과는 `E-AI-BUSY`, 402(`billing_error`)는 `E-AI-LIMIT`, 그 밖은 `E-AI-FAILED`다. 답이 `refusal`·`max_tokens`로 끝나면 `E-AI-FAILED`이고 사용량은 그대로 돌려준다.
- AC-510.4: Given 열쇠 `ANTHROPIC_API_KEY`가 없음, When 부르면, Then SDK를 부르지 않고 `E-AI-FAILED`다.
- AC-510.5: Given 답의 `usage.iterations`에 항목이 여럿(예: 거절한 시도 `message` + 대신 답한 시도 `fallback_message`), When 사용량을 돌려주면, Then 입력·출력 토큰은 모든 항목의 합이고 모델은 답의 `model`이다. `usage.iterations`가 없거나(null) 비면 맨 위 `usage` 값이다. 정상 답과 `refusal`·`max_tokens`로 끝난 답 모두 같다.
- AC-510.6: Given `callClaude`, When SDK를 부르면, Then 요청 옵션에 끊기 신호(`signal`) 하나를 넣고, 그 신호는 부르기 시작부터 정해 둔 시간(`CALL_TIMEOUT_MS` = 100초) 뒤에 끊긴다. 신호가 끊겨 SDK가 던진 오류(`APIUserAbortError`)나 신호가 끊긴 뒤 온 어떤 오류든 `E-AI-BUSY`이고 사용량은 없다.
- AC-510.7: Given 조각 받는 도중 온 오류(상태가 없는 `APIError`에 `type`이 있음), When 부르면, Then `type`이 `rate_limit_error`·`overloaded_error`·`api_error`면 `E-AI-BUSY`, 그 밖의 `type`(예: `invalid_request_error`·`authentication_error`)이면 `E-AI-FAILED`다.
- AC-510.8: Given 답의 `content`에 `fallback` 블록이 있음(조각 도중 거절한 모델의 덜 쓴 `text` → `fallback` 블록 → 대신 답한 모델의 `text`), When 글자를 돌려주면, Then 마지막 `fallback` 블록 뒤의 `text` 블록만 이어 붙인다(그 앞 글자는 버린다). `fallback` 블록이 없으면 모든 `text` 블록을 이어 붙인다. 사용량은 AC-510.5 그대로다.

### REQ-511: 리포트 만들기 흐름
- AC-511.1: Given 고른 달 숫자가 없거나 검사(`validateMonthPayload`)를 못 넘음, When `generateReport`를 부르면, Then Claude를 부르지 않고 `E-AI-NO-DATA`다. 비교 달이 검사를 못 넘으면 그 달은 없는 달로 본다.
- AC-511.2: Given 숫자가 있음, When 만들면, Then 입력 → 지시문 → Claude → 답 검사 → 저장(리포트·지문·모델) → 사용량 기록 순서이고, 저장한 리포트를 돌려준다.
- AC-511.3: Given Claude가 답했지만 검사가 null, When 만들면, Then 저장하지 않고 사용량은 기록하고 `E-AI-FAILED`다.
- AC-511.4: Given Claude 오류(사용량 없음), When 만들면, Then 저장·사용량 기록을 하지 않고 그 오류 번호다. 사용량이 있는 오류(`refusal` 등)는 사용량을 기록한다.
- AC-511.5: Given 저장이나 사용량 기록이 실패, When 만들면, Then `E-AI-FAILED`다(만든 리포트를 저장 없이 보여 주지 않는다).
- AC-511.6: Given 앱의 숫자 읽는 자리(`loadReportMonths`), When 지금 부르면, Then 늘 세 달 모두 "없음"이다(통계 명세가 바꾼다).

### REQ-512: 서버 경로 `POST /api/ai/report`
- AC-512.1: Given 로그인 안 함, When 경로 함수를 부르면, Then 401이고 Claude를 부르지 않는다(middleware가 먼저 /login으로 돌려보낼 수도 있다 — 경로도 스스로 한 번 더 막는다). 승인 안 된 병원·병원 없음이면 403이다.
- AC-512.2: Given 몸통이 `{ "month": "YYYY-MM" }` 하나가 아님(다른 칸, 잘못된 달, 이번 달(한국 날짜)보다 뒤, JSON 아님), When 부르면, Then 400이고 Claude를 부르지 않는다.
- AC-512.3: Given 성공, When 부르면, Then 200 `{ report }`다. 오류면 `{ code }`와 상태: NO-DATA 404, LIMIT 402, BUSY 503, FAILED 502.
- AC-512.4: Given 오류, When 로그를 보면, Then `console.error` 한 줄에 경로와 오류 번호만 있고 달·숫자·답 글자는 없다.
- AC-512.5: Given 경로 파일, When 읽으면, Then `runtime`이 `nodejs`이고 `maxDuration`이 120이다.

### REQ-513: 울타리
- AC-513.1: Given 저장소의 모든 소스, When `@anthropic-ai/sdk` import를 찾으면, Then `src/app/api/ai/`와 `scripts/` 밖에는 없다.
- AC-513.2: Given `src/app/api/ai/` 아래 시험 아닌 `.ts` 파일, When 첫 줄을 보면, Then `import 'server-only'`다(경로 파일 `route.ts` 제외 — Next가 서버에서만 돈다).
- AC-513.3: Given `src/lib/ai/` 시험 아닌 파일, When import를 보면, Then supabase·next·react·`@anthropic-ai/sdk`·`node:` 모듈과 `fetch`가 없다(순수 함수만).

### REQ-514: 리포트 뽑아 보기 명령 `npm run ai:try`
- AC-514.1: Given 리포트, When `reportMarkdown(report, usage)`을 부르면, Then 제목(달·진행 중이면 "진행 중인 달" 경고), 요약, 카드마다 꼬리표 이름(늘었어요 등)·문장·근거 줄, 끝에 모델·토큰·비용(달러)이 있는 Markdown이다.
- AC-514.2: Given 명령, When 실행하면, Then `fixtures/fake-ai/`의 가짜 숫자로 `generateReport`를 부르고(진짜 Claude, 저장·사용량은 메모리에만), `.ai-try/`에 Markdown 파일을 쓰고 경로를 알린다. DB·Supabase에 닿지 않는다.
- AC-514.3: Given `.env.local`에 열쇠가 없음, When 실행하면, Then Claude를 부르지 않고 `npm run ai:key`로 넣으라는 안내와 함께 끝난다.

### REQ-515: 열쇠 넣기 명령 `npm run ai:key`
- AC-515.1: Given `.env.local` 글자와 새 열쇠, When 넣는 함수를 부르면, Then `ANTHROPIC_API_KEY` 줄만 바뀌거나 더해지고 다른 줄은 그대로다(`upsertEnvText`).
- AC-515.2: Given 입력, When 받으면, Then 친 글자가 화면에 나오지 않고(`hiddenKeys`), `sk-ant-`로 시작하지 않으면 쓰지 않고 다시 넣으라고 한다. 파일은 `writePrivateFile`로 쓴다.

## 범위 밖
- 화면(AI 리포트 탭, 사용량 표시, '분석 중', 진행 중 경고, 낡은 리포트 안내, [다시 분석]) — UI 작업(ui-90)이 main에 합쳐진 뒤 목업 승인 → 화면 명세.
- 통계 저장(`months`·`days` 표)과 진짜 숫자 읽기, `rx_groups` 표 — 통계 명세가 `loadReportMonths`를 바꾼다.
- 채팅, 매출·인건비(아직 없는 자료), 처방별 재진 횟수 분포(followup), 사용자별 호출 제한(§10), 월간 PDF.
- Vercel에 열쇠 넣기·배포, Supabase에 migration 실행 — 화면을 붙일 때 운영자가 한다.
