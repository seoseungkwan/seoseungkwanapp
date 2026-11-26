import { describe, expect, it } from 'vitest'
import { DEFAULT_CAL_SETTINGS } from '@/types/calendar'
import { DEFAULT_GCAL_LOOK, DEFAULT_GCAL_RULES, type GcalLink } from '@/types/gcal'
import { CAL_ID, CAL_NAME, HOSPITAL, load, NOW } from '../../../google-code/test/fakeCalendar'
import { readReply } from './client'
import { createMemoryStore, type GcalCaller, type GcalDeps, type GcalParts } from './deps'
import { applyImport, importCounts, importRowState, readImport, type ImportPicks, type ImportPreview } from './importRead'

// 처음 가져오기 읽기·적기(spec google-link REQ-8527, design.md 12-3). 구글은 진짜 Code.gs를 가짜 캘린더에서, DB는 메모리 저장으로 돈다.
// 환자 이름은 지어낸 값이다

const NOW_MS = Date.parse(NOW) // 한국 2026-11-26 10:00
const SCRIPT = 'https://script.google.com/macros/s/AKfycbFake0123456789abc/exec'
const M_KIM = 'm-00000000000000000000000000000001'
const PARTS: GcalParts = {
  staff: [
    { id: 's-ho', name: '정호연', mark: '호', color: 'lavender' },
    { id: 's-won', name: '박지원', mark: '원', color: 'banana' },
  ],
  kinds: DEFAULT_CAL_SETTINGS.kinds,
  people: [
    { id: 's-ho', name: '정호연' },
    { id: 's-won', name: '박지원' },
    { id: M_KIM, name: '김예시' },
  ],
}
const READS = new Set(['loadLink', 'loadState', 'loadParts', 'findAppts', 'listAppts', 'listAllDay', 'listOffDays', 'listFixes'])

function rig() {
  const app = load()
  app.store.maxPage = 3 // 쪽 나눔을 보려고 작게
  const link: GcalLink = {
    scriptUrl: SCRIPT,
    secret: 'FakeKey_0123456789-abcdefABCDEF-xyz',
    calendarId: CAL_ID,
    calendarName: CAL_NAME,
    defaultHex: '#4285F4',
    linkedOn: null, // 처음 잇기 ③ — 아직 이은 날 없음
    rules: { ...DEFAULT_GCAL_RULES },
    look: { ...DEFAULT_GCAL_LOOK, noStaffKinds: ['shock'] },
  }
  const now = () => new Date(app.env.nowMs)
  const mem = createMemoryStore({ now, link, parts: PARTS })
  const call: GcalCaller = async (l, action, body = {}) => readReply(JSON.stringify(app.post({ ...body, key: l.secret, action })))
  const deps: GcalDeps = { hospitalId: HOSPITAL, call, store: mem.store, now }

  const s = app.store
  s.timed('evpast001', '2026-03-10T10:00', '2026-03-10T10:15', { summary: '5521 최시안 충격파 (4000타)' })
  s.timed('evpast002', '2026-03-11T11:00', '2026-03-11T11:30', { summary: '7345 한예제 (원)', colorId: '11' })
  s.timed('evfut0001', '2026-11-27T10:00', '2026-11-27T10:30', { summary: '1234 홍길동 도수 30분 (호)' })
  s.timed('evfut0002', '2026-11-28T16:00', '2026-11-28T16:15', { summary: '6402 윤모의 충격파' })
  s.timed('evfut0003', '2026-11-29T13:00', '2026-11-29T14:00', { summary: '원장님 회의' })
  s.allDay('evoff0001', '2026-11-30', '2026-12-01', { summary: '박지원 off', colorId: '3' })
  s.allDay('evmemo001', '2026-12-01', '2026-12-03', { summary: '원장님 학회' })
  s.timed('evtooold1', '2025-10-01T10:00', '2025-10-01T10:30', { summary: '9999 지난예 도수 (호)' })
  s.timed('evfar0001', '2028-12-01T10:00', '2028-12-01T10:30', { summary: '9998 먼미래 도수 (호)' })
  app.store.clockMs = NOW_MS

  const webOnly = mem.seedAppt({ day: '2026-12-05', start: 600, len: 30, name: '서예제', staffId: 's-ho', staffName: '정호연', staffMark: '호', kindId: 'dosu', kindName: '도수' })
  const webPast = mem.seedAppt({ day: '2026-11-20', start: 600, len: 30, name: '지난웹', staffId: 's-ho', staffName: '정호연', staffMark: '호', kindId: 'dosu', kindName: '도수' })
  return { app, mem, deps, webOnly, webPast }
}

async function preview(deps: GcalDeps): Promise<ImportPreview> {
  const r = await readImport(deps)
  if (!r.ok) throw new Error(`읽기 실패 ${r.code}`)
  return r.preview
}

const rowOf = (p: ImportPreview, id: string) => {
  const row = p.rows.find((r) => r.eventId === id)
  if (!row) throw new Error(`줄 없음 ${id}`)
  return row
}

describe('AC-8527.1 미리 보기 읽기', () => {
  it('AC-8527.1: 지난 1년(오늘 − 1년 0시)부터 오늘 + 2년 0시 앞까지 list를 쪽마다 받아 줄을 만들고, 웹앱·구글 모두 바꾸지 않는다', async () => {
    const { app, mem, deps } = rig()
    const p = await preview(deps)
    const lists = app.store.calls.filter((c) => c.api === 'Events.list')
    expect(lists.length).toBeGreaterThanOrEqual(3) // 일곱 일정 / 쪽마다 셋
    expect(lists[0].opts).toMatchObject({ timeMin: '2025-11-26T00:00:00+09:00', timeMax: '2028-11-26T00:00:00+09:00', showDeleted: false })
    expect(p.today).toBe('2026-11-26')
    expect(p.readAt).toBe('2026-11-26T01:00:00.000Z')
    expect(p.rows.map((r) => r.eventId).sort()).toEqual(['evfut0001', 'evfut0002', 'evfut0003', 'evmemo001', 'evoff0001', 'evpast001', 'evpast002'])
    expect(rowOf(p, 'evpast001')).toMatchObject({ past: true, allDay: false, title: '5521 최시안 충격파 (4000타)', known: false })
    expect(rowOf(p, 'evfut0002').parsed).toMatchObject({ type: 'fix', fix: { reason: 'no-staff' } })
    expect(app.store.writes()).toEqual([])
    expect(mem.calls.every((c) => READS.has(c.fn))).toBe(true)
  })

  it('AC-8527.1: 카드 다섯 숫자·거르기 넷 숫자·시행자 없는 예약 수', async () => {
    const { deps } = rig()
    const p = await preview(deps)
    expect(importCounts(p, {})).toEqual({
      past: { total: 2, appts: 2, allDay: 0 },
      future: { total: 5, appts: 3, allDay: 2 },
      known: 5,
      guessed: 1, // 한예제: 종류 글이 없어 설정 '종류 글이 없는 예약'으로
      fix: 2,
      picked: 0,
      skip: 0,
      filters: { future: 5, past: 2, fix: 2, allDay: 2 },
      noStaff: { past: 1, pastKinds: [{ name: '충격파', n: 1 }], future: 1, futureKinds: ['충격파'] },
    })
    const picks: ImportPicks = { evfut0002: ['staff:s-won'], evfut0003: ['skip'] }
    expect(importCounts(p, picks)).toMatchObject({ known: 6, fix: 0, picked: 1, skip: 1, filters: { fix: 0 } })
    expect(importRowState(rowOf(p, 'evfut0002'), picks)).toBe('picked')
    expect(importRowState(rowOf(p, 'evfut0003'), picks)).toBe('skip')
    expect(importRowState(rowOf(p, 'evpast001'), picks)).toBe('known')
    expect(importRowState(rowOf(p, 'evfut0003'), {})).toBe('fix')
  })
})

describe('AC-8527.2·AC-8527.3 [가져오기]', () => {
  it('AC-8527.2·AC-8527.3: 알아본 예약·종일 메모·off 줄과 짝·고쳐야 할 것을 넣고, 이은 날 = 오늘·받아 온 끝 = 읽은 시각, 웹앱에만 있던 오늘 뒤 예약만 g_wait new로 보낸다', async () => {
    const { app, mem, deps, webOnly, webPast } = rig()
    const p = await preview(deps)
    const done = await applyImport(deps, p, { evfut0002: ['staff:s-won'] })
    expect(done).toMatchObject({ ok: true, appts: 4, memos: 2, offs: 1, fixes: 1, skipped: 0, sent: 1 })

    const byEvent = (id: string) => mem.db.appts.find((a) => a.gEventId === id)
    expect(byEvent('evpast001')).toMatchObject({
      day: '2026-03-10',
      start: 600,
      len: 15,
      chart: '5521',
      name: '최시안',
      kindId: 'shock',
      staffId: null,
      staffName: null,
      staffMark: null,
      memo: '4000타',
      status: 'auto',
      auto: null,
      gFrom: 'import',
      colorFrom: 'google',
      gKeepTitle: true,
      gTitle: '5521 최시안 충격파 (4000타)',
      gWait: null,
    })
    expect(byEvent('evpast002')).toMatchObject({ status: 'cancel', kindId: 'dosu', staffId: 's-won', gFrom: 'import' })
    expect(byEvent('evfut0001')).toMatchObject({ staffId: 's-ho', gFrom: 'import' })
    expect(byEvent('evfut0002')).toMatchObject({ staffId: 's-won', staffName: '박지원', staffMark: '원', kindId: 'shock', gHow: expect.objectContaining({ staff: 'picked' }) })

    expect(mem.db.allday.filter((r) => r.type === 'memo').map((r) => [r.day, r.memo, r.gEventId, r.gWait])).toEqual([
      ['2026-12-01', '원장님 학회', 'evmemo001', false],
      ['2026-12-02', '원장님 학회', 'evmemo001', false],
    ])
    expect(mem.db.allday.filter((r) => r.type === 'off').map((r) => [r.day, r.staffId, r.staffName])).toEqual([['2026-11-30', 's-won', '박지원']])
    expect(mem.db.offDays).toEqual([expect.objectContaining({ day: '2026-11-30', gEventId: 'evoff0001', gTitle: '박지원 off', wait: false })])
    expect(mem.db.fixes).toEqual([expect.objectContaining({ gEventId: 'evfut0003', day: '2026-11-29', reason: 'not-appt', state: 'open', gTitle: '원장님 회의' })])

    const sent = mem.db.appts.find((a) => a.id === webOnly.id)
    expect(sent?.gEventId).toMatch(/^ssk[0-9a-f]{32}$/)
    expect(sent).toMatchObject({ gFrom: 'web', gWait: null })
    expect(app.store.event(sent?.gEventId as string)).toMatchObject({ summary: '서예제 도수 30분 (호)', start: { dateTime: '2026-12-05T10:00:00+09:00' } })
    expect(mem.db.appts.find((a) => a.id === webPast.id)?.gEventId).toBeNull()

    expect(mem.db.link.linkedOn).toBe('2026-11-26')
    expect(mem.db.state.pulledUntil).toBe(p.readAt)
    // 구글 일정 제목·색은 그대로: 쓰기는 웹앱에만 있던 예약 넣기 하나
    expect(app.store.writes().map((c) => c.api)).toEqual(['Events.insert'])
    expect(app.store.event('evpast002')).toMatchObject({ summary: '7345 한예제 (원)', colorId: '11' })
  })

  it('AC-8527.2: 두 번 가져와도 줄이 둘이 되지 않고(같은 g_event_id는 건너뜀), 다시 읽으면 넣은 일정은 알아봄(이미 있음)이다', async () => {
    const { app, mem, deps } = rig()
    await applyImport(deps, await preview(deps), { evfut0002: ['staff:s-won'] })
    const counts = () => [mem.db.appts.length, mem.db.allday.length, mem.db.offDays.length, mem.db.fixes.length]
    const first = counts()

    const again = await preview(deps)
    expect(rowOf(again, 'evfut0001').known).toBe(true)
    expect(rowOf(again, 'evmemo001').known).toBe(true)
    expect(rowOf(again, 'evoff0001').known).toBe(true)
    const done = await applyImport(deps, again, { evfut0002: ['staff:s-won'] })
    expect(done).toMatchObject({ ok: true, appts: 0, memos: 0, offs: 0, sent: 0 })
    expect(counts()).toEqual(first)
    expect(app.store.writes()).toHaveLength(1)
  })

  it('AC-8527.2: 가져오지 않기로 한 것은 고쳐야 할 것에 넣지 않고, 고른 길이·사람·종일 메모로 넣는다', async () => {
    const { app, mem, deps } = rig()
    app.store.timed('evlong001', '2026-11-30T09:00', '2026-11-30T21:00', { summary: '1111 김환자 도수 (호)' })
    app.store.allDay('evoff0002', '2026-12-04', '2026-12-05', { summary: '최호 off' })
    app.store.allDay('evoff0003', '2026-12-07', '2026-12-08', { summary: '최호 off' })
    const p = await preview(deps)
    expect(rowOf(p, 'evlong001').parsed).toMatchObject({ type: 'fix', fix: { reason: 'too-long' } })
    expect(rowOf(p, 'evoff0002').parsed).toMatchObject({ type: 'fix', fix: { reason: 'off-name' } })

    const done = await applyImport(deps, p, {
      evfut0002: ['skip'],
      evfut0003: ['memo'],
      evlong001: ['len:30'],
      evoff0002: [`person:${M_KIM}`],
      evoff0003: ['memo'],
    })
    expect(done).toMatchObject({ ok: true, fixes: 0, skipped: 1 })
    expect(mem.db.fixes).toEqual([])
    expect(mem.db.appts.find((a) => a.gEventId === 'evfut0002')).toBeUndefined()
    expect(mem.db.appts.find((a) => a.gEventId === 'evlong001')).toMatchObject({ start: 540, len: 30, name: '김환자', gHow: expect.objectContaining({ gStart: '09:00', gEnd: '21:00' }) })
    expect(mem.db.allday.find((r) => r.day === '2026-11-29')).toMatchObject({ type: 'memo', memo: '원장님 회의', gEventId: null, gWait: false })
    expect(mem.db.allday.find((r) => r.day === '2026-12-04')).toMatchObject({ type: 'off', staffId: M_KIM, staffName: '김예시' })
    expect(mem.db.offDays.find((o) => o.day === '2026-12-04')).toMatchObject({ gEventId: 'evoff0002', gTitle: '최호 off', wait: false })
    expect(mem.db.allday.find((r) => r.day === '2026-12-07')).toMatchObject({ type: 'memo', memo: '최호 off', gEventId: 'evoff0003' })
  })

  it('AC-8527.2: 구글 목록 읽기가 실패하면 아무것도 적지 않고 번호를 준다', async () => {
    const { app, mem, deps } = rig()
    app.env.lockFree = true
    app.store.failOn('Events.list', new Error('API call to calendar.events.list failed with error: Not Found'))
    expect(await readImport(deps)).toEqual({ ok: false, code: 'E-GCAL-GONE' })
    expect(mem.calls.every((c) => READS.has(c.fn))).toBe(true)
  })
})
