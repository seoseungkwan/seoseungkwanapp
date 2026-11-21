import type { PrivateKind } from '@/types/notices'
import { privateKinds } from './askCheck'

// 내 낱말(꼭 볼 글) 순수 도구(specs/notices REQ-7424, design 15절). 화면(KeywordsControl·목록·글 화면)이 쓴다.
// 저장소(lib/storage/notices.ts)는 다듬기·검사를 하지 않으니 넣기 전에 checkKeyword를 거친다.
// 서버 전용 모듈·네트워크·저장소·console을 쓰지 않는다

/** 병원마다 고를 수 있는 낱말 수(DB before insert 트리거와 같다) */
export const KEYWORD_MAX = 30
/** 다듬은 낱말 하나의 글자 수 한도(코드 포인트, DB char_length와 같다) */
export const KEYWORD_LEN = 20

/** 추천 낱말(정형외과 의원, requirements 기본값 19 차례 그대로) */
export const RECOMMENDED_KEYWORDS: readonly string[] = Object.freeze([
  '도수치료',
  '체외충격파',
  '물리치료',
  '관절강내 주사',
  '신경차단술',
  '증식치료',
  'MRI',
  '초음파',
  '골다공증',
  '비급여',
  '본인부담',
  '비대면 진료',
])

// 빈칸 글자 여섯: 빈칸·탭·\n·\r·U+00A0·U+3000. DB notice_norm의 translate() 지우는 글자와 하나하나 같다
const SPACES = /[ \t\n\r 　]+/g
const UPPER = /[A-Z]/g
// 줄바꿈·탭 밖의 제어 문자(askCheck CONTROL과 같은 모양). \t·\n·\r은 SPACES가 빈칸으로 바꾼다
const CONTROL = /[^\P{Cc}\t\n\r]/gu

export type KeywordCheck = { ok: string } | 'empty' | 'too-long' | 'full' | 'dup' | { private: PrivateKind[] }

/**
 * 같은 낱말인지 볼 때 쓰는 모양: 빈칸 글자 여섯을 모두 빼고 A~Z만 a~z로 바꾼다.
 * DB `notice_norm`(translate, collation에 기대지 않음)과 같은 규칙이라 lower()·toLowerCase()를 쓰지 않는다
 */
export function normKeyword(s: string): string {
  return s.replace(SPACES, '').replace(UPPER, (c) => c.toLowerCase())
}

/** 저장할 모양: 그 밖 제어 문자를 빼고, 이어진 빈칸 글자를 빈칸 하나로 줄이고, 앞뒤 공백을 뗀다 */
export function cleanKeyword(s: string): string {
  return s.replace(CONTROL, '').replace(SPACES, ' ').trim()
}

/** 다듬은 뒤 빈 글자 → 20자 넘음 → 이미 30개 → 환자 정보 모양 → 같은 낱말 차례로 본다. 통과하면 다듬은 낱말 */
export function checkKeyword(s: string, words: string[]): KeywordCheck {
  const word = cleanKeyword(s)
  if (word === '') return 'empty'
  if (Array.from(word).length > KEYWORD_LEN) return 'too-long'
  if (words.length >= KEYWORD_MAX) return 'full'
  const kinds = privateKinds(word)
  if (kinds.length > 0) return { private: kinds }
  const norm = normKeyword(word)
  if (words.some((w) => normKeyword(w) === norm)) return 'dup'
  return { ok: word }
}

/** '꼭 볼 글' 칩 글: 앞 max개를 '·'로 잇고 남으면 ' 외 {n}개'. 빈 목록은 빈 글자(목록 줄 max 2, 글 화면 Infinity) */
export function mustSeeText(words: string[], max: number): string {
  if (words.length === 0) return ''
  const shown = words.slice(0, max)
  const rest = words.length - shown.length
  return `꼭 볼 글 · ${shown.join('·')}${rest > 0 ? ` 외 ${rest}개` : ''}`
}
