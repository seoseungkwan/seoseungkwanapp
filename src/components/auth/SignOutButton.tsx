'use client'

import type { ReactNode } from 'react'
import { stopAdminView } from '@/lib/auth/adminView'
import { supabaseBrowser } from '@/lib/supabase/browser'
import { dropViewKey, readViewKey } from '@/lib/supabase/viewKey'

// 세션을 끊고 /login을 새로 연다(AC-003.6) → 메모리에 있던 화면 상태까지 사라진다. 파일럿 SignOutButton 이식.
// 끊기 전에 다른 의원 보기 쿠키(ssk_view)를 지운다(admin-view AC-8006.5 — 다음 로그인이 보던 의원으로 이어지지 않게).
// 보는 중이면 그 앞에 띠 [내 의원으로]처럼 보기를 끝낸다(stopAdminView 한 번, 실패해도 — 보기 열쇠 머리가 남아 있을 때 불러야 그 줄이 끝난다)
async function signOutAndLeave() {
  if (readViewKey(document.cookie) !== null) await stopAdminView().catch(() => {})
  dropViewKey()
  try {
    await supabaseBrowser().auth.signOut() // 기본(전역) → 갱신 토큰까지 끊는다. 돌려준 오류도 보지 않는다
  } catch {
    // 끊기가 실패해도(인터넷·열쇠 없음) /login으로 간다. 오류 내용은 보이지 않는다
  }
  window.location.assign('/login')
}

// [로그아웃]·[다른 계정으로 로그인]. 모양은 쓰는 곳이 className으로 정한다(오류 화면 Secondary, 승인 대기 머리띠 글자 단추 등)
export function SignOutButton({ className, children = '로그아웃' }: { className?: string; children?: ReactNode }) {
  return (
    <button type="button" className={className} onClick={() => void signOutAndLeave()}>
      {children}
    </button>
  )
}
