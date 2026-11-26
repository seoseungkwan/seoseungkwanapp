import { addDays, addMonthsToDay, compareYmd, todayInKorea } from '@/lib/analytics/dates'
import { composeOffTitle, offDayNames, offEventId, offScope } from '@/lib/calendar/goff'
import { apptPaint } from '@/lib/calendar/gpaint'
import { G_COLOR_ID, type GEvent, type PaintCtx } from '@/lib/calendar/gshapes'
import { colorChangeTargets } from '@/lib/calendar/gsync'
import { formatGoogleTitle, withArrival } from '@/lib/calendar/gtitle'
import { shownStatus } from '@/lib/calendar/rules'
import { newGoogleEventId } from '@/lib/storage/calendar'
import type { CalAllDay, CalAppt } from '@/types/calendar'
import type { GcalLink, GcalOffDay } from '@/types/gcal'
import { GcalCallError, readEvent, type GcalErrorCode } from './client'
import { localStamp, maskText, type GcalDeps, type GcalParts } from './deps'

// 웹앱 → 구글 보내기(spec google-link REQ-8526, design.md 12-2). 저장이 g_wait(·g_wait_at)를 적은 뒤 보낸다.
// 보낸 뒤 g_wait는 보낼 때 읽은 g_wait_at 글자가 그대로일 때만 비운다(그 사이 또 고쳤으면 남겨 다음에 또 보낸다).
// 이은 날 0시 전 예약·지움 줄·off 날은 구글에 보내지 않고 버린다(AC-8526.7). 도착은 맞춤 방법이 'title'일 때만 제목 앞 글로

const TITLE_MAX = 200
const MEMO_WINDOW_DAYS = 62 // 여러 날 종일 메모의 다른 날 줄을 찾는 앞뒤 날 수

export type PushOutcome = { ok: true; did: 'sent' | 'none' | 'dropped' | 'again' } | { ok: false; code: GcalErrorCode | null }
export type PushAllResult = { ok: true; sent: number } | { ok: false; code: GcalErrorCode | null; sent: number }

type Linked = GcalLink & { calendarId: string; linkedOn: string }
const isLinked = (link: GcalLink | null): link is Linked => !!link && !!link.calendarId && !!link.linkedOn
const before = (day: string, linkedOn: string) => compareYmd(day, linkedOn) < 0

class Sender {
  private parts: GcalParts | null = null
  constructor(
    readonly deps: GcalDeps,
    readonly link: Linked,
  ) {}

  async loadParts() {
    this.parts ??= await this.deps.store.loadParts()
    return this.parts
  }

  private put(id: string, fields: Record<string, unknown>) {
    return this.deps.call(this.link, 'put', { calendarId: this.link.calendarId, id, fields })
  }

  /** 예약 칸 → 구글 칸. 가져온 제목(g_keep_title)이면 제목·설명은 구글 것 그대로(도착 'title'이면 제목 앞 글만) */
  async fullFields(appt: CalAppt): Promise<Record<string, unknown>> {
    const parts = await this.loadParts()
    const { look, rules } = this.link
    const shown = shownStatus(appt)
    const arrival = rules.arrival === 'title' && (shown === 'came' || shown === 'noshow') ? shown : null
    const fields: Record<string, unknown> = {}
    if (!appt.gKeepTitle) {
      fields.summary = formatGoogleTitle(appt, look, parts.kinds, parts.staff, arrival)
      fields.description = appt.memo
    } else if (rules.arrival === 'title' && appt.gTitle && !appt.gTitle.includes('…')) {
      fields.summary = withArrival(appt.gTitle, arrival) // 가린 제목(…)은 구글 원문을 덮지 않게 보내지 않는다
    }
    fields.start = localStamp(appt.day, appt.start)
    fields.end = localStamp(appt.day, appt.start + appt.len)
    fields.allDay = false
    fields.colorId = await this.colorId(appt)
    return fields
  }

  async colorId(appt: CalAppt): Promise<string | null> {
    const parts = await this.loadParts()
    const ctx: PaintCtx = { look: this.link.look, kinds: parts.kinds, staff: parts.staff }
    return apptPaint(appt, ctx).colorId
  }

  /** 예약 하나 보내기 */
  async appt(row: CalAppt): Promise<PushOutcome> {
    const { store } = this.deps
    if (row.gWait === null || row.gWaitAt === null) return { ok: true, did: 'none' }
    if (before(row.day, this.link.linkedOn)) {
      await store.markApptSent(row.id, {}, row.gWaitAt)
      return { ok: true, did: 'dropped' }
    }
    let appt = row
    if (!appt.gEventId) {
      const saved = await store.updateAppt(appt.id, { gEventId: newGoogleEventId() })
      if (saved === 'blocked') return { ok: false, code: null }
      appt = saved
    }
    const id = appt.gEventId as string
    let reply
    if (appt.gWait === 'cancel' || appt.gWait === 'uncancel' || appt.gWait === 'color') {
      try {
        reply = await this.put(id, { colorId: await this.colorId(appt) })
      } catch (err) {
        // 구글에 아직 없는 일정(한 번도 못 보낸 새 예약)은 색만으로 만들 수 없다 → 칸을 다 보낸다
        if (!(err instanceof GcalCallError) || err.reason !== 'bad_request') throw err
        reply = await this.put(id, await this.fullFields(appt))
      }
    } else {
      reply = await this.put(id, await this.fullFields(appt))
    }
    const ev = readEvent(reply.event)
    const done = await store.markApptSent(
      appt.id,
      ev ? { gUpdated: ev.updated, gTitle: maskText(ev.summary, TITLE_MAX), gGone: false } : { gGone: false },
      appt.gWaitAt as string,
    )
    return { ok: true, did: done ? 'sent' : 'again' }
  }

  /** 지움 줄 하나: 이은 날 전이면 버림, 메모는 같은 일정의 다른 날 줄이 남았으면 그날만 뗀다 */
  async remove(gEventId: string, day: string, kind: 'appt' | 'memo'): Promise<boolean> {
    const { store } = this.deps
    if (before(day, this.link.linkedOn)) {
      await store.dropDelete(gEventId, day)
      return false
    }
    let action: 'remove' | 'dropDay' = 'remove'
    if (kind === 'memo') {
      const rows = await store.listAllDay(addDays(day, -MEMO_WINDOW_DAYS), addDays(day, MEMO_WINDOW_DAYS))
      if (rows.some((r) => r.type === 'memo' && r.gEventId === gEventId && r.day !== day)) action = 'dropDay'
    }
    const body: Record<string, unknown> = { calendarId: this.link.calendarId, id: gEventId }
    if (action === 'dropDay') body.day = day
    await this.deps.call(this.link, action, body)
    await store.dropDelete(gEventId, day)
    return true
  }

  /** 그날 off 줄: 웹앱이 맡는 사람의 하루 종일 'off' 줄로 제목을 만들어(목록 밖 이름은 남김) 같으면 wait만 풀고, 다르면 off로 보낸다 */
  async offDay(day: string, off: GcalOffDay | null): Promise<PushOutcome> {
    const { store } = this.deps
    if (before(day, this.link.linkedOn)) {
      if (off?.wait) await store.saveOffDay({ day, gEventId: off.gEventId, gTitle: off.gTitle, gUpdated: off.gUpdated, wait: false }, off.waitAt)
      return { ok: true, did: 'dropped' }
    }
    const parts = await this.loadParts()
    const { look, rules } = this.link
    const scope = offScope(parts.people, rules.offAllStaff, parts.staff.map((s) => s.id))
    const lines = (await store.listAllDay(day, day)).filter((r): r is CalAllDay & { type: 'off' } => r.type === 'off')
    const names = offDayNames(lines, day, scope)
    const current = off?.gTitle ?? null
    const title = composeOffTitle(names, current, look.offWord, scope)
    if (title === (current ?? '')) {
      if (off?.wait) {
        const done = await store.saveOffDay({ day, gEventId: off.gEventId, gTitle: off.gTitle, gUpdated: off.gUpdated, wait: false }, off.waitAt)
        return { ok: true, did: done ? 'none' : 'again' }
      }
      return { ok: true, did: 'none' }
    }
    const body: Record<string, unknown> = {
      calendarId: this.link.calendarId,
      day,
      newId: offEventId(this.deps.hospitalId, day),
      offWord: look.offWord,
      title,
      colorId: G_COLOR_ID[look.offColor],
    }
    if (off?.gEventId) body.id = off.gEventId
    const reply = await this.deps.call(this.link, 'off', body)
    const ev: GEvent | null = reply.event ? readEvent(reply.event) : null
    const saved = { day, gEventId: ev?.id ?? null, gTitle: ev ? maskText(ev.summary, TITLE_MAX) : null, gUpdated: ev?.updated ?? null, wait: false }
    const done = await store.saveOffDay(saved, off ? off.waitAt : undefined)
    return { ok: true, did: done ? 'sent' : 'again' }
  }

  /** 웹앱 종일 메모 하나(웹앱이 정한 'ssk' + 32자 id). 같은 일정의 다른 날 줄이 있으면 글만, 없으면 그날 하루 종일로 */
  async memo(row: CalAllDay): Promise<boolean> {
    const { store } = this.deps
    if (!row.gEventId || !row.gWaitAt || !row.memo) return false
    const near = await store.listAllDay(addDays(row.day, -MEMO_WINDOW_DAYS), addDays(row.day, MEMO_WINDOW_DAYS))
    const siblings = near.filter((r) => r.type === 'memo' && r.gEventId === row.gEventId && r.id !== row.id)
    const fields: Record<string, unknown> = { summary: row.memo }
    if (!siblings.length) Object.assign(fields, { allDay: true, start: row.day, end: addDays(row.day, 1) })
    const reply = await this.put(row.gEventId, fields)
    const ev = readEvent(reply.event)
    const sent = await store.markMemoSent(row.id, row.gWaitAt, ev?.updated)
    // 웹앱 메모는 구글에서 색 없는 일정이 된다 → 색이 비었으면 'default'(이미 색이 있으면 0줄 — 구글에서 온 색 그대로, AC-8554.4). 실패는 삼킨다
    if (sent) await store.fillMemoColor(row.id, 'default').catch(() => false)
    // 같은 일정의 다른 날 줄도 같은 글로(구글 일정은 하나다)
    if (ev) for (const s of siblings) if (s.memo !== row.memo) await store.applyMemo(s.id, { memo: row.memo }, ev.updated, s.gWaitAt ?? null)
    return true
  }
}

async function linked(deps: GcalDeps): Promise<Linked | null> {
  const link = await deps.store.loadLink()
  return isLinked(link) ? link : null
}

async function failed(deps: GcalDeps, err: unknown): Promise<{ ok: false; code: GcalErrorCode | null }> {
  if (err instanceof GcalCallError) {
    await deps.store.markFail(err.code, deps.now().toISOString()).catch(() => undefined)
    return { ok: false, code: err.code }
  }
  return { ok: false, code: null }
}

/** 저장한 예약 하나를 바로 보낸다(화면이 저장 뒤 부름). 못 보내면 g_wait 그대로 + 실패 번호 — 1분 뒤 pushWaiting이 다시 */
export async function pushAppt(deps: GcalDeps, appt: CalAppt): Promise<PushOutcome> {
  if (appt.gWait === null) return { ok: true, did: 'none' }
  try {
    const link = await linked(deps)
    if (!link) return { ok: true, did: 'none' }
    return await new Sender(deps, link).appt(appt)
  } catch (err) {
    return failed(deps, err)
  }
}

/** 그날 off 줄을 바로 보낸다(직원 탭 휴가 저장 뒤 날마다). 못 보내면 wait 그대로(다음 맞춤) */
export async function pushOffDay(deps: GcalDeps, day: string): Promise<PushOutcome> {
  try {
    const link = await linked(deps)
    if (!link) return { ok: true, did: 'none' }
    const [off] = await deps.store.listOffDays(day, day)
    return await new Sender(deps, link).offDay(day, off ?? null)
  } catch (err) {
    return failed(deps, err)
  }
}

/** 못 보낸 것 모두: 예약(g_wait_at 차례) → 지움 줄 → off 날 → 메모. 하나가 막히면 거기서 멈춘다(뒤 차례는 다음에). 보낸 것이 있으면 실패를 푼다 */
export async function pushWaiting(deps: GcalDeps): Promise<PushAllResult> {
  let sent = 0
  try {
    const link = await linked(deps)
    if (!link) return { ok: true, sent: 0 }
    const s = new Sender(deps, link)
    const { store } = deps
    for (const appt of await store.listWaitingAppts(link.linkedOn)) {
      const r = await s.appt(appt)
      if (r.ok && r.did !== 'none' && r.did !== 'dropped') sent++
    }
    for (const d of await store.listDeletes()) if (await s.remove(d.gEventId, d.day, d.kind)) sent++
    for (const off of await store.listWaitingOffDays()) {
      const r = await s.offDay(off.day, off)
      if (r.ok && (r.did === 'sent' || r.did === 'again')) sent++
    }
    for (const memo of await store.listWaitingMemos(link.linkedOn)) if (await s.memo(memo)) sent++
    if (sent > 0) await store.markOk(deps.now().toISOString())
    return { ok: true, sent }
  } catch (err) {
    return { ...(await failed(deps, err)), sent }
  }
}

/**
 * 설정에서 색을 바꿔 저장한 뒤(AC-8526.6): colorChangeTargets가 고른 예약(이은 날 뒤 앞으로·칸 색이 바뀐 것)에 g_wait = 'color'를 적고 보낸다.
 * 이미 보낼 것이 있는 예약은 그 보내기가 새 색도 싣는다
 */
export async function queueColorChange(deps: GcalDeps, beforeCtx: PaintCtx, afterCtx: PaintCtx): Promise<{ queued: number } & PushAllResult> {
  try {
    const link = await linked(deps)
    if (!link) return { queued: 0, ok: true, sent: 0 }
    const today = todayInKorea(deps.now())
    const from = compareYmd(today, link.linkedOn) > 0 ? today : link.linkedOn
    const appts = await deps.store.listAppts(from, addMonthsToDay(today, 24))
    const ids = new Set(colorChangeTargets(appts, beforeCtx, afterCtx, { today, linkedOn: link.linkedOn }))
    let queued = 0
    for (const a of appts) {
      if (!ids.has(a.id) || !a.gEventId || a.gWait !== null) continue
      await deps.store.updateAppt(a.id, { gWait: 'color' })
      queued++
    }
    return { queued, ...(await pushWaiting(deps)) }
  } catch (err) {
    return { queued: 0, ...(await failed(deps, err)), sent: 0 }
  }
}
