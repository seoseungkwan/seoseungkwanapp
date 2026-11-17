import { describe, expect, it } from 'vitest'
import type { RxGroupDef } from '@/types/analysis'
import {
  DEFAULT_RSV_KINDS,
  SUNAP_TOTAL_KEYS,
  type Ledger,
  type LedgerRow,
  type LedgerSettings,
  type RsvKindDef,
  type SunapLocalDay,
  type SunapRates,
  type SunapReply,
  type SunapReplyDoctor,
  type SunapReplyRow,
  type SunapReplyRowV2,
  type SunapTotals,
} from '@/types/sunap'
import { buildLedger, closeLocal, dayTotals, ledgerDoctors, parseWon, reopenLocal } from './ledger'

// ── 지어낸 자료: 승인 시안(docs/mockups/sunap-ilji/index.html) ROWS 16줄로 만든 도우미 답 ─────────
// 차트·이름·금액은 시안의 지어낸 값이다. 13번 Block·16번 현금은 직원이 고친 칸(비트 값은 Block 아님·현금 0원)

const DAY = '2026-11-16'
// 설정 기본값과 같은 종류 목록(주사치료 ○ → 진료(경과) ○ → 기타 ✕)
const KINDS: RsvKindDef[] = [
  { id: 'inj', label: '주사치료', counts: true, words: ['주사', '블록'] },
  { id: 'visit', label: '진료(경과)', counts: true, words: ['경과', '진료'] },
  { id: 'etc', label: '기타', counts: false, words: ['기타'] },
]
const BLOCK: RxGroupDef = { id: 'g-block', codes: ['MM110'] }
const PT: RxGroupDef = { id: 'g-pt', codes: ['MM010', 'MM015'], out: ['ESWT7'] }
const SETTINGS: LedgerSettings = { kinds: KINDS, blockDef: BLOCK, ptDef: PT }

const MOCK_ROWS: SunapReplyRow[] = [
  ['10231', '김○○', '09:02', 're', 0, 15000, 0, 0, ['MM110', 'MM010'], ['202611191030', '주사 오전']],
  ['10877', '이○○', '09:05', 're', 4700, 0, 0, 0, ['MM010'], null],
  ['21004', '박○○', '09:11', 'new', 0, 23400, 0, 0, ['MM110', 'MM015'], ['202611181400', '경과 보기']],
  ['10552', '최○○', '09:14', 're', 0, 9800, 0, 0, ['MM010'], null],
  ['19870', '정○○', '09:20', 'd90', 0, 18200, 0, 0, ['MM110'], ['202611200900', '블록']],
  ['10013', '강○○', '09:31', 're', 0, 0, 0, 0, ['MM010'], null],
  ['21005', '조○○', '09:38', 'new', 12000, 0, 0, 0, ['MM010'], null],
  ['15220', '윤○○', '09:44', 're', 0, 31500, 0, 0, ['MM110', 'MM010', 'ESWT7'], ['202611211000', '전화 상담']],
  ['10498', '장○○', '09:52', 're', 0, 0, 25000, 0, ['MM110', 'MM010'], ['202611230930', '주사']],
  ['21006', '임○○', '10:03', 'new', 0, 0, 0, 16300, ['MM015'], null],
  ['12740', '한○○', '10:10', 're', 3900, 0, 0, 0, ['mm010'], null],
  ['18603', '오○○', '10:18', 'd90', 0, 14600, 0, 0, ['MM010'], ['202611181100', '진료']],
  ['10344', '서○○', '10:25', 're', 0, 42800, 0, 0, ['D1001'], ['202611261030', '주사']],
  ['21007', '신○○', '10:33', 'new', 0, 19700, 0, 0, ['MM110', 'MM010'], ['202611191500', '주사']],
  ['11902', '권○○', '10:41', 're', 0, 8600, 0, 0, ['MM010'], null],
  ['16455', '황○○', '10:47', 're', 0, 10000, 0, 0, ['MM010'], ['202611241000', '경과']],
]
const MOCK_REPLY: SunapReply = {
  v: 1,
  day: DAY,
  unsure: false,
  rows: MOCK_ROWS,
  paid: [
    ['20788', '문○○', '11:20', 10000, 0],
    ['11530', '배○○', '15:42', 0, 15000],
  ],
}
const MOCK_LOCAL: SunapLocalDay = {
  edits: {
    '21004': { note: '허리 MRI 결과 보러 오심' },
    '10552': { rsv: 'inj', note: '전화로 예약하신다고 함' },
    '21006': { rsv: 'visit', note: '카드 두고 오심, 내일 입금' },
    '10344': { block: true },
    '16455': { cash: 5000 },
  },
}

// 시안 ROWS의 보이는 값: [구분, 현금, 카드, 계좌, 미수, Block, 물리치료, 예약 종류, 예약 출처, 고친 칸]
type Seen = [LedgerRow['kind'], number, number, number, number, boolean, boolean, LedgerRow['rsv']['kind'], 'hand' | 'bit', string[]]
const MOCK_SEEN: Seen[] = [
  ['re', 0, 15000, 0, 0, true, true, 'inj', 'bit', []],
  ['re', 4700, 0, 0, 0, false, true, 'none', 'bit', []],
  ['new', 0, 23400, 0, 0, true, true, 'visit', 'bit', []],
  ['re', 0, 9800, 0, 0, false, true, 'inj', 'hand', []],
  ['d90', 0, 18200, 0, 0, true, false, 'inj', 'bit', []],
  ['re', 0, 0, 0, 0, false, true, 'none', 'bit', []],
  ['new', 12000, 0, 0, 0, false, true, 'none', 'bit', []],
  ['re', 0, 31500, 0, 0, true, false, 'unknown', 'bit', []],
  ['re', 0, 0, 25000, 0, true, true, 'inj', 'bit', []],
  ['new', 0, 0, 0, 16300, false, true, 'visit', 'hand', []],
  ['re', 3900, 0, 0, 0, false, true, 'none', 'bit', []],
  ['d90', 0, 14600, 0, 0, false, true, 'visit', 'bit', []],
  ['re', 0, 42800, 0, 0, true, false, 'inj', 'bit', ['block']],
  ['new', 0, 19700, 0, 0, true, true, 'inj', 'bit', []],
  ['re', 0, 8600, 0, 0, false, true, 'none', 'bit', []],
  ['re', 5000, 10000, 0, 0, false, true, 'visit', 'bit', ['cash']],
]

type ReplyV1 = Extract<SunapReply, { v: 1 }>
const replyOf = (rows: SunapReplyRow[], over: Partial<ReplyV1> = {}): SunapReply => ({ v: 1, day: DAY, unsure: false, rows, paid: [], ...over })
const line = (chart: string, over: Partial<{ kind: SunapReplyRow[3]; cash: number; card: number; transfer: number; unpaid: number; codes: string[]; rsv: SunapReplyRow[9] }> = {}): SunapReplyRow => [
  chart,
  '가○○',
  '09:00',
  over.kind ?? 're',
  over.cash ?? 0,
  over.card ?? 10000,
  over.transfer ?? 0,
  over.unpaid ?? 0,
  over.codes ?? [],
  over.rsv === undefined ? null : over.rsv,
]
const rowOf = (ledger: Ledger, chart: string): LedgerRow => {
  const found = ledger.rows.find((row) => row.chart === chart)
  if (found === undefined) throw new Error(`장부 줄이 없어요: ${chart}`)
  return found
}
const one = (row: SunapReplyRow, local: SunapLocalDay = {}, settings: LedgerSettings = SETTINGS) =>
  rowOf(buildLedger(replyOf([row]), local, settings), row[0])

describe('AC-4901.3 buildLedger — 고친 칸은 고친 값, Block·물리치료는 groupMatches', () => {
  it('AC-4901.3: 시안 16줄 — 줄마다 구분·금액·Block·물리치료·예약·고친 칸이 시안과 같다', () => {
    const ledger = buildLedger(MOCK_REPLY, MOCK_LOCAL, SETTINGS)
    expect(ledger.rows.map((row) => row.chart)).toEqual(MOCK_ROWS.map((row) => row[0]))
    ledger.rows.forEach((row, at) => {
      const [kind, cash, card, transfer, unpaid, block, pt, rsvKind, source, edited] = MOCK_SEEN[at]
      expect({ at, kind: row.kind, cash: row.cash, card: row.card, transfer: row.transfer, unpaid: row.unpaid, block: row.block, pt: row.pt }).toEqual({
        at,
        kind,
        cash,
        card,
        transfer,
        unpaid,
        block,
        pt,
      })
      expect({ at, rsv: row.rsv.kind, source: row.rsv.source, edited: row.edited }).toEqual({ at, rsv: rsvKind, source, edited })
    })
  })

  it('AC-4901.3: 줄은 차트·이름·시각을 도우미 답 그대로 싣고, 비고는 고친 칸의 note(없으면 빈 글)다', () => {
    const ledger = buildLedger(MOCK_REPLY, MOCK_LOCAL, SETTINGS)
    expect(rowOf(ledger, '21004')).toMatchObject({ chart: '21004', name: '박○○', time: '09:11', note: '허리 MRI 결과 보러 오심' })
    expect(rowOf(ledger, '10231').note).toBe('')
  })

  it.each([
    ['cash', { cash: 3000 }, 'cash', 3000],
    ['card', { card: 12000 }, 'card', 12000],
    ['transfer', { transfer: 7000 }, 'transfer', 7000],
    ['unpaid', { unpaid: 2500 }, 'unpaid', 2500],
  ] as const)('AC-4901.3: %s를 고치면 그 칸은 고친 값이고 edited에 그 칸 이름이 있다', (_, edit, field, value) => {
    const row = one(line('1'), { edits: { '1': edit } })
    expect(row[field]).toBe(value)
    expect(row.edited).toEqual([field])
  })

  it('AC-4901.3: 고친 값 0원도 고친 값이다(비트 카드 10,000 → 0)', () => {
    const row = one(line('1'), { edits: { '1': { card: 0 } } })
    expect(row.card).toBe(0)
    expect(row.edited).toEqual(['card'])
  })

  it('AC-4901.3: Block·물리치료는 고친 값이 없으면 groupMatches로 정한다(넣는·빼는 처방, 대소문자)', () => {
    expect(one(line('1', { codes: ['MM110'] }))).toMatchObject({ block: true, pt: false, edited: [] })
    expect(one(line('1', { codes: ['mm110', 'mm015'] }))).toMatchObject({ block: true, pt: true })
    expect(one(line('1', { codes: ['MM010', 'ESWT7'] }))).toMatchObject({ block: false, pt: false })
    expect(one(line('1', { codes: [] }))).toMatchObject({ block: false, pt: false })
  })

  it('AC-4901.3: Block·물리치료를 고치면 고친 값(참→거짓도)이고 edited에 들어간다', () => {
    const row = one(line('1', { codes: ['MM110', 'MM010'] }), { edits: { '1': { block: false, pt: false } } })
    expect(row).toMatchObject({ block: false, pt: false, edited: ['block', 'pt'] })
    expect(one(line('1'), { edits: { '1': { pt: true } } })).toMatchObject({ pt: true, edited: ['pt'] })
  })

  it('AC-4901.3: 묶음 정의가 없으면(null) Block·물리치료는 모두 빈 칸이다', () => {
    const settings: LedgerSettings = { kinds: KINDS, blockDef: null, ptDef: null }
    const ledger = buildLedger(MOCK_REPLY, {}, settings)
    expect(ledger.rows.every((row) => !row.block && !row.pt)).toBe(true)
  })

  it('AC-4901.3: 고친 칸이 여럿이면 edited는 현금·카드·계좌·미수·Block·물리치료 차례다', () => {
    const row = one(line('1', { codes: ['MM110'] }), { edits: { '1': { pt: true, unpaid: 100, block: false, cash: 1, transfer: 2, card: 3 } } })
    expect(row.edited).toEqual(['cash', 'card', 'transfer', 'unpaid', 'block', 'pt'])
  })

  it('AC-4901.3: 비트 값과 같은 고친 값은 고친 칸으로 보이지 않는다(비트 값과 다를 때만 표시)', () => {
    const row = one(line('1', { codes: ['MM110'] }), { edits: { '1': { card: 10000, block: true } } })
    expect(row).toMatchObject({ card: 10000, block: true, edited: [] })
  })

  it('AC-4901.3: 예약 고르기·비고는 edited에 넣지 않는다(예약은 rsv.source, 비고는 비트 값이 없다)', () => {
    const row = one(line('1'), { edits: { '1': { rsv: 'etc', note: '메모' } } })
    expect(row.edited).toEqual([])
    expect(row.note).toBe('메모')
  })

  it('AC-4901.3: FREE는 고친 값까지 넣은 네 칸이 다 0원일 때다', () => {
    expect(one(line('1', { card: 0 })).free).toBe(true)
    expect(one(line('1', { card: 0 }), { edits: { '1': { cash: 3000 } } }).free).toBe(false)
    expect(one(line('1', { cash: 4700, card: 0 }), { edits: { '1': { cash: 0 } } }).free).toBe(true)
    expect(one(line('1', { card: 0, unpaid: 16300 })).free).toBe(false)
  })

  it('AC-4901.3: 답에 없는 차트의 고친 칸은 무시하고, 줄 차례는 답 그대로다', () => {
    const ledger = buildLedger(replyOf([line('2'), line('1')]), { edits: { '9': { cash: 1 } } }, SETTINGS)
    expect(ledger.rows.map((row) => row.chart)).toEqual(['2', '1'])
  })

  it('AC-4901.3: 장부는 날짜·확인 필요·미수 입금 줄과 PC 저장의 마감 시각·늦은 마감을 싣는다', () => {
    const ledger = buildLedger({ ...MOCK_REPLY, unsure: true }, { closedAt: '2026-11-16T09:52:00.000Z', late: true, fixed: {} }, SETTINGS)
    expect(ledger).toMatchObject({ day: DAY, unsure: true, closedAt: '2026-11-16T09:52:00.000Z', late: true })
    expect(ledger.paid).toEqual([
      { chart: '20788', name: '문○○', time: '11:20', cash: 10000, card: 0 },
      { chart: '11530', name: '배○○', time: '15:42', cash: 0, card: 15000 },
    ])
    expect(buildLedger(MOCK_REPLY, {}, SETTINGS)).toMatchObject({ closedAt: null, late: false })
  })

  it('AC-4901.3: 받은 답·PC 저장을 바꾸지 않는다', () => {
    const reply = structuredClone(MOCK_REPLY)
    const local = structuredClone(MOCK_LOCAL)
    buildLedger(reply, local, SETTINGS)
    expect(reply).toEqual(MOCK_REPLY)
    expect(local).toEqual(MOCK_LOCAL)
  })
})

describe('AC-4901.4 예약 — 직접 고름(hand) → 그날 고정(fixed) → 비트 예약 없음(none) → 메모 말', () => {
  const RSV: SunapReplyRow[9] = ['202611191030', '주사 오전']

  it('AC-4901.4: 직접 고른 값이 있으면 그 값이고 출처는 hand다(고정값·비트 메모보다 앞)', () => {
    expect(one(line('1', { rsv: RSV }), { edits: { '1': { rsv: 'visit' } }, fixed: { '1': 'etc' } }).rsv).toEqual({
      kind: 'visit',
      source: 'hand',
      at: '202611191030',
    })
    expect(one(line('1'), { edits: { '1': { rsv: 'inj' } } }).rsv).toEqual({ kind: 'inj', source: 'hand', at: null })
  })

  it('AC-4901.4: 직접 "예약 안 하고 가심"(none)을 고르면 비트 예약이 있어도 시각은 없다', () => {
    expect(one(line('1', { rsv: RSV }), { edits: { '1': { rsv: 'none' } } }).rsv).toEqual({ kind: 'none', source: 'hand', at: null })
  })

  it('AC-4901.4: 직접 고른 값이 없고 그날 고정값이 있으면 그 값이고 출처는 bit다', () => {
    expect(one(line('1', { rsv: RSV }), { fixed: { '1': 'unknown' } }).rsv).toEqual({ kind: 'unknown', source: 'bit', at: '202611191030' })
    // 마감 뒤 비트에 새로 생긴 예약(전화 예약)은 고정된 '예약 안 하고 가심'을 바꾸지 않는다
    expect(one(line('1', { rsv: RSV }), { fixed: { '1': 'none' } }).rsv).toEqual({ kind: 'none', source: 'bit', at: null })
    // 마감 뒤 비트 예약이 지워져도 고정값 그대로
    expect(one(line('1'), { fixed: { '1': 'inj' } }).rsv).toEqual({ kind: 'inj', source: 'bit', at: null })
  })

  it('AC-4901.4: 둘 다 없고 비트 예약이 없으면 none이다', () => {
    expect(one(line('1')).rsv).toEqual({ kind: 'none', source: 'bit', at: null })
  })

  it('AC-4901.4: 둘 다 없고 비트 예약이 있으면 메모 말로 정한다(classifyMemo, 설정의 말)', () => {
    expect(one(line('1', { rsv: ['202611181400', '경과 보기'] })).rsv).toEqual({ kind: 'visit', source: 'bit', at: '202611181400' })
    expect(one(line('1', { rsv: ['202611181400', '기타'] })).rsv.kind).toBe('etc')
    expect(one(line('1', { rsv: ['202611181400', ''] })).rsv.kind).toBe('unknown')
    const custom: LedgerSettings = {
      ...SETTINGS,
      kinds: [
        { ...KINDS[0], words: ['INJ'] },
        { ...KINDS[1], words: [] },
        { ...KINDS[2], words: [] },
      ],
    }
    expect(one(line('1', { rsv: ['202611181400', 'inj 오전'] }), {}, custom).rsv.kind).toBe('inj')
  })

  it('AC-4901.4: 직접 고르기는 unknown을 받지 않는다 — 저장에 unknown이 있어도 직접 고른 값으로 보지 않는다', () => {
    const local = { edits: { '1': { rsv: 'unknown' } } } as unknown as SunapLocalDay
    expect(one(line('1', { rsv: RSV }), local).rsv).toEqual({ kind: 'inj', source: 'bit', at: '202611191030' })
    expect(one(line('1'), local).rsv).toEqual({ kind: 'none', source: 'bit', at: null })
  })
})

// ── sunap-kinds: 종류 목록(새 종류·지운 종류) ─────────────────────────
// 도수치료(새 종류, 예약률 ○)를 진료(경과) 아래에 둔 목록. 체외충격파(새 종류, 예약률 ✕)는 맨 아래
const DOSU: RsvKindDef = { id: 'kdosu01', label: '도수치료', counts: true, words: ['도수'] }
const ESWT: RsvKindDef = { id: 'keswt01', label: '체외충격파', counts: false, words: ['충격파'] }
const KINDS2: RsvKindDef[] = [KINDS[0], KINDS[1], DOSU, KINDS[2], ESWT]
const SETTINGS2: LedgerSettings = { ...SETTINGS, kinds: KINDS2 }

describe('AC-5502.1 buildLedger — 비트 메모는 종류 목록 차례로 정한다', () => {
  it('AC-5502.1: 새 종류의 말이 든 메모는 그 종류 id이고 출처는 bit다', () => {
    expect(one(line('1', { rsv: ['202611201400', '도수 오후'] }), {}, SETTINGS2).rsv).toEqual({ kind: 'kdosu01', source: 'bit', at: '202611201400' })
    expect(one(line('1', { rsv: ['202611201400', '충격파'] }), {}, SETTINGS2).rsv.kind).toBe('keswt01')
    expect(one(line('1', { rsv: ['202611201400', '전화'] }), {}, SETTINGS2).rsv.kind).toBe('unknown')
  })

  it('AC-5502.1: 말이 둘 다 있으면 목록에서 위 종류다', () => {
    expect(one(line('1', { rsv: ['202611201400', '도수 후 기타'] }), {}, SETTINGS2).rsv.kind).toBe('kdosu01')
    expect(one(line('1', { rsv: ['202611201400', '도수 후 주사'] }), {}, SETTINGS2).rsv.kind).toBe('inj')
    const dosuFirst: LedgerSettings = { ...SETTINGS, kinds: [DOSU, ...KINDS] }
    expect(one(line('1', { rsv: ['202611201400', '도수 후 주사'] }), {}, dosuFirst).rsv.kind).toBe('kdosu01')
  })

  it('AC-5502.1: 종류를 지우면(목록에 없음) 그 말로는 정하지 않는다 — 비트 메모로 그 종류였던 줄은 종류 모름', () => {
    expect(one(line('1', { rsv: ['202611201400', '도수 오후'] }), {}, SETTINGS).rsv).toEqual({ kind: 'unknown', source: 'bit', at: '202611201400' })
  })
})

describe('AC-5502.2 예약 — 직접 고른 값·마감 고정값이 목록에 없는 종류면', () => {
  const RSV: SunapReplyRow[9] = ['202611191030', '주사 오전']

  it('AC-5502.2: 직접 고른 새 종류가 목록에 있으면 그 값이고 출처는 hand다', () => {
    expect(one(line('1', { rsv: RSV }), { edits: { '1': { rsv: 'kdosu01' } } }, SETTINGS2).rsv).toEqual({
      kind: 'kdosu01',
      source: 'hand',
      at: '202611191030',
    })
    expect(one(line('1'), { edits: { '1': { rsv: 'keswt01' } } }, SETTINGS2).rsv).toEqual({ kind: 'keswt01', source: 'hand', at: null })
  })

  it("AC-5502.2: 직접 고른 'none'은 목록과 상관없이 직접 고른 값이다", () => {
    expect(one(line('1', { rsv: RSV }), { edits: { '1': { rsv: 'none' } } }, SETTINGS2).rsv).toEqual({ kind: 'none', source: 'hand', at: null })
  })

  it('AC-5502.2: 직접 고른 값이 목록에 없는 id(지운 종류)면 직접 고르지 않은 것처럼 비트를 따른다', () => {
    const local: SunapLocalDay = { edits: { '1': { rsv: 'kdosu01', note: '메모' } } }
    expect(one(line('1', { rsv: RSV }), local).rsv).toEqual({ kind: 'inj', source: 'bit', at: '202611191030' })
    expect(one(line('1', { rsv: ['202611191030', '전화'] }), local).rsv).toEqual({ kind: 'unknown', source: 'bit', at: '202611191030' })
    expect(one(line('1'), local).rsv).toEqual({ kind: 'none', source: 'bit', at: null })
    // 비고는 그대로
    expect(one(line('1'), local).note).toBe('메모')
  })

  it('AC-5502.2: 직접 고른 값이 지운 종류이고 마감 고정값이 있으면 고정값을 따른다', () => {
    expect(one(line('1', { rsv: RSV }), { edits: { '1': { rsv: 'kdosu01' } }, fixed: { '1': 'visit' } }).rsv).toEqual({
      kind: 'visit',
      source: 'bit',
      at: '202611191030',
    })
  })

  it('AC-5502.2: 마감 고정값이 목록에 없는 id(지운 종류)면 unknown이다', () => {
    expect(one(line('1', { rsv: RSV }), { fixed: { '1': 'kdosu01' } }).rsv).toEqual({ kind: 'unknown', source: 'bit', at: '202611191030' })
    expect(one(line('1'), { fixed: { '1': 'kdosu01' } }).rsv).toEqual({ kind: 'unknown', source: 'bit', at: null })
  })

  it("AC-5502.2: 마감 고정값이 목록에 있는 id면 그 값, 'none'·'unknown'은 그대로다", () => {
    expect(one(line('1', { rsv: RSV }), { fixed: { '1': 'kdosu01' } }, SETTINGS2).rsv).toEqual({ kind: 'kdosu01', source: 'bit', at: '202611191030' })
    expect(one(line('1', { rsv: RSV }), { fixed: { '1': 'none' } }, SETTINGS2).rsv).toEqual({ kind: 'none', source: 'bit', at: null })
    expect(one(line('1', { rsv: RSV }), { fixed: { '1': 'unknown' } }, SETTINGS2).rsv).toEqual({ kind: 'unknown', source: 'bit', at: '202611191030' })
  })

  it('AC-5502.2: 처음 마감하면 지운 종류를 직접 고른 줄도 비트를 따른 지금 값이 fixed에 들어간다', () => {
    const local: SunapLocalDay = { edits: { '1': { rsv: 'kdosu01' }, '2': { rsv: 'visit' } } }
    const ledger = buildLedger(replyOf([line('1', { rsv: RSV }), line('2', { rsv: RSV })]), local, SETTINGS)
    expect(closeLocal(local, ledger, new Date('2026-11-16T09:52:00.000Z')).fixed).toEqual({ '1': 'inj' })
  })
})

describe('AC-5502.3 dayTotals — 초진·90일 예약은 counts가 참인 종류만', () => {
  const rows = [
    line('1', { kind: 'new', rsv: ['202611181000', '주사'] }),
    line('2', { kind: 'new', rsv: ['202611181000', '경과'] }),
    line('3', { kind: 'new', rsv: ['202611181000', '도수'] }),
    line('4', { kind: 'new', rsv: ['202611181000', '충격파'] }),
    line('5', { kind: 'new', rsv: ['202611181000', '기타'] }),
    line('6', { kind: 'new', rsv: ['202611181000', '전화'] }),
    line('7', { kind: 'new' }),
    line('8', { kind: 'd90', rsv: ['202611181000', '도수'] }),
    line('9', { kind: 'd90', rsv: ['202611181000', '충격파'] }),
    line('10', { kind: 're', rsv: ['202611181000', '도수'] }),
  ]

  it('AC-5502.3: 새 종류도 counts가 참이면 세고 거짓이면 안 센다(unknown·none은 늘 안 센다)', () => {
    const ledger = buildLedger(replyOf(rows), {}, SETTINGS2)
    expect(ledger.rows.map((row) => row.rsv.kind)).toEqual(['inj', 'visit', 'kdosu01', 'keswt01', 'etc', 'unknown', 'none', 'kdosu01', 'keswt01', 'kdosu01'])
    expect(dayTotals(ledger, KINDS2)).toMatchObject({ first_n: 7, d90_n: 2, ret_n: 1, rsv_first: 3, rsv_d90: 1 })
  })

  it('AC-5502.3: 기본 종류도 counts를 따른다(주사치료·진료(경과) ✕·기타 ○로 바꾸면 기타만 센다)', () => {
    const flipped: RsvKindDef[] = [
      { ...KINDS[0], counts: false },
      { ...KINDS[1], counts: false },
      { ...KINDS[2], counts: true },
    ]
    const ledger = buildLedger(replyOf(rows), {}, { ...SETTINGS, kinds: flipped })
    expect(dayTotals(ledger, flipped)).toMatchObject({ rsv_first: 1, rsv_d90: 0 })
  })

  it('AC-5502.3: counts인 종류가 하나도 없으면 0이다', () => {
    const none = KINDS2.map((kind) => ({ ...kind, counts: false }))
    expect(dayTotals(buildLedger(replyOf(rows), {}, { ...SETTINGS, kinds: none }), none)).toMatchObject({ rsv_first: 0, rsv_d90: 0 })
  })

  it('AC-5502.3: 종류 목록을 주지 않으면 기본 목록(주사치료·진료(경과))이다 — 지금 숫자와 같다', () => {
    const ledger = buildLedger(replyOf(rows), {}, SETTINGS2)
    expect(dayTotals(ledger)).toEqual(dayTotals(ledger, DEFAULT_RSV_KINDS))
    expect(dayTotals(ledger)).toMatchObject({ rsv_first: 2, rsv_d90: 0 })
    expect(dayTotals(buildLedger(MOCK_REPLY, MOCK_LOCAL, SETTINGS), KINDS)).toEqual(dayTotals(buildLedger(MOCK_REPLY, MOCK_LOCAL, SETTINGS)))
  })

  it('AC-5502.3: 직접 고른 새 종류도 counts로 센다', () => {
    const local: SunapLocalDay = { edits: { '6': { rsv: 'kdosu01' }, '7': { rsv: 'keswt01' } } }
    expect(dayTotals(buildLedger(replyOf(rows), local, SETTINGS2), KINDS2)).toMatchObject({ rsv_first: 4 })
  })
})

describe('AC-4901.5 dayTotals — 서버 숫자 24칸', () => {
  it('AC-4901.5: 숫자 칸은 design.md sunap_days의 24칸이다', () => {
    expect(SUNAP_TOTAL_KEYS).toEqual([
      'visits', 'first_n', 'd90_n', 'ret_n', 'block_n', 'pt_n', 'rsv_first', 'rsv_d90', 'first_block', 'd90_block', 'ret_block',
      'cash_n', 'cash_won', 'card_n', 'card_won', 'transfer_n', 'transfer_won',
      'paid_cash_n', 'paid_cash_won', 'paid_card_n', 'paid_card_won', 'free_n', 'unpaid_n', 'unpaid_won',
    ])
    expect(Object.keys(dayTotals(buildLedger(replyOf([]), {}, SETTINGS))).sort()).toEqual([...SUNAP_TOTAL_KEYS].sort())
  })

  it('AC-4901.5: 시안 예(design.md "예") — 16줄의 합', () => {
    expect(dayTotals(buildLedger(MOCK_REPLY, MOCK_LOCAL, SETTINGS))).toEqual({
      visits: 16,
      first_n: 4,
      d90_n: 2,
      ret_n: 10,
      block_n: 7,
      pt_n: 13,
      rsv_first: 3,
      rsv_d90: 2,
      first_block: 2,
      d90_block: 1,
      ret_block: 4,
      cash_n: 4,
      cash_won: 25600,
      card_n: 10,
      card_won: 193600,
      transfer_n: 1,
      transfer_won: 25000,
      paid_cash_n: 1,
      paid_cash_won: 10000,
      paid_card_n: 1,
      paid_card_won: 15000,
      free_n: 1,
      unpaid_n: 1,
      unpaid_won: 16300,
    })
  })

  it('AC-4901.5: 빈 장부는 모두 0이다', () => {
    const totals = dayTotals(buildLedger(replyOf([]), {}, SETTINGS))
    expect(Object.values(totals).every((n) => n === 0)).toBe(true)
  })

  it('AC-4901.5: 초진·90일 예약은 inj·visit만 센다(etc·unknown·none은 안 든다)', () => {
    const rows = [
      line('1', { kind: 'new', rsv: ['202611181000', '주사'] }),
      line('2', { kind: 'new', rsv: ['202611181000', '경과'] }),
      line('3', { kind: 'new', rsv: ['202611181000', '기타'] }),
      line('4', { kind: 'new', rsv: ['202611181000', '전화'] }),
      line('5', { kind: 'new' }),
      line('6', { kind: 'd90', rsv: ['202611181000', '진료'] }),
      line('7', { kind: 'd90', rsv: ['202611181000', '기타'] }),
      line('8', { kind: 're', rsv: ['202611181000', '주사'] }),
    ]
    const totals = dayTotals(buildLedger(replyOf(rows), {}, SETTINGS))
    expect(totals).toMatchObject({ first_n: 5, d90_n: 2, ret_n: 1, rsv_first: 2, rsv_d90: 1 })
  })

  it('AC-4901.5: 초진·90일·재진 + Block은 그 구분 줄 중 Block 줄 수다(고친 Block 포함)', () => {
    const rows = [
      line('1', { kind: 'new', codes: ['MM110'] }),
      line('2', { kind: 'new' }),
      line('3', { kind: 'd90', codes: ['MM110'] }),
      line('4', { kind: 're', codes: ['MM110'] }),
      line('5', { kind: 're' }),
    ]
    const totals = dayTotals(buildLedger(replyOf(rows), { edits: { '5': { block: true }, '1': { block: false } } }, SETTINGS))
    expect(totals).toMatchObject({ block_n: 3, first_block: 0, d90_block: 1, ret_block: 2 })
  })

  it('AC-4901.5: 결제 건수는 그 칸이 0원이 아닌 줄 수, 금액은 그 칸의 합이고 FREE는 네 칸 다 0원인 줄이다', () => {
    const rows = [
      line('1', { cash: 1000, card: 2000 }),
      line('2', { cash: 0, card: 0 }),
      line('3', { cash: 0, card: 0, transfer: 3000, unpaid: 400 }),
      line('4', { cash: 0, card: 0 }),
    ]
    const totals = dayTotals(buildLedger(replyOf(rows), {}, SETTINGS))
    expect(totals).toMatchObject({
      visits: 4,
      cash_n: 1,
      cash_won: 1000,
      card_n: 1,
      card_won: 2000,
      transfer_n: 1,
      transfer_won: 3000,
      unpaid_n: 1,
      unpaid_won: 400,
      free_n: 2,
    })
  })

  it('AC-4901.5: 미수 입금은 paid 줄에서 현금·카드 따로 세고 내원 수에 넣지 않는다', () => {
    const reply = replyOf([line('1')], {
      paid: [
        ['20788', '문○○', '11:20', 10000, 0],
        ['11530', '배○○', '15:42', 0, 15000],
        ['11531', '노○○', '16:00', 2000, 3000],
      ],
    })
    expect(dayTotals(buildLedger(reply, {}, SETTINGS))).toMatchObject({
      visits: 1,
      paid_cash_n: 2,
      paid_cash_won: 12000,
      paid_card_n: 2,
      paid_card_won: 18000,
      cash_n: 0,
      card_n: 1,
    })
  })
})

describe('AC-4901.6 closeLocal·reopenLocal — 처음 마감 때 예약 고정, 늦은 마감 표시', () => {
  // 2026-11-16 18:52 한국 시각
  const EVENING = new Date('2026-11-16T09:52:00.000Z')

  it('AC-4901.6: 처음 마감이면 직접 고른 줄을 뺀 줄의 지금 예약 종류가 fixed에 들어간다', () => {
    const ledger = buildLedger(MOCK_REPLY, MOCK_LOCAL, SETTINGS)
    const closed = closeLocal(MOCK_LOCAL, ledger, EVENING)
    expect(closed.fixed).toEqual({
      '10231': 'inj',
      '10877': 'none',
      '21004': 'visit',
      '19870': 'inj',
      '10013': 'none',
      '21005': 'none',
      '15220': 'unknown',
      '10498': 'inj',
      '12740': 'none',
      '18603': 'visit',
      '10344': 'inj',
      '21007': 'inj',
      '11902': 'none',
      '16455': 'visit',
    })
    expect(closed.closedAt).toBe('2026-11-16T09:52:00.000Z')
    expect(closed.late).toBe(false)
    expect(closed.edits).toEqual(MOCK_LOCAL.edits)
  })

  it('AC-4901.6: late = 한국 날짜로 now가 그 날보다 뒤', () => {
    const ledger = buildLedger(replyOf([line('1')], { day: '2026-11-13' }), {}, SETTINGS)
    expect(closeLocal({}, ledger, EVENING).late).toBe(true)
    const today = buildLedger(replyOf([line('1')]), {}, SETTINGS)
    // 23:59 한국 시각은 아직 그날, 다음 날 00:30은 늦은 마감
    expect(closeLocal({}, today, new Date('2026-11-16T14:59:00.000Z')).late).toBe(false)
    expect(closeLocal({}, today, new Date('2026-11-16T15:30:00.000Z')).late).toBe(true)
  })

  it('AC-4901.6: 이미 fixed가 있으면 fixed·late를 그대로 두고 마감 시각만 새로 적는다', () => {
    const local: SunapLocalDay = { fixed: { '1': 'none' }, late: true }
    const ledger = buildLedger(replyOf([line('1', { rsv: ['202611181000', '주사'] }), line('2')]), local, SETTINGS)
    const closed = closeLocal(local, ledger, EVENING)
    expect(closed).toEqual({ fixed: { '1': 'none' }, late: true, closedAt: '2026-11-16T09:52:00.000Z' })
    // 비어 있는 fixed도 '이미 있음'이다
    expect(closeLocal({ fixed: {}, late: false }, ledger, new Date('2026-11-20T01:00:00.000Z'))).toEqual({
      fixed: {},
      late: false,
      closedAt: '2026-11-20T01:00:00.000Z',
    })
  })

  it('AC-4901.6: 마감한 뒤 비트 예약이 바뀌어도 장부의 예약은 고정값이다', () => {
    const before = buildLedger(replyOf([line('1'), line('2', { rsv: ['202611181000', '전화'] })]), {}, SETTINGS)
    const closed = closeLocal({}, before, EVENING)
    const after = buildLedger(replyOf([line('1', { rsv: ['202611201000', '주사'] }), line('2', { rsv: ['202611181000', '주사'] })]), closed, SETTINGS)
    expect(after.rows.map((row) => row.rsv.kind)).toEqual(['none', 'unknown'])
  })

  it('AC-4901.6: reopenLocal은 closedAt만 지우고 fixed·late·고친 칸은 남긴다', () => {
    const local: SunapLocalDay = { edits: { '1': { cash: 1 } }, closedAt: '2026-11-16T09:52:00.000Z', late: true, fixed: { '1': 'inj' } }
    const opened = reopenLocal(local)
    expect(opened).toEqual({ edits: { '1': { cash: 1 } }, late: true, fixed: { '1': 'inj' } })
    expect('closedAt' in opened).toBe(false)
    expect(buildLedger(replyOf([line('1')]), opened, SETTINGS).closedAt).toBeNull()
  })

  it('AC-4901.6: 받은 PC 저장을 바꾸지 않는다', () => {
    const local: SunapLocalDay = { edits: { '1': { rsv: 'inj' } } }
    const copy = structuredClone(local)
    const ledger = buildLedger(replyOf([line('1')]), local, SETTINGS)
    const closed = closeLocal(local, ledger, EVENING)
    expect(local).toEqual(copy)
    reopenLocal(closed)
    expect(closed.closedAt).toBe('2026-11-16T09:52:00.000Z')
  })
})

describe('AC-4901.7 parseWon — 금액 칸 글자 → 원 정수(0~99,999,999)', () => {
  it.each([
    ['12,000', 12000],
    ['12000원', 12000],
    ['', 0],
    ['   ', 0],
    ['0', 0],
    [' 3,500 ', 3500],
    ['3,500 원', 3500],
    ['99,999,999', 99999999],
  ] as const)('AC-4901.7: "%s" → %i', (text, won) => {
    expect(parseWon(text)).toBe(won)
  })

  it.each(['-1', '1억', '100000000', '100,000,000', '12.5', 'abc', '원', '1 000', '+5'])('AC-4901.7: "%s" → invalid', (text) => {
    expect(parseWon(text)).toBe('invalid')
  })
})

// ── 원장님별 (spec sunap-doctors REQ-5001) ─────────────────────────────
// 시안 16줄에 원장님 코드를 붙인 도우미 0.9.0(v2) 답: D01 김○○ 7줄, D02 이○○ 6줄, 진료의 미지정(null) 3줄. 이름·코드는 지어낸 값이다

const RATE_KEYS = ['visits', 'first_n', 'd90_n', 'ret_n', 'block_n', 'pt_n', 'first_block', 'd90_block', 'ret_block'] as const
const ratesOf = (totals: SunapTotals): SunapRates => Object.fromEntries(RATE_KEYS.map((key) => [key, totals[key]])) as SunapRates
const DOCTOR_OF: (string | null)[] = ['D01', 'D02', 'D01', 'D02', 'D01', 'D02', null, 'D01', 'D02', null, 'D01', 'D02', 'D02', 'D01', null, 'D01']
const NAMES: SunapReplyDoctor[] = [
  ['D01', '김○○'],
  ['D02', '이○○'],
]
const v2Of = (rows: [SunapReplyRow, string | null][], doctors: SunapReplyDoctor[]): SunapReply => ({
  v: 2,
  day: DAY,
  unsure: false,
  rows: rows.map(([row, doctor]): SunapReplyRowV2 => [...row, doctor]),
  paid: [],
  doctors,
})
const MOCK_V2: SunapReply = {
  ...v2Of(
    MOCK_ROWS.map((row, at) => [row, DOCTOR_OF[at]]),
    NAMES,
  ),
  paid: MOCK_REPLY.paid,
}
// 원장님 코드만 다른 줄들(재진 · Block·물리치료 없음)
const linesOf = (doctors: (string | null)[]) => doctors.map((doctor, at): [SunapReplyRow, string | null] => [line(String(at + 1)), doctor])
const summary = (ledger: Ledger, names?: SunapReplyDoctor[]) =>
  (names === undefined ? ledgerDoctors(ledger) : ledgerDoctors(ledger, names))?.rows.map((row) => [row.code, row.label, row.rates.visits]) ?? null

describe('AC-5001.1 buildLedger v2·ledgerDoctors — 장부 값으로 원장님마다 아홉 칸', () => {
  it('AC-5001.1: v2 답이면 줄마다 doctor는 끝 칸, 장부 doctors는 답의 목록이다. v1 답이면 null·빈 목록이다', () => {
    const ledger = buildLedger(MOCK_V2, MOCK_LOCAL, SETTINGS)
    expect(ledger.rows.map((row) => row.doctor)).toEqual(DOCTOR_OF)
    expect(ledger.doctors).toEqual(NAMES)
    const old = buildLedger(MOCK_REPLY, MOCK_LOCAL, SETTINGS)
    expect(old.rows.every((row) => row.doctor === null)).toBe(true)
    expect(old.doctors).toEqual([])
  })

  it('AC-5001.1: v2 답도 다른 칸은 v1 답과 글자 그대로 같고, 받은 답을 바꾸지 않는다', () => {
    const reply = structuredClone(MOCK_V2)
    const ledger = buildLedger(reply, MOCK_LOCAL, SETTINGS)
    const old = buildLedger(MOCK_REPLY, MOCK_LOCAL, SETTINGS)
    expect(ledger.rows.map((row) => ({ ...row, doctor: null }))).toEqual(old.rows)
    expect(dayTotals(ledger)).toEqual(dayTotals(old))
    expect(reply).toEqual(MOCK_V2)
  })

  it('AC-5001.1: 시안 16줄 — 원장님마다 아홉 칸(직원이 고친 Block 포함)이고 합계는 dayTotals 아홉 칸과 같다', () => {
    const ledger = buildLedger(MOCK_V2, MOCK_LOCAL, SETTINGS)
    const doctors = ledgerDoctors(ledger)
    expect(doctors).toEqual({
      rows: [
        {
          code: 'D01',
          label: '김○○',
          rates: { visits: 7, first_n: 2, d90_n: 1, ret_n: 4, block_n: 5, pt_n: 5, first_block: 2, d90_block: 1, ret_block: 2 },
        },
        {
          code: 'D02',
          label: '이○○',
          // 13번 줄(10344)은 직원이 Block으로 고쳤다
          rates: { visits: 6, first_n: 0, d90_n: 1, ret_n: 5, block_n: 2, pt_n: 5, first_block: 0, d90_block: 0, ret_block: 2 },
        },
        {
          code: null,
          label: '진료의 미지정',
          rates: { visits: 3, first_n: 2, d90_n: 0, ret_n: 1, block_n: 0, pt_n: 3, first_block: 0, d90_block: 0, ret_block: 0 },
        },
      ],
      total: { visits: 16, first_n: 4, d90_n: 2, ret_n: 10, block_n: 7, pt_n: 13, first_block: 2, d90_block: 1, ret_block: 4 },
    })
    expect(doctors?.total).toEqual(ratesOf(dayTotals(ledger)))
  })

  it('AC-5001.1: Block·물리치료를 고치면 그 원장님 수가 바뀌고, 합계는 여전히 dayTotals 아홉 칸과 같다', () => {
    const local: SunapLocalDay = { edits: { ...MOCK_LOCAL.edits, '10877': { block: true, pt: false } } }
    const ledger = buildLedger(MOCK_V2, local, SETTINGS)
    const doctors = ledgerDoctors(ledger)
    expect(doctors?.rows[1]).toMatchObject({ code: 'D02', rates: { visits: 6, block_n: 3, ret_block: 3, pt_n: 4 } })
    expect(doctors?.rows[0].rates).toMatchObject({ block_n: 5, pt_n: 5 })
    expect(doctors?.total).toEqual(ratesOf(dayTotals(ledger)))
  })
})

describe('AC-5001.2 ledgerDoctors — 원장님(미지정 빼고)이 두 분 이상일 때만', () => {
  it('AC-5001.2: 옛 도우미 답(v1 — 모든 줄 null)이면 null이다', () => {
    expect(ledgerDoctors(buildLedger(MOCK_REPLY, MOCK_LOCAL, SETTINGS))).toBeNull()
  })

  it('AC-5001.2: 원장님 한 분(미지정 줄이 있어도)·모든 줄 미지정·빈 장부는 null이다', () => {
    expect(ledgerDoctors(buildLedger(v2Of(linesOf(['D01', 'D01', null]), NAMES), {}, SETTINGS))).toBeNull()
    expect(ledgerDoctors(buildLedger(v2Of(linesOf([null, null]), []), {}, SETTINGS))).toBeNull()
    expect(ledgerDoctors(buildLedger(v2Of([], NAMES), {}, SETTINGS))).toBeNull()
  })

  it('AC-5001.2: 두 분 이상이면 null 원장님은 "진료의 미지정" 줄로 함께 나온다', () => {
    const ledger = buildLedger(v2Of(linesOf(['D01', 'D02', null, 'D01']), NAMES), {}, SETTINGS)
    expect(summary(ledger)).toEqual([
      ['D01', '김○○', 2],
      ['D02', '이○○', 1],
      [null, '진료의 미지정', 1],
    ])
    // 미지정 줄이 없으면 그 줄도 없다
    expect(summary(buildLedger(v2Of(linesOf(['D01', 'D02']), NAMES), {}, SETTINGS))).toEqual([
      ['D01', '김○○', 1],
      ['D02', '이○○', 1],
    ])
  })
})

describe('AC-5001.3 ledgerDoctors — 이름은 이름 → 코드 → 진료의 미지정, 차례는 내원 많은 차례 · 같으면 이름 글자 차례', () => {
  it('AC-5001.3: 이름이 없으면(null·목록에 없음) 코드가 줄 이름이다', () => {
    const ledger = buildLedger(v2Of(linesOf(['D01', 'D01', 'D01', 'D02', 'D02', 'D03', null]), [['D01', '김○○'], ['D02', null]]), {}, SETTINGS)
    expect(summary(ledger)).toEqual([
      ['D01', '김○○', 3],
      ['D02', 'D02', 2],
      ['D03', 'D03', 1],
      [null, '진료의 미지정', 1],
    ])
  })

  it('AC-5001.3: 내원이 같으면 이름 글자 차례다(코드 차례가 아니다)', () => {
    const names: SunapReplyDoctor[] = [
      ['D01', '이○○'],
      ['D02', '김○○'],
      ['D03', '박○○'],
    ]
    const ledger = buildLedger(v2Of(linesOf(['D01', 'D02', 'D03', 'D03', 'D03', null, null, 'D01', 'D02']), names), {}, SETTINGS)
    expect(summary(ledger)).toEqual([
      ['D03', '박○○', 3],
      ['D02', '김○○', 2],
      ['D01', '이○○', 2],
      [null, '진료의 미지정', 2],
    ])
  })

  it('AC-5001.3: names를 따로 주면 그 이름을 쓴다(주지 않으면 장부의 doctors)', () => {
    const ledger = buildLedger(v2Of(linesOf(['D01', 'D02']), NAMES), {}, SETTINGS)
    expect(summary(ledger, [['D01', '최○○']])).toEqual([
      ['D02', 'D02', 1],
      ['D01', '최○○', 1],
    ])
  })
})
