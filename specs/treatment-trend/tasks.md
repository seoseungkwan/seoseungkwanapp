# 작업 분할: 통계 치료별 추세

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
>
> **할 순서**: Phase 1 → 2 → 3 → 4 → 5. 같은 Phase의 TASK는 **병렬**이다(수정 파일이 겹치지 않고 앞 Phase의 결과만 쓴다). TASK마다 일꾼(subagent) 하나다.
>
> | Phase | TASK | 하는 일 | 병렬 |
> |---|---|---|---|
> | 1 밑바탕 | TASK-1 | 통계 묶음 표·저장 함수(새 migration), 계획 문서 줄 | 병렬 |
> | | TASK-2 | 묶음 읽기·저장 코드, 오류 번호 | 병렬 |
> | | TASK-3 | 불러올 때 묶음 세기 규칙(대소문자, 0줄 채우기) | 병렬 |
> | | TASK-4 | 묶음 열쇠·다시 불러오기 판단·줄 숫자(순수 함수) | 병렬 |
> | | TASK-5 | 묶음 고치기 규칙(순수 함수) | 병렬 |
> | | TASK-6 | 공용 조각: 그래프 글 함수 옮기기, [숫자로 보기] 글자 | 병렬 |
> | 2 조각 | TASK-7 | 비트 길에 묶음 넘기기(Worker 쪽) | 병렬 |
> | | TASK-8 | 파일 길에 묶음 넘기기 | 병렬 |
> | | TASK-9 | 묶음 읽기·저장·불러오기 준비 훅 | 병렬 |
> | | TASK-10 | 묶음 고치기 화면 | 병렬 |
> | | TASK-11 | 묶음 줄 표 | 병렬 |
> | | TASK-12 | 줄을 눌러 여는 그래프 | 병렬 |
> | 3 칸 | TASK-13 | 치료별 추세 칸 잇기 | 병렬 |
> | | TASK-14 | 통계 Worker 훅에 묶음 넘기기 | 병렬 |
> | 4 넣기 | TASK-15 | 통계 탭에 넣고 처방 추세 빼기 | 혼자 |
> | 5 마무리 | TASK-16 | 개인정보 E2E 파일 | 병렬 |
> | | TASK-17 | 화면 확인(390·1440)과 전체 검사 | 병렬 |
>
> - 파일이 겹치는 곳: `RxTrendSection.tsx`는 TASK-6(글 함수를 옮김)과 TASK-15(지움)가 고친다 → 다른 Phase. Worker `load` 메시지를 못 박은 시험은 TASK-7이 `groups: []`만 더하고(`useStatsWorker.test.ts`·`StatsScreen.test.tsx`·`readBitDays.test.ts`·`statsClient.test.ts`), 뒤에 TASK-14(`useStatsWorker.test.ts`)·TASK-15(`StatsScreen.test.tsx`)가 다시 고친다 → 다른 Phase. `parts.tsx`는 TASK-13만, `StatsSections.tsx`·`StatsScreen.tsx`는 TASK-15만 고친다. TASK-17은 화면 확인에서 고칠 것이 나올 때만 TASK-10~13의 파일을 고친다(TASK-16은 e2e 파일 하나라 겹치지 않는다)
> - 각 Phase 끝(TASK가 아님, 메인 세션): `python3 ~/.claude/harness/bin/verify`. 이 서버는 2 CPU·7.8GB·스왑 없음이라 다른 일이 없을 때 돌린다. 화면 TASK(10~13·15)는 끝나면 390·1440 사진을 쉬운 말로 보인다(찍는 법은 TASK-17과 같다)
> - 사용자 단계(사이트에 올리기 전): TASK-1의 SQL을 운영 Supabase에 붙여 넣기. 올린 뒤 비트 PC에서 최근 12개월로 한 번 다시 불러오기. TASK-16을 실제로 돌리는 일은 SQL·시험 계정을 기다린다
> - 승인 시안: `docs/mockups/treatment-trend/index.html`. 시안과 다른 곳은 `design.md` '시안과 다른 곳'을 따른다. 시험 자료는 모두 지어낸 값이고 `.claude/uploads`나 실제 환자 파일을 열지 않는다
> - 모든 화면 TASK: 클래스는 `classes.test.ts` 규칙(간격 단계, 토큰 색, 폭 접두사 md·lg·max-md·max-lg)을 지킨다. 반복 모양은 `ds`에서 가져온다. 상자 안 상자 금지(`nestedBoxes`)

## Phase 1 — 밑바탕 (화면 없음, 여섯 병렬)

## TASK-1: 통계 묶음 표·저장 함수, 계획 문서 줄
- Phase: 1 · 병렬
- AC: AC-1202.1~AC-1202.10, AC-1214.1~AC-1214.4
- REQ: REQ-1202, REQ-1214
- Files: supabase/migrations/20261105000100_stats_rx_groups.sql, supabase/statsRxGroups.rls.test.ts, plan.md, docs/ARCHITECTURE.md
- Tests: supabase/statsRxGroups.rls.test.ts
- TDD: required — PGlite에서 인증 → 이 파일을 그대로 돌린다(`supabase/revenue.rls.test.ts`·`rxPicks.rls.test.ts`와 같은 Supabase 흉내, `alter default privileges … on tables`·`on functions`까지). SQL 전문은 `design.md`다. AC-1202.9는 매출 migration(`20261101000400_revenue.sql`)도 돌린 DB에서 본다. 코드 겹침(AC-1202.7)은 끝에 검사하므로 한 트랜잭션·함수 부름 단위로 시험한다. 계획 문서 두 개의 줄은 AC 글자 그대로이고 시험이 파일을 읽어 본다(`plan.md`는 이 TASK만 고친다). 이미 있는 migration 파일은 고치지 않는다. 이 파일을 운영에 붙이는 것은 사용자 단계다

## TASK-2: 묶음 읽기·저장 코드, 오류 번호
- Phase: 1 · 병렬
- AC: AC-1203.1~AC-1203.5
- REQ: REQ-1203
- Files: src/lib/storage/statsRxGroups.ts, src/lib/storage/statsRxGroups.test.ts, src/types/errors.ts, src/lib/errors.ts, src/lib/errors.test.ts, src/types/rxGroups.ts, src/lib/storage/rxGroups.ts
- Tests: src/lib/storage/statsRxGroups.test.ts, src/lib/errors.test.ts
- TDD: required — 가짜 클라이언트로 읽는 칸·차례, RPC 이름·본문(열쇠 넷), 오류·예외·배열 아닌 답의 번호를 본다. AC-1203.5는 소스를 읽어 본다. `rxGroups.ts`·`types/rxGroups.ts`는 머리 주석만 고친다(`design.md` '저장 코드', 코드·시험은 그대로). 두 번호가 `errors.test.ts`의 번호 목록에 든다

## TASK-3: 불러올 때 묶음 세기 규칙
- Phase: 1 · 병렬
- AC: AC-1205.1, AC-1205.2, AC-1205.3, AC-1205.8
- REQ: REQ-1205
- Files: src/lib/analytics/aggregate.ts, src/lib/analytics/aggregate.test.ts, src/lib/payload/groupCounts.ts, src/lib/payload/groupCounts.test.ts, src/lib/payload/validate.ts
- Tests: src/lib/analytics/aggregate.test.ts, src/lib/payload/groupCounts.test.ts
- TDD: required — 환자 자료 구역이다(네트워크·저장소·console·React 없음, 지금 lint 규칙 그대로). `aggregate`는 묶음 코드 맞추기만 대소문자 무시로 바꾸고 처방 번호마다 한 번만 찾는다: 지금 `aggregate.test.ts`(기준 계산과 같음, 환자 없는 묶음 빠짐, 10만 줄·묶음 셋 1초)는 기대값을 바꾸지 않고 통과해야 한다. `fillGroupCounts`는 결과가 `validateDayPayload`를 지나는지와 넣은 값을 바꾸지 않는지 본다. AC-1205.8은 묶음 50개·네 자리 숫자의 가짜 날로 `JSON.stringify` 길이 차를 잰다. `validate.ts`는 `GROUP_ID` 주석만 고친다(검사 규칙·시험 그대로)

## TASK-4: 묶음 열쇠·다시 불러오기 판단·줄 숫자
- Phase: 1 · 병렬
- AC: AC-1205.6, AC-1206.1~AC-1206.6, AC-1207.1, AC-1207.2, AC-1207.4, AC-1207.5, AC-1208.1~AC-1208.4(이름 고르기), AC-1209.3(칸 나누기)
- REQ: REQ-1205, REQ-1206, REQ-1207, REQ-1208, REQ-1209
- Files: src/components/stats/treatmentView.ts, src/components/stats/treatmentView.test.ts
- Tests: src/components/stats/treatmentView.test.ts
- TDD: required — 순수 함수이고 입력은 가짜 일 줄·덮은 기간·묶음뿐이다. `view.ts`는 고치지 않고 `rxPickRows`·`rxDetail`·`codeKey`를 불러 쓴다(`design.md` '화면 숫자'의 가상 입력). `groupKey` 고정 값은 AC-1206.1 그대로다. AC-1207.2는 처방 추세 시험의 같은 경우(덮이지 않은 비교 날, 12개월 오늘이 든 달)를 묶음으로 다시 세어 견준다. 소스 규칙은 `view.ts`와 같다(`react|supabase|fetch|…` 낱말 없음, 시험이 소스를 읽어 본다)

## TASK-5: 묶음 고치기 규칙
- Phase: 1 · 병렬
- AC: AC-1210.3(차례 바꾸기·지우기), AC-1210.4(빼기), AC-1210.6(옮기기·옮긴 글), AC-1210.9(50개), AC-1210.11, AC-1210.12(저장 값·저장 글)
- REQ: REQ-1210
- Files: src/components/stats/treatmentEdit.ts, src/components/stats/treatmentEdit.test.ts
- Tests: src/components/stats/treatmentEdit.test.ts
- TDD: required — 순수 함수다(받은 목록을 바꾸지 않음을 시험한다). 이름 규칙은 `lib/revenue/treatments.ts`의 `renameGroup`을 불러 쓴다(그 파일은 고치지 않는다). 옮기기는 대소문자만 다른 코드도 옮긴다(`codeKey`). 글자는 AC 그대로다

## TASK-6: 공용 조각 — 그래프 글 함수 옮기기, [숫자로 보기] 글자
- Phase: 1 · 병렬
- AC: AC-1209.2(안내 글 함수), AC-1209.4(단추 글자 바꾸기), AC-1207.8(견준 짝 글 함수), AC-1201.6
- REQ: REQ-1209, REQ-1207, REQ-1201
- Files: src/components/stats/sections/trendLabels.ts, src/components/stats/sections/trendLabels.test.ts, src/components/stats/sections/RxTrendSection.tsx, src/components/stats/sections/RxPickDetail.tsx, src/components/stats/sections/RxPickDetail.test.tsx, src/components/stats/sections/DetailToggle.tsx, src/components/stats/sections/DetailToggle.test.tsx
- Tests: src/components/stats/sections/trendLabels.test.ts, src/components/stats/sections/DetailToggle.test.tsx
- TDD: required — `longLabel`·`tickLabel`·`comparisonAt`·`detailNote`·`comparedNote`·`GRAIN_NAME`을 글자 그대로 `trendLabels.ts`로 옮기고 `RxTrendSection.tsx`·`RxPickDetail.tsx`·`RxPickDetail.test.tsx`는 그곳에서 불러온다. `RxTrendSection.test.tsx`·`RxPickDetail.test.tsx`는 기대값을 바꾸지 않고 통과한다. `DetailToggle`의 `labels`를 주지 않으면 지금 마크업과 같음을 시험한다

## Phase 2 — 조각 (여섯 병렬, Phase 1 뒤)

## TASK-7: 비트 길에 묶음 넘기기 (Worker 쪽)
- Phase: 2 · 병렬
- AC: AC-1205.4, AC-1213.3(Worker로 가는 칸)
- REQ: REQ-1205, REQ-1213
- Files: src/types/stats.ts, src/workers/statsClient.ts, src/workers/statsClient.test.ts, src/workers/stats/jobs.ts, src/workers/stats/jobs.test.ts, src/components/stats/useStatsWorker.test.ts, src/components/stats/StatsScreen.test.tsx, src/components/dashboard/live/readBitDays.test.ts
- Tests: src/workers/statsClient.test.ts, src/workers/stats/jobs.test.ts, src/components/stats/useStatsWorker.test.ts, src/components/stats/StatsScreen.test.tsx, src/components/dashboard/live/readBitDays.test.ts
- TDD: required — `groups`는 `StatsLoadRequest`·`requestLoad`·`loadJob`에서 선택 칸이다(없으면 `[]`, `design.md` '불러오기 길'). `requestLoad`는 묶음을 `{ id, codes }`만 골라 새로 만들어 늘 배열로 보낸다(이름 등 다른 칸을 넘겨도 안 감). `createStatsHost.load`는 지금 다섯 칸만 꺼내 `loadJob`에 넘기므로(`jobs.ts:176`·`:182`) `groups ?? []`를 함께 넘기게 고친다. AC-1205.4 시험은 `loadJob`만 부르지 않고 `createStatsHost(...).load({ …, groups })`를 거쳐 보낸 `loaded` 답의 `view.days[].groups`에 열쇠 줄이 있는지(가짜 도우미 글자, 같은 환자·같은 날 두 코드 = 1, 그날 안 받은 묶음은 0줄) 본다. 달 줄은 `aggregate` 그대로다. 환자 자료 구역 규칙 그대로다. 메시지가 늘 `groups`를 싣게 되어, `load` 메시지를 `toEqual`로 못 박은 승인된 시험 넷의 기대에 `groups: []`만 더한다(다른 줄은 고치지 않는다): `statsClient.test.ts:55-58`(stats AC-505.7, 이 칸은 AC-1205.4가 대신), `useStatsWorker.test.ts:205`, `StatsScreen.test.tsx:438-445`, `readBitDays.test.ts:157`. `useStatsWorker.ts`·`readBitDays.ts`·`StatsScreen.tsx`는 고치지 않는다(선택 칸이라 타입이 맞는다) (한 작업은 한 층만 고친다는 규칙의 예외: 화면·대시보드 시험 파일 셋은 load 메시지 기대에 `groups: []` 한 줄씩만 더하고 다른 줄은 건드리지 않는다)

## TASK-8: 파일 길에 묶음 넘기기
- Phase: 2 · 병렬
- AC: AC-1205.5
- REQ: REQ-1205
- Files: src/components/stats/SourcePicker.tsx, src/components/stats/SourcePicker.test.tsx
- Tests: src/components/stats/SourcePicker.test.tsx
- TDD: required — `readFiles(files, today, groups)`가 `runAnalysis`에 묶음을 넘기고 저장할 일 줄에 `fillGroupCounts`를 하는지 본다. 셋째 인자를 주지 않으면 지금 시험이 그대로 통과한다

## TASK-9: 묶음 읽기·저장·불러오기 준비 훅
- Phase: 2 · 병렬
- AC: AC-1204.1~AC-1204.5, AC-1205.7(다시 읽기·실패 때), AC-1205.9, AC-1211.1~AC-1211.3(상태), AC-1213.1(이 파일)
- REQ: REQ-1204, REQ-1205, REQ-1211, REQ-1213
- Files: src/components/stats/useStatsRxGroups.ts, src/components/stats/useStatsRxGroups.test.ts
- Tests: src/components/stats/useStatsRxGroups.test.ts
- TDD: required — 저장 코드는 가짜(`vi.mock('@/lib/storage/statsRxGroups')`)다. 상태 셋과 바뀌는 때는 `design.md` '묶음 훅' 그대로다. 제안 다섯의 코드·차례·대소문자 합침, 보기만으로는 저장 안 함, `forLoad`의 세 갈래(줄 있음·없음·읽기 실패)와 거절하지 않음, 저장 성공·실패 상태를 본다. AC-1204.5 시험 둘: (가) 묶음 읽기가 빈 목록으로 끝난 뒤에 `days`가 오면 제안에 코드가 차고 `forLoad`가 그 코드로 정의를 낸다 (나) `forLoad`의 제안 저장이 성공한 뒤 `days`를 바꿔도 묶음 코드가 그대로다. AC-1205.9는 가짜 시계로 본다: 읽기가 끝나지 않으면 4,999ms에는 안 풀리고 5,000ms에 화면 묶음 정의로 풀리며, 그 뒤 늦게 온 답은 상태만 바꾼다. 읽기가 빨리 끝나면 시계를 기다리지 않고 풀린다(시계는 지운다). `forLoad`는 `groupDefs`(TASK-4)를 쓴다. 브라우저 저장소 낱말이 없음을 소스로 본다

## TASK-10: 묶음 고치기 화면
- Phase: 2 · 병렬
- AC: AC-1210.2(안내 글·목록), AC-1210.3~AC-1210.11, AC-1210.12(저장 부름·기다림), AC-1210.13, AC-1210.14(버림), AC-1212.2
- REQ: REQ-1210, REQ-1212
- Files: src/components/stats/sections/TreatmentGroupEditor.tsx, src/components/stats/sections/TreatmentGroupEditor.test.tsx
- Tests: src/components/stats/sections/TreatmentGroupEditor.test.tsx
- TDD: required — props만 받는다(훅·저장 코드 없음, `onSave`는 가짜 Promise). 초안 상태와 열린 찾기 목록은 이 안에만 있다. 규칙은 TASK-5 함수, 찾기는 `searchCatalog`(rx-picker)를 쓴다. 초점 옮김(▲▼, 목록 열기·닫기, 새 묶음, 첫 문제 칸)을 시험한다. 휴대폰 크기 클래스(`max-md:`)를 본다

## TASK-11: 묶음 줄 표
- Phase: 2 · 병렬
- AC: AC-1207.3, AC-1207.4(그리기), AC-1207.5(그리기), AC-1207.6, AC-1207.7, AC-1207.9, AC-1209.1(줄 단추), AC-1212.1
- REQ: REQ-1207, REQ-1209, REQ-1212
- Files: src/components/stats/sections/TreatmentTable.tsx, src/components/stats/sections/TreatmentTable.test.tsx
- Tests: src/components/stats/sections/TreatmentTable.test.tsx
- TDD: required — props만 받는다(`rows`는 TASK-4의 `TreatmentRow`, 열린 칸은 `renderPanel` prop이라 TASK-12를 부르지 않는다). 비율 글자는 `rxPickView.ts`의 `rateText`·`addedRateText`, 증감은 `parts.tsx`의 `DeltaText`, 줄 막대는 `InlineBar`를 쓴다. 칸 폭은 `lg:grid-cols-[minmax(200px,1fr)_84px_184px_128px_128px_16px]`, 쌓임은 `max-lg:`

## TASK-12: 줄을 눌러 여는 그래프
- Phase: 2 · 병렬
- AC: AC-1209.2, AC-1209.3(그리기), AC-1209.4, AC-1209.6, AC-1206.5(회색 막대·표 비교 칸)
- REQ: REQ-1209, REQ-1206
- Files: src/components/stats/sections/TreatmentDetail.tsx, src/components/stats/sections/TreatmentDetail.test.tsx
- Tests: src/components/stats/sections/TreatmentDetail.test.tsx
- TDD: required — 처방 추세 `RxDetail`과 같은 짜임이다(`StackedBarChart`·`ChartLegend`·`DetailToggle`(TASK-6 `labels`)·`trendLabels.ts`). 숫자는 TASK-4 `treatmentDetail`이다. `dense`는 칸 13개 넘을 때만이다

## Phase 3 — 칸 (둘 병렬, Phase 2 뒤)

## TASK-13: 치료별 추세 칸 잇기
- Phase: 3 · 병렬
- AC: AC-1201.3, AC-1201.4, AC-1201.5, AC-1208.1~AC-1208.4(그리기), AC-1207.8(그리기), AC-1209.1(여러 줄 열기), AC-1209.5, AC-1210.1, AC-1210.2(열기·초점), AC-1210.8(목록 읽기), AC-1210.12(돌아오기·저장 글·초점), AC-1210.14(돌아오기·초점), AC-1210.15, AC-1211.1, AC-1211.2, AC-1211.3(그리기), AC-1213.1(섹션 파일)
- REQ: REQ-1201, REQ-1207, REQ-1208, REQ-1209, REQ-1210, REQ-1211, REQ-1213
- Files: src/components/stats/sections/TreatmentTrendSection.tsx, src/components/stats/sections/TreatmentTrendSection.test.tsx, src/components/stats/sections/parts.tsx
- Tests: src/components/stats/sections/TreatmentTrendSection.test.tsx
- TDD: required — 묶음 값(`StatsRxGroupsView`)은 시험이 만든 가짜 객체다(훅을 부르지 않는다). 찾기 목록은 `useRxCatalog`를 쓰고 `@/lib/storage/stats`를 가짜로 둔다. `parts.tsx`는 `Section`에 선택 prop `headingRef`만 더한다(주지 않으면 지금 그대로, `PeriodSummary.test.tsx`가 그대로 통과). 상태 차례: 저장된 숫자 없음 → 고치는 중 → 묶음 읽는 중·실패 → 이 기간 자료 없음 → 안내 상자 + 표 + 아래 안내. 매출 저장 코드를 부르지 않음(AC-1210.15)은 `vi.mock('@/lib/storage/rxGroups')`가 불리지 않음으로 본다

## TASK-14: 통계 Worker 훅에 묶음 넘기기
- Phase: 3 · 병렬
- AC: AC-1205.4(화면 쪽), AC-1205.7(비트 요청을 늦추지 않음)
- REQ: REQ-1205
- Files: src/components/stats/useStatsWorker.ts, src/components/stats/useStatsWorker.test.ts
- Tests: src/components/stats/useStatsWorker.test.ts
- TDD: required — `load({ …, groups })`의 `groups`는 선택 Promise다(없으면 `[]`, 그래서 Phase 4 전의 `StatsScreen.tsx`가 타입을 지난다). `stats.rows` 요청은 그 Promise를 기다리지 않고 나가고, Worker `load` 메시지는 Promise가 풀린 뒤 그 `groups`를 싣는다(거절이면 `[]`). TASK-7이 `groups: []`를 더해 둔 `useStatsWorker.test.ts:205`는 그대로 두고, 진짜 묶음을 넘기는 시험을 더한다

## Phase 4 — 넣기 (혼자, Phase 3 뒤)

## TASK-15: 통계 탭에 넣고 처방 추세 빼기
- Phase: 4 · 혼자
- AC: AC-1201.1, AC-1201.2, AC-1201.6, AC-1201.7, AC-1205.7(통계 화면에서 부름), AC-1213.1(검사 목록), AC-1213.2
- REQ: REQ-1201, REQ-1205, REQ-1213
- Files: src/components/stats/StatsScreen.tsx, src/components/stats/StatsScreen.test.tsx, src/components/stats/sections/StatsSections.tsx, src/components/stats/sections/PeriodSummary.test.tsx, src/components/stats/sections/RxTrendSection.tsx, src/components/stats/sections/RxTrendSection.test.tsx, src/components/dashboard/briefing/features.ts, src/components/dashboard/briefing/features.test.ts
- Tests: src/components/stats/StatsScreen.test.tsx, src/components/stats/sections/PeriodSummary.test.tsx, src/components/dashboard/briefing/features.test.ts
- TDD: required — 먼저 `design.md` '기존 명세·시험과의 관계'에 적은 줄(`StatsScreen.test.tsx:58`·`:438-445`·`:1229-1234`·`:1611-1617`·`:1641-1664`, `PeriodSummary.test.tsx:53`·`:72`·`:76-80`·`:247`·`:320-327`)을 새 차례·배치·`groups`로 고쳐 RED를 본다. 두 파일에 `vi.mock('@/lib/storage/statsRxGroups', …)`를 더한다(기본은 저장된 묶음 하나라 넓은 읽기 횟수 시험 `StatsScreen.test.tsx:1599`가 그대로다). `StatsSections`의 `groups`는 필수 prop이라 `PeriodSummary.test.tsx`의 그리기 도우미가 가짜 `StatsRxGroupsView`를 넘긴다. 파일 길 시험은 `readFiles` 셋째 인자, 비트 길 시험은 Worker `load` 메시지의 `groups`를 본다. `RxTrendSection.tsx`·`RxTrendSection.test.tsx`는 지운다. AC-1201.7: `features.ts:23`의 통계 설명 글자를 바꾸고, 승인된 시험 `features.test.ts:11`(표)·`:66`(AC-515.2 기대)의 같은 글자를 먼저 고쳐 RED를 본다(tab-frame AC-316.3·stats AC-515.2의 그 글자를 AC-1201.7이 대신한다). AC-1213.1은 `PeriodSummary.test.tsx`의 소스 검사 목록에 이 기능 파일을 더해 본다. AC-1213.2는 `npm run lint`·`src/guardrails.test.ts`가 그대로 통과함으로 본다(규칙 파일은 고치지 않는다). 이 밖에 바뀌는 기대값이 나오면 멈추고 보고한다

## Phase 5 — 마무리 (둘 병렬, Phase 4 뒤)

## TASK-16: 개인정보 E2E 파일
- Phase: 5 · 병렬
- AC: AC-1213.4
- REQ: REQ-1213
- Files: e2e/treatment-trend-privacy.spec.ts
- Tests: e2e/treatment-trend-privacy.spec.ts
- TDD: exempt — 시험만 더한다. 대상 코드는 TASK-2·7·8·9·15에서 단위 시험을 통과했으므로 구현할 것이 없어 RED 단계가 없다. `e2e/rx-picker-privacy.spec.ts`와 같은 방식이다(머리·응답을 읽지도 찍지도 않음, 걸린 종류와 가린 경로만). 시험이 헛돌지 않는지는 기대값 하나를 일부러 틀려 실패를 본 뒤 되돌려 확인한다. 기다림: 사용자가 TASK-1 SQL을 실제 Supabase에 붙임 + 시험 계정(`.env.local`). 그 전에는 파일만 쓰고 타입 검사까지 한다. 확인: `npm run e2e`(`next build`가 필요해 다른 일이 없을 때)

## TASK-17: 화면 확인(390·1440)과 전체 검사
- Phase: 5 · 병렬
- AC: AC-1215.1, AC-1215.2, AC-1212.3
- REQ: REQ-1215, REQ-1212
- Files: src/components/stats/sections/TreatmentTrendSection.tsx, src/components/stats/sections/TreatmentTrendSection.test.tsx, src/components/stats/sections/TreatmentTable.tsx, src/components/stats/sections/TreatmentTable.test.tsx, src/components/stats/sections/TreatmentDetail.tsx, src/components/stats/sections/TreatmentDetail.test.tsx, src/components/stats/sections/TreatmentGroupEditor.tsx, src/components/stats/sections/TreatmentGroupEditor.test.tsx
- Tests: src/components/stats/sections/TreatmentTrendSection.test.tsx, src/components/stats/sections/TreatmentTable.test.tsx, src/components/stats/sections/TreatmentDetail.test.tsx, src/components/stats/sections/TreatmentGroupEditor.test.tsx
- TDD: required — 찍는 법은 specs/auth design.md '화면 확인 방법'과 같다: scratchpad의 Node 가짜 Supabase(가짜 사용자·병원, 지어낸 `stats_days`·`stats_coverage`·`stats_rx_groups` 줄, 상황별: 숫자 있음·처음 쓸 때·일부 묶음 다시 불러와야 함), 명령 환경 변수로 그 서버를 보는 `npm run dev`, 세션은 찍기 스크립트가 쿠키로 넣는다(앱 코드에 우회 길 없음, 토큰 값을 남기지 않음). `dev-browser`로 390×844·1440×900에서 AC-1215.1의 모습을 찍고 `scrollWidth ≤ clientWidth`를 잰 뒤 시안과 나란히 본다. 다른 점을 고칠 때는 그 모양을 보는 시험을 먼저 고쳐 RED를 본 뒤 고친다. 의도한 차이는 `design.md` '시안과 다른 곳'뿐이다. 고칠 것이 없으면 파일을 바꾸지 않는다. 끝에 `python3 ~/.claude/harness/bin/verify`를 돌리고(다른 일이 없을 때) 두 폭 사진을 사용자에게 쉬운 말로 보인다. 사진·스크립트는 저장소에 넣지 않는다. 끝나면 서버·브라우저를 멈춘다
