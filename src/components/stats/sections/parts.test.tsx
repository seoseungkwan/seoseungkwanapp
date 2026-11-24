// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { createRef, useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { pickRange } from '@/components/stats/periodPick'
import { statsRange } from '@/components/stats/view'
import { nestedBoxes } from '@/testing/boxes'
import { cardRangeText, Section, SectionAnchor, SectionPanelContext, StatsCard, TOC_SCROLL } from './parts'

// 칸 틀 Section의 두 모드 (stats-pc-ux TASK-1, design.md 'sections/parts.tsx — Section 두 모드')와
// 큰 카드 StatsCard · 카드 안 칸 (first90 TASK-6, design.md 5-5). 칸 이름·글은 시험 안에서 지은 가짜다

afterEach(cleanup)

const classesOf = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)
const tocTokens = () => TOC_SCROLL.split(/\s+/).filter(Boolean)

// 탭 칸이 줄 머리 줄 자리(slot)를 흉내 낸다: 문서에 붙은 빈 칸
function Slotted({ active, children }: { active: boolean; children: React.ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  return (
    <div>
      <div data-testid="slot" ref={setSlot} />
      <div data-testid="panel">
        <SectionPanelContext.Provider value={{ active, slot }}>{children}</SectionPanelContext.Provider>
      </div>
    </div>
  )
}

describe('AC-4002.6: 보통 Section은 마크업이 지금 그대로다', () => {
  it('AC-4002.6·AC-4006.1: 목차 자리·탭 패널이 아니면 section·h2·설명·단추 마크업이 지금과 글자까지 같다(id 없음)', () => {
    const { container } = render(
      <Section title="가짜 칸" desc="가짜 설명" action={<button type="button">가짜 단추</button>} className="col-span-6">
        <p>내용</p>
      </Section>,
    )
    const h2 = screen.getByRole('heading', { level: 2, name: '가짜 칸' })
    const html = container.innerHTML.split(h2.id).join('ID')
    expect(html).toBe(
      '<section aria-labelledby="ID" class="mt-12 min-w-0 border-t border-line-strong pt-5 max-md:mt-8 max-md:pt-4 col-span-6">' +
        '<div class="flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1">' +
        '<h2 id="ID" class="text-title font-semibold text-ink">가짜 칸</h2>' +
        '<span class="text-small text-muted">가짜 설명</span>' +
        '<span class="ml-auto"><button type="button">가짜 단추</button></span>' +
        '</div><p>내용</p></section>',
    )
  })
})

describe('AC-4002.6: 목차 자리(SectionAnchor)', () => {
  it('AC-4002.6: 감싼 쪽이 준 id가 section에 붙고 목차 띠에 가리지 않는 scroll-margin(TOC_SCROLL)이 붙는다', () => {
    const { container } = render(
      <SectionAnchor id="stats-fake">
        <Section title="가짜 칸" className="col-span-12">
          <p>내용</p>
        </Section>
      </SectionAnchor>,
    )
    const section = container.querySelector('section')!
    expect(section.id).toBe('stats-fake')
    expect(classesOf(section)).toEqual(expect.arrayContaining([...tocTokens(), 'col-span-12', 'border-t']))
    expect(section.getAttribute('aria-labelledby')).toBe(screen.getByRole('heading', { level: 2 }).id)
  })

  it('AC-4002.6·AC-8008.1: TOC_SCROLL은 넓은 화면·휴대폰(max-md:)·보는 중 띠(group-has-[[data-view-band]]/app:) 세 scroll-margin 값이다', () => {
    const tokens = tocTokens()
    expect(tokens).toHaveLength(3)
    expect(tokens[0]).toMatch(/^scroll-mt-/)
    expect(tokens[1]).toMatch(/^max-md:scroll-mt-/)
    expect(tokens[2]).toMatch(/^group-has-\[\[data-view-band\]\]\/app:scroll-mt-/)
  })

  it('AC-4002.6·AC-4411.2: 카드는 바로가기 띠 아래 9px에 선다 — 머리줄 102 + 띠 53(위아래 8 + 링크 36 + 선 1) + 9 = 164px, 휴대폰 94 + 57(6 + 44 + 6 + 1) + 9 = 160px(시안 .s-card scroll-margin 164)', () => {
    expect(tocTokens().slice(0, 2)).toEqual(['scroll-mt-41', 'max-md:scroll-mt-40'])
  })

  it('AC-8008.1: 보는 중 띠(45px)가 있으면 바로가기 띠가 147px에 붙는 만큼(StatsToc top-36.75) 카드도 45px 더 내려 164 + 45 = 209px에 선다', () => {
    expect(tocTokens()[2]).toBe('group-has-[[data-view-band]]/app:scroll-mt-52.25')
    expect(52.25 * 4).toBe(41 * 4 + 45)
  })

  it('AC-4002.6: id는 안쪽 Section에 넘기지 않는다(겹친 id 없음). 감싸지 않은 Section에는 id·scroll-margin이 없다', () => {
    const { container } = render(
      <>
        <SectionAnchor id="stats-fake">
          <Section title="바깥 칸">
            <Section title="안쪽 칸">
              <p>안 내용</p>
            </Section>
          </Section>
        </SectionAnchor>
        <Section title="따로 칸">
          <p>따로 내용</p>
        </Section>
      </>,
    )
    const sections = [...container.querySelectorAll('section')]
    expect(sections).toHaveLength(3)
    expect(container.querySelectorAll('#stats-fake')).toHaveLength(1)
    expect(sections[0]!.id).toBe('stats-fake')
    for (const inner of sections.slice(1)) {
      expect(inner.hasAttribute('id')).toBe(false)
      expect(classesOf(inner)).not.toEqual(expect.arrayContaining(tocTokens()))
    }
  })

  it('AC-4002.6·AC-4003.6: 코드로 초점을 받는 제목(headingRef)도 목차 띠 밑에 숨지 않게 TOC_SCROLL을 갖는다', () => {
    const ref = createRef<HTMLHeadingElement>()
    render(
      <Section title="가짜 칸" headingRef={ref}>
        <p>내용</p>
      </Section>,
    )
    const h2 = screen.getByRole('heading', { level: 2 })
    expect(ref.current).toBe(h2)
    expect(classesOf(h2)).toEqual(expect.arrayContaining(tocTokens()))
    expect(classesOf(h2)).not.toContain('scroll-mt-25.5')
  })
})

describe('AC-4003.2·AC-4003.4: 탭 패널 모드(SectionPanelContext)', () => {
  it('AC-4003.2: 탭 안에서는 section·h2를 그리지 않고 내용만 그린다(className도 쓰지 않는다)', () => {
    render(
      <Slotted active>
        <Section title="가짜 탭 칸" className="col-span-12 lg:col-span-6">
          <p>탭 내용</p>
        </Section>
      </Slotted>,
    )
    const panel = screen.getByTestId('panel')
    expect(panel.querySelector('section, h2, h3')).toBeNull()
    expect(panel.querySelector('.col-span-12')).toBeNull()
    expect(panel.textContent).toBe('탭 내용')
    expect(screen.queryByText('가짜 탭 칸')).toBeNull()
  })

  it('AC-4003.4: 고른 탭이면 설명·오른쪽 단추를 머리 줄 자리(slot)에 지금과 같은 모양으로 한 번 그린다', () => {
    render(
      <Slotted active>
        <Section title="가짜 탭 칸" desc="가짜 설명" action={<button type="button">가짜 단추</button>}>
          <p>탭 내용</p>
        </Section>
      </Slotted>,
    )
    const slot = screen.getByTestId('slot')
    expect(slot.innerHTML).toBe('<span class="text-small text-muted">가짜 설명</span><span class="ml-auto"><button type="button">가짜 단추</button></span>')
    expect(screen.getAllByText('가짜 설명')).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: '가짜 단추' })).toHaveLength(1)
    expect(screen.getByTestId('panel').textContent).toBe('탭 내용')
  })

  it('AC-4003.4: 고르지 않은 탭이면 설명·단추를 어디에도 그리지 않는다(내용은 그린다)', () => {
    render(
      <Slotted active={false}>
        <Section title="가짜 탭 칸" desc="가짜 설명" action={<button type="button">가짜 단추</button>}>
          <p>탭 내용</p>
        </Section>
      </Slotted>,
    )
    expect(screen.getByTestId('slot').innerHTML).toBe('')
    expect(screen.queryByText('가짜 설명')).toBeNull()
    expect(screen.queryByRole('button', { name: '가짜 단추' })).toBeNull()
    expect(screen.getByTestId('panel').textContent).toBe('탭 내용')
  })

  it('AC-4003.4: 설명·단추가 없으면 자리에 아무것도 넣지 않는다', () => {
    render(
      <Slotted active>
        <Section title="가짜 탭 칸">
          <p>탭 내용</p>
        </Section>
      </Slotted>,
    )
    expect(screen.getByTestId('slot').innerHTML).toBe('')
  })

  it('AC-4003.2: 자리(slot)가 아직 없어도(첫 그림) 던지지 않고 내용을 그린다', () => {
    render(
      <SectionPanelContext.Provider value={{ active: true, slot: null }}>
        <Section title="가짜 탭 칸" desc="가짜 설명" action={<button type="button">가짜 단추</button>}>
          <p>탭 내용</p>
        </Section>
      </SectionPanelContext.Provider>,
    )
    expect(screen.getByText('탭 내용')).toBeTruthy()
    expect(screen.queryByText('가짜 설명')).toBeNull()
  })

  it('AC-4003.6: headingRef를 주면 패널 맨 위에 h3(text-subtitle, tabIndex -1, TOC_SCROLL)로 제목을 그리고 ref가 그 h3다', () => {
    const ref = createRef<HTMLHeadingElement>()
    render(
      <Slotted active>
        <Section title="가짜 탭 칸 · 고치기" headingRef={ref}>
          <p>고치는 내용</p>
        </Section>
      </Slotted>,
    )
    const panel = screen.getByTestId('panel')
    expect(panel.querySelector('h2, section')).toBeNull()
    const h3 = screen.getByRole('heading', { level: 3, name: '가짜 탭 칸 · 고치기' })
    expect(panel.firstElementChild).toBe(h3)
    expect(ref.current).toBe(h3)
    expect(h3.tabIndex).toBe(-1)
    expect(classesOf(h3)).toEqual(expect.arrayContaining(['text-subtitle', 'font-semibold', 'text-ink', ...tocTokens()]))
    ref.current!.focus()
    expect(document.activeElement).toBe(h3)
  })

  it('AC-4002.6: 탭 안 칸에는 목차 id가 붙지 않는다', () => {
    const { container } = render(
      <SectionAnchor id="stats-fake">
        <Slotted active>
          <Section title="가짜 탭 칸">
            <p>탭 내용</p>
          </Section>
        </Slotted>
      </SectionAnchor>,
    )
    expect(container.querySelector('#stats-fake')).toBeNull()
  })
})

// ── 큰 카드 (first90 REQ-4411 AC-4411.3, design.md 5-5, 시안 docs/mockups/first90/redesign.html .s-card) ─────────
describe('AC-4411.3: 큰 카드 StatsCard', () => {
  it('AC-4411.3: section(rounded-st bg-surface shadow-st-card, bg-white 없음)에 h2 · 옆 글 · 오른쪽 자리가 차례로 있고, id를 주면 그 id와 바로가기 scroll-margin(TOC_SCROLL)이 붙는다', () => {
    render(
      <StatsCard id="stats-fake" title="가짜 카드" desc="가짜 카드 글" action={<button type="button">가짜 카드 단추</button>}>
        <p>카드 내용</p>
      </StatsCard>,
    )
    const section = document.getElementById('stats-fake')!
    const h2 = screen.getByRole('heading', { level: 2, name: '가짜 카드' })
    expect(section.tagName).toBe('SECTION')
    expect(section.getAttribute('aria-labelledby')).toBe(h2.id)
    expect(classesOf(section)).toEqual(expect.arrayContaining(['rounded-st', 'bg-surface', 'shadow-st-card', ...tocTokens()]))
    expect(classesOf(section)).not.toContain('bg-white')
    expect(classesOf(h2)).toEqual(expect.arrayContaining(['text-st-18', 'font-semibold', 'text-st-ink']))
    const head = h2.parentElement!
    expect(head.firstElementChild).toBe(h2)
    expect(classesOf(within(head).getByText('가짜 카드 글'))).toEqual(expect.arrayContaining(['text-small', 'text-st-muted']))
    expect(classesOf(within(head).getByRole('button', { name: '가짜 카드 단추' }).parentElement!)).toContain('ml-auto')
    expect(section.textContent).toBe('가짜 카드가짜 카드 글가짜 카드 단추카드 내용')
  })

  it('AC-4411.3: id를 주지 않으면(기다리는 자리) id·scroll-margin이 없고, 옆 글·단추를 주지 않으면 머리 줄은 h2뿐이다', () => {
    const { container } = render(
      <StatsCard title="가짜 카드">
        <p>카드 내용</p>
      </StatsCard>,
    )
    const section = container.querySelector('section')!
    expect(section.hasAttribute('id')).toBe(false)
    expect(classesOf(section)).not.toEqual(expect.arrayContaining(tocTokens()))
    expect(section.textContent).toBe('가짜 카드카드 내용')
  })

  it('AC-4411.3: 카드는 네 변 테두리 상자가 아니다 — 안에 테두리 칸이 있어도 상자 안 상자가 없다', () => {
    const { container } = render(
      <StatsCard title="가짜 카드">
        <Section title="가짜 작은 칸">
          <div className="border border-line">안 상자</div>
        </Section>
      </StatsCard>,
    )
    expect(nestedBoxes(container)).toEqual([])
  })
})

describe('AC-4411.3: 카드 안 Section은 h3 작은 칸이고 칸 사이는 얇은 선뿐이다', () => {
  function Card() {
    return (
      <StatsCard id="stats-fake" title="가짜 카드">
        <Section title="첫 작은 칸" desc="첫 칸 글" action={<button type="button">첫 칸 단추</button>} className="min-[1200px]:basis-3/10">
          <p>첫 내용</p>
        </Section>
        <Section title="둘째 작은 칸">
          <p>둘째 내용</p>
        </Section>
      </StatsCard>
    )
  }

  it('AC-4411.3: 카드 안 칸은 section + h3(text-st-15)이고 옆 글·단추는 h3 옆 머리 줄이다. 카드 안 h2는 카드 제목 하나뿐이다', () => {
    render(<Card />)
    const card = document.getElementById('stats-fake')!
    expect(within(card).getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['가짜 카드'])
    const h3 = within(card).getByRole('heading', { level: 3, name: '첫 작은 칸' })
    expect(classesOf(h3)).toEqual(expect.arrayContaining(['text-st-15', 'font-semibold', 'text-st-ink']))
    const sub = h3.closest('section')!
    expect(sub).not.toBe(card)
    expect(sub.getAttribute('aria-labelledby')).toBe(h3.id)
    expect(classesOf(sub)).toEqual(expect.arrayContaining(['min-w-0', 'min-[1200px]:basis-3/10']))
    expect(sub.hasAttribute('id')).toBe(false)
    const head = h3.parentElement!
    expect(classesOf(within(head).getByText('첫 칸 글'))).toEqual(expect.arrayContaining(['text-small', 'text-st-muted']))
    expect(classesOf(within(head).getByRole('button', { name: '첫 칸 단추' }).parentElement!)).toContain('ml-auto')
    expect(within(card).getByRole('heading', { level: 3, name: '둘째 작은 칸' })).toBeTruthy()
  })

  it('AC-4411.3: 칸 사이는 얇은 선(border-st-line) 하나이고 첫 칸 위에는 선이 없다. 칸 자신은 테두리를 갖지 않는다', () => {
    render(<Card />)
    const card = document.getElementById('stats-fake')!
    const subs = within(card)
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.closest('section')!)
    const body = subs[0]!.parentElement!
    expect(subs[1]!.parentElement).toBe(body)
    expect(body.firstElementChild).toBe(subs[0])
    expect(classesOf(body)).toEqual(expect.arrayContaining(['[&>*+*]:border-t', '[&>*+*]:border-st-line']))
    for (const sub of subs) expect(classesOf(sub).filter((t) => t.startsWith('border'))).toEqual([])
  })

  it('AC-4411.3: 카드 밖 Section은 지금처럼 h2이고, 카드를 감싼 목차 자리 id는 카드 안 칸에 붙지 않는다', () => {
    const { container } = render(
      <>
        <Section title="카드 밖 칸">
          <p>밖 내용</p>
        </Section>
        <SectionAnchor id="stats-outer">
          <StatsCard title="가짜 카드">
            <Section title="카드 안 칸">
              <p>안 내용</p>
            </Section>
          </StatsCard>
        </SectionAnchor>
      </>,
    )
    expect(screen.getByRole('heading', { level: 2, name: '카드 밖 칸' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3, name: '카드 안 칸' })).toBeTruthy()
    expect(container.querySelector('#stats-outer')).toBeNull()
  })

  it('AC-4411.3·AC-4003.6: 카드 안 칸에 headingRef를 주면 그 h3에 ref · tabIndex -1 · TOC_SCROLL이 붙는다', () => {
    const ref = createRef<HTMLHeadingElement>()
    render(
      <StatsCard title="가짜 카드">
        <Section title="가짜 작은 칸" headingRef={ref}>
          <p>내용</p>
        </Section>
      </StatsCard>,
    )
    const h3 = screen.getByRole('heading', { level: 3, name: '가짜 작은 칸' })
    expect(ref.current).toBe(h3)
    expect(h3.tabIndex).toBe(-1)
    expect(classesOf(h3)).toEqual(expect.arrayContaining(tocTokens()))
  })

  it('AC-4411.3·AC-4003.2: 카드 안 탭 패널은 지금처럼 탭 패널 모드다(section·제목 없이 내용만, 설명은 탭 칸 자리)', () => {
    render(
      <StatsCard title="가짜 카드">
        <Slotted active>
          <Section title="가짜 탭 칸" desc="가짜 탭 설명">
            <p>탭 내용</p>
          </Section>
        </Slotted>
      </StatsCard>,
    )
    expect(screen.getByTestId('panel').querySelector('section, h2, h3')).toBeNull()
    expect(screen.getByTestId('slot').textContent).toBe('가짜 탭 설명')
  })
})

describe('AC-4411.3: 칸 하나 · 같은 제목이면 칸 머리 없이 카드 머리를 쓴다(매출·처방·보고)', () => {
  function SameTitle({ title, cardDesc }: { title: string; cardDesc?: string }) {
    return (
      <StatsCard id="stats-fake" title="같은 이름" desc={cardDesc}>
        <Section title={title} desc="칸 글" action={<button type="button">칸 단추</button>} className="col-span-12">
          <p>칸 내용</p>
        </Section>
      </StatsCard>
    )
  }

  it('AC-4411.3: 제목이 두 번 나오지 않는다 — h3·칸 section 없이 칸 옆 글·단추를 카드 머리 줄에 한 번 그리고 내용은 카드 안이다', () => {
    render(<SameTitle title="같은 이름" />)
    const card = document.getElementById('stats-fake')!
    expect(screen.getAllByText('같은 이름')).toHaveLength(1)
    expect(within(card).getAllByRole('heading').map((h) => `${h.tagName}:${h.textContent}`)).toEqual(['H2:같은 이름'])
    expect(card.querySelectorAll('section')).toHaveLength(0)
    const head = screen.getByRole('heading', { level: 2, name: '같은 이름' }).parentElement!
    expect(within(head).getByText('칸 글')).toBeTruthy()
    expect(classesOf(within(head).getByRole('button', { name: '칸 단추' }).parentElement!)).toContain('ml-auto')
    expect(screen.getAllByText('칸 글')).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: '칸 단추' })).toHaveLength(1)
    expect(card.textContent).toBe('같은 이름칸 글칸 단추칸 내용')
  })

  it('AC-4411.3: 카드가 옆 글을 가졌으면 카드 글만 쓰고(칸 글은 그리지 않는다) 칸 단추는 카드 머리 줄 오른쪽이다', () => {
    render(<SameTitle title="같은 이름" cardDesc="카드 글" />)
    const head = screen.getByRole('heading', { level: 2, name: '같은 이름' }).parentElement!
    expect(within(head).getByText('카드 글')).toBeTruthy()
    expect(screen.queryByText('칸 글')).toBeNull()
    expect(classesOf(within(head).getByRole('button', { name: '칸 단추' }).parentElement!)).toContain('ml-auto')
    expect(document.getElementById('stats-fake')!.textContent).toBe('같은 이름카드 글칸 단추칸 내용')
  })

  it('AC-4411.3: 같은 제목 칸의 내용은 카드 안 한 덩어리다(칸 사이 선이 그 내용 사이에 들지 않는다)', () => {
    render(
      <StatsCard id="stats-fake" title="같은 이름">
        <Section title="같은 이름">
          <p>첫 줄</p>
          <p>둘째 줄</p>
        </Section>
      </StatsCard>,
    )
    const first = screen.getByText('첫 줄')
    const block = first.parentElement!
    expect(block.contains(screen.getByText('둘째 줄'))).toBe(true)
    const body = block.parentElement!
    expect(classesOf(body)).toContain('[&>*+*]:border-t')
    expect(body.children).toHaveLength(1)
  })

  it('AC-4411.3: 제목이 다르면 같은 제목 규칙이 아니다 — h3 작은 칸이고 칸 글은 카드 머리에 가지 않는다', () => {
    render(<SameTitle title="다른 이름" />)
    expect(screen.getByRole('heading', { level: 3, name: '다른 이름' })).toBeTruthy()
    const head = screen.getByRole('heading', { level: 2, name: '같은 이름' }).parentElement!
    expect(within(head).queryByText('칸 글')).toBeNull()
  })
})

describe('AC-4411.3: 환자 카드 옆 글 cardRangeText', () => {
  const TODAY = '2026-11-14'
  const YESTERDAY = '2026-11-13'

  it('AC-4411.3: 최근 30일은 "{기간 이름} · {시작 월 일} – {끝 월 일}"이다(시안 날짜 모양)', () => {
    expect(cardRangeText(statsRange(TODAY, '30d'), YESTERDAY)).toBe('최근 30일 · 10월 15일 – 11월 13일')
  })

  it('AC-4411.3: 오늘 진료가 끝났어도 빠른 기간의 끝(어제)을 넘지 않는다', () => {
    expect(cardRangeText(statsRange(TODAY, '30d'), TODAY)).toBe('최근 30일 · 10월 15일 – 11월 13일')
  })

  it('AC-4411.3: 최근 12개월은 이번 달 말일 대신 마지막 끝난 날에서 끊고, 해가 달라 양 끝에 해를 붙인다', () => {
    expect(cardRangeText(statsRange(TODAY, '12m'), YESTERDAY)).toBe('최근 12개월 · 2025년 12월 1일 – 2026년 11월 13일')
  })

  it('AC-4411.3: 고른 달은 "그 달 이름 · 1일 – 말일"이고, 끝나지 않은 달은 마지막 끝난 날까지다', () => {
    expect(cardRangeText(pickRange(TODAY, { kind: 'month', unit: 'day', month: '2026-10' }, false), YESTERDAY)).toBe('2026년 10월 · 10월 1일 – 10월 31일')
    expect(cardRangeText(pickRange(TODAY, { kind: 'month', unit: 'day', month: '2026-11' }, true), TODAY)).toBe('2026년 11월 · 11월 1일 – 11월 14일')
  })

  it('AC-4411.3: 해를 넘는 고른 기간은 양 끝에 해를 붙이고, 한 해 안의 해 고르기는 붙이지 않는다', () => {
    expect(cardRangeText(pickRange(TODAY, { kind: 'custom', unit: 'month', from: '2025-11-15', to: '2026-11-13' }, false), YESTERDAY)).toBe(
      '직접 고른 기간 · 2025년 11월 15일 – 2026년 11월 13일',
    )
    expect(cardRangeText(pickRange(TODAY, { kind: 'year', year: '2025' }, false), YESTERDAY)).toBe('2025년 · 1월 1일 – 12월 31일')
  })
})
