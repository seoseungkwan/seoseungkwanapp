// @vitest-environment jsdom
// 상세 그리기 detail.js (TASK-19·TASK-36, reception-paper TASK-3, REQ-1407·REQ-1404·REQ-1502). 머리(차트번호·이름·정보·상태·메모) 아래
// 제목 "오늘 진료기록부"와 종이 카드(승인 목업 Paper.html: 비트가 인쇄하는 외래진료기록부 모양 — 사람 칸·특이사항 상자·<내원내역>·<증상>·<상병>·
// <처방>·<원외처방>), 제목 "지난번 증상"과 '지난번' 카드 하나(AC-1404.7 그대로), 끝 줄. 종이 카드 바꾸기(updatePaper, AC-1502.4).
// 상세 자료는 도우미 GET /api/visit/{k}/history 답(HistoryBuilder.cs ToJson, from=0이면 paper가 붙음)의 모양이고,
// 종이 카드의 차트번호·수진자명·신환/재진·칸은 목록 줄로 그린다. 자료는 가짜다(가상환자NN, 9로 시작하는 6자리 차트번호, 지어낸 처방·상병)
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

/** 종이 기록부 상병 한 줄 (reception-paper design.md 2절) */
interface FakeDx {
  code: string
  name: string
  main: boolean
}

/** 종이 기록부 처방·원외처방 한 줄 */
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
  dx: FakeDx[]
  rx: FakeOrder[]
  out: FakeOrder[]
}

/** GET /api/visit/{k}/history?from=0 200 답 (design.md 5절 + reception-paper design.md 2절) */
interface FakeHistory {
  visits: FakeVisit[]
  next: number | null
  more: number
  first: string
  total: number
  todaySym: string
  paper: FakePaper
}

interface DetailOptions {
  today?: Date
  onMore?: (next: number) => unknown
}

interface DetailJs {
  renderDetail: (host: HTMLElement, row: FakeRow, history: FakeHistory, options?: DetailOptions) => HTMLElement
  detailPane: (row: FakeRow, history: FakeHistory, options?: DetailOptions) => Node[]
  updateDetail: (host: ParentNode, row: FakeRow, options?: DetailOptions) => boolean
  updatePaper: (host: ParentNode, k: string, paper: FakePaper) => boolean
  fitSpecial: (host: ParentNode) => void
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
    updatePaper: () => false,
    fitSpecial: () => {},
  }
  const loaded = ((await import(/* @vite-ignore */ DETAIL_JS).catch(() => missing)) ?? missing) as Partial<DetailJs>
  view = { ...missing, ...loaded }
  board = (await import(/* @vite-ignore */ BOARD_JS)) as BoardJs
})

afterEach(() => {
  document.body.replaceChildren()
  document.title = ''
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollHeight')
  Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight')
  vi.useRealTimers()
})

/** 오늘(시험 기준): 2026년 11월 5일 */
const TODAY = new Date(2026, 10, 5, 13, 42, 10)
const FOOT = '보기만 할 수 있어요 · 비트 자료는 바뀌지 않아요'
const PAPER_HEADING = '오늘 진료기록부'
const LAST_HEADING = '지난번 증상'
const NO_VISITS = '첫 방문이라 지난 진료가 없어요.'
const NO_SYM = '적힌 증상이 없어요'
const NONE = '없어요'
const NO_SPECIAL = '적힌 특이사항이 없어요'
const BEFORE_HEAD = '증상 · 상병 · 처방'
const BEFORE = '아직 없어요. 진료가 끝나면 여기에 나와요.'
const UNFOLD = '전부 보기 ▾'
const FOLD = '접기 ▴'
/** 종이 사람 칸 이름(목업: 주·소, 전·화 사이는 빈칸 넷) */
const KV_LABELS = ['차트번호', '수진자명', '주민등록', '주    소', '전    화', '이동전화']
const EMPTY = '—'

const rx = (name: string, code: string): FakeRx => ({ name, code })
const order = (code: string, name: string, qty = '1', tms = '1', day = '1'): FakeOrder => ({ code, name, qty, tms, day })

/** 승인 시안(Detail.dc.html)의 지난 진료 5번 */
const MOCKUP_VISITS: FakeVisit[] = [
  { date: '10월 29일', ago: '7일 전', sym: '오른쪽 어깨 통증 조금 줄었음, 밤에 아픔', rx: [rx('체외충격파', 'ESWT7'), rx('도수치료 20분', 'DS20')] },
  { date: '10월 22일', ago: '14일 전', sym: '오른쪽 어깨 통증, 팔 올릴 때 아픔', rx: [rx('체외충격파', 'ESWT7'), rx('표층열치료', 'PT01')] },
  { date: '10월 15일', ago: '21일 전', sym: '어깨·목 뻐근함', rx: [rx('도수치료 20분', 'DS20'), rx('간섭파치료', 'PT03'), rx('표층열치료', 'PT01')] },
  { date: '10월 8일', ago: '28일 전', sym: '오른쪽 어깨 통증 2주째, 1주 뒤 다시 봄', rx: [rx('엑스레이 촬영', 'XR2'), rx('주사', 'INJ1')] },
  { date: '9월 30일', ago: '36일 전', sym: '오른쪽 어깨 통증 처음 옴', rx: [rx('엑스레이 촬영', 'XR2'), rx('표층열치료', 'PT01')] },
]

/** 목업 ②처럼 진료 전 환자의 종이 자료: 사람 칸·특이사항·진료실·보험은 있고 증상·상병·처방은 아직 없다(지어낸 가짜) */
function blankPaper(over: Partial<FakePaper> = {}): FakePaper {
  return {
    res: '720304-*******',
    addr: '가상시 가상구 예시로 12 (가상맨션)',
    tel: '031-000-0000',
    cel: '010-0000-1234',
    special: '가상 특이사항: 와파린 복용(주사 시 지혈 오래)',
    room: '1진료실',
    ins: '국민건강보험',
    sym: '',
    dx: [],
    rx: [],
    out: [],
    ...over,
  }
}

/** 목업 ①·③처럼 진료가 끝난 날: 증상 여러 줄(빈 줄 포함)·주상병·처방·원외처방 */
function treatedPaper(over: Partial<FakePaper> = {}): FakePaper {
  return blankPaper({
    sym: '양쪽 허벅지 당김\n→ 가상 방사통으로 보임\n\n가상 주사 1차',
    dx: [
      { code: 'M5436', name: '가상 좌골신경통', main: true },
      { code: 'M5456', name: '가상 허리 긴장', main: false },
    ],
    rx: [order('LA358', '가상 신경차단'), order('LA272', '가상 말초차단', '2.5'), order('carm1', '가상 c-arm 가이드', '0.1')],
    out: [order('641901140', '가상정200mg', '1', '2', '7'), order('645102100', '가상정50mg', '1', '3', '7')],
    ...over,
  })
}

/** 시안의 첫 쪽: 지난 진료 36번 중 처음 5번, 31번 더, 처음 온 날 2024년 3월 12일, 모두 37번. 종이는 진료 전 */
function mockupHistory(over: Partial<FakeHistory> = {}): FakeHistory {
  return { visits: MOCKUP_VISITS, next: 5, more: 31, first: '2024년 3월 12일', total: 37, todaySym: '', paper: blankPaper(), ...over }
}

/** [더 보기]가 받는 다음 쪽: from번째부터 count번. i번째 내원은 날짜·N일 전 글로 알아볼 수 있다 */
function pageAt(from: number, count: number, rest: number): FakeHistory {
  const visits = Array.from({ length: count }, (_, j) => {
    const i = from + j
    return { date: `2025년 ${(i % 12) + 1}월 ${(i % 27) + 1}일`, ago: `${40 + i * 7}일 전`, sym: `가상 증상 ${i}`, rx: [rx('체외충격파', 'ESWT7')] }
  })
  return { visits, next: rest > 0 ? from + count : null, more: rest, first: '2024년 3월 12일', total: 37, todaySym: '', paper: blankPaper() }
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

/** 진료가 끝나 수납대기로 온 줄 */
function paidRow(over: Partial<FakeRow> = {}): FakeRow {
  return mockupRow({ lane: 'pay', laneLabel: '수납대기', waited: '수납 3분째', rxLabel: '오늘', rx: '가상 신경차단(LA358)', ...over })
}

/** 특이사항 n줄: "가상 특이사항 1" … */
function specialLines(n: number): string {
  return Array.from({ length: n }, (_, i) => `가상 특이사항 ${i + 1}`).join('\n')
}

/** 한 줄에 그려지는 글자 수와 줄 높이(가짜). 브라우저처럼 긴 줄은 접혀 여러 줄이 된다 */
const LINE_CHARS = 20
const LINE_PX = 20

/**
 * jsdom은 모양을 그리지 않아 높이가 늘 0이다. 그린 높이를 흉내 낸다: 글의 줄마다 LINE_CHARS 글자씩 접어 센 줄 수 × LINE_PX가
 * 전체 높이(scrollHeight)이고, 5줄 자름(.clamp, style.css line-clamp 5)이면 보이는 높이(clientHeight)는 5줄까지다
 */
function fakeHeights() {
  const lines = (node: Element) =>
    (node.textContent ?? '').split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / LINE_CHARS)), 0)
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return lines(this) * LINE_PX
    },
  })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return (this.classList.contains('clamp') ? Math.min(lines(this), 5) : lines(this)) * LINE_PX
    },
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

function textsOf(root: ParentNode | null | undefined, selector: string): string[] {
  return [...(root?.querySelectorAll(selector) ?? [])].map((n) => n.textContent?.trim() ?? '')
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

/** 지난 진료 [더 보기] 단추 (그리지 않는다, AC-1404.7) */
function moreOf(root: ParentNode): HTMLButtonElement | null {
  return root.querySelector<HTMLButtonElement>('button.more')
}

/** 종이 카드 (AC-1502.1) */
function paperOf(root: ParentNode | null | undefined): HTMLElement | null {
  return root?.querySelector<HTMLElement>('article.paper') ?? null
}

/** 사람 칸 [이름, 값] 줄들 */
function kvOf(card: Element | null): [string, string][] {
  const dts = [...(card?.querySelectorAll(':scope > dl.kv > dt') ?? [])]
  return dts.map((dt) => [dt.textContent ?? '', dt.nextElementSibling?.textContent?.trim() ?? ''])
}

/** 진료 칸(증상~원외처방 자리)의 칸 제목들 */
function bodyHeads(card: Element | null): string[] {
  return textsOf(card?.querySelector(':scope > .paper-body'), ':scope > .sec > .sec-h')
}

/** 진료 칸의 각 칸에서 '없어요' 글(.none)들 */
function bodyNones(card: Element | null): string[] {
  return textsOf(card?.querySelector(':scope > .paper-body'), ':scope > .sec > .none')
}

/** 처방 표 줄들 [코드, 명칭, 용량, 횟수, 일수] */
function ordersOf(section: Element | null | undefined): string[][] {
  return [...(section?.querySelectorAll('table.rx > tbody > tr') ?? [])].map((tr) => [...tr.children].map((td) => td.textContent?.trim() ?? ''))
}

/** 진료 칸에서 제목이 head인 칸 */
function sectionOf(card: Element | null, head: string): Element | null {
  return [...(card?.querySelectorAll(':scope > .paper-body > .sec') ?? [])].find((s) => textOf(s, ':scope > .sec-h') === head) ?? null
}

function specialOf(root: ParentNode | null | undefined) {
  const box = root?.querySelector<HTMLElement>('article.paper > .spc') ?? null
  return {
    box,
    text: box?.querySelector<HTMLElement>(':scope > p.spc-text') ?? null,
    button: box?.querySelector<HTMLButtonElement>(':scope > button.spc-more') ?? null,
  }
}

describe('detail.js 상세 그리기 (폰)', () => {
  it('AC-1407.5: 상세 화면은 머리([접수 현황] 돌아가기·로고·차트번호·이름·정보·상태·접수 시각·메모)·종이 기록부·아래 글이고 문서 제목은 그대로다', () => {
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

    expect(textOf(page, 'main.detail > h2.detail-heading')).toBe(PAPER_HEADING)
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

  it('AC-1407.5 · AC-1502.4: 다른 화면(목록)이 있던 자리에 그리면 바꿔 그리고, 환자 글(줄·지난번·종이 칸 모두)에 HTML을 넣어도 글자로만 보인다', () => {
    const app = appHost()
    board.renderBoard(app, fx.mockupBoard())
    expect(app.querySelector('.page.board')).not.toBeNull()
    const row = mockupRow({ name: '<b>가상환자02</b>', memo: '<img src=x onerror=alert(1)>', lane: 'pay', laneLabel: '수납대기' })
    const paper = treatedPaper({
      special: '<b>굵은 특이사항</b>',
      addr: '<img src=x onerror=alert(2)>',
      room: '<em>1진료실</em>',
      sym: '<i>밤에</i>\n<script>아픔</script>',
      dx: [{ code: '<u>M54</u>', name: '<u>가상 병</u>', main: true }],
      rx: [order('<s>LA358</s>', '<s>가상 약</s>', '<b>1</b>')],
    })
    const history = mockupHistory({ visits: [{ ...MOCKUP_VISITS[0]!, sym: '<i>밤에 아픔</i>', rx: [rx('<u>체외충격파</u>', 'ESWT7')] }], paper })
    view.renderDetail(app, row, history, { today: TODAY })
    expect(app.children.length).toBe(1)
    expect(app.querySelector('.page.board')).toBeNull()
    expect(app.querySelector('b, img:not(.logo-mark), i, u, s, em, script')).toBeNull()
    expect(textOf(app, '.detail-name')).toBe('<b>가상환자02</b>')
    expect(textOf(app, '.patient > .memo')).toBe('메모 · <img src=x onerror=alert(1)>')
    expect(textOf(lastOf(app), 'p.sym')).toBe('증상 · <i>밤에 아픔</i>')
    const card = paperOf(app)
    expect(specialOf(app).text?.textContent).toBe('<b>굵은 특이사항</b>')
    expect(kvOf(card)[1]).toEqual([KV_LABELS[1], '<b>가상환자02</b> (F/54)'])
    expect(kvOf(card)[3]).toEqual([KV_LABELS[3], '<img src=x onerror=alert(2)>'])
    expect(card?.querySelector('.paper-sym pre')?.textContent).toBe('<i>밤에</i>\n<script>아픔</script>')
    expect(textsOf(card, '.visit-line > span')).toEqual(['내원 : 20261105', '<em>1진료실</em>', '국민건강보험(재진)'])
    expect(textsOf(card, 'ul.dx > li > *')).toEqual(['<u>M54</u>', '<u>가상 병</u>'])
    expect(ordersOf(sectionOf(card, '처방'))).toEqual([['<s>LA358</s>', '<s>가상 약</s>', '<b>1</b>', '1', '1']])
  })

  it('AC-1404.7 · AC-1502.1: 상세는 제목 "오늘 진료기록부"·종이 카드·제목 "지난번 증상"·지난번 카드 하나·끝 줄뿐이다(오늘 카드 없음). 지난번 카드는 답의 첫 지난 내원의 "지난번" 표시·날짜·N일 전·증상 줄이고 처방 목록·둘째 이후 내원·[더 보기]는 없다', () => {
    const app = appHost()
    const onMore = vi.fn(() => Promise.resolve(pageAt(5, 20, 11)))
    const page = view.renderDetail(app, mockupRow(), mockupHistory(), { today: TODAY, onMore })
    const main = page.querySelector('main.detail')
    expect(shapeOf(main)).toEqual(['h2.detail-heading', 'article.paper', 'h2.detail-heading', 'section.visit.is-last', 'p.end-note'])
    expect(textsOf(main, ':scope > h2.detail-heading')).toEqual([PAPER_HEADING, LAST_HEADING])
    expect(page.querySelector('section.today')).toBeNull()
    const last = lastOf(page)!
    expect(shapeOf(last)).toEqual(['div.visit-head', 'p.sym'])
    expect(shapeOf(last.querySelector('.visit-head'))).toEqual(['h3.visit-date', 'span.visit-ago'])
    expect(shapeOf(last.querySelector('.visit-head > .visit-date'))).toEqual(['span.last-badge'])
    expect(lastCardOf(last)).toEqual(['지난번', '10월 29일', '7일 전', '증상 · 오른쪽 어깨 통증 조금 줄었음, 밤에 아픔'])
    // 지난 처방·둘째 이후 내원·[더 보기]는 그리지 않는다(답에 있어도)
    expect(page.querySelectorAll('section.visit').length).toBe(1)
    expect(page.querySelector('.visits')).toBeNull()
    expect(last.querySelector('ul.rx-list, li.rx-item, table')).toBeNull()
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

  it('AC-1404.3 · AC-1502.1: 지난 진료가 없으면(첫 방문) "지난번 증상" 아래 "첫 방문이라 지난 진료가 없어요."가 있고 처음 온 날은 오늘, 모두 1번이다', () => {
    const app = appHost()
    const row = mockupRow({ info: '37세 · 남 · 신환', rxLabel: '처방', rx: '첫 방문이라 지난 처방이 없어요', memo: '' })
    view.renderDetail(app, row, { visits: [], next: null, more: 0, first: '2026년 11월 5일', total: 1, todaySym: '', paper: blankPaper() }, { today: TODAY })
    expect(shapeOf(app.querySelector('main.detail'))).toEqual(['h2.detail-heading', 'article.paper', 'h2.detail-heading', 'p.no-visits', 'p.end-note'])
    expect(textsOf(app, 'main.detail > h2.detail-heading')).toEqual([PAPER_HEADING, LAST_HEADING])
    expect(textOf(app, 'p.no-visits')).toBe(NO_VISITS)
    expect(lastOf(app)).toBeNull()
    expect(moreOf(app)).toBeNull()
    expect(textOf(app, 'p.end-note')).toBe('처음 온 날 2026년 11월 5일 · 모두 1번 왔어요')
  })

  it('AC-1502.1: 종이 카드는 목업 차례대로 머리글 "외래진료기록부"·오늘 날짜, 사람 칸(차트번호·수진자명 "이름 (F/나이)"·주민등록·주소·전화·이동전화), 특이사항 상자, <내원내역>, <증상>(날짜·줄 바꿈 그대로)·<상병>(주상병 표시)·<처방>·<원외처방> 표다', () => {
    const app = appHost()
    view.renderDetail(app, paidRow(), mockupHistory({ paper: treatedPaper() }), { today: TODAY })
    const card = paperOf(app)!
    expect(shapeOf(card)).toEqual(['div.paper-head', 'dl.kv', 'hr.rule', 'div.spc', 'div.sec', 'div.paper-body'])
    expect(shapeOf(card.querySelector('.paper-head'))).toEqual(['span.paper-title', 'span.paper-date'])
    expect(textsOf(card, '.paper-head > span')).toEqual(['외래진료기록부', '2026-11-05'])
    expect(kvOf(card)).toEqual([
      [KV_LABELS[0], '910234'],
      [KV_LABELS[1], '가상환자02 (F/54)'],
      [KV_LABELS[2], '720304-*******'],
      [KV_LABELS[3], '가상시 가상구 예시로 12 (가상맨션)'],
      [KV_LABELS[4], '031-000-0000'],
      [KV_LABELS[5], '010-0000-1234'],
    ])
    expect(card.querySelector('dl.kv .empty')).toBeNull()

    const spc = specialOf(app)
    expect(spc.box?.className).toBe('spc')
    expect(textOf(spc.box, ':scope > .sec-h')).toBe('특이사항')
    expect(spc.text?.textContent).toBe('가상 특이사항: 와파린 복용(주사 시 지혈 오래)')

    const visit = card.querySelector(':scope > .sec')
    expect(shapeOf(visit)).toEqual(['div.sec-h', 'div.visit-line'])
    expect(textOf(visit, ':scope > .sec-h')).toBe('내원내역')
    expect(textsOf(visit, '.visit-line > span')).toEqual(['내원 : 20261105', '1진료실', '국민건강보험(재진)'])

    expect(bodyHeads(card)).toEqual(['증상', '상병', '처방', '원외처방'])
    const sym = sectionOf(card, '증상')
    expect(shapeOf(sym?.querySelector('.paper-sym'))).toEqual(['span.paper-sym-day', 'pre'])
    expect(textOf(sym, '.paper-sym-day')).toBe('20261105')
    // 줄 바꿈·빈 줄은 받은 그대로다(모양은 pre-wrap)
    expect(sym?.querySelector('.paper-sym > pre')?.textContent).toBe('양쪽 허벅지 당김\n→ 가상 방사통으로 보임\n\n가상 주사 1차')

    const dx = [...(sectionOf(card, '상병')?.querySelectorAll('ul.dx > li') ?? [])]
    expect(dx.map((li) => [textOf(li, 'code'), textOf(li, 'span'), li.querySelector('code')?.classList.contains('main')])).toEqual([
      ['M5436', '가상 좌골신경통', true],
      ['M5456', '가상 허리 긴장', false],
    ])

    for (const head of ['처방', '원외처방']) {
      const table = sectionOf(card, head)?.querySelector('table.rx')
      expect(textsOf(table, 'thead th'), head).toEqual(['코드', '명칭', '용량', '횟수', '일수'])
      expect([...(table?.querySelectorAll('thead th') ?? [])].map((th) => th.className), head).toEqual(['', '', 'n', 'n', 'n'])
      expect(table?.querySelectorAll('tbody td.c > code').length, head).toBe(table?.querySelectorAll('tbody tr').length)
    }
    expect(ordersOf(sectionOf(card, '처방'))).toEqual([
      ['LA358', '가상 신경차단', '1', '1', '1'],
      ['LA272', '가상 말초차단', '2.5', '1', '1'],
      ['carm1', '가상 c-arm 가이드', '0.1', '1', '1'],
    ])
    expect(ordersOf(sectionOf(card, '원외처방'))).toEqual([
      ['641901140', '가상정200mg', '1', '2', '7'],
      ['645102100', '가상정50mg', '1', '3', '7'],
    ])
    expect(bodyNones(card)).toEqual([])
  })

  it('AC-1502.1: 수진자명은 줄의 이름·성별(남 M·여 F)·나이이고 모르는 값은 뺀다. 빈 값은 "—"이고, <내원내역> 보험 뒤에는 줄의 신환·재진이 붙는다', () => {
    const cases: [Partial<FakeRow>, string, string][] = [
      [{ name: '가상환자01', info: '37세 · 남 · 신환' }, '가상환자01 (M/37)', '국민건강보험(신환)'],
      [{ info: '여 · 재진' }, '가상환자02 (F)', '국민건강보험(재진)'],
      [{ info: '54세 · 재진' }, '가상환자02 (54)', '국민건강보험(재진)'],
      [{ info: '재진' }, '가상환자02', '국민건강보험(재진)'],
      [{ info: '' }, '가상환자02', '국민건강보험'],
    ]
    for (const [over, who, ins] of cases) {
      const app = appHost()
      view.renderDetail(app, mockupRow(over), mockupHistory(), { today: TODAY })
      expect(kvOf(paperOf(app))[1], over.info).toEqual([KV_LABELS[1], who])
      expect(textsOf(paperOf(app), '.visit-line > span').at(-1), over.info).toBe(ins)
      app.remove()
    }

    // 이름·주민번호·주소·전화를 못 읽었으면 "—", 진료실·보험이 비면 그 글만 없다
    const app = appHost()
    view.renderDetail(app, mockupRow({ name: '' }), mockupHistory({ paper: blankPaper({ res: '', addr: '', tel: '', cel: '', room: '', ins: '' }) }), { today: TODAY })
    const card = paperOf(app)
    expect(kvOf(card)).toEqual([
      [KV_LABELS[0], '910234'],
      [KV_LABELS[1], EMPTY],
      [KV_LABELS[2], EMPTY],
      [KV_LABELS[3], EMPTY],
      [KV_LABELS[4], EMPTY],
      [KV_LABELS[5], EMPTY],
    ])
    expect(card?.querySelectorAll('dl.kv > dd > span.empty').length).toBe(5)
    expect(textsOf(card, '.visit-line > span')).toEqual(['내원 : 20261105', '재진'])
  })

  it('AC-1502.1: 종이 날짜(머리글 YYYY-MM-DD·내원 YYYYMMDD·증상 날짜)는 오늘 날을 따르고, options.today가 없으면 기기 날짜다', () => {
    for (const [day, dashed, compact] of [
      [new Date(2027, 0, 1, 9, 0), '2027-01-01', '20270101'],
      [new Date(2026, 11, 31, 18, 30), '2026-12-31', '20261231'],
    ] as const) {
      const app = appHost()
      view.renderDetail(app, paidRow(), mockupHistory({ paper: treatedPaper() }), { today: day })
      expect(textOf(paperOf(app), '.paper-date')).toBe(dashed)
      expect(textsOf(paperOf(app), '.visit-line > span')[0]).toBe(`내원 : ${compact}`)
      expect(textOf(paperOf(app), '.paper-sym-day')).toBe(compact)
      app.remove()
    }
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 9, 8, 15))
    const app = appHost()
    view.renderDetail(app, mockupRow(), mockupHistory())
    expect(textOf(paperOf(app), '.paper-date')).toBe('2026-03-09')
    expect(textsOf(paperOf(app), '.visit-line > span')[0]).toBe('내원 : 20260309')
  })

  it('AC-1502.3: 진료대기·진료보류 줄이고 증상·상병·처방·원외처방이 모두 비었으면 그 자리에 <증상 · 상병 · 처방> "아직 없어요. 진료가 끝나면 여기에 나와요." 한 줄뿐이다', () => {
    for (const lane of ['wait', 'hold'] as const) {
      const app = appHost()
      view.renderDetail(app, mockupRow({ lane, laneLabel: fx.fakeRow({ lane }).laneLabel }), mockupHistory(), { today: TODAY })
      const body = paperOf(app)?.querySelector(':scope > .paper-body')
      expect(shapeOf(body), lane).toEqual(['div.sec'])
      expect(shapeOf(body?.querySelector('.sec')), lane).toEqual(['div.sec-h', 'div.none'])
      expect(bodyHeads(paperOf(app)), lane).toEqual([BEFORE_HEAD])
      expect(bodyNones(paperOf(app)), lane).toEqual([BEFORE])
      app.remove()
    }
  })

  it('AC-1502.3: 그 밖의 칸(수납대기·수납완료)이거나 무엇 하나라도 적혔으면 네 칸을 다 그리고 빈 증상은 "적힌 증상이 없어요", 빈 상병·처방은 "없어요"다', () => {
    for (const lane of ['pay', 'done'] as const) {
      const app = appHost()
      view.renderDetail(app, mockupRow({ lane, laneLabel: fx.fakeRow({ lane }).laneLabel }), mockupHistory(), { today: TODAY })
      expect(bodyHeads(paperOf(app)), lane).toEqual(['증상', '상병', '처방', '원외처방'])
      expect(bodyNones(paperOf(app)), lane).toEqual([NO_SYM, NONE, NONE, NONE])
      expect(paperOf(app)?.querySelector('table, ul.dx, .paper-sym'), lane).toBeNull()
      app.remove()
    }
    // 진료대기여도 무엇이 적혔으면(엑스레이만 먼저 냄 등) 네 칸이다
    const cases: [Partial<FakePaper>, string[]][] = [
      [{ rx: [order('G7204', '가상 무릎 촬영')] }, [NO_SYM, NONE, NONE]],
      [{ sym: '가상 증상 먼저 적음' }, [NONE, NONE, NONE]],
      [{ dx: [{ code: 'M1998', name: '가상 관절증', main: false }] }, [NO_SYM, NONE, NONE]],
      [{ out: [order('671803230', '가상정')] }, [NO_SYM, NONE, NONE]],
    ]
    for (const [over, nones] of cases) {
      const app = appHost()
      view.renderDetail(app, mockupRow(), mockupHistory({ paper: blankPaper(over) }), { today: TODAY })
      expect(bodyHeads(paperOf(app)), JSON.stringify(over)).toEqual(['증상', '상병', '처방', '원외처방'])
      expect(bodyNones(paperOf(app)), JSON.stringify(over)).toEqual(nones)
      app.remove()
    }
  })

  it('AC-1502.2: 특이사항이 ""이면 점선 상자에 "적힌 특이사항이 없어요"뿐이고 단추가 없다', () => {
    const app = appHost()
    fakeHeights()
    view.renderDetail(app, mockupRow(), mockupHistory({ paper: blankPaper({ special: '' }) }), { today: TODAY })
    const spc = specialOf(app)
    expect(spc.box?.className).toBe('spc is-none')
    expect(shapeOf(spc.box)).toEqual(['div.sec-h', 'p.spc-text'])
    expect(textOf(spc.box, '.sec-h')).toBe('특이사항')
    expect(spc.text?.textContent).toBe(NO_SPECIAL)
    expect(spc.button).toBeNull()
  })

  it('AC-1502.2: 특이사항이 그려진 높이로 5줄을 넘으면 5줄만 보이고 [전부 보기 ▾]가 있다. 누르면 모두 보이고 [접기 ▴]로 바뀌며 다시 누르면 접힌다', () => {
    fakeHeights()
    const app = appHost()
    const special = specialLines(12)
    view.renderDetail(app, mockupRow(), mockupHistory({ paper: blankPaper({ special }) }), { today: TODAY })
    const { box, text, button } = specialOf(app)
    expect(box?.className).toBe('spc')
    expect(text?.textContent).toBe(special)
    expect(text?.classList.contains('clamp')).toBe(true)
    expect(button?.type).toBe('button')
    expect(button?.hidden).toBe(false)
    expect(button?.textContent).toBe(UNFOLD)
    expect(button?.getAttribute('aria-expanded')).toBe('false')

    button!.click()
    expect(text?.classList.contains('clamp')).toBe(false)
    expect(button?.textContent).toBe(FOLD)
    expect(button?.getAttribute('aria-expanded')).toBe('true')
    expect(specialOf(app).button).toBe(button)

    button!.click()
    expect(text?.classList.contains('clamp')).toBe(true)
    expect(button?.textContent).toBe(UNFOLD)
    expect(button?.getAttribute('aria-expanded')).toBe('false')
  })

  it('AC-1502.2: 5줄 이하면(줄 바꿈 수가 아니라 그려진 높이로) 단추가 없다. 줄은 둘이어도 긴 줄이 접혀 5줄을 넘으면 단추가 있다', () => {
    fakeHeights()
    for (const [special, shown] of [
      [specialLines(3), false],
      [specialLines(5), false],
      [specialLines(6), true],
      [`${'가'.repeat(LINE_CHARS * 3)}\n${'나'.repeat(LINE_CHARS * 3)}`, true],
      ['가'.repeat(LINE_CHARS * 5), false],
    ] as const) {
      const app = appHost()
      view.renderDetail(app, mockupRow(), mockupHistory({ paper: blankPaper({ special }) }), { today: TODAY })
      const { text, button } = specialOf(app)
      expect(text?.classList.contains('clamp'), special.slice(0, 12)).toBe(true)
      expect(button !== null && !button.hidden, special.slice(0, 12)).toBe(shown)
      app.remove()
    }
  })

  it('AC-1502.4: updatePaper는 그린 상세가 그 열쇠 환자면 종이 카드 내용(사람 칸·특이사항·내원내역·진료 칸)을 새 paper로 바꾸고 특이사항을 펼쳐 둔 상태는 지킨다. 머리·지난번 카드·차트번호·수진자명·날짜는 그대로다', () => {
    fakeHeights()
    const app = appHost()
    const row = paidRow()
    view.renderDetail(app, row, mockupHistory({ paper: treatedPaper({ special: specialLines(9) }) }), { today: TODAY })
    const patient = app.querySelector('.patient')
    const last = lastOf(app)
    specialOf(app).button!.click()
    expect(specialOf(app).button?.textContent).toBe(FOLD)

    const next = treatedPaper({
      special: specialLines(10),
      addr: '가상시 새주소 34',
      cel: '',
      room: '2진료실',
      ins: '의료급여',
      sym: '가상 증상 바뀜\n둘째 줄',
      dx: [{ code: 'M2556', name: '가상 무릎 통증', main: true }],
      rx: [order('MM020', '가상 심층열치료')],
      out: [],
    })
    expect(view.updatePaper(app, row.k, next)).toBe(true)
    const card = paperOf(app)
    expect(kvOf(card)).toEqual([
      [KV_LABELS[0], '910234'],
      [KV_LABELS[1], '가상환자02 (F/54)'],
      [KV_LABELS[2], '720304-*******'],
      [KV_LABELS[3], '가상시 새주소 34'],
      [KV_LABELS[4], '031-000-0000'],
      [KV_LABELS[5], EMPTY],
    ])
    expect(textOf(card, '.paper-date')).toBe('2026-11-05')
    expect(textsOf(card, '.visit-line > span')).toEqual(['내원 : 20261105', '2진료실', '의료급여(재진)'])
    expect(card?.querySelector('.paper-sym > pre')?.textContent).toBe('가상 증상 바뀜\n둘째 줄')
    expect(textsOf(sectionOf(card, '상병'), 'ul.dx > li > code')).toEqual(['M2556'])
    expect(ordersOf(sectionOf(card, '처방'))).toEqual([['MM020', '가상 심층열치료', '1', '1', '1']])
    expect(bodyNones(card)).toEqual([NONE])
    // 펼친 특이사항은 새 글로 펼친 채다
    const spc = specialOf(app)
    expect(spc.text?.textContent).toBe(specialLines(10))
    expect(spc.text?.classList.contains('clamp')).toBe(false)
    expect(spc.button?.hidden).toBe(false)
    expect(spc.button?.textContent).toBe(FOLD)
    expect(spc.button?.getAttribute('aria-expanded')).toBe('true')
    spc.button!.click()
    expect(specialOf(app).text?.classList.contains('clamp')).toBe(true)
    // 머리·지난번 카드는 그대로
    expect(app.querySelector('.patient')).toBe(patient)
    expect(lastOf(app)).toBe(last)
    expect(lastCardOf(last)).toEqual(['지난번', '10월 29일', '7일 전', '증상 · 오른쪽 어깨 통증 조금 줄었음, 밤에 아픔'])
    expect(app.querySelectorAll('article.paper').length).toBe(1)

    // 접은 채로 바꾸면 접힌 채, 짧아지면 단추가 없다, 비면 점선 상자
    expect(view.updatePaper(app, row.k, treatedPaper({ special: specialLines(8) }))).toBe(true)
    expect(specialOf(app).text?.classList.contains('clamp')).toBe(true)
    expect(specialOf(app).button?.textContent).toBe(UNFOLD)
    expect(view.updatePaper(app, row.k, treatedPaper({ special: specialLines(2) }))).toBe(true)
    expect(specialOf(app).button === null || specialOf(app).button!.hidden).toBe(true)
    expect(view.updatePaper(app, row.k, treatedPaper({ special: '' }))).toBe(true)
    expect(specialOf(app).box?.className).toBe('spc is-none')

    // 진료 칸이 모두 비면(수납대기) 빈 네 칸, 새 글의 HTML은 글자로만
    expect(view.updatePaper(app, row.k, blankPaper({ special: '<b>새 특이사항</b>', addr: '<img src=x onerror=alert(3)>' }))).toBe(true)
    expect(bodyNones(paperOf(app))).toEqual([NO_SYM, NONE, NONE, NONE])
    expect(app.querySelector('b, img:not(.logo-mark)')).toBeNull()
    expect(specialOf(app).text?.textContent).toBe('<b>새 특이사항</b>')
  })

  it('AC-1502.4: 진료대기 줄에서 새 paper가 모두 비었으면 <증상 · 상병 · 처방> 한 줄이고, 적힌 것이 생기면 네 칸이다', () => {
    const app = appHost()
    const row = mockupRow()
    view.renderDetail(app, row, mockupHistory(), { today: TODAY })
    expect(bodyHeads(paperOf(app))).toEqual([BEFORE_HEAD])
    expect(view.updatePaper(app, row.k, treatedPaper())).toBe(true)
    expect(bodyHeads(paperOf(app))).toEqual(['증상', '상병', '처방', '원외처방'])
    expect(view.updatePaper(app, row.k, blankPaper())).toBe(true)
    expect(bodyHeads(paperOf(app))).toEqual([BEFORE_HEAD])
    expect(bodyNones(paperOf(app))).toEqual([BEFORE])
  })

  it('AC-1502.4: 다른 환자 열쇠이거나 그린 상세가 없으면 updatePaper는 아무것도 바꾸지 않는다(false)', () => {
    const app = appHost()
    view.renderDetail(app, paidRow(), mockupHistory({ paper: treatedPaper() }), { today: TODAY })
    const before = app.innerHTML
    expect(view.updatePaper(app, fx.fakeKey(9), blankPaper({ special: '다른 환자 특이사항' }))).toBe(false)
    expect(app.innerHTML).toBe(before)
    expect(view.updatePaper(appHost(), fx.fakeKey(2), blankPaper({ special: '빈 자리' }))).toBe(false)
    expect(document.body.textContent).not.toContain('빈 자리')
    expect(document.body.textContent).not.toContain('다른 환자 특이사항')
  })

  it('AC-1404.4 · AC-1502.3: 접수 현황 자료가 바뀌면 updateDetail이 머리(상태·기다린 글·메모)를 바꾸고, 종이 카드는 줄의 지금 칸을 따른다(빈 진료 칸은 칸 규칙대로 다시, 차트번호·수진자명도 줄대로). 지난번 카드·특이사항 펼침은 그대로다. 다른 환자 줄이면 바꾸지 않는다', () => {
    fakeHeights()
    const app = appHost()
    view.renderDetail(app, mockupRow({ name: '' }), mockupHistory({ paper: blankPaper({ special: specialLines(7) }) }), { today: TODAY })
    const last = lastOf(app)
    const card = paperOf(app)
    specialOf(app).button!.click()
    expect(bodyHeads(card)).toEqual([BEFORE_HEAD])
    expect(kvOf(card)[1]).toEqual([KV_LABELS[1], EMPTY])

    const paid = paidRow({ memo: '' })
    expect(view.updateDetail(app, paid, { today: TODAY })).toBe(true)
    expect(app.querySelector('.status-line > span.status')?.className).toBe('status status-pay')
    expect(textsOf(app, '.status-line > span')).toEqual(['수납대기', '10:42 접수 · 수납 3분째'])
    expect(app.querySelector('.patient > .memo')).toBeNull()
    expect(paperOf(app)).toBe(card)
    expect(bodyHeads(card)).toEqual(['증상', '상병', '처방', '원외처방'])
    expect(bodyNones(card)).toEqual([NO_SYM, NONE, NONE, NONE])
    expect(kvOf(card)[1]).toEqual([KV_LABELS[1], '가상환자02 (F/54)'])
    expect(specialOf(app).text?.textContent).toBe(specialLines(7))
    expect(specialOf(app).button?.textContent).toBe(FOLD)
    expect(lastOf(app)).toBe(last)
    expect(app.querySelector('section.today')).toBeNull()

    // 다시 진료보류로: 빈 진료 칸은 한 줄로
    expect(view.updateDetail(app, mockupRow({ lane: 'hold', laneLabel: '진료보류' }), { today: TODAY })).toBe(true)
    expect(bodyHeads(card)).toEqual([BEFORE_HEAD])

    // 적힌 진료 칸은 칸이 바뀌어도 그대로다
    expect(view.updatePaper(app, paid.k, treatedPaper({ special: specialLines(7) }))).toBe(true)
    const body = card?.querySelector(':scope > .paper-body')
    expect(view.updateDetail(app, paid, { today: TODAY })).toBe(true)
    expect(card?.querySelector(':scope > .paper-body')).toBe(body)

    const other = mockupRow({ k: fx.fakeKey(9), name: '가상환자09', lane: 'done', laneLabel: '수납완료' })
    expect(view.updateDetail(app, other, { today: TODAY })).toBe(false)
    expect(textOf(app, '.detail-name')).toBe('가상환자02')
    expect(textOf(app, '.status-line > span.status')).toBe('수납대기')
    // 상세가 없는 자리
    expect(view.updateDetail(appHost(), paid, { today: TODAY })).toBe(false)
  })
})

describe('detail.js 상세 그리기 (태블릿 오른쪽 칸)', () => {
  it('AC-1409.1 · AC-1502.1: detailPane은 태블릿 오른쪽 칸의 내용(환자 칸·제목·종이 카드·제목·지난번 카드·끝 줄)이고 돌아가기·머리·아래 글·[더 보기]는 없다', () => {
    const nodes = view.detailPane(mockupRow(), mockupHistory(), { today: TODAY })
    expect(nodes.map((n) => (n instanceof Element ? `${n.tagName.toLowerCase()}.${n.className.split(' ').join('.')}` : '#text'))).toEqual([
      'div.patient',
      'h3.detail-heading',
      'article.paper',
      'h3.detail-heading',
      'section.visit.is-last',
      'p.end-note',
    ])
    const patient = nodes[0] as Element
    expect(shapeOf(patient.querySelector('.name-line'))).toEqual(['span.chart', 'h2.detail-name', 'span.info'])
    expect([nodes[1]?.textContent?.trim(), nodes[3]?.textContent?.trim()]).toEqual([PAPER_HEADING, LAST_HEADING])
    expect(kvOf(nodes[2] as Element)[1]).toEqual([KV_LABELS[1], '가상환자02 (F/54)'])
    expect(shapeOf((nodes[4] as Element).querySelector('.visit-head'))).toEqual(['h4.visit-date', 'span.visit-ago'])
    expect(lastCardOf(nodes[4] as Element)).toEqual(['지난번', '10월 29일', '7일 전', '증상 · 오른쪽 어깨 통증 조금 줄었음, 밤에 아픔'])
    expect(nodes.some((n) => n instanceof Element && (n.matches('a.back, header, footer, button.more') || n.querySelector('a.back, header, footer, button.more')))).toBe(false)
  })

  it('AC-1409.3 · AC-1502.4: 목록 오른쪽 칸(fillPane)에 넣으면 updateDetail(#app)이 오른쪽 칸의 머리와 종이 카드 칸 규칙을, updatePaper가 종이 카드 내용을 바꾸고 지난번 카드는 그대로다', () => {
    const app = appHost()
    const fake = fx.mockupBoard()
    const row = fake.lists.wait[1]!
    board.renderBoard(app, fake, { tablet: true, picked: row.k })
    board.fillPane(app, view.detailPane(row, mockupHistory(), { today: TODAY }))
    const pane = app.querySelector('.page.board > aside.pane')!
    expect(shapeOf(pane)).toEqual(['div.patient', 'h3.detail-heading', 'article.paper', 'h3.detail-heading', 'section.visit.is-last', 'p.end-note', 'p.pane-foot'])
    expect(textOf(pane, '.detail-name')).toBe('가상환자02')
    const last = lastOf(pane)
    expect(bodyHeads(paperOf(pane))).toEqual([BEFORE_HEAD])

    expect(view.updateDetail(app, { ...row, lane: 'done', laneLabel: '수납완료', waited: '13:40 수납', rxLabel: '오늘', rx: '엑스레이 촬영(XR2)' }, { today: TODAY })).toBe(true)
    expect(textOf(pane, '.status-line > span.status')).toBe('수납완료')
    expect(bodyNones(paperOf(pane))).toEqual([NO_SYM, NONE, NONE, NONE])

    expect(view.updatePaper(app, row.k, treatedPaper({ sym: '어깨 다시 아픔' }))).toBe(true)
    expect(paperOf(pane)?.querySelector('.paper-sym > pre')?.textContent).toBe('어깨 다시 아픔')
    expect(lastOf(pane)).toBe(last)
  })

  it('AC-1502.2: 오른쪽 칸은 그려 넣은 뒤(fillPane) fitSpecial(#app)로 특이사항 높이를 재어 5줄을 넘을 때만 [전부 보기 ▾]를 보인다', () => {
    fakeHeights()
    const app = appHost()
    const fake = fx.mockupBoard()
    const row = fake.lists.wait[1]!
    board.renderBoard(app, fake, { tablet: true, picked: row.k })
    board.fillPane(app, view.detailPane(row, mockupHistory({ paper: blankPaper({ special: specialLines(9) }) }), { today: TODAY }))
    view.fitSpecial(app)
    const { text, button } = specialOf(app.querySelector('aside.pane'))
    expect(text?.classList.contains('clamp')).toBe(true)
    expect(button?.hidden).toBe(false)
    button!.click()
    expect(text?.classList.contains('clamp')).toBe(false)
    expect(button?.textContent).toBe(FOLD)

    board.fillPane(app, view.detailPane(row, mockupHistory({ paper: blankPaper({ special: specialLines(4) }) }), { today: TODAY }))
    view.fitSpecial(app)
    const short = specialOf(app.querySelector('aside.pane'))
    expect(short.button === null || short.button.hidden).toBe(true)
  })
})
