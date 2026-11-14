'use client'

import { createContext, useContext, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { HEADING, NoAnchor, SECTION, SECTION_HEAD, SectionPanelContext, TOC_SCROLL, useSectionAnchor, useStatsCard } from './parts'

// 처방 칸 한 칸 + 탭 셋 (stats-pc-ux REQ-4003, design.md 'sections/RxSection.tsx', 시안 notes.md §4 · .mk-tabs).
// 탭 안 칸은 Section 탭 패널 모드로 그린다: section·h2 없이 내용만, 고른 탭의 설명·단추는 이 칸 머리 줄 자리(slot)에 portal로.
// 고르지 않은 패널도 그린 채 hidden으로 둔다 — 칸 안 상태(열린 줄·그래프 모양·고치던 내용·고른 날 수)를 잃지 않는다(AC-4003.5).
// 고른 탭은 React 상태뿐이다(처음 첫 탭, 주소·저장소에 남기지 않는다).
// 매출 칸도 이 부품을 쓴다(stats-revenue design.md '칸 부품'): title·label은 주지 않으면 지금 글자, notice(도우미 예전 판 노란 줄)는 머리 줄과 탭 줄 사이
// 큰 카드 안(first90 AC-4413.1, design.md 5-5): 카드 제목과 같은 제목이면 제 section·h2를 그리지 않고, 고른 탭의 설명·단추 자리를 카드 머리 줄 안에 둔다.
// 그때 카드가 옆 글을 가졌으면(처방 카드) 탭 설명은 카드 머리에 보내지 않고 그 패널 맨 위 한 줄로 그린다(useTabDesc). 카드 밖·다른 제목 카드 안은 지금 그대로다

export type RxTab = { name: string; panel: ReactNode }

const TITLE = '처방'
const TABLIST_LABEL = '처방 보기'
// 휴대폰에서 머리 줄 오른쪽 단추 칸(ml-auto)을 줄 전체 폭으로(지금 TreatmentTrendSection PHONE_FULL_ACTION을 이 칸 머리 줄이 맡는다: 머리 줄 > 자리 > .ml-auto)
const PHONE_FULL_ACTION = 'max-md:[&>div>.ml-auto]:w-full'
// 탭 줄: 아래 1px line, 넘치면 탭 줄 안에서만 옆으로 밀린다(스크롤 막대 숨김)
const TABLIST = 'mt-2 flex gap-6 overflow-x-auto border-b border-line [scrollbar-width:none] max-md:gap-4'
// 탭: body, 40px(휴대폰 44px). 지금 탭 = ink 600 + 아래 2px accent 막대(그림자 클래스가 아니라 막대, design.md '배치')
const TAB_BASE =
  'relative inline-flex h-10 shrink-0 cursor-pointer items-center whitespace-nowrap px-0.5 text-body focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent max-md:h-11'
const TAB_IDLE = `${TAB_BASE} font-medium text-ink-2 transition hover:text-ink`
const TAB_ON = `${TAB_BASE} font-semibold text-ink after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-accent`
// 굵기가 바뀌어도 탭 폭이 흔들리지 않게 지금 탭(600) 글자 폭을 보이지 않는 ::after로 미리 잡는다(앱 탭 줄과 같은 방법)
const TAB_LABEL = 'inline-flex flex-col items-center after:invisible after:h-0 after:overflow-hidden after:font-semibold after:content-[attr(data-label)]'
// 카드 안 첫 줄(안내 줄 또는 탭 줄)은 위 여백이 없다(카드 몸통 위 여백이 대신한다). 카드 머리 줄 안 자리는 휴대폰에서 오른쪽 단추 칸을 줄 전체 폭으로 편다
const IN_CARD = 'min-w-0 [&>:first-child]:mt-0'
const CARD_SLOT = 'contents max-md:[&>.ml-auto]:w-full'
// 탭 패널 맨 위 설명 한 줄(카드가 옆 글을 가졌을 때)
const TAB_LEAD = 'mt-3 text-small text-st-muted'

// 탭 설명을 패널 맨 위 한 줄로 그릴지(카드가 옆 글을 가진 카드 안 처방 칸). RxSection이 패널마다 준다
const TabLeadContext = createContext(false)

// 탭 칸이 설명을 나눠 쓴다: head = Section desc로 줄 값(머리 줄로 간다), lead = 패널 맨 위에 그릴 한 줄(없으면 null)
export function useTabDesc(desc: string | undefined): { head: string | undefined; lead: ReactNode } {
  const inLead = useContext(TabLeadContext)
  if (!inLead || !desc) return { head: desc, lead: null }
  return { head: undefined, lead: <p className={TAB_LEAD}>{desc}</p> }
}

export function RxSection({
  tabs,
  className = '',
  title = TITLE,
  label = TABLIST_LABEL,
  notice,
}: {
  tabs: readonly RxTab[]
  className?: string
  title?: string
  label?: string
  notice?: ReactNode
}) {
  const anchor = useSectionAnchor()
  const card = useStatsCard()
  const inCard = card !== null && card.title === title
  const headingId = useId()
  const base = useId()
  const [selected, setSelected] = useState(0)
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const tabId = (i: number) => `${base}-tab-${i}`
  const panelId = (i: number) => `${base}-panel-${i}`

  // 자동 고름: → ←(돌기) · Home · End로 옮기면 바로 고르고 초점도 옮긴다(롤빙 tabIndex)
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = tabs.length - 1
    const moves: Record<string, number> = { ArrowRight: selected >= last ? 0 : selected + 1, ArrowLeft: selected <= 0 ? last : selected - 1, Home: 0, End: last }
    const next = moves[e.key]
    if (next === undefined) return
    e.preventDefault()
    setSelected(next)
    tabRefs.current[next]?.focus()
  }

  const body = (
    <>
      {notice}
      <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className={TABLIST}>
        {tabs.map((tab, i) => {
          const on = i === selected
          return (
            <button
              key={tab.name}
              ref={(el) => {
                tabRefs.current[i] = el
              }}
              type="button"
              role="tab"
              id={tabId(i)}
              aria-selected={on}
              aria-controls={panelId(i)}
              tabIndex={on ? 0 : -1}
              onClick={() => setSelected(i)}
              className={on ? TAB_ON : TAB_IDLE}
            >
              <span data-label={tab.name} className={TAB_LABEL}>
                {tab.name}
              </span>
            </button>
          )
        })}
      </div>
      <NoAnchor>
        <TabLeadContext.Provider value={inCard && card.ownDesc}>
          {tabs.map((tab, i) => (
            <div key={tab.name} role="tabpanel" id={panelId(i)} aria-labelledby={tabId(i)} hidden={i !== selected}>
              <SectionPanelContext.Provider value={{ active: i === selected, slot }}>{tab.panel}</SectionPanelContext.Provider>
            </div>
          ))}
        </TabLeadContext.Provider>
      </NoAnchor>
    </>
  )

  if (inCard) {
    // 카드 머리 줄 안 자리(card.slot)에 이 칸의 자리를 portal로 둔다. 붙기 전 첫 그림에는 카드 자리가 없어 다음 그림에 붙는다
    return (
      <div className={className ? `${IN_CARD} ${className}` : IN_CARD}>
        {card.slot && createPortal(<div ref={setSlot} className={CARD_SLOT} />, card.slot)}
        {body}
      </div>
    )
  }

  return (
    <section id={anchor ?? undefined} aria-labelledby={headingId} className={anchor ? `${SECTION} ${className} ${TOC_SCROLL}` : `${SECTION} ${className}`}>
      <div className={`${SECTION_HEAD} ${PHONE_FULL_ACTION}`}>
        <h2 id={headingId} className={HEADING}>
          {title}
        </h2>
        {/* 고른 탭 칸의 설명·단추 자리. contents라 안의 글·단추가 이 머리 줄의 칸이 되고, 비면 자리도 없다 */}
        <div ref={setSlot} className="contents" />
      </div>
      {body}
    </section>
  )
}
