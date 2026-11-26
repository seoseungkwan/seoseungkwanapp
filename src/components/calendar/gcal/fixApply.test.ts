import { describe, expect, it, vi } from 'vitest'
import type { ParseCtx } from '@/lib/calendar/gshapes'
import { DEFAULT_CAL_SETTINGS } from '@/types/calendar'
import { DEFAULT_GCAL_LOOK, type GcalFix } from '@/types/gcal'
import { putFix, type FixStore } from './fixApply'

// 고쳐야 할 구글 예약 넣기(spec google-link AC-8534.3): 예약·off 줄·종일 메모 갈래와 아직 모자람·개인정보 모양 막힘. 이름은 지어낸 가짜

const CTX: ParseCtx = {
  staff: [{ id: 'ho', name: '정호연', mark: '호', color: 'lavender' }],
  kinds: DEFAULT_CAL_SETTINGS.kinds,
  look: { ...DEFAULT_GCAL_LOOK },
  people: [{ id: 'ho', name: '정호연' }],
  arrival: 'off',
  linkedOn: '2026-11-23',
}
const GUESS: GcalFix['guess'] = { chart: null, name: null, kindId: null, kindHow: null, staffId: null, staffHow: null, memo: null, word: null }
const fixOf = (over: Partial<GcalFix>): GcalFix => ({
  id: 'f9',
  gEventId: 'gev9001',
  day: '2026-11-27',
  start: 0,
  len: 0,
  allDay: true,
  gColor: null,
  gTitle: '',
  reason: 'off-name',
  guess: GUESS,
  state: 'open',
  gUpdated: '2026-11-26T05:00:00.000Z',
  ...over,
})

function store(sent = 1) {
  return {
    insertAppts: vi.fn(async () => ({ sent, blocked: 1 - sent })),
    addAllDay: vi.fn(async (item) => ({ ...item, id: 'd1' })),
    saveOffDay: vi.fn(async () => true),
    deleteFix: vi.fn(async () => undefined),
    setFixState: vi.fn(async () => undefined),
  } satisfies FixStore
}

describe('AC-8534.3: [예약표에 넣기] 갈래', () => {
  it('AC-8534.3: 길이를 고른 예약은 받기와 같은 줄(구글 제목·색 그대로, g_from pull)로 넣고 그 줄을 지운다', async () => {
    const s = store()
    const fix = fixOf({ allDay: false, start: 600, len: 300, gTitle: '1234 홍가상 도수 (호)', reason: 'too-long' })
    expect(await putFix(s, fix, ['len:30'], CTX)).toBe('appt')
    expect(s.insertAppts).toHaveBeenCalledWith([
      expect.objectContaining({ day: '2026-11-27', start: 600, len: 30, chart: '1234', name: '홍가상', staffId: 'ho', gEventId: 'gev9001', gTitle: '1234 홍가상 도수 (호)', gKeepTitle: true, colorFrom: 'google', gFrom: 'pull' }),
    ])
    expect(s.deleteFix).toHaveBeenCalledWith('f9')
  })

  it('AC-8534.3: 이름·메모에 개인정보 모양이라 넣지 못하면(sent 0) 줄을 지우지 않고 none', async () => {
    const s = store(0)
    const fix = fixOf({ allDay: false, start: 600, len: 300, gTitle: '1234 홍가상 도수 (호)', reason: 'too-long' })
    expect(await putFix(s, fix, ['len:30'], CTX)).toBe('none')
    expect(s.deleteFix).not.toHaveBeenCalled()
  })

  it('AC-8534.3: 하루 종일 off 줄은 고른 사람마다 휴무 줄 + 그날 off 짝(보낼 것 없음)을 두고 줄을 지운다', async () => {
    const s = store()
    expect(await putFix(s, fixOf({ gTitle: '김없음 off' }), ['person:ho'], CTX)).toBe('off')
    expect(s.addAllDay).toHaveBeenCalledWith({ day: '2026-11-27', type: 'off', memo: null, staffId: 'ho', staffName: '정호연' })
    expect(s.saveOffDay).toHaveBeenCalledWith({ day: '2026-11-27', gEventId: 'gev9001', gTitle: '김없음 off', gUpdated: '2026-11-26T05:00:00.000Z', wait: false })
    expect(s.deleteFix).toHaveBeenCalledWith('f9')
  })

  it('AC-8534.3: 하루 종일 일정을 종일 메모로 넣으면 그 구글 일정과 잇고(보낼 것 없음) 줄을 지운다', async () => {
    const s = store()
    expect(await putFix(s, fixOf({ gTitle: '김없음 off' }), ['memo'], CTX)).toBe('memo')
    expect(s.addAllDay).toHaveBeenCalledWith(expect.objectContaining({ day: '2026-11-27', type: 'memo', gEventId: 'gev9001', gWait: false }))
    expect(s.deleteFix).toHaveBeenCalledWith('f9')
  })

  it("AC-8534.3: 시간 일정을 종일 메모로 넣으면 메모는 웹앱에만 두고(일정과 잇지 않음) 그 줄은 '가져오지 않음'", async () => {
    const s = store()
    expect(await putFix(s, fixOf({ allDay: false, start: 600, len: 60, gTitle: '회의', reason: 'not-appt' }), ['memo'], CTX)).toBe('memo')
    expect(s.addAllDay).toHaveBeenCalledWith(expect.objectContaining({ type: 'memo', memo: '회의', gEventId: null }))
    expect(s.setFixState).toHaveBeenCalledWith('f9', 'skip')
    expect(s.deleteFix).not.toHaveBeenCalled()
  })

  it('AC-8534.3: 고를 거리를 다 고르지 않으면 아무것도 적지 않고 none', async () => {
    const s = store()
    expect(await putFix(s, fixOf({ gTitle: '김없음 off' }), [], CTX)).toBe('none')
    for (const fn of Object.values(s)) expect(fn).not.toHaveBeenCalled()
  })
})
