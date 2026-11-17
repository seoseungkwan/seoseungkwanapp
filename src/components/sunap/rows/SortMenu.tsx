'use client'

import { useEffect, useRef, type RefObject } from 'react'
import { ds } from '@/components/ui/classes'
import type { Anchor } from './Pop'

// 장부 [다음 예약] 제목 아래 세우는 기준 목록(spec sunap-sort AC-5302.2, 시안 .smenu) [장부 줄 화면 울타리 안 — React만].
// 표가 overflow-x-auto 안이라 absolute는 잘린다 → 누른 제목 아래에 fixed로 뜬다(Pop과 같은 anchorOf 자리, 바탕 흐림 없음).
// 열면 지금 고른 항목에 초점, ↓·↑로 항목 사이를 돈다. Esc(초점은 제목 단추로)·바깥 누름·Tab이면 닫는다(계정 메뉴와 같다)

/** 다음 예약 세우는 기준(null = 접수 순) */
export type RsvSortPick = { by: 'kind' | 'date'; dir: 'asc' | 'desc' } | null

const ITEMS: { pick: RsvSortPick; label: string; sub: string }[] = [
  // 종류 순은 설정 목록 차례(spec sunap-kinds AC-5503.5) — 장부 줄 화면이 sortLedger에 그 차례를 넘긴다
  { pick: { by: 'kind', dir: 'asc' }, label: '종류 순 ▲', sub: '설정에 둔 종류 순서대로' },
  { pick: { by: 'kind', dir: 'desc' }, label: '종류 순 ▼', sub: '거꾸로' },
  { pick: { by: 'date', dir: 'asc' }, label: '날짜 순 ▲', sub: '가까운 예약부터' },
  { pick: { by: 'date', dir: 'desc' }, label: '날짜 순 ▼', sub: '먼 예약부터' },
  { pick: null, label: '접수 순', sub: '처음 순서로' },
]
// 목록 폭 220px(min-w-55). 화면 좌우 16px 안쪽에 둔다
const WIDTH = 220
const same = (a: RsvSortPick, b: RsvSortPick) => (a === null || b === null ? a === b : a.by === b.by && a.dir === b.dir)
const itemsOf = (menu: HTMLElement | null) => Array.from(menu?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])

// 항목: 올림·고른 것 accent-soft, 고른 것은 accent 600. 초점 고리는 떠 있는 층 안쪽에
const ITEM =
  'flex w-full cursor-pointer items-center justify-between gap-3 rounded-control px-3 py-1.5 text-left text-small text-ink hover:bg-accent-soft aria-checked:bg-accent-soft aria-checked:font-semibold aria-checked:text-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent'

export function SortMenu({
  id,
  labelledBy,
  anchor,
  current,
  trigger,
  onPick,
  onClose,
}: {
  id: string
  /** 목록을 여는 제목 단추 id */
  labelledBy: string
  anchor: Anchor
  current: RsvSortPick
  /** 제목 단추: 그 위 누름은 바깥 누름이 아니다(단추가 열고 닫는다). 닫을 때 초점이 돌아간다 */
  trigger: RefObject<HTMLButtonElement | null>
  onPick(pick: RsvSortPick): void
  onClose(): void
}) {
  const menuRef = useRef<HTMLDivElement>(null)

  // 열 때 지금 고른 항목에 초점
  useEffect(() => {
    itemsOf(menuRef.current)
      .find((item) => item.getAttribute('aria-checked') === 'true')
      ?.focus()
  }, [])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!menuRef.current?.contains(target) && !trigger.current?.contains(target)) onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        trigger.current?.focus()
        onClose()
      } else if (event.key === 'Tab') {
        onClose()
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const list = itemsOf(menuRef.current)
        const at = list.indexOf(document.activeElement as HTMLElement)
        const step = event.key === 'ArrowDown' ? 1 : -1
        list[at === -1 ? 0 : (at + step + list.length) % list.length]?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [trigger, onClose])

  const left = Math.max(16, Math.min(anchor.left, window.innerWidth - WIDTH - 16))
  return (
    <div
      ref={menuRef}
      id={id}
      role="menu"
      aria-labelledby={labelledBy}
      style={{ top: anchor.bottom + 4, left }}
      className={`${ds.layer} fixed z-30 grid min-w-55 gap-0.5 p-1.5`}
    >
      {ITEMS.map(({ pick, label, sub }) => (
        <button
          key={label}
          type="button"
          role="menuitemradio"
          aria-checked={same(pick, current)}
          className={ITEM}
          onClick={() => {
            onPick(pick)
            trigger.current?.focus()
          }}
        >
          <span>{label}</span>
          <small className="text-caption text-muted">{sub}</small>
        </button>
      ))}
    </div>
  )
}
