import type { UisFileResult, UisKind, UisSpan } from '@/types/uisarang'
import { UIS_KIND_NAME, UIS_UNKNOWN_KIND } from './texts'

// 결과 줄 둘째 줄 글(specs/uisarang-upload requirements '화면 글자' 결과, design.md §10-1).
// 날짜는 'YYYY-MM-DD' 글(lib/analytics/dates의 한국 날짜)을 그대로 읽는다 — Date를 쓰지 않는다.
// 하루 {M}월 {D}일 · 한 주 {M}월 {D}일 ~ {M}월 {D}일 (한 주) · 한 달 {M}월 한 달 · 받지 않은 파일 조회일 {M}월 {D}일 ~ {M}월 {D}일.
// 오늘의 해가 아니면 앞에 {YYYY}년, 끝 날의 해가 앞 날과 다르면 끝 날에도 {YYYY}년. 조회일을 모르면 기간 글 없이 종류 이름만

const yearOf = (ymd: string) => ymd.slice(0, 4)
const monthDay = (ymd: string) => `${Number(ymd.slice(5, 7))}월 ${Number(ymd.slice(8, 10))}일`
const withYear = (ymd: string, year: string) => `${yearOf(ymd) === year ? '' : `${yearOf(ymd)}년 `}${monthDay(ymd)}`

function rangeText(from: string, to: string, year: string): string {
  const head = withYear(from, year)
  if (from === to) return head
  return `${head} ~ ${yearOf(to) === yearOf(from) ? monthDay(to) : `${yearOf(to)}년 ${monthDay(to)}`}`
}

function spanOf(span: UisSpan, year: string): string {
  if (span.unit === 'month') return `${yearOf(span.from) === year ? '' : `${yearOf(span.from)}년 `}${Number(span.from.slice(5, 7))}월 한 달`
  if (span.unit === 'week') return `${rangeText(span.from, span.to, year)} (한 주)`
  return withYear(span.from, year)
}

/** 종류 이름. 모르면 모르는 엑셀 */
export const uisKindName = (kind: UisKind | null): string => (kind === null ? UIS_UNKNOWN_KIND : UIS_KIND_NAME[kind])

/** 기간 글. 조회일을 모르면 null */
export function uisSpanText(result: UisFileResult, today: string): string | null {
  const year = yearOf(today)
  if (result.status === 'read') return spanOf(result.read.span, year)
  if (result.status === 'skipped') return result.span === null ? null : spanOf(result.span, year)
  return result.span === null ? null : `조회일 ${rangeText(result.span.from, result.span.to, year)}`
}

/** 줄 글: {종류 이름} · {기간 글} (기간 글이 없으면 종류 이름만) */
export function uisLineText(result: UisFileResult, today: string): string {
  const kind = result.status === 'read' ? result.read.kind : result.kind
  const span = uisSpanText(result, today)
  return span === null ? uisKindName(kind) : `${uisKindName(kind)} · ${span}`
}
