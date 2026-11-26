import { GSHEET_PINNED_KEYS, type GsheetSettings } from '@/types/gsheet'

// 설정 화면이 부르는 도우미 명령 넷의 답 읽기(spec google-link design.md 9-2 — sheet.code·sheet.import·sheet.ping·sheet.catalog).
// 통로(lib/bridge/protocol checkResult, AC-004.6)도 이 함수로 답 모양을 본다 — 그래서 화면 폴더(components/gsheet/settings/replies.ts, TASK-16)에서
// 여기로 옮겼고(TASK-23 (라)) replies.ts는 다시 내보내기만 한다. 타입만 쓰는 순수 코드다(React·저장소·통로를 부르지 않는다).
// sheet.status·sheet.link 답은 lib/gsheet/reply(TASK-13)를 그대로 쓴다. 통로가 준 답을 믿지 않고 모양을 다시 본다:
// 정해 둔 열쇠 밖이 섞이거나(비밀 글자·이름 같은 것) 칸 모양이 틀리면 null — 부르는 쪽이 E-BRIDGE-BAD-REPLY 오류 카드로 친다.
// 돌려주는 값은 정해 둔 칸을 골라 새로 만든다. 비밀 글자는 어느 답에도 없다 — 표시(secretTag, SHA-256 앞 16자)만 온다(ADR-052)

export type CodeReply = { secretTag: string; codeVersion: string }
/** 비트시트 설정에서 주소·메일·비밀 글자를 뺀 설정(모양 검사는 저장 함수 saveGsheetSettings가 한다) */
export type ImportReply = { secretTag: string; settings: GsheetSettings }
export type PingReply = { ok: boolean; templateTitle: string | null; version: string | null; code: string | null }
export type Hospital = { code: string; name: string; recent: number }
export type Dept = { code: string; name: string; n90: number; today: boolean }
export type Rx = { code: string; name: string; cls: string; n90: number }
export type Catalog = { hospitals: Hospital[]; depts: Dept[]; rx: Rx[]; hospitalName: string }

type Rec = Record<string, unknown>

const PROTOCOL_V = 1
const TAG = /^[0-9a-f]{16}$/
const VERSION = /^[0-9]{1,4}$/
const CODE = /^E-[A-Z0-9-]{1,30}$/
const CONTROL = /[\u0000-\u001f\u007f]/
const CODE_MAX = 40
const NAME_MAX = 200
const LIST_MAX = 5000
const PINNED = new Set<string>(GSHEET_PINNED_KEYS)

const isRecord = (x: unknown): x is Rec => typeof x === 'object' && x !== null && !Array.isArray(x)
const isCount = (x: unknown): x is number => Number.isSafeInteger(x) && (x as number) >= 0
const isText = (x: unknown, min: number, max: number): x is string =>
  typeof x === 'string' && x.length >= min && x.length <= max && !CONTROL.test(x)

/** required를 모두 갖고 required·optional 밖의 열쇠가 없다 */
function exactKeys(x: Rec, required: readonly string[], optional: readonly string[] = []): boolean {
  return required.every((k) => Object.hasOwn(x, k)) && Object.keys(x).every((k) => required.includes(k) || optional.includes(k))
}

const isReply = (x: unknown): x is Rec => isRecord(x) && x.v === PROTOCOL_V

/** 코드 주소·함께 쓸 메일 열쇠가 안쪽 어디든 있나(저장 함수와 같은 깊이) */
function hasPinnedKey(value: unknown, depth = 0): boolean {
  if (typeof value !== 'object' || value === null || depth > 4) return false
  if (Array.isArray(value)) return value.some((item) => hasPinnedKey(item, depth + 1))
  return Object.keys(value).some((key) => PINNED.has(key) || hasPinnedKey((value as Rec)[key], depth + 1))
}

export function readCode(data: unknown): CodeReply | null {
  if (!isReply(data) || !exactKeys(data, ['v', 'secretTag', 'codeVersion'])) return null
  const { secretTag, codeVersion } = data
  if (typeof secretTag !== 'string' || !TAG.test(secretTag) || typeof codeVersion !== 'string' || !VERSION.test(codeVersion)) return null
  return { secretTag, codeVersion }
}

export function readImport(data: unknown): ImportReply | null {
  if (!isReply(data) || !exactKeys(data, ['v', 'secretTag', 'settings'])) return null
  const { secretTag, settings } = data
  if (typeof secretTag !== 'string' || !TAG.test(secretTag) || !isRecord(settings) || hasPinnedKey(settings)) return null
  return { secretTag, settings: structuredClone(settings) as GsheetSettings }
}

export function readPing(data: unknown): PingReply | null {
  if (!isReply(data) || !exactKeys(data, ['v', 'ok'], ['templateTitle', 'version', 'code'])) return null
  const { ok, templateTitle, version, code } = data
  if (typeof ok !== 'boolean') return null
  if (templateTitle !== undefined && !isText(templateTitle, 0, NAME_MAX)) return null
  if (version !== undefined && !(typeof version === 'string' && VERSION.test(version))) return null
  if (code !== undefined && !(typeof code === 'string' && CODE.test(code))) return null
  return { ok, templateTitle: templateTitle ?? null, version: version ?? null, code: code ?? null }
}

function readList<T>(x: unknown, keys: readonly string[], one: (row: Rec) => T | null): T[] | null {
  if (!Array.isArray(x) || x.length > LIST_MAX) return null
  const out: T[] = []
  for (const row of x) {
    if (!isRecord(row) || !exactKeys(row, keys)) return null
    const read = one(row)
    if (read === null) return null
    out.push(read)
  }
  return out
}

const codeOk = (x: unknown): x is string => isText(x, 1, CODE_MAX)
const nameOk = (x: unknown): x is string => isText(x, 0, NAME_MAX)

export function readCatalog(data: unknown): Catalog | null {
  if (!isReply(data) || !exactKeys(data, ['v', 'hospitals', 'depts', 'rx', 'hospitalName'])) return null
  const hospitals = readList(data.hospitals, ['code', 'name', 'recent'], (r) =>
    codeOk(r.code) && nameOk(r.name) && isCount(r.recent) ? { code: r.code, name: r.name, recent: r.recent } : null,
  )
  const depts = readList(data.depts, ['code', 'name', 'n90', 'today'], (r) =>
    codeOk(r.code) && nameOk(r.name) && isCount(r.n90) && typeof r.today === 'boolean' ? { code: r.code, name: r.name, n90: r.n90, today: r.today } : null,
  )
  const rx = readList(data.rx, ['code', 'name', 'cls', 'n90'], (r) =>
    codeOk(r.code) && nameOk(r.name) && isText(r.cls, 0, CODE_MAX) && isCount(r.n90) ? { code: r.code, name: r.name, cls: r.cls, n90: r.n90 } : null,
  )
  const { hospitalName } = data
  if (hospitals === null || depts === null || rx === null || !nameOk(hospitalName)) return null
  return { hospitals, depts, rx, hospitalName }
}
