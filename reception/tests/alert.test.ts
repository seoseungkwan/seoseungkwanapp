// @vitest-environment jsdom
// 새 접수 알림 alert.js (TASK-21, REQ-1408, design.md 10절 '알림 소리는 첫 누름으로 연다'). 가짜 navigator.vibrate·가짜 AudioContext로 본다:
// 새 열쇠면 한 번 알림(여럿이어도 한 번), 처음·끊김 뒤·다시 보인 뒤 첫 읽기는 알리지 않음, 떨기 무늬 [200, 100, 200], 880Hz 150ms 삐 두 번,
// 첫 누름 전에는 소리 없음. 진짜 갤럭시·아이폰(무음 스위치 포함)은 AC-1408.5 의원 PC 확인이다. 자료는 가짜다(fixtures.ts)
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fx from './fixtures'
import type { FakeBoard, FakeRow } from './fixtures'

interface DrawInfo {
  first: boolean
  reading?: boolean
}

interface Alert {
  check: (board: FakeBoard, info: DrawInfo) => boolean
  unlock: () => void
  listen: (target?: EventTarget) => () => void
  forget: () => void
}

interface AlertDeps {
  navigator?: { vibrate?: (pattern: number[]) => boolean }
  AudioContext?: new () => unknown
}

interface AlertJs {
  createAlert: (deps?: AlertDeps) => Alert
}

interface Poll {
  start: () => void
  pause: () => void
  resume: () => void
}

interface PollJs {
  createPoll: (options: { host: HTMLElement; draw: (board: FakeBoard, info: DrawInfo) => void; wipe?: () => void }) => Poll
}

// 화면 파일은 빌드 없는 JS라 형 선언이 없다. 경로를 값으로 두어 형 검사가 묻지 않게 한다
const ALERT_JS = '../www/alert.js'
const POLL_JS = '../www/poll.js'
let alertJs: AlertJs
let pollJs: PollJs

beforeAll(async () => {
  // 아직 없으면(RED) 아무것도 하지 않는 알림으로 시험마다 실패를 보인다
  const idle = () => {}
  const missing: AlertJs = { createAlert: () => ({ check: () => false, unlock: idle, listen: () => idle, forget: idle }) }
  alertJs = ((await import(/* @vite-ignore */ ALERT_JS).catch(() => missing)) ?? missing) as AlertJs
  pollJs = (await import(/* @vite-ignore */ POLL_JS)) as PollJs
})

// ---- 가짜 기기 ----------------------------------------------------------------------------------------

/** 안드로이드(갤럭시) 모양: 떨기가 있다 */
function galaxy() {
  return { vibrate: vi.fn<(pattern: number[]) => boolean>(() => true) }
}

interface FakeParam {
  value: number
}

interface FakeNode {
  to: unknown
  connect: (node: unknown) => unknown
}

interface FakeTone extends FakeNode {
  type: string
  frequency: FakeParam
  startAt: number | null
  stopAt: number | null
  start: (at?: number) => void
  stop: (at?: number) => void
}

interface FakeGain extends FakeNode {
  gain: FakeParam
}

interface FakeSource extends FakeNode {
  buffer: unknown
  startAt: number | null
  start: (at?: number) => void
}

interface FakeContext {
  state: string
  currentTime: number
  destination: { kind: 'destination' }
  tones: FakeTone[]
  sources: FakeSource[]
  resumes: number
  madeInTap: boolean
}

/** 소리 마디: connect(다음 마디)가 어디로 이었는지(to) 적는다 */
function wired<T extends object>(parts: T): T & FakeNode {
  const n = parts as T & FakeNode
  n.to = null
  n.connect = (target: unknown) => {
    n.to = target
    return target
  }
  return n
}

/**
 * 가짜 Web Audio(아이폰 모양). 진짜 아이폰처럼 누르는 동안(tap) 부른 resume()만 소리를 연다(state 'running').
 * 누르지 않고 부른 resume()은 막힌다(state 그대로).
 */
function fakeAudio() {
  const made: FakeContext[] = []
  let tapping = false
  class FakeAudioContext implements FakeContext {
    state = 'suspended'
    currentTime = 3
    destination = { kind: 'destination' as const }
    tones: FakeTone[] = []
    sources: FakeSource[] = []
    resumes = 0
    madeInTap = tapping
    constructor() {
      made.push(this)
    }
    resume() {
      this.resumes += 1
      if (tapping) this.state = 'running'
      return Promise.resolve()
    }
    createOscillator(): FakeTone {
      const tone: FakeTone = wired<Omit<FakeTone, keyof FakeNode>>({
        type: 'sine',
        frequency: { value: 440 },
        startAt: null,
        stopAt: null,
        start(at = 0) {
          tone.startAt = at
        },
        stop(at = 0) {
          tone.stopAt = at
        },
      })
      this.tones.push(tone)
      return tone
    }
    createGain(): FakeGain {
      return wired({ gain: { value: 1 } })
    }
    createBuffer(channels: number, length: number, rate: number) {
      return { channels, length, rate }
    }
    createBufferSource(): FakeSource {
      const source: FakeSource = wired<Omit<FakeSource, keyof FakeNode>>({
        buffer: null,
        startAt: null,
        start(at = 0) {
          source.startAt = at
        },
      })
      this.sources.push(source)
      return source
    }
  }
  return {
    AudioContext: FakeAudioContext as unknown as new () => unknown,
    made,
    /** 화면 아무 곳이나 한 번 누른다(누르는 동안만 소리를 열 수 있다) */
    tap(type = 'touchend', target: EventTarget = document.body) {
      tapping = true
      try {
        target.dispatchEvent(new Event(type, { bubbles: true }))
      } finally {
        tapping = false
      }
    },
  }
}

/** 아이폰 모양: 떨기가 없고 Web Audio만 있다 */
function iphone() {
  const audio = fakeAudio()
  return { navigator: {}, ...audio }
}

/** 소리 마디가 스피커(destination)까지 이어졌나 */
function reaches(start: unknown, ctx: FakeContext): boolean {
  let at = start as FakeNode | null
  for (let i = 0; i < 5 && at; i += 1) {
    if (at.to === ctx.destination) return true
    at = at.to as FakeNode | null
  }
  return false
}

/** 들리는 삐(시작·멈춤이 정해지고 스피커까지 이어진 음) */
function beeps(ctx: FakeContext | undefined): FakeTone[] {
  return (ctx?.tones ?? []).filter((t) => t.startAt !== null && t.stopAt !== null && reaches(t, ctx as FakeContext))
}

// ---- 가짜 판 ------------------------------------------------------------------------------------------

const BASE = fx.mockupBoard()

/** 새로 들어온 진료대기 줄(가상환자10부터) */
function newcomer(n: number): FakeRow {
  return fx.fakeRow({
    k: fx.fakeKey(n),
    chart: `9100${String(n).padStart(2, '0')}`,
    name: `가상환자${String(n).padStart(2, '0')}`,
    info: '40세 · 여 · 신환',
    time: `13:${String(30 + n).padStart(2, '0')} 접수`,
    waited: '1분째 대기',
    rxLabel: '처방',
    rx: '첫 방문이라 지난 처방이 없어요',
  })
}

/** 승인 시안 판에 새 접수 n…을 더한 판 */
function plus(...ns: number[]): FakeBoard {
  const l = BASE.lists
  return fx.boardOf({ wait: [...l.wait, ...ns.map(newcomer)], hold: l.hold, pay: l.pay, done: l.done }, '13:42:20')
}

/** 가상환자02(진료대기)가 수납대기로, 가상환자06(수납대기)이 끝남으로 옮긴 판: 열쇠는 그대로다 */
function moved(): FakeBoard {
  const l = BASE.lists
  const k2 = l.wait.find((r) => r.k === fx.fakeKey(2)) as FakeRow
  const k6 = l.pay.find((r) => r.k === fx.fakeKey(6)) as FakeRow
  return fx.boardOf(
    {
      wait: l.wait.filter((r) => r !== k2),
      hold: l.hold,
      pay: [...l.pay.filter((r) => r !== k6), k2],
      done: [k6, ...l.done],
    },
    '13:42:30',
  )
}

/** 판의 열쇠 몇 개를 뺀 판(끝난 환자가 그날 자료에서 빠짐) */
function without(...ns: number[]): FakeBoard {
  const drop = new Set(ns.map(fx.fakeKey))
  const l = BASE.lists
  const keep = (rows: FakeRow[]) => rows.filter((r) => !drop.has(r.k))
  return fx.boardOf({ wait: keep(l.wait), hold: keep(l.hold), pay: keep(l.pay), done: keep(l.done) }, '13:42:40')
}

const FIRST: DrawInfo = { first: true, reading: false }
const NEXT: DrawInfo = { first: false, reading: false }

const stops: Array<() => void> = []

afterEach(() => {
  for (const stop of stops.splice(0)) stop()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

function listening(alert: Alert): Alert {
  stops.push(alert.listen(document))
  return alert
}

// ---- 시험 -----------------------------------------------------------------------------------------

describe('alert.js 새 접수 찾기', () => {
  it('AC-1408.1: 앞 읽기가 성공했고 이번 판에 앞에 없던 열쇠가 하나 있으면 한 번 알린다(갤럭시는 한 번 떤다)', () => {
    const nav = galaxy()
    const alert = alertJs.createAlert({ navigator: nav })
    expect(alert.check(BASE, FIRST)).toBe(false)
    expect(alert.check(plus(10), NEXT)).toBe(true)
    expect(nav.vibrate).toHaveBeenCalledTimes(1)
  })

  it('AC-1408.1: 새 접수가 셋이어도 한 번만 알린다. 같은 판을 다시 읽으면 알리지 않는다', () => {
    const nav = galaxy()
    const alert = alertJs.createAlert({ navigator: nav })
    alert.check(BASE, FIRST)
    expect(alert.check(plus(10, 11, 12), NEXT)).toBe(true)
    expect(nav.vibrate).toHaveBeenCalledTimes(1)
    expect(alert.check(plus(10, 11, 12), NEXT)).toBe(false)
    expect(nav.vibrate).toHaveBeenCalledTimes(1)
  })

  it('AC-1408.1: 칸을 옮긴 환자(열쇠 그대로)·빠진 환자는 새 접수가 아니다', () => {
    const nav = galaxy()
    const alert = alertJs.createAlert({ navigator: nav })
    alert.check(BASE, FIRST)
    expect(alert.check(moved(), NEXT)).toBe(false)
    expect(alert.check(without(8, 9), NEXT)).toBe(false)
    expect(nav.vibrate).not.toHaveBeenCalled()
  })

  it('AC-1408.1: 견주는 것은 바로 앞 읽기다. 앞 읽기 뒤 새 접수가 또 오면 또 한 번 알린다', () => {
    const nav = galaxy()
    const alert = alertJs.createAlert({ navigator: nav })
    alert.check(BASE, FIRST)
    alert.check(plus(10), NEXT)
    alert.check(plus(10), NEXT)
    expect(alert.check(plus(10, 11), NEXT)).toBe(true)
    expect(nav.vibrate).toHaveBeenCalledTimes(2)
  })

  it('AC-1408.1: 칸 넷·진료 순서 어디에 처음 나와도(바로 수납대기·끝남) 새 열쇠면 알린다', () => {
    const nav = galaxy()
    const alert = alertJs.createAlert({ navigator: nav })
    alert.check(BASE, FIRST)
    const l = BASE.lists
    const direct = fx.boardOf({ wait: l.wait, hold: l.hold, pay: l.pay, done: [newcomer(13), ...l.done] })
    expect(alert.check(direct, NEXT)).toBe(true)
    expect(nav.vibrate).toHaveBeenCalledTimes(1)
  })
})

describe('alert.js 첫 읽기는 기준', () => {
  it('AC-1408.2: 화면을 처음 열었을 때의 첫 읽기(info.first)는 알리지 않고 그 판이 기준이 된다', () => {
    const nav = galaxy()
    const alert = alertJs.createAlert({ navigator: nav })
    expect(alert.check(plus(10, 11), FIRST)).toBe(false)
    expect(nav.vibrate).not.toHaveBeenCalled()
    expect(alert.check(plus(10, 11), NEXT)).toBe(false)
    expect(alert.check(plus(10, 11, 12), NEXT)).toBe(true)
    expect(nav.vibrate).toHaveBeenCalledTimes(1)
  })

  it('AC-1408.2: 끊김에서 돌아온 첫 읽기(info.first)는 그 사이 새 접수가 있어도 알리지 않고 새 기준이 된다', () => {
    const nav = galaxy()
    const alert = alertJs.createAlert({ navigator: nav })
    alert.check(BASE, FIRST)
    alert.forget() // 끊김(poll wipe)
    expect(alert.check(plus(10, 11), FIRST)).toBe(false)
    expect(nav.vibrate).not.toHaveBeenCalled()
    expect(alert.check(plus(10, 11, 12), NEXT)).toBe(true)
    expect(nav.vibrate).toHaveBeenCalledTimes(1)
  })

  it('AC-1408.2: 기준이 없으면(forget() 뒤·처음 만든 뒤) info.first가 없어도 알리지 않는다', () => {
    const nav = galaxy()
    const alert = alertJs.createAlert({ navigator: nav })
    expect(alert.check(plus(10), NEXT)).toBe(false)
    alert.forget()
    expect(alert.check(plus(10, 11), NEXT)).toBe(false)
    expect(nav.vibrate).not.toHaveBeenCalled()
    expect(alert.check(plus(10, 11, 12), NEXT)).toBe(true)
  })

  describe('poll.js 고리에 이었을 때', () => {
    let server: FakeBoard
    let failing: boolean

    beforeEach(() => {
      vi.useFakeTimers()
      server = BASE
      failing = false
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          failing
            ? Promise.reject(new TypeError('Failed to fetch'))
            : Promise.resolve(new Response(JSON.stringify(server), { status: 200, headers: { 'Content-Type': 'application/json' } })),
        ),
      )
    })

    function phone(deps: AlertDeps) {
      const host = document.createElement('div')
      document.body.appendChild(host)
      const alert = listening(alertJs.createAlert(deps))
      const poll = pollJs.createPoll({ host, draw: (board, info) => alert.check(board, info), wipe: () => alert.forget() })
      stops.push(() => poll.pause())
      return { alert, poll }
    }

    it('AC-1408.2: 처음 열기·끊김에서 돌아옴·숨겼다 다시 보임의 첫 읽기는 알리지 않고, 그다음 10초 읽기의 새 접수는 알린다', async () => {
      const nav = galaxy()
      const { poll } = phone({ navigator: nav })
      server = plus(10)
      poll.start()
      await vi.advanceTimersByTimeAsync(0)
      expect(nav.vibrate).not.toHaveBeenCalled() // 처음 열기

      failing = true
      await vi.advanceTimersByTimeAsync(10000) // 끊김
      server = plus(10, 11)
      failing = false
      await vi.advanceTimersByTimeAsync(10000) // 돌아온 첫 읽기
      expect(nav.vibrate).not.toHaveBeenCalled()

      poll.pause() // 숨김
      server = plus(10, 11, 12)
      poll.resume() // 다시 보임
      await vi.advanceTimersByTimeAsync(0)
      expect(nav.vibrate).not.toHaveBeenCalled()

      server = plus(10, 11, 12, 13)
      await vi.advanceTimersByTimeAsync(10000)
      expect(nav.vibrate).toHaveBeenCalledTimes(1)
    })
  })
})

describe('alert.js 알리는 법', () => {
  it('AC-1408.3: navigator.vibrate가 있는 기기(안드로이드)는 [200, 100, 200]으로 떨고 소리는 내지 않는다', () => {
    const nav = galaxy()
    const audio = fakeAudio()
    const alert = listening(alertJs.createAlert({ navigator: nav, AudioContext: audio.AudioContext }))
    audio.tap()
    alert.check(BASE, FIRST)
    alert.check(plus(10), NEXT)
    expect(nav.vibrate).toHaveBeenCalledTimes(1)
    expect(nav.vibrate).toHaveBeenCalledWith([200, 100, 200])
    expect(audio.made.flatMap((c) => c.tones)).toEqual([])
  })

  it('AC-1408.3: 떨기가 없는 기기(아이폰)는 누른 뒤 새 접수에 880Hz 150ms 삐를 두 번(겹치지 않게) Web Audio로 낸다', () => {
    const phone = iphone()
    const alert = listening(alertJs.createAlert({ navigator: phone.navigator, AudioContext: phone.AudioContext }))
    phone.tap()
    alert.check(BASE, FIRST)
    expect(alert.check(plus(10), NEXT)).toBe(true)
    expect(phone.made).toHaveLength(1)
    const ctx = phone.made[0]
    const two = beeps(ctx)
    expect(two).toHaveLength(2)
    for (const tone of two) {
      expect(tone.frequency.value).toBe(880)
      expect(tone.type).toBe('sine')
      expect((tone.stopAt as number) - (tone.startAt as number)).toBeCloseTo(0.15, 5)
      expect(tone.startAt as number).toBeGreaterThanOrEqual(ctx.currentTime)
    }
    const [one, other] = [...two].sort((a, b) => (a.startAt as number) - (b.startAt as number))
    expect(other.startAt as number).toBeGreaterThan(one.stopAt as number)
  })

  it('AC-1408.3: 새 접수가 여럿이어도 삐는 두 번(한 알림)이다', () => {
    const phone = iphone()
    const alert = listening(alertJs.createAlert({ navigator: phone.navigator, AudioContext: phone.AudioContext }))
    phone.tap()
    alert.check(BASE, FIRST)
    alert.check(plus(10, 11, 12), NEXT)
    expect(beeps(phone.made[0])).toHaveLength(2)
  })

  it('AC-1408.3: AudioContext가 없고 webkitAudioContext만 있는 옛 아이폰도 삐를 낸다(기본값)', () => {
    const phone = iphone()
    vi.stubGlobal('webkitAudioContext', phone.AudioContext)
    const alert = listening(alertJs.createAlert({ navigator: phone.navigator }))
    phone.tap()
    alert.check(BASE, FIRST)
    alert.check(plus(10), NEXT)
    expect(beeps(phone.made[0])).toHaveLength(2)
  })

  it('AC-1408.3: 떨기·소리가 오류를 내도 던지지 않는다(그리기 안에서 던지면 고리가 화면을 지운다)', () => {
    const angry = {
      vibrate: () => {
        throw new Error('막힘')
      },
    }
    const shaky = alertJs.createAlert({ navigator: angry })
    shaky.check(BASE, FIRST)
    expect(() => shaky.check(plus(10), NEXT)).not.toThrow()

    const Broken = function () {
      throw new Error('오디오 없음')
    } as unknown as new () => unknown
    const mute = listening(alertJs.createAlert({ navigator: {}, AudioContext: Broken }))
    expect(() => document.body.dispatchEvent(new Event('touchend', { bubbles: true }))).not.toThrow()
    mute.check(BASE, FIRST)
    expect(() => mute.check(plus(10), NEXT)).not.toThrow()
  })
})

describe('alert.js 첫 누름에 소리 열기', () => {
  it('AC-1408.4: 아직 한 번도 누르지 않았으면 새 접수 알림은 소리 없이 지나간다(오디오를 만들지도 않는다)', () => {
    const phone = iphone()
    const alert = listening(alertJs.createAlert({ navigator: phone.navigator, AudioContext: phone.AudioContext }))
    alert.check(BASE, FIRST)
    expect(alert.check(plus(10), NEXT)).toBe(true)
    expect(phone.made).toEqual([])
  })

  it('AC-1408.4: 처음 아무 곳이나 누르면 그 누름 안에서 오디오를 열고(resume), 누를 때는 삐가 나지 않으며 앞서 지나간 알림을 다시 울리지 않는다', () => {
    const phone = iphone()
    const alert = listening(alertJs.createAlert({ navigator: phone.navigator, AudioContext: phone.AudioContext }))
    alert.check(BASE, FIRST)
    alert.check(plus(10), NEXT) // 누르기 전 알림: 지나감
    phone.tap()
    expect(phone.made).toHaveLength(1)
    const ctx = phone.made[0]
    expect(ctx.madeInTap).toBe(true)
    expect(ctx.resumes).toBeGreaterThanOrEqual(1)
    expect(ctx.state).toBe('running')
    expect(beeps(ctx)).toEqual([])
    // 옛 아이폰을 위한 들리지 않는 1표본(삐 아님)
    expect(ctx.sources.some((s) => s.startAt !== null && reaches(s, ctx))).toBe(true)

    alert.check(plus(10), NEXT)
    expect(beeps(ctx)).toEqual([])
    alert.check(plus(10, 11), NEXT)
    expect(beeps(ctx)).toHaveLength(2)
  })

  it.each(['pointerup', 'touchend', 'click', 'keydown'])('AC-1408.4: 누름 %s 하나로도 소리를 연다', (type) => {
    const phone = iphone()
    listening(alertJs.createAlert({ navigator: phone.navigator, AudioContext: phone.AudioContext }))
    phone.tap(type)
    expect(phone.made).toHaveLength(1)
    expect(phone.made[0].state).toBe('running')
  })

  it('AC-1408.4: 여러 번 눌러도 오디오는 하나다. listen이 준 함수로 그만 들으면 눌러도 열지 않는다', () => {
    const phone = iphone()
    const alert = alertJs.createAlert({ navigator: phone.navigator, AudioContext: phone.AudioContext })
    const stop = alert.listen(document)
    phone.tap('pointerup')
    phone.tap('touchend')
    phone.tap('click')
    expect(phone.made).toHaveLength(1)
    stop()

    const other = iphone()
    const later = alertJs.createAlert({ navigator: other.navigator, AudioContext: other.AudioContext })
    later.listen(document)()
    other.tap()
    expect(other.made).toEqual([])
  })

  it('AC-1408.4: 소리가 다시 막히면(아이폰 끼어듦) 알림 때 다시 열어 보기만 하고 그 알림은 미뤄 울리지 않는다. 다음 누름에 다시 연다', () => {
    const phone = iphone()
    const alert = listening(alertJs.createAlert({ navigator: phone.navigator, AudioContext: phone.AudioContext }))
    phone.tap()
    const ctx = phone.made[0]
    alert.check(BASE, FIRST)
    ctx.state = 'interrupted'
    const before = ctx.resumes
    alert.check(plus(10), NEXT)
    expect(ctx.resumes).toBe(before + 1)
    expect(ctx.tones).toEqual([])
    phone.tap()
    expect(ctx.state).toBe('running')
    expect(ctx.tones).toEqual([])
    alert.check(plus(10, 11), NEXT)
    expect(beeps(ctx)).toHaveLength(2)
    expect(phone.made).toHaveLength(1)
  })

  it('AC-1408.4: 소리 열기·알림은 화면에 새 글이나 마디를 더하지 않는다', () => {
    const host = document.createElement('div')
    host.id = 'app'
    host.textContent = '13:42:10 기준 · 10초마다 저절로 바뀌어요'
    document.body.appendChild(host)
    const snapshot = document.body.innerHTML
    const phone = iphone()
    const alert = listening(alertJs.createAlert({ navigator: phone.navigator, AudioContext: phone.AudioContext }))
    alert.check(BASE, FIRST)
    alert.check(plus(10), NEXT)
    phone.tap()
    alert.check(plus(10, 11), NEXT)
    expect(beeps(phone.made[0])).toHaveLength(2)
    expect(document.body.innerHTML).toBe(snapshot)
  })

  it('AC-1408.4: 떨기 기기는 소리를 열 일이 없다(누름에 오디오를 만들지 않는다)', () => {
    const nav = galaxy()
    const audio = fakeAudio()
    listening(alertJs.createAlert({ navigator: nav, AudioContext: audio.AudioContext }))
    audio.tap()
    expect(audio.made).toEqual([])
  })
})

describe('alert.js 진짜 기기 (의원 PC)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('AC-1408.5 (가짜 기기로 볼 수 있는 것만 — 진짜 갤럭시 떨기·아이폰 소리·무음 스위치는 의원 PC 확인): 두 기기를 열어 두고 한 번 누른 뒤 새 접수가 들어오면 다음 10초 읽기 안에 갤럭시 모양은 떨고 아이폰 모양은 삐가 난다', async () => {
    let server = BASE
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(server), { status: 200, headers: { 'Content-Type': 'application/json' } }))),
    )
    const nav = galaxy()
    const ios = iphone()
    const phones = [
      listening(alertJs.createAlert({ navigator: nav, AudioContext: fakeAudio().AudioContext })),
      listening(alertJs.createAlert({ navigator: ios.navigator, AudioContext: ios.AudioContext })),
    ].map((alert) => {
      const host = document.createElement('div')
      document.body.appendChild(host)
      const poll = pollJs.createPoll({ host, draw: (board, info) => alert.check(board, info), wipe: () => alert.forget() })
      stops.push(() => poll.pause())
      poll.start()
      return poll
    })
    expect(phones).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(0)
    ios.tap() // 직원이 화면을 한 번 누름

    server = plus(10) // 비트에 새 접수
    await vi.advanceTimersByTimeAsync(9999)
    expect(nav.vibrate).not.toHaveBeenCalled()
    expect(beeps(ios.made[0])).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    expect(nav.vibrate).toHaveBeenCalledTimes(1)
    expect(nav.vibrate).toHaveBeenCalledWith([200, 100, 200])
    expect(beeps(ios.made[0])).toHaveLength(2)
  })
})
