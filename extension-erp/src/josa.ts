// 이름 뒤 조사를 이름 마지막 글자의 받침으로 고른다(design.md 5-3 조사 규칙, TASK-21 AC-3618.1).
// 글자만 두고 다른 파일을 불러오지 않는다. 지금은 설정 화면(options.ts) 겹침 막는 글만 쓴다

/** 받침 있음/없음 짝 */
export type JosaPair = '은/는' | '이/가' | '으로/로'

/** 마지막 글자가 한글 음절이 아닐 때(영문·숫자·괄호·빈 이름) 둘 다 보이는 꼴 */
const UNKNOWN: Record<JosaPair, string> = { '은/는': '은(는)', '이/가': '이(가)', '으로/로': '(으)로' }

const FIRST = 0xac00 // '가'
const LAST = 0xd7a3 // '힣'
const RIEUL = 8 // 받침 ㄹ 번호

/**
 * 이름 뒤에 붙일 조사만 돌려준다. 받침이 있으면 '은'·'이'·'으로'(받침 ㄹ이면 '로'), 없으면 '는'·'가'·'로'.
 * 마지막 글자(앞뒤 빈칸은 뗌)가 한글 음절(가~힣)이 아니면 '은(는)'·'이(가)'·'(으)로'
 */
export function josa(word: string, pair: JosaPair): string {
  const chars = [...word.trim()]
  const code = chars.length > 0 ? (chars[chars.length - 1].codePointAt(0) ?? 0) : 0
  if (code < FIRST || code > LAST) return UNKNOWN[pair]
  const final = (code - FIRST) % 28
  if (pair === '은/는') return final > 0 ? '은' : '는'
  if (pair === '이/가') return final > 0 ? '이' : '가'
  return final > 0 && final !== RIEUL ? '으로' : '로'
}
