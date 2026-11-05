// @vitest-environment jsdom
// 읽기 고리 poll.js (TASK-18·TASK-31, design.md 10절). 답의 every초 고리(지금 5초, 답이 온 뒤 다음 예약, 처음 연결 전에는 기본 5초),
// 첫 실패에 그 자리에서 지우기 + 연결 끊김 화면(AC-1407.4),
// [새로 고침] refreshNow()(AC-1407.10), 숨김 pause()·다시 보임 resume()(AC-1407.11). 가짜 fetch·가짜 시계, 그리기는 board.js(TASK-17)를 그대로 쓴다.
// 자료는 가짜다(fixtures.ts)
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fx from './fixtures'
import type { FakeBoard } from './fixtures'

interface DrawInfo {
  first: boolean
  reading: boolean
}

interface Poll {
  start: () => void
  refreshNow: () => void
  readNow: () => void
  pause: () => void
  resume: () => void
  board: () => FakeBoard | null
  lastAt: () => string | null
  reading: () => boolean
  signal: () => AbortSignal
}

interface PollOptions {
  host: HTMLElement
  draw: (board: FakeBoard, info: DrawInfo) => void
  wipe?: () => void
  onReading?: (reading: boolean) => void
}

interface PollJs {
  createPoll: (options: PollOptions) => Poll
  /** 처음 연결 전에만 쓰는 간격(초) */
  DEFAULT_EVERY?: number
}

interface BoardJs {
  renderBoard: (host: HTMLElement, board: FakeBoard, view?: Record<string, unknown>) => HTMLElement
  setReading: (host: HTMLElement, reading: boolean) => void
}

// 화면 파일은 빌드 없는 JS라 형 선언이 없다(design.md 결정 '화면은 빌드 없는 JS'). 경로를 값으로 두어 형 검사가 묻지 않게 한다
const POLL_JS = '../www/poll.js'
const BOARD_JS = '../www/board.js'
const WWW = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'www')
let pollJs: PollJs
let boardJs: BoardJs

beforeAll(async () => {
  // 아직 없으면(RED) 아무것도 하지 않는 고리로 시험마다 실패를 보인다
  const idle = () => {}
  const missing: PollJs = {
    createPoll: () => ({
      start: idle,
      refreshNow: idle,
      readNow: idle,
      pause: idle,
      resume: idle,
      board: () => null,
      lastAt: () => null,
      reading: () => false,
      signal: () => new AbortController().signal,
    }),
  }
  pollJs = ((await import(/* @vite-ignore */ POLL_JS).catch(() => missing)) ?? missing) as PollJs
  boardJs = (await import(/* @vite-ignore */ BOARD_JS)) as BoardJs
})

// ---- 가짜 도우미 ------------------------------------------------------------------------------------

interface Call {
  url: string
  init: RequestInit
}

type Reply = (call: Call) => Promise<Response>

let calls: Call[]
let replies: Reply[]

function json(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } }))
}

/** 판 하나를 주는 답 */
const ok =
  (board: FakeBoard = fx.mockupBoard()): Reply =>
  () =>
    json(board)

/** 실패 네 가지(AC-1407.4) */
const FAILS: Array<[string, Reply, number]> = [
  ['연결 안 됨', () => Promise.reject(new TypeError('Failed to fetch')), 0],
  [
    '5초 넘음',
    (call) =>
      new Promise((_, reject) => call.init.signal?.addEventListener('abort', () => reject(new DOMException('끊김', 'AbortError')))),
    5000,
  ],
  ['200 아님(볼 수 없음 503)', () => json({ state: 'unavailable' }, 503), 0],
  ['모양 틀림', () => json({ state: 'ok', at: '13:42:20', lists: { queue: [{ name: '가상환자01' }] } }), 0],
  ['every 없음(모양 틀림)', () => json({ ...fx.mockupBoard('13:42:20'), every: undefined }), 0],
  ['every 2~60 밖(모양 틀림)', () => json({ ...fx.mockupBoard('13:42:20'), every: 61 }), 0],
]

/** 손으로 답하는 요청. fetch는 끊김을 모르는 척한다(늦은 답 시험) */
function held() {
  let resolve: (r: Response) => void = () => {}
  const reply: Reply = () => new Promise<Response>((r) => (resolve = r))
  return {
    reply,
    answer: (board: FakeBoard) => resolve(new Response(JSON.stringify(board), { status: 200 })),
  }
}

function urls(): string[] {
  return calls.map((c) => c.url)
}

/** 바로 끝나는 일(마이크로태스크)을 다 돌린다 */
async function settle() {
  await vi.advanceTimersByTimeAsync(0)
}

async function wait(ms: number) {
  await vi.advanceTimersByTimeAsync(ms)
}

// ---- 화면 잇기(app.js 대신 시험이 board.js로 그린다) ---------------------------------------------------

function appHost(): HTMLElement {
  const app = document.createElement('div')
  app.id = 'app'
  document.body.appendChild(app)
  return app
}

function setup() {
  const app = appHost()
  const view = { lane: 'queue' }
  const draws: Array<{ at: string } & DrawInfo> = []
  const wipe = vi.fn()
  const readings: boolean[] = []
  const poll: Poll = pollJs.createPoll({
    host: app,
    draw: (board, info) => {
      draws.push({ at: board.at, first: info?.first, reading: info?.reading })
      boardJs.renderBoard(app, board, {
        lane: view.lane,
        reading: info?.reading === true,
        onPick: (lane: string) => (view.lane = lane),
        onRefresh: () => poll.refreshNow(),
      })
    },
    wipe,
    onReading: (reading) => {
      readings.push(reading)
      boardJs.setReading(app, reading)
    },
  })
  return { app, view, draws, wipe, readings, poll }
}

function textOf(root: ParentNode, selector: string): string | null {
  return root.querySelector(selector)?.textContent?.trim() ?? null
}

/** 진료 순서(처음 고른 칸)에 보이는 환자 글 */
function queueTexts(b: FakeBoard): string[] {
  return b.lists.queue.flatMap((row) => [row.name, row.chart, row.memo, row.rx, row.info]).filter(Boolean)
}

/** 가짜 판의 환자 글(이름·차트번호·메모·처방·정보) 모두 */
function patientTexts(b: FakeBoard): string[] {
  const out = new Set<string>()
  for (const row of b.lists.queue.concat(b.lists.pay, b.lists.done))
    for (const v of [row.name, row.chart, row.memo, row.rx, row.info]) if (v) out.add(v)
  return [...out]
}

/** 화면(DOM)과 고리 상태 어디에도 환자 글이 없다 */
function expectNoPatient(poll: Poll, b: FakeBoard = fx.mockupBoard()) {
  const state = JSON.stringify({ board: poll.board(), lastAt: poll.lastAt(), reading: poll.reading() })
  for (const t of patientTexts(b)) {
    expect(document.body.textContent, `화면에 ${t}`).not.toContain(t)
    expect(state, `상태에 ${t}`).not.toContain(t)
  }
  expect(document.querySelector('.row, .rows')).toBeNull()
  expect(poll.board()).toBeNull()
}

function refreshButton(app: HTMLElement): HTMLButtonElement | null {
  return app.querySelector<HTMLButtonElement>('header.top button.refresh')
}

function labelOf(button: Element | null): string {
  if (!button) return ''
  return [...button.childNodes]
    .filter((n) => !(n instanceof Element && n.getAttribute('aria-hidden') === 'true'))
    .map((n) => n.textContent ?? '')
    .join('')
    .trim()
}

let polls: Poll[]

beforeEach(() => {
  calls = []
  replies = []
  polls = []
  vi.useFakeTimers()
  vi.stubGlobal(
    'fetch',
    vi.fn((url: unknown, init?: RequestInit) => {
      const call = { url: String(url), init: init ?? {} }
      calls.push(call)
      return (replies.shift() ?? ok())(call)
    }),
  )
})

afterEach(() => {
  for (const p of polls) p.pause()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

/** 고리를 만들어 시작하고 첫 읽기(판 b)가 그려질 때까지 돌린다 */
async function started(b: FakeBoard = fx.mockupBoard()) {
  const s = setup()
  polls.push(s.poll)
  replies.push(ok(b))
  s.poll.start()
  await settle()
  return s
}

// ---- 시험 -----------------------------------------------------------------------------------------

describe('poll.js every초 고리 (지금 5초)', () => {
  it('AC-1407.3: start()는 바로 GET /api/board 하나를 읽어 그리고(first), 답이 온 뒤 답의 every초(5초)마다 다시 읽어 그린다', async () => {
    const { app, draws, poll } = await started()
    expect(urls()).toEqual(['/api/board'])
    expect(draws).toEqual([{ at: '13:42:10', first: true, reading: false }])
    expect(textOf(app, 'p.asof')).toBe('13:42:10 기준 · 5초마다 저절로 바뀌어요')
    expect(poll.board()?.at).toBe('13:42:10')
    expect(poll.lastAt()).toBe('13:42')

    replies.push(ok(fx.mockupBoard('13:42:20')))
    await wait(4999)
    expect(urls().length).toBe(1)
    await wait(1)
    expect(urls()).toEqual(['/api/board', '/api/board'])
    expect(draws.at(-1)).toEqual({ at: '13:42:20', first: false, reading: false })
    expect(textOf(app, 'p.asof')).toBe('13:42:20 기준 · 5초마다 저절로 바뀌어요')
    await wait(5000)
    expect(urls().length).toBe(3)
  })

  it('AC-1407.3: 다음 읽기는 답이 온 때부터 every초(5초) 뒤다. 느린 답을 기다리는 동안 요청이 겹치지 않는다', async () => {
    const s = setup()
    polls.push(s.poll)
    const slow = held()
    replies.push(slow.reply)
    s.poll.start()
    await wait(3000)
    expect(urls().length).toBe(1)
    expect(s.draws).toEqual([])
    slow.answer(fx.mockupBoard())
    await settle()
    expect(s.draws.length).toBe(1)
    await wait(4999)
    expect(urls().length).toBe(1)
    await wait(1)
    expect(urls().length).toBe(2)
  })

  it('AC-1407.3: 5초 뒤 다시 읽어 그려도 고른 칸은 그대로다', async () => {
    const { app } = await started()
    const hold = [...app.querySelectorAll<HTMLButtonElement>('.tiles > button.tile')][1]
    hold.click()
    expect(textOf(app, 'h2.list-heading')).toBe('진료보류 · 접수한 순서')
    const next = fx.mockupBoard('13:42:20')
    next.lists.hold = next.lists.hold.slice(0, 1)
    next.counts.hold = 1
    replies.push(ok(next))
    await wait(5000)
    expect(urls().length).toBe(2)
    const tiles = [...app.querySelectorAll('.tiles > button.tile')]
    expect(tiles.map((t) => t.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false', 'false'])
    expect(textOf(app, 'h2.list-heading')).toBe('진료보류 · 접수한 순서')
    expect([...app.querySelectorAll('.rows > .row .name')].map((n) => n.textContent)).toEqual(['가상환자04'])
  })

  it('AC-1407.10: 기준 시각은 받은 답의 at이다(휴대폰 시계를 쓰지 않는다). 같은 at이 오면 그대로다', async () => {
    vi.setSystemTime(new Date('2026-11-05T09:00:00+09:00'))
    const { app } = await started(fx.mockupBoard('13:42:10'))
    expect(textOf(app, 'p.asof')).toBe('13:42:10 기준 · 5초마다 저절로 바뀌어요')
    replies.push(ok(fx.mockupBoard('13:42:10')))
    await wait(5000)
    expect(urls().length).toBe(2)
    expect(textOf(app, 'p.asof')).toBe('13:42:10 기준 · 5초마다 저절로 바뀌어요')
  })

  it('AC-1407.3: readNow()는 그 자리에서 보통 읽기 하나를 하고(도는 읽기가 있으면 그 뒤 한 번), 끝나면 every초(5초) 다시 예약한다', async () => {
    const { poll, draws } = await started()
    await wait(3000)
    replies.push(ok(fx.mockupBoard('13:42:14')))
    poll.readNow()
    await settle()
    expect(urls()).toEqual(['/api/board', '/api/board'])
    expect(draws.at(-1)).toEqual({ at: '13:42:14', first: false, reading: false })
    expect(poll.reading()).toBe(false)
    await wait(4999)
    expect(urls().length).toBe(2)

    const slow = held()
    replies.push(slow.reply)
    await wait(1)
    expect(urls().length).toBe(3)
    poll.readNow()
    poll.readNow()
    await settle()
    expect(urls().length).toBe(3)
    slow.answer(fx.mockupBoard('13:42:24'))
    await settle()
    expect(urls()).toEqual(['/api/board', '/api/board', '/api/board', '/api/board'])
    await settle()
    expect(urls().length).toBe(4)
  })
})

describe('poll.js 간격은 답의 every (AC-1403.9)', () => {
  it('AC-1407.3: 다음 저절로 읽기는 받은 답의 every초 뒤다: every 3이면 3초 뒤, 그 답이 every 7이면 그다음은 7초 뒤이고 머리 글의 N도 그 값이다', async () => {
    const { app } = await started({ ...fx.mockupBoard(), every: 3 })
    expect(textOf(app, 'p.asof')).toBe('13:42:10 기준 · 3초마다 저절로 바뀌어요')
    replies.push(ok({ ...fx.mockupBoard('13:42:13'), every: 7 }))
    await wait(2999)
    expect(urls().length).toBe(1)
    await wait(1)
    expect(urls().length).toBe(2)
    expect(textOf(app, 'p.asof')).toBe('13:42:13 기준 · 7초마다 저절로 바뀌어요')
    await wait(6999)
    expect(urls().length).toBe(2)
    await wait(1)
    expect(urls().length).toBe(3)
  })

  it('AC-1407.4: 끊김 화면의 N은 마지막으로 받은 every이고 그 간격으로 다시 읽으며, 돌아오면 새 답의 every를 쓴다', async () => {
    const { app, poll } = await started({ ...fx.mockupBoard(), every: 7 })
    replies.push(FAILS[0][1], FAILS[0][1], ok(fx.mockupBoard('13:43:00')))
    await wait(7000)
    expect(urls().length).toBe(2)
    expectNoPatient(poll)
    expect(textOf(app, '.off-status')).toBe('7초마다 다시 확인하는 중 · 마지막 연결 13:42')
    await wait(6999)
    expect(urls().length).toBe(2)
    await wait(1)
    expect(urls().length).toBe(3)
    expect(textOf(app, '.off-status')).toBe('7초마다 다시 확인하는 중 · 마지막 연결 13:42')
    await wait(7000)
    expect(urls().length).toBe(4)
    expect(textOf(app, 'p.asof')).toBe('13:43:00 기준 · 5초마다 저절로 바뀌어요')
    await wait(4999)
    expect(urls().length).toBe(4)
    await wait(1)
    expect(urls().length).toBe(5)
  })

  it('AC-1407.4: 한 번도 답을 받지 못했으면 poll.js의 기본값 5초로 "5초마다 다시 확인하는 중"을 보이고 5초 뒤 다시 읽는다', async () => {
    expect(pollJs.DEFAULT_EVERY).toBe(5)
    const s = setup()
    polls.push(s.poll)
    replies.push(FAILS[0][1], FAILS[2][1])
    s.poll.start()
    await settle()
    expect(textOf(s.app, '.off-status')).toBe('5초마다 다시 확인하는 중')
    await wait(4999)
    expect(urls().length).toBe(1)
    await wait(1)
    expect(urls().length).toBe(2)
    expect(textOf(s.app, '.off-status')).toBe('5초마다 다시 확인하는 중')
    await wait(5000)
    expect(urls().length).toBe(3)
    expect(textOf(s.app, 'p.asof')).toBe('13:42:10 기준 · 5초마다 저절로 바뀌어요')
  })

  it('AC-1403.9: 화면 파일(reception/www의 .js·.html)의 간격 숫자는 poll.js의 처음 연결 전 기본값 하나(DEFAULT_EVERY = 5)뿐이다: 10초·10000 같은 다른 간격 숫자, 숫자로 쓴 "N초마다" 글, setInterval이 없다', () => {
    const files = readdirSync(WWW).filter((name) => /\.(?:js|html)$/.test(name))
    expect(files).toEqual(expect.arrayContaining(['poll.js', 'board.js', 'offline.js', 'api.js', 'app.js', 'index.html']))
    for (const name of files) {
      const text = readFileSync(path.join(WWW, name), 'utf8')
      expect(text, name).not.toMatch(/10\s*초|10_?000/)
      expect(text, name).not.toMatch(/\d\s*초\s*마다/)
      expect(text, name).not.toMatch(/setInterval|INTERVAL/)
      if (name !== 'poll.js') expect(text, name).not.toMatch(/DEFAULT_EVERY/)
    }
    const poll = readFileSync(path.join(WWW, 'poll.js'), 'utf8')
    expect(poll.match(/DEFAULT_EVERY\s*=\s*\d+/g)).toEqual(['DEFAULT_EVERY = 5'])
  })
})

describe('poll.js 읽기 실패', () => {
  it.each(FAILS)(
    'AC-1407.4: 첫 실패(%s)에 그 자리에서 DOM·상태의 환자 값을 모두 지우고 연결 끊김 화면("마지막 연결 HH:MM")을 보인다',
    async (_name, fail, after) => {
      const { app, poll, wipe } = await started()
      for (const t of queueTexts(fx.mockupBoard())) expect(app.textContent).toContain(t)
      const connected = poll.signal()
      replies.push(fail)
      await wait(5000)
      expect(urls().length).toBe(2)
      if (after > 0) {
        await wait(after - 1)
        expect(app.textContent).toContain('가상환자01')
        await wait(1)
      } else {
        await settle()
      }
      expectNoPatient(poll)
      expect(wipe).toHaveBeenCalledTimes(1)
      expect(connected.aborted).toBe(true)
      expect(textOf(app, 'h2.off-heading')).toBe('지금 볼 수 없어요')
      expect(textOf(app, '.off-status')).toBe('5초마다 다시 확인하는 중 · 마지막 연결 13:42')
      expect(app.querySelector('button')).toBeNull()
      expect(poll.lastAt()).toBe('13:42')
    },
  )

  it('AC-1407.4: 처음 읽기부터 실패하면 "마지막 연결" 없이 끊김 화면이다', async () => {
    const s = setup()
    polls.push(s.poll)
    replies.push(FAILS[0][1])
    s.poll.start()
    await settle()
    expect(textOf(s.app, 'h2.off-heading')).toBe('지금 볼 수 없어요')
    expect(textOf(s.app, '.off-status')).toBe('5초마다 다시 확인하는 중')
    expect(s.draws).toEqual([])
  })

  it('AC-1407.4: 끊긴 뒤에도 마지막으로 받은 every초(5초)마다 다시 읽고, 다시 성공하면 목록으로 돌아온다(그 읽기는 first)', async () => {
    const { app, poll, draws, wipe } = await started()
    replies.push(FAILS[2][1], FAILS[0][1], ok(fx.mockupBoard('13:43:00')))
    await wait(5000)
    expect(textOf(app, 'h2.off-heading')).toBe('지금 볼 수 없어요')
    await wait(4999)
    expect(urls().length).toBe(2)
    await wait(1)
    expect(urls().length).toBe(3)
    expect(textOf(app, '.off-status')).toBe('5초마다 다시 확인하는 중 · 마지막 연결 13:42')
    expectNoPatient(poll)
    await wait(5000)
    expect(urls().length).toBe(4)
    expect(app.querySelector('h2.off-heading')).toBeNull()
    expect(textOf(app, 'p.asof')).toBe('13:43:00 기준 · 5초마다 저절로 바뀌어요')
    expect(app.textContent).toContain('가상환자01')
    expect(draws.at(-1)).toEqual({ at: '13:43:00', first: true, reading: false })
    expect(poll.lastAt()).toBe('13:43')
    expect(wipe).toHaveBeenCalledTimes(2)
    expect(poll.signal().aborted).toBe(false)
  })
})

describe('poll.js [새로 고침] refreshNow()', () => {
  it('AC-1407.10: 그 자리에서 GET /api/board?fresh=1 하나를 읽고(두 번 불러도 하나) 읽는 동안 reading이다. 끝나면 받은 at으로 다시 그리고 다음 저절로 읽기는 그때부터 every초(5초) 뒤다', async () => {
    const { app, poll, draws, readings } = await started()
    await wait(3000)
    const fresh = held()
    replies.push(fresh.reply)
    poll.refreshNow()
    poll.refreshNow()
    await settle()
    expect(urls()).toEqual(['/api/board', '/api/board?fresh=1'])
    expect(poll.reading()).toBe(true)
    expect(readings).toEqual([true])
    expect(labelOf(refreshButton(app))).toBe('읽는 중…')
    expect(refreshButton(app)?.disabled).toBe(true)
    await wait(2000)
    poll.refreshNow()
    await settle()
    expect(urls().length).toBe(2)

    fresh.answer(fx.mockupBoard('13:42:31'))
    await settle()
    expect(poll.reading()).toBe(false)
    expect(draws.at(-1)).toEqual({ at: '13:42:31', first: false, reading: false })
    expect(textOf(app, 'p.asof')).toBe('13:42:31 기준 · 5초마다 저절로 바뀌어요')
    expect(labelOf(refreshButton(app))).toBe('새로 고침')
    expect(refreshButton(app)?.disabled).toBe(false)
    await wait(4999)
    expect(urls().length).toBe(2)
    await wait(1)
    expect(urls()).toEqual(['/api/board', '/api/board?fresh=1', '/api/board'])
  })

  it('AC-1407.10: 저절로 읽기가 도는 중에 누르면 요청을 늘리지 않고 그것이 끝난 뒤 바로 fresh 읽기를 한 번 한다', async () => {
    const { app, poll, draws } = await started()
    const auto = held()
    replies.push(auto.reply)
    await wait(5000)
    expect(urls()).toEqual(['/api/board', '/api/board'])
    poll.refreshNow()
    poll.refreshNow()
    poll.refreshNow()
    await settle()
    expect(urls().length).toBe(2)
    expect(poll.reading()).toBe(true)

    const fresh = held()
    replies.push(fresh.reply)
    auto.answer(fx.mockupBoard('13:42:20'))
    await settle()
    expect(draws.at(-1)).toEqual({ at: '13:42:20', first: false, reading: true })
    expect(urls()).toEqual(['/api/board', '/api/board', '/api/board?fresh=1'])
    expect(labelOf(refreshButton(app))).toBe('읽는 중…')
    expect(refreshButton(app)?.disabled).toBe(true)

    fresh.answer(fx.mockupBoard('13:42:23'))
    await settle()
    expect(draws.at(-1)).toEqual({ at: '13:42:23', first: false, reading: false })
    expect(labelOf(refreshButton(app))).toBe('새로 고침')
    await wait(4999)
    expect(urls().length).toBe(3)
    await wait(1)
    expect(urls().length).toBe(4)
    expect(urls()[3]).toBe('/api/board')
  })

  it('AC-1407.10: 진짜 [새로 고침] 단추를 여러 번 눌러도 ?fresh=1 요청 하나, "읽는 중…"(disabled) 뒤 "새로 고침"으로 돌아오고 기준 시각이 바뀐다', async () => {
    const { app } = await started()
    const fresh = held()
    replies.push(fresh.reply)
    refreshButton(app)?.click()
    refreshButton(app)?.click()
    await settle()
    refreshButton(app)?.click()
    await settle()
    expect(urls()).toEqual(['/api/board', '/api/board?fresh=1'])
    expect(labelOf(refreshButton(app))).toBe('읽는 중…')
    expect(refreshButton(app)?.disabled).toBe(true)
    fresh.answer(fx.mockupBoard('13:42:31'))
    await settle()
    expect(labelOf(refreshButton(app))).toBe('새로 고침')
    expect(refreshButton(app)?.disabled).toBe(false)
    expect(textOf(app, 'p.asof')).toBe('13:42:31 기준 · 5초마다 저절로 바뀌어요')
  })

  it('AC-1407.10: 새로 고침이 실패하면 AC-1407.4와 같다(지우기 + 끊김 화면, 단추 없음, 5초 뒤 다시 읽기)', async () => {
    const { app, poll, wipe } = await started()
    replies.push(FAILS[2][1])
    poll.refreshNow()
    await settle()
    expect(urls()).toEqual(['/api/board', '/api/board?fresh=1'])
    expectNoPatient(poll)
    expect(wipe).toHaveBeenCalledTimes(1)
    expect(poll.reading()).toBe(false)
    expect(textOf(app, 'h2.off-heading')).toBe('지금 볼 수 없어요')
    expect(app.querySelector('button')).toBeNull()
    await wait(5000)
    expect(urls()).toEqual(['/api/board', '/api/board?fresh=1', '/api/board'])
    expect(textOf(app, 'p.asof')).toBe('13:42:10 기준 · 5초마다 저절로 바뀌어요')
  })
})

describe('poll.js 숨김 pause()·다시 보임 resume()', () => {
  it('AC-1407.11: pause()는 그 자리에서 DOM·상태의 환자 자료를 모두 지우고("불러오는 중이에요") 고리를 멈춘다(예약 없음)', async () => {
    const { app, poll, wipe } = await started()
    const connected = poll.signal()
    poll.pause()
    expectNoPatient(poll)
    expect(wipe).toHaveBeenCalledTimes(1)
    expect(connected.aborted).toBe(true)
    expect(textOf(app, 'p.off-lead')).toBe('불러오는 중이에요')
    expect(app.querySelector('h2.off-heading')).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
    await wait(60000)
    expect(urls()).toEqual(['/api/board'])
  })

  it('AC-1407.11: 읽는 중에 pause()하면 나가 있던 요청을 끊고, 늦은 답이 와도 그리지 않으며 다음 읽기도 예약하지 않는다', async () => {
    const { app, poll, draws } = await started()
    const late = held()
    replies.push(late.reply)
    await wait(5000)
    expect(urls().length).toBe(2)
    poll.pause()
    expect(calls[1].init.signal?.aborted).toBe(true)
    late.answer(fx.mockupBoard('13:42:20'))
    await settle()
    expectNoPatient(poll)
    expect(draws.length).toBe(1)
    expect(textOf(app, 'p.off-lead')).toBe('불러오는 중이에요')
    expect(vi.getTimerCount()).toBe(0)
    await wait(60000)
    expect(urls().length).toBe(2)
  })

  it('AC-1407.11: 기다리던 fresh 읽기도 없앤다(숨긴 뒤 요청 없음, 읽는 중 아님)', async () => {
    const { poll, draws } = await started()
    const auto = held()
    replies.push(auto.reply)
    await wait(5000)
    poll.refreshNow()
    expect(poll.reading()).toBe(true)
    poll.pause()
    expect(poll.reading()).toBe(false)
    auto.answer(fx.mockupBoard('13:42:20'))
    await settle()
    expect(urls()).toEqual(['/api/board', '/api/board'])
    expect(draws.length).toBe(1)
    expectNoPatient(poll)
    await wait(60000)
    expect(urls().length).toBe(2)
  })

  it('AC-1407.11: 실패 답이 숨긴 뒤 와도 끊김 화면을 그리지 않는다(불러오는 중 그대로, 예약 없음)', async () => {
    const { app, poll, wipe } = await started()
    let fail: (e: Error) => void = () => {}
    replies.push(() => new Promise<Response>((_, reject) => (fail = reject)))
    await wait(5000)
    poll.pause()
    fail(new TypeError('Failed to fetch'))
    await settle()
    expect(textOf(app, 'p.off-lead')).toBe('불러오는 중이에요')
    expect(app.querySelector('h2.off-heading')).toBeNull()
    expect(wipe).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('AC-1407.11: resume()은 "불러오는 중이에요"에서 바로 한 번 읽어 목록을 그린다(first). 두 번 불러도(visible·pageshow) 요청은 하나다', async () => {
    const { app, poll, draws } = await started()
    poll.pause()
    const back = held()
    replies.push(back.reply)
    poll.resume()
    poll.resume()
    expect(textOf(app, 'p.off-lead')).toBe('불러오는 중이에요')
    await settle()
    expect(urls()).toEqual(['/api/board', '/api/board'])
    expect(poll.signal().aborted).toBe(false)
    back.answer(fx.mockupBoard('13:50:00'))
    await settle()
    expect(urls().length).toBe(2)
    expect(draws.at(-1)).toEqual({ at: '13:50:00', first: true, reading: false })
    expect(textOf(app, 'p.asof')).toBe('13:50:00 기준 · 5초마다 저절로 바뀌어요')
    await wait(5000)
    expect(urls().length).toBe(3)
    expect(draws.at(-1)?.first).toBe(false)
  })

  it('AC-1407.11: 다시 보인 뒤 첫 읽기가 실패하면 연결 끊김 화면이다', async () => {
    const { app, poll } = await started()
    poll.pause()
    replies.push(FAILS[2][1])
    poll.resume()
    await settle()
    expect(textOf(app, 'h2.off-heading')).toBe('지금 볼 수 없어요')
    expect(textOf(app, '.off-status')).toBe('5초마다 다시 확인하는 중 · 마지막 연결 13:42')
    expectNoPatient(poll)
  })

  it('AC-1407.11: 멈춘 동안 refreshNow()·readNow()는 아무것도 하지 않고, 멈추지 않았을 때 resume()도 아무것도 하지 않는다', async () => {
    const { poll } = await started()
    poll.resume()
    await settle()
    expect(urls().length).toBe(1)
    poll.pause()
    poll.refreshNow()
    poll.readNow()
    await settle()
    expect(poll.reading()).toBe(false)
    expect(urls().length).toBe(1)
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('poll.js 같은 PC에만 묻는다', () => {
  it('AC-1413.2: 고리·새로 고침·다시 보임·끊김 동안의 요청은 모두 같은 주소의 /api/board(?fresh=1)다', async () => {
    const { poll } = await started()
    await wait(5000)
    poll.refreshNow()
    await settle()
    replies.push(FAILS[0][1])
    await wait(5000)
    await wait(5000)
    poll.pause()
    poll.resume()
    await settle()
    expect(urls().length).toBe(6)
    for (const url of urls()) expect(url).toMatch(/^\/api\/board(\?fresh=1)?$/)
  })
})
