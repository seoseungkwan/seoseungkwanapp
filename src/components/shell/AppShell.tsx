import type { ReactNode } from 'react'
import { LogoMark } from '@/components/common/LogoMark'
import { AccountMenu } from './AccountMenu'
import { KstClock } from './KstClock'
import { TabBar } from './TabBar'

// 앱 화면 틀 (REQ-008, 시안 A, UI_GUIDE '앱 화면' 앱 틀·폰). 앱 초기화 범위(.app-ui)·canvas 바탕.
// 위쪽 띠(흰·64px·좌우 24px, 위에 붙어 따라옴): 로고·[서비스 이름]·세로 선·병원 이름 | 한국 시각·계정 단추.
// 그 아래 탭 띠(붙지 않음), 그 아래 본문. 폰(<768px): 띠 48px에 로고·병원 이름·계정 단추만, 서랍 없음
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
      <header className="sticky top-0 z-10 border-b border-line bg-surface">
        <div className="flex h-16 items-center justify-between gap-5 px-6 max-md:h-12 max-md:gap-2 max-md:px-4">
          <div className="flex min-w-0 items-center gap-4 max-md:gap-2">
            <div className="flex shrink-0 items-center gap-2.5">
              {/* 로고는 랜딩·인증 화면과 같은 LogoMark(시안의 십자는 자리표시). 한 색으로 띠 글자색 ink를 따르고 읽지 않는다 */}
              <LogoMark size={26} className="shrink-0" />
              <span className="whitespace-nowrap text-logo font-semibold text-ink max-md:hidden">[서비스 이름]</span>
            </div>
            <span aria-hidden="true" className="h-5.5 w-px shrink-0 bg-line max-md:hidden" />
            {/* 넘치면 말줄임. 좁은 PC 띠(768~1023px)에서도 80px 아래로는 줄지 않는다 */}
            <span className="min-w-20 truncate text-lead font-medium text-ink max-md:text-body max-md:font-semibold">
              {hospitalName}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-6">
            <KstClock />
            <AccountMenu email={email} hospitalName={hospitalName} isAdmin={isAdmin} />
          </div>
        </div>
      </header>
      <TabBar isAdmin={isAdmin} />
      <main className="flex-1 px-6 pt-6 pb-7 max-md:px-4 max-md:pt-4">{children}</main>
    </div>
  )
}
