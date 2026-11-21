'use client'

import { useState, type ReactNode } from 'react'
import { addMonths } from '@/lib/analytics/dates'
import { ds } from '@/components/ui/classes'
import { monthNumber, monthTitle, parseWon, won } from './format'

// 급여 화면 여러 칸이 같이 쓰는 작은 부품 (staff REQ-7615, 시안 pay.html). 모양은 ds(components/ui/classes.ts)·globals.css 토큰만 쓴다

// 표 안 금액 칸(시안 .in): 30px · 오른쪽 정렬 · 고정폭 숫자. 노란 칸(시안 .chg)은 바꾼 값·적은 실적
const cellBase =
  'h-7.5 w-full min-w-21 rounded-control border px-2 text-right text-small tabular-nums text-ink focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent focus-visible:outline-hidden aria-invalid:border-negative'
const cellPlain = `${cellBase} border-line-strong bg-surface`
const cellMarked = `${cellBase} border-warning bg-warning-soft`

/** 작은 창 안 글 칸(시안 .box): 32px · small. ds.input(44px)은 표·작은 창에 크다 */
export const smallInput =
  'h-8 w-full min-w-0 rounded-control border border-line-strong bg-surface px-3 text-small text-ink placeholder:text-muted not-disabled:hover:border-muted focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent focus-visible:outline-hidden aria-invalid:border-negative'

/**
 * 금액·건수 칸: 쉼표를 넣어 보이고, 칸에서 나갈 때 값이 바뀌었으면 onCommit(빈 칸 = null).
 * 0 이상 정수가 아니면 저장하지 않고 칸을 틀림으로 둔다(쓴 글은 그대로)
 */
export function WonInput({
  label,
  value,
  onCommit,
  changed,
  filled,
  className = '',
}: {
  label: string
  value: number | null
  onCommit: (value: number | null) => void
  changed?: boolean
  filled?: boolean
  className?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const [bad, setBad] = useState(false)
  const marked = changed === true || filled === true
  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label={label}
      aria-invalid={bad || undefined}
      data-changed={changed === undefined ? undefined : String(changed)}
      data-filled={filled === undefined ? undefined : String(filled)}
      className={`${marked ? cellMarked : cellPlain} ${className}`}
      value={draft ?? (value === null ? '' : won(value))}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft === null) return
        const parsed = parseWon(draft)
        if (parsed === 'bad') {
          setBad(true)
          return
        }
        setBad(false)
        setDraft(null)
        if (parsed !== value) onCommit(parsed)
      }}
    />
  )
}

/** 함께 쓰는 달 고르기(AC-7615.1): ◀ {M−1}월 · {YYYY}년 {M}월(뒤 글) · {M+1}월 ▶ */
export function MonthNav({ month, onMonth, suffix = '' }: { month: string; onMonth: (month: string) => void; suffix?: string }) {
  const prev = addMonths(month, -1)
  const next = addMonths(month, 1)
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" className={ds.button.secondarySmall} onClick={() => onMonth(prev)}>
        {`◀ ${monthNumber(prev)}월`}
      </button>
      <b className="whitespace-nowrap px-1.5 text-subtitle font-semibold text-ink">{`${monthTitle(month)}${suffix}`}</b>
      <button type="button" className={ds.button.secondarySmall} onClick={() => onMonth(next)}>
        {`${monthNumber(next)}월 ▶`}
      </button>
    </div>
  )
}

/** 도구 줄(시안 .tool): 왼쪽 달 고르기 · 오른쪽 단추 */
export function ToolRow({ left, right }: { left: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {left}
      {right !== undefined && <div className="ml-auto flex flex-wrap gap-2">{right}</div>}
    </div>
  )
}

/** 파란 안내 줄(시안 .info) */
export function InfoLine({ children }: { children: ReactNode }) {
  return <p className="rounded-control bg-accent-soft px-3 py-2 text-small text-ink-2">{children}</p>
}

/** 아래 작은 안내(시안 .note) */
export function Note({ children }: { children: ReactNode }) {
  return <p className="text-caption text-muted">{children}</p>
}

/** 읽는 중 */
export function Reading() {
  return (
    <p role="status" className="text-small text-muted">
      불러오는 중이에요…
    </p>
  )
}
