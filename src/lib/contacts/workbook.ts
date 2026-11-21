import {
  CONTACT_HEADERS,
  CONTACT_KEYS,
  CONTACT_SHEET,
  EQUIPMENT_HEADERS,
  EQUIPMENT_KEYS,
  EQUIPMENT_SHEET,
  cellText,
  mapHeaders,
  type Cell,
  type SheetRows,
} from './sheet'

// 주소록 엑셀 파일 읽기(specs/contacts design.md '엑셀 읽기', AC-6504.1·AC-6504.2). 환자 자료가 없는 파일이라 화면 쪽에서 읽는다.
// 파일 내용은 브라우저 메모리에서만 다루고 어디로도 보내지 않는다. xlsx는 여기서만 늦게 불러 첫 화면 JS에 싣지 않는다.
// 시트는 이름이 꼭 '연락처'·'장비'인 것만 읽는다('쓰는 법'에 같은 머리글의 예시 표가 있다)

export const MAX_FILE_BYTES = 5_000_000
export const MAX_CONTACT_ROWS = 2000
export const MAX_EQUIPMENT_ROWS = 1000

/** big = 파일·줄 수 한도 넘음, not-xlsx = xlsx로 못 읽음, locked = 비밀번호 걸림, form = 시트·머리글이 양식과 다름, empty = 두 시트에 적힌 줄 없음 */
export type ReadProblem = 'big' | 'not-xlsx' | 'locked' | 'form' | 'empty'
export type ReadResult = SheetRows | ReadProblem

type Xlsx = typeof import('xlsx')
type Line<K extends string> = { row: number; cells: Record<K, Cell> }

const ZIP = [0x50, 0x4b, 0x03, 0x04]
const OLE = [0xd0, 0xcf, 0x11, 0xe0]
// 비밀번호 걸린 xlsx는 zip이 아니라 OLE 묶음 안에 이 둘을 둔다(ECMA-376 암호화)
const ENCRYPTED_STREAMS = ['EncryptionInfo', 'EncryptedPackage']

const startsWith = (bytes: Uint8Array, magic: readonly number[]) => magic.every((byte, i) => bytes[i] === byte)

export async function readContactsFile(bytes: Uint8Array): Promise<ReadResult> {
  if (bytes.length > MAX_FILE_BYTES) return 'big'
  const zip = startsWith(bytes, ZIP)
  const ole = !zip && startsWith(bytes, OLE)
  if (!zip && !ole) return 'not-xlsx'

  const XLSX: Xlsx = await import('xlsx')
  if (ole) return isEncrypted(XLSX, bytes) ? 'locked' : 'not-xlsx'

  let wb: import('xlsx').WorkBook
  try {
    wb = XLSX.read(bytes, { type: 'array', cellDates: false, dense: false })
  } catch {
    return 'not-xlsx'
  }

  const sheetNamed = (name: string) => {
    const found = wb.SheetNames.find((sheet) => sheet.normalize('NFC') === name)
    return found === undefined ? undefined : wb.Sheets[found]
  }
  const contactSheet = sheetNamed(CONTACT_SHEET)
  const equipmentSheet = sheetNamed(EQUIPMENT_SHEET)
  if (!contactSheet || !equipmentSheet) return 'form'

  const contacts = sheetLines(XLSX, contactSheet, CONTACT_HEADERS, CONTACT_KEYS)
  const equipment = sheetLines(XLSX, equipmentSheet, EQUIPMENT_HEADERS, EQUIPMENT_KEYS)
  if (contacts === null || equipment === null) return 'form'
  if (contacts.length > MAX_CONTACT_ROWS || equipment.length > MAX_EQUIPMENT_ROWS) return 'big'
  if (contacts.length === 0 && equipment.length === 0) return 'empty'
  return { contacts, equipment }
}

function isEncrypted(XLSX: Xlsx, bytes: Uint8Array): boolean {
  try {
    const container = XLSX.CFB.read(bytes, { type: 'array' })
    return container.FileIndex.some((entry: { name: string }) => ENCRYPTED_STREAMS.includes(entry.name))
  } catch {
    return false
  }
}

// 시트 하나: 첫 줄 = 머리글(mapHeaders, 못 찾으면 null), 그 아래 적힌 줄마다 엑셀 줄 번호와 머리글 열쇠별 칸 값. 모든 칸이 빈 줄은 뺀다
function sheetLines<K extends string>(XLSX: Xlsx, ws: import('xlsx').WorkSheet, headers: readonly string[], keys: readonly K[]): Line<K>[] | null {
  const range = valueRange(XLSX, ws)
  if (range === null) return null
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: true, range })
  const places = mapHeaders((grid[0] ?? []).map(toCell), headers)
  if (places === null) return null
  const lines: Line<K>[] = []
  for (let i = 1; i < grid.length; i++) {
    const values = grid[i] ?? []
    const cells = Object.fromEntries(keys.map((key, k) => [key, toCell(values[places[k]])])) as Record<K, Cell>
    if (keys.every((key) => cellText(cells[key]) === '')) continue
    lines.push({ row: range.s.r + 1 + i, cells })
  }
  return lines
}

// 시트 범위(!ref)는 서식만 있는 칸·엑셀 끝 줄까지 잡히기도 한다 → 시작은 그대로 두고 끝을 값이 든 마지막 줄·칸까지로 줄인다(빈 줄 백만 개를 만들지 않게)
function valueRange(XLSX: Xlsx, ws: import('xlsx').WorkSheet): import('xlsx').Range | null {
  const ref = ws['!ref']
  if (!ref) return null
  const range = XLSX.utils.decode_range(ref)
  let lastRow = -1
  let lastCol = -1
  for (const address of Object.keys(ws)) {
    if (address.startsWith('!')) continue
    const value = (ws[address] as import('xlsx').CellObject | undefined)?.v
    if (value === undefined || value === null || value === '') continue
    const at = XLSX.utils.decode_cell(address)
    if (at.r > lastRow) lastRow = at.r
    if (at.c > lastCol) lastCol = at.c
  }
  if (lastRow < range.s.r || lastCol < range.s.c) return null
  return { s: range.s, e: { r: Math.min(range.e.r, lastRow), c: Math.min(range.e.c, lastCol) } }
}

// 칸 값은 Cell로만(날짜 칸은 cellDates: false라 숫자로 온다). 그 밖(오류 칸 등)은 빈 칸
function toCell(value: unknown): Cell {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : null
}
