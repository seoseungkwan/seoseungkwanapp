import { MonthBars } from './MonthBars'
import { BlockHead, BlockSub, KpiRow, SECTION } from './RevenueParts'
import type { TrendView } from './view'

// 매출 추이 덩어리 (TASK-9, 시안 gen.py trend())
export function RevenueTrend({ view }: { view: TrendView }) {
  return (
    <section className={SECTION}>
      <BlockHead title={view.title}>
        <BlockSub>{view.sub}</BlockSub>
      </BlockHead>
      <KpiRow kpis={view.kpis} />
      {view.chart && <MonthBars chart={view.chart} size="tall" />}
    </section>
  )
}
