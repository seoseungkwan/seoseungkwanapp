// 예약 구글 코드 1판 시험(design.md 8-2): 비밀 글자 · ping · list/changes · put · remove/dropDay/off · 오류.
// 진짜 구글에 붙지 않는다(가짜 캘린더 fakeCalendar.ts를 vm으로). 비밀 글자·환자 이름·캘린더 이름은 모두 지어낸 시험 값이다.

import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { type App, CAL_ID, CODE_PATH, type FakeEvent, gError, HOSPITAL, load, type Reply, TEST_KEY } from './fakeCalendar'

const ACTIONS = ['ping', 'list', 'changes', 'put', 'remove', 'dropDay', 'off']
const OFF_26 = 'sskoff' + HOSPITAL + '20261126'
const OFF_27 = 'sskoff' + HOSPITAL + '20261127'
const OFF_29 = 'sskoff' + HOSPITAL + '20261129'
const NEW_ID = 'ssk' + 'fedcba9876543210fedcba9876543210'
const FULL = { summary: '1234 홍길동 도수 30분 (호)', description: '허리', start: '2026-11-27T14:05', end: '2026-11-27T14:35', allDay: false, colorId: '1' }

function call(app: App, action: string, extra: Record<string, unknown> = {}): Reply {
  return app.post({ key: app.key, action, calendarId: CAL_ID, ...extra })
}

function offArgs(extra: Record<string, unknown> = {}) {
  return { day: '2026-11-26', newId: OFF_26, offWord: 'off', title: '정호연 off', colorId: '3', ...extra }
}

const failOf = (code: string) => ({ ok: false, version: '1', error: code, code, message: expect.any(String) })
const lastWrite = (app: App) => app.store.writes()[app.store.writes().length - 1]
const byStart = (list: FakeEvent[]) =>
  list.slice().sort((a, b) => String(a.start?.date ?? a.start?.dateTime).localeCompare(String(b.start?.date ?? b.start?.dateTime)))

/** 모든 action이 받는 맞는 모양의 요청(그 action의 오류 시험용). */
function validArgs(action: string): Record<string, unknown> {
  const map: Record<string, Record<string, unknown>> = {
    ping: {},
    list: { from: '2026-11-26', to: '2026-12-01' },
    changes: { since: '2026-11-26T00:00:00Z', from: '2026-11-26' },
    put: { id: 'evt0001', fields: { colorId: '2' } },
    remove: { id: 'evt0001' },
    dropDay: { id: 'memo001', day: '2026-11-26' },
    off: offArgs(),
  }
  return map[action]
}

describe('AC-8507.1: 비밀 글자 — 자리 그대로면 token_not_set, 틀리면 bad_token, 자료는 하나도 내지 않는다', () => {
  it('AC-8507.1: 비밀 글자 자리 __KEY__는 파일에 한 번만, 판 글자는 1, doGet은 짧은 글만', () => {
    const src = fs.readFileSync(CODE_PATH, 'utf8')
    expect(src.split('__KEY__').length - 1).toBe(1)
    expect(src).toMatch(/^const KEY = '__KEY__';$/m)
    expect(src).toMatch(/^const CAL_VERSION = '1';$/m)
    const app = load()
    expect(app.get()).toEqual({ content: 'Seoseungkwan calendar ok', mime: 'TEXT' })
    expect(app.store.calls).toEqual([])
  })

  it('AC-8507.1: 자리 글자 그대로(또는 16자보다 짧음)면 어느 action이든 token_not_set이고 캘린더를 부르지 않는다', () => {
    for (const app of [load({ replaceKey: false }), load({ key: 'short-key' })]) {
      app.store.timed('evt0001', '2026-11-26T09:00', '2026-11-26T09:30', { summary: '1234 홍길동 도수 (호)' })
      for (const action of ACTIONS) {
        // 자리 글자 그 자체('__KEY__')를 열쇠로 보내도 열리지 않는다
        for (const key of [app.key, '__KEY__', undefined]) {
          const res = app.post({ key, action, calendarId: CAL_ID, ...validArgs(action) })
          expect(res, action).toEqual(failOf('token_not_set'))
        }
      }
      expect(app.store.calls).toEqual([])
      expect(app.env.lockTries).toBe(0)
    }
  })

  it('AC-8507.1: 틀린 열쇠·빈 열쇠·글자가 아닌 열쇠는 bad_token(수납 코드와 같은 이름)이고 캘린더를 부르지 않는다', () => {
    const app = load()
    app.store.timed('evt0001', '2026-11-26T09:00', '2026-11-26T09:30', { summary: '1234 홍길동 도수 (호)' })
    const wrong = [TEST_KEY.slice(0, -1) + '0', TEST_KEY + 'x', TEST_KEY.slice(1), '', undefined, null, 12345, [TEST_KEY], { k: TEST_KEY }]
    for (const action of ACTIONS) {
      for (const key of wrong) {
        const res = app.post({ key, action, calendarId: CAL_ID, ...validArgs(action) })
        expect(res, action + ' ' + JSON.stringify(key)).toEqual(failOf('bad_token'))
      }
    }
    // 수납 코드처럼 token 칸으로 보내도 받지 않는다(예약 코드는 key 칸)
    expect(app.post({ token: TEST_KEY, action: 'ping' })).toEqual(failOf('bad_token'))
    expect(app.store.calls).toEqual([])
    expect(app.env.lockTries).toBe(0)
  })

  it('AC-8507.1: JSON이 아니거나 모르는 action이면 bad_request, 맞는 열쇠·action이면 판 1로 답한다', () => {
    const app = load()
    for (const raw of ['', 'not json', '[1,2]', 'null', '"text"']) expect(app.postRaw(raw), raw).toEqual(failOf('bad_request'))
    for (const action of [undefined, '', 'hello', 'write', 'months', 'PING', 'toString', '__proto__', 'constructor']) {
      expect(call(app, action as string), String(action)).toEqual(failOf('bad_request'))
    }
    expect(app.store.calls).toEqual([])
    expect(call(app, 'ping')).toMatchObject({ ok: true, version: '1' })
  })
})

describe('AC-8507.2: ping — 판 1 · 구글 지금 시각 · 캘린더 목록(고칠 수 있는 것만 지난 1년·앞으로 수)', () => {
  it('AC-8507.2: 캘린더마다 id·이름·권한·바탕 hex, owner·writer만 지난 1년·앞으로 수, 보기만 되면 수 없음', () => {
    const app = load() // 오늘 = 2026-11-26(한국)
    const holiday = 'ko.south_korea#holiday@group.v.calendar.fake.test'
    app.store.addCalendar({ id: 'desk@fake.test', summary: 'desk@fake.test', summaryOverride: '데스크 메모', accessRole: 'writer', backgroundColor: '#16a765' })
    app.store.addCalendar({ id: holiday, summary: '대한민국의 휴일', accessRole: 'reader', backgroundColor: '#e6c800' })
    app.store.addCalendar({ id: 'busy@fake.test', summary: '다른 사람', accessRole: 'freeBusyReader', backgroundColor: '#9fc6e7' })
    // 지난 1년 = [2025-11-26 0시, 2026-11-26 0시)
    app.store.timed('p000000', '2025-11-25T23:00', '2025-11-25T23:30') // 지난 1년 앞 — 세지 않음
    app.store.timed('p000001', '2025-11-26T09:00', '2025-11-26T09:30')
    app.store.allDay('p000002', '2026-11-25', '2026-11-26', { summary: '원장님 학회' })
    app.store.timed('p000003', '2026-11-10T10:00', '2026-11-10T10:10', { recurrence: ['RRULE:FREQ=DAILY;COUNT=2'] }) // 반복은 하나씩
    app.store.timed('p000004', '2026-11-20T10:00', '2026-11-20T10:10', { status: 'cancelled' }) // 지운 일정은 세지 않음
    // 앞으로 = [2026-11-26 0시, 2028-11-26 0시)
    app.store.timed('f000001', '2026-11-26T09:00', '2026-11-26T09:30')
    app.store.timed('f000002', '2028-11-25T09:00', '2028-11-25T09:30')
    app.store.timed('f000003', '2028-11-26T09:00', '2028-11-26T09:30') // 앞으로 끝 — 세지 않음
    app.store.allDay('f000004', '2026-12-01', '2026-12-02')
    app.store.timed('d000001', '2026-12-01T10:00', '2026-12-01T10:30', {}, 'desk@fake.test')
    app.store.allDay('h000001', '2026-12-25', '2026-12-26', { summary: '기독탄신일' }, holiday)

    const res = call(app, 'ping')
    expect(res).toEqual({
      ok: true,
      version: '1',
      now: '2026-11-26T01:00:00.000Z',
      calendars: [
        { id: CAL_ID, name: '시험의원 예약', access: 'owner', hex: '#4285F4', past: 4, future: 3 },
        { id: 'desk@fake.test', name: '데스크 메모', access: 'writer', hex: '#16A765', past: 0, future: 1 },
        { id: holiday, name: '대한민국의 휴일', access: 'reader', hex: '#E6C800', past: null, future: null },
        { id: 'busy@fake.test', name: '다른 사람', access: 'freeBusyReader', hex: '#9FC6E7', past: null, future: null },
      ],
    })
    const lists = app.store.calls.filter((c) => c.api === 'Events.list')
    // 보기만 되는 캘린더 일정은 읽지 않는다
    expect(lists.map((c) => c.calendarId)).toEqual([CAL_ID, CAL_ID, 'desk@fake.test', 'desk@fake.test'])
    const common = { singleEvents: true, showDeleted: false, maxResults: 2500 }
    expect(lists[0].opts).toMatchObject({ ...common, timeMin: '2025-11-26T00:00:00+09:00', timeMax: '2026-11-26T00:00:00+09:00' })
    expect(lists[1].opts).toMatchObject({ ...common, timeMin: '2026-11-26T00:00:00+09:00', timeMax: '2028-11-26T00:00:00+09:00' })
    expect(app.store.writes()).toEqual([])
    expect(app.env.lockTries).toBe(0)
  })

  it('AC-8507.2: 셈은 10,000에서 멈추고(쪽을 더 읽지 않음), 캘린더 목록은 쪽마다 끝까지 읽는다', () => {
    const app = load()
    for (let i = 0; i < 10500; i++) app.store.timed('bulk' + i, '2026-03-01T09:00', '2026-03-01T09:10')
    app.store.calendarPage = 1
    app.store.addCalendar({ id: 'second@fake.test', summary: '두 번째', accessRole: 'owner', backgroundColor: '#7986cb' })
    const res = call(app, 'ping')
    expect(res.calendars.map((c) => [c.id, c.past, c.future])).toEqual([
      [CAL_ID, 10000, 0],
      ['second@fake.test', 0, 0],
    ])
    const pastPages = app.store.calls.filter((c) => c.api === 'Events.list' && c.calendarId === CAL_ID && c.opts?.timeMax === '2026-11-26T00:00:00+09:00')
    expect(pastPages).toHaveLength(4)
    expect(pastPages.map((c) => c.opts?.pageToken)).toEqual([undefined, 'page:2500', 'page:5000', 'page:7500'])
    expect(app.store.calls.filter((c) => c.api === 'CalendarList.list').map((c) => c.opts?.pageToken)).toEqual([undefined, 'page:1'])
  })
})

describe('AC-8507.3: list·changes — 일정 모양(한국 시각·colorId·updated·설명 500자) · 반복 펼침 · 쪽마다 2,500개 · 다음 쪽', () => {
  it('AC-8507.3: list는 고른 범위의 지우지 않은 일정을 한국 시각 모양으로, 반복 일정은 하나씩 펼쳐 준다', () => {
    const app = load()
    app.store.add(CAL_ID, {
      id: 'utc0001',
      summary: '1234 홍길동 도수 30분 (호)',
      description: '가'.repeat(600),
      colorId: '7',
      start: { dateTime: '2026-11-27T00:05:00Z' },
      end: { dateTime: '2026-11-27T00:35:00Z' },
      updated: '2026-11-25T08:00:00.123Z',
    })
    app.store.add(CAL_ID, {
      id: 'tz00001',
      status: 'tentative',
      start: { dateTime: '2026-11-28T14:00:00+09:00', timeZone: 'Asia/Seoul' },
      end: { dateTime: '2026-11-28T14:20:00+09:00', timeZone: 'Asia/Seoul' },
    })
    app.store.allDay('memo001', '2026-11-30', '2026-12-02', { summary: '원장님 학회', colorId: '3' })
    app.store.timed('rep0001', '2026-11-27T10:00', '2026-11-27T10:10', { summary: '5521 최시안 (4000타)', recurrence: ['RRULE:FREQ=WEEKLY;COUNT=2'] })
    app.store.timed('gone001', '2026-11-29T09:00', '2026-11-29T09:30', { status: 'cancelled' })
    app.store.timed('out0001', '2026-12-10T09:00', '2026-12-10T09:30')

    const res = call(app, 'list', { from: '2026-11-26', to: '2026-12-06' })
    const upd = (id: string) => app.store.event(id)?.updated
    expect(res).toEqual({
      ok: true,
      version: '1',
      now: '2026-11-26T01:00:00.000Z',
      next: null,
      events: [
        {
          id: 'utc0001',
          status: 'confirmed',
          summary: '1234 홍길동 도수 30분 (호)',
          description: '가'.repeat(500),
          allDay: false,
          start: '2026-11-27T09:05',
          end: '2026-11-27T09:35',
          colorId: '7',
          updated: '2026-11-25T08:00:00.123Z',
          recurring: false,
        },
        {
          id: 'rep0001_20261127T010000Z',
          status: 'confirmed',
          summary: '5521 최시안 (4000타)',
          description: '',
          allDay: false,
          start: '2026-11-27T10:00',
          end: '2026-11-27T10:10',
          colorId: null,
          updated: upd('rep0001'),
          recurring: true,
        },
        { id: 'tz00001', status: 'confirmed', summary: '', description: '', allDay: false, start: '2026-11-28T14:00', end: '2026-11-28T14:20', colorId: null, updated: upd('tz00001'), recurring: false },
        { id: 'memo001', status: 'confirmed', summary: '원장님 학회', description: '', allDay: true, start: '2026-11-30', end: '2026-12-02', colorId: '3', updated: upd('memo001'), recurring: false },
        {
          id: 'rep0001_20261204T010000Z',
          status: 'confirmed',
          summary: '5521 최시안 (4000타)',
          description: '',
          allDay: false,
          start: '2026-12-04T10:00',
          end: '2026-12-04T10:10',
          colorId: null,
          updated: upd('rep0001'),
          recurring: true,
        },
      ],
    })
    const opts = app.store.calls.filter((c) => c.api === 'Events.list')[0].opts
    expect(opts).toEqual({ timeMin: '2026-11-26T00:00:00+09:00', timeMax: '2026-12-06T00:00:00+09:00', singleEvents: true, showDeleted: false, maxResults: 2500 })
    expect(app.env.lockTries).toBe(0)
  })

  it('AC-8507.3: changes는 since 뒤에 바뀐 일정만, 지운 일정(cancelled)도 주고, from 0시 앞은 빼고 끝은 열려 있다', () => {
    const app = load()
    app.store.timed('old0001', '2026-11-27T09:00', '2026-11-27T09:30', { summary: '옛 예약', updated: '2026-11-26T00:00:00.000Z' })
    app.store.timed('new0001', '2026-11-27T11:00', '2026-11-27T11:30', { summary: '새 예약', updated: '2026-11-26T00:30:00.000Z' })
    app.store.timed('del0001', '2026-11-29T11:00', '2026-11-29T11:30', { summary: '지운 예약', status: 'cancelled', updated: '2026-11-26T00:40:00.000Z' })
    // 지운 일정은 칸이 비어 올 수 있다(시각·제목 없음, updated도 없으면 답의 now)
    app.store.add(CAL_ID, { id: 'del0002', status: 'cancelled', updated: '2026-11-26T00:41:00.000Z' })
    app.store.add(CAL_ID, { id: 'del0003', status: 'cancelled', updated: '' })
    app.store.timed('far0001', '2029-05-01T09:00', '2029-05-01T09:30', { updated: '2026-11-26T00:50:00.000Z' })
    app.store.timed('bef0001', '2026-11-20T09:00', '2026-11-20T09:30', { updated: '2026-11-26T00:50:00.000Z' })

    const res = call(app, 'changes', { since: '2026-11-26T09:20:00+09:00', from: '2026-11-26' })
    expect(res).toMatchObject({ ok: true, version: '1', now: '2026-11-26T01:00:00.000Z', next: null })
    expect(res.events.map((e) => [e.id, e.status])).toEqual([
      ['del0002', 'cancelled'],
      ['del0003', 'cancelled'],
      ['new0001', 'confirmed'],
      ['del0001', 'cancelled'],
      ['far0001', 'confirmed'],
    ])
    expect(res.events[0]).toEqual({
      id: 'del0002',
      status: 'cancelled',
      summary: '',
      description: '',
      allDay: false,
      start: null,
      end: null,
      colorId: null,
      updated: '2026-11-26T00:41:00.000Z',
      recurring: false,
    })
    expect(res.events[1].updated).toBe('2026-11-26T01:00:00.000Z')
    expect(res.events[3]).toMatchObject({ summary: '지운 예약', start: '2026-11-29T11:00', end: '2026-11-29T11:30' })
    const opts = app.store.calls.filter((c) => c.api === 'Events.list')[0].opts
    expect(opts).toEqual({ updatedMin: '2026-11-26T00:20:00.000Z', showDeleted: true, singleEvents: true, timeMin: '2026-11-26T00:00:00+09:00', maxResults: 2500 })
  })

  it('AC-8507.3: 쪽마다 2,500개까지 — 다음 쪽 표시(next)를 주고, 그 표시로 다음 쪽을 읽는다', () => {
    const app = load()
    app.store.maxPage = 2
    for (let i = 1; i <= 5; i++) app.store.timed('pg0000' + i, '2026-11-2' + (6 + (i % 3)) + 'T0' + i + ':00', '2026-11-2' + (6 + (i % 3)) + 'T0' + i + ':30')
    const range = { from: '2026-11-26', to: '2026-12-01' }
    const p1 = call(app, 'list', range)
    const p2 = call(app, 'list', { ...range, pageToken: p1.next })
    const p3 = call(app, 'list', { ...range, pageToken: p2.next })
    expect([p1.events.length, p2.events.length, p3.events.length]).toEqual([2, 2, 1])
    expect(typeof p1.next).toBe('string')
    expect(typeof p2.next).toBe('string')
    expect(p3.next).toBeNull()
    expect(new Set([...p1.events, ...p2.events, ...p3.events].map((e) => e.id)).size).toBe(5)
    const tokens = app.store.calls.filter((c) => c.api === 'Events.list').map((c) => c.opts)
    expect('pageToken' in (tokens[0] ?? {})).toBe(false)
    expect(tokens.slice(1).map((o) => o?.pageToken)).toEqual([p1.next, p2.next])
    // changes도 같은 쪽 표시
    const c1 = call(app, 'changes', { since: '2026-11-01T00:00:00Z', from: '2026-11-26' })
    expect(c1.events).toHaveLength(2)
    const c2 = call(app, 'changes', { since: '2026-11-01T00:00:00Z', from: '2026-11-26', pageToken: c1.next })
    expect(c2.events.map((e) => e.id)).toEqual(p2.events.map((e) => e.id))
  })

  it('AC-8507.3: changes의 since가 너무 오래되면(구글 410) too_old이고 일정은 주지 않는다', () => {
    const app = load()
    app.store.tooOldBefore = Date.parse('2026-11-01T00:00:00Z')
    app.store.timed('evt0001', '2026-11-27T09:00', '2026-11-27T09:30', { summary: '1234 홍길동 도수 (호)' })
    expect(call(app, 'changes', { since: '2026-10-01T00:00:00Z', from: '2026-11-26' })).toEqual(failOf('too_old'))
    // 자세한 칸이 없는 구글 오류 글이어도 410이면 too_old
    app.store.failOn('Events.list', gError(410, 'updatedMinTooLongAgo', 'The requested minimum modification time lies too far in the past.', { details: false }))
    expect(call(app, 'changes', { since: '2026-11-25T00:00:00Z', from: '2026-11-26' })).toEqual(failOf('too_old'))
    // list에는 too_old가 없다
    app.store.failOn('Events.list', gError(410, 'deleted', 'Resource has been deleted'))
    expect(call(app, 'list', { from: '2026-11-26', to: '2026-12-01' })).toEqual(failOf('failed'))
    expect(call(app, 'changes', { since: '2026-11-25T00:00:00Z', from: '2026-11-26' }).ok).toBe(true)
  })

  it('AC-8507.3: 범위·시각·쪽 표시 모양이 틀리면 bad_request이고 구글을 부르지 않는다', () => {
    const app = load()
    const bad: [string, Record<string, unknown>][] = [
      ['list', { from: '2026-11-26' }],
      ['list', { from: '2026-11-26', to: '2026-11-26' }],
      ['list', { from: '2026-12-01', to: '2026-11-26' }],
      ['list', { from: '2026-02-30', to: '2026-03-01' }],
      ['list', { from: '20261126', to: '2026-12-01' }],
      ['list', { from: '2026-11-26', to: '2026-12-01', calendarId: '' }],
      ['list', { from: '2026-11-26', to: '2026-12-01', calendarId: 42 }],
      ['list', { from: '2026-11-26', to: '2026-12-01', pageToken: 5 }],
      ['changes', { from: '2026-11-26' }],
      ['changes', { since: 'yesterday', from: '2026-11-26' }],
      ['changes', { since: '2026-11-26T99:00:00Z', from: '2026-11-26' }],
      ['changes', { since: '2026-11-26T00:00:00Z' }],
    ]
    for (const [action, extra] of bad) expect(call(app, action, extra), action + ' ' + JSON.stringify(extra)).toEqual(failOf('bad_request'))
    expect(app.store.calls).toEqual([])
  })
})

describe('AC-8507.4: put — 있으면 준 칸만 고치고(지운 일정은 되살림) 없으면 그 id로 만든다 · 두 번 보내도 하나 · Lock', () => {
  it('AC-8507.4: 없는 id면 그 id로 새로 만들고(한국 시각 → 구글 시각), 같은 put을 두 번 보내도 일정은 하나', () => {
    const app = load()
    const a = call(app, 'put', { id: NEW_ID, fields: FULL })
    expect(a).toEqual({
      ok: true,
      version: '1',
      event: {
        id: NEW_ID,
        status: 'confirmed',
        summary: FULL.summary,
        description: '허리',
        allDay: false,
        start: '2026-11-27T14:05',
        end: '2026-11-27T14:35',
        colorId: '1',
        updated: app.store.event(NEW_ID)?.updated,
        recurring: false,
      },
    })
    expect(app.store.event(NEW_ID)).toMatchObject({
      start: { dateTime: '2026-11-27T14:05:00+09:00', timeZone: 'Asia/Seoul' },
      end: { dateTime: '2026-11-27T14:35:00+09:00', timeZone: 'Asia/Seoul' },
    })
    const b = call(app, 'put', { id: NEW_ID, fields: FULL })
    expect(b.ok).toBe(true)
    expect(b.event?.id).toBe(NEW_ID)
    expect(app.store.live()).toHaveLength(1)
    expect(app.store.writes().map((w) => w.api)).toEqual(['Events.insert', 'Events.patch'])
    // 종일 일정도 같은 길(날짜는 그대로, 끝은 다음 날)
    const memoId = 'ssk' + '00000000000000000000000000000001'
    const m = call(app, 'put', { id: memoId, fields: { summary: '원장님 학회', allDay: true, start: '2026-11-30', end: '2026-12-02' } })
    expect(m.event).toMatchObject({ id: memoId, allDay: true, start: '2026-11-30', end: '2026-12-02', colorId: null })
    expect(app.store.event(memoId)?.start).toEqual({ date: '2026-11-30' })
  })

  it('AC-8507.4: 있는 일정은 준 칸만 고친다(색만·제목과 시각·색 지우기·종일로), 다른 칸은 그대로', () => {
    const app = load()
    app.store.timed('evt0001', '2026-11-27T09:00', '2026-11-27T09:30', { summary: '1234 홍길동 도수 30분 (호)', description: '허리', colorId: '5' })

    let res = call(app, 'put', { id: 'evt0001', fields: { colorId: '11' } })
    expect(lastWrite(app)).toMatchObject({ api: 'Events.patch', calendarId: CAL_ID, eventId: 'evt0001' })
    expect(lastWrite(app).resource).toEqual({ colorId: '11' })
    expect(app.store.event('evt0001')).toMatchObject({ summary: '1234 홍길동 도수 30분 (호)', description: '허리', colorId: '11' })
    expect(res.event).toMatchObject({ id: 'evt0001', colorId: '11', summary: '1234 홍길동 도수 30분 (호)', start: '2026-11-27T09:00', end: '2026-11-27T09:30', allDay: false })

    res = call(app, 'put', { id: 'evt0001', fields: { summary: '1234 홍길동 도수 50분 (호)', start: '2026-11-27T15:05', end: '2026-11-27T15:55', allDay: false } })
    expect(lastWrite(app).resource).toEqual({
      summary: '1234 홍길동 도수 50분 (호)',
      start: { dateTime: '2026-11-27T15:05:00+09:00', timeZone: 'Asia/Seoul', date: null },
      end: { dateTime: '2026-11-27T15:55:00+09:00', timeZone: 'Asia/Seoul', date: null },
    })
    expect(app.store.event('evt0001')?.start).toEqual({ dateTime: '2026-11-27T15:05:00+09:00', timeZone: 'Asia/Seoul' })
    expect(app.store.event('evt0001')).toMatchObject({ description: '허리', colorId: '11' })
    expect(res.event).toMatchObject({ start: '2026-11-27T15:05', end: '2026-11-27T15:55' })

    res = call(app, 'put', { id: 'evt0001', fields: { colorId: null } })
    expect(app.store.event('evt0001')?.colorId).toBeUndefined()
    expect(res.event?.colorId).toBeNull()

    res = call(app, 'put', { id: 'evt0001', fields: { allDay: true, start: '2026-11-28', end: '2026-11-29' } })
    expect(app.store.event('evt0001')?.start).toEqual({ date: '2026-11-28' })
    expect(res.event).toMatchObject({ allDay: true, start: '2026-11-28', end: '2026-11-29', description: '허리' })
    expect(app.store.writes().map((w) => w.api)).toEqual(['Events.patch', 'Events.patch', 'Events.patch', 'Events.patch'])
    expect(app.store.live()).toHaveLength(1)
  })

  it('AC-8507.4: 지운 일정 id면 되살린다(status confirmed) — 새로 만들지 않는다', () => {
    const app = load()
    app.store.timed('evt0002', '2026-11-27T09:00', '2026-11-27T09:30', { summary: '6230 정샘플 도수 (현)', colorId: '4', status: 'cancelled' })
    const res = call(app, 'put', { id: 'evt0002', fields: { colorId: '2' } })
    expect(lastWrite(app).resource).toEqual({ colorId: '2', status: 'confirmed' })
    expect(app.store.event('evt0002')).toMatchObject({ status: 'confirmed', colorId: '2', summary: '6230 정샘플 도수 (현)' })
    expect(res.event).toMatchObject({ id: 'evt0002', status: 'confirmed', colorId: '2' })
    expect(app.store.writes().map((w) => w.api)).toEqual(['Events.patch'])
  })

  it('AC-8507.4: 새로 만들 때 시작·끝이 없거나 칸 모양이 틀리면 bad_request이고 아무것도 쓰지 않는다', () => {
    const app = load()
    app.store.timed('evt0001', '2026-11-27T09:00', '2026-11-27T09:30')
    expect(call(app, 'put', { id: NEW_ID, fields: { colorId: '1' } })).toEqual(failOf('bad_request'))
    // 새 일정 id는 구글 규칙(0-9·a-v)이어야 한다
    expect(call(app, 'put', { id: 'Upper_Case_01', fields: FULL })).toEqual(failOf('bad_request'))
    const bad: Record<string, unknown>[] = [
      { fields: FULL },
      { id: '', fields: FULL },
      { id: 'has space', fields: FULL },
      { id: 42, fields: FULL },
      { id: 'evt0001' },
      { id: 'evt0001', fields: 'colorId=1' },
      { id: 'evt0001', fields: [1] },
      { id: 'evt0001', fields: { location: '1층' } },
      { id: 'evt0001', fields: { colorId: '12' } },
      { id: 'evt0001', fields: { colorId: '0' } },
      { id: 'evt0001', fields: { colorId: 3 } },
      { id: 'evt0001', fields: { summary: 5 } },
      { id: 'evt0001', fields: { description: { a: 1 } } },
      { id: 'evt0001', fields: { allDay: 'yes' } },
      { id: 'evt0001', fields: { start: '2026-11-27T10:00' } },
      { id: 'evt0001', fields: { end: '2026-11-27T10:00' } },
      { id: 'evt0001', fields: { start: '2026-11-27T10:00', end: '2026-11-27T10:00' } },
      { id: 'evt0001', fields: { start: '2026-11-27T10:30', end: '2026-11-27T10:00' } },
      { id: 'evt0001', fields: { start: '2026-11-27T25:00', end: '2026-11-27T26:00' } },
      { id: 'evt0001', fields: { start: '2026-11-27 10:00', end: '2026-11-27 10:30' } },
      { id: 'evt0001', fields: { allDay: true, start: '2026-11-27T10:00', end: '2026-11-27T10:30' } },
      { id: 'evt0001', fields: { allDay: false, start: '2026-11-27', end: '2026-11-28' } },
      { id: 'evt0001', fields: { start: '2026-11-27', end: '2026-11-27T10:30' } },
      { id: 'evt0001', fields: { allDay: true, start: '2026-11-31', end: '2026-12-01' } },
    ]
    for (const extra of bad) expect(call(app, 'put', extra), JSON.stringify(extra)).toEqual(failOf('bad_request'))
    expect(app.store.writes()).toEqual([])
    expect(app.store.event('evt0001')?.start).toEqual({ dateTime: '2026-11-27T09:00:00+09:00', timeZone: 'Asia/Seoul' })
  })

  it('AC-8507.4: 쓰기는 LockService로 한 번에 하나 — 30초 기다려도 못 잡으면 busy이고 구글을 부르지 않는다', () => {
    const app = load()
    app.store.timed('evt0001', '2026-11-27T09:00', '2026-11-27T09:30')
    app.store.allDay('memo001', '2026-11-26', '2026-11-29', { summary: '원장님 학회' })
    const writes: [string, Record<string, unknown>][] = [
      ['put', { id: 'evt0001', fields: { colorId: '2' } }],
      ['dropDay', { id: 'memo001', day: '2026-11-26' }],
      ['off', offArgs()],
      ['remove', { id: 'evt0001' }],
    ]
    app.env.lockFree = false
    for (const [action, extra] of writes) expect(call(app, action, extra), action).toEqual(failOf('busy'))
    expect(app.store.calls).toEqual([])
    expect(app.env.lockWaits).toEqual([30000, 30000, 30000, 30000])

    app.env.lockFree = true
    for (const [action, extra] of writes) expect(call(app, action, extra).ok, action).toBe(true)
    expect(app.store.writes().length).toBeGreaterThanOrEqual(4)
    expect(app.store.writes().every((w) => w.heldLock)).toBe(true)
    expect(app.env.locked).toBe(false)
    expect(app.env.releases).toBe(4)

    // 읽기(ping·list·changes)는 Lock을 잡지 않는다
    const tries = app.env.lockTries
    call(app, 'ping')
    call(app, 'list', { from: '2026-11-26', to: '2026-12-01' })
    call(app, 'changes', { since: '2026-11-26T00:00:00Z', from: '2026-11-26' })
    expect(app.env.lockTries).toBe(tries)

    // 구글 오류가 나도 Lock을 놓는다
    app.store.failOn('Events.get', gError(500, 'backendError', 'Backend Error'))
    expect(call(app, 'put', { id: 'evt0001', fields: { colorId: '3' } })).toEqual(failOf('failed'))
    expect(app.env.locked).toBe(false)
    expect(app.env.releases).toBe(5)
  })
})

describe('AC-8507.5: remove · dropDay · off', () => {
  it('AC-8507.5: remove — 있으면 지우고, 없거나(404) 이미 지운(410) 일정도 성공', () => {
    const app = load()
    app.store.timed('evt0001', '2026-11-27T09:00', '2026-11-27T09:30', { summary: '1234 홍길동 도수 (호)' })
    expect(call(app, 'remove', { id: 'evt0001' })).toEqual({ ok: true, version: '1' })
    expect(app.store.event('evt0001')?.status).toBe('cancelled')
    expect(call(app, 'remove', { id: 'evt0001' })).toEqual({ ok: true, version: '1' })
    expect(call(app, 'remove', { id: 'nothere01' })).toEqual({ ok: true, version: '1' })
    expect(app.store.writes().map((w) => [w.api, w.eventId])).toEqual([
      ['Events.remove', 'evt0001'],
      ['Events.remove', 'evt0001'],
      ['Events.remove', 'nothere01'],
    ])
    expect(call(app, 'remove', {})).toEqual(failOf('bad_request'))
  })

  describe('AC-8507.5: dropDay — 여러 날 종일 일정에서 그날만 뗀다', () => {
    const memo = (app: App) => app.store.allDay('memo001', '2026-11-26', '2026-11-29', { summary: '원장님 학회', description: '부산', colorId: '3' }) // 26·27·28

    it('AC-8507.5: 앞 — 첫날을 떼면 시작이 다음 날로', () => {
      const app = load()
      memo(app)
      const res = call(app, 'dropDay', { id: 'memo001', day: '2026-11-26' })
      expect(res.ok).toBe(true)
      expect(res.events).toHaveLength(1)
      expect(res.events[0]).toMatchObject({ id: 'memo001', allDay: true, start: '2026-11-27', end: '2026-11-29', summary: '원장님 학회', colorId: '3' })
      expect(app.store.event('memo001')).toMatchObject({ start: { date: '2026-11-27' }, end: { date: '2026-11-29' } })
      expect(app.store.live()).toHaveLength(1)
    })

    it('AC-8507.5: 뒤 — 끝날을 떼면 끝이 그날로', () => {
      const app = load()
      memo(app)
      const res = call(app, 'dropDay', { id: 'memo001', day: '2026-11-28' })
      expect(res.events.map((e) => [e.id, e.start, e.end])).toEqual([['memo001', '2026-11-26', '2026-11-28']])
      expect(app.store.live()).toHaveLength(1)
    })

    it('AC-8507.5: 가운데 — 앞쪽은 그 일정을 줄이고, 뒤쪽은 같은 제목·색·설명으로 새 일정 하나(다시 보내도 둘이 되지 않음)', () => {
      const app = load()
      memo(app)
      const res = call(app, 'dropDay', { id: 'memo001', day: '2026-11-27' })
      expect(res.events.map((e) => [e.id === 'memo001', e.start, e.end, e.summary, e.description, e.colorId])).toEqual([
        [true, '2026-11-26', '2026-11-27', '원장님 학회', '부산', '3'],
        [false, '2026-11-28', '2026-11-29', '원장님 학회', '부산', '3'],
      ])
      expect(byStart(app.store.live()).map((e) => [e.start?.date, e.end?.date])).toEqual([
        ['2026-11-26', '2026-11-27'],
        ['2026-11-28', '2026-11-29'],
      ])
      // 다시 보내면 그날은 이미 빠져 있어 그대로
      const again = call(app, 'dropDay', { id: 'memo001', day: '2026-11-27' })
      expect(again.events.map((e) => [e.id, e.start, e.end])).toEqual([['memo001', '2026-11-26', '2026-11-27']])
      expect(app.store.live()).toHaveLength(2)
    })

    it('AC-8507.5: 가운데 — 뒤쪽을 만든 뒤 앞쪽 고치기가 실패해 다시 보내도 뒤쪽 일정은 하나', () => {
      const app = load()
      memo(app)
      app.store.failOn('Events.patch', gError(503, 'backendError', 'Backend Error'))
      expect(call(app, 'dropDay', { id: 'memo001', day: '2026-11-27' })).toEqual(failOf('failed'))
      const res = call(app, 'dropDay', { id: 'memo001', day: '2026-11-27' })
      expect(res.ok).toBe(true)
      expect(byStart(app.store.live()).map((e) => [e.start?.date, e.end?.date, e.summary])).toEqual([
        ['2026-11-26', '2026-11-27', '원장님 학회'],
        ['2026-11-28', '2026-11-29', '원장님 학회'],
      ])
    })

    it('AC-8507.5: 하루짜리에서 그날을 떼면 일정을 지운다, 범위 밖 날·없는 일정·지운 일정은 그대로 성공', () => {
      const app = load()
      memo(app)
      app.store.allDay('memo002', '2026-11-30', '2026-12-01', { summary: '물리치료실 소독' })
      app.store.allDay('memo003', '2026-12-02', '2026-12-04', { status: 'cancelled' })
      expect(call(app, 'dropDay', { id: 'memo002', day: '2026-11-30' })).toEqual({ ok: true, version: '1', events: [] })
      expect(app.store.event('memo002')?.status).toBe('cancelled')
      const before = app.store.writes().length
      const out = call(app, 'dropDay', { id: 'memo001', day: '2026-12-05' })
      expect(out.events.map((e) => [e.id, e.start, e.end])).toEqual([['memo001', '2026-11-26', '2026-11-29']])
      expect(call(app, 'dropDay', { id: 'nothere01', day: '2026-11-26' })).toEqual({ ok: true, version: '1', events: [] })
      expect(call(app, 'dropDay', { id: 'memo003', day: '2026-12-02' })).toEqual({ ok: true, version: '1', events: [] })
      expect(app.store.writes().length).toBe(before)
    })

    it('AC-8507.5: 하루 종일이 아닌 일정·날짜 꼴이 틀리면 bad_request', () => {
      const app = load()
      memo(app)
      app.store.timed('evt0001', '2026-11-27T09:00', '2026-11-27T09:30')
      expect(call(app, 'dropDay', { id: 'evt0001', day: '2026-11-27' })).toEqual(failOf('bad_request'))
      for (const day of ['2026-11-31', '20261127', '', undefined]) expect(call(app, 'dropDay', { id: 'memo001', day })).toEqual(failOf('bad_request'))
      expect(call(app, 'dropDay', { day: '2026-11-27' })).toEqual(failOf('bad_request'))
      expect(app.store.writes()).toEqual([])
    })
  })

  describe('AC-8507.5: off — 준 id → 그날 off 제목 → 정해진 id 차례로 그날 off 줄을 고친다', () => {
    it('AC-8507.5: 그날 off 일정이 없으면 정해진 id(sskoff + 병원 32자 + 날짜)로 하루 일정을 만든다', () => {
      const app = load()
      app.store.allDay('memo001', '2026-11-26', '2026-11-27', { summary: '원장님 학회' })
      app.store.timed('evt0001', '2026-11-26T09:00', '2026-11-26T09:30', { summary: '1234 홍길동 off' }) // 시각 일정은 off 줄이 아니다
      const res = call(app, 'off', offArgs())
      expect(res).toEqual({
        ok: true,
        version: '1',
        event: {
          id: OFF_26,
          status: 'confirmed',
          summary: '정호연 off',
          description: '',
          allDay: true,
          start: '2026-11-26',
          end: '2026-11-27',
          colorId: '3',
          updated: app.store.event(OFF_26)?.updated,
          recurring: false,
        },
      })
      expect(app.store.writes().map((w) => [w.api, w.resource?.id])).toEqual([['Events.insert', OFF_26]])
      expect(app.store.event('memo001')?.summary).toBe('원장님 학회')
      expect(app.store.event('evt0001')?.summary).toBe('1234 홍길동 off')
      // 그날 일정을 찾을 때 넘긴 범위
      const day = app.store.calls.filter((c) => c.api === 'Events.list')[0].opts
      expect(day).toMatchObject({ timeMin: '2026-11-26T00:00:00+09:00', timeMax: '2026-11-27T00:00:00+09:00', singleEvents: true, showDeleted: false })
    })

    it('AC-8507.5: 두 PC가 같은 날 off를 함께 보내도(id 없이 두 번) 그날 off 일정은 하나', () => {
      const app = load()
      const a = call(app, 'off', offArgs())
      const b = call(app, 'off', offArgs({ title: '정호연 박지원 off' }))
      expect([a.event?.id, b.event?.id]).toEqual([OFF_26, OFF_26])
      const offs = app.store.live().filter((e) => e.start?.date === '2026-11-26')
      expect(offs).toHaveLength(1)
      expect(offs[0]).toMatchObject({ id: OFF_26, summary: '정호연 박지원 off' })
      expect(app.store.writes().map((w) => w.api)).toEqual(['Events.insert', 'Events.patch'])
    })

    it('AC-8507.5: 준 id 일정(지우지 않았고 그날을 덮는 하루 종일)을 먼저 고친다 — 아니면 다음 차례', () => {
      const app = load()
      app.store.allDay('hum0001', '2026-11-26', '2026-11-27', { summary: '휴무', colorId: '8' }) // off로 끝나지 않아도 준 id면 고친다
      app.store.allDay('hum0002', '2026-11-26', '2026-11-27', { summary: '박지원 off' })
      const res = call(app, 'off', offArgs({ id: 'hum0001' }))
      expect(res.event).toMatchObject({ id: 'hum0001', summary: '정호연 off', colorId: '3', start: '2026-11-26', end: '2026-11-27' })
      expect(app.store.event('hum0002')?.summary).toBe('박지원 off')
      expect(app.store.event(OFF_26)).toBeUndefined()
      // 준 id가 그날을 덮지 않으면 그날 off 제목 일정을 찾는다
      app.store.allDay('hum0003', '2026-11-27', '2026-11-28', { summary: '김예시 off' })
      const r2 = call(app, 'off', offArgs({ id: 'hum0001', day: '2026-11-27', newId: OFF_27, title: '김예시 정호연 off' }))
      expect(r2.event).toMatchObject({ id: 'hum0003', summary: '김예시 정호연 off' })
      expect(app.store.event('hum0001')).toMatchObject({ summary: '정호연 off', start: { date: '2026-11-26' } })
      // 준 id가 지워졌으면 정해진 id로
      app.store.allDay('hum0004', '2026-11-29', '2026-11-30', { summary: '정호연 off', status: 'cancelled' })
      const r3 = call(app, 'off', offArgs({ id: 'hum0004', day: '2026-11-29', newId: OFF_29 }))
      expect(r3.event).toMatchObject({ id: OFF_29, summary: '정호연 off', start: '2026-11-29' })
      expect(app.store.event('hum0004')?.status).toBe('cancelled')
    })

    it('AC-8507.5: id가 없으면 그날 하루 종일 일정 가운데 제목이 off이거나 " off"로 끝나는 것(먼저 만든 것)을 찾아 고친다', () => {
      const app = load()
      app.store.allDay('hum0001', '2026-11-26', '2026-11-27', { summary: 'off', created: '2026-11-02T00:00:00.000Z' })
      app.store.allDay('hum0002', '2026-11-26', '2026-11-27', { summary: ' 박지원 off ', created: '2026-11-01T00:00:00.000Z' })
      app.store.allDay('hum0003', '2026-11-26', '2026-11-27', { summary: '정호연off', created: '2026-10-01T00:00:00.000Z' }) // 띄어 쓰지 않으면 off 줄 아님
      app.store.allDay('memo001', '2026-11-26', '2026-11-27', { summary: '원장님 학회', created: '2026-09-01T00:00:00.000Z' })
      const res = call(app, 'off', offArgs({ title: '박지원 정호연 off' }))
      expect(res.event).toMatchObject({ id: 'hum0002', summary: '박지원 정호연 off', colorId: '3', allDay: true, start: '2026-11-26', end: '2026-11-27' })
      expect(app.store.event('hum0001')?.summary).toBe('off')
      expect(app.store.event('hum0003')?.summary).toBe('정호연off')
      expect(app.store.event('memo001')?.summary).toBe('원장님 학회')
      expect(app.store.event(OFF_26)).toBeUndefined()
      expect(app.store.writes().map((w) => [w.api, w.eventId])).toEqual([['Events.patch', 'hum0002']])
      expect(lastWrite(app).resource).toEqual({ summary: '박지원 정호연 off', colorId: '3' })
    })

    it('AC-8507.5: 찾은 일정이 여러 날이면 그날만 떼고 정해진 id로 하루 일정을 만든다', () => {
      const app = load()
      app.store.allDay('hum0001', '2026-11-25', '2026-11-28', { summary: '김예시 off', colorId: '3' }) // 25·26·27
      const res = call(app, 'off', offArgs({ title: '김예시 정호연 off' }))
      expect(res.event).toMatchObject({ id: OFF_26, summary: '김예시 정호연 off', allDay: true, start: '2026-11-26', end: '2026-11-27', colorId: '3' })
      expect(byStart(app.store.live()).map((e) => [e.id === 'hum0001' ? 'hum' : e.id === OFF_26 ? 'off' : 'back', e.start?.date, e.end?.date, e.summary])).toEqual([
        ['hum', '2026-11-25', '2026-11-26', '김예시 off'],
        ['off', '2026-11-26', '2026-11-27', '김예시 정호연 off'],
        ['back', '2026-11-27', '2026-11-28', '김예시 off'],
      ])
    })

    it('AC-8507.5: 제목이 비면 그날 off 일정을 지운다(하루짜리는 지움, 여러 날은 그날만 뗌), 없으면 아무것도 안 함', () => {
      const app = load()
      call(app, 'off', offArgs())
      expect(call(app, 'off', offArgs({ title: '' }))).toEqual({ ok: true, version: '1', event: null })
      expect(app.store.event(OFF_26)?.status).toBe('cancelled')
      const before = app.store.writes().length
      // 지운 정해진 id만 남은 날·off 일정이 없는 날은 아무것도 쓰지 않는다
      expect(call(app, 'off', offArgs({ title: '' }))).toEqual({ ok: true, version: '1', event: null })
      expect(call(app, 'off', offArgs({ day: '2026-11-27', newId: OFF_27, title: '   ' }))).toEqual({ ok: true, version: '1', event: null })
      expect(app.store.writes().length).toBe(before)
      // 여러 날이면 그날만 뗀다
      app.store.allDay('hum0001', '2026-11-28', '2026-12-01', { summary: '김예시 off' }) // 28·29·30
      expect(call(app, 'off', offArgs({ day: '2026-11-29', newId: OFF_29, title: '' }))).toEqual({ ok: true, version: '1', event: null })
      expect(byStart(app.store.live()).map((e) => [e.start?.date, e.end?.date, e.summary])).toEqual([
        ['2026-11-28', '2026-11-29', '김예시 off'],
        ['2026-11-30', '2026-12-01', '김예시 off'],
      ])
      expect(app.store.event(OFF_29)).toBeUndefined()
    })

    it('AC-8507.5: 지운 off 일정(정해진 id)은 되살린다', () => {
      const app = load()
      call(app, 'off', offArgs())
      call(app, 'remove', { id: OFF_26 })
      const res = call(app, 'off', offArgs({ title: '박지원 off' }))
      expect(res.event).toMatchObject({ id: OFF_26, status: 'confirmed', summary: '박지원 off', start: '2026-11-26', end: '2026-11-27', colorId: '3' })
      expect(app.store.event(OFF_26)?.status).toBe('confirmed')
      expect(app.store.writes().map((w) => w.api)).toEqual(['Events.insert', 'Events.remove', 'Events.patch'])
      expect(app.store.live()).toHaveLength(1)
    })

    it('AC-8507.5: 날짜·정해진 id·off 글·제목·색 모양이 틀리면 bad_request이고 구글을 부르지 않는다', () => {
      const app = load()
      const bad = [
        offArgs({ newId: OFF_27 }),
        offArgs({ newId: 'sskoff' + HOSPITAL.toUpperCase() + '20261126' }),
        offArgs({ newId: 'sskoff' + HOSPITAL.slice(1) + '20261126' }),
        offArgs({ newId: 'ssk' + HOSPITAL + '20261126' }),
        offArgs({ newId: undefined }),
        offArgs({ offWord: '' }),
        offArgs({ offWord: '   ' }),
        offArgs({ offWord: 3 }),
        offArgs({ title: 5 }),
        offArgs({ title: undefined }),
        offArgs({ colorId: '12' }),
        offArgs({ colorId: 3 }),
        offArgs({ day: '2026-11-31' }),
        offArgs({ day: undefined }),
        offArgs({ id: 'has space' }),
      ]
      for (const extra of bad) expect(call(app, 'off', extra), JSON.stringify(extra)).toEqual(failOf('bad_request'))
      expect(app.store.calls).toEqual([])
    })
  })
})

describe('AC-8507.6: 오류 — 고급 서비스 꺼짐 no_service · 구글 한도 limit · 캘린더 없음/권한 없음 gone', () => {
  it('AC-8507.6: 캘린더 고급 서비스(Calendar)가 없으면 맞는 열쇠로 부를 때 no_service(열쇠 확인이 먼저)', () => {
    const app = load({ noService: true })
    expect('Calendar' in app.ctx).toBe(false)
    for (const action of ACTIONS) expect(call(app, action, validArgs(action)), action).toEqual(failOf('no_service'))
    expect(app.post({ key: 'Wrong' + TEST_KEY.slice(5), action: 'ping' })).toEqual(failOf('bad_token'))
    expect(app.env.lockTries).toBe(0)
  })

  it('AC-8507.6: 구글 한도 오류(403 rate·quota, 429, 하루 횟수 글)는 어느 부르기에서든 limit', () => {
    const limits = [
      gError(403, 'rateLimitExceeded', 'Rate Limit Exceeded'),
      gError(403, 'userRateLimitExceeded', 'User Rate Limit Exceeded'),
      gError(403, 'quotaExceeded', 'Calendar usage limits exceeded.'),
      gError(429, 'rateLimitExceeded', 'Too Many Requests'),
      gError(403, 'rateLimitExceeded', 'Rate Limit Exceeded', { details: false }),
      new Error('Service invoked too many times for one day: calendar.'),
    ]
    for (const err of limits) {
      const app = load()
      app.store.allDay('memo001', '2026-11-26', '2026-11-29', { summary: '원장님 학회' })
      const cases: [string, string, Record<string, unknown>][] = [
        ['CalendarList.list', 'ping', {}],
        ['Events.list', 'list', validArgs('list')],
        ['Events.list', 'changes', validArgs('changes')],
        ['Events.get', 'put', { id: 'memo001', fields: { colorId: '2' } }],
        ['Events.insert', 'put', { id: NEW_ID, fields: FULL }],
        ['Events.remove', 'remove', { id: 'memo001' }],
        ['Events.patch', 'dropDay', { id: 'memo001', day: '2026-11-26' }],
        ['Events.insert', 'off', offArgs()],
      ]
      for (const [api, action, extra] of cases) {
        app.store.failOn(api, err)
        expect(call(app, action, extra), api + ' ' + err.message).toEqual(failOf('limit'))
      }
      expect(app.store.event('memo001')).toMatchObject({ status: 'confirmed', start: { date: '2026-11-26' } })
    }
  })

  it('AC-8507.6: 캘린더가 없거나(404) 고칠 권한이 없으면(403 writer 아님) gone', () => {
    const app = load()
    const ro = 'holiday@fake.test'
    const missing = 'nothere@fake.test'
    app.store.addCalendar({ id: ro, summary: '대한민국의 휴일', accessRole: 'reader', backgroundColor: '#e6c800' })
    app.store.allDay('h000001', '2026-12-25', '2026-12-26', { summary: '기독탄신일' }, ro)
    expect(call(app, 'list', { ...validArgs('list'), calendarId: missing })).toEqual(failOf('gone'))
    expect(call(app, 'changes', { ...validArgs('changes'), calendarId: missing })).toEqual(failOf('gone'))
    expect(call(app, 'put', { calendarId: missing, id: NEW_ID, fields: FULL })).toEqual(failOf('gone'))
    expect(call(app, 'off', { ...offArgs(), calendarId: missing })).toEqual(failOf('gone'))
    // 보기만 되는 캘린더는 읽기는 되고 쓰기는 gone
    expect(call(app, 'list', { calendarId: ro, from: '2026-12-01', to: '2027-01-01' })).toMatchObject({ ok: true })
    expect(call(app, 'put', { calendarId: ro, id: 'h000001', fields: { colorId: '1' } })).toEqual(failOf('gone'))
    expect(call(app, 'put', { calendarId: ro, id: NEW_ID, fields: FULL })).toEqual(failOf('gone'))
    expect(call(app, 'remove', { calendarId: ro, id: 'h000001' })).toEqual(failOf('gone'))
    expect(call(app, 'off', { ...offArgs(), calendarId: ro })).toEqual(failOf('gone'))
    expect(app.store.event('h000001', ro)).toMatchObject({ status: 'confirmed', summary: '기독탄신일' })
    expect(app.store.event('h000001', ro)?.colorId).toBeUndefined()
    // 자세한 칸이 없는 구글 오류 글이어도 'Not Found'면 gone
    app.store.failOn('Events.list', gError(404, 'notFound', 'Not Found', { details: false }))
    expect(call(app, 'list', validArgs('list'))).toEqual(failOf('gone'))
  })

  it('AC-8507.6: 그 밖의 구글 오류는 failed — 어떤 오류 답에도 제목·이름·설명이 없고 기록(console)도 남기지 않는다', () => {
    const app = load()
    app.store.timed('evt0001', '2026-11-27T09:00', '2026-11-27T09:30', { summary: '1234 홍길동 도수 (호)', description: '홍길동 010-1111-2222' })
    const NAMES = ['홍길동', '1234', '010-1111-2222', '도수']
    const answers: Reply[] = []
    app.store.failOn('Events.patch', new Error('Invalid value 1234 홍길동 도수 (호) 010-1111-2222'))
    answers.push(call(app, 'put', { id: 'evt0001', fields: { summary: '1234 홍길동 도수 (호)' } }))
    app.store.failOn('Events.get', gError(500, 'backendError', 'Backend Error: 홍길동'))
    answers.push(call(app, 'put', { id: 'evt0001', fields: { colorId: '2' } }))
    app.store.failOn('Events.list', gError(503, 'backendError', '1234 홍길동 Service Unavailable'))
    answers.push(call(app, 'list', validArgs('list')))
    expect(answers.map((a) => a.code)).toEqual(['failed', 'failed', 'failed'])
    // 모양이 틀린 요청에 이름이 실려 와도 오류 글에 되돌려 싣지 않는다
    answers.push(call(app, 'put', { id: 'evt0001', fields: { summary: '1234 홍길동 도수 (호)', colorId: '99' } }))
    answers.push(call(app, 'put', { id: 'evt0001', fields: { summary: '1234 홍길동', 홍길동: 1 } }))
    answers.push(call(app, 'off', offArgs({ title: '홍길동 off', offWord: 7 })))
    answers.push(call(app, 'put', { id: '홍길동', fields: {} }))
    // 한도·없음 오류 글에 이름이 섞여 와도
    app.store.failOn('Events.list', gError(403, 'rateLimitExceeded', 'Rate Limit Exceeded for 홍길동'))
    answers.push(call(app, 'list', validArgs('list')))
    app.store.failOn('Events.list', gError(404, 'notFound', 'Not Found 1234 홍길동'))
    answers.push(call(app, 'list', validArgs('list')))
    expect(answers.map((a) => a.code)).toEqual(['failed', 'failed', 'failed', 'bad_request', 'bad_request', 'bad_request', 'bad_request', 'limit', 'gone'])
    for (const a of answers) {
      expect(Object.keys(a).sort()).toEqual(['code', 'error', 'message', 'ok', 'version'])
      for (const n of NAMES) expect(JSON.stringify(a), n).not.toContain(n)
    }
    expect(app.env.logs).toEqual([])
    expect(fs.readFileSync(CODE_PATH, 'utf8')).not.toMatch(/\bconsole\.|\bLogger\./)
  })
})
