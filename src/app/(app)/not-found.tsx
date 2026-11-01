import type { Metadata } from 'next'
import { NotFoundScreen } from '@/components/common/NotFoundScreen'

// 없는 주소 — 앱 안 모양 (ui-90 AC-410.1·AC-410.4). (app)/[...rest]가 부른 notFound()를 앱 틀(위 띠·탭 줄) 안에서 그린다

// 탭 이름: (app)/layout의 template으로 "찾는 화면이 없어요 · <의원 이름>"
export const metadata: Metadata = { title: '찾는 화면이 없어요' }

export default function AppNotFound() {
  return <NotFoundScreen where="app" />
}
