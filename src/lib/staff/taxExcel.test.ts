import * as XLSX from 'xlsx'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { IncentiveEntry, PayItem, PayLine } from './pay'
import { downloadTaxExcel, taxSheet, taxWorkbook, type TaxInput, type TaxPerson } from './taxExcel'

// 세무사 엑셀(spec staff REQ-7609, design.md 4절). taxSheet는 순수 함수라 줄 글만 보고,
// 엑셀 통은 xlsx로 만든 것을 다시 읽어 칸·합계 줄·계좌·메모를 본다. downloadTaxExcel은 writeFile만 흉내 낸다.
// 보기 자료는 시안 pay.html ⑤(2026년 11월, 지어낸 사람)다. 남은 연차·더 일한 분은 부르는 쪽이 셈한 숫자를 넘긴다

vi.mock('xlsx', async (importOriginal) => ({ ...(await importOriginal<typeof import('xlsx')>()), writeFile: vi.fn() }))

afterEach(() => {
  vi.mocked(XLSX.writeFile).mockClear()
})

const NOV = '2026-11'
const HOSPITAL = '○○정형외과'

const ITEMS: PayItem[] = [
  { id: 'base', name: '기본급', kind: 'amount', base: true, removedFrom: null },
  { id: 'overtime', name: '연장수당', kind: 'amount', base: true, removedFrom: null },
  { id: 'meal', name: '식대', kind: 'amount', base: true, removedFrom: null },
  { id: 'incentive', name: '인센티브', kind: 'incentive', base: true, removedFrom: null },
  { id: 'bonus', name: '상여', kind: 'amount', base: true, removedFrom: null },
  { id: 'position', name: '직책수당', kind: 'amount', base: false, removedFrom: null },
]

const inc = (method: IncentiveEntry['method'], value: number, count: number | null, sales: number | null): IncentiveEntry => ({
  ruleId: `r-${method}-${value}`,
  name: method === 'fixed' ? '고정 수당' : method === 'percent' ? '도수치료 비급여' : '도수치료 급여',
  method,
  unitAmount: method === 'percent' ? null : value,
  percent: method === 'percent' ? value : null,
  count,
  sales,
})
const payLine = (staffId: string, amounts: Record<string, number>, incentives: IncentiveEntry[] = []): PayLine => ({
  id: `line-${staffId}`,
  month: NOV,
  staffId,
  amounts,
  incentives,
  adjust: 0,
  adjustReason: null,
  adjustMemo: null,
})

type Member = TaxPerson['member']
const member = (id: string, name: string, job: string, employment: Member['employment'], hiredOn: string, more: Partial<Member> = {}): Member => ({
  id,
  name,
  job,
  jobOther: null,
  employment,
  hiredOn,
  leftOn: null,
  bank: null,
  accountNo: null,
  ...more,
})
const NO_OVERTIME = { extended: 0, night: 0, holiday: 0 }
const person = (m: Member, line: PayLine | null, more: Partial<TaxPerson> = {}): TaxPerson => ({
  member: m,
  line,
  overtime: NO_OVERTIME,
  holidayWork: [],
  leaves: [],
  remaining: null,
  settled: null,
  ...more,
})

// 시안 명단 차례(급여 표 차례)
const KIM = member('s-kim', '김하늘', '간호조무사', 'regular', '2021-03-02', { bank: '국민은행', accountNo: '123-45-678901' })
const LEE = member('s-lee', '이도윤', '물리치료사', 'regular', '2023-07-17')
const PARK = member('s-park', '박서연', '물리치료사', 'regular', '2025-01-06')
const CHOI = member('s-choi', '최민준', '방사선사', 'regular', '2019-11-25')
const JUNG = member('s-jung', '정유나', '원무', 'part', '2024-09-02')
const HAN = member('s-han', '한지우', '원무', 'contract', '2026-02-02', { bank: '신한은행', accountNo: '110-123-456789' })
const OH = member('s-oh', '오세린', '간호사', 'regular', '2020-04-01', { leftOn: '2024-05-31' })
const MOON = member('s-moon', '문태호', '원무', 'regular', '2018-01-02', { leftOn: '2022-12-31' })

const NOV_PEOPLE: TaxPerson[] = [
  person(KIM, payLine('s-kim', { base: 2_900_000, meal: 200_000 }, [inc('fixed', 100_000, null, null)]), {
    overtime: { extended: 0, night: 60, holiday: 0 },
    leaves: [{ day: '2026-11-07', kind: 'annual', part: null, paid: true }],
    remaining: 7.5,
  }),
  person(LEE, payLine('s-lee', { base: 3_100_000, overtime: 120_000, meal: 200_000 }, [inc('per_case', 5_000, 32, null), inc('percent', 10, null, 4_200_000)]), {
    overtime: { extended: 240, night: 0, holiday: 0 },
    leaves: [{ day: '2026-11-28', kind: 'annual', part: null, paid: true }],
    remaining: 9,
  }),
  person(PARK, payLine('s-park', { base: 2_800_000, overtime: 70_000, meal: 200_000 }, [inc('percent', 10, null, 3_150_000)]), {
    overtime: { extended: 150, night: 0, holiday: 0 },
    leaves: [{ day: '2026-11-13', kind: 'half', part: 'pm', paid: true }],
    remaining: 12,
  }),
  person(CHOI, payLine('s-choi', { base: 3_300_000, overtime: 160_000, meal: 200_000, position: 150_000 }), {
    overtime: { extended: 0, night: 0, holiday: 240 },
    holidayWork: [{ day: '2026-11-15', kind: 'closed' }],
    remaining: 18, // 11-25에 시작한 새 기간
    settled: { end: '2026-11-24', days: 3 }, // 2025-11-25 ~ 2026-11-24 기간 남은 3일 정산
  }),
  person(JUNG, payLine('s-jung', { base: 1_450_000, meal: 120_000 }), {
    leaves: [{ day: '2026-11-18', kind: 'sick', part: null, paid: true }],
    remaining: 7,
  }),
  person(HAN, payLine('s-han', { base: 2_450_000, meal: 200_000 }), { remaining: 5 }),
  person(OH, null),
  person(MOON, null),
]
const NOV_INPUT: TaxInput = { month: NOV, hospitalName: HOSPITAL, items: ITEMS, people: NOV_PEOPLE }

const HEAD = [
  '이름', '직종', '근무 형태', '입사일', '퇴사일',
  '기본급', '연장수당', '식대', '인센티브', '상여', '직책수당',
  '조정 (±)', '지급 합계', '연장 (시간)', '야간 (시간)', '휴일 (시간)', '연차 (일)', '병가 (일)', '무급 (일)', '남은 연차 (일)', '메모', '계좌 (이달 입사자만)',
]
const COL = Object.fromEntries(HEAD.map((name, i) => [name, i])) as Record<string, number>
const n = null

// 엑셀 통을 바이트로 쓰고 다시 읽는다(받은 파일을 여는 것과 같다)
function reopen(input: TaxInput) {
  const bytes = XLSX.write(taxWorkbook(taxSheet(input)), { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  const book = XLSX.read(new Uint8Array(bytes), { type: 'array', cellNF: true }) // cellNF: 칸 모양(z)도 읽는다
  const sheet = book.Sheets[book.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, { header: 1, defval: null, raw: true })
  return { book, sheet, rows }
}
const rowOf = (rows: (string | number | null)[][], name: string) => rows.find((row) => row[0] === name)

describe('AC-7609.1: taxSheet — 시트 하나, 1줄 안내 · 2줄 머리 · 그달 재직자 · 합계 줄', () => {
  it('AC-7609.1: 파일 이름 {YYYY-MM} 급여자료 ({병원 이름}).xlsx · 시트 이름 {M}월 급여 · 1줄 안내 글', () => {
    const sheet = taxSheet(NOV_INPUT)
    expect(sheet.fileName).toBe('2026-11 급여자료 (○○정형외과).xlsx')
    expect(sheet.sheetName).toBe('11월 급여')
    expect(sheet.rows[0]).toEqual(['2026년 11월 급여자료 · ○○정형외과 · 금액은 모두 실수령(손에 받는 돈) 기준, 단위 원'])
    expect(taxSheet({ ...NOV_INPUT, month: '2027-03' }).sheetName).toBe('3월 급여')
    expect(taxSheet({ ...NOV_INPUT, month: '2027-03' }).fileName).toBe('2027-03 급여자료 (○○정형외과).xlsx')
  })

  it('AC-7609.1: 2줄 머리는 다섯 칸 · 그달 보이는 급여 항목 차례대로 · 조정~계좌 열 칸이고, 인센티브 내역·주민번호 칸은 없다', () => {
    const head = taxSheet(NOV_INPUT).rows[1]
    expect(head).toEqual(HEAD)
    expect(head.join('|')).not.toMatch(/주민|건수|매출|도수/)
    const items = ITEMS.map((item) => (item.id === 'bonus' ? { ...item, removedFrom: NOV } : item))
    expect(taxSheet({ ...NOV_INPUT, items }).rows[1].slice(5, 11)).toEqual(['기본급', '연장수당', '식대', '인센티브', '직책수당', '조정 (±)'])
  })

  it('AC-7609.1: 3줄부터 그달 재직자만 넘긴 차례대로 한 줄씩(퇴사 오세린·문태호 없음), 맨 아래 합계 줄', () => {
    const rows = taxSheet(NOV_INPUT).rows
    expect(rows).toHaveLength(2 + 6 + 1)
    expect(rows.slice(2).map((row) => row[0])).toEqual(['김하늘', '이도윤', '박서연', '최민준', '정유나', '한지우', '합계'])
  })

  it('AC-7609.1: 재직 = 입사일 ≤ 달 끝 · 퇴사일 없음 또는 ≥ 달 첫날(달 안에 퇴사한 사람은 들고 퇴사일이 찍힌다)', () => {
    const people = [
      person(member('a', '첫날퇴사', '간호사', 'regular', '2020-01-01', { leftOn: '2026-11-01' }), null),
      person(member('b', '전달퇴사', '간호사', 'regular', '2020-01-01', { leftOn: '2026-10-31' }), null),
      person(member('c', '말일입사', '간호사', 'regular', '2026-11-30'), null),
      person(member('d', '다음달입사', '간호사', 'regular', '2026-12-01'), null),
      person(member('e', '뒤에퇴사', '간호사', 'regular', '2020-01-01', { leftOn: '2027-01-15' }), null),
    ]
    const rows = taxSheet({ ...NOV_INPUT, people }).rows
    expect(rows.slice(2, -1).map((row) => row[0])).toEqual(['첫날퇴사', '말일입사', '뒤에퇴사'])
    expect(rows[2][COL['퇴사일']]).toBe('2026-11-01')
    expect(rows[3][COL['퇴사일']]).toBeNull()
    expect(rows[4][COL['퇴사일']]).toBe('2027-01-15')
  })

  it('AC-7609.1: 재직자가 없어도 안내·머리·합계 줄(금액 0)은 있다', () => {
    const rows = taxSheet({ ...NOV_INPUT, people: [person(OH, null)] }).rows
    expect(rows.map((row) => row[0])).toEqual([rows[0][0], '이름', '합계'])
    expect(rows[2][COL['지급 합계']]).toBe(0)
  })
})

describe('AC-7609.2: 칸 값 — 시간·휴가 일수·남은 연차·메모·계좌·날짜·빈 칸', () => {
  it('AC-7609.2: 보기 11월 사람 줄 — 금액 없는 칸·0인 시간·휴가는 빈 칸, 날짜는 글자, 남은 연차는 숫자', () => {
    const rows = taxSheet(NOV_INPUT).rows
    expect(rows[2]).toEqual(['김하늘', '간호조무사', '정규직', '2021-03-02', n, 2_900_000, n, 200_000, 100_000, n, n, n, 3_200_000, n, 1, n, 1, n, n, 7.5, n, n])
    expect(rows[3]).toEqual(['이도윤', '물리치료사', '정규직', '2023-07-17', n, 3_100_000, 120_000, 200_000, 580_000, n, n, n, 4_000_000, 4, n, n, 1, n, n, 9, n, n])
    expect(rows[4]).toEqual(['박서연', '물리치료사', '정규직', '2025-01-06', n, 2_800_000, 70_000, 200_000, 315_000, n, n, n, 3_385_000, 2.5, n, n, 0.5, n, n, 12, n, n])
    expect(rows[5]).toEqual([
      '최민준', '방사선사', '정규직', '2019-11-25', n, 3_300_000, 160_000, 200_000, n, n, 150_000, n, 3_810_000, n, n, 4, n, n, n, 3,
      '11-15(일) 휴진일 근무 · 연차 기간 끝 11-24 · 3일 정산', n,
    ])
    expect(rows[6]).toEqual(['정유나', '원무', '파트타임', '2024-09-02', n, 1_450_000, n, 120_000, n, n, n, n, 1_570_000, n, n, n, n, 1, n, 7, n, n])
    expect(rows[7]).toEqual(['한지우', '원무', '계약직', '2026-02-02', n, 2_450_000, n, 200_000, n, n, n, n, 2_650_000, n, n, n, n, n, n, 5, n, n])
  })

  it('AC-7609.2: 시간 = 분 ÷ 60 (30분 단위면 0.5 단위)', () => {
    const rows = taxSheet({ ...NOV_INPUT, people: [person(LEE, null, { overtime: { extended: 90, night: 30, holiday: 600 } })] }).rows
    expect(rows[2].slice(COL['연장 (시간)'], COL['휴일 (시간)'] + 1)).toEqual([1.5, 0.5, 10])
  })

  it('AC-7609.2: 연차 = 연차 1·반차 0.5, 병가 = 유급 병가, 무급 = 무급(결근) + 무급 병가, 그달 밖 휴가는 세지 않는다', () => {
    const leaves: TaxPerson['leaves'] = [
      { day: '2026-11-02', kind: 'annual', part: null, paid: true },
      { day: '2026-11-03', kind: 'half', part: 'am', paid: true },
      { day: '2026-11-04', kind: 'half', part: 'pm', paid: true },
      { day: '2026-11-05', kind: 'sick', part: null, paid: true },
      { day: '2026-11-06', kind: 'sick', part: null, paid: false },
      { day: '2026-11-09', kind: 'unpaid', part: null, paid: false },
      { day: '2026-11-10', kind: 'unpaid', part: null, paid: false },
      { day: '2026-10-30', kind: 'annual', part: null, paid: true },
      { day: '2026-12-01', kind: 'sick', part: null, paid: true },
    ]
    const row = taxSheet({ ...NOV_INPUT, people: [person(LEE, null, { leaves })] }).rows[2]
    expect(row.slice(COL['연차 (일)'], COL['무급 (일)'] + 1)).toEqual([2, 1, 3])
    expect(row[COL['메모']]).toBeNull()
  })

  it("AC-7609.2: 메모 = 조정 까닭 · 휴일에 일한 날(날짜 차례) · 정산 · '경조사 {n}일' · '출산·육아휴직 {n}일'을 ' · '로 잇는다", () => {
    const line = { ...payLine('s-lee', { base: 1_000_000 }), adjust: -50_000, adjustReason: 'deduct' as const, adjustMemo: '무급 1일' }
    const row = taxSheet({
      ...NOV_INPUT,
      people: [
        person(LEE, line, {
          holidayWork: [
            { day: '2026-11-15', kind: 'closed' },
            { day: '2026-11-03', kind: 'public' },
          ],
          leaves: [
            { day: '2026-11-19', kind: 'family', part: null, paid: true },
            { day: '2026-11-20', kind: 'family', part: null, paid: true },
            { day: '2026-11-23', kind: 'maternity', part: null, paid: true },
          ],
          remaining: 4,
          settled: { end: '2026-11-16', days: 2.5 },
        }),
      ],
    }).rows[2]
    expect(row[COL['메모']]).toBe('공제 무급 1일 · 11-03(화) 공휴일 근무 · 11-15(일) 휴진일 근무 · 연차 기간 끝 11-16 · 2.5일 정산 · 경조사 2일 · 출산·육아휴직 1일')
    expect(row[COL['남은 연차 (일)']]).toBe(2.5) // 그달 끝난 기간이 있으면 정산할 일수
    expect(row[COL['조정 (±)']]).toBe(-50_000)
    expect(row[COL['지급 합계']]).toBe(950_000)
  })

  it("AC-7609.2: 조정 까닭 글자 — '일할 계산'·'공제'·'기타', 글만 있으면 글만", () => {
    const memoOf = (adjustReason: PayLine['adjustReason'], adjustMemo: string | null) =>
      taxSheet({ ...NOV_INPUT, people: [person(LEE, { ...payLine('s-lee', {}), adjust: 10_000, adjustReason, adjustMemo })] }).rows[2][COL['메모']]
    expect(memoOf('prorate', null)).toBe('일할 계산')
    expect(memoOf('deduct', null)).toBe('공제')
    expect(memoOf('other', '명절 선물')).toBe('기타 명절 선물')
    expect(memoOf(null, '교통비')).toBe('교통비')
    expect(memoOf(null, null)).toBeNull()
  })

  it("AC-7609.2: 계좌는 그달 입사자만 '{은행} {계좌번호}'(은행이 없으면 번호만, 번호가 없으면 빈 칸)", () => {
    const people = [
      person(member('a', '새사람', '간호사', 'regular', '2026-11-16', { bank: '우리은행', accountNo: '1002-123-456789' }), null),
      person(member('b', '은행없음', '간호사', 'regular', '2026-11-02', { accountNo: '3333-01-1234567' }), null),
      person(member('c', '번호없음', '간호사', 'regular', '2026-11-02', { bank: '하나은행' }), null),
      person(KIM, null),
    ]
    const rows = taxSheet({ ...NOV_INPUT, people }).rows
    expect(rows.slice(2, 6).map((row) => row[COL['계좌 (이달 입사자만)']])).toEqual(['우리은행 1002-123-456789', '3333-01-1234567', null, null])
    const feb = taxSheet({ ...NOV_INPUT, month: '2026-02', people: [person(HAN, null)] }).rows
    expect(feb[2][COL['계좌 (이달 입사자만)']]).toBe('신한은행 110-123-456789')
  })

  it("AC-7609.2: 직종 '기타'는 직접 적은 직종, 급여 줄이 없으면 금액 칸은 비고 지급 합계 0, 남은 연차를 모르면 빈 칸", () => {
    const row = taxSheet({ ...NOV_INPUT, people: [person(member('a', '안실장', '기타', 'regular', '2020-01-01', { jobOther: '실장' }), null)] }).rows[2]
    expect(row.slice(0, 3)).toEqual(['안실장', '실장', '정규직'])
    expect(row.slice(COL['기본급'], COL['조정 (±)'] + 1)).toEqual([n, n, n, n, n, n, n])
    expect(row[COL['지급 합계']]).toBe(0)
    expect(row[COL['남은 연차 (일)']]).toBeNull()
  })

  it('AC-7609.2: 0원으로 적은 금액·남은 연차 0은 빈 칸이 아니라 0이고, 인센티브 규칙이 있으면 실적이 비어도 0', () => {
    const line = payLine('s-lee', { base: 0 }, [inc('per_case', 5_000, null, null)])
    const row = taxSheet({ ...NOV_INPUT, people: [person(LEE, line, { remaining: 0 })] }).rows[2]
    expect(row[COL['기본급']]).toBe(0)
    expect(row[COL['인센티브']]).toBe(0)
    expect(row[COL['남은 연차 (일)']]).toBe(0)
  })
})

describe('AC-7609.3: 보기 11월 합계 줄 — 엑셀 통을 다시 읽어 본다', () => {
  it('AC-7609.3: 합계 줄 기본급 16,000,000 · 연장수당 350,000 · 식대 1,120,000 · 인센티브 995,000 · 상여 0 · 직책수당 150,000 · 조정 0 · 지급 합계 18,615,000 · 연장 6.5 · 야간 1 · 휴일 4 · 연차 2.5 · 병가 1 · 무급 0', () => {
    const sum = taxSheet(NOV_INPUT).rows.at(-1)
    expect(sum).toEqual(['합계', n, n, n, n, 16_000_000, 350_000, 1_120_000, 995_000, 0, 150_000, 0, 18_615_000, 6.5, 1, 4, 2.5, 1, 0, n, n, n])
    const { rows } = reopen(NOV_INPUT)
    expect(rows.at(-1)).toEqual(sum)
  })

  it("AC-7609.3: 다시 읽은 시트 하나 '11월 급여' — 안내·머리·사람 줄이 taxSheet 줄 그대로, 최민준 메모에 '11-15(일) 휴진일 근무'", () => {
    const { book, rows } = reopen(NOV_INPUT)
    expect(book.SheetNames).toEqual(['11월 급여'])
    const expected = taxSheet(NOV_INPUT).rows
    expect(rows[0][0]).toBe(expected[0][0])
    expect(rows[0].slice(1).every((cell) => cell === null)).toBe(true)
    expect(rows.slice(1)).toEqual(expected.slice(1))
    expect(String(rowOf(rows, '최민준')?.[COL['메모']])).toContain('11-15(일) 휴진일 근무')
    expect(rows.flat().join('|')).not.toMatch(/주민/)
  })

  it('AC-7609.2·AC-7609.3: 다시 읽어도 날짜·계좌는 글자 칸, 금액은 숫자 칸(천 단위 쉼표 모양)이고, 계좌는 이달 입사자 줄에만 있다', () => {
    const people = [...NOV_PEOPLE, person(member('s-new', '새사람', '간호사', 'regular', '2026-11-16', { bank: '우리은행', accountNo: '1002-123-456789' }), null)]
    const { sheet, rows } = reopen({ ...NOV_INPUT, people })
    const account = XLSX.utils.encode_col(COL['계좌 (이달 입사자만)'])
    const newRow = rows.findIndex((row) => row[0] === '새사람') + 1
    expect(sheet[`${account}${newRow}`]).toMatchObject({ t: 's', v: '우리은행 1002-123-456789' })
    expect(rows.slice(2).filter((row) => row[COL['계좌 (이달 입사자만)']] !== null).map((row) => row[0])).toEqual(['새사람'])
    expect(sheet.D3).toMatchObject({ t: 's', v: '2021-03-02' })
    expect(sheet.F3).toMatchObject({ t: 'n', v: 2_900_000, z: '#,##0' })
    expect(sheet.M10).toMatchObject({ t: 'n', v: 18_615_000, z: '#,##0' }) // 합계 줄(새사람은 급여 줄이 없어 0)
  })
})

describe('AC-7615.7: downloadTaxExcel — 그달 파일을 내려받는다', () => {
  it('AC-7615.7: xlsx writeFile을 파일 이름 {YYYY-MM} 급여자료 ({병원 이름}).xlsx로 한 번 부른다(시트 하나)', () => {
    const sheet = taxSheet(NOV_INPUT)
    downloadTaxExcel(sheet)
    expect(XLSX.writeFile).toHaveBeenCalledTimes(1)
    const [book, fileName] = vi.mocked(XLSX.writeFile).mock.calls[0]
    expect(fileName).toBe('2026-11 급여자료 (○○정형외과).xlsx')
    expect(book.SheetNames).toEqual(['11월 급여'])
  })
})
