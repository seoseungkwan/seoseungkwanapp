'use client'

import { useId, useState, type ReactNode } from 'react'
import { ChartTable } from '@/components/charts/ChartTable'
import type { BarBucket, BarSeries } from '@/components/charts/StackedBarChart'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'

// 그래프 [표로 보기] (dashboard-ux REQ-2706 AC-2706.1, design.md §7, 시안 docs/mockups/dashboard-ux/index.html .tbl-toggle·.tblwrap).
// 펼침 상태는 이 부품이 쥔다(저장하지 않아 새로 열면 늘 접힘). children(open)이 그래프를 그린다 → 펼친 동안 그래프는 srTable={false}로
// 화면 읽기 표를 빼 같은 숫자를 두 번 읽지 않게 한다. 차례: 그래프 → 단추(작은 보조 단추, 폰 전체 폭 44px, aria-expanded·aria-controls) → 펼친 표.
// aria-controls가 가리키는 칸은 늘 있고(접히면 비어 있다) 펼치면 그 안에 ChartTable을 그린다. 꺾쇠는 꾸밈이고 펼치면 뒤집힌다(움직임 없음)

export type TableToggleProps = {
  caption: string
  series: BarSeries[]
  buckets: BarBucket[]
  children: (open: boolean) => ReactNode
}

export function TableToggle({ caption, series, buckets, children }: TableToggleProps) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <>
      {children(open)}
      <div className="mt-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((was) => !was)}
          className={`${ds.button.secondarySmall} max-md:w-full`}
        >
          표로 보기
          <Icon name="chev" size={14} className={open ? 'rotate-180' : undefined} />
        </button>
      </div>
      <div id={id}>{open && <ChartTable caption={caption} series={series} buckets={buckets} />}</div>
    </>
  )
}
