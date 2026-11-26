import type { SupabaseClient } from '@supabase/supabase-js'
import { addDays, addMonthsToDay, todayInKorea } from '@/lib/analytics/dates'
import { mergeClinic } from '@/lib/calendar/clinic'
import type { GKind, GStaff, OffPerson } from '@/lib/calendar/gshapes'
import {
  addAllDay,
  applyGoogleAppt,
  applyGoogleMemo,
  deleteAllDay,
  deleteAppt,
  findApptsByEvents,
  insertGoogleAppts,
  listAllDay,
  listAppts,
  listWaitingAppts,
  listWaitingMemos,
  loadCalendarSettings,
  markApptSent,
  markMemoSent,
  rereadAppt,
  updateAppt,
  type ApptReread,
  type ApptRereadExpect,
  type ApptSent,
} from '@/lib/storage/calendar'
import { loadClinicProfile } from '@/lib/storage/clinicProfile'
import {
  advancePulled,
  deleteGcalFix,
  dropGcalDelete,
  listGcalDeletes,
  listGcalFixes,
  listOffDays,
  listWaitingOffDays,
  loadGcalLink,
  loadGcalState,
  loadOffNames,
  markGcalFail,
  markGcalOk,
  saveOffDay,
  setGcalOffColor,
  setLinkedOn,
  upsertGcalFixes,
} from '@/lib/storage/gcal'
import { maskPrivate } from '@/lib/storage/maskPrivate'
import { privacyProblem } from '@/lib/worklog/notes'
import type { ApptDraft, CalAllDay, CalAppt } from '@/types/calendar'
import { G_COLORS, type FixGuess, type GcalDelete, type GcalFix, type GcalFixInput, type GcalLink, type GcalOffDay, type GcalOffDayInput, type GcalState, type GColor } from '@/types/gcal'
import type { GcalAction, GcalCallLink, GcalReply } from './client'

// 맞춤 엔진이 받는 것(spec google-link design.md 10-5): 구글 부르기(call) · 저장(store) · 지금 시각(now) · 병원 id.
// 엔진(pull·push·importRead·loop·status)은 이 모양만 부른다. 진짜는 makeGcalDeps(브라우저 Supabase + lib/storage), 시험은 createMemoryStore(DB 흉내)
// 시각 글자(g_wait_at·wait_at)는 저장소가 준 글자 그대로 되돌려 보낸다 — Date로 바꾸지 않는다(마이크로초가 잘린다)

export type GcalCaller = (link: GcalCallLink, action: GcalAction, body?: Record<string, unknown>) => Promise<GcalReply>

/** 알아보기에 쓰는 병원 목록: 예약에 보이는 시행자(병원 정보) · 종류(예약 설정) · off 줄 사람(원장님·직원) */
export type GcalParts = { staff: GStaff[]; kinds: GKind[]; people: OffPerson[] }

/** 맞춤 엔진이 쓰는 저장 함수(lib/storage/calendar·gcal과 같은 뜻·같은 조건) */
export interface GcalStore {
  loadLink(): Promise<GcalLink | null>
  loadState(): Promise<GcalState>
  loadParts(): Promise<GcalParts>
  advancePulled(at: string): Promise<void>
  markFail(code: string, at: string): Promise<void>
  markOk(at: string): Promise<void>
  setLinkedOn(day: string): Promise<void>
  listAppts(from: string, to: string): Promise<CalAppt[]>
  findAppts(ids: readonly string[]): Promise<CalAppt[]>
  listWaitingAppts(fromDay: string): Promise<CalAppt[]>
  updateAppt(id: string, patch: Partial<ApptDraft>): Promise<CalAppt | 'blocked'>
  applyAppt(id: string, patch: Partial<ApptDraft>, gUpdated: string, expectWaitAt: string | null): Promise<CalAppt | null | 'blocked'>
  insertAppts(rows: readonly ApptDraft[]): Promise<{ sent: number; blocked: number }>
  markApptSent(id: string, sent: ApptSent, expectWaitAt: string): Promise<boolean>
  deleteAppt(id: string): Promise<void>
  listAllDay(from: string, to: string): Promise<CalAllDay[]>
  addAllDay(item: Omit<CalAllDay, 'id'>): Promise<CalAllDay | 'blocked'>
  applyMemo(id: string, patch: { day?: string; memo?: string }, gUpdated: string, expectWaitAt: string | null): Promise<CalAllDay | null | 'blocked'>
  deleteAllDay(id: string): Promise<void>
  listWaitingMemos(fromDay: string): Promise<CalAllDay[]>
  markMemoSent(id: string, expectWaitAt: string, gUpdated?: string): Promise<boolean>
  listFixes(state?: GcalFix['state']): Promise<GcalFix[]>
  upsertFixes(fixes: readonly GcalFixInput[]): Promise<void>
  deleteFix(id: string): Promise<void>
  listDeletes(): Promise<GcalDelete[]>
  dropDelete(gEventId: string, day: string): Promise<void>
  listOffDays(from: string, to: string): Promise<GcalOffDay[]>
  listWaitingOffDays(): Promise<GcalOffDay[]>
  saveOffDay(off: GcalOffDayInput, expectWaitAt?: string | null): Promise<boolean>
  /** 다시 알아보기(design.md 21-2): 종류·시행자·출처만, g_wait 없음·구글 제목·g_updated가 읽은 글자 그대로일 때만. 0줄이면 거짓 */
  rereadAppt(id: string, patch: ApptReread, expect: ApptRereadExpect): Promise<boolean>
  /** 휴무 줄 색만 구글 off 일정 색으로(design.md 21-5, 원장·데스크 모두). 바뀌었으면 참 */
  setOffColor(color: GColor): Promise<boolean>
}

export type GcalDeps = {
  /** 내 병원 id(uuid). off 줄 일정 id(sskoff + 병원 32자 + 날짜)에 쓴다 */
  hospitalId: string
  call: GcalCaller
  store: GcalStore
  now: () => Date
}

// ── 작은 도움 ────────────────────────────────────────────

/** 글자(코드포인트) n개까지 */
export const clip = (text: string, max: number) => [...text].slice(0, max).join('')

/** 구글에서 온 글을 적기 전에: 개인정보 모양 조각은 '…'로 가리고 한도로 자른다(자른 끝에 새 모양이 생기지 않게 한 번 더) — AC-8505.3 */
export function maskText(text: string, max: number): string {
  return maskPrivate(clip(maskPrivate(text), max))
}

const ISO = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::(\d{2}))?(?:\.(\d+))?(Z|[+-]\d{2}(?::?\d{2})?)?$/

/** 시각 글자 → 밀리초(견줄 때만 쓴다). 소수 초는 밀리초까지, 시간대 없으면 UTC. 틀리면 null */
export function toMs(iso: string | null | undefined): number | null {
  if (!iso) return null
  const m = ISO.exec(iso.trim())
  if (!m) return null
  const frac = (m[4] ?? '').padEnd(3, '0').slice(0, 3)
  let zone = m[5] ?? 'Z'
  if (/^[+-]\d{2}$/.test(zone)) zone += ':00'
  else if (/^[+-]\d{4}$/.test(zone)) zone = `${zone.slice(0, 3)}:${zone.slice(3)}`
  const t = Date.parse(`${m[1]}T${m[2]}:${m[3] ?? '00'}.${frac}${zone}`)
  return Number.isNaN(t) ? null : t
}

const pad = (n: number) => String(n).padStart(2, '0')

/** 그날 0시부터 min분 = 한국 시각 'YYYY-MM-DDTHH:mm'(24시를 넘으면 다음 날) */
export function localStamp(day: string, min: number): string {
  const days = Math.floor(min / 1440)
  const rest = min - days * 1440
  return `${addDays(day, days)}T${pad(Math.floor(rest / 60))}:${pad(rest % 60)}`
}

/** 그날 한국 0시(RFC3339, UTC 글자) */
export function dayStartIso(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00+09:00`)).toISOString()
}

/** 한국 오늘 + n년 같은 날 */
export const yearsAhead = (today: string, n: number) => addMonthsToDay(today, 12 * n)

// ── 진짜: 브라우저 Supabase + lib/storage ─────────────────────

export type GcalDbClient = Pick<SupabaseClient, 'from' | 'rpc'>

/** 진짜 deps. client = 로그인한 브라우저 Supabase(RLS가 내 병원 줄만 준다), hospitalId = 내 병원 id */
export function makeGcalDeps({ client, hospitalId, call, now = () => new Date() }: { client: GcalDbClient; hospitalId: string; call: GcalCaller; now?: () => Date }): GcalDeps {
  const store: GcalStore = {
    loadLink: () => loadGcalLink(client),
    loadState: () => loadGcalState(client),
    loadParts: async () => {
      const [cal, profile, people] = await Promise.all([loadCalendarSettings(client), loadClinicProfile(client), loadOffNames(client)])
      if (profile === 'failed') throw new Error('병원 정보를 읽지 못했어요')
      const merged = mergeClinic(cal, profile)
      return { staff: merged.staff, kinds: merged.kinds, people }
    },
    advancePulled: (at) => advancePulled(client, at),
    markFail: (code, at) => markGcalFail(client, code, at),
    markOk: (at) => markGcalOk(client, at),
    setLinkedOn: (day) => setLinkedOn(client, day),
    listAppts: (from, to) => listAppts(client, from, to),
    findAppts: (ids) => findApptsByEvents(client, ids),
    listWaitingAppts: (fromDay) => listWaitingAppts(client, fromDay),
    updateAppt: (id, patch) => updateAppt(client, id, patch),
    applyAppt: (id, patch, gUpdated, expectWaitAt) => applyGoogleAppt(client, id, patch, gUpdated, expectWaitAt),
    insertAppts: (rows) => insertGoogleAppts(client, rows),
    markApptSent: (id, sent, expectWaitAt) => markApptSent(client, id, sent, expectWaitAt),
    deleteAppt: (id) => deleteAppt(client, id),
    listAllDay: (from, to) => listAllDay(client, from, to),
    addAllDay: (item) => addAllDay(client, item),
    applyMemo: (id, patch, gUpdated, expectWaitAt) => applyGoogleMemo(client, id, patch, gUpdated, expectWaitAt),
    deleteAllDay: (id) => deleteAllDay(client, id),
    listWaitingMemos: (fromDay) => listWaitingMemos(client, fromDay),
    markMemoSent: (id, expectWaitAt, gUpdated) => markMemoSent(client, id, expectWaitAt, gUpdated),
    listFixes: (state) => listGcalFixes(client, state),
    upsertFixes: (fixes) => upsertGcalFixes(client, fixes),
    deleteFix: (id) => deleteGcalFix(client, id),
    listDeletes: () => listGcalDeletes(client),
    dropDelete: (gEventId, day) => dropGcalDelete(client, gEventId, day),
    listOffDays: (from, to) => listOffDays(client, from, to),
    listWaitingOffDays: () => listWaitingOffDays(client),
    saveOffDay: (off, expectWaitAt) => saveOffDay(client, off, expectWaitAt),
    rereadAppt: (id, patch, expect) => rereadAppt(client, id, patch, expect),
    setOffColor: (color) => setGcalOffColor(client, color),
  }
  return { hospitalId, call, store, now }
}

// ── 시험·화면 시안용 메모리 저장(DB 흉내) ─────────────────────
// DB가 하는 일을 흉내 낸다: 조건 고치기(g_wait_at·wait_at은 글자 그대로 같을 때만, g_updated는 더 이를 때만) · 유일(병원·g_event_id,
// (일정, 날) 메모, (날, 사람) off) · 다시 알아보기(g_wait 없음·구글 제목·g_updated 글자가 같을 때만) · 휴무 줄 색(look.offColor 한 칸) · 트리거(g_wait_at = DB 지금 시각(마이크로초 글자), 옮기면 처음 자리·도착 비움, 지우면 지움 줄(한국 오늘 − 1년부터),
// 하루 종일 off 줄을 넣거나 지우면 그날 off 날 wait) · pulled_until 앞으로만 · 개인정보 모양 이름·메모는 'blocked'. 부른 함수는 calls에 남는다

export type MemoryDelete = GcalDelete & { at: string }
export type MemoryDb = {
  link: GcalLink
  state: GcalState
  appts: CalAppt[]
  allday: CalAllDay[]
  fixes: GcalFix[]
  deletes: MemoryDelete[]
  offDays: GcalOffDay[]
}
export type MemoryStore = {
  store: GcalStore
  db: MemoryDb
  parts: GcalParts
  calls: { fn: keyof GcalStore; args: unknown[] }[]
  /** 줄 하나 넣기(시험 준비, 트리거는 돈다) */
  seedAppt(row: Partial<CalAppt> & Pick<CalAppt, 'day' | 'start' | 'name'>): CalAppt
  seedAllDay(row: Partial<CalAllDay> & Pick<CalAllDay, 'day' | 'type'>): CalAllDay
  /** DB 지금 시각 글자(마이크로초, PostgREST 꼴) */
  stamp(): string
}

const USER_COLUMNS = ['day', 'start', 'len', 'name', 'chart', 'staffId', 'staffName', 'staffMark', 'kindId', 'kindName', 'memo', 'status'] as const
const APPT_KEYS = [
  ...USER_COLUMNS,
  'auto',
  'gEventId',
  'gUpdated',
  'gTitle',
  'gColor',
  'colorFrom',
  'gKeepTitle',
  'gMoved',
  'gGone',
  'gWait',
  'gNote',
  'gFrom',
  'gHow',
] as const
const REREAD_KEYS: readonly string[] = ['kindId', 'kindName', 'staffId', 'staffName', 'staffMark', 'gHow']
const EMPTY_GUESS: FixGuess = { chart: null, name: null, kindId: null, kindHow: null, staffId: null, staffHow: null, memo: null, word: null }

const copy = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T))

class MemoryDbError extends Error {
  constructor(what: string) {
    super(`메모리 DB: ${what}`)
    this.name = 'MemoryDbError'
  }
}

export function createMemoryStore({ now, link, parts, state }: { now: () => Date; link: GcalLink; parts: GcalParts; state?: Partial<GcalState> }): MemoryStore {
  const db: MemoryDb = {
    link: copy(link),
    state: { pulledUntil: null, lastOkAt: null, failSince: null, failCode: null, arrivalUntil: null, arrivalDone: false, ...state },
    appts: [],
    allday: [],
    fixes: [],
    deletes: [],
    offDays: [],
  }
  const mem: MemoryStore = { store: undefined as unknown as GcalStore, db, parts: copy(parts), calls: [], seedAppt, seedAllDay, stamp }
  let lastUs = 0
  let seq = 0

  function stamp(): string {
    lastUs = Math.max(now().getTime() * 1000, lastUs + 1)
    const ms = Math.floor(lastUs / 1000)
    return `${new Date(ms).toISOString().slice(0, 23)}${String(lastUs % 1000).padStart(3, '0')}+00:00`
  }
  const newId = (head: string) => `${head}-${String(++seq).padStart(4, '0')}-0000-4000-8000-000000000000`
  const yearAgo = () => addMonthsToDay(todayInKorea(now()), -12)
  const later = (a: string | null, b: string) => {
    const x = toMs(a)
    const y = toMs(b)
    return x === null || (y !== null && x < y)
  }
  const unsafe = (text: string | null | undefined) => typeof text === 'string' && privacyProblem(text)
  const safeTitle = (text: string | null | undefined) => (text === undefined ? undefined : text !== null && privacyProblem(text) ? null : text)

  // ── 예약 트리거 ──
  function apptUpdate(old: CalAppt, patch: Partial<CalAppt>): CalAppt {
    const next: CalAppt = { ...old }
    for (const key of APPT_KEYS) if (key in patch && patch[key] !== undefined) (next as Record<string, unknown>)[key] = copy(patch[key])
    if ('gTitle' in patch) next.gTitle = safeTitle(patch.gTitle) ?? null
    if (next.day !== old.day || next.start !== old.start) {
      next.auto = null
      if (old.origDay === null) {
        next.origDay = old.day
        next.origStart = old.start
      }
      if (next.day === next.origDay && next.start === next.origStart) {
        next.origDay = null
        next.origStart = null
      }
    }
    const userChanged = USER_COLUMNS.some((k) => JSON.stringify(next[k]) !== JSON.stringify(old[k]))
    if (next.gWait === null) next.gWaitAt = null
    else if (old.gWait === null || next.gWait !== old.gWait || userChanged) next.gWaitAt = stamp()
    else next.gWaitAt = old.gWaitAt
    return next
  }

  function staffTrio(patch: Partial<ApptDraft>) {
    const trio = [patch.staffId, patch.staffName, patch.staffMark]
    if (trio.some((v) => v !== undefined) && trio.some((v) => v === undefined)) throw new MemoryDbError('시행자 세 칸은 함께 와야 한다')
  }

  function seedAppt(row: Partial<CalAppt> & Pick<CalAppt, 'day' | 'start' | 'name'>): CalAppt {
    const appt: CalAppt = {
      id: newId('a0000000'),
      len: 30,
      chart: null,
      staffId: null,
      staffName: null,
      staffMark: null,
      kindId: 'dosu',
      kindName: '도수',
      memo: '',
      status: 'auto',
      auto: null,
      origDay: null,
      origStart: null,
      gEventId: null,
      gUpdated: null,
      gTitle: null,
      gColor: null,
      colorFrom: 'app',
      gKeepTitle: false,
      gMoved: false,
      gGone: false,
      gWait: null,
      gNote: null,
      gFrom: null,
      gHow: null,
      createdAt: stamp(),
      ...copy(row),
      gWaitAt: row.gWaitAt !== undefined ? row.gWaitAt : row.gWait ? stamp() : null,
    }
    if (appt.gEventId !== null && db.appts.some((a) => a.gEventId === appt.gEventId)) throw new MemoryDbError('같은 g_event_id')
    db.appts.push(appt)
    return copy(appt)
  }

  // ── 종일 트리거 ──
  function offWait(row: CalAllDay) {
    if (row.type !== 'off' || row.part || row.day < yearAgo()) return
    const at = stamp()
    const found = db.offDays.find((o) => o.day === row.day)
    if (found) Object.assign(found, { wait: true, waitAt: at })
    else db.offDays.push({ day: row.day, gEventId: null, gTitle: null, gUpdated: null, wait: true, waitAt: at })
  }
  function memoDeleted(row: CalAllDay) {
    if (row.type !== 'memo' || !row.gEventId || row.day < yearAgo()) return
    if (!db.deletes.some((d) => d.gEventId === row.gEventId && d.day === row.day)) {
      db.deletes.push({ gEventId: row.gEventId, day: row.day, kind: 'memo', label: row.memo, at: stamp() })
    }
  }
  function insertAllDay(item: Omit<CalAllDay, 'id'>): CalAllDay {
    let row: CalAllDay
    if (item.type === 'memo') {
      if (db.allday.some((r) => r.type === 'memo' && item.gEventId && r.gEventId === item.gEventId && r.day === item.day)) throw new MemoryDbError('같은 (일정, 날) 메모')
      const gWait = item.gWait ?? false
      row = {
        id: newId('d0000000'),
        day: item.day,
        type: 'memo',
        memo: item.memo,
        staffId: null,
        staffName: null,
        gEventId: item.gEventId ?? null,
        gUpdated: item.gUpdated ?? null,
        gWait,
        gWaitAt: item.gWaitAt !== undefined ? item.gWaitAt : gWait ? stamp() : null,
      }
    } else {
      if (db.allday.some((r) => r.type === 'off' && r.day === item.day && r.staffId === item.staffId)) throw new MemoryDbError('같은 (날, 사람) off')
      row = { id: newId('d0000000'), day: item.day, type: 'off', memo: null, staffId: item.staffId, staffName: item.staffName, ...(item.part ? { part: item.part } : {}) }
    }
    db.allday.push(row)
    offWait(row)
    return copy(row)
  }
  function seedAllDay(row: Partial<CalAllDay> & Pick<CalAllDay, 'day' | 'type'>): CalAllDay {
    return insertAllDay({ memo: null, staffId: null, staffName: null, ...row })
  }

  const byDayStart = (a: CalAppt, b: CalAppt) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.start - b.start || (a.id < b.id ? -1 : 1))
  const byWait = <T extends { gWaitAt?: string | null; id: string }>(a: T, b: T) =>
    (a.gWaitAt ?? '') < (b.gWaitAt ?? '') ? -1 : (a.gWaitAt ?? '') > (b.gWaitAt ?? '') ? 1 : a.id < b.id ? -1 : 1
  const findAppt = (id: string) => db.appts.findIndex((a) => a.id === id)

  const impl: GcalStore = {
    loadLink: async () => copy(db.link),
    loadState: async () => copy(db.state),
    loadParts: async () => copy(mem.parts),
    advancePulled: async (at) => {
      const old = toMs(db.state.pulledUntil)
      const neu = toMs(at)
      if (neu === null) throw new MemoryDbError('시각 모양')
      if (old === null || neu > old) db.state.pulledUntil = at
    },
    markFail: async (code, at) => {
      db.state.failCode = code
      if (db.state.failSince === null) db.state.failSince = at
    },
    markOk: async (at) => {
      Object.assign(db.state, { lastOkAt: at, failSince: null, failCode: null })
    },
    setLinkedOn: async (day) => {
      db.link.linkedOn = day
    },
    listAppts: async (from, to) => copy(db.appts.filter((a) => a.day >= from && a.day <= to).sort(byDayStart)),
    findAppts: async (ids) => copy(db.appts.filter((a) => a.gEventId !== null && ids.includes(a.gEventId)).sort((a, b) => (a.id < b.id ? -1 : 1))),
    listWaitingAppts: async (fromDay) => copy(db.appts.filter((a) => a.gWait !== null && a.day >= fromDay).sort(byWait)),
    updateAppt: async (id, patch) => {
      if (unsafe(patch.name) || unsafe(patch.memo)) return 'blocked'
      staffTrio(patch)
      const at = findAppt(id)
      if (at < 0) throw new MemoryDbError('없는 예약')
      if (patch.gEventId && db.appts.some((a) => a.id !== id && a.gEventId === patch.gEventId)) throw new MemoryDbError('같은 g_event_id')
      db.appts[at] = apptUpdate(db.appts[at], patch as Partial<CalAppt>)
      return copy(db.appts[at])
    },
    applyAppt: async (id, patch, gUpdated, expectWaitAt) => {
      if (unsafe(patch.name) || unsafe(patch.memo)) return 'blocked'
      staffTrio(patch)
      const at = findAppt(id)
      if (at < 0) return null
      const row = db.appts[at]
      if (!later(row.gUpdated, gUpdated) || row.gWaitAt !== expectWaitAt) return null
      db.appts[at] = apptUpdate(row, { ...(patch as Partial<CalAppt>), gUpdated })
      return copy(db.appts[at])
    },
    insertAppts: async (rows) => {
      let blocked = 0
      let sent = 0
      for (const r of rows) {
        if (!r.gEventId) throw new MemoryDbError('구글 일정 id 없음')
        if (unsafe(r.name) || unsafe(r.memo)) {
          blocked++
          continue
        }
        sent++
        if (db.appts.some((a) => a.gEventId === r.gEventId)) continue // on conflict do nothing
        seedAppt({ ...(copy(r) as Partial<CalAppt> & Pick<CalAppt, 'day' | 'start' | 'name'>), gTitle: safeTitle(r.gTitle) ?? null })
      }
      return { sent, blocked }
    },
    markApptSent: async (id, sent, expectWaitAt) => {
      const at = findAppt(id)
      if (at < 0 || db.appts[at].gWaitAt !== expectWaitAt) return false
      const patch: Partial<CalAppt> = { gWait: null }
      if (sent.gUpdated !== undefined) patch.gUpdated = sent.gUpdated
      if (sent.gTitle !== undefined) patch.gTitle = sent.gTitle
      if (sent.gGone !== undefined) patch.gGone = sent.gGone
      db.appts[at] = apptUpdate(db.appts[at], patch)
      return true
    },
    deleteAppt: async (id) => {
      const at = findAppt(id)
      if (at < 0) return
      const [old] = db.appts.splice(at, 1)
      if (old.gEventId && old.day >= yearAgo() && !db.deletes.some((d) => d.gEventId === old.gEventId && d.day === old.day)) {
        db.deletes.push({ gEventId: old.gEventId, day: old.day, kind: 'appt', label: old.gTitle, at: stamp() })
      }
    },
    listAllDay: async (from, to) => copy(db.allday.filter((r) => r.day >= from && r.day <= to).sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))),
    addAllDay: async (item) => {
      if (item.type === 'memo') {
        const memo = (item.memo ?? '').trim()
        if (privacyProblem(memo)) return 'blocked'
        if ([...memo].length < 1 || [...memo].length > 20) throw new MemoryDbError('메모 길이')
        return insertAllDay({ ...item, memo })
      }
      if (!item.staffId || !item.staffName || [...item.staffName].length > 10) throw new MemoryDbError('off 줄 칸')
      const { part: _part, ...rest } = item
      void _part
      return insertAllDay(rest)
    },
    applyMemo: async (id, patch, gUpdated, expectWaitAt) => {
      const row = db.allday.find((r) => r.id === id && r.type === 'memo')
      if (!row) return null
      const memo = patch.memo === undefined ? undefined : patch.memo.trim()
      if (memo !== undefined && privacyProblem(memo)) return 'blocked'
      if (!later(row.gUpdated ?? null, gUpdated) || (row.gWaitAt ?? null) !== expectWaitAt) return null
      const day = patch.day ?? row.day
      if (day !== row.day && db.allday.some((r) => r !== row && r.type === 'memo' && r.gEventId && r.gEventId === row.gEventId && r.day === day)) {
        throw new MemoryDbError('같은 (일정, 날) 메모')
      }
      const changed = day !== row.day || (memo !== undefined && memo !== row.memo)
      row.day = day
      if (memo !== undefined) row.memo = memo
      row.gUpdated = gUpdated
      if (!row.gWait) row.gWaitAt = null
      else if (changed) row.gWaitAt = stamp()
      return copy(row)
    },
    deleteAllDay: async (id) => {
      const at = db.allday.findIndex((r) => r.id === id)
      if (at < 0) return
      const [old] = db.allday.splice(at, 1)
      memoDeleted(old)
      offWait(old)
    },
    listWaitingMemos: async (fromDay) => copy(db.allday.filter((r) => r.type === 'memo' && r.gWait === true && r.day >= fromDay).sort(byWait)),
    markMemoSent: async (id, expectWaitAt, gUpdated) => {
      const row = db.allday.find((r) => r.id === id && r.type === 'memo')
      if (!row || (row.gWaitAt ?? null) !== expectWaitAt) return false
      row.gWait = false
      row.gWaitAt = null
      if (gUpdated !== undefined) row.gUpdated = gUpdated
      return true
    },
    listFixes: async (state) =>
      copy(db.fixes.filter((f) => state === undefined || f.state === state).sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.start - b.start || (a.id < b.id ? -1 : 1)))),
    upsertFixes: async (fixes) => {
      for (const f of fixes) {
        const g = f.guess ?? EMPTY_GUESS
        const clean: GcalFixInput = {
          ...copy(f),
          gTitle: maskText(f.gTitle, 200),
          guess: {
            ...g,
            name: g.name === null ? null : maskText(g.name, 20) || null,
            memo: g.memo === null ? null : maskText(g.memo, 100) || null,
            word: g.word === null ? null : maskText(g.word, 40) || null,
          },
        }
        const found = db.fixes.find((x) => x.gEventId === f.gEventId && x.day === f.day)
        if (found) Object.assign(found, clean)
        else db.fixes.push({ id: newId('f0000000'), ...clean })
      }
    },
    deleteFix: async (id) => {
      db.fixes = db.fixes.filter((f) => f.id !== id)
    },
    listDeletes: async () =>
      [...db.deletes]
        .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.gEventId < b.gEventId ? -1 : a.gEventId > b.gEventId ? 1 : a.day < b.day ? -1 : 1))
        .map(({ at: _at, ...d }) => {
          void _at
          return copy(d)
        }),
    dropDelete: async (gEventId, day) => {
      db.deletes = db.deletes.filter((d) => !(d.gEventId === gEventId && d.day === day))
    },
    listOffDays: async (from, to) => copy(db.offDays.filter((o) => o.day >= from && o.day <= to).sort((a, b) => (a.day < b.day ? -1 : 1))),
    listWaitingOffDays: async () =>
      copy(db.offDays.filter((o) => o.wait).sort((a, b) => ((a.waitAt ?? '') < (b.waitAt ?? '') ? -1 : (a.waitAt ?? '') > (b.waitAt ?? '') ? 1 : a.day < b.day ? -1 : 1))),
    saveOffDay: async (off, expectWaitAt) => {
      const body = { gEventId: off.gEventId, gTitle: off.gTitle === null ? null : maskText(off.gTitle, 200), gUpdated: off.gUpdated, wait: off.wait }
      const found = db.offDays.find((o) => o.day === off.day)
      if (expectWaitAt === undefined) {
        if (found) Object.assign(found, body)
        else db.offDays.push({ day: off.day, ...body, waitAt: null })
        return true
      }
      if (!found || found.waitAt !== expectWaitAt) return false
      Object.assign(found, body)
      return true
    },
    rereadAppt: async (id, patch, expect) => {
      const keys = Object.keys(patch)
      if (!keys.length || keys.some((k) => !REREAD_KEYS.includes(k))) throw new MemoryDbError('다시 알아보기 칸')
      staffTrio(patch)
      const at = findAppt(id)
      if (at < 0) return false
      const row = db.appts[at]
      if (row.gWait !== null || row.gTitle !== expect.gTitle || row.gUpdated !== expect.gUpdated) return false
      db.appts[at] = apptUpdate(row, patch as Partial<CalAppt>)
      return true
    },
    setOffColor: async (color) => {
      if (!(G_COLORS as readonly unknown[]).includes(color)) throw new MemoryDbError('구글 11색 아님')
      db.link.look = { ...db.link.look, offColor: color }
      return true
    },
  }

  // 부른 함수·받은 값을 남긴다(받은 값은 그때 모양 그대로 베껴 둔다)
  const logged: Record<string, unknown> = {}
  for (const fn of Object.keys(impl) as (keyof GcalStore)[]) {
    const real = impl[fn] as (...args: unknown[]) => Promise<unknown>
    logged[fn] = (...args: unknown[]) => {
      mem.calls.push({ fn, args: copy(args) })
      return real(...args)
    }
  }
  mem.store = logged as unknown as GcalStore
  return mem
}
