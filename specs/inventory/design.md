# 설계: 재고 탭 (inventory)

화면 모양·자리·글자는 시안 `docs/mockups/inventory/index.html`·`notes.md`가 기준이다(요구 AC 글자는 시안 글자). 화면은 PC 모양 하나뿐이다: 폰 전용 모양을 만들지 않고, 폰에서도 PC 화면 그대로이며 넓은 표는 제 상자(`overflow-x-auto`) 안에서 옆으로 밀린다. 아래는 자료·규칙·파일 짜임만 정한다.

## 1. SQL `supabase/migrations/20261121100000_inventory.sql` (TASK-2)
머리 주석: 실행 차례(20261028000000_auth.sql·20261101000200_stats.sql 뒤, **사이트 올리기 전**), 두 번 붙여도 그대로, 실행 뒤 Storage에 `inventory-photos`가 Private인지 본다. `my_hospital_id()`는 다시 만들지 않는다(글자·권한 그대로). 표는 `create table if not exists`(뒤에 더한 칸은 `add column if not exists`), 권한은 거두고 다시 주기, 정책은 지우고 다시 만들기, 함수는 `create or replace`.

모든 표: `hospital_id uuid not null default public.my_hospital_id() references public.hospitals(id) on delete cascade`, RLS 켬, `revoke all … from public, anon, authenticated`, 정책은 `hospital_id = (select public.my_hospital_id())`(읽기·지우기 using, 넣기 with check, 고치기 둘 다). 데스크 정책 없음. 글자 칸은 `= btrim(칸)` 이고 제어 문자 없음.

| 표 | 칸 (제약) | authenticated 권한 |
|---|---|---|
| `inventory_categories` | `id uuid pk default gen_random_uuid()`, `name` 1~20자, `sort_order int ≥ 0`, `created_at`; `unique(hospital_id, name)`, `unique(hospital_id, id)` | select, insert(name, sort_order), update(name, sort_order), delete |
| `inventory_items` | `id`, `category_id uuid not null` + `foreign key (hospital_id, category_id) references inventory_categories(hospital_id, id)`(on delete 없음 → 물품이 있는 분류 지우기는 23503), `name` 1~40자, `unit` 1~10자, `min_qty int null 0~1,000,000`, `qty int not null default 0 −1,000,000~1,000,000`(음수는 입고 지우기·고치기로만 생김), `last_count_qty int null`, `last_counted_at timestamptz null`, `expiry date null`, `vendor text null` 1~40자, `unit_price int null 0~100,000,000`, `bit_code text null` 1~100자, `sort_order int ≥ 0`, `hidden bool default false`, `ordered_at timestamptz null`, `created_at`; `unique(hospital_id, name)`, `unique(hospital_id, id)`, `unique index (hospital_id, upper(bit_code)) where bit_code is not null` | select, insert(category_id, name, unit, min_qty, expiry, vendor, unit_price, bit_code, sort_order, hidden), update(같은 칸 + ordered_at). `qty`·`last_count_*`는 함수만 |
| `inventory_counts` | `id`, `counted_on date`, `created_at`; `unique(hospital_id, counted_on)`, `unique(hospital_id, id)` | select |
| `inventory_count_lines` | `count_id` → `(hospital_id, count_id)` counts on delete cascade, `item_id` → `(hospital_id, item_id)` items, `qty int 0~1,000,000`, `saved_at timestamptz not null default now()`(줄을 저장·덮어쓴 시각); `primary key(count_id, item_id)` | select |
| `inventory_receipts` | `id`, `received_on date`, `vendor text null` 1~40자, `photo_path text null` (`photo_path ~ ('^' \|\| hospital_id::text \|\| '/[0-9a-f-]{36}\.jpg$')`), `created_at`(저장 시각, 고치기로 바뀌지 않음); `unique(hospital_id, id)` | select |
| `inventory_receipt_lines` | `id`, `receipt_id` → `(hospital_id, receipt_id)` receipts on delete cascade, `item_id` → `(hospital_id, item_id)` items, `qty int 1~1,000,000`, `unit_price int null 0~100,000,000`, `amount int 0~1,000,000,000` | select |
| `inventory_aliases` | `alias text` 1~60자(앱이 `normalizeName`한 값), `item_id` → `(hospital_id, item_id)` items, `created_at`; `primary key(hospital_id, alias)` | select, insert(alias, item_id), update(item_id), delete |

DB 함수(모두 `security definer set search_path = ''`, 처음에 `v_h := public.my_hospital_id()`, null이면 `42501`, 검사를 어기면 `22023`이고 아무것도 안 바꿈, `revoke all … from public, anon, authenticated` 뒤 authenticated에만 execute). **저장 순서 규칙**: 입고가 물품의 `last_counted_at`보다 먼저 저장됐으면(`inventory_receipts.created_at ≤ last_counted_at`) 그 세기에 들었다고 본다("들었음"). 지금 수량 = 마지막 센 수 + 그 뒤에 저장된 입고 줄 수량 합 — 함수들이 이 값을 `items.qty`에 맞춰 둔다.
- `save_inventory_count(p_day date, p_lines jsonb) returns integer`(넣은 세기 줄 수): `p_lines` = `[{ item_id, qty?: int|null, expiry?: 'YYYY-MM-DD'|null }]` 1~1,000개. 검사: `p_day ≤ (now() at time zone 'Asia/Seoul')::date`, `p_day ≥` 병원 마지막 세기 날짜, item_id 모두 내 병원 물품·겹침 없음, qty는 없음·null 또는 0~1,000,000. qty가 있는 줄이 하나라도 있을 때만 그날 세기(counts)를 없으면 만든다(기한만 있는 저장은 세기 날을 만들지 않음). qty가 있는 줄: count_line upsert(덮어쓸 때도 `saved_at = now()`), `items.qty = last_count_qty = qty`, `last_counted_at = now()`. `expiry` 열쇠가 있는 줄: `items.expiry = expiry`.
- `save_inventory_receipt(p_day date, p_vendor text, p_photo_path text, p_lines jsonb) returns uuid`: `p_lines` = `[{ item_id, qty, unit_price|null, amount }]` 1~100개, `p_day ≤` 한국 오늘. 입고(`created_at = now()`)·줄을 넣고 줄마다 `qty += 줄 qty`, `ordered_at = null`, unit_price가 있으면 `items.unit_price = unit_price`, `items.vendor`가 null이고 p_vendor가 있으면 채움.
- `update_inventory_receipt(p_id uuid, p_day date, p_vendor text, p_lines jsonb) returns void`: 같은 줄 검사. 옛 줄마다 "들었음"이 아니면 `qty -= 옛 qty`, 새 줄마다 "들었음"이 아니면 `qty += 새 qty`(물품마다 그 물품의 `last_counted_at`으로 본다), 줄을 바꿔 넣고 날짜·거래처를 고친다. 단가·거래처 채우기는 저장과 같고 `ordered_at`·`created_at`·`photo_path`는 그대로다.
- `delete_inventory_receipt(p_id uuid) returns text`(지운 입고의 photo_path, 없으면 null): 줄마다 "들었음"이 아니면 `qty -= 줄 qty`, 그다음 입고를 지운다(줄은 cascade). `ordered_at`은 되돌리지 않는다.
- `set_inventory_order(p_ids uuid[]) returns void`: 내 병원 물품만 `sort_order = 배열 자리 − 1`.

Storage: `insert into storage.buckets … ('inventory-photos', false, 3000000, array['image/jpeg']) on conflict do update`. `storage.objects` 정책 셋(읽기·넣기·지우기, 고치기 없음): `bucket_id = 'inventory-photos' and (storage.foldername(name))[1] = (select public.my_hospital_id())::text`.

시험 `supabase/inventory.rls.test.ts`: `formBackgrounds.rls.test.ts`·`clinicProfile.rls.test.ts`와 같은 PGlite 틀(storage 흉내 포함, 앞 migration 차례로 → 이 파일 → 다시 이 파일). 원장 A·B, A 데스크(`20261118100000_desk_accounts.sql`까지 돌림), 대기·거절·병원 없는 사용자·anon. 칸 권한은 `information_schema.column_privileges`로 정확히 견준다. 앞뒤 견주기로 다른 표·함수·`my_hospital_id()`·storage 정책이 그대로인지 본다.

## 2. 순수 함수 `src/lib/inventory/` (TASK-3)
네트워크·DB·React 없음. 입력 타입은 각 파일 안에 필요한 칸만 적는다(3절 `InvItem` 등과 칸 이름이 같아 그대로 넘어간다). 날짜는 `lib/analytics/dates.ts`.
- `names.ts`: `normalizeName(s)`(NFC, 앞뒤 빈칸 뗌, 빈칸 여럿 → 하나, 영문 작은 글자), `matchLines(lines: {name; itemId: string|null; unsure: boolean}[], items: {id; name; hidden}[], aliases: {alias; itemId}[]) → {…line, itemId: string|null, how: 'name'|'alias'|'ai'|'new'}[]`.
- `usage.ts`: `usageIntervals(counts: {itemId; day; savedAt; qty}[], receipts: {itemId; savedAt; qty}[]) → {itemId; from; to; month; used; missing}[]`(물품마다 세기 날짜 차례 이웃 둘 A·B, `A.savedAt < 입고 savedAt ≤ B.savedAt`, `month = monthOf(B.day)`, `used < 0`이면 `used: 0, missing: true`). `monthlyReport({ month, items, categories, counts, receipts: {itemId; day; savedAt; qty; amount}[] }) → { countDays; numbers: {cost; receipts; counts}; rows: {item; used|null; prevUsed|null; cost; prevCost; change; missing}[]; categories: {category; cost; prevCost; change}[]; total }`(구입비는 `day` = 명세서 날짜의 달, `change` = `'+4 (+13.3%)'`·`'새로 생김'`·`'–'`).
- `alerts.ts`: `inventoryAlerts(items, today) → { low: number; soon: number; rows: {item; kind: 'low'|'expiry'; days: number|null; ordered: boolean}[] }`(`days` = 기한 − 오늘, 음수 = 지남), `expiryText(days)`(`'n일 남음'`·`'오늘까지'`·`'n일 지났어요'`), `countWarning(entered, item: {qty; lastCountQty})`. 30일은 `addDays(today, 30)`.
- `order.ts`: `sortItems(items, categories)`(분류 sort_order → 물품 sort_order → 이름), `moveItem(sorted, id, toIndex) → string[]`, `moveBy(sorted, id, ±1) → string[]`(물품은 같은 `categoryId` 안에서만, 분류 목록은 `categoryId`가 없어 전체 안에서).
- `bitCodes.ts`: `bitCodeList(months: {month: string; rx: unknown}[], items: {name; bitCode}[]) → {code; name; count; taken}[]`, `searchBitCodes(list, q)`(요구 AC-7514.1).

## 3. 저장 `src/lib/storage/inventory.ts` + 타입 `src/types/inventory.ts` (TASK-5)
타입(칸 이름을 2절·4절이 같이 쓴다):
```ts
type InvCategory = { id: string; name: string; sortOrder: number }
type InvItem = { id: string; categoryId: string; name: string; unit: string; minQty: number | null; qty: number; lastCountQty: number | null
  lastCountedAt: string | null; expiry: string | null; vendor: string | null; unitPrice: number | null; bitCode: string | null
  sortOrder: number; hidden: boolean; orderedAt: string | null }
type InvCountLine = { itemId: string; day: string; savedAt: string; qty: number }
type InvReceiptLine = { itemId: string; day: string; savedAt: string; qty: number; unitPrice: number | null; amount: number } // day = 명세서 날짜, savedAt = 입고 저장 시각
type InvReceipt = { id: string; day: string; vendor: string | null; photoPath: string | null; lines: InvReceiptLine[] }
type InvAlias = { alias: string; itemId: string }
// 엑셀 넣기 계획. excel.ts(TASK-4)의 previewRows가 같은 모양을 제 파일 안 타입으로 만든다
type ImportAdd = { categoryName: string; name: string; unit: string; minQty: number | null; expiry: string | null; vendor: string | null; unitPrice: number | null }
type ImportUpdate = { itemId: string; unhide: boolean
  changes: Partial<{ categoryName: string; unit: string; minQty: number; expiry: string; vendor: string; unitPrice: number }> }
type ImportPlan = { newCategories: string[]; adds: ImportAdd[]; updates: ImportUpdate[]; counts: { name: string; qty: number }[] }
```
함수(브라우저 `supabaseBrowser()` + RLS, ADR-004. 실패는 `'failed'`/null/false, 이름·코드 겹침(23505)은 `'duplicate'`, 분류 지우기 23503은 `'in-use'`. 오류 글은 버린다. 던지지 않는다): `loadInventory({ seed = true } = {}) → { categories; items } | 'failed'`(`seed`이고 분류가 0개면 `DEFAULT_CATEGORIES` 넷 약품·치료 소모품·보조기·깁스·사무·생활을 sort_order 0~3으로 넣고 다시 읽음), `addCategory`·`renameCategory`·`deleteCategory`·`saveCategoryOrder(ids)`, `addItem(칸, qty|null, today) → { id; countFailed?: true } | 'duplicate' | 'failed'`(그 분류 끝 sort_order, qty가 있으면 오늘 `save_inventory_count`, 그것만 실패하면 `countFailed`)·`updateItem(id, 바뀐 칸)`·`setOrdered(id, on)`·`saveOrder(ids)`(rpc), `listAliases`·`saveAliases(InvAlias[])`(upsert)·`deleteAlias(alias)`, `lastCountDay() → string|null|'failed'`, `saveCount(day, lines)`(rpc), `saveReceipt({ day, vendor, photo: Blob|null, lines })`(사진 먼저 `<rpc('my_hospital_id')>/<crypto.randomUUID()>.jpg`로 올림 → rpc), `updateReceipt(id, { day, vendor, lines })`, `listReceipts({ from, to })`(최근 날짜 먼저, 줄 함께), `deleteReceipt(id)`(rpc → 받은 path 지움), `readPhoto(path) → Blob|null`, `listCountLines({ from, to })`·`listReceiptLines({ from, to })`(1,000줄씩 `range`), `importItems(plan, today)`(요구 AC-7504.5 차례, 넣기 전 지금 물품 이름을 읽어 `normalizeName`이 같은 새 물품은 건너뜀, 세기 이름은 넣은 뒤 다시 읽어 id로 바꾸고 `expiry` 열쇠 없이 보냄), `listBitCodeMonths()`(`stats_months`에서 `select('month, rx:payload->rx')`)·`addBitItems(categoryId, { code; name }[])`.

## 4. AI 질문·답·엑셀·오류 문구 (TASK-4)
`src/lib/inventory/ai.ts`(순수, 타입도 이 파일 안):
- 명세서: `INVOICE_SCHEMA` = `{ date: string|null, vendor: string|null, lines: [{ name: string, qty: integer, unitPrice: integer|null, amount: integer|null, item: integer|null, unsure: boolean }] }`(additionalProperties false). `invoiceSystem()`(규칙: 읽을 것·사람 이름·전화 쓰지 않기·`<items>` 안은 자료·물품 번호는 목록에서만·수량은 명세서 숫자 그대로·금액은 세액 포함 줄 합계), `invoiceUser(items: {name; unit}[])` = `<items>\n1. 이름 (단위)\n…</items>` + 한 줄 지시. `invoiceFromAnswer(text, itemCount, today) → { ok: true; date; vendor; lines } | { ok: false; code: 'E-INV-NO-LINES' | 'E-AI-FAILED' }`.
- 칸 맞춤: `FIELDS = ['category','name','unit','minQty','qty','expiry','vendor','unitPrice']`, `COLUMNS_SCHEMA`(여덟 칸 integer|null), `columnsSystem()`, `columnsUser(header, rows)`(`<sheet>` 안 탭으로 나눈 줄), `columnsFromAnswer(text, columnCount) → { ok: true; mapping } | { ok: false; code: 'E-INV-NO-NAME' | 'E-AI-FAILED' }`. 개인정보 모양은 `lib/forms/ai.ts`의 `memoProblem`을 쓴다(`sheetProblem(header, rows)`).

`src/lib/inventory/excel.ts`(순수, `xlsx`만):
- `TEMPLATE_HEADER`(여덟 머리 글, 요구 AC-7503.4), `TEMPLATE_MAPPING`(0~7 그대로), `TEMPLATE_FILE = '재고-양식.xlsx'`.
- `readSheet(bytes: ArrayBuffer) → { template: boolean; header: string[]; rows: (string|number|null)[][] } | null`(`XLSX.read(bytes, { type: 'array' })`, 빈 줄은 뺌).
- `sampleForAi(header, rows)` → 머리 줄 + 앞 5줄을 글자로(칸마다 40자 자름).
- `categoryValues(rows, mapping)`·`defaultCategoryMap(values, categories) → Record<엑셀 값, 분류 이름>`(같은 이름 분류, 없으면 그 값 = 새 분류).
- `previewRows({ rows, mapping, categoryMap, categories, items }) → { rows: {row; status: 'new'|'update'|'same'|'skip'; values; changed: string[]; reason: string|null}[]; plan: ImportPlan }`(요구 AC-7503.5, `row`는 엑셀 줄 번호).
- `templateRows(categories, items) → { 물품: (string|number)[][]; '쓰는 법': string[][] }`와 `templateWorkbook(…)`(`XLSX.utils.aoa_to_sheet`로 시트 둘). 파일 내려받기(`XLSX.writeFile`)는 화면 TASK.

오류 번호(`src/types/errors.ts`·`src/lib/errors.ts`): `E-INV-READ-FAILED`(재고를 읽지 못했어요 · [다시 읽기]) · `E-INV-SAVE-FAILED`(저장하지 못했어요 · 적은 값은 그대로 있어요. 인터넷 연결을 확인하고 잠시 뒤 다시 해 주세요) · `E-INV-DUPLICATE`(같은 이름이 이미 있어요, 안 쓰는 물품 포함 · 다른 이름) · `E-INV-IN-USE`(물품이 있는 분류는 지울 수 없어요 · 물품을 다른 분류로 옮긴 뒤) · `E-INV-COUNT-DATE`(세기 날짜는 마지막 세기 날짜~오늘) · `E-INV-PHOTO`(사진을 읽지 못했거나 너무 커요 · 다른 사진이나 [사진 없이 적기]) · `E-INV-NO-LINES`(사진에서 물품 줄을 찾지 못했어요 · 밝게 다시 찍거나 [사진 없이 적기]) · `E-INV-PRIVATE`(엑셀 앞 줄에 전화번호·주민번호·메일 주소 모양이 있어 보내지 않았어요 · 그 칸을 지우거나 [양식 받기]) · `E-INV-NO-NAME`(물품 이름 칸을 찾지 못했어요 · [양식 받기]로 받은 양식에 옮겨 적기) · `E-INV-EXCEL`(엑셀 파일을 읽지 못했어요 · .xlsx인지). E-AI-*는 있는 문구 그대로.

## 5. AI 경로 (서버, TASK-6·7)
`forms/route.ts`와 같은 틀: 몸통 검사 → `readMe()` → `me.hospital?.status === 'approved'`(데스크는 hospital이 null → 403) → 부르기 → `addUsage` → 답 검사. 응답 `Cache-Control: no-store`. `{ code }` 답마다 `console.error('[api/ai/inventory/<invoice|columns>]', code)` 한 줄.
- `src/app/api/ai/claude.ts`: `callClaude` 요청에 `image?: { mediaType: 'image/jpeg'; data: string }`를 더한다. 있으면 user content = `[{ type: 'image', source: { type: 'base64', media_type, data } }, { type: 'text', text: user }]`, 없으면 지금 그대로(글자). 다른 경로 동작은 바뀌지 않는다(시험 그대로 통과).
- `src/app/api/ai/inventory/invoice/route.ts`: `runtime 'nodejs'`, `maxDuration 120`, 부르기 한도 기본 `CALL_TIMEOUT_MS`. 몸통 `{ image }`만, `^/9j/[A-Za-z0-9+/]+={0,2}$`, 4,000,000자까지(Vercel 몸통 4.5MB 한도 안). 승인 뒤 `supabaseServer()`로 `inventory_items`에서 `id, name, unit`을 `hidden = false`, `sort_order` 차례 500개 읽음(RLS가 내 병원만). effort `medium`. 답 번호 n → 그 차례 물품 id. 200 `{ date, vendor, lines }`.
- `src/app/api/ai/inventory/columns/route.ts`: `maxDuration 60`, 한도 45초, effort `low`. 몸통 `{ header, rows }`만(요구 AC-7505.4). `sheetProblem`이면 422 `E-INV-PRIVATE`(부르지 않음). 200 `{ mapping }`.
- 오류 상태: 400·401·403 몸통 없음, `E-INV-NO-LINES`·`E-INV-NO-NAME`·`E-INV-PRIVATE` 422, `E-INV-READ-FAILED` 502, E-AI-BUSY 503·E-AI-LIMIT 402·E-AI-FAILED 502.

## 6. 화면 `src/components/inventory/`
도구마다 자기 자료를 `lib/storage/inventory.ts`로 읽는다. 같은 Phase 부품끼리는 서로 불러오지 않고, 이어 주기는 TASK-15 `InventoryScreen`이 props로 한다. 표·단추는 `ds`, 오류는 `ErrorCard`, 금액 글은 `components/revenue/money.ts`, 오른쪽 판은 예약 탭 `AddPanel` 모양.
- TASK-8 `ItemsTool.tsx`(`{ today; reloadKey?; onChanged?; alerts?: ReactNode; onTemplate?: () => void; onUpload?: (file: File) => void; onBitPick?: () => void }`): 챙길 것 자리(`alerts`) → 머리 줄 단추 → 분류별 표 → 숨긴 물품 줄 → 빈 상태. `ItemForm.tsx`(물품 더하기·고치기 판, 별칭 목록·비트 코드 [연결 끊기]·안 씀), `CategoryForm.tsx`(분류 고치기 판). [순서 바꾸기] 모드: 끌기(포인터 이벤트, 라이브러리 없음, 손잡이 아이콘 grip은 이 TASK가 `Icon`에 더하지 않고 부품 안 SVG) + ▲▼, [다 됐어요] = `saveOrder`, 실패면 옛 차례.
- TASK-9 `CountTool.tsx`(`{ today; reloadKey?; onChanged?; onManualReceipt?: () => void }`, 머리 글의 '그 뒤 들어온 기록 n건'은 `listCountLines`(마지막 세기 날)·`listReceipts`의 저장 시각으로 센다) + `CountSheet.tsx`(미리 보기 A4 종이). 인쇄 규칙(`@page A4 portrait`, 인쇄 때 종이만 보임)은 `CountSheet` 안 `<style>` 하나.
- TASK-10 `ReceiptsTool.tsx`(`{ today; startManual?: boolean; onChanged? }`)·`ReceiptConfirm.tsx`(새로·사진 없이·고치기 세 모양)·`PhotoDialog.tsx`·`invoiceClient.ts`(fetch `/api/ai/inventory/invoice`, 답 모양 검사)·`photo.ts`(`fitSize(w, h, 1600)` 순수 + 캔버스로 JPEG 0.85, 3,000,000바이트 넘으면 0.7로 한 번 더). 사진 보기는 `readPhoto` Blob → `URL.createObjectURL`(CSP `img-src blob:` 이미 있음), 닫으면 revoke.
- TASK-11 `ExcelImport.tsx`(넣기 실패 뒤 다시 넣기 = `loadInventory` → `previewRows` 다시 → `importItems`, 개인정보 모양이면 양식 칸 이름과 똑같은 머리 글만 맞춘 칸 맞춤으로 시작): `downloadTemplate(): Promise<boolean>`(읽고 `XLSX.writeFile`)과 `ExcelPreview`(`{ file: File; onDone: () => void; onCancel: () => void }`, 칸 맞춤·분류 맞추기·미리 보기·[양식 받기]·[다른 파일 올리기]·[넣기]) + `columnsClient.ts`.
- TASK-12 `MonthlyTool.tsx`(`{ today }`).
- TASK-13 `AlertBar.tsx`(챙길 것, `{ today; reloadKey?; onChanged? }`, [주문함]·[주문 취소]) + `src/components/dashboard/inventory/InventoryAlertCard.tsx`(`'use client'`, `{ today; children?: ReactNode }`, `loadInventory({ seed: false })`로 읽음: `children`이 있으면 알림이 있을 때 12칸 그리드 왼쪽 1~7 `children`·오른쪽 9~12 재고 칸, 없으면 재고 칸만(대시보드 맨 위 자리, 아래 여백). 알림 0·읽는 중·실패면 재고 칸을 그리지 않는다(`children`만). 대시보드 울타리 시험 `imports.test.ts`가 막는 것을 불러오지 않음).
- TASK-14 `BitCodePicker.tsx`(`{ onAdded: () => void; onClose: () => void }`, 스스로 `loadInventory`·`listBitCodeMonths`를 읽고 `bitCodeList`·`searchBitCodes`·`addBitItems`).
- TASK-15 `InventoryScreen.tsx`(`{ today }`): h1 → 도구 단추 줄(`components/patients/ToolRow` 모양, `?tool=list|count|in|month`) → 도구. 목록 도구 = `ItemsTool`에 `alerts={<AlertBar …/>}`, `onTemplate={downloadTemplate}`, `onUpload` → 목록 자리에 `ExcelPreview`, `onBitPick` → `BitCodePicker`; `CountTool onManualReceipt` → `?tool=in` + `startManual`. 저장 뒤 `reloadKey`를 올린다. 페이지 `src/app/(app)/inventory/page.tsx`: `dynamic = 'force-dynamic'`, `metadata.title = '재고'`, `<InventoryScreen today={todayInKorea()} />`. 대시보드(비트 자료와 상관없이 늘): `BitDashboard.tsx`는 숫자가 있으면 `sentence={<InventoryAlertCard today={today}><ReportBlock …/></InventoryAlertCard>}`로 감싸고, 그 밖의 모양이면 `DashboardHome` 앞에 `<InventoryAlertCard today={today} />`를 둔다. `LiveDashboard.tsx`는 뼈대·읽기 실패 카드 앞에 `<InventoryAlertCard today={today} />`를 둔다(BitDashboard를 놓을 때는 두지 않음 → 한 화면에 하나).

## 7. 데이터 흐름
```
[목록·세기·입고 확인·엑셀] 브라우저 → lib/storage/inventory.ts → Supabase(RLS 원장만) / DB 함수(수량 계산)
[입고 사진] 사진 → 브라우저가 줄임 → /api/ai/inventory/invoice: 승인 확인 → DB에서 물품 이름 → Claude(사진 + 번호 목록) → 답 검사 → 확인 화면
           [저장] → 사진 Storage inventory-photos → save_inventory_receipt → 별칭 저장
[엑셀] 양식이면 바로 / 아니면 머리 줄 + 앞 5줄 → /api/ai/inventory/columns → 칸 맞춤 → 브라우저가 모든 줄 읽기 → 미리 보기 → importItems
[비트 코드] stats_months의 payload->rx(이미 저장된 처방 코드·이름·환자 수) → bitCodeList → 고르기 → inventory_items 넣기 (서버·Claude로 가지 않음)
[달별] 세기 줄(세기 날짜)·입고 줄(명세서 날짜 또는 저장 날짜, 고른 달 첫날 − 1달 − 35일 ~ 달 끝) → monthlyReport → 화면
```

## 8. 결정 (Claude가 정함)
- 지금 수량은 `items.qty`에 두고 DB 함수가 **저장 순서**로 맞춘다(총괄 결정): 세기 저장 = 센 수, 입고 저장 = 더함, 입고 고치기·지우기 = 마지막 세기 저장 뒤에 저장된 입고만 빼고 더함. 쓴 양의 '그 사이 입고'도 저장 시각으로 고른다. 쓴 양의 달은 세기 날짜, 구입비의 달은 명세서 날짜다. 남는 틈: 세기 종이를 적은 뒤·저장하기 전에 저장한 입고는 세기에 든 것으로 본다(다음 세기가 바로잡는다).
- 입고 고치기는 저장 시각을 바꾸지 않는다(지우고 다시 넣으면 이미 세기에 든 입고가 또 더해져서). 사진은 고치기에서 바꾸지 않는다.
- 지금 수량은 세기로만 바뀐다(물품 고치기는 읽기만, `qty` 칸 권한 없음). 물품 더하기·엑셀의 처음 수량도 그날 세기로 적어 쓴 양 계산이 맞다.
- 세기는 마지막 세기 날짜보다 앞 날짜로 넣을 수 없다. 같은 날은 덮어쓰고, 덮어쓴 줄의 저장 시각은 새 시각이다. 쓴 양이 0보다 작은 사이는 0으로 세고 '빠진 입고' 표시. 첫 세기 앞은 쓴 양이 없다.
- 분류별 합계는 구입비(원)만이다(단위가 달라 쓴 양은 더하지 않는다). 분류는 물품의 지금 분류로 묶는다.
- [주문함]은 '주문하세요' 줄에만 있다(총괄 결정). 기한 알림은 주문해도 남는다. 대시보드 칸은 알림이 있을 때만, 비트 자료와 상관없이 모든 모양에서 그린다(총괄 결정): 비트 숫자가 있으면 시안대로 보고 문장 오른쪽, 아니면 내용 맨 위. 대시보드에서 읽을 때는 처음 분류를 넣지 않는다(보기만 해도 자료가 생기지 않게).
- 금액 = 명세서 줄 합계(세액이 따로 있으면 더함), 없으면 수량 × 단가. 사람이 확인 화면에서 고친다. 입고 저장·고치기는 단가를 적은 줄의 물품 단가를 그 값으로 바꾼다.
- 별칭은 확인하고 저장한 줄만(읽은 이름 ≠ 고른 물품 이름일 때). 이름 같음 → 별칭 → AI 차례라 AI가 틀려도 기억한 이름이 이긴다.
- 사진은 한 입고에 한 장, 3,000,000바이트까지, 지울 때까지 둔다. 올린 뒤 저장(올리기 실패면 저장 안 함). 저장이 실패해 남은 사진은 내 병원 폴더 안 쓰레기일 뿐이라 지우지 않는다.
- 들어온 기록은 오늘까지 90일만 보인다(달 묶음, 이번 달만 펼침).
- 엑셀 넣기는 한 번에 묶지 않는다(DB 함수 없음). 이름으로 맞추므로 실패하면 같은 파일을 다시 넣으면 된다. 같은 이름이 안 쓰는 물품이면 다시 쓰게 한다. 지금 수량이 지금 값과 같은 줄은 세기로 적지 않는다(받은 양식을 그대로 올려도 기록·수량이 바뀌지 않게).
- 비트 코드 목록은 `stats_months`의 `rx`에서만 읽는다: 이름이 있는 곳이 여기뿐이다(`sales_day_codes`는 이름이 없고 `sales_codes`는 옛 달 합계라 더 쓰지 않는다). 그래서 고르기 판의 "n건"은 달마다 그 처방을 받은 환자 수의 합(통계 탭 숫자)이다. 같은 이름 물품이 있는 코드도 "이미 있음"(이름이 겹쳐 넣을 수 없어서). 이름은 40자로 자른다.

## 9. 시안과 다른 곳 (받아들임)
- 세기 종이에 쪽 번호가 없다(브라우저 인쇄가 장을 나눈다).
- 달별 숫자 칸은 "빠진 입고 없음"/"빠진 입고 n개"다(시안 "빠진 주 없음").
- 비트 코드 고르기 판의 출처 줄은 "통계에서 불러온 비트 자료(처음 달 ~ 끝 달)의 처방 코드예요."다.
- 세기 머리 글은 "지난 세기 M월 D일(요일) · 그 뒤 들어온 기록 n건"이다(요구 AC-7507.1).

## 10. 위험
- SQL 먼저: 붙이기 전에 사이트를 올리면 재고 탭은 읽기 실패 카드다(다른 탭은 그대로, 대시보드 칸은 그리지 않음). 배포 전 `ssk-supabase-sql`로 이 파일을 SQL Editor에 붙이고 Storage 버킷이 Private인지 본다.
- 사진에 환자 이름이 찍힐 수 있다(보조기 주문서 등) → 늘 보이는 안내, Claude 규칙, 답의 개인정보 모양 검사. 모양 없는 이름은 막지 못한다(ADR-034 트레이드오프).
- 주소록 명세(같은 때 다른 갈래)도 `menu.ts`·`notReadyFeatures.ts`·`features.ts`·탭 시험을 고친다 → 나중에 합치는 쪽이 맞춰 고친다.
- `stats_months` 줄이 많으면(몇 해) 고르기 판 열 때 읽는 양이 늘지만 `rx`만 고른다.
- 한 번 읽기 비용: 사진 한 장 + 물품 목록이면 대략 30~80원, 칸 맞춤은 그보다 적다. 한도는 따로 두지 않는다(서식 AI 정리와 같음).
