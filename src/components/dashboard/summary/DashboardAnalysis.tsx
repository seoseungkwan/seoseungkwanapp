'use client'

import Link from 'next/link'
import { useId, useState, type ReactNode } from 'react'
import { ChartLegend, type LegendItem } from '@/components/charts/ChartLegend'
import { formatDelta, formatRate, percentOf } from '@/components/charts/format'
import { KpiStat } from '@/components/charts/KpiStat'
import { RankedBars } from '@/components/charts/RankedBars'
import { StackedBarChart, type BarBucket, type BarSeries } from '@/components/charts/StackedBarChart'
import { ErrorCard } from '@/components/common/ErrorCard'
import { PeriodPicker } from '@/components/stats/PeriodPicker'
import { ds } from '@/components/ui/classes'
import type { Delta, TrendBucket } from '@/types/analysis'
import type { DayPayload } from '@/types/payload'
import { flowDense, flowOf, flowTicks, flowTrend, rankLine, todayFinished, type Flow, type FlowChoice } from './flow'
import { isConnected, type RxGroupLine, type SummarySource } from './source'
import { usePeriodDays, type PeriodDays } from './usePeriodDays'
import {
  dayCount,
  DEFAULT_PERIOD,
  groupRank,
  longDate,
  PERIODS,
  revisitCohortCaption,
  revisitSkipped,
  revisitView,
  todayView,
  weekdayBuckets,
  type GroupRank,
  type RateCell,
  type RevisitCells,
  type TodayView,
} from './view'

// 대시보드 오늘 하루 분석 + 기간별 흐름 두 섹션 (tab-frame REQ-311, design.md '오늘 하루 분석 · 기간별 흐름 · 보고 문장',
// 시안 docs/mockups/dashboard-home/index.html + 메모 §3 '오늘 하루 분석'·'기간별 흐름', 문구는 메모 §4 그대로).
// 상태는 기간 하나(처음 30일)뿐이다. 연결 전(자료 없음)에는 숫자를 지어내지 않는다(ui-90 REQ-414, 시안 docs/mockups/ui-90/app/gen.py dash_body):
//   오늘 하루 분석 = 칩 "비트 PC 연결 전" + 빈 숫자 칸 넷 + 안내 줄, 기간별 흐름 = "연결하면 생기는 것 4가지" 순서 목록 + 안내 줄(빈 그래프 틀·차트 부품 없음).
// 연결 뒤 그래프는 차트 부품(components/charts)을 고치지 않고 불러 쓴다. 그래프는 움직이지 않는다 — 짧은 반응은 기간 단추와 '처방 상위' 머리 링크(ds.textButton)에만(150ms)

const SECTION = 'mt-12 border-t border-line-strong pt-5 max-md:mt-8 max-md:pt-4' // 메모 §3 '덩어리 사이'
const SECTION_HEAD = 'mb-4 flex flex-wrap items-center gap-3'
const SECTION_TITLE = 'text-title font-semibold text-ink'
// 보조 글(안내 줄, ui-90 AC-414.6): small(13px) muted + 시안 최대 40em(520px)에 가장 가까운 4px 단위 폭 단계
const NOTE = 'text-small text-muted max-w-130'
const NOT_CONNECTED = '연결하면 보여요'
// 환자 수 추이를 감싸는 칸. 칸이 날짜 글자보다 좁으면 글자가 오른쪽으로 넘쳐 휴대폰에서 쪽이 옆으로 밀린다(AC-311.7).
// 통계 CHART_NO_SIDE_SCROLL(stats/sections/parts.tsx)과 같은 값이다. 그 파일을 가져오면 통계 코드가 대시보드에 딸려 와 무거워진다(5 kB).
// 합본 뒤 ds로 옮겨 한 벌로 합칠 것
const CHART_NO_SIDE_SCROLL = 'relative [&_.text-center]:flex [&_.text-center]:flex-col [&_.text-center]:items-center [&_table]:right-0'

const KPI_LABELS = ['오늘 환자 수', '신환', '재진'] as const
const PAST_KPI_LABELS = ['환자 수', '신환', '재진'] as const
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
// 기간 고르기(dashboard-period, design.md '화면'): 그래프 갈래의 머리 줄에만 더한다. 768px 이상 아래 끝 맞춤(통계 탭 StatsScreen의 items-end처럼
// 빠른 단추가 '기간 골라 보기' 이름 줄 아래 고르기 단추와 끝을 맞춘다) · 다음 줄로 넘어간 고르기 묶음은 오른쪽에 붙음. 768px 미만은 지금 클래스 그대로다
const HEAD_WITH_PICKER = 'md:items-end md:justify-end'
// 고르기 감싸개: 빠른 단추가 max-md:order-3이라 휴대폰에서 그 아래 줄 전체 폭으로 둔다
const PICKER_WRAP = 'max-md:order-4 max-md:w-full'

const TREND_SERIES: BarSeries[] = [
  { name: '신환', tone: 'accent' },
  { name: '재진', tone: 'chart-3' },
]
const TREND_LEGEND: LegendItem[] = [
  { label: '신환', mark: 'accent' },
  { label: '재진', mark: 'chart-3' },
]
// 고른 기간에 '일부 기간' 칸(잘린 주·끝나지 않은 달·덜 끝난 줄)이 있을 때만(통계 탭 환자 수 추이와 같은 빗금). 빠른 단추 범례는 지금 그대로다
const TREND_LEGEND_PARTIAL: LegendItem[] = [...TREND_LEGEND, { label: '일부 기간', mark: 'hatch' }]
const TREND_DESC: Record<TrendBucket, string> = { day: '신환·재진, 하루씩', week: '신환·재진, 한 주씩', month: '신환·재진, 한 달씩' }
const READING = '읽는 중' // 옛 기간을 읽는 동안 그래프 넷 가운데 글(AC-1804.2)
const NO_ROWS: readonly DayPayload[] = []
const WEEK_SERIES: BarSeries[] = [{ name: '환자 수', tone: 'accent' }]
const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'] as const
const RANK_ROWS = [1, 2, 3, 4, 5] as const // 처방 상위 빈 줄 번호
const NO_DATA = '자료 없음'
// 처방 상위 = 통계 탭 처방별 추세 묶음(bit-dashboard REQ-606). 글은 요구사항 그대로다
const GROUPS_UNREAD = '통계 탭 묶음을 읽지 못했어요. 화면을 새로 열면 다시 읽어요.' // AC-606.5
const NO_GROUPS = '통계 탭 처방별 추세에서 묶음을 만들면 여기에 보여요.' // AC-606.4
const RELOAD = '통계 탭에서 이 기간을 다시 불러와야 숫자가 나와요.' // AC-606.3
/** source의 묶음: undefined·[] = 묶음 없음, null = 묶음을 읽지 못함 */
type GroupLines = readonly RxGroupLine[] | null | undefined
const noGroups = (groups: GroupLines) => groups !== null && (groups ?? []).length === 0

// 연결하면 생기는 것(시안 gains 글자 그대로): 연결 뒤 이 자리에 그려지는 그래프 넷의 이름·설명
const GAINS = [
  { name: '환자 수 추이', desc: '신환과 재진을 하루씩 막대로 보여 줘요.' },
  { name: '신환 재방문율', desc: '처음 온 환자가 7·14·30일 안에 다시 온 비율이에요.' },
  { name: '요일별 환자 수', desc: '요일마다 하루 평균 환자 수예요.' },
  { name: '처방 상위', desc: '통계 탭에서 묶은 치료를 많이 한 순서로 5가지까지 적어요.' }, // bit-dashboard AC-606.6
] as const
// 768px 이상 4칸 한 줄(위아래 1px line, 칸 사이 1px line 세로선, 위아래 16·좌우 20, 첫 칸 왼쪽 0).
// 768px 미만 쌓기(칸마다 아래 1px line, 위아래 12). 번호 상자 · 이름 한 줄, 설명은 768px 이상 아래 전체 폭 · 768px 미만 이름 아래로 들여씀
const GAIN_LIST = 'mt-2 grid list-none border-t border-line md:grid-cols-4 md:border-b'
const GAIN_CELL =
  'grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 border-b border-line py-3 md:border-b-0 md:border-l md:py-4 md:px-5 md:first:border-l-0 md:first:pl-0'
const GAIN_NUMBER =
  'grid size-5 shrink-0 place-items-center rounded-control border border-line-strong text-caption font-semibold text-muted'

// 숫자가 없을 때의 글(bit-dashboard design.md '### 화면', 시안 docs/mockups/bit-dashboard/gen.py today_sec·flow_empty). 주지 않으면 연결 전 글이고, 숫자가 있으면 쓰지 않는다
export type DashboardAnalysisProps = {
  today: string
  source: SummarySource
  /** 고른 날(bit-dashboard AC-605.3). 없으면 오늘이다. 하루 줄만 바꾸고 기간별 흐름은 today로만 계산한다(AC-605.6) */
  day?: string
  emptyChip?: string
  emptyText?: string
  /** 숫자 줄 아래 안내 줄. null이면 없다 */
  emptyNote?: string | null
  gainsTitle?: string
  gainsNote?: string
  /** '신환 재방문율' 줄 설명 */
  gainsRevisitDesc?: string
  /** 읽었는데 자료가 없을 때: 목록 대신 빈 그래프 틀을 그린다 */
  emptyCharts?: boolean
}

export function DashboardAnalysis({
  today,
  source,
  day = today,
  emptyChip = '비트 PC 연결 전',
  emptyText = NOT_CONNECTED,
  emptyNote = '연결하면 이 숫자로 원장님 보고 문장을 만들어 맨 위 큰 문장 자리에 올려요.',
  gainsTitle = `연결하면 생기는 것 ${GAINS.length}가지`,
  gainsNote = '연결한 뒤에는 이 자리에 그래프 4개가 그려지고, 기간 단추로 7일·30일·90일을 바꿔 볼 수 있어요.',
  gainsRevisitDesc,
  emptyCharts = false,
}: DashboardAnalysisProps) {
  // 고른 것 하나: 빠른 단추(처음 30일) 또는 통계 탭 기간 고르기의 고른 기간(dashboard-period). 저장하지 않아 새로 열면 늘 최근 30일이다(AC-1801.1)
  const [choice, setChoice] = useState<FlowChoice>(DEFAULT_PERIOD)
  const todayId = useId()
  const flowId = useId()
  const gainsId = useId()
  const days = isConnected(source) ? source.days : null
  // 묶음·옛 기간 읽기는 새 prop이 아니라 source 안으로 온다(탭 틀 AC-312.2, bit-dashboard design.md, dashboard-period design.md)
  const groups = source.kind === 'data' ? source.groups : undefined
  const older = source.kind === 'data' ? source.older : undefined
  const held = days ?? NO_ROWS
  const todayDone = todayFinished(today, held)
  const flow = flowOf(today, choice, todayDone)
  const { state: period, retry } = usePeriodDays(held, flow.current, older)
  const charts = days !== null || emptyCharts
  const past = day !== today

  return (
    <>
      <section aria-labelledby={todayId} className={SECTION}>
        <div className={SECTION_HEAD}>
          <h2 id={todayId} className={SECTION_TITLE}>
            {past ? `${longDate(day)} 하루 분석` : '오늘 하루 분석'}
          </h2>
          {days === null && <span className={ds.chip.neutral}>{emptyChip}</span>}
        </div>
        <TodayNumbers view={days === null ? null : todayView(day, days)} emptyText={emptyText} past={past} />
        {days === null && emptyNote !== null && <p className={`mt-3 ${NOTE}`}>{emptyNote}</p>}
      </section>

      <section aria-labelledby={flowId} className={SECTION}>
        <div className={charts ? `${SECTION_HEAD} ${HEAD_WITH_PICKER}` : SECTION_HEAD}>
          <h2 id={flowId} className={SECTION_TITLE}>
            기간별 흐름
          </h2>
          <span className="ml-auto whitespace-nowrap text-small text-muted">{flow.head}</span>
          <div role="group" aria-label="기간" className={PERIOD_GROUP}>
            {PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={p === choice}
                onClick={() => setChoice(p)}
                className={`${PERIOD_BUTTON} ${p === choice ? PERIOD_ON : PERIOD_OFF}`}
              >
                {`최근 ${p}일`}
              </button>
            ))}
          </div>
          {/* 통계 탭 기간 고르기 그대로, 빠른 단추 바로 오른쪽 같은 줄(AC-1801.2). 그래프를 그리는 갈래에만 있다. 부품은 고른 기간만 돌려준다 */}
          {charts && (
            <div className={PICKER_WRAP}>
              <PeriodPicker choice={flow.picker} lastDay={flow.lastDay} todayDone={todayDone} onChoose={(next) => typeof next !== 'string' && setChoice(next)} />
            </div>
          )}
        </div>

        {charts && period.kind === 'failed' && <PeriodReadFailed retrying={period.retrying} onRetry={retry} />}
        {charts ? <FlowCharts flow={flow} period={period} groups={groups} /> : <Gains id={gainsId} title={gainsTitle} note={gainsNote} revisitDesc={gainsRevisitDesc} />}
      </section>
    </>
  )
}

// 연결 전 기간별 흐름: "연결하면 생기는 것 4가지"(subtitle 600) → 순서 목록(번호 1~4 · 이름 · 설명) → 안내 줄. 그래프 틀·차트 부품을 그리지 않는다
function Gains({ id, title, note, revisitDesc }: { id: string; title: string; note: string; revisitDesc?: string }) {
  return (
    <>
      <p id={id} className="text-subtitle font-semibold text-ink">
        {title}
      </p>
      <ol aria-labelledby={id} className={GAIN_LIST}>
        {GAINS.map((gain, i) => (
          <li key={gain.name} className={GAIN_CELL}>
            <span className={GAIN_NUMBER}>{i + 1}</span>
            <p className="text-body font-semibold text-ink">{gain.name}</p>
            <p className="col-span-2 mt-1 text-small text-ink-2 max-md:col-span-1 max-md:col-start-2 max-md:mt-0.5">
              {gain.name === '신환 재방문율' && revisitDesc ? revisitDesc : gain.desc}
            </p>
          </li>
        ))}
      </ol>
      <p className={`mt-3 ${NOTE}`}>{note}</p>
    </>
  )
}

// 옛 기간 읽기 실패(AC-1804.3): 고르기 아래 오류 카드 + 카드 밖 [이 기간 다시 읽기](LiveDashboard 오류 카드와 같은 모양, 폰 전체 폭).
// 위쪽 [다시 읽기](비트·저장 숫자 전체)와 헷갈리지 않게 단추 이름이 '이 기간 다시 읽기'다. 새 오류 번호는 없다
function PeriodReadFailed({ retrying, onRetry }: { retrying: boolean; onRetry: () => void }) {
  return (
    <div className="mb-6">
      <ErrorCard code="E-STATS-READ-FAILED" />
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <button type="button" className={`${ds.button.secondarySmall} max-md:w-full`} disabled={retrying} onClick={onRetry}>
          {retrying ? '다시 읽는 중' : '이 기간 다시 읽기'}
        </button>
      </div>
    </div>
  )
}

// 연결 뒤 그래프 넷. 넷 모두 flow.current(센 기간)를 따르고, 처방 상위는 통계 탭 묶음으로 센다(bit-dashboard REQ-606).
// 옛 기간을 읽는 중이면 빈 틀 가운데 '읽는 중'(숫자를 지어내지 않는다), 읽기 실패면 줄 없음('자료 없음')이다(dashboard-period AC-1804.2·AC-1804.3).
// 1024px 이상 [추이 1~8 · 재방문율 9~12] / [요일별 1~6 · 처방 7~12], 768~1023px 추이 전체 / 반반 / 처방 전체, 폰 세로
function FlowCharts({ flow, period, groups }: { flow: Flow; period: PeriodDays; groups: GroupLines }) {
  const days = period.kind === 'ready' ? period.days : NO_ROWS
  const reading = period.kind === 'reading'
  const empty = reading ? READING : NO_DATA
  const trend = reading ? null : flowTrend(days, flow)
  // 빈 칸(자료 없음·앞으로 올 달)은 빗금 칸이 아니다(통계 탭 PatientTrendSection과 같다)
  const partial = flow.period === null && trend !== null && trend.some((bucket) => !bucket.blank && bucket.state !== 'complete')
  // 빠른 단추는 지금 그대로(30일만 30일 줄을 옮겨 '가장 최근 신환' 글). 고른 기간은 7·14·30일 줄 모두 고른 기간이고 뺀 날이 있으면 줄 아래 글
  const cells = flow.period !== null ? revisitView(days, flow.current, flow.period) : revisitView(days, flow.current)
  const skipped = flow.period === null ? revisitSkipped(days, flow.current) : null
  return (
    <div className="grid gap-y-8 md:grid-cols-2 md:gap-x-6 lg:grid-cols-12">
      <Chart title="환자 수 추이" desc={TREND_DESC[flow.bucket]} aside={<ChartLegend items={partial ? TREND_LEGEND_PARTIAL : TREND_LEGEND} />} className="md:col-span-2 lg:col-span-8">
        <TrendBody buckets={trend} flow={flow} message={empty} />
      </Chart>
      <Chart title="신환 재방문율" desc="처음 온 환자가 다시 온 비율" className="lg:col-span-4 lg:border-l lg:border-line lg:pl-6">
        <RevisitRows cells={cells} skipped={skipped} empty={empty} />
      </Chart>
      <Chart title="요일별 환자 수" desc="하루 평균, 요일마다" className="lg:col-span-6">
        <WeekBody buckets={reading ? null : weekdayBuckets(days, flow.current)} message={empty} />
      </Chart>
      <Chart
        title="처방 상위"
        desc="통계 탭에서 묶은 치료 중 많이 한 순서예요"
        sub={rankLine(flow, period.kind === 'ready' ? dayCount(days, flow.current) : null)}
        aside={<GroupsLink groups={groups} />}
        className="md:col-span-2 lg:col-span-6 lg:border-l lg:border-line lg:pl-6"
      >
        {reading ? <EmptyRank message={READING} /> : <RankBody rank={groupRank(days, flow.current, groups ?? [])} groups={groups} />}
      </Chart>
    </div>
  )
}

// 환자 수 추이: 자료가 있으면 칸마다 쌓은 막대(빠른 단추는 지금처럼 7일만 막대 위 합계, 고른 기간은 칸 7개 이하만),
// 없으면(기간 안 자료 없음·읽는 중) 빈 틀 + 가운데 글 + 날짜 눈금(고른 기간의 주·달 칸은 눈금 없음)
function TrendBody({ buckets, flow, message }: { buckets: BarBucket[] | null; flow: Flow; message: string }) {
  if (buckets === null) return <EmptyTrend message={message} ticks={flowTicks(flow)} />
  return (
    <div className={`mt-3 ${CHART_NO_SIDE_SCROLL}`}>
      <StackedBarChart title="환자 수 추이" unit="명" series={TREND_SERIES} buckets={buckets} dense={flowDense(flow, buckets)} />
    </div>
  )
}

// 숫자 줄: 오늘 환자 수 · 신환 · 재진 · 지난주 같은 요일보다. view null = 숫자 없음(칸마다 emptyText).
// past = 지난 날짜(AC-605.3·AC-605.4): 첫 칸 이름이 "환자 수"이고, 그 날은 끝나기를 기다릴 날이 아니라 비교할 수 없으면 "자료 없음"이다
function TodayNumbers({ view, emptyText, past }: { view: TodayView | null; emptyText: string; past: boolean }) {
  const counts = view?.counts ?? null
  const values = counts === null ? [null, null, null] : [counts.patients, counts.newPatients, counts.returning]

  return (
    <div className="grid grid-cols-4 border-b border-line max-md:grid-cols-2">
      {(past ? PAST_KPI_LABELS : KPI_LABELS).map((label, i) => (
        <div key={label} className={KPI_CELLS[i]}>
          {/* 연결 뒤 빈 값은 KpiStat 기본 '자료 없음' */}
          <KpiStat label={label} value={values[i] ?? null} format="count" unit="명" emptyText={view === null ? emptyText : undefined} />
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
            emptyText={view === null ? emptyText : view.compare.kind === 'no-last-week' ? '지난주 자료가 없어요' : past ? NO_DATA : '오늘 진료가 끝나면 비교해요'}
          />
        )}
      </div>
    </div>
  )
}

// 넷째 칸의 값이 증감일 때. KpiStat의 값은 숫자 하나라 증감을 값으로 쓸 수 없어 같은 글자 단계로 따로 둔다:
// 이름(small muted) → 값 줄(600: 화살표 꾸밈 + 화면 읽기 글자 + 증감 글자) → "지난주 {요일}요일"(small muted).
// 값 줄은 PC 20/36, 폰 16/32다(bit-dashboard design.md '### 날짜 고르기', 시안 .kpi-v.sm). metric(28)이면 좁은 폭에서 세 줄로 꺾이고, 글자 토큰의 줄 높이는 28·24라 줄 높이를 따로 준다
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
      <p className={`mt-1 flex flex-wrap items-center gap-x-1 text-title leading-9 font-semibold tabular-nums max-md:text-subtitle max-md:leading-8 ${DELTA_TONE[view.dir]}`}>
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

// 그래프 칸: 제목(h3 subtitle 600) + 옆 보조(범례) → 설명(small muted) → [설명 바로 아래 한 줄(sub, 같은 글자 + 고정폭 숫자)] → 그림. 이름은 제목이 준다
function Chart({ title, desc, sub, aside, className, children }: { title: string; desc: string; sub?: string; aside?: ReactNode; className: string; children: ReactNode }) {
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
      {sub !== undefined && <p className="text-small text-muted tabular-nums">{sub}</p>}
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

// 신환 재방문율 줄 셋(연결 뒤). 30일 줄도 7·14일과 같은 줄이고, 30일 기간에는 아래에 무엇을 셌는지 글을 붙인다(stats AC-516.2)
const REVISIT_ROW = 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 border-t border-line py-3'

// skipped(고른 기간만): 그 값이 null이라 뺀 날이 있는 줄. 비율 줄 아래에 무엇을 뺐는지 글을 붙인다(dashboard-period AC-1802.3).
// empty: 'none' 칸의 아래 글('자료 없음', 옛 기간을 읽는 중이면 '읽는 중')
function RevisitRows({ cells, skipped = null, empty = NO_DATA }: { cells: RevisitCells; skipped?: Record<'d7' | 'd14' | 'd30', boolean> | null; empty?: string }) {
  const skipCaption = (key: 'd7' | 'd14' | 'd30', days: 7 | 14 | 30) => (skipped?.[key] && cells[key].kind === 'rate' ? `온 뒤 ${days}일이 안 된 날의 신환은 빼고 셌어요` : null)
  return (
    <div className="mt-2">
      <RevisitRow name="7일 안에 다시 옴" cell={cells.d7} empty={empty} caption={skipCaption('d7', 7)} />
      <RevisitRow name="14일 안에 다시 옴" cell={cells.d14} empty={empty} caption={skipCaption('d14', 14)} />
      <RevisitRow name="30일 안에 다시 옴" cell={cells.d30} empty={empty} caption={cells.d30Cohort === null ? skipCaption('d30', 30) : revisitCohortCaption(cells.d30Cohort)} />
    </div>
  )
}

function RevisitRow({ name, cell, empty, caption = null }: { name: string; cell: RateCell; empty: string; caption?: string | null }) {
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
        <span className="col-span-2 text-caption text-muted">{empty}</span>
      ) : (
        <RateBar value={cell.kind === 'rate' ? cell.value : null} />
      )}
      {caption !== null && <span className="col-span-2 text-caption text-muted">{caption}</span>}
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

// 요일별 환자 수: 자료가 있으면 한 계열 막대, 기간 안 자료가 없으면(읽는 중 포함) 빈 막대 칸 7개(150px, 폰 110px) + 요일 글자 + 가운데 글
function WeekBody({ buckets, message = NO_DATA }: { buckets: ReturnType<typeof weekdayBuckets>; message?: string }) {
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
      <Note>{message}</Note>
    </div>
  )
}

// 처방 상위 머리 링크(AC-606.6): 묶음은 통계 탭 처방별 추세에서 고친다. 묶음 없음일 때만 [묶음 만들기], 읽지 못함은 [묶음 고치기].
// 글자 단추 모양 그대로(폰 44px) + no-underline 하나: 앱에는 a 밑줄을 지우는 바탕 규칙이 없어 붙이지 않으면 늘 밑줄이다
// (UI_GUIDE 글자 단추의 밑줄은 올림 반응뿐. CountsOnly·PatientsEntry 링크와 같다). 그래프가 아니라 AC-311.8 움직임 검사에서 이 링크만 뺀다
function GroupsLink({ groups }: { groups: GroupLines }) {
  return (
    <Link href="/stats" className={`${ds.textButton} no-underline`}>
      {noGroups(groups) ? '묶음 만들기' : '묶음 고치기'}
    </Link>
  )
}

// 처방 상위 몸(bit-dashboard design.md '칸 그리기'), 이 차례로 고른다:
// ① 기간 안 일 줄 없음 → 빈 줄 다섯 + "자료 없음" ② 묶음을 읽지 못함 ③ 묶음 없음 → 빈 줄 다섯 + 그 글
// ④ 셀 수 있는 묶음이 있음 → 순위 막대("건") + 다시 불러와야 하는 묶음이 있으면 그 아래 한 줄 ⑤ 다시 불러와야 하는 묶음뿐 → 빈 줄 다섯 + 글
function RankBody({ rank, groups }: { rank: GroupRank | null; groups: GroupLines }) {
  if (rank === null) return <EmptyRank message={NO_DATA} />
  if (groups === null) return <EmptyRank message={GROUPS_UNREAD} />
  if (noGroups(groups)) return <EmptyRank message={NO_GROUPS} />
  if (rank.items.length === 0) return <EmptyRank message={RELOAD} />
  return (
    <div className="mt-2">
      <RankedBars title="처방 상위" unit="건" items={rank.items} />
      {rank.stale.length > 0 && <p className="mt-2 text-small text-muted">{`${rank.stale.join(', ')} 묶음은 ${RELOAD}`}</p>}
    </div>
  )
}

// 처방 상위 빈 틀: 36px 빈 줄 다섯(번호 · 빈 칸 · "–", 꾸밈) + 가운데 글
function EmptyRank({ message }: { message: string }) {
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
      <Note>{message}</Note>
    </div>
  )
}
