import type { Metadata } from 'next'
import { ComparePage } from '@/components/admin/compare/ComparePage'
import { todayInKorea } from '@/lib/analytics/dates'
import { guardPage } from '@/lib/auth/guard.server'

// /admin/compare 의원 비교 (spec admin-view REQ-8017 AC-8017.1, design.md '의원 비교 — 불러오기와 한도'·'흐름'). 관리자만 연다:
// (app)/layout은 지금 경로를 모르고 앱 공통('/dashboard') 판정만 한다 → 그리기 전에 '/admin/compare'로 문지기를 다시 부른다
// (gate.ts ADMIN_PATHS가 /admin 아래를 관리자 경로로 본다 — 관리자 아닌 원장 /dashboard, 데스크 /sunap, 로그인 안 함 /login).
// 의원 숫자는 브라우저(ComparePage)가 정의자 함수(admin_rows 등)로 읽는다. 서버는 내 줄·관리자 줄만 읽는다(ADR-004·ADR-047). 앱 틀은 레이아웃 몫

// 요청의 로그인 세션으로만 그릴 수 있고 "지난달"은 요청 때의 한국 날짜다 → 빌드 때 미리 그리지 않는다
export const dynamic = 'force-dynamic'

// 브라우저 탭 이름(design.md '화면 글자' 의원 비교 제목)
export const metadata: Metadata = { title: '의원 비교' }

export default async function AdminComparePage() {
  await guardPage('/admin/compare')
  // 'return <'로 시작한다: 문지기 뒤에서만 그린다(tabFrame.test AC-308.3과 같은 모양)
  return <ComparePage today={todayInKorea()} />
}
