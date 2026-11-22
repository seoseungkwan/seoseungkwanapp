import { describe, expect, it } from 'vitest'
import {
  DESK_HOME,
  DESK_MENU,
  MENU,
  MORE_MENU,
  PRIMARY_MENU,
  TAB_ACCESS_MENU,
  adminOnlyTabs,
  currentMenuLabel,
  deskHomeOf,
  isHiddenPath,
  toTabAccessRows,
  type MenuPath,
  type TabAccessRow,
} from './menu'

// 관리자만 보는 탭 — menu.ts 순수 함수 (multi-admin REQ-7706 AC-7706.1, design.md '탭 목록 함수').
// 탭 목록 표(tab_access)의 답을 믿지 않고 모양을 보고, 줄이 없는 탭은 관리자만(막는 쪽)이다.
// 지금 주소가 숨긴 탭 자리인지는 currentMenuLabel과 같은 '가장 길게 맞는 자리' 규칙으로 본다

// '화면 글자'의 12개 탭, 이 차례(MENU 차례에서 대시보드·설정을 뺌)
const TAB_LABELS = ['통계', '청구', '고시·공지', '환자', '업무일지', '수납일지', '예약', 'AI 리포트', '서식', '직원', '재고', '주소록']
const TAB_PATHS: MenuPath[] = [
  '/stats',
  '/claim',
  '/notices',
  '/patients',
  '/worklog',
  '/sunap',
  '/calendar',
  '/ai-report',
  '/forms',
  '/staff',
  '/inventory',
  '/contacts',
]
const everyone = (paths: readonly string[] = TAB_PATHS): TabAccessRow[] => paths.map((path) => ({ path, adminOnly: false }))

describe('AC-7706.1 TAB_ACCESS_MENU — 관리자만 보는 탭 목록', () => {
  it('AC-7706.1: 12개 탭이 화면 글자 차례(MENU 차례, 대시보드·설정 뺌)이고 MENU 항목 그대로다', () => {
    expect(TAB_ACCESS_MENU.map((item) => item.label)).toEqual(TAB_LABELS)
    expect(TAB_ACCESS_MENU.map((item) => item.path)).toEqual(TAB_PATHS)
    expect(TAB_ACCESS_MENU).toEqual(MENU.filter((item) => item.path !== '/dashboard' && item.path !== '/settings'))
    for (const item of TAB_ACCESS_MENU) expect(MENU).toContain(item)
  })

  it('AC-7706.1: 대시보드·설정·가입 승인(/admin)은 목록에 없다(늘 보임·원래 관리자만)', () => {
    const paths: string[] = TAB_ACCESS_MENU.map((item) => item.path)
    for (const path of ['/dashboard', '/settings', '/admin']) expect(paths).not.toContain(path)
  })

  it('AC-7706.1: 옛 상수(MENU 14개·PRIMARY_MENU·MORE_MENU·DESK_MENU·DESK_HOME)는 그대로다', () => {
    expect(MENU).toHaveLength(14)
    expect(PRIMARY_MENU.map((item) => item.label)).toEqual(['대시보드', '통계', '청구', '고시·공지', '환자', '업무일지', '수납일지', '예약'])
    expect(MORE_MENU.map((item) => item.label)).toEqual(['AI 리포트', '서식', '직원', '재고', '주소록', '설정'])
    expect(DESK_MENU.map((item) => item.path)).toEqual(['/worklog', '/sunap', '/calendar'])
    expect(DESK_HOME).toBe('/sunap')
    for (const item of MENU) {
      expect(Object.keys(item).sort().filter((key) => key !== 'owns')).toEqual(['href', 'label', 'path', 'primary', 'ready'])
    }
  })
})

describe('AC-7706.1 toTabAccessRows — tab_access 답 모양 검사', () => {
  it('AC-7706.1: [{ path, admin_only }] 줄 목록은 받은 차례 그대로 { path, adminOnly }로 바꾼다', () => {
    expect(
      toTabAccessRows([
        { path: '/stats', admin_only: false },
        { path: '/staff', admin_only: true },
        { path: '/new-tab', admin_only: true },
      ]),
    ).toEqual([
      { path: '/stats', adminOnly: false },
      { path: '/staff', adminOnly: true },
      { path: '/new-tab', adminOnly: true },
    ])
  })

  it('AC-7706.1: 빈 목록은 빈 목록이다(줄이 하나도 없음)', () => {
    expect(toTabAccessRows([])).toEqual([])
  })

  it('AC-7706.1: 정해 둔 두 칸만 옮긴다(다른 칸은 버린다)', () => {
    const rows = toTabAccessRows([{ path: '/stats', admin_only: false, hospital_id: 'h-1', note: '비밀' }])
    expect(rows).toEqual([{ path: '/stats', adminOnly: false }])
    expect(Object.keys(rows?.[0] ?? {}).sort()).toEqual(['adminOnly', 'path'])
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['객체', { path: '/stats', admin_only: false }],
    ['글자', '/stats'],
    ['숫자', 3],
  ])('AC-7706.1: 답이 목록이 아니면(%s) null이다', (_, data) => {
    expect(toTabAccessRows(data)).toBeNull()
  })

  it.each([
    ['줄이 null', null],
    ['줄이 글자', '/stats'],
    ['줄이 목록', ['/stats', false]],
    ['path 없음', { admin_only: false }],
    ['path가 글자 아님', { path: 7, admin_only: false }],
    ['admin_only 없음', { path: '/stats' }],
    ['admin_only가 참거짓 아님(글자)', { path: '/stats', admin_only: 'false' }],
    ['admin_only가 참거짓 아님(숫자)', { path: '/stats', admin_only: 0 }],
    ['admin_only가 null', { path: '/stats', admin_only: null }],
    ['camelCase 칸', { path: '/stats', adminOnly: false }],
  ])('AC-7706.1: 줄 모양이 하나라도 틀리면(%s) 맞는 줄이 있어도 null이다(막는 쪽)', (_, bad) => {
    expect(toTabAccessRows([{ path: '/claim', admin_only: false }, bad])).toBeNull()
  })
})

describe('AC-7706.1 adminOnlyTabs — 관리자가 아닌 계정에게 숨길 탭', () => {
  it('AC-7706.1: 12개가 모두 모두에게(거짓)면 숨길 탭이 없다', () => {
    expect(adminOnlyTabs(everyone())).toEqual([])
  })

  it('AC-7706.1: 줄이 하나도 없으면 12개 모두 숨긴다(새로 생긴 탭은 처음엔 관리자만)', () => {
    expect(adminOnlyTabs([])).toEqual(TAB_PATHS)
  })

  it('AC-7706.1: adminOnly 참인 탭과 줄이 없는 탭을 MENU 차례로 준다(받은 줄 차례와 상관없다)', () => {
    const rows: TabAccessRow[] = [
      { path: '/staff', adminOnly: true },
      ...everyone(TAB_PATHS.filter((path) => path !== '/staff' && path !== '/inventory' && path !== '/ai-report')),
      { path: '/ai-report', adminOnly: true },
    ]
    // 재고(/inventory)는 줄이 없다 → 숨김
    expect(adminOnlyTabs(rows)).toEqual(['/ai-report', '/staff', '/inventory'])
  })

  it('AC-7706.1: adminOnly 거짓인 탭은 숨기지 않는다', () => {
    const rows = everyone().map((row) => (row.path === '/claim' ? { ...row, adminOnly: true } : row))
    expect(adminOnlyTabs(rows)).toEqual(['/claim'])
  })

  it('AC-7706.1: 목록 밖 경로 줄(대시보드·설정·가입 승인·없는 탭)은 버린다', () => {
    const rows: TabAccessRow[] = [
      ...everyone(),
      { path: '/dashboard', adminOnly: true },
      { path: '/settings', adminOnly: true },
      { path: '/admin', adminOnly: true },
      { path: '/new-tab', adminOnly: true },
      { path: '/claim/setup', adminOnly: true },
    ]
    expect(adminOnlyTabs(rows)).toEqual([])
  })

  it('AC-7706.1: 같은 경로에 참·거짓 줄이 함께 오면 숨긴다(막는 쪽)', () => {
    expect(adminOnlyTabs([...everyone(), { path: '/forms', adminOnly: true }])).toEqual(['/forms'])
  })

  it('AC-7706.1: 받은 줄 목록을 고치지 않는다', () => {
    const rows = everyone(['/stats'])
    const before = JSON.stringify(rows)
    adminOnlyTabs(rows)
    expect(JSON.stringify(rows)).toBe(before)
  })
})

describe('AC-7706.1 isHiddenPath — 지금 주소가 숨긴 탭 자리인가', () => {
  it.each([
    ['/claim', ['/claim']],
    ['/claim/history', ['/claim']],
    ['/staff', ['/staff']],
    ['/staff/payroll/2026-11', ['/staff']],
    ['/notices/week', ['/notices']],
    ['/ai-report', ['/stats', '/ai-report']],
    ['/contacts', TAB_PATHS],
  ] as [string, MenuPath[]][])('AC-7706.1: 숨긴 탭 주소와 그 아래 주소면 참이다(%s)', (pathname, hidden) => {
    expect(isHiddenPath(pathname, hidden)).toBe(true)
  })

  it.each([
    ['/claim', ['/stats']],
    ['/claim/history', ['/staff']],
    ['/claims', ['/claim']],
    ['/stats-old', ['/stats']],
    ['/', TAB_PATHS],
  ] as [string, MenuPath[]][])('AC-7706.1: 숨기지 않은 탭·이름만 비슷한 주소는 거짓이다(%s)', (pathname, hidden) => {
    expect(isHiddenPath(pathname, hidden)).toBe(false)
  })

  it('AC-7706.1: 숨긴 탭이 없으면 어느 주소도 거짓이다', () => {
    for (const path of TAB_PATHS) {
      expect(isHiddenPath(path, [])).toBe(false)
      expect(isHiddenPath(`${path}/x`, [])).toBe(false)
    }
  })

  it('AC-7706.1: /claim/setup은 청구를 숨겨도 거짓이다(가장 길게 맞는 자리 = 설정 탭)', () => {
    expect(isHiddenPath('/claim/setup', ['/claim'])).toBe(false)
    expect(isHiddenPath('/claim/setup/step', ['/claim'])).toBe(false)
    expect(isHiddenPath('/claim/setupx', ['/claim'])).toBe(true)
  })

  it.each(['/dashboard', '/dashboard/x', '/settings', '/settings/first-run', '/admin', '/admin/x', '/login', '/revenue', '/unknown'])(
    'AC-7706.1: %s(대시보드·설정·가입 승인·탭 밖 주소)는 숨긴 탭 목록에 무엇이 있어도 늘 거짓이다',
    (pathname) => {
      const all = [...TAB_PATHS, '/dashboard', '/settings'] as MenuPath[]
      expect(isHiddenPath(pathname, all)).toBe(false)
    },
  )

  it('AC-7706.1: 참·거짓은 currentMenuLabel이 고른 탭이 숨긴 탭인지와 같다(같은 규칙)', () => {
    const hidden: MenuPath[] = ['/claim', '/staff', '/sunap']
    const pathnames = ['/claim', '/claim/setup', '/claim/x', '/staff/y', '/sunap', '/stats', '/settings', '/dashboard', '/admin', '/nope']
    for (const pathname of pathnames) {
      const label = currentMenuLabel(pathname)
      const tab = TAB_ACCESS_MENU.find((item) => item.label === label)
      expect(isHiddenPath(pathname, hidden), pathname).toBe(tab !== undefined && hidden.includes(tab.path))
    }
  })
})

describe('AC-7706.1 deskHomeOf — 데스크 첫 화면', () => {
  it('AC-7706.1: 숨김이 없으면 DESK_HOME(수납일지)이다', () => {
    expect(deskHomeOf([])).toBe(DESK_HOME)
    expect(deskHomeOf([])).toBe('/sunap')
  })

  it('AC-7706.1: 데스크 탭이 아닌 탭만 숨기면 그대로 수납일지다', () => {
    expect(deskHomeOf(['/stats', '/claim', '/staff'])).toBe('/sunap')
  })

  it('AC-7706.1: 수납일지만 숨기면 업무일지다', () => {
    expect(deskHomeOf(['/sunap'])).toBe('/worklog')
  })

  it('AC-7706.1: 수납일지·업무일지를 숨기면 예약이다', () => {
    expect(deskHomeOf(['/worklog', '/sunap'])).toBe('/calendar')
  })

  it('AC-7706.1: 업무일지만 숨기면 수납일지, 예약만 숨기면 수납일지다', () => {
    expect(deskHomeOf(['/worklog'])).toBe('/sunap')
    expect(deskHomeOf(['/calendar'])).toBe('/sunap')
  })

  it('AC-7706.1: 수납일지·예약을 숨기면 업무일지다', () => {
    expect(deskHomeOf(['/sunap', '/calendar'])).toBe('/worklog')
  })

  it('AC-7706.1: 데스크 세 탭을 모두 숨기면 null이다', () => {
    expect(deskHomeOf(['/worklog', '/sunap', '/calendar'])).toBeNull()
    expect(deskHomeOf(TAB_PATHS)).toBeNull()
  })
})
