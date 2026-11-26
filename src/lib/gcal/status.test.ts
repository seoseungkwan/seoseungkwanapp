import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CAL_SETTINGS } from '@/types/calendar'
import { DEFAULT_GCAL_LOOK, DEFAULT_GCAL_RULES, type GcalLink } from '@/types/gcal'
import { CAL_ID, CAL_NAME, HOSPITAL, NOW, TEST_KEY } from '../../../google-code/test/fakeCalendar'
import { createMemoryStore, type GcalDeps } from './deps'
import { getGcalStatus, refreshGcalStatus, resetGcalStatus, setGcalStatus, subscribeGcalStatus, syncNowText } from './status'

// 예약 탭 띠가 듣는 맞춤 상태(spec google-link AC-8525.4, design.md 10-5): 마지막 맞춤·실패 시작·보낼 것 수·고쳐야 할 것 수

const SCRIPT = 'https://script.google.com/macros/s/AKfycbFake0123456789abc/exec'

function rig(link: Partial<GcalLink> = {}) {
  const now = () => new Date(NOW)
  const mem = createMemoryStore({
    now,
    link: {
      scriptUrl: SCRIPT,
      secret: TEST_KEY,
      calendarId: CAL_ID,
      calendarName: CAL_NAME,
      defaultHex: '#4285F4',
      linkedOn: '2026-11-26',
      rules: { ...DEFAULT_GCAL_RULES, pullMin: 5 },
      look: { ...DEFAULT_GCAL_LOOK },
      ...link,
    },
    parts: { staff: [], kinds: DEFAULT_CAL_SETTINGS.kinds, people: [] },
  })
  const deps: GcalDeps = {
    hospitalId: HOSPITAL,
    call: async () => {
      throw new Error('상태 읽기는 구글을 부르지 않는다')
    },
    store: mem.store,
    now,
  }
  return { mem, deps }
}

beforeEach(() => resetGcalStatus())

describe('AC-8525.4 띠 상태', () => {
  it('AC-8525.4: 보낼 것 수 = 이은 날 뒤 g_wait 예약 + 지움 줄 + 기다리는 off 날 + 기다리는 메모, 고쳐야 할 것은 열린 것만, 실패 시작·번호', async () => {
    const { mem, deps } = rig()
    const waiting = mem.seedAppt({ day: '2026-11-27', start: 600, name: '홍길동', gEventId: 'ssk00000000000000000000000000000001', gWait: 'new' })
    mem.seedAppt({ day: '2026-11-25', start: 600, name: '지난날', gEventId: 'evold0001', gWait: 'edit' }) // 이은 날 전: 세지 않음
    mem.seedAppt({ day: '2026-11-28', start: 600, name: '보냄', gEventId: 'evsent001' })
    mem.db.deletes.push({ gEventId: 'evdel0001', day: '2026-11-28', kind: 'appt', label: null, at: '2026-11-26T00:56:00.000000+00:00' })
    mem.seedAllDay({ day: '2026-11-29', type: 'off', memo: null, staffId: 's-ho', staffName: '정호연' })
    mem.seedAllDay({ day: '2026-11-30', type: 'memo', memo: '회식', gEventId: 'ssk00000000000000000000000000000003', gWait: true })
    mem.db.fixes.push(
      { id: 'f1', gEventId: 'evfix0001', day: '2026-11-27', start: 600, len: 30, allDay: false, gColor: null, gTitle: '원장님 회의', reason: 'not-appt', guess: { chart: null, name: null, kindId: null, kindHow: null, staffId: null, staffHow: null, memo: null, word: null }, state: 'open', gUpdated: '2026-11-26T00:00:00.000Z' },
      { id: 'f2', gEventId: 'evfix0002', day: '2026-11-27', start: 660, len: 30, allDay: false, gColor: null, gTitle: '점심', reason: 'not-appt', guess: { chart: null, name: null, kindId: null, kindHow: null, staffId: null, staffHow: null, memo: null, word: null }, state: 'skip', gUpdated: '2026-11-26T00:00:00.000Z' },
    )
    mem.db.state = { ...mem.db.state, lastOkAt: '2026-11-26T00:50:00.123456+00:00', failSince: '2026-11-26T00:55:00.000001+00:00', failCode: 'E-GCAL-REACH' }

    const s = await refreshGcalStatus(deps)
    expect(s).toMatchObject({
      linked: true,
      calendarName: CAL_NAME,
      pullMin: 5,
      lastOkAt: '2026-11-26T00:50:00.123456+00:00',
      failSince: '2026-11-26T00:55:00.000001+00:00',
      failCode: 'E-GCAL-REACH',
      waiting: 4,
      fixes: 1,
    })
    expect(s.waitingAppts.map((a) => a.id)).toEqual([waiting.id])
    expect([...s.waitingIds]).toEqual([waiting.id])
    expect(getGcalStatus()).toBe(s)
  })

  it('AC-8525.4: 잇지 않은 병원은 linked 거짓이고 줄을 읽지 않는다', async () => {
    const { mem, deps } = rig({ calendarId: null, linkedOn: null })
    const s = await refreshGcalStatus(deps)
    expect(s).toMatchObject({ linked: false, waiting: 0, fixes: 0 })
    expect(mem.calls.map((c) => c.fn)).toEqual(['loadLink'])
  })

  it('AC-8525.4: 듣는 쪽은 바뀔 때만 불리고, 바뀌지 않으면 같은 상태 객체(useSyncExternalStore), 그만 들으면 안 불린다', () => {
    const fn = vi.fn()
    const off = subscribeGcalStatus(fn)
    const first = getGcalStatus()
    setGcalStatus({ running: false })
    expect(fn).not.toHaveBeenCalled()
    expect(getGcalStatus()).toBe(first)
    setGcalStatus({ running: true })
    expect(fn).toHaveBeenCalledTimes(1)
    expect(getGcalStatus()).not.toBe(first)
    expect(getGcalStatus().running).toBe(true)
    off()
    setGcalStatus({ running: false })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("AC-8525.4: [지금 맞추기] 뒤 알림 '구글과 맞췄어요 · 바뀐 것 없음 ({HH:mm})'·'바뀐 것 {n}개', 못 닿으면 다시 해 볼 때 글", () => {
    expect(syncNowText({ ok: true, changed: 0, sent: 0, at: '2026-11-26T05:37:12.000Z' })).toBe('구글과 맞췄어요 · 바뀐 것 없음 (14:37)')
    expect(syncNowText({ ok: true, changed: 2, sent: 1, at: '2026-11-25T15:05:00.000Z' })).toBe('구글과 맞췄어요 · 바뀐 것 3개 (00:05)')
    expect(syncNowText({ ok: false, code: 'E-GCAL-REACH' })).toBe('다시 해 봤지만 아직 닿지 않아요. 1분 뒤 다시 해 볼게요.')
  })
})
