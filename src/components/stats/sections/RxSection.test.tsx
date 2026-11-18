// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { groupKey } from '@/components/stats/treatmentView'
import type { StatsRxGroup } from '@/types/rxGroups'
import type { BitSectionsView, PatientMix } from '@/types/stats'
import { DropoffSection } from './DropoffSection'
import { Section, SectionAnchor, StatsCard, TOC_SCROLL } from './parts'
import { RxSection, useTabDesc, type RxTab } from './RxSection'

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

// ── first90: 큰 카드 안 처방 칸(REQ-4413 AC-4413.1, design.md 5-5). 카드 제목과 같은 제목이면 제 머리 없이 카드 머리를 쓴다 ─────────────────
describe('AC-4413.1: 카드 안 처방 칸 — 카드 h2 하나 · 탭 셋 그대로 · 단추는 카드 머리', () => {
  const CARD_DESC = '가짜 카드 설명'
  // 진짜 탭 칸처럼 useTabDesc로 설명을 나눠 쓰는 가짜 칸
  function LeadTab({ name, desc, action }: { name: string; desc?: string; action?: ReactNode }) {
    const { head, lead } = useTabDesc(desc)
    return (
      <Section title={name} desc={head} action={action}>
        {lead}
        <p>{name} 내용</p>
      </Section>
    )
  }
  const LEAD_TABS: RxTab[] = [
    { name: '묶음별 추세', panel: <LeadTab name="첫째" action={<button type="button">첫째 단추</button>} /> },
    { name: '처방별 신환·재진', panel: <LeadTab name="둘째" desc="둘째 탭 설명" /> },
    { name: '처방 골라 보기', panel: <LeadTab name="셋째" desc="셋째 탭 설명" /> },
  ]
  const inCard = (tabs: readonly RxTab[] = LEAD_TABS, ownDesc = true, notice?: ReactNode) =>
    render(
      <StatsCard id="stats-rx" title="처방" desc={ownDesc ? CARD_DESC : undefined}>
        <RxSection tabs={tabs} notice={notice} />
      </StatsCard>,
    )

  it('AC-4413.1: 제목이 카드와 같으면 h2는 카드의 `처방` 하나이고 칸 section·위 선이 없다. 탭 셋 이름·차례·첫 탭 고름은 그대로다', () => {
    const { container } = inCard()
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['처방'])
    expect(container.querySelectorAll('section')).toHaveLength(1)
    expect(container.querySelector('section')!.id).toBe('stats-rx')
    const list = screen.getByRole('tablist', { name: '처방 보기' })
    expect(within(list).getAllByRole('tab').map((t) => t.textContent)).toEqual(['묶음별 추세', '처방별 신환·재진', '처방 골라 보기'])
    expect(tabs().map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false'])
    expect(classesOf(list.parentElement!)).not.toContain('border-line-strong')
    expect(classesOf(list.parentElement!)).toContain('min-w-0')
  })

  it('AC-4413.1: 고른 탭의 단추는 카드 머리 줄 오른쪽(ml-auto)에 한 번 있고, 휴대폰에서는 줄 전체 폭이다', () => {
    inCard()
    const edit = within(head()).getByRole('button', { name: '첫째 단추' })
    expect(screen.getAllByRole('button', { name: '첫째 단추' })).toHaveLength(1)
    expect(classesOf(edit.parentElement!)).toContain('ml-auto')
    expect(classesOf(edit.parentElement!.parentElement!)).toEqual(expect.arrayContaining(['contents', 'max-md:[&>.ml-auto]:w-full']))
    expect(head().textContent).toBe(`처방${CARD_DESC}첫째 단추`)
    fireEvent.click(tabNamed('처방별 신환·재진'))
    expect(screen.queryByRole('button', { name: '첫째 단추' })).toBeNull()
  })

  it('AC-4413.1: 카드가 옆 글을 가졌으면 탭 설명은 카드 머리에 가지 않고 그 패널 맨 위 한 줄(small muted)이다', () => {
    inCard()
    fireEvent.click(tabNamed('처방별 신환·재진'))
    expect(head().textContent).toBe(`처방${CARD_DESC}`)
    const panel = panelOf(tabNamed('처방별 신환·재진'))
    const lead = within(panel).getByText('둘째 탭 설명')
    expect(panel.firstElementChild).toBe(lead)
    expect(lead.tagName).toBe('P')
    expect(classesOf(lead)).toEqual(expect.arrayContaining(['text-small', 'text-st-muted']))
    expect(screen.getAllByText('셋째 탭 설명')).toHaveLength(1)
  })

  it('AC-4413.1: 카드에 옆 글이 없으면(매출 카드) 탭 설명은 지금처럼 카드 머리 줄에 가고 패널 맨 위 줄은 없다', () => {
    inCard(LEAD_TABS, false)
    fireEvent.click(tabNamed('처방별 신환·재진'))
    expect(head().textContent).toBe('처방둘째 탭 설명')
    expect(panelOf(tabNamed('처방별 신환·재진')).firstElementChild!.textContent).toBe('둘째 내용')
  })

  it('AC-4413.1: notice는 탭 줄 바로 앞 한 번이고, 키로 탭을 옮기는 것·숨은 패널은 그대로다', () => {
    inCard(LEAD_TABS, true, <div role="note">가짜 안내 줄</div>)
    const note = screen.getByRole('note')
    expect(note.nextElementSibling).toBe(screen.getByRole('tablist'))
    expect(note.closest('[role="tabpanel"]')).toBeNull()
    const [first, second] = tabs()
    first!.focus()
    fireEvent.keyDown(first!, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(second)
    expect(tabs().map((t) => panelOf(t).hidden)).toEqual([true, false, true])
    expect(screen.getByText('첫째 내용')).toBeTruthy()
  })

  it('AC-4413.1: 카드 머리의 [묶음 고치기]를 누르면 첫 탭 안에 h3가 생기고, 닫으면 카드 머리로 단추·초점이 돌아온다', () => {
    inCard([{ name: '묶음별 추세', panel: <EditableTab /> }, ...LEAD_TABS.slice(1)])
    fireEvent.click(within(head()).getByRole('button', { name: '묶음 고치기' }))
    const h3 = within(panelOf(tabNamed('묶음별 추세'))).getByRole('heading', { level: 3, name: '가짜 묶음 · 묶음 고치기' })
    expect(document.activeElement).toBe(h3)
    expect(screen.queryByRole('button', { name: '묶음 고치기' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '그만두기' }))
    expect(document.activeElement).toBe(within(head()).getByRole('button', { name: '묶음 고치기' }))
  })

  it('AC-4413.1: 카드 밖이면 useTabDesc는 설명을 머리 줄로 보내고(지금 그대로) 패널 맨 위 줄이 없다', () => {
    render(<RxSection tabs={LEAD_TABS} />)
    fireEvent.click(tabNamed('처방별 신환·재진'))
    expect(head().textContent).toBe('처방둘째 탭 설명')
    expect(panelOf(tabNamed('처방별 신환·재진')).firstElementChild!.textContent).toBe('둘째 내용')
  })
})

// ── stats-insights: 처방 칸 넷째 탭 '몇 번까지 받나'(REQ-6103 AC-6103.2·AC-6103.5, 시안 docs/mockups/stats-insights ③). 묶음·숫자는 지어낸 값이다 ─────────
describe('AC-6103.2·AC-6103.5: 처방 칸 탭 `몇 번까지 받나`', () => {
  const DROP_TAB = '몇 번까지 받나'
  const DROP_DESC = '신환이 그 치료를 몇 번까지 받고 그만 오는지 봐요'
  const MANUAL: StatsRxGroup = { id: 'g1', name: '도수', codes: ['MAN1'], sortOrder: 0 }
  const MIX: PatientMix = { total: { people: 3, visits: 3 }, compared: false, age: [], insurance: [], city: [], town: [] }
  const READY: BitSectionsView = {
    kind: 'ready',
    mix: { all: MIX, new: MIX },
    hours: { hours: [9], rows: [], unknown: 0, peak: null },
    doctors: { kind: 'single' },
    dropoff: [{ group: groupKey(MANUAL.codes), n: 214, atLeast: [214, 152, 133, 109, 94, 79], ten: 39, once: 62, average: 4.6, drop: 1 }],
  }
  const withDropoff = (view: BitSectionsView | null): RxTab[] => [...TABS, { name: DROP_TAB, panel: <DropoffSection view={view} groups={[MANUAL]} /> }]

  it('AC-6103.2: 넷째 탭을 누르면 그 패널에 묶음 고르기와 세 칸이 보이고, 탭 설명은 처방 칸 머리 줄에 간다. 탭 이름은 제목이 아니다', () => {
    draw(withDropoff(READY))
    expect(tabs().map((t) => t.textContent)).toEqual(['묶음별 추세', '처방별 신환·재진', '처방 골라 보기', DROP_TAB])
    const panel = panelOf(tabNamed(DROP_TAB))
    expect(panel.hidden).toBe(true)
    fireEvent.click(tabNamed(DROP_TAB))
    expect(panel.hidden).toBe(false)
    expect(within(panel).getByRole('group', { name: '치료 묶음' })).toBeTruthy()
    expect(within(panel).getByText('29%')).toBeTruthy()
    expect(within(panel).getByText('1회만 받고 끝난 환자 (214명 중 62명)')).toBeTruthy()
    expect(within(panel).getByText('4.6회')).toBeTruthy()
    expect(within(panel).getByText('1회 → 2회')).toBeTruthy()
    expect(head().textContent).toBe(`처방${DROP_DESC}`)
    expect(screen.queryByRole('heading', { name: DROP_TAB, hidden: true })).toBeNull()
  })

  it('AC-6103.2: 처방 카드(옆 글 있음) 안이면 탭 설명은 패널 맨 위 한 줄이고 카드 머리는 카드 글 그대로다', () => {
    render(
      <StatsCard id="stats-rx" title="처방" desc="가짜 카드 설명">
        <RxSection tabs={withDropoff(READY)} />
      </StatsCard>,
    )
    fireEvent.click(tabNamed(DROP_TAB))
    const panel = panelOf(tabNamed(DROP_TAB))
    expect(panel.firstElementChild!.textContent).toBe(DROP_DESC)
    expect(head().textContent).toBe('처방가짜 카드 설명')
  })

  it('AC-6103.5: 비트에서 불러오지 않은 기기면 그 탭은 `비트에서 불러오면 볼 수 있어요`뿐이고 숫자가 없다', () => {
    draw(withDropoff(null))
    fireEvent.click(tabNamed(DROP_TAB))
    const panel = panelOf(tabNamed(DROP_TAB))
    expect(within(panel).getByText('비트에서 불러오면 볼 수 있어요')).toBeTruthy()
    expect(panel.textContent).not.toMatch(/\d/)
  })
})
