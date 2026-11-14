import { DeltaCell } from './RevenueParts'
import type { DeltaText, SplitRow } from './types'

// 급여 표 (revenue TASK-9, 시안 gen.py split()). 통계 매출 칸의 급여·비급여·기타 탭이 쓴다(stats-revenue design.md '칸 부품').
// 옛 매출 탭의 급여 덩어리(표 + 13달 막대, RevenueSplit)는 지웠다(stats-revenue AC-4110.4). 합계가 매출보다 작아도 화면에서 맞추지 않는다(AC-008.6)

const HEAD_CELL = 'h-9 border-b border-line px-2 text-right font-medium whitespace-nowrap text-muted last:pr-0'
const NUMBER_CELL = 'border-b border-line px-2 text-right whitespace-nowrap tabular-nums last:pr-0'
// 폰은 넷째 칸(비교 기간보다)부터(작년 같은 때보다도) 숨긴다
const PHONE_HIDDEN = 'max-md:hidden'

const ROW: Record<SplitRow['kind'], { name: string; number: string }> = {
  main: { name: 'h-11 border-b border-line pr-2 font-semibold text-ink', number: 'h-11 text-ink' },
  sub: { name: 'h-9 border-b border-line pr-2 pl-4 text-ink-2', number: 'h-9 text-ink-2' },
  sum: { name: 'h-11 border-t border-line-strong pr-2 font-semibold text-ink', number: 'h-11 border-t border-line-strong font-semibold text-ink' },
}

// lastYear(통계 고른 기간의 작년 비교, 기본값 6)가 있는 줄은 다섯째 칸 '작년 같은 때보다'를 그린다. 없으면 넷 칸이다
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
