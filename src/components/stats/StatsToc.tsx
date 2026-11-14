'use client'

import { useEffect, useRef, useState, type MouseEvent } from 'react'

// 바로가기 띠 (first90 REQ-4411 AC-4411.2, design.md 5-0 '바로가기 띠'. 지금 칸 고르기·누름은 stats-pc-ux REQ-4002 그대로).
// 기간 줄 아래에 놓이고 내리면 앱 머리줄(넓은 화면 102px · 휴대폰 94px) 바로 아래에 붙는다. 카드 링크 여섯뿐이다(띠 왼쪽 기간 글은 없앴다, 기간은 기간 줄에서 본다).
// 카드 자리는 DOM에서 id로 찾는다(카드를 그리는 쪽과 props로 잇지 않는다). 주소(#…)·브라우저 저장소를 쓰지 않고, 상태는 이 부품 안에만 둔다

export const TOC_LINKS: readonly { id: string; name: string }[] = [
  { id: 'stats-summary', name: '요약' },
  { id: 'stats-patients', name: '환자' },
  { id: 'stats-revenue', name: '매출' },
  { id: 'stats-rx', name: '처방' },
  { id: 'stats-ops', name: '진료 운영' },
  { id: 'stats-report', name: '보고' },
]
// 매출 카드가 없는 화면(매출을 주지 않음)의 링크 열
const WITHOUT_REVENUE = TOC_LINKS.filter((link) => link.id !== 'stats-revenue')

const LINE_BELOW = 48 // 지금 칸 기준선 = 띠 아래끝 + 48px
const SAME_TOP = 2 // 위끝이 이만큼 안이면 나란한 칸(앞 칸을 남긴다)
const AT_END = 2 // 쪽 맨 아래로 보는 남은 거리
const UNLOCK_MS = 1500 // scrollend가 오지 않을 때 누른 뒤 따라가기를 멈추는 시간
const REDUCE_MOTION = '(prefers-reduced-motion: reduce)'

// 지금 칸(AC-4002.5): 위끝이 기준선 이하인 칸 가운데 마지막. 앞 칸과 위끝이 2px 안이면 앞(왼쪽) 칸을 남긴다.
// 쪽 맨 아래면 마지막 칸. 기준선 위 칸이 없으면 -1
export function activeTocIndex(tops: readonly number[], line: number, atEnd: boolean): number {
  if (atEnd) return tops.length - 1
  let index = -1
  let at = -Infinity
  tops.forEach((top, i) => {
    if (top > line || Math.abs(top - at) < SAME_TOP) return
    index = i
    at = top
  })
  return index
}

const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia(REDUCE_MOTION).matches

// 쪽이 내려갈 만큼 길고 끝까지 내렸는지. 내려갈 곳이 없는 쪽은 맨 아래로 보지 않는다(위끝으로 고른다)
function atPageEnd(): boolean {
  const room = document.documentElement.scrollHeight - window.innerHeight
  return room > 0 && window.scrollY >= room - AT_END
}

// 띠(design.md 5-5 '바로가기 띠 모양', 시안 .s-nav): 불투명 회색 바탕(흐림 없음) + 아래 1px st-line 줄(붙기 전후 같음, 그림자 없음).
// 앱 틀 안쪽 여백(24 · 휴대폰 16)까지 넓혀 선이 틀 끝까지 간다. z-9 = 머리줄(z-10) 아래, 처방 찾기 층(z-5) 위
const NAV =
  'sticky top-25.5 z-9 mt-5 -mx-6 border-b border-st-line bg-st-canvas px-6 py-2 max-md:top-23.5 max-md:mt-4 max-md:-mx-4 max-md:px-4 max-md:py-1.5'
// 링크 줄: 띠 안에서만 옆으로 밀린다(스크롤 막대 숨김). relative = 링크 offsetLeft의 기준
const STRIP = 'relative flex min-w-0 gap-1 overflow-x-auto [scrollbar-width:none]'
// 링크: 알약(rounded-full) 14px 600 st-ink-2, 넓은 화면 36px · 휴대폰 44px(누르는 자리). 초점 고리는 안쪽 2px
const LINK =
  'inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-full px-4 text-body font-semibold no-underline transition focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent max-md:h-11 max-md:px-3'
// 올리면 st-line 바탕. 지금 카드는 st-ink 바탕 흰 글자(text-surface = 흰색 토큰)이고 올려도 그대로다
const LINK_IDLE = `${LINK} text-st-ink-2 hover:bg-st-line`
const LINK_CURRENT = `${LINK} bg-st-ink text-surface`

// revenue = 매출 카드가 있는지(주지 않으면 있다). 없으면 "매출" 링크도 없다(AC-4411.2)
export function StatsToc({ revenue = true }: { revenue?: boolean }) {
  const links = revenue ? TOC_LINKS : WITHOUT_REVENUE
  const navRef = useRef<HTMLElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(-1)
  // 누른 뒤 스크롤이 끝날 때까지는 따라가지 않는다(누른 링크가 남는다)
  const locked = useRef(false)
  const unlockTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    const nav = navRef.current
    if (nav === null) return undefined
    const follow = () => {
      if (locked.current) return
      const box = nav.getBoundingClientRect()
      const tops = links.map(({ id }) => document.getElementById(id)?.getBoundingClientRect().top ?? Infinity)
      setActive(activeTocIndex(tops, box.bottom + LINE_BELOW, atPageEnd()))
    }
    const unlock = () => {
      locked.current = false
      clearTimeout(unlockTimer.current)
    }
    follow()
    window.addEventListener('scroll', follow, { passive: true })
    window.addEventListener('resize', follow)
    window.addEventListener('scrollend', unlock)
    return () => {
      window.removeEventListener('scroll', follow)
      window.removeEventListener('resize', follow)
      window.removeEventListener('scrollend', unlock)
      clearTimeout(unlockTimer.current)
    }
  }, [links])

  // 지금 칸 링크를 링크 줄 가운데로 민다. 링크 줄만 움직이고 쪽은 움직이지 않는다(넘치지 않으면 아무것도 하지 않는다)
  useEffect(() => {
    const strip = stripRef.current
    const link = strip?.children[active]
    if (!strip || !(link instanceof HTMLElement) || strip.scrollWidth <= strip.clientWidth || typeof strip.scrollTo !== 'function') return
    const left = Math.max(0, link.offsetLeft - (strip.clientWidth - link.offsetWidth) / 2)
    strip.scrollTo({ left, behavior: reducedMotion() ? 'auto' : 'smooth' })
  }, [active])

  // 누름(AC-4002.4): 주소를 바꾸지 않고 그 칸으로 옮긴다. 칸의 scroll-margin이 띠 아래 자리를 맞춘다
  const go = (event: MouseEvent<HTMLAnchorElement>, index: number) => {
    event.preventDefault()
    locked.current = true
    clearTimeout(unlockTimer.current)
    unlockTimer.current = setTimeout(() => {
      locked.current = false
    }, UNLOCK_MS)
    setActive(index)
    const target = document.getElementById(links[index]!.id)
    if (target !== null && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' })
    }
  }

  return (
    <nav ref={navRef} aria-label="통계 바로가기" className={NAV}>
      <div ref={stripRef} className={STRIP}>
        {links.map(({ id, name }, i) => (
          <a
            key={id}
            href={`#${id}`}
            aria-current={i === active ? 'true' : undefined}
            onClick={(event) => go(event, i)}
            className={i === active ? LINK_CURRENT : LINK_IDLE}
          >
            {name}
          </a>
        ))}
      </div>
    </nav>
  )
}
