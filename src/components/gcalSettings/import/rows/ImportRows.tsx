'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { weekdayOf } from '@/lib/analytics/dates'
import { G_COLOR_NAME, type FixNeed, type GParsedFix, type GStaff, type ParseCtx } from '@/lib/calendar/gshapes'
import { fixChoices, fixReasonText } from '@/lib/calendar/gtitle'
import type { ImportPicks, ImportRow, ImportRowState } from '@/lib/gcal/importRead'
import { ColorDot } from '../../colors/ColorPalette'
import { mdwOf } from '../../frame/time'
import { TABLE } from '../labels'
import { ownsPick } from '../picks'

// 처음 가져오기 미리 보기 표(spec google-link REQ-8530 AC-8530.1·AC-8530.3·AC-8530.4, notes-calendar `import`, 시안 calendar.html impRowHTML).
// 울타리 안 부품(components/gcalSettings/**/rows — 네트워크·저장소·console·supabase 없음): 받은 줄(구글 제목 원문 = 환자 이름)을 그리고
// 노란 칸에서 고른 값은 onPick(줄, 고를 거리, 값)으로만 넘긴다. 줄 상태는 부르는 쪽이 준 stateOf(lib/gcal/importRead importRowState)로 본다.
// 고를 거리가 둘 이상인 줄(guess.needs)은 그 칸마다 고르기가 하나씩이고, 까닭 글은 맨 앞 것(fixReasonText)이다.
// 보이는 줄만 그린다: 줄 높이를 정해 두고(날짜 줄 28 · 줄 44 · 고쳐야 할 줄 64) 표 칸 안 내려 본 자리 앞뒤 몇 줄만 그리며, 나머지는 빈 줄 높이로 채운다
// (4,000줄이 넘어도 멈추지 않음). 열 너비를 정해 둬(table-fixed) 내려 봐도 칸이 흔들리지 않는다. PC 화면만 — 넓으면 표 칸 안에서만 옆으로 밀린다

export type ImportRowsProps = {
  /** 그릴 줄(거르기·차례는 부르는 쪽이 정한다) */
  rows: readonly ImportRow[]
  /** 한국 오늘(잇는 날) */
  today: string
  /** 알아본 기준: 시행자·종류·off 줄 사람(고르기 글) · 취소·변경 색(꼬리표) */
  ctx: Pick<ParseCtx, 'staff' | 'kinds' | 'people' | 'look'>
  picks: ImportPicks
  stateOf(row: ImportRow): ImportRowState
  /** 데스크·보는 중: 고르기를 막는다 */
  locked?: boolean
  onPick(row: ImportRow, need: FixNeed, value: string): void
}

/** 표 칸 높이(넘치면 표 안에서 내려 본다). 잴 수 없을 때(그리기 전) 이 값으로 셈한다 */
export const ROWS_VIEW_PX = 560
const HEAD_PX = 34
const DAY_PX = 28
const ROW_PX = 44
const FIX_PX = 64
/** 보이는 자리 앞뒤로 더 그리는 줄 */
const OVERSCAN = 8
const COLS = 11

type Item = { kind: 'day'; day: string; past: boolean } | { kind: 'row'; row: ImportRow }

const isFix = (row: ImportRow) => !row.known && row.parsed.type === 'fix'
const heightOf = (item: Item) => (item.kind === 'day' ? DAY_PX : isFix(item.row) ? FIX_PX : ROW_PX)

function itemsOf(rows: readonly ImportRow[]): Item[] {
  const out: Item[] = []
  let last = ''
  for (const row of rows) {
    if (row.day !== last) {
      out.push({ kind: 'day', day: row.day, past: row.past })
      last = row.day
    }
    out.push({ kind: 'row', row })
  }
  return out
}

/** tops[i] 가운데 y보다 큰 첫 자리(없으면 길이) */
function firstAbove(tops: readonly number[], y: number): number {
  let lo = 0
  let hi = tops.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (tops[mid]! > y) hi = mid
    else lo = mid + 1
  }
  return lo
}

// ── 글 ──────────────────────────────────────────────────────

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'] // weekdayOf: 1=월 … 7=일
const pad = (n: number) => String(n).padStart(2, '0')
const hm = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`

/** 날짜 줄 '11월 23일 (월)' — 올해가 아니면 '2025년 12월 1일 (월)' */
function dayHead(day: string, today: string): string {
  const md = `${Number(day.slice(5, 7))}월 ${Number(day.slice(8, 10))}일 (${WEEKDAYS[weekdayOf(day) - 1]})`
  return day.slice(0, 4) === today.slice(0, 4) ? md : `${day.slice(0, 4)}년 ${md}`
}

/** 구글 시각의 실제 길이 '12시간'·'4시간 30분' */
function hoursOf(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h === 0 ? TABLE.min(m) : m ? `${h}시간 ${m}분` : `${h}시간`
}

const staffLabel = (mark: string | null, name: string | null) => (name ? `(${mark ?? ''}) ${name}` : '')

// ── 모양 ────────────────────────────────────────────────────

const TH = 'sticky top-0 z-1 h-8.5 border-b border-line bg-canvas px-2 text-left text-caption font-semibold whitespace-nowrap text-muted'
const TD = 'overflow-clip border-b border-line px-2 align-middle whitespace-nowrap text-ink'
const MUTED = 'text-caption text-muted'
const NEED = 'bg-warning-soft ring-1 ring-warning/40 ring-inset'
const STATE: Record<ImportRowState, string> = {
  known: 'bg-positive-soft text-positive',
  fix: 'bg-warning-soft text-warning',
  picked: 'bg-accent-soft text-accent-strong',
  skip: 'bg-canvas text-muted ring-1 ring-line ring-inset',
}
const ROW_TONE: Record<ImportRowState, string> = { known: '', fix: 'bg-warning-soft/40', picked: '', skip: 'text-muted' }
const TAG = 'ml-1 inline-block rounded-control px-1 align-[1px] text-caption leading-4 font-semibold whitespace-nowrap'
const TAGS = {
  color: `${TAG} bg-accent-soft text-accent-strong`,
  setting: `${TAG} bg-canvas text-cat-4 ring-1 ring-line ring-inset`,
  pick: `${TAG} bg-positive-soft text-positive`,
  plain: `${TAG} bg-canvas text-ink-2 ring-1 ring-line-strong ring-inset`,
}
const SELECT = 'h-7 rounded-control border border-warning bg-surface px-1 text-caption text-ink disabled:cursor-not-allowed disabled:opacity-60'

function Tag({ tone, children }: { tone: keyof typeof TAGS; children: ReactNode }) {
  return <span className={TAGS[tone]}>{children}</span>
}

/** 어디서 알아봤나: 구글 색 · 설정(종류 글이 없는 예약) · 표시 없음 = 제목 글 */
function ByTag({ by }: { by: string | null | undefined }) {
  if (by === 'color') return <Tag tone="color">{TABLE.tagColor}</Tag>
  if (by === 'setting') return <Tag tone="setting">{TABLE.tagSetting}</Tag>
  return null
}

// ── 고르기 ──────────────────────────────────────────────────

type PickProps = {
  row: ImportRow
  need: FixNeed
  fix: GParsedFix
  ctx: ImportRowsProps['ctx']
  keys: readonly string[]
  locked: boolean
  onPick: ImportRowsProps['onPick']
}

/** 고를 거리 하나의 고르기: '고르기'(빈 값 = 되돌리기) · 고를 것(fixChoices) · 가져오지 않기 (구글에만 둠) */
function Pick({ row, need, fix, ctx, keys, locked, onPick }: PickProps) {
  const choices = fixChoices({ guess: { ...fix.guess, needs: [need] } }, ctx, row.title)
  const value = keys.includes('skip') ? 'skip' : (keys.find((k) => ownsPick(need, k)) ?? '')
  const wide = need === 'person' || need === 'what'
  return (
    <>
      <select
        aria-label={TABLE.choose}
        value={value}
        disabled={locked}
        className={`${SELECT} ${wide ? 'max-w-58' : 'max-w-33'}`}
        onChange={(e) => onPick(row, need, e.target.value)}
      >
        <option value="">{TABLE.choose}</option>
        {choices.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label}
          </option>
        ))}
      </select>
      {value !== '' && value !== 'skip' && <Tag tone="pick">{TABLE.tagPick}</Tag>}
    </>
  )
}

// ── 줄 ──────────────────────────────────────────────────────

type LineProps = Omit<ImportRowsProps, 'rows' | 'today' | 'stateOf' | 'picks'> & { row: ImportRow; state: ImportRowState; keys: readonly string[]; index: number }

function personLabel(id: string, name: string, staff: readonly GStaff[]): ReactNode {
  const s = staff.find((x) => x.id === id)
  if (s) return `(${s.mark}) ${s.name}`
  return (
    <>
      {name}
      <span className="font-normal text-muted"> {TABLE.staffOnly}</span>
    </>
  )
}

function People({ people, ctx }: { people: readonly { id: string; name: string }[]; ctx: ImportRowsProps['ctx'] }) {
  const color = `var(--cal-${ctx.look.offColor})`
  return people.map((p, i) => (
    <span key={p.id}>
      {i > 0 && ' '}
      <span className="inline-flex h-5.5 items-center rounded-control bg-canvas px-2 text-caption font-semibold" style={{ boxShadow: `inset 3px 0 0 ${color}` }}>
        {personLabel(p.id, p.name, ctx.staff)}
      </span>
    </span>
  ))
}

function RowLine({ row, state, keys, ctx, locked = false, onPick, index }: LineProps) {
  const p = row.parsed
  const fix = p.type === 'fix' ? p.fix : null
  const canPick = fix !== null && state !== 'known'
  const needs = canPick ? fix.guess.needs : []
  const why = state === 'fix' && fix ? fixReasonText(fix) : null
  const cancel = p.type === 'appt' ? p.appt.status === 'cancel' : (fix?.guess.cancel ?? false)
  const moved = p.type === 'appt' ? p.appt.gMoved : (fix?.guess.moved ?? false)
  const need = (n: FixNeed) => needs.includes(n)
  const needCell = (n: FixNeed) => (need(n) && state !== 'skip' ? NEED : '')
  const pick = (n: FixNeed) => <Pick row={row} need={n} fix={fix as GParsedFix} ctx={ctx} keys={keys} locked={locked} onPick={onPick} />

  const days = p.type === 'off' || p.type === 'memo' ? p.days : (fix?.days ?? [row.day])
  const dateText = row.allDay && days.length > 1 ? `${mdwOf(days[0]!)} – ${mdwOf(days[days.length - 1]!)}` : mdwOf(row.day)

  const head = (
    <>
      <td className={TD}>
        <span className={`inline-flex h-5.5 items-center rounded-full px-2 text-caption font-semibold whitespace-nowrap ${STATE[state]}`}>{TABLE.state[state]}</span>
      </td>
      <td className={`${TD} whitespace-normal`}>
        <div className="flex min-w-0 items-center gap-2">
          <ColorDot color={row.gColor ?? 'default'} />
          <span title={row.title} className={`min-w-0 truncate ${state === 'skip' ? 'line-through' : ''}`}>
            {row.title}
          </span>
          {cancel && <Tag tone="plain">{TABLE.cancelTag(G_COLOR_NAME[ctx.look.cancel])}</Tag>}
          {moved && <Tag tone="plain">{TABLE.changeTag(G_COLOR_NAME[ctx.look.change])}</Tag>}
        </div>
        {why !== null && (
          <span data-why="" className="mt-0.5 line-clamp-2 pl-5 text-caption leading-4 text-warning">
            {why}
          </span>
        )}
        {state === 'skip' && (
          <span data-skip="" className="mt-0.5 block pl-5 text-caption leading-4 text-muted">
            {TABLE.skipNote}
          </span>
        )}
      </td>
      <td className={`${TD} px-0 text-center text-muted`}>→</td>
      <td className={TD}>{dateText}</td>
    </>
  )
  const attrs = { 'data-row': row.key, 'data-state': state, 'aria-rowindex': index, style: { height: isFix(row) ? FIX_PX : ROW_PX }, className: ROW_TONE[state] }

  // 하루 종일: 날짜 · '하루 종일' · 휴무 사람(또는 종일 메모)
  if (row.allDay) {
    let body: ReactNode = null
    if (p.type === 'memo') {
      body = (
        <>
          <span className={MUTED}>{TABLE.memo}</span> · <b className="font-semibold">{p.memo}</b>
        </>
      )
    } else if (p.type === 'off' || (fix && fix.reason === 'off-name')) {
      const people = p.type === 'off' ? p.people : (fix?.guess.people ?? [])
      body = (
        <>
          <span className={MUTED}>{TABLE.off}</span> <People people={people} ctx={ctx} />
          {need('person') && <> {pick('person')}</>}
        </>
      )
    } else if (need('what')) body = pick('what')
    return (
      <tr {...attrs}>
        {head}
        <td colSpan={2} className={`${TD} ${MUTED}`}>
          {TABLE.allDay}
        </td>
        <td colSpan={5} className={`${TD} whitespace-normal ${needCell('person') || needCell('what')}`} data-need={need('person') ? 'person' : need('what') ? 'what' : undefined}>
          {body}
          {days.length > 1 && <span className={MUTED}> {TABLE.manyDays}</span>}
        </td>
      </tr>
    )
  }

  // 시간 일정
  const start = p.type === 'appt' ? p.appt.start : (fix?.start ?? 0)
  const len = p.type === 'appt' ? p.appt.len : (fix?.len ?? 0)
  if (need('what')) {
    return (
      <tr {...attrs}>
        {head}
        <td className={TD}>{hm(start)}</td>
        <td className={TD}>{TABLE.min(len)}</td>
        <td colSpan={5} data-need="what" className={`${TD} ${needCell('what')}`}>
          {pick('what')}
        </td>
      </tr>
    )
  }

  const g = fix?.guess
  const chart = p.type === 'appt' ? p.appt.chart : (g?.chart ?? null)
  const name = p.type === 'appt' ? p.appt.name : (g?.name ?? '')
  const kindName = p.type === 'appt' ? p.appt.kindName : (g?.kindName ?? '')
  const kindBy = p.type === 'appt' ? p.appt.gHow.kind : g?.kindBy
  const staffId = p.type === 'appt' ? p.appt.staffId : (g?.staffId ?? null)
  const staffText = p.type === 'appt' ? staffLabel(p.appt.staffMark, p.appt.staffName) : staffLabel(g?.staffMark ?? null, g?.staffName ?? null)
  const staffBy = p.type === 'appt' ? p.appt.gHow.staff : g?.staffBy
  const memo = p.type === 'appt' ? p.appt.memo : (g?.memo ?? '')

  return (
    <tr {...attrs}>
      {head}
      <td className={TD}>{hm(start)}</td>
      <td className={`${TD} ${needCell('len')}`} data-need={need('len') ? 'len' : undefined}>
        {need('len') ? (
          <>
            {state === 'fix' && (
              <>
                <span className={MUTED}>{hoursOf(g?.minutes ?? len)}</span>{' '}
              </>
            )}
            {pick('len')}
          </>
        ) : (
          TABLE.min(len)
        )}
      </td>
      <td className={TD}>{chart ?? <span className={MUTED}>{TABLE.none}</span>}</td>
      <td className={TD}>
        <b title={name} className="block truncate font-semibold">
          {name}
        </b>
      </td>
      <td className={`${TD} ${needCell('kind')}`} data-need={need('kind') ? 'kind' : undefined}>
        {need('kind') ? (
          pick('kind')
        ) : (
          <>
            {kindName}
            <ByTag by={kindBy} />
          </>
        )}
      </td>
      <td className={`${TD} ${needCell('staff')}`} data-need={need('staff') ? 'staff' : undefined}>
        {need('staff') ? (
          pick('staff')
        ) : staffId !== null ? (
          <>
            {staffText}
            <ByTag by={staffBy} />
          </>
        ) : row.past ? (
          <>
            <span className={MUTED}>{TABLE.none}</span>
            <Tag tone="plain">{TABLE.noStaffTag}</Tag>
          </>
        ) : null}
      </td>
      <td className={TD}>
        <span title={memo} className="block truncate">
          {memo}
        </span>
      </td>
    </tr>
  )
}

function DayLine({ day, past, today, index }: { day: string; past: boolean; today: string; index: number }) {
  return (
    <tr data-day={day} aria-rowindex={index} style={{ height: DAY_PX }}>
      <td colSpan={COLS} className="border-b border-line bg-canvas px-2 text-caption font-semibold text-ink-2">
        {dayHead(day, today)}
        {day === today && TABLE.today}
        {past && (
          <>
            {' · '}
            <span className="font-normal text-muted">{TABLE.pastDay}</span>
          </>
        )}
      </td>
    </tr>
  )
}

// 열 너비(구글 일정 300 · 메모는 남는 너비)
const WIDTHS = ['w-26', 'w-75', 'w-5', 'w-35', 'w-14', 'w-24', 'w-20', 'w-22', 'w-38', 'w-50', ''] as const

export function ImportRows({ rows, today, ctx, picks, stateOf, locked = false, onPick }: ImportRowsProps) {
  const items = useMemo(() => itemsOf(rows), [rows])
  const tops = useMemo(() => {
    const out = [0]
    for (const item of items) out.push(out[out.length - 1]! + heightOf(item))
    return out
  }, [items])
  const total = tops[tops.length - 1]!

  const box = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewPx, setViewPx] = useState(ROWS_VIEW_PX)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => {
      if (el.clientHeight > 0) setViewPx(el.clientHeight)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    return () => watch.disconnect()
  }, [])

  const y = Math.max(0, scrollTop - HEAD_PX)
  const from = Math.max(0, firstAbove(tops, y) - 1 - OVERSCAN)
  const to = Math.min(items.length, firstAbove(tops, y + viewPx) + OVERSCAN)
  const before = tops[from]!
  const after = total - tops[to]!

  return (
    <div
      ref={box}
      data-testid="import-rows-scroll"
      className="max-h-140 overflow-auto rounded-control border border-line bg-surface"
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <table aria-label={TABLE.label} aria-rowcount={items.length + 1} className="w-full min-w-330 table-fixed border-collapse text-small tabular-nums">
        <colgroup>
          {WIDTHS.map((w, i) => (
            <col key={i} className={w} />
          ))}
        </colgroup>
        <thead>
          <tr aria-rowindex={1}>
            {TABLE.head.map((h, i) => (
              <th key={i} scope="col" className={TH}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {before > 0 && (
            <tr aria-hidden="true" style={{ height: before }}>
              <td colSpan={COLS} className="p-0" />
            </tr>
          )}
          {items.slice(from, to).map((item, i) =>
            item.kind === 'day' ? (
              <DayLine key={`d:${item.day}`} day={item.day} past={item.past} today={today} index={from + i + 2} />
            ) : (
              <RowLine
                key={item.row.key}
                row={item.row}
                state={stateOf(item.row)}
                keys={picks[item.row.key] ?? []}
                ctx={ctx}
                locked={locked}
                onPick={onPick}
                index={from + i + 2}
              />
            ),
          )}
          {after > 0 && (
            <tr aria-hidden="true" style={{ height: after }}>
              <td colSpan={COLS} className="p-0" />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
