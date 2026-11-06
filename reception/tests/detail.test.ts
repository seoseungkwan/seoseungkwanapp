// @vitest-environment jsdom
// 상세 그리기 detail.js (TASK-19·TASK-36, REQ-1407·REQ-1404, design.md 5절·10절). 승인 시안 Detail.dc.html과 Tablet.dc.html 오른쪽 칸에서
// 지난 진료 목록·처방·[더 보기]를 뺀 것(AC-1404.7, 사용자 결정 2026-11-06): 오늘 카드(제목·이름표·오늘 처방·오늘 증상), '지난번' 카드 하나
// (가장 최근 지난 내원의 날짜·N일 전·증상, 없으면 "적힌 증상이 없어요"), 끝 줄. 오늘 증상 줄만 바꾸기(updateTodaySym, AC-1404.8).
// 상세 자료는 도우미 GET /api/visit/{k}/history 답(HistoryBuilder.cs ToJson)의 모양이고, 오늘 카드의 상태·오늘 처방은 목록 줄로 그린다.
// 자료는 가짜다(가상환자NN, 9로 시작하는 6자리 차트번호, 시안의 처방 코드)
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import * as fx from './fixtures'
import type { FakeBoard, FakeRow } from './fixtures'

interface FakeRx {
  name: string
  code: string
}

interface FakeVisit {
  date: string
  ago: string
  sym: string
  rx: FakeRx[]
}

/** GET /api/visit/{k}/history 200 답 (design.md 5절) */
interface FakeHistory {
  visits: FakeVisit[]
  next: number | null
  more: number
  first: string
  total: number
  todaySym: string
}

interface DetailOptions {
  today?: Date
  onMore?: (next: number) => unknown
}

interface DetailJs {
  renderDetail: (host: HTMLElement, row: FakeRow, history: FakeHistory, options?: DetailOptions) => HTMLElement
  detailPane: (row: FakeRow, history: FakeHistory, options?: DetailOptions) => Node[]
  updateDetail: (host: ParentNode, row: FakeRow, options?: DetailOptions) => boolean
  updateTodaySym: (host: ParentNode, k: string, todaySym: string) => boolean
}

interface BoardJs {
  renderBoard: (host: HTMLElement, board: FakeBoard, view?: Record<string, unknown>) => HTMLElement
  fillPane: (host: HTMLElement, nodes: Node | Node[] | null) => void
}

// 화면 파일은 빌드 없는 JS라 형 선언이 없다. 경로를 값으로 두어 형 검사가 묻지 않게 한다
const DETAIL_JS = '../www/detail.js'
const BOARD_JS = '../www/board.js'
let view: DetailJs
let board: BoardJs

beforeAll(async () => {
  // 아직 없으면(RED) 빈 것을 그리는 대역으로 시험마다 실패를 보인다
  const missing: DetailJs = {
    renderDetail: (host) => host.appendChild(document.createElement('div')),
    detailPane: () => [],
    updateDetail: () => false,
    updateTodaySym: () => false,
  }
  view = ((await import(/* @vite-ignore */ DETAIL_JS).catch(() => missing)) ?? missing) as DetailJs
  board = (await import(/* @vite-ignore */ BOARD_JS)) as BoardJs
})

afterEach(() => {
  document.body.replaceChildren()
  document.title = ''
})

/** 오늘(시험 기준): 2026년 11월 5일 */
const TODAY = new Date(2026, 10, 5, 13, 42, 10)
const FOOT = '보기만 할 수 있어요 · 비트 자료는 바뀌지 않아요'
const HEADING = '오늘과 지난번 증상'
const NO_TODAY_RX = '아직 처방이 없어요. 진료가 끝나면 여기에 나와요.'
const NO_VISITS = '첫 방문이라 지난 진료가 없어요.'
const NO_SYM = '적힌 증상이 없어요'

const rx = (name: string, code: string): FakeRx => ({ name, code })

/** 승인 시안(Detail.dc.html)의 지난 진료 5번 */
const MOCKUP_VISITS: FakeVisit[] = [
  { date: '10월 29일', ago: '7일 전', sym: '오른쪽 어깨 통증 조금 줄었음, 밤에 아픔', rx: [rx('체외충격파', 'ESWT7'), rx('도수치료 20분', 'DS20')] },
  { date: '10월 22일', ago: '14일 전', sym: '오른쪽 어깨 통증, 팔 올릴 때 아픔', rx: [rx('체외충격파', 'ESWT7'), rx('표층열치료', 'PT01')] },
  { date: '10월 15일', ago: '21일 전', sym: '어깨·목 뻐근함', rx: [rx('도수치료 20분', 'DS20'), rx('간섭파치료', 'PT03'), rx('표층열치료', 'PT01')] },
  { date: '10월 8일', ago: '28일 전', sym: '오른쪽 어깨 통증 2주째, 1주 뒤 다시 봄', rx: [rx('엑스레이 촬영', 'XR2'), rx('주사', 'INJ1')] },
  { date: '9월 30일', ago: '36일 전', sym: '오른쪽 어깨 통증 처음 옴', rx: [rx('엑스레이 촬영', 'XR2'), rx('표층열치료', 'PT01')] },
]

/** 시안의 첫 쪽: 지난 진료 36번 중 처음 5번, 31번 더, 처음 온 날 2024년 3월 12일, 모두 37번 */
function mockupHistory(over: Partial<FakeHistory> = {}): FakeHistory {
  return { visits: MOCKUP_VISITS, next: 5, more: 31, first: '2024년 3월 12일', total: 37, todaySym: '', ...over }
}

/** [더 보기]가 받는 다음 쪽: from번째부터 count번. i번째 내원은 날짜·N일 전 글로 알아볼 수 있다 */
function pageAt(from: number, count: number, rest: number): FakeHistory {
  const visits = Array.from({ length: count }, (_, j) => {
    const i = from + j
    return { date: `2025년 ${(i % 12) + 1}월 ${(i % 27) + 1}일`, ago: `${40 + i * 7}일 전`, sym: `가상 증상 ${i}`, rx: [rx('체외충격파', 'ESWT7')] }
  })
  return { visits, next: rest > 0 ? from + count : null, more: rest, first: '2024년 3월 12일', total: 37, todaySym: '' }
}

/** 시안의 환자 줄(진료대기, 메모 있음, 오늘 처방 없음) */
function mockupRow(over: Partial<FakeRow> = {}): FakeRow {
  return fx.fakeRow({
    k: fx.fakeKey(2),
    chart: '910234',
    name: '가상환자02',
    info: '54세 · 여 · 재진',
    time: '10:42 접수',
    waited: '18분째 대기',
    memo: '오른쪽 어깨 통증 심해짐',
    rxLabel: '지난번',
    rx: '체외충격파(ESWT7) · 도수치료 20분(DS20)',
    ...over,
  })
}

/** index.html의 #app 자리 */
function appHost(): HTMLElement {
  const app = document.createElement('div')
  app.id = 'app'
  document.body.appendChild(app)
  return app
}

function textOf(root: ParentNode | null | undefined, selector: string): string | null {
  return root?.querySelector(selector)?.textContent?.trim() ?? null
}

function textsOf(root: ParentNode, selector: string): string[] {
  return [...root.querySelectorAll(selector)].map((n) => n.textContent?.trim() ?? '')
}

/** 바로 아래 아이들의 '태그.class' */
function shapeOf(node: Element | null | undefined): string[] {
  return [...(node?.children ?? [])].map((c) => `${c.tagName.toLowerCase()}${c.className ? `.${c.className.split(' ').join('.')}` : ''}`)
}

/** 요소 안의 바로 아래 글 마디만 (아이 요소의 글은 뺀다) */
function ownText(node: Element | null | undefined): string {
  return [...(node?.childNodes ?? [])]
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent ?? '')
    .join('')
    .trim()
}

/** '지난번' 카드 (AC-1404.7) */
function lastOf(root: ParentNode | null | undefined): Element | null {
  return root?.querySelector('section.visit.is-last') ?? null
}

/** 지난번 카드를 [표시, 날짜, N일 전, 증상 줄 또는 빈 증상 글]로 */
function lastCardOf(card: Element | null): [string | null, string, string | null, string | null] {
  const title = card?.querySelector('.visit-head > .visit-date')
  return [textOf(title, '.last-badge'), ownText(title), textOf(card, '.visit-head > .visit-ago'), textOf(card, ':scope > p.sym') ?? textOf(card, ':scope > p.sym-empty')]
}

function moreOf(root: ParentNode): HTMLButtonElement | null {
  return root.querySelector<HTMLButtonElement>('button.more')
}

describe('detail.js 상세 그리기 (폰)', () => {
  it('AC-1407.5: 상세 화면은 머리([접수 현황] 돌아가기·로고·차트번호·이름·정보·상태·접수 시각·메모)·처방 내역·아래 글이고 문서 제목은 그대로다', () => {
    document.title = '접수 현황'
    const app = appHost()
    const page = view.renderDetail(app, mockupRow(), mockupHistory(), { today: TODAY })
    expect(app.children.length).toBe(1)
    expect(app.firstElementChild).toBe(page)
    expect(page.className).toBe('page detail-page')
    expect(shapeOf(page)).toEqual(['header.top.is-detail', 'main.detail', 'footer.foot'])

    const top = page.querySelector('header.top.is-detail')
    expect(shapeOf(top)).toEqual(['div.top-row', 'div.patient'])
    expect(shapeOf(top?.querySelector('.top-row'))).toEqual(['a.back', 'img.logo-mark'])
    const back = top?.querySelector('.top-row > a.back')
    expect(back?.getAttribute('href')).toBe('#/')
    expect(back?.textContent?.trim()).toBe('접수 현황')
    const logo = top?.querySelector('.top-row > img.logo-mark')
    expect(logo?.getAttribute('src')).toBe('/logo-mark.png')
    expect(logo?.getAttribute('alt')).toBe('양지바른정형외과')

    const patient = top?.querySelector('.patient')
    expect(shapeOf(patient)).toEqual(['div.name-line', 'div.status-line', 'div.memo'])
    expect(shapeOf(patient?.querySelector('.name-line'))).toEqual(['span.chart', 'h1.detail-name', 'span.info'])
    expect(textOf(patient, '.name-line > .chart')).toBe('910234')
    expect(textOf(patient, '.name-line > .detail-name')).toBe('가상환자02')
    expect(textOf(patient, '.name-line > .info')).toBe('54세 · 여 · 재진')
    expect(shapeOf(patient?.querySelector('.status-line'))).toEqual(['span.status.status-wait', 'span'])
    expect(textsOf(patient!, '.status-line > span')).toEqual(['진료대기', '10:42 접수 · 18분째 대기'])
    expect(textOf(patient, ':scope > .memo')).toBe('메모 · 오른쪽 어깨 통증 심해짐')

    expect(textOf(page, 'main.detail > h2.detail-heading')).toBe(HEADING)
    expect(textOf(page, 'footer.foot')).toBe(FOOT)
    // 환자 이름이 폰 방문 기록에 남지 않게 문서 제목은 건드리지 않는다
    expect(document.title).toBe('접수 현황')
  })

  it('AC-1407.5: 상태마다 이름표 모양이 그 상태 것이고, 메모가 없으면 메모 칸이 없고, 못 읽은 칸("")은 그 칸만 비운다', () => {
    const cases: [FakeRow['lane'], string, string][] = [
      ['wait', 'status-wait', '진료대기'],
      ['hold', 'status-hold', '진료보류'],
      ['pay', 'status-pay', '수납대기'],
      ['done', 'status-done', '수납완료'],
    ]
    for (const [lane, cls, label] of cases) {
      const app = appHost()
      view.renderDetail(app, mockupRow({ lane, laneLabel: label, memo: '' }), mockupHistory(), { today: TODAY })
      expect(app.querySelector('.status-line > span.status')?.className, lane).toBe(`status ${cls}`)
      expect(textOf(app, '.status-line > span.status'), lane).toBe(label)
      expect(app.querySelector('.patient > .memo'), lane).toBeNull()
      app.remove()
    }
    const app = appHost()
    view.renderDetail(app, mockupRow({ name: '', info: '', waited: '' }), mockupHistory(), { today: TODAY })
    expect(shapeOf(app.querySelector('.name-line'))).toEqual(['span.chart'])
    expect(textsOf(app, '.status-line > span')).toEqual(['진료대기', '10:42 접수'])
  })

  it('AC-1407.5: 다른 화면(목록)이 있던 자리에 그리면 바꿔 그리고, 환자 글에 <b>를 넣어도 글자로만 보인다', () => {
    const app = appHost()
    board.renderBoard(app, fx.mockupBoard())
    expect(app.querySelector('.page.board')).not.toBeNull()
    const row = mockupRow({ name: '<b>가상환자02</b>', memo: '<img src=x onerror=alert(1)>' })
    const history = mockupHistory({ visits: [{ ...MOCKUP_VISITS[0]!, sym: '<i>밤에 아픔</i>', rx: [rx('<u>체외충격파</u>', 'ESWT7')] }], todaySym: '<s>어깨</s>' })
    view.renderDetail(app, row, history, { today: TODAY })
    expect(app.children.length).toBe(1)
    expect(app.querySelector('.page.board')).toBeNull()
    expect(app.querySelector('b, img:not(.logo-mark), i, u, s')).toBeNull()
    expect(textOf(app, '.detail-name')).toBe('<b>가상환자02</b>')
    expect(textOf(app, '.patient > .memo')).toBe('메모 · <img src=x onerror=alert(1)>')
    expect(textOf(lastOf(app), 'p.sym')).toBe('증상 · <i>밤에 아픔</i>')
    expect(textOf(app, 'section.today > p.sym')).toBe('증상 · <s>어깨</s>')
  })

  it('AC-1404.7: 상세는 제목 "오늘과 지난번 증상"·오늘 카드·지난번 카드 하나·끝 줄뿐이고, 지난번 카드는 답의 첫 지난 내원의 "지난번" 표시·날짜·N일 전·증상 줄이다. 처방 목록·둘째 이후 내원·[더 보기]는 없다', () => {
    const app = appHost()
    const onMore = vi.fn(() => Promise.resolve(pageAt(5, 20, 11)))
    const page = view.renderDetail(app, mockupRow(), mockupHistory(), { today: TODAY, onMore })
    const main = page.querySelector('main.detail')
    expect(shapeOf(main)).toEqual(['h2.detail-heading', 'section.today', 'section.visit.is-last', 'p.end-note'])
    expect(textOf(main, 'h2.detail-heading')).toBe(HEADING)
    const last = lastOf(page)!
    expect(shapeOf(last)).toEqual(['div.visit-head', 'p.sym'])
    expect(shapeOf(last.querySelector('.visit-head'))).toEqual(['h3.visit-date', 'span.visit-ago'])
    expect(shapeOf(last.querySelector('.visit-head > .visit-date'))).toEqual(['span.last-badge'])
    expect(lastCardOf(last)).toEqual(['지난번', '10월 29일', '7일 전', '증상 · 오른쪽 어깨 통증 조금 줄었음, 밤에 아픔'])
    // 지난 처방·둘째 이후 내원·[더 보기]는 그리지 않는다(답에 있어도)
    expect(page.querySelectorAll('section.visit').length).toBe(1)
    expect(page.querySelector('.visits')).toBeNull()
    expect(last.querySelector('ul.rx-list, li.rx-item')).toBeNull()
    expect(moreOf(page)).toBeNull()
    expect(page.textContent).not.toContain('체외충격파')
    expect(page.textContent).not.toContain('10월 22일')
    expect(onMore).not.toHaveBeenCalled()
  })

  it('AC-1404.7: 지난번 내원에 증상 글이 없으면 증상 줄 대신 "적힌 증상이 없어요"이고, 날짜·N일 전은 받은 글 그대로다(다른 해·"오늘")', () => {
    const cases: [FakeVisit, [string | null, string, string | null, string | null]][] = [
      [{ date: '10월 29일', ago: '7일 전', sym: '', rx: [rx('체외충격파', 'ESWT7')] }, ['지난번', '10월 29일', '7일 전', NO_SYM]],
      [{ date: '2024년 3월 12일', ago: '603일 전', sym: '처음 옴', rx: [] }, ['지난번', '2024년 3월 12일', '603일 전', '증상 · 처음 옴']],
      [{ date: '11월 5일', ago: '오늘', sym: '', rx: [] }, ['지난번', '11월 5일', '오늘', NO_SYM]],
    ]
    for (const [visit, want] of cases) {
      const app = appHost()
      view.renderDetail(app, mockupRow(), mockupHistory({ visits: [visit], next: null, more: 0, total: 2 }), { today: TODAY })
      const last = lastOf(app)
      expect(lastCardOf(last), visit.date).toEqual(want)
      expect(shapeOf(last), visit.date).toEqual(['div.visit-head', visit.sym ? 'p.sym' : 'p.sym-empty'])
      app.remove()
    }
  })

  it('AC-1404.3: 끝 줄은 "처음 온 날 YYYY년 M월 D일 · 모두 N번 왔어요"이고, 안 보인 지난 진료가 있어도(next·more) 단추는 없다', () => {
    const app = appHost()
    view.renderDetail(app, mockupRow(), mockupHistory(), { today: TODAY })
    expect(moreOf(app)).toBeNull()
    expect(textOf(app, 'main.detail > p.end-note')).toBe('처음 온 날 2024년 3월 12일 · 모두 37번 왔어요')
    expect(app.querySelector('.no-visits')).toBeNull()
  })

  it('AC-1404.3: 지난 진료가 없으면(첫 방문) 지난번 카드 자리에 "첫 방문이라 지난 진료가 없어요."가 있고 처음 온 날은 오늘, 모두 1번이다', () => {
    const app = appHost()
    const row = mockupRow({ info: '37세 · 남 · 신환', rxLabel: '처방', rx: '첫 방문이라 지난 처방이 없어요', memo: '' })
    view.renderDetail(app, row, { visits: [], next: null, more: 0, first: '2026년 11월 5일', total: 1, todaySym: '' }, { today: TODAY })
    expect(shapeOf(app.querySelector('main.detail'))).toEqual(['h2.detail-heading', 'section.today', 'p.no-visits', 'p.end-note'])
    expect(textOf(app, 'p.no-visits')).toBe(NO_VISITS)
    expect(lastOf(app)).toBeNull()
    expect(moreOf(app)).toBeNull()
    expect(textOf(app, 'p.end-note')).toBe('처음 온 날 2026년 11월 5일 · 모두 1번 왔어요')
  })

  it('AC-1404.8: updateTodaySym은 그린 상세가 그 열쇠 환자면 오늘 카드의 증상 줄만 새 글로 바꾸고(없던 줄은 오늘 처방 앞에 넣음, 새 글이 ""이면 지움), 지난번 카드·머리·오늘 처방은 그대로다', () => {
    const app = appHost()
    const row = mockupRow({ lane: 'pay', laneLabel: '수납대기', rxLabel: '오늘', rx: '체외충격파(ESWT7) · 도수치료 20분(DS20)' })
    view.renderDetail(app, row, mockupHistory({ todaySym: '' }), { today: TODAY })
    const today = app.querySelector('section.today')!
    const last = lastOf(app)
    const patient = app.querySelector('.patient')
    const list = today.querySelector('ul.rx-list')
    expect(shapeOf(today)).toEqual(['div.today-head', 'ul.rx-list'])

    expect(view.updateTodaySym(app, row.k, '오른쪽 어깨 통증 심해짐')).toBe(true)
    expect(app.querySelector('section.today')).toBe(today)
    expect(shapeOf(today)).toEqual(['div.today-head', 'p.sym', 'ul.rx-list'])
    expect(textOf(today, 'p.sym')).toBe('증상 · 오른쪽 어깨 통증 심해짐')
    expect(today.querySelector('ul.rx-list')).toBe(list)

    expect(view.updateTodaySym(app, row.k, '<b>밤에 더 아픔</b>')).toBe(true)
    expect(today.querySelectorAll('p.sym').length).toBe(1)
    expect(textOf(today, 'p.sym')).toBe('증상 · <b>밤에 더 아픔</b>')
    expect(today.querySelector('b')).toBeNull()

    expect(view.updateTodaySym(app, row.k, '')).toBe(true)
    expect(shapeOf(today)).toEqual(['div.today-head', 'ul.rx-list'])
    expect(lastOf(app)).toBe(last)
    expect(app.querySelector('.patient')).toBe(patient)
    expect(lastCardOf(last)).toEqual(['지난번', '10월 29일', '7일 전', '증상 · 오른쪽 어깨 통증 조금 줄었음, 밤에 아픔'])

    // 오늘 처방이 없으면 "아직 처방이 없어요" 뒤에 붙는다
    const empty = appHost()
    view.renderDetail(empty, mockupRow({ k: fx.fakeKey(5) }), mockupHistory(), { today: TODAY })
    expect(view.updateTodaySym(empty, fx.fakeKey(5), '왼쪽 무릎')).toBe(true)
    expect(shapeOf(empty.querySelector('section.today'))).toEqual(['div.today-head', 'p.today-empty', 'p.sym'])
  })

  it('AC-1404.8: 다른 환자 열쇠이거나 그린 상세가 없으면 updateTodaySym은 아무것도 바꾸지 않는다(false)', () => {
    const app = appHost()
    view.renderDetail(app, mockupRow(), mockupHistory({ todaySym: '오른쪽 어깨 통증 심해짐' }), { today: TODAY })
    expect(view.updateTodaySym(app, fx.fakeKey(9), '다른 환자 증상')).toBe(false)
    expect(textOf(app, 'section.today > p.sym')).toBe('증상 · 오른쪽 어깨 통증 심해짐')
    expect(view.updateTodaySym(appHost(), fx.fakeKey(2), '빈 자리')).toBe(false)
    expect(document.body.textContent).not.toContain('빈 자리')
  })

  it('AC-1404.4: 오늘 카드 제목은 "M월 D일 · 오늘"(시안: [오늘] 이름표 + 날짜)이고, 오른쪽 이름표는 진료대기 "진료 전"·진료보류 "진료보류"·수납대기 "수납대기"·끝남 "수납완료"이다', () => {
    const cases: [FakeRow['lane'], string][] = [
      ['wait', '진료 전'],
      ['hold', '진료보류'],
      ['pay', '수납대기'],
      ['done', '수납완료'],
    ]
    for (const [lane, label] of cases) {
      const app = appHost()
      view.renderDetail(app, mockupRow({ lane, laneLabel: fx.fakeRow({ lane }).laneLabel }), mockupHistory(), { today: TODAY })
      const today = app.querySelector('main.detail > section.today')
      expect(shapeOf(today?.querySelector('.today-head')), lane).toEqual(['h3.today-date', 'span.today-state'])
      const title = today?.querySelector('.today-head > h3.today-date')
      expect(title?.getAttribute('aria-label'), lane).toBe('11월 5일 · 오늘')
      expect(shapeOf(title), lane).toEqual(['span.today-badge'])
      expect(textOf(title, '.today-badge'), lane).toBe('오늘')
      expect(ownText(title), lane).toBe('11월 5일')
      expect(textOf(today, '.today-head > .today-state'), lane).toBe(label)
      app.remove()
    }
    // 제목 날짜는 오늘 날을 따른다(1월 1일·12월 31일)
    for (const [day, title] of [
      [new Date(2027, 0, 1, 9, 0), '1월 1일 · 오늘'],
      [new Date(2026, 11, 31, 18, 30), '12월 31일 · 오늘'],
    ] as const) {
      const app = appHost()
      view.renderDetail(app, mockupRow(), mockupHistory(), { today: day })
      expect(app.querySelector('h3.today-date')?.getAttribute('aria-label')).toBe(title)
      app.remove()
    }
  })

  it('AC-1404.4: 오늘 처방이 없으면 "아직 처방이 없어요. 진료가 끝나면 여기에 나와요."이고, 오늘 증상이 있으면 "증상 · …"이 붙는다', () => {
    for (const rxLabel of ['지난번', '처방']) {
      const app = appHost()
      view.renderDetail(app, mockupRow({ rxLabel }), mockupHistory(), { today: TODAY })
      const today = app.querySelector('section.today')
      expect(shapeOf(today), rxLabel).toEqual(['div.today-head', 'p.today-empty'])
      expect(textOf(today, 'p.today-empty'), rxLabel).toBe(NO_TODAY_RX)
      app.remove()
    }
    const app = appHost()
    view.renderDetail(app, mockupRow(), mockupHistory({ todaySym: '오른쪽 어깨 통증 심해짐' }), { today: TODAY })
    const today = app.querySelector('section.today')
    expect(shapeOf(today)).toEqual(['div.today-head', 'p.today-empty', 'p.sym'])
    expect(textOf(today, 'p.sym')).toBe('증상 · 오른쪽 어깨 통증 심해짐')
  })

  it('AC-1404.4: 오늘 처방이 있으면(줄의 이름표 "오늘") 처방 목록(이름 + "(코드)", 이름 없는 코드는 코드만)이 오늘 증상 뒤에 있다', () => {
    const app = appHost()
    const row = mockupRow({ lane: 'pay', laneLabel: '수납대기', rxLabel: '오늘', rx: '체외충격파(ESWT7) · 주사(관절)(INJ1) · XR2' })
    view.renderDetail(app, row, mockupHistory({ todaySym: '왼쪽 무릎 통증 계속됨' }), { today: TODAY })
    const today = app.querySelector('section.today')
    expect(shapeOf(today)).toEqual(['div.today-head', 'p.sym', 'ul.rx-list'])
    expect(textsOf(today!, 'ul.rx-list > li.rx-item')).toEqual(['체외충격파(ESWT7)', '주사(관절)(INJ1)', 'XR2'])
    const items = [...today!.querySelectorAll('li.rx-item')]
    expect(items.map((li) => [ownText(li), textOf(li, '.rx-code')])).toEqual([
      ['체외충격파', '(ESWT7)'],
      ['주사(관절)', '(INJ1)'],
      ['XR2', null],
    ])
    expect(textOf(today, '.today-state')).toBe('수납대기')
  })

  it('AC-1404.4: 접수 현황 자료가 바뀌면 updateDetail이 오늘 카드(이름표·오늘 처방)와 머리(상태·기다린 글·메모)를 바꾸고 지난번 카드·오늘 증상은 그대로 둔다. 다른 환자 줄이면 바꾸지 않는다', () => {
    const app = appHost()
    view.renderDetail(app, mockupRow(), mockupHistory({ todaySym: '오른쪽 어깨 통증 심해짐' }), { today: TODAY })
    const last = lastOf(app)

    const paid = mockupRow({ lane: 'pay', laneLabel: '수납대기', waited: '수납 3분째', memo: '', rxLabel: '오늘', rx: '체외충격파(ESWT7) · 도수치료 20분(DS20)' })
    expect(view.updateDetail(app, paid, { today: TODAY })).toBe(true)
    const today = app.querySelector('section.today')
    expect(textOf(today, '.today-state')).toBe('수납대기')
    expect(shapeOf(today)).toEqual(['div.today-head', 'p.sym', 'ul.rx-list'])
    expect(textOf(today, 'p.sym')).toBe('증상 · 오른쪽 어깨 통증 심해짐')
    expect(textsOf(today!, 'li.rx-item')).toEqual(['체외충격파(ESWT7)', '도수치료 20분(DS20)'])
    expect(app.querySelector('.status-line > span.status')?.className).toBe('status status-pay')
    expect(textsOf(app, '.status-line > span')).toEqual(['수납대기', '10:42 접수 · 수납 3분째'])
    expect(app.querySelector('.patient > .memo')).toBeNull()
    expect(lastOf(app)).toBe(last)
    expect(app.querySelectorAll('section.today').length).toBe(1)

    const other = mockupRow({ k: fx.fakeKey(9), name: '가상환자09', lane: 'done', laneLabel: '수납완료' })
    expect(view.updateDetail(app, other, { today: TODAY })).toBe(false)
    expect(textOf(app, '.detail-name')).toBe('가상환자02')
    expect(textOf(app, '.today-state')).toBe('수납대기')
    // 상세가 없는 자리
    expect(view.updateDetail(appHost(), paid, { today: TODAY })).toBe(false)
  })
})

describe('detail.js 상세 그리기 (태블릿 오른쪽 칸)', () => {
  it('AC-1409.1: detailPane은 태블릿 오른쪽 칸의 내용(환자 칸·제목·오늘 카드·지난번 카드·끝 줄, AC-1404.7)이고 돌아가기·머리·아래 글·[더 보기]는 없다', () => {
    const nodes = view.detailPane(mockupRow(), mockupHistory(), { today: TODAY })
    expect(nodes.map((n) => (n instanceof Element ? `${n.tagName.toLowerCase()}.${n.className.split(' ').join('.')}` : '#text'))).toEqual([
      'div.patient',
      'h3.detail-heading',
      'section.today',
      'section.visit.is-last',
      'p.end-note',
    ])
    const patient = nodes[0] as Element
    expect(shapeOf(patient.querySelector('.name-line'))).toEqual(['span.chart', 'h2.detail-name', 'span.info'])
    expect(nodes[1]?.textContent?.trim()).toBe(HEADING)
    expect(shapeOf((nodes[2] as Element).querySelector('.today-head'))).toEqual(['h4.today-date', 'span.today-state'])
    expect(shapeOf((nodes[3] as Element).querySelector('.visit-head'))).toEqual(['h4.visit-date', 'span.visit-ago'])
    expect(lastCardOf(nodes[3] as Element)).toEqual(['지난번', '10월 29일', '7일 전', '증상 · 오른쪽 어깨 통증 조금 줄었음, 밤에 아픔'])
    expect(nodes.some((n) => n instanceof Element && (n.matches('a.back, header, footer, button.more') || n.querySelector('a.back, header, footer, button.more')))).toBe(false)
  })

  it('AC-1409.3: 목록 오른쪽 칸(fillPane)에 넣으면 updateDetail(#app)이 오른쪽 칸의 오늘 카드를, updateTodaySym이 오늘 증상 줄만 바꾸고 지난번 카드는 그대로다', () => {
    const app = appHost()
    const fake = fx.mockupBoard()
    const row = fake.lists.wait[1]!
    board.renderBoard(app, fake, { tablet: true, picked: row.k })
    board.fillPane(app, view.detailPane(row, mockupHistory(), { today: TODAY }))
    const pane = app.querySelector('.page.board > aside.pane')!
    expect(shapeOf(pane)).toEqual(['div.patient', 'h3.detail-heading', 'section.today', 'section.visit.is-last', 'p.end-note', 'p.pane-foot'])
    expect(textOf(pane, '.detail-name')).toBe('가상환자02')
    const last = lastOf(pane)

    expect(view.updateDetail(app, { ...row, lane: 'hold', laneLabel: '진료보류', waited: '보류 3분째', rxLabel: '오늘', rx: '엑스레이 촬영(XR2)' }, { today: TODAY })).toBe(true)
    expect(textOf(pane, '.today-state')).toBe('진료보류')
    expect(textsOf(pane, 'section.today li.rx-item')).toEqual(['엑스레이 촬영(XR2)'])
    expect(shapeOf(pane.querySelector('.today-head'))).toEqual(['h4.today-date', 'span.today-state'])

    expect(view.updateTodaySym(app, row.k, '어깨 다시 아픔')).toBe(true)
    expect(shapeOf(pane.querySelector('section.today'))).toEqual(['div.today-head', 'p.sym', 'ul.rx-list'])
    expect(textOf(pane, 'section.today > p.sym')).toBe('증상 · 어깨 다시 아픔')
    expect(lastOf(pane)).toBe(last)
  })
})
