import type { Company, ContactBook, ContactCategory } from '@/types/contacts'
import { CONTACT_CATEGORIES } from './categories'

// 찾기(requirements.md 이미 정한 것 9, 시안 기본값 2·4). 업체 이름·하는 일·품목·담당자 이름·장비 이름에서만 찾는다.
// 전화·주소·메모·사이트 칸·계좌는 찾지 않는다

export type SearchResult = { company: Company; people: string[]; equipment: string[] }
export type HighlightPart = { text: string; hit: boolean }
export type CategoryCounts = { all: number } & Record<ContactCategory, number>

const SPACE = /\s/
// 영문 대문자만 소문자로 바꾼다(글자 수가 그대로라 찾은 곳을 원래 글자 자리로 되돌릴 수 있다)
const lowerAscii = (s: string) => s.replace(/[A-Z]/g, (ch) => ch.toLowerCase())

/** 찾기 견주기 글자: NFC · 영문 소문자 · 띄어쓰기를 모두 뺌 */
export function normalizeQuery(s: string): string {
  return lowerAscii(s.normalize('NFC')).replace(/\s+/g, '')
}

const categoryRank = (category: ContactCategory) => {
  const rank = CONTACT_CATEGORIES.findIndex((c) => c.id === category)
  return rank < 0 ? CONTACT_CATEGORIES.length : rank
}
const unique = (names: string[]) => [...new Set(names)]

/**
 * 분류가 all이거나 같은 업체 가운데 찾는 말이 든 업체만, 분류 차례 → 업체 이름 가나다로.
 * people·equipment = 찾는 말이 든 그 업체 담당자·장비 이름(주소록 차례, 같은 이름은 한 번). 빈 찾는 말이면 모든 업체·빈 목록
 */
export function searchCompanies(book: ContactBook, query: string, category: ContactCategory | 'all'): SearchResult[] {
  const q = normalizeQuery(query)
  const has = (text: string) => normalizeQuery(text).includes(q)
  const results: SearchResult[] = []
  for (const company of book.companies) {
    if (category !== 'all' && company.category !== category) continue
    if (q === '') {
      results.push({ company, people: [], equipment: [] })
      continue
    }
    const people = unique(book.people.filter((p) => p.companyId === company.id && has(p.name)).map((p) => p.name))
    const equipment = unique(book.equipment.filter((m) => m.companyId === company.id && has(m.name)).map((m) => m.name))
    if (has(company.name) || has(company.work) || people.length > 0 || equipment.length > 0) results.push({ company, people, equipment })
  }
  return results.sort(
    (a, b) => categoryRank(a.company.category) - categoryRank(b.company.category) || a.company.name.localeCompare(b.company.name, 'ko'),
  )
}

/**
 * 원래 글자를 찾은 곳/아닌 곳 조각으로 나눈다(조각을 이으면 NFC로 맞춘 원래 글자).
 * 띄어쓰기를 건너 맞춘 곳은 원래 글자 자리 그대로(가운데 빈칸 포함)가 찾은 곳이다
 */
export function highlightParts(text: string, query: string): HighlightPart[] {
  const source = text.normalize('NFC')
  if (source === '') return []
  const q = normalizeQuery(query)
  if (q === '') return [{ text: source, hit: false }]

  // 견주는 글자(빈칸 뺌)의 글자 하나하나가 원래 글자 몇 번째(UTF-16 자리)인지
  let compared = ''
  const at: number[] = []
  let index = 0
  for (const ch of source) {
    if (!SPACE.test(ch)) {
      const lowered = lowerAscii(ch)
      compared += lowered
      for (let k = 0; k < lowered.length; k++) at.push(index + k)
    }
    index += ch.length
  }

  const hit = new Array<boolean>(source.length).fill(false)
  for (let from = compared.indexOf(q); from >= 0; from = compared.indexOf(q, from + q.length)) {
    for (let i = at[from]; i <= at[from + q.length - 1]; i++) hit[i] = true
  }

  const parts: HighlightPart[] = []
  let start = 0
  for (let i = 1; i <= source.length; i++) {
    if (i === source.length || hit[i] !== hit[start]) {
      parts.push({ text: source.slice(start, i), hit: hit[start] })
      start = i
    }
  }
  return parts
}

/** 결과의 분류별·전체 수(칩 숫자) */
export function countByCategory(results: readonly Pick<SearchResult, 'company'>[]): CategoryCounts {
  const counts: CategoryCounts = { all: 0, supplier: 0, repair: 0, agency: 0, other: 0 }
  for (const { company } of results) {
    counts.all++
    if (Object.hasOwn(counts, company.category)) counts[company.category]++
  }
  return counts
}
