'use client'

import Link from 'next/link'
import { useEffect, useId, useRef, useState, type MouseEvent } from 'react'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import { MENU, type MenuLabel } from './menu'

// [전체 메뉴] (ui-90 REQ-416 AC-416.1~416.3, UI_GUIDE '앱 틀' [전체 메뉴], 시안 docs/mockups/ui-90/app/gen.py tabs·all_panel, CSS .allbtn·.allp*).
// 1024px 미만(768px 폭도 같다)에서 탭 띠 오른쪽 끝, 띠 밖에 단추. 누르면 탭 줄 바로 아래에 모든 탭을 두 칸으로 펼친 판이 뜬다.
// TabBar의 nav(relative) 안에 단추와 판을 그대로 둔다(감싸개 없음) → 판은 nav 폭 전체로 탭 줄 바로 아래(top-full)에 놓인다.
// 판은 열릴 때만 그린다: 나타날 때만 흐림 → 보임(starting:, 기본 transition 150ms)이고 닫으면 바로 사라진다. 꺾쇠는 열린 동안 180° 돈다.
// 닫힘: 단추 다시 누름 · Esc(초점은 단추로) · 판 안 링크 누름 · 판 밖 누름 · 경로 바뀜. 열 때 초점은 단추에 남는다(펼침 단추)

// 머리 글자의 숫자는 MENU에서 센다(탭이 화면을 가지면 menu.ts의 ready만 바꾼다)
const TOTAL = MENU.length
const NOT_READY = MENU.filter((m) => !m.ready).length

// 단추: 44px(띠 높이만큼 늘어난다)·좌우 12px·왼쪽 1px line·body accent 600, 올림 canvas(150ms). 키보드 초점은 단추 안쪽 2px accent 고리
const buttonClass =
  'inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap border-l border-line px-3 text-body font-semibold text-accent transition hover:bg-canvas focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent lg:hidden'
// 판: surface·아래 1px line·shadow-float(떠 있는 층). 안쪽 위 4px·좌우 16px(768px 이상 24px, 본문 여백과 같다)·아래 16px.
// top-full은 nav 아래 1px 선 위에서 시작하므로 1px 내려(mt-px) 탭 띠와 판 머리 사이 선이 보이게 한다(시안)
const panelClass =
  'absolute inset-x-0 top-full mt-px border-b border-line bg-surface px-4 pt-1 pb-4 shadow-float transition starting:opacity-0 md:px-6 lg:hidden'
// 판 링크: 44px·좌우 4px·아래 1px line·body, 올림 canvas·누름 아래 1px(150ms)
const itemBase =
  'flex h-11 items-center justify-between gap-1.5 border-b border-line px-1 text-body no-underline transition hover:bg-canvas active:translate-y-px focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent'
const itemIdle = `${itemBase} font-medium text-ink`
// 지금 탭: accent-strong 600 + 왼쪽 2px accent 막대(20px, 안쪽 여백만큼 왼쪽으로 당긴다)
const itemCurrent = `${itemBase} font-semibold text-accent-strong before:-ml-1 before:h-5 before:w-0.5 before:shrink-0 before:bg-accent`

export function AllMenu({
  pathname,
  current,
  onPress,
}: {
  /** 지금 경로. 바뀌면 판을 닫는다 */
  pathname: string
  /** 지금 탭 이름(menu.ts currentMenuLabel). 없으면 null(/admin) */
  current: MenuLabel | null
  /** 판 링크 누름 — TabBar가 누른 탭(pendingPath)을 정한다 */
  onPress: (e: MouseEvent<HTMLAnchorElement>, href: string) => void
}) {
  // 판을 연 경로. 지금 경로에서 연 판만 열린 판이다 → 경로가 바뀌면 닫히고, 그 경로로 돌아와도 다시 열리지 않게 지운다
  const [openAt, setOpenAt] = useState<string | null>(null)
  if (openAt !== null && openAt !== pathname) setOpenAt(null)
  const open = openAt === pathname
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (!buttonRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpenAt(null)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpenAt(null)
      buttonRef.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpenAt(open ? null : pathname)}
        className={buttonClass}
      >
        전체 메뉴
        <Icon name="chev" className={open ? 'shrink-0 rotate-180 transition' : 'shrink-0 transition'} />
      </button>
      {open && (
        <div ref={panelRef} id={panelId} className={panelClass}>
          <p className="flex justify-between py-2 text-small text-muted">
            <span>{`모든 탭 ${TOTAL}개`}</span>
            <span>{`준비 중 ${NOT_READY}개`}</span>
          </p>
          <ul className="grid list-none grid-cols-2 gap-x-4 border-t border-line">
            {MENU.map((item) => (
              <li key={item.label}>
                <Link
                  href={item.path}
                  aria-current={current === item.label ? 'page' : undefined}
                  onClick={(e) => {
                    onPress(e, item.path)
                    setOpenAt(null)
                  }}
                  className={current === item.label ? itemCurrent : itemIdle}
                >
                  <span className="flex-1">{item.label}</span>
                  {!item.ready && <span className={ds.chip.neutral}>준비 중</span>}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
