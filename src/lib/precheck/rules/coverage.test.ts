import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import type { Tables } from '@/types/precheck'
import { loadTables } from '@/workers/precheck/tables'
import { ruleStatuses } from './engine'

// 규칙 덮기(REQ-010 AC-010.3, design.md 10절): 262개 규칙마다 골든에서 한 번 이상 걸리거나, 걸리게 할 수 없는 이유가 적혀 있다.
// rules-coverage.json은 scripts/precheck/golden/rules.mjs가 원본 결과로 만든다

const GOLDEN_DIR = fileURLToPath(new URL('../../../../fixtures/precheck/golden/', import.meta.url))
const COVERAGE = `${GOLDEN_DIR}rules-coverage.json`
const STATUS = `${GOLDEN_DIR}rules-status.json`

type Entry = { id: string; hitIn?: string; reason?: string }
type Coverage = { source: string; rules: Entry[] }

const readJson = <T,>(path: string) => JSON.parse(readFileSync(path, 'utf-8')) as T
const hitsIn = (name: string) => new Set(readJson<{ collect: { rows: [string, string][] } }>(`${GOLDEN_DIR}${name}`).collect.rows.map(([, id]) => id))

let tables: Tables
beforeAll(async () => {
  const loaded = await loadTables()
  if (!loaded.ok) throw new Error(loaded.code)
  tables = loaded.value
}, 60_000) // 약 표 JSON이 커서 바쁜 기계에서는 첫 읽기가 10초를 넘는다

describe('AC-010.3 규칙 262개 덮기', () => {
  const coverage = () => {
    expect(existsSync(COVERAGE), 'rules-coverage.json').toBe(true)
    return readJson<Coverage>(COVERAGE)
  }

  it('AC-010.3: 262개 규칙이 하나씩 빠짐없이 적혀 있다', () => {
    const { source, rules } = coverage()
    expect(source).toBe('seoseungkwan/shared@2a1069b')
    expect(rules).toHaveLength(262)
    expect(rules.map((r) => r.id).sort()).toEqual(tables.rules.rules.map((r) => r.id).sort())
  })

  it('AC-010.3: 규칙마다 걸린 골든(hitIn)이나 걸리게 할 수 없는 이유(reason) 중 하나만 있다', () => {
    const missing = coverage().rules.filter((r) => Boolean(r.hitIn) === Boolean(r.reason?.trim()))
    expect(missing).toEqual([])
  })

  it('AC-010.3: hitIn에 적은 골든에서 그 규칙이 실제로 걸렸다', () => {
    const cache = new Map<string, Set<string>>()
    for (const { id, hitIn } of coverage().rules) {
      if (!hitIn) continue
      if (!cache.has(hitIn)) cache.set(hitIn, hitsIn(hitIn))
      expect(cache.get(hitIn)!.has(id), `${id} ${hitIn}`).toBe(true)
    }
  })

  it('AC-010.3: 이유를 적은 규칙은 어느 골든에서도 걸리지 않았다', () => {
    const names = readdirSync(GOLDEN_DIR).filter((name) => /^rules-.+\.json$/.test(name) && name !== 'rules-coverage.json' && name !== 'rules-status.json')
    const hit = new Set(names.flatMap((name) => [...hitsIn(name)]))
    const wrong = coverage().rules.filter((r) => r.reason && hit.has(r.id)).map((r) => r.id)
    expect(wrong).toEqual([])
  })

  it('AC-010.3: 돌 수 있는 규칙(자동·이력) 중 이유를 적은 것은 왜 못 거는지 규칙마다 따로 적혀 있다', () => {
    const statuses = ruleStatuses(tables)
    const generic = coverage().rules.filter((r) => r.reason && ['auto', 'hist'].includes(statuses.get(r.id) ?? ''))
    for (const { id, reason } of generic) expect(reason, id).toMatch(/\S{8,}/)
    // 돌지 않는 규칙(SAM 단계·수동 확인)은 이유에 그 상태를 적는다
    const idle = coverage().rules.filter((r) => ['sam', 'manual'].includes(statuses.get(r.id) ?? ''))
    for (const { id, reason } of idle) expect(reason, id).toMatch(/SAM 단계|수동 확인/)
  })
})

describe('AC-010.3 규칙 상태(statusOf)가 원본과 같다', () => {
  it('AC-010.3: 규칙마다 자동·이력·SAM·수동 상태가 원본 statusOf와 같다', () => {
    expect(existsSync(STATUS), 'rules-status.json').toBe(true)
    const golden = readJson<{ statuses: Record<string, string> }>(STATUS)
    expect(Object.fromEntries(ruleStatuses(tables))).toEqual(golden.statuses)
  })
})
