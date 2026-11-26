import { addDays, addMonthsToDay, compareYmd, todayInKorea } from '@/lib/analytics/dates'
import { offScope } from '@/lib/calendar/goff'
import { colorFromId, type GColor, type GEvent, type GParsed, type GParsedAppt, type OffPerson, type ParseCtx } from '@/lib/calendar/gshapes'
import { parseGoogleEvent } from '@/lib/calendar/gtitle'
import { newGoogleEventId } from '@/lib/storage/calendar'
import type { ApptDraft, CalAllDay } from '@/types/calendar'
import type { GcalFixInput } from '@/types/gcal'
import { GcalCallError, readEvents, readNext, readNow, type GcalErrorCode } from './client'
import { clip, maskText, type GcalDeps } from './deps'
import { fixInputOf, newApptRow } from './pull'
import { pushWaiting } from './push'

// 처음 가져오기(spec google-link REQ-8527, design.md 12-3). 읽기(readImport)는 웹앱·구글 어느 쪽도 바꾸지 않는다.
// 적기(applyImport): 예약(500줄씩, 같은 g_event_id는 건너뜀) → 종일 메모 → off 줄과 짝 → 고쳐야 할 것 → 웹앱에만 있던 오늘 뒤 예약 g_wait 'new'
// → 이은 날 = 오늘 → 받아 온 끝 = 읽은 시각 → 보내기. 가져온 구글 일정의 제목·색은 바꾸지 않는다. 지난 예약은 도착을 비워 둔다

const MAX_PAGES = 200
const ALLDAY_MEMO_MAX = 20
const TITLE_MAX = 200
const MEMO_MAX = 100
const STAFF_NAME_MAX = 10

/** 미리 보기 한 줄 = 구글 일정 하나(여러 날 하루 종일은 한 줄에 날마다) */
export type ImportRow = {
  key: string
  eventId: string
  /** 구글 제목 원문(화면의 rows/ 안에서만 그린다) */
  title: string
  gColor: GColor | null
  allDay: boolean
  /** 첫날 */
  day: string
  /** 오늘보다 이른 날 시작(지난 1년) */
  past: boolean
  parsed: GParsed
  /** 웹앱에 이미 짝이 있다(알아봄으로 세고 넣지 않는다) */
  known: boolean
  event: GEvent
}

export type ImportPreview = {
  /** 읽기를 시작한 구글 시각(받아 온 끝) */
  readAt: string
  today: string
  /** 읽은 범위 [from, to) */
  from: string
  to: string
  calendarName: string | null
  /** 알아본 기준(고르기·까닭 글에 쓴다: fixChoices·fixReasonText) */
  ctx: ParseCtx
  rows: ImportRow[]
}

/** 줄마다 고른 것(fixChoices 키: 'staff:<id>'·'kind:<id>'·'len:<n>'·'person:<id>'·'memo'·'skip') */
export type ImportPicks = Readonly<Record<string, readonly string[]>>
export type ImportRowState = 'known' | 'fix' | 'picked' | 'skip'

export type ImportCounts = {
  past: { total: number; appts: number; allDay: number }
  future: { total: number; appts: number; allDay: number }
  /** 알아봄(고른 것 포함) */
  known: number
  /** 그 가운데 구글 색·설정으로 알아본 예약 */
  guessed: number
  fix: number
  picked: number
  skip: number
  filters: { future: number; past: number; fix: number; allDay: number }
  /** 시행자 글 없는 예약: 지난 1년은 시행자 없이 가져옴(종류별 수), 앞으로는 고쳐야 할 것(고르지 않은 것)의 종류 */
  noStaff: { past: number; pastKinds: { name: string; n: number }[]; future: number; futureKinds: string[] }
}

export type ImportResult =
  | { ok: true; appts: number; memos: number; offs: number; fixes: number; skipped: number; sent: number; sendCode: GcalErrorCode | null }
  | { ok: false; code: GcalErrorCode | null }

/** 미리 보기 읽기: [오늘 − 1년 0시, 오늘 + 2년 0시) list를 쪽마다. 이미 짝이 있는 일정은 known */
export async function readImport(deps: GcalDeps): Promise<{ ok: true; preview: ImportPreview } | { ok: false; code: GcalErrorCode | null }> {
  const { store } = deps
  try {
    const link = await store.loadLink()
    if (!link || !link.calendarId) return { ok: false, code: null }
    const parts = await store.loadParts()
    const today = todayInKorea(deps.now())
    const from = addMonthsToDay(today, -12)
    const to = addMonthsToDay(today, 24)
    const ctx: ParseCtx = { staff: parts.staff, kinds: parts.kinds, look: link.look, people: parts.people, arrival: link.rules.arrival, linkedOn: today }

    const events: GEvent[] = []
    let readAt: string | null = null
    let token: string | null = null
    for (let page = 0; page < MAX_PAGES; page++) {
      const body: Record<string, unknown> = { calendarId: link.calendarId, from, to }
      if (token) body.pageToken = token
      const reply = await deps.call(link, 'list', body)
      readAt ??= readNow(reply)
      events.push(...readEvents(reply).filter((e) => e.status !== 'cancelled'))
      token = readNext(reply)
      if (!token) break
    }

    const last = addDays(to, -1)
    const timed = events.filter((e) => !e.allDay).map((e) => e.id)
    const mapped = new Set((timed.length ? await store.findAppts(timed) : []).map((a) => a.gEventId))
    const hasAllDay = events.some((e) => e.allDay)
    const allday = hasAllDay ? await store.listAllDay(from, last) : []
    const offDays = hasAllDay ? await store.listOffDays(from, last) : []
    const memoIds = new Set(allday.flatMap((r) => (r.type === 'memo' && r.gEventId ? [r.gEventId] : [])))
    const offIds = new Set(offDays.flatMap((o) => (o.gEventId ? [o.gEventId] : [])))

    const rows: ImportRow[] = events.map((ev) => {
      const day = ev.start.slice(0, 10)
      return {
        key: ev.id,
        eventId: ev.id,
        title: ev.summary,
        gColor: colorFromId(ev.colorId),
        allDay: ev.allDay,
        day,
        past: compareYmd(day, today) < 0,
        parsed: parseGoogleEvent(ev, ctx),
        known: ev.allDay ? memoIds.has(ev.id) || offIds.has(ev.id) : mapped.has(ev.id),
        event: ev,
      }
    })
    return { ok: true, preview: { readAt: readAt ?? deps.now().toISOString(), today, from, to, calendarName: link.calendarName, ctx, rows } }
  } catch (err) {
    return { ok: false, code: err instanceof GcalCallError ? err.code : null }
  }
}

const has = (keys: readonly string[], head: string) => keys.some((k) => k.startsWith(head))

/** 줄 상태: 가져오지 않음 → 알아봄(이미 있음·알아본 것) → 고름(고른 것으로 모든 고를 거리가 찼다) → 고쳐야 함 */
export function importRowState(row: ImportRow, picks: ImportPicks): ImportRowState {
  const keys = picks[row.key] ?? []
  if (keys.includes('skip')) return 'skip'
  if (row.known || row.parsed.type !== 'fix') return 'known'
  const needs = row.parsed.fix.guess.needs
  if (keys.includes('memo') && (needs.includes('what') || needs.includes('person')) && row.title.trim()) return 'picked'
  const met = needs.every((n) => (n === 'staff' ? has(keys, 'staff:') : n === 'kind' ? has(keys, 'kind:') : n === 'len' ? has(keys, 'len:') : n === 'person' ? has(keys, 'person:') : false))
  return needs.length && met ? 'picked' : 'fix'
}

const pickedId = (keys: readonly string[], head: string) => keys.find((k) => k.startsWith(head))?.slice(head.length) ?? null

/** 고른 것을 넣은 알아보기 결과(고쳐야 할 것 → 예약·종일 메모·off 줄) */
export function resolveRow(row: ImportRow, keys: readonly string[], ctx: ParseCtx): GParsed {
  const p = row.parsed
  if (p.type !== 'fix') return p
  const f = p.fix
  const g = f.guess
  if (keys.includes('memo') && row.title.trim()) return { type: 'memo', past: p.past, days: f.days, memo: clip(row.title.replace(/\s+/g, ' ').trim(), ALLDAY_MEMO_MAX).trim() }
  if (f.allDay) {
    const chosen = keys.flatMap((k) => (k.startsWith('person:') ? ctx.people.filter((x) => x.id === k.slice(7)) : []))
    const people: OffPerson[] = [...g.people]
    for (const x of chosen) if (!people.some((y) => y.id === x.id)) people.push({ id: x.id, name: x.name })
    return chosen.length ? { type: 'off', past: p.past, days: f.days, people } : p
  }
  const staffId = pickedId(keys, 'staff:')
  const kindId = pickedId(keys, 'kind:')
  const len = Number(pickedId(keys, 'len:'))
  const staff = staffId === null ? null : (ctx.staff.find((s) => s.id === staffId) ?? null)
  const kind = kindId === null ? null : (ctx.kinds.find((k) => k.id === kindId) ?? null)
  const name = g.name
  const kindFinal = kind ?? (g.kindId ? (ctx.kinds.find((k) => k.id === g.kindId) ?? null) : null)
  if (!name || !kindFinal) return p
  // 종류로 알아보지 못한 글은 종류를 고르면 메모로 남는다
  const memo = clip([kind && f.reason === 'bad-kind' ? g.bad : null, g.memo].filter(Boolean).join(' '), MEMO_MAX).trim()
  const appt: GParsedAppt = {
    day: f.day,
    start: f.start,
    len: Number.isFinite(len) && len > 0 ? len : f.len,
    chart: g.chart,
    name,
    kindId: kindFinal.id,
    kindName: kindFinal.name,
    staffId: staff ? staff.id : g.staffId,
    staffName: staff ? staff.name : g.staffName,
    staffMark: staff ? staff.mark : g.staffMark,
    memo,
    status: g.cancel ? 'cancel' : 'auto',
    gMoved: g.moved,
    gColor: g.cancel || g.moved ? null : f.gColor,
    gHow: {
      staff: staff ? 'picked' : (g.staffBy ?? 'none'),
      kind: kind ? 'picked' : (g.kindBy ?? 'setting'),
      memo: memo !== '',
      gStart: g.gStart,
      gEnd: g.gEnd,
    },
  }
  return { type: 'appt', past: p.past, appt }
}

/** 카드 다섯·거르기 넷·시행자 없는 예약 수 */
export function importCounts(preview: ImportPreview, picks: ImportPicks): ImportCounts {
  const out: ImportCounts = {
    past: { total: 0, appts: 0, allDay: 0 },
    future: { total: 0, appts: 0, allDay: 0 },
    known: 0,
    guessed: 0,
    fix: 0,
    picked: 0,
    skip: 0,
    filters: { future: 0, past: 0, fix: 0, allDay: 0 },
    noStaff: { past: 0, pastKinds: [], future: 0, futureKinds: [] },
  }
  const pastKinds = new Map<string, number>()
  for (const row of preview.rows) {
    const side = row.past ? out.past : out.future
    side.total++
    if (row.allDay) side.allDay++
    else side.appts++
    const state = importRowState(row, picks)
    if (state === 'skip') out.skip++
    else if (state === 'fix') out.fix++
    else {
      out.known++
      if (state === 'picked') out.picked++
    }
    const p = row.parsed
    if (state === 'known' && p.type === 'appt') {
      if (p.appt.gHow.kind === 'color' || p.appt.gHow.kind === 'setting' || p.appt.gHow.staff === 'color') out.guessed++
      if (row.past && p.appt.staffId === null) {
        out.noStaff.past++
        pastKinds.set(p.appt.kindName, (pastKinds.get(p.appt.kindName) ?? 0) + 1)
      }
    }
    if (state === 'fix' && !row.past && p.type === 'fix' && (p.fix.reason === 'no-staff' || p.fix.reason === 'no-staff-color')) {
      out.noStaff.future++
      const name = p.fix.guess.kindName
      if (name && !out.noStaff.futureKinds.includes(name)) out.noStaff.futureKinds.push(name)
    }
  }
  out.noStaff.pastKinds = [...pastKinds].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n || (a.name < b.name ? -1 : 1))
  out.filters = { future: out.future.total, past: out.past.total, fix: out.fix, allDay: out.past.allDay + out.future.allDay }
  return out
}

/** [가져오기] */
export async function applyImport(deps: GcalDeps, preview: ImportPreview, picks: ImportPicks): Promise<ImportResult> {
  const { store } = deps
  try {
    const link = await store.loadLink()
    if (!link || !link.calendarId) return { ok: false, code: null }
    const { ctx, today, from } = preview
    const last = addDays(preview.to, -1)
    const inRange = (d: string) => compareYmd(d, from) >= 0 && compareYmd(d, last) <= 0
    const scope = offScope(ctx.people, link.rules.offAllStaff, ctx.staff.map((s) => s.id))

    const appts: ApptDraft[] = []
    const memos: { ev: GEvent; days: string[]; memo: string; own: boolean }[] = []
    const offs: { ev: GEvent; days: string[]; people: OffPerson[] }[] = []
    const fixes: GcalFixInput[] = []
    let skipped = 0
    for (const row of preview.rows) {
      const state = importRowState(row, picks)
      if (state === 'skip') {
        skipped++
        continue
      }
      if (row.known) continue
      const ev = row.event
      const parsed = state === 'picked' ? resolveRow(row, picks[row.key] ?? [], ctx) : row.parsed
      if (parsed.type === 'appt') {
        appts.push(newApptRow({ ...parsed.appt, gEventId: ev.id, gTitle: ev.summary, gUpdated: ev.updated, colorFrom: 'google', gKeepTitle: true, gFrom: 'import' }))
      } else if (parsed.type === 'memo') {
        memos.push({ ev, days: parsed.days.filter(inRange), memo: parsed.memo, own: row.allDay })
      } else if (parsed.type === 'off') {
        offs.push({ ev, days: parsed.days.filter(inRange), people: parsed.people.filter((p) => scope.some((s) => s.id === p.id)) })
      } else {
        for (const day of parsed.fix.days.filter(inRange)) fixes.push(fixInputOf(ev, parsed.fix, day))
      }
    }

    // 예약 500줄씩(저장 함수가 나눈다) — 같은 g_event_id는 건너뛴다
    const inserted = appts.length ? (await store.insertAppts(appts)).sent : 0

    let existing: CalAllDay[] = memos.length || offs.length ? await store.listAllDay(from, last) : []
    let memoRows = 0
    for (const m of memos) {
      const memo = maskText(m.memo, ALLDAY_MEMO_MAX).trim()
      if (!memo) continue
      for (const day of m.days) {
        const dup = existing.some((r) => r.type === 'memo' && r.day === day && (m.own ? r.gEventId === m.ev.id : !r.gEventId && r.memo === memo))
        if (dup) continue
        const saved = await store.addAllDay({
          day,
          type: 'memo',
          memo,
          staffId: null,
          staffName: null,
          // 하루 종일 일정이면 그 일정과 잇는다. 시간 일정을 '종일 메모로 넣기'면 웹앱에만 둔다
          gEventId: m.own ? m.ev.id : null,
          gUpdated: m.own ? m.ev.updated : null,
          gWait: false,
        })
        if (saved !== 'blocked') {
          existing = [...existing, saved]
          memoRows++
        }
      }
    }

    let offRows = 0
    for (const o of offs) {
      for (const day of o.days) {
        for (const p of o.people) {
          if (existing.some((r) => r.type === 'off' && r.day === day && r.staffId === p.id)) continue
          const saved = await store.addAllDay({ day, type: 'off', memo: null, staffId: p.id, staffName: clip(p.name, STAFF_NAME_MAX) })
          if (saved !== 'blocked') {
            existing = [...existing, saved]
            offRows++
          }
        }
        await store.saveOffDay({ day, gEventId: o.ev.id, gTitle: maskText(o.ev.summary, TITLE_MAX), gUpdated: o.ev.updated, wait: false })
      }
    }

    if (fixes.length) await store.upsertFixes(fixes)

    // 웹앱에만 있던 오늘 뒤 예약: 웹앱이 정한 id로 구글에 보낸다
    for (const a of await store.listAppts(today, last)) {
      if (a.gEventId) continue
      await store.updateAppt(a.id, { gEventId: newGoogleEventId(), gWait: 'new', gFrom: 'web' })
    }

    await store.setLinkedOn(today)
    await store.advancePulled(preview.readAt)
    await store.markOk(deps.now().toISOString())
    const pushed = await pushWaiting(deps)
    return {
      ok: true,
      appts: inserted,
      memos: memoRows,
      offs: offRows,
      fixes: fixes.length,
      skipped,
      sent: pushed.sent,
      sendCode: pushed.ok ? null : pushed.code,
    }
  } catch (err) {
    return { ok: false, code: err instanceof GcalCallError ? err.code : null }
  }
}
