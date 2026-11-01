# Step 4: day-storage

> **TASK-5** 하루 읽기·저장 · **REQ-005** · AC-005.1 ~ AC-005.5
> Phase 1 `worklog-1-data` · Step 4 — `specs/worklog/tasks.md`
> 명세 `specs/worklog/`는 승인됐다. 이 step은 TASK-5 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이미 된 일 (2026-11-01 명세 변경)

- **작업 폴더에 커밋 안 된 `src/lib/storage/worklogDays.ts`·시험이 있다(줄 전체 upsert, 옛 모양). 기존 파일을 고친다. 시험을 먼저 바꿔 RED를 확인한다.**
- 바뀌는 것: 하루 전체 → 바뀐 칸만 받기, 칸 19개 → 32칸(글자), `private` 오류 없앰(막힌 칸은 빼고 보냄)

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/worklog/requirements.md`의 REQ-005에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-005.1**: 정한 칸(값 32칸)만 골라 그 날짜 줄을 읽고(병원은 RLS가 거름) 화면 모양(모두 글자, null → '')으로. 줄이 없으면 null
- **AC-005.2**: 저장 = `upsert(row, { onConflict: 'hospital_id,work_date' })` 한 번. `row` 열쇠는 `work_date` + 받은 바뀐 칸뿐(`hospital_id`는 보내지 않음 — DB 기본값), 빈 칸 → null, 정한 칸 밖 열쇠 무시, 바뀐 칸이 없으면 네트워크 없음
- **AC-005.3**: 개인정보 모양인 칸은 빼고 나머지만 보냄. 남는 칸이 없으면 네트워크 없음
- **AC-005.4**: 오프라인·status 0 → `offline`, 그 밖 → `failed`. 오류에 종류만, Supabase 문구·값 없음
- **AC-005.5**: AI 경로 소스(`src/app/api/ai`·`src/lib/ai`, 있으면)에 `worklog_days`·`worklogDays`가 없음

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-004·008·019와 끝의 업무일지 ADR(Phase 1 Step 0이 더함)
- `/specs/worklog/requirements.md` — REQ-005
- `/specs/worklog/design.md` — 9절(읽기·저장), 5절(칸 표), 8절(권한 — upsert가 쓰는 칸)
- `/specs/worklog/tasks.md` — 이 TASK의 수정 범위·메모
- 승인된 시안 `/docs/mockups/worklog/index.html` (화면 step이면 꼭)
- `/src/types/worklog.ts`·`/src/lib/worklog/notes.ts` (Step 1)·`/src/lib/worklog/cellText.ts` (Step 2, `cellSaveText`)
- `/supabase/migrations/20261101000100_worklog.sql` (Step 3)
- `/src/lib/supabase/browser.ts` — 브라우저 클라이언트(이 파일은 클라이언트를 인자로 받는다)
- `/node_modules/@supabase/postgrest-js/dist/index.mjs` 420~460줄 — 연결 실패 때 `status: 0` 응답

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-5)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/lib/storage/worklogDays.ts`
  - `src/lib/storage/worklogDays.test.ts`
- Tests:
  - `src/lib/storage/worklogDays.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- 서버로 보내는 값은 정해 둔 모양만(CLAUDE.md 보안 규칙): `row`는 `WORKLOG_CELL_KEYS` 안의 열쇠를 **골라서** 만든다(`{ ...changes }` 펼치기 금지)
- **바뀐 칸만 보낸다**(사용자 결정 4): 받은 칸 말고 다른 칸을 채워 보내지 않는다. 안 받은 칸을 null로 보내면 다른 PC가 고친 칸이 지워진다
- **막는 모양은 서버로 가지 않는다**: 자동 저장이 이미 빼고 주지만 이 함수가 마지막 문이다
- 오류 내용(Supabase `message`·`details`·`hint`)을 오류 객체·화면·`console`에 넣지 않는다(CLAUDE.md '오류 내용은 화면·응답에 그대로 보이지 않는다')
- 클라이언트는 인자로 받는다(`Pick<SupabaseClient, 'from'>`). 이 파일 안에서 `supabaseBrowser()`를 부르지 않는다(시험에서 가짜를 넣으려고)

## 작업

```ts
export type WorklogErrorKind = 'offline' | 'failed'
export class WorklogStorageError extends Error {
  readonly kind: WorklogErrorKind
  constructor(kind: WorklogErrorKind)   // message는 고정 글자(예: 'worklog storage offline'), Supabase 문구 없음
}
export async function loadWorklogDay(client: Pick<SupabaseClient, 'from'>, ymd: string): Promise<WorklogDay | null>
export async function saveWorklogDay(client: Pick<SupabaseClient, 'from'>, ymd: string, changes: WorklogChanges): Promise<void>
```
- 읽기: `.from('worklog_days').select('<값 32칸 쉼표>').eq('work_date', ymd).maybeSingle()`(내 병원은 RLS가 거른다) → DB 칸 → 열쇠(`WORKLOG_COLUMNS` 거꾸로), null → ''
- 저장 순서: ① `WORKLOG_CELL_KEYS` 안의 열쇠만 고른다 ② `blockedCellKeys`에 걸린 칸을 뺀다 ③ 남은 칸이 없으면 끝(네트워크 없음) ④ `globalThis.navigator?.onLine === false` → `offline` ⑤ upsert ⑥ `error`가 있으면 `status === 0`이면 `offline`, 아니면 `failed`
- 값은 `cellSaveText(key, text)`이고 빈 글자는 null이다. 긴 글자는 화면 `maxLength`가 먼저 막는다. 여기서는 자르지 않고 그대로 보낸다(DB 제약이 거부 → `failed`). 몰래 잘라 저장하지 않으려고
- 시험: 가짜 클라이언트가 받은 표 이름·select 글자(32칸)·`eq('work_date', …)` 하나(`hospital_id` 거르기·보내기 없음)·upsert `row`의 열쇠 목록·`onConflict`를 기록한다. 칸 하나만 주면 `row`는 정확히 `work_date` + 그 칸(`AC-005.2`), 빈 값 → null, '12,000 별도 ' → '12,000 별도', 다른 열쇠를 억지로 섞어도(`as unknown as WorklogChanges`) 안 감, 빈 값 객체 → `upsert` 호출 0번, 막는 모양 칸 + 보통 칸 → 보통 칸만, 막는 모양 칸만 → 호출 0번(오프라인이어도 `offline`을 던지지 않음). 오류 객체의 `message`에 가짜 Supabase 문구('secret detail')가 없음을 본다. AC-005.5는 그 폴더가 있으면 소스 글자를 읽어 본다(지금은 폴더가 없어도 통과, 다른 갈래가 들어오면 그때 본다)

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-002.2: 수납액은 현금·카드·계좌·지역화폐만 더한다', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-5 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-5 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/lib/storage/worklogDays.test.ts   # AC-005.1~AC-005.5
python3 ~/.claude/harness/bin/tdd-run TASK-5 --expect green
npm run lint && npm test
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status worklog`에서 AC-005.1 ~ AC-005.5가 이 TASK의 시험과 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (환자 개인정보는 서버로 가지 않는다 — 업무사항은 사용자 결정으로 서버에 두되 AI로 보내지 않고, 막는 모양은 저장하지 않는다. RLS, 비밀값)
3. 결과에 따라 `phases/worklog-1-data/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 실제 Supabase에 SQL 붙여 넣기 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- `src/types/db.ts`를 고치지 마라. 이유: 다른 갈래와 겹치는 파일이다. 업무일지 줄 모양은 `src/types/worklog.ts`와 이 파일 안에 둔다(design.md 18절)
- 실패를 조용히 삼키지 마라(빈 값 돌려주기 등). 이유: 저장 실패는 반드시 보여야 한다(사용자 결정). 늘 `WorklogStorageError`를 던진다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- 실제 Supabase에 SQL을 실행하거나 붙여 넣지 마라(대시보드·CLI·REST 모두). 이유: DB 바꾸기는 사용자 OK가 필요하다(design.md 8절)
- 시험·고정 자료에 실제 의원 숫자(엑셀 10월 값)·환자 이름·차트번호·전화번호를 쓰지 마라. 이유: 가짜 자료만 쓴다(CLAUDE.md). 둥근 가짜 숫자(예: 100000)와 "가상" 글자를 쓴다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 Phase 1 Step 0과 사용자 승인으로만 바뀐다
