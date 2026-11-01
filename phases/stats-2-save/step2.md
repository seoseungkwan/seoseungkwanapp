# Step 2: rx-trend

> **TASK-8** 처방 추세 · **REQ-508** · AC-508.1 ~ AC-508.5
> Phase 2 · 저장과 처방 추세 `stats-2-save` · Step 2 — `specs/stats/tasks.md`
> 명세 `specs/stats/`가 승인된 뒤에만 시작한다(`python3 ~/.claude/harness/bin/sdd status stats`). 이 step은 TASK-8 하나만 한다. 다른 TASK의 일은 하지 않는다.
> 옮겨 옴: precheck REQ-028 — 사전점검 명세의 같은 몫은 그 명세가 다음에 뺀다. 이 step은 `specs/stats`만 따른다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/stats/requirements.md`의 REQ-508(처방 추세 (`lib/analytics/rxTrend.ts`))에 있다. 아래는 같은 글이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-508.1**: Given 일 저장 모양(`DayPayload[]`)·덮은 기간(`readCoverage`, 합친 범위 목록)과 `{from, to, bucket: 'day'|'week'|'month', codes}`, When `buildTrend`, Then 원본 `TrendMath.Build`처럼 처방마다 칸 점(시작·끝·이름·일부 기간 여부)과 건수(그 칸 날들의 그 처방 `patients` 합)를 낸다. 주는 월요일 ~ 일요일이고 기간 끝에 걸린 칸은 일부 기간이다. 덮은 기간 안의 날은 일 숫자가 없어도(휴진·일요일 — `toDayPayloads`는 진료가 있는 날만 만든다) 0인 날이고 그 칸을 일부 기간으로 만들지 않는다. 덮은 기간 밖의 날이 칸에 들어 있으면 그 칸은 일부 기간이고 그 날은 더하지 않는다(지어낸 0 없음). 아직 끝나지 않은 날(오늘 `partial` 줄)이 든 칸도 일부 기간이다. 원본 `TrendTests.cs`의 칸·경계 사례(부분 주와 월요일 경계, 서로 다른 달 칸 수, 빠진 날짜, 코드 나눔)를 옮겨 통과한다
- **AC-508.2**: Given 비교(`PreviousEqualDays`·`PreviousMonth`·`PreviousYear`), When `comparisonRange`·`comparisonLabel`, Then 원본과 같은 기간·이름이다(원본 사례: 10월 1~7일 → 9월 24~30일, 윤년 2월 29일 사례와 '윤년' 안내)
- **AC-508.3**: Given 신환·재진 나눔, When 추세를 나누면, Then 칸마다 신환 건수 = 그 처방 `newPatients` 합, 재진 건수 = `returning` 합이고(원본 '일별 외래 재진은 나머지' 사례), 신환 + 재진 ≤ 건수다
- **AC-508.4**: Given 지금 자료(파일·저장 모양), When 추세를 만들면, Then 소모량·금액은 늘 null('자료 없음')이다. 원본 `TrendTests.cs`의 소모량·금액·단위 사례는 시험 파일 머리 `knownDiffs`에 이유("금액·소모량은 저장 모양에 없다 — 매출 탭 몫")와 함께 적는다
- **AC-508.5**: Given 현재·비교 기간 합계, When 증감을 내면, Then 지금 앱의 `compareNumbers` 규칙을 쓰고, 원본 `TrendChange` 사례(이전 0 → 비율 없음·신규, 이전 음수 → 비율 없음, 100 → 75는 −25%)가 그 규칙으로 통과한다. 원본 `RateLabel` 글자 대신 앱의 증감 글자를 쓰는 것은 `knownDiffs`에 적는다

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/specs/stats/requirements.md` — REQ-508
- `/specs/stats/design.md` — '구성 요소 / 인터페이스' TASK-8, '결정과 트레이드오프'(처방 추세는 건수만)
- `/specs/stats/tasks.md` — TASK-8 (수정 범위·메모)
- `/src/lib/analytics/dates.ts` (`weekStartOf` 월요일·`monthRange`·`addMonths`)
- `/src/lib/analytics/compare.ts` (`compareNumbers`)
- `/src/lib/analytics/coverage.ts` (`mergeRanges`·`isCovered`)
- `/src/lib/storage/stats.ts` (TASK-7의 `readCoverage`가 주는 모양)
- `/src/types/payload.ts` (`DayPayload.rx`), `/src/types/analysis.ts`
- 이전 step에서 만든 파일: TASK-2 (저장 모양)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 원본 (양지바른, 읽기만)

- GitHub: 저장소 `seoseungkwan/shared`, 커밋 `2a1069b`, 폴더 `YangjiBareun_사전점검/`
- 이 서버의 사본(나중에 지워질 수 있음): `/tmp/claude-1000/-home-developer/4601ab55-16fe-474f-813a-c7a0d544b749/scratchpad/yangji/repo/YangjiBareun_사전점검/`
  - 얕은 clone(HEAD `c66488e`)이다. `2a1069b`와 `c66488e` 사이에 이 폴더 안 파일은 바뀌지 않았다. 그대로 써도 된다
- 사본이 없으면 저장소 밖 임시 폴더에 받는다: `git clone https://github.com/seoseungkwan/shared.git <임시폴더>/shared && git -C <임시폴더>/shared checkout 2a1069b` → `export YANGJI_SRC=<임시폴더>/shared/YangjiBareun_사전점검`. 받을 수 없으면 `blocked`(사유: 원본 저장소 접근 필요)로 멈춘다
- 원본 시험(`tests/*.py`·`*Tests.cs`)은 모두 가짜 자료다. 사례를 시험 씨앗으로 옮겨도 된다

- 이 step에서 볼 원본(폴더 `YangjiBareun_사전점검/` 기준):
  - `vendor/drbit_export/TrendMath.cs` (`ComparisonLabel`·`ComparisonRange`·`Validate`·`Build`)
  - `vendor/drbit_export/TrendContracts.cs` (`TrendBucket`·`TrendComparison`·`TrendPoint`·`TrendChange`)
  - `vendor/drbit_export/TrendTests.cs` (옮길 사례·기대값)

## 수정 범위 (tasks.md TASK-8)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/lib/analytics/rxTrend.ts`
  - `src/lib/analytics/rxTrend.test.ts`
  - `src/types/analysis.ts`
- Tests:
  - `src/lib/analytics/rxTrend.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **환자 자료 구역 울타리**: `src/lib/parsers`·`src/lib/analytics`·`src/lib/payload`·`src/lib/precheck`·`src/lib/bridge`·`src/workers`에서는 네트워크(`fetch`·`XMLHttpRequest`·`WebSocket`·`EventSource`·`sendBeacon`), `console`, 브라우저 저장소(`localStorage`·`sessionStorage`·`indexedDB`), React·Next·supabase·`lib/auth`·`lib/storage` import, JSX를 쓰지 않는다. 동적 `import()`는 글자로 고정한 경로만. `eslint.config.mjs`가 막고 `src/guardrails.test.ts`가 증명한다. 이 울타리를 풀거나 `eslint-disable`로 피하지 않는다 (CLAUDE.md, ADR-020)
- **날짜는 한 곳**: 날짜 계산은 `src/lib/analytics/dates.ts`(한국 날짜, `YYYY-MM-DD`). 시험은 `TZ=Asia/Seoul`에서 돈다 (CLAUDE.md)
- **원본은 저장소 밖**: 원본 경로는 `YANGJI_SRC` 환경 변수나 스크립트 인자로만 받는다. 원본 파일 통째를 저장소에 복사·커밋하지 않는다. 커밋하는 것은 옮긴 코드, 원본 SQL 문장 사본(`original-sql/*.sql`), 골든 결과뿐이다 (specs/stats/tasks.md 머리말)

## 작업

### 1. 코드 (`src/lib/analytics/rxTrend.ts`, 환자 자료 구역)
- design.md TASK-8 시그니처. 원본 C# 줄을 옮긴다: 비교 기간(`PreviousEqualDays` = 바로 앞 같은 일수, `PreviousMonth`, `PreviousYear` + 윤년 안내), 칸 나누기(일·주(월요일 시작)·월, 기간 끝에 걸린 칸은 `partial`), 코드마다 점
- `buildTrend(days, covered, req)`: 칸 안 날마다 그날 `DayPayload`의 그 처방 `patients`(건)·`newPatients`·`returning`을 더한다. 덮은 기간(`covered`, 합친 범위 목록) 안의 날은 줄이 없어도(휴진·일요일 — `toDayPayloads`는 진료가 있는 날만 만든다) 0인 날이고 칸을 일부 기간으로 만들지 않는다. 덮은 기간 밖의 날이 든 칸, 아직 끝나지 않은 날(오늘 `partial` 줄)이 든 칸은 `partial = true`(AC-508.1)
- `quantity`·`amount`는 늘 null(AC-508.4)

### 2. 시험 (`rxTrend.test.ts`)
- 시험 머리에 `knownDiffs` 목록(이유 포함): 소모량·금액·단위 사례(저장 모양에 없음, 매출 탭 몫), 원본 `RateLabel` 글자(앱 `compareNumbers`·`formatDelta`), 빠진 날짜 0 채움(원본은 읽은 기간 전체가 자료라 늘 0, 우리는 덮은 기간 안의 줄 없는 날만 0)
- 원본 `TrendTests.cs` 사례를 하나씩 옮긴다(이름에 AC ID와 원본 확인 글): 직전 동일일수 비교 범위·윤년·서로 다른 월 칸 수·부분 주와 월요일 경계·코드 분리(AC-508.1·508.2), 일별 외래 재진은 나머지(AC-508.3), 0 기준·음수 기준·감소율(AC-508.5)

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-501.2 31일째에만 다시 오면 30일 재방문이 아니다', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-8 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일(`*.config.*`·`tsconfig*.json`·`package.json`·`.gitignore`)과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-8 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/lib/analytics/rxTrend.test.ts
npx vitest run src/lib/analytics   # 지금 통계 그대로
python3 ~/.claude/harness/bin/tdd-run TASK-8 --expect green
npm run lint && npm test && npm run build
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status stats`에서 AC-508.1 ~ AC-508.5이 이 TASK의 시험과 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가(새 패키지 없음)?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/stats-2-save/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (원본 접근, 목업 승인, 외부 인증, 수동 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- 원본 시험 기대값을 우리 결과에 맞춰 바꾸지 마라. 이유: 원본 값 그대로가 AC다. 다르게 한 것은 `knownDiffs`에만
- 덮은 기간 밖의 날을 0으로 채우지 마라, 덮은 기간 안의 휴진 날을 '빠짐'으로 보지 마라. 이유: 안 불러온 날과 휴진(0)은 다르다(AC-508.1, UI_GUIDE '빈 상태'). 휴진 날을 빠짐으로 보면 일요일이 든 주·달이 늘 '일부 기간'이 된다
- 소모량·금액을 0으로 채우지 마라. 이유: '자료 없음'은 null이다(AC-508.4)
- 지금 `types/analysis.ts` 모양을 바꾸지 마라(더하기만). 이유: 지금 통계 코드와 시험이 그 모양을 쓴다
- 기존 테스트를 깨뜨리지 마라. 이유: 지금 통계 엔진·청구·탭 틀 시험이 계속 통과해야 한다(이 TASK의 Files에 있는 시험만, 정한 칸만 고친다)
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- `specs/precheck/`·`phases/precheck-*`를 고치지 마라. 이유: 청구 브랜치가 그 파일을 가진다. 그쪽이 할 일은 `specs/stats/design.md` '사전점검 명세가 할 일'에 적혀 있다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- 새 npm·NuGet 패키지를 넣지 마라. 이유: `package.json`·csproj가 수정 범위 밖이고 ADR 기술 스택 밖이다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`plan.md`를 고치지 마라 · `docs/*`. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다

## 참고

- Phase 2 · 저장과 처방 추세의 마지막 step이다. 메인 세션이 할 일: `verify` → 쉬운 말 보고 → 실제 Supabase에 SQL 붙이기 순서를 채팅으로 드리고 허락 받기(사용자가 붙인다)
