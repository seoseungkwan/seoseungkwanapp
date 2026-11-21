import type { PrivateKind } from '@/types/notices'

// 환자 정보 모양 검사(specs/notices REQ-7413, design 9절). 화면(묻기·메모·내 낱말)과 서버(묻기 경로)가 같은 검사로
// 막는다. 그래서 서버 전용 모듈·네트워크·console을 쓰지 않는 순수 함수만 둔다. 환자 이름은 막지 못한다(design 12절)

export type TextCheck = 'ok' | 'empty' | 'too-long' | 'control' | { private: PrivateKind[] }

const MAX_QUESTION = 300
const MAX_MEMO = 500

// 정규식은 design 9절 그대로다. 모두 g 플래그가 없어 test()가 상태를 남기지 않는다.
// tel은 업무일지(lib/worklog/notes.ts PHONE)에 빈칸 나눔을 더한 것: 붙임표·점·빈칸 나눔, 구역번호 괄호 '(02)'·'+82',
// 0으로 시작해 붙여 쓴 9~11자리. 빈칸은 글자 그대로의 빈칸만 본다(줄바꿈은 아니다)
const SHAPES: readonly [PrivateKind, RegExp][] = [
  ['rrn', /\d{6} *[-. ] *[1-8]\d{6}|(?<!\d)\d{6}[1-8]\d{6}(?!\d)/],
  ['tel', /(?<!\d)(?:\+82[-. ]?\(?0?\d{1,2}\)?|\(?0\d{1,2}\)|0\d{1,2}) *[-. ]? *\d{3,4} *[-. ]? *\d{4}(?!\d)/],
  ['chart', /(차트|챠트|등록번호|환자번호)\s*(번호)?\s*[:：]?\s*\d{2,}/],
]
// 맞추기(업무일지 privacyProblem과 같은 방법. 그 파일은 불러오지 않고 옮겨 쓴다)
const DASHES = /[－—–―‐‑−ㅡ]/g
const NUMBER_MARKS = /\p{No}/gu // ①·² 같은 딸린 숫자
// 고시 번호('제2026-218호' 꼴). 연도 네 자리 앞에 숫자가 붙으면 고시 번호가 아니다(긴 숫자 끝이 고시 번호처럼 지워지지 않게).
// 지운 자리는 빈칸으로 둔다: 앞뒤 숫자가 이어 붙어 긴 숫자로 보이지 않게
const NOTICE_NUMBER = /제?(?<!\d)\d{4}-\d{1,4}호/g
const LONG_DIGITS = /\d{6,}/
// 줄바꿈·탭 밖의 제어 문자(lib/forms/ai.ts MEMO_CONTROL과 같은 모양)
const CONTROL = /[^\P{Cc}\t\n\r]/u

const KIND_TEXT: Record<PrivateKind, string> = { rrn: '주민번호', tel: '전화번호', chart: '차트번호', digits: '긴 숫자' }
const KIND_ORDER: readonly PrivateKind[] = ['rrn', 'tel', 'chart', 'digits']

// 전각 숫자·전각 붙임표·긴 줄표로 적어도 같은 모양으로 보게 맞춘 글자 둘. 검사에만 쓰고 받은 글자는 바꾸지 않는다.
// 줄표를 먼저 맞춘다: NFKC가 ㅡ를 다른 글자로 바꾸기 때문이다.
// 두 가지로 맞춘다: NFKC는 ①을 1로 바꾸므로 ①010-0000-1234가 앞뒤 숫자 경계에 걸려 통과한다(그래서 번호 글자를 빈칸으로 바꾼 글자도 본다).
// 빈칸으로만 바꾸면 ⓪①⓪-…처럼 번호 글자로만 적은 전화가 통과한다(그래서 NFKC만 한 글자도 본다)
function normalForms(s: string): string[] {
  const dashed = s.replace(DASHES, '-')
  return [dashed.normalize('NFKC'), dashed.replace(NUMBER_MARKS, ' ').normalize('NFKC')]
}

/**
 * 글에 든 환자 정보 모양: rrn·tel·chart 차례로 하나씩. 셋 다 없을 때만 고시 번호를 뺀 뒤 6자리 이상 숫자가 있으면 digits.
 * 맞춘 글자 둘 가운데 하나에라도 있으면 든 것으로 본다
 */
export function privateKinds(s: string): PrivateKind[] {
  const forms = normalForms(s)
  const kinds = SHAPES.filter(([, shape]) => forms.some((form) => shape.test(form))).map(([kind]) => kind)
  if (kinds.length > 0) return kinds
  return forms.some((form) => LONG_DIGITS.test(form.replace(NOTICE_NUMBER, ' '))) ? ['digits'] : []
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
