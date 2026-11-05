import { describe, expect, it } from 'vitest'
import { preparePhones, prepareSchedule } from './followup'
import {
  KEEP_MONTHS,
  MAX_RECORDS,
  RECALL_DEFAULTS,
  ingestRecall,
  prepareRx,
  recallCompute,
  recallCopyLines,
  recallCoverage,
  recallPhones,
  recallSelect,
  recallStatus,
  roundTest,
  validateHistory,
  type RecallItem,
  type RecallRule,
} from './recall'
import { PatientsSourceError } from './sourceError'
import type { ChartVisit, RecallHistory, RecallRecord } from '@/types/patients'

// 정기 주사 계산 사례. 기대값은 원본(seoseungkwan/shared@2a1069b)으로 돌려 확인한 값이다(fixtures/patients/golden/recall-*.json, 원본 시험 tests/test_revisit_source.py).
// 원본에 없는 칸(readThrough)과 일부러 다르게 한 곳(날짜 없음)은 골든 knownDiffs에 적은 그대로다.

const CHART = (i: number) => `9000${String(i).padStart(2, '0')}`
const NAME = (i: number) => `가상환자${String(i).padStart(2, '0')}`
const PHONE = (i: number) => `010-0000-${String(i).padStart(4, '0')}`
const rec = (i: number, date: string, codes: string[], text: string, phone = ''): RecallRecord => ({
  chart: CHART(i),
  name: NAME(i),
  date,
  codes,
  text,
  phone,
})
const cart = (i: number, date: string, text: string, phone = '') => rec(i, date, ['A49'], text, phone)
const vitd = (i: number, date: string, phone = '') => rec(i, date, ['A32'], '비타민D', phone)
const H83 = ['내원번호', '차트번호', '환자명', '증상', '기록날짜']
const H47 = ['처방코드', '처방명칭', '차트번호', '급여구분', '처방일자', '휴대폰']
const empty = (): RecallHistory => ({ from: null, readThrough: null, records: [] })

function caught(run: () => unknown): PatientsSourceError {
  try {
    run()
  } catch (error) {
    if (error instanceof PatientsSourceError) return error
    throw error
  }
  throw new Error('멈추지 않았다')
}

describe('AC-603.1 RECALL_DEFAULTS', () => {
  it('AC-603.1 연골주사 A49 3차 뒤 6개월, 비타민D A32 맞을 때마다 3개월', () => {
    expect(RECALL_DEFAULTS.map((r) => `${r.label}:${r.codes.join()}:${r.round}:${r.months}`)).toEqual(['연골주사:A49:3차:6', '비타민D:A32::3'])
    expect(RECALL_DEFAULTS.map((r) => [r.id, r.enabled])).toEqual([
      ['cartilage', true],
      ['vitamin-d', true],
    ])
  })

  it('AC-603.1 한도: 36개월, 50,000건', () => {
    expect(KEEP_MONTHS).toBe(36)
    expect(MAX_RECORDS).toBe(50_000)
  })
})

describe('AC-603.1 roundTest', () => {
  it('AC-603.1 3차는 13차·23차·33차·03차와 구분한다', () => {
    const third = roundTest('3차')
    expect(third('아라간 3차')).toBe(true)
    expect(third('아라간 3 차')).toBe(true)
    expect(third('3차')).toBe(true)
    expect(third('아라간3차')).toBe(true)
    ;['아라간 13차', '아라간 23차', '아라간 33차', '아라간 03차', '아라간 1차', ''].forEach((text, index) => {
      expect(third(text), `사례 ${index}`).toBe(false)
    })
  })

  it('AC-603.1 조건이 없으면 늘 맞다', () => {
    expect(roundTest('')('아무 글')).toBe(true)
    expect(roundTest('')('')).toBe(true)
  })

  it('AC-603.1 숫자 차가 아니면 포함 여부를 대소문자 없이 본다(정규식이 아니다)', () => {
    expect(roundTest('ARAGAN')('aragan 주사')).toBe(true)
    expect(roundTest('무릎')('어깨 주사')).toBe(false)
    expect(roundTest('(')('주사 (왼쪽)')).toBe(true)
    expect(roundTest('123차')('아라간 3차')).toBe(false)
    expect(roundTest('3차 ')('아라간 3차')).toBe(false)
  })
})

describe('AC-603.2 prepareRx', () => {
  it('AC-603.2 차트번호(앞자리 0 뗌)|처방일자 → 처방코드(대문자, 같은 코드 한 번)', () => {
    const index = prepareRx([
      H47,
      ['a49', '가짜 약', '0900001', '급여', '20261007', PHONE(1)],
      ['A15', '가짜 약', '900001', '급여', '2026-10-07', ''],
      ['A49', '가짜 약', 900001, '급여', 20261007, ''],
      [' A32 ', '가짜 약', '900002.0', '급여', '20261008', ''],
    ])
    expect([...index.keys()]).toEqual(['900001|20261007', '900002|20261008'])
    expect([...(index.get('900001|20261007') ?? [])]).toEqual(['A49', 'A15'])
    expect([...(index.get('900002|20261008') ?? [])]).toEqual(['A32'])
  })

  it('AC-603.2 코드·차트·날짜를 못 읽는 줄은 건너뛴다(멈추지 않는다)', () => {
    const index = prepareRx([
      H47,
      ['', '가짜 약', '900001', '급여', '20261007', ''],
      ['A49', '가짜 약', '', '급여', '20261007', ''],
      ['A49', '가짜 약', '900002', '급여', '20261345', ''],
      ['A49', '가짜 약', '900003', '급여', '어제', ''],
      ['A49', '가짜 약', '900004', '급여', '202610092500', ''],
    ])
    expect(index.size).toBe(0)
  })

  it('AC-603.2 머리줄이 없거나 필수 칸이 둘이면 원본처럼 E-PATIENTS-SOURCE로 멈춘다', () => {
    expect(caught(() => prepareRx([])).reason).toBe('header-missing')
    expect(caught(() => prepareRx([['처방명칭', '차트번호', '처방일자']])).reason).toBe('header-missing')
    expect(caught(() => prepareRx([['처방코드', '차트번호', '차트번호(옛)', '처방일자']])).reason).toBe('header-duplicate')
    expect(caught(() => prepareRx([])).code).toBe('E-PATIENTS-SOURCE')
  })

  it('AC-603.2 머리줄은 20줄 안에서만 찾는다', () => {
    const filler = Array.from({ length: 19 }, () => ['가짜 줄'])
    expect(prepareRx([...filler, H47, ['A49', '가짜 약', '900001', '급여', '20261007', '']]).size).toBe(1)
    expect(caught(() => prepareRx([['가짜 줄'], ...filler, H47])).reason).toBe('header-missing')
  })
})

describe('AC-603.2 validateHistory', () => {
  const ok = cart(1, '2026-04-15', '아라간 3차', PHONE(1))

  it('AC-603.2 모양이 맞으면 여섯 칸만 복사해 돌려준다', () => {
    const input = { from: '2026-01-01', readThrough: '2026-10-31', extra: 1, records: [{ ...ok, extra: 'x' }] }
    const result = validateHistory(input)
    expect(result).toEqual({ from: '2026-01-01', readThrough: '2026-10-31', records: [ok] })
    expect(result.records[0].codes).not.toBe(input.records[0].codes)
    expect(Object.keys(result.records[0])).toEqual(['chart', 'name', 'date', 'codes', 'text', 'phone'])
  })

  it.each([null, undefined, 0, '', '기록', 7, [], {}, { from: null }, { from: null, records: {} }, { records: [] }, { from: '', records: [] }])(
    'AC-603.2 전체 모양이 틀리면 원본처럼 E-PATIENTS-SOURCE로 멈춘다: 사례 %j',
    (value) => {
      const error = caught(() => validateHistory(value))
      expect(error.code).toBe('E-PATIENTS-SOURCE')
      expect(error.reason).toBe('row-unreadable')
    },
  )

  it.each(['2026-02-30', '2026-1-1', '0999-12-31', '0099-12-31', '10000-01-01', 20260101])('AC-603.2 from을 못 읽으면 멈춘다: %s', (from) => {
    expect(caught(() => validateHistory({ from, records: [] })).reason).toBe('row-unreadable')
  })

  it('AC-603.2 기록 수: 50,000건까지 받고 넘으면 멈춘다', () => {
    const records = (n: number) => Array.from({ length: n }, () => ok)
    expect(validateHistory({ from: null, records: records(MAX_RECORDS) }).records).toHaveLength(MAX_RECORDS)
    expect(caught(() => validateHistory({ from: null, records: records(MAX_RECORDS + 1) })).reason).toBe('row-unreadable')
  })

  it.each([
    ['null', null],
    ['글자', 'x'],
    ['차트 모양', { ...ok, chart: '../x' }],
    ['차트 31자', { ...ok, chart: 'a'.repeat(31) }],
    ['차트 숫자', { ...ok, chart: 900001 }],
    ['차트 __proto__', { ...ok, chart: '__proto__' }],
    ['이름 빈칸', { ...ok, name: '' }],
    ['이름 101자', { ...ok, name: '가'.repeat(101) }],
    ['없는 날', { ...ok, date: '2026-02-30' }],
    ['999년', { ...ok, date: '0999-12-31' }],
    ['다섯 자리 해', { ...ok, date: '10000-01-01' }],
    ['날짜가 글자 아님', { ...ok, date: 20260415 }],
    ['날짜가 배열', { ...ok, date: ['2026-04-15'] }],
    ['코드 없음', { ...ok, codes: [] }],
    ['코드 21개', { ...ok, codes: Array.from({ length: 21 }, (_, i) => `A${i}`) }],
    ['코드 소문자', { ...ok, codes: ['a49'] }],
    ['코드 숫자', { ...ok, codes: [49] }],
    ['증상 1,001자', { ...ok, text: '가'.repeat(1001) }],
    ['전화 61자', { ...ok, phone: '-'.repeat(61) }],
    ['전화 null', { ...ok, phone: null }],
  ])('AC-603.2 기록 하나가 이상하면 그 기록만 뺀다: %s', (_name, record) => {
    expect(validateHistory({ from: null, records: [record, ok] }).records).toEqual([ok])
  })

  it('AC-603.2 한도 끝 값은 받는다(이름 100자·증상 1,000자·전화 60자·차트 30자·코드 20개·1000년·9999년)', () => {
    const limit = {
      ...ok,
      name: '가'.repeat(100),
      text: '가'.repeat(1000),
      phone: '-'.repeat(60),
      chart: '9'.repeat(30),
      codes: Array.from({ length: 20 }, (_, i) => `A${i}`),
    }
    const records = [limit, { ...ok, date: '1000-01-01' }, { ...ok, date: '9999-12-31' }, { ...ok, chart: 'constructor' }]
    expect(validateHistory({ from: '1000-01-01', records }).records).toEqual(records)
  })

  it.each([
    ['없음', undefined, null],
    ['null', null, null],
    ['날짜', '2026-10-31', '2026-10-31'],
    ['없는 날', '2026-02-30', null],
    ['숫자', 20261031, null],
    ['999년', '0999-12-31', null],
    ['다섯 자리 해', '10000-01-01', null],
  ])('AC-603.2 readThrough는 null 또는 날짜다(이상하면 처음 읽는 것으로, 멈추지 않는다): %s', (_name, readThrough, expected) => {
    expect(validateHistory({ from: null, readThrough, records: [] }).readThrough).toBe(expected)
  })
})

describe('AC-603.2 ingestRecall', () => {
  const piece = (chart: unknown[][] | null, rx: unknown[][] | null, from: string, to: string) => ({
    visits: chart ? prepareSchedule(chart).visits : [],
    rx: rx ? prepareRx(rx) : new Map<string, Set<string>>(),
    phones: rx ? preparePhones(rx, true).map : (Object.create(null) as Record<string, string>),
    from,
    to,
  })
  const visit = (no: number, i: number, ymd: string, symptom: string) => [`V${no}`, CHART(i), NAME(i), symptom, ymd.replace(/-/g, '')]
  const given = (code: string, i: number, ymd: string, phone = '') => [code, '가짜 약', CHART(i), '급여', ymd.replace(/-/g, ''), phone]

  it('AC-603.2 코드가 처방된 내원만 그날 증상·전화와 함께 쌓는다(원본 시험 사례)', () => {
    const next = ingestRecall(
      empty(),
      piece(
        [H83, visit(1, 1, '2026-04-15', '무릎'), visit(1, 1, '2026-04-15', '아라간 3차'), visit(2, 2, '2026-04-16', 'MBB'), visit(3, 3, '2026-04-20', '비타민D')],
        [H47, given('A49', 1, '2026-04-15', PHONE(1)), given('A15', 1, '2026-04-15'), given('A15', 2, '2026-04-16'), given('A32', 3, '2026-04-20')],
        '2026-04-01',
        '2026-04-30',
      ),
      ['A49', 'A32'],
      '2026-10-16',
    )
    expect(next).toEqual({
      from: '2026-04-01',
      readThrough: '2026-04-30',
      records: [
        { chart: CHART(1), name: NAME(1), date: '2026-04-15', codes: ['A49'], text: '무릎 / 아라간 3차', phone: PHONE(1) },
        { chart: CHART(3), name: NAME(3), date: '2026-04-20', codes: ['A32'], text: '비타민D', phone: '' },
      ],
    })
  })

  it('AC-603.2 그 기간(양 끝 포함)의 예전 기록은 새것으로 바꾸고 하루 밖은 그대로 둔다', () => {
    const before: RecallHistory = {
      from: '2026-01-01',
      readThrough: '2026-05-31',
      records: [cart(1, '2026-03-31', '하루 앞'), cart(2, '2026-04-01', '옛 첫날'), cart(3, '2026-04-15', '옛 글'), vitd(4, '2026-04-30'), vitd(5, '2026-05-01')],
    }
    const next = ingestRecall(before, piece([H83, visit(3, 3, '2026-04-15', '아라간 3차 고침')], [H47, given('A49', 3, '2026-04-15')], '2026-04-01', '2026-04-30'), ['A49', 'A32'], '2026-10-16')
    expect(next.records.map((r) => `${r.chart}:${r.date}:${r.text}`)).toEqual([
      `${CHART(1)}:2026-03-31:하루 앞`,
      `${CHART(3)}:2026-04-15:아라간 3차 고침`,
      `${CHART(5)}:2026-05-01:비타민D`,
    ])
    expect(before.records).toHaveLength(5) // 받은 기록은 고치지 않는다
  })

  it('AC-603.2 전화가 바뀌면 새 내원만 새 번호다', () => {
    const next = ingestRecall(
      { from: '2026-03-01', readThrough: '2026-03-31', records: [vitd(1, '2026-03-10', PHONE(100))] },
      piece([H83, visit(1, 1, '2026-04-10', '비타민D')], [H47, given('A32', 1, '2026-04-10', PHONE(101))], '2026-04-01', '2026-04-30'),
      ['A32'],
      '2026-10-16',
    )
    expect(next.records.map((r) => r.phone)).toEqual([PHONE(100), PHONE(101)])
  })

  it('AC-603.2 36개월: 그 날은 남고 하루 앞은 지우며 from도 그 날로 당긴다', () => {
    const next = ingestRecall(
      { from: '2023-01-01', readThrough: '2026-10-16', records: [cart(1, '2023-10-16', '하루 앞'), cart(2, '2023-10-17', '그 날'), cart(3, '2023-10-18', '하루 뒤')] },
      piece(null, null, '2026-10-17', '2026-10-17'),
      ['A49'],
      '2026-10-17',
    )
    expect(next.records.map((r) => r.chart)).toEqual([CHART(2), CHART(3)])
    expect(next.from).toBe('2023-10-17')
    expect(next.readThrough).toBe('2026-10-17')
  })

  it('AC-603.2 36개월 말일 맞춤: 윤날 오늘은 3년 전 2월 28일까지 남긴다', () => {
    const next = ingestRecall(
      { from: '2021-03-01', readThrough: null, records: [cart(1, '2021-02-27', '하루 앞'), cart(2, '2021-02-28', '그 날')] },
      piece(null, null, '2024-02-01', '2024-02-29'),
      ['A49'],
      '2024-02-29',
    )
    expect(next.records.map((r) => r.chart)).toEqual([CHART(2)])
    expect(next.from).toBe('2021-03-01')
  })

  it.each([
    ['기록이 더 이르면 그대로', '2026-01-01', '2026-03-01', '2026-01-01'],
    ['읽은 시작이 더 이르면 그것', '2026-03-01', '2026-01-01', '2026-01-01'],
    ['같으면 그대로', '2026-03-01', '2026-03-01', '2026-03-01'],
    ['처음이면 읽은 시작', null, '2026-03-01', '2026-03-01'],
    ['36개월보다 앞이면 그 날', null, '2020-01-01', '2023-10-16'],
    ['36개월과 같으면 그 날', null, '2023-10-16', '2023-10-16'],
  ])('AC-603.2 from: %s', (_name, before, from, expected) => {
    const next = ingestRecall({ from: before, readThrough: null, records: [] }, piece(null, null, from, from), ['A49'], '2026-10-16')
    expect(next.from).toBe(expected)
  })

  it.each([
    ['처음', null, '2026-04-30', '2026-04-30'],
    ['전 값이 앞', '2026-03-31', '2026-04-30', '2026-04-30'],
    ['전 값이 뒤(옛 달 다시 읽기)', '2026-05-31', '2026-04-30', '2026-05-31'],
    ['같음', '2026-04-30', '2026-04-30', '2026-04-30'],
  ])('AC-603.2 readThrough는 전 값과 읽은 끝 중 뒤: %s', (_name, before, to, expected) => {
    const next = ingestRecall({ from: null, readThrough: before, records: [] }, piece(null, null, '2026-04-01', to), ['A49'], '2026-10-16')
    expect(next.readThrough).toBe(expected)
  })

  it('AC-603.2 같은 날은 차트번호 숫자 순서, 같은 사람이면 쌓인 것이 먼저다', () => {
    const next = ingestRecall(
      { from: '2026-04-01', readThrough: null, records: [vitd(7, '2026-05-01'), vitd(20, '2026-05-01')] },
      piece(
        [H83, visit(1, 7, '2026-05-01', '새 글'), ['V3', `0${CHART(30)}`, NAME(30), '새 글', '20260501']],
        [H47, given('A32', 7, '2026-05-01'), given('A32', 30, '2026-05-01')],
        '2026-04-01',
        '2026-04-30',
      ),
      ['A32'],
      '2026-10-16',
    )
    expect(next.records.map((r) => `${r.chart}:${r.text}`)).toEqual([`${CHART(7)}:비타민D`, `${CHART(7)}:새 글`, `${CHART(20)}:비타민D`, `0${CHART(30)}:새 글`])
  })

  it('AC-603.2 차트번호 모양이 안 맞는 내원은 쌓지 않는다', () => {
    const next = ingestRecall(
      empty(),
      piece(
        [H83, ['V1', '9000 01', NAME(1), '비타민D', '20260415'], ['V2', '9000.02', NAME(2), '비타민D', '20260415'], ['V3', '900-003', NAME(3), '비타민D', '20260415']],
        [H47, ['A32', '가짜 약', '9000 01', '급여', '20260415', ''], ['A32', '가짜 약', '9000.02', '급여', '20260415', ''], ['A32', '가짜 약', '900-003', '급여', '20260415', '']],
        '2026-04-01',
        '2026-04-30',
      ),
      ['A32'],
      '2026-10-16',
    )
    expect(next.records.map((r) => r.chart)).toEqual(['900-003'])
  })

  it('AC-603.2 이름 100자·증상 1,000자·전화 60자에서 자른다', () => {
    const visits = [{ chart: CHART(1), name: `${NAME(1)}${'가'.repeat(100)}`, date: '2026-04-15', lines: [`  ${'증'.repeat(600)}  `, '', '상'.repeat(600)] }] as ChartVisit[]
    const next = ingestRecall(
      empty(),
      { visits, rx: new Map([[`${CHART(1)}|20260415`, new Set(['A32'])]]), phones: { [CHART(1)]: '-'.repeat(61) }, from: '2026-04-01', to: '2026-04-30' },
      ['A32'],
      '2026-10-16',
    )
    expect(next.records[0].name).toHaveLength(100)
    expect(next.records[0].text).toHaveLength(1000)
    expect(next.records[0].text.slice(598, 605)).toBe('증증 / 상상')
    expect(next.records[0].phone).toHaveLength(60)
  })

  it('AC-603.2 넘겨받은 코드만 본다. 소문자도 같은 코드다', () => {
    const rows = [H83, visit(1, 1, '2026-04-15', '주사'), visit(2, 2, '2026-04-15', '주사')]
    const rx = [H47, given('A49', 1, '2026-04-15'), given('B7', 2, '2026-04-15')]
    expect(ingestRecall(empty(), piece(rows, rx, '2026-04-01', '2026-04-30'), ['a49'], '2026-10-16').records.map((r) => r.chart)).toEqual([CHART(1)])
    expect(ingestRecall(empty(), piece(rows, rx, '2026-04-01', '2026-04-30'), [], '2026-10-16').records).toEqual([])
  })

  it('AC-603.2 처방 코드는 정렬해 쌓는다', () => {
    const next = ingestRecall(
      empty(),
      piece([H83, visit(1, 1, '2026-04-15', '주사')], [H47, given('A49', 1, '2026-04-15'), given('A32', 1, '2026-04-15')], '2026-04-01', '2026-04-30'),
      ['A49', 'A32'],
      '2026-10-16',
    )
    expect(next.records[0].codes).toEqual(['A32', 'A49'])
  })

  it('AC-603.2 전화는 차트번호 그대로 → 앞자리 0 뗀 값 순서로 찾는다', () => {
    const visits = [{ chart: `0${CHART(1)}`, name: NAME(1), date: '2026-04-15', lines: ['비타민D'] }] as ChartVisit[]
    const rx = new Map([[`${CHART(1)}|20260415`, new Set(['A32'])]])
    const base = { visits, rx, from: '2026-04-01', to: '2026-04-30' }
    expect(ingestRecall(empty(), { ...base, phones: { [`0${CHART(1)}`]: PHONE(1), [CHART(1)]: PHONE(2) } }, ['A32'], '2026-10-16').records[0].phone).toBe(PHONE(1))
    expect(ingestRecall(empty(), { ...base, phones: { [CHART(1)]: PHONE(2) } }, ['A32'], '2026-10-16').records[0].phone).toBe(PHONE(2))
  })

  it('AC-603.2 차트번호가 constructor여도 전화 칸에 함수 글자가 들어가지 않는다(보통 객체를 넘겨도)', () => {
    const visits = [{ chart: 'constructor', name: NAME(1), date: '2026-04-15', lines: ['비타민D'] }] as ChartVisit[]
    const next = ingestRecall(
      empty(),
      { visits, rx: new Map([['constructor|20260415', new Set(['A32'])]]), phones: {}, from: '2026-04-01', to: '2026-04-30' },
      ['A32'],
      '2026-10-16',
    )
    expect(next.records[0].phone).toBe('')
  })

  it('AC-603.2 50,000건을 넘으면 가장 오래된 것부터 뺀다(멈추지 않는다, from은 그대로)', () => {
    const records = Array.from({ length: MAX_RECORDS }, (_, i) => vitd(i % 100, '2026-01-01'))
    records[0] = vitd(1, '2025-12-31')
    const next = ingestRecall(
      { from: '2025-12-31', readThrough: null, records },
      piece([H83, visit(1, 1, '2026-04-15', '비타민D')], [H47, given('A32', 1, '2026-04-15')], '2026-04-01', '2026-04-30'),
      ['A32'],
      '2026-10-16',
    )
    expect(next.records).toHaveLength(MAX_RECORDS)
    expect(next.records.some((r) => r.date === '2025-12-31')).toBe(false)
    expect(next.records[next.records.length - 1].date).toBe('2026-04-15')
    expect(next.from).toBe('2025-12-31')
  })
})

describe('AC-603.3 recallCompute', () => {
  const summary = (items: RecallItem[]) => items.map((i) => `${i.label}:${i.chart}:${i.last}→${i.due}:${i.evidence}`)

  it('AC-603.3 마지막 주사만 본다: 새 1차 시작·13차는 빠지고, 말일에 맞춘다(원본 시험 사례)', () => {
    const records = [
      cart(1, '2026-04-01', '아라간 1차'),
      cart(1, '2026-04-08', '아라간 2차'),
      cart(1, '2026-04-15', '무릎 / 아라간 3차', PHONE(1)),
      cart(2, '2026-03-01', '아라간 3차'),
      cart(2, '2026-09-01', '아라간 1차'),
      vitd(3, '2026-07-31'),
      rec(4, '2026-08-31', ['A32', 'A49'], '아라간 3차 · 비타민D'),
      cart(5, '2026-05-01', '아라간 13차'),
    ]
    expect(summary(recallCompute(records, RECALL_DEFAULTS))).toEqual([
      `연골주사:${CHART(1)}:2026-04-15→2026-10-15:아라간 3차`,
      `비타민D:${CHART(3)}:2026-07-31→2026-10-31:비타민D`,
      `비타민D:${CHART(4)}:2026-08-31→2026-11-30:아라간 3차 · 비타민D`,
      `연골주사:${CHART(4)}:2026-08-31→2027-02-28:아라간 3차 · 비타민D`,
    ])
  })

  it('AC-603.3 항목은 규칙 값과 기록 값을 그대로 담는다', () => {
    expect(recallCompute([cart(1, '2026-04-15', '아라간 3차', PHONE(1))], RECALL_DEFAULTS)).toEqual([
      { ruleId: 'cartilage', label: '연골주사', months: 6, chart: CHART(1), name: NAME(1), phone: PHONE(1), last: '2026-04-15', due: '2026-10-15', evidence: '아라간 3차' },
    ])
  })

  it('AC-603.3 같은 날 두 기록은 뒤에 온 것이 마지막이다(순서 지킴)', () => {
    expect(recallCompute([cart(1, '2026-06-05', '아라간 3차'), cart(1, '2026-06-05', '아라간 1차')], RECALL_DEFAULTS)).toEqual([])
    expect(summary(recallCompute([cart(1, '2026-06-05', '아라간 1차'), cart(1, '2026-06-05', '아라간 3차')], RECALL_DEFAULTS))).toEqual([
      `연골주사:${CHART(1)}:2026-06-05→2026-12-05:아라간 3차`,
    ])
  })

  it('AC-603.3 넣은 순서가 아니라 날짜로 마지막을 본다, 받은 목록은 고치지 않는다', () => {
    const records = [cart(1, '2026-06-20', '아라간 3차'), cart(1, '2026-06-07', '아라간 1차')]
    expect(recallCompute(records, RECALL_DEFAULTS).map((i) => i.last)).toEqual(['2026-06-20'])
    expect(records.map((r) => r.date)).toEqual(['2026-06-20', '2026-06-07'])
  })

  it('AC-603.3 앞자리 0만 다른 차트번호는 한 사람이다', () => {
    const zero = { ...cart(1, '2026-03-01', '아라간 3차'), chart: `0${CHART(1)}` }
    expect(recallCompute([cart(1, '2026-02-01', '아라간 1차'), zero], RECALL_DEFAULTS).map((i) => i.chart)).toEqual([`0${CHART(1)}`])
    expect(recallCompute([zero, cart(1, '2026-04-01', '아라간 1차')], RECALL_DEFAULTS)).toEqual([])
  })

  it('AC-603.3 다른 코드 기록은 마지막으로 치지 않는다', () => {
    const records = [cart(1, '2026-06-09', '아라간 3차'), rec(1, '2026-07-01', ['A15'], '아라간 1차'), rec(2, '2026-06-08', ['A15'], '아라간 3차')]
    expect(recallCompute(records, RECALL_DEFAULTS).map((i) => i.chart)).toEqual([CHART(1)])
  })

  it('AC-603.3 근거: 조건이 든 첫 줄, 조건 없는 규칙은 전체 글, 줄에 없으면 전체 글', () => {
    expect(recallCompute([cart(1, '2026-06-03', '3차 / 아라간 3차 끝')], RECALL_DEFAULTS)[0].evidence).toBe('3차')
    expect(recallCompute([rec(1, '2026-07-01', ['A32'], '무릎 / 비타민D')], RECALL_DEFAULTS)[0].evidence).toBe('무릎 / 비타민D')
    const rule: RecallRule = { id: 'knee', enabled: true, label: '무릎', codes: ['A49'], round: '무릎 / 아라간', months: 1 }
    expect(recallCompute([cart(1, '2026-01-31', '왼쪽 무릎 / 아라간 3차')], [rule])[0]).toMatchObject({ evidence: '왼쪽 무릎 / 아라간 3차', due: '2026-02-28' })
  })

  it('AC-603.3 정렬: 예정일 → 종류 → 차트번호 숫자 순서', () => {
    const records = [vitd(4, '2026-09-20'), { ...vitd(30, '2026-09-20'), chart: `0${CHART(30)}` }, vitd(31, '2026-09-20'), cart(19, '2026-06-20', '아라간 3차')]
    expect(recallCompute(records, RECALL_DEFAULTS).map((i) => i.chart)).toEqual([CHART(4), `0${CHART(30)}`, CHART(31), CHART(19)])
  })

  it('AC-603.3 꺼 둔 규칙은 계산하지 않는다', () => {
    const off = RECALL_DEFAULTS.map((r) => (r.id === 'cartilage' ? { ...r, enabled: false } : r))
    const records = [cart(1, '2026-04-15', '아라간 3차'), vitd(2, '2026-07-10')]
    expect(recallCompute(records, off).map((i) => i.ruleId)).toEqual(['vitamin-d'])
    expect(recallCompute(records, [])).toEqual([])
  })

  describe('이상한 날짜도 명단 전체를 멈추지 않는다(골든 knownDiffs)', () => {
    it.each(['9999-12-31', '9999-07-01'])('AC-603.3 예정일의 해가 네 자리를 넘으면 그 줄만 뺀다: %s', (date) => {
      const items = recallCompute([cart(1, date, '아라간 3차'), cart(2, '2026-04-15', '아라간 3차')], RECALL_DEFAULTS)
      expect(items.map((i) => i.chart)).toEqual([CHART(2)])
    })

    it('AC-603.3 네 자리에 들어오면 그대로 낸다(9999-12-30)', () => {
      expect(recallCompute([cart(1, '9999-06-30', '아라간 3차')], RECALL_DEFAULTS).map((i) => i.due)).toEqual(['9999-12-30'])
      expect(recallCompute([vitd(1, '9999-09-30')], RECALL_DEFAULTS).map((i) => i.due)).toEqual(['9999-12-30'])
    })

    it('AC-603.3 먼 날 앞의 3차로 돌아가지 않는다(마지막만 본다)', () => {
      expect(recallCompute([cart(1, '2026-04-15', '아라간 3차'), cart(1, '9999-12-31', '아라간 3차')], RECALL_DEFAULTS)).toEqual([])
    })

    it.each(['글자', '2026-02-30', '0999-12-31', '10000-01-01', ''])('AC-603.3 못 읽는 날짜 기록은 그 줄만 뺀다: %s', (date) => {
      const items = recallCompute([cart(1, date, '아라간 3차'), cart(2, '2026-04-15', '아라간 3차')], RECALL_DEFAULTS)
      expect(items.map((i) => i.chart)).toEqual([CHART(2)])
    })

    it('AC-603.3 못 읽는 날짜 기록이 마지막인데 조건에 안 맞으면 원본처럼 그 사람은 빠질 뿐이다', () => {
      const items = recallCompute([cart(1, '2026-04-15', '아라간 3차'), cart(1, '글자', '아라간 1차'), cart(2, '2026-04-16', '아라간 3차')], RECALL_DEFAULTS)
      expect(items.map((i) => i.chart)).toEqual([CHART(2)])
    })
  })
})

describe('AC-603.3 recallSelect', () => {
  const item = (chart: string, due: string) => ({ ruleId: 'vitamin-d', label: '비타민D', months: 3, chart, name: NAME(1), phone: '', last: '2026-01-01', due, evidence: '' })
  const items = [item('a', '2026-10-14'), item('b', '2026-10-15'), item('c', '2026-10-16'), item('d', '2026-11-01'), item('e', '2026-11-30'), item('f', '2026-12-01')]
  const charts = (from: string | null, to: string | null, overdue: boolean, today = '2026-10-15') => recallSelect(items, from, to, overdue, today).map((i) => i.chart).join('')

  it('AC-603.3 네 조합', () => {
    expect(charts('2026-10-15', '2026-11-30', false)).toBe('bcde')
    expect(charts('2026-10-15', '2026-11-30', true)).toBe('abcde')
    expect(charts(null, null, false)).toBe('abcdef')
    expect(charts(null, null, true)).toBe('abcdef')
  })

  it('AC-603.3 경계: 시작·끝 날은 든다', () => {
    expect(charts('2026-11-01', '2026-11-01', false)).toBe('d')
    expect(charts('2026-11-02', '2026-11-29', false)).toBe('')
  })

  it('AC-603.3 지난 예정: 오늘 앞만이고 오늘은 아니다. 시작이 오늘 뒤여도 오늘~시작 사이는 빠진다', () => {
    expect(charts('2026-11-01', '2026-11-30', true)).toBe('ade')
    expect(charts('2026-11-01', '2026-11-30', true, '2026-10-16')).toBe('abde')
  })

  it('AC-603.3 끝은 지난 예정에도 걸린다', () => {
    expect(charts('2026-10-15', '2026-10-13', true)).toBe('')
    expect(charts('2026-10-15', '2026-10-14', true)).toBe('a')
  })

  it('AC-603.3 한쪽만 준 기간', () => {
    expect(charts(null, '2026-10-15', false)).toBe('ab')
    expect(charts('2026-11-01', null, false)).toBe('def')
    expect(charts('2026-11-01', null, true)).toBe('adef')
  })

  it('AC-603.3 받은 순서를 지키고 목록을 고치지 않는다', () => {
    const before = [...items]
    recallSelect(items, null, null, false, '2026-10-15')
    expect(items).toEqual(before)
  })
})

describe('AC-603.3 recallStatus', () => {
  const at = (due: string) => ({ ruleId: 'x', label: 'x', months: 3, chart: 'a', name: NAME(1), phone: '', last: '2026-01-01', due, evidence: '' })

  it.each([
    ['2026-10-15', '2026-10-15', '오늘'],
    ['2026-10-14', '2026-10-15', '지남 1일'],
    ['2026-10-16', '2026-10-15', '1일 남음'],
    ['2026-07-31', '2026-10-15', '지남 76일'],
    ['2027-02-28', '2026-10-15', '136일 남음'],
    ['2028-03-01', '2028-02-28', '2일 남음'],
  ])('AC-603.3 예정일 %s · 오늘 %s → %s', (due, today, expected) => {
    expect(recallStatus(at(due), today)).toBe(expected)
  })
})

describe('AC-603.4 recallCoverage', () => {
  const coverage = (from: string | null, today = '2026-10-16', rules: readonly RecallRule[] = RECALL_DEFAULTS, records: RecallRecord[] = []) =>
    recallCoverage({ from, readThrough: null, records }, rules, today)
  const CARTILAGE_SHORT = { label: '연골주사', months: 6 }
  const VITAMIN_SHORT = { label: '비타민D', months: 3 }

  it('AC-603.4 처음(기록 없음): 켠 규칙 모두 짧다', () => {
    expect(coverage(null)).toEqual({ records: 0, from: null, short: [CARTILAGE_SHORT, VITAMIN_SHORT] })
  })

  it.each([
    ['딱 6개월 전이면 짧지 않다', '2026-04-16', []],
    ['6개월보다 하루 뒤면 6개월 규칙이 짧다', '2026-04-17', [CARTILAGE_SHORT]],
    ['딱 3개월 전이면 3개월 규칙은 짧지 않다', '2026-07-16', [CARTILAGE_SHORT]],
    ['3개월보다 하루 뒤면 둘 다 짧다', '2026-07-17', [CARTILAGE_SHORT, VITAMIN_SHORT]],
    ['오래됐으면 없다', '2023-10-16', []],
  ])('AC-603.4 경계: %s', (_name, from, short) => {
    expect(coverage(from).short).toEqual(short)
  })

  it.each([
    ['2026-02-28', []],
    ['2026-03-01', [CARTILAGE_SHORT]],
    ['2026-05-31', [CARTILAGE_SHORT]],
    ['2026-06-01', [CARTILAGE_SHORT, VITAMIN_SHORT]],
  ])('AC-603.4 말일 맞춤: 오늘 8/31, 시작 %s', (from, short) => {
    expect(coverage(from, '2026-08-31').short).toEqual(short)
  })

  it('AC-603.4 꺼 둔 규칙은 보지 않고, 규칙 순서를 지킨다', () => {
    const off = RECALL_DEFAULTS.map((r) => (r.id === 'cartilage' ? { ...r, enabled: false } : r))
    expect(coverage(null, '2026-10-16', off).short).toEqual([VITAMIN_SHORT])
    expect(coverage('2026-10-16', '2026-10-16', [...RECALL_DEFAULTS].reverse()).short).toEqual([VITAMIN_SHORT, CARTILAGE_SHORT])
  })

  it('AC-603.4 건수와 시작 날짜를 그대로 돌려주고, trimmed는 모른다', () => {
    const result = coverage('2026-05-01', '2026-10-16', RECALL_DEFAULTS, [vitd(1, '2026-06-01'), vitd(2, '2026-06-02')])
    expect(result).toEqual({ records: 2, from: '2026-05-01', short: [CARTILAGE_SHORT] })
    expect(result).not.toHaveProperty('trimmed')
  })

  it('AC-603.4 시작 날짜를 못 읽으면 기록이 없는 것처럼 판정한다(멈추지 않는다)', () => {
    expect(coverage('2026-02-30')).toEqual({ records: 0, from: '2026-02-30', short: [CARTILAGE_SHORT, VITAMIN_SHORT] })
  })
})

describe('AC-603.5 recallCopyLines·recallPhones', () => {
  const noBook = () => ''
  const items = (records: RecallRecord[]) => recallCompute(records, RECALL_DEFAULTS)

  it('AC-603.5 명단 복사: 이름·전화·이름·종류 4칸, 줄바꿈', () => {
    const list = items([vitd(1, '2026-07-10', PHONE(1)), vitd(2, '2026-07-11')])
    expect(recallCopyLines(list, noBook)).toBe(`${NAME(1)}\t${PHONE(1)}\t${NAME(1)}\t비타민D\n${NAME(2)}\t\t${NAME(2)}\t비타민D`)
    expect(recallCopyLines([], noBook)).toBe('')
  })

  it('AC-603.5 지금 읽은 전화가 있으면 그것, 없으면 기록할 때 전화', () => {
    const list = items([vitd(1, '2026-07-10', PHONE(1)), vitd(2, '2026-07-11', PHONE(2))])
    const book = (chart: string) => (chart === CHART(1) ? PHONE(901) : '')
    expect(recallCopyLines(list, book).split('\n').map((line) => line.split('\t')[1])).toEqual([PHONE(901), PHONE(2)])
    expect(recallPhones(list, book).text).toBe('01000000901\n01000000002')
  })

  it('AC-603.5 번호 복사: 숫자와 +만, 같은 번호는 한 번, 칸에 여럿이면 첫 번호', () => {
    const list = items([
      vitd(1, '2026-07-10', PHONE(1)),
      vitd(2, '2026-07-11', PHONE(1)),
      vitd(3, '2026-07-12', '01000000001'),
      vitd(4, '2026-07-13', `${PHONE(4)} / ${PHONE(40)}`),
      vitd(5, '2026-07-14', `${PHONE(5)},${PHONE(50)}`),
      vitd(6, '2026-07-15', `${PHONE(6)};${PHONE(60)}`),
      vitd(7, '2026-07-16', `${PHONE(7)} · ${PHONE(70)}`),
      vitd(8, '2026-07-17', `${PHONE(8)}  ${PHONE(80)}`),
      vitd(9, '2026-07-18', '+82-10-0000-0009'),
      vitd(10, '2026-07-19', '010 0000 0010'), // 빈칸 하나는 번호 안이다(둘부터 구분)
    ])
    expect(recallPhones(list, noBook)).toEqual({
      text: ['01000000001', '01000000004', '01000000005', '01000000006', '01000000007', '01000000008', '+821000000009', '01000000010'].join('\n'),
      count: 8,
      missing: 0,
    })
  })

  it('AC-603.5 번호 없는 사람 수: 빈칸·숫자 없는 글·구분 글자만 있는 칸', () => {
    const list = items([vitd(1, '2026-07-10', PHONE(1)), vitd(2, '2026-07-11'), vitd(3, '2026-07-12', '번호 없음'), vitd(4, '2026-07-13', ' / ')])
    expect(recallPhones(list, noBook)).toEqual({ text: '01000000001', count: 1, missing: 3 })
  })

  it('AC-603.5 두 규칙에 든 사람: 줄은 둘, 번호는 하나. 번호가 없으면 줄마다 센다', () => {
    const list = items([rec(1, '2026-07-24', ['A32', 'A49'], '아라간 3차 · 비타민D', PHONE(1)), rec(2, '2026-07-25', ['A32', 'A49'], '아라간 3차 · 비타민D')])
    expect(list).toHaveLength(4)
    expect(recallCopyLines(list, noBook).split('\n')).toHaveLength(4)
    expect(recallPhones(list, noBook)).toEqual({ text: '01000000001', count: 1, missing: 2 })
  })

  it('AC-603.5 사람이 없거나 번호가 하나도 없어도 같은 모양으로 돌려준다(안내는 화면이)', () => {
    expect(recallPhones([], noBook)).toEqual({ text: '', count: 0, missing: 0 })
    expect(recallPhones(items([vitd(1, '2026-07-10'), vitd(2, '2026-07-11', '번호 없음')]), noBook)).toEqual({ text: '', count: 0, missing: 2 })
  })
})
