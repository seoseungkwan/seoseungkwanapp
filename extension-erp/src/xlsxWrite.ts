// 가장 작은 SpreadsheetML(.xlsx) 한 시트 쓰기 — design.md 7-2 (spec erp-uisarang TASK-6).
// 파일 안·XML 꼴은 erp-copy-list design.md 5절 그대로. 저장만 하는 zip(`zip.ts`) 말고는 import하지 않는다
// (줄 모양은 부르는 쪽이 만든다 → erp-copy-list와 합칠 때 한 벌로). 서식(색·굵게) 없이 숫자 칸·틀 고정·열 너비만
import { zipStore } from './zip.js'

/** 시트 칸 값. null = 빈 칸(쓰지 않음), number = 숫자 칸, string = 글 칸 */
export type SheetValue = string | number | null

export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'
const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships'

// XML 1.0에 쓸 수 있는 글자(탭·줄바꿈·CR · U+0020~U+D7FF · U+E000~U+FFFD · U+10000~)만 남긴다
const NOT_XML = /[^\t\n\r\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu

const clean = (s: string) => s.replace(NOT_XML, '')

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/\r/g, '&#13;') // XML 읽개가 CR을 줄바꿈으로 바꾸지 않게
}

/** 0 → A, 25 → Z, 26 → AA */
function column(i: number): string {
  let s = ''
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

/** 엑셀이 받는 시트 이름: 1~31자, `: \ / ? * [ ]` 없음, 앞뒤 `'` 없음, XML에 못 쓰는 글자 없음 */
function checkSheetName(name: string): void {
  if (name.length < 1 || name.length > 31 || /[:\\/?*[\]]/.test(name) || name.startsWith("'") || name.endsWith("'") || clean(name) !== name) {
    throw new RangeError('엑셀 시트 이름은 1~31자이고 : \\ / ? * [ ] 와 앞뒤 작은따옴표를 쓰지 않는다')
  }
}

function cellXml(ref: string, v: SheetValue): string {
  if (typeof v === 'number') return Number.isFinite(v) ? `<c r="${ref}"><v>${String(v)}</v></c>` : ''
  if (typeof v !== 'string') return ''
  const text = clean(v)
  if (text === '') return ''
  const space = /^\s|\s$|[\t\n\r]/.test(text) ? ' xml:space="preserve"' : ''
  return `<c r="${ref}" t="inlineStr"><is><t${space}>${escape(text)}</t></is></c>`
}

function sheetXml(rows: readonly SheetValue[][], widths: readonly number[]): string {
  const cols = widths
    .map((w, i) => (Number.isFinite(w) && w > 0 ? `<col min="${i + 1}" max="${i + 1}" width="${String(w)}" customWidth="1"/>` : ''))
    .join('')
  const data = rows
    .map((row, r) => {
      const cells = row.map((v, c) => cellXml(`${column(c)}${r + 1}`, v)).join('')
      return cells ? `<row r="${r + 1}">${cells}</row>` : ''
    })
    .join('')
  return (
    HEAD +
    `<worksheet xmlns="${MAIN}" xmlns:r="${REL}">` +
    '<sheetViews><sheetView workbookViewId="0">' +
    '<pane xSplit="1" ySplit="1" topLeftCell="B2" activePane="bottomRight" state="frozen"/>' +
    '</sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    (cols ? `<cols>${cols}</cols>` : '') +
    (data ? `<sheetData>${data}</sheetData>` : '<sheetData/>') +
    '</worksheet>'
  )
}

const CONTENT_TYPES =
  HEAD +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
  '</Types>'

const ROOT_RELS =
  HEAD +
  `<Relationships xmlns="${PKG_REL}">` +
  `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/>` +
  '</Relationships>'

const WORKBOOK_RELS =
  HEAD +
  `<Relationships xmlns="${PKG_REL}">` +
  `<Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/>` +
  `<Relationship Id="rId2" Type="${REL}/styles" Target="styles.xml"/>` +
  '</Relationships>'

// 엑셀이 까다롭게 보는 가장 작은 꼴: 글꼴 1 · 채움 2(none·gray125) · 테두리 1 · cellStyleXfs 1 · cellXfs 1 · cellStyles 1
const STYLES =
  HEAD +
  `<styleSheet xmlns="${MAIN}">` +
  '<fonts count="1"><font><sz val="11"/><name val="맑은 고딕"/><family val="3"/><charset val="129"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>'

/** 줄마다 칸 값 → .xlsx 바이트(시트 하나, A열·1행 틀 고정, widths = A열부터 열 너비). 파일 시각은 when */
export function workbookBytes(
  rows: readonly SheetValue[][],
  opts: { sheetName: string; widths: readonly number[] },
  when: Date,
): Uint8Array {
  checkSheetName(opts.sheetName)
  const workbook =
    HEAD +
    `<workbook xmlns="${MAIN}" xmlns:r="${REL}">` +
    `<sheets><sheet name="${escape(opts.sheetName)}" sheetId="1" r:id="rId1"/></sheets>` +
    '</workbook>'
  const utf8 = new TextEncoder()
  return zipStore(
    [
      { name: '[Content_Types].xml', data: utf8.encode(CONTENT_TYPES) },
      { name: '_rels/.rels', data: utf8.encode(ROOT_RELS) },
      { name: 'xl/workbook.xml', data: utf8.encode(workbook) },
      { name: 'xl/_rels/workbook.xml.rels', data: utf8.encode(WORKBOOK_RELS) },
      { name: 'xl/styles.xml', data: utf8.encode(STYLES) },
      { name: 'xl/worksheets/sheet1.xml', data: utf8.encode(sheetXml(rows, opts.widths)) },
    ],
    when,
  )
}
