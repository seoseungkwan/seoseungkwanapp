import { ClaimEntry } from '@/components/claim/setup/ClaimEntry'

// /claim (REQ-006 자리만). 문지기와 앱 틀은 (app)/layout이 준다. 통로는 브라우저(ClaimEntry → useBridge)가 연다.
// 연결이 안 된 PC 크롬이면 /claim/setup으로, 확장 없는 곳·휴대폰이면 '밖에서 보는 건수' 자리. 점검 화면은 TASK-13, 건수는 TASK-19
export default function ClaimPage() {
  return <ClaimEntry />
}
