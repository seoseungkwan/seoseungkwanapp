import * as XLSX from 'xlsx'
import { isMonth, monthRange, parseDateCell } from '@/lib/analytics/dates'
import { FIELDS, FIELD_LABELS, clipText, sheetProblem, type ColumnMapping, type Field } from './ai'

// 재고 엑셀: 양식 만들기·양식 알아보기·머리 줄 찾기·줄 읽기·미리 보기와 넣기 계획 (specs/inventory REQ-7503, design.md 4절).
// 브라우저에서 부르는 순수 함수다(xlsx만 쓴다). 파일 내려받기(XLSX.writeFile)·저장은 화면과 lib/storage/inventory.ts 몫이다.
// 분류·물품 타입은 칸 이름이 src/types/inventory.ts(InvCategory·InvItem)와 같아 그대로 넘어간다(필요한 칸만 적는다)

export type Cell = string | number | null
export type SheetRead = {
  template: boolean
  header: string[]
  rows: Cell[][]
  /** rows[i]의 엑셀 줄 번호(1부터). 빈 줄을 빼서 차례와 다를 수 있다 */
  rowNumbers: number[]
}

type Category = { id: string; name: string; sortOrder: number }
type Item = {
  id: string
  categoryId: string
  name: string
  unit: string
  minQty: number | null
  qty: number
  expiry: string | null
  vendor: string | null
  unitPrice: number | null
  sortOrder: number
  hidden: boolean
}

// 넣기 계획(design.md 3절 ImportPlan과 같은 모양, lib/storage/inventory.ts importItems가 받는다)
export type ImportAdd = { categoryName: string; name: string; unit: string; minQty: number | null; expiry: string | null; vendor: string | null; unitPrice: number | null }
export type ImportUpdate = {
  itemId: string
  unhide: boolean
  changes: Partial<{ categoryName: string; unit: string; minQty: number; expiry: string; vendor: string; unitPrice: number }>
}
export type ImportPlan = { newCategories: string[]; adds: ImportAdd[]; updates: ImportUpdate[]; counts: { name: string; qty: number }[] }

export type PreviewStatus = 'new' | 'update' | 'same' | 'skip'
export type PreviewRow = {
  row: number
  status: PreviewStatus
  /** 칸마다 보일 글자: 읽은 값(기한은 YYYY-MM-DD, 분류는 넣을 분류), 못 읽은 칸은 적힌 글자, 빈칸은 '' */
  values: Record<Field, string>
  /** 고치는 칸(FIELDS 차례). 지금 수량은 세기로 남고, 'hidden'은 안 쓰는 물품을 다시 씀 */
  changed: (Field | 'hidden')[]
  reason: string | null
}

export const TEMPLATE_HEADER: readonly string[] = FIELDS.map((field) => FIELD_LABELS[field])
export const TEMPLATE_MAPPING: ColumnMapping = { category: 0, name: 1, unit: 2, minQty: 3, qty: 4, expiry: 5, vendor: 6, unitPrice: 7 }
export const TEMPLATE_FILE = '재고-양식.xlsx'
const ITEMS_SHEET = '물품'
const GUIDE_SHEET = '쓰는 법'

const MAX_HEADER = 30
const MAX_ROWS = 500
const MAX_SAMPLE_ROWS = 5
const MAX_CELL = 40
const MAX_NAME = 40
const MAX_UNIT = 10
const MAX_VENDOR = 40
const MAX_CATEGORY = 20
const MAX_QTY = 1_000_000
const MAX_UNIT_PRICE = 100_000_000
const DEFAULT_UNIT = '개'
const QTY_REASON = '수량은 0 이상 숫자로 적어요'
const DATE_REASON = '날짜는 2027-03-01처럼 적어요'

// NFC, 제어 문자(줄바꿈·탭 포함)는 빈칸으로, 빈칸 여럿은 하나로, 앞뒤 빈칸 뗌
const clean = (value: string) => value.normalize('NFC').replace(/\p{Cc}+/gu, ' ').replace(/\s+/gu, ' ').trim()
const textOf = (value: Cell | undefined) => (value === null || value === undefined ? '' : clean(String(value)))
const length = (value: string) => Array.from(value).length

// ── 파일 읽기 ────────────────────────────────────────────

function cellValue(cell: XLSX.CellObject | undefined): Cell {
  if (!cell) return null
  if (cell.t === 'n') return typeof cell.v === 'number' && Number.isFinite(cell.v) ? cell.v : null
  if (cell.t === 's') {
    const text = String(cell.v ?? '').trim()
    return text === '' ? null : text
  }
  if (cell.t === 'b') return cell.v ? 'TRUE' : 'FALSE'
  return null // 오류·빈 칸
}

function rowCount(sheet: XLSX.WorkSheet): number {
  const ref = sheet['!ref']
  return ref ? XLSX.utils.decode_range(ref).e.r + 1 : 0
}

// r째 줄(0부터)의 A열부터 width칸
function rowAt(sheet: XLSX.WorkSheet, r: number, width: number): Cell[] {
  const data = sheet['!data']
  const cells: Cell[] = []
  for (let c = 0; c < width; c++) cells.push(cellValue(data ? data[r]?.[c] : sheet[XLSX.utils.encode_cell({ r, c })]))
  return cells
}

const headerText = (value: Cell) => (value === null ? '' : String(value).trim())

function trimEnd(texts: string[]): string[] {
  let end = texts.length
  while (end > 0 && texts[end - 1] === '') end--
  return texts.slice(0, end)
}

function isTemplateHeader(cells: Cell[]): boolean {
  const texts = trimEnd(cells.map(headerText))
  return texts.length === TEMPLATE_HEADER.length && texts.every((text, i) => text === TEMPLATE_HEADER[i])
}

// 빈칸 아닌 칸이 둘 이상인 첫 줄
function headerRowOf(sheet: XLSX.WorkSheet): number | null {
  const count = rowCount(sheet)
  for (let r = 0; r < count; r++) {
    if (rowAt(sheet, r, MAX_HEADER).filter((value) => value !== null).length >= 2) return r
  }
  return null
}

function dataRows(sheet: XLSX.WorkSheet, start: number, width: number): Pick<SheetRead, 'rows' | 'rowNumbers'> {
  const rows: Cell[][] = []
  const rowNumbers: number[] = []
  const count = rowCount(sheet)
  for (let r = start; r < count && rows.length < MAX_ROWS; r++) {
    const cells = rowAt(sheet, r, width)
    if (cells.every((value) => value === null)) continue
    rows.push(cells)
    rowNumbers.push(r + 1)
  }
  return { rows, rowNumbers }
}

// AC-7503.4: '물품' 시트 첫 줄이 양식 머리 그대로면 양식(AI 안 부름). 아니면 첫 시트에서 머리 줄을 찾는다. 못 읽으면 null
export function readSheet(bytes: ArrayBuffer): SheetRead | null {
  let book: XLSX.WorkBook
  try {
    book = XLSX.read(bytes, { type: 'array', dense: true, cellFormula: false, cellHTML: false, cellText: false })
  } catch {
    return null
  }
  const items = book.Sheets[ITEMS_SHEET]
  if (items && isTemplateHeader(rowAt(items, 0, MAX_HEADER))) {
    return { template: true, header: [...TEMPLATE_HEADER], ...dataRows(items, 1, TEMPLATE_HEADER.length) }
  }
  const first = book.SheetNames.length > 0 ? book.Sheets[book.SheetNames[0]] : undefined
  if (!first) return null
  const at = headerRowOf(first)
  if (at === null) return null
  const header = trimEnd(rowAt(first, at, MAX_HEADER).map(headerText))
  return { template: false, header, ...dataRows(first, at + 1, header.length) }
}

// 칸 맞춤 경로로 보낼 머리 줄 + 앞 5줄(칸마다 40자, 줄마다 머리와 같은 칸 수, 제어 문자 없음).
// problem: 보낼 칸들을 자르기 전 글자 전체로 본 개인정보 모양 검사(AC-7509.2). 40자 경계에 걸친 전화번호도 잡는다 → 참이면 보내지 않는다
export function sampleForAi(header: readonly string[], rows: readonly (readonly Cell[])[]): { header: string[]; rows: string[][]; problem: boolean } {
  const fullHeader = header.map(textOf)
  const fullRows = rows.slice(0, MAX_SAMPLE_ROWS).map((row) => header.map((_, i) => textOf(row[i])))
  const clip = (value: string) => clipText(value, MAX_CELL)
  return { header: fullHeader.map(clip), rows: fullRows.map((row) => row.map(clip)), problem: sheetProblem(fullHeader, fullRows) }
}

// ── 분류 맞추기 ──────────────────────────────────────────

export function categoryValues(rows: readonly (readonly Cell[])[], mapping: ColumnMapping): string[] {
  const column = mapping.category
  if (column === null) return []
  const values: string[] = []
  for (const row of rows) {
    const value = textOf(row[column])
    if (value !== '' && !values.includes(value)) values.push(value)
  }
  return values
}

// 엑셀 값 → 분류 이름: 이름이 같은 분류, 없으면 그 값(새 분류, 20자까지)
export function defaultCategoryMap(values: readonly string[], categories: readonly Category[]): Record<string, string> {
  const byName = new Map(categories.map((category) => [clean(category.name), category.name]))
  return Object.fromEntries(values.map((value) => [value, byName.get(clean(value)) ?? clipText(clean(value), MAX_CATEGORY)]))
}

// ── 미리 보기 ────────────────────────────────────────────

const NUMBER_TEXT = /^-?(?:\d{1,3}(?:,\d{3})+|\d+)$/
const MONTH_ONLY = /^(\d{2}|\d{4})[-./](\d{1,2})$/

// 정수 칸: 비면 null, 범위 안 정수(숫자 칸이나 쉼표 숫자 글자)가 아니면 'bad'
function intCell(value: Cell, min: number, max: number): number | null | 'bad' {
  if (value === null) return null
  let n: number
  if (typeof value === 'number') n = value
  else {
    const text = clean(value)
    if (text === '') return null
    if (!NUMBER_TEXT.test(text)) return 'bad'
    n = Number(text.replace(/,/g, ''))
  }
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : 'bad'
}

// 기한 칸: 날짜 칸·2027-03-01·2027.3.1·20270301, 달만 있는 27.08·2027-08은 그 달 마지막 날. 비면 null, 못 읽으면 'bad'
function expiryCell(value: Cell): string | null | 'bad' {
  if (value === null) return null
  if (typeof value === 'number') {
    const day = parseDateCell(value)
    if (day !== null) return day
  }
  const text = clean(String(value))
  if (text === '') return null
  const day = parseDateCell(text)
  if (day !== null) return day
  const m = MONTH_ONLY.exec(text)
  if (m) {
    const month = `${m[1].length === 2 ? `20${m[1]}` : m[1]}-${m[2].padStart(2, '0')}`
    if (isMonth(month)) return monthRange(month).to
  }
  return 'bad'
}

const compare = (a: number, b: number) => (a < b ? -1 : a > b ? 1 : 0)
const sortCategories = (categories: readonly Category[]) => [...categories].sort((a, b) => compare(a.sortOrder, b.sortOrder))

type PreviewInput = {
  rows: readonly (readonly Cell[])[]
  mapping: ColumnMapping
  /** 엑셀 분류 값(categoryValues) → 분류 이름(지금 분류 또는 새 분류) */
  categoryMap: Readonly<Record<string, string>>
  categories: readonly Category[]
  items: readonly Item[]
  /** readSheet의 rowNumbers. 없으면 머리 줄(1줄) 다음부터 센다 */
  rowNumbers?: readonly number[]
}

// AC-7503.5: 줄마다 새 물품·고침·그대로·건너뜀과 넣기 계획. 같은 이름 = 고침(빈칸은 옛 값), 새 이름 = 끝에 더함,
// 파일에 없는 물품 = 계획에 없음, 지금 수량이 적혀 있고 지금 값과 다르면 세기 줄(새 물품은 적혀 있으면 늘)
export function previewRows(input: PreviewInput): { rows: PreviewRow[]; plan: ImportPlan } {
  const { rows, mapping, categoryMap, categories, items, rowNumbers } = input
  const categoryByClean = new Map(categories.map((category) => [clean(category.name), category.name]))
  const categoryNameById = new Map(categories.map((category) => [category.id, category.name]))
  const firstCategory = sortCategories(categories)[0]?.name ?? null
  const itemByName = new Map<string, Item>()
  for (const item of items) if (!itemByName.has(clean(item.name))) itemByName.set(clean(item.name), item)

  const out: PreviewRow[] = []
  const plan: ImportPlan = { newCategories: [], adds: [], updates: [], counts: [] }
  const seen = new Set<string>()
  const useCategory = (name: string) => {
    if (!categoryByClean.has(clean(name)) && !plan.newCategories.includes(name)) plan.newCategories.push(name)
  }

  rows.forEach((cells, index) => {
    const row = rowNumbers?.[index] ?? index + 2
    const raw = Object.fromEntries(FIELDS.map((field) => [field, mapping[field] === null ? null : (cells[mapping[field]] ?? null)])) as Record<Field, Cell>
    const values = Object.fromEntries(FIELDS.map((field) => [field, textOf(raw[field])])) as Record<Field, string>
    const skip = (reason: string) => out.push({ row, status: 'skip', values, changed: [], reason })

    const name = values.name
    if (name === '') return skip('물품 이름이 없어요')
    if (seen.has(name)) return skip('같은 이름이 위 줄에 있어요')
    seen.add(name)
    if (length(name) > MAX_NAME) return skip(`물품 이름은 ${MAX_NAME}자까지예요`)
    const unit = values.unit
    if (length(unit) > MAX_UNIT) return skip(`단위는 ${MAX_UNIT}자까지예요`)

    const existing = itemByName.get(name)
    const minQty = intCell(raw.minQty, 0, MAX_QTY)
    if (minQty === 'bad') return skip(`${FIELD_LABELS.minQty} '${values.minQty}' → ${QTY_REASON}`)
    // 음수 지금 수량(입고 지우기로 생김)은 받은 양식을 그대로 올린 때만 받는다
    const readQty = intCell(raw.qty, -MAX_QTY, MAX_QTY)
    const qty = typeof readQty === 'number' && readQty < 0 && readQty !== existing?.qty ? 'bad' : readQty
    if (qty === 'bad') return skip(`${FIELD_LABELS.qty} '${values.qty}' → ${QTY_REASON}`)
    const unitPrice = intCell(raw.unitPrice, 0, MAX_UNIT_PRICE)
    if (unitPrice === 'bad') return skip(`${FIELD_LABELS.unitPrice} '${values.unitPrice}' → ${QTY_REASON}`)
    const expiry = expiryCell(raw.expiry)
    if (expiry === 'bad') return skip(`${FIELD_LABELS.expiry} '${values.expiry}' → ${DATE_REASON}`)
    const vendor = values.vendor === '' ? null : clipText(values.vendor, MAX_VENDOR)

    const categoryText = values.category
    const mapped = categoryText === '' ? '' : clean(Object.hasOwn(categoryMap, categoryText) ? categoryMap[categoryText] : categoryText) || categoryText
    const target = mapped === '' ? null : (categoryByClean.get(mapped) ?? clipText(mapped, MAX_CATEGORY))

    values.expiry = expiry ?? ''
    values.vendor = vendor ?? ''
    for (const [field, n] of [['minQty', minQty], ['qty', qty], ['unitPrice', unitPrice]] as const) values[field] = n === null ? '' : String(n)

    if (existing === undefined) {
      const categoryName = target ?? firstCategory
      if (categoryName === null) return skip('분류를 적어 주세요') // 분류가 하나도 없을 때만(재고 화면은 처음 분류를 넣고 연다)
      values.category = categoryName
      values.unit = unit === '' ? DEFAULT_UNIT : unit
      useCategory(categoryName)
      plan.adds.push({ categoryName, name, unit: values.unit, minQty, expiry, vendor, unitPrice })
      if (qty !== null) plan.counts.push({ name, qty })
      out.push({ row, status: 'new', values, changed: [], reason: null })
      return
    }

    values.category = target ?? ''
    const changes: ImportUpdate['changes'] = {}
    const changed: PreviewRow['changed'] = []
    if (target !== null && target !== categoryNameById.get(existing.categoryId)) {
      changes.categoryName = target
      changed.push('category')
      useCategory(target)
    }
    if (unit !== '' && unit !== existing.unit) {
      changes.unit = unit
      changed.push('unit')
    }
    if (minQty !== null && minQty !== existing.minQty) {
      changes.minQty = minQty
      changed.push('minQty')
    }
    if (qty !== null && qty !== existing.qty) {
      plan.counts.push({ name: existing.name, qty })
      changed.push('qty')
    }
    if (expiry !== null && expiry !== existing.expiry) {
      changes.expiry = expiry
      changed.push('expiry')
    }
    if (vendor !== null && vendor !== existing.vendor) {
      changes.vendor = vendor
      changed.push('vendor')
    }
    if (unitPrice !== null && unitPrice !== existing.unitPrice) {
      changes.unitPrice = unitPrice
      changed.push('unitPrice')
    }
    if (existing.hidden) changed.push('hidden')
    if (Object.keys(changes).length > 0 || existing.hidden) plan.updates.push({ itemId: existing.id, unhide: existing.hidden, changes })
    out.push({ row, status: changed.length > 0 ? 'update' : 'same', values, changed, reason: null })
  })

  return { rows: out, plan }
}

// ── 양식 만들기 ──────────────────────────────────────────

function guideRows(categories: readonly Category[]): string[][] {
  return [
    ['재고 양식 쓰는 법'],
    ["1. '물품' 시트에 한 줄에 물품 하나씩 적어요. 첫 줄(칸 이름)은 바꾸지 마세요."],
    ['2. 물품 이름은 꼭 적어요. 이름이 같은 물품은 적은 칸만 고치고, 새 이름은 새 물품으로 더해요.'],
    ['3. 빈칸은 지금 값을 그대로 둬요. 파일에 없는 물품은 지우지 않아요.'],
    ['4. 수량·단가는 0 이상 숫자로, 유통기한은 2027-03-01처럼 적어요. 27.08처럼 달만 적으면 그 달 마지막 날이에요.'],
    ['5. 지금 수량을 바꿔 적으면 올린 날 센 것으로 남아요.'],
    ['6. 분류는 아래 이름으로 적어요. 없는 이름을 적으면 새 분류를 만들어요.'],
    [],
    ['지금 분류'],
    ...categories.map((category) => [category.name]),
    [],
    ["예시 (이 시트의 줄은 넣지 않아요. '물품' 시트에 적어요)"],
    [...TEMPLATE_HEADER],
    [categories[0]?.name ?? '약품', '(예시) 거즈 5x5', '개', '100', '40', '2027-03-31', '(예시) 거래처', '50'],
  ]
}

// AC-7503.7: '물품' 시트 = 양식 머리 줄 + 숨기지 않은 물품(목록 차례: 분류 차례 → 물품 차례 → 이름), '쓰는 법' 시트
export function templateRows(categories: readonly Category[], items: readonly Item[]): { 물품: (string | number)[][]; '쓰는 법': string[][] } {
  const sorted = sortCategories(categories)
  const order = new Map(sorted.map((category, i) => [category.id, i]))
  const names = new Map(sorted.map((category) => [category.id, category.name]))
  const visible = items
    .filter((item) => !item.hidden)
    .sort(
      (a, b) =>
        compare(order.get(a.categoryId) ?? sorted.length, order.get(b.categoryId) ?? sorted.length) ||
        compare(a.sortOrder, b.sortOrder) ||
        a.name.localeCompare(b.name, 'ko'),
    )
  return {
    물품: [
      [...TEMPLATE_HEADER],
      ...visible.map((item) => [
        names.get(item.categoryId) ?? '',
        item.name,
        item.unit,
        item.minQty ?? '',
        item.qty,
        item.expiry ?? '',
        item.vendor ?? '',
        item.unitPrice ?? '',
      ]),
    ],
    '쓰는 법': guideRows(sorted),
  }
}

// 시트 둘의 통합 문서. 글자는 글자 칸으로 넣어 수식이 되지 않는다(aoa_to_sheet)
export function templateWorkbook(categories: readonly Category[], items: readonly Item[]): XLSX.WorkBook {
  const rows = templateRows(categories, items)
  const book = XLSX.utils.book_new()
  const itemsSheet = XLSX.utils.aoa_to_sheet(rows[ITEMS_SHEET])
  itemsSheet['!cols'] = [14, 32, 8, 10, 10, 18, 16, 12].map((wch) => ({ wch }))
  XLSX.utils.book_append_sheet(book, itemsSheet, ITEMS_SHEET)
  const guideSheet = XLSX.utils.aoa_to_sheet(rows[GUIDE_SHEET])
  guideSheet['!cols'] = [{ wch: 18 }, { wch: 24 }]
  XLSX.utils.book_append_sheet(book, guideSheet, GUIDE_SHEET)
  return book
}
