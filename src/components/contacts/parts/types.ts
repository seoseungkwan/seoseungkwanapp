import type { ContactCategory } from '@/types/contacts'

// 주소록 화면 부품이 같이 쓰는 모양(spec contacts design.md '화면' parts/).
// 부품은 저장하지 않는다: 고치기·지우기는 콜백으로 넘기고 그 답(SaveResult)만 받는다. 저장 함수 결과를 이 모양으로 바꾸는 일은 화면(TASK-7)이 한다

/** 콜백 답. duplicate = 같은 이름(업체·담당자, DB 23505), failed = 그 밖 실패(E-CONTACTS-SAVE-FAILED). id = 새로 넣은 줄 */
export type SaveResult = { ok: true; id?: string } | { ok: false; reason: 'duplicate' | 'failed' }

/** 분류 칩 값: 전체 또는 분류 넷 가운데 하나 */
export type ChipValue = ContactCategory | 'all'
