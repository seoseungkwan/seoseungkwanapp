import type { Metadata } from 'next'
import { SetupScreen } from '@/components/claim/setup/SetupScreen'
import { guardPage } from '@/lib/auth/guard.server'

// /claim/setup 설치·연결 확인 (REQ-006, design.md 7절·9-1). 서버는 (app)/layout과 같은 길(guardPage)로 세션과 내 병원 줄만 읽고,
// 화면 '이 PC'에 보일 병원 이름은 사이트에 등록한 이름(me.hospital.name)을 넘긴다 — 도우미는 병원 이름을 주지 않는다(AC-006.4).
// 확장·도우미와의 연결과 기관기호는 브라우저(SetupScreen)에만 있다. 서버 경로·Server Action은 없다(ADR-004)

// 요청의 로그인 세션으로만 그릴 수 있다 → 빌드 때 미리 그리지 않는다
export const dynamic = 'force-dynamic'

// 브라우저 탭 이름 (ui-90 AC-402.4)
export const metadata: Metadata = { title: '비트 PC 연결' }

export default async function ClaimSetupPage() {
  const me = await guardPage('/claim/setup')
  // guard는 승인된 병원 줄이 있을 때만 앱 경로를 연다 → 여기 올 수 없다. 던지면 오류 화면(app/error.tsx)이 내용 없이 안내한다
  if (me.hospital?.status !== 'approved') throw new Error('승인된 병원 줄이 없어요')
  return <SetupScreen clinicName={me.hospital.name} />
}
