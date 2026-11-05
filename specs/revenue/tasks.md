# 작업 분할: 매출 탭

> 형식: `## TASK-n: 제목` 아래에 `- Step:`, `- AC:`, `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests에 적힌 경로만 수정할 수 있다. TASK 번호 = REQ 번호. 순서대로 한다.
> Phase 1 `revenue-1-read`(TASK-1~3, 그리고 TASK-12 = Phase 1 Step 3 `version-bump`: 명세 검토에서 더한 TASK라 번호만 뒤에 있다. TASK-3 뒤·Phase 2 앞에 한다) · Phase 2 `revenue-2-numbers`(TASK-4~7, 그리고 TASK-13 = Step 4 `rx-group-store`) · Phase 3 `revenue-3-screen`(Step 0 TASK-8 · Step 1 TASK-9 · Step 2 TASK-14 `group-editor` · Step 3 TASK-10 · Step 4 TASK-11 · Step 5 TASK-15 `busy-wording`). TASK-13·14는 2026-11-01 사용자 결정("처방묶는건 내가 골라서 묶게해")으로 더해 번호만 뒤에 있다. TASK-15는 2026-11-02 사용자 결정("연결문구 바꿔")으로 더했다. step 파일은 `phases/revenue-<n>-<slug>/stepM.md`.
> **시안 승인과 OK는 `docs/mockups/revenue/README.md`에 적고, 화면 TASK는 거기서 확인한다.** 화면 TASK(8~11)의 기준 시안 `docs/mockups/revenue/index.html`은 2026-11-01 사용자 승인("이대로 만들기")이고, 시안 3절 '치료 묶음 고치기'와 묶음 50개 한도도 2026-11-01 승인("묶음 화면 좋아요", "적당해 50개면")이라 TASK-14를 막는 것이 없다. **승인 뒤 바뀐 곳도 모두 OK다(2026-11-01): '승인 뒤 바뀐 곳' 줄("시안은 좋아")과 '건당 진료비' 줄("건당 진료비 좋아요"). TASK-8·TASK-9는 README의 이 두 줄을 확인하고 시작한다.** TASK-5를 막는 것은 확인표 '먼저 할 것' ①뿐이고 답을 받았다(아니오, 2026-11-01). ②·③은 어떤 TASK도 막지 않는다(design.md 14절).
> **2026-11-01 명세 변경(매출 = 총진료비, 급여·비급여·기타)**: 이미 끝난 TASK-1·TASK-2를 다시 연다. TASK-1은 확인표의 '매출 탭에서 볼 것' ①을 고치고 ⑤를 더하고(확인 필요한 날이 없는 달로, 만 원 자리까지, 건강생활유지비 예/아니오 줄), TASK-2는 계약에 `copay`·`otherTotal`을 더한다(금액 아홉 칸 짝). 두 TASK 모두 Files·Tests는 그대로다. 이 변경은 반영되어 있고, 지금 다시 여는 일은 다음 줄이다.
> **2026-11-01 명세 변경("나눔만 비워")**: 나눔이 맞지 않는 날은 나눔 네 칸만 비운다(`splitUnconfirmed`). 이미 끝난 TASK-1·TASK-2·TASK-3을 다시 연다(문서·코드가 있고, TDD TASK는 시험을 먼저 고쳐 실패를 본다). 세 TASK 모두 Files·Tests는 그대로다. TASK-12는 그대로 끝난 상태다: 도우미 0.2.0을 아직 내지 않아서(`helper-v*` 태그는 0.1.1까지) 판을 더 올리지 않는다. TASK-4·5·7·8·9·11은 아직 만들지 않았으니 이 명세대로 만든다. 이 변경도 반영되어 있고, 지금 다시 여는 일은 다음 줄이다.
> **2026-11-01 명세 변경("건당 진료비 하나로")**: 환자 1인당 평균 진료비를 건당 진료비(매출 ÷ 접수 건수)로 바꾼다. `patientsToDate`·`DistinctPatients`·`patients_to_date`·`perPatient`·`lowered`가 없어진다. 이미 끝난 TASK-1·TASK-2·TASK-3·TASK-4·TASK-5·TASK-7을 다시 연다(문서·코드가 있고, TDD TASK는 시험을 먼저 고쳐 실패를 본다). 여섯 TASK 모두 Files·Tests는 그대로다. TASK-6·TASK-13·TASK-12는 그대로 끝난 상태다: 도우미 0.2.0을 아직 내지 않아서(`helper-v*` 태그는 `helper-v0.1.1`까지) 판을 더 올리지 않고 호환 길도 만들지 않는다. migration은 실제 Supabase에 붙인 적이 없으므로 파일을 그대로 고치고 `alter`를 쓰지 않는다. TASK-8·9·10·11·14는 아직 만들지 않았으니 이 명세대로 만든다(TASK-11의 가짜 통로 답에도 그 칸이 없다). **다시 여는 순서(이번만 머리말의 '순서대로'와 '`verify`' 줄의 예외)**: ① TASK-7은 TASK-2의 구현이 들어오기 **전에** 시험을 고쳐 RED를 기록한다(`saveMonth`가 칸을 `REVENUE_DAY_KEYS`에서 가져오므로 TASK-2 뒤에는 실패를 볼 수 없다). `specs/revenue/tdd-log.jsonl`에는 지난 승인 때의 TASK-7 RED가 이미 있으므로, 이번 승인(`approval.json`의 `approved_at`) 뒤의 TASK-7 RED가 있는지 Read로 본다(Bash로 이 파일 이름을 쓰면 `guard-bash` 훅이 막는다) ② TASK-1·TASK-2·TASK-3·TASK-5는 함께 돌린다 ③ TASK-4는 TASK-2의 계약 변경이 작업 트리에 들어온 뒤에 시작한다(칸 목록 시험이 `REVENUE_DAY_KEYS`를 읽는다). TASK-7도 그때 끝낸다 ④ 전체 `verify`는 Phase 끝에만 돌린다. TASK-2·TASK-5·TASK-7이 모두 들어오기 전에는 타입 검사가 통과할 수 없기 때문이다(TASK-5·TASK-7이 Phase 2라서 Phase 1 끝이 아니라 Phase 2 끝이다). 그때까지 TASK마다 자기 Tests와 `npm run lint`만 본다. 커밋 전 중간 작업 트리에서는 `stop-verify`가 타입 오류로 실패하고, TASK-2·TASK-5·TASK-7이 모두 들어올 때까지는 예상된 실패다.
> **2026-11-02 명세 변경("연결문구 바꿔")**: 앞 줄까지의 변경은 모두 반영되어 있다. 사용자가 `E-BRIDGE-BUSY` 카드의 새 글자를 OK했다. 이 번호는 `/claim` 화면과 같이 쓰고 글자는 `lib/errors.ts` 한 곳에 있으므로, 그곳과 글자를 못 박은 시험만 바꾼다. 일부를 곧 넓힐 수 있어 글자는 명세에 적지 않고 `phases/revenue-3-screen/step5.md`에만 글자 그대로 둔다. 새 AC는 AC-009.6(다른 창이 통로를 쓰는 중) · AC-009.7(가져오기를 끝낸 뒤 끊김) · AC-014.7(묶음을 모두 지우고 저장)이다. 이미 만든 화면의 동작을 명세에 적는 것이라 화면 코드는 바뀌지 않는다. 새 TASK-15가 이 셋과 글자 변경을 맡고, 끝난 TASK는 다시 열지 않는다. TASK-15는 자기 번호의 REQ가 없는 유일한 TASK다(머리말 'TASK 번호 = REQ 번호'의 예외, REQ-009·REQ-014의 AC를 맡는다). TASK-11은 그대로 `blocked`이고 TASK-15를 막지 않는다. 같은 변경에서 design.md 6·7·8·8-2절을 검토를 마친 코드에 맞추고 13절에 위험 셋을 적었으며, AC-007.2·AC-007.3의 글을 그에 맞췄다(코드 변경 없음).
> **2026-11-02 명세 변경("다른 창으로 바꿔")**: 앞 줄까지의 변경은 모두 반영되어 있다. 사용자가 `E-BRIDGE-BUSY` 카드의 글자를 한 번 더 고쳤다(연결을 쓰는 화면 이름을 늘어놓지 않는다). 새 글자와 같은 안내를 되풀이하는 `BusyCard`의 고정 줄(`src/components/claim/setup/SetupAlert.tsx`)도 뺀다. 그 줄이 전하던 것은 새 글자에 다 들어 있어 잃는 것이 없다. TASK-15를 다시 열고 Files·Tests에 `SetupAlert.tsx`·`SetupScreen.test.tsx`를 더한다. 이 줄 하나 말고 화면 코드는 바뀌지 않는다.
> `revenue.days`는 업무일지 탭도 쓰는 계약이다(design.md 5절). 칸을 바꾸면 두 명세를 같이 고친다. 이번 변경의 업무일지 쪽 후속은 design.md 11절 표 아래에 적었다.
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
- 다시 열림(2026-11-01 "나눔만 비워"): 문서는 이미 있다(⑤와 본 달 규칙 포함). 본 달 규칙을 두 가지 날(확인 필요한 날·나눔을 못 한 날)로 넓히고, 손으로 더할 때 매출과 나눔 칸의 뺄 날을 나누고, '화면을 함께 보며' 줄을 고친다. '먼저 할 것' ① 답(아니오)은 이미 적혀 있다. ②·③ 칸은 비어 있어도 끝낸다(`blocked`로 두지 않는다)
- 다시 열림(2026-11-01 "건당 진료비 하나로"): '매출 탭에서 볼 것' ②를 접수 건수 확인으로 바꾸고(접수취소가 있던 달의 접수 건수와 비트 통계 화면의 접수(내원) 건수, 접수취소가 있던 하루의 그 화면 건수와 접수 목록에서 취소를 뺀 줄 수, 둘 다 같음/다름만. 하나라도 '다름'이면 증명이 안 된 것이고 원인을 좁힌 뒤 명세 변경을 정한다), ④에 '접수 건수를 확인하지 못한 날' 수를 더한다(AC-001.2·001.3). 금액과 접수 건수는 어느 칸에도 적지 않는다

## TASK-2: 명령 표 `revenue.days` · 답 검사
- Step: Phase 1 · Step 1 · `bridge-contract`
- AC: AC-002.1~AC-002.4
- REQ: REQ-002
- Files: src/lib/bridge/commands.json, src/types/bridge.ts, src/types/revenue.ts, src/lib/bridge/protocol.ts, src/lib/bridge/revenueResult.ts, src/lib/bridge/revenueResult.test.ts, src/lib/bridge/revenueCall.test.ts, helper/tests/Precheck.Core.Tests/Protocol/CommandTable.test.cs
- Tests: src/lib/bridge/revenueResult.test.ts, src/lib/bridge/revenueCall.test.ts, src/lib/bridge/protocol.test.ts, helper/tests/protocol.dotnet.test.ts
- TDD: required
- 메모: 이 TASK에서는 `protocol.test.ts`·`client.test.ts`를 고치지 않는다(명령 표에서 목록을 읽으므로 그대로 통과해야 한다). `client.test.ts`의 도우미 판은 TASK-12가 고친다
- 다시 열림(2026-11-01 "나눔만 비워"): 코드가 있다(`copay`·`otherTotal`은 이미 들어 있다). 시험을 먼저 고쳐 실패를 본 뒤 `src/types/revenue.ts`에 `splitUnconfirmed`와 나눔 네 칸·남는 다섯 칸 목록을 더하고, `isRevenueDays`가 두 표시의 짝을 정확히 보게 한다(둘 다 참이면 거부). 기존 칸 이름은 그대로다. 업무일지 명세 후속은 design.md 11절
- 다시 열림(2026-11-01 "건당 진료비 하나로"): 코드가 있다. 시험을 먼저 고쳐 실패를 본 뒤 `RevenueDayRow`·`REVENUE_DAY_KEYS`에서 `patientsToDate`를 뺀다(날 칸 16 → 15). 이 구현은 TASK-7이 RED를 기록한 뒤에 넣는다(머리말의 다시 여는 순서)

## TASK-3: 도우미 매출 읽기
- Step: Phase 1 · Step 2 · `helper-revenue-read`
- AC: AC-003.1~AC-003.8
- REQ: REQ-003
- Files: helper/src/Precheck.Core/Revenue/*, helper/src/Precheck.Core/Bit/Sql.cs, helper/src/Precheck.Helper/Program.cs, helper/tests/Precheck.Core.Tests/Revenue/*, helper/tests/Precheck.Core.Tests/Revenue/original-sql/*, helper/tests/revenue-read.dotnet.test.ts
- Tests: helper/tests/revenue-read.dotnet.test.ts, helper/tests/bit-connect.dotnet.test.ts, helper/tests/protocol.dotnet.test.ts
- TDD: required
- 메모(2026-11-01): 원본 문장 7개 + 새 문장 3개(`CodeAmounts`·`FinanceNormalExtra`·`FinanceReceivableExtra`). `copay`·`otherTotal`과 `insurer + copay = 요양비용총액` 검사(원 미만을 버리기 전 값으로 비교, design.md 4-2). 처방 이름에서 제어 문자(C0·DEL·C1·U+2028/2029)를 빼야 TASK-2의 검사를 지난다
- 다시 열림(2026-11-01 "나눔만 비워"): 코드가 있다. 시험을 먼저 고쳐 실패를 본 뒤 `RevenueDay`에 `splitUnconfirmed`를 더하고, 금액 맞춤 검사와 나눔 네 칸의 음수는 그 네 칸만 비우게 고친다(`total`·`cash`·`card`·`transfer`·`receivableIn`의 음수와 세 검사는 `unconfirmed` 그대로). 검토에서 남은 것 셋도 고친다: 음수 시험을 아홉 칸 모두로 넓힘, `to = 9999-12-31`에 `E-HELPER-BAD-MESSAGE`, 이름 정리 정규식의 U+2028·U+2029를 이스케이프로
- 다시 열림(2026-11-01 "건당 진료비 하나로"): 코드가 있다. 시험을 먼저 고쳐 실패를 본 뒤 `DistinctPatients`와 `RevenueDay.PatientsToDate`를 없앤다(문장 11 → 10, 하루 9 → 8, 걸린 날 3~5 → 2~4). AC-003.4는 `visits`의 세 조건을 문장 글자로 못 박는 시험으로 바꾼다(접수취소의 증명은 확인표 ②, design.md 2절 5)

## TASK-4: 매출 표 (migration)
- Step: Phase 2 · Step 0 · `revenue-tables`
- AC: AC-004.1~AC-004.6
- REQ: REQ-004
- Files: supabase/migrations/20261101000400_revenue.sql, supabase/revenue.rls.test.ts
- Tests: supabase/revenue.rls.test.ts, supabase/rls.test.ts
- TDD: required
- 메모: 실제 Supabase에는 붙여 넣지 않는다. 끝나면 붙여 넣을지 사용자에게 묻는다(design.md 6절)
- 다시 열림(2026-11-01 "건당 진료비 하나로"): 파일이 있다. 시험을 먼저 고쳐 실패를 본 뒤 migration에서 `patients_to_date`를 뺀다(칸 정의와 칸 단위 권한, 표 18칸 → 17칸, 보내는 칸 16 → 15). 실제 Supabase에 붙인 적이 없으므로 파일을 그대로 고치고 `alter`를 쓰지 않는다. TASK-2의 계약 변경이 작업 트리에 들어온 뒤에 시작한다(머리말의 다시 여는 순서)

## TASK-5: 금액 나눔·기간 합·비교
- Step: Phase 2 · Step 1 · `revenue-summary`
- AC: AC-005.1~AC-005.6
- REQ: REQ-005
- Files: src/lib/revenue/summary.ts, src/lib/revenue/summary.test.ts
- Tests: src/lib/revenue/summary.test.ts
- TDD: required
- 먼저: 확인표 '먼저 할 것' ① 답은 '아니오'였고(2026-11-01) 그에 맞춰 AC-005.1을 바꿨다. 이 명세가 다시 승인된 뒤 시작한다
- 다시 열림(2026-11-01 "건당 진료비 하나로"): 코드가 있다. 시험을 먼저 고쳐 실패를 본 뒤 `perPatient`·`lowered`와 환자 수 칸을 없애고 `perVisit`·`perVisitTotal`·`perVisitCount`·`noVisitDays`를 더하고 `PeriodSum.visits`를 `number | null`로 바꾼다(AC-005.2·005.5·005.6, design.md 7절)

## TASK-6: 치료 묶음 계산·제안·고치기 함수
- Step: Phase 2 · Step 2 · `treatment-groups`
- AC: AC-006.1~AC-006.4
- REQ: REQ-006
- Files: src/lib/revenue/treatments.ts, src/lib/revenue/treatments.test.ts, src/types/rxGroups.ts
- Tests: src/lib/revenue/treatments.test.ts
- TDD: required
- 메모: 확인표 ② 답을 기다리지 않는다. 제안 규칙은 고정이고, 코드가 달라도 제안 다섯 개가 그대로 나온 뒤 총괄이 편집 화면에서 고친다(AC-006.3)

## TASK-7: 저장·가져오기
- Step: Phase 2 · Step 3 · `revenue-sync`
- AC: AC-007.1~AC-007.5
- REQ: REQ-007
- Files: src/lib/revenue/sync.ts, src/lib/revenue/sync.test.ts, src/lib/storage/revenue.ts, src/lib/storage/revenue.test.ts, src/lib/errors.ts, src/lib/errors.test.ts, src/types/errors.ts
- Tests: src/lib/revenue/sync.test.ts, src/lib/storage/revenue.test.ts, src/lib/errors.test.ts
- TDD: required
- 다시 열림(2026-11-01 "건당 진료비 하나로"): 코드가 있다. 보내고 읽는 날 칸이 열다섯이 된다(칸 목록은 TASK-2의 `REVENUE_DAY_KEYS`에서 온다). 시험을 먼저 고쳐 TASK-2의 구현이 들어오기 전에 RED를 기록하고, TASK-2의 계약 변경이 들어온 뒤 끝낸다(머리말의 다시 여는 순서). `saveMonth`의 1일 확인은 그대로 두고 까닭만 `sales_codes` 쪽으로 고친다(AC-007.2)

## TASK-8: 화면 보기 모양
- Step: Phase 3 · Step 0 · `revenue-view`
- AC: AC-008.1~AC-008.7
- REQ: REQ-008
- Files: src/components/revenue/view.ts, src/components/revenue/view.test.ts, src/components/revenue/money.ts, src/components/revenue/money.test.ts
- Tests: src/components/revenue/view.test.ts, src/components/revenue/money.test.ts
- TDD: required
- 먼저: `docs/mockups/revenue/README.md`의 '승인 뒤 바뀐 곳' 줄(급여·비급여·기타 덩어리 · 확인 필요한 날 글자)과 '건당 진료비' 줄이 모두 OK인지 확인한다(2026-11-01 둘 다 OK: "시안은 좋아", "건당 진료비 좋아요"). OK가 아니면 `blocked`(사유: 바뀐 매출 시안 OK 필요)
- 문구는 시안 `docs/mockups/revenue/gen.py`의 글자 그대로(승인 기록은 README)

## TASK-9: 매출 화면 부품
- Step: Phase 3 · Step 1 · `revenue-screen`
- AC: AC-009.1~AC-009.5
- REQ: REQ-009
- Files: src/components/revenue/*.tsx, src/components/revenue/RevenueScreen.test.tsx, src/components/revenue/parts.test.tsx
- Tests: src/components/revenue/RevenueScreen.test.tsx, src/components/revenue/parts.test.tsx, src/components/ui/classes.test.ts, src/components/charts/rules.test.ts
- TDD: required
- 먼저: `docs/mockups/revenue/README.md`의 '승인 뒤 바뀐 곳' 줄(급여·비급여·기타 덩어리 · 확인 필요한 날 글자)과 '건당 진료비' 줄이 모두 OK인지 확인한다(2026-11-01 둘 다 OK: "시안은 좋아", "건당 진료비 좋아요"). OK가 아니면 `blocked`(사유: 바뀐 매출 시안 OK 필요)
- 메모: `src/app/(app)/revenue/page.tsx`는 고치지 않는다(TASK-10이 준비 중 목록과 함께 바꾼다)

## TASK-10: 준비 중에서 빼기
- Step: Phase 3 · Step 3 · `tab-ready`
- AC: AC-010.1~AC-010.4
- REQ: REQ-010
- Files: src/app/(app)/revenue/page.tsx, src/app/(app)/revenue/page.test.tsx, src/components/common/notReadyFeatures.ts, src/components/common/notReadyFeatures.test.ts, src/components/shell/menu.ts, src/components/shell/shell.test.tsx, src/components/dashboard/briefing/features.ts, src/components/dashboard/briefing/features.test.ts, src/app/(app)/notReadyPages.test.tsx, src/app/(app)/tabFrame.test.tsx, src/app/titles.test.tsx, src/app/notFound.test.tsx, docs/UI_GUIDE.md, docs/ARCHITECTURE.md, plan.md, docs/tab-frame/plan.md, src/lib/backup/tables.ts, src/lib/backup/tables.test.ts, src/components/dashboard/briefing/DashboardHome.test.tsx, src/app/(app)/dashboard/page.test.tsx
- Tests: src/app/(app)/revenue/page.test.tsx, src/components/common/notReadyFeatures.test.ts, src/components/shell/shell.test.tsx, src/components/dashboard/briefing/features.test.ts, src/app/(app)/notReadyPages.test.tsx, src/app/(app)/tabFrame.test.tsx, src/app/titles.test.tsx, src/components/dashboard/briefing/DashboardHome.test.tsx, src/app/(app)/dashboard/page.test.tsx
- TDD: required
- 메모: 매출이 `connect-first`가 되면 고정 숫자를 적은 시험이 깨진다: 대시보드 시험 둘(`DashboardHome.test.tsx`·`(app)/dashboard/page.test.tsx`)의 "12개 가운데 1개는 지금, 1개는 연결하면 쓸 수 있어요"와 '연결 먼저'·'준비 중'·'사용 가능' 수, `(app)/tabFrame.test.tsx`의 `[12, 1, 1]`. 이 수는 모두 `DASHBOARD_FEATURES`에서 센다('사용 가능' = `ready` 수 + `connect-first` 수). 어떤 새 고정 숫자도 적지 않는다("2"·"3"·`[12, 1, 2]` 모두): 통계·환자·업무일지도 같은 칸을 바꾸므로 합치면 수가 또 바뀐다(갈래 규칙 C5)

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
- 먼저: 시안 3절 '치료 묶음 고치기'의 사용자 OK는 받았다(2026-11-01 "묶음 화면 좋아요", `docs/mockups/revenue/README.md`). 막는 것이 없다

## TASK-15: 비트 연결 문구 바꾸기
- Step: Phase 3 · Step 5 · `busy-wording`
- AC: AC-009.6, AC-009.7, AC-014.7
- REQ: REQ-009, REQ-014
- Files: src/lib/errors.ts, src/lib/errors.test.ts, src/components/revenue/RevenueScreen.test.tsx, src/components/revenue/groups/GroupEditor.test.tsx, src/components/claim/setup/SetupAlert.tsx, src/components/claim/setup/SetupScreen.test.tsx, docs/mockups/revenue/README.md
- Tests: src/lib/errors.test.ts, src/components/revenue/RevenueScreen.test.tsx, src/components/revenue/groups/GroupEditor.test.tsx, src/components/claim/setup/SetupScreen.test.tsx
- TDD: required
- 먼저: `E-BRIDGE-BUSY` 글자의 사용자 OK는 받았다(2026-11-02 "연결문구 바꿔", 같은 날 "다른 창으로 바꿔"로 다시 고침). 글자는 `phases/revenue-3-screen/step5.md`에 있고 명세에는 적지 않는다. 막는 것이 없다
- 메모: 글자 변경은 시험을 먼저 고쳐 실패를 본 뒤 `lib/errors.ts`를 바꾼다. 세 AC의 동작은 TASK-9·TASK-14가 이미 만들었으므로 화면 코드는 `BusyCard`의 고정 줄 하나를 빼는 것 말고 고치지 않고, 이미 증명하는 시험의 이름에 AC ID를 달거나 없는 시험을 더한다. OK 기록은 이 TASK가 `docs/mockups/revenue/README.md`에 줄 하나로 더한다. 옛 승인 시안(`docs/mockups/ui-90/...`)은 다시 쓰지 않는다
