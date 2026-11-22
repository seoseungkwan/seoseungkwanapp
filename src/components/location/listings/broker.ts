import { cleanText } from '@/lib/contacts/fields'
import type { CompanyFields, PersonFields } from '@/types/contacts'

// 매물 중개사 → 주소록 몸통 (spec location AC-7910.4, design.md 14절 [주소록에 넣기]).
// 주소록 저장 함수(lib/storage/contacts.ts addCompany·addPerson)는 부르지 않는다 — 그 칸 모양(CompanyFields·PersonFields)으로 몸통만 만들어
// 콜백으로 넘기고, 넣기·같은 이름 업체('duplicate')에 잇기·매물 broker_id 고치기는 부르는 쪽(LocationScreen)이 한다(주소록 코드는 고치지 않음).
// 매물 줄에는 중개사 글 하나(broker_note ≤ 40자)만 있어서 `업체 · 담당자 · 전화`(빈 칸 뺌)로 적고, 저장한 줄의 [주소록에 넣기]는 그 글에서 세 칸을 되읽는다

export type BrokerInput = { office: string; person: string; phone: string }
export type BrokerBody = { company: CompanyFields; person: PersonFields | null }

/** 주소록 '하는 일·품목' 칸 */
export const BROKER_WORK = '부동산 중개'
/** 매물 중개사 글 끝(location_listings.broker_note) */
export const BROKER_NOTE_MAX = 40

const SEP = ' · '
// 전화 모양: 숫자 하나 이상 + 숫자·빈칸·괄호·+·-·.만
const PHONE = /^[\d\s()+.-]*\d[\d\s()+.-]*$/

const clean = (b: BrokerInput): BrokerInput => ({ office: cleanText(b.office), person: cleanText(b.person), phone: cleanText(b.phone) })

/** 매물 중개사 글: `업체 · 담당자 · 전화`(빈 칸 뺌) */
export function brokerNote(b: BrokerInput): string {
  const c = clean(b)
  return [c.office, c.person, c.phone].filter((t) => t !== '').join(SEP)
}

/** brokerNote가 쓴 글에서 세 칸을 되읽는다. 첫 조각은 업체, 나머지는 전화 모양이면 전화·아니면 담당자 */
export function brokerFromNote(note: string): BrokerInput {
  const parts = cleanText(note)
    .split(SEP)
    .map((t) => t.trim())
    .filter((t) => t !== '')
  const out: BrokerInput = { office: '', person: '', phone: '' }
  parts.forEach((part, i) => {
    if (PHONE.test(part)) {
      if (out.phone === '') out.phone = part
    } else if (i === 0) out.office = part
    else if (out.person === '') out.person = part
  })
  return out
}

/** 주소록 몸통: 분류 기타(other) · 하는 일 부동산 중개 · 업체 이름·전화 + 담당자 이름. 업체 이름이 없으면 null */
export function brokerBody(b: BrokerInput): BrokerBody | null {
  const c = clean(b)
  if (c.office === '') return null
  return {
    company: {
      category: 'other',
      name: c.office,
      phone: c.phone,
      work: BROKER_WORK,
      address: '',
      homepage: '',
      bizNo: '',
      account: '',
      siteId: '',
      sitePw: '',
      memo: '',
    },
    person: c.person === '' ? null : { name: c.person, mobile: '', role: '' },
  }
}
