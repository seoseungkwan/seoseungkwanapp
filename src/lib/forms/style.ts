import type { LogoBitmap } from './logoFit'

// 서식 글씨·로고 값(style): 제목·본문·로고 크기(%)와 제목·본문·로고 색 (spec form-style REQ-6804·REQ-6805·REQ-6806, design.md 2절).
// 순수 함수. 크기 100과 색 null이 '처음대로'(이 기능 전과 같은 그림)다. 16진수 색 글자를 두지 않는다

export type FormStyle = {
  titleScale: number // 80~130, 5씩. 100 = 지금 크기
  bodyScale: number // 80~130, 5씩
  logoScale: number // 60~150, 5씩
  titleColor: string | null // '#' + 소문자 16진수 6자리, null = 자동
  bodyColor: string | null // null = 자동
  logoColor: string | null // null = 원래 색
}

export const TEXT_SCALE = { min: 80, max: 130, step: 5 } as const
export const LOGO_SCALE = { min: 60, max: 150, step: 5 } as const
export const STYLE_KEYS = ['titleScale', 'bodyScale', 'logoScale', 'titleColor', 'bodyColor', 'logoColor'] as const

// 처음대로. 여러 곳이 같이 쓰니 얼려 둔다
export const DEFAULT_STYLE: FormStyle = Object.freeze({
  titleScale: 100,
  bodyScale: 100,
  logoScale: 100,
  titleColor: null,
  bodyColor: null,
  logoColor: null,
})

// 색 모양은 isAccentHex(themes.ts)와 같은 식. themes.ts → notice.ts → 이 파일로 도는 불러오기를 만들지 않으려고 여기 둔다
const COLOR_HEX = /^#[0-9a-f]{6}$/

type Range = { readonly min: number; readonly max: number; readonly step: number }

const isScale = (value: unknown, range: Range): value is number =>
  Number.isInteger(value) && (value as number) >= range.min && (value as number) <= range.max && (value as number) % range.step === 0
const isColor = (value: unknown): value is string | null => value === null || (typeof value === 'string' && COLOR_HEX.test(value))

// 정확히 여섯 열쇠에 범위·5의 배수·색 모양이 맞으면 새 객체, 아니면 null (AC-6806.3)
export function checkStyle(value: unknown): FormStyle | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const own = Object.keys(value)
  if (own.length !== STYLE_KEYS.length || !STYLE_KEYS.every((key) => own.includes(key))) return null
  const { titleScale, bodyScale, logoScale, titleColor, bodyColor, logoColor } = value as Record<string, unknown>
  if (!isScale(titleScale, TEXT_SCALE) || !isScale(bodyScale, TEXT_SCALE) || !isScale(logoScale, LOGO_SCALE)) return null
  if (!isColor(titleColor) || !isColor(bodyColor) || !isColor(logoColor)) return null
  return { titleScale, bodyScale, logoScale, titleColor, bodyColor, logoColor }
}

export function isDefaultStyle(s: FormStyle): boolean {
  return STYLE_KEYS.every((key) => s[key] === DEFAULT_STYLE[key])
}

// 처음 크기 × % ÷ 100 반올림 (AC-6804.1·AC-6804.2 등의 round(f × p / 100))
export function scaled(size: number, pct: number): number {
  return Math.round((size * pct) / 100)
}

export const TINT_CLEAR_ALPHA = 16 // 이보다 투명한 점은 비어 있는 점
export const TINT_CLEAR_SHARE = 0.1 // 비어 있는 점이 전체의 10% 이상이면 칠할 수 있는 로고

// 준비한 로고 그림에 색을 칠해도 되는지 (AC-6805.3): 배경이 남아 거의 다 불투명한 그림은 칠하면 네모 전체가 한 색이 된다
export function logoTintable(px: LogoBitmap): boolean {
  const points = px.width * px.height
  let clear = 0
  for (let p = 0; p < points; p++) if (px.data[p * 4 + 3] < TINT_CLEAR_ALPHA) clear++
  return clear >= points * TINT_CLEAR_SHARE
}
