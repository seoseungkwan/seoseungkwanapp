# 작업 분할: 통계 같은 처방 재방문(F/U률)

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
>
> **할 순서**: Phase 1 → Phase 2 → Phase 3 → Phase 4. 같은 Phase의 Step은 **병렬**이다(수정 파일이 겹치지 않고 앞 Phase의 결과만 쓴다). Step마다 일꾼(subagent) 하나다.
>
> | Phase | Step | TASK | 하는 일 | 병렬 |
> |---|---|---|---|---|
> | 1 밑바탕 | 1.1 | TASK-1 | 저장 모양 타입과 검사 | 병렬 |
> | | 1.2 | TASK-2 | PC 안에서 같은 처방 재방문 세기 | 병렬 |
> | | 1.3 | TASK-3 | 고른 날 수 저장 표 SQL | 병렬 |
> | | 1.4 | TASK-4 | 계획 문서 줄 | 병렬 |
> | 2 저장·숫자 | 2.1 | TASK-5 | 날 숫자에 담기(파일·비트 두 길) | 병렬 |
> | | 2.2 | TASK-6 | 하루 줄 크기를 넘으면 `again`만 빼기 | 병렬 |
> | | 2.3 | TASK-7 | 고른 날 수 저장 코드, 오류 번호 | 병렬 |
> | | 2.4 | TASK-8 | 화면 숫자(순수 함수) | 병렬 |
> | 3 화면 조각 | 3.1 | TASK-9 | 훅 둘(고른 날 수, 넓은 날 줄) | 병렬 |
> | | 3.2 | TASK-10 | 같은 처방 재방문 묶음 화면 | 병렬 |
> | 4 잇기·마무리 | 4.1 | TASK-11 | 처방 골라 보기에 잇기 | 병렬 |
> | | 4.2 | TASK-12 | 개인정보 E2E 파일 | 병렬 |
>
> - 기댐: TASK-5는 TASK-1(`DayAgainPayload`·`AGAIN_WINDOWS`)과 TASK-2(`BucketStats.again`)를, TASK-6·7·8은 TASK-1의 타입을 쓴다. TASK-9는 TASK-7(`readAgainWindow`·`saveAgainWindow`)과 TASK-8(`againExtraSpan`·`needsExtra`)을, TASK-10은 TASK-8(`againView` 등)과 TASK-7의 오류 번호를 쓴다. TASK-11은 TASK-9·10을 잇는다
> - 파일이 겹치는 곳: 없다. TASK-10은 props만 받아 훅을 부르지 않고, TASK-11만 `RxPickerSection.tsx`를 고친다
> - 검사(TASK가 아님, 메인 세션): **각 Phase 끝에는 그 Phase의 시험 파일만** `npx vitest run <파일>`로 하나씩 돌리고 `npm run lint`까지 한다. 전체 `python3 ~/.claude/harness/bin/verify`는 Phase 2 끝과 Phase 4 끝에 돌린다. 어느 Phase 끝에도 타입 검사가 깨질 까닭은 없다(새 칸은 모두 있어도 되고 없어도 되는 칸이다). 이 서버는 2 CPU·스왑 없음이라 다른 일이 없을 때 하나씩 돌린다. `npm install`은 하지 않는다(새 패키지 없음)
> - Phase 4 끝: 390·1024·1440px 화면 캡처로 쪽이 옆으로 밀리지 않는지와 시안 휴대폰 네 줄 모양을 사진으로 보고 쉬운 말로 보고한다
> - 사용자 단계(design.md '사용자가 할 일'): TASK-3 SQL을 운영 Supabase에 붙여 넣기 → 사이트 올리기 → 비트에서 다시 불러오거나 파일 다시 넣기. 모두 사용자가 말할 때만. TASK-12를 실제로 돌리는 일은 SQL·시험 계정을 기다린다
> - 승인 시안: `docs/mockups/fu-rate/index.html`. 시안과 다른 곳은 `design.md` '시안과 다른 곳'을 따른다. 시험 자료는 모두 지어낸 값이고 실제 환자 파일·`.claude/uploads`를 열지 않는다. 가짜 비트 표는 시험 안에서 `fixtures/make-fake-fixtures.ts`의 `buildFakeBitTable`·`toCsvBytes`로 만들고 `fixtures/`는 고치지 않는다

## Phase 1 — 밑바탕 (화면 없음, Step 넷 병렬)

## TASK-1: 저장 모양 타입과 검사
- Step: Phase 1 · Step 1.1 · 병렬
- AC: AC-1303.1, AC-1303.2, AC-1303.3, AC-1303.4, AC-1303.5, AC-1303.6
- REQ: REQ-1303
- Files: src/types/payload.ts, src/lib/payload/validate.ts, src/lib/payload/validate.test.ts
- Tests: src/lib/payload/validate.test.ts
- TDD: required
- 할 일: design.md '타입'·'검사'. `validateDayPayload`는 `exactly(value, DAY_KEYS, ['again'])`로 받고 `again`이 있으면 `againOf(value.again, rx, partial)`, 없으면 돌려주는 객체에도 없다. 지금 시험(AC-008·AC-506 등)은 뜻을 바꾸지 않고 그대로 통과해야 한다. 환자 자료 구역 울타리(네트워크·console·저장소 없음)를 지킨다

## TASK-2: PC 안에서 같은 처방 재방문 세기
- Step: Phase 1 · Step 1.2 · 병렬
- AC: AC-1301.1, AC-1301.2, AC-1301.3, AC-1301.4, AC-1301.5, AC-1301.6, AC-1301.7, AC-1301.8
- REQ: REQ-1301
- Files: src/types/analysis.ts, src/lib/analytics/aggregate.ts, src/lib/analytics/aggregate.test.ts
- Tests: src/lib/analytics/aggregate.test.ts
- TDD: required
- 할 일: design.md '세기'. `BucketStats`에 `again?: RxAgain[]`(일 칸에만). 날 차이는 `diffDays`. 지금 시험의 일 칸 통째 비교(`toEqual`)에는 `again` 기대값만 더하고 다른 칸 기대값은 바꾸지 않는다(design.md '기존 명세·시험과의 관계'). 시험 환자·처방·날짜는 지어낸 값이다

## TASK-3: 고른 날 수 저장 표 SQL
- Step: Phase 1 · Step 1.3 · 병렬
- AC: AC-1305.1, AC-1305.2, AC-1305.3, AC-1305.4, AC-1305.5, AC-1305.6, AC-1305.7
- REQ: REQ-1305
- Files: supabase/migrations/20261105000300_stats_prefs.sql, supabase/statsPrefs.rls.test.ts
- Tests: supabase/statsPrefs.rls.test.ts
- TDD: required
- 할 일: design.md 'DB'의 SQL 그대로. 시험은 `supabase/rxPicks.rls.test.ts`와 같은 Supabase 흉내(역할·auth 스키마·새 표 기본 권한)로 PGlite에서 auth migration 다음에 이 파일을 돌리고, 통계·처방 골라 보기 migration이 먼저 있는 경우도 돌린다. 운영 Supabase에는 붙이지 않는다(사용자가 할 일)

## TASK-4: 계획 문서 줄
- Step: Phase 1 · Step 1.4 · 병렬
- AC: AC-1312.1, AC-1312.2, AC-1312.3
- REQ: REQ-1312
- Files: plan.md, docs/PRD.md
- TDD: exempt — 문서 두 곳에 정한 문장 세 줄을 더할 뿐이고 코드·시험이 없다. 확인은 메인 세션이 `grep`으로 세 문장이 글자 그대로 있는지 본다
- 할 일: AC의 문장을 글자 그대로 넣는다. 다른 줄은 고치지 않는다

## Phase 2 — 저장·숫자 (Step 넷 병렬)

## TASK-5: 날 숫자에 담기(파일·비트 두 길)
- Step: Phase 2 · Step 2.1 · 병렬
- AC: AC-1302.1, AC-1302.2, AC-1302.3, AC-1302.4, AC-1302.5
- REQ: REQ-1302
- Files: src/lib/payload/toDayPayloads.ts, src/lib/payload/toDayPayloads.test.ts, src/workers/analyzeFiles.test.ts, src/workers/stats/jobs.test.ts
- Tests: src/lib/payload/toDayPayloads.test.ts, src/workers/analyzeFiles.test.ts, src/workers/stats/jobs.test.ts
- TDD: required
- 할 일: design.md '날 숫자'. `ready`는 `coverage.ts`의 `bucketState`와 `dates.ts`의 `addDays`로 낸다. `toDayPayloads.test.ts`의 '하루 칸 숫자 그대로'·'모든 층의 열쇠' 시험에 `again`을 더한다(stats-core AC-008.2 열쇠 목록을 AC-1302.2가 대신함). `analyzeFiles.test.ts`·`jobs.test.ts`에는 AC-1302.3·1302.4 시험만 더하고 지금 시험은 고치지 않는다. `analyzeFiles.ts`·`jobs.ts`·`helperData.ts`는 고치지 않는다

## TASK-6: 하루 줄 크기를 넘으면 `again`만 빼기
- Step: Phase 2 · Step 2.2 · 병렬
- AC: AC-1304.1, AC-1304.2
- REQ: REQ-1304
- Files: src/lib/storage/stats.ts, src/lib/storage/stats.test.ts
- Tests: src/lib/storage/stats.test.ts
- TDD: required
- 할 일: design.md '크기'. 크기는 지금의 `jsonbText`로 잰다. 달 줄·덮은 기간·읽기는 바꾸지 않는다. 시험의 큰 날 줄은 지어낸 처방 코드로 만든다

## TASK-7: 고른 날 수 저장 코드, 오류 번호
- Step: Phase 2 · Step 2.3 · 병렬
- AC: AC-1306.1, AC-1306.2, AC-1306.3, AC-1306.4
- REQ: REQ-1306
- Files: src/lib/storage/statsPrefs.ts, src/lib/storage/statsPrefs.test.ts, src/types/db.ts, src/lib/errors.ts, src/types/errors.ts, src/lib/errors.test.ts
- Tests: src/lib/storage/statsPrefs.test.ts, src/lib/errors.test.ts
- TDD: required
- 할 일: design.md '저장 코드'. `rxPicks.ts`와 같은 틀이고 시험은 가짜 `client`를 넣는다(실제 Supabase에 붙지 않는다). AC-1306.4는 소스 글자 시험이다(`eslint.config.mjs`의 저장 코드 울타리는 `stats.ts`만 덮는다)

## TASK-8: 화면 숫자(순수 함수)
- Step: Phase 2 · Step 2.4 · 병렬
- AC: AC-1307.1, AC-1307.2, AC-1307.3, AC-1307.4, AC-1307.5, AC-1307.6, AC-1307.7, AC-1307.8, AC-1307.9
- REQ: REQ-1307
- Files: src/components/stats/againView.ts, src/components/stats/againView.test.ts
- Tests: src/components/stats/againView.test.ts
- TDD: required
- 할 일: design.md '화면 숫자'. 기간은 `statsRange`(`view.ts`)로 만들고 오늘은 `range.load.to`다. `rateText`·`codeKey`는 불러 쓰고 `view.ts`·`rxPickView.ts`는 고치지 않는다. 시험의 날 줄은 지어낸 `DayPayload`(`again` 있음·없음 섞음)다

## Phase 3 — 화면 조각 (Step 둘 병렬)

## TASK-9: 훅 둘(고른 날 수, 넓은 날 줄)
- Step: Phase 3 · Step 3.1 · 병렬
- AC: AC-1308.1, AC-1308.2, AC-1308.3, AC-1308.4, AC-1308.5
- REQ: REQ-1308
- Files: src/components/stats/useAgainWindow.ts, src/components/stats/useAgainWindow.test.ts, src/components/stats/useAgainDays.ts, src/components/stats/useAgainDays.test.ts
- Tests: src/components/stats/useAgainWindow.test.ts, src/components/stats/useAgainDays.test.ts
- TDD: required
- 할 일: design.md '훅'. 시험은 `@/lib/storage/statsPrefs`·`@/lib/storage/stats`를 가짜로 바꾸고 답을 잡아 두었다 푼다(`useRxPicks.test.ts`와 같은 방법). AC-1308.5는 세 파일의 소스 글자 시험이다

## TASK-10: 같은 처방 재방문 묶음 화면
- Step: Phase 3 · Step 3.2 · 병렬
- AC: AC-1309.1, AC-1309.2, AC-1309.3, AC-1309.4, AC-1309.5, AC-1309.6, AC-1309.7, AC-1309.8, AC-1309.9, AC-1309.10, AC-1309.11, AC-1309.12
- REQ: REQ-1309
- Files: src/components/stats/sections/RxPickAgain.tsx, src/components/stats/sections/RxPickAgain.test.tsx
- Tests: src/components/stats/sections/RxPickAgain.test.tsx
- TDD: required
- 할 일: 시안 `docs/mockups/fu-rate/index.html`의 `.again` 부분을 앱 토큰·`ds` 클래스로 옮긴다(design.md '화면'·'시안과 다른 곳'). props만 받고 훅·저장 코드를 부르지 않는다. 오류 카드는 `ErrorCard`, 상자 검사는 `@/testing/boxes`의 `nestedBoxes`. 컴포넌트 시험은 클래스만 볼 수 있다 — 실제 폭 모양은 Phase 4 끝 사진으로 본다

## Phase 4 — 잇기·마무리 (Step 둘 병렬)

## TASK-11: 처방 골라 보기에 잇기
- Step: Phase 4 · Step 4.1 · 병렬
- AC: AC-1310.1, AC-1310.2, AC-1310.3, AC-1310.4, AC-1310.5
- REQ: REQ-1310
- Files: src/components/stats/sections/RxPickerSection.tsx, src/components/stats/sections/RxPickerSection.test.tsx, src/components/stats/StatsScreen.test.tsx, src/components/stats/sections/PeriodSummary.test.tsx
- Tests: src/components/stats/sections/RxPickerSection.test.tsx, src/components/stats/StatsScreen.test.tsx, src/components/stats/sections/PeriodSummary.test.tsx
- TDD: required
- 할 일: design.md '화면'의 `RxPickerSection.tsx` 줄. 세 시험 파일에는 `@/lib/storage/statsPrefs` 가짜(`readAgainWindow` → null, `saveAgainWindow` → 성공)를 더하고 설명 글 한 곳(`StatsScreen.test.tsx:1608`·`RxPickerSection.test.tsx:44`)만 바꾼다. 다른 지금 시험은 뜻을 바꾸지 않고 그대로 통과해야 한다(특히 rx-picker AC-802.5의 `readDays` 횟수, AC-514.9 저장소·주소 검사). `StatsSections.tsx`·`StatsScreen.tsx`는 고치지 않는다

## TASK-12: 개인정보 E2E 파일
- Step: Phase 4 · Step 4.2 · 병렬
- AC: AC-1311.1, AC-1311.2
- REQ: REQ-1311
- Files: e2e/fu-rate-privacy.spec.ts
- Tests: e2e/fu-rate-privacy.spec.ts
- TDD: exempt — 시험만 더한다. 대상 코드는 TASK-1·2·5·7·11에서 단위 시험을 통과했으므로 구현할 것이 없어 RED 단계가 없다. 시험이 헛돌지 않는지는 기대값 하나를 일부러 틀려 실패를 본 뒤 되돌려 확인한다(specs/rx-picker TASK-11과 같은 방식). 기다림: 사용자가 TASK-3 SQL을 운영 Supabase에 붙임 + 시험 계정(`.env.local`). 그 전에는 파일만 쓰고 타입 검사까지 한다. 확인: `npm run e2e -- e2e/fu-rate-privacy.spec.ts`(`next build`가 필요해 다른 일이 없을 때)
- 할 일: `e2e/rx-picker-privacy.spec.ts`와 같은 방법(가짜 비트 표, 요청 주소·본문 검사, 머리 `authorization`·`apikey`·`cookie`는 읽지도 찍지도 않음, `test.use({ trace: 'off', video: 'off', screenshot: 'off' })`). 그 파일과 `e2e/lib/*`는 고치지 않는다. 끝나면 고른 처방을 지우고 고른 날 수를 시험 전 값으로 돌린다
