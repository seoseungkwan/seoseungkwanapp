import type { Metadata } from 'next'
import { InventoryScreen } from '@/components/inventory/InventoryScreen'
import { todayInKorea } from '@/lib/analytics/dates'

// /inventory 재고 (specs/inventory REQ-7512, design.md 6절 TASK-15). 문지기와 앱 틀은 (app)/layout이 준다.
// 고른 도구(?tool=)는 화면이 주소에서 읽는다. 병원 id는 넘기지 않는다: 읽고 쓰기는 RLS·DB 기본값이 내 병원으로 한다

// 오늘은 요청 때의 한국 날짜다 → 빌드 때 미리 그리지 않는다
export const dynamic = 'force-dynamic'

// 브라우저 탭 이름
export const metadata: Metadata = { title: '재고' }

export default function InventoryPage() {
  return <InventoryScreen today={todayInKorea()} />
}
