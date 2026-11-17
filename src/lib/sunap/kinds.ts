import { DEFAULT_RSV_KINDS, type RsvKindDef, type RsvWords } from '@/types/sunap'

// 다음 예약 종류 목록 규칙 [환자 자료 구역] (spec sunap-kinds REQ-5501·AC-5502.4). 순수 함수만: 받은 값을 바꾸지 않고 새 값을 돌려준다.
// 설정 저장(lib/storage/sunap)·Worker load·설정 판이 같이 쓴다

/** 종류 id: 기본 셋(inj·visit·etc) 또는 새 종류(k + 영문 소문자·숫자 6자) */
export const KIND_ID = /^(inj|visit|etc|k[a-z0-9]{6})$/
/** 지울 수 없는 기본 셋. 목록에 꼭 한 번씩 */
export const BASE_KIND_IDS = ['inj', 'visit', 'etc'] as const
/** 늘 있는 줄 이름(종류 이름으로 못 씀) */
export const FIXED_LABELS = ['예약 안 하고 가심', '종류 모름'] as const
export const KIND_MIN = BASE_KIND_IDS.length
export const KIND_MAX = 10
export const LABEL_MAX = 10
export const WORD_MAX = 20
/** 한 종류의 말을 ', '로 이은 글 길이 한도 */
export const WORDS_TEXT_MAX = 40

const WORD_SEP = ', '
// 36진수 글자 차례(아래 차례로 찾기와 같다)
const ID_CHARS = '0123456789abcdefghijklmnopqrstuvwxyz'
// random이 겹치는 id만 내면 이만큼 해 보고 차례로 찾는다
const ID_TRIES = 50

type Rec = Record<string, unknown>
const isRecord = (x: unknown): x is Rec => typeof x === 'object' && x !== null && !Array.isArray(x)
const fold = (word: string) => word.toLowerCase()

export const isKindId = (x: unknown): x is string => typeof x === 'string' && KIND_ID.test(x)
/** 직접 고른 값: 'none' 또는 종류 id */
export const isHandKind = (x: unknown): x is string => x === 'none' || isKindId(x)
/** 마감 고정값: 직접 고른 값 모양 + 'unknown' */
export const isFixedKind = (x: unknown): x is string => x === 'unknown' || isHandKind(x)

const isLabel = (label: string) => label.length >= 1 && label.length <= LABEL_MAX && !(FIXED_LABELS as readonly string[]).includes(label)
const isWord = (word: string) => word.length >= 1 && word.length <= WORD_MAX
const fits = (words: readonly string[]) => words.join(WORD_SEP).length <= WORDS_TEXT_MAX

/** 말 목록 하나: 글자 목록이고 앞뒤 빈칸 뺀 말이 1~20자, 이은 글 40자 이하면 앞뒤 빈칸 뺀 새 목록. 아니면 null */
function readWords(x: unknown): string[] | null {
  if (!Array.isArray(x) || !x.every((word): word is string => typeof word === 'string')) return null
  const words = x.map((word) => word.trim())
  return words.every(isWord) && fits(words) ? words : null
}

/** 종류 칸 하나. 맞으면 {id, label, counts, words}만 고른 새 값(이름·말은 앞뒤 빈칸 뺌) */
function readKind(x: unknown): RsvKindDef | null {
  if (!isRecord(x) || !isKindId(x.id) || typeof x.label !== 'string' || typeof x.counts !== 'boolean') return null
  const label = x.label.trim()
  const words = readWords(x.words)
  if (!isLabel(label) || words === null) return null
  return { id: x.id, label, counts: x.counts, words }
}

/**
 * 종류 목록 검사(AC-5501.2): 3~10개 · inj·visit·etc 꼭 한 번씩 · id 모양·겹침 없음 · 이름 1~10자·겹침 없음·늘 있는 줄 이름 아님 ·
 * counts 참/거짓 · 말 1~20자·이은 글 40자 이하. 맞으면 앞뒤 빈칸을 뺀 새 목록(차례 그대로), 아니면 null
 */
export function readKinds(x: unknown): RsvKindDef[] | null {
  if (!Array.isArray(x) || x.length < KIND_MIN || x.length > KIND_MAX) return null
  const kinds: RsvKindDef[] = []
  for (const item of x as unknown[]) {
    const kind = readKind(item)
    if (kind === null) return null
    kinds.push(kind)
  }
  const ids = new Set(kinds.map((kind) => kind.id))
  if (ids.size !== kinds.length || !BASE_KIND_IDS.every((id) => ids.has(id))) return null
  if (new Set(kinds.map((kind) => kind.label)).size !== kinds.length) return null
  return kinds
}

/** 말 칸 글 → 말 목록(AC-5501.3): ','·'，'로 나누고 앞뒤 빈칸 빼고 빈 말 버리고, 겹친 말(영문 대소문자 무시)은 처음 하나만 */
export function splitWords(text: string): string[] {
  const seen = new Set<string>()
  const words: string[] = []
  for (const part of text.split(/[,，]/)) {
    const word = part.trim()
    if (word === '' || seen.has(fold(word))) continue
    seen.add(fold(word))
    words.push(word)
  }
  return words
}

/**
 * 옛 설정 {inj, visit, etc} 말 목록 → 기본 이름·예약률 + 그 말(AC-5501.1).
 * 옛 화면은 말 개수 한도가 없었다: 앞뒤 빈칸을 빼고, 빈 말·21자 넘는 말·겹친 말(대소문자 무시)과
 * 이은 글이 40자를 넘게 하는 말은 뺀다(readKinds가 받는 목록이어야 Worker가 load를 거절하지 않는다)
 */
export function kindsFromLegacy(words: RsvWords): RsvKindDef[] {
  return DEFAULT_RSV_KINDS.map((kind) => {
    const seen = new Set<string>()
    const kept: string[] = []
    for (const raw of words[kind.id as keyof RsvWords]) {
      const word = raw.trim()
      if (!isWord(word) || seen.has(fold(word)) || !fits([...kept, word])) continue
      seen.add(fold(word))
      kept.push(word)
    }
    return { id: kind.id, label: kind.label, counts: kind.counts, words: kept }
  })
}

/** 새 종류 id: k + 영문 소문자·숫자 6자, taken과 겹치면 다시 만든다 */
export function newKindId(taken: readonly string[], random: () => number = Math.random): string {
  const used = new Set(taken)
  const pick = () => ID_CHARS[Math.min(ID_CHARS.length - 1, Math.max(0, Math.floor(random() * ID_CHARS.length)))]
  for (let i = 0; i < ID_TRIES; i++) {
    const id = `k${Array.from({ length: 6 }, pick).join('')}`
    if (!used.has(id)) return id
  }
  // random이 겹치는 값만 낼 때: k000000부터 차례로 빈 id를 찾는다(taken은 유한하다)
  for (let n = 0; ; n++) {
    const id = `k${n.toString(36).padStart(6, '0')}`
    if (!used.has(id)) return id
  }
}
