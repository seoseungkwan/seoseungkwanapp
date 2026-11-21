import { isYmd } from '@/lib/analytics/dates'
import type { CompanyFields, EquipmentFields, PersonFields, RepairFields } from '@/types/contacts'
import { CONTACT_CATEGORIES } from './categories'

// 칸 한도·칸 이름·칸 검사·글자 모양(design.md '순수 함수' fields.ts). 사이트 비밀번호·계좌 값은 어디에도 남기지 않는다(문제 목록에는 칸 열쇠만)

/** 글자 수 한도 = DB 표 char_length 제약(design.md 'DB'). 화면 칸 maxLength도 이것 */
export const CONTACT_LIMITS = {
  company: { name: 40, phone: 30, work: 100, address: 200, homepage: 200, bizNo: 20, account: 100, siteId: 100, sitePw: 100, memo: 1000 },
  person: { name: 20, mobile: 30, role: 40 },
  equipment: { name: 60, serial: 60 },
  repair: { content: 200 },
} as const

/** 수리 비용 끝(원, DB bigint 검사 0 ~ 9,999,999,999) */
export const MAX_WON = 9_999_999_999

/** 칸 이름(requirements.md '화면 글자'). 업체 칸은 양식 '연락처' 머리글(분류~업체 메모)과 같은 글자·차례 */
export const FIELD_LABELS = {
  company: {
    category: '분류',
    name: '업체 이름',
    phone: '대표 전화',
    work: '하는 일·품목',
    address: '주소',
    homepage: '홈페이지',
    bizNo: '사업자번호',
    account: '계좌',
    siteId: '사이트 아이디',
    sitePw: '사이트 비밀번호',
    memo: '업체 메모',
  },
  person: { name: '이름', mobile: '휴대폰', role: '맡은 일' },
  equipment: { name: '장비 이름', serial: '일련번호', boughtOn: '들여온 날', warrantyUntil: '무상 수리 끝나는 날' },
  repair: { day: '날짜', content: '내용', cost: '비용' },
} as const

export type ProblemKind = 'empty' | 'too-long' | 'date' | 'money'
export type FieldProblem<K extends string = string> = { field: K; reason: ProblemKind }

/** 앞뒤 빈칸을 빼고 유니코드 NFC로 맞춘다(맥·윈도우 한글 조합 차이). 가운데 빈칸은 그대로 */
export function cleanText(s: string): string {
  return s.normalize('NFC').trim()
}

/** 코드포인트 수(DB char_length와 같음) */
export function textLength(s: string): number {
  return Array.from(s).length
}

// 칸 검사는 cleanText로 맞춘 값(보낼 값)으로 본다. 필수 칸은 비면 empty, 한도를 넘으면 too-long
function textProblems<K extends string>(
  values: Record<K, string>,
  limits: Readonly<Record<K, number>>,
  required: readonly K[],
): FieldProblem<K>[] {
  const problems: FieldProblem<K>[] = []
  for (const field of Object.keys(limits) as K[]) {
    const text = cleanText(values[field])
    if (required.includes(field) && text === '') problems.push({ field, reason: 'empty' })
    else if (textLength(text) > limits[field]) problems.push({ field, reason: 'too-long' })
  }
  return problems
}

const isCategory = (value: unknown) => CONTACT_CATEGORIES.some((c) => c.id === value)
const isDateOrNull = (value: string | null) => value === null || isYmd(value)

/** 업체 칸: 분류 넷 가운데 하나(아니면 empty) · 업체 이름 1~40자 · 나머지 칸 글자 수(칸 차례) */
export function companyProblems(fields: CompanyFields): FieldProblem<keyof CompanyFields>[] {
  const category: FieldProblem<keyof CompanyFields>[] = isCategory(fields.category) ? [] : [{ field: 'category', reason: 'empty' }]
  return [...category, ...textProblems<Exclude<keyof CompanyFields, 'category'>>(fields, CONTACT_LIMITS.company, ['name'])]
}

/** 담당자 칸: 이름 1~20자 · 휴대폰 30자 · 맡은 일 40자 */
export function personProblems(fields: PersonFields): FieldProblem<keyof PersonFields>[] {
  return textProblems(fields, CONTACT_LIMITS.person, ['name'])
}

/** 장비 칸: 장비 이름 1~60자 · 일련번호 60자 · 날짜 둘은 없거나 'YYYY-MM-DD' */
export function equipmentProblems(fields: EquipmentFields): FieldProblem<keyof EquipmentFields>[] {
  const problems: FieldProblem<keyof EquipmentFields>[] = textProblems<'name' | 'serial'>(fields, CONTACT_LIMITS.equipment, ['name'])
  if (!isDateOrNull(fields.boughtOn)) problems.push({ field: 'boughtOn', reason: 'date' })
  if (!isDateOrNull(fields.warrantyUntil)) problems.push({ field: 'warrantyUntil', reason: 'date' })
  return problems
}

/** 수리 기록 칸: 날짜 필수 'YYYY-MM-DD' · 내용 1~200자 · 비용은 없거나 0~9,999,999,999 정수 */
export function repairProblems(fields: RepairFields): FieldProblem<keyof RepairFields>[] {
  const problems: FieldProblem<keyof RepairFields>[] = []
  const day = cleanText(fields.day)
  if (day === '') problems.push({ field: 'day', reason: 'empty' })
  else if (!isYmd(day)) problems.push({ field: 'day', reason: 'date' })
  problems.push(...textProblems<'content'>(fields, CONTACT_LIMITS.repair, ['content']))
  const { cost } = fields
  if (cost !== null && !(Number.isSafeInteger(cost) && cost >= 0 && cost <= MAX_WON)) problems.push({ field: 'cost', reason: 'money' })
  return problems
}

/** 비용 글자 → 원. 빈 글자는 null, 쉼표·빈칸이 섞인 0 이상 정수(9,999,999,999까지)는 수, 그 밖은 'bad' */
export function parseWon(text: string): number | null | 'bad' {
  if (text.trim() === '') return null
  const digits = text.replace(/[,\s]/g, '')
  if (!/^\d+$/.test(digits)) return 'bad'
  const won = Number(digits)
  return won <= MAX_WON ? won : 'bad'
}

/** 천 단위 쉼표 */
export function wonText(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/**
 * 숫자만 9~11자리이고 0으로 시작하면 02-000-0000 · 031-000-0000 · 010-0000-0000 모양(02는 두 자리 지역 번호).
 * 그 밖(이미 '-'가 있음·0으로 시작하지 않음·자리 수가 안 맞음)은 그대로
 */
export function phoneText(value: string): string {
  const digits = value.trim()
  if (!/^0\d{8,10}$/.test(digits)) return value
  const area = digits.startsWith('02') ? 2 : 3
  const rest = digits.slice(area)
  if (rest.length !== 7 && rest.length !== 8) return value
  const middle = rest.length - 4
  return `${digits.slice(0, area)}-${rest.slice(0, middle)}-${rest.slice(middle)}`
}

/** 터치 기기 전화 링크: 숫자와 맨 앞 '+'만 남긴 tel: 주소. 숫자가 없으면 null */
export function telHref(value: string): string | null {
  const text = value.trim()
  const digits = text.replace(/\D/g, '')
  if (digits === '') return null
  return `tel:${text.startsWith('+') ? '+' : ''}${digits}`
}

/** 홈페이지 링크: http:// · https://(대소문자 무시)로 시작하면 그대로, 아니면 https://를 붙인다. 빈 값은 null */
export function homepageHref(value: string): string | null {
  const text = value.trim()
  if (text === '') return null
  return /^https?:\/\//i.test(text) ? text : `https://${text}`
}
