import type { ReactNode } from 'react'

// 로그인 전후 화면(로그인·가입 신청·승인 대기)의 틀: 위쪽 흰 띠(로고 · [서비스 이름]) + 본문.
// 앱 초기화 범위(.app-ui)·canvas 바탕, 띠는 앱 틀과 같은 64px(폰 48px)·아래 1px 선(UI_GUIDE '앱 화면', design.md '이미 만든 화면 다시 입히기').
// 띠에는 메뉴가 없다(목업). 로고는 랜딩 SiteHeader와 같은 그림이고 읽지 않는다(그림 안 색은 강조색 규칙 밖).
// headerEnd = 띠 오른쪽 끝에 둘 것(승인 대기·거절 화면의 [로그아웃], 목업 Pending·Rejected). 없으면 아무것도 그리지 않는다
export function AuthFrame({ children, headerEnd }: { children: ReactNode; headerEnd?: ReactNode }) {
  return (
    <div className="app-ui flex min-h-dvh flex-col bg-canvas text-ink">
      <header className="border-b border-line bg-surface">
        <div className="flex h-16 items-center gap-2.5 px-6 max-md:h-12 max-md:px-4">
          <svg aria-hidden="true" className="shrink-0" width="26" height="26" viewBox="0 0 30 30" fill="none">
            <rect x="9" y="3" width="12" height="6" rx="3" stroke="#14C8BA" strokeWidth="2.2" />
            <rect x="11" y="12" width="12" height="6" rx="3" stroke="#14C8BA" strokeWidth="2.2" />
            <rect x="8" y="21" width="12" height="6" rx="3" stroke="#6D5DF5" strokeWidth="2.2" />
          </svg>
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
