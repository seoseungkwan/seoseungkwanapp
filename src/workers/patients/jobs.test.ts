import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { RECALL_DEFAULTS, type RecallHistory, type RecallRecord } from '@/lib/patients/recall'
import { PatientsSourceError } from '@/lib/patients/sourceError'
import type { ContactStoreData, FollowupFilters, FollowupRow, FollowupView, RecallFilters, RecallRow, RecallView } from '@/types/patients'
import type { StoreFile, TargetsFile, TargetsReply } from '../../../fixtures/patients/make-fake-patients'
import {
  MAX_STORE_BYTES,
  buildFollowup,
  buildRecall,
  contactCounts,
  filterFollowup,
  filterRecall,
  fitStore,
  followupPhones,
  markKey,
  mergeRecall,
  pruneMarks,
  readStore,
  readStoreReply,
  readTargets,
  setMark,
  storePayload,
} from './jobs'

// 보기 모양·건수·저장 글자(AC-604.3·604.5·604.6·604.7). 자료는 모두 가짜다(fixtures/patients/fake)

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const fake = <T>(name: string): T => JSON.parse(readFileSync(join(ROOT, 'fixtures/patients/fake', name), 'utf8')) as T

const FOLLOWUP = fake<TargetsFile>('targets-followup.json')
const INJECTION = fake<TargetsFile>('targets-injection.json')
const MARKED = fake<StoreFile>('store-marked.json')
const TODAY = FOLLOWUP.today

const CHART_HEAD = ['내원번호', '차트번호', '환자명', '증상', '기록날짜']
const FU_RX_HEAD = ['차트번호', '휴대폰']
const INJ_RX_HEAD = ['처방코드', '차트번호', '처방일자', '휴대폰']

const empty = (): RecallHistory => ({ from: null, readThrough: null, records: [] })
const noMarks = () => Object.create(null) as Record<string, string>
const tables = (file: TargetsFile) => file.pieces.map((p) => ({ chart: p.chart, rx: p.rx }))
const ranged = (pieces: TargetsReply[]) => pieces.map((p) => ({ range: { from: p.from, to: p.to }, chart: p.chart, rx: p.rx }))
const byChart = <T extends { chart: string }>(rows: T[], chart: string) => {
  const row = rows.find((r) => r.chart === chart)
  if (!row) throw new Error('줄 없음')
  return row
}

// 처음 읽어 합친 기록과 보기 모양
const firstHistory = () => mergeRecall(empty(), ranged(INJECTION.pieces), RECALL_DEFAULTS, TODAY)
const followupView = (marks = noMarks()) => buildFollowup(tables(FOLLOWUP), marks, TODAY)
const recallView = (history = firstHistory(), marks = noMarks(), trimmed = 0) =>
  buildRecall(history, RECALL_DEFAULTS, marks, followupPhones(tables(FOLLOWUP)), TODAY, trimmed)

const fuRow = (over: Partial<FollowupRow>): FollowupRow => ({
  key: 'f|V1|900001|2026-11-03',
  chart: '900001',
  name: '가상환자01',
  phone: '010-0000-0001',
  lastVisit: '2026-10-27',
  next: '2026-11-03',
  nextLabel: '2026-11-03 (화)',
  plan: '예정',
  visitKind: 'F/U',
  site: '',
  tx: '',
  evidence: '1주 뒤 f/u',
  contacted: false,
  ...over,
})
const rcRow = (over: Partial<RecallRow>): RecallRow => ({
  key: 'r|vitamin-d|900001|2026-11-02',
  ruleId: 'vitamin-d',
  label: '비타민D',
  months: 3,
  chart: '900001',
  name: '가상환자01',
  phone: '010-0000-0001',
  last: '2026-08-02',
  due: '2026-11-02',
  status: '오늘',
  evidence: '비타민D',
  contacted: false,
  ...over,
})
const fuView = (rows: FollowupRow[]): FollowupView => ({
  read: { from: '2026-07-06', to: TODAY },
  base: TODAY,
  rows,
  undecided: [],
  phoneLoaded: true,
  marksLoaded: true,
})
const rcView = (rows: RecallRow[]): RecallView => ({ rows, coverage: { records: rows.length, from: null, short: [], trimmed: 0 } })

const expectCode = (fn: () => unknown, code: string) => {
  let caught: unknown = null
  try {
    fn()
  } catch (error) {
    caught = error
  }
  expect((caught as { code?: unknown } | null)?.code).toBe(code)
}

describe('readTargets', () => {
  const asked = { kind: 'followup', from: '2026-10-07', to: '2026-11-02' } as const
  const reply = (over: Record<string, unknown> = {}) => ({
    v: 1,
    kind: 'followup',
    from: asked.from,
    to: asked.to,
    chart: [CHART_HEAD, ['V1', '900001', '가상환자01', '1주 뒤 f/u', '2026-10-27']],
    rx: [FU_RX_HEAD, ['900001', '010-0000-0001']],
    ...over,
  })
  const injected = { kind: 'injection', from: '2026-10-01', to: '2026-10-31' } as const

  it('AC-604.3 맞는 답은 chart·rx 두 표만 돌려준다', () => {
    expect(readTargets(reply(), asked)).toEqual({ chart: reply().chart, rx: reply().rx })
  })

  it('AC-604.3 머리 줄뿐인 표(그 기간에 자료 없음)도 맞는 답이다', () => {
    expect(readTargets(reply({ chart: [CHART_HEAD], rx: [FU_RX_HEAD] }), asked).chart).toEqual([CHART_HEAD])
  })

  it('AC-604.3 전화 칸이 없는 47 표도 받는다', () => {
    expect(readTargets(reply({ rx: [['차트번호'], ['900001']] }), asked).rx).toEqual([['차트번호'], ['900001']])
  })

  it('AC-604.3 정기 주사 47 표는 처방코드·차트번호·처방일자가 있어야 한다', () => {
    const good = { v: 1, ...injected, chart: [CHART_HEAD], rx: [INJ_RX_HEAD] }
    expect(readTargets(good, injected).rx).toEqual([INJ_RX_HEAD])
    for (const [index, head] of [
      ['차트번호', '처방일자'],
      ['처방코드', '처방일자'],
      ['처방코드', '차트번호'],
    ].entries()) {
      expect(() => readTargets({ ...good, rx: [head] }, injected), `사례 ${index}`).toThrow('E-BRIDGE-BAD-REPLY')
    }
  })

  it.each<[string, Record<string, unknown>]>([
    ['v가 다름', { v: 2 }],
    ['kind가 다름', { kind: 'injection' }],
    ['from이 다름', { from: '2026-10-08' }],
    ['to가 다름', { to: '2026-11-01' }],
    ['chart가 배열이 아님', { chart: 'x' }],
    ['rx가 없음', { rx: undefined }],
    ['chart가 빈 표', { chart: [] }],
    ['rx가 빈 표', { rx: [] }],
    ['chart에 null 줄', { chart: [CHART_HEAD, null] }],
    ['rx에 null 줄', { rx: [FU_RX_HEAD, null] }],
    ['글자가 아닌 칸', { chart: [CHART_HEAD, ['V1', 900001, '가상환자01', '', '2026-10-27']] }],
    ['null 칸', { rx: [FU_RX_HEAD, ['900001', null]] }],
    ['차트번호 칸 없음', { chart: [['내원번호', '환자명', '증상', '기록날짜']] }],
    ['내원번호 칸 없음', { chart: [['차트번호', '환자명', '증상', '기록날짜']] }],
    ['약속 밖의 칸(주민번호)', { chart: [[...CHART_HEAD, '주민번호']] }],
    ['47 표에 차트번호 없음', { rx: [['휴대폰']] }],
    ['47 표에 약속 밖의 칸(주소)', { rx: [['차트번호', '휴대폰', '주소']] }],
    ['F/U 47 표에 처방 칸', { rx: [['처방코드', '차트번호', '처방일자']] }],
  ])('AC-604.3 틀린 답은 E-BRIDGE-BAD-REPLY: %s', (_id, over) => {
    expectCode(() => readTargets(reply(over), asked), 'E-BRIDGE-BAD-REPLY')
  })

  it.each([null, 1, 'x', []])('AC-604.3 객체가 아닌 답은 E-BRIDGE-BAD-REPLY (사례 %#)', (json) => {
    expectCode(() => readTargets(json, asked), 'E-BRIDGE-BAD-REPLY')
  })
})

describe('readStore', () => {
  const record: RecallRecord = { chart: '900001', name: '가상환자01', date: '2026-10-01', codes: ['A32'], text: '비타민D', phone: '' }
  const good = (over: Record<string, unknown> = {}) => ({
    v: 1,
    marks: { 'r|vitamin-d|900001|2026-11-02': '2026-11-01' },
    recall: { from: '2026-04-01', readThrough: '2026-10-15', records: [record] },
    ...over,
  })

  it('AC-604.8 {}(저장 파일 없음)는 빈 것으로 시작한다', () => {
    expect(readStore({})).toEqual({ v: 1, marks: {}, recall: { from: null, readThrough: null, records: [] } })
  })

  it('AC-604.6 맞는 모양을 그대로 읽는다', () => {
    expect(readStore(good())).toEqual(good())
  })

  it('AC-604.6 기록 하나가 이상하면 그 기록만 뺀다', () => {
    const store = readStore(good({ recall: { from: '2026-04-01', readThrough: null, records: [record, { chart: '' }] } }))
    expect(store.recall.records).toEqual([record])
  })

  it.each<[string, unknown]>([
    ['null', null],
    ['배열', []],
    ['글자', 'x'],
    ['v가 다름', good({ v: 2 })],
    ['v 없음', { marks: {}, recall: empty() }],
    ['marks 없음', { v: 1, recall: empty() }],
    ['marks가 배열', good({ marks: [] })],
    ['marks가 null', good({ marks: null })],
    ['표시 값이 글자가 아님', good({ marks: { 'f|V1|900001|2026-11-03': 1 } })],
    ['표시 값이 날짜가 아님', good({ marks: { 'f|V1|900001|2026-11-03': '어제' } })],
    ['recall 없음', { v: 1, marks: {} }],
    ['records가 배열이 아님', good({ recall: { from: null, readThrough: null, records: {} } })],
    ['from이 날짜가 아님', good({ recall: { from: '어제', readThrough: null, records: [] } })],
  ])('AC-604.8 모양이 틀리면 빈 것으로 시작하지 않고 E-STORE-BROKEN: %s', (_id, json) => {
    expectCode(() => readStore(json), 'E-STORE-BROKEN')
  })

  it('AC-604.6 열쇠가 __proto__·constructor여도 그냥 값이고 객체 원형을 건드리지 않는다', () => {
    const json = JSON.parse('{"v":1,"marks":{"__proto__":"2026-11-01","constructor":"2026-11-01"},"recall":{"from":null,"readThrough":null,"records":[]}}') as unknown
    const store = readStore(json)
    expect(Object.keys(store.marks).sort()).toEqual(['__proto__', 'constructor'])
    expect(Object.getPrototypeOf(store.marks)).toBeNull()
    expect(({} as Record<string, unknown>)['2026-11-01']).toBeUndefined()
    expect(Object.keys(JSON.parse(storePayload(store)).contact.marks).sort()).toEqual(['__proto__', 'constructor'])
  })

  it('AC-604.6 표시가 없는 줄은 constructor 같은 열쇠여도 표시된 것으로 읽지 않는다', () => {
    expect(readStore({}).marks['constructor']).toBeUndefined()
  })
})

// 도우미 0.3.0의 store.load {contact: true} 답은 {contact: {…}}다. Worker는 그 contact만 읽는다
describe('readStoreReply', () => {
  it('AC-604.8 {contact: {}}(저장 파일 없음)는 빈 것으로 시작한다', () => {
    expect(readStoreReply({ contact: {} })).toEqual({ v: 1, marks: {}, recall: { from: null, readThrough: null, records: [] } })
  })

  it('AC-604.8 {contact: {v: 1, marks, recall}}는 그 contact를 읽은 것과 같다', () => {
    expect(readStoreReply({ contact: MARKED.contact })).toEqual(readStore(MARKED.contact))
  })

  it('AC-604.8 contact 밖의 칸은 읽지 않는다', () => {
    expect(readStoreReply({ contact: {}, months: {} })).toEqual(readStore({}))
    expect(readStoreReply({ contact: MARKED.contact, note: { v: 2 } })).toEqual(readStore(MARKED.contact))
  })

  it.each<[string, unknown]>([
    ['null', null],
    ['배열', []],
    ['글자', 'x'],
    ['contact 없음(옛 답 {})', {}],
    ['contact 없음(안쪽 모양을 바로 준 옛 답)', MARKED.contact],
    ['contact가 null', { contact: null }],
    ['contact가 배열', { contact: [] }],
    ['contact가 글자', { contact: 'x' }],
    ['안쪽 모양이 틀림(v가 다름)', { contact: { v: 2, marks: {}, recall: empty() } }],
  ])('AC-604.8 빈 것으로 시작하지 않고 E-STORE-BROKEN: %s', (_id, json) => {
    expectCode(() => readStoreReply(json), 'E-STORE-BROKEN')
  })
})

describe('buildFollowup', () => {
  it('AC-2401.3 오늘 포함 30일 조각 하나로 차례대로 줄을 만든다(마지막 내원만·지난 예정·조건부·전화 없음 사례 그대로)', () => {
    const view = followupView()
    expect(view.rows.map((r) => r.chart)).toEqual(['900106', '900104', '900101', '900102', '900103', '900108', '900105'])
    expect(view.read).toEqual({ from: '2026-10-04', to: TODAY })
    expect(view.base).toBe(TODAY)
    expect(view.phoneLoaded).toBe(true)
    expect(view.marksLoaded).toBe(true)
  })

  it('AC-604.3 줄 모양: 이름·전화·마지막 진료·다음 날짜·구분·근거·연락함', () => {
    const view = followupView()
    expect(byChart(view.rows, '900101')).toEqual({
      key: 'f|V0401|900101|2026-11-03',
      chart: '900101',
      name: '가상환자01',
      phone: '010-0000-0101',
      lastVisit: '2026-10-27',
      next: '2026-11-03',
      nextLabel: '2026-11-03 (화)',
      plan: '예정',
      visitKind: 'F/U',
      site: '무릎',
      tx: '',
      evidence: '1주 뒤 f/u',
      contacted: false,
    })
    expect(byChart(view.rows, '900103').plan).toBe('조건부')
    expect(byChart(view.rows, '900105')).toMatchObject({ visitKind: '주사', site: '어깨', phone: '' })
  })

  it('AC-2401.3 날짜 미정 줄은 따로 모은다', () => {
    expect(followupView().undecided).toEqual([
      {
        key: 'f|V0201|900107|',
        chart: '900107',
        name: '가상환자07',
        phone: '010-0000-0107',
        lastVisit: '2026-10-20',
        nextLabel: '미정',
        evidence: '추후 재내원',
      },
    ])
  })

  it('AC-604.3 연락 표시는 줄 열쇠로 맞춘다', () => {
    const view = followupView(setMark(readStore({}), 'f|V0401|900101|2026-11-03', true, TODAY).marks)
    expect(view.rows.filter((r) => r.contacted).map((r) => r.chart)).toEqual(['900101'])
  })

  it('AC-604.3 조각마다 머리 줄이 다르면 칸이 어긋나지 않게 E-BRIDGE-BAD-REPLY', () => {
    const pieces = [
      { chart: [CHART_HEAD], rx: [FU_RX_HEAD] },
      { chart: [CHART_HEAD], rx: [['휴대폰', '차트번호'], ['010-0000-0001', '900001']] },
    ]
    expectCode(() => buildFollowup(pieces, noMarks(), TODAY), 'E-BRIDGE-BAD-REPLY')
  })

  it('AC-604.3 모든 조각에 자료가 없으면 빈 명단이다(지어낸 줄 없음)', () => {
    const view = buildFollowup([{ chart: [CHART_HEAD], rx: [FU_RX_HEAD] }], noMarks(), TODAY)
    expect(view).toEqual({ read: { from: '2026-10-04', to: TODAY }, base: '', rows: [], undecided: [], phoneLoaded: true, marksLoaded: true })
  })

  it('AC-604.3 47 표에 전화 칸이 없으면 phoneLoaded false이고 전화는 빈 글자다', () => {
    const view = buildFollowup(
      [{ chart: [CHART_HEAD, ['V1', '900001', '가상환자01', '1주 뒤 f/u', '2026-10-27']], rx: [['차트번호'], ['900001']] }],
      noMarks(),
      TODAY,
    )
    expect(view.phoneLoaded).toBe(false)
    expect(view.rows[0].phone).toBe('')
  })

  it('AC-604.3 전화를 하나도 못 불러도 차트번호 constructor에 함수가 돌아오지 않는다', () => {
    const view = buildFollowup(
      [{ chart: [CHART_HEAD, ['V1', 'constructor', '가상환자01', '1주 뒤 f/u', '2026-10-27']], rx: [['차트번호']] }],
      noMarks(),
      TODAY,
    )
    expect(view.rows[0].phone).toBe('')
    expect(view.rows[0].contacted).toBe(false)
  })

  it('AC-604.3 원본이 멈추는 자료는 번호 있는 오류로 던진다(환자 값 없음)', () => {
    const chart = [CHART_HEAD, ['V1', '900001', '가상환자01', '', '2026-10-27'], ['V1', '900002', '가상환자02', '', '2026-10-27']]
    let caught: unknown = null
    try {
      buildFollowup([{ chart, rx: [FU_RX_HEAD] }], noMarks(), TODAY)
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(PatientsSourceError)
    expect((caught as PatientsSourceError).message).toBe('E-PATIENTS-SOURCE (visit-conflict)')
  })
})

describe('mergeRecall', () => {
  it('AC-604.3 처음 읽은 달 조각을 모두 합치고 from·readThrough를 정한다', () => {
    const history = firstHistory()
    expect(history.from).toBe('2026-04-01')
    expect(history.readThrough).toBe(TODAY)
    expect(history.records.map((r) => r.date)).toEqual([...history.records.map((r) => r.date)].sort())
    expect(new Set(history.records.map((r) => r.chart))).toEqual(new Set(['900101', '900201', '900202', '900203', '900204', '900302']))
  })

  it('AC-604.3 자료 없는 달(머리 줄뿐)이 있어도 멈추지 않는다', () => {
    const last = INJECTION.pieces[INJECTION.pieces.length - 1]
    expect(last.chart).toHaveLength(1)
    const history = mergeRecall(empty(), ranged([last]), RECALL_DEFAULTS, TODAY)
    expect(history).toEqual({ from: last.from, readThrough: last.to, records: [] })
  })

  it('AC-604.3 다시 읽은 달은 새것으로 바꾼다(정정 반영)', () => {
    const october = INJECTION.pieces.filter((p) => p.from === '2026-10-01')
    const old: RecallRecord = { chart: '900205', name: '가상환자05', date: '2026-10-02', codes: ['A32'], text: '비타민D', phone: '' }
    const kept: RecallRecord = { chart: '900206', name: '가상환자06', date: '2026-09-30', codes: ['A32'], text: '비타민D', phone: '' }
    const history = mergeRecall({ from: '2026-04-01', readThrough: '2026-10-15', records: [kept, old] }, ranged(october), RECALL_DEFAULTS, TODAY)
    expect(history.records.some((r) => r.chart === '900205')).toBe(false)
    expect(history.records.some((r) => r.chart === '900206')).toBe(true)
    expect(history.readThrough).toBe('2026-10-31')
  })

  it('AC-604.3 조각이 없으면 기록을 그대로 둔다', () => {
    const history = firstHistory()
    expect(mergeRecall(history, [], RECALL_DEFAULTS, TODAY)).toEqual(history)
  })

  it('AC-604.3 꺼 둔 규칙의 주사도 기록에는 쌓는다(나중에 켤 때를 위해)', () => {
    const rules = RECALL_DEFAULTS.map((rule) => ({ ...rule, enabled: false }))
    expect(mergeRecall(empty(), ranged(INJECTION.pieces), rules, TODAY).records.length).toBe(firstHistory().records.length)
  })

  it('AC-604.3 null 줄은 원본처럼 던진다(handler가 번호로 바꾼다)', () => {
    const piece = { range: { from: '2026-10-01', to: '2026-10-31' }, chart: [CHART_HEAD, null as unknown as string[]], rx: [INJ_RX_HEAD] }
    expect(() => mergeRecall(empty(), [piece], RECALL_DEFAULTS, TODAY)).toThrow(TypeError)
  })
})

// 도우미가 보내는 83 표 끝 총계 줄(patients-total-row): 【 총 계 】 글자가 있던 No 칸은 도우미가 고르지 않아 빠지고, 차트번호 칸에 건수만 남는다
const totalRow = (head: readonly string[], count: string) => head.map((name) => (name.replace(/\s/g, '') === '차트번호' ? count : ''))
const withTotal = <P extends { chart: string[][] }>(piece: P, count = '1,295건'): P => ({ ...piece, chart: [...piece.chart, totalRow(piece.chart[0], count)] })
const COUNTS = ['2건', '1,295건', ' 1,295 건 ', '7건']

describe('도우미 83 표 끝 총계 줄(patients-total-row)', () => {
  it('AC-2201.1 F/U 조각마다 끝에 총계 줄이 있어도 멈추지 않고 그 줄이 없는 조각과 같은 보기 모양이다', () => {
    const totaled = FOLLOWUP.pieces.map((piece, i) => withTotal({ chart: piece.chart, rx: piece.rx }, COUNTS[i % COUNTS.length]))
    expect(buildFollowup(totaled, noMarks(), TODAY)).toEqual(followupView())
  })

  it('AC-2201.2 정기 주사 달 조각마다 끝에 총계 줄이 있어도 그 줄이 없는 조각과 같은 기록으로 합친다', () => {
    const totaled = ranged(INJECTION.pieces).map((piece, i) => withTotal(piece, COUNTS[i % COUNTS.length]))
    expect(mergeRecall(empty(), totaled, RECALL_DEFAULTS, TODAY)).toEqual(firstHistory())
  })

  it('AC-2201.3 칸 차례가 달라도(차트번호가 셋째 칸) 머리 줄의 차트번호 칸을 보고 거른다', () => {
    const order = ['환자명', '내원번호', '차트번호', '증상', '기록날짜']
    const reorder = (chart: string[][]) => chart.map((row) => order.map((name) => row[CHART_HEAD.indexOf(name)]))
    const moved = FOLLOWUP.pieces.map((piece) => ({ chart: reorder(piece.chart), rx: piece.rx }))
    const totaled = moved.map((piece) => withTotal(piece))
    expect(totaled[0].chart.at(-1)).toEqual(['', '', '1,295건', '', ''])
    expect(buildFollowup(totaled, noMarks(), TODAY)).toEqual(buildFollowup(moved, noMarks(), TODAY))
  })

  it.each([
    ['내원번호 칸에 글자', ['V9', '3건', '', '', '']],
    ['환자명 칸에 글자', ['', '3건', '가상환자01', '', '']],
    ['증상 칸에 글자', ['', '3건', '', '1주 뒤 f/u', '']],
    ['기록날짜 칸에 글자', ['', '3건', '', '', '20261027']],
    ['건수 모양 아님: 3명', ['', '3명', '', '', '']],
    ['건수 모양 아님: 총 3건', ['', '총 3건', '', '', '']],
    ['건수 모양 아님: 3', ['', '3', '', '', '']],
    ['건수 모양 아님: 건', ['', '건', '', '', '']],
  ])('AC-2201.4 총계와 닮았지만 다른 줄(%s)은 거르지 않고 원본처럼 멈춘다', (_name, row) => {
    const pieces = FOLLOWUP.pieces.map((piece, i) => ({ chart: i === 0 ? [...piece.chart, row] : piece.chart, rx: piece.rx }))
    let caught: unknown = null
    try {
      buildFollowup(pieces, noMarks(), TODAY)
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(PatientsSourceError)
    expect((caught as PatientsSourceError).reason).toBe('row-unreadable')
  })
})

describe('buildRecall', () => {
  it('AC-604.3 줄 모양: 종류·이름·전화·마지막 주사·다음 예정일·상태·근거·연락함', () => {
    const view = recallView()
    expect(view.rows.map((r) => r.chart)).toEqual(['900101', '900202', '900201', '900203', '900204', '900302'])
    expect(byChart(view.rows, '900201')).toEqual({
      key: 'r|cartilage|900201|2026-11-02',
      ruleId: 'cartilage',
      label: '연골주사',
      months: 6,
      chart: '900201',
      name: '가상환자21',
      phone: '010-0000-0201',
      last: '2026-05-02',
      due: '2026-11-02',
      status: '오늘',
      evidence: '아라간 3차',
      contacted: false,
    })
    expect(byChart(view.rows, '900202').status).toBe('지남 32일')
    expect(byChart(view.rows, '900203').status).toBe('1일 남음')
  })

  it('AC-604.3 전화는 F/U 47 표가 먼저, 없으면 기록의 전화', () => {
    const view = recallView()
    expect(byChart(view.rows, '900101').phone).toBe('010-0000-0101')
    expect(byChart(view.rows, '900203').phone).toBe('010-0000-0203')
    expect(byChart(view.rows, '900202').phone).toBe('')
  })

  it('AC-604.6 쌓인 기록 안내: 합친 기록으로 만들고 trimmed는 handler가 준 수 그대로', () => {
    const history = firstHistory()
    expect(recallView(history, noMarks(), 7).coverage).toEqual({ records: history.records.length, from: '2026-04-01', short: [], trimmed: 7 })
  })

  it('AC-604.6 기록이 간격보다 짧으면 short에 그 규칙이 있다', () => {
    const history: RecallHistory = { from: '2026-10-01', readThrough: TODAY, records: [] }
    expect(recallView(history).coverage.short).toEqual([
      { label: '연골주사', months: 6 },
      { label: '비타민D', months: 3 },
    ])
  })

  it('AC-604.3 전화 표가 빈 {}여도 차트번호 constructor·toString에 함수가 돌아오지 않는다', () => {
    const records: RecallRecord[] = ['constructor', 'toString'].map((chart) => ({ chart, name: '가상환자01', date: '2026-10-01', codes: ['A32'], text: '비타민D', phone: '' }))
    const view = buildRecall({ from: '2026-04-01', readThrough: TODAY, records }, RECALL_DEFAULTS, {}, {}, TODAY, 0)
    expect(view.rows.map((r) => r.phone)).toEqual(['', ''])
    expect(view.rows.map((r) => r.contacted)).toEqual([false, false])
  })
})

describe('filterFollowup', () => {
  const filters = (over: Partial<FollowupFilters> = {}): FollowupFilters => ({ kind: '', includeCond: false, includePast: false, ...over })
  const charts = (rows: { chart: string }[]) => rows.map((r) => r.chart)

  it('AC-604.3 AC-611.1 기본: 예정만, 오늘(이 명단을 읽은 날)부터', () => {
    expect(charts(filterFollowup(followupView(), filters()).rows)).toEqual(['900104', '900101', '900102', '900108', '900105'])
  })

  it('AC-604.3 조건부 포함·지난 예정 포함', () => {
    expect(charts(filterFollowup(followupView(), filters({ includeCond: true })).rows)).toContain('900103')
    expect(charts(filterFollowup(followupView(), filters({ includePast: true })).rows)).toContain('900106')
  })

  it('AC-604.3 기간: 시작·끝 날짜를 포함한다', () => {
    const view = followupView()
    expect(charts(filterFollowup(view, filters({ from: '2026-11-03', to: '2026-11-03' })).rows)).toEqual(['900101', '900102'])
    expect(charts(filterFollowup(view, filters({ from: '2026-11-04', to: '2026-11-06' })).rows)).toEqual(['900108', '900105'])
  })

  it('AC-604.3 구분: 주사·F/U, 날짜 미정 명단도 구분으로만 거른다', () => {
    const view = followupView()
    const injected = filterFollowup(view, filters({ kind: '주사' }))
    expect(charts(injected.rows)).toEqual(['900105'])
    expect(injected.undecided).toEqual([])
    expect(charts(filterFollowup(view, filters({ kind: 'F/U' })).undecided)).toEqual(['900107'])
    expect(charts(filterFollowup(view, filters({ from: '2026-11-03', to: '2026-11-03' })).undecided)).toEqual(['900107'])
  })

  it('AC-604.3 복사 글: 4칸 명단(원본 글 그대로), 날짜 머리 줄 있는 것과 없는 것', () => {
    const { copy } = filterFollowup(followupView(), filters({ from: '2026-11-03', to: '2026-11-03' }))
    expect(copy.list).toBe('가상환자01\t010-0000-0101\t가상환자01\tfu\n가상환자02\t010-0000-0102\t가상환자02\tfu')
    expect(copy.listWithDate).toBe(`2026-11-03 (화) — 2명\t\t\t\n${copy.list}`)
  })

  it('AC-604.3 복사 글: 전화 자료가 있으면 번호 없는 사람은 뺀다', () => {
    const { rows, copy } = filterFollowup(followupView(), filters({ kind: '주사' }))
    expect(charts(rows)).toEqual(['900105'])
    expect(copy.list).toBe('')
  })

  it('AC-604.3 복사 글: 주사는 부위, 주사가 먼저, 날짜가 바뀌면 빈 줄', () => {
    const rows = [
      fuRow({ key: 'a', chart: '900001', name: '가상환자01', next: '2026-11-03' }),
      fuRow({ key: 'b', chart: '900002', name: '가상환자02', phone: '010-0000-0002', next: '2026-11-03', visitKind: '주사', site: '무릎', evidence: '1주 뒤 주사' }),
      fuRow({ key: 'c', chart: '900003', name: '가상환자03', phone: '010-0000-0003', next: '2026-11-04' }),
    ]
    expect(filterFollowup(fuView(rows), filters()).copy.list).toBe(
      [
        '가상환자02\t010-0000-0002\t가상환자02\t무릎',
        '가상환자01\t010-0000-0001\t가상환자01\tfu',
        '\t\t\t',
        '가상환자03\t010-0000-0003\t가상환자03\tfu',
      ].join('\n'),
    )
  })

  it('AC-604.3 차트번호 constructor 줄도 그대로 걸러진다', () => {
    const rows = [fuRow({ key: 'a', chart: 'constructor', phone: '' })]
    expect(charts(filterFollowup(fuView(rows), filters()).rows)).toEqual(['constructor'])
    expect(filterFollowup(fuView(rows), filters()).copy.list).toBe('')
  })
})

describe('filterFollowup: 지난 예정 포함 (AC-611.1)', () => {
  const WED = '2026-11-04' // 이 명단을 읽은 날(수요일)
  const THU = '2026-11-05'
  const TOMORROW = { from: THU, to: THU }
  const THIS_WEEK = { from: '2026-11-02', to: '2026-11-08' }
  const NEXT_WEEK = { from: '2026-11-09', to: '2026-11-15' }

  const row = (chart: string, next: string, over: Partial<FollowupRow> = {}) =>
    fuRow({ key: `f|V|${chart}|${next}`, chart, name: `가상환자${chart}`, phone: `010-0000-${chart}`, next, ...over })
  const onWed = (rows: FollowupRow[], over: Partial<FollowupView> = {}): FollowupView => ({ ...fuView(rows), read: { from: '2026-07-08', to: WED }, base: WED, ...over })
  const select = (view: FollowupView, over: Partial<FollowupFilters>) => filterFollowup(view, { kind: '', includeCond: false, includePast: false, ...over })
  const charts = (rows: { chart: string }[]) => rows.map((r) => r.chart)

  const LAST_WEEK = '2026-10-30'
  const MONDAY = '2026-11-02'
  const YESTERDAY = '2026-11-03'
  const ROWS = [
    row('0001', LAST_WEEK),
    row('0002', MONDAY),
    row('0003', YESTERDAY),
    row('0004', WED),
    row('0005', THU),
    row('0006', '2026-11-07'),
    row('0007', '2026-11-10'),
  ]

  it('AC-611.1 내일: 끄면 내일 줄만, 켜면 지난 줄을 더한다', () => {
    expect(charts(select(onWed(ROWS), { ...TOMORROW }).rows)).toEqual(['0005'])
    expect(charts(select(onWed(ROWS), { ...TOMORROW, includePast: true }).rows)).toEqual(['0001', '0002', '0003', '0005'])
  })

  it('AC-611.1 다음 주: 끄면 다음 주 줄만, 켜면 지난 줄을 더한다(오늘부터 시작일 전까지는 지난 줄이 아니다)', () => {
    expect(charts(select(onWed(ROWS), { ...NEXT_WEEK }).rows)).toEqual(['0007'])
    expect(charts(select(onWed(ROWS), { ...NEXT_WEEK, includePast: true }).rows)).toEqual(['0001', '0002', '0003', '0007'])
  })

  it('AC-611.1 이번 주: 끄면 오늘 전 줄은 기간 안이어도 빠지고(수~일), 켜면 보이고 기간 앞 줄도 더한다', () => {
    expect(charts(select(onWed(ROWS), { ...THIS_WEEK }).rows)).toEqual(['0004', '0005', '0006'])
    expect(charts(select(onWed(ROWS), { ...THIS_WEEK, includePast: true }).rows)).toEqual(['0001', '0002', '0003', '0004', '0005', '0006'])
  })

  it('AC-611.1 그날 진료가 아직 없어 base가 어제여도 어제 줄은 끄면 빠진다(base로 가르지 않는다)', () => {
    const view = onWed(ROWS, { base: YESTERDAY })
    expect(charts(select(view, { ...THIS_WEEK }).rows)).toEqual(['0004', '0005', '0006'])
    expect(charts(select(view, { from: YESTERDAY, to: YESTERDAY }).rows)).toEqual([])
    expect(select(view, { ...THIS_WEEK }).copy.list).not.toContain('가상환자0003')
  })

  it('AC-611.1 base가 오늘보다 오래되어도 켠 결과는 같다', () => {
    const view = onWed(ROWS, { base: '2026-10-01' })
    expect(charts(select(view, { ...TOMORROW, includePast: true }).rows)).toEqual(['0001', '0002', '0003', '0005'])
  })

  it('AC-611.1 오늘 줄은 시작일이 내일이면 켜도 더하지 않는다(지난 줄이 아니다)', () => {
    expect(charts(select(onWed(ROWS), { ...TOMORROW, includePast: true }).rows)).not.toContain('0004')
  })

  it('AC-611.1 기간이 통째로 지났으면: 끄면 없고, 켜면 기간 줄과 기간 앞 줄이다(기간 뒤의 지난 줄은 아니다)', () => {
    const past = { from: MONDAY, to: MONDAY }
    expect(charts(select(onWed(ROWS), past).rows)).toEqual([])
    expect(charts(select(onWed(ROWS), { ...past, includePast: true }).rows)).toEqual(['0001', '0002'])
  })

  it('AC-611.1 지난 줄에도 구분이 걸린다', () => {
    // 구분은 Worker가 근거 문구로 다시 가른다(visitKind)
    const injection = (site: string) => ({ visitKind: '주사' as const, site, evidence: '1주 뒤 주사' })
    const rows = [row('0001', LAST_WEEK), row('0002', LAST_WEEK, injection('무릎')), row('0003', THU), row('0004', THU, injection('어깨'))]
    expect(charts(select(onWed(rows), { ...TOMORROW, includePast: true, kind: '주사' }).rows)).toEqual(['0002', '0004'])
    expect(charts(select(onWed(rows), { ...TOMORROW, includePast: true, kind: 'F/U' }).rows)).toEqual(['0001', '0003'])
  })

  it('AC-611.1 지난 줄에도 조건부 거르기가 걸린다', () => {
    const rows = [row('0001', LAST_WEEK), row('0002', LAST_WEEK, { plan: '조건부' }), row('0003', THU)]
    expect(charts(select(onWed(rows), { ...TOMORROW, includePast: true }).rows)).toEqual(['0001', '0003'])
    expect(charts(select(onWed(rows), { ...TOMORROW, includePast: true, includeCond: true }).rows)).toEqual(['0001', '0002', '0003'])
  })

  it('AC-611.1 복사 글은 고른 줄에서 번호 없는 분만 뺀 것이다(지난 줄 포함)', () => {
    const rows = [row('0001', LAST_WEEK), row('0002', LAST_WEEK, { phone: '' }), row('0003', THU), row('0004', THU, { phone: '' })]
    const { rows: shown, copy } = select(onWed(rows), { ...TOMORROW, includePast: true })
    expect(charts(shown)).toEqual(['0001', '0002', '0003', '0004'])
    expect(copy.list).toBe(['가상환자0001\t010-0000-0001\t가상환자0001\tfu', '\t\t\t', '가상환자0003\t010-0000-0003\t가상환자0003\tfu'].join('\n'))
    expect(copy.listWithDate).toBe(
      [
        '2026-10-30 (금) — 1명\t\t\t',
        '가상환자0001\t010-0000-0001\t가상환자0001\tfu',
        '\t\t\t',
        '2026-11-05 (목) — 1명\t\t\t',
        '가상환자0003\t010-0000-0003\t가상환자0003\tfu',
      ].join('\n'),
    )
  })

  it('AC-611.1 끄면 복사 글에도 오늘 전 줄이 없다', () => {
    const { copy } = select(onWed(ROWS), { ...THIS_WEEK })
    for (const hidden of ['가상환자0001', '가상환자0002', '가상환자0003']) expect(copy.list).not.toContain(hidden)
    expect(copy.list).toContain('가상환자0004')
  })

  it('AC-611.1 전화 자료를 못 읽었으면 번호 없는 분도 복사 글에 남는다(pasteRows 규칙 그대로)', () => {
    const rows = [row('0001', LAST_WEEK, { phone: '' })]
    const { copy } = select(onWed(rows, { phoneLoaded: false }), { ...TOMORROW, includePast: true })
    expect(copy.list).toBe('가상환자0001\t\t가상환자0001\tfu')
  })

  it('AC-611.1 날짜 미정 명단은 켜도 꺼도 그대로다', () => {
    const undecided = [{ key: 'f|V|0009|', chart: '0009', name: '가상환자0009', phone: '', lastVisit: '2026-10-27', nextLabel: '12월 초', evidence: '12월 초' }]
    const view = onWed(ROWS, { undecided })
    expect(charts(select(view, { ...TOMORROW }).undecided)).toEqual(['0009'])
    expect(charts(select(view, { ...TOMORROW, includePast: true }).undecided)).toEqual(['0009'])
  })
})

describe('filterRecall', () => {
  const filters = (over: Partial<RecallFilters> = {}): RecallFilters => ({ from: TODAY, to: '2026-12-02', overdue: true, ...over })
  const charts = (rows: { chart: string }[]) => rows.map((r) => r.chart)

  it('AC-604.3 기간: 지난 예정 포함을 켜면 지난 줄도', () => {
    expect(charts(filterRecall(recallView(), filters(), TODAY).rows)).toEqual(['900101', '900202', '900201', '900203'])
    expect(charts(filterRecall(recallView(), filters({ overdue: false }), TODAY).rows)).toEqual(['900201', '900203'])
  })

  it('AC-604.3 기간 끝은 포함한다', () => {
    expect(charts(filterRecall(recallView(), filters({ to: TODAY, overdue: false }), TODAY).rows)).toEqual(['900201'])
    expect(charts(filterRecall(recallView(), filters({ to: '2027-01-05', overdue: false }), TODAY).rows)).toEqual(['900201', '900203', '900204', '900302'])
  })

  it('AC-604.3 복사 글: 4칸 명단·번호 목록·번호 없는 사람 수', () => {
    const { copy } = filterRecall(recallView(), filters(), TODAY)
    expect(copy.list.split('\n')).toEqual([
      '가상환자01\t010-0000-0101\t가상환자01\t비타민D',
      '가상환자22\t\t가상환자22\t비타민D',
      '가상환자21\t010-0000-0201\t가상환자21\t연골주사',
      '가상환자23\t010-0000-0203\t가상환자23\t비타민D',
    ])
    expect(copy.phones).toBe('01000000101\n01000000201\n01000000203')
    expect(copy.missingPhones).toBe(1)
  })
})

describe('markKey', () => {
  it('AC-604.6 줄 열쇠: F/U는 내원번호·차트번호·다음 날짜, 정기 주사는 규칙·차트번호·다음 예정일', () => {
    expect(markKey({ kind: 'f', visitNo: 'V1', chart: '900001', next: '2026-11-03' })).toBe('f|V1|900001|2026-11-03')
    expect(markKey({ kind: 'r', ruleId: 'vitamin-d', chart: '900001', due: '2026-11-02' })).toBe('r|vitamin-d|900001|2026-11-02')
  })
})

describe('setMark', () => {
  const store = (): ContactStoreData => readStore({})

  it('AC-604.4 켜면 연락한 날을 적고 끄면 지운다', () => {
    const on = setMark(store(), 'f|V1|900001|2026-11-03', true, TODAY)
    expect(on.marks).toEqual({ 'f|V1|900001|2026-11-03': TODAY })
    expect(setMark(on, 'f|V1|900001|2026-11-03', false, TODAY).marks).toEqual({})
  })

  it('AC-604.4 받은 store를 바꾸지 않는다', () => {
    const before = store()
    setMark(before, 'f|V1|900001|2026-11-03', true, TODAY)
    expect(before.marks).toEqual({})
  })

  it('AC-604.4 없는 표시를 꺼도 아무 일 없다', () => {
    expect(setMark(store(), 'f|V1|900001|2026-11-03', false, TODAY).marks).toEqual({})
  })

  it('AC-604.6 __proto__ 열쇠도 원형을 바꾸지 않는 값이고 다시 끌 수 있다', () => {
    const on = setMark(store(), '__proto__', true, TODAY)
    expect(Object.keys(on.marks)).toEqual(['__proto__'])
    expect(Object.getPrototypeOf(on.marks)).toBeNull()
    expect(Object.keys(setMark(on, '__proto__', false, TODAY).marks)).toEqual([])
    expect(Object.keys(setMark(on, 'constructor', true, TODAY).marks).sort()).toEqual(['__proto__', 'constructor'])
  })
})

describe('pruneMarks', () => {
  const keyF = 'f|V1|900001|2026-11-03'
  const keyR = 'r|vitamin-d|900001|2025-04-10'
  const fu = fuView([fuRow({ key: keyF })])
  const rc = rcView([rcRow({ key: keyR, due: '2025-04-10' })])

  it('AC-604.6 보기 모양에 열쇠가 있는 표시만 남기고 열쇠가 바뀐 표시는 뺀다', () => {
    const marks = { [keyF]: TODAY, [keyR]: TODAY, 'f|V0|900001|2026-10-01': TODAY, 'r|vitamin-d|900001|2024-01-01': TODAY }
    expect(pruneMarks(marks, { followup: fu, recall: rc }, TODAY)).toEqual({ [keyF]: TODAY, [keyR]: TODAY })
  })

  it('AC-604.7 날짜는 보지 않는다: 보기 모양에 있으면 1년 지나도 남는다', () => {
    const marks = { [keyR]: '2025-04-11' }
    expect(pruneMarks(marks, { followup: fu, recall: rc }, '2030-01-01')).toEqual(marks)
  })

  it('AC-604.6 정기 주사 보기 모양이 없으면 정기 주사 표시는 그대로, F/U는 정리한다', () => {
    const marks = { [keyF]: TODAY, 'f|V0|900001|2026-10-01': TODAY, 'r|vitamin-d|900009|2020-01-01': '2020-01-01' }
    expect(pruneMarks(marks, { followup: fu, recall: null }, TODAY)).toEqual({ [keyF]: TODAY, 'r|vitamin-d|900009|2020-01-01': '2020-01-01' })
  })

  it('AC-604.6 F/U 보기 모양이 없으면 F/U 표시는 그대로, 정기 주사는 정리한다', () => {
    const marks = { 'f|V0|900001|2026-10-01': TODAY, [keyR]: TODAY, 'r|vitamin-d|900009|2020-01-01': '2020-01-01' }
    expect(pruneMarks(marks, { followup: null, recall: rc }, TODAY)).toEqual({ 'f|V0|900001|2026-10-01': TODAY, [keyR]: TODAY })
  })

  it('AC-604.6 둘 다 없으면 모두 그대로', () => {
    const marks = { [keyF]: TODAY, [keyR]: TODAY }
    expect(pruneMarks(marks, { followup: null, recall: null }, TODAY)).toEqual(marks)
  })

  it('AC-604.6 머리가 다른 열쇠(__proto__·constructor)는 건드리지 않고 원형도 바꾸지 않는다', () => {
    const marks = readStore(JSON.parse('{"v":1,"marks":{"__proto__":"2026-11-01","constructor":"2026-11-01"},"recall":{"from":null,"readThrough":null,"records":[]}}')).marks
    const pruned = pruneMarks(marks, { followup: fu, recall: rc }, TODAY)
    expect(Object.keys(pruned).sort()).toEqual(['__proto__', 'constructor'])
    expect(Object.getPrototypeOf(pruned)).toBeNull()
  })

  it('AC-604.6 정기 주사 기록을 합쳐 저장해도 내일 오실 F/U 줄의 연락함 표시가 남는다', () => {
    const tomorrow = 'f|V0401|900101|2026-11-03'
    const store = setMark(readStore({}), tomorrow, true, TODAY)
    const merged = firstHistory()
    const views = { followup: followupView(store.marks), recall: recallView(merged, store.marks) }
    const saved = JSON.parse(storePayload(fitStore({ ...store, marks: pruneMarks(store.marks, views, TODAY), recall: merged }).store)).contact
    expect(saved.marks).toEqual({ [tomorrow]: TODAY })
    expect(saved.recall.records.length).toBe(merged.records.length)
  })
})

describe('연락함 뒤 다시 오지 않은 정기 주사 환자', () => {
  const overdueKey = 'r|vitamin-d|900301|2025-04-10'
  const reopened = (store: ContactStoreData) => {
    const october = INJECTION.pieces.filter((p) => p.from >= '2026-10-01')
    const merged = mergeRecall(store.recall, ranged(october), RECALL_DEFAULTS, TODAY)
    return { merged, recall: recallView(merged, store.marks), followup: followupView(store.marks) }
  }

  it('AC-604.7 예정일이 1년 넘게 지나도 다음 열기에 연락함이고 injection_left에 안 들어간다', () => {
    const store = readStore(MARKED.contact)
    const { recall, followup } = reopened(store)
    const row = byChart(recall.rows, '900301')
    expect(row.due).toBe('2025-04-10')
    expect(row.contacted).toBe(true)
    expect(contactCounts(followup, recall, TODAY).injection_left).toBe(2)
  })

  it('AC-604.7 저장했다 다시 열어도 그대로(표시가 안 지워진다)', () => {
    const store = readStore(MARKED.contact)
    const first = reopened(store)
    const marks = pruneMarks(store.marks, { followup: first.followup, recall: first.recall }, TODAY)
    expect(marks[overdueKey]).toBe('2025-04-11')
    const payload = storePayload(fitStore({ ...store, marks, recall: first.merged }).store)
    const second = reopened(readStore(JSON.parse(payload).contact))
    expect(byChart(second.recall.rows, '900301').contacted).toBe(true)
    expect(contactCounts(second.followup, second.recall, TODAY).injection_left).toBe(2)
  })

  it('AC-604.7 다시 주사하면 열쇠가 바뀌어 표시가 풀린다', () => {
    const store = readStore(MARKED.contact)
    const { recall, followup } = reopened(store)
    expect(byChart(recall.rows, '900302')).toMatchObject({ key: 'r|vitamin-d|900302|2027-01-05', contacted: false })
    expect(pruneMarks(store.marks, { followup, recall }, TODAY)['r|vitamin-d|900302|2026-01-01']).toBeUndefined()
  })
})

describe('contactCounts', () => {
  const T = '2026-10-31' // 내일이 다음 달인 날
  const count = (fu: FollowupRow[], rc: RecallRow[], today = T) => contactCounts(fuView(fu), rcView(rc), today)

  it('AC-604.5 F/U는 다음 내원일이 꼭 내일인 줄만 센다', () => {
    const left = (next: string) => count([fuRow({ next })], []).followup_left
    expect(left('2026-11-01')).toBe(1)
    expect(left('2026-10-31')).toBe(0)
    expect(left('2026-11-02')).toBe(0)
    expect(left('2026-10-01')).toBe(0)
  })

  it('AC-604.5 F/U 조건부는 내일이어도 빼고, 연락함도 뺀다', () => {
    expect(count([fuRow({ next: '2026-11-01', plan: '조건부' })], []).followup_left).toBe(0)
    expect(count([fuRow({ next: '2026-11-01', contacted: true })], []).followup_left).toBe(0)
  })

  it('AC-604.5 정기 주사는 예정일이 오늘까지(지난 것 포함)인 줄을 센다', () => {
    const left = (due: string) => count([], [rcRow({ due })]).injection_left
    expect(left('2026-10-31')).toBe(1)
    expect(left('2026-10-30')).toBe(1)
    expect(left('2025-01-01')).toBe(1)
    expect(left('2026-11-01')).toBe(0)
  })

  it('AC-604.5 정기 주사 연락함은 뺀다', () => {
    expect(count([], [rcRow({ due: '2026-10-31', contacted: true })]).injection_left).toBe(0)
  })

  it('AC-604.5 두 칸을 따로 세고 늘 0 이상 정수 둘이다', () => {
    const none = count([], [])
    expect(none).toEqual({ followup_left: 0, injection_left: 0 })
    const both = count([fuRow({ next: '2026-11-01' }), fuRow({ next: '2026-11-01', key: 'x' })], [rcRow({ due: '2026-10-01' })])
    expect(both).toEqual({ followup_left: 2, injection_left: 1 })
    expect(Object.keys(both).sort()).toEqual(['followup_left', 'injection_left'])
  })

  it('AC-604.5 가짜 조각 전체: 화면 고르기와 상관없이 센다', () => {
    const fu = followupView()
    const rc = recallView()
    expect(contactCounts(fu, rc, TODAY)).toEqual({ followup_left: 2, injection_left: 3 })
  })
})

describe('fitStore · storePayload', () => {
  // 큰 가짜 기록은 파일로 두지 않고 그때 만든다. 긴 글은 글자 하나를 나눠 쓴다(메모리·시간을 아낀다)
  const LONG = '가'.repeat(4000)
  const record = (i: number, date: string, text = LONG): RecallRecord => ({ chart: String(900000 + i), name: '가상환자01', date, codes: ['A32'], text, phone: '' })
  const dayAt = (i: number) => `20${24 + Math.floor(i / 360)}-${String(Math.floor(i / 30) % 12 + 1).padStart(2, '0')}-${String(i % 30 + 1).padStart(2, '0')}`
  const bytes = (store: ContactStoreData) => Buffer.byteLength(JSON.stringify(store), 'utf8')
  const storeOf = (records: RecallRecord[], from: string | null = '2024-01-01'): ContactStoreData => ({ v: 1, marks: { k: TODAY }, recall: { from, readThrough: TODAY, records } })
  const BIG = { timeout: 60_000 } // 30MB 글자를 다룬다. 여러 작업이 나눠 쓰는 PC에서도 시간 때문에 실패하지 않게

  it('AC-604.6 한도는 30MB', () => {
    expect(MAX_STORE_BYTES).toBe(30 * 1024 * 1024)
  })

  it('AC-604.6 저장 글자는 {contact: {v: 1, marks, recall}} 모양이다', () => {
    const store = storeOf([record(0, '2026-10-01', '비타민D')])
    expect(JSON.parse(storePayload(store))).toEqual({ contact: { v: 1, marks: { k: TODAY }, recall: store.recall } })
  })

  it('AC-604.6 한도 안이면 그대로, 뺀 수 0', () => {
    const store = storeOf([record(0, '2026-10-01', '비타민D')])
    expect(fitStore(store)).toEqual({ store, trimmed: 0 })
  })

  it('AC-604.6 꼭 30MB면 그대로, 1바이트 넘으면 뺀다', BIG, () => {
    const skeleton = storeOf([record(0, '2026-01-01', ''), record(1, '2026-02-01', '')])
    const room = MAX_STORE_BYTES - bytes(skeleton)
    const fill = 'x'.repeat(room)
    const exact = storeOf([record(0, '2026-01-01', fill), record(1, '2026-02-01', '')])
    expect(bytes(exact)).toBe(MAX_STORE_BYTES)
    expect(fitStore(exact).trimmed).toBe(0)

    const over = storeOf([record(0, '2026-01-01', `${fill}x`), record(1, '2026-02-01', '')])
    const fitted = fitStore(over)
    expect(fitted.trimmed).toBe(1)
    expect(fitted.store.recall.records.map((r) => r.date)).toEqual(['2026-02-01'])
    expect(fitted.store.recall.from).toBe('2026-02-01')
  })

  it('AC-604.6 넘으면 가장 오래된 기록부터 빼고 증상 글은 자르지 않고 from을 늦춘다', BIG, () => {
    const count = 3000 // 4000자(12KB) × 3000 = 36MB
    const records = Array.from({ length: count }, (_, i) => record(i, dayAt(i)))
    const store = storeOf(records)
    const before = bytes(store)
    expect(before).toBeGreaterThan(MAX_STORE_BYTES)

    const { store: fitted, trimmed } = fitStore(store)
    expect(trimmed).toBeGreaterThan(0)
    expect(fitted.recall.records).toHaveLength(count - trimmed)
    expect(bytes(fitted)).toBeLessThanOrEqual(MAX_STORE_BYTES)
    // 하나만 덜 뺐다면 넘는다(너무 많이 빼지 않는다)
    expect(bytes({ ...fitted, recall: { ...fitted.recall, records: [records[trimmed - 1], ...fitted.recall.records] } })).toBeGreaterThan(MAX_STORE_BYTES)
    expect(fitted.recall.records[0]).toEqual(records[trimmed])
    expect(fitted.recall.records.every((r) => r.text.length === LONG.length)).toBe(true)
    expect(fitted.recall.from).toBe(records[trimmed].date)
    expect(fitted.recall.readThrough).toBe(TODAY)
    expect(fitted.marks).toEqual({ k: TODAY })
    // 받은 값은 그대로
    expect(store.recall.records).toHaveLength(count)
    expect(store.recall.from).toBe('2024-01-01')
  })

  it('AC-604.6 기록 차례가 섞여 있어도 날짜가 가장 오래된 것부터 뺀다', BIG, () => {
    const big = 'x'.repeat(16 * 1024 * 1024)
    const records = [record(1, '2026-03-01', big), record(0, '2026-01-01', big), record(2, '2026-02-01', '')]
    const { store, trimmed } = fitStore(storeOf(records))
    expect(trimmed).toBe(1)
    expect(store.recall.records.map((r) => r.date)).toEqual(['2026-02-01', '2026-03-01'])
    expect(store.recall.from).toBe('2026-02-01')
  })

  it('AC-604.6 from이 null이던 기록은 날짜가 들어가며 길어지는 몫까지 세어 크기를 지킨다', BIG, () => {
    const small = record(0, '2026-01-01', '')
    const skeleton = storeOf([small, record(1, '2026-02-01', '')], null)
    // 작은 기록 하나를 빼면 from이 null인 채로는 한도 안이지만, from에 날짜가 들어가면(4바이트 → 12바이트) 4바이트 넘는다
    const drop = Buffer.byteLength(JSON.stringify(small), 'utf8') + 1
    const fill = 'x'.repeat(MAX_STORE_BYTES - bytes(skeleton) + drop - 4)
    const { store, trimmed } = fitStore(storeOf([small, record(1, '2026-02-01', fill)], null))
    expect(trimmed).toBe(2)
    expect(store.recall).toEqual({ from: null, readThrough: TODAY, records: [] })
    expect(bytes(store)).toBeLessThanOrEqual(MAX_STORE_BYTES)
  })

  it('AC-604.6 표시가 __proto__ 열쇠여도 저장 글자에 그대로 남는다', () => {
    const store = setMark(readStore({}), '__proto__', true, TODAY)
    const text = storePayload(fitStore(store).store)
    expect(text).toContain('"__proto__":"2026-11-02"')
  })
})
