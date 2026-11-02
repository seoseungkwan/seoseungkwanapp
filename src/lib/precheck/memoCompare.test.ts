import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { BitMemos, ClaimMemosJson, MemoCompare, Visit, VisitMemo, VisitMemoView } from '@/types/precheck'
import { bitMemoOf, compareMemo, dayMemoCounts, inputPlan, readBitMemos, visitMemos } from './memoCompare'

// 비트 메모 비교(REQ-016). 메모는 모두 지어낸 것이다.
// 비교 사례는 도우미 시험(helper/tests/Precheck.Core.Tests/Claim/MemoCompare.test.cs)과 같은 파일을 읽는다: 두 쪽이 같은 답을 내야 두 번 입력을 막는다(AC-016.2·AC-035.3)

type SharedCase = { name: string; ours: string; inBit: string | null; expected: MemoCompare }
const SHARED: SharedCase[] = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../helper/tests/Precheck.Core.Tests/Claim/memo-compare-cases.test.json', import.meta.url)), 'utf-8'),
)

describe('AC-016.2 compareMemo: 줄바꿈만 맞추고 글자 그대로', () => {
  it('AC-016.2: 공유 사례 파일이 네 갈래를 모두 담는다', () => {
    expect(new Set(SHARED.map((c) => c.expected))).toEqual(new Set(['같음', '다름', '비트에 없음', '조회 못함']))
  })

  it.each(SHARED.map((c) => [c.name, c] as const))('AC-016.2: 공유 사례 %s', (_, c) => {
    expect(compareMemo(c.ours, c.inBit)).toBe(c.expected)
  })

  it.each([
    ['undefined', undefined],
    ['null', null],
  ])('AC-016.2: %s는 읽지 못한 것이고 빈칸으로 보지 않는다', (_, inBit) => {
    expect(compareMemo('합성 메모', inBit)).toBe('조회 못함')
    expect(compareMemo('', inBit)).toBe('조회 못함')
  })
})

const row = (over: Partial<VisitMemo> & { key: string }): VisitMemo => ({
  date: '2026-10-12',
  text: '우리 메모',
  hasMemo: true,
  unfinished: false,
  compare: '비트에 없음',
  ...over,
})
const keys = (rows: readonly { key: string }[]) => rows.map((r) => r.key)

describe('AC-016.3 inputPlan: 비트에 다른 메모가 있는 진료', () => {
  const OTHER = row({ key: 'v1', compare: '다름', inBit: '비트 메모' })

  it('AC-016.3: 비트에 없으면 replaces 없이 묶음에 든다', () => {
    const plan = inputPlan([row({ key: 'v1' })], false)
    expect(keys(plan.batch)).toEqual(['v1'])
    expect(plan.batch[0]).not.toHaveProperty('replaces')
    expect(plan.done).toEqual([])
    expect(plan.skipped).toEqual([])
  })

  it('AC-016.3: 같으면 완료(이미 입력됨)이고 묶음에 없다', () => {
    const plan = inputPlan([row({ key: 'v1', compare: '같음', inBit: '우리 메모' })], false)
    expect(plan.batch).toEqual([])
    expect(plan.done).toEqual([{ key: 'v1', reason: '이미 입력됨' }])
  })

  it('AC-016.3: 묻지 않기가 꺼져 있으면 승인하지 않은 진료는 건너뜀(이미 있음)이다', () => {
    const plan = inputPlan([OTHER], false)
    expect(plan.batch).toEqual([])
    expect(plan.skipped).toEqual([{ key: 'v1', reason: '이미 있음' }])
  })

  it('AC-016.3: 사람마다 승인한 진료는 승인한 비트 메모를 replaces로 넣는다', () => {
    const plan = inputPlan([{ ...OTHER, approved: '비트 메모' }], false)
    expect(keys(plan.batch)).toEqual(['v1'])
    expect(plan.batch[0].replaces).toBe('비트 메모')
    expect(plan.skipped).toEqual([])
  })

  it('AC-016.3: 묻지 않기가 켜져 있으면 승인하지 않은 진료도 replaces 없이 넣는다', () => {
    const plan = inputPlan([OTHER], true)
    expect(keys(plan.batch)).toEqual(['v1'])
    expect(plan.batch[0]).not.toHaveProperty('replaces')
  })

  it('AC-016.3: 묻지 않기가 켜져 있어도 승인한 진료는 replaces를 싣는다', () => {
    expect(inputPlan([{ ...OTHER, approved: '비트 메모' }], true).batch[0].replaces).toBe('비트 메모')
  })

  it('AC-016.3: 마지막 기록이 skippedByHand면 묻지 않기가 켜져 있어도 빠지고, 승인하면 replaces로 든다', () => {
    const byHand = { ...OTHER, lastJournal: 'skippedByHand' }
    const off = inputPlan([byHand], true)
    expect(off.batch).toEqual([])
    expect(off.skipped).toEqual([{ key: 'v1', reason: '이미 있음' }])
    for (const noAsk of [false, true]) {
      const approved = inputPlan([{ ...byHand, approved: '비트 메모' }], noAsk)
      expect(keys(approved.batch)).toEqual(['v1'])
      expect(approved.batch[0].replaces).toBe('비트 메모')
    }
  })

  it.each(['writing', 'done', 'skipped', 'check', 'writeUnconfirmed'])('AC-016.3: 마지막 기록이 %s이면 묻지 않기를 막지 않는다(skippedByHand만 막는다)', (state) => {
    expect(keys(inputPlan([{ ...OTHER, lastJournal: state }], true).batch)).toEqual(['v1'])
  })

  it('AC-016.3: skippedByHand여도 칸이 비었으면(비트에 없음) 그대로 넣는다', () => {
    expect(keys(inputPlan([row({ key: 'v1', lastJournal: 'skippedByHand' })], false).batch)).toEqual(['v1'])
  })

  it('AC-016.3: 넣는 차례는 받은 차례 그대로다', () => {
    const plan = inputPlan([row({ key: 'v2' }), { ...OTHER, key: 'v3', approved: 'x' }, row({ key: 'v1' })], false)
    expect(keys(plan.batch)).toEqual(['v2', 'v3', 'v1'])
  })
})

describe('AC-016.2 inputPlan: 조회 못함은 빈칸이 아니다', () => {
  it.each([false, true])('AC-016.2: 조회 못함은 묻지 않기(%s)와 승인에 상관없이 묶음에 없다', (noAsk) => {
    const plan = inputPlan([row({ key: 'v1', compare: '조회 못함' }), row({ key: 'v2', compare: '조회 못함', approved: '옛 글' })], noAsk)
    expect(plan.batch).toEqual([])
    expect(plan.skipped).toEqual([
      { key: 'v1', reason: '조회 못함' },
      { key: 'v2', reason: '조회 못함' },
    ])
  })
})

describe('AC-016.3 inputPlan: 메모가 없는 진료는 글자가 아니라 hasMemo로 가른다', () => {
  // 메모가 없는 날에 사람이 직접 친 글: 글자는 있고 hasMemo는 거짓, unfinished도 거짓이다
  const TYPED = { hasMemo: false, text: '사람이 직접 친 글', unfinished: false }

  it.each([false, true])('AC-016.3: 메모 없는 날에 사람이 친 글은 묶음에 들지 않는다(묻지 않기 %s)', (noAsk) => {
    const plan = inputPlan(
      [row({ key: 'v1', ...TYPED }), row({ key: 'v2', ...TYPED, compare: '다름', inBit: '다른 글' }), row({ key: 'v3', ...TYPED, compare: '다름', inBit: '다른 글', approved: '다른 글' })],
      noAsk,
    )
    expect(plan.batch).toEqual([])
    expect(plan.skipped).toEqual([
      { key: 'v1', reason: '메모 없음' },
      { key: 'v2', reason: '메모 없음' },
      { key: 'v3', reason: '메모 없음' },
    ])
  })

  it('AC-016.3: 메모 없는 진료도 비트와 같으면 완료가 앞선다(AC-018.26 차례)', () => {
    const plan = inputPlan([row({ key: 'v1', ...TYPED, compare: '같음', inBit: TYPED.text })], false)
    expect(plan.done).toEqual([{ key: 'v1', reason: '이미 입력됨' }])
    expect(plan.skipped).toEqual([])
  })

  it.each(['', '   ', '\r\n\t'])('AC-016.3: 메모가 있어야 하는 진료인데 글이 공백뿐(%j)이면 넣지 않는다(빈 메모 하나가 묶음 전체를 거절시키지 않게, AC-017.1)', (text) => {
    const plan = inputPlan([row({ key: 'v1', text }), row({ key: 'v2' })], true)
    expect(keys(plan.batch)).toEqual(['v2'])
    expect(plan.skipped).toEqual([{ key: 'v1', reason: '메모 없음' }])
  })

  it('AC-016.3: 확인 표시가 남은 메모는 묻지 않기·승인과 상관없이 넣지 않는다(AC-018.26 차례: 조회 못함·다름보다 앞선다)', () => {
    const plan = inputPlan(
      [
        row({ key: 'v1', unfinished: true }),
        row({ key: 'v2', unfinished: true, compare: '다름', inBit: '다른 글', approved: '다른 글' }),
        row({ key: 'v3', unfinished: true, compare: '조회 못함' }),
      ],
      true,
    )
    expect(plan.batch).toEqual([])
    expect(plan.skipped.map((s) => s.reason)).toEqual(['확인 표시', '확인 표시', '확인 표시'])
  })
})

describe('AC-016.4 dayMemoCounts: 날짜마다 메모 필요 수·입력 수·이미 있음 수', () => {
  it('AC-016.4: 날짜 차례로 센다', () => {
    const counts = dayMemoCounts([
      row({ key: 'b1', date: '2026-10-13', compare: '같음' }),
      row({ key: 'a1', date: '2026-10-12', compare: '같음' }),
      row({ key: 'a2', date: '2026-10-12', compare: '다름' }),
      row({ key: 'a3', date: '2026-10-12', compare: '비트에 없음' }),
      row({ key: 'a4', date: '2026-10-12', compare: '조회 못함' }),
    ])
    expect(counts).toEqual([
      { date: '2026-10-12', needMemo: 4, entered: 1, already: 1 },
      { date: '2026-10-13', needMemo: 1, entered: 1, already: 0 },
    ])
  })

  it('AC-016.4: 메모 필요 수는 글자가 아니라 hasMemo로 센다. 사람이 친 글이 있어도 메모 없는 진료는 세지 않는다', () => {
    expect(dayMemoCounts([row({ key: 'a1', hasMemo: false, text: '사람이 직접 친 글' }), row({ key: 'a2', hasMemo: true, text: '' })])).toEqual([
      { date: '2026-10-12', needMemo: 1, entered: 0, already: 0 },
    ])
  })

  // DB 제약(design.md 8-2, AC-019.2): entered는 need_memo를 넘을 수 없다
  it.each<MemoCompare>(['같음', '다름'])('AC-016.4: 메모 없는 진료가 %s여도 입력 수·이미 있음 수에 넣지 않아 입력 수가 메모 필요 수를 넘지 않는다', (compare) => {
    expect(dayMemoCounts([row({ key: 'a1', hasMemo: false, compare })])).toEqual([{ date: '2026-10-12', needMemo: 0, entered: 0, already: 0 }])
  })

  it('AC-016.4: 진료가 있었으나 메모가 필요 없는 날도 0으로 남는다(아직 안 불러온 날로 보이지 않게)', () => {
    expect(dayMemoCounts([row({ key: 'a1', hasMemo: false })]).map((d) => d.date)).toEqual(['2026-10-12'])
    expect(dayMemoCounts([])).toEqual([])
  })
})

const json = (over: Record<string, unknown> = {}): Record<string, unknown> =>
  ({ version: 1, period: { from: '2026-10-12', to: '2026-10-13' }, truncated: false, invalidRows: 0, rows: [{ v: 'v1', p: '000123', d: '2026-10-12', m: '비트 메모' }], ...over }) satisfies Partial<Record<keyof ClaimMemosJson, unknown>>

describe('AC-016.1·AC-016.6 readBitMemos: claim.memos 답의 모양', () => {
  it('AC-016.6: 바른 답은 내원번호로 찾을 수 있게 받는다', () => {
    const read = readBitMemos(json())
    expect(read.ok).toBe(true)
    if (!read.ok) return
    expect(read.value.period).toEqual({ from: '2026-10-12', to: '2026-10-13' })
    expect(read.value.rows.size).toBe(1)
  })

  it('AC-016.1: truncated면 E-CLAIM-PARTIAL로 멈춘다', () => {
    expect(readBitMemos(json({ truncated: true }))).toEqual({ ok: false, code: 'E-CLAIM-PARTIAL' })
  })

  it.each([1, 300_000])('AC-016.6: invalidRows가 %i이면 E-CLAIM-PARTIAL로 멈춘다(읽지 못한 줄을 비트에 없음으로 보지 않게)', (invalidRows) => {
    expect(readBitMemos(json({ invalidRows }))).toEqual({ ok: false, code: 'E-CLAIM-PARTIAL' })
  })

  it.each<[string, unknown]>([
    ['객체가 아님', []],
    ['null', null],
    ['판이 다름', json({ version: 2 })],
    ['기간 없음', json({ period: undefined })],
    ['기간 모양이 틀림', json({ period: { from: '20261012', to: '2026-10-13' } })],
    ['truncated 칸 없음', json({ truncated: undefined })],
    ['invalidRows 칸 없음', json({ invalidRows: undefined })],
    ['rows 없음', json({ rows: undefined })],
    ['rows가 배열이 아님', json({ rows: {} })],
    ['줄이 객체가 아님', json({ rows: ['v1'] })],
    ['메모가 글자가 아님', json({ rows: [{ v: 'v1', p: '1', d: '2026-10-12', m: 1 }] })],
    ['차트번호 칸 없음', json({ rows: [{ v: 'v1', d: '2026-10-12', m: 'x' }] })],
  ])('AC-016.6: 모양이 틀리면(%s) E-CLAIM-PARTIAL', (_, raw) => {
    expect(readBitMemos(raw)).toEqual({ ok: false, code: 'E-CLAIM-PARTIAL' })
  })

  it('AC-016.6: 오류에 환자 글자를 싣지 않는다', () => {
    expect(JSON.stringify(readBitMemos(json({ truncated: true })))).not.toContain('비트 메모')
  })
})

describe('AC-016.6 bitMemoOf: 줄은 내원번호로 맞추고 차트번호가 다르면 쓰지 않는다', () => {
  const read = readBitMemos(json())
  if (!read.ok) throw new Error(read.code)
  const MEMOS: BitMemos = read.value
  const visit = (over: Partial<Pick<Visit, 'key' | 'chart' | 'date'>> = {}) => ({ key: 'v1', chart: '123', date: '2026-10-12', ...over })

  it('AC-016.6: 차트번호는 앞 0을 무시한다', () => {
    expect(bitMemoOf(MEMOS, visit())).toBe('비트 메모')
    expect(bitMemoOf(MEMOS, visit({ chart: '000123' }))).toBe('비트 메모')
  })

  it('AC-016.6: 차트번호가 다른 줄은 읽지 못한 것이다(비트에 없음이 아니다)', () => {
    expect(bitMemoOf(MEMOS, visit({ chart: '124' }))).toBeUndefined()
    expect(compareMemo('우리 메모', bitMemoOf(MEMOS, visit({ chart: '124' })))).toBe('조회 못함')
  })

  it('AC-016.6: 읽은 기간 안에 줄이 없으면 비어 있는 것이다', () => {
    expect(compareMemo('우리 메모', bitMemoOf(MEMOS, visit({ key: 'v2' })))).toBe('비트에 없음')
  })

  // claim.month는 고른 기간보다 앞쪽까지 읽고 claim.memos는 고른 기간만 읽는다(AC-013.13). 읽지 않은 날을 비었다고 보면 두 번 입력한다
  it.each(['2026-10-11', '2026-10-14'])('AC-016.2: 비트 메모를 읽은 기간 밖의 진료(%s)는 줄이 없어도 조회 못함이다', (date) => {
    expect(bitMemoOf(MEMOS, visit({ key: 'v2', date }))).toBeUndefined()
    expect(bitMemoOf(MEMOS, visit({ date }))).toBeUndefined()
  })

  it.each(['2026-10-12', '2026-10-13'])('AC-016.6: 기간의 처음과 끝 날(%s)은 읽은 기간 안이다', (date) => {
    expect(bitMemoOf(MEMOS, visit({ key: 'v2', date }))).toBe('')
  })

  it('AC-016.8: 받은 자료가 없으면 읽지 못한 것이다', () => {
    expect(bitMemoOf(null, visit())).toBeUndefined()
  })
})

describe('AC-016.6·AC-016.7 visitMemos: 진료마다 비교 상태', () => {
  const memosOf = (rows: { v: string; p: string; m: string }[]) => {
    const read = readBitMemos(json({ rows: rows.map((r) => ({ ...r, d: '2026-10-12' })) }))
    if (!read.ok) throw new Error(read.code)
    return read.value
  }
  const visit = (key: string, chart: string, memosInBit: string[] = []): Visit => ({ key, chart, date: '2026-10-12', month: '2026-10', name: '가상환자01', lines: [], hints: [], rx: [], dx: [], memosInBit })
  const view = (visitKey: string, text = '우리 메모'): VisitMemoView => ({ visitKey, text, edited: false, missing: [], hasMemo: true, unfinished: false })
  const none = new Map<string, string>()

  it('AC-016.6: 비교는 claim.memos로만 한다. 500자에서 잘린 memosInBit을 쓰지 않는다', () => {
    const long = '글'.repeat(600)
    const memos = memosOf([{ v: 'v1', p: '1', m: long }])
    const rows = visitMemos([visit('v1', '1', [long.slice(0, 500)]), visit('v2', '2', ['우리 메모'])], [view('v1', long), view('v2')], { atLoad: memos, latest: memos, journal: none })
    expect(rows.map((r) => r.compare)).toEqual(['같음', '비트에 없음'])
    expect(rows[0].inBit).toBe(long)
    expect(rows[1]).not.toHaveProperty('inBit')
  })

  it('AC-016.7: 처음 조회 못함이던 진료는 다시 받은 자료에 맞는 줄이 있어도 그대로다', () => {
    const atLoad = memosOf([{ v: 'v1', p: '999', m: '남의 메모' }])
    const latest = memosOf([{ v: 'v1', p: '1', m: '우리 메모' }])
    const rows = visitMemos([visit('v1', '1')], [view('v1')], { atLoad, latest, journal: none })
    expect(rows[0].compare).toBe('조회 못함')
    expect(rows[0]).not.toHaveProperty('inBit')
  })

  it('AC-016.3: 입력 기록의 마지막 값을 진료마다 싣는다', () => {
    const memos = memosOf([{ v: 'v1', p: '1', m: '비트 메모' }])
    const rows = visitMemos([visit('v1', '1'), visit('v2', '2')], [view('v1'), view('v2')], { atLoad: memos, latest: memos, journal: new Map([['v1', 'skippedByHand']]) })
    expect(rows[0].lastJournal).toBe('skippedByHand')
    expect(rows[1]).not.toHaveProperty('lastJournal')
  })

  it('AC-016.3: 승인은 지금 보이는 비트 메모와 같을 때만 친다(글이 바뀌면 묶음에 replaces로 들지 않는다, AC-018.14)', () => {
    const memos = memosOf([{ v: 'v1', p: '1', m: '새 비트 메모' }])
    const stale = visitMemos([visit('v1', '1')], [view('v1')], { atLoad: memos, latest: memos, journal: none, approved: new Map([['v1', '옛 비트 메모']]) })
    expect(stale[0]).not.toHaveProperty('approved')
    expect(inputPlan(stale, false).skipped).toEqual([{ key: 'v1', reason: '이미 있음' }])
    const same = visitMemos([visit('v1', '1')], [view('v1')], { atLoad: memos, latest: memos, journal: none, approved: new Map([['v1', '새 비트 메모']]) })
    expect(inputPlan(same, false).batch[0].replaces).toBe('새 비트 메모')
  })

  it('AC-014.8: 메모를 만들지 않은 진료는 줄이 없다', () => {
    const memos = memosOf([])
    expect(visitMemos([visit('v1', '1')], [], { atLoad: memos, latest: memos, journal: none })).toEqual([])
  })
})
