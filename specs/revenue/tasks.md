# 작업 분할: 매출 탭

> 형식: `## TASK-n: 제목` 아래에 `- Step:`, `- AC:`, `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests에 적힌 경로만 수정할 수 있다. TASK 번호 = REQ 번호. 순서대로 한다.
> Phase 1 `revenue-1-read`(TASK-1~3, 그리고 TASK-12 = Phase 1 Step 3 `version-bump`: 명세 검토에서 더한 TASK라 번호만 뒤에 있다. TASK-3 뒤·Phase 2 앞에 한다) · Phase 2 `revenue-2-numbers`(TASK-4~7, 그리고 TASK-13 = Step 4 `rx-group-store`) · Phase 3 `revenue-3-screen`(Step 0 TASK-8 · Step 1 TASK-9 · Step 2 TASK-14 `group-editor` · Step 3 TASK-10 · Step 4 TASK-11). TASK-13·14는 2026-11-01 사용자 결정("처방묶는건 내가 골라서 묶게해")으로 더해 번호만 뒤에 있다. step 파일은 `phases/revenue-<n>-<slug>/stepM.md`.
> **TASK-14(묶음 고치기 화면)는 시안 3절 '치료 묶음 고치기'의 사용자 OK 뒤에만 시작한다.** 화면 TASK(8~11)의 기준 시안 `docs/mockups/revenue/index.html`은 2026-11-01 사용자 승인("이대로 만들기")이다. TASK-5는 확인표 '먼저 할 것' ①(총진료비에 비급여가 들어 있는가) 답을 받은 뒤 시작한다.
> **2026-11-01 명세 변경(매출 = 총진료비, 급여·비급여·기타)**: 이미 끝난 TASK-1·TASK-2를 다시 연다. TASK-1은 확인표에 '매출 탭에서 볼 것' ⑤ 한 줄을 더하고, TASK-2는 계약에 `copay`·`otherTotal`을 더한다(금액 아홉 칸 짝). 두 TASK 모두 Files·Tests는 그대로다.
> `revenue.days`는 업무일지 탭도 쓰는 계약이다(design.md 5절). 칸을 바꾸면 두 명세를 같이 고친다.
> 갈래 규칙 C1~C9(worklog·stats·patients·revenue)를 따른다: migration 이름 `20261101000400_revenue.sql`, 새 오류 번호는 `E-REVENUE-*`, 탭·명령 수를 고정 숫자로 시험하지 않음, 겹치는 파일은 design.md 11절.
> Phase가 끝날 때마다 `verify`·화면 캡처(Phase 3)·쉬운 말 보고. 합치기·운영 배포·도우미 릴리스 태그(`helper-v*`)·실제 Supabase에 SQL 붙여 넣기는 사용자가 그때마다 말할 때만 한다.
> 도우미 C# 시험 파일 이름은 `*.test.cs`, 하네스 TDD 기록은 `helper/tests/*.dotnet.test.ts` 감싸개로 남긴다(precheck와 같음).
> 원본(양지바른) 경로는 저장소 밖이다. 원본 파일은 커밋하지 않고 SQL 사본만 넣는다(design.md 2절).

## TASK-1: 의원 PC 확인표
- Step: Phase 1 · Step 0 · `pc-check`
- AC: AC-001.1~AC-001.3
- REQ: REQ-001
- Files: docs/revenue/pc-check.md
- TDD: exempt (문서 한 장. 확인은 총괄이 의원 PC에서 한다)
- 다시 열림(2026-11-01): '매출 탭에서 볼 것' ⑤(급여·비급여·기타가 외래환자경영통계의 요양비용총액·비급여·(100/100미만총액 + 전액본인부담)과 같음/다름) 한 줄을 더한다. ① 답(아니오)은 이미 적혀 있다

## TASK-2: 명령 표 `revenue.days` · 답 검사
- Step: Phase 1 · Step 1 · `bridge-contract`
- AC: AC-002.1~AC-002.4
- REQ: REQ-002
- Files: src/lib/bridge/commands.json, src/types/bridge.ts, src/types/revenue.ts, src/lib/bridge/protocol.ts, src/lib/bridge/revenueResult.ts, src/lib/bridge/revenueResult.test.ts, src/lib/bridge/revenueCall.test.ts, helper/tests/Precheck.Core.Tests/Protocol/CommandTable.test.cs
- Tests: src/lib/bridge/revenueResult.test.ts, src/lib/bridge/revenueCall.test.ts, src/lib/bridge/protocol.test.ts, helper/tests/protocol.dotnet.test.ts
- TDD: required
- 메모: 이 TASK에서는 `protocol.test.ts`·`client.test.ts`를 고치지 않는다(명령 표에서 목록을 읽으므로 그대로 통과해야 한다). `client.test.ts`의 도우미 판은 TASK-12가 고친다
- 다시 열림(2026-11-01): `src/types/revenue.ts`의 날 칸·금액 칸 목록에 `copay`·`otherTotal`을 더하고(`noncovered` 뒤), 검사의 `unconfirmed` 짝을 금액 아홉 칸으로 넓힌다. 기존 칸 이름은 그대로(업무일지 맞춤이 바뀌지 않음). 시험에 두 칸 빠짐·음수·짝 어긋남 사례를 더한다

## TASK-3: 도우미 매출 읽기
- Step: Phase 1 · Step 2 · `helper-revenue-read`
- AC: AC-003.1~AC-003.8
- REQ: REQ-003
- Files: helper/src/Precheck.Core/Revenue/*, helper/src/Precheck.Core/Bit/Sql.cs, helper/src/Precheck.Helper/Program.cs, helper/tests/Precheck.Core.Tests/Revenue/*, helper/tests/Precheck.Core.Tests/Revenue/original-sql/*, helper/tests/revenue-read.dotnet.test.ts
- Tests: helper/tests/revenue-read.dotnet.test.ts, helper/tests/bit-connect.dotnet.test.ts, helper/tests/protocol.dotnet.test.ts
- TDD: required
- 메모(2026-11-01): 원본 문장 7개 + 새 문장 4개(`DistinctPatients`·`CodeAmounts`·`FinanceNormalExtra`·`FinanceReceivableExtra`). `copay`·`otherTotal`과 `insurer + copay = 요양비용총액` 검사(design.md 4-2). 처방 이름에서 제어 문자(C0·DEL·C1·U+2028/2029)를 빼야 TASK-2의 검사를 지난다

## TASK-4: 매출 표 (migration)
- Step: Phase 2 · Step 0 · `revenue-tables`
- AC: AC-004.1~AC-004.6
- REQ: REQ-004
- Files: supabase/migrations/20261101000400_revenue.sql, supabase/revenue.rls.test.ts
- Tests: supabase/revenue.rls.test.ts, supabase/rls.test.ts
- TDD: required
- 메모: 실제 Supabase에는 붙여 넣지 않는다. 끝나면 붙여 넣을지 사용자에게 묻는다(design.md 6절)

## TASK-5: 금액 나눔·기간 합·비교
- Step: Phase 2 · Step 1 · `revenue-summary`
- AC: AC-005.1~AC-005.6
- REQ: REQ-005
- Files: src/lib/revenue/summary.ts, src/lib/revenue/summary.test.ts
- Tests: src/lib/revenue/summary.test.ts
- TDD: required
- 먼저: 확인표 '먼저 할 것' ① 답은 '아니오'였고(2026-11-01) 그에 맞춰 AC-005.1을 바꿨다. 이 명세가 다시 승인된 뒤 시작한다

## TASK-6: 치료 묶음 계산·제안·고치기 함수
- Step: Phase 2 · Step 2 · `treatment-groups`
- AC: AC-006.1~AC-006.4
- REQ: REQ-006
- Files: src/lib/revenue/treatments.ts, src/lib/revenue/treatments.test.ts, src/types/rxGroups.ts
- Tests: src/lib/revenue/treatments.test.ts
- TDD: required

## TASK-7: 저장·가져오기
- Step: Phase 2 · Step 3 · `revenue-sync`
- AC: AC-007.1~AC-007.5
- REQ: REQ-007
- Files: src/lib/revenue/sync.ts, src/lib/revenue/sync.test.ts, src/lib/storage/revenue.ts, src/lib/storage/revenue.test.ts, src/lib/errors.ts, src/lib/errors.test.ts, src/types/errors.ts
- Tests: src/lib/revenue/sync.test.ts, src/lib/storage/revenue.test.ts, src/lib/errors.test.ts
- TDD: required

## TASK-8: 화면 보기 모양
- Step: Phase 3 · Step 0 · `revenue-view`
- AC: AC-008.1~AC-008.5
- REQ: REQ-008
- Files: src/components/revenue/view.ts, src/components/revenue/view.test.ts, src/components/revenue/money.ts, src/components/revenue/money.test.ts
- Tests: src/components/revenue/view.test.ts, src/components/revenue/money.test.ts
- TDD: required
- 문구는 승인 시안(2026-11-01) `docs/mockups/revenue/gen.py`의 글자 그대로

## TASK-9: 매출 화면 부품
- Step: Phase 3 · Step 1 · `revenue-screen`
- AC: AC-009.1~AC-009.5
- REQ: REQ-009
- Files: src/components/revenue/*.tsx, src/components/revenue/RevenueScreen.test.tsx, src/components/revenue/parts.test.tsx
- Tests: src/components/revenue/RevenueScreen.test.tsx, src/components/revenue/parts.test.tsx, src/components/ui/classes.test.ts, src/components/charts/rules.test.ts
- TDD: required
- 메모: `src/app/(app)/revenue/page.tsx`는 고치지 않는다(TASK-10이 준비 중 목록과 함께 바꾼다)

## TASK-10: 준비 중에서 빼기
- Step: Phase 3 · Step 3 · `tab-ready`
- AC: AC-010.1~AC-010.4
- REQ: REQ-010
- Files: src/app/(app)/revenue/page.tsx, src/app/(app)/revenue/page.test.tsx, src/components/common/notReadyFeatures.ts, src/components/common/notReadyFeatures.test.ts, src/components/shell/menu.ts, src/components/shell/shell.test.tsx, src/components/dashboard/briefing/features.ts, src/components/dashboard/briefing/features.test.ts, src/app/(app)/notReadyPages.test.tsx, src/app/(app)/tabFrame.test.tsx, src/app/titles.test.tsx, src/app/notFound.test.tsx, docs/UI_GUIDE.md, docs/ARCHITECTURE.md, plan.md, src/lib/backup/tables.ts, src/lib/backup/tables.test.ts
- Tests: src/app/(app)/revenue/page.test.tsx, src/components/common/notReadyFeatures.test.ts, src/components/shell/shell.test.tsx, src/components/dashboard/briefing/features.test.ts, src/app/(app)/notReadyPages.test.tsx, src/app/(app)/tabFrame.test.tsx, src/app/titles.test.tsx
- TDD: required

## TASK-11: E2E
- Step: Phase 3 · Step 4 · `revenue-e2e`
- AC: AC-011.1~AC-011.4
- 메모: `rx_groups` 저장도 가로채고 다시 읽는다(AC-011.2·011.4). 시험 계정의 묶음 줄도 지운다
- REQ: REQ-011
- Files: e2e/revenue.spec.ts, e2e/lib/revenueFakeBridge.ts, e2e/lib/revenueFakeBridge.test.ts
- Tests: e2e/lib/revenueFakeBridge.test.ts, e2e/revenue.spec.ts
- TDD: required
- 먼저: 실제 Supabase에 TASK-4 migration이 붙어 있고 `.env.local`에 E2E 값이 있어야 한다. 없으면 `blocked`(사유: 사용자 할 일)

## TASK-12: 버전 올리기
- Step: Phase 1 · Step 3 · `version-bump`
- AC: AC-012.1~AC-012.2
- REQ: REQ-012
- Files: helper/Directory.Build.props, src/lib/bridge/versions.ts, src/lib/bridge/handshake.test.ts, src/lib/bridge/client.test.ts, extension/manifest.json
- Tests: src/lib/bridge/handshake.test.ts, src/lib/bridge/client.test.ts, extension/src/manifest.test.ts, helper/tests/protocol.dotnet.test.ts, helper/tests/build.test.ts
- TDD: required
- 메모: 도우미 릴리스 태그(`helper-v*`)·웹스토어 올리기는 하지 않는다(사용자가 그때 말할 때만). `MIN_HELPER`·`MIN_EXTENSION`은 그대로

## TASK-13: 묶음 저장
- Step: Phase 2 · Step 4 · `rx-group-store`
- AC: AC-013.1~AC-013.3
- REQ: REQ-013
- Files: src/lib/storage/rxGroups.ts, src/lib/storage/rxGroups.test.ts, src/lib/errors.ts, src/lib/errors.test.ts, src/types/errors.ts
- Tests: src/lib/storage/rxGroups.test.ts, src/lib/errors.test.ts
- TDD: required
- 메모: 이름이 일반적인 `rx_groups`·`RxGroup`은 통계 탭이 합친 뒤 다시 쓸 수 있게 한 것이다(design.md 6·11절). 저장은 DB 함수 `save_rx_groups` 한 번(TASK-4, 한 트랜잭션). 새 오류 번호는 `E-REVENUE-GROUP-SAVE-FAILED`·`E-REVENUE-GROUP-LOAD-FAILED`(갈래 규칙 C3)

## TASK-14: 묶음 고치기 화면
- Step: Phase 3 · Step 2 · `group-editor`
- AC: AC-014.1~AC-014.6
- REQ: REQ-014
- Files: src/components/revenue/groups/*, src/components/revenue/RevenueTreatments.tsx, src/components/revenue/RevenueScreen.tsx, src/components/revenue/RevenueScreen.test.tsx
- Tests: src/components/revenue/groups/GroupEditor.test.tsx, src/components/revenue/RevenueScreen.test.tsx, src/components/ui/classes.test.ts
- TDD: required
- 먼저: 시안 3절 '치료 묶음 고치기'의 사용자 OK를 확인한다. 없으면 `blocked`(사유: 묶음 고치기 시안 OK 필요)
