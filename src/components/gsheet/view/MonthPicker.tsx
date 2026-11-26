'use client'

import { useEffect, useRef, useState } from 'react'
import { ds } from '@/components/ui/classes'
import { addMonths } from '@/lib/analytics/dates'
import type { GsheetMonth } from '@/types/gsheet'
import { VIEW } from './labels'
import { isFileId } from './sheetParts'

// 띠의 달 고르기(spec google-link AC-8514.4, 시안 notes-sunap '공통 — 위 한 줄 띠'·pastmonth).
// 파일 이름의 달 자리를 고르기 단추로 보인다. 펼치면 이번 달 맨 위('{yyyy}년 {m}월 · 이번 달') + 지난 12달,
// 파일이 없는 달은 흐리게 '파일 없음'이고 고를 수 없다(이번 달은 늘 고를 수 있다 — 돌아오기). 고른 달은 저장하지 않는다(보는 화면이 들고 있음).
// 지난 달을 보고 있으면 단추가 주황 테두리. 바깥을 누르거나 Esc면 닫힌다

/** 이번 달 + 지난 12달 */
const MONTHS_SHOWN = 13

export type MonthChoice = { ym: string; hasFile: boolean }

/** 이번 달부터 지난 달 차례로 13달, 파일 id 모양이 맞는 달만 hasFile */
export function monthChoices(thisMonth: string, months: readonly GsheetMonth[]): MonthChoice[] {
  const withFile = new Set(months.filter((m) => isFileId(m.fileId)).map((m) => m.ym))
  return Array.from({ length: MONTHS_SHOWN }, (_, i) => {
    const ym = addMonths(thisMonth, -i)
    return { ym, hasFile: withFile.has(ym) }
  })
}

type Props = {
  choices: readonly MonthChoice[]
  /** 지금 보는 달 */
  current: string
  thisMonth: string
  onPick: (ym: string) => void
}

const TRIGGER =
  'inline-flex h-7.5 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-control border pr-2 pl-3 text-body font-semibold text-ink transition'
const TRIGGER_NOW = 'border-line-strong bg-surface hover:bg-canvas'
const TRIGGER_PAST = 'border-warning bg-warning-soft'
const ITEM = 'flex w-full items-center justify-between gap-3 rounded-control px-3 py-1.5 text-left text-small'

export function MonthPicker({ choices, current, thisMonth, onPick }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const past = current !== thisMonth

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  const pick = (ym: string) => {
    setOpen(false)
    onPick(ym)
  }

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        aria-label={VIEW.pickerLabel(current)}
        title={VIEW.pickerTitle}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`${TRIGGER} ${past ? TRIGGER_PAST : TRIGGER_NOW} ${ds.focusRing}`}
      >
        {VIEW.month(current)}
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0 text-muted">
          <path d="M4.5 6.5 8 10l3.5-3.5" />
        </svg>
      </button>
      {open && (
        <ul aria-label={VIEW.pickerTitle} className={`${ds.layer} absolute top-full left-0 z-20 mt-1 grid w-60 gap-0.5 p-1`}>
          {choices.map((choice) => {
            const isThis = choice.ym === thisMonth
            const usable = isThis || choice.hasFile
            const on = choice.ym === current
            return (
              <li key={choice.ym}>
                <button
                  type="button"
                  disabled={!usable}
                  aria-current={on ? 'true' : undefined}
                  onClick={() => pick(choice.ym)}
                  className={`${ITEM} ${ds.focusRing} ${
                    !choice.hasFile ? 'text-muted' : on ? 'bg-accent-soft font-semibold text-accent-strong' : 'text-ink hover:bg-canvas'
                  } ${usable ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                >
                  <span>{isThis ? VIEW.thisMonth(choice.ym) : VIEW.month(choice.ym)}</span>
                  {/* 화면 읽기 이름이 '2026년 9월 파일 없음'으로 띄어 읽히게 */}
                  {!choice.hasFile && ' '}
                  {!choice.hasFile && <span className="text-caption text-muted">{VIEW.fileMissing}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
