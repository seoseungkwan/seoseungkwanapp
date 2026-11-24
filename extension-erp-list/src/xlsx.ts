// [엑셀로 받기] 파일 — spec erp-copy-list design.md 5절, AC-3906.2·AC-3906.3·AC-3906.4
// - 가장 작은 SpreadsheetML 파일을 직접 쓰고 저장만 하는 zip(zip.ts)으로 묶는다(남의 엑셀 코드를 싣지 않는다, design.md 결정 3)
// - 시트 하나에 화면 표와 같은 줄·열 + 끝 열 '빈 칸 까닭'. 경고 줄·씨암·SONO 줄·만든 때는 넣지 않는다(화면에만 있다)
// - 파일에는 목록 모양의 날짜별 집계 숫자·칸 이름·까닭 글만 들어간다. 네트워크는 쓰지 않는다(AC-3906.4)
// - 글 칸은 inlineStr(공유 글 표 없음), 숫자 칸은 서식 0(일반, 쉼표 없음). 빈 칸은 쓰지 않는다
import { dayList } from '../../extension-erp/src/rangeView.js'
import { dayHead, LIST_TEXT, WHY_ORDER, WHY_TEXT, type ListLine, type ListModel } from './listTypes.js'
import { zipStore } from './zip.js'

/** 시트 이름(31자 안, 시트 이름 금지 글자 없음) */
export const SHEET_NAME = LIST_TEXT.title

/** 받는 파일 종류 */
export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** 시트 칸 값 하나. null = 빈 칸, number = 숫자 칸, string = 글 칸 */
export type SheetValue = string | number | null

/** 열 너비(A · 날짜 · 끝 열) */
const WIDTH = { label: 34, day: 11, reason: 44 } as const

/** 쉼표 없는 정수(또는 소수) 글자만 숫자 칸으로 쓴다. 그 밖은 글 칸(뜻밖의 값도 파일이 깨지지 않게) */
const NUMBER_TEXT = /^-?\d+(?:\.\d+)?$/

function cellValue(value: string): number | string {
  return NUMBER_TEXT.test(value) ? Number(value) : value
}

/** 숫자 줄 끝 열 글: 나온 까닭마다(WHY_ORDER) 모든 날이면 꼬리표 글, 어떤 날만이면 '{꼬리표 글} ({M/D} · …)', 여럿은 ', '로 잇는다. 없으면 null */
function reasonText(model: ListModel, line: ListLine & { kind: 'row' }): string | null {
  const parts: string[] = []
  for (const why of WHY_ORDER) {
    const dates = line.cells.flatMap((cell, i) => ('why' in cell && cell.why === why ? [model.days[i].date] : []))
    if (dates.length === 0) continue
    parts.push(dates.length === model.days.length ? WHY_TEXT[why].tag : `${WHY_TEXT[why].tag} (${dayList(dates)})`)
  }
  return parts.length > 0 ? parts.join(', ') : null
}

/** 시트 칸 값(행마다). 1행 머리 · 업무일지·상자 머리 줄(A칸만) · 숫자 줄(A = 줄 이름[ 열 이름], 날짜 칸, 끝 열 까닭) */
export function sheetRows(model: ListModel): SheetValue[][] {
  const head: SheetValue[] = [
    LIST_TEXT.head,
    ...model.days.map((day) => dayHead(day.date) + (day.zero ? LIST_TEXT.xlsxZero : '')),
    LIST_TEXT.legend,
  ]
  const body = model.lines.map((line): SheetValue[] => {
    if (line.kind === 'journal') return [line.text]
    if (line.kind === 'section') return [line.sub ? `${line.text} ${line.sub}` : line.text]
    return [
      line.col ? `${line.name} ${line.col}` : line.name,
      ...line.cells.map((cell) => ('why' in cell ? null : cellValue(cell.value))),
      reasonText(model, line),
    ]
  })
  return [head, ...body]
}

/** 받는 파일 이름 'ERP마감일지_입력목록_{시작일}_{끝일}.xlsx' */
export function fileName(model: ListModel): string {
  return LIST_TEXT.fileName(model.from, model.to)
}

/** XML 1.0에 쓸 수 있는 글자인가(Char 규칙: 탭·줄바꿈·CR, U+0020~U+D7FF, U+E000~U+FFFD, U+10000~) */
function xmlChar(code: number): boolean {
  return (
    code === 0x9 ||
    code === 0xa ||
    code === 0xd ||
    (code >= 0x20 && code <= 0xd7ff) ||
    (code >= 0xe000 && code <= 0xfffd) ||
    (code >= 0x10000 && code <= 0x10ffff)
  )
}

const ENTITY: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }

/** XML 글·속성 값: 못 쓰는 글자(제어 글자·짝 없는 대리 글자 등)는 떼고 & < > " '를 바꾼다 */
function xml(text: string): string {
  let out = ''
  for (const ch of text) if (xmlChar(ch.codePointAt(0) ?? 0)) out += ENTITY[ch] ?? ch
  return out
}

/** 0부터 센 열 번호 → 열 이름(A … Z, AA …) */
function columnName(index: number): string {
  let name = ''
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name
  return name
}

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PACKAGE_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships'

const CONTENT_TYPES =
  XML_HEAD +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  '</Types>'

const ROOT_RELS =
  XML_HEAD +
  `<Relationships xmlns="${PACKAGE_REL_NS}">` +
  `<Relationship Id="rId1" Type="${REL_NS}/officeDocument" Target="xl/workbook.xml"/>` +
  '</Relationships>'

const WORKBOOK =
  XML_HEAD +
  `<workbook xmlns="${MAIN_NS}" xmlns:r="${REL_NS}">` +
  `<sheets><sheet name="${xml(SHEET_NAME)}" sheetId="1" r:id="rId1"/></sheets>` +
  '</workbook>'

const WORKBOOK_RELS =
  XML_HEAD +
  `<Relationships xmlns="${PACKAGE_REL_NS}">` +
  `<Relationship Id="rId1" Type="${REL_NS}/worksheet" Target="worksheets/sheet1.xml"/>` +
  `<Relationship Id="rId2" Type="${REL_NS}/styles" Target="styles.xml"/>` +
  '</Relationships>'

/** 엑셀이 까다롭게 보는 가장 작은 꼴: 글꼴 1 · 채움 2(none · gray125) · 테두리 1 · cellStyleXfs 1 · cellXfs 1 · cellStyles 1(Normal) */
const STYLES =
  XML_HEAD +
  `<styleSheet xmlns="${MAIN_NS}">` +
  '<fonts count="1"><font><sz val="11"/><name val="맑은 고딕"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>'

/** 칸 하나(빈 칸은 쓰지 않으므로 null은 오지 않는다) */
function cellXml(ref: string, value: string | number): string {
  if (typeof value === 'number') return `<c r="${ref}"><v>${value}</v></c>`
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`
}

/** sheet1.xml: dimension → sheetViews(1행·A열 틀 고정) → sheetFormatPr → cols → sheetData */
function sheetXml(rows: readonly SheetValue[][], dayCount: number): string {
  const width = Math.max(1, ...rows.map((r) => r.length))
  const last = `${columnName(width - 1)}${Math.max(1, rows.length)}`
  const cols = [
    `<col min="1" max="1" width="${WIDTH.label}" customWidth="1"/>`,
    dayCount > 0 ? `<col min="2" max="${dayCount + 1}" width="${WIDTH.day}" customWidth="1"/>` : '',
    `<col min="${dayCount + 2}" max="${dayCount + 2}" width="${WIDTH.reason}" customWidth="1"/>`,
  ].join('')
  const data = rows
    .map((cells, r) => {
      const row = r + 1
      const inner = cells.map((value, c) => (value === null ? '' : cellXml(`${columnName(c)}${row}`, value))).join('')
      return `<row r="${row}">${inner}</row>`
    })
    .join('')
  return (
    XML_HEAD +
    `<worksheet xmlns="${MAIN_NS}" xmlns:r="${REL_NS}">` +
    `<dimension ref="A1:${last}"/>` +
    '<sheetViews><sheetView workbookViewId="0">' +
    '<pane xSplit="1" ySplit="1" topLeftCell="B2" activePane="bottomRight" state="frozen"/>' +
    '</sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    `<cols>${cols}</cols>` +
    `<sheetData>${data}</sheetData>` +
    '</worksheet>'
  )
}

/** .xlsx 바이트. when = zip 안 파일 시각(이 PC 시각) */
export function workbookBytes(model: ListModel, when: Date): Uint8Array {
  const encoder = new TextEncoder()
  const parts: [string, string][] = [
    ['[Content_Types].xml', CONTENT_TYPES],
    ['_rels/.rels', ROOT_RELS],
    ['xl/workbook.xml', WORKBOOK],
    ['xl/_rels/workbook.xml.rels', WORKBOOK_RELS],
    ['xl/styles.xml', STYLES],
    ['xl/worksheets/sheet1.xml', sheetXml(sheetRows(model), model.days.length)],
  ]
  return zipStore(
    parts.map(([name, text]) => ({ name, data: encoder.encode(text) })),
    when,
  )
}
