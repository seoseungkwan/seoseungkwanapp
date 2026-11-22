// 앱 탭 줄의 항목 (tab-frame REQ-302, design.md '탭 목록'). 14개 모두 자기 주소(path)로 가는 링크다.
// 탭 띠에는 주요 메뉴 여덟(primary)만 있고, 나머지는 [더보기] 판에 MENU 차례로 있다(dashboard-ux REQ-2702, 고시·공지가 더해짐 notices AC-7423.1).
// 매출 탭은 통계 매출 칸으로 옮겨 없앴다. 옛 주소 /revenue는 next.config.ts가 /stats로 넘긴다(stats-revenue AC-4110.1·AC-4110.2).
// 화면이 아직 없는 기능은 그 주소의 '준비 중' 화면이다. 비트 PC 연결 화면(/claim/setup)은 설정 탭 자리에 속한다(owns).
// 관리자 화면은 탭이 아니라 계정 메뉴의 [가입 승인](ADMIN_LINK)이다
export type MenuLabel =
  | '대시보드'
  | '통계'
  | '청구'
  | '고시·공지'
  | '환자'
  | '수납일지'
  | '예약'
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
  | '/sunap'
  | '/calendar'
  | '/ai-report'
  | '/forms'
  | '/staff'
  | '/worklog'
  | '/inventory'
  | '/contacts'
  | '/settings'
/** 기능 자신의 화면이 있는 주소. 다음 명세가 화면을 만들면 여기에 더한다 */
export type MenuHref = '/dashboard' | '/stats' | '/claim' | '/notices' | '/patients' | '/sunap' | '/calendar' | '/ai-report' | '/forms' | '/staff' | '/inventory' | '/worklog' | '/contacts' | '/settings'

export type MenuItem = {
  label: MenuLabel
  /** 탭이 가는 곳(모두 있다). 화면이 없는 기능은 그 기능 주소의 '준비 중' 화면 */
  path: MenuPath
  /** 기능 자신의 화면. 아직 없으면 null. 있으면 path와 같다.
   *  SetupScreen이 설정의 이 값으로 [청구·연락] 링크를 정한다 */
  href: MenuHref | null
  /** 이 탭 자리에 속하는 다른 화면 경로(설정 탭의 비트 PC 연결 /claim/setup) */
  owns?: readonly string[]
  /** 지금 쓸 수 있는 화면이 있다. false면 그 주소는 '준비 중' 화면이고 [더보기] 판에 "준비 중" 칩이 붙는다(dashboard-ux AC-2702.2).
   *  false인 주소들은 common/notReadyFeatures.ts의 NOT_READY_FEATURES와 같다(시험이 견준다) */
  ready: boolean
  /** 탭 띠의 주요 메뉴(대시보드·통계·청구·고시·공지·환자·업무일지·수납일지·예약, nav-worklog AC-5801.2·clinic-calendar AC-5905.10·notices AC-7423.1). false면 [더보기] 판에 있다(dashboard-ux AC-2702.1) */
  primary: boolean
}

export const MENU: readonly MenuItem[] = [
  { label: '대시보드', path: '/dashboard', href: '/dashboard', ready: true, primary: true },
  { label: '통계', path: '/stats', href: '/stats', ready: true, primary: true },
  { label: '청구', path: '/claim', href: '/claim', ready: true, primary: true },
  // 고시·공지 /notices(글 목록·?id= 글 화면·/notices/week 주간 모음, notices AC-7423.1). 탭 옆 안 읽은 수(NoticeBadge)가 보이게 주요 메뉴다.
  // 원장만 본다 — 데스크는 DESK_PATHS 밖이라 탭이 없고 주소로 와도 DeskGate가 막는다
  { label: '고시·공지', path: '/notices', href: '/notices', ready: true, primary: true },
  { label: '환자', path: '/patients', href: '/patients', ready: true, primary: true },
  // 업무일지 /worklog — 주요 메뉴, 수납일지 바로 왼쪽(nav-worklog AC-5801.1)
  { label: '업무일지', path: '/worklog', href: '/worklog', ready: true, primary: true },
  // 수납일지 화면 /sunap — 매일 쓰는 화면이라 주요 메뉴(sunap-ilji AC-4907.1)
  { label: '수납일지', path: '/sunap', href: '/sunap', ready: true, primary: true },
  // 예약 화면 /calendar — 구글 캘린더 대신 쓰는 예약표, 주요 메뉴 맨 끝(clinic-calendar AC-5905.10)
  { label: '예약', path: '/calendar', href: '/calendar', ready: true, primary: true },
  { label: 'AI 리포트', path: '/ai-report', href: '/ai-report', ready: true, primary: false },
  { label: '서식', path: '/forms', href: '/forms', ready: true, primary: false }, // 휴진 안내 서식 화면(forms AC-3501.1)
  // 직원 화면 /staff(명단·근무표·휴가·급여, staff AC-7611.1). 원장만 본다 — 데스크는 DESK_PATHS 밖이라 탭이 없고 주소로 와도 DeskGate가 막는다
  { label: '직원', path: '/staff', href: '/staff', ready: true, primary: false },
  // 재고 화면 /inventory(목록·세기·들어온 기록·달별, inventory AC-7512.1). [더보기] 판 자리 그대로. 원장만 본다 — 데스크는 DESK_PATHS 밖이라 탭이 없다
  { label: '재고', path: '/inventory', href: '/inventory', ready: true, primary: false },
  // 주소록 화면 /contacts — 원장(의원) 계정만, [더보기] 판(contacts AC-6508.1). 데스크는 DESK_MENU에 없고 DeskGate가 막는다(AC-6508.3)
  { label: '주소록', path: '/contacts', href: '/contacts', ready: true, primary: false },
  // 설정 화면 /settings(precheck AC-012.6). 비트 PC 연결(/claim/setup)에 있어도 설정 탭이 지금 탭이다.
  // SetupScreen의 [청구·연락]은 이 href로 가는 링크가 된다
  { label: '설정', path: '/settings', href: '/settings', owns: ['/claim/setup'], ready: true, primary: false },
]

/** 탭 띠의 주요 메뉴 여덟(MENU 차례) */
export const PRIMARY_MENU: readonly MenuItem[] = MENU.filter((item) => item.primary)
/** [더보기] 판의 나머지(MENU 차례) */
export const MORE_MENU: readonly MenuItem[] = MENU.filter((item) => !item.primary)

// 관리자만, 계정 메뉴 첫 항목(REQ-304)
export const ADMIN_LINK: { label: '가입 승인'; href: '/admin' } = { label: '가입 승인', href: '/admin' }

/** 그 경로이거나 그 아래 경로 */
export const isUnder = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`)

// 데스크 계정(desk-feedback REQ-6306, ADR-031): 탭은 업무일지·수납일지·예약 셋뿐이고 첫 화면은 수납일지다.
// 다른 주소는 DeskGate가 막힌 화면으로 바꾼다(자료는 서버 RLS가 막는다). 비트 PC 연결 화면(/claim/setup)만 탭 밖에서 연다(desk-setup)
const DESK_PATHS: readonly MenuPath[] = ['/worklog', '/sunap', '/calendar']
/** 데스크 탭 띠(MENU 차례, MENU 항목 그대로) */
export const DESK_MENU: readonly MenuItem[] = MENU.filter((item) => DESK_PATHS.includes(item.path))
/** 데스크 첫 화면. 로그인 뒤 첫 주소 /dashboard는 여기로 바꾼다 */
export const DESK_HOME: MenuPath = '/sunap'
// 탭은 아니지만 데스크도 여는 주소: 비트 PC 연결 화면(desk-setup AC-7001.1 — 데스크 PC에 확장·도우미를 깔고 연결한다)
const DESK_EXTRA: readonly string[] = ['/claim/setup']
/** 데스크가 열 수 있는 주소: 세 탭 주소와 비트 PC 연결 화면, 그 아래 */
export const isDeskPath = (pathname: string) => [...DESK_PATHS, ...DESK_EXTRA].some((base) => isUnder(pathname, base))

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

// 관리자만 보는 탭 (multi-admin REQ-7706, design.md '탭 목록 함수', ADR-042). 주 관리자가 설정에서 고른 탭은 관리자가 아닌
// 원장·데스크 계정의 메뉴에서 빠지고, 주소로 와도 대시보드로 돌아간다. 목록은 공용 표 tab_access(경로·관리자만 참거짓)이고
// DB에 줄이 없는 탭은 관리자만이다(새로 생긴 탭은 처음엔 관리자만). 보이기만 막는다 — 자료 권한(RLS)은 그대로다
const ALWAYS_SHOWN: readonly MenuPath[] = ['/dashboard', '/settings']
/** '관리자만 보는 탭' 목록(MENU 차례, 대시보드·설정 뺌 — 늘 보임). 12개 */
export const TAB_ACCESS_MENU: readonly MenuItem[] = MENU.filter((item) => !ALWAYS_SHOWN.includes(item.path))

/** tab_access 한 줄 */
export type TabAccessRow = { path: string; adminOnly: boolean }

/** 답 모양 검사: [{ path: string, admin_only: boolean }]만 → TabAccessRow[](두 칸만 옮김), 하나라도 틀리면 null(막는 쪽) */
export function toTabAccessRows(data: unknown): TabAccessRow[] | null {
  if (!Array.isArray(data)) return null
  const rows: TabAccessRow[] = []
  for (const row of data as unknown[]) {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) return null
    const { path, admin_only: adminOnly } = row as Record<string, unknown>
    if (typeof path !== 'string' || typeof adminOnly !== 'boolean') return null
    rows.push({ path, adminOnly })
  }
  return rows
}

/** 관리자가 아닌 계정에게 숨길 탭: TAB_ACCESS_MENU 가운데 줄이 없거나 adminOnly 참(MENU 차례). 목록 밖 줄은 버린다.
 *  같은 경로에 참·거짓 줄이 함께 오면 숨긴다(막는 쪽) */
export function adminOnlyTabs(rows: readonly TabAccessRow[]): MenuPath[] {
  const shown = (path: MenuPath) => {
    const mine = rows.filter((row) => row.path === path)
    return mine.length > 0 && mine.every((row) => !row.adminOnly)
  }
  return TAB_ACCESS_MENU.filter((item) => !shown(item.path)).map((item) => item.path)
}

/** 지금 주소가 숨긴 탭 자리인가 — path·owns 중 가장 길게 맞는 자리(currentMenuLabel이 고르는 탭)가 숨긴 탭이면 참.
 *  /claim/setup은 설정 탭 자리라 청구를 숨겨도 거짓, 대시보드·설정·가입 승인·탭 밖 주소는 늘 거짓 */
export function isHiddenPath(pathname: string, hidden: readonly MenuPath[]): boolean {
  const label = currentMenuLabel(pathname)
  const tab = TAB_ACCESS_MENU.find((item) => item.label === label)
  return tab !== undefined && hidden.includes(tab.path)
}

/** 데스크 첫 화면: DESK_HOME, 숨겼으면 DESK_MENU 차례로 숨기지 않은 첫 탭(수납일지 → 업무일지 → 예약). 셋 다 숨김이면 null */
export function deskHomeOf(hidden: readonly MenuPath[]): MenuPath | null {
  const order = [DESK_HOME, ...DESK_MENU.map((item) => item.path).filter((path) => path !== DESK_HOME)]
  return order.find((path) => !hidden.includes(path)) ?? null
}
