import { StackBars } from './MonthBars'
import { BlockHead, BlockSub, DeltaCell, Note, NoticeLine, SECTION } from './RevenueParts'
import type { DeltaText, SplitRow } from './types'
import type { SplitView } from './view'

// 급여·비급여·기타 덩어리 (TASK-9, 시안 gen.py split()·split_none()). 왼쪽 표 + 오른쪽 13달 세 겹 막대, 폰은 위아래.
// 나눔을 못 한 날이 있으면 머리 아래에 안내 줄이 있고, 합계가 매출보다 작아도 화면에서 맞추지 않는다(AC-008.6)

const HEAD_CELL = 'h-9 border-b border-line px-2 text-right font-medium whitespace-nowrap text-muted last:pr-0'
const NUMBER_CELL = 'border-b border-line px-2 text-right whitespace-nowrap tabular-nums last:pr-0'
// 폰은 넷째 칸('지난달보다')부터(통계 매출 칸의 '작년 같은 때보다'도) 숨긴다
const PHONE_HIDDEN = 'max-md:hidden'

const ROW: Record<SplitRow['kind'], { name: string; number: string }> = {
  main: { name: 'h-11 border-b border-line pr-2 font-semibold text-ink', number: 'h-11 text-ink' },
  sub: { name: 'h-9 border-b border-line pr-2 pl-4 text-ink-2', number: 'h-9 text-ink-2' },
  sum: { name: 'h-11 border-t border-line-strong pr-2 font-semibold text-ink', number: 'h-11 border-t border-line-strong font-semibold text-ink' },
}

// 급여 표 한 벌. 통계 매출 칸(sections/RevenueSection)도 쓴다(stats-revenue design.md '칸 부품').
// lastYear(통계 고른 기간의 작년 비교, 기본값 6)가 있는 줄은 다섯째 칸 '작년 같은 때보다'를 그린다. 없으면(매출 화면) 지금 넷 칸 그대로다
export type SplitTableRow = SplitRow & { lastYear?: DeltaText | null }

export function SplitTable({ head, rows }: { head: readonly string[]; rows: readonly SplitTableRow[] }) {
  return (
    <table className="w-full border-collapse text-small">
      <thead>
        <tr>
          {head.map((name, index) => (
            <th key={name} scope="col" className={index === 0 ? 'h-9 border-b border-line pr-2 text-left font-medium whitespace-nowrap text-muted' : `${HEAD_CELL} ${index >= 3 ? PHONE_HIDDEN : ''}`}>
              {name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const tone = ROW[row.kind]
          return (
            <tr key={row.name}>
              <td className={tone.name}>{row.name}</td>
              <td className={`${NUMBER_CELL} ${tone.number}`}>{row.amount}</td>
              <td className={`${NUMBER_CELL} ${tone.number}`}>{row.share}</td>
              <td className={`${NUMBER_CELL} ${tone.number} ${PHONE_HIDDEN}`}>
                <DeltaCell delta={row.delta} />
              </td>
              {row.lastYear && (
                <td className={`${NUMBER_CELL} ${tone.number} ${PHONE_HIDDEN}`}>
                  <DeltaCell delta={row.lastYear} />
                </td>
              )}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export function RevenueSplit({ view }: { view: SplitView }) {
  return (
    <section className={SECTION}>
      <BlockHead title={view.title}>
        <BlockSub>{view.sub}</BlockSub>
      </BlockHead>
      {view.notice && <NoticeLine notice={view.notice} />}
      <div className="mt-4 grid gap-y-6 md:grid-cols-12 md:gap-x-6">
        <div className="min-w-0 md:col-span-5">
          <SplitTable head={view.head} rows={view.rows} />
          <Note>{view.note}</Note>
        </div>
        {view.chart && (
          <div className="min-w-0 md:col-span-6 md:col-start-7">
            <StackBars chart={view.chart} />
          </div>
        )}
      </div>
    </section>
  )
}
