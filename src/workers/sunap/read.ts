import { isMonth, isYmd } from '@/lib/analytics/dates'
import { BridgeError, isErrorCode, isRecord } from '@/lib/bridge/protocol'
import { MAX_WON } from '@/lib/sunap/ledger'
import type { RxGroupDef } from '@/types/analysis'
import type {
  HandRsvKind,
  LedgerRow,
  RsvKind,
  RsvWords,
  SunapEdit,
  SunapLocalDay,
  SunapReply,
  SunapReplyPaid,
  SunapReplyRow,
  VisitKind,
} from '@/types/sunap'
import { LEDGER_EDITED_FIELDS } from '@/types/sunap'
import { SUNAP_NOTE_MAX, type SunapPatch, type SunapStreamRef } from './messages'

// 수납일지 Worker가 받는 것 읽기·고친 칸 바꾸기 [환자 자료 구역] (spec sunap-ilji REQ-4904). 순수 함수만.
// 모양이 틀리면 번호만 실은 BridgeError를 던진다(받은 글은 싣지 않는다)

export const BAD_REPLY = 'E-BRIDGE-BAD-REPLY'
export const STORE_BROKEN = 'E-STORE-BROKEN'
export const REJECTED = 'E-BRIDGE-REJECTED'

type Rec = Record<string, unknown>

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/
const STAMP = /^\d{12}$/
const VISIT_KINDS = new Set<unknown>(['new', 'd90', 're'] satisfies VisitKind[])
const RSV_KINDS = new Set<unknown>(['none', 'inj', 'visit', 'etc', 'unknown'] satisfies RsvKind[])
const HAND_KINDS = new Set<unknown>(['none', 'inj', 'visit', 'etc'] satisfies HandRsvKind[])
const EDIT_FIELDS = new Set<unknown>(['cash', 'card', 'transfer', 'unpaid', 'block', 'pt', 'rsv', 'note'] satisfies (keyof SunapEdit)[])
const DAY_FIELDS = new Set<string>(['edits', 'closedAt', 'late', 'fixed'] satisfies (keyof SunapLocalDay)[])

function fail(code: string): never {
  throw new BridgeError(code)
}

const isText = (x: unknown): x is string => typeof x === 'string'
const isAmount = (x: unknown): x is number => Number.isSafeInteger(x) && (x as number) >= 0
const isTexts = (x: unknown): x is string[] => Array.isArray(x) && x.every(isText)
const amount = (x: unknown): number => (isAmount(x) ? x : fail(BAD_REPLY))
const text = (x: unknown): string => (isText(x) ? x : fail(BAD_REPLY))
const chartOf = (x: unknown): string => (isText(x) && x !== '' ? x : fail(BAD_REPLY))

// 열쇠로 자기 칸만 찾는다(constructor 같은 기본 이름에 속지 않게)
export function own(table: Rec, key: string): unknown {
  return Object.hasOwn(table, key) ? table[key] : undefined
}

// ── 비트 하루 답 (design.md '도우미 답') ─────────────────────────

function readRow(line: unknown): SunapReplyRow {
  if (!Array.isArray(line) || line.length !== 10) fail(BAD_REPLY)
  const [chart, name, time, kind, cash, card, transfer, unpaid, codes, rsv] = line as unknown[]
  const clock = text(time)
  if (!CLOCK.test(clock) || !VISIT_KINDS.has(kind) || !isTexts(codes)) fail(BAD_REPLY)
  let next: SunapReplyRow[9] = null
  if (rsv !== null) {
    if (!Array.isArray(rsv) || rsv.length !== 2) fail(BAD_REPLY)
    const [at, memo] = rsv as unknown[]
    if (!isText(at) || !STAMP.test(at)) fail(BAD_REPLY)
    next = [at, text(memo)]
  }
  return [chartOf(chart), text(name), clock, kind as VisitKind, amount(cash), amount(card), amount(transfer), amount(unpaid), [...codes], next]
}

function readPaid(line: unknown): SunapReplyPaid {
  if (!Array.isArray(line) || line.length !== 5) fail(BAD_REPLY)
  const [chart, name, time, cash, card] = line as unknown[]
  const clock = text(time)
  if (clock !== '' && !CLOCK.test(clock)) fail(BAD_REPLY)
  return [chartOf(chart), text(name), clock, amount(cash), amount(card)]
}

/** contact.targets {kind: 'sunap', from: day, to: day}의 답. 그날 답이 아니거나 칸 하나라도 틀리면 E-BRIDGE-BAD-REPLY(반쪽 장부를 만들지 않는다) */
export function readReply(json: unknown, day: string): SunapReply {
  if (!isRecord(json) || json.v !== 1 || json.day !== day || typeof json.unsure !== 'boolean') fail(BAD_REPLY)
  if (!Array.isArray(json.rows) || !Array.isArray(json.paid)) fail(BAD_REPLY)
  const rows = (json.rows as unknown[]).map(readRow)
  // 고친 칸은 차트번호 열쇠로 둔다. 같은 차트가 두 줄이면 어느 줄을 고쳤는지 모른다
  if (new Set(rows.map((row) => row[0])).size !== rows.length) fail(BAD_REPLY)
  return { v: 1, day, unsure: json.unsure, rows, paid: (json.paid as unknown[]).map(readPaid) }
}

// ── PC 저장 (design.md 'PC 저장') ─────────────────────────────────

/** store.load {months: [month]}의 답에서 그 달 sunap 칸 전체(다른 날 값은 보지 않고 그대로 들고 있다가 다시 보낸다) */
export function readStoreMonth(json: unknown, month: string): Rec {
  if (!isRecord(json) || !isRecord(json.months)) fail(STORE_BROKEN)
  const file = own(json.months, month)
  if (!isRecord(file) || !isRecord(file.sunap)) fail(STORE_BROKEN)
  return file.sunap
}

/** 고친 칸 하나(저장된 것·화면이 보낸 것 같은 규칙). 금액은 0~99,999,999 정수, 직접 고른 예약은 unknown이 아님, 비고 100자까지. 틀리면 null */
function readEdit(x: unknown): SunapEdit | null {
  if (!isRecord(x)) return null
  const edit: SunapEdit = {}
  for (const [key, value] of Object.entries(x)) {
    if (key === 'cash' || key === 'card' || key === 'transfer' || key === 'unpaid') {
      if (!isAmount(value) || value > MAX_WON) return null
      edit[key] = value
    } else if (key === 'block' || key === 'pt') {
      if (typeof value !== 'boolean') return null
      edit[key] = value
    } else if (key === 'rsv') {
      if (!HAND_KINDS.has(value)) return null
      edit.rsv = value as HandRsvKind
    } else if (key === 'note') {
      if (!isText(value) || value.length > SUNAP_NOTE_MAX) return null
      edit.note = value
    } else return null
  }
  return edit
}

/** 그 달 sunap의 그날 값. 없으면 {}. 모양이 틀리면 E-STORE-BROKEN: 빈 것으로 시작하면 다음 저장이 PC의 고친 칸을 덮는다 */
export function readLocalDay(x: unknown): SunapLocalDay {
  if (x === undefined) return {}
  if (!isRecord(x) || Object.keys(x).some((key) => !DAY_FIELDS.has(key))) fail(STORE_BROKEN)
  const day: SunapLocalDay = {}
  if (x.edits !== undefined) {
    if (!isRecord(x.edits)) fail(STORE_BROKEN)
    // fromEntries는 '__proto__' 같은 열쇠도 자기 칸으로 둔다
    day.edits = Object.fromEntries(Object.entries(x.edits).map(([chart, edit]) => [chart, readEdit(edit) ?? fail(STORE_BROKEN)]))
  }
  if (x.closedAt !== undefined) day.closedAt = isText(x.closedAt) && x.closedAt !== '' ? x.closedAt : fail(STORE_BROKEN)
  if (x.late !== undefined) day.late = typeof x.late === 'boolean' ? x.late : fail(STORE_BROKEN)
  if (x.fixed !== undefined) {
    if (!isRecord(x.fixed)) fail(STORE_BROKEN)
    day.fixed = Object.fromEntries(
      Object.entries(x.fixed).map(([chart, kind]) => [chart, RSV_KINDS.has(kind) ? (kind as RsvKind) : fail(STORE_BROKEN)]),
    )
  }
  return day
}

/** 그 달 sunap에 그날 값을 넣은 새 값. 그날 값이 비었으면 그날 열쇠를 뺀다. 다른 날 값은 받은 그대로 */
export function withDay(month: Rec, day: string, local: SunapLocalDay): Rec {
  const rest = Object.entries(month).filter(([key]) => key !== day)
  return Object.fromEntries(Object.keys(local).length > 0 ? [...rest, [day, local]] : rest)
}

// ── 화면 메시지 ──────────────────────────────────────────────────

export function readStreamRef(x: unknown): SunapStreamRef | null {
  if (!isRecord(x)) return null
  if (isText(x.id) && x.id !== '' && x.code === undefined) return { id: x.id }
  if (x.id === undefined && isErrorCode(x.code)) return { code: x.code }
  return null
}

function readWords(x: unknown): RsvWords | null {
  if (!isRecord(x) || !isTexts(x.inj) || !isTexts(x.visit) || !isTexts(x.etc)) return null
  return { inj: [...x.inj], visit: [...x.visit], etc: [...x.etc] }
}

function isGroupDef(x: unknown): x is RxGroupDef {
  if (!isRecord(x) || !isText(x.id) || !isTexts(x.codes)) return false
  if (x.out !== undefined && !isTexts(x.out)) return false
  if (x.cond === undefined) return true
  return Array.isArray(x.cond) && x.cond.every((item: unknown) => isRecord(item) && isText(item.code) && isTexts(item.unless))
}

export type LoadAsk = { day: string; month: string; words: RsvWords; blockDef: RxGroupDef | null; ptDef: RxGroupDef | null }

/** load의 날·설정. 틀리면 null(스트림 표는 readStreamRef가 따로 본다) */
export function readLoad(m: Rec): LoadAsk | null {
  const { day, blockDef, ptDef } = m
  const words = readWords(m.words)
  if (!isText(day) || !isYmd(day) || !isMonth(day.slice(0, 7)) || !words) return null
  if ((blockDef !== null && !isGroupDef(blockDef)) || (ptDef !== null && !isGroupDef(ptDef))) return null
  return { day, month: day.slice(0, 7), words, blockDef, ptDef }
}

/** edit의 patch. 값 바꾸기는 칸 하나 이상, 되돌리기는 {revert: 칸 이름} 하나만. 틀리면 null */
export function readPatch(x: unknown): SunapPatch | null {
  if (!isRecord(x)) return null
  const keys = Object.keys(x)
  if (keys.length === 1 && keys[0] === 'revert') return EDIT_FIELDS.has(x.revert) ? { revert: x.revert as keyof SunapEdit } : null
  return keys.length > 0 ? readEdit(x) : null
}

/**
 * 고친 칸 바꾸기(AC-4904.2). 되돌리기는 그 칸만 지우고, 값은 덮어쓴다. 그 뒤 비트 값과 같아진 칸(금액·Block·물리치료)과
 * 빈 비고는 지운다. 그 차트의 고친 칸이 모두 없어지면 차트 열쇠를, 고친 차트가 없으면 edits 칸을 뺀다
 */
export function applyEdit(local: SunapLocalDay, chart: string, patch: SunapPatch, bit: LedgerRow): SunapLocalDay {
  const before = local.edits ?? {}
  const edit: SunapEdit = { ...(Object.hasOwn(before, chart) ? before[chart] : {}) }
  if ('revert' in patch) delete edit[patch.revert]
  else Object.assign(edit, patch)
  for (const field of LEDGER_EDITED_FIELDS) if (edit[field] === bit[field]) delete edit[field]
  if (edit.note !== undefined && edit.note.trim() === '') delete edit.note
  const rest = Object.entries(before).filter(([key]) => key !== chart)
  const edits: Record<string, SunapEdit> = Object.fromEntries(Object.keys(edit).length > 0 ? [...rest, [chart, edit]] : rest)
  const next: SunapLocalDay = { ...local, edits }
  if (Object.keys(edits).length === 0) delete next.edits
  return next
}
