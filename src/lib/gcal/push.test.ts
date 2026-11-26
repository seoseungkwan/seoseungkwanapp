import { describe, expect, it } from 'vitest'
import { offEventId } from '@/lib/calendar/goff'
import type { PaintCtx } from '@/lib/calendar/gshapes'
import { DEFAULT_CAL_SETTINGS, type CalAppt } from '@/types/calendar'
import { DEFAULT_GCAL_LOOK, DEFAULT_GCAL_RULES, type GcalLink } from '@/types/gcal'
import { CAL_ID, CAL_NAME, HOSPITAL, load, NOW, TEST_KEY } from '../../../google-code/test/fakeCalendar'
import { readReply } from './client'
import { createMemoryStore, type GcalCaller, type GcalDeps, type GcalParts } from './deps'
import { pushAppt, pushOffDay, pushWaiting, queueColorChange } from './push'

// 웹앱 → 구글 보내기(spec google-link REQ-8526, design.md 12-2). 구글은 진짜 Code.gs를 가짜 캘린더에서, DB는 메모리 저장으로 돈다.
// 환자 이름·비밀 글자는 지어낸 값이다

const LINKED = '2026-11-26'
const NOW_MS = Date.parse(NOW)
const SCRIPT = 'https://script.google.com/macros/s/AKfycbFake0123456789abc/exec'
const NEW_ID = 'ssk0123456789abcdef0123456789abcdef'
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

function rig(link: Partial<GcalLink> = {}) {
  const app = load()
  app.store.clockMs = NOW_MS
  const now = () => new Date(app.env.nowMs)
  const mem = createMemoryStore({ now, link: linkOf(link), parts: PARTS })
  const call: GcalCaller = async (l, action, body = {}) => readReply(JSON.stringify(app.post({ ...body, key: l.secret, action })))
  const deps: GcalDeps = { hospitalId: HOSPITAL, call, store: mem.store, now }
  return { app, mem, deps, call }
}

const HONG = {
  day: '2026-11-27',
  start: 600,
  len: 30,
  name: '홍길동',
  chart: '1234',
  staffId: 's-ho',
  staffName: '정호연',
  staffMark: '호',
  kindId: 'dosu',
  kindName: '도수',
} as const

const puts = (app: ReturnType<typeof load>) => app.store.writes()
const find = (mem: ReturnType<typeof createMemoryStore>, id: string) => mem.db.appts.find((a) => a.id === id) as CalAppt

describe('AC-8526.1·AC-8526.2 저장하면 바로 put, 되면 g_wait 비움', () => {
  it('AC-8526.1·AC-8526.2: 새 예약은 넣을 때 정한 ssk + 32자 id로 만들고, 되면 g_wait를 비우고 g_updated·g_title을 적는다', async () => {
    const { app, mem, deps } = rig()
    const appt = mem.seedAppt({ ...HONG, memo: '1부위', gEventId: NEW_ID, gWait: 'new', gFrom: 'web' })
    expect(await pushAppt(deps, appt)).toEqual({ ok: true, did: 'sent' })
    const ev = app.store.event(NEW_ID)
    expect(ev).toMatchObject({
      status: 'confirmed',
      summary: '1234 홍길동 도수 30분 (호) 1부위',
      description: '1부위',
      colorId: '1', // 도수는 시행자 색 따름 → 정호연 라벤더
      start: { dateTime: '2026-11-27T10:00:00+09:00' },
      end: { dateTime: '2026-11-27T10:30:00+09:00' },
    })
    expect(find(mem, appt.id)).toMatchObject({ gWait: null, gWaitAt: null, gUpdated: ev?.updated, gTitle: '1234 홍길동 도수 30분 (호) 1부위' })
  })

  it('AC-8526.2: 같은 줄을 두 PC가 함께 보내도 구글 일정은 하나', async () => {
    const { app, mem, deps, call } = rig()
    const appt = mem.seedAppt({ ...HONG, gEventId: NEW_ID, gWait: 'new', gFrom: 'web' })
    const [a, b] = await Promise.all([pushAppt(deps, appt), pushAppt({ ...deps, call }, appt)])
    expect(a.ok && b.ok).toBe(true)
    expect(app.store.live().filter((e) => e.id === NEW_ID)).toHaveLength(1)
    expect(app.store.live()).toHaveLength(1)
  })

  it('AC-8526.2: 보낸 뒤 g_wait는 보낼 때 읽은 g_wait_at(저장소 글자 그대로)이 그대로일 때만 비운다 — 그 사이 또 고쳤으면 남겨 다음에 또 보낸다', async () => {
    const { app, mem, deps, call } = rig()
    const appt = mem.seedAppt({ ...HONG, gEventId: NEW_ID, gWait: 'new', gFrom: 'web' })
    const editing: GcalDeps = {
      ...deps,
      call: async (l, action, body) => {
        const out = await call(l, action, body)
        await mem.store.updateAppt(appt.id, { memo: '그 사이 고침', gWait: 'edit' }) // 보내는 동안 다른 PC가 고침
        return out
      },
    }
    expect(await pushAppt(editing, appt)).toEqual({ ok: true, did: 'again' })
    const sent = mem.calls.find((c) => c.fn === 'markApptSent')
    expect(sent?.args[2]).toBe(appt.gWaitAt)
    expect(find(mem, appt.id)).toMatchObject({ gWait: 'edit', memo: '그 사이 고침' })
    await pushWaiting(deps)
    expect(app.store.event(NEW_ID)?.description).toBe('그 사이 고침')
    expect(find(mem, appt.id).gWait).toBeNull()
  })

  it('AC-8526.1: 못 보내면 g_wait를 그대로 두고 실패 번호를 남긴다', async () => {
    const { app, mem, deps } = rig()
    const appt = mem.seedAppt({ ...HONG, gEventId: NEW_ID, gWait: 'new', gFrom: 'web' })
    app.env.lockFree = false // 구글 Lock을 못 잡음 → busy
    expect(await pushAppt(deps, appt)).toEqual({ ok: false, code: 'E-GCAL-REACH' })
    expect(find(mem, appt.id)).toMatchObject({ gWait: 'new', gWaitAt: appt.gWaitAt })
    expect(mem.db.state).toMatchObject({ failCode: 'E-GCAL-REACH' })
    expect(app.store.event(NEW_ID)).toBeUndefined()
  })
})

describe('AC-8526.3 취소·되돌리기·옮기기·지우기', () => {
  const IMPORTED = 'evimp0001'

  function imported(mem: ReturnType<typeof createMemoryStore>, app: ReturnType<typeof load>, over: Partial<CalAppt> = {}) {
    const ev = app.store.timed(IMPORTED, '2026-11-27T10:00', '2026-11-27T10:15', { summary: '5521 최시안 (4000타)', colorId: '2', description: '구글에 적어 둔 설명' })
    return mem.seedAppt({
      day: '2026-11-27',
      start: 600,
      len: 15,
      name: '최시안',
      chart: '5521',
      staffId: 's-won',
      staffName: '박지원',
      staffMark: '원',
      kindId: 'shock',
      kindName: '충격파',
      memo: '4000타',
      gEventId: IMPORTED,
      gTitle: ev.summary,
      gUpdated: ev.updated,
      gColor: 'sage',
      colorFrom: 'google',
      gKeepTitle: true,
      gFrom: 'import',
      ...over,
    })
  }

  it('AC-8526.3: [예약 취소]는 색만 취소 색으로 — 가져온 예약의 제목·시간·설명은 그대로', async () => {
    const { app, mem, deps } = rig()
    const appt = imported(mem, app)
    const cancelled = (await mem.store.updateAppt(appt.id, { status: 'cancel', gWait: 'cancel' })) as CalAppt
    await pushAppt(deps, cancelled)
    const patch = puts(app).find((c) => c.api === 'Events.patch')
    expect(patch?.resource).toEqual({ colorId: '11' })
    expect(app.store.event(IMPORTED)).toMatchObject({ summary: '5521 최시안 (4000타)', colorId: '11', description: '구글에 적어 둔 설명' })
  })

  it('AC-8526.3: [취소 되돌리기]는 원래 색으로, 구글에서 지운 일정이면 되살린다', async () => {
    const { app, mem, deps } = rig()
    const appt = imported(mem, app, { status: 'cancel', gGone: true })
    app.post({ key: TEST_KEY, action: 'remove', calendarId: CAL_ID, id: IMPORTED })
    const back = (await mem.store.updateAppt(appt.id, { status: 'auto', gWait: 'uncancel' })) as CalAppt
    expect(await pushAppt(deps, back)).toEqual({ ok: true, did: 'sent' })
    expect(app.store.event(IMPORTED)).toMatchObject({ status: 'confirmed', colorId: '2', summary: '5521 최시안 (4000타)' })
    expect(find(mem, appt.id)).toMatchObject({ gGone: false, gWait: null })
  })

  it('AC-8526.3: 날짜·시작을 옮기면 변경 색 + 새 시각, 가져온 제목은 칸을 고칠 때만(g_keep_title 거짓) 웹앱 꼴로 다시 쓴다', async () => {
    const { app, mem, deps } = rig()
    const appt = imported(mem, app)
    // google-link AC-8545.2: 웹앱에서 옮기면 같은 쓰기에 g_moved 참(이은 병원의 '변경' = g_moved)
    const moved = (await mem.store.updateAppt(appt.id, { start: 660, gWait: 'move', gMoved: true })) as CalAppt
    expect(moved.origStart).toBe(600)
    await pushAppt(deps, moved)
    expect(app.store.event(IMPORTED)).toMatchObject({
      summary: '5521 최시안 (4000타)',
      description: '구글에 적어 둔 설명',
      colorId: '8',
      start: { dateTime: '2026-11-27T11:00:00+09:00' },
      end: { dateTime: '2026-11-27T11:15:00+09:00' },
    })
    const edited = (await mem.store.updateAppt(appt.id, { memo: '3000타', gKeepTitle: false, gWait: 'edit' })) as CalAppt
    await pushAppt(deps, edited)
    expect(app.store.event(IMPORTED)).toMatchObject({ summary: '5521 최시안 충격파 15분 (원) 3000타', description: '3000타', colorId: '8' })
  })

  it('AC-8526.3: [지우기]는 트리거가 적은 gcal_deletes 줄로 구글에서도 지우고 그 줄을 버린다', async () => {
    const { app, mem, deps } = rig()
    const appt = imported(mem, app)
    await mem.store.deleteAppt(appt.id)
    expect(mem.db.deletes).toEqual([expect.objectContaining({ gEventId: IMPORTED, day: '2026-11-27', kind: 'appt' })])
    expect(await pushWaiting(deps)).toMatchObject({ ok: true })
    expect(app.store.event(IMPORTED)?.status).toBe('cancelled')
    expect(mem.db.deletes).toEqual([])
  })

  it('AC-8526.3: 한 번도 못 보낸 새 예약을 취소해도(g_wait new → cancel) 일정을 만들어 취소 색으로 둔다', async () => {
    const { app, mem, deps } = rig()
    const appt = mem.seedAppt({ ...HONG, status: 'cancel', gEventId: NEW_ID, gWait: 'cancel', gFrom: 'web' })
    expect(await pushAppt(deps, appt)).toEqual({ ok: true, did: 'sent' })
    expect(app.store.event(NEW_ID)).toMatchObject({ status: 'confirmed', colorId: '11', summary: '1234 홍길동 도수 30분 (호)' })
  })
})

describe('AC-8526.4 못 보낸 것은 넣은 차례대로 · 이은 날 전은 안 보냄', () => {
  it('AC-8526.4: 예약(g_wait_at 차례) → 지움 줄 → off 날 → 메모 차례로 보내고, 다 보내면 실패가 풀린다(띠가 돌아온다)', async () => {
    const { app, mem, deps } = rig()
    mem.db.state.failCode = 'E-GCAL-REACH'
    mem.db.state.failSince = '2026-11-26T00:50:00.000000+00:00'
    const second = mem.seedAppt({ ...HONG, name: '둘째', gEventId: 'ssk00000000000000000000000000000002', gWait: 'new', gWaitAt: '2026-11-26T00:55:00.000200+00:00' })
    const first = mem.seedAppt({ ...HONG, name: '첫째', gEventId: 'ssk00000000000000000000000000000001', gWait: 'new', gWaitAt: '2026-11-26T00:55:00.000100+00:00' })
    app.store.timed('evdel0001', '2026-11-28T10:00', '2026-11-28T10:30', { summary: '지울 예약' })
    mem.db.deletes.push({ gEventId: 'evdel0001', day: '2026-11-28', kind: 'appt', label: '지울 예약', at: '2026-11-26T00:56:00.000000+00:00' })
    mem.seedAllDay({ day: '2026-11-29', type: 'off', memo: null, staffId: 's-ho', staffName: '정호연' })
    mem.seedAllDay({ day: '2026-11-30', type: 'memo', memo: '회식', gEventId: 'ssk00000000000000000000000000000003', gWait: true })

    expect(await pushWaiting(deps)).toEqual({ ok: true, sent: 5 })
    const order = puts(app).map((c) => `${c.api}:${(c.resource?.id as string | undefined) ?? c.eventId}`)
    expect(order).toEqual([
      'Events.insert:ssk00000000000000000000000000000001',
      'Events.insert:ssk00000000000000000000000000000002',
      'Events.remove:evdel0001',
      `Events.insert:${offEventId(HOSPITAL, '2026-11-29')}`,
      'Events.insert:ssk00000000000000000000000000000003',
    ])
    expect([find(mem, first.id).gWait, find(mem, second.id).gWait]).toEqual([null, null])
    expect(mem.db.deletes).toEqual([])
    expect(mem.db.offDays.find((o) => o.day === '2026-11-29')).toMatchObject({ wait: false, gTitle: '정호연 off' })
    expect(mem.db.allday.find((r) => r.type === 'memo')).toMatchObject({ gWait: false })
    expect(mem.db.state).toMatchObject({ failCode: null, failSince: null })
  })

  it('AC-8526.4: 하나가 막히면 거기서 멈추고(뒤 차례는 다음에) 실패 번호를 남긴다', async () => {
    const { app, mem, deps } = rig()
    mem.seedAppt({ ...HONG, gEventId: 'ssk00000000000000000000000000000001', gWait: 'new' })
    mem.seedAllDay({ day: '2026-11-30', type: 'memo', memo: '회식', gEventId: 'ssk00000000000000000000000000000003', gWait: true })
    app.env.lockFree = false
    expect(await pushWaiting(deps)).toMatchObject({ ok: false, code: 'E-GCAL-REACH' })
    expect(mem.calls.map((c) => c.fn)).not.toContain('listWaitingMemos')
    expect(mem.db.state.failCode).toBe('E-GCAL-REACH')
  })

  it('AC-8526.4: 이은 날 0시 전 예약은 한 번도 보내지 않는다', async () => {
    const { app, mem, deps } = rig()
    const old = mem.seedAppt({ ...HONG, day: '2026-11-25', gEventId: 'evold0001', gWait: 'edit' })
    expect(await pushAppt(deps, old)).toEqual({ ok: true, did: 'dropped' })
    await pushWaiting(deps)
    expect(app.store.calls).toEqual([])
    expect(find(mem, old.id).gWait).toBeNull()
  })
})

describe('AC-8526.5 도착', () => {
  it('AC-8526.5: 맞춤 방법이 기본이면 도착이 바뀌어도(g_wait 없음) 아무것도 보내지 않고, 칸을 고쳐 보낼 때도 제목에 도착을 넣지 않는다', async () => {
    const { app, mem, deps } = rig()
    const came = mem.seedAppt({ ...HONG, status: 'came', gEventId: NEW_ID })
    expect(await pushAppt(deps, came)).toEqual({ ok: true, did: 'none' })
    expect(app.store.calls).toEqual([])
    const edit = (await mem.store.updateAppt(came.id, { memo: '메모', gWait: 'edit' })) as CalAppt
    await pushAppt(deps, edit)
    expect(app.store.event(NEW_ID)?.summary).toBe('1234 홍길동 도수 30분 (호) 메모')
  })

  it("AC-8526.5: '구글 제목 앞에 붙여요'면 제목 앞 '왔음 '·'안 옴 '만 바꿔 보낸다(가져온 제목도)", async () => {
    const { app, mem, deps } = rig({ rules: { ...DEFAULT_GCAL_RULES, arrival: 'title' } })
    const own = mem.seedAppt({ ...HONG, status: 'came', gEventId: NEW_ID, gWait: 'edit' })
    await pushAppt(deps, own)
    expect(app.store.event(NEW_ID)?.summary).toBe('왔음 1234 홍길동 도수 30분 (호)')
    const ev = app.store.timed('evimp0002', '2026-11-27T11:00', '2026-11-27T11:30', { summary: '7345 한예제(1부위만' })
    const kept = mem.seedAppt({ ...HONG, start: 660, name: '한예제', chart: '7345', status: 'noshow', gEventId: 'evimp0002', gTitle: ev.summary, gUpdated: ev.updated, gKeepTitle: true, gWait: 'edit' })
    await pushAppt(deps, kept)
    expect(app.store.event('evimp0002')?.summary).toBe('안 옴 7345 한예제(1부위만')
  })
})

describe('AC-8526.6 설정에서 색을 바꿔 저장하면', () => {
  it('AC-8526.6: colorChangeTargets가 고른 예약(이은 날 뒤 앞으로·옛 색으로 칠한 것)에만 g_wait = color를 적고 색만 보낸다', async () => {
    const { app, mem, deps } = rig()
    const before: PaintCtx = { look: DEFAULT_GCAL_LOOK, kinds: DEFAULT_CAL_SETTINGS.kinds, staff: PARTS.staff }
    const after: PaintCtx = { ...before, staff: [{ id: 's-ho', color: 'sage' }, PARTS.staff[1]] }
    app.store.timed('evcol0001', '2026-11-27T10:00', '2026-11-27T10:30', { summary: '1234 홍길동 도수 30분 (호)', colorId: '1' })
    const target = mem.seedAppt({ ...HONG, gEventId: 'evcol0001', gTitle: '1234 홍길동 도수 30분 (호)' })
    const googleColor = mem.seedAppt({ ...HONG, start: 660, gEventId: 'evcol0002', colorFrom: 'google', gColor: 'peacock' })
    const past = mem.seedAppt({ ...HONG, day: '2026-11-20', gEventId: 'evcol0003' })
    const other = mem.seedAppt({ ...HONG, start: 720, staffId: 's-won', staffName: '박지원', staffMark: '원', gEventId: 'evcol0004' })
    mem.parts.staff = [{ ...PARTS.staff[0], color: 'sage' }, PARTS.staff[1]] // 설정 저장이 먼저 끝났다

    const out = await queueColorChange(deps, before, after)
    expect(out.queued).toBe(1)
    expect([target, googleColor, past, other].map((a) => find(mem, a.id).gWait)).toEqual([null, null, null, null]) // 보내고 비움
    const patches = puts(app).filter((c) => c.api === 'Events.patch')
    expect(patches).toEqual([expect.objectContaining({ eventId: 'evcol0001', resource: { colorId: '2' } })])
  })
})

describe('AC-8526.7 이은 날 전 지움 줄·off 날', () => {
  it('AC-8526.7: 날짜가 이은 날보다 이른 지움 줄은 구글에 보내지 않고 지우고, off 날은 wait만 푼다', async () => {
    const { app, mem, deps } = rig()
    mem.db.deletes.push({ gEventId: 'evold0001', day: '2026-11-20', kind: 'appt', label: null, at: '2026-11-26T00:56:00.000000+00:00' })
    mem.db.offDays.push({ day: '2026-11-20', gEventId: 'evoldoff1', gTitle: '정호연 off', gUpdated: null, wait: true, waitAt: '2026-11-26T00:57:00.000001+00:00' })
    expect(await pushWaiting(deps)).toMatchObject({ ok: true })
    expect(app.store.calls).toEqual([])
    expect(mem.db.deletes).toEqual([])
    expect(mem.db.offDays[0]).toMatchObject({ wait: false, gTitle: '정호연 off', gEventId: 'evoldoff1' })
  })
})

describe('pushOffDay — 그날 off 줄(직원 탭 휴가 저장 뒤)', () => {
  const DAY = '2026-11-28'

  it('AC-8526.4·AC-8522.3: 그날 웹앱 off 줄로 제목을 만들어 보내고, 목록 밖 이름은 남기며, 같으면 wait만 푼다', async () => {
    const { app, mem, deps } = rig()
    app.store.allDay('evoff0001', DAY, '2026-11-29', { summary: '최호 off', colorId: '3' })
    mem.db.offDays.push({ day: DAY, gEventId: 'evoff0001', gTitle: '최호 off', gUpdated: null, wait: false, waitAt: null })
    await mem.store.addAllDay({ day: DAY, type: 'off', memo: null, staffId: 's-ho', staffName: '정호연' }) // 휴가 저장 → 트리거가 wait
    expect(mem.db.offDays[0].wait).toBe(true)

    expect(await pushOffDay(deps, DAY)).toEqual({ ok: true, did: 'sent' })
    expect(app.store.event('evoff0001')).toMatchObject({ summary: '정호연, 최호 off', colorId: '3' })
    expect(mem.db.offDays[0]).toMatchObject({ wait: false, gEventId: 'evoff0001', gTitle: '정호연, 최호 off' })

    const writes = puts(app).length
    expect(await pushOffDay(deps, DAY)).toEqual({ ok: true, did: 'none' })
    expect(puts(app)).toHaveLength(writes)
  })

  it("AC-8526.4: 두 PC가 같은 날 off를 함께 보내도 일정은 하나(id = 'sskoff' + 병원 32자 + 날짜)", async () => {
    const { app, mem, deps, call } = rig()
    await mem.store.addAllDay({ day: DAY, type: 'off', memo: null, staffId: 's-won', staffName: '박지원' })
    const [a, b] = await Promise.all([pushOffDay(deps, DAY), pushOffDay({ ...deps, call }, DAY)])
    expect(a.ok && b.ok).toBe(true)
    const offs = app.store.live().filter((e) => e.summary?.endsWith(' off'))
    expect(offs).toHaveLength(1)
    expect(offs[0]).toMatchObject({ id: offEventId(HOSPITAL, DAY), summary: '박지원 off', start: { date: DAY }, end: { date: '2026-11-29' } })
  })

  it("AC-8522.1: '예약 시행자가 아닌 직원도'가 꺼지면 'm-' 직원은 off 줄에 넣지 않는다", async () => {
    const { app, mem, deps } = rig({ rules: { ...DEFAULT_GCAL_RULES, offAllStaff: false } })
    await mem.store.addAllDay({ day: DAY, type: 'off', memo: null, staffId: 's-ho', staffName: '정호연' })
    await mem.store.addAllDay({ day: DAY, type: 'off', memo: null, staffId: M_KIM, staffName: '김예시' })
    await pushOffDay(deps, DAY)
    expect(app.store.live().map((e) => e.summary)).toEqual(['정호연 off'])
  })
})

describe('AC-8526.2 웹앱 종일 메모', () => {
  it("AC-8526.2: 웹앱에서 넣은 종일 메모는 넣을 때 정한 'ssk' + 32자 id로 하루 종일 일정을 만들고, 되면 g_wait를 거짓으로", async () => {
    const { app, mem, deps } = rig()
    const memo = mem.seedAllDay({ day: '2026-11-30', type: 'memo', memo: '원장님 학회', gEventId: NEW_ID, gWait: true })
    await pushWaiting(deps)
    expect(app.store.event(NEW_ID)).toMatchObject({ summary: '원장님 학회', start: { date: '2026-11-30' }, end: { date: '2026-12-01' } })
    expect(mem.db.allday.find((r) => r.id === memo.id)).toMatchObject({ gWait: false, gUpdated: app.store.event(NEW_ID)?.updated })
  })
})

describe('AC-8554.4 보내기: 웹앱 메모를 구글로 보낸 뒤 색', () => {
  it('AC-8554.4: 보낸 뒤 색이 비었으면 default를 채우고, 이미 색이 있는 메모(구글에서 온 메모)는 그대로 — 구글 일정 색은 보내지 않는다', async () => {
    const { app, mem, deps } = rig()
    const web = mem.seedAllDay({ day: '2026-11-30', type: 'memo', memo: '원장님 학회', gEventId: NEW_ID, gWait: true })
    const ev = app.store.allDay('evmemo003', '2026-12-01', '2026-12-02', { summary: '회식', colorId: '3' })
    const google = mem.seedAllDay({ day: '2026-12-01', type: 'memo', memo: '회식 장소 바뀜', gEventId: 'evmemo003', gUpdated: ev.updated, gWait: true, gColor: 'grape' })

    expect(await pushWaiting(deps)).toEqual({ ok: true, sent: 2 })
    expect(mem.calls.filter((c) => c.fn === 'fillMemoColor').map((c) => c.args)).toEqual([
      [web.id, 'default'],
      [google.id, 'default'],
    ])
    const row = (id: string) => mem.db.allday.find((r) => r.id === id)
    expect(row(web.id)).toMatchObject({ gWait: false, gColor: 'default' })
    expect(row(google.id)).toMatchObject({ gWait: false, gColor: 'grape', memo: '회식 장소 바뀜' })
    expect(app.store.event('evmemo003')).toMatchObject({ summary: '회식 장소 바뀜', colorId: '3' })
    for (const c of puts(app)) expect(c.resource?.colorId).toBeUndefined()
  })

  it('AC-8554.4: 보낸 표시가 0줄이면(그 사이 또 고침) 색을 채우지 않고, 색 채우기가 던져도 보내기 결과는 그대로다', async () => {
    const again = rig()
    again.mem.seedAllDay({ day: '2026-11-30', type: 'memo', memo: '원장님 학회', gEventId: NEW_ID, gWait: true })
    const stale: GcalDeps = { ...again.deps, store: { ...again.mem.store, markMemoSent: async () => false } }
    await pushWaiting(stale)
    expect(again.mem.calls.map((c) => c.fn)).not.toContain('fillMemoColor')

    const { mem, deps } = rig()
    const web = mem.seedAllDay({ day: '2026-11-30', type: 'memo', memo: '원장님 학회', gEventId: NEW_ID, gWait: true })
    const store = {
      ...mem.store,
      fillMemoColor: async () => {
        throw new Error('칸 없음')
      },
    }
    expect(await pushWaiting({ ...deps, store })).toEqual({ ok: true, sent: 1 })
    expect(mem.db.allday.find((r) => r.id === web.id)).toMatchObject({ gWait: false, gColor: null })
    expect(mem.db.state.failCode).toBeNull()
  })
})
