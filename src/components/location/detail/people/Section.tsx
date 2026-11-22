import type { ReactNode } from 'react'
import { HowLine } from '@/components/location/common/HowLine'
import { SourceLine } from '@/components/location/common/SourceLine'
import { WhyLine } from '@/components/location/common/WhyLine'
import { filledHow, type HowCtx } from '@/lib/location/method'
import type { Got, SourceId } from '@/types/location'
import { shownOf } from './text'

// 후보 자세히 묶음 틀(시안 .csec · .sh · .how · .body): 머리(h3 + 곁글) → '이렇게 봤어요' 한 줄 → 몸(칸 사이 16px).
// 닻 id는 `sec-{묶음}`(시안 그대로)를 묶음이 한 번만 그린다 — 틀(detail/frame)은 감싸개에 id를 두지 않고 ref로 건너뛴다
const HEAD = 'flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line-strong pb-1.5'

/** '이렇게 봤어요'(AC-7920.2) — 글은 method.ts HOW[묶음]을 howCtx로 채우고, 펼침은 부르는 쪽(LocationScreen)이 묶음마다 쥔다(범위를 바꿔 다시 그려도 그대로) */
export type HowProps = {
  /** 채울 값: 그 후보 그날 값의 출처별 기준 날짜 · 살필 범위 · 후보 시·군·구 · 고른 경쟁 과목(method.ts HowCtx) */
  howCtx: HowCtx
  /** [더 보기]를 펼쳤나 */
  howOpen: boolean
  /** [더 보기]/[접기]를 누르면 */
  onHow: () => void
}

type SectionId = 'people' | 'income' | 'future'

export function Section({
  id,
  title,
  aside,
  howCtx,
  howOpen,
  onHow,
  children,
}: HowProps & {
  id: SectionId
  title: string
  aside?: string
  children: ReactNode
}) {
  const headId = `sec-${id}-h`
  return (
    <section id={`sec-${id}`} aria-labelledby={headId} className="min-w-0 scroll-mt-4">
      <div className={HEAD}>
        <h3 id={headId} className="text-lead font-semibold text-ink">
          {title}
        </h3>
        {aside && <span className="text-small text-muted">{aside}</span>}
      </div>
      <HowLine {...filledHow(id, howCtx)} open={howOpen} onToggle={onHow} />
      <div className="mt-3 grid min-w-0 gap-4">{children}</div>
    </section>
  )
}

// 묶음 안 작은 머리(시안 `<p class="sm" style="font-weight:600">이름 <span class="mut">곁글</span></p>`)
export function SubHead({ title, note }: { title: string; note?: string }) {
  return (
    <p className="text-small font-semibold text-ink">
      {title} {note && <span className="font-normal text-muted">{note}</span>}
    </p>
  )
}

// 정보 줄(시안 dl.info): 이름 148px · 값
export const INFO = 'm-0'
export const INFO_ROW = 'grid grid-cols-[148px_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1 border-b border-line py-2.25'
export const INFO_DT = 'text-small text-muted'
export const INFO_DD = 'm-0 min-w-0 text-body text-ink wrap-anywhere'

export type Pass = { onRetry?: () => void; onOpenSource?: (id: SourceId) => void }

// 그날 값 한 칸(숫자 칸 Fact가 아닌 표·목록): 값 → 그림, 못 받았으면 그 자리에 design.md 15절 글(지난 값이 있으면 그 값 + `지난 값 · 기준 {날짜}`), 아래 출처 줄.
// also = 한 칸에 출처가 둘일 때 둘째 출처 줄(같은 기준 날짜)
export function GotView<T>({
  got,
  children,
  extra,
  also,
  onRetry,
  onOpenSource,
}: Pass & { got: Got<T>; children: (v: T) => ReactNode; extra?: string; also?: SourceId }) {
  const shown = shownOf(got)
  return (
    <>
      {shown ? children(shown.v) : !got.ok && <WhyLine why={got.why} src={got.src} onRetry={onRetry} />}
      {shown && !got.ok && <WhyLine why={got.why} src={got.src} prevAsOf={shown.asOf} onRetry={onRetry} />}
      <SourceLine src={got.src} asOf={shown?.asOf} extra={extra} onOpen={onOpenSource} />
      {also && also !== got.src && <SourceLine src={also} asOf={shown?.asOf} onOpen={onOpenSource} />}
    </>
  )
}
