// 입지 분석 공용 화면 글(design.md 14·15절) — 출처 줄 `{기관} {자료} · 기준 {날짜}`와 자료 없음 칸 글(WhyLine) 여섯.
// 글은 SOURCES(lib/location/sources.ts)와 design.md 15절 글자 그대로다. 숫자 칸·출처 줄·자료 없음 글·보고서가 같이 쓴다
import { isMonth, isYmd } from '@/lib/analytics/dates'
import { commaText } from '@/lib/location/money'
import { sourceOf } from '@/lib/location/sources'
import type { SourceId, Why } from '@/types/location'

// '근거와 출처' 안쪽 탭(AC-7901.3)의 그 출처 줄 닻(TASK-28 `#src-<id>`)
export function sourceHref(id: SourceId): string {
  return `/location?tab=sources#src-${id}`
}

// 기준 날짜 글자: '2026-11-05' → '2026년 11월 5일' · '2026-10' → '2026년 10월' · 그 밖은 받은 글자 그대로
export function asOfText(asOf: string): string {
  if (isYmd(asOf)) return `${asOf.slice(0, 4)}년 ${Number(asOf.slice(5, 7))}월 ${Number(asOf.slice(8, 10))}일`
  if (isMonth(asOf)) return `${asOf.slice(0, 4)}년 ${Number(asOf.slice(5, 7))}월`
  return asOf
}

// 출처 줄: `{기관} {자료} · 기준 {날짜}`(날짜가 없으면 `{기관} {자료}`) + ` · {덧붙임}`. SOURCES에 없는 id면 null
export function sourceText(id: SourceId, asOf?: string | null, extra?: string): string | null {
  const s = sourceOf(id)
  if (s === undefined) return null
  const parts = [`${s.org} ${s.name}`]
  if (asOf) parts.push(`기준 ${asOfText(asOf)}`)
  if (extra) parts.push(extra)
  return parts.join(' · ')
}

// 카카오 출처의 열쇠 이름('화면 글 기본값' 열쇠 상태 줄). 열쇠 없음 글에 자료 이름 대신 쓴다
const KAKAO_KEY_NAME: Readonly<Record<string, string>> = {
  'kakao-local': '카카오 장소 찾기 열쇠',
  'kakao-map': '카카오 지도 열쇠',
}

// 자료 없음 칸 글(design.md 15절). SOURCES에 없는 id면 null
export function whyText(why: Why, id: SourceId): string | null {
  const s = sourceOf(id)
  if (s === undefined) return null
  switch (why) {
    case 'no-key':
      return `${KAKAO_KEY_NAME[s.id] ?? s.name}: 열쇠를 넣으면 보여요.`
    case 'not-applied':
      return `공공데이터포털에서 '${s.name}' 활용신청을 하면 보여요.`
    case 'failed':
      return '지금 받지 못했어요.'
    case 'none':
      return s.noneText
    case 'outside':
      return '이 지역은 자료 없음'
  }
}

// 옛 값을 보일 때 붙이는 글
export function prevText(asOf: string): string {
  return `지난 값 · 기준 ${asOfText(asOf)}`
}

// 목록 한도에 걸렸을 때(capped) 글
export function cappedText(n: number): string {
  const c = commaText(n)
  return `${c}곳 넘게 있어요. 가까운 ${c}곳만 셌어요.`
}

export const RETRY_LABEL = '다시 받기'
/** 다시 받는 중 칸 글(AC-7917.4, TASK-95) */
export const refreshingText = (done: number, total: number) => `다시 받는 중이에요 · 자료 ${done}/${total}`
