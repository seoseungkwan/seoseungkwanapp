'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { isUnder } from '@/components/shell/menu'

// 직원 탭 작은 메뉴 (staff AC-7611.2, design.md 6절, 시안 docs/mockups/staff/*.html .subnav '명단 · 근무표 · 휴가 · 급여').
// 페이지 이동 링크라 tablist가 아니고 지금 칸에 aria-current="page"를 붙인다. 모양은 설정 안 메뉴(SettingsPage)와 같다.
// 지금 칸은 주소로 고른다: 그 칸 주소이거나 그 아래 주소 가운데 가장 길게 맞는 칸(/staff 아래 다른 칸이 /staff보다 이긴다).
// 폰 전용 모양은 없다(폰에서도 PC 모양 그대로)

const ITEMS = [
  { label: '명단', href: '/staff' },
  { label: '근무표', href: '/staff/schedule' },
  { label: '휴가', href: '/staff/leave' },
  { label: '급여', href: '/staff/pay' },
] as const

const subBase =
  'relative inline-flex h-10 shrink-0 items-center whitespace-nowrap rounded-control px-3 text-body no-underline first:-ml-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent'
const subIdle = `${subBase} font-medium text-ink-2 hover:text-ink`
const subCurrent = `${subBase} font-semibold text-ink after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:bg-accent`

function currentHref(pathname: string): string | null {
  let best: string | null = null
  for (const { href } of ITEMS) if (isUnder(pathname, href) && (best === null || href.length > best.length)) best = href
  return best
}

export function StaffNav() {
  const current = currentHref(usePathname())
  return (
    <nav aria-label="직원 안 메뉴" className="flex border-b border-line">
      {ITEMS.map(({ label, href }) => (
        <Link key={href} href={href} aria-current={href === current ? 'page' : undefined} className={href === current ? subCurrent : subIdle}>
          {label}
        </Link>
      ))}
    </nav>
  )
}
