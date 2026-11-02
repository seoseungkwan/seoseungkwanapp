import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { validateMonthPayload } from '@/lib/payload/validate'
import type { MonthPayload } from '@/types/payload'

// AI 리포트용 가짜 숫자(spec ai-report REQ-503). 지어낸 숫자는 이 폴더와 시험에만 둔다 — 앱 코드(src/)는 읽지 않는다

const MONTHS = ['2025-10', '2026-09', '2026-10'] as const
const FAKE_CODE = /^FAKE-\d{3}$/

const readJson = (path: string): unknown => JSON.parse(readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8'))
const raw = (month: string) => readJson(`./months/${month}.json`)
const groupNames = () => readJson('./groups.json') as Record<string, string>

function checked(month: string): MonthPayload {
  const payload = validateMonthPayload(raw(month))
  if (payload === null) throw new Error(`${month}.json이 validateMonthPayload를 통과하지 못한다`)
  return payload
}

// 글자 코드 순(입력 묶음 input.ts와 같은 비교)
const isSorted = (keys: readonly string[]) => keys.every((key, i) => i === 0 || keys[i - 1] < key)

describe('AC-503.1 세 달 가짜 숫자', () => {
  it.each(MONTHS)('AC-503.1 %s.json은 validateMonthPayload를 통과하고 month가 파일 이름과 같다', (month) => {
    const payload = validateMonthPayload(raw(month))
    expect(payload).not.toBeNull()
    expect(payload?.month).toBe(month)
  })

  it.each(MONTHS)('AC-503.1 %s.json의 처방은 코드 순·그룹은 id 순·동네는 이름 순이고 처방코드는 지어낸 글자다', (month) => {
    const payload = checked(month)
    expect(isSorted(payload.rx.map((rx) => rx.code))).toBe(true)
    expect(isSorted(payload.groups.map((group) => group.id))).toBe(true)
    expect(isSorted(payload.regions.map((region) => region.name))).toBe(true)
    for (const rx of payload.rx) expect(rx.code).toMatch(FAKE_CODE)
  })
})

describe('AC-503.2 그룹 이름', () => {
  it('AC-503.2 세 달의 모든 groups[].id에 groups.json 이름(1~30자)이 있다', () => {
    const names = groupNames()
    const ids = new Set(MONTHS.flatMap((month) => checked(month).groups.map((group) => group.id)))
    expect(ids.size).toBeGreaterThan(0)
    for (const id of ids) {
      const name = names[id]
      expect(typeof name, id).toBe('string')
      expect(name.length, id).toBeGreaterThanOrEqual(1)
      expect(name.length, id).toBeLessThanOrEqual(30)
    }
  })
})

describe('AC-503.3 늘었어요·줄었어요 거리', () => {
  it('AC-503.3 2026-10 신환이 2026-09보다 많다', () => {
    expect(checked('2026-10').totals.newPatients).toBeGreaterThan(checked('2026-09').totals.newPatients)
  })

  it('AC-503.3 두 달에 다 있는 그룹 중 하나 이상은 2026-10 환자 수가 2026-09보다 적다', () => {
    const before = new Map(checked('2026-09').groups.map((group) => [group.id, group.patients]))
    const fewer = checked('2026-10').groups.filter((group) => {
      const prev = before.get(group.id)
      return prev !== undefined && group.patients < prev
    })
    expect(fewer.length).toBeGreaterThanOrEqual(1)
  })

  it('AC-503.3 2026-10은 partial: false다', () => {
    expect(checked('2026-10').partial).toBe(false)
  })
})
