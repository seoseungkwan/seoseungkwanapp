import type { ReactNode } from 'react'
import { LogoMark } from '@/components/common/LogoMark'

// 로그인 전후 화면(로그인·가입 신청·승인 대기)의 틀: 위쪽 흰 띠(로고 · [서비스 이름]) + 본문.
// 앱 초기화 범위(.app-ui)·canvas 바탕, 띠는 앱 틀과 같은 64px(폰 48px)·아래 1px 선(UI_GUIDE '앱 화면', design.md '이미 만든 화면 다시 입히기').
// 띠에는 메뉴가 없다(목업). 로고는 랜딩 SiteHeader와 같은 LogoMark이고 LogoMark가 정한 고정 두 색(로고 C③)으로 그리며 읽지 않는다.
// headerEnd = 띠 오른쪽 끝에 둘 것(승인 대기·거절 화면의 [로그아웃], 목업 Pending·Rejected). 없으면 아무것도 그리지 않는다
export function AuthFrame({ children, headerEnd }: { children: ReactNode; headerEnd?: ReactNode }) {
  return (
    <div className="app-ui flex min-h-dvh flex-col bg-canvas text-ink">
      <header className="border-b border-line bg-surface">
        <div className="flex h-16 items-center gap-2.5 px-6 max-md:h-12 max-md:px-4">
          <LogoMark size={26} className="shrink-0" />
          <span className="whitespace-nowrap text-logo font-semibold text-ink">[서비스 이름]</span>
          {headerEnd != null && <div className="ml-auto flex items-center">{headerEnd}</div>}
        </div>
      </header>
      {/* 본문은 가운데 한 줄. 안에 넣는 화면이 폭을 정한다 */}
      <main className="flex flex-1 flex-col items-center px-6 pt-16 pb-16 max-md:px-4 max-md:pt-6 max-md:pb-10">
        {children}
      </main>
    </div>
  )
}
