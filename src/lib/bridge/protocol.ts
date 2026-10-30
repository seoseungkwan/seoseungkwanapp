// 메시지 약속(design.md 4-2·4-3): 명령 표(commands.json)와 답 모양 검사. 환자 자료 조각(data)은 글자인지만 보고 풀지 않는다
import { isYmd } from '@/lib/analytics/dates'
import type { BitCheckStepName, CommandName, PatientCommand, PatientSendCommand, Reply, SmallCommand } from '@/types/bridge'
import commands from './commands.json'

type Entry = { patient: boolean; send?: boolean }
type Rec = Record<string, unknown>

const TABLE = commands.commands as Record<string, Entry>

export const PROTOCOL: number = commands.protocol

/** 웹이 아는 명령 이름(types/bridge.ts의 CommandName과 같다, protocol.test.ts) */
export const COMMANDS = Object.keys(TABLE) as readonly CommandName[]
/** 숫자·상태 명령(hello는 Bridge.hello()로만) */
export const SMALL_COMMANDS = COMMANDS.filter((c) => !TABLE[c].patient && c !== 'hello') as readonly SmallCommand[]
/** 답이 chunk … end인 환자 자료 명령 */
export const PATIENT_COMMANDS = COMMANDS.filter((c) => TABLE[c].patient && !TABLE[c].send) as readonly PatientCommand[]
/** Worker가 만든 글자를 보내는 명령 */
export const SEND_COMMANDS = COMMANDS.filter((c) => TABLE[c].send === true) as readonly PatientSendCommand[]

/** bit.input 한 번에 넣는 사람 수 한도(명령 표). 진행 숫자 total의 끝이다(AC-004.10) */
export const MAX_INPUT_ITEMS: number = commands.commands['bit.input'].args.payload.fields.items.max
/** claim.dates 기간 한도(명령 표). 답의 날짜 수 끝이다 */
const MAX_DATES: number = commands.commands['claim.dates'].maxDays

const BIT_CHECK_STEPS: readonly BitCheckStepName[] = ['find', 'db', 'registration']

export function isRecord(x: unknown): x is Rec {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

const known = (cmd: unknown): cmd is CommandName => typeof cmd === 'string' && Object.hasOwn(TABLE, cmd)

/** 명령 표의 patient 값. 모르는 명령은 false */
export function isPatient(cmd: string): boolean {
  return known(cmd) && TABLE[cmd].patient === true
}

export const isSmallCommand = (cmd: unknown): cmd is SmallCommand => SMALL_COMMANDS.includes(cmd as SmallCommand)
export const isPatientCommand = (cmd: unknown): cmd is PatientCommand => PATIENT_COMMANDS.includes(cmd as PatientCommand)
export const isSendCommand = (cmd: unknown): cmd is PatientSendCommand => SEND_COMMANDS.includes(cmd as PatientSendCommand)

// 도우미 ErrorCodes.IsCode와 같다: 'E-…'(대문자·숫자·붙임표), 64자 이하
const ERROR_CODE = /^E-[A-Z0-9]+(?:-[A-Z0-9]+)*$/

export function isErrorCode(x: unknown): x is string {
  return typeof x === 'string' && x.length <= 64 && ERROR_CODE.test(x)
}

/** 통로가 거절할 때 싣는 것은 오류 번호뿐이다(원래 오류 글·환자 글자를 싣지 않는다) */
export class BridgeError extends Error {
  readonly code: string

  constructor(code: string) {
    super(code)
    this.name = 'BridgeError'
    this.code = code
  }
}

// ── 모양 검사 ────────────────────────────────────────────

/** 칸이 required를 모두 갖고, required·optional 밖의 칸이 없다 */
function exactKeys(x: Rec, required: readonly string[], optional: readonly string[] = []): boolean {
  return required.every((k) => Object.hasOwn(x, k)) && Object.keys(x).every((k) => required.includes(k) || optional.includes(k))
}

const isCount = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 0
const isBool = (x: unknown): x is boolean => typeof x === 'boolean'
const VERSION = /^\d{1,9}\.\d{1,9}\.\d{1,9}$/
const isVersion = (x: unknown): x is string => typeof x === 'string' && VERSION.test(x)
const SHA256 = /^[0-9a-f]{64}$/
const INSTITUTION = /^\d{8}$/
// 병원 이름: 1~100자, 줄바꿈·제어 문자(U+0000~U+001F, U+007F) 없음
const isPlainChar = (ch: string) => ch.charCodeAt(0) >= 0x20 && ch.charCodeAt(0) !== 0x7f
const isHospitalName = (x: unknown) =>
  typeof x === 'string' && x.length >= 1 && x.length <= 100 && [...x].every(isPlainChar)

const REPLY_KEYS = {
  result: ['data'],
  chunk: ['seq', 'data'],
  end: ['count', 'bytes', 'sha256'],
  progress: ['done', 'total'],
  error: ['code'],
} as const

/** 확장이 넘긴 답 봉투를 type마다 정해 둔 칸·종류로만 받는다. 아니면 null(→ E-BRIDGE-BAD-REPLY) */
export function readReply(msg: Rec): Reply | null {
  const type = msg.type
  if (msg.v !== PROTOCOL || typeof msg.id !== 'string' || typeof type !== 'string' || !Object.hasOwn(REPLY_KEYS, type)) return null
  if (!exactKeys(msg, ['v', 'id', 'type', ...REPLY_KEYS[type as keyof typeof REPLY_KEYS]])) return null
  switch (type) {
    case 'result':
      return msg as Reply
    case 'chunk':
      return isCount(msg.seq) && typeof msg.data === 'string' ? (msg as Reply) : null
    case 'end':
      return isCount(msg.count) && isCount(msg.bytes) && typeof msg.sha256 === 'string' && SHA256.test(msg.sha256)
        ? (msg as Reply)
        : null
    case 'progress':
      return isCount(msg.done) && isCount(msg.total) && msg.done <= msg.total && msg.total <= MAX_INPUT_ITEMS
        ? (msg as Reply)
        : null
    default:
      return isErrorCode(msg.code) ? (msg as Reply) : null
  }
}

export type HelloData = { helperVersion: string; protocol: number; extensionVersion: string; extensionProtocol: number }

/** hello result: 도우미 {helperVersion, protocol} + 확장이 붙인 {extensionVersion, extensionProtocol} */
export function checkHello(data: unknown): HelloData | null {
  if (!isRecord(data) || !exactKeys(data, ['helperVersion', 'protocol', 'extensionVersion', 'extensionProtocol'])) return null
  const ok =
    isVersion(data.helperVersion) &&
    isVersion(data.extensionVersion) &&
    Number.isSafeInteger(data.protocol) &&
    Number.isSafeInteger(data.extensionProtocol)
  return ok ? (data as HelloData) : null
}

function isBitCheck(d: Rec): boolean {
  if (!exactKeys(d, ['steps', 'registered'], ['hospitalName', 'institutionCode']) || !isBool(d.registered)) return false
  if (d.hospitalName !== undefined && !isHospitalName(d.hospitalName)) return false
  if (d.institutionCode !== undefined && !(typeof d.institutionCode === 'string' && INSTITUTION.test(d.institutionCode))) return false
  const steps = d.steps
  return (
    Array.isArray(steps) &&
    steps.length === BIT_CHECK_STEPS.length &&
    steps.every(
      (s, i) =>
        isRecord(s) &&
        exactKeys(s, ['name', 'ok'], ['code']) &&
        s.name === BIT_CHECK_STEPS[i] &&
        isBool(s.ok) &&
        (s.code === undefined || isErrorCode(s.code)),
    )
  )
}

function isClaimDates(d: Rec): boolean {
  const days = d.days
  return (
    exactKeys(d, ['days']) &&
    Array.isArray(days) &&
    days.length <= MAX_DATES &&
    days.every(
      (x) =>
        isRecord(x) &&
        exactKeys(x, ['date', 'visits', 'memoInBit']) &&
        typeof x.date === 'string' &&
        isYmd(x.date) &&
        isCount(x.visits) &&
        isCount(x.memoInBit),
    )
  )
}

/** 숫자·상태 명령의 result.data가 명령마다 정해 둔 모양인가(AC-004.6) */
export function checkResult(cmd: SmallCommand, data: unknown): boolean {
  if (!isRecord(data)) return false
  switch (cmd) {
    case 'bit.check':
      return isBitCheck(data)
    case 'bit.register':
      return exactKeys(data, ['registered']) && isBool(data.registered)
    case 'claim.dates':
      return isClaimDates(data)
  }
}

/** store.save의 답은 {saved: true} 하나뿐이다(AC-004.9) */
export function isSaved(data: unknown): data is { saved: true } {
  return isRecord(data) && exactKeys(data, ['saved']) && data.saved === true
}
