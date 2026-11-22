import { describe, expect, it } from 'vitest'
import { pyeongToM2 } from '@/lib/location/area'
import { EMPTY_PASTE, PASTE_TEXT, manToWon, readPaste, type PasteDraft } from './form'

// 매물 붙여 넣기 칸 읽기 (spec location REQ-7910 AC-7910.2·AC-7910.4, design.md 7절 location_listings·14절 [주소록에 넣기], 시안 ?s=listings).
// 적은 글자 → 저장 몸통(lib/storage/location.ts addListing의 칸 열넷) + 주소록 몸통(lib/storage/contacts.ts addCompany·addPerson 칸)

const draft = (over: Partial<PasteDraft> = {}): PasteDraft => ({ ...EMPTY_PASTE, title: '예시빌딩', area: '52', rent: '520', ...over })

function ok(d: PasteDraft) {
  const r = readPaste(d)
  if (!r.ok) throw new Error(`틀린 칸: ${JSON.stringify(r.errors)}`)
  return r
}
const errorsOf = (d: PasteDraft) => {
  const r = readPaste(d)
  return r.ok ? {} : r.errors
}

describe('AC-7910.2: 붙여 넣기 칸 → 매물 저장 몸통', () => {
  it('AC-7910.2: 칸 열넷 모두 — 금액은 만 원 × 10,000 원 정수, 넓이는 저장 ㎡, 새 매물은 후보·주소록·점이 비어 있다', () => {
    const r = ok(
      draft({
        url: ' https://m.land.naver.com/article/info.naver?articleNo=123 ',
        title: ' 예시빌딩 ',
        floor: '3층',
        area: '52',
        deposit: '10,000',
        rent: '520',
        premium: '0',
        mgmt: '78',
        memo: ' 주차 2대 ',
        book: false,
      }),
    )
    expect(r.fields).toEqual({
      candidateId: null,
      title: '예시빌딩',
      url: 'https://m.land.naver.com/article/info.naver?articleNo=123',
      areaM2: 171.9,
      floorLabel: '3층',
      deposit: 100_000_000,
      rent: 5_200_000,
      premium: 0,
      mgmt: 780_000,
      brokerId: null,
      brokerNote: '',
      memo: '주차 2대',
      lat: null,
      lng: null,
    })
    expect(r.broker).toBeNull()
    for (const v of [r.fields.deposit, r.fields.rent, r.fields.premium, r.fields.mgmt]) expect(Number.isSafeInteger(v)).toBe(true)
  })

  it('AC-7910.2: 링크는 비우거나 https 주소만 받는다(대문자 앞머리는 작은 글자로 맞춘다)', () => {
    expect(ok(draft({ url: '' })).fields.url).toBe('')
    expect(ok(draft({ url: 'HTTPS://fin.land.naver.com/x' })).fields.url).toBe('https://fin.land.naver.com/x')
    for (const bad of ['http://m.land.naver.com/article/1', 'm.land.naver.com/article/1', 'ftp://example.com', 'https://', 'https://a b', 'javascript:alert(1)']) {
      expect(errorsOf(draft({ url: bad })).url, bad).toBe(PASTE_TEXT.url)
    }
    expect(errorsOf(draft({ url: `https://example.com/${'a'.repeat(490)}` })).url).toBe(PASTE_TEXT.urlLong)
    expect(PASTE_TEXT.url).toBe('매물 링크는 주소창에 보이는 주소를 그대로 붙여 넣어 주세요. 보안 연결 주소만 받아요.')
  })

  it('AC-7910.2: 넓이는 평 또는 ㎡로 적고 저장은 ㎡(소수 2자리 버림, area.ts)', () => {
    expect(ok(draft({ area: '30.2', areaUnit: 'pyeong' })).fields.areaM2).toBe(99.83)
    expect(ok(draft({ area: '30', areaUnit: 'pyeong' })).fields.areaM2).toBe(pyeongToM2(30))
    expect(ok(draft({ area: '99.837', areaUnit: 'm2' })).fields.areaM2).toBe(99.83)
    expect(ok(draft({ area: '1,000', areaUnit: 'm2' })).fields.areaM2).toBe(1000)
    for (const bad of ['', '0', '-3', '3평', 'abc', '1.2.3', '0.001']) {
      expect(errorsOf(draft({ area: bad, areaUnit: 'm2' })).area, bad).toBe(PASTE_TEXT.area)
    }
    expect(PASTE_TEXT.area).toBe('전용 넓이를 숫자로 적어 주세요.')
  })

  it('AC-7910.2: 금액은 만 원 정수만 받는다(소수·빼기·글자는 틀림, 99억 9,999만 원까지)', () => {
    expect(manToWon('')).toBeNull()
    expect(manToWon(' 1,000 ')).toBe(10_000_000)
    expect(manToWon('0')).toBe(0)
    expect(manToWon('999,999')).toBe(9_999_990_000)
    for (const bad of ['52.5', '-1', '1억', '오백', '5e3']) expect(manToWon(bad), bad).toBe('bad')
    expect(manToWon('1,000,000')).toBe('big')

    const e = errorsOf(draft({ deposit: '1.5', rent: '52.5', premium: '-1', mgmt: '칠십' }))
    expect(e).toEqual({
      deposit: '보증금을 숫자로 적어 주세요(만 원).',
      rent: '월세를 숫자로 적어 주세요(만 원).',
      premium: '권리금을 숫자로 적어 주세요(만 원).',
      mgmt: '관리비를 숫자로 적어 주세요(만 원).',
    })
    expect(errorsOf(draft({ deposit: '1,000,000' })).deposit).toBe('보증금은 99억 9,999만 원까지 적을 수 있어요.')
  })

  it('AC-7910.2: 건물 이름·전용 넓이·월세는 꼭 적는다(시안 필수 표시), 나머지 금액은 비우면 null', () => {
    expect(errorsOf({ ...EMPTY_PASTE })).toEqual({
      title: '건물 이름을 적어 주세요.',
      area: '전용 넓이를 숫자로 적어 주세요.',
      rent: '월세를 숫자로 적어 주세요(만 원).',
    })
    const r = ok(draft())
    expect([r.fields.deposit, r.fields.premium, r.fields.mgmt]).toEqual([null, null, null])
  })
})

describe('AC-7910.4: 중개사 칸 → 매물 중개사 글 · 주소록 몸통', () => {
  it('AC-7910.4: [주소록에도 넣어요]를 켜면 분류 other·하는 일 부동산 중개 업체(이름·전화)와 담당자 몸통이 함께 나온다', () => {
    const r = ok(draft({ office: ' 예시부동산 ', person: '김예시', phone: '010-0000-0011', book: true }))
    expect(r.fields.brokerNote).toBe('예시부동산 · 김예시 · 010-0000-0011')
    expect(r.fields.brokerId).toBeNull()
    expect(r.broker).toEqual({
      company: {
        category: 'other',
        name: '예시부동산',
        phone: '010-0000-0011',
        work: '부동산 중개',
        address: '',
        homepage: '',
        bizNo: '',
        account: '',
        siteId: '',
        sitePw: '',
        memo: '',
      },
      person: { name: '김예시', mobile: '', role: '' },
    })
  })

  it('AC-7910.4: 끄면 주소록 몸통이 없고, 중개사 칸이 다 비면 켜도 없다', () => {
    const off = ok(draft({ office: '예시부동산', phone: '010-0000-0011', book: false }))
    expect(off.broker).toBeNull()
    expect(off.fields.brokerNote).toBe('예시부동산 · 010-0000-0011')
    const empty = ok(draft({ book: true }))
    expect(empty.broker).toBeNull()
    expect(empty.fields.brokerNote).toBe('')
  })

  it('AC-7910.4: 담당자가 비면 업체만(담당자 몸통 null)', () => {
    const r = ok(draft({ office: '예시중개', book: true }))
    expect(r.broker?.person).toBeNull()
    expect(r.broker?.company.name).toBe('예시중개')
  })

  it('AC-7910.4: 담당자·전화만 적고 중개사 이름이 없으면 틀림, 세 칸을 합쳐 40자를 넘으면 틀림', () => {
    expect(errorsOf(draft({ person: '김예시', phone: '010-0000-0011' })).office).toBe('중개사 이름을 적어 주세요.')
    expect(errorsOf(draft({ office: '가'.repeat(30), person: '나'.repeat(10), phone: '010' })).office).toBe(
      '중개사 이름·담당자·전화를 합쳐 40자까지 적을 수 있어요.',
    )
  })
})
