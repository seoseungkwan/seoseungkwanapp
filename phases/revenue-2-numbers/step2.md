# Step 2: treatment-groups

> **TASK-6** 치료 묶음 · **REQ-006** · AC-006.1 ~ AC-006.3
> Phase 2 `revenue-2-numbers` · Step 2 — `specs/revenue/tasks.md`
> 명세 `specs/revenue/`가 승인된 뒤에만 한다(`python3 ~/.claude/harness/bin/sdd status revenue`로 확인. 승인 전이면 `blocked`). 이 step은 TASK-6 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/revenue/requirements.md`의 REQ-006에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-006.1**: `groupTreatments(codes)`: 공백 뺀 코드 `도수` → 도수치료, 대문자로 `CARM1` → C-arm 주사, `SONO1` → 초음파, `CRYO` → 냉동치료, `ESWT`를 품으면 → 체외충격파. 나머지는 '그 밖 처방'
- **AC-006.2**: 묶음마다 금액·건수 합, 금액 큰 순(같으면 규칙 순서), '그 밖 처방' 맨 뒤. `amount: null` 코드는 금액 합에서 빼고 `missing: true`. 코드가 없으면 빈 목록
- **AC-006.3**: 이름·규칙은 `src/lib/revenue/treatments.ts`의 표 `TREATMENT_GROUPS` 하나에만

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-004·008·016·020·021
- `/specs/revenue/requirements.md` — 맨 위 승인 줄(시안 승인·사용자 결정 2026-11-01)과 이 step의 REQ
- `/specs/revenue/design.md` — 이 step이 가리키는 절
- `/specs/revenue/tasks.md` — 머리말과 이 step의 TASK
- `/specs/revenue/design.md` — 7절(`treatments.ts` 모양), 12절 2(사용자에게 물을 것: 치료 묶음)
- 원본 `/tmp/claude-1000/-home-developer/1416718f-f900-49a9-a131-c3bd4c2c706c/scratchpad/yangji/repo/YangjiBareun_사전점검/vendor/drbit_export/OperationalReportSql.cs`의 `Treatments` 문장(`CASE` 줄: 코드 → manual·carm·sono·cryo·eswt)
- 이전 step에서 만든 파일:
  - `src/types/revenue.ts` (`RevenueCodeRow`)
  - `src/lib/revenue/summary.ts` (Phase 2 Step 1)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-6)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/lib/revenue/treatments.ts`
  - `src/lib/revenue/treatments.test.ts`
- Tests:
  - `src/lib/revenue/treatments.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **환자 자료는 PC 밖으로 안 나간다**: 서버(Supabase)에는 날짜별 합계 금액·건수(내원·신환·재진·환자 수)·확인 필요 여부와 달별 처방 코드·건수·금액만 간다. 환자 수는 도우미가 비트 DB 안에서 센다. 이름·차트번호·접수 번호·주민번호는 어디에도(답·저장·기록·시험 자료) 없다. 가짜 자료만 쓴다 (CLAUDE.md, design.md 1·3절)
- **금액**: 원 단위 정수. 반올림하지 않고 원 미만은 버린다. 합계는 항목 금액의 합 (CLAUDE.md, ADR-008). 비율은 소수 첫째 자리 버림
- **순수 함수**: 네트워크·저장소·React·supabase 없음

## 작업

### 1. `src/lib/revenue/treatments.ts`
```ts
export type TreatmentKey = 'manual' | 'eswt' | 'carm' | 'sono' | 'cryo'
export const TREATMENT_GROUPS: readonly { key: TreatmentKey; name: string; match: (code: string) => boolean }[]
// 순서: 도수치료(manual) · 체외충격파(eswt) · C-arm 주사(carm) · 초음파(sono) · 냉동치료(cryo)
export const REST_NAME = '그 밖 처방'
export type TreatmentGroup = { key: TreatmentKey | 'rest'; name: string; amount: number; count: number; missing: boolean; rest: boolean }
export function groupTreatments(codes: RevenueCodeRow[]): TreatmentGroup[]
```
- 규칙은 원본 `CASE` 그대로: `RTRIM(OdrCod)=N'도수'`(대소문자 상관없음 아님, 글자 그대로), `UPPER(RTRIM(..))` = `CARM1`·`SONO1`·`CRYO`, `CHARINDEX('ESWT', UPPER(..)) > 0`. 코드 하나는 첫째로 맞는 묶음 하나에만
- 금액이 0이고 건수도 0인 묶음은 목록에서 뺀다(지어낸 0줄을 그리지 않게). '그 밖 처방'도 같다

### 2. 시험 (가짜 코드)
- 다섯 규칙과 앞뒤 공백·소문자(`eswt-2` → 체외충격파, `carm1` → C-arm 주사), 겹치지 않음(AC-006.1) · 정렬·같은 금액 순서·'그 밖' 맨 뒤·`null` 금액 → `missing`·빈 목록(AC-006.2) · 표 순서와 이름(AC-006.3)

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-006.1 ESWT가 든 코드는 체외충격파 …', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-6 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-6 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/lib/revenue/treatments.test.ts   # AC-006.1~AC-006.3
python3 ~/.claude/harness/bin/tdd-run TASK-6 --expect green
npm run lint && npm test
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가(새 npm·NuGet 패키지 없음)?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/revenue-2-numbers/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (사용자 확인·외부 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- 묶음 규칙을 이 파일 밖(화면·저장)에 따로 적지 마라. 이유: 사용자가 묶음을 바꾸면 표 하나만 고쳐야 한다(AC-006.3)
- 처방명(한글 이름)으로 묶지 마라. 이유: 원본은 코드로 묶고, 처방명은 저장하지 않는다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- 기존 테스트를 깨뜨리지 마라. 이유: 앞 TASK와 다른 기능(청구 사전점검 등)의 시험이 계속 통과해야 한다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`를 고치지 마라. 이유: 규칙 문서는 사용자 승인으로만 바뀐다
