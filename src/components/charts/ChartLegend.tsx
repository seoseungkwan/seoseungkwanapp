// 범례 (b2b-redesign REQ-205 AC-205.5, design.md '차트 부품', UI_GUIDE '차트'). 모양은 승인 시안 docs/mockups/b2b-redesign/style.css의 .legend·.sw다.
// <ul> 안에 항목마다 색 표시(꾸밈, aria-hidden) + 이름(small ink-2), 항목 사이 16px. 상자가 아니다(테두리 없음).
// 빗금 표시는 쌓은 막대의 집계 중 막대와 같은 모양(accent 1px 테두리 + 45° 선)을 패턴 없이 선 세 개로 그린다. 서버에서 그대로 그린다
// hatch-warning은 쌓은 막대의 구분 없음 조각과 같은 색이고 그림은 같다(rx-picker AC-805.3)
// trend는 추세선(가로 12px 점선 ink, 패턴 없이 svg 선 하나), line은 총환자 대비 꺾은선(가로 12px · 2px accent 선)이다(group-exclude AC-3709.3·AC-3709.4)

// 통계 화면(first90 design.md 5-4): f90·ret = 90일초진·재진 색 칸, rough = 참고 금액 빗금(st-ref-2 바탕 + st-ref 선), unchecked = 확인 필요한 날 점선 칸.
// 쌓은 막대 계열 tone을 그대로 범례 표시로 넘길 수 있다
export type LegendItem = { label: string; mark: 'accent' | 'chart-3' | 'hatch' | 'hatch-warning' | 'prev' | 'trend' | 'line' | 'f90' | 'ret' | 'rough' | 'unchecked' }

// 면 표시 10×10, 지난 기간은 세로 막대 2×12, 꺾은선은 가로 선 12×2
const FILL: Record<Exclude<LegendItem['mark'], 'hatch' | 'hatch-warning' | 'trend' | 'rough'>, string> = {
  accent: 'size-2.5 bg-accent',
  'chart-3': 'size-2.5 bg-chart-3',
  prev: 'h-3 w-0.5 bg-faint',
  line: 'h-0.5 w-3 bg-accent',
  f90: 'size-2.5 bg-st-f90',
  ret: 'size-2.5 bg-st-ret',
  unchecked: 'size-2.5 border border-dashed border-st-line-2 bg-warning-soft',
}

const HATCH_COLOR = { hatch: 'text-accent', 'hatch-warning': 'bg-warning-soft text-warning' } as const

export function ChartLegend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {items.map((item, i) => (
        <li key={i} className="flex items-center gap-1.5 whitespace-nowrap">
          {item.mark === 'hatch' || item.mark === 'hatch-warning' ? (
            <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" className={`shrink-0 ${HATCH_COLOR[item.mark]}`}>
              <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
              <path d="M0 6 L6 0 M0 10 L10 0 M4 10 L10 4" fill="none" stroke="currentColor" strokeWidth="1" />
            </svg>
          ) : item.mark === 'rough' ? (
            <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" className="shrink-0 bg-st-ref-2 text-st-ref">
              <path d="M0 6 L6 0 M0 10 L10 0 M4 10 L10 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          ) : item.mark === 'trend' ? (
            <svg aria-hidden="true" width="12" height="2" viewBox="0 0 12 2" className="shrink-0 text-ink">
              <line x1="0" y1="1" x2="12" y2="1" stroke="currentColor" strokeWidth="2" strokeDasharray="3 2" />
            </svg>
          ) : (
            <span aria-hidden="true" className={`shrink-0 ${FILL[item.mark]}`} />
          )}
          <span className="text-small text-ink-2">{item.label}</span>
        </li>
      ))}
    </ul>
  )
}
