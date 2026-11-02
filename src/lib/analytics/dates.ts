import type { DateRange } from '@/types/dates'

// 날짜는 늘 'YYYY-MM-DD'(달은 'YYYY-MM') 글자로 주고받고, 계산은 1970-01-01부터 며칠째인 정수로 한다.
// 지역 시간 Date 메서드는 쓰지 않는다 — 한국 시간에서 하루 밀린다(10월 1일 → 9월 30일). Date는 UTC 함수로만.

const DAY_MS = 86_400_000
const EXCEL_EPOCH = 25_569 // 1899-12-30 → 1970-01-01 날 수
const EXCEL_MIN = 20_000 // 1954-10-03 — 이 범위 밖 숫자는 날짜로 보지 않는다
const EXCEL_MAX = 80_000 // 2119-01-11

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/
const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/
const COMPACT = /^(\d{4})(\d{2})(\d{2})$/ // 20261001
// 2026-10-01 · 2026-1-5 · 2026.10.01 · 2026/10/01(구분 글자는 하나로), 뒤에 시각 09:30 · T09:30:00.123
// 시간대(Z, +09:00)가 붙은 시각은 한국 날짜가 달라질 수 있어 받지 않는다
const SEPARATED = /^(\d{4})([-./])(\d{1,2})\2(\d{1,2})(?:(?:\s+|T)\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?$/
const SERIAL = /^\d+(?:\.\d+)?$/

const KOREA_DATE = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const pad = (n: number, width = 2) => String(n).padStart(width, '0')

// ── 일 번호 ↔ 글자 ───────────────────────────────────────

function fromDay(day: number): string {
  const d = new Date(day * DAY_MS)
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

// 없는 날(2월 30일)은 Date.UTC가 다음 달로 넘기므로 되돌려 같은지 본다.
// 0~99년은 Date.UTC가 1900년대로 바꿔 여기서 걸러진다
function toDay(ymd: string): number | null {
  const m = YMD.exec(ymd)
  if (!m) return null
  const day = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS
  return fromDay(day) === ymd ? day : null
}

function dayOf(ymd: string): number {
  const day = toDay(ymd)
  if (day === null) throw new RangeError(`날짜는 'YYYY-MM-DD'로 주세요: ${ymd}`)
  return day
}

function requireInteger(n: number, what: string): void {
  if (!Number.isInteger(n)) throw new RangeError(`${what}는 정수로 주세요: ${n}`)
}

const weekdayOfDay = (day: number) => new Date(day * DAY_MS).getUTCDay() || 7 // 일요일 0 → 7

// ── 날짜 ────────────────────────────────────────────────

export function isYmd(s: string): boolean {
  return toDay(s) !== null
}

// 'YYYY-MM'(01~12). 그 달 1일이 있는 날이어야 한다(isYmd와 같은 해 범위)
export function isMonth(s: string): boolean {
  return MONTH.test(s) && isYmd(`${s}-01`)
}

export function addDays(ymd: string, n: number): string {
  requireInteger(n, '날 수')
  return fromDay(dayOf(ymd) + n)
}

// b - a (일)
export function diffDays(a: string, b: string): number {
  return dayOf(b) - dayOf(a)
}

// 'YYYY-MM-DD'는 글자 순서가 곧 날짜 순서다(많이 부르는 정렬용이라 검사하지 않는다)
export function compareYmd(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

// 1=월 … 7=일
export function weekdayOf(ymd: string): number {
  return weekdayOfDay(dayOf(ymd))
}

// 주는 월~일, 주의 이름은 그 주 월요일
export function weekStartOf(ymd: string): string {
  const day = dayOf(ymd)
  return fromDay(day - weekdayOfDay(day) + 1)
}

export function monthOf(ymd: string): string {
  dayOf(ymd)
  return ymd.slice(0, 7)
}

// ── 달·구간 ──────────────────────────────────────────────

export function addMonths(month: string, n: number): string {
  const m = MONTH.exec(month)
  if (!m) throw new RangeError(`달은 'YYYY-MM'으로 주세요: ${month}`)
  requireInteger(n, '달 수')
  const index = Number(m[1]) * 12 + Number(m[2]) - 1 + n
  const year = Math.floor(index / 12)
  if (year < 0 || year > 9999) throw new RangeError(`달이 너무 멀어요: ${month} ${n}`)
  return `${pad(year, 4)}-${pad(index - year * 12 + 1)}`
}

// 한 달 전 같은 날. 그달에 그 날이 없으면 말일(3월 31일 → 2월 28일). 청구메모용 한 달 읽기의 시작(precheck AC-013.13)
export function sameDayLastMonth(ymd: string): string {
  const day = dayOf(ymd)
  const last = fromDay(day - Number(ymd.slice(8))) // 전달 말일
  return `${last.slice(0, 8)}${pad(Math.min(Number(ymd.slice(8)), Number(last.slice(8))))}`
}

// 1일 ~ 말일
export function monthRange(month: string): DateRange {
  return { from: `${month}-01`, to: addDays(`${addMonths(month, 1)}-01`, -1) }
}

// 월 ~ 일
export function weekRange(weekStart: string): DateRange {
  const day = dayOf(weekStart)
  if (weekdayOfDay(day) !== 1) throw new RangeError(`주는 월요일로 주세요: ${weekStart}`)
  return { from: weekStart, to: fromDay(day + 6) }
}

// 양 끝 포함. 끝이 시작보다 앞이면 빈 목록
export function eachDay(range: DateRange): string[] {
  const to = dayOf(range.to)
  const days: string[] = []
  for (let day = dayOf(range.from); day <= to; day++) days.push(fromDay(day))
  return days
}

// ── 오늘·파일 칸 읽기 ─────────────────────────────────────

// PC 시간대와 상관없이 한국 날짜
export function todayInKorea(now: Date = new Date()): string {
  const parts = Object.fromEntries(KOREA_DATE.formatToParts(now).map((p) => [p.type, p.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

// 엑셀 숫자 날짜(1899-12-30 = 0). 시각 소수는 버린다
export function excelSerialToYmd(serial: number): string | null {
  if (!Number.isFinite(serial)) return null
  const ymd = fromDay(Math.floor(serial) - EXCEL_EPOCH)
  return isYmd(ymd) ? ymd : null
}

const serialInRange = (n: number) => (n >= EXCEL_MIN && n <= EXCEL_MAX ? excelSerialToYmd(n) : null)

function ymdFrom(y: string, m: string, d: string): string | null {
  const ymd = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  return isYmd(ymd) ? ymd : null
}

// 파일의 날짜 칸 하나 → 'YYYY-MM-DD'. 못 읽으면 null(달을 추측하지 않는다)
export function parseDateCell(value: string | number | null | undefined): string | null {
  if (typeof value === 'number') return serialInRange(value)
  if (typeof value !== 'string') return null
  const s = value.trim()
  const compact = COMPACT.exec(s)
  if (compact) return ymdFrom(compact[1], compact[2], compact[3])
  const separated = SEPARATED.exec(s)
  if (separated) return ymdFrom(separated[1], separated[3], separated[4])
  return SERIAL.test(s) ? serialInRange(Number(s)) : null
}
