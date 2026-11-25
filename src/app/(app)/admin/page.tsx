import type { Metadata } from 'next'
import { AdminApplications } from '@/components/admin/AdminApplications'
import { AdminViewLog } from '@/components/admin/AdminViewLog'
import { InstallFilesAdmin } from '@/components/admin/InstallFilesAdmin'
import { guardPage } from '@/lib/auth/guard.server'

// /admin (REQ-007, AC-002.5): 승인된 관리자만 연다. (app)/layout은 지금 경로를 모르고 앱 공통('/dashboard') 판정만 한다 →
// 이 페이지가 그리기 전에 '/admin'으로 문지기를 다시 부른다(관리자가 아니면 /dashboard, 대기·거절이면 /pending …).
// 서버는 내 줄·관리자 줄만 읽는다(ADR-004). 가입 신청 목록은 브라우저(AdminApplications)가 RLS로 읽는다. 앱 틀은 레이아웃 몫.
// 제목 '가입 승인' 아래·신청 목록 위에 '설치 파일' 작은 칸(library AC-8109.2, 옛 helper-download AC-5104.3 자리) — [자료실 열기]만 있고 아무것도 읽지 않는다(올리기는 자료실).
// 신청 표 아래에 '본 기록' 칸(admin-view AC-8012.3) — 이것도 브라우저(AdminViewLog)가 정의자 함수로 읽는다. 안쪽 메뉴는 AdminApplications 머리에

// 요청의 로그인 세션으로만 그릴 수 있다 → 빌드 때 미리 그리지 않는다
export const dynamic = 'force-dynamic'

// 브라우저 탭 이름 (ui-90 AC-402.4)
export const metadata: Metadata = { title: '가입 승인' }

export default async function AdminPage() {
  await guardPage('/admin')
  // 'return <'로 시작한다: 문지기 뒤에서만 그린다는 것을 tabFrame.test(AC-308.3)가 이 글자로 본다
  return <AdminApplications top={<InstallFilesAdmin />} bottom={<AdminViewLog />} />
}
