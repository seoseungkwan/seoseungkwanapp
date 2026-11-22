// 카카오 장소 찾기 값(약국·마트·큰 병원·산업단지) — 볼 때만(spec location AC-7908.4·AC-7909.6, ADR-044).
// 부르는 쪽(LocationScreen)이 후보를 열 때마다 k-near·k-keyword를 새로 불러 그 답(queryLocation의 QueryReply)을 그대로 넘긴다.
// 이 부품은 받은 값을 그리기만 하고, 저장하는 콜백으로 넘기지 않는다(콜백에는 종류 이름만 간다)
import type { Got, QueryReply, Why } from '@/types/location'

/** 장소 하나(카카오 KakaoPlace에서 쓰는 칸만) */
export type NearPlace = { name: string; distM: number }
/** 카카오 답. 가까운 차례 45곳까지, 더 있으면 capped */
export type NearReply = QueryReply<{ places: readonly NearPlace[]; capped: boolean }>
/** 약국(PM9) · 마트(MT1) · 큰 병원(HP8에서 부르는 쪽이 고름) · 산업단지(k-keyword '산업단지') */
export type NearKind = 'pharmacy' | 'mart' | 'bigHospital' | 'industryPark'
/** 종류마다 답. 빈 칸(undefined)은 아직 불러오는 중 */
export type Near = Partial<Record<NearKind, NearReply>>

export const KAKAO_SRC = 'kakao-local'

/** 부르는 쪽 답 → 화면 상태: 불러오는 중(null) · 장소 목록 · 못 받은 까닭 */
export function nearState(reply: NearReply | undefined): null | { ok: true; places: readonly NearPlace[]; capped: boolean } | { ok: false; why: Why } {
  if (reply === undefined) return null
  if (reply.ok) return { ok: true, places: reply.value.places, capped: reply.value.capped }
  return { ok: false, why: reply.code }
}

/** 범위 안 장소(가까운 차례)와 그 수가 한도에 걸렸는지 — 마지막 곳이 범위 밖이면 범위 안은 다 센 것이다 */
export function inRange(places: readonly NearPlace[], capped: boolean, radiusM: number): { list: NearPlace[]; capped: boolean } {
  const sorted = [...places].sort((a, b) => a.distM - b.distM)
  const list = sorted.filter((p) => p.distM <= radiusM)
  return { list, capped: capped && list.length === sorted.length && list.length > 0 }
}

/** 가장 가까운 곳(범위와 상관없이) */
export const nearest = (places: readonly NearPlace[]): NearPlace | null =>
  places.reduce<NearPlace | null>((best, p) => (best === null || p.distM < best.distM ? p : best), null)

/** 그날 값 칸에서 보일 값: 지금 값 또는 옛 값(prev) */
export const shownOf = <T,>(got: Got<T>): { v: T; asOf: string } | null => (got.ok ? { v: got.v, asOf: got.asOf } : (got.prev ?? null))
