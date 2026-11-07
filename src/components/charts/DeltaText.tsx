import type { ReactNode } from 'react'
import type { Delta } from '@/types/analysis'
import { formatDelta, type DeltaUnit, type DeltaView } from './format'

// 증감 글 한 줄 (dashboard-ux REQ-2706 AC-2706.4, design.md §7). KpiStat 증감 줄과 대시보드 "지난주 같은 요일보다" 칸이 같이 쓴다.
// 화살표(늘어남·줄어듦만, 꾸밈 aria-hidden) + 화면 읽기 글("늘어남"·"줄어듦") + 빈칸 + 증감 글(formatDelta, 고정폭) + children(뒤에 붙는 글).
// 색은 방향으로 정한다(늘어남 positive · 줄어듦 negative · 그 밖 muted) — 줄 모양(글자 크기·간격)은 놓는 쪽이 className으로 주고 색은 그 뒤에 붙는다.
// 낱말 사이 빈칸은 화면 읽기가 붙여 읽지 않게 둔다. 서버에서 그대로 그린다(훅·움직임 없음)

export type DeltaTextProps = {
  delta: Delta
  unit: DeltaUnit
  className: string
  arrow?: 8 | 12 // 화살표 너비·높이 px. 그림 칸(viewBox)은 늘 8
  children?: ReactNode
}

// 늘어남·줄어듦 삼각형(시안 tri). 색은 줄의 글자색(positive·negative)을 따른다
const ARROW = { up: 'M4 1.2 7.4 6.8H.6z', down: 'M4 6.8 7.4 1.2H.6z' } as const
const TONE: Record<DeltaView['dir'], string> = {
  up: 'text-positive',
  down: 'text-negative',
  flat: 'text-muted',
  none: 'text-muted',
}

export function DeltaText({ delta, unit, className, arrow = 8, children }: DeltaTextProps) {
  const view = formatDelta(delta, unit)
  const path = view.dir === 'up' || view.dir === 'down' ? ARROW[view.dir] : null
  return (
    <p className={`${className} ${TONE[view.dir]}`}>
      {path && (
        <svg aria-hidden="true" width={arrow} height={arrow} viewBox="0 0 8 8" className="shrink-0">
          <path d={path} fill="currentColor" />
        </svg>
      )}
      {view.srText && <span className="sr-only">{view.srText}</span>}{' '}
      <span className="tabular-nums">{view.text}</span>
      {children}
    </p>
  )
}
