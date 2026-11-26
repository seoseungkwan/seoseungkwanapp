import { addDays, compareYmd, eachDay } from '@/lib/analytics/dates'
import { uisUnitOf } from '@/lib/payload/uisarang'
import type { DateRange } from '@/types/dates'
import type { UisAgePayload, UisGroupDef, UisHave, UisPeriodRow, UisRxPayload, UisRxRow } from '@/types/uisarang'

// 의사랑 숫자 셈(specs/uisarang-upload design.md §8). 순수 함수 — 환자 자료 구역(lib/analytics) 규칙 안이다.
// 통계 탭 · 관리자 의원 비교 · AI 경영 리포트 · 월간 보고서가 같이 쓴다. 날짜 셈은 lib/analytics/dates만 쓴다

const AGE_ROWS = 10

/** tileRx가 처방 줄로 덮을 때 이미 아는 것: 덮은 기간(합침)과 진료한 날(환자 1명 이상) */
export type UisKnown = { covered: readonly DateRange[]; worked: ReadonlySet<string> }
export type UisTile =
  | { ok: true; used: UisPeriodRow<UisRxPayload>[]; counts: { month: number; week: number; day: number } }
  | { ok: false; gap: string[] }
export type UisCodeSum = UisRxRow
export type UisGroupSums = {
  groups: Array<{ id: string; qty: number; amount: number }>
  other: { amount: number }
  total: { amount: number }
  ignored: boolean
}
export type UisAgeSums = { bands: number[]; newBands: number[]; days: number; missingDays: number }
export type UisMissingKind = 'income' | 'rx' | 'visits' | 'visitPatients'

const round3 = (x: number) => Math.round(x * 1000) / 1000

const timeOf = (row: { updatedAt: string }) => {
  const time = Date.parse(row.updatedAt)
  return Number.isNaN(time) ? -Infinity : time
}

/** 같은 기간 줄이 둘이면(일어나면 안 됨) updated_at이 늦은 것 하나만(같으면 앞 것) */
function latestPerSpan<P>(rows: readonly UisPeriodRow<P>[]): UisPeriodRow<P>[] {
  const bySpan = new Map<string, UisPeriodRow<P>>()
  for (const row of rows) {
    const key = `${row.from}|${row.to}`
    const held = bySpan.get(key)
    if (held === undefined || timeOf(row) > timeOf(held)) bySpan.set(key, row)
  }
  return [...bySpan.values()]
}

const bySpan = (a: { from: string; to: string }, b: { from: string; to: string }) => compareYmd(a.from, b.from) || compareYmd(a.to, b.to)
const inside = (range: DateRange, row: { from: string; to: string }) => compareYmd(range.from, row.from) <= 0 && compareYmd(row.to, range.to) <= 0
const isIn = (day: string, ranges: readonly DateRange[]) => ranges.some((r) => compareYmd(r.from, day) <= 0 && compareYmd(day, r.to) <= 0)

/**
 * 고른 기간을 처방 줄로 겹치지 않게 덮는다(design.md §8 tileRx).
 * ① 기간과 똑같은 줄이 있으면 그것 하나 ② 아니면 기간 안에 통째로 든 한 달 줄 → 남은 날에 통째로 든 한 주 줄 → 남은 날의 하루 줄
 * ③ 남은 날 가운데 휴진(덮은 기간 안 · 진료한 날 아님)·오늘·오늘 뒤가 아닌 날이 있으면 gap(날 차례). used는 기간 차례다
 */
export function tileRx(range: DateRange, rows: readonly UisPeriodRow<UisRxPayload>[], known: UisKnown, today: string): UisTile {
  const candidates = latestPerSpan(rows).filter((row) => uisUnitOf(row.from, row.to) !== null)
  const counts = { month: 0, week: 0, day: 0 }
  const exact = candidates.find((row) => row.from === range.from && row.to === range.to)
  if (exact !== undefined) {
    counts[uisUnitOf(exact.from, exact.to) ?? 'day'] += 1
    return { ok: true, used: [exact], counts }
  }
  const chosen = new Set<string>()
  const used: UisPeriodRow<UisRxPayload>[] = []
  const within = candidates.filter((row) => inside(range, row)).sort(bySpan)
  for (const unit of ['month', 'week', 'day'] as const) {
    for (const row of within) {
      if (uisUnitOf(row.from, row.to) !== unit) continue
      const covers = eachDay(row)
      if (covers.some((day) => chosen.has(day))) continue
      for (const day of covers) chosen.add(day)
      used.push(row)
      counts[unit] += 1
    }
  }
  const gap = eachDay(range).filter(
    (day) => !chosen.has(day) && compareYmd(day, today) < 0 && !(isIn(day, known.covered) && !known.worked.has(day)),
  )
  return gap.length > 0 ? { ok: false, gap } : { ok: true, used: used.sort(bySpan), counts }
}

/** 고른 줄을 코드마다 더한다: 처방량(셋째 자리 반올림) · 총액 · 이름(가장 늦은 기간 줄의 이름). 총액 큰 차례, 같으면 코드 차례 */
export function sumRxCodes(used: readonly UisPeriodRow<UisRxPayload>[]): UisCodeSum[] {
  const sums = new Map<string, UisCodeSum>()
  // 늦은 기간 줄부터 보면 처음 본 이름이 가장 늦은 이름이다
  const latestFirst = [...used].sort((a, b) => compareYmd(b.to, a.to) || compareYmd(b.from, a.from) || timeOf(b) - timeOf(a))
  for (const row of latestFirst) {
    for (const line of row.payload.rows) {
      const held = sums.get(line.code)
      if (held === undefined) sums.set(line.code, { ...line })
      else sums.set(line.code, { ...held, qty: held.qty + line.qty, amount: held.amount + line.amount })
    }
  }
  return [...sums.values()]
    .map((sum) => ({ ...sum, qty: round3(sum.qty) }))
    .sort((a, b) => b.amount - a.amount || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
}

const codeKey = (code: string) => code.trim().toLowerCase()

/**
 * 묶음마다 더한다: 넣는 처방 코드(앞뒤 빈칸 뗌 · 대소문자 무시)만. 빼는 처방·조건은 의사랑 엑셀로 셀 수 없어 보지 않고 ignored로 알린다.
 * 어느 묶음에도 없는 코드 = 그 밖 처방, 모든 코드 총액 = 합계. 묶음 차례는 받은 차례다
 */
export function sumRxGroups(codes: readonly Pick<UisRxRow, 'code' | 'qty' | 'amount'>[], groups: readonly UisGroupDef[]): UisGroupSums {
  const sets = groups.map((group) => new Set(group.codes.map(codeKey)))
  let other = 0
  let total = 0
  const sums = groups.map((group) => ({ id: group.id, qty: 0, amount: 0 }))
  for (const line of codes) {
    const key = codeKey(line.code)
    total += line.amount
    let grouped = false
    sets.forEach((set, i) => {
      if (!set.has(key)) return
      grouped = true
      sums[i].qty += line.qty
      sums[i].amount += line.amount
    })
    if (!grouped) other += line.amount
  }
  return {
    groups: sums.map((sum) => ({ ...sum, qty: round3(sum.qty) })),
    other: { amount: other },
    total: { amount: total },
    ignored: groups.some((group) => group.out.length > 0 || group.cond.length > 0),
  }
}

/** 기간 나이대 합: 띠마다 내원·신환 합 · 나이대 줄이 있는 날 수 · 진료한 날인데 나이대 줄이 없는 날 수 */
export function sumAges(rows: readonly UisPeriodRow<UisAgePayload>[], range: DateRange, worked: ReadonlySet<string>): UisAgeSums {
  const bands = Array<number>(AGE_ROWS).fill(0)
  const newBands = Array<number>(AGE_ROWS).fill(0)
  const daysWithRow = new Set<string>()
  for (const row of latestPerSpan(rows)) {
    if (row.from !== row.to || !inside(range, row)) continue
    daysWithRow.add(row.from)
    row.payload.bands.forEach((n, i) => (bands[i] += n))
    row.payload.newBands.forEach((n, i) => (newBands[i] += n))
  }
  const missingDays = [...worked].filter((day) => inside(range, { from: day, to: day }) && !daysWithRow.has(day)).length
  return { bands, newBands, days: daysWithRow.size, missingDays }
}

const MISSING_ORDER: readonly UisMissingKind[] = ['income', 'rx', 'visits', 'visitPatients']

/**
 * 이번에 넣은 날 가운데 아직 없는 파일(종류마다 날 목록, 없는 종류는 뺌, 차례 고정). 오늘 뒤 날·휴진(덮었고 진료 없음)은 건너뛴다.
 * 일일수입통계 = 매출 날 없음 · 기간별처방통계 = 그날을 덮는 처방 줄 없음 · 위쪽 표 = 덮은 날 아님 · 아래쪽 표 = 나이대 날 없음
 */
export function missingFiles(days: readonly string[], have: UisHave, today: string): Array<{ kind: UisMissingKind; days: string[] }> {
  const worked = new Set(have.worked)
  const income = new Set(have.income)
  const age = new Set(have.age)
  const targets = [...new Set(days)]
    .filter((day) => compareYmd(day, today) <= 0)
    .sort(compareYmd)
    .filter((day) => !(isIn(day, have.covered) && !worked.has(day)))
  const lacks: Record<UisMissingKind, (day: string) => boolean> = {
    income: (day) => !income.has(day),
    rx: (day) => !isIn(day, have.rx),
    visits: (day) => !isIn(day, have.covered),
    visitPatients: (day) => !age.has(day),
  }
  return MISSING_ORDER.map((kind) => ({ kind, days: targets.filter(lacks[kind]) })).filter((item) => item.days.length > 0)
}

const withCommas = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')

/** 처방량 글: 셋째 자리에서 반올림한 뒤 둘째 자리까지 · 끝 0과 . 뗌 · 천 단위 쉼표 · 음수는 - 앞(1234.5 → 1,234.5 · 0.245 → 0.25) */
export function formatQty(x: number): string {
  // 크기에서 반올림해 음수도 같은 자리로 반올림한다. 셋째 자리 정수에서 둘째 자리로 → 0.245가 0.24로 떨어지지 않는다
  const hundredths = Math.round(Math.round(Math.abs(x) * 1000) / 10)
  if (hundredths === 0) return '0'
  const whole = Math.floor(hundredths / 100)
  const cents = hundredths % 100
  const fraction = cents === 0 ? '' : `.${String(cents).padStart(2, '0').replace(/0$/, '')}`
  return `${x < 0 ? '-' : ''}${withCommas(String(whole))}${fraction}`
}

const monthDay = (ymd: string) => `${Number(ymd.slice(5, 7))}월 ${Number(ymd.slice(8, 10))}일`

function runText([first, last]: readonly [string, string], year: string): string {
  const head = `${first.slice(0, 4) === year ? '' : `${first.slice(0, 4)}년 `}${monthDay(first)}`
  if (first === last) return head
  return first.slice(0, 7) === last.slice(0, 7) ? `${head}~${Number(last.slice(8, 10))}일` : `${head}~${monthDay(last)}`
}

const MAX_RUNS = 10

/**
 * 날 목록 글: 이어진 날을 묶어 {M}월 {D}일 · {M}월 {D}일~{D}일 · (달이 바뀌면) {M}월 {D}일~{M}월 {D}일, 올해가 아니면 덩어리 앞에 {YYYY}년,
 * ', '로 잇고 열 덩어리 넘으면 열 개 뒤 ' 외 {남은 날 수}일'
 */
export function dayListText(days: readonly string[], today: string): string {
  const sorted = [...new Set(days)].sort(compareYmd)
  const runs: Array<[string, string]> = []
  for (const day of sorted) {
    const last = runs.at(-1)
    if (last !== undefined && addDays(last[1], 1) === day) last[1] = day
    else runs.push([day, day])
  }
  const year = today.slice(0, 4)
  const shown = runs.slice(0, MAX_RUNS).map((run) => runText(run, year)).join(', ')
  const rest = runs.slice(MAX_RUNS).reduce((n, [first, last]) => n + eachDay({ from: first, to: last }).length, 0)
  return rest > 0 ? `${shown} 외 ${rest}일` : shown
}
