// @vitest-environment jsdom
// 기록부 화면 charts.js (TASK-10, REQ-3309, reception-arrange design.md 10절, 승인 시안 Arrange.html의 진료기록부 화면).
// 머리([‹ 어레인지]·차트번호·이름·정보·신환 표시·상태·접수 시각·메모) 아래 "오늘 진료기록부"(detail.js paperCard 그대로)와
// "직전 진료기록부 {날짜} · {N일 전}"(GET /api/visit/{k}/prev의 종이 카드: 사람 칸·특이사항 없이 같은 부분, 회색 테두리).
// 태블릿은 두 칸(왼쪽 오늘 | 오른쪽 직전), 폰은 위아래. 읽는 중·실패는 그 칸에 한 줄. 자료는 가짜다(fixtures.ts)
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import * as fx from './fixtures'
import type { FakeHistory, FakePrev, FakeRow } from './fixtures'

type Today = 'reading' | 'error' | FakeHistory
type Prev = 'reading' | 'error' | FakePrev | null

interface ChartsJs {
  renderCharts: (host: HTMLElement, row: FakeRow, today: Today, prev: Prev, view?: { today?: Date }) => HTMLElement
}

interface DetailJs {
  paperCard: (row: FakeRow, paper: FakeHistory['paper'], options?: { today?: Date; open?: boolean }) => HTMLElement
}

// 화면 파일은 빌드 없는 JS라 형 선언이 없다(design.md 결정 '화면은 빌드 없는 JS'). 경로를 값으로 두어 형 검사가 묻지 않게 한다
const CHARTS_JS = '../www/charts.js'
const DETAIL_JS = '../www/detail.js'
const STYLE_CSS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'www', 'style.css')

/** 오늘(시험 기준): 2026년 11월 9일 */
const TODAY = new Date(2026, 10, 9, 11, 4, 15)

let charts: ChartsJs
let detail: DetailJs

beforeAll(async () => {
  // 아직 없으면(RED) 빈 것을 그리는 대역으로 시험마다 실패를 보인다
  const missing: ChartsJs = { renderCharts: (host) => host.appendChild(document.createElement('div')) }
  charts = ((await import(/* @vite-ignore */ CHARTS_JS).catch(() => missing)) ?? missing) as ChartsJs
  const noCard: DetailJs = { paperCard: () => document.createElement('article') }
  const mod = (await import(/* @vite-ignore */ DETAIL_JS)) as Partial<DetailJs>
  detail = typeof mod.paperCard === 'function' ? (mod as DetailJs) : noCard
})

afterEach(() => {
  document.body.replaceChildren()
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollHeight')
  Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight')
})

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

function shapeOf(node: Element | null | undefined): string[] {
  return [...(node?.children ?? [])].map((c) => `${c.tagName.toLowerCase()}${c.className ? `.${String(c.className).split(' ').join('.')}` : ''}`)
}

/** 가짜 판의 수납완료 줄 a(가상환자21, 재진)와 진료보류 줄 c(가상환자23, 신환) */
function rowOf(k: string): FakeRow {
  const row = Object.values(fx.arrangeMockupBoard().lists)
    .flat()
    .find((r) => r.k === k)
  if (!row) throw new Error('줄 없음')
  return row
}

const A = () => rowOf(fx.ARRANGE_KEYS.a)
const C = () => rowOf(fx.ARRANGE_KEYS.c)
const TODAY_HISTORY = () => fx.fakeHistory(3, 0, '오른 무릎 조금 나아짐')
const FOOT = '보기만 할 수 있어요 · 비트 자료는 바뀌지 않아요'

function draw(row: FakeRow, today: Today, prev: Prev) {
  const app = appHost()
  const page = charts.renderCharts(app, row, today, prev, { today: TODAY })
  return { app, page }
}

function sections(page: ParentNode): HTMLElement[] {
  return [...page.querySelectorAll<HTMLElement>('main.charts > section')]
}

describe('REQ-3309 기록부 화면 (charts.js)', () => {
  it('AC-3309.1: 머리는 [‹ 어레인지](#/a)·연결됨, 차트번호·이름·"나이세 · 성별 · 신환|재진"·신환 표시, 상태·"HH:MM 접수", 메모 상자다', () => {
    const { app, page } = draw(C(), TODAY_HISTORY(), fx.fakePrev())
    expect(app.children.length).toBe(1)
    expect(page.className).toBe('page charts-page')
    expect(page.getAttribute('data-k')).toBe(fx.ARRANGE_KEYS.c)
    expect(shapeOf(page)).toEqual(['header.top.chart-top', 'main.charts', 'footer.foot'])
    const top = page.querySelector('header.top')!
    expect(shapeOf(top)).toEqual(['div.top-row', 'div.who', 'div.state', 'div.memo'])
    expect(shapeOf(top.querySelector('.top-row'))).toEqual(['a.back', 'span.conn'])
    expect(top.querySelector('a.back')?.getAttribute('href')).toBe('#/a')
    expect(textOf(top, 'a.back')).toBe('어레인지')
    expect(textOf(top, '.conn')).toBe('연결됨')
    expect(shapeOf(top.querySelector('.who'))).toEqual(['span.chart', 'h1.detail-name', 'span.meta', 'span.new-badge'])
    expect(textsOf(top, '.who > *')).toEqual(['910023', '가상환자23', '38세 · 여 · 신환', '신환'])
    expect(shapeOf(top.querySelector('.state'))).toEqual(['span.status.status-hold', 'span'])
    expect(textsOf(top, '.state > span')).toEqual(['진료보류', '09:40 접수'])
    const memo = top.querySelector('.memo')!
    expect([...memo.childNodes].map((n) => (n instanceof Element ? `${n.className}:${n.textContent}` : `#${n.textContent}`))).toEqual(['memo-label:메모', '#오른 어깨 처음'])
    expect(textOf(page, 'footer.foot')).toBe(FOOT)
    // 재진은 신환 표시가 없고, 메모가 없으면 상자도 없다
    const plain = draw({ ...A(), memo: '' }, TODAY_HISTORY(), null).page
    expect(shapeOf(plain.querySelector('.who'))).toEqual(['span.chart', 'h1.detail-name', 'span.meta'])
    expect(shapeOf(plain.querySelector('header.top'))).toEqual(['div.top-row', 'div.who', 'div.state'])
    expect(document.title).toBe('')
  })

  it('AC-3309.1: "오늘 진료기록부 YYYY-MM-DD" 아래 오늘 종이는 detail.js paperCard 그대로이고(사람 칸·특이사항 포함), "직전 진료기록부 {날짜} · {N일 전}" 아래 직전 종이가 있다', () => {
    const history = TODAY_HISTORY()
    const { page } = draw(A(), history, fx.fakePrev())
    const [today, prev] = sections(page)
    expect(sections(page).length).toBe(2)
    expect(today!.className).toBe('chart-today')
    expect(prev!.className).toBe('chart-prev')
    expect(shapeOf(today!.querySelector('h2'))).toEqual(['span.h-dt'])
    expect(today!.querySelector('h2')?.className).toBe('charts-h')
    expect(today!.querySelector('h2')?.firstChild?.textContent).toBe('오늘 진료기록부')
    expect(textOf(today, 'h2 > .h-dt')).toBe('2026-11-09')
    expect(shapeOf(today)).toEqual(['h2.charts-h', 'article.paper'])
    const card = today!.querySelector('article.paper')!
    expect(card.outerHTML).toBe(detail.paperCard(A(), history.paper!, { today: TODAY }).outerHTML)
    expect(card.querySelector('dl.kv')).not.toBeNull()
    expect(card.querySelector('.spc')).not.toBeNull()

    expect(prev!.querySelector('h2')?.firstChild?.textContent).toBe('직전 진료기록부')
    expect(textOf(prev, 'h2 > .h-dt')).toBe('2026-10-26 · 14일 전')
    expect(shapeOf(prev)).toEqual(['h2.charts-h', 'article.paper.past'])
  })

  it('AC-3309.1: 직전 종이는 머리글(외래진료기록부·날짜)·<내원내역>·<증상>·<상병>·<처방>·<원외처방>뿐이고 사람 칸·특이사항이 없다', () => {
    const { page } = draw(A(), TODAY_HISTORY(), fx.fakePrev())
    const card = page.querySelector('section.chart-prev > article.paper.past')!
    expect(shapeOf(card)).toEqual(['div.paper-head', 'div.sec', 'div.paper-body'])
    expect(textsOf(card, '.paper-head > span')).toEqual(['외래진료기록부', '2026-10-26'])
    expect(card.querySelector('dl.kv, .spc, hr.rule')).toBeNull()
    expect(textOf(card, ':scope > .sec > .sec-h')).toBe('내원내역')
    expect(textsOf(card, ':scope > .sec > .visit-line > span')).toEqual(['내원 : 20261026', '1진료실', '국민건강보험'])
    expect(textsOf(card, '.paper-body > .sec > .sec-h')).toEqual(['증상', '상병', '처방', '원외처방'])
    expect(textOf(card, '.paper-sym > .paper-sym-day')).toBe('20261026')
    expect(card.querySelector('.paper-sym > pre')?.textContent).toBe('Rt knee pain\n계단·앉았다 일어날 때 심함\n\nxr: OA gr.2')
    expect(textsOf(card, 'ul.dx > li')).toEqual(['M1716가상 무릎관절증'])
    expect(card.querySelector('ul.dx code')?.className).toBe('main')
    expect([...card.querySelectorAll('table.rx')].map((t) => textsOf(t, 'tbody td'))).toEqual([
      ['G7204', '가상 무릎 촬영', '1', '1', '1'],
      ['641901140', '가상정200mg', '1', '2', '7'],
    ])
  })

  it('AC-3309.1: 지난 내원이 없으면(prev null) 직전 칸은 "첫 방문이라 직전 기록부가 없어요." 회색 카드이고 제목에 날짜가 없다', () => {
    const { page } = draw(C(), TODAY_HISTORY(), null)
    const prev = page.querySelector('section.chart-prev')!
    expect(shapeOf(prev)).toEqual(['h2.charts-h', 'div.paper.none-card'])
    expect(textOf(prev, 'h2')).toBe('직전 진료기록부')
    expect(prev.querySelector('h2 .h-dt')).toBeNull()
    expect(textOf(prev, '.none-card')).toBe('첫 방문이라 직전 기록부가 없어요.')
  })

  it('AC-3309.1: 환자 글(이름·메모·직전 증상·처방 이름)에 HTML을 넣어도 글자로만 보인다', () => {
    const row = { ...A(), name: '<b>가상환자21</b>', memo: '<img src=x onerror=alert(1)>' }
    const prev = fx.fakePrev({ sym: '<script>아픔</script>', rx: [{ code: '<i>X</i>', name: '<u>약</u>', qty: '1', tms: '1', day: '1' }] })
    const { page } = draw(row, TODAY_HISTORY(), prev)
    expect(textOf(page, 'h1.detail-name')).toBe('<b>가상환자21</b>')
    expect(page.querySelector('.past .paper-sym > pre')?.textContent).toBe('<script>아픔</script>')
    expect(textsOf(page.querySelector('.past')!, 'table.rx tbody td').slice(0, 2)).toEqual(['<i>X</i>', '<u>약</u>'])
    expect(page.querySelector('b, i, u, script, img')).toBeNull()
  })

  it('AC-3309.5: 읽는 중이면 그 칸에 "기록부를 읽는 중이에요", 읽기 실패면 "지금 기록부를 읽지 못했어요" 한 줄만 보인다(다른 칸은 그대로)', () => {
    const reading = draw(A(), 'reading', 'reading').page
    expect(sections(reading).map((s) => shapeOf(s))).toEqual([
      ['h2.charts-h', 'p.chart-note'],
      ['h2.charts-h', 'p.chart-note'],
    ])
    expect(textsOf(reading, 'p.chart-note')).toEqual(['기록부를 읽는 중이에요', '기록부를 읽는 중이에요'])
    expect(textOf(reading, 'section.chart-prev h2')).toBe('직전 진료기록부')

    const failed = draw(A(), 'error', fx.fakePrev()).page
    expect(shapeOf(failed.querySelector('section.chart-today'))).toEqual(['h2.charts-h', 'p.chart-note.is-error'])
    expect(textOf(failed, 'section.chart-today p.chart-note')).toBe('지금 기록부를 읽지 못했어요')
    expect(failed.querySelector('section.chart-prev article.paper.past')).not.toBeNull()

    const prevFailed = draw(A(), TODAY_HISTORY(), 'error').page
    expect(shapeOf(prevFailed.querySelector('section.chart-prev'))).toEqual(['h2.charts-h', 'p.chart-note.is-error'])
    expect(textOf(prevFailed, 'section.chart-prev p.chart-note')).toBe('지금 기록부를 읽지 못했어요')
    expect(prevFailed.querySelector('section.chart-today article.paper')).not.toBeNull()
  })

  it('AC-3309.1 · AC-3309.3: 같은 환자를 다시 그리면 화면 뼈대는 그대로이고 머리·오늘 종이만 새 값이며, 펼쳐 둔 특이사항은 펼친 채다', () => {
    // jsdom은 높이를 재지 않는다: 줄 수 × 20px, 접힘(.clamp)이면 5줄까지
    const lines = (node: Element) => (node.textContent ?? '').split('\n').length
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: function (this: HTMLElement) { return lines(this) * 20 } })
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get: function (this: HTMLElement) {
        return (this.classList.contains('clamp') ? Math.min(lines(this), 5) : lines(this)) * 20
      },
    })
    const long = Array.from({ length: 8 }, (_, i) => `가상 특이사항 ${i + 1}`).join('\n')
    const first = fx.fakeHistory(3, 0, '', fx.fakePaper({ special: long }))
    const { app, page } = draw(A(), first, fx.fakePrev())
    const more = () => page.querySelector<HTMLButtonElement>('section.chart-today .spc-more')!
    expect(more().hidden).toBe(false)
    more().click()
    expect(more().getAttribute('aria-expanded')).toBe('true')
    const prevCard = page.querySelector('section.chart-prev article')

    const next = fx.fakeHistory(3, 0, '', fx.fakePaper({ special: long, sym: '새 증상' }))
    const again = charts.renderCharts(app, { ...A(), lane: 'pay', laneLabel: '수납대기' }, next, fx.fakePrev(), { today: TODAY })
    expect(again).toBe(page)
    expect(app.children.length).toBe(1)
    expect(textsOf(page, '.state > span')).toEqual(['수납대기', '09:12 접수'])
    expect(page.querySelector('section.chart-today .paper-sym > pre')?.textContent).toBe('새 증상')
    expect(more().getAttribute('aria-expanded')).toBe('true')
    expect(page.querySelector('section.chart-today .spc-text')?.classList.contains('clamp')).toBe(false)
    expect(page.querySelector('section.chart-prev article')?.outerHTML).toBe(prevCard?.outerHTML)

    // 다른 환자면 새로 그린다
    const other = charts.renderCharts(app, C(), TODAY_HISTORY(), null, { today: TODAY })
    expect(other).not.toBe(page)
    expect(other.getAttribute('data-k')).toBe(fx.ARRANGE_KEYS.c)
    expect(app.children.length).toBe(1)
  })
})

// ---- 모양 (AC-3309.2) ----------------------------------------------------------------------------------

const TABLET = '(min-width: 1000px) and (orientation: landscape)'

function cssValue(selector: string, prop: string, media: 'phone' | 'tablet' = 'phone'): string | undefined {
  const css = existsSync(STYLE_CSS) ? readFileSync(STYLE_CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '') : ''
  // @media 안 규칙은 그 블록 안 글만 본다
  const tabletAt = css.indexOf(`@media ${TABLET}`)
  const tabletText = tabletAt >= 0 ? css.slice(tabletAt) : ''
  const phoneText = tabletAt >= 0 ? css.slice(0, tabletAt) : css
  const text = media === 'tablet' ? tabletText : phoneText
  let found: string | undefined
  for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!m[1]!.split(',').map((s) => s.trim()).includes(selector)) continue
    for (const decl of m[2]!.split(';')) {
      const colon = decl.indexOf(':')
      if (colon > 0 && decl.slice(0, colon).trim() === prop) found = decl.slice(colon + 1).trim()
    }
  }
  return found
}

describe('REQ-3309 기록부 모양 (style.css)', () => {
  it('AC-3309.2: 태블릿 모양이면 오늘과 직전이 왼쪽·오른쪽 두 칸이고, 폰은 한 칸(위아래)이다', () => {
    expect(cssValue('.charts', 'display')).toBe('grid')
    expect(cssValue('.charts', 'grid-template-columns')).toBe('minmax(0, 1fr)')
    expect(cssValue('.charts', 'grid-template-columns', 'tablet')).toBe('repeat(2, minmax(0, 1fr))')
  })

  it('AC-3309.1: 직전 종이·첫 방문 카드는 회색 테두리이고, 기록부 화면이 그리는 class는 모두 style.css에 모양이 있다', () => {
    expect(cssValue('.paper.past', 'border-color')).toBe('var(--line-2)')
    expect(cssValue('.paper.none-card', 'border-color')).toBe('var(--line-2)')
    const css = readFileSync(STYLE_CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const pages = [draw(C(), TODAY_HISTORY(), fx.fakePrev()).page, draw(A(), 'error', null).page, draw(A(), 'reading', 'reading').page]
    const classes = new Set(pages.flatMap((page) => [page, ...page.querySelectorAll('*')].flatMap((n) => [...n.classList])))
    for (const cls of classes) expect(css, `.${cls}`).toMatch(new RegExp(`\\.${cls}(?![\\w-])`))
  })
})
