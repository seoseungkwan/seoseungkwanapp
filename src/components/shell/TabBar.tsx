'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useId, useRef } from 'react'
import { ADMIN_ITEM, MENU } from './menu'

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

const isCurrent = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`)

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

function TabLink({ label, href, pathname }: { label: string; href: string; pathname: string }) {
  const current = isCurrent(pathname, href)
  return (
    <Link href={href} aria-current={current ? 'page' : undefined} className={current ? tabCurrent : tabIdle}>
      <TabLabel label={label} />
    </Link>
  )
}

// 아직 없는 화면: 링크가 아니고 눌러도 아무 일이 없다. 모양은 기본 탭과 같고, 올림·초점에 '준비 중' 툴팁(AC-008.5).
// 툴팁 글은 aria-describedby로 늘 읽힌다(숨겨져 있어도)
function NotReadyTab({ label }: { label: string }) {
  const tipId = useId()
  return (
    <span className="group relative flex shrink-0">
      <button type="button" aria-disabled="true" aria-describedby={tipId} className={tabIdle}>
        <TabLabel label={label} />
      </button>
      <span
        role="tooltip"
        id={tipId}
        className="pointer-events-none absolute top-full left-1/2 z-20 mt-1 hidden -translate-x-1/2 whitespace-nowrap rounded-chip bg-ink px-2 py-1 text-caption font-medium text-surface shadow-float lg:group-focus-within:block lg:group-hover:block"
      >
        준비 중
      </span>
    </span>
  )
}

export function TabBar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname()
  const navRef = useRef<HTMLElement>(null)

  // 폰에서 지금 탭이 밀려 안 보이면 보이게 옮긴다(AC-008.7). 띠 안에서만 옮기고 페이지는 위아래로 움직이지 않게 nearest
  useEffect(() => {
    navRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
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
            <NotReadyTab key={item.label} label={item.label} />
          ) : (
            <TabLink key={item.label} label={item.label} href={item.href} pathname={pathname} />
          ),
        )}
        {isAdmin && (
          <>
            <span aria-hidden="true" className="-mx-1.5 h-4 w-px shrink-0 self-center bg-line" />
            <TabLink label={ADMIN_ITEM.label} href={ADMIN_ITEM.href} pathname={pathname} />
          </>
        )}
      </div>
    </nav>
  )
}
