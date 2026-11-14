import { formatDelta, type DeltaUnit } from '@/components/charts/format'
import type { Delta } from '@/types/analysis'
import { PartialChip } from './parts'

// 요약 칸 하나 (first90 REQ-4403·REQ-4408, design.md 5-0, 시안 docs/mockups/first90/redesign.html .s-kpi). 환자 요약과 매출 요약이 같이 쓴다(대시보드 KpiStat은 그대로 둔다).
// 이름(+ 꼬리표 · 옆 글 · 일부 기간) → 큰 숫자 + 작은 단위 → 증감 줄(0~2) → 아래 글. 768px 미만은 옆 글이 이름 아래로 내려간다.
// 증감은 꾸밈 ▲·▼(aria-hidden) + 글 + 옅은 꼬리 글('늘어남'·'지난 30일보다 줄어듦')이라 색만으로 뜻을 주지 않는다(UI_GUIDE)

/** 증감 줄 하나. lead = 줄 앞말(작년 둘째 줄 '{작년 이름}보다'), tail = 줄 끝 옅은 글(없으면 '') */
export type SummaryLine = { dir: 'up' | 'down' | 'flat' | 'none'; text: string; tail: string; lead?: string }

type Props = {
  label: string
  hint?: string | null
  tag?: boolean // "참고 포함" 꼬리표(매출 요약 켜짐)
  partial?: boolean // 덜 끝난 칸이 든 합("일부 기간")
  value: string | null // null = '–'
  unit?: string | null
  size?: 'base' | 'xl'
  tone?: 'ink' | 'warn' | 'na' // na = '확인 불가'(단위·증감 없음)
  lines?: readonly SummaryLine[]
  neutral?: boolean // 90일초진·재진·건당 진료비: 증감 줄을 ink-2로(늘고 줆이 좋고 나쁨이 아니다)
  notes?: readonly string[]
  className?: string
}

const NO_COMPARE = '비교할 자료가 없어요'
const ARROW = { up: '▲', down: '▼' } as const
const DIR_TONE = { up: 'text-positive', down: 'text-negative', flat: 'text-st-ink-2', none: 'text-st-muted' } as const
const NUMBER = { base: 'text-st-34', xl: 'text-st-40' } as const
const TAG = 'st-tag-in ml-0.5 inline-flex items-center rounded-full bg-warning-soft px-2 text-caption font-semibold text-st-warn-ink max-md:mt-0.5'

/** 환자 증감(Delta) → 증감 줄. 견줄 수 없으면 "비교할 자료가 없어요"다. 글은 formatDelta 규칙 그대로다 */
export function deltaLine(delta: Delta, unit: DeltaUnit, lead?: string): SummaryLine {
  const view = formatDelta(delta, unit)
  const line: SummaryLine = { dir: view.dir, text: delta.kind === 'unavailable' ? NO_COMPARE : view.text, tail: view.srText }
  return lead === undefined ? line : { ...line, lead }
}

function Line({ line, neutral }: { line: SummaryLine; neutral: boolean }) {
  const arrow = line.dir === 'up' || line.dir === 'down' ? ARROW[line.dir] : null
  const tone = neutral && arrow !== null ? 'text-st-ink-2' : DIR_TONE[line.dir]
  return (
    <p className={`mt-1 text-small font-semibold tabular-nums ${tone}`}>
      {line.lead && (
        <>
          <span className="font-normal text-st-muted">{line.lead}</span>{' '}
        </>
      )}
      {arrow && (
        <span aria-hidden="true" className="text-caption">
          {arrow}{' '}
        </span>
      )}
      {line.text}
      {line.tail && <span className="font-normal text-st-muted"> {line.tail}</span>}
    </p>
  )
}

export function SummaryCell({ label, hint = null, tag = false, partial = false, value, unit = null, size = 'base', tone = 'ink', lines = [], neutral = false, notes = [], className = '' }: Props) {
  const color = tone === 'warn' ? 'text-st-warn-ink' : value === null ? 'text-st-muted' : 'text-st-ink'
  return (
    <div className={`min-w-0 ${className}`}>
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-small max-md:block">
        <span className="font-semibold text-st-ink-2 max-md:block">{label}</span>
        {tag && <span className={TAG}>참고 포함</span>}
        {hint && <span className="text-st-muted max-md:block">{hint}</span>}
        {partial && <PartialChip className="" />}
      </p>
      {tone === 'na' ? (
        <p className="mt-1">
          <span className="text-st-22 leading-normal font-semibold text-st-warn-ink">{value}</span>
        </p>
      ) : (
        <p className="mt-1 flex items-baseline gap-0.5 whitespace-nowrap tabular-nums">
          <span className={`${NUMBER[size]} leading-tight font-semibold ${color}`}>{value ?? '–'}</span>
          {unit !== null && value !== null && <span className="ml-0.5 text-lead font-semibold text-st-ink-2">{unit}</span>}
        </p>
      )}
      {lines.map((line) => (
        <Line key={`${line.lead ?? ''}${line.text}`} line={line} neutral={neutral} />
      ))}
      {notes.map((note) => (
        <p key={note} className={`mt-1 text-small ${tone === 'na' ? 'text-st-ink-2' : 'text-st-muted'}`}>
          {note}
        </p>
      ))}
    </div>
  )
}
