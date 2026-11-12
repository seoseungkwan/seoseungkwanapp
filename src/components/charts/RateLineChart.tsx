import { percentOf, truncatedOne } from './format'
import { niceScale } from './scale'
import { plotY, SIZE, STATE_TEXT, tickText, TrendLine, type ChartTrend } from './StackedBarChart'

// 총환자 대비 꺾은선 (group-exclude REQ-3709 AC-3709.4·AC-3709.8, design.md '그래프 부품'). 모양은 승인 시안 docs/mockups/group-exclude/index.html의 polyline·.dot이다.
// 틀은 StackedBarChart compact와 같다: '(%)' 단위 줄, niceScale 눈금(짝수 번째만), 가로 눈금선, 아래 기간 글자(thinLabels면 휴대폰에서 하나 걸러).
// 선: 값 있는 점을 차례로 잇는 accent 2px polyline(값 없는 칸은 건너 이음). 그림 칸을 채우는 svg(viewBox 0 0 {칸 수} 100, 늘려 맞춤, 굵기는 그대로).
// 점: 칸마다 HTML 자리(bottom %) 안 8px 원(accent 면 + 2px surface 테두리). 원 모양은 svg circle이 준다(모서리 클래스는 토큰 둘뿐이라 둥근 클래스를 쓰지 않는다).
// dense가 아니면 점 위에 'x.x%'(소수 첫째 자리까지 버림). 추세선은 막대 그림과 같은 TrendLine이고 눈금은 점 값으로만 잡는다.
// 그림 전체는 꾸밈(aria-hidden)이고 숫자는 sr-only 표 '기간 | 총환자 대비 | 상태'가 준다(값 없으면 '–'). 서버에서 그대로 그린다(훅·움직임 없음). 색은 토큰 클래스로만 준다

// value: 총환자 대비 %(0~100). null = 총환자 0인 칸(점 없음)
export type RatePoint = { key: string; label: string; rangeLabel: string; value: number | null; partial: boolean }

type Props = {
  title: string
  points: RatePoint[]
  trend?: ChartTrend | null
  dense?: boolean
  thinLabels?: boolean
}

const size = SIZE.sm
const rateText = (value: number) => `${truncatedOne(value)}%`

export function RateLineChart({ title, points, trend = null, dense = false, thinLabels = false }: Props) {
  const valued = points.flatMap((point, at) => (point.value === null ? [] : [{ at, value: point.value }]))
  const scale = niceScale(Math.max(0, ...valued.map((p) => p.value)))
  const ticks = scale.ticks.filter((_, i) => i % 2 === 0)
  const line = valued.map((p) => `${p.at + 0.5},${plotY(p.value, scale.max)}`).join(' ')

  return (
    <div>
      <div aria-hidden="true" className="tabular-nums">
        <p className="text-caption text-muted">(%)</p>
        <div className={`flex ${size.gap}`}>
          <div className={`relative shrink-0 ${size.axis}`}>
            {ticks.map((t) => (
              <span
                key={t}
                className="absolute right-2 translate-y-1/2 whitespace-nowrap text-caption text-muted"
                style={{ bottom: `${percentOf(t, scale.max)}%` }}
              >
                {tickText(t)}
              </span>
            ))}
          </div>
          <div className={`relative min-w-0 flex-1 ${size.plot}`}>
            {ticks.map((t) => (
              <div
                key={t}
                className={`absolute inset-x-0 h-px ${t === 0 ? 'bg-line-strong' : 'bg-line'}`}
                style={{ bottom: `${percentOf(t, scale.max)}%` }}
              />
            ))}
            {valued.length >= 2 && (
              <svg aria-hidden="true" viewBox={`0 0 ${points.length} 100`} preserveAspectRatio="none" className="absolute inset-0 size-full">
                <polyline
                  points={line}
                  fill="none"
                  strokeWidth="2"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                  className="stroke-accent"
                />
              </svg>
            )}
            {trend && <TrendLine trend={trend} cells={points.length} max={scale.max} />}
            <div className="absolute inset-0 flex">
              {points.map((point) => (
                <div key={point.key} className="relative h-full min-w-0 flex-1">
                  {point.value !== null && (
                    <div className="absolute inset-x-0 h-0" style={{ bottom: `${percentOf(point.value, scale.max)}%` }}>
                      <svg
                        aria-hidden="true"
                        width="8"
                        height="8"
                        viewBox="0 0 8 8"
                        className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2"
                      >
                        <circle cx="4" cy="4" r="3" strokeWidth="2" className="fill-accent stroke-surface" />
                      </svg>
                      {!dense && (
                        <span className="absolute bottom-0 left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap text-caption text-ink-2">
                          {rateText(point.value)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className={`flex ${size.labels}`}>
          {points.map((point, i) => (
            <div key={point.key} className="min-w-0 flex-1 text-center text-caption text-muted">
              <p className={thinLabels && i % 2 === 1 ? 'mt-2 max-md:invisible' : 'mt-2'}>{point.label}</p>
            </div>
          ))}
        </div>
      </div>
      {/* 표의 sr-only만으로는 1px 제한이 안 먹어 줄 수만큼 길어진다. 감싼 칸이 잘라 준다(StackedBarChart와 같다, AC-601.18) */}
      <div className="sr-only">
        <table className="sr-only">
          <caption>{`${title} (%)`}</caption>
          <thead>
            <tr>
              <th scope="col">기간</th>
              <th scope="col">총환자 대비</th>
              <th scope="col">상태</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.key}>
                <th scope="row">{point.rangeLabel}</th>
                <td>{point.value === null ? '–' : rateText(point.value)}</td>
                <td>{STATE_TEXT[point.partial ? 'partial' : 'complete']}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
