// @vitest-environment jsdom
// 태블릿 두 칸 layout.js (TASK-22, REQ-1409, design.md 10절). 승인 태블릿 시안 Tablet.dc.html(1194×834): 왼쪽 목록, 오른쪽 고른 환자 상세.
// 폰/태블릿 판정은 주입한 가짜 matchMedia(바뀜 알림 포함)로 본다. 고른 칸·고른 환자는 메모리에만 있다.
// 그리기는 board.js·detail.js·offline.js를 그대로 쓴다(app.js가 잇는 차례대로). 글 대신 화면 틀(class)로 본다. 자료는 가짜다(fixtures.ts)
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import * as fx from './fixtures'
import type { FakeBoard, FakeRow } from './fixtures'

/** 고른 결과: 고른 열쇠, 그 판의 그 줄, 앞과 다른 환자를 골랐는가(그러면 app.js가 상세를 새로 읽는다) */
interface Pick {
  picked: string | null
  row: FakeRow | null
  changed: boolean
}

interface LayoutView {
  lane: string
  tablet: boolean
  picked: string | null
}

interface Layout {
  tablet: () => boolean
  lane: () => string
  picked: () => string | null
  view: () => LayoutView
  sync: (board: FakeBoard) => Pick
  select: (k: string | null, board?: FakeBoard) => Pick
  pickLane: (lane: string, board?: FakeBoard) => Pick
  wipe: () => void
  stop: () => void
}

type MediaListener = (event: { matches: boolean; media: string }) => void

interface FakeMediaList {
  matches: boolean
  media: string
  addEventListener?: (type: string, fn: MediaListener) => void
  removeEventListener?: (type: string, fn: MediaListener) => void
  addListener?: (fn: MediaListener) => void
  removeListener?: (fn: MediaListener) => void
}

interface LayoutOptions {
  matchMedia?: (query: string) => FakeMediaList
  onChange?: (info: { tablet: boolean; picked: string | null }) => void
}

interface LayoutJs {
  TABLET_QUERY: string
  createLayout: (options?: LayoutOptions) => Layout
  findRow: (board: FakeBoard | null | undefined, k: string | null) => FakeRow | null
}

interface BoardJs {
  renderBoard: (host: HTMLElement, board: FakeBoard, view?: object) => HTMLElement
  fillPane: (host: HTMLElement, nodes: Node | Node[] | null) => void
}

interface DetailJs {
  detailPane: (row: FakeRow, history: FakeHistory, options?: { today?: Date }) => Node[]
  updateDetail: (host: ParentNode, row: FakeRow, options?: { today?: Date }) => boolean
}

interface OfflineJs {
  renderOffline: (host: HTMLElement, options?: { lastAt?: string | null }) => HTMLElement
}

interface FakeOrder {
  code: string
  name: string
  qty: string
  tms: string
  day: string
}

/** 상세 첫 쪽의 종이 기록부 자료 (reception-paper design.md 2절) */
interface FakePaper {
  res: string
  addr: string
  tel: string
  cel: string
  special: string
  room: string
  ins: string
  sym: string
  dx: { code: string; name: string; main: boolean }[]
  rx: FakeOrder[]
  out: FakeOrder[]
}

interface FakeHistory {
  visits: { date: string; ago: string; sym: string; rx: { name: string; code: string }[] }[]
  next: number | null
  more: number
  first: string
  total: number
  todaySym: string
  paper: FakePaper
}

// 화면 파일은 빌드 없는 JS라 형 선언이 없다(design.md 결정 '화면은 빌드 없는 JS'). 경로를 값으로 두어 형 검사가 묻지 않게 한다
const LAYOUT_JS = '../www/layout.js'
const BOARD_JS = '../www/board.js'
const DETAIL_JS = '../www/detail.js'
const OFFLINE_JS = '../www/offline.js'

/** 두 칸 모양 파일(jsdom의 URL은 node fs가 받지 않아 경로 글로 둔다) */
const STYLE_CSS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'www', 'style.css')

/** AC-1409.1의 질의 글 */
const QUERY = '(min-width: 1000px) and (orientation: landscape)'

/** 오늘(시험 기준): 2026년 11월 5일 */
const TODAY = new Date(2026, 10, 5, 13, 42, 10)

let layoutJs: LayoutJs
let boardJs: BoardJs
let detailJs: DetailJs
let offlineJs: OfflineJs

beforeAll(async () => {
  // 아직 없으면(RED) 아무것도 고르지 않는 폰 대역으로 시험마다 실패를 보인다
  const none: Pick = { picked: null, row: null, changed: false }
  const missing: LayoutJs = {
    TABLET_QUERY: '',
    createLayout: () => ({
      tablet: () => false,
      lane: () => '',
      picked: () => null,
      view: () => ({ lane: '', tablet: false, picked: null }),
      sync: () => none,
      select: () => none,
      pickLane: () => none,
      wipe: () => {},
      stop: () => {},
    }),
    findRow: () => null,
  }
  layoutJs = ((await import(/* @vite-ignore */ LAYOUT_JS).catch(() => missing)) ?? missing) as LayoutJs
  boardJs = (await import(/* @vite-ignore */ BOARD_JS)) as BoardJs
  detailJs = (await import(/* @vite-ignore */ DETAIL_JS)) as DetailJs
  offlineJs = (await import(/* @vite-ignore */ OFFLINE_JS)) as OfflineJs
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.replaceChildren()
  window.location.hash = ''
})

/**
 * 가짜 matchMedia. turn(matches)은 기기를 돌린 것처럼 질의 결과를 바꾸고 바뀜 알림('change')을 보낸다.
 * legacy면 옛 사파리처럼 addListener·removeListener만 있다
 */
function fakeMedia(matches: boolean, { legacy = false } = {}) {
  const listeners = new Set<MediaListener>()
  const queries: string[] = []
  const list: FakeMediaList = { matches, media: '' }
  if (legacy) {
    list.addListener = (fn) => listeners.add(fn)
    list.removeListener = (fn) => listeners.delete(fn)
  } else {
    list.addEventListener = (type, fn) => {
      if (type === 'change') listeners.add(fn)
    }
    list.removeEventListener = (type, fn) => {
      if (type === 'change') listeners.delete(fn)
    }
  }
  return {
    matchMedia: (query: string) => {
      queries.push(query)
      list.media = query
      return list
    },
    queries,
    listeners,
    turn(next: boolean) {
      list.matches = next
      for (const fn of [...listeners]) fn({ matches: next, media: list.media })
    },
  }
}

function make(options?: LayoutOptions): Layout {
  return layoutJs.createLayout(options)
}

/** 태블릿 모양(가로 1194px)의 layout과 그 가짜 matchMedia, 바뀜 기록 */
function tabletLayout() {
  const media = fakeMedia(true)
  const changes: { tablet: boolean; picked: string | null }[] = []
  const layout = make({ matchMedia: media.matchMedia, onChange: (info) => changes.push(info) })
  return { layout, media, changes }
}

/** 폰 모양(세로)의 layout */
function phoneLayout() {
  const media = fakeMedia(false)
  const changes: { tablet: boolean; picked: string | null }[] = []
  const layout = make({ matchMedia: media.matchMedia, onChange: (info) => changes.push(info) })
  return { layout, media, changes }
}

/** index.html의 #app 자리 */
function appHost(): HTMLElement {
  const app = document.createElement('div')
  app.id = 'app'
  document.body.appendChild(app)
  return app
}

/** 상세 답 첫 쪽(가짜): 지난 진료 2번, 3번 더 */
function history(over: Partial<FakeHistory> = {}): FakeHistory {
  return {
    visits: [
      { date: '10월 27일', ago: '9일 전', sym: '왼쪽 무릎 통증, 조금 나아짐', rx: [{ name: '체외충격파', code: 'ESWT7' }] },
      { date: '10월 20일', ago: '16일 전', sym: '왼쪽 무릎 통증', rx: [{ name: '표층열치료', code: 'PT01' }] },
    ],
    next: 2,
    more: 3,
    first: '2025년 5월 14일',
    total: 6,
    todaySym: '',
    paper: {
      res: '681120-*******',
      addr: '가상시 가상구 보기길 7',
      tel: '',
      cel: '010-0000-5678',
      special: '가상 특이사항',
      room: '1진료실',
      ins: '국민건강보험',
      sym: '',
      dx: [],
      rx: [],
      out: [],
    },
    ...over,
  }
}

/** 표시된 고른 줄들의 열쇠 */
function pickedRows(host: ParentNode): string[] {
  return [...host.querySelectorAll('.page.board .rows > .row.is-picked')].map((row) => row.getAttribute('data-k') ?? '')
}

/** 오른쪽 칸에 그려진 환자의 열쇠 */
function paneKey(host: ParentNode): string | null {
  return host.querySelector('.page.board > aside.pane .patient')?.getAttribute('data-k') ?? null
}

function first(rows: FakeRow[] | undefined): FakeRow {
  const row = rows?.[0]
  if (!row) throw new Error('가짜 판에 줄이 없다')
  return row
}

describe('REQ-1409 폰/태블릿 판정', () => {
  it('AC-1409.1: 판정 질의는 "(min-width: 1000px) and (orientation: landscape)" 하나이고 style.css 두 칸 질의와 같은 글이다', () => {
    expect(layoutJs.TABLET_QUERY).toBe(QUERY)
    const media = fakeMedia(true)
    make({ matchMedia: media.matchMedia })
    expect(media.queries).toEqual([QUERY])
    const css = readFileSync(STYLE_CSS, 'utf8')
    expect(css).toContain(`@media ${QUERY}`)
  })

  it('AC-1409.1: 질의가 맞으면 태블릿 모양, 안 맞으면(더 좁거나 세로) 폰 모양이다', () => {
    expect(make({ matchMedia: fakeMedia(true).matchMedia }).tablet()).toBe(true)
    expect(make({ matchMedia: fakeMedia(true).matchMedia }).view().tablet).toBe(true)
    expect(make({ matchMedia: fakeMedia(false).matchMedia }).tablet()).toBe(false)
    expect(make({ matchMedia: fakeMedia(false).matchMedia }).view().tablet).toBe(false)
  })

  it('AC-1409.1: matchMedia를 주지 않으면 브라우저 것(window.matchMedia)을 쓰고, 없거나 던지면 폰 모양이다', () => {
    const media = fakeMedia(true)
    vi.stubGlobal('matchMedia', media.matchMedia)
    expect(make().tablet()).toBe(true)
    expect(media.queries).toEqual([QUERY])
    vi.stubGlobal('matchMedia', undefined)
    expect(make().tablet()).toBe(false)
    const throwing = () => {
      throw new Error('질의를 못 읽음')
    }
    expect(make({ matchMedia: throwing }).tablet()).toBe(false)
  })

  it('AC-1409.1 · AC-1502.1: 태블릿 모양이면 왼쪽은 목록(머리·칸·줄), 오른쪽은 고른 환자의 상세(종이 진료기록부 카드·지난번 증상, [더 보기] 없음)다', () => {
    const { layout } = tabletLayout()
    const board = fx.mockupBoard()
    const host = appHost()
    const pick = layout.sync(board)
    boardJs.renderBoard(host, board, layout.view())
    boardJs.fillPane(host, detailJs.detailPane(pick.row as FakeRow, history(), { today: TODAY }))

    const page = host.querySelector('.page.board')
    expect(page).not.toBeNull()
    expect(page?.querySelector(':scope > header.top')).not.toBeNull()
    expect(page?.querySelector(':scope > .picker .tiles')).not.toBeNull()
    expect(page?.querySelectorAll(':scope > main.list .rows > .row')).toHaveLength(board.lists.queue.length)
    expect(page?.querySelectorAll(':scope > main.list .rows button.row-main')).toHaveLength(board.lists.queue.length)
    const pane = page?.querySelector(':scope > aside.pane')
    expect(pane).not.toBeNull()
    expect(paneKey(host)).toBe(first(board.lists.queue).k)
    expect(pane?.querySelector('section.today')).toBeNull()
    expect(pane?.querySelectorAll('article.paper')).toHaveLength(1)
    expect(pane?.querySelector('article.paper dl.kv dd')?.textContent).toBe(first(board.lists.queue).chart)
    expect(pane?.querySelectorAll('section.visit')).toHaveLength(1)
    expect(pane?.querySelector('section.visit.is-last p.sym')).not.toBeNull()
    expect(pane?.querySelector('button.more')).toBeNull()
  })

  it('AC-1409.1: 폰 모양이면 한 줄 흐름: 오른쪽 칸이 없고 줄은 상세 링크이며 저절로 고르지 않는다', () => {
    const { layout } = phoneLayout()
    const board = fx.mockupBoard()
    const host = appHost()
    expect(layout.sync(board)).toEqual({ picked: null, row: null, changed: false })
    expect(layout.view()).toEqual({ lane: 'queue', tablet: false, picked: null })
    boardJs.renderBoard(host, board, layout.view())
    expect(host.querySelector('.page.board > aside.pane')).toBeNull()
    expect(host.querySelectorAll('.page.board .rows a.row-main')).toHaveLength(board.lists.queue.length)
    expect(host.querySelector('.page.board .rows button.row-main')).toBeNull()
  })
})

describe('REQ-1409 태블릿에서 고르기', () => {
  it('AC-1409.2: 처음 열면 고른 칸(진료 순서)의 첫 줄을 고른 상태다', () => {
    const { layout } = tabletLayout()
    const board = fx.mockupBoard()
    const host = appHost()
    const top = first(board.lists.queue)
    expect(layout.lane()).toBe('queue')
    expect(layout.picked()).toBeNull()
    expect(layout.sync(board)).toEqual({ picked: top.k, row: top, changed: true })
    expect(layout.picked()).toBe(top.k)
    expect(layout.view()).toEqual({ lane: 'queue', tablet: true, picked: top.k })
    boardJs.renderBoard(host, board, layout.view())
    expect(pickedRows(host)).toEqual([top.k])
    expect(host.querySelector('.rows > .row.is-picked > button.row-main')?.getAttribute('aria-pressed')).toBe('true')
  })

  it('AC-1409.2: 줄을 누르면 화면을 옮기지 않고 오른쪽에 그 환자 상세를 그리며 고른 줄이 표시된다', () => {
    const { layout } = tabletLayout()
    const board = fx.mockupBoard()
    const host = appHost()
    const loaded: string[] = []
    const showPane = (pick: Pick) => {
      if (!pick.changed) return
      if (pick.row) loaded.push(pick.row.k)
      boardJs.fillPane(host, pick.row ? detailJs.detailPane(pick.row, history(), { today: TODAY }) : null)
    }
    showPane(layout.sync(board))
    boardJs.renderBoard(host, board, { ...layout.view(), onSelect: (k: string) => showPane(layout.select(k, board)) })
    showPane(layout.sync(board))
    const before = window.location.href
    const target = board.lists.queue[2] as FakeRow

    ;(host.querySelector(`.rows > .row[data-k="${target.k}"] > button.row-main`) as HTMLButtonElement).click()

    expect(layout.picked()).toBe(target.k)
    expect(layout.view().picked).toBe(target.k)
    expect(pickedRows(host)).toEqual([target.k])
    expect(paneKey(host)).toBe(target.k)
    expect(loaded).toEqual([first(board.lists.queue).k, target.k])
    expect(window.location.href).toBe(before)
    expect(host.querySelector('.page.board')).not.toBeNull()
    // 같은 줄을 다시 눌러도 다른 환자가 아니다(상세를 다시 읽지 않는다)
    expect(layout.select(target.k, board)).toEqual({ picked: target.k, row: target, changed: false })
  })

  it('AC-1409.2: 고른 칸에 줄이 없으면 아무도 고르지 않고 오른쪽은 비어 있다(새 글 없음)', () => {
    const { layout } = tabletLayout()
    const payRow = fx.fakeRow({ k: fx.fakeKey(6), lane: 'pay', chart: '908833', name: '가상환자06', rxLabel: '오늘', rx: '체외충격파(ESWT7)' })
    const board = fx.boardOf({ pay: [payRow] })
    const host = appHost()
    expect(layout.sync(board)).toEqual({ picked: null, row: null, changed: false })
    boardJs.renderBoard(host, board, layout.view())
    boardJs.fillPane(host, null)
    const pane = host.querySelector('.page.board > aside.pane')
    expect(pane).not.toBeNull()
    expect([...(pane?.children ?? [])].map((child) => child.className)).toEqual(['pane-foot'])
    expect(pane?.textContent).not.toContain('가상환자')
  })

  it('AC-1409.2: 칸 단추를 누르면 그 칸을 고르고, 고른 환자가 없으면 그 칸의 첫 줄을, 있으면 그 환자를 그대로 둔다(승인 태블릿 시안)', () => {
    const { layout } = tabletLayout()
    const board = fx.boardOf({
      pay: [fx.fakeRow({ k: fx.fakeKey(6), lane: 'pay', chart: '908833', name: '가상환자06' })],
      done: [fx.fakeRow({ k: fx.fakeKey(8), lane: 'done', chart: '907761', name: '가상환자08' })],
    })
    const host = appHost()
    const picks: Pick[] = []
    layout.sync(board)
    boardJs.renderBoard(host, board, { ...layout.view(), onPick: (lane: string) => picks.push(layout.pickLane(lane, board)) })

    // 칸 넷 단추 차례: 진료대기·진료보류·수납대기·오늘 끝남
    ;(host.querySelectorAll('.picker .tiles > button.tile')[2] as HTMLButtonElement).click()
    expect(layout.lane()).toBe('pay')
    expect(picks.at(-1)).toEqual({ picked: fx.fakeKey(6), row: first(board.lists.pay), changed: true })

    ;(host.querySelectorAll('.picker .tiles > button.tile')[3] as HTMLButtonElement).click()
    expect(layout.lane()).toBe('done')
    expect(picks.at(-1)).toEqual({ picked: fx.fakeKey(6), row: first(board.lists.pay), changed: false })
    expect(layout.view()).toEqual({ lane: 'done', tablet: true, picked: fx.fakeKey(6) })
  })

  it('AC-1409.2: 모르는 칸 이름은 진료 순서로 본다', () => {
    const { layout } = tabletLayout()
    layout.pickLane('pay')
    layout.pickLane('nope')
    expect(layout.lane()).toBe('queue')
  })
})

describe('REQ-1409 다시 읽기·끊김', () => {
  it('AC-1409.3 · AC-1502.3: 10초마다 다시 읽어도 고른 환자는 그대로이고(칸을 옮겨도) 머리와 종이 카드의 칸 규칙만 새 줄을 따른다(지난 진료는 그대로)', () => {
    const { layout } = tabletLayout()
    const before = fx.mockupBoard()
    const host = appHost()
    layout.sync(before)
    const target = before.lists.queue[1] as FakeRow
    const pick = layout.select(target.k, before)
    expect(pick).toEqual({ picked: target.k, row: target, changed: true })
    boardJs.renderBoard(host, before, layout.view())
    boardJs.fillPane(host, detailJs.detailPane(target, history(), { today: TODAY }))
    const visitsBefore = [...host.querySelectorAll('.page.board > aside.pane section.visit')]
    const paper = host.querySelector('.page.board > aside.pane article.paper')
    expect(visitsBefore).toHaveLength(1)
    // 진료보류이고 아직 아무것도 적히지 않았다: <증상 · 상병 · 처방> 한 줄
    expect([...(paper?.querySelectorAll('.paper-body .sec-h') ?? [])].map((n) => n.textContent)).toEqual(['증상 · 상병 · 처방'])

    // 다음 읽기: 그 환자가 진료를 마치고 수납대기로 옮겨 오늘 처방이 생겼다
    const moved: FakeRow = { ...target, lane: 'pay', waited: '수납 1분째', rxLabel: '오늘', rx: '체외충격파(ESWT7) · 주사(INJ1)', xray: null }
    const after = fx.boardOf({ wait: before.lists.wait, hold: before.lists.hold.filter((row) => row.k !== target.k), pay: [moved, ...before.lists.pay], done: before.lists.done }, '13:42:20')
    const again = layout.sync(after)
    const fresh = after.lists.pay[0] as FakeRow
    expect(again).toEqual({ picked: target.k, row: fresh, changed: false })
    expect(again.row).toBe(fresh)
    // "그날 자료" = 판의 모든 목록(고른 칸 밖이어도 찾는다)
    expect(layoutJs.findRow(after, target.k)).toBe(fresh)
    expect(layoutJs.findRow(after, 'ffffffffffffffff')).toBeNull()
    expect(layoutJs.findRow(null, target.k)).toBeNull()

    boardJs.renderBoard(host, after, layout.view())
    expect(detailJs.updateDetail(host, again.row as FakeRow, { today: TODAY })).toBe(true)
    expect(host.querySelector('.page.board > aside.pane .status-line > .status')?.textContent).toBe('수납대기')
    expect(host.querySelector('.page.board > aside.pane article.paper')).toBe(paper)
    expect([...(paper?.querySelectorAll('.paper-body .sec-h') ?? [])].map((n) => n.textContent)).toEqual(['증상', '상병', '처방', '원외처방'])
    const visitsAfter = [...host.querySelectorAll('.page.board > aside.pane section.visit')]
    expect(visitsAfter).toHaveLength(visitsBefore.length)
    expect(visitsAfter.every((visit, i) => visit === visitsBefore[i])).toBe(true)
    expect(paneKey(host)).toBe(target.k)
  })

  it('AC-1409.3: 고른 환자가 그날 자료에서 사라지면 고른 칸의 첫 줄을 고른다', () => {
    const { layout } = tabletLayout()
    const before = fx.mockupBoard()
    layout.sync(before)
    const gone = before.lists.queue[4] as FakeRow
    layout.select(gone.k, before)
    const after = fx.boardOf({ wait: before.lists.wait.filter((row) => row.k !== gone.k), hold: before.lists.hold, pay: before.lists.pay, done: before.lists.done }, '13:42:20')
    expect(layoutJs.findRow(after, gone.k)).toBeNull()
    const top = first(after.lists.queue)
    expect(layout.sync(after)).toEqual({ picked: top.k, row: top, changed: true })
    expect(layout.picked()).toBe(top.k)
  })

  it('AC-1409.3: 사라지고 고른 칸에 줄도 없으면 아무도 고르지 않는다(오른쪽은 비어 있다)', () => {
    const { layout } = tabletLayout()
    const before = fx.mockupBoard()
    layout.sync(before)
    const payRow = first(before.lists.pay)
    layout.select(payRow.k, before)
    layout.pickLane('pay', before)
    expect(layout.picked()).toBe(payRow.k)
    const after = fx.boardOf({ wait: before.lists.wait, hold: before.lists.hold, done: before.lists.done }, '13:42:20')
    expect(layout.sync(after)).toEqual({ picked: null, row: null, changed: true })
    expect(layout.view()).toEqual({ lane: 'pay', tablet: true, picked: null })
  })

  it('AC-1409.4: 연결이 끊기면 양쪽(목록·오른쪽 상세)을 모두 지우고 끊김 화면이며 고른 환자도 잊는다(고른 칸은 그대로)', () => {
    const { layout } = tabletLayout()
    const board = fx.mockupBoard()
    const host = appHost()
    const pick = layout.sync(board)
    layout.pickLane('pay', board)
    boardJs.renderBoard(host, board, layout.view())
    boardJs.fillPane(host, detailJs.detailPane(pick.row as FakeRow, history(), { today: TODAY }))
    expect(host.textContent).toContain('가상환자')

    // poll.js: 첫 실패에 그 자리에서 끊김 화면을 그리고 wipe()를 부른다
    offlineJs.renderOffline(host, { lastAt: '13:42' })
    layout.wipe()

    expect(host.querySelector('.page.board')).toBeNull()
    expect(host.querySelector('aside.pane')).toBeNull()
    expect(host.querySelector('.page.off-page')).not.toBeNull()
    expect(host.textContent).not.toMatch(/가상환자|9\d{5}/)
    expect(layout.picked()).toBeNull()
    expect(layout.view()).toEqual({ lane: 'pay', tablet: true, picked: null })

    // 돌아오면 고른 칸의 첫 줄을 다시 고른다(앞 환자가 아니다)
    const back = layout.sync(board)
    expect(back).toEqual({ picked: first(board.lists.pay).k, row: first(board.lists.pay), changed: true })
  })
})

describe('REQ-1409 기기 돌리기', () => {
  it('AC-1409.5: 태블릿 → 폰으로 돌리면 고른 환자를 잃지 않고(폰은 그 환자 상세 화면) 바뀜을 한 번 알린다', () => {
    const { layout, media, changes } = tabletLayout()
    const board = fx.mockupBoard()
    layout.sync(board)
    const target = board.lists.queue[3] as FakeRow
    layout.select(target.k, board)

    media.turn(false)

    expect(changes).toEqual([{ tablet: false, picked: target.k }])
    expect(layout.tablet()).toBe(false)
    expect(layout.picked()).toBe(target.k)
    expect(layout.view()).toEqual({ lane: 'queue', tablet: false, picked: target.k })
    // 폰 모양에서 다시 읽어도 그대로다
    expect(layout.sync(board)).toEqual({ picked: target.k, row: target, changed: false })
  })

  it('AC-1409.5: 폰 상세(#/v/{열쇠})에서 태블릿으로 돌리면 그 환자를 오른쪽에 둔다', () => {
    const { layout, media, changes } = phoneLayout()
    const board = fx.mockupBoard()
    const host = appHost()
    layout.sync(board)
    const target = board.lists.queue[2] as FakeRow
    // app.js가 폰 상세 길을 열 때 고른다(판 없이도)
    expect(layout.select(target.k)).toEqual({ picked: target.k, row: null, changed: true })

    media.turn(true)

    expect(changes).toEqual([{ tablet: true, picked: target.k }])
    expect(layout.tablet()).toBe(true)
    expect(layout.sync(board)).toEqual({ picked: target.k, row: target, changed: false })
    boardJs.renderBoard(host, board, layout.view())
    expect(pickedRows(host)).toEqual([target.k])
    expect(host.querySelector('.page.board > aside.pane')).not.toBeNull()
  })

  it('AC-1409.5: 폰 목록(아무도 안 고름)에서 태블릿으로 돌리면 고른 칸의 첫 줄을 고른다(오른쪽이 늘 차 있다)', () => {
    const { layout, media, changes } = phoneLayout()
    const board = fx.mockupBoard()
    layout.sync(board)
    layout.select(first(board.lists.queue).k)
    layout.select(null)
    expect(layout.picked()).toBeNull()

    media.turn(true)

    expect(changes).toEqual([{ tablet: true, picked: null }])
    const top = first(board.lists.queue)
    expect(layout.sync(board)).toEqual({ picked: top.k, row: top, changed: true })
  })

  it('AC-1409.5: 같은 모양 안에서 폭만 바뀌면 알리지 않고, stop() 뒤에는 듣지 않는다', () => {
    const { layout, media, changes } = tabletLayout()
    media.turn(true)
    expect(changes).toEqual([])
    layout.stop()
    expect(media.listeners.size).toBe(0)
    media.turn(false)
    expect(changes).toEqual([])
    expect(layout.tablet()).toBe(true)
  })

  it('AC-1409.5: 옛 사파리처럼 addListener만 있는 질의 목록도 돌림을 듣는다', () => {
    const media = fakeMedia(true, { legacy: true })
    const changes: { tablet: boolean; picked: string | null }[] = []
    const layout = make({ matchMedia: media.matchMedia, onChange: (info) => changes.push(info) })
    expect(media.listeners.size).toBe(1)
    media.turn(false)
    expect(changes).toEqual([{ tablet: false, picked: null }])
    layout.stop()
    expect(media.listeners.size).toBe(0)
  })
})

// ---- 종이 카드 모양 (reception-paper REQ-1502, 승인 목업 Paper.html) ---------------------------------------------

/** style.css에서 selector(쉼표 목록 중 하나와 똑같은 글)인 규칙들의 선언 [이름, 값] */
function declsOf(css: string, selector: string): [string, string][] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const out: [string, string][] = []
  for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = m[1]!.split(',').map((s) => s.trim())
    if (!selectors.includes(selector)) continue
    for (const decl of m[2]!.split(';')) {
      const colon = decl.indexOf(':')
      if (colon > 0) out.push([decl.slice(0, colon).trim(), decl.slice(colon + 1).trim()])
    }
  }
  return out
}

function valueOf(css: string, selector: string, prop: string): string | undefined {
  return declsOf(css, selector).findLast(([p]) => p === prop)?.[1]
}

describe('REQ-1502 종이 카드 모양 (style.css)', () => {
  it('AC-1502.1: 종이 카드가 쓰는 class는 모두 style.css에 모양이 있다(사람 칸·특이사항·내원내역·증상·상병·처방 표·진료 전 한 줄)', () => {
    const css = readFileSync(STYLE_CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const row = fx.fakeRow({ lane: 'pay' })
    const order = { code: 'LA272', name: '가상 말초차단', qty: '2.5', tms: '1', day: '1' }
    const treated = history({
      paper: { ...history().paper, special: '가상 특이사항', sym: '가상 증상', dx: [{ code: 'M5436', name: '가상 병', main: true }], rx: [order], out: [order] },
    })
    const cards = [
      detailJs.detailPane(row, treated, { today: TODAY }),
      detailJs.detailPane(fx.fakeRow({ lane: 'wait' }), history({ paper: { ...history().paper, special: '' } }), { today: TODAY }),
    ].map((nodes) => nodes.find((n): n is Element => n instanceof Element && n.matches('article.paper')))
    const classes = new Set(cards.flatMap((card) => (card ? [card, ...card.querySelectorAll('*')] : []).flatMap((n) => [...n.classList])))
    for (const cls of ['paper', 'kv', 'spc', 'is-none', 'sec-h', 'spc-text', 'paper-body', 'dx', 'main', 'rx', 'none']) expect(classes, cls).toContain(cls)
    for (const cls of classes) expect(css, `.${cls}`).toMatch(new RegExp(`\.${cls}(?![\w-])`))
  })

  it('AC-1502.1: 종이 카드는 목업 모양이다: 흰 종이에 노란 테두리, 칸 제목은 <…>, 사람 칸 이름 뒤 " :", 빈 값은 흐린 글, 주상병은 "주" 표시, 증상은 받은 줄 바꿈 그대로', () => {
    const css = readFileSync(STYLE_CSS, 'utf8')
    expect(valueOf(css, '.paper', 'background')).toBe('var(--paper)')
    expect(valueOf(css, '.paper', 'border')).toBe('2px solid var(--accent)')
    expect(valueOf(css, '.sec-h::before', 'content')).toBe('"<"')
    expect(valueOf(css, '.sec-h::after', 'content')).toBe('">"')
    expect(valueOf(css, '.kv dt::after', 'content')).toBe('" :"')
    expect(valueOf(css, '.kv .empty', 'color')).toBe('var(--line-2)')
    expect(valueOf(css, '.dx .main::after', 'content')).toBe('" 주"')
    expect(valueOf(css, '.dx .main::after', 'background')).toBe('var(--accent)')
    expect(valueOf(css, '.paper-sym pre', 'white-space')).toBe('pre-wrap')
    expect(valueOf(css, '.paper .rx .n', 'text-align')).toBe('right')
    // 지난번 증상 제목은 종이 아래 조금 띄운다(목업)
    expect(valueOf(css, '.paper + .detail-heading', 'margin-top')).toBe('6px')
  })

  it('AC-1502.2: 특이사항 상자는 빨간 테두리(빈 것은 점선)이고, 글은 줄 바꿈 그대로이며 접히면(.clamp) 5줄만 보인다. [전부 보기] 단추는 누르는 곳 44px 이상이다', () => {
    const css = readFileSync(STYLE_CSS, 'utf8')
    expect(valueOf(css, '.spc', 'border')).toBe('2px solid var(--warn)')
    expect(valueOf(css, '.spc', 'background')).toBe('var(--warn-soft)')
    expect(valueOf(css, '.spc.is-none', 'border')).toBe('1px dashed var(--line-2)')
    expect(valueOf(css, '.spc-text', 'white-space')).toBe('pre-wrap')
    expect(valueOf(css, '.spc-text.clamp', 'display')).toBe('-webkit-box')
    expect(valueOf(css, '.spc-text.clamp', '-webkit-box-orient')).toBe('vertical')
    expect(valueOf(css, '.spc-text.clamp', '-webkit-line-clamp')).toBe('5')
    expect(valueOf(css, '.spc-text.clamp', 'line-clamp')).toBe('5')
    expect(valueOf(css, '.spc-text.clamp', 'overflow')).toBe('hidden')
    expect(Number.parseFloat(valueOf(css, '.spc-more', 'min-height') ?? '0')).toBeGreaterThanOrEqual(44)
    expect(valueOf(css, '.spc-more', 'width')).toBe('100%')
  })
})
