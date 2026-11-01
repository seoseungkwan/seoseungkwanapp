import type { Metadata } from 'next'
import { ClaimEntry } from '@/components/claim/setup/ClaimEntry'

// /claim (REQ-006 자리만). 문지기와 앱 틀은 (app)/layout이 준다. 통로는 브라우저(ClaimEntry → useBridge)가 연다.
// 연결이 안 된 PC 크롬이면 /claim/setup으로, 확장 없는 곳·휴대폰이면 "이 PC에서는 청구 점검을 열 수 없어요"(ClaimEntry 안 ClaimOffline).
// 화면마다 무엇이 나오는지는 ClaimEntry에 적었다. 점검 화면은 precheck TASK-13, 다른 PC에서 보는 건수는 precheck TASK-19

// 브라우저 탭 이름 (ui-90 AC-402.4)
export const metadata: Metadata = { title: '청구' }

export default function ClaimPage() {
  return <ClaimEntry />
}
