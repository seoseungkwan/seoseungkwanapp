'use client'

import { useId, useRef, useState, type FormEvent } from 'react'
import { formatCount, percentOf } from '@/components/charts/format'
import { ErrorCard } from '@/components/common/ErrorCard'
import { formatManWon } from '@/components/revenue/money'
import { ds } from '@/components/ui/classes'
import { goalPace, statsDayValues, type DayValue, type StatsDayTotals } from '@/lib/analytics/goalPace'
import { GOAL_COUNT_MAX, GOAL_KEYS, GOAL_REVENUE_MAX, type Goal, type GoalKey } from '@/types/goals'
import { Section } from './parts'

// 통계 요약 '이번 달 목표' 칸 (stats-insights REQ-6102 AC-6102.4·AC-6102.5, 시안 docs/mockups/stats-insights ②).
// 목표가 있는 지표만 내원 → 신환 → 매출 줄: 지금까지 / 목표 · 달성률, 막대(달성률, 100%까지) + 오늘 세로줄(지나간 만큼), 이 속도면 월말 예상 · 예상률 · 모자람/넘김.
// 셈은 goalPace(순수)가 한다. 내원·신환은 넓은 하루 읽기의 저장된 하루 숫자, 매출은 useStatsGoals의 하루 매출(sales_days 총액)이다.
// 목표 적기·고치기: 숫자 칸 셋(매출은 만 원), 빈 칸 = 목표 없음. 저장 실패는 lib/errors.ts 문구(E-STATS-SAVE-FAILED)를 보이고 적은 값은 그대로 둔다.
// props만 받는다(읽기·저장은 부르는 쪽). 오늘 기준이고 위 기간 고르기와 상관없다

/** 'reading' = 읽는 중(비움), 'failed' = 읽기 실패 */
export type GoalRead<T> = T | 'reading' | 'failed'
/** useStatsGoals가 주는 것 */
export type StatsGoalsShown = {
  today: string // 한국 날짜
  goal: GoalRead<Goal> // 이번 달 목표
  revenue: GoalRead<readonly DayValue[]> // 오늘 앞 56일 ~ 어제의 하루 매출
  onReread(): void
  /** 이번 달 목표 저장. 실패하면 거절한다 */
  onSave(goal: Goal): Promise<void>
}
export type GoalSectionProps = StatsGoalsShown & {
  days: GoalRead<readonly StatsDayTotals[]> // 저장된 하루 숫자(넓은 하루 읽기). 오늘 앞 56일 ~ 어제를 덮어야 한다
}

const TITLE = '이번 달 목표'
const EMPTY = '이번 달 목표를 적어 두면 달성률을 보여 줘요'
export const GOAL_NOTE = '세로줄은 이번 달이 지나간 만큼이에요. 월말 예상은 지금까지에 남은 날마다 지난 8주 같은 요일의 하루 평균을 더해요.'
const RETRY = '다시 읽기'
const WRITE = '목표 적기'
const EDIT = '목표 고치기'
const SAVE = '저장'
const CANCEL = '취소'

const NAME: Record<GoalKey, string> = { visits: '내원', newPatients: '신환', revenue: '매출' }
const LABEL: Record<GoalKey, string> = { visits: '내원 (명)', newPatients: '신환 (명)', revenue: '매출 (만 원)' }
const WON_PER_MAN = 10_000
// 칸에 적는 단위(매출은 만 원)의 상한
const INPUT_MAX: Record<GoalKey, number> = { visits: GOAL_COUNT_MAX, newPatients: GOAL_COUNT_MAX, revenue: GOAL_REVENUE_MAX / WON_PER_MAN }
const badText = (key: GoalKey) => `0~${formatCount(INPUT_MAX[key])} 사이의 정수로 적어 주세요`

const amountText = (key: GoalKey, n: number) => (key === 'revenue' ? formatManWon(n) : `${formatCount(n)}명`)

const BUTTON = `${ds.button.secondarySmall} max-md:w-full`
const PRIMARY = `${ds.button.primarySmall} max-md:w-full`
const NOTE = 'mt-2 text-small text-st-muted'

type Drafts = Record<GoalKey, string>
type Parsed = { goal: Goal; bad: GoalKey[] }

const draftOf = (goal: Goal): Drafts => ({
  visits: goal.visits === null ? '' : String(goal.visits),
  newPatients: goal.newPatients === null ? '' : String(goal.newPatients),
  revenue: goal.revenue === null ? '' : String(goal.revenue / WON_PER_MAN),
})

/** 적은 글 → 목표. 빈 칸 = null, 빈칸·쉼표는 무시, 0 ~ 상한 정수만. 매출은 만 원 × 10,000원 */
function parse(drafts: Drafts): Parsed {
  const goal: Goal = { visits: null, newPatients: null, revenue: null }
  const bad: GoalKey[] = []
  for (const key of GOAL_KEYS) {
    const text = drafts[key].replace(/[\s,]/g, '')
    if (text === '') continue
    const n = /^\d+$/.test(text) ? Number(text) : Number.NaN
    if (!(n <= INPUT_MAX[key])) bad.push(key)
    else goal[key] = key === 'revenue' ? n * WON_PER_MAN : n
  }
  return { goal, bad }
}

// 막대: 달성률 폭(100%까지) + 오늘 세로줄. 숫자는 위아래 글이 그대로 말하므로 화면 읽기에서 숨긴다
function Track({ pct, elapsed }: { pct: number; elapsed: number }) {
  return (
    <div aria-hidden="true" className="relative my-1 h-3 rounded-st-sm border border-st-line bg-st-canvas">
      <div data-part="fill" className="absolute inset-y-0 left-0 rounded-st-sm bg-accent" style={{ width: `${Math.min(pct, 100)}%` }} />
      <div data-part="today" className="absolute -inset-y-1 w-0.5 bg-st-ink" style={{ left: `${percentOf(elapsed, 1)}%` }} />
    </div>
  )
}

function GoalRow({ name, target, today, days, unit }: { name: GoalKey; target: number; today: string; days: readonly DayValue[]; unit: (n: number) => string }) {
  const pace = goalPace({ today, goal: target, days })
  const short = target - pace.forecast
  return (
    <div role="group" aria-label={NAME[name]} className="py-2">
      <p className="flex flex-wrap items-baseline justify-between gap-x-2 text-body">
        <span className="font-semibold text-st-ink">{NAME[name]}</span>
        <span className="text-st-ink-2 tabular-nums">{`${unit(pace.soFar)} / 목표 ${unit(target)} · ${pace.donePct}%`}</span>
      </p>
      <Track pct={pace.donePct} elapsed={pace.elapsed} />
      <p className="text-small text-st-ink-2 tabular-nums">
        {'이 속도면 월말 '}
        <span className="font-semibold text-st-ink">{unit(pace.forecast)}</span>
        {` · 목표의 ${pace.forecastPct}% `}
        {short > 0 ? <span className="font-semibold text-negative">{`${unit(short)} 모자라요`}</span> : <span className="font-semibold text-positive">넘길 것 같아요</span>}
      </p>
    </div>
  )
}

function GoalForm({ goal, onSave, onClose }: { goal: Goal; onSave(goal: Goal): Promise<void>; onClose(): void }) {
  const [drafts, setDrafts] = useState<Drafts>(() => draftOf(goal))
  const [bad, setBad] = useState<readonly GoalKey[]>([])
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const sending = useRef(false)
  const id = useId()

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (sending.current) return
    const parsed = parse(drafts)
    setBad(parsed.bad)
    if (parsed.bad.length > 0) return
    sending.current = true
    setBusy(true)
    setFailed(false)
    try {
      await onSave(parsed.goal)
      onClose()
    } catch {
      setFailed(true)
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="mt-3">
      <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
        {GOAL_KEYS.map((key) => {
          const wrong = bad.includes(key)
          return (
            <div key={key} className={ds.field}>
              <label htmlFor={`${id}-${key}`} className={ds.label}>
                {LABEL[key]}
              </label>
              <input
                id={`${id}-${key}`}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={drafts[key]}
                aria-invalid={wrong || undefined}
                aria-describedby={wrong ? `${id}-${key}-bad` : undefined}
                onChange={(event) => setDrafts((now) => ({ ...now, [key]: event.target.value }))}
                className={`${ds.input} tabular-nums`}
              />
              {wrong && (
                <p id={`${id}-${key}-bad`} className={ds.fieldError}>
                  {badText(key)}
                </p>
              )}
            </div>
          )
        })}
      </div>
      {failed && (
        <div className="mt-3">
          <ErrorCard code="E-STATS-SAVE-FAILED" />
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="submit" aria-busy={busy || undefined} className={PRIMARY}>
          {SAVE}
        </button>
        <button type="button" onClick={onClose} className={BUTTON}>
          {CANCEL}
        </button>
      </div>
    </form>
  )
}

function ReadFailed({ onReread }: { onReread(): void }) {
  return (
    <>
      <ErrorCard code="E-STATS-READ-FAILED" />
      <div className="mt-2">
        <button type="button" onClick={onReread} className={BUTTON}>
          {RETRY}
        </button>
      </div>
    </>
  )
}

/** 통계 요약 '이번 달 목표' */
export function GoalSection({ today, goal, days, revenue, onReread, onSave }: GoalSectionProps) {
  const [editing, setEditing] = useState(false)

  if (goal === 'reading') return <Section title={TITLE}>{null}</Section>
  if (goal === 'failed') {
    return (
      <Section title={TITLE}>
        <ReadFailed onReread={onReread} />
      </Section>
    )
  }

  const shown = GOAL_KEYS.filter((key) => goal[key] !== null)
  const sourceOf = (key: GoalKey): GoalRead<readonly DayValue[]> => {
    if (key === 'revenue') return revenue
    return days === 'reading' || days === 'failed' ? days : statsDayValues(days, key)
  }
  const sources = shown.map((key) => sourceOf(key))
  if (sources.includes('failed')) {
    return (
      <Section title={TITLE}>
        <ReadFailed onReread={onReread} />
      </Section>
    )
  }

  const form = editing ? <GoalForm goal={goal} onSave={onSave} onClose={() => setEditing(false)} /> : null
  const open = (name: string) =>
    editing ? null : (
      <div className="mt-3">
        <button type="button" onClick={() => setEditing(true)} className={BUTTON}>
          {name}
        </button>
      </div>
    )

  if (shown.length === 0) {
    return (
      <Section title={TITLE}>
        <p className="mt-1 text-body text-st-ink-2">{EMPTY}</p>
        {open(WRITE)}
        {form}
      </Section>
    )
  }
  if (sources.includes('reading')) return <Section title={TITLE}>{null}</Section>

  return (
    <Section title={TITLE}>
      <div className="mt-1">
        {shown.map((key, i) => (
          <GoalRow key={key} name={key} target={goal[key]!} today={today} days={sources[i] as readonly DayValue[]} unit={(n) => amountText(key, n)} />
        ))}
      </div>
      <p className={NOTE}>{GOAL_NOTE}</p>
      {open(EDIT)}
      {form}
    </Section>
  )
}
