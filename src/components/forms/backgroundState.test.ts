import { describe, expect, it } from 'vitest'
import { autoTheme } from '@/lib/forms/themes'
import { MAX_BACKGROUNDS, type SavedBackground } from '@/types/formBackground'
import type { ClosureNotice, ThemePick } from '@/types/forms'
import {
  bgAnswerOf,
  bgReducer,
  canSaveTrial,
  initialBgState,
  isFull,
  posterLook,
  shownMode,
  type BgAction,
  type BgCode,
  type BgState,
  type Trial,
} from './backgroundState'

// 휴진 안내 '배경' 칸 상태(순수 reducer)와 거기서 끌어내는 값 (specs/forms-themes TASK-12, design.md 10-1절, 시안 screen.html).
// 부르기·저장·내려받기는 hook(useBackgrounds)이 하고 결과만 동작으로 보낸다. 16진수 색 글자를 쓰지 않는다(강조색은 모양만 맞춘 글)

// 받은 값을 고치지 않는지 보려고 시험 값은 얼려 둔다(엄격 모드라 고치면 바로 던진다). Uint8Array는 얼릴 수 없어 그대로 둔다
function frozen<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !ArrayBuffer.isView(value)) {
    Object.values(value).forEach(frozen)
    Object.freeze(value)
  }
  return value
}

const HOSPITAL = '11111111-1111-4111-8111-111111111111'
const idOf = (n: number) => `${String(n).padStart(8, '0')}-2222-4222-8222-222222222222`
const ACCENT_A = `#${'3a5f8c'}`
const ACCENT_B = `#${'7b2d4e'}`
function saved(n: number, words = `배경 ${n}`, accent = ACCENT_A): SavedBackground {
  const id = idOf(n)
  return frozen({ id, words, accent, thumb: '/9j/AAAA', path: `${HOSPITAL}/${id}.jpg`, createdAt: `2026-11-15T0${n % 10}:00:00.000Z` })
}
const A = saved(1, '봄 벚꽃', ACCENT_A)
const B = saved(2, '겨울 눈', ACCENT_B)
const C = saved(3, '추석 보름달')
const pickOf = (item: SavedBackground): ThemePick => `bg-${item.id}`

const JPEG = '/9j/4AAQSkZJRgABAQ=='
const TRIAL: Trial = {
  words: '가을 단풍',
  bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
  image: 'data:image/jpeg;base64,/9j/4AA=',
  accent: ACCENT_B,
  thumb: '/9j/BBBB',
}
const TRIAL2: Trial = { ...TRIAL, image: 'data:image/jpeg;base64,/9j/5BB=', thumb: '/9j/CCCC' }

// 어린이날 카드가 있는 5월 안내문: 저절로 테마 = children
const NOTICE: ClosureNotice = frozen({
  year: 2026,
  month: 5,
  cards: [{ start: '2026-05-05', end: null, name: '어린이날', status: '휴진' }],
  theme: null,
})
const AUTO = autoTheme(NOTICE)
const withPick = (theme: ThemePick | null): ClosureNotice => ({ ...NOTICE, theme })

const run = (state: BgState, ...actions: BgAction[]) => actions.reduce(bgReducer, state)
const start = () => initialBgState()
const listed = (...items: SavedBackground[]) => run(start(), { type: 'listLoaded', result: items })

const CODES: BgCode[] = ['E-FORMS-PRIVATE', 'E-FORMS-BG-LIMIT', 'E-FORMS-BG-QUOTA', 'E-FORMS-BG-FAILED', 'E-AI-BUSY']

describe('AC-4611.3: 처음 상태', () => {
  it("AC-4611.3: 테마 그림 칸·빈 말·만든 배경 없음·목록은 아직 읽지 않음(idle)·그림 없음", () => {
    expect(start()).toEqual({
      mode: 'theme',
      words: '',
      making: false,
      makeError: null,
      trial: null,
      saving: false,
      deleting: false,
      storeError: false,
      list: { kind: 'idle' },
      images: {},
    })
  })

  it('AC-4611.3: 부를 때마다 새 객체다(서로 섞이지 않는다)', () => {
    expect(start()).not.toBe(start())
    expect(start().images).not.toBe(start().images)
  })
})

describe('AC-4611.3·AC-4611.5·AC-4611.6: 만들기 동작', () => {
  it("AC-4611.3: mode는 보이는 칸을 바꾸고 그 밖은 그대로다", () => {
    const s = run(start(), { type: 'makeDone', trial: TRIAL })
    const mine = run(s, { type: 'mode', mode: 'mine' })
    expect(mine).toEqual({ ...s, mode: 'mine' })
    expect(run(mine, { type: 'mode', mode: 'theme' })).toEqual({ ...s, mode: 'theme' })
  })

  it('AC-4611.3: words는 적은 말을 30자(그림 문자 하나는 한 글자)까지 자르고, 지난 만들기 오류를 지운다', () => {
    const failed = run(start(), { type: 'makeFailed', code: 'E-FORMS-BG-LIMIT' })
    const s = run(failed, { type: 'words', text: '봄 벚꽃' })
    expect(s.words).toBe('봄 벚꽃')
    expect(s.makeError).toBeNull()
    expect(run(start(), { type: 'words', text: '가'.repeat(31) }).words).toBe('가'.repeat(30))
    expect(run(start(), { type: 'words', text: '🌸'.repeat(31) }).words).toBe('🌸'.repeat(30))
  })

  it('AC-4611.3: makeStart는 만드는 중으로 두고 지난 오류를 지운다. 만든 배경은 다시 만드는 동안 그대로다', () => {
    const s = run(start(), { type: 'makeDone', trial: TRIAL }, { type: 'makeFailed', code: 'E-AI-BUSY' }, { type: 'makeStart' })
    expect(s.making).toBe(true)
    expect(s.makeError).toBeNull()
    expect(s.trial).toBe(TRIAL)
  })

  it('AC-4611.3: makeDone은 만든 배경을 두고 만드는 중을 끝낸다', () => {
    const s = run(start(), { type: 'words', text: '가을 단풍' }, { type: 'makeStart' }, { type: 'makeDone', trial: TRIAL })
    expect(s.making).toBe(false)
    expect(s.makeError).toBeNull()
    expect(s.trial).toBe(TRIAL)
    expect(s.words).toBe('가을 단풍')
  })

  it('AC-4611.5: [다시 만들기]가 끝나면 앞 그림을 버리고 새 그림이 만든 배경이 된다', () => {
    const s = run(start(), { type: 'makeDone', trial: TRIAL }, { type: 'makeStart' }, { type: 'makeDone', trial: TRIAL2 })
    expect(s.trial).toBe(TRIAL2)
  })

  it('AC-4611.5: discard([안 쓰기])는 만든 배경을 버리고 적은 말은 그대로 둔다', () => {
    const s = run(start(), { type: 'words', text: '가을 단풍' }, { type: 'makeDone', trial: TRIAL }, { type: 'discard' })
    expect(s.trial).toBeNull()
    expect(s.words).toBe('가을 단풍')
  })

  it("AC-4611.5: 저장 실패 뒤 [안 쓰기]면 저장 오류도 지운다('만든 배경은 그대로 남아 있어요'가 남지 않게)", () => {
    const s = run(listed(A), { type: 'makeDone', trial: TRIAL }, { type: 'saveStart' }, { type: 'storeFailed' }, { type: 'discard' })
    expect(s.trial).toBeNull()
    expect(s.storeError).toBe(false)
  })

  it.each(CODES)('AC-4611.6: makeFailed(%s)는 그 번호를 두고, 적은 말·만든 배경은 그대로다', (code) => {
    const before = run(start(), { type: 'mode', mode: 'mine' }, { type: 'words', text: '봄 벚꽃' }, { type: 'makeDone', trial: TRIAL }, { type: 'makeStart' })
    const s = run(before, { type: 'makeFailed', code })
    expect(s).toEqual({ ...before, making: false, makeError: code })
    expect(s.words).toBe('봄 벚꽃')
    expect(s.trial).toBe(TRIAL)
  })

  it('AC-4611.6: 만든 배경이 없을 때 실패해도 적은 말은 그대로이고 만든 배경은 없다', () => {
    const s = run(start(), { type: 'words', text: '봄 벚꽃' }, { type: 'makeStart' }, { type: 'makeFailed', code: 'E-FORMS-BG-FAILED' })
    expect(s.words).toBe('봄 벚꽃')
    expect(s.trial).toBeNull()
    expect(s.makeError).toBe('E-FORMS-BG-FAILED')
  })
})

describe('AC-4611.4: 저장 동작', () => {
  it('AC-4611.4: saveStart는 저장 중으로 두고 지난 저장 오류를 지운다', () => {
    const s = run(listed(A), { type: 'makeDone', trial: TRIAL }, { type: 'storeFailed' }, { type: 'saveStart' })
    expect(s.saving).toBe(true)
    expect(s.storeError).toBe(false)
  })

  it('AC-4611.4: saved(item, image)는 목록 맨 위에 넣고, 그림을 두고, 만든 배경을 비우고, 내 배경 칸으로 둔다', () => {
    const before = run(listed(A, B), { type: 'mode', mode: 'theme' }, { type: 'makeDone', trial: TRIAL }, { type: 'saveStart' })
    const s = run(before, { type: 'saved', item: C, image: TRIAL.image })
    expect(s.list).toEqual({ kind: 'ok', items: [C, A, B] })
    expect(s.images[C.id]).toEqual({ kind: 'ok', image: TRIAL.image })
    expect(s.trial).toBeNull()
    expect(s.mode).toBe('mine')
    expect(s.saving).toBe(false)
    expect(s.storeError).toBe(false)
  })

  it('AC-4611.4: 목록을 못 읽었으면(실패·아직) saved는 목록을 그대로 둔다(방금 것 하나만 있는 목록처럼 보이지 않게)', () => {
    for (const list of [run(start(), { type: 'listLoaded', result: 'failed' }), start(), run(start(), { type: 'listLoading' })]) {
      const s = run(list, { type: 'makeDone', trial: TRIAL }, { type: 'saveStart' }, { type: 'saved', item: C, image: TRIAL.image })
      expect(s.list).toEqual(list.list)
      expect(s.trial).toBeNull()
      expect(s.images[C.id]).toEqual({ kind: 'ok', image: TRIAL.image })
    }
  })

  it('AC-4611.4: storeFailed는 저장 중을 끝내고 오류를 두며, 만든 배경은 그대로다', () => {
    const s = run(listed(A), { type: 'makeDone', trial: TRIAL }, { type: 'saveStart' }, { type: 'storeFailed' })
    expect(s.saving).toBe(false)
    expect(s.storeError).toBe(true)
    expect(s.trial).toBe(TRIAL)
    expect(s.list).toEqual({ kind: 'ok', items: [A] })
  })

  it('AC-4611.4: canSaveTrial — 만든 배경이 있고, 저장 중이 아니고, 목록이 ok이며 30장 밑일 때만 참', () => {
    const items29 = Array.from({ length: MAX_BACKGROUNDS - 1 }, (_, i) => saved(i + 10))
    const items30 = Array.from({ length: MAX_BACKGROUNDS }, (_, i) => saved(i + 10))
    expect(canSaveTrial(run(listed(...items29), { type: 'makeDone', trial: TRIAL }))).toBe(true)
    expect(canSaveTrial(run(listed(), { type: 'makeDone', trial: TRIAL }))).toBe(true)
    expect(canSaveTrial(run(listed(...items30), { type: 'makeDone', trial: TRIAL }))).toBe(false)
    expect(canSaveTrial(listed(A))).toBe(false) // 만든 배경 없음
    expect(canSaveTrial(run(listed(A), { type: 'makeDone', trial: TRIAL }, { type: 'saveStart' }))).toBe(false)
    expect(canSaveTrial(run(start(), { type: 'listLoaded', result: 'failed' }, { type: 'makeDone', trial: TRIAL }))).toBe(false)
    expect(canSaveTrial(run(start(), { type: 'makeDone', trial: TRIAL }))).toBe(false) // 목록 아직(idle)
    expect(canSaveTrial(run(start(), { type: 'listLoading' }, { type: 'makeDone', trial: TRIAL }))).toBe(false)
  })

  it('AC-4611.4: isFull — 목록이 ok이고 30장일 때만 참(29장·목록 실패·아직은 거짓)', () => {
    const items29 = Array.from({ length: MAX_BACKGROUNDS - 1 }, (_, i) => saved(i + 10))
    const items30 = Array.from({ length: MAX_BACKGROUNDS }, (_, i) => saved(i + 10))
    expect(isFull(listed(...items30))).toBe(true)
    expect(isFull(listed(...items29))).toBe(false)
    expect(isFull(run(start(), { type: 'listLoaded', result: 'failed' }))).toBe(false)
    expect(isFull(start())).toBe(false)
    expect(isFull(run(start(), { type: 'listLoading' }))).toBe(false)
  })
})

describe('AC-4612.2: 목록·그림 동작', () => {
  it('AC-4612.2: listLoading → loading, listLoaded(목록) → ok, listLoaded(failed) → failed', () => {
    expect(run(start(), { type: 'listLoading' }).list).toEqual({ kind: 'loading' })
    expect(run(start(), { type: 'listLoading' }, { type: 'listLoaded', result: [A, B] }).list).toEqual({ kind: 'ok', items: [A, B] })
    expect(run(start(), { type: 'listLoading' }, { type: 'listLoaded', result: 'failed' }).list).toEqual({ kind: 'failed' })
    // [다시 읽기]: 실패에서 다시 loading
    expect(run(start(), { type: 'listLoaded', result: 'failed' }, { type: 'listLoading' }).list).toEqual({ kind: 'loading' })
  })

  it('AC-4612.2: imageLoading(id) → 내려받는 중, imageLoaded(id, 주소) → ok, imageLoaded(id, null) → failed. 다른 id는 그대로', () => {
    const loading = run(listed(A, B), { type: 'imageLoaded', id: B.id, image: 'data:image/jpeg;base64,/9j/B' }, { type: 'imageLoading', id: A.id })
    expect(loading.images).toEqual({ [A.id]: { kind: 'loading' }, [B.id]: { kind: 'ok', image: 'data:image/jpeg;base64,/9j/B' } })
    const ok = run(loading, { type: 'imageLoaded', id: A.id, image: 'data:image/jpeg;base64,/9j/A' })
    expect(ok.images[A.id]).toEqual({ kind: 'ok', image: 'data:image/jpeg;base64,/9j/A' })
    const failed = run(loading, { type: 'imageLoaded', id: A.id, image: null })
    expect(failed.images[A.id]).toEqual({ kind: 'failed' })
    expect(failed.images[B.id]).toEqual({ kind: 'ok', image: 'data:image/jpeg;base64,/9j/B' })
    // [다시 읽기]: 실패에서 다시 내려받는 중
    expect(run(failed, { type: 'imageLoading', id: A.id }).images[A.id]).toEqual({ kind: 'loading' })
  })

  it('AC-4612.2: 그림 동작은 앞 상태의 images 객체를 고치지 않는다', () => {
    const before = run(listed(A), { type: 'imageLoading', id: A.id })
    const snapshot = structuredClone(before.images)
    run(before, { type: 'imageLoaded', id: A.id, image: 'data:image/jpeg;base64,/9j/A' })
    expect(before.images).toEqual(snapshot)
  })

  it('AC-4612.2: deleteStart는 지우는 중으로 두고 지난 오류를 지운다. 실패(storeFailed)면 지우는 중을 끝내고 오류를 둔다', () => {
    const s = run(listed(A), { type: 'storeFailed' }, { type: 'deleteStart' })
    expect(s.deleting).toBe(true)
    expect(s.storeError).toBe(false)
    const failed = run(s, { type: 'storeFailed' })
    expect(failed.deleting).toBe(false)
    expect(failed.storeError).toBe(true)
    expect(failed.list).toEqual({ kind: 'ok', items: [A] })
  })

  it('AC-4612.2: deleted(id)는 목록과 그림에서 그것만 뺀다', () => {
    const before = run(
      listed(A, B, C),
      { type: 'imageLoaded', id: A.id, image: 'data:image/jpeg;base64,/9j/A' },
      { type: 'imageLoaded', id: B.id, image: 'data:image/jpeg;base64,/9j/B' },
      { type: 'deleteStart' },
    )
    const s = run(before, { type: 'deleted', id: A.id })
    expect(s.list).toEqual({ kind: 'ok', items: [B, C] })
    expect(A.id in s.images).toBe(false)
    expect(s.images[B.id]).toEqual({ kind: 'ok', image: 'data:image/jpeg;base64,/9j/B' })
    expect(s.deleting).toBe(false)
    expect(s.storeError).toBe(false)
  })

  it('AC-4612.2: 목록을 못 읽었을 때 deleted는 목록을 그대로 두고 그림만 뺀다', () => {
    const before = run(start(), { type: 'listLoaded', result: 'failed' }, { type: 'imageLoaded', id: A.id, image: 'data:image/jpeg;base64,/9j/A' })
    const s = run(before, { type: 'deleted', id: A.id })
    expect(s.list).toEqual({ kind: 'failed' })
    expect(s.images).toEqual({})
  })
})

describe('AC-4612.3: shownMode — 보이는 칸', () => {
  it("AC-4612.3: 값이 내 배경(bg-<소문자 uuid>)이면 상태와 상관없이 늘 'mine'", () => {
    expect(shownMode(start(), pickOf(A))).toBe('mine')
    expect(shownMode(run(start(), { type: 'mode', mode: 'theme' }), pickOf(A))).toBe('mine')
  })

  it('AC-4612.3: 값이 테마 쪽(null·auto-2·열쇠·열쇠-2)이면 상태의 칸을 따른다', () => {
    const mine = run(start(), { type: 'mode', mode: 'mine' })
    for (const pick of [null, 'auto-2', 'm05', 'm05-2', 'children'] as (ThemePick | null)[]) {
      expect(shownMode(start(), pick), String(pick)).toBe('theme')
      expect(shownMode(mine, pick), String(pick)).toBe('mine')
    }
  })

  it("AC-4612.3: 모양이 틀린 bg- 값(대문자 uuid·bg-xyz)은 내 배경이 아니다", () => {
    const lower = 'abcdef01-2222-4222-8222-22222222abcd'
    expect(shownMode(start(), `bg-${lower}`)).toBe('mine')
    expect(shownMode(start(), `bg-${lower.toUpperCase()}`)).toBe('theme')
    expect(shownMode(start(), 'bg-xyz')).toBe('theme')
  })
})

describe('AC-4611.6: bgAnswerOf — 경로 답 읽기', () => {
  it('AC-4611.6: 200이고 { image }가 JPEG base64면 그 글', () => {
    expect(bgAnswerOf(200, { image: JPEG })).toEqual({ kind: 'ok', jpeg: JPEG })
  })

  it.each([
    ['몸통 null(JSON 아님)', null],
    ['빈 객체', {}],
    ['image가 PNG base64', { image: 'iVBORw0KGgo=' }],
    ['image가 data: 주소', { image: `data:image/jpeg;base64,${JPEG}` }],
    ['image가 숫자', { image: 1 }],
    ['길이가 4의 배수가 아님', { image: '/9j/4AA' }],
    ['배열', [JPEG]],
    ['글', JPEG],
    ['200인데 번호', { code: 'E-AI-BUSY' }],
  ])('AC-4611.6: 200인데 모양이 틀리면(%s) E-FORMS-BG-FAILED', (_, body) => {
    expect(bgAnswerOf(200, body)).toEqual({ kind: 'error', code: 'E-FORMS-BG-FAILED' })
  })

  it.each([
    [422, 'E-FORMS-PRIVATE'],
    [429, 'E-FORMS-BG-LIMIT'],
    [402, 'E-FORMS-BG-QUOTA'],
    [502, 'E-FORMS-BG-FAILED'],
    [503, 'E-AI-BUSY'],
  ] as [number, BgCode][])('AC-4611.6: %i { code: %s } → 그 번호', (status, code) => {
    expect(bgAnswerOf(status, { code })).toEqual({ kind: 'error', code })
  })

  it.each([
    ['400 몸통 없음', 400, null],
    ['401 몸통 없음', 401, null],
    ['403 몸통 없음', 403, null],
    ['504 시간 넘김(JSON 아님)', 504, null],
    ['500 모르는 번호', 500, { code: 'E-AI-LIMIT' }],
    ['502 번호가 글이 아님', 502, { code: 42 }],
    ['503 그림을 준 듯한 답', 503, { image: JPEG }],
  ])('AC-4611.6: %s → E-FORMS-BG-FAILED', (_, status, body) => {
    expect(bgAnswerOf(status, body)).toEqual({ kind: 'error', code: 'E-FORMS-BG-FAILED' })
  })
})

describe('AC-4611.3·AC-4612.2·AC-4612.5: posterLook 표(design.md 10-1절, 위에서부터)', () => {
  const ok = (id: string, image: string): BgAction => ({ type: 'imageLoaded', id, image })

  it("AC-4611.3: 1줄 — 보이는 칸이 'mine'이고 만든 배경이 있으면 만든 배경·뽑은 강조색, 막힘, note trial", () => {
    const s = run(listed(A), { type: 'mode', mode: 'mine' }, { type: 'makeDone', trial: TRIAL })
    expect(posterLook(withPick('m05-2'), s)).toEqual({
      theme: 'm05', art: 2, background: { image: TRIAL.image, accent: TRIAL.accent }, blocked: true, note: 'trial',
    })
    expect(posterLook(withPick(null), s)).toEqual({
      theme: AUTO, art: 1, background: { image: TRIAL.image, accent: TRIAL.accent }, blocked: true, note: 'trial',
    })
    // 내 배경을 쓰는 안내문을 열어도(값이 bg-) 만든 배경이 먼저다
    const withImage = run(s, ok(A.id, 'data:image/jpeg;base64,/9j/A'))
    expect(posterLook(withPick(pickOf(A)), withImage)).toEqual({
      theme: AUTO, art: 1, background: { image: TRIAL.image, accent: TRIAL.accent }, blocked: true, note: 'trial',
    })
  })

  it("AC-4611.3: 만든 배경은 'mine'일 때만 — '테마 그림' 칸이 보이면 얹지 않고 고른 테마로, 막지 않는다", () => {
    const s = run(listed(A), { type: 'mode', mode: 'mine' }, { type: 'makeDone', trial: TRIAL }, { type: 'mode', mode: 'theme' })
    expect(s.trial).toBe(TRIAL) // 만든 배경은 남아 있다
    expect(posterLook(withPick('m05-2'), s)).toEqual({ theme: 'm05', art: 2, background: null, blocked: false, note: null })
  })

  it('AC-4612.3: 2줄 — 값이 테마면 그 테마·그림 번호, 막지 않음, note 없음', () => {
    const s = start()
    expect(posterLook(withPick(null), s)).toEqual({ theme: AUTO, art: 1, background: null, blocked: false, note: null })
    expect(posterLook(withPick('auto-2'), s)).toEqual({ theme: AUTO, art: 2, background: null, blocked: false, note: null })
    expect(posterLook(withPick('m06'), s)).toEqual({ theme: 'm06', art: 1, background: null, blocked: false, note: null })
    expect(posterLook(withPick('chuseok-2'), s)).toEqual({ theme: 'chuseok', art: 2, background: null, blocked: false, note: null })
    // 내 배경 칸을 열어 두었어도 만든 배경이 없으면 고른 테마
    expect(posterLook(withPick('m06'), run(s, { type: 'mode', mode: 'mine' }))).toEqual({
      theme: 'm06', art: 1, background: null, blocked: false, note: null,
    })
  })

  it('AC-4612.2: 3줄 — 내 배경인데 목록이 아직(idle·loading)이면 저절로 테마·그림 1, 막힘, note loading', () => {
    for (const s of [start(), run(start(), { type: 'listLoading' })]) {
      expect(posterLook(withPick(pickOf(A)), s)).toEqual({ theme: AUTO, art: 1, background: null, blocked: true, note: 'loading' })
    }
  })

  it('AC-4612.2: 4줄 — 내 배경인데 목록 실패면 저절로 테마, 막힘, note failed', () => {
    const s = run(start(), { type: 'listLoaded', result: 'failed' })
    expect(posterLook(withPick(pickOf(A)), s)).toEqual({ theme: AUTO, art: 1, background: null, blocked: true, note: 'failed' })
  })

  it('AC-4612.5: 5줄 — 내 배경인데 목록에 없으면(지운 배경) 저절로 테마·그림 1, 막지 않음, note missing', () => {
    const s = run(listed(B), ok(A.id, 'data:image/jpeg;base64,/9j/A'))
    expect(posterLook(withPick(pickOf(A)), s)).toEqual({ theme: AUTO, art: 1, background: null, blocked: false, note: 'missing' })
    // 지운 뒤에도 같다
    const gone = run(listed(A), ok(A.id, 'data:image/jpeg;base64,/9j/A'), { type: 'deleted', id: A.id })
    expect(posterLook(withPick(pickOf(A)), gone)).toEqual({ theme: AUTO, art: 1, background: null, blocked: false, note: 'missing' })
  })

  it('AC-4612.2: 6줄 — 그림을 내려받는 중이거나 아직이면 저절로 테마, 막힘, note loading', () => {
    expect(posterLook(withPick(pickOf(A)), listed(A))).toEqual({ theme: AUTO, art: 1, background: null, blocked: true, note: 'loading' })
    const loading = run(listed(A), { type: 'imageLoading', id: A.id })
    expect(posterLook(withPick(pickOf(A)), loading)).toEqual({ theme: AUTO, art: 1, background: null, blocked: true, note: 'loading' })
  })

  it('AC-4612.2: 7줄 — 그림 내려받기 실패면 저절로 테마, 막힘, note failed', () => {
    const s = run(listed(A), { type: 'imageLoading', id: A.id }, { type: 'imageLoaded', id: A.id, image: null })
    expect(posterLook(withPick(pickOf(A)), s)).toEqual({ theme: AUTO, art: 1, background: null, blocked: true, note: 'failed' })
  })

  it('AC-4612.2: 8줄 — 그림이 있으면 그 그림·저장한 강조색, 막지 않음, note 없음', () => {
    const s = run(listed(A, B), ok(B.id, 'data:image/jpeg;base64,/9j/B'))
    expect(posterLook(withPick(pickOf(B)), s)).toEqual({
      theme: AUTO, art: 1, background: { image: 'data:image/jpeg;base64,/9j/B', accent: ACCENT_B }, blocked: false, note: null,
    })
    // 저장한 바로 뒤(saved가 그림을 둔다)
    const justSaved = run(listed(A), { type: 'makeDone', trial: TRIAL }, { type: 'saveStart' }, { type: 'saved', item: C, image: TRIAL.image })
    expect(posterLook(withPick(pickOf(C)), justSaved)).toEqual({
      theme: AUTO, art: 1, background: { image: TRIAL.image, accent: C.accent }, blocked: false, note: null,
    })
  })

  it('AC-4612.5: 저절로 테마는 안내 내용을 따른다(카드 이름에 공휴일이 없으면 안내 달)', () => {
    const june: ClosureNotice = { year: 2026, month: 6, cards: [{ start: '2026-06-10', end: null, name: '원장님 학회', status: '휴진' }], theme: pickOf(A) }
    expect(posterLook(june, listed(B)).theme).toBe('m06')
  })
})
