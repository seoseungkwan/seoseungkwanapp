import type { BucketState } from '@/types/analysis'
import { formatCount, percentOf } from './format'
import { niceScale } from './scale'

// 주별 쌓은 막대 (b2b-redesign REQ-205 AC-205.4, design.md '차트 부품', UI_GUIDE '차트'). 그림은 승인 시안 docs/mockups/b2b-redesign/parts.mjs의 barsChart다.
// HTML 막대다: 막대 높이·눈금 위치만 % inline style(height·bottom)이고 글자는 HTML 글자라 칸 폭이 바뀌어도 늘 12px이다.
// 그림 전체는 꾸밈(aria-hidden)이고 숫자는 sr-only 표가 준다. 가로 눈금선만 있다(세로 선·바깥 테두리 없음).
// 집계 중·일부 기간 칸은 한 막대 + 빗금(viewBox 없는 svg 안 path 하나, currentColor) + 1px accent 테두리. 패턴·id를 쓰지 않아 한 쪽에 차트가 둘이어도 겹치지 않는다.
// 서버에서 그대로 그린다(훅·움직임 없음). 색은 토큰 클래스로만 준다

// hatch-warning: 구분 없음 조각(rx-picker AC-806.4). warning-soft 바탕 + 1px warning 테두리(시안 .s-gap) + text-warning 빗금이다
// 통계 화면(first90 design.md 5-4): f90 = 90일초진(bg-st-f90), ret = 재진(bg-st-ret), rough = 참고 금액(st-ref-2 바탕 + text-st-ref 3px 빗금 svg, 그라데이션 없음)
export type BarSeries = { name: string; tone: 'accent' | 'chart-3' | 'hatch-warning' | 'f90' | 'ret' | 'rough' } // 첫 계열이 맨 위·범례 첫째
// comparison: 칸마다 줄 수 있는 비교 기간 값(stats REQ-513 AC-513.2). 숫자면 쌓은 막대 왼쪽에 가는 faint 막대를 그리고 눈금에 넣는다. null·없음은 막대가 없다.
// 숫자인 칸이 하나도 없으면 그림·표가 지금과 한 글자도 다르지 않다. 하나라도 있으면 화면 읽기 표에 "비교 기간" 칸 하나가 붙는다(null은 "–")
// blank: 빈 칸(stats-period AC-1704.3). 'no-data' = 자료 없는 칸이라 막대·합계 자리에 '–'(muted)이고 화면 읽기 표도 계열·합계·상태가 '–'다(0이 아니다).
// 'future' = 앞으로 올 칸이라 아래 기간 글자만 있고 화면 읽기 표에 없다. 빈 칸의 값·비교 값은 그리지 않고 눈금·굵은 합계에 넣지 않는다.
// mark: 'unchecked' = 확인 필요한 날(first90 AC-4408.3). 막대 대신 점선 칸(칸 높이의 반) + 칸 위 글 "확인 필요"이고, 화면 읽기 표는 계열·합계가 '–'·상태 "확인 필요"다.
// 값은 그리지 않고 눈금·굵은 합계에 넣지 않는다.
// 주지 않으면 지금 그림과 한 글자도 다르지 않다
export type BarBucket = {
  key: string
  label: string
  rangeLabel: string
  state: BucketState
  values: number[]
  note?: string
  comparison?: number | null
  blank?: 'no-data' | 'future'
  mark?: 'unchecked'
}

// dense: 칸이 많은 그림용. 막대 위 합계·상태 글자를 그리지 않는다(화면 읽기 표는 그대로, tab-frame REQ-314). 아래 날짜 글자는 부르는 쪽이 label로 고른다(빈 label = 빈칸)
// thinLabels: 768px 미만에서 날짜 글자를 하나 걸러 보인다(0부터 홀수 번째 칸 글자만 max-md:invisible, 자리는 그대로. ui-90 AC-421.2).
// hideZeroTotals: 합계 0인 칸은 막대 위 글자(합계·상태)를 그리지 않는다. 화면 읽기 표는 그대로다(rx-picker AC-806.7).
// srTable: false면 화면 읽기 표(와 감싼 칸)를 그리지 않는다 — 부르는 쪽이 같은 숫자의 보이는 표(ChartTable)를 펼친 동안(dashboard-ux AC-2706.1, 두 번 읽히지 않게).
// trend: 막대 위 점선 추세선(group-exclude AC-3709.3). 그림 칸 안 svg 하나(TrendLine)만 더한다. 눈금은 막대로만 잡는다.
// 통계 화면(first90 design.md 5-4) — 움직임은 globals.css가 하고 여기는 이름만 붙인다(훅 없음):
// motion: 막대·조각·비교 막대에 st-move-period(높이 300ms), 빗금(rough) 조각에 st-rise(솟음 200ms).
// selected: 고른 칸 키. 그 칸 바탕이 옅은 파랑(bg-accent-soft)이다.
// onPick: 칸을 누르거나 올리면 그 칸 키로 부른다. 칸(앞으로 올 칸 빼고)이 type="button"·tabIndex -1 단추가 되고(그림은 aria-hidden 그대로, 숫자는 화면 읽기 표),
// 막대 위 숫자·"확인 필요"는 768px 이상에서만 보인다(AC-4412.2). 고른 칸 상태와 아래 줄 글은 부르는 쪽이 갖는다.
// 주지 않으면 지금 그림과 한 글자도 다르지 않다
type Props = {
  title: string
  unit: string
  series: BarSeries[]
  buckets: BarBucket[]
  compact?: boolean
  dense?: boolean
  thinLabels?: boolean
  hideZeroTotals?: boolean
  srTable?: boolean
  trend?: ChartTrend | null
  motion?: boolean
  selected?: string
  onPick?: (key: string) => void
}

const TONE: Record<BarSeries['tone'], string> = {
  accent: 'bg-accent',
  'chart-3': 'bg-chart-3',
  'hatch-warning': 'relative border border-warning bg-warning-soft',
  f90: 'bg-st-f90',
  ret: 'bg-st-ret',
  rough: 'relative bg-st-ref-2',
}
// 칸 상태 글. 보이는 표(ChartTable)도 같은 글을 쓴다
export const STATE_TEXT: Record<BucketState, string> = { complete: '완료', 'in-progress': '집계 중', partial: '일부 기간' }
// 확인 필요한 날 칸(mark 'unchecked')의 글
const UNCHECKED_TEXT = '확인 필요'

// 그림 칸 높이(400px 이하 — 빗금 마지막 선 k = 440이 폭 40px까지 덮는다)·눈금 글자 칸 폭(기간 글자 줄도 같은 폭만큼 띄운다)·막대 최대 폭·단위 줄과 그림 칸 사이.
// 띄우는 값은 간격 단계 안에서 고른다(UI_GUIDE '간격')
export const SIZE = {
  md: { plot: 'h-55', axis: 'w-12', labels: 'pl-12', bar: 'max-w-10', gap: 'mt-4' },
  sm: { plot: 'h-40', axis: 'w-8', labels: 'pl-8', bar: 'max-w-5', gap: 'mt-1.5' },
} as const

// 빗금: 45° 선을 4px 간격으로 M0 k L k 0 (k = 4, 8, …, 440). viewBox가 없어 1단위 = 1px이고 svg 밖은 잘린다
const HATCH_REACH = 440 // 막대 최대 폭 40px + 그림 칸 최대 높이 400px
const hatchPath = (gap: number) =>
  Array.from({ length: HATCH_REACH / gap }, (_, i) => gap * (i + 1))
    .map((k) => `M0 ${k} L${k} 0`)
    .join(' ')
const HATCH = hatchPath(4)
// 참고 금액 빗금(rough): 8px 간격 3px 선 — 시안 .k-ref(3px 줄무늬)를 svg로 그린다
const ROUGH_HATCH = hatchPath(8)

// 눈금 글자: 정수는 세 자리 쉼표, 간격 2.5(최대 10)의 2.5·7.5는 그대로
export const tickText = (t: number) => (Number.isInteger(t) ? formatCount(t) : String(t))
const at = (v: number, max: number) => `${percentOf(v, max)}%`

// 추세선 (group-exclude REQ-3709 AC-3709.3·AC-3709.4, design.md '그래프 부품'). 막대 그림과 꺾은선 그림(RateLineChart)이 같이 쓴다.
// 그림 칸(relative)을 채우는 svg 하나: viewBox 0 0 {칸 수} 100을 늘려 맞추고(preserveAspectRatio none) 선 굵기는 늘리지 않는다(vector-effect).
// x = 칸 자리 + 0.5(칸 가운데), y = 100 − 값 ÷ 눈금 최대 × 100(소수 둘째 자리). 눈금 밖 값은 자르지 않고 그대로 둔다 → svg 밖으로 나간 선은 잘린다.
// 눈금 최대가 0이면(값이 모두 0) 맨 아래다. 점선 6 4 · 2px · ink. 색은 토큰 클래스로만 준다
export type ChartTrend = { from: { at: number; value: number }; to: { at: number; value: number } }
// 그림 칸 svg의 y(꺾은선 RateLineChart도 쓴다)
export const plotY = (value: number, max: number) => (max > 0 ? Number((100 - (value / max) * 100).toFixed(2)) : 100)
export function TrendLine({ trend, cells, max }: { trend: ChartTrend; cells: number; max: number }) {
  return (
    <svg aria-hidden="true" viewBox={`0 0 ${cells} 100`} preserveAspectRatio="none" className="absolute inset-0 size-full">
      <line
        x1={trend.from.at + 0.5}
        y1={plotY(trend.from.value, max)}
        x2={trend.to.at + 0.5}
        y2={plotY(trend.to.value, max)}
        strokeWidth="2"
        strokeDasharray="6 4"
        vectorEffect="non-scaling-stroke"
        className="stroke-ink"
      />
    </svg>
  )
}

// 빗금 svg 하나. 부모(relative)를 채우고 색은 color의 text-* 클래스가 준다
function HatchLines({ color, d = HATCH, width = '1' }: { color: string; d?: string; width?: string }) {
  return (
    <svg aria-hidden="true" className={`absolute inset-0 size-full ${color}`}>
      <path d={d} fill="none" stroke="currentColor" strokeWidth={width} />
    </svg>
  )
}

export function StackedBarChart({
  title,
  unit,
  series,
  buckets,
  compact = false,
  dense = false,
  thinLabels = false,
  hideZeroTotals = false,
  srTable = true,
  trend = null,
  motion = false,
  selected,
  onPick,
}: Props) {
  const size = SIZE[compact ? 'sm' : 'md']
  const totals = buckets.map((b) => series.reduce((sum, _, i) => sum + (b.values[i] ?? 0), 0))
  // 눈금·비교 막대·굵은 합계는 진짜 칸(blank 없음)만으로 잡는다. 확인 필요한 칸(mark)의 값은 눈금·굵은 합계에 넣지 않는다
  const comparisons = buckets.flatMap((b) => (!b.blank && typeof b.comparison === 'number' ? [b.comparison] : []))
  const compared = comparisons.length > 0
  const scale = niceScale(Math.max(0, ...totals.filter((_, i) => !buckets[i]!.blank && !buckets[i]!.mark), ...comparisons))
  // compact는 눈금 가운데 짝수 번째(0·400·800)만
  const ticks = compact ? scale.ticks.filter((_, i) => i % 2 === 0) : scale.ticks
  const lastComplete = buckets.findLastIndex((b) => b.state === 'complete' && !b.blank && !b.mark)
  const move = motion ? ' st-move-period' : ''
  // onPick이 있으면(통계 화면) 막대 위 글은 768px 이상에서만 보인다
  const labelScreen = onPick ? ' max-md:hidden' : ''

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
              {buckets.map((bucket, i) => {
                const picked = bucket.key === selected
                const column = `flex h-full min-w-0 flex-1 items-end justify-center${compared ? ' gap-0.5' : ''}${picked ? ' bg-accent-soft' : ''}`
                const content =
                  bucket.blank === 'no-data' ? (
                    <span className="mb-1 text-caption text-muted">–</span>
                  ) : bucket.blank === 'future' ? null : (
                    <>
                      {typeof bucket.comparison === 'number' && (
                        <div className={`w-1/6 max-w-2.5 bg-faint${move}`} style={{ height: at(bucket.comparison, scale.max) }} />
                      )}
                      {bucket.mark === 'unchecked' ? (
                        <UncheckedBox width={size.bar} noLabel={dense} labelScreen={labelScreen} />
                      ) : (
                        <Bar
                          bucket={bucket}
                          series={series}
                          total={totals[i]!}
                          max={scale.max}
                          width={size.bar}
                          compact={compact}
                          noLabel={dense || (hideZeroTotals && totals[i] === 0)}
                          strong={i === lastComplete}
                          motion={motion}
                          labelScreen={labelScreen}
                        />
                      )}
                    </>
                  )
                // 고르는 칸: 그림 안 단추(탭 순서 밖). 화면 읽기는 아래 표가 맡는다
                return onPick && bucket.blank !== 'future' ? (
                  <button
                    key={bucket.key}
                    type="button"
                    tabIndex={-1}
                    className={`${column} cursor-pointer${picked ? '' : ' hover:bg-accent-soft/60'}`}
                    onClick={() => onPick(bucket.key)}
                    onMouseEnter={() => onPick(bucket.key)}
                  >
                    {content}
                  </button>
                ) : (
                  <div key={bucket.key} className={column}>
                    {content}
                  </div>
                )
              })}
            </div>
            {trend && <TrendLine trend={trend} cells={buckets.length} max={scale.max} />}
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
      {/* 표의 sr-only만으로는 1px 제한이 안 먹어 줄 수만큼 길어지고 쪽 아래에 빈 곳을 만든다. 감싼 칸이 잘라 준다(AC-601.18) */}
      {srTable && (
        <div className="sr-only">
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
                {compared && <th scope="col">비교 기간</th>}
              </tr>
            </thead>
            <tbody>
              {buckets.map((bucket, i) => {
                if (bucket.blank === 'future') return null
                const noData = bucket.blank === 'no-data'
                const unchecked = !noData && bucket.mark === 'unchecked'
                return (
                  <tr key={bucket.key}>
                    <th scope="row">{bucket.rangeLabel}</th>
                    {series.map((_, j) => (
                      <td key={j}>{noData || unchecked ? '–' : formatCount(bucket.values[j] ?? 0)}</td>
                    ))}
                    <td>{noData || unchecked ? '–' : formatCount(totals[i]!)}</td>
                    <td>{noData ? '–' : unchecked ? UNCHECKED_TEXT : STATE_TEXT[bucket.state]}</td>
                    {compared && <td>{!noData && typeof bucket.comparison === 'number' ? formatCount(bucket.comparison) : '–'}</td>}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// 확인 필요한 날 칸: 막대 대신 점선 칸(칸 높이의 반, 옅은 노랑 바탕) + 칸 위 글 "확인 필요"(dense면 글 없음). 높이가 값을 뜻하지 않게 늘 같다
function UncheckedBox({ width, noLabel, labelScreen }: { width: string; noLabel: boolean; labelScreen: string }) {
  return (
    <div className={`relative h-1/2 w-1/2 ${width} border border-dashed border-st-line-2 bg-warning-soft`}>
      {!noLabel && (
        <span className={`absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap text-caption font-semibold text-st-warn-ink${labelScreen}`}>
          {UNCHECKED_TEXT}
        </span>
      )}
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
  noLabel: boolean // 막대 위 글자 없음
  strong: boolean // 마지막 complete 칸: 합계 600 ink
  motion: boolean // 막대·조각 st-move-period, 빗금(rough) 조각 st-rise
  labelScreen: string // 막대 위 글자에 더할 화면 폭 클래스(통계 화면 ' max-md:hidden', 아니면 '')
}

// 칸 하나의 막대(폭은 칸의 반, 최대 40px·compact 20px). 합계 글자는 막대 바로 위에 띄운다(기본 크기의 집계 중·일부 기간은 그 위에 상태 글자)
function Bar({ bucket, series, total, max, width, compact, noLabel, strong, motion, labelScreen }: BarProps) {
  const move = motion ? ' st-move-period' : ''
  const label = noLabel ? null : (
    <span className={`absolute bottom-full left-1/2 mb-1 flex -translate-x-1/2 flex-col items-center whitespace-nowrap text-caption${labelScreen}`}>
      {!compact && bucket.state !== 'complete' && <span className="text-muted">{STATE_TEXT[bucket.state]}</span>}
      <span className={strong ? 'font-semibold text-ink' : 'text-ink-2'}>{formatCount(total)}</span>
    </span>
  )

  if (bucket.state !== 'complete') {
    return (
      <div className={`relative w-1/2 ${width} border border-accent bg-surface${move}`} style={{ height: at(total, max) }}>
        <HatchLines color="text-accent" />
        {label}
      </div>
    )
  }

  // 첫 계열이 맨 위(flex-col 첫째), 계열 사이 2px. 0인 계열은 그리지 않는다(빈 틈이 생기지 않게)
  return (
    <div className={`relative flex w-1/2 ${width} flex-col gap-0.5${move}`} style={{ height: at(total, max) }}>
      {label}
      {series.map((s, i) => {
        const value = bucket.values[i] ?? 0
        return value > 0 ? (
          <div key={i} className={`w-full ${TONE[s.tone]}${move}${motion && s.tone === 'rough' ? ' st-rise' : ''}`} style={{ height: at(value, total) }}>
            {s.tone === 'hatch-warning' && <HatchLines color="text-warning" />}
            {s.tone === 'rough' && <HatchLines color="text-st-ref" d={ROUGH_HATCH} width="3" />}
          </div>
        ) : null
      })}
    </div>
  )
}
