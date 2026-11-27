import { beforeEach, describe, expect, it } from 'vitest'
import { offEventId } from '@/lib/calendar/goff'
import { DEFAULT_CAL_SETTINGS, type CalAllDay } from '@/types/calendar'
import { DEFAULT_GCAL_LOOK, DEFAULT_GCAL_RULES, type GcalLink } from '@/types/gcal'
import { CAL_ID, CAL_NAME, gError, HOSPITAL, load, NOW, TEST_KEY } from '../../../google-code/test/fakeCalendar'
import { readReply } from './client'
import { createMemoryStore, type GcalCaller, type GcalDeps, type GcalParts, type GcalStore } from './deps'
import { fillMemoColors, pullOnce, resetFillMemoColors } from './pull'
import { pushWaiting } from './push'

// 구글 → 웹앱 받기(spec google-link REQ-8525·AC-8505.3, design.md 12-1). 구글은 진짜 Code.gs를 가짜 캘린더에서 돌리고(google-code/test/fakeCalendar),
// DB는 메모리 저장(deps.ts createMemoryStore — 조건 고치기·유일·트리거를 DB처럼 흉내, 시각 글자는 마이크로초까지). 환자 이름은 가짜다

const LINKED = '2026-11-26'
const NOW_MS = Date.parse(NOW) // 한국 2026-11-26 10:00
const SCRIPT = 'https://script.google.com/macros/s/AKfycbFake0123456789abc/exec'
const M_KIM = 'm-00000000000000000000000000000001'
const PARTS: GcalParts = {
  staff: [
    { id: 's-ho', name: '정호연', mark: '호', color: 'lavender' },
    { id: 's-won', name: '박지원', mark: '원', color: 'banana' },
    { id: 's-hyun', name: '이수현', mark: '현', color: 'flamingo' },
  ],
  kinds: DEFAULT_CAL_SETTINGS.kinds,
  people: [
    { id: 's-ho', name: '정호연' },
    { id: 's-won', name: '박지원' },
    { id: 's-hyun', name: '이수현' },
    { id: M_KIM, name: '김예시' },
  ],
}

function linkOf(over: Partial<GcalLink> = {}): GcalLink {
  return {
    scriptUrl: SCRIPT,
    secret: TEST_KEY,
    calendarId: CAL_ID,
    calendarName: CAL_NAME,
    defaultHex: '#4285F4',
    linkedOn: LINKED,
    rules: { ...DEFAULT_GCAL_RULES },
    look: { ...DEFAULT_GCAL_LOOK, noStaffKinds: ['shock'] },
    ...over,
  }
}

const kst = (local: string) => Date.parse(`${local}+09:00`)

function rig(link: Partial<GcalLink> = {}) {
  const app = load()
  app.store.clockMs = NOW_MS // 가짜 구글이 일정에 적는 updated를 지금 뒤로
  const now = () => new Date(app.env.nowMs)
  const mem = createMemoryStore({ now, link: linkOf(link), parts: PARTS })
  const call: GcalCaller = async (l, action, body = {}) => readReply(JSON.stringify(app.post({ ...body, key: l.secret, action })))
  const deps: GcalDeps = { hospitalId: HOSPITAL, call, store: mem.store, now }
  return { app, mem, deps, call }
}

const changeCalls = (app: ReturnType<typeof load>) => app.store.calls.filter((c) => c.api === 'Events.list' && c.opts?.updatedMin !== undefined)
const removes = (app: ReturnType<typeof load>) => app.store.calls.filter((c) => c.api === 'Events.remove')

describe('AC-8525.1 받기: 지난번 끝 − 60초부터, 이은 날 0시 뒤', () => {
  it('AC-8525.1: 처음은 이은 날 0시부터 받아 알아본 예약을 넣고, 받아 온 끝 = 답 now, 다음은 그 끝 − 60초부터', async () => {
    const { app, mem, deps } = rig()
    app.store.timed('evnew0001', '2026-11-27T10:00', '2026-11-27T10:30', { summary: '1234 홍길동 도수 30분 (호)' })

    const first = await pullOnce(deps)
    expect(first).toMatchObject({ ok: true, changed: 1 })
    const [c1] = changeCalls(app)
    expect(c1.opts).toMatchObject({ updatedMin: '2026-11-25T15:00:00.000Z', timeMin: '2026-11-26T00:00:00+09:00', showDeleted: true })
    expect(mem.db.state.pulledUntil).toBe('2026-11-26T01:00:00.000Z')
    expect(mem.db.state.lastOkAt).not.toBeNull()
    const [appt] = mem.db.appts
    expect(appt).toMatchObject({
      gEventId: 'evnew0001',
      day: '2026-11-27',
      start: 600,
      len: 30,
      chart: '1234',
      name: '홍길동',
      kindId: 'dosu',
      staffId: 's-ho',
      staffMark: '호',
      gFrom: 'pull',
      colorFrom: 'google',
      gKeepTitle: true,
      gTitle: '1234 홍길동 도수 30분 (호)',
      gWait: null,
    })

    app.env.nowMs += 2 * 60_000
    const second = await pullOnce(deps)
    expect(second).toMatchObject({ ok: true, changed: 0 })
    expect(changeCalls(app)[1].opts).toMatchObject({ updatedMin: '2026-11-26T00:59:00.000Z', timeMin: '2026-11-26T00:00:00+09:00' })
    expect(mem.db.state.pulledUntil).toBe('2026-11-26T01:02:00.000Z')
    expect(mem.db.appts).toHaveLength(1)
  })

  it('AC-8523.7: 이은 날 0시 전에 시작한 일정은 받아도 아무것도 하지 않는다', async () => {
    const { app, mem, deps } = rig()
    app.store.timed('evold0001', '2026-11-25T23:30', '2026-11-26T00:30', { summary: '1234 홍길동 도수 30분 (호)' }) // 끝이 이은 날 0시 뒤라 받기에 든다
    app.store.timed('evnew0001', '2026-11-28T10:00', '2026-11-28T10:30', { summary: '5678 최시안 도수 30분 (원)' })
    await pullOnce(deps)
    expect(mem.db.appts.map((a) => a.gEventId)).toEqual(['evnew0001'])
  })

  it('AC-8523.6: 못 알아본 새 일정은 고쳐야 할 것, 가져오지 않기로 둔 것은 제목이 그대로면 그대로·바뀌면 다시 알아본다', async () => {
    const { app, mem, deps } = rig()
    app.store.timed('evmeet001', '2026-11-27T13:00', '2026-11-27T14:00', { summary: '원장님 회의' })
    await pullOnce(deps)
    expect(mem.db.appts).toHaveLength(0)
    expect(mem.db.fixes).toHaveLength(1)
    expect(mem.db.fixes[0]).toMatchObject({ gEventId: 'evmeet001', day: '2026-11-27', reason: 'not-appt', state: 'open', gTitle: '원장님 회의' })

    mem.db.fixes[0].state = 'skip'
    app.env.nowMs += 2 * 60_000
    app.store.clockMs = app.env.nowMs
    app.post({ key: TEST_KEY, action: 'put', calendarId: CAL_ID, id: 'evmeet001', fields: { colorId: '5' } })
    await pullOnce(deps)
    expect(mem.db.fixes[0].state).toBe('skip')

    app.env.nowMs += 2 * 60_000
    app.store.clockMs = app.env.nowMs
    app.post({ key: TEST_KEY, action: 'put', calendarId: CAL_ID, id: 'evmeet001', fields: { summary: '2233 서예제 도수 30분 (현)' } })
    await pullOnce(deps)
    expect(mem.db.fixes).toHaveLength(0)
    expect(mem.db.appts[0]).toMatchObject({ gEventId: 'evmeet001', name: '서예제', staffId: 's-hyun' })
  })
})

describe('AC-8525.2 두 PC가 함께 받아도 하나 · 이른 줄만 고침 · pulled_until 앞으로만', () => {
  it('AC-8525.2: 두 PC가 같은 새 일정을 함께 받아도 예약은 하나(병원·g_event_id 유일)', async () => {
    const { app, mem, deps, call } = rig()
    app.store.timed('evtwin001', '2026-11-27T11:00', '2026-11-27T11:30', { summary: '7345 한예제 도수 30분 (원)' })
    const other: GcalDeps = { ...deps, call }
    const [a, b] = await Promise.all([pullOnce(deps), pullOnce(other)])
    expect(a.ok && b.ok).toBe(true)
    expect(mem.calls.filter((c) => c.fn === 'insertAppts')).toHaveLength(2) // 둘 다 넣으려 했다
    expect(mem.db.appts.filter((x) => x.gEventId === 'evtwin001')).toHaveLength(1)
  })

  it('AC-8525.2: 이미 같은 updated를 적은 줄은 다시 고치지 않고, 두 PC가 같은 고침을 함께 받아도 한 번만 바뀐다', async () => {
    const { app, mem, deps, call } = rig()
    const ev = app.store.timed('evsame001', '2026-11-27T11:00', '2026-11-27T11:30', { summary: '7345 한예제 도수 30분 (원)' })
    mem.seedAppt({ day: '2026-11-27', start: 660, name: '한예제', chart: '7345', staffId: 's-won', staffName: '박지원', staffMark: '원', gEventId: 'evsame001', gTitle: ev.summary, gUpdated: ev.updated, gKeepTitle: true, colorFrom: 'google' })
    await pullOnce(deps)
    expect(mem.calls.filter((c) => c.fn === 'applyAppt')).toHaveLength(0)

    app.env.nowMs += 60_000
    app.store.clockMs = app.env.nowMs
    app.post({ key: TEST_KEY, action: 'put', calendarId: CAL_ID, id: 'evsame001', fields: { summary: '7345 한예제 도수 30분 (현)' } })
    const [a, b] = await Promise.all([pullOnce(deps), pullOnce({ ...deps, call })])
    expect(a.ok && b.ok).toBe(true)
    expect(mem.calls.filter((c) => c.fn === 'applyAppt')).toHaveLength(2)
    expect(mem.db.appts).toHaveLength(1)
    expect(mem.db.appts[0]).toMatchObject({ staffId: 's-hyun', staffMark: '현', gTitle: '7345 한예제 도수 30분 (현)' })
    expect((a.ok ? a.changed : 0) + (b.ok ? b.changed : 0)).toBe(1) // 늦게 적은 쪽은 조건(g_updated 더 이름)에 걸려 0줄
  })

  it('AC-8525.2: pulled_until은 앞으로만 간다(늦은 PC가 이른 끝을 적어도 그대로)', async () => {
    const { mem, deps } = rig()
    mem.db.state.pulledUntil = '2026-11-26T01:30:00.000Z' // 다른 PC가 더 늦게까지 받았다
    await pullOnce(deps)
    expect(mem.db.state.pulledUntil).toBe('2026-11-26T01:30:00.000Z')
  })
})

describe('AC-8523.2 양쪽 고침: g_wait_at(DB 글자 그대로)과 구글 updated로 나중 쪽', () => {
  function seedBoth(app: ReturnType<typeof load>, mem: ReturnType<typeof createMemoryStore>, googleAt: string, webAt: string) {
    app.store.clockMs = kst('2026-11-26T09:00:00')
    const ev = app.store.timed('evboth001', '2026-11-27T11:00', '2026-11-27T11:30', { summary: '7345 한예제 도수 30분 (원)' })
    const appt = mem.seedAppt({
      day: '2026-11-27',
      start: 660,
      name: '한예제',
      chart: '7345',
      staffId: 's-won',
      staffName: '박지원',
      staffMark: '원',
      memo: '웹앱 메모',
      gEventId: 'evboth001',
      gTitle: ev.summary,
      gUpdated: ev.updated,
      gKeepTitle: true,
      colorFrom: 'google',
      gWait: 'edit',
      gWaitAt: webAt,
    })
    app.store.clockMs = kst(googleAt)
    app.post({ key: TEST_KEY, action: 'put', calendarId: CAL_ID, id: 'evboth001', fields: { summary: '7345 한예제 도수 30분 (현)' } })
    return appt
  }

  it('AC-8523.2: 웹앱이 나중(10:05 > 구글 10:03)이면 웹앱 이김 — 칸 그대로, 덮인 줄, 보내기 남음', async () => {
    const { app, mem, deps } = rig()
    const webAt = '2026-11-26T01:05:00.000417+00:00'
    seedBoth(app, mem, '2026-11-26T10:03:00', webAt)
    await pullOnce(deps)
    const [appt] = mem.db.appts
    expect(appt).toMatchObject({ staffId: 's-won', memo: '웹앱 메모', gWait: 'edit', gWaitAt: webAt, gNote: '구글에서 10:03에 고친 내용을 웹앱 내용으로 덮었어요' })
  })

  it('AC-8523.2: 구글이 나중(10:07)이면 구글 이김 — 고친 칸, g_wait 비움, 덮인 줄. g_wait_at 조건은 저장소가 준 마이크로초 글자 그대로 넘긴다', async () => {
    const { app, mem, deps } = rig()
    const webAt = '2026-11-26T01:05:00.000417+00:00'
    const seeded = seedBoth(app, mem, '2026-11-26T10:07:00', webAt)
    await pullOnce(deps)
    const apply = mem.calls.find((c) => c.fn === 'applyAppt')
    expect(apply?.args[0]).toBe(seeded.id)
    expect(apply?.args[3]).toBe(webAt) // new Date(webAt).toISOString()('…05.000Z')이면 DB 조건이 맞지 않는다
    const [appt] = mem.db.appts
    expect(appt).toMatchObject({ staffId: 's-hyun', gWait: null, gNote: '웹앱에서 10:05에 고친 내용을 구글 내용으로 덮었어요' })
  })
})

describe('AC-8505.3 구글 글은 적기 전에 maskPrivate', () => {
  it('AC-8505.3: 예약 제목·메모, 고쳐야 할 것 제목·알아본 글의 전화·메일 모양은 …로 가려 보내고 원래 글은 보내지 않는다', async () => {
    const { app, mem, deps } = rig()
    app.store.timed('evmask001', '2026-11-27T10:00', '2026-11-27T10:30', { summary: '1234 홍길동 도수 30분 (호) 010-1234-5678' })
    app.store.timed('evmask002', '2026-11-27T13:00', '2026-11-27T14:00', { summary: '원장님 회의 hong@fake.test' })
    await pullOnce(deps)
    const sent = JSON.stringify(mem.calls.map((c) => c.args))
    expect(sent).not.toContain('010-1234-5678')
    expect(sent).not.toContain('hong@fake.test')
    expect(mem.db.appts[0]).toMatchObject({ memo: '…', gTitle: '1234 홍길동 도수 30분 (호) …' })
    expect(mem.db.fixes[0].gTitle).toBe('원장님 회의 …')
  })
})

describe('AC-8525.3 하루 종일 off 줄·종일 메모', () => {
  const MEMO_ID = 'ssk0123456789abcdef0123456789abcdef'

  it('AC-8525.3: 구글에서 메모 글을 고치면 짝 줄을 고치기로 적어 양쪽에 고친 글 — 지우기·넣기가 없고 지움 줄이 없어 다음 보내기에 remove 없음', async () => {
    const { app, mem, deps } = rig()
    app.store.clockMs = kst('2026-11-26T09:00:00')
    const ev = app.store.allDay(MEMO_ID, '2026-11-28', '2026-11-29', { summary: '학회' })
    const row = mem.seedAllDay({ day: '2026-11-28', type: 'memo', memo: '학회', gEventId: MEMO_ID, gUpdated: ev.updated })
    app.store.clockMs = NOW_MS
    app.post({ key: TEST_KEY, action: 'put', calendarId: CAL_ID, id: MEMO_ID, fields: { summary: '원장님 학회' } })

    await pullOnce(deps)
    expect(mem.db.allday).toEqual([expect.objectContaining({ id: row.id, day: '2026-11-28', memo: '원장님 학회', gEventId: MEMO_ID })])
    expect(mem.calls.map((c) => c.fn)).not.toContain('deleteAllDay')
    expect(mem.calls.map((c) => c.fn)).not.toContain('addAllDay')
    expect(mem.db.deletes).toEqual([])
    await pushWaiting(deps)
    expect(removes(app)).toEqual([])
    expect(app.store.event(MEMO_ID)?.status).toBe('confirmed')
  })

  it('AC-8525.3: 하루 메모 날짜만 옮기면 그 줄의 날짜를 고친다(지우고 다시 넣지 않음)', async () => {
    const { app, mem, deps } = rig()
    app.store.clockMs = kst('2026-11-26T09:00:00')
    const ev = app.store.allDay(MEMO_ID, '2026-11-28', '2026-11-29', { summary: '학회' })
    const row = mem.seedAllDay({ day: '2026-11-28', type: 'memo', memo: '학회', gEventId: MEMO_ID, gUpdated: ev.updated })
    app.store.clockMs = NOW_MS
    app.post({ key: TEST_KEY, action: 'put', calendarId: CAL_ID, id: MEMO_ID, fields: { allDay: true, start: '2026-11-30', end: '2026-12-01' } })
    await pullOnce(deps)
    expect(mem.db.allday).toEqual([expect.objectContaining({ id: row.id, day: '2026-11-30', memo: '학회' })])
    expect(mem.calls.map((c) => c.fn)).not.toContain('deleteAllDay')
    expect(mem.db.deletes).toEqual([])
  })

  it('AC-8525.3: 여러 날 메모 범위가 바뀌면 남는 날 고치기·새 날 넣기·빠진 날만 지우기, 그 지움 줄은 바로 버린다', async () => {
    const { app, mem, deps } = rig()
    app.store.clockMs = kst('2026-11-26T09:00:00')
    const ev = app.store.allDay(MEMO_ID, '2026-11-28', '2026-12-01', { summary: '학회' })
    const rows = ['2026-11-28', '2026-11-29', '2026-11-30'].map((day) => mem.seedAllDay({ day, type: 'memo', memo: '학회', gEventId: MEMO_ID, gUpdated: ev.updated }))
    app.store.clockMs = NOW_MS
    app.post({ key: TEST_KEY, action: 'put', calendarId: CAL_ID, id: MEMO_ID, fields: { allDay: true, start: '2026-11-29', end: '2026-12-02' } })

    await pullOnce(deps)
    const byDay = Object.fromEntries(mem.db.allday.map((r) => [r.day, r.id]))
    expect(Object.keys(byDay).sort()).toEqual(['2026-11-29', '2026-11-30', '2026-12-01'])
    expect(byDay['2026-11-29']).toBe(rows[1].id)
    expect(byDay['2026-11-30']).toBe(rows[2].id)
    expect(mem.calls.filter((c) => c.fn === 'deleteAllDay').map((c) => c.args[0])).toEqual([rows[0].id])
    expect(mem.db.deletes).toEqual([])
    await pushWaiting(deps)
    expect(removes(app)).toEqual([])
    expect(app.store.event(MEMO_ID)).toMatchObject({ status: 'confirmed', start: { date: '2026-11-29' }, end: { date: '2026-12-02' } })
  })

  it('AC-8525.3: 구글에서 지운 메모는 받기가 줄을 지우고 그 지움 줄도 바로 지운다', async () => {
    const { app, mem, deps } = rig()
    app.store.clockMs = kst('2026-11-26T09:00:00')
    const ev = app.store.allDay(MEMO_ID, '2026-11-28', '2026-11-29', { summary: '학회' })
    mem.seedAllDay({ day: '2026-11-28', type: 'memo', memo: '학회', gEventId: MEMO_ID, gUpdated: ev.updated })
    app.store.clockMs = NOW_MS
    app.post({ key: TEST_KEY, action: 'remove', calendarId: CAL_ID, id: MEMO_ID })
    await pullOnce(deps)
    expect(mem.db.allday).toEqual([])
    expect(mem.db.deletes).toEqual([])
  })

  it('AC-8525.3: 구글 off 줄 사람과 그날 웹앱 off 줄(휴가에서 온 줄도)이 같아지고, 짝(gcal_off_days)을 적는다', async () => {
    const { app, mem, deps } = rig()
    const won = mem.seedAllDay({ day: '2026-11-28', type: 'off', memo: null, staffId: 's-won', staffName: '박지원' }) // 휴가에서 온 줄
    mem.seedAllDay({ day: '2026-11-28', type: 'off', memo: null, staffId: 's-hyun', staffName: '이수현', part: 'pm' }) // 반차는 그대로
    app.store.allDay('evoff0001', '2026-11-28', '2026-11-29', { summary: '정호연, 김예시 off', colorId: '3' })

    await pullOnce(deps)
    const offs = mem.db.allday.filter((r) => r.type === 'off' && r.day === '2026-11-28')
    expect(offs.filter((r) => !r.part).map((r) => r.staffId).sort()).toEqual(['m-00000000000000000000000000000001', 's-ho'].sort())
    expect(offs.find((r) => r.part === 'pm')?.staffId).toBe('s-hyun')
    expect(mem.db.allday.some((r) => r.id === won.id)).toBe(false)
    expect(mem.db.offDays).toEqual([expect.objectContaining({ day: '2026-11-28', gEventId: 'evoff0001', gTitle: '정호연, 김예시 off', wait: false })])
    await pushWaiting(deps)
    expect(app.store.writes()).toEqual([]) // 구글과 같으니 보내지 않는다
  })

  // 아직 구글로 못 보낸 직원 휴가 off 줄 — '나중 고친 쪽'(예약의 g_wait_at > updated와 같음): 그날 짝 wait_at(DB 글자 그대로)과 구글 updated
  const OFF_DAY = '2026-11-28'
  const WEB_AT = '2026-11-26T01:05:00.000417+00:00' // 한국 10:05 — 박지원 휴가를 넣은 때(트리거가 적은 wait_at)
  function seedOffWait(app: ReturnType<typeof load>, mem: ReturnType<typeof createMemoryStore>) {
    app.store.clockMs = kst('2026-11-26T09:00:00')
    const ev = app.store.allDay('evoff0001', OFF_DAY, '2026-11-29', { summary: '정호연 off', colorId: '3' })
    mem.seedAllDay({ day: OFF_DAY, type: 'off', memo: null, staffId: 's-ho', staffName: '정호연' })
    Object.assign(mem.db.offDays[0], { gEventId: 'evoff0001', gTitle: ev.summary, gUpdated: ev.updated, wait: false, waitAt: null }) // 9시에 맞춤
    mem.seedAllDay({ day: OFF_DAY, type: 'off', memo: null, staffId: 's-won', staffName: '박지원' }) // 휴가에서 온 줄, 아직 못 보냄
    mem.db.offDays[0].waitAt = WEB_AT
    expect(mem.db.offDays[0]).toMatchObject({ wait: true, waitAt: WEB_AT })
  }
  const offPeople = (mem: ReturnType<typeof createMemoryStore>) =>
    mem.db.allday
      .filter((r) => r.type === 'off' && r.day === OFF_DAY && !r.part)
      .map((r) => r.staffId)
      .sort()

  it('AC-8525.3: 못 보낸 휴가 off 줄 + 그보다 이른 구글 고침(10:03 < 10:05) → 웹 줄·wait 그대로, 짝 구글 칸만 조건 쓰기, 다음 보내기가 웹 줄로 맞춘다', async () => {
    const { app, mem, deps } = rig()
    seedOffWait(app, mem)
    app.store.clockMs = kst('2026-11-26T10:03:00')
    app.post({ key: TEST_KEY, action: 'put', calendarId: CAL_ID, id: 'evoff0001', fields: { summary: '정호연, 이수현 off' } })
    const gUpdated = app.store.event('evoff0001')?.updated

    await pullOnce(deps)
    expect(offPeople(mem)).toEqual(['s-ho', 's-won']) // 지우지도(박지원) 더하지도(이수현) 않는다
    expect(mem.calls.map((c) => c.fn)).not.toContain('deleteAllDay')
    expect(mem.calls.map((c) => c.fn)).not.toContain('addAllDay')
    expect(mem.db.offDays).toEqual([{ day: OFF_DAY, gEventId: 'evoff0001', gTitle: '정호연, 이수현 off', gUpdated, wait: true, waitAt: WEB_AT }])
    const save = mem.calls.filter((c) => c.fn === 'saveOffDay')
    expect(save).toHaveLength(1)
    expect(save[0].args[1]).toBe(WEB_AT) // 저장소가 준 마이크로초 글자 그대로

    await pushWaiting(deps)
    expect(app.store.event('evoff0001')?.summary).toBe('박지원, 정호연 off')
    expect(mem.db.offDays[0]).toMatchObject({ gEventId: 'evoff0001', wait: false })
  })

  it('AC-8525.3: 못 보낸 휴가 off 줄 + 그보다 나중 구글 고침(10:07 > 10:05) → 구글 따름(사람 줄 같게, wait 풂)', async () => {
    const { app, mem, deps } = rig()
    seedOffWait(app, mem)
    app.store.clockMs = kst('2026-11-26T10:07:00')
    app.post({ key: TEST_KEY, action: 'put', calendarId: CAL_ID, id: 'evoff0001', fields: { summary: '정호연, 이수현 off' } })

    await pullOnce(deps)
    expect(offPeople(mem)).toEqual(['s-ho', 's-hyun'])
    expect(mem.db.offDays).toEqual([expect.objectContaining({ day: OFF_DAY, gEventId: 'evoff0001', gTitle: '정호연, 이수현 off', wait: false })])
  })

  it('AC-8525.3: 못 보낸 휴가 off 줄 + 그보다 이른 시각에 구글이 그 off 일정을 지움 → 웹 줄·wait 그대로, 다음 보내기가 그날 off 일정을 다시 만든다', async () => {
    const { app, mem, deps } = rig()
    seedOffWait(app, mem)
    app.store.clockMs = kst('2026-11-26T10:03:00')
    app.post({ key: TEST_KEY, action: 'remove', calendarId: CAL_ID, id: 'evoff0001' })

    await pullOnce(deps)
    expect(offPeople(mem)).toEqual(['s-ho', 's-won'])
    expect(mem.calls.map((c) => c.fn)).not.toContain('deleteAllDay')
    expect(mem.db.offDays).toEqual([expect.objectContaining({ day: OFF_DAY, gEventId: null, gTitle: null, wait: true, waitAt: WEB_AT })])
    expect(mem.calls.find((c) => c.fn === 'saveOffDay')?.args[1]).toBe(WEB_AT)

    await pushWaiting(deps)
    const made = app.store.event(offEventId(HOSPITAL, OFF_DAY))
    expect(made).toMatchObject({ status: 'confirmed', summary: '정호연, 박지원 off', start: { date: OFF_DAY } })
    expect(mem.db.offDays[0]).toMatchObject({ gEventId: offEventId(HOSPITAL, OFF_DAY), wait: false })
  })

  it('AC-8525.3: 이름을 못 찾은 off 줄은 고쳐야 할 것(off-name), 끝 글이 off가 아니면 종일 메모(20자)', async () => {
    const { app, mem, deps } = rig()
    app.store.allDay('evoff0002', '2026-11-28', '2026-11-29', { summary: '최호 off' })
    app.store.allDay('evmemo002', '2026-11-29', '2026-12-01', { summary: '원장님 학회 서울 컨벤션 센터 3층 대강당' })
    await pullOnce(deps)
    expect(mem.db.fixes).toEqual([expect.objectContaining({ gEventId: 'evoff0002', day: '2026-11-28', reason: 'off-name', allDay: true })])
    expect(mem.db.allday.map((r) => [r.day, r.memo, r.gEventId])).toEqual([
      ['2026-11-29', '원장님 학회 서울 컨벤션 센터 3층', 'evmemo002'],
      ['2026-11-30', '원장님 학회 서울 컨벤션 센터 3층', 'evmemo002'],
    ])
  })
})

describe('AC-8525.4 받기 실패', () => {
  it('AC-8525.4: 실패하면 gcal_state에 실패 시작·번호가 남고, 다음 성공에 풀린다', async () => {
    const { app, mem, deps } = rig()
    app.store.failOn('Events.list', gError(500, 'backendError', 'Backend Error'))
    const bad = await pullOnce(deps)
    expect(bad).toEqual({ ok: false, code: 'E-GCAL-REACH', off: false })
    expect(mem.db.state.failCode).toBe('E-GCAL-REACH')
    expect(mem.db.state.failSince).not.toBeNull()
    expect(mem.db.state.pulledUntil).toBeNull()

    const good = await pullOnce(deps)
    expect(good.ok).toBe(true)
    expect(mem.db.state).toMatchObject({ failCode: null, failSince: null })
  })

  it('AC-8525.4: 비밀 글자가 틀리면 E-GCAL-KEY, 잇지 않았으면(캘린더·이은 날 없음) 부르지 않는다', async () => {
    const wrong = rig({ secret: 'Wrong_0123456789-abcdefABCDEF-xyz' })
    expect(await pullOnce(wrong.deps)).toEqual({ ok: false, code: 'E-GCAL-KEY', off: false })
    expect(wrong.mem.db.state.failCode).toBe('E-GCAL-KEY')
    const off = rig({ linkedOn: null })
    expect(await pullOnce(off.deps)).toEqual({ ok: false, code: null, off: true })
    expect(off.app.store.calls).toEqual([])
  })
})

describe('AC-8525.5 too_old: [이은 날 0시, 오늘 + 2년 0시)를 처음부터 다시', () => {
  function tooOld(rules: Partial<GcalLink['rules']> = {}) {
    const r = rig({ rules: { ...DEFAULT_GCAL_RULES, ...rules } })
    r.mem.db.state.pulledUntil = '2026-11-27T00:00:00.000Z'
    r.app.store.tooOldBefore = Date.parse('2026-12-01T00:00:00Z') // since가 이보다 이르면 410
    r.app.env.nowMs = Date.parse('2026-12-20T01:00:00Z') // 한국 2026-12-20 10:00
    r.app.store.clockMs = r.app.env.nowMs
    return r
  }

  it('AC-8525.5: 범위 안·g_event_id 있음·보낼 것 없음인 줄만 목록과 견줘 없으면 구글에서 지움으로(규칙 취소), 보낼 것 남은 새 예약·메모와 범위 밖 줄은 그대로', async () => {
    const { app, mem, deps } = tooOld()
    const keep = app.store.timed('evkeep001', '2026-12-21T10:00', '2026-12-21T10:30', { summary: '1111 최시안 도수 30분 (호)' })
    app.store.timed('evfresh01', '2026-12-22T10:00', '2026-12-22T10:30', { summary: '2222 윤모의 도수 30분 (원)' })
    const base = { start: 600, name: '홍길동', chart: '1234', staffId: 's-ho', staffName: '정호연', staffMark: '호' } as const
    const gone = mem.seedAppt({ ...base, day: '2026-12-21', gEventId: 'evgone001', gUpdated: '2026-11-26T01:00:00.000Z' })
    const waiting = mem.seedAppt({ ...base, day: '2026-12-21', gEventId: 'ssk00000000000000000000000000000001', gWait: 'new', gFrom: 'web' })
    const far = mem.seedAppt({ ...base, day: '2028-12-25', gEventId: 'evfar0001', gUpdated: '2026-11-26T01:00:00.000Z' })
    const kept = mem.seedAppt({ ...base, day: '2026-12-21', name: '최시안', chart: '1111', gEventId: 'evkeep001', gTitle: keep.summary, gUpdated: keep.updated, gKeepTitle: true })
    const memoGone = mem.seedAllDay({ day: '2026-12-23', type: 'memo', memo: '학회', gEventId: 'evmemo001', gUpdated: '2026-11-26T01:00:00.000Z' })
    const memoWait = mem.seedAllDay({ day: '2026-12-23', type: 'memo', memo: '회식', gEventId: 'ssk00000000000000000000000000000002', gWait: true })

    const r = await pullOnce(deps)
    expect(r).toMatchObject({ ok: true, full: true })
    const list = app.store.calls.find((c) => c.api === 'Events.list' && c.opts?.updatedMin === undefined)
    expect(list?.opts).toMatchObject({ timeMin: '2026-11-26T00:00:00+09:00', timeMax: '2028-12-20T00:00:00+09:00', showDeleted: false })

    const byId = (id: string) => mem.db.appts.find((a) => a.id === id)
    expect(byId(gone.id)).toMatchObject({ status: 'cancel', gGone: true })
    expect(byId(waiting.id)).toMatchObject({ status: 'auto', gGone: false, gWait: 'new' })
    expect(byId(far.id)).toMatchObject({ status: 'auto', gGone: false })
    expect(byId(kept.id)).toMatchObject({ status: 'auto', gGone: false })
    expect(mem.db.appts.find((a) => a.gEventId === 'evfresh01')).toMatchObject({ name: '윤모의', gFrom: 'pull' })
    expect(mem.db.allday.map((x) => x.id)).toEqual([memoWait.id])
    expect(mem.db.allday.some((x) => x.id === memoGone.id)).toBe(false)
    expect(mem.db.deletes).toEqual([])
    expect(mem.db.state).toMatchObject({ pulledUntil: '2026-12-20T01:00:00.000Z', failCode: null })
  })

  it("AC-8525.5: 규칙이 '웹앱에서도 지워요'면 목록에 없는 줄을 지우고, 그 지움 줄은 구글에 보내지 않는다", async () => {
    const { app, mem, deps } = tooOld({ onGoogleDelete: 'delete' })
    mem.seedAppt({ day: '2026-12-21', start: 600, name: '홍길동', gEventId: 'evgone001', gUpdated: '2026-11-26T01:00:00.000Z' })
    await pullOnce(deps)
    expect(mem.db.appts).toEqual([])
    expect(mem.db.deletes).toEqual([])
    await pushWaiting(deps)
    expect(removes(app)).toEqual([])
  })
})

describe('AC-8547.1·AC-8547.3 받기: 휴무 줄 색은 구글 off 일정 색을 따른다', () => {
  const BANANA_LOOK = { ...DEFAULT_GCAL_LOOK, noStaffKinds: ['shock'], offColor: 'banana' as const }
  const offColorCalls = (mem: ReturnType<typeof createMemoryStore>) => mem.calls.filter((c) => c.fn === 'setOffColor')

  it('AC-8547.1: off 일정 색(포도)이 휴무 줄 색(바나나)과 다르면 받기 끝에 setOffColor(포도)를 한 번 부르고 offColor만 바뀐다', async () => {
    const { app, mem, deps } = rig({ look: BANANA_LOOK })
    app.store.allDay('evoff0001', '2026-11-28', '2026-11-29', { summary: '정호연 off', colorId: '3' })
    const r = await pullOnce(deps)
    expect(r).toMatchObject({ ok: true })
    expect(offColorCalls(mem).map((c) => c.args)).toEqual([['grape']])
    expect(mem.db.link.look).toEqual({ ...BANANA_LOOK, offColor: 'grape' })
    expect(mem.db.link.rules).toEqual(DEFAULT_GCAL_RULES)
    // 다음 받기는 새 색과 같아 다시 부르지 않는다
    app.env.nowMs += 2 * 60_000
    await pullOnce(deps)
    expect(offColorCalls(mem)).toHaveLength(1)
  })

  it('AC-8547.1: 그 받기에 off 일정이 여럿이면 updated가 가장 나중인 것의 색이다', async () => {
    const { app, mem, deps } = rig({ look: BANANA_LOOK })
    app.store.allDay('evoff0001', '2026-11-28', '2026-11-29', { summary: '정호연 off', colorId: '7', updated: '2026-11-26T00:50:00.000Z' })
    app.store.allDay('evoff0002', '2026-11-30', '2026-12-01', { summary: '박지원 off', colorId: '3', updated: '2026-11-26T00:40:00.000Z' })
    await pullOnce(deps)
    expect(offColorCalls(mem).map((c) => c.args)).toEqual([['peacock']])
    expect(mem.db.link.look.offColor).toBe('peacock')
  })

  it('AC-8547.3: off 일정 색이 없거나(캘린더 기본 색) 이미 같은 색이면 저장하지 않고, off가 아닌 일정 색은 보지 않는다', async () => {
    const plain = rig({ look: BANANA_LOOK })
    plain.app.store.allDay('evoff0001', '2026-11-28', '2026-11-29', { summary: '정호연 off' })
    plain.app.store.allDay('evmemo001', '2026-11-29', '2026-11-30', { summary: '원장님 학회', colorId: '3' })
    plain.app.store.timed('evappt001', '2026-11-27T10:00', '2026-11-27T10:30', { summary: '1234 홍길동 도수 30분 (호)', colorId: '3' })
    expect(await pullOnce(plain.deps)).toMatchObject({ ok: true })
    expect(offColorCalls(plain.mem)).toEqual([])
    expect(plain.mem.db.link.look.offColor).toBe('banana')

    const same = rig({ look: BANANA_LOOK })
    same.app.store.allDay('evoff0001', '2026-11-28', '2026-11-29', { summary: '정호연 off', colorId: '5' })
    await pullOnce(same.deps)
    expect(offColorCalls(same.mem)).toEqual([])
  })

  it.each([
    ['던짐', async () => Promise.reject(new Error('함수 없음'))],
    ['거짓', async () => false],
  ])('AC-8547.3: 색 저장이 실패(%s)해도 받기 결과는 그대로다', async (_name, fail) => {
    const ok = rig({ look: BANANA_LOOK })
    const bad = rig({ look: BANANA_LOOK })
    for (const r of [ok, bad]) {
      r.app.store.allDay('evoff0001', '2026-11-28', '2026-11-29', { summary: '정호연 off', colorId: '3' })
      r.app.store.timed('evappt001', '2026-11-27T10:00', '2026-11-27T10:30', { summary: '1234 홍길동 도수 30분 (호)' })
    }
    const want = await pullOnce(ok.deps)
    const got = await pullOnce({ ...bad.deps, store: { ...bad.mem.store, setOffColor: fail } })
    expect(got).toEqual(want)
    expect(bad.mem.db.link.look.offColor).toBe('banana')
    expect(bad.mem.db.state.failCode).toBeNull()
    expect(bad.mem.db.offDays).toEqual(ok.mem.db.offDays)
    expect(bad.mem.db.appts.map((a) => a.gEventId)).toEqual(['evappt001'])
  })
})

describe('AC-8554.4 받기: 구글과 이은 종일 메모 줄 색 = 그 구글 일정 색', () => {
  const MEMO_ID = 'ssk0123456789abcdef0123456789abcdef'
  beforeEach(() => resetFillMemoColors())

  it('AC-8554.4: 새 하루 종일 메모는 그 일정 색(포도 → grape)으로, 색 없는 일정은 default로 넣고 구글 일정은 바꾸지 않는다', async () => {
    const { app, mem, deps } = rig()
    app.store.allDay('evmemo001', '2026-11-28', '2026-11-29', { summary: '원장님 학회', colorId: '3' })
    app.store.allDay('evmemo002', '2026-11-29', '2026-11-30', { summary: '회식' })
    expect(await pullOnce(deps)).toMatchObject({ ok: true, changed: 2 })
    const rows = [...mem.db.allday].sort((a, b) => (a.day < b.day ? -1 : 1))
    expect(rows.map((r) => [r.day, r.memo, r.gEventId, r.gColor])).toEqual([
      ['2026-11-28', '원장님 학회', 'evmemo001', 'grape'],
      ['2026-11-29', '회식', 'evmemo002', 'default'],
    ])
    const sent = mem.calls.filter((c) => c.fn === 'addAllDay').map((c) => c.args[0] as CalAllDay)
    expect(sent.map((r) => [r.gEventId, r.gColor]).sort()).toEqual([
      ['evmemo001', 'grape'],
      ['evmemo002', 'default'],
    ])
    expect(app.store.writes()).toEqual([])
    expect(app.store.event('evmemo001')?.colorId).toBe('3')
  })

  it('AC-8554.4: 구글에서 색만 바꾼 메모는 같은 줄을 고치기로 그 색으로 고치고 바뀐 수에 든다 — 글·날·색이 그대로면 들지 않는다', async () => {
    const { app, mem, deps } = rig()
    app.store.clockMs = kst('2026-11-26T09:00:00')
    const ev = app.store.allDay(MEMO_ID, '2026-11-28', '2026-11-29', { summary: '학회' })
    const row = mem.seedAllDay({ day: '2026-11-28', type: 'memo', memo: '학회', gEventId: MEMO_ID, gUpdated: ev.updated, gColor: 'default' })
    app.store.clockMs = NOW_MS
    app.post({ key: TEST_KEY, action: 'put', calendarId: CAL_ID, id: MEMO_ID, fields: { colorId: '3' } })

    expect(await pullOnce(deps)).toMatchObject({ ok: true, changed: 1 })
    expect(mem.db.allday).toEqual([expect.objectContaining({ id: row.id, day: '2026-11-28', memo: '학회', gEventId: MEMO_ID, gColor: 'grape' })])
    expect(mem.calls.find((c) => c.fn === 'applyMemo')?.args[1]).toEqual({ memo: '학회', gColor: 'grape' })
    expect(mem.calls.map((c) => c.fn)).not.toContain('addAllDay')
    expect(mem.calls.map((c) => c.fn)).not.toContain('deleteAllDay')
    expect(app.store.event(MEMO_ID)?.colorId).toBe('3')

    app.env.nowMs += 2 * 60_000
    app.store.clockMs = app.env.nowMs
    app.post({ key: TEST_KEY, action: 'put', calendarId: CAL_ID, id: MEMO_ID, fields: { description: '설명만 고침' } })
    const updated = app.store.event(MEMO_ID)?.updated
    expect(await pullOnce(deps)).toMatchObject({ ok: true, changed: 0 })
    expect(mem.db.allday).toEqual([expect.objectContaining({ id: row.id, gColor: 'grape', gUpdated: updated })])
  })

  it('AC-8554.4: 날짜를 옮긴 메모(남는 날 없음)도 그 줄 고치기에 일정 색을 함께 적는다', async () => {
    const { app, mem, deps } = rig()
    app.store.clockMs = kst('2026-11-26T09:00:00')
    const ev = app.store.allDay(MEMO_ID, '2026-11-28', '2026-11-29', { summary: '학회' })
    const row = mem.seedAllDay({ day: '2026-11-28', type: 'memo', memo: '학회', gEventId: MEMO_ID, gUpdated: ev.updated })
    app.store.clockMs = NOW_MS
    app.post({ key: TEST_KEY, action: 'put', calendarId: CAL_ID, id: MEMO_ID, fields: { allDay: true, start: '2026-11-30', end: '2026-12-01', colorId: '7' } })

    expect(await pullOnce(deps)).toMatchObject({ ok: true, changed: 1 })
    expect(mem.db.allday).toEqual([expect.objectContaining({ id: row.id, day: '2026-11-30', memo: '학회', gColor: 'peacock' })])
    expect(mem.calls.find((c) => c.fn === 'applyMemo')?.args[1]).toEqual({ day: '2026-11-30', memo: '학회', gColor: 'peacock' })
  })
})

describe('AC-8554.5 받기 뒤 이 고침 전 메모의 빈 색 채우기(fillMemoColors)', () => {
  const OLD = '2026-11-20T00:00:00.000Z' // 이은 날 전에 고친 구글 일정(받기 changes에 들지 않는다)
  const lists = (app: ReturnType<typeof load>) => app.store.calls.filter((c) => c.api === 'Events.list' && c.opts?.updatedMin === undefined)
  const gapCalls = (mem: ReturnType<typeof createMemoryStore>) => mem.calls.filter((c) => c.fn === 'memoColorGap')
  const colorOf = (mem: ReturnType<typeof createMemoryStore>, id: string) => mem.db.allday.find((r) => r.id === id)?.gColor
  beforeEach(() => resetFillMemoColors())

  /** 색이 빈 옛 메모 줄 + 그 구글 일정 */
  function seedOld(r: ReturnType<typeof rig>, id: string, day: string, next: string, colorId?: string) {
    r.app.store.allDay(id, day, next, { summary: '학회', updated: OLD, ...(colorId ? { colorId } : {}) })
    return r.mem.seedAllDay({ day, type: 'memo', memo: '학회', gEventId: id, gUpdated: OLD })
  }

  it('AC-8554.5: 빈 색 메모 줄만 모아 구글 목록을 [가장 이른 날, 가장 늦은 날 + 1일) 쪽마다 읽고 그 일정 색(목록에 없음 = default)으로 채운다 — 보낼 것 남은 메모·웹앱에만 있는 메모·이미 색 있는 줄은 그대로', async () => {
    const r = rig()
    const { app, mem, deps } = r
    app.store.maxPage = 1 // 쪽 나눔을 보려고
    const grape = seedOld(r, 'evold0001', '2026-11-28', '2026-11-29', '3')
    app.store.timed('evother01', '2026-12-05T10:00', '2026-12-05T11:00', { summary: '원장님 회의', colorId: '7', updated: OLD })
    app.store.allDay('evfar0001', '2027-03-01', '2027-03-02', { summary: '워크숍', colorId: '7', updated: OLD })
    const gone = mem.seedAllDay({ day: '2026-12-10', type: 'memo', memo: '회식', gEventId: 'evgone001', gUpdated: OLD }) // 구글 목록에 없음
    const waiting = mem.seedAllDay({ day: '2026-12-01', type: 'memo', memo: '송년회', gEventId: 'ssk00000000000000000000000000000001', gWait: true })
    const webOnly = mem.seedAllDay({ day: '2026-12-02', type: 'memo', memo: '대청소' })
    const colored = mem.seedAllDay({ day: '2027-03-01', type: 'memo', memo: '워크숍', gEventId: 'evfar0001', gUpdated: OLD, gColor: 'basil' })
    mem.seedAllDay({ day: '2026-12-03', type: 'off', memo: null, staffId: 's-ho', staffName: '정호연' })

    expect(await fillMemoColors(deps, linkOf())).toBe(2)
    expect(gapCalls(mem).map((c) => c.args)).toEqual([['2025-11-26', '2029-11-25']]) // 한국 오늘 − 1년 ~ 오늘 + 3년 − 1일
    expect(mem.calls.filter((c) => c.fn === 'listAllDay').map((c) => c.args)).toEqual([['2025-11-26', '2029-11-25']])
    const read = lists(app)
    expect(read.length).toBeGreaterThanOrEqual(2)
    for (const c of read) expect(c.opts).toMatchObject({ timeMin: '2026-11-28T00:00:00+09:00', timeMax: '2026-12-11T00:00:00+09:00' })
    expect(read[1].opts?.pageToken).toBeTruthy()
    expect(mem.calls.filter((c) => c.fn === 'fillMemoColor').map((c) => c.args)).toEqual([
      [grape.id, 'grape'],
      [gone.id, 'default'],
    ])
    expect([grape, gone, waiting, webOnly, colored].map((x) => colorOf(mem, x.id))).toEqual(['grape', 'default', null, null, 'basil'])
    expect(app.store.writes()).toEqual([])
  })

  it('AC-8554.5: 빈 색 줄이 없으면(기간 밖 줄만) 종일 줄도 구글도 읽지 않고 0, 연결에 캘린더가 없으면 아무것도 읽지 않는다', async () => {
    const { app, mem, deps } = rig()
    mem.seedAllDay({ day: '2026-11-28', type: 'memo', memo: '학회', gEventId: 'evold0001', gColor: 'grape' })
    mem.seedAllDay({ day: '2026-11-29', type: 'memo', memo: '회식', gEventId: 'ssk00000000000000000000000000000001', gWait: true })
    mem.seedAllDay({ day: '2026-11-30', type: 'memo', memo: '대청소' })
    mem.seedAllDay({ day: '2025-11-25', type: 'memo', memo: '옛 학회', gEventId: 'evvold001' })
    mem.seedAllDay({ day: '2029-11-26', type: 'memo', memo: '먼 학회', gEventId: 'evvfar001' })

    expect(await fillMemoColors(deps, linkOf())).toBe(0)
    expect(gapCalls(mem)).toHaveLength(1)
    expect(mem.calls.map((c) => c.fn)).not.toContain('listAllDay')
    expect(app.store.calls).toEqual([])
    // 빈 색이 없었으니 기다리지 않는다
    expect(await fillMemoColors(deps, linkOf())).toBe(0)
    expect(gapCalls(mem)).toHaveLength(2)

    expect(await fillMemoColors(deps, linkOf({ calendarId: null }))).toBe(0)
    expect(gapCalls(mem)).toHaveLength(2)
  })

  it('AC-8554.5: 받기가 성공하면 끝(휴무 줄 색 맞추기 뒤)에 한 번 부르고, 받기가 실패하면 부르지 않는다', async () => {
    const r = rig({ look: { ...DEFAULT_GCAL_LOOK, noStaffKinds: ['shock'], offColor: 'banana' } })
    const { app, mem, deps } = r
    const row = seedOld(r, 'evold0001', '2026-11-28', '2026-11-29', '3')
    app.store.allDay('evoff0001', '2026-11-30', '2026-12-01', { summary: '정호연 off', colorId: '3' })
    expect(await pullOnce(deps)).toMatchObject({ ok: true })
    const fns = mem.calls.map((c) => c.fn)
    expect(fns.filter((f) => f === 'memoColorGap')).toHaveLength(1)
    expect(fns.indexOf('memoColorGap')).toBeGreaterThan(fns.indexOf('markOk'))
    expect(fns.indexOf('memoColorGap')).toBeGreaterThan(fns.indexOf('setOffColor'))
    expect(colorOf(mem, row.id)).toBe('grape')

    const bad = rig()
    seedOld(bad, 'evold0001', '2026-11-28', '2026-11-29', '3')
    bad.app.store.failOn('Events.list', gError(500, 'backendError', 'Backend Error'))
    expect(await pullOnce(bad.deps)).toMatchObject({ ok: false })
    expect(gapCalls(bad.mem)).toEqual([])
  })

  it.each(['memoColorGap', 'listAllDay', 'fillMemoColor'] as const)('AC-8554.5: 채우기(%s)가 던져도 받기 결과는 그대로다', async (fn) => {
    const ok = rig()
    const bad = rig()
    for (const r of [ok, bad]) {
      seedOld(r, 'evold0001', '2026-11-28', '2026-11-29', '3')
      r.app.store.timed('evappt001', '2026-11-27T10:00', '2026-11-27T10:30', { summary: '1234 홍길동 도수 30분 (호)' })
    }
    const want = await pullOnce(ok.deps)
    expect(ok.mem.db.allday[0].gColor).toBe('grape')
    resetFillMemoColors()
    const boom = async () => {
      throw new Error('칸 없음')
    }
    const store: GcalStore = { ...bad.mem.store, [fn]: boom }
    const got = await pullOnce({ ...bad.deps, store })
    expect(got).toEqual(want)
    expect(bad.mem.db.state.failCode).toBeNull()
    expect(bad.mem.db.allday[0].gColor).toBeNull()
    expect(bad.mem.db.appts.map((a) => a.gEventId)).toEqual(['evappt001'])
  })

  it('AC-8554.5: 채우기가 던지면(구글 목록 실패) 1시간 안 다음 받기는 채우기를 건너뛰고(목록 0번), 1시간이 지나면 다시 읽어 채운다', async () => {
    const r = rig()
    const { app, mem, deps, call } = r
    const row = seedOld(r, 'evold0001', '2026-11-28', '2026-11-29', '3')
    let failList = true
    const flaky: GcalDeps = {
      ...deps,
      call: async (l, action, body) => {
        if (action === 'list' && failList) throw new Error('목록 실패')
        return call(l, action, body)
      },
    }
    expect(await pullOnce(flaky)).toMatchObject({ ok: true })
    expect(gapCalls(mem)).toHaveLength(1)
    expect(colorOf(mem, row.id)).toBeNull()

    failList = false
    app.env.nowMs += 59 * 60_000
    expect(await pullOnce(flaky)).toMatchObject({ ok: true })
    expect(gapCalls(mem)).toHaveLength(1)
    expect(lists(app)).toHaveLength(0)
    expect(colorOf(mem, row.id)).toBeNull()

    app.env.nowMs += 60_000 // 처음 실패에서 1시간
    expect(await pullOnce(flaky)).toMatchObject({ ok: true })
    expect(lists(app)).toHaveLength(1)
    expect(colorOf(mem, row.id)).toBe('grape')
  })

  it('AC-8554.5: 채운 뒤에도 빈 색 줄이 남으면(못 채운 줄, 줄 실패는 삼킴) 1시간 안 다음 받기는 건너뛰고, 다 채운 뒤에는 기다리지 않는다', async () => {
    const r = rig()
    const { app, mem, deps } = r
    const a = seedOld(r, 'evold0001', '2026-11-28', '2026-11-29', '3')
    const b = seedOld(r, 'evold0002', '2026-11-29', '2026-11-30', '7')
    const real = mem.store.fillMemoColor
    const stuck: GcalDeps = {
      ...deps,
      store: { ...mem.store, fillMemoColor: (id, color) => (id === b.id ? Promise.reject(new Error('막힘')) : real(id, color)) },
    }
    expect(await pullOnce(stuck)).toMatchObject({ ok: true })
    expect([colorOf(mem, a.id), colorOf(mem, b.id)]).toEqual(['grape', null])
    expect(lists(app)).toHaveLength(1)

    app.env.nowMs += 30 * 60_000
    await pullOnce(stuck)
    expect(gapCalls(mem)).toHaveLength(1)
    expect(lists(app)).toHaveLength(1)

    app.env.nowMs += 31 * 60_000
    await pullOnce(deps)
    expect(lists(app)).toHaveLength(2)
    expect(lists(app)[1].opts).toMatchObject({ timeMin: '2026-11-29T00:00:00+09:00', timeMax: '2026-11-30T00:00:00+09:00' })
    expect([colorOf(mem, a.id), colorOf(mem, b.id)]).toEqual(['grape', 'peacock'])

    app.env.nowMs += 2 * 60_000
    await pullOnce(deps)
    expect(gapCalls(mem)).toHaveLength(3) // 빈 색을 다시 보고(없음) 구글은 부르지 않는다
    expect(lists(app)).toHaveLength(2)
  })

  it('AC-8554.5: 빈 색 찾기는 참인데 읽은 종일 줄에 빈 색 메모가 없으면(읽기에서 빠진 줄) 구글을 부르지 않고 1시간 기다린다', async () => {
    const { app, mem, deps } = rig()
    const d: GcalDeps = { ...deps, store: { ...mem.store, memoColorGap: async () => true } }
    const reads = () => mem.calls.filter((c) => c.fn === 'listAllDay').length
    expect(await fillMemoColors(d, linkOf())).toBe(0)
    expect(reads()).toBe(1)
    expect(app.store.calls).toEqual([])
    app.env.nowMs += 59 * 60_000
    expect(await fillMemoColors(d, linkOf())).toBe(0)
    expect(reads()).toBe(1)
    app.env.nowMs += 60_000
    expect(await fillMemoColors(d, linkOf())).toBe(0)
    expect(reads()).toBe(2)
  })

  it('AC-8554.5: 메모리 저장소도 DB처럼 — 색이 빈 메모 줄만 채우고(이미 색·없는 줄 → 거짓, g_wait_at 그대로), off 줄 색·틀린 색은 거절, 빈 색 찾기는 이어짐·보낼 것 없음·색 빔·기간 안만', async () => {
    const { mem } = rig()
    const memo = mem.seedAllDay({ day: '2026-11-28', type: 'memo', memo: '학회', gEventId: 'evold0001' })
    const wait = mem.seedAllDay({ day: '2026-11-29', type: 'memo', memo: '회식', gEventId: 'ssk00000000000000000000000000000001', gWait: true })
    const off = mem.seedAllDay({ day: '2026-11-28', type: 'off', memo: null, staffId: 's-ho', staffName: '정호연' })
    expect(await mem.store.memoColorGap('2026-11-28', '2026-11-28')).toBe(true)
    expect(await mem.store.memoColorGap('2026-11-29', '2026-12-31')).toBe(false)
    await expect(mem.store.memoColorGap('2026-12-31', '2026-11-29')).rejects.toThrow('메모리 DB')

    expect(await mem.store.fillMemoColor(memo.id, 'grape')).toBe(true)
    expect(await mem.store.fillMemoColor(memo.id, 'sage')).toBe(false)
    expect(colorOf(mem, memo.id)).toBe('grape')
    expect(await mem.store.memoColorGap('2026-11-28', '2026-11-28')).toBe(false)
    expect(await mem.store.fillMemoColor(wait.id, 'default')).toBe(true)
    expect(mem.db.allday.find((x) => x.id === wait.id)).toMatchObject({ gColor: 'default', gWait: true, gWaitAt: wait.gWaitAt })
    expect(await mem.store.fillMemoColor('d0000000-9999-0000-4000-8000-000000000000', 'grape')).toBe(false)

    await expect(mem.store.fillMemoColor(off.id, 'grape')).rejects.toThrow('메모리 DB')
    await expect(mem.store.fillMemoColor(memo.id, 'pink' as never)).rejects.toThrow('메모리 DB')
    await expect(mem.store.addAllDay({ day: '2026-11-30', type: 'memo', memo: '회식', staffId: null, staffName: null, gColor: 'pink' as never })).rejects.toThrow('메모리 DB')
    await expect(mem.store.addAllDay({ day: '2026-11-30', type: 'off', memo: null, staffId: 's-won', staffName: '박지원', gColor: 'grape' })).rejects.toThrow('메모리 DB')
    await expect(mem.store.applyMemo(memo.id, { memo: '학회', gColor: 'pink' as never }, '2026-11-26T02:00:00.000Z', null)).rejects.toThrow('메모리 DB')
    const kept = await mem.store.applyMemo(memo.id, { memo: '학회', gColor: 'tomato' }, '2026-11-26T02:00:00.000Z', null)
    expect(kept).toMatchObject({ id: memo.id, gColor: 'tomato', gWaitAt: null })
  })
})
