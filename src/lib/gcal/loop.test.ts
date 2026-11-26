import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CAL_SETTINGS } from '@/types/calendar'
import { DEFAULT_GCAL_LOOK, DEFAULT_GCAL_RULES, type GcalLink } from '@/types/gcal'
import { CAL_ID, CAL_NAME, HOSPITAL, load, NOW, TEST_KEY } from '../../../google-code/test/fakeCalendar'
import { readReply } from './client'
import { createMemoryStore, type GcalCaller, type GcalDeps, type GcalParts } from './deps'
import { activeGcalDeps, gcalIdle, requestPull, sendAppt, startGcalLoop, syncNow, TICK_MS, type LockLike, type VisibleDoc } from './loop'
import { getGcalStatus, resetGcalStatus } from './status'

// 맞춤 돌기(spec google-link REQ-8525·REQ-8526, design.md 10-5): 받기 간격·1분 다시 보내기·창이 다시 보임·한 탭만(navigator.locks 'ssk-gcal').
// 시계는 가짜(vi 가짜 타이머), 구글은 진짜 Code.gs를 가짜 캘린더에서, DB는 메모리 저장이다

const NOW_MS = Date.parse(NOW)
const SCRIPT = 'https://script.google.com/macros/s/AKfycbFake0123456789abc/exec'
const PARTS: GcalParts = {
  staff: [{ id: 's-ho', name: '정호연', mark: '호', color: 'lavender' }],
  kinds: DEFAULT_CAL_SETTINGS.kinds,
  people: [{ id: 's-ho', name: '정호연' }],
}

/** 한 PC의 탭들이 함께 쓰는 가짜 navigator.locks(ifAvailable만) */
class FakeLocks implements LockLike {
  held = new Set<string>()
  names: string[] = []
  async request(name: string, options: { ifAvailable: true }, callback: (lock: unknown) => unknown): Promise<unknown> {
    this.names.push(name)
    expect(options).toEqual({ ifAvailable: true })
    if (this.held.has(name)) return callback(null)
    this.held.add(name)
    try {
      return await callback({ name })
    } finally {
      this.held.delete(name)
    }
  }
}

class FakeDoc implements VisibleDoc {
  visibilityState: DocumentVisibilityState = 'visible'
  private fns = new Set<() => void>()
  addEventListener(_type: 'visibilitychange', fn: () => void) {
    this.fns.add(fn)
  }
  removeEventListener(_type: 'visibilitychange', fn: () => void) {
    this.fns.delete(fn)
  }
  show(state: DocumentVisibilityState) {
    this.visibilityState = state
    for (const fn of this.fns) fn()
  }
  get listeners() {
    return this.fns.size
  }
}

function rig(link: Partial<GcalLink> = {}) {
  const app = load()
  app.store.clockMs = NOW_MS
  const now = () => new Date(app.env.nowMs)
  const mem = createMemoryStore({
    now,
    link: {
      scriptUrl: SCRIPT,
      secret: TEST_KEY,
      calendarId: CAL_ID,
      calendarName: CAL_NAME,
      defaultHex: '#4285F4',
      linkedOn: '2026-11-26',
      rules: { ...DEFAULT_GCAL_RULES },
      look: { ...DEFAULT_GCAL_LOOK },
      ...link,
    },
    parts: PARTS,
  })
  const call: GcalCaller = async (l, action, body = {}) => readReply(JSON.stringify(app.post({ ...body, key: l.secret, action })))
  const deps: GcalDeps = { hospitalId: HOSPITAL, call, store: mem.store, now }
  return { app, mem, deps, locks: new FakeLocks(), doc: new FakeDoc() }
}

const pulls = (app: ReturnType<typeof load>) => app.store.calls.filter((c) => c.api === 'Events.list' && c.opts?.updatedMin !== undefined).length

async function tick(ms = TICK_MS) {
  await vi.advanceTimersByTimeAsync(ms)
  await gcalIdle()
}

const stops: (() => void)[] = []
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW_MS)
  resetGcalStatus()
})
afterEach(() => {
  while (stops.length) stops.pop()?.()
  vi.useRealTimers()
})

describe('AC-8525.1 받기 간격 · 한 탭만', () => {
  it("AC-8525.1: 잠금('ssk-gcal')을 쥔 탭은 켜자마자 받고, 받아 오는 간격(2분)마다 받으며, 멈추면 그친다", async () => {
    const { app, deps, locks, doc } = rig()
    const stop = startGcalLoop(deps, { locks, doc })
    stops.push(stop)
    await gcalIdle()
    expect(locks.names[0]).toBe('ssk-gcal')
    expect(pulls(app)).toBe(1)
    await tick()
    expect(pulls(app)).toBe(1)
    await tick()
    expect(pulls(app)).toBe(2)
    stop()
    expect(doc.listeners).toBe(0)
    await tick(5 * TICK_MS)
    expect(pulls(app)).toBe(2)
    expect(locks.held.size).toBe(0) // 잠금을 놓았다
  })

  it('AC-8525.1: 다른 탭이 잠금을 쥐고 있으면 돌지 않고, 그 탭이 닫히면 다음 1분에 이어받는다', async () => {
    const { app, deps, locks, doc } = rig()
    const stopA = startGcalLoop(deps, { locks, doc })
    await gcalIdle()
    const stopB = startGcalLoop(deps, { locks, doc: new FakeDoc() })
    stops.push(stopB)
    await gcalIdle()
    expect(pulls(app)).toBe(1)
    stopA()
    await tick()
    expect(pulls(app)).toBe(2) // B가 잠금을 잡자마자 받는다
  })

  it('AC-8525.1: 창이 다시 보이면 바로 받고, 숨을 때는 받지 않는다. 잠금이 없는 브라우저도 혼자 돈다', async () => {
    const { app, deps, doc } = rig()
    stops.push(startGcalLoop(deps, { locks: null, doc }))
    await gcalIdle()
    expect(pulls(app)).toBe(1)
    doc.show('hidden')
    await gcalIdle()
    expect(pulls(app)).toBe(1)
    doc.show('visible')
    await gcalIdle()
    expect(pulls(app)).toBe(2)
  })

  it('AC-8525.1: 잇지 않은 병원(캘린더 없음)은 구글을 부르지 않는다', async () => {
    const { app, deps, locks, doc } = rig({ calendarId: null, linkedOn: null })
    stops.push(startGcalLoop(deps, { locks, doc }))
    await gcalIdle()
    await tick(3 * TICK_MS)
    expect(app.store.calls).toEqual([])
    expect(getGcalStatus().linked).toBe(false)
  })
})

describe('AC-8526.4 못 보낸 것은 1분마다 다시', () => {
  it('AC-8526.4: 받기 간격과 따로 1분마다 못 보낸 것을 보내고, 실패하면 다음 1분에 다시 한다', async () => {
    const { app, mem, deps, locks, doc } = rig()
    stops.push(startGcalLoop(deps, { locks, doc }))
    await gcalIdle()
    const appt = mem.seedAppt({ day: '2026-11-27', start: 600, name: '홍길동', chart: '1234', staffId: 's-ho', staffName: '정호연', staffMark: '호', gEventId: 'ssk00000000000000000000000000000001', gWait: 'new', gFrom: 'web' })

    app.env.lockFree = false // 구글 쓰기 Lock이 막힘
    await tick()
    expect(mem.db.appts[0].gWait).toBe('new')
    expect(getGcalStatus()).toMatchObject({ failCode: 'E-GCAL-REACH', waiting: 1 })
    expect(getGcalStatus().nextTryAt).toBe(new Date(Date.now() + TICK_MS).toISOString())

    app.env.lockFree = true
    await tick()
    expect(app.store.event(appt.gEventId as string)?.status).toBe('confirmed')
    expect(mem.db.appts[0].gWait).toBeNull()
    expect(getGcalStatus()).toMatchObject({ failCode: null, waiting: 0, nextTryAt: null })
  })
})

describe('AC-8525.4 [지금 맞추기]·탭 들어옴', () => {
  it('AC-8525.4: syncNow는 바로 받고 보내 바뀐 수·시각을 주고, 실패면 번호를 준다', async () => {
    const { app, mem, deps, locks, doc } = rig()
    stops.push(startGcalLoop(deps, { locks, doc }))
    await gcalIdle()
    app.store.timed('evnew0001', '2026-11-27T10:00', '2026-11-27T10:30', { summary: '1234 홍길동 도수 30분 (호)' })
    const r = await syncNow()
    expect(r).toEqual({ ok: true, changed: 1, sent: 0, at: expect.any(String) })
    expect(mem.db.appts).toHaveLength(1)

    mem.db.link.secret = 'Wrong_0123456789-abcdefABCDEF-xyz'
    expect(await syncNow()).toEqual({ ok: false, code: 'E-GCAL-KEY' })
    expect(getGcalStatus().failCode).toBe('E-GCAL-KEY')
  })

  it('AC-8525.1: 예약 탭에 들어오면 requestPull로 바로 받는다(이끄는 탭이 아니어도)', async () => {
    const { app, mem, deps, locks, doc } = rig()
    locks.held.add('ssk-gcal') // 다른 탭이 쥐고 있다
    stops.push(startGcalLoop(deps, { locks, doc }))
    await gcalIdle()
    expect(pulls(app)).toBe(0)
    app.store.timed('evnew0001', '2026-11-27T10:00', '2026-11-27T10:30', { summary: '1234 홍길동 도수 30분 (호)' })
    requestPull()
    await gcalIdle()
    expect(pulls(app)).toBe(1)
    expect(mem.db.appts).toHaveLength(1)
  })

  it('AC-8526.1: sendAppt는 돌고 있는 맞춤의 deps로 바로 보내고, 돌지 않으면 보내지 않는다', async () => {
    const { app, mem, deps, locks, doc } = rig()
    const appt = mem.seedAppt({ day: '2026-11-27', start: 600, name: '홍길동', staffId: 's-ho', staffName: '정호연', staffMark: '호', gEventId: 'ssk00000000000000000000000000000001', gWait: 'new', gFrom: 'web' })
    expect(activeGcalDeps()).toBeNull()
    expect(await sendAppt(appt)).toEqual({ ok: false, code: null })
    expect(app.store.calls).toEqual([])
    const stop = startGcalLoop(deps, { locks, doc })
    await gcalIdle()
    expect(activeGcalDeps()).toBe(deps)
    stop()
    expect(activeGcalDeps()).toBeNull()
  })
})
