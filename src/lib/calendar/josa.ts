// 바뀌는 낱말 뒤 조사 고르기(spec google-link design.md 2절 표 7). 순수 함수다.
// 끝 글자가 한글이면 받침으로(로/으로는 받침 없음·ㄹ 받침 → 로), 숫자면 읽는 소리로(0 영·1 일·3 삼·6 육·7 칠·8 팔은 받침, 1·7·8은 ㄹ),
// 그 밖 글자(영문·기호·괄호)는 받침 없음으로 본다. 끝 빈칸은 보지 않는다. 조사만 돌려주고 낱말은 부르는 쪽이 붙인다

export type JosaPair = '이/가' | '을/를' | '은/는' | '와/과' | '로/으로'

type Final = 'none' | 'rieul' | 'other'

const HANGUL_FIRST = 0xac00
const HANGUL_LAST = 0xd7a3
const RIEUL = 8 // 종성 ㄹ
const DIGIT_FINAL: Record<string, Final> = {
  '0': 'other',
  '1': 'rieul',
  '2': 'none',
  '3': 'other',
  '4': 'none',
  '5': 'none',
  '6': 'other',
  '7': 'rieul',
  '8': 'rieul',
  '9': 'none',
}

function finalOf(word: string): Final {
  const last = [...word.trimEnd()].pop()
  if (!last) return 'none'
  if (last in DIGIT_FINAL) return DIGIT_FINAL[last]
  const code = last.codePointAt(0) ?? 0
  if (code < HANGUL_FIRST || code > HANGUL_LAST) return 'none'
  const jong = (code - HANGUL_FIRST) % 28
  return jong === 0 ? 'none' : jong === RIEUL ? 'rieul' : 'other'
}

export function josa(word: string, pair: JosaPair): string {
  const f = finalOf(word)
  const has = f !== 'none'
  switch (pair) {
    case '이/가':
      return has ? '이' : '가'
    case '을/를':
      return has ? '을' : '를'
    case '은/는':
      return has ? '은' : '는'
    case '와/과':
      return has ? '과' : '와'
    case '로/으로':
      return f === 'other' ? '으로' : '로'
  }
}
