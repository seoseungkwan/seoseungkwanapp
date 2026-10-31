'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useId, useRef, useState } from 'react'
import { ADMIN_ITEM, MENU, currentMenuLabel, isUnder } from './menu'

// 탭 줄 (AC-008.1·008.2·008.5·008.7, b2b-redesign AC-218.2, UI_GUIDE '앱 화면' 탭·폰). 44px·흰 바탕·아래 1px 선.
// 위쪽 띠와 함께 AppShell의 붙는 묶음 안에 있다(이 nav 자신은 붙지 않는다).
// 1024px 미만은 띠 안에서 옆으로 밀린다(얇은 스크롤바·줄바꿈 없음). 그때 툴팁은 띠 밖으로 나갈 수 없어 숨긴다(design.md '탭 띠 스크롤과 툴팁')

// 탭 공통: 모든 폭 44px·좌우 12px·body, 키보드 초점은 탭 안쪽 2px accent 고리(4px 모서리).
// 굵기·글자색은 종류마다 하나씩 준다. 전역 a 규칙·브라우저 기본 밑줄에 기대지 않게 글자색·no-underline을 직접 준다
const tabBase =
  'relative inline-flex h-11 shrink-0 items-center whitespace-nowrap rounded-control px-3 text-body no-underline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent'
// 기본: ink-2 500, 올림 ink
const tabIdle = `${tabBase} font-medium text-ink-2 hover:text-ink`
// 준비 중: 같은 크기·글자, 색만 faint(올림에도 그대로)
const tabNotReady = `${tabBase} font-medium text-faint`
// 지금: ink 600 + 아래 2px accent 밑줄(좌우 12px 안쪽 = 글자 폭)
const tabCurrent = `${tabBase} font-semibold text-ink after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-accent`

// 굵기가 바뀌어도 탭 폭이 흔들리지 않게, 지금 탭 굵기(600) 글자 폭을 보이지 않는 ::after로 미리 잡는다
function TabLabel({ label }: { label: string }) {
  return (
    <span
      data-label={label}
      className="inline-flex flex-col items-center after:invisible after:h-0 after:overflow-hidden after:font-semibold after:content-[attr(data-label)]"
    >
      {label}
    </span>
  )
}

function TabLink({ label, href, current }: { label: string; href: string; current: boolean }) {
  return (
    <Link href={href} aria-current={current ? 'page' : undefined} className={current ? tabCurrent : tabIdle}>
      <TabLabel label={label} />
    </Link>
  )
}

// 아직 없는 화면: 링크가 아니고 눌러도 아무 일이 없다. 크기·글자는 기본 탭과 같고 글자만 faint, 올림·초점에 '준비 중' 툴팁(AC-008.5·AC-218.2).
// 툴팁 글은 aria-describedby로 늘 읽힌다(숨겨져 있어도). WCAG 1.4.13: Esc로 닫히고, 마우스를 툴팁 위로 옮겨도 남는다
// (툴팁은 탭 안 38px에서 시작해 탭과 사이 틈이 없고, 탭을 감싼 덩이 안에 있어 마우스를 받는다).
// 툴팁(28px)은 탭(44px) 아래로 22px만 내려와 본문 위 여백(24px) 안에 머문다 → 페이지 제목을 덮지 않는다.
// current: 이 탭 자리에 속한 다른 화면을 보는 중(청구 목업: /claim/setup은 설정 탭 안). 누를 수 없는 단추·툴팁은 그대로이고 지금 탭 모양만 보인다(AC-006.4·AC-034.1)
function NotReadyTab({ label, current }: { label: string; current: boolean }) {
  const tipId = useId()
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [dismissed, setDismissed] = useState(false) // Esc로 닫음. 다시 올리거나 초점이 오면 풀린다
  const open = (hovered || focused) && !dismissed

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDismissed(true)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  return (
    <span
      className="relative flex shrink-0"
      onMouseEnter={() => {
        setHovered(true)
        setDismissed(false)
      }}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => {
        setFocused(true)
        setDismissed(false)
      }}
      onBlur={() => setFocused(false)}
    >
      <button
        type="button"
        aria-disabled="true"
        aria-describedby={tipId}
        aria-current={current ? 'page' : undefined}
        className={current ? tabCurrent : tabNotReady}
      >
        <TabLabel label={label} />
      </button>
      {/* 1024px 미만은 띠 안 스크롤이라 띠 밖으로 나갈 수 없어 늘 숨긴다 */}
      <span
        role="tooltip"
        id={tipId}
        className={`absolute top-9.5 left-1/2 z-20 hidden -translate-x-1/2 whitespace-nowrap rounded-float bg-ink px-2 py-1.5 text-caption font-medium text-surface shadow-float ${open ? 'lg:block' : ''}`}
      >
        준비 중
      </span>
    </span>
  )
}

export function TabBar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname()
  const navRef = useRef<HTMLElement>(null)
  // 지금 탭: 탭의 href·owns 중 가장 길게 맞는 자리(menu.ts, /claim/setup은 청구가 아니라 설정 자리)
  const current = currentMenuLabel(pathname)

  // 좁은 폭에서 지금 탭이 밀려 안 보이면 보이게 옮긴다(AC-008.7). 탭 띠가 넘칠 때만, 띠의 scrollLeft만 바꾼다
  // (scrollIntoView는 창까지 밀 수 있다 — 1024px 이상은 띠가 넘치지 않아 아무것도 하지 않는다)
  useEffect(() => {
    const nav = navRef.current
    const current = nav?.querySelector('[aria-current="page"]')
    if (!nav || !current || nav.scrollWidth <= nav.clientWidth) return
    const bar = nav.getBoundingClientRect()
    const box = current.getBoundingClientRect()
    if (box.left < bar.left) nav.scrollLeft += box.left - bar.left
    else if (box.right > bar.right) nav.scrollLeft += box.right - bar.right
  }, [pathname])

  return (
    <nav
      ref={navRef}
      aria-label="메뉴"
      className="border-b border-line bg-surface max-lg:overflow-x-auto max-lg:[scrollbar-width:thin]"
    >
      {/* 탭 줄 하나(감싸개를 더하지 않는다). 1024px 이상은 위쪽 띠 안쪽과 같은 1280 폭·좌우 24px로 가운데에 놓인다.
          첫 탭은 왼쪽으로 12px 당겨 글자가 로고 왼쪽 끝과 맞는다(모든 폭, 시안의 폰 줄도 글자 16px로 맞음) */}
      <div className="flex w-max min-w-full items-stretch px-6 max-md:px-4 lg:mx-auto lg:w-full lg:min-w-0 lg:max-w-7xl [&>:first-child]:-ml-3">
        {MENU.map((item) =>
          item.href === null ? (
            <NotReadyTab key={item.label} label={item.label} current={current === item.label} />
          ) : (
            <TabLink key={item.label} label={item.label} href={item.href} current={current === item.label} />
          ),
        )}
        {isAdmin && (
          <>
            <span aria-hidden="true" className="mx-2 h-4 w-px shrink-0 self-center bg-line" />
            <TabLink label={ADMIN_ITEM.label} href={ADMIN_ITEM.href} current={isUnder(pathname, ADMIN_ITEM.href)} />
          </>
        )}
      </div>
    </nav>
  )
}
