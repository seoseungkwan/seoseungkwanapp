// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { Section, SectionAnchor, TOC_SCROLL } from './parts'
import { RxSection, type RxTab } from './RxSection'

// 처방 탭 칸 (stats-pc-ux TASK-1, design.md 'sections/RxSection.tsx', 시안 notes.md §4). 탭 안 칸은 시험 안의 작은 가짜 칸이다(이름·글은 지어낸 값)

afterEach(cleanup)

const classesOf = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)

// 센 수(React 상태)를 가진 가짜 칸: 탭을 옮겼다 와도 남는지 본다
function CounterTab({ name, desc, action }: { name: string; desc?: string; action?: ReactNode }) {
  const [count, setCount] = useState(0)
  return (
    <Section title={name} desc={desc} action={action}>
      <p>{name} 내용</p>
      <button type="button" onClick={() => setCount(count + 1)}>
        {name} 하나 더
      </button>
      <p>
        {name} 센 수 {count}
      </p>
    </Section>
  )
}

// 처방별 추세 칸의 고치기 흐름을 흉내 낸 가짜 칸: 열면 제목(headingRef)에, 닫으면 [묶음 고치기](action, editRef)에 초점
function EditableTab() {
  const [editing, setEditing] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const editRef = useRef<HTMLButtonElement>(null)
  const focusNext = useRef<'heading' | 'edit' | null>(null)
  useEffect(() => {
    const target = focusNext.current
    if (target === null) return
    focusNext.current = null
    ;(target === 'heading' ? headingRef : editRef).current?.focus()
  })
  if (editing) {
    return (
      <Section title="가짜 묶음 · 묶음 고치기" headingRef={headingRef}>
        <button
          type="button"
          onClick={() => {
            focusNext.current = 'edit'
            setEditing(false)
          }}
        >
          그만두기
        </button>
      </Section>
    )
  }
  const edit = (
    <button
      type="button"
      ref={editRef}
      onClick={() => {
        focusNext.current = 'heading'
        setEditing(true)
      }}
    >
      묶음 고치기
    </button>
  )
  return (
    <Section title="가짜 묶음" desc="첫째 탭 설명" action={edit}>
      <p>묶음 보기</p>
    </Section>
  )
}

const TABS: RxTab[] = [
  { name: '묶음별 추세', panel: <CounterTab name="첫째" desc="첫째 탭 설명" action={<button type="button">첫째 단추</button>} /> },
  { name: '처방별 신환·재진', panel: <CounterTab name="둘째" desc="둘째 탭 설명" /> },
  { name: '처방 골라 보기', panel: <CounterTab name="셋째" /> },
]

const draw = (tabs: readonly RxTab[] = TABS, className?: string) => render(<RxSection tabs={tabs} className={className} />)
const tabs = () => screen.getAllByRole('tab')
const tabNamed = (name: string) => screen.getByRole('tab', { name })
const panelOf = (tab: HTMLElement) => document.getElementById(tab.getAttribute('aria-controls') ?? '')!
const head = () => screen.getByRole('heading', { level: 2, name: '처방' }).parentElement!

describe('AC-4003.2: 처방 칸 — 제목 · tablist · tab · tabpanel', () => {
  it('AC-4003.2: section의 h2는 `처방` 하나이고 className(칸 폭)은 section에 붙는다', () => {
    const { container } = draw(TABS, 'col-span-12')
    const section = container.querySelector('section')!
    expect(section.getAttribute('aria-labelledby')).toBe(screen.getByRole('heading', { level: 2 }).id)
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['처방'])
    expect(container.querySelectorAll('h2')).toHaveLength(1)
    expect(classesOf(section)).toEqual(expect.arrayContaining(['col-span-12', 'border-t', 'border-line-strong']))
  })

  it('AC-4003.2: 제목 아래 tablist(aria-label="처방 보기")에 탭 셋이 이 차례로 있고, 처음은 첫 탭이 aria-selected="true"·tabIndex 0(나머지 -1)이다', () => {
    draw()
    const list = screen.getByRole('tablist', { name: '처방 보기' })
    expect(within(list).getAllByRole('tab').map((t) => t.textContent)).toEqual(['묶음별 추세', '처방별 신환·재진', '처방 골라 보기'])
    expect(tabs().map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false'])
    expect(tabs().map((t) => t.tabIndex)).toEqual([0, -1, -1])
    expect(tabs().every((t) => t.getAttribute('type') === 'button')).toBe(true)
    // 머리 줄 다음이 탭 줄이다
    expect(head().nextElementSibling).toBe(list)
  })

  it('AC-4003.2: 탭마다 tabpanel(aria-labelledby = 탭)이 있고 탭의 aria-controls가 그 패널이다. 고르지 않은 패널은 hidden이다', () => {
    const { container } = draw()
    const panels = [...container.querySelectorAll('[role="tabpanel"]')] as HTMLElement[]
    expect(panels).toHaveLength(3)
    tabs().forEach((tab, i) => {
      expect(panelOf(tab)).toBe(panels[i])
      expect(panels[i]!.getAttribute('aria-labelledby')).toBe(tab.id)
    })
    expect(panels.map((p) => p.hidden)).toEqual([false, true, true])
    expect(screen.getAllByRole('tabpanel')).toEqual([panels[0]])
  })

  it('AC-4003.2: 고른 탭은 ink 600 + 2px accent 밑줄 막대, 나머지는 ink-2 500. 휴대폰 44px, 탭 줄은 그 안에서만 옆으로 밀린다(그림자 없음)', () => {
    draw()
    const [on, off] = tabs()
    expect(classesOf(on!)).toEqual(expect.arrayContaining(['font-semibold', 'text-ink', 'after:h-0.5', 'after:bg-accent', 'max-md:h-11']))
    expect(classesOf(off!)).toEqual(expect.arrayContaining(['font-medium', 'text-ink-2', 'max-md:h-11']))
    expect(classesOf(off!)).not.toContain('after:bg-accent')
    const list = screen.getByRole('tablist')
    expect(classesOf(list)).toEqual(expect.arrayContaining(['flex', 'overflow-x-auto', 'border-b', 'border-line']))
    for (const el of [list, on!, off!]) expect(classesOf(el).some((c) => /(?:^|:)shadow/.test(c))).toBe(false)
  })
})

describe('AC-4003.3: 탭 고르기 — 누름 · → ← Home End', () => {
  it('AC-4003.3: 탭을 누르면 그 탭이 골라지고 그 패널만 보인다', () => {
    draw()
    fireEvent.click(tabNamed('처방 골라 보기'))
    expect(tabs().map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'false', 'true'])
    expect(tabs().map((t) => t.tabIndex)).toEqual([-1, -1, 0])
    expect(tabs().map((t) => panelOf(t).hidden)).toEqual([true, true, false])
    expect(within(screen.getByRole('tabpanel')).getByText('셋째 내용')).toBeTruthy()
  })

  it('AC-4003.3: →는 다음 탭을 고르고 초점을 옮기며, 끝에서는 처음으로 돈다', () => {
    draw()
    const [first, second, third] = tabs()
    first!.focus()
    fireEvent.keyDown(first!, { key: 'ArrowRight' })
    expect(second!.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(second)
    expect(panelOf(second!).hidden).toBe(false)
    fireEvent.keyDown(second!, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(third)
    fireEvent.keyDown(third!, { key: 'ArrowRight' })
    expect(first!.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(first)
    expect(tabs().map((t) => panelOf(t).hidden)).toEqual([false, true, true])
  })

  it('AC-4003.3: ←는 앞 탭을 고르고, 처음에서는 끝으로 돈다. Home은 처음, End는 끝이다', () => {
    draw()
    const [first, second, third] = tabs()
    first!.focus()
    fireEvent.keyDown(first!, { key: 'ArrowLeft' })
    expect(third!.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(third)
    fireEvent.keyDown(third!, { key: 'ArrowLeft' })
    expect(second!.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(second)
    fireEvent.keyDown(second!, { key: 'Home' })
    expect(first!.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(first)
    fireEvent.keyDown(first!, { key: 'End' })
    expect(third!.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(third)
    expect(tabs().map((t) => t.tabIndex)).toEqual([-1, -1, 0])
  })

  it('AC-4003.3: 다른 키는 탭을 바꾸지 않는다', () => {
    draw()
    const [first] = tabs()
    first!.focus()
    fireEvent.keyDown(first!, { key: 'ArrowDown' })
    fireEvent.keyDown(first!, { key: 'a' })
    expect(tabs().map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false'])
  })
})

describe('AC-4003.4: 머리 줄 설명 · 오른쪽 단추는 고른 탭 것만', () => {
  it('AC-4003.4: 처음에는 첫 탭의 설명·단추가 제목 옆 머리 줄에 한 번씩 있고, 다른 탭 설명은 어디에도 없다', () => {
    draw()
    expect(within(head()).getByText('첫째 탭 설명')).toBeTruthy()
    expect(within(head()).getByRole('button', { name: '첫째 단추' })).toBeTruthy()
    expect(screen.getAllByText('첫째 탭 설명')).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: '첫째 단추' })).toHaveLength(1)
    expect(screen.queryByText('둘째 탭 설명')).toBeNull()
  })

  it('AC-4003.4: 탭을 바꾸면 설명이 그 탭 것으로 옮겨 가고 단추는 첫 탭일 때만 있다. 설명이 없는 탭은 제목만 남는다', () => {
    draw()
    fireEvent.click(tabNamed('처방별 신환·재진'))
    expect(within(head()).getByText('둘째 탭 설명')).toBeTruthy()
    expect(screen.getAllByText('둘째 탭 설명')).toHaveLength(1)
    expect(screen.queryByText('첫째 탭 설명')).toBeNull()
    expect(screen.queryByRole('button', { name: '첫째 단추' })).toBeNull()
    fireEvent.click(tabNamed('처방 골라 보기'))
    expect(head().textContent).toBe('처방')
    fireEvent.click(tabNamed('묶음별 추세'))
    expect(screen.getAllByText('첫째 탭 설명')).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: '첫째 단추' })).toHaveLength(1)
  })

  it('AC-4003.4: 탭 안 칸은 section·h2 없이 내용만 그린다', () => {
    const { container } = draw()
    for (const panel of container.querySelectorAll('[role="tabpanel"]')) expect(panel.querySelector('section, h2')).toBeNull()
    expect(container.querySelectorAll('section')).toHaveLength(1)
  })

  it('AC-4003.4: 휴대폰에서 머리 줄 오른쪽 단추 칸은 줄 전체 폭이다(지금 PHONE_FULL_ACTION을 이 칸 머리 줄이 맡음)', () => {
    draw()
    expect(classesOf(head())).toEqual(expect.arrayContaining(['flex', 'flex-wrap', 'max-md:[&>div>.ml-auto]:w-full']))
    const actionCell = within(head()).getByRole('button', { name: '첫째 단추' }).parentElement!
    expect(classesOf(actionCell)).toContain('ml-auto')
  })
})

describe('AC-4003.5: 고르지 않은 패널을 내려놓지 않는다', () => {
  it('AC-4003.5: 숨은 패널도 DOM에 있고(글을 찾을 수 있다) 탭을 옮겼다 와도 칸 안 상태가 그대로다', () => {
    draw()
    const more = screen.getByRole('button', { name: '첫째 하나 더' })
    fireEvent.click(more)
    fireEvent.click(more)
    fireEvent.click(more)
    expect(screen.getByText('첫째 센 수 3')).toBeTruthy()
    expect(screen.getByText('둘째 내용')).toBeTruthy()
    fireEvent.click(tabNamed('처방별 신환·재진'))
    expect(screen.getByText('첫째 센 수 3')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '둘째 하나 더' }))
    fireEvent.click(tabNamed('묶음별 추세'))
    expect(screen.getByText('첫째 센 수 3')).toBeTruthy()
    expect(screen.getByText('둘째 센 수 1')).toBeTruthy()
  })

  it('AC-4003.5: 탭 목록이 다시 그려져도(같은 이름) 패널과 고른 탭이 그대로다', () => {
    const { rerender } = draw()
    fireEvent.click(screen.getByRole('button', { name: '첫째 하나 더' }))
    fireEvent.click(tabNamed('처방별 신환·재진'))
    rerender(<RxSection tabs={[...TABS]} />)
    expect(tabNamed('처방별 신환·재진').getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('첫째 센 수 1')).toBeTruthy()
  })
})

describe('AC-4003.6: 탭 안 고치기 — 패널 맨 위 h3 · 초점', () => {
  const EDIT_TABS: RxTab[] = [
    { name: '묶음별 추세', panel: <EditableTab /> },
    { name: '처방별 신환·재진', panel: <CounterTab name="둘째" desc="둘째 탭 설명" /> },
    { name: '처방 골라 보기', panel: <CounterTab name="셋째" /> },
  ]

  it('AC-4003.6: [묶음 고치기](머리 줄)를 누르면 첫 탭 안 맨 위에 h3 제목이 생기고 초점이 그리로 가며, 머리 줄 설명·단추는 없다', () => {
    draw(EDIT_TABS)
    fireEvent.click(within(head()).getByRole('button', { name: '묶음 고치기' }))
    const panel = panelOf(tabNamed('묶음별 추세'))
    const h3 = within(panel).getByRole('heading', { level: 3, name: '가짜 묶음 · 묶음 고치기' })
    expect(panel.firstElementChild).toBe(h3)
    expect(document.activeElement).toBe(h3)
    expect(h3.tabIndex).toBe(-1)
    expect(classesOf(h3)).toEqual(expect.arrayContaining(TOC_SCROLL.split(' ')))
    expect(head().textContent).toBe('처방')
    expect(screen.queryByRole('button', { name: '묶음 고치기' })).toBeNull()
    // 탭 줄은 그대로다
    expect(tabs()).toHaveLength(3)
  })

  it('AC-4003.6: [그만두기]로 닫으면 머리 줄에 [묶음 고치기]가 다시 생기고 초점이 그 단추로 돌아온다', () => {
    draw(EDIT_TABS)
    fireEvent.click(within(head()).getByRole('button', { name: '묶음 고치기' }))
    fireEvent.click(screen.getByRole('button', { name: '그만두기' }))
    const edit = within(head()).getByRole('button', { name: '묶음 고치기' })
    expect(document.activeElement).toBe(edit)
    expect(within(head()).getByText('첫째 탭 설명')).toBeTruthy()
    expect(screen.queryByRole('heading', { level: 3 })).toBeNull()
  })
})

// ── stats-revenue: 매출 칸이 같은 탭 부품을 쓴다(design.md '칸 부품', 결정 6). 넘김 값 title·label·notice, 주지 않으면 지금 글자 그대로 ─────────────────
describe('AC-4107.1·AC-4107.8: 넘김 값 title · label · notice', () => {
  const NOTICE = (
    <div role="note">
      <p>가짜 안내 줄</p>
    </div>
  )

  it('AC-4107.1: title·label을 주면 h2와 tablist 이름이 그 글자이고, 탭·키·패널은 그대로다', () => {
    render(<RxSection tabs={TABS} title="가짜 칸" label="가짜 칸 보기" />)
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['가짜 칸'])
    const list = screen.getByRole('tablist', { name: '가짜 칸 보기' })
    expect(within(list).getAllByRole('tab').map((t) => t.textContent)).toEqual(['묶음별 추세', '처방별 신환·재진', '처방 골라 보기'])
    expect(screen.queryByRole('tablist', { name: '처방 보기' })).toBeNull()
    const [first, second] = tabs()
    first!.focus()
    fireEvent.keyDown(first!, { key: 'ArrowRight' })
    expect(second!.getAttribute('aria-selected')).toBe('true')
    expect(tabs().map((t) => panelOf(t).hidden)).toEqual([true, false, true])
  })

  it('AC-4107.1: 주지 않으면 지금 글자(h2 `처방` · tablist `처방 보기`)이고 머리 줄 다음이 곧 탭 줄이다', () => {
    draw()
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('처방')
    expect(head().nextElementSibling).toBe(screen.getByRole('tablist', { name: '처방 보기' }))
    expect(screen.queryByRole('note')).toBeNull()
  })

  it('AC-4107.8: notice는 머리 줄과 탭 줄 사이에 한 번 그려지고 탭 패널 밖이다', () => {
    render(<RxSection tabs={TABS} notice={NOTICE} />)
    const note = screen.getByRole('note')
    expect(head().nextElementSibling).toBe(note)
    expect(note.nextElementSibling).toBe(screen.getByRole('tablist'))
    expect(note.closest('[role="tabpanel"]')).toBeNull()
    fireEvent.click(tabNamed('처방 골라 보기'))
    expect(screen.getAllByRole('note')).toEqual([note])
  })
})

describe('AC-4002.6: 목차 자리 id', () => {
  it('AC-4002.6: SectionAnchor로 감싸면 처방 칸 section에 그 id와 TOC_SCROLL이 붙고, 탭 안에는 id가 겹치지 않는다', () => {
    const { container } = render(
      <SectionAnchor id="stats-rx">
        <RxSection tabs={TABS} className="col-span-12" />
      </SectionAnchor>,
    )
    const section = container.querySelector('section')!
    expect(section.id).toBe('stats-rx')
    expect(classesOf(section)).toEqual(expect.arrayContaining([...TOC_SCROLL.split(' '), 'col-span-12']))
    expect(container.querySelectorAll('#stats-rx')).toHaveLength(1)
  })

  it('AC-4002.6: 감싸지 않으면 id·scroll-margin이 없다', () => {
    const { container } = draw()
    const section = container.querySelector('section')!
    expect(section.hasAttribute('id')).toBe(false)
    expect(classesOf(section)).not.toEqual(expect.arrayContaining(TOC_SCROLL.split(' ')))
  })
})
