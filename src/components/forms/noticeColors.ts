import { onWhite, type GuideColors } from '@/lib/forms/logoColors'

// 진료일정(휴진) 안내 그림의 글자 지금 색과 [자동] 제목·강조 색 (spec form-style REQ-6803 AC-6803.1·AC-6803.2, design.md 4절).
// 인쇄물이라 앱 토큰 규칙의 예외이고(ADR-028), 16진수 색은 이 두 값만 둔다(src/app/theme.test.ts가 막는다). 순수 함수
export const NOTICE_INK = '#262626' // '진료일정안내'·카드 이름
export const NOTICE_LEAD = '#3a3a3a' // 안내 두 줄

// 로고 두 색이 있으면 제목은 띠 색(dark), 강조는 흰 바탕 위에서 읽히는 바탕색(onWhite(main)).
// 없으면 지금처럼 제목은 NOTICE_INK, 강조는 배경 그림 강조색 → 테마 강조색
export function noticeAutoColors(a: { logoColors: GuideColors | null; backgroundAccent: string | null; themeAccent: string }): { title: string; accent: string } {
  if (a.logoColors !== null) return { title: a.logoColors.dark, accent: onWhite(a.logoColors.main) }
  return { title: NOTICE_INK, accent: a.backgroundAccent ?? a.themeAccent }
}
