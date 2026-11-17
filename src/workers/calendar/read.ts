import { isYmd } from '@/lib/analytics/dates'
import { BridgeError, isErrorCode, isRecord } from '@/lib/bridge/protocol'
import { ageOn } from '@/lib/calendar/rules'
import type { ApptAuto, ApptStatus, BitGhost } from '@/lib/calendar/shapes'
import type { BitPerson, CalendarDayAppt, CalendarStreamRef } from './messages'

// 예약 Worker가 받는 것 읽기 [환자 자료 구역] (spec clinic-calendar REQ-5904, design.md '도우미 답'·'Worker 메시지'). 순수 함수만.
// 도우미 답 모양은 helper/src/Precheck.Core/Calendar/CalendarTargets.cs. 칸 하나라도 틀리면 번호만 실은 BridgeError를 던진다
// (받은 글은 싣지 않는다, 반쪽 결과 없음)

export const BAD_REPLY = 'E-BRIDGE-BAD-REPLY'
export const REJECTED = 'E-BRIDGE-REJECTED'

// 도우미 CalendarTargets와 같은 한도
const VERSION = 1
const FOUND_MAX = 20
const NAME_MAX = 40
const CHART = /^\d{1,10}$/
const COMPACT_DAY = /^(\d{4})(\d{2})(\d{2})$/
const STAMP = /^(\d{8})([01]\d|2[0-3])([0-5]\d)$/
const DAY_MIN = 1440
const STATUSES = new Set<unknown>(['auto', 'came', 'noshow', 'cancel'] satisfies ApptStatus[])
const AUTOS = new Set<unknown>(['came', 'noshow', null] satisfies ApptAuto[])

function fail(code: string): never {
  throw new BridgeError(code)
}

const isChart = (x: unknown): x is string => typeof x === 'string' && CHART.test(x)
const isName = (x: unknown): x is string => typeof x === 'string' && x.length >= 1 && x.length <= NAME_MAX
const isDay = (x: unknown): x is string => typeof x === 'string' && isYmd(x)

/** 도우미 날 yyyyMMdd → YYYY-MM-DD. 있는 날이 아니면 null */
function dayOfCompact(x: unknown): string | null {
  const m = typeof x === 'string' ? COMPACT_DAY.exec(x) : null
  const day = m ? `${m[1]}-${m[2]}-${m[3]}` : null
  return day !== null && isYmd(day) ? day : null
}

/** null 또는 있는 날 yyyyMMdd. 틀리면 E-BRIDGE-BAD-REPLY */
const optionalDay = (x: unknown): string | null => (x === null ? null : (dayOfCompact(x) ?? fail(BAD_REPLY)))

// ── calfind (AC-5904.1) ─────────────────────────────────────────

const SEX: Record<string, BitPerson['sex']> = { M: '남', F: '여' }

function readPerson(line: unknown, today: string): BitPerson {
  if (!Array.isArray(line) || line.length !== 5) fail(BAD_REPLY)
  const [chart, name, sex, birth, last] = line as unknown[]
  if (!isChart(chart) || !isName(name) || !(sex === null || sex === 'M' || sex === 'F')) fail(BAD_REPLY)
  const born = optionalDay(birth)
  // 생일은 나이로만 바꾸고 버린다(화면으로 가지 않는다)
  return { chart, name, sex: sex === null ? '' : SEX[sex], age: born === null ? null : ageOn(birth as string, today), last: optionalDay(last) }
}

/** contact.targets {kind: 'calfind'}의 답 → 찾은 사람(나이는 답의 today 기준 ageOn) */
export function readFound(json: unknown): { rows: BitPerson[]; more: boolean } {
  if (!isRecord(json) || json.v !== VERSION || json.kind !== 'calfind' || !isDay(json.today) || typeof json.more !== 'boolean') fail(BAD_REPLY)
  if (!Array.isArray(json.rows) || json.rows.length > FOUND_MAX) fail(BAD_REPLY)
  const today = json.today
  const rows = (json.rows as unknown[]).map((line) => readPerson(line, today))
  if (new Set(rows.map((row) => row.chart)).size !== rows.length) fail(BAD_REPLY)
  return { rows, more: json.more }
}

// ── calday (AC-5904.2) ──────────────────────────────────────────

/** calday 답을 읽은 것. came = 날마다 센 접수 차트번호(Worker 안에만), ghosts = 비트 예약 칸 전부(가리기 전) */
export type DayReply = { from: string; to: string; came: Map<string, Set<string>>; ghosts: BitGhost[] }

/** contact.targets {kind: 'calday', from, to}의 답. 접수·비트 예약 날은 답의 기간 안이어야 한다 */
export function readDay(json: unknown): DayReply {
  if (!isRecord(json) || json.v !== VERSION || json.kind !== 'calday') fail(BAD_REPLY)
  const { from, to } = json
  if (!isDay(from) || !isDay(to) || from > to || !isDay(json.today) || !Array.isArray(json.came) || !Array.isArray(json.rsv)) fail(BAD_REPLY)
  const inside = (x: unknown): string => {
    const day = dayOfCompact(x)
    return day !== null && day >= from && day <= to ? day : fail(BAD_REPLY)
  }

  const came = new Map<string, Set<string>>()
  for (const pair of json.came as unknown[]) {
    if (!Array.isArray(pair) || pair.length !== 2) fail(BAD_REPLY)
    const [at, chart] = pair as unknown[]
    const day = inside(at)
    if (!isChart(chart)) fail(BAD_REPLY)
    let charts = came.get(day)
    if (!charts) came.set(day, (charts = new Set()))
    charts.add(chart)
  }

  // key = 비트 예약 접수 시각 + 같은 시각 몇째(차트번호·이름은 넣지 않는다)
  const seen = new Map<string, number>()
  const ghosts = (json.rsv as unknown[]).map((line): BitGhost => {
    if (!Array.isArray(line) || line.length !== 3) fail(BAD_REPLY)
    const [chart, name, at] = line as unknown[]
    if ((chart !== null && !isChart(chart)) || (name !== null && !isName(name))) fail(BAD_REPLY)
    const m = typeof at === 'string' ? STAMP.exec(at) : null
    if (!m) fail(BAD_REPLY)
    const n = seen.get(at as string) ?? 0
    seen.set(at as string, n + 1)
    return { key: `bit-${at as string}-${n}`, day: inside(m[1]), start: Number(m[2]) * 60 + Number(m[3]), chart, name }
  })
  return { from, to, came, ghosts }
}

// ── 화면 메시지 ──────────────────────────────────────────────────

export function readStreamRef(x: unknown): CalendarStreamRef | null {
  if (!isRecord(x)) return null
  if (typeof x.id === 'string' && x.id !== '' && x.code === undefined) return { id: x.id }
  if (x.id === undefined && isErrorCode(x.code)) return { code: x.code }
  return null
}

function readAppt(x: unknown): CalendarDayAppt | null {
  if (!isRecord(x)) return null
  const { id, day, start, len, chart, status, auto } = x
  if (typeof id !== 'string' || id === '' || !isDay(day)) return null
  if (!Number.isInteger(start) || (start as number) < 0 || (start as number) >= DAY_MIN) return null
  if (!Number.isInteger(len) || (len as number) <= 0 || (len as number) > DAY_MIN) return null
  if ((chart !== null && typeof chart !== 'string') || !STATUSES.has(status) || !AUTOS.has(auto)) return null
  return { id, day, start: start as number, len: len as number, chart, status: status as ApptStatus, auto: auto as ApptAuto }
}

export type DaysAsk = { now: Date; appts: CalendarDayAppt[] }

/** days의 시각·예약 목록(필요한 칸만 다시 만든다). 틀리면 null(스트림 표는 readStreamRef가 따로 본다) */
export function readDaysAsk(m: Record<string, unknown>): DaysAsk | null {
  const { now } = m
  if (typeof now !== 'number' || !Number.isFinite(now) || !Array.isArray(m.appts)) return null
  const at = new Date(now)
  if (Number.isNaN(at.getTime())) return null
  const appts: CalendarDayAppt[] = []
  for (const x of m.appts as unknown[]) {
    const appt = readAppt(x)
    if (!appt) return null
    appts.push(appt)
  }
  return { now: at, appts }
}
