# Step 1: revenue-summary

> **TASK-5** 금액 나눔·기간 합·비교 · **REQ-005** · AC-005.1 ~ AC-005.6
> Phase 2 `revenue-2-numbers` · Step 1 — `specs/revenue/tasks.md`
> 명세 `specs/revenue/`가 승인된 뒤에만 한다(`python3 ~/.claude/harness/bin/sdd status revenue`로 확인. 승인 전이면 `blocked`). 이 step은 TASK-5 하나만 한다. 다른 TASK의 일은 하지 않는다.
> **다시 열림(2026-11-01 "건당 진료비 하나로")**: `summary.ts`와 시험은 이미 있다. 새로 만들지 말고 **시험부터 고쳐 실패를 본 뒤**(RED 기록) 구현한다: `perPatient`·`lowered`와 환자 수를 내던 함수, `PeriodSum`·`MonthPoint`의 환자 수 칸을 없애고, `PeriodSum`에 `perVisitTotal`·`perVisitCount`·`noVisitDays`, `MonthPoint`에 `perVisit`, 함수 `perVisit(sum)`을 더하고, `PeriodSum.visits`를 `number | null`로 바꾼다(design.md 7절). `splitDay`·`periodsFor`·`firstMonth`·`compare`는 고치지 않는다. 명세가 바뀌어 기존 시험의 기대값을 바꾸는 것은 약하게 만드는 것이 아니다. **순서**: TASK-1·TASK-2·TASK-3·TASK-5는 함께 돌려도 된다(`specs/revenue/tasks.md` 머리말의 다시 여는 순서).

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/revenue/requirements.md`의 REQ-005에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-005.1**: `splitDay(row)`: `unconfirmed`이거나 `splitUnconfirmed`인 날은 `null`. 나눔이 있는 날은 급여 = `insurer + copay`(요양비용총액), 공단부담 = `insurer`, 본인부담 = `copay`(= 급여 − 공단부담), 비급여 = `noncovered`, 기타 = `otherTotal`(100/100미만총액 + 전액본인부담). 나눔이 있는 날에 급여 + 비급여 + 기타 ≠ `total`이거나 어느 칸이든 음수면 `null`이고 그날은 나눔을 못 한 날로 셈, 고쳐 맞추지 않음(도우미가 만든 줄은 `otherTotal`이 나머지라 합 검사에 걸리지 않는다. 시험은 손으로 만든 줄로 한다)
- **AC-005.2**: `sumPeriod(rows, range)`: `unconfirmed`가 아닌 날의 총액(= 매출, 나눔을 못 한 날 포함)과, 나눔이 있는 날만 더한 급여·공단부담·본인부담·비급여·기타·`splitTotal`(급여 + 비급여 + 기타 = `splitTotal`, 나눔을 못 한 날이 있으면 총액보다 작고 맞춰 고치지 않음, 나눔이 있는 날의 `total` 합이 0이면(그런 날이 없거나 쉬는 날뿐) 이 여섯 칸 `null`)·확인 필요한 날 목록(`unconfirmed`만)·나눔을 못 한 날 목록(`noSplitDays`)·`visits`(`null`인 날만 건너뛴 아는 접수 건수 전부, `unconfirmed`인 날도 듦, 아는 날이 하나도 없으면 `null`)·짝이 맞는 날(`unconfirmed`가 아니고 `visits`가 `null`이 아닌 날)의 `total` 합 `perVisitTotal`과 `visits` 합 `perVisitCount`·접수 건수를 확인하지 못한 날 목록 `noVisitDays`(`unconfirmed`가 아니고 `visits`가 `null`인 날, `total`이 0이어도 듦)·`days`(`unconfirmed`가 아닌 날 수, 쉬는 날·나눔을 못 한 날 포함). 줄이 없거나 모두 0이고 확인 필요한 날도 나눔을 못 한 날도 없으면 `null`
- **AC-005.3**: `periodsFor(month, today)`: 고른 기간(1일~말일과 어제 가운데 이른 날)·지난달 같은 기간(짧으면 말일)·작년 같은 때(2월 29일 → 28일). `firstMonth(today)` = 어제가 속한 달. 날짜는 `lib/analytics/dates.ts`만
- **AC-005.4**: `compare(now, before)`: 비율 소수 첫째 자리 버림, 방향 up·down·same, before가 null·0이면 `null`("비교할 수 없음")
- **AC-005.5**: `monthSeries(rows, lastMonth, today)`: 13달(오래된 달부터) 총액·급여·비급여·기타(나눔이 있는 날만, 그 날들의 `total` 합이 0인 달은 `null`)·내원·건당 진료비 `perVisit`(AC-005.6과 같은 규칙으로 달마다), 자료 없는 달 `null`, 끝나지 않은 달 `partial: true`
- **AC-005.6**: `perVisit(sum)`: (짝이 맞는 날의 `total` 합) ÷ (그 날들의 `visits` 합), `Math.floor`. 짝이 맞는 날 = `unconfirmed`가 아니고 `visits`가 `null`이 아닌 날. `sum`이 `null`이거나 그런 날이 없거나 `visits` 합이 0이면 `null`. `visits`가 `null`이고 `total`을 아는 날은 금액·건수 모두 빠지고 `noVisitDays`에 듦(매출 합계에는 남음, 금액만 남기면 건당 진료비가 아무 표시 없이 부푼다). `unconfirmed`인 날도 둘 다 빠짐. `visits` 0이고 금액 있는 날은 분자에 남음(통계 탭 식과 같음). `splitUnconfirmed`인 날은 보통 날처럼 듦

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-004·008·016·020·021
- `/specs/revenue/requirements.md` — 맨 위 승인 줄(시안 승인·사용자 결정 2026-11-01)과 이 step의 REQ
- `/specs/revenue/design.md` — 이 step이 가리키는 절
- `/specs/revenue/tasks.md` — 머리말과 이 step의 TASK
- `/specs/revenue/design.md` — 7절(모양), 10절·12절(건당 진료비, 확인 필요 결정), 2절 1(총진료비의 짜임, 확인함)
- `/src/lib/analytics/dates.ts`(쓸 함수: `todayInKorea`·`addDays`·`addMonths`·`monthOf`·`monthRange`·`eachDay`·`compareYmd`)
- `/src/components/charts/format.ts`(`formatRate`의 버림 방식 — 같은 방식으로 비율을 자른다)
- `/docs/revenue/pc-check.md` ① 결과(답 = 아니오, 문서에 적혀 있다. AC-005.1은 이 답에 맞춰 정했다)
- 이전 step에서 만든 파일:
  - `src/types/revenue.ts` (`RevenueDayRow`, Phase 1 Step 1)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-5)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/lib/revenue/summary.ts`
  - `src/lib/revenue/summary.test.ts`
- Tests:
  - `src/lib/revenue/summary.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **환자 자료는 PC 밖으로 안 나간다**: 서버(Supabase)에는 날짜별 합계 금액·건수(내원·신환·재진)·확인 필요 여부와 달별 처방 코드·건수·금액만 간다. 건수는 도우미가 비트 DB 안에서 센다. 이름·차트번호·접수 번호·주민번호는 어디에도(답·저장·기록·시험 자료) 없다. 가짜 자료만 쓴다 (CLAUDE.md, design.md 1·3절)
- **금액**: 원 단위 정수. 반올림하지 않고 원 미만은 버린다. 합계는 항목 금액의 합 (CLAUDE.md, ADR-008). 비율은 소수 첫째 자리 버림
- **날짜**: 한국 날짜 계산은 `src/lib/analytics/dates.ts`의 함수만 쓴다. `new Date()` 산수를 새로 만들지 않는다 (CLAUDE.md)
- **순수 함수**: 네트워크·브라우저 저장소·console·React·supabase를 쓰지 않는다. 입력은 `RevenueDayRow` 배열뿐이다

## 작업

### 0. 시작 전 확인
- 확인표 '먼저 할 것' ① 답은 '아니오'였고(2026-11-01), 사용자가 보낸 외래환자경영통계 화면의 식(총진료비 = 요양비용총액 + 비급여 + 100/100미만총액 + 전액본인부담, 요양비용총액 = 공단 + 급여본인부담금)으로 AC-005.1을 바꿨다. `sdd status revenue`가 승인됨일 때만 시작한다

### 1. `src/lib/revenue/summary.ts`
- 모양은 design.md 7절. 타입(`DaySplit`·`PeriodSum`·`MonthPoint`)은 이 파일에서 export한다
- `sumPeriod`: `range` 밖의 줄은 무시. `unconfirmed`인 날은 금액 합에서 빼고 `uncheckedDays`에 날짜를 넣는다. 그 밖의 날은 `total`을 총액에 더한다. `splitDay`가 `null`인 날은 나눔 합에서 빼고 `noSplitDays`에 넣는다(`uncheckedDays`에 넣지 않는다). 쉬는 날(아홉 칸 0, 두 표시 거짓)은 나눔이 있는 날로 세어지므로, 나눔 여섯 칸을 `null`로 두는 조건은 나눔이 있는 날의 `total` 합이 0인 것이다. `days`는 `unconfirmed`가 아닌 줄 수다(쉬는 날·나눔을 못 한 날 포함). `visits`가 `null`인 날은 `visits` 합에서 빠진다(`unconfirmed`인 날의 접수 건수는 든다). 접수 건수를 아는 날이 하나도 없으면 `visits`는 0이 아니라 `null`이다(지금 코드의 `let visits = 0`·`?? 0`을 바꾼다). `unconfirmed`가 아니고 `visits`가 `null`이 아닌 날만 `perVisitTotal`·`perVisitCount`에 더한다. `unconfirmed`가 아니고 `visits`가 `null`인 날은 `noVisitDays`에 넣는다(`unconfirmed`이면서 `visits`도 `null`인 날은 `uncheckedDays`에만)
- `perVisit`: `sum`이 `null`이거나 `perVisitCount`가 0이면 `null`, 아니면 `Math.floor(perVisitTotal / perVisitCount)`
- `periodsFor`: 고른 달이 이번 달이면 끝 = 어제, 지난 달이면 끝 = 말일. 고른 달이 아직 1일도 지나지 않았으면(오늘이 1일) 그 달은 고를 수 없다 — `firstMonth`가 지난달을 준다
- `compare`: `rate = (now − before) / before × 100`을 소수 첫째 자리 버림(음수도 0 쪽으로 버림). 같으면 `same`
- `monthSeries`: `lastMonth`부터 거꾸로 13달, 반환은 오래된 달부터. 달마다 `sumPeriod`(그 달 1일~min(말일, 어제))

### 2. 시험 (`summary.test.ts`, 가짜 숫자)
- 급여 = 공단 + 본인부담, 기타 = `otherTotal`, 급여 + 비급여 + 기타 ≠ 총액 → `null`, 어느 칸이든 음수 → `null`, `unconfirmed`·`splitUnconfirmed`인 날 → `null`(AC-005.1) · 기타 합이 들어 있음 · 확인 필요한 날 빠짐·목록, 나눔을 못 한 날은 총액에 들어가고 나눔 합과 `splitTotal`에서 빠지며 `noSplitDays`에 있고 `uncheckedDays`에 없음·`splitTotal < 총액`, 모든 날이 나눔을 못 한 날이면 나눔 칸 `null`이고 총액은 있음, 일요일 0원 줄 하나 + 나머지 모두 `splitUnconfirmed` → 나눔 여섯 칸 `null`(0이 아님)·총액은 있음·`noSplitDays`에 일요일 없음, 31일 기간에 `unconfirmed` 2일과 쉬는 날·나눔을 못 한 날이 섞이면 `days` 29, 빈 기간 `null`, 모두 0이면 `null`, 원 합이 그대로, `visits`는 `null`인 날만 건너뛰고 `unconfirmed`인 날도 셈, `perVisitTotal`·`perVisitCount`는 짝이 맞는 날만, `noVisitDays`는 `unconfirmed`가 아니고 `visits`가 `null`인 날(`total` 0이어도 듦), `unconfirmed`이면서 `visits`도 `null`인 날은 `uncheckedDays`에만 있음(AC-005.2) · 3월 31일 → 2월 28일, 윤년 2월 29일 → 작년 28일, 오늘이 1일이면 `firstMonth`는 지난달, 이번 달은 어제까지(AC-005.3) · +4.08% → 4.0, −2.15% → −2.1, before 0·null → `null`(AC-005.4) · 13달 순서·자료 없는 달 `null`·진행 중 `partial`·쉬는 날 말고 모두 나눔을 못 한 달의 급여·비급여·기타 `null`, 달마다 `perVisit`이 같은 규칙(AC-005.5) · 162,480,350 ÷ 2,904건 → 55,950(버림), `unconfirmed`인 날의 금액·건수가 둘 다 빠짐, `visits` `null`이고 금액 있는 날은 둘 다 빠지고 `noVisitDays`에 있으며 `sumPeriod`의 총액에는 남음(건당 진료비가 부풀지 않음), `visits` 0이고 금액 있는 날은 분자에 남음, `splitUnconfirmed`인 날은 듦, 짝이 맞는 날 없음·`visits` 합 0·`sum` `null` → `null`(AC-005.6) · 기간의 `visits`가 모두 `null`이면 `visits` `null`이고 `total`은 그대로, `visits`가 모두 0이고 금액이 있으면 `visits` 0, 금액이 모두 0이고 `visits`가 모두 `null`이면 합은 `null`이 아니고(`isAllZero`가 `null`을 0으로 보지 않는다) 그 날들이 `noVisitDays`에 있음(AC-005.2) · 그런 달의 `MonthPoint`는 `visits` `null`·`perVisit` `null`·`total`은 숫자(AC-005.5)
- `TZ=Asia/Seoul`(vitest 설정)에서 돈다. 오늘은 인자로만 받는다(시계를 읽지 않는다)

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-005.1 급여는 공단부담과 본인부담을 더한 값 …', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-5 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-5 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/lib/revenue/summary.test.ts   # AC-005.1~AC-005.6
python3 ~/.claude/harness/bin/tdd-run TASK-5 --expect green
npm run lint
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. 전체 `verify`(SDD 사후 점검 + lint → build → test)와 전체 `npm test`는 이번 다시 열기에서 Phase 2 끝에만 돈다. TASK-2·TASK-5·TASK-7이 모두 들어오기 전에는 타입 검사가 통과할 수 없다(tasks.md 머리말의 다시 여는 순서)

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

- `Math.round`·`toFixed`로 금액·비율을 반올림하지 마라. 이유: 원 미만·소수는 버린다(CLAUDE.md, ADR-008)
- 자료 없는 달·기간을 0으로 채우지 마라. 이유: 없는 것과 0은 다르다. 화면은 "자료 없음"을 보여야 한다(AC-005.2·005.5)
- 함수 안에서 `new Date()`로 오늘을 읽지 마라. 이유: 시험이 날짜를 정할 수 있어야 하고, 한국 날짜는 `dates.ts` 한 곳이다
- 급여를 `total − noncovered`로 셈하거나 기타를 급여에 섞지 마라. 이유: 확인표 ① 답은 '아니오'였고, 확인된 식은 총진료비 = 요양비용총액(`insurer + copay`) + 비급여 + 기타(`otherTotal`)다(design.md 2절 1, AC-005.1)
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- 기존 테스트를 깨뜨리지 마라. 이유: 앞 TASK와 다른 기능(청구 사전점검 등)의 시험이 계속 통과해야 한다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`를 고치지 마라. 이유: 규칙 문서는 사용자 승인으로만 바뀐다
