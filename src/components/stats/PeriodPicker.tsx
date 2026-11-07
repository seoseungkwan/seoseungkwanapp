'use client'

import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { formatCount } from '@/components/charts/format'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import { addDays, compareYmd } from '@/lib/analytics/dates'
import { checkCustom, defaultPick, FIRST_DAY, pickRange, stepPick, type PickUnit, type StatsChoice, type StatsPick } from './periodPick'
import { statsRange } from './view'

// 기간 고르기 부품 (stats-period REQ-1702·REQ-1703, design.md 'PeriodPicker.tsx', 승인 시안 BEpX6zDbmmBmvBhZqCKmno).
// 빠른 단추 넷은 통계 화면이 그리고, 이 부품은 그 옆 '기간 골라 보기'다: [일별][주별][월별] · ◀ 2026년 10월 ▶ · [직접 날짜] + 직접 날짜 판.
// props만 받는다(고른 것은 저장하지 않는다). 판의 고치던 날짜·단위만 이 부품 안 상태다.
// 휴대폰(768px 미만)은 한 줄씩 전체 폭·44px이고 판은 단추 바로 아래 문서 흐름 안이다(AC-1703.5)

// 기간 단추 모양은 ds.segment 하나다(대시보드 추이 빠른 단추와 같다, dashboard-ux AC-2707.4). 휴대폰은 넷이 같은 폭 44px.
// 통계 화면 빠른 단추도 여기서 불러간다(TASK-8). 그려지는 클래스는 옮기기 전과 같다
export const PERIOD_GROUP = `${ds.segment.group} max-md:grid-cols-4`
export const PERIOD_BUTTON = ds.segment.button
export const PERIOD_ON = ds.segment.on
export const PERIOD_OFF = ds.segment.off

// 단위 셋 묶음(위쪽은 빠른 단추 묶음과 같은 모양, 휴대폰 세 칸). 판 안은 판 폭을 세 칸으로 나눈다
const UNIT_GROUP = `${ds.segment.group} max-md:grid-cols-3`
const PANEL_UNIT_GROUP = 'grid grid-cols-3 overflow-clip rounded-control border border-line-strong bg-surface'
// ◀ 2026년 10월 ▶ : 테두리 한 상자(32px, 휴대폰 44px 전체 폭). 가운데 글은 고르는 중이면 진하게, 아니면 흐리게
const STEP_BOX = 'inline-flex h-8 shrink-0 items-stretch overflow-clip rounded-control border border-line-strong bg-surface max-md:h-11 max-md:w-full'
const STEP_ARROW =
  'flex h-full w-8 cursor-pointer items-center justify-center text-ink-2 transition hover:bg-canvas focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 max-md:w-12'
const STEP_LABEL = 'flex min-w-30 items-center justify-center whitespace-nowrap border-x border-line px-2 text-small max-md:min-w-0 max-md:flex-1 max-md:text-body'
const STEP_ON = 'font-semibold text-ink'
const STEP_OFF = 'font-medium text-muted'
// [직접 날짜]: 눌리면 accent 테두리·바탕
const CUSTOM_BUTTON =
  'inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-control border px-3 text-small focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent max-md:h-11 max-md:w-full'
const CUSTOM_ON = 'border-accent bg-accent-soft font-semibold text-accent-strong'
const CUSTOM_OFF = 'border-line-strong bg-surface font-medium text-ink-2 transition hover:bg-canvas'
// 판: 768px 이상은 단추 아래 뜬 판(층 모양), 미만은 문서 흐름 안 전체 폭.
// 768px 이상 너비는 400px과 '화면 폭 − 좌우 24px씩' 중 작은 값이다(dashboard-ux AC-2703.3, 화면 가장자리에 닿지 않는다).
// 기본은 부품 왼쪽 끝에 맞추고(통계 탭), align="end"면 오른쪽 끝에 맞춰 왼쪽으로 펼친다(대시보드 추이: 묶음이 오른쪽 끝에 있다)
const PANEL =
  'absolute top-full left-0 z-30 mt-2 flex w-100 flex-col gap-3 rounded-float border border-line bg-surface p-4 md:max-w-[calc(100vw-3rem)] md:shadow-float max-md:static max-md:w-full'
const PANEL_END = `${PANEL} md:right-0 md:left-auto`

const UNITS: { unit: PickUnit; name: string }[] = [
  { unit: 'day', name: '일별' },
  { unit: 'week', name: '주별' },
  { unit: 'month', name: '월별' },
]

type Draft = { from: string; to: string; unit: PickUnit }
type Props = {
  choice: StatsChoice
  lastDay: string
  todayDone: boolean
  onChoose: (choice: StatsChoice) => void
  /** 직접 날짜 판을 맞출 끝(768px 이상). 기본 start(왼쪽 끝) */
  align?: 'start' | 'end'
}

type StepPick = Extract<StatsPick, { kind: 'month' | 'year' }>

const isQuick = (choice: StatsChoice): choice is Exclude<StatsChoice, StatsPick> => typeof choice === 'string'
const isStep = (choice: StatsChoice): choice is StepPick => !isQuick(choice) && choice.kind !== 'custom'
const keyOf = (choice: StatsChoice) => (isQuick(choice) ? choice : JSON.stringify(choice))
const unitOf = (pick: StatsPick): PickUnit => (pick.kind === 'year' ? 'month' : pick.unit)
const stepName = (pick: StepPick) => (pick.kind === 'year' ? `${Number(pick.year)}년` : `${Number(pick.month.slice(0, 4))}년 ${Number(pick.month.slice(5, 7))}월`)

// ◀ ▶ 기준: 달·해를 고르는 중이면 그것, 아니면 지난달(같은 단위, 월별은 끝난 날의 해). defaultPick은 직접 날짜를 주지 않는다
function stepBase(choice: StatsChoice, lastDay: string): StepPick {
  if (isStep(choice)) return choice
  const base = defaultPick(isQuick(choice) ? 'day' : choice.unit, lastDay)
  return isStep(base) ? base : { kind: 'month', unit: 'day', month: lastDay.slice(0, 7) }
}

// 직접 날짜 기간 글. 해를 한 자리씩 치는 동안의 먼 날짜처럼 셀 수 없는 값이면 null이다
function customLabel(today: string, draft: Draft, todayDone: boolean): string | null {
  try {
    return pickRange(today, { kind: 'custom', ...draft }, todayDone).label
  } catch {
    return null
  }
}

// 위쪽 단위 단추: 빠른 단추·직접 날짜는 지난달(월별은 끝난 날의 해), 달은 그 달 그대로(월별은 그 해), 해는 그 해 12월(끝난 날의 해면 지난달)
function unitPick(choice: StatsChoice, unit: PickUnit, lastDay: string): StatsPick {
  if (isQuick(choice) || choice.kind === 'custom') return defaultPick(unit, lastDay)
  if (choice.kind === 'month') return unit === 'month' ? { kind: 'year', year: choice.month.slice(0, 4) } : { kind: 'month', unit, month: choice.month }
  if (unit === 'month') return choice
  return choice.year === lastDay.slice(0, 4) ? defaultPick(unit, lastDay) : { kind: 'month', unit, month: `${choice.year}-12` }
}

export function PeriodPicker({ choice, lastDay, todayDone, onChoose, align = 'start' }: Props) {
  const today = todayDone ? lastDay : addDays(lastDay, 1)
  const captionId = useId()
  const panelId = useId()
  const customRef = useRef<HTMLButtonElement>(null)
  // 판은 연 때의 고른 것에 매인다: 바깥에서 고른 것이 바뀌면(빠른 단추·이 기간 보기) 저절로 닫힌다
  const [openFor, setOpenFor] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>({ from: '', to: '', unit: 'day' })
  const open = openFor === keyOf(choice)

  const custom = !isQuick(choice) && choice.kind === 'custom' ? choice : null
  const picking = isStep(choice) ? choice : null
  const chosenUnit = isQuick(choice) ? null : unitOf(choice)
  const base = stepBase(choice, lastDay)
  const prev = stepPick(base, -1, lastDay)
  const next = stepPick(base, 1, lastDay)

  function openPanel(next: Draft) {
    setDraft(next)
    setOpenFor(keyOf(choice))
  }
  function closePanel() {
    setOpenFor(null)
    customRef.current?.focus()
  }

  // 판의 처음 날짜·단위 = 고른 기간. 빠른 단추는 그 기간(끝난 날까지)·일별, 최근 12개월은 월별
  function draftOf(): Draft {
    if (custom !== null) return { from: custom.from, to: custom.to, unit: custom.unit }
    if (picking !== null) {
      const { current } = pickRange(today, picking, todayDone)
      return { from: current.from, to: current.to, unit: unitOf(picking) }
    }
    const period = choice as Exclude<StatsChoice, StatsPick>
    const { current } = statsRange(today, period)
    return { from: current.from, to: compareYmd(current.to, lastDay) > 0 ? lastDay : current.to, unit: period === '12m' ? 'month' : 'day' }
  }

  function chooseUnit(unit: PickUnit) {
    if (custom !== null) {
      // 직접 날짜는 단위만 바꾼다. 일별로 92일을 넘으면 바꾸지 않고 판을 경고와 함께 연다(AC-1703.7)
      if (unit === 'day' && checkCustom(custom.from, custom.to, 'day', lastDay, todayDone).kind === 'warn') {
        openPanel({ from: custom.from, to: custom.to, unit: 'day' })
        return
      }
      setOpenFor(null)
      onChoose({ ...custom, unit })
      return
    }
    setOpenFor(null)
    onChoose(unitPick(choice, unit, lastDay))
  }

  function moveTo(pick: StatsPick | null) {
    if (pick === null) return
    setOpenFor(null)
    onChoose(pick)
  }

  const check = checkCustom(draft.from, draft.to, draft.unit, lastDay, todayDone)
  const label = check.kind === 'error' ? null : customLabel(today, draft, todayDone)
  const canApply = check.kind === 'ok' && label !== null

  function apply() {
    if (!canApply) return
    setOpenFor(null)
    onChoose({ kind: 'custom', unit: draft.unit, from: draft.from, to: draft.to })
    customRef.current?.focus()
  }

  function onPanelKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Escape') return
    event.stopPropagation()
    closePanel()
  }

  return (
    <div role="group" aria-labelledby={captionId} className="relative max-md:w-full">
      <p id={captionId} className="mb-1.5 text-caption text-muted">
        기간 골라 보기
      </p>
      <div className="flex flex-wrap items-center gap-2 max-md:flex-col max-md:items-stretch">
        <div role="group" aria-label="보는 단위" className={UNIT_GROUP}>
          {UNITS.map(({ unit, name }) => (
            <button
              key={unit}
              type="button"
              aria-pressed={chosenUnit === unit}
              onClick={() => chooseUnit(unit)}
              className={`${PERIOD_BUTTON} ${chosenUnit === unit ? PERIOD_ON : PERIOD_OFF}`}
            >
              {name}
            </button>
          ))}
        </div>
        <div role="group" aria-label="기간 옮기기" className={STEP_BOX}>
          <button
            type="button"
            aria-label={base.kind === 'year' ? '이전 해' : '이전 달'}
            disabled={prev === null}
            onClick={() => moveTo(prev)}
            className={STEP_ARROW}
          >
            <Icon name="chev" className="rotate-90" />
          </button>
          {/* ◀ ▶로 바뀐 달·해를 화면 읽기에도 알린다 */}
          <span aria-live="polite" className={`${STEP_LABEL} ${picking !== null ? STEP_ON : STEP_OFF}`}>
            {stepName(base)}
          </span>
          <button
            type="button"
            aria-label={base.kind === 'year' ? '다음 해' : '다음 달'}
            disabled={next === null}
            onClick={() => moveTo(next)}
            className={STEP_ARROW}
          >
            <Icon name="chev" className="-rotate-90" />
          </button>
        </div>
        <button
          ref={customRef}
          type="button"
          aria-pressed={custom !== null}
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onClick={() => (open ? setOpenFor(null) : openPanel(draftOf()))}
          className={`${CUSTOM_BUTTON} ${custom !== null ? CUSTOM_ON : CUSTOM_OFF}`}
        >
          <Icon name="cal" className="shrink-0" />
          {custom === null ? '직접 날짜' : `직접 날짜 · ${pickRange(today, custom, todayDone).label}`}
        </button>
      </div>

      {open && (
        <CustomPanel
          id={panelId}
          className={align === 'end' ? PANEL_END : PANEL}
          draft={draft}
          lastDay={lastDay}
          check={check}
          label={label}
          canApply={canApply}
          onDraft={(change) => setDraft((d) => ({ ...d, ...change }))}
          onClose={closePanel}
          onApply={apply}
          onKeyDown={onPanelKey}
        />
      )}
    </div>
  )
}

type PanelProps = {
  id: string
  className: string
  draft: Draft
  lastDay: string
  check: ReturnType<typeof checkCustom>
  label: string | null
  canApply: boolean
  onDraft: (change: Partial<Draft>) => void
  onClose: () => void
  onApply: () => void
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
}

// 직접 날짜 판(AC-1703.3). 날짜 칸은 FIRST_DAY(2020-01-01)~끝난 날이다. 오류·경고 동안 [이 기간 보기]는 disabled이고(날짜 한도 오류 AC-1702.4 포함),
// 경고의 [주별로 보기]·[월별로 보기]는 판의 단위만 바꾼다
function CustomPanel({ id, className, draft, lastDay, check, label, canApply, onDraft, onClose, onApply, onKeyDown }: PanelProps) {
  const titleId = useId()
  return (
    <div id={id} role="dialog" aria-labelledby={titleId} onKeyDown={onKeyDown} className={className}>
      <p id={titleId} className={ds.panelTitle}>
        직접 날짜 고르기
      </p>
      <div className="flex items-end gap-2 max-md:flex-col max-md:items-stretch">
        <label className={`${ds.field} min-w-0 flex-1`}>
          <span className={ds.label}>시작 날짜</span>
          {/* 열면 초점이 시작 날짜에 간다(판 안으로) */}
          <input type="date" autoFocus className={ds.input} min={FIRST_DAY} max={lastDay} value={draft.from} onChange={(event) => onDraft({ from: event.target.value })} />
        </label>
        <span aria-hidden="true" className="pb-3 text-muted max-md:hidden">
          ~
        </span>
        <label className={`${ds.field} min-w-0 flex-1`}>
          <span className={ds.label}>끝 날짜</span>
          <input type="date" className={ds.input} min={FIRST_DAY} max={lastDay} value={draft.to} onChange={(event) => onDraft({ to: event.target.value })} />
        </label>
      </div>
      <div>
        <p className="mb-1.5 text-caption text-muted">보는 단위</p>
        <div role="group" aria-label="보는 단위" className={PANEL_UNIT_GROUP}>
          {UNITS.map(({ unit, name }) => (
            <button
              key={unit}
              type="button"
              aria-pressed={draft.unit === unit}
              onClick={() => onDraft({ unit })}
              className={`${PERIOD_BUTTON} ${draft.unit === unit ? PERIOD_ON : PERIOD_OFF}`}
            >
              {name}
            </button>
          ))}
        </div>
      </div>
      <div aria-live="polite" className="flex flex-col gap-2">
        {label !== null && check.kind !== 'error' && check.days !== undefined && (
          <p className="text-small text-ink-2">
            고른 기간: {label} · {formatCount(check.days)}일
          </p>
        )}
        {check.kind === 'warn' && (
          <div className="flex flex-col gap-2 rounded-control bg-warning-soft p-3">
            <p className="text-small font-semibold text-warning">{check.text}</p>
            <div className="flex gap-2">
              <button type="button" className={`${ds.button.secondarySmall} max-md:flex-1`} onClick={() => onDraft({ unit: 'week' })}>
                주별로 보기
              </button>
              <button type="button" className={`${ds.button.secondarySmall} max-md:flex-1`} onClick={() => onDraft({ unit: 'month' })}>
                월별로 보기
              </button>
            </div>
          </div>
        )}
        {check.kind === 'error' && <p className={ds.fieldError}>{check.text}</p>}
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className={`${ds.button.secondary} max-md:flex-1`} onClick={onClose}>
          닫기
        </button>
        <button type="button" className={`${ds.button.primary} max-md:flex-2`} disabled={!canApply} onClick={onApply}>
          이 기간 보기
        </button>
      </div>
    </div>
  )
}
