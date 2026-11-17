import type { ReactNode } from 'react'
import { formatCount } from '@/components/charts/format'
import { ds } from '@/components/ui/classes'
import { ratePct } from '@/lib/calendar/counts'
import type { RateCounts, RateRow, RateSummary } from '@/lib/calendar/shapes'
import type { CalColor, CalSettings } from '@/types/calendar'
import { Swatch } from './CalendarToolbar'

// 취소·변경·안 옴 표 (spec clinic-calendar AC-5907.2·AC-5907.3, 시안 ?s=summary·?s=stats의 .bt 표).
// 머리 = 이름 · 예약 · 취소 · 취소율 · 변경 · 변경율 · 안 옴 · 안 옴율, 맨 아래 합계. 비율은 lib/calendar ratePct(예약 0이면 '–').
// 폰은 비율 칸을 숨기고 수 아래에 작게 적는다. 합계 줄·나눠 보기(예약 탭)와 통계 탭 '예약' 칸이 같이 쓴다

export type RateTableRow = RateCounts & { id: string; label: ReactNode }

const CELL = 'h-8.5 border-b border-line px-2 text-right whitespace-nowrap text-ink tabular-nums first:pl-0 first:text-left last:pr-0'
const HEAD = 'h-7.5 border-b border-line px-2 text-right text-caption font-semibold whitespace-nowrap text-muted first:pl-0 first:text-left last:pr-0'
const RATE = 'max-md:hidden'
const FOOT = 'h-8.5 border-t border-line-strong px-2 text-right font-semibold whitespace-nowrap text-ink tabular-nums first:pl-0 first:text-left last:pr-0'

// 수 칸(폰은 아래에 비율) + 비율 칸(폰은 숨김)
function CountCells({ n, of, cell }: { n: number; of: number; cell: string }) {
  const rate = ratePct(n, of)
  return (
    <>
      <td className={cell}>
        <span data-n>{formatCount(n)}</span>
        <span aria-hidden="true" className="block text-caption font-normal text-muted md:hidden">
          {rate}
        </span>
      </td>
      <td className={`${cell} ${RATE} text-ink-2`}>{rate}</td>
    </>
  )
}

function Cells({ counts, cell }: { counts: RateCounts; cell: string }) {
  return (
    <>
      <td className={cell}>
        <span data-n>{formatCount(counts.total)}</span>
      </td>
      <CountCells n={counts.cancel} of={counts.total} cell={cell} />
      <CountCells n={counts.moved} of={counts.total} cell={cell} />
      <CountCells n={counts.noshow} of={counts.total} cell={cell} />
    </>
  )
}

type RateTableProps = {
  head: string // 첫 칸 머리(시행자·종류·달)
  rows: readonly RateTableRow[]
  total: RateCounts
  totalLabel?: string
  selected?: string // 고른 줄 id(aria-current)
  onPick?(id: string): void // 주면 줄 이름이 단추다
}

/** 네 수·세 비율 표 */
export function RateTable({ head, rows, total, totalLabel = '합계', selected, onPick }: RateTableProps) {
  return (
    <div className={ds.table.wrap}>
      <table className="w-full border-collapse text-small">
        <thead>
          <tr>
            <th scope="col" className={HEAD}>
              {head}
            </th>
            <th scope="col" className={HEAD}>
              예약
            </th>
            <th scope="col" className={HEAD}>
              취소
            </th>
            <th scope="col" className={`${HEAD} ${RATE}`}>
              취소율
            </th>
            <th scope="col" className={HEAD}>
              변경
            </th>
            <th scope="col" className={`${HEAD} ${RATE}`}>
              변경율
            </th>
            <th scope="col" className={HEAD}>
              안 옴
            </th>
            <th scope="col" className={`${HEAD} ${RATE}`}>
              안 옴율
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const picked = onPick !== undefined && row.id === selected
            return (
              <tr key={row.id} className={picked ? 'bg-accent-soft' : onPick ? 'hover:bg-canvas' : undefined}>
                <th scope="row" className={`${CELL} font-normal`}>
                  {onPick ? (
                    <button
                      type="button"
                      aria-current={picked ? 'true' : undefined}
                      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-control text-left hover:underline ${ds.focusRing} ${picked ? 'font-semibold' : ''}`}
                      onClick={() => onPick(row.id)}
                    >
                      {row.label}
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1.5">{row.label}</span>
                  )}
                </th>
                <Cells counts={row} cell={CELL} />
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className={FOOT}>
              {totalLabel}
            </th>
            <Cells counts={total} cell={FOOT} />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

type Listed = { id: string; name: string; mark?: string; color: CalColor | null }

// 설정 차례로 줄을 세운다(예약 0도 보임). 설정에 없는(지운) 줄은 아래에 저장된 이름으로
function inOrder(found: readonly RateRow[], listed: readonly Listed[]): RateTableRow[] {
  const byId = new Map(found.map((row) => [row.id, row]))
  const known = listed.map((item): RateTableRow => {
    const counts = byId.get(item.id) ?? { total: 0, cancel: 0, moved: 0, noshow: 0 }
    return {
      id: item.id,
      label: (
        <>
          <Swatch color={item.color} />
          {item.mark === undefined ? item.name : `(${item.mark}) ${item.name}`}
        </>
      ),
      total: counts.total,
      cancel: counts.cancel,
      moved: counts.moved,
      noshow: counts.noshow,
    }
  })
  const ids = new Set(listed.map((item) => item.id))
  return [...known, ...found.filter((row) => !ids.has(row.id))]
}

/** 시행자별·종류별 두 표. settings를 주면 설정 차례·(표시) 이름·색, 없으면 rateSummary 차례와 저장된 이름 */
export function RateBreakdown({ summary, settings }: { summary: RateSummary; settings?: CalSettings }) {
  const staff = settings ? inOrder(summary.byStaff, settings.staff) : summary.byStaff
  const kinds = settings ? inOrder(summary.byKind, settings.kinds) : summary.byKind
  return (
    <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
      <div className="min-w-0">
        <h4 className="mb-0.5 text-small font-semibold text-ink-2">시행자별</h4>
        <RateTable head="시행자" rows={staff} total={summary} />
      </div>
      <div className="min-w-0">
        <h4 className="mb-0.5 text-small font-semibold text-ink-2">종류별</h4>
        <RateTable head="종류" rows={kinds} total={summary} />
      </div>
    </div>
  )
}
