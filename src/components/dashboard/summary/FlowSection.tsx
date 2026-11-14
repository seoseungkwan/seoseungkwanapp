'use client'

import Link from 'next/link'
import { useId, useState, type ReactNode } from 'react'
import { ChartLegend, type LegendItem } from '@/components/charts/ChartLegend'
import { formatRate, percentOf } from '@/components/charts/format'
import { RankedBars } from '@/components/charts/RankedBars'
import { StackedBarChart, type BarBucket, type BarSeries } from '@/components/charts/StackedBarChart'
import { ErrorCard } from '@/components/common/ErrorCard'
import { ds } from '@/components/ui/classes'
import type { TrendBucket } from '@/types/analysis'
import type { DayPayload } from '@/types/payload'
import { NO_DATA, NOTE, SECTION, SECTION_HEAD, SECTION_TITLE } from './DailySection'
import { flowBasis, flowDense, flowOf, flowSeries, flowTicks, flowTrend, rankLine, todayFinished, type Flow, type FlowChoice } from './flow'
import { PeriodButtons } from './PeriodButtons'
import { isConnected, type RxGroupLine, type SummarySource } from './source'
import { TableToggle } from './TableToggle'
import { usePeriodDays, type PeriodDays } from './usePeriodDays'
import {
  dayCount,
  DEFAULT_PERIOD,
  groupRank,
  revisitCohortCaption,
  revisitSkipped,
  revisitView,
  weekdayBuckets,
  type GroupRank,
  type RateCell,
  type RevisitCells,
} from './view'

// 기간별 흐름 구역(dashboard-ux AC-2707.2·AC-2707.4, 앞 tab-frame REQ-311·dashboard-period): DashboardAnalysis에서 나눴다.
// 상태는 고른 것 하나(빠른 단추 또는 통계 탭 기간 고르기의 고른 기간, 처음 30일)와 옛 기간 읽기(usePeriodDays)뿐이다.
// 기간 단추·기간 고르기는 "추이 조회 기간" 묶음(PeriodButtons, AC-2703.2) 하나로 그린다. 연결 전에는 "연결하면 생기는 것 4가지" 목록이다(그래프 틀·차트 부품 없음).
// 그래프는 움직이지 않는다 — 짧은 반응은 기간 단추·[표로 보기]·'처방 상위' 머리 링크(ds.textButton)에만(150ms)

// 기간 고르기(dashboard-period, design.md '화면'): 그래프 갈래의 머리 줄에만 더한다. 768px 이상 아래 끝 맞춤(통계 탭 StatsScreen의 items-end처럼
// 빠른 단추가 '기간 골라 보기' 이름 줄 아래 고르기 단추와 끝을 맞춘다) · 다음 줄로 넘어간 고르기 묶음은 오른쪽에 붙음. 768px 미만은 지금 클래스 그대로다
const HEAD_WITH_PICKER = 'md:items-end md:justify-end'

// 환자 수 추이 범례 = 막대 계열(flowSeries: 지금 두 갈래, 모든 칸이 90일초진을 알면 세 갈래 — first90 AC-4404.3)의 이름·tone 그대로.
// '일부 기간'은 고른 기간에 그런 칸(잘린 주·끝나지 않은 달·덜 끝난 줄)이 있을 때만 붙는다(통계 탭 환자 수 추이와 같은 빗금). 빠른 단추 범례는 지금 그대로다
const PARTIAL_LEGEND: LegendItem = { label: '일부 기간', mark: 'hatch' }
const trendLegend = (series: readonly BarSeries[], partial: boolean): LegendItem[] => [
  ...series.map(({ name, tone }): LegendItem => ({ label: name, mark: tone })),
  ...(partial ? [PARTIAL_LEGEND] : []),
]
const TREND_DESC: Record<TrendBucket, string> = { day: '신환·재진, 하루씩', week: '신환·재진, 한 주씩', month: '신환·재진, 한 달씩' }
const WEEK_DESC = '하루 평균, 요일마다'
// 표가 있는 두 그래프(환자 수 추이·요일별 환자 수)의 설명 줄·표 캡션 뒤에 붙는 단위와 기간 기준(dashboard-ux AC-2706.3)
const UNIT = '단위 명'
const withBasis = (text: string, flow: Flow) => `${text} · ${UNIT} · ${flowBasis(flow)}`
const READING = '읽는 중' // 옛 기간을 읽는 동안 그래프 넷 가운데 글(AC-1804.2)
const NO_ROWS: readonly DayPayload[] = []
const WEEK_SERIES: BarSeries[] = [{ name: '환자 수', tone: 'accent' }]
const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'] as const
const RANK_ROWS = [1, 2, 3, 4, 5] as const // 처방 상위 빈 줄 번호
// 처방 상위 = 통계 탭 처방별 추세 묶음(bit-dashboard REQ-606). 글은 요구사항 그대로다
const GROUPS_UNREAD = '통계 탭 묶음을 읽지 못했어요. 화면을 새로 열면 다시 읽어요.' // AC-606.5
const NO_GROUPS = '통계 탭 처방별 추세에서 묶음을 만들면 여기에 보여요.' // AC-606.4
const RELOAD = '통계 탭에서 이 기간을 다시 불러와야 숫자가 나와요.' // AC-606.3
const GROUPS_PENDING = '묶음을 읽는 중' // dashboard-ux AC-2701.2
/** source의 묶음: undefined·[] = 묶음 없음, null = 묶음을 읽지 못함, 'pending' = 묶음을 읽는 중 */
type GroupLines = readonly RxGroupLine[] | null | 'pending' | undefined
type SettledGroups = Exclude<GroupLines, 'pending'>
const noGroups = (groups: SettledGroups) => groups !== null && (groups ?? []).length === 0

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

export type FlowSectionProps = {
  today: string
  source: SummarySource
  gainsTitle?: string
  gainsNote?: string
  /** '신환 재방문율' 줄 설명 */
  gainsRevisitDesc?: string
  /** 읽었는데 자료가 없을 때: 목록 대신 빈 그래프 틀을 그린다 */
  emptyCharts?: boolean
}

export function FlowSection({
  today,
  source,
  gainsTitle = `연결하면 생기는 것 ${GAINS.length}가지`,
  gainsNote = '연결한 뒤에는 이 자리에 그래프 4개가 그려지고, 기간 단추로 7일·30일·90일을 바꿔 볼 수 있어요.',
  gainsRevisitDesc,
  emptyCharts = false,
}: FlowSectionProps) {
  // 고른 것 하나: 빠른 단추(처음 30일) 또는 통계 탭 기간 고르기의 고른 기간(dashboard-period). 저장하지 않아 새로 열면 늘 최근 30일이다(AC-1801.1)
  const [choice, setChoice] = useState<FlowChoice>(DEFAULT_PERIOD)
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

  return (
    <section aria-labelledby={flowId} className={SECTION}>
      <div className={charts ? `${SECTION_HEAD} ${HEAD_WITH_PICKER}` : SECTION_HEAD}>
        <h2 id={flowId} className={SECTION_TITLE}>
          기간별 흐름
        </h2>
        <span className="ml-auto whitespace-nowrap text-small text-muted">{flow.head}</span>
        {/* 추이 조회 기간(AC-2703.2): 빠른 단추 + 통계 탭 기간 고르기(그래프를 그리는 갈래에만, 판은 오른쪽 맞춤) + 적용 글 */}
        <PeriodButtons choice={choice} onChoose={setChoice} picker={flow.picker} lastDay={flow.lastDay} todayDone={todayDone} showPicker={charts} />
      </div>

      {charts && period.kind === 'failed' && <PeriodReadFailed retrying={period.retrying} onRetry={retry} />}
      {charts ? <FlowCharts flow={flow} period={period} groups={groups} /> : <Gains id={gainsId} title={gainsTitle} note={gainsNote} revisitDesc={gainsRevisitDesc} />}
    </section>
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
  const series = flowSeries(days, flow) // 읽는 중이면 줄이 없어 지금 두 갈래다
  // 빈 칸(자료 없음·앞으로 올 달)은 빗금 칸이 아니다(통계 탭 PatientTrendSection과 같다)
  const partial = flow.period === null && trend !== null && trend.some((bucket) => !bucket.blank && bucket.state !== 'complete')
  // 빠른 단추는 지금 그대로(30일만 30일 줄을 옮겨 '가장 최근 신환' 글). 고른 기간은 7·14·30일 줄 모두 고른 기간이고 뺀 날이 있으면 줄 아래 글
  const cells = flow.period !== null ? revisitView(days, flow.current, flow.period) : revisitView(days, flow.current)
  const skipped = flow.period === null ? revisitSkipped(days, flow.current) : null
  return (
    <div className="grid gap-y-8 md:grid-cols-2 md:gap-x-6 lg:grid-cols-12">
      <Chart
        title="환자 수 추이"
        desc={withBasis(TREND_DESC[flow.bucket], flow)}
        aside={<ChartLegend items={trendLegend(series, partial)} />}
        className="md:col-span-2 lg:col-span-8"
      >
        <TrendBody buckets={trend} series={series} flow={flow} message={empty} />
      </Chart>
      <Chart title="신환 재방문율" desc="처음 온 환자가 다시 온 비율" className="lg:col-span-4 lg:border-l lg:border-line lg:pl-6">
        <RevisitRows cells={cells} skipped={skipped} empty={empty} />
      </Chart>
      <Chart title="요일별 환자 수" desc={withBasis(WEEK_DESC, flow)} className="lg:col-span-6">
        <WeekBody buckets={reading ? null : weekdayBuckets(days, flow.current)} flow={flow} message={empty} />
      </Chart>
      <Chart
        title="처방 상위"
        desc="통계 탭에서 묶은 치료 중 많이 한 순서예요"
        sub={rankLine(flow, period.kind === 'ready' ? dayCount(days, flow.current) : null)}
        aside={groups === 'pending' ? undefined : <GroupsLink groups={groups} />}
        className="md:col-span-2 lg:col-span-6 lg:border-l lg:border-line lg:pl-6"
      >
        {reading ? (
          <EmptyRank message={READING} />
        ) : groups === 'pending' ? (
          // 묶음을 읽는 중(dashboard-ux AC-2701.2): 묶음이 있는지 모르니 숫자도 머리 링크도 없다. 묶음이 오면 이 칸만 바뀐다
          <EmptyRank message={GROUPS_PENDING} live />
        ) : (
          <RankBody rank={groupRank(days, flow.current, groups ?? [])} groups={groups} />
        )}
      </Chart>
    </div>
  )
}

// 환자 수 추이: 자료가 있으면 칸마다 쌓은 막대(빠른 단추는 지금처럼 7일만 막대 위 합계, 고른 기간은 칸 7개 이하만) + 그 아래 [표로 보기](AC-2706.1),
// 없으면(기간 안 자료 없음·읽는 중) 빈 틀 + 가운데 글 + 날짜 눈금(고른 기간의 주·달 칸은 눈금 없음). 표를 펼친 동안 그래프는 화면 읽기 표를 빼고 그린다
function TrendBody({ buckets, series, flow, message }: { buckets: BarBucket[] | null; series: BarSeries[]; flow: Flow; message: string }) {
  if (buckets === null) return <EmptyTrend message={message} ticks={flowTicks(flow)} />
  return (
    <TableToggle caption={withBasis('환자 수 추이', flow)} series={series} buckets={buckets}>
      {(open) => (
        <div className={`mt-3 ${ds.chartNoSideScroll}`}>
          <StackedBarChart title="환자 수 추이" unit="명" series={series} buckets={buckets} dense={flowDense(flow, buckets)} srTable={!open} />
        </div>
      )}
    </TableToggle>
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

// 빈 틀 가운데 문구(흰 바탕 좌우 12·위아래 4). 꾸밈 틀 밖 글자라 화면 읽기가 읽는다. role: 곧 바뀌는 글(읽는 중)이면 status
function Note({ children, role }: { children: ReactNode; role?: 'status' }) {
  return (
    <p role={role} className="absolute inset-0 flex items-center justify-center px-4 text-center">
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

// 요일별 환자 수: 자료가 있으면 한 계열 막대 + 그 아래 [표로 보기](AC-2706.1), 기간 안 자료가 없으면(읽는 중 포함) 빈 막대 칸 7개(150px, 폰 110px) + 요일 글자 + 가운데 글
function WeekBody({ buckets, flow, message = NO_DATA }: { buckets: ReturnType<typeof weekdayBuckets>; flow: Flow; message?: string }) {
  if (buckets !== null) {
    return (
      <TableToggle caption={withBasis('요일별 환자 수', flow)} series={WEEK_SERIES} buckets={buckets}>
        {(open) => (
          <div className="mt-3">
            <StackedBarChart title="요일별 환자 수" unit="명" series={WEEK_SERIES} buckets={buckets} srTable={!open} />
          </div>
        )}
      </TableToggle>
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
function GroupsLink({ groups }: { groups: SettledGroups }) {
  return (
    <Link href="/stats" className={`${ds.textButton} no-underline`}>
      {noGroups(groups) ? '묶음 만들기' : '묶음 고치기'}
    </Link>
  )
}

// 처방 상위 몸(bit-dashboard design.md '칸 그리기'), 이 차례로 고른다:
// ① 기간 안 일 줄 없음 → 빈 줄 다섯 + "자료 없음" ② 묶음을 읽지 못함 ③ 묶음 없음 → 빈 줄 다섯 + 그 글
// ④ 셀 수 있는 묶음이 있음 → 순위 막대("건") + 다시 불러와야 하는 묶음이 있으면 그 아래 한 줄 ⑤ 다시 불러와야 하는 묶음뿐 → 빈 줄 다섯 + 글
function RankBody({ rank, groups }: { rank: GroupRank | null; groups: SettledGroups }) {
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

// 처방 상위 빈 틀: 36px 빈 줄 다섯(번호 · 빈 칸 · "–", 꾸밈) + 가운데 글. live: 곧 바뀌는 글이라 role=status로 읽힌다
function EmptyRank({ message, live = false }: { message: string; live?: boolean }) {
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
      <Note role={live ? 'status' : undefined}>{message}</Note>
    </div>
  )
}
