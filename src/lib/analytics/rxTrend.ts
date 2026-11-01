import type { Delta, TrendBucket, TrendComparison, TrendPoint } from '@/types/analysis'
import type { DateRange } from '@/types/dates'
import type { DayPayload } from '@/types/payload'
import { compareNumbers } from './compare'
import { isCovered } from './coverage'
import { addDays, addMonths, compareYmd, diffDays, eachDay, monthOf, monthRange, weekRange, weekStartOf } from './dates'

// 저장한 일 숫자 → 처방마다 칸 점. 원본 vendor/drbit_export/TrendMath.cs를 옮겼고, 다른 점은 rxTrend.test.ts 머리 knownDiffs에 있다.
// 건 = 그날 그 처방 환자 수. 덮은 기간 안의 줄 없는 날은 0(휴진)이고, 밖의 날은 더하지 않고 그 칸을 일부 기간으로 둔다

export type { TrendBucket, TrendComparison, TrendPoint }

const MIN_YEAR = 1902
const MAX_YEAR = 9997
const MAX_RANGE_DAYS = 3660
const MAX_CODES = 200

const yearOf = (ymd: string) => Number(ymd.slice(0, 4))
const later = (a: string, b: string) => (compareYmd(a, b) >= 0 ? a : b)
const earlier = (a: string, b: string) => (compareYmd(a, b) <= 0 ? a : b)

// C# AddMonths처럼 옮긴 달에 없는 날은 그 달 말일로 맞춘다
function shiftMonths(ymd: string, n: number): string {
  const month = addMonths(monthOf(ymd), n)
  return earlier(`${month}-${ymd.slice(8)}`, monthRange(month).to)
}

// comparison이 없으면 비교 기간에 따로 걸린 검사는 건너뛴다
function validateDates(from: string, to: string, comparison?: TrendComparison): void {
  if (compareYmd(from, to) > 0) throw new RangeError('종료일은 시작일보다 빠를 수 없습니다.')
  if (comparison === 'PreviousMonth' && monthOf(from) !== monthOf(to)) {
    throw new RangeError('전월 비교는 한 달 안의 조회 기간을 선택해 주세요. 여러 달은 직전 동일 일수 또는 전년 비교를 사용하세요.')
  }
  if (yearOf(from) < MIN_YEAR || yearOf(to) > MAX_YEAR) throw new RangeError('분석 가능한 연도는 1902~9997년입니다.')
  if (diffDays(from, to) > MAX_RANGE_DAYS) throw new RangeError('한 번에 최대 10년 범위로 분석할 수 있습니다.')
  if (comparison === 'PreviousYear' && compareYmd(to, shiftMonths(from, 12)) >= 0) {
    throw new RangeError('전년 같은 기간 비교는 분석 기간을 1년 이내로 선택해 주세요.')
  }
}

// ── 비교 기간 ─────────────────────────────────────────────

export function comparisonLabel(c: TrendComparison): string {
  if (c === 'PreviousMonth') return '전월 같은 날짜 / 전체 월'
  if (c === 'PreviousYear') return '전년 같은 날짜 범위'
  return '시작일 직전 동일 일수'
}

export function comparisonRange(from: string, to: string, c: TrendComparison): { from: string; to: string; notes: string[] } {
  validateDates(from, to, c)
  if (c === 'PreviousYear') {
    const previous = { from: shiftMonths(from, -12), to: shiftMonths(to, -12) }
    const leapGap = diffDays(from, to) !== diffDays(previous.from, previous.to)
    return {
      ...previous,
      notes: [
        '비교 기간은 전년 같은 날짜 범위입니다. 2월 29일은 전년 2월 28일로 대응됩니다.',
        ...(leapGap ? ['윤년 차이로 현재 기간과 비교 기간의 일수가 다릅니다. 합계와 기간 일수를 함께 확인해 주세요.'] : []),
      ],
    }
  }
  if (c === 'PreviousMonth') {
    const whole = monthRange(monthOf(from))
    const isWholeMonth = from === whole.from && to === whole.to
    return {
      from: shiftMonths(from, -1),
      to: isWholeMonth ? addDays(from, -1) : shiftMonths(to, -1), // 전체 월은 전월 전체와 비교한다
      notes: [
        '전월 비교는 같은 날짜 범위를 한 달 전으로 옮깁니다. 없는 날짜는 전월 말일로 맞추고, 전체 월 선택은 전월 전체와 비교합니다. 여러 달 범위는 지원하지 않습니다.',
        '월 길이 차이는 합계와 달력일 평균을 함께 확인하세요. 달력일 평균은 휴진일을 포함하며 진료일 평균이 아닙니다.',
      ],
    }
  }
  return {
    from: addDays(from, -(diffDays(from, to) + 1)),
    to: addDays(from, -1),
    notes: ['비교 기간은 시작일 직전의 동일 일수입니다. 전월과 동일한 의미가 아닙니다.'],
  }
}

// ── 칸 점 ────────────────────────────────────────────────

type Tally = Pick<TrendPoint, 'count' | 'newCount' | 'returningCount'>

const ZERO: Tally = { count: 0, newCount: 0, returningCount: 0 }

// 코드는 원본처럼 대소문자를 가리지 않는다
const codeKey = (code: string) => code.toUpperCase()

// 대소문자만 다른 코드는 처음 고른 글자 하나로
function distinctCodes(codes: readonly string[]): string[] {
  const byKey = new Map<string, string>()
  for (const code of codes) if (!byKey.has(codeKey(code))) byKey.set(codeKey(code), code)
  return [...byKey.values()]
}

// 기간으로 자르기 전의 달력 칸(주 월~일, 달 1일~말일)
function calendarRange(ymd: string, bucket: TrendBucket): DateRange {
  if (bucket === 'month') return monthRange(monthOf(ymd))
  if (bucket === 'week') return weekRange(weekStartOf(ymd))
  return { from: ymd, to: ymd }
}

function labelOf(calendar: DateRange, clipped: DateRange, bucket: TrendBucket, partial: boolean): string {
  const name = bucket === 'month' ? monthOf(calendar.from) : bucket === 'day' ? clipped.from : `${clipped.from.slice(5)} ~ ${clipped.to.slice(5)}`
  return partial ? `${name} (일부 기간)` : name
}

// 칸 안 날들의 처방별 합. settled = 모든 날이 덮였고 끝남(덮은 기간 밖의 날이나 아직 끝나지 않은 줄이 없음)
function tallyDays(range: DateRange, byDay: ReadonlyMap<string, DayPayload>, covered: DateRange[]): { tallies: Map<string, Tally>; settled: boolean } {
  const tallies = new Map<string, Tally>()
  let settled = true
  for (const day of eachDay(range)) {
    if (!isCovered({ from: day, to: day }, covered)) {
      settled = false
      continue
    }
    const row = byDay.get(day)
    if (row === undefined) continue // 덮은 날에 줄이 없으면 휴진, 0인 날
    if (row.partial) settled = false
    for (const line of row.rx) {
      const tally = tallies.get(codeKey(line.code)) ?? ZERO
      tallies.set(codeKey(line.code), {
        count: tally.count + line.patients,
        newCount: tally.newCount + line.newPatients,
        returningCount: tally.returningCount + line.returning,
      })
    }
  }
  return { tallies, settled }
}

// covered는 readCoverage의 합친 범위 목록. 점은 칸 순서, 칸 안에서는 고른 코드 순서. totals는 코드마다 기간 전체 건수
export function buildTrend(
  days: readonly DayPayload[],
  covered: readonly DateRange[],
  req: { from: string; to: string; bucket: TrendBucket; codes: string[] },
): { points: TrendPoint[]; totals: Map<string, number> } {
  const { from, to, bucket } = req
  if (req.codes.length === 0) throw new RangeError('등록된 처방코드를 선택해 주세요.')
  validateDates(from, to)
  if (req.codes.length > MAX_CODES) throw new RangeError('한 번에 최대 200개 처방코드를 선택할 수 있습니다.')

  const codes = distinctCodes(req.codes)
  const coveredRanges = [...covered]
  const byDay = new Map(days.map((row) => [row.day, row]))
  const points: TrendPoint[] = []
  const totals = new Map(codes.map((code) => [code, 0]))

  for (let calendar = calendarRange(from, bucket); compareYmd(calendar.from, to) <= 0; calendar = calendarRange(addDays(calendar.to, 1), bucket)) {
    const clipped = { from: later(calendar.from, from), to: earlier(calendar.to, to) }
    const { tallies, settled } = tallyDays(clipped, byDay, coveredRanges)
    const partial = !settled || clipped.from !== calendar.from || clipped.to !== calendar.to
    const label = labelOf(calendar, clipped, bucket, partial)
    for (const code of codes) {
      const tally = tallies.get(codeKey(code)) ?? ZERO
      points.push({ code, start: clipped.from, end: clipped.to, label, partial, ...tally, quantity: null, amount: null })
      totals.set(code, (totals.get(code) ?? 0) + tally.count)
    }
  }
  return { points, totals }
}

// ── 증감 ─────────────────────────────────────────────────

// 앱의 compareNumbers 규칙. 원본 TrendChange.Rate처럼 이전이 음수면 비율만 뺀다(건수는 음수가 없어 원본 사례에서만 나온다)
export function trendChange(current: number, previous: number): Delta {
  const delta = compareNumbers(current, previous)
  return previous < 0 && delta.kind === 'change' ? { ...delta, pct: null } : delta
}
