import { useMemo } from 'react'
import { pickReportText, type ReportRx } from '@/components/stats/periodPick'
import { TOC_LINKS } from '@/components/stats/StatsToc'
import { treatmentRows } from '@/components/stats/treatmentView'
import type { StatsRxGroupsView } from '@/components/stats/useStatsRxGroups'
import { summaryCells, type StatsInput } from '@/components/stats/view'
import type { RxGroup } from '@/types/rxGroups'
import type { RxSplitView } from '@/types/stats'
import { DoctorsSection } from './DoctorsSection'
import { PatientMixSection, type BitSectionsShown } from './PatientMixSection'
import { PatientTrendSection } from './PatientTrendSection'
import { PeriodSummary } from './PeriodSummary'
import { ReportSection, type PickReport, type ReportData } from './ReportSection'
import { RevisitSection } from './RevisitSection'
import { RxPickerSection } from './RxPickerSection'
import { RxSection } from './RxSection'
import { RxSplitSection } from './RxSplitSection'
import { SectionAnchor, todayOf } from './parts'
import { TreatmentTrendSection } from './TreatmentTrendSection'
import { VisitHoursSection } from './VisitHoursSection'
import { WeekdaySection } from './WeekdaySection'

// 섹션 여섯을 승인본 차례·배치로 놓는다 (treatment-trend AC-1201.1이 rx-picker AC-801.1·stats AC-513.1을 대신한다, 시안 notes.md §2).
// 1024px 이상 12칸(12 / 8·4 / 12 / 7·5), 오른쪽 칸은 왼쪽 1px line + 안쪽 24. 그보다 좁으면 모두 12칸이고 세로선이 없다.
// 처방 세 칸은 전체 폭 한 칸 `처방` + 탭 셋이다(stats-pc-ux AC-4003.1, 시안 docs/mockups/stats-pc-ux notes.md §4): 탭 안 칸은 지금 칸 그대로(props도 그대로)이고
// Section 탭 패널 모드로 그려진다(h2 없이, 설명·단추는 처방 칸 머리 줄).
// 칸마다 목차 자리(SectionAnchor, 목차 띠 TOC_LINKS id)를 감싼다(AC-4002.6). 첫 칸의 위 여백만 줄인다(목차 띠 바로 아래, 기본값 14).
// 고른 기간(stats-period)이면 보고 칸에 [고른 기간 보고](저장된 숫자로 만든 글)를 넣고, 처방별 신환·재진 설명 끝에 기간 이름을 붙인다.
// 여섯 칸 뒤에 비트 전용 세 칸(환자 구성 → 시간대별 접수 → 원장님별, 모두 12칸, stats-bit-sections AC-2706.1). 세 칸은 bit를 받을 때만 그린다(통계 화면은 늘 준다)

const SIDE = 'lg:border-l lg:border-line lg:pl-6'
const REPORT_RX = 2
// 목차 띠 바로 아래 첫 칸(기간 요약)의 위 여백: 칸 사이 48px(휴대폰 32px) 대신 24px(휴대폰 20px) (design.md '배치')
const FIRST_GAP = '[&>:first-child]:mt-6 max-md:[&>:first-child]:mt-5'
// 칸 id는 목차 띠 링크와 같은 차례다(AC-4002.1)
const [SUMMARY_ID, TREND_ID, REVISIT_ID, RX_ID, REPORT_ID, WEEKDAY_ID, MIX_ID, HOURS_ID, DOCTORS_ID] = TOC_LINKS.map((link) => link.id)

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
}

export function StatsSections({ input, saved, split, report, hospitalName, groups, revision = 0, bit }: Props) {
  const pick = useMemo(() => pickReport(input, groups.groups), [input, groups.groups])
  const name = input.range.period === null ? input.range.name : null
  return (
    <div className={`grid grid-cols-12 gap-x-6 ${FIRST_GAP}`}>
      <SectionAnchor id={SUMMARY_ID!}>
        <PeriodSummary input={input} saved={saved} className="col-span-12" />
      </SectionAnchor>
      <SectionAnchor id={TREND_ID!}>
        <PatientTrendSection input={input} saved={saved} className="col-span-12 lg:col-span-8" />
      </SectionAnchor>
      <SectionAnchor id={REVISIT_ID!}>
        <RevisitSection input={input} saved={saved} className={`col-span-12 lg:col-span-4 ${SIDE}`} />
      </SectionAnchor>
      <SectionAnchor id={RX_ID!}>
        <RxSection
          tabs={[
            { name: '묶음별 추세', panel: <TreatmentTrendSection input={input} saved={saved} groups={groups} revision={revision} /> },
            { name: '처방별 신환·재진', panel: <RxSplitSection view={split} hospitalName={hospitalName} saved={saved} name={name} /> },
            { name: '처방 골라 보기', panel: <RxPickerSection input={input} saved={saved} hospitalName={hospitalName} revision={revision} /> },
          ]}
          className="col-span-12"
        />
      </SectionAnchor>
      {/* 고르기에 들어오고 나갈 때 다시 그린다: [고른 기간 보고]가 처음 눌리고, 나가면 [오늘 일일보고]다 */}
      <SectionAnchor id={REPORT_ID!}>
        <ReportSection
          key={pick === null ? 'quick' : 'pick'}
          report={report}
          hospitalName={hospitalName}
          today={todayOf(input.range)}
          saved={saved}
          pick={pick}
          className="col-span-12 lg:col-span-7"
        />
      </SectionAnchor>
      <SectionAnchor id={WEEKDAY_ID!}>
        <WeekdaySection days={input.days} range={input.range} saved={saved} className={`col-span-12 lg:col-span-5 ${SIDE}`} />
      </SectionAnchor>
      {bit !== undefined && (
        <>
          <SectionAnchor id={MIX_ID!}>
            <PatientMixSection view={bit} range={input.range} hospitalName={hospitalName} className="col-span-12" />
          </SectionAnchor>
          <SectionAnchor id={HOURS_ID!}>
            <VisitHoursSection view={bit} range={input.range} className="col-span-12" />
          </SectionAnchor>
          <SectionAnchor id={DOCTORS_ID!}>
            <DoctorsSection view={bit} range={input.range} hospitalName={hospitalName} className="col-span-12" />
          </SectionAnchor>
        </>
      )}
    </div>
  )
}
