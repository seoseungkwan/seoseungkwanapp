import { beforeAll, describe, expect, it } from 'vitest'
import type { RuleDef, Tables } from '@/types/precheck'
import { loadTables } from '@/workers/precheck/tables'
import { ruleStatusIn, statusesOf } from './status'

// 규칙 하나의 자동 점검 상태(specs/rule-auto AC-7802.4). 바꾼 규칙 검사가 판마다 상태가 같은지 보려고 규칙 하나씩 셈한다.
// 규칙표는 workers/precheck/tables.ts의 loadTables로만 부른다(AC-007.4)

let tables: Tables
beforeAll(async () => {
  const loaded = await loadTables()
  if (!loaded.ok) throw new Error(loaded.code)
  tables = loaded.value
}, 60_000) // 약 표 JSON이 커서 바쁜 기계에서는 첫 읽기가 10초를 넘는다

const ruleOf = (id: string) => {
  const rule = tables.rules.rules.find((r) => r.id === id)
  if (!rule) throw new Error(`규칙표에 ${id}가 없다`)
  return rule
}
const withParams = (rule: RuleDef, params: Record<string, unknown>): RuleDef => ({ ...rule, params })

describe('AC-7802.4 ruleStatusIn — 규칙 하나의 상태는 엔진의 statusesOf와 같다', () => {
  it('AC-7802.4: 실제 규칙표 262개 모두 statusesOf와 같은 상태다(자동·이력·SAM·수동이 모두 나온다)', () => {
    const all = statusesOf(tables.rules)
    const odd = tables.rules.rules.filter((rule) => ruleStatusIn(tables.rules, rule) !== all.get(rule.id)).map((rule) => rule.id)
    expect(odd).toEqual([])
    expect(new Set(all.values())).toEqual(new Set(['auto', 'hist', 'sam', 'manual']))
  })

  it('AC-7802.4: count_window 규칙(LA-18)의 thresholds를 비우면 이력 점검에서 수동 확인으로 바뀐다', () => {
    const rule = ruleOf('LA-18')
    expect(ruleStatusIn(tables.rules, rule)).toBe('hist')
    expect(ruleStatusIn(tables.rules, withParams(rule, { ...rule.params, thresholds: [] }))).toBe('manual')
    // 기준 횟수(at)가 없는 기준만 남아도 돌 수 없다
    expect(ruleStatusIn(tables.rules, withParams(rule, { ...rule.params, thresholds: [{ grade: '알림' }] }))).toBe('manual')
  })

  it('AC-7802.4: 숫자만 바꾼 규칙은 상태가 그대로이고, 규칙표 밖의 규칙도 그 내용만으로 셈한다', () => {
    const rule = ruleOf('LA-18')
    expect(ruleStatusIn(tables.rules, withParams(rule, { ...rule.params, thresholds: [{ at: 6, grade: '알림' }] }))).toBe('hist')
    const outside = { ...rule, id: 'ZZ-01' }
    expect(ruleStatusIn(tables.rules, outside)).toBe('hist')
  })

  it('AC-7802.4: 이상한 params여도 던지지 않고, 규칙표의 상태 기억(statusesOf)을 바꾸지 않는다', () => {
    const before = [...statusesOf(tables.rules)]
    const rule = ruleOf('LA-18')
    for (const params of [null, [], { target: 'la_all' }, { thresholds: 'x' }] as unknown as Record<string, unknown>[]) {
      expect(() => ruleStatusIn(tables.rules, withParams(rule, params))).not.toThrow()
    }
    expect([...statusesOf(tables.rules)]).toEqual(before)
  })
})
