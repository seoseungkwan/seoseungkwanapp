import { diffDays, isYmd } from '@/lib/analytics/dates'
import type { Equipment } from '@/types/contacts'

// 무상 수리 남은 날(시안 기본값 16). 오늘은 부르는 쪽이 한국 날짜(todayInKorea)로 넘긴다 — 시계를 읽지 않는다

/** 끝나는 날 30일 전부터 알린다(주소록 칩·대시보드 알림) */
export const WARRANTY_SOON_DAYS = 30

export type WarrantyState = { kind: 'none' } | { kind: 'ended' } | { kind: 'soon'; days: number } | { kind: 'later'; days: number }

/** 끝나는 날이 없거나 날짜 모양이 아니면 none, 지났으면 ended, 남은 날(끝나는 날 − 오늘) 0~30이면 soon, 31 이상이면 later */
export function warrantyState(until: string | null, today: string): WarrantyState {
  if (until === null || !isYmd(until) || !isYmd(today)) return { kind: 'none' }
  const days = diffDays(today, until)
  if (days < 0) return { kind: 'ended' }
  return days <= WARRANTY_SOON_DAYS ? { kind: 'soon', days } : { kind: 'later', days }
}

/** soon인 장비 가운데 남은 날이 가장 적은 하나(목록 줄 칩, 끝남은 넣지 않음). 없으면 null */
export function soonestWarranty(equipment: readonly Pick<Equipment, 'warrantyUntil'>[], today: string): { days: number } | null {
  let soonest: number | null = null
  for (const item of equipment) {
    const state = warrantyState(item.warrantyUntil, today)
    if (state.kind === 'soon' && (soonest === null || state.days < soonest)) soonest = state.days
  }
  return soonest === null ? null : { days: soonest }
}
