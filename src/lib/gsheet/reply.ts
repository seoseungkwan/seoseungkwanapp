import type { FillReply, FillUnchanged, GsheetPinned } from './shapes'

// 도우미 수납 명령 답 읽기(spec google-link REQ-8513, design.md 9-2·10-4). 통로(lib/bridge)가 준 답을 믿지 않고 여기서 모양을 다시 본다.
// 남기는 것은 숫자·참거짓·판 글자(숫자)·칸 주소('23!J9' 꼴, 20개까지)·파일 id·gid뿐이다. 정해 둔 열쇠 밖이 섞이거나(이름·차트번호 등)
// 칸 모양이 틀리면 null — 부르는 쪽이 E-BRIDGE-BAD-REPLY로 친다. 돌려주는 값은 정해 둔 칸을 골라 새로 만든다(받은 값을 그대로 넘기지 않음).
// sheet.status의 코드 주소·함께 쓸 메일은 설정 칸 보이기용 pinned 하나로만 내놓는다 — 기록·서버로 가는 값에 섞지 않는다(ADR-052).
// types/bridge.ts(TASK-10)는 import하지 않는다(같은 Phase — 답 모양을 여기에 스스로 둔다).

/** 모양이 틀린 답의 번호(통로와 같은 번호) */
export const BAD_REPLY = 'E-BRIDGE-BAD-REPLY'

/** sheet.status 답 — 이 PC 비밀 글자 표시(서버 secret_tag와 견줌)·비트시트 설정 있음·코드 판·주소 확인 여부 + 설정 칸 보이기용 주소·메일 */
export type SheetStatus = { secretTag: string | null; bitsheet: boolean; codeVersion: string; verified: boolean; pinned: GsheetPinned }
/** sheet.link 답 — 같은 값이라 창 없이 끝났나 */
export type SheetLink = { same: boolean }
/** sheet.months 답의 달 하나(파일이 없으면 fileId null) */
export type SheetMonth = { ym: string; fileId: string | null; gids: Record<string, number> }
export type SheetMonths = { version: string; months: SheetMonth[] }

type Rec = Record<string, unknown>

const PROTOCOL_V = 1
const TAG = /^[0-9a-f]{16}$/ // SHA-256(비밀 글자) 16진수 앞 16자 — 비밀 글자 자체는 오지 않는다
const VERSION = /^[0-9]{1,4}$/
const YM = /^[0-9]{4}-(0[1-9]|1[0-2])$/
const FILE_ID = /^[A-Za-z0-9_-]{20,100}$/
const SHEET_DAY = /^(?:[1-9]|[12][0-9]|3[01])$/
// 칸 주소: 시트 이름 ! 칸 글자 줄 번호(gsheet_runs.cells와 같은 모양, 시트 이름에 줄바꿈 같은 조절 글자 없음)
const CELL = /^[^!\u0000-\u001f\u007f]{1,31}![A-Z]{1,3}[0-9]{1,4}$/
const PLAIN = /^[^\s\u0000-\u001f\u007f]+$/ // 빈칸·줄바꿈·조절 글자 없는 한 낱말(주소·메일)
const URL_MAX = 2000
const MAIL_MAX = 254
const SHARE_MAX = 10
const CELLS_MAX = 20
const MONTHS_MAX = 13

const isRecord = (x: unknown): x is Rec => typeof x === 'object' && x !== null && !Array.isArray(x)
const isCount = (x: unknown): x is number => Number.isSafeInteger(x) && (x as number) >= 0
const isBool = (x: unknown): x is boolean => typeof x === 'boolean'
const isVersion = (x: unknown): x is string => typeof x === 'string' && VERSION.test(x)
const isFileId = (x: unknown): x is string => typeof x === 'string' && FILE_ID.test(x)
const isPlain = (x: unknown, max: number): x is string => typeof x === 'string' && x.length <= max && PLAIN.test(x)

/** required를 모두 갖고 required·optional 밖의 열쇠가 없다 */
function exactKeys(x: Rec, required: readonly string[], optional: readonly string[] = []): boolean {
  return required.every((k) => Object.hasOwn(x, k)) && Object.keys(x).every((k) => required.includes(k) || optional.includes(k))
}

/** 판(v)이 맞는 묶음 */
const isReply = (x: unknown): x is Rec => isRecord(x) && x.v === PROTOCOL_V

// ── sheet.status ───────────────────────────────────────────

const STATUS_KEYS = ['v', 'secretTag', 'bitsheet', 'codeVersion', 'url', 'shareWith', 'verified'] as const

export function readStatus(data: unknown): SheetStatus | null {
  if (!isReply(data) || !exactKeys(data, STATUS_KEYS)) return null
  const { secretTag, bitsheet, codeVersion, url, shareWith, verified } = data
  if (secretTag !== null && !(typeof secretTag === 'string' && TAG.test(secretTag))) return null
  if (!isBool(bitsheet) || !isVersion(codeVersion) || !isBool(verified)) return null
  if (url !== null && !isPlain(url, URL_MAX)) return null
  if (!Array.isArray(shareWith) || shareWith.length > SHARE_MAX || !shareWith.every((m) => isPlain(m, MAIL_MAX))) return null
  return { secretTag, bitsheet, codeVersion, verified, pinned: { url, shareWith: [...(shareWith as string[])] } }
}

// ── sheet.link ─────────────────────────────────────────────

export function readLink(data: unknown): SheetLink | null {
  if (!isReply(data) || !exactKeys(data, ['v', 'ok'], ['same']) || data.ok !== true) return null
  if (Object.hasOwn(data, 'same') && data.same !== true) return null
  return { same: data.same === true }
}

// ── sheet.months ───────────────────────────────────────────

function readGids(x: unknown): Record<string, number> | null {
  if (!isRecord(x)) return null
  const entries = Object.entries(x)
  return entries.every(([day, gid]) => SHEET_DAY.test(day) && isCount(gid)) ? (Object.fromEntries(entries) as Record<string, number>) : null
}

function readMonth(x: unknown): SheetMonth | null {
  if (!isRecord(x) || !exactKeys(x, ['ym', 'fileId', 'gids'])) return null
  const { ym, fileId } = x
  const gids = readGids(x.gids)
  if (typeof ym !== 'string' || !YM.test(ym) || (fileId !== null && !isFileId(fileId)) || gids === null) return null
  return { ym, fileId, gids }
}

export function readMonths(data: unknown): SheetMonths | null {
  if (!isReply(data) || !exactKeys(data, ['v', 'version', 'months'])) return null
  const { version, months } = data
  if (!isVersion(version) || !Array.isArray(months) || months.length > MONTHS_MAX) return null
  const read = months.map(readMonth)
  return read.every((m) => m !== null) ? { version, months: read as SheetMonth[] } : null
}

// ── sheet.fill ─────────────────────────────────────────────

/** 셈 칸(0 이상 정수) — design.md 9-2 차례 */
const COUNT_KEYS = [
  'rows',
  'patients',
  'added',
  'filled',
  'overwritten',
  'skipped',
  'cancelCleared',
  'cancelKept',
  'freeFixed',
  'inserted',
  'cleaned',
  'shareFailed',
  'ratioFixed',
  'ratioSkippedCount',
  'split',
  'free',
  'paidOnly',
  'notes',
] as const satisfies readonly (keyof FillReply)[]
const FLAG_KEYS = ['full', 'created', 'ratioFailed', 'oldCode'] as const satisfies readonly (keyof FillReply)[]
const NOT_PUT_KEYS = ['noName', 'unlinked', 'negative', 'noChart'] as const satisfies readonly (keyof FillReply['notPut'])[]
const FILL_KEYS = ['v', ...COUNT_KEYS, ...FLAG_KEYS, 'ratioSkipped', 'notPut', 'fileId', 'sheetGid', 'version'] as const

function readNotPut(x: unknown): FillReply['notPut'] | null {
  if (!isRecord(x) || !exactKeys(x, NOT_PUT_KEYS) || !NOT_PUT_KEYS.every((k) => isCount(x[k]))) return null
  return { noName: x.noName as number, unlinked: x.unlinked as number, negative: x.negative as number, noChart: x.noChart as number }
}

function readCells(x: unknown): string[] | null {
  if (!Array.isArray(x) || x.length > CELLS_MAX) return null
  return x.every((cell) => typeof cell === 'string' && CELL.test(cell)) ? [...(x as string[])] : null
}

function readFull(data: Rec): FillReply | null {
  if (!exactKeys(data, FILL_KEYS)) return null
  if (!COUNT_KEYS.every((k) => isCount(data[k])) || !FLAG_KEYS.every((k) => isBool(data[k]))) return null
  const notPut = readNotPut(data.notPut)
  const ratioSkipped = readCells(data.ratioSkipped)
  const { fileId, sheetGid, version } = data
  if (notPut === null || ratioSkipped === null || !isVersion(version)) return null
  if ((fileId !== null && !isFileId(fileId)) || (sheetGid !== null && !isCount(sheetGid))) return null
  const reply = {} as Record<string, unknown>
  for (const k of COUNT_KEYS) reply[k] = data[k]
  for (const k of FLAG_KEYS) reply[k] = data[k]
  return { ...(reply as Omit<FillReply, 'ratioSkipped' | 'notPut' | 'fileId' | 'sheetGid' | 'version'>), ratioSkipped, notPut, fileId, sheetGid, version }
}

/** 넣기 답: 다 넣은 답(숫자 칸 모두) 또는 지문이 같아 보내지 않은 답 {unchanged, rows} */
export function readFill(data: unknown): FillReply | FillUnchanged | null {
  if (!isReply(data)) return null
  if (Object.hasOwn(data, 'unchanged')) {
    if (!exactKeys(data, ['v', 'unchanged', 'rows']) || data.unchanged !== true || !isCount(data.rows)) return null
    return { unchanged: true, rows: data.rows }
  }
  return readFull(data)
}
