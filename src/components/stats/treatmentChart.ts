import { formatCount, truncatedOne } from '@/components/charts/format'
import { compareYmd } from '@/lib/analytics/dates'
import type { TrendBucket } from '@/types/analysis'
import type { DateRange } from '@/types/dates'
import type { DayPayload } from '@/types/payload'
import { comparisonAt } from './sections/trendLabels'
import { treatmentDetail, type TreatmentRow } from './treatmentView'
import type { RxDetailPoint, StatsInput, StatsRange } from './view'

// 처방별 추세 줄 표·열린 칸의 총환자·총환자 대비·추세선 숫자와 글 (group-exclude REQ-3706·3707·3709 AC-3709.2, design.md '화면 숫자').
// 순수 함수다. 칸은 treatmentDetail(지금 열린 칸 점) 그대로이고, 여기서는 칸 총환자·비교·추세선만 더한다.
// 총환자는 저장된 일 줄의 totals.patients만 더한다(건수도 저장된 날만 세므로 같은 날로 맞춘다, design.md '총환자는 저장된 날만').
// 보이는 숫자는 버린다(반올림 안 함): 정수는 formatCount, 소수는 truncatedOne

export type ChartMode = 'count' | 'pct'
export type ReadyTreatmentRow = Extract<TreatmentRow, { kind: 'ready' }>
// pct = count ÷ patients × 100(patients 0이면 null). comparison = 같은 차례 비교 점의 건수(덮이지 않았으면 null)
export type ChartCell = RxDetailPoint & { patients: number; pct: number | null; comparison: number | null }
// from·to = 추세선에 쓴 첫·끝 칸 자리(칸 차례)
export type TrendFit = { slope: number; intercept: number; from: number; to: number }

const NO_VALUE = '–'
const INTEGER_FROM = 10 // [건수] 기울기 크기가 이 이상이면 정수 글
const FLAT_SHARE = 0.005 // [건수] 기울기 크기가 쓴 칸 평균의 0.5%보다 작으면 거의 그대로
const ZERO_TEXT = '0.0'
const UNIT: Record<TrendBucket, string> = { day: '하루에', week: '한 주에', month: '한 달에' }
const PERCENT_POINT = '(%p = 퍼센트끼리 뺀 차이, 예: 22%에서 23%는 1%p)'

// 기간 안 저장된 일 줄의 날마다 총환자(같은 날은 뒤의 줄, rowsIn 규칙)
function patientsByDay(days: readonly DayPayload[], range: DateRange): Map<string, number> {
  const byDay = new Map<string, number>()
  for (const row of days) if (compareYmd(row.day, range.from) >= 0 && compareYmd(row.day, range.to) <= 0) byDay.set(row.day, row.totals.patients)
  return byDay
}

// 기간 총환자 = 날마다 totals.patients의 합, 진료한 날 = totals.patients > 0인 날 수
export function periodPatients(days: readonly DayPayload[], range: DateRange): { patients: number; openDays: number } {
  let patients = 0
  let openDays = 0
  for (const count of patientsByDay(days, range).values()) {
    patients += count
    if (count > 0) openDays += 1
  }
  return { patients, openDays }
}

// 열린 칸의 칸(treatmentDetail의 지금 칸)에 칸 총환자(그 칸 날짜 안 저장된 줄의 합)·총환자 대비·같은 차례 비교를 붙인다
export function chartCells(input: StatsInput, item: ReadyTreatmentRow): ChartCell[] {
  const { current, previous } = treatmentDetail(input, item)
  return current.map((point, i) => {
    const { patients } = periodPatients(input.days, { from: point.start, to: point.end })
    return { ...point, patients, pct: patients > 0 ? (point.count / patients) * 100 : null, comparison: comparisonAt(previous, i) }
  })
}

// 추세선에 쓰는 칸(총환자 > 0이고 일부 기간이 아님, 결정 15)의 [x = 칸 차례, y = 모양 값]
function usedPoints(cells: readonly ChartCell[], mode: ChartMode): Array<[number, number]> {
  return cells.flatMap((cell, i): Array<[number, number]> => {
    const y = mode === 'count' ? cell.count : cell.pct
    return cell.patients > 0 && !cell.partial && y !== null ? [[i, y]] : []
  })
}

// 최소제곱 직선. 쓸 칸이 둘보다 적거나 x가 모두 같으면(분모 0) 없음
export function trendFit(cells: readonly ChartCell[], mode: ChartMode): TrendFit | null {
  const points = usedPoints(cells, mode)
  const n = points.length
  if (n < 2) return null
  let sx = 0
  let sy = 0
  let sxx = 0
  let sxy = 0
  for (const [x, y] of points) {
    sx += x
    sy += y
    sxx += x * x
    sxy += x * y
  }
  const denominator = n * sxx - sx * sx
  if (denominator === 0) return null
  const slope = (n * sxy - sx * sy) / denominator
  return { slope, intercept: (sy - slope * sx) / n, from: points[0]![0], to: points[n - 1]![0] }
}

// 추세 글(AC-3707.2~4). 평균 = 추세선에 쓴 칸 y의 평균
export function trendText(fit: TrendFit | null, cells: readonly ChartCell[], mode: ChartMode, bucket: TrendBucket): string {
  if (fit === null) return '추세선을 그을 칸이 모자라요.'
  const size = Math.abs(fit.slope)
  const up = fit.slope > 0
  if (mode === 'pct') {
    const text = truncatedOne(size)
    if (text === ZERO_TEXT) return '추세선으로 보면 총환자 대비 비율은 거의 그대로예요.'
    return `추세선으로 보면 총환자 대비 비율이 ${UNIT[bucket]} 약 ${text}%p씩 ${up ? '오르는' : '내리는'} 흐름이에요. ${PERCENT_POINT}`
  }
  const points = usedPoints(cells, mode)
  const mean = points.reduce((total, [, y]) => total + y, 0) / points.length
  const text = size >= INTEGER_FROM ? formatCount(size) : truncatedOne(size)
  if (text === ZERO_TEXT || size < mean * FLAT_SHARE) return '추세선으로 보면 건수는 거의 그대로예요.'
  return `추세선으로 보면 ${UNIT[bucket]} 약 ${text}건씩 ${up ? '늘어나는' : '줄어드는'} 흐름이에요.`
}

// 요약 줄 합계 이름: 빠른 단추 12개월은 1년, 나머지(빠른 단추 '최근 N일'·고른 기간)는 기간 이름
export function sumLabel(range: StatsRange): string {
  return range.period === '12m' ? '1년(최근 12개월) 합계' : `${range.name} 합계`
}

// 하루 평균 = 건수 ÷ 진료한 날(소수 첫째 자리까지 버림). 진료한 날이 0이면 –
export function perDayText(count: number, openDays: number): string {
  return openDays > 0 ? truncatedOne(count / openDays) : NO_VALUE
}
