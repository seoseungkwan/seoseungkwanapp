import { describe, expect, it } from 'vitest'
import type { NoticeCard, SavedNotice } from '@/types/forms'
import {
  LEAVE_CONFIRM,
  blankCard,
  cardProblems,
  formsReducer,
  initialState,
  isDirty,
  listDate,
  monthProblem,
  previewNotice,
  readyNotice,
  tidyAnswerOf,
  type FormsAction,
  type FormsState,
} from './formsState'

// 서식 화면 상태 바꾸기(순수 reducer)와 거기서 끌어내는 값 (spec forms TASK-12, design.md 10절, 시안 docs/mockups/forms/screen.html).
// 오늘은 2026-11-10(한국 날짜)이라고 친다

const TODAY = '2026-11-10'
const CHILDREN: NoticeCard = { start: '2027-05-05', end: null, name: '어린이날', status: '휴진' }
const LIBERATION: NoticeCard = { start: '2026-08-15', end: null, name: '광복절', status: '휴진' }
const SUBSTITUTE: NoticeCard = { start: '2026-08-17', end: null, name: '대체공휴일', status: '휴진' }
const AUG: SavedNotice = { id: 'aug', year: 2026, month: 8, cards: [LIBERATION, SUBSTITUTE], theme: null, updatedAt: '2026-08-03T01:00:00.000Z' }
const MAY: SavedNotice = { id: 'may', year: 2027, month: 5, cards: [CHILDREN], theme: null, updatedAt: '2026-11-10T05:32:00.000Z' }

const run = (state: FormsState, ...actions: FormsAction[]) => actions.reduce(formsReducer, state)
const start = () => initialState(TODAY)
const typed = (state: FormsState, index: number, card: Partial<Record<'start' | 'end' | 'name' | 'status', string>>) =>
  run(state, ...Object.entries(card).map(([field, value]) => ({ type: 'card', index, field, value }) as FormsAction))

describe('AC-3503.1·AC-3503.5: 새 안내문', () => {
  it('AC-3503.1: 카드 한 장(빈 시작·끝·이름, 아래 글 휴진)으로 시작한다', () => {
    const s = start()
    expect(s.cards).toEqual([{ start: '', end: '', name: '', status: '휴진' }])
    expect(blankCard()).toEqual({ start: '', end: '', name: '', status: '휴진' })
  })

  it('AC-3503.5: 새 안내문의 안내 달은 오늘(한국 날짜)의 달이고 테마는 저절로(null)다', () => {
    const s = start()
    expect([s.year, s.month, s.theme, s.id, s.monthTouched]).toEqual([2026, 11, null, null, false])
  })
})

describe('AC-3502.2: 대충 적기 칸', () => {
  it('AC-3502.2: 500자까지만 들어간다(글자 수로 센다)', () => {
    const s = run(start(), { type: 'memo', text: '가'.repeat(600) })
    expect(Array.from(s.memo)).toHaveLength(500)
  })

  it('AC-3502.3: 글을 고치면 지난 정리 오류를 지운다', () => {
    const s = run(start(), { type: 'tidyFailed', code: 'E-FORMS-PRIVATE' }, { type: 'memo', text: '5/5 어린이날 휴진' })
    expect(s.tidyError).toBeNull()
  })
})

describe('AC-3502.1·AC-3502.4·AC-3502.5·AC-3502.6: 정리하기', () => {
  it('AC-3502.4: 기다리는 동안 tidying이고 적은 글·카드는 그대로다', () => {
    const before = typed(run(start(), { type: 'memo', text: '5/5 어린이날 휴진' }), 0, { name: '학회' })
    const s = run(before, { type: 'tidyStart' })
    expect(s.tidying).toBe(true)
    expect(s.memo).toBe(before.memo)
    expect(s.cards).toEqual(before.cards)
  })

  it('AC-3502.1: 답의 카드로 카드 칸이 바뀌고 안내 달은 가장 이른 카드의 달이다(끝 null은 빈 칸)', () => {
    const s = run(start(), { type: 'tidyStart' }, { type: 'tidyDone', cards: [CHILDREN], truncated: false })
    expect(s.tidying).toBe(false)
    expect(s.cards).toEqual([{ start: '2027-05-05', end: '', name: '어린이날', status: '휴진' }])
    expect([s.year, s.month]).toEqual([2027, 5])
    expect(s.truncated).toBe(false)
  })

  it('AC-3502.1·AC-3503.5: 직접 고른 안내 달이 있어도 정리한 답이 오면 다시 카드를 따라간다', () => {
    const s = run(start(), { type: 'month', value: '2026-12' }, { type: 'tidyStart' }, { type: 'tidyDone', cards: [CHILDREN], truncated: false })
    expect([s.year, s.month, s.monthTouched]).toEqual([2027, 5, false])
  })

  it('AC-3504.3: 직접 고른 테마는 정리한 답이 와도 그대로다', () => {
    const s = run(start(), { type: 'theme', theme: 'christmas' }, { type: 'tidyDone', cards: [CHILDREN], truncated: false })
    expect(s.theme).toBe('christmas')
  })

  it('AC-3502.6: 넘쳤다는 표시를 남기고, 다음 정리를 시작하면 지운다', () => {
    const s = run(start(), { type: 'tidyDone', cards: [CHILDREN], truncated: true })
    expect(s.truncated).toBe(true)
    expect(run(s, { type: 'tidyStart' }).truncated).toBe(false)
  })

  it.each(['E-FORMS-PRIVATE', 'E-FORMS-NO-DATE', 'E-AI-BUSY', 'E-AI-LIMIT', 'E-AI-FAILED'] as const)(
    'AC-3502.5: %s 실패는 번호를 남기고 적은 글·카드 칸은 그대로다',
    (code) => {
      const before = typed(run(start(), { type: 'memo', text: '5/5 어린이날 휴진' }), 0, { start: '2026-12-25', name: '성탄절' })
      const s = run(before, { type: 'tidyStart' }, { type: 'tidyFailed', code })
      expect(s.tidyError).toBe(code)
      expect(s.tidying).toBe(false)
      expect(s.memo).toBe(before.memo)
      expect(s.cards).toEqual(before.cards)
    },
  )
})

describe('AC-3502.1·AC-3502.5: 정리 답 읽기 tidyAnswerOf', () => {
  it('AC-3502.1: 200 { cards, truncated }는 카드로 읽는다', () => {
    expect(tidyAnswerOf(200, { cards: [CHILDREN], truncated: false })).toEqual({ kind: 'ok', cards: [CHILDREN], truncated: false })
    expect(tidyAnswerOf(200, { cards: [LIBERATION, SUBSTITUTE], truncated: true })).toEqual({ kind: 'ok', cards: [LIBERATION, SUBSTITUTE], truncated: true })
  })

  it.each([
    [422, 'E-FORMS-PRIVATE'],
    [422, 'E-FORMS-NO-DATE'],
    [503, 'E-AI-BUSY'],
    [402, 'E-AI-LIMIT'],
    [502, 'E-AI-FAILED'],
  ] as const)('AC-3502.5: %s { code: %s }는 그 번호다', (status, code) => {
    expect(tidyAnswerOf(status, { code })).toEqual({ kind: 'error', code })
  })

  it.each([
    ['몸통 없는 401', 401, null],
    ['몸통 없는 403', 403, null],
    ['돌려보냄(0)', 0, null],
    ['모르는 번호', 500, { code: 'E-SOMETHING' }],
    ['200인데 카드 없음', 200, { cards: [], truncated: false }],
    ['200인데 5장', 200, { cards: [CHILDREN, CHILDREN, CHILDREN, CHILDREN, CHILDREN], truncated: false }],
    ['200인데 없는 날짜', 200, { cards: [{ ...CHILDREN, start: '2027-02-30' }], truncated: false }],
    ['200인데 다른 열쇠', 200, { cards: [{ ...CHILDREN, memo: '010-1234-5678' }], truncated: false }],
    ['200인데 개인정보 모양 이름', 200, { cards: [{ ...CHILDREN, name: 'a@b.kr' }], truncated: false }],
    ['200인데 truncated 없음', 200, { cards: [CHILDREN] }],
    ['200인데 JSON 아님', 200, null],
  ])('AC-3502.5: %s는 E-AI-FAILED다', (_label, status, body) => {
    expect(tidyAnswerOf(status, body)).toEqual({ kind: 'error', code: 'E-AI-FAILED' })
  })
})

describe('AC-3503.2·AC-3503.5: 카드 고치기·더하기·빼기', () => {
  it('AC-3503.2: 4장까지만 더해진다', () => {
    const s = run(start(), { type: 'addCard' }, { type: 'addCard' }, { type: 'addCard' }, { type: 'addCard' }, { type: 'addCard' })
    expect(s.cards).toHaveLength(4)
    expect(s.cards[3]).toEqual(blankCard())
  })

  it('AC-3503.2: 1장이면 빼지 않는다', () => {
    expect(run(start(), { type: 'removeCard', index: 0 }).cards).toHaveLength(1)
  })

  it('AC-3503.5: 안내 달은 가장 이른 시작 날짜의 연·월을 따라간다(적은 차례와 상관없음)', () => {
    let s = typed(start(), 0, { start: '2027-05-05' })
    expect([s.year, s.month]).toEqual([2027, 5])
    s = typed(run(s, { type: 'addCard' }), 1, { start: '2027-04-30' })
    expect([s.year, s.month]).toEqual([2027, 4])
    s = run(s, { type: 'removeCard', index: 1 })
    expect([s.year, s.month]).toEqual([2027, 5])
  })

  it('AC-3503.5: 안내 달을 직접 고른 뒤에는 카드를 바꿔도 그대로다', () => {
    const s = typed(run(start(), { type: 'month', value: '2027-06' }), 0, { start: '2027-05-05' })
    expect([s.year, s.month, s.monthTouched]).toEqual([2027, 6, true])
  })

  it('AC-3503.5: 모양이 아닌 달 값(빈 글)은 무시한다', () => {
    const s = run(start(), { type: 'month', value: '' })
    expect([s.year, s.month, s.monthTouched]).toEqual([2026, 11, false])
  })
})

describe('AC-3503.4·AC-3505.4: 검사와 뽑기 준비', () => {
  it('AC-3503.4: 다 맞으면 readyNotice가 검사를 넘은 안내문이다(앞뒤 공백 뗌, 끝 빈 칸은 null)', () => {
    const s = typed(start(), 0, { start: '2027-05-05', name: ' 어린이날 ' })
    expect(cardProblems(s)).toEqual([null])
    expect(readyNotice(s)).toEqual({ year: 2027, month: 5, cards: [CHILDREN], theme: null })
  })

  it('AC-3503.4: 끝 날짜가 시작보다 앞이면 그 칸 까닭이 있고 readyNotice는 null이다', () => {
    const s = typed(start(), 0, { start: '2027-05-05', end: '2027-05-04', name: '어린이날' })
    expect(cardProblems(s)[0]).toEqual({ end: '끝 날짜는 시작 날짜보다 뒤여야 해요' })
    expect(readyNotice(s)).toBeNull()
  })

  it('AC-3503.4: 아래 글을 비우면 그 칸 까닭이 있다', () => {
    const s = typed(start(), 0, { start: '2027-05-05', name: '어린이날', status: ' ' })
    expect(cardProblems(s)[0]).toEqual({ status: '아래 글을 적어 주세요' })
  })

  it('AC-3503.4: 아직 아무것도 적지 않은 카드는 까닭을 보이지 않지만 readyNotice는 null이다', () => {
    const s = start()
    expect(cardProblems(s)).toEqual([null])
    expect(readyNotice(s)).toBeNull()
  })

  it('AC-3503.4: 안내 달이 2020~2100년 밖이면 까닭이 있고 readyNotice는 null이다', () => {
    const s = typed(run(start(), { type: 'month', value: '2019-12' }), 0, { start: '2027-05-05', name: '어린이날' })
    expect(monthProblem(s)).toBe('2020년부터 2100년 사이로 골라 주세요')
    expect(readyNotice(s)).toBeNull()
    expect(monthProblem(start())).toBeNull()
  })

  it('AC-3505.4: 미리보기는 시작 날짜가 있는 카드만 그린다(없으면 카드 0장)', () => {
    expect(previewNotice(start()).cards).toEqual([])
    const s = typed(run(start(), { type: 'addCard' }), 1, { start: '2027-05-05', end: '2027-05-01', name: ' 어린이날 ' })
    expect(previewNotice(s)).toEqual({ year: 2027, month: 5, theme: null, cards: [{ start: '2027-05-05', end: null, name: '어린이날', status: '휴진' }] })
  })
})

describe('AC-3504.3: 테마 고르기', () => {
  it('AC-3504.3: 고른 테마는 카드를 바꿔도 그대로이고, 저절로(null)로 되돌릴 수 있다', () => {
    let s = run(start(), { type: 'theme', theme: 'liberation' })
    s = typed(s, 0, { start: '2027-05-05', name: '어린이날' })
    expect(s.theme).toBe('liberation')
    expect(run(s, { type: 'theme', theme: null }).theme).toBeNull()
  })
})

describe('AC-3507.1·AC-3507.2·AC-3507.3·AC-3507.4·AC-3507.5: 저장·목록', () => {
  const ready = () => typed(start(), 0, { start: '2027-05-05', name: '어린이날' })

  it('AC-3507.2: 목록 읽기 결과를 담는다(실패는 failed)', () => {
    expect(start().list).toEqual({ kind: 'loading' })
    expect(run(start(), { type: 'listLoaded', result: [MAY, AUG] }).list).toEqual({ kind: 'ok', items: [MAY, AUG] })
    expect(run(start(), { type: 'listLoaded', result: 'failed' }).list).toEqual({ kind: 'failed' })
    expect(run(start(), { type: 'listLoaded', result: 'failed' }, { type: 'listLoading' }).list).toEqual({ kind: 'loading' })
  })

  it('AC-3507.2: 고친 날짜는 한국 날짜의 M월 D일이다', () => {
    expect(listDate('2026-11-10T05:32:00.000Z')).toBe('11월 10일')
    expect(listDate('2026-08-02T15:30:00.000Z')).toBe('8월 3일') // 한국 시각 8월 3일 0시 30분
    expect(listDate('어제')).toBe('')
  })

  it('AC-3507.1: 저장하면 그 줄을 열린 안내문으로 삼고 목록 맨 위에 둔다(같은 id는 하나)', () => {
    let s = run(ready(), { type: 'listLoaded', result: [AUG] }, { type: 'saveStart' })
    expect(s.store).toBe('saving')
    s = run(s, { type: 'saved', notice: MAY })
    expect(s.id).toBe('may')
    expect(s.store).toBeNull()
    expect(s.list).toEqual({ kind: 'ok', items: [MAY, AUG] })
    const again = run(s, { type: 'saved', notice: { ...MAY, updatedAt: '2026-11-11T00:00:00.000Z' } })
    expect(again.list.kind === 'ok' && again.list.items.map((n) => n.id)).toEqual(['may', 'aug'])
  })

  it('AC-3507.1·AC-3507.2: 목록을 못 읽었거나 읽는 중에 저장하면 목록 상태는 그대로다(방금 것 하나만 있는 목록으로 바꾸지 않는다)', () => {
    for (const list of [{ type: 'listLoaded', result: 'failed' }, { type: 'listLoading' }] as const) {
      const s = run(ready(), list, { type: 'saveStart' }, { type: 'saved', notice: MAY })
      expect(s.id).toBe('may')
      expect(s.store).toBeNull()
      expect(s.list).toEqual(run(ready(), list).list)
    }
  })

  it('AC-3507.3: 새 안내문은 카드에 무엇이든 적으면 바뀐 내용이 있다', () => {
    expect(isDirty(start())).toBe(false)
    expect(isDirty(run(start(), { type: 'memo', text: '아무 글' }))).toBe(false)
    expect(isDirty(typed(start(), 0, { name: '학회' }))).toBe(true)
  })

  it('AC-3507.1·AC-3507.3: 저장하거나 연 뒤에는 그 값과 다를 때만 바뀐 내용이 있다(앞뒤 공백은 같다고 본다)', () => {
    const saved = run(typed(start(), 0, { start: '2027-05-05', name: '어린이날 ' }), { type: 'saved', notice: MAY })
    expect(isDirty(saved)).toBe(false)
    expect(isDirty(typed(saved, 0, { status: '오전진료' }))).toBe(true)
    expect(isDirty(run(saved, { type: 'theme', theme: 'm05' }))).toBe(true)

    const opened = run(start(), { type: 'open', notice: AUG })
    expect(isDirty(opened)).toBe(false)
    expect(isDirty(run(opened, { type: 'removeCard', index: 1 }))).toBe(true)
    expect(LEAVE_CONFIRM).toBe('저장하지 않은 내용이 있어요. 버릴까요?')
  })

  it('AC-3507.2: 열면 그 안내문의 값이 칸에 들어가고 안내 달은 저장한 값 그대로다', () => {
    const s = run(start(), { type: 'memo', text: '글' }, { type: 'listLoaded', result: [AUG] }, { type: 'open', notice: AUG })
    expect(s.id).toBe('aug')
    expect(s.cards).toEqual([
      { start: '2026-08-15', end: '', name: '광복절', status: '휴진' },
      { start: '2026-08-17', end: '', name: '대체공휴일', status: '휴진' },
    ])
    expect([s.year, s.month, s.theme, s.monthTouched, s.memo]).toEqual([2026, 8, null, true, ''])
    expect(s.list).toEqual({ kind: 'ok', items: [AUG] })
  })

  it('AC-3507.4: 지우면 목록에서 빼고 새 안내문이 된다', () => {
    const s = run(start(), { type: 'listLoaded', result: [MAY, AUG] }, { type: 'open', notice: AUG }, { type: 'deleteStart' }, { type: 'deleted', id: 'aug' })
    expect(s.id).toBeNull()
    expect(s.cards).toEqual([blankCard()])
    expect(s.list).toEqual({ kind: 'ok', items: [MAY] })
    expect(s.store).toBeNull()
  })

  it('AC-3507.5: 저장·지우기 실패는 무엇이 실패했는지 남기고 적은 값은 그대로다', () => {
    const before = ready()
    const failed = run(before, { type: 'saveStart' }, { type: 'storeFailed', what: 'save' })
    expect(failed.storeError).toBe('save')
    expect(failed.store).toBeNull()
    expect(failed.cards).toEqual(before.cards)
    expect(run(failed, { type: 'saveStart' }).storeError).toBeNull()
    const delFailed = run(start(), { type: 'open', notice: AUG }, { type: 'deleteStart' }, { type: 'storeFailed', what: 'delete' })
    expect([delFailed.storeError, delFailed.id]).toEqual(['delete', 'aug'])
  })

  it('AC-3507.3: 새로 만들기는 목록만 두고 처음으로 돌아간다', () => {
    const s = run(typed(start(), 0, { name: '학회' }), { type: 'memo', text: '글' }, { type: 'listLoaded', result: [AUG] }, { type: 'new' })
    expect(s).toEqual({ ...start(), list: { kind: 'ok', items: [AUG] } })
  })
})

describe('AC-3506.3: 그림 파일 실패 표시', () => {
  it('AC-3506.3: 실패 표시를 켜고 끈다', () => {
    const s = run(start(), { type: 'imageFailed', failed: true })
    expect(s.imageFailed).toBe(true)
    expect(run(s, { type: 'imageFailed', failed: false }).imageFailed).toBe(false)
  })
})
