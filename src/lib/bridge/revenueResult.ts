// revenue.days 답 검사(spec revenue design.md 5-2, AC-002.2·AC-002.3) [환자 자료 구역]. 칸 이름·종류·짝(unconfirmed와
// 금액 아홉 칸)·날짜 이어짐을 정확히 본다. 정해 둔 칸 밖의 칸(차트번호·이름 등)이 하나라도 있으면 거부해 화면에 닿지 않게 한다
import { addDays, isYmd } from '@/lib/analytics/dates'
import {
  REVENUE_CODE_KEYS,
  REVENUE_CODE_SHAPE,
  REVENUE_DAY_KEYS,
  REVENUE_MAX_CODES,
  REVENUE_MAX_DAYS,
  REVENUE_MONEY_KEYS,
  REVENUE_NAME_MAX,
  type RevenueDaysResult,
} from '@/types/revenue'

type Rec = Record<string, unknown>

const RESULT_KEYS = ['days', 'codes'] as const satisfies readonly (keyof RevenueDaysResult)[]
const MONEY_KEYS: readonly string[] = REVENUE_MONEY_KEYS
/** 금액이 아닌 숫자 칸(건수·환자 수) */
const COUNT_KEYS: readonly string[] = REVENUE_DAY_KEYS.filter((k) => k !== 'date' && k !== 'unconfirmed' && !MONEY_KEYS.includes(k))

const isRecord = (x: unknown): x is Rec => typeof x === 'object' && x !== null && !Array.isArray(x)

/** 칸이 정확히 keys다(빠짐·더함 없음, protocol.ts exactKeys와 같은 방식) */
const exactKeys = (x: Rec, keys: readonly string[]): boolean =>
  keys.every((k) => Object.hasOwn(x, k)) && Object.keys(x).every((k) => keys.includes(k))

/** 0 이상 안전한 정수 */
const isCount = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 0

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
  if (!isRecord(d) || !exactKeys(d, REVENUE_DAY_KEYS)) return false
  if (typeof d.date !== 'string' || !isYmd(d.date) || typeof d.unconfirmed !== 'boolean') return false
  if (!COUNT_KEYS.every((k) => d[k] === null || isCount(d[k]))) return false
  // unconfirmed면 금액 아홉 칸이 모두 null, 아니면 모두 숫자(sales_days 제약 AC-004.3과 같은 짝)
  return MONEY_KEYS.every((k) => (d.unconfirmed ? d[k] === null : isCount(d[k])))
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

/** revenue.days의 result.data가 정해 둔 모양인가. 아니면 통로가 E-BRIDGE-BAD-REPLY로 거부한다 */
export function isRevenueDays(data: unknown): data is RevenueDaysResult {
  return isRecord(data) && exactKeys(data, RESULT_KEYS) && isDays(data.days) && isCodes(data.codes)
}
