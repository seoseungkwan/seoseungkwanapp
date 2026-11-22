import { useId, useRef, useState, type FormEvent } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { ds } from '@/components/ui/classes'
import { isYmd } from '@/lib/analytics/dates'
import type { CandidateStatus, LocationNote } from '@/types/location'
import { look } from './look'
import { SectionHead } from './parts'
import { NOTES_TEXT as T, STATUS_STEPS, STATUS_TEXT as S, cutText } from './text'

// 진행 메모(시안 ?s=plan 진행 메모, AC-7913.4): 맨 위 진행 상태 다섯(시안 ?s=compare 단계 단추 넷 + [내려놓기]),
// 메모는 날짜가 새것이 위(같은 날은 나중에 적은 것이 위), 아래 날짜(처음 오늘)·글(500자)·[메모 더하기].
// 저장·지우기는 부모 콜백이고, 실패하면 E-LOC-SAVE-FAILED를 보이고 적은 글은 그대로 둔다

const NOTE_MAX = 500

export type NoteFields = { day: string; body: string }

export type ProgressNotesProps = {
  status: CandidateStatus
  notes: readonly LocationNote[]
  today: string
  onStatus: (status: CandidateStatus) => void
  onAddNote: (fields: NoteFields) => Promise<unknown>
  onDeleteNote: (id: string) => Promise<unknown>
}

const byNewest = (a: LocationNote, b: LocationNote) => b.day.localeCompare(a.day) || b.createdAt.localeCompare(a.createdAt)

// 단계 단추(시안 .stp): 붙어 있는 칸, 지난 단계 accent-soft · 지금 단계 accent(흰 글자) · 다음 단계 흰 바탕
const STEP = 'relative -ml-px h-8 min-w-0 flex-1 basis-0 cursor-pointer whitespace-nowrap border px-1.5 text-caption first:ml-0 first:rounded-l-control last:rounded-r-control focus-visible:z-20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
const STEP_DONE = `${STEP} border-line-strong bg-accent-soft text-accent-strong`
const STEP_CUR = `${STEP} z-10 border-accent bg-accent font-semibold text-surface`
const STEP_NEXT = `${STEP} border-line-strong bg-surface text-ink-2 hover:bg-canvas`

function StatusSteps({ status, onStatus }: Pick<ProgressNotesProps, 'status' | 'onStatus'>) {
  const labelId = useId()
  const at = STATUS_STEPS.findIndex(([s]) => s === status)
  return (
    <div className="mt-3 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-6 gap-y-3">
      <span id={labelId} className={look.smallStrong}>
        {S.label}
      </span>
      <div role="group" aria-labelledby={labelId} className="flex max-w-140">
        {STATUS_STEPS.map(([s, label], i) => (
          <button
            key={s}
            type="button"
            className={i === at ? STEP_CUR : at >= 0 && i < at ? STEP_DONE : STEP_NEXT}
            aria-pressed={i === at}
            onClick={() => {
              if (i !== at) onStatus(s)
            }}
          >
            {S.step(i, label)}
          </button>
        ))}
      </div>
      {status === 'dropped' ? (
        <span className={`${ds.chip.neutral} justify-self-start`}>{S.dropped}</span>
      ) : (
        <button type="button" className={look.button} onClick={() => onStatus('dropped')}>
          {S.drop}
        </button>
      )}
    </div>
  )
}

export function ProgressNotes({ status, notes, today, onStatus, onAddNote, onDeleteNote }: ProgressNotesProps) {
  const titleId = useId()
  const textRef = useRef<HTMLInputElement>(null)
  const [day, setDay] = useState(today)
  const [text, setText] = useState('')
  const [empty, setEmpty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const sorted = [...notes].sort(byNewest)

  async function add(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    const body = cutText(text.trim(), NOTE_MAX)
    if (body === '') {
      setEmpty(true)
      textRef.current?.focus()
      return
    }
    setBusy(true)
    setFailed(false)
    try {
      await onAddNote({ day: isYmd(day) ? day : today, body })
      setText('')
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    setFailed(false)
    try {
      await onDeleteNote(id)
    } catch {
      setFailed(true)
    }
  }

  return (
    <section aria-labelledby={titleId} className="min-w-0">
      <SectionHead id={titleId} title={T.title} aside={T.aside} />
      <StatusSteps status={status} onStatus={onStatus} />
      {sorted.length > 0 && (
        <ul className="mt-3 list-none border-t border-line">
          {sorted.map((n) => (
            <li key={n.id} className="grid grid-cols-[104px_minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1 border-b border-line py-2.5">
              <time dateTime={n.day} className="text-small leading-5.5 text-muted tabular-nums">
                {n.day}
              </time>
              <p className="min-w-0 whitespace-pre-wrap break-words text-body text-ink">{n.body}</p>
              <button type="button" className={look.textButton} aria-label={T.deleteLabel(n.day)} onClick={() => void remove(n.id)}>
                {T.delete}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="mt-3 grid grid-cols-[160px_minmax(0,1fr)_auto] items-start gap-2" onSubmit={(e) => void add(e)} noValidate>
        <input type="date" className={look.input} aria-label={T.dateLabel} value={day} onChange={(e) => setDay(e.currentTarget.value)} />
        <div className="grid min-w-0 gap-1">
          <input
            ref={textRef}
            type="text"
            className={look.input}
            aria-label={T.textLabel}
            aria-invalid={empty || undefined}
            placeholder={T.placeholder}
            maxLength={NOTE_MAX}
            value={text}
            onChange={(e) => {
              setEmpty(false)
              setText(e.currentTarget.value)
            }}
          />
          {empty && <p className="text-caption font-medium text-negative">{T.empty}</p>}
        </div>
        <button type="submit" className={look.button} aria-busy={busy || undefined}>
          {T.add}
        </button>
      </form>
      {failed && (
        <div className="mt-3">
          <ErrorCard code="E-LOC-SAVE-FAILED" />
        </div>
      )}
    </section>
  )
}
