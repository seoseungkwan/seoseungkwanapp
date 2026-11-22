// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { METHOD, bulletText } from '@/lib/location/method'
import { DEFAULT_SCORE_RULE, type GroupId } from '@/lib/location/score'
import type { SourceId } from '@/types/location'
import { MethodCard, type MethodCardProps } from './MethodCard'
import { MethodPanel } from './MethodPanel'

// 처음 안내 '이 탭은 이렇게 분석해요' 한 장과 [분석 방법] 오른쪽 판(spec location AC-7920.1, design.md 19절,
// 시안 docs/mockups/location/index.html ?s=method·?s=empty). 글은 method.ts METHOD(requirements '화면 글 기본값' 승인 3과 lib 시험이 견줌)에서 오고,
// 셋째 줄 무게는 받은 지금 무게다. 화면 글 몇 줄은 명세 글을 그대로 적어 한 번 더 견준다

afterEach(cleanup)

const TITLE = '이 탭은 이렇게 분석해요'
const LEAD = '공개 자료로 동네를 넓게 훑고, 고른 자리를 깊게 본 뒤 점수를 매겨요. 숫자마다 어디서 왔는지 적어 두어 직접 확인할 수 있어요.'
const ROW_TITLES = ['어떤 자료를 보나', '넓게 훑고 깊게 봐요', '점수는 이렇게 매겨요', '이것은 못 봐요', '숫자마다 출처가 붙어요']
const FIRST_TEXT = '나라 기관이 공개한 자료가 대부분이에요. 묶음마다 이런 기관 자료를 봐요.'
const ORG_GROUPS = ['사는 사람·수요', '소득·쓸 힘', '경쟁 의원·다른 과 의원', '교통·흐름', '자리·건물·땅', '매물·개원 준비']
const DEFAULT_WEIGHTS_LINE = '다섯 항목 — 사는 사람·수요 30 · 경쟁 25 · 교통·흐름 20 · 자리 15 · 비용 10(처음 무게).'
const CHANGED: Record<GroupId, number> = { people: 40, rivals: 20, transit: 20, site: 10, cost: 10 }
const CHANGED_WEIGHTS_LINE = '다섯 항목 — 사는 사람·수요 40 · 경쟁 20 · 교통·흐름 20 · 자리 10 · 비용 10.'
const EXAMPLE_SOURCE = '행정안전부 행정동별(통반단위) 성/연령별 주민등록 인구수'
const EXAMPLE = `예: ${EXAMPLE_SOURCE}`
const SOURCES_BUTTON = '근거와 출처 모두 보기'
const SOURCES_HELP = '자료 이름·기준 날짜·법 근거 아홉 줄·없는 자료가 다 있어요'
const PANEL_NOTE = '처음 화면(후보 없음)에도 같은 안내가 있어요.'

// 화면 글·보조 글의 로마자 낱말. AC-7917.1과 같은 허용 목록(sources.test와 같음)만 남아도 된다
const ALLOWED_LATIN = ['SGIS', 'TASIS', 'KTX', 'MRI', 'CT', 'km', 'm', 'PDF', 'A4', 'SZ084']
const latinWords = (root: HTMLElement) => {
  const attrs = [...root.querySelectorAll('*')].flatMap((el) => ['aria-label', 'title', 'placeholder', 'alt'].map((name) => el.getAttribute(name) ?? ''))
  return [root.textContent ?? '', ...attrs].flatMap((text) => text.match(/[A-Za-z][A-Za-z0-9]*/g) ?? []).filter((word) => !ALLOWED_LATIN.includes(word))
}
const WIDTH_VARIANT = /^(?:(?:max-|min-)?(?:sm|md|lg|\d*xl)|(?:min|max)-\[[^\]]*\])$/
const widthClasses = (root: HTMLElement) =>
  [...root.querySelectorAll('[class]')]
    .flatMap((el) => (el.getAttribute('class') ?? '').split(/\s+/))
    .filter((token) => token.split(':').slice(0, -1).some((variant) => WIDTH_VARIANT.test(variant)))

type Calls = { onOpenSources: ReturnType<typeof vi.fn<() => void>>; onOpenSource: ReturnType<typeof vi.fn<(id: SourceId) => void>> }
const cardProps = (over: Partial<MethodCardProps> = {}): MethodCardProps & Calls => ({
  weights: DEFAULT_SCORE_RULE.weights,
  rivalShort: '정형외과·신경외과·마취통증·재활',
  onOpenSources: vi.fn<() => void>(),
  onOpenSource: vi.fn<(id: SourceId) => void>(),
  ...over,
}) as MethodCardProps & Calls

// 줄 하나(제목 h3로 이름 붙은 묶음)
const rowOf = (root: HTMLElement, title: string) => within(root).getByRole('group', { name: title })
const bulletsOf = (root: HTMLElement, i: number) => within(rowOf(root, ROW_TITLES[i]!)).getAllByRole('listitem')
// 시험이 기대하는 줄 글: METHOD 줄을 bulletText로(셋째 줄 첫 줄만 지금 무게로)
const expectedBullets = (i: number, weightsLine: string) =>
  METHOD.rows[i]!.bullets.map((b, k) => (i === 2 && k === 0 ? weightsLine : bulletText(b)) + (b.example ? EXAMPLE : ''))

describe('AC-7920.1: 처음 안내 한 장(MethodCard)', () => {
  it('AC-7920.1: 머리 — 이름 붙은 한 장, 제목(h2)·머리 한 줄이 화면 글 기본값 그대로', () => {
    render(<MethodCard {...cardProps()} />)
    const card = screen.getByRole('region', { name: TITLE })
    expect(within(card).getByRole('heading', { level: 2, name: TITLE })).toBeTruthy()
    expect(within(card).getByText(LEAD)).toBeTruthy()
    expect(METHOD.title).toBe(TITLE)
    expect(METHOD.lead).toBe(LEAD)
  })

  it('AC-7920.1: 다섯 줄 — 줄 제목(h3)이 차례대로, 줄 번호 1~5가 보인다', () => {
    render(<MethodCard {...cardProps()} />)
    const card = screen.getByRole('region', { name: TITLE })
    expect(within(card).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(ROW_TITLES.map((t, i) => `${i + 1}${t}`))
    // 줄마다 제목(번호 뺀 이름)으로 묶여 있다
    expect(ROW_TITLES.map((t) => rowOf(card, t).querySelector('h3')?.textContent)).toEqual(ROW_TITLES.map((t, i) => `${i + 1}${t}`))
  })

  it('AC-7920.1: 첫 줄 — 글 한 줄 + 묶음별 기관 표 여섯 줄(묶음 · 기관)', () => {
    render(<MethodCard {...cardProps()} />)
    const row = rowOf(screen.getByRole('region', { name: TITLE }), ROW_TITLES[0]!)
    expect(within(row).getByText(FIRST_TEXT)).toBeTruthy()
    const pairs = [...row.querySelectorAll('dl > div')].map((d) => [d.querySelector('dt')?.textContent, d.querySelector('dd')?.textContent])
    expect(pairs).toEqual(METHOD.rows[0]!.orgs.map((o) => [o.group, o.orgs]))
    expect(pairs.map(([g]) => g)).toEqual(ORG_GROUPS)
    expect(within(row).queryAllByRole('listitem')).toHaveLength(0)
  })

  it.each([1, 2, 3, 4])('AC-7920.1: %i번째 뒤 줄 — 줄마다 METHOD 글(bulletText), 머리 글이 있으면 굵게', (i) => {
    render(<MethodCard {...cardProps()} />)
    const items = bulletsOf(screen.getByRole('region', { name: TITLE }), i)
    expect(items.map((li) => li.textContent)).toEqual(expectedBullets(i, DEFAULT_WEIGHTS_LINE))
    expect(items.map((li) => li.querySelector('b')?.textContent ?? null)).toEqual(METHOD.rows[i]!.bullets.map((b) => b.lead))
  })

  it('AC-7920.1: 셋째 줄 무게 — 처음 무게면 화면 글 기본값 그대로 `…비용 10(처음 무게).`', () => {
    render(<MethodCard {...cardProps()} />)
    expect(bulletsOf(screen.getByRole('region', { name: TITLE }), 2)[0]!.textContent).toBe(DEFAULT_WEIGHTS_LINE)
  })

  it("AC-7920.1: 셋째 줄 무게 — 받은 지금 무게로 쓰고, 바꾼 무게에는 '(처음 무게)'를 붙이지 않는다", () => {
    render(<MethodCard {...cardProps({ weights: CHANGED })} />)
    const items = bulletsOf(screen.getByRole('region', { name: TITLE }), 2)
    expect(items[0]!.textContent).toBe(CHANGED_WEIGHTS_LINE)
    expect(items[0]!.querySelector('b')?.textContent).toBe('다섯 항목')
  })

  it.each([
    ['처음 무게·처음 과목', DEFAULT_SCORE_RULE.weights, '정형외과·신경외과·마취통증·재활'],
    ['바꾼 무게·과목 없음', CHANGED, '고른 과목 없음'],
  ] as const)('AC-7920.1: 채우지 않은 표시가 남지 않는다(%s)', (_name, weights, rivalShort) => {
    const { container } = render(<MethodCard {...cardProps({ weights, rivalShort })} />)
    expect(container.textContent).not.toMatch(/\{[^}]*\}|\[\[|\]\]/)
  })

  it('AC-7920.1: 다섯째 줄 첫 줄 아래 `예: {출처 줄}` — 누르면 근거와 출처의 그 줄(pop-age)로', () => {
    const props = cardProps()
    render(<MethodCard {...props} />)
    const link = screen.getByRole('link', { name: EXAMPLE_SOURCE })
    expect(link.getAttribute('href')).toBe('/location?tab=sources#src-pop-age')
    expect(bulletsOf(screen.getByRole('region', { name: TITLE }), 4)[0]!.contains(link)).toBe(true)
    expect(fireEvent.click(link)).toBe(false)
    expect(props.onOpenSource.mock.calls).toEqual([['pop-age']])
    expect(props.onOpenSources).not.toHaveBeenCalled()
  })

  it('AC-7920.1: 예시 출처 줄을 Ctrl·가운데 단추로 누르면 새 탭에 맡긴다(콜백 없음) · 콜백이 없으면 주소로 간다', () => {
    const props = cardProps()
    const { unmount } = render(<MethodCard {...props} />)
    expect(fireEvent.click(screen.getByRole('link', { name: EXAMPLE_SOURCE }), { ctrlKey: true })).toBe(true)
    expect(props.onOpenSource).not.toHaveBeenCalled()
    unmount()
    render(<MethodCard {...cardProps({ onOpenSource: undefined })} />)
    expect(fireEvent.click(screen.getByRole('link', { name: EXAMPLE_SOURCE }))).toBe(true)
  })

  it('AC-7920.1: 맨 아래 [근거와 출처 모두 보기] + 도움말 — 누르면 onOpenSources', () => {
    const props = cardProps()
    render(<MethodCard {...props} />)
    const link = screen.getByRole('link', { name: SOURCES_BUTTON })
    expect(link.getAttribute('href')).toBe('/location?tab=sources')
    expect(screen.getByText(SOURCES_HELP)).toBeTruthy()
    expect(fireEvent.click(link)).toBe(false)
    expect(props.onOpenSources).toHaveBeenCalledTimes(1)
    expect(props.onOpenSource).not.toHaveBeenCalled()
  })

  it('AC-7920.1: 줄 목록에 목록 점이 없다(list-none, 시안 .mrow ul) — 한 장과 판 모두', () => {
    render(<MethodCard {...cardProps()} />)
    const lists = [...screen.getByRole('region', { name: TITLE }).querySelectorAll('ul')]
    expect(lists).toHaveLength(4)
    for (const ul of lists) expect(ul.className.split(/\s+/)).toContain('list-none')
    cleanup()
    render(<MethodPanel open onClose={vi.fn()} {...cardProps()} />)
    const inPanel = [...screen.getByRole('dialog').querySelectorAll('ul')]
    expect(inPanel).toHaveLength(4)
    for (const ul of inPanel) expect(ul.className.split(/\s+/)).toContain('list-none')
  })

  it('AC-7920.1: 한 장에는 판 아래 글·[닫기]가 없다(판에만)', () => {
    render(<MethodCard {...cardProps()} />)
    expect(screen.queryByText(PANEL_NOTE)).toBeNull()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('AC-7920.1: 화면 글에 영어 낱말이 없다(허용 목록 밖)', () => {
    const { container } = render(<MethodCard {...cardProps({ weights: CHANGED })} />)
    expect(latinWords(container)).toEqual([])
  })

  it('AC-7920.1: PC 모양 하나 — 화면 폭 따라 바뀌는 클래스가 없다', () => {
    const { container } = render(<MethodCard {...cardProps()} />)
    expect(widthClasses(container)).toEqual([])
  })
})

describe('AC-7920.1: [분석 방법] 오른쪽 판(MethodPanel)', () => {
  const renderPanel = (over: Partial<MethodCardProps> = {}, open = true) => {
    const calls: string[] = []
    const props = cardProps(over)
    props.onOpenSources.mockImplementation(() => void calls.push('sources'))
    props.onOpenSource.mockImplementation((id) => void calls.push(`source:${id}`))
    const onClose = vi.fn<() => void>(() => void calls.push('close'))
    const view = render(<MethodPanel open={open} onClose={onClose} {...props} />)
    return { ...view, props, onClose, calls }
  }
  const dialog = () => screen.getByRole('dialog', { name: METHOD.button })

  it('AC-7920.1: 닫혀 있으면(open=false) 아무것도 그리지 않는다', () => {
    const { container } = renderPanel({}, false)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(container.textContent).toBe('')
  })

  it('AC-7920.1: 열면 오른쪽 판 760px(모달) — 머리 제목 하나·머리 한 줄·다섯 줄·맨 아래 단추·판 아래 글', () => {
    renderPanel()
    const d = dialog()
    expect(d.getAttribute('aria-modal')).toBe('true')
    expect(d.className.split(/\s+/)).toEqual(expect.arrayContaining(['fixed', 'right-0', 'top-0', 'bottom-0', 'w-190']))
    expect(within(d).getAllByRole('heading', { name: TITLE })).toHaveLength(1)
    expect(within(d).getByRole('heading', { level: 2, name: TITLE })).toBeTruthy()
    expect(within(d).getByText(LEAD)).toBeTruthy()
    expect(within(d).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(ROW_TITLES.map((t, i) => `${i + 1}${t}`))
    expect(within(d).getByRole('link', { name: SOURCES_BUTTON })).toBeTruthy()
    expect(within(d).getByText(SOURCES_HELP)).toBeTruthy()
    expect(within(d).getByText(PANEL_NOTE)).toBeTruthy()
    expect(METHOD.panelNote).toBe(PANEL_NOTE)
  })

  it('AC-7920.1: 판 안 글은 처음 안내 한 장과 같다(지금 무게 그대로)', () => {
    renderPanel({ weights: CHANGED })
    const d = dialog()
    for (const i of [1, 2, 3, 4]) {
      expect(within(rowOf(d, ROW_TITLES[i]!)).getAllByRole('listitem').map((li) => li.textContent)).toEqual(expectedBullets(i, CHANGED_WEIGHTS_LINE))
    }
    const pairs = [...rowOf(d, ROW_TITLES[0]!).querySelectorAll('dl > div')].map((x) => x.querySelector('dt')?.textContent)
    expect(pairs).toEqual(ORG_GROUPS)
  })

  it('AC-7920.1: [닫기] 둘(머리 ×·판 아래) — 누르면 onClose', () => {
    const { onClose } = renderPanel()
    const closes = within(dialog()).getAllByRole('button', { name: '닫기' })
    expect(closes).toHaveLength(2)
    expect(closes[1]!.textContent).toBe('닫기')
    fireEvent.click(closes[0]!)
    fireEvent.click(closes[1]!)
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('AC-7920.1: Esc로 닫는다(다른 글쇠는 아님) · 닫힌 판은 Esc를 듣지 않는다', () => {
    const { onClose, rerender, props } = renderPanel()
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    rerender(<MethodPanel open={false} onClose={onClose} {...props} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('AC-7920.1: 판 밖 가림막을 누르면 닫는다', () => {
    const { onClose } = renderPanel()
    fireEvent.click(screen.getByTestId('method-scrim'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('AC-7920.1: [근거와 출처 모두 보기] = 판을 닫고 근거와 출처로(onClose → onOpenSources)', () => {
    const { calls } = renderPanel()
    expect(fireEvent.click(within(dialog()).getByRole('link', { name: SOURCES_BUTTON }))).toBe(false)
    expect(calls).toEqual(['close', 'sources'])
  })

  it('AC-7920.1: 판 안 예시 출처 줄 = 판을 닫고 그 출처 줄로(onClose → onOpenSource)', () => {
    const { calls } = renderPanel()
    expect(fireEvent.click(within(dialog()).getByRole('link', { name: EXAMPLE_SOURCE }))).toBe(false)
    expect(calls).toEqual(['close', 'source:pop-age'])
  })

  it('AC-7920.1: 열면 판 안으로 초점이 가고, 닫으면 연 단추로 돌아간다', () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    const { rerender, onClose, props } = renderPanel()
    expect(dialog().contains(document.activeElement)).toBe(true)
    rerender(<MethodPanel open={false} onClose={onClose} {...props} />)
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })

  it('AC-7920.1: 화면 글에 영어 낱말이 없다 · PC 모양 하나(폭 따라 바뀌는 클래스 없음)', () => {
    const { baseElement } = renderPanel({ weights: CHANGED })
    expect(latinWords(baseElement)).toEqual([])
    expect(widthClasses(baseElement)).toEqual([])
  })
})
