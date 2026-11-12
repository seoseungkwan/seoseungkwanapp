# 작업 분할: 처방별 추세 묶음에 제외할 처방

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- AC:`, `- Files:`(수정 범위), `- Tests:`, `- TDD: required|exempt`, `- 차례:`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
>
> **할 순서**: 먼저 할 일 → Phase 1(TASK-1·2·3 병렬) → Phase 2(TASK-4·5·6 병렬, Phase 1의 타입을 씀) → Phase 3(TASK-7·8 병렬) → Phase 4(TASK-9, 전체 검사 + 검토 한 번).
> 같은 Phase의 TASK는 수정 파일이 겹치지 않는다. 시험 자료는 모두 지어낸 값이다. `helper/**`·`extension/**`·`src/lib/bridge/**`·`eslint.config.mjs`는 고치지 않는다.

## 먼저 할 일 (코드 작업 아님)
1. 사용자가 시안(`docs/mockups/rx-group-exclude/index.html`)을 승인한다
2. 사용자가 `/sdd approve rx-group-exclude`를 입력한다

## TASK-1: 묶음 표에 제외할 처방 칸 (새 migration)과 계획 문서
- REQ: REQ-2701, REQ-2709
- AC: AC-2701.1, AC-2701.2, AC-2701.3, AC-2701.4, AC-2701.5, AC-2709.3
- Files: supabase/migrations/20261112000100_stats_rx_groups_exclude.sql, supabase/statsRxGroupsExclude.rls.test.ts, plan.md, docs/ARCHITECTURE.md
- Tests: supabase/statsRxGroupsExclude.rls.test.ts
- TDD: required — design.md 'DB' SQL 그대로. 시험은 `statsRxGroups.rls.test.ts`와 같은 PGlite 흉내(기본 권한을 진짜로 줌)에 인증 → 통계 → stats_rx_groups → 새 파일 차례로 돌린다. 예전 모양 본문(`exclude_codes` 열쇠 없음)으로 저장하면 있던 값이 남는지도 본다. `plan.md`·`docs/ARCHITECTURE.md`는 AC-2709.3의 줄만 더한다
- 차례: Phase 1

## TASK-2: 같은 날 제외할 처방 받은 환자 빼고 세기 (환자 자료 구역)
- REQ: REQ-2703, REQ-2709
- AC: AC-2703.1, AC-2703.2, AC-2703.3, AC-2703.4, AC-2703.5, AC-2703.6, AC-2709.1
- Files: src/types/analysis.ts, src/lib/analytics/groupDef.ts, src/lib/analytics/groupDef.test.ts, src/lib/analytics/aggregate.ts, src/lib/analytics/aggregate.test.ts
- Tests: src/lib/analytics/aggregate.test.ts, src/lib/analytics/groupDef.test.ts
- TDD: required — `RxGroupDef`에 선택 칸 `exclude`. `copyGroupDef`(제외할 처방이 있을 때만 `exclude`를 새 배열로 실음). `aggregate`는 제외할 처방이 있는 묶음이 있을 때만 먼저 훑어 (묶음 자리, 환자, 날)을 모으고 본 훑기의 `newGroupDays`에서 뺀다. 지금 `aggregate.test.ts` 기대값은 바꾸지 않는다. 10만 줄 1초 시험에 제외할 처방이 있는 묶음 경우를 더한다
- 차례: Phase 1

## TASK-3: 통계 묶음 타입과 읽기·저장 코드
- REQ: REQ-2702
- AC: AC-2702.1, AC-2702.2
- Files: src/types/rxGroups.ts, src/lib/storage/statsRxGroups.ts, src/lib/storage/statsRxGroups.test.ts
- Tests: src/lib/storage/statsRxGroups.test.ts
- TDD: required — `StatsRxGroup = RxGroup & { exclude?: string[] }`. 읽는 칸 글자와 저장 본문 열쇠를 못 박은 지금 시험(treatment-trend AC-1203.1·1203.2)을 먼저 AC-2702.1·2702.2 기대로 고쳐 RED를 본다. `RxGroup` 모양은 그대로다
- 차례: Phase 1

## TASK-4: 불러오기 길에 제외할 처방 싣기
- REQ: REQ-2704
- AC: AC-2704.1, AC-2704.2
- Files: src/workers/statsClient.ts, src/workers/statsClient.test.ts, src/workers/runAnalysis.ts, src/workers/runAnalysis.test.ts, src/workers/stats/jobs.test.ts, src/components/stats/SourcePicker.tsx, src/components/stats/SourcePicker.test.tsx, src/components/dashboard/live/readBitDays.ts, src/components/dashboard/live/readBitDays.test.ts
- Tests: src/workers/statsClient.test.ts, src/workers/runAnalysis.test.ts, src/workers/stats/jobs.test.ts, src/components/stats/SourcePicker.test.tsx, src/components/dashboard/live/readBitDays.test.ts
- TDD: required — 네 곳(design.md 사실 2)의 `{ id, codes }` 옮기기를 `copyGroupDef`로 바꾼다. 시험: `exclude`가 있는 정의는 메시지·`runAnalysis` 인자에 `exclude`가 있고, 없는 정의는 지금처럼 `{ id, codes }`만(지금 `toEqual` 기대 그대로). `jobs.test.ts`는 `createStatsHost(...).load`를 거쳐 제외된 숫자를 본다(`jobs.ts`는 고치지 않는다)
- 차례: Phase 2

## TASK-5: 묶음 열쇠·정의와 대시보드·AI 리포트의 열쇠
- REQ: REQ-2705
- AC: AC-2705.1, AC-2705.2, AC-2705.3, AC-2705.4, AC-2705.5, AC-2705.6
- Files: src/components/stats/treatmentView.ts, src/components/stats/treatmentView.test.ts, src/components/dashboard/live/rxGroups.ts, src/components/dashboard/live/rxGroups.test.ts, src/app/api/ai/store.ts, src/app/api/ai/store.test.ts
- Tests: src/components/stats/treatmentView.test.ts, src/components/dashboard/live/rxGroups.test.ts, src/app/api/ai/store.test.ts
- TDD: required — `groupKey(codes, exclude = [])`(design.md '묶음 열쇠'), `groupDefs`는 `copyGroupDef` 모양, `treatmentRows`·`staleNames`가 `groupKey(group.codes, group.exclude)`. 대시보드 `toDashboardGroups` 열쇠, AI `loadReportMonths`의 읽는 칸(`name, codes, exclude_codes, sort_order`)과 이름 짝. `store.test.ts`의 읽는 칸 글자 기대를 먼저 고쳐 RED를 본다. AI 경로는 서버가 DB에서 읽은 값만 쓰는 지금 규칙 그대로다
- 차례: Phase 2

## TASK-6: 묶음 고치기 규칙과 묶음 훅
- REQ: REQ-2706
- AC: AC-2706.1, AC-2706.2, AC-2706.3, AC-2706.4, AC-2706.5, AC-2706.6
- Files: src/components/stats/treatmentEdit.ts, src/components/stats/treatmentEdit.test.ts, src/components/stats/useStatsRxGroups.ts, src/components/stats/useStatsRxGroups.test.ts
- Tests: src/components/stats/treatmentEdit.test.ts, src/components/stats/useStatsRxGroups.test.ts
- TDD: required — `pickExclude`·`removeExclude`·`inExclude` 새 함수, `pickCode`·`forSave`·`savedNote`·`addBlankGroup` 고침, 묶음 타입을 `StatsRxGroup`으로. 훅의 제안 묶음은 `exclude: []`. `forSave` 결과를 `toEqual`로 못 박은 지금 시험이 있으면 `exclude: []`만 더한다
- 차례: Phase 2

## TASK-7: 묶음 고치기 화면에 제외할 처방 자리
- REQ: REQ-2707
- AC: AC-2707.1, AC-2707.2, AC-2707.3, AC-2707.4, AC-2707.5, AC-2707.6, AC-2707.7
- Files: src/components/stats/sections/TreatmentGroupEditor.tsx, src/components/stats/sections/TreatmentGroupEditor.test.tsx
- Tests: src/components/stats/sections/TreatmentGroupEditor.test.tsx
- TDD: required — 찾기 목록 열림 상태를 `{ key, kind }`로. 경고 글 기대(treatment-trend AC-1210.10)를 먼저 AC-2707.6 글로 고쳐 RED를 본다. 글·자리·초점은 시안과 AC 그대로
- 차례: Phase 3

## TASK-8: 보는 화면의 코드 줄과 안내 글
- REQ: REQ-2708
- AC: AC-2708.1, AC-2708.2, AC-2708.3
- Files: src/components/stats/sections/TreatmentTable.tsx, src/components/stats/sections/TreatmentTable.test.tsx, src/components/stats/sections/TreatmentTrendSection.tsx, src/components/stats/sections/TreatmentTrendSection.test.tsx
- Tests: src/components/stats/sections/TreatmentTable.test.tsx, src/components/stats/sections/TreatmentTrendSection.test.tsx
- TDD: required — `Name`에 `exclude`, `BottomNotes`에 AC-2708.2 글. 제외할 처방이 없는 묶음의 지금 기대값은 바꾸지 않는다
- 차례: Phase 3

## TASK-9: 개인정보 E2E 파일
- REQ: REQ-2709, REQ-2710
- AC: AC-2709.2, AC-2710.1
- Files: e2e/treatment-trend-privacy.spec.ts
- Tests: e2e/treatment-trend-privacy.spec.ts
- TDD: exempt — 시험만 고친다. 대상 코드는 TASK-1~8의 단위 시험을 통과했으므로 구현할 것이 없어 RED 단계가 없다. 시험 계정 묶음 하나에 제외할 처방 하나를 넣고, 본문 열쇠 다섯과 `groupKey(codes, exclude)`를 본다. 실제 Supabase(사용자가 SQL을 붙임)와 시험 계정이 있어야 `npm run e2e`로 돈다. 이 서버에서는 타입 검사까지 한다. 끝에 `npm run lint`·`npm run build`·`npm test`를 돌리고 `harness-reviewer` 검토를 한 번 받는다
- 차례: Phase 4
