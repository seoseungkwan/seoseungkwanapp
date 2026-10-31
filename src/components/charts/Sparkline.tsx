// 작은 선 그래프 (b2b-redesign REQ-205 AC-205.2, UI_GUIDE '차트'). 그림은 승인 시안 docs/mockups/b2b-redesign/parts.mjs의 spark다.
// 늘 꾸밈이다(aria-hidden) — 숫자는 옆의 값 글자가 준다. 면(accent-soft) → 선(accent 1.5) → 끝점(accent, 테두리 surface) 순서.
// 색은 토큰 클래스로만 준다(fill·stroke 속성은 none뿐). 서버에서 그대로 그린다(훅·움직임 없음)

const SIZES = { md: { w: 88, h: 28 }, sm: { w: 56, h: 22 } } as const
const PAD = 3

// 그리는 좌표라 버림 규칙과 상관없이 소수 첫째 자리로 적는다
const at = (v: number) => Number(v.toFixed(1))

export function Sparkline({ values, size = 'md' }: { values: number[]; size?: 'md' | 'sm' }) {
  if (values.length < 2) return null
  const { w, h } = SIZES[size]
  const min = Math.min(...values)
  const max = Math.max(...values)
  const x = (i: number) => at(PAD + (i * (w - 2 * PAD)) / (values.length - 1))
  // 값이 모두 같으면 가운데 가로줄
  const y = (v: number) => (max === min ? at(h / 2) : at(h - PAD - ((v - min) / (max - min)) * (h - 2 * PAD)))
  const points = values.map((v, i) => `${x(i)},${y(v)}`)
  const last = values.length - 1

  return (
    <svg aria-hidden="true" width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="block shrink-0">
      <path d={`M${x(0)},${h} L${points.join(' L')} L${x(last)},${h} Z`} className="fill-accent-soft" />
      <polyline points={points.join(' ')} fill="none" strokeWidth="1.5" strokeLinejoin="round" className="stroke-accent" />
      <circle cx={x(last)} cy={y(values[last]!)} r="2.75" strokeWidth="1.5" className="fill-accent stroke-surface" />
    </svg>
  )
}
