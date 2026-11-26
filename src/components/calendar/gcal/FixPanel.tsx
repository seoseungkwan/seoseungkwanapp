'use client'

import { useMemo, useState } from 'react'
import { ds } from '@/components/ui/classes'
import type { FixNeed, GParsedFix, ParseCtx } from '@/lib/calendar/gshapes'
import { fixReasonText } from '@/lib/calendar/gtitle'
import type { GcalFix } from '@/types/gcal'
import { Drawer, InfoLine, optionButton } from '../AddPanel'
import { Swatch } from '../CalendarToolbar'
import { colorName } from './apptGoogle'
import { fixParsed, needChoices } from './fixApply'
import * as T from './labels'
import { clock, kst, shortDay } from './time'

// 고쳐야 할 구글 예약 판(spec google-link AC-8534.2·AC-8534.3, 시안 calendar.html ?s=fix, notes-calendar `fix` 글 그대로).
// 줄마다 구글 제목 원문을 다시 읽어(fixParsed) 고를 거리(needs)마다 고르기를 그린다 — 둘 이상이면 고르기도 둘 이상, 다 골라야 [예약표에 넣기].
// [예약표에 넣기]·[가져오지 않기]는 화면에 알리고(onPut·onSkip이 저장·알림), 된 줄은 판에 '✓ 넣었어요'·'가져오지 않음'으로 남는다
// (화면이 목록을 다시 읽어 그 줄이 빠져도). 판 제목의 수는 아직 남은 줄이다

export type FixPanelProps = {
  /** 열린 고쳐야 할 것(화면이 다시 읽은 목록) */
  fixes: readonly GcalFix[]
  ctx: ParseCtx
  /** 한국 오늘(들어온 때가 오늘이면 시각만) */
  today: string
  /** 고른 키(fixChoices 키, 고를 거리 차례)로 넣는다. true = 됨 */
  onPut(fix: GcalFix, keys: string[]): Promise<boolean>
  onSkip(fix: GcalFix): Promise<boolean>
  onClose(): void
}

type Done = 'put' | 'skip'

export function FixPanel({ fixes, ctx, today, onPut, onSkip, onClose }: FixPanelProps) {
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
  const left = shown.filter((f) => !done[f.id]).length
  const mark = (id: string, state: Done) => setDone((prev) => ({ ...prev, [id]: state }))

  return (
    <Drawer
      title={T.fixTitle(left)}
      onClose={onClose}
      foot={
        <button type="button" className={ds.button.secondary} onClick={onClose}>
          {T.FIX_CLOSE}
        </button>
      }
    >
      <p className="text-body text-ink-2">{T.FIX_LEAD}</p>
      <div className="grid gap-2.5">
        {shown.map((fix) =>
          done[fix.id] ? (
            <DoneItem key={fix.id} fix={fix} state={done[fix.id]!} />
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
      <div className="grid gap-1.5">
        <InfoLine>{T.FIX_INFO_LEAVE}</InfoLine>
        <InfoLine>{T.FIX_INFO_WORDS}</InfoLine>
      </div>
    </Drawer>
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

const whenOf = (fix: GcalFix) =>
  fix.allDay ? T.fixWhenAllDay(shortDay(fix.day)) : T.fixWhen(shortDay(fix.day), clock(fix.start), clock(fix.start + fix.len), fix.len)

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

function cameAt(stamp: string, today: string): string | null {
  const at = kst(stamp)
  if (!at) return null
  return at.day === today ? at.hm : `${shortDay(at.day)} ${at.hm}`
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
      <FixHead fix={fix} bold when={whenOf(fix)} />
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

function DoneItem({ fix, state }: { fix: GcalFix; state: Done }) {
  const when = fix.allDay ? shortDay(fix.day) : `${shortDay(fix.day)} ${clock(fix.start)}`
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
