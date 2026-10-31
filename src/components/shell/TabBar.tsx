'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useId, useRef, useState } from 'react'
import { ADMIN_ITEM, MENU, currentMenuLabel, isUnder } from './menu'

// 탭 띠 (AC-008.1·008.2·008.5·008.7, UI_GUIDE '앱 화면' 탭·폰). 흰 바탕·아래 1px 선, 위쪽 띠 아래에 놓이고 붙어 따라오지 않는다.
// 1024px 미만은 띠 안에서 옆으로 밀린다(얇은 스크롤바·줄바꿈 없음). 그때 툴팁은 띠 밖으로 나갈 수 없어 숨긴다(design.md '탭 띠 스크롤과 툴팁')

// 탭 공통: 50px·좌우 20px·tab, 키보드 초점은 탭 안쪽 2px accent 고리(4px 모서리). 폰 46px·좌우 14px·body.
// 랜딩 a 규칙(teal 글자·밑줄)이 닿지 않게 글자색·no-underline을 직접 준다
const tabBase =
  'relative inline-flex h-12.5 shrink-0 items-center whitespace-nowrap rounded-chip px-5 text-tab no-underline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent max-md:h-11.5 max-md:px-3.5 max-md:text-body'
// 기본: ink-2 500, 올림 ink
const tabIdle = `${tabBase} font-medium text-ink-2 hover:text-ink`
// 지금: accent 700 + 아래 3px accent 밑줄(좌우 10px 안쪽, 위 모서리 2px)
const tabCurrent = `${tabBase} font-bold text-accent after:absolute after:inset-x-2.5 after:bottom-0 after:h-0.75 after:rounded-t-xs after:bg-accent`

// 굵기가 바뀌어도 탭 폭이 흔들리지 않게, 굵은 글자 폭을 보이지 않는 ::after로 미리 잡는다
function TabLabel({ label }: { label: string }) {
  return (
    <span
      data-label={label}
      className="inline-flex flex-col items-center after:invisible after:h-0 after:overflow-hidden after:font-bold after:content-[attr(data-label)]"
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

// 아직 없는 화면: 링크가 아니고 눌러도 아무 일이 없다. 모양은 기본 탭과 같고, 올림·초점에 '준비 중' 툴팁(AC-008.5).
// 툴팁 글은 aria-describedby로 늘 읽힌다(숨겨져 있어도). WCAG 1.4.13: Esc로 닫히고, 마우스를 툴팁 위로 옮겨도 남는다
// (툴팁은 탭 안 40px에서 시작해 탭과 사이 틈이 없고, 탭을 감싼 덩이 안에 있어 마우스를 받는다).
// 탭(50px) 아래로 14px만 내려와 본문 위 여백(24px) 안에 머문다 → 페이지 제목을 덮지 않는다.
// current: 이 탭 자리에 속한 다른 화면을 보는 중(목업: /claim/setup은 설정 탭 안). 링크는 아니고 지금 탭 모양만 보인다
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
        className={current ? tabCurrent : tabIdle}
      >
        <TabLabel label={label} />
      </button>
      {/* 1024px 미만은 띠 안 스크롤이라 띠 밖으로 나갈 수 없어 늘 숨긴다 */}
      <span
        role="tooltip"
        id={tipId}
        className={`absolute top-10 left-1/2 z-20 hidden -translate-x-1/2 whitespace-nowrap rounded-chip bg-ink px-2 py-1 text-caption font-medium text-surface shadow-float ${open ? 'lg:block' : ''}`}
      >
        준비 중
      </span>
    </span>
  )
}

export function TabBar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname()
  const navRef = useRef<HTMLElement>(null)
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
      <div className="flex w-max min-w-full items-stretch gap-1.5 px-4 max-md:gap-0 max-md:px-1.5">
        {MENU.map((item) =>
          item.href === null ? (
            <NotReadyTab key={item.label} label={item.label} current={current === item.label} />
          ) : (
            <TabLink key={item.label} label={item.label} href={item.href} current={current === item.label} />
          ),
        )}
        {isAdmin && (
          <>
            <span aria-hidden="true" className="-mx-1.5 h-4 w-px shrink-0 self-center bg-line" />
            <TabLink label={ADMIN_ITEM.label} href={ADMIN_ITEM.href} current={isUnder(pathname, ADMIN_ITEM.href)} />
          </>
        )}
      </div>
    </nav>
  )
}
