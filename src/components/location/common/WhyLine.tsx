import { ds } from '@/components/ui/classes'
import type { SourceId, Why } from '@/types/location'
import { cappedText, prevText, RETRY_LABEL, whyText } from './text'

// 자료 없음 글(design.md 15절 칸 글 여섯): no-key · not-applied · failed([다시 받기], 옛 값이 있으면 `지난 값 · 기준 {날짜}`) · none · outside · capped.
// 그 칸 자리에 놓는다(AC-7917.2). place='value'는 숫자 자리(시안 .nodata), 'line'은 값 아래 한 줄.
// 옛 값 글은 failed 밖의 까닭에도 붙인다 — 옛 값을 보이는 칸이 지금 값처럼 보이지 않게
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
  const tone = TONE[props.place ?? 'line']
  if (props.why === 'capped') return <p className={tone}>{cappedText(props.count)}</p>
  const text = whyText(props.why, props.src)
  if (text === null) return null
  const retry = props.why === 'failed' ? props.onRetry : undefined
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
