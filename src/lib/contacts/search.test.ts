import { describe, expect, it } from 'vitest'
import type { Company, ContactBook, Equipment, Person } from '@/types/contacts'
import { countByCategory, highlightParts, normalizeQuery, searchCompanies } from './search'

// 지어낸 업체만(예시…)
const company = (id: string, name: string, category: Company['category'], over: Partial<Company> = {}): Company => ({
  id,
  category,
  name,
  phone: '',
  work: '',
  address: '',
  homepage: '',
  bizNo: '',
  account: '',
  siteId: '',
  sitePw: '',
  memo: '',
  ...over,
})
const person = (id: string, companyId: string, name: string): Person => ({ id, companyId, name, mobile: '010-0000-0000', role: '' })
const equipment = (id: string, companyId: string, name: string): Equipment => ({
  id,
  companyId,
  name,
  serial: '',
  boughtOn: null,
  warrantyUntil: null,
})

const BOOK: ContactBook = {
  companies: [
    company('c1', '예시메디칼', 'supplier', {
      phone: '02-000-0000',
      work: '물리치료 기계, 충격파 헤드',
      memo: '매달 말에 주문',
      address: '서울 예시구',
      siteId: 'medi',
      sitePw: 'secret',
      account: '예시은행 000-000',
    }),
    company('c2', '예시설비', 'repair', { phone: '031-000-0000', work: '냉난방기 수리' }),
    company('c3', '가나약품', 'supplier', { work: 'ECG 전극' }),
    company('c4', '예시공단', 'agency'),
    company('c5', '다른상사', 'other', { work: '사무용품' }),
    company('c6', '나라수리', 'repair'),
  ],
  people: [person('p1', 'c1', '김예시'), person('p2', 'c1', '이예시'), person('p3', 'c2', '박예시'), person('p4', 'c5', '김다른')],
  equipment: [equipment('e1', 'c1', '충격파 기계'), equipment('e2', 'c2', '천장형 냉난방기'), equipment('e3', 'c2', '천장형 냉난방기')],
  repairs: [],
}
const names = (results: ReturnType<typeof searchCompanies>) => results.map((r) => r.company.name)

describe('AC-6503.9 normalizeQuery', () => {
  it('AC-6503.9: NFC로 맞추고 영문은 소문자로, 띄어쓰기는 모두 뺀다', () => {
    expect(normalizeQuery(' 충격 파 ')).toBe('충격파')
    expect(normalizeQuery('ECG Pad')).toBe('ecgpad')
    expect(normalizeQuery('예시'.normalize('NFD'))).toBe('예시')
    expect(normalizeQuery('가\t나　다')).toBe('가나다')
    expect(normalizeQuery('')).toBe('')
  })
})

describe('AC-6503.9 searchCompanies', () => {
  it('AC-6503.9: 빈 찾는 말 + 전체는 모든 업체를 분류 차례 → 묶음 안 가나다로, 찾은 담당자·장비는 빈 목록', () => {
    const results = searchCompanies(BOOK, '', 'all')
    expect(names(results)).toEqual(['가나약품', '예시메디칼', '나라수리', '예시설비', '예시공단', '다른상사'])
    for (const r of results) {
      expect(r.people).toEqual([])
      expect(r.equipment).toEqual([])
    }
  })

  it('AC-6503.9: 분류를 고르면 그 분류 업체만이다(repair + 빈 찾는 말)', () => {
    expect(names(searchCompanies(BOOK, '', 'repair'))).toEqual(['나라수리', '예시설비'])
    expect(names(searchCompanies(BOOK, '   ', 'agency'))).toEqual(['예시공단'])
  })

  it('AC-6503.9: 업체 이름에서 찾는다(메디 → 예시메디칼)', () => {
    const results = searchCompanies(BOOK, '메디', 'all')
    expect(names(results)).toEqual(['예시메디칼'])
    expect(results[0]).toMatchObject({ people: [], equipment: [] })
  })

  it('AC-6503.9: 담당자 이름에서 찾으면 그 업체와 찾은 담당자 이름이다(김예 → 예시메디칼, [김예시])', () => {
    expect(searchCompanies(BOOK, '김예', 'all')).toEqual([{ company: BOOK.companies[0], people: ['김예시'], equipment: [] }])
    const yesi = searchCompanies(BOOK, '예시', 'all')
    expect(names(yesi)).toEqual(['예시메디칼', '예시설비', '예시공단'])
    expect(yesi[0].people).toEqual(['김예시', '이예시'])
    expect(yesi[1].people).toEqual(['박예시'])
  })

  it('AC-6503.9: 하는 일·품목에서 띄어쓰기를 무시하고 찾는다(충격 파 = 충격파)', () => {
    expect(names(searchCompanies(BOOK, '충격 파', 'all'))).toEqual(['예시메디칼'])
    expect(names(searchCompanies(BOOK, '충격파', 'all'))).toEqual(['예시메디칼'])
    expect(searchCompanies(BOOK, '충격파', 'all')[0].equipment).toEqual(['충격파 기계'])
  })

  it('AC-6503.9: 영문 대소문자를 무시한다(ECG = ecg)', () => {
    expect(names(searchCompanies(BOOK, 'ECG', 'all'))).toEqual(['가나약품'])
    expect(names(searchCompanies(BOOK, 'ecg', 'all'))).toEqual(['가나약품'])
  })

  it('AC-6503.9: 장비 이름에서 찾으면 찾은 장비 이름이다(같은 이름은 한 번)', () => {
    expect(searchCompanies(BOOK, '천장형', 'all')).toEqual([{ company: BOOK.companies[1], people: [], equipment: ['천장형 냉난방기'] }])
  })

  it('AC-6503.9: 전화·주소·메모·사이트 칸·계좌는 찾지 않는다', () => {
    for (const q of ['02-000', '031', '예시구', '매달', 'medi', 'secret', '예시은행']) {
      expect(searchCompanies(BOOK, q, 'all'), q).toEqual([])
    }
  })

  it('AC-6503.9: 분류와 찾는 말을 함께 본다', () => {
    expect(names(searchCompanies(BOOK, '예시', 'supplier'))).toEqual(['예시메디칼'])
    expect(searchCompanies(BOOK, '메디', 'repair')).toEqual([])
  })

  it('AC-6503.9: NFD로 저장된 이름도 찾는다', () => {
    const book: ContactBook = { ...BOOK, companies: [company('n1', '예시메디칼'.normalize('NFD'), 'supplier')] }
    expect(searchCompanies(book, '메디', 'all')).toHaveLength(1)
  })
})

describe('AC-6503.9 highlightParts', () => {
  it('AC-6503.9: 찾은 곳과 아닌 곳 조각으로 나눈다', () => {
    expect(highlightParts('물리치료 기계, 충격파 헤드', '충격파')).toEqual([
      { text: '물리치료 기계, ', hit: false },
      { text: '충격파', hit: true },
      { text: ' 헤드', hit: false },
    ])
  })

  it('AC-6503.9: 띄어쓰기를 건너 맞춘 곳은 원래 글자 자리(가운데 빈칸 포함)다', () => {
    expect(highlightParts('예시 메디칼', '시메')).toEqual([
      { text: '예', hit: false },
      { text: '시 메', hit: true },
      { text: '디칼', hit: false },
    ])
    expect(highlightParts('충격파 기계', '충격 파')).toEqual([
      { text: '충격파', hit: true },
      { text: ' 기계', hit: false },
    ])
  })

  it('AC-6503.9: 여러 곳을 찾고, 영문 대소문자는 원래 글자로 돌려준다', () => {
    expect(highlightParts('ECG 전극, ecg 패드', 'ecg')).toEqual([
      { text: 'ECG', hit: true },
      { text: ' 전극, ', hit: false },
      { text: 'ecg', hit: true },
      { text: ' 패드', hit: false },
    ])
  })

  it('AC-6503.9: 빈 찾는 말·못 찾음은 통째 한 조각, 빈 글자는 빈 목록', () => {
    expect(highlightParts('예시메디칼', '')).toEqual([{ text: '예시메디칼', hit: false }])
    expect(highlightParts('예시메디칼', '설비')).toEqual([{ text: '예시메디칼', hit: false }])
    expect(highlightParts('', '예시')).toEqual([])
  })

  it('AC-6503.9: 조각을 이으면 원래 글자다(이모지가 있어도)', () => {
    const text = '😀 예시 메디칼 😀'
    const parts = highlightParts(text, '메디')
    expect(parts.map((p) => p.text).join('')).toBe(text)
    expect(parts.filter((p) => p.hit).map((p) => p.text)).toEqual(['메디'])
  })
})

describe('AC-6503.9 countByCategory', () => {
  it('AC-6503.9: 결과의 분류별·전체 수다', () => {
    expect(countByCategory(searchCompanies(BOOK, '', 'all'))).toEqual({ all: 6, supplier: 2, repair: 2, agency: 1, other: 1 })
    expect(countByCategory(searchCompanies(BOOK, '예시', 'all'))).toEqual({ all: 3, supplier: 1, repair: 1, agency: 1, other: 0 })
    expect(countByCategory([])).toEqual({ all: 0, supplier: 0, repair: 0, agency: 0, other: 0 })
  })
})
