// 도넛 (first90 REQ-4412 AC-4412.1, design.md 5-4, UI_GUIDE '통계 화면(first90)'). 그림은 승인 시안 docs/mockups/first90/redesign.html의 .s-donut이다.
// 그림 전체는 꾸밈(aria-hidden)이다 — 화면 읽기용 값은 부르는 쪽의 범례 글이 준다. 서버에서 그대로 그린다(훅 없음). 색은 토큰 클래스(currentColor)로만 준다.
// 원 둘레가 100(r = 50/π)이라 조각 길이 = 비율(%)이다. 조각은 위(12시)부터 시계 방향이고, 조각이 둘 이상이면 사이 0.6을 띄운다(시안 len − 2 / 326.73).
// motion(통계 화면): svg에 st-donut, 조각에 seg·st-move-period를 붙인다 → 처음 붙을 때 한 번 450ms 그려지고(st-donut), 값이 바뀌면 300ms 옮긴다.
// 움직임은 globals.css가 한다. 주지 않으면 움직이지 않는 도넛이다

export type DonutTone = 'accent' | 'f90' | 'ret'
export type DonutSlice = { name: string; value: number; tone: DonutTone }

type Props = {
  slices: DonutSlice[]
  center: [string, string] // 가운데 두 줄(예: '누적 내원' / '2,408건')
  motion?: boolean
}

const TONE: Record<DonutTone, string> = { accent: 'text-accent', f90: 'text-st-f90', ret: 'text-st-ret' }
const R = '15.9155' // 50/π → 둘레 100
const WIDTH = '5.4' // 고리 두께(시안 viewBox 140의 18 = 42의 5.4)
const GAP = 0.6
const round = (v: number) => Number(v.toFixed(2))

// 조각 [시작, 길이](둘레 100 기준). 0·음수 조각은 없다
function arcsOf(slices: DonutSlice[]): Array<{ slice: DonutSlice; start: number; length: number }> {
  const drawn = slices.filter((s) => s.value > 0)
  const total = drawn.reduce((sum, s) => sum + s.value, 0)
  if (!(total > 0)) return []
  const gap = drawn.length > 1 ? GAP : 0
  let start = 0
  return drawn.map((slice) => {
    const share = (slice.value / total) * 100
    const arc = { slice, start, length: Math.max(0, share - gap) }
    start += share
    return arc
  })
}

export function DonutChart({ slices, center, motion = false }: Props) {
  return (
    <div aria-hidden="true" className="relative size-40 shrink-0 max-md:size-31">
      <svg aria-hidden="true" viewBox="0 0 42 42" className={`size-full${motion ? ' st-donut' : ''}`}>
        <circle cx="21" cy="21" r={R} fill="none" stroke="currentColor" strokeWidth={WIDTH} className="text-st-h0" />
        <g transform="rotate(-90 21 21)">
          {arcsOf(slices).map(({ slice, start, length }) => (
            <circle
              key={slice.name}
              cx="21"
              cy="21"
              r={R}
              fill="none"
              stroke="currentColor"
              strokeWidth={WIDTH}
              strokeDasharray={`${round(length)} ${round(100 - length)}`}
              strokeDashoffset={start === 0 ? 0 : -round(start)}
              className={`${TONE[slice.tone]}${motion ? ' seg st-move-period' : ''}`}
            />
          ))}
        </g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-caption font-semibold text-st-ink-2">{center[0]}</span>
        <span className="text-st-22 leading-7 font-semibold text-st-ink tabular-nums">{center[1]}</span>
      </div>
    </div>
  )
}
