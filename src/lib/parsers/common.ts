import * as XLSX from 'xlsx'
import type { Cell, Grid, Outcome } from '@/types/parse'

// 어느 EMR 파일이든 쓰는 파일 열기: 바이트 → 칸들의 표(Grid). 칸 이름은 모른다(EMR 전용 규칙은 parsers/<EMR>/에).
// 파일 이름·확장자는 받지 않는다(비트는 속이 HTML인 .xls를 내보내고, 사용자가 이름을 바꾸기도 한다).

export const MAX_BYTES = 50 * 1024 * 1024
export const MAX_ROWS = 1_000_000

const BOM = [0xef, 0xbb, 0xbf]
const ZIP = [0x50, 0x4b, 0x03, 0x04]
const OLE = [0xd0, 0xcf, 0x11, 0xe0]
const HTML_TAG = /<(table|html)\b/i

const COMMA = 0x2c
const QUOTE = 0x22
const CR = 0x0d
const LF = 0x0a
const SPACE = 0x20
const TAB = 0x09
const LT = 0x3c

const startsWith = (bytes: Uint8Array, magic: readonly number[]) => magic.every((byte, i) => bytes[i] === byte)

// UTF-8(BOM 있음·없음) → CP949 순서
export function decodeText(bytes: Uint8Array): string {
  if (startsWith(bytes, BOM)) return new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes.subarray(BOM.length))
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('euc-kr').decode(bytes) // 브라우저·Node 모두 CP949(windows-949)로 푼다
  }
}

export function sniffFormat(bytes: Uint8Array): 'xlsx' | 'xls' | 'html' | 'text' {
  if (startsWith(bytes, ZIP)) return 'xlsx'
  if (startsWith(bytes, OLE)) return 'xls'
  let i = startsWith(bytes, BOM) ? BOM.length : 0
  while (bytes[i] === SPACE || bytes[i] === TAB || bytes[i] === CR || bytes[i] === LF) i++
  // 태그는 ASCII라 latin1로 풀어 찾는다(UTF-8·CP949 어느 쪽이든 '<table' 바이트는 같다)
  if (bytes[i] === LT && HTML_TAG.test(new TextDecoder('latin1').decode(bytes))) return 'html'
  return 'text'
}

// 쉼표 구분, 따옴표 칸(칸 안 쉼표·줄바꿈·""), 줄 끝은 CRLF·LF·CR. 빈 줄은 건너뛴다. 칸 글자는 바꾸지 않는다
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  const n = text.length
  let i = 0
  while (i < n) {
    const first = text.charCodeAt(i)
    if (first === CR || first === LF) {
      i++
      continue
    }
    const row: string[] = []
    for (;;) {
      let cell = ''
      if (text.charCodeAt(i) === QUOTE) {
        let start = i + 1
        for (;;) {
          const quote = text.indexOf('"', start)
          if (quote === -1) {
            // 닫는 따옴표가 없으면 끝까지 한 칸
            cell += text.slice(start)
            i = n
            break
          }
          cell += text.slice(start, quote)
          if (text.charCodeAt(quote + 1) === QUOTE) {
            cell += '"'
            start = quote + 2
            continue
          }
          i = quote + 1
          break
        }
      }
      // 쉼표·줄 끝까지(닫는 따옴표 뒤에 붙은 글자도 같은 칸)
      let end = i
      while (end < n) {
        const c = text.charCodeAt(end)
        if (c === COMMA || c === CR || c === LF) break
        end++
      }
      row.push(end > i ? cell + text.slice(i, end) : cell)
      i = end
      if (text.charCodeAt(i) !== COMMA) break
      i++
    }
    if (text.charCodeAt(i) === CR) i++
    if (text.charCodeAt(i) === LF) i++
    rows.push(row)
  }
  return rows
}

const TOO_BIG = { ok: false, code: 'E-PARSE-TOO-BIG' } as const
const EMPTY = { ok: false, code: 'E-PARSE-EMPTY' } as const
const UNREADABLE = { ok: false, code: 'E-PARSE-UNREADABLE' } as const

export function readGrid(bytes: Uint8Array): Outcome<Grid> {
  if (bytes.byteLength > MAX_BYTES) return TOO_BIG
  let rows: unknown[][] | null
  try {
    rows = readRows(bytes)
  } catch {
    // 암호·깨짐·보안 프로그램 잠금 등. 예외 글에 파일 내용이 섞일 수 있어 번호만 돌려준다
    return UNREADABLE
  }
  if (rows === null || rows.length > MAX_ROWS) return TOO_BIG
  const grid = tidy(rows)
  return grid.length > 0 ? { ok: true, value: grid } : EMPTY
}

// null = 엑셀 시트가 읽는 줄 수 상한(MAX_ROWS + 1)보다 길다
function readRows(bytes: Uint8Array): unknown[][] | null {
  const format = sniffFormat(bytes)
  if (format === 'text') return parseCsv(decodeText(bytes))
  const book =
    format === 'html'
      ? // 글로 먼저 푼다(CP949 HTML). raw: 칸 글자를 숫자·Date로 바꾸지 않는다(앞 0·날짜 모양 글자가 CSV와 같게 남는다)
        XLSX.read(fromFirstTag(decodeText(bytes)), { type: 'string', raw: true })
      : XLSX.read(bytes, { type: 'array', sheetRows: MAX_ROWS + 1, cellDates: false })
  const sheet = book.Sheets[book.SheetNames[0]]
  if (sheet === undefined) return []
  // 잘렸으면 SheetJS가 원래 범위를 !fullref에 남긴다. 남은 줄만 세면 중간 빈 줄 때문에 잘린 것을 놓친다
  if (sheet['!fullref'] !== undefined) return null
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null, blankrows: false })
}

// sniffFormat이 건너뛴 앞 공백을 뗀다. SheetJS는 탭으로 시작하는 글을 HTML이 아니라 CSV/TSV로 읽는다
const fromFirstTag = (text: string) => text.slice(text.indexOf('<'))

const isBlank = (value: unknown) => value === null || value === undefined || value === ''

// 빈 칸('' 포함)은 null, 줄 끝의 빈 칸은 떼고, 다 빈 줄은 뺀다 → CSV·엑셀·HTML이 같은 표가 된다.
// 줄 배열은 방금 읽어 만든 것이라 그 자리에서 고친다(10만 줄 × 23칸을 새로 복사하면 느리다)
function tidy(rows: unknown[][]): Grid {
  const grid: Grid = []
  for (const row of rows) {
    let end = row.length
    while (end > 0 && isBlank(row[end - 1])) end--
    if (end === 0) continue
    row.length = end
    for (let c = 0; c < end; c++) row[c] = toCell(row[c])
    grid.push(row as Cell[])
  }
  return grid
}

// 숫자는 숫자 그대로(엑셀 날짜 숫자도. 날짜로 바꾸는 건 EMR 쪽이 dates.ts로). 참·거짓 등 그 밖의 값은 글자로
function toCell(value: unknown): Cell {
  if (typeof value === 'number' || typeof value === 'string') return value === '' ? null : value
  return isBlank(value) ? null : String(value)
}
