import { THEME_IDS, type ClosureNotice, type ThemeArt, type ThemeId, type ThemePick } from '@/types/forms'
import { sortCards } from './notice'

// 서식 탭 휴진 안내의 테마 23개(공휴일 11 + 달 12)와 저절로 고르기 (specs/forms design.md 4절).
// 강조색은 승인된 테마 시안(docs/mockups/forms/themes.html)의 값. 그림은 public/poster/themes/<열쇠>.svg(그림 1)와
// <열쇠>-2.svg(그림 2), 고른 그림 값(form_notices.theme 한 칸)은 specs/forms-themes design.md 2절

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

// ---------- 고른 그림 값 (specs/forms-themes REQ-4602, design.md 2절) ----------

// 흑백에 가까운 AI 배경 그림의 대신 강조색(현충일 남색, 흰색과 8.8:1)
export const BACKGROUND_FALLBACK_ACCENT = '#2f4a7a'

// 안내문에 그릴 것: 테마 그림(열쇠·그림 번호) 또는 내 배경(id = 소문자 uuid)
export type Look = { kind: 'theme'; theme: ThemeId; art: ThemeArt } | { kind: 'background'; id: string }

const AUTO_SECOND: ThemePick = 'auto-2'
const SECOND = '-2'
const BACKGROUND_PREFIX = 'bg-'
const BACKGROUND_PICK = /^bg-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// 테마 쪽 값을 푼 것. theme null = 저절로
type ThemePart = { theme: ThemeId | null; art: ThemeArt }

function isThemeKey(value: unknown): value is ThemeId {
  return (THEME_IDS as readonly unknown[]).includes(value)
}

const isBackgroundPick = (value: unknown): value is `bg-${string}` => typeof value === 'string' && BACKGROUND_PICK.test(value)

// 테마 쪽 값(null·auto-2·<열쇠>·<열쇠>-2)이면 테마·그림 번호, 내 배경이나 모르는 값이면 null
function themePartOf(pick: unknown): ThemePart | null {
  if (pick === null) return { theme: null, art: 1 }
  if (pick === AUTO_SECOND) return { theme: null, art: 2 }
  if (isThemeKey(pick)) return { theme: pick, art: 1 }
  if (typeof pick !== 'string' || !pick.endsWith(SECOND)) return null
  const base = pick.slice(0, -SECOND.length)
  return isThemeKey(base) ? { theme: base, art: 2 } : null
}

function pickOf({ theme, art }: ThemePart): ThemePick | null {
  if (theme === null) return art === 2 ? AUTO_SECOND : null
  return art === 2 ? `${theme}${SECOND}` : theme
}

// 테마 열쇠 23개, <열쇠>-2 23개, auto-2, bg-<소문자 uuid>만 참(AC-4602.1). null은 고른 값이 아니다(저절로)
export function isThemePick(value: unknown): value is ThemePick {
  if (isBackgroundPick(value)) return true
  return value !== null && themePartOf(value) !== null
}

// 고른 값을 풀어 그릴 것을 정한다(AC-4602.2). 저절로면 카드 이름·안내 달로 고른 테마
export function lookOfPick(notice: Pickable & Pick<ClosureNotice, 'theme'>): Look {
  if (isBackgroundPick(notice.theme)) return { kind: 'background', id: notice.theme.slice(BACKGROUND_PREFIX.length) }
  const { theme, art } = themePartOf(notice.theme) ?? { theme: null, art: 1 }
  return { kind: 'theme', theme: theme ?? autoTheme(notice), art }
}

// 테마는 그대로 그림 번호만 바꾼다. 내 배경 값은 그대로(AC-4602.3)
export function withArt(pick: ThemePick | null, art: ThemeArt): ThemePick | null {
  const part = themePartOf(pick)
  return part === null ? pick : pickOf({ theme: part.theme, art })
}

// 그림 번호는 그대로 테마만 바꾼다(theme null = 저절로). 내 배경에서 오면 그림 1(AC-4602.3)
export function withTheme(pick: ThemePick | null, theme: ThemeId | null): ThemePick | null {
  return pickOf({ theme, art: themePartOf(pick)?.art ?? 1 })
}

export const backgroundPick = (id: string): ThemePick => `${BACKGROUND_PREFIX}${id}`

// 테마 그림 주소: 그림 1은 /poster/themes/<열쇠>.svg(지금 주소), 그림 2는 <열쇠>-2.svg
export function themeHref(theme: ThemeId, art: ThemeArt = 1): string {
  return `/poster/themes/${theme}${art === 2 ? SECOND : ''}.svg`
}

// 안내문의 테마 열쇠: 테마 값이면 그 테마, 내 배경이면 저절로 고른 테마
export function themeInUse(notice: Pickable & Pick<ClosureNotice, 'theme'>): ThemeId {
  const look = lookOfPick(notice)
  return look.kind === 'theme' ? look.theme : autoTheme(notice)
}

// WCAG 2 상대 밝기('#rrggbb')
function luminanceOf(hex: string): number {
  const channel = (offset: number) => {
    const c = parseInt(hex.slice(offset, offset + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

// WCAG 2 상대 밝기로 견준 흰 글자와의 명암비
export function contrastWithWhite(hex: string): number {
  return 1.05 / (luminanceOf(hex) + 0.05)
}

// 두 색의 WCAG 2 명암비(1~21, 차례와 상관없다)
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminanceOf(a), luminanceOf(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

// ---------- 직접 고른 글자 색 (specs/forms-accent design.md 2절) ----------

const ACCENT_HEX = /^#[0-9a-f]{6}$/
const LIGHT_BELOW = 4.5 // 흰색과의 명암비가 이보다 작으면 옅은 색

// 글자 색('N월'·날짜 띠·카드 아래 글) 모양: '#' + 소문자 16진수 6자리만(AC-4702.3·AC-4703.3)
export function isAccentHex(value: unknown): value is string {
  return typeof value === 'string' && ACCENT_HEX.test(value)
}

// 흰 글자·흰 카드 위 글이 잘 안 보일 수 있는 옅은 색(흰색과 4.5 미만). 경고만 하고 막지 않는다(AC-4701.4)
export function isLightAccent(hex: string): boolean {
  return contrastRatio(hex, '#ffffff') < LIGHT_BELOW
}
