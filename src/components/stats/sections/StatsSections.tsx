import type { StatsInput } from '@/components/stats/view'
import type { RxSplitView } from '@/types/stats'
import { PatientTrendSection } from './PatientTrendSection'
import { PeriodSummary } from './PeriodSummary'
import { ReportSection, type ReportData } from './ReportSection'
import { RevisitSection } from './RevisitSection'
import { RxSplitSection } from './RxSplitSection'
import { RxTrendSection } from './RxTrendSection'
import { todayOf } from './parts'
import { WeekdaySection } from './WeekdaySection'

// 섹션 일곱을 승인본 차례·배치로 놓는다 (stats REQ-513 AC-513.1, 시안 notes.md §2).
// 1024px 이상 12칸(12 / 8·4 / 7·5 / 7·5), 오른쪽 칸은 왼쪽 1px line + 안쪽 24. 그보다 좁으면 모두 12칸이고 세로선이 없다

const SIDE = 'lg:border-l lg:border-line lg:pl-6'

type Props = {
  input: StatsInput
  saved: boolean // 저장된 숫자가 하나라도 있음
  split: RxSplitView | null // null = 비트 PC에서 불러온 자료가 없음
  report: ReportData | null
  hospitalName: string
}

export function StatsSections({ input, saved, split, report, hospitalName }: Props) {
  return (
    <div className="grid grid-cols-12 gap-x-6">
      <PeriodSummary input={input} saved={saved} className="col-span-12" />
      <PatientTrendSection input={input} saved={saved} className="col-span-12 lg:col-span-8" />
      <RevisitSection input={input} saved={saved} className={`col-span-12 lg:col-span-4 ${SIDE}`} />
      <RxTrendSection input={input} saved={saved} className="col-span-12 lg:col-span-7" />
      <RxSplitSection view={split} hospitalName={hospitalName} saved={saved} className={`col-span-12 lg:col-span-5 ${SIDE}`} />
      <ReportSection report={report} hospitalName={hospitalName} today={todayOf(input.range)} saved={saved} className="col-span-12 lg:col-span-7" />
      <WeekdaySection days={input.days} range={input.range} saved={saved} className={`col-span-12 lg:col-span-5 ${SIDE}`} />
    </div>
  )
}
