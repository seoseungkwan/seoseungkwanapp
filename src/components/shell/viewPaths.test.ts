import { describe, expect, it } from 'vitest'
import { MENU } from './menu'
import { VIEW_HIDDEN_TABS, isAdminScreen, isViewBlockedPath } from './viewPaths'

// 보는 중 빼는 탭 · 관리자 화면 주소 (admin-view REQ-8007 AC-8007.3, design.md '읽기만 바탕'·기본값 5).
// 보는 중에는 예약·환자·청구 탭이 없고 그 주소(그 아래 포함, 비트 PC 연결 /claim/setup도)는 막힌다.
// 관리자 화면(/admin과 그 아래)은 의원과 상관없어 보는 중에도 띠·숨김이 없다. menu.ts는 읽기만 한다(고치지 않음)

const HIDDEN = ['/calendar', '/patients', '/claim']

describe('AC-8007.3 VIEW_HIDDEN_TABS — 예약·환자·청구, MENU 차례', () => {
  it('AC-8007.3: 예약·환자·청구 세 주소이고, 차례는 menu.ts MENU 차례다', () => {
    const inMenuOrder = MENU.filter((item) => HIDDEN.includes(item.path)).map((item) => item.path)
    expect(inMenuOrder).toHaveLength(3)
    expect([...VIEW_HIDDEN_TABS]).toEqual(inMenuOrder)
    expect([...VIEW_HIDDEN_TABS].sort()).toEqual([...HIDDEN].sort())
  })

  it('AC-8007.3: 세 주소는 MENU의 예약·환자·청구 탭이다', () => {
    const labels = VIEW_HIDDEN_TABS.map((path) => MENU.find((item) => item.path === path)?.label)
    expect([...labels].sort()).toEqual(['예약', '청구', '환자'].sort())
  })
})

describe('AC-8007.3 isViewBlockedPath — 그 셋과 그 아래 주소만', () => {
  it.each([
    '/calendar',
    '/calendar/',
    '/calendar/2026-11-24',
    '/patients',
    '/patients/x',
    '/claim',
    '/claim/',
    '/claim/setup',
    '/claim/setup/more',
    '/claim/rules',
  ])('AC-8007.3: %s → 참', (path) => {
    expect(isViewBlockedPath(path)).toBe(true)
  })

  it.each([
    '/claims',
    '/claimx',
    '/calendars',
    '/patient',
    '/patientsx',
    '/dashboard',
    '/admin',
    '/admin/compare',
    '/stats',
    '/notices',
    '/worklog',
    '/sunap',
    '/staff',
    '/inventory',
    '/contacts',
    '/location',
    '/settings',
    '/ai-report',
    '/forms',
    '/',
    '',
    'claim',
    '/x/claim',
  ])('AC-8007.3: %j → 거짓', (path) => {
    expect(isViewBlockedPath(path)).toBe(false)
  })
})

describe('AC-8007.3 isAdminScreen — /admin과 그 아래만', () => {
  it.each(['/admin', '/admin/', '/admin/compare', '/admin/compare/x'])('AC-8007.3: %s → 참', (path) => {
    expect(isAdminScreen(path)).toBe(true)
  })

  it.each(['/administrator', '/admins', '/adminx', '/location', '/dashboard', '/settings', '/claim', '/', '', 'admin', '/x/admin'])(
    'AC-8007.3: %j → 거짓',
    (path) => {
      expect(isAdminScreen(path)).toBe(false)
    },
  )
})
