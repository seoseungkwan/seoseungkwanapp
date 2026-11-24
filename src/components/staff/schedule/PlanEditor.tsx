'use client'

import { useId, useState } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { WriteOnly } from '@/components/shell/viewing'
import { ReadOnlyFields } from '@/components/staff/ReadOnlyFields'
import { EMPLOYMENT_LABEL, jobLabel } from '@/components/staff/labels'
import { ds } from '@/components/ui/classes'
import { addDays, isYmd, weekStartOf } from '@/lib/analytics/dates'
import { planOn } from '@/lib/staff/schedule'
import type { StaffStore } from '@/lib/storage/staff'
import type { DayShift, SatRotation, StaffMember, WeekPlan } from '@/types/staff'
import { WEEKDAYS, clinicShift, dayTitle, type ClinicCtx, type Shift } from './format'
import { Segment, ShiftFields, shiftProblem } from './parts'

// 기본 근무 고치기 (staff AC-7613.3, 시안 schedule.html ③). 주 보기에서 이름을 누르면 근무표 대신 열린다.
// 요일마다 [일함]·[쉼]과 근무·점심(10분 단위, 점심 '없음'), 토요일은 [매주]·[1·3주]·[2·4주].
// '언제부터' 날짜(처음 값은 오늘 다음 월요일)부터 새 판으로 저장한다 — 지난 근무표는 그대로다(그 날짜 판이 이미 있으면 그 판을 고친다).
// 처음 값은 그 날짜에 쓰일 판(없으면 가장 늦은 판), 판이 없는 사람은 병원 진료시간이다. [저장]이 끝나면 근무표로 돌아간다
// 관리자가 다른 의원을 보는 중이면(admin-view AC-8009.3) 요일마다 근무·언제부터는 보이기만 하고(칸 막힘) [저장]이 없다. [◀ 근무표로]는 그대로

const SATURDAY = 5
const ROTATIONS: readonly (readonly [SatRotation, string])[] = [
  ['every', '매주'],
  ['1-3', '1·3주'],
  ['2-4', '2·4주'],
]
const ROTATION_HELP: Record<Exclude<SatRotation, 'every'>, string> = {
  '1-3': '그달 첫째·셋째 토요일에 일해요. 다섯째 토요일은 쉬어요.',
  '2-4': '그달 둘째·넷째 토요일에 일해요. 다섯째 토요일은 쉬어요.',
}
const FALLBACK: Shift = { start: 9 * 60, end: 18 * 60, lunchFrom: null, lunchTo: null }

// 날짜 글자 위에 투명하게 겹친 날짜 입력(대시보드 날짜 고르기 DateControl과 같은 모양) — 어디를 눌러도 달력이 열린다
const DATE =
  'relative inline-flex h-8 cursor-pointer items-center rounded-control border border-line-strong bg-surface px-2 text-small font-semibold text-ink tabular-nums transition hover:bg-canvas focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent'
const DATE_INPUT =
  'absolute inset-0 size-full cursor-pointer opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:m-0 [&::-webkit-calendar-picker-indicator]:size-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:p-0'

type PlanEditorProps = {
  member: StaffMember
  plans: readonly WeekPlan[]
  ctx: ClinicCtx
  today: string
  store: StaffStore
  onBack(): void
  /** 저장이 끝남(직원 자료를 다시 읽고 근무표로 돌아간다) */
  onSaved(): void
}

export function PlanEditor({ member, plans, ctx, today, store, onBack, onSaved }: PlanEditorProps) {
  const titleId = useId()
  const rotationId = useId()
  const [from, setFrom] = useState(() => addDays(weekStartOf(today), 7))
  const [draft, setDraft] = useState<{ week: DayShift[]; sat: SatRotation }>(() => {
    const mine = plans.filter((p) => p.staffId === member.id)
    const latest = mine.reduce<WeekPlan | null>((last, p) => (last === null || p.from > last.from ? p : last), null)
    const plan = planOn(mine, from) ?? latest
    if (plan !== null) return { week: [...plan.week], sat: plan.sat }
    return { week: WEEKDAYS.map((_, i) => clinicShift(ctx.hours[i] ?? null)), sat: 'every' }
  })
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const problems = draft.week.map((shift) => (shift === null ? null : shiftProblem(shift)))
  const blocked = problems.some((p) => p !== null)

  const setDay = (index: number, shift: DayShift) => {
    setDraft((now) => ({ ...now, week: now.week.map((s, i) => (i === index ? shift : s)) }))
    setFailed(false)
  }
  // [일함]의 처음 시간: 그 요일 병원 진료시간 → 이 사람 다른 요일 근무 → 09:00~18:00
  const startShift = (index: number): Shift => clinicShift(ctx.hours[index] ?? null) ?? draft.week.find((s) => s !== null) ?? FALLBACK

  async function save() {
    if (busy || blocked) return
    setBusy(true)
    setFailed(false)
    try {
      await store.savePlan(member.id, from, draft.week, draft.sat)
      onSaved()
    } catch {
      setFailed(true)
      setBusy(false)
    }
  }

  const title = `${member.name} — 기본 근무`
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4">
      <div>
        <button type="button" className={ds.button.secondarySmall} onClick={onBack}>
          ◀ 근무표로
        </button>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <b id={titleId} className="text-subtitle font-semibold text-ink">
          {title}
        </b>
        <small className="text-small text-muted">{`${jobLabel(member)} · ${EMPLOYMENT_LABEL[member.employment]} · 주 ${member.weeklyHours}시간`}</small>
      </div>

      <ReadOnlyFields>
        <div className="flex flex-col rounded-control border border-line bg-surface px-5">
          {WEEKDAYS.map((name, index) => {
            const shift = draft.week[index] ?? null
            return (
              <div key={name} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line py-3 last:border-b-0">
                <span className="w-6 text-body font-semibold text-ink">{name}</span>
                <Segment
                  label={`${name}요일`}
                  options={[
                    ['work', '일함'],
                    ['rest', '쉼'],
                  ]}
                  value={shift !== null ? 'work' : 'rest'}
                  onChange={(value) => {
                    if (value === 'work' && shift === null) setDay(index, startShift(index))
                    if (value === 'rest' && shift !== null) setDay(index, null)
                  }}
                />
                {shift !== null ? <ShiftFields shift={shift} prefix={`${name}요일 `} onChange={(next) => setDay(index, next)} /> : <span className="text-small text-muted">쉬는 요일</span>}
                {index === SATURDAY && shift !== null ? (
                  <div className="flex basis-full flex-wrap items-center gap-x-3 gap-y-1.5 pl-10">
                    <span id={rotationId} className="text-small text-ink-2">
                      어느 토요일에
                    </span>
                    <Segment labelledBy={rotationId} options={ROTATIONS} value={draft.sat} onChange={(sat) => setDraft((now) => ({ ...now, sat }))} />
                    {draft.sat !== 'every' ? <small className="text-caption text-muted">{ROTATION_HELP[draft.sat]}</small> : null}
                  </div>
                ) : null}
                {problems[index] !== null ? <p className={`${ds.fieldError} basis-full pl-10`}>{problems[index]}</p> : null}
              </div>
            )
          })}
        </div>
        <p className={ds.help}>시간은 10분 단위로 골라요. 점심이 없으면 &apos;없음&apos;을 골라요.</p>

        <p className="flex flex-wrap items-center gap-1.5 text-body text-ink-2">
          지난 근무표는 그대로 두고{' '}
          <label className={DATE}>
            <span>{dayTitle(from)}</span>
            <input
              type="date"
              aria-label="바꾸기 시작하는 날"
              className={DATE_INPUT}
              value={from}
              onChange={(event) => {
                if (isYmd(event.target.value)) setFrom(event.target.value)
              }}
            />
          </label>{' '}
          부터 이 근무로 바꿔요.
        </p>
      </ReadOnlyFields>

      {failed ? <ErrorCard code="E-STAFF-SAVE-FAILED" /> : null}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-control bg-canvas px-4 py-3">
        <p className="text-small text-ink-2">이 근무가 매주 근무표의 바탕이 돼요.</p>
        <WriteOnly>
          <button type="button" className={ds.button.primary} aria-busy={busy || undefined} disabled={blocked} onClick={save}>
            저장
          </button>
        </WriteOnly>
      </div>
    </section>
  )
}
