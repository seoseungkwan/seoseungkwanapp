import { NotReadyScreen } from '@/components/common/NotReadyScreen'
import { notReadyFeature } from '@/components/common/notReadyFeatures'

// /contacts 주소록 — 준비 중 화면 (tab-frame REQ-305). 화면이 생기면 이 파일을 진짜 화면으로 바꾼다
export default function ContactsPage() {
  return <NotReadyScreen feature={notReadyFeature('/contacts')} />
}
