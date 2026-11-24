// 지역 읽기 — 순수 함수 (admin-view REQ-8013, design.md '지역'·기본값 12·13).
// 시·도는 승인 시안(docs/mockups/admin-view)의 17개, 그 차례다. 광주·전남은 따로 센다. 화면의 '지역 모름'은 목록 밖 값(null)이다.
// 병원 정보 주소는 그냥 적은 글자 한 칸이라 정식·옛·줄인 이름, 앞의 우편번호·'대한민국', 붙여 쓴 꼴, 쉼표를 읽는다.
// '광주시'만 적힌 주소는 경기 광주시와 헷갈려 지역 모름이다. 2026 개편 이름 '전남광주통합특별시'는 다음 낱말이 '구'면 옛 광주광역시다

export const SIDO_LIST = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'] as const

export type Sido = (typeof SIDO_LIST)[number]

/** 시·도를 모를 때(null) 화면 글 */
export const REGION_UNKNOWN = '지역 모름'

// 첫 낱말과 정확히 맞추는 이름(design.md '지역' 표). '광주시'는 넣지 않는다(경기 광주시)
const NAMES: Record<Sido, readonly string[]> = {
  서울: ['서울특별시', '서울시', '서울'],
  부산: ['부산광역시', '부산시', '부산'],
  대구: ['대구광역시', '대구시', '대구'],
  인천: ['인천광역시', '인천시', '인천'],
  광주: ['광주광역시', '광주'],
  대전: ['대전광역시', '대전시', '대전'],
  울산: ['울산광역시', '울산시', '울산'],
  세종: ['세종특별자치시', '세종시', '세종'],
  경기: ['경기도', '경기'],
  강원: ['강원특별자치도', '강원도', '강원'],
  충북: ['충청북도', '충북'],
  충남: ['충청남도', '충남'],
  전북: ['전북특별자치도', '전라북도', '전북'],
  전남: ['전라남도', '전남'],
  경북: ['경상북도', '경북'],
  경남: ['경상남도', '경남'],
  제주: ['제주특별자치도', '제주도', '제주시', '제주'],
}

const BY_NAME = new Map<string, Sido>(SIDO_LIST.flatMap((sido) => NAMES[sido].map((name) => [name, sido] as const)))
// 붙여 쓴 꼴(서울특별시강남구…)은 3글자 이상 정식·옛 이름만, 긴 이름 먼저
const LONG_NAMES = [...BY_NAME.keys()].filter((name) => name.length >= 3).sort((a, b) => b.length - a.length)

// 전남광주통합특별시(줄여 전남광주): 다음 낱말이 '구'로 끝나면 옛 광주광역시 구, 아니면(시·군) 전남
const MERGED = '전남광주통합특별시'
const MERGED_NAMES = [MERGED, '전남광주']

// 맨 앞 우편번호((12345)·[12345]·12345)와 '대한민국'
const HEAD = /^(?:\(\d{5}\)|\[\d{5}\]|\d{5}(?!\d)|대한민국)[\s,]*/

const firstWord = (text: string) => text.split(/[\s,]/, 1)[0] ?? ''

const mergedSido = (rest: string): Sido => (firstWord(rest.replace(/^[\s,]+/, '')).endsWith('구') ? '광주' : '전남')

/** 주소 글에서 시·도. 모르면 null(화면 '지역 모름') */
export function sidoOf(address: string | null | undefined): Sido | null {
  if (typeof address !== 'string') return null
  let text = address.replace(/\s+/g, ' ').trim()
  for (let before = ''; before !== text; ) {
    before = text
    text = text.replace(HEAD, '')
  }
  if (text === '') return null

  const word = firstWord(text)
  if (MERGED_NAMES.includes(word)) return mergedSido(text.slice(word.length))
  const exact = BY_NAME.get(word)
  if (exact !== undefined) return exact

  if (text.startsWith(MERGED)) return mergedSido(text.slice(MERGED.length))
  const glued = LONG_NAMES.find((name) => text.startsWith(name))
  return glued === undefined ? null : (BY_NAME.get(glued) ?? null)
}

const isSido = (value: string): value is Sido => (SIDO_LIST as readonly string[]).includes(value)

/** 관리자가 정한 지역(chosen) 먼저. undefined = 정한 줄 없음 → 주소에서 읽음, null = '지역 모름'으로 정함.
 *  17개 밖의 정한 값(DB 제약 밖)은 지역 모름으로 본다 */
export function regionOf(address: string | null | undefined, chosen?: string | null): Sido | null {
  if (chosen === undefined) return sidoOf(address)
  return chosen !== null && isSido(chosen) ? chosen : null
}

/** 완료 줄 `{지역}로/으로`의 조사. 받침 없음·'ㄹ' 받침 → 로, 그 밖 받침 → 으로. null('지역 모름') → 으로 */
export function roParticle(sido: string | null): '로' | '으로' {
  const word = sido ?? REGION_UNKNOWN
  const code = word.charCodeAt(word.length - 1) - 0xac00
  if (!(code >= 0 && code <= 0xd7a3 - 0xac00)) return '으로'
  const final = code % 28
  return final === 0 || final === 8 ? '로' : '으로'
}
