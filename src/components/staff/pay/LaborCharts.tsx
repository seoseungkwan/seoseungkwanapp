import { TableScroll } from '@/components/staff/TableScroll'
import { monthNumber, ratioText, won } from './format'

// 인건비 그림 둘 (staff AC-7615.9, 시안 pay.html ⑦, dataviz 규칙). 눈금이 다른 두 값(원·%)이라 한 그림에 겹치지 않고 위아래로 나눈다(두 축 금지).
// 위: 지급 합계(아래, chart-4) + 병원 부담분(위, chart-3) 쌓은 막대 — 두 조각 사이 2px 바탕 틈, 맨 위만 4px 둥근 끝, 바닥선에 붙는다.
// 아래: 매출 대비 % 선(2px)과 점(지름 9px, 바탕색 2px 테두리) — 매출 없는 달은 선을 끊고 '매출 자료 없음'.
// 숫자는 보는 달만 그림에 적고, 나머지는 달마다 <title>(마우스를 올리면 보임)과 아래 '달별 숫자 표'가 준다.
// 색은 토큰 클래스(fill-chart-4·fill-chart-3, 글자는 muted·ink)만 쓴다

export type LaborMonth = { month: string; pay: number; employer: number; cost: number; revenue: number | null; ratio: number | null }

const W = 960
const LEFT = 64
const RIGHT = 944
const BAR_W = 40
const GAP = 2 // 쌓은 조각 사이 바탕 틈
const R = 4 // 막대 끝 둥글기

const BARS = { height: 232, top: 20, base: 200 }
const LINE = { height: 132, top: 20, base: 100 }

// 1·2·2.5·5 × 10^k 가운데 x 이상인 가장 작은 값
function niceStep(x: number): number {
  if (!(x > 0)) return 1
  const power = 10 ** Math.floor(Math.log10(x))
  for (const m of [1, 2, 2.5, 5, 10]) if (m * power >= x) return m * power
  return 10 * power
}

// 원 → 눈금 글자: '0' · '500만' · '1,000만' (만 원 밑은 원 그대로)
const manText = (n: number) => (n === 0 ? '0' : n % 10_000 === 0 ? `${won(n / 10_000)}만` : won(n))

// 위만 둥근 막대 조각
function roundedTop(x: number, y: number, w: number, h: number): string {
  const r = Math.min(R, h, w / 2)
  return `M${x} ${y + h}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h}Z`
}

const bandOf = (count: number) => (RIGHT - LEFT) / count
const centerOf = (i: number, count: number) => LEFT + bandOf(count) * (i + 0.5)

export function LaborBars({ months, current }: { months: readonly LaborMonth[]; current: string }) {
  const first = monthNumber(months[0].month)
  const last = monthNumber(months[months.length - 1].month)
  const max = Math.max(0, ...months.map((m) => m.cost))
  const step = niceStep(max / 5)
  const ticks = Array.from({ length: Math.max(1, Math.ceil(max / step)) + 1 }, (_, i) => i * step)
  const top = ticks[ticks.length - 1]
  const y = (value: number) => BARS.base - (value / top) * (BARS.base - BARS.top)
  return (
    <TableScroll label="인건비 막대 그림 (옆으로 밀어 보기)">
      <svg viewBox={`0 0 ${W} ${BARS.height}`} role="img" aria-label={`${first}월부터 ${last}월까지 인건비 막대`} className="block h-auto w-full min-w-160">
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={LEFT} x2={RIGHT} y1={y(tick)} y2={y(tick)} className={tick === 0 ? 'stroke-line-strong' : 'stroke-line'} strokeWidth={1} />
            <text x={LEFT - 8} y={y(tick) + 4} textAnchor="end" className="fill-muted text-caption">
              {manText(tick)}
            </text>
          </g>
        ))}
        {months.map((m, i) => {
          const cx = centerOf(i, months.length)
          const x = cx - BAR_W / 2
          const payTop = y(m.pay)
          const costTop = y(m.cost)
          const payH = BARS.base - payTop
          const employerH = Math.max(0, payTop - costTop - (payH > 0 ? GAP : 0))
          const on = m.month === current
          const name = `${monthNumber(m.month)}월`
          return (
            <g key={m.month}>
              <title>{`${name} 인건비 ${won(m.cost)}원 (지급 합계 ${won(m.pay)}원 + 병원 부담분 ${won(m.employer)}원)`}</title>
              <rect x={LEFT + bandOf(months.length) * i} y={BARS.top - 4} width={bandOf(months.length)} height={BARS.base - BARS.top + 4} fill="transparent" />
              {payH > 0 && (employerH > 0 ? <rect x={x} y={payTop} width={BAR_W} height={payH} className="fill-chart-4" /> : <path d={roundedTop(x, payTop, BAR_W, payH)} className="fill-chart-4" />)}
              {employerH > 0 && <path d={roundedTop(x, costTop, BAR_W, employerH)} className="fill-chart-3" />}
              {on && (
                <text x={cx} y={costTop - 8} textAnchor="middle" className="fill-ink text-small font-semibold">
                  {`${won(m.cost)}원`}
                </text>
              )}
              <text x={cx} y={BARS.base + 20} textAnchor="middle" className={on ? 'fill-ink text-small font-semibold' : 'fill-muted text-small'}>
                {name}
              </text>
            </g>
          )
        })}
      </svg>
    </TableScroll>
  )
}

export function RatioLine({ months, current }: { months: readonly LaborMonth[]; current: string }) {
  const first = monthNumber(months[0].month)
  const last = monthNumber(months[months.length - 1].month)
  const values = months.flatMap((m) => (m.ratio === null ? [] : [m.ratio]))
  const lo = values.length === 0 ? 0 : Math.floor(Math.min(...values))
  const span = values.length === 0 ? 1 : Math.max(1, Math.ceil(Math.max(...values)) - lo)
  const step = span <= 4 ? 1 : niceStep(span / 4)
  const ticks = Array.from({ length: Math.ceil(span / step) + 1 }, (_, i) => lo + i * step)
  const hi = ticks[ticks.length - 1]
  const y = (value: number) => LINE.base - ((value - lo) / (hi - lo)) * (LINE.base - LINE.top)
  // 매출 없는 달에서 끊는 선 조각들
  const segments: string[] = []
  let run: string[] = []
  months.forEach((m, i) => {
    if (m.ratio === null) {
      if (run.length > 1) segments.push(run.join(''))
      run = []
      return
    }
    run.push(`${run.length === 0 ? 'M' : 'L'}${centerOf(i, months.length)} ${y(m.ratio)}`)
  })
  if (run.length > 1) segments.push(run.join(''))
  return (
    <TableScroll label="매출 대비 인건비 % 그림 (옆으로 밀어 보기)">
      <svg viewBox={`0 0 ${W} ${LINE.height}`} role="img" aria-label={`${first}월부터 ${last}월까지 매출 대비 인건비 비율 선`} className="block h-auto w-full min-w-160">
        {values.length > 0 &&
          ticks.map((tick) => (
            <g key={tick}>
              <line x1={LEFT} x2={RIGHT} y1={y(tick)} y2={y(tick)} className="stroke-line" strokeWidth={1} />
              <text x={LEFT - 8} y={y(tick) + 4} textAnchor="end" className="fill-muted text-caption">
                {`${tick}%`}
              </text>
            </g>
          ))}
        {segments.map((d) => (
          <path key={d} d={d} fill="none" strokeWidth={2} strokeLinejoin="round" className="stroke-ink-2" />
        ))}
        {months.map((m, i) => {
          const cx = centerOf(i, months.length)
          const on = m.month === current
          const name = `${monthNumber(m.month)}월`
          return (
            <g key={m.month}>
              {m.ratio === null ? (
                <text x={cx} y={(LINE.top + LINE.base) / 2 + 4} textAnchor="middle" className="fill-muted text-small">
                  매출 자료 없음
                </text>
              ) : (
                <g>
                  <title>{`${name} 매출 대비 ${ratioText(m.ratio)} (인건비 ${won(m.cost)}원 ÷ 매출 ${won(m.revenue ?? 0)}원)`}</title>
                  <rect x={LEFT + bandOf(months.length) * i} y={LINE.top - 8} width={bandOf(months.length)} height={LINE.base - LINE.top + 16} fill="transparent" />
                  <circle cx={cx} cy={y(m.ratio)} r={4.5} strokeWidth={2} className="fill-ink-2 stroke-surface" />
                  {on && (
                    <text x={cx} y={y(m.ratio) - 12} textAnchor="middle" className="fill-ink text-small font-semibold">
                      {ratioText(m.ratio)}
                    </text>
                  )}
                </g>
              )}
              <text x={cx} y={LINE.base + 22} textAnchor="middle" className={on ? 'fill-ink text-small font-semibold' : 'fill-muted text-small'}>
                {name}
              </text>
            </g>
          )
        })}
      </svg>
    </TableScroll>
  )
}
