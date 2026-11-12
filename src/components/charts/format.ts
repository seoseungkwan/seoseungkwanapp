import type { Delta } from '@/types/analysis'

// 차트 부품의 보이는 숫자 글자 (b2b-redesign REQ-205 AC-205.1, design.md '차트 부품'·'비율 표시', UI_GUIDE '차트').
// 보이는 숫자는 버린다(반올림 안 함, plan.md §5). 부동소수 오차(0.29 × 100 = 28.999…)를 막으려고 아주 작은 값을 더한 뒤 자르고,
// 음수는 절댓값으로 자른 뒤 부호를 붙인다. 그리는 위치(%·좌표)만 toFixed로 자른다(percentOf)

export type DeltaUnit = '명' | '건' | '%p'
export type DeltaView = { dir: 'up' | 'down' | 'flat' | 'none'; text: string; srText: string }

const EPSILON = 1e-9
const MINUS = '−' // 빼기 기호 −

// 소수 첫째 자리까지 버린 글자(부호 없음): 18.347 → '18.3', 28.999… → '29.0'. 처방별 추세 추세 글·하루 평균도 쓴다(group-exclude AC-3707.2)
export const truncatedOne =(x: number) => (Math.trunc(Math.abs(x) * 10 + EPSILON) / 10).toFixed(1)

// 세 자리마다 쉼표: 12000000 → '12,000,000'. 정수가 아니면 버린다
export function formatCount(n: number): string {
  const digits = String(Math.trunc(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return n <= -1 ? `${MINUS}${digits}` : digits
}

// 0~1 비율 → % 글자(소수 첫째 자리까지 버림): 0.18347 → '18.3'
export function formatRate(r: number): string {
  const text = truncatedOne(r * 100)
  return r < 0 && text !== '0.0' ? `${MINUS}${text}` : text
}

const NO_CHANGE: Record<Exclude<Delta['kind'], 'change'>, string> = {
  new: '새로 생김',
  'in-progress': '집계 중',
  unavailable: '비교할 수 없음',
}

// 증감 글자. 방향은 글자("늘어남"·"줄어듦", 화면 읽기)로도 준다. 크기는 부호 없이 쓰고 비율 괄호에만 +/−를 붙인다
// unit '%p'면 diff는 0~1 비율 차이이고 pct는 쓰지 않는다
export function formatDelta(d: Delta, unit: DeltaUnit): DeltaView {
  if (d.kind !== 'change') return { dir: 'none', text: NO_CHANGE[d.kind], srText: '' }
  if (d.diff === 0) return { dir: 'flat', text: '변화 없음', srText: '' }
  const up = d.diff > 0
  const size = unit === '%p' ? `${truncatedOne(d.diff * 100)}%p` : `${formatCount(Math.abs(d.diff))}${unit}`
  const pct = unit === '%p' || d.pct === null ? '' : ` (${up ? '+' : MINUS}${truncatedOne(d.pct)}%)`
  return { dir: up ? 'up' : 'down', text: `${size}${pct}`, srText: up ? '늘어남' : '줄어듦' }
}

// 그리는 위치 %: v/max를 0~100으로 자르고 Number(x.toFixed(2)). max가 0 이하이면 0
export function percentOf(v: number, max: number): number {
  if (!(max > 0)) return 0
  const pct = Math.min(100, Math.max(0, (v / max) * 100))
  return Number(pct.toFixed(2))
}
