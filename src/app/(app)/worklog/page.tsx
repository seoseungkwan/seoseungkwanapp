import type { Metadata } from 'next'
import { NotReadyScreen } from '@/components/common/NotReadyScreen'
import { notReadyFeature } from '@/components/common/notReadyFeatures'

// /worklog 업무일지 — 준비 중 화면 (tab-frame REQ-305). 화면이 생기면 이 파일을 진짜 화면으로 바꾼다
// 탭 이름(metadata)과 화면이 같은 항목 하나를 쓴다 (ui-90 AC-402.4)
const feature = notReadyFeature('/worklog')

export const metadata: Metadata = { title: feature.name }

export default function WorklogPage() {
  return <NotReadyScreen feature={feature} />
}
