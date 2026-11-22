import { describe, expect, it } from 'vitest'
import { CONTACT_LIMITS } from '@/lib/contacts/fields'
import { BROKER_WORK, brokerBody, brokerFromNote, brokerNote } from './broker'

// [주소록에 넣기] 몸통 (spec location AC-7910.4, design.md 14절). 주소록 저장 함수(lib/storage/contacts.ts addCompany·addPerson)는
// 부르지 않고 그 칸 모양(CompanyFields·PersonFields)으로 몸통만 만든다. 같은 이름 업체에 잇기는 부르는 쪽('duplicate')이 맡는다

describe('AC-7910.4: 중개사 → 주소록 몸통', () => {
  it('AC-7910.4: 분류 other · 하는 일 부동산 중개 · 업체 이름·전화 + 담당자 이름, 나머지 칸은 빈 글자', () => {
    expect(BROKER_WORK).toBe('부동산 중개')
    expect(brokerBody({ office: '예시공인중개사', person: '이예시', phone: '010-0000-0012' })).toEqual({
      company: {
        category: 'other',
        name: '예시공인중개사',
        phone: '010-0000-0012',
        work: '부동산 중개',
        address: '',
        homepage: '',
        bizNo: '',
        account: '',
        siteId: '',
        sitePw: '',
        memo: '',
      },
      person: { name: '이예시', mobile: '', role: '' },
    })
  })

  it('AC-7910.4: 업체 이름이 없으면 몸통이 없다(null), 담당자가 없으면 담당자만 null', () => {
    expect(brokerBody({ office: ' ', person: '김예시', phone: '010' })).toBeNull()
    expect(brokerBody({ office: '예시중개', person: '', phone: '' })?.person).toBeNull()
  })

  it('AC-7910.4: 몸통 글자는 앞뒤 빈칸을 빼고 주소록 칸 한도 안이다', () => {
    const body = brokerBody({ office: ' 예시부동산 ', person: ' 김예시 ', phone: ' 010-0000-0011 ' })!
    expect([body.company.name, body.company.phone, body.person?.name]).toEqual(['예시부동산', '010-0000-0011', '김예시'])
    expect(body.company.name.length).toBeLessThanOrEqual(CONTACT_LIMITS.company.name)
  })

  it('AC-7910.4: 매물 중개사 글은 `업체 · 담당자 · 전화`(빈 칸 뺌)이고 그 글에서 세 칸을 되읽는다', () => {
    const b = { office: '예시중개', person: '박예시', phone: '010-0000-0013' }
    expect(brokerNote(b)).toBe('예시중개 · 박예시 · 010-0000-0013')
    expect(brokerFromNote(brokerNote(b))).toEqual(b)
    expect(brokerFromNote('예시중개 · 010-0000-0013')).toEqual({ office: '예시중개', person: '', phone: '010-0000-0013' })
    expect(brokerFromNote('예시부동산 김예시')).toEqual({ office: '예시부동산 김예시', person: '', phone: '' })
    expect(brokerFromNote('')).toEqual({ office: '', person: '', phone: '' })
    expect(brokerBody(brokerFromNote('010-0000-0013'))).toBeNull()
  })
})
