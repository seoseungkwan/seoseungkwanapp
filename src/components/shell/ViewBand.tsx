'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import { stopAdminView } from '@/lib/auth/adminView'
import { dropViewKey, readViewKey } from '@/lib/supabase/viewKey'
import { isAdminScreen } from './viewPaths'
import type { Viewing } from './viewing'

// 다른 의원 보는 중 맨 위 띠 (admin-view REQ-8006 AC-8006.2·AC-8006.5·AC-8006.7, design.md '앱 틀'·'화면 글자', 시안 .band '모양 결정').
// 위에 붙는 묶음(AppShell sticky)의 맨 위. 44px · warning-soft 바탕 + 아래 1px line · 눈 아이콘 warning · 의원 이름 600 · '읽기만' 600 warning ·
// 안내 small ink-2 · 오른쪽 [내 의원으로](ds.button.secondarySmall). 안쪽은 위쪽 띠와 같은 1280 폭·좌우 24px(넓은 화면이면 함께 풀린다).
// 관리자 화면(/admin과 그 아래)에서는 그리지 않는다(보기 상태는 남아 다른 탭으로 가면 다시 보인다).
// data-view-band: 띠가 있을 때만 붙는 자리를 띠만큼 내리는 표시(AppShell 본문 scroll-margin 102 → 147px)

const TEXT = {
  watching: '보는 중',
  readOnly: '읽기만',
  hint: '· 예약·환자·청구 탭과 저장·고치기 단추는 숨겼어요',
  back: '내 의원으로',
}

/** 보기 끝: stopAdminView() 한 번(실패해도) → 보기 쿠키 지움 → 내 의원 대시보드를 새로 연다(클라이언트를 머리 없이 다시 만든다) */
export async function leaveView(): Promise<void> {
  await stopAdminView().catch(() => {})
  dropViewKey()
  window.location.assign('/dashboard')
}

export function ViewBand({ viewing }: { viewing: Viewing }) {
  const pathname = usePathname() ?? ''
  const [busy, setBusy] = useState(false)
  const pressed = useRef(false)

  if (isAdminScreen(pathname)) return null

  const back = () => {
    if (pressed.current) return // 끝내는 동안 다시 눌러도 한 번만
    pressed.current = true
    setBusy(true)
    void leaveView()
  }

  return (
    <div role="status" data-view-band="" className="border-b border-line bg-warning-soft">
      <div className="mx-auto flex h-11 w-full max-w-7xl items-center gap-2 px-6 lg:group-has-[[data-wide-page]]/app:max-w-none">
        <Icon name="eye" className="shrink-0 text-warning" />
        <p className="min-w-0 truncate text-body text-ink">
          <b className="font-semibold">{viewing.name}</b> {TEXT.watching} · <span className="font-semibold text-warning">{TEXT.readOnly}</span>
        </p>
        <p className="min-w-0 truncate text-small text-ink-2">{TEXT.hint}</p>
        <button type="button" aria-busy={busy || undefined} onClick={back} className={`${ds.button.secondarySmall} ml-auto`}>
          {TEXT.back}
        </button>
      </div>
    </div>
  )
}

// 보는 의원이 없는데(끝났거나 12시간 지남·관리자에서 빠짐) 이 브라우저에 보기 쿠키가 남아 있으면 지우고 한 번 새로 연다(AC-8006.5).
// 남은 쿠키가 있으면 브라우저 Supabase 클라이언트가 머리를 붙이고 쓰기를 거르기 때문이다. 지우기가 먹지 않으면 새로 열지 않는다(끝없이 돌지 않게).
// AppShell이 viewing이 없을 때 그린다. 아무것도 그리지 않는다
export function ViewCookieSync() {
  useEffect(() => {
    if (readViewKey(document.cookie) === null) return
    dropViewKey()
    if (readViewKey(document.cookie) === null) window.location.reload()
  }, [])
  return null
}
