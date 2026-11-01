import type { BucketState } from '@/types/analysis'
import { formatCount, percentOf } from './format'
import { niceScale } from './scale'

// 주별 쌓은 막대 (b2b-redesign REQ-205 AC-205.4, design.md '차트 부품', UI_GUIDE '차트'). 그림은 승인 시안 docs/mockups/b2b-redesign/parts.mjs의 barsChart다.
// HTML 막대다: 막대 높이·눈금 위치만 % inline style(height·bottom)이고 글자는 HTML 글자라 칸 폭이 바뀌어도 늘 12px이다.
// 그림 전체는 꾸밈(aria-hidden)이고 숫자는 sr-only 표가 준다. 가로 눈금선만 있다(세로 선·바깥 테두리 없음).
// 집계 중·일부 기간 칸은 한 막대 + 빗금(viewBox 없는 svg 안 path 하나, currentColor) + 1px accent 테두리. 패턴·id를 쓰지 않아 한 쪽에 차트가 둘이어도 겹치지 않는다.
// 서버에서 그대로 그린다(훅·움직임 없음). 색은 토큰 클래스로만 준다

export type BarSeries = { name: string; tone: 'accent' | 'chart-3' } // 첫 계열이 맨 위·범례 첫째
export type BarBucket = { key: string; label: string; rangeLabel: string; state: BucketState; values: number[]; note?: string }

// dense: 칸이 많은 그림용. 막대 위 합계·상태 글자를 그리지 않는다(화면 읽기 표는 그대로, tab-frame REQ-314). 아래 날짜 글자는 부르는 쪽이 label로 고른다(빈 label = 빈칸)
// thinLabels: 768px 미만에서 날짜 글자를 하나 걸러 보인다(0부터 홀수 번째 칸 글자만 max-md:invisible, 자리는 그대로. ui-90 AC-421.2).
// 주지 않으면 지금 그림과 한 글자도 다르지 않다
type Props = {
  title: string
  unit: string
  series: BarSeries[]
  buckets: BarBucket[]
  compact?: boolean
  dense?: boolean
  thinLabels?: boolean
}

const TONE: Record<BarSeries['tone'], string> = { accent: 'bg-accent', 'chart-3': 'bg-chart-3' }
const STATE_TEXT: Record<BucketState, string> = { complete: '완료', 'in-progress': '집계 중', partial: '일부 기간' }

// 그림 칸 높이(400px 이하 — 빗금 마지막 선 k = 440이 폭 40px까지 덮는다)·눈금 글자 칸 폭(기간 글자 줄도 같은 폭만큼 띄운다)·막대 최대 폭·단위 줄과 그림 칸 사이.
// 띄우는 값은 간격 단계 안에서 고른다(UI_GUIDE '간격')
const SIZE = {
  md: { plot: 'h-55', axis: 'w-12', labels: 'pl-12', bar: 'max-w-10', gap: 'mt-4' },
  sm: { plot: 'h-40', axis: 'w-8', labels: 'pl-8', bar: 'max-w-5', gap: 'mt-1.5' },
} as const

// 빗금: 45° 선을 4px 간격으로 M0 k L k 0 (k = 4, 8, …, 440). viewBox가 없어 1단위 = 1px이고 svg 밖은 잘린다
const HATCH_GAP = 4
const HATCH_REACH = 440 // 막대 최대 폭 40px + 그림 칸 최대 높이 400px
const HATCH = Array.from({ length: HATCH_REACH / HATCH_GAP }, (_, i) => HATCH_GAP * (i + 1))
  .map((k) => `M0 ${k} L${k} 0`)
  .join(' ')

// 눈금 글자: 정수는 세 자리 쉼표, 간격 2.5(최대 10)의 2.5·7.5는 그대로
const tickText = (t: number) => (Number.isInteger(t) ? formatCount(t) : String(t))
const at = (v: number, max: number) => `${percentOf(v, max)}%`

export function StackedBarChart({ title, unit, series, buckets, compact = false, dense = false, thinLabels = false }: Props) {
  const size = SIZE[compact ? 'sm' : 'md']
  const totals = buckets.map((b) => series.reduce((sum, _, i) => sum + (b.values[i] ?? 0), 0))
  const scale = niceScale(Math.max(0, ...totals))
  // compact는 눈금 가운데 짝수 번째(0·400·800)만
  const ticks = compact ? scale.ticks.filter((_, i) => i % 2 === 0) : scale.ticks
  const lastComplete = buckets.findLastIndex((b) => b.state === 'complete')

  return (
    <div>
      <div aria-hidden="true" className="tabular-nums">
        <p className="text-caption text-muted">({unit})</p>
        <div className={`flex ${size.gap}`}>
          <div className={`relative shrink-0 ${size.axis}`}>
            {ticks.map((t) => (
              <span
                key={t}
                className="absolute right-2 translate-y-1/2 whitespace-nowrap text-caption text-muted"
                style={{ bottom: at(t, scale.max) }}
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
                style={{ bottom: at(t, scale.max) }}
              />
            ))}
            <div className="absolute inset-0 flex">
              {buckets.map((bucket, i) => (
                <div key={bucket.key} className="flex h-full min-w-0 flex-1 items-end justify-center">
                  <Bar
                    bucket={bucket}
                    series={series}
                    total={totals[i]!}
                    max={scale.max}
                    width={size.bar}
                    compact={compact}
                    dense={dense}
                    strong={i === lastComplete}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className={`flex ${size.labels}`}>
          {buckets.map((bucket, i) => (
            <div key={bucket.key} className="min-w-0 flex-1 text-center text-caption text-muted">
              <p className={thinLabels && i % 2 === 1 ? 'mt-2 max-md:invisible' : 'mt-2'}>{bucket.label}</p>
              {!compact && bucket.note && <p>{bucket.note}</p>}
            </div>
          ))}
        </div>
      </div>
      <table className="sr-only">
        <caption>
          {title} ({unit})
        </caption>
        <thead>
          <tr>
            <th scope="col">기간</th>
            {series.map((s, i) => (
              <th key={i} scope="col">
                {s.name}
              </th>
            ))}
            <th scope="col">합계</th>
            <th scope="col">상태</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((bucket, i) => (
            <tr key={bucket.key}>
              <th scope="row">{bucket.rangeLabel}</th>
              {series.map((_, j) => (
                <td key={j}>{formatCount(bucket.values[j] ?? 0)}</td>
              ))}
              <td>{formatCount(totals[i]!)}</td>
              <td>{STATE_TEXT[bucket.state]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

type BarProps = {
  bucket: BarBucket
  series: BarSeries[]
  total: number
  max: number
  width: string
  compact: boolean
  dense: boolean // 막대 위 글자 없음
  strong: boolean // 마지막 complete 칸: 합계 600 ink
}

// 칸 하나의 막대(폭은 칸의 반, 최대 40px·compact 20px). 합계 글자는 막대 바로 위에 띄운다(기본 크기의 집계 중·일부 기간은 그 위에 상태 글자)
function Bar({ bucket, series, total, max, width, compact, dense, strong }: BarProps) {
  const label = dense ? null : (
    <span className="absolute bottom-full left-1/2 mb-1 flex -translate-x-1/2 flex-col items-center whitespace-nowrap text-caption">
      {!compact && bucket.state !== 'complete' && <span className="text-muted">{STATE_TEXT[bucket.state]}</span>}
      <span className={strong ? 'font-semibold text-ink' : 'text-ink-2'}>{formatCount(total)}</span>
    </span>
  )

  if (bucket.state !== 'complete') {
    return (
      <div className={`relative w-1/2 ${width} border border-accent bg-surface`} style={{ height: at(total, max) }}>
        <svg aria-hidden="true" className="absolute inset-0 size-full text-accent">
          <path d={HATCH} fill="none" stroke="currentColor" strokeWidth="1" />
        </svg>
        {label}
      </div>
    )
  }

  // 첫 계열이 맨 위(flex-col 첫째), 계열 사이 2px. 0인 계열은 그리지 않는다(빈 틈이 생기지 않게)
  return (
    <div className={`relative flex w-1/2 ${width} flex-col gap-0.5`} style={{ height: at(total, max) }}>
      {label}
      {series.map((s, i) => {
        const value = bucket.values[i] ?? 0
        return value > 0 ? <div key={i} className={`w-full ${TONE[s.tone]}`} style={{ height: at(value, total) }} /> : null
      })}
    </div>
  )
}
