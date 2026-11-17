'use client'

import { useEffect, useId, useState, type ReactNode } from 'react'
import { ds } from '@/components/ui/classes'
import { ALLDAY_MEMO_MAX } from '@/lib/storage/calendar'
import type { CalAllDay, CalSettings } from '@/types/calendar'
import { CalIcon, Swatch, dayLabel } from './CalendarToolbar'

// 종일 작은 판 (spec clinic-calendar AC-5905.4, 시안 종일 줄 누름 .pop 320px). 그날 항목(메모·시행자 휴무)을 보여 주고 지우거나,
// 메모(20자) 또는 아직 휴무가 아닌 시행자의 휴무를 더한다. 휴무 표시는 그 시행자 색(--cal-* 토큰). 콜백만 부른다(저장은 화면이 한다)

/** 누른 종일 칸 자리(화면 기준). 없으면 가운데 위에 뜬다 */
export type AllDayAnchor = { bottom: number; left: number }

type AllDayPanelProps = {
  day: string
  items: readonly CalAllDay[] // 그날 항목
  settings: CalSettings
  anchor?: AllDayAnchor | null
  busy?: boolean
  error?: ReactNode
  onAdd(item: Omit<CalAllDay, 'id'>): void
  onDelete(id: string): void
  onClose(): void
}

const POP_WIDTH = 320

/** 종일 메모·휴무 판 */
export function AllDayPanel({ day, items, settings, anchor = null, busy = false, error, onAdd, onDelete, onClose }: AllDayPanelProps) {
  const titleId = useId()
  const [kind, setKind] = useState<'memo' | 'off'>('memo')
  const [memo, setMemo] = useState('')
  const [pick, setPick] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const offIds = new Set(items.filter((item) => item.type === 'off').map((item) => item.staffId))
  const free = settings.staff.filter((person) => !offIds.has(person.id))
  const chosen = free.find((person) => person.id === pick) ?? free[0] ?? null
  const text = memo.trim()
  const ready = kind === 'memo' ? text.length > 0 : chosen !== null

  function add() {
    if (!ready || busy) return
    if (kind === 'memo') {
      onAdd({ day, type: 'memo', memo: text, staffId: null, staffName: null })
      setMemo('')
    } else if (chosen) {
      onAdd({ day, type: 'off', memo: null, staffId: chosen.id, staffName: chosen.name })
    }
  }

  const place = anchor
    ? {
        top: Math.max(8, Math.min(anchor.bottom + 4, window.innerHeight - 300)),
        left: Math.max(12, Math.min(anchor.left, window.innerWidth - POP_WIDTH - 12)),
      }
    : undefined

  return (
    <>
      <div aria-hidden="true" className="fixed inset-0 z-40" onClick={onClose} />
      <div
        role="dialog"
        aria-labelledby={titleId}
        style={place}
        className={`${ds.layer} fixed z-50 grid w-80 gap-2 p-3 max-md:top-30! max-md:right-4! max-md:left-4! max-md:w-auto ${
          place ? '' : 'top-30 left-1/2 -translate-x-1/2 max-md:translate-x-0'
        }`}
      >
        <h2 id={titleId} className="text-body font-semibold text-ink">
          {`${dayLabel(day)} · 종일`}
        </h2>
        {items.length > 0 && (
          <ul className="grid gap-1">
            {items.map((item) => {
              const person = settings.staff.find((s) => s.id === item.staffId)
              const label = item.type === 'memo' ? (item.memo ?? '') : `${person ? `(${person.mark}) ` : ''}${item.staffName ?? ''} 휴무`
              return (
                <li key={item.id} className="flex items-center justify-between gap-2 py-0.5 text-small text-ink">
                  <span className="flex min-w-0 items-center gap-1.5">
                    {item.type === 'off' ? <Swatch color={person?.color ?? 'gray'} /> : <CalIcon name="info" size={14} className="text-muted" />}
                    <span data-label className="min-w-0 break-words">
                      {label}
                    </span>
                  </span>
                  <button type="button" className={`${ds.button.ghostSmall} text-negative`} onClick={() => onDelete(item.id)}>
                    지우기
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <div>
          <div role="group" aria-label="종일 종류" className={ds.segment.group}>
            {(
              [
                ['memo', '메모'],
                ['off', '시행자 휴무'],
              ] as const
            ).map(([value, name]) => (
              <button
                key={value}
                type="button"
                aria-pressed={kind === value}
                className={`${ds.segment.button} ${kind === value ? ds.segment.on : ds.segment.off}`}
                onClick={() => setKind(value)}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
        {kind === 'memo' ? (
          <input
            aria-label="종일 메모"
            value={memo}
            maxLength={ALLDAY_MEMO_MAX}
            placeholder="예: 학회, 소독, 회의"
            className={ds.input}
            onChange={(event) => setMemo(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') add()
            }}
          />
        ) : free.length > 0 ? (
          <select aria-label="휴무 시행자" value={chosen?.id ?? ''} className={ds.input} onChange={(event) => setPick(event.target.value)}>
            {free.map((person) => (
              <option key={person.id} value={person.id}>
                {`(${person.mark}) ${person.name}`}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-small text-ink-2">{settings.staff.length === 0 ? '설정에서 시행자를 먼저 더해 주세요' : '모든 시행자가 이미 휴무예요'}</p>
        )}
        <p className={ds.help}>
          {kind === 'memo' ? '그날 맨 위 종일 줄에 글로 보여요.' : '그날 그 시행자를 휴무로 표시해요. 휴무인 담당으로 예약을 넣으면 알려 줘요.'}
        </p>
        {error && (
          <p role="alert" className={ds.fieldError}>
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className={ds.button.secondarySmall} onClick={onClose}>
            닫기
          </button>
          <button type="button" disabled={!ready} aria-busy={busy || undefined} className={ds.button.primarySmall} onClick={add}>
            더하기
          </button>
        </div>
      </div>
    </>
  )
}
