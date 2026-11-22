import type { Metadata } from 'next'
import { LiveDashboard } from '@/components/dashboard/summary/LiveDashboard'
import { todayInKorea } from '@/lib/analytics/dates'
import { currentMe } from '../currentMe.server'

// /dashboard (tab-frame REQ-306·REQ-307, design.md '대시보드 페이지 조립'): 로그인·승인 뒤 도착하는 첫 화면. 문지기와 앱 틀은 (app)/layout이 준다.
// 오늘 한국 날짜만 LiveDashboard에 넘긴다. 저장 숫자는 브라우저가 읽어 BitDashboard의 처음 자료로 넘기고, 그 화면이 비트 PC에서 숫자를 읽어 모양을 고른다
// (bit-dashboard AC-601.14, stats AC-516.1). 서버 코드인 이 페이지는 통계 표를 읽지 않아 서버 그림은 늘 연결 전 모양이다(지어낸 숫자 없음)
// 새 경쟁 의원 알림(location AC-7915.1·AC-7915.3, design.md 12절)을 부를지는 관리자인지 하나만 넘긴다: 앱 틀이 같은 요청에서 이미 읽은
// 문지기 값(currentMe — 요청마다 한 번, 새로 읽지 않음)의 isAdmin이다. 페이지는 그 값을 기다리지 않고 약속으로 넘긴다 → 서버 그림(뼈대)과
// 다른 숫자가 기다리지 않는다. 데스크(내 병원 줄 없음)는 앱 틀처럼 관리자가 아니고, 못 읽으면 거짓이다

// 날짜 줄의 "오늘"은 요청 때의 한국 날짜다 → 빌드 때 미리 그리지 않는다
export const dynamic = 'force-dynamic'

// 브라우저 탭 이름 (ui-90 AC-402.4)
export const metadata: Metadata = { title: '대시보드' }

/** 관리자인지(참·거짓으로 끝나는 약속, 실패하지 않는다) */
function adminOfMe(): Promise<boolean> {
  return currentMe().then(
    (me) => me.isAdmin && me.hospital !== null,
    () => false,
  )
}

export default function DashboardPage() {
  return <LiveDashboard today={todayInKorea()} isAdmin={adminOfMe()} />
}
