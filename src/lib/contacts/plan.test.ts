import { describe, expect, it } from 'vitest'
import type { Company, ContactBook, Equipment, ImportPayload, Person } from '@/types/contacts'
import { buildImportPlan, isEmptyPayload, type CompanyChange, type RowProblem } from './plan'
import { CONTACT_KEYS, EQUIPMENT_KEYS, type Cell, type ContactKey, type EquipmentKey, type SheetRows } from './sheet'

// 업체·담당자·장비는 모두 지어낸 것(예시…). 엑셀 줄 번호는 머리글이 1번째 줄
const EMPTY_CONTACT = Object.fromEntries(CONTACT_KEYS.map((k) => [k, null])) as Record<ContactKey, Cell>
const EMPTY_EQUIPMENT = Object.fromEntries(EQUIPMENT_KEYS.map((k) => [k, null])) as Record<EquipmentKey, Cell>
const c = (row: number, cells: Partial<Record<ContactKey, Cell>>) => ({ row, cells: { ...EMPTY_CONTACT, ...cells } })
const e = (row: number, cells: Partial<Record<EquipmentKey, Cell>>) => ({ row, cells: { ...EMPTY_EQUIPMENT, ...cells } })
const rows = (contacts: SheetRows['contacts'], equipment: SheetRows['equipment'] = []): SheetRows => ({ contacts, equipment })

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
const person = (id: string, companyId: string, name: string, mobile = '', role = ''): Person => ({ id, companyId, name, mobile, role })
const machine = (id: string, companyId: string, name: string, serial = '', over: Partial<Equipment> = {}): Equipment => ({
  id,
  companyId,
  name,
  serial,
  boughtOn: null,
  warrantyUntil: null,
  ...over,
})
const EMPTY_BOOK: ContactBook = { companies: [], people: [], equipment: [], repairs: [] }
const book = (over: Partial<ContactBook>): ContactBook => ({ ...EMPTY_BOOK, ...over })

const problem = (over: Partial<RowProblem> & Pick<RowProblem, 'sheet' | 'row' | 'reason'>): RowProblem => ({
  company: '',
  item: '',
  field: null,
  value: '',
  limit: null,
  ...over,
})
const change = (over: Partial<CompanyChange> & Pick<CompanyChange, 'name' | 'status' | 'category'>): CompanyChange => ({
  work: '',
  fields: [],
  peopleAdded: 0,
  equipmentAdded: 0,
  peopleChanged: [],
  equipmentChanged: [],
  ...over,
})
const NO_PAYLOAD: ImportPayload = { companies: [], people: [], equipment: [] }

describe('AC-6503.4 연락처 줄 묶기', () => {
  // design.md '예' 묶기
  const SHEET = rows([
    c(2, { category: '거래처', name: '예시메디칼', phone: '02-000-0000', work: '의료기기 판매', personName: '김예시', personMobile: '010-0000-0000', personRole: '영업' }),
    c(3, { name: '예시메디칼', personName: '이예시', personMobile: '010-0000-0001', personRole: '수리 기사' }),
    c(4, { category: '수리·관리', name: '예시설비', phone: '031-000-0000', personName: '박예시', personMobile: '010-0000-0002' }),
    c(5, { category: '기타', name: ' 예시메디칼 ', phone: '099-000-0000' }),
  ])

  it('AC-6503.4: 업체 이름(앞뒤 빈칸 뺀 글자)이 같은 줄은 한 업체이고 업체 칸은 처음 나온 빈칸 아닌 값이다', () => {
    const plan = buildImportPlan(SHEET, EMPTY_BOOK)
    expect(plan.problems).toEqual([])
    expect(plan.counts).toEqual({ contacts: 4, equipment: 0 })
    expect(plan.changes).toEqual([
      change({ name: '예시메디칼', status: 'new', category: 'supplier', work: '의료기기 판매', peopleAdded: 2 }),
      change({ name: '예시설비', status: 'new', category: 'repair', peopleAdded: 1 }),
    ])
    expect(plan.payload).toEqual({
      companies: [
        { name: '예시메디칼', category: 'supplier', phone: '02-000-0000', work: '의료기기 판매' },
        { name: '예시설비', category: 'repair', phone: '031-000-0000' },
      ],
      people: [
        { company: '예시메디칼', name: '김예시', mobile: '010-0000-0000', role: '영업' },
        { company: '예시메디칼', name: '이예시', mobile: '010-0000-0001', role: '수리 기사' },
        { company: '예시설비', name: '박예시', mobile: '010-0000-0002' },
      ],
      equipment: [],
    })
    expect(plan.untouched).toEqual([])
  })

  it('AC-6503.4: 앞 줄의 빈 칸은 뒤 줄 값으로 채운다(칸마다 따로)', () => {
    const plan = buildImportPlan(
      rows([
        c(2, { category: '거래처', name: '예시메디칼', memo: '첫 메모' }),
        c(3, { name: '예시메디칼', phone: '02-000-0000', memo: '둘째 메모', homepage: 'www.example.com' }),
      ]),
      EMPTY_BOOK,
    )
    expect(plan.payload.companies).toEqual([
      { name: '예시메디칼', category: 'supplier', phone: '02-000-0000', homepage: 'www.example.com', memo: '첫 메모' },
    ])
  })

  it('AC-6503.4: 담당자 칸 셋이 다 빈 줄은 담당자가 없다', () => {
    const plan = buildImportPlan(rows([c(2, { category: '기타', name: '예시공단', phone: '1588-0000' })]), EMPTY_BOOK)
    expect(plan.payload.people).toEqual([])
    expect(plan.changes).toEqual([change({ name: '예시공단', status: 'new', category: 'other' })])
  })

  it('AC-6503.4: 같은 업체에 같은 담당자 이름 줄이 또 나오면 뒤 줄은 same-person이고 그 줄의 업체 칸도 쓰지 않는다', () => {
    const plan = buildImportPlan(
      rows([
        c(2, { category: '거래처', name: '예시메디칼', personName: '김예시', personMobile: '010-0000-0000' }),
        c(3, { name: '예시메디칼', memo: '쓰지 않는 메모', personName: '김예시', personMobile: '010-9999-9999' }),
        c(4, { name: '예시메디칼', personName: '이예시' }),
      ]),
      EMPTY_BOOK,
    )
    expect(plan.problems).toEqual([problem({ sheet: 'contacts', row: 3, reason: 'same-person', company: '예시메디칼', item: '김예시' })])
    expect(plan.payload).toEqual({
      companies: [{ name: '예시메디칼', category: 'supplier' }],
      people: [
        { company: '예시메디칼', name: '김예시', mobile: '010-0000-0000' },
        { company: '예시메디칼', name: '이예시' },
      ],
      equipment: [],
    })
  })

  it('AC-6503.4: 다른 업체의 같은 담당자 이름은 겹침이 아니다', () => {
    const plan = buildImportPlan(
      rows([c(2, { category: '거래처', name: '예시메디칼', personName: '김예시' }), c(3, { category: '거래처', name: '예시약품', personName: '김예시' })]),
      EMPTY_BOOK,
    )
    expect(plan.problems).toEqual([])
    expect(plan.payload.people).toHaveLength(2)
  })

  it('AC-6503.4: 칸이 모두 빈 줄은 소리 없이 건너뛰고 세지 않는다', () => {
    const plan = buildImportPlan(rows([c(2, {}), c(3, { category: '기타', name: '예시공단' }), c(4, { name: '  ', phone: '' })], [e(2, {})]), EMPTY_BOOK)
    expect(plan.counts).toEqual({ contacts: 1, equipment: 0 })
    expect(plan.problems).toEqual([])
  })

  it('AC-6503.4: 업체 이름 견주기는 가운데 빈칸·영문 대소문자를 그대로 본다', () => {
    const plan = buildImportPlan(
      rows([c(2, { category: '기타', name: '예시 공단' }), c(3, { category: '기타', name: '예시공단' }), c(4, { category: '기타', name: 'ABC' }), c(5, { category: '기타', name: 'abc' })]),
      EMPTY_BOOK,
    )
    expect(plan.changes.map((x) => x.name)).toEqual(['예시 공단', '예시공단', 'ABC', 'abc'])
  })
})

describe('AC-6503.3 칸 값 읽기', () => {
  it('AC-6503.3: 숫자로 온 대표 전화·담당자 휴대폰·사업자번호·계좌·일련번호는 String(값)이고 앞자리 0을 되살리지 않는다', () => {
    const plan = buildImportPlan(
      rows(
        [c(2, { category: '거래처', name: '예시메디칼', phone: 212345678, bizNo: 1234567890, account: 1002003004, personName: '김예시', personMobile: 1012345678 })],
        [e(2, { company: '예시메디칼', name: '충격파 기계', serial: 1001 })],
      ),
      EMPTY_BOOK,
    )
    expect(plan.payload.companies).toEqual([
      { name: '예시메디칼', category: 'supplier', phone: '212345678', biz_no: '1234567890', account: '1002003004' },
    ])
    expect(plan.payload.people).toEqual([{ company: '예시메디칼', name: '김예시', mobile: '1012345678' }])
    expect(plan.payload.equipment).toEqual([{ company: '예시메디칼', name: '충격파 기계', serial: '1001' }])
  })

  it('AC-6503.3: 글자 칸은 앞뒤 빈칸을 빼고 NFC로 맞춘다', () => {
    const plan = buildImportPlan(
      rows([c(2, { category: ' 수리·관리 ', name: ` ${'예시설비'.normalize('NFD')} `, work: ' 냉난방기 수리 ', personName: ' 박예시 ' })]),
      EMPTY_BOOK,
    )
    expect(plan.payload.companies).toEqual([{ name: '예시설비', category: 'repair', work: '냉난방기 수리' }])
    expect(plan.payload.companies[0].name.length).toBe(4)
    expect(plan.payload.people).toEqual([{ company: '예시설비', name: '박예시' }])
  })

  it('AC-6503.3: 날짜 칸은 엑셀 날짜 숫자·YYYY-MM-DD·YYYY.M.D·YYYY/MM/DD를 받는다', () => {
    const cases: [Cell, string][] = [
      [46027, '2026-01-05'],
      ['2026-01-05', '2026-01-05'],
      ['2026.1.5', '2026-01-05'],
      ['2026/01/05', '2026-01-05'],
      ['2026-1-5', '2026-01-05'],
    ]
    for (const [cell, ymd] of cases) {
      const plan = buildImportPlan(
        rows([c(2, { category: '거래처', name: '예시메디칼' })], [e(2, { company: '예시메디칼', name: '충격파 기계', boughtOn: cell, warrantyUntil: cell })]),
        EMPTY_BOOK,
      )
      expect(plan.problems, String(cell)).toEqual([])
      expect(plan.payload.equipment, String(cell)).toEqual([{ company: '예시메디칼', name: '충격파 기계', bought_on: ymd, warranty_until: ymd }])
    }
  })

  it("AC-6503.3: '26-01-05'·'2026년 1월 5일'·없는 날은 날짜 모양이 아니다", () => {
    for (const bad of ['26-01-05', '2026년 1월 5일', '2026-02-30', '2026-13-01', true]) {
      const plan = buildImportPlan(rows([], [e(2, { company: '예시메디칼', name: '충격파 기계', boughtOn: bad })]), book({ companies: [company('c1', '예시메디칼', 'supplier')] }))
      expect(plan.problems, String(bad)).toEqual([
        problem({ sheet: 'equipment', row: 2, reason: 'date', company: '예시메디칼', item: '충격파 기계', field: '들여온 날', value: String(bad) }),
      ])
    }
  })
})

describe('AC-6503.5 넣지 않는 줄 — 연락처 시트', () => {
  it('AC-6503.5: 분류가 넷 밖이면 category(값 그대로)', () => {
    const plan = buildImportPlan(rows([c(9, { category: '병원', name: '예시병원물품', personName: '김예시' })]), EMPTY_BOOK)
    expect(plan.problems).toEqual([problem({ sheet: 'contacts', row: 9, reason: 'category', company: '예시병원물품', field: '분류', value: '병원' })])
    expect(plan.payload).toEqual(NO_PAYLOAD)
    expect(plan.changes).toEqual([])
  })

  it('AC-6503.5: 업체 이름이 비면 no-company다(전화만 있어도)', () => {
    const plan = buildImportPlan(rows([c(15, { phone: '02-000-0000', personName: '김예시' })]), EMPTY_BOOK)
    expect(plan.problems).toEqual([problem({ sheet: 'contacts', row: 15, reason: 'no-company' })])
  })

  it('AC-6503.5: 새 업체인데 넣는 줄 어디에도 분류가 없으면 그 업체 줄 모두 no-category이고 업체를 넣지 않는다', () => {
    const plan = buildImportPlan(
      rows([c(2, { name: '예시상사', personName: '김예시' }), c(3, { name: '예시상사', personName: '이예시' }), c(4, { category: '기타', name: '예시공단' })]),
      EMPTY_BOOK,
    )
    expect(plan.problems).toEqual([
      problem({ sheet: 'contacts', row: 2, reason: 'no-category', company: '예시상사', field: '분류' }),
      problem({ sheet: 'contacts', row: 3, reason: 'no-category', company: '예시상사', field: '분류' }),
    ])
    expect(plan.payload).toEqual({ companies: [{ name: '예시공단', category: 'other' }], people: [], equipment: [] })
    expect(plan.changes.map((x) => x.name)).toEqual(['예시공단'])
  })

  it('AC-6503.5: 이미 있는 업체는 분류 칸이 비어도 된다(지금 분류 그대로)', () => {
    const plan = buildImportPlan(rows([c(2, { name: '예시메디칼', phone: '02-111-1111' })]), book({ companies: [company('c1', '예시메디칼', 'supplier')] }))
    expect(plan.problems).toEqual([])
    expect(plan.payload.companies).toEqual([{ name: '예시메디칼', phone: '02-111-1111' }])
  })

  it('AC-6503.5: 담당자 이름이 빈 채 휴대폰·맡은 일만 있으면 no-person-name이고 그 줄의 업체 칸도 쓰지 않는다', () => {
    const plan = buildImportPlan(
      rows([c(2, { category: '거래처', name: '예시메디칼', phone: '02-999-9999', personMobile: '010-0000-0000' }), c(3, { name: '예시메디칼', personRole: '영업' })]),
      EMPTY_BOOK,
    )
    expect(plan.problems).toEqual([
      problem({ sheet: 'contacts', row: 2, reason: 'no-person-name', company: '예시메디칼' }),
      problem({ sheet: 'contacts', row: 3, reason: 'no-person-name', company: '예시메디칼' }),
    ])
    expect(plan.payload).toEqual(NO_PAYLOAD)
  })

  it('AC-6503.5: 업체 이름 41자는 too-long(업체 이름, 40)', () => {
    const long = '가'.repeat(41)
    const plan = buildImportPlan(rows([c(2, { category: '거래처', name: long })]), EMPTY_BOOK)
    expect(plan.problems).toEqual([problem({ sheet: 'contacts', row: 2, reason: 'too-long', company: long, field: '업체 이름', limit: 40 })])
  })

  it('AC-6503.5: 담당자 칸 까닭은 담당자 이름을 함께 든다', () => {
    const plan = buildImportPlan(
      rows([c(2, { category: '거래처', name: '예시메디칼', personName: '김예시', personMobile: '0'.repeat(31) })]),
      EMPTY_BOOK,
    )
    expect(plan.problems).toEqual([
      problem({ sheet: 'contacts', row: 2, reason: 'too-long', company: '예시메디칼', item: '김예시', field: '담당자 휴대폰', limit: 30 }),
    ])
  })

  it('AC-6503.5: 한 줄에 까닭이 여럿이면 검사 차례의 첫 까닭 하나다', () => {
    const plan = buildImportPlan(
      rows([
        // no-company > category
        c(2, { category: '병원', phone: '02' }),
        // too-long(업체 이름) > category
        c(3, { category: '병원', name: '나'.repeat(41) }),
        // category > too-long(나머지 칸)
        c(4, { category: '병원', name: '예시가', memo: '다'.repeat(1001) }),
        // too-long(나머지, 머리글 차례: 대표 전화 먼저) > no-person-name
        c(5, { category: '거래처', name: '예시나', memo: '다'.repeat(1001), phone: '0'.repeat(31), personMobile: '010' }),
        // too-long 머리글 차례: 업체 메모 > 담당자 이름
        c(6, { category: '거래처', name: '예시다', personName: '라'.repeat(21), memo: '다'.repeat(1001) }),
        // 사이트 비밀번호·계좌 글자 수
        c(7, { category: '거래처', name: '예시라', account: '1'.repeat(101), sitePw: 'p'.repeat(101) }),
      ]),
      EMPTY_BOOK,
    )
    expect(plan.problems).toEqual([
      problem({ sheet: 'contacts', row: 2, reason: 'no-company' }),
      problem({ sheet: 'contacts', row: 3, reason: 'too-long', company: '나'.repeat(41), field: '업체 이름', limit: 40 }),
      problem({ sheet: 'contacts', row: 4, reason: 'category', company: '예시가', field: '분류', value: '병원' }),
      problem({ sheet: 'contacts', row: 5, reason: 'too-long', company: '예시나', field: '대표 전화', limit: 30 }),
      problem({ sheet: 'contacts', row: 6, reason: 'too-long', company: '예시다', field: '업체 메모', limit: 1000 }),
      problem({ sheet: 'contacts', row: 7, reason: 'too-long', company: '예시라', field: '계좌', limit: 100 }),
    ])
    expect(plan.payload).toEqual(NO_PAYLOAD)
  })

  it('AC-6503.5: 틀린 줄의 값은 업체 칸 고르기에 들지 않는다(뒤 줄 값을 쓴다)', () => {
    const plan = buildImportPlan(
      rows([c(2, { category: '병원', name: '예시메디칼', phone: '02-111-1111' }), c(3, { category: '거래처', name: '예시메디칼', phone: '02-222-2222' })]),
      EMPTY_BOOK,
    )
    expect(plan.problems.map((p) => p.row)).toEqual([2])
    expect(plan.payload.companies).toEqual([{ name: '예시메디칼', category: 'supplier', phone: '02-222-2222' }])
  })

  it('AC-6503.5: 가운데 칸이 한도 그대로면 넣는다(사이트 비밀번호 100자)', () => {
    const plan = buildImportPlan(rows([c(2, { category: '거래처', name: '예시메디칼', sitePw: 'p'.repeat(100) })]), EMPTY_BOOK)
    expect(plan.problems).toEqual([])
    expect(plan.payload.companies).toEqual([{ name: '예시메디칼', category: 'supplier', site_pw: 'p'.repeat(100) }])
  })
})

describe('AC-6503.5 넣지 않는 줄 — 장비 시트', () => {
  const BOOK = book({ companies: [company('c1', '예시메디칼', 'supplier')] })

  it('AC-6503.5: 업체 빔 → no-company, 없는 업체 → unknown-company, 장비 이름 빔 → no-equipment-name', () => {
    const plan = buildImportPlan(
      rows([], [e(2, { name: '충격파 기계' }), e(3, { company: '없는상사', name: '충격파 기계' }), e(4, { company: '예시메디칼', serial: 'SN1' })]),
      BOOK,
    )
    expect(plan.problems).toEqual([
      problem({ sheet: 'equipment', row: 2, reason: 'no-company' }),
      problem({ sheet: 'equipment', row: 3, reason: 'unknown-company', company: '없는상사', item: '충격파 기계' }),
      problem({ sheet: 'equipment', row: 4, reason: 'no-equipment-name', company: '예시메디칼' }),
    ])
    expect(plan.payload).toEqual(NO_PAYLOAD)
  })

  it("AC-6503.5: 들여온 날 '2026-13-01' → date(들여온 날), 끝나는 날만 틀리면 그 칸, 둘 다면 들여온 날", () => {
    const plan = buildImportPlan(
      rows(
        [],
        [
          e(5, { company: '예시메디칼', name: '천장형 냉난방기', boughtOn: '2026-13-01' }),
          e(6, { company: '예시메디칼', name: '온열기', warrantyUntil: '2026.02.30' }),
          e(7, { company: '예시메디칼', name: '초음파기', boughtOn: 'x', warrantyUntil: 'y' }),
        ],
      ),
      BOOK,
    )
    expect(plan.problems).toEqual([
      problem({ sheet: 'equipment', row: 5, reason: 'date', company: '예시메디칼', item: '천장형 냉난방기', field: '들여온 날', value: '2026-13-01' }),
      problem({ sheet: 'equipment', row: 6, reason: 'date', company: '예시메디칼', item: '온열기', field: '무상 수리 끝나는 날', value: '2026.02.30' }),
      problem({ sheet: 'equipment', row: 7, reason: 'date', company: '예시메디칼', item: '초음파기', field: '들여온 날', value: 'x' }),
    ])
  })

  it('AC-6503.5: 장비 이름 61자·일련번호 61자는 too-long(머리글 차례), 검사 차례는 no-company → unknown → 이름 빔 → too-long → date', () => {
    const plan = buildImportPlan(
      rows(
        [],
        [
          e(2, { company: '예시메디칼', name: '가'.repeat(61), serial: 'S'.repeat(61), boughtOn: 'x' }),
          e(3, { company: '예시메디칼', name: '온열기', serial: 'S'.repeat(61), boughtOn: 'x' }),
          e(4, { company: '없는상사', boughtOn: 'x' }),
          e(5, { company: '예시메디칼', boughtOn: 'x', serial: 'S'.repeat(61) }),
          e(6, { name: '온열기', boughtOn: 'x' }),
        ],
      ),
      BOOK,
    )
    expect(plan.problems).toEqual([
      problem({ sheet: 'equipment', row: 2, reason: 'too-long', company: '예시메디칼', item: '가'.repeat(61), field: '장비 이름', limit: 60 }),
      problem({ sheet: 'equipment', row: 3, reason: 'too-long', company: '예시메디칼', item: '온열기', field: '일련번호', limit: 60 }),
      problem({ sheet: 'equipment', row: 4, reason: 'unknown-company', company: '없는상사' }),
      problem({ sheet: 'equipment', row: 5, reason: 'no-equipment-name', company: '예시메디칼' }),
      problem({ sheet: 'equipment', row: 6, reason: 'no-company' }),
    ])
  })

  it('AC-6503.5: 연락처 줄이 category로 빠지고 주소록에도 없는 업체의 장비는 unknown-company다', () => {
    const plan = buildImportPlan(rows([c(2, { category: '병원', name: '예시상사' })], [e(2, { company: '예시상사', name: '충격파 기계' })]), BOOK)
    expect(plan.problems).toEqual([
      problem({ sheet: 'contacts', row: 2, reason: 'category', company: '예시상사', field: '분류', value: '병원' }),
      problem({ sheet: 'equipment', row: 2, reason: 'unknown-company', company: '예시상사', item: '충격파 기계' }),
    ])
  })

  it('AC-6503.5: 연락처 시트에서 새로 넣는 업체의 장비는 넣는다', () => {
    const plan = buildImportPlan(rows([c(2, { category: '거래처', name: '예시약품' })], [e(2, { company: '예시약품', name: '냉장고' })]), BOOK)
    expect(plan.problems).toEqual([])
    expect(plan.payload.equipment).toEqual([{ company: '예시약품', name: '냉장고' }])
    expect(plan.changes).toEqual([change({ name: '예시약품', status: 'new', category: 'supplier', equipmentAdded: 1 })])
  })

  it('AC-6503.5: 끝나는 날이 들여온 날보다 앞서도 넣는다', () => {
    const plan = buildImportPlan(rows([], [e(2, { company: '예시메디칼', name: '온열기', boughtOn: '2026-02-01', warrantyUntil: '2026-01-01' })]), BOOK)
    expect(plan.problems).toEqual([])
    expect(plan.payload.equipment).toEqual([{ company: '예시메디칼', name: '온열기', bought_on: '2026-02-01', warranty_until: '2026-01-01' }])
  })

  it('AC-6503.5: 넣지 않는 줄은 시트(연락처 먼저)·줄 번호 차례다', () => {
    const plan = buildImportPlan(
      rows([c(7, { phone: '1' }), c(3, { phone: '2' })], [e(4, { name: '온열기' }), e(2, { name: '온열기' })]),
      BOOK,
    )
    expect(plan.problems.map((p) => `${p.sheet}:${p.row}`)).toEqual(['contacts:3', 'contacts:7', 'equipment:2', 'equipment:4'])
  })
})

describe('AC-6503.6 지금 주소록과 견주기', () => {
  // design.md '예' 다시 올리기
  const BOOK = book({
    companies: [
      company('c1', '예시메디칼', 'supplier', { phone: '02-000-0000', memo: '매달 말에 주문', work: '의료기기' }),
      company('c2', '예시설비', 'repair'),
    ],
    people: [person('p1', 'c1', '김예시', '010-0000-0000', '영업')],
  })

  it('AC-6503.6: 빈칸 아닌 값이 다른 칸만 바뀜이고, 엑셀 빈 칸은 몸통에 없고, 엑셀에 없는 업체는 untouched다', () => {
    const plan = buildImportPlan(
      rows([
        c(2, { category: '거래처', name: '예시메디칼', phone: '02-111-1111', personName: '김예시', personRole: '부장' }),
        c(3, { name: '예시메디칼', personName: '이예시', personMobile: '010-0000-0001', personRole: '수리 기사' }),
      ]),
      BOOK,
    )
    expect(plan.problems).toEqual([])
    expect(plan.changes).toEqual([
      change({
        name: '예시메디칼',
        status: 'changed',
        category: 'supplier',
        work: '의료기기',
        fields: ['대표 전화'],
        peopleAdded: 1,
        peopleChanged: [{ name: '김예시', fields: ['맡은 일'] }],
      }),
    ])
    expect(plan.payload).toEqual({
      companies: [{ name: '예시메디칼', phone: '02-111-1111' }],
      people: [
        { company: '예시메디칼', name: '김예시', role: '부장' },
        { company: '예시메디칼', name: '이예시', mobile: '010-0000-0001', role: '수리 기사' },
      ],
      equipment: [],
    })
    expect(plan.untouched).toEqual(['예시설비'])
  })

  it('AC-6503.6: 모든 값이 같거나 비었으면 same이고 몸통이 비어 있다(isEmptyPayload)', () => {
    const plan = buildImportPlan(
      rows([c(2, { category: '거래처', name: '예시메디칼', phone: '02-000-0000', personName: '김예시', personMobile: '010-0000-0000' })]),
      BOOK,
    )
    expect(plan.changes).toEqual([change({ name: '예시메디칼', status: 'same', category: 'supplier', work: '의료기기' })])
    expect(plan.payload).toEqual(NO_PAYLOAD)
    expect(isEmptyPayload(plan.payload)).toBe(true)
  })

  it('AC-6503.6: 분류가 바뀌면 분류 칸이고, 바뀐 칸은 머리글 차례다', () => {
    const plan = buildImportPlan(
      rows([c(2, { category: '기관·보험', name: '예시메디칼', memo: '새 메모', address: '예시시 예시구', work: '의료기기 판매' })]),
      BOOK,
    )
    expect(plan.changes[0]).toEqual(
      change({ name: '예시메디칼', status: 'changed', category: 'agency', work: '의료기기 판매', fields: ['분류', '하는 일·품목', '주소', '업체 메모'] }),
    )
    expect(plan.payload.companies).toEqual([{ name: '예시메디칼', category: 'agency', work: '의료기기 판매', address: '예시시 예시구', memo: '새 메모' }])
  })

  it('AC-6503.6: 담당자 휴대폰·맡은 일이 다르면 그 칸 이름, 담당자 칸만 바뀌면 업체 줄은 몸통에 없다', () => {
    const plan = buildImportPlan(
      rows([c(2, { name: '예시메디칼', personName: '김예시', personMobile: '010-1111-1111', personRole: '이사' })]),
      BOOK,
    )
    expect(plan.changes[0]).toMatchObject({ status: 'changed', fields: [], peopleChanged: [{ name: '김예시', fields: ['휴대폰', '맡은 일'] }] })
    expect(plan.payload).toEqual({
      companies: [],
      people: [{ company: '예시메디칼', name: '김예시', mobile: '010-1111-1111', role: '이사' }],
      equipment: [],
    })
  })

  it('AC-6503.6: 새 업체 몸통은 빈칸 아닌 칸과 분류만이고 사이트 비밀번호·계좌 열쇠는 DB 칸 이름이다', () => {
    const plan = buildImportPlan(
      rows([
        c(2, {
          category: '거래처',
          name: '예시약품',
          bizNo: '000-00-00000',
          account: '예시은행 000-000000-00-000',
          siteId: 'yesi',
          sitePw: 'pw-0000',
          homepage: 'www.example.com',
        }),
      ]),
      BOOK,
    )
    expect(plan.payload.companies).toEqual([
      {
        name: '예시약품',
        category: 'supplier',
        homepage: 'www.example.com',
        biz_no: '000-00-00000',
        account: '예시은행 000-000000-00-000',
        site_id: 'yesi',
        site_pw: 'pw-0000',
      },
    ])
    expect(plan.changes).toEqual([change({ name: '예시약품', status: 'new', category: 'supplier' })])
    expect(plan.untouched).toEqual(['예시메디칼', '예시설비'])
  })

  it('AC-6503.6: untouched는 가나다 차례이고, 엑셀에 나온 업체(틀린 줄뿐이어도)는 빠진다', () => {
    const many = book({
      companies: [company('c1', '하나상사', 'other'), company('c2', '예시메디칼', 'supplier'), company('c3', '가나약품', 'supplier'), company('c4', '나라수리', 'repair')],
    })
    const plan = buildImportPlan(rows([c(2, { name: '예시메디칼', memo: '다'.repeat(1001) })]), many)
    expect(plan.changes).toEqual([])
    expect(plan.untouched).toEqual(['가나약품', '나라수리', '하나상사'])
  })

  it('AC-6503.6: 장비 시트에만 나온 주소록 업체는 장비가 바뀌면 changed, 아니면 same이고 changes 끝에 온다', () => {
    const withMachines = book({
      companies: [company('c1', '예시메디칼', 'supplier'), company('c2', '예시설비', 'repair', { work: '냉난방기 수리' }), company('c3', '예시공단', 'agency')],
      equipment: [machine('m1', 'c3', '온열기', 'SN1')],
    })
    const plan = buildImportPlan(
      rows(
        [c(2, { name: '예시메디칼', phone: '02-000-0000' })],
        [e(2, { company: '예시설비', name: '천장형 냉난방기' }), e(3, { company: '예시공단', name: '온열기', serial: 'SN1' })],
      ),
      withMachines,
    )
    expect(plan.changes).toEqual([
      change({ name: '예시메디칼', status: 'changed', category: 'supplier', fields: ['대표 전화'] }),
      change({ name: '예시설비', status: 'changed', category: 'repair', work: '냉난방기 수리', equipmentAdded: 1 }),
      change({ name: '예시공단', status: 'same', category: 'agency' }),
    ])
    expect(plan.untouched).toEqual([])
    expect(plan.payload).toEqual({
      companies: [{ name: '예시메디칼', phone: '02-000-0000' }],
      people: [],
      equipment: [{ company: '예시설비', name: '천장형 냉난방기' }],
    })
  })

  it('AC-6503.6: isEmptyPayload는 세 배열이 모두 빌 때만 참이다', () => {
    expect(isEmptyPayload(NO_PAYLOAD)).toBe(true)
    expect(isEmptyPayload({ ...NO_PAYLOAD, people: [{ company: '예시메디칼', name: '김예시' }] })).toBe(false)
    expect(isEmptyPayload({ ...NO_PAYLOAD, equipment: [{ company: '예시메디칼', name: '온열기' }] })).toBe(false)
    expect(isEmptyPayload({ ...NO_PAYLOAD, companies: [{ name: '예시메디칼', phone: '1' }] })).toBe(false)
  })
})

describe('AC-6503.7 장비 맞추기', () => {
  // design.md '예' 장비 맞추기: 예시메디칼 A 치료기/SN1 · B 치료기/'' · C 온열기/'' · D 온열기/'' · E 초음파기/SN9
  const BOOK = book({
    companies: [company('c1', '예시메디칼', 'supplier'), company('c2', '예시설비', 'repair')],
    equipment: [
      machine('A', 'c1', '치료기', 'SN1'),
      machine('B', 'c1', '치료기', ''),
      machine('C', 'c1', '온열기', ''),
      machine('D', 'c1', '온열기', ''),
      machine('E', 'c1', '초음파기', 'SN9'),
      machine('X', 'c2', '엑스레이', ''),
    ],
  })
  const UNTIL = '2027-01-01'
  // 엑셀 줄마다 끝나는 날을 적어, 고른 장비가 몸통의 id로 드러나게 한다
  const planFor = (...items: [name: string, serial: string][]) =>
    buildImportPlan(
      rows(
        [],
        items.map(([name, serial], i) => e(i + 2, { company: '예시메디칼', name, serial: serial || null, warrantyUntil: UNTIL })),
      ),
      BOOK,
    )
  const which = (row: number, item: string) => problem({ sheet: 'equipment', row, reason: 'which-equipment', company: '예시메디칼', item })

  it('AC-6503.7: 치료기/SN1 → A(같은 일련번호)', () => {
    const plan = planFor(['치료기', 'SN1'])
    expect(plan.payload.equipment).toEqual([{ id: 'A', company: '예시메디칼', name: '치료기', warranty_until: UNTIL }])
    expect(plan.changes[0]).toMatchObject({ status: 'changed', equipmentAdded: 0, equipmentChanged: [{ name: '치료기', fields: ['무상 수리 끝나는 날'] }] })
  })

  it('AC-6503.7: 치료기/SN2 → B(일련번호 빈 것 하나, SN2를 채움)', () => {
    const plan = planFor(['치료기', 'SN2'])
    expect(plan.payload.equipment).toEqual([{ id: 'B', company: '예시메디칼', name: '치료기', serial: 'SN2', warranty_until: UNTIL }])
    expect(plan.changes[0].equipmentChanged).toEqual([{ name: '치료기', fields: ['일련번호', '무상 수리 끝나는 날'] }])
  })

  it("AC-6503.7: 치료기/'' → B(일련번호 빈 것 하나)", () => {
    expect(planFor(['치료기', '']).payload.equipment).toEqual([{ id: 'B', company: '예시메디칼', name: '치료기', warranty_until: UNTIL }])
  })

  it("AC-6503.7: 온열기/''·온열기/SN3 → which-equipment(일련번호 빈 것이 둘)", () => {
    const empty = planFor(['온열기', ''])
    expect(empty.problems).toEqual([which(2, '온열기')])
    expect(empty.payload).toEqual(NO_PAYLOAD)
    const withSerial = planFor(['온열기', 'SN3'])
    expect(withSerial.problems).toEqual([which(2, '온열기')])
    expect(withSerial.payload).toEqual(NO_PAYLOAD)
  })

  it("AC-6503.7: 초음파기/'' → E(같은 이름 하나, 일련번호는 그대로)", () => {
    expect(planFor(['초음파기', '']).payload.equipment).toEqual([{ id: 'E', company: '예시메디칼', name: '초음파기', warranty_until: UNTIL }])
  })

  it("AC-6503.7: 초음파기/SN8·엑스레이/'' → 새 장비(다른 업체의 같은 이름은 보지 않음)", () => {
    const plan = planFor(['초음파기', 'SN8'], ['엑스레이', ''])
    expect(plan.payload.equipment).toEqual([
      { company: '예시메디칼', name: '초음파기', serial: 'SN8', warranty_until: UNTIL },
      { company: '예시메디칼', name: '엑스레이', warranty_until: UNTIL },
    ])
    expect(plan.changes[0]).toMatchObject({ status: 'changed', equipmentAdded: 2, equipmentChanged: [] })
  })

  it('AC-6503.7: 같은 장비를 두 묶음이 고르면 먼저 나온 묶음이 갖고, 뒤 묶음은 일련번호가 있으면 새 장비(SN2 → B, SN3 → 새로)', () => {
    const plan = planFor(['치료기', 'SN2'], ['치료기', 'SN3'])
    expect(plan.problems).toEqual([])
    expect(plan.payload.equipment).toEqual([
      { id: 'B', company: '예시메디칼', name: '치료기', serial: 'SN2', warranty_until: UNTIL },
      { company: '예시메디칼', name: '치료기', serial: 'SN3', warranty_until: UNTIL },
    ])
  })

  it("AC-6503.7: 뒤 묶음의 일련번호가 비면 which-equipment(SN2 → B, '' → which)", () => {
    const plan = planFor(['치료기', 'SN2'], ['치료기', ''])
    expect(plan.problems).toEqual([which(3, '치료기')])
    expect(plan.payload.equipment).toEqual([{ id: 'B', company: '예시메디칼', name: '치료기', serial: 'SN2', warranty_until: UNTIL }])
  })

  it('AC-6503.7: (업체, 장비 이름, 일련번호)가 같은 줄은 한 묶음(칸마다 처음 빈칸 아닌 값)이고, which-equipment면 그 묶음 줄 모두다', () => {
    const merged = buildImportPlan(
      rows(
        [],
        [
          e(2, { company: '예시메디칼', name: '치료기', serial: 'SN1', boughtOn: '2026-01-05' }),
          e(3, { company: '예시메디칼', name: '치료기', serial: 'SN1', boughtOn: '2026-02-01', warrantyUntil: '2028-01-04' }),
        ],
      ),
      BOOK,
    )
    expect(merged.payload.equipment).toEqual([{ id: 'A', company: '예시메디칼', name: '치료기', bought_on: '2026-01-05', warranty_until: '2028-01-04' }])
    const both = buildImportPlan(rows([], [e(4, { company: '예시메디칼', name: '온열기' }), e(6, { company: '예시메디칼', name: '온열기', boughtOn: '2026-01-05' })]), BOOK)
    expect(both.problems).toEqual([which(4, '온열기'), which(6, '온열기')])
  })

  it('AC-6503.7: 고른 장비의 값이 모두 같으면 바뀜이 아니다', () => {
    const same = book({
      companies: [company('c1', '예시메디칼', 'supplier')],
      equipment: [machine('A', 'c1', '치료기', 'SN1', { boughtOn: '2026-01-05', warrantyUntil: '2028-01-04' })],
    })
    const plan = buildImportPlan(rows([], [e(2, { company: '예시메디칼', name: '치료기', serial: 'SN1', boughtOn: '2026-01-05', warrantyUntil: 46027 + 730 - 1 })]), same)
    expect(plan.payload).toEqual(NO_PAYLOAD)
    expect(plan.changes).toEqual([change({ name: '예시메디칼', status: 'same', category: 'supplier' })])
  })

  it('AC-6503.7: 새 업체의 장비는 모두 새 장비다', () => {
    const plan = buildImportPlan(
      rows([c(2, { category: '거래처', name: '예시약품' })], [e(2, { company: '예시약품', name: '치료기', serial: 'SN1' }), e(3, { company: '예시약품', name: '치료기' })]),
      BOOK,
    )
    expect(plan.payload.equipment).toEqual([
      { company: '예시약품', name: '치료기', serial: 'SN1' },
      { company: '예시약품', name: '치료기' },
    ])
    expect(plan.changes[0]).toMatchObject({ name: '예시약품', status: 'new', equipmentAdded: 2 })
  })
})
