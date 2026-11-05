# 작업 분할: 통계 처방 골라 보기

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
>
> **할 순서**: Phase 1 → Phase 2 → Phase 3 → Phase 4. 같은 Phase의 Step은 **병렬**이다(수정 파일이 겹치지 않고 앞 Phase의 결과만 쓴다). Step마다 일꾼(subagent) 하나다.
>
> | Phase | Step | TASK | 하는 일 | 병렬 |
> |---|---|---|---|---|
> | 1 밑바탕 | 1.1 | TASK-1 | 고른 처방 저장 표, 계획 문서 줄 | 병렬 |
> | | 1.2 | TASK-2 | 저장·읽기 코드, 검사, 오류 번호 | 병렬 |
> | | 1.3 | TASK-3 | 표 숫자·찾기·복사 글(순수 함수) | 병렬 |
> | | 1.4 | TASK-4 | 차트 부품에 구분 없음 빗금 더하기 | 병렬 |
> | 2 화면 조각 | 2.1 | TASK-5 | 고른 처방·찾기 목록을 다루는 훅 | 병렬 |
> | | 2.2 | TASK-6 | 찾기 칸·칩 | 병렬 |
> | | 2.3 | TASK-7 | 표·띠·합계·안내·표 복사 | 병렬 |
> | | 2.4 | TASK-8 | 줄을 눌러 여는 그래프·자세히 | 병렬 |
> | 3 잇기 | 3.1 | TASK-9 | 조각을 잇고 통계 탭에 넣기 | 혼자 |
> | 4 마무리 | 4.1 | TASK-10 | `30 초진` = 재진 (빼도 되는 TASK) | 병렬 |
> | | 4.2 | TASK-11 | 개인정보 E2E 파일 | 병렬 |
>
> - 파일이 겹치는 곳: TASK-10이 TASK-7의 `RxPickTable.*`를 고치므로 Phase 4는 Phase 2 뒤다. Phase 2끼리는 겹치지 않는다(TASK-7은 그래프를 `renderPanel` prop으로 받아 TASK-8을 부르지 않는다)
> - 각 Phase 끝(TASK가 아님, 메인 세션): `python3 ~/.claude/harness/bin/verify`. 이 서버는 2 CPU·스왑 없음이라 다른 일이 없을 때 돌린다. Phase 3 끝에 390·1024·1440px 화면 캡처로 쪽이 옆으로 밀리지 않는지와 시안 휴대폰 모양을 사진으로 보고 쉬운 말로 보고한다
> - 사용자 단계(사이트에 올리기 전): TASK-1의 SQL을 운영 Supabase에 붙여 넣기. 파일을 다시 넣기(`30 초진`). TASK-11을 실제로 돌리는 일은 SQL·시험 계정을 기다린다
> - 승인 시안: `docs/mockups/rx-picker/index.html`. 시안과 다른 곳은 `design.md` '시안과 다른 곳'을 따른다. 시험 자료는 모두 지어낸 값이고 `.claude/uploads`나 실제 환자 파일을 열지 않는다

## Phase 1 — 밑바탕 (화면 없음, Step 넷 병렬)

## TASK-1: 고른 처방 저장 표, 계획 문서 줄
- Step: Phase 1 · Step 1.1 · 병렬
- AC: AC-810.1~AC-810.9, AC-815.1~AC-815.3
- REQ: REQ-810, REQ-815
- Files: supabase/migrations/20261103000000_rx_picks.sql, supabase/rxPicks.rls.test.ts, docs/ARCHITECTURE.md, plan.md, docs/PRD.md
- Tests: supabase/rxPicks.rls.test.ts
- TDD: required — PGlite에서 인증 → 이 파일을 그대로 돌린다(`supabase/stats-rls.test.ts`·`revenue.rls.test.ts`와 같은 Supabase 흉내). SQL 전문은 `design.md`다. 시험의 Supabase 흉내에는 실제처럼 `alter default privileges … grant all on sequences`도 넣는다(`stats-rls.test.ts:17-18`에는 없다). 두 계획 문서의 줄은 AC-815의 글자 그대로이고 시험이 파일을 읽어 본다(`plan.md`는 이 TASK만 고친다). `docs/ARCHITECTURE.md` DB 표 목록에 `stats_rx_picks` 줄을 더하고, 백업 목록 줄에 "`lib/backup/tables.ts`가 생기면 이 표도 넣는다"를 적는다(그 파일은 이 갈래에 없다). 이 파일을 운영에 붙이는 것은 사용자 단계다

## TASK-2: 저장·읽기 코드, 검사, 오류 번호
- Step: Phase 1 · Step 1.2 · 병렬
- AC: AC-811.1~AC-811.6
- REQ: REQ-811
- Files: src/types/rxPicks.ts, src/lib/storage/rxPicks.ts, src/lib/storage/rxPicks.test.ts, src/lib/storage/stats.ts, src/lib/payload/validate.ts, src/lib/payload/validate.test.ts, src/types/db.ts, src/types/errors.ts, src/lib/errors.ts, src/lib/errors.test.ts
- Tests: src/lib/storage/rxPicks.test.ts, src/lib/payload/validate.test.ts, src/lib/errors.test.ts
- TDD: required — 가짜 클라이언트로 보내는 본문·지우기 조건을 본다. `stats.ts`는 `readAllPages`에 `export`만 붙인다(`stats.test.ts`는 그대로 통과). 불러오기 금지(AC-811.6)는 `rxPicks.test.ts`가 소스를 읽어 본다. 시험에서 `E-STATS-PICK-*` 두 번호가 `errors.test.ts`의 번호 목록에 든다

## TASK-3: 표 숫자·찾기·복사 글
- Step: Phase 1 · Step 1.3 · 병렬
- AC: AC-804.1~AC-804.10, AC-804.12, AC-802.2~AC-802.4(목록 차례·거르기·건수 함수), AC-802.11, AC-802.12(목록 줄 합치기), AC-805.5(비율 합), AC-805.7(견준 짝 글), AC-808.1, AC-808.2
- REQ: REQ-804, REQ-802, REQ-805, REQ-808
- Files: src/components/stats/view.ts, src/components/stats/view.test.ts, src/components/stats/rxPickView.ts, src/components/stats/rxPickView.test.ts
- Tests: src/components/stats/view.test.ts, src/components/stats/rxPickView.test.ts
- TDD: required — 순수 함수이고 입력은 가짜 일 줄과 덮은 기간뿐이다. `view.ts`는 `codeKey`를 내보내고 `AC-511.7` 소스 규칙(`react|supabase|fetch|…` 낱말 없음)을 지킨다. `rxPickView.ts`에도 같은 소스 시험을 둔다. `validateRxPick`은 TASK-2가 같은 Phase에 만드므로, `rxCatalog`는 걸러낼 함수를 인자로 받고 TASK-9가 `validateRxPick`을 넘긴다

## TASK-4: 차트 부품에 구분 없음 빗금
- Step: Phase 1 · Step 1.4 · 병렬
- AC: AC-805.3(범례 모양), AC-806.4, AC-806.7(`hideZeroTotals`)
- REQ: REQ-805, REQ-806
- Files: src/components/charts/StackedBarChart.tsx, src/components/charts/StackedBarChart.test.tsx, src/components/charts/ChartLegend.tsx, src/components/charts/ChartLegend.test.tsx, docs/UI_GUIDE.md
- Tests: src/components/charts/StackedBarChart.test.tsx, src/components/charts/ChartLegend.test.tsx
- TDD: required — 옵션을 주지 않으면 지금 마크업과 한 글자도 다르지 않음을 시험한다. `rules.test.ts`는 고치지 않고 통과해야 한다. `docs/UI_GUIDE.md` 차트 표에 새 값을 적는다

## Phase 2 — 화면 조각 (Step 넷 병렬, Phase 1 뒤)

## TASK-5: 고른 처방·찾기 목록 훅
- Step: Phase 2 · Step 2.1 · 병렬
- AC: AC-802.5~AC-802.7(읽는 때, 늦게 온 답), AC-812.1(읽는 상태), AC-812.2, AC-812.3(상태), AC-812.4, AC-812.5(상태), AC-812.7, AC-812.8
- REQ: REQ-802, REQ-812
- Files: src/components/stats/useRxPicks.ts, src/components/stats/useRxPicks.test.ts, src/components/stats/useRxCatalog.ts, src/components/stats/useRxCatalog.test.ts, src/components/stats/useStatsData.ts, src/components/stats/useStatsData.test.ts
- Tests: src/components/stats/useRxPicks.test.ts, src/components/stats/useRxCatalog.test.ts, src/components/stats/useStatsData.test.ts
- TDD: required — 저장은 가짜(`vi.mock`)다. 요청 차례는 답을 잡아 둔 가짜로 본다. `useStatsData`는 `revision`만 더한다

## TASK-6: 찾기 칸·칩
- Step: Phase 2 · Step 2.2 · 병렬
- AC: AC-802.1~AC-802.4, AC-802.6(글자), AC-802.8~AC-802.10, AC-802.12(고름 표시), AC-803.1~AC-803.5, AC-809.2(찾기·칩)
- REQ: REQ-802, REQ-803, REQ-809
- Files: src/components/stats/sections/RxPickSearch.tsx, src/components/stats/sections/RxPickSearch.test.tsx
- Tests: src/components/stats/sections/RxPickSearch.test.tsx
- TDD: required — props만 받는다(훅·저장 없음). 전체 폭 칸 안 넣기는 TASK-9다. 칩 글자·안내 글은 시안 그대로다

## TASK-7: 표·띠·합계·안내·표 복사
- Step: Phase 2 · Step 2.3 · 병렬
- AC: AC-804.5(그리기), AC-804.8, AC-805.1~AC-805.9, AC-808.1(단추 연결), AC-808.3~AC-808.5, AC-809.1, AC-809.2(표)
- REQ: REQ-804, REQ-805, REQ-808, REQ-809
- Files: src/components/stats/sections/RxPickTable.tsx, src/components/stats/sections/RxPickTable.test.tsx
- Tests: src/components/stats/sections/RxPickTable.test.tsx
- TDD: required — `GAP_NOTE` 상수는 시안 글자 `구분 없음은 파일에 신환·재진이 아닌 다른 값(30 초진, 진찰료산정안함 같은 값)이 적힌 건이에요. 어느 쪽에도 넣지 않아서 두 비율을 더해도 100%가 안 돼요.`로 둔다. 시험은 `어느 쪽에도 넣지 않아서 두 비율을 더해도 100%가 안 돼요.`가 들었는지만 보아 TASK-10이 시험을 뒤엎지 않게 한다. 열린 칸은 `renderPanel` prop으로 받는다. 얇은 띠 빗금은 이 파일의 path 상수다(`design.md` '차트 부품'). 칸 폭은 `lg:grid-cols-[minmax(200px,1fr)_72px_104px_176px_64px_64px_64px_64px_16px]`, 쌓임은 `max-lg:`(`classes.test.ts` 규칙 안). `navigator.clipboard`는 가짜다

## TASK-8: 줄을 눌러 여는 그래프·자세히
- Step: Phase 2 · Step 2.4 · 병렬
- AC: AC-806.1(칸 안), AC-806.2~AC-806.4, AC-806.6, AC-806.7, AC-807.1, AC-807.2, AC-809.2(그래프 단추)
- REQ: REQ-806, REQ-807, REQ-809
- Files: src/components/stats/sections/RxPickDetail.tsx, src/components/stats/sections/RxPickDetail.test.tsx, src/components/stats/sections/RxTrendSection.tsx
- Tests: src/components/stats/sections/RxPickDetail.test.tsx
- TDD: required — `RxTrendSection.tsx`는 네 이름에 `export`만 붙인다(`RxTrendSection.test.tsx`는 그대로 통과). `rxDetail`을 그대로 쓴다. `dense`를 주지 않는다. 그래프 모양은 prop으로 받아 기간을 바꿔도 부모가 지킨다

## Phase 3 — 잇기 (혼자, Phase 2 뒤)

## TASK-9: 조각을 잇고 통계 탭에 넣기
- Step: Phase 3 · Step 3.1 · 혼자
- AC: AC-801.1~AC-801.4, AC-802.8·AC-803.2·AC-803.3(그래프 닫힘), AC-804.11, AC-806.1, AC-806.5, AC-802.7(다시 열기), AC-812.1~AC-812.3(화면), AC-812.5(화면), AC-812.6(소스 낱말 검사, 모든 파일이 있는 이곳에 둔다)
- REQ: REQ-801, REQ-802, REQ-803, REQ-804, REQ-806, REQ-812
- Files: src/components/stats/sections/RxPickerSection.tsx, src/components/stats/sections/RxPickerSection.test.tsx, src/components/stats/sections/StatsSections.tsx, src/components/stats/sections/PeriodSummary.test.tsx, src/components/stats/StatsScreen.tsx, src/components/stats/StatsScreen.test.tsx
- Tests: src/components/stats/sections/RxPickerSection.test.tsx, src/components/stats/sections/PeriodSummary.test.tsx, src/components/stats/StatsScreen.test.tsx
- TDD: required — 먼저 `StatsScreen.test.tsx:51`·`:301`·`:1215-1227`과 `PeriodSummary.test.tsx:45-49`·`:264`·`:321`을 여덟 칸으로 고쳐 RED를 본다(`design.md` '기존 명세·시험과의 관계'). 두 파일에 `vi.mock('@/lib/storage/rxPicks', …)`를 더한다. 이 밖에 바뀌는 기대값이 나오면 멈추고 보고한다. 끝나고 메인 세션이 화면 캡처(위 머리글)

## Phase 4 — 마무리 (Step 둘 병렬, Phase 3 뒤)

## TASK-10: 30 초진 = 재진
- Step: Phase 4 · Step 4.1 · 병렬
- AC: AC-813.1~AC-813.6
- REQ: REQ-813
- Files: src/lib/parsers/bit/columnMap.ts, src/lib/parsers/bit/columnMap.test.ts, src/lib/parsers/bit/parseBit.test.ts, src/workers/analyzeFiles.test.ts, src/components/stats/sections/RxPickTable.tsx, src/components/stats/sections/RxPickTable.test.tsx
- Tests: src/lib/parsers/bit/columnMap.test.ts, src/lib/parsers/bit/parseBit.test.ts, src/workers/analyzeFiles.test.ts, src/components/stats/sections/RxPickTable.test.tsx
- TDD: required — 이 TASK는 혼자 뺄 수 있다. 다른 TASK가 이 TASK에 기대지 않는다. `columnMap.ts:49` 주석을 고친다. AC-813.4의 마지막 문장은 새 시험 없이 `supabase/stats-rls.test.ts:574`가 증명한다. 시험 자료는 시험 안에서 만든 가짜 줄이다. `fixtures/`는 다시 만들지 않는다. AC-813.6은 `helperData.ts`를 Files에 넣지 않고 `columnMap.test.ts`에서 그 소스를 읽어 본다

## TASK-11: 개인정보 E2E
- Step: Phase 4 · Step 4.2 · 병렬
- AC: AC-814.1, AC-814.2
- REQ: REQ-814
- Files: e2e/rx-picker-privacy.spec.ts
- Tests: e2e/rx-picker-privacy.spec.ts
- TDD: exempt — 시험만 더한다. 대상 코드는 TASK-2·5·9에서 단위 시험을 통과했으므로 구현할 것이 없어 RED 단계가 없다. 시험이 헛돌지 않는지는 기대값 하나를 일부러 틀려 실패를 본 뒤 되돌려 확인한다(specs/stats TASK-17과 같은 방식). 기다림: 사용자가 TASK-1 SQL을 실제 Supabase에 붙임 + 시험 계정(`.env.local`). 그 전에는 파일만 쓰고 타입 검사까지 한다. 확인: `npm run e2e`(`next build`가 필요해 다른 일이 없을 때 돌린다)
