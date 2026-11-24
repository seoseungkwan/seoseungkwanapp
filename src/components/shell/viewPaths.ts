import { isUnder, type MenuPath } from './menu'

// 보는 중 빼는 탭 · 관리자 화면 주소 (admin-view REQ-8007 AC-8007.3, design.md '읽기만 바탕'·기본값 5).
// 보는 중에는 예약·환자·청구 탭이 없고(MENU 차례), 그 주소와 그 아래(비트 PC 연결 /claim/setup 포함)는 ViewGate가 대시보드로 돌린다.
// 관리자 화면(/admin과 그 아래 /admin/compare)은 의원과 상관없어 보는 중에도 띠·숨김·읽기만이 없다

/** 보는 중 숨기는 탭(MENU 차례: 청구 · 환자 · 예약) */
export const VIEW_HIDDEN_TABS = ['/claim', '/patients', '/calendar'] as const satisfies readonly MenuPath[]

/** 보는 중 막는 주소: 예약·환자·청구와 그 아래(/claim/setup 포함) */
export const isViewBlockedPath = (pathname: string): boolean => VIEW_HIDDEN_TABS.some((base) => isUnder(pathname, base))

/** 관리자 화면: /admin과 그 아래만 */
export const isAdminScreen = (pathname: string): boolean => isUnder(pathname, '/admin')
