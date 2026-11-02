import type { ReactNode } from 'react'
import { LogoMark } from '@/components/common/LogoMark'
import { AccountMenu } from './AccountMenu'
import { KstClock } from './KstClock'
import { TabBar } from './TabBar'

// 건너뛰기 링크 모양(ui-90 AC-403.1, UI_GUIDE '앱 틀' 건너뛰기 링크): 44px·surface·1px line·rounded-float·shadow-float·body 600·2px accent 초점 고리
const SKIP_LINK =
  'sr-only rounded-float border-line bg-surface text-body font-semibold text-ink no-underline shadow-float focus-visible:not-sr-only focus-visible:absolute focus-visible:top-1.5 focus-visible:left-2 focus-visible:z-12 focus-visible:inline-flex focus-visible:h-11 focus-visible:items-center focus-visible:border focus-visible:px-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent print:hidden'

// 앱 화면 틀 (REQ-008, b2b-redesign AC-218.1, UI_GUIDE '앱 화면' 앱 틀·폰). 앱 초기화 범위(.app-ui).
// 바탕 A(ui-90 AC-404.1): 뿌리와 본문 모두 흰 바탕(surface) 한 장이고, 어느 페이지에서나 같다.
// 첫 조작 요소는 건너뛰기 링크(ui-90 AC-403.1) → 본문 main#main.
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
    <div className="app-ui flex min-h-dvh flex-col bg-surface text-ink">
      {/* 평소에는 화면 읽기에만. 키보드 초점이면 왼쪽 위 띠 위에 뜬다(시안 .skip: 위 6px·왼쪽 8px·붙는 묶음 z 10 위).
          not-sr-only가 0으로 돌리는 테두리 두께·안쪽 여백·크기는 초점일 때 다시 준다(같은 변형에서 뒤에 온다) */}
      <a href="#main" className={SKIP_LINK}>
        본문으로 건너뛰기
      </a>
      <div className="sticky top-0 z-10 print:hidden">
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
      {/* 건너뛰기 링크가 가리키는 본문. 초점을 받을 수 있게 tabIndex -1(Tab 차례에는 들지 않는다).
          옮겨도 첫 줄이 붙는 묶음에 가리지 않게 scroll-margin = 묶음 높이: 띠 57(56 + 아래 선 1) + 탭 줄 45(44 + 아래 선 1) = 102px,
          768px 미만은 띠 49(48 + 1) + 45 = 94px. 코드로 옮긴 초점이라 본문 둘레 초점 고리는 그리지 않는다(건너뛰기 링크 자신의 고리는 그대로) */}
      <main
        id="main"
        tabIndex={-1}
        className="flex-1 scroll-mt-25.5 bg-surface focus:outline-none max-md:scroll-mt-23.5"
      >
        <div className="mx-auto w-full max-w-7xl px-6 pt-6 pb-12 max-md:px-4 max-md:pt-4 max-md:pb-8 print:p-0">{children}</div>
      </main>
    </div>
  )
}
