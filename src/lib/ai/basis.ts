import { formatCount, formatRate } from '@/components/charts/format'
import type { ReportInput, ReportMetric } from '@/types/aiReport'

// 근거 줄(spec ai-report design.md '근거 줄'). 앱이 지표의 진짜 값으로만 만든다 — AI가 쓴 글자는 넣지 않는다(requirements 배경 8).
// 숫자 글자는 통계 화면과 같은 formatCount·formatRate로만 만든다(버림, 반올림 안 함, ADR-008).
// 비교 달은 input.prevMonth·input.lastYearMonth를 그대로 쓴다 — 달 계산은 buildReportInput이 이미 했다(lib/analytics/dates.ts)

const NO_DATA = '자료 없음'
const IN_PROGRESS = '집계 중'

// 'YYYY-MM' → ['YYYY', 'N월']: '2026-10' → ['2026', '10월'], '2026-01' → ['2026', '1월']
function monthParts(month: string): [year: string, name: string] {
  const [year, mm] = month.split('-')
  return [year, `${Number(mm)}월`]
}

// 값 글자. null이면 숫자 지표는 '자료 없음', 비율은 그 달 자료가 있으면 '집계 중'(분모가 없거나 아직 셀 수 없음).
// 접수 건수·재진(visits)은 '건', 사람 수(count)는 '명'(spec ai-report-stats REQ-2004)
function valueText(metric: ReportMetric, value: number | null, hasMonth: boolean): string {
  if (value === null) return metric.kind === 'rate' && hasMonth ? IN_PROGRESS : NO_DATA
  if (metric.kind === 'rate') return `${formatRate(value)}%`
  return metric.kind === 'visits' ? `${formatCount(value)}건` : `${formatCount(value)}명`
}

// '근거 · <이름> <지난달> <값> → <고른 달> <값> · <작년 같은 달> <값>'
export function basisLine(metric: ReportMetric, input: ReportInput): string {
  const { selected, prev, lastYear } = metric.values
  const [year, selectedName] = monthParts(input.month)
  const [prevYear, prevName] = monthParts(input.prevMonth)
  const [, lastYearName] = monthParts(input.lastYearMonth)

  const prevLabel = prevYear === year ? prevName : `작년 ${prevName}`
  const prevPart = `${prevLabel} ${valueText(metric, prev, input.hasPrev)}`
  const selectedPart = `${selectedName} ${valueText(metric, selected, true)}`
  const lastYearPart = `작년 ${lastYearName} ${valueText(metric, lastYear, input.hasLastYear)}`
  return `근거 · ${metric.label} ${prevPart} → ${selectedPart} · ${lastYearPart}`
}
