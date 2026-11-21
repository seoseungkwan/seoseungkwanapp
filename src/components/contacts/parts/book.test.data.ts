import { vi } from 'vitest'
import type { Company, ContactBook, Equipment, Person, Repair } from '@/types/contacts'

// 부품 시험이 같이 쓰는 지어낸 주소록(시안 docs/mockups/contacts/index.html BASE를 줄인 것). 업체·사람·번호는 모두 가짜다.
// 오늘은 시안처럼 2026-11-21. 업체 줄은 일부러 가나다·분류 차례가 아니다(목록이 차례를 맞추는지 보려고)

export const TODAY = '2026-11-21'

const company = (over: Partial<Company> & Pick<Company, 'id' | 'category' | 'name'>): Company => ({
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

export const MEDICAL = company({
  id: 'c-medical',
  category: 'supplier',
  name: '예시메디칼',
  phone: '02-000-0001',
  work: '의료기기 판매·수리, 충격파 기계, 초음파 진단기, 물리치료 소모품',
  address: '서울시 예시구 예시로 12, 3층',
  homepage: 'www.example.com',
  bizNo: '000-00-00001',
  account: '예시은행 000-000000-00-001 (예금주 예시메디칼)',
  siteId: 'yesi-clinic',
  sitePw: 'Yesi2026!',
  memo: '소모품 주문은 매달 첫째 주 월요일까지 해요.\n수리 기사는 하루 전에 전화로 잡아요.',
})
export const PHARM = company({ id: 'c-pharm', category: 'supplier', name: '예시약품', phone: '02-000-0002', work: '주사제, 수액, 소독약', memo: '오후 3시 전에 주문하면 다음 날 와요.' })
export const PHYSIO = company({
  id: 'c-physio',
  category: 'supplier',
  name: '예시물리치료기',
  phone: '02-000-0004',
  work: '물리치료 기계, 충격파 헤드·젤, 전기치료 패드, 핫팩',
  homepage: 'https://www.example.org',
})
export const FACILITY = company({ id: 'c-facility', category: 'repair', name: '예시설비', phone: '031-000-0011', work: '냉난방기·전기·배관 수리', address: '서울시 예시구 예시로 88' })
export const IT = company({ id: 'c-it', category: 'repair', name: '예시전산', phone: '02-000-0012', work: 'PC·프린터·인터넷 관리', siteId: 'yesi-it', sitePw: 'Remote-0000' })
export const FIX = company({ id: 'c-fix', category: 'repair', name: '예시정비', phone: '0212345678' })
export const LIAB = company({ id: 'c-liab', category: 'agency', name: '예시배상보험', phone: '02-000-0021', work: '의료배상 책임보험' })
export const TAX = company({ id: 'c-tax', category: 'other', name: '예시세무회계' })

const person = (id: string, companyId: string, name: string, mobile: string, role: string): Person => ({ id, companyId, name, mobile, role })
export const PEOPLE: Person[] = [
  person('p1', MEDICAL.id, '김예시', '010-0000-0001', '영업·주문'),
  person('p2', MEDICAL.id, '박예시', '01000000002', '수리 기사'),
  person('p3', PHARM.id, '이예시', '010-0000-0003', '영업'),
  person('p4', PHYSIO.id, '강예시', '010-0000-0004', '영업'),
  person('p5', FACILITY.id, '최예시', '010-0000-0011', '설비 기사'),
]

const equipment = (id: string, companyId: string, name: string, serial: string, boughtOn: string | null, warrantyUntil: string | null): Equipment => ({
  id,
  companyId,
  name,
  serial,
  boughtOn,
  warrantyUntil,
})
export const SHOCK = equipment('e1', MEDICAL.id, '충격파 기계', 'ESW-0000-01', '2025-12-03', '2026-12-03') // 12일 남음
export const ECHO = equipment('e2', MEDICAL.id, '초음파 진단기', 'US-0000-07', '2024-03-15', '2025-03-15') // 끝남
export const AIRCON = equipment('e3', FACILITY.id, '천장형 냉난방기', 'AC-0000-03', '2024-06-10', '2027-06-10') // 31일보다 많이 남음
export const SERVER = equipment('e4', IT.id, '원내 서버 PC', 'SV-0000-02', '2023-11-21', '2026-11-21') // 오늘 끝나요

const repair = (id: string, equipmentId: string, day: string, content: string, cost: number | null): Repair => ({ id, equipmentId, day, content, cost })
// created_at 차례: r1 → r2 → r3 → r4. r4는 r2와 같은 날이고 나중에 넣었다
export const REPAIRS: Repair[] = [
  repair('r1', SHOCK.id, '2026-06-18', '출력이 약해져 점검 · 출장비', 50000),
  repair('r2', SHOCK.id, '2026-10-02', '헤드 교체 (무상)', null),
  repair('r3', ECHO.id, '2025-08-21', '프로브 선 교체', 180000),
  repair('r4', SHOCK.id, '2026-10-02', '젤 보충', 3000),
]

export const BOOK: ContactBook = {
  companies: [TAX, PHARM, FIX, MEDICAL, LIAB, IT, PHYSIO, FACILITY],
  people: PEOPLE,
  equipment: [SHOCK, ECHO, AIRCON, SERVER],
  repairs: REPAIRS,
}

/** 복사(navigator.clipboard.writeText) 흉내. jsdom에는 clipboard가 없다 */
export function installClipboard(result: 'ok' | 'fail' = 'ok') {
  const writeText = vi.fn((text: string) => (result === 'ok' ? Promise.resolve(text).then(() => undefined) : Promise.reject(new Error('denied'))))
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  return writeText
}

export const TOUCH_QUERY = '(hover: none) and (pointer: coarse)'

/** 기기 흉내: touch면 터치 기기 질문(TOUCH_QUERY)에만 참. 폭 질문은 늘 거짓이다 */
export function installMatchMedia(touch: boolean) {
  const matchMedia = vi.fn((query: string) => ({
    matches: query === TOUCH_QUERY && touch,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }))
  Object.defineProperty(window, 'matchMedia', { value: matchMedia, configurable: true, writable: true })
  return matchMedia
}

/** 그려진 모든 클래스 가운데 화면 폭 접두사(sm·md·lg·xl·2xl·max-*·min-[…])가 붙은 것. 자세히 두 칸(min-[1200px]:)만 시안 값이다 */
export function widthClasses(root: ParentNode): string[] {
  const found = new Set<string>()
  for (const el of Array.from(root.querySelectorAll('[class]'))) {
    for (const token of (el.getAttribute('class') ?? '').split(/\s+/)) {
      const variants = token.split(':').slice(0, -1)
      if (variants.some((v) => /^(?:max-|min-)?(?:sm|md|lg|\d*xl)$/.test(v) || (/^(?:min|max)-\[/.test(v) && v !== 'min-[1200px]'))) found.add(token)
    }
  }
  return [...found]
}
