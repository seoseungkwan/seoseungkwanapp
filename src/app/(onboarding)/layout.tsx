import type { ReactNode } from 'react'
import { IdleLogout } from '@/components/shell/IdleLogout'

// 가입 신청(/signup)·승인 대기(/pending) 묶음 틀(REQ-402). 로그인한 사람만 보는 화면이라 앱 화면처럼 30분 자동 로그아웃을 붙인다.
// 로그인했는지는 각 페이지가 그리기 전에 guard로 본다 → 여기서는 자동 로그아웃만 더하고 페이지는 감싸지 않고 그대로 그린다
export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <IdleLogout />
      {children}
    </>
  )
}
