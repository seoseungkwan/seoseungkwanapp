// 개원 비용 계산(design.md 11절 · AC-7913.1). 순수 함수만 둔다.
// 저장·계산은 원 정수이고 반올림하지 않고 버린다. 빈칸은 열쇠가 없는 것('아직 모름', 0이 아님) —
// 합계는 적은 칸만 더하고(빈칸은 0으로 셈) 빈칸 수를 함께 낸다. 기본값은 없다(사용자 2026-11-22).
// 매물의 보증금·월세는 화면이 칸 옆 참고 글로만 보이고 여기 값을 채우지 않는다.
import { m2ToPyeong } from './area'

/** `location_candidates.costs` 열쇠. 만 원 칸은 × 10,000 원, `interior`는 평당 값(원), `rateBp`는 연 이자 0.01% 단위, `workDays`는 날 수 */
export const COST_KEYS = [
  'deposit', // 보증금
  'premium', // 권리금
  'interior', // 인테리어(평당)
  'equipment', // 장비
  'otherStart', // 그 밖 준비
  'rent', // 월세
  'mgmt', // 관리비
  'payroll', // 인건비(한 달)
  'otherMonth', // 그 밖 한 달
  'loan', // 대출
  'rateBp', // 연 이자
  'perPatient', // 환자 1명당 평균 수입(원)
  'workDays', // 한 달 진료일
] as const

export type CostKey = (typeof COST_KEYS)[number]
export type Costs = Partial<Record<CostKey, number>>

export type CostSummary = {
  /** 인테리어 합계 = 버림(평당 값 × 평), 넓이나 평당 값이 없으면 없음 */
  interiorTotal: number | null
  /** 한 달 이자 = 버림(대출 × rateBp ÷ 120,000), 대출·이자 한쪽이 비면 없음 */
  interest: number | null
  /** 한 달 고정비 = 월세 + 관리비 + 인건비 + 그 밖 한 달 + 한 달 이자 */
  monthlyFixed: number | null
  /** 6 × 한 달 고정비 */
  sixMonths: number | null
  /** 처음 드는 돈 = 보증금 + 권리금 + 인테리어 합계 + 장비 + 그 밖 준비 + 6 × 한 달 고정비 */
  startTotal: number | null
  /** 내 돈 = 처음 드는 돈 − 대출(음수면 그대로) */
  mine: number | null
  /** 내 돈이 음수 — 화면 `대출이 더 많아요` */
  loanOver: boolean
  /** 손익분기 하루 환자(소수 첫째 자리 버림). 원장 몫은 들어 있지 않다 */
  breakEven: number | null
  /** 열세 칸 가운데 값이 없는 칸 수 */
  blanks: number
}

type Unit = 'man' | 'won' | 'rate' | 'days'

const MAN = 10_000
const WON_MAX = 9_999_999_999
const RATE_BP_MAX = 3_000 // 연 30%
const WORK_DAYS_MAX = 31

const UNIT: Record<CostKey, Unit> = {
  deposit: 'man',
  premium: 'man',
  interior: 'man',
  equipment: 'man',
  otherStart: 'man',
  rent: 'man',
  mgmt: 'man',
  payroll: 'man',
  otherMonth: 'man',
  loan: 'man',
  rateBp: 'rate',
  perPatient: 'won',
  workDays: 'days',
}

const RANGE: Record<Unit, { min: number; max: number }> = {
  man: { min: 0, max: WON_MAX },
  won: { min: 0, max: WON_MAX },
  rate: { min: 0, max: RATE_BP_MAX },
  days: { min: 1, max: WORK_DAYS_MAX },
}

const DIGITS = /^\d+$/
const RATE = /^(\d+)(?:\.(\d{1,2}))?$/ // 연 %, 소수 둘째 자리까지

export type CostInput = { ok: true; value: number | null } | { ok: false }

const BAD: CostInput = { ok: false }

function inRange(key: CostKey, value: number): boolean {
  const unit = UNIT[key]
  const { min, max } = RANGE[unit]
  return Number.isInteger(value) && value >= min && value <= max && (unit !== 'man' || value % MAN === 0)
}

/** 화면 칸 글자 → 저장 값. 빈칸은 `value: null`, 소수 금액·음수·글자·범위 밖은 `ok: false` */
export function parseCostInput(key: CostKey, text: string): CostInput {
  const t = text.trim()
  if (t === '') return { ok: true, value: null }
  const unit = UNIT[key]
  let value: number
  if (unit === 'rate') {
    const m = RATE.exec(t)
    if (!m) return BAD
    value = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'))
  } else {
    const digits = t.replace(/,/g, '')
    if (!DIGITS.test(digits)) return BAD
    value = Number(digits) * (unit === 'man' ? MAN : 1)
  }
  return inRange(key, value) ? { ok: true, value } : BAD
}

const group = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

/** 저장 값 → 화면 칸 글자(parseCostInput으로 다시 읽으면 같은 값). 없으면 빈 글자 */
export function costFieldText(key: CostKey, value: number | undefined): string {
  if (value === undefined) return ''
  switch (UNIT[key]) {
    case 'man':
      return group(Math.floor(value / MAN))
    case 'won':
      return group(value)
    case 'rate': {
      const frac = String(value % 100).padStart(2, '0').replace(/0+$/, '')
      return frac === '' ? String(Math.floor(value / 100)) : `${Math.floor(value / 100)}.${frac}`
    }
    case 'days':
      return String(value)
  }
}

/** DB에서 읽은 `costs` jsonb → 아는 열쇠·칸 범위의 정수만 남긴다(만 원 칸은 1만 원으로 나눠떨어져야 함) */
export function checkCosts(raw: unknown): Costs {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
  const row = raw as Record<string, unknown>
  const out: Costs = {}
  for (const key of COST_KEYS) {
    const value = row[key]
    if (typeof value === 'number' && inRange(key, value)) out[key] = value
  }
  return out
}

const has = (v: number | null | undefined): v is number => typeof v === 'number'

// 적은 칸만 더한다(빈칸 = 0). 모두 비면 없음
function sumKnown(parts: readonly (number | null | undefined)[]): number | null {
  const known = parts.filter(has)
  return known.length === 0 ? null : known.reduce((s, v) => s + v, 0)
}

// 버림(평당 값 × 화면 평). 평은 area.ts m2ToPyeong 한 곳(30평으로 적은 99.17㎡는 30평, 시안 '× 전용 52평')이고
// 0.1평 수(정수)로 바꿔 센다. 곱이 2^53을 넘을 수 있어 BigInt로 센 뒤 한 번만 버린다
function interiorWon(perPyeong: number, areaM2: number): number {
  const tenths = Math.round(m2ToPyeong(areaM2) * 10)
  return Number((BigInt(perPyeong) * BigInt(tenths)) / BigInt(10))
}

/**
 * 비용 칸 → 합계·손익분기(design.md 11절 식). `costs`는 parseCostInput·checkCosts를 거친 정수,
 * `areaM2`는 인테리어 평수를 낼 넓이(후보·매물 ㎡, 모르면 null)
 */
export function calcCosts(costs: Costs, areaM2: number | null): CostSummary {
  const c = costs
  const interiorTotal = has(c.interior) && areaM2 !== null && areaM2 > 0 ? interiorWon(c.interior, areaM2) : null
  const interest = has(c.loan) && has(c.rateBp) ? Math.floor((c.loan * c.rateBp) / 120_000) : null
  const monthlyFixed = sumKnown([c.rent, c.mgmt, c.payroll, c.otherMonth, interest])
  const sixMonths = monthlyFixed === null ? null : 6 * monthlyFixed
  const startTotal = sumKnown([c.deposit, c.premium, interiorTotal, c.equipment, c.otherStart, sixMonths])
  const mine = startTotal === null ? null : startTotal - (c.loan ?? 0)
  const breakEven =
    monthlyFixed !== null && has(c.perPatient) && c.perPatient > 0 && has(c.workDays) && c.workDays > 0
      ? Math.floor((monthlyFixed * 10) / (c.perPatient * c.workDays)) / 10
      : null
  return {
    interiorTotal,
    interest,
    monthlyFixed,
    sixMonths,
    startTotal,
    mine,
    loanOver: mine !== null && mine < 0,
    breakEven,
    blanks: COST_KEYS.filter((key) => !has(c[key])).length,
  }
}
