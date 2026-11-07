'use client'

import Link from 'next/link'
import { useEffect, useId, useRef, useState, type MouseEvent } from 'react'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import { MORE_MENU, type MenuLabel } from './menu'

// [더보기] (dashboard-ux REQ-2702 AC-2702.1~2702.5, design.md §3, 시안 docs/mockups/dashboard-ux .more·.morewrap·.morepanel).
// 탭 띠 오른쪽(띠 밖)에 모든 폭에서 보이는 단추. 누르면 주요 메뉴 다섯 밖의 나머지(MORE_MENU, MENU 차례)를 판으로 펼친다.
// 지금 경로(또는 방금 누른 주소)가 판 안 항목이면 단추가 지금 탭 모양이고 글자가 "더보기 · {이름}"이다. 판 안 링크를 누르면 단추에 data-pending.
// 판 자리: 768px 이상은 판 오른쪽 끝을 본문 오른쪽 정렬선에 맞춘 320px 떠 있는 판(화면 폭 − 좌우 24px을 넘지 않는다, AC-2702.4 2026-11-08).
// 감싸개를 오른쪽 12px 띄워(md:mr-3) 단추 글자 끝(단추 안쪽 12px)이 그 선에 오고, 판은 감싸개 끝에서 12px 안쪽(md:right-3)이다.
// 768px 미만은 감싸개가 static이라 판이 nav(relative) 기준으로 탭 줄 바로 아래 전체 폭 두 칸이다.
// 판은 열릴 때만 그린다: 나타날 때만 흐림 → 보임(starting:, 기본 transition 150ms)이고 닫으면 바로 사라진다. 꺾쇠는 열린 동안 180° 돈다.
// 닫힘: 단추 다시 누름 · Esc(초점은 단추로) · 판 안 링크 누름 · 판 밖 누름 · 경로 바뀜. 열 때 초점은 단추에 남는다(펼침 단추)

// 머리 글자의 숫자는 MORE_MENU에서 센다(탭이 화면을 가지면 menu.ts의 ready만 바꾼다)
const OTHERS = MORE_MENU.length
const NOT_READY = MORE_MENU.filter((m) => !m.ready).length

// 감싸개: 단추가 nav 높이만큼 늘어난다. 768px 미만은 static → 판의 기준이 nav가 된다(그 폭 배치는 그대로)
const wrapClass = 'relative flex shrink-0 md:mr-3 max-md:static'
// 단추: 탭과 같은 크기(44px·좌우 12px·body), 키보드 초점은 단추 안쪽 2px accent 고리(4px 모서리). 올림 글자색은 짧게 바뀐다
const buttonBase =
  'relative inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-control px-3 text-body transition focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent'
// 기본: 탭 기본 모양(ink-2 500, 올림 ink)
const buttonIdle = `${buttonBase} font-medium text-ink-2 hover:text-ink`
// 지금(또는 방금 누른) 항목이 판 안에 있다: 탭 지금 모양(ink 600 + 아래 2px accent 밑줄, 좌우 12px 안쪽)
const buttonCurrent = `${buttonBase} font-semibold text-ink after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-accent`
// 판: surface·shadow-float(떠 있는 층). top-full은 nav 아래 1px 선 위에서 시작하므로 1px 내려(mt-px) 선이 보이게 한다.
// 768px 이상 320px·8px 모서리·1px line 테두리·안쪽 위 4px·좌우 16px·아래 12px / 768px 미만 nav 전체 폭·아래 1px line·아래 16px
const panelClass =
  'absolute top-full right-0 mt-px md:right-3 border-line bg-surface px-4 pt-1 shadow-float transition starting:opacity-0 md:w-80 md:max-w-[calc(100vw-3rem)] md:rounded-float md:border md:pb-3 max-md:inset-x-0 max-md:border-b max-md:pb-4'
// 목록: 위 1px line. 768px 이상 한 칸(마지막 항목 아래 선 없음), 미만 두 칸(칸 사이 16px)
const listClass = 'grid list-none border-t border-line max-md:grid-cols-2 max-md:gap-x-4'
const itemWrap = 'md:last:*:border-b-0'
// 판 링크: 44px·좌우 4px·아래 1px line·body, 올림 canvas·누름 아래 1px(150ms)
const itemBase =
  'flex h-11 items-center justify-between gap-1.5 border-b border-line px-1 text-body no-underline transition hover:bg-canvas active:translate-y-px focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent'
const itemIdle = `${itemBase} font-medium text-ink`
// 지금 항목: accent-strong 600 + 왼쪽 2px accent 막대(20px, 안쪽 여백만큼 왼쪽으로 당긴다)
const itemCurrent = `${itemBase} font-semibold text-accent-strong before:-ml-1 before:h-5 before:w-0.5 before:shrink-0 before:bg-accent`

const inMore = (label: MenuLabel | null) => MORE_MENU.find((m) => m.label === label) ?? null

export function MoreMenu({
  pathname,
  current,
  shown,
  pending,
  onPress,
}: {
  /** 지금 경로. 바뀌면 판을 닫는다 */
  pathname: string
  /** 지금 탭 이름(menu.ts currentMenuLabel). 판 안 aria-current. 없으면 null(/admin) */
  current: MenuLabel | null
  /** 지금 탭 모양으로 보일 이름(누른 탭이 있으면 그것, 없으면 지금 탭) */
  shown: MenuLabel | null
  /** 방금 누른 탭 이름(없으면 null). 판 안 항목이면 단추에 data-pending */
  pending: MenuLabel | null
  /** 판 링크 누름 — TabBar가 누른 탭을 정한다 */
  onPress: (e: MouseEvent<HTMLAnchorElement>, href: string) => void
}) {
  // 판을 연 경로. 지금 경로에서 연 판만 열린 판이다 → 경로가 바뀌면 닫히고, 그 경로로 돌아와도 다시 열리지 않게 지운다
  const [openAt, setOpenAt] = useState<string | null>(null)
  if (openAt !== null && openAt !== pathname) setOpenAt(null)
  const open = openAt === pathname
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const shownItem = inMore(shown)

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
    <div className={wrapClass}>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        data-pending={inMore(pending) !== null ? 'true' : undefined}
        onClick={() => setOpenAt(open ? null : pathname)}
        className={shownItem !== null ? buttonCurrent : buttonIdle}
      >
        {shownItem !== null ? `더보기 · ${shownItem.label}` : '더보기'}
        <Icon name="chev" className={open ? 'shrink-0 rotate-180 transition' : 'shrink-0 transition'} />
      </button>
      {open && (
        <div ref={panelRef} id={panelId} className={panelClass}>
          <p className="flex justify-between py-2 text-small text-muted">
            <span>{`다른 메뉴 ${OTHERS}개`}</span>
            <span>{`준비 중 ${NOT_READY}개`}</span>
          </p>
          <ul className={listClass}>
            {MORE_MENU.map((item) => (
              <li key={item.label} className={itemWrap}>
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
                  {/* 칩은 링크 글자 안이라 화면 읽기가 이름과 함께 "… 준비 중"으로 읽는다(사이 빈칸) */}
                  {!item.ready && (
                    <>
                      {' '}
                      <span className={ds.chip.neutral}>준비 중</span>
                    </>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
