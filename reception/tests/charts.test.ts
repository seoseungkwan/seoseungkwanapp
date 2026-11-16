// @vitest-environment jsdom
// 기록부 화면 charts.js (TASK-10, REQ-3309, reception-arrange design.md 10절, 승인 시안 Arrange.html의 진료기록부 화면).
// 머리([‹ 어레인지]·차트번호·이름·정보·신환 표시·상태·접수 시각·메모) 아래 "오늘 진료기록부"(detail.js paperCard 그대로)와
// "직전 진료기록부 {날짜} · {N일 전}"(GET /api/visit/{k}/prev의 종이 카드: 사람 칸·특이사항 없이 같은 부분, 회색 테두리).
// 태블릿은 두 칸(왼쪽 오늘 | 오른쪽 직전), 폰은 위아래. 읽는 중·실패는 그 칸에 한 줄. 자료는 가짜다(fixtures.ts)
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import * as fx from './fixtures'
import type { FakeHistory, FakePapers, FakePrev, FakeRow } from './fixtures'

type Today = 'reading' | 'error' | FakeHistory
type Prev = 'reading' | 'error' | FakePrev | null
/** 그 전 진료기록부 papers?from=1 답 자리 (reception-arrange-tune AC-3605.3) */
type Older = 'reading' | 'error' | FakePapers

interface ChartsView {
  today?: Date
  older?: Older
  onMore?: (from: number) => Promise<unknown>
}

interface ChartsJs {
  renderCharts: (host: HTMLElement, row: FakeRow, today: Today, prev: Prev, view?: ChartsView) => HTMLElement
}

interface DetailJs {
  paperCard: (row: FakeRow, paper: FakeHistory['paper'], options?: { today?: Date; open?: boolean }) => HTMLElement
  pastCard?: (paper: FakePrev) => HTMLElement
}

/** 돌아옴·비고 기록부 승인 시안 (reception-arrange-tune) */
const TUNE_MOCKUP = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'mockups', 'reception-arrange-tune', 'Mock.html')

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

  it('AC-3309.6: 머리의 "HH:MM 접수" 뒤에 "·"와 기다린 글이 있고(진료보류 "보류 N째"는 "N째 대기"), long이면 주황(wt is-long)이며 판이 새로 오면 새 값이다', () => {
    const { app, page } = draw({ ...C(), waited: '보류 1시간 4분째', long: true }, TODAY_HISTORY(), null)
    const state = () => page.querySelector('header.top .state')!
    expect(shapeOf(state())).toEqual(['span.status.status-hold', 'span', 'span.sep', 'span.wt.is-long'])
    expect(textsOf(page, '.state > span')).toEqual(['진료보류', '09:40 접수', '·', '1시간 4분째 대기'])

    charts.renderCharts(app, { ...C(), lane: 'wait', laneLabel: '진료대기', waited: '18분째 대기', long: false }, TODAY_HISTORY(), null, { today: TODAY })
    expect(shapeOf(state())).toEqual(['span.status.status-wait', 'span', 'span.sep', 'span.wt'])
    expect(textsOf(page, '.state > span')).toEqual(['진료대기', '09:40 접수', '·', '18분째 대기'])
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
    // 직전 아래 "그 전 진료기록부" 묶음(reception-arrange-tune AC-3605.3)
    expect(shapeOf(prev)).toEqual(['h2.charts-h', 'article.paper.past', 'section.older'])
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

// ---- 그 전 진료기록부 (reception-arrange-tune AC-3605.3 · 3605.4) ------------------------------------------------

/** 바로 끝나는 일(약속 답)을 다 돌린다 */
async function flush() {
  for (let i = 0; i < 5; i += 1) await Promise.resolve()
}

/** "yyyy-MM-dd" → "M월 D일" */
function monthDay(date: string): string {
  const [, m, d] = date.split('-')
  return `${Number(m)}월 ${Number(d)}일`
}

describe('REQ-3605 그 전 진료기록부 (charts.js)', () => {
  const olderOf = (page: ParentNode) => page.querySelector<HTMLElement>('section.chart-prev > section.older')
  const listOf = (page: ParentNode) => olderOf(page)?.querySelector<HTMLElement>(':scope > div.past-list') ?? null
  const moreOf = (page: ParentNode) => listOf(page)?.querySelector<HTMLButtonElement>(':scope > button.more-papers') ?? null
  const cardsOf = (page: ParentNode) => [...(listOf(page)?.querySelectorAll<HTMLElement>(':scope > article.paper.past') ?? [])]
  const drawWith = (prev: Prev, view: ChartsView) => {
    const app = appHost()
    const page = charts.renderCharts(app, A(), TODAY_HISTORY(), prev, { today: TODAY, ...view })
    return { app, page }
  }

  it('AC-3605.3: 직전 기록부가 있으면 그 아래 "그 전 진료기록부"(h2.charts-h.older)와 papers?from=1 답의 장마다 머리("M월 D일" · "N일 전", [지난번] 없음) + 지난 종이 카드(detail.js pastCard 그대로)를 붙이고, 다음 쪽이 있으면 [이전 진료기록부 더 보기 ▾]다', () => {
    const older = fx.fakePapers(36, 1)
    expect(older.papers).toHaveLength(3)
    expect(older.next).toBe(4)
    const { page } = drawWith(fx.fakePrev(), { older })
    const section = olderOf(page)!
    expect(section).not.toBeNull()
    expect(shapeOf(section)).toEqual(['h2.charts-h.older', 'div.past-list'])
    expect(textOf(section, ':scope > h2')).toBe('그 전 진료기록부')
    const list = listOf(page)!
    expect(shapeOf(list)).toEqual(['div.past-h', 'article.paper.past', 'div.past-h', 'article.paper.past', 'div.past-h', 'article.paper.past', 'button.more-papers'])
    const heads = [...list.querySelectorAll(':scope > .past-h')]
    expect(heads.map((h) => shapeOf(h))).toEqual(Array.from({ length: 3 }, () => ['strong', 'span.visit-ago']))
    expect(heads.map((h) => [textOf(h, 'strong'), textOf(h, '.visit-ago')])).toEqual(older.papers.map((p) => [monthDay(p.date), p.ago]))
    expect(section.querySelector('.last-badge')).toBeNull()
    expect(cardsOf(page).map((c) => c.outerHTML)).toEqual(older.papers.map((p) => detail.pastCard!(p).outerHTML))
    const more = moreOf(page)!
    expect(more.getAttribute('type')).toBe('button')
    expect(more.firstChild?.textContent).toBe('이전 진료기록부 더 보기 ▾')
    expect(textOf(more, ':scope > small')).toBe('32번 더 있어요 · 누를 때마다 3장씩')
    // 시안 글 그대로
    const html = readFileSync(TUNE_MOCKUP, 'utf8')
    for (const text of [
      "h.className = 'charts-h older'",
      "h.textContent = '그 전 진료기록부'",
      "list.className = 'past-list'",
      "more.innerHTML = '이전 진료기록부 더 보기 ▾<small>3번 더 있어요 · 누를 때마다 3장씩</small>'",
      'prev.append(h, list)',
    ])
      expect(html, text).toContain(text)
  })

  it('AC-3605.3: [더 보기]는 view.onMore(next)를 한 번 불러 그 쪽 3장을 아래에 붙이고 [더 보기]를 다음 쪽으로 바꾼다(끝이면 없다). 읽는 동안 꺼져 있고 실패하면 한 줄 + 다시 누를 수 있다', async () => {
    let answer: (page: FakePapers | null) => void = () => {}
    const onMore = vi.fn(
      () =>
        new Promise<FakePapers>((resolve, reject) => {
          answer = (page) => (page ? resolve(page) : reject(new Error('실패')))
        }),
    )
    const { page } = drawWith(fx.fakePrev(), { older: fx.fakePapers(10, 1), onMore })
    moreOf(page)!.click()
    await flush()
    expect(onMore).toHaveBeenCalledTimes(1)
    expect(onMore).toHaveBeenLastCalledWith(4)
    expect(moreOf(page)!.disabled).toBe(true)
    moreOf(page)!.click()
    expect(onMore).toHaveBeenCalledTimes(1)
    answer(null)
    await flush()
    expect(textOf(listOf(page), ':scope > p.past-note')).toBe('지금 기록부를 읽지 못했어요')
    expect(moreOf(page)!.disabled).toBe(false)
    moreOf(page)!.click()
    await flush()
    answer(fx.fakePapers(10, 4))
    await flush()
    expect(onMore).toHaveBeenCalledTimes(2)
    expect(cardsOf(page)).toHaveLength(6)
    expect(listOf(page)!.querySelector('p.past-note')).toBeNull()
    expect(textOf(moreOf(page), ':scope > small')).toBe('3번 더 있어요 · 누를 때마다 3장씩')
    moreOf(page)!.click()
    await flush()
    expect(onMore).toHaveBeenLastCalledWith(7)
    answer(fx.fakePapers(10, 7))
    await flush()
    expect(cardsOf(page)).toHaveLength(9)
    expect(moreOf(page)).toBeNull()
    expect(page.querySelector('section.older .last-badge')).toBeNull()
  })

  it('AC-3605.3: 읽는 중(older 없음 포함)은 "기록부를 읽는 중이에요", 실패는 "지금 기록부를 읽지 못했어요", 없으면 "그 전 기록부는 없어요."다. 첫 방문(직전 없음)·직전을 읽는 중·실패면 이 묶음이 없다', () => {
    for (const [older, shape, text] of [
      ['reading', 'p.past-note', '기록부를 읽는 중이에요'],
      [undefined, 'p.past-note', '기록부를 읽는 중이에요'],
      ['error', 'p.past-note', '지금 기록부를 읽지 못했어요'],
      [fx.fakePapers(1, 1), 'p.no-visits', '그 전 기록부는 없어요.'],
    ] as const) {
      const { page } = drawWith(fx.fakePrev(), older === undefined ? {} : { older })
      expect(shapeOf(olderOf(page)), String(older)).toEqual(['h2.charts-h.older', 'div.past-list'])
      expect(shapeOf(listOf(page)), String(older)).toEqual([shape])
      expect(textOf(listOf(page), ':scope > p'), String(older)).toBe(text)
      document.body.replaceChildren()
    }
    for (const prev of [null, 'reading', 'error'] as const) {
      const { page } = drawWith(prev, { older: fx.fakePapers(36, 1) })
      expect(olderOf(page), String(prev)).toBeNull()
      expect(page.querySelector('.charts-h.older'), String(prev)).toBeNull()
      document.body.replaceChildren()
    }
  })

  it('AC-3605.4: 같은 환자를 같은 답으로 다시 그리면 그 전 묶음은 그대로다([더 보기]로 붙인 장·초점 포함). 읽는 중에서 답이 오면 채우고, 다른 환자면 새로 그린다', async () => {
    const older = fx.fakePapers(36, 1)
    const onMore = vi.fn(() => Promise.resolve(fx.fakePapers(36, 4)))
    const { app, page } = drawWith(fx.fakePrev(), { older, onMore })
    const section = olderOf(page)!
    moreOf(page)!.click()
    await flush()
    expect(cardsOf(page)).toHaveLength(6)
    moreOf(page)!.focus()
    const focused = document.activeElement
    expect(focused).toBe(moreOf(page))
    // 판을 저절로 다시 읽어 머리·오늘 종이가 바뀌어도
    charts.renderCharts(app, { ...A(), lane: 'pay', laneLabel: '수납대기' }, TODAY_HISTORY(), fx.fakePrev(), { today: TODAY, older, onMore })
    charts.renderCharts(app, A(), TODAY_HISTORY(), fx.fakePrev(), { today: TODAY, older, onMore })
    expect(olderOf(page)).toBe(section)
    expect(cardsOf(page)).toHaveLength(6)
    expect(document.activeElement).toBe(focused)
    expect(shapeOf(page.querySelector('section.chart-prev'))).toEqual(['h2.charts-h', 'article.paper.past', 'section.older'])
    expect(onMore).toHaveBeenCalledTimes(1)

    // 읽는 중 → 답
    document.body.replaceChildren()
    const later = drawWith(fx.fakePrev(), { older: 'reading' })
    charts.renderCharts(later.app, A(), TODAY_HISTORY(), fx.fakePrev(), { today: TODAY, older: 'reading' })
    expect(textOf(listOf(later.page), ':scope > p.past-note')).toBe('기록부를 읽는 중이에요')
    charts.renderCharts(later.app, A(), TODAY_HISTORY(), fx.fakePrev(), { today: TODAY, older })
    expect(cardsOf(later.page)).toHaveLength(3)
    // 직전을 읽는 중 → 직전 답이 오면 그 아래에 생긴다
    document.body.replaceChildren()
    const first = drawWith('reading', { older })
    expect(olderOf(first.page)).toBeNull()
    charts.renderCharts(first.app, A(), TODAY_HISTORY(), fx.fakePrev(), { today: TODAY, older })
    expect(cardsOf(first.page)).toHaveLength(3)
    // 다른 환자면 새로
    const other = charts.renderCharts(first.app, C(), TODAY_HISTORY(), fx.fakePrev(), { today: TODAY, older: 'reading' })
    expect(other).not.toBe(first.page)
    expect(textOf(listOf(other), ':scope > p.past-note')).toBe('기록부를 읽는 중이에요')
  })

  it('AC-3605.3: 그 전 묶음의 머리는 위로 띄우고(28px) 첫 장 머리는 붙인다(시안). 그리는 class는 모두 style.css에 모양이 있다. 지난 종이 글은 글자로만 들어간다', () => {
    expect(cssValue('.charts-h.older', 'margin-top')).toBe('28px')
    expect(cssValue('.chart-prev .past-list > .past-h:first-child', 'margin-top')).toBe('0')
    const css = readFileSync(STYLE_CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const pages = [drawWith(fx.fakePrev(), { older: fx.fakePapers(36, 1) }).page, drawWith(fx.fakePrev(), { older: fx.fakePapers(1, 1) }).page, drawWith(fx.fakePrev(), { older: 'error' }).page]
    const classes = new Set(pages.flatMap((page) => [page, ...page.querySelectorAll('*')].flatMap((n) => [...n.classList])))
    for (const cls of ['older', 'past-list', 'past-h', 'visit-ago', 'more-papers', 'no-visits', 'past-note']) expect(classes.has(cls), cls).toBe(true)
    for (const cls of classes) expect(css, `.${cls}`).toMatch(new RegExp(`\\.${cls}(?![\\w-])`))
    document.body.replaceChildren()
    const odd = fx.fakePapers(36, 1)
    odd.papers[0]!.sym = '<b>가상 증상</b>'
    odd.papers[0]!.ago = '<i>7일 전</i>'
    const { page } = drawWith(fx.fakePrev(), { older: odd })
    expect(textOf(listOf(page), '.past-h .visit-ago')).toBe('<i>7일 전</i>')
    expect(page.querySelector('section.older b, section.older i')).toBeNull()
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
