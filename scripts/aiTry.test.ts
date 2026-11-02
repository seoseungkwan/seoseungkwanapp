import { describe, expect, it } from 'vitest'
import { generateReport, type GenerateDeps } from '../src/app/api/ai/generate'
import type { AiUsage, SavedReport } from '../src/types/aiReport'
import { fakeMonthsLoader, missingKeyMessage, resultFileName } from './aiTry'

const DIR = 'fixtures/fake-ai'
const USAGE: AiUsage = { inputTokens: 1000, outputTokens: 500, model: 'claude-opus-5-5' }
const goodText = JSON.stringify({
  summary: '신환이 늘었습니다.',
  cards: [
    { tag: 'up', text: '신환이 지난달보다 늘었습니다.', metric: 'total.newPatients' },
    { tag: 'watch', text: '재진은 지켜볼 만합니다.', metric: 'total.returning' },
    { tag: 'up', text: '전체 환자가 늘었습니다.', metric: 'total.patients' },
  ],
})

describe('fakeMonthsLoader', () => {
  it('AC-514.2 가짜 세 달과 그룹 이름을 읽는다', async () => {
    const m = await fakeMonthsLoader(DIR)('2026-10')
    expect((m.selected as { month: string }).month).toBe('2026-10')
    expect((m.prev as { month: string }).month).toBe('2026-09')
    expect((m.lastYear as { month: string }).month).toBe('2025-10')
    expect(m.groupNames['fake-manual']).toBe('도수치료')
  })
  it('AC-514.2 없는 달이면 셋 다 null', async () => {
    const m = await fakeMonthsLoader(DIR)('2020-01')
    expect([m.selected, m.prev, m.lastYear]).toEqual([null, null, null])
  })
  it('AC-514.2 generateReport가 성공하고 저장·사용량은 메모리 배열에 담긴다', async () => {
    const saved: SavedReport[] = []
    const used: unknown[] = []
    const deps: GenerateDeps = {
      loadMonths: fakeMonthsLoader(DIR),
      callClaude: async () => ({ ok: true, text: goodText, usage: USAGE }),
      saveReport: async (r) => (saved.push(r), true),
      addUsage: async (u) => (used.push(u), true),
      now: () => new Date('2026-11-01T00:00:00Z'),
    }
    const res = await generateReport('2026-10', deps)
    expect(res.ok).toBe(true)
    expect(saved).toHaveLength(1)
    expect(used).toHaveLength(1)
  })
})

describe('resultFileName', () => {
  it('AC-514.2 <달>-<YYYYMMDD-HHmmss>.md, 한국 시각', () => {
    // 2026-11-01T00:30:15Z = 한국 09:30:15
    const name = resultFileName('2026-10', new Date('2026-11-01T00:30:15Z'))
    expect(name).toBe('2026-10-20261101-093015.md')
    expect(name.endsWith('.md')).toBe(true)
  })
  it('AC-514.2 한국 날짜가 UTC와 다른 때', () => {
    expect(resultFileName('2026-10', new Date('2026-10-31T16:00:00Z'))).toBe('2026-10-20261101-010000.md')
  })
})

describe('missingKeyMessage', () => {
  it('AC-514.3 열쇠가 없으면 npm run ai:key 안내', () => {
    for (const env of [{}, { ANTHROPIC_API_KEY: '' }, { ANTHROPIC_API_KEY: '  ' }]) {
      const msg = missingKeyMessage(env)
      expect(msg).toContain('npm run ai:key')
      expect(msg).not.toContain('sk-ant-')
    }
  })
  it('AC-514.3 열쇠가 있으면 null', () => {
    expect(missingKeyMessage({ ANTHROPIC_API_KEY: 'sk-ant-fake-x' })).toBeNull()
  })
})
