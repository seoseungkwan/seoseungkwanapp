import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { InputSelection, MemoCompare } from '@/types/precheck'
import { inputTargets, isPlainExclusion, isWriteStuck, MAX_BATCH, NOT_ACCEPTED, NOT_DONE, reasonKind, type TargetContext, type TargetVisit } from './inputTargets'

// 입력 대상 고르기(AC-018.8~AC-018.13·AC-018.20·AC-018.22·AC-018.23·AC-018.26). 순수 함수이고 부르는 곳은 Worker다. 이름과 번호는 지어낸 것이다

const VISIBLE = { from: '2099-03-02', to: '2099-03-07' }
const NAMES: Record<string, { k: string; n: string }> = {
  LA358: { k: 'proc', n: '가상시술 가' },
  LB120: { k: 'proc', n: '가상시술 나' },
  LA3581: { k: 'proc', n: '가상시술 다' },
  A15: { k: 'drug', n: '가상약' },
}
const visit = (key: string, over: Partial<TargetVisit> = {}): TargetVisit => ({
  key,
  date: '2099-03-02',
  text: `메모 ${key}`,
  hasMemo: true,
  unfinished: false,
  compare: '비트에 없음' as MemoCompare,
  chart: `9${key}`,
  name: `가상환자${key}`,
  rx: ['LA358'],
  rxNames: ['가상시술 가'],
  warned: false,
  chartLines: [],
  rxRows: [],
  ...over,
})
const context = (over: Partial<TargetContext> = {}): TargetContext => ({
  visible: VISIBLE,
  done: new Set(),
  held: new Map(),
  foundByPc: new Set(),
  codeInfo: (code) => NAMES[code] ?? null,
  ...over,
})
const blank = { typed: '', chip: '', from: VISIBLE.from, to: VISIBLE.to, kind: 'day' as const, day: VISIBLE.from, rangeFrom: VISIBLE.from, rangeTo: VISIBLE.to }
const byCode = (over: Partial<InputSelection> = {}): InputSelection => ({ mode: 'code', ...blank, chip: 'LA358', ...over })
const byDay = (day = VISIBLE.from): InputSelection => ({ mode: 'date', ...blank, kind: 'day', day })
const byRange = (rangeFrom = VISIBLE.from, rangeTo = VISIBLE.to): InputSelection => ({ mode: 'date', ...blank, kind: 'range', rangeFrom, rangeTo })

const keys = (rows: readonly { key: string }[]) => rows.map((row) => row.key)
const groupOf = (result: ReturnType<typeof inputTargets>, reason: string) => result.left.find((group) => group.reason === reason)?.rows.map((row) => row.key) ?? []
const reasons = (result: ReturnType<typeof inputTargets>) => result.left.map((group) => group.reason)

describe('AC-018.26 입력할 사람과 빠지는 사람', () => {
  it('AC-018.26: 까닭마다 묶음이 보이는 차례로 나뉜다', () => {
    const visits = [
      visit('held', { date: '2099-03-07' }),
      visit('read', { compare: '조회 못함' }),
      visit('diff', { compare: '다름', inBit: '비트 글', declined: true }),
      visit('twoA', { chart: '9777' }),
      visit('twoB', { chart: '9777' }),
      visit('mark', { unfinished: true }),
      visit('none', { hasMemo: false }),
      visit('same', { compare: '같음', inBit: '메모 same' }),
      visit('go'),
    ]
    const result = inputTargets(visits, byRange(), context({ held: new Map([['held', '메모 held']]) }))
    expect(keys(result.batch)).toEqual(['go'])
    expect(reasons(result)).toEqual(['done', 'nomemo', 'mark', 'manual', 'diff', 'unread', 'held'])
    expect(groupOf(result, 'done')).toEqual(['same'])
    expect(groupOf(result, 'nomemo')).toEqual(['none'])
    expect(groupOf(result, 'mark')).toEqual(['mark'])
    expect(groupOf(result, 'manual')).toEqual(['twoA', 'twoB'])
    expect(groupOf(result, 'diff')).toEqual(['diff'])
    expect(groupOf(result, 'unread')).toEqual(['read'])
    expect(groupOf(result, 'held')).toEqual(['held'])
  })

  it.each([
    ['완료 > 메모 없음', { compare: '같음', hasMemo: false }, 'done'],
    ['메모 없음 > 직접 입력', { hasMemo: false, chart: '9777' }, 'nomemo'],
    ['직접 입력 > 확인 표시', { unfinished: true, chart: '9777' }, 'manual'],
    ['확인 표시 > 조회 못함', { unfinished: true, compare: '조회 못함' }, 'mark'],
    ['조회 못함 > 지난번 건너뜀', { compare: '조회 못함', key: 'x' }, 'unread'],
    ['다른 메모 > 지난번 건너뜀', { compare: '다름', inBit: '비트 글', declined: true }, 'diff'],
  ] as const)('AC-018.26: 둘에 걸리면 앞선 하나에만 든다: %s', (_, over, reason) => {
    const twin = visit('twin', { chart: '9777' })
    const held = new Map([['x', '메모 x']])
    const result = inputTargets([visit('x', over), twin], byRange(), context({ held }))
    expect(groupOf(result, reason)).toContain('x')
    expect(result.left.filter((group) => group.rows.some((row) => row.key === 'x'))).toHaveLength(1)
  })

  it('AC-018.26: 목록의 입력할 사람은 날짜 순서이고 같은 날은 목록 차례다', () => {
    const result = inputTargets([visit('b', { date: '2099-03-03' }), visit('a', { date: '2099-03-02' }), visit('c', { date: '2099-03-03' })], byRange(), context())
    expect(keys(result.batch)).toEqual(['a', 'b', 'c'])
  })

  it('AC-018.26: 칩은 새 메모·메모 바꿈 둘이다', () => {
    const visits = [visit('new'), visit('ok', { compare: '다름', inBit: '비트', approved: '비트' }), visit('ask', { compare: '다름', inBit: '비트' })]
    const result = inputTargets(visits, byRange(), context())
    expect(result.batch.map((row) => row.chip)).toEqual(['새 메모', '메모 바꿈', '메모 바꿈'])
    expect(result.replacing).toBe(2)
  })

  it.each([
    ['이미 입력됨', { done: new Set(['x']) }, {}, 'done'],
    ['메모 없음', {}, { hasMemo: false }, 'nomemo'],
    ['직접 입력(같은 날 여럿)', {}, { chart: '9777' }, 'manual'],
    ['직접 입력(PC가 찾음)', { foundByPc: new Set(['x']) }, {}, 'manual'],
    ['확인 표시', {}, { unfinished: true }, 'mark'],
  ] as const)('AC-018.26·AC-016.3: 다름이어도 앞선 까닭(%s)이 먼저이고 묶음에 없다', (_, ctx, over, reason) => {
    const twin = visit('twin', { chart: '9777', compare: '같음', inBit: '메모 twin' })
    const result = inputTargets([visit('x', { compare: '다름', inBit: '비트 글', ...over }), twin], byRange(), context(ctx))
    expect(groupOf(result, reason)).toContain('x')
    expect(keys(result.batch)).not.toContain('x')
    expect(result.replacing).toBe(0)
  })

  it('AC-018.26·AC-016.2: 조회 못함은 replaces 없이 빠진다', () => {
    const result = inputTargets([visit('x', { compare: '조회 못함', approved: '옛 글' })], byRange(), context())
    expect(groupOf(result, 'unread')).toEqual(['x'])
    expect(result.batch).toEqual([])
  })

  it('AC-018.13: 같은 사람 같은 날 진료는 줄마다 건수가 있고, PC가 찾아낸 사람은 표시가 있다', () => {
    const result = inputTargets([visit('a', { chart: '9777' }), visit('b', { chart: '9777' }), visit('c')], byRange(), context({ foundByPc: new Set(['c']) }))
    expect(result.left.find((group) => group.reason === 'manual')?.rows.map((row) => [row.key, row.sameDay, row.foundByPc])).toEqual([
      ['a', 2, false],
      ['b', 2, false],
      ['c', 1, true],
    ])
  })
})

describe('AC-018.3 메모 없음과 완료는 묶음에 들지 않는다', () => {
  it('AC-018.3: 메모 없는 날에 사람이 친 글은 글자가 있어도 넣지 않는다(hasMemo로 가른다)', () => {
    const result = inputTargets([visit('typed', { hasMemo: false, text: '사람이 친 글', unfinished: false })], byRange(), context())
    expect(keys(result.batch)).toEqual([])
    expect(groupOf(result, 'nomemo')).toEqual(['typed'])
  })

  it('AC-018.3: 공백뿐인 메모도 메모 없음이다', () => {
    expect(groupOf(inputTargets([visit('a', { text: ' \n ' })], byRange(), context()), 'nomemo')).toEqual(['a'])
  })

  it('AC-018.3: 완료 표시가 있는 사람은 비교가 비트에 없음이어도 묶음에 들지 않는다', () => {
    const result = inputTargets([visit('done')], byRange(), context({ done: new Set(['done']) }))
    expect(keys(result.batch)).toEqual([])
    expect(groupOf(result, 'done')).toEqual(['done'])
  })

  it('AC-018.3: 규칙 경고는 막지 않는다', () => {
    expect(keys(inputTargets([visit('warn', { warned: true })], byRange(), context()).batch)).toEqual(['warn'])
  })

  it('AC-018.23: 500명을 넘으면 안내와 빈 묶음이다(AC-017.1이 묶음 전체를 거절한다)', () => {
    const many = Array.from({ length: MAX_BATCH + 1 }, (_, i) => visit(`p${i}`, { chart: `8${i}` }))
    const result = inputTargets(many, byRange(), context())
    expect(MAX_BATCH).toBe(500)
    expect(result.problem).toBe('한 번에 500명까지만 넣을 수 있어요. 기간을 줄여 주세요.')
    expect(result.batch).toEqual([])
    expect(result.replacing).toBe(0)
  })

  it('AC-018.23·AC-018.26: 500명이면 안내 없이 모두 묶음에 든다', () => {
    const many = Array.from({ length: MAX_BATCH }, (_, i) => visit(`p${i}`, { chart: `8${i}` }))
    const result = inputTargets(many, byRange(), context())
    expect(result.problem).toBeNull()
    expect(keys(result.batch)).toEqual(keys(many))
  })
})

describe('AC-016.3·AC-018.22 다른 메모와 묻지 않기', () => {
  const diff = (over = {}) => visit('d', { compare: '다름', inBit: '비트 글', ...over })

  it('AC-016.3: 승인하지 않은 다른 메모도 지금 비트 글을 replaces로 들고 칩은 메모 바꿈이다', () => {
    const result = inputTargets([diff()], byRange(), context())
    expect(keys(result.batch)).toEqual(['d'])
    expect(result.batch[0]).toMatchObject({ replaces: '비트 글', chip: '메모 바꿈' })
    expect(result.replacing).toBe(1)
    expect(result.left).toEqual([])
  })

  it(`AC-018.14: declined면 '다른 메모 있음'이고 입력할 사람에 없다. 목록과 묶음이 같다`, () => {
    const result = inputTargets([diff({ declined: true }), visit('n')], byRange(), context())
    expect(groupOf(result, 'diff')).toEqual(['d'])
    expect(keys(result.batch)).toEqual(['n'])
    expect(result.batch[0]).not.toHaveProperty('replaces')
    expect(result.replacing).toBe(0)
  })

  it('AC-018.14: 승인이 남아 있어도 declined가 앞선다', () => {
    expect(groupOf(inputTargets([diff({ declined: true, approved: '비트 글' })], byRange(), context()), 'diff')).toEqual(['d'])
  })

  it('AC-018.22: skippedByHand 기록이 있는 진료는 [이 메모로 바꾸기] 전에는 빠지고 누르면 replaces로 든다', () => {
    const held = diff({ lastJournal: 'skippedByHand' })
    const off = inputTargets([held], byRange(), context())
    expect(groupOf(off, 'diff')).toEqual(['d'])
    expect(off.batch).toEqual([])
    const approved = inputTargets([{ ...held, approved: '비트 글' }], byRange(), context())
    expect(approved.batch[0]).toMatchObject({ replaces: '비트 글', chip: '메모 바꿈' })
  })
})

describe('AC-018.9 날짜별', () => {
  const visits = [visit('a', { date: '2099-03-02' }), visit('b', { date: '2099-03-03' }), visit('c', { date: '2099-03-04' })]

  it('AC-018.9: 하루는 그날만, 시작~끝은 그 안 모두를 날짜 순서로', () => {
    expect(keys(inputTargets(visits, byDay('2099-03-03'), context()).batch)).toEqual(['b'])
    expect(keys(inputTargets(visits, byRange('2099-03-03', '2099-03-04'), context()).batch)).toEqual(['b', 'c'])
    expect(inputTargets(visits, byDay('2099-03-03'), context()).code).toBeNull()
  })

  it.each([
    ['날짜가 빔', byDay(''), '날짜를 골라 주세요'],
    ['기간 밖', byDay('2099-03-20'), '불러온 기간 안에서 골라 주세요'],
    ['시작이 끝보다 늦음', byRange('2099-03-05', '2099-03-03'), '기간의 시작일이 종료일보다 늦습니다.'],
  ])('AC-018.9: %s면 안내만 있고 묶음이 없다', (_, selection, problem) => {
    const result = inputTargets(visits, selection, context())
    expect(result.problem).toBe(problem)
    expect(result.batch).toEqual([])
  })
})

describe('AC-018.10·AC-018.11 처방코드별', () => {
  const visits = [
    visit('a', { rx: ['LA358'] }),
    visit('b', { rx: ['LA3581'] }),
    visit('c', { rx: [' la358 ', 'A15'], date: '2099-03-03' }),
    visit('d', { rx: ['LB120'] }),
  ]

  it('AC-018.10: 앞자리만 같은 코드(LA358·LA3581)는 들지 않고 글자까지 같아야 든다(앞뒤 공백·대소문자 무시)', () => {
    const result = inputTargets(visits, byCode(), context())
    expect(keys(result.batch)).toEqual(['a', 'c'])
    expect(result.code).toBe('LA358')
  })

  it('AC-018.10: 칸에 적은 코드를 먼저 쓴다(앞뒤 공백을 떼고 대문자로)', () => {
    const result = inputTargets(visits, byCode({ typed: ' lb120 ' }), context())
    expect(keys(result.batch)).toEqual(['d'])
    expect(result.code).toBe('LB120')
    expect(result.typedOverChip).toBe(true)
  })

  it('AC-018.10: 코드 단추는 시술 코드만 많은 차례이고 건수에 다른 메모·조회 못함이 들며 완료·메모 없음은 빠진다', () => {
    const chips = inputTargets(
      [
        visit('a', { rx: ['LB120', 'A15'] }),
        visit('b', { rx: ['LB120'], compare: '다름', inBit: '비트' }),
        visit('c', { rx: ['LB120'], compare: '조회 못함' }),
        visit('d', { rx: ['LA358'] }),
        visit('e', { rx: ['LA358'], compare: '같음' }),
        visit('f', { rx: ['LA358'], hasMemo: false }),
        visit('g', { rx: ['LA358'] }),
      ],
      byCode(),
      context({ done: new Set(['g']) }),
    ).chips
    expect(chips).toEqual([
      { code: 'LB120', name: '가상시술 나', count: 3 },
      { code: 'LA358', name: '가상시술 가', count: 1 },
    ])
  })

  it('AC-018.10: 코드 단추는 기간과 상관없이 불러온 기간 전체를 센다', () => {
    const chips = inputTargets([visit('a', { date: '2099-03-02' }), visit('b', { date: '2099-03-05' })], byCode({ from: '2099-03-02', to: '2099-03-02' }), context()).chips
    expect(chips[0].count).toBe(2)
  })

  it.each([
    ['기간이 빔', byCode({ from: '' }), '날짜를 골라 주세요'],
    ['기간 밖', byCode({ to: '2099-03-20' }), '불러온 기간 안에서 골라 주세요'],
    ['시작이 끝보다 늦음', byCode({ from: '2099-03-05', to: '2099-03-03' }), '기간의 시작일이 종료일보다 늦습니다.'],
    ['기간 안내가 코드 안내보다 먼저', byCode({ from: '', chip: '', typed: 'LA358, LB120' }), '날짜를 골라 주세요'],
    ['코드 없음', byCode({ chip: '' }), '코드 단추를 고르거나 처방코드를 넣어 주세요'],
    ['둘로 보이는 코드(쉼표)', byCode({ typed: 'LA358, LB120' }), '처방코드 하나만 넣어 주세요. (예: LA358)'],
    ['둘로 보이는 코드(공백)', byCode({ typed: 'LA358 LB120' }), '처방코드 하나만 넣어 주세요. (예: LA358)'],
    ['둘로 보이는 코드(빗금)', byCode({ typed: 'LA358/LB120' }), '처방코드 하나만 넣어 주세요. (예: LA358)'],
    ['둘로 보이는 코드(세미콜론)', byCode({ typed: 'LA358;LB120' }), '처방코드 하나만 넣어 주세요. (예: LA358)'],
    ['모양이 틀린 코드', byCode({ typed: '-LA358' }), '처방코드 하나만 넣어 주세요. (예: LA358)'],
    ['맞는 진료 없음', byCode({ typed: 'ZZ999' }), '03/02 ~ 03/07에 처방코드 ZZ999로 입력할 환자가 없습니다. (완료한 환자와 메모가 없는 환자는 뺍니다)'],
  ])('AC-018.10·AC-018.11: %s', (_, selection, problem) => {
    const result = inputTargets(visits, selection, context())
    expect(result.problem).toBe(problem)
    expect(result.batch).toEqual([])
  })
})

describe('AC-018.20 지난번 건너뜀', () => {
  it('AC-018.20: 입력 직전 변경됨은 기억하지 않는다: 다시 불러온 새 글을 replaces로 다음 묶음에 든다', () => {
    const before = inputTargets([visit('a', { compare: '다름', inBit: '옛 글' })], byRange(), context())
    expect(before.batch[0].replaces).toBe('옛 글')
    const after = inputTargets([visit('a', { compare: '다름', inBit: '새 글' })], byRange(), context())
    expect(after.batch[0].replaces).toBe('새 글')
    expect(groupOf(after, 'held')).toEqual([])
  })

  it('AC-018.20: 메모가 그대로면 빠지고 고치면 들어간다', () => {
    const held = new Map([['a', '메모 a']])
    expect(groupOf(inputTargets([visit('a')], byRange(), context({ held })), 'held')).toEqual(['a'])
    expect(keys(inputTargets([visit('a', { text: '고친 글' })], byRange(), context({ held })).batch)).toEqual(['a'])
  })

  it('AC-018.20: 고른 범위가 모두 이들이면 안내를 보인다', () => {
    const held = new Map([['a', '메모 a'], ['b', '메모 b']])
    const result = inputTargets([visit('a'), visit('b')], byRange(), context({ held }))
    expect(result.problem).toBe('03/02 ~ 03/07에 남은 2건은 모두 지난 입력에서 건너뛴 환자입니다. 메모를 고치거나 [다시 하기]를 눌러 주세요')
  })
})

describe('AC-018.23 입력할 사람이 0명', () => {
  it.each([
    ['날짜별 하루', byDay(), '03/02에 입력할 환자가 없습니다. (완료한 환자와 메모가 없는 환자는 뺍니다)'],
    ['날짜별 시작~끝', byRange(), '03/02 ~ 03/07에 입력할 환자가 없습니다. (완료한 환자와 메모가 없는 환자는 뺍니다)'],
    ['처방코드별', byCode(), '03/02 ~ 03/07에 처방코드 LA358로 입력할 환자가 없습니다. (완료한 환자와 메모가 없는 환자는 뺍니다)'],
  ])('AC-018.23: 아직 안 된 진료가 없음: %s', (_, selection, problem) => {
    const result = inputTargets([visit('a', { compare: '같음' }), visit('b', { hasMemo: false })], selection, context())
    expect(result.problem).toBe(problem)
  })

  it.each([
    ['날짜별', byRange()],
    ['처방코드별', byCode()],
  ])('AC-018.23: 모두 빠졌는데 까닭이 여럿이면 빠지는 이유를 보라고 한다: %s', (_, selection) => {
    const result = inputTargets([visit('a', { compare: '다름', inBit: '비트', declined: true }), visit('b', { compare: '조회 못함' })], selection, context())
    expect(result.problem).toBe('지금 입력할 수 있는 사람이 없어요. 아래 빠지는 이유를 확인해 주세요.')
  })

  it('AC-018.23: 확인 표시가 남은 사람이 있으면 안내 줄이 없다(누를 때 알림)', () => {
    const result = inputTargets([visit('a', { unfinished: true }), visit('b', { compare: '조회 못함' })], byRange(), context())
    expect(result.problem).toBeNull()
    expect(result.batch).toEqual([])
    expect(groupOf(result, 'mark')).toEqual(['a'])
  })
})

describe('이유 앞부분으로 가른다(AC-035.8)', () => {
  it.each([
    ['같은 날 내원이 여러 건이라 직접 입력해 주세요', 'manual'],
    ['같은 날 내원이 여러 건이라 직접 입력해 주세요 · 직접 확인해 입력 멈춤을 풀었습니다', 'manual'],
    ['건너뜀: 같은 날 내원이 여러 건이라 직접 입력해 주세요 · 직접 확인해 입력 멈춤을 풀었습니다', 'manual'],
    ['넣을 메모가 없어 입력하지 않았습니다 · 직접 확인해 입력 멈춤을 풀었습니다', 'nomemo'],
    ['확인 표시가 남아 입력하지 않았습니다', 'mark'],
    ['내원일 없음', 'novisit'],
    ['내원일 없음 · 직접 확인해 입력 멈춤을 풀었습니다', 'novisit'],
    ['이미 있음', 'already'],
    ['입력 직전 기존 청구메모가 변경되었습니다. 현재 내용을 다시 비교해 주세요.', 'changed'],
    ['검색 결과가 3줄이라 입력하지 않았습니다', 'other'],
  ])('AC-018.4: %s → %s', (reason, kind) => {
    expect(reasonKind(reason)).toBe(kind)
  })
})

describe('AC-018.16 결과 줄로 아는 쓰다 멈춘 사람', () => {
  it.each([
    ['확인 필요', '입력 완료를 확인하지 못했습니다. 다시 실행하기 전에 비트의 실제 메모와 저장 여부를 확인해 주세요.', true],
    ['확인 필요', '입력은 했지만 임시저장 버튼을 누르지 못했습니다. 직접 임시저장을 눌러 주세요.', true],
    ['확인 필요', '미처리', false],
    ['확인 필요', '미처리 · 칸을 읽지 못했습니다', false],
    ['확인 필요', '메모 칸이 입력을 받지 않아 입력하지 못했습니다', false],
    ['건너뜀', '이미 있음', false],
    ['완료', '입력', false],
  ])('AC-018.16: %s · %s → %s', (result, reason, stuck) => {
    expect(isWriteStuck(result, reason)).toBe(stuck)
  })
})

// 화면은 도우미 결과 이유의 글자로 사람을 가른다(끝 답의 줄에는 입력 기록 상태가 없다). 여기 문장은 약속이다:
// 배포한 뒤 도우미 쪽 문장을 바꾸려면 옛 도우미와 새 화면이 어긋나므로 MIN_HELPER(lib/bridge/versions.ts)를 올려야 한다
describe('AC-035.8·AC-018.16 도우미 결과 이유의 글자 약속', () => {
  const source = (name: string) => readFileSync(fileURLToPath(new URL(`../../../helper/src/Precheck.Core/Input/${name}`, import.meta.url)), 'utf-8')
  const RUNNER = source('InputRunner.cs')
  const BATCH = source('InputBatch.cs')
  const constant = (text: string, name: string) => {
    const found = new RegExp(`const string ${name} = "([^"]*)"`).exec(text)
    if (!found) throw new Error(`도우미에 ${name} 글이 없다`)
    return found[1]
  }

  it('AC-018.21: 미처리·메모 칸이 입력을 받지 않아는 화면이 가르는 글과 같다', () => {
    expect(constant(RUNNER, 'NotDone')).toBe(NOT_DONE)
    expect(constant(RUNNER, 'NotAccepted').startsWith(NOT_ACCEPTED)).toBe(true)
    expect(isWriteStuck('확인 필요', constant(RUNNER, 'NotDone'))).toBe(false)
    expect(isWriteStuck('확인 필요', constant(RUNNER, 'NotAccepted'))).toBe(false)
  })

  it.each([
    ['AlreadyOther', RUNNER, 'already'],
    ['ChangedBefore', RUNNER, 'changed'],
    ['TwoVisits', BATCH, 'manual'],
    ['NoVisit', BATCH, 'novisit'],
    ['OpenMark', BATCH, 'mark'],
    ['NoMemo', BATCH, 'nomemo'],
  ] as const)('AC-018.4: 도우미 %s의 앞부분으로 까닭을 가른다', (name, text, kind) => {
    expect(reasonKind(constant(text, name))).toBe(kind)
  })

  it('AC-016.3: [확인] 없이 빠지는 줄은 도우미의 네 글 그대로이고, 뒤 글이 붙으면 [확인]이 있던 묶음이다', () => {
    const note = constant(BATCH, 'ReleasedNote')
    expect(note).toBe(' · 직접 확인해 입력 멈춤을 풀었습니다')
    for (const name of ['TwoVisits', 'NoVisit', 'OpenMark', 'NoMemo']) {
      const reason = constant(BATCH, name)
      expect(isPlainExclusion(reason)).toBe(true)
      expect(isPlainExclusion(`${reason}${note}`)).toBe(false)
      expect(reasonKind(`${reason}${note}`)).toBe(reasonKind(reason))
    }
  })

  it(`AC-018.16: 쓰기를 시작한 뒤 멈춘 이유(StopAfterWrite)는 '미처리'나 '메모 칸이 입력을 받지 않아'로 시작하지 않아 쓰다 멈춘 사람으로 친다`, () => {
    const names = ['WriteUnknown', 'WriteNotConfirmed', 'ChangedAfter', 'SaveNotPressed', 'SaveDiffers', 'CheckMemoBox']
    const used = new Set([...RUNNER.matchAll(/StopAfterWrite\(item, (\w+)\)/g)].map((match) => match[1]))
    expect([...used].sort()).toEqual([...names].sort()) // 새 이유가 생기면 여기서 알게 된다
    for (const name of names) {
      const reason = constant(RUNNER, name)
      expect(reason.startsWith(NOT_DONE)).toBe(false)
      expect(reason.startsWith(NOT_ACCEPTED)).toBe(false)
      expect(isWriteStuck('확인 필요', reason)).toBe(true)
    }
  })
})
