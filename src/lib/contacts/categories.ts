import type { ContactCategory } from '@/types/contacts'

// 분류 넷(requirements.md 이미 정한 것 2). 이 차례가 목록 묶음·칩 차례다. 글자는 엑셀 양식 '연락처' A열 목록 고르기와 같다(가운뎃점 U+00B7)
export const CONTACT_CATEGORIES = [
  { id: 'supplier', label: '거래처' },
  { id: 'repair', label: '수리·관리' },
  { id: 'agency', label: '기관·보험' },
  { id: 'other', label: '기타' },
] as const satisfies readonly { id: ContactCategory; label: string }[]

/** 분류 글자 → id. 네 글자 가운데 하나와 같을 때만(앞뒤 빈칸을 빼고 NFC로 견줌), 아니면 null */
export function categoryOf(label: string): ContactCategory | null {
  const text = label.normalize('NFC').trim()
  return CONTACT_CATEGORIES.find((c) => c.label === text)?.id ?? null
}

export function categoryLabel(id: ContactCategory): string {
  return CONTACT_CATEGORIES.find((c) => c.id === id)?.label ?? id
}
