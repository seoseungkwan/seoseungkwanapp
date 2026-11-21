// 재고 탭 타입과 한도 숫자 (specs/inventory design.md 3절, REQ-7504). 저장(lib/storage/inventory.ts)·계산(lib/inventory)·화면이 같이 쓴다.
// 칸 이름은 앱 모양(camelCase)이다. DB 칸(snake_case)으로 바꾸는 것은 저장 모듈만 한다.
// 한도 숫자는 supabase/migrations/20261121100000_inventory.sql 제약과 같다(글자 수는 DB char_length처럼 코드포인트로 센다)

export const CATEGORY_NAME_MAX = 20
export const ITEM_NAME_MAX = 40
export const UNIT_MAX = 10
export const VENDOR_MAX = 40
export const BIT_CODE_MAX = 100
export const ALIAS_MAX = 60
export const QTY_MAX = 1_000_000 // 최소 수량·센 수량·입고 수량
export const UNIT_PRICE_MAX = 100_000_000
export const AMOUNT_MAX = 1_000_000_000
export const COUNT_LINES_MAX = 1_000 // save_inventory_count 한 번에 보내는 줄
export const RECEIPT_LINES_MAX = 100 // 입고 한 건의 줄
export const PHOTO_MAX_BYTES = 3_000_000 // 명세서 사진 JPEG(버킷 한도와 같다)
export const INVENTORY_PHOTO_BUCKET = 'inventory-photos'
export const BIT_ITEM_UNIT = '개' // 비트 코드에서 고른 물품의 단위

/** 분류가 하나도 없을 때 넣는 처음 넷(sort_order 0~3) */
export const DEFAULT_CATEGORIES = ['약품', '치료 소모품', '보조기·깁스', '사무·생활'] as const

export type InvCategory = { id: string; name: string; sortOrder: number }

/** 물품 한 줄. qty = 지금 수량(DB 함수만 바꿈, 음수 가능), expiry = 가장 빠른 유통기한 'YYYY-MM-DD', 시각은 ISO 글자 */
export type InvItem = {
  id: string
  categoryId: string
  name: string
  unit: string
  minQty: number | null
  qty: number
  lastCountQty: number | null
  lastCountedAt: string | null
  expiry: string | null
  vendor: string | null
  unitPrice: number | null
  bitCode: string | null
  sortOrder: number
  hidden: boolean
  orderedAt: string | null
}

/** 세기 줄. day = 세기 날짜, savedAt = 줄을 저장·덮어쓴 시각 */
export type InvCountLine = { itemId: string; day: string; savedAt: string; qty: number }
/** 입고 줄. day = 명세서 날짜, savedAt = 입고 저장 시각 */
export type InvReceiptLine = { itemId: string; day: string; savedAt: string; qty: number; unitPrice: number | null; amount: number }
export type InvReceipt = { id: string; day: string; vendor: string | null; photoPath: string | null; lines: InvReceiptLine[] }
/** 명세서에서 맞춘 이름(normalizeName한 값) → 물품 */
export type InvAlias = { alias: string; itemId: string }

// 엑셀 넣기 계획. excel.ts(TASK-4)의 previewRows가 같은 모양을 제 파일 안 타입으로 만든다
export type ImportAdd = {
  categoryName: string
  name: string
  unit: string
  minQty: number | null
  expiry: string | null
  vendor: string | null
  unitPrice: number | null
}
export type ImportUpdate = {
  itemId: string
  unhide: boolean
  changes: Partial<{ categoryName: string; unit: string; minQty: number; expiry: string; vendor: string; unitPrice: number }>
}
export type ImportPlan = { newCategories: string[]; adds: ImportAdd[]; updates: ImportUpdate[]; counts: { name: string; qty: number }[] }

// ── 저장 모듈에 넘기는 값 ───────────────────────────────────

/** 분류·물품 한 번 읽기 */
export type InvInventory = { categories: InvCategory[]; items: InvItem[] }
/** 물품 더하기 칸(넣기 칸 권한 안). bitCode는 비트 코드와 이을 때만 */
export type InvItemFields = {
  categoryId: string
  name: string
  unit: string
  minQty: number | null
  expiry: string | null
  vendor: string | null
  unitPrice: number | null
  bitCode?: string | null
}
/** 물품 고치기: 바뀐 칸만. bitCode null = [연결 끊기], hidden = 안 씀 */
export type InvItemChanges = Partial<Omit<InvItemFields, 'bitCode'> & { bitCode: string | null; hidden: boolean }>
/** 세기 한 줄. qty·expiry는 열쇠가 있을 때만 보낸다(qty null = 안 셈, expiry null = 기한 비움) */
export type InvCountInput = { itemId: string; qty?: number | null; expiry?: string | null }
export type InvReceiptLineInput = { itemId: string; qty: number; unitPrice: number | null; amount: number }
/** 입고 저장. photo = 줄인 JPEG(없으면 null) */
export type InvReceiptInput = { day: string; vendor: string | null; photo: Blob | null; lines: InvReceiptLineInput[] }
/** 입고 고치기(사진은 바꾸지 않는다) */
export type InvReceiptEdit = { day: string; vendor: string | null; lines: InvReceiptLineInput[] }
/** 날짜 구간(둘 다 포함, 'YYYY-MM-DD') */
export type InvRange = { from: string; to: string }
/** stats_months 한 달의 처방 목록(rx는 bitCodeList가 검사한다) */
export type InvBitMonth = { month: string; rx: unknown }
/** 비트 코드에서 고른 줄 */
export type InvBitPick = { code: string; name: string }
