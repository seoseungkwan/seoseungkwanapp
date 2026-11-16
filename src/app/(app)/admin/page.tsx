import type { Metadata } from 'next'
import { AdminApplications } from '@/components/admin/AdminApplications'
import { InstallFilesAdmin } from '@/components/admin/InstallFilesAdmin'
import { guardPage } from '@/lib/auth/guard.server'

// /admin (REQ-007, AC-002.5): 승인된 관리자만 연다. (app)/layout은 지금 경로를 모르고 앱 공통('/dashboard') 판정만 한다 →
// 이 페이지가 그리기 전에 '/admin'으로 문지기를 다시 부른다(관리자가 아니면 /dashboard, 대기·거절이면 /pending …).
// 서버는 내 줄·관리자 줄만 읽는다(ADR-004). 가입 신청 목록은 브라우저(AdminApplications)가 RLS로 읽는다. 앱 틀은 레이아웃 몫.
// 가입 승인 위에 '설치 파일' 칸(helper-download REQ-5104) — 목록·올리기도 브라우저(InstallFilesAdmin)가 Storage 규칙으로 한다

// 요청의 로그인 세션으로만 그릴 수 있다 → 빌드 때 미리 그리지 않는다
export const dynamic = 'force-dynamic'

// 브라우저 탭 이름 (ui-90 AC-402.4)
export const metadata: Metadata = { title: '가입 승인' }

export default async function AdminPage() {
  await guardPage('/admin')
  // 'return <'로 시작한다: 문지기 뒤에서만 그린다는 것을 tabFrame.test(AC-308.3)가 이 글자로 본다
  return <div className="flex flex-col gap-6 max-md:gap-4">
    <InstallFilesAdmin />
    <AdminApplications />
  </div>
}
