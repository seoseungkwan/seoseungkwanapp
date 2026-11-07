# 설계: 대시보드 UI/UX와 AI 경영 리포트 요약

## 1. 개요
- 화면만 바꾼다. 서버(`app/api/ai/`)·DB·인증·`lib/analytics`·`workers`·AI 모델/지시문/요금은 손대지 않는다. 새 요청은 대시보드 AI 요약의 기존 `GET /api/ai/report?month=`(저장 리포트 읽기, Claude 안 부름) 하나이고, POST는 사용자가 누를 때만이다.
- 시안: `docs/mockups/dashboard-ux/index.html`(상태 조작판 · 1440/1024/768/390/200% 폭).

## 2. 읽기 상태 (REQ-2701)
- `LiveDashboard`: `drawn === null`(저장 숫자 읽는 중)이면 `DashboardSkeleton`(새 `components/dashboard/live/DashboardSkeleton.tsx`)을 그린다. 묶음은 `groups: undefined`(읽는 중)인 채로 `BitDashboard`를 바로 놓는다. 다시 읽기(`readAgain`)에도 떠남 표시(ref)를 둔다.
- `SummarySource.groups`에 '읽는 중'을 더한다: `groups?: readonly RxGroupLine[] | null | 'pending'`. 처방 상위는 `'pending'`이면 "묶음을 읽는 중"(빈 줄 다섯 + 가운데 글, role=status).
- `BitDashboard`: `groups === undefined`면 비트 읽기 효과를 미룬다(의존에 `groupsSettled` 더함). 묶음이 오면 그때 한 번 시작한다. `key`는 그대로라 다시 놓지 않는다.
- 머리 줄 `StatusHeader`(ReadStatus.tsx 안, `ReadLine`을 대신): props `{ readAt: number | null; savedAt: string | null; reading: boolean; failed: boolean; onReread() }`. `savedAt`은 `LiveDashboard`가 `readDays().latest?.at`으로 넘긴다(`Drawn.savedAt`, BitDashboard prop `savedAt`).
- 다시 읽기 실패 `RereadAlert`는 머리 줄 바로 아래(지금 글 그대로).

## 3. 메뉴 (REQ-2702)
- `menu.ts`: `MenuItem.primary: boolean`(대시보드·통계·청구·환자·매출만 true). 차례·이름·path·ready는 그대로(랜딩 미리보기 시험이 MENU와 견준다). `PRIMARY_MENU`·`MORE_MENU`(filter) 내보냄.
- `TabBar`: 띠에 `PRIMARY_MENU`만. `AllMenu.tsx` → `MoreMenu.tsx`(모든 폭에 보임). `current`가 MORE_MENU 항목이면 단추가 지금 탭 모양 + "더보기 · {이름}". 누른 항목이 MORE면 단추에 `data-pending`.
- 판: 768px 이상 `absolute right-0 top-full w-80`(단추 감싸개 relative), 768px 미만 nav 기준 `inset-x-0` 두 칸(감싸개 `max-md:static`).

## 4. 날짜 범위 (REQ-2703)
- `PeriodPicker`에 `align?: 'start' | 'end'`(기본 start). end면 판 클래스 `md:right-0 md:left-auto`.
- 새 `components/dashboard/summary/PeriodButtons.tsx`: `{ choice, picker, lastDay, todayDone, onChoose }`를 받아 "추이 조회 기간" 이름 + `ds.segment` 빠른 단추 + `PeriodPicker align="end"` + 적용 글. `FlowSection`이 쓴다.
- 일별 기준일 이름·적용 글은 `DailySection`이 `DateControl`을 감싸서 준다(`DateControl`은 `labelledBy?: string` prop만 더함).

## 5. AI 요약 (REQ-2704)
- 새 `components/dashboard/ai/useAiBrief.ts`(상태·부르기) + `AiBrief.tsx`(그리기). 상태: `loading | readError | none | busy(seconds) | failed(code, report|null) | noData | report(view)`.
  - 열 때 `loadMonth(firstMonth(today))` 한 번(요청 번호로 늦은 답 버림, 떠나면 번호 올림). reauth → `location.reload()`.
  - `create()`: ref `waiting`으로 같은 틱 두 번 막음 → `analyzeMonth(month)`. 1초 타이머(떠날 때 정리). 성공 → report, 실패 → failed(이전 report 유지), NO-DATA → noData. 저절로 다시 부르지 않는다.
- 모델 표시: `lib/ai/reportScreen.ts`에 `modelBasis(model)`: `claude-opus-`로 시작 → 'Claude Opus 기반 분석', 아니면 `${modelName(model)} 분석`.
- 카드 나누기: `briefGroups(cards)` → `{ change: up|down 앞 3, watch: 앞 2, guess: 앞 2 }`(순서 유지, 순수 함수, 같은 파일).
- `AiReportScreen`·`ReportBody`는 가져오지 않는다(무거운 화면 코드). `reportClient`·`reportScreen`·`markdown`(TAG_LABEL)만.

## 6. 보고 문장 (REQ-2705)
- `ReportBlock`: h1 → `p` 한 단락(body ink-2), 이름 줄에 칩. 문장 만들기(`reportSentence`)·복사는 그대로.

## 7. 그래프 (REQ-2706)
- 새 `components/charts/ChartTable.tsx`: 보이는 표(StackedBarChart와 같은 열 · '자료 없음' 글 · 상태 글), 상자 `max-h-72 overflow-auto`, `thead` sticky.
- `StackedBarChart`에 `srTable?: boolean`(기본 true). false면 화면 읽기 표를 그리지 않는다. 표 펼침 상태는 부르는 쪽(`TableToggle`, 새 `components/dashboard/summary/TableToggle.tsx`, 단추 + ChartTable)이 쥔다.
- 새 `components/charts/DeltaText.tsx`: KpiStat `DeltaLine`의 화살표·sr·글 부분. KpiStat과 대시보드 "지난주 같은 요일보다" 칸이 같이 쓴다.

## 8. 통합 (REQ-2707)
- `DashboardHome`: 연결 뒤 가지에서 `header`·`daily`·`ai`·`flow`·`links` 자리를 이 차례로 그린다(무엇을 넣을지는 BitDashboard). 연결 전 가지는 그대로.
- `DashboardAnalysis` → `DailySection.tsx`(숫자 칸 + 보고 문장 자리) · `FlowSection.tsx`(기간 + 그래프 넷). 빈 상태 글(emptyLook)은 그대로 옮긴다. `DashboardAnalysis.tsx`는 둘을 차례로 그리는 얇은 감싸개로 남긴다(연결 전·뼈대에서 씀).
- `ds`: `segment`(group·button·on·off), `chartNoSideScroll`, `button.secondaryLarge`. 통계 `PeriodPicker`·`stats/sections/parts.tsx`의 같은 값을 이것으로 바꾼다(값 그대로).
- 바로 가기: `ReadyNowSide`를 브리핑 오른쪽 칸에서 맨 아래 `FeatureIndex` 위로 옮긴다(글 그대로).

## 9. 결정과 트레이드오프
- 툴팁 대신 [표로 보기]: 키보드·터치·화면 읽기가 모두 같은 표를 쓰고, 그래프 부품이 훅 없이 서버에서 그대로 그려진다.
- 대시보드에서는 리포트가 없을 때만 만든다. 다시 만들기는 확인 창이 있는 AI 리포트 화면에 남긴다(요금이 드는 일을 한 화면에 모은다).
- '추천 행동'은 지금 리포트 모양(summary·cards[up|down|watch|guess])에 없어 그리지 않는다. 더하려면 지시문·출력 모양을 바꾸는 별도 결정이 필요하다.

## 10. 위험
- 앞 명세 시험(탭 13개 한 줄, 보고 문장 h1, 날짜 줄 자리)이 이 명세대로 바뀐다. 바뀐 시험은 이 명세의 AC ID를 단다. 바뀐 뜻이 없는 시험의 기대값은 바꾸지 않는다.
- 묶음보다 저장 숫자가 먼저 그려져 처방 상위만 늦게 바뀐다(의도).
