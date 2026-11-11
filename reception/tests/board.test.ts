// @vitest-environment jsdom
// 목록 그리기 board.js (TASK-17, REQ-1407, design.md 10절). 승인 시안 Main.dc.html·Tablet.dc.html의 글·칸 차례 그대로,
// 진료 순서에만 번호·이름표, 메모 있을 때만, 오래 기다림 주황, 환자 글은 글자로만, 머리의 [새로 고침] 단추. 자료는 가짜다(fixtures.ts)
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import * as fx from './fixtures'
import type { FakeBoard, FakeRow } from './fixtures'

interface View {
  lane?: string
  reading?: boolean
  tablet?: boolean
  picked?: string | null
  onPick?: (lane: string) => void
  onSelect?: (k: string) => void
  onRefresh?: () => void
  xray?: (row: FakeRow) => Node | null
  /** 고른 탭 'board'|'arrange' (reception-arrange AC-3308.1) */
  tab?: string
  onTab?: (tab: string) => void
}

interface BoardJs {
  renderBoard: (host: HTMLElement, board: FakeBoard, view?: View) => HTMLElement
  setReading: (host: HTMLElement, reading: boolean) => void
  fillPane: (host: HTMLElement, nodes: Node | Node[] | null) => void
}

// 화면 파일은 빌드 없는 JS라 형 선언이 없다(design.md 결정 '화면은 빌드 없는 JS'). 경로를 값으로 두어 형 검사가 묻지 않게 한다
const BOARD_JS = '../www/board.js'
let view: BoardJs

beforeAll(async () => {
  // 아직 없으면(RED) 빈 것을 그리는 대역으로 시험마다 실패를 보인다
  const missing: BoardJs = {
    renderBoard: (host) => host.appendChild(document.createElement('div')),
    setReading: () => {},
    fillPane: () => {},
  }
  view = ((await import(/* @vite-ignore */ BOARD_JS).catch(() => missing)) ?? missing) as BoardJs
})

afterEach(() => {
  vi.useRealTimers()
  document.body.replaceChildren()
  localStorage.clear()
})

/** index.html의 #app 자리 */
function appHost(): HTMLElement {
  const app = document.createElement('div')
  app.id = 'app'
  document.body.appendChild(app)
  return app
}

function textOf(root: ParentNode, selector: string): string | null {
  return root.querySelector(selector)?.textContent?.trim() ?? null
}

function textsOf(root: ParentNode, selector: string): string[] {
  return [...root.querySelectorAll(selector)].map((n) => n.textContent?.trim() ?? '')
}

/** 바로 아래 아이들의 '태그.class' */
function shapeOf(node: Element | null | undefined): string[] {
  return [...(node?.children ?? [])].map((c) => `${c.tagName.toLowerCase()}${c.className ? `.${c.className.split(' ').join('.')}` : ''}`)
}

function rowsOf(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('main.list > .rows > .row')]
}

function namesOf(root: ParentNode): string[] {
  return rowsOf(root).map((row) => textOf(row, '.name') ?? '')
}

/** 단추의 읽히는 글(aria-hidden 그림은 뺀다) */
function labelOf(button: Element | null): string {
  if (!button) return ''
  return [...button.childNodes]
    .filter((n) => !(n instanceof Element && n.getAttribute('aria-hidden') === 'true'))
    .map((n) => n.textContent ?? '')
    .join('')
    .trim()
}

/**
 * [새로 고침] 단추의 그림. ↻ 글자 대신 aria-hidden 선 그림(svg) 하나다:
 * 글자 그림은 기기 글꼴에 따라 작은 네모나 다른 모양으로 보인다. 색은 단추 글 색(currentColor, 숯색)을 따른다
 */
function iconsOf(button: Element | null): Element[] {
  const icons = [...(button?.querySelectorAll('[aria-hidden="true"]') ?? [])]
  for (const icon of icons) {
    expect(icon.namespaceURI).toBe('http://www.w3.org/2000/svg')
    expect(icon.tagName).toBe('svg')
    expect(icon.getAttribute('class')).toBe('refresh-icon')
    expect(icon.getAttribute('focusable')).toBe('false')
    expect(icon.getAttribute('fill')).toBe('none')
    expect(icon.getAttribute('stroke')).toBe('currentColor')
    expect(icon.textContent).toBe('')
    expect(icon.querySelectorAll('path').length).toBeGreaterThan(0)
  }
  return icons
}

function refreshOf(root: ParentNode): HTMLButtonElement | null {
  return root.querySelector<HTMLButtonElement>('header.top button.refresh')
}

/**
 * 메모 상자(AC-1503.1)의 아이 마디: 요소는 '태그.class:글', 글 마디는 '#text:글'. 상자가 없으면 null.
 * 메모 상자는 [span.memo-label "메모", 메모 글 마디] 둘뿐이다(이름표 뒤 " · " 없음, 환자 글은 글 마디로만)
 */
function memoOf(root: ParentNode | null | undefined): string[] | null {
  const memo = root?.querySelector('.memo')
  if (!memo) return null
  return [...memo.childNodes].map((n) =>
    n instanceof Element ? `${n.tagName.toLowerCase()}.${n.className}:${n.textContent}` : n.nodeType === Node.TEXT_NODE ? `#text:${n.textContent}` : `#${n.nodeName}`,
  )
}

const memoBox = (text: string) => ['span.memo-label:메모', `#text:${text}`]

const FOOT = '보기만 할 수 있어요 · 비트 자료는 바뀌지 않아요'
const QUEUE_ORDER = ['가상환자01', '가상환자04', '가상환자05', '가상환자02', '가상환자03']

describe('board.js 목록 그리기', () => {
  it('AC-1407.1: 시안처럼 머리(로고·연결됨·접수 현황·기준 글)·진료 순서 N명·칸 넷(건수)·칸 제목·줄·아래 글이 차례대로 있고 처음 고른 칸은 진료 순서다', () => {
    const app = appHost()
    const page = view.renderBoard(app, fx.mockupBoard())
    expect(app.children.length).toBe(1)
    expect(app.firstElementChild).toBe(page)
    expect(page.className).toBe('page board')
    expect(shapeOf(page)).toEqual(['header.top', 'div.picker', 'main.list', 'footer.foot'])

    const top = page.querySelector('header.top')
    // 상표 줄 아래 탭 단추 [접수 현황]·[어레인지 N명] (reception-arrange AC-3308.1)
    expect(shapeOf(top)).toEqual(['div.top-row', 'nav.tabs', 'div.title-block'])
    expect(shapeOf(top?.querySelector('.top-row'))).toEqual(['img.logo', 'div.top-status'])
    const logo = top?.querySelector('.top-row > img.logo')
    expect(logo?.getAttribute('src')).toBe('/logo-wordmark.png')
    expect(logo?.getAttribute('alt')).toBe('양지바른정형외과')
    expect(textOf(page, '.top-status > span.conn')).toBe('연결됨')
    expect(shapeOf(top?.querySelector('.title-block'))).toEqual(['h1.top-title', 'p.asof'])
    expect(textOf(page, '.title-block > h1.top-title')).toBe('접수 현황')
    expect(textOf(page, '.title-block > p.asof')).toBe('13:42:10 기준 · 5초마다 저절로 바뀌어요')

    const picker = page.querySelector('.picker')
    expect(shapeOf(picker)).toEqual(['button.queue', 'div.tiles'])
    const queue = picker?.querySelector('button.queue')
    expect(queue?.getAttribute('type')).toBe('button')
    expect(queue?.getAttribute('aria-pressed')).toBe('true')
    expect(shapeOf(queue)).toEqual(['span.queue-label', 'span.queue-count'])
    expect(textOf(picker!, '.queue-label')).toBe('진료 순서 · 대기와 보류 한눈에')
    expect(textOf(picker!, '.queue-count')).toBe('5명')
    const tiles = [...(picker?.querySelectorAll('.tiles > button.tile') ?? [])]
    expect(tiles.map((t) => [textOf(t, '.tile-count'), textOf(t, '.tile-label')])).toEqual([
      ['3', '진료대기'],
      ['2', '진료보류'],
      ['2', '수납대기'],
      ['2', '수납완료'],
    ])
    for (const tile of tiles) {
      expect(tile.getAttribute('type')).toBe('button')
      expect(tile.getAttribute('aria-pressed')).toBe('false')
      expect(shapeOf(tile)).toEqual(['span.tile-count', 'span.tile-label'])
    }

    const list = page.querySelector('main.list')
    expect(shapeOf(list)).toEqual(['h2.list-heading', 'div.rows'])
    expect(textOf(list!, 'h2.list-heading')).toBe('진료대기와 진료보류 · 접수한 순서')
    expect(namesOf(page)).toEqual(QUEUE_ORDER)
    expect(textOf(page, 'footer.foot')).toBe(FOOT)
    // 문서 제목은 건드리지 않는다(AC-1407.5)
    expect(document.title).toBe('')
  })

  it('AC-1407.1: 머리 글 "HH:MM:SS 기준 · N초마다 저절로 바뀌어요"의 N은 받은 답의 every다(지금 5, PC가 바꾸면 그 값). 다시 그리면 새 every로 바뀐다', () => {
    const app = appHost()
    view.renderBoard(app, fx.mockupBoard())
    expect(fx.mockupBoard().every).toBe(5)
    expect(textOf(app, 'p.asof')).toBe('13:42:10 기준 · 5초마다 저절로 바뀌어요')
    view.renderBoard(app, { ...fx.mockupBoard('13:42:13'), every: 3 })
    expect(textOf(app, 'p.asof')).toBe('13:42:13 기준 · 3초마다 저절로 바뀌어요')
    view.renderBoard(app, { ...fx.mockupBoard('13:43:13'), every: 60 })
    expect(textOf(app, 'p.asof')).toBe('13:43:13 기준 · 60초마다 저절로 바뀌어요')
  })

  it('AC-1407.1: every가 숫자가 아닌 판을 받아도 간격 숫자를 지어내지 않는다(화면의 간격 숫자는 poll.js 기본값 하나, AC-1403.9)', () => {
    const app = appHost()
    for (const every of [undefined, null, '5', '<b>5</b>', 0, 2.5]) {
      view.renderBoard(app, { ...fx.mockupBoard(), every } as unknown as FakeBoard)
      expect(textOf(app, 'p.asof'), String(every)).toBe('13:42:10 기준 · 저절로 바뀌어요')
    }
    expect(app.querySelector('b')).toBeNull()
  })

  it('AC-1407.1: 칸을 고르면 그 칸만 aria-pressed="true"이고 칸 제목·줄이 그 칸 것이다(진료대기·진료보류·수납대기·수납완료)', () => {
    const cases: [string, number, string, string[]][] = [
      ['wait', 0, '진료대기 · 접수한 순서', ['가상환자01', '가상환자02', '가상환자03']],
      ['hold', 1, '진료보류 · 접수한 순서', ['가상환자04', '가상환자05']],
      ['pay', 2, '수납대기 · 접수한 순서', ['가상환자06', '가상환자07']],
      ['done', 3, '수납완료 환자 · 최근 순', ['가상환자08', '가상환자09']],
    ]
    for (const [lane, at, heading, names] of cases) {
      const app = appHost()
      const page = view.renderBoard(app, fx.mockupBoard(), { lane })
      expect(page.querySelector('button.queue')?.getAttribute('aria-pressed'), lane).toBe('false')
      expect([...page.querySelectorAll('button.tile')].map((t) => t.getAttribute('aria-pressed')), lane).toEqual(
        [0, 1, 2, 3].map((i) => (i === at ? 'true' : 'false')),
      )
      expect(textOf(page, 'h2.list-heading'), lane).toBe(heading)
      expect(namesOf(page), lane).toEqual(names)
      app.remove()
    }
    // 모르는 칸 이름이면 진료 순서
    const page = view.renderBoard(appHost(), fx.mockupBoard(), { lane: 'nope' })
    expect(page.querySelector('button.queue')?.getAttribute('aria-pressed')).toBe('true')
    expect(namesOf(page)).toEqual(QUEUE_ORDER)
  })

  it('AC-1407.1: 진료 순서·칸 단추를 누르면 그 자리에서 그 칸을 그리고 onPick(칸)을 한 번 부른다', () => {
    const app = appHost()
    const onPick = vi.fn()
    view.renderBoard(app, fx.mockupBoard(), { onPick })
    app.querySelectorAll<HTMLButtonElement>('button.tile')[2]?.click()
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick).toHaveBeenLastCalledWith('pay')
    expect([...app.querySelectorAll('button.tile')].map((t) => t.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true', 'false'])
    expect(app.querySelector('button.queue')?.getAttribute('aria-pressed')).toBe('false')
    expect(textOf(app, 'h2.list-heading')).toBe('수납대기 · 접수한 순서')
    expect(namesOf(app)).toEqual(['가상환자06', '가상환자07'])

    app.querySelector<HTMLButtonElement>('button.queue')?.click()
    expect(onPick).toHaveBeenCalledTimes(2)
    expect(onPick).toHaveBeenLastCalledWith('queue')
    expect(app.querySelector('button.queue')?.getAttribute('aria-pressed')).toBe('true')
    expect(namesOf(app)).toEqual(QUEUE_ORDER)
    expect(app.querySelectorAll('.page.board').length).toBe(1)
  })

  it('AC-1407.1: 같은 자리에 다시 그리면 화면은 하나이고 뼈대(줄 칸)는 그대로 둔 채 글·건수·줄만 바뀐다. 다른 화면(불러오는 중)이 있으면 바꿔 그린다', () => {
    const app = appHost()
    const loading = document.createElement('div')
    loading.className = 'page off-page'
    loading.textContent = '불러오는 중이에요'
    app.appendChild(loading)

    const first = view.renderBoard(app, fx.mockupBoard())
    expect(app.contains(loading)).toBe(false)
    const rows = first.querySelector('main.list > .rows')
    expect(rows).not.toBeNull()

    const next = fx.boardOf({ wait: [fx.fakeRow({ k: fx.fakeKey(11), name: '가상환자11', chart: '911111', time: '11:02 접수' })] }, '13:42:20')
    const second = view.renderBoard(app, next)
    expect(second).toBe(first)
    expect(app.children.length).toBe(1)
    expect(second.querySelector('main.list > .rows')).toBe(rows)
    expect(textOf(app, 'p.asof')).toBe('13:42:20 기준 · 5초마다 저절로 바뀌어요')
    expect(textOf(app, '.queue-count')).toBe('1명')
    expect(textsOf(app, '.tile-count')).toEqual(['1', '0', '0', '0'])
    expect(namesOf(app)).toEqual(['가상환자11'])
    expect(app.textContent).not.toContain('가상환자01')
  })

  it('AC-1407.2 · AC-1503.1 · AC-1503.2: 진료 순서 줄은 순서 번호·상태 이름표·차트번호·이름·정보(신환이면 신환 표시), 접수 시각·기다린 글(오래 기다림은 주황), 메모가 있을 때만 메모 상자, 처방 이름표·처방 글이다', () => {
    const app = appHost()
    view.renderBoard(app, fx.mockupBoard())
    const rows = rowsOf(app)
    expect(rows.length).toBe(5)
    expect(rows.map((r) => textOf(r, '.pos'))).toEqual(['1', '2', '3', '4', '5'])
    expect(rows.map((r) => textOf(r, '.status'))).toEqual(['진료대기', '진료보류', '진료보류', '진료대기', '진료대기'])

    // 1번: 진료대기 · 오래 기다림 · 메모 없음
    const longWait = rows[0]
    expect(shapeOf(longWait)).toEqual(['a.row-main'])
    const main = longWait.querySelector(':scope > .row-main')
    expect(shapeOf(main)).toEqual(['span.row-head', 'span.row-time'])
    expect(shapeOf(main?.querySelector('.row-head'))).toEqual(['span.pos', 'span.status.status-wait', 'span.chart', 'span.name', 'span.info', 'span.new-badge'])
    expect(textsOf(main!, '.row-head > span')).toEqual(['1', '진료대기', '910871', '가상환자01', '37세 · 남', '신환'])
    expect(shapeOf(main?.querySelector('.row-time'))).toEqual(['span', 'span.waited.is-long'])
    expect(textsOf(main!, '.row-time > span')).toEqual(['09:38 접수', '1시간 4분째 대기'])
    expect(main?.querySelector('.memo')).toBeNull()

    // 2번: 진료보류 · 메모 있음 · 오래 기다림 아님
    const hold = rows[1].querySelector(':scope > .row-main')
    expect(shapeOf(hold)).toEqual(['span.row-head', 'span.row-time', 'span.memo'])
    expect(shapeOf(hold?.querySelector('.row-head'))).toEqual(['span.pos', 'span.status.status-hold', 'span.chart', 'span.name', 'span.info'])
    expect(textsOf(hold!, '.row-head > span')).toEqual(['2', '진료보류', '910502', '가상환자04', '45세 · 남 · 재진'])
    expect(hold?.querySelector('.waited')?.className).toBe('waited')
    expect(textOf(hold!, '.waited')).toBe('보류 22분째')
    expect(memoOf(hold)).toEqual(memoBox('엑스레이 찍으러 감'))

    // 메모는 있는 줄에만
    expect(rows.map((r) => memoOf(r))).toEqual([null, memoBox('엑스레이 찍으러 감'), null, memoBox('오른쪽 어깨 통증 심해짐'), memoBox('보호자 동반')])
  })

  it('AC-1407.2 · AC-1503.2: 칸 넷의 줄에는 순서 번호·상태 이름표가 없고(신환 줄만 신환 표시), 끝남 줄의 기다린 글은 끝남 모양, 수납대기는 보통 모양이다', () => {
    for (const lane of ['wait', 'hold', 'pay', 'done'] as const) {
      const app = appHost()
      const fake = fx.mockupBoard()
      view.renderBoard(app, fake, { lane })
      const rows = rowsOf(app)
      expect(rows.length, lane).toBeGreaterThan(0)
      rows.forEach((row, i) => {
        expect(row.querySelector('.pos, .status'), lane).toBeNull()
        const isNew = fake.lists[lane][i]!.info.endsWith(' · 신환')
        expect(shapeOf(row.querySelector('.row-head')), lane).toEqual(['span.chart', 'span.name', 'span.info', ...(isNew ? ['span.new-badge'] : [])])
      })
      const waited = rows.map((r) => r.querySelector('.waited')?.className)
      if (lane === 'wait') expect(waited).toEqual(['waited is-long', 'waited', 'waited'])
      if (lane === 'hold') expect(waited).toEqual(['waited', 'waited'])
      if (lane === 'pay') expect(waited).toEqual(['waited', 'waited'])
      if (lane === 'done') {
        expect(waited).toEqual(['waited is-done', 'waited is-done'])
        expect(rows.map((r) => textOf(r, '.waited'))).toEqual(['09:40 수납', '09:31 수납'])
      }
      app.remove()
    }
  })

  it('AC-1407.2: 환자 글(이름·차트번호·정보·메모·기준 시각)에 <b>·<img onerror>를 넣어도 글자로만 보인다(처방 글은 그리지 않는다, AC-1504.1)', () => {
    const name = '<b>가상환자10</b>'
    const memo = '<img src=x onerror=alert(1)>'
    const rx = '<b>체외충격파(ESWT7)</b>'
    const chart = '<i>910001</i>'
    const info = '<script>54세</script>'
    const board = fx.boardOf({ wait: [fx.fakeRow({ k: fx.fakeKey(10), name, memo, rx, chart, info, rxLabel: '<u>오늘</u>' })] }, '<b>13:42:10</b>')
    const app = appHost()
    view.renderBoard(app, board)
    const row = rowsOf(app)[0]
    expect(textOf(row, '.name')).toBe(name)
    expect(textOf(row, '.chart')).toBe(chart)
    expect(textOf(row, '.info')).toBe(info)
    expect(memoOf(row)).toEqual(memoBox(memo))
    expect(row.querySelector('.rx-line, .rx-label, .rx-text')).toBeNull()
    expect(row.textContent).not.toContain(rx)
    expect(textOf(app, 'p.asof')).toBe('<b>13:42:10</b> 기준 · 5초마다 저절로 바뀌어요')
    expect(app.querySelector('b, i, u, script, img:not(.logo)')).toBeNull()
  })

  it('AC-1407.2: 이름·메모를 아직 못 읽은 줄("")도 그 칸만 비우고 줄은 그대로 그린다', () => {
    const board = fx.boardOf({ wait: [fx.fakeRow({ k: fx.fakeKey(12), name: '', memo: '', chart: '912222' })] })
    const app = appHost()
    view.renderBoard(app, board)
    const rows = rowsOf(app)
    expect(rows.length).toBe(1)
    expect(rows[0].querySelector('.name')?.textContent ?? '').toBe('')
    expect(textOf(rows[0], '.chart')).toBe('912222')
    expect(textOf(rows[0], '.info')).toBe('54세 · 여 · 재진')
    expect(rows[0].querySelector('.memo')).toBeNull()
  })

  it('AC-1504.1: 목록 줄(폰·태블릿, 진료 순서·칸 넷)에는 이름표 줄(오늘 처방·지난번 증상·첫 방문 글)이 없고 그 글도 보이지 않는다', () => {
    const fake = fx.mockupBoard()
    for (const tablet of [false, true])
      for (const lane of [undefined, 'wait', 'hold', 'pay', 'done'] as const) {
        const app = appHost()
        view.renderBoard(app, fake, lane ? { lane, tablet } : { tablet })
        const rows = rowsOf(app)
        expect(rows.length, `${tablet} ${lane}`).toBeGreaterThan(0)
        expect(app.querySelector('.rx-line, .rx-label, .rx-text'), `${tablet} ${lane}`).toBeNull()
        const list = fake.lists[lane ?? 'queue']
        rows.forEach((row, i) => {
          const data = list[i]!
          expect(row.textContent, `${tablet} ${lane} ${i}`).not.toContain(data.rx)
          expect(textOf(row, '.name')).toBe(data.name)
          expect(textOf(row, '.chart')).toBe(data.chart)
        })
        app.remove()
      }
  })

  it('AC-1504.1: 이름표 줄을 빼도 정보·신환 표시·접수 시각·기다린 글·메모 상자는 그대로다', () => {
    const app = appHost()
    view.renderBoard(app, fx.mockupBoard())
    const rows = rowsOf(app)
    expect(shapeOf(rows[0]!.querySelector('.row-main'))).toEqual(['span.row-head', 'span.row-time'])
    expect(shapeOf(rows[3]!.querySelector('.row-main'))).toEqual(['span.row-head', 'span.row-time', 'span.memo'])
    expect(textOf(rows[0]!, '.new-badge')).toBe('신환')
    expect(textsOf(rows[0]!, '.row-time > span')).toEqual(['09:38 접수', '1시간 4분째 대기'])
    expect(memoOf(rows[3])).toEqual(memoBox('오른쪽 어깨 통증 심해짐'))
  })

  it('AC-1407.2: 폰 줄은 상세로 가는 링크(#/v/열쇠)이고, 태블릿 줄은 고르는 단추(aria-pressed, 고른 줄 표시, onSelect(열쇠))다', () => {
    const app = appHost()
    view.renderBoard(app, fx.mockupBoard())
    const links = rowsOf(app).map((r) => r.querySelector(':scope > .row-main'))
    expect(links.map((a) => a?.tagName)).toEqual(['A', 'A', 'A', 'A', 'A'])
    expect(links.map((a) => a?.getAttribute('href'))).toEqual([1, 4, 5, 2, 3].map((n) => `#/v/${fx.fakeKey(n)}`))
    expect(app.querySelector('.pane, .row.is-picked, [aria-pressed] .row-main')).toBeNull()

    const tab = appHost()
    const onSelect = vi.fn()
    const page = view.renderBoard(tab, fx.mockupBoard(), { tablet: true, picked: fx.fakeKey(4), onSelect })
    const buttons = rowsOf(tab).map((r) => r.querySelector<HTMLButtonElement>(':scope > .row-main'))
    expect(buttons.map((b) => b?.tagName)).toEqual(['BUTTON', 'BUTTON', 'BUTTON', 'BUTTON', 'BUTTON'])
    expect(buttons.map((b) => b?.getAttribute('type'))).toEqual(['button', 'button', 'button', 'button', 'button'])
    expect(buttons.map((b) => b?.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false', 'false', 'false'])
    expect(rowsOf(tab).map((r) => r.classList.contains('is-picked'))).toEqual([false, true, false, false, false])
    expect(tab.querySelector('a.row-main')).toBeNull()

    buttons[3]?.click()
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenLastCalledWith(fx.fakeKey(2))
    expect(rowsOf(tab).map((r) => r.classList.contains('is-picked'))).toEqual([false, false, false, true, false])
    expect(rowsOf(tab).map((r) => r.querySelector('.row-main')?.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'false', 'true', 'false'])
    expect(tab.querySelectorAll('.page.board').length).toBe(1)
    expect(page.isConnected).toBe(true)
  })

  it('AC-1407.2: 태블릿은 오른쪽 칸(aside.pane, 아래 글)을 두고 fillPane으로 채운 것은 다시 그려도 그대로이며, 폰으로 그리면 오른쪽 칸이 없다', () => {
    const app = appHost()
    const page = view.renderBoard(app, fx.mockupBoard(), { tablet: true, picked: fx.fakeKey(1) })
    expect(shapeOf(page)).toEqual(['header.top', 'div.picker', 'main.list', 'aside.pane', 'footer.foot'])
    const pane = page.querySelector('aside.pane')
    expect(pane?.getAttribute('aria-label')).toBe('처방 내역')
    expect(shapeOf(pane)).toEqual(['p.pane-foot'])
    expect(textOf(pane!, 'p.pane-foot')).toBe(FOOT)

    const card = document.createElement('div')
    card.className = 'patient'
    const heading = document.createElement('h2')
    heading.className = 'detail-heading'
    view.fillPane(app, [card, heading])
    expect(shapeOf(pane)).toEqual(['div.patient', 'h2.detail-heading', 'p.pane-foot'])

    view.renderBoard(app, fx.mockupBoard('13:42:20'), { tablet: true, picked: fx.fakeKey(1) })
    expect(page.querySelector('aside.pane')).toBe(pane)
    expect(pane?.firstElementChild).toBe(card)

    const today = document.createElement('section')
    today.className = 'today'
    view.fillPane(app, today)
    expect(shapeOf(pane)).toEqual(['section.today', 'p.pane-foot'])
    view.fillPane(app, null)
    expect(shapeOf(pane)).toEqual(['p.pane-foot'])

    view.renderBoard(app, fx.mockupBoard())
    expect(shapeOf(app.querySelector('.page.board'))).toEqual(['header.top', 'div.picker', 'main.list', 'footer.foot'])
  })

  it('AC-1407.2: 엑스레이 칸이 있는 줄(진료보류)에만 xray(줄)로 받은 띠를 줄 아래에 붙인다', () => {
    const xray = vi.fn((row: FakeRow) => {
      const band = document.createElement('div')
      band.className = 'xray'
      band.textContent = row.xray?.at ? `X-ray 완료 ${row.xray.at}` : 'X-ray 전'
      return band
    })
    const app = appHost()
    view.renderBoard(app, fx.mockupBoard(), { xray })
    expect(xray.mock.calls.map(([row]) => row.k)).toEqual([fx.fakeKey(4), fx.fakeKey(5)])
    expect(rowsOf(app).map((r) => shapeOf(r))).toEqual([
      ['a.row-main'],
      ['a.row-main', 'div.xray'],
      ['a.row-main', 'div.xray'],
      ['a.row-main'],
      ['a.row-main'],
    ])
    expect(textsOf(app, '.row > .xray')).toEqual(['X-ray 전', 'X-ray 완료 10:55'])

    xray.mockClear()
    view.renderBoard(app, fx.mockupBoard(), { xray, lane: 'pay' })
    expect(xray).not.toHaveBeenCalled()
    expect(app.querySelector('.xray')).toBeNull()
  })

  it('AC-1407.10: 머리의 연결됨 표시 바로 옆에 진짜 단추 <button type="button" class="refresh"> "새로 고침"(↻ 그림은 aria-hidden)이 있다', () => {
    const app = appHost()
    view.renderBoard(app, fx.mockupBoard())
    const button = refreshOf(app)
    expect(button).not.toBeNull()
    expect(button?.tagName).toBe('BUTTON')
    expect(button?.getAttribute('type')).toBe('button')
    expect(button?.parentElement?.className).toBe('top-status')
    expect(shapeOf(button?.parentElement)).toEqual(['span.conn', 'button.refresh'])
    expect(labelOf(button)).toBe('새로 고침')
    expect(iconsOf(button)).toHaveLength(1)
    expect(button?.textContent).toBe('새로 고침')
    expect(button?.disabled).toBe(false)
  })

  it('AC-1407.10: reading이면 단추 글은 "읽는 중…"이고 disabled다. setReading으로 그 자리에서 바꾼다', () => {
    const app = appHost()
    view.renderBoard(app, fx.mockupBoard(), { reading: true })
    expect(labelOf(refreshOf(app))).toBe('읽는 중…')
    expect(refreshOf(app)?.disabled).toBe(true)

    expect(iconsOf(refreshOf(app))).toHaveLength(1)
    expect(refreshOf(app)?.textContent).toBe('읽는 중…')

    const button = refreshOf(app)
    view.setReading(app, false)
    expect(refreshOf(app)).toBe(button)
    expect(labelOf(button)).toBe('새로 고침')
    expect(iconsOf(button)).toHaveLength(1)
    expect(button?.disabled).toBe(false)
    view.setReading(app, true)
    expect(labelOf(button)).toBe('읽는 중…')
    expect(button?.disabled).toBe(true)

    view.renderBoard(app, fx.mockupBoard())
    expect(labelOf(refreshOf(app))).toBe('새로 고침')
    expect(refreshOf(app)?.disabled).toBe(false)
  })

  it('AC-1407.10: 누르면 onRefresh를 한 번 부르고 바로 "읽는 중…"·disabled라 더 눌러도 늘지 않는다. 끝나 다시 그리면 또 누를 수 있다', () => {
    const app = appHost()
    const onRefresh = vi.fn()
    view.renderBoard(app, fx.mockupBoard(), { onRefresh })
    refreshOf(app)?.click()
    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(labelOf(refreshOf(app))).toBe('읽는 중…')
    expect(refreshOf(app)?.disabled).toBe(true)
    refreshOf(app)?.click()
    refreshOf(app)?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onRefresh).toHaveBeenCalledTimes(1)

    // 읽는 동안 다시 그려도(저절로 읽기의 답) reading이면 그대로 막혀 있다
    view.renderBoard(app, fx.mockupBoard(), { onRefresh, reading: true })
    refreshOf(app)?.click()
    expect(onRefresh).toHaveBeenCalledTimes(1)

    view.renderBoard(app, fx.mockupBoard('13:42:20'), { onRefresh })
    expect(labelOf(refreshOf(app))).toBe('새로 고침')
    refreshOf(app)?.click()
    expect(onRefresh).toHaveBeenCalledTimes(2)
  })

  it('AC-3308.1: 상표 줄 아래 탭 단추 둘 [접수 현황]·[어레인지 N명](진짜 button, N = arrange.rows 수, 고른 것 aria-pressed)이 있고 처음(view.tab 없음)은 [접수 현황]이다. 누르면 onTab(탭)을 부른다', () => {
    const app = appHost()
    const onTab = vi.fn()
    const page = view.renderBoard(app, fx.arrangeMockupBoard(), { onTab })
    const nav = page.querySelector(':scope > header.top > nav.tabs')
    expect(nav?.previousElementSibling?.className).toBe('top-row')
    const tabs = [...(nav?.querySelectorAll<HTMLButtonElement>(':scope > button.tab') ?? [])]
    expect(tabs.map((t) => [t.tagName, t.getAttribute('type'), t.textContent])).toEqual([
      ['BUTTON', 'button', '접수 현황'],
      ['BUTTON', 'button', '어레인지8명'],
    ])
    expect(shapeOf(tabs[1])).toEqual(['span.tab-n'])
    expect(textOf(tabs[1]!, '.tab-n')).toBe('8명')
    expect(tabs.map((t) => t.getAttribute('aria-pressed'))).toEqual(['true', 'false'])
    tabs[1]!.click()
    expect(onTab).toHaveBeenLastCalledWith('arrange')
    tabs[0]!.click()
    expect(onTab).toHaveBeenLastCalledWith('board')
    expect(onTab).toHaveBeenCalledTimes(2)
    // 다시 그리면 건수가 바뀌고, view.tab이 arrange면 [어레인지]가 골라져 있다
    const fewer = fx.arrangeMockupBoard()
    fewer.arrange!.rows = fewer.arrange!.rows.slice(0, 3)
    view.renderBoard(app, fewer, { tab: 'arrange' })
    expect(textsOf(app, 'nav.tabs > button.tab')).toEqual(['접수 현황', '어레인지3명'])
    expect([...app.querySelectorAll('nav.tabs > button.tab')].map((t) => t.getAttribute('aria-pressed'))).toEqual(['false', 'true'])
    // 어레인지 자료가 없는 판(옛 도우미)은 0명
    view.renderBoard(app, fx.mockupBoard())
    expect(textOf(app, 'nav.tabs .tab-n')).toBe('0명')
    // 탭은 문서 제목을 건드리지 않는다(AC-1407.5)
    expect(document.title).toBe('')
  })

  it('AC-3403.1: 접수 현황 탭 머리에는 이 기기에 메모가 있어도 메모 칸이 없다(어레인지 탭에만 있다)', () => {
    localStorage.setItem('reception-memo', JSON.stringify({ v: 1, text: '오후 3시 원장님 외출', ink: null }))
    const app = appHost()
    const page = view.renderBoard(app, fx.arrangeMockupBoard())
    expect(shapeOf(page.querySelector('header.top'))).toEqual(['div.top-row', 'nav.tabs', 'div.title-block'])
    expect(shapeOf(page.querySelector('header.top > .top-row'))).toEqual(['img.logo', 'div.top-status'])
    expect(document.querySelector('.memo-box')).toBeNull()
    expect(document.body.textContent).not.toContain('오후 3시 원장님 외출')
  })

  it('AC-1407.10: "HH:MM:SS 기준"은 받은 답의 at으로 그리고 휴대폰 시계를 쓰지 않는다(같은 at이면 그대로)', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-05T08:01:02+09:00'))
    const app = appHost()
    view.renderBoard(app, fx.boardOf({}, '13:42:10'))
    expect(textOf(app, 'p.asof')).toBe('13:42:10 기준 · 5초마다 저절로 바뀌어요')
    vi.setSystemTime(new Date('2026-11-05T08:01:05+09:00'))
    view.renderBoard(app, fx.boardOf({}, '13:42:10'))
    expect(textOf(app, 'p.asof')).toBe('13:42:10 기준 · 5초마다 저절로 바뀌어요')
    expect(app.textContent).not.toMatch(/08:01/)
    // 빈 판: 칸 제목은 있고 줄은 없다(지어낸 글 없음)
    expect(textOf(app, '.queue-count')).toBe('0명')
    expect(textOf(app, 'h2.list-heading')).toBe('진료대기와 진료보류 · 접수한 순서')
    expect(rowsOf(app)).toEqual([])
  })
})

describe('REQ-1503 메모 크게 · 신환 눈에 띄게 (board.js 목록 줄, 승인 목업 Paper.html)', () => {
  it('AC-1503.1: 메모가 있는 줄의 메모 상자는 앞에 이름표 span.memo-label "메모"와 메모 글(글 마디)뿐이다. 폰·태블릿, 진료 순서·칸 넷 모두 같고 메모가 없는 줄에는 상자가 없다', () => {
    for (const tablet of [false, true]) {
      for (const lane of ['queue', 'wait', 'hold', 'pay', 'done'] as const) {
        const app = appHost()
        const fake = fx.mockupBoard()
        view.renderBoard(app, fake, { lane, tablet })
        const rows = rowsOf(app)
        expect(rows.length, lane).toBe(fake.lists[lane].length)
        rows.forEach((row, i) => {
          const memo = fake.lists[lane][i]!.memo
          expect(memoOf(row), `${lane} ${i}`).toEqual(memo === '' ? null : memoBox(memo))
          if (memo !== '') expect(row.querySelector('.row-main > span.memo > span.memo-label'), `${lane} ${i}`).not.toBeNull()
        })
        app.remove()
      }
    }
  })

  it('AC-1503.1: 메모 글에 HTML을 넣어도 이름표 뒤 글 마디로만 들어간다', () => {
    const memo = '<b>굵게</b> <img src=x onerror=alert(1)>'
    const app = appHost()
    view.renderBoard(app, fx.boardOf({ wait: [fx.fakeRow({ memo })] }))
    expect(memoOf(rowsOf(app)[0])).toEqual(memoBox(memo))
    expect(app.querySelector('.memo b, .memo img')).toBeNull()
  })

  it('AC-1503.2: 정보 글을 " · "로 나눈 마지막 조각이 "신환"이면 정보 글에서 " · 신환"을 빼고 정보 바로 뒤에 span.new-badge "신환"을 붙인다. "재진"이거나 그 밖이면 정보 글 그대로이고 표시가 없다', () => {
    const cases: [string, string | null, boolean][] = [
      ['37세 · 남 · 신환', '37세 · 남', true],
      ['여 · 신환', '여', true],
      ['54세 · 여 · 재진', '54세 · 여 · 재진', false],
      ['신환 · 재진', '신환 · 재진', false],
      ['54세 · 여 · 신환대기', '54세 · 여 · 신환대기', false],
      ['54세 · 여 신환', '54세 · 여 신환', false],
      ['<b>54세</b> · 신환', '<b>54세</b>', true],
    ]
    for (const tablet of [false, true]) {
      for (const [info, shown, isNew] of cases) {
        const app = appHost()
        view.renderBoard(app, fx.boardOf({ wait: [fx.fakeRow({ info })] }), { tablet })
        const head = rowsOf(app)[0]!.querySelector('.row-head')
        expect(shapeOf(head), info).toEqual(['span.pos', 'span.status.status-wait', 'span.chart', 'span.name', 'span.info', ...(isNew ? ['span.new-badge'] : [])])
        expect(textOf(head!, '.info'), info).toBe(shown)
        if (isNew) {
          expect(head!.querySelector('.info')?.nextElementSibling?.className, info).toBe('new-badge')
          expect(textOf(head!, '.new-badge'), info).toBe('신환')
        } else expect(head!.querySelector('.new-badge'), info).toBeNull()
        expect(head!.querySelector('b'), info).toBeNull()
        app.remove()
      }
    }
  })

  it('AC-1503.2: 정보 글이 "신환" 하나면 정보 칸 없이 표시만, 빈 정보("")면 둘 다 없다', () => {
    const only = appHost()
    view.renderBoard(only, fx.boardOf({ pay: [fx.fakeRow({ info: '신환' })] }), { lane: 'pay' })
    expect(shapeOf(rowsOf(only)[0]!.querySelector('.row-head'))).toEqual(['span.chart', 'span.name', 'span.new-badge'])
    const empty = appHost()
    view.renderBoard(empty, fx.boardOf({ pay: [fx.fakeRow({ info: '' })] }), { lane: 'pay' })
    expect(shapeOf(rowsOf(empty)[0]!.querySelector('.row-head'))).toEqual(['span.chart', 'span.name'])
  })

  it('AC-1503.2: 승인 판에서 신환 줄(가상환자01·가상환자07)에만 표시가 있고 진료 순서·줄 차례는 그대로다', () => {
    const app = appHost()
    view.renderBoard(app, fx.mockupBoard())
    expect(namesOf(app)).toEqual(QUEUE_ORDER)
    expect(rowsOf(app).map((r) => r.querySelector('.new-badge') !== null)).toEqual([true, false, false, false, false])
    expect(rowsOf(app).map((r) => textOf(r, '.info'))).toEqual(['37세 · 남', '45세 · 남 · 재진', '58세 · 여 · 재진', '54세 · 여 · 재진', '71세 · 여 · 재진'])
    view.renderBoard(app, fx.mockupBoard(), { lane: 'pay' })
    expect(rowsOf(app).map((r) => [textOf(r, '.name'), textOf(r, '.info'), textOf(r, '.new-badge')])).toEqual([
      ['가상환자06', '62세 · 여 · 재진', null],
      ['가상환자07', '29세 · 남', '신환'],
    ])
  })
})
