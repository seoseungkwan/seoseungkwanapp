# Step 2: memo-store

> **TASK-3** 업무사항 이 PC 저장소 · **REQ-003** · AC-003.1 ~ AC-003.5
> Phase 1 `worklog-1-data` · Step 2 — `specs/worklog/tasks.md`
> 명세 `specs/worklog/`는 승인됐다. 이 step은 TASK-3 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/worklog/requirements.md`의 REQ-003에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-003.1**: 쓰고 읽으면 같은 글. 열쇠 `worklog:memo:v1:<병원 id>:<YYYY-MM-DD>`, 병원·날짜끼리 안 섞임
- **AC-003.2**: 빈 글 쓰기 → 열쇠 지움. 적은 적 없는 날 → ''
- **AC-003.3**: 2,000자 넘으면 앞 2,000자만
- **AC-003.4**: 저장소 못 씀(없음·가득 참·예외) → 던지지 않고 `ok: false`
- **AC-003.5**: 소스에 supabase·`fetch`·`@/lib/storage`·`sessionStorage`가 없다(시험이 파일 글자를 읽어 본다)

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-004·008·019와 끝의 업무일지 ADR(Phase 1 Step 0이 더함)
- `/specs/worklog/requirements.md` — REQ-003
- `/specs/worklog/design.md` — 7절(업무사항 이 PC 저장소), 5절(`MEMO_MAX`)
- `/specs/worklog/tasks.md` — 이 TASK의 수정 범위·메모
- 승인된 시안 `/docs/mockups/worklog/index.html` (화면 step이면 꼭)
- `/src/types/worklog.ts`·`/src/lib/worklog/*` (Phase 1 Step 1)
- `/src/guardrails.test.ts` 230~235줄 — `src/components`·`lib`(환자 구역 밖)은 localStorage가 막히지 않는다

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-3)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/lib/worklog/memoStore.ts`
  - `src/lib/worklog/memoStore.test.ts`
- Tests:
  - `src/lib/worklog/memoStore.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **업무사항은 서버로 가지 않는다**(사용자 결정 2026-11-01). 이 파일은 네트워크·supabase·`lib/storage`를 불러오지 않는다
- 브라우저 저장소는 `localStorage` 하나만 쓴다(`sessionStorage`·IndexedDB·쿠키 없음)
- 업무사항 글을 `console`·오류 메시지에 넣지 않는다

## 작업

```ts
export type MemoResult = { ok: true; text: string } | { ok: false }
export function memoKey(hospitalId: string, ymd: string): string
export function readMemo(hospitalId: string, ymd: string, storage?: Storage | null): MemoResult
export function writeMemo(hospitalId: string, ymd: string, text: string, storage?: Storage | null): { ok: boolean }
```
- `storage`를 안 주면 `globalThis.localStorage`를 쓴다. 그것을 읽는 것 자체가 던질 수 있으니(크롬 사이트 데이터 막힘) try 안에서 읽는다. 없으면 실패
- 쓰기: `text.slice(0, MEMO_MAX)`. 빈 글이면 `removeItem`
- 병원 id·날짜가 빈 글자거나 날짜 모양(`isYmd`)이 아니면 실패로 본다(엉뚱한 열쇠를 만들지 않는다)
- 시험: 메모리 가짜 `Storage`(Map 기반), `setItem`이 `QuotaExceededError`를 던지는 가짜, `getItem`이 던지는 가짜, `globalThis.localStorage`가 없는 경우. 소스 검사는 `readFileSync('src/lib/worklog/memoStore.ts')`에 `@supabase`·`@/lib/supabase`·`@/lib/storage`·`fetch(`·`sessionStorage`·`indexedDB`가 없는지

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-002.2: 수납액은 현금·카드·계좌·지역화폐만 더한다', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-3 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-3 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/lib/worklog/memoStore.test.ts   # AC-003.1~AC-003.5
python3 ~/.claude/harness/bin/tdd-run TASK-3 --expect green
npm run lint && npm test
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status worklog`에서 AC-003.1 ~ AC-003.5가 이 TASK의 시험과 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (환자 개인정보·업무사항은 서버로 가지 않는다, RLS, 비밀값)
3. 결과에 따라 `phases/worklog-1-data/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 실제 Supabase에 SQL 붙여 넣기 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- 업무사항을 암호화·압축하거나 다른 PC와 맞추는 길을 만들지 마라. 이유: 범위 밖이다(requirements.md '범위 밖')
- 로그아웃 때 업무사항을 지우는 코드를 넣지 마라. 이유: 30분 자동 로그아웃마다 적은 글이 사라진다(design.md 7절)
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- 실제 Supabase에 SQL을 실행하거나 붙여 넣지 마라(대시보드·CLI·REST 모두). 이유: DB 바꾸기는 사용자 OK가 필요하다(design.md 8절)
- 시험·고정 자료에 실제 의원 숫자(엑셀 10월 값)·환자 이름·차트번호·전화번호를 쓰지 마라. 이유: 가짜 자료만 쓴다(CLAUDE.md). 둥근 가짜 숫자(예: 100000)와 "가상" 글자를 쓴다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 Phase 1 Step 0과 사용자 승인으로만 바뀐다
