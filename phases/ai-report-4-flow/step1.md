# Step 1: report-route

> **TASK-13** 서버 경로 `POST /api/ai/report` · **REQ-512** · AC-512.1 ~ AC-512.5
> Phase 4 `ai-report-4-flow` · Step 1 — `specs/ai-report/tasks.md` 머리말 '할 순서'
> 명세 `specs/ai-report/`는 사용자가 승인한 뒤에만 이 step을 돌린다. 이 step은 TASK-13 하나만 한다. 다른 TASK의 일은 하지 않는다.
> 이 phase는 차례로 돈다(Step 0 → 1 → 2). 이 경로는 Step 0의 `generateReport`를 부른다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/ai-report/requirements.md`의 REQ-512에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-512.1**: 로그인 안 함 → 401이고 Claude를 부르지 않는다. 승인 안 된 병원·병원 없음 → 403
- **AC-512.2**: 몸통이 `{ "month": "YYYY-MM" }` 하나가 아니면(다른 칸, 잘못된 달, 이번 달(한국 날짜)보다 뒤, JSON 아님) 400이고 Claude를 부르지 않는다
- **AC-512.3**: 성공 → 200 `{ report }`. 오류 → `{ code }`와 상태: NO-DATA 404, LIMIT 402, BUSY 503, FAILED 502
- **AC-512.4**: 오류일 때 `console.error` 한 줄에 경로와 오류 번호만 있고 달·숫자·답 글자는 없다
- **AC-512.5**: 경로 파일의 `runtime`이 `nodejs`이고 `maxDuration`이 120

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL: 서버 코드는 `app/api/ai/` 하나, AI 경로는 승인된 사용자인지 다시 확인, 로그는 오류 번호·경로만)
- `/docs/ARCHITECTURE.md` — "AI 경로도 '승인된 사용자'인지 다시 확인한다"
- `/docs/ADR.md` — ADR-004·007·023
- `/plan.md` §8 (AI 경로 로그)
- `/specs/ai-report/requirements.md` — REQ-512, 배경 9
- `/specs/ai-report/design.md` — '흐름', '경로', '위험' 1
- `/specs/ai-report/tasks.md` — 머리말 '모든 TASK 공통', TASK-13(`vi.mock`·`vi.setSystemTime` 메모)
- `/src/lib/auth/hospital.server.ts` (`readMe()`·`Me`·`Hospital.status`·`NotSignedInError`·`HospitalReadError` — 읽기만)
- `/src/lib/supabase/server.ts` (`supabaseServer()` — 읽기만)
- `/src/lib/analytics/dates.ts` (`isMonth`·`monthOf`·`todayInKorea` — 날짜 계산은 이 파일만, 읽기만)
- `/src/middleware.ts`·`/src/lib/auth/gate.ts` (로그인 안 한 요청을 `/login`으로 돌리는 규칙 — 아래 '알아 둘 것')
- 이전 step에서 만든 파일:
  - `src/types/aiReport.ts` (`AiErrorCode`·`SavedReport`, Phase 1 Step 2)
  - `src/app/api/ai/claude.ts` (`callClaude`, Phase 3 Step 1)
  - `src/app/api/ai/store.ts` (`loadReportMonths`·`saveReport`·`addUsage`, Phase 3 Step 2)
  - `src/app/api/ai/generate.ts` (`generateReport`·`GenerateDeps`, Phase 4 Step 0)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-13)

이 목록에 있는 경로만 만들고 고칠 수 있다. 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/app/api/ai/report/route.ts`
  - `src/app/api/ai/report/route.test.ts`
- Tests:
  - `src/app/api/ai/report/route.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **브라우저가 보낸 숫자는 쓰지 않는다**: 몸통에서 받는 것은 `month` 하나뿐이다. 숫자는 서버가 DB에서 읽는다(`loadReportMonths`) (CLAUDE.md, plan §6-2)
- **승인 다시 확인**: `readMe()`로 로그인·내 병원·`status === 'approved'`를 본다. 사용자 세션 클라이언트(`supabaseServer()`)로만 DB에 닿는다 — service role 키 없음 (ARCHITECTURE, ADR-004)
- **로그는 번호만**: 오류일 때만 `console.error('[api/ai/report]', code)` 한 줄. 요청 몸통·달·숫자·답 글자·예외 내용을 남기지 않는다 (plan §8, AC-512.4)
- **답은 정해진 모양만**: 성공 `{ report }`, 오류 `{ code }`. 예외 내용을 응답에 싣지 않는다 (CLAUDE.md 보안 규칙)
- **경로 파일 export는 Next가 아는 이름만**: `POST`·`runtime`·`maxDuration` 밖의 이름을 export하지 않는다(Next 빌드가 경로 파일의 모르는 export를 오류로 본다). 돕는 함수는 파일 안에 두고 export하지 않는다
- **날짜는 한국 날짜**: "이번 달"은 `monthOf(todayInKorea())`. PC 시간대를 쓰지 않는다

## 작업

### 1. 경로 (`src/app/api/ai/report/route.ts`)
```ts
export const runtime = 'nodejs'
export const maxDuration = 120
export async function POST(request: Request): Promise<Response>
```
순서(design '경로'):
1. `await request.json()` 실패 → 400
2. 몸통이 객체이고 열쇠가 정확히 `month` 하나, `typeof month === 'string'`, `isMonth(month)`, `month <= monthOf(todayInKorea())` — 아니면 400
3. `readMe()`: `NotSignedInError` → 401, `HospitalReadError` → 502 `{ code: 'E-AI-FAILED' }`, `hospital === null` 또는 `status !== 'approved'` → 403
4. `const sb = await supabaseServer()` → `generateReport(month, { loadMonths: (m) => loadReportMonths(sb, m), callClaude, saveReport: (r) => saveReport(sb, r), addUsage: (u) => addUsage(sb, u), now: () => new Date() })`
5. 성공 → `Response.json({ report }, { status: 200 })`. 오류 → `{ code }`와 상태 NO-DATA 404 · LIMIT 402 · BUSY 503 · FAILED 502
6. `generateReport`·`supabaseServer`가 던지면 502 `{ code: 'E-AI-FAILED' }`
- 400·401·403의 몸통은 명세가 정하지 않았다. 상태만 보낸다(`new Response(null, { status })`)고 정하고 summary에 적는다. 이때는 오류 번호가 없으므로 로그를 남기지 않는다
- `{ code }`로 답하는 모든 경우(502 포함)에 `console.error('[api/ai/report]', code)` 한 줄
- 이 파일 첫 줄에 `import 'server-only'`는 없어도 된다(AC-513.2는 `route.ts`를 뺀다 — Next가 서버에서만 돌린다)

### 2. 시험 (`src/app/api/ai/report/route.test.ts`)
- `vi.mock('@/lib/auth/hospital.server', …)`(`readMe`와 두 오류 클래스), `vi.mock('@/lib/supabase/server', …)`, `vi.mock('../generate', …)`로 바꾼다. `NotSignedInError`·`HospitalReadError`는 `instanceof`가 맞게 시험과 경로가 같은 클래스를 쓰게 한다(`vi.importActual` 또는 mock 안에서 만든 클래스를 내보내기)
- 날짜는 `vi.useFakeTimers()` + `vi.setSystemTime(…)`. 예: `2026-10-31T15:30:00Z`(한국 2026-11-01 00:30)에서 `2026-11`은 되고 `2026-12`는 400 — 한국 날짜로 보는지 확인
- `console.error`는 `vi.spyOn(console, 'error')`로 본다
- AC-512.1: `readMe`가 `NotSignedInError` → 401, `generateReport` 안 불림. 병원 null·`pending`·`rejected` → 403
- AC-512.2: JSON 아님, `{}`, `{ month: '2026-10', x: 1 }`, `{ month: 202610 }`, `{ month: '2026-13' }`, 다음 달 → 400, `readMe`·`generateReport` 안 불림
- AC-512.3: 성공 → 200 `{ report }`. 네 오류 번호 → 404·402·503·502와 `{ code }`
- AC-512.4: 오류 때 `console.error`가 한 번, 인자가 `['[api/ai/report]', code]` 뿐 — 달·숫자가 없다. 성공 때는 안 불림
- AC-512.5: 경로 모듈을 import해 `runtime === 'nodejs'`, `maxDuration === 120`

### 알아 둘 것 (이 step의 범위 밖)
- 지금 `src/middleware.ts`는 로그인 안 한 요청을 `/login`으로 돌린다(`/api/*` 포함). 그래서 실제로는 401 전에 middleware의 리디렉트가 나갈 수 있다. middleware는 이 TASK의 수정 범위 밖이니 고치지 말고, 경로는 그대로 401을 지킨 뒤 summary에 이 점을 적는다(화면 명세에서 정한다)

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-512.2 이번 달(한국 날짜)보다 뒤 달은 400이고 Claude를 부르지 않는다', …)`
2. `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-13 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일(`src/app/api/ai/report/route.ts`)을 고칠 수 없다(훅이 막는다). 설정 파일과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-13 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

### 이 PC(윈도우)에서
- 하네스 도구는 `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/<도구>`로 부른다(`python3 ~/.claude/...` 대신)
- `execute.py`는 이 PC에서 쓰지 않는다(리눅스 전용 신호를 쓴다). 오케스트레이터(메인 세션)가 step마다 새 세션을 열어 이 파일을 준다. 이 세션은 이 step 하나만 하고 끝낸다
- 시험에서 파일을 읽어 줄로 나눌 때는 늘 `split(/\r?\n/)`를 쓴다(이 PC의 git은 파일을 CRLF로 꺼낼 수 있다)
- `npm test` 기준선: 이 PC는 .NET 10이 없어 46개가 이미 실패한다(2026-11-01). 새 실패가 없어야 한다(실패 수가 46개를 넘지 않고, 이 step의 시험은 모두 통과)

## Acceptance Criteria

```bash
npx vitest run src/app/api/ai/report/route.test.ts
python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-13 --expect green
npm run lint -- --max-warnings=0
npm run build   # 경로 파일 export·runtime 설정을 Next가 받아들이는지
npm test        # 실패는 기준선 46개뿐
python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/sdd status ai-report
```

- 위 커맨드가 모두 에러 없이 끝나야 한다(`npm test`는 기준선 실패만 남아야 한다)
- `npm run build` 출력의 경로 목록에 `/api/ai/report`가 서버 경로(ƒ)로 보여야 한다
- `sdd status ai-report`에서 AC-512.1 ~ AC-512.5가 이 TASK의 시험과 이어져 보여야 한다
- `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/verify`는 기준선 실패 때문에 test 단계에서 멈출 수 있다. 그때는 실패 목록이 기준선 그대로인지 보고 summary에 적는다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가? (서버 경로는 `src/app/api/ai/report/route.ts` 하나)
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (승인 다시 확인, 몸통은 달 하나, 로그는 번호만)
3. 결과에 따라 `phases/ai-report-4-flow/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 수동 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python -X utf8`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막는다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 오케스트레이터가 다음 step 프롬프트에 그대로 전달한다. 만든 파일, 상태·몸통 규칙(400·401·403 몸통 결정 포함), middleware 리디렉트 메모를 한 줄에 담는다

## 금지사항

- 몸통의 `month` 밖의 값(숫자·리포트·모델 이름)을 받아 쓰지 마라. 이유: AI 경로는 브라우저가 보낸 숫자를 쓰지 않는다(CLAUDE.md)
- 승인 확인 전에 `generateReport`·`supabaseServer`를 부르지 마라. 이유: 로그인 안 한 사용자·승인 안 된 병원은 Claude 비용을 쓰면 안 된다(AC-512.1)
- 요청 몸통·달·예외 내용을 `console`에 남기거나 응답에 싣지 마라. 이유: AI 경로 로그는 오류 번호·경로만(plan §8), 오류 내용은 화면·응답에 그대로 보이지 않는다(CLAUDE.md)
- `src/middleware.ts`·`src/lib/auth/*`·`src/lib/supabase/*`를 고치지 마라. 이유: 로그인 쪽 코드이고 수정 범위 밖이다. 고칠 것이 보이면 summary에 적는다
- 경로 파일에서 `POST`·`runtime`·`maxDuration` 밖의 이름을 export하지 마라. 이유: Next 빌드가 실패한다
- 다른 경로(`src/app/api/**`)를 만들지 마라. 이유: 서버 경로는 `app/api/ai/report` 하나뿐이다(ADR-004)
- 시험에서 진짜 `readMe`·Supabase·Claude를 부르지 마라. 이유: 시험은 `vi.mock`으로 바꾼다(tasks.md TASK-13). 진짜 부름은 비용·계정이 든다
- 화면 코드(`src/app/(app)/**`·`src/components/**`)를 만들거나 고치지 마라. 이유: 화면은 목업 승인 뒤 화면 명세가 한다
- 기존 테스트를 깨뜨리지 마라. 이유: 기준선 실패(46개)가 늘면 끝 조건을 못 넘는다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `eslint-disable`로 규칙을 피하지 마라. 이유: 린트 경고 0이 끝 조건이다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 오케스트레이터(메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다
