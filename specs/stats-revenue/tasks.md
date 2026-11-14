# 작업 분할: 매출을 통계에 섞기

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- AC:`, `- Files:`(수정 범위), `- Tests:`, `- TDD: required|exempt`, `- 차례:`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다(지우는 파일도 Files에 있다). 작업 하나는 한 모듈·한 레이어만 다룬다.
> 시험 이름에 이 명세 AC ID를 넣는다. 지금 시험의 기대값을 고칠 때는 이 명세가 바꾸는 글·구조만 고치고 그 시험 이름에 바꾼 AC ID를 더한다(AC-4111.1).
> 도우미 C# 시험은 `PATH="$HOME/.dotnet:$PATH"`를 앞에 붙여 돌린다(예: `PATH="$HOME/.dotnet:$PATH" npx vitest run helper/tests/revenue-read.dotnet.test.ts`).

## 할 순서
- 먼저 할 일(코드 작업 아님): 사용자가 `/sdd approve stats-revenue`를 입력한다
- Phase 1 (병렬 2): TASK-1 도우미 ‖ TASK-2 Supabase — 파일이 겹치지 않는다
- Phase 2 (병렬 2, Phase 1 뒤): TASK-3 웹 자료 길 ‖ TASK-4 매출 셈(순수)
- Phase 3 (병렬 2, Phase 2 뒤): TASK-5 칸 부품 ‖ TASK-6 불러오기 훅
- Phase 4 (병렬 2, Phase 3 뒤): TASK-7 화면 잇기 ‖ TASK-8 매출 탭 없애기
- 마지막 검사(코드 작업 아님): 맨 끝 '마지막 검사'
- 병렬인 두 TASK는 서로의 파일을 고치지 않는다. 옛 매출 화면은 TASK-8까지 그대로 돌아 단계마다 전체 시험이 초록이다

## 사용자 할 일 (차례가 중요)
1. **SQL 붙여넣기** — TASK-2가 합쳐진 뒤, 웹을 올리기 전 아무 때나. Claude가 `supabase/migrations/20261114000000_sales_day_codes.sql`의 주석 뺀 사본을 건네면 Supabase → SQL Editor → 새 질의 → 통째로 붙여 Run → "Success"를 알려 준다. Claude는 `ssk-supabase-sql` 기술 3번(anon으로 `sales_day_codes`가 `401`/`42501`인지)으로 확인하고 배포 전(ssk-deploy 1번)에 다시 본다
2. **웹 배포** — 마지막 검사가 끝나고 사용자가 "배포해"라고 할 때(ssk-deploy)
3. **새 도우미(0.6.0) 설치** — **웹 배포가 끝난 뒤에만**. 지금 운영 웹은 새 도우미의 답(열쇠 셋)을 거부해 매출·업무일지 비트 칸이 깨진다(design.md 위험 1). Claude가 `ssk-clinic-pc-files` 기술로 설치 파일을 만들어 건넨다(정식 판은 사용자가 "판 만들어"라고 할 때 태그 `helper-v0.6.0`). 사용자가 의원 PC에 깐다
4. **처음 한 번 불러오기** — 새 도우미를 깐 뒤 통계에서 [비트에서 불러오기]. 날 단위 처방 금액이 없는 날을 모두 다시 읽어 처음 한 번은 오래 걸린다(최근 30일 보기 25초쯤, 전체 기간 13분쯤 더)

## TASK-1: 도우미 — 날마다 처방별 금액(`dayCodes`) · 판 0.6.0
- REQ: REQ-4101
- AC: AC-4101.1, AC-4101.2, AC-4101.3, AC-4101.4, AC-4101.5
- Files: helper/src/Precheck.Core/Revenue/RevenueSql.cs, helper/src/Precheck.Core/Revenue/RevenueDays.cs, helper/tests/Precheck.Core.Tests/Revenue/RevenueSql.test.cs, helper/tests/Precheck.Core.Tests/Revenue/RevenueDays.test.cs, helper/tests/Precheck.Core.Tests/Revenue/RevenueFakes.test.cs, helper/tests/Precheck.Core.Tests/Revenue/RevenueCommands.test.cs, helper/tests/revenue-read.dotnet.test.ts, helper/Directory.Build.props, src/lib/bridge/versions.ts, src/lib/bridge/handshake.test.ts, src/lib/bridge/client.test.ts, helper/tests/input-wiring.dotnet.test.ts
- Tests: helper/tests/revenue-read.dotnet.test.ts, helper/tests/input-wiring.dotnet.test.ts, src/lib/bridge/handshake.test.ts, src/lib/bridge/client.test.ts
- TDD: required — C# 시험(이름에 AC ID): 새 문장 `CodeAmountsByDay`가 `CodeAmounts`와 SELECT 첫 칸·GROUP BY 줄만 다르고(WHERE·금액 식·MissingValues 글자 같음) 이름 하위 질의·환자 칸이 없음, 매개변수 표 `@from`·`@to`·`@hospital`, 관문 통과·바꾼 문장 거부 · `Read`가 기간에 한 번만 부르고 지금 문장 차례·날마다 문장 수는 그대로 · 가짜 DB 줄로: 날짜·코드 차례, 공백 합침, 모양 틀림·`_REST` → 그날 `_REST`, 301개인 날 → 299 + `_REST`(금액 null 맨 뒤), 원 미만 버림, MissingValues → null, 기간 밖 날 → 읽기 실패, 새 문장 실패 → 오류 하나(일부 답 없음) · `RevenueCommands` 답 JSON이 `{"days":…,"codes":…,"dayCodes":[["2026-10-01","MM101",3,45000],…]}` 모양. vitest 감싸개에 새 AC 다섯 줄. 판: `Directory.Build.props`·`LATEST_HELPER` 0.6.0, `MIN_HELPER` 0.3.0, `commands.json` 그대로(handshake·client·input-wiring 시험의 0.5.1 → 0.6.0). 지금 시험 가운데 바꾸는 것: `RevenueCommands.test.cs`의 답 모양(열쇠 둘 → 셋), 판 번호 박힌 세 시험
- 차례: Phase 1 (TASK-2와 병렬)

## TASK-2: Supabase — `sales_day_codes` · `day_codes` · 저장·합계 함수 · RLS 시험
- REQ: REQ-4103
- AC: AC-4103.1, AC-4103.2, AC-4103.3, AC-4103.4, AC-4103.5, AC-4103.6
- Files: supabase/migrations/20261114000000_sales_day_codes.sql, supabase/salesDayCodes.rls.test.ts
- Tests: supabase/salesDayCodes.rls.test.ts, supabase/revenue.rls.test.ts
- 돌리기만 하는 시험(고치지 않음): `supabase/revenue.rls.test.ts`(옛 표 그대로, AC-4103.6)
- TDD: required — PGlite에 auth → revenue → 새 파일(지금 RLS 시험과 같은 Supabase 흉내): 파일을 두 번 실행해도 오류 없음 · 칸·기본 키·제약(날·코드 모양·건수·금액) · `day_codes` 기본 거짓 · RLS 켜짐 · anon 표 읽기/넣기/지우기·함수 둘 실행 막힘 · authenticated 칸 권한(넣기 네 칸, 고치기 없음, `day_codes` 넣기·고치기) · A/B 자기 줄만 · 대기·거절 아무것도 못 함 · 저장 함수: 날 줄 upsert·`day_codes` 참/거짓·범위 코드 줄 지우고 넣기·옛 도우미(null)면 코드 줄 없음, 거부 여섯(시작 > 끝 · 31일 넘음 · 날 줄 수 다름 · 범위 밖 날 · 같은 날 같은 코드 · 칸 제약) 뒤 두 표 그대로 · 부른 사람 권한·`search_path` 빔 · 합계 함수: 코드마다 건수 합·금액 합(null 뺌)·빠짐 표시, B 줄 안 더함, 범위 밖 안 더함 · `sales_codes`·`rx_groups` 그대로. 실제 Supabase에는 붙지 않는다
- 차례: Phase 1 (TASK-1과 병렬)

## TASK-3: 웹 자료 길 — 답 검사 · 저장소 새 함수 · 빈 날 읽기 차례
- REQ: REQ-4102, REQ-4104
- AC: AC-4102.1, AC-4102.2, AC-4102.3, AC-4104.1, AC-4104.2, AC-4104.3, AC-4104.4
- Files: src/types/revenue.ts, src/lib/bridge/revenueResult.ts, src/lib/bridge/revenueResult.test.ts, src/lib/bridge/revenueCall.test.ts, src/lib/storage/revenue.ts, src/lib/storage/revenue.test.ts, src/lib/revenue/sync.ts, src/lib/revenue/sync.test.ts, src/components/worklog/useBitFill.test.tsx
- Tests: src/lib/bridge/revenueResult.test.ts, src/lib/bridge/revenueCall.test.ts, src/lib/storage/revenue.test.ts, src/lib/revenue/sync.test.ts, src/components/worklog/useBitFill.test.tsx, src/components/worklog/WorklogScreen.test.tsx, src/lib/worklog/bitFill.test.ts, src/components/revenue/RevenueScreen.test.tsx
- 돌리기만 하는 시험(고치지 않음): 업무일지 `WorklogScreen.test.tsx`·`bitFill.test.ts`, 옛 매출 화면 `RevenueScreen.test.tsx`(옛 함수가 남아 그대로 통과)
- TDD: required — 검사: 옛 모양·새 모양 받음, 넷째 열쇠 거부, `dayCodes` 거부 아홉(배열 아님 · 칸 셋/다섯 · `days`에 없는 날 · 코드 모양 · 같은 날 같은 코드 · 하루 301줄 · 9,301줄 · 건수 음수/소수 · 금액 글자) 각각 `E-BRIDGE-BAD-REPLY`, `call` 통로로도 같음 · 업무일지 `useBitFill`이 `dayCodes`가 든 답으로 지금과 같은 칸을 채움 · 저장소(가짜 Supabase 클라이언트): `saveRange`가 rpc 이름·인자 넷(정해 둔 열다섯 칸·`{day, code, count, amount}`·옛 도우미 null)만 보냄, 실패 `E-REVENUE-SAVE-FAILED`(서버 글 버림), `loadDays`·`codeTotals`·`monthCodes`가 1,000줄씩 빈 쪽까지·실패 `E-STATS-READ-FAILED` · `planRevenue`: 빈 날·`day_codes` 거짓·어제·진료 끝 오늘, 마지막 끝난 날 뒤 없음, 이어진 날 31일 덩어리, 새것부터, 고를 날 없으면 빈 목록 · `syncRanges`: 한 번에 하나, 덩어리만 실패 번호 셋은 계속, 그 밖 번호 멈춤(남은 덩어리 안 부름), `dayCodes` 없으면 `noDayCodes`, 진행 알림, 번호 없는 오류 글 안 옮김. 옛 `saveMonth`·`loadRevenue`·`planFetch`·`syncRevenue`와 그 시험은 그대로 둔다(TASK-8에서 지움)
- 차례: Phase 2 (TASK-4와 병렬)

## TASK-4: 매출 셈 — 통계 기간·비교·막대 칸·나눔·치료별 (순수)
- REQ: REQ-4105
- AC: AC-4105.1, AC-4105.2, AC-4105.3, AC-4105.4, AC-4105.5, AC-4105.6
- Files: src/components/stats/revenueView.ts, src/components/stats/revenueView.test.ts, src/lib/revenue/summary.ts, src/lib/revenue/summary.test.ts, src/lib/revenue/treatments.ts, src/lib/revenue/treatments.test.ts, src/components/revenue/types.ts, src/components/revenue/view.ts
- Tests: src/components/stats/revenueView.test.ts, src/lib/revenue/summary.test.ts, src/lib/revenue/treatments.test.ts, src/components/revenue/view.test.ts, src/components/revenue/parts.test.tsx
- 돌리기만 하는 시험(고치지 않음): `components/revenue/view.test.ts`·`parts.test.tsx`(보기 타입을 `types.ts`로 옮기고 `view.ts`가 다시 내보내도 그대로, 폴더 소스 규칙이 새 `types.ts`를 본다)
- TDD: required — 합성 날 줄로(이름·숫자 지어냄): `revenueCells` 네 칸 글(시안 숫자 1억 3,261만 · 진료한 날 25일 평균 530만 원 · 57,333원 · 매출 ÷ 접수 2,313건 · 1일 · 10월 28일 · … · ▲ 60만 원 (+0.4%) 늘어남 · 지난 30일 매출 1억 3,200만 원), 확인 필요한 날 없음·줄어듦·변화 없음·견주지 않음·자료 없음·읽는 중·읽기 실패 · 진료한 날(쉬는 날·확인 필요한 날 뺌)·하루 평균·건당 원 미만 버림 · 비교: 바로 전 기간, 12개월 끝나지 않은 달 짝 뺌, 저장 안 한 날이 있으면 없음, 비율 버림 · 막대 칸: 7·30·90일 하루씩, 12개월 달·끝나지 않은 달 partial, 고른 기간 일·주·달, 휴진·저장 안 한 날 칸 없음, 확인 필요한 날 `no-data`, 만 원·천 원 아래 버림, `dense` 31칸 넘음 · 아래 글(기본값 7) · 급여 표 줄·몫·머리(작년 비교면 `작년 같은 때보다` 칸)·나눔 못 한 날이면 `합계`·비교 `–`·안내 줄, 그림 칸 단위·제목(날마다·주마다·달마다) · 치료별: 넣는 처방만·대소문자 무시·첫 묶음만·그 밖 처방 맨 뒤·`처방 n번`·금액 0 묶음 뺌·모르는 금액 `–`·옛 달 합계(통째 달, 그 달 날 단위 없음)·빠진 날 안내·묶음 읽는 중/실패·제안 묶음·셀 날 없음 글 두 가지 · 탭 설명 넷·[어떻게 세나요?] 문단(시안 글 그대로, 기본값 1·2·8) · 날짜 글 규칙(기본값 10) · 소스에 네트워크·저장소·React 없음. `summary.ts`: `workDays` 시험. `treatments.ts`: 대소문자 다른 코드가 같은 묶음으로 들어감. 지금 시험 가운데 바꾸는 것: `summary.test.ts`의 `PeriodSum` 모양 기대값(`workDays` 칸 더함)
- 차례: Phase 2 (TASK-3과 병렬)

## TASK-5: 칸 부품 — 매출 칸 · 탭 부품 넘김 값 · 기간 요약 둘째 줄 · 원장님별 이름
- REQ: REQ-4106, REQ-4107, REQ-4109
- AC: AC-4106.1, AC-4106.2, AC-4106.3, AC-4106.4, AC-4107.1(칸 안 구조), AC-4107.2, AC-4107.3, AC-4107.4, AC-4107.5, AC-4107.6, AC-4107.7, AC-4107.8, AC-4107.9, AC-4107.10, AC-4109.2
- Files: src/components/stats/sections/RevenueSection.tsx, src/components/stats/sections/RevenueSection.test.tsx, src/components/stats/sections/RxSection.tsx, src/components/stats/sections/RxSection.test.tsx, src/components/stats/sections/PeriodSummary.tsx, src/components/stats/sections/PeriodSummary.test.tsx, src/components/stats/sections/DoctorsSection.tsx, src/components/stats/sections/DoctorsSection.test.tsx, src/lib/analytics/doctorStats.ts, src/lib/analytics/doctorStats.test.ts, src/components/revenue/RevenueSplit.tsx
- Tests: src/components/stats/sections/RevenueSection.test.tsx, src/components/stats/sections/RxSection.test.tsx, src/components/stats/sections/PeriodSummary.test.tsx, src/components/stats/sections/DoctorsSection.test.tsx, src/lib/analytics/doctorStats.test.ts, src/components/ui/classes.test.ts, src/components/revenue/parts.test.tsx
- 돌리기만 하는 시험(고치지 않음): `ui/classes.test.ts`(새 파일 클래스 규칙) · `revenue/parts.test.tsx`(`SplitTable` 내보내기만 더해도 그대로)
- TDD: required — `RevenueSection`(revenueView 값을 손으로 만든 가짜로): h2 `매출`·tablist `매출 보기`·탭 넷 차례·처음 첫 탭·키 ← → Home End·고르지 않은 패널 hidden·패널 안 상태(펼친 [어떻게 세나요?])가 탭을 옮겼다 와도 남음 · 탭 설명이 머리 줄에서 바뀜 · 패널 넷의 글·차례(첫 줄·막대 단위·화면 읽기 표·아래 글·안내 줄·숫자 칸 셋·순위 막대 `처방 471번`·급여 표 머리·그림 제목·범례) · [묶음 고치기]·`제안 묶음` 칩 없음 · 자료 없음(설명·탭 없음, 한 줄) · 읽는 중 · 읽기 실패 카드와 [다시 읽기] → `onReread` · 예전 판 노란 줄 `role="note"`·`/settings` 링크·치료별 두 줄 · 저장소·주소를 쓰지 않음. `RxSection`: `title`·`label`·`notice`(기본값은 지금 글자 — 지금 시험 그대로 통과), notice 자리가 머리 줄과 탭 줄 사이. `PeriodSummary`: `revenue`가 있으면 둘째 줄 네 칸(글·작은 `원`·색 `text-warning`/`text-positive`/`text-negative`·첫 줄과 같은 칸 클래스·휴대폰 2칸 × 2줄), 없으면 지금 마크업 그대로, 고른 기간 이름. `DoctorsSection`·`doctorStats`: 머리 `건당 진료비`·[표 복사] 머리·[어떻게 세나요?] 끝 두 문장, 숫자 그대로. 지금 시험 가운데 바꾸는 것: `DoctorsSection.test.tsx`·`doctorStats.test.ts`의 `1인당 진료비` 글
- 차례: Phase 3 (TASK-6과 병렬)

## TASK-6: 불러오기 훅 — 매출 읽기·저장 상태 · 같은 연결 · 불러오기 글
- REQ: REQ-4104, REQ-4108
- AC: AC-4104.4(훅이 읽는 범위), AC-4108.1, AC-4108.2(같은 연결), AC-4108.3(글), AC-4108.5(실패 상태 값), AC-4108.6, AC-4108.7
- Files: src/components/stats/useStatsRevenue.ts, src/components/stats/useStatsRevenue.test.ts, src/components/stats/useStatsWorker.ts, src/components/stats/useStatsWorker.test.ts, src/components/stats/SourcePicker.tsx, src/components/stats/SourcePicker.test.tsx, src/components/stats/loadPlan.ts, src/components/stats/loadPlan.test.ts
- Tests: src/components/stats/useStatsRevenue.test.ts, src/components/stats/useStatsWorker.test.ts, src/components/stats/SourcePicker.test.tsx, src/components/stats/loadPlan.test.ts
- TDD: required — `useStatsRevenue`(저장소 가짜·`call` 가짜): 열 때 `readSpan(range)` 날 줄·보는 기간 합계·달 합계를 한 번 읽음(비트 부르지 않음), 기간을 바꾸면 다시 읽고 늦은 앞 답은 버림, 실패면 `read-failed`·[다시 읽기] · `sync`: 저장된 날 표시로 계획 → 덩어리 차례로 부르고 저장 → `progress` 1/n…n/n → 끝나면 다시 읽음, 실패·멈춤이면 `failure`(처음 번호·전에 저장한 끝날, 없으면 null), `dayCodes` 없으면 `noDayCodes`, 다시 성공하면 `failure` 지움, `call` null이면 아무것도 안 함, 거절하지 않음, 브라우저 저장소에 쓰지 않음. `useStatsWorker`: `revenueDays`가 통계가 쥔 같은 `useBridge`의 `call('revenue.days', {from, to})`이고 `useBridge`는 한 번만 불림. `loadPlan`: `loadHint` 첫 줄 끝 두 모양(함께 읽어요 · 나눠 읽어요), `REVENUE_HINT`, `revenueProgressText(1,1)` = 시안 글·`(…, 3, 13)` = 기본값 12. `SourcePicker`: 펼친 칸에 안내 첫 줄 다음 `REVENUE_HINT` 한 줄. 지금 시험 가운데 바꾸는 것: `loadPlan.test.ts`·`SourcePicker.test.tsx`의 안내 첫 줄 기대 글(`을 읽어요.` → `의 환자·처방·매출을 함께 읽어요.`)
- 차례: Phase 3 (TASK-5와 병렬)

## TASK-7: 화면 잇기 — 칸 차례 · 목차 열 개 · 불러오기 뒤 매출 · 매출만 실패 상자
- REQ: REQ-4107, REQ-4108, REQ-4109, REQ-4111
- AC: AC-4107.1(자리), AC-4108.2, AC-4108.3, AC-4108.4, AC-4108.5, AC-4108.6, AC-4108.7, AC-4109.1, AC-4111.1
- Files: src/components/stats/StatsScreen.tsx, src/components/stats/StatsScreen.test.tsx, src/components/stats/sections/StatsSections.tsx, src/components/stats/StatsToc.tsx, src/components/stats/StatsToc.test.tsx, src/components/stats/sections/PeriodSummary.test.tsx, e2e/rx-picker-privacy.spec.ts, e2e/fu-rate-privacy.spec.ts, e2e/treatment-trend-privacy.spec.ts
- Tests: src/components/stats/StatsScreen.test.tsx, src/components/stats/StatsToc.test.tsx, src/components/stats/sections/PeriodSummary.test.tsx, src/app/(app)/stats/page.test.tsx
- 돌리기만 하는 시험(고치지 않음): `(app)/stats/page.test.tsx`
- TDD: required — `StatsScreen`(지금 가짜 통로 + 매출 저장소 가짜): h2 열 차례·`매출` 12칸·불러오는 중 칸 열 · 목차 링크 열 개·`매출` href = `#stats-revenue` = 칸 id · 기간 요약 둘째 줄이 매출 저장 숫자로 그려짐 · [비트에서 불러오기] → 통계 조각 저장 다음에만 `revenue.days`(같은 가짜 통로, 두 번째 연결 없음) → 저장 → 다시 읽은 숫자 · 그동안 읽는 중 줄 글·단추 막힘 · 첫 조각 실패·확인 필요 기록·저장 실패·나눠 읽기 멈춤이면 `revenue.days`를 부르지 않음, [이어서 불러오기]가 끝나면 부름 · 매출 덩어리 실패 → 띠 아래 상자 글·[매출만 다시 읽기] → 매출만 다시(통계 조각은 다시 안 읽음, 다른 안내 안 지움) · `dayCodes` 없는 답 → 예전 판 줄 · 확장 없음이면 비트 매출 읽기 없음 · 열기만 해서는 `revenue.days` 없음 · 통계 저장 줄·Worker 요청 모양 시험 그대로. `StatsToc`: `TOC_LINKS` 열 개. `PeriodSummary.test.tsx`의 `StatsSections` 칸 제목 목록(매출 prop을 주면 열, 안 주면 지금 아홉). 지금 시험 가운데 바꾸는 것: `StatsScreen` `SECTIONS`·기다리는 칸·목차 링크 수, `StatsToc` 링크 아홉 기대값. E2E 셋은 칸 수·목차 수를 세는 곳만 고친다(SQL을 붙이고 `.env.local`이 있을 때 `npm run e2e`)
- 차례: Phase 4 (TASK-8과 병렬)

## TASK-8: 매출 탭 없애기 — 메뉴 · `/revenue` 넘기기 · 대시보드 목차 · 미리보기 · 매출 화면과 매출 묶음 지우기 · 문서
- REQ: REQ-4110, REQ-4111
- AC: AC-4110.1, AC-4110.2, AC-4110.3, AC-4110.4, AC-4110.5, AC-4111.2
- Files: src/components/shell/menu.ts, src/components/shell/shell.test.tsx, src/app/(app)/tabFrame.test.tsx, src/app/(app)/notReadyPages.test.tsx, src/app/titles.test.tsx, src/app/notFound.test.tsx, next.config.ts, src/components/dashboard/briefing/features.ts, src/components/dashboard/briefing/features.test.ts, src/components/dashboard/briefing/DashboardHome.test.tsx, src/components/preview/sample.ts, src/components/preview/sample.test.ts, src/components/preview/DashboardPreview.test.tsx, src/components/common/notReadyFeatures.test.ts, src/app/(app)/revenue/page.tsx, src/app/(app)/revenue/page.test.tsx, src/components/revenue/RevenueScreen.tsx, src/components/revenue/RevenueScreen.test.tsx, src/components/revenue/RevenueStates.tsx, src/components/revenue/RevenueRange.tsx, src/components/revenue/RevenueRange.test.tsx, src/components/revenue/range.ts, src/components/revenue/range.test.ts, src/components/revenue/RevenueTrend.tsx, src/components/revenue/RevenuePerVisit.tsx, src/components/revenue/RevenueTreatments.tsx, src/components/revenue/view.ts, src/components/revenue/view.test.ts, src/components/revenue/groups/GroupEditor.tsx, src/components/revenue/groups/GroupEditor.test.tsx, src/components/revenue/groups/DeleteGroupDialog.tsx, src/components/revenue/groups/known.ts, src/components/revenue/groups/names.ts, src/components/revenue/MonthBars.tsx, src/components/revenue/RevenueSplit.tsx, src/components/revenue/RevenueParts.tsx, src/components/revenue/TreatmentBars.tsx, src/components/revenue/parts.test.tsx, src/lib/storage/rxGroups.ts, src/lib/storage/rxGroups.test.ts, src/lib/storage/revenue.ts, src/lib/storage/revenue.test.ts, src/lib/revenue/sync.ts, src/lib/revenue/sync.test.ts, src/lib/revenue/summary.ts, src/lib/revenue/summary.test.ts, src/lib/revenue/treatments.ts, src/lib/revenue/treatments.test.ts, src/components/stats/sections/TreatmentTrendSection.test.tsx, docs/ARCHITECTURE.md, plan.md, docs/revenue/pc-check.md
- Tests: src/components/shell/shell.test.tsx, src/app/(app)/tabFrame.test.tsx, src/app/(app)/notReadyPages.test.tsx, src/app/titles.test.tsx, src/app/notFound.test.tsx, src/components/dashboard/briefing/features.test.ts, src/components/dashboard/briefing/DashboardHome.test.tsx, src/components/preview/sample.test.ts, src/components/preview/DashboardPreview.test.tsx, src/components/common/notReadyFeatures.test.ts, src/components/revenue/parts.test.tsx, src/components/revenue/money.test.ts, src/lib/storage/revenue.test.ts, src/lib/revenue/sync.test.ts, src/lib/revenue/summary.test.ts, src/lib/revenue/treatments.test.ts, src/components/stats/sections/TreatmentTrendSection.test.tsx, src/lib/storage/statsRxGroups.test.ts, src/lib/csp.test.ts, src/guardrails.test.ts, src/components/ui/classes.test.ts
- 돌리기만 하는 시험(고치지 않음): `money.test.ts` · `statsRxGroups.test.ts`(AC-1203.5 소스 울타리) · `csp.test.ts`(머리 줄 그대로) · `guardrails.test.ts` · `ui/classes.test.ts`
- 지우는 파일(Files에 있음): `(app)/revenue/page.tsx`·`page.test.tsx` · `RevenueScreen.tsx`·`.test.tsx` · `RevenueStates.tsx` · `RevenueRange.tsx`·`.test.tsx` · `range.ts`·`range.test.ts` · `RevenueTrend.tsx` · `RevenuePerVisit.tsx` · `RevenueTreatments.tsx` · `view.ts`·`view.test.ts` · `groups/` 다섯 파일 · `lib/storage/rxGroups.ts`·`.test.ts`
- TDD: required — 먼저 실패하는 시험: 탭 열둘·주요 넷·`매출` 없음·미리보기 탭 = 탭 목록(12, `DashboardPreview` span 12) · `next.config` `redirects()`에 `{ source: '/revenue', destination: '/stats', permanent: false }` 하나 · `/revenue` 페이지 파일 없음(`notFound.test.tsx` 라우트 표에서 빼고 '없음'을 봄) · 대시보드 목차 `매출` 없음·통계 설명(기본값 17)·상태 수는 목록에서 셈 · 지운 파일이 없고 `src/` 어느 소스도 `components/revenue/RevenueScreen`·`components/revenue/groups`·`components/revenue/view`·`lib/storage/rxGroups`를 불러오지 않음, 남는 부품(`KpiRow`·`NoticeLine`·`DeltaCell`·`TreatmentBars`·`SplitTable`·`StackBars`·`formatManWon`)은 있음(`parts.test.tsx`) · 남는 부품의 보기 타입은 `./types`에서 옴. 그다음 지우기·줄이기: 매출 화면 파일, `MonthBars.tsx`는 `StackBars`만, `RevenueSplit.tsx`는 `SplitTable`만, 저장소 옛 `saveMonth`·`loadRevenue`, 차례 옛 `planFetch`·`spanMonths`·`syncRevenue`·`ALL_FROM_MONTH`·`FetchSpan`, `summary.ts`의 `periodsFor`·`firstMonth`·`monthSeries`·`MonthPoint`, `treatments.ts`의 `addGroup`·`deleteGroup`·`moveCode`와 각 시험. `TreatmentTrendSection.test.tsx`에서 `lib/storage/rxGroups` 가짜와 'AC-1210.15' 시험의 그 부분을 뺀다(통계 묶음 저장만 한 번 부르는지는 그대로 본다). 지금 시험 가운데 바꾸는 것: `shell.test.tsx`(탭 표·주요 다섯 → 넷·`/revenue` 줄들), `tabFrame.test.tsx`(`SCREEN_DIR`·`READY` 목록·'AC-010.1 매출' 시험), `notReadyPages.test.tsx`('AC-010.1 /revenue' 시험의 페이지 파일 읽기), `titles.test.tsx`(`/revenue` 줄·매출 제목 시험·'15개' → '14개'), `notFound.test.tsx`(라우트 표), `features.test.ts`(표·'AC-010.1 매출' 시험·통계 설명), `DashboardHome.test.tsx`(`매출` 연결 먼저/사용 가능 두 줄), `sample.test.ts`(탭 13 → 12), `DashboardPreview.test.tsx`(span 13 → 12), `notReadyFeatures.test.ts`('AC-010.1 매출' 시험은 그대로 통과하면 고치지 않음). 문서: `ARCHITECTURE.md` 폴더·흐름·표 줄, `plan.md` 매출 줄, `pc-check.md` 맨 위 한 줄
- 차례: Phase 4 (TASK-7과 병렬 — TASK-7은 `components/stats`·`e2e`, 이 TASK는 메뉴·대시보드·미리보기·`components/revenue`·`lib/revenue`·`lib/storage`·`TreatmentTrendSection.test.tsx`라 겹치지 않는다)

## 마지막 검사 (코드 작업 아님)
- `npx tsc --noEmit` · `npm run lint` · `npm test`(이 PC에서 원래 나는 실패는 ssk-finish-check로 가름) · `PATH="$HOME/.dotnet:$PATH" npx vitest run helper/tests/revenue-read.dotnet.test.ts helper/tests/input-wiring.dotnet.test.ts`
- 검토 한 번(마지막)
- requirements.md '화면 확인': 하네스 `~/.claude/state/handoff/stats-harness/`로 1440 · 1024 · 768 · 390px 가로 넘침 0, 시안 사진과 견주어 사용자에게 보인다
- 비트 DB 읽기(ssk-bit-db-probe, 진료 시간 밖): 새 문장 `CodeAmountsByDay`를 한 달 범위로 돌려 걸린 시간과 줄 수만 잰다(답 크기 어림 확인)
- 위 '사용자 할 일' 1~4를 차례대로 안내한다
