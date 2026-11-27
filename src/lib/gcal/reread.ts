import { todayInKorea } from '@/lib/analytics/dates'
import { G_COLOR_ID, type GEvent, type GHow, type ParseCtx } from '@/lib/calendar/gshapes'
import { parseGoogleEvent } from '@/lib/calendar/gtitle'
import type { ApptReread, ApptRereadExpect } from '@/lib/storage/calendar'
import type { CalAppt } from '@/types/calendar'
import { localStamp, yearsAhead, type GcalStore } from './deps'

// 이미 들어온 예약 다시 알아보기(spec google-link REQ-8544, design.md 21-2). 웹앱에 들어온 구글 예약의 저장된 구글 제목·일정 색·시각을
// 지금 저장된 설정(구글 연결 look·도착 규칙·이은 날, 병원 정보 시행자, 예약 설정 종류)으로 한 번 더 읽어 종류·시행자와 그 출처만 바꾼다.
// 구글은 부르지 않고, 구글 제목·색·g_wait·메모·날·시각은 쓰지 않는다. 가져올 때 고르거나 [고치기]로 바꾼 쪽(picked)은 그대로 둔다.
// 쓰기는 읽은 구글 제목·g_updated 글자 그대로일 때만(rereadAppt) — 그사이 다른 PC가 고친 줄은 적지 않고 missed로 센다

export type RereadPatch = ApptReread
export type RereadExpect = ApptRereadExpect
export type RereadWrite = { id: string; expect: RereadExpect; patch: RereadPatch; kindChanged: boolean }
export type RereadPlan = { read: number; unread: number; writes: RereadWrite[] }
export type RereadResult =
  | { ok: true; read: number; kindChanged: number; changed: number; unread: number; missed: number }
  | { ok: false; why: 'not-linked' | 'failed' }

const WRITE_AT_ONCE = 10

/** 대상: 받기·처음 가져오기로 들어와 구글 짝·저장된 제목이 있고, 웹앱이 구글 제목을 다시 적지 않았고(g_keep_title), 보낼 것이 없는 예약 */
const isTarget = (a: CalAppt) => (a.gFrom === 'import' || a.gFrom === 'pull') && !!a.gEventId && !!a.gTitle && a.gKeepTitle && a.gWait === null

/** 저장된 칸으로 다시 만든 구글 일정(시간 일정) */
function eventOf(a: CalAppt): GEvent {
  return {
    id: a.gEventId as string,
    status: 'confirmed',
    summary: a.gTitle as string,
    description: '',
    allDay: false,
    start: localStamp(a.day, a.start),
    end: localStamp(a.day, a.start + a.len),
    colorId: a.gColor ? G_COLOR_ID[a.gColor] : null,
    updated: a.gUpdated ?? '',
    recurring: false,
  }
}

type Read = {
  kind: { id: string; name: string; by: GHow['kind'] } | null
  staff: { id: string; name: string; mark: string; by: 'title' | 'color' } | null
}

/** 알아본 결과에서 종류·시행자(예약이면 그대로, 고쳐야 할 꼴이면 짐작한 것, 그 밖은 없음) */
function readOf(a: CalAppt, ctx: ParseCtx): Read {
  const p = parseGoogleEvent(eventOf(a), ctx)
  if (p.type === 'appt') {
    const { appt } = p
    const by = appt.gHow.staff
    const staff = appt.staffId && appt.staffName && appt.staffMark && (by === 'title' || by === 'color') ? { id: appt.staffId, name: appt.staffName, mark: appt.staffMark, by } : null
    return { kind: { id: appt.kindId, name: appt.kindName, by: appt.gHow.kind }, staff }
  }
  if (p.type === 'fix') {
    const g = p.fix.guess
    const kind = g.kindId && g.kindName ? { id: g.kindId, name: g.kindName, by: g.kindBy ?? ('setting' as const) } : null
    const staff = g.staffId && g.staffName && g.staffMark && g.staffBy ? { id: g.staffId, name: g.staffName, mark: g.staffMark, by: g.staffBy } : null
    return { kind, staff }
  }
  return { kind: null, staff: null }
}

/** 다시 알아보기 셈(순수): 대상 수 · 못 알아본 수 · 줄마다 쓸 칸과 쓰기 조건 */
export function planReread(rows: readonly CalAppt[], ctx: ParseCtx): RereadPlan {
  let read = 0
  let unread = 0
  const writes: RereadWrite[] = []
  for (const a of rows) {
    if (!isTarget(a)) continue
    read++
    const r = readOf(a, ctx)
    const kindPicked = a.gHow?.kind === 'picked'
    // 종류를 못 알아본 줄은 시행자까지 전 값 그대로(아무것도 적지 않음)
    if (!kindPicked && r.kind === null) {
      unread++
      continue
    }
    const patch: RereadPatch = {}
    const how: GHow | null = a.gHow ? { ...a.gHow } : null
    let kindChanged = false
    if (!kindPicked && r.kind && r.kind.id !== a.kindId) {
      patch.kindId = r.kind.id
      patch.kindName = r.kind.name
      if (how) how.kind = r.kind.by
      kindChanged = true
    }
    // 시행자는 새로 알아본 사람(제목 표시·색)이 있을 때만 바꾸고 비우지 않는다
    if (a.gHow?.staff !== 'picked' && r.staff && r.staff.id !== a.staffId) {
      patch.staffId = r.staff.id
      patch.staffName = r.staff.name
      patch.staffMark = r.staff.mark
      if (how) how.staff = r.staff.by
    }
    if (!Object.keys(patch).length) continue
    if (how && JSON.stringify(how) !== JSON.stringify(a.gHow)) patch.gHow = how
    writes.push({ id: a.id, expect: { gTitle: a.gTitle as string, gUpdated: a.gUpdated }, patch, kindChanged })
  }
  return { read, unread, writes }
}

/** [이미 들어온 예약 다시 알아보기]: 지난 1년 ~ 3년 뒤 예약을 읽어 셈하고 10줄씩 동시에 적는다. 구글(call)은 부르지 않는다 */
export async function runReread(deps: { store: Pick<GcalStore, 'loadLink' | 'loadParts' | 'listAppts' | 'rereadAppt'>; now: () => Date }): Promise<RereadResult> {
  const { store } = deps
  let plan: RereadPlan
  try {
    const link = await store.loadLink()
    if (!link || !link.linkedOn) return { ok: false, why: 'not-linked' }
    const today = todayInKorea(deps.now())
    const [parts, rows] = await Promise.all([store.loadParts(), store.listAppts(yearsAhead(today, -1), yearsAhead(today, 3))])
    const ctx: ParseCtx = { staff: parts.staff, kinds: parts.kinds, people: parts.people, look: link.look, arrival: link.rules.arrival, linkedOn: link.linkedOn }
    plan = planReread(rows, ctx)
  } catch {
    return { ok: false, why: 'failed' }
  }
  let changed = 0
  let kindChanged = 0
  let missed = 0
  for (let at = 0; at < plan.writes.length; at += WRITE_AT_ONCE) {
    const chunk = plan.writes.slice(at, at + WRITE_AT_ONCE)
    const done = await Promise.all(
      chunk.map((w) =>
        Promise.resolve()
          .then(() => store.rereadAppt(w.id, w.patch, w.expect))
          .catch(() => false),
      ),
    )
    done.forEach((ok, i) => {
      if (ok === true) {
        changed++
        if (chunk[i].kindChanged) kindChanged++
      } else missed++
    })
  }
  return { ok: true, read: plan.read, kindChanged, changed, unread: plan.unread, missed }
}
