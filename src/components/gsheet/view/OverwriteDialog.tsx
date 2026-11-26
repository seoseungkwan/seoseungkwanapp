'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { ds } from '@/components/ui/classes'
import { addDays, compareYmd, weekdayOf } from '@/lib/analytics/dates'
import type { FillMode } from '@/lib/gsheet/shapes'
import { VIEW, WEEKDAYS } from './labels'

// [덮어쓰기…] 창(spec google-link AC-8515.3, 시안 notes-sunap `overwrite`). 틀과 키 처리는 ai-report RedoDialog와 같다(Esc·가림막·Tab 돌기).
// 날짜는 [‹][›][오늘]로 옮기고, 도우미가 받는 날(한국 오늘 − 62일 ~ 오늘, design.md 9-2 sheet.fill day) 밖으로는 못 간다.
// 덮어쓰기는 직원이 고친 값까지 비트 값으로 바꾸므로 열리면 초점은 [취소]에 둔다. 누르면 부르는 쪽이 창을 닫고 넣는다

// [‹][›] — 36px 네모 보조 단추(ds.button.secondary와 같은 색·테두리, 좌우 여백 없음)
const ARROW = `inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-control border border-line-strong bg-surface text-body text-ink transition not-disabled:hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40 ${ds.focusRing}`

/** 도우미가 받는 가장 이른 날까지 며칠(design.md 9-2: 한국 오늘 − 62일) */
export const OVERWRITE_BACK_DAYS = 62

/** 창 시작 날 — 이번 달을 보면 오늘, 지난 달을 보면 그 달 1일. 받는 날보다 이르면 가장 이른 날 */
export function overwriteStart(viewMonth: string, today: string): string {
  const first = viewMonth === today.slice(0, 7) ? today : `${viewMonth}-01`
  const min = addDays(today, -OVERWRITE_BACK_DAYS)
  return compareYmd(first, min) < 0 ? min : compareYmd(first, today) > 0 ? today : first
}

/** '2026년 11월 26일 (목)' */
export function dayLabel(ymd: string): string {
  return `${Number(ymd.slice(0, 4))}년 ${Number(ymd.slice(5, 7))}월 ${Number(ymd.slice(8, 10))}일 (${WEEKDAYS[weekdayOf(ymd) - 1]})`
}

type Props = {
  start: string
  today: string
  /** 고를 수 있는 가장 이른 날 */
  min: string
  onCancel: () => void
  onPick: (day: string, mode: FillMode) => void
}

export function OverwriteDialog({ start, today, min, onCancel, onPick }: Props) {
  const titleId = useId()
  const [day, setDay] = useState(start)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const lastRef = useRef<HTMLButtonElement>(null)
  const atMin = compareYmd(day, min) <= 0
  const atToday = compareYmd(day, today) >= 0

  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  // 창 안에서만 Tab이 돈다(첫 단추 [‹] … 끝 단추 [덮어쓰기])
  const onDialogKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return
    const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
    const [first, last] = [buttons[0], lastRef.current]
    const active = document.activeElement
    if (e.shiftKey && (active === first || active === e.currentTarget)) {
      e.preventDefault()
      last?.focus()
    } else if (!e.shiftKey && (active === last || active === e.currentTarget)) {
      e.preventDefault()
      first?.focus()
    }
  }

  const closeOnBackdrop = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onCancel()
  }

  return (
    <div onClick={closeOnBackdrop} className="fixed inset-0 z-30 flex items-start justify-center bg-ink/18 px-4 pt-24">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onDialogKeyDown}
        className={`${ds.layer} grid w-full max-w-125 gap-4 p-5 outline-hidden`}
      >
        <h2 id={titleId} className="text-lead font-semibold text-ink">
          {VIEW.owTitle}
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={VIEW.owPrev}
            disabled={atMin}
            onClick={() => setDay((d) => addDays(d, -1))}
            className={ARROW}
          >
            ‹
          </button>
          <span
            data-testid="overwrite-day"
            className="inline-flex h-9 min-w-45 items-center justify-center rounded-control border border-line-strong px-3 text-body font-semibold text-ink tabular-nums"
          >
            {dayLabel(day)}
          </span>
          <button
            type="button"
            aria-label={VIEW.owNext}
            disabled={atToday}
            onClick={() => setDay((d) => addDays(d, 1))}
            className={ARROW}
          >
            ›
          </button>
          <button type="button" onClick={() => setDay(today)} className={ds.button.ghostSmall}>
            {VIEW.owToday}
          </button>
        </div>
        <p className="text-small text-ink-2">
          {VIEW.owText} <b className="font-semibold">{VIEW.owKeep}</b>
        </p>
        <p className="text-caption text-muted">{VIEW.owTip}</p>
        <div data-testid="overwrite-foot" className="flex justify-end gap-2">
          <button ref={cancelRef} type="button" onClick={onCancel} className={ds.button.secondary}>
            {VIEW.owCancel}
          </button>
          <button type="button" onClick={() => onPick(day, 'fillEmpty')} className={ds.button.secondary}>
            {VIEW.owFillEmpty}
          </button>
          <button ref={lastRef} type="button" onClick={() => onPick(day, 'overwrite')} className={ds.button.primary}>
            {VIEW.owOverwrite}
          </button>
        </div>
      </div>
    </div>
  )
}
