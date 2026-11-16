// @vitest-environment jsdom
// 어레인지 표 화면 arrange.js (TASK-9, REQ-3308·REQ-3312, design.md 4·10절). 승인 시안 docs/mockups/reception-arrange/Arrange.html의
// 글·차례·모양 그대로다(목업 띠·가짜 환자는 빼고). 누르기는 view.on…을 부르는 것만 본다(보내기·낙관적 그리기 잇기는 TASK-11 app.js).
// planOf(판, 쓰기)는 쓰기 하나를 판에 미리 얹은 모양·되돌리기 띠 글·되돌리기 쓰기를 준다(app.js가 쓴다). 자료는 가짜다(fixtures.ts)
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeAll, describe, expect, it, onTestFinished, vi } from 'vitest'
import * as fx from './fixtures'
import type { FakeBoard } from './fixtures'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const WWW = path.join(ROOT, 'reception', 'www')
const MOCKUP = path.join(ROOT, 'docs', 'mockups', 'reception-arrange', 'Arrange.html')
/** 수정 묶음 승인 시안(reception-memo-papers, 2026-11-11)과 그 시안이 theme.css에 더한 색(진료보류 진한 노랑 AC-3401.1, 메모 빨강·펜 검정 AC-3403.6) */
const MEMO_PAPERS_MOCKUP = path.join(ROOT, 'docs', 'mockups', 'reception-memo-papers', 'Mock.html')
const MEMO_PAPERS_ADDED = ['#FFD43B', '#C9A100', '#E03131', '#FFF1F1', '#222222']
const PHONE_MOCKUPS = path.join(ROOT, 'docs', 'mockups', 'reception-phone')
/** 고르기 목록 승인 시안(reception-pick-lists, 2026-11-12) */
const PICK_LISTS_MOCKUP = path.join(ROOT, 'docs', 'mockups', 'reception-pick-lists', 'Mock.html')
/** 돌아옴·목록 여섯 탭·비고 기록부 승인 시안(reception-arrange-tune, 2026-11-16). 새 색은 없고 theme.css 토큰만 쓴다(notes.md) */
const TUNE_MOCKUP = path.join(ROOT, 'docs', 'mockups', 'reception-arrange-tune', 'Mock.html')

type Col = 'xray' | 'sono' | 'carm' | 'pt' | 'ds' | 'eswt' | 'trac'

interface Ask {
  k: string
  op: string
  col?: string
  v?: string
  /** SONO 같이 하는 것·C-ARM 약재를 "|"로 이은 글 (reception-pick-lists AC-3502.3) */
  t?: string
}

interface Plan {
  board: FakeBoard
  toast: string | null
  undo: Ask | null
}

interface Sheet {
  k: string
  col: string
  kind: 'add' | 'done' | 'part'
  /** 충격파 넣기 창에서 고른 타수·부위 수 (AC-3402.2) */
  hit?: string | null
  count?: string | null
  /** C-ARM 넣기 창에서 고른 시술·약재 (reception-pick-lists AC-3503.1) */
  proc?: string | null
  drug?: string | null
  /** SONO 넣기 창에서 고른 쪽·담은 것·같이 하는 것 (reception-pick-lists AC-3504.1) */
  side?: string | null
  picked?: string[]
  withs?: string[]
}

interface ArrangeView {
  tab?: string
  reading?: boolean
  sheet?: Sheet | null
  endedOpen?: boolean
  toast?: { text: string; undo: boolean } | null
  rxNew?: string[]
  flash?: string[]
  onTab?: (tab: string) => void
  onRefresh?: () => void
  onCell?: (k: string, col: string) => void
  onAdd?: (k: string, col: string, v: string, t?: string) => void
  onPart?: (k: string, col: string, v: string, t?: string) => void
  onSet?: (k: string, col: string, v: string) => void
  onRemove?: (k: string, col: string) => void
  onAway?: (k: string, v: string) => void
  onPtf?: (k: string, v: string) => void
  onEnd?: (k: string) => void
  onRestore?: (k: string) => void
  onChart?: (k: string) => void
  onUndo?: () => void
  onSheet?: (sheet: Sheet | null) => void
  onEnded?: (open: boolean) => void
}

interface ArrangeJs {
  renderArrange: (host: HTMLElement, board: FakeBoard, view?: ArrangeView) => HTMLElement
  planOf: (board: FakeBoard, ask: Ask) => Plan
  /** 옛 고정 목록(X-RAY·PT·도수·충격파·견인). 목록이 모두 판 picks로 옮겨 가 없다 (reception-arrange-tune AC-3604.4) */
  CHOICES?: Record<string, string[]>
  /** 옛 SONO·C-ARM 부위 목록. 고르기 목록이 판 picks로 옮겨 가 없다 (reception-pick-lists) */
  PARTS?: string[]
}

// 화면 파일은 빌드 없는 JS라 형 선언이 없다(design.md 결정 '화면은 빌드 없는 JS'). 경로를 값으로 두어 형 검사가 묻지 않게 한다
const ARRANGE_JS = '../www/arrange.js'
let view: ArrangeJs

beforeAll(async () => {
  // 아직 없으면(RED) 빈 것을 그리는 대역으로 시험마다 실패를 보인다
  const missing: ArrangeJs = {
    renderArrange: (host) => host.appendChild(document.createElement('div')),
    planOf: (board) => ({ board, toast: null, undo: null }),
  }
  view = ((await import(/* @vite-ignore */ ARRANGE_JS).catch(() => missing)) ?? missing) as ArrangeJs
})

afterEach(() => {
  document.body.replaceChildren()
  localStorage.clear()
})

// ---- 시험 도구 --------------------------------------------------------------------------------------

/** 가짜 판의 화면 열쇠: 시안의 환자 a~j (fixtures.ts arrangeMockupBoard) */
const K = fx.ARRANGE_KEYS

/** index.html의 #app 자리 */
function appHost(): HTMLElement {
  const app = document.createElement('div')
  app.id = 'app'
  document.body.appendChild(app)
  return app
}

function draw(board: FakeBoard = fx.arrangeMockupBoard(), v: ArrangeView = {}) {
  const app = appHost()
  const page = view.renderArrange(app, board, v)
  return { app, page }
}

function textOf(root: ParentNode | null | undefined, selector: string): string | null {
  return root?.querySelector(selector)?.textContent?.trim() ?? null
}

function textsOf(root: ParentNode, selector: string): string[] {
  return [...root.querySelectorAll(selector)].map((n) => n.textContent?.trim() ?? '')
}

/** 바로 아래 아이들의 '태그.class' */
function shapeOf(node: Element | null | undefined): string[] {
  return [...(node?.children ?? [])].map((c) => `${c.tagName.toLowerCase()}${c.className ? `.${String(c.className).split(' ').join('.')}` : ''}`)
}

/** 표의 줄들 */
function trs(root: ParentNode): HTMLTableRowElement[] {
  return [...root.querySelectorAll<HTMLTableRowElement>('table.arr > tbody > tr')]
}

/** 이름으로 줄 찾기 */
function trOf(root: ParentNode, name: string): HTMLTableRowElement {
  const found = trs(root).find((tr) => textOf(tr, '.arr-name') === name)
  if (!found) throw new Error(`줄 ${name} 없음`)
  return found
}

function cellOf(root: ParentNode, name: string, col: Col): HTMLElement {
  const cell = trOf(root, name).querySelector<HTMLElement>(`:scope > td.c-${col} > .cell`)
  if (!cell) throw new Error(`${name} ${col} 칸 없음`)
  return cell
}

/** 칸 안의 아이 '태그.class:글' */
function cellParts(cell: Element): string[] {
  return [...cell.children].map((c) => `${c.tagName.toLowerCase()}.${String(c.className).split(' ').join('.')}:${c.textContent ?? ''}`)
}

function sheetOf(root: ParentNode): HTMLElement | null {
  return root.querySelector<HTMLElement>('.sheet-back > .sheet')
}

function optionsOf(root: ParentNode): string[] {
  return textsOf(root, '.sheet .opts > button.opt')
}

function pick(root: ParentNode, label: string) {
  const button = [...root.querySelectorAll<HTMLButtonElement>('.sheet .opts > button.opt')].find((b) => b.textContent === label)
  if (!button) throw new Error(`고르기 ${label} 없음`)
  button.click()
}

function nameOf(k: string): string {
  return fx.arrangeMockupBoard().lists.queue.concat(...Object.values(fx.arrangeMockupBoard().lists)).find((r) => r.k === k)!.name
}

/** 판에서 열쇠의 어레인지 줄 */
function arrRow(board: FakeBoard, k: string) {
  return board.arrange!.rows.find((r) => r.k === k) ?? null
}

// ---- 작은 CSS 읽개 (주석 지우기·@media 안까지 규칙 펼치기, shell.test.ts와 같다) -------------------------

type Rule = { selector: string; media: string; decls: [string, string][] }

function parseRules(css: string, media = ''): Rule[] {
  const rules: Rule[] = []
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '')
  let i = 0
  while (i < text.length) {
    const open = text.indexOf('{', i)
    if (open < 0) break
    const head = text.slice(i, open).trim()
    let depth = 1
    let j = open + 1
    while (j < text.length && depth > 0) {
      if (text[j] === '{') depth++
      else if (text[j] === '}') depth--
      j++
    }
    const body = text.slice(open + 1, j - 1)
    if (head.startsWith('@media')) rules.push(...parseRules(body, head))
    else
      rules.push({
        selector: head,
        media,
        decls: body
          .split(';')
          .map((d) => d.trim())
          .filter(Boolean)
          .map((d) => [d.slice(0, d.indexOf(':')).trim().toLowerCase(), d.slice(d.indexOf(':') + 1).trim()] as [string, string]),
      })
    i = j
  }
  return rules
}

function readWww(rel: string): string {
  const file = path.join(WWW, rel)
  return existsSync(file) ? readFileSync(file, 'utf8') : ''
}

const TABLET = '(min-width: 1000px) and (orientation: landscape)'

/** media 안(''은 밖)에서 selector(쉼표 목록 중 하나와 같은 글)의 prop 값. 뒤의 것이 이긴다 */
function cssValue(selector: string, prop: string, media: 'phone' | 'tablet' = 'phone'): string | undefined {
  return parseRules(readWww('style.css'))
    .filter((r) => (media === 'tablet' ? r.media.includes(TABLET) : r.media === ''))
    .filter((r) => r.selector.split(',').map((s) => s.trim()).includes(selector))
    .flatMap((r) => r.decls)
    .findLast(([p]) => p === prop)?.[1]
}

const HEX = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/gi
function hexColors(text: string): string[] {
  return (text.match(HEX) ?? []).map((hex) => {
    let h = hex.slice(1).toUpperCase()
    if (h.length === 3) h = h.replace(/./g, (c) => c + c)
    return `#${h}`
  })
}

// ---- 시안의 글 (Arrange.html) -------------------------------------------------------------------------

/** 옛 SONO·C-ARM 부위 목록과 부위 없이 넣는 글 (reception-arrange 시안 Arrange.html). 이제 화면에 없다 (reception-pick-lists) */
const OLD_PARTS = ['목', '등', '허리', '오른 어깨', '왼 어깨', '양 어깨', '팔꿈치', '손목', '고관절', '오른 무릎', '왼 무릎', '양 무릎', '발목', '발바닥', '기타']
const LATER = '부위는 나중에'
/** 기본 picks의 충격파 부위 수·타수 (reception-arrange-tune AC-3603.1, 시안 Mock.html eswtSheet) */
const ESWT_COUNTS = ['1부위', '2부위', '3부위', '4부위']
const ESWT_HITS = ['2000타', '3000타', '4000타', '6000타']
/** 넣기 창 목록: X-RAY는 화면 글 하나, PT·도수·견인은 기본 picks(AC-3603.1)다. 화면은 PT·도수·충격파·견인 목록 글을 갖지 않는다(AC-3604.4) */
const CHOICES: Record<'xray' | 'pt' | 'ds' | 'trac', string[]> = {
  xray: ['X-ray 찍기'],
  pt: ['ICE', 'HP'],
  ds: ['30분', '50분'],
  trac: ['목', '허리'],
}
const COL_NAMES: Record<Col, string> = { xray: 'X-RAY', sono: 'SONO', carm: 'C-ARM', pt: 'PT', ds: '도수', eswt: '충격파', trac: '견인' }
const COLS: Col[] = ['xray', 'sono', 'carm', 'pt', 'ds', 'eswt', 'trac']
/** 쓰는 법 첫 줄에 더한 글 (reception-pick-lists AC-3504.4, 시안 tableCells) */
const HOWTO_PICK = '(SONO는 [부위 고르기], C-ARM은 [시술 고르기]로 골라요)'
const OLD_HOWTO_0 =
  '치료 칸을 누르면 다음 단계로 넘어가요 (준비 → 준비완료 → 완료, 준비완료는 SONO·C-ARM만). X-RAY·SONO·C-ARM은 처방이 나오면 저절로 들어오고, PT·도수·충격파·견인은 빈 칸을 눌러 골라 넣어요.'
/** 옛 쓰는 법 둘째 줄·아래 글 (reception-arrange 시안 Arrange.html) */
const OLD_HOWTO_1 = '접수 시각을 누르면 자리비움, 성함을 누르면 오늘·직전 진료기록부가 열려요. [PT 먼저]는 누를 때마다 ↑ 올라감 → ↓ 내려옴 → 지움.'
const OLD_FOOT = '표시(준비완료·완료·자리비움·PT 먼저·치료 종료)는 의원 PC에만 남아요 · 비트 자료는 바뀌지 않아요'
/** 쓰는 법 두 줄·아래 글 (둘째 줄·아래 글은 reception-arrange-tune AC-3602.2, 시안 Mock.html table) */
const HOWTO = [
  `치료 칸을 누르면 다음 단계로 넘어가요 (준비 → 준비완료 → 완료, 준비완료는 SONO·C-ARM만). X-RAY·SONO·C-ARM은 처방이 나오면 저절로 들어오고${HOWTO_PICK}, PT·도수·충격파·견인은 빈 칸을 눌러 골라 넣어요.`,
  '접수 시각을 누르면 자리비움, 다시 누르면 돌아옴이에요(다음 치료 칸을 누를 때까지 돌아온 뒤 기다린 시간이 보여요). 성함이나 비고를 누르면 오늘·직전·그 전 진료기록부가 열려요. [PT 먼저]는 누를 때마다 ↑ 올라감 → ↓ 내려옴 → 지움.',
]
const FOOT = '표시(준비완료·완료·자리비움·돌아옴·PT 먼저·치료 종료)는 의원 PC에만 남아요 · 비트 자료는 바뀌지 않아요'
/** 접수 머리 작은 글 (AC-3602.2): "·" 뒤에서만 줄을 바꾼다(시안 span.nw + wbr) */
const T_SUB = '누르면 자리비움·돌아옴'
const ACTIVE_NAMES = ['가상환자21', '가상환자22', '가상환자23', '가상환자24', '가상환자25', '가상환자26', '가상환자27', '가상환자28']

// ---- 머리 · 탭 (AC-3308.1) ---------------------------------------------------------------------------

describe('REQ-3308 어레인지 탭 머리', () => {
  it('AC-3308.1 · AC-3403.1: 어레인지 화면 머리는 상표 줄(로고·메모 칸·연결됨·새로 고침) 아래 탭 단추 둘 [접수 현황]·[어레인지 N명]이고 [어레인지]가 aria-pressed="true"다. 문서 제목은 건드리지 않는다', () => {
    const { page } = draw()
    expect(page.className).toBe('page arrange')
    const top = page.querySelector(':scope > header.top')
    expect(shapeOf(top)).toEqual(['div.top-row.with-memo', 'nav.tabs'])
    expect(shapeOf(top?.querySelector('.top-row'))).toEqual(['img.logo', 'div.memo-box', 'div.top-status'])
    expect(textOf(top, '.top-row > .memo-box')).toBe('메모 쓰기 · 펜이나 글자로')
    expect(textOf(top, '.top-status > span.conn')).toBe('연결됨')
    expect(top?.querySelector('.top-status > button.refresh')).not.toBeNull()
    const tabs = [...(top?.querySelectorAll<HTMLButtonElement>('nav.tabs > button.tab') ?? [])]
    expect(tabs.map((t) => t.tagName)).toEqual(['BUTTON', 'BUTTON'])
    expect(tabs.map((t) => t.getAttribute('type'))).toEqual(['button', 'button'])
    expect(tabs.map((t) => t.textContent)).toEqual(['접수 현황', '어레인지8명'])
    expect(textOf(tabs[1], ':scope > span.tab-n')).toBe('8명')
    expect(tabs.map((t) => t.getAttribute('aria-pressed'))).toEqual(['false', 'true'])
    expect(document.title).toBe('')
  })

  it('AC-3308.1: 탭을 누르면 onTab(board|arrange)을 부르고, [새로 고침]은 onRefresh를 한 번 부른 뒤 "읽는 중…"이다', () => {
    const onTab = vi.fn()
    const onRefresh = vi.fn()
    const { page } = draw(fx.arrangeMockupBoard(), { onTab, onRefresh })
    const tabs = [...page.querySelectorAll<HTMLButtonElement>('nav.tabs > button.tab')]
    tabs[0]!.click()
    expect(onTab).toHaveBeenLastCalledWith('board')
    tabs[1]!.click()
    expect(onTab).toHaveBeenLastCalledWith('arrange')
    expect(onTab).toHaveBeenCalledTimes(2)
    const refresh = page.querySelector<HTMLButtonElement>('header.top button.refresh')!
    refresh.click()
    refresh.click()
    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(refresh.disabled).toBe(true)
    expect(refresh.textContent).toBe('읽는 중…')
  })

  it('AC-3403.1: 이 기기에 메모가 있으면 머리 메모 칸에 보이고, 판을 다시 그려도(5초) 그대로다. 메모 칸을 누르면 큰 창이 document.body에 열려 판 다시 그리기에도 남는다', () => {
    localStorage.setItem('reception-memo', JSON.stringify({ v: 1, text: '오후 3시 원장님 외출', ink: null }))
    // jsdom에는 그림 판이 없다(판이 없어도 창은 열린다)
    const canvas = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    onTestFinished(() => canvas.mockRestore())
    const { app } = draw()
    expect(textOf(app, 'header.top .memo-box .memo-prev')).toBe('오후 3시 원장님 외출')
    app.querySelector<HTMLElement>('header.top .memo-box')!.click()
    expect(document.querySelector('body > .sheet-back.memo-back > .sheet.memo-sheet')).not.toBeNull()
    view.renderArrange(app, fx.arrangeMockupBoard('11:04:20'), {})
    expect(textOf(app, 'header.top .memo-box .memo-prev')).toBe('오후 3시 원장님 외출')
    expect(document.querySelectorAll('body > .sheet-back.memo-back').length).toBe(1)
    document.querySelector<HTMLButtonElement>('.memo-sheet .memo-foot > button.sheet-x')!.click()
    expect(document.querySelector('.memo-back')).toBeNull()
  })

  it('AC-3403.1: 태블릿 모양이 아니면 메모 칸은 로고 줄 아래 한 줄이고, 태블릿 모양이면 로고 옆이다', () => {
    expect(cssValue('.top-row.with-memo', 'flex-wrap')).toBe('wrap')
    expect(cssValue('.top-row.with-memo .memo-box', 'order')).toBe('3')
    expect(cssValue('.top-row.with-memo .memo-box', 'flex')).toBe('1 1 100%')
    expect(cssValue('.top-row.with-memo', 'flex-wrap', 'tablet')).toBe('nowrap')
    expect(cssValue('.top-row.with-memo .memo-box', 'order', 'tablet')).toBe('0')
    expect(cssValue('.top-row.with-memo .memo-box', 'flex', 'tablet')).toBe('0 1 440px')
  })
})

// ---- 표 화면 (AC-3308.2 · 3308.3) ---------------------------------------------------------------------

describe('REQ-3308 어레인지 표', () => {
  it('AC-3308.2 · AC-3504.4 · AC-3602.2: 시안 차례대로 머리·기준 시각 줄(기준 글 + 표시 뜻 일곱, 자리비움 뒤 "돌아옴")·쓰는 법 두 줄(첫 줄에 "(SONO는 [부위 고르기], C-ARM은 [시술 고르기]로 골라요)", 둘째 줄은 돌아옴·비고 시안 글)·표·[오늘 치료 종료 N명]·아래 글(돌아옴 시안 글)이 있다', () => {
    const { app, page } = draw()
    expect(app.children.length).toBe(1)
    expect(app.firstElementChild).toBe(page)
    expect(shapeOf(page)).toEqual(['header.top', 'div.sub-line', 'p.howto', 'div.wrap', 'p.empty-note', 'section.ended', 'footer.foot'])
    expect(shapeOf(page.querySelector('.sub-line'))).toEqual(['span.asof', 'span.legend'])
    expect(textOf(page, '.sub-line > span.asof')).toBe('11:04:15 기준 · 5초마다 저절로 바뀌어요')
    expect(shapeOf(page.querySelector('.legend'))).toEqual(['span.lg.todo', 'span.lg.ready', 'span.lg.done', 'span.lg.manual', 'span.lg.away', 'span.lg.rtn', 'span.lg.ptup'])
    expect(textsOf(page, '.legend > span.lg')).toEqual(['준비', '준비완료', '✓ 완료', '직접 넣음', '자리비움', '돌아옴', '↑ PT 먼저'])
    const howto = page.querySelector('p.howto')!
    expect([...howto.childNodes].map((n) => (n instanceof Element ? n.tagName.toLowerCase() : n.textContent))).toEqual([HOWTO[0], 'br', HOWTO[1]])
    expect(shapeOf(page.querySelector('.wrap'))).toEqual(['table.arr'])
    expect(page.querySelector<HTMLElement>('p.empty-note')!.hidden).toBe(true)
    expect(textOf(page, 'p.empty-note')).toBe('지금 안내할 환자가 없어요')
    expect(textOf(page, 'footer.foot')).toBe(FOOT)
  })

  it('AC-3308.2 · AC-3402.3 · AC-3503.4 · AC-3602.2 · AC-3604.4: 표 머리는 접수(누르면 자리비움·돌아옴)·성함·X-RAY·SONO(부위·준비·순서)·C-ARM(시술·약재·순서)·PT(ICE·HP)·도수(30분·50분)·충격파(타수·부위 수)·견인(목·허리)·비고(접수 메모 · 지난번 증상)·빈 머리다', () => {
    const { page } = draw()
    const ths = [...page.querySelectorAll('table.arr > thead > tr > th')]
    expect(ths.map((th) => th.className)).toEqual(['c-t', 'c-nm', 'c-xray', 'c-sono', 'c-carm', 'c-pt', 'c-ds', 'c-eswt', 'c-trac', 'c-memo', 'c-end'])
    expect(ths.map((th) => [th.firstChild?.nodeType === Node.TEXT_NODE ? th.firstChild.textContent : '', th.querySelector(':scope > span.sm')?.textContent ?? null])).toEqual([
      ['접수', T_SUB],
      ['성함', null],
      ['X-RAY', null],
      ['SONO', '부위·준비·순서'],
      ['C-ARM', '시술·약재·순서'],
      ['PT', 'ICE·HP'],
      ['도수', '30분·50분'],
      ['충격파', '타수·부위 수'],
      ['견인', '목·허리'],
      ['비고', '접수 메모 · 지난번 증상'],
      ['', null],
    ])
    // 접수 머리 작은 글은 "·" 뒤에서만 줄을 바꾼다: "누르면 " + span.nw "자리비움·" + wbr + "돌아옴" (시안)
    const sub = page.querySelector('table.arr > thead th.c-t > span.sm')!
    expect([...sub.childNodes].map((n) => (n instanceof Element ? `${n.tagName.toLowerCase()}${n.className ? `.${n.className}` : ''}:${n.textContent}` : n.textContent))).toEqual([
      '누르면 ',
      'span.nw:자리비움·',
      'wbr:',
      '돌아옴',
    ])
    expect(cssValue('.arr th.c-t .sm', 'word-break')).toBe('keep-all')
    expect(cssValue('.arr th.c-t .sm .nw', 'white-space')).toBe('nowrap')
  })

  it('AC-3604.4: PT·도수·견인 머리 작은 글은 판 picks 목록을 "·"로 이은 글이고(충격파는 "타수·부위 수"), 목록이 바뀐 판으로 다시 그리면 바뀐다. picks가 없으면 목록 글이 없다', () => {
    const app = appHost()
    const sub = (col: Col) => app.querySelector(`table.arr > thead th.c-${col} > span.sm`)?.textContent ?? null
    const board = fx.arrangeMockupBoard()
    board.picks!.pt = ['ICE', 'HP', 'TENS']
    board.picks!.ds = ['20분']
    board.picks!.trac = ['목', '허리', '골반']
    board.picks!.eswt = { hits: [], counts: ['1부위'] }
    view.renderArrange(app, board, {})
    expect([sub('pt'), sub('ds'), sub('eswt'), sub('trac')]).toEqual(['ICE·HP·TENS', '20분', '타수·부위 수', '목·허리·골반'])
    const head = app.querySelector('table.arr > thead')
    view.renderArrange(app, fx.arrangeMockupBoard('11:04:20'), {})
    // 뼈대(머리)는 그대로 두고 글만 바꾼다
    expect(app.querySelector('table.arr > thead')).toBe(head)
    expect([sub('pt'), sub('ds'), sub('eswt'), sub('trac')]).toEqual(['ICE·HP', '30분·50분', '타수·부위 수', '목·허리'])
    const none = fx.arrangeMockupBoard('11:04:25')
    delete none.picks
    view.renderArrange(app, none, {})
    expect([sub('pt'), sub('ds'), sub('trac')]).toEqual([null, null, null])
    expect(textOf(app, 'th.c-pt')).toBe('PT')
    // 넘치면 줄임표 (한 줄)
    for (const col of ['pt', 'ds', 'trac'] as const) {
      expect(cssValue(`.arr th.c-${col} .sm`, 'white-space'), col).toBe('nowrap')
      expect(cssValue(`.arr th.c-${col} .sm`, 'text-overflow'), col).toBe('ellipsis')
      expect(cssValue(`.arr th.c-${col} .sm`, 'overflow'), col).toBe('hidden')
    }
  })

  it('AC-3308.2: [오늘 치료 종료 N명]은 접힌 단추(aria-expanded)이고 누르면 그 자리에서 펼쳐 끝난 줄(종료 시각·이름·차트번호·[다시 넣기])을 보이며 onEnded(펼침)를 부른다', () => {
    const onEnded = vi.fn()
    const { page } = draw(fx.arrangeMockupBoard(), { onEnded })
    const toggle = () => page.querySelector<HTMLButtonElement>('section.ended > button.ended-h')!
    expect(toggle().getAttribute('type')).toBe('button')
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
    expect(toggle().textContent).toBe('오늘 치료 종료 2명 ▾')
    expect(shapeOf(page.querySelector('section.ended'))).toEqual(['button.ended-h'])
    toggle().click()
    expect(onEnded).toHaveBeenLastCalledWith(true)
    expect(toggle().getAttribute('aria-expanded')).toBe('true')
    expect(toggle().textContent).toBe('오늘 치료 종료 2명 ▴')
    const items = [...page.querySelectorAll('section.ended > ul.ended-list > li')]
    expect(items.map((li) => shapeOf(li))).toEqual([
      ['span.e-t', 'span.e-n', 'span.e-c', 'button.restore'],
      ['span.e-t', 'span.e-n', 'span.e-c', 'button.restore'],
    ])
    expect(items.map((li) => textsOf(li, ':scope > *'))).toEqual([
      ['10:40 종료', '가상환자30', '910030', '다시 넣기'],
      ['10:15 종료', '가상환자29', '910029', '다시 넣기'],
    ])
    toggle().click()
    expect(onEnded).toHaveBeenLastCalledWith(false)
    expect(page.querySelector('section.ended > ul')).toBeNull()

    // 펼친 채 그리기(view.endedOpen)·끝난 줄이 없으면 "아직 없어요"
    const open = draw(fx.arrangeMockupBoard(), { endedOpen: true }).page
    expect(open.querySelectorAll('section.ended li').length).toBe(2)
    const empty = draw(fx.withArrange(fx.arrangeMockupBoard(), { rows: [], ended: [] }), { endedOpen: true }).page
    expect(textOf(empty, 'section.ended > button.ended-h')).toBe('오늘 치료 종료 0명 ▴')
    expect(textOf(empty, 'section.ended > p.empty-note')).toBe('아직 없어요')
    expect(empty.querySelector<HTMLElement>(':scope > p.empty-note')!.hidden).toBe(false)
    expect(trs(empty)).toEqual([])
  })

  it('AC-3308.3: 줄은 판의 arrange.rows 차례(접수 순)이고, 목록 줄이 없는 열쇠는 그리지 않는다', () => {
    const { page } = draw()
    expect(textsOf(page, 'table.arr > tbody > tr .arr-name')).toEqual(ACTIVE_NAMES)
    expect(trs(page).map((tr) => tr.getAttribute('data-k'))).toEqual([K.a, K.b, K.c, K.d, K.e, K.f, K.g, K.h])
    expect(trs(page).every((tr) => shapeOf(tr).join() === ['td.c-t', 'td.c-nm', ...COLS.map((c) => `td.c-${c}`), 'td.c-memo', 'td.c-end'].join())).toBe(true)
    const board = fx.arrangeMockupBoard()
    board.arrange!.rows.push({ ...board.arrange!.rows[0]!, k: fx.fakeKey(99) })
    expect(textsOf(draw(board).page, 'table.arr > tbody > tr .arr-name')).toEqual(ACTIVE_NAMES)
  })

  it('AC-3308.3: 접수 칸은 접수 시각 단추이고, 자리비움이면 "자리비움"과 그 시각이 더 있고 줄이 away다', () => {
    const { page } = draw()
    const plain = trOf(page, '가상환자21').querySelector('td.c-t > button.t-btn')!
    expect(plain.getAttribute('type')).toBe('button')
    expect(shapeOf(plain)).toEqual(['span.t-time'])
    expect(textOf(plain, '.t-time')).toBe('09:12')
    expect(trOf(page, '가상환자21').classList.contains('away')).toBe(false)
    const away = trOf(page, '가상환자24')
    expect(away.classList.contains('away')).toBe(true)
    const button = away.querySelector('td.c-t > button.t-btn')!
    expect(shapeOf(button)).toEqual(['span.t-time', 'span.away-tag'])
    expect(textOf(button, '.t-time')).toBe('10:02')
    const tag = button.querySelector('.away-tag')!
    expect([...tag.childNodes].map((n) => (n instanceof Element ? n.tagName.toLowerCase() : n.textContent))).toEqual(['자리비움', 'br', '10:50'])
  })

  it('AC-3308.3: 성함 칸은 기록부 여는 단추(차트번호·상태 이름표 / 이름·"나이 · 성별"·신환 표시·›)와 그 아래 따로 [PT 먼저] 단추다', () => {
    const { page } = draw()
    const cell = trOf(page, '가상환자23').querySelector('td.c-nm')!
    expect(shapeOf(cell)).toEqual(['button.nm-btn', 'button.ptf-btn.none'])
    const nm = cell.querySelector('button.nm-btn')!
    expect(nm.getAttribute('type')).toBe('button')
    expect(shapeOf(nm)).toEqual(['span.l1', 'span.l2'])
    expect(shapeOf(nm.querySelector('.l1'))).toEqual(['span.chart', 'span.status.status-hold'])
    expect(textsOf(nm, '.l1 > span')).toEqual(['910023', '진료보류'])
    expect(shapeOf(nm.querySelector('.l2'))).toEqual(['span.arr-name', 'span.meta', 'span.new-badge', 'span.open'])
    expect(textsOf(nm, '.l2 > span')).toEqual(['가상환자23', '38 · 여', '신환', '›'])
    expect(nm.querySelector('.open')?.getAttribute('aria-hidden')).toBe('true')
    // 재진은 신환 표시가 없고, 상태 이름표는 줄의 칸 모양이다
    const again = trOf(page, '가상환자21').querySelector('button.nm-btn')!
    expect(shapeOf(again.querySelector('.l2'))).toEqual(['span.arr-name', 'span.meta', 'span.open'])
    expect(textsOf(again, '.l1 > span')).toEqual(['910021', '수납완료'])
    expect(again.querySelector('.l1 > .status')?.className).toBe('status status-done')
    expect(textOf(again, '.meta')).toBe('64 · 여')
    expect(trOf(page, '가상환자22').querySelector('.l1 > .status')?.className).toBe('status status-pay')
    expect(trOf(page, '가상환자26').querySelector('.l1 > .status')?.className).toBe('status status-wait')
  })

  it('AC-3308.3 · AC-3310.2: view.rxNew의 줄은 성함 칸 첫 줄에 "처방 나옴" 이름표가 있고, view.flash의 줄은 반짝(flash)이다', () => {
    const { page } = draw(fx.arrangeMockupBoard(), { rxNew: [K.e], flash: [K.e] })
    const tr = trOf(page, '가상환자25')
    expect(shapeOf(tr.querySelector('.nm-btn > .l1'))).toEqual(['span.chart', 'span.status.status-hold', 'span.rx-new'])
    expect(textOf(tr, '.rx-new')).toBe('처방 나옴')
    expect(tr.classList.contains('flash')).toBe(true)
    expect(page.querySelectorAll('.rx-new').length).toBe(1)
    expect(page.querySelectorAll('tr.flash').length).toBe(1)
    const plain = draw(fx.arrangeMockupBoard(), { rxNew: [K.e] }).page
    expect(plain.querySelectorAll('tr.flash').length).toBe(0)
    expect(plain.querySelectorAll('.rx-new').length).toBe(1)
  })

  it('AC-3308.3 · AC-3605.2: 비고 칸은 기록부 여는 단추(button.memo-btn) 안에 메모 상자(있을 때)와 "지난번 …"(줄은 " / "로 이음), 지난 증상이 없으면 "첫 방문이라 지난 증상이 없어요"다. 끝 칸은 [치료 종료]이고 allDone이면 노랑(is-go)이다', () => {
    const { page } = draw()
    const td = trOf(page, '가상환자21').querySelector('td.c-memo')!
    expect(shapeOf(td)).toEqual(['button.memo-btn'])
    const memo = td.querySelector(':scope > button.memo-btn')!
    expect(memo.getAttribute('type')).toBe('button')
    expect(shapeOf(memo)).toEqual(['div.arr-memo', 'div.lastsym'])
    expect(textOf(memo, '.arr-memo')).toBe('오른 무릎 주사 2차')
    expect(shapeOf(memo.querySelector('.lastsym'))).toEqual(['span.lastsym-label'])
    expect(textOf(memo, '.lastsym-label')).toBe('지난번')
    expect(textOf(memo, '.lastsym')).toBe('지난번Rt knee pain / 계단·앉았다 일어날 때 심함 / xr: OA gr.2')
    // 메모가 없으면 상자도 없다
    expect(shapeOf(trOf(page, '가상환자26').querySelector('td.c-memo > button.memo-btn'))).toEqual(['div.lastsym'])
    const first = trOf(page, '가상환자23').querySelector('td.c-memo .lastsym')!
    expect(first.textContent).toBe('첫 방문이라 지난 증상이 없어요')
    expect(first.querySelector('.lastsym-label')).toBeNull()

    const ends = trs(page).map((tr) => tr.querySelector<HTMLButtonElement>('td.c-end > button.end-btn')!)
    expect(ends.map((b) => [b.getAttribute('type'), b.textContent, b.className])).toEqual(
      ACTIVE_NAMES.map((_, i) => ['button', '치료종료', i === 0 ? 'end-btn is-go' : 'end-btn']),
    )
    expect([...ends[0]!.childNodes].map((n) => (n instanceof Element ? n.tagName.toLowerCase() : n.textContent))).toEqual(['치료', 'br', '종료'])
  })
})

// ---- 칸 (AC-3308.4) -----------------------------------------------------------------------------------

describe('REQ-3308 치료 칸 그리기', () => {
  it('AC-3308.14: 접수 칸은 접수 시각 아래 목록 줄의 기다린 글이고(진료보류 "보류 N째"는 "N째 대기"), long이면 주황, 자리비움은 그 아래다. 글이 비면 없다', () => {
    const board = fx.arrangeMockupBoard()
    const setList = (k: string, patch: { waited: string; long: boolean }) => {
      for (const rows of Object.values(board.lists)) for (const r of rows) if (r.k === k) Object.assign(r, patch)
    }
    setList(K.d, { waited: '보류 1시간 2분째', long: true })
    setList(K.f, { waited: '33분째 대기', long: false })
    setList(K.b, { waited: '수납 1시간 39분째', long: false })
    setList(K.a, { waited: '09:40 수납', long: false })
    const { page } = draw(board)
    const t = (name: string) => trOf(page, name).querySelector('td.c-t > button.t-btn')!

    expect(shapeOf(t('가상환자24'))).toEqual(['span.t-time', 'span.wt.is-long', 'span.away-tag'])
    expect(textOf(t('가상환자24'), '.wt')).toBe('1시간 2분째 대기')
    expect(shapeOf(t('가상환자26'))).toEqual(['span.t-time', 'span.wt'])
    expect(textOf(t('가상환자26'), '.wt')).toBe('33분째 대기')
    expect(textOf(t('가상환자22'), '.wt')).toBe('수납 1시간 39분째')
    expect(textOf(t('가상환자21'), '.wt')).toBe('09:40 수납')
    expect(shapeOf(t('가상환자23'))).toEqual(['span.t-time'])
  })

  it('AC-3308.4: 빈 칸은 "+", 준비(todo)는 "준비"와 글, 준비완료(ready)는 "준비완료 HH:MM"과 부위, 완료(done)는 "✓ HH:MM"과 작은 글이다', () => {
    const { page } = draw()
    const empty = cellOf(page, '가상환자28', 'xray')
    expect(empty.className).toBe('cell empty')
    expect(cellParts(empty)).toEqual(['span.plus:+'])

    expect(cellOf(page, '가상환자21', 'xray').className).toBe('cell done')
    expect(cellParts(cellOf(page, '가상환자21', 'xray'))).toEqual(['span.st:✓ 09:35'])
    expect(cellParts(cellOf(page, '가상환자21', 'sono'))).toEqual(['span.st:✓ 09:55', 'span.det.sm:오른 무릎'])
    expect(cellParts(cellOf(page, '가상환자21', 'pt'))).toEqual(['span.st:✓ 10:10', 'span.det.sm:HP'])

    expect(cellOf(page, '가상환자22', 'carm').className).toBe('cell ready')
    expect(cellParts(cellOf(page, '가상환자22', 'carm'))).toEqual(['span.ord:1번', 'span.st:준비완료 11:01', 'span.det:허리 L4-5'])

    expect(cellOf(page, '가상환자22', 'pt').className).toBe('cell todo')
    expect(cellParts(cellOf(page, '가상환자22', 'pt'))).toEqual(['span.st:준비', 'span.det:HP'])
    expect(cellParts(cellOf(page, '가상환자22', 'trac'))).toEqual(['span.st:준비', 'span.det:허리'])
    expect(cellParts(cellOf(page, '가상환자25', 'carm'))).toEqual(['span.ord:2번', 'span.st:준비', 'span.det:목 C5-6'])
  })

  it('AC-3308.4 · AC-3503.4: SONO에 부위가 없으면 [부위 고르기], C-ARM에 시술이 없으면 [시술 고르기] 단추, 순서(ord)는 왼쪽 위 "N번"이다. 다른 칸은 그 단추가 없다', () => {
    const { page } = draw()
    const sono = cellOf(page, '가상환자23', 'sono')
    expect(sono.className).toBe('cell todo')
    expect(cellParts(sono)).toEqual(['span.ord:1번', 'span.st:준비', 'button.part-btn:부위 고르기'])
    expect(sono.querySelector('button.part-btn')?.getAttribute('type')).toBe('button')
    expect(page.querySelectorAll('button.part-btn').length).toBe(1)
    // 준비완료여도 부위가 없으면 단추
    const board = fx.arrangeMockupBoard()
    arrRow(board, K.b)!.cells.carm!.part = null
    expect(cellParts(cellOf(draw(board).page, '가상환자22', 'carm'))).toEqual(['span.ord:1번', 'span.st:준비완료 11:01', 'button.part-btn:시술 고르기'])
  })

  it('AC-3308.4: 칸 시각을 모르면(at null) "준비"·"준비완료"·"✓"만 쓰고 시각 자리에 null 글자를 쓰지 않는다', () => {
    const board = fx.arrangeMockupBoard()
    arrRow(board, K.b)!.cells.carm!.at = null
    arrRow(board, K.b)!.cells.pt!.at = null
    arrRow(board, K.a)!.cells.xray!.at = null
    const { page } = draw(board)
    expect(cellParts(cellOf(page, '가상환자22', 'carm'))).toEqual(['span.ord:1번', 'span.st:준비완료', 'span.det:허리 L4-5'])
    expect(cellParts(cellOf(page, '가상환자22', 'pt'))).toEqual(['span.st:준비', 'span.det:HP'])
    expect(cellParts(cellOf(page, '가상환자21', 'xray'))).toEqual(['span.st:✓'])
    expect(page.textContent).not.toContain('null')
  })

  it('AC-3308.4: X-RAY·SONO·C-ARM에 직접 넣은 칸은 점선(manual)과 "직접"이고, 직접 칸(PT·도수·충격파·견인)은 manual이어도 점선·"직접"이 없다', () => {
    const { page } = draw()
    const xray = cellOf(page, '가상환자24', 'xray')
    expect(xray.className).toBe('cell done manual')
    expect(cellParts(xray)).toEqual(['span.mn:직접', 'span.st:✓ 10:28'])
    const sono = cellOf(page, '가상환자27', 'sono')
    expect(sono.className).toBe('cell todo manual')
    expect(cellParts(sono)).toEqual(['span.ord:2번', 'span.mn:직접', 'span.st:준비', 'span.det:왼 어깨'])
    for (const [name, col] of [
      ['가상환자22', 'pt'],
      ['가상환자22', 'trac'],
      ['가상환자24', 'ds'],
      ['가상환자23', 'eswt'],
    ] as const) {
      const cell = cellOf(page, name, col)
      expect(cell.classList.contains('manual'), `${name} ${col}`).toBe(false)
      expect(cell.querySelector('.mn'), `${name} ${col}`).toBeNull()
    }
  })

  it('AC-3308.4: 칸은 누르는 곳(role=button, tabindex=0)이고 SONO 칸은 c-sono, C-ARM 칸은 c-carm 자리에 있다', () => {
    const { page } = draw()
    const cells = [...page.querySelectorAll<HTMLElement>('table.arr > tbody .cell')]
    expect(cells.length).toBe(ACTIVE_NAMES.length * COLS.length)
    for (const cell of cells) {
      expect(cell.getAttribute('role')).toBe('button')
      expect(cell.getAttribute('tabindex')).toBe('0')
    }
    expect(cellOf(page, '가상환자23', 'sono').parentElement?.className).toBe('c-sono')
    expect(cellOf(page, '가상환자22', 'carm').parentElement?.className).toBe('c-carm')
    expect(cellOf(page, '가상환자28', 'xray').getAttribute('aria-label')).toBe('X-RAY 넣기')
  })
})

// ---- 누르기 (AC-3308.5 ~ 3308.8 · 3308.13) ---------------------------------------------------------------

describe('REQ-3308 칸 누르기', () => {
  it('AC-3308.5: 준비·준비완료 칸을 누르면(Enter·Space 포함) onCell(열쇠, 칸)을 한 번 부르고 기록부는 열지 않는다', () => {
    const onCell = vi.fn()
    const onChart = vi.fn()
    const { page } = draw(fx.arrangeMockupBoard(), { onCell, onChart })
    cellOf(page, '가상환자22', 'carm').click()
    expect(onCell).toHaveBeenLastCalledWith(K.b, 'carm')
    cellOf(page, '가상환자23', 'pt').click()
    expect(onCell).toHaveBeenLastCalledWith(K.c, 'pt')
    cellOf(page, '가상환자23', 'eswt').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(onCell).toHaveBeenLastCalledWith(K.c, 'eswt')
    cellOf(page, '가상환자22', 'trac').dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
    expect(onCell).toHaveBeenLastCalledWith(K.b, 'trac')
    expect(onCell).toHaveBeenCalledTimes(4)
    expect(onChart).not.toHaveBeenCalled()
    expect(sheetOf(page)).toBeNull()
  })

  it('AC-3308.5: planOf(step)은 SONO·C-ARM 준비 → 준비완료, 준비완료 → 완료, 다른 칸 준비 → 완료로 미리 그리고(시각은 판의 at), 띠 "{이름} · {칸} {준비완료로|완료로} 바꿨어요"와 앞 단계로 가는 set을 준다', () => {
    const board = fx.arrangeMockupBoard()
    const before = JSON.stringify(board)
    const sono = view.planOf(board, { k: K.c, op: 'step', col: 'sono' })
    expect(arrRow(sono.board, K.c)!.cells.sono).toMatchObject({ st: 'ready', at: '11:04' })
    expect(sono.toast).toBe('가상환자23 · SONO 준비완료로 바꿨어요')
    expect(sono.undo).toEqual({ k: K.c, op: 'set', col: 'sono', v: 'todo' })

    const carm = view.planOf(board, { k: K.b, op: 'step', col: 'carm' })
    expect(arrRow(carm.board, K.b)!.cells.carm).toMatchObject({ st: 'done', at: '11:04', ord: null })
    expect(carm.toast).toBe('가상환자22 · C-ARM 완료로 바꿨어요')
    expect(carm.undo).toEqual({ k: K.b, op: 'set', col: 'carm', v: 'ready' })

    const pt = view.planOf(board, { k: K.c, op: 'step', col: 'pt' })
    expect(arrRow(pt.board, K.c)!.cells.pt).toMatchObject({ st: 'done', at: '11:04', det: 'ICE' })
    expect(pt.toast).toBe('가상환자23 · PT 완료로 바꿨어요')
    expect(pt.undo).toEqual({ k: K.c, op: 'set', col: 'pt', v: 'todo' })

    // 모두 끝나면 allDone
    const ds = view.planOf(board, { k: K.d, op: 'step', col: 'ds' })
    expect(arrRow(ds.board, K.d)!.allDone).toBe(true)
    expect(arrRow(board, K.d)!.allDone).toBe(false)
    // 받은 판은 바꾸지 않는다
    expect(JSON.stringify(board)).toBe(before)
  })

  it('AC-3308.6: 완료 칸을 누르면 고르기 창 "{칸} · 완료"에 [준비로 되돌리기]·[준비완료로 되돌리기](SONO·C-ARM만)·[칸에서 빼기](직접 넣은 칸만)·[닫기]가 나온다', () => {
    const onSheet = vi.fn()
    const onCell = vi.fn()
    const { page } = draw(fx.arrangeMockupBoard(), { onSheet, onCell })
    cellOf(page, '가상환자21', 'sono').click()
    expect(onCell).not.toHaveBeenCalled()
    expect(onSheet).toHaveBeenLastCalledWith({ k: K.a, col: 'sono', kind: 'done' })
    const sheet = sheetOf(page)!
    expect(sheet.getAttribute('role')).toBe('dialog')
    expect(sheet.getAttribute('aria-modal')).toBe('true')
    expect(sheet.getAttribute('aria-label')).toBe('SONO · 완료')
    expect(shapeOf(sheet)).toEqual(['div.sheet-h', 'div.opts', 'button.sheet-x'])
    expect(textsOf(sheet, '.sheet-h > span')).toEqual(['SONO · 완료', '가상환자21 · 09:55에 완료로 바꿨어요'])
    expect(optionsOf(page)).toEqual(['준비로 되돌리기', '준비완료로 되돌리기'])
    expect(textOf(sheet, 'button.sheet-x')).toBe('닫기')
    expect(page.querySelectorAll('.sheet-back').length).toBe(1)

    const options = (name: string, col: Col) => {
      const p = draw().page
      cellOf(p, name, col).click()
      return optionsOf(p)
    }
    expect(options('가상환자21', 'xray')).toEqual(['준비로 되돌리기'])
    expect(options('가상환자21', 'pt')).toEqual(['준비로 되돌리기', '칸에서 빼기'])
    expect(options('가상환자24', 'xray')).toEqual(['준비로 되돌리기', '칸에서 빼기'])
  })

  it('AC-3308.6: 고르면 창을 닫고(onSheet(null)) onSet(열쇠, 칸, todo|ready)·onRemove(열쇠, 칸)를 부른다. [닫기]·바깥 누름·Esc는 닫기만 한다', () => {
    const onSheet = vi.fn()
    const onSet = vi.fn()
    const onRemove = vi.fn()
    const { page } = draw(fx.arrangeMockupBoard(), { onSheet, onSet, onRemove })
    cellOf(page, '가상환자21', 'sono').click()
    pick(page, '준비로 되돌리기')
    expect(onSet).toHaveBeenLastCalledWith(K.a, 'sono', 'todo')
    expect(onSheet).toHaveBeenLastCalledWith(null)
    expect(sheetOf(page)).toBeNull()
    cellOf(page, '가상환자21', 'sono').click()
    pick(page, '준비완료로 되돌리기')
    expect(onSet).toHaveBeenLastCalledWith(K.a, 'sono', 'ready')
    cellOf(page, '가상환자21', 'pt').click()
    pick(page, '칸에서 빼기')
    expect(onRemove).toHaveBeenLastCalledWith(K.a, 'pt')
    expect(onSet).toHaveBeenCalledTimes(2)
    expect(onRemove).toHaveBeenCalledTimes(1)

    cellOf(page, '가상환자21', 'xray').click()
    page.querySelector<HTMLButtonElement>('.sheet button.sheet-x')!.click()
    expect(sheetOf(page)).toBeNull()
    cellOf(page, '가상환자21', 'xray').click()
    page.querySelector<HTMLElement>('.sheet-back')!.click()
    expect(sheetOf(page)).toBeNull()
    cellOf(page, '가상환자21', 'xray').click()
    // 창 안을 누르면 닫히지 않는다
    sheetOf(page)!.click()
    expect(sheetOf(page)).not.toBeNull()
    sheetOf(page)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(sheetOf(page)).toBeNull()
    expect(onSheet).toHaveBeenLastCalledWith(null)
    expect(onSet).toHaveBeenCalledTimes(2)
    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it('AC-3308.6: view.sheet로 다시 그리면 창이 그대로 있고, 그 줄이 판에 없거나 칸이 맞지 않으면 창을 그리지 않는다', () => {
    const open = draw(fx.arrangeMockupBoard(), { sheet: { k: K.a, col: 'sono', kind: 'done' } }).page
    expect(textOf(open, '.sheet-h > span')).toBe('SONO · 완료')
    expect(sheetOf(draw(fx.arrangeMockupBoard(), { sheet: { k: fx.fakeKey(99), col: 'sono', kind: 'done' } }).page)).toBeNull()
    // 완료 창인데 칸이 완료가 아니다 · 넣기 창인데 칸이 이미 있다 · 부위 창인데 칸이 없다
    expect(sheetOf(draw(fx.arrangeMockupBoard(), { sheet: { k: K.c, col: 'sono', kind: 'done' } }).page)).toBeNull()
    expect(sheetOf(draw(fx.arrangeMockupBoard(), { sheet: { k: K.c, col: 'sono', kind: 'add' } }).page)).toBeNull()
    expect(sheetOf(draw(fx.arrangeMockupBoard(), { sheet: { k: K.h, col: 'sono', kind: 'part' } }).page)).toBeNull()
  })

  it('AC-3308.6: planOf(set)은 앞 단계로 미리 그리고 띠 "{이름} · {칸} {준비로|준비완료로} 되돌렸어요"와 완료로 가는 set을, planOf(remove)는 칸을 지우고 띠 "{이름} · {칸} 칸에서 뺐어요"(되돌리기 없음)를 준다', () => {
    const board = fx.arrangeMockupBoard()
    const todo = view.planOf(board, { k: K.a, op: 'set', col: 'sono', v: 'todo' })
    expect(arrRow(todo.board, K.a)!.cells.sono).toMatchObject({ st: 'todo' })
    expect(arrRow(todo.board, K.a)!.allDone).toBe(false)
    expect(todo.toast).toBe('가상환자21 · SONO 준비로 되돌렸어요')
    expect(todo.undo).toEqual({ k: K.a, op: 'set', col: 'sono', v: 'done' })
    const ready = view.planOf(board, { k: K.a, op: 'set', col: 'sono', v: 'ready' })
    expect(arrRow(ready.board, K.a)!.cells.sono).toMatchObject({ st: 'ready', at: '11:04' })
    expect(ready.toast).toBe('가상환자21 · SONO 준비완료로 되돌렸어요')
    expect(ready.undo).toEqual({ k: K.a, op: 'set', col: 'sono', v: 'done' })
    const removed = view.planOf(board, { k: K.a, op: 'remove', col: 'pt' })
    expect(arrRow(removed.board, K.a)!.cells.pt).toBeNull()
    expect(removed.toast).toBe('가상환자21 · PT 칸에서 뺐어요')
    expect(removed.undo).toBeNull()
  })

  it('AC-3308.7 · AC-3604.4: 빈 칸을 누르면 고르기 창 "{칸} 직접 넣기"에 그 칸의 목록(X-RAY는 "X-ray 찍기", PT·도수·견인은 판 picks)이 나오고 고르면 onAdd(열쇠, 칸, 글)를 부른다(충격파는 두 줄 창 AC-3402.2, SONO·C-ARM은 넣기 창 AC-3503.1·AC-3504.1)', () => {
    for (const col of ['xray', 'pt', 'ds', 'trac'] as const) {
      const onAdd = vi.fn()
      const onSheet = vi.fn()
      const { page } = draw(fx.arrangeMockupBoard(), { onAdd, onSheet })
      cellOf(page, '가상환자28', col).click()
      expect(onSheet, col).toHaveBeenLastCalledWith({ k: K.h, col, kind: 'add' })
      expect(textsOf(page, '.sheet .sheet-h > span'), col).toEqual([`${COL_NAMES[col]} 직접 넣기`, '가상환자28 · 처방에 없어도 넣을 수 있어요'])
      expect(optionsOf(page), col).toEqual(CHOICES[col])
      expect(page.querySelector('.sheet .opts')?.className, col).toBe(CHOICES[col].length > 6 ? 'opts many' : 'opts')
      const last = CHOICES[col].at(-1)!
      pick(page, last)
      expect(onAdd, col).toHaveBeenCalledTimes(1)
      expect(onAdd, col).toHaveBeenLastCalledWith(K.h, col, last)
      expect(sheetOf(page), col).toBeNull()
      expect(onSheet, col).toHaveBeenLastCalledWith(null)
    }
  })

  it('AC-3308.7 · AC-3503.3: planOf(add)는 직접 넣은 준비 칸(manual, 직접 칸은 고른 글, SONO·C-ARM은 부위·시술과 이름표)을 미리 그리고 띠 "{이름} · {칸} 직접 넣었어요"와 remove를 준다', () => {
    const board = fx.arrangeMockupBoard()
    const pt = view.planOf(board, { k: K.h, op: 'add', col: 'pt', v: 'HP' })
    expect(arrRow(pt.board, K.h)!.cells.pt).toEqual({ st: 'todo', det: 'HP', part: null, at: '11:04', ord: null, manual: true, tags: [] })
    expect(pt.toast).toBe('가상환자28 · PT 직접 넣었어요')
    expect(pt.undo).toEqual({ k: K.h, op: 'remove', col: 'pt' })
    expect(arrRow(view.planOf(board, { k: K.h, op: 'add', col: 'sono', v: '왼 어깨' }).board, K.h)!.cells.sono).toMatchObject({ det: '', part: '왼 어깨', manual: true, tags: [] })
    expect(arrRow(view.planOf(board, { k: K.h, op: 'add', col: 'carm', v: '허리', t: 'TP' }).board, K.h)!.cells.carm).toMatchObject({ det: '', part: '허리', tags: ['TP'] })
    // "부위는 나중에"는 이제 맞지 않는 쓰기다
    expect(view.planOf(board, { k: K.h, op: 'add', col: 'carm', v: LATER }).toast).toBeNull()
    expect(arrRow(view.planOf(board, { k: K.h, op: 'add', col: 'xray', v: 'X-ray 찍기' }).board, K.h)!.cells.xray).toMatchObject({ st: 'todo', det: '', part: null })
    expect(view.planOf(board, { k: K.h, op: 'add', col: 'xray', v: 'X-ray 찍기' }).toast).toBe('가상환자28 · X-RAY 직접 넣었어요')
  })

  it('AC-3308.7 · AC-3504.3: planOf(part)는 부위를 바꿔 그리고 띠 "{이름} · {칸} 부위: {부위}"를 준다. 앞 부위가 지금 목록에 맞는 글일 때만 그 부위로 가는 되돌리기가 있다', () => {
    const board = fx.arrangeMockupBoard()
    const none = view.planOf(board, { k: K.c, op: 'part', col: 'sono', v: '오른 어깨' })
    expect(arrRow(none.board, K.c)!.cells.sono!.part).toBe('오른 어깨')
    expect(none.toast).toBe('가상환자23 · SONO 부위: 오른 어깨')
    expect(none.undo).toBeNull()
    expect(view.planOf(board, { k: K.e, op: 'part', col: 'carm', v: '목' }).undo).toBeNull()
    expect(view.planOf(board, { k: K.g, op: 'part', col: 'sono', v: '오른 어깨' }).undo).toEqual({ k: K.g, op: 'part', col: 'sono', v: '왼 어깨' })
  })

  it('AC-3308.7 · AC-3503.1 · AC-3504.1 · AC-3604.4: 화면 arrange.js는 고정 목록(옛 CHOICES·PARTS·"부위는 나중에")을 내보내지 않는다. 목록은 판 picks뿐이다', () => {
    expect(view.CHOICES).toBeUndefined()
    expect(view.PARTS).toBeUndefined()
    expect(readWww('arrange.js')).not.toMatch(/ESWT_(?:HITS|COUNTS)|CHOICES/)
  })

  it('AC-3603.1 · AC-3604.4: 가짜 판의 기본 picks는 AC-3603.1 값 그대로다(차례 포함, C#은 TASK-2 시험이 같은 값에 고정한다)', () => {
    const d = fx.defaultPicks()
    expect(d.pt).toEqual(['ICE', 'HP'])
    expect(d.ds).toEqual(['30분', '50분'])
    expect(d.eswt).toEqual({ hits: ['2000타', '3000타', '4000타', '6000타'], counts: ['1부위', '2부위', '3부위', '4부위'] })
    expect(d.trac).toEqual(['목', '허리'])
    expect(Object.keys(d)).toEqual(['carm', 'sono', 'pt', 'ds', 'eswt', 'trac'])
    expect(fx.arrangeMockupBoard().picks).toEqual(d)
  })

  it('AC-3604.4: PT·도수·충격파·견인 넣기 창 단추는 판 picks 목록이고, picks가 없으면 그 넣기 창이 열리지 않는다(X-RAY 넣기는 그대로). planOf(add)도 판 picks로 본다', () => {
    const board = fx.arrangeMockupBoard()
    board.picks!.pt = ['ICE', 'HP', 'TENS']
    board.picks!.ds = ['20분']
    board.picks!.trac = ['골반']
    const onAdd = vi.fn()
    for (const [col, want] of [
      ['pt', ['ICE', 'HP', 'TENS']],
      ['ds', ['20분']],
      ['trac', ['골반']],
    ] as const) {
      const { page } = draw(board, { onAdd })
      cellOf(page, '가상환자28', col).click()
      expect(optionsOf(page), col).toEqual(want)
      pick(page, want.at(-1)!)
      expect(onAdd, col).toHaveBeenLastCalledWith(K.h, col, want.at(-1))
      document.body.replaceChildren()
    }
    expect(arrRow(view.planOf(board, { k: K.h, op: 'add', col: 'pt', v: 'TENS' }).board, K.h)!.cells.pt).toMatchObject({ det: 'TENS', manual: true })
    expect(view.planOf(board, { k: K.h, op: 'add', col: 'pt', v: 'ICE' }).toast).toBe('가상환자28 · PT 직접 넣었어요')
    for (const [col, v] of [
      ['pt', '30분'],
      ['ds', '30분'],
      ['trac', '목'],
      ['pt', ''],
    ] as const) {
      const plan = view.planOf(board, { k: K.h, op: 'add', col, v })
      expect(plan.toast, `${col} ${v}`).toBeNull()
      expect(plan.board, `${col} ${v}`).toBe(board)
    }

    const none = fx.arrangeMockupBoard()
    delete none.picks
    const onSheet = vi.fn()
    const bare = draw(none, { onSheet }).page
    for (const col of ['pt', 'ds', 'eswt', 'trac'] as const) cellOf(bare, '가상환자28', col).click()
    expect(sheetOf(bare)).toBeNull()
    expect(onSheet).not.toHaveBeenCalled()
    for (const sheet of [
      { k: K.h, col: 'pt', kind: 'add' as const },
      { k: K.h, col: 'eswt', kind: 'add' as const, hit: null, count: '1부위' },
    ])
      expect(sheetOf(draw(none, { sheet }).page), sheet.col).toBeNull()
    cellOf(bare, '가상환자28', 'xray').click()
    expect(optionsOf(bare)).toEqual(['X-ray 찍기'])
    for (const [col, v] of [
      ['pt', 'ICE'],
      ['ds', '30분'],
      ['eswt', '2부위'],
      ['trac', '목'],
    ] as const)
      expect(view.planOf(none, { k: K.h, op: 'add', col, v }).toast, col).toBeNull()
    expect(view.planOf(none, { k: K.h, op: 'add', col: 'xray', v: 'X-ray 찍기' }).toast).toBe('가상환자28 · X-RAY 직접 넣었어요')
  })

  it('AC-3308.15: [오늘 치료 종료]의 수납완료로 빠진 줄은 "HH:MM 수납"(시각이 없으면 "수납완료"), [치료 종료]로 뺀 줄은 "HH:MM 종료"이고 [다시 넣기]는 둘 다 onRestore(열쇠)다', () => {
    const base = fx.arrangeMockupBoard()
    const board = fx.withArrange(base, {
      rows: base.arrange!.rows,
      ended: [
        { k: K.j, endedAt: '10:52', paid: true },
        { k: K.i, endedAt: '10:15', paid: false },
        { k: K.h, endedAt: null, paid: true },
      ],
    })
    const onRestore = vi.fn()
    const { page } = draw(board, { onRestore, endedOpen: true })
    expect(textOf(page, 'section.ended > button.ended-h')).toBe('오늘 치료 종료 3명 ▴')
    const items = [...page.querySelectorAll('section.ended > ul.ended-list > li')]
    expect(items.map((li) => textsOf(li, ':scope > span.e-t'))).toEqual([['10:52 수납'], ['10:15 종료'], ['수납완료']])
    items[2]!.querySelector<HTMLButtonElement>('button.restore')!.click()
    expect(onRestore).toHaveBeenLastCalledWith(K.h)
    items[0]!.querySelector<HTMLButtonElement>('button.restore')!.click()
    expect(onRestore).toHaveBeenLastCalledWith(K.j)
  })

  it('AC-3308.15: [치료 종료]를 누르면 바로 그리는 끝난 줄은 paid: false이고, 수납완료로 빠진 줄의 [다시 넣기]도 같은 end off·띠를 준다', () => {
    const base = fx.arrangeMockupBoard()
    const board = fx.withArrange(base, { rows: base.arrange!.rows, ended: [{ k: K.j, endedAt: null, paid: true }] })
    const end = view.planOf(board, { k: K.a, op: 'end', v: 'on' })
    expect(end.board.arrange!.ended[0]).toEqual({ k: K.a, endedAt: '11:04', paid: false })
    const back = view.planOf(board, { k: K.j, op: 'end', v: 'off' })
    expect(back.board.arrange!.ended).toEqual([])
    expect(back.toast).toBe('가상환자30 님을 표에 다시 넣었어요')
    expect(back.undo).toEqual({ k: K.j, op: 'end', v: 'on' })
  })

  it('AC-3308.8: 접수 칸은 onAway(열쇠, on|off), [치료 종료]는 onEnd(열쇠), [다시 넣기]는 onRestore(열쇠)를 부른다', () => {
    const onAway = vi.fn()
    const onEnd = vi.fn()
    const onRestore = vi.fn()
    const { page } = draw(fx.arrangeMockupBoard(), { onAway, onEnd, onRestore, endedOpen: true })
    trOf(page, '가상환자21').querySelector<HTMLButtonElement>('button.t-btn')!.click()
    expect(onAway).toHaveBeenLastCalledWith(K.a, 'on')
    trOf(page, '가상환자24').querySelector<HTMLButtonElement>('button.t-btn')!.click()
    expect(onAway).toHaveBeenLastCalledWith(K.d, 'off')
    trOf(page, '가상환자22').querySelector<HTMLButtonElement>('button.end-btn')!.click()
    expect(onEnd).toHaveBeenLastCalledWith(K.b)
    page.querySelector<HTMLButtonElement>('section.ended li button.restore')!.click()
    expect(onRestore).toHaveBeenLastCalledWith(K.j)
    expect([onAway.mock.calls.length, onEnd.mock.calls.length, onRestore.mock.calls.length]).toEqual([2, 1, 1])
  })

  it('AC-3308.8 · AC-3602.3: planOf(away·end)는 자리비움·돌아옴·줄 빼기·다시 넣기를 미리 그리고 띠 "{이름} · 자리비움 HH:MM"·"{이름} · 돌아옴 HH:MM"·"{이름} 님을 표에서 뺐어요"·"{이름} 님을 표에 다시 넣었어요"와 되돌리기 쓰기(자리비움은 away clear)를 준다', () => {
    const board = fx.arrangeMockupBoard()
    const on = view.planOf(board, { k: K.a, op: 'away', v: 'on' })
    expect(arrRow(on.board, K.a)!.away).toBe('11:04')
    expect(on.toast).toBe('가상환자21 · 자리비움 11:04')
    expect(on.undo).toEqual({ k: K.a, op: 'away', v: 'clear' })
    const off = view.planOf(board, { k: K.d, op: 'away', v: 'off' })
    expect(arrRow(off.board, K.d)!.away).toBeNull()
    expect(off.toast).toBe('가상환자24 · 돌아옴 11:04')
    expect(off.undo).toEqual({ k: K.d, op: 'away', v: 'on' })
    const end = view.planOf(board, { k: K.a, op: 'end', v: 'on' })
    expect(arrRow(end.board, K.a)).toBeNull()
    expect(end.board.arrange!.ended[0]).toEqual({ k: K.a, endedAt: '11:04', paid: false })
    expect(end.toast).toBe('가상환자21 님을 표에서 뺐어요')
    expect(end.undo).toEqual({ k: K.a, op: 'end', v: 'off' })
    const back = view.planOf(board, { k: K.j, op: 'end', v: 'off' })
    expect(back.board.arrange!.ended.map((e) => e.k)).toEqual([K.i])
    expect(back.toast).toBe('가상환자30 님을 표에 다시 넣었어요')
    expect(back.undo).toEqual({ k: K.j, op: 'end', v: 'on' })
  })

  it('AC-3308.8: 되돌리기 띠(view.toast)는 글과 [되돌리기](누르면 onUndo)이고, 되돌릴 것이 없으면 글만이다', () => {
    const onUndo = vi.fn()
    const { page } = draw(fx.arrangeMockupBoard(), { toast: { text: '가상환자21 · 자리비움 11:04', undo: true }, onUndo })
    const toast = page.querySelector('.toast')!
    expect(toast.getAttribute('role')).toBe('status')
    expect(shapeOf(toast)).toEqual(['span.toast-text', 'button.toast-undo'])
    expect(textOf(toast, '.toast-text')).toBe('가상환자21 · 자리비움 11:04')
    expect(textOf(toast, 'button.toast-undo')).toBe('되돌리기')
    toast.querySelector<HTMLButtonElement>('button.toast-undo')!.click()
    expect(onUndo).toHaveBeenCalledTimes(1)
    const plain = draw(fx.arrangeMockupBoard(), { toast: { text: '저장하지 못했어요. 다시 눌러 주세요', undo: false } }).page
    expect(shapeOf(plain.querySelector('.toast'))).toEqual(['span.toast-text'])
    expect(draw().page.querySelector('.toast')).toBeNull()
  })

  it('AC-3308.13: [PT 먼저]는 표시가 없으면 점선 "PT 먼저", up이면 보라 "↑ PT 올라감 HH:MM", down이면 초록 "↓ 내려옴 HH:MM"이고 누르면 onPtf(열쇠, up|down|off)를 부르며 기록부는 열지 않는다', () => {
    const onPtf = vi.fn()
    const onChart = vi.fn()
    const { page } = draw(fx.arrangeMockupBoard(), { onPtf, onChart })
    const ptf = (name: string) => trOf(page, name).querySelector<HTMLButtonElement>('td.c-nm > button.ptf-btn')!
    expect([ptf('가상환자21'), ptf('가상환자26'), ptf('가상환자27')].map((b) => [b.className, b.textContent, b.getAttribute('type')])).toEqual([
      ['ptf-btn none', 'PT 먼저', 'button'],
      ['ptf-btn up', '↑ PT 올라감 10:40', 'button'],
      ['ptf-btn down', '↓ 내려옴 10:58', 'button'],
    ])
    ptf('가상환자21').click()
    expect(onPtf).toHaveBeenLastCalledWith(K.a, 'up')
    ptf('가상환자26').click()
    expect(onPtf).toHaveBeenLastCalledWith(K.f, 'down')
    ptf('가상환자27').click()
    expect(onPtf).toHaveBeenLastCalledWith(K.g, 'off')
    expect(onChart).not.toHaveBeenCalled()
    trOf(page, '가상환자26').querySelector<HTMLButtonElement>('button.nm-btn')!.click()
    expect(onChart).toHaveBeenCalledTimes(1)
    expect(onChart).toHaveBeenLastCalledWith(K.f)
    expect(onPtf).toHaveBeenCalledTimes(3)
  })

  it('AC-3308.13: planOf(ptf)는 띠 "{이름} · PT 먼저 올라갔어요"·"{이름} · PT 끝나고 내려왔어요"·"{이름} · PT 먼저 표시를 지웠어요"와 앞 값으로 가는 ptf를 준다', () => {
    const board = fx.arrangeMockupBoard()
    const up = view.planOf(board, { k: K.a, op: 'ptf', v: 'up' })
    expect(arrRow(up.board, K.a)!.ptf).toEqual({ st: 'up', at: '11:04' })
    expect(up.toast).toBe('가상환자21 · PT 먼저 올라갔어요')
    expect(up.undo).toEqual({ k: K.a, op: 'ptf', v: 'off' })
    const down = view.planOf(board, { k: K.f, op: 'ptf', v: 'down' })
    expect(arrRow(down.board, K.f)!.ptf).toEqual({ st: 'down', at: '11:04' })
    expect(down.toast).toBe('가상환자26 · PT 끝나고 내려왔어요')
    expect(down.undo).toEqual({ k: K.f, op: 'ptf', v: 'up' })
    const off = view.planOf(board, { k: K.g, op: 'ptf', v: 'off' })
    expect(arrRow(off.board, K.g)!.ptf).toBeNull()
    expect(off.toast).toBe('가상환자27 · PT 먼저 표시를 지웠어요')
    expect(off.undo).toEqual({ k: K.g, op: 'ptf', v: 'down' })
  })

  it('AC-3308.5: planOf는 판에 없는 줄·칸이면 판을 그대로 두고 띠·되돌리기가 없다', () => {
    const board = fx.arrangeMockupBoard()
    for (const ask of [
      { k: fx.fakeKey(99), op: 'step', col: 'sono' },
      { k: K.h, op: 'step', col: 'sono' },
      { k: K.a, op: 'nope' },
    ]) {
      const plan = view.planOf(board, ask)
      expect(plan.toast, JSON.stringify(ask)).toBeNull()
      expect(plan.undo, JSON.stringify(ask)).toBeNull()
      expect(JSON.stringify(plan.board), JSON.stringify(ask)).toBe(JSON.stringify(board))
    }
  })
})

// ---- 모양 (AC-3308.10 · 3308.12) -------------------------------------------------------------------------

describe('REQ-3308 어레인지 모양 (style.css·theme.css)', () => {
  it('AC-3308.10: 태블릿 모양이면 표 폭은 1180px 이상이고 칸 폭은 시안 값이다. 폰은 1040px 표가 옆으로 밀리고 접수·성함 칸이 왼쪽에 붙어 있다', () => {
    const tablet: Record<string, string> = { 'c-t': '76px', 'c-nm': '156px', 'c-xray': '84px', 'c-sono': '136px', 'c-carm': '136px', 'c-pt': '76px', 'c-ds': '76px', 'c-trac': '76px', 'c-eswt': '80px', 'c-end': '72px' }
    const phone: Record<string, string> = { 'c-t': '62px', 'c-nm': '118px', 'c-xray': '74px', 'c-sono': '118px', 'c-carm': '118px', 'c-pt': '66px', 'c-ds': '66px', 'c-trac': '66px', 'c-eswt': '70px', 'c-end': '64px' }
    expect(Number.parseFloat(cssValue('.arr', 'min-width', 'tablet') ?? '0')).toBeGreaterThanOrEqual(1180)
    expect(cssValue('.arr', 'min-width')).toBe('1040px')
    for (const [cls, width] of Object.entries(tablet)) expect(cssValue(`.arr .${cls}`, 'width', 'tablet'), cls).toBe(width)
    for (const [cls, width] of Object.entries(phone)) expect(cssValue(`.arr .${cls}`, 'width'), cls).toBe(width)
    expect(cssValue('.arr', 'table-layout')).toBe('fixed')
    expect(cssValue('.wrap', 'overflow-x')).toBe('auto')
    expect(cssValue('.arr .c-t', 'position')).toBe('sticky')
    expect(cssValue('.arr .c-nm', 'position')).toBe('sticky')
    expect(cssValue('.arr .c-t', 'left')).toBe('0')
    expect(cssValue('.arr .c-nm', 'left')).toBe(phone['c-t'])
    expect(cssValue('.arr .c-nm', 'left', 'tablet')).toBe(tablet['c-t'])
  })

  it('AC-3308.10: 어레인지 화면이 그리는 class는 모두 style.css에 모양이 있고, 누르는 단추(탭·칸·종료·고르기·닫기·되돌리기)는 44px 이상이다', () => {
    const css = readWww('style.css').replace(/\/\*[\s\S]*?\*\//g, '')
    const { page } = draw(fx.arrangeMockupBoard(), { endedOpen: true, toast: { text: '띠', undo: true }, rxNew: [K.e], flash: [K.e] })
    cellOf(page, '가상환자21', 'sono').click()
    const classes = new Set([page, ...page.querySelectorAll('*')].flatMap((n) => [...n.classList]))
    for (const cls of classes) expect(css, `.${cls}`).toMatch(new RegExp(`\\.${cls}(?![\\w-])`))
    for (const cls of ['.tab', '.t-btn', '.cell', '.end-btn', '.opt', '.sheet-x', '.toast-undo', '.restore', '.ended-h']) {
      const value = cssValue(cls, 'min-height')
      expect(value, cls).toBeDefined()
      expect(Number.parseFloat(value!), cls).toBeGreaterThanOrEqual(44)
    }
  })

  it('AC-3308.12 · AC-3401.1: 새 색은 theme.css :root의 --sono-head·--sono-col·--carm-head·--carm-col·--ptup-bg·--ptup-fg 여섯(어레인지 시안)과 수정 묶음 시안 Mock.html의 색뿐이고 시안 값이며, SONO·C-ARM 칸과 [PT 먼저] 올라감이 그 색을 쓴다', () => {
    const want: Record<string, string> = {
      '--sono-head': '#F3DC8A',
      '--sono-col': '#FBF4D6',
      '--carm-head': '#9FDCC6',
      '--carm-col': '#E2F5EE',
      '--ptup-bg': '#F1EAFB',
      '--ptup-fg': '#6B21A8',
    }
    const root = parseRules(readWww('theme.css')).filter((r) => r.selector === ':root' && r.media === '').flatMap((r) => r.decls)
    for (const [name, value] of Object.entries(want)) expect(root.find(([p]) => p === name)?.[1].toUpperCase(), name).toBe(value)
    // 승인 시안(상표 v12·Paper.html)에 없던 색은 이 여섯(모두 어레인지 시안에 있음)과 수정 묶음 시안의 색(모두 Mock.html에 있음)뿐이다
    const old = new Set<string>()
    for (const page of ['Main.dc.html', 'Detail.dc.html', 'Offline.dc.html', 'Tablet.dc.html', 'Paper.html'])
      for (const c of hexColors(readFileSync(path.join(PHONE_MOCKUPS, page), 'utf8'))) old.add(c)
    const added = [...new Set(hexColors(root.map(([, v]) => v).join(' ')))].filter((c) => !old.has(c)).sort()
    expect(added).toEqual([...Object.values(want), ...MEMO_PAPERS_ADDED].sort())
    const mockup = new Set(hexColors(readFileSync(MOCKUP, 'utf8')))
    for (const c of Object.values(want)) expect(mockup.has(c), c).toBe(true)
    const memoMockup = new Set(hexColors(readFileSync(MEMO_PAPERS_MOCKUP, 'utf8')))
    for (const c of MEMO_PAPERS_ADDED) expect(memoMockup.has(c), c).toBe(true)
    // 돌아옴·목록 여섯 탭·비고 기록부 시안(reception-arrange-tune)은 새 색이 없다: theme.css :root 색은 모두 그 시안에도 같은 값으로 있다
    const tune = readFileSync(TUNE_MOCKUP, 'utf8')
    for (const [name, value] of root) for (const c of hexColors(value)) expect(tune, `${name} ${c}`).toMatch(new RegExp(`${name}:\\s*${c}`, 'i'))
    expect(cssValue('.arr th.c-sono', 'background')).toBe('var(--sono-head)')
    expect(cssValue('.arr td.c-sono', 'background')).toBe('var(--sono-col)')
    expect(cssValue('.arr th.c-carm', 'background')).toBe('var(--carm-head)')
    expect(cssValue('.arr td.c-carm', 'background')).toBe('var(--carm-col)')
    expect(cssValue('.ptf-btn.up', 'background')).toBe('var(--ptup-bg)')
    expect(cssValue('.ptf-btn.up', 'color')).toBe('var(--ptup-fg)')
    expect(cssValue('.lg.ptup', 'background')).toBe('var(--ptup-bg)')
  })
})

// ---- 충격파 타수·부위 수 (reception-memo-papers REQ-3402) ----------------------------------------------------

/** 충격파 넣기 창의 고르기 줄 하나(타수 0 · 부위 수 1)의 단추 */
function eswtButtons(root: ParentNode, row: 0 | 1): HTMLButtonElement[] {
  const group = root.querySelectorAll('.sheet > .opts.four')[row]
  return [...(group?.querySelectorAll<HTMLButtonElement>(':scope > button.opt') ?? [])]
}

function eswtPick(root: ParentNode, label: string) {
  const button = [...eswtButtons(root, 0), ...eswtButtons(root, 1)].find((b) => b.textContent === label)
  if (!button) throw new Error(`충격파 고르기 ${label} 없음`)
  button.click()
}

function picked(root: ParentNode, row: 0 | 1): string[] {
  return eswtButtons(root, row)
    .filter((b) => b.classList.contains('on') && b.getAttribute('aria-pressed') === 'true')
    .map((b) => b.textContent ?? '')
}

function goButton(root: ParentNode): HTMLButtonElement {
  const button = root.querySelector<HTMLButtonElement>('.sheet > .sheet-go > button.go')
  if (!button) throw new Error('[넣기] 없음')
  return button
}

describe('REQ-3402 충격파 타수·부위 수', () => {
  it('AC-3402.1 · AC-3604.4: planOf(add 충격파)는 판 picks.eswt로 본다: 부위 수 하나 또는 "{타수} {부위 수}"만 받고(도우미 AddOf와 같다), 목록 밖·차례가 뒤집힌 글·빈 글은 맞지 않는 쓰기다', () => {
    const board = fx.arrangeMockupBoard()
    for (const v of ['1부위', '4부위', '2000타 1부위', '6000타 4부위']) expect(arrRow(view.planOf(board, { k: K.h, op: 'add', col: 'eswt', v }).board, K.h)!.cells.eswt, v).toMatchObject({ det: v })
    for (const v of ['5부위', '2000타', '1부위 2000타', '5000타 1부위', '2000타  1부위', '']) {
      const plan = view.planOf(board, { k: K.h, op: 'add', col: 'eswt', v })
      expect(plan.toast, v).toBeNull()
      expect(plan.board, v).toBe(board)
    }
    const other = fx.arrangeMockupBoard()
    other.picks!.eswt = { hits: ['3천'], counts: ['한 부위'] }
    expect(view.planOf(other, { k: K.h, op: 'add', col: 'eswt', v: '3천 한 부위' }).toast).toBe('가상환자28 · 충격파 직접 넣었어요')
    expect(view.planOf(other, { k: K.h, op: 'add', col: 'eswt', v: '한 부위' }).toast).toBe('가상환자28 · 충격파 직접 넣었어요')
    expect(view.planOf(other, { k: K.h, op: 'add', col: 'eswt', v: '2부위' }).toast).toBeNull()
  })

  it('AC-3604.4: 충격파 넣기 창은 판 picks의 타수 줄·부위 수 줄이고, 타수 목록이 비면 타수 줄이 없다(부위 수만 골라 넣는다). 칸 글은 picks 타수 이름 + 빈칸으로 시작할 때만 타수·부위 수로 나눈다', () => {
    const board = fx.arrangeMockupBoard()
    board.picks!.eswt = { hits: ['3천', '5천'], counts: ['한 부위', '두 부위', '세 부위'] }
    const onAdd = vi.fn()
    const { page } = draw(board, { onAdd })
    cellOf(page, '가상환자28', 'eswt').click()
    expect(eswtButtons(page, 0).map((b) => b.textContent)).toEqual(['3천', '5천'])
    expect(eswtButtons(page, 1).map((b) => b.textContent)).toEqual(['한 부위', '두 부위', '세 부위'])
    eswtPick(page, '5천')
    eswtPick(page, '두 부위')
    expect(picked(page, 0)).toEqual(['5천'])
    expect(document.activeElement?.textContent).toBe('두 부위')
    expect(goButton(page).textContent).toBe('넣기 · 5천 두 부위')
    goButton(page).click()
    expect(onAdd).toHaveBeenLastCalledWith(K.h, 'eswt', '5천 두 부위')

    document.body.replaceChildren()
    const noHits = fx.arrangeMockupBoard()
    noHits.picks!.eswt = { hits: [], counts: ['1부위', '2부위'] }
    const onSheet = vi.fn()
    const bare = draw(noHits, { onAdd, onSheet }).page
    cellOf(bare, '가상환자28', 'eswt').click()
    const sheet = sheetOf(bare)!
    expect(shapeOf(sheet)).toEqual(['div.sheet-h', 'div.opt-label', 'div.opts.four', 'div.sheet-go'])
    expect(textsOf(sheet, ':scope > .opt-label')).toEqual(['부위 수'])
    expect(eswtButtons(bare, 0).map((b) => b.textContent)).toEqual(['1부위', '2부위'])
    eswtPick(bare, '2부위')
    expect(onSheet).toHaveBeenLastCalledWith({ k: K.h, col: 'eswt', kind: 'add', hit: null, count: '2부위' })
    expect(document.activeElement?.textContent).toBe('2부위')
    goButton(bare).click()
    expect(onAdd).toHaveBeenLastCalledWith(K.h, 'eswt', '2부위')

    // 칸 글 나누기: 목록의 타수 이름 + 빈칸으로 시작하면 타수(위)·나머지(아래), 아니면 칸 글 하나
    document.body.replaceChildren()
    const cells = fx.arrangeMockupBoard()
    cells.picks!.eswt = { hits: ['3천'], counts: ['2부위'] }
    arrRow(cells, K.c)!.cells.eswt!.det = '3천 2부위'
    arrRow(cells, K.d)!.cells.eswt = fx.fakeCell({ det: '3000타 2부위', manual: true })
    const drawn = draw(cells).page
    expect(cellParts(cellOf(drawn, '가상환자23', 'eswt'))).toEqual(['span.st:준비', 'span.hit:3천', 'span.det:2부위'])
    expect(cellParts(cellOf(drawn, '가상환자24', 'eswt'))).toEqual(['span.st:준비', 'span.det:3000타 2부위'])
  })

  it('AC-3402.2: 빈 충격파 칸을 누르면 창 "충격파 직접 넣기"에 [타수] 넷·[부위 수] 넷 두 줄과 [닫기]·[넣기]가 있고, 처음에는 아무것도 안 골라 [넣기]가 꺼져 있다', () => {
    const onSheet = vi.fn()
    const onAdd = vi.fn()
    const { page } = draw(fx.arrangeMockupBoard(), { onSheet, onAdd })
    cellOf(page, '가상환자28', 'eswt').click()
    expect(onSheet).toHaveBeenLastCalledWith({ k: K.h, col: 'eswt', kind: 'add', hit: null, count: null })
    const sheet = sheetOf(page)!
    expect(sheet.getAttribute('role')).toBe('dialog')
    expect(sheet.getAttribute('aria-modal')).toBe('true')
    expect(sheet.getAttribute('aria-label')).toBe('충격파 직접 넣기')
    expect(shapeOf(sheet)).toEqual(['div.sheet-h', 'div.opt-label', 'div.opts.four', 'div.opt-label', 'div.opts.four', 'div.sheet-go'])
    expect(textsOf(sheet, '.sheet-h > span')).toEqual(['충격파 직접 넣기', '가상환자28 · 타수와 부위 수를 골라요'])
    expect(textsOf(sheet, ':scope > .opt-label')).toEqual(['타수', '부위 수'])
    expect(eswtButtons(page, 0).map((b) => b.textContent)).toEqual(ESWT_HITS)
    expect(eswtButtons(page, 1).map((b) => b.textContent)).toEqual(ESWT_COUNTS)
    for (const b of [...eswtButtons(page, 0), ...eswtButtons(page, 1)]) {
      expect(b.getAttribute('type')).toBe('button')
      expect(b.getAttribute('aria-pressed')).toBe('false')
    }
    expect(shapeOf(sheet.querySelector('.sheet-go'))).toEqual(['button.sheet-close', 'button.go'])
    expect(textOf(sheet, '.sheet-go > button.sheet-close')).toBe('닫기')
    expect(goButton(page).textContent).toBe('넣기')
    expect(goButton(page).disabled).toBe(true)
    goButton(page).click()
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('AC-3402.2: 타수만 골라도 [넣기]는 꺼져 있고, 부위 수를 고르면 [넣기 · 3000타 2부위]가 켜져 누르면 add v="3000타 2부위"를 부르고 창을 닫는다. 고를 때마다 창 값을 onSheet로 넘긴다', () => {
    const onSheet = vi.fn()
    const onAdd = vi.fn()
    const { page } = draw(fx.arrangeMockupBoard(), { onSheet, onAdd })
    cellOf(page, '가상환자28', 'eswt').click()
    eswtPick(page, '3000타')
    expect(onSheet).toHaveBeenLastCalledWith({ k: K.h, col: 'eswt', kind: 'add', hit: '3000타', count: null })
    expect(picked(page, 0)).toEqual(['3000타'])
    expect(picked(page, 1)).toEqual([])
    expect(goButton(page).disabled).toBe(true)
    expect(goButton(page).textContent).toBe('넣기')
    eswtPick(page, '2부위')
    expect(onSheet).toHaveBeenLastCalledWith({ k: K.h, col: 'eswt', kind: 'add', hit: '3000타', count: '2부위' })
    expect(picked(page, 1)).toEqual(['2부위'])
    expect(goButton(page).disabled).toBe(false)
    expect(goButton(page).textContent).toBe('넣기 · 3000타 2부위')
    // 다른 타수를 고르면 바뀐다(한 줄에 하나)
    eswtPick(page, '6000타')
    expect(picked(page, 0)).toEqual(['6000타'])
    eswtPick(page, '3000타')
    goButton(page).click()
    expect(onAdd).toHaveBeenCalledTimes(1)
    expect(onAdd).toHaveBeenLastCalledWith(K.h, 'eswt', '3000타 2부위')
    expect(sheetOf(page)).toBeNull()
    expect(onSheet).toHaveBeenLastCalledWith(null)
  })

  it('AC-3402.2: 고른 단추를 다시 누르면 풀린다. 타수 없이 부위 수만 고르면 [넣기 · 2부위]이고 add v="2부위"다. 부위 수를 풀면 [넣기]가 다시 꺼진다', () => {
    const onAdd = vi.fn()
    const { page } = draw(fx.arrangeMockupBoard(), { onAdd })
    cellOf(page, '가상환자28', 'eswt').click()
    eswtPick(page, '4000타')
    eswtPick(page, '2부위')
    eswtPick(page, '2부위')
    expect(picked(page, 1)).toEqual([])
    expect(goButton(page).disabled).toBe(true)
    eswtPick(page, '2부위')
    eswtPick(page, '4000타')
    expect(picked(page, 0)).toEqual([])
    expect(goButton(page).textContent).toBe('넣기 · 2부위')
    goButton(page).click()
    expect(onAdd).toHaveBeenLastCalledWith(K.h, 'eswt', '2부위')
  })

  it('AC-3402.2: [닫기]·바깥 누름·Esc는 넣지 않고 닫는다', () => {
    const onAdd = vi.fn()
    const onSheet = vi.fn()
    const { page } = draw(fx.arrangeMockupBoard(), { onAdd, onSheet })
    cellOf(page, '가상환자28', 'eswt').click()
    eswtPick(page, '1부위')
    page.querySelector<HTMLButtonElement>('.sheet-go > button.sheet-close')!.click()
    expect(sheetOf(page)).toBeNull()
    expect(onSheet).toHaveBeenLastCalledWith(null)
    cellOf(page, '가상환자28', 'eswt').click()
    page.querySelector<HTMLElement>('.sheet-back')!.click()
    expect(sheetOf(page)).toBeNull()
    cellOf(page, '가상환자28', 'eswt').click()
    sheetOf(page)!.click()
    expect(sheetOf(page)).not.toBeNull()
    sheetOf(page)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(sheetOf(page)).toBeNull()
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('AC-3402.2: view.sheet의 타수·부위 수로 다시 그리면 고른 단추와 [넣기 · …]가 그대로이고, 목록 밖 값은 안 고른 것으로 본다', () => {
    const kept = draw(fx.arrangeMockupBoard(), { sheet: { k: K.h, col: 'eswt', kind: 'add', hit: '4000타', count: '3부위' } }).page
    expect(picked(kept, 0)).toEqual(['4000타'])
    expect(picked(kept, 1)).toEqual(['3부위'])
    expect(goButton(kept).textContent).toBe('넣기 · 4000타 3부위')
    document.body.replaceChildren()
    const odd = draw(fx.arrangeMockupBoard(), { sheet: { k: K.h, col: 'eswt', kind: 'add', hit: '5000타', count: '<b>9부위</b>' } }).page
    expect(picked(odd, 0)).toEqual([])
    expect(picked(odd, 1)).toEqual([])
    expect(goButton(odd).disabled).toBe(true)
    document.body.replaceChildren()
    // 값이 없는 창(앞 판의 모양)도 빈 고르기로 그린다
    const bare = draw(fx.arrangeMockupBoard(), { sheet: { k: K.h, col: 'eswt', kind: 'add' } }).page
    expect(eswtButtons(bare, 1).length).toBe(4)
    expect(goButton(bare).disabled).toBe(true)
    // 이미 칸이 있으면 그리지 않는다
    expect(sheetOf(draw(fx.arrangeMockupBoard(), { sheet: { k: K.c, col: 'eswt', kind: 'add', hit: '3000타', count: '2부위' } }).page)).toBeNull()
  })

  it('AC-3402.3: 충격파 칸은 타수가 있으면 타수가 위·부위 수가 아래다(준비 "준비 / 3000타 / 2부위", 완료 "✓ HH:MM / 4000타 / 3부위"). 타수 없는 칸은 그대로다', () => {
    const board = fx.arrangeMockupBoard()
    arrRow(board, K.c)!.cells.eswt!.det = '3000타 2부위'
    arrRow(board, K.a)!.cells.eswt = fx.fakeCell({ st: 'done', det: '4000타 3부위', at: '10:40', manual: true })
    arrRow(board, K.d)!.cells.eswt = fx.fakeCell({ st: 'todo', det: '1부위', at: '10:41', manual: true })
    const { page } = draw(board)
    expect(cellParts(cellOf(page, '가상환자23', 'eswt'))).toEqual(['span.st:준비', 'span.hit:3000타', 'span.det:2부위'])
    expect(cellParts(cellOf(page, '가상환자21', 'eswt'))).toEqual(['span.st:✓ 10:40', 'span.hit:4000타', 'span.det.sm:3부위'])
    expect(cellParts(cellOf(page, '가상환자24', 'eswt'))).toEqual(['span.st:준비', 'span.det:1부위'])
    // 미리 그리기(planOf add)도 같은 글을 칸 글로 둔다
    const plan = view.planOf(fx.arrangeMockupBoard(), { k: K.h, op: 'add', col: 'eswt', v: '6000타 4부위' })
    expect(arrRow(plan.board, K.h)!.cells.eswt).toEqual({ st: 'todo', det: '6000타 4부위', part: null, at: '11:04', ord: null, manual: true, tags: [] })
    expect(plan.toast).toBe('가상환자28 · 충격파 직접 넣었어요')
    document.body.replaceChildren()
    expect(cellParts(cellOf(draw(plan.board).page, '가상환자28', 'eswt'))).toEqual(['span.st:준비', 'span.hit:6000타', 'span.det:4부위'])
  })

  it('AC-3402.2 · AC-3402.3: 충격파 창·칸이 그리는 class는 모두 style.css에 모양이 있고, [닫기]·[넣기]·고르기 단추는 44px 이상이다. 타수 글은 환자 글처럼 글자로만 들어간다', () => {
    const css = readWww('style.css').replace(/\/\*[\s\S]*?\*\//g, '')
    const board = fx.arrangeMockupBoard()
    arrRow(board, K.c)!.cells.eswt!.det = '3000타 2부위'
    const { page } = draw(board, { sheet: { k: K.h, col: 'eswt', kind: 'add', hit: '3000타', count: '2부위' } })
    const classes = new Set([page, ...page.querySelectorAll('*')].flatMap((n) => [...n.classList]))
    for (const cls of ['hit', 'opt-label', 'four', 'sheet-go', 'sheet-close', 'go', 'on']) expect(classes.has(cls), cls).toBe(true)
    for (const cls of classes) expect(css, `.${cls}`).toMatch(new RegExp(`\\.${cls}(?![\\w-])`))
    for (const selector of ['.sheet-close', '.sheet-go > .go', '.opt']) {
      const value = cssValue(selector, 'min-height')
      expect(value, selector).toBeDefined()
      expect(Number.parseFloat(value!), selector).toBeGreaterThanOrEqual(44)
    }
    document.body.replaceChildren()
    const odd = fx.arrangeMockupBoard()
    arrRow(odd, K.c)!.cells.eswt!.det = '<b>3000타 2부위</b>'
    odd.picks!.eswt.hits.push('<b>3000타')
    const drawn = draw(odd).page
    expect(cellParts(cellOf(drawn, '가상환자23', 'eswt'))).toEqual(['span.st:준비', 'span.hit:<b>3000타', 'span.det:2부위</b>'])
    expect(drawn.querySelector('td.c-eswt b')).toBeNull()
  })
})

// ---- C-ARM·SONO 넣기 (reception-pick-lists REQ-3503·REQ-3504, 시안 Mock.html carmSheet·sonoSheet) ------------------

/** 넣기 창의 고르기 줄(data-g: proc·drug·side·part·plain·with)의 단추 */
function groupButtons(root: ParentNode, g: string): HTMLButtonElement[] {
  return [...root.querySelectorAll<HTMLButtonElement>(`.sheet > .opts[data-g="${g}"] > button.opt`)]
}

/** 단추의 글(체크 칸 ✓ 은 빼고 글 마디만) */
function labelOf(button: Element): string {
  return [...button.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent ?? '').join('')
}

function labelsOf(root: ParentNode, g: string): string[] {
  return groupButtons(root, g).map(labelOf)
}

/** 고른(on · aria-pressed) 단추의 글 */
function onOf(root: ParentNode, g: string): string[] {
  return groupButtons(root, g)
    .filter((b) => b.classList.contains('on') && b.getAttribute('aria-pressed') === 'true')
    .map(labelOf)
}

function choose(root: ParentNode, g: string, label: string) {
  const button = groupButtons(root, g).find((b) => labelOf(b) === label)
  if (!button) throw new Error(`${g} ${label} 없음`)
  button.click()
}

/** SONO 창의 고른 것 이름표 글 */
function chipsOf(root: ParentNode): string[] {
  return [...root.querySelectorAll('.sheet > .picked > button.picked-chip')].map(labelOf)
}

function goOf(root: ParentNode): HTMLButtonElement {
  const button = root.querySelector<HTMLButtonElement>('.sheet > .sheet-go > button.go')
  if (!button) throw new Error('[넣기] 없음')
  return button
}

const CARM_ADD: Sheet = { k: K.h, col: 'carm', kind: 'add', proc: null, drug: null }
const SONO_ADD: Sheet = { k: K.h, col: 'sono', kind: 'add', side: null, picked: [], withs: [] }

describe('REQ-3503 C-ARM 넣기', () => {
  it('AC-3503.1: 빈 C-ARM 칸을 누르면 창 "C-ARM 넣기"에 판 picks의 시술 줄·약재 줄과 [닫기]·[넣기]가 있고 "부위는 나중에"는 없다. 처음에는 [넣기]가 꺼져 있다', () => {
    const onSheet = vi.fn()
    const { page } = draw(fx.arrangeMockupBoard(), { onSheet })
    cellOf(page, '가상환자28', 'carm').click()
    expect(onSheet).toHaveBeenLastCalledWith(CARM_ADD)
    const sheet = sheetOf(page)!
    expect(sheet.getAttribute('aria-label')).toBe('C-ARM 넣기')
    expect(shapeOf(sheet)).toEqual(['div.sheet-h', 'div.opt-label', 'div.opts.four', 'div.opt-label', 'div.opts.trio', 'div.sheet-go'])
    expect(textsOf(sheet, '.sheet-h > span')).toEqual(['C-ARM 넣기', '가상환자28 · 시술과 약재를 골라요'])
    expect(textsOf(sheet, ':scope > .opt-label')).toEqual(['시술', '약재'])
    expect(labelsOf(page, 'proc')).toEqual(['목', '등', '허리', '리덕션'])
    expect(labelsOf(page, 'drug')).toEqual(['TP', '하프', '기본'])
    expect(onOf(page, 'proc')).toEqual([])
    expect(onOf(page, 'drug')).toEqual([])
    expect(goOf(page).disabled).toBe(true)
    expect(goOf(page).textContent).toBe('넣기')
    expect(textOf(sheet, '.sheet-go > button.sheet-close')).toBe('닫기')
    expect(sheet.textContent).not.toContain(LATER)
    // 목록은 판 picks 그대로다
    const board = fx.arrangeMockupBoard()
    board.picks!.carm = { procs: [{ n: '허리', noDrug: false }, { n: '꼬리뼈', noDrug: true }], drugs: ['TP'] }
    const other = draw(board, { sheet: CARM_ADD }).page
    expect(labelsOf(other, 'proc')).toEqual(['허리', '꼬리뼈'])
    expect(labelsOf(other, 'drug')).toEqual(['TP'])
  })

  it('AC-3503.1: 시술이 없는 C-ARM 칸의 [시술 고르기]는 칸 누름 없이 같은 창을 열고(kind part), 판에 picks가 없으면 두 넣기 창이 열리지 않는다', () => {
    const onSheet = vi.fn()
    const onCell = vi.fn()
    const board = fx.arrangeMockupBoard()
    arrRow(board, K.e)!.cells.carm!.part = null
    const { page } = draw(board, { onSheet, onCell })
    trOf(page, '가상환자25').querySelector<HTMLButtonElement>('td.c-carm button.part-btn')!.click()
    expect(onCell).not.toHaveBeenCalled()
    expect(onSheet).toHaveBeenLastCalledWith({ k: K.e, col: 'carm', kind: 'part', proc: null, drug: null })
    expect(textOf(sheetOf(page), '.sheet-title')).toBe('C-ARM 넣기')
    expect(labelsOf(page, 'proc')).toEqual(['목', '등', '허리', '리덕션'])

    document.body.replaceChildren()
    const none = fx.arrangeMockupBoard()
    delete none.picks
    arrRow(none, K.e)!.cells.carm!.part = null
    const quiet = vi.fn()
    const bare = draw(none, { onSheet: quiet }).page
    cellOf(bare, '가상환자28', 'carm').click()
    cellOf(bare, '가상환자28', 'sono').click()
    trOf(bare, '가상환자25').querySelector<HTMLButtonElement>('td.c-carm button.part-btn')!.click()
    trOf(bare, '가상환자23').querySelector<HTMLButtonElement>('td.c-sono button.part-btn')!.click()
    expect(sheetOf(bare)).toBeNull()
    expect(quiet).not.toHaveBeenCalled()
    expect(sheetOf(draw(none, { sheet: CARM_ADD }).page)).toBeNull()
    expect(sheetOf(draw(none, { sheet: SONO_ADD }).page)).toBeNull()
  })

  it('AC-3503.1: 시술을 고르면 [넣기 · 허리]·약재까지 고르면 [넣기 · 허리 TP]가 켜지고, 고른 단추를 다시 누르면 풀린다. 고를 때마다 창 값을 onSheet로 넘기고 view.sheet로 다시 그리면 그대로다(목록 밖 값은 안 고른 것)', () => {
    const onSheet = vi.fn()
    const { page } = draw(fx.arrangeMockupBoard(), { onSheet })
    cellOf(page, '가상환자28', 'carm').click()
    choose(page, 'proc', '허리')
    expect(onOf(page, 'proc')).toEqual(['허리'])
    expect(goOf(page).disabled).toBe(false)
    expect(goOf(page).textContent).toBe('넣기 · 허리')
    expect(onSheet).toHaveBeenLastCalledWith({ ...CARM_ADD, proc: '허리' })
    expect(document.activeElement?.textContent).toBe('허리')
    choose(page, 'drug', 'TP')
    expect(onOf(page, 'drug')).toEqual(['TP'])
    expect(goOf(page).textContent).toBe('넣기 · 허리 TP')
    expect(onSheet).toHaveBeenLastCalledWith({ ...CARM_ADD, proc: '허리', drug: 'TP' })
    choose(page, 'proc', '목')
    expect(onOf(page, 'proc')).toEqual(['목'])
    expect(goOf(page).textContent).toBe('넣기 · 목 TP')
    choose(page, 'proc', '목')
    expect(onOf(page, 'proc')).toEqual([])
    expect(onOf(page, 'drug')).toEqual(['TP'])
    expect(goOf(page).disabled).toBe(true)
    expect(goOf(page).textContent).toBe('넣기')
    expect(onSheet).toHaveBeenLastCalledWith({ ...CARM_ADD, proc: null, drug: 'TP' })

    const again = draw(fx.arrangeMockupBoard(), { sheet: { ...CARM_ADD, proc: '등', drug: '하프' } }).page
    expect(onOf(again, 'proc')).toEqual(['등'])
    expect(onOf(again, 'drug')).toEqual(['하프'])
    expect(goOf(again).textContent).toBe('넣기 · 등 하프')
    const odd = draw(fx.arrangeMockupBoard(), { sheet: { ...CARM_ADD, proc: '꼬리뼈', drug: '없는약' } }).page
    expect(onOf(odd, 'proc')).toEqual([])
    expect(onOf(odd, 'drug')).toEqual([])
    expect(goOf(odd).disabled).toBe(true)
  })

  it('AC-3503.2: 약재 없음 시술(리덕션)을 고르면 약재 줄이 흐려(no-drug) 눌리지 않고 "리덕션은 약재 없이 넣어요"가 보이며 [넣기 · 리덕션]은 약재를 보내지 않는다. 시술 끝 글자에 받침이 없으면 "는"이다', () => {
    const onAdd = vi.fn()
    const onSheet = vi.fn()
    const { page } = draw(fx.arrangeMockupBoard(), { onAdd, onSheet, sheet: { ...CARM_ADD, proc: '리덕션', drug: 'TP' } })
    const sheet = sheetOf(page)!
    expect(shapeOf(sheet)).toEqual(['div.sheet-h', 'div.opt-label', 'div.opts.four', 'div.opt-label', 'div.opts.trio.no-drug', 'p.opt-note', 'div.sheet-go'])
    expect(textOf(sheet, 'p.opt-note')).toBe('리덕션은 약재 없이 넣어요')
    expect(groupButtons(page, 'drug').every((b) => b.disabled)).toBe(true)
    expect(onOf(page, 'drug')).toEqual([])
    expect(goOf(page).textContent).toBe('넣기 · 리덕션')
    groupButtons(page, 'drug')[0]!.click()
    expect(onSheet).not.toHaveBeenCalled()
    goOf(page).click()
    expect(onAdd).toHaveBeenCalledTimes(1)
    expect(onAdd).toHaveBeenLastCalledWith(K.h, 'carm', '리덕션', '')
    // 받침 없는 이름
    const board = fx.arrangeMockupBoard()
    board.picks!.carm.procs.push({ n: '꼬리뼈 주사', noDrug: true }, { n: '코', noDrug: true })
    expect(textOf(sheetOf(draw(board, { sheet: { ...CARM_ADD, proc: '코' } }).page), 'p.opt-note')).toBe('코는 약재 없이 넣어요')
    expect(textOf(sheetOf(draw(board, { sheet: { ...CARM_ADD, proc: '꼬리뼈 주사' } }).page), 'p.opt-note')).toBe('꼬리뼈 주사는 약재 없이 넣어요')
    // 약재 있는 시술이면 흐리지 않는다
    const plain = sheetOf(draw(fx.arrangeMockupBoard(), { sheet: { ...CARM_ADD, proc: '허리' } }).page)!
    expect(plain.querySelector('.opts.no-drug, p.opt-note')).toBeNull()
    expect(groupButtons(plain, 'drug').some((b) => b.disabled)).toBe(false)
  })

  it('AC-3503.3: [넣기 · 허리 TP]를 누르면 창을 닫고(onSheet(null)) 빈 칸이면 onAdd(열쇠, carm, "허리", "TP"), [시술 고르기]에서 열었으면 onPart를 부른다. [닫기]·바깥 누름·Esc는 넣지 않고 닫는다', () => {
    const onAdd = vi.fn()
    const onPart = vi.fn()
    const onSheet = vi.fn()
    const board = fx.arrangeMockupBoard()
    arrRow(board, K.e)!.cells.carm!.part = null
    const { page } = draw(board, { onAdd, onPart, onSheet, sheet: { ...CARM_ADD, proc: '허리', drug: 'TP' } })
    goOf(page).click()
    expect(onAdd).toHaveBeenLastCalledWith(K.h, 'carm', '허리', 'TP')
    expect(sheetOf(page)).toBeNull()
    expect(onSheet).toHaveBeenLastCalledWith(null)
    const part = draw(board, { onAdd, onPart, onSheet, sheet: { k: K.e, col: 'carm', kind: 'part', proc: '목', drug: null } }).page
    goOf(part).click()
    expect(onPart).toHaveBeenLastCalledWith(K.e, 'carm', '목', '')
    for (const shut of [
      (p: HTMLElement) => p.querySelector<HTMLButtonElement>('.sheet .sheet-go > button.sheet-close')!.click(),
      (p: HTMLElement) => p.querySelector<HTMLElement>('.sheet-back')!.click(),
      (p: HTMLElement) => sheetOf(p)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    ]) {
      const p = draw(board, { onAdd, onPart, onSheet, sheet: { ...CARM_ADD, proc: '허리', drug: 'TP' } }).page
      sheetOf(p)!.click()
      expect(sheetOf(p)).not.toBeNull()
      shut(p)
      expect(sheetOf(p)).toBeNull()
      expect(onSheet).toHaveBeenLastCalledWith(null)
    }
    expect(onAdd).toHaveBeenCalledTimes(1)
    expect(onPart).toHaveBeenCalledTimes(1)
  })

  it('AC-3503.3: planOf(add·part)는 C-ARM v=시술·t=약재를 판 picks로 보고 칸(part 시술·tags 약재)을 미리 그린다. 띠 "{이름} · C-ARM 부위: 허리 TP". 목록 밖·약재 둘·약재 없음 시술의 약재·"부위는 나중에"는 맞지 않는 쓰기다', () => {
    const board = fx.arrangeMockupBoard()
    const add = view.planOf(board, { k: K.h, op: 'add', col: 'carm', v: '허리', t: 'TP' })
    expect(arrRow(add.board, K.h)!.cells.carm).toEqual({ st: 'todo', det: '', part: '허리', at: '11:04', ord: null, manual: true, tags: ['TP'] })
    expect(add.toast).toBe('가상환자28 · C-ARM 직접 넣었어요')
    expect(add.undo).toEqual({ k: K.h, op: 'remove', col: 'carm' })
    expect(arrRow(view.planOf(board, { k: K.h, op: 'add', col: 'carm', v: '리덕션' }).board, K.h)!.cells.carm).toMatchObject({ part: '리덕션', tags: [] })
    expect(arrRow(view.planOf(board, { k: K.h, op: 'add', col: 'carm', v: '목', t: '' }).board, K.h)!.cells.carm).toMatchObject({ part: '목', tags: [] })
    for (const [v, t] of [
      ['꼬리뼈', undefined],
      ['허리', 'TP|하프'],
      ['허리', '없는약'],
      ['리덕션', 'TP'],
      [LATER, undefined],
      ['허리|목', undefined],
      ['', undefined],
    ] as const) {
      const plan = view.planOf(board, { k: K.h, op: 'add', col: 'carm', v, t })
      expect(plan.toast, `${v} ${t}`).toBeNull()
      expect(plan.board, `${v} ${t}`).toBe(board)
    }
    arrRow(board, K.e)!.cells.carm!.part = null
    const part = view.planOf(board, { k: K.e, op: 'part', col: 'carm', v: '허리', t: 'TP' })
    expect(arrRow(part.board, K.e)!.cells.carm).toMatchObject({ st: 'todo', part: '허리', tags: ['TP'], ord: 2 })
    expect(part.toast).toBe('가상환자25 · C-ARM 부위: 허리 TP')
    expect(part.undo).toBeNull()
    expect(view.planOf(board, { k: K.e, op: 'part', col: 'carm', v: '리덕션' }).toast).toBe('가상환자25 · C-ARM 부위: 리덕션')
    expect(view.planOf(board, { k: K.e, op: 'part', col: 'carm', v: '허리', t: 'TP|기본' }).toast).toBeNull()
    // 목록은 판 picks다: 바꾼 목록에 없는 시술은 맞지 않는다
    const other = fx.arrangeMockupBoard()
    other.picks!.carm = { procs: [{ n: '꼬리뼈', noDrug: false }], drugs: ['반'] }
    expect(view.planOf(other, { k: K.h, op: 'add', col: 'carm', v: '허리' }).toast).toBeNull()
    expect(arrRow(view.planOf(other, { k: K.h, op: 'add', col: 'carm', v: '꼬리뼈', t: '반' }).board, K.h)!.cells.carm).toMatchObject({ part: '꼬리뼈', tags: ['반'] })
    const none = fx.arrangeMockupBoard()
    delete none.picks
    expect(view.planOf(none, { k: K.h, op: 'add', col: 'carm', v: '허리', t: 'TP' }).toast).toBeNull()
  })

  it('AC-3503.4: C-ARM 칸은 시술이 큰 글(.det)·약재가 둥근 이름표(.tags > .drug)다. 완료 칸은 작은 글과 이름표다', () => {
    const board = fx.arrangeMockupBoard()
    arrRow(board, K.b)!.cells.carm = fx.fakeCell({ st: 'ready', part: '허리', tags: ['TP'], at: '11:01', ord: 1 })
    arrRow(board, K.a)!.cells.carm = fx.fakeCell({ st: 'done', part: '목', tags: ['하프'], at: '09:50' })
    arrRow(board, K.e)!.cells.carm = fx.fakeCell({ part: '리덕션', at: '10:42', ord: 2 })
    const { page } = draw(board)
    expect(cellParts(cellOf(page, '가상환자22', 'carm'))).toEqual(['span.ord:1번', 'span.st:준비완료 11:01', 'span.det:허리', 'span.tags:TP'])
    expect(textsOf(cellOf(page, '가상환자22', 'carm'), '.tags > span.drug')).toEqual(['TP'])
    expect(cellParts(cellOf(page, '가상환자21', 'carm'))).toEqual(['span.st:✓ 09:50', 'span.det.sm:목', 'span.tags:하프'])
    expect(cellParts(cellOf(page, '가상환자25', 'carm'))).toEqual(['span.ord:2번', 'span.st:준비', 'span.det:리덕션'])
  })
})

describe('REQ-3504 SONO 넣기', () => {
  it('AC-3504.1: 빈 SONO 칸이나 [부위 고르기]를 누르면 창 "SONO 넣기"에 고른 것·쪽(오른쪽·왼쪽·양쪽)·부위·부위 없이·같이 하는 것(체크) 줄과 [닫기]·[넣기]가 있고 "부위는 나중에"는 없다', () => {
    const onSheet = vi.fn()
    const onCell = vi.fn()
    const { page } = draw(fx.arrangeMockupBoard(), { onSheet, onCell })
    cellOf(page, '가상환자28', 'sono').click()
    expect(onSheet).toHaveBeenLastCalledWith(SONO_ADD)
    const sheet = sheetOf(page)!
    expect(sheet.className).toBe('sheet sono-sheet')
    expect(sheet.getAttribute('aria-label')).toBe('SONO 넣기')
    expect(shapeOf(sheet)).toEqual([
      'div.sheet-h',
      'div.opt-label',
      'div.picked',
      'div.opt-label',
      'div.opts.trio',
      'div.opt-label',
      'div.opts.four.parts',
      'div.opt-label',
      'div.opts.trio',
      'div.opt-label',
      'div.opts.duo',
      'div.sheet-go',
    ])
    expect(textsOf(sheet, '.sheet-h > span')).toEqual(['SONO 넣기', '가상환자28 · 쪽을 누르고 부위를 눌러 담아요. 두 부위면 하나 더 담아요'])
    expect([...sheet.querySelectorAll(':scope > .opt-label')].map((l) => [labelOf(l), l.querySelector(':scope > span.opt-hint')?.textContent ?? null])).toEqual([
      ['고른 것', null],
      ['쪽', '안 고르면 부위만 담겨요'],
      ['부위', null],
      ['부위 없이', '쪽·부위 없이 그대로 담겨요'],
      ['같이 하는 것', null],
    ])
    expect(shapeOf(sheet.querySelector('.picked'))).toEqual(['span.picked-empty'])
    expect(textOf(sheet, '.picked > .picked-empty')).toBe('아직 없어요 · 아래에서 부위를 눌러요')
    expect(labelsOf(page, 'side')).toEqual(['오른쪽', '왼쪽', '양쪽'])
    expect(labelsOf(page, 'part')).toEqual(fx.defaultPicks().sono.parts)
    expect(labelsOf(page, 'plain')).toEqual(['소독', 'S/O', '봉합'])
    expect(labelsOf(page, 'with')).toEqual(['DNA', '채혈'])
    for (const b of groupButtons(page, 'with')) {
      expect(b.className).toBe('opt check')
      expect(shapeOf(b)).toEqual(['span.box'])
      expect(b.querySelector('.box')?.getAttribute('aria-hidden')).toBe('true')
      expect(b.querySelector('.box')?.textContent).toBe('')
    }
    expect(goOf(page).disabled).toBe(true)
    expect(goOf(page).textContent).toBe('넣기')
    expect(textOf(sheet, '.sheet-go > button.sheet-close')).toBe('닫기')
    expect(sheet.textContent).not.toContain(LATER)

    const part = draw(fx.arrangeMockupBoard(), { onSheet, onCell }).page
    trOf(part, '가상환자23').querySelector<HTMLButtonElement>('td.c-sono button.part-btn')!.click()
    expect(onCell).not.toHaveBeenCalled()
    expect(onSheet).toHaveBeenLastCalledWith({ ...SONO_ADD, k: K.c, kind: 'part' })
    expect(textOf(sheetOf(part), '.sheet-title')).toBe('SONO 넣기')
    // 목록은 판 picks 그대로다. 부위·부위 없이·같이 하는 것이 비면 그 줄은 없다
    const board = fx.arrangeMockupBoard()
    board.picks!.sono = { parts: [], plains: ['소독'], withs: [] }
    const few = sheetOf(draw(board, { sheet: SONO_ADD }).page)!
    expect(shapeOf(few)).toEqual(['div.sheet-h', 'div.opt-label', 'div.picked', 'div.opt-label', 'div.opts.trio', 'div.sheet-go'])
    expect(labelsOf(few, 'plain')).toEqual(['소독'])
  })

  it('AC-3504.2: 쪽을 고르고 부위를 누르면 "오른 어깨"(쪽이 없으면 "어깨")를 고른 것에 더하고, 부위 없이 글은 그대로 더한다. 담은 것을 다시 누르거나 고른 것 이름표를 누르면 뺀다. 여러 개(6줄까지) 담는다', () => {
    const onSheet = vi.fn()
    const { page } = draw(fx.arrangeMockupBoard(), { onSheet })
    cellOf(page, '가상환자28', 'sono').click()
    choose(page, 'side', '오른쪽')
    expect(onOf(page, 'side')).toEqual(['오른쪽'])
    choose(page, 'part', '어깨')
    expect(chipsOf(page)).toEqual(['오른 어깨'])
    expect(onOf(page, 'side')).toEqual(['오른쪽'])
    expect(labelOf(sheetOf(page)!.querySelector(':scope > .opt-label')!)).toBe('고른 것 · 1개')
    expect(onSheet).toHaveBeenLastCalledWith({ ...SONO_ADD, side: '오른쪽', picked: ['오른 어깨'] })
    expect(labelOf(document.activeElement!)).toBe('어깨')
    const chip = sheetOf(page)!.querySelector('.picked > button.picked-chip')!
    expect(chip.getAttribute('type')).toBe('button')
    expect(shapeOf(chip)).toEqual(['span'])
    expect(chip.querySelector('span')?.getAttribute('aria-hidden')).toBe('true')
    expect(chip.querySelector('span')?.textContent).toBe('✕')
    choose(page, 'side', '왼쪽')
    choose(page, 'part', '무릎')
    choose(page, 'side', '왼쪽')
    expect(onOf(page, 'side')).toEqual([])
    choose(page, 'part', '무릎')
    choose(page, 'plain', 'S/O')
    expect(chipsOf(page)).toEqual(['오른 어깨', '왼 무릎', '무릎', 'S/O'])
    expect(onOf(page, 'plain')).toEqual(['S/O'])
    expect(labelOf(sheetOf(page)!.querySelector(':scope > .opt-label')!)).toBe('고른 것 · 4개')
    // 다시 누르면 뺀다
    choose(page, 'part', '무릎')
    choose(page, 'plain', 'S/O')
    expect(chipsOf(page)).toEqual(['오른 어깨', '왼 무릎'])
    expect(onOf(page, 'plain')).toEqual([])
    // 이름표를 누르면 뺀다
    sheetOf(page)!.querySelector<HTMLButtonElement>('.picked > button.picked-chip')!.click()
    expect(chipsOf(page)).toEqual(['왼 무릎'])
    expect(onSheet).toHaveBeenLastCalledWith({ ...SONO_ADD, picked: ['왼 무릎'] })
    // 6줄까지
    for (const part of ['목', '등', '허리', '손목', '발목', '기타']) choose(page, 'part', part)
    expect(chipsOf(page)).toEqual(['왼 무릎', '목', '등', '허리', '손목', '발목'])
    choose(page, 'side', '양쪽')
    choose(page, 'part', '목')
    expect(chipsOf(page)).toEqual(['왼 무릎', '목', '등', '허리', '손목', '발목'])
    choose(page, 'with', 'DNA')
    expect(onOf(page, 'with')).toEqual(['DNA'])
    expect(groupButtons(page, 'with')[0]!.querySelector('.box')?.textContent).toBe('✓')
    choose(page, 'with', 'DNA')
    expect(onOf(page, 'with')).toEqual([])
  })

  it('AC-3504.3: 고른 것이 하나 이상이면 [넣기 · 오른 어깨 · 왼 무릎 + DNA]가 켜지고 누르면 onAdd(열쇠, sono, "오른 어깨|왼 무릎", "DNA"), [부위 고르기]면 onPart다. 같이 하는 것만 고르면 꺼져 있다. view.sheet로 다시 그려도 그대로다(목록 밖 값은 안 고른 것)', () => {
    const onAdd = vi.fn()
    const onPart = vi.fn()
    const onSheet = vi.fn()
    const sheet = { ...SONO_ADD, side: '왼쪽', picked: ['오른 어깨', '왼 무릎'], withs: ['DNA'] }
    const { page } = draw(fx.arrangeMockupBoard(), { onAdd, onPart, onSheet, sheet })
    expect(onOf(page, 'side')).toEqual(['왼쪽'])
    expect(chipsOf(page)).toEqual(['오른 어깨', '왼 무릎'])
    expect(onOf(page, 'with')).toEqual(['DNA'])
    expect(goOf(page).disabled).toBe(false)
    expect(goOf(page).textContent).toBe('넣기 · 오른 어깨 · 왼 무릎 + DNA')
    goOf(page).click()
    expect(onAdd).toHaveBeenLastCalledWith(K.h, 'sono', '오른 어깨|왼 무릎', 'DNA')
    expect(sheetOf(page)).toBeNull()
    expect(onSheet).toHaveBeenLastCalledWith(null)

    const only = draw(fx.arrangeMockupBoard(), { sheet: { ...SONO_ADD, withs: ['DNA', '채혈'] } }).page
    expect(goOf(only).disabled).toBe(true)
    expect(goOf(only).textContent).toBe('넣기')
    const odd = draw(fx.arrangeMockupBoard(), { sheet: { ...SONO_ADD, side: '앞쪽', picked: ['오른 꼬리', '앞 어깨', '오른 소독', '소독', '소독'], withs: ['DNA', '없는것', 'DNA'] } }).page
    expect(onOf(odd, 'side')).toEqual([])
    expect(chipsOf(odd)).toEqual(['소독'])
    expect(onOf(odd, 'with')).toEqual(['DNA'])
    expect(goOf(odd).textContent).toBe('넣기 · 소독 + DNA')

    const part = draw(fx.arrangeMockupBoard(), { onAdd, onPart, sheet: { ...SONO_ADD, k: K.c, kind: 'part', picked: ['소독'] } }).page
    goOf(part).click()
    expect(onPart).toHaveBeenLastCalledWith(K.c, 'sono', '소독', '')
    expect(onAdd).toHaveBeenCalledTimes(1)
  })

  it('AC-3504.3: 창 안 단추를 누르거나 판을 다시 그려도 창의 세로 위치(scrollTop)가 그대로다', () => {
    const tops = new WeakMap<Element, number>()
    Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
      configurable: true,
      get(this: HTMLElement) {
        return tops.get(this) ?? 0
      },
      set(this: HTMLElement, value: number) {
        tops.set(this, value)
      },
    })
    onTestFinished(() => {
      Reflect.deleteProperty(HTMLElement.prototype, 'scrollTop')
    })
    const app = appHost()
    let sheet: Sheet | null = null
    const v: ArrangeView = { sheet: SONO_ADD, onSheet: (next) => (sheet = next) }
    view.renderArrange(app, fx.arrangeMockupBoard(), v)
    sheetOf(app)!.scrollTop = 180
    choose(app, 'with', '채혈')
    expect(sheetOf(app)!.scrollTop).toBe(180)
    view.renderArrange(app, fx.arrangeMockupBoard(), { ...v, sheet })
    expect(onOf(app, 'with')).toEqual(['채혈'])
    expect(sheetOf(app)!.scrollTop).toBe(180)
    // 다른 창이면 처음부터
    view.renderArrange(app, fx.arrangeMockupBoard(), { ...v, sheet: CARM_ADD })
    expect(sheetOf(app)!.scrollTop).toBe(0)
  })

  it('AC-3504.3: planOf(add·part)는 SONO v(줄을 "|"로 이음)·t(같이 하는 것)를 판 picks로 보고 칸을 미리 그린다. 띠 "{이름} · SONO 부위: 오른 어깨 · 왼 무릎 + DNA". 겹침·목록 밖·7줄·"부위는 나중에"는 맞지 않는 쓰기다', () => {
    const board = fx.arrangeMockupBoard()
    const add = view.planOf(board, { k: K.h, op: 'add', col: 'sono', v: '오른 어깨|왼 무릎', t: 'DNA' })
    expect(arrRow(add.board, K.h)!.cells.sono).toEqual({ st: 'todo', det: '', part: '오른 어깨|왼 무릎', at: '11:04', ord: null, manual: true, tags: ['DNA'] })
    expect(add.toast).toBe('가상환자28 · SONO 직접 넣었어요')
    expect(add.undo).toEqual({ k: K.h, op: 'remove', col: 'sono' })
    const plain = view.planOf(board, { k: K.c, op: 'part', col: 'sono', v: '소독' })
    expect(arrRow(plain.board, K.c)!.cells.sono).toMatchObject({ part: '소독', tags: [], ord: 1 })
    expect(plain.toast).toBe('가상환자23 · SONO 부위: 소독')
    expect(view.planOf(board, { k: K.c, op: 'part', col: 'sono', v: '오른 어깨|왼 무릎', t: 'DNA|채혈' }).toast).toBe('가상환자23 · SONO 부위: 오른 어깨 · 왼 무릎 + DNA · 채혈')
    expect(view.planOf(board, { k: K.c, op: 'part', col: 'sono', v: '양 발목|어깨|S/O' }).toast).toBe('가상환자23 · SONO 부위: 양 발목 · 어깨 · S/O')
    for (const [v, t] of [
      ['오른 어깨|오른 어깨', undefined],
      ['오른 꼬리', undefined],
      ['앞 어깨', undefined],
      ['오른 소독', undefined],
      ['오른  어깨', undefined],
      ['목|등|허리|손목|발목|기타|어깨', undefined],
      [LATER, undefined],
      ['', undefined],
      ['어깨', 'DNA|DNA'],
      ['어깨', '없는것'],
    ] as const) {
      const plan = view.planOf(board, { k: K.c, op: 'part', col: 'sono', v, t })
      expect(plan.toast, `${v} ${t}`).toBeNull()
      expect(plan.board, `${v} ${t}`).toBe(board)
    }
    expect(view.planOf(board, { k: K.c, op: 'part', col: 'sono', v: '목|등|허리|손목|발목|기타' }).toast).not.toBeNull()
  })

  it('AC-3504.4: SONO 칸은 고른 줄마다 한 줄(.det)과 같이 하는 것 이름표(.tags > .drug)다. 완료 칸은 줄마다 작은 글과 이름표다', () => {
    const board = fx.arrangeMockupBoard()
    arrRow(board, K.g)!.cells.sono = fx.fakeCell({ part: '오른 어깨|왼 무릎', tags: ['DNA'], at: '11:02', ord: 2, manual: true })
    arrRow(board, K.a)!.cells.sono = fx.fakeCell({ st: 'done', part: '오른 무릎', tags: ['채혈'], at: '09:55' })
    arrRow(board, K.c)!.cells.sono = fx.fakeCell({ st: 'done', part: 'S/O|왼 손목', tags: ['DNA', '채혈'], at: '10:30' })
    const { page } = draw(board)
    expect(cellParts(cellOf(page, '가상환자27', 'sono'))).toEqual(['span.ord:2번', 'span.mn:직접', 'span.st:준비', 'span.det:오른 어깨', 'span.det:왼 무릎', 'span.tags:DNA'])
    expect(cellParts(cellOf(page, '가상환자21', 'sono'))).toEqual(['span.st:✓ 09:55', 'span.det.sm:오른 무릎', 'span.tags:채혈'])
    expect(cellParts(cellOf(page, '가상환자23', 'sono'))).toEqual(['span.st:✓ 10:30', 'span.det.sm:S/O', 'span.det.sm:왼 손목', 'span.tags:DNA채혈'])
    expect(textsOf(cellOf(page, '가상환자23', 'sono'), '.tags > span.drug')).toEqual(['DNA', '채혈'])
  })

  it('AC-3503.1 · AC-3504.1: 두 넣기 창·칸이 그리는 class는 모두 style.css에 모양이 있고, [닫기]·[넣기]·고르기 단추는 44px 이상이며 약재 없음 줄은 눌리지 않는다. 목록·이름표 글은 글자로만 들어간다', () => {
    const css = readWww('style.css').replace(/\/\*[\s\S]*?\*\//g, '')
    const board = fx.arrangeMockupBoard()
    arrRow(board, K.g)!.cells.sono = fx.fakeCell({ part: '오른 어깨|왼 무릎', tags: ['DNA'], ord: 2, manual: true })
    const classes = new Set<string>()
    for (const sheet of [
      { ...CARM_ADD, proc: '리덕션' },
      { ...SONO_ADD, side: '오른쪽', picked: ['오른 어깨'], withs: ['DNA'] },
      SONO_ADD,
    ]) {
      const { page } = draw(board, { sheet })
      for (const n of [page, ...page.querySelectorAll('*')]) for (const c of n.classList) classes.add(c)
      document.body.replaceChildren()
    }
    for (const cls of ['tags', 'drug', 'trio', 'no-drug', 'opt-note', 'sono-sheet', 'picked', 'picked-chip', 'picked-empty', 'opt-hint', 'parts', 'duo', 'check', 'box']) expect(classes.has(cls), cls).toBe(true)
    for (const cls of classes) expect(css, `.${cls}`).toMatch(new RegExp(`\\.${cls}(?![\\w-])`))
    for (const selector of ['.sheet-close', '.sheet-go > .go', '.opt', '.opts.parts .opt']) {
      const value = cssValue(selector, 'min-height')
      expect(value, selector).toBeDefined()
      expect(Number.parseFloat(value!), selector).toBeGreaterThanOrEqual(44)
    }
    expect(cssValue('.opts.no-drug .opt', 'pointer-events')).toBe('none')
    expect(cssValue('.opts.trio', 'grid-template-columns')).toBe('repeat(3, minmax(0, 1fr))')
    expect(cssValue('.opts.duo', 'grid-template-columns')).toBe('repeat(2, minmax(0, 1fr))')
    // 목록 글·이름표에 HTML을 넣어도 글자로만
    const odd = fx.arrangeMockupBoard()
    odd.picks!.carm.procs = [{ n: '<b>허리</b>', noDrug: true }]
    odd.picks!.sono.parts = ['<i>어깨</i>']
    arrRow(odd, K.g)!.cells.sono!.tags = ['<u>DNA</u>']
    const carm = draw(odd, { sheet: { ...CARM_ADD, proc: '<b>허리</b>' } }).page
    expect(labelsOf(carm, 'proc')).toEqual(['<b>허리</b>'])
    expect(textOf(carm, 'p.opt-note')).toBe('<b>허리</b>는 약재 없이 넣어요')
    expect(textOf(cellOf(carm, '가상환자27', 'sono'), '.drug')).toBe('<u>DNA</u>')
    const sono = draw(odd, { sheet: { ...SONO_ADD, picked: ['<i>어깨</i>'] } }).page
    expect(chipsOf(sono)).toEqual(['<i>어깨</i>'])
    expect(document.querySelector('.sheet b, .sheet i, td u')).toBeNull()
  })
})

// ---- 돌아옴 (reception-arrange-tune REQ-3602) ----------------------------------------------------------------

describe('REQ-3602 돌아옴', () => {
  /** 접수 칸 단추 */
  const tBtn = (root: ParentNode, name: string) => trOf(root, name).querySelector<HTMLButtonElement>('td.c-t > button.t-btn')!
  /** 줄의 [back, backWait] */
  const backOf = (board: FakeBoard, k: string) => [arrRow(board, k)!.back, arrRow(board, k)!.backWait]

  it('AC-3602.1: 접수 칸은 away면 "자리비움" + 시각(줄 away), away 없이 back이면 이름표 "돌아옴 {back}"이고 backWait가 있으면 그 아래 backWait 글(.wt.rtn-wt)이다. 돌아옴 줄은 색칠(away)하지 않는다', () => {
    const { page } = draw()
    expect(shapeOf(tBtn(page, '가상환자25'))).toEqual(['span.t-time', 'span.rtn-tag', 'span.wt.rtn-wt'])
    expect(textsOf(tBtn(page, '가상환자25'), ':scope > span')).toEqual(['10:15', '돌아옴 10:52', '12분째'])
    expect(shapeOf(tBtn(page, '가상환자22'))).toEqual(['span.t-time', 'span.rtn-tag'])
    expect(textOf(tBtn(page, '가상환자22'), '.rtn-tag')).toBe('돌아옴 10:31')
    expect(trOf(page, '가상환자25').classList.contains('away')).toBe(false)
    expect(trOf(page, '가상환자22').classList.contains('away')).toBe(false)
    expect(page.querySelectorAll('.rtn-tag').length).toBe(2)

    // 목록 줄의 기다린 글이 있으면 그 아래, away가 있으면 back은 그리지 않는다
    document.body.replaceChildren()
    const board = fx.arrangeMockupBoard()
    for (const rows of Object.values(board.lists)) for (const r of rows) if (r.k === K.e) r.waited = '보류 49분째'
    arrRow(board, K.d)!.back = '10:20'
    arrRow(board, K.d)!.backWait = '3분째'
    const again = draw(board).page
    expect(shapeOf(tBtn(again, '가상환자25'))).toEqual(['span.t-time', 'span.wt', 'span.rtn-tag', 'span.wt.rtn-wt'])
    expect(textsOf(tBtn(again, '가상환자25'), ':scope > span')).toEqual(['10:15', '49분째 대기', '돌아옴 10:52', '12분째'])
    expect(shapeOf(tBtn(again, '가상환자24'))).toEqual(['span.t-time', 'span.away-tag'])
    expect(trOf(again, '가상환자24').classList.contains('away')).toBe(true)
    // 시각 글은 글자로만
    document.body.replaceChildren()
    const odd = fx.arrangeMockupBoard()
    arrRow(odd, K.e)!.backWait = '<b>12분째</b>'
    const drawn = draw(odd).page
    expect(textOf(tBtn(drawn, '가상환자25'), '.rtn-wt')).toBe('<b>12분째</b>')
    expect(drawn.querySelector('td.c-t b')).toBeNull()
  })

  it('AC-3602.1: 돌아옴 색은 시안 그대로 theme.css 초록(--ok) 글자이고(새 색 없음) 표시 뜻 [돌아옴]은 흰 바탕·초록 테두리다', () => {
    expect(cssValue('.rtn-tag', 'color')).toBe('var(--ok)')
    expect(cssValue('.rtn-tag', 'font-weight')).toBe('800')
    expect(cssValue('.wt.rtn-wt', 'color')).toBe('var(--ok)')
    expect(cssValue('.wt.rtn-wt', 'font-weight')).toBe('800')
    expect(cssValue('.lg.rtn', 'background')).toBe('var(--surface)')
    expect(cssValue('.lg.rtn', 'border-color')).toBe('var(--ok)')
    expect(cssValue('.lg.rtn', 'color')).toBe('var(--ok)')
  })

  it('AC-3602.3: 접수 칸을 누르면 자리비움 줄은 onAway(열쇠, off), 돌아옴 줄·표시 없는 줄은 onAway(열쇠, on)이다(돌아옴을 다시 누르면 새 자리비움)', () => {
    const onAway = vi.fn()
    const { page } = draw(fx.arrangeMockupBoard(), { onAway })
    tBtn(page, '가상환자24').click()
    expect(onAway).toHaveBeenLastCalledWith(K.d, 'off')
    tBtn(page, '가상환자25').click()
    expect(onAway).toHaveBeenLastCalledWith(K.e, 'on')
    tBtn(page, '가상환자22').click()
    expect(onAway).toHaveBeenLastCalledWith(K.b, 'on')
    expect(onAway).toHaveBeenCalledTimes(3)
  })

  it('AC-3602.3: planOf(away off)는 자리비움 줄을 away null·back 판 시:분·backWait "0분째"로 미리 그리고 띠 "{이름} · 돌아옴 HH:MM"·되돌리기 away on을 준다. away on은 back·backWait를 지우고 되돌리기는 away clear다', () => {
    const board = fx.arrangeMockupBoard()
    const before = JSON.stringify(board)
    const off = view.planOf(board, { k: K.d, op: 'away', v: 'off' })
    expect(arrRow(off.board, K.d)).toMatchObject({ away: null, back: '11:04', backWait: '0분째' })
    expect(off.toast).toBe('가상환자24 · 돌아옴 11:04')
    expect(off.undo).toEqual({ k: K.d, op: 'away', v: 'on' })
    const on = view.planOf(board, { k: K.e, op: 'away', v: 'on' })
    expect(arrRow(on.board, K.e)).toMatchObject({ away: '11:04', back: null, backWait: null })
    expect(on.toast).toBe('가상환자25 · 자리비움 11:04')
    expect(on.undo).toEqual({ k: K.e, op: 'away', v: 'clear' })
    // 막 돌아온 줄의 그린 모양
    const drawn = draw(off.board).page
    expect(shapeOf(tBtn(drawn, '가상환자24'))).toEqual(['span.t-time', 'span.rtn-tag', 'span.wt.rtn-wt'])
    expect(textsOf(tBtn(drawn, '가상환자24'), ':scope > span')).toEqual(['10:02', '돌아옴 11:04', '0분째'])
    expect(trOf(drawn, '가상환자24').classList.contains('away')).toBe(false)
    expect(JSON.stringify(board)).toBe(before)
  })

  it('AC-3602.3: planOf(away clear)는 away·back·backWait를 null로 미리 얹고 띠 글을 주며(되돌리기는 조용히 보내 보이지 않음) 되돌리기는 없다. away 값이 on·off·clear가 아니면 맞지 않는 쓰기다', () => {
    const board = fx.arrangeMockupBoard()
    for (const k of [K.d, K.e, K.b, K.a]) {
      const plan = view.planOf(board, { k, op: 'away', v: 'clear' })
      expect(arrRow(plan.board, k), k).toMatchObject({ away: null, back: null, backWait: null })
      expect(typeof plan.toast, k).toBe('string')
      expect(plan.toast!.length, k).toBeGreaterThan(0)
      expect(plan.undo, k).toBeNull()
    }
    for (const v of ['back', 'ON', '', undefined]) {
      const plan = view.planOf(board, { k: K.a, op: 'away', v })
      expect(plan.toast, String(v)).toBeNull()
      expect(plan.board, String(v)).toBe(board)
    }
  })

  it('AC-3602.3: 칸 쓰기(step·set·add·remove·part, X-RAY 칸 포함)는 그 줄의 backWait만 지우고 back은 둔다. 맞지 않는 칸 쓰기·ptf는 backWait를 그대로 둔다', () => {
    const board = fx.arrangeMockupBoard()
    for (const ask of [
      { k: K.e, op: 'step', col: 'carm' },
      { k: K.e, op: 'set', col: 'pt', v: 'done' },
      { k: K.e, op: 'add', col: 'xray', v: 'X-ray 찍기' },
      { k: K.e, op: 'add', col: 'ds', v: '30분' },
      { k: K.e, op: 'remove', col: 'trac' },
      { k: K.e, op: 'part', col: 'carm', v: '허리', t: 'TP' },
    ]) {
      const plan = view.planOf(board, ask)
      expect(plan.toast, JSON.stringify(ask)).not.toBeNull()
      expect(backOf(plan.board, K.e), JSON.stringify(ask)).toEqual(['10:52', null])
    }
    for (const ask of [
      { k: K.e, op: 'ptf', v: 'up' },
      { k: K.e, op: 'step', col: 'sono' },
      { k: K.e, op: 'add', col: 'pt', v: 'ICE' },
    ])
      expect(backOf(view.planOf(board, ask).board, K.e), JSON.stringify(ask)).toEqual(['10:52', '12분째'])
    // back이 없는 줄·셈이 멈춘 줄은 그대로
    expect(backOf(view.planOf(board, { k: K.c, op: 'step', col: 'pt' }).board, K.c)).toEqual([null, null])
    expect(backOf(view.planOf(board, { k: K.b, op: 'step', col: 'pt' }).board, K.b)).toEqual(['10:31', null])
    // 셈을 멈춘 칸 쓰기 뒤 그린 모양: "돌아옴 10:52"만
    const drawn = draw(view.planOf(board, { k: K.e, op: 'step', col: 'carm' }).board).page
    expect(shapeOf(tBtn(drawn, '가상환자25'))).toEqual(['span.t-time', 'span.rtn-tag'])
  })
})

// ---- 비고 (reception-arrange-tune REQ-3605) -------------------------------------------------------------------

describe('REQ-3605 비고', () => {
  it('AC-3605.1: 지난번 증상은 세 줄까지 보이고 넘치면 줄임표다(line-clamp 3)', () => {
    expect(cssValue('.lastsym', '-webkit-line-clamp')).toBe('3')
    expect(cssValue('.lastsym', 'line-clamp')).toBe('3')
    expect(cssValue('.lastsym', 'display')).toBe('-webkit-box')
    expect(cssValue('.lastsym', 'overflow')).toBe('hidden')
  })

  it('AC-3605.2: 비고 칸을 누르면 성함을 누른 것과 같이 onChart(열쇠)를 부르고 다른 쓰기는 부르지 않는다. 단추는 칸 가득·왼쪽 맞춤이고 44px 이상이다', () => {
    const onChart = vi.fn()
    const onAway = vi.fn()
    const onCell = vi.fn()
    const { page } = draw(fx.arrangeMockupBoard(), { onChart, onAway, onCell })
    const memo = (name: string) => trOf(page, name).querySelector<HTMLButtonElement>('td.c-memo > button.memo-btn')!
    memo('가상환자21').click()
    expect(onChart).toHaveBeenLastCalledWith(K.a)
    memo('가상환자23').click()
    expect(onChart).toHaveBeenLastCalledWith(K.c)
    memo('가상환자21').querySelector<HTMLElement>('.arr-memo')!.click()
    expect(onChart).toHaveBeenLastCalledWith(K.a)
    expect(onChart).toHaveBeenCalledTimes(3)
    expect(onAway).not.toHaveBeenCalled()
    expect(onCell).not.toHaveBeenCalled()
    expect(cssValue('.memo-btn', 'width')).toBe('100%')
    expect(cssValue('.memo-btn', 'text-align')).toBe('left')
    expect(Number.parseFloat(cssValue('.memo-btn', 'min-height') ?? '0')).toBeGreaterThanOrEqual(44)
  })
})

// ---- 환자 글 (AC-3312.1) ---------------------------------------------------------------------------------

describe('REQ-3312 환자 글은 글자로만', () => {
  it('AC-3312.1: 이름·차트번호·정보·메모·지난번 증상·부위·칸 글에 HTML을 넣어도 글자로만 보인다', () => {
    const board = fx.arrangeMockupBoard()
    const list = board.lists.pay.find((r) => r.k === K.b)!
    list.name = '<b>가상환자22</b>'
    list.chart = '<i>910022</i>'
    list.memo = '<img src=x onerror=alert(1)>'
    list.info = '<u>47세</u> · 남 · 재진'
    const row = arrRow(board, K.b)!
    row.last = '<script>지난번</script>'
    row.cells.carm!.part = '<em>허리</em>'
    row.cells.carm!.tags = ['<u>TP</u>']
    row.cells.pt!.det = '<s>HP</s>'
    const { page } = draw(board, { endedOpen: true })
    const tr = trOf(page, '<b>가상환자22</b>')
    expect(textOf(tr, '.chart')).toBe('<i>910022</i>')
    expect(textOf(tr, '.arr-memo')).toBe('<img src=x onerror=alert(1)>')
    expect(textOf(tr, '.lastsym')).toBe('지난번<script>지난번</script>')
    expect(textOf(tr, 'td.c-carm .det')).toBe('<em>허리</em>')
    expect(textOf(tr, 'td.c-carm .tags > .drug')).toBe('<u>TP</u>')
    expect(textOf(tr, 'td.c-pt .det')).toBe('<s>HP</s>')
    expect(page.querySelector('b, i, u, s, em, script, img:not(.logo)')).toBeNull()
  })

  it('AC-3312.1: arrange.js는 화면 파일만 불러오고 HTML 넣기·저장소·console·eval·fetch를 쓰지 않는다(ESLint 울타리와 같은 금지)', () => {
    const source = readWww('arrange.js')
    expect(source.length).toBeGreaterThan(0)
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(code).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|DOMParser|localStorage|sessionStorage|indexedDB|\bcaches\b|cookie|serviceWorker|console|\beval\b|new Function|\bfetch\b|XMLHttpRequest|WebSocket|sendBeacon/)
    for (const m of code.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) expect(m[1]).toMatch(/^\.\/[\w-]+\.js$/)
  })
})

// 시안 파일이 그대로 있는지(시험이 글을 옮겨 적은 곳)
describe('승인 시안', () => {
  it('AC-3308.2: 승인 시안 Arrange.html에 시험이 옮긴 글이 있다', () => {
    const html = readFileSync(MOCKUP, 'utf8')
    for (const text of [OLD_HOWTO_0, OLD_HOWTO_1, OLD_FOOT, ...OLD_PARTS, LATER, '처방에 없어도 넣을 수 있어요', '첫 방문이라 지난 증상이 없어요']) expect(html, text).toContain(text)
    expect(nameOf(K.a)).toBe('가상환자21')
  })

  it('AC-3602.2 · AC-3604.4 · AC-3605.1: 돌아옴 승인 시안(reception-arrange-tune Mock.html)에 시험이 옮긴 글·class가 있다', () => {
    const html = readFileSync(TUNE_MOCKUP, 'utf8')
    for (const text of [
      HOWTO[1]!,
      FOOT,
      "lg.className = 'lg rtn'",
      "lg.textContent = '돌아옴'",
      '누르면 <span class="nw">자리비움·</span><wbr>돌아옴',
      '<span class="rtn-tag">돌아옴 ${mark.at}</span>',
      '<span class="wt rtn-wt">${mark.mins}분째</span>',
      "toast(`${nameOf(tr)} · 돌아옴 ${NOW}`, undo)",
      "b.className = 'memo-btn'",
      "items.join('·')",
      '-webkit-line-clamp: 3;',
      'color: var(--ok);',
    ])
      expect(html, text).toContain(text)
  })

  it('AC-3503.1 · AC-3504.1: 고르기 목록 승인 시안 Mock.html에 시험이 옮긴 글이 있다', () => {
    const html = readFileSync(PICK_LISTS_MOCKUP, 'utf8')
    for (const text of [
      HOWTO_PICK,
      '시술·약재·순서',
      'C-ARM 넣기',
      '시술과 약재를 골라요',
      '은 약재 없이 넣어요',
      '시술 고르기',
      'SONO 넣기',
      '쪽을 누르고 부위를 눌러 담아요. 두 부위면 하나 더 담아요',
      '고른 것',
      '아직 없어요 · 아래에서 부위를 눌러요',
      '안 고르면 부위만 담겨요',
      '쪽·부위 없이 그대로 담겨요',
      '같이 하는 것',
      "'오른쪽', '왼쪽', '양쪽'",
      "오른쪽: '오른', 왼쪽: '왼', 양쪽: '양'",
      "' + '",
      "' · '",
    ])
      expect(html, text).toContain(text)
    for (const name of [...fx.defaultPicks().sono.parts, ...fx.defaultPicks().sono.plains, ...fx.defaultPicks().sono.withs, ...fx.defaultPicks().carm.drugs]) expect(html, name).toContain(`'${name}'`)
  })
})
