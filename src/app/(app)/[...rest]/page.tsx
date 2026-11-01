import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

// 앱 안에서 없는 주소(/dashbord·/claim/close 등)를 받는 페이지 (ui-90 AC-410.1·AC-410.5, design.md '결정과 트레이드오프' 앱 안 404).
// 더 구체적인 주소(탭 13개·/admin·로그인·가입·대기·콜백)는 모두 자기 페이지가 있어 여기 오지 않는다.
// 앱 틀 레이아웃의 승인 검사를 같이 받은 뒤 notFound() → 앱 틀 안의 (app)/not-found.tsx가 그린다. 문지기·middleware는 그대로다

// 탭 이름(not-found와 같다)
export const metadata: Metadata = { title: '찾는 화면이 없어요' }

export default function UnknownAppPath(): never {
  notFound()
}
