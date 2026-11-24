import type { ReactNode } from 'react'
import { AutoUpload } from '@/components/autoUpload/AutoUpload'
import { LogoMark } from '@/components/common/LogoMark'
import { AccountMenu } from './AccountMenu'
import { DeskGate } from './DeskGate'
import { KstClock } from './KstClock'
import type { MenuPath } from './menu'
import { RoleProvider } from './role'
import { TabBar } from './TabBar'
import { TabGate } from './TabGate'
import { ViewBand, ViewCookieSync } from './ViewBand'
import { ViewGate } from './ViewGate'
import { ViewPicker } from './ViewPicker'
import { VIEW_HIDDEN_TABS } from './viewPaths'
import type { Viewing } from './viewing'

// 건너뛰기 링크 모양(ui-90 AC-403.1, UI_GUIDE '앱 틀' 건너뛰기 링크): 44px·surface·1px line·rounded-float·shadow-float·body 600·2px accent 초점 고리
const SKIP_LINK =
  'sr-only rounded-float border-line bg-surface text-body font-semibold text-ink no-underline shadow-float focus-visible:not-sr-only focus-visible:absolute focus-visible:top-1.5 focus-visible:left-2 focus-visible:z-12 focus-visible:inline-flex focus-visible:h-11 focus-visible:items-center focus-visible:border focus-visible:px-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent print:hidden'

// 본문(main) 모양. 띠가 보이면(보는 중, 관리자 화면 밖) 건너뛰기 자리만 띠 45px(44 + 아래 선 1)만큼 더 내린다
const MAIN_CLASS = 'flex-1 scroll-mt-25.5 bg-surface focus:outline-none max-md:scroll-mt-23.5'

// 앱 화면 틀 (REQ-008, b2b-redesign AC-218.1, UI_GUIDE '앱 화면' 앱 틀·폰). 앱 초기화 범위(.app-ui).
// 바탕 A(ui-90 AC-404.1): 뿌리와 본문 모두 흰 바탕(surface) 한 장이고, 어느 페이지에서나 같다.
// 첫 조작 요소는 건너뛰기 링크(ui-90 AC-403.1) → 본문 main#main.
// 위에 붙는 묶음 하나(sticky·top 0·z 10)에 위쪽 띠와 탭 줄이 함께 있다. 그 아래 본문.
// 위쪽 띠(흰·56px, 폰 48px): 로고·병원 이름 | 한국 시각·계정 단추. [서비스 이름]과 세로 구분선은 두지 않는다(사용자 결정 2026-10-30).
// 안쪽 감싸개 셋(띠·탭 줄·본문)은 같은 1280 폭·가운데·좌우 24px(폰 16px). 폰은 서랍 없음.
// 넓힘(claim-memo-fit REQ-4801): 뿌리는 이름 붙은 묶음 group/app(이름 없는 group은 안쪽 group-hover를 앱 전체에 걸어 쓰지 않는다).
// 1024px 이상에서 앱 안에 [data-wide-page](메모 칸)가 있으면 감싸개 넷(띠 안쪽·탭 줄 둘·본문 안쪽)이 같이 1280 제한을 풀어 왼쪽 끝이 맞는다.
// 관리자 여부는 계정 메뉴([가입 승인])와 탭 줄에 넘긴다. 탭 줄은 [더보기] 판의 입지 분석에만 쓴다(탭 띠에는 관리자 탭이 없다, tab-frame REQ-303·304, specs/location AC-7901.1)
// 데스크 계정(desk 참, desk-feedback REQ-6306): 탭 셋·계정 칩 '데스크', 본문은 RoleProvider desk(useDesk 참) + DeskGate(주소마다 본문·막힌 화면·수납일지로 바꾸기).
// desk가 없거나 거짓이면 지금 그대로다(감싸개 없음)
// 관리자만 보는 탭(hiddenTabs, multi-admin AC-7706.3·AC-7706.4): 레이아웃이 관리자가 아닌 원장·데스크에게 넘긴다. 탭 띠·[더보기]에서 빼고(TabBar),
// 숨긴 탭이 있을 때만 TabGate가 본문을 감싸 숨긴 탭 주소를 /dashboard로 보낸다. 데스크 첫 화면은 DeskGate가 숨기지 않은 첫 데스크 탭으로 정한다.
// 없거나 비면 지금 그대로다(TabGate 없음)
// 다른 의원 보기(viewing, admin-view REQ-8006, design.md '앱 틀'): 레이아웃이 관리자가 이 브라우저에서 보는 의원을 넘긴다. 있으면
// ① 붙는 묶음 맨 위 띠(ViewBand — 관리자 화면 /admin·/admin/compare에서는 그리지 않는다) ② 머리 이름 = 보는 의원(계정 메뉴는 내 메일·내 의원 그대로)
// ③ 탭 띠·[더보기]에서 예약·환자·청구를 뺀다(VIEW_HIDDEN_TABS, [더보기] 안 다른 탭은 그대로) ④ 본문은 ViewGate(그 세 주소는 /dashboard로,
// 그 밖은 ViewingProvider — 관리자 화면은 viewing={null}). 띠가 보이는 동안 본문 건너뛰기 자리는 띠 45px만큼 더 내린다(102 → 147px).
// 없으면(undefined·null) 지금 그대로이고, 보기 쿠키가 남아 있으면 ViewCookieSync가 지우고 한 번 새로 연다(아무것도 그리지 않는다).
// 관리자(데스크 아님)는 머리 시계 왼쪽에 '보는 의원' 단추(ViewPicker)가 있다
// 저절로 올리기(admin-view REQ-8021): AutoUpload를 늘 그린다(아무것도 그리지 않고, 보는 중·보기 쿠키면 아무 일도 하지 않는다)
export function AppShell({
  hospitalName,
  email,
  isAdmin,
  desk = false,
  hiddenTabs = [],
  viewing = null,
  children,
}: {
  hospitalName: string
  email: string
  isAdmin: boolean
  /** 데스크 계정(desk-feedback). 없으면 거짓 */
  desk?: boolean
  /** 관리자만 보는 탭(숨긴 탭, multi-admin). 없으면 빈 목록 */
  hiddenTabs?: readonly MenuPath[]
  /** 관리자가 이 브라우저에서 보는 의원(admin-view). 없으면 null */
  viewing?: Viewing | null
  children: ReactNode
}) {
  const page = desk ? (
    <RoleProvider desk>
      <DeskGate hidden={hiddenTabs}>{children}</DeskGate>
    </RoleProvider>
  ) : (
    children
  )
  const gated = hiddenTabs.length > 0 ? <TabGate hidden={hiddenTabs}>{page}</TabGate> : page
  const body = viewing ? <ViewGate viewing={viewing}>{gated}</ViewGate> : gated
  const hidden = viewing ? [...hiddenTabs, ...VIEW_HIDDEN_TABS.filter((path) => !hiddenTabs.includes(path))] : hiddenTabs
  return (
    <div className="group/app app-ui flex min-h-dvh flex-col bg-surface text-ink">
      {/* 평소에는 화면 읽기에만. 키보드 초점이면 왼쪽 위 띠 위에 뜬다(시안 .skip: 위 6px·왼쪽 8px·붙는 묶음 z 10 위).
          not-sr-only가 0으로 돌리는 테두리 두께·안쪽 여백·크기는 초점일 때 다시 준다(같은 변형에서 뒤에 온다) */}
      <a href="#main" className={SKIP_LINK}>
        본문으로 건너뛰기
      </a>
      {!viewing && <ViewCookieSync />}
      <AutoUpload />
      <div className="sticky top-0 z-10 print:hidden">
        {viewing && <ViewBand viewing={viewing} />}
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex h-14 w-full max-w-7xl items-center lg:group-has-[[data-wide-page]]/app:max-w-none justify-between gap-4 px-6 max-md:h-12 max-md:gap-2 max-md:px-4">
            <div className="flex min-w-0 items-center gap-3 max-md:gap-2">
              {/* 로고는 랜딩·인증 화면과 같은 LogoMark. LogoMark가 정한 고정 두 색(로고 C③)으로 그리고 읽지 않는다 */}
              <LogoMark size={24} className="shrink-0" />
              {/* 넘치면 말줄임. 좁은 PC 띠(768~1023px)에서도 80px 아래로는 줄지 않는다 */}
              <span className="min-w-20 truncate text-subtitle font-semibold text-ink max-md:text-body">{viewing?.name ?? hospitalName}</span>
            </div>
            <div className="flex shrink-0 items-center gap-4">
              {isAdmin && !desk && <ViewPicker viewing={viewing} />}
              <KstClock />
              <AccountMenu email={email} hospitalName={hospitalName} isAdmin={isAdmin} desk={desk} />
            </div>
          </div>
        </header>
        <TabBar desk={desk} isAdmin={isAdmin} hidden={hidden} />
      </div>
      {/* 건너뛰기 링크가 가리키는 본문. 초점을 받을 수 있게 tabIndex -1(Tab 차례에는 들지 않는다).
          옮겨도 첫 줄이 붙는 묶음에 가리지 않게 scroll-margin = 묶음 높이: 띠 57(56 + 아래 선 1) + 탭 줄 45(44 + 아래 선 1) = 102px,
          768px 미만은 띠 49(48 + 1) + 45 = 94px. 코드로 옮긴 초점이라 본문 둘레 초점 고리는 그리지 않는다(건너뛰기 링크 자신의 고리는 그대로) */}
      <main
        id="main"
        tabIndex={-1}
        className={viewing ? `${MAIN_CLASS} group-has-[[data-view-band]]/app:scroll-mt-36.75` : MAIN_CLASS}
      >
        <div className="mx-auto w-full max-w-7xl px-6 pt-6 lg:group-has-[[data-wide-page]]/app:max-w-none pb-12 max-md:px-4 max-md:pt-4 max-md:pb-8 print:p-0">{body}</div>
      </main>
    </div>
  )
}
