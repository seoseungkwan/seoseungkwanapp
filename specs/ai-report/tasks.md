# 작업 분할: AI 월간 리포트 뒷단

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
> 값과 동작: requirements.md · design.md.
>
> **시작 조건**: 명세 승인(`/sdd approve ai-report`). 워크트리 `feat-ai-report`(main `ec58679`에서)에서 한다.
>
> **모든 TASK 공통**
> - 시험부터 쓰고 RED를 본다(`python .claude/harness/bin/tdd-run TASK-n --expect red`). 새 시험 이름에 AC ID(AC-501.1 등)를 넣는다.
> - 화면 코드(`src/app/(app)/**`·`src/components/**`)를 만들거나 고치지 않는다. `lib/payload`·`lib/analytics`·`lib/parsers`(환자 자료 구역)를 고치지 않는다(읽어서 쓰기만).
> - 지어낸 숫자는 `fixtures/fake-ai/`와 시험 파일 안에만 둔다. 열쇠 값은 어디에도 쓰지 않는다(시험은 `sk-ant-fake…` 같은 가짜 글자).
> - 진짜 Claude는 시험에서 부르지 않는다(가짜 클라이언트). 진짜 부름은 사용자가 `npm run ai:try`를 칠 때만.
> - 끝 조건: `npm test`·`npm run lint`(경고 0)·`npm run build` 통과. 이 PC의 기준선 실패(.NET 10 없음 등 46개, 2026-11-01)는 늘지 않아야 한다.
>
> **할 순서**: 6개 phase(`phases/ai-report-1-base` … `phases/ai-report-5-commands`, 3 다음에 고친 점 `ai-report-3b-fixes`)를 차례로 돈다. step 하나 = TASK 하나. 한 phase의 step이 모두 끝나야 다음 phase로 간다.
> 1. `ai-report-1-base`(차례로): TASK-1 → TASK-2 → TASK-5. 뒤의 모든 TASK가 TASK-5의 `src/types/aiReport.ts`를 쓰고, 그 `AiErrorCode`는 TASK-2가 더한 오류 번호에 맞춘다.
> 2. `ai-report-2-parts`(병렬 가능): TASK-3 · TASK-4 · TASK-6 · TASK-8 · TASK-9. 다섯 모두 1의 타입(또는 기존 코드)만 쓰고 서로의 결과를 쓰지 않으며, 수정 범위가 겹치지 않는다.
> 3. `ai-report-3-server-parts`(병렬 가능): TASK-7 · TASK-10 · TASK-11. TASK-7은 TASK-6의 근거 줄을, TASK-11은 TASK-4의 함수 이름·인자를 쓴다(둘 다 2에서 끝남). 셋은 서로의 결과를 쓰지 않고 파일이 겹치지 않는다(`package.json`·`package-lock.json`은 TASK-10만).
> 3b. `ai-report-3b-fixes`(병렬 가능, 고친 명세 재승인 뒤): TASK-1 · TASK-5 · TASK-7 · TASK-8 · TASK-10의 '할 일(3b)'(requirements.md '고친 점'). 다섯은 서로의 결과를 쓰지 않고 수정 범위가 겹치지 않는다. `npm install`은 없다(`package.json`·`package-lock.json`을 고치지 않는다). TASK-7은 처방 지표 이름의 모양(`처방 '<이름>' 환자`)만 보고 그 안이 이름이든 코드든 같게 다루므로, TASK-5의 코드 대신 쓰기와 동시에 돌아도 된다.
> 4. `ai-report-4-flow`(차례로): TASK-12 → TASK-13 → TASK-14. 흐름(TASK-12)이 앞 부품을 모두 쓰고, 경로(TASK-13)가 흐름을 부르고, 울타리 시험(TASK-14)이 다 만든 `src/app/api/ai/`·`src/lib/ai/` 파일을 본다.
> 5. `ai-report-5-commands`(차례로): TASK-15 → TASK-16. 둘 다 `package.json`을 고치고, TASK-16의 시험은 TASK-15가 `vitest.config.ts`에 더한 `scripts/**/*.test.ts`로 잡힌다.
>
> 병렬 step을 같은 폴더에서 동시에 돌리면 `npm install`(TASK-10의 `node_modules/`)과 `npm run build`(`.next/`)가 부딪힌다. step마다 따로 worktree를 주거나, `npm install`을 먼저 끝내고 `npm run build`·`npm test`는 한 번에 하나만 돌린다. 이 PC(윈도우)는 `execute.py`를 쓰지 않는다 — 오케스트레이터가 step마다 새 세션을 연다.

## TASK-1: 문서·설정 — ADR-024, 구조 문서, 계획, 열쇠 양식, 무시 목록
- REQ: REQ-501
- Files: docs/ADR.md, docs/ARCHITECTURE.md, plan.md, .env.example, .gitignore, e2e/lib/env.test.ts
- TDD: exempt — 문서와 설정 글자만 고친다. 앱 코드가 없다. `e2e/lib/env.test.ts`는 `.env.example` 값 이름 기대치에 AI 열쇠 하나를 더할 뿐이다.
- 확인: docs/ADR.md에 ADR-024, .env.example에 ANTHROPIC_API_KEY 줄, .gitignore에 .ai-try/ 줄이 있는지 찾아본다. 3b: ADR-024 안에 `usage.iterations`와 `자료에 있는 이름` 글자가 있는지 찾아본다(AC-501.3).
- 할 일:
  - `docs/ADR.md`: ADR-024(requirements 배경 1·5·6·8과 design '결정과 트레이드오프' 요약). ADR-007 끝에 "모델·저장: ADR-024" 한 줄.
  - `docs/ARCHITECTURE.md`: DB 표에 `ai_reports`(달별 AI 리포트·지문) 줄, AI 흐름에 저장 단계, '상태 관리'의 월간 보고서 줄을 "AI 리포트는 달마다 저장(ADR-024), 채팅·월간 PDF는 저장하지 않는다"로.
  - `plan.md §2-3`: "모델은 구현할 때 정한다" → "모델: Claude Opus 5.5 **(사용자, 2026-11-01)**", 리포트 달마다 저장 **(사용자)** 줄. §5 DB 표에 `ai_reports`.
  - `plan.md §2-3`의 "리포트 안에서 근거 숫자를 함께 적고 … (프롬프트 규칙만…)" 줄을 ADR-024에 맞춰 "근거 숫자는 앱이 채운다(ADR-024)"로 고친다. 원인 추측은 '추정'이라고 쓴다는 뜻은 남긴다.
  - `.env.example`: 맨 아래 `# AI 리포트(서버 전용). NEXT_PUBLIC_ 금지. 값은 npm run ai:key로 넣는다` + `ANTHROPIC_API_KEY=`. 첫 줄 "열쇠는 공개 열쇠 둘뿐" 문구를 "브라우저용 공개 열쇠 둘과 서버 전용 AI 열쇠 하나"처럼 사실에 맞게 고친다(service role 키는 여전히 두지 않는다).
  - `e2e/lib/env.test.ts` 'AC-002.5: E2E 값 이름 10개가 값 없이 있다': 기대치를 `E2E_ENV_NAMES` + `ANTHROPIC_API_KEY`로 바꾼다(값이 빈 칸인지 보는 검사는 그대로). `e2e/lib/env.ts`의 `E2E_ENV_NAMES`는 바꾸지 않는다 — AI 열쇠는 `npm run e2e:env`가 넣는 값이 아니다. 'service role·비밀 열쇠 이름은 없다' 시험도 그대로 통과해야 한다.
  - `.gitignore`: `# npm run ai:try 결과(가짜 숫자 리포트)` + `.ai-try/`.
- 할 일(3b, 2026-11-01 고친 점) — `docs/ADR.md`만 고친다:
  - ADR-024 **결정**의 '근거 숫자는 앱이 채운다' 줄 끝에 한 문장: AI 문장에는 숫자를 쓰지 않되, 자료에 있는 이름(처방명·그룹명·동네 이름 가운데 글자와 숫자가 함께 든 것)을 글자 그대로 쓴 숫자는 예외다. 숫자로만 된 이름은 예외가 아니다 **(사용자, 2026-11-01)**.
  - ADR-024 **결정**에 '비용' 줄 하나: 비용 기록은 거절하고 다른 모델이 대신 답한 경우 거절한 시도까지, 청구된 모든 시도의 토큰(`usage.iterations`의 합)으로 센다. 값은 마지막에 답한 모델 값(표에 없으면 표에서 가장 비싼 값) **(사용자, 2026-11-01)**.
  - 옛 문장은 지우지 않는다. 다른 ADR·문서는 고치지 않는다.

## TASK-2: AI 오류 번호 넷
- REQ: REQ-502
- Files: src/types/errors.ts, src/lib/errors.ts, src/lib/errors.test.ts
- Tests: src/lib/errors.test.ts
- TDD: required
- 문구는 design.md '오류 문구' 표 그대로.

## TASK-3: 가짜 숫자 (세 달 + 그룹 이름)
- REQ: REQ-503
- Files: fixtures/fake-ai/months/2025-10.json, fixtures/fake-ai/months/2026-09.json, fixtures/fake-ai/months/2026-10.json, fixtures/fake-ai/groups.json, fixtures/fake-ai/fakeAi.test.ts
- Tests: fixtures/fake-ai/fakeAi.test.ts
- TDD: required
- 정형외과다운 모양(그룹 도수치료·체외충격파·물리치료·주사·약물, 처방 40개쯤, 동네 25개쯤)으로 손으로 쓴다. 처방코드는 지어낸 글자(`FAKE-…`)로, 실제 비트 코드처럼 보이지 않게. 사람 이름·전화 모양 글자 없음.

## TASK-4: DB 표 둘과 쓰기 함수 둘 (RLS)
- REQ: REQ-504
- Files: supabase/migrations/20261101000000_ai_report.sql, supabase/aiReport.rls.test.ts
- Tests: supabase/aiReport.rls.test.ts
- TDD: required
- `rls.test.ts`의 Supabase 흉내를 이 파일에 복사해 쓴다(그 파일은 고치지 않는다). auth migration → 이 migration 차례로 실행.

## TASK-5: 타입과 입력 묶음·지문
- REQ: REQ-505
- Files: src/types/aiReport.ts, src/lib/ai/input.ts, src/lib/ai/input.test.ts
- Tests: src/lib/ai/input.test.ts
- TDD: required
- 할 일(3b, 2026-11-01 고친 점) — `src/lib/ai/input.ts`·`input.test.ts`만:
  - 처방 지표 이름: 고른 달 처방 이름이 빈 글자이거나 빈칸뿐(`name.trim() === ''`)이면 이름 대신 코드 → `처방 '<코드>' 환자`. 이름을 고르는 달(고른 달)은 그대로 (AC-505.6, design '지표 목록' 7).
  - 시험(AC-505.6): 빈 이름·빈칸뿐인 이름 → 코드 라벨, 둘의 라벨·지문이 같다, 이름이 있는 처방은 그대로. 정해 둔 지문 값 시험(빈 이름 없는 자료)은 그대로 통과해야 한다. 타입(`src/types/aiReport.ts`)은 바꾸지 않는다.

## TASK-6: 근거 줄
- REQ: REQ-506
- Files: src/lib/ai/basis.ts, src/lib/ai/basis.test.ts
- Tests: src/lib/ai/basis.test.ts
- TDD: required
- `@/components/charts/format`의 `formatCount`·`formatRate`를 import만 한다(그 파일은 고치지 않는다).

## TASK-7: AI 답 검사
- REQ: REQ-507
- Files: src/lib/ai/output.ts, src/lib/ai/output.test.ts
- Tests: src/lib/ai/output.test.ts
- TDD: required
- 할 일(3b, 2026-11-01 고친 점):
  - 숫자 규칙 앞에 이름 지우기(AC-507.6·AC-507.7, design 'AI 답 검사' 4-1): `input.metrics`의 `group:`·`rx:`·`region:` 지표 label에서 이름을 꺼내, 글자(`\p{L}`)와 숫자(`\p{N}`)가 둘 다 있는 이름만, 긴 이름부터 글자 그대로 찾아 빈칸으로 바꾼다. 그다음 지금의 허용 낱말 지우기와 `\p{N}` 검사. 요약·카드 문장 둘 다. `hasForbiddenNumber`는 이름 목록을 받게 바꿔도 된다(이 파일 안에서만 쓴다).
  - 길이 재기(AC-507.8): 앞뒤에서 빈칸과 폭 없는 글자(U+200B~U+200D·U+2060·U+FEFF)를 뗀 뒤 1~최대 자.
  - 시험(AC-507.9): 맨 위·카드 안에 `"__proto__"` 열쇠가 든 JSON 답 글자 → null. 지금 코드가 이미 막아도 시험으로 고정한다.
  - 이름은 label에서 꺼낸다 — `ReportInput` 모양과 `input.ts`는 바꾸지 않는다(TASK-5와 겹치지 않게).

## TASK-8: 지시문·사용자 메시지·JSON 스키마
- REQ: REQ-508
- Files: src/lib/ai/prompt.ts, src/lib/ai/prompt.test.ts
- Tests: src/lib/ai/prompt.test.ts
- TDD: required
- 할 일(3b, 2026-11-01 고친 점):
  - `systemPrompt()` '[숫자 규칙]'에 한 줄(AC-508.4, design '지시문' 이름 안의 숫자): 자료에 있는 이름(처방명·그룹명·동네 이름)에 숫자가 들어 있으면 그 이름은 자료에 적힌 글자 그대로 써도 된다(줄이거나 띄어 쓰지 않는다). 숫자로만 된 이름과 그 밖의 숫자는 쓰지 않는다. "숫자를 쓰지 않습니다" 줄은 그대로 둔다.
  - `PROMPT_VERSION`을 `'ai-report-2'`로 올린다. 지시문은 여전히 고정 글자이고 날짜·판 번호가 없다.
  - 시험은 AC-508.4. 스키마 시험(AC-508.3)은 그대로 통과해야 한다.

## TASK-9: 비용 계산
- REQ: REQ-509
- Files: src/lib/ai/cost.ts, src/lib/ai/cost.test.ts
- Tests: src/lib/ai/cost.test.ts
- TDD: required

## TASK-10: Claude 부르기 (SDK 넣기)
- REQ: REQ-510
- Files: package.json, package-lock.json, src/app/api/ai/claude.ts, src/app/api/ai/claude.test.ts
- Tests: src/app/api/ai/claude.test.ts
- TDD: required
- `npm install @anthropic-ai/sdk@<최신, 정확한 판 고정>`. 구현 전에 claude-api skill `typescript/claude-api/README.md`·`streaming.md`·`tool-use.md`(구조화 출력)와 fallback 문서로 칸 이름을 확인한다. 설계와 다르면 멈추고 보고한다(design 위험 2).
- 할 일(3b, 2026-11-01 고친 점) — `src/app/api/ai/claude.ts`·`claude.test.ts`만. `npm install` 없음(`package.json`·`package-lock.json`은 고치지 않는다):
  - 사용량(AC-510.5): `usage.iterations`가 비지 않은 배열이면 모든 항목 `input_tokens`·`output_tokens`의 합, 아니면 맨 위 `usage`. 모델은 `message.model`. 성공·`refusal`·`max_tokens` 모두.
  - 전체 시간 한도(AC-510.6): `export const CALL_TIMEOUT_MS = 100_000`. 부를 때마다 `AbortSignal.timeout(deps?.timeoutMs ?? CALL_TIMEOUT_MS)`를 만들어 `stream(params, { signal })`로 넘긴다. `AnthropicLike.stream`에 두 번째 인자 `options?: { signal?: AbortSignal }`를 더한다. 신호가 끊겼거나 `APIUserAbortError` → BUSY(다른 나누기보다 먼저). SDK 클라이언트 설정(`timeout: 100_000, maxRetries: 1`)은 그대로.
  - 조각 도중 오류(AC-510.7): 상태 없는 `APIError`의 `type`이 `rate_limit_error`·`overloaded_error`·`api_error`면 BUSY, 그 밖의 `type`이면 FAILED. 시험에 "그 밖의 type → FAILED"를 꼭 넣는다.
  - 대신 답한 글자만(AC-510.8): `content`에 `type: 'fallback'` 블록이 있으면 마지막 그 블록 뒤의 `text` 블록만 이어 붙인다. 없으면 지금처럼 모든 `text`. 가짜 답의 블록 타입에 `fallback`을 허용한다.
  - 시험 이름에 AC-510.5·AC-510.6·AC-510.7·AC-510.8. 끊기 시험은 `deps.timeoutMs`를 짧게(예: 20ms) 넣고 가짜 클라이언트가 신호가 끊길 때 `APIUserAbortError`로 실패하게 한다. 진짜 SDK·진짜 Claude는 부르지 않는다.

## TASK-11: 저장 (숫자 읽는 자리·리포트 저장·사용량 기록)
- REQ: REQ-511
- Files: src/app/api/ai/store.ts, src/app/api/ai/store.test.ts
- Tests: src/app/api/ai/store.test.ts
- TDD: required
- AC-511.6(`loadReportMonths`는 늘 없음)과 rpc 이름·인자를 가짜 Supabase 클라이언트로 시험한다.

## TASK-12: 리포트 만들기 흐름
- REQ: REQ-511
- Files: src/app/api/ai/generate.ts, src/app/api/ai/generate.test.ts
- Tests: src/app/api/ai/generate.test.ts
- TDD: required
- 가짜 숫자는 `fixtures/fake-ai/`를 읽어 쓴다. deps는 모두 가짜.

## TASK-13: 서버 경로 POST /api/ai/report
- REQ: REQ-512
- Files: src/app/api/ai/report/route.ts, src/app/api/ai/report/route.test.ts
- Tests: src/app/api/ai/report/route.test.ts
- TDD: required
- `readMe`·`supabaseServer`·`generate`는 `vi.mock`으로 바꾼다. 날짜는 `vi.setSystemTime`.

## TASK-14: 울타리 시험
- REQ: REQ-513
- Files: src/lib/ai/boundary.test.ts
- Tests: src/lib/ai/boundary.test.ts
- TDD: required
- 저장소 소스(`src`·`scripts`·`e2e`·`fixtures`·`supabase`, node_modules 제외)를 읽어 import를 본다. 줄은 `split(/\r?\n/)`(윈도우 CRLF). 이 TASK는 시험만 더한다 — 앞 TASK들이 규칙을 이미 지켜 RED가 안 나오면, 규칙을 어긴 가짜 파일 목록으로 판정 함수가 잡는지 먼저 RED로 본다.

## TASK-15: 리포트 뽑아 보기 명령
- REQ: REQ-514
- Files: package.json, vitest.config.ts, src/lib/ai/markdown.ts, src/lib/ai/markdown.test.ts, scripts/aiTry.ts, scripts/aiTry.test.ts, scripts/ai-try.ts
- Tests: src/lib/ai/markdown.test.ts, scripts/aiTry.test.ts
- TDD: required
- `vitest.config.ts`는 `include`에 `'scripts/**/*.test.ts'` 한 줄만 더한다. `ai-try.ts`(이어 붙이기)는 시험하지 않는다 — 끝에 사용자가 `npm run ai:try`를 직접 쳐서 본다(진짜 Claude, 1회 약 150~200원).

## TASK-16: 열쇠 넣기 명령
- REQ: REQ-515
- Files: package.json, scripts/aiKey.ts, scripts/aiKey.test.ts, scripts/ai-key.ts
- Tests: scripts/aiKey.test.ts
- TDD: required
- 숨김 입력은 `e2e/lib/envFile`의 `hiddenKeys`·`upsertEnvText`·`writePrivateFile`을 import만 한다(그 파일은 고치지 않는다). Claude는 이 명령을 실행하지 않는다 — 사용자가 따로 연 터미널에서 친다.
