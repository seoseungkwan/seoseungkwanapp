import { describe, expect, it } from 'vitest'
import { PRICES, costMicroUsd } from './cost'

// 비용은 백만분의 1달러(micro USD) 정수다(spec ai-report design.md '비용'). 정수 곱의 합만 하고 나누지 않는다

const maxInput = Math.max(...Object.values(PRICES).map((p) => p.input))
const maxOutput = Math.max(...Object.values(PRICES).map((p) => p.output))

describe('AC-509.1 가격표의 모델은 그 모델 단가로 센다', () => {
  it('AC-509.1 opus-5-5 입력 10,000·출력 4,000이면 120,000 micro USD', () => {
    const cost = costMicroUsd({ model: 'claude-opus-5-5', inputTokens: 10_000, outputTokens: 4_000 })
    expect(cost).toBe(120_000)
    expect(Number.isSafeInteger(cost)).toBe(true)
  })

  it('AC-509.1 가격표는 opus-5-5 4·20, opus-5 5·25, opus-4-8 5·25 (micro USD / 토큰)', () => {
    expect(PRICES).toEqual({
      'claude-opus-5-5': { input: 4, output: 20 },
      'claude-opus-5': { input: 5, output: 25 },
      'claude-opus-4-8': { input: 5, output: 25 },
    })
    for (const p of Object.values(PRICES)) {
      expect(Number.isSafeInteger(p.input)).toBe(true)
      expect(Number.isSafeInteger(p.output)).toBe(true)
    }
  })

  it('AC-509.1 표의 다른 모델도 입력×입력단가 + 출력×출력단가', () => {
    expect(costMicroUsd({ model: 'claude-opus-5', inputTokens: 10_000, outputTokens: 4_000 })).toBe(150_000)
    expect(costMicroUsd({ model: 'claude-opus-4-8', inputTokens: 1, outputTokens: 1 })).toBe(30)
    expect(costMicroUsd({ model: 'claude-opus-5-5', inputTokens: 0, outputTokens: 0 })).toBe(0)
  })
})

describe('AC-509.2 가격표에 없는 모델은 표의 가장 비싼 단가로 센다', () => {
  it.each(['claude-unknown-x', 'constructor', 'toString', '__proto__', ''])(
    'AC-509.2 모르는 모델 %j 입력 10,000·출력 4,000이면 150,000 micro USD',
    (model) => {
      const cost = costMicroUsd({ model, inputTokens: 10_000, outputTokens: 4_000 })
      expect(cost).toBe(150_000)
      expect(cost).toBe(10_000 * maxInput + 4_000 * maxOutput)
      expect(Number.isSafeInteger(cost)).toBe(true)
    },
  )

  it('AC-509.2 모르는 모델은 opus-5-5보다 적게 세지 않는다', () => {
    const usage = { inputTokens: 12_345, outputTokens: 6_789 }
    const unknown = costMicroUsd({ model: 'claude-unknown-x', ...usage })
    for (const model of Object.keys(PRICES)) {
      expect(unknown).toBeGreaterThanOrEqual(costMicroUsd({ model, ...usage }))
    }
    expect(unknown).toBeGreaterThan(costMicroUsd({ model: 'claude-opus-5-5', ...usage }))
  })
})
