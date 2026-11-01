# Step 1: revenue-summary

> **TASK-5** 금액 나눔·기간 합·비교 · **REQ-005** · AC-005.1 ~ AC-005.6
> Phase 2 `revenue-2-numbers` · Step 1 — `specs/revenue/tasks.md`
> 명세 `specs/revenue/`가 승인된 뒤에만 한다(`python3 ~/.claude/harness/bin/sdd status revenue`로 확인. 승인 전이면 `blocked`). 이 step은 TASK-5 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/revenue/requirements.md`의 REQ-005에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-005.1**: `splitDay(row)`: 급여 = `insurer + copay`(요양비용총액), 공단부담 = `insurer`, 본인부담 = `copay`(= 급여 − 공단부담), 비급여 = `noncovered`, 기타 = `otherTotal`(100/100미만총액 + 전액본인부담). 급여 + 비급여 + 기타 ≠ `total`이거나 어느 칸이든 음수면 그날은 확인 필요(`null`), 고쳐 맞추지 않음
- **AC-005.2**: `sumPeriod(rows, range)`: 확인된 날의 여섯 금액(총액 = 매출·급여·공단부담·본인부담·비급여·기타, 급여 + 비급여 + 기타 = 총액) 합·확인 필요한 날 목록·내원 합·환자 수(1일 시작 기간이면 마지막 날 `patientsToDate`, 아니면 `null`). 줄이 없거나 모두 0이고 확인 필요한 날도 없으면 `null`
- **AC-005.3**: `periodsFor(month, today)`: 고른 기간(1일~말일과 어제 가운데 이른 날)·지난달 같은 기간(짧으면 말일)·작년 같은 때(2월 29일 → 28일). `firstMonth(today)` = 어제가 속한 달. 날짜는 `lib/analytics/dates.ts`만
- **AC-005.4**: `compare(now, before)`: 비율 소수 첫째 자리 버림, 방향 up·down·same, before가 null·0이면 `null`("비교할 수 없음")
- **AC-005.5**: `monthSeries(rows, lastMonth, today)`: 13달(오래된 달부터) 총액·급여·비급여·기타·내원·환자 수·1인당, 자료 없는 달 `null`, 끝나지 않은 달 `partial: true`
- **AC-005.6**: `perPatient(sum)`: 확인된 날의 총액 합 ÷ 기간 환자 수, `Math.floor`. 환자 수 `null`·0이면 `null`. 확인 필요한 날이 있으면 `lowered: true`

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-004·008·016·020·021
- `/specs/revenue/requirements.md` — 맨 위 승인 줄(시안 승인·사용자 결정 2026-11-01)과 이 step의 REQ
- `/specs/revenue/design.md` — 이 step이 가리키는 절
- `/specs/revenue/tasks.md` — 머리말과 이 step의 TASK
- `/specs/revenue/design.md` — 7절(모양), 10절·12절(환자 한 명 기준 1인당, 확인 필요 결정), 2절 1(총진료비에 비급여가 들어 있는가)
- `/src/lib/analytics/dates.ts`(쓸 함수: `todayInKorea`·`addDays`·`addMonths`·`monthOf`·`monthRange`·`eachDay`·`compareYmd`)
- `/src/components/charts/format.ts`(`formatRate`의 버림 방식 — 같은 방식으로 비율을 자른다)
- `/docs/revenue/pc-check.md` ① 결과(총괄이 알려 준 답. 메인 세션이 이 step 프롬프트나 summary에 적어 준다)
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

- **환자 자료는 PC 밖으로 안 나간다**: 서버(Supabase)에는 날짜별 합계 금액·건수(내원·신환·재진·환자 수)·확인 필요 여부와 달별 처방 코드·건수·금액만 간다. 환자 수는 도우미가 비트 DB 안에서 센다. 이름·차트번호·접수 번호·주민번호는 어디에도(답·저장·기록·시험 자료) 없다. 가짜 자료만 쓴다 (CLAUDE.md, design.md 1·3절)
- **금액**: 원 단위 정수. 반올림하지 않고 원 미만은 버린다. 합계는 항목 금액의 합 (CLAUDE.md, ADR-008). 비율은 소수 첫째 자리 버림
- **날짜**: 한국 날짜 계산은 `src/lib/analytics/dates.ts`의 함수만 쓴다. `new Date()` 산수를 새로 만들지 않는다 (CLAUDE.md)
- **순수 함수**: 네트워크·브라우저 저장소·console·React·supabase를 쓰지 않는다. 입력은 `RevenueDayRow` 배열뿐이다

## 작업

### 0. 시작 전 확인
- 확인표 '먼저 할 것' ① 답은 '아니오'였고(2026-11-01), 사용자가 보낸 외래환자경영통계 화면의 식(총진료비 = 요양비용총액 + 비급여 + 100/100미만총액 + 전액본인부담, 요양비용총액 = 공단 + 급여본인부담금)으로 AC-005.1을 바꿨다. `sdd status revenue`가 승인됨일 때만 시작한다

### 1. `src/lib/revenue/summary.ts`
- 모양은 design.md 7절. 타입(`DaySplit`·`PeriodSum`·`MonthPoint`)은 이 파일에서 export한다
- `sumPeriod`: `range` 밖의 줄은 무시. 확인 필요(`unconfirmed` 또는 `splitDay`가 `null`)인 날은 금액 합에서 빼고 `uncheckedDays`에 날짜를 넣는다. `visits`가 `null`인 날은 내원 합에서 빠진다. 환자 수는 `range.from`이 그 달 1일일 때만 `range.to` 줄의 `patientsToDate`(그 줄이 없거나 `null`이면 `null`). 서로 다른 환자 수를 날마다 더하지 않는다(같은 환자가 두 번 세어진다)
- `periodsFor`: 고른 달이 이번 달이면 끝 = 어제, 지난 달이면 끝 = 말일. 고른 달이 아직 1일도 지나지 않았으면(오늘이 1일) 그 달은 고를 수 없다 — `firstMonth`가 지난달을 준다
- `compare`: `rate = (now − before) / before × 100`을 소수 첫째 자리 버림(음수도 0 쪽으로 버림). 같으면 `same`
- `monthSeries`: `lastMonth`부터 거꾸로 13달, 반환은 오래된 달부터. 달마다 `sumPeriod`(그 달 1일~min(말일, 어제))

### 2. 시험 (`summary.test.ts`, 가짜 숫자)
- 급여 = 공단 + 본인부담, 기타 = `otherTotal`, 급여 + 비급여 + 기타 ≠ 총액 → `null`, 어느 칸이든 음수 → `null`(AC-005.1) · 기타 합이 들어 있음 · 확인 필요한 날 빠짐·목록, 빈 기간 `null`, 모두 0이면 `null`, 원 합이 그대로, 환자 수 = 마지막 날 `patientsToDate`, 1일 시작이 아니면 `null`(AC-005.2) · 3월 31일 → 2월 28일, 윤년 2월 29일 → 작년 28일, 오늘이 1일이면 `firstMonth`는 지난달, 이번 달은 어제까지(AC-005.3) · +4.08% → 4.0, −2.15% → −2.1, before 0·null → `null`(AC-005.4) · 13달 순서·자료 없는 달 `null`·진행 중 `partial`(AC-005.5) · 162,480,350 ÷ 1,872명 → 86,795, 환자 0·`null` → `null`, 확인 필요한 날 있음 → `lowered`(AC-005.6)
- `TZ=Asia/Seoul`(vitest 설정)에서 돈다. 오늘은 인자로만 받는다(시계를 읽지 않는다)

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-005.1 급여는 총진료비에서 비급여를 뺀 값 …', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-5 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-5 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/lib/revenue/summary.test.ts   # AC-005.1~AC-005.6
python3 ~/.claude/harness/bin/tdd-run TASK-5 --expect green
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

- `Math.round`·`toFixed`로 금액·비율을 반올림하지 마라. 이유: 원 미만·소수는 버린다(CLAUDE.md, ADR-008)
- 자료 없는 달·기간을 0으로 채우지 마라. 이유: 없는 것과 0은 다르다. 화면은 "자료 없음"을 보여야 한다(AC-005.2·005.5)
- 함수 안에서 `new Date()`로 오늘을 읽지 마라. 이유: 시험이 날짜를 정할 수 있어야 하고, 한국 날짜는 `dates.ts` 한 곳이다
- TASK-1 ① 답 없이 급여 식을 정하지 마라. 이유: 총진료비에 비급여가 들어 있는지는 코드로 확인하지 못했다(design.md 2절)
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- 기존 테스트를 깨뜨리지 마라. 이유: 앞 TASK와 다른 기능(청구 사전점검 등)의 시험이 계속 통과해야 한다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`를 고치지 마라. 이유: 규칙 문서는 사용자 승인으로만 바뀐다
