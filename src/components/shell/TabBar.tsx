'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { MENU, currentMenuLabel } from './menu'

// 탭 줄 (tab-frame REQ-303, AC-008.7, b2b-redesign AC-218.2, UI_GUIDE '앱 화면' 탭·폰). 44px·흰 바탕·아래 1px 선.
// 위쪽 띠와 함께 AppShell의 붙는 묶음 안에 있다(이 nav 자신은 붙지 않는다).
// 13개 모두 자기 주소로 가는 링크다. 화면이 아직 없는 기능도 같은 모양이고, 준비 중임은 그 주소의 준비 중 화면이 알린다.
// 1024px 미만은 띠 안에서 옆으로 밀린다(얇은 스크롤바·줄바꿈 없음). 띠 끝 흐림은 넣지 않는다

// 탭 공통: 모든 폭 44px·좌우 12px·body, 키보드 초점은 탭 안쪽 2px accent 고리(4px 모서리). 올림 글자색은 짧게 바뀐다(transition 150ms, UI_GUIDE '짧은 반응 허용').
// 굵기·글자색은 종류마다 하나씩 준다. 전역 a 규칙·브라우저 기본 밑줄에 기대지 않게 글자색·no-underline을 직접 준다
const tabBase =
  'relative inline-flex h-11 shrink-0 items-center whitespace-nowrap rounded-control px-3 text-body no-underline transition focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent'
// 기본: ink-2 500, 올림 ink
const tabIdle = `${tabBase} font-medium text-ink-2 hover:text-ink`
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

export function TabBar() {
  const pathname = usePathname()
  const navRef = useRef<HTMLElement>(null)
  // 지금 탭: 탭의 path·owns 중 가장 길게 맞는 자리(menu.ts, /claim/setup은 청구가 아니라 설정 자리). /admin에는 지금 탭이 없다
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
        {MENU.map((item) => (
          <TabLink key={item.label} label={item.label} href={item.path} current={current === item.label} />
        ))}
      </div>
    </nav>
  )
}
