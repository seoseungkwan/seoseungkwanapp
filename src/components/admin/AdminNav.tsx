import Link from 'next/link'

// 관리자 화면 안쪽 메뉴 (spec admin-view REQ-8012 AC-8012.4, design.md '관리자 화면', 시안 docs/mockups/admin-view ?s=admin-list adminHead).
// 모양은 설정 화면 안쪽 메뉴(SettingsPage·SetupScreen, AC-034.2)와 같다 — 페이지 이동 링크라 tablist가 아니고 aria-current.
// 계정 메뉴에는 [의원 비교]를 더하지 않는다(design.md 기본값 23). 폰 전용 모양은 만들지 않는다(사용자 규칙 2026-11-21)
export type AdminPath = '/admin' | '/admin/compare'

const LINKS: readonly { href: AdminPath; label: string }[] = [
  { href: '/admin', label: '가입 승인' },
  { href: '/admin/compare', label: '의원 비교' },
]

const base =
  'relative inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-control px-3 text-body no-underline first:-ml-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent'
const idle = `${base} font-medium text-ink-2 hover:text-ink`
const current = `${base} font-semibold text-ink after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:bg-accent`

export function AdminNav({ current: here }: { current: AdminPath }) {
  return (
    <nav aria-label="관리자 안 메뉴" className="flex border-b border-line">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={l.href === here ? 'page' : undefined} className={l.href === here ? current : idle}>
          {l.label}
        </Link>
      ))}
    </nav>
  )
}
