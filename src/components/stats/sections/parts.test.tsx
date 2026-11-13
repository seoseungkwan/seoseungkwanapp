// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { createRef, useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { Section, SectionAnchor, SectionPanelContext, TOC_SCROLL } from './parts'

// 칸 틀 Section의 두 모드 (stats-pc-ux TASK-1, design.md 'sections/parts.tsx — Section 두 모드'). 칸 이름·글은 시험 안에서 지은 가짜다

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

  it('AC-4002.6: TOC_SCROLL은 넓은 화면과 휴대폰(max-md:) 두 scroll-margin 값이다', () => {
    const tokens = tocTokens()
    expect(tokens).toHaveLength(2)
    expect(tokens[0]).toMatch(/^scroll-mt-/)
    expect(tokens[1]).toMatch(/^max-md:scroll-mt-/)
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
