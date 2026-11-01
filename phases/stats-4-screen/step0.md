# Step 0: stats-sections

> **TASK-13** 통계 그래프 섹션 · **REQ-513** · AC-513.1 ~ AC-513.11
> Phase 4 · 화면 `stats-4-screen` · Step 0 — `specs/stats/tasks.md`
> 명세 `specs/stats/`가 승인된 뒤에만 시작한다(`python3 ~/.claude/harness/bin/sdd status stats`). 이 step은 TASK-13 하나만 한다. 다른 TASK의 일은 하지 않는다.
> 옮겨 옴: precheck REQ-031 (precheck 031.3·031.4·031.5) — 사전점검 명세의 같은 몫은 그 명세가 다음에 뺀다. 이 step은 `specs/stats`만 따른다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/stats/requirements.md`의 REQ-513(통계 그래프 섹션 (`components/stats/sections/*`))에 있다. 아래는 같은 글이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-513.1**: Given 보기 모양(REQ-511·509·510), When 섹션을 그리면, Then 한 쪽에 이어서(도구 단추 줄 없음) 기간 요약 → 환자 수 추이 → 신환 재방문율(첫 재방문까지 날수 포함) → 처방 추세 → 처방별 신환·재진 → 원장님 보고 문장 → 요일별 환자 수 차례이고 섹션마다 h2다. 차례·문구·배치가 목업 승인본과 다르면 목업이 이긴다(그때 이 AC의 차례만 고친다). 예외: 최근 30일 보기의 30일 줄과 첫 재방문까지 날수(S6), 12개월 처방 증감(S7)은 2026-11-01 사용자 결정으로 목업이 아니라 이 명세를 따른다
- **AC-513.2**: Given 그래프, When 그리면, Then `components/charts`의 부품(`StackedBarChart`·`RankedBars`·`KpiStat`·`InlineBar`·`ChartLegend`)만 쓴다(새 패키지 없음, 움직임 없음). 증감은 색만 쓰지 않고 ▲▼와 글자(`formatDelta`)를 같이 쓴다(UI_GUIDE). `StackedBarChart`에는 칸마다 줄 수 있는 선택 값 `comparison?: number | null` 하나만 `BarBucket`에 더한다: 쌓은 막대 왼쪽에 가는 `faint` 막대로 그리고, 값을 줄 때만 눈금 계산에 넣는다. 어느 칸에도 값이 없으면 그림·표·지금 시험은 지금 그대로다. `null`은 막대를 그리지 않는다(예: 덮이지 않은 비교 칸, AC-511.8). 움직임 규칙과 `rules.test.ts`는 그대로 지킨다. 시험: `comparison`을 주면 가는 막대가 보이고 눈금이 그 값을 넣어 정해진다. 시험: 주지 않으면 지금과 결과가 같다(지금 시험을 고치지 않고 통과)
- **AC-513.3**: Given 그래프마다 있는 [자세히] 단추(`aria-expanded`, `aria-controls`), When 누르면, Then 그 그래프 바로 아래에 숫자 표(머리 줄 + 날짜·달마다 값)가 열리고 다시 누르면 닫힌다. 주소(URL)는 바뀌지 않는다. 처방 추세에서 처방 줄을 누르면 그 처방의 칸별 건수·신환·재진 막대가 열린다
- **AC-513.4**: Given 자료 없는 섹션, When 그리면, Then 그래프·빈 틀 없이 "자료 없음" + 한 줄 안내(목업 문구)다. 숫자를 지어내지 않는다
- **AC-513.5**: Given 처방 추세, When 그리면, Then 금액·소모량 자리에 "금액·소모량은 매출 탭에서 볼 수 있어요"(목업 문구)를 보인다
- **AC-513.6**: Given 원장님 보고 문장, When 그리면, Then 일일(오늘·어제)·월말(이번 달·지난달) 고르기 단추 묶음, 보고 글(글자로만, 줄바꿈 그대로), [복사], '확인 필요' 줄 표시(색과 함께 "확인 필요" 글자)가 있다. [복사]는 대시보드 [복사]와 같은 동작이다(`navigator.clipboard.writeText`, 2초 "복사했어요", 실패하면 직접 복사 안내, 폭 흔들림 없음). `ok: false` 벌은 "이 기간은 보고를 확정할 수 없어요" + 비트 원본 통계에서 확인하라는 안내다
- **AC-513.7**: Given 처방별 신환·재진, When 그리면, Then 머리 글(`rxVisitHeadline`), 처방마다 신환·재진·합계 표(합계가 큰 차례 10개, [모두 보기]로 나머지), [표 복사](`formatRxVisitSplit` 글)가 있다
- **AC-513.8**: Given 비트 PC에서 불러온 자료가 없음, When 처방별 신환·재진·원장님 보고 문장을 그리면, Then "비트 PC에서 불러오면 보여요" + 한 줄 이유(진료 줄·금액은 서버에 저장하지 않는다)다
- **AC-513.9**: Given `components/stats/sections/**`와 `components/stats/view.ts`(시험 밖) 소스(화면 조립 파일 `StatsScreen.tsx`·`useStatsData.ts`·`useStatsWorker.ts`·`SourcePicker.tsx`는 저장·Worker·통로를 불러야 하므로 이 AC 밖이고 REQ-514의 화면 상태 규칙을 따른다), When 보면, Then Supabase·`fetch`·브라우저 저장소·`lib/bridge`·`workers`를 쓰지 않고(섹션은 props만 받는다) `ds` 공통 모양과 토큰만 쓰며, 상자 안 상자가 없고 앱 화면 규칙 시험(`components/ui/classes.test.ts` 검사 목록에 `src/components/stats`를 더함)을 통과한다
- **AC-513.10**: Given `'30d'` 보기 모양(REQ-511 `revisitRates`)에서 30일 줄이 비율임, When `RevisitSection`을 그리면, Then 30일 줄은 "집계 중" 대신 비율을 값으로 보이고 caption은 "{시작} – {끝}에 온 신환 {N}명 가운데 {K}명 · 온 뒤 30일이 지난 가장 최근 신환이에요"다({N}·{K}는 그 칸의 `cohort`·`within`). 첫 재방문까지 날수의 기준 줄은 목업 문구 "{시작} – {끝}에 온 신환 N명 기준 (온 뒤 30일이 지난 날만)"에 같은 날짜를 쓴다. 7·14일 줄은 고른 기간 그대로다. `'7d'`는 승인 목업 그대로(셋 다 집계 중, 지금 안내 글)이고 `'90d'`·`'12m'`은 바뀌지 않는다
- **AC-513.11**: Given 처방 추세 줄(REQ-511 `rxList`·`rxDetail`), When `RxTrendSection`을 그리면, Then 줄의 막대와 비교 눈금은 `comparable`로 그린다(막대 = `comparable.current`, 눈금 = `comparable.previous`). 글자 건수는 `count`이고 `partial`인 줄은 그 옆에 '일부 기간'을 보인다. `comparable`이 null이면 막대는 `count`로 그리고(목업의 비교 없는 줄과 같다) 비교 눈금은 없으며 증감은 "비교할 수 없음"이다(`formatDelta` 글자. 목업의 "비교할 자료 없음"보다 이 글자가 이긴다). [자세히] 표의 비교 기간 칸은 그 칸의 `rxDetail` 점이 `covered: false`이면 "0건"이 아니라 "–"다(목업과 같다). 시험: `covered: false`인 비교 칸 — 표에 "–"이고 "0건"이 없다

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/specs/stats/requirements.md` — REQ-513
- `/specs/stats/design.md` — '구성 요소 / 인터페이스' TASK-13, '결정과 트레이드오프'(복사 단추는 통계 폴더에)
- `/specs/stats/tasks.md` — TASK-13 (수정 범위·메모)
- `/docs/mockups/stats/notes.md` (승인본 — 맨 위 승인 줄이 없으면 시작하지 말고 `blocked`)
- `/docs/UI_GUIDE.md` '차트'·'빈 상태'·'공통 모양'
- `/src/components/ui/classes.ts`(`ds`), `/src/components/ui/classes.test.ts`(앱 화면 규칙 시험)
- `/src/components/charts/*` (부품과 `format.ts`의 `formatDelta`·`formatCount`·`formatRate`)
- `/src/components/dashboard/summary/DashboardAnalysis.tsx`·`ReportBlock.tsx` (같은 그래프·복사 동작의 본보기)
- `/src/components/stats/view.ts` (TASK-11), `/src/lib/clinicReport/reportText.ts` (TASK-10), `/src/types/stats.ts`
- 이전 step에서 만든 파일: TASK-12 (목업 승인본), TASK-11·10·9 (보기 모양)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 승인된 목업 (화면 step)

- `docs/mockups/stats/index.html`·`notes.md` 승인본(TASK-12). `notes.md` 맨 위에 '승인:' 줄이 없으면 시작하지 말고 `blocked`(사유: 목업 승인 전)로 멈춘다
- 명세의 화면 AC는 내용과 동작을 정하고, 배치·문구는 목업이 정한다
- 예외(AC-513.1): 최근 30일 보기의 30일 줄과 첫 재방문까지 날수(S6), 12개월 처방 증감(S7)은 2026-11-01 사용자 결정으로 승인본이 아니라 명세를 따른다. 처방 줄에 비교가 없을 때의 글자는 AC-513.11을 따른다. `notes.md`의 해당 두 줄에도 적혀 있다. 승인본 파일(`index.html`)은 고치지 않는다
- 2026-11-01 목업 변경(30일 caption, '일부 기간' 표시, "비교할 수 없음")에 사용자 OK가 있어야 시작한다. OK가 없으면 `blocked`(사유: 목업 변경 OK 대기)로 멈춘다(tasks.md TASK-12 메모)

## 수정 범위 (tasks.md TASK-13)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/components/stats/sections/*`
  - `src/components/ui/classes.test.ts`
  - `src/components/charts/StackedBarChart.tsx`
  - `src/components/charts/StackedBarChart.test.tsx`
- Tests:
  - `src/components/stats/sections/PeriodSummary.test.tsx`
  - `src/components/stats/sections/PatientTrendSection.test.tsx`
  - `src/components/stats/sections/RevisitSection.test.tsx`
  - `src/components/stats/sections/RxTrendSection.test.tsx`
  - `src/components/stats/sections/RxSplitSection.test.tsx`
  - `src/components/stats/sections/ReportSection.test.tsx`
  - `src/components/stats/sections/WeekdaySection.test.tsx`
  - `src/components/stats/sections/DetailToggle.test.tsx`
  - `src/components/stats/sections/CopyButton.test.tsx`
  - `src/components/ui/classes.test.ts`
  - `src/components/charts/StackedBarChart.test.tsx`
- TDD: required
- 메모: `classes.test.ts`는 `APP_DIRS`에 `'src/components/stats'` 한 줄만 더한다. `StackedBarChart`는 선택 값 `comparison` 하나만 더한다(AC-513.2). 지금 시험은 고치지 않는다

## 꼭 지킬 규칙 (CRITICAL)

- **화면은 승인된 목업대로**: 배치·문구·상태는 `docs/mockups/stats/` 승인본(`notes.md` 맨 위 승인 기록)을 따른다. 모양은 `components/ui/classes.ts`의 `ds`와 `globals.css` 토큰만(옛 `ui.`·옛 Tailwind 이름·`font-bold` 없음, 굵기 400·500·600). 좋고 나쁨은 색만 쓰지 않고 ▲▼·글자를 같이 쓴다. 그래프는 움직이지 않는다. 상자 안 상자 금지 (CLAUDE.md, docs/UI_GUIDE.md)
- **브라우저 저장소·주소 안 씀**: 숫자·처방 이름·보고 글을 `localStorage`·`sessionStorage`·`indexedDB`·주소(URL·쿼리)·`history.state`에 넣지 않는다. 화면 상태와 Worker 메모리에만 둔다
- **가짜 자료만**: 실제 환자 자료를 쓰지 않는다. 시험은 `fixtures/`의 가짜 자료와 시험 안에서 만든 가짜 값만 쓴다(차트번호는 `9`로 시작하는 6자리 가짜, 이름·전화·주민번호 없음). 차트번호·주민번호 모양은 소스에 통째로 쓰지 않고 조각을 이어 만든다(stats-core 규칙). 실제 비트 내보내기를 커밋하지 않는다 (CLAUDE.md)

## 작업

### 1. 섹션 (`src/components/stats/sections/*`)
- `PeriodSummary`·`PatientTrendSection`·`RevisitSection`·`RxTrendSection`·`RxSplitSection`·`ReportSection`·`WeekdaySection` + `DetailToggle`·`CopyButton`. 모두 props(보기 모양)만 받는다. 자세히·복사·고르기 상태만 `'use client'`
- AC-513.1~513.11을 승인본 배치·문구로(예외는 위 '승인된 목업'). 차트는 `components/charts` 부품만, 증감은 `formatDelta`(▲▼ + 글자), 빈 상태는 그래프 없이 "자료 없음" + 한 줄
- `RevisitSection`(S6, AC-513.10): 날짜는 `revisitRates`의 `d30Cohort`와 `firstRevisit`의 `from`·`to`를 그대로 쓰고, 7·14·30일 줄의 caption 숫자와 [자세히] 표는 비율 칸의 `within`·`cohort`를 쓴다(줄의 "…빼고 셌어요"는 `excluded`가 참일 때만. 단 `'30d'`의 30일 줄은 AC-513.10이 caption을 정하므로 이 말을 붙이지 않는다). `'30d'`의 30일 줄이 비율이 아니면 지금 목업의 "집계 중"·"자료 없음" 그대로다
- `RxTrendSection`(S7, AC-513.11): 줄의 막대와 비교 눈금은 `comparable.current`·`comparable.previous`로 그린다(`InlineBar`). 증감과 기준을 맞추려는 것이다. `max`는 목록에서 그리는 값(막대·눈금) 가운데 가장 큰 값이다. 글자 건수는 `count`이고 `partial`이면 그 옆에 '일부 기간'을 붙인다. `comparable`이 null이면 `InlineBar`에 `current={count}`·`previous={null}`을 넘겨 막대는 그리고 눈금은 없앤다(목업 `gen.py`의 `pw: None` 줄과 같다). 증감은 `formatDelta`의 "비교할 수 없음"이다. [자세히] 표의 비교 칸은 `rxDetail` 점이 `covered: false`이면 "–"다(목업 `app.js`의 `p.pv == null`과 같다). 처방 줄을 열면 막대에 `rxDetail`의 같은 차례 `previous` 점의 `count`를 `comparison`으로 넘긴다(`covered: false`이면 `null`)
- `CopyButton`: 대시보드 `ReportBlock`의 [복사] 동작(성공 2초 "복사했어요", `aria-live`, 실패 안내, 폭 흔들림 없음)을 옮긴다. 문구는 이 파일 안에(`lib/errors.ts`를 고치지 않는다)

### 2. 차트 부품 (`src/components/charts/StackedBarChart.tsx`, AC-513.2)
- `BarBucket`에 선택 값 `comparison?: number | null` 하나만 더한다. 숫자가 있는 칸은 쌓은 막대 왼쪽에 가는 `bg-faint` 막대(목업 `gen.py`의 `.pv`)를 그리고, 눈금은 합계와 숫자인 `comparison` 가운데 가장 큰 값으로 정한다. `null`은 막대를 그리지 않는다
- 숫자가 있는 칸이 하나도 없으면 그림·표가 지금과 한 글자도 다르지 않다. 숫자가 있는 칸이 있으면 화면 읽기 표에 "비교 기간" 칸 하나가 더 붙는다(`null`은 "–", design.md TASK-13)

### 3. 규칙 시험 (`components/ui/classes.test.ts`)
- `APP_DIRS`에 `'src/components/stats'` 한 줄(AC-513.9). 다른 줄은 고치지 않는다

### 4. 시험 (jsdom, Testing Library — 지금 시험과 같은 도구)
- AC-513.2(`src/components/charts/StackedBarChart.test.tsx`, 지금 시험은 고치지 않고 더한다): `comparison`을 주면 가는 막대가 보이고 눈금이 그 값을 넣어 정해짐, `null`인 칸은 막대 없음, 화면 읽기 표에 "비교 기간" 칸이 붙음, 주지 않으면 지금과 결과가 같음. `rules.test.ts`는 고치지 않고 통과
- 섹션마다 AC ID 이름으로: 차례·h2, 자세히 열고 닫기(`aria-expanded`), 빈 상태, ▲▼ 글자, 처방 추세 금액 안내, 보고 고르기·확인 필요 표시·복사(가짜 `navigator.clipboard`), PC 전용 안내
- AC-513.10: `'30d'`의 30일 줄이 "집계 중" 대신 비율과 날짜 caption을 보임({N}·{K}는 `cohort`·`within`), 첫 재방문 기준 줄이 같은 날짜를 씀, `'7d'`는 셋 다 집계 중
- AC-513.11(`RxTrendSection.test.tsx`): 막대·눈금 위치가 `comparable`에서 나오고 건수 글자는 `count`임, `partial` 줄에 '일부 기간'이 보임, `comparable`이 null이면 눈금 없음·막대는 `count`·증감은 "비교할 수 없음"(일 기간과 12개월 둘 다), `covered: false`인 비교 칸은 [자세히] 표에 "–"이고 "0건"이 없음, 처방 줄을 열면 같은 차례 `previous.count`가 `comparison` 막대로 그려지고 `covered: false` 칸은 막대가 없음

## TASK-8에서 넘어온 규칙 (2026-11-01 리뷰)

- 90일 보기의 주 칸은 이번·비교 칸 수가 다를 수 있다(90이 7로 나뉘지 않음). `rxDetail`은 두 배열을 그대로 주므로, `RxTrendSection`이 같은 차례에 비교 점이 없는 칸을 `comparison: null`(막대 없음, 표 "–")로 바꾼다. 이번 칸보다 남는 비교 칸은 그리지 않는다. 시험으로 고정한다: 13칸 대 14칸, 14칸 대 13칸

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-501.2 31일째에만 다시 오면 30일 재방문이 아니다', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-13 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일(`*.config.*`·`tsconfig*.json`·`package.json`·`.gitignore`)과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-13 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/components/stats/sections src/components/ui/classes.test.ts
npx vitest run src/components/charts src/components/dashboard   # 차트의 지금 시험은 고치지 않고 통과, 대시보드 그대로
python3 ~/.claude/harness/bin/tdd-run TASK-13 --expect green
npm run lint && npm test && npm run build
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status stats`에서 AC-513.1 ~ AC-513.11이 이 TASK의 시험과 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가(새 패키지 없음)?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/stats-4-screen/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (원본 접근, 목업 승인, 외부 인증, 수동 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- 승인본과 다른 배치·문구로 새로 짓지 마라(예외는 AC-513.1의 최근 30일 보기 30일 줄·첫 재방문까지 날수와 12개월 처방 증감, AC-513.11의 "비교할 수 없음" 글자뿐). 이유: 화면은 승인된 목업대로(CLAUDE.md)
- 섹션(`components/stats/sections/**`)에서 Supabase·`fetch`·`lib/bridge`·`workers`를 불러오지 마라. 이유: 섹션은 props만 그린다(AC-513.9 — 화면 조립 파일 `StatsScreen.tsx`·`use*.ts`는 TASK-14 몫이고 이 AC 밖이다)
- 그래프 패키지(recharts·chart.js 등)를 넣지 마라. 이유: 차트 부품만 쓴다(UI_GUIDE, 새 패키지 없음)
- 차트 부품에 `comparison` 밖의 설정을 더하거나 다른 차트 부품을 고치지 마라. 이유: 대시보드가 같은 부품을 쓰고, 주지 않으면 지금 그대로여야 한다(AC-513.2)
- `components/common/CopyButton.tsx`를 만들지 마라. 이유: 청구 5단계가 그 이름을 만든다(design.md '결정')
- 보고 글을 HTML로 그리지 마라(`dangerouslySetInnerHTML`). 이유: 글자로만(ESLint `react/no-danger`)
- 기존 테스트를 깨뜨리지 마라. 이유: 지금 통계 엔진·청구·탭 틀 시험이 계속 통과해야 한다(이 TASK의 Files에 있는 시험만, 정한 칸만 고친다)
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- `specs/precheck/`·`phases/precheck-*`를 고치지 마라. 이유: 청구 브랜치가 그 파일을 가진다. 그쪽이 할 일은 `specs/stats/design.md` '사전점검 명세가 할 일'에 적혀 있다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- 새 npm·NuGet 패키지를 넣지 마라. 이유: `package.json`·csproj가 수정 범위 밖이고 ADR 기술 스택 밖이다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`plan.md`를 고치지 마라 · `docs/*`. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다
