import type { RxDetailPoint, StatsPeriod, StatsRange } from '@/components/stats/view'
import { monthOf } from '@/lib/analytics/dates'
import type { TrendBucket } from '@/types/analysis'
import { dateWithWeekday, dayNumber, longDate, monthNumber, onlyThisMonthPartial, yearMonth } from './parts'

// 그래프 글 함수 (treatment-trend REQ-1209·1207, design.md '화면' trendLabels.ts). 처방 추세(stats REQ-513)에서 글자 그대로 옮겼다.
// 처방 추세·처방 골라 보기·처방별 추세의 열린 칸이 같은 칸 이름·눈금·안내 글을 쓴다.
// 기간 대신 칸(range.bucket)·grain을 받는다(stats-period AC-1708.1). 빠른 단추의 칸은 7·30일 일, 90일 주, 12개월 달이라 글이 지금과 같다

export const GRAIN_NAME: Record<StatsPeriod, '일' | '주' | '달'> = { '7d': '일', '30d': '일', '90d': '주', '12m': '달' }
export const BUCKET_NAME: Record<TrendBucket, '일' | '주' | '달'> = { day: '일', week: '주', month: '달' }

// 뺀 짝이 있을 때의 안내(stats AC-513.12, treatment-trend AC-1207.8). 12개월(grain 달)은 달, 나머지는 표시 칸과 상관없이 날이다(AC-511.9)
export const comparedNote = (grain: StatsRange['grain'], kept: number) =>
  grain === 'month' ? `증감과 막대는 끝난 ${kept}달만 견줘요. 건수는 기간 전체예요.` : `증감과 막대는 두 기간 모두 자료가 있는 ${kept}일만 견줘요. 건수는 기간 전체예요.`

export const longLabel = (point: RxDetailPoint, bucket: TrendBucket) =>
  bucket === 'day' ? dateWithWeekday(point.start) : bucket === 'week' ? `${longDate(point.start)} – ${longDate(point.end)}` : yearMonth(point.start)

export function tickLabel(point: RxDetailPoint, i: number, cells: number, bucket: TrendBucket): string {
  if (bucket === 'month') return `${monthNumber(point.start)}월`
  const step = bucket === 'week' ? 3 : cells <= 7 ? 1 : 7
  return i % step === 0 ? `${monthNumber(point.start)}.${dayNumber(point.start)}` : ''
}

// 같은 차례 비교 점의 건수. 점이 없거나 덮이지 않았으면 null
export function comparisonAt(previous: readonly RxDetailPoint[], i: number): number | null {
  const point = previous[i]
  return point === undefined || !point.covered ? null : point.count
}

// picked = 고른 기간(stats-period AC-1705.4). 회색 막대는 바로 전 기간이라 달 칸도 '비교 기간'이라고 쓴다(빠른 단추 12개월은 작년 같은 달).
// 끝나지 않은 달의 '…일까지'는 빠른 단추면 오늘, 고른 기간이면 그 칸의 끝(= 기간 끝, 끝난 날: 오늘 진료가 안 끝났으면 어제)이다
export function detailNote(bucket: TrendBucket, current: readonly RxDetailPoint[], today: string, picked = false): string {
  if (bucket === 'day') return '하루씩 센 건수예요. 회색 막대는 비교 기간의 같은 차례 날이에요.'
  if (bucket === 'week') return '주는 월요일–일요일이에요. 기간 처음과 끝에 걸린 주는 일부 기간(빗금)이에요. 회색 막대는 비교 기간의 같은 차례 주예요.'
  const gray = picked ? '회색 막대는 비교 기간의 같은 차례 달이에요.' : '회색 막대는 작년 같은 달이에요.'
  const partial = current.filter((point) => point.partial)
  if (!onlyThisMonthPartial(partial.map((point) => monthOf(point.start)), today)) return gray
  const until = picked ? partial[0]!.end : today
  return `빗금 칸은 아직 끝나지 않은 달이에요(${monthNumber(until)}월은 ${dayNumber(until)}일까지). ${gray}`
}
