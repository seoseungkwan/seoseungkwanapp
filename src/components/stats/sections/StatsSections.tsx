import { useMemo } from 'react'
import { pickReportText, type ReportRx } from '@/components/stats/periodPick'
import { treatmentRows } from '@/components/stats/treatmentView'
import type { StatsRxGroupsView } from '@/components/stats/useStatsRxGroups'
import { summaryCells, type StatsInput } from '@/components/stats/view'
import type { RxGroup } from '@/types/rxGroups'
import type { RxSplitView } from '@/types/stats'
import { PatientTrendSection } from './PatientTrendSection'
import { PeriodSummary } from './PeriodSummary'
import { ReportSection, type PickReport, type ReportData } from './ReportSection'
import { RevisitSection } from './RevisitSection'
import { RxPickerSection } from './RxPickerSection'
import { RxSplitSection } from './RxSplitSection'
import { todayOf } from './parts'
import { TreatmentTrendSection } from './TreatmentTrendSection'
import { WeekdaySection } from './WeekdaySection'

// 섹션 여덟을 승인본 차례·배치로 놓는다 (treatment-trend AC-1201.1이 rx-picker AC-801.1·stats AC-513.1을 대신한다, 시안 notes.md §2).
// 1024px 이상 12칸(12 / 8·4 / 12 / 12 / 12 / 7·5), 오른쪽 칸은 왼쪽 1px line + 안쪽 24. 그보다 좁으면 모두 12칸이고 세로선이 없다.
// 처방별 추세가 전체 폭이라 처방별 신환·재진도 옆 칸 없이 전체 폭이다.
// 고른 기간(stats-period, range.period null)이면 보고 칸에 [고른 기간 보고](pickReportText)를, 처방별 신환·재진에 기간 이름을 넘긴다(AC-1707.1·AC-1704.4)

const SIDE = 'lg:border-l lg:border-line lg:pl-6'

type Props = {
  input: StatsInput
  saved: boolean // 저장된 숫자가 하나라도 있음
  split: RxSplitView | null // null = 비트 PC에서 불러온 자료가 없음
  report: ReportData | null
  hospitalName: string
  groups: StatsRxGroupsView // 처방별 추세 묶음 훅 값(통계 화면이 한 번 부른다)
  revision?: number // 저장에 성공하거나 [다시 읽기]를 누를 때마다 는다. 처방 찾기 목록이 넓은 범위를 다시 읽는 때를 안다
}

// 처방별 추세의 준비된 줄을 건수 차례로(같으면 묶음 차례). 보고 글은 이 가운데 1·2위만 쓴다
function topTreatments(input: StatsInput, groups: readonly RxGroup[]): ReportRx[] {
  const ready = treatmentRows(input, groups).flatMap((row) => (row.kind === 'ready' ? [{ name: row.group.name, count: row.row.count }] : []))
  return ready.sort((a, b) => b.count - a.count)
}

// 고른 기간 보고(빠른 단추는 null = 지금 보고 칸 그대로)
function pickReportOf(input: StatsInput, groups: readonly RxGroup[]): PickReport | null {
  const { range } = input
  if (range.period !== null) return null
  return { label: range.label, text: pickReportText(range, summaryCells(input), topTreatments(input, groups)) }
}

export function StatsSections({ input, saved, split, report, hospitalName, groups, revision = 0 }: Props) {
  const pick = useMemo(() => pickReportOf(input, groups.groups), [input, groups.groups])
  const name = input.range.period === null ? input.range.name : null
  return (
    <div className="grid grid-cols-12 gap-x-6">
      <PeriodSummary input={input} saved={saved} className="col-span-12" />
      <PatientTrendSection input={input} saved={saved} className="col-span-12 lg:col-span-8" />
      <RevisitSection input={input} saved={saved} className={`col-span-12 lg:col-span-4 ${SIDE}`} />
      <TreatmentTrendSection input={input} saved={saved} groups={groups} revision={revision} className="col-span-12" />
      <RxSplitSection view={split} hospitalName={hospitalName} saved={saved} name={name} className="col-span-12" />
      <RxPickerSection input={input} saved={saved} hospitalName={hospitalName} revision={revision} className="col-span-12" />
      {/* 고르기에 들어오고 나갈 때 다시 그린다: 들어오면 [고른 기간 보고], 나가면 [오늘 일일보고]가 눌린다. 고르기 안에서 기간을 옮기면 고른 보고가 그대로다 */}
      <ReportSection
        key={pick === null ? 'quick' : 'pick'}
        report={report}
        hospitalName={hospitalName}
        today={todayOf(input.range)}
        saved={saved}
        pick={pick}
        className="col-span-12 lg:col-span-7"
      />
      <WeekdaySection days={input.days} range={input.range} saved={saved} className={`col-span-12 lg:col-span-5 ${SIDE}`} />
    </div>
  )
}
