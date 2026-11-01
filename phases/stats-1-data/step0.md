# Step 0: revisit-30

> **TASK-1** 신환 30일 재방문 세기 · **REQ-501** · AC-501.1 ~ AC-501.4
> Phase 1 · 계산 더하기와 자료 길 `stats-1-data` · Step 0 — `specs/stats/tasks.md`
> 명세 `specs/stats/`가 승인된 뒤에만 시작한다(`python3 ~/.claude/harness/bin/sdd status stats`). 이 step은 TASK-1 하나만 한다. 다른 TASK의 일은 하지 않는다.
> 옮겨 옴: precheck REQ-029 (AC-029.1) — 사전점검 명세의 같은 몫은 그 명세가 다음에 뺀다. 이 step은 `specs/stats`만 따른다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/stats/requirements.md`의 REQ-501(신환 30일 재방문 세기 (aggregate · compare))에 있다. 아래는 같은 글이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-501.1**: Given 신환 줄, When `aggregate`로 세면, Then 칸(일·주·월)마다 `revisit.within30` = 첫 신환일 다음 날부터 30일째까지(양 끝 포함) 외래 줄(어떤 처방이든)이 있는 집단 환자 수다. 집단·첫 신환일·입원 줄·같은 날 다른 처방·다시 신환으로 찍힌 날의 규칙은 지금 7·14일(stats-core AC-006.4·006.5)과 같고, `within7 ≤ within14 ≤ within30 ≤ cohort`다
- **AC-501.2**: Given 31일째에만 다시 온 신환과 30일째에 다시 온 신환, When 세면, Then 30일째는 30일 재방문이고 31일째는 아니다
- **AC-501.3**: Given 칸 하나, When `buildSummary`로 요약하면, Then `RevisitView.within30`·`rate30`은 '칸 첫날 ~ 칸 끝날 + 30일'이 모두 덮였고 끝났을 때만 숫자이고, 아니면 null('집계 중')이다. 집단이 0명이면 `rate30`은 null이다. 30일이 숫자면 7·14일도 숫자다
- **AC-501.4**: Given 지금 7·14일 시험(`aggregate.test.ts`·`compare.test.ts`·`analyzeFiles.test.ts`), When 돌리면, Then 기대값에 `within30`(·`rate30`) 칸만 더하고 나머지는 한 글자도 바꾸지 않은 채 통과한다

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/specs/stats/requirements.md` — REQ-501
- `/specs/stats/design.md` — '구성 요소 / 인터페이스' TASK-1, '결정과 트레이드오프'
- `/specs/stats/tasks.md` — TASK-1 (수정 범위·메모)
- `/specs/stats-core/requirements.md` — REQ-006(AC-006.4·006.5 재방문 세기)·REQ-007(AC-007.3 '집계 중')
- `/specs/stats-core/design.md` — '재방문 세는 법 (aggregate)'·'재방문 집계 중 (compare)'
- `/src/lib/analytics/aggregate.ts`, `/src/lib/analytics/compare.ts`, `/src/lib/analytics/coverage.ts`, `/src/lib/analytics/dates.ts`
- `/src/types/analysis.ts` (`RevisitCounts`·`RevisitView`·`BucketRef`)
- `/src/lib/analytics/aggregate.test.ts`, `/src/lib/analytics/compare.test.ts`, `/src/workers/analyzeFiles.test.ts` (지금 7·14일 시험)

## 수정 범위 (tasks.md TASK-1)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/lib/analytics/aggregate.ts`
  - `src/lib/analytics/aggregate.test.ts`
  - `src/lib/analytics/compare.ts`
  - `src/lib/analytics/compare.test.ts`
  - `src/types/analysis.ts`
  - `src/workers/analyzeFiles.test.ts`
- Tests:
  - `src/lib/analytics/aggregate.test.ts`
  - `src/lib/analytics/compare.test.ts`
  - `src/workers/analyzeFiles.test.ts`
- TDD: required
- 메모: `analyzeFiles.test.ts`는 기대값에 `within30`·`rate30`이 필요할 때만 그 칸을 더한다

## 꼭 지킬 규칙 (CRITICAL)

- **환자 자료 구역 울타리**: `src/lib/parsers`·`src/lib/analytics`·`src/lib/payload`·`src/lib/precheck`·`src/lib/bridge`·`src/workers`에서는 네트워크(`fetch`·`XMLHttpRequest`·`WebSocket`·`EventSource`·`sendBeacon`), `console`, 브라우저 저장소(`localStorage`·`sessionStorage`·`indexedDB`), React·Next·supabase·`lib/auth`·`lib/storage` import, JSX를 쓰지 않는다. 동적 `import()`는 글자로 고정한 경로만. `eslint.config.mjs`가 막고 `src/guardrails.test.ts`가 증명한다. 이 울타리를 풀거나 `eslint-disable`로 피하지 않는다 (CLAUDE.md, ADR-020)
- **날짜는 한 곳**: 날짜 계산은 `src/lib/analytics/dates.ts`(한국 날짜, `YYYY-MM-DD`). 시험은 `TZ=Asia/Seoul`에서 돈다 (CLAUDE.md)
- **가짜 자료만**: 실제 환자 자료를 쓰지 않는다. 시험은 `fixtures/`의 가짜 자료와 시험 안에서 만든 가짜 값만 쓴다(차트번호는 `9`로 시작하는 6자리 가짜, 이름·전화·주민번호 없음). 차트번호·주민번호 모양은 소스에 통째로 쓰지 않고 조각을 이어 만든다(stats-core 규칙). 실제 비트 내보내기를 커밋하지 않는다 (CLAUDE.md)

## 작업

### 1. 모양 (`src/types/analysis.ts`, 더하기만)
```ts
export type RevisitCounts = { cohort: number; within7: number; within14: number; within30: number }
export type RevisitView = {
  cohort: number
  within7: number | null; within14: number | null; within30: number | null
  rate7: number | null; rate14: number | null; rate30: number | null
}
```

### 2. 세기 (`aggregate.ts`)
- 지금 7·14일을 세는 같은 고리(첫 신환일 f, 외래 방문 날 v)에서 `1 ≤ diffDays(f, v) ≤ 30`이면 `within30`을 더한다. 첫 신환일·입원 줄·같은 날·다시 신환으로 찍힌 날의 규칙은 지금 그대로다(stats-core design '재방문 세는 법')
- 칸(일·주·월) 모두에 더한다. `within7 ≤ within14 ≤ within30 ≤ cohort`

### 3. 요약 (`compare.ts`)
- 지금 N일 판정(`bucketState({ from: 칸 첫날, to: addDays(칸 끝날, N) }, merged, today) === 'complete'`)에 N = 30을 더한다. `rate30 = within30 / cohort`(집단 0이면 null, 집계 중이면 null)
- 30일이 숫자면 7·14일도 숫자다(덮은 기간이 더 길다)

### 4. 시험
- `aggregate.test.ts`: AC-501.1(30일째 = 재방문, 첫 신환일과 같은 날 다른 처방·입원 줄은 아님, 다시 신환으로 찍힌 날은 재방문), AC-501.2(31일째만 온 환자는 아님)
- `compare.test.ts`: AC-501.3(칸 끝 + 30일이 덮이지 않음 → null, 덮이고 지남 → 숫자, 집단 0 → rate30 null)
- 지금 시험(AC-501.4): 기대값 객체에 `within30`(·`rate30`) 칸만 더한다. 다른 값은 바꾸지 않는다

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-501.2 31일째에만 다시 오면 30일 재방문이 아니다', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-1 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일(`*.config.*`·`tsconfig*.json`·`package.json`·`.gitignore`)과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-1 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/lib/analytics/aggregate.test.ts src/lib/analytics/compare.test.ts src/workers/analyzeFiles.test.ts
npx vitest run src/lib/payload src/lib/analytics   # 저장 모양 시험은 아직 그대로 통과해야 한다
python3 ~/.claude/harness/bin/tdd-run TASK-1 --expect green
npm run lint && npm test && npm run build
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status stats`에서 AC-501.1 ~ AC-501.4이 이 TASK의 시험과 이어져 보여야 한다

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

- 7·14일 판정이나 집단 규칙을 바꾸지 마라. 이유: 저장 모양·대시보드가 그 숫자를 쓴다(AC-501.4)
- 저장 모양(`lib/payload`·`types/payload.ts`)을 고치지 마라. 이유: TASK-2 몫이다
- 파서(`lib/parsers`)·`analyzeFiles.ts`·`runAnalysis.ts`를 고치지 마라. 이유: 파일 길은 예비로 그대로 둔다(사용자)
- 기존 테스트를 깨뜨리지 마라. 이유: 지금 통계 엔진·청구·탭 틀 시험이 계속 통과해야 한다(이 TASK의 Files에 있는 시험만, 정한 칸만 고친다)
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- `specs/precheck/`·`phases/precheck-*`를 고치지 마라. 이유: 청구 브랜치가 그 파일을 가진다. 그쪽이 할 일은 `specs/stats/design.md` '사전점검 명세가 할 일'에 적혀 있다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- 새 npm·NuGet 패키지를 넣지 마라. 이유: `package.json`·csproj가 수정 범위 밖이고 ADR 기술 스택 밖이다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`plan.md`를 고치지 마라 · `docs/*`. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다
