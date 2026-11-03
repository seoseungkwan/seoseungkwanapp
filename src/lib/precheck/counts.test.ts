import { describe, expect, it } from 'vitest'
import type { VisitMemo } from '@/types/precheck'
import { dayCounts, readCountsMessage, type CountsView } from './counts'

// 날짜별 건수(AC-019.3). 입력은 Worker의 비교 줄이고, 나가는 것은 날짜와 정수뿐이다. 이름·차트번호·메모 글은 지어낸 것이다

const DAY = '2026-10-12'
const row = (key: string, over: Partial<VisitMemo> = {}): VisitMemo => ({ key, date: DAY, text: '가상환자 메모 글', hasMemo: true, unfinished: false, compare: '비트에 없음', ...over })
const view = (rows: VisitMemo[], over: Partial<CountsView> = {}): CountsView => ({ rows, finished: new Set(), results: new Map(), ...over })

describe('AC-019.3 dayCounts', () => {
  it('AC-019.3: 날짜마다 정해 둔 5칸과 정수뿐이고 날짜 순이다. 메모 글·내원번호가 나가지 않는다', () => {
    const counts = dayCounts(
      view([
        row('secret-key-b', { date: '2026-10-13', compare: '같음', inBit: '가상환자 메모 글' }),
        row('secret-key-a', { date: DAY }),
        row('secret-key-c', { date: DAY, compare: '다름', inBit: '비트에 있던 글' }),
      ]),
    )
    expect(counts).toEqual([
      { visit_date: DAY, need_memo: 2, entered: 0, needs_check: 0, skipped: 1 },
      { visit_date: '2026-10-13', need_memo: 1, entered: 1, needs_check: 0, skipped: 0 },
    ])
    for (const count of counts) {
      expect(Object.keys(count).sort()).toEqual(['entered', 'need_memo', 'needs_check', 'skipped', 'visit_date'])
      for (const value of [count.need_memo, count.entered, count.needs_check, count.skipped]) expect(Number.isInteger(value)).toBe(true)
    }
    const text = JSON.stringify(counts)
    for (const secret of ['가상환자', '비트에 있던 글', 'secret-key']) expect(text).not.toContain(secret)
  })

  it('AC-019.3: 메모가 필요 없는 진료는 세지 않지만 그 날짜 줄은 0으로 남는다(빠지면 날짜 목록이 안 불러온 날로 본다)', () => {
    expect(dayCounts(view([row('a', { hasMemo: false }), row('b', { hasMemo: false, compare: '같음' })]))).toEqual([{ visit_date: DAY, need_memo: 0, entered: 0, needs_check: 0, skipped: 0 }])
  })

  it('AC-019.3: 입력을 마친 사람은 비트 메모를 아직 다시 읽지 않았어도 입력 수에 든다', () => {
    expect(dayCounts(view([row('a'), row('b')], { finished: new Set(['a']) }))).toEqual([{ visit_date: DAY, need_memo: 2, entered: 1, needs_check: 0, skipped: 0 }])
  })

  it('AC-019.2·AC-019.3: 입력 수는 메모 필요 수를 넘지 않는다: 메모가 없는 진료의 완료 표시는 세지 않는다', () => {
    const [count] = dayCounts(view([row('a', { hasMemo: false }), row('b')], { finished: new Set(['a', 'b']) }))
    expect(count).toEqual({ visit_date: DAY, need_memo: 1, entered: 1, needs_check: 0, skipped: 0 })
  })

  it('AC-019.3: 이번 입력 결과의 확인 필요·건너뜀을 센다', () => {
    const results = new Map([
      ['a', '확인 필요'],
      ['b', '건너뜀'],
      ['c', '건너뜀'],
    ])
    expect(dayCounts(view([row('a'), row('b'), row('c'), row('d')], { results }))).toEqual([{ visit_date: DAY, need_memo: 4, entered: 0, needs_check: 1, skipped: 2 }])
  })

  it.each([
    ['check', 1, 0],
    ['writing', 1, 0],
    ['writeUnconfirmed', 1, 0],
    ['skipped', 0, 1],
    ['skippedByHand', 0, 1],
    ['done', 0, 0],
  ])('AC-019.3: 입력 기록의 마지막이 %s이면 확인 필요 %i·건너뜀 %i', (lastJournal, needsCheck, skipped) => {
    expect(dayCounts(view([row('a', { lastJournal })]))).toEqual([{ visit_date: DAY, need_memo: 1, entered: 0, needs_check: needsCheck, skipped }])
  })

  it('AC-019.3: 이번 결과가 입력 기록보다 앞선다', () => {
    const results = new Map([['a', '건너뜀']])
    expect(dayCounts(view([row('a', { lastJournal: 'check' })], { results }))).toEqual([{ visit_date: DAY, need_memo: 1, entered: 0, needs_check: 0, skipped: 1 }])
  })

  it('AC-019.3: 한 사람은 한 칸에만 든다: 입력됨이 앞선다', () => {
    const results = new Map([
      ['a', '확인 필요'],
      ['b', '건너뜀'],
    ])
    const counted = dayCounts(view([row('a', { compare: '같음' }), row('b'), row('c', { compare: '다름', lastJournal: 'check' })], { results, finished: new Set(['b']) }))
    expect(counted).toEqual([{ visit_date: DAY, need_memo: 3, entered: 2, needs_check: 1, skipped: 0 }])
  })

  it('AC-019.3: 조회 못함은 입력 수에 들지 않고 남은 일로 둔다', () => {
    expect(dayCounts(view([row('a', { compare: '조회 못함' })]))).toEqual([{ visit_date: DAY, need_memo: 1, entered: 0, needs_check: 0, skipped: 0 }])
  })

  it('AC-019.3: 줄이 없으면 건수도 없다(메모를 만들지 않는 병원). 0으로 덮지 않는다', () => {
    expect(dayCounts(view([]))).toEqual([])
  })
})

describe('AC-019.4 Worker 메시지 읽기', () => {
  const rows = [{ visit_date: DAY, need_memo: 1, entered: 0, needs_check: 0, skipped: 0 }]
  const range = { from: DAY, to: DAY }

  it('AC-019.4: dayCounts 메시지에서 번호·줄·고른 기간을 꺼낸다. 진료 없는 기간이면 빈 줄이다', () => {
    expect(readCountsMessage({ type: 'dayCounts', load: 3, rows, range })).toEqual({ load: 3, rows, range })
    expect(readCountsMessage({ type: 'dayCounts', load: 3, rows: [], range })).toEqual({ load: 3, rows: [], range })
  })

  it.each([
    [null],
    ['dayCounts'],
    [{ type: 'check', ok: true }],
    [{ type: 'dayCounts' }],
    [{ type: 'dayCounts', load: 1, rows: 'x', range }],
    [{ type: 'dayCounts', rows, range }],
    [{ type: 'dayCounts', load: 1.5, rows, range }],
    [{ type: 'dayCounts', load: 1, rows }],
    [{ type: 'dayCounts', load: 1, rows, range: { from: DAY } }],
    [{ type: 'dayCounts', load: 1, rows, range: { from: 'x', to: DAY } }],
  ])('AC-019.4: 약속과 다른 메시지는 null이다: %j', (data) => {
    expect(readCountsMessage(data)).toBeNull()
  })
})
