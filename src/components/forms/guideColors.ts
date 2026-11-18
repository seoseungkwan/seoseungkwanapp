import type { GuideColors } from '@/lib/forms/logoColors'
import type { DrawColor } from '@/types/formGuide'

// 서식 탭 환자 안내문 그림 안의 색 (specs/forms-guide design.md 5절, REQ-4504·AC-4510.2, ADR-028 덧붙임).
// 병원 로고색 하나로 고정한다(사용자 결정 2026-11-15): 노랑·진회색·흰색과 띠 아래 작은 글의 옅은 회색, 그림자 검정.
// 인쇄물이라 앱 토큰 규칙의 예외이고, 이 다섯 값과 AI 그림 색 이름 표는 이 파일 한 곳에만 둔다(src/app/theme.test.ts가 막는다).
// GuidePoster.tsx·guidePictures.tsx는 여기서 가져다 쓴다.
// 병원 정보(spec clinic-profile REQ-6604, design.md 6절): 노랑·진회색 두 자리는 안내문에서 직접 고른 색 > 병원 로고 색 > 이 지금 색 차례로
// 바꿔 칠할 수 있다(guidePalette). 흰색·옅은 회색·그림자는 늘 그대로다
export const GUIDE_COLORS = {
  yellow: '#E6E006', // 윗단 바탕·진회색 위 글자(머리표·띠 제목·✓·강조)·번호 원·그림 채움
  dark: '#2e2e2e', // 띠 바탕·알약·노랑/흰 바탕 위 글자·그림 테두리
  white: '#fff', // 로고 칸 바탕·흰 상자·띠 줄 글·그림 받침
  note: '#d6d6d6', // 띠 아래 작은 글
  shadow: '#000', // 그림자 — 늘 SHADOW_OPACITY(18%)로만 쓴다
} as const
export const SHADOW_OPACITY = '.18'

// 안내문 한 장을 칠할 다섯 색(자리 이름은 지금 색 그대로: yellow = 바탕색 자리, dark = 띠 색 자리)
export type GuidePalette = { readonly yellow: string; readonly dark: string; readonly white: string; readonly note: string; readonly shadow: string }

// 직접 고른 색(colors) > 로고 색(logo) > 지금 색. 두 색 값은 부르는 쪽이 검사한 것('#' + 소문자 6자리)만 넘긴다
export function guidePalette(colors: GuideColors | null, logo: GuideColors | null): GuidePalette {
  const pick = colors ?? logo
  return pick ? { ...GUIDE_COLORS, yellow: pick.main, dark: pick.dark } : { ...GUIDE_COLORS }
}

// AI 그림 색 이름(REQ-4511) → 그릴 값. AI 답은 이름으로만 오고, 값은 이 표로만 바뀐다(안내문 색 셋과 칠하지 않음)
export function drawColorValues(palette: GuidePalette): Readonly<Record<DrawColor, string>> {
  return { yellow: palette.yellow, dark: palette.dark, white: palette.white, none: 'none' }
}
// 지금 색 그대로의 표
export const DRAW_COLOR_VALUES: Readonly<Record<DrawColor, string>> = drawColorValues(GUIDE_COLORS)
