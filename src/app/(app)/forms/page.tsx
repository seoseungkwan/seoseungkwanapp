import type { Metadata } from 'next'
import { FormsScreen } from '@/components/forms/FormsScreen'

// /forms 서식 (specs/forms REQ-3501). 문지기와 앱 틀(여백 포함)은 (app)/layout이 준다 — 여기서 여백 틀을 더 씌우지 않는다

// 브라우저 탭 이름
export const metadata: Metadata = { title: '서식' }

export default function FormsPage() {
  return <FormsScreen />
}
