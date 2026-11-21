import type { PrivateKind } from '@/types/notices'

// 환자 정보 모양 검사(specs/notices REQ-7413, design 9절). 화면(묻기·메모·내 낱말)과 서버(묻기 경로)가 같은 검사로
// 막는다. 그래서 서버 전용 모듈·네트워크·console을 쓰지 않는 순수 함수만 둔다. 환자 이름은 막지 못한다(design 12절)

export type TextCheck = 'ok' | 'empty' | 'too-long' | 'control' | { private: PrivateKind[] }

const MAX_QUESTION = 300
const MAX_MEMO = 500

// 정규식은 design 9절 그대로다. 모두 g 플래그가 없어 test()가 상태를 남기지 않는다
const SHAPES: readonly [PrivateKind, RegExp][] = [
  ['rrn', /\d{6}\s*-\s*[1-8]\d{6}|(?<!\d)\d{6}[1-8]\d{6}(?!\d)/],
  ['tel', /0\d{1,2}\s*-\s*\d{3,4}\s*-\s*\d{4}|(?<!\d)01[016789]\d{7,8}(?!\d)/],
  ['chart', /(차트|챠트|등록번호|환자번호)\s*(번호)?\s*[:：]?\s*\d{2,}/],
]
// 고시 번호('제2026-218호' 꼴). 연도 네 자리 앞에 숫자가 붙으면 고시 번호가 아니다(긴 숫자 끝이 고시 번호처럼 지워지지 않게).
// 지운 자리는 빈칸으로 둔다: 앞뒤 숫자가 이어 붙어 긴 숫자로 보이지 않게
const NOTICE_NUMBER = /제?(?<!\d)\d{4}-\d{1,4}호/g
const LONG_DIGITS = /\d{6,}/
// 줄바꿈·탭 밖의 제어 문자(lib/forms/ai.ts MEMO_CONTROL과 같은 모양)
const CONTROL = /[^\P{Cc}\t\n\r]/u

const KIND_TEXT: Record<PrivateKind, string> = { rrn: '주민번호', tel: '전화번호', chart: '차트번호', digits: '긴 숫자' }
const KIND_ORDER: readonly PrivateKind[] = ['rrn', 'tel', 'chart', 'digits']

/** 글에 든 환자 정보 모양: rrn·tel·chart 차례로 하나씩. 셋 다 없을 때만 고시 번호를 뺀 뒤 6자리 이상 숫자가 있으면 digits */
export function privateKinds(s: string): PrivateKind[] {
  const kinds = SHAPES.filter(([, shape]) => shape.test(s)).map(([kind]) => kind)
  if (kinds.length > 0) return kinds
  return LONG_DIGITS.test(s.replace(NOTICE_NUMBER, ' ')) ? ['digits'] : []
}

// 앞뒤 공백을 뗀 글자 수(코드 포인트, DB char_length와 같다) → 길이 → 제어 문자(받은 글 전체) → 환자 정보 모양 차례
function checkText(text: string, min: number, max: number): TextCheck {
  const trimmed = text.trim()
  const length = Array.from(trimmed).length
  if (length < min) return 'empty'
  if (length > max) return 'too-long'
  if (CONTROL.test(text)) return 'control'
  const kinds = privateKinds(trimmed)
  return kinds.length > 0 ? { private: kinds } : 'ok'
}

/** 묻기 질문: 앞뒤 공백을 뗀 1~300자 */
export function checkQuestion(q: string): TextCheck {
  return checkText(q, 1, MAX_QUESTION)
}

/** 메모: 앞뒤 공백을 뗀 0~500자(빈 메모 = 지우기) */
export function checkMemo(m: string): TextCheck {
  return checkText(m, 0, MAX_MEMO)
}

/** 종류 이름을 정해 둔 차례(주민번호·전화번호·차트번호·긴 숫자)로 한 번씩 '·'로 잇는다. 모르는 종류는 빼고 잇는다 */
export function kindsText(k: PrivateKind[]): string {
  return KIND_ORDER.filter((kind) => k.includes(kind))
    .map((kind) => KIND_TEXT[kind])
    .join('·')
}
