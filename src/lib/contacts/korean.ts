// 받침 조사(design.md '어디에 두나': components/stats/periodPick.ts hasFinal과 같은 셈이지만 lib가 components를 부르지 않게 따로 둔다)

const HANGUL_FIRST = 0xac00
const HANGUL_LAST = 0xd7a3

export type ParticlePair = '을/를' | '은/는' | '이/가'

/** 끝 글자가 한글 음절이고 받침이 없으면 뒤 글자, 그 밖(받침 있음·한글 아님·빈 글자)은 앞 글자 */
export function particle(word: string, pair: ParticlePair): string {
  const [withFinal, withoutFinal] = pair.split('/')
  const last = Array.from(word.normalize('NFC')).at(-1)
  const code = last === undefined ? -1 : last.charCodeAt(0)
  const noFinal = code >= HANGUL_FIRST && code <= HANGUL_LAST && (code - HANGUL_FIRST) % 28 === 0
  return noFinal ? withoutFinal : withFinal
}
