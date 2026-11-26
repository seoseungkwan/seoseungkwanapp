// 구글 Apps Script 캘린더 고급 서비스(Calendar API v3)의 아주 작은 메모리 가짜. 예약 구글 코드(google-code/calendar/Code.gs)를 node:vm 안에서 돌린다.
// 흉내 내는 구글 동작(design.md 8-2가 기대는 것):
//  - Events.list(calendarId, opts): timeMin(끝이 그 뒤)·timeMax(시작이 그 앞)·singleEvents(반복 일정을 하나씩 펼침, id `<원래 id>_<시작>`)·
//    showDeleted(지운 일정 status 'cancelled')·updatedMin(그 뒤에 바뀐 것만, 지운 일정은 showDeleted와 상관없이 든다 — 구글 문서 그대로)·
//    maxResults(없으면 250, 가짜 쪽 크기 maxPage까지)·pageToken. updatedMin이 tooOldBefore보다 이르면 410(updatedMinTooLongAgo).
//    하루 종일 날짜는 캘린더 시간대(Asia/Seoul) 0시로 본다. 시각이 없는 지운 일정은 범위와 상관없이 든다.
//  - Events.get: 지운 일정도 돌려준다(status 'cancelled'), 없으면 404.
//  - Events.insert(resource, calendarId): 같은 id가 있으면(지운 것 포함) 409, id가 base32hex(0-9·a-v 5~1024자)가 아니면 400,
//    시작·끝이 없거나 빈 범위면 400. null 칸은 버린다.
//  - Events.patch(resource, calendarId, eventId): 준 칸만 고친다(start·end는 안 칸끼리 합치고 null은 지움, 겉 칸 null도 지움). 없으면 404.
//  - Events.remove: 지운 표시(status 'cancelled'), 없으면 404, 이미 지웠으면 410.
//  - 보기만(reader·freeBusyReader) 캘린더에 쓰면 403(writer 아님), 없는 캘린더는 404.
//  - 오류는 진짜 Apps Script처럼 'API call to calendar.<op> failed with error: <글>' + details {code, message, errors:[{reason}]}.
//  - CalendarList.list(maxResults·pageToken, 가짜 쪽 크기 calendarPage). LockService·ContentService·Utilities·console·Logger.
//  - Date.now()는 env.nowMs(시험이 정한 '구글 지금 시각'). 가짜의 일정 updated는 따로 도는 store.clockMs로 정한다.
// 구글을 부를 때마다 calls에 남고(쓰기는 그때 Lock을 쥐고 있었는지 heldLock과 함께), failOn으로 정한 오류를 던진다.
// 비밀 글자·환자 이름·캘린더 이름은 모두 지어낸 시험 값이다.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

export const CODE_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'calendar', 'Code.gs')
/** 지어낸 시험 비밀 글자(진짜 값 아님, base64url 꼴). */
export const TEST_KEY = 'FakeKey_0123456789-abcdefABCDEF-xyz'
/** 가짜 병원 캘린더(load가 owner로 넣어 둔다). */
export const CAL_ID = 'clinic-cal@group.calendar.fake.test'
export const CAL_NAME = '시험의원 예약'
/** 지어낸 병원 id(빼기 없는 32자). */
export const HOSPITAL = '0123456789abcdef0123456789abcdef'
/** 시험의 '구글 지금 시각' 기본값(한국 2026-11-26 10:00). */
export const NOW = '2026-11-26T10:00:00+09:00'

const KST = '+09:00'
const DAY_MS = 24 * 3600 * 1000
const NEW_ID_RE = /^[a-v0-9]{5,1024}$/

export interface FakeTime {
  date?: string
  dateTime?: string
  timeZone?: string
}

export interface FakeEvent {
  id: string
  status: 'confirmed' | 'tentative' | 'cancelled'
  summary?: string
  description?: string
  colorId?: string
  start?: FakeTime
  end?: FakeTime
  created?: string
  updated?: string
  recurrence?: string[]
  recurringEventId?: string
}

export type AccessRole = 'owner' | 'writer' | 'reader' | 'freeBusyReader'

export interface FakeCalendarMeta {
  id: string
  summary: string
  summaryOverride?: string
  accessRole: AccessRole
  backgroundColor: string
}

interface FakeCal extends FakeCalendarMeta {
  events: Map<string, FakeEvent>
}

type Json = Record<string, unknown>

export interface Call {
  api: string
  calendarId?: string
  eventId?: string
  opts?: Json
  resource?: Json
  /** 부를 때 스크립트 Lock을 쥐고 있었나 */
  heldLock: boolean
}

/** 진짜 Apps Script 고급 서비스 오류처럼 생긴 것. details: false면 글만(자세한 칸 없음). */
export function gError(code: number, reason: string, message: string, { op = 'events', details = true } = {}): Error {
  const err = new Error('API call to calendar.' + op + ' failed with error: ' + message) as Error & { details?: unknown }
  if (details) err.details = { code, message, errors: [{ domain: 'global', reason, message }] }
  return err
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

function timeMs(t: FakeTime | undefined): number | null {
  if (!t) return null
  if (typeof t.date === 'string') return Date.parse(t.date + 'T00:00:00' + KST) // 캘린더 시간대 Asia/Seoul
  if (typeof t.dateTime === 'string') return Date.parse(t.dateTime)
  return null
}

function isoNoMs(ms: number): string {
  return new Date(ms).toISOString().replace('.000Z', 'Z')
}

function compactUtc(ms: number): string {
  return isoNoMs(ms).replace(/[-:]/g, '')
}

function addDaysTo(t: FakeTime, days: number): FakeTime {
  if (typeof t.date === 'string') return { date: new Date(Date.parse(t.date + 'T00:00:00Z') + days * DAY_MS).toISOString().slice(0, 10) }
  return { ...t, dateTime: isoNoMs(Date.parse(String(t.dateTime)) + days * DAY_MS) }
}

/** singleEvents: 반복 일정(RRULE:FREQ=DAILY|WEEKLY;COUNT=n만)을 하나씩 펼친다. */
function expand(ev: FakeEvent): FakeEvent[] {
  const rule = (ev.recurrence ?? []).find((r) => r.startsWith('RRULE:'))
  if (!rule || !ev.start || !ev.end) return [ev]
  const m = /FREQ=(DAILY|WEEKLY);COUNT=(\d+)/.exec(rule)
  if (!m) throw new Error('fake: only FREQ=DAILY|WEEKLY;COUNT=n is faked')
  const step = m[1] === 'DAILY' ? 1 : 7
  const out: FakeEvent[] = []
  for (let i = 0; i < Number(m[2]); i++) {
    const start = addDaysTo(ev.start, i * step)
    const end = addDaysTo(ev.end, i * step)
    const suffix = typeof start.date === 'string' ? start.date.replace(/-/g, '') : compactUtc(Date.parse(String(start.dateTime)))
    const inst: FakeEvent = { ...clone(ev), id: ev.id + '_' + suffix, recurringEventId: ev.id, start, end }
    delete inst.recurrence
    out.push(inst)
  }
  return out
}

function stripNulls(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripNulls)
  if (v !== null && typeof v === 'object') {
    const out: Json = {}
    for (const [k, x] of Object.entries(v)) if (x !== null) out[k] = stripNulls(x)
    return out
  }
  return v
}

function pageOf<T>(items: T[], opts: Json, defaultSize: number, maxPage: number): { items: T[]; nextPageToken?: string } {
  const size = Math.min(opts.maxResults === undefined ? defaultSize : Number(opts.maxResults), maxPage)
  let offset = 0
  if (opts.pageToken !== undefined) {
    const m = /^page:(\d+)$/.exec(String(opts.pageToken))
    if (!m) throw gError(400, 'invalid', 'Invalid page token value.')
    offset = Number(m[1])
  }
  const out: { items: T[]; nextPageToken?: string } = { items: items.slice(offset, offset + size) }
  if (offset + size < items.length) out.nextPageToken = 'page:' + (offset + size)
  return out
}

export interface Env {
  /** 구글 지금 시각(Date.now()). */
  nowMs: number
  /** 스크립트 Lock을 잡을 수 있나(false면 tryLock이 30초 뒤 false). */
  lockFree: boolean
  locked: boolean
  lockTries: number
  lockWaits: number[]
  releases: number
  sleeps: number[]
  /** 코드가 console·Logger로 남긴 기록(1판은 하나도 남기지 않아야 한다). */
  logs: string[]
}

export class FakeCalendarStore {
  calendars = new Map<string, FakeCal>()
  calls: Call[] = []
  /** 가짜 구글이 일정 created·updated에 쓰는 시계(쓸 때마다 1초씩 간다). */
  clockMs = Date.parse('2026-11-25T00:00:00Z')
  /** updatedMin이 이보다 이르면 410(updatedMinTooLongAgo). */
  tooOldBefore: number | null = null
  /** Events.list 한 쪽의 가짜 최대(진짜는 2500). */
  maxPage = 2500
  /** CalendarList.list 한 쪽의 가짜 최대. */
  calendarPage = 250
  private failures: { api: string; err: unknown }[] = []
  private seq = 0

  constructor(private env: Env) {}

  tick(): string {
    this.clockMs += 1000
    return new Date(this.clockMs).toISOString()
  }

  addCalendar(meta: FakeCalendarMeta): void {
    this.calendars.set(meta.id, { ...meta, events: new Map() })
  }

  /** 일정 넣기(시험 준비). updated: ''면 updated 칸 없이 둔다. */
  add(calendarId: string, ev: Partial<FakeEvent> & { id: string }): FakeEvent {
    const cal = this.calendars.get(calendarId)
    if (!cal) throw new Error('fake: no calendar ' + calendarId)
    const at = this.tick()
    const stored: FakeEvent = { status: 'confirmed', created: at, updated: at, ...clone(ev) }
    if (stored.updated === '') delete stored.updated
    cal.events.set(stored.id, stored)
    return stored
  }

  /** 한국 시각 'YYYY-MM-DDTHH:mm' 일정. */
  timed(id: string, start: string, end: string, extra: Partial<FakeEvent> = {}, calendarId = CAL_ID): FakeEvent {
    return this.add(calendarId, {
      id,
      start: { dateTime: start + ':00' + KST, timeZone: 'Asia/Seoul' },
      end: { dateTime: end + ':00' + KST, timeZone: 'Asia/Seoul' },
      ...extra,
    })
  }

  /** 하루 종일 일정 [startDay, endDay) — 끝은 다음 날(구글과 같음). */
  allDay(id: string, startDay: string, endDay: string, extra: Partial<FakeEvent> = {}, calendarId = CAL_ID): FakeEvent {
    return this.add(calendarId, { id, start: { date: startDay }, end: { date: endDay }, ...extra })
  }

  event(id: string, calendarId = CAL_ID): FakeEvent | undefined {
    return this.calendars.get(calendarId)?.events.get(id)
  }

  /** 지우지 않은 일정. */
  live(calendarId = CAL_ID): FakeEvent[] {
    return [...(this.calendars.get(calendarId)?.events.values() ?? [])].filter((e) => e.status !== 'cancelled')
  }

  /** 쓰기 부르기(insert·patch·remove)만. */
  writes(): Call[] {
    return this.calls.filter((c) => c.api === 'Events.insert' || c.api === 'Events.patch' || c.api === 'Events.remove')
  }

  /** 다음 번 그 부르기(api 이름, 예: 'Events.list')에서 err를 던진다(한 번). */
  failOn(api: string, err: unknown): void {
    this.failures.push({ api, err })
  }

  private record(call: Omit<Call, 'heldLock'>): void {
    this.calls.push({ ...call, heldLock: this.env.locked })
    const i = this.failures.findIndex((f) => f.api === call.api)
    if (i >= 0) {
      const [f] = this.failures.splice(i, 1)
      throw f.err
    }
  }

  private cal(calendarId: string, op: string): FakeCal {
    const cal = this.calendars.get(String(calendarId))
    if (!cal) throw gError(404, 'notFound', 'Not Found', { op })
    return cal
  }

  private writable(cal: FakeCal, op: string): void {
    if (cal.accessRole !== 'owner' && cal.accessRole !== 'writer') {
      throw gError(403, 'requiredAccessLevel', 'You need to have writer access to this calendar.', { op })
    }
  }

  private checkTimes(ev: FakeEvent, op: string): void {
    const s = timeMs(ev.start)
    const e = timeMs(ev.end)
    if (s === null || e === null) throw gError(400, 'required', 'Missing end time.', { op })
    if (!(e > s)) throw gError(400, 'timeRangeEmpty', 'The specified time range is empty.', { op })
  }

  api() {
    return {
      Events: {
        list: (calendarId: string, opts: Json = {}) => {
          this.record({ api: 'Events.list', calendarId, opts: { ...opts } })
          const cal = this.cal(calendarId, 'events.list')
          let updMin: number | null = null
          if (opts.updatedMin !== undefined) {
            updMin = Date.parse(String(opts.updatedMin))
            if (isNaN(updMin)) throw gError(400, 'invalid', 'Invalid value for: updatedMin', { op: 'events.list' })
            if (this.tooOldBefore !== null && updMin < this.tooOldBefore) {
              throw gError(410, 'updatedMinTooLongAgo', 'The requested minimum modification time lies too far in the past.', { op: 'events.list' })
            }
          }
          const min = opts.timeMin === undefined ? null : Date.parse(String(opts.timeMin))
          const max = opts.timeMax === undefined ? null : Date.parse(String(opts.timeMax))
          const all: FakeEvent[] = []
          for (const ev of cal.events.values()) all.push(...(opts.singleEvents ? expand(ev) : [ev]))
          const items = all.filter((ev) => {
            const deleted = ev.status === 'cancelled'
            if (deleted && !opts.showDeleted && updMin === null) return false
            if (updMin !== null && ev.updated && Date.parse(ev.updated) < updMin) return false
            const s = timeMs(ev.start)
            const e = timeMs(ev.end)
            if (s === null || e === null) return deleted
            if (min !== null && !(e > min)) return false
            if (max !== null && !(s < max)) return false
            return true
          })
          items.sort((a, b) => (timeMs(a.start) ?? -Infinity) - (timeMs(b.start) ?? -Infinity) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
          const page = pageOf(items, opts, 250, this.maxPage)
          return { kind: 'calendar#events', ...page, items: page.items.map((e) => clone(e)) }
        },
        get: (calendarId: string, eventId: string) => {
          this.record({ api: 'Events.get', calendarId, eventId })
          const ev = this.cal(calendarId, 'events.get').events.get(String(eventId))
          if (!ev) throw gError(404, 'notFound', 'Not Found', { op: 'events.get' })
          return clone(ev)
        },
        insert: (resource: Json, calendarId: string) => {
          this.record({ api: 'Events.insert', calendarId, resource: clone(resource) })
          const cal = this.cal(calendarId, 'events.insert')
          this.writable(cal, 'events.insert')
          let id: string
          if (resource.id !== undefined) {
            id = String(resource.id)
            if (!NEW_ID_RE.test(id)) throw gError(400, 'invalid', 'Invalid resource id value.', { op: 'events.insert' })
            if (cal.events.has(id)) throw gError(409, 'duplicate', 'The requested identifier already exists.', { op: 'events.insert' })
          } else {
            id = 'g' + String(++this.seq).padStart(8, '0')
          }
          const at = this.tick()
          const ev = { status: 'confirmed', ...(stripNulls(resource) as Json), id, created: at, updated: at } as FakeEvent
          this.checkTimes(ev, 'events.insert')
          cal.events.set(id, ev)
          return clone(ev)
        },
        patch: (resource: Json, calendarId: string, eventId: string) => {
          this.record({ api: 'Events.patch', calendarId, eventId, resource: clone(resource) })
          const cal = this.cal(calendarId, 'events.patch')
          this.writable(cal, 'events.patch')
          const cur = cal.events.get(String(eventId))
          if (!cur) throw gError(404, 'notFound', 'Not Found', { op: 'events.patch' })
          const next = clone(cur) as unknown as Json
          for (const [k, v] of Object.entries(resource)) {
            if (v === null) delete next[k]
            else if ((k === 'start' || k === 'end') && typeof v === 'object') {
              const merged: Json = { ...((next[k] as Json) ?? {}) }
              for (const [kk, vv] of Object.entries(v as Json)) {
                if (vv === null) delete merged[kk]
                else merged[kk] = vv
              }
              next[k] = merged
            } else next[k] = clone(v)
          }
          next.updated = this.tick()
          const ev = next as unknown as FakeEvent
          this.checkTimes(ev, 'events.patch')
          cal.events.set(cur.id, ev)
          return clone(ev)
        },
        remove: (calendarId: string, eventId: string) => {
          this.record({ api: 'Events.remove', calendarId, eventId })
          const cal = this.cal(calendarId, 'events.delete')
          this.writable(cal, 'events.delete')
          const cur = cal.events.get(String(eventId))
          if (!cur) throw gError(404, 'notFound', 'Not Found', { op: 'events.delete' })
          if (cur.status === 'cancelled') throw gError(410, 'deleted', 'Resource has been deleted', { op: 'events.delete' })
          cur.status = 'cancelled'
          cur.updated = this.tick()
        },
      },
      CalendarList: {
        list: (opts: Json = {}) => {
          this.record({ api: 'CalendarList.list', opts: { ...opts } })
          const metas = [...this.calendars.values()].map(({ events: _events, ...meta }) => {
            void _events
            return { kind: 'calendar#calendarListEntry', ...clone(meta) }
          })
          return { kind: 'calendar#calendarList', ...pageOf(metas, opts, 100, this.calendarPage) }
        },
      },
    }
  }
}

class TextOutput {
  mime: string | null = null
  constructor(public content: string) {}
  setMimeType(m: string): this {
    this.mime = m
    return this
  }
  getContent(): string {
    return this.content
  }
  getMimeType(): string | null {
    return this.mime
  }
}

/** 구글 코드 답(JSON). 시험이 읽는 칸을 모두 적는다 — 답 종류마다 없는 칸은 undefined다. */
export interface GEvent {
  id: string
  status: 'confirmed' | 'cancelled'
  summary: string
  description: string
  allDay: boolean
  start: string | null
  end: string | null
  colorId: string | null
  updated: string
  recurring: boolean
}

export interface CalInfo {
  id: string
  name: string
  access: string
  hex: string | null
  past: number | null
  future: number | null
}

export interface Reply {
  ok: boolean
  version: string
  error: string
  code: string
  message: string
  now: string
  calendars: CalInfo[]
  events: GEvent[]
  event: GEvent | null
  next: string | null
}

export interface App {
  ctx: vm.Context
  env: Env
  store: FakeCalendarStore
  key: string
  post(body: unknown): Reply
  postRaw(contents: string): Reply
  get(): { content: string; mime: string | null }
}

export interface LoadOptions {
  /** 비밀 글자 자리에 끼울 열쇠(웹앱 [구글 코드 복사]처럼). */
  key?: string
  /** false면 자리 글자를 바꾸지 않는다. */
  replaceKey?: boolean
  /** true면 캘린더 고급 서비스(Calendar)를 두지 않는다(편집기에서 서비스를 안 켬). */
  noService?: boolean
  /** 구글 지금 시각. */
  now?: string
  /** Code.gs 대신 돌릴 코드 글. */
  source?: string
}

/** Code.gs(또는 source)를 불러온다. 가짜 병원 캘린더(CAL_ID, owner)를 하나 넣어 둔다. */
export function load({ key = TEST_KEY, replaceKey = true, noService = false, now = NOW, source }: LoadOptions = {}): App {
  let src = source ?? fs.readFileSync(CODE_PATH, 'utf8')
  if (replaceKey) src = src.replace('__KEY__', () => key)
  const env: Env = { nowMs: Date.parse(now), lockFree: true, locked: false, lockTries: 0, lockWaits: [], releases: 0, sleeps: [], logs: [] }
  const store = new FakeCalendarStore(env)
  store.addCalendar({ id: CAL_ID, summary: CAL_NAME, accessRole: 'owner', backgroundColor: '#4285f4' })
  const record = (...args: unknown[]) => {
    env.logs.push(args.map(String).join(' '))
  }
  class FakeDate extends Date {
    static now(): number {
      return env.nowMs
    }
  }
  const globals: Json = {
    Date: FakeDate,
    LockService: {
      getScriptLock: () => ({
        tryLock: (ms: number) => {
          env.lockTries++
          env.lockWaits.push(ms)
          if (!env.lockFree) return false
          env.locked = true
          return true
        },
        waitLock: (ms: number) => {
          env.lockTries++
          env.lockWaits.push(ms)
          if (!env.lockFree) throw new Error('Lock timeout: another process was holding the lock for too long.')
          env.locked = true
        },
        releaseLock: () => {
          env.releases++
          env.locked = false
        },
        hasLock: () => env.locked,
      }),
    },
    ContentService: {
      MimeType: { JSON: 'JSON', TEXT: 'TEXT' },
      createTextOutput: (s: string) => new TextOutput(s),
    },
    Utilities: {
      sleep: (ms: number) => {
        env.sleeps.push(ms)
      },
    },
    Logger: { log: record },
    console: { log: record, info: record, warn: record, error: record },
  }
  if (!noService) globals.Calendar = store.api()
  const ctx = vm.createContext(globals)
  vm.runInContext(src, ctx, { filename: 'Code.gs' })
  function postRaw(contents: string): Reply {
    const out = ctx.doPost({ postData: { contents, type: 'text/plain' } })
    if (out.getMimeType() !== 'JSON') throw new Error('doPost did not answer JSON')
    return JSON.parse(out.getContent())
  }
  return {
    ctx,
    env,
    store,
    key,
    post: (body: unknown) => postRaw(JSON.stringify(body)),
    postRaw,
    get: () => {
      const out = ctx.doGet()
      return { content: out.getContent(), mime: out.getMimeType() }
    },
  }
}
