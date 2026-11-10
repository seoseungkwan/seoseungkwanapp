import type { ClosureNotice, ThemeId } from '@/types/forms'
import { sortCards } from './notice'

// 서식 탭 휴진 안내의 테마 23개(공휴일 11 + 달 12)와 저절로 고르기 (specs/forms design.md 4절).
// 강조색은 승인된 테마 시안(docs/mockups/forms/themes.html)의 값. 그림은 public/poster/themes/<열쇠>.svg

export type Theme = {
  id: ThemeId
  name: string
  kind: 'holiday' | 'month'
  accent: string // 'N월'·날짜 띠·아래 글의 색. 흰 글자와 3:1 이상
  words: readonly string[] // 카드 이름(공백 뺌)에 들어 있으면 이 테마
  month: number | null
}

const holiday = (id: ThemeId, name: string, accent: string, words: readonly string[]): Theme => ({ id, name, kind: 'holiday', accent, words, month: null })
const month = (n: number, accent: string): Theme => ({
  id: `m${String(n).padStart(2, '0')}` as ThemeId,
  name: `${n}월`,
  kind: 'month',
  accent,
  words: [],
  month: n,
})

export const THEMES: readonly Theme[] = [
  holiday('newyear', '신정', '#d9432f', ['신정', '새해', '양력설']),
  holiday('seollal', '설날', '#d6336c', ['설날', '설연휴', '설명절', '구정']),
  holiday('samiljeol', '삼일절', '#2b5bb5', ['삼일절', '3·1절', '3.1절', '31절']),
  holiday('children', '어린이날', '#f0522d', ['어린이날']),
  holiday('buddha', '부처님오신날', '#d9601a', ['부처님오신날', '석가탄신일', '석탄일', '초파일']),
  holiday('memorial', '현충일', '#2f4a7a', ['현충일']),
  holiday('liberation', '광복절', '#e8312f', ['광복절']),
  holiday('chuseok', '추석', '#c8662a', ['추석', '한가위']),
  holiday('foundation', '개천절', '#2f7fc1', ['개천절']),
  holiday('hangul', '한글날', '#1f6e8c', ['한글날']),
  holiday('christmas', '성탄절', '#c62f2f', ['성탄절', '크리스마스', '성탄']),
  month(1, '#3c6fb4'),
  month(2, '#c2416b'),
  month(3, '#3f9142'),
  month(4, '#d9487a'),
  month(5, '#d8434e'),
  month(6, '#5b63c7'),
  month(7, '#1d8fc7'),
  month(8, '#d46f00'),
  month(9, '#c2458a'),
  month(10, '#c8501e'),
  month(11, '#8a5a2b'),
  month(12, '#2e5e9e'),
]

const BY_ID = new Map(THEMES.map((theme) => [theme.id, theme]))
const HOLIDAY_THEMES = THEMES.filter((theme) => theme.kind === 'holiday')

export function themeOf(id: ThemeId): Theme {
  const theme = BY_ID.get(id)
  if (!theme) throw new RangeError(`없는 테마: ${id}`)
  return theme
}

// 이름이 '설' 한 글자뿐이어도 설날(설명회 같은 낱말은 아니다)
function holidayOf(name: string): ThemeId | null {
  const plain = name.replace(/\s/g, '').toLowerCase()
  if (plain === '설') return 'seollal'
  return HOLIDAY_THEMES.find((theme) => theme.words.some((word) => plain.includes(word)))?.id ?? null
}

type Pickable = Pick<ClosureNotice, 'month'> & { cards: readonly { start: string; name: string }[] }

// 시작 날짜 차례로 카드 이름에서 처음 찾은 공휴일 테마, 없으면 안내 달의 달 테마
export function autoTheme(notice: Pickable): ThemeId {
  for (const card of sortCards(notice.cards)) {
    const found = holidayOf(card.name)
    if (found) return found
  }
  return themeOf(`m${String(notice.month).padStart(2, '0')}` as ThemeId).id
}

export function themeInUse(notice: Pickable & Pick<ClosureNotice, 'theme'>): ThemeId {
  return notice.theme ?? autoTheme(notice)
}

// WCAG 2 상대 밝기로 견준 흰 글자와의 명암비
export function contrastWithWhite(hex: string): number {
  const channel = (offset: number) => {
    const c = parseInt(hex.slice(offset, offset + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
  return 1.05 / (luminance + 0.05)
}
