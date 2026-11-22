import type { ReactNode } from 'react'
import { commaText } from '@/lib/location/money'

// 묶음 하나의 틀(시안 .csec: 머리 줄 h3 + 수 + 곁글, 아래 선, 몸 칸 사이 16px). id는 목차가 건너뛰는 닻(시안 sec-comp·sec-price·sec-hours).
// 색·글자는 앱 토큰만, PC 모양 하나

const HEAD = 'flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line-strong pb-1.5'

export type SectionProps = {
  id: string
  title: string
  /** 제목 옆 수(시안 `경쟁 의원 6`) */
  count?: number | null
  aside?: ReactNode
  children: ReactNode
}

export function Section({ id, title, count, aside, children }: SectionProps) {
  const headId = `${id}-title`
  return (
    <section id={id} aria-labelledby={headId} className="min-w-0 scroll-mt-4">
      <div className={HEAD}>
        <h3 id={headId} className="text-subtitle font-semibold text-ink">
          {title}
          {count != null && (
            <>
              {' '}
              <span className="font-medium tabular-nums text-muted">{commaText(count)}</span>
            </>
          )}
        </h3>
        {aside != null && <span className="text-small text-muted">{aside}</span>}
      </div>
      <div className="mt-3 grid min-w-0 gap-4">{children}</div>
    </section>
  )
}

// 표(시안 table.t): 머리 40px muted, 몸 44px, 첫·끝 칸 바깥 여백 없음, 줄 올림 canvas. 감싸개만 옆으로 밀린다
export const TABLE = {
  wrap: 'min-w-0 overflow-x-auto',
  table: 'w-full border-collapse text-small',
  th: 'h-10 whitespace-nowrap border-b border-line px-3 text-left align-middle font-medium text-muted first:pl-0 last:pr-0',
  thNum: 'h-10 whitespace-nowrap border-b border-line px-3 text-right align-middle font-medium text-muted first:pl-0 last:pr-0',
  row: 'hover:bg-canvas',
  td: 'h-11 border-b border-line px-3 py-2 align-middle text-ink first:pl-0 last:pr-0',
  tdNum: 'h-11 whitespace-nowrap border-b border-line px-3 py-2 text-right align-middle tabular-nums text-ink first:pl-0 last:pr-0',
  tdNowrap: 'h-11 whitespace-nowrap border-b border-line px-3 py-2 align-middle text-ink first:pl-0 last:pr-0',
} as const

export const MUTED = 'text-muted'
