import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fillStatus, type FillDone } from './status'
import type { FillJob } from './shapes'

// 넣기 상태 듣기·알리기(spec google-link REQ-8512 AC-8512.4). 알리는 쪽은 GoogleSheetAuto·손 넣기(TASK-14·23),
// 듣는 쪽은 탭 줄 주황 점·띠·결과 줄(TASK-15·23)이다. 같은 쪽(한 화면) 안의 메모리 값뿐이라 네트워크·저장소가 없다.
// 결과 줄은 손 넣기와 '확인 필요'만 띄우고 [✕]로 닫거나 다음에 띄울 결과로 바뀐다(notes-sunap '내가 정한 기본값', AC-8515.4).

const TODAY_JOB: FillJob = { day: '2026-11-26', mode: 'fillEmpty', via: 'auto', auto: true }
const HAND_JOB: FillJob = { day: '2026-11-26', mode: 'fillEmpty', via: 'hand', auto: false }
function done(via: FillDone['via'], outcome: FillDone['outcome'], when: string, over: Partial<FillDone> = {}): FillDone {
  return { at: `${when}:00+09:00`, day: when.slice(0, 10), via, mode: 'fillEmpty', outcome, code: outcome === 'fail' ? 'E-GSHEET-NET' : null, rows: 12, ...over }
}

afterEach(() => fillStatus.reset())

describe('AC-8512.4: 듣기·알리기', () => {
  it('AC-8512.4: 처음 상태 — 아직 모름 · 넣는 중 아님 · 기록 없음', () => {
    expect(fillStatus.get()).toEqual({
      pc: 'unknown',
      oldHelper: false,
      oldExtension: false,
      filling: null,
      last: null,
      lastOk: null,
      stopped: null,
      result: null,
    })
  })

  it('AC-8512.4: 넣기 시작·끝을 듣는 쪽이 바로(같은 차례에) 받는다', () => {
    const heard: unknown[] = []
    const stop = fillStatus.subscribe(() => heard.push(fillStatus.get().filling))
    expect(fillStatus.start(TODAY_JOB)).toBe(true)
    expect(heard).toEqual([TODAY_JOB])
    fillStatus.finish(done('auto', 'ok', '2026-11-26T14:35'))
    expect(heard).toEqual([TODAY_JOB, null])
    stop()
    fillStatus.start(TODAY_JOB)
    expect(heard).toHaveLength(2)
  })

  it('AC-8512.4: 듣는 쪽이 여럿이어도 모두 받고, 하나를 거둬도 나머지는 받는다', () => {
    const a = vi.fn()
    const b = vi.fn()
    const stopA = fillStatus.subscribe(a)
    fillStatus.subscribe(b)
    fillStatus.start(TODAY_JOB)
    stopA()
    fillStatus.finish(done('auto', 'ok', '2026-11-26T14:35'))
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(2)
  })

  it('AC-8512.4: 바뀌지 않으면 같은 값을 준다(화면이 다시 그리지 않게), 바뀌면 새 값', () => {
    const first = fillStatus.get()
    expect(fillStatus.get()).toBe(first)
    fillStatus.start(TODAY_JOB)
    expect(fillStatus.get()).not.toBe(first)
  })

  it('AC-8512.4: 다른 넣기가 돌고 있으면 시작하지 않는다', () => {
    const heard = vi.fn()
    expect(fillStatus.start(TODAY_JOB)).toBe(true)
    fillStatus.subscribe(heard)
    expect(fillStatus.start(HAND_JOB)).toBe(false)
    expect(fillStatus.get().filling).toEqual(TODAY_JOB)
    expect(heard).not.toHaveBeenCalled()
  })
})

describe('AC-8512.4: 넣는 PC 표시 (nobit · 옛 도우미·확장 안내)', () => {
  it('AC-8512.4: 넣는 PC인지와 옛 판을 알린다', () => {
    const heard = vi.fn()
    fillStatus.subscribe(heard)
    fillStatus.setPc('viewer', { helper: true, extension: false })
    expect(fillStatus.get()).toMatchObject({ pc: 'viewer', oldHelper: true, oldExtension: false })
    fillStatus.setPc('filler')
    expect(fillStatus.get()).toMatchObject({ pc: 'filler', oldHelper: false, oldExtension: false })
    expect(heard).toHaveBeenCalledTimes(2)
  })

  it('AC-8512.4: 같은 값이면 알리지 않는다(30초마다 다시 봐도 화면이 흔들리지 않게)', () => {
    fillStatus.setPc('filler')
    const heard = vi.fn()
    fillStatus.subscribe(heard)
    fillStatus.setPc('filler', { helper: false, extension: false })
    expect(heard).not.toHaveBeenCalled()
  })
})

describe('AC-8512.4: 마지막 넣기 · 멈춤(탭 줄 주황 점)', () => {
  it('AC-8512.4: 실패하면 멈춤, 다음에 넣으면 풀린다', () => {
    fillStatus.finish(done('auto', 'ok', '2026-11-26T14:35'))
    const fail = done('auto', 'fail', '2026-11-26T14:40')
    fillStatus.finish(fail)
    expect(fillStatus.get().stopped).toEqual(fail)
    expect(fillStatus.get().last).toEqual(fail)
    expect(fillStatus.get().lastOk?.at).toBe('2026-11-26T14:35:00+09:00')
    fillStatus.finish(done('auto', 'same', '2026-11-26T14:45'))
    expect(fillStatus.get().stopped).toBeNull()
    expect(fillStatus.get().lastOk?.at).toBe('2026-11-26T14:45:00+09:00')
  })

  it('AC-8512.4: 다른 넣기가 돌아 못 한 것(E-BRIDGE-BUSY)은 실패로 안 침 — 넣는 중만 푼다', () => {
    fillStatus.finish(done('auto', 'ok', '2026-11-26T14:35'))
    const before = fillStatus.get()
    fillStatus.start(TODAY_JOB)
    fillStatus.finish(done('auto', 'fail', '2026-11-26T14:40', { code: 'E-BRIDGE-BUSY' }))
    expect(fillStatus.get()).toEqual({ ...before, filling: null })
  })

  it("AC-8512.4: 마지막 넣기 (n줄)은 그날 시트에 넣은 것만 — 지난 날 다시 넣기는 바꾸지 않는다", () => {
    const today = done('auto', 'ok', '2026-11-26T08:00', { rows: 3 })
    fillStatus.finish(today)
    fillStatus.finish(done('past', 'ok', '2026-11-26T08:01', { day: '2026-11-25', rows: 40 }))
    expect(fillStatus.get().lastOk).toEqual(today)
    expect(fillStatus.get().last?.via).toBe('past')
  })

  it('AC-8512.4: 서버 기록으로 채운다(새 것이 이김, 결과 줄은 띄우지 않음)', () => {
    const newer = done('auto', 'fail', '2026-11-26T14:40')
    fillStatus.finish(newer)
    const heard = vi.fn()
    fillStatus.subscribe(heard)
    fillStatus.seed([done('hand', 'ok', '2026-11-26T14:41'), done('auto', 'ok', '2026-11-26T14:30'), done('auto', 'warn', '2026-11-25T19:30')])
    const s = fillStatus.get()
    expect(s.last?.at).toBe('2026-11-26T14:41:00+09:00')
    expect(s.lastOk?.at).toBe('2026-11-26T14:41:00+09:00')
    expect(s.stopped).toBeNull()
    expect(s.result).toBeNull()
    expect(heard).toHaveBeenCalledTimes(1)
  })

  it('AC-8512.4: 서버 기록이 더 오래됐으면 지금 값을 그대로 둔다 · 읽지 못하는 시각은 버린다', () => {
    const fail = done('auto', 'fail', '2026-11-26T14:40')
    fillStatus.finish(fail)
    fillStatus.seed([done('auto', 'ok', '2026-11-26T14:30'), { ...done('auto', 'ok', '2026-11-26T15:00'), at: '언제' }])
    expect(fillStatus.get().stopped).toEqual(fail)
    expect(fillStatus.get().last).toEqual(fail)
    expect(fillStatus.get().lastOk?.at).toBe('2026-11-26T14:30:00+09:00')
  })
})

describe('AC-8512.4: 띠 아래 결과 줄', () => {
  it('AC-8512.4: 손 넣기 결과는 띄우고, 저절로 넣은 보통 결과는 줄을 바꾸지 않는다', () => {
    const hand = done('hand', 'ok', '2026-11-26T14:41')
    fillStatus.finish(hand)
    expect(fillStatus.get().result).toEqual(hand)
    fillStatus.finish(done('auto', 'same', '2026-11-26T14:45'))
    fillStatus.finish(done('auto', 'ok', '2026-11-26T14:50'))
    expect(fillStatus.get().result).toEqual(hand)
  })

  it('AC-8512.4: 저절로 넣은 확인 필요 결과는 띄우고 [✕]로 닫는다', () => {
    const warn = done('auto', 'warn', '2026-11-26T14:40')
    fillStatus.finish(warn)
    expect(fillStatus.get().result).toEqual(warn)
    const heard = vi.fn()
    fillStatus.subscribe(heard)
    fillStatus.dismissResult()
    expect(fillStatus.get().result).toBeNull()
    expect(heard).toHaveBeenCalledTimes(1)
    fillStatus.dismissResult()
    expect(heard).toHaveBeenCalledTimes(1)
  })

  it('AC-8512.4: 손 넣기가 실패하면 결과 줄 대신 멈춤', () => {
    fillStatus.finish(done('hand', 'ok', '2026-11-26T14:41'))
    const fail = done('hand', 'fail', '2026-11-26T14:42', { code: 'E-GSHEET-KEY' })
    fillStatus.finish(fail)
    expect(fillStatus.get().result).toBeNull()
    expect(fillStatus.get().stopped).toEqual(fail)
  })

  it('AC-8512.4: 결과 줄에 넣기 답 숫자를 함께 둔다(결과 글은 result.ts가 만든다)', () => {
    const reply = { rows: 12, patients: 10 } as FillDone['reply']
    fillStatus.finish(done('hand', 'ok', '2026-11-26T14:41', { reply }))
    expect(fillStatus.get().result?.reply).toBe(reply)
  })
})

describe('AC-8512.4: 네트워크·저장소·React 없음', () => {
  const FILES = ['shapes.ts', 'plan.ts', 'result.ts', 'check.ts', 'status.ts']
  const FORBIDDEN = /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|indexedDB|BroadcastChannel|cookie|navigator|window|document)\b/

  it.each(FILES)('AC-8512.4: %s', (file) => {
    const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8')
    expect(source).not.toMatch(FORBIDDEN)
    const imports = [...source.matchAll(/(?:^|\n)\s*(?:import|export)\b[^'"]*?from\s+['"]([^'"]+)['"]/g)].map((m) => m[1])
    for (const spec of imports) expect(spec).toMatch(/^(\.\/(shapes|plan|result|check)|@\/lib\/analytics\/dates)$/)
  })
})
