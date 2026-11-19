// 서식 색 고르기의 기본 색 16가지 (spec form-style requirements.md '낱말'·AC-6801.3 ③, design.md 4절).
// 사용자가 고르는 인쇄물 글자·로고 색이라 앱 토큰 규칙의 예외이고(ADR-028), 이 16가지는 이 파일 한 곳에만 둔다
// (src/app/theme.test.ts가 막는다). 차례가 칩 차례다. 여러 곳이 같이 쓰니 얼려 둔다
export type BasicColor = { readonly name: string; readonly hex: string }

const color = (name: string, hex: string): BasicColor => Object.freeze({ name, hex })

export const BASIC_COLORS: readonly BasicColor[] = Object.freeze([
  color('검정', '#111111'),
  color('진회색', '#3a3a3a'),
  color('회색', '#6b7280'),
  color('흰색', '#ffffff'),
  color('남색', '#1f2a44'),
  color('파랑', '#2563eb'),
  color('하늘', '#0ea5e9'),
  color('청록', '#0d9488'),
  color('초록', '#16a34a'),
  color('연두', '#65a30d'),
  color('노랑', '#eab308'),
  color('주황', '#f97316'),
  color('빨강', '#dc2626'),
  color('분홍', '#db2777'),
  color('보라', '#7c3aed'),
  color('갈색', '#92400e'),
])
