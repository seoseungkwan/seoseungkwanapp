import { describe, expect, it } from 'vitest'
import type { ShownReport } from '@/types/aiReport'
import { parseSavedReport, parseShownReport } from './savedReport'

// 시험 자료는 손으로 만든 가짜 값이다. 저장 줄은 ai_reports 표의 칸 이름 그대로, 서버 답은 ShownReport 모양이다

type Fields = Record<string, unknown>

const CARD = { tag: 'up', text: '신환이 늘었어요', metric: 'total.newPatients', basis: '가짜 근거 줄' }
const HASH = 'a'.repeat(64)
// Supabase가 timestamptz를 돌려주는 모양(마이크로초·+00:00)
const CREATED_AT = '2026-11-02T00:12:34.123456+00:00'
const SHOWN = { month: '2026-10', partial: false, summary: '가짜 요약', cards: [CARD], model: 'claude-fake', createdAt: CREATED_AT }
const ROW = {
  month: '2026-10',
  report: { partial: false, summary: '가짜 요약', cards: [CARD] },
  input_hash: HASH,
  model: 'claude-fake',
  created_at: CREATED_AT,
}

const without = (o: Fields, key: string): Fields => Object.fromEntries(Object.entries(o).filter(([k]) => k !== key))

// 같은 뜻의 값을 저장 줄 모양으로 옮긴다. 두 함수에 같은 깨진 값을 넣어 보려고 쓴다
function rowOf(fields: Fields): Fields {
  const { month, partial, summary, cards, model, createdAt } = { ...SHOWN, ...fields }
  return { month, report: { partial, summary, cards }, input_hash: HASH, model, created_at: createdAt }
}

const FORMS: Array<{ name: string; parse: (fields: Fields) => ShownReport | null }> = [
  { name: 'parseSavedReport', parse: (fields) => parseSavedReport(rowOf(fields)) },
  { name: 'parseShownReport', parse: (fields) => parseShownReport({ ...SHOWN, ...fields }) },
]

const NOT_OBJECTS: Array<[string, unknown]> = [
  ['null', null],
  ['undefined', undefined],
  ['글자', 'x'],
  ['숫자', 1],
  ['참', true],
  ['배열', []],
]

const BAD_CARDS: Array<[string, unknown]> = [
  ['카드가 null', null],
  ['카드가 글자', 'x'],
  ['카드가 배열', []],
  ['tag가 빠짐', without(CARD, 'tag')],
  ['text가 빠짐', without(CARD, 'text')],
  ['metric이 빠짐', without(CARD, 'metric')],
  ['basis가 빠짐', without(CARD, 'basis')],
  ['꼬리표가 넷 밖', { ...CARD, tag: 'flat' }],
  ['꼬리표가 대문자', { ...CARD, tag: 'UP' }],
  ['꼬리표가 객체 기본 이름', { ...CARD, tag: 'toString' }],
  ['꼬리표가 숫자', { ...CARD, tag: 1 }],
  ['text가 숫자', { ...CARD, text: 1 }],
  ['metric이 null', { ...CARD, metric: null }],
  ['basis가 숫자', { ...CARD, basis: 1 }],
]

describe.each(FORMS)('$name 공통 검사', ({ parse }) => {
  it('AC-702.1 맞는 값은 그대로 읽는다(참인 partial·DB 시각 모양 포함)', () => {
    const result = parse({ partial: true })
    expect(result).toMatchObject({ month: '2026-10', partial: true, summary: '가짜 요약', cards: [CARD], model: 'claude-fake', createdAt: CREATED_AT })
  })

  it.each(['up', 'down', 'watch', 'guess'])('AC-702.1 꼬리표 %s는 통과한다', (tag) => {
    expect(parse({ cards: [{ ...CARD, tag }] })?.cards).toStrictEqual([{ ...CARD, tag }])
  })

  it('AC-702.1 카드 개수는 보지 않는다(빈 목록도, 8개를 넘어도 통과)', () => {
    expect(parse({ cards: [] })?.cards).toStrictEqual([])
    expect(parse({ cards: Array.from({ length: 9 }, () => CARD) })?.cards).toHaveLength(9)
  })

  it('AC-702.1 카드 목록과 카드도 새 객체다', () => {
    const cards = [{ ...CARD }]
    const result = parse({ cards })
    expect(result?.cards).not.toBe(cards)
    expect(result?.cards[0]).not.toBe(cards[0])
  })

  it.each(BAD_CARDS)('AC-702.2 %s이면 null이다', (_label, card) => {
    expect(parse({ cards: [card] })).toBeNull()
  })

  it('AC-702.2 뒤에 있는 카드가 깨져도 null이다', () => {
    expect(parse({ cards: [CARD, { ...CARD, tag: 'flat' }] })).toBeNull()
  })

  it.each<[string, unknown]>([
    ['객체', {}],
    ['null', null],
    ['글자', 'x'],
    ['숫자', 1],
  ])('AC-702.2 cards가 %s이면(배열이 아니면) null이다', (_label, cards) => {
    expect(parse({ cards })).toBeNull()
  })

  it.each<[string, unknown]>([
    ['없는 달', '2026-13'],
    ['0월', '2026-00'],
    ['한 자리 달', '2026-1'],
    ['날짜까지 있음', '2026-10-01'],
    ['빈 글자', ''],
    ['숫자', 202610],
    ['null', null],
  ])('AC-702.2 month가 %s이면 null이다', (_label, month) => {
    expect(parse({ month })).toBeNull()
  })

  it.each<[string, unknown]>([
    ['글자', 'true'],
    ['숫자', 1],
    ['null', null],
  ])('AC-702.2 partial이 %s이면(참·거짓이 아니면) null이다', (_label, partial) => {
    expect(parse({ partial })).toBeNull()
  })

  it.each<[string, Fields]>([
    ['summary가 숫자', { summary: 1 }],
    ['summary가 null', { summary: null }],
    ['model이 숫자', { model: 1 }],
    ['model이 null', { model: null }],
    ['만든 시각이 숫자', { createdAt: 1762042354000 }],
    ['만든 시각이 null', { createdAt: null }],
  ])('AC-702.2 %s이면(글자 칸이 글자가 아니면) null이다', (_label, fields) => {
    expect(parse(fields)).toBeNull()
  })

  it.each([
    ['날짜가 아닌 글자', 'not-a-date'],
    ['빈 글자', ''],
    ['없는 달', '2026-13-01T00:00:00Z'],
  ])('AC-702.2 만든 시각이 %s이면(날짜로 읽히지 않으면) null이다', (_label, createdAt) => {
    expect(parse({ createdAt })).toBeNull()
  })

  it('AC-702.3 카드 안의 남는 칸은 버린다', () => {
    expect(parse({ cards: [{ ...CARD, secret: 'x', tag2: 'y' }] })?.cards).toStrictEqual([CARD])
  })
})

describe('parseSavedReport (저장 줄 모양)', () => {
  it('AC-702.1 맞는 저장 줄은 정해 둔 칸만 담은 SavedReport(카멜 표기)가 된다', () => {
    expect(parseSavedReport(ROW)).toStrictEqual({
      month: '2026-10',
      partial: false,
      summary: '가짜 요약',
      cards: [CARD],
      model: 'claude-fake',
      inputHash: HASH,
      createdAt: CREATED_AT,
    })
  })

  it('AC-702.1 받은 줄을 그대로 넘기지 않고 새 객체로 돌려준다', () => {
    const result = parseSavedReport(ROW)
    expect(result).not.toBe(ROW)
    expect(result).not.toBe(ROW.report)
  })

  it.each(NOT_OBJECTS)('AC-702.2 줄이 %s이면(객체가 아니면) null이다', (_label, value) => {
    expect(parseSavedReport(value)).toBeNull()
  })

  it.each(['month', 'report', 'input_hash', 'model', 'created_at'])('AC-702.2 줄에 %s가 빠지면 null이다', (key) => {
    expect(parseSavedReport(without(ROW, key))).toBeNull()
  })

  it.each(['partial', 'summary', 'cards'])('AC-702.2 report에 %s가 빠지면 null이다', (key) => {
    expect(parseSavedReport({ ...ROW, report: without(ROW.report, key) })).toBeNull()
  })

  it.each(NOT_OBJECTS)('AC-702.2 report가 %s이면(객체가 아니면) null이다', (_label, report) => {
    expect(parseSavedReport({ ...ROW, report })).toBeNull()
  })

  it.each<[string, unknown]>([
    ['숫자', 1],
    ['null', null],
  ])('AC-702.2 input_hash가 %s이면(글자가 아니면) null이다', (_label, input_hash) => {
    expect(parseSavedReport({ ...ROW, input_hash })).toBeNull()
  })

  it('AC-702.2 서버 답 모양(카멜 표기 칸)은 저장 줄이 아니라 null이다', () => {
    expect(parseSavedReport({ ...SHOWN, inputHash: HASH })).toBeNull()
  })

  it('AC-702.3 줄과 report의 남는 칸은 돌려준 값에 없다', () => {
    const result = parseSavedReport({
      ...ROW,
      hospital_id: 'fake-hospital',
      report: { ...ROW.report, secret: 'x', metrics: [] },
    })
    expect(result).toStrictEqual(parseSavedReport(ROW))
  })

  it('AC-702.3 report 안의 같은 이름 칸은 줄의 칸을 대신하지 못한다', () => {
    const result = parseSavedReport({
      ...ROW,
      report: { ...ROW.report, month: '2020-01', model: 'other', inputHash: 'other', createdAt: '2020-01-01T00:00:00Z' },
    })
    expect(result).toStrictEqual(parseSavedReport(ROW))
    // 줄에 없는 칸을 report의 칸으로 채우지도 않는다
    expect(parseSavedReport({ ...without(ROW, 'month'), report: { ...ROW.report, month: '2026-10' } })).toBeNull()
  })
})

describe('parseShownReport (서버 답 모양)', () => {
  it('AC-702.1 맞는 서버 답은 정해 둔 칸만 담은 ShownReport가 된다', () => {
    expect(parseShownReport(SHOWN)).toStrictEqual(SHOWN)
  })

  it('AC-702.1 받은 답을 그대로 넘기지 않고 새 객체로 돌려준다', () => {
    expect(parseShownReport(SHOWN)).not.toBe(SHOWN)
  })

  it.each(NOT_OBJECTS)('AC-702.2 답이 %s이면(객체가 아니면) null이다', (_label, value) => {
    expect(parseShownReport(value)).toBeNull()
  })

  it.each(['month', 'partial', 'summary', 'cards', 'model', 'createdAt'])('AC-702.2 답에 %s가 빠지면 null이다', (key) => {
    expect(parseShownReport(without(SHOWN, key))).toBeNull()
  })

  it('AC-702.2 저장 줄 모양은 서버 답이 아니라 null이다', () => {
    expect(parseShownReport(ROW)).toBeNull()
  })

  it('AC-702.3 POST 답의 inputHash와 남는 칸은 돌려준 값에 없다', () => {
    const result = parseShownReport({ ...SHOWN, inputHash: HASH, secret: 'x' })
    expect(result).toStrictEqual(SHOWN)
    expect(result).not.toHaveProperty('inputHash')
  })
})
