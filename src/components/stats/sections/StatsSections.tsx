import { useMemo, useState } from 'react'
import { Icon } from '@/components/common/Icon'
import { pickReportText, type ReportRx } from '@/components/stats/periodPick'
import { revenueCells, revenueTabs, roughInfo, type RevenueInput, type RevenueMode } from '@/components/stats/revenueView'
import { TOC_LINKS } from '@/components/stats/StatsToc'
import { treatmentRows } from '@/components/stats/treatmentView'
import type { StatsRxGroupsView } from '@/components/stats/useStatsRxGroups'
import { sunapSpan, workedDays } from '@/components/stats/sunapView'
import { summaryCells, summaryDesc, type StatsInput, type StatsRange } from '@/components/stats/view'
import { addDays } from '@/lib/analytics/dates'
import type { RevenueCodeTotal, RevenueMonthCode, SavedRevenueDay } from '@/types/revenue'
import type { RxGroup } from '@/types/rxGroups'
import type { RxSplitView } from '@/types/stats'
import { DoctorsSection } from './DoctorsSection'
import { PatientMixSection, type BitSectionsShown } from './PatientMixSection'
import { PatientTrendSection } from './PatientTrendSection'
import { PeriodSummary } from './PeriodSummary'
import { ReportSection, type PickReport, type ReportData } from './ReportSection'
import { RevenueSection } from './RevenueSection'
import { RevenueSummary } from './RevenueSummary'
import { RevisitSection } from './RevisitSection'
import { RxPickerSection } from './RxPickerSection'
import { RxSection } from './RxSection'
import { RxSplitSection } from './RxSplitSection'
import { SunapSection, type StatsSunapShown } from './SunapSection'
import { cardRangeText, SectionAnchor, StatsCard, todayOf } from './parts'
import { TreatmentTrendSection } from './TreatmentTrendSection'
import { VisitHoursSection } from './VisitHoursSection'
import { WeekdaySection } from './WeekdaySection'

// 통계 틀 (first90 REQ-4411 AC-4411.1·AC-4411.3, design.md 5-5, 시안 docs/mockups/first90/redesign.html): 요약 자리 → 큰 카드 다섯을 한 줄씩 쌓는다(사이 16px).
//   요약 자리(stats-summary): 환자 요약 카드(이 카드가 id를 갖는다) + 바로 뒤 매출 요약 카드(revenue를 받을 때만, first90 AC-4408.2)
//   환자(stats-patients): 환자 수 추이 · 신환 재방문율 · 환자 구성(비트)
//   매출(stats-revenue): 매출 칸(탭 넷). revenue를 받을 때만(stats-revenue AC-4107.1, 통계 화면은 늘 준다)
//   예약·전환(stats-sunap, spec sunap-ilji AC-4906.1): 초진·90일 예약률 · Block 전환 칸 셋. sunap을 받을 때만(통계 화면은 늘 준다)
//   처방(stats-rx): 처방 칸 + 탭 셋(stats-pc-ux AC-4003.1). 탭 안 칸은 지금 칸 그대로(props도 그대로)이고 Section 탭 패널 모드로 그려진다
//   진료 운영(stats-ops): 요일별 · 시간대별(비트)은 1200px 이상 한 줄 30% · 70%, 좁으면 쌓는다. 원장님별(비트)은 그 아래 전체 폭
//   보고(stats-report): 원장님 보고 문장 칸
// 카드 안 칸은 h3 작은 칸이고 칸 사이는 얇은 선뿐이다(parts.tsx StatsCard). 비트 칸은 bit를 받을 때만 그린다(stats-bit-sections AC-2706.1, 통계 화면은 늘 준다).
// 고른 기간(stats-period)이면 보고 칸에 [고른 기간 보고](저장된 숫자로 만든 글)를 넣고, 처방별 신환·재진 설명 끝에 기간 이름을 붙인다.
// 매출(stats-revenue): revenue를 받으면 매출 요약 카드(칸 셋)도 넣는다. 숫자는 revenueView(순수)가 통계 기간·처방 칸 묶음으로 센다.
// 참고 금액 포함 스위치(first90 AC-4408.1): 상태 하나를 여기서 갖고(저장하지 않음, 처음 꺼짐) 매출 요약·매출 카드 두 스위치에 같은 값을 준다.
// 보는 기간에 참고 금액이 있는 날이 없으면 켤 수 없고 셈은 꺼짐 그대로다. 매출 카드 탭 넷의 셈은 아직 꺼짐 그대로다

const REPORT_RX = 2
// 바로가기 띠 바로 아래 첫 자리(환자 요약)의 위 여백: 칸 위 48px(휴대폰 32px) 대신 24px(휴대폰 20px) (stats-pc-ux 기본값 14)
const FIRST_GAP = '[&>:first-child]:mt-6 max-md:[&>:first-child]:mt-5'
// 자리 id는 바로가기 띠 링크와 같은 차례다(AC-4411.2)
const [SUMMARY_ID, PATIENTS_ID, REVENUE_ID, SUNAP_ID, RX_ID, OPS_ID, REPORT_ID] = TOC_LINKS.map((link) => link.id)
// 카드 다섯의 h2·옆 글(AC-4411.3). 환자 카드 옆 글은 기간에 따라 cardRangeText가 만든다. 매출 카드 옆 글은 매출 칸 설명 글이다(같은 제목 칸 규칙)
const SUMMARY = '환자 요약'
const REVENUE_SUMMARY = '매출 요약'
const REVENUE_SUMMARY_DESC = '총진료비 · 수납한 날 기준'
const PATIENTS = '환자'
const REVENUE = '매출'
const SUNAP = '예약·전환'
const RX = '처방'
const RX_DESC = '만들어 둔 묶음마다 건수와 총환자 대비 · 같은 날 같은 환자는 1건'
const OPS = '진료 운영'
const OPS_DESC = '언제 붐비는지 · 원장님마다'
const REPORT = '원장님 보고 문장'
const REPORT_DESC = '비트 PC에서 불러온 숫자로 만든 보고 글 · 환자 이름은 쓰지 않아요'
const STACK = `flex flex-col gap-4 ${FIRST_GAP}`
// 진료 운영 카드 윗줄(요일별 30% · 시간대별 70%, 시안 .s-row-ops). 칸은 min-w-0이라 줄어든다
const OPS_ROW = 'flex min-w-0 flex-col gap-6 min-[1200px]:flex-row min-[1200px]:gap-8'

/** 매출 칸에 넘기는 값: 통계 매출 훅(useStatsRevenue)의 읽은 숫자·상태 + 마지막 끝난 날 + [다시 읽기](저장된 매출만) */
export type StatsRevenueShown = {
  state: 'reading' | 'ready' | 'read-failed'
  days: readonly SavedRevenueDay[]
  codes: readonly RevenueCodeTotal[]
  monthCodes: readonly RevenueMonthCode[]
  noDayCodes: boolean // 이 화면에서 읽은 답에 날 단위 처방 금액이 없었음(도우미 예전 판)
  lastDay: string // 마지막 끝난 날(어제, 오늘 진료 끝이면 오늘)
  onReread(): void
}

// 처방별 추세의 준비된 줄 건수 1·2위(묶음 이름·건수만)
function topRx(input: StatsInput, groups: readonly RxGroup[]): ReportRx[] {
  return treatmentRows(input, groups)
    .flatMap((row) => (row.kind === 'ready' ? [{ name: row.group.name, count: row.row.count }] : []))
    .sort((a, b) => b.count - a.count)
    .slice(0, REPORT_RX)
}

// 고른 기간 보고(AC-1707.1). 빠른 단추는 null(보고 칸이 지금과 같다)
function pickReport(input: StatsInput, groups: readonly RxGroup[]): PickReport | null {
  const { range } = input
  if (range.period !== null) return null
  return { label: range.label, text: pickReportText(range, summaryCells(input), topRx(input, groups)) }
}

type Props = {
  input: StatsInput
  saved: boolean // 저장된 숫자가 하나라도 있음
  split: RxSplitView | null // null = 비트 PC에서 불러온 자료가 없음
  report: ReportData | null
  hospitalName: string
  groups: StatsRxGroupsView // 처방별 추세 묶음 훅 값(통계 화면이 한 번 부른다)
  revision?: number // 저장에 성공하거나 [다시 읽기]를 누를 때마다 는다. 처방 찾기 목록이 넓은 범위를 다시 읽는 때를 안다
  bit?: BitSectionsShown // 비트 전용 세 칸 보기. null = 이 기기에서 불러오지 않음, 'waiting' = 이 기간 답을 기다림. 주지 않으면 세 칸이 없다
  revenue?: StatsRevenueShown // 매출 카드·매출 요약 카드. 주지 않으면 둘 다 없다
  sunap?: StatsSunapShown // 예약·전환 카드(마감한 날·수납일지 묶음 상태). 주지 않으면 없다. Block 전환 수는 bit 답에 있다
}

// 마지막 끝난 날: 통계 화면은 매출 값에 오늘 진료 끝을 반영한 날을 준다. 매출을 주지 않으면 어제다
const lastDayOf = (range: StatsRange, revenue: StatsRevenueShown | undefined) => revenue?.lastDay ?? addDays(todayOf(range), -1)

export function StatsSections({ input, saved, split, report, hospitalName, groups, revision = 0, bit, revenue, sunap }: Props) {
  const pick = useMemo(() => pickReport(input, groups.groups), [input, groups.groups])
  // 예약·전환의 '진료한 날': 마감한 날을 읽는 기간과 같은 기간의 저장된 날 숫자에서 센다
  const worked = useMemo(() => workedDays(input.days, sunapSpan(input.range)), [input.days, input.range])
  const name = input.range.period === null ? input.range.name : null
  // 매출 셈 입력: 매출이 읽는 중·읽기 실패면 그 상태, 아니면 통계 기간 + 처방 칸 묶음(묶음이 읽는 중·실패면 그 상태, design.md '화면 잇기')
  const revenueState = revenue?.state
  const revenueDays = revenue?.days
  const revenueCodes = revenue?.codes
  const revenueMonthCodes = revenue?.monthCodes
  const noDayCodes = revenue?.noDayCodes ?? false
  const lastDay = revenue?.lastDay
  const revenueIn = useMemo((): RevenueInput | 'reading' | 'read-failed' | null => {
    if (revenueState === undefined || revenueDays === undefined || revenueCodes === undefined || revenueMonthCodes === undefined || lastDay === undefined) return null
    if (revenueState !== 'ready') return revenueState
    return {
      range: input.range,
      lastDay,
      days: revenueDays,
      codes: revenueCodes,
      monthCodes: revenueMonthCodes,
      groups: groups.state === 'ready' ? groups.groups : groups.state,
      noDayCodes,
    }
  }, [input.range, revenueState, revenueDays, revenueCodes, revenueMonthCodes, lastDay, noDayCodes, groups.state, groups.groups])
  const [mode, setMode] = useState<RevenueMode>('out')
  const rough = useMemo(() => (revenueIn === null ? null : roughInfo(revenueIn)), [revenueIn])
  // 참고 금액이 있는 날이 없는 기간으로 바뀌면 켜 둔 값이 있어도 꺼짐으로 센다(스위치도 꺼짐으로 보인다)
  const shownMode: RevenueMode = rough !== null && rough.roughDays > 0 ? mode : 'out'
  const summaryRevenue = useMemo(() => (revenueIn === null ? undefined : revenueCells(revenueIn, shownMode)), [revenueIn, shownMode])
  const tabs = useMemo(() => (revenueIn === null || typeof revenueIn === 'string' ? revenueIn : revenueTabs(revenueIn)), [revenueIn])
  return (
    <div className={STACK}>
      <SectionAnchor id={SUMMARY_ID!}>
        <PeriodSummary input={input} saved={saved} />
      </SectionAnchor>
      {summaryRevenue && <RevenueSummary cells={summaryRevenue} mode={shownMode} onMode={setMode} rough={rough} />}
      <StatsCard id={PATIENTS_ID} title={PATIENTS} desc={cardRangeText(input.range, lastDayOf(input.range, revenue))}>
        <PatientTrendSection input={input} saved={saved} />
        <RevisitSection input={input} saved={saved} />
        {bit !== undefined && <PatientMixSection view={bit} range={input.range} hospitalName={hospitalName} />}
      </StatsCard>
      {revenue !== undefined && tabs !== null && (
        <StatsCard id={REVENUE_ID} title={REVENUE}>
          <RevenueSection tabs={tabs} noDayCodes={noDayCodes} onReread={revenue.onReread} mode={shownMode} onMode={setMode} rough={rough} />
        </StatsCard>
      )}
      {sunap !== undefined && (
        <StatsCard id={SUNAP_ID} title={SUNAP}>
          <SunapSection closed={sunap.closed} groups={sunap.groups} onReread={sunap.onReread} bit={bit ?? null} worked={worked} />
        </StatsCard>
      )}
      <StatsCard id={RX_ID} title={RX} desc={RX_DESC}>
        <RxSection
          tabs={[
            { name: '묶음별 추세', panel: <TreatmentTrendSection input={input} saved={saved} groups={groups} revision={revision} /> },
            { name: '처방별 신환·재진', panel: <RxSplitSection view={split} hospitalName={hospitalName} saved={saved} name={name} /> },
            { name: '처방 골라 보기', panel: <RxPickerSection input={input} saved={saved} hospitalName={hospitalName} revision={revision} /> },
          ]}
        />
      </StatsCard>
      <StatsCard id={OPS_ID} title={OPS} desc={OPS_DESC}>
        {bit === undefined ? (
          <WeekdaySection days={input.days} range={input.range} saved={saved} />
        ) : (
          <div className={OPS_ROW}>
            <WeekdaySection days={input.days} range={input.range} saved={saved} className="min-[1200px]:basis-3/10" />
            <VisitHoursSection view={bit} range={input.range} className="min-[1200px]:basis-7/10" />
          </div>
        )}
        {bit !== undefined && <DoctorsSection view={bit} range={input.range} hospitalName={hospitalName} />}
      </StatsCard>
      {/* 고르기에 들어오고 나갈 때 다시 그린다: [고른 기간 보고]가 처음 눌리고, 나가면 [오늘 일일보고]다 */}
      <StatsCard id={REPORT_ID} title={REPORT} desc={REPORT_DESC}>
        <ReportSection key={pick === null ? 'quick' : 'pick'} report={report} hospitalName={hospitalName} today={todayOf(input.range)} saved={saved} pick={pick} />
      </StatsCard>
    </div>
  )
}

// 읽는 동안의 기다리는 자리(stats AC-514.1, first90 AC-4411.1·AC-4408.2): 그린 화면과 같은 차례의 환자 요약 · 매출 요약 + 카드 여섯(예약·전환 포함), 자리마다 "불러오는 중" 한 줄.
// 바로가기 id는 없다(stats-pc-ux AC-4002.6: 숨은 칸 묶음만 id를 가진다). 카드 안 작은 칸 이름은 그리지 않는다
export function StatsWaiting({ range, lastDay }: { range: StatsRange; lastDay: string }) {
  return (
    <div className={STACK}>
      <StatsCard title={SUMMARY} desc={summaryDesc(range)}>
        <WaitingLine />
      </StatsCard>
      <StatsCard title={REVENUE_SUMMARY} desc={REVENUE_SUMMARY_DESC}>
        <WaitingLine />
      </StatsCard>
      <StatsCard title={PATIENTS} desc={cardRangeText(range, lastDay)}>
        <WaitingLine />
      </StatsCard>
      <StatsCard title={REVENUE}>
        <WaitingLine />
      </StatsCard>
      <StatsCard title={SUNAP}>
        <WaitingLine />
      </StatsCard>
      <StatsCard title={RX} desc={RX_DESC}>
        <WaitingLine />
      </StatsCard>
      <StatsCard title={OPS} desc={OPS_DESC}>
        <WaitingLine />
      </StatsCard>
      <StatsCard title={REPORT} desc={REPORT_DESC}>
        <WaitingLine />
      </StatsCard>
    </div>
  )
}

function WaitingLine() {
  return (
    <p className="mt-3 flex items-center gap-1.5 text-body text-muted">
      <Icon name="clock" size={14} className="shrink-0" />
      불러오는 중
    </p>
  )
}
