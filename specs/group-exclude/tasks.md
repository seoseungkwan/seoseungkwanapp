# 작업 분할: 처방별 추세 묶음 빼는 처방·조건·총환자 대비

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
>
> **할 순서**: Phase 0 → 1 → 2 → 3 → 4. 같은 Phase의 TASK는 **병렬**이다(수정 파일이 겹치지 않고 앞 Phase의 결과만 쓴다). TASK마다 일꾼(subagent) 하나다(Phase 0은 메인 세션).
>
> | Phase | TASK | 하는 일 |
> |---|---|---|
> | 0 타입 | TASK-1 | 묶음 모양·정의 타입(선택 칸) |
> | 1 밑바탕 | TASK-2 | DB 칸 둘·칸 검사·저장 함수(새 migration) |
> | | TASK-3 | 그래프 부품: 막대 위 추세선, 꺾은선, 범례 표시 |
> | | TASK-4 | 불러올 때 세기(빼는 처방·조건), 정의 복사 함수 |
> | | TASK-5 | 열쇠·정의·줄 판단 |
> | | TASK-6 | 총환자·칸 총환자·추세선 숫자와 글(순수 함수) |
> | 2 조각 | TASK-7 | 묶음 읽기·저장 코드 |
> | | TASK-8 | 묶음 고치기 규칙(순수 함수) |
> | | TASK-9 | 통계 불러오기 길에 빼는 처방·조건 싣기 |
> | | TASK-10 | 대시보드 '처방 상위' 열쇠·비트 바로 읽기 |
> | | TASK-11 | AI 리포트 묶음 이름 읽기 |
> | | TASK-12 | 묶음 훅 |
> | | TASK-15 | 개인정보 E2E |
> | 3 화면 | TASK-13 | 보기 화면: 줄 표·열린 칸·칸 잇기 |
> | | TASK-14 | 고치기 화면 |
> | 4 마무리 | TASK-16 | 화면 확인(390·1440)과 전체 검사 |
>
> - 타입 검사: `StatsRxGroup`의 `out`·`cond`와 `RxGroupDef`의 `out`·`cond`는 선택 칸이고(Phase 0에서 먼저 넣음), 고치기 함수·`forSave`·`copyGroupDef`는 빈 칸을 새로 만들지 않는다. 그래서 빼는 처방·조건이 없는 묶음은 모든 곳에서 지금 모양 그대로이고, Phase 끝마다 고치지 않은 화면·시험이 그대로 지난다. 화면 prop은 더하지 않거나(표) 선택 prop으로 더한다(열린 칸)
> - 시험 파일 몫: 보기 화면이 바꾸는 글을 못 박은 `TreatmentTrendSection.test.tsx`·`PeriodSummary.test.tsx`·`StatsScreen.test.tsx`는 TASK-13, 고치기 화면이 바꾸는 글(안내·[빼기])을 못 박은 `TreatmentTrendSection.test.tsx` 줄은 TASK-14가 고친다. 둘은 같은 Phase 병렬이라 `TreatmentTrendSection.tsx`·`.test.tsx`의 서로 다른 줄을 고치고, 합칠 때 겹친 곳은 메인 세션이 맞춘다
> - 각 Phase 끝(TASK가 아님, 메인 세션): `python3 ~/.claude/harness/bin/verify`. 이 PC에서 다른 일이 없을 때 돌린다. 화면 사진은 TASK-16에서 한 번만 보인다. 독립 검토(harness-reviewer)는 사용자 결정(2026-11-12 "검토는 마지막 한번만")대로 모두 합친 뒤 한 번만 한다
> - 사용자 단계(사이트에 올리기 전): TASK-2의 SQL을 운영 Supabase에 붙여 넣기. 올린 뒤 기본 PT 묶음 만들기 → 보고 싶은 기간 다시 불러오기. TASK-15를 실제로 돌리는 일은 SQL·시험 계정을 기다린다
> - 승인 시안: `docs/mockups/group-exclude/index.html`. 시안과 다른 곳은 `design.md` '시안과 다른 곳'을 따른다. 시험 자료는 모두 지어낸 값이고 실제 환자 파일·`.claude/uploads`를 열지 않는다
> - 모든 화면 TASK: 클래스는 `classes.test.ts` 규칙(간격 단계, 토큰 색, 폭 접두사 md·lg·max-md·max-lg)을 지킨다. 반복 모양은 `ds`에서 가져온다. 상자 안 상자 금지(`nestedBoxes`)

## Phase 0 — 타입 (메인 세션)

## TASK-1: 묶음 모양·정의 타입
- Phase: 0 · 혼자
- AC: AC-3702.1(타입 선언. 동작 시험은 TASK-5의 `groupOut`·`groupCond`)
- REQ: REQ-3702
- Files: src/types/rxGroups.ts, src/types/analysis.ts
- Tests: (없음 — 타입 검사 `npx tsc --noEmit -p .`)
- TDD: exempt — 타입 선언만 더한다(`RxCond`·`StatsRxGroup`, `RxGroupDef`의 선택 칸 `out`·`cond`). 실행되는 코드가 없어 RED 시험을 쓸 수 없다. 선택 칸이라 지금 코드·시험이 그대로 타입 검사를 지나는지 `npx tsc --noEmit -p .`로 본다. Phase 1이 모두 이 타입을 쓰므로 먼저 한다

## Phase 1 — 밑바탕 (다섯 병렬)

## TASK-2: DB 칸 둘·칸 검사·저장 함수
- Phase: 1 · 병렬
- AC: AC-3701.1~AC-3701.8
- REQ: REQ-3701
- Files: supabase/migrations/20261112000000_stats_rx_groups_exclude.sql, supabase/statsRxGroupsExclude.rls.test.ts, docs/ARCHITECTURE.md
- Tests: supabase/statsRxGroupsExclude.rls.test.ts
- TDD: required — `statsRxGroups.rls.test.ts`와 같은 PGlite 흉내(Supabase 역할·auth·기본 권한)를 새 시험 파일에 두고, auth·stats·stats_rx_groups migration 뒤에 새 파일을 붙인다. 새 파일이 없을 때 시험마다 실패하는 것(RED)을 본다. 칸 검사 실패는 오류 번호 `23514`(CHECK), 저장 함수 열쇠 모양 실패는 `bad groups`, 열쇠 없는 고친 줄은 지금 값이 남는지를 본다. 옛 줄(칸 없이 넣은 줄)이 빈 값으로 읽히는 것은 새 migration 앞에 줄을 넣고 붙여서 본다. AC-3701.8: `docs/ARCHITECTURE.md`의 `stats_rx_groups` 줄은 지금 시험(`statsRxGroups.rls.test.ts:1172-1179`, 고치지 않음)이 요구하는 글자 `` `id`·`hospital_id`·`name`·`codes`·`sort_order`·`updated_at` ``·`` `save_stats_rx_groups`로 목록 통째 ``·`처방 하나는 한 묶음에만`과 줄 끝 `(specs/treatment-trend) |`를 그대로 두고, 그 사이(줄 끝 괄호 앞)에 빼는 처방 `out_codes`·조건 `cond` 문장과 `specs/group-exclude`를 넣는다. 새 시험이 그 글자를 본다

## TASK-3: 그래프 부품 — 막대 위 추세선, 꺾은선, 범례 표시
- Phase: 1 · 병렬
- AC: AC-3709.3(막대 위 점선), AC-3709.4(꺾은선 그림), AC-3709.8
- REQ: REQ-3709
- Files: src/components/charts/StackedBarChart.tsx, src/components/charts/StackedBarChart.test.tsx, src/components/charts/RateLineChart.tsx, src/components/charts/RateLineChart.test.tsx, src/components/charts/ChartLegend.tsx, src/components/charts/ChartLegend.test.tsx
- Tests: src/components/charts/StackedBarChart.test.tsx, src/components/charts/RateLineChart.test.tsx, src/components/charts/ChartLegend.test.tsx
- TDD: required — `StackedBarChart`의 `trend`를 주지 않으면 지금 그림 그대로(지금 시험 그대로 통과), 주면 그림 칸 안 svg 선 하나(x = at + 0.5, y = 100 − 값 ÷ 눈금 최대 × 100, 점선·`stroke-ink`·`vector-effect`)를 본다. `RateLineChart`는 값 있는 점만 잇는 선, 값 없는 칸은 점이 없음, 13칸 넘으면(`dense`) 점 위 글 없음, sr-only 표 칸 `기간 | 총환자 대비 | 상태`, 그림 `aria-hidden`을 본다. 범례 `trend`·`line` 표시를 본다. 색은 토큰 클래스로만

## TASK-4: 불러올 때 세기 — 빼는 처방·조건
- Phase: 1 · 병렬
- AC: AC-3703.1~AC-3703.10, AC-3705.1(복사 함수), AC-3705.3, AC-3713.3
- REQ: REQ-3703, REQ-3705, REQ-3713
- Files: src/lib/analytics/aggregate.ts, src/lib/analytics/aggregate.test.ts, src/lib/analytics/groupDef.ts, src/lib/analytics/groupDef.test.ts
- Tests: src/lib/analytics/aggregate.test.ts, src/lib/analytics/groupDef.test.ts
- TDD: required — 셈은 design.md '셈 규칙'대로 "모은 뒤 판단"으로 바꾼다. 먼저 AC-3703.1~6·8·9 시험(지어낸 환자·코드)을 더해 RED를 본다. AC-3703.7은 지금 묶음 시험(stats-core AC-006.3, treatment-trend AC-1205.2)이 고치지 않고 그대로 통과함으로 본다. AC-3703.10은 지금 10만 줄 시험과 같은 재기에 묶음 50개(그중 10개는 빼는 처방·조건)를 준다. `copyGroupDef`: 빈 `out`·`cond`는 싣지 않음(지금 `{ id, codes }` 모양 그대로), 있으면 새 배열, `cond` 항목은 `{ code, unless }`만. AC-3713.3은 `npm run lint`·`src/guardrails.test.ts`가 그대로 통과함으로 본다

## TASK-5: 열쇠·정의·줄 판단
- Phase: 1 · 병렬
- AC: AC-3702.1(`groupOut`·`groupCond`), AC-3704.1~AC-3704.6
- REQ: REQ-3702, REQ-3704
- Files: src/components/stats/treatmentView.ts, src/components/stats/treatmentView.test.ts
- Tests: src/components/stats/treatmentView.test.ts
- TDD: required — `groupOut`·`groupCond`·`keptCond`(design.md '열쇠'의 규칙)·`groupKey(codes, extra?)`·`groupDefs`·`treatmentRows`(열쇠에 빼는 처방·조건)를 고친다. 먼저 AC-3704.1(지금 고정 값 그대로)·AC-3704.2~5 시험을 더해 RED를 본다. 고정 값 둘(빼는 처방 하나 든 묶음, 조건 하나 든 묶음)은 design.md '열쇠' 글자 규칙으로 손으로 만든 글자에 같은 FNV를 돌려 정한 값을 적는다. 지금 treatment-trend 시험은 그대로 통과해야 한다

## TASK-6: 총환자·칸 총환자·추세선 숫자와 글
- Phase: 1 · 병렬
- AC: AC-3706.1~AC-3706.3, AC-3707.1~AC-3707.4, AC-3709.2(합계 이름·하루 평균 글)
- REQ: REQ-3706, REQ-3707, REQ-3709
- Files: src/components/stats/treatmentChart.ts, src/components/stats/treatmentChart.test.ts, src/components/charts/format.ts, src/components/charts/format.test.ts
- Tests: src/components/stats/treatmentChart.test.ts, src/components/charts/format.test.ts
- TDD: required — 순수 함수(`periodPatients`·`chartCells`·`trendFit`·`trendText`·`sumLabel`·`perDayText`)를 가짜 일 줄로 시험한다. `format.ts`는 `truncatedOne`을 내보내기만 한다(동작 그대로). 추세선 시험: 총환자 0 칸·일부 기간 칸을 뺌, 칸 둘 미만이면 null, 기울기 글의 정수(버림·쉼표)·소수·`0.0`·평균 0.5% 경계, 하루에·한 주에·한 달에. `chartCells`는 지금 `treatmentDetail` 점에 칸 총환자·비교(`comparisonAt`)를 붙이므로 `treatmentView`·`trendLabels`의 지금 함수만 부른다

## Phase 2 — 조각 (일곱 병렬)

## TASK-7: 묶음 읽기·저장 코드
- Phase: 2 · 병렬
- AC: AC-3702.2, AC-3702.3
- REQ: REQ-3702
- Files: src/lib/storage/statsRxGroups.ts, src/lib/storage/statsRxGroups.test.ts
- Tests: src/lib/storage/statsRxGroups.test.ts
- TDD: required — 먼저 지금 시험의 select 글자·보내는 항목 기대를 새 칸으로 고치고(treatment-trend AC-1203의 그 글자를 AC-3702.2·3이 대신한다) null 칸 → 빈 배열 시험을 더해 RED를 본다. 보내는 항목은 늘 여섯 칸이고(`out_codes`는 `groupOut`, `cond`는 `groupCond`), `cond` 항목은 `{ code, unless }`만 새로 만든다

## TASK-8: 묶음 고치기 규칙
- Phase: 2 · 병렬
- AC: AC-3710.1~AC-3710.11
- REQ: REQ-3710
- Files: src/components/stats/treatmentEdit.ts, src/components/stats/treatmentEdit.test.ts
- Tests: src/components/stats/treatmentEdit.test.ts
- TDD: required — `pickOut`·`pickOutGroup`·`removeOut`·`addCond`·`removeCond`·`outNote`를 더하고 `removeCode`·`pickCode`·`forSave`·`savedNote`를 고친다. 묶음은 `StatsRxGroup`이고 칸은 `groupOut`·`groupCond`로 읽는다. 빈 `out`·`cond`를 새로 만들지 않아 빼는 처방·조건이 없는 묶음의 지금 시험 기대(`forSave`·`addBlankGroup` 모양)가 그대로다. `savedNote`는 `groupKey(codes, { out, cond })`가 달라졌는지로 본다. 먼저 새 AC 시험을 더해 RED를 본다

## TASK-9: 통계 불러오기 길에 빼는 처방·조건 싣기
- Phase: 2 · 병렬
- AC: AC-3705.1, AC-3705.2, AC-3705.4
- REQ: REQ-3705
- Files: src/workers/statsClient.ts, src/workers/statsClient.test.ts, src/workers/runAnalysis.ts, src/workers/runAnalysis.test.ts, src/components/stats/SourcePicker.tsx, src/components/stats/SourcePicker.test.tsx, src/workers/stats/jobs.test.ts
- Tests: src/workers/statsClient.test.ts, src/workers/runAnalysis.test.ts, src/components/stats/SourcePicker.test.tsx, src/workers/stats/jobs.test.ts
- TDD: required — 세 곳의 `({ id, codes }) => ({ id, codes: [...codes] })`를 `copyGroupDef`(TASK-4)로 바꾼다. 먼저 빼는 처방·조건 든 정의를 넘겨 메시지에 `out`·`cond`가 실리는지(RED), 없는 정의는 지금 모양 그대로인지 시험한다. AC-3705.4는 `jobs.test.ts`에 시험만 더한다: `createStatsHost(...).load({ …, groups })`를 거쳐 `loaded` 답 `view.days[].groups`의 빼는 처방 묶음 숫자가 셈 규칙대로이고 0줄이 채워지는지 본다(`jobs.ts`는 고치지 않는다)

## TASK-10: 대시보드 '처방 상위' 열쇠·비트 바로 읽기
- Phase: 2 · 병렬
- AC: AC-3705.5
- REQ: REQ-3705
- Files: src/components/dashboard/live/rxGroups.ts, src/components/dashboard/live/rxGroups.test.ts, src/components/dashboard/live/readBitDays.ts, src/components/dashboard/live/readBitDays.test.ts
- Tests: src/components/dashboard/live/rxGroups.test.ts, src/components/dashboard/live/readBitDays.test.ts
- TDD: required — 먼저 빼는 처방·조건 든 묶음의 줄 열쇠가 `groupKey(codes, { out, cond })`이고 `defs`의 같은 항목 `id`와 같은지, `readBitDays`의 Worker 메시지에 `out`·`cond`가 실리는지 시험을 더해 RED를 본다. 그다음 `toDashboardGroups`의 열쇠와 `readBitDays.ts:63`의 복사를 `copyGroupDef`로 바꾼다. 빼는 처방·조건이 없는 묶음은 지금 열쇠·메시지 그대로다(지금 시험 그대로 통과)

## TASK-11: AI 리포트 묶음 이름 읽기
- Phase: 2 · 병렬
- AC: AC-3702.4
- REQ: REQ-3702
- Files: src/app/api/ai/store.ts, src/app/api/ai/store.test.ts
- Tests: src/app/api/ai/store.test.ts
- TDD: required — 먼저 `store.test.ts:583`~`:586`의 select 글자 기대를 `'name, codes, out_codes, cond, sort_order'`로 고치고(ai-report-stats AC-2002.1의 그 글자를 AC-3702.4가 대신한다) 빼는 처방·조건 든 줄의 이름이 `groupKey(codes, { out, cond })`에 붙는지, 모양이 다른 `out_codes`·`cond`가 `GROUPS_SHAPE_FAILED`인지 시험을 더해 RED를 본다. 두 칸이 null인 줄은 빈 것으로 본다

## TASK-12: 묶음 훅
- Phase: 2 · 병렬
- AC: AC-3712.1, AC-3712.3
- REQ: REQ-3712
- Files: src/components/stats/useStatsRxGroups.ts, src/components/stats/useStatsRxGroups.test.ts
- Tests: src/components/stats/useStatsRxGroups.test.ts
- TDD: required — 묶음 타입을 `StatsRxGroup`으로 바꾼다. 먼저 저장된 묶음에 빼는 처방·조건이 있을 때 `groups`·`forLoad` 정의·`save`로 넘기는 값에 그대로 있는지 시험을 더해 RED를 본다(가짜 저장 코드). 기대 정의는 `groupDefs(그 묶음)`(TASK-5)과 견준다. 브라우저 저장소를 쓰지 않음은 지금 시험 그대로다

## TASK-15: 개인정보 E2E
- Phase: 2 · 병렬
- AC: AC-3713.1, AC-3713.2
- REQ: REQ-3713
- Files: e2e/treatment-trend-privacy.spec.ts
- Tests: e2e/treatment-trend-privacy.spec.ts
- TDD: exempt — 시험만 고친다. 대상 코드는 TASK-2·7·9·13·14의 단위 시험이 맡으므로 이 TASK에는 구현할 것이 없어 RED 단계가 없다. `GROUP_BODY_KEYS`를 `['codes', 'cond', 'id', 'name', 'out_codes', 'sort_order']`로, `cond` 항목 열쇠 검사를 더하고, 시험 묶음 하나에 빼는 처방을 넣어 그날 줄에 그 열쇠가 있는지 본다(기대 열쇠는 `groupKey(codes, { out, cond })`). 시험이 헛돌지 않는지는 기대값 하나를 일부러 틀려 실패를 본 뒤 되돌려 확인한다. 기다림: 사용자가 TASK-2 SQL을 실제 Supabase에 붙임 + 시험 계정(`.env.local`). 그 전에는 파일만 쓰고 타입 검사까지 한다

## Phase 3 — 화면 (둘 병렬, Phase 2 뒤)

## TASK-13: 줄 표·열린 칸·칸 잇기
- Phase: 3 · 병렬
- AC: AC-3708.1~AC-3708.7, AC-3709.1~AC-3709.8, AC-3712.2(그래프 모양 넘기기), AC-3712.3
- REQ: REQ-3708, REQ-3709, REQ-3712
- Files: src/components/stats/sections/TreatmentTable.tsx, src/components/stats/sections/TreatmentTable.test.tsx, src/components/stats/sections/TreatmentDetail.tsx, src/components/stats/sections/TreatmentDetail.test.tsx, src/components/stats/sections/TreatmentTrendSection.tsx, src/components/stats/sections/TreatmentTrendSection.test.tsx, src/components/stats/sections/PeriodSummary.test.tsx, src/components/stats/StatsScreen.test.tsx
- Tests: src/components/stats/sections/TreatmentTable.test.tsx, src/components/stats/sections/TreatmentDetail.test.tsx, src/components/stats/sections/TreatmentTrendSection.test.tsx, src/components/stats/sections/PeriodSummary.test.tsx, src/components/stats/StatsScreen.test.tsx
- TDD: required — 숫자는 TASK-6 함수, 그림은 TASK-3 부품을 쓴다. 표는 prop을 더하지 않고 `input`으로 총환자를 센다. 열린 칸의 `mode`·`onMode`는 선택 prop이고 칸(`TreatmentTrendSection`)이 줄 열쇠마다 든다. 먼저 총환자 줄·머리 칸·줄 칸·좁은 화면 이름표·조건 `*`·조건 줄·`빼는 처방` 줄(표), 제목·단추(`aria-pressed`)·요약·범례·추세 글·안내·표 칸 일곱(열린 칸), 설명·아래 안내 네 글·모양 기억·저장소 없음(칸) 시험을 더하고, 지금 기대(treatment-trend AC-1201.1 설명, AC-1207.8 안내, AC-1209 표 칸)를 고쳐 RED를 본다. `PeriodSummary.test.tsx`(:121 설명 글자 등)·`StatsScreen.test.tsx`는 이 TASK가 바꾸는 글·칸을 못 박은 줄만 고친다. 그 밖에 바뀌는 기대값이 나오면 멈추고 보고한다

## TASK-14: 묶음 고치기 화면
- Phase: 3 · 병렬
- AC: AC-3711.1~AC-3711.14, AC-3712.2(찾기 목록 줄)
- REQ: REQ-3711, REQ-3712
- Files: src/components/stats/sections/TreatmentGroupEditor.tsx, src/components/stats/sections/TreatmentGroupEditor.test.tsx, src/components/stats/sections/TreatmentTrendSection.tsx, src/components/stats/sections/TreatmentTrendSection.test.tsx
- Tests: src/components/stats/sections/TreatmentGroupEditor.test.tsx, src/components/stats/sections/TreatmentTrendSection.test.tsx
- TDD: required — 고치기 규칙은 TASK-8 함수만 쓴다. 먼저 안내 글·두 칸 제목·[지우기]·[조건 더하기]·조건 칸·조건 찾기(이 처방·조건에 있음)·빼는 처방 찾기(묶음째 고르기·네 가지 표시)·넣는 처방 찾기의 `빼는 처방에 있음`·아래 안내·초점(AC-3711.11·12)·휴대폰 단추 높이 시험을 더하고, 지금 `빼기` 글자와 안내 글 기대(`TreatmentGroupEditor.test.tsx`, `TreatmentTrendSection.test.tsx`의 INTRO·[빼기] 줄)를 고쳐 RED를 본다(treatment-trend AC-1210의 그 글자를 AC-3711.1·3·10이 대신한다). `TreatmentTrendSection.tsx`는 고치기 찾기 목록 줄(지금 묶음 넣는 처방만 더함)에 빼는 처방·조건 처방을 더하는 곳만 고친다. 찾기 칸은 하나만 열린다. 고치기 화면 props 이름은 그대로다

## Phase 4 — 마무리 (혼자, Phase 3 뒤)

## TASK-16: 화면 확인(390·1440)과 전체 검사
- Phase: 4 · 혼자
- AC: AC-3714.1, AC-3714.2
- REQ: REQ-3714
- Files: src/components/stats/sections/TreatmentTrendSection.tsx, src/components/stats/sections/TreatmentTrendSection.test.tsx, src/components/stats/sections/TreatmentTable.tsx, src/components/stats/sections/TreatmentTable.test.tsx, src/components/stats/sections/TreatmentDetail.tsx, src/components/stats/sections/TreatmentDetail.test.tsx, src/components/stats/sections/TreatmentGroupEditor.tsx, src/components/stats/sections/TreatmentGroupEditor.test.tsx, src/components/charts/RateLineChart.tsx, src/components/charts/RateLineChart.test.tsx
- Tests: src/components/stats/sections/TreatmentTrendSection.test.tsx, src/components/stats/sections/TreatmentTable.test.tsx, src/components/stats/sections/TreatmentDetail.test.tsx, src/components/stats/sections/TreatmentGroupEditor.test.tsx, src/components/charts/RateLineChart.test.tsx
- TDD: required — 찍는 법은 treatment-trend TASK-17과 같다(scratchpad의 Node 가짜 Supabase에 지어낸 `stats_days`·`stats_coverage`·`stats_rx_groups` 줄, `npm run dev`, 세션은 찍기 스크립트가 쿠키로 넣음, 앱 코드에 우회 길 없음, 토큰 값을 남기지 않음). 390×844·1440×900에서 AC-3714.1의 넷을 찍고 `scrollWidth ≤ clientWidth`를 잰 뒤 시안과 나란히 본다. 다른 점을 고칠 때는 그 모양을 보는 시험을 먼저 고쳐 RED를 본 뒤 고친다. 의도한 차이는 `design.md` '시안과 다른 곳'뿐이다. 고칠 것이 없으면 파일을 바꾸지 않는다. 끝에 `python3 ~/.claude/harness/bin/verify`를 돌리고 두 폭 사진을 사용자에게 쉬운 말로 보인다. 사진·스크립트는 저장소에 넣지 않는다. 끝나면 서버·브라우저를 멈춘다
