import { AdminApplications } from '@/components/admin/AdminApplications'
import { guardPage } from '@/lib/auth/guard.server'

// /admin (REQ-007, AC-002.5): 승인된 관리자만 연다. (app)/layout은 지금 경로를 모르고 앱 공통('/dashboard') 판정만 한다 →
// 이 페이지가 그리기 전에 '/admin'으로 문지기를 다시 부른다(관리자가 아니면 /dashboard, 대기·거절이면 /pending …).
// 서버는 내 줄·관리자 줄만 읽는다(ADR-004). 가입 신청 목록은 브라우저(AdminApplications)가 RLS로 읽는다. 앱 틀은 레이아웃 몫

// 요청의 로그인 세션으로만 그릴 수 있다 → 빌드 때 미리 그리지 않는다
export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  await guardPage('/admin')
  return <AdminApplications />
}
