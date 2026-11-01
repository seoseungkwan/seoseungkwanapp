import { describe, expect, it } from 'vitest'
import { validateMonthPayload } from '@/lib/payload/validate'
import type { ReportInput, ReportMetric } from '@/types/aiReport'
import type { MonthPayload } from '@/types/payload'
import { basisLine } from './basis'
import { buildReportInput } from './input'
import { CARD_TEXT_MAX, MAX_CARDS, MIN_CARDS, SUMMARY_MAX, hasForbiddenNumber, parseAiReport } from './output'

// 시험 자료는 여기서 손으로 만든 가짜 숫자다(처방코드는 FAKE-…). AI 답도 손으로 쓴 JSON 글자다(진짜 Claude는 부르지 않는다)

function month(fields: Partial<MonthPayload> & Pick<MonthPayload, 'month'>): MonthPayload {
  const payload: MonthPayload = {
    schemaVersion: 2,
    quality: 'valid',
    partial: false,
    totals: { patients: 0, newPatients: 0, returning: 0, unknown: 0 },
    rx: [],
    groups: [],
    revisit: { cohort: 0, within7: 0, within14: 0 },
    regions: [],
    ...fields,
  }
  // buildReportInput은 검사를 통과한 자료를 받는다
  const checked = validateMonthPayload(payload)
  if (checked === null) throw new Error(`시험 자료가 검사를 통과하지 못함: ${payload.month}`)
  return checked
}

const INPUT: ReportInput = buildReportInput({
  selected: month({
    month: '2026-10',
    totals: { patients: 120, newPatients: 30, returning: 85, unknown: 5 },
    rx: [{ code: 'FAKE-A01', name: '가짜 처방 가', type: '가짜', patients: 20, newPatients: 5, returning: 15, followup: [20, 0, 0, 0] }],
    groups: [{ id: 'g-alpha', patients: 40, newPatients: 8, returning: 30, followup: [40, 0, 0, 0] }],
    revisit: { cohort: 20, within7: 9, within14: 12 },
    regions: [{ name: '가동', patients: 30 }],
  }),
  prev: month({
    month: '2026-09',
    totals: { patients: 110, newPatients: 25, returning: 80, unknown: 5 },
    revisit: { cohort: 20, within7: 8, within14: 11 },
  }),
  lastYear: null,
  groupNames: { 'g-alpha': '도수치료' },
})

type Card = { tag: string; text: string; metric: string }

const card = (metric: string, text = '신환이 크게 늘었습니다.', tag = 'up'): Card => ({ tag, text, metric })
const answer = (summary: unknown, cards: unknown): string => JSON.stringify({ summary, cards })

const SUMMARY = '10월은 지난달보다 신환이 크게 늘었고 재진은 비슷했습니다.'
const GOOD_CARDS: Card[] = [
  card('total.newPatients', '신환이 지난달보다 크게 늘었습니다.', 'up'),
  card('revisit.within7', '7일 재방문율이 조금 줄었습니다.', 'down'),
  card('group:g-alpha.patients', '도수치료 환자를 살펴볼 만합니다.', 'watch'),
  card('rx:FAKE-A01', '처방이 늘어난 것은 계절 영향으로 보입니다.', 'guess'),
]

const metricOf = (id: string): ReportMetric => {
  const found = INPUT.metrics.find((m) => m.id === id)
  if (found === undefined) throw new Error(`지표가 없음: ${id}`)
  return found
}

const withBasis = (c: Card) => ({ tag: c.tag, text: c.text, metric: c.metric, basis: basisLine(metricOf(c.metric), INPUT) })

// 숫자 없는 서로 다른 문장(카드 차례를 보려고)
const ORDINALS = ['첫째', '둘째', '셋째', '넷째', '다섯째', '여섯째', '일곱째', '여덟째', '아홉째', '열째']
const numbered = (metric = 'total.patients') => ORDINALS.map((word) => card(metric, `${word} 카드입니다.`, 'watch'))

describe('parseAiReport — 정상 답 (AC-507.1)', () => {
  it('AC-507.1 시험 입력에 쓸 지표 ID가 모두 있다', () => {
    const ids = INPUT.metrics.map((m) => m.id)
    for (const c of GOOD_CARDS) expect(ids).toContain(c.metric)
    expect(ids).toContain('total.patients')
    expect(ids).toContain('region:가동')
  })

  it('AC-507.1 요약과 카드 3~8개면 카드마다 basisLine 근거 줄을 붙인 리포트를 돌려준다', () => {
    expect(parseAiReport(answer(SUMMARY, GOOD_CARDS), INPUT)).toEqual({ summary: SUMMARY, cards: GOOD_CARDS.map(withBasis) })
  })

  it('AC-507.1 근거 줄은 basisLine 결과와 같다(예: 신환 "근거 · 신환 9월 25명 → 10월 30명 · 작년 10월 자료 없음")', () => {
    const report = parseAiReport(answer(SUMMARY, GOOD_CARDS), INPUT)
    expect(report?.cards[0].basis).toBe('근거 · 신환 9월 25명 → 10월 30명 · 작년 10월 자료 없음')
    report?.cards.forEach((c, i) => expect(c.basis).toBe(basisLine(metricOf(GOOD_CARDS[i].metric), INPUT)))
  })

  it('AC-507.1 꼬리표 up·down·watch·guess 넷 다 받는다', () => {
    const tags = parseAiReport(answer(SUMMARY, GOOD_CARDS), INPUT)?.cards.map((c) => c.tag)
    expect(tags).toEqual(['up', 'down', 'watch', 'guess'])
  })

  it('AC-507.1 카드 3개(MIN_CARDS)·8개(MAX_CARDS)는 그대로 받는다', () => {
    expect(MIN_CARDS).toBe(3)
    expect(MAX_CARDS).toBe(8)
    expect(parseAiReport(answer(SUMMARY, GOOD_CARDS.slice(0, 3)), INPUT)?.cards).toHaveLength(3)
    expect(parseAiReport(answer(SUMMARY, numbered().slice(0, 8)), INPUT)?.cards).toHaveLength(8)
  })

  it('AC-507.1 요약 1자·200자(SUMMARY_MAX), 문장 1자·120자(CARD_TEXT_MAX)는 받는다', () => {
    expect(SUMMARY_MAX).toBe(200)
    expect(CARD_TEXT_MAX).toBe(120)
    const long = '가'.repeat(CARD_TEXT_MAX)
    const cards = [card('total.patients', long), card('total.returning', '나'), card('total.newPatients')]
    expect(parseAiReport(answer('다', cards), INPUT)?.summary).toBe('다')
    const report = parseAiReport(answer('라'.repeat(SUMMARY_MAX), cards), INPUT)
    expect(report?.summary).toHaveLength(SUMMARY_MAX)
    expect(report?.cards.map((c) => c.text)).toEqual([long, '나', '신환이 크게 늘었습니다.'])
  })

  it('AC-507.1 돌려주는 요약·문장은 앞뒤 빈칸을 뺀 것이고, 길이도 뺀 뒤로 잰다', () => {
    const padded = `  ${'가'.repeat(CARD_TEXT_MAX)}\n `
    const cards = [card('total.patients', padded), card('total.returning', '\t재진이 비슷했습니다. '), card('total.newPatients')]
    const report = parseAiReport(answer(`\n ${'나'.repeat(SUMMARY_MAX)}  `, cards), INPUT)
    expect(report?.summary).toBe('나'.repeat(SUMMARY_MAX))
    expect(report?.cards.map((c) => c.text)).toEqual(['가'.repeat(CARD_TEXT_MAX), '재진이 비슷했습니다.', '신환이 크게 늘었습니다.'])
  })

  it('AC-507.1 돌려주는 객체는 정해진 칸만 있는 새 객체다(최상위 summary·cards, 카드 tag·text·metric·basis)', () => {
    const report = parseAiReport(answer(SUMMARY, GOOD_CARDS), INPUT)
    expect(report).not.toBeNull()
    expect(Object.keys(report ?? {})).toEqual(['summary', 'cards'])
    for (const c of report?.cards ?? []) expect(Object.keys(c)).toEqual(['tag', 'text', 'metric', 'basis'])
  })

  it('AC-507.1 지표 ID는 동네 이름이 든 것(region:가동)도 그대로 맞춘다', () => {
    const cards = [card('region:가동', '가동 환자가 조금 늘었습니다.'), ...GOOD_CARDS.slice(0, 2)]
    const report = parseAiReport(answer(SUMMARY, cards), INPUT)
    expect(report?.cards[0]).toEqual(withBasis(cards[0]))
  })
})

describe('parseAiReport — 없는 지표 ID (AC-507.2)', () => {
  it('AC-507.2 입력에 없는 지표 ID를 쓴 카드 하나는 그 카드만 빠진다(나머지 차례는 그대로)', () => {
    const cards = [GOOD_CARDS[0], card('total.unknownThing', '없는 지표입니다.'), ...GOOD_CARDS.slice(1)]
    expect(parseAiReport(answer(SUMMARY, cards), INPUT)?.cards).toEqual(GOOD_CARDS.map(withBasis))
  })

  it('AC-507.2 글자가 조금이라도 다르면(앞뒤 빈칸·대소문자·빈 글자) 없는 지표 ID로 본다', () => {
    const cards = [card(' total.newPatients'), card('TOTAL.newPatients'), card(''), card('group:g-beta.patients'), ...GOOD_CARDS.slice(0, 3)]
    expect(parseAiReport(answer(SUMMARY, cards), INPUT)?.cards).toEqual(GOOD_CARDS.slice(0, 3).map(withBasis))
  })

  it('AC-507.2 객체 기본 이름(__proto__·toString·constructor)도 없는 지표 ID다', () => {
    const cards = [card('__proto__'), card('toString'), card('constructor'), ...GOOD_CARDS.slice(0, 3)]
    expect(parseAiReport(answer(SUMMARY, cards), INPUT)?.cards).toEqual(GOOD_CARDS.slice(0, 3).map(withBasis))
  })
})

describe('hasForbiddenNumber — 숫자 규칙 (AC-507.3)', () => {
  it.each([
    '10월 신환이 크게 늘었습니다',
    '7일 재방문율이 조금 줄었습니다',
    '2025년 10월보다 환자가 많습니다',
    '14일 재방문율은 비슷합니다',
    '1월과 12월을 견주면 비슷합니다',
    '7일·14일 재방문율이 모두 조금 올랐습니다',
    '숫자가 없는 문장입니다',
    '',
  ])('AC-507.3 허용 낱말만 있거나 숫자가 없으면 어기지 않는다: %s', (text) => {
    expect(hasForbiddenNumber(text)).toBe(false)
  })

  it.each([
    '신환이 524명으로 늘었습니다',
    '17일 재방문율이 줄었습니다',
    '21일 재방문율',
    '147일',
    '123월',
    '12025년',
    '재방문율이 41.2%입니다',
    '두 배(2배) 늘었습니다',
    '10월 신환 30명',
    '５２４명',
    // 허용 낱말을 지운 자리에서 앞뒤 숫자가 붙어 새 허용 낱말이 되지 않는다
    '12025년2월',
    '147일일',
    '714일일',
  ])('AC-507.3 허용 낱말을 빼고도 숫자가 남으면 어긴다: %s', (text) => {
    expect(hasForbiddenNumber(text)).toBe(true)
  })
})

describe('parseAiReport — 숫자 규칙을 어긴 카드 (AC-507.3)', () => {
  it('AC-507.3 "신환이 524명으로"는 빠지고 "10월"·"7일"·"2025년 10월보다"는 남는다', () => {
    const kept = [
      card('total.newPatients', '10월 신환이 크게 늘었습니다.'),
      card('revisit.within7', '7일 재방문율이 조금 줄었습니다.', 'down'),
      card('total.patients', '2025년 10월보다 환자가 많습니다.'),
    ]
    const cards = [card('total.newPatients', '신환이 524명으로 크게 늘었습니다.'), ...kept]
    expect(parseAiReport(answer(SUMMARY, cards), INPUT)?.cards).toEqual(kept.map(withBasis))
  })

  it('AC-507.3 "17일"을 쓴 카드는 빠진다(고쳐 쓰지 않는다)', () => {
    const cards = [card('revisit.within14', '17일 재방문율이 줄었습니다.', 'down'), ...GOOD_CARDS]
    const report = parseAiReport(answer(SUMMARY, cards), INPUT)
    expect(report?.cards).toEqual(GOOD_CARDS.map(withBasis))
    expect(report?.cards.some((c) => c.text.includes('재방문율이 줄었습니다'))).toBe(false)
  })
})

describe('parseAiReport — null이 되는 답 (AC-507.4)', () => {
  it('AC-507.4 요약에 허용 낱말 밖 숫자가 있으면 null', () => {
    expect(parseAiReport(answer('10월 신환이 30명으로 늘었습니다.', GOOD_CARDS), INPUT)).toBeNull()
    expect(parseAiReport(answer('17일 재방문율이 줄었습니다.', GOOD_CARDS), INPUT)).toBeNull()
  })

  it('AC-507.4 걸러서 남은 카드가 3개 미만이면 null', () => {
    const twoLeft = [GOOD_CARDS[0], GOOD_CARDS[1], card('total.unknownThing')]
    expect(parseAiReport(answer(SUMMARY, twoLeft), INPUT)).toBeNull()
    const numberCard = [GOOD_CARDS[0], GOOD_CARDS[1], card('total.patients', '환자가 120명입니다.')]
    expect(parseAiReport(answer(SUMMARY, numberCard), INPUT)).toBeNull()
  })

  it('AC-507.4 받은 카드가 3개 미만이거나 없으면 null', () => {
    expect(parseAiReport(answer(SUMMARY, GOOD_CARDS.slice(0, 2)), INPUT)).toBeNull()
    expect(parseAiReport(answer(SUMMARY, []), INPUT)).toBeNull()
  })

  it('AC-507.4 빠진 칸(summary·cards·tag·text·metric)이 있으면 null', () => {
    expect(parseAiReport(JSON.stringify({ cards: GOOD_CARDS }), INPUT)).toBeNull()
    expect(parseAiReport(JSON.stringify({ summary: SUMMARY }), INPUT)).toBeNull()
    for (const key of ['tag', 'text', 'metric'] as const) {
      const broken: Record<string, string> = { ...GOOD_CARDS[0] }
      delete broken[key]
      expect(parseAiReport(answer(SUMMARY, [broken, ...GOOD_CARDS.slice(1)]), INPUT)).toBeNull()
    }
  })

  it('AC-507.4 남는 칸이 있으면 null(최상위에도, 카드에도 — AI가 준 basis도 받지 않는다)', () => {
    expect(parseAiReport(JSON.stringify({ summary: SUMMARY, cards: GOOD_CARDS, title: '보고' }), INPUT)).toBeNull()
    const withExtra = { ...GOOD_CARDS[0], basis: '근거 · 신환 9월 1명 → 10월 999명' }
    expect(parseAiReport(answer(SUMMARY, [withExtra, ...GOOD_CARDS.slice(1)]), INPUT)).toBeNull()
    const withNote = { ...GOOD_CARDS[0], note: '' }
    expect(parseAiReport(answer(SUMMARY, [...GOOD_CARDS.slice(1), withNote]), INPUT)).toBeNull()
  })

  it.each(['UP', 'note', '', ' up', 'increase'])('AC-507.4 꼬리표가 넷 밖의 값이면 null: "%s"', (tag) => {
    expect(parseAiReport(answer(SUMMARY, [card('total.patients', '환자가 늘었습니다.', tag), ...GOOD_CARDS]), INPUT)).toBeNull()
  })

  it('AC-507.4 201자 요약·121자 문장이면 null(앞뒤 빈칸을 뺀 길이)', () => {
    expect(parseAiReport(answer('가'.repeat(SUMMARY_MAX + 1), GOOD_CARDS), INPUT)).toBeNull()
    const longCard = card('total.patients', ` ${'나'.repeat(CARD_TEXT_MAX + 1)} `)
    expect(parseAiReport(answer(SUMMARY, [...GOOD_CARDS, longCard]), INPUT)).toBeNull()
  })

  it('AC-507.4 빈 요약·빈 문장(빈칸만 있는 것 포함)이면 null', () => {
    expect(parseAiReport(answer('', GOOD_CARDS), INPUT)).toBeNull()
    expect(parseAiReport(answer('  \n ', GOOD_CARDS), INPUT)).toBeNull()
    expect(parseAiReport(answer(SUMMARY, [...GOOD_CARDS, card('total.patients', '')]), INPUT)).toBeNull()
    expect(parseAiReport(answer(SUMMARY, [...GOOD_CARDS, card('total.patients', '   ')]), INPUT)).toBeNull()
  })

  it('AC-507.4 칸 값이 글자가 아니거나 cards가 배열이 아니면 null', () => {
    expect(parseAiReport(answer(null, GOOD_CARDS), INPUT)).toBeNull()
    expect(parseAiReport(answer(['요약'], GOOD_CARDS), INPUT)).toBeNull()
    expect(parseAiReport(answer(SUMMARY, { 0: GOOD_CARDS[0] }), INPUT)).toBeNull()
    expect(parseAiReport(answer(SUMMARY, 'cards'), INPUT)).toBeNull()
    expect(parseAiReport(answer(SUMMARY, [...GOOD_CARDS, null]), INPUT)).toBeNull()
    expect(parseAiReport(answer(SUMMARY, [...GOOD_CARDS, ['up', '문장', 'total.patients']]), INPUT)).toBeNull()
    expect(parseAiReport(answer(SUMMARY, [...GOOD_CARDS, { tag: 'up', text: 7, metric: 'total.patients' }]), INPUT)).toBeNull()
    expect(parseAiReport(answer(SUMMARY, [...GOOD_CARDS, { tag: 'up', text: '문장입니다.', metric: 1 }]), INPUT)).toBeNull()
    expect(parseAiReport(answer(SUMMARY, [...GOOD_CARDS, { tag: null, text: '문장입니다.', metric: 'total.patients' }]), INPUT)).toBeNull()
  })

  it.each([
    ['빈 글자', ''],
    ['JSON이 아닌 글', '리포트를 만들 수 없습니다.'],
    ['끊긴 JSON', answer(SUMMARY, GOOD_CARDS).slice(0, -2)],
    ['코드 울타리로 감싼 JSON', '```json\n' + answer(SUMMARY, GOOD_CARDS) + '\n```'],
    ['배열', JSON.stringify([SUMMARY, GOOD_CARDS])],
    ['null', 'null'],
    ['글자', JSON.stringify(SUMMARY)],
    ['숫자', '42'],
  ])('AC-507.4 JSON 객체가 아니면 null: %s', (_name, text) => {
    expect(parseAiReport(text, INPUT)).toBeNull()
  })
})

describe('parseAiReport — 같은 지표·카드 수 (AC-507.5)', () => {
  it('AC-507.5 같은 지표 ID를 쓴 카드 셋은 셋 다 남고 근거 줄도 같다', () => {
    const cards = [
      card('total.newPatients', '신환이 크게 늘었습니다.', 'up'),
      card('total.newPatients', '신환 흐름을 계속 살펴볼 만합니다.', 'watch'),
      card('total.newPatients', '신환이 는 것은 소개 환자 때문으로 보입니다.', 'guess'),
    ]
    const report = parseAiReport(answer(SUMMARY, cards), INPUT)
    expect(report?.cards).toEqual(cards.map(withBasis))
    expect(new Set(report?.cards.map((c) => c.basis)).size).toBe(1)
  })

  it('AC-507.5 카드 10개면 앞 8개만 남는다', () => {
    const report = parseAiReport(answer(SUMMARY, numbered()), INPUT)
    expect(report?.cards.map((c) => c.text)).toEqual(ORDINALS.slice(0, MAX_CARDS).map((word) => `${word} 카드입니다.`))
  })

  it('AC-507.5 8개는 거른 뒤에 센다(빠진 카드 자리는 뒤 카드가 채운다)', () => {
    const cards = numbered()
    cards[0] = card('total.unknownThing', '첫째 카드입니다.')
    cards[3] = card('total.patients', '넷째 카드는 환자가 120명입니다.')
    const report = parseAiReport(answer(SUMMARY, cards), INPUT)
    const expected = ORDINALS.filter((_, i) => i !== 0 && i !== 3).map((word) => `${word} 카드입니다.`)
    expect(report?.cards.map((c) => c.text)).toEqual(expected)
    expect(report?.cards).toHaveLength(MAX_CARDS)
  })
})

// 글자와 숫자가 든 이름을 가진 가짜 자료(AC-507.6·AC-507.7). 숫자·기호뿐인 동네 '1'·처방 '2-3'도 함께 둔다
const fakeRx = (code: string, name: string): MonthPayload['rx'][number] => ({ code, name, type: '가짜', patients: 20, newPatients: 5, returning: 15, followup: [20, 0, 0, 0] })
const fakeGroup = (id: string): MonthPayload['groups'][number] => ({ id, patients: 40, newPatients: 8, returning: 30, followup: [40, 0, 0, 0] })

const NAMED: ReportInput = buildReportInput({
  selected: month({
    month: '2026-10',
    totals: { patients: 120, newPatients: 30, returning: 85, unknown: 5 },
    rx: [fakeRx('FAKE-B01', 'MRI 3T'), fakeRx('FAKE-B02', '2-3'), fakeRx('FAKE-B03', "X선 '2방향'"), fakeRx('FAKE-B04', 'C.T(2)')],
    groups: [fakeGroup('g-dosu2'), fakeGroup('g-pt1'), fakeGroup('g-pt12')],
    regions: [{ name: '역삼1동', patients: 30 }, { name: '1', patients: 10 }],
  }),
  prev: null,
  lastYear: null,
  groupNames: { 'g-dosu2': '도수치료2', 'g-pt1': '물리치료1', 'g-pt12': '물리치료12' },
})

const namedMetric = (id: string): ReportMetric => {
  const found = NAMED.metrics.find((m) => m.id === id)
  if (found === undefined) throw new Error(`지표가 없음: ${id}`)
  return found
}

const namedBasis = (c: Card) => ({ tag: c.tag, text: c.text, metric: c.metric, basis: basisLine(namedMetric(c.metric), NAMED) })

// 숫자 규칙에 안 걸리는 평범한 카드 셋: 시험할 카드가 빠져도 카드 수가 모자라 null이 되지 않게 함께 보낸다
const PLAIN_CARDS: Card[] = [
  card('total.newPatients', '신환이 지난달보다 크게 늘었습니다.'),
  card('total.returning', '재진은 비슷했습니다.', 'watch'),
  card('total.patients', '전체 환자가 조금 늘었습니다.'),
]

// 손으로 쓴 지표 하나(label 모양을 시험하려고)
const handMetric = (id: string, label: string): ReportMetric => ({ id, label, kind: 'count', values: { selected: 1, prev: null, lastYear: null } })

describe('parseAiReport — 이름 안의 숫자 (AC-507.6)', () => {
  it('AC-507.6 시험 입력의 지표 이름은 정해진 모양이다', () => {
    expect(namedMetric('group:g-dosu2.patients').label).toBe("처방 그룹 '도수치료2' 환자")
    expect(namedMetric('group:g-dosu2.newPatients').label).toBe("처방 그룹 '도수치료2' 신환")
    expect(namedMetric('group:g-dosu2.returning').label).toBe("처방 그룹 '도수치료2' 재진")
    expect(namedMetric('rx:FAKE-B01').label).toBe("처방 'MRI 3T' 환자")
    expect(namedMetric('region:역삼1동').label).toBe("동네 '역삼1동' 환자")
  })

  it('AC-507.6 카드 문장이 그룹·처방·동네 이름을 글자 그대로 쓰면 이름 안의 숫자는 걸리지 않는다', () => {
    const cards = [
      card('group:g-dosu2.patients', '도수치료2 환자가 크게 늘었습니다.'),
      card('rx:FAKE-B01', 'MRI 3T 처방이 조금 늘었습니다.'),
      card('region:역삼1동', '역삼1동 환자가 조금 줄었습니다.', 'down'),
    ]
    expect(parseAiReport(answer(SUMMARY, cards), NAMED)?.cards).toEqual(cards.map(namedBasis))
  })

  it('AC-507.6 요약도 이름을 글자 그대로 쓰면 통과한다', () => {
    const summary = '10월은 도수치료2와 역삼1동 환자가 늘었고 MRI 3T 처방은 비슷했습니다.'
    expect(parseAiReport(answer(summary, PLAIN_CARDS), NAMED)?.summary).toBe(summary)
  })

  it('AC-507.6 한 이름이 다른 이름을 품어도(물리치료1·물리치료12) 긴 이름부터 지워 둘 다 걸리지 않는다', () => {
    const cards = [
      card('group:g-pt12.patients', '물리치료12 환자를 살펴볼 만합니다.', 'watch'),
      card('group:g-pt1.newPatients', '물리치료1 신환이 줄었습니다.', 'down'),
      card('group:g-pt1.returning', '물리치료1과 물리치료12를 견주면 재진은 비슷합니다.', 'watch'),
    ]
    expect(parseAiReport(answer(SUMMARY, cards), NAMED)?.cards).toEqual(cards.map(namedBasis))
    const summary = '물리치료12가 물리치료1보다 많습니다.'
    expect(parseAiReport(answer(summary, PLAIN_CARDS), NAMED)?.summary).toBe(summary)
  })

  it('AC-507.6 이름 안의 따옴표·정규식 글자도 글자 그대로 찾는다', () => {
    const cards = [
      card('rx:FAKE-B03', "X선 '2방향' 처방이 늘었습니다."),
      card('rx:FAKE-B04', 'C.T(2) 처방이 늘었습니다.'),
      card('total.patients', '전체 환자가 조금 늘었습니다.'),
    ]
    expect(parseAiReport(answer(SUMMARY, cards), NAMED)?.cards.map((c) => c.text)).toEqual(cards.map((c) => c.text))
  })

  it('AC-507.6 그룹 이름은 신환·재진 지표 label에서도 꺼낸다', () => {
    const input: ReportInput = {
      ...INPUT,
      metrics: [...INPUT.metrics, handMetric('group:g-x.newPatients', "처방 그룹 '재활3' 신환"), handMetric('group:g-y.returning', "처방 그룹 '재활4' 재진")],
    }
    const cards = [card('group:g-x.newPatients', '재활3 신환이 늘었습니다.'), card('group:g-y.returning', '재활4 재진이 줄었습니다.', 'down'), ...PLAIN_CARDS]
    expect(parseAiReport(answer(SUMMARY, cards), input)?.cards.map((c) => c.text)).toEqual(cards.map((c) => c.text))
  })

  it("AC-507.6 숫자 없는 이름은 지우지 않는다(동네 이름 '월'이 허용 낱말 '10월'을 망가뜨리지 않는다)", () => {
    const input: ReportInput = { ...INPUT, metrics: [...INPUT.metrics, handMetric('region:월', "동네 '월' 환자")] }
    const summary = '10월은 환자가 늘었습니다.'
    expect(parseAiReport(answer(summary, PLAIN_CARDS), input)?.summary).toBe(summary)
  })

  it('AC-507.6 hasForbiddenNumber는 두 번째 인자의 이름을 지운 뒤 숫자를 본다', () => {
    expect(hasForbiddenNumber('도수치료2 환자가 늘었습니다', ['도수치료2'])).toBe(false)
    expect(hasForbiddenNumber('10월 역삼1동 환자가 늘었습니다', ['역삼1동'])).toBe(false)
    expect(hasForbiddenNumber('물리치료12와 물리치료1', ['물리치료12', '물리치료1'])).toBe(false)
    expect(hasForbiddenNumber('C.T(2) 처방', ['C.T(2)'])).toBe(false)
  })

  it('AC-507.6 같은 이름이 문장에 두 번 나와도 모두 지운다', () => {
    expect(hasForbiddenNumber('역삼1동 역삼1동', ['역삼1동'])).toBe(false)
  })

  it('AC-507.6 이름을 허용 낱말보다 먼저 지운다(이름 안의 10월이 먼저 지워져 이름이 깨지지 않는다)', () => {
    expect(hasForbiddenNumber('10월2차', ['10월2차'])).toBe(false)
  })

  it('AC-507.6 이름 목록을 주지 않으면 지금 규칙 그대로다', () => {
    expect(hasForbiddenNumber('도수치료2 환자가 늘었습니다')).toBe(true)
    expect(hasForbiddenNumber('도수치료2 환자가 늘었습니다', [])).toBe(true)
  })
})

describe('parseAiReport — 그대로 어기는 숫자 (AC-507.7)', () => {
  it.each([
    ['이름 밖 숫자', 'region:역삼1동', '역삼1동 환자가 524명으로 늘었습니다.'],
    ['바꿔 쓴 이름(띄어 쓰기)', 'group:g-dosu2.patients', '도수치료 2 환자가 늘었습니다.'],
    ['바꿔 쓴 이름(줄여 쓰기)', 'rx:FAKE-B01', 'MRI 3 처방이 늘었습니다.'],
    ['숫자뿐인 이름', 'region:1', '1 환자가 늘었습니다.'],
    ['숫자·기호뿐인 이름', 'rx:FAKE-B02', '2-3 처방이 늘었습니다.'],
  ])('AC-507.7 %s를 쓴 카드는 빠진다', (_name, metric, text) => {
    const report = parseAiReport(answer(SUMMARY, [card(metric, text), ...PLAIN_CARDS]), NAMED)
    expect(report?.cards).toEqual(PLAIN_CARDS.map(namedBasis))
  })

  it.each([
    ['이름 밖 숫자', '역삼1동 환자가 524명으로 늘었습니다.'],
    ['바꿔 쓴 이름', '도수치료 2 환자가 늘었습니다.'],
    ['숫자뿐인 이름', '동네 1 환자가 늘었습니다.'],
    ['숫자·기호뿐인 이름', '처방 2-3이 늘었습니다.'],
  ])('AC-507.7 요약이 %s를 쓰면 null', (_name, summary) => {
    expect(parseAiReport(answer(summary, PLAIN_CARDS), NAMED)).toBeNull()
  })

  it('AC-507.7 hasForbiddenNumber: 이름 밖 숫자는 남고, 이름을 지운 자리에서 앞뒤 숫자가 붙어 허용 낱말이 되지 않는다', () => {
    expect(hasForbiddenNumber('역삼1동 환자가 524명', ['역삼1동'])).toBe(true)
    expect(hasForbiddenNumber('도수치료 2', ['도수치료2'])).toBe(true)
    expect(hasForbiddenNumber('1역삼1동4일', ['역삼1동'])).toBe(true)
  })

  it('AC-507.7 이름은 정규식이 아니라 글자 그대로 찾는다(이름 안의 . ( ) 는 뜻이 없다)', () => {
    expect(hasForbiddenNumber('CxT2 처방', ['C.T(2)'])).toBe(true)
  })

  it('AC-507.7 숫자·기호뿐인 이름은 허용 목록에 넣지 않아 문장의 다른 같은 숫자도 허용되지 않는다', () => {
    const cards = [card('total.patients', '환자가 1명 늘었습니다.'), card('total.returning', '재진이 2-3명 늘었습니다.'), ...PLAIN_CARDS]
    expect(parseAiReport(answer(SUMMARY, cards), NAMED)?.cards).toEqual(PLAIN_CARDS.map(namedBasis))
  })

  it.each([
    ['앞글자가 없는 label', handMetric('rx:FAKE-Z1', '초음파5')],
    ['뒷글자가 없는 label', handMetric('region:역삼2동', "동네 '역삼2동'")],
    ['뒷글자가 다른 label', handMetric('group:g-z.patients', "처방 그룹 '초음파5' 합계")],
    ['지표 ID와 모양이 다른 label(그룹)', handMetric('group:g-z.patients', "처방 '초음파5' 환자")],
    ['지표 ID와 모양이 다른 label(처방)', handMetric('rx:FAKE-Z2', "동네 '초음파5' 환자")],
    ['이름을 꺼내지 않는 지표', handMetric('total.extra', "처방 '초음파5' 환자")],
  ])('AC-507.7 모양이 안 맞는 지표에서는 이름을 꺼내지 않는다: %s', (_name, metric) => {
    const input: ReportInput = { ...INPUT, metrics: [...INPUT.metrics, metric] }
    const banned = ['초음파5', '역삼2동'].map((name) => card('total.patients', `${name} 환자가 늘었습니다.`))
    const report = parseAiReport(answer(SUMMARY, [...banned, ...PLAIN_CARDS]), input)
    expect(report?.cards.map((c) => c.text)).toEqual(PLAIN_CARDS.map((c) => c.text))
  })
})

describe('parseAiReport — 폭 없는 글자 (AC-507.8)', () => {
  const BLANKS: Array<[string, string]> = [
    ['U+200B 둘', '\u200B\u200B'],
    ['U+200C', '\u200C'],
    ['U+200D', '\u200D'],
    ['U+2060', '\u2060'],
    ['U+FEFF와 빈칸', ' \uFEFF '],
    ['섞인 것', ' \u200B\n\u2060\t'],
  ]

  it.each(BLANKS)('AC-507.8 요약이 빈칸과 폭 없는 글자뿐이면 null: %s', (_name, blank) => {
    expect(parseAiReport(answer(blank, GOOD_CARDS), INPUT)).toBeNull()
  })

  it.each(BLANKS)('AC-507.8 카드 문장이 빈칸과 폭 없는 글자뿐이면 null: %s', (_name, blank) => {
    expect(parseAiReport(answer(SUMMARY, [...GOOD_CARDS, card('total.patients', blank)]), INPUT)).toBeNull()
  })

  it('AC-507.8 앞뒤에 폭 없는 글자가 붙은 문장은 뗀 글자로 돌려준다', () => {
    const cards = [card('total.patients', '\u2060 환자가 늘었습니다.\u200D'), card('total.returning', '\uFEFF재진이 비슷했습니다.\u200B'), card('total.newPatients')]
    const report = parseAiReport(answer(`\u200B ${SUMMARY}\u200C\n`, cards), INPUT)
    expect(report?.summary).toBe(SUMMARY)
    expect(report?.cards.map((c) => c.text)).toEqual(['환자가 늘었습니다.', '재진이 비슷했습니다.', '신환이 크게 늘었습니다.'])
  })

  it('AC-507.8 가운데 폭 없는 글자는 건드리지 않는다', () => {
    const summary = '신환이\u200B늘었습니다.'
    const cards = [card('total.patients', '환자가\u2060늘었습니다.'), ...GOOD_CARDS.slice(0, 2)]
    const report = parseAiReport(answer(summary, cards), INPUT)
    expect(report?.summary).toBe(summary)
    expect(report?.cards[0].text).toBe('환자가\u2060늘었습니다.')
  })

  it('AC-507.8 길이는 뗀 글자로 잰다(최대 자 + 앞뒤 폭 없는 글자는 받고, 최대 자 + 1은 null)', () => {
    const fullSummary = '가'.repeat(SUMMARY_MAX)
    const fullText = '나'.repeat(CARD_TEXT_MAX)
    const cards = [card('total.patients', `\u200B${fullText}\uFEFF`), ...GOOD_CARDS.slice(0, 2)]
    const report = parseAiReport(answer(`\u2060${fullSummary}\u200D`, cards), INPUT)
    expect(report?.summary).toBe(fullSummary)
    expect(report?.cards[0].text).toBe(fullText)
    expect(parseAiReport(answer(`\u200B${'가'.repeat(SUMMARY_MAX + 1)}\u200B`, GOOD_CARDS), INPUT)).toBeNull()
    const longCard = card('total.patients', `\u200B${'나'.repeat(CARD_TEXT_MAX + 1)}\u200B`)
    expect(parseAiReport(answer(SUMMARY, [...GOOD_CARDS, longCard]), INPUT)).toBeNull()
  })
})

describe('parseAiReport — __proto__ 열쇠 (AC-507.9)', () => {
  // JSON 글자를 손으로 쓴다: 객체에 넣고 JSON.stringify하면 __proto__ 칸이 글자로 나오지 않는다
  const json = (value: unknown) => JSON.stringify(value)
  const CARD_TAG = '"tag":"up"'
  const CARD_TEXT = `"text":${json('환자가 늘었습니다.')}`
  const CARD_METRIC = `"metric":${json('total.patients')}`
  const REST = GOOD_CARDS.slice(1).map(json).join(',')
  const cardsWith = (fields: string[]) => `{"summary":${json(SUMMARY)},"cards":[{${fields.join(',')}},${REST}]}`

  it('AC-507.9 손으로 쓴 JSON 글자는 __proto__만 없으면 받는다', () => {
    expect(parseAiReport(cardsWith([CARD_TAG, CARD_TEXT, CARD_METRIC]), INPUT)).not.toBeNull()
  })

  it.each([
    ['셋째 열쇠로(값이 객체)', `{"summary":${json(SUMMARY)},"cards":${json(GOOD_CARDS)},"__proto__":{}}`],
    ['셋째 열쇠로(값이 null)', `{"summary":${json(SUMMARY)},"cards":${json(GOOD_CARDS)},"__proto__":null}`],
    ['summary 자리에', `{"__proto__":${json(SUMMARY)},"cards":${json(GOOD_CARDS)}}`],
    ['cards 자리에', `{"summary":${json(SUMMARY)},"__proto__":${json(GOOD_CARDS)}}`],
    ['열쇠 하나뿐이고 안에 정상 답', `{"__proto__":${json({ summary: SUMMARY, cards: GOOD_CARDS })}}`],
  ])('AC-507.9 맨 위에 "__proto__" 열쇠가 있으면 null: %s', (_name, text) => {
    expect(parseAiReport(text, INPUT)).toBeNull()
  })

  it.each([
    ['넷째 열쇠로', [CARD_TAG, CARD_TEXT, CARD_METRIC, '"__proto__":{}']],
    ['tag 자리에', ['"__proto__":"up"', CARD_TEXT, CARD_METRIC]],
    ['text 자리에', [CARD_TAG, `"__proto__":${json('환자가 늘었습니다.')}`, CARD_METRIC]],
    ['metric 자리에', [CARD_TAG, CARD_TEXT, `"__proto__":${json('total.patients')}`]],
  ])('AC-507.9 카드 안에 "__proto__" 열쇠가 있으면 null: %s', (_name, fields) => {
    expect(parseAiReport(cardsWith(fields), INPUT)).toBeNull()
  })
})
