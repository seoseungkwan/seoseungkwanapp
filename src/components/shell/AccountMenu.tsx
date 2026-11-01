'use client'

import Link from 'next/link'
import { useEffect, useId, useRef, useState } from 'react'
import { SignOutButton } from '@/components/auth/SignOutButton'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import { ADMIN_LINK } from './menu'

// 위쪽 띠 오른쪽 계정 단추와 메뉴 (AC-008.3·008.7, b2b-redesign AC-218.3, UI_GUIDE '앱 화면' 앱 틀·폰).
// 단추에는 로그인한 구글 이메일(plan.md §6-4, design.md '계정 단추에는 이메일'). 폰은 44×44 아이콘만, 이메일은 aria-label.
// 메뉴: 머리(이메일·병원 이름·관리자면 "관리자 계정" 칩) + 항목([가입 승인]은 관리자만, tab-frame REQ-304, 숫자·칩 없음 ui-90 AC-417.2 → [로그아웃], 꾸밈 Icon logout ui-90 AC-416.7).
// 열면 첫 항목에 초점, ↓·↑로 항목 사이를 돈다. 바깥 누름·Esc·Tab으로 닫힌다

// PC: 보조 작은 단추(32px·1px line-strong·4px·small 500) 안에 사람 아이콘 16 · 이메일 · 아래 화살표.
// 폰: 44×44 아이콘 단추·테두리 없음·아이콘 ink-2. 올림과 열린 동안 바탕 canvas(색 150ms, UI_GUIDE '짧은 반응 허용')
const buttonClass = `${ds.button.secondarySmall} transition aria-expanded:bg-canvas max-md:size-11 max-md:justify-center max-md:border-transparent max-md:px-0 max-md:text-ink-2`
// 메뉴 항목: 36px(폰 44px), 올림 canvas(150ms), 누름 아래 1px. 초점 고리는 떠 있는 층 안쪽에
const itemClass =
  'flex h-9 w-full cursor-pointer items-center gap-2 rounded-control px-3 text-left text-body text-ink no-underline transition hover:bg-canvas active:translate-y-px focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent max-md:h-11'

export function AccountMenu({ email, hospitalName, isAdmin }: { email: string; hospitalName: string; isAdmin: boolean }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const headId = useId()

  useEffect(() => {
    if (!open) return
    // [로그아웃]은 SignOutButton(<button>)을 그대로 쓴다 → 메뉴 안 항목 역할을 준다([가입 승인] 링크는 처음부터 menuitem)
    menuRef.current?.querySelector('button')?.setAttribute('role', 'menuitem')
    const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
    // 열 때 첫 항목에 초점(메뉴 패턴)
    items()[0]?.focus()

    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      } else if (e.key === 'Tab') {
        setOpen(false) // 초점이 메뉴 밖으로 나가면 닫는다
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        // ↓·↑: 다음·이전 항목으로, 끝에서 처음(처음에서 끝)으로 돈다
        e.preventDefault()
        const list = items()
        if (list.length === 0) return
        const at = list.indexOf(document.activeElement as HTMLElement)
        const step = e.key === 'ArrowDown' ? 1 : -1
        const next = at === -1 ? (step === 1 ? 0 : list.length - 1) : (at + step + list.length) % list.length
        list[next]?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={`${email} 계정 메뉴`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        className={buttonClass}
      >
        <Icon name="user" className="shrink-0" />
        {/* 768px 이상은 최대 240px이고 그보다 길 때만 말줄임이다(ui-90 AC-416.6, 이름은 aria-label에 전체). 768px 미만은 아이콘만 */}
        <span className="max-w-32 truncate max-md:hidden md:max-w-60">{email}</span>
        <Icon name="chev" className="shrink-0 max-md:hidden" />
      </button>

      {open && (
        // 떠 있는 층: 폭 240px·안쪽 4px·1px 선·8px 모서리·shadow-float. 단추 오른쪽 끝에 맞춘다(폰에서도 화면 좌우 16px 안쪽).
        // 열릴 때만 그리므로 나타날 때만 투명·위 4px에서 제자리로 150ms(starting:) 움직이고, 닫으면 바로 사라진다
        <div className={`${ds.layer} absolute top-full right-0 z-20 mt-1 w-60 p-1 transition starting:opacity-0 starting:-translate-y-1`}>
          <div id={headId} className="flex flex-col gap-0.5 px-3 pt-2 pb-3">
            <span className="truncate text-small font-medium text-ink">{email}</span>
            <span className="truncate text-caption text-muted">{hospitalName}</span>
            {isAdmin && <span className={`${ds.chip.neutral} mt-1.5 self-start`}>관리자 계정</span>}
          </div>
          <div ref={menuRef} id={menuId} role="menu" aria-label="계정" aria-describedby={headId} className="border-t border-line pt-1">
            {isAdmin && (
              // 관리자만: 가입 승인 화면(/admin). 누르면 메뉴를 닫고 링크로 간다
              <Link href={ADMIN_LINK.href} role="menuitem" className={itemClass} onClick={() => setOpen(false)}>
                <Icon name="userCheck" className="shrink-0 text-ink-2" />
                {ADMIN_LINK.label}
              </Link>
            )}
            <SignOutButton className={itemClass}>
              <Icon name="logout" className="shrink-0 text-ink-2" />
              로그아웃
            </SignOutButton>
          </div>
        </div>
      )}
    </div>
  )
}
