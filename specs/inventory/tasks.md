# 작업 분할: 재고 탭 (inventory)

> 기준 갈래 `feat-inventory`(운영 갈래 위). 같은 Phase의 TASK는 파일이 겹치지 않는다(각자 다른 작업 폴더에서 함께 만든다). 검토는 다 끝난 뒤 한 번.
> Phase 0(시안) → Phase 1(TASK-2~5) 합침 → Phase 2(TASK-6~14) 합침 → Phase 3(TASK-15~16). TASK마다 끝에 `npx tsc --noEmit -p .`·`npm run lint`가 지나야 한다.
> 화면은 PC 모양 하나뿐이다(폰 전용 모양·폰 너비 시험 없음, 넓은 표는 제 상자 안에서 옆으로 밀림).
> **배포 전 SQL**: 사이트를 올리기 전에 운영자가 `supabase/migrations/20261121100000_inventory.sql`을 Supabase SQL Editor에 붙여 한 번 실행하고, Storage에 `inventory-photos`가 Private인지 본다(`ssk-supabase-sql`). 일꾼은 실제 Supabase에 붙이지 않는다.

## TASK-1: 시안과 결정 기록
- Phase: 0
- AC: 화면 AC(REQ-7506~7511, REQ-7514)의 모양 기준. 시험 없음
- REQ: REQ-7506, REQ-7507, REQ-7508, REQ-7509, REQ-7510, REQ-7511, REQ-7514
- Files: docs/mockups/inventory/index.html, docs/mockups/inventory/notes.md
- Tests: 없음
- TDD: exempt — 클릭 시안(지어낸 물품 이름·숫자)과 결정 기록 문서다. 다른 일꾼이 그리고 사용자가 승인한다.

## TASK-2: 재고 표·권한·함수 SQL
- Phase: 1
- AC: AC-7501.1, AC-7501.2, AC-7501.3, AC-7501.4, AC-7501.5, AC-7501.6, AC-7501.7, AC-7514.2
- REQ: REQ-7501, REQ-7514
- Files: supabase/migrations/20261121100000_inventory.sql, supabase/inventory.rls.test.ts
- Tests: supabase/inventory.rls.test.ts
- TDD: required — design.md 1절(저장 순서 규칙: 물품 `last_counted_at`·입고 `created_at`). PGlite로 진짜 migration을 차례로 돌린다. 옛 RLS 시험은 고치지 않고 통과해야 한다.

## TASK-3: 재고 계산·비트 코드 목록
- Phase: 1
- AC: AC-7502.1, AC-7502.2, AC-7502.3, AC-7502.4, AC-7502.5, AC-7502.6, AC-7514.1
- REQ: REQ-7502, REQ-7514
- Files: src/lib/inventory/names.ts, src/lib/inventory/names.test.ts, src/lib/inventory/usage.ts, src/lib/inventory/usage.test.ts, src/lib/inventory/alerts.ts, src/lib/inventory/alerts.test.ts, src/lib/inventory/order.ts, src/lib/inventory/order.test.ts, src/lib/inventory/bitCodes.ts, src/lib/inventory/bitCodes.test.ts
- Tests: src/lib/inventory/names.test.ts, src/lib/inventory/usage.test.ts, src/lib/inventory/alerts.test.ts, src/lib/inventory/order.test.ts, src/lib/inventory/bitCodes.test.ts
- TDD: required — design.md 2절. 입력 타입은 파일 안에 적는다(`src/types/inventory.ts`는 TASK-5 몫).

## TASK-4: AI 질문·답 검사·엑셀 양식·오류 문구
- Phase: 1
- AC: AC-7503.1, AC-7503.2, AC-7503.3, AC-7503.4, AC-7503.5, AC-7503.6, AC-7503.7
- REQ: REQ-7503
- Files: src/lib/inventory/ai.ts, src/lib/inventory/ai.test.ts, src/lib/inventory/excel.ts, src/lib/inventory/excel.test.ts, src/types/errors.ts, src/lib/errors.ts, src/lib/errors.test.ts
- Tests: src/lib/inventory/ai.test.ts, src/lib/inventory/excel.test.ts, src/lib/errors.test.ts
- TDD: required — design.md 4절. 엑셀 시험 파일은 시험 안에서 `xlsx`로 만든다(지어낸 물품). `ImportPlan` 모양은 design.md 3절 그대로 이 파일 안에 적는다.

## TASK-5: 브라우저 저장
- Phase: 1
- AC: AC-7504.1, AC-7504.2, AC-7504.3, AC-7504.4, AC-7504.5, AC-7514.3
- REQ: REQ-7504, REQ-7514
- Files: src/types/inventory.ts, src/lib/storage/inventory.ts, src/lib/storage/inventory.test.ts
- Tests: src/lib/storage/inventory.test.ts
- TDD: required — design.md 3절. `formBackgrounds.test.ts`처럼 가짜 Supabase 클라이언트로 보낸 칸·부른 함수·차례를 본다.

## TASK-6: 명세서 읽기 경로 (사진 → Claude)
- Phase: 2
- AC: AC-7505.1, AC-7505.2, AC-7505.3, AC-7505.6, AC-7505.7
- REQ: REQ-7505
- Files: src/app/api/ai/claude.ts, src/app/api/ai/claude.test.ts, src/app/api/ai/inventory/invoice/route.ts, src/app/api/ai/inventory/invoice/route.test.ts
- Tests: src/app/api/ai/claude.test.ts, src/app/api/ai/inventory/invoice/route.test.ts
- TDD: required — design.md 5절. `claude.ts`는 `image`를 더하는 곳만 고치고 옛 시험은 그대로 통과. 경로 시험은 `forms/route.test.ts` 틀(가짜 readMe·Claude·Supabase), Claude에 간 몸통에 사진·`<items>` 말고 병원·사용자 값이 없는지 본다.

## TASK-7: 엑셀 칸 맞춤 경로
- Phase: 2
- AC: AC-7505.4, AC-7505.5, AC-7505.6, AC-7505.7
- REQ: REQ-7505
- Files: src/app/api/ai/inventory/columns/route.ts, src/app/api/ai/inventory/columns/route.test.ts
- Tests: src/app/api/ai/inventory/columns/route.test.ts
- TDD: required — design.md 5절. `callClaude`는 글자만 쓴다(TASK-6과 파일 안 겹침).

## TASK-8: 목록 도구 (물품·분류·순서)
- Phase: 2
- AC: AC-7506.1, AC-7506.2, AC-7506.3, AC-7506.4, AC-7506.5, AC-7506.6, AC-7514.5
- REQ: REQ-7506, REQ-7514
- Files: src/components/inventory/ItemsTool.tsx, src/components/inventory/ItemsTool.test.tsx, src/components/inventory/ItemForm.tsx, src/components/inventory/ItemForm.test.tsx, src/components/inventory/CategoryForm.tsx, src/components/inventory/CategoryForm.test.tsx
- Tests: src/components/inventory/ItemsTool.test.tsx, src/components/inventory/ItemForm.test.tsx, src/components/inventory/CategoryForm.test.tsx
- TDD: required — design.md 6절, 시안. 저장 모듈은 `vi.mock('@/lib/storage/inventory')`. 챙길 것·엑셀·비트 코드 고르기는 props(`alerts`·`onTemplate`·`onUpload`·`onBitPick`)로만 받는다.

## TASK-9: 세기·세기 종이
- Phase: 2
- AC: AC-7507.1, AC-7507.2, AC-7507.3, AC-7507.4
- REQ: REQ-7507
- Files: src/components/inventory/CountTool.tsx, src/components/inventory/CountTool.test.tsx, src/components/inventory/CountSheet.tsx, src/components/inventory/CountSheet.test.tsx
- Tests: src/components/inventory/CountTool.test.tsx, src/components/inventory/CountSheet.test.tsx
- TDD: required — design.md 6절, 시안. 인쇄는 `window.print` 가짜로 본다. [입고 적기]는 `onManualReceipt`를 부르는지만 본다.

## TASK-10: 들어온 기록 (사진·확인·기록)
- Phase: 2
- AC: AC-7508.1, AC-7508.2, AC-7508.3, AC-7508.4, AC-7508.5
- REQ: REQ-7508
- Files: src/components/inventory/ReceiptsTool.tsx, src/components/inventory/ReceiptsTool.test.tsx, src/components/inventory/ReceiptConfirm.tsx, src/components/inventory/ReceiptConfirm.test.tsx, src/components/inventory/PhotoDialog.tsx, src/components/inventory/invoiceClient.ts, src/components/inventory/invoiceClient.test.ts, src/components/inventory/photo.ts, src/components/inventory/photo.test.ts
- Tests: src/components/inventory/ReceiptsTool.test.tsx, src/components/inventory/ReceiptConfirm.test.tsx, src/components/inventory/invoiceClient.test.ts, src/components/inventory/photo.test.ts
- TDD: required — design.md 6절, 시안. 캔버스 줄이기는 `fitSize`와 크기 넘침 갈래만 시험하고(캔버스는 가짜), 경로는 fetch 가짜.

## TASK-11: 엑셀 양식 받기·올리기 화면
- Phase: 2
- AC: AC-7509.1, AC-7509.2, AC-7509.3, AC-7509.4, AC-7509.5
- REQ: REQ-7509
- Files: src/components/inventory/ExcelImport.tsx, src/components/inventory/ExcelImport.test.tsx, src/components/inventory/columnsClient.ts, src/components/inventory/columnsClient.test.ts
- Tests: src/components/inventory/ExcelImport.test.tsx, src/components/inventory/columnsClient.test.ts
- TDD: required — design.md 4·6절, 시안. 양식 파일이면 fetch가 한 번도 불리지 않음을 본다.

## TASK-12: 달별 화면
- Phase: 2
- AC: AC-7510.1, AC-7510.2
- REQ: REQ-7510
- Files: src/components/inventory/MonthlyTool.tsx, src/components/inventory/MonthlyTool.test.tsx
- Tests: src/components/inventory/MonthlyTool.test.tsx
- TDD: required — design.md 2·6절, 시안. 읽는 구간(첫날 − 1달 − 35일 ~ 달 끝)을 본다.

## TASK-13: 챙길 것·대시보드 칸
- Phase: 2
- AC: AC-7511.1, AC-7511.2, AC-7511.3
- REQ: REQ-7511
- Files: src/components/inventory/AlertBar.tsx, src/components/inventory/AlertBar.test.tsx, src/components/dashboard/inventory/InventoryAlertCard.tsx, src/components/dashboard/inventory/InventoryAlertCard.test.tsx
- Tests: src/components/inventory/AlertBar.test.tsx, src/components/dashboard/inventory/InventoryAlertCard.test.tsx
- TDD: required — design.md 6절, 시안. 대시보드 칸은 `children` 있음·없음 두 모양, 알림이 없거나 읽기 실패면 재고 칸을 그리지 않는지, `seed: false`로 읽는지 본다. 대시보드 울타리 시험(`src/components/dashboard/imports.test.ts`)이 그대로 지나야 한다.

## TASK-14: 비트 코드에서 고르기 판
- Phase: 2
- AC: AC-7514.4
- REQ: REQ-7514
- Files: src/components/inventory/BitCodePicker.tsx, src/components/inventory/BitCodePicker.test.tsx
- Tests: src/components/inventory/BitCodePicker.test.tsx
- TDD: required — design.md 6절, 시안. 저장 모듈은 가짜(`listBitCodeMonths`·`addBitItems`·`loadInventory`).

## TASK-15: 탭 열기 (화면 조립·메뉴·대시보드)
- Phase: 3
- AC: AC-7512.1, AC-7512.2, AC-7512.3, AC-7512.4
- REQ: REQ-7512
- Files: src/components/inventory/InventoryScreen.tsx, src/components/inventory/InventoryScreen.test.tsx, src/app/(app)/inventory/page.tsx, src/app/(app)/inventory/page.test.tsx, src/components/dashboard/live/BitDashboard.tsx, src/components/dashboard/live/BitDashboard.test.tsx, src/components/dashboard/summary/LiveDashboard.tsx, src/components/dashboard/summary/LiveDashboard.test.tsx, src/app/(app)/dashboard/page.test.tsx, src/components/shell/menu.ts, src/components/shell/shell.test.tsx, src/components/common/notReadyFeatures.ts, src/components/common/notReadyFeatures.test.ts, src/components/dashboard/briefing/features.ts, src/components/dashboard/briefing/features.test.ts, src/app/(app)/notReadyPages.test.tsx, src/app/titles.test.tsx, src/app/(app)/tabFrame.test.tsx
- Tests: src/components/inventory/InventoryScreen.test.tsx, src/app/(app)/inventory/page.test.tsx, src/components/dashboard/live/BitDashboard.test.tsx, src/components/dashboard/summary/LiveDashboard.test.tsx, src/app/(app)/dashboard/page.test.tsx, src/components/shell/shell.test.tsx, src/components/common/notReadyFeatures.test.ts, src/components/dashboard/briefing/features.test.ts, src/app/(app)/notReadyPages.test.tsx, src/app/titles.test.tsx, src/app/(app)/tabFrame.test.tsx
- TDD: required — design.md 6절. 준비 중 시험들은 재고가 준비 중 목록·표에서 빠지는 곳만 고친다(재고를 화면 있는 탭 목록에 더하고, `MenuHref`에 `/inventory`, tabFrame `SCREEN_DIR`에 `inventory`). 대시보드 시험들은 `@/lib/storage/inventory`를 가짜로 두는 것과 모양마다 재고 칸 자리·하나뿐인지만 더한다. 랜딩 글자는 고치지 않는다.

## TASK-16: 문서
- Phase: 3
- AC: AC-7513.1
- REQ: REQ-7513
- Files: docs/ADR.md, docs/ARCHITECTURE.md, plan.md, CLAUDE.md, src/lib/inventory/inventoryDocs.test.ts
- Tests: src/lib/inventory/inventoryDocs.test.ts
- TDD: required — ADR-034는 명세 때 이미 적었다. ARCHITECTURE는 'Claude API로 가는 것' 줄·DB 표(옛 `inventory_items · inventory_moves` 줄을 바꿈)·Storage 줄·폴더 줄·데이터 흐름 [재고](비트 코드는 `stats_months`에서 읽음 포함), CLAUDE.md는 예외 목록에 ADR-034 한 줄, plan.md는 §2-5·§5 DB 표·§10 '재고 단위 변환·유효기간'(유효기간만 다시 꺼냄)·'Claude API로 가는 것'만.
