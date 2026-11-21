import { cleanText } from './fields'

// 엑셀 양식 시트·머리글(requirements.md 이미 정한 것 10번 글자 그대로, 가운뎃점은 U+00B7).
// 양식 파일 public/contacts/contacts-template.xlsx의 첫 줄이 이 상수와 같은지 template.test.ts(TASK-5)가 본다

export const GUIDE_SHEET = '쓰는 법'
export const CONTACT_SHEET = '연락처'
export const EQUIPMENT_SHEET = '장비'

export const CONTACT_HEADERS = [
  '분류',
  '업체 이름',
  '대표 전화',
  '하는 일·품목',
  '주소',
  '홈페이지',
  '사업자번호',
  '계좌',
  '사이트 아이디',
  '사이트 비밀번호',
  '업체 메모',
  '담당자 이름',
  '담당자 휴대폰',
  '맡은 일',
] as const
export const EQUIPMENT_HEADERS = ['업체 이름', '장비 이름', '일련번호', '들여온 날', '무상 수리 끝나는 날'] as const

// 머리글과 같은 차례의 칸 열쇠
export const CONTACT_KEYS = [
  'category',
  'name',
  'phone',
  'work',
  'address',
  'homepage',
  'bizNo',
  'account',
  'siteId',
  'sitePw',
  'memo',
  'personName',
  'personMobile',
  'personRole',
] as const
export const EQUIPMENT_KEYS = ['company', 'name', 'serial', 'boughtOn', 'warrantyUntil'] as const
export type ContactKey = (typeof CONTACT_KEYS)[number]
export type EquipmentKey = (typeof EQUIPMENT_KEYS)[number]

/** 엑셀 칸 값 하나(xlsx sheet_to_json raw, 날짜 칸은 숫자로 온다) */
export type Cell = string | number | boolean | null

/** 적힌 줄만. row = 엑셀 줄 번호(머리글 = 1) */
export type SheetRows = {
  contacts: { row: number; cells: Record<ContactKey, Cell> }[]
  equipment: { row: number; cells: Record<EquipmentKey, Cell> }[]
}

/** 칸 값 → 글자: 글자는 앞뒤 빈칸을 빼고 NFC, 숫자·참거짓은 String(값)(앞자리 0을 되살리지 않음), null은 '' */
export function cellText(cell: Cell | undefined): string {
  if (cell === null || cell === undefined) return ''
  return cleanText(typeof cell === 'string' ? cell : String(cell))
}

/**
 * 머리글 줄 칸 값에서 머리글마다 칸 자리(0부터)를 찾는다. 차례는 상관없고 모르는 칸은 버린다.
 * 같은 머리글이 둘이면 앞 칸. 하나라도 없으면 null
 */
export function mapHeaders(cells: readonly (Cell | undefined)[], headers: readonly string[]): number[] | null {
  const texts = Array.from(cells, (cell) => (typeof cell === 'string' ? cellText(cell) : null))
  const places: number[] = []
  for (const header of headers) {
    const at = texts.indexOf(header.normalize('NFC'))
    if (at < 0) return null
    places.push(at)
  }
  return places
}
