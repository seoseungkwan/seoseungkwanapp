'use client'

import { ds } from '@/components/ui/classes'
import { DownloadIcon } from './icons'

// [양식 받기](design.md '흐름' 양식 받기, AC-6506.1). 앱이 양식을 만들지 않는다: 저장소 public/contacts/contacts-template.xlsx(사용자 양식)를
// 같은 사이트 정적 파일로 주소록-양식.xlsx 이름으로 내려받게 하는 링크다(서버 코드·Supabase·fetch 없음, middleware가 로그인한 사람만 보낸다).
// 누르면 onDownloaded() → 화면이 알림 TEMPLATE_DOWNLOADED를 띄운다

export const TEMPLATE_HREF = '/contacts/contacts-template.xlsx'
export const TEMPLATE_FILE_NAME = '주소록-양식.xlsx'
export const TEMPLATE_DOWNLOADED = '주소록-양식.xlsx를 받았어요.'

export function TemplateLink({ onDownloaded }: { onDownloaded: () => void }) {
  return (
    <a href={TEMPLATE_HREF} download={TEMPLATE_FILE_NAME} onClick={() => onDownloaded()} className={ds.button.secondary}>
      <DownloadIcon />
      양식 받기
    </a>
  )
}
