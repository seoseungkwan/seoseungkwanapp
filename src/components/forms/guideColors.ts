import type { DrawColor } from '@/types/formGuide'

// 서식 탭 환자 안내문 그림 안의 색 (specs/forms-guide design.md 5절, REQ-4504·AC-4510.2, ADR-028 덧붙임).
// 병원 로고색 하나로 고정한다(사용자 결정 2026-11-15): 노랑·진회색·흰색과 띠 아래 작은 글의 옅은 회색, 그림자 검정.
// 인쇄물이라 앱 토큰 규칙의 예외이고, 이 다섯 값과 AI 그림 색 이름 표는 이 파일 한 곳에만 둔다(src/app/theme.test.ts가 막는다).
// GuidePoster.tsx·guidePictures.tsx는 여기서 가져다 쓴다
export const GUIDE_COLORS = {
  yellow: '#E6E006', // 윗단 바탕·진회색 위 글자(머리표·띠 제목·✓·강조)·번호 원·그림 채움
  dark: '#2e2e2e', // 띠 바탕·알약·노랑/흰 바탕 위 글자·그림 테두리
  white: '#fff', // 로고 칸 바탕·흰 상자·띠 줄 글·그림 받침
  note: '#d6d6d6', // 띠 아래 작은 글
  shadow: '#000', // 그림자 — 늘 SHADOW_OPACITY(18%)로만 쓴다
} as const
export const SHADOW_OPACITY = '.18'

// AI 그림 색 이름(REQ-4511) → 그릴 값. AI 답은 이름으로만 오고, 값은 이 표로만 바뀐다(로고색 셋과 칠하지 않음)
export const DRAW_COLOR_VALUES: Readonly<Record<DrawColor, string>> = {
  yellow: GUIDE_COLORS.yellow,
  dark: GUIDE_COLORS.dark,
  white: GUIDE_COLORS.white,
  none: 'none',
}
