# 작업 분할: 통계 기간 고르기 (일별·주별·월별 + 달·해 고르기 + 직접 날짜, 바로 전·작년 비교)

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
>
> **할 순서**: Phase 1(TASK-1 → TASK-2) → Phase 2(TASK-3 · TASK-5 · TASK-9 병렬) → Phase 3(TASK-4 · TASK-6 · TASK-7 병렬) → Phase 4(TASK-8). 같은 Phase끼리 파일이 겹치지 않는다.
> 검토는 끝에 한 번. 전체 검사(`tsc`·lint·vitest)와 390·1440px 화면 사진은 Phase 4 끝에 한다(TASK-1부터 `StatsRange.period`가 넓어져 그 전에는 `tsc`가 깨질 수 있다).
> 시험 자료는 모두 지어낸 값이고 실제 환자 파일을 열지 않는다.

## TASK-1: 기간 모양 넓히기 (빠른 단추 값은 그대로)
- REQ: REQ-1701, REQ-1708
- AC: AC-1701.5
- Files: src/components/stats/view.ts, src/components/stats/view.test.ts
- Tests: src/components/stats/view.test.ts
- TDD: required — `StatsRange`에 `name`·`bucket`·`lastYear`, `previous`를 `CompareRange`(name·why)로, `period`를 `StatsPeriod | null`로, `SummaryCell.key`에 `'lastYear'`를 더한다. `PERIOD_NAME`을 이 파일에 둔다. 지금 `statsRange` 시험은 기대값을 바꾸지 않는다

## TASK-2: 고른 기간 셈 (순수 모듈)
- REQ: REQ-1701, REQ-1702, REQ-1707
- AC: AC-1701.1~AC-1701.4, AC-1702.1~AC-1702.3, AC-1707.2, AC-1707.3
- Files: src/components/stats/periodPick.ts, src/components/stats/periodPick.test.ts
- Tests: src/components/stats/periodPick.test.ts
- TDD: required — `pickRange`·`lastDayOf`·`defaultPick`·`stepPick`·`checkCustom`·`pickReportText`. view.ts에서는 타입만 불러온다. 날짜는 `lib/analytics/dates.ts`·`comparisonRange`만 쓴다

## TASK-3: 화면 숫자에 고른 기간 잇기
- REQ: REQ-1701, REQ-1704, REQ-1705
- AC: AC-1701.5(`rangeOf`), AC-1704.1~AC-1704.3, AC-1704.5, AC-1705.1, AC-1705.4(그래프 칸·같은 처방 재방문)
- Files: src/components/stats/view.ts, src/components/stats/view.test.ts, src/components/stats/rxPickView.ts, src/components/stats/rxPickView.test.ts, src/components/stats/treatmentView.ts, src/components/stats/treatmentView.test.ts, src/components/stats/againView.ts, src/components/stats/againView.test.ts
- Tests: src/components/stats/view.test.ts, src/components/stats/rxPickView.test.ts, src/components/stats/treatmentView.test.ts, src/components/stats/againView.test.ts
- TDD: required — `rangeOf`·`readSpan`·`periodDesc`, `period === null` 갈래(`summaryCells`·`patientTrend`·처방 행 `lastYear`·`rxComparedCells`·`rxDetail` 칸), `rxPickTotal`·`rxPickCopyText` 비교마다, `treatmentRows`·`groupInput` 비교마다 세었는지, `againSpan`·`againBaseText` 고른 기간 규칙(AC-1705.4). 빠른 단추 갈래 기대값은 그대로. `useAgainDays.ts`는 바꾸지 않는다(고른 기간은 더 읽기가 없다)

## TASK-4: 저장된 숫자 읽기
- REQ: REQ-1706
- AC: AC-1706.1~AC-1706.3(덮은 기간 자르기 포함)
- Files: src/components/stats/useStatsData.ts, src/components/stats/useStatsData.test.ts
- Tests: src/components/stats/useStatsData.test.ts
- TDD: required — 인자를 `StatsChoice`로(빠른 단추 글자는 지금 부르는 모양 그대로 된다), `todayDone` 내보내기. `lib/storage/stats.ts`는 바꾸지 않는다

## TASK-5: 기간 고르기 부품
- REQ: REQ-1702, REQ-1703
- AC: AC-1702.1(▶ disabled), AC-1702.2·AC-1702.3(판 글), AC-1703.2, AC-1703.3, AC-1703.5, AC-1703.7
- Files: src/components/stats/PeriodPicker.tsx, src/components/stats/PeriodPicker.test.tsx
- Tests: src/components/stats/PeriodPicker.test.tsx
- TDD: required — props만 받는다(`choice`·`lastDay`·`onChoose`). 단추 모양 글(`PERIOD_GROUP`·`PERIOD_BUTTON`·`PERIOD_ON`·`PERIOD_OFF`)은 StatsScreen.tsx에서 이 파일로 옮겨 내보낸다(이 TASK는 복사해 두고, TASK-8이 StatsScreen.tsx의 것을 지우고 여기서 불러온다). 날짜 칸은 `ds.input`이다

## TASK-6: 위쪽 섹션과 보고 문장
- REQ: REQ-1704, REQ-1707
- AC: AC-1704.1(칸 그리기), AC-1704.2(설명), AC-1704.3(막대 안내 글·[자세히] 표의 '–'), AC-1704.4, AC-1704.5, AC-1707.1, AC-1707.3([복사]), AC-1707.4
- Files: src/components/stats/sections/parts.tsx, src/components/stats/sections/PeriodSummary.tsx, src/components/stats/sections/PeriodSummary.test.tsx, src/components/stats/sections/PatientTrendSection.tsx, src/components/stats/sections/PatientTrendSection.test.tsx, src/components/stats/sections/RevisitSection.tsx, src/components/stats/sections/RevisitSection.test.tsx, src/components/stats/sections/WeekdaySection.tsx, src/components/stats/sections/WeekdaySection.test.tsx, src/components/stats/sections/RxSplitSection.tsx, src/components/stats/sections/RxSplitSection.test.tsx, src/components/stats/sections/ReportSection.tsx, src/components/stats/sections/ReportSection.test.tsx
- Tests: src/components/stats/sections/PeriodSummary.test.tsx, src/components/stats/sections/PatientTrendSection.test.tsx, src/components/stats/sections/RevisitSection.test.tsx, src/components/stats/sections/WeekdaySection.test.tsx, src/components/stats/sections/RxSplitSection.test.tsx, src/components/stats/sections/ReportSection.test.tsx
- TDD: required — 기간 요약 비교 칸 1~2개(PC 한 줄, 휴대폰은 셋 한 줄 + 비교 칸마다 한 줄), 막대 칸 글('주'·'달'), 설명은 `periodDesc`. 보고 문장은 `pick` prop(null = 빠른 단추, 지금과 같음). `parts.tsx`는 `PERIOD_NAME`을 view.ts에서 다시 내보낸다

## TASK-7: 처방 표 두 개의 비교 칸
- REQ: REQ-1704, REQ-1705, REQ-1708
- AC: AC-1704.4(두 칸 설명), AC-1705.2~AC-1705.5, AC-1708.1(trendLabels 인자)
- Files: src/components/stats/sections/trendLabels.ts, src/components/stats/sections/trendLabels.test.ts, src/components/stats/sections/TreatmentTrendSection.tsx, src/components/stats/sections/TreatmentTrendSection.test.tsx, src/components/stats/sections/TreatmentTable.tsx, src/components/stats/sections/TreatmentTable.test.tsx, src/components/stats/sections/TreatmentDetail.tsx, src/components/stats/sections/TreatmentDetail.test.tsx, src/components/stats/sections/RxPickerSection.tsx, src/components/stats/sections/RxPickerSection.test.tsx, src/components/stats/sections/RxPickTable.tsx, src/components/stats/sections/RxPickTable.test.tsx, src/components/stats/sections/RxPickDetail.tsx, src/components/stats/sections/RxPickDetail.test.tsx, src/components/stats/sections/RxPickAgain.tsx, src/components/stats/sections/RxPickAgain.test.tsx
- Tests: src/components/stats/sections/trendLabels.test.ts, src/components/stats/sections/TreatmentTrendSection.test.tsx, src/components/stats/sections/TreatmentTable.test.tsx, src/components/stats/sections/TreatmentDetail.test.tsx, src/components/stats/sections/RxPickerSection.test.tsx, src/components/stats/sections/RxPickTable.test.tsx, src/components/stats/sections/RxPickDetail.test.tsx, src/components/stats/sections/RxPickAgain.test.tsx
- TDD: required — `trendLabels`는 기간 대신 `range.bucket`/`grain`을 받는다(시험은 부르는 인자만 바꾼다). 비교 이름은 `range.previous.name`·`range.lastYear.name`, 빠른 단추의 열 이름은 지금 `COLUMN_NAME` 그대로

## TASK-8: 통계 화면에 잇기
- REQ: REQ-1703, REQ-1706, REQ-1707, REQ-1708
- AC: AC-1703.1, AC-1703.4, AC-1703.6, AC-1706.4, AC-1707.1(잇기), AC-1708.1
- Files: src/components/stats/StatsScreen.tsx, src/components/stats/StatsScreen.test.tsx, src/components/stats/sections/StatsSections.tsx
- Tests: src/components/stats/StatsScreen.test.tsx
- TDD: required — 상태 `StatsChoice`(처음 '30d'), `range = rangeOf(today, choice, data.todayDone)`, 빠른 단추 옆에 `PeriodPicker`, 단추 모양 글은 `PeriodPicker.tsx`에서 불러오고 이 파일의 것은 지운다, 기간 글에 비교 둘, 불러오기는 `range.load`. `StatsSections`가 `pickReportText(range, summaryCells(input), 처방별 추세 1·2위)`를 보고 칸에, `name`을 처방별 신환·재진에 넘긴다. 보고 칸은 고르기에 들어오고 나갈 때 다시 그린다(key)

## TASK-9: 막대 그림의 빈 칸 ('–'·앞으로 올 달)
- REQ: REQ-1704
- AC: AC-1704.3(그리기)
- Files: src/components/charts/StackedBarChart.tsx, src/components/charts/StackedBarChart.test.tsx
- Tests: src/components/charts/StackedBarChart.test.tsx
- TDD: required — `BarBucket.blank?: 'no-data' | 'future'`. no-data는 막대·합계 자리에 '–'(화면 읽기 표 '–'), future는 글자만 있는 빈 칸(화면 읽기 표에 없음), 눈금은 진짜 칸만으로 잡는다. `blank`가 없으면 마크업이 지금과 같다(지금 시험 기대값 그대로, 대시보드·미리보기 그대로). Phase 2에서 TASK-3·TASK-5와 병렬, TASK-6보다 먼저
