// TASK-6 (spec erp-uisarang) design.md 7-2: 가장 작은 SpreadsheetML(xlsxWrite.ts).
// 만든 바이트를 저장소의 SheetJS `xlsx` 0.20.3으로 다시 읽어 칸 값·숫자 칸·글 칸(inlineStr)·빈 칸·열 너비를 보고,
// SheetJS가 틀 고정을 읽지 않아 sheet1.xml 글은 SheetJS가 연 zip 파일(bookFiles)에서 본다. SheetJS는 시험에서만 쓴다
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'

const SRC = path.dirname(fileURLToPath(import.meta.url))

// xlsxWrite.ts가 없을 때 파일 전체가 아니라 그 시험만 실패하게 시험 안에서 불러온다
const loadXlsx = () => import('./xlsxWrite')

type Value = string | number | null

const WHEN = new Date(2026, 10, 23, 18, 30, 0)
const OPTS = { sheetName: 'ERP 마감일지 의사랑', widths: [34, 11, 44] }

/** design.md 7-1 꼴 예시(숫자는 지은 값) — 머리 줄은 A칸만, 칸 줄은 [이름, 값 또는 null, 까닭 또는 null] */
const ROWS: Value[][] = [
  ['항목', '11/23 (월)', '빈 칸 까닭'],
  ['업무일지 1'],
  ['진료'],
  ['외래 총매출', 1234567, null],
  ['MOU 감액', null, '직접 입력'],
  ['비급여', 0, null],
  ['도수치료 건수', 12.5, null],
  ['현불/환불(-)', -3000, null],
  ['청구액(-)', null, '못 읽음 (일일수입통계 없음)'],
  [],
  [null, null, null],
  ['업무일지 2'],
  ['치료별 매출 금액(원)'],
  ['도수치료', 350000, null],
]

const FILES = [
  '[Content_Types].xml',
  '_rels/.rels',
  'xl/workbook.xml',
  'xl/_rels/workbook.xml.rels',
  'xl/styles.xml',
  'xl/worksheets/sheet1.xml',
]

async function build(rows: Value[][] = ROWS, opts = OPTS) {
  const { workbookBytes } = await loadXlsx()
  return workbookBytes(rows, opts, WHEN)
}

function read(bytes: Uint8Array) {
  const wb = XLSX.read(bytes, { type: 'array', cellStyles: true, cellNF: true, sheetStubs: true, bookFiles: true })
  const files = (wb as unknown as { files: Record<string, { content: ArrayLike<number> }> }).files
  const file = (name: string) => {
    const found = files[name]
    expect(found, `${name}이 파일 안에 없다`).toBeTruthy()
    return new TextDecoder().decode(Uint8Array.from(found.content))
  }
  return { wb, ws: wb.Sheets[wb.SheetNames[0]], files, file }
}

const addr = (r: number, c: number) => XLSX.utils.encode_cell({ r, c })

/** 넣은 줄과 SheetJS로 다시 읽은 칸을 하나씩 견준다(빈 칸 = 칸 없음) */
function expectSame(ws: XLSX.WorkSheet, rows: Value[][], text: (s: string) => string = (s) => s) {
  let filled = 0
  rows.forEach((row, r) => {
    row.forEach((v, c) => {
      const cell = ws[addr(r, c)] as XLSX.CellObject | undefined
      if (v === null) {
        expect(cell, `${addr(r, c)} 빈 칸`).toBeUndefined()
        return
      }
      filled++
      expect(cell, `${addr(r, c)}`).toBeDefined()
      if (typeof v === 'number') {
        expect(cell!.t, `${addr(r, c)} 숫자 칸`).toBe('n')
        expect(cell!.v, `${addr(r, c)}`).toBe(v)
      } else {
        expect(cell!.t, `${addr(r, c)} 글 칸`).toBe('s')
        expect(cell!.v, `${addr(r, c)}`).toBe(text(v))
      }
    })
  })
  const cells = Object.keys(ws).filter((k) => !k.startsWith('!'))
  expect(cells, '넣지 않은 칸이 없다').toHaveLength(filled)
}

describe('AC-4213.2 workbookBytes — SheetJS로 다시 읽기', () => {
  it('AC-4213.2: 시트 하나, 이름은 opts.sheetName', async () => {
    const { wb } = read(await build())
    expect(wb.SheetNames).toEqual(['ERP 마감일지 의사랑'])
  })

  it('AC-4213.2: 모든 칸 값·종류(숫자 n · 글 s)가 넣은 줄과 같고, null·빈 줄은 칸이 없다', async () => {
    const { ws } = read(await build())
    expectSame(ws, ROWS)
    expect(ws['!ref']).toBe('A1:C14')
  })

  it('AC-4213.2: 숫자 칸은 서식 일반(쉼표 없음) — 1234567은 "1234567"로 보인다', async () => {
    const { ws } = read(await build())
    expect(ws.B4.z).toBe('General')
    expect(ws.B4.w).toBe('1234567')
    expect(ws.B14.w).toBe('350000')
    expect(ws.B6.w).toBe('0')
  })

  it('AC-4213.2: 빈 칸은 쓰지 않는다 — sheetStubs로 읽어도 빈 칸(z)이 없다', async () => {
    const { ws, file } = read(await build())
    const kinds = Object.keys(ws).filter((k) => !k.startsWith('!')).map((k) => (ws[k] as XLSX.CellObject).t)
    expect(kinds).not.toContain('z')
    const xml = file('xl/worksheets/sheet1.xml')
    const filled = ROWS.flat().filter((v) => v !== null).length
    expect(xml.match(/<c\b/g)).toHaveLength(filled)
  })

  it('AC-4213.2: 글 칸은 inlineStr(공유 글 표 없음), 숫자 칸은 t 없이 <v>', async () => {
    const { files, file } = read(await build())
    expect(Object.keys(files).some((k) => /sharedStrings/i.test(k))).toBe(false)
    const xml = file('xl/worksheets/sheet1.xml')
    expect(xml).toContain('<c r="A1" t="inlineStr"><is><t>항목</t></is></c>')
    expect(xml).toContain('<c r="B4"><v>1234567</v></c>')
    expect(xml).toContain('<c r="B8"><v>-3000</v></c>')
    expect(xml).toContain('<c r="B7"><v>12.5</v></c>')
    const texts = ROWS.flat().filter((v) => typeof v === 'string').length
    expect(xml.match(/t="inlineStr"/g)).toHaveLength(texts)
  })

  it('AC-4213.2: 열 너비 = opts.widths(A 34 · B 11 · C 44)', async () => {
    const { ws, file } = read(await build())
    expect(ws['!cols']?.map((c) => c.width)).toEqual([34, 11, 44])
    const xml = file('xl/worksheets/sheet1.xml')
    expect(xml).toContain('<col min="1" max="1" width="34" customWidth="1"/>')
    expect(xml).toContain('<col min="3" max="3" width="44" customWidth="1"/>')
  })

  it('AC-4213.2: 틀 고정 A열·1행(xSplit 1 · ySplit 1 · B2 · frozen), sheetViews → sheetFormatPr → cols → sheetData 차례', async () => {
    const { file } = read(await build())
    const xml = file('xl/worksheets/sheet1.xml')
    expect(xml).toContain('<pane xSplit="1" ySplit="1" topLeftCell="B2" activePane="bottomRight" state="frozen"/>')
    const order = ['<sheetViews>', '<sheetFormatPr', '<cols>', '<sheetData>'].map((tag) => xml.indexOf(tag))
    expect(order.every((at) => at > 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('AC-4213.2: 파일 안 여섯 개(가장 작은 SpreadsheetML) — 이 차례, 그 밖 파일 없음', async () => {
    const bytes = await build()
    const names: string[] = []
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    for (let at = 0; view.getUint32(at, true) === 0x04034b50; ) {
      const nameLen = view.getUint16(at + 26, true)
      const extraLen = view.getUint16(at + 28, true)
      const size = view.getUint32(at + 18, true)
      names.push(new TextDecoder().decode(bytes.subarray(at + 30, at + 30 + nameLen)))
      at += 30 + nameLen + extraLen + size
    }
    expect(names).toEqual(FILES)
  })

  it('AC-4213.2: [Content_Types].xml·rels·workbook.xml가 서로 맞게 가리킨다', async () => {
    const { file } = read(await build())
    const types = file('[Content_Types].xml')
    expect(types).toContain('PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"')
    expect(types).toContain('PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"')
    expect(types).toContain('PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"')
    expect(types).toContain('Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"')
    expect(file('_rels/.rels')).toContain('Target="xl/workbook.xml"')
    const wbRels = file('xl/_rels/workbook.xml.rels')
    expect(wbRels).toContain('Target="worksheets/sheet1.xml"')
    expect(wbRels).toContain('Target="styles.xml"')
    expect(file('xl/workbook.xml')).toMatch(/<sheet name="ERP 마감일지 의사랑" sheetId="1" r:id="rId1"\/>/)
  })

  it('AC-4213.2: styles.xml — 엑셀이 기대하는 가장 작은 꼴(글꼴 1 · 채움 none·gray125 · 테두리 1 · cellStyleXfs · cellXfs · cellStyles Normal)', async () => {
    const { file } = read(await build())
    const xml = file('xl/styles.xml')
    expect(xml).toContain('<fonts count="1">')
    expect(xml).toContain('<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>')
    expect(xml).toContain('<borders count="1">')
    expect(xml).toContain('<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>')
    expect(xml).toContain('<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>')
    expect(xml).toContain('<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>')
  })

  it('AC-4213.2: 모든 XML은 UTF-8 머리로 시작한다', async () => {
    const { file } = read(await build())
    for (const name of FILES) expect(file(name), name).toMatch(/^<\?xml version="1\.0" encoding="UTF-8" standalone="yes"\?>\r?\n?</)
  })
})

describe('AC-4213.2 workbookBytes — 글자 다루기', () => {
  it('AC-4213.2: XML 특수 글자 & < > " \' 가 글자 그대로 읽힌다(칸·시트 이름)', async () => {
    const rows: Value[][] = [['이름 & <특수> "따옴표" \'홑\'', 7, 'A&B<C>']]
    const { wb, ws, file } = read(await build(rows, { sheetName: 'R&D "시트"', widths: [34] }))
    expect(wb.SheetNames).toEqual(['R&D "시트"'])
    expectSame(ws, rows)
    const xml = file('xl/worksheets/sheet1.xml')
    expect(xml).toContain('이름 &amp; &lt;특수&gt; &quot;따옴표&quot; &apos;홑&apos;')
  })

  it('AC-4213.2: XML에 못 쓰는 제어 글자(\\u0000~\\u0008 · \\u000B · \\u000C · \\u000E~\\u001F · \\uFFFE · \\uFFFF · 짝 없는 서로게이트)는 뗀다', async () => {
    const bad = '\u0000\u0001\u0008\u000B\u000C\u000E\u001F\uFFFE\uFFFF\uD800'
    const rows: Value[][] = [[`제어${bad}글자`, null, `까닭\u0007`], [bad]]
    const { ws, file } = read(await build(rows))
    expect(ws.A1.v).toBe('제어글자')
    expect(ws.C1.v).toBe('까닭')
    const xml = file('xl/worksheets/sheet1.xml')
    // 모두 떼어 빈 글이 된 칸은 쓰지 않는다
    expect(ws.A2).toBeUndefined()
    expect(xml).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/)
  })

  it('AC-4213.2: 탭·줄바꿈·CR과 앞뒤 빈칸은 XML에 쓸 수 있어 그대로 둔다', async () => {
    const rows: Value[][] = [['가\t나'], ['다\n라'], ['마\r바'], ['  앞뒤 빈칸 ']]
    const { ws, file } = read(await build(rows))
    expectSame(ws, rows)
    const xml = file('xl/worksheets/sheet1.xml')
    expect(xml).toContain('<t xml:space="preserve">  앞뒤 빈칸 </t>')
    expect(xml).toContain('마&#13;바')
  })

  it('AC-4213.2: 빈 글("")은 빈 칸처럼 쓰지 않는다', async () => {
    const { ws } = read(await build([['', 1, '']]))
    expect(ws.A1).toBeUndefined()
    expect(ws.C1).toBeUndefined()
    expect(ws.B1.v).toBe(1)
  })

  it('AC-4213.2: 수가 아닌 숫자(NaN·Infinity)는 엑셀이 못 여니 쓰지 않는다', async () => {
    const { ws } = read(await build([['a', Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 5]]))
    expect(ws.B1).toBeUndefined()
    expect(ws.C1).toBeUndefined()
    expect(ws.D1).toBeUndefined()
    expect(ws.E1.v).toBe(5)
  })

  it('AC-4213.2: 26열 넘는 칸 주소(Z → AA → AB)', async () => {
    const row: Value[] = Array.from({ length: 28 }, (_, i) => i + 1)
    const { ws, file } = read(await build([row], { sheetName: 'x', widths: [] }))
    expect(ws.Z1.v).toBe(26)
    expect(ws.AA1.v).toBe(27)
    expect(ws.AB1.v).toBe(28)
    // 열 너비가 없으면 cols를 쓰지 않는다(빈 <cols/>는 엑셀이 못 엶)
    expect(file('xl/worksheets/sheet1.xml')).not.toContain('<cols')
  })

  it('AC-4213.2: 줄이 하나도 없어도 열리는 파일(빈 sheetData)', async () => {
    const { wb, file } = read(await build([]))
    expect(wb.SheetNames).toEqual(['ERP 마감일지 의사랑'])
    expect(file('xl/worksheets/sheet1.xml')).toMatch(/<sheetData\s*\/>|<sheetData><\/sheetData>/)
  })

  it.each([
    ['', '빈 이름'],
    ['가'.repeat(32), '32자'],
    ['a/b', '/'],
    ['a\\b', '\\'],
    ['a?b', '?'],
    ['a*b', '*'],
    ['a:b', ':'],
    ['a[b', '['],
    ['a]b', ']'],
    ["'ab", "앞 '"],
    ["ab'", "끝 '"],
  ])('AC-4213.2: 엑셀이 못 받는 시트 이름 %j(%s)은 던진다', async (sheetName) => {
    const { workbookBytes } = await loadXlsx()
    expect(() => workbookBytes(ROWS, { sheetName, widths: [] }, WHEN)).toThrow()
  })

  it('AC-4213.2: 31자 시트 이름은 된다', async () => {
    const { wb } = read(await build([['a']], { sheetName: '가'.repeat(31), widths: [] }))
    expect(wb.SheetNames).toEqual(['가'.repeat(31)])
  })
})

describe('AC-4213.2 묶음·이름', () => {
  it('AC-4213.2: XLSX_TYPE은 xlsx MIME', async () => {
    const { XLSX_TYPE } = await loadXlsx()
    expect(XLSX_TYPE).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  })

  it('AC-4213.2: 같은 줄·같은 when이면 같은 바이트(파일 시각은 when)', async () => {
    const a = await build()
    const b = await build()
    expect(Array.from(a)).toEqual(Array.from(b))
  })

  it('AC-4213.2: xlsxWrite.ts는 ./zip.js 하나만 import한다(SheetJS 없음, erp-copy-list와 한 벌로)', () => {
    const code = readFileSync(path.join(SRC, 'xlsxWrite.ts'), 'utf8')
    const imports = [...code.matchAll(/^\s*import\b[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1])
    expect(imports).toEqual(['./zip.js'])
    expect(code).not.toMatch(/\bimport\s*\(/)
    expect(code).not.toMatch(/\brequire\s*\(/)
  })

  it('AC-4213.2: 확장 코드(시험 빼고)는 어디서도 SheetJS(xlsx 패키지)를 import하지 않는다 → dist에 SheetJS 없음', () => {
    const files = readdirSync(SRC).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    expect(files).toEqual(expect.arrayContaining(['zip.ts', 'xlsxWrite.ts']))
    for (const f of files) {
      const code = readFileSync(path.join(SRC, f), 'utf8')
      expect(code, f).not.toMatch(/from\s+['"]xlsx(?:\/[^'"]*)?['"]|import\s*\(\s*['"]xlsx|require\s*\(\s*['"]xlsx/)
    }
  })
})
