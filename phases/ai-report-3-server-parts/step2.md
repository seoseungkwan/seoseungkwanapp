# Step 2: report-store

> **TASK-11** 저장 (숫자 읽는 자리·리포트 저장·사용량 기록) · **REQ-511** · AC-511.6 (+ AC-511.2·AC-511.5의 저장 쪽)
> Phase 3 `ai-report-3-server-parts` · Step 2 — `specs/ai-report/tasks.md` 머리말 '할 순서'
> 명세 `specs/ai-report/`는 사용자가 승인한 뒤에만 이 step을 돌린다. 이 step은 TASK-11 하나만 한다. 다른 TASK의 일은 하지 않는다. REQ-511의 나머지(AC-511.1~511.5 흐름)는 TASK-12(Phase 4 Step 0)가 한다.
> **병렬 가능**: 이 phase의 Step 0~2는 서로의 결과를 쓰지 않고 수정 범위가 겹치지 않아 동시에 돌 수 있다. 같은 폴더에서 동시에 돌면 Step 1의 `npm install`(`node_modules/`)과 `npm run build`(`.next/`)가 다른 step의 시험·빌드와 부딪힌다 — 오케스트레이터가 step마다 따로 worktree를 주거나, Step 1의 `npm install`이 끝난 뒤에 시험을 돌리고 `npm run build`·`npm test`는 한 번에 하나만 돌린다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/ai-report/requirements.md`의 REQ-511에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-511.6**: 앱의 숫자 읽는 자리 `loadReportMonths`는 지금 부르면 늘 세 달 모두 "없음"이다(통계 명세가 바꾼다)
- **AC-511.2 (저장 쪽)**: 저장은 리포트·지문·모델을 `save_ai_report`로, 사용량은 `add_ai_usage`로 넘긴다 — 이 step은 rpc 이름·인자를 시험한다
- **AC-511.5 (저장 쪽)**: 저장이나 사용량 기록이 실패하면 `false`를 돌려준다(흐름이 그것을 `E-AI-FAILED`로 바꾼다)

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL: AI 경로는 서버가 DB에서 읽어 `validate.ts`로 검사한 집계만 보낸다, service role 키 없음)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — ADR-004·007·023
- `/specs/ai-report/requirements.md` — REQ-511, 배경 1·5·10
- `/specs/ai-report/design.md` — '흐름', '저장', 'DB'
- `/specs/ai-report/tasks.md` — 머리말 '모든 TASK 공통', TASK-11
- `/src/lib/supabase/server.ts` (`supabaseServer()` — 사용자 세션 클라이언트. 이 step은 클라이언트를 인자로 받기만 한다)
- `/src/lib/auth/hospital.server.ts` (서버 파일 모양: 첫 줄 `import 'server-only'`, 주석 말투)
- 이전 step에서 만든 파일:
  - `src/types/aiReport.ts` (`SavedReport`·`AiUsage`, Phase 1 Step 2)
  - `supabase/migrations/20261101000000_ai_report.sql` (`save_ai_report(p_month, p_report, p_input_hash, p_model)`·`add_ai_usage(p_input, p_output, p_cost)` — 인자 이름을 여기서 그대로 가져온다, Phase 2 Step 1)
  - `src/lib/ai/cost.ts` (`costMicroUsd` — `addUsage`가 받는 `costMicroUsd` 값의 출처, Phase 2 Step 4)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-11)

이 목록에 있는 경로만 만들고 고칠 수 있다. 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/app/api/ai/store.ts`
  - `src/app/api/ai/store.test.ts`
- Tests:
  - `src/app/api/ai/store.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **앱 경로에 지어낸 숫자 없음**: `loadReportMonths`는 지금 늘 `{ selected: null, prev: null, lastYear: null, groupNames: {} }`를 돌려준다. 가짜 숫자를 읽거나 넣지 않는다. 진짜 읽기는 통계 명세가 이 함수를 바꿀 때 한다 (requirements 배경 1, AC-511.6)
- **DB에서 읽은 것도 믿지 않는다**: `ReportMonths`의 세 달은 `unknown`이다. 검사는 `generate.ts`가 `validateMonthPayload`로 한다(이 파일은 모양을 단정하지 않는다) (design '저장')
- **쓰기는 DB 함수로만**: `from('ai_reports').insert` 같은 직접 쓰기를 하지 않는다. `rpc('save_ai_report', …)`·`rpc('add_ai_usage', …)`만. 사용자 세션 클라이언트를 받는다 — service role 키 없음 (CLAUDE.md, design 'DB')
- **첫 줄 `import 'server-only'`** (AC-513.2). `console`을 쓰지 않는다(오류 내용에 숫자·글자가 섞일 수 있다)

## 작업

### 1. 코드 (`src/app/api/ai/store.ts`)
```ts
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
export type ReportMonths = {
  selected: unknown | null; prev: unknown | null; lastYear: unknown | null
  groupNames: Record<string, string>
}
export async function loadReportMonths(supabase: SupabaseClient, month: string): Promise<ReportMonths>
export async function saveReport(supabase: SupabaseClient, r: SavedReport): Promise<boolean>
export async function addUsage(supabase: SupabaseClient, u: AiUsage & { costMicroUsd: number }): Promise<boolean>
```
- `loadReportMonths`: DB를 읽지 않고 늘 셋 다 null, `groupNames: {}`. 머리 주석에 "통계 명세가 `months` 표 읽기로 바꾼다"를 적는다. 안 쓰는 인자 때문에 린트 경고가 나면 `eslint-disable` 없이 푼다
- `saveReport`: `supabase.rpc('save_ai_report', { p_month: r.month, p_report: { partial: r.partial, summary: r.summary, cards: r.cards }, p_input_hash: r.inputHash, p_model: r.model })` → `error`가 없으면 `true`. 던지거나 `error`가 있으면 `false`(오류 내용은 버린다)
  - 넣는 JSON은 `{ partial, summary, cards }`만(달·모델·지문은 따로 칸, `createdAt`은 DB `created_at`이 따로 남긴다) (design '저장')
- `addUsage`: `supabase.rpc('add_ai_usage', { p_input: u.inputTokens, p_output: u.outputTokens, p_cost: u.costMicroUsd })` → 같은 규칙으로 `true`/`false`. 달은 DB가 한국 날짜로 정한다(보내지 않는다)

### 2. 시험 (`src/app/api/ai/store.test.ts`)
- 가짜 Supabase 클라이언트: `rpc: vi.fn(async () => ({ data: null, error: null }))` 하나와, 그 밖의 메서드(`from` 등)는 불리면 시험이 실패하게(`as unknown as SupabaseClient`)
- AC-511.6: `loadReportMonths(가짜, '2026-10')` → 셋 다 null, `groupNames` `{}`. 가짜 클라이언트의 어떤 메서드도 불리지 않았다
- AC-511.2: `saveReport` → `rpc`가 `'save_ai_report'`와 위 인자로 한 번 불림. `p_report`에 `month`·`model`·`inputHash`·`createdAt`이 없다. `addUsage` → `'add_ai_usage'`와 위 인자
- AC-511.5: `rpc`가 `{ error: {…} }`를 돌려주거나 던지면 두 함수 모두 `false`

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-511.6 loadReportMonths는 지금 늘 세 달 모두 없음', …)`
2. `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-11 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일(`src/app/api/ai/store.ts`)을 고칠 수 없다(훅이 막는다). 설정 파일과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-11 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

### 이 PC(윈도우)에서
- 하네스 도구는 `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/<도구>`로 부른다(`python3 ~/.claude/...` 대신)
- `execute.py`는 이 PC에서 쓰지 않는다(리눅스 전용 신호를 쓴다). 오케스트레이터(메인 세션)가 step마다 새 세션을 열어 이 파일을 준다. 이 세션은 이 step 하나만 하고 끝낸다
- 시험에서 파일을 읽어 줄로 나눌 때는 늘 `split(/\r?\n/)`를 쓴다(이 PC의 git은 파일을 CRLF로 꺼낼 수 있다)
- `npm test` 기준선: 이 PC는 .NET 10이 없어 46개가 이미 실패한다(2026-11-01). 새 실패가 없어야 한다(실패 수가 46개를 넘지 않고, 이 step의 시험은 모두 통과)

## Acceptance Criteria

```bash
node -e "const l=require('fs').readFileSync('src/app/api/ai/store.ts','utf8').split(/\r?\n/);process.exit(l[0].trim()===\"import 'server-only'\"?0:1)"
npx vitest run src/app/api/ai/store.test.ts
python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-11 --expect green
npm run lint -- --max-warnings=0
npm run build   # 같은 폴더에서 다른 step과 동시에 돌고 있으면 한 번에 하나만
npm test        # 실패는 기준선 46개뿐
python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/sdd status ai-report
```

- 위 커맨드가 모두 에러 없이 끝나야 한다(`npm test`는 기준선 실패만 남아야 한다)
- `sdd status ai-report`에서 AC-511.6이 이 TASK의 시험과 이어져 보여야 한다(AC-511.1~511.5는 TASK-12 뒤에 이어진다)
- `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/verify`는 기준선 실패 때문에 test 단계에서 멈출 수 있다. 그때는 실패 목록이 기준선 그대로인지 보고 summary에 적는다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가? (서버 코드는 `src/app/api/ai/`만)
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (지어낸 숫자 없음, 쓰기는 함수로만, service role 없음)
3. 결과에 따라 `phases/ai-report-3-server-parts/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 수동 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python -X utf8`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막는다). 다른 칸과 다른 step은 건드리지 않는다. 같은 phase의 다른 step도 이 파일을 고칠 수 있으니 읽은 바로 뒤에 자기 step 칸만 바꿔 쓴다
- `summary`는 오케스트레이터가 다음 step 프롬프트에 그대로 전달한다. 만든 파일, `ReportMonths` 모양, rpc 이름·인자를 한 줄에 담는다

## 금지사항

- `loadReportMonths`에서 `fixtures/fake-ai/`나 다른 가짜 숫자를 읽지 마라. 이유: 앱 경로에는 지어낸 숫자가 없어야 한다. 가짜 숫자는 시험·`ai:try`가 deps로 넣는다(requirements 배경 1)
- `ai_reports`·`ai_usage`에 직접 insert·update하지 마라. 이유: 쓰기 권한이 없고(AC-504.5), 승인 확인은 DB 함수가 한다
- service role 키나 새 Supabase 클라이언트를 만들지 마라. 이유: 사용자 세션 클라이언트를 받아 쓴다(CLAUDE.md, design '흐름')
- 오류 내용을 `console`·예외 글자로 밖에 내지 마라. 이유: AI 경로 로그는 오류 번호·경로만(plan §8)
- `src/lib/supabase/*`·`src/lib/auth/*`를 고치지 마라. 이유: 로그인 쪽 코드이고 수정 범위 밖이다
- 화면 코드(`src/app/(app)/**`·`src/components/**`)를 만들거나 고치지 마라. 이유: 화면은 목업 승인 뒤 화면 명세가 한다
- 기존 테스트를 깨뜨리지 마라. 이유: 기준선 실패(46개)가 늘면 끝 조건을 못 넘는다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `eslint-disable`로 규칙을 피하지 마라. 이유: 린트 경고 0이 끝 조건이다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 오케스트레이터(메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다
