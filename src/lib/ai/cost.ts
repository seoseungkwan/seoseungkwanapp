import type { AiUsage } from '@/types/aiReport'

// AI 비용(spec ai-report design.md '비용'). 순수 함수만 — 네트워크·DB·SDK·node 모듈 없음.
// 단위는 백만분의 1달러(micro USD) 정수다. 곱과 합만 하고 나누지 않는다(소수·반올림이 생기지 않게).
// 원화 바꾸기는 화면 명세가 한다 — 환율을 여기에 두지 않는다

export type Price = { input: number; output: number } // 백만분의 1달러 / 토큰

// claude-api skill 2026-10 표 (달러 / 백만 토큰 = 백만분의 1달러 / 토큰)
export const PRICES: Readonly<Record<string, Price>> = Object.freeze({
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
})

// 모르는 모델(예: fallbacks로 대신 답한 모델)은 적게 세지 않게 입력·출력 단가를 각각 표에서 가장 큰 값으로 쓴다
const MAX_PRICE: Price = {
  input: Math.max(...Object.values(PRICES).map((p) => p.input)),
  output: Math.max(...Object.values(PRICES).map((p) => p.output)),
}

export function costMicroUsd(u: Pick<AiUsage, 'model' | 'inputTokens' | 'outputTokens'>): number {
  // Object.hasOwn: 'constructor' 같은 이름이 원형(prototype)에서 찾히지 않게
  const price = Object.hasOwn(PRICES, u.model) ? PRICES[u.model] : MAX_PRICE
  return u.inputTokens * price.input + u.outputTokens * price.output
}

// 휴진 안내 AI 배경 그림 값(specs/forms-themes design.md 9절, AC-4607.4). PRICES에 넣지 않는다 —
// 넣으면 '모르는 모델은 가장 비싼 단가' 규칙(AC-509.2)이 Claude 값까지 바꾼다
export const IMAGE_PRICE: Price = { input: 5, output: 30 }
// 답에 사용량이 없을 때 한 장 값(약 $0.06, 조금 넉넉히)
export const IMAGE_COST_GUESS = 60_000

export function imageCostMicroUsd(u: { inputTokens: number; outputTokens: number } | null): number {
  if (u === null) return IMAGE_COST_GUESS
  return u.inputTokens * IMAGE_PRICE.input + u.outputTokens * IMAGE_PRICE.output
}
