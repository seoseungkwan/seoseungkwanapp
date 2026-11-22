import type { ReactNode } from 'react'
import { ds } from '@/components/ui/classes'
import { HowLine } from '@/components/location/common/HowLine'
import { commaText } from '@/lib/location/money'
import { filledHow, type HowCtx, type HowId } from '@/lib/location/method'

// 묶음 하나의 틀(시안 .csec: 머리 줄 h3 + 수 + 제목 옆 단추 + 곁글, 아래 선 → '이렇게 봤어요' 한 줄 → 몸 칸 사이 16px).
// id는 목차가 건너뛰는 닻(시안 sec-comp·sec-others·sec-price·sec-hours — 묶음이 한 번만 그린다). 색·글자는 앱 토큰만, PC 모양 하나

const HEAD = 'flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line-strong pb-1.5'

/** '이렇게 봤어요'(AC-7920.2) — 글은 method.ts HOW를 howCtx로 채우고, 펼침은 부르는 쪽이 쥔다(범위를 바꿔 다시 그려도 그대로) */
export type HowProps = {
  /** 채울 값: 그 후보 그날 값의 출처별 기준 날짜 · 살필 범위 · 시·군·구 · 고른 경쟁 과목(method.ts HowCtx) */
  howCtx: HowCtx
  /** 펼쳤나 */
  howOpen: boolean
  /** [더 보기]/[접기]를 누르면 */
  onHow: () => void
}

export type SectionProps = {
  id: string
  title: string
  /** 제목 옆 수(시안 `경쟁 의원 6`) */
  count?: number | null
  /** 제목 바로 옆(시안 .kbtn [과목 고르기]) */
  after?: ReactNode
  aside?: ReactNode
  /** '이렇게 봤어요' 묶음 id(method.ts HOW) */
  howId: HowId
  children: ReactNode
} & HowProps

export function Section({ id, title, count, after, aside, howId, howCtx, howOpen, onHow, children }: SectionProps) {
  const headId = `${id}-title`
  return (
    <section id={id} aria-labelledby={headId} className="min-w-0 scroll-mt-4">
      <div className={HEAD}>
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5">
          <h3 id={headId} className="text-subtitle font-semibold text-ink">
            {title}
            {count != null && (
              <>
                {' '}
                <span className="font-medium tabular-nums text-muted">{commaText(count)}</span>
              </>
            )}
          </h3>
          {after}
        </div>
        {aside != null && <span className="text-small text-muted">{aside}</span>}
      </div>
      <HowLine {...filledHow(howId, howCtx)} open={howOpen} onToggle={onHow} />
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
  /** 칸 안 둘째 줄(시안 .s2: 12px muted 블록) */
  sub: 'block text-caption font-normal text-muted',
} as const

export const MUTED = 'text-muted'

/** 제목 옆 [과목 고르기](시안 .sh h3 .kbtn: 높이 24 · 좌우 2px · 13px 500 · accent, 올리면 밑줄) */
export const PICK_BTN = `inline-flex h-6 cursor-pointer items-center whitespace-nowrap rounded-control px-0.5 text-small font-medium text-accent underline-offset-2 transition hover:underline ${ds.focusRing}`
/** 작은 보조 단추(시안 .btn.sm: 높이 32 · 좌우 12px · 13px) */
export const SMALL_BTN = `inline-flex h-8 cursor-pointer items-center whitespace-nowrap rounded-control border border-line-strong bg-surface px-3 text-small font-medium text-ink transition hover:bg-canvas ${ds.focusRing}`
/** 글 단추(시안 .tbtn) */
export const TEXT_BTN = `cursor-pointer rounded-control font-medium text-accent underline-offset-2 hover:underline ${ds.focusRing}`
