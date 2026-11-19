// 서버 경로(app/api/ai/forms)도 이 파일을 불러오므로 글씨·로고 값은 형만 가져온다(style.ts를 묶음에 끌어들이지 않는다)
import type { FormStyle } from '@/lib/forms/style'

// 서식 탭 휴진 안내 (specs/forms design.md 2절). 안내문 한 장 = 연·월(제목의 'N월') + 날짜 카드 1~4장 + 테마
export const MAX_CARDS = 4
export const MAX_NAME = 10 // 카드 이름 글자 수
export const MAX_STATUS = 6 // 카드 아래 글 글자 수
export const MAX_MEMO = 500 // 대충 적는 글 글자 수
export const MAX_RANGE_DAYS = 31 // 이어서 쉬는 날 카드 한 장(시작 포함)
export const DEFAULT_STATUS = '휴진'

// 공휴일 11개 뒤 달 12개(차례가 테마 고르기 칸의 차례다)
export const THEME_IDS = [
  'newyear', 'seollal', 'samiljeol', 'children', 'buddha', 'memorial',
  'liberation', 'chuseok', 'foundation', 'hangul', 'christmas',
  'm01', 'm02', 'm03', 'm04', 'm05', 'm06', 'm07', 'm08', 'm09', 'm10', 'm11', 'm12',
] as const
export type ThemeId = (typeof THEME_IDS)[number]
// 테마 그림 번호: 1 = public/poster/themes/<열쇠>.svg, 2 = <열쇠>-2.svg (specs/forms-themes design.md 2절)
export type ThemeArt = 1 | 2
// 고른 그림 값(form_notices.theme 한 칸): null = 저절로·그림 1 · 'auto-2' = 저절로·그림 2 · '<열쇠>' · '<열쇠>-2' · 'bg-<내 배경 id(소문자 uuid)>'
export type ThemePick = ThemeId | `${ThemeId}-2` | 'auto-2' | `bg-${string}`

export type NoticeCard = { start: string; end: string | null; name: string; status: string } // 날짜는 'YYYY-MM-DD'
// theme null = 저절로·그림 1. accent = 'N월'·날짜 띠·카드 아래 글의 색(form_notices.accent): 없음·null = 자동,
// 있으면 '#' + 소문자 16진수 6자리(specs/forms-accent design.md 2절). 선택 칸이라 글자 색 없는 지금 값도 그대로 맞는다.
// style = 글씨·로고 크기·색(specs/form-style design.md 2절): 없으면 처음대로. checkNotice는 처음대로면 열쇠 없이 돌려준다
export type ClosureNotice = {
  year: number
  month: number
  cards: NoticeCard[]
  theme: ThemePick | null
  accent?: string | null
  style?: FormStyle
}
export type SavedNotice = ClosureNotice & { id: string; updatedAt: string }
// 화면이 고치는 중인 카드(빈 칸 허용). 검사를 넘으면 NoticeCard가 된다
export type DraftCard = { start: string; end: string; name: string; status: string }
