'use client'

import type { ReactNode } from 'react'
import { signOutAndLeave } from '@/lib/auth/leave'

// 세션을 끊고 /login을 새로 연다(AC-003.6) → 메모리에 있던 화면 상태까지 사라진다. 파일럿 SignOutButton 이식.
// 끊기·쿠키 지우기·다른 탭 알림은 자동 로그아웃(IdleLogout)과 같은 signOutAndLeave() 한 곳이 한다(AC-403.4)

// [로그아웃]·[다른 계정으로 로그인]. 모양은 쓰는 곳이 className으로 정한다(오류 화면 Secondary, 승인 대기 머리띠 글자 단추 등)
export function SignOutButton({ className, children = '로그아웃' }: { className?: string; children?: ReactNode }) {
  return (
    <button type="button" className={className} onClick={() => void signOutAndLeave()}>
      {children}
    </button>
  )
}
