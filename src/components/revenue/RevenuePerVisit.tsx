import { MonthBars } from './MonthBars'
import { BlockHead, BlockSub, KpiRow, Note, NoticeLine, SECTION } from './RevenueParts'
import type { PerVisitView } from './view'

// 건당 진료비 덩어리 (TASK-9, 시안 gen.py per_visit()). 접수 건수를 확인하지 못한 날이 있으면 안내 줄이 있다(AC-008.7, 글자는 view.ts)
export function RevenuePerVisit({ view }: { view: PerVisitView }) {
  return (
    <section className={SECTION}>
      <BlockHead title={view.title}>
        <BlockSub>{view.sub}</BlockSub>
      </BlockHead>
      {view.notice && <NoticeLine notice={view.notice} />}
      <KpiRow kpis={view.kpis} />
      {view.chart && <MonthBars chart={view.chart} size="short" />}
      <Note>{view.note}</Note>
    </section>
  )
}
