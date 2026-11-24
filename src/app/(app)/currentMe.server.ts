import 'server-only'
import { cache } from 'react'
import { readAdminView } from '@/lib/auth/adminView.server'
import { guardPage } from '@/lib/auth/guard.server'

// 앱 화면((app)/*) 공통 문지기 읽기 (ui-90 AC-402.3, design.md '탭 이름'). (app)/layout의 그리기와 generateMetadata(탭 이름)가
// 같은 요청 안에서 이 읽기를 한 번만 한다(React cache는 요청마다 새로 비워진다). 레이아웃은 지금 경로를 모른다 →
// 승인된 사람의 앱 경로와 같은 판정('/dashboard')만 한다. 맞지 않는 상태면 guard가 보낸다(/login·/signup·/pending)
export const currentMe = cache(() => guardPage('/dashboard'))

// 관리자가 이 브라우저에서 보는 의원 (admin-view REQ-8006 AC-8006.1, design.md '앱 틀', ADR-046). 그리기와 탭 이름이 같은 요청에서 한 번만 읽는다.
// 승인된 병원 줄이 있는 관리자만 readAdminView(보기 쿠키가 있을 때만 rpc('my_admin_view'))를 부른다 — 데스크·관리자 아님·승인 전은 DB를 부르지 않고 null.
// 읽기 실패는 던진다 → 오류 화면(E-PAGE-FAILED)
export const currentView = cache(async () => {
  const me = await currentMe()
  return me.isAdmin && me.hospital?.status === 'approved' ? readAdminView() : null
})
