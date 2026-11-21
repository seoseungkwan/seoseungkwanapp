import type { WarrantyState } from '@/lib/contacts/warranty'
import { look } from './look'

// 무상 수리 칩(spec contacts AC-6505.6, 시안 기본값 16 · wState). 상태는 lib/contacts warrantyState·soonestWarranty가 정한다.
// soon 1~30일 '무상 수리 {n}일 남음'(주황) · 0일 '무상 수리 오늘 끝나요'(주황 + 테두리) · ended '무상 수리 끝남'(회색) · later·none은 칩 없음

export function WarrantyChip({ state }: { state: WarrantyState }) {
  if (state.kind === 'ended') {
    return (
      <span data-warranty="ended" className={look.chipEnded}>
        무상 수리 끝남
      </span>
    )
  }
  if (state.kind !== 'soon') return null
  if (state.days === 0) {
    return (
      <span data-warranty="today" className={look.chipToday}>
        무상 수리 오늘 끝나요
      </span>
    )
  }
  return (
    <span data-warranty="soon" className={look.chipSoon}>
      {`무상 수리 ${state.days}일 남음`}
    </span>
  )
}
