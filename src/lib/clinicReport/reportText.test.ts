import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { ClinicReportInput, ClinicReportMode, ClinicReportNumbers } from '@/types/clinicReport'
import { formatClinicReport } from './reportText'

// 골든은 원본 양지바른(medicore/reports.py)을 scripts/stats/golden/reports.py로 돌린 결과다.
// 시험은 원본 없이 커밋한 파일과 견준다. 모두 가짜 숫자다
// 확인 필요 사례 셋은 bit-total(REQ-6908)에서 일부러 원본과 달라졌다. 골든 파일은 그대로 두고 원본 비교에서 빼 같은 입력으로 새 글을 본다(design.md 5절)

type Confirmed = Extract<ClinicReportNumbers, { ok: true }>
type KnownDiff = { field: 'lines' | 'notes'; index: number; original: string; ours: string; why: string }
type OriginalInput = {
  mode: ClinicReportMode
  period: string
  hospital_name: string
  total_visits: number
  new_patients: number
  return_patients: number
  total_amount: number
  insurer_amount: number
  noncovered_amount: number
  cash_amount: number
  card_amount: number
  transfer_amount: number
  treatments: Confirmed['treatments']
  la_codes: Confirmed['laCodes']
  notes: string[]
  finance_unconfirmed?: boolean
  finance_unconfirmed_reason?: string
}
type Head = { source: string; file: string; entry: string; knownDiffs: KnownDiff[] }
type CaseGolden = Head & { input: OriginalInput; output: { lines: string[]; notes: string[] } }
type PeriodGolden = Head & { cases: { mode: ClinicReportMode; period: string; today: string; future: boolean }[] }

const GOLDEN_DIR = new URL('../../../fixtures/stats/golden/', import.meta.url)
const read = <T,>(name: string): T => JSON.parse(readFileSync(new URL(`report-${name}.json`, GOLDEN_DIR), 'utf8')) as T

const CASES = [
  'daily-normal',
  'daily-unconfirmed',
  'daily-zero-visits',
  'daily-zero-visits-unconfirmed',
  'daily-negative',
  'daily-negative-half',
  'daily-negative-zero',
  'daily-negative-to-zero',
  'daily-sub-won',
  'monthly-la',
  'monthly-no-la',
  'monthly-unconfirmed',
  'monthly-zero-visits',
  'monthly-largest',
]
const goldens = CASES.map((name) => ({ name, golden: read<CaseGolden>(name) }))
const periods = read<PeriodGolden>('period')
const UNCONFIRMED_CASES = ['daily-unconfirmed', 'daily-zero-visits-unconfirmed', 'monthly-unconfirmed']
const confirmedGoldens = goldens.filter(({ name }) => !UNCONFIRMED_CASES.includes(name))

// 안내 글(bit-total AC-6908.3·AC-6908.4·AC-6912.5). 옛 글 셋은 지금 운영의 웹·도우미(0.13.0 전) 글이다
const OLD_WEB_NOTE =
  '이 기간은 환불·변경수납·예치금 또는 연결 중복이 있어 금액을 자동 집계하지 않았습니다(‘확인 필요’). 환자수·치료·LA 집계는 정상이며, 금액은 비트 원본 외래환자경영통계에서 확인해 직접 입력하세요.'
const NEW_WEB_NOTE =
  '이 기간은 환불·변경수납·예치금 또는 연결 중복이 있어 지금 도우미가 금액을 세지 않았습니다(–). 도우미를 0.13.0으로 올린 뒤 [비트에서 불러오기]를 다시 하면 채워집니다.'
const OLD_HELPER_MONEY =
  "금액은 외래환자경영통계의 회계일 기준 정상수납·미수입금 조건으로 집계합니다. 환불·변경수납·예치금 또는 연결 중복이 있으면 금액을 '확인 필요'로 두고 환자수·치료·LA만 집계합니다."
const NEW_HELPER_MONEY =
  '금액은 외래환자경영통계의 회계일 기준 정상수납·미수입금 조건으로 집계합니다. 환불·변경수납·예치금 또는 연결 중복이 있는 기간도 같은 조건으로 집계해 비트 원본 통계와 다를 수 있습니다.'
const OLD_HELPER_UNCOUNTED = '이 기간은 금액을 자동 집계하지 않았습니다(환자수·치료·LA는 정상). 비트 원본 외래환자경영통계에서 금액을 확인해 직접 입력하세요.'
const DAILY_BASE_NOTES = [
  '총환은 내원 건수 기준이며, 건당진료비는 총진료비 ÷ 총환에서 원 미만을 버립니다.',
  '입금액은 비트 원본 수납 구분에 따라 현금·카드·계좌이체를 각각 집계하며 서로 합산하거나 재분류하지 않습니다.',
  '신환 내원경로의 0은 요청에 따른 고정값이며 실제 유입 집계가 아닙니다.',
  '치료 인원은 치료별 당일 환자 중복을 제외한 값입니다.',
]

function toNumbers(input: OriginalInput): Confirmed {
  return {
    ok: true,
    period: input.period,
    totalVisits: input.total_visits,
    newPatients: input.new_patients,
    returnPatients: input.return_patients,
    totalAmount: input.total_amount,
    insurerAmount: input.insurer_amount,
    noncoveredAmount: input.noncovered_amount,
    cashAmount: input.cash_amount,
    cardAmount: input.card_amount,
    transferAmount: input.transfer_amount,
    treatments: input.treatments,
    laCodes: input.la_codes,
    financeUnconfirmed: input.finance_unconfirmed === true,
    ...(input.finance_unconfirmed_reason === undefined ? {} : { financeUnconfirmedReason: input.finance_unconfirmed_reason }),
    notes: input.notes,
  }
}

// 원본 결과에 적어 둔 차이만 입힌다. 적지 않은 차이는 그대로 실패로 드러난다
function expectedFrom({ output, knownDiffs }: CaseGolden) {
  const expected = { lines: [...output.lines], notes: [...output.notes] }
  for (const diff of knownDiffs) {
    expect(expected[diff.field][diff.index]).toBe(diff.original)
    expected[diff.field][diff.index] = diff.ours
  }
  return expected
}

const TODAY = '2026-11-01'

function format(mode: ClinicReportMode, numbers: ClinicReportNumbers, today = TODAY) {
  return formatClinicReport({ mode, numbers, hospitalName: '가상의원' }, today)
}

function made(result: ReturnType<typeof formatClinicReport>) {
  if ('error' in result) throw new Error(`글을 만들어야 하는데 오류: ${result.error}`)
  return result
}

const sample = (name: string) => toNumbers(read<CaseGolden>(name).input)

describe('REQ-510 원장님 보고 문장', () => {
  describe('AC-510.1 원본과 같은 글·안내', () => {
    it('AC-510.1 report-*.json 골든은 정해 둔 사례가 다 있고 더 없다', () => {
      const files = readdirSync(GOLDEN_DIR).filter((file) => file.startsWith('report-'))
      expect(files.sort()).toEqual([...CASES, 'period'].map((name) => `report-${name}.json`).sort())
    })

    it('AC-510.1 골든 머리에 원본 출처가 있다', () => {
      for (const golden of [...goldens.map((item) => item.golden), periods]) {
        expect(golden.source).toBe('seoseungkwan/shared@2a1069b')
        expect(golden.file).toBe('YangjiBareun_사전점검/medicore/reports.py')
        expect(golden.entry).not.toBe('')
        expect(Array.isArray(golden.knownDiffs)).toBe(true)
      }
    })

    it('AC-510.1·AC-6908.2 원본 비교에서 빼는 사례는 확인 필요(finance_unconfirmed) 사례 셋뿐이다', () => {
      expect(goldens.filter(({ golden }) => golden.input.finance_unconfirmed === true).map(({ name }) => name)).toEqual(UNCONFIRMED_CASES)
      expect(confirmedGoldens).toHaveLength(CASES.length - UNCONFIRMED_CASES.length)
    })

    it.each(confirmedGoldens)('AC-510.1 골든 $name: 적어 둔 차이 말고는 글·안내가 순서까지 같다', ({ golden }) => {
      const { input } = golden
      const expected = expectedFrom(golden)
      const result = made(formatClinicReport({ mode: input.mode, numbers: toNumbers(input), hospitalName: input.hospital_name }, TODAY))
      expect(result.text.split('\n')).toEqual(expected.lines)
      expect(result.text).toBe(expected.lines.join('\n'))
      expect(result.notes).toEqual(expected.notes)
    })

    it('AC-510.1 knownDiffs는 원 미만 버림이 바꾼 금액 줄과 안내 첫 줄뿐이고 이유가 적혀 있다', () => {
      const amount = /-?[\d,]+원$/
      for (const { golden } of goldens) {
        const noteDiffs = golden.knownDiffs.filter((diff) => diff.field === 'notes')
        expect(noteDiffs.map((diff) => diff.index)).toEqual([0])
        expect(noteDiffs[0].original).toContain('반올림')
        expect(noteDiffs[0].ours).not.toContain('반올림')
        for (const diff of golden.knownDiffs) {
          expect(diff.why).not.toBe('')
          if (diff.field !== 'lines') continue
          expect(diff.original).toMatch(amount)
          expect(diff.ours).toMatch(amount)
          expect(diff.ours.replace(amount, '')).toBe(diff.original.replace(amount, ''))
        }
      }
    })

    it('AC-510.1 원 미만 금액 사례: 차이는 반올림과 버림이 갈리는 그 줄뿐이다', () => {
      const golden = read<CaseGolden>('daily-sub-won')
      const changed = golden.knownDiffs.filter((diff) => diff.field === 'lines').map((diff) => [diff.original, diff.ours])
      expect(changed).toEqual([
        ['총진료비        100,005원', '총진료비        100,004원'],
        ['조합청구액      65,001원', '조합청구액      65,000원'],
        ['입금액 (현금)         1,201원', '입금액 (현금)         1,200원'],
        ['       (카드)         27,501원', '       (카드)         27,500원'],
        ['비급여          15,001원', '비급여          15,000원'],
        ['건당진료비      12,501원', '건당진료비      12,500원'],
      ])
      // 원 미만이 .5 아래인 줄은 원본과 같다
      expect(golden.output.lines).toContain('       (계좌이체)     6,300원')
    })

    it('AC-510.1 음수 금액은 원본이 찍는 그대로다("-1,000원")', () => {
      const { text } = made(format('daily', sample('daily-negative')))
      expect(text).toContain('총진료비        -1,000원')
      expect(text).toContain('건당진료비      -333원')
    })

    it('AC-510.1 음수 건당진료비도 0 쪽으로 버린다', () => {
      expect(made(format('daily', sample('daily-negative-half'))).text).toContain('건당진료비      -666원')
    })

    it('AC-510.1 버린 건당진료비가 0이면 부호 없이 "0원"이다(-1원·-2원 ÷ 3명), 그 밖의 음수는 그대로다(-3원 ÷ 3명)', () => {
      expect(made(format('daily', sample('daily-negative-zero'))).text).toContain('건당진료비      0원')
      expect(made(format('daily', sample('daily-negative-to-zero'))).text).toContain('건당진료비      0원')
      const minusThree = { ...sample('daily-negative-zero'), totalAmount: -3 }
      expect(minusThree.totalVisits).toBe(3)
      expect(made(format('daily', minusThree)).text).toContain('건당진료비      -1원')
    })

    it('AC-510.1 "0원"의 부호 차이는 knownDiffs에 따로 이유가 적혀 있다', () => {
      const original = { 'daily-negative-zero': '건당진료비      -0원', 'daily-negative-to-zero': '건당진료비      -1원' }
      for (const [name, line] of Object.entries(original)) {
        const lineDiffs = read<CaseGolden>(name).knownDiffs.filter((diff) => diff.field === 'lines')
        expect(lineDiffs).toMatchObject([{ original: line, ours: '건당진료비      0원', why: expect.stringContaining('부호') }])
      }
    })

    it('AC-510.1 받은 숫자를 고치지 않는다(LA 코드 차례)', () => {
      const numbers = sample('monthly-la')
      const before = structuredClone(numbers)
      made(format('monthly', numbers))
      expect(numbers).toEqual(before)
    })
  })

  describe('AC-510.3 글을 만들지 않는 때', () => {
    it.each(periods.cases)('AC-510.3 원본 validate_period와 같다: $mode $period, 오늘 $today → 미래 $future', ({ mode, period, today, future }) => {
      const numbers = { ...sample('daily-normal'), period }
      const result = format(mode, numbers, today)
      if (future) expect(result).toEqual({ error: 'future-date' })
      else expect(made(result).text).toContain('고생하셨습니다 !!')
    })

    it('AC-510.3 ok: false 벌은 사유와 함께 unconfirmed이고 글이 없다', () => {
      const reason = '내원 기록의 누락 또는 중복으로 보고를 확정할 수 없습니다.'
      expect(format('daily', { ok: false, period: '2024-02-29', reason })).toEqual({ error: 'unconfirmed', reason })
      expect(format('monthly', { ok: false, period: '2024-02', reason })).toEqual({ error: 'unconfirmed', reason })
    })

    it('AC-510.3 미래 날짜의 ok: false 벌은 future-date다', () => {
      expect(format('daily', { ok: false, period: '2026-11-02', reason: '가짜 사유' })).toEqual({ error: 'future-date' })
    })

    it.each([
      ['daily', '2024-02'],
      ['monthly', '2024-02-29'],
    ] as const)('AC-510.3 고르기와 기간 모양이 다르면(%s %s) 틀린 제목을 만들지 않고 던진다', (mode, period) => {
      expect(() => format(mode, { ...sample('daily-normal'), period })).toThrow(RangeError)
    })
  })

  describe('AC-510.4 입력 모양', () => {
    // 모양에 칸이 늘거나 줄면 tsc가 이 값에서 막는다(남는 칸·빠진 칸 모두). 아래 시험이 그 열쇠 목록을 못 박는다
    const confirmed: Required<Confirmed> = {
      ok: true,
      period: '2024-02-29',
      totalVisits: 0,
      newPatients: 0,
      returnPatients: 0,
      totalAmount: 0,
      insurerAmount: 0,
      noncoveredAmount: 0,
      cashAmount: 0,
      cardAmount: 0,
      transferAmount: 0,
      treatments: { manual: 0, eswt: 0, carm: 0, sono: 0, cryo: 0 },
      laCodes: [{ code: 'LA1', count: 1 }],
      financeUnconfirmed: false,
      financeUnconfirmedReason: '',
      notes: [],
    }
    const stopped: Extract<ClinicReportNumbers, { ok: false }> = { ok: false, period: '2024-02-29', reason: '' }
    const input: ClinicReportInput = { mode: 'daily', numbers: confirmed, hospitalName: '가상의원' }

    it('AC-510.4 열쇠는 집계 숫자·기간뿐이다', () => {
      expect(Object.keys(confirmed).sort()).toEqual([
        'cardAmount',
        'cashAmount',
        'financeUnconfirmed',
        'financeUnconfirmedReason',
        'insurerAmount',
        'laCodes',
        'newPatients',
        'noncoveredAmount',
        'notes',
        'ok',
        'period',
        'returnPatients',
        'totalAmount',
        'totalVisits',
        'transferAmount',
        'treatments',
      ])
      expect(Object.keys(confirmed.treatments).sort()).toEqual(['carm', 'cryo', 'eswt', 'manual', 'sono'])
      expect(Object.keys(confirmed.laCodes[0]).sort()).toEqual(['code', 'count'])
      expect(Object.keys(stopped).sort()).toEqual(['ok', 'period', 'reason'])
    })

    it('AC-510.4 받는 것은 고르기·숫자·병원 이름뿐이다', () => {
      expect(Object.keys(input).sort()).toEqual(['hospitalName', 'mode', 'numbers'])
    })

    it('AC-510.4 chart·name·rows·patient 칸이 없다', () => {
      const keys = [...Object.keys(confirmed), ...Object.keys(stopped), ...Object.keys(confirmed.treatments), ...Object.keys(input)]
      for (const banned of ['chart', 'name', 'rows', 'patient']) expect(keys).not.toContain(banned)
    })
  })
})

// ── bit-total REQ-6908: 원장님 보고 문장 — 확인 필요 없이 (design.md 5절) ─────────────────
describe('REQ-6908 원장님 보고 문장 — 확인 필요 없이', () => {
  const lines = (result: ReturnType<typeof formatClinicReport>) => made(result).text.split('\n')
  const DAILY_DASH = [
    '총진료비        –',
    '조합청구액      –',
    '입금액 (현금)         –',
    '       (카드)         –',
    '       (계좌이체)     –',
    '비급여          –',
    '건당진료비      –',
  ]
  const MONTHLY_DASH = ['총진료비        –', '조합청구액      –', '비급여          –', '건당진료비      –']
  const fromGolden = (name: string) => {
    const golden = read<CaseGolden>(name)
    return { golden, result: made(formatClinicReport({ mode: golden.input.mode, numbers: toNumbers(golden.input), hospitalName: golden.input.hospital_name }, TODAY)) }
  }

  describe('AC-6908.1 도우미 0.13.0 벌(그런 날·달도 financeUnconfirmed 거짓, 금액 여섯 칸 숫자)', () => {
    it('AC-6908.1 일일: 총진료비·조합청구액·입금액 셋·비급여·건당진료비가 모두 원 글이다', () => {
      const numbers: Confirmed = {
        ...sample('daily-normal'),
        totalVisits: 102,
        newPatients: 9,
        returnPatients: 93,
        totalAmount: 5213400,
        insurerAmount: 1016900,
        noncoveredAmount: 2184000,
        cashAmount: 412000,
        cardAmount: 3486500,
        transferAmount: 298000,
        financeUnconfirmed: false,
        notes: [NEW_HELPER_MONEY],
      }
      const shown = lines(format('daily', numbers))
      const from = shown.indexOf('재진                  93명') + 1
      expect(from).toBeGreaterThan(0)
      expect(shown.slice(from, from + 6)).toEqual([
        '총진료비        5,213,400원',
        '조합청구액      1,016,900원',
        '입금액 (현금)         412,000원',
        '       (카드)         3,486,500원',
        '       (계좌이체)     298,000원',
        '비급여          2,184,000원',
      ])
      expect(shown).toContain('건당진료비      51,111원')
      expect(shown.join('\n')).not.toContain('확인 필요')
      expect(shown.filter((line) => line.endsWith('–'))).toEqual([])
    })

    it('AC-6908.1 월말: 총진료비·조합청구액·비급여·건당진료비가 원 글이다', () => {
      const numbers: Confirmed = {
        ...sample('monthly-la'),
        totalVisits: 100,
        totalAmount: 120000000,
        insurerAmount: 80000000,
        noncoveredAmount: 30000000,
        financeUnconfirmed: false,
      }
      const shown = lines(format('monthly', numbers))
      expect(shown).toEqual(
        expect.arrayContaining(['총진료비        120,000,000원', '조합청구액      80,000,000원', '비급여          30,000,000원', '건당진료비      1,200,000원']),
      )
      expect(shown.join('\n')).not.toContain('확인 필요')
    })
  })

  describe('AC-6908.2 0.13.0 전 도우미의 financeUnconfirmed 벌: 금액 줄은 "–"', () => {
    it.each(UNCONFIRMED_CASES)('AC-6908.2 골든 %s 입력: ※ 줄이 없고 금액 줄만 "–"이며 다른 줄은 원본 그대로다', (name) => {
      const { golden, result } = fromGolden(name)
      const expected = golden.output.lines.filter((line) => !line.startsWith('※ 금액 확인 필요')).map((line) => line.replace(/확인 필요$/, '–'))
      expect(expected).toHaveLength(golden.output.lines.length - 1)
      expect(result.text.split('\n')).toEqual(expected)
      expect(result.text).not.toContain('확인 필요')
      expect(result.text).not.toContain('※')
    })

    it('AC-6908.2 일일: 금액 줄 일곱이 차례대로 "–"다', () => {
      expect(lines(format('daily', sample('daily-unconfirmed'))).filter((line) => line.endsWith('–'))).toEqual(DAILY_DASH)
    })

    it('AC-6908.2 월말: 입금액 줄이 없어 금액 줄 넷이 차례대로 "–"다', () => {
      expect(lines(format('monthly', sample('monthly-unconfirmed'))).filter((line) => line.endsWith('–'))).toEqual(MONTHLY_DASH)
    })

    it('AC-6908.2 금액이 들어 있어도 글에 나오지 않고, 금액 줄 말고 다른 줄은 확인된 벌과 같다', () => {
      const plain = lines(format('daily', sample('daily-normal')))
      const masked = lines(format('daily', { ...sample('daily-normal'), financeUnconfirmed: true }))
      expect(masked.filter((line) => /[\d,]+원$/.test(line))).toEqual([])
      expect(masked).toEqual(plain.map((line) => line.replace(/-?[\d,]+원$/, '–')))
      expect(masked.filter((line) => line.endsWith('–'))).toEqual(DAILY_DASH)
    })

    it('AC-6908.2 총환 0명이어도 건당진료비는 "산출 불가"가 아니라 "–"다', () => {
      const shown = lines(format('daily', sample('daily-zero-visits-unconfirmed')))
      expect(shown).toContain('건당진료비      –')
      expect(shown.join('\n')).not.toContain('산출 불가')
    })

    it('AC-6908.2 사유(financeUnconfirmedReason)가 있든 없든(줄바꿈이 있어도) 글이 같고 어디에도 "확인 필요"가 없다', () => {
      const { financeUnconfirmedReason: _reason, ...without } = sample('daily-unconfirmed')
      expect(_reason).not.toBeUndefined()
      const plain = made(format('daily', without)).text
      expect(plain).not.toContain('확인 필요')
      for (const reason of ['가짜 사유', '첫째 줄\n둘째 줄']) {
        const { text } = made(format('daily', { ...without, financeUnconfirmedReason: reason }))
        expect(text).toBe(plain)
        expect(text).not.toContain(reason.split('\n')[0]!)
      }
    })

    it('AC-6908.2 병원 이름에 줄바꿈이 있어도 금액 줄은 "–" 일곱이다', () => {
      const shown = lines(formatClinicReport({ mode: 'daily', numbers: sample('daily-unconfirmed'), hospitalName: '가상\n의원' }, TODAY))
      expect(shown.slice(0, 2)).toEqual(['가상', '의원'])
      expect(shown.filter((line) => line.endsWith('–'))).toEqual(DAILY_DASH)
    })

    it('AC-6908.2 돌려주는 글 벌은 text·notes뿐이다(줄 번호 unconfirmedLines 없음)', () => {
      expect(Object.keys(made(format('daily', sample('daily-unconfirmed')))).sort()).toEqual(['notes', 'text'])
      expect(Object.keys(made(format('daily', sample('daily-normal')))).sort()).toEqual(['notes', 'text'])
    })
  })

  describe('AC-6908.3 financeUnconfirmed 벌의 웹 안내', () => {
    it.each(UNCONFIRMED_CASES)('AC-6908.3 골든 %s 입력: 옛 웹 안내 자리에 새 안내이고 다른 안내는 원본 그대로다', (name) => {
      const { golden, result } = fromGolden(name)
      const expected = expectedFrom(golden).notes.map((note) => (note === OLD_WEB_NOTE ? NEW_WEB_NOTE : note))
      expect(expected).toContain(NEW_WEB_NOTE)
      expect(result.notes).toEqual(expected)
      expect(result.notes.join('\n')).not.toContain('확인 필요')
    })

    it('AC-6908.3 확인된 벌에는 금액을 세지 않았다는 웹 안내가 없다', () => {
      const { notes } = made(format('daily', sample('daily-normal')))
      expect(notes).not.toContain(NEW_WEB_NOTE)
      expect(notes).not.toContain(OLD_WEB_NOTE)
    })
  })

  describe('AC-6908.4 도우미 안내 바꾸기', () => {
    it('AC-6908.4 확인된 벌: 옛 금액 안내는 같은 자리에서 새 금액 안내(AC-6912.5 글)로 바뀌고 다른 안내는 그대로다', () => {
      const { notes } = made(format('daily', { ...sample('daily-normal'), notes: ['앞 안내', OLD_HELPER_MONEY, '뒤 안내'] }))
      expect(notes).toEqual([...DAILY_BASE_NOTES, '앞 안내', NEW_HELPER_MONEY, '뒤 안내'])
    })

    it('AC-6908.4 financeUnconfirmed 벌: 옛 금액 안내를 빼고 새 금액 안내도 넣지 않으며 "이 기간은 금액을 자동 집계하지 않았습니다…"도 뺀다', () => {
      const numbers = { ...sample('daily-unconfirmed'), notes: ['앞 안내', OLD_HELPER_MONEY, OLD_HELPER_UNCOUNTED, '뒤 안내'] }
      const { notes } = made(format('daily', numbers))
      expect(notes).toEqual([...DAILY_BASE_NOTES, NEW_WEB_NOTE, '앞 안내', '뒤 안내'])
      expect(notes).not.toContain(NEW_HELPER_MONEY)
    })

    it('AC-6908.4 월말 financeUnconfirmed 벌도 같다', () => {
      const numbers = { ...sample('monthly-unconfirmed'), notes: [OLD_HELPER_MONEY, OLD_HELPER_UNCOUNTED, '가상 자료입니다.'] }
      expect(made(format('monthly', numbers)).notes).toEqual([
        '총환은 내원 건수 기준이며, 건당진료비는 총진료비 ÷ 총환에서 원 미만을 버립니다.',
        '치료 및 LA 코드 건수는 취소·삭제 등을 제외한 유효 처방 건수이며 총투여량이 아닙니다.',
        NEW_WEB_NOTE,
        '가상 자료입니다.',
      ])
    })

    it('AC-6908.4 "이 기간은 금액을 자동 집계하지 않았습니다…"는 확인된 벌에서도 뺀다', () => {
      const { notes } = made(format('daily', { ...sample('daily-normal'), notes: [OLD_HELPER_UNCOUNTED, '뒤 안내'] }))
      expect(notes).toEqual([...DAILY_BASE_NOTES, '뒤 안내'])
    })

    it('AC-6908.4 글이 정확히 같을 때만 바꾸거나 뺀다(앞뒤 띄어쓰기가 다르면 그대로)', () => {
      const near = [`${OLD_HELPER_MONEY} `, ` ${OLD_HELPER_UNCOUNTED}`]
      expect(made(format('daily', { ...sample('daily-normal'), notes: near })).notes).toEqual([...DAILY_BASE_NOTES, ...near])
      expect(made(format('daily', { ...sample('daily-unconfirmed'), notes: near })).notes).toEqual([...DAILY_BASE_NOTES, NEW_WEB_NOTE, ...near])
    })

    it('AC-6908.4 0.13.0 도우미의 새 금액 안내는 그대로이고 옛 글과 함께 와도 한 번만 나온다', () => {
      expect(made(format('daily', { ...sample('daily-normal'), notes: [NEW_HELPER_MONEY] })).notes).toEqual([...DAILY_BASE_NOTES, NEW_HELPER_MONEY])
      expect(made(format('daily', { ...sample('daily-normal'), notes: [OLD_HELPER_MONEY, NEW_HELPER_MONEY] })).notes).toEqual([
        ...DAILY_BASE_NOTES,
        NEW_HELPER_MONEY,
      ])
    })

    it('AC-6908.4 받은 안내 목록을 고치지 않는다', () => {
      const numbers = { ...sample('daily-unconfirmed'), notes: [OLD_HELPER_MONEY, OLD_HELPER_UNCOUNTED] }
      const before = structuredClone(numbers)
      made(format('daily', numbers))
      expect(numbers).toEqual(before)
    })
  })
})
