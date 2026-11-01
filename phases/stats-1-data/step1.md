# Step 1: payload-revisit30

> **TASK-2** 저장 모양에 30일 재방문 더하기 · **REQ-502** · AC-502.1 ~ AC-502.3
> Phase 1 · 계산 더하기와 자료 길 `stats-1-data` · Step 1 — `specs/stats/tasks.md`
> 명세 `specs/stats/`가 승인된 뒤에만 시작한다(`python3 ~/.claude/harness/bin/sdd status stats`). 이 step은 TASK-2 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/stats/requirements.md`의 REQ-502(저장 모양에 30일 재방문 더하기 (payload))에 있다. 아래는 같은 글이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-502.1**: Given 집계 품질이 정상인 결과, When `toMonthPayload`·`toDayPayloads`로 바꾸면, Then `revisit`이 `{ cohort, within7, within14, within30, after30 }`이고 `within30`·`after30`은 요약의 '집계 중' 판정 그대로다(null 가능). `schemaVersion`은 2 그대로다(저장 표가 아직 없어 저장된 v2 줄이 어디에도 없다)
- **AC-502.2**: Given 저장 전·읽은 뒤의 값, When `validateMonthPayload`·`validateDayPayload`로 검사하면, Then `revisit` 열쇠는 `cohort`·`within7`·`within14`와, 있어도 되고 없어도 되는 `within30`·`after30`이다(없으면 null로 읽어 돌려준다 — 이 칸 전에 만든 가짜 자료와 다른 브랜치(`feat-ai-report`)의 가짜 달 자료가 그대로 통과하게). 그 밖 열쇠가 있으면 null이다. `within7 ≤ within14 ≤ within30 ≤ cohort ≤ 그 칸 신환`, `within30 + after30 ≤ cohort`이고 앞이 null이면 뒤도 null(7일 null → 14·30일 null, 14일 null → 30일 null, 30일 null → after30 null)일 때만 새 객체를 돌려준다
- **AC-502.3**: Given `DayPayload`·`MonthPayload` 가짜 자료를 쓰는 payload 밖의 지금 시험(history · 대시보드 summary · 대시보드 page), When 돌리면, Then 가짜 자료를 한 글자도 고치지 않고 통과한다(타입에서 두 칸은 선택이다)

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/specs/stats/requirements.md` — REQ-502
- `/specs/stats/design.md` — '구성 요소 / 인터페이스' TASK-2, '결정과 트레이드오프'(`schemaVersion`은 2 그대로), '다른 작업과 겹치는 파일'(ai-report 가짜 자료)
- `/specs/stats/tasks.md` — TASK-2 (수정 범위·메모)
- `/specs/stats-core/requirements.md` — REQ-008(저장 모양 v2)
- `/src/types/payload.ts`, `/src/lib/payload/toMonthPayload.ts`(`revisitPayload`), `/src/lib/payload/toDayPayloads.ts`, `/src/lib/payload/validate.ts`
- `/src/types/analysis.ts` (TASK-1이 더한 `within30`·`after30`·`rate30`)
- 가짜 자료가 있는 payload 밖 시험(고치지 않고 통과해야 한다): `/src/lib/analytics/history.test.ts`, `/src/components/dashboard/summary/*.test.ts(x)`, `/src/app/(app)/dashboard/page.test.tsx`
- 이전 step에서 만든 파일: TASK-1 (`within30`·`after30`·`rate30`)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-2)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/types/payload.ts`
  - `src/lib/payload/toMonthPayload.ts`
  - `src/lib/payload/toDayPayloads.ts`
  - `src/lib/payload/validate.ts`
  - `src/lib/payload/toMonthPayload.test.ts`
  - `src/lib/payload/toDayPayloads.test.ts`
  - `src/lib/payload/validate.test.ts`
- Tests:
  - `src/lib/payload/validate.test.ts`
  - `src/lib/payload/toMonthPayload.test.ts`
  - `src/lib/payload/toDayPayloads.test.ts`
- TDD: required
- 메모: `within30`·`after30`은 타입·검사에서 선택 칸이다. 그래서 payload 밖 시험(history·대시보드·`feat-ai-report`의 가짜 달 자료)은 한 글자도 고치지 않고 통과해야 한다(AC-502.3, cross-branch C6). 대시보드 소스 파일은 고치지 않는다(30일 줄은 TASK-16)

## 꼭 지킬 규칙 (CRITICAL)

- **환자 자료 구역 울타리**: `src/lib/parsers`·`src/lib/analytics`·`src/lib/payload`·`src/lib/precheck`·`src/lib/bridge`·`src/workers`에서는 네트워크(`fetch`·`XMLHttpRequest`·`WebSocket`·`EventSource`·`sendBeacon`), `console`, 브라우저 저장소(`localStorage`·`sessionStorage`·`indexedDB`), React·Next·supabase·`lib/auth`·`lib/storage` import, JSX를 쓰지 않는다. 동적 `import()`는 글자로 고정한 경로만. `eslint.config.mjs`가 막고 `src/guardrails.test.ts`가 증명한다. 이 울타리를 풀거나 `eslint-disable`로 피하지 않는다 (CLAUDE.md, ADR-020)
- **서버에는 숫자만**: 서버로 가는 값은 검사한 저장 모양(`validateMonthPayload`·`validateDayPayload`), 덮은 기간(날짜 둘), 출처('bit'|'file')뿐이다. 차트번호·환자 번호·진료 줄·파일 이름·보고 금액·보고 글은 보내지 않는다 (CLAUDE.md, plan.md §2-2·§4)
- **가짜 자료만**: 실제 환자 자료를 쓰지 않는다. 시험은 `fixtures/`의 가짜 자료와 시험 안에서 만든 가짜 값만 쓴다(차트번호는 `9`로 시작하는 6자리 가짜, 이름·전화·주민번호 없음). 차트번호·주민번호 모양은 소스에 통째로 쓰지 않고 조각을 이어 만든다(stats-core 규칙). 실제 비트 내보내기를 커밋하지 않는다 (CLAUDE.md)

## 작업

### 1. 모양 (`src/types/payload.ts`)
```ts
export type RevisitPayload = { cohort: number; within7: number | null; within14: number | null; within30?: number | null; after30?: number | null }
```
- 두 칸은 **선택**이다(없음 = null로 읽음). 그래서 이 칸 전에 만든 가짜 자료와 다른 브랜치(`feat-ai-report`)의 가짜 달 자료가 타입·검사 모두 그대로 통과한다(cross-branch C6). `schemaVersion: 2`는 그대로다. 주석에 "within30·after30은 stats 명세가 더함(선택 칸, 저장한 줄이 아직 없어 버전을 올리지 않음)"을 적는다

### 2. 바꾸기 (`toMonthPayload.ts`의 `revisitPayload`, `toDayPayloads.ts`)
- 요약의 `RevisitView.within30`·`after30`(null = 집계 중)을 늘 쓴다

### 3. 검사 (`validate.ts`)
- `revisit` 열쇠: `cohort`·`within7`·`within14`(꼭) + `within30`·`after30`(있어도 되고 없어도 됨). 그 밖 열쇠는 null. 돌려주는 새 객체에는 두 칸이 늘 있다(없던 것은 null)
- `within7 ≤ within14 ≤ within30 ≤ cohort ≤ 그 칸 totals.newPatients`(숫자인 것끼리), `within30 + after30 ≤ cohort`, null은 앞에서 뒤로 번진다: 7일 null → 14·30일·after30 null, 14일 null → 30일·after30 null, 30일 null → after30 null. 어기면 null(AC-502.2)

### 4. 시험
- `validate.test.ts`·`toMonthPayload.test.ts`·`toDayPayloads.test.ts`: AC-502.1·502.2 사례(두 칸 없음 → null로 읽힘, 여분 열쇠·순서 어김·null 번짐 어김·합 넘침 → null, 집계 중 → null 그대로)
- AC-502.3: payload 밖 시험은 고치지 않는다(아래 AC 커맨드로 그대로 통과를 확인)

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-501.2 31일째에만 다시 오면 30일 재방문이 아니다', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-2 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일(`*.config.*`·`tsconfig*.json`·`package.json`·`.gitignore`)과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-2 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/lib/payload
npx vitest run src/lib/analytics/history.test.ts src/components/dashboard "src/app/(app)/dashboard/page.test.tsx"   # 고치지 않고 통과
npx tsc --noEmit -p tsconfig.json   # 옛 가짜 자료가 타입도 통과
python3 ~/.claude/harness/bin/tdd-run TASK-2 --expect green
npm run lint && npm test && npm run build
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status stats`에서 AC-502.1 ~ AC-502.3이 이 TASK의 시험과 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가(새 패키지 없음)?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/stats-1-data/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (원본 접근, 목업 승인, 외부 인증, 수동 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- `schemaVersion`을 3으로 올리거나 옛 모양 읽기를 만들지 마라. 이유: 저장한 줄이 아직 없다(design.md '결정')
- 두 칸을 꼭 있어야 하는 칸으로 만들지 마라. 이유: 다른 브랜치의 가짜 자료가 깨진다(cross-branch C6, AC-502.3)
- payload 밖 시험(history·대시보드)의 가짜 자료를 고치지 마라. 이유: 수정 범위 밖이고, 고치지 않고 통과해야 한다(AC-502.3)
- 대시보드 소스 파일을 고치지 마라. 이유: 30일 줄 그리기는 TASK-16 몫이다
- 검사를 정해진 열쇠 밖으로 느슨하게 하지 마라. 이유: 서버에 가는 모양은 정해 둔 것만이다(CLAUDE.md)
- 기존 테스트를 깨뜨리지 마라. 이유: 지금 통계 엔진·청구·탭 틀 시험이 계속 통과해야 한다(이 TASK의 Files에 있는 시험만, 정한 칸만 고친다)
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- `specs/precheck/`·`phases/precheck-*`를 고치지 마라. 이유: 청구 브랜치가 그 파일을 가진다. 그쪽이 할 일은 `specs/stats/design.md` '사전점검 명세가 할 일'에 적혀 있다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- 새 npm·NuGet 패키지를 넣지 마라. 이유: `package.json`·csproj가 수정 범위 밖이고 ADR 기술 스택 밖이다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`plan.md`를 고치지 마라 · `docs/*`. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다
