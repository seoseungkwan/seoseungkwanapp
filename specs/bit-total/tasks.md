# 작업 분할: 확인 필요 없이 비트 총진료비로 (bit-total)

> 형식: `## TASK-n: 제목` 아래에 `- Phase:`, `- AC:`, `- REQ:`, `- Files:`(수정 범위 — 바뀌는 옛 시험 파일 포함), `- Tests:`, `- TDD: required|exempt`.
> 기준 갈래 `feat-report-sales-total`(운영 `9dd09952`에서). 같은 Phase의 TASK는 파일이 겹치지 않는다(일꾼 2~3명). Phase 1 → 2 → 3 차례. 검토는 마지막 한 번.
> 순서 까닭: TASK-2(하루 매출 규칙, 더하기만 함)를 TASK-5·7·8이 쓴다. TASK-4가 `jobs.ts`·`RevenueSection.test.tsx`·`reportData.ts`를 먼저 바꾸고, TASK-6·5·8이 그 위에서 같은 파일을 고친다. `StatsScreen.test.tsx`는 TASK-5 다음에 TASK-8.

## TASK-1: 시안과 결정 기록
- Phase: 0
- AC: AC-6902.1, AC-6904.1, AC-6905.1, AC-6907.1, AC-6907.2, AC-6908.2, AC-6909.1, AC-6910.2, AC-6911.4, AC-6911.5
- REQ: REQ-6902, REQ-6904, REQ-6905, REQ-6907, REQ-6908, REQ-6909, REQ-6910, REQ-6911
- Files: docs/mockups/bit-total/index.html, docs/mockups/bit-total/notes.md
- Tests: 없음
- TDD: exempt — 클릭 시안(지어낸 숫자, `?s=both|before|after`)과 사용자 결정 기록 문서다. 화면 코드는 시안 승인 뒤에만 만든다.

## TASK-2: 하루 매출 규칙 (dayRevenue · revenueDayValues)
- Phase: 1
- AC: AC-6901.1, AC-6901.2
- REQ: REQ-6901
- Files: src/lib/revenue/summary.ts, src/lib/revenue/summary.test.ts
- Tests: src/lib/revenue/summary.test.ts
- TDD: required — design.md 1절. 함수 둘을 더하기만 한다(sumPeriod는 TASK-5). total만·roughTotal만(0·음수)·둘 다·둘 다 없음·열쇠 없음.

## TASK-3: 원장님별 아래 글 · 수납일지 알림 줄
- Phase: 1
- AC: AC-6907.2, AC-6909.1
- REQ: REQ-6907, REQ-6909
- Files: src/components/stats/sections/DoctorsSection.tsx, src/components/stats/sections/DoctorsSection.test.tsx, src/components/sunap/SunapScreen.tsx, src/components/sunap/SunapScreen.test.tsx
- Tests: src/components/stats/sections/DoctorsSection.test.tsx, src/components/sunap/SunapScreen.test.tsx
- TDD: required — design.md 4절. 글 줄을 지우기만 하는 작은 두 곳이라 한 TASK로 묶었다(서로 파일이 겹치지 않음). 옛 AC-2706.4·AC-4414.4·AC-4905.9 시험을 새 기대로 바꾼다.

## TASK-4: 신환 1명당 매출 = 그 달 신환 (Worker 셈 · 탭 · 보고서 칸)
- Phase: 1
- AC: AC-6911.1, AC-6911.2, AC-6911.3, AC-6911.4, AC-6911.5
- REQ: REQ-6911
- Files: src/lib/analytics/patientValue.ts, src/lib/analytics/patientValue.test.ts, src/types/stats.ts, src/workers/stats/jobs.ts, src/workers/stats/jobs.test.ts, src/components/stats/sections/PatientValueSection.tsx, src/components/stats/sections/PatientValueSection.test.tsx, src/components/stats/sections/RevenueSection.test.tsx, src/components/stats/report/reportData.ts, src/components/stats/report/reportData.test.ts
- Tests: src/lib/analytics/patientValue.test.ts, src/workers/stats/jobs.test.ts, src/components/stats/sections/PatientValueSection.test.tsx, src/components/stats/sections/RevenueSection.test.tsx, src/components/stats/report/reportData.test.ts
- TDD: required — design.md 7절. `value` → `values`로 이름을 바꿔 옛 값을 쓰는 곳을 이 TASK 안에서 다 고친다(RevenueSection.test.tsx는 다섯째 탭 고정값·칸 이름만). 시험: 달 경계(1일·말일·자료 끝 날), 메모리 첫날이 달 중간이면 그 달 없음, 두 달 신환 표시, 같은 달 두 날, 그 달 밖 금액·내원·처방은 빼기, 0명 달, 조합 줄 규칙, Worker 밖으로 환자별 금액 없음.

## TASK-5: 매출 요약 · 매출 칸 — 구분 없이 (셈 · 카드 · 탭)
- Phase: 2
- AC: AC-6904.1, AC-6904.2, AC-6904.3, AC-6904.4, AC-6905.1, AC-6905.2, AC-6905.3, AC-6905.4, AC-6905.5, AC-6906.1, AC-6907.1
- REQ: REQ-6904, REQ-6905, REQ-6906, REQ-6907
- Files: src/lib/revenue/summary.ts, src/lib/revenue/summary.test.ts, src/components/stats/revenueView.ts, src/components/stats/revenueView.test.ts, src/components/stats/sections/RevenueSummary.tsx, src/components/stats/sections/RevenueSummary.test.tsx, src/components/stats/sections/RevenueSection.tsx, src/components/stats/sections/RevenueSection.test.tsx, src/components/stats/sections/StatsSections.tsx, src/components/stats/sections/RoughSwitch.tsx, src/components/stats/sections/RoughSwitch.test.tsx, src/components/stats/sections/PeriodSummary.tsx, src/components/stats/sections/PeriodSummary.test.tsx, src/components/stats/StatsScreen.test.tsx
- Tests: src/lib/revenue/summary.test.ts, src/components/stats/revenueView.test.ts, src/components/stats/sections/RevenueSummary.test.tsx, src/components/stats/sections/RevenueSection.test.tsx, src/components/stats/sections/PeriodSummary.test.tsx, src/components/stats/StatsScreen.test.tsx
- TDD: required — design.md 2절. sumPeriod의 withRough·uncheckedDays를 없애고 dayRevenue로 센다. RoughSwitch.tsx·RoughSwitch.test.tsx는 지운다. 시험: roughTotal 있는 날이 총매출·진료한 날·건당·막대(음수 포함)에 들어감, 금액 모르는 날 = 저장 안 한 날, 칸 둘, 스위치·꼬리표·범례·점선·빗금 없음, 글 문단, 급여·비급여·기타 안내에 그날이 듦, 화면 어디에도 '참고 금액'·'확인 필요한 날'이 없음(매출 칸·매출 요약 범위).

## TASK-6: 원장님 보고 문장 — 비트 총진료비 (Worker 합 · 글 · 칸)
- Phase: 2
- AC: AC-6908.1, AC-6908.2, AC-6908.3, AC-6908.4, AC-6908.5
- REQ: REQ-6908
- Files: src/workers/stats/jobs.ts, src/workers/stats/jobs.test.ts, src/types/clinicReport.ts, src/lib/clinicReport/reportText.ts, src/lib/clinicReport/reportText.test.ts, src/components/stats/sections/ReportSection.tsx, src/components/stats/sections/ReportSection.test.tsx
- Tests: src/workers/stats/jobs.test.ts, src/lib/clinicReport/reportText.test.ts, src/components/stats/sections/ReportSection.test.tsx
- TDD: required — design.md 5절. 골든 파일(fixtures/stats/golden)은 고치지 않고 확인 필요 사례 셋만 원본 비교에서 빼 새 글로 본다. 시험: 일일·이번 달(불러온 끝까지)·지난달(다 덮음/못 덮음)·v2 답·확인된 벌, 금액 줄 '–'·음수 bitTotal·총환 0명, 안내 두 글·도우미 안내 바꾸기, 날짜 줄·노란 줄 없음, 글에 '확인 필요' 없음.

## TASK-7: 업무일지 — 총진료비 칸 채우기
- Phase: 2
- AC: AC-6910.1, AC-6910.2
- REQ: REQ-6910
- Files: src/lib/worklog/bitFill.ts, src/lib/worklog/bitFill.test.ts, src/components/worklog/BitNotice.tsx, src/components/worklog/BitNotice.test.tsx, src/components/worklog/useBitFill.test.tsx, src/components/worklog/WorklogScreen.test.tsx
- Tests: src/lib/worklog/bitFill.test.ts, src/components/worklog/BitNotice.test.tsx, src/components/worklog/useBitFill.test.tsx, src/components/worklog/WorklogScreen.test.tsx
- TDD: required — design.md 6절. useBitFill.ts는 바꾸지 않는다(bitValuesFrom의 unconfirmed로 상태가 정해진다). 옛 AC-014.2·AC-017.4 시험(roughTotal 없는 날)은 새 안내 글로만 바뀐다.

## TASK-8: 이번 달 목표 · 월간 보고서 매출 (셈 · 원 단위)
- Phase: 3
- AC: AC-6901.3, AC-6902.1, AC-6902.2, AC-6902.3, AC-6902.4, AC-6903.1, AC-6906.2
- REQ: REQ-6901, REQ-6902, REQ-6903, REQ-6906
- Files: src/components/stats/useStatsGoals.ts, src/components/stats/useStatsGoals.test.ts, src/components/stats/report/reportData.ts, src/components/stats/report/reportData.test.ts, src/components/stats/report/useReportReads.ts, src/components/stats/sections/ReportSection.test.tsx, src/components/stats/StatsScreen.test.tsx
- Tests: src/components/stats/useStatsGoals.test.ts, src/components/stats/report/reportData.test.ts, src/components/stats/sections/ReportSection.test.tsx, src/components/stats/StatsScreen.test.tsx
- TDD: required — design.md 3절. 시험: roughTotal 있는 날이 목표 지금까지·보고서 매출에 듦, 금액 모르는 날은 빠짐, 보고서 매출 세 곳 원 단위(`3,000,000원`·`110,000,000원` 꼴), 신환 1명당 칸은 만 원 그대로. StatsScreen.test.tsx는 보고서 종이 '한 달 요약' 매출(`paperSales`) 기대만 바꾼다(목표 칸 '매출600만 원 / …'은 그대로). ReportSection.test.tsx의 시험 도우미 `salesDay`에 roughTotal을 받게 한다.
