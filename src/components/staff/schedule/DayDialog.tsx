'use client'

import { useEffect, useId, useRef, useState, type MouseEvent } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { WriteOnly } from '@/components/shell/viewing'
import { ReadOnlyFields } from '@/components/staff/ReadOnlyFields'
import { OVERTIME_KIND_LABEL } from '@/components/staff/labels'
import { ds } from '@/components/ui/classes'
import { weekdayOf } from '@/lib/analytics/dates'
import { dayKind, fmtMinutes, holidayPrefill, planOn, shiftOn } from '@/lib/staff/schedule'
import type { StaffStore } from '@/lib/storage/staff'
import type { DayChange, DayShift, Overtime, OvertimeKind, StaffMember, WeekPlan } from '@/types/staff'
import { baseShiftText, clinicShift, dayTitle, type ClinicCtx, type Shift } from './format'
import { Segment, ShiftFields, shiftProblem } from './parts'

// 그날만 바꾸기 창 (staff AC-7613.4, 시안 schedule.html ④). 주 보기 칸을 누르면 뜬다.
// 그날 근무([일함]·[쉼]·근무·점심), 더 일한 시간 세 칸(30분씩 [−]·[+]), 메모. 근무 시간을 늘려도 더 일한 시간은 저절로 늘지 않는다.
// 휴일 날(공휴일·휴진일)을 [일함]으로 바꾸면 휴일 칸을 AC-7605.4 값(근무 − 점심, 30분 버림)으로 먼저 채운다 — 휴일 칸을 손대기 전까지는 근무를 고칠 때마다 다시 채운다.
// [저장]: 근무가 기본과 다르거나 메모가 있으면 바뀐 날로 저장하고, 기본과 같고 메모도 없으면 바뀐 날 줄을 지운다(resetDay는 더 일한 시간도 지우므로 남길 값은 다시 넣는다).
// 더 일한 시간은 바뀐 종류만 저장한다(0이면 그 줄을 지운다). [기본으로 되돌리기]는 그날 바꾼 근무·더 일한 시간·메모를 모두 지운다.
// 저장이 실패하면 창 안에 E-STAFF-SAVE-FAILED, 적은 값은 그대로다. 여러 번 쓰다(지우고 다시 넣기) 중간에 실패할 수 있으니 실패하면 그 기간을 다시 읽어
// 뒤 칸을 DB와 맞추고(onFailed), 다시 [저장]하면 다시 읽은 값(changes·overtime)과 견줘 DB에 없는 것만 쓴다. Esc·✕·뒤 가림막은 저장하지 않고 닫는다
// 관리자가 다른 의원을 보는 중이면(admin-view AC-8009.3) 그날 근무·더 일한 시간·메모는 보이기만 하고(칸·단추 막힘) [기본으로 되돌리기]·[저장]이 없다. ✕는 그대로

const KINDS: readonly OvertimeKind[] = ['extended', 'night', 'holiday']
const KIND_HELP: Record<OvertimeKind, string> = {
  extended: '정해진 근무보다 더 일한 시간',
  night: '밤 10시 ~ 아침 6시',
  holiday: '공휴일·휴진일에 일한 시간',
}
const OVERTIME_STEP = 30
const OVERTIME_MAX = 24 * 60
const FALLBACK: Shift = { start: 9 * 60, end: 18 * 60, lunchFrom: null, lunchTo: null }
const MEMO_MAX = 50

type Minutes = Record<OvertimeKind, number>

const sameShift = (a: DayShift, b: DayShift) =>
  a === null || b === null ? a === b : a.start === b.start && a.end === b.end && a.lunchFrom === b.lunchFrom && a.lunchTo === b.lunchTo

const STEP_BUTTON = `grid size-8 cursor-pointer place-items-center rounded-control border border-line-strong bg-surface text-body text-ink-2 not-disabled:hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40 ${ds.focusRing}`

type DayDialogProps = {
  member: StaffMember
  day: string
  plans: readonly WeekPlan[]
  changes: readonly DayChange[]
  overtime: readonly Overtime[]
  ctx: ClinicCtx
  store: StaffStore
  onClose(): void
  /** 저장·되돌리기가 끝남(창을 닫고 그 기간을 다시 읽는다) */
  onSaved(): void
  /** 저장·되돌리기가 실패함(창은 연 채 그 기간을 다시 읽는다 — 중간까지 쓴 것이 있을 수 있다, AC-7613.4) */
  onFailed(): void
}

export function DayDialog({ member, day, plans, changes, overtime, ctx, store, onClose, onSaved, onFailed }: DayDialogProps) {
  const titleId = useId()
  const memoId = useId()
  const panel = useRef<HTMLDivElement>(null)
  const base = shiftOn({ member, plans, changes: [], day, ctx })
  const change = changes.find((c) => c.staffId === member.id && c.day === day)
  const kind = dayKind(day, ctx)
  const rest = kind.holiday || kind.closed
  // DB에 있는 그날 더 일한 시간: 받은 값에서 매번 센다(실패 뒤 다시 읽으면 새 값과 견준다)
  const initial: Minutes = { extended: 0, night: 0, holiday: 0 }
  for (const row of overtime) if (row.staffId === member.id && row.day === day) initial[row.kind] += row.minutes
  const [shift, setShift] = useState<DayShift>(() => (change !== undefined ? change.shift : base))
  const [minutes, setMinutes] = useState<Minutes>(initial)
  const [memo, setMemo] = useState(change?.memo ?? '')
  // 휴일 칸을 근무 시간으로 저절로 채우는가: 아직 바꾸지 않은 휴일 날이고 휴일 시간이 없을 때만, 휴일 칸을 손대면 멈춘다
  const [autoHoliday, setAutoHoliday] = useState(() => rest && change === undefined && initial.holiday === 0)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    panel.current?.focus()
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  // [일함]으로 바꿀 때 처음 시간: 그날 기본 근무 → 그 사람 기본 근무의 같은 요일 → 다른 요일 → 병원 진료시간 → 09:00~18:00
  function startShift(): Shift {
    const plan = planOn(plans.filter((p) => p.staffId === member.id), day)
    const weekday = weekdayOf(day) - 1
    return base ?? plan?.week[weekday] ?? plan?.week.find((s) => s !== null) ?? clinicShift(ctx.hours[weekday] ?? null) ?? FALLBACK
  }

  const prefill = (next: DayShift) => {
    if (autoHoliday) setMinutes((now) => ({ ...now, holiday: holidayPrefill(next) }))
  }
  const changeShift = (next: DayShift) => {
    setShift(next)
    prefill(next)
    setFailed(false)
  }
  const setWorking = (working: 'work' | 'rest') => {
    if (working === 'work' && shift === null) changeShift(startShift())
    if (working === 'rest' && shift !== null) changeShift(null)
  }
  const step = (key: OvertimeKind, by: number) => {
    if (key === 'holiday') setAutoHoliday(false)
    setMinutes((now) => ({ ...now, [key]: Math.min(OVERTIME_MAX, Math.max(0, now[key] + by)) }))
    setFailed(false)
  }

  const problem = shift !== null ? shiftProblem(shift) : null

  async function run(work: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setFailed(false)
    try {
      await work()
      onSaved()
    } catch {
      setFailed(true)
      setBusy(false)
      onFailed()
    }
  }

  const save = () =>
    run(async () => {
      const note = memo.trim() === '' ? null : memo.trim()
      let cleared = false
      if (!sameShift(shift, base) || note !== null) await store.saveChange({ staffId: member.id, day, shift, memo: note })
      else if (change !== undefined) {
        await store.resetDay(member.id, day)
        cleared = true
      }
      for (const key of KINDS) {
        const before = cleared ? 0 : initial[key]
        if (minutes[key] !== before) await store.saveOvertime({ staffId: member.id, day, kind: key, minutes: minutes[key] })
      }
    })

  const reset = () => run(() => store.resetDay(member.id, day))

  // 뒤 가림막 자신을 눌렀을 때만 닫는다
  const closeOnBackdrop = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose()
  }

  return (
    <div onClick={closeOnBackdrop} className="fixed inset-0 z-30 flex items-center justify-center bg-ink/36 p-4">
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`${ds.layer} flex max-h-full w-full max-w-120 flex-col gap-5 overflow-y-auto p-6 outline-hidden`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 id={titleId} className="text-lead font-semibold text-ink">
              {`${member.name} · ${dayTitle(day)}`}
            </h2>
            <p className="text-small text-muted">{baseShiftText(base)}</p>
          </div>
          <button type="button" aria-label="닫기" className={ds.button.ghostSmall} onClick={onClose}>
            ✕
          </button>
        </div>

        <ReadOnlyFields>
          <div className="flex flex-col gap-2">
            <p className={ds.label}>그날 근무</p>
            <Segment
              label="그날 근무"
              className="self-start"
              options={[
                ['work', '일함'],
                ['rest', '쉼'],
              ]}
              value={shift !== null ? 'work' : 'rest'}
              onChange={setWorking}
            />
            {shift !== null ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <ShiftFields shift={shift} onChange={changeShift} />
              </div>
            ) : null}
            {problem !== null ? <p className={ds.fieldError}>{problem}</p> : null}
            <p className={ds.help}>근무 시간을 늘려도 더 일한 시간은 저절로 늘지 않아요. 아래 칸에 따로 적어 주세요.</p>
          </div>

          <div className="flex flex-col gap-2">
            <p className={ds.label}>
              더 일한 시간 <span className={ds.labelHint}>30분씩 늘고 줄어요</span>
            </p>
            {KINDS.map((key) => {
              const label = OVERTIME_KIND_LABEL[key]
              return (
                <div key={key} className="flex items-center justify-between gap-3 border-b border-line py-2 last-of-type:border-b-0">
                  <span className="flex min-w-0 flex-col">
                    <span className="text-small font-semibold text-ink">{label}</span>
                    <span className="text-caption text-muted">{KIND_HELP[key]}</span>
                  </span>
                  <div role="group" aria-label={label} className="inline-flex shrink-0 items-center gap-2">
                    <button type="button" aria-label={`${label} 30분 줄이기`} className={STEP_BUTTON} disabled={minutes[key] <= 0} onClick={() => step(key, -OVERTIME_STEP)}>
                      −
                    </button>
                    <span role="status" className={`w-24 text-center text-small font-semibold tabular-nums ${minutes[key] > 0 ? 'text-ink' : 'text-muted'}`}>
                      {fmtMinutes(minutes[key])}
                    </span>
                    <button type="button" aria-label={`${label} 30분 늘리기`} className={STEP_BUTTON} disabled={minutes[key] >= OVERTIME_MAX} onClick={() => step(key, OVERTIME_STEP)}>
                      +
                    </button>
                  </div>
                </div>
              )
            })}
            <p className={ds.help}>공휴일·휴진일에 일하면 그 시간은 &apos;휴일&apos;로 들어가요.</p>
          </div>

          <div className={ds.field}>
            <label htmlFor={memoId} className={ds.label}>
              메모
            </label>
            <input
              id={memoId}
              type="text"
              maxLength={MEMO_MAX}
              className={ds.input}
              value={memo}
              onChange={(event) => {
                setMemo(event.target.value)
                setFailed(false)
              }}
            />
            <p className={ds.help}>휴가는 이 창이 아니라 휴가 화면에서 넣어요.</p>
          </div>
        </ReadOnlyFields>

        {failed ? <ErrorCard code="E-STAFF-SAVE-FAILED" /> : null}

        <WriteOnly>
          <div className="flex items-center justify-between gap-2">
            <button type="button" className={ds.button.secondary} aria-busy={busy || undefined} onClick={reset}>
              기본으로 되돌리기
            </button>
            <button type="button" className={ds.button.primary} aria-busy={busy || undefined} disabled={problem !== null} onClick={save}>
              저장
            </button>
          </div>
        </WriteOnly>
      </div>
    </div>
  )
}
