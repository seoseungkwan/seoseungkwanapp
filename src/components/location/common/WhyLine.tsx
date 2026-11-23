import { useContext } from 'react'
import { ds } from '@/components/ui/classes'
import { sourceOf } from '@/lib/location/sources'
import type { SourceId, Why } from '@/types/location'
import { RefreshBusy } from './RefreshBusy'
import { cappedText, prevText, RETRY_LABEL, whyText } from './text'

// 자료 없음 글(design.md 15절 칸 글 여섯): no-key · not-applied · failed([다시 받기], 옛 값이 있으면 `지난 값 · 기준 {날짜}`) · none · outside · capped.
// 그 칸 자리에 놓는다(AC-7917.2). place='value'는 숫자 자리(시안 .nodata), 'line'은 값 아래 한 줄.
// 옛 값 글은 failed 밖의 까닭에도 붙인다 — 옛 값을 보이는 칸이 지금 값처럼 보이지 않게.
// 다시 받는 중(RefreshBusy 글이 있음)이면 failed + [다시 받기] 자리에 그 글만(카카오 값은 다시 받기로 다시 받지 않아 그대로 — AC-7917.4, TASK-95)
const TONE = { value: 'text-body font-medium text-muted', line: 'text-small text-muted' } as const
const RETRY = `ml-1 inline-flex cursor-pointer items-center rounded-control text-small font-medium text-accent underline-offset-3 transition hover:underline ${ds.focusRing}`

type Place = keyof typeof TONE

export type WhyLineProps =
  | {
      why: Why
      src: SourceId
      /** 옛 값의 기준 날짜 — 있으면 `지난 값 · 기준 {날짜}` */
      prevAsOf?: string | null
      /** failed의 [다시 받기]. 주지 않으면 글만 */
      onRetry?: () => void
      place?: Place
    }
  | { why: 'capped'; count: number; place?: Place }

export function WhyLine(props: WhyLineProps) {
  const busy = useContext(RefreshBusy)
  const tone = TONE[props.place ?? 'line']
  if (props.why === 'capped') return <p className={tone}>{cappedText(props.count)}</p>
  const text = whyText(props.why, props.src)
  if (text === null) return null
  const retry = props.why === 'failed' ? props.onRetry : undefined
  if (retry && busy !== null && sourceOf(props.src)?.key !== 'kakao') {
    return (
      <div className={tone}>
        <p>{busy}</p>
        {props.prevAsOf && <p className="text-small text-muted">{prevText(props.prevAsOf)}</p>}
      </div>
    )
  }
  return (
    <div className={tone}>
      <p className="inline">{text}</p>
      {retry && (
        <button type="button" className={RETRY} onClick={retry}>
          {RETRY_LABEL}
        </button>
      )}
      {props.prevAsOf && <p className="text-small text-muted">{prevText(props.prevAsOf)}</p>}
    </div>
  )
}
