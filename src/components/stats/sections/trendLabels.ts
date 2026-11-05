import type { RxDetailPoint, StatsPeriod } from '@/components/stats/view'
import { monthOf } from '@/lib/analytics/dates'
import { dateWithWeekday, dayNumber, longDate, monthNumber, onlyThisMonthPartial, yearMonth } from './parts'

// 그래프 글 함수 (treatment-trend REQ-1209·1207, design.md '화면' trendLabels.ts). 처방 추세(stats REQ-513)에서 글자 그대로 옮겼다.
// 처방 추세·처방 골라 보기·치료별 추세의 열린 칸이 같은 칸 이름·눈금·안내 글을 쓴다

export const GRAIN_NAME: Record<StatsPeriod, '일' | '주' | '달'> = { '7d': '일', '30d': '일', '90d': '주', '12m': '달' }

// 뺀 짝이 있을 때의 안내(stats AC-513.12, treatment-trend AC-1207.8). 12개월은 달, 나머지는 표시 칸과 상관없이 날이다(AC-511.9)
export const comparedNote = (period: StatsPeriod, kept: number) =>
  period === '12m' ? `증감과 막대는 끝난 ${kept}달만 견줘요. 건수는 기간 전체예요.` : `증감과 막대는 두 기간 모두 자료가 있는 ${kept}일만 견줘요. 건수는 기간 전체예요.`

export const longLabel = (point: RxDetailPoint, period: StatsPeriod) =>
  GRAIN_NAME[period] === '일' ? dateWithWeekday(point.start) : GRAIN_NAME[period] === '주' ? `${longDate(point.start)} – ${longDate(point.end)}` : yearMonth(point.start)

export function tickLabel(point: RxDetailPoint, i: number, cells: number, period: StatsPeriod): string {
  const grain = GRAIN_NAME[period]
  if (grain === '달') return `${monthNumber(point.start)}월`
  const step = grain === '주' ? 3 : cells <= 7 ? 1 : 7
  return i % step === 0 ? `${monthNumber(point.start)}.${dayNumber(point.start)}` : ''
}

// 같은 차례 비교 점의 건수. 점이 없거나 덮이지 않았으면 null
export function comparisonAt(previous: readonly RxDetailPoint[], i: number): number | null {
  const point = previous[i]
  return point === undefined || !point.covered ? null : point.count
}

export function detailNote(period: StatsPeriod, current: readonly RxDetailPoint[], today: string): string {
  const grain = GRAIN_NAME[period]
  if (grain === '일') return '하루씩 센 건수예요. 회색 막대는 비교 기간의 같은 차례 날이에요.'
  if (grain === '주') return '주는 월요일–일요일이에요. 기간 처음과 끝에 걸린 주는 일부 기간(빗금)이에요. 회색 막대는 비교 기간의 같은 차례 주예요.'
  const gray = '회색 막대는 작년 같은 달이에요.'
  const partial = current.filter((point) => point.partial).map((point) => monthOf(point.start))
  return onlyThisMonthPartial(partial, today) ? `빗금 칸은 아직 끝나지 않은 달이에요(${monthNumber(today)}월은 ${dayNumber(today)}일까지). ${gray}` : gray
}
