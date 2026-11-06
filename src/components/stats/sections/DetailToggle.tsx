'use client'

import { useId, useState, type ReactNode } from 'react'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'

// [자세히] 열기·닫기 + 숫자 표 (stats REQ-513 AC-513.3, 시안 notes.md §5). 상태는 화면 안에만 둔다(주소·저장소에 넣지 않는다).
// 단추는 그래프 머리에, 표 칸은 그래프 바로 아래에 놓도록 둘을 따로 넘긴다

export type DetailTable = { caption: string; columns: string[]; rows: ReactNode[][] }

// 작은 숫자 표: ds.table에서 바깥 좌우 여백만 0, 머리·몸 36px(시안 §7). 첫 칸 밖은 오른쪽 정렬·고정폭
const TH = 'sticky top-0 h-9 whitespace-nowrap border-b border-line bg-surface px-3 font-medium text-muted first:pl-0'
const TD = 'h-9 whitespace-nowrap border-b border-line px-3 text-ink first:pl-0'

export function NumberTable({ caption, columns, rows }: DetailTable) {
  return (
    <table className={ds.table.table}>
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          {columns.map((column, i) => (
            <th key={column} scope="col" className={`${TH} ${i === 0 ? 'text-left' : 'text-right'}`}>
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className="last:*:border-b-0">
            {row.map((cell, j) => (
              <td key={j} className={j === 0 ? TD : `${TD} text-right tabular-nums`}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// 단추 글자. 주지 않으면 [자세히]·[접기]. 처방별 추세 열린 칸은 [숫자로 보기]·[접기](treatment-trend AC-1209.4)
export type DetailLabels = { closed: string; open: string }
const DETAIL_LABELS: DetailLabels = { closed: '자세히', open: '접기' }

export function DetailToggle({
  table,
  labels = DETAIL_LABELS,
  children,
}: {
  table: DetailTable
  labels?: DetailLabels
  children: (parts: { button: ReactNode; panel: ReactNode }) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const button = (
    <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} className={`${ds.textButton} min-h-8`}>
      <span>{open ? labels.open : labels.closed}</span>
      <Icon name="chev" size={14} className={open ? 'rotate-180 transition' : 'transition'} />
    </button>
  )
  const panel = (
    <div id={id} hidden={!open} className="mt-4 max-h-84 overflow-auto border-y border-line">
      {open && <NumberTable {...table} />}
    </div>
  )
  return <>{children({ button, panel })}</>
}
