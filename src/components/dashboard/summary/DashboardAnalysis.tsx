'use client'

import { useId, useState, type ReactNode } from 'react'
import { ChartLegend, type LegendItem } from '@/components/charts/ChartLegend'
import { formatDelta, formatRate, percentOf } from '@/components/charts/format'
import { KpiStat } from '@/components/charts/KpiStat'
import { RankedBars } from '@/components/charts/RankedBars'
import { StackedBarChart, type BarSeries } from '@/components/charts/StackedBarChart'
import { ds } from '@/components/ui/classes'
import type { Delta } from '@/types/analysis'
import type { DayPayload } from '@/types/payload'
import { isConnected, type SummarySource } from './source'
import {
  DEFAULT_PERIOD,
  PERIODS,
  periodRange,
  revisitView,
  tickLabels,
  todayView,
  topRx,
  trendBuckets,
  weekdayBuckets,
  type Period,
  type PeriodRange,
  type RateCell,
  type TodayView,
} from './view'

// 대시보드 오늘 하루 분석 + 기간별 흐름 두 섹션 (tab-frame REQ-311, design.md '오늘 하루 분석 · 기간별 흐름 · 보고 문장',
// 시안 docs/mockups/dashboard-home/index.html + 메모 §3 '오늘 하루 분석'·'기간별 흐름', 문구는 메모 §4 그대로).
// 상태는 기간 하나(처음 30일)뿐이다. 연결 전(자료 없음)에는 숫자를 지어내지 않는다(ui-90 REQ-414, 시안 docs/mockups/ui-90/app/gen.py dash_body):
//   오늘 하루 분석 = 칩 "비트 PC 연결 전" + 빈 숫자 칸 넷 + 안내 줄, 기간별 흐름 = "연결하면 생기는 것 4가지" 순서 목록 + 안내 줄(빈 그래프 틀·차트 부품 없음).
// 연결 뒤 그래프는 차트 부품(components/charts)을 고치지 않고 불러 쓴다. 그래프는 움직이지 않는다 — 짧은 반응은 기간 단추에만(150ms)

const SECTION = 'mt-12 border-t border-line-strong pt-5 max-md:mt-8 max-md:pt-4' // 메모 §3 '덩어리 사이'
const SECTION_HEAD = 'mb-4 flex flex-wrap items-center gap-3'
const SECTION_TITLE = 'text-title font-semibold text-ink'
// 보조 글(안내 줄, ui-90 AC-414.6): small(13px) muted + 시안 최대 40em(520px)에 가장 가까운 4px 단위 폭 단계
const NOTE = 'text-small text-muted max-w-130'
const NOT_CONNECTED = '연결하면 보여요'

const KPI_LABELS = ['오늘 환자 수', '신환', '재진'] as const
const LAST_WEEK_LABEL = '지난주 같은 요일보다'
// 숫자 칸 넷: 위아래 16·좌우 20, 첫 칸 왼쪽 0, 칸 사이 1px line 세로선.
// 768px 미만 2칸 × 2줄: 12·16, 왼쪽 칸 왼쪽 0, 둘째 줄 위 1px line(셋째 칸은 세로선 없음)
const KPI_CELLS = [
  'min-w-0 py-4 pr-5 pl-0 max-md:py-3 max-md:pr-4',
  'min-w-0 border-l border-line py-4 px-5 max-md:py-3 max-md:px-4',
  'min-w-0 border-l border-line py-4 pr-5 pl-5 max-md:border-t max-md:border-l-0 max-md:py-3 max-md:pr-4 max-md:pl-0',
  'min-w-0 border-l border-line py-4 px-5 max-md:border-t max-md:py-3 max-md:px-4',
] as const

// 기간 단추 묶음(메모 §3 '기간 단추'). 묶음 32px(테두리 포함), 폰은 단추마다 44px(누르기 쉬운 높이, ui-90 TASK-19)·셋이 같은 폭, 눌린 것 accent-soft · accent-strong 600.
// 올림 바탕만 짧게 바뀌고(transition), 눌린 단추에는 transition이 없어 눌린 표시가 바로 바뀐다
const PERIOD_GROUP =
  'inline-flex shrink-0 overflow-clip rounded-control border border-line-strong bg-surface max-md:order-3 max-md:grid max-md:w-full max-md:grid-cols-3'
const PERIOD_BUTTON =
  'h-7.5 cursor-pointer border-l border-line-strong px-3 text-small first:border-l-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent max-md:h-11'
const PERIOD_ON = 'bg-accent-soft font-semibold text-accent-strong'
const PERIOD_OFF = 'font-medium text-ink-2 transition hover:bg-canvas'

const TREND_SERIES: BarSeries[] = [
  { name: '신환', tone: 'accent' },
  { name: '재진', tone: 'chart-3' },
]
const TREND_LEGEND: LegendItem[] = [
  { label: '신환', mark: 'accent' },
  { label: '재진', mark: 'chart-3' },
]
const WEEK_SERIES: BarSeries[] = [{ name: '환자 수', tone: 'accent' }]
const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'] as const
const RANK_ROWS = [1, 2, 3, 4, 5] as const // 처방 상위 빈 줄 번호
const NO_DATA = '자료 없음'

// 연결하면 생기는 것(시안 gains 글자 그대로): 연결 뒤 이 자리에 그려지는 그래프 넷의 이름·설명
const GAINS = [
  { name: '환자 수 추이', desc: '신환과 재진을 하루씩 막대로 보여 줘요.' },
  { name: '신환 재방문율', desc: '처음 온 환자가 7·14·30일 안에 다시 온 비율이에요.' },
  { name: '요일별 환자 수', desc: '요일마다 하루 평균 환자 수예요.' },
  { name: '처방 상위', desc: '많이 낸 처방 5가지를 차례로 적어요.' },
] as const
// 768px 이상 4칸 한 줄(위아래 1px line, 칸 사이 1px line 세로선, 위아래 16·좌우 20, 첫 칸 왼쪽 0).
// 768px 미만 쌓기(칸마다 아래 1px line, 위아래 12). 번호 상자 · 이름 한 줄, 설명은 768px 이상 아래 전체 폭 · 768px 미만 이름 아래로 들여씀
const GAIN_LIST = 'mt-2 grid list-none border-t border-line md:grid-cols-4 md:border-b'
const GAIN_CELL =
  'grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 border-b border-line py-3 md:border-b-0 md:border-l md:py-4 md:px-5 md:first:border-l-0 md:first:pl-0'
const GAIN_NUMBER =
  'grid size-5 shrink-0 place-items-center rounded-control border border-line-strong text-caption font-semibold text-muted'

export function DashboardAnalysis({ today, source }: { today: string; source: SummarySource }) {
  const [period, setPeriod] = useState<Period>(DEFAULT_PERIOD)
  const todayId = useId()
  const flowId = useId()
  const gainsId = useId()
  const days = isConnected(source) ? source.days : null
  const range = periodRange(today, period)

  return (
    <>
      <section aria-labelledby={todayId} className={SECTION}>
        <div className={SECTION_HEAD}>
          <h2 id={todayId} className={SECTION_TITLE}>
            오늘 하루 분석
          </h2>
          {days === null && <span className={ds.chip.neutral}>비트 PC 연결 전</span>}
        </div>
        <TodayNumbers view={days === null ? null : todayView(today, days)} />
        {days === null && <p className={`mt-3 ${NOTE}`}>연결하면 이 숫자로 원장님 보고 문장을 만들어 맨 위 큰 문장 자리에 올려요.</p>}
      </section>

      <section aria-labelledby={flowId} className={SECTION}>
        <div className={SECTION_HEAD}>
          <h2 id={flowId} className={SECTION_TITLE}>
            기간별 흐름
          </h2>
          <span className="ml-auto whitespace-nowrap text-small text-muted">{range.label}</span>
          <div role="group" aria-label="기간" className={PERIOD_GROUP}>
            {PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={p === period}
                onClick={() => setPeriod(p)}
                className={`${PERIOD_BUTTON} ${p === period ? PERIOD_ON : PERIOD_OFF}`}
              >
                {`최근 ${p}일`}
              </button>
            ))}
          </div>
        </div>

        {days === null ? <Gains id={gainsId} /> : <FlowCharts days={days} range={range} period={period} />}
      </section>
    </>
  )
}

// 연결 전 기간별 흐름: "연결하면 생기는 것 4가지"(subtitle 600) → 순서 목록(번호 1~4 · 이름 · 설명) → 안내 줄. 그래프 틀·차트 부품을 그리지 않는다
function Gains({ id }: { id: string }) {
  return (
    <>
      <p id={id} className="text-subtitle font-semibold text-ink">
        연결하면 생기는 것 {GAINS.length}가지
      </p>
      <ol aria-labelledby={id} className={GAIN_LIST}>
        {GAINS.map((gain, i) => (
          <li key={gain.name} className={GAIN_CELL}>
            <span className={GAIN_NUMBER}>{i + 1}</span>
            <p className="text-body font-semibold text-ink">{gain.name}</p>
            <p className="col-span-2 mt-1 text-small text-ink-2 max-md:col-span-1 max-md:col-start-2 max-md:mt-0.5">{gain.desc}</p>
          </li>
        ))}
      </ol>
      <p className={`mt-3 ${NOTE}`}>연결한 뒤에는 이 자리에 그래프 4개가 그려지고, 기간 단추로 7일·30일·90일을 바꿔 볼 수 있어요.</p>
    </>
  )
}

// 연결 뒤 그래프 넷(지금 그대로).
// 1024px 이상 [추이 1~8 · 재방문율 9~12] / [요일별 1~6 · 처방 7~12], 768~1023px 추이 전체 / 반반 / 처방 전체, 폰 세로
function FlowCharts({ days, range, period }: { days: readonly DayPayload[]; range: PeriodRange; period: Period }) {
  return (
    <div className="grid gap-y-8 md:grid-cols-2 md:gap-x-6 lg:grid-cols-12">
      <Chart title="환자 수 추이" desc="신환·재진, 하루씩" aside={<ChartLegend items={TREND_LEGEND} />} className="md:col-span-2 lg:col-span-8">
        <TrendBody days={days} range={range} period={period} />
      </Chart>
      <Chart title="신환 재방문율" desc="처음 온 환자가 다시 온 비율" className="lg:col-span-4 lg:border-l lg:border-line lg:pl-6">
        <RevisitRows cells={revisitView(days, range)} />
      </Chart>
      <Chart title="요일별 환자 수" desc="하루 평균, 요일마다" className="lg:col-span-6">
        <WeekBody buckets={weekdayBuckets(days, range)} />
      </Chart>
      <Chart title="처방 상위" desc="많이 낸 처방 5가지가 차례로 적힙니다" className="md:col-span-2 lg:col-span-6 lg:border-l lg:border-line lg:pl-6">
        <RankBody items={topRx(days, range)} />
      </Chart>
    </div>
  )
}

// 환자 수 추이: 자료가 있으면 하루 한 칸 쌓은 막대(30·90일은 막대 위 합계 없음), 기간 안 자료가 없으면 빈 틀 + "자료 없음" + 날짜 눈금
function TrendBody({ days, range, period }: { days: readonly DayPayload[]; range: PeriodRange; period: Period }) {
  const buckets = trendBuckets(days, range, period)
  if (buckets === null) return <EmptyTrend message={NO_DATA} ticks={tickLabels(range, period)} />
  return (
    <div className="mt-3">
      <StackedBarChart title="환자 수 추이" unit="명" series={TREND_SERIES} buckets={buckets} dense={period !== 7} />
    </div>
  )
}

// 숫자 줄: 오늘 환자 수 · 신환 · 재진 · 지난주 같은 요일보다. view null = 연결 전
function TodayNumbers({ view }: { view: TodayView | null }) {
  const counts = view?.counts ?? null
  const values = counts === null ? [null, null, null] : [counts.patients, counts.newPatients, counts.returning]
  const emptyText = view === null ? NOT_CONNECTED : undefined // 연결 뒤 빈 값은 KpiStat 기본 '자료 없음'

  return (
    <div className="grid grid-cols-4 border-b border-line max-md:grid-cols-2">
      {KPI_LABELS.map((label, i) => (
        <div key={label} className={KPI_CELLS[i]}>
          <KpiStat label={label} value={values[i] ?? null} format="count" unit="명" emptyText={emptyText} />
        </div>
      ))}
      <div className={KPI_CELLS[3]}>
        {view?.compare.kind === 'delta' ? (
          <DeltaStat delta={view.compare.delta} weekday={view.compare.weekday} />
        ) : (
          <KpiStat
            label={LAST_WEEK_LABEL}
            value={null}
            format="count"
            unit="명"
            emptyText={view === null ? NOT_CONNECTED : view.compare.kind === 'wait' ? '오늘 진료가 끝나면 비교해요' : '지난주 자료가 없어요'}
          />
        )}
      </div>
    </div>
  )
}

// 넷째 칸의 값이 증감일 때. KpiStat의 값은 숫자 하나라 증감을 값으로 쓸 수 없어 같은 글자 단계로 따로 둔다:
// 이름(small muted) → 값 줄(metric 600: 화살표 꾸밈 + 화면 읽기 글자 + 증감 글자) → "지난주 {요일}요일"(small muted)
const DELTA_ARROW = { up: 'M4 1.2 7.4 6.8H.6z', down: 'M4 6.8 7.4 1.2H.6z' } as const
const DELTA_TONE = { up: 'text-positive', down: 'text-negative', flat: 'text-muted', none: 'text-muted' } as const

function DeltaStat({ delta, weekday }: { delta: Delta; weekday: string }) {
  const view = formatDelta(delta, '명')
  const arrow = view.dir === 'up' || view.dir === 'down' ? DELTA_ARROW[view.dir] : null
  return (
    <div className="min-w-0">
      <div className="flex h-7 items-start">
        <span className="text-small text-muted">{LAST_WEEK_LABEL}</span>
      </div>
      <p className={`mt-1 flex flex-wrap items-center gap-x-1 text-metric font-semibold tabular-nums ${DELTA_TONE[view.dir]}`}>
        {arrow && (
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 8 8" className="shrink-0">
            <path d={arrow} fill="currentColor" />
          </svg>
        )}
        {/* 낱말 사이 빈칸은 화면 읽기가 붙여 읽지 않게 둔다(KpiStat의 증감 줄과 같다) */}
        {view.srText && <span className="sr-only">{view.srText}</span>}{' '}
        <span>{view.text}</span>
      </p>
      <p className="text-small text-muted">{`지난주 ${weekday}요일`}</p>
    </div>
  )
}

// 그래프 칸: 제목(h3 subtitle 600) + 옆 보조(범례) → 설명(small muted) → 그림. 이름은 제목이 준다
function Chart({ title, desc, aside, className, children }: { title: string; desc: string; aside?: ReactNode; className: string; children: ReactNode }) {
  const id = useId()
  return (
    <div role="group" aria-labelledby={id} className={`min-w-0 ${className}`}>
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h3 id={id} className="text-subtitle font-semibold text-ink">
          {title}
        </h3>
        {aside}
      </div>
      <p className="text-small text-muted">{desc}</p>
      {children}
    </div>
  )
}

// 빈 틀 가운데 문구(흰 바탕 좌우 12·위아래 4). 꾸밈 틀 밖 글자라 화면 읽기가 읽는다
function Note({ children }: { children: ReactNode }) {
  return (
    <p className="absolute inset-0 flex items-center justify-center px-4 text-center">
      <span className="bg-surface px-3 py-1 text-small text-muted">{children}</span>
    </p>
  )
}

// 환자 수 추이 빈 틀: 200px(폰 140px) 안 가로선 다섯(마지막 line-strong) + 가운데 문구 + 아래 날짜 눈금(날짜는 통계가 아니다)
function EmptyTrend({ message, ticks }: { message: string; ticks: { day: string; label: string }[] }) {
  return (
    <>
      <div className="relative mt-3 h-50 max-md:h-35">
        <div aria-hidden="true" className="absolute inset-0 flex flex-col justify-between">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className={`block h-px ${i === 4 ? 'bg-line-strong' : 'bg-line'}`} />
          ))}
        </div>
        <Note>{message}</Note>
      </div>
      <div aria-hidden="true" className="mt-2 flex justify-between text-caption text-muted tabular-nums">
        {ticks.map((t) => (
          <span key={t.day}>{t.label}</span>
        ))}
      </div>
    </>
  )
}

// 신환 재방문율 줄 셋(연결 뒤). 30일은 저장 자료에 없어 늘 '자료 없음'
const REVISIT_ROW = 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 border-t border-line py-3'

function RevisitRows({ cells }: { cells: { d7: RateCell; d14: RateCell } }) {
  return (
    <div className="mt-2">
      <RevisitRow name="7일 안에 다시 옴" cell={cells.d7} />
      <RevisitRow name="14일 안에 다시 옴" cell={cells.d14} />
      <div className={REVISIT_ROW}>
        <span className="text-body text-ink-2">30일 안에 다시 옴</span>
        <span className="text-small text-muted">{NO_DATA}</span>
        <span className="col-span-2 text-caption text-muted">30일 기록은 아직 모으지 않아요</span>
      </div>
    </div>
  )
}

function RevisitRow({ name, cell }: { name: string; cell: RateCell }) {
  return (
    <div className={REVISIT_ROW}>
      <span className="text-body text-ink-2">{name}</span>
      {cell.kind === 'rate' ? (
        <span className="text-subtitle font-semibold text-ink tabular-nums">{`${formatRate(cell.value)}%`}</span>
      ) : cell.kind === 'in-progress' ? (
        <span className="text-small text-muted">집계 중</span>
      ) : (
        <Dash />
      )}
      {cell.kind === 'none' ? (
        <span className="col-span-2 text-caption text-muted">{NO_DATA}</span>
      ) : (
        <RateBar value={cell.kind === 'rate' ? cell.value : null} />
      )}
    </div>
  )
}

const Dash = () => <span className="text-subtitle font-semibold text-muted">–</span>

// 전체 폭 8px 막대 칸(canvas + 1px line). 값(0~1)이 있으면 그 비율만큼 accent로 채운다. 꾸밈이다(값은 옆 글자)
function RateBar({ value }: { value: number | null }) {
  return (
    <span aria-hidden="true" className="col-span-2 block h-2 border border-line bg-canvas">
      {value !== null && <span className="block h-full bg-accent" style={{ width: `${percentOf(value, 1)}%` }} />}
    </span>
  )
}

// 요일별 환자 수: 자료가 있으면 한 계열 막대, 기간 안 자료가 없으면 빈 막대 칸 7개(150px, 폰 110px) + 요일 글자 + "자료 없음"
function WeekBody({ buckets }: { buckets: ReturnType<typeof weekdayBuckets> }) {
  if (buckets !== null) {
    return (
      <div className="mt-3">
        <StackedBarChart title="요일별 환자 수" unit="명" series={WEEK_SERIES} buckets={buckets} />
      </div>
    )
  }
  return (
    <div className="relative mt-3">
      <div aria-hidden="true" className="grid h-37.5 grid-cols-7 gap-2 max-md:h-27.5">
        {WEEKDAYS.map((name) => (
          <span key={name} className="flex min-w-0 flex-col items-center gap-2">
            <span className="block w-3/5 max-w-7 flex-1 border border-line border-b-line-strong bg-canvas" />
            <span className="text-caption font-medium text-muted">{name}</span>
          </span>
        ))}
      </div>
      <Note>{NO_DATA}</Note>
    </div>
  )
}

// 처방 상위: 자료가 있으면 순위 막대("건"), 없으면 36px 빈 줄 다섯(번호 · 빈 칸 · "–") + "자료 없음"
function RankBody({ items }: { items: ReturnType<typeof topRx> }) {
  if (items !== null && items.length > 0) {
    return (
      <div className="mt-2">
        <RankedBars title="처방 상위" unit="건" items={items} />
      </div>
    )
  }
  return (
    <div className="relative mt-2">
      <ol aria-hidden="true">
        {RANK_ROWS.map((n) => (
          <li key={n} className="flex h-9 items-center gap-3 border-t border-line">
            <span className="w-5 text-caption font-semibold text-muted">{n}</span>
            <span className="min-w-0 flex-1" />
            <span className="font-semibold text-muted">–</span>
          </li>
        ))}
      </ol>
      <Note>{NO_DATA}</Note>
    </div>
  )
}
