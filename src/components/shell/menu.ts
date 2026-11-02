// 앱 탭 줄의 항목 (tab-frame REQ-302, design.md '탭 목록'). 13개 모두 자기 주소(path)로 가는 링크다.
// 화면이 아직 없는 기능은 그 주소의 '준비 중' 화면, 설정은 비트 PC 연결 화면(/claim/setup)으로 간다.
// 관리자 화면은 탭이 아니라 계정 메뉴의 [가입 승인](ADMIN_LINK)이다
export type MenuLabel =
  | '대시보드'
  | '통계'
  | '청구'
  | '고시·공지'
  | '환자'
  | '매출'
  | 'AI 리포트'
  | '서식'
  | '직원'
  | '업무일지'
  | '재고'
  | '주소록'
  | '설정'
export type MenuPath =
  | '/dashboard'
  | '/stats'
  | '/claim'
  | '/notices'
  | '/patients'
  | '/revenue'
  | '/ai-report'
  | '/forms'
  | '/staff'
  | '/worklog'
  | '/inventory'
  | '/contacts'
  | '/claim/setup'
/** 기능 자신의 화면이 있는 주소. 다음 명세가 화면을 만들면 여기에 더한다 */
export type MenuHref = '/dashboard' | '/claim' | '/ai-report'

export type MenuItem = {
  label: MenuLabel
  /** 탭이 가는 곳(모두 있다). 화면이 없는 기능은 그 기능 주소의 '준비 중' 화면, 설정은 비트 PC 연결 화면 */
  path: MenuPath
  /** 기능 자신의 화면. 아직 없으면 null. 있으면 path와 같다.
   *  SetupScreen이 설정의 이 값으로 [청구·연락] 링크를 정한다(null = 준비 중) */
  href: MenuHref | null
  /** 이 탭 자리에 속하는 다른 화면 경로(지금은 쓰는 항목 없음. 설정이 /settings를 가지면 /claim/setup을 여기에 둔다) */
  owns?: readonly string[]
  /** 지금 쓸 수 있는 화면이 있다(대시보드·청구·AI 리포트·설정). false면 그 주소는 '준비 중' 화면이고 [전체 메뉴] 판에 "준비 중" 칩이 붙는다(ui-90 AC-416.4).
   *  false인 주소들은 common/notReadyFeatures.ts의 NOT_READY_FEATURES와 같다(시험이 견준다) */
  ready: boolean
}

export const MENU: readonly MenuItem[] = [
  { label: '대시보드', path: '/dashboard', href: '/dashboard', ready: true },
  { label: '통계', path: '/stats', href: null, ready: false },
  { label: '청구', path: '/claim', href: '/claim', ready: true },
  { label: '고시·공지', path: '/notices', href: null, ready: false },
  { label: '환자', path: '/patients', href: null, ready: false },
  { label: '매출', path: '/revenue', href: null, ready: false },
  { label: 'AI 리포트', path: '/ai-report', href: '/ai-report', ready: true },
  { label: '서식', path: '/forms', href: null, ready: false },
  { label: '직원', path: '/staff', href: null, ready: false },
  { label: '업무일지', path: '/worklog', href: null, ready: false },
  { label: '재고', path: '/inventory', href: null, ready: false },
  { label: '주소록', path: '/contacts', href: null, ready: false },
  // 설정 href는 null이어야 한다: 설치·연결 확인 화면(SetupScreen)이 이 값으로 [청구·연락] 링크를 정한다.
  // '/claim/setup'을 넣으면 [청구·연락]이 지금 보고 있는 화면 자신을 가리키는 링크가 된다(design.md '설정 탭은 /claim/setup으로 간다').
  // 설정 화면(/settings)이 생기면 path·href를 '/settings'로, owns를 ['/claim/setup']으로 바꾼다
  { label: '설정', path: '/claim/setup', href: null, ready: true },
]

// 관리자만, 계정 메뉴 첫 항목(REQ-304)
export const ADMIN_LINK: { label: '가입 승인'; href: '/admin' } = { label: '가입 승인', href: '/admin' }

/** 그 경로이거나 그 아래 경로 */
export const isUnder = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`)

/** 지금 화면의 탭 이름. 탭의 path·owns 중 가장 길게 맞는 경로가 이긴다(/claim/setup은 청구 /claim보다 설정 /claim/setup이 길게 맞는다, AC-302.4) */
export function currentMenuLabel(pathname: string): MenuLabel | null {
  let best: { label: MenuLabel; length: number } | null = null
  for (const item of MENU) {
    for (const base of [item.path, ...(item.owns ?? [])]) {
      if (isUnder(pathname, base) && (best === null || base.length > best.length)) {
        best = { label: item.label, length: base.length }
      }
    }
  }
  return best?.label ?? null
}
