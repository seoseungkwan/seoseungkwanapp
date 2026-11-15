import { isJpegBase64 } from '@/lib/forms/background'
import { autoTheme, isThemePick, lookOfPick } from '@/lib/forms/themes'
import { MAX_BACKGROUNDS, MAX_BG_WORDS, type BackgroundLook, type SavedBackground } from '@/types/formBackground'
import type { ClosureNotice, ThemeArt, ThemeId, ThemePick } from '@/types/forms'

// 휴진 안내 '배경' 칸(테마 그림 1·2 / 내 배경·AI 배경 만들기)의 상태와 순수 reducer (specs/forms-themes design.md 10-1절, 시안 screen.html).
// hook(useBackgrounds)이 useReducer로 쓰고, 부르기·저장·내려받기는 hook이 하고 결과만 여기로 보낸다.
// 고른 그림 값(안내문 theme)은 서식 상태(formsState)에 있고 여기에는 없다 — 끌어내는 값은 그 값을 받아 본다.
// 만든 배경(trial)은 안내문과 따로다: 저장하거나 [안 쓰기]를 누를 때까지 남는다(다른 안내문을 열어도)

export type BgCode = 'E-FORMS-PRIVATE' | 'E-FORMS-BG-LIMIT' | 'E-FORMS-BG-QUOTA' | 'E-FORMS-BG-FAILED' | 'E-AI-BUSY'
// 만든 배경(저장 전). bytes = 받은 JPEG(저장할 때 올린다), image = data: 주소, thumb = 작은 그림 base64
export type Trial = { words: string; bytes: Uint8Array; image: string; accent: string; thumb: string }
export type BgList = { kind: 'idle' } | { kind: 'loading' } | { kind: 'ok'; items: SavedBackground[] } | { kind: 'failed' }
export type BgImage = { kind: 'loading' } | { kind: 'ok'; image: string } | { kind: 'failed' }
type Mode = 'theme' | 'mine'

export type BgState = {
  mode: Mode // 고른 칸(값이 내 배경이면 보이는 칸은 늘 'mine' — shownMode)
  words: string // 'AI 배경 만들기' 글 칸
  making: boolean
  makeError: BgCode | null
  trial: Trial | null
  saving: boolean
  deleting: boolean
  storeError: boolean // 내 배경 저장·지우기 실패(E-FORMS-BG-STORE-FAILED)
  list: BgList // 'idle' = 아직 읽지 않음([내 배경]을 처음 볼 때 읽는다)
  images: Readonly<Record<string, BgImage>> // 내려받은 큰 그림(내 배경 id마다)
}

export type BgAction =
  | { type: 'mode'; mode: Mode }
  | { type: 'words'; text: string }
  | { type: 'makeStart' }
  | { type: 'makeDone'; trial: Trial }
  | { type: 'makeFailed'; code: BgCode }
  | { type: 'discard' }
  | { type: 'saveStart' }
  | { type: 'saved'; item: SavedBackground; image: string }
  | { type: 'storeFailed' }
  | { type: 'listLoading' }
  | { type: 'listLoaded'; result: SavedBackground[] | 'failed' }
  | { type: 'imageLoading'; id: string }
  | { type: 'imageLoaded'; id: string; image: string | null }
  | { type: 'deleteStart' }
  | { type: 'deleted'; id: string }

const BG_CODES: readonly unknown[] = ['E-FORMS-PRIVATE', 'E-FORMS-BG-LIMIT', 'E-FORMS-BG-QUOTA', 'E-FORMS-BG-FAILED', 'E-AI-BUSY'] satisfies BgCode[]
const BACKGROUND_PREFIX = 'bg-'

const cut = (text: string, max: number) => Array.from(text).slice(0, max).join('')

export function initialBgState(): BgState {
  return {
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
  }
}

const withImage = (images: BgState['images'], id: string, image: BgImage): BgState['images'] => ({ ...images, [id]: image })
function withoutImage(images: BgState['images'], id: string): BgState['images'] {
  const rest = { ...images }
  delete rest[id]
  return rest
}

export function bgReducer(state: BgState, action: BgAction): BgState {
  switch (action.type) {
    case 'mode':
      return { ...state, mode: action.mode }
    case 'words':
      return { ...state, words: cut(action.text, MAX_BG_WORDS), makeError: null }
    case 'makeStart':
      // 다시 만드는 동안 앞 배경은 그대로 둔다(실패하면 그것이 남는다, AC-4611.6)
      return { ...state, making: true, makeError: null }
    case 'makeDone':
      return { ...state, making: false, makeError: null, trial: action.trial }
    case 'makeFailed':
      return { ...state, making: false, makeError: action.code }
    case 'discard':
      // 저장 실패 알림('만든 배경은 그대로 남아 있어요')도 함께 거둔다
      return { ...state, trial: null, storeError: false }
    case 'saveStart':
      return { ...state, saving: true, storeError: false }
    case 'saved': {
      const { item } = action
      // 목록을 못 읽었거나 읽는 중이면 그대로 둔다(방금 것 하나만 있는 목록처럼 보이지 않게)
      const list: BgList = state.list.kind === 'ok' ? { kind: 'ok', items: [item, ...state.list.items.filter((b) => b.id !== item.id)] } : state.list
      return {
        ...state,
        saving: false,
        storeError: false,
        list,
        images: withImage(state.images, item.id, { kind: 'ok', image: action.image }),
        trial: null,
        mode: 'mine',
      }
    }
    case 'storeFailed':
      return { ...state, saving: false, deleting: false, storeError: true }
    case 'listLoading':
      return { ...state, list: { kind: 'loading' } }
    case 'listLoaded':
      return { ...state, list: action.result === 'failed' ? { kind: 'failed' } : { kind: 'ok', items: action.result } }
    case 'imageLoading':
      return { ...state, images: withImage(state.images, action.id, { kind: 'loading' }) }
    case 'imageLoaded':
      return { ...state, images: withImage(state.images, action.id, action.image === null ? { kind: 'failed' } : { kind: 'ok', image: action.image }) }
    case 'deleteStart':
      return { ...state, deleting: true, storeError: false }
    case 'deleted': {
      const list: BgList = state.list.kind === 'ok' ? { kind: 'ok', items: state.list.items.filter((b) => b.id !== action.id) } : state.list
      return { ...state, deleting: false, storeError: false, list, images: withoutImage(state.images, action.id) }
    }
  }
}

// ── 끌어내는 값 ─────────────────────────────────────────

// 내 배경 값(bg-<소문자 uuid>)이면 그 id, 아니면 null
function backgroundIdOf(pick: ThemePick | null): string | null {
  return pick !== null && pick.startsWith(BACKGROUND_PREFIX) && isThemePick(pick) ? pick.slice(BACKGROUND_PREFIX.length) : null
}

// 보이는 칸: 값이 내 배경이면 늘 'mine'(내 배경을 쓰는 안내문을 열면 [내 배경]이 눌린 채, AC-4612.3)
export function shownMode(state: BgState, pick: ThemePick | null): Mode {
  return backgroundIdOf(pick) === null ? state.mode : 'mine'
}

export type BgAnswer = { kind: 'ok'; jpeg: string } | { kind: 'error'; code: BgCode }
const BG_FAILED = { kind: 'error', code: 'E-FORMS-BG-FAILED' } as const

const fieldsOf = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null

// /api/ai/forms/background 답(상태·JSON 몸통, JSON이 아니면 null) → 그림 base64 글 또는 오류 번호.
// 200이고 { image }가 JPEG base64면 그 글, 200 밖이고 { code }가 아는 다섯 번호면 그 번호, 그 밖(400·401·403·504·모양 틀림)은 E-FORMS-BG-FAILED
export function bgAnswerOf(status: number, body: unknown): BgAnswer {
  const fields = fieldsOf(body)
  if (status === 200) {
    const image = fields?.image
    return isJpegBase64(image) ? { kind: 'ok', jpeg: image } : BG_FAILED
  }
  const code = fields?.code
  return BG_CODES.includes(code) ? { kind: 'error', code: code as BgCode } : BG_FAILED
}

export type PosterLook = {
  theme: ThemeId
  art: ThemeArt
  background: BackgroundLook | null
  blocked: boolean // [저장]·[인쇄·PDF]·[그림 파일]을 막는다
  note: 'trial' | 'loading' | 'failed' | 'missing' | null
}

// 미리보기·인쇄 사본·그림 파일에 그릴 것 (design.md 10-1절 표, 위에서부터 처음 맞는 줄)
export function posterLook(notice: ClosureNotice, state: BgState): PosterLook {
  const look = lookOfPick(notice)
  // 테마로 그릴 때의 테마·그림 번호: 값이 테마면 그것, 내 배경이면 저절로 테마·그림 1
  const fallback = look.kind === 'theme' ? { theme: look.theme, art: look.art } : { theme: autoTheme(notice), art: 1 as const }
  const themed = (blocked: boolean, note: PosterLook['note']): PosterLook => ({ ...fallback, background: null, blocked, note })

  if (state.trial !== null && shownMode(state, notice.theme) === 'mine') {
    return { ...fallback, background: { image: state.trial.image, accent: state.trial.accent }, blocked: true, note: 'trial' }
  }
  if (look.kind === 'theme') return themed(false, null)
  if (state.list.kind === 'idle' || state.list.kind === 'loading') return themed(true, 'loading')
  if (state.list.kind === 'failed') return themed(true, 'failed')
  const item = state.list.items.find((b) => b.id === look.id)
  if (!item) return themed(false, 'missing')
  const image = state.images[look.id]
  if (image === undefined || image.kind === 'loading') return themed(true, 'loading')
  if (image.kind === 'failed') return themed(true, 'failed')
  return { ...fallback, background: { image: image.image, accent: item.accent }, blocked: false, note: null }
}

// [내 배경으로 저장]: 만든 배경이 있고, 저장 중이 아니고, 목록이 ok이며 30장 밑
export function canSaveTrial(state: BgState): boolean {
  return state.trial !== null && !state.saving && state.list.kind === 'ok' && state.list.items.length < MAX_BACKGROUNDS
}

// 내 배경이 가득 참(목록이 ok이고 30장) — "내 배경은 30장까지예요…"
export function isFull(state: BgState): boolean {
  return state.list.kind === 'ok' && state.list.items.length >= MAX_BACKGROUNDS
}
