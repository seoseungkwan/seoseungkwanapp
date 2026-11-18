'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ChartLegend } from '@/components/charts/ChartLegend'
import { StackedBarChart } from '@/components/charts/StackedBarChart'
import { ErrorCard } from '@/components/common/ErrorCard'
import { Icon } from '@/components/common/Icon'
import { StackBars } from '@/components/revenue/MonthBars'
import { BANNER, KpiRow, Note as RevenueNote, NoticeLine, STRONG } from '@/components/revenue/RevenueParts'
import { SplitTable } from '@/components/revenue/RevenueSplit'
import { TreatmentBars } from '@/components/revenue/TreatmentBars'
import type { BarsView, Lead, PerVisitTab, RevenueMode, RevenueTabs, RoughInfo, SplitTab, TreatmentsTab, TrendTab } from '@/components/stats/revenueView'
import { ds } from '@/components/ui/classes'
import type { StatsRxGroup } from '@/types/rxGroups'
import { HowCounted } from './HowCounted'
import { CHART_NO_SIDE_SCROLL, EmptyNote, Section, thinTotals } from './parts'
import type { BitSectionsShown } from './PatientMixSection'
import { PatientValueSection } from './PatientValueSection'
import { RoughSwitch } from './RoughSwitch'
import { RxSection } from './RxSection'

// 통계 '매출' 칸 + 탭 넷 (stats-revenue REQ-4107 AC-4107.1~AC-4107.10, design.md '칸 부품', 시안 docs/mockups/stats-revenue).
// 탭·키(← → Home End)·고르지 않은 패널 hidden·패널 상태 지킴·설명 portal은 처방 칸과 같은 부품(RxSection)이 맡는다. 패널마다 Section(탭 패널 모드)이라 설명이 탭 따라 바뀐다.
// 글·숫자는 모두 revenueView(revenueTabs)가 준 값 그대로 그린다. 고른 탭·[어떻게 세나요?] 펼침은 React 상태뿐이다(주소·저장소·서버에 쓰지 않는다)
// first90(REQ-4408 AC-4408.3~AC-4408.5, REQ-4417 AC-4417.3, design.md 5-7, 시안 docs/mockups/first90/redesign.html #s-rev):
//   매출 추이·건당 진료비 막대는 mode가 'in'이고 켜짐 막대(tabs.rough)가 있으면 그것을, 아니면 꺼짐 막대를 그린다(꺼짐 = 확인 필요한 날 점선 칸, 켜짐 = 참고 금액 빗금 막대).
//   범례는 막대 위, 막대를 누르면(PC는 올리기도) 막대 아래 줄(role="status")에 그 칸 글이 나온다. 고른 칸은 이 칸의 React 상태이고 스위치를 바꿔도 남는다.
//   막대는 기간을 바꾸면 높이가 움직이고(st-move-period) 빗금 조각은 붙을 때 솟는다(st-rise), 머리 글 "참고 포함" 꼬리표는 붙을 때 나타난다(st-tag-in).
//   급여·비급여·기타·치료별 매출은 mode와 상관없다(AC-4408.4). 다만 켜짐이고 켜짐 셈(tabs.rough)이 있으면 그 두 탭 맨 위(설명 줄 아래)에
//   tabs.rough.outside(참고 금액은 이 탭에 넣지 않아 합이 총매출과 다르다)를 막대 아래 글과 같은 모양으로 둔다(2026-11-15 검토 보완)
// stats-insights(REQ-6106 AC-6106.4·AC-6106.5): bit(비트 칸 보기)를 주면 탭 넷 뒤에 다섯째 탭 '신환 1명당'(PatientValueSection)을 더한다.
//   비트 칸이라 bit를 줄 때만이고, 탭이 있는 때(매출이 읽혔고 자료가 있음)만이다 — 읽는 중·읽기 실패·자료 없음 칸은 지금 모양 그대로다

const TITLE = '매출'
const TABLIST_LABEL = '매출 보기'
const EMPTY = '불러오면 이 기간의 매출이 하루씩 막대로 그려져요.'
const READING = '불러오는 중'
const RETRY = '다시 읽기'
// 도우미 예전 판 노란 줄(AC-4107.8, 기본값 9·15)
const OLD_HELPER_LEAD = '도우미가 예전 판이라 치료별 매출은 읽지 못했어요.'
const OLD_HELPER_REST = ' 매출 추이·급여·비급여·기타·건당 진료비는 그대로예요. 설정 탭에서 새 도우미를 받아 깐 뒤 [비트에서 불러오기]를 다시 누르면 채워져요.'
const OLD_HELPER_LINK = '설정에서 새 도우미 받기'
const SETTINGS_HREF = '/settings'
// 치료별 매출의 '셀 날 없음' 첫 줄(revenueView): 앞말 '자료 없음'은 굵게(빈 상태 한 줄과 같은 모양)
const NONE_HEAD = '자료 없음 · '

const ROUGH_TAG = '참고 포함'
// "참고 포함" 꼬리표(매출 요약 칸과 같은 모양): 붙을 때 200ms 나타난다(AC-4417.3)
const TAG = 'st-tag-in inline-flex items-center rounded-full bg-warning-soft px-2 align-middle text-caption font-semibold text-st-warn-ink'
// 막대 아래 줄(시안 .s-tip): 누르거나 올린 칸 글. 처음은 빈 줄이고 자리는 둔다(글이 생겨도 아래가 밀리지 않게)
const TIP = 'mt-2 min-h-5 text-body font-semibold text-st-ink tabular-nums'
// [어떻게 세나요?] 안 문단 묶음(처방별 추세 NOTES_BOX와 같은 폭·사이). 시안은 이 칸에서만 단추 줄 위·단추와 글 사이를 12px로 둔다:
// HowCounted(mt-2·글 칸 mt-1)에 위 pt-1 · 글 pt-2를 더한다(글 칸 첫 줄의 mt는 HowCounted가 0으로 맞춘다)
const HOW_BOX = 'grid max-w-182 gap-1 pt-2'

type Props = {
  tabs: RevenueTabs | 'reading' | 'read-failed'
  noDayCodes: boolean // 이 화면에서 읽은 답에 날 단위 처방 금액이 없었음(기본값 9)
  onReread(): void // 저장된 매출만 다시 읽기(AC-4107.9)
  className?: string
  // 참고 금액 포함 스위치(first90 AC-4408.1): 상태는 StatsSections 하나가 갖고 매출 요약 스위치와 같은 값이다. rough·onMode를 주고 탭이 있을 때만 카드 제목 줄에 그린다
  mode?: RevenueMode
  onMode?(mode: RevenueMode): void
  rough?: RoughInfo | null
  // 신환 1명당 탭(stats-insights AC-6106.4): 비트 칸 보기와 처방 칸 묶음(이름을 붙인다). bit를 주지 않으면 탭이 없다
  bit?: BitSectionsShown
  groups?: readonly StatsRxGroup[]
}

function How({ paragraphs }: { paragraphs: readonly string[] }) {
  return (
    <div className="pt-1">
      <HowCounted>
        <div className={HOW_BOX}>
          {paragraphs.map((text) => (
            <p key={text} className="text-small text-muted">
              {text}
            </p>
          ))}
        </div>
      </HowCounted>
    </div>
  )
}

// 탭 첫 줄(시안 .s-lead 15px · 금액 17px): 글 + 굵은 금액 + "참고 포함" 꼬리표(켜짐) + 회색 비교 글(없으면 없음). 사이 빈칸은 여기서 둔다
function LeadLine({ lead, tag = false }: { lead: Lead; tag?: boolean }) {
  return (
    <p className="mt-3 text-st-15 text-ink-2">
      {lead.text}{' '}
      <span className="text-st-17 font-semibold text-ink tabular-nums">{lead.amount}</span>
      {tag && (
        <>
          {' '}
          <span className={TAG}>{ROUGH_TAG}</span>
        </>
      )}
      {lead.rest !== null && (
        <>
          {' '}
          <span className="text-muted">{lead.rest}</span>
        </>
      )}
    </p>
  )
}

// 범례(있을 때만) → 막대(환자 수 추이와 같은 감싸개: 칸이 많으면 휴대폰에서 막대 위 숫자를 줄이고 옆으로 밀리지 않게) → 막대 아래 줄.
// 고른 칸은 여기 상태다. 같은 자리에 그대로 있어 켜짐·꺼짐 막대가 바뀌어도 남고, 글은 지금 막대의 그 칸 글이다
function Bars({ title, unit, view, gap }: { title: string; unit: string; view: BarsView; gap: string }) {
  const [picked, setPicked] = useState<string | null>(null)
  const legend = view.legend.length > 0
  return (
    <>
      {legend && (
        <div className={gap}>
          <ChartLegend items={view.legend} />
        </div>
      )}
      <div className={`${legend ? 'mt-2' : gap} ${thinTotals(view.buckets.length)} ${CHART_NO_SIDE_SCROLL}`}>
        <StackedBarChart
          title={title}
          unit={unit}
          series={view.series}
          buckets={view.buckets}
          dense={view.dense}
          motion
          selected={picked ?? undefined}
          onPick={setPicked}
        />
      </div>
      <p role="status" className={TIP}>
        {picked === null ? '' : (view.tips[picked] ?? '')}
      </p>
    </>
  )
}

const ReadingLine = () => (
  <p className="mt-3 flex items-center gap-1.5 text-body text-muted">
    <Icon name="clock" size={14} className="shrink-0" />
    {READING}
  </p>
)

function TrendPanel({ tab }: { tab: TrendTab }) {
  return (
    <Section title="매출 추이" desc={tab.desc}>
      <LeadLine lead={tab.lead} tag={tab.tag} />
      <Bars title="매출 추이" unit="만 원" view={tab} gap="mt-3" />
      {tab.note !== null && <RevenueNote>{tab.note}</RevenueNote>}
      <How paragraphs={tab.how} />
    </Section>
  )
}

// outside = 켜짐 안내 글(없으면 null). 두 탭(급여·비급여·기타·치료별 매출) 맨 위에 둔다
function SplitPanel({ tab, outside }: { tab: SplitTab; outside: string | null }) {
  return (
    <Section title="급여·비급여·기타" desc={tab.desc}>
      {outside !== null && <RevenueNote>{outside}</RevenueNote>}
      {tab.notice && <NoticeLine notice={tab.notice} />}
      <div className="mt-4 grid gap-y-6 md:grid-cols-12 md:gap-x-6">
        <div className="min-w-0 md:col-span-5">
          <SplitTable head={tab.head} rows={tab.rows} />
          <How paragraphs={tab.how} />
        </div>
        {tab.chart && (
          <div className="min-w-0 md:col-span-6 md:col-start-7">
            <StackBars chart={tab.chart} />
          </div>
        )}
      </div>
    </Section>
  )
}

// 줄이 아닐 때(기본값 3·4, AC-4107.8): 읽는 중 · 묶음 읽기 실패 한 줄 · 셀 날 없음(굵은 '자료 없음' 줄 + 예전 판이면 달 합계 안내 줄)
function TreatmentLines({ tab }: { tab: TreatmentsTab }) {
  if (tab.state === 'reading') return <ReadingLine />
  return tab.lines.map((line, i) =>
    line.startsWith(NONE_HEAD) ? (
      <EmptyNote key={line}>{line.slice(NONE_HEAD.length)}</EmptyNote>
    ) : i === 0 ? (
      <p key={line} className="mt-3 text-body text-ink-2">
        {line}
      </p>
    ) : (
      <RevenueNote key={line}>{line}</RevenueNote>
    ),
  )
}

function TreatmentsPanel({ tab, outside }: { tab: TreatmentsTab; outside: string | null }) {
  return (
    <Section title="치료별 매출" desc={tab.desc}>
      {outside !== null && <RevenueNote>{outside}</RevenueNote>}
      {tab.state === 'rows' ? (
        <>
          {tab.lead && <LeadLine lead={tab.lead} />}
          <TreatmentBars rows={tab.rows} />
          {tab.notice && <NoticeLine notice={tab.notice} />}
          <How paragraphs={tab.how} />
        </>
      ) : (
        <TreatmentLines tab={tab} />
      )}
    </Section>
  )
}

function PerVisitPanel({ tab }: { tab: PerVisitTab }) {
  return (
    <Section title="건당 진료비" desc={tab.desc}>
      {tab.notice && <NoticeLine notice={tab.notice} />}
      <KpiRow kpis={tab.kpis} />
      <Bars title="건당 진료비" unit="천 원" view={tab} gap="mt-6" />
      {tab.note !== null && <RevenueNote>{tab.note}</RevenueNote>}
      <How paragraphs={tab.how} />
    </Section>
  )
}

// 제목과 탭 사이 노란 줄(AC-4107.8). [설정에서 새 도우미 받기]는 설정 화면으로 가는 링크다(기본값 15)
function OldHelperNote() {
  return (
    <div role="note" className={`${BANNER} bg-warning-soft`}>
      <p>
        <strong className={STRONG}>{OLD_HELPER_LEAD}</strong>
        {OLD_HELPER_REST}
      </p>
      <Link href={SETTINGS_HREF} className={ds.button.secondarySmall}>
        {OLD_HELPER_LINK}
      </Link>
    </div>
  )
}

const NO_GROUPS: readonly StatsRxGroup[] = []

export function RevenueSection({ tabs, noDayCodes, onReread, className, mode = 'out', onMode, rough = null, bit, groups = NO_GROUPS }: Props) {
  if (tabs === 'reading') {
    return (
      <Section title={TITLE} className={className}>
        <ReadingLine />
      </Section>
    )
  }
  if (tabs === 'read-failed') {
    // 오류 카드 + 카드 밖 [다시 읽기](통계 읽기 실패와 같은 모양, 기본값 11)
    return (
      <Section title={TITLE} className={className}>
        <div className="mt-4">
          <ErrorCard code="E-STATS-READ-FAILED" />
          <div className="mt-2">
            <button type="button" onClick={onReread} className={`${ds.button.secondarySmall} max-md:w-full`}>
              {RETRY}
            </button>
          </div>
        </div>
      </Section>
    )
  }
  if (tabs.kind === 'empty') {
    return (
      <Section title={TITLE} className={className}>
        <EmptyNote>{EMPTY}</EmptyNote>
      </Section>
    )
  }
  // 켜짐 막대는 참고 금액이 있는 날이 있을 때만 있다. 없으면 켜짐이어도 꺼짐 막대다(셈이 같다)
  const bars = mode === 'in' ? tabs.rough : null
  const trend = bars?.trend ?? tabs.trend
  const perVisit = bars?.perVisit ?? tabs.perVisit
  const outside = bars?.outside ?? null
  return (
    <>
      {rough !== null && onMode !== undefined && <RoughSwitch mode={mode} onChange={onMode} days={rough.days} roughDays={rough.roughDays} />}
      <RxSection
        title={TITLE}
        label={TABLIST_LABEL}
        notice={noDayCodes ? <OldHelperNote /> : undefined}
        className={className}
        tabs={[
          { name: '매출 추이', panel: <TrendPanel tab={trend} /> },
          { name: '급여·비급여·기타', panel: <SplitPanel tab={tabs.split} outside={outside} /> },
          { name: '치료별 매출', panel: <TreatmentsPanel tab={tabs.treatments} outside={outside} /> },
          { name: '건당 진료비', panel: <PerVisitPanel tab={perVisit} /> },
          ...(bit === undefined ? [] : [{ name: '신환 1명당', panel: <PatientValueSection view={bit} groups={groups} /> }]),
        ]}
      />
    </>
  )
}
