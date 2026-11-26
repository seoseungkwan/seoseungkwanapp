'use client'

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import type { FixNeed, GParsedFix, ParseCtx } from '@/lib/calendar/gshapes'
import { fixReasonText } from '@/lib/calendar/gtitle'
import type { GcalFix } from '@/types/gcal'
import { Drawer, InfoLine, optionButton } from '../AddPanel'
import { Swatch } from '../CalendarToolbar'
import { colorName } from './apptGoogle'
import { fixParsed, needChoices } from './fixApply'
import { dayWithYear, inFixRange, rangeProblem, readFixRange, writeFixRange, type FixRange } from './fixRange'
import * as T from './labels'
import { clock, kst } from './time'

// 고쳐야 할 구글 예약 판(spec google-link AC-8534.2·AC-8534.3, 시안 calendar.html ?s=fix, notes-calendar `fix` 글 그대로).
// 줄마다 구글 제목 원문을 다시 읽어(fixParsed) 고를 거리(needs)마다 고르기를 그린다 — 둘 이상이면 고르기도 둘 이상, 다 골라야 [예약표에 넣기].
// [예약표에 넣기]·[가져오지 않기]는 화면에 알리고(onPut·onSkip이 저장·알림), 된 줄은 판에 '✓ 넣었어요'·'가져오지 않음'으로 남는다
// (화면이 목록을 다시 읽어 그 줄이 빠져도). 판 제목의 수는 아직 남은 줄이다.
// 2차 고침(AC-8550·AC-8551, 시안 ?s=fix-range·fix-skipall, design.md 21-8): 판 맨 위 기간(시작·끝, 이 브라우저에 기억 — fixRange.ts)으로 목록·제목 수를 거르고
// (제목 옆 작은 글 = 이 판에 남은 전체 수), [이 기간 모두 가져오지 않기] → 확인 창 → onSkipAll(기간에 남은 줄). 한꺼번에 뺀 줄은 판에 남기지 않고 초록 줄 하나(기간을 바꾸면 사라짐).
// 올해가 아닌 날짜는 앞에 해를 붙인다(dayWithYear)

export type FixPanelProps = {
  /** 열린 고쳐야 할 것(화면이 다시 읽은 목록) */
  fixes: readonly GcalFix[]
  ctx: ParseCtx
  /** 한국 오늘(들어온 때가 오늘이면 시각만, 기간 처음 값, 올해) */
  today: string
  /** 고른 키(fixChoices 키, 고를 거리 차례)로 넣는다. true = 됨 */
  onPut(fix: GcalFix, keys: string[]): Promise<boolean>
  onSkip(fix: GcalFix): Promise<boolean>
  /** 기간에 남은 줄을 한꺼번에 가져오지 않는다(저장·알림은 화면). true = 됨 */
  onSkipAll(fixes: GcalFix[]): Promise<boolean>
  onClose(): void
}

/** put·skip = 하나씩(판에 줄로 남음), bulk = 한꺼번에(판에 줄로 남지 않음) */
type Done = 'put' | 'skip' | 'bulk'

const keepOpen = () => {} // 확인 창이 열린 동안 판의 Esc·바탕 누름은 판을 닫지 않는다(창의 Esc가 창만 닫는다)

export function FixPanel({ fixes, ctx, today, onPut, onSkip, onSkipAll, onClose }: FixPanelProps) {
  const [done, setDone] = useState<Readonly<Record<string, Done>>>({})
  // 판에 보이는 줄: 처음 목록 차례 그대로, 새로 온 줄은 끝에. 된 줄은 목록에서 빠져도 남긴다
  const [shown, setShown] = useState<readonly GcalFix[]>(fixes)
  const [seenFixes, setSeenFixes] = useState(fixes)
  if (seenFixes !== fixes) {
    setSeenFixes(fixes)
    setShown((prev) => [
      ...prev.flatMap((f) => {
        const now = fixes.find((x) => x.id === f.id)
        return now ? [now] : done[f.id] ? [f] : []
      }),
      ...fixes.filter((f) => !prev.some((p) => p.id === f.id)),
    ])
  }
  const [range, setRange] = useState<FixRange>(() => readFixRange(today))
  const [bulkDone, setBulkDone] = useState(0) // 초록 줄의 수(0 = 줄 없음)
  const [asking, setAsking] = useState(false)
  const [skipping, setSkipping] = useState(false)
  const skippingRef = useRef(false)
  const skipAllRef = useRef<HTMLButtonElement>(null)

  const problem = rangeProblem(range)
  const inRange = (fix: GcalFix) => inFixRange(fix, shown, range)
  const open = shown.filter((f) => !done[f.id]) // 이 판에서 넣거나 빼지 않은 것(전체)
  const openInRange = open.filter(inRange)
  const visible = shown.filter((f) => done[f.id] !== 'bulk' && inRange(f))
  const mark = (id: string, state: Done) => setDone((prev) => ({ ...prev, [id]: state }))

  function changeRange(next: FixRange) {
    setRange(next)
    writeFixRange(next)
    setBulkDone(0)
  }

  function closeAsk() {
    if (skippingRef.current) return
    setAsking(false)
    skipAllRef.current?.focus()
  }

  async function skipAll() {
    if (skippingRef.current) return
    const list = openInRange
    skippingRef.current = true
    setSkipping(true)
    let ok = false
    try {
      ok = await onSkipAll(list)
    } catch {
      ok = false
    } finally {
      skippingRef.current = false
      setSkipping(false)
    }
    setAsking(false)
    if (!ok) return
    setDone((prev) => {
      const next = { ...prev }
      for (const fix of list) next[fix.id] = 'bulk'
      return next
    })
    setBulkDone(list.length)
  }

  return (
    <>
      <Drawer
        title={T.fixTitle(openInRange.length)}
        titleNote={open.length !== openInRange.length ? T.fixTotal(open.length) : undefined}
        onClose={asking ? keepOpen : onClose}
        foot={
          <button type="button" className={ds.button.secondary} onClick={onClose}>
            {T.FIX_CLOSE}
          </button>
        }
      >
        <RangeBox range={range} problem={problem} left={openInRange.length} skipAllRef={skipAllRef} onRange={changeRange} onSkipAll={() => setAsking(true)} />
        {bulkDone > 0 && (
          <p data-fix-bulk className="flex items-center gap-2 rounded-control border border-positive/30 bg-positive-soft px-3.5 py-2.5 text-small text-positive">
            <Icon name="check" className="shrink-0" />
            <span>{T.bulkSkipDone(bulkDone)}</span>
          </p>
        )}
        <p className="text-body text-ink-2">{T.FIX_LEAD}</p>
        {problem === null && visible.length === 0 && (
          <div data-fix-empty className="grid gap-0.5 rounded-control border border-dashed border-line-strong p-4 text-center text-small text-ink-2">
            <b className="font-semibold text-ink">{T.FIX_EMPTY}</b>
            {open.length > 0 && <span className="text-caption text-muted">{T.fixElsewhere(open.length)}</span>}
          </div>
        )}
        {visible.length > 0 && (
          <div className="grid gap-2.5">
            {visible.map((fix) =>
              done[fix.id] ? (
                <DoneItem key={fix.id} fix={fix} state={done[fix.id]!} today={today} />
              ) : (
                <FixItem
                  key={fix.id}
                  fix={fix}
                  ctx={ctx}
                  today={today}
                  onPut={async (keys) => {
                    if (await onPut(fix, keys)) mark(fix.id, 'put')
                  }}
                  onSkip={async () => {
                    if (await onSkip(fix)) mark(fix.id, 'skip')
                  }}
                />
              ),
            )}
          </div>
        )}
        <div className="grid gap-1.5">
          <InfoLine>{T.FIX_INFO_LEAVE}</InfoLine>
          <InfoLine>{T.FIX_INFO_WORDS}</InfoLine>
        </div>
      </Drawer>
      {asking && (
        <SkipAllAsk
          count={openInRange.length}
          rangeText={T.skipAllRange(dayWithYear(range.from, today), range.to === '' ? '' : dayWithYear(range.to, today))}
          busy={skipping}
          onConfirm={() => void skipAll()}
          onCancel={closeAsk}
        />
      )}
    </>
  )
}

const FIELD = 'grid min-w-0 content-start gap-1.5'
const LABEL = 'flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-small font-semibold text-ink'
const DATE =
  'h-9 w-full min-w-0 rounded-control border border-line-strong bg-surface px-2 text-body text-ink focus-visible:border-accent focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-accent aria-invalid:border-negative'

/** 판 맨 위 기간 칸(시안 .rng): 시작 ~ 끝 · 오류 글 · 작은 글 + [이 기간 모두 가져오지 않기](기간에 남은 것이 있을 때만) */
function RangeBox({
  range,
  problem,
  left,
  skipAllRef,
  onRange,
  onSkipAll,
}: {
  range: FixRange
  problem: ReturnType<typeof rangeProblem>
  left: number
  skipAllRef: RefObject<HTMLButtonElement | null>
  onRange(next: FixRange): void
  onSkipAll(): void
}) {
  const fromId = useId()
  const toId = useId()
  const errorId = useId()
  const error = problem === 'no-from' ? T.FIX_NO_FROM : problem === 'end-before' ? T.FIX_END_BEFORE : null
  return (
    <section aria-label={T.FIX_RANGE_LABEL} className="grid gap-2 rounded-control border border-line bg-canvas p-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
        <div className={FIELD}>
          <label htmlFor={fromId} className={LABEL}>
            {T.FIX_FROM}
          </label>
          <input
            id={fromId}
            type="date"
            value={range.from}
            aria-invalid={problem === 'no-from' || undefined}
            aria-describedby={problem === 'no-from' ? errorId : undefined}
            className={DATE}
            onChange={(event) => onRange({ ...range, from: event.target.value })}
          />
        </div>
        <span aria-hidden="true" className="pb-1.75 text-muted">
          ~
        </span>
        <div className={FIELD}>
          <label htmlFor={toId} className={LABEL}>
            {T.FIX_TO} <span className="text-caption font-normal text-muted">{T.FIX_TO_HINT}</span>
          </label>
          <input
            id={toId}
            type="date"
            value={range.to}
            aria-invalid={problem === 'end-before' || undefined}
            aria-describedby={problem === 'end-before' ? errorId : undefined}
            className={DATE}
            onChange={(event) => onRange({ ...range, to: event.target.value })}
          />
        </div>
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-caption font-semibold text-negative">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
        <span className="text-caption text-muted">{T.FIX_RANGE_MEMO}</span>
        {problem === null && left > 0 && (
          <button ref={skipAllRef} type="button" className={ds.button.secondarySmall} onClick={onSkipAll}>
            {T.FIX_SKIP_ALL}
          </button>
        )}
      </div>
    </section>
  )
}

/** 한꺼번에 가져오지 않기 확인 창(시안 .dlg, 모양은 설정 › 맞춤 방법 잇기 끊기 확인 창). 첫 초점 [취소], Esc = [취소], Tab은 두 단추 사이만 돈다 */
function SkipAllAsk({
  count,
  rangeText,
  busy,
  onConfirm,
  onCancel,
}: {
  count: number
  rangeText: string
  busy: boolean
  onConfirm(): void
  onCancel(): void
}) {
  const titleId = useId()
  const bodyId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const goRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onCancel()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  const trapTab = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return
    const [first, last] = [cancelRef.current, goRef.current]
    const active = document.activeElement
    if (event.shiftKey && (active === first || active === event.currentTarget)) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && (active === last || active === event.currentTarget)) {
      event.preventDefault()
      first?.focus()
    }
  }

  return (
    <div className="fixed inset-0 z-55 flex items-center justify-center bg-ink/36 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        onKeyDown={trapTab}
        className={`${ds.layer} flex w-full max-w-100 flex-col gap-4 p-6 outline-hidden`}
      >
        <h2 id={titleId} className="text-lead font-semibold text-ink">
          {T.skipAllAsk(count)}
        </h2>
        <div className="grid gap-1">
          <p id={bodyId} className="text-body text-ink-2">
            {T.SKIP_ALL_KEEP}
          </p>
          <p className="text-caption text-muted">{rangeText}</p>
        </div>
        <div className="flex justify-end gap-2">
          <button ref={cancelRef} type="button" onClick={onCancel} className={ds.button.secondary}>
            {T.SKIP_ALL_CANCEL}
          </button>
          <button ref={goRef} type="button" aria-busy={busy || undefined} onClick={() => !busy && onConfirm()} className={ds.button.primary}>
            {T.SKIP_ALL_GO}
          </button>
        </div>
      </div>
    </div>
  )
}

const ITEM = 'grid gap-2.5 rounded-control border p-3'

function FixHead({ fix, bold, when }: { fix: GcalFix; bold: boolean; when?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="inline-flex min-w-0 items-center gap-1.5 text-small text-ink">
        <Swatch color={fix.gColor ?? 'default'} />
        <span data-fix-title className={`min-w-0 break-words ${bold ? 'font-semibold' : ''}`}>
          {fix.gTitle}
        </span>
      </span>
      {when && (
        <span data-fix-when className="shrink-0 text-small text-ink-2 tabular-nums">
          {when}
        </span>
      )}
    </div>
  )
}

/** 때 글(올해가 아니면 해를 붙임, google-link AC-8550.3) */
const whenOf = (fix: GcalFix, today: string) => {
  const day = dayWithYear(fix.day, today)
  return fix.allDay ? T.fixWhenAllDay(day) : T.fixWhen(day, clock(fix.start), clock(fix.start + fix.len), fix.len)
}

/** 알아본 칸 글: 차트번호 · 이름 · 종류(색으로 알아봤으면 그 색) · 시행자 · 메모 */
function gotParts(parsed: GParsedFix | null, fix: GcalFix): string[] {
  if (!parsed) return []
  const g = parsed.guess
  const byColor = fix.gColor ? ` ${T.GOT_PART.byColor(colorName(fix.gColor))}` : ''
  const parts: string[] = []
  if (g.chart) parts.push(T.GOT_PART.chart(g.chart))
  if (g.name) parts.push(T.GOT_PART.name(g.name))
  if (g.kindName) parts.push(T.GOT_PART.kind(g.kindName) + (g.kindBy === 'color' ? byColor : ''))
  if (g.staffName && g.staffMark) parts.push(T.GOT_PART.staff(`(${g.staffMark}) ${g.staffName}`) + (g.staffBy === 'color' ? byColor : ''))
  if (g.memo) parts.push(T.GOT_PART.memo(g.memo))
  return parts
}

/** 들어온 때 글: 오늘이면 시각만, 올해가 아니면 해를 붙임(AC-8550.3) */
function cameAt(stamp: string, today: string): string | null {
  const at = kst(stamp)
  if (!at) return null
  return at.day === today ? at.hm : `${dayWithYear(at.day, today)} ${at.hm}`
}

function FixItem({
  fix,
  ctx,
  today,
  onPut,
  onSkip,
}: {
  fix: GcalFix
  ctx: ParseCtx
  today: string
  onPut(keys: string[]): Promise<void>
  onSkip(): Promise<void>
}) {
  const parsed = useMemo(() => fixParsed(fix, ctx), [fix, ctx])
  const needs: FixNeed[] = parsed?.guess.needs ?? []
  const [picks, setPicks] = useState<Partial<Record<FixNeed, string>>>({})
  const [busy, setBusy] = useState(false)
  const ready = needs.every((n) => picks[n] !== undefined)

  const parts = gotParts(parsed, fix)
  const came = cameAt(fix.gUpdated, today)
  const got = [parts.length ? T.gotLead(parts.join(' · ')) : null, came ? T.fixCameIn(came) : null].filter(Boolean).join(' · ')

  async function act(work: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    try {
      await work()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section data-fix={fix.id} aria-label={fix.gTitle} className={`${ITEM} border-warning/40 bg-warning-soft`}>
      <FixHead fix={fix} bold when={whenOf(fix, today)} />
      {parsed && (
        <p data-fix-why className="text-caption font-semibold text-warning">
          {fixReasonText(parsed)}
        </p>
      )}
      {got && (
        <p data-fix-got className="text-caption text-ink-2">
          {got}
        </p>
      )}
      {parsed &&
        needs.map((need) => (
          <div key={need} className="grid gap-1.5">
            <span className="text-small font-semibold text-ink">{T.FIX_NEED_LABEL[need]}</span>
            <div role="group" aria-label={T.FIX_NEED_LABEL[need]} className="flex flex-wrap gap-1.5">
              {needChoices(parsed, need, ctx, fix.gTitle).map((choice) => {
                const pressed = picks[need] === choice.key
                return (
                  <button
                    key={choice.key}
                    type="button"
                    aria-pressed={pressed}
                    className={optionButton(pressed)}
                    onClick={() => setPicks((prev) => ({ ...prev, [need]: choice.key }))}
                  >
                    <ChoiceLabel choiceKey={choice.key} label={choice.label} ctx={ctx} />
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" aria-busy={busy || undefined} className={ds.button.secondarySmall} onClick={() => void act(onSkip)}>
          {T.FIX_SKIP}
        </button>
        <button
          type="button"
          disabled={!ready}
          aria-busy={busy || undefined}
          className={ds.button.primarySmall}
          onClick={() => void act(() => onPut(needs.map((n) => picks[n]!)))}
        >
          {T.FIX_PUT}
        </button>
      </div>
    </section>
  )
}

/** 고르기 단추 글: 시행자는 색 점 + 글, 종류는 글 + 길이 */
function ChoiceLabel({ choiceKey, label, ctx }: { choiceKey: string; label: string; ctx: ParseCtx }) {
  if (choiceKey.startsWith('staff:')) {
    const staff = ctx.staff.find((s) => s.id === choiceKey.slice(6))
    return (
      <>
        {staff && <Swatch color={staff.color} />}
        {label}
      </>
    )
  }
  if (choiceKey.startsWith('kind:')) {
    const kind = ctx.kinds.find((k) => k.id === choiceKey.slice(5))
    return (
      <>
        {label}
        {kind && (
          <>
            {' '}
            <small className="text-caption text-muted">{`${kind.len}분`}</small>
          </>
        )}
      </>
    )
  }
  return <>{label}</>
}

function DoneItem({ fix, state, today }: { fix: GcalFix; state: Done; today: string }) {
  const day = dayWithYear(fix.day, today)
  const when = fix.allDay ? day : `${day} ${clock(fix.start)}`
  return (
    <section data-fix={fix.id} aria-label={fix.gTitle} className={`${ITEM} border-positive/30 bg-positive-soft`}>
      <div className="flex items-center justify-between gap-2">
        <FixHead fix={fix} bold={false} />
        <span data-fix-state className="shrink-0 text-small font-semibold text-positive">
          {state === 'put' ? T.FIX_PUT_DONE : T.FIX_SKIP_DONE}
        </span>
      </div>
      <p data-fix-done className="text-caption text-ink-2">
        {state === 'put' ? T.fixPutDone(when) : T.FIX_SKIP_DONE_TEXT}
      </p>
    </section>
  )
}
