import { DashboardPreview } from '@/components/preview/DashboardPreview'

// 로그인 화면 오른쪽 칸 (b2b-redesign REQ-214 AC-214.3, design.md '인증 화면'). 짜임은 승인 시안 docs/mockups/b2b-redesign/screens.mjs의 loginPC pane-r,
// 소개 문장은 ui-90 시안 docs/mockups/ui-90/entry/screens.mjs의 loginPC 글자 그대로다(AC-419.2).
// 소개 문장(small ink-2, 최대 480px) → 대시보드 미리보기(예시), 사이 16px. AuthFrame이 aside(canvas 바탕)에 넣고 1024px 미만에서는 숨긴다.
// 받는 것·누르는 것이 없고 서버에서 그대로 그린다
export function LoginAside() {
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-120 text-small text-ink-2">로그인하면 청구 사전점검과 우리 의원의 오늘 숫자를 한곳에서 이어서 봐요.</p>
      <DashboardPreview />
    </div>
  )
}
