// 쌓은 막대의 눈금 (b2b-redesign REQ-205 AC-205.4, design.md '차트 부품' scale.ts, UI_GUIDE '차트' 눈금).
// 간격 = 최대 합계/4 이상인 가장 작은 {1, 2, 2.5, 5}×10ⁿ(1 이상), 최대 = 간격×4. 714 → 간격 200, 최대 800, 눈금 0·200·400·600·800.
// 합계가 모두 0이면(또는 숫자가 아니면) 0 한 줄이다. compact 차트는 ticks의 짝수 번째(0·400·800)만 그린다(StackedBarChart)

const STEPS = [1, 2, 2.5, 5]

export function niceScale(max: number): { max: number; ticks: number[] } {
  if (!(max > 0) || !Number.isFinite(max)) return { max: 0, ticks: [0] }
  const need = max / 4
  // 10ⁿ을 1부터 키워 가며 찾는다(간격은 1 이상). n ≥ 0이라 곱이 정확한 수다
  for (let power = 1; ; power *= 10) {
    const step = STEPS.map((s) => s * power).find((candidate) => candidate >= need)
    if (step !== undefined) return { max: step * 4, ticks: [0, step, step * 2, step * 3, step * 4] }
  }
}
