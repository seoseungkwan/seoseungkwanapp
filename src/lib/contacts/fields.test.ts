import { describe, expect, it } from 'vitest'
import type { CompanyFields, EquipmentFields, PersonFields, RepairFields } from '@/types/contacts'
import {
  CONTACT_LIMITS,
  FIELD_LABELS,
  MAX_WON,
  cleanText,
  companyProblems,
  equipmentProblems,
  homepageHref,
  parseWon,
  personProblems,
  phoneText,
  repairProblems,
  telHref,
  textLength,
  wonText,
} from './fields'
import { CONTACT_HEADERS, EQUIPMENT_HEADERS } from './sheet'

const company = (over: Partial<CompanyFields> = {}): CompanyFields => ({
  category: 'supplier',
  name: '예시메디칼',
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
const person = (over: Partial<PersonFields> = {}): PersonFields => ({ name: '김예시', mobile: '', role: '', ...over })
const equipment = (over: Partial<EquipmentFields> = {}): EquipmentFields => ({
  name: '충격파 기계',
  serial: '',
  boughtOn: null,
  warrantyUntil: null,
  ...over,
})
const repair = (over: Partial<RepairFields> = {}): RepairFields => ({ day: '2026-11-21', content: '헤드 교체', cost: null, ...over })
const chars = (n: number, ch = '가') => ch.repeat(n)

describe('AC-6503.1 글자 수 한도·칸 이름', () => {
  it('AC-6503.1: 글자 수 한도는 design.md DB 표 그대로다', () => {
    expect(CONTACT_LIMITS).toEqual({
      company: { name: 40, phone: 30, work: 100, address: 200, homepage: 200, bizNo: 20, account: 100, siteId: 100, sitePw: 100, memo: 1000 },
      person: { name: 20, mobile: 30, role: 40 },
      equipment: { name: 60, serial: 60 },
      repair: { content: 200 },
    })
    expect(MAX_WON).toBe(9_999_999_999)
  })

  it('AC-6503.1: 업체 칸 이름은 양식 머리글(분류~업체 메모)과 같고, 담당자·장비·수리 기록 칸 이름은 화면 글자다', () => {
    expect(Object.values(FIELD_LABELS.company)).toEqual(CONTACT_HEADERS.slice(0, 11))
    expect(Object.keys(FIELD_LABELS.company)).toEqual([
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
    ])
    expect(FIELD_LABELS.person).toEqual({ name: '이름', mobile: '휴대폰', role: '맡은 일' })
    expect(FIELD_LABELS.equipment).toEqual({ name: '장비 이름', serial: '일련번호', boughtOn: '들여온 날', warrantyUntil: '무상 수리 끝나는 날' })
    expect(Object.values(FIELD_LABELS.equipment)).toEqual(EQUIPMENT_HEADERS.slice(1))
    expect(FIELD_LABELS.repair).toEqual({ day: '날짜', content: '내용', cost: '비용' })
  })
})

describe('AC-6503.1 cleanText·textLength', () => {
  it('AC-6503.1: cleanText는 앞뒤 빈칸을 빼고 NFC로 맞춘다(가운데 빈칸은 그대로)', () => {
    expect(cleanText('  예시 메디칼 \t')).toBe('예시 메디칼')
    expect(cleanText('예시메디칼'.normalize('NFD'))).toBe('예시메디칼')
    expect(cleanText('예시메디칼'.normalize('NFD')).length).toBe(5)
    expect(cleanText('　김예시 ')).toBe('김예시')
    expect(cleanText('')).toBe('')
  })

  it('AC-6503.1: textLength는 코드포인트 수다(DB char_length와 같음)', () => {
    expect(textLength('예시메디칼')).toBe(5)
    expect(textLength('A😀B')).toBe(3)
    expect(textLength('')).toBe(0)
  })
})

describe('AC-6503.1 companyProblems', () => {
  it('AC-6503.1: 빈 업체 이름은 empty, 한도를 넘는 칸은 too-long(칸 차례), 맞으면 빈 목록', () => {
    expect(companyProblems(company())).toEqual([])
    expect(companyProblems(company({ name: '   ' }))).toEqual([{ field: 'name', reason: 'empty' }])
    expect(companyProblems(company({ name: chars(41) }))).toEqual([{ field: 'name', reason: 'too-long' }])
    expect(companyProblems(company({ name: chars(40) }))).toEqual([])
    expect(
      companyProblems(
        company({ memo: chars(1001), phone: chars(31, '0'), bizNo: chars(21, '1'), sitePw: chars(101, 'p'), account: chars(101, '9') }),
      ),
    ).toEqual([
      { field: 'phone', reason: 'too-long' },
      { field: 'bizNo', reason: 'too-long' },
      { field: 'account', reason: 'too-long' },
      { field: 'sitePw', reason: 'too-long' },
      { field: 'memo', reason: 'too-long' },
    ])
  })

  it('AC-6503.1: 각 칸 한도 글자 수까지는 되고 한 글자 넘으면 too-long이다', () => {
    for (const [field, limit] of Object.entries(CONTACT_LIMITS.company)) {
      const key = field as keyof typeof CONTACT_LIMITS.company
      expect(companyProblems(company({ [key]: chars(limit) })), field).toEqual([])
      expect(companyProblems(company({ [key]: chars(limit + 1) })), field).toEqual([{ field: key, reason: 'too-long' }])
    }
  })

  it('AC-6503.1: 글자 수는 앞뒤 빈칸을 뺀 값의 코드포인트로 센다', () => {
    expect(companyProblems(company({ name: ` ${chars(40)} ` }))).toEqual([])
    expect(companyProblems(company({ name: '😀'.repeat(40) }))).toEqual([])
    expect(companyProblems(company({ name: '😀'.repeat(41) }))).toEqual([{ field: 'name', reason: 'too-long' }])
  })

  it('AC-6503.1: 넷 밖의 분류는 empty(고른 분류가 없음)다', () => {
    expect(companyProblems(company({ category: 'x' as CompanyFields['category'] }))).toEqual([{ field: 'category', reason: 'empty' }])
  })
})

describe('AC-6503.1 personProblems·equipmentProblems·repairProblems', () => {
  it('AC-6503.1: 담당자 이름은 필수 1~20자, 휴대폰 30자·맡은 일 40자까지', () => {
    expect(personProblems(person())).toEqual([])
    expect(personProblems(person({ name: ' ' }))).toEqual([{ field: 'name', reason: 'empty' }])
    expect(personProblems(person({ name: chars(20) }))).toEqual([])
    expect(personProblems(person({ name: chars(21), mobile: chars(31, '0'), role: chars(41) }))).toEqual([
      { field: 'name', reason: 'too-long' },
      { field: 'mobile', reason: 'too-long' },
      { field: 'role', reason: 'too-long' },
    ])
    expect(personProblems(person({ mobile: chars(30, '0'), role: chars(40) }))).toEqual([])
  })

  it('AC-6503.1: 장비 이름은 필수 1~60자, 일련번호 60자까지, 날짜는 없거나 YYYY-MM-DD', () => {
    expect(equipmentProblems(equipment())).toEqual([])
    expect(equipmentProblems(equipment({ name: '' }))).toEqual([{ field: 'name', reason: 'empty' }])
    expect(equipmentProblems(equipment({ name: chars(60), serial: chars(60, 'S') }))).toEqual([])
    expect(equipmentProblems(equipment({ name: chars(61), serial: chars(61, 'S') }))).toEqual([
      { field: 'name', reason: 'too-long' },
      { field: 'serial', reason: 'too-long' },
    ])
    expect(equipmentProblems(equipment({ boughtOn: '2026-01-05', warrantyUntil: '2028-01-04' }))).toEqual([])
    expect(equipmentProblems(equipment({ boughtOn: '2026-13-01', warrantyUntil: '2026.01.05' }))).toEqual([
      { field: 'boughtOn', reason: 'date' },
      { field: 'warrantyUntil', reason: 'date' },
    ])
    // 끝나는 날이 들여온 날보다 앞서도 받는다(design.md '이 명세가 정한 것')
    expect(equipmentProblems(equipment({ boughtOn: '2026-02-01', warrantyUntil: '2026-01-01' }))).toEqual([])
  })

  it('AC-6503.1: 수리 기록은 날짜 필수(YYYY-MM-DD), 내용 1~200자, 비용은 없거나 0~9,999,999,999 정수', () => {
    expect(repairProblems(repair())).toEqual([])
    expect(repairProblems(repair({ day: '' }))).toEqual([{ field: 'day', reason: 'empty' }])
    expect(repairProblems(repair({ day: '2026-02-30' }))).toEqual([{ field: 'day', reason: 'date' }])
    expect(repairProblems(repair({ content: '  ' }))).toEqual([{ field: 'content', reason: 'empty' }])
    expect(repairProblems(repair({ content: chars(200) }))).toEqual([])
    expect(repairProblems(repair({ content: chars(201) }))).toEqual([{ field: 'content', reason: 'too-long' }])
    expect(repairProblems(repair({ cost: 0 }))).toEqual([])
    expect(repairProblems(repair({ cost: 9_999_999_999 }))).toEqual([])
    expect(repairProblems(repair({ cost: -1 }))).toEqual([{ field: 'cost', reason: 'money' }])
    expect(repairProblems(repair({ cost: 10_000_000_000 }))).toEqual([{ field: 'cost', reason: 'money' }])
    expect(repairProblems(repair({ cost: 1.5 }))).toEqual([{ field: 'cost', reason: 'money' }])
    expect(repairProblems(repair({ cost: Number.NaN }))).toEqual([{ field: 'cost', reason: 'money' }])
  })
})

describe('AC-6503.1 parseWon·wonText', () => {
  it('AC-6503.1: 빈 글자는 null, 쉼표·빈칸이 있는 0 이상 정수는 수, 그 밖은 bad', () => {
    expect(parseWon('')).toBeNull()
    expect(parseWon('   ')).toBeNull()
    expect(parseWon('0')).toBe(0)
    expect(parseWon('150000')).toBe(150_000)
    expect(parseWon('150,000')).toBe(150_000)
    expect(parseWon(' 1,234,567 ')).toBe(1_234_567)
    expect(parseWon('9,999,999,999')).toBe(9_999_999_999)
    expect(parseWon('10,000,000,000')).toBe('bad')
    expect(parseWon('-1')).toBe('bad')
    expect(parseWon('1.5')).toBe('bad')
    expect(parseWon('15만')).toBe('bad')
    expect(parseWon('abc')).toBe('bad')
    expect(parseWon(',')).toBe('bad')
    expect(parseWon('１２３')).toBe('bad')
  })

  it('AC-6503.10: wonText는 천 단위 쉼표다', () => {
    expect(wonText(0)).toBe('0')
    expect(wonText(999)).toBe('999')
    expect(wonText(1000)).toBe('1,000')
    expect(wonText(150_000)).toBe('150,000')
    expect(wonText(9_999_999_999)).toBe('9,999,999,999')
  })
})

describe('AC-6503.10 phoneText·telHref·homepageHref', () => {
  it('AC-6503.10: 숫자만 9~11자리이고 0으로 시작하면 지역·휴대폰 모양으로 바꾼다(02는 두 자리)', () => {
    expect(phoneText('0212345678')).toBe('02-1234-5678')
    expect(phoneText('021234567')).toBe('02-123-4567')
    expect(phoneText('0311234567')).toBe('031-123-4567')
    expect(phoneText('03112345678')).toBe('031-1234-5678')
    expect(phoneText('01012345678')).toBe('010-1234-5678')
    expect(phoneText('0101234567')).toBe('010-123-4567')
  })

  it('AC-6503.10: 그 밖은 그대로다', () => {
    expect(phoneText('212345678')).toBe('212345678')
    expect(phoneText('02-000-0000')).toBe('02-000-0000')
    expect(phoneText('010 1234 5678')).toBe('010 1234 5678')
    expect(phoneText('15881234')).toBe('15881234')
    expect(phoneText('02123456')).toBe('02123456')
    expect(phoneText('050512345678')).toBe('050512345678')
    expect(phoneText('031123456')).toBe('031123456')
    expect(phoneText('02123456789')).toBe('02123456789')
    expect(phoneText('')).toBe('')
    expect(phoneText('+82-10-1234-5678')).toBe('+82-10-1234-5678')
  })

  it('AC-6503.10: telHref는 숫자와 맨 앞 +만 남긴 tel: 주소, 숫자가 없으면 null', () => {
    expect(telHref('02-1234-5678')).toBe('tel:0212345678')
    expect(telHref(' 010 1234 5678 ')).toBe('tel:01012345678')
    expect(telHref('+82-10-1234-5678')).toBe('tel:+821012345678')
    expect(telHref('1588-1234 (내선 2)')).toBe('tel:158812342')
    expect(telHref('02+123')).toBe('tel:02123')
    expect(telHref('없음')).toBeNull()
    expect(telHref('')).toBeNull()
    expect(telHref('+')).toBeNull()
  })

  it('AC-6503.10: homepageHref는 http(s)://로 시작하면 그대로, 아니면 https://를 붙이고, 빈 값은 null', () => {
    expect(homepageHref('www.example.com')).toBe('https://www.example.com')
    expect(homepageHref('https://example.com/a')).toBe('https://example.com/a')
    expect(homepageHref('http://example.com')).toBe('http://example.com')
    expect(homepageHref('HTTPS://EXAMPLE.COM')).toBe('HTTPS://EXAMPLE.COM')
    expect(homepageHref('  example.com ')).toBe('https://example.com')
    expect(homepageHref('')).toBeNull()
    expect(homepageHref('   ')).toBeNull()
    // 다른 scheme은 https 주소 안의 글자가 된다(javascript: 링크가 생기지 않음)
    expect(homepageHref('javascript:alert(1)')).toBe('https://javascript:alert(1)')
  })
})
