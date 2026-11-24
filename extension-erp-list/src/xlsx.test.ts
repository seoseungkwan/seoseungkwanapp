// spec erp-copy-list TASK-3: [엑셀로 받기] 파일(xlsx.ts, design.md 5절)
// - AC-3906.2 sheetRows 모양(1행·머리 줄·숫자 줄·끝 열 까닭)과 sheet1.xml 틀 고정·열 너비, styles.xml 가장 작은 꼴, 화면에만 있는 글은 빠짐
// - AC-3906.3 저장소의 xlsx 0.20.3(시험에서만 씀)으로 다시 읽어 시트 이름·모든 칸 값·종류(n·s)·빈 칸이 sheetRows와 같다. &<>"'는 글자 그대로, 제어 글자는 빠짐
// - AC-3906.4 파일의 글 칸은 모양에 있는 글(줄 이름·머리·까닭)뿐이다
// 목록 모양(ListModel)은 손으로 만든다(rows.ts를 부르지 않는다). 숫자는 모두 지어낸 것이고 환자 정보는 없다
import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import { dayList } from '../../extension-erp/src/rangeView'
import { dayHead, LIST_TEXT, shortDay, WHY_TEXT, type ListCell, type ListLine, type ListModel, type Why } from './listTypes'

// xlsx.ts가 없을 때 파일 전체가 아니라 그 시험만 실패하게 시험 안에서 불러온다
const load = () => import('./xlsx')

const v = (value: string): ListCell => ({ value })
const w = (why: Why): ListCell => ({ why })
const all = (why: Why, n = 3): ListCell[] => Array.from({ length: n }, () => w(why))

/** 줄 이름에 XML 특수 글자와 XML에 못 쓰는 제어 글자(U+0001·U+000B·U+001F)가 든 줄 */
const NASTY = `크라이오 &<>"'\u0001\u000b끝\u001f`
const NASTY_READ = `크라이오 &<>"'끝`

const row = (
  key: string,
  section: string,
  name: string,
  col: string | null,
  cells: ListCell[],
  rowWhy: Why | null = null,
): ListLine => ({ kind: 'row', key, section, name, col, cells, rowWhy })

const WARNING = '11/3: 환불·변경수납이 있어요(1건). ERP 외래 수입 칸을 확인해 주세요.'
const OVERLAP = '함께 있는 진료 2건은 씨암·SONO 둘 다에 넣었어요.'

/** 시안처럼 사흘(첫날 11/1(일) 진료 0건) */
const MODEL: ListModel = {
  from: '2026-11-01',
  to: '2026-11-03',
  days: [
    { date: '2026-11-01', zero: true },
    { date: '2026-11-02', zero: false },
    { date: '2026-11-03', zero: false },
  ],
  lines: [
    { kind: 'journal', text: '업무일지 1' },
    { kind: 'section', text: '진료 · 치료현황' },
    row('k1', '치료현황', '도수상담', null, [v('0'), v('4'), v('6')]),
    row('k2', '치료현황', '수술', null, all('unpicked'), 'unpicked'),
    { kind: 'section', text: '외래 수입' },
    row('k3', '외래 수입', '미수입금(+)', null, [v('0'), w('unknown'), v('12000')]),
    row('k4', '외래 수입', '외래 총매출', null, [v('0'), v('1234567'), v('350000')]),
    { kind: 'journal', text: '업무일지 2' },
    { kind: 'section', text: '치료별 신환/90일초진/재진 건수' },
    row('k5', '치료별 건수', '씨암(주사)', '신환', [v('0'), v('4'), v('2')]),
    row('k6', '치료별 건수', '기타2', '신환', all('noName'), 'noName'),
    row('k7', '치료별 건수', '기타3', '재진', [w('unpicked'), w('unknown'), w('unknown')]),
    { kind: 'section', text: '운영 지표' },
    row('k8', '운영 지표', '주사1회환자', null, all('unknown'), 'unknown'),
    { kind: 'section', text: '치료별 매출', sub: '금액(원)' },
    row('k9', '치료별 매출', '관절조영', null, all('held'), 'held'),
    row('k10', '치료별 매출', NASTY, null, [v('0'), v('-5000'), v('350000')]),
  ],
  rowCount: 10,
  reasons: ['unpicked', 'unknown', 'held', 'noName'],
  warnings: [WARNING],
  overlap: OVERLAP,
}

/** AC-3906.2 기대 칸(손으로 적음) */
const EXPECTED_ROWS: (string | number | null)[][] = [
  ['항목', '11/1 (일) 진료 0건', '11/2 (월)', '11/3 (화)', '빈 칸 까닭'],
  ['업무일지 1'],
  ['진료 · 치료현황'],
  ['도수상담', 0, 4, 6, null],
  ['수술', null, null, null, WHY_TEXT.unpicked.tag],
  ['외래 수입'],
  ['미수입금(+)', 0, null, 12000, `${WHY_TEXT.unknown.tag} (11/2)`],
  ['외래 총매출', 0, 1234567, 350000, null],
  ['업무일지 2'],
  ['치료별 신환/90일초진/재진 건수'],
  ['씨암(주사) 신환', 0, 4, 2, null],
  ['기타2 신환', null, null, null, WHY_TEXT.noName.tag],
  ['기타3 재진', null, null, null, `${WHY_TEXT.unpicked.tag} (11/1), ${WHY_TEXT.unknown.tag} (11/2 · 11/3)`],
  ['운영 지표'],
  ['주사1회환자', null, null, null, WHY_TEXT.unknown.tag],
  ['치료별 매출 금액(원)'],
  ['관절조영', null, null, null, WHY_TEXT.held.tag],
  [NASTY, 0, -5000, 350000, null],
]

const WHEN = new Date(2026, 10, 24, 9, 7, 0)
const WHEN_TEXT = '2026-11-24 09:07'

/** 'YYYY-MM-DD'부터 n일 */
function daysFrom(first: string, n: number): string[] {
  const [y, m, d] = first.split('-').map(Number)
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10))
}

/** XML에 못 쓰는 글자를 뗀 글(XML 1.0 Char 밖) */
function xmlSafe(text: string): string {
  return [...text]
    .filter((ch) => {
      const c = ch.codePointAt(0) ?? 0
      return c === 0x9 || c === 0xa || c === 0xd || (c >= 0x20 && c <= 0xd7ff) || (c >= 0xe000 && c <= 0xfffd) || c >= 0x10000
    })
    .join('')
}

/** 파일 안 부품 글(저장소 xlsx 0.20.3 CFB zip 읽개) */
function partText(bytes: Uint8Array, name: string): string {
  const found = XLSX.CFB.find(XLSX.CFB.read(bytes, { type: 'array' }), `/${name}`)
  if (!found) throw new Error(`파일 안에 ${name}이 없다`)
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(found.content ?? []))
}

/** zip 파일 머리를 앞에서부터 읽은 이름 차례 */
function partNames(bytes: Uint8Array): string[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const names: string[] = []
  let at = 0
  while (view.getUint32(at, true) === 0x04034b50) {
    const size = view.getUint32(at + 18, true)
    const nameLength = view.getUint16(at + 26, true)
    const extra = view.getUint16(at + 28, true)
    names.push(new TextDecoder().decode(bytes.subarray(at + 30, at + 30 + nameLength)))
    at += 30 + nameLength + extra + size
  }
  return names
}

const PARTS = ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml']

/** 다시 읽은 시트 */
function readBack(bytes: Uint8Array) {
  const book = XLSX.read(bytes, { type: 'array', cellNF: true })
  const sheet = book.Sheets[book.SheetNames[0]]
  return { book, sheet }
}

/** 시트의 칸 주소(!로 시작하는 칸 빼고) */
const cellKeys = (sheet: XLSX.WorkSheet) => Object.keys(sheet).filter((k) => !k.startsWith('!'))

/** 시트 칸이 기대 칸과 같은지(값·종류·빈 칸, 기대 밖 칸 없음) */
function expectSheetEquals(sheet: XLSX.WorkSheet, expected: (string | number | null)[][]) {
  const width = Math.max(...expected.map((r) => r.length))
  expect(sheet['!ref']).toBe(XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: expected.length - 1, c: width - 1 } }))
  const filled = new Set<string>()
  expected.forEach((cells, r) => {
    for (let c = 0; c < width; c += 1) {
      const address = XLSX.utils.encode_cell({ r, c })
      const want = cells[c] ?? null
      const got = sheet[address] as XLSX.CellObject | undefined
      if (want === null) {
        expect(got, `${address}는 빈 칸`).toBeUndefined()
        continue
      }
      filled.add(address)
      expect(got, address).toBeDefined()
      if (typeof want === 'number') {
        expect(got?.t, `${address} 종류`).toBe('n')
        expect(got?.v, address).toBe(want)
      } else {
        expect(got?.t, `${address} 종류`).toBe('s')
        expect(got?.v, address).toBe(xmlSafe(want))
      }
    }
  })
  expect(cellKeys(sheet).sort()).toEqual([...filled].sort())
}

describe('AC-3906.2 sheetRows: 화면 표와 같은 줄·열 + 끝 열 빈 칸 까닭', () => {
  it("AC-3906.2: 1행은 '항목' · 날짜 머리(진료 0건이면 뒤에 ' 진료 0건') · '빈 칸 까닭'이다", async () => {
    const { sheetRows } = await load()
    expect(sheetRows(MODEL)[0]).toEqual(['항목', '11/1 (일) 진료 0건', '11/2 (월)', '11/3 (화)', '빈 칸 까닭'])
    expect(sheetRows(MODEL)[0]).toEqual([LIST_TEXT.head, ...MODEL.days.map((d) => dayHead(d.date) + (d.zero ? LIST_TEXT.xlsxZero : '')), LIST_TEXT.legend])
  })

  it("AC-3906.2: 업무일지·상자 머리 줄은 A칸만 있고 치료별 매출 머리는 '치료별 매출 금액(원)'이다", async () => {
    const { sheetRows } = await load()
    const rows = sheetRows(MODEL)
    const heads = MODEL.lines.flatMap((line, i) => (line.kind === 'row' ? [] : [rows[i + 1]]))
    expect(heads).toEqual([
      ['업무일지 1'],
      ['진료 · 치료현황'],
      ['외래 수입'],
      ['업무일지 2'],
      ['치료별 신환/90일초진/재진 건수'],
      ['운영 지표'],
      ['치료별 매출 금액(원)'],
    ])
  })

  it("AC-3906.2: 숫자 줄 A칸은 줄 이름(+ ' ' + 열 이름), 날짜 칸은 number, 값 없는 칸은 null, 끝 열은 그 줄의 까닭(없으면 null)이다", async () => {
    const { sheetRows } = await load()
    expect(sheetRows(MODEL)).toEqual(EXPECTED_ROWS)
  })

  it("AC-3906.2: 끝 열 까닭 — 모든 날이면 꼬리표 글, 어떤 날만이면 '{꼬리표 글} ({M/D} · …)', 둘이면 WHY_ORDER 차례로 ', '로 잇는다", async () => {
    const { sheetRows } = await load()
    const rows = sheetRows(MODEL)
    const reasonOf = (key: string) => rows[1 + MODEL.lines.findIndex((l) => l.kind === 'row' && l.key === key)].at(-1)
    expect(reasonOf('k2')).toBe('코드를 고르지 않음')
    expect(reasonOf('k3')).toBe('비트로 셀 수 없음 (11/2)')
    expect(reasonOf('k6')).toBe('ERP 줄 이름 없음')
    expect(reasonOf('k7')).toBe('코드를 고르지 않음 (11/1), 비트로 셀 수 없음 (11/2 · 11/3)')
    expect(reasonOf('k8')).toBe('비트로 셀 수 없음')
    expect(reasonOf('k9')).toBe('보류 중')
    expect(reasonOf('k1')).toBeNull()
  })

  it('AC-3906.2: 어떤 날만 비는 날 목록은 지금 dayList 꼴이다(날이 많으면 지금 규칙대로 줄여 적는다)', async () => {
    const { sheetRows } = await load()
    const dates = daysFrom('2026-10-01', 30)
    const missing = dates.filter((_, i) => i % 2 === 0) // 15일
    const model: ListModel = {
      from: dates[0],
      to: dates[dates.length - 1],
      days: dates.map((date) => ({ date, zero: false })),
      lines: [row('a', '운영 지표', '도수 총금액', null, dates.map((date, i) => (i % 2 === 0 ? w('unknown') : v(String(i)))))],
      rowCount: 1,
      reasons: ['unknown'],
      warnings: [],
      overlap: null,
    }
    expect(sheetRows(model)[1].at(-1)).toBe(`${WHY_TEXT.unknown.tag} (${dayList(missing)})`)
    expect(dayList(missing)).toContain(shortDay(missing[0]))
  })

  it('AC-3906.2: sheetRows는 받은 모양을 고치지 않는다', async () => {
    const { sheetRows } = await load()
    const before = structuredClone(MODEL)
    sheetRows(MODEL)
    expect(MODEL).toEqual(before)
  })

  it("AC-3906.2: 파일 이름은 'ERP마감일지_입력목록_{시작일}_{끝일}.xlsx'이고 파일 종류는 xlsx MIME이다", async () => {
    const { fileName, XLSX_TYPE } = await load()
    expect(fileName(MODEL)).toBe('ERP마감일지_입력목록_2026-11-01_2026-11-03.xlsx')
    expect(fileName(MODEL)).toBe(LIST_TEXT.fileName(MODEL.from, MODEL.to))
    expect(XLSX_TYPE).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  })
})

describe('AC-3906.2 파일 부품: 틀 고정·열 너비·가장 작은 styles', () => {
  it('AC-3906.2: 파일 안 부품은 design.md 5절 차례 그대로이고 모두 UTF-8 XML이다', async () => {
    const { workbookBytes } = await load()
    const bytes = workbookBytes(MODEL, WHEN)
    expect(partNames(bytes)).toEqual(PARTS)
    for (const part of PARTS) expect(partText(bytes, part), part).toMatch(/^<\?xml version="1\.0" encoding="UTF-8" standalone="yes"\?>/)
  })

  it('AC-3906.2: sheet1.xml은 1행·A열 틀 고정(xSplit 1 · ySplit 1 · topLeftCell B2 · frozen)이다', async () => {
    const { workbookBytes } = await load()
    const sheet = partText(workbookBytes(MODEL, WHEN), 'xl/worksheets/sheet1.xml')
    const pane = sheet.match(/<pane\b[^>]*\/>/g) ?? []
    expect(pane).toHaveLength(1)
    for (const attr of ['xSplit="1"', 'ySplit="1"', 'topLeftCell="B2"', 'activePane="bottomRight"', 'state="frozen"']) expect(pane[0], attr).toContain(attr)
  })

  it('AC-3906.2: sheet1.xml 차례는 sheetViews → sheetFormatPr → cols → sheetData이고 cols는 A 34 · 날짜 11 · 끝 열 44다', async () => {
    const { workbookBytes } = await load()
    const sheet = partText(workbookBytes(MODEL, WHEN), 'xl/worksheets/sheet1.xml')
    const at = ['<sheetViews', '<sheetFormatPr', '<cols', '<sheetData'].map((tag) => sheet.indexOf(tag))
    for (const i of at) expect(i).toBeGreaterThan(0)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    const cols = [...sheet.matchAll(/<col\b([^>]*)\/>/g)].map(([, attrs]) => {
      const attr = (name: string) => Number(new RegExp(`\\b${name}="([^"]*)"`).exec(attrs)?.[1])
      return { min: attr('min'), max: attr('max'), width: attr('width') }
    })
    expect(cols).toEqual([
      { min: 1, max: 1, width: 34 },
      { min: 2, max: 4, width: 11 },
      { min: 5, max: 5, width: 44 },
    ])
  })

  it('AC-3906.2: 글 칸은 inlineStr, 숫자 칸은 <v>만(서식 번호 s 없음 = 일반), 빈 칸은 쓰지 않는다', async () => {
    const { workbookBytes } = await load()
    const sheet = partText(workbookBytes(MODEL, WHEN), 'xl/worksheets/sheet1.xml')
    const cells = sheet.match(/<c\b[^>]*>/g) ?? []
    expect(cells).toHaveLength(EXPECTED_ROWS.flat().filter((x) => x !== null).length)
    for (const c of cells) expect(c, c).not.toMatch(/\bs="/)
    for (const c of cells) expect(c, c).not.toMatch(/\/>$/)
    expect(sheet).not.toContain('<sst')
    expect(sheet).toMatch(/<c r="C4"><v>4<\/v><\/c>/)
    expect(sheet).toMatch(/<c r="A4" t="inlineStr"><is><t[^>]*>도수상담<\/t><\/is><\/c>/)
  })

  it('AC-3906.2: styles.xml은 글꼴 1 · 채움 2(none · gray125) · 테두리 1 · cellStyleXfs 1 · cellXfs 1(xfId 0) · cellStyles 1(Normal)이다', async () => {
    const { workbookBytes } = await load()
    const styles = partText(workbookBytes(MODEL, WHEN), 'xl/styles.xml')
    expect(styles).toMatch(/<fonts count="1">/)
    expect(styles).toMatch(/<fills count="2"><fill><patternFill patternType="none"\/><\/fill><fill><patternFill patternType="gray125"\/><\/fill><\/fills>/)
    expect(styles).toMatch(/<borders count="1">/)
    expect(styles).toMatch(/<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"\/><\/cellStyleXfs>/)
    expect(styles).toMatch(/<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"\/><\/cellXfs>/)
    expect(styles).toMatch(/<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"\/><\/cellStyles>/)
  })

  it('AC-3906.2: 경고 줄·씨암·SONO 줄·만든 때 글은 파일에 없다(화면에만 있다)', async () => {
    const { workbookBytes } = await load()
    const bytes = workbookBytes(MODEL, WHEN)
    const text = PARTS.map((part) => partText(bytes, part)).join('\n')
    for (const shown of [WARNING, '환불·변경수납', OVERLAP, '씨암·SONO', LIST_TEXT.madeAt(WHEN_TEXT), '목록을 만든 때', WHEN_TEXT]) {
      expect(text, shown).not.toContain(shown)
    }
    const { sheet } = readBack(bytes)
    const strings = cellKeys(sheet).map((k) => String((sheet[k] as XLSX.CellObject).v))
    for (const s of strings) expect(s).not.toMatch(/씨암·SONO|목록을 만든 때|환불·변경수납/)
  })
})

describe('AC-3906.3 저장소 xlsx 0.20.3으로 다시 읽기', () => {
  it("AC-3906.3: 시트는 하나('ERP 마감일지 입력 목록')이고 SHEET_NAME은 LIST_TEXT.title이다", async () => {
    const { workbookBytes, SHEET_NAME } = await load()
    expect(SHEET_NAME).toBe('ERP 마감일지 입력 목록')
    expect(SHEET_NAME).toBe(LIST_TEXT.title)
    const { book } = readBack(workbookBytes(MODEL, WHEN))
    expect(book.SheetNames).toEqual(['ERP 마감일지 입력 목록'])
  })

  it('AC-3906.3: 모든 칸 값·종류(숫자 n · 글 s)·빈 칸이 sheetRows(model)과 같다(기대 밖 칸 없음)', async () => {
    const { workbookBytes, sheetRows } = await load()
    const { sheet } = readBack(workbookBytes(MODEL, WHEN))
    expectSheetEquals(sheet, sheetRows(MODEL))
    expectSheetEquals(sheet, EXPECTED_ROWS)
  })

  it('AC-3906.3: 숫자 칸 서식은 일반(General)이라 보이는 글에 쉼표가 없다(350000 · 1234567 · -5000)', async () => {
    const { workbookBytes } = await load()
    const { sheet } = readBack(workbookBytes(MODEL, WHEN))
    const numbers = cellKeys(sheet)
      .map((k) => sheet[k] as XLSX.CellObject)
      .filter((c) => c.t === 'n')
    expect(numbers.length).toBe(EXPECTED_ROWS.flat().filter((x) => typeof x === 'number').length)
    for (const c of numbers) {
      expect(c.z ?? 'General').toBe('General')
      expect(c.w).toBe(String(c.v))
      expect(c.w).not.toContain(',')
    }
    expect((sheet.D8 as XLSX.CellObject).w).toBe('350000')
    expect((sheet.C8 as XLSX.CellObject).w).toBe('1234567')
    expect((sheet.C18 as XLSX.CellObject).v).toBe(-5000)
  })

  it(`AC-3906.3: 줄 이름의 &<>"'는 글자 그대로 읽히고 XML에 못 쓰는 제어 글자는 빠진다`, async () => {
    const { workbookBytes } = await load()
    const bytes = workbookBytes(MODEL, WHEN)
    const { sheet } = readBack(bytes)
    expect((sheet.A18 as XLSX.CellObject).v).toBe(NASTY_READ)
    const xml = partText(bytes, 'xl/worksheets/sheet1.xml')
    expect(xml).toContain('크라이오 &amp;&lt;&gt;&quot;&apos;끝')
    for (const control of ['\u0001', '\u000b', '\u001f']) expect(xml).not.toContain(control)
  })

  it('AC-3906.3: 날짜가 26일을 넘어 열 이름이 두 글자(AA…)가 되어도 같다(30일 = A~AF)', async () => {
    const { workbookBytes, sheetRows } = await load()
    const dates = daysFrom('2026-10-01', 30)
    const model: ListModel = {
      from: dates[0],
      to: dates[dates.length - 1],
      days: dates.map((date, i) => ({ date, zero: i === 2 })),
      lines: [
        { kind: 'journal', text: '업무일지 1' },
        { kind: 'section', text: '환자현황' },
        row('a', '환자현황', '신환', null, dates.map((_, i) => v(String(i * 3)))),
        row('b', '환자현황', '합계', null, dates.map((_, i) => (i === 29 ? w('unknown') : v(String(100 + i))))),
      ],
      rowCount: 2,
      reasons: ['unknown'],
      warnings: [],
      overlap: null,
    }
    const { sheet } = readBack(workbookBytes(model, WHEN))
    expectSheetEquals(sheet, sheetRows(model))
    // 1행 머리 · 2행 업무일지 · 3행 상자 · 4행 신환 · 5행 합계
    expect(sheet['!ref']).toBe('A1:AF5')
    expect((sheet.AE4 as XLSX.CellObject).v).toBe(87)
    expect((sheet.AF1 as XLSX.CellObject).v).toBe(LIST_TEXT.legend)
    expect(sheet.AE5).toBeUndefined()
    expect((sheet.AF5 as XLSX.CellObject).v).toBe(`${WHY_TEXT.unknown.tag} (10/30)`)
    const cols = partText(workbookBytes(model, WHEN), 'xl/worksheets/sheet1.xml').match(/<col\b[^>]*\/>/g) ?? []
    expect(cols[1]).toMatch(/min="2" max="31" width="11"/)
    expect(cols[2]).toMatch(/min="32" max="32" width="44"/)
  })

  it('AC-3906.3: 같은 모양·같은 시각이면 같은 바이트다', async () => {
    const { workbookBytes } = await load()
    expect(workbookBytes(MODEL, WHEN)).toEqual(workbookBytes(MODEL, WHEN))
  })
})

describe('AC-3906.4 파일에는 모양의 글·숫자만', () => {
  it('AC-3906.4: 파일의 모든 글 칸은 줄 이름·머리·까닭 글이고, 모든 숫자 칸은 모양의 값이다', async () => {
    const { workbookBytes } = await load()
    const { sheet } = readBack(workbookBytes(MODEL, WHEN))
    const named = new Set<string>([
      LIST_TEXT.head,
      LIST_TEXT.legend,
      ...MODEL.days.map((d) => dayHead(d.date) + (d.zero ? LIST_TEXT.xlsxZero : '')),
      ...MODEL.lines.map((line) => {
        if (line.kind === 'journal') return line.text
        if (line.kind === 'section') return line.sub ? `${line.text} ${line.sub}` : line.text
        return xmlSafe(line.col ? `${line.name} ${line.col}` : line.name)
      }),
    ])
    const tag = `(?:${Object.values(WHY_TEXT)
      .map((t) => t.tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|')})`
    const day = '\\d{1,2}/\\d{1,2}'
    const reason = new RegExp(`^${tag}(?: \\(${day}(?: · ${day})*\\))?(?:, ${tag}(?: \\(${day}(?: · ${day})*\\))?)*$`)
    const values = new Set(MODEL.lines.flatMap((line) => (line.kind === 'row' ? line.cells.flatMap((c) => ('value' in c ? [Number(c.value)] : [])) : [])))
    for (const key of cellKeys(sheet)) {
      const cell = sheet[key] as XLSX.CellObject
      if (cell.t === 'n') {
        expect(values.has(cell.v as number), `${key} = ${String(cell.v)}`).toBe(true)
      } else {
        expect(cell.t, key).toBe('s')
        const text = String(cell.v)
        expect(named.has(text) || reason.test(text), `${key} = ${text}`).toBe(true)
      }
    }
  })
})
