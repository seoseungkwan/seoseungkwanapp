'use client'

import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { compareYmd } from '@/lib/analytics/dates'
import type { StatsRange } from './view'

// 목차 띠 (stats-pc-ux REQ-4002, design.md 'StatsToc.tsx', 시안 docs/mockups/stats-pc-ux/notes.md 3번).
// 기간 줄 아래에 놓이고 내리면 앱 머리줄(넓은 화면 102px · 휴대폰 94px) 바로 아래에 붙는다. 왼쪽 기간 글 + 칸 링크 아홉.
// 칸 자리는 DOM에서 id로 찾는다(칸을 그리는 쪽과 props로 잇지 않는다). 주소(#…)·브라우저 저장소를 쓰지 않고, 상태는 이 부품 안에만 둔다

export const TOC_LINKS: readonly { id: string; name: string }[] = [
  { id: 'stats-summary', name: '기간 요약' },
  { id: 'stats-trend', name: '환자 수' },
  { id: 'stats-revisit', name: '재방문율' },
  { id: 'stats-rx', name: '처방' },
  { id: 'stats-report', name: '보고 문장' },
  { id: 'stats-weekday', name: '요일별' },
  { id: 'stats-mix', name: '환자 구성' },
  { id: 'stats-hours', name: '시간대별' },
  { id: 'stats-doctors', name: '원장님별' },
]

const LINE_BELOW = 48 // 지금 칸 기준선 = 띠 아래끝 + 48px
const SAME_TOP = 2 // 위끝이 이만큼 안이면 나란한 칸(환자 수 · 재방문율, 보고 문장 · 요일별)
const AT_END = 2 // 쪽 맨 아래로 보는 남은 거리
const UNLOCK_MS = 1500 // scrollend가 오지 않을 때 누른 뒤 따라가기를 멈추는 시간
const REDUCE_MOTION = '(prefers-reduced-motion: reduce)'

const monthDay = (ymd: string) => `${Number(ymd.slice(5, 7))}.${Number(ymd.slice(8, 10))}`
const yearMonthDay = (ymd: string) => `${Number(ymd.slice(0, 4))}.${monthDay(ymd)}`

// '최근 30일 · 10.15–11.13'. 끝 = 기간 끝과 마지막 끝난 날 중 이른 날. 해가 다르면 양 끝에 해를 붙인다(AC-4002.2)
export function tocRangeText(range: StatsRange, lastDay: string): string {
  const { from } = range.current
  const to = compareYmd(range.current.to, lastDay) <= 0 ? range.current.to : lastDay
  const span = from.slice(0, 4) === to.slice(0, 4) ? `${monthDay(from)}–${monthDay(to)}` : `${yearMonthDay(from)}–${yearMonthDay(to)}`
  return `${range.name} · ${span}`
}

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

// 띠: 붙기 전에는 위 1px 줄, 붙으면 아래 1px 줄(그림자 없음, 기본값 5). z-9 = 머리줄(z-10) 아래, 처방 찾기 층(z-5) 위
const NAV = 'sticky top-25.5 z-9 mt-5 border-y bg-surface max-md:top-23.5 max-md:mt-4'
const NAV_LOOSE = 'border-t-line border-b-transparent'
const NAV_STUCK = 'border-t-transparent border-b-line'
const RANGE = 'mr-1 shrink-0 whitespace-nowrap border-r border-line pr-3 text-caption text-muted tabular-nums max-md:pr-2'
// 링크 줄: 띠 안에서만 옆으로 밀린다(스크롤 막대 숨김). relative = 링크 offsetLeft의 기준
const STRIP = 'relative flex min-w-0 flex-1 overflow-x-auto [scrollbar-width:none]'
// 링크: small 500 ink-2, 넓은 화면 42px · 휴대폰 44px. 지금 칸은 accent-strong + 아래 2px accent 막대(그림자 클래스 아님). 초점 고리는 안쪽 2px
const LINK =
  'relative inline-flex h-10.5 shrink-0 items-center whitespace-nowrap rounded-control px-3 text-small font-medium no-underline transition after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent max-md:h-11 max-md:px-2'
const LINK_IDLE = `${LINK} text-ink-2 hover:text-ink`
const LINK_CURRENT = `${LINK} text-accent-strong after:bg-accent`

export function StatsToc({ range, lastDay }: { range: StatsRange; lastDay: string }) {
  const navRef = useRef<HTMLElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(-1)
  const [stuck, setStuck] = useState(false)
  // 누른 뒤 스크롤이 끝날 때까지는 따라가지 않는다(누른 링크가 남는다)
  const locked = useRef(false)
  const unlockTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    const nav = navRef.current
    if (nav === null) return undefined
    const follow = () => {
      const box = nav.getBoundingClientRect()
      const top = Number.parseFloat(window.getComputedStyle(nav).top) // 붙는 자리(top-25.5 · max-md:top-23.5)
      setStuck(Number.isFinite(top) && box.top <= top + 0.5)
      if (locked.current) return
      const tops = TOC_LINKS.map(({ id }) => document.getElementById(id)?.getBoundingClientRect().top ?? Infinity)
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
  }, [])

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
    const target = document.getElementById(TOC_LINKS[index]!.id)
    if (target !== null && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' })
    }
  }

  return (
    <nav ref={navRef} aria-label="칸 바로 가기" className={`${NAV} ${stuck ? NAV_STUCK : NAV_LOOSE}`}>
      <div className="flex min-w-0 items-center">
        <span className={RANGE}>{tocRangeText(range, lastDay)}</span>
        <div ref={stripRef} className={STRIP}>
          {TOC_LINKS.map(({ id, name }, i) => (
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
      </div>
    </nav>
  )
}
