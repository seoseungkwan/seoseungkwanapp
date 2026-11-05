import { describe, expect, it } from 'vitest'
import {
  aragan,
  baseDate,
  dateKey,
  extractSite,
  extractTx,
  parseFU,
  passFilters,
  pasteRows,
  phoneColumn,
  phoneOf,
  phoneTokens,
  preparePhones,
  prepareSchedule,
  recordedStamp,
  scheduleRows,
  undecidedRows,
  visitKind,
  writtenDate,
} from './followup'
import { PatientsSourceError } from './sourceError'
import type { ChartVisit, FuNext } from '@/types/patients'

// 원본 양지바른(seoseungkwan/shared@2a1069b) revisit_schedule.html의 F/U 계산을 옮긴 것의 단위 시험.
// 원본과 같은지는 goldenFollowup.test.ts가 원본 결과(골든)와 견준다. 여기 자료는 모두 가짜다.

const VISIT = '2026-10-15' // 목요일

const next = (sortDate: string | null, dateStr: string, kind: FuNext['kind'], evidence: string): FuNext => ({
  dateStr,
  sortDate,
  kind,
  evidence,
})
const planned = (ymd: string, yoil: string, evidence: string) => next(ymd, `${ymd} (${yoil})`, '예정', evidence)
const NONE = next(null, '', '', '')

// 오류는 번호만: PatientsSourceError, code E-PATIENTS-SOURCE, 글에 환자 값 없음
function sourceError(run: () => unknown): PatientsSourceError {
  try {
    run()
  } catch (error) {
    expect(error).toBeInstanceOf(PatientsSourceError)
    const e = error as PatientsSourceError
    expect(e.code).toBe('E-PATIENTS-SOURCE')
    expect(e.message).not.toMatch(/가상환자|9\d{5}|010-/)
    return e
  }
  throw new Error('PatientsSourceError를 던지지 않았다')
}

describe('AC-602.1 parseFU: 상대 날짜', () => {
  it.each([
    ['1주 뒤', ['1주 뒤 f/u'], planned('2026-10-22', '목', '1주 뒤 f/u')],
    ['2주뒤', ['2주뒤 f/u'], planned('2026-10-29', '목', '2주뒤 f/u')],
    ['10주 뒤', ['10주 뒤 재내원'], planned('2026-12-24', '목', '10주 뒤 재내원')],
    ['일주일 뒤', ['일주일 뒤 오세요'], planned('2026-10-22', '목', '일주일 뒤 오세요')],
    ['1주일 뒤', ['1주일 뒤 f/u'], planned('2026-10-22', '목', '1주일 뒤 f/u')],
    ['내일', ['내일 드레싱'], planned('2026-10-16', '금', '내일 드레싱')],
    ['모레', ['모레 f/u'], planned('2026-10-17', '토', '모레 f/u')],
    ['N일 뒤', ['3일 뒤 재내원'], planned('2026-10-18', '일', '3일 뒤 재내원')],
  ])('AC-602.1 %s는 진료일에서 센다', (_name, lines, expected) => {
    expect(parseFU(VISIT, lines)).toEqual(expected)
  })

  it.each([
    ['다음주 월요일', ['다음주 월요일 재내원'], planned('2026-10-19', '월', '다음주 월요일 재내원')],
    ['담주 금', ['담주 금 f/u'], planned('2026-10-23', '금', '담주 금 f/u')],
    ['다음 주 화', ['다음 주 화 2차 주사'], planned('2026-10-20', '화', '다음 주 화 2차 주사')],
    ['○요일(같은 요일이면 다음 주)', ['목요일 무릎주사 합니다'], planned('2026-10-22', '목', '목요일 무릎주사 합니다')],
    ['○요일', ['토요일 재내원'], planned('2026-10-17', '토', '토요일 재내원')],
  ])('AC-602.1 %s: 다음 주·요일', (_name, lines, expected) => {
    expect(parseFU(VISIT, lines)).toEqual(expected)
  })

  it('AC-602.1 N월 초/중/말은 날짜 없이 글만(sortDate null)', () => {
    expect(parseFU(VISIT, ['11월 초 재내원'])).toEqual(next(null, '11월 초', '예정', '11월 초 재내원'))
    expect(parseFU(VISIT, ['11월 중 f/u'])).toEqual(next(null, '11월 중', '예정', '11월 중 f/u'))
    expect(parseFU(VISIT, ['12월말 오세요'])).toEqual(next(null, '12월 말', '예정', '12월말 오세요'))
  })

  it('AC-602.1 추후·필요시는 미정, 아프면·필요시는 조건부', () => {
    expect(parseFU(VISIT, ['추후 재내원'])).toEqual(next(null, '미정', '예정', '추후 재내원'))
    expect(parseFU(VISIT, ['필요시 재내원'])).toEqual(next(null, '미정', '조건부', '필요시 재내원'))
    expect(parseFU(VISIT, ['아프면 오세요'])).toEqual(next(null, '미정', '조건부', '아프면 오세요'))
    expect(parseFU(VISIT, ['아프면 1주뒤 재내원'])).toEqual(
      next('2026-10-22', '2026-10-22 (목)', '조건부', '아프면 1주뒤 재내원'),
    )
  })

  it('AC-602.1 적어 둔 날짜 10.17 · 10/19 · 10월 20일', () => {
    expect(parseFU(VISIT, ['10.17 f/u'])).toEqual(planned('2026-10-17', '토', '10.17 f/u'))
    expect(parseFU(VISIT, ['10/19 재내원'])).toEqual(planned('2026-10-19', '월', '10/19 재내원'))
    expect(parseFU(VISIT, ['10월 20일 재내원'])).toEqual(planned('2026-10-20', '화', '10월 20일 재내원'))
    expect(parseFU(VISIT, ['아프면 10.20 재내원'])).toEqual(
      next('2026-10-20', '2026-10-20 (화)', '조건부', '아프면 10.20 재내원'),
    )
  })

  it('AC-602.1 적어 둔 날짜는 진료일부터 120일 안만, 해를 넘길 수 있다', () => {
    expect(parseFU('2026-12-20', ['1/5 f/u'])).toEqual(planned('2027-01-05', '화', '1/5 f/u'))
    expect(writtenDate(VISIT, 10, 17, '')).toBe('2026-10-17')
    expect(writtenDate(VISIT, 2, 12, '')).toBe('2027-02-12') // 120일째
    expect(writtenDate(VISIT, 2, 13, '')).toBeNull() // 121일째
    expect(writtenDate(VISIT, 10, 10, '')).toBeNull() // 지난 날 → 내년은 120일 밖
    expect(writtenDate(VISIT, 2, 30, '')).toBeNull() // 없는 날
    expect(writtenDate(VISIT, 13, 1, '')).toBeNull()
    expect(writtenDate(VISIT, 10, 17, 'VAS ')).toBeNull()
    expect(writtenDate(VISIT, 10, 17, '통증: ')).toBeNull()
  })

  it.each([['VAS 7/10 재내원'], ['L4.5 MBB f/u'], ['NRS 5/10 f/u'], ['2/30 f/u'], ['3/1 f/u'], ['10.10 f/u'], ['통증 10/17 재내원']])(
    'AC-602.1 %s는 날짜가 아니다',
    (line) => {
      expect(parseFU(VISIT, [line])).toEqual(NONE)
    },
  )

  it('AC-602.1 날짜가 없는 지시 줄은 건너뛰고 다음 줄을 본다, 빈 줄·지시 없는 줄은 무시', () => {
    expect(parseFU(VISIT, ['', '  ', '무릎 통증', 'f/u', '2주뒤 xr f/u'])).toEqual(planned('2026-10-29', '목', '2주뒤 xr f/u'))
    expect(parseFU(VISIT, ['무릎 통증'])).toEqual(NONE)
    expect(parseFU(VISIT, [])).toEqual(NONE)
  })

  it('AC-602.1 근거(evidence)는 앞뒤 빈칸을 뗀 그 줄 전체', () => {
    expect(parseFU(VISIT, ['   1주뒤 f/u  '])).toEqual(planned('2026-10-22', '목', '1주뒤 f/u'))
  })

  it.each([
    ['N주 뒤가 내일보다 먼저', '내일 또는 1주뒤 f/u', '2026-10-22', '목'],
    ['적어 둔 날짜가 N일 뒤보다 먼저', '3일 뒤 또는 10/19 f/u', '2026-10-19', '월'],
    ['요일이 N일 뒤보다 먼저', '3일 뒤 금요일 f/u', '2026-10-16', '금'],
    ['N일 뒤가 N월 초보다 먼저', '3일 뒤 11월 초 f/u', '2026-10-18', '일'],
  ])('AC-602.1 날짜 말이 여럿이면 %s', (_name, line, ymd, yoil) => {
    expect(parseFU(VISIT, [line])).toEqual(planned(ymd, yoil, line))
  })

  it('AC-602.1 날짜 말이 여럿이면 N월 초가 추후보다 먼저', () => {
    expect(parseFU(VISIT, ['11월 초 추후 재내원'])).toEqual(next(null, '11월 초', '예정', '11월 초 추후 재내원'))
  })
})

// 원본은 11609-06-18 (목) · NaN-NaN-NaN (undefined)을 찍는다. 우리는 멈추지도, 지어낸 날짜를 보이지도 않는다(골든 knownDiffs)
describe('AC-602.1 터무니없이 먼 날은 날짜 없음', () => {
  it.each([
    ['500000주 뒤', VISIT, '500000주 뒤 f/u'],
    ['417000주 뒤(네 자리를 처음 넘는 쪽)', VISIT, '417000주 뒤 f/u'],
    ['99999999999주 뒤(원본 NaN)', VISIT, '99999999999주 뒤 f/u'],
    ['숫자가 너무 커서 무한대', VISIT, `${'9'.repeat(400)}주 뒤 f/u`],
    ['20261015일 뒤', VISIT, '20261015일 뒤 f/u'],
    ['2930000일 뒤', VISIT, '2930000일 뒤 재내원'],
    ['9999-12-31의 내일', '9999-12-31', '내일 f/u'],
    ['9999-12-31의 모레', '9999-12-31', '모레 f/u'],
    ['9999-12-31의 일주일 뒤', '9999-12-31', '일주일 뒤 f/u'],
    ['9999-12-30의 다음주 월요일', '9999-12-30', '다음주 월요일 f/u'],
    ['9999-12-30의 담주 금', '9999-12-30', '담주 금 f/u'],
    ['9999-12-31의 금요일', '9999-12-31', '금요일 f/u'],
    ['9999-10-01의 1/5', '9999-10-01', '1/5 f/u'],
  ])('AC-602.1 %s: 멈추지 않고 날짜 없음', (_name, visit, line) => {
    expect(parseFU(visit, [line])).toEqual(NONE)
  })

  it('AC-602.1 해가 네 자리면 먼 날도 그대로 날짜다', () => {
    expect(parseFU(VISIT, ['416000주 뒤 f/u']).dateStr).toMatch(/^\d{4}-\d{2}-\d{2} \(목\)$/)
    expect(parseFU('9999-12-30', ['내일 f/u'])).toEqual(planned('9999-12-31', '금', '내일 f/u'))
    expect(writtenDate('9999-10-01', 12, 31, '')).toBe('9999-12-31')
  })

  it('AC-602.1 writtenDate: 다음 해가 다섯 자리면 null', () => {
    expect(writtenDate('9999-10-01', 1, 5, '')).toBeNull()
  })

  it('AC-602.1·AC-602.2 아라간 +7일이 네 자리를 넘으면 aragan은 null, parseFU는 날짜 없음', () => {
    expect(aragan('9999-12-31', ['아라간 1차'])).toBeNull()
    expect(parseFU('9999-12-31', ['아라간 1차'])).toEqual(NONE)
  })

  it('AC-602.1 날짜를 못 준 말은 안 맞은 것처럼 다음 말·다음 줄·아라간·조건부로 넘어간다', () => {
    expect(parseFU(VISIT, ['500000주 뒤 내일 f/u'])).toEqual(planned('2026-10-16', '금', '500000주 뒤 내일 f/u'))
    expect(parseFU(VISIT, ['500000주 뒤 3일 뒤 f/u'])).toEqual(planned('2026-10-18', '일', '500000주 뒤 3일 뒤 f/u'))
    expect(parseFU('9999-12-30', ['다음주 월 금요일 f/u'])).toEqual(planned('9999-12-31', '금', '다음주 월 금요일 f/u'))
    expect(parseFU(VISIT, ['500000주 뒤 10/19 f/u'])).toEqual(planned('2026-10-19', '월', '500000주 뒤 10/19 f/u'))
    expect(parseFU(VISIT, ['500000주 뒤 11월 초 재내원'])).toEqual(next(null, '11월 초', '예정', '500000주 뒤 11월 초 재내원'))
    expect(parseFU(VISIT, ['2930000일 뒤 추후 재내원'])).toEqual(next(null, '미정', '예정', '2930000일 뒤 추후 재내원'))
    expect(parseFU(VISIT, ['500000주 뒤 f/u', '2주뒤 f/u'])).toEqual(planned('2026-10-29', '목', '2주뒤 f/u'))
    expect(parseFU(VISIT, ['500000주 뒤 f/u', '아라간 1차'])).toEqual(
      planned('2026-10-22', '목', '아라간 1차 → 1주뒤 2차주사 (자동)'),
    )
    expect(parseFU(VISIT, ['아프면 500000주 뒤 재내원'])).toEqual(next(null, '미정', '조건부', '아프면 500000주 뒤 재내원'))
    expect(parseFU(VISIT, ['불편하면 500000주 뒤 f/u'])).toEqual(NONE)
  })
})

describe('AC-602.2 aragan: 연골주사 회차', () => {
  it('AC-602.2 1차·2차면 +7일에 다음 회차', () => {
    expect(aragan(VISIT, ['무릎', '아라간 2차'])).toEqual(
      planned('2026-10-22', '목', '아라간 2차 → 1주뒤 3차주사 (자동)'),
    )
    expect(aragan(VISIT, ['아르간 1 차'])).toEqual(planned('2026-10-22', '목', '아르간 1 차 → 1주뒤 2차주사 (자동)'))
    expect(aragan(VISIT, ['Artrogen 1차', '아라간 2차'])).toEqual(
      planned('2026-10-22', '목', '아라간 2차 → 1주뒤 3차주사 (자동)'),
    )
  })

  it('AC-602.2 3차(마지막)·회차 없음·아라간 아님은 null', () => {
    expect(aragan(VISIT, ['아라간 3차'])).toBeNull()
    expect(aragan(VISIT, ['아라간 13차'])).toBeNull() // 원본 정규식은 '3차'를 먼저 찾는다
    expect(aragan(VISIT, ['아라간'])).toBeNull()
    expect(aragan(VISIT, ['MBB 1차'])).toBeNull()
  })

  it('AC-602.2 parseFU: 날짜 지시가 있으면 그것이 먼저, 없으면 아라간 자동', () => {
    expect(parseFU(VISIT, ['아라간 1차'])).toEqual(planned('2026-10-22', '목', '아라간 1차 → 1주뒤 2차주사 (자동)'))
    expect(parseFU(VISIT, ['아라간 1차', '2주뒤 f/u'])).toEqual(planned('2026-10-29', '목', '2주뒤 f/u'))
    expect(parseFU(VISIT, ['아라간 3차'])).toEqual(NONE)
  })
})

describe('AC-602.1 extractTx·extractSite', () => {
  it('AC-602.1 치료 줄은 주사·시술 말이 있고 지시가 아닌 줄, 세 줄까지', () => {
    expect(extractTx(['C-MBB 시행', '주사 고려', 'IA 시행', '1주뒤 f/u', 'ESWT 3회', 'TPI'])).toBe('C-MBB 시행 / IA 시행 / ESWT 3회')
    expect(extractTx(['무릎 통증'])).toBe('')
  })

  it('AC-602.1 부위는 줄 순서 → 표 순서로 세 개까지', () => {
    expect(extractSite(['knee pain', 'LBP'])).toBe('무릎 · 허리')
    expect(extractSite(['아라간 2차'])).toBe('연골')
    expect(extractSite(['shoulder', 'C-MBB', 'wrist', 'ankle'])).toBe('어깨 · 목 · 손목')
    expect(extractSite(['', 'x-ray'])).toBe('')
  })
})

// 간단한 83 표: 기준 날짜(마지막 진료일)는 10-15
const HEADER = ['내원번호', '차트번호', '환자명', '증상', '기록날짜']
const CHART_ROWS: unknown[][] = [
  HEADER,
  ['V7', '900007', '가상환자07', '1주뒤 f/u', '2026-10-01'],
  ['V1', '900001', '가상환자01', '무릎 통증 / 1주뒤 2차주사', '2026-10-15'],
  ['V2', '900002', '가상환자02', '허리 통증', '20261015'],
  ['V3', '900003', '가상환자03', '1주뒤 f/u', '2026-10-15'],
  ['V2', '900002', '가상환자02', '1주뒤 f/u', '202610151030'],
  ['V4', '900004', '가상환자04', '어깨 / 담주 금 f/u', '2026-10-15'],
  ['V5', '900005', '가상환자05', '아프면 1주뒤 재내원', '2026-10-15'],
  ['V6', '900006', '가상환자06', '11월 초 재내원', '2026-10-15'],
]
const PHONE_ROWS: unknown[][] = [
  ['차트번호', '휴대폰'],
  ['900001', '010-0000-0001'],
  ['900002', '010-0000-0002'],
  ['900004', '010-0000-0004'],
  ['900005', '010-0000-0005'],
]

describe('AC-602.3 dateKey·recordedStamp', () => {
  it.each(['20261007', '202610070000', '202610072359', '20261007091530', '20261007235959', '202610070915.0', 202610070915, 20261007])(
    'AC-602.3 비트 날짜 %s → 20261007',
    (value) => {
      expect(dateKey(value)).toBe('20261007')
    },
  )

  it.each(['2026-10-07', '2026/10/7', '2026.10.07', '2026-10-07T09:15:00', '2026-10-07 09:15', 46302, 46302.5])(
    'AC-602.3 %s → 20261007 (엑셀 일련번호 포함)',
    (value) => {
      expect(dateKey(value)).toBe('20261007')
    },
  )

  it.each(['202602300915', '202602291230', '202613010915', '202610072400', '202610071260', '20261007091560', '2026100709', '2026100709153', '202610070915.1', '2026-10-07 24:00', '', '46302', 60, 0, -1, 100000, null])(
    'AC-602.3 %s는 날짜가 아니다',
    (value) => {
      expect(dateKey(value)).toBeNull()
    },
  )

  it('AC-602.3 윤년 2월 29일', () => {
    expect(dateKey('202402291230')).toBe('20240229')
  })

  it('AC-602.3 기록 시각은 시각이 있을 때만', () => {
    expect(recordedStamp('202610070915')).toBe('2026-10-07T09:15:00')
    expect(recordedStamp('20261007091530')).toBe('2026-10-07T09:15:30')
    expect(recordedStamp('2026-10-07 9:05')).toBe('2026-10-07T09:05:00')
    expect(recordedStamp(46302.375)).toBe('2026-10-07T09:00:00')
    expect(recordedStamp('20261007')).toBe('')
    expect(recordedStamp(46302)).toBe('')
    expect(recordedStamp('바보')).toBe('')
  })
})

describe('AC-602.3 prepareSchedule', () => {
  it('AC-602.3 내원번호·차트번호로 묶고 줄을 이어 붙인다, 날짜 → 내원번호 순서', () => {
    const { visits, latest } = prepareSchedule(CHART_ROWS)
    expect(visits.map((v) => v.visitNo)).toEqual(['V7', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'])
    const v2: ChartVisit = {
      visitNo: 'V2',
      chart: '900002',
      name: '가상환자02',
      date: '2026-10-15',
      recordedAt: '2026-10-15T10:30:00',
      lines: ['허리 통증', '1주뒤 f/u'],
      next: planned('2026-10-22', '목', '1주뒤 f/u'),
      tx: '',
      site: '허리',
    }
    expect(latest['900002']).toEqual(v2)
    expect(Object.keys(latest).sort()).toEqual(['900001', '900002', '900003', '900004', '900005', '900006', '900007'])
  })

  it('AC-602.3 차트별 마지막 내원, 증상이 빈 새 내원도 마지막으로 친다', () => {
    const rows = [
      HEADER,
      ['V1', '900001', '가상환자01', '1주뒤 f/u', 20261007],
      ['V2', '900001', '가상환자01', '2주뒤 f/u', 20261008],
      ['V3', '900002', '가상환자02', '아라간 1차', 20261007],
      ['V4', '900002', '가상환자02', '', 20261009],
    ]
    const { visits, latest } = prepareSchedule(rows)
    expect(visits).toHaveLength(4)
    expect(latest['900001'].visitNo).toBe('V2')
    expect(latest['900001'].next.sortDate).toBe('2026-10-22')
    expect(latest['900002'].visitNo).toBe('V4')
    expect(latest['900002'].lines).toEqual([])
    expect(latest['900002'].next).toEqual(NONE)
  })

  it('AC-602.3 같은 날 내원번호는 숫자 순서(V9 → V10), 내원번호 칸이 없으면 차트번호_날짜', () => {
    const rows = [HEADER, ['V10', '900001', '가상환자01', 'f/u', '20261007'], ['V9', '900002', '가상환자02', 'f/u', '20261007']]
    expect(prepareSchedule(rows).visits.map((v) => v.visitNo)).toEqual(['V9', 'V10'])
    const noVisit = [['차트번호', '환자명', '증상', '기록날짜'], ['900001', '가상환자01', '1주뒤 f/u', '20261007']]
    expect(prepareSchedule(noVisit).visits[0].visitNo).toBe('900001_20261007')
  })

  it('AC-602.3 비트 83 끝의 총계 줄·빈 줄은 건너뛴다, 머리줄은 20줄 안에서 찾는다', () => {
    const rows = [
      ['전산자료증상'],
      ['No', '내원번호', '차트번호', '환자명', '보험유형', '증상', '기록날짜'],
      ['1', 'V1', '900021', '가상환자21', '건보', '1주뒤 f/u', '202610070915'],
      ['', '', '', '', '', '', '20261007'],
      ['【 총 계 】', '', '1,295건', '', '', '', ''],
    ]
    const { visits } = prepareSchedule(rows)
    expect(visits.map((v) => v.chart)).toEqual(['900021'])
  })

  it('AC-602.3 터무니없이 먼 날이 적힌 줄이 섞여도 모든 내원을 돌려주고, 그 줄은 날짜 없음이다', () => {
    const rows = [
      HEADER,
      ['V1', '900001', '가상환자01', '1주뒤 f/u', '20261007'],
      ['V2', '900002', '가상환자02', '500000주 뒤 f/u', '20261007'],
      ['V3', '900003', '가상환자03', '20261015일 뒤 f/u', '20261008'],
      ['V4', '900004', '가상환자04', '99999999999주 뒤 f/u', '20261008'],
      ['V5', '900005', '가상환자05', '내일 f/u', '99991231'],
      ['V6', '900006', '가상환자06', '아라간 1차', '99991231'],
    ]
    const { visits, latest } = prepareSchedule(rows)
    expect(visits.map((v) => v.visitNo)).toEqual(['V1', 'V2', 'V3', 'V4', 'V5', 'V6'])
    expect(latest['900001'].next).toEqual(planned('2026-10-14', '수', '1주뒤 f/u'))
    ;['900002', '900003', '900004', '900005', '900006'].forEach((chart, index) => expect(latest[chart].next, `내원 ${index}`).toEqual(NONE))
    // 명단에는 진짜 날짜만 나온다
    expect(scheduleRows(latest, { includeCond: true, includePast: true, base: baseDate(visits) }).map((v) => v.chart)).toEqual(['900001'])
    expect(undecidedRows(latest)).toEqual([])
  })

  // 원본도 같다(원본을 돌려 확인). 차트 칸에 총계 글이 들어가 가짜 자료 모양 시험을 못 지나므로 골든 대신 여기 둔다
  it.each([
    ['총계 글만', ['【 총 계 】', '', '', '']],
    ['총계 글과 건수', ['【 총 계 】', '3건', '', '']],
  ])('AC-602.3 차트번호가 첫 칸인 표의 %s 줄은 총계로 보지 않고 멈춘다', (_name, footer) => {
    const rows = [['차트번호', '환자명', '증상', '기록날짜'], ['900001', '가상환자01', '1주뒤 f/u', '20261007'], footer]
    expect(sourceError(() => prepareSchedule(rows)).reason).toBe('row-unreadable')
  })

  it('AC-602.3 차트번호의 .0은 뗀다(앞자리 0은 그대로)', () => {
    const rows = [HEADER, ['V1', '900001.0', '가상환자01', 'f/u', '20261007'], ['V2', '0900002', '가상환자02', 'f/u', '20261007']]
    expect(Object.keys(prepareSchedule(rows).latest).sort()).toEqual(['0900002', '900001'])
  })

  it.each([
    ['환자명 빔', [HEADER, ['V1', '900001', '', '1주뒤 f/u', '20261007']], 'row-unreadable'],
    ['차트번호 빔', [HEADER, ['V1', '', '가상환자01', '1주뒤 f/u', '20261007']], 'row-unreadable'],
    ['날짜 못 읽음', [HEADER, ['V1', '900001', '가상환자01', '1주뒤 f/u', '2026-02-30']], 'row-unreadable'],
    ['내원번호 빔', [HEADER, ['', '900001', '가상환자01', '1주뒤 f/u', '20261007']], 'visit-number-empty'],
    ['같은 내원번호 다른 환자', [HEADER, ['V1', '900001', '가상환자01', 'a', '20261007'], ['V1', '900002', '가상환자02', 'b', '20261007']], 'visit-conflict'],
    ['같은 내원번호 다른 날짜', [HEADER, ['V1', '900001', '가상환자01', 'a', '20261007'], ['V1', '900001', '가상환자01', 'b', '20261008']], 'visit-conflict'],
    ['필수 칸 없음', [['내원번호', '차트번호', '환자명', '기록날짜'], ['V1', '900001', '가상환자01', '20261007']], 'header-missing'],
    ['필수 칸 중복', [['내원번호', '차트번호', '환자차트번호', '환자명', '증상', '기록날짜']], 'header-duplicate'],
    ['자료 없음', [HEADER], 'no-visits'],
  ])('AC-602.3 %s → E-PATIENTS-SOURCE', (_name, rows, reason) => {
    expect(sourceError(() => prepareSchedule(rows as unknown[][])).reason).toBe(reason)
  })
})

describe('AC-602.4 전화', () => {
  it.each([
    ['휴대폰', true],
    ['휴대폰번호', true],
    ['휴대 전화', true],
    ['핸드폰', true],
    ['이동전화번호', true],
    ['연락처', true],
    ['전화번호', true],
    ['보호자 연락처', true],
    ['보호자휴대폰', true],
    ['연락처2', true],
    ['휴대폰(1)', true],
    ['연락처3', false],
    ['팩스', false],
    ['FAX 번호', false],
    ['전화번호 확인일', false],
    ['전화', false],
    ['보호자', false],
    ['차트번호', false],
  ])('AC-602.4 칸 이름 %s → %s', (header, expected) => {
    expect(phoneColumn(header)).toBe(expected)
  })

  it('AC-602.4 phoneTokens: 번호 나누기, 주석 숫자는 붙이지 않는다', () => {
    expect(phoneTokens('010-0000-0001 / 010-0000-0002')).toEqual({
      values: [
        { number: '01000000001', raw: '010-0000-0001' },
        { number: '01000000002', raw: '010-0000-0002' },
      ],
      invalid: false,
    })
    expect(phoneTokens('010-0000-0003(보호자 2)')).toEqual({ values: [{ number: '01000000003', raw: '010-0000-0003' }], invalid: false })
    expect(phoneTokens('+82-10-0000-0004')).toEqual({ values: [{ number: '+821000000004', raw: '+82-10-0000-0004' }], invalid: false })
    expect(phoneTokens('모름')).toEqual({ values: [], invalid: true })
    expect(phoneTokens('010****0005')).toEqual({ values: [], invalid: true })
    expect(phoneTokens('')).toEqual({ values: [], invalid: true })
  })

  it('AC-602.4 번호가 하나인 차트만 map, 팩스 칸은 보지 않는다', () => {
    const rows = [
      ['차트번호', '팩스', '휴대폰', '보호자연락처'],
      ['900001', '010-0000-9001', '010-0000-0001', ''],
      ['900002', '', '010-0000-0002', '010-0000-0102'],
      ['900003', '', '010-0000-0003', '010-0000-0003'],
      ['900001', '', '010-0000-0001', ''],
      ['900004', '', '', ''],
      ['0', '', '010-0000-0099', ''],
    ]
    const phones = preparePhones(rows)
    expect({ ...phones.map }).toEqual({ '900001': '010-0000-0001', '900003': '010-0000-0003' })
    expect(phones).toMatchObject({ loaded: true, count: 3, missing: false })
  })

  it('AC-602.4 앞자리 0만 다른 차트번호는 같은 사람으로 본다', () => {
    const phones = preparePhones([['차트번호', '휴대폰'], ['0900005', '010-0000-0005']])
    expect({ ...phones.map }).toEqual({ '0900005': '010-0000-0005', '900005': '010-0000-0005' })
    expect(phoneOf(phones.map, '900005')).toBe('010-0000-0005')
    expect(phoneOf({ '900006': '010-0000-0006' }, '0900006')).toBe('010-0000-0006')
    expect(phoneOf(phones.map, '900009')).toBe('')
  })

  // 원본도 같다(원본을 돌려 확인). 숫자 셋 이상이 남아 가짜 자료 모양 시험을 못 지나므로 골든 대신 여기 둔다
  it.each([
    ['너무 짧은 + 번호', '+1 2 345'],
    ['너무 긴 + 번호', '+999 9999 9999 9999 9999'],
  ])('AC-602.4 %s는 번호가 아니다', (_name, raw) => {
    expect(phoneTokens(raw)).toEqual({ values: [], invalid: true })
  })

  it('AC-602.4 + 번호가 틀려도 같은 칸의 다른 번호는 읽고, 칸은 invalid', () => {
    expect(phoneTokens('010-0000-0001 / +1 2 345')).toEqual({
      values: [{ number: '01000000001', raw: '010-0000-0001' }],
      invalid: true,
    })
  })

  it('AC-602.4 전화 칸이 없으면 멈춘다, allowMissing이면 전화 없이', () => {
    const rows = [['차트번호', '처방코드'], ['900001', 'A49']]
    expect(sourceError(() => preparePhones(rows)).reason).toBe('phone-column-missing')
    const phones = preparePhones(rows, true)
    expect({ ...phones.map }).toEqual({})
    expect(phones).toMatchObject({ loaded: false, count: 0, missing: true })
  })

  it.each([
    ['같은 차트에 다른 번호', [['차트번호', '휴대폰'], ['900001', '010-0000-0001'], ['900001', '010-0000-0002']], 'phone-conflict'],
    ['앞자리 0만 다른 차트에 다른 번호', [['차트번호', '휴대폰'], ['0900001', '010-0000-0001'], ['900001', '010-0000-0002']], 'phone-conflict'],
    ['같은 전화 칸 이름 둘', [['차트번호', '휴대폰', '휴 대폰'], ['900001', '010-0000-0001', '']], 'phone-column-duplicate'],
    ['차트번호 칸 없음', [['환자번호', '휴대폰'], ['900001', '010-0000-0001']], 'header-missing'],
    ['차트번호 칸 둘', [['차트번호', '환자차트번호', '휴대폰']], 'header-duplicate'],
  ])('AC-602.4 %s → E-PATIENTS-SOURCE', (_name, rows, reason) => {
    expect(sourceError(() => preparePhones(rows)).reason).toBe(reason)
  })
})

describe('AC-602.5 명단·붙여넣기', () => {
  const { visits, latest } = prepareSchedule(CHART_ROWS)
  const phones = preparePhones(PHONE_ROWS)
  const base = baseDate(visits)
  const charts = (list: ChartVisit[]) => list.map((v) => v.chart)

  it('AC-602.5 기준 날짜는 마지막 진료일', () => {
    expect(base).toBe('2026-10-15')
    expect(baseDate([])).toBe('')
  })

  it('AC-602.5 내원 예정: 기본은 예정·기준 날짜부터, 날짜 → 차트번호 순서', () => {
    expect(charts(scheduleRows(latest, { includeCond: false, includePast: false, base }))).toEqual(['900001', '900002', '900003', '900004'])
    expect(charts(scheduleRows(latest, { includeCond: true, includePast: false, base }))).toEqual([
      '900001',
      '900002',
      '900003',
      '900005',
      '900004',
    ])
    expect(charts(scheduleRows(latest, { includeCond: false, includePast: true, base }))).toEqual([
      '900007',
      '900001',
      '900002',
      '900003',
      '900004',
    ])
  })

  it('AC-602.5 내원 예정: 예정일이 기준 날짜와 같으면 남고, 기준 날짜보다 앞서면 빠진다', () => {
    const shown = (from: string) => charts(scheduleRows(latest, { includeCond: false, includePast: false, base: from }))
    expect(shown('2026-10-22')).toEqual(['900001', '900002', '900003', '900004'])
    expect(shown('2026-10-23')).toEqual(['900004'])
    expect(shown('2026-10-08')).toEqual(['900007', '900001', '900002', '900003', '900004'])
    expect(shown('2026-10-09')).toEqual(['900001', '900002', '900003', '900004'])
  })

  it('AC-602.5 날짜 미정: 글은 있고 날짜가 없는 지시', () => {
    expect(charts(undecidedRows(latest))).toEqual(['900006'])
  })

  it('AC-602.5 주사 / F/U는 다음에 왜 오는지로', () => {
    const kind = (evidence: string) => visitKind({ next: next(null, '', '', evidence) })
    expect(kind('1주뒤 2차주사')).toBe('주사')
    expect(kind('다음주 화요일 ESWT후 f/u')).toBe('F/U')
    expect(kind('다음주 월요일 2차/목요일 3차.')).toBe('주사')
    expect(kind('1주뒤 도수치료 2차')).toBe('F/U')
    expect(kind('아라간 1차 → 1주뒤 2차주사 (자동)')).toBe('주사')
    expect(kind('')).toBe('F/U')
    expect(visitKind(latest['900001'])).toBe('주사')
  })

  it('AC-602.5 passFilters: 구분, 기간(useDate일 때만, 날짜 없는 줄은 기간이 있으면 빠짐)', () => {
    const v1 = latest['900001']
    expect(passFilters(v1, { kind: '' }, false)).toBe(true)
    expect(passFilters(v1, { kind: '주사' }, false)).toBe(true)
    expect(passFilters(v1, { kind: 'F/U' }, false)).toBe(false)
    expect(passFilters(v1, { kind: '', from: '2026-10-23' }, true)).toBe(false)
    expect(passFilters(v1, { kind: '', from: '2026-10-23' }, false)).toBe(true)
    expect(passFilters(v1, { kind: '', from: '2026-10-22', to: '2026-10-22' }, true)).toBe(true)
    expect(passFilters(latest['900006'], { kind: '', to: '2026-12-31' }, true)).toBe(false)
    expect(passFilters(latest['900006'], { kind: '' }, true)).toBe(true)
  })

  it('AC-602.5 붙여넣기 4칸: 하루 안에서 주사 먼저, 날짜가 바뀌면 빈 줄, 번호 없는 사람은 빠짐', () => {
    const list = scheduleRows(latest, { includeCond: false, includePast: false, base })
    expect(pasteRows(list, phones, { withDate: false })).toEqual([
      ['가상환자01', '010-0000-0001', '가상환자01', '무릎'],
      ['가상환자02', '010-0000-0002', '가상환자02', 'fu'],
      ['', '', '', ''],
      ['가상환자04', '010-0000-0004', '가상환자04', 'fu'],
    ])
  })

  it('AC-602.5 날짜 머리 줄(날짜 (요일) — N명)', () => {
    const list = scheduleRows(latest, { includeCond: false, includePast: false, base })
    expect(pasteRows(list, phones, { withDate: true })).toEqual([
      ['2026-10-22 (목) — 2명', '', '', ''],
      ['가상환자01', '010-0000-0001', '가상환자01', '무릎'],
      ['가상환자02', '010-0000-0002', '가상환자02', 'fu'],
      ['', '', '', ''],
      ['2026-10-23 (금) — 1명', '', '', ''],
      ['가상환자04', '010-0000-0004', '가상환자04', 'fu'],
    ])
  })

  it('AC-602.5 전화 자료가 없으면 모두 나오고 번호 칸은 빈칸, 기간은 그 날짜만', () => {
    const list = scheduleRows(latest, { includeCond: false, includePast: false, base })
    expect(pasteRows(list, { map: {}, loaded: false }, { withDate: false })).toEqual([
      ['가상환자01', '', '가상환자01', '무릎'],
      ['가상환자02', '', '가상환자02', 'fu'],
      ['가상환자03', '', '가상환자03', 'fu'],
      ['', '', '', ''],
      ['가상환자04', '', '가상환자04', 'fu'],
    ])
    expect(pasteRows(list, phones, { from: '2026-10-23', to: '2026-10-23', withDate: false })).toEqual([
      ['가상환자04', '010-0000-0004', '가상환자04', 'fu'],
    ])
    expect(pasteRows([], phones, { withDate: true })).toEqual([])
  })
})
