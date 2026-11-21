// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as XLSX from 'xlsx'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { todayInKorea } from '@/lib/analytics/dates'
import { errorInfo } from '@/lib/errors'
import { TEMPLATE_FILE, TEMPLATE_HEADER, TEMPLATE_MAPPING, categoryValues, defaultCategoryMap, previewRows, readSheet } from '@/lib/inventory/excel'
import { importItems, loadInventory } from '@/lib/storage/inventory'
import { nestedBoxes } from '@/testing/boxes'
import type { ErrorCode } from '@/types/errors'
import type { InvCategory, InvItem } from '@/types/inventory'
import { ExcelPreview, downloadTemplate } from './ExcelImport'

// 엑셀 양식 받기·올리기 화면 (spec inventory TASK-11, REQ-7509 · AC-7509.1~7509.4, design.md 4·6절, 시안 ?s=excel·excel-own).
// 저장 모듈(loadInventory·importItems)과 파일 내려받기(XLSX.writeFile)·fetch만 가짜다. 엑셀 읽기·미리 보기 계산(lib/inventory/excel.ts)은 진짜를 쓴다.
// 올리는 엑셀은 시험 안에서 xlsx로 만든다. 물품·거래처·숫자는 지어낸 값이다
vi.mock('xlsx', async (importOriginal) => ({ ...(await importOriginal<typeof import('xlsx')>()), writeFile: vi.fn() }))
vi.mock('@/lib/storage/inventory', () => ({ loadInventory: vi.fn(), importItems: vi.fn() }))

const load = vi.mocked(loadInventory)
const importMock = vi.mocked(importItems)
const writeFile = vi.mocked(XLSX.writeFile)
const fetchMock = vi.fn<typeof fetch>()

const CATS: InvCategory[] = [
  { id: 'c1', name: '약품', sortOrder: 0 },
  { id: 'c2', name: '치료 소모품', sortOrder: 1 },
  { id: 'c3', name: '보조기·깁스', sortOrder: 2 },
  { id: 'c4', name: '사무·생활', sortOrder: 3 },
]
const item = (id: string, categoryId: string, name: string, unit: string, minQty: number | null, qty: number, rest: Partial<InvItem> = {}): InvItem => ({
  id,
  categoryId,
  name,
  unit,
  minQty,
  qty,
  lastCountQty: qty,
  lastCountedAt: '2026-11-14T01:00:00.000Z',
  expiry: null,
  vendor: null,
  unitPrice: null,
  bitCode: null,
  sortOrder: 0,
  hidden: false,
  orderedAt: null,
  ...rest,
})
const ITEMS: InvItem[] = [
  item('i1', 'c1', '히알루론산 주사 2mL', '개', 10, 4, { expiry: '2027-03-31', vendor: '한빛약품', unitPrice: 18500 }),
  item('i2', 'c1', '리도카인 주사 2% 20mL', '병', 10, 26, { expiry: '2026-12-05', vendor: '한빛약품', unitPrice: 1400, sortOrder: 1 }),
  item('i3', 'c2', '주사기 3cc', '개', 100, 40, { vendor: '메디팜', unitPrice: 95 }),
  item('i4', 'c4', 'A4 용지', '박스', 2, 4, { vendor: '오피스마트', unitPrice: 24000 }),
  item('i5', 'c2', '옛 거즈', '개', null, 0, { hidden: true, sortOrder: 1 }),
]

type Aoa = (string | number | null)[][]
function xlsxFile(name: string, sheets: [string, Aoa][]): File {
  const book = XLSX.utils.book_new()
  for (const [sheetName, aoa] of sheets) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(aoa), sheetName)
  const bytes = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return new File([bytes], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

// [양식 받기]로 받은 양식을 고쳐 올린 파일: 2 그대로 · 3·4·5·10 고침 · 6·9 새 물품 · 7 건너뜀 · 8 빈 줄
const TEMPLATE_ROWS: Aoa = [
  [...TEMPLATE_HEADER],
  ['약품', '히알루론산 주사 2mL', '개', 10, 4, '2027-03-31', '한빛약품', 18500],
  ['약품', '리도카인 주사 2% 20mL', '병', 15, 26, '2026-12-05', '한빛약품', 1400],
  ['치료 소모품', '주사기 3cc', '개', 100, 40, null, '메디팜', 100],
  ['사무·생활', 'A4 용지', '박스', 2, 6, null, '오피스마트', 24000],
  ['치료 소모품', '테이핑 테이프 5cm', '개', 10, 12, null, '메디팜', 4500],
  ['보조기·깁스', '발목 보조기 M', '개', 3, '세 개', null, '정형메디칼', 15000],
  [],
  ['사무·생활', '물티슈', '팩', 5, 1000, null, '오피스마트', 1800],
  ['치료 소모품', '옛 거즈', '개', null, null, null, null, null],
]
const templateFile = () => xlsxFile('재고_물품양식_1121.xlsx', [['물품', TEMPLATE_ROWS], ['쓰는 법', [['재고 양식 쓰는 법']]]])

// 갖고 있던 엑셀(양식 아님): 첫 시트 '재고현황'
const OWN_HEADER = ['구분', '품명', '단위', '현재고', '안전재고', '유효기간', '구입처', '단가', '비고']
const OWN_ROWS: Aoa = [
  ['주사약', '히알루론산 주사 2mL', '개', 6, 10, '2027-03-31', '한빛약품', 18500, null],
  ['외용약', '디클로페낙 겔 100g', '개', 12, 5, '27.08', '한빛약품', 3300, null],
  ['소모품', '주사기 1cc', '개', 300, 100, null, '메디팜', 80, null],
  ['주사약', '케토롤락 주사 30mg', '앰플', 25, 10, '2027-02-28', '한빛약품', 1100, '냉장'],
]
const ownFile = (rows: Aoa = OWN_ROWS) => xlsxFile('재고목록_2026.xlsx', [['재고현황', [OWN_HEADER, ...rows]], ['거래처', [['이름', '전화']]]])
const OWN_MAPPING = { category: 0, name: 1, unit: 2, minQty: 4, qty: 3, expiry: 5, vendor: 6, unitPrice: 7 }

const jsonAnswer = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

beforeEach(() => {
  load.mockReset()
  importMock.mockReset()
  writeFile.mockReset()
  fetchMock.mockReset()
  load.mockResolvedValue({ categories: CATS, items: ITEMS })
  importMock.mockResolvedValue('ok')
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderPreview(file: File) {
  const onDone = vi.fn()
  const onCancel = vi.fn()
  const view = render(<ExcelPreview file={file} onDone={onDone} onCancel={onCancel} />)
  return { ...view, onDone, onCancel }
}

const table = () => screen.getByRole('table')
const rowOf = (name: string) => {
  const tr = within(table()).getByText(name).closest('tr')
  if (tr === null) throw new Error(`${name} 줄 없음`)
  return tr
}
const cellTexts = (tr: HTMLElement) => within(tr).getAllByRole('cell').map((cell) => cell.textContent)
const bodyRows = () => within(table()).getAllByRole('row').slice(1)
const select = (name: string) => screen.getByRole('combobox', { name }) as HTMLSelectElement
const chosen = (name: string) => select(name).selectedOptions[0]?.textContent
const insertButton = () => screen.getByRole('button', { name: /^(넣기|넣는 중…)$/ })

function expectErrorCard(code: ErrorCode) {
  const alert = screen.getByRole('alert')
  expect(alert.textContent).toContain(errorInfo(code).what)
  expect(alert.textContent).toContain(`오류 번호 ${code}`)
}

describe('AC-7509.1: [양식 받기] — 브라우저가 지금 분류·물품으로 재고-양식.xlsx를 만든다', () => {
  it('AC-7509.1: downloadTemplate은 분류·물품을 읽어 시트 둘(물품·쓰는 법)의 재고-양식.xlsx를 내려받게 하고 참을 준다(서버 없음)', async () => {
    expect(await downloadTemplate()).toBe(true)
    expect(load).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(writeFile).toHaveBeenCalledTimes(1)
    const [book, name] = writeFile.mock.calls[0]
    expect(name).toBe(TEMPLATE_FILE)
    expect(name).toBe('재고-양식.xlsx')
    expect(book.SheetNames).toEqual(['물품', '쓰는 법'])
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(book.Sheets['물품'], { header: 1 })
    expect(rows[0]).toEqual([...TEMPLATE_HEADER])
    // 숨긴 물품(옛 거즈)은 빠지고 목록 차례(분류 차례 → 물품 차례)다
    expect(rows.slice(1).map((row) => row[1])).toEqual(['히알루론산 주사 2mL', '리도카인 주사 2% 20mL', '주사기 3cc', 'A4 용지'])
  })

  it('AC-7509.1: 분류·물품을 못 읽거나 파일을 못 만들면 거짓이다', async () => {
    load.mockResolvedValueOnce('failed')
    expect(await downloadTemplate()).toBe(false)
    expect(writeFile).not.toHaveBeenCalled()
    writeFile.mockImplementationOnce(() => {
      throw new Error('못 만듦')
    })
    expect(await downloadTemplate()).toBe(false)
  })

  it('AC-7509.1: 미리 보기 머리의 [양식 받기]도 같은 양식을 내려받는다', async () => {
    renderPreview(templateFile())
    await screen.findByRole('table')
    await userEvent.click(screen.getByRole('button', { name: '양식 받기' }))
    await waitFor(() => expect(writeFile).toHaveBeenCalledTimes(1))
    expect(writeFile.mock.calls[0][1]).toBe('재고-양식.xlsx')
  })
})

describe('AC-7509.2: 양식 파일 — 칸 맞춤 경로를 부르지 않고 바로 미리 보기', () => {
  it("AC-7509.2: 양식이면 fetch가 한 번도 불리지 않고, 칩 '양식 그대로'·시트 '물품'·줄 수와 바로 미리 보기다", async () => {
    renderPreview(templateFile())
    await screen.findByRole('table')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { level: 2, name: '엑셀로 물품 넣기' })).toBeTruthy()
    expect(screen.getByText('양식 그대로라 칸을 맞출 것이 없어요. 미리 보기를 보고 넣어요. 물품 이름이 같은 줄은 그 물품을 고쳐요.')).toBeTruthy()
    expect(screen.getByText('재고_물품양식_1121.xlsx')).toBeTruthy()
    expect(screen.getByText("시트 '물품'")).toBeTruthy()
    expect(screen.getByText('양식 그대로').className).toContain('bg-positive-soft')
    expect(screen.getByText('8줄')).toBeTruthy()
    expect(screen.queryByText('AI가 맞춘 칸')).toBeNull()
    expect(screen.queryByText('분류 맞추기')).toBeNull()
    expect(screen.queryAllByRole('combobox')).toHaveLength(0)
  })

  it('AC-7509.2: 읽을 수 없는 파일이면 E-INV-EXCEL 오류 카드이고 보내지 않는다', async () => {
    renderPreview(new File(['엑셀 아님'], '메모.xlsx'))
    await screen.findByRole('alert')
    expectErrorCard('E-INV-EXCEL')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('AC-7509.2: 분류·물품을 못 읽으면 E-INV-READ-FAILED + [다시 읽기]로 다시 읽는다', async () => {
    load.mockResolvedValueOnce('failed')
    renderPreview(templateFile())
    await screen.findByRole('alert')
    expectErrorCard('E-INV-READ-FAILED')
    await userEvent.click(screen.getByRole('button', { name: '다시 읽기' }))
    await screen.findByRole('table')
    expect(load).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('AC-7509.2: 갖고 있던 엑셀 — 머리 줄·앞 줄을 칸 맞춤 경로로, AI가 맞춘 칸·분류 맞추기', () => {
  it('AC-7509.2: 머리 줄 + 앞 줄 5개까지를 { header, rows }로 한 번 보낸다', async () => {
    fetchMock.mockResolvedValue(jsonAnswer({ mapping: OWN_MAPPING }))
    const rows: Aoa = [...OWN_ROWS, ['소모품', '거즈 5x5', '개', 50, 20, null, '메디팜', 30, null], ['소모품', '알코올 솜', '통', 9, 3, null, '메디팜', 2500, null]]
    renderPreview(ownFile(rows))
    await screen.findByRole('table')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/ai/inventory/columns')
    const body = JSON.parse(String(init?.body)) as { header: string[]; rows: string[][] }
    expect(Object.keys(body).sort()).toEqual(['header', 'rows'])
    expect(body.header).toEqual(OWN_HEADER)
    expect(body.rows).toHaveLength(5)
    expect(body.rows[0]).toEqual(['주사약', '히알루론산 주사 2mL', '개', '6', '10', '2027-03-31', '한빛약품', '18500', ''])
    expect(body.rows[3][8]).toBe('냉장')
    expect(screen.getByText('6줄')).toBeTruthy()
  })

  it('AC-7509.2: 앞 줄에 전화번호 모양이 있으면 보내지 않고 E-INV-PRIVATE 오류 카드다', async () => {
    const rows: Aoa = [['주사약', '히알루론산 주사 2mL', '개', 6, 10, null, '한빛약품', 18500, '담당 010-1234-5678'], ...OWN_ROWS.slice(1)]
    renderPreview(ownFile(rows))
    await screen.findByRole('alert')
    expectErrorCard('E-INV-PRIVATE')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('AC-7509.2: 경로가 E-INV-NO-NAME이면 그 오류 카드다', async () => {
    fetchMock.mockResolvedValue(jsonAnswer({ code: 'E-INV-NO-NAME' }, 422))
    renderPreview(ownFile())
    await screen.findByRole('alert')
    expectErrorCard('E-INV-NO-NAME')
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('AC-7509.2: 맞추는 동안 안내 줄, AI가 바쁘면 E-AI-BUSY + [다시 분석]으로 다시 보낸다', async () => {
    const first = deferred<Response>()
    fetchMock.mockReturnValueOnce(first.promise).mockResolvedValueOnce(jsonAnswer({ mapping: OWN_MAPPING }))
    renderPreview(ownFile())
    expect((await screen.findByText('AI가 칸을 맞추는 중…')).getAttribute('role')).toBe('status')
    first.resolve(jsonAnswer({ code: 'E-AI-BUSY' }, 503))
    await screen.findByRole('alert')
    expectErrorCard('E-AI-BUSY')
    await userEvent.click(screen.getByRole('button', { name: '다시 분석' }))
    await screen.findByRole('table')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("AC-7509.2: 'AI가 맞춘 칸'은 여덟 칸마다 고른 엑셀 칸, 안 쓰는 엑셀 칸 줄, '분류 맞추기'는 엑셀 값마다 분류(기본: 같은 이름 아니면 새 분류)다", async () => {
    fetchMock.mockResolvedValue(jsonAnswer({ mapping: OWN_MAPPING }))
    renderPreview(ownFile())
    await screen.findByRole('table')
    expect(screen.getByText('양식이 아닌 엑셀이라 AI가 칸을 맞췄어요. 칸이나 분류가 틀리면 바꾸고, 미리 보기를 본 뒤 넣어요. 물품 이름이 같은 줄은 그 물품을 고쳐요.')).toBeTruthy()
    expect(screen.queryByText('양식 그대로')).toBeNull()
    expect(screen.getByText('AI가 맞춘 칸')).toBeTruthy()
    expect(screen.getByText('왼쪽이 재고 탭 칸, 고른 것이 엑셀 칸이에요. 틀리면 바꿔요')).toBeTruthy()
    expect(chosen('분류에 넣을 엑셀 칸')).toBe('A 구분')
    expect(chosen('물품 이름에 넣을 엑셀 칸')).toBe('B 품명')
    expect(chosen('단위에 넣을 엑셀 칸')).toBe('C 단위')
    expect(chosen('최소 수량에 넣을 엑셀 칸')).toBe('E 안전재고')
    expect(chosen('지금 수량에 넣을 엑셀 칸')).toBe('D 현재고')
    expect(chosen('가장 빠른 유통기한에 넣을 엑셀 칸')).toBe('F 유효기간')
    expect(chosen('거래처에 넣을 엑셀 칸')).toBe('G 구입처')
    expect(chosen('단가에 넣을 엑셀 칸')).toBe('H 단가')
    expect(Array.from(select('단가에 넣을 엑셀 칸').options).map((o) => o.textContent)).toEqual([
      '넣지 않음',
      'A 구분',
      'B 품명',
      'C 단위',
      'D 현재고',
      'E 안전재고',
      'F 유효기간',
      'G 구입처',
      'H 단가',
      'I 비고',
    ])
    expect(screen.getByText('넣지 않는 엑셀 칸: I 비고')).toBeTruthy()

    expect(screen.getByText('분류 맞추기')).toBeTruthy()
    expect(screen.getByText("엑셀 '구분' 값 → 재고 탭 분류")).toBeTruthy()
    expect(chosen("엑셀 '주사약'을 넣을 분류")).toBe("+ 새 분류 '주사약'")
    expect(chosen("엑셀 '외용약'을 넣을 분류")).toBe("+ 새 분류 '외용약'")
    expect(chosen("엑셀 '소모품'을 넣을 분류")).toBe("+ 새 분류 '소모품'")
    expect(Array.from(select("엑셀 '주사약'을 넣을 분류").options).map((o) => o.textContent)).toEqual([
      '약품',
      '치료 소모품',
      '보조기·깁스',
      '사무·생활',
      "+ 새 분류 '주사약'",
    ])
    expect(screen.getByText('2줄')).toBeTruthy()
  })

  it('AC-7509.2: 분류·칸을 바꾸면 미리 보기가 바로 바뀐다', async () => {
    fetchMock.mockResolvedValue(jsonAnswer({ mapping: OWN_MAPPING }))
    renderPreview(ownFile())
    await screen.findByRole('table')
    expect(cellTexts(rowOf('히알루론산 주사 2mL'))[1]).toBe('고침')
    expect(cellTexts(rowOf('히알루론산 주사 2mL')).at(-1)).toBe('분류 약품 → 주사약 · 지금 수량 4 → 6 (오늘 센 것으로 남아요)')
    expect(cellTexts(rowOf('케토롤락 주사 30mg'))[2]).toBe('주사약')

    await userEvent.selectOptions(select("엑셀 '주사약'을 넣을 분류"), '약품')
    expect(cellTexts(rowOf('히알루론산 주사 2mL')).at(-1)).toBe('지금 수량 4 → 6 (오늘 센 것으로 남아요)')
    expect(cellTexts(rowOf('케토롤락 주사 30mg'))[2]).toBe('약품')

    await userEvent.selectOptions(select('지금 수량에 넣을 엑셀 칸'), '')
    expect(chosen('지금 수량에 넣을 엑셀 칸')).toBe('넣지 않음')
    expect(cellTexts(rowOf('히알루론산 주사 2mL'))[1]).toBe('그대로')
    expect(screen.getByText('넣지 않는 엑셀 칸: D 현재고 · I 비고')).toBeTruthy()

    // 다른 재고 칸이 이미 쓰는 엑셀 칸을 고르면 그 칸은 '넣지 않음'이 된다(엑셀 칸 하나 = 재고 칸 하나)
    await userEvent.selectOptions(select('지금 수량에 넣을 엑셀 칸'), '4')
    expect(chosen('지금 수량에 넣을 엑셀 칸')).toBe('E 안전재고')
    expect(chosen('최소 수량에 넣을 엑셀 칸')).toBe('넣지 않음')
  })
})

describe('AC-7509.3: 미리 보기 — 줄마다 엑셀 줄·상태 칩·여덟 칸·바뀐 것, 거르기 단추, 아래 붙는 줄', () => {
  it('AC-7509.3: 머리는 엑셀 줄·상태·양식 여덟 칸·바뀐 것 · 살펴볼 것이고, 표는 제 상자 안에서 옆으로 밀린다', async () => {
    const { container } = renderPreview(templateFile())
    await screen.findByRole('table')
    expect(within(table()).getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      '엑셀 줄',
      '상태',
      ...TEMPLATE_HEADER,
      '바뀐 것 · 살펴볼 것',
    ])
    expect(table().parentElement?.className).toContain('overflow-x-auto')
    expect(screen.getByText('굵은 글자 = 바뀌는 칸. 파일에 없는 물품은 그대로 둬요(지우지 않아요).')).toBeTruthy()
    expect(nestedBoxes(container)).toEqual([])
  })

  it('AC-7509.3: 줄마다 상태 칩(새 물품·고침·그대로·건너뜀)과 칸 값, 바뀐 칸은 굵게, 바뀐 것·건너뛴 까닭 글이 보인다', async () => {
    renderPreview(templateFile())
    await screen.findByRole('table')
    expect(cellTexts(rowOf('히알루론산 주사 2mL'))).toEqual(['2', '그대로', '약품', '히알루론산 주사 2mL', '개', '10', '4', '2027-03-31', '한빛약품', '18,500원', ''])
    expect(cellTexts(rowOf('리도카인 주사 2% 20mL'))).toEqual(['3', '고침', '약품', '리도카인 주사 2% 20mL', '병', '15', '26', '2026-12-05', '한빛약품', '1,400원', '최소 수량 10 → 15'])
    expect(cellTexts(rowOf('주사기 3cc'))).toEqual(['4', '고침', '치료 소모품', '주사기 3cc', '개', '100', '40', '–', '메디팜', '100원', '단가 95원 → 100원'])
    expect(cellTexts(rowOf('A4 용지')).at(-1)).toBe('지금 수량 4 → 6 (오늘 센 것으로 남아요)')
    expect(cellTexts(rowOf('테이핑 테이프 5cm'))).toEqual(['6', '새 물품', '치료 소모품', '테이핑 테이프 5cm', '개', '10', '12', '–', '메디팜', '4,500원', ''])
    expect(cellTexts(rowOf('발목 보조기 M'))).toEqual(['7', '건너뜀', '보조기·깁스', '발목 보조기 M', '개', '3', '세 개', '–', '정형메디칼', '15,000원', "지금 수량 '세 개' → 수량은 0 이상 숫자로 적어요"])
    // 빈 줄(8)은 빼고 엑셀 줄 번호는 그대로다
    expect(cellTexts(rowOf('물티슈')).slice(0, 2)).toEqual(['9', '새 물품'])
    expect(cellTexts(rowOf('물티슈'))[6]).toBe('1,000')
    expect(cellTexts(rowOf('옛 거즈'))).toEqual(['10', '고침', '치료 소모품', '옛 거즈', '개', '–', '–', '–', '–', '–', '안 쓰는 물품 → 다시 써요'])

    const chip = (name: string) => within(rowOf(name)).getAllByRole('cell')[1].firstElementChild?.className ?? ''
    expect(chip('테이핑 테이프 5cm')).toContain('bg-accent-soft')
    expect(chip('리도카인 주사 2% 20mL')).toContain('bg-warning-soft')
    expect(chip('히알루론산 주사 2mL')).toContain('bg-canvas')
    expect(chip('발목 보조기 M')).toContain('bg-canvas')

    // 바뀐 칸만 굵게
    const cells = within(rowOf('리도카인 주사 2% 20mL')).getAllByRole('cell')
    expect(cells[5].querySelector('.font-semibold')?.textContent).toBe('15')
    expect(cells[6].querySelector('.font-semibold')).toBeNull()
    expect(within(rowOf('A4 용지')).getAllByRole('cell')[6].querySelector('.font-semibold')?.textContent).toBe('6')
    // 건너뛴 줄은 흐리고, 까닭은 오류 색
    expect(rowOf('발목 보조기 M').className).toContain('text-muted')
    expect(within(rowOf('발목 보조기 M')).getByText("지금 수량 '세 개' → 수량은 0 이상 숫자로 적어요").className).toContain('text-negative')
  })

  it("AC-7509.3: 달만 적은 기한은 그 달 마지막 날로 읽었다는 글이 보인다", async () => {
    fetchMock.mockResolvedValue(jsonAnswer({ mapping: OWN_MAPPING }))
    renderPreview(ownFile())
    await screen.findByRole('table')
    const cells = cellTexts(rowOf('디클로페낙 겔 100g'))
    expect(cells[1]).toBe('새 물품')
    expect(cells[7]).toBe('2027-08-31')
    expect(cells.at(-1)).toBe("유통기한 '27.08' → 그 달 마지막 날로 읽었어요")
  })

  it('AC-7509.3: 거르기 단추(모두·새 물품·고침·건너뜀·그대로)를 누르면 그 줄만 보인다', async () => {
    renderPreview(templateFile())
    await screen.findByRole('table')
    const group = screen.getByRole('group', { name: '보일 줄' })
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['모두 8', '새 물품 2', '고침 4', '건너뜀 1', '그대로 1'])
    expect(within(group).getByRole('button', { name: '모두 8' }).getAttribute('aria-pressed')).toBe('true')
    expect(bodyRows()).toHaveLength(8)

    await userEvent.click(within(group).getByRole('button', { name: '새 물품 2' }))
    expect(within(group).getByRole('button', { name: '새 물품 2' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(group).getByRole('button', { name: '모두 8' }).getAttribute('aria-pressed')).toBe('false')
    expect(bodyRows().map((tr) => cellTexts(tr)[3])).toEqual(['테이핑 테이프 5cm', '물티슈'])
    await userEvent.click(within(group).getByRole('button', { name: '고침 4' }))
    expect(bodyRows().map((tr) => cellTexts(tr)[3])).toEqual(['리도카인 주사 2% 20mL', '주사기 3cc', 'A4 용지', '옛 거즈'])
    await userEvent.click(within(group).getByRole('button', { name: '건너뜀 1' }))
    expect(bodyRows().map((tr) => cellTexts(tr)[3])).toEqual(['발목 보조기 M'])
    await userEvent.click(within(group).getByRole('button', { name: '그대로 1' }))
    expect(bodyRows().map((tr) => cellTexts(tr)[3])).toEqual(['히알루론산 주사 2mL'])
  })

  it("AC-7509.3: 그대로 줄이 없으면 '그대로' 거르기 단추가 없고, 거른 상태에 줄이 없으면 빈 줄 글이다", async () => {
    fetchMock.mockResolvedValue(jsonAnswer({ mapping: OWN_MAPPING }))
    renderPreview(ownFile())
    await screen.findByRole('table')
    const group = screen.getByRole('group', { name: '보일 줄' })
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['모두 4', '새 물품 3', '고침 1', '건너뜀 0'])
    await userEvent.click(within(group).getByRole('button', { name: '건너뜀 0' }))
    expect(bodyRows()).toHaveLength(1)
    expect(within(table()).getByText('이 상태인 줄이 없어요.')).toBeTruthy()
  })

  it('AC-7509.3: 아래 붙는 줄 "새 물품 n · 고침 n · 건너뜀 n" + [넣기], 머리에 [양식 받기]·[다른 파일 올리기], [취소]가 있다', async () => {
    const { onCancel } = renderPreview(templateFile())
    await screen.findByRole('table')
    const bar = insertButton().closest('[data-savebar]')
    if (!(bar instanceof HTMLElement)) throw new Error('아래 붙는 줄 없음')
    expect(bar.className).toContain('sticky')
    expect(bar.className).toContain('bottom-0')
    expect(within(bar).getByText('새 물품 2 · 고침 4 · 건너뜀 1').tagName).toBe('B')
    expect(bar.textContent).toContain('새 물품 2 · 고침 4 · 건너뜀 1 · 그대로 1 · 건너뛴 줄은 고쳐서 다시 올리면 돼요')
    expect(screen.getByRole('button', { name: '양식 받기' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '다른 파일 올리기' })).toBeTruthy()
    await userEvent.click(within(bar).getByRole('button', { name: '취소' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(importMock).not.toHaveBeenCalled()
  })

  it('AC-7509.3: [다른 파일 올리기]로 고른 파일을 다시 읽는다', async () => {
    fetchMock.mockResolvedValue(jsonAnswer({ mapping: OWN_MAPPING }))
    const { container } = renderPreview(templateFile())
    await screen.findByRole('table')
    const input = container.querySelector('input[type="file"]')
    if (!(input instanceof HTMLInputElement)) throw new Error('파일 고르기 없음')
    expect(input.accept).toBe('.xlsx')
    fireEvent.change(input, { target: { files: [ownFile()] } })
    await screen.findByText('재고목록_2026.xlsx')
    await screen.findByText('AI가 맞춘 칸')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('양식 그대로')).toBeNull()
  })
})

describe('AC-7509.4: [넣기] — importItems로 넣고 목록으로, 실패하면 미리 보기와 오류 카드', () => {
  async function expectedPlan(file: File) {
    const sheet = readSheet(await file.arrayBuffer())
    if (sheet === null) throw new Error('못 읽음')
    const categoryMap = defaultCategoryMap(categoryValues(sheet.rows, TEMPLATE_MAPPING), CATS)
    return previewRows({ rows: sheet.rows, rowNumbers: sheet.rowNumbers, mapping: TEMPLATE_MAPPING, categoryMap, categories: CATS, items: ITEMS }).plan
  }

  it('AC-7509.4: [넣기]는 미리 보기의 넣기 계획과 한국 오늘로 importItems를 부르고, 넣는 동안 기다림 모양, 끝나면 onDone', async () => {
    const answer = deferred<'ok' | 'failed'>()
    importMock.mockReturnValueOnce(answer.promise)
    const file = templateFile()
    const { onDone } = renderPreview(file)
    await screen.findByRole('table')
    await userEvent.click(insertButton())
    expect(importMock).toHaveBeenCalledTimes(1)
    const [plan, today] = importMock.mock.calls[0]
    expect(plan).toEqual(await expectedPlan(file))
    expect(plan.adds.map((add) => add.name)).toEqual(['테이핑 테이프 5cm', '물티슈'])
    expect(today).toBe(todayInKorea())
    expect(insertButton().textContent).toBe('넣는 중…')
    expect(insertButton().getAttribute('aria-busy')).toBe('true')
    await userEvent.click(insertButton())
    expect(importMock).toHaveBeenCalledTimes(1)
    answer.resolve('ok')
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
  })

  it('AC-7509.4: 넣기가 실패하면 미리 보기와 E-INV-SAVE-FAILED 오류 카드가 남고 [넣기]를 다시 누를 수 있다', async () => {
    importMock.mockResolvedValueOnce('failed').mockResolvedValueOnce('ok')
    const { onDone } = renderPreview(templateFile())
    await screen.findByRole('table')
    await userEvent.click(insertButton())
    await screen.findByRole('alert')
    expectErrorCard('E-INV-SAVE-FAILED')
    expect(onDone).not.toHaveBeenCalled()
    expect(screen.getByRole('table')).toBeTruthy()
    expect(insertButton().textContent).toBe('넣기')
    await userEvent.click(insertButton())
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(importMock).toHaveBeenCalledTimes(2)
  })

  it('AC-7509.4: 새 물품·고침이 하나도 없으면 [넣기]가 꺼져 있다', async () => {
    const same: Aoa = [[...TEMPLATE_HEADER], ['약품', '히알루론산 주사 2mL', '개', 10, 4, '2027-03-31', '한빛약품', 18500], ['약품', '', '개', 1, 1, null, null, null]]
    renderPreview(xlsxFile('재고-양식.xlsx', [['물품', same]]))
    await screen.findByRole('table')
    expect(insertButton().getAttribute('aria-disabled')).toBe('true')
    await userEvent.click(insertButton())
    expect(importMock).not.toHaveBeenCalled()
  })
})
