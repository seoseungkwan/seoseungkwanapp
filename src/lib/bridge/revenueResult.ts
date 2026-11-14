// revenue.days 답 검사(spec revenue design.md 5-2, AC-002.2·AC-002.3) [환자 자료 구역]. 칸 이름·종류·짝(unconfirmed와 금액 아홉 칸,
// splitUnconfirmed와 나눔 네 칸, 둘이 함께 참이 아님)·날짜 이어짐을 정확히 본다. 정해 둔 칸 밖의 칸(차트번호·이름 등)이 하나라도 있으면 거부해 화면에 닿지 않게 한다.
// 날 줄의 참고 금액 roughTotal(specs/first90 AC-4406.4)은 선택 열쇠: unconfirmed 날에만, 절댓값 10^12 이하 정수로만 받는다
import { addDays, isYmd } from '@/lib/analytics/dates'
import {
  REVENUE_CODE_KEYS,
  REVENUE_CODE_SHAPE,
  REVENUE_DAY_CODES_PER_DAY,
  REVENUE_DAY_KEYS,
  REVENUE_KEPT_KEYS,
  REVENUE_MAX_CODES,
  REVENUE_MAX_DAY_CODES,
  REVENUE_MAX_DAYS,
  REVENUE_MONEY_KEYS,
  REVENUE_NAME_MAX,
  REVENUE_ROUGH_MAX,
  REVENUE_SPLIT_KEYS,
  type RevenueDaysResult,
} from '@/types/revenue'

type Rec = Record<string, unknown>

/** 옛 도우미 답의 열쇠 */
const RESULT_KEYS = ['days', 'codes'] as const satisfies readonly (keyof RevenueDaysResult)[]
/** 도우미 0.6.0부터(specs/stats-revenue AC-4102.1): 날 단위 처방 줄 dayCodes가 더해진다 */
const RESULT_KEYS_WITH_DAY_CODES = [...RESULT_KEYS, 'dayCodes'] as const satisfies readonly (keyof RevenueDaysResult)[]
/** dayCodes 줄은 [날짜, 코드, 건수, 금액] 칸 넷 */
const DAY_CODE_CELLS = 4
const MONEY_KEYS: readonly string[] = REVENUE_MONEY_KEYS
/** 도우미 0.7.0부터(specs/first90 AC-4406.4): unconfirmed 날에만 더해지는 선택 열쇠 */
const ROUGH_KEY = 'roughTotal'
const DAY_KEYS_WITH_ROUGH: readonly string[] = [...REVENUE_DAY_KEYS, ROUGH_KEY]
/** 금액이 아닌 숫자 칸(건수) */
const COUNT_KEYS: readonly string[] = REVENUE_DAY_KEYS.filter(
  (k) => k !== 'date' && k !== 'unconfirmed' && k !== 'splitUnconfirmed' && !MONEY_KEYS.includes(k),
)

const isRecord = (x: unknown): x is Rec => typeof x === 'object' && x !== null && !Array.isArray(x)

/** 칸이 정확히 keys다(빠짐·더함 없음, protocol.ts exactKeys와 같은 방식) */
const exactKeys = (x: Rec, keys: readonly string[]): boolean =>
  keys.every((k) => Object.hasOwn(x, k)) && Object.keys(x).every((k) => keys.includes(k))

/** 0 이상 안전한 정수 */
const isCount = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 0

/** 참고 금액: 절댓값 10^12 이하 정수(환불이 많은 날은 음수) */
const isRough = (n: unknown): boolean => Number.isSafeInteger(n) && Math.abs(n as number) <= REVENUE_ROUGH_MAX

/** 줄바꿈·제어 문자(C0·DEL·C1·U+2028·U+2029) */
function hasControl(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c < 0x20 || (c >= 0x7f && c <= 0x9f) || c === 0x2028 || c === 0x2029) return true
  }
  return false
}

/** 처방 이름: 1~100자 글자(줄바꿈·제어 문자 없음) 또는 null */
const isName = (x: unknown): boolean =>
  x === null || (typeof x === 'string' && x.length >= 1 && x.length <= REVENUE_NAME_MAX && !hasControl(x))

function isDayRow(d: unknown): d is Rec & { date: string } {
  if (!isRecord(d)) return false
  // roughTotal은 선택 열쇠다(옛 도우미·확인된 날은 없음). 있으면 unconfirmed 날의 정수만 받는다
  const withRough = Object.hasOwn(d, ROUGH_KEY)
  if (!exactKeys(d, withRough ? DAY_KEYS_WITH_ROUGH : REVENUE_DAY_KEYS)) return false
  if (withRough && !(d.unconfirmed === true && isRough(d[ROUGH_KEY]))) return false
  if (typeof d.date !== 'string' || !isYmd(d.date)) return false
  if (typeof d.unconfirmed !== 'boolean' || typeof d.splitUnconfirmed !== 'boolean') return false
  if (!COUNT_KEYS.every((k) => d[k] === null || isCount(d[k]))) return false
  // 두 표시와 금액 칸의 짝(sales_days 제약 AC-004.3과 같은 짝)
  if (d.unconfirmed && d.splitUnconfirmed) return false
  if (d.unconfirmed) return MONEY_KEYS.every((k) => d[k] === null)
  if (d.splitUnconfirmed) return REVENUE_SPLIT_KEYS.every((k) => d[k] === null) && REVENUE_KEPT_KEYS.every((k) => isCount(d[k]))
  return MONEY_KEYS.every((k) => isCount(d[k]))
}

/** 날짜 오름차순·하루도 빠짐없이·31개 이하 */
function isDays(days: unknown): boolean {
  if (!Array.isArray(days) || days.length > REVENUE_MAX_DAYS) return false
  let prev: string | null = null
  for (const d of days) {
    if (!isDayRow(d) || (prev !== null && d.date !== addDays(prev, 1))) return false
    prev = d.date
  }
  return true
}

/** 코드 모양·중복 없음·1,000개 이하 */
function isCodes(codes: unknown): boolean {
  if (!Array.isArray(codes) || codes.length > REVENUE_MAX_CODES) return false
  const seen = new Set<string>()
  for (const c of codes) {
    if (!isRecord(c) || !exactKeys(c, REVENUE_CODE_KEYS)) return false
    if (typeof c.code !== 'string' || !REVENUE_CODE_SHAPE.test(c.code) || seen.has(c.code)) return false
    if (!isName(c.name) || !isCount(c.count) || !(c.amount === null || isCount(c.amount))) return false
    seen.add(c.code)
  }
  return true
}

/** 날 단위 처방 줄(AC-4102.2): 칸 넷인 목록 · 날짜는 days에 있는 날 · 코드 모양 · 같은 날 같은 코드 없음 ·
 *  하루 300줄·모두 9,300줄 이하 · 건수는 0 이상 안전한 정수 · 금액은 null 또는 0 이상 안전한 정수 */
function isDayCodes(dayCodes: unknown, days: readonly { date: string }[]): boolean {
  if (!Array.isArray(dayCodes) || dayCodes.length > REVENUE_MAX_DAY_CODES) return false
  const perDay = new Map<string, Set<string>>(days.map((d) => [d.date, new Set<string>()]))
  for (const row of dayCodes) {
    if (!Array.isArray(row) || row.length !== DAY_CODE_CELLS) return false
    const [date, code, count, amount] = row as unknown[]
    const seen = typeof date === 'string' ? perDay.get(date) : undefined
    if (seen === undefined) return false
    if (typeof code !== 'string' || !REVENUE_CODE_SHAPE.test(code) || seen.has(code)) return false
    if (!isCount(count) || !(amount === null || isCount(amount))) return false
    seen.add(code)
    if (seen.size > REVENUE_DAY_CODES_PER_DAY) return false
  }
  return true
}

/** revenue.days의 result.data가 정해 둔 모양인가. 아니면 통로가 E-BRIDGE-BAD-REPLY로 거부한다.
 *  열쇠는 옛 두 벌(days·codes) 또는 새 세 벌(+ dayCodes)과 정확히 같아야 한다. dayCodes는 날 줄 검사 뒤에 본다(날짜 목록을 쓴다) */
export function isRevenueDays(data: unknown): data is RevenueDaysResult {
  if (!isRecord(data)) return false
  const withDayCodes = Object.hasOwn(data, 'dayCodes')
  if (!exactKeys(data, withDayCodes ? RESULT_KEYS_WITH_DAY_CODES : RESULT_KEYS)) return false
  if (!isDays(data.days) || !isCodes(data.codes)) return false
  return !withDayCodes || isDayCodes(data.dayCodes, data.days as { date: string }[])
}
