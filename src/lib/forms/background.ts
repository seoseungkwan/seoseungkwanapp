import { BG_IMAGE_MAX_BYTES, BG_THUMB_MAX, MAX_BG_WORDS, type SavedBackground } from '@/types/formBackground'
import { memoProblem } from './ai'

// 휴진 안내 AI 배경: 적은 말 검사·프롬프트 글·JPEG base64 검사·저장한 내 배경 줄 검사 (specs/forms-themes design.md 4-1·4-2·8-5절).
// 서버 경로(app/api/ai/forms/background)와 브라우저 저장(lib/storage/formBackgrounds)이 같이 쓰는 순수 함수다.
// SDK·네트워크·console·React·supabase를 쓰지 않는다. 적은 말·프롬프트는 어디에도 남기지 않는다

const LINE_BREAK_OR_TAB = /[\t\n\r]/ // memoProblem이 봐주는 세 글자. 적은 말에는 이것도 막는다
const JPEG_BASE64 = /^\/9j\/[A-Za-z0-9+/]*={0,2}$/ // '/9j/'를 풀면 FF D8 FF(JPEG 머리)
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' // 소문자만
const ID = new RegExp(`^${UUID}$`)
const PATH = new RegExp(`^${UUID}/(${UUID})\\.jpg$`) // '<병원 id>/<id>.jpg'
const ACCENT = /^#[0-9a-f]{6}$/
const ROW_KEYS = ['id', 'words', 'accent', 'thumb', 'path', 'created_at'] // 표에서 읽는 칸(lib/storage/formBackgrounds COLUMNS)

const isFilled = (value: unknown): value is string => typeof value === 'string' && value !== ''

/** 문자열이고 앞뒤 공백을 뗀 1~30자(Array.from 글자 수 — 그림 문자 하나는 한 글자)면 뗀 글, 아니면 null */
export function wordsOf(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const words = value.trim()
  const length = Array.from(words).length
  return length >= 1 && length <= MAX_BG_WORDS ? words : null
}

/** 제어 문자(줄바꿈·탭 포함)나 전화·주민번호·메일 모양이면 참(AC-4606.2). 참이면 보내지도 저장하지도 않는다 */
export function wordsProblem(text: string): boolean {
  return memoProblem(text) || LINE_BREAK_OR_TAB.test(text)
}

/** OpenAI 그림 AI에 보내는 글(design.md 4-1절 그대로). Theme 줄에 앞뒤 공백을 뗀 적은 말을 넣는다(AC-4606.4) */
export function backgroundPrompt(words: string): string {
  return [
    "Vertical background illustration for a Korean orthopedic clinic's monthly closed-days notice poster.",
    `Theme: ${words.trim()}.`,
    'Style: bright, soft, professional editorial illustration with fine detail and gentle gradients; warm and friendly for elderly patients; high print quality.',
    'Layout rules (very important):',
    '- Decorations only along the top corners, the left and right edges, and the bottom edge.',
    '- Keep a large, clean, very light and plain area in the center (about 70% of the width, from 12% to 85% of the height). Text will be placed there.',
    '- Keep the bottom-center strip plain and light for a logo.',
    '- Absolutely no text, letters, numbers, signs, logos, watermarks, frames with writing, or human faces.',
  ].join('\n')
}

/** '/9j/'로 시작하는 base64 글(= 0~2개, 길이 4의 배수)이고 풀면 maxBytes 이하(⌊길이 × 3 / 4⌋ − '=' 수)면 참 */
export function isJpegBase64(value: unknown, maxBytes: number = BG_IMAGE_MAX_BYTES): value is string {
  if (typeof value !== 'string' || value.length % 4 !== 0) return false
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0
  if (Math.floor((value.length * 3) / 4) - padding > maxBytes) return false
  return JPEG_BASE64.test(value)
}

/** 표에서 읽은 내 배경 줄 → SavedBackground. 열쇠가 정확히 여섯이 아니거나 칸 모양이 하나라도 어긋나면 null(고쳐 쓰지 않는다) */
export function checkBackgroundRow(row: unknown): SavedBackground | null {
  if (typeof row !== 'object' || row === null || Array.isArray(row)) return null
  const keys = Object.keys(row)
  if (keys.length !== ROW_KEYS.length || !ROW_KEYS.every((key) => keys.includes(key))) return null
  const { id, words, accent, thumb, path, created_at: createdAt } = row as Record<string, unknown>
  if (typeof id !== 'string' || !ID.test(id)) return null
  if (typeof words !== 'string' || wordsOf(words) !== words || wordsProblem(words)) return null
  if (typeof accent !== 'string' || !ACCENT.test(accent)) return null
  if (typeof thumb !== 'string' || thumb.length > BG_THUMB_MAX || !isJpegBase64(thumb)) return null
  if (typeof path !== 'string' || PATH.exec(path)?.[1] !== id) return null
  if (!isFilled(createdAt)) return null
  return { id, words, accent, thumb, path, createdAt }
}
