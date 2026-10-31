import { NotReadyScreen } from '@/components/common/NotReadyScreen'
import { notReadyFeature } from '@/components/common/notReadyFeatures'

// /notices 고시·공지 — 준비 중 화면 (tab-frame REQ-305). 화면이 생기면 이 파일을 진짜 화면으로 바꾼다
export default function NoticesPage() {
  return <NotReadyScreen feature={notReadyFeature('/notices')} />
}
