import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import {
  TEMPLATE_FILE,
  TEMPLATE_HEADER,
  TEMPLATE_MAPPING,
  categoryValues,
  defaultCategoryMap,
  previewRows,
  readSheet,
  sampleForAi,
  templateRows,
  templateWorkbook,
} from './excel'
import { sheetProblem } from './ai'

// 재고 엑셀 양식·머리 줄 찾기·줄 읽기·미리 보기 (specs/inventory REQ-7503, design.md 4절, TASK-4).
// 엑셀 파일은 시험 안에서 xlsx로 만든다. 물품·거래처·숫자는 모두 지어낸 것

type Cell = string | number | null
const HEADER = ['분류', '물품 이름', '단위', '최소 수량', '지금 수량', '가장 빠른 유통기한', '거래처', '단가']

function fileOf(sheets: Record<string, unknown[][]>): ArrayBuffer {
  const book = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), name)
  return XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}
const bytesOf = (book: XLSX.WorkBook) => XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
// 엑셀 날짜 칸 숫자(1899-12-30 = 0)
const serial = (ymd: string) => Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10))) / 86_400_000 + 25_569

const CATEGORIES = [
  { id: 'c2', name: '치료 소모품', sortOrder: 1 },
  { id: 'c1', name: '약품', sortOrder: 0 },
  { id: 'c4', name: '사무·생활', sortOrder: 3 },
  { id: 'c3', name: '보조기·깁스', sortOrder: 2 },
]
type Item = {
  id: string; categoryId: string; name: string; unit: string; minQty: number | null; qty: number; lastCountQty: number | null; lastCountedAt: string | null
  expiry: string | null; vendor: string | null; unitPrice: number | null; bitCode: string | null; sortOrder: number; hidden: boolean; orderedAt: string | null
}
const item = (over: Partial<Item> = {}): Item => ({
  id: 'i1', categoryId: 'c1', name: '리도카인 주사 2% 20mL', unit: '병', minQty: 10, qty: 26, lastCountQty: 26, lastCountedAt: '2026-11-14T01:00:00Z',
  expiry: '2026-12-05', vendor: '한빛약품', unitPrice: 1400, bitCode: null, sortOrder: 0, hidden: false, orderedAt: null, ...over,
})
const LIDO = item()
const SYRINGE = item({ id: 'i2', categoryId: 'c2', name: '주사기 3cc', unit: '개', minQty: 100, qty: 40, expiry: null, vendor: '메디팜', unitPrice: 95, sortOrder: 0 })
const PAPER = item({ id: 'i3', categoryId: 'c4', name: 'A4 용지', unit: '박스', minQty: 2, qty: 4, expiry: null, vendor: '오피스마트', unitPrice: 24000, sortOrder: 0 })
const OLD = item({ id: 'i4', categoryId: 'c1', name: '옛 주사약', unit: '병', minQty: null, qty: 0, expiry: null, vendor: null, unitPrice: null, sortOrder: 1, hidden: true })
const ITEMS = [PAPER, SYRINGE, LIDO, OLD]
const IDENTITY = { 약품: '약품', '치료 소모품': '치료 소모품', '보조기·깁스': '보조기·깁스', '사무·생활': '사무·생활' }

const preview = (rows: Cell[][], extra: Partial<Parameters<typeof previewRows>[0]> = {}) =>
  previewRows({ rows, mapping: TEMPLATE_MAPPING, categoryMap: IDENTITY, categories: CATEGORIES, items: ITEMS, ...extra })
// 템플릿 차례 여덟 칸 줄: [분류, 이름, 단위, 최소, 지금, 기한, 거래처, 단가]
const LIDO_ROW: Cell[] = ['약품', '리도카인 주사 2% 20mL', '병', 10, 26, '2026-12-05', '한빛약품', 1400]
const newRow = (name: string, over: Partial<Record<number, Cell>> = {}): Cell[] => {
  const row: Cell[] = ['치료 소모품', name, '개', 10, 12, null, '메디팜', 4500]
  for (const [i, v] of Object.entries(over)) row[Number(i)] = v ?? null
  return row
}

describe('AC-7503.4: readSheet 양식 알아보기·머리 줄 찾기·줄 읽기', () => {
  it('AC-7503.4: 양식 머리 여덟 칸은 정해 둔 글자이고 칸 맞춤은 0~7 그대로다', () => {
    expect(TEMPLATE_HEADER).toEqual(HEADER)
    expect(TEMPLATE_MAPPING).toEqual({ category: 0, name: 1, unit: 2, minQty: 3, qty: 4, expiry: 5, vendor: 6, unitPrice: 7 })
  })

  it("AC-7503.4: '물품' 시트 첫 줄이 양식 머리 그대로면(앞뒤 빈칸·뒤 빈칸 무시) template: true이고 빈 줄은 뺀다", () => {
    const head = ['  분류', '물품 이름 ', ...HEADER.slice(2), null, '  ']
    const result = readSheet(
      fileOf({
        물품: [head, LIDO_ROW, [], [null, '  ', null], ['사무·생활', ' A4 용지 ', '박스', 2, 6, null, null, 24000]],
      }),
    )
    expect(result).toEqual({
      template: true,
      header: HEADER,
      rows: [LIDO_ROW, ['사무·생활', 'A4 용지', '박스', 2, 6, null, null, 24000]],
      rowNumbers: [2, 5],
    })
  })

  it("AC-7503.4: '물품' 시트가 첫 시트가 아니어도 이름으로 찾는다", () => {
    const result = readSheet(fileOf({ '쓰는 법': [['쓰는 법'], ['분류', '이름']], 물품: [HEADER, LIDO_ROW] }))
    expect(result?.template).toBe(true)
    expect(result?.rows).toEqual([LIDO_ROW])
  })

  it('AC-7503.4: 양식 머리와 한 칸이라도 다르면 양식이 아니다(칸을 더하거나 이름을 바꿈)', () => {
    expect(readSheet(fileOf({ 물품: [[...HEADER, '메모'], LIDO_ROW] }))?.template).toBe(false)
    expect(readSheet(fileOf({ 물품: [['분류', '품명', ...HEADER.slice(2)], LIDO_ROW] }))?.template).toBe(false)
    expect(readSheet(fileOf({ 재고: [HEADER, LIDO_ROW] }))?.template).toBe(false)
  })

  it('AC-7503.4: 양식이 아니면 첫 시트에서 빈칸 아닌 칸이 둘 이상인 첫 줄이 머리 줄이다', () => {
    const result = readSheet(
      fileOf({
        재고현황: [['2026 재고 목록'], [], [null, '구분', ' 품명 ', '현재고', null], [null, '주사약', '리도카인', 26], [], [null, '소모품', '주사기', 40, '메모']],
        거래처: [['이름', '전화']],
      }),
    )
    expect(result).toEqual({
      template: false,
      header: ['', '구분', '품명', '현재고'],
      rows: [[null, '주사약', '리도카인', 26], [null, '소모품', '주사기', 40]],
      rowNumbers: [4, 6],
    })
  })

  it('AC-7503.4: 머리 줄은 30칸까지, 그 아래는 500줄까지 읽는다', () => {
    const wide = Array.from({ length: 35 }, (_, i) => `칸${i + 1}`)
    const result = readSheet(fileOf({ 시트: [wide, wide.map((_, i) => i)] }))
    expect(result?.header).toHaveLength(30)
    expect(result?.header[29]).toBe('칸30')
    expect(result?.rows[0]).toHaveLength(30)

    const many = Array.from({ length: 520 }, (_, i) => ['약품', `물품 ${i + 1}`])
    const long = readSheet(fileOf({ 시트: [['분류', '이름'], ...many] }))
    expect(long?.rows).toHaveLength(500)
    expect(long?.rows[499]).toEqual(['약품', '물품 500'])
    expect(long?.rowNumbers[499]).toBe(501)
  })

  it('AC-7503.4: 줄은 머리 줄 칸 수에 맞춰 모자란 칸은 null로 채우고, 머리 줄 밖 칸만 있는 줄은 빈 줄이다', () => {
    const result = readSheet(fileOf({ 시트: [['분류', '이름', '수량'], ['약품', '거즈'], [null, null, null, '메모만']] }))
    expect(result?.rows).toEqual([['약품', '거즈', null]])
  })

  it('AC-7503.4: 날짜 칸은 엑셀 날짜 숫자로, 참·거짓 칸은 글자로 읽는다', () => {
    const sheet = XLSX.utils.aoa_to_sheet([HEADER, ['약품', '거즈', '개', 1, 2, null, null, null]])
    sheet.F2 = { t: 'n', v: serial('2027-03-01'), z: 'yyyy-mm-dd' }
    sheet.G2 = { t: 'b', v: true }
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, sheet, '물품')
    expect(readSheet(bytesOf(book))?.rows[0]).toEqual(['약품', '거즈', '개', 1, 2, serial('2027-03-01'), 'TRUE', null])
  })

  it('AC-7503.4: 읽을 수 없거나 머리 줄이 없으면 실패(null)다', () => {
    expect(readSheet(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]).buffer)).toBeNull()
    expect(readSheet(fileOf({ 시트: [['한 칸뿐'], [null, '여기도 한 칸']] }))).toBeNull()
    expect(readSheet(fileOf({ 시트: [[]] }))).toBeNull()
  })
})

describe('AC-7503.3·AC-7503.4: sampleForAi 칸 맞춤에 보낼 머리 줄·앞 줄', () => {
  it('AC-7503.3: 머리 줄과 앞 5줄을 글자로 바꾸고 칸마다 40자로 자르며 줄마다 머리와 같은 칸 수다', () => {
    const rows: Cell[][] = Array.from({ length: 7 }, (_, i) => [`줄${i + 1}`, 26, null])
    rows[0][2] = '가'.repeat(45)
    const sample = sampleForAi(['구분', '품명', '비고'], rows)
    expect(sample.header).toEqual(['구분', '품명', '비고'])
    expect(sample.rows).toHaveLength(5)
    expect(sample.rows[0]).toEqual(['줄1', '26', '가'.repeat(40)])
    expect(sample.rows[4]).toEqual(['줄5', '26', ''])
  })

  it('AC-7503.3: 칸 안 줄바꿈·탭은 빈칸 하나로 바꾸고 앞뒤 빈칸을 뗀다(제어 문자를 보내지 않는다)', () => {
    const sample = sampleForAi(['최소\n수량', ' 단가 '], [['10\t개', null]])
    expect(sample).toEqual({ header: ['최소 수량', '단가'], rows: [['10 개', '']], problem: false })
  })

  it('AC-7509.2·AC-7503.3: 개인정보 모양은 40자로 자르기 전 칸 전체로 본다(전화번호가 40자 경계에 걸쳐도 problem)', () => {
    const cell = `${'가'.repeat(33)}010-1234-5678` // 전화 모양이 34째 글자에서 시작해 40자를 넘어 끝난다
    const sample = sampleForAi(['구분', '비고'], [['약품', cell]])
    expect(sample.rows[0][1]).toBe(`${'가'.repeat(33)}010-123`)
    expect(sheetProblem(sample.header, sample.rows)).toBe(false) // 자른 글자만 보면 놓친다
    expect(sample.problem).toBe(true)
    expect(sampleForAi([`${'가'.repeat(30)} a@hanbit.kr`, '이름'], []).problem).toBe(true)
    expect(sampleForAi(['구분', '비고'], [['약품', '가'.repeat(50)]]).problem).toBe(false)
  })

  it('AC-7509.2: 보내지 않는 6째 줄부터는 보지 않는다', () => {
    const rows: Cell[][] = Array.from({ length: 6 }, () => ['약품', '거즈'])
    rows[5][1] = '010-1234-5678'
    expect(sampleForAi(['구분', '이름'], rows).problem).toBe(false)
  })

  it('AC-7503.3: 40자는 UTF-16 길이로도 넘지 않는다(이모지 같은 글자를 반으로 자르지 않는다)', () => {
    const sample = sampleForAi(['이름'], [['😀'.repeat(30)]])
    expect(sample.rows[0][0]).toBe('😀'.repeat(20))
  })
})

describe('AC-7503.5: 분류 맞추기 categoryValues·defaultCategoryMap', () => {
  it('AC-7503.5: 엑셀 분류 값은 빈칸을 빼고 처음 나온 차례로 한 번씩이다', () => {
    const rows: Cell[][] = [['주사약', 'a'], [' 소모품 ', 'b'], [null, 'c'], ['주사약', 'd'], ['', 'e'], [3, 'f']]
    expect(categoryValues(rows, { ...TEMPLATE_MAPPING, category: 0 })).toEqual(['주사약', '소모품', '3'])
    expect(categoryValues(rows, { ...TEMPLATE_MAPPING, category: null })).toEqual([])
  })

  it('AC-7503.5: 기본은 이름이 같은 분류, 없으면 그 값(새 분류, 20자까지)이다', () => {
    const long = '가'.repeat(25)
    expect(defaultCategoryMap(['약품', '주사약', '사무·생활', long], CATEGORIES)).toEqual({
      약품: '약품',
      주사약: '주사약',
      '사무·생활': '사무·생활',
      [long]: '가'.repeat(20),
    })
  })
})

describe('AC-7503.5: previewRows 미리 보기와 넣기 계획', () => {
  it("AC-7503.5: 없는 이름은 '새 물품'이고 파일 줄 차례로 adds 끝에 붙으며 지금 수량은 세기 줄이 된다", () => {
    const result = preview([newRow('테이핑 테이프 5cm'), newRow('물티슈', { 0: '사무·생활', 2: '팩', 3: 5, 4: 10, 6: '오피스마트', 7: 1800 })])
    expect(result.rows.map((r) => [r.row, r.status, r.reason])).toEqual([
      [2, 'new', null],
      [3, 'new', null],
    ])
    expect(result.plan).toEqual({
      newCategories: [],
      adds: [
        { categoryName: '치료 소모품', name: '테이핑 테이프 5cm', unit: '개', minQty: 10, expiry: null, vendor: '메디팜', unitPrice: 4500 },
        { categoryName: '사무·생활', name: '물티슈', unit: '팩', minQty: 5, expiry: null, vendor: '오피스마트', unitPrice: 1800 },
      ],
      updates: [],
      counts: [
        { name: '테이핑 테이프 5cm', qty: 12 },
        { name: '물티슈', qty: 10 },
      ],
    })
  })

  it("AC-7503.5: 새 물품의 분류가 비면 첫 분류(분류 차례), 단위가 비면 '개'이고 지금 수량이 비면 세기 줄이 없다", () => {
    const result = preview([[null, '거즈 5x5', null, null, null, null, null, null]])
    expect(result.rows[0].status).toBe('new')
    expect(result.rows[0].values).toMatchObject({ category: '약품', name: '거즈 5x5', unit: '개' })
    expect(result.plan.adds).toEqual([{ categoryName: '약품', name: '거즈 5x5', unit: '개', minQty: null, expiry: null, vendor: null, unitPrice: null }])
    expect(result.plan.counts).toEqual([])
  })

  it("AC-7503.5: 같은 이름이고 바뀐 칸이 없으면 '그대로'이고 계획에 아무것도 없다", () => {
    const result = preview([LIDO_ROW])
    expect(result.rows[0]).toMatchObject({ row: 2, status: 'same', changed: [], reason: null })
    expect(result.plan).toEqual({ newCategories: [], adds: [], updates: [], counts: [] })
  })

  it("AC-7503.5: 같은 이름이고 바뀐 칸이 있으면 '고침'이고 바뀐 칸만 고친다(빈칸은 옛 값)", () => {
    const result = preview([['약품', '리도카인 주사 2% 20mL', null, 15, null, null, '', 1500]])
    expect(result.rows[0]).toMatchObject({ status: 'update', changed: ['minQty', 'unitPrice'] })
    expect(result.plan.updates).toEqual([{ itemId: 'i1', unhide: false, changes: { minQty: 15, unitPrice: 1500 } }])
    expect(result.plan.counts).toEqual([])
  })

  it("AC-7503.5: 분류·단위·기한·거래처가 바뀌면 그 칸만 고친다", () => {
    const result = preview([['사무·생활', '리도카인 주사 2% 20mL', '앰플', 10, 26, '2027-01-31', '메디팜', 1400]])
    expect(result.rows[0].changed).toEqual(['category', 'unit', 'expiry', 'vendor'])
    expect(result.plan.updates[0].changes).toEqual({ categoryName: '사무·생활', unit: '앰플', expiry: '2027-01-31', vendor: '메디팜' })
  })

  it('AC-7503.5: 지금 수량이 적혀 있고 지금 값과 다른 줄만 세기 줄이 된다(고침, 칸 고치기는 없음)', () => {
    const result = preview([
      ['약품', '리도카인 주사 2% 20mL', '병', 10, 30, '2026-12-05', '한빛약품', 1400],
      ['치료 소모품', '주사기 3cc', '개', 100, 40, null, '메디팜', 95],
    ])
    expect(result.rows.map((r) => [r.status, r.changed])).toEqual([
      ['update', ['qty']],
      ['same', []],
    ])
    expect(result.plan.updates).toEqual([])
    expect(result.plan.counts).toEqual([{ name: '리도카인 주사 2% 20mL', qty: 30 }])
  })

  it("AC-7503.5: 안 쓰는 물품과 같은 이름이면 '고침'이고 다시 쓴다", () => {
    const result = preview([['약품', '옛 주사약', '병', null, 0, null, null, null]])
    expect(result.rows[0]).toMatchObject({ status: 'update', changed: ['hidden'] })
    expect(result.plan.updates).toEqual([{ itemId: 'i4', unhide: true, changes: {} }])
  })

  it('AC-7503.5: 이름은 빈칸·제어 문자를 다듬어 견준다(NFC 포함)', () => {
    const nfd = '리도카인\n주사  2% 20mL'.normalize('NFD')
    const result = preview([['약품', ` ${nfd}  `, '병', 10, 26, '2026-12-05', '한빛약품', 1400]])
    expect(result.rows[0].status).toBe('same')
  })

  it('AC-7503.5: 같은 이름은 normalizeName이 같은 것이다 — 영문 글자 크기만 달라도 지금 물품과 맞추고, 세기 줄은 지금 물품 이름으로 남는다', () => {
    const result = preview([
      ['약품', '리도카인 주사 2% 20ML', '병', 10, 26, '2026-12-05', '한빛약품', 1400],
      ['치료 소모품', '주사기  3CC', '개', 100, 55, null, '메디팜', 95],
    ])
    expect(result.rows.map((r) => r.status)).toEqual(['same', 'update'])
    expect(result.plan.adds).toEqual([])
    expect(result.plan.counts).toEqual([{ name: '주사기 3cc', qty: 55 }])
  })

  it('AC-7503.5: 같은 파일 안 겹침도 normalizeName으로 본다(영문 글자 크기만 다른 둘째 줄은 건너뜀)', () => {
    const result = preview([newRow('Gauze 5x5'), newRow('gauze  5X5')])
    expect(result.rows.map((r) => r.status)).toEqual(['new', 'skip'])
    expect(result.rows[1].reason).toContain('같은 이름')
    expect(result.plan.adds.map((a) => a.name)).toEqual(['Gauze 5x5'])
    expect(result.plan.counts).toEqual([{ name: 'Gauze 5x5', qty: 12 }])
  })

  it('AC-7503.5: 건너뜀 — 물품 이름 없음·같은 파일 안 같은 이름 둘째 줄부터·이름 40자·단위 10자 넘음', () => {
    const result = preview([
      newRow('', { 2: '개' }),
      newRow('거즈'),
      newRow('거즈', { 4: 3 }),
      newRow('가'.repeat(41)),
      newRow('가'.repeat(40)),
      newRow('붕대', { 2: '가'.repeat(11) }),
    ])
    expect(result.rows.map((r) => r.status)).toEqual(['skip', 'new', 'skip', 'skip', 'new', 'skip'])
    const reasons = result.rows.map((r) => r.reason)
    expect(reasons[0]).toContain('물품 이름')
    expect(reasons[2]).toContain('같은 이름')
    expect(reasons[3]).toContain('40자')
    expect(reasons[5]).toContain('10자')
    expect(result.plan.adds.map((a) => a.name)).toEqual(['거즈', '가'.repeat(40)])
    expect(result.plan.counts).toEqual([
      { name: '거즈', qty: 12 },
      { name: '가'.repeat(40), qty: 12 },
    ])
  })

  it('AC-7503.5: 건너뜀 — 최소 수량·지금 수량·단가가 0 이상 정수가 아니면 "수량은 0 이상 숫자로 적어요"', () => {
    const bad: [number, Cell][] = [[4, '세 개'], [3, -1], [7, 1.5], [3, 1_000_001], [4, '1만'], [7, 100_000_001]]
    const result = preview(bad.map(([col, value], i) => newRow(`물품 ${i}`, { [col]: value })))
    for (const row of result.rows) {
      expect(row.status).toBe('skip')
      expect(row.reason).toContain('수량은 0 이상 숫자로 적어요')
    }
    expect(result.rows[0].reason).toContain("지금 수량 '세 개'")
    expect(result.rows[0].values.qty).toBe('세 개')
    expect(result.plan).toEqual({ newCategories: [], adds: [], updates: [], counts: [] })
  })

  it('AC-7503.5: 수량은 쉼표 숫자 글자도 받는다', () => {
    const result = preview([newRow('거즈', { 3: '1,000', 4: ' 12 ', 7: '18,500' })])
    expect(result.plan.adds[0]).toMatchObject({ minQty: 1000, unitPrice: 18500 })
    expect(result.plan.counts).toEqual([{ name: '거즈', qty: 12 }])
  })

  it('AC-7503.5: 음수 지금 수량은 지금 값과 같을 때만 그대로이고, 아니면 건너뜀이다', () => {
    const items = [...ITEMS, item({ id: 'i9', name: '탄력붕대', qty: -3, minQty: null, expiry: null, vendor: null, unitPrice: null, sortOrder: 2 })]
    const same = preview([['약품', '탄력붕대', '병', null, -3, null, null, null]], { items })
    expect(same.rows[0].status).toBe('same')
    const other = preview([['약품', '탄력붕대', '병', null, -2, null, null, null]], { items })
    expect(other.rows[0].status).toBe('skip')
  })

  it('AC-7503.5: 기한은 날짜 칸·2027-03-01·2027.3.1·달만 있는 27.08·2027-08(그 달 마지막 날)을 받는다', () => {
    const cases: [Cell, string][] = [
      [serial('2027-03-01'), '2027-03-01'],
      ['2027-03-01', '2027-03-01'],
      ['2027.3.1', '2027-03-01'],
      ['2027/03/01', '2027-03-01'],
      ['27.08', '2027-08-31'],
      [27.08, '2027-08-31'],
      ['2027-08', '2027-08-31'],
      ['2027.8', '2027-08-31'],
      ['28.02', '2028-02-29'],
    ]
    const result = preview(cases.map(([value], i) => newRow(`물품 ${i}`, { 5: value })))
    expect(result.rows.map((r) => r.status)).toEqual(cases.map(() => 'new'))
    expect(result.plan.adds.map((a) => a.expiry)).toEqual(cases.map(([, ymd]) => ymd))
    expect(result.rows.map((r) => r.values.expiry)).toEqual(cases.map(([, ymd]) => ymd))
  })

  it('AC-7503.5: 건너뜀 — 기한이 날짜 꼴이 아니면 그 까닭이다', () => {
    const result = preview(['내년 봄', '2027-02-30', '27.13', 12].map((value, i) => newRow(`물품 ${i}`, { 5: value })))
    for (const row of result.rows) {
      expect(row.status).toBe('skip')
      expect(row.reason).toContain('가장 빠른 유통기한')
      expect(row.reason).toContain('날짜')
    }
  })

  it("AC-7503.5: 분류 맞추기를 따르고, 새로 만들 분류는 넣는 줄에서 쓴 것만 한 번씩 나온다", () => {
    const categoryMap = { 주사약: '약품', 깁스류: '깁스류', 버림: '버릴 분류' }
    const mapping = { ...TEMPLATE_MAPPING }
    const result = preview(
      [newRow('거즈', { 0: '주사약' }), newRow('통깁스 3인치', { 0: '깁스류' }), newRow('통깁스 4인치', { 0: '깁스류' }), newRow('', { 0: '버림' }), newRow('붕대', { 0: '모르는 값' })],
      { categoryMap, mapping },
    )
    expect(result.plan.adds.map((a) => a.categoryName)).toEqual(['약품', '깁스류', '깁스류', '모르는 값'])
    expect(result.plan.newCategories).toEqual(['깁스류', '모르는 값'])
    expect(result.rows[0].values.category).toBe('약품')
  })

  it('AC-7503.5: 고침 줄의 새 분류도 새로 만들 분류에 든다', () => {
    const result = preview([['깁스류', '주사기 3cc', '개', 100, 40, null, '메디팜', 95]], { categoryMap: { 깁스류: '깁스류' } })
    expect(result.plan.updates).toEqual([{ itemId: 'i2', unhide: false, changes: { categoryName: '깁스류' } }])
    expect(result.plan.newCategories).toEqual(['깁스류'])
  })

  it('AC-7503.5: 칸 맞춤이 null인 칸은 읽지 않고, 다른 차례 칸도 맞춤대로 읽는다', () => {
    const mapping = { category: null, name: 0, unit: null, minQty: null, qty: 2, expiry: null, vendor: 1, unitPrice: null }
    const result = preview([['주사기 3cc', '메디팜', 55]], { mapping })
    expect(result.rows[0]).toMatchObject({ status: 'update', changed: ['qty'] })
    expect(result.plan.counts).toEqual([{ name: '주사기 3cc', qty: 55 }])
  })

  it('AC-7503.5: 엑셀 줄 번호는 rowNumbers를 따르고, 없으면 머리 줄 다음 줄부터 센다', () => {
    expect(preview([newRow('a'), newRow('b')], { rowNumbers: [4, 9] }).rows.map((r) => r.row)).toEqual([4, 9])
    expect(preview([newRow('a'), newRow('b')]).rows.map((r) => r.row)).toEqual([2, 3])
  })

  it('AC-7503.5: 거래처는 40자로 자른다', () => {
    const result = preview([newRow('거즈', { 6: '가'.repeat(45) })])
    expect(result.plan.adds[0].vendor).toBe('가'.repeat(40))
  })
})

describe('AC-7503.7: templateRows 양식 받기', () => {
  it("AC-7503.7: '물품' 시트는 양식 머리 줄 + 숨기지 않은 물품을 목록 차례로(기한 YYYY-MM-DD, 빈 값은 빈칸) 담는다", () => {
    const rows = templateRows(CATEGORIES, ITEMS)
    expect(rows['물품']).toEqual([
      HEADER,
      ['약품', '리도카인 주사 2% 20mL', '병', 10, 26, '2026-12-05', '한빛약품', 1400],
      ['치료 소모품', '주사기 3cc', '개', 100, 40, '', '메디팜', 95],
      ['사무·생활', 'A4 용지', '박스', 2, 4, '', '오피스마트', 24000],
    ])
  })

  it("AC-7503.7: 물품이 없으면 '물품' 시트는 머리 줄뿐이다", () => {
    expect(templateRows(CATEGORIES, [])['물품']).toEqual([HEADER])
    expect(templateRows(CATEGORIES, [OLD])['물품']).toEqual([HEADER])
  })

  it("AC-7503.7: '쓰는 법' 시트는 짧은 쓰는 법·지금 분류 이름·예시 한 줄을 담고 예시는 '물품' 시트에 없다", () => {
    const rows = templateRows(CATEGORIES, ITEMS)
    const guide = rows['쓰는 법']
    const text = guide.map((row) => row.join(' ')).join('\n')
    expect(text).toContain('물품 이름')
    expect(text).toContain('빈칸')
    for (const name of ['약품', '치료 소모품', '보조기·깁스', '사무·생활']) expect(guide.some((row) => row.length === 1 && row[0] === name), name).toBe(true)
    expect(text.indexOf('약품')).toBeLessThan(text.indexOf('치료 소모품'))
    const example = guide.filter((row) => row.length === HEADER.length && row.join() !== HEADER.join())
    expect(example).toHaveLength(1)
    expect(rows['물품'].some((row) => row[1] === example[0][1])).toBe(false)
    for (const row of guide) for (const cell of row) expect(typeof cell).toBe('string')
  })

  it('AC-7503.7: 파일 이름은 재고-양식.xlsx다', () => {
    expect(TEMPLATE_FILE).toBe('재고-양식.xlsx')
  })

  it("AC-7503.7: templateWorkbook은 '물품'·'쓰는 법' 두 시트이고, 받은 양식을 그대로 올리면 양식으로 읽혀 모두 '그대로'다", () => {
    const book = templateWorkbook(CATEGORIES, ITEMS)
    expect(book.SheetNames).toEqual(['물품', '쓰는 법'])
    const read = readSheet(bytesOf(book))
    expect(read?.template).toBe(true)
    expect(read?.rows).toHaveLength(3)
    const result = previewRows({ rows: read?.rows ?? [], mapping: TEMPLATE_MAPPING, categoryMap: IDENTITY, categories: CATEGORIES, items: ITEMS, rowNumbers: read?.rowNumbers })
    expect(result.rows.map((r) => r.status)).toEqual(['same', 'same', 'same'])
    expect(result.plan).toEqual({ newCategories: [], adds: [], updates: [], counts: [] })
  })

  it('AC-7503.7: 이름이 =로 시작해도 글자 칸이고 수식이 되지 않는다', () => {
    const book = templateWorkbook(CATEGORIES, [item({ name: '=SUM(1)' })])
    const cell = book.Sheets['물품'].B2
    expect(cell.v).toBe('=SUM(1)')
    expect(cell.f).toBeUndefined()
  })
})
