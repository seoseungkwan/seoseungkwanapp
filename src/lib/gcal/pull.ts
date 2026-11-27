import { addDays, compareYmd, todayInKorea } from '@/lib/analytics/dates'
import { offScope } from '@/lib/calendar/goff'
import { colorFromId, type FixGuess as ParsedGuess, type GApptPatch, type GColor, type GEvent, type GNewRow, type GParsedFix, type OffPerson, type SyncCtx } from '@/lib/calendar/gshapes'
import { decideEvent } from '@/lib/calendar/gsync'
import type { ApptDraft, CalAllDay, CalAppt } from '@/types/calendar'
import type { FixGuess, GcalFix, GcalFixInput, GcalLink, GcalOffDay } from '@/types/gcal'
import { GcalCallError, readEvents, readNext, readNow, type GcalErrorCode } from './client'
import { clip, dayStartIso, maskText, toMs, yearsAhead, type GcalDeps, type GcalParts, type MemoColor } from './deps'

// 구글 → 웹앱 받기(spec google-link REQ-8525, design.md 12-1). 판단은 lib/calendar/gsync decideEvent, 적기는 저장 함수(조건 고치기·유일 제약)만.
// 두 PC가 함께 받아도 같은 결과: 넣기는 (병원, g_event_id) 겹치면 건너뛰고, 고치기는 g_updated가 더 이를 때·g_wait_at이 읽은 글자 그대로일 때만.
// 구글 글(제목·메모·고쳐야 할 것·off 줄 제목)은 적기 전에 maskText(AC-8505.3).
// 휴무 줄 색(REQ-8547, design.md 21-5): off로 알아본 일정 가운데 updated가 가장 나중인 것의 색이 지금 휴무 줄 색과 다르면 받기 끝에 그 색으로(실패는 삼킴)
// 종일 메모 색(REQ-8554, design.md 21-13): 메모 줄에 그 구글 일정 색(colorId 없음 = 'default')을 적고, 받기 끝에 이 고침 전 메모의 빈 색을 채운다(실패는 삼킴)

const OVERLAP_MS = 60_000
const MAX_PAGES = 200
const FILL_WAIT_MS = 60 * 60_000 // 채우기가 던지거나 빈 색이 남으면 이 브라우저에서 1시간 건너뜀
const FILL_BATCH = 10 // 빈 색 채우기를 한 번에 몇 줄씩
const TITLE_MAX = 200
const NAME_MAX = 20
const MEMO_MAX = 100
const ALLDAY_MEMO_MAX = 20
const STAFF_NAME_MAX = 10

export type PullResult = { ok: true; changed: number; at: string; full: boolean } | { ok: false; code: GcalErrorCode | null; off: boolean }

/** 받기 한 번: 지난번 끝 − 60초(처음은 이은 날 0시)부터 바뀐 것. too_old면 [이은 날 0시, 오늘 + 2년 0시)를 처음부터 다시 */
export async function pullOnce(deps: GcalDeps): Promise<PullResult> {
  const { store } = deps
  let link: GcalLink | null
  try {
    link = await store.loadLink()
  } catch {
    return { ok: false, code: null, off: false }
  }
  if (!link || !link.calendarId || !link.linkedOn) return { ok: false, code: null, off: true }
  try {
    const [state, parts] = await Promise.all([store.loadState(), store.loadParts()])
    const run = new PullRun(deps, link, parts)
    const pulled = toMs(state.pulledUntil)
    const since = pulled === null ? dayStartIso(link.linkedOn) : new Date(pulled - OVERLAP_MS).toISOString()
    let at: string | null
    let full = false
    try {
      at = await run.changes(since)
    } catch (err) {
      if (!(err instanceof GcalCallError) || err.reason !== 'too_old') throw err
      at = await run.fullRead()
      full = true
    }
    if (at) await store.advancePulled(at)
    const okAt = deps.now().toISOString()
    await store.markOk(okAt)
    await followOffColor(deps, run.offEvents, link.look.offColor)
    await fillMemoColors(deps, link).catch(() => undefined) // 칸이 아직 없거나(SQL 전) 구글 목록 실패 — 받기 결과 그대로
    return { ok: true, changed: run.changed, at: at ?? okAt, full }
  } catch (err) {
    if (err instanceof GcalCallError) {
      await store.markFail(err.code, deps.now().toISOString()).catch(() => undefined)
      return { ok: false, code: err.code, off: false }
    }
    return { ok: false, code: null, off: false }
  }
}

/** 휴무 줄 색으로 따를 색: off 일정 가운데 updated가 가장 나중인 것의 색. 그 색이 없거나(캘린더 기본 색) 지금 색과 같으면 null */
export function offColorToFollow(events: readonly Pick<GEvent, 'updated' | 'colorId'>[], current: GColor): GColor | null {
  let last: Pick<GEvent, 'updated' | 'colorId'> | null = null
  for (const ev of events) {
    if (last === null || (toMs(ev.updated) ?? -Infinity) > (toMs(last.updated) ?? -Infinity)) last = ev
  }
  const color = last === null ? null : colorFromId(last.colorId)
  return color !== null && color !== current ? color : null
}

/** 휴무 줄 색 맞추기(받기·처음 가져오기 끝). 저장이 던지거나 거짓이어도 삼킨다 — 받기 결과 그대로, 다음에 off 일정이 바뀌면 또 맞춘다 */
export async function followOffColor(deps: GcalDeps, events: readonly Pick<GEvent, 'updated' | 'colorId'>[], current: GColor): Promise<void> {
  const color = offColorToFollow(events, current)
  if (color === null) return
  try {
    await deps.store.setOffColor(color)
  } catch {
    // 함수가 아직 없거나(SQL 전) 저장 실패 — 휴무 줄 색만 그대로 둔다
  }
}

/** 구글 일정 색 → 종일 메모 줄 색(색 없음 = 'default') */
const memoColorOf = (ev: Pick<GEvent, 'colorId'>): MemoColor => colorFromId(ev.colorId) ?? 'default'

/** 채우기를 마지막으로 그만둔 때(던짐·빈 색 남음, ms). 이 브라우저(모듈) 안에서만 */
let lastFillTry: number | null = null

/** 시험용: 채우기 기다림을 지운다 */
export function resetFillMemoColors(): void {
  lastFillTry = null
}

/**
 * 이 고침 전에 들어온 종일 메모의 빈 색 채우기(AC-8554.5, design.md 21-13): 받기 성공 끝에 부른다.
 * 빈 색 찾기(한국 오늘 − 1년 ~ 오늘 + 3년 − 1일)가 참일 때만 그 기간 종일 줄을 읽어 빈 색 메모 줄(구글 일정과 이어짐·보낼 것 없음·색 빔)을 모으고,
 * 구글 목록을 [가장 이른 날, 가장 늦은 날 + 1일)만 쪽마다 읽어 줄마다 그 일정 색(색 없음·목록에 없음 = 'default')을 10줄씩 채운다(줄 실패는 삼킴).
 * 던지거나 끝난 뒤에도 빈 색 줄이 남으면 1시간 동안 건너뛴다. 던짐은 다시 던진다(받기가 삼킴). 채운 줄 수
 */
export async function fillMemoColors(deps: GcalDeps, link: GcalLink): Promise<number> {
  const { store } = deps
  const startedAt = deps.now().getTime()
  if (lastFillTry !== null && startedAt >= lastFillTry && startedAt - lastFillTry < FILL_WAIT_MS) return 0
  const calendarId = link.calendarId
  if (!calendarId) return 0
  try {
    const today = todayInKorea(deps.now())
    const from = yearsAhead(today, -1)
    const to = addDays(yearsAhead(today, 3), -1)
    if (!(await store.memoColorGap(from, to))) {
      lastFillTry = null
      return 0
    }
    const gaps = (await store.listAllDay(from, to)).filter(
      (r): r is CalAllDay & { gEventId: string } => r.type === 'memo' && !!r.gEventId && r.gWait === false && (r.gColor ?? null) === null,
    )
    if (!gaps.length) {
      lastFillTry = deps.now().getTime() // DB에는 있지만 읽기에서 빠진 줄 — 받기마다 다시 묻지 않게
      return 0
    }
    const days = gaps.map((r) => r.day).sort(compareYmd)
    const colors = new Map<string, MemoColor>()
    let token: string | null = null
    for (let page = 0; page < MAX_PAGES; page++) {
      const body: Record<string, unknown> = { calendarId, from: days[0], to: addDays(days[days.length - 1], 1) }
      if (token) body.pageToken = token
      const reply = await deps.call(link, 'list', body)
      for (const ev of readEvents(reply)) colors.set(ev.id, memoColorOf(ev))
      token = readNext(reply)
      if (!token) break
    }
    let filled = 0
    for (let i = 0; i < gaps.length; i += FILL_BATCH) {
      const done = await Promise.all(gaps.slice(i, i + FILL_BATCH).map((r) => store.fillMemoColor(r.id, colors.get(r.gEventId) ?? 'default').catch(() => false)))
      filled += done.filter(Boolean).length
    }
    lastFillTry = filled < gaps.length ? deps.now().getTime() : null
    return filled
  } catch (err) {
    lastFillTry = deps.now().getTime()
    throw err
  }
}

/** gcal_fixes guess(저장 모양): 알아본 칸만, 구글 글은 가린다 */
export function fixGuessOf(g: ParsedGuess): FixGuess {
  const text = (v: string | null, max: number) => (v ? maskText(v.trim(), max) || null : null)
  return {
    chart: g.chart,
    name: text(g.name, NAME_MAX),
    kindId: g.kindId,
    kindHow: g.kindBy,
    staffId: g.staffId,
    staffHow: g.staffBy,
    memo: text(g.memo, MEMO_MAX),
    word: text(g.bad, 40),
  }
}

/** 고쳐야 할 것 한 줄(날마다) */
export function fixInputOf(ev: GEvent, fix: GParsedFix, day: string, state: GcalFix['state'] = 'open'): GcalFixInput {
  return {
    gEventId: ev.id,
    day,
    start: fix.allDay ? 0 : fix.start,
    len: fix.allDay ? 1440 : Math.max(1, Math.min(1440, fix.len)),
    allDay: fix.allDay,
    gColor: fix.gColor,
    gTitle: maskText(ev.summary, TITLE_MAX),
    reason: fix.reason,
    guess: fixGuessOf(fix.guess),
    state,
    gUpdated: ev.updated,
  }
}

/** 받기가 넣는 새 예약 줄(구글 글은 가림) */
export function newApptRow(row: GNewRow): ApptDraft {
  return {
    day: row.day,
    start: row.start,
    len: row.len,
    name: maskText(row.name, NAME_MAX),
    chart: row.chart,
    staffId: row.staffId,
    staffName: row.staffName,
    staffMark: row.staffMark,
    kindId: row.kindId,
    kindName: row.kindName,
    memo: maskText(row.memo, MEMO_MAX),
    status: row.status,
    gEventId: row.gEventId,
    gUpdated: row.gUpdated,
    gTitle: maskText(row.gTitle, TITLE_MAX),
    gColor: row.gColor,
    colorFrom: row.colorFrom,
    gKeepTitle: row.gKeepTitle,
    gMoved: row.gMoved,
    gWait: null,
    gFrom: row.gFrom,
    gHow: row.gHow,
  }
}

/** 판단 칸 → 저장 칸. 시행자 세 칸은 함께(하나라도 바뀌면 셋 다), 구글 글은 가림. g_updated는 따로 넘긴다 */
function apptPatch(patch: GApptPatch, mapped: CalAppt): Partial<ApptDraft> {
  const { gUpdated: _gUpdated, ...rest } = patch
  void _gUpdated
  const out: Partial<ApptDraft> = { ...rest }
  if ('staffId' in patch || 'staffName' in patch || 'staffMark' in patch) {
    out.staffId = 'staffId' in patch ? (patch.staffId ?? null) : mapped.staffId
    out.staffName = 'staffName' in patch ? (patch.staffName ?? null) : mapped.staffName
    out.staffMark = 'staffMark' in patch ? (patch.staffMark ?? null) : mapped.staffMark
    if (out.staffId === null) {
      out.staffName = null
      out.staffMark = null
    }
  }
  if (out.name !== undefined) out.name = maskText(out.name, NAME_MAX)
  if (out.memo !== undefined) out.memo = maskText(out.memo, MEMO_MAX)
  if (out.gTitle !== undefined && out.gTitle !== null) out.gTitle = maskText(out.gTitle, TITLE_MAX)
  return out
}

/** 받기 한 번의 일: 쪽마다 짝을 찾아 판단하고 적는다. 종일 줄·off 날·고쳐야 할 것은 한 번 읽어 두고 고친 대로 고쳐 둔다 */
export class PullRun {
  changed = 0
  /** 이 받기가 off 줄로 알아본 하루 종일 일정(휴무 줄 색 따라가기) */
  readonly offEvents: GEvent[] = []
  private readonly ctx: SyncCtx
  private readonly scope: OffPerson[]
  private allday: CalAllDay[] | null = null
  private offDays: GcalOffDay[] | null = null
  private fixes: GcalFix[] | null = null
  private readonly end: string

  constructor(
    private readonly deps: GcalDeps,
    private readonly link: GcalLink,
    parts: GcalParts,
    linkedOn: string = link.linkedOn as string,
  ) {
    this.ctx = {
      staff: parts.staff,
      kinds: parts.kinds,
      people: parts.people,
      look: link.look,
      arrival: link.rules.arrival,
      linkedOn,
      onGoogleDelete: link.rules.onGoogleDelete,
    }
    this.scope = offScope(parts.people, link.rules.offAllStaff, parts.staff.map((s) => s.id))
    this.end = yearsAhead(todayInKorea(deps.now()), 3)
  }

  private get calendarId() {
    return this.link.calendarId as string
  }

  /** changes 쪽마다. 첫 쪽 답 now를 돌려준다(받아 온 끝) */
  async changes(since: string): Promise<string | null> {
    let token: string | null = null
    let at: string | null = null
    for (let page = 0; page < MAX_PAGES; page++) {
      const body: Record<string, unknown> = { calendarId: this.calendarId, since, from: this.ctx.linkedOn }
      if (token) body.pageToken = token
      const reply = await this.deps.call(this.link, 'changes', body)
      at ??= readNow(reply)
      await this.apply(readEvents(reply))
      token = readNext(reply)
      if (!token) break
    }
    return at
  }

  /**
   * too_old: [이은 날 0시, 한국 오늘 + 2년 0시)를 list로 처음부터 다 읽어 판단하고, 그 범위 안 웹앱 줄 가운데 g_event_id가 있고
   * 보낼 것이 남지 않은 것(예약 g_wait 없음·메모 g_wait 거짓·off 날 wait 거짓)만 목록과 견줘 없으면 구글에서 지운 것으로 본다(AC-8525.5)
   */
  async fullRead(): Promise<string | null> {
    const from = this.ctx.linkedOn
    const to = yearsAhead(todayInKorea(this.deps.now()), 2)
    const listed = new Set<string>()
    let token: string | null = null
    let at: string | null = null
    for (let page = 0; page < MAX_PAGES; page++) {
      const body: Record<string, unknown> = { calendarId: this.calendarId, from, to }
      if (token) body.pageToken = token
      const reply = await this.deps.call(this.link, 'list', body)
      at ??= readNow(reply)
      const events = readEvents(reply)
      for (const ev of events) listed.add(ev.id)
      await this.apply(events)
      token = readNext(reply)
      if (!token) break
    }
    const last = addDays(to, -1)
    const updated = at ?? this.deps.now().toISOString()
    const gone = new Map<string, boolean>() // 일정 id → 하루 종일인가
    for (const a of await this.deps.store.listAppts(from, last)) {
      if (a.gEventId && a.gWait === null && !listed.has(a.gEventId)) gone.set(a.gEventId, false)
    }
    for (const r of await this.loadAllDay()) {
      if (r.type === 'memo' && r.gEventId && r.gWait === false && r.day >= from && r.day <= last && !listed.has(r.gEventId)) gone.set(r.gEventId, true)
    }
    for (const o of await this.loadOffDays()) {
      if (o.gEventId && !o.wait && o.day >= from && o.day <= last && !listed.has(o.gEventId)) gone.set(o.gEventId, true)
    }
    for (const f of await this.loadFixes()) {
      if (f.day >= from && f.day <= last && !listed.has(f.gEventId) && !gone.has(f.gEventId)) gone.set(f.gEventId, f.allDay)
    }
    const cancelled: GEvent[] = [...gone].map(([id, allDay]) => ({
      id,
      status: 'cancelled',
      summary: '',
      description: '',
      allDay,
      start: '',
      end: '',
      colorId: null,
      updated,
      recurring: false,
    }))
    await this.apply(cancelled)
    return at
  }

  private async loadAllDay(): Promise<CalAllDay[]> {
    this.allday ??= await this.deps.store.listAllDay(this.ctx.linkedOn, this.end)
    return this.allday
  }
  private async loadOffDays(): Promise<GcalOffDay[]> {
    this.offDays ??= await this.deps.store.listOffDays(this.ctx.linkedOn, this.end)
    return this.offDays
  }
  private async loadFixes(): Promise<GcalFix[]> {
    this.fixes ??= await this.deps.store.listFixes()
    return this.fixes
  }

  /** 받은 일정들 적기 */
  async apply(events: readonly GEvent[]): Promise<void> {
    if (!events.length) return
    const { store } = this.deps
    const timedIds = events.map((e) => e.id)
    const mapped = new Map<string, CalAppt>()
    for (const a of await store.findAppts(timedIds)) if (a.gEventId) mapped.set(a.gEventId, a)
    const fixes = await this.loadFixes()
    const needAllDay = events.some((e) => e.allDay || e.status === 'cancelled')
    if (needAllDay) {
      await this.loadAllDay()
      await this.loadOffDays()
    }
    const inserts: { row: ApptDraft; dropFix: boolean; id: string }[] = []

    for (const ev of events) {
      const appt = mapped.get(ev.id) ?? null
      const ownsAllDay = this.memoRows(ev.id).length > 0 || this.offPairs(ev.id).length > 0 || fixes.some((f) => f.gEventId === ev.id && f.allDay)
      if (ev.allDay || (ev.status === 'cancelled' && !appt && ownsAllDay)) {
        // 시간 일정이 하루 종일로 바뀌었으면 짝 예약은 구글에서 지운 것으로
        if (appt) await this.timed({ ...ev, allDay: false, status: 'cancelled', start: '', end: '' }, appt, null)
        await this.allDay(ev)
        continue
      }
      // 하루 종일이 시간 일정으로 바뀌었으면 종일 짝을 먼저 지운다
      if (ownsAllDay && ev.status !== 'cancelled') await this.allDayGone(ev)
      const insert = await this.timed(ev, appt, fixes.filter((f) => f.gEventId === ev.id))
      if (insert) inserts.push({ ...insert, id: ev.id })
    }

    if (inserts.length) {
      const { sent } = await store.insertAppts(inserts.map((i) => i.row))
      this.changed += sent
      for (const i of inserts) if (i.dropFix) await this.dropFixes(i.id)
    }
  }

  private memoRows(id: string): CalAllDay[] {
    return (this.allday ?? []).filter((r) => r.type === 'memo' && r.gEventId === id).sort((a, b) => compareYmd(a.day, b.day))
  }
  private offPairs(id: string): GcalOffDay[] {
    return (this.offDays ?? []).filter((o) => o.gEventId === id)
  }

  /** 시간 일정 하나. 넣을 줄은 돌려준다(쪽마다 한 번에 넣는다) */
  private async timed(ev: GEvent, appt: CalAppt | null, fixRows: GcalFix[] | null): Promise<{ row: ApptDraft; dropFix: boolean } | null> {
    const { store } = this.deps
    const masked = maskText(ev.summary, TITLE_MAX)
    // 적어 둔 구글 제목은 가린 글이다: 가린 글이 같으면 같은 제목으로 본다
    const view = appt && appt.gTitle !== null && appt.gTitle === masked ? { ...appt, gTitle: ev.summary } : appt
    const fix = fixRows?.[0] ? { state: fixRows[0].state, gTitle: fixRows[0].gTitle === masked ? ev.summary : fixRows[0].gTitle } : null
    const d = decideEvent(ev, view, { ...this.ctx, fix })
    switch (d.do) {
      case 'update': {
        if (!appt) return null
        const saved = await store.applyAppt(appt.id, apptPatch(d.patch, appt), ev.updated, appt.gWaitAt)
        if (saved && saved !== 'blocked') this.changed++
        return null
      }
      case 'delete': {
        if (!appt) return null
        await store.deleteAppt(appt.id)
        await store.dropDelete(ev.id, appt.day) // 구글에서 지운 것을 구글에 다시 지우러 가지 않는다
        this.changed++
        return null
      }
      case 'insert':
        return { row: newApptRow(d.row), dropFix: d.dropFix }
      case 'fix': {
        await this.saveFixes(ev, d.fix, d.fix.days, fixRows?.[0]?.state === 'skip' && fixRows[0].gTitle === masked ? 'skip' : 'open')
        return null
      }
      case 'drop-fix':
        await this.dropFixes(ev.id)
        return null
      default:
        return null
    }
  }

  private async saveFixes(ev: GEvent, fix: GParsedFix, days: readonly string[], state: GcalFix['state'] = 'open') {
    const { store } = this.deps
    await store.upsertFixes(days.map((day) => fixInputOf(ev, fix, day, state)))
    const all = await this.loadFixes()
    for (const f of all.filter((x) => x.gEventId === ev.id && !days.includes(x.day))) await store.deleteFix(f.id)
    this.fixes = await store.listFixes()
    this.changed++
  }

  private async dropFixes(id: string) {
    const all = await this.loadFixes()
    const mine = all.filter((f) => f.gEventId === id)
    for (const f of mine) await this.deps.store.deleteFix(f.id)
    if (mine.length) {
      this.fixes = all.filter((f) => f.gEventId !== id)
      this.changed++
    }
  }

  /** 하루 종일 일정 하나: off 줄·종일 메모·고쳐야 할 것 */
  private async allDay(ev: GEvent) {
    const memos = this.memoRows(ev.id)
    const pairs = this.offPairs(ev.id)
    const fixRows = (this.fixes ?? []).filter((f) => f.gEventId === ev.id)
    const seen = [...memos.map((m) => m.gUpdated ?? null), ...pairs.map((p) => p.gUpdated), ...fixRows.map((f) => f.gUpdated)]
      .filter((s): s is string => !!s)
      .sort((a, b) => (toMs(a) ?? 0) - (toMs(b) ?? 0))
      .pop()
    const masked = maskText(ev.summary, TITLE_MAX)
    const fix = fixRows[0] ? { state: fixRows[0].state, gTitle: fixRows[0].gTitle === masked ? ev.summary : fixRows[0].gTitle } : null
    const d = decideEvent(ev, null, { ...this.ctx, fix, allDaySeen: seen ?? null })
    if (d.do === 'allday-gone') return this.allDayGone(ev)
    if (d.do !== 'allday') return
    const p = d.parsed
    if (p.type === 'memo') {
      await this.clearOffPairs(ev, [])
      await this.dropFixes(ev.id)
      await this.syncMemo(ev, d.days, p.memo)
    } else if (p.type === 'off') {
      this.offEvents.push(ev)
      await this.dropMemos(ev)
      await this.dropFixes(ev.id)
      await this.syncOff(ev, d.days, p.people)
    } else if (p.type === 'fix') {
      await this.dropMemos(ev)
      await this.clearOffPairs(ev, [])
      await this.saveFixes(ev, p.fix, d.days)
    }
  }

  /** 구글에서 지운 하루 종일 일정: 메모 줄(+ 지움 줄 바로 버림)·그 일정 off 날의 사람 줄·고쳐야 할 것을 지운다 */
  private async allDayGone(ev: GEvent) {
    await this.dropMemos(ev)
    await this.clearOffPairs(ev, [])
    await this.dropFixes(ev.id)
  }

  private async dropMemos(ev: GEvent) {
    for (const row of this.memoRows(ev.id)) await this.removeMemo(ev.id, row)
  }

  private async removeMemo(id: string, row: CalAllDay) {
    const { store } = this.deps
    await store.deleteAllDay(row.id)
    await store.dropDelete(id, row.day) // 지움 트리거가 적은 줄 — 구글에서 지운(바뀐) 것이니 보내지 않는다
    this.allday = (this.allday ?? []).filter((r) => r.id !== row.id)
    this.changed++
  }

  /**
   * 종일 메모: 짝 줄은 고치기로 적는다(지우고 다시 넣지 않음, design.md 12-1). 남는 날은 글 고치기, 새 날은 넣기, 빠진 날만 지우기(지움 줄 바로 버림).
   * 남는 날이 하나도 없으면(날짜를 옮김) 빠진 날 줄의 날짜를 새 날로 고친다
   */
  private async syncMemo(ev: GEvent, days: readonly string[], text: string) {
    const { store } = this.deps
    const memo = maskText(text, ALLDAY_MEMO_MAX).trim()
    if (!memo) return
    const color = memoColorOf(ev) // 구글 일정 색(AC-8554.4) — 새 줄·고친 줄 모두
    const rows = this.memoRows(ev.id)
    const keep = rows.filter((r) => days.includes(r.day))
    let gone = rows.filter((r) => !days.includes(r.day))
    let fresh = days.filter((d) => !rows.some((r) => r.day === d))
    const write = async (row: CalAllDay, patch: { day?: string; memo: string; gColor: MemoColor }) => {
      const saved = await store.applyMemo(row.id, patch, ev.updated, row.gWaitAt ?? null)
      if (saved && saved !== 'blocked') {
        this.allday = (this.allday ?? []).map((r) => (r.id === row.id ? saved : r))
        if (patch.day !== undefined || row.memo !== patch.memo || (row.gColor ?? null) !== patch.gColor) this.changed++
      }
    }
    for (const row of keep) await write(row, { memo, gColor: color })
    if (!keep.length) {
      const moves = Math.min(gone.length, fresh.length)
      for (let i = 0; i < moves; i++) await write(gone[i], { day: fresh[i], memo, gColor: color })
      gone = gone.slice(moves)
      fresh = fresh.slice(moves)
    }
    for (const day of fresh) {
      const saved = await store.addAllDay({ day, type: 'memo', memo, staffId: null, staffName: null, gEventId: ev.id, gUpdated: ev.updated, gWait: false, gColor: color })
      if (saved !== 'blocked') {
        this.allday = [...(this.allday ?? []), saved]
        this.changed++
      }
    }
    for (const row of gone) await this.removeMemo(ev.id, row)
  }

  /**
   * off 줄: 그날 웹앱이 맡는 사람(offScope)의 하루 종일 off 줄을 구글 사람과 같게(직원 탭 휴가 기록은 그대로), 짝(gcal_off_days)을 적는다(wait 거짓).
   * 그날 다른 일정이 이미 짝이면 사람만 더한다. 범위에서 빠진 날은 그 사람 줄을 지운다.
   * 그날 아직 못 보낸 웹앱 고침이 구글 고침보다 나중이면(webLater) 사람 줄은 그대로 두고 짝의 구글 칸만 적어 wait를 남긴다(다음 보내기가 맞춤)
   */
  private async syncOff(ev: GEvent, days: readonly string[], people: readonly OffPerson[]) {
    const { store } = this.deps
    const want = people.filter((p) => this.scope.some((s) => s.id === p.id))
    const title = maskText(ev.summary, TITLE_MAX)
    for (const day of days) {
      const pair = (this.offDays ?? []).find((o) => o.day === day) ?? null
      const other = pair !== null && pair.gEventId !== null && pair.gEventId !== ev.id
      if (pair && webLater(pair, ev)) {
        if (!other) await this.keepWait(pair, { gEventId: ev.id, gTitle: title, gUpdated: ev.updated })
        continue
      }
      const lines = (this.allday ?? []).filter((r) => r.type === 'off' && r.day === day)
      for (const p of want) {
        if (lines.some((l) => l.staffId === p.id)) continue
        const saved = await store.addAllDay({ day, type: 'off', memo: null, staffId: p.id, staffName: clip(p.name, STAFF_NAME_MAX) })
        if (saved !== 'blocked') {
          this.allday = [...(this.allday ?? []), saved]
          this.changed++
        }
      }
      if (other) continue
      for (const line of lines) {
        if (line.part || !this.scope.some((s) => s.id === line.staffId) || want.some((p) => p.id === line.staffId)) continue
        await store.deleteAllDay(line.id)
        this.allday = (this.allday ?? []).filter((r) => r.id !== line.id)
        this.changed++
      }
      await this.writePair(day, { day, gEventId: ev.id, gTitle: title, gUpdated: ev.updated, wait: false })
    }
    await this.clearOffPairs(ev, days)
  }

  /**
   * 이 일정이 짝인 off 날 가운데 keep 밖의 날(구글에서 지움·다른 날로 옮김·메모나 고쳐야 할 것으로 바뀜): 맡는 사람 하루 종일 줄을 지우고 짝을 비운다.
   * 그날 아직 못 보낸 웹앱 고침이 그보다 나중이면 줄은 그대로 두고 짝만 비워 wait를 남긴다(다음 보내기가 off ③ newId로 다시 만든다)
   */
  private async clearOffPairs(ev: GEvent, keep: readonly string[]) {
    const { store } = this.deps
    for (const pair of this.offPairs(ev.id).filter((o) => !keep.includes(o.day))) {
      if (webLater(pair, ev)) {
        await this.keepWait(pair, { gEventId: null, gTitle: null, gUpdated: ev.updated })
        continue
      }
      const lines = (this.allday ?? []).filter((r) => r.type === 'off' && r.day === pair.day && !r.part && this.scope.some((s) => s.id === r.staffId))
      for (const line of lines) {
        await store.deleteAllDay(line.id)
        this.allday = (this.allday ?? []).filter((r) => r.id !== line.id)
      }
      await this.writePair(pair.day, { day: pair.day, gEventId: null, gTitle: null, gUpdated: ev.updated, wait: false })
      this.changed++
    }
  }

  private async writePair(day: string, off: GcalOffDay | Omit<GcalOffDay, 'waitAt'>) {
    await this.deps.store.saveOffDay({ day, gEventId: off.gEventId, gTitle: off.gTitle, gUpdated: off.gUpdated, wait: off.wait })
    const rest = (this.offDays ?? []).filter((o) => o.day !== day)
    this.offDays = [...rest, { day, gEventId: off.gEventId, gTitle: off.gTitle, gUpdated: off.gUpdated, wait: off.wait, waitAt: null }]
  }

  /**
   * 웹앱이 이긴 off 날: 짝의 구글 칸만 적고 wait·wait_at은 그대로. wait_at이 읽은 글자 그대로일 때만(DB가 준 글자를 그대로 넘긴다) —
   * 그 사이 휴가가 또 바뀌었으면 0줄이고, 그 줄은 더 나중 웹앱 고침이라 다음 보내기가 맞춘다
   */
  private async keepWait(pair: GcalOffDay, google: Pick<GcalOffDay, 'gEventId' | 'gTitle' | 'gUpdated'>) {
    const next: GcalOffDay = { ...pair, ...google }
    const saved = await this.deps.store.saveOffDay({ day: pair.day, gEventId: next.gEventId, gTitle: next.gTitle, gUpdated: next.gUpdated, wait: true }, pair.waitAt)
    if (saved) this.offDays = [...(this.offDays ?? []).filter((o) => o.day !== pair.day), next]
  }
}

/**
 * 그날 off 짝에 아직 못 보낸 웹앱 고침(wait)이 있고 그 때(wait_at)가 구글 updated보다 나중인가 — 예약의 g_wait_at > updated와 같은 '나중 고친 쪽'.
 * 견주기만 시각으로 읽고, 조건 쓰기에는 wait_at 글자를 그대로 쓴다
 */
function webLater(pair: GcalOffDay, ev: GEvent): boolean {
  if (!pair.wait) return false
  const web = toMs(pair.waitAt)
  const google = toMs(ev.updated)
  return web !== null && google !== null && web > google
}
