# Step 3: stats-view

> **TASK-11** 통계 화면 숫자 · **REQ-511** · AC-511.1 ~ AC-511.7
> Phase 3 · 숫자와 글 `stats-3-numbers` · Step 3 — `specs/stats/tasks.md`
> 명세 `specs/stats/`가 승인된 뒤에만 시작한다(`python3 ~/.claude/harness/bin/sdd status stats`). 이 step은 TASK-11 하나만 한다. 다른 TASK의 일은 하지 않는다.
> 옮겨 옴: precheck REQ-029 (AC-029.2 첫 재방문까지 날수) — 사전점검 명세의 같은 몫은 그 명세가 다음에 뺀다. 이 step은 `specs/stats`만 따른다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/stats/requirements.md`의 REQ-511(통계 화면 숫자 (`components/stats/view.ts`))에 있다. 아래는 같은 글이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-511.1**: Given 오늘과 기간(`'7d' | '30d' | '90d' | '12m'`, 처음 `'30d'`), When `statsRange`, Then 일 기간은 어제까지 N일(대시보드 `periodRange` 그대로), `'12m'`은 이번 달을 넣은 12달이다. 비교 기간은 일 기간이면 바로 앞 같은 일수(`PreviousEqualDays`), `'12m'`이면 작년 같은 12달(`PreviousYear`)이다. 불러올 범위는 비교 기간 첫날이 든 달의 1일 ~ 오늘이고 800일 이하다
- **AC-511.2**: Given 저장 모양과 기간, When 기간 요약을 만들면, Then 네 칸이다: 평균 환자 수(일 기간은 자료 있는 날 평균, `'12m'`은 자료 있는 달 평균, 소수점 아래는 버림), 신환(합), 재진(합), 비교 기간보다(평균의 `compareNumbers` 증감). 자료 없는 날·달은 0으로 치지 않고, 비교 기간 자료가 없으면 넷째 칸은 "비교할 자료가 없어요"다
- **AC-511.3**: Given 저장 모양, When 환자 수 추이를 만들면, Then 일 기간은 자료 있는 날마다 신환·재진 칸(대시보드 `trendBuckets` 그대로), `'12m'`은 달 숫자(`MonthPayload.totals`)마다 칸이고, 덜 끝난 칸은 '일부 기간'이다
- **AC-511.4**: Given 저장 모양, When 재방문율을 만들면, Then 7·14·30일 = 그 값이 null이 아닌 칸들의 재방문 합 ÷ 그 칸들의 집단 합이다. 모두 null이면 '집계 중', 분모가 0이면 '자료 없음'이다. 첫 재방문까지 날수는 30일 값이 숫자인 칸들로 "7일 안"(within7) · "8~14일"(within14 − within7) · "15~30일"(within30 − within14) · "30일 안에 다시 안 옴"(cohort − within30)이고 넷의 합 = 그 칸들의 집단 합이다. 원본 `CohortTests.cs`의 비율 사례(분모 구별, 분모 0이면 미산출)를 옮겨 통과한다
- **AC-511.5**: Given 저장 모양, When 요일별 환자 수를 만들면, Then 대시보드 `weekdayBuckets` 규칙 그대로다(`'12m'`도 기간 안 일 숫자로)
- **AC-511.6**: Given 저장 모양, When 처방 목록을 만들면, Then 기간 건수가 큰 5개(같으면 코드 순)이고 처방마다 이름(가장 최근 날의 이름)·기간 건수·비교 기간 건수·증감·신환 건수·재진 건수가 있다
- **AC-511.7**: Given `components/stats/view.ts` 소스, When 보면, Then 순수 함수(React·Supabase·`fetch`·브라우저 저장소 없음)이고 날짜는 `lib/analytics/dates.ts`, 증감은 `compareNumbers`, 대시보드 `components/dashboard/summary/view.ts`의 함수는 불러 쓰기만 한다

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/specs/stats/requirements.md` — REQ-511
- `/specs/stats/design.md` — '구성 요소 / 인터페이스' TASK-11, '데이터 흐름'(기간)
- `/specs/stats/tasks.md` — TASK-11 (수정 범위·메모)
- `/src/components/dashboard/summary/view.ts` (`periodRange`·`trendBuckets`·`revisitView`·`weekdayBuckets`·`topRx` — 불러 쓰기만)
- `/src/components/charts/StackedBarChart.tsx`(`BarBucket`)·`RankedBars.tsx`(`RankedItem`)·`format.ts`
- `/src/lib/analytics/rxTrend.ts` (TASK-8), `/src/lib/analytics/history.ts`, `/src/lib/analytics/dates.ts`, `/src/lib/analytics/compare.ts`
- `/src/types/payload.ts`
- 이전 step에서 만든 파일: TASK-2(`within30`), TASK-8(`buildTrend`·`comparisonRange`)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 원본 (양지바른, 읽기만)

- GitHub: 저장소 `seoseungkwan/shared`, 커밋 `2a1069b`, 폴더 `YangjiBareun_사전점검/`
- 이 서버의 사본(나중에 지워질 수 있음): `/tmp/claude-1000/-home-developer/4601ab55-16fe-474f-813a-c7a0d544b749/scratchpad/yangji/repo/YangjiBareun_사전점검/`
  - 얕은 clone(HEAD `c66488e`)이다. `2a1069b`와 `c66488e` 사이에 이 폴더 안 파일은 바뀌지 않았다. 그대로 써도 된다
- 사본이 없으면 저장소 밖 임시 폴더에 받는다: `git clone https://github.com/seoseungkwan/shared.git <임시폴더>/shared && git -C <임시폴더>/shared checkout 2a1069b` → `export YANGJI_SRC=<임시폴더>/shared/YangjiBareun_사전점검`. 받을 수 없으면 `blocked`(사유: 원본 저장소 접근 필요)로 멈춘다
- 원본 시험(`tests/*.py`·`*Tests.cs`)은 모두 가짜 자료다. 사례를 시험 씨앗으로 옮겨도 된다

- 이 step에서 볼 원본(폴더 `YangjiBareun_사전점검/` 기준):
  - `vendor/drbit_export/CohortContracts.cs` (`CohortRate`·`CohortMonthResult`의 비율)
  - `vendor/drbit_export/CohortTests.cs` (옮길 비율 사례)

## 수정 범위 (tasks.md TASK-11)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/components/stats/view.ts`
  - `src/components/stats/view.test.ts`
- Tests:
  - `src/components/stats/view.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **날짜는 한 곳**: 날짜 계산은 `src/lib/analytics/dates.ts`(한국 날짜, `YYYY-MM-DD`). 시험은 `TZ=Asia/Seoul`에서 돈다 (CLAUDE.md)
- **원본은 저장소 밖**: 원본 경로는 `YANGJI_SRC` 환경 변수나 스크립트 인자로만 받는다. 원본 파일 통째를 저장소에 복사·커밋하지 않는다. 커밋하는 것은 옮긴 코드, 원본 SQL 문장 사본(`original-sql/*.sql`), 골든 결과뿐이다 (specs/stats/tasks.md 머리말)

## 작업

### 1. 코드 (`src/components/stats/view.ts`, 순수 — React·Supabase·`fetch`·브라우저 저장소 없음)
- design.md TASK-11 시그니처. AC-511.1~511.6의 셈을 그대로:
  - `statsRange`: 일 기간 = 대시보드 `periodRange(today, N)`, `'12m'` = 이번 달 포함 12달, 비교 = `comparisonRange(…, 'PreviousEqualDays' | 'PreviousYear')`, 불러올 범위 = 비교 첫날이 든 달 1일 ~ 오늘(800일 이하를 시험)
  - 기간 요약 네 칸, 환자 수 추이(일: `trendBuckets` 재사용 / 달: `MonthPayload.totals`), 재방문율 7·14·30 + 첫 재방문까지 날수 네 칸(합 = 집단 합), 요일별(`weekdayBuckets` 재사용), 처방 목록 상위 5 + `rxDetail`(`buildTrend`)
- 자료 없는 날·달은 0으로 치지 않는다. 평균은 버림

### 2. 시험 (`view.test.ts`)
- AC마다 가짜 저장 모양(시험 안에서 만듦)으로. AC-511.4는 원본 `CohortTests.cs`의 비율 사례(신환율·기존환자율·재방문율 분모 구별, 분모 0이면 미산출)를 옮긴다
- AC-511.7: 소스 글자에 `react`·`supabase`·`fetch`·`localStorage`가 없고 대시보드 `view.ts`를 불러온다

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-501.2 31일째에만 다시 오면 30일 재방문이 아니다', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-11 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일(`*.config.*`·`tsconfig*.json`·`package.json`·`.gitignore`)과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-11 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/components/stats/view.test.ts src/components/dashboard/summary/view.test.ts
python3 ~/.claude/harness/bin/tdd-run TASK-11 --expect green
npm run lint && npm test && npm run build
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status stats`에서 AC-511.1 ~ AC-511.7이 이 TASK의 시험과 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가(새 패키지 없음)?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/stats-3-numbers/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (원본 접근, 목업 승인, 외부 인증, 수동 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- 대시보드 `view.ts`를 고치지 마라. 이유: 이 step 범위 밖이고, 대시보드의 30일 줄은 TASK-16 몫이다(불러 쓰기만)
- 빠진 날을 0으로 채워 평균·비율·증감을 만들지 마라. 이유: 지어낸 숫자가 된다(UI_GUIDE '빈 상태')
- 화면 컴포넌트(`*.tsx`)를 만들지 마라. 이유: 화면은 목업 승인 뒤 TASK-13·14다
- 기존 테스트를 깨뜨리지 마라. 이유: 지금 통계 엔진·청구·탭 틀 시험이 계속 통과해야 한다(이 TASK의 Files에 있는 시험만, 정한 칸만 고친다)
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- `specs/precheck/`·`phases/precheck-*`를 고치지 마라. 이유: 청구 브랜치가 그 파일을 가진다. 그쪽이 할 일은 `specs/stats/design.md` '사전점검 명세가 할 일'에 적혀 있다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- 새 npm·NuGet 패키지를 넣지 마라. 이유: `package.json`·csproj가 수정 범위 밖이고 ADR 기술 스택 밖이다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`plan.md`를 고치지 마라 · `docs/*`. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다

## 참고

- Phase 3 · 숫자와 글의 마지막 step이다. 메인 세션이 할 일: `verify` → 쉬운 말 보고
