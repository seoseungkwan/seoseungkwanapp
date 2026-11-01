import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { ClinicReportInput, ClinicReportMode, ClinicReportNumbers } from '@/types/clinicReport'
import { formatClinicReport } from './reportText'

// 골든은 원본 양지바른(medicore/reports.py)을 scripts/stats/golden/reports.py로 돌린 결과다.
// 시험은 원본 없이 커밋한 파일과 견준다. 모두 가짜 숫자다

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

    it.each(goldens)('AC-510.1 골든 $name: 적어 둔 차이 말고는 글·안내가 순서까지 같다', ({ golden }) => {
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

    it('AC-510.1 0으로 버려진 음수 건당진료비는 원본처럼 "-0원"이다', () => {
      expect(made(format('daily', sample('daily-negative-zero'))).text).toContain('건당진료비      -0원')
      expect(made(format('daily', sample('daily-negative-to-zero'))).text).toContain('건당진료비      -0원')
    })

    it('AC-510.1 받은 숫자를 고치지 않는다(LA 코드 차례)', () => {
      const numbers = sample('monthly-la')
      const before = structuredClone(numbers)
      made(format('monthly', numbers))
      expect(numbers).toEqual(before)
    })
  })

  describe('AC-510.2 금액 확인 필요', () => {
    it('AC-510.2 일일: 금액 줄과 건당진료비가 "확인 필요"이고 그 줄 번호를 0부터 돌려준다', () => {
      const result = made(format('daily', sample('daily-unconfirmed')))
      const lines = result.text.split('\n')
      expect(result.unconfirmedLines).toEqual([7, 8, 9, 10, 11, 12, 20])
      expect(result.unconfirmedLines.map((index) => lines[index])).toEqual([
        '총진료비        확인 필요',
        '조합청구액      확인 필요',
        '입금액 (현금)         확인 필요',
        '       (카드)         확인 필요',
        '       (계좌이체)     확인 필요',
        '비급여          확인 필요',
        '건당진료비      확인 필요',
      ])
    })

    it('AC-510.2 월말: 입금액 줄이 없어 줄 번호도 다르다', () => {
      const result = made(format('monthly', sample('monthly-unconfirmed')))
      const lines = result.text.split('\n')
      expect(result.unconfirmedLines).toEqual([5, 6, 7, 17])
      expect(result.unconfirmedLines.map((index) => lines[index])).toEqual([
        '총진료비        확인 필요',
        '조합청구액      확인 필요',
        '비급여          확인 필요',
        '건당진료비      확인 필요',
      ])
    })

    it('AC-510.2 금액이 들어 있어도 글에 나오지 않고 다른 숫자는 그대로다', () => {
      const numbers = { ...sample('daily-normal'), financeUnconfirmed: true }
      const masked = made(format('daily', numbers)).text.split('\n')
      expect(masked.filter((line) => /[\d,]+원$/.test(line))).toEqual([])
      const plain = made(format('daily', sample('daily-normal'))).text.split('\n')
      const counts = plain.filter((line) => /[\d,]+[명건]$/.test(line))
      expect(counts.length).toBeGreaterThan(0)
      expect(masked).toEqual(expect.arrayContaining(counts))
    })

    it('AC-510.2 총환 0명이어도 건당진료비는 "산출 불가"가 아니라 "확인 필요"다', () => {
      const result = made(format('daily', sample('daily-zero-visits-unconfirmed')))
      expect(result.text).toContain('건당진료비      확인 필요')
      expect(result.text).not.toContain('산출 불가')
    })

    it('AC-510.2 사유가 없으면 원본의 기본 사유 줄이다', () => {
      const { text } = made(format('monthly', sample('monthly-unconfirmed')))
      expect(text).toContain('※ 금액 확인 필요 — 환불·변경수납·예치금 또는 연결 중복. 비트 원본에서 확인해 아래 금액을 직접 입력하세요.')
    })

    it('AC-510.2 사유 글에 줄바꿈이 있어도 줄 번호는 글의 진짜 줄을 가리킨다', () => {
      const numbers = { ...sample('daily-unconfirmed'), financeUnconfirmedReason: '첫째 줄\n둘째 줄' }
      const result = made(format('daily', numbers))
      const lines = result.text.split('\n')
      expect(result.unconfirmedLines).toEqual([8, 9, 10, 11, 12, 13, 21])
      for (const index of result.unconfirmedLines) expect(lines[index]).toMatch(/확인 필요$/)
    })

    it('AC-510.2 병원 이름에 줄바꿈이 있어도 줄 번호는 글의 진짜 줄을 가리킨다', () => {
      const result = made(formatClinicReport({ mode: 'daily', numbers: sample('daily-unconfirmed'), hospitalName: '가상\n의원' }, TODAY))
      const lines = result.text.split('\n')
      expect(result.unconfirmedLines).toEqual([8, 9, 10, 11, 12, 13, 21])
      for (const index of result.unconfirmedLines) expect(lines[index]).toMatch(/확인 필요$/)
    })

    it('AC-510.2 확인 필요가 아니면 줄 번호가 없다', () => {
      expect(made(format('daily', sample('daily-normal'))).unconfirmedLines).toEqual([])
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
