import { privacyProblem } from '@/lib/worklog/notes'

// 구글에서 온 글(예약 제목·메모·off 줄 제목·알아본 글)을 서버에 적기 전에 가린다 (spec google-link AC-8505.3, design.md 10-3).
// lib/worklog/notes privacyProblem이 보는 모양(전화·주민번호·메일) 조각마다 '…' 하나로 바꾸고 나머지 글자는 그대로 둔다.
// 정규식은 notes.ts와 같다(그 파일은 정규식을 내보내지 않아 옮겨 쓴다 — 같은 예를 maskPrivate.test.ts가 privacyProblem으로 견준다).
// privacyProblem처럼 두 가지로 맞춘 글자(줄표 → '-' 뒤 NFKC / 번호 글자 → 빈칸 뒤 NFKC)에서 찾되, 글자마다 맞추고 맞춘 글자가
// 원래 어느 글자에서 왔는지 적어 두어 원래 글의 그 자리만 바꾼다. 다 바꾼 뒤에도 privacyProblem이 참이면(글자마다 맞춘 것과
// 글 전체를 맞춘 것이 다를 때·'…'가 NFKC로 '...'이 되어 새 모양이 될 때) 다시 찾고, 그래도 남으면 글 전체를 '…'로 바꾼다

const PHONE = /(?<!\d)(?:\+82[-. ]?\(?0?\d{1,2}\)?|\(?0\d{1,2}\)|0\d{1,2}) *[-.]? *\d{3,4} *[-.]? *\d{4}(?!\d)/g
const NATIONAL_ID = /(?<!\d)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01]) *[-. ] *\d{7}(?!\d)/g
const JOINED_NATIONAL_ID = /(?<!\d)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[1-8]\d{6}(?!\d)/g
const MAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/g
const DASHES = /[－—–―‐‑−ㅡ]/g
const NUMBER_MARKS = /\p{No}/gu
const SHAPES = [PHONE, NATIONAL_ID, JOINED_NATIONAL_ID, MAIL]
const MASK = '…'
const ROUNDS = 4

type Form = { text: string; owner: number[] } // owner[i] = 맞춘 글자 i(UTF-16 칸)가 온 원래 글자(코드포인트) 차례

const forms: ((char: string) => string)[] = [
  (char) => char.replace(DASHES, '-').normalize('NFKC'),
  (char) => char.replace(DASHES, '-').replace(NUMBER_MARKS, ' ').normalize('NFKC'),
]

function formOf(chars: readonly string[], fold: (char: string) => string): Form {
  let text = ''
  const owner: number[] = []
  chars.forEach((char, index) => {
    const folded = fold(char)
    text += folded
    for (let unit = 0; unit < folded.length; unit += 1) owner.push(index)
  })
  return { text, owner }
}

/** 개인정보 모양에 걸린 원래 글자 차례 */
function coveredChars(chars: readonly string[]): Set<number> {
  const covered = new Set<number>()
  for (const fold of forms) {
    const { text, owner } = formOf(chars, fold)
    for (const shape of SHAPES) {
      shape.lastIndex = 0
      for (const match of text.matchAll(shape)) {
        const start = match.index
        for (let unit = start; unit < start + match[0].length; unit += 1) {
          const index = owner[unit]
          if (index !== undefined) covered.add(index)
        }
      }
    }
  }
  return covered
}

/** 걸린 글자가 이어진 묶음마다 '…' 하나로 바꾼다 */
function maskOnce(text: string): string {
  const chars = [...text]
  const covered = coveredChars(chars)
  if (covered.size === 0) return text
  let out = ''
  chars.forEach((char, index) => {
    if (!covered.has(index)) out += char
    else if (!covered.has(index - 1)) out += MASK
  })
  return out
}

/** 전화·주민번호·메일 모양 조각마다 '…'로 바꾼 새 글. 글자가 아니면 빈 글 */
export function maskPrivate(text: string): string {
  if (typeof text !== 'string') return ''
  let out = text
  for (let round = 0; round < ROUNDS && privacyProblem(out); round += 1) out = maskOnce(out)
  return privacyProblem(out) ? MASK : out
}
