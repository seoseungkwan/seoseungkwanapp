import { useMemo } from 'react'
import { useClinicProfile } from '@/components/clinic/useClinicProfile'
import { Icon } from '@/components/common/Icon'
import { pickReportText, type ReportRx } from '@/components/stats/periodPick'
import { revenueCells, revenueTabs, type RevenueInput } from '@/components/stats/revenueView'
import { TOC_LINKS } from '@/components/stats/StatsToc'
import { treatmentRows } from '@/components/stats/treatmentView'
import type { StatsRxGroupsView } from '@/components/stats/useStatsRxGroups'
import type { WideDays } from '@/components/stats/useWideDays'
import { sunapSpan, workedDays } from '@/components/stats/sunapView'
import { UIS_REPORT_DESC, UIS_RX_DESC, UIS_WHY } from '@/components/stats/uisarang/texts'
import { UisAgeSection } from '@/components/stats/uisarang/UisAgeSection'
import { UisNoteSection } from '@/components/stats/uisarang/UisNote'
import { UisRxSection } from '@/components/stats/uisarang/UisRxSection'
import { useUisPeriods, type UisPeriodsView } from '@/components/stats/uisarang/useUisPeriods'
import { summaryCells, summaryDesc, type StatsInput, type StatsRange } from '@/components/stats/view'
import type { ViewSums } from '@/components/stats/viewSums'
import { buildAlerts } from '@/lib/analytics/alerts'
import { addDays } from '@/lib/analytics/dates'
import type { CalCountRow } from '@/types/calendar'
import type { RevenueCodeTotal, RevenueMonthCode, SavedRevenueDay } from '@/types/revenue'
import type { RxGroup } from '@/types/rxGroups'
import type { RxSplitView } from '@/types/stats'
import { AlertsSection } from './AlertsSection'
import { CalendarSection, type StatsCalendarShown } from './CalendarSection'
import { DoctorsSection } from './DoctorsSection'
import { DropoffSection } from './DropoffSection'
import { GoalSection, type StatsGoalsShown } from './GoalSection'
import { HolidaySection } from './HolidaySection'
import { PatientMixSection, type BitSectionsShown } from './PatientMixSection'
import { PatientTrendSection } from './PatientTrendSection'
import { PeriodSummary } from './PeriodSummary'
import { MonthlyReportSection, ReportSection, reportTitle, type PickReport, type ReportData } from './ReportSection'
import { RevenueSection } from './RevenueSection'
import { RevenueSummary } from './RevenueSummary'
import { RevisitSection } from './RevisitSection'
import { RxPickerSection } from './RxPickerSection'
import { RxSection } from './RxSection'
import { RxSplitSection } from './RxSplitSection'
import { SunapSection, type StatsSunapShown } from './SunapSection'
import { cardRangeText, NoAnchor, SectionAnchor, StatsCard, todayOf } from './parts'
import { TreatmentTrendSection } from './TreatmentTrendSection'
import { VisitHoursSection } from './VisitHoursSection'
import { WeekdaySection } from './WeekdaySection'

// 통계 틀 (first90 REQ-4411 AC-4411.1·AC-4411.3, design.md 5-5, 시안 docs/mockups/first90/redesign.html): 요약 자리 → 큰 카드 다섯을 한 줄씩 쌓는다(사이 16px).
//   요약 자리(stats-summary): 환자 요약 카드(맨 위 '평소와 다른 것' 카드가 없으면 이 카드가 id를 갖는다) + 바로 뒤 매출 요약 카드(revenue를 받을 때만, first90 AC-4408.2).
//     wide를 받으면 맨 위에 '평소와 다른 것' 카드(stats-insights AC-6101.5, 견줄 날이 하루도 없으면 없다 — 있으면 이 카드가 요약 자리 id를 갖는다: 바로가기가 맨 위로 간다),
//     goals도 받으면 매출 요약 뒤에 '이번 달 목표' 카드(AC-6102.4·AC-6102.5). 둘 다 오늘 기준이고 기간 고르기와 상관없다(새 바로가기 칸은 없다, design.md '원칙')
//   환자(stats-patients): 환자 수 추이 · 신환 재방문율 · 환자 구성(비트)
//   매출(stats-revenue): 매출 칸(탭 넷). revenue를 받을 때만(stats-revenue AC-4107.1, 통계 화면은 늘 준다).
//     bit를 받으면 다섯째 탭 '신환 1명당'(stats-insights AC-6106.4, 비트 칸이라 bit를 줄 때만)이 더해진다
//   예약·전환(stats-sunap, spec sunap-ilji AC-4906.1): 초진·90일 예약률 · Block 전환 칸 셋. sunap을 받을 때만(통계 화면은 늘 준다)
//   예약(stats-calendar, spec clinic-calendar AC-5907.3): 예약 탭 예약의 최근 12달(통계 기간과 상관없음). calendar를 받을 때만(통계 화면은 늘 준다)
//   처방(stats-rx): 처방 칸 + 탭 셋(stats-pc-ux AC-4003.1). 탭 안 칸은 지금 칸 그대로(props도 그대로)이고 Section 탭 패널 모드로 그려진다.
//     bit를 받으면 넷째 탭 '몇 번까지 받나'(stats-insights AC-6103.2, 비트 칸이라 bit를 줄 때만)가 더해진다
//   진료 운영(stats-ops): 요일별 · 시간대별(비트)은 1200px 이상 한 줄 30% · 70%, 좁으면 쌓는다. 원장님별(비트)은 그 아래 전체 폭.
//     wide를 받으면 맨 끝에 '휴일에 따라'(stats-insights AC-6107.3, 저장된 날이 없으면 없다)
//   보고(stats-report): 원장님 보고 문장 칸. wide를 받으면 그 아래 '월간 보고서'(stats-insights AC-6108.1, 최근 12달에 저장된 달이 없으면 없다).
//     인쇄([인쇄])에는 그 보고서 종이만 나온다 — 종이 밖(다른 카드·카드 머리·단추·앱 틀)은 MonthlyReport의 인쇄 규칙이 가린다
// 카드 안 칸은 h3 작은 칸이고 칸 사이는 얇은 선뿐이다(parts.tsx StatsCard). 비트 칸은 bit를 받을 때만 그린다(stats-bit-sections AC-2706.1, 통계 화면은 늘 준다).
// 고른 기간(stats-period)이면 보고 칸에 [고른 기간 보고](저장된 숫자로 만든 글)를 넣고, 처방별 신환·재진 설명 끝에 기간 이름을 붙인다.
// 매출(stats-revenue): revenue를 받으면 매출 요약 카드(칸 둘, bit-total AC-6904.1)도 넣는다. 숫자는 revenueView(순수)가 통계 기간·처방 칸 묶음으로 센다.
// 매출 요약·매출 카드에 스위치가 없다(bit-total AC-6905.1): 두 카드 모두 그날 매출(dayRevenue) 셈 하나다
// 병원 정보(clinic-profile REQ-6606, design.md 8절): 여기서 useClinicProfile을 한 번 불러 칸마다 값으로 넘긴다 — 호칭은 보고 카드·보고 칸 제목과
// 매출 칸 [어떻게 세나요?] 글(AC-6606.3), 저장된 진료시간은 시간대별 접수(AC-6606.1), 휴진일은 휴일에 따라(AC-6606.2).
// 읽는 중·실패·줄 없음이면 호칭은 기본값 '원장님'이고 진료시간은 넘기지 않아(null) 지금처럼 그린다
// 의사랑 의원(uisarang-upload REQ-8812, design.md §10-3): 병원 정보를 읽었고 emr가 uisarang이면 uis다(읽는 중·실패는 비트 그대로).
//   비트 칸(bit)은 그리지 않고, 셀 수 없는 칸은 자리를 둔 채 셀 수 없음 안내(UisNoteSection)다. 환자 구성은 UisAgeSection, 처방 카드는 UisRxSection,
//   처방·나이대 줄은 useUisPeriods(지금 기간, revision)로 한 번 읽어 두 칸에 넘긴다. 진료 운영 윗줄은 요일별 · 시간대별 · 원장님별 세 칸 한 줄(시안 .opsrow)

const REPORT_RX = 2
// 바로가기 띠 바로 아래 첫 자리(환자 요약)의 위 여백: 칸 위 48px(휴대폰 32px) 대신 24px(휴대폰 20px) (stats-pc-ux 기본값 14)
const FIRST_GAP = '[&>:first-child]:mt-6 max-md:[&>:first-child]:mt-5'
// 자리 id는 바로가기 띠 링크와 같은 차례다(AC-4411.2)
const [SUMMARY_ID, PATIENTS_ID, REVENUE_ID, SUNAP_ID, CALENDAR_ID, RX_ID, OPS_ID, REPORT_ID] = TOC_LINKS.map((link) => link.id)
// 카드 다섯의 h2·옆 글(AC-4411.3). 환자 카드 옆 글은 기간에 따라 cardRangeText가 만든다. 매출 카드 옆 글은 매출 칸 설명 글이다(같은 제목 칸 규칙)
const SUMMARY = '환자 요약'
const REVENUE_SUMMARY = '매출 요약'
const REVENUE_SUMMARY_DESC = '총진료비 · 수납한 날 기준'
const PATIENTS = '환자'
const REVENUE = '매출'
const SUNAP = '예약·전환'
const CALENDAR = '예약' // 옆 글은 CalendarSection이 같은 제목 칸 규칙으로 카드 머리에 놓는다
const RX = '처방'
const RX_DESC = '만들어 둔 묶음마다 건수와 총환자 대비 · 같은 날 같은 환자는 1건'
const OPS = '진료 운영'
const OPS_DESC = '언제 붐비는지 · 원장님마다'
// 요약 자리 카드 둘(stats-insights). 칸(AlertsSection·GoalSection) 제목과 같아 칸 머리 없이 카드 h2 하나다(parts.tsx 같은 제목 칸 규칙)
const ALERTS = '평소와 다른 것'
const GOAL = '이번 달 목표'
const REPORT_DESC = '비트 PC에서 불러온 숫자로 만든 보고 글 · 환자 이름은 쓰지 않아요'
const STACK = `flex flex-col gap-4 ${FIRST_GAP}`
// 진료 운영 카드 윗줄(요일별 30% · 시간대별 70%, 시안 .s-row-ops). 칸은 min-w-0이라 줄어든다
const OPS_ROW = 'flex min-w-0 flex-col gap-6 min-[1200px]:flex-row min-[1200px]:gap-8'
// 의사랑 진료 운영 윗줄: 세 칸이 늘 한 줄로 같은 폭(시안 .opsrow, PC 화면만)
const UIS_OPS_ROW = 'flex min-w-0 gap-8'
const UIS_OPS_CELL = 'flex-1'
const UIS_READING: UisPeriodsView = { state: 'reading' }

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
  calendar?: StatsCalendarShown // 예약 카드(최근 12달 예약 줄·설정, useStatsCalendar). 주지 않으면 없다
  wide?: WideDays // 넓은 하루 읽기(오늘 앞 12달, useWideDays). 주지 않으면 '평소와 다른 것'·'휴일에 따라'·'이번 달 목표'가 없다
  goals?: StatsGoalsShown // 이번 달 목표·하루 매출(useStatsGoals). 내원·신환 하루 숫자는 wide에서 온다. 주지 않으면 '이번 달 목표'가 없다
  salesRevision?: number // revision + 비트 매출 읽기가 끝난 횟수. 월간 보고서가 고른 달 매출·목표를 다시 읽는 때다(AC-6108.5). 주지 않으면 revision
  // 다른 의원을 보는 중 저장 합계(admin-view AC-8025.1, viewSums). Block 전환·몇 번까지 받나는 값이 있으면 bit 대신 이것으로 그린다
  // (처방별 신환·재진은 통계 화면이 split으로 넘긴다). null 칸·주지 않음이면 지금과 같다
  sums?: ViewSums
}

// 마지막 끝난 날: 통계 화면은 매출 값에 오늘 진료 끝을 반영한 날을 준다. 매출을 주지 않으면 어제다
const lastDayOf = (range: StatsRange, revenue: StatsRevenueShown | undefined) => revenue?.lastDay ?? addDays(todayOf(range), -1)

// '평소와 다른 것' 카드를 그리는지: 읽기 실패(오류 카드) · 견줄 날이나 알림이 있음. 읽는 중·견줄 날이 하루도 없으면 칸이 비므로 카드도 없다.
// 묶음 지표는 내원을 견줄 수 있는 날에만 견줄 수 있어 묶음 없이 물어도 AlertsSection과 답(그리는지)이 같다
function alertsShown(today: string, wide: Pick<WideDays, 'state' | 'days'>, cal: readonly CalCountRow[] | null): boolean {
  if (wide.state === 'failed') return true
  return wide.state === 'ready' && buildAlerts({ today, days: wide.days, cal }) !== null
}

export function StatsSections({ input, saved, split, report, hospitalName, groups, revision = 0, bit, revenue, sunap, calendar, wide, goals, salesRevision = revision, sums }: Props) {
  const pick = useMemo(() => pickReport(input, groups.groups), [input, groups.groups])
  const clinic = useClinicProfile()
  const honorific = clinic.profile.honorific
  const clinicHours = clinic.saved ? clinic.profile.hours : null
  const closedDates = clinic.profile.closedDates
  const uis = clinic.state === 'ready' && clinic.profile.emr === 'uisarang'
  // 비트 전용 칸 값: 의사랑 의원이면 주지 않은 것과 같다(칸·탭이 없다)
  const bitShown = uis ? undefined : bit
  const periods = useUisPeriods(uis ? input.range.current : null, revision) ?? UIS_READING
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
  const summaryRevenue = useMemo(() => (revenueIn === null ? undefined : revenueCells(revenueIn)), [revenueIn])
  const tabs = useMemo(() => (revenueIn === null || typeof revenueIn === 'string' ? revenueIn : revenueTabs(revenueIn, honorific)), [revenueIn, honorific])
  // 알림·휴일·목표(stats-insights)는 오늘 기준이다. 예약 알림은 예약 칸이 읽은 수 세기 줄(읽는 중·실패면 없이 센다)
  const today = todayOf(input.range)
  const calRows = calendar?.rows
  const cal = calRows === undefined || typeof calRows === 'string' ? null : calRows
  // 넓은 하루 값은 그릴 때마다 새 객체라 상태·줄로 묻는다
  const wideState = wide?.state
  const wideDays = wide?.days
  const alertsFirst = useMemo(
    () => wideState !== undefined && wideDays !== undefined && alertsShown(today, { state: wideState, days: wideDays }, cal),
    [today, wideState, wideDays, cal],
  )
  const summary = <PeriodSummary input={input} saved={saved} uis={uis} />
  return (
    <div className={STACK}>
      {wide !== undefined && alertsFirst && (
        <StatsCard id={SUMMARY_ID} title={ALERTS}>
          <AlertsSection today={today} wide={wide} groups={groups.groups} cal={cal} />
        </StatsCard>
      )}
      {alertsFirst ? <NoAnchor>{summary}</NoAnchor> : <SectionAnchor id={SUMMARY_ID!}>{summary}</SectionAnchor>}
      {summaryRevenue && <RevenueSummary cells={summaryRevenue} />}
      {wide !== undefined && goals !== undefined && (
        <StatsCard title={GOAL}>
          <GoalSection
            {...goals}
            days={wide.state === 'ready' ? wide.days : wide.state}
            onReread={() => {
              goals.onReread()
              wide.retry()
            }}
          />
        </StatsCard>
      )}
      <StatsCard id={PATIENTS_ID} title={PATIENTS} desc={cardRangeText(input.range, lastDayOf(input.range, revenue))}>
        <PatientTrendSection input={input} saved={saved} />
        {uis ? <UisNoteSection title="신환 재방문율" why={UIS_WHY.revisit} /> : <RevisitSection input={input} saved={saved} />}
        {uis ? (
          <UisAgeSection periods={periods} input={input} />
        ) : (
          bitShown !== undefined && <PatientMixSection view={bitShown} range={input.range} hospitalName={hospitalName} />
        )}
      </StatsCard>
      {revenue !== undefined && tabs !== null && (
        <StatsCard id={REVENUE_ID} title={REVENUE}>
          <RevenueSection
            tabs={tabs}
            noDayCodes={noDayCodes}
            onReread={revenue.onReread}
            bit={bitShown === undefined ? undefined : { view: bitShown, range: input.range }}
            groups={groups.groups}
            uis={uis}
          />
        </StatsCard>
      )}
      {sunap !== undefined && (
        <StatsCard id={SUNAP_ID} title={SUNAP}>
          <SunapSection closed={sunap.closed} groups={sunap.groups} onReread={sunap.onReread} bit={bitShown ?? null} worked={worked} saved={sums?.sunap ?? undefined} uis={uis} />
        </StatsCard>
      )}
      {calendar !== undefined && (
        <StatsCard id={CALENDAR_ID} title={CALENDAR}>
          <CalendarSection {...calendar} />
        </StatsCard>
      )}
      <StatsCard id={RX_ID} title={RX} desc={uis ? UIS_RX_DESC : RX_DESC}>
        {uis ? (
          <UisRxSection periods={periods} input={input} groups={groups} />
        ) : (
          <RxSection
            tabs={[
              { name: '묶음별 추세', panel: <TreatmentTrendSection input={input} saved={saved} groups={groups} revision={revision} /> },
              { name: '처방별 신환·재진', panel: <RxSplitSection view={split} hospitalName={hospitalName} saved={saved} name={name} /> },
              { name: '처방 골라 보기', panel: <RxPickerSection input={input} saved={saved} hospitalName={hospitalName} revision={revision} /> },
              ...(bitShown === undefined ? [] : [{ name: '몇 번까지 받나', panel: <DropoffSection view={bitShown} groups={groups.groups} saved={sums?.dropoff ?? undefined} /> }]),
            ]}
          />
        )}
      </StatsCard>
      <StatsCard id={OPS_ID} title={OPS} desc={OPS_DESC}>
        {uis ? (
          <div className={UIS_OPS_ROW}>
            <WeekdaySection days={input.days} range={input.range} saved={saved} className={UIS_OPS_CELL} />
            <UisNoteSection title="시간대별 접수" why={UIS_WHY.hours} className={UIS_OPS_CELL} />
            <UisNoteSection title="원장님별" why={UIS_WHY.doctors} className={UIS_OPS_CELL} />
          </div>
        ) : bitShown === undefined ? (
          <WeekdaySection days={input.days} range={input.range} saved={saved} />
        ) : (
          <div className={OPS_ROW}>
            <WeekdaySection days={input.days} range={input.range} saved={saved} className="min-[1200px]:basis-3/10" />
            <VisitHoursSection view={bitShown} range={input.range} className="min-[1200px]:basis-7/10" hours={clinicHours} />
          </div>
        )}
        {bitShown !== undefined && <DoctorsSection view={bitShown} range={input.range} hospitalName={hospitalName} />}
        {wide !== undefined && <HolidaySection today={today} wide={wide} closedDates={closedDates} />}
      </StatsCard>
      {/* 고르기에 들어오고 나갈 때 다시 그린다: [고른 기간 보고]가 처음 눌리고, 나가면 [오늘 일일보고]다 */}
      <StatsCard id={REPORT_ID} title={reportTitle(honorific)} desc={uis ? UIS_REPORT_DESC : REPORT_DESC}>
        <ReportSection
          key={pick === null ? 'quick' : 'pick'}
          report={report}
          hospitalName={hospitalName}
          today={todayOf(input.range)}
          saved={saved}
          pick={pick}
          honorific={honorific}
          uis={uis}
        />
        {wide !== undefined && (
          <MonthlyReportSection
            today={today}
            hospitalName={hospitalName}
            wide={wide}
            groups={groups.groups}
            calendar={calendar}
            bit={bitShown}
            goal={goals?.goal}
            revision={salesRevision}
            uis={uis}
          />
        )}
      </StatsCard>
    </div>
  )
}

// 읽는 동안의 기다리는 자리(stats AC-514.1, first90 AC-4411.1·AC-4408.2): 그린 화면과 같은 차례의 환자 요약 · 매출 요약 + 카드 일곱(예약·전환·예약 포함), 자리마다 "불러오는 중" 한 줄.
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
      <StatsCard title={CALENDAR}>
        <WaitingLine />
      </StatsCard>
      <StatsCard title={RX} desc={RX_DESC}>
        <WaitingLine />
      </StatsCard>
      <StatsCard title={OPS} desc={OPS_DESC}>
        <WaitingLine />
      </StatsCard>
      {/* 기다리는 자리는 병원 정보를 읽지 않는다(기본 호칭). 숫자가 오면 StatsSections가 호칭 제목으로 그린다 */}
      <StatsCard title={reportTitle()} desc={REPORT_DESC}>
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
