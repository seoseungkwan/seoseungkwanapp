'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { SignOutButton } from '@/components/auth/SignOutButton'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'

// 위쪽 띠 오른쪽 계정 단추와 메뉴 (AC-008.3·008.7, b2b-redesign AC-218.3, UI_GUIDE '앱 화면' 앱 틀·폰).
// 단추에는 로그인한 구글 이메일(plan.md §6-4, design.md '계정 단추에는 이메일'). 폰은 44×44 아이콘만, 이메일은 aria-label.
// 메뉴: 머리(이메일·병원 이름·관리자면 "관리자 계정" 칩) + [로그아웃]. 바깥 누름·Esc로 닫힌다

// PC: 보조 작은 단추(32px·1px line-strong·4px·small 500) 안에 사람 아이콘 16 · 이메일 · 아래 화살표.
// 폰: 44×44 아이콘 단추·테두리 없음·아이콘 ink-2
const buttonClass = `${ds.button.secondarySmall} max-md:size-11 max-md:justify-center max-md:border-transparent max-md:px-0 max-md:text-ink-2`
// 메뉴 항목: 36px(폰 44px), 올림 canvas. 초점 고리는 떠 있는 층 안쪽에
const itemClass =
  'flex h-9 w-full cursor-pointer items-center gap-2 rounded-control px-3 text-left text-body text-ink hover:bg-canvas focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent max-md:h-11'

export function AccountMenu({ email, hospitalName, isAdmin }: { email: string; hospitalName: string; isAdmin: boolean }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const headId = useId()

  useEffect(() => {
    if (!open) return
    // [로그아웃]은 SignOutButton(<button>)을 그대로 쓴다 → 메뉴 안 항목 역할을 주고 첫 항목에 초점(메뉴 패턴)
    const item = menuRef.current?.querySelector('button')
    item?.setAttribute('role', 'menuitem')
    item?.focus()

    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      } else if (e.key === 'Tab') {
        setOpen(false) // 초점이 메뉴 밖으로 나가면 닫는다
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
        {/* 1024px 미만(시각이 같이 보이는 좁은 PC 띠)에서는 128px로 줄여 병원 이름 자리를 남긴다. 넘치면 말줄임(이름은 aria-label에 전체) */}
        <span className="max-w-32 truncate max-md:hidden lg:max-w-60">{email}</span>
        <Icon name="chev" className="shrink-0 max-md:hidden" />
      </button>

      {open && (
        // 떠 있는 층: 폭 240px·안쪽 4px·1px 선·8px 모서리·shadow-float. 단추 오른쪽 끝에 맞춘다(폰에서도 화면 좌우 16px 안쪽)
        <div className={`${ds.layer} absolute top-full right-0 z-20 mt-1 w-60 p-1`}>
          <div id={headId} className="flex flex-col gap-0.5 px-3 pt-2 pb-3">
            <span className="truncate text-small font-medium text-ink">{email}</span>
            <span className="truncate text-caption text-muted">{hospitalName}</span>
            {isAdmin && <span className={`${ds.chip.neutral} mt-1.5 self-start`}>관리자 계정</span>}
          </div>
          <div ref={menuRef} id={menuId} role="menu" aria-label="계정" aria-describedby={headId} className="border-t border-line pt-1">
            <SignOutButton className={itemClass}>
              <svg aria-hidden="true" className="shrink-0 text-ink-2" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
                <path d="M10 8l-4 4 4 4" />
                <path d="M6 12h10" />
              </svg>
              로그아웃
            </SignOutButton>
          </div>
        </div>
      )}
    </div>
  )
}
