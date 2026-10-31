import type { ReactNode } from 'react'
import { LogoMark } from '@/components/common/LogoMark'
import { AccountMenu } from './AccountMenu'
import { KstClock } from './KstClock'
import { TabBar } from './TabBar'

// 앱 화면 틀 (REQ-008, b2b-redesign AC-218.1, UI_GUIDE '앱 화면' 앱 틀·폰). 앱 초기화 범위(.app-ui)·canvas 바탕.
// 위에 붙는 묶음 하나(sticky·top 0·z 10)에 위쪽 띠와 탭 줄이 함께 있다. 그 아래 본문.
// 위쪽 띠(흰·56px, 폰 48px): 로고·병원 이름 | 한국 시각·계정 단추. [서비스 이름]과 세로 구분선은 두지 않는다(사용자 결정 2026-10-30).
// 안쪽 감싸개 셋(띠·탭 줄·본문)은 같은 1280 폭·가운데·좌우 24px(폰 16px). 폰은 서랍 없음.
// 관리자 여부는 계정 메뉴([가입 승인])에만 넘긴다(탭 줄에는 관리자 탭이 없다, tab-frame REQ-303·304)
export function AppShell({
  hospitalName,
  email,
  isAdmin,
  children,
}: {
  hospitalName: string
  email: string
  isAdmin: boolean
  children: ReactNode
}) {
  return (
    <div className="app-ui flex min-h-dvh flex-col bg-canvas text-ink">
      <div className="sticky top-0 z-10">
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-4 px-6 max-md:h-12 max-md:gap-2 max-md:px-4">
            <div className="flex min-w-0 items-center gap-3 max-md:gap-2">
              {/* 로고는 랜딩·인증 화면과 같은 LogoMark. LogoMark가 정한 고정 두 색(로고 C③)으로 그리고 읽지 않는다 */}
              <LogoMark size={24} className="shrink-0" />
              {/* 넘치면 말줄임. 좁은 PC 띠(768~1023px)에서도 80px 아래로는 줄지 않는다 */}
              <span className="min-w-20 truncate text-subtitle font-semibold text-ink max-md:text-body">{hospitalName}</span>
            </div>
            <div className="flex shrink-0 items-center gap-4">
              <KstClock />
              <AccountMenu email={email} hospitalName={hospitalName} isAdmin={isAdmin} />
            </div>
          </div>
        </header>
        <TabBar />
      </div>
      {/* 페이지 뿌리가 data-page-surface를 달면(대시보드) 본문 전체가 흰 종이 한 장(surface), 아니면 앱 틀 바탕(canvas) 그대로 (AC-303.6) */}
      <main className="flex-1 has-[[data-page-surface]]:bg-surface">
        <div className="mx-auto w-full max-w-7xl px-6 pt-6 pb-12 max-md:px-4 max-md:pt-4 max-md:pb-8">{children}</div>
      </main>
    </div>
  )
}
