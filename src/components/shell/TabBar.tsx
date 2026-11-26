'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState, useSyncExternalStore, type FocusEvent, type MouseEvent, type ReactNode } from 'react'
import { fillStatus } from '@/lib/gsheet/status'
import { LoadBar } from './LoadBar'
import { DESK_TABS, LIBRARY_TAB, LOCATION_TAB, MENU, PRIMARY_MENU, currentMenuLabel, type MenuPath } from './menu'
import { MoreMenu, ShellLink } from './MoreMenu'
import { NoticeBadge } from './NoticeBadge'

// 탭 줄 (tab-frame REQ-303, AC-008.7, b2b-redesign AC-218.2, ui-90 REQ-405, dashboard-ux REQ-2702, UI_GUIDE '앱 화면' 탭 줄·누른 탭 먼저).
// 44px·흰 바탕·아래 1px 선. 위쪽 띠와 함께 AppShell의 붙는 묶음 안에 있다(이 nav 자신은 붙지 않는다).
// nav 안: 탭 줄 감싸개(첫 자식 — 탭 띠(주요 메뉴 여섯) · [더보기] 단추와 판(MoreMenu, 모든 폭)) · 불러오기 줄(LoadBar, 맨 끝).
// 탭 줄 감싸개는 1024px 이상 본문과 같은 1280 폭 가운데라 첫 탭 글자는 로고와, [더보기] 글자·판 끝은 본문 오른쪽 정렬선과 맞는다(dashboard-ux AC-2702.4).
// 감싸개는 자리 기준(position)이 아니어서 768px 미만 판은 그대로 nav 기준 전체 폭이다.
// 모두 자기 주소로 가는 링크다. 화면이 아직 없는 기능은 [더보기] 판에 있고, 준비 중임은 판의 칩과 그 주소의 준비 중 화면이 알린다.
// 1024px 미만은 탭 띠만 옆으로 밀린다(얇은 스크롤바·줄바꿈 없음, [더보기] 글자가 길어 넘칠 때). 띠 끝 흐림은 넣지 않는다(UI_GUIDE '탭 줄', 시안의 끝 흐림과 다르다)
// 데스크 계정(desk 참, desk-feedback AC-6306.2): 탭 띠 = 업무일지·수납일지·예약과 끝의 자료실(DESK_TABS, specs/library AC-8108.3)뿐이고 [더보기]가 없다.
// 관리자 값(isAdmin)은 [더보기] 판의 입지 분석에만 쓴다(specs/location AC-7901.1). 탭 띠에는 관리자 탭이 없다(데스크는 [더보기]가 없어 늘 없음).
// 관리자만 보는 탭(hidden, multi-admin AC-7706.3): 숨긴 탭은 탭 띠와 [더보기] 판에서 뺀다. 없거나 비면 지금 그대로다. 자료실은 늘 보이는 탭이라 빼지 않는다
// 입지 분석(/location)을 오가는 링크는 평범한 <a>라 브라우저가 새 문서를 받는다(ShellLink). 누른 탭·불러오기 줄은 그동안 보인다

// 탭 공통: 모든 폭 44px·좌우 12px·body, 키보드 초점은 탭 안쪽 2px accent 고리(4px 모서리). 올림 글자색은 짧게 바뀐다(transition 150ms, UI_GUIDE '짧은 반응 허용').
// 굵기·글자색은 종류마다 하나씩 준다. 전역 a 규칙·브라우저 기본 밑줄에 기대지 않게 글자색·no-underline을 직접 준다
const tabBase =
  'relative inline-flex h-11 shrink-0 items-center whitespace-nowrap rounded-control px-3 text-body no-underline transition focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent'
// 기본: ink-2 500, 올림 ink
const tabIdle = `${tabBase} font-medium text-ink-2 hover:text-ink`
// 지금(또는 방금 누른) 탭: ink 600 + 아래 2px accent 밑줄(좌우 12px 안쪽 = 글자 폭)
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

// 수납일지 탭 옆 주황 점(spec google-link AC-8540.2, 시안 sunap.html .tdot — 7px 둥근 warning 점, 이름과 4px). 넣기 멈춤(lib/gsheet/status stopped —
// 마지막 넣기가 실패, 다른 PC의 멈춤도 서버 기록으로 채워짐)이면 그린다. 마우스를 올리면 말풍선, 화면 읽기에는 같은 글을 따로 준다. 다음 넣기가 되면 사라진다
const STOP_TEXT = '넣기가 멈췄어요'
const stoppedNow = () => fillStatus.get().stopped
const stoppedOnServer = () => null

function SheetStopDot() {
  const stopped = useSyncExternalStore(fillStatus.subscribe, stoppedNow, stoppedOnServer)
  if (stopped === null) return null
  return (
    <>
      <span aria-hidden="true" title={STOP_TEXT} className="ml-1 inline-block size-1.75 shrink-0 rounded-control bg-warning" />
      <span className="sr-only">{STOP_TEXT}</span>
    </>
  )
}

/** 탭 이름 뒤에 붙는 것: 원장 고시·공지의 안 읽은 수, 원장·데스크 수납일지의 넣기 멈춤 점 */
function badgeOf(path: string, desk: boolean): ReactNode {
  if (path === '/sunap') return <SheetStopDot />
  if (!desk && path === '/notices') return <NoticeBadge />
  return null
}

function TabLink({
  label,
  href,
  from,
  current,
  shown,
  pending,
  onPress,
  onFocus,
  badge,
}: {
  label: string
  href: string
  /** 지금 경로(입지 분석을 오가는 링크인지 ShellLink가 본다) */
  from: string
  /** 지금 경로의 탭(aria-current). 경로가 바뀔 때만 옮겨진다 */
  current: boolean
  /** 지금 탭 모양으로 보인다(누른 탭이 있으면 그 탭, 없으면 지금 탭) */
  shown: boolean
  /** 방금 누른 탭(data-pending) */
  pending: boolean
  onPress: (e: MouseEvent<HTMLAnchorElement>, href: string) => void
  onFocus: (e: FocusEvent<HTMLAnchorElement>) => void
  /** 이름 뒤에 붙는 것(고시·공지의 안 읽은 수·수납일지 넣기 멈춤 점). 링크 글자 안이라 화면 읽기가 이름과 함께 읽는다 */
  badge?: ReactNode
}) {
  return (
    <ShellLink
      from={from}
      href={href}
      aria-current={current ? 'page' : undefined}
      data-pending={pending ? 'true' : undefined}
      onClick={(e) => onPress(e, href)}
      onFocus={onFocus}
      className={shown ? tabCurrent : tabIdle}
    >
      <TabLabel label={label} />
      {badge}
    </ShellLink>
  )
}

// 띠가 넘칠 때만, 그 탭이 띠 밖으로 밀려 있으면 띠의 scrollLeft만 바꿔 보이게 한다
// (scrollIntoView는 창까지 밀 수 있다 — 1024px 이상은 띠가 넘치지 않아 아무것도 하지 않는다)
function revealInStrip(strip: HTMLElement | null, item: Element | null | undefined) {
  if (!strip || !item || strip.scrollWidth <= strip.clientWidth) return
  const bar = strip.getBoundingClientRect()
  const box = item.getBoundingClientRect()
  if (box.left < bar.left) strip.scrollLeft += box.left - bar.left
  else if (box.right > bar.right) strip.scrollLeft += box.right - bar.right
}

// 새 탭·새 창으로 여는 누름(보조키·왼쪽 아닌 단추)은 이 창의 경로를 바꾸지 않는다 → 누른 탭으로 정하지 않는다
const opensElsewhere = (e: MouseEvent) => e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey

// 누른 주소의 탭을 찾는 곳: MENU와 관리자의 입지 분석, 모두의 자료실
const TABS = [...MENU, LOCATION_TAB, LIBRARY_TAB]

export function TabBar({
  desk = false,
  isAdmin = false,
  hidden = [],
}: {
  desk?: boolean
  isAdmin?: boolean
  /** 숨긴 탭(multi-admin). 없으면 빈 목록 */
  hidden?: readonly MenuPath[]
} = {}) {
  const pathname = usePathname()
  const tabs = (desk ? DESK_TABS : PRIMARY_MENU).filter((item) => item === LIBRARY_TAB || !hidden.includes(item.path))
  const stripRef = useRef<HTMLDivElement>(null)
  // 지금 탭: 탭의 path·owns 중 가장 길게 맞는 자리(menu.ts, /claim/setup은 청구가 아니라 설정 자리). /admin에는 지금 탭이 없다
  const current = currentMenuLabel(pathname)

  // 누른 탭(ui-90 AC-405.2): 누른 주소와 누를 때의 경로. 경로가 바뀌면(이동이 끝나면) 지운다
  const [pending, setPending] = useState<{ href: string; from: string } | null>(null)
  if (pending !== null && pending.from !== pathname) setPending(null)
  const pendingHref = pending?.href ?? null
  // 누른 주소의 탭 이름과, 지금 탭 모양으로 보일 이름(누른 탭이 있으면 그것, 없으면 지금 탭) — [더보기] 단추가 쓴다
  const pendingLabel = pendingHref === null ? null : (TABS.find((item) => item.path === pendingHref)?.label ?? null)
  const shownLabel = pendingHref === null ? current : pendingLabel
  // 누를 때마다 새 불러오기 줄을 그려 0에서 다시 차오르게 한다(LoadBar)
  const [presses, setPresses] = useState(0)

  const press = (e: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (opensElsewhere(e)) return
    // 지금 주소를 누르면 새 줄은 없다. 앞서 누른 탭이 있으면 거둔다: 같은 주소 이동이 앞의 이동을 버려 경로가 바뀌지 않으므로
    // (Next 15.5 app-router-instance) 그대로 두면 누른 탭과 80% 줄이 남는다. 누른 탭이 없으면 아무것도 바뀌지 않는다
    if (href === pathname) {
      setPending(null)
      return
    }
    setPending({ href, from: pathname })
    setPresses((n) => n + 1)
  }

  // 새 문서로 떠난 뒤(입지 분석을 오가는 링크) 뒤로 가기로 이 화면이 그대로 돌아오면(뒤로 가기 캐시, pageshow persisted)
  // 경로가 그대로라 누른 탭·불러오기 줄이 남는다 → 거둔다
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) setPending(null)
    }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [])

  // 지금 탭(누른 탭이 있으면 그 탭)이 밀려 안 보이면 보이게 옮긴다(AC-008.7)
  useEffect(() => {
    const strip = stripRef.current
    revealInStrip(strip, strip?.querySelector('[data-pending="true"]') ?? strip?.querySelector('[aria-current="page"]'))
  }, [pathname, pendingHref])

  return (
    <nav aria-label="메뉴" className="relative flex border-b border-line bg-surface">
      {/* 탭 줄 감싸개(AC-2702.4): 1024px 이상 본문과 같은 1280 폭 가운데. position이 없어 폰 판의 기준은 nav 그대로다 */}
      <div className="flex min-w-0 flex-1 lg:mx-auto lg:max-w-7xl lg:group-has-[[data-wide-page]]/app:max-w-none">
        {/* 탭 띠: 주요 메뉴 여섯(AC-2702.1·AC-5801.2). 1024px 미만은 이것만 옆으로 밀린다. 키보드 초점이 간 탭도 보이게 띠만 민다(ui-90 AC-416.5) */}
        <div ref={stripRef} className="min-w-0 flex-1 max-lg:overflow-x-auto max-lg:[scrollbar-width:thin]">
          {/* 탭 줄 하나(감싸개를 더하지 않는다). 1024px 이상은 위쪽 띠 안쪽과 같은 1280 폭·좌우 24px로 가운데에 놓인다.
              첫 탭은 왼쪽으로 12px 당겨 글자가 로고 왼쪽 끝과 맞는다(모든 폭, 시안의 폰 줄도 글자 16px로 맞음) */}
          <div className="flex w-max min-w-full items-stretch px-6 max-md:px-4 lg:mx-auto lg:w-full lg:min-w-0 lg:max-w-7xl lg:group-has-[[data-wide-page]]/app:max-w-none [&>:first-child]:-ml-3">
            {tabs.map((item) => (
              <TabLink
                key={item.label}
                label={item.label}
                href={item.path}
                from={pathname}
                current={current === item.label}
                shown={pendingHref === null ? current === item.label : pendingHref === item.path}
                pending={pendingHref === item.path}
                onPress={press}
                onFocus={(e) => revealInStrip(stripRef.current, e.currentTarget)}
                badge={badgeOf(item.path, desk)}
              />
            ))}
          </div>
        </div>
        {!desk && <MoreMenu pathname={pathname} current={current} shown={shownLabel} pending={pendingLabel} onPress={press} isAdmin={isAdmin} hidden={hidden} />}
      </div>
      <LoadBar key={presses} active={pending !== null} />
    </nav>
  )
}
