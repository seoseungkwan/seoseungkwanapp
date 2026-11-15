import { describe, expect, it } from 'vitest'
import { BLANK_GUIDE, checkGuideValue, guideProblems, savableGuide } from '@/lib/forms/guide'
import { checkDrawing } from '@/lib/forms/guideDrawing'
import type { GuideContent, GuideDrawing, GuideField, GuideLine, SavedGuide } from '@/types/formGuide'
import {
  blankLine,
  drawingAnswerOf,
  guideAnswerOf,
  guideReducer,
  initialGuideState,
  isDirty,
  readyGuide,
  visibleProblems,
  type GuideAction,
  type GuideState,
} from './guideState'

// 환자 안내문 화면 상태 바꾸기(순수 reducer)와 거기서 끌어내는 값 (spec forms-guide TASK-8, design.md 9절, 시안 ?s=screen).
// 휴진 안내 formsState.test.ts와 같은 모양. 부르기·저장·그림은 화면이 하고 결과만 동작으로 보낸다

const L = (text: string, em = ''): GuideLine => ({ text, em })

// 받은 값을 고치지 않는지 보려고 시험 값은 얼려 둔다(엄격 모드라 고치면 바로 던진다)
function frozen<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(frozen)
    Object.freeze(value)
  }
  return value
}

// 요청서 예시 1·5 (design.md 10절 부록, guide.test.ts와 같은 값)
const INSURANCE: GuideContent = frozen({
  tag: '보험 서류 안내', subtitle: '보험사에 낼 서류는', big1: '수납할 때', big2: '말씀해 주세요', firstSmall: false,
  boxTop: '이렇게 말씀해 주세요', boxBottom: '"보험 서류 필요해요"', picture: 'document', drawing: null, bandTitle: '이런 서류가 필요하실 때', mark: 'check',
  lines: [L('진단서'), L('진료비 영수증'), L('진료비 세부내역서'), L('통원 확인서')], note: '필요한 서류는 보험사마다 다르니 미리 확인해 주세요',
})
const WAITING: GuideContent = frozen({
  tag: '진료 시작 전 안내', subtitle: '지금은 진료 시작 전입니다', big1: '순서 대기표를', big2: '적어 주세요', firstSmall: false,
  boxTop: '순서 대기표는', boxBottom: '왼쪽 아래에 있습니다', picture: 'clock', drawing: null, bandTitle: '', mark: 'number',
  lines: [L('순서 대기표를 작성해 주세요'), L('자리에 앉아 기다려 주세요'), L('적으신 순서대로 접수해 드립니다')], note: '진료는 오전 9시, 오후 2시에 시작합니다',
})
// AI로 그린 그림 둘(시안 go=draw의 '휠체어'를 줄인 것과 '우산')
const WHEELCHAIR: GuideDrawing = frozen({
  subject: '휠체어',
  shapes: [
    { kind: 'circle', nums: [78, 108, 34], d: '', fill: 'yellow', stroke: 'dark', width: 9 },
    { kind: 'path', nums: [], d: 'M58 46 L58 90 L108 90', fill: 'none', stroke: 'dark', width: 10 },
  ],
})
const UMBRELLA: GuideDrawing = frozen({
  subject: '우산',
  shapes: [
    { kind: 'path', nums: [], d: 'M20 90 Q85 10 150 90 Z', fill: 'yellow', stroke: 'dark', width: 8 },
    { kind: 'line', nums: [85, 90, 85, 150], d: '', fill: 'none', stroke: 'dark', width: 8 },
  ],
})
const DRAWN: GuideContent = frozen({ ...structuredClone(INSURANCE), tag: '휠체어 안내', picture: 'custom', drawing: structuredClone(WHEELCHAIR) })

const A: SavedGuide = frozen({ id: 'a', updatedAt: '2026-11-15T01:00:00.000Z', content: structuredClone(INSURANCE) })
const B: SavedGuide = frozen({ id: 'b', updatedAt: '2026-11-14T01:00:00.000Z', content: structuredClone(WAITING) })
const C: SavedGuide = frozen({ id: 'c', updatedAt: '2026-11-13T01:00:00.000Z', content: structuredClone(DRAWN) })

const run = (state: GuideState, ...actions: GuideAction[]) => actions.reduce(guideReducer, state)
const start = () => initialGuideState()
const typed = (state: GuideState, patch: Partial<Record<GuideField, string>>) =>
  run(state, ...Object.entries(patch).map(([field, value]) => ({ type: 'field', field, value }) as GuideAction))

describe('AC-4506.4·AC-4507.3: 새 안내문', () => {
  it('AC-4506.4: BLANK_GUIDE와 같은 값의 새 객체로 시작한다(얼린 값을 그대로 쓰지 않는다)', () => {
    const s = start()
    expect(s).toEqual({
      memo: '',
      tidying: false,
      tidyError: null,
      truncated: false,
      subject: '',
      drawingBusy: false,
      drawError: null,
      id: null,
      content: BLANK_GUIDE,
      baseline: null,
      list: { kind: 'loading' },
      store: null,
      storeError: null,
      imageFailed: false,
    })
    expect(s.content).not.toBe(BLANK_GUIDE)
    expect(Object.isFrozen(s.content) || Object.isFrozen(s.content.lines) || Object.isFrozen(s.content.lines[0])).toBe(false)
    expect(start().content).not.toBe(s.content)
    expect(blankLine()).toEqual({ text: '', em: '' })
  })
})

describe('AC-4501.3: 도구를 오가도 고치던 값이 남는다', () => {
  it('AC-4501.3: 도구 바꾸기 동작은 없고(화면은 숨기기만 한다), 목록 읽기·그림 파일 표시는 적은 글·그릴 것·칸을 바꾸지 않는다', () => {
    const before = typed(run(start(), { type: 'memo', text: '보험 서류 안내' }, { type: 'subject', text: '휠체어' }), { tag: '보험 서류 안내' })
    const s = run(before, { type: 'listLoading' }, { type: 'listLoaded', result: [A] }, { type: 'imageFailed', failed: true }, { type: 'imageFailed', failed: false })
    expect([s.memo, s.subject, s.content, s.id]).toEqual([before.memo, before.subject, before.content, before.id])
    expect(isDirty(s)).toBe(true)
  })
})

describe('AC-4506.1·AC-4506.3: 대충 적기·정리하기', () => {
  it('AC-4506.1: 적은 글은 500자까지만 들어가고(글자 수로 센다) 지난 정리 오류를 지운다', () => {
    expect(Array.from(run(start(), { type: 'memo', text: '가'.repeat(600) }).memo)).toHaveLength(500)
    const s = run(start(), { type: 'tidyFailed', code: 'E-FORMS-PRIVATE' }, { type: 'memo', text: '보험 서류' })
    expect(s.tidyError).toBeNull()
  })

  it('AC-4506.3: 기다리는 동안 tidying이고 적은 글·칸은 그대로다', () => {
    const before = typed(run(start(), { type: 'memo', text: '보험 서류 필요하면 수납할 때' }), { tag: '보험 안내' })
    const s = run(before, { type: 'tidyStart' })
    expect(s.tidying).toBe(true)
    expect(s.tidyError).toBeNull()
    expect([s.memo, s.content]).toEqual([before.memo, before.content])
  })

  it.each(['E-FORMS-PRIVATE', 'E-AI-BUSY', 'E-AI-LIMIT', 'E-AI-FAILED'] as const)('AC-4506.3: %s 실패는 번호를 남기고 적은 글·칸은 그대로다', (code) => {
    const before = typed(run(start(), { type: 'memo', text: '보험 서류 필요하면 수납할 때' }), { tag: '보험 안내', big1: '수납할 때' })
    const s = run(before, { type: 'tidyStart' }, { type: 'tidyFailed', code })
    expect(s.tidyError).toBe(code)
    expect(s.tidying).toBe(false)
    expect([s.memo, s.content]).toEqual([before.memo, before.content])
  })
})

describe('AC-4506.2: 정리 답으로 칸 채우기', () => {
  it('AC-4506.2: 답이 오면 칸 12개(머리표~아래 작은 글, 줄·강조 포함)가 모두 답으로 바뀌고 적은 글은 그대로다', () => {
    const before = run(start(), { type: 'open', guide: B }, { type: 'memo', text: '보험 서류 필요하면 수납할 때' }, { type: 'tidyStart' })
    const s = run(before, { type: 'tidyDone', guide: INSURANCE, truncated: false })
    expect(s.content).toEqual(INSURANCE)
    expect(s.content).not.toBe(INSURANCE)
    expect(s.content.lines).not.toBe(INSURANCE.lines)
    expect([s.tidying, s.tidyError, s.truncated, s.memo, s.id]).toEqual([false, null, false, before.memo, 'b'])
  })

  it('AC-4506.2: 지금 그림이 AI로 그린 그림(custom)이면 그림과 drawing은 그대로다', () => {
    const s = run(start(), { type: 'open', guide: C }, { type: 'tidyDone', guide: WAITING, truncated: false })
    expect(s.content).toEqual({ ...WAITING, picture: 'custom', drawing: WHEELCHAIR })
  })

  it('AC-4506.2·AC-4513.3: 다른 그림을 골라 둔 상태면 그림은 답으로 바뀌고, 남겨 둔 drawing은 그대로다', () => {
    const s = run(start(), { type: 'drawDone', drawing: WHEELCHAIR }, { type: 'picture', picture: 'knee' }, { type: 'tidyDone', guide: INSURANCE, truncated: false })
    expect(s.content).toEqual({ ...INSURANCE, drawing: WHEELCHAIR })
  })

  it('AC-4506.2: 줄이 넘쳐 앞 4개만 넣었다는 표시를 남기고, 다음 정리를 시작하면 지운다', () => {
    const s = run(start(), { type: 'tidyDone', guide: INSURANCE, truncated: true })
    expect(s.truncated).toBe(true)
    expect(run(s, { type: 'tidyStart' }).truncated).toBe(false)
  })

  it('AC-4506.2: 한도를 넘는 칸도 자르지 않고 받아 칸 까닭으로 알린다', () => {
    const long: GuideContent = { ...structuredClone(INSURANCE), tag: '가'.repeat(12), lines: [L('나'.repeat(30))] }
    const s = run(start(), { type: 'tidyDone', guide: long, truncated: false })
    expect([s.content.tag, s.content.lines]).toEqual([long.tag, long.lines])
    expect(visibleProblems(s)).toMatchObject({ tag: '10자까지 적을 수 있어요', line0: '28자까지 적을 수 있어요' })
    expect(readyGuide(s)).toBeNull()
  })
})

describe('AC-4513.2: AI로 그림 그리기', () => {
  it('AC-4513.2: 그릴 것은 20자까지만 들어가고(글자 수로 센다) 지난 그리기 오류를 지운다', () => {
    expect(Array.from(run(start(), { type: 'subject', text: '가'.repeat(30) }).subject)).toHaveLength(20)
    expect(run(start(), { type: 'drawFailed', code: 'E-AI-BUSY' }, { type: 'subject', text: '우산' }).drawError).toBeNull()
  })

  it('AC-4513.2: 기다리는 동안 drawingBusy이고 칸·그림은 그대로다', () => {
    const before = run(start(), { type: 'open', guide: A }, { type: 'subject', text: '휠체어' })
    const s = run(before, { type: 'drawStart' })
    expect([s.drawingBusy, s.drawError]).toEqual([true, null])
    expect([s.content, s.subject]).toEqual([before.content, before.subject])
  })

  it('AC-4513.2: 답이 오면 그림이 AI로 그린 그림(custom)이 되고 앞에 그린 그림은 버린다(다른 칸은 그대로)', () => {
    const before = run(start(), { type: 'open', guide: A })
    const s = run(before, { type: 'drawStart' }, { type: 'drawDone', drawing: WHEELCHAIR })
    expect([s.drawingBusy, s.drawError]).toEqual([false, null])
    expect(s.content).toEqual({ ...INSURANCE, picture: 'custom', drawing: WHEELCHAIR })
    expect(run(s, { type: 'drawDone', drawing: UMBRELLA }).content).toEqual({ ...INSURANCE, picture: 'custom', drawing: UMBRELLA })
  })

  it.each(['E-FORMS-PRIVATE', 'E-AI-BUSY', 'E-AI-LIMIT', 'E-AI-FAILED'] as const)('AC-4513.2: %s 실패는 번호를 남기고 지금 그림은 그대로다', (code) => {
    const before = run(start(), { type: 'open', guide: C }, { type: 'subject', text: '우산' })
    const s = run(before, { type: 'drawStart' }, { type: 'drawFailed', code })
    expect([s.drawError, s.drawingBusy]).toEqual([code, false])
    expect([s.content, s.subject]).toEqual([before.content, before.subject])
  })
})

describe('AC-4513.3: 그린 그림과 고르기', () => {
  it('AC-4513.3: 16개 중 하나나 없음을 골라도 그린 그림은 남아 다시 고를 수 있다', () => {
    let s = run(start(), { type: 'drawDone', drawing: WHEELCHAIR }, { type: 'picture', picture: 'knee' })
    expect([s.content.picture, s.content.drawing]).toEqual(['knee', WHEELCHAIR])
    s = run(s, { type: 'picture', picture: null })
    expect([s.content.picture, s.content.drawing]).toEqual([null, WHEELCHAIR])
    s = run(s, { type: 'picture', picture: 'custom' })
    expect([s.content.picture, s.content.drawing]).toEqual(['custom', WHEELCHAIR])
  })

  it('AC-4513.3: 그린 그림이 없으면 custom을 고를 수 없다(그대로 둔다)', () => {
    const before = run(start(), { type: 'picture', picture: 'spine' })
    expect(run(before, { type: 'picture', picture: 'custom' })).toBe(before)
  })

  it('AC-4513.3: readyGuide는 savableGuide 값을 검사한 것이라, 다른 그림을 고르면 drawing 없이 저장·뽑기 값이 된다', () => {
    const drawn = run(start(), { type: 'open', guide: A }, { type: 'drawDone', drawing: WHEELCHAIR })
    expect(readyGuide(drawn)).toEqual({ ...INSURANCE, picture: 'custom', drawing: WHEELCHAIR })
    const picked = run(drawn, { type: 'picture', picture: 'document' })
    expect(readyGuide(picked)).toEqual(INSURANCE)
    expect(readyGuide(picked)).toEqual(checkGuideValue(savableGuide(picked.content)))
    expect(picked.content.drawing).toEqual(WHEELCHAIR)
  })

  it('AC-4513.3: 새로 만들기는 drawing·그릴 것도 비우고, 열기는 저장한 그림 그대로다', () => {
    const drawn = run(start(), { type: 'subject', text: '휠체어' }, { type: 'drawDone', drawing: WHEELCHAIR }, { type: 'picture', picture: 'knee' })
    const fresh = run(drawn, { type: 'new' })
    expect([fresh.content.picture, fresh.content.drawing, fresh.subject]).toEqual([null, null, ''])
    const opened = run(drawn, { type: 'open', guide: C })
    expect(opened.content).toEqual(DRAWN)
    expect(opened.content).not.toBe(C.content)
  })
})

describe('AC-4506.4: 칸 고치기', () => {
  it.each(['tag', 'subtitle', 'big1', 'big2', 'boxTop', 'boxBottom', 'bandTitle', 'note'] as const)('AC-4506.4: %s 칸은 적은 글 그대로 들어간다(자르거나 떼지 않는다)', (field) => {
    const value = ` ${'가'.repeat(40)} `
    const s = typed(start(), { [field]: value })
    expect(s.content).toEqual({ ...BLANK_GUIDE, [field]: value })
  })

  it('AC-4506.4: 윗줄 작게·줄 표시를 바꾼다', () => {
    const s = run(start(), { type: 'firstSmall', value: true }, { type: 'mark', mark: 'number' })
    expect([s.content.firstSmall, s.content.mark]).toEqual([true, 'number'])
    expect(run(s, { type: 'firstSmall', value: false }, { type: 'mark', mark: 'check' }).content).toEqual(BLANK_GUIDE)
  })

  it('AC-4506.4: 줄 글과 노랑 강조를 고치고, 없는 줄은 무시한다', () => {
    const s = run(start(), { type: 'addLine' }, { type: 'line', index: 1, field: 'text', value: '주 2회까지' }, { type: 'line', index: 1, field: 'em', value: '주 2회' })
    expect(s.content.lines).toEqual([L(''), L('주 2회까지', '주 2회')])
    expect(run(s, { type: 'line', index: 2, field: 'text', value: '없는 줄' })).toBe(s)
  })

  it('AC-4506.4: 줄은 4개까지만 더해진다(새 줄은 빈 줄)', () => {
    const s = run(start(), { type: 'addLine' }, { type: 'addLine' }, { type: 'addLine' }, { type: 'addLine' }, { type: 'addLine' })
    expect(s.content.lines).toEqual([blankLine(), blankLine(), blankLine(), blankLine()])
  })

  it('AC-4506.4: 줄을 빼면 그 줄만 빠지고, 1개 남으면 빼지 않는다', () => {
    const s = run(start(), { type: 'open', guide: B }, { type: 'removeLine', index: 1 })
    expect(s.content.lines).toEqual([WAITING.lines[0], WAITING.lines[2]])
    const one = run(s, { type: 'removeLine', index: 0 })
    expect(one.content.lines).toEqual([WAITING.lines[2]])
    expect(run(one, { type: 'removeLine', index: 0 })).toBe(one)
    expect(run(s, { type: 'removeLine', index: 5 })).toBe(s)
  })
})

describe('AC-4506.4: 칸 아래 까닭 visibleProblems', () => {
  it('AC-4506.4: 새 안내문이 아직 모두 빈 칸이면 필수 칸 까닭(머리표·작은 제목·큰 문구·줄)을 숨긴다', () => {
    const s = start()
    expect(Object.keys(guideProblems(s.content)).sort()).toEqual(['big1', 'big2', 'lines', 'subtitle', 'tag'])
    expect(visibleProblems(s)).toEqual({})
    expect(visibleProblems(run(typed(s, { tag: '  ' }), { type: 'addLine' }, { type: 'mark', mark: 'number' }))).toEqual({})
    expect(readyGuide(s)).toBeNull()
  })

  it('AC-4506.4: 한 칸이라도 적으면 나머지 필수 칸 까닭이 보인다(문구는 칸 검사 그대로)', () => {
    const s = typed(start(), { tag: '보험 서류 안내' })
    expect(visibleProblems(s)).toEqual(guideProblems(s.content))
    expect(visibleProblems(s)).toMatchObject({ subtitle: '작은 제목을 적어 주세요', big1: '큰 문구 윗줄을 적어 주세요', lines: '줄을 하나 이상 적어 주세요' })
    const em = run(start(), { type: 'line', index: 0, field: 'em', value: '강조' })
    expect(visibleProblems(em)).toMatchObject({ tag: '머리표를 적어 주세요', em0: '그 줄에 있는 낱말만 강조할 수 있어요' })
  })

  it('AC-4506.4: 연 안내문을 모두 비우면 필수 칸 까닭이 보인다(새 안내문만 숨긴다)', () => {
    const fields = ['tag', 'subtitle', 'big1', 'big2', 'boxTop', 'boxBottom', 'bandTitle', 'note'] as const
    let s = run(start(), { type: 'open', guide: B }, { type: 'removeLine', index: 2 }, { type: 'removeLine', index: 1 })
    s = run(typed(s, Object.fromEntries(fields.map((f) => [f, '']))), { type: 'line', index: 0, field: 'text', value: '' })
    expect(visibleProblems(s)).toMatchObject({ tag: '머리표를 적어 주세요', lines: '줄을 하나 이상 적어 주세요' })
  })
})

describe('AC-4507.1·AC-4507.3·AC-4507.4: 저장·목록·지우기', () => {
  const ready = () => run(start(), { type: 'tidyDone', guide: INSURANCE, truncated: false })

  it('AC-4507.4: 목록 읽기 결과를 담는다(실패는 failed, 다시 읽으면 loading)', () => {
    expect(run(start(), { type: 'listLoaded', result: [A, B] }).list).toEqual({ kind: 'ok', items: [A, B] })
    expect(run(start(), { type: 'listLoaded', result: 'failed' }).list).toEqual({ kind: 'failed' })
    expect(run(start(), { type: 'listLoaded', result: 'failed' }, { type: 'listLoading' }).list).toEqual({ kind: 'loading' })
  })

  it('AC-4507.1: 저장하면 그 줄을 연 안내문으로 삼고 목록 맨 위에 둔다(같은 id는 하나)', () => {
    let s = run(ready(), { type: 'listLoaded', result: [B] }, { type: 'saveStart' })
    expect(s.store).toBe('saving')
    s = run(s, { type: 'saved', guide: A })
    expect([s.id, s.store, s.storeError]).toEqual(['a', null, null])
    expect(s.list).toEqual({ kind: 'ok', items: [A, B] })
    expect(isDirty(s)).toBe(false)
    const again = run(s, { type: 'saved', guide: { ...A, updatedAt: '2026-11-16T00:00:00.000Z' } })
    expect(again.list.kind === 'ok' && again.list.items.map((g) => g.id)).toEqual(['a', 'b'])
  })

  it('AC-4507.1: 목록을 못 읽었거나 읽는 중에 저장하면 목록 상태는 그대로다', () => {
    for (const list of [{ type: 'listLoaded', result: 'failed' }, { type: 'listLoading' }] as const) {
      const s = run(ready(), list, { type: 'saveStart' }, { type: 'saved', guide: A })
      expect([s.id, s.store]).toEqual(['a', null])
      expect(s.list).toEqual(run(ready(), list).list)
    }
  })

  it('AC-4507.1·AC-4513.3: 다른 그림을 골라 저장해도 남겨 둔 그린 그림은 칸에 남고, 바뀐 내용도 없다', () => {
    const s = run(start(), { type: 'drawDone', drawing: WHEELCHAIR }, { type: 'tidyDone', guide: INSURANCE, truncated: false }, { type: 'picture', picture: 'document' })
    const saved = run(s, { type: 'saveStart' }, { type: 'saved', guide: A })
    expect(saved.content.drawing).toEqual(WHEELCHAIR)
    expect(isDirty(saved)).toBe(false)
    expect(isDirty(run(saved, { type: 'picture', picture: 'custom' }))).toBe(true)
  })

  it('AC-4507.3: 새 안내문은 칸을 하나라도 바꾸면 바뀐 내용이 있다(적은 글·그릴 것·공백만은 아님)', () => {
    expect(isDirty(start())).toBe(false)
    expect(isDirty(run(start(), { type: 'memo', text: '아무 글' }, { type: 'subject', text: '우산' }))).toBe(false)
    expect(isDirty(typed(start(), { tag: '   ' }))).toBe(false)
    expect(isDirty(typed(start(), { tag: '보험' }))).toBe(true)
    expect(isDirty(run(start(), { type: 'mark', mark: 'number' }))).toBe(true)
    expect(isDirty(run(start(), { type: 'drawDone', drawing: WHEELCHAIR }))).toBe(true)
  })

  it('AC-4507.3: 연 뒤에는 그 값과 다를 때만 바뀐 내용이 있다(되돌리면 아님, 앞뒤 공백은 같다고 본다)', () => {
    const opened = run(start(), { type: 'memo', text: '글' }, { type: 'listLoaded', result: [A] }, { type: 'open', guide: A })
    expect([opened.id, opened.memo, opened.subject, opened.list]).toEqual(['a', '', '', { kind: 'ok', items: [A] }])
    expect(opened.content).toEqual(INSURANCE)
    expect(isDirty(opened)).toBe(false)
    const changed = typed(opened, { tag: '보험 서류' })
    expect(isDirty(changed)).toBe(true)
    expect(isDirty(typed(changed, { tag: ' 보험 서류 안내 ' }))).toBe(false)
    expect(isDirty(run(opened, { type: 'removeLine', index: 3 }))).toBe(true)
    expect(isDirty(run(opened, { type: 'firstSmall', value: true }))).toBe(true)
  })

  it('AC-4507.3·AC-4513.3: 그린 그림을 연 뒤 다른 그림을 고르면 바뀐 내용이 있고, 다시 그린 그림을 고르면 없다', () => {
    const opened = run(start(), { type: 'open', guide: C })
    const picked = run(opened, { type: 'picture', picture: 'knee' })
    expect(isDirty(picked)).toBe(true)
    expect(isDirty(run(picked, { type: 'picture', picture: 'custom' }))).toBe(false)
    expect(isDirty(run(opened, { type: 'drawDone', drawing: UMBRELLA }))).toBe(true)
  })

  it('AC-4507.3: 지우면 목록에서 빼고 새 안내문이 된다', () => {
    const s = run(start(), { type: 'listLoaded', result: [A, B] }, { type: 'open', guide: B }, { type: 'deleteStart' })
    expect(s.store).toBe('deleting')
    const done = run(s, { type: 'deleted', id: 'b' })
    expect(done).toEqual({ ...start(), list: { kind: 'ok', items: [A] } })
  })

  it('AC-4507.3: 새로 만들기는 목록만 두고 처음으로 돌아간다', () => {
    const s = run(typed(start(), { tag: '보험' }), { type: 'memo', text: '글' }, { type: 'listLoaded', result: [A] }, { type: 'new' })
    expect(s).toEqual({ ...start(), list: { kind: 'ok', items: [A] } })
  })

  it('AC-4507.4: 저장·지우기 실패는 무엇이 실패했는지 남기고 적은 값은 그대로다', () => {
    const before = ready()
    const failed = run(before, { type: 'saveStart' }, { type: 'storeFailed', what: 'save' })
    expect([failed.storeError, failed.store]).toEqual(['save', null])
    expect(failed.content).toEqual(before.content)
    expect(run(failed, { type: 'saveStart' }).storeError).toBeNull()
    const delFailed = run(start(), { type: 'open', guide: A }, { type: 'deleteStart' }, { type: 'storeFailed', what: 'delete' })
    expect([delFailed.storeError, delFailed.id, delFailed.store]).toEqual(['delete', 'a', null])
    expect(delFailed.content).toEqual(INSURANCE)
  })

  it('AC-4507.4: 그림 파일 실패 표시를 켜고 끈다', () => {
    const s = run(start(), { type: 'imageFailed', failed: true })
    expect(s.imageFailed).toBe(true)
    expect(run(s, { type: 'imageFailed', failed: false }).imageFailed).toBe(false)
  })
})

describe('AC-4506.2·AC-4506.3: 정리 답 읽기 guideAnswerOf', () => {
  it('AC-4506.2: 200 { guide, truncated }는 안내 내용으로 읽는다(새 객체)', () => {
    const answer = guideAnswerOf(200, { guide: structuredClone(INSURANCE), truncated: true })
    expect(answer).toEqual({ kind: 'ok', guide: INSURANCE, truncated: true })
    expect(guideAnswerOf(200, { guide: WAITING, truncated: false })).toEqual({ kind: 'ok', guide: WAITING, truncated: false })
    const same = guideAnswerOf(200, { guide: INSURANCE, truncated: false })
    expect(same.kind === 'ok' && (same.guide === INSURANCE || same.guide.lines === INSURANCE.lines)).toBe(false)
  })

  it('AC-4506.2: 칸 한도를 넘는 글·그림 없음(null)도 모양만 맞으면 받는다(칸 검사가 알린다)', () => {
    const over = { ...structuredClone(INSURANCE), tag: '가'.repeat(30), note: '나'.repeat(50), picture: null, lines: [L('다'.repeat(40), '다다')] }
    expect(guideAnswerOf(200, { guide: over, truncated: false })).toEqual({ kind: 'ok', guide: over, truncated: false })
  })

  it.each([
    [422, 'E-FORMS-PRIVATE'],
    [503, 'E-AI-BUSY'],
    [402, 'E-AI-LIMIT'],
    [502, 'E-AI-FAILED'],
  ] as const)('AC-4506.3: %s { code: %s }는 그 번호다', (status, code) => {
    expect(guideAnswerOf(status, { code })).toEqual({ kind: 'error', code })
  })

  const g = (patch: Record<string, unknown>) => ({ ...structuredClone(INSURANCE), ...patch })
  const noNote = Object.fromEntries(Object.entries(structuredClone(INSURANCE)).filter(([key]) => key !== 'note'))
  it.each([
    ['몸통 없는 401', 401, null],
    ['몸통 없는 403', 403, null],
    ['돌려보냄(0)', 0, null],
    ['모르는 번호', 500, { code: 'E-SOMETHING' }],
    ['휴진 안내만 쓰는 번호', 422, { code: 'E-FORMS-NO-DATE' }],
    ['200인데 JSON 아님', 200, null],
    ['200인데 truncated 없음', 200, { guide: INSURANCE }],
    ['200인데 guide 없음', 200, { truncated: false }],
    ['200인데 열쇠 하나 덜', 200, { guide: noNote, truncated: false }],
    ['200인데 열쇠 하나 더', 200, { guide: g({ memo: '글' }), truncated: false }],
    ['200인데 drawing 있음', 200, { guide: g({ drawing: WHEELCHAIR }), truncated: false }],
    ['200인데 그림 custom', 200, { guide: g({ picture: 'custom' }), truncated: false }],
    ['200인데 그림 none', 200, { guide: g({ picture: 'none' }), truncated: false }],
    ['200인데 모르는 그림', 200, { guide: g({ picture: 'umbrella' }), truncated: false }],
    ['200인데 모르는 줄 표시', 200, { guide: g({ mark: 'star' }), truncated: false }],
    ['200인데 윗줄 작게가 글', 200, { guide: g({ firstSmall: 'true' }), truncated: false }],
    ['200인데 글 칸이 수', 200, { guide: g({ tag: 1 }), truncated: false }],
    ['200인데 줄 0개', 200, { guide: g({ lines: [] }), truncated: false }],
    ['200인데 줄 5개', 200, { guide: g({ lines: [L('가'), L('나'), L('다'), L('라'), L('마')] }), truncated: true }],
    ['200인데 줄이 배열 아님', 200, { guide: g({ lines: '진단서' }), truncated: false }],
    ['200인데 줄 열쇠 하나 더', 200, { guide: g({ lines: [{ text: '진단서', em: '', bold: true }] }), truncated: false }],
    ['200인데 줄 강조가 null', 200, { guide: g({ lines: [{ text: '진단서', em: null }] }), truncated: false }],
  ])('AC-4506.3: %s는 E-AI-FAILED다', (_label, status, body) => {
    expect(guideAnswerOf(status, body)).toEqual({ kind: 'error', code: 'E-AI-FAILED' })
  })
})

describe('AC-4513.2: 그림 답 읽기 drawingAnswerOf', () => {
  it('AC-4513.2: 200 { drawing }은 checkDrawing을 넘은 그림으로 읽는다', () => {
    expect(drawingAnswerOf(200, { drawing: structuredClone(WHEELCHAIR) })).toEqual({ kind: 'ok', drawing: WHEELCHAIR })
    const rough = { subject: ' 우산 ', shapes: [{ ...UMBRELLA.shapes[0], width: 8.04 }] }
    expect(drawingAnswerOf(200, { drawing: rough })).toEqual({ kind: 'ok', drawing: checkDrawing(rough) })
  })

  it.each([
    [422, 'E-FORMS-PRIVATE'],
    [503, 'E-AI-BUSY'],
    [402, 'E-AI-LIMIT'],
    [502, 'E-AI-FAILED'],
  ] as const)('AC-4513.2: %s { code: %s }는 그 번호다', (status, code) => {
    expect(drawingAnswerOf(status, { code })).toEqual({ kind: 'error', code })
  })

  it.each([
    ['잘못된 색', 200, { drawing: { subject: '우산', shapes: [{ ...UMBRELLA.shapes[0], fill: 'red' }] } }],
    ['도형 0개', 200, { drawing: { subject: '우산', shapes: [] } }],
    ['그릴 것 없음', 200, { drawing: { subject: '', shapes: UMBRELLA.shapes } }],
    ['drawing 없음', 200, {}],
    ['JSON 아님', 200, null],
    ['몸통 없는 401', 401, null],
    ['몸통 없는 403', 403, null],
    ['돌려보냄(0)', 0, null],
    ['모르는 번호', 500, { code: 'E-SOMETHING' }],
  ])('AC-4513.2: %s는 E-AI-FAILED다', (_label, status, body) => {
    expect(drawingAnswerOf(status, body)).toEqual({ kind: 'error', code: 'E-AI-FAILED' })
  })
})
