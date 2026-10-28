// 히어로 차트 예시 값. 승인된 목업(DCLogic)의 값·주기를 그대로 옮겼다
export const HERO_INTERVAL_MS = 2600

export type HeroFrame = { visits: number; newRate: string; ringPct: number; bars: readonly number[] } // bars: 막대 6개 높이(%)

const VISITS = [128, 129, 131, 132, 134, 135, 137, 138] as const
const NEW_RATES = ['18.2', '18.4', '18.6', '18.4'] as const
const RING_PCTS = [18, 24, 31, 27] as const
const BARS = [
  [22, 35, 41, 52, 60, 74],
  [30, 38, 49, 58, 71, 82],
  [26, 44, 53, 63, 77, 91],
  [34, 41, 56, 66, 80, 88],
] as const

const pick = <T>(list: readonly T[], tick: number): T => list[tick % list.length]

export function heroFrame(tick: number): HeroFrame {
  return {
    visits: pick(VISITS, tick),
    newRate: pick(NEW_RATES, tick),
    ringPct: pick(RING_PCTS, tick),
    bars: pick(BARS, tick),
  }
}

// 모션 줄이기면 타이머를 만들지 않는다 → 화면은 틱 0 그대로
export function startHeroTicker({
  reduce,
  onTick,
  intervalMs = HERO_INTERVAL_MS,
}: {
  reduce: boolean
  onTick: (tick: number) => void
  intervalMs?: number
}): () => void {
  if (reduce) return () => {}
  let tick = 0
  const timer = setInterval(() => {
    tick += 1
    onTick(tick)
  }, intervalMs)
  return () => clearInterval(timer)
}
