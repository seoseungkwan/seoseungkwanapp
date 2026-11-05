import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { costMicroUsd } from '@/lib/ai/cost'
import { buildReportInput, reportFingerprint } from '@/lib/ai/input'
import { parseAiReport } from '@/lib/ai/output'
import { reportJsonSchema, systemPrompt, userMessage } from '@/lib/ai/prompt'
import { addMonths } from '@/lib/analytics/dates'
import { validateMonthPayload } from '@/lib/payload/validate'
import type { AiErrorCode, AiUsage, ReportInput } from '@/types/aiReport'
import type { ClaudeResult } from './claude'
import { generateReport, isReportStale, type GenerateDeps } from './generate'
import type { ReportMonths } from './store'

// 가짜 숫자는 fixtures/fake-ai/에서 읽는다. deps는 모두 가짜이고 부른 차례를 order에 적는다
const readJson = (rel: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../../../fixtures/fake-ai/${rel}`, import.meta.url)), 'utf8'))
const MONTH = '2026-10'
const NOW = new Date('2026-11-02T01:02:03.000Z')
const USAGE: AiUsage = { inputTokens: 1000, outputTokens: 500, model: 'claude-opus-5-5' }

function fixtureMonths(): ReportMonths {
  return {
    selected: readJson('months/2026-10.json'),
    prev: readJson('months/2026-09.json'),
    lastYear: readJson('months/2025-10.json'),
    groupNames: readJson('groups.json') as Record<string, string>,
  }
}

// 고른 달을 바꾼 가짜 자료: 세 달의 month 칸만 바꾼다(숫자는 같은 가짜)
function monthsFor(month: string): ReportMonths {
  const base = fixtureMonths()
  const withMonth = (v: unknown, m: string) => ({ ...(v as Record<string, unknown>), month: m })
  return {
    ...base,
    selected: withMonth(base.selected, month),
    prev: withMonth(base.prev, addMonths(month, -1)),
    lastYear: withMonth(base.lastYear, addMonths(month, -12)),
  }
}

function inputOf(months: ReportMonths): ReportInput {
  return buildReportInput({
    selected: validateMonthPayload(months.selected)!,
    prev: validateMonthPayload(months.prev),
    lastYear: validateMonthPayload(months.lastYear),
    groupNames: months.groupNames,
  })
}

const goodText = JSON.stringify({
  summary: '신환이 늘고 재진도 함께 늘었습니다.',
  cards: [
    { tag: 'up', text: '신환이 지난달보다 늘었습니다.', metric: 'total.newPatients' },
    { tag: 'watch', text: '재진은 지켜볼 만합니다.', metric: 'total.returning' },
    { tag: 'up', text: '전체 환자가 늘었습니다.', metric: 'total.patients' },
  ],
})

function setup(
  opts: {
    months?: ReportMonths | (() => Promise<ReportMonths>)
    claude?: ClaudeResult | (() => Promise<ClaudeResult>)
    save?: boolean | 'throw'
    usage?: boolean | 'throw'
  } = {},
) {
  const order: string[] = []
  const monthsOpt = opts.months ?? fixtureMonths()
  const claudeOpt = opts.claude ?? { ok: true as const, text: goodText, usage: USAGE }
  const deps = {
    loadMonths: vi.fn<GenerateDeps['loadMonths']>(async () => {
      order.push('loadMonths')
      return typeof monthsOpt === 'function' ? monthsOpt() : monthsOpt
    }),
    callClaude: vi.fn<GenerateDeps['callClaude']>(async () => {
      order.push('callClaude')
      return typeof claudeOpt === 'function' ? claudeOpt() : claudeOpt
    }),
    saveReport: vi.fn<GenerateDeps['saveReport']>(async () => {
      order.push('saveReport')
      if (opts.save === 'throw') throw new Error('boom')
      return opts.save ?? true
    }),
    addUsage: vi.fn<GenerateDeps['addUsage']>(async () => {
      order.push('addUsage')
      if (opts.usage === 'throw') throw new Error('boom')
      return opts.usage ?? true
    }),
    now: () => NOW,
  }
  return { deps: deps as unknown as GenerateDeps & typeof deps, order }
}

describe('generateReport', () => {
  it('AC-511.1 고른 달 숫자가 없으면 Claude를 부르지 않고 E-AI-NO-DATA', async () => {
    const { deps, order } = setup({ months: { ...fixtureMonths(), selected: null } })
    expect(await generateReport(MONTH, deps)).toEqual({ ok: false, code: 'E-AI-NO-DATA' })
    expect(order).toEqual(['loadMonths'])
  })

  it('AC-511.1 고른 달이 검사를 못 넘는 모양이면 Claude를 부르지 않고 E-AI-NO-DATA', async () => {
    const { deps } = setup({ months: { ...fixtureMonths(), selected: { month: MONTH, totals: 'x' } } })
    expect(await generateReport(MONTH, deps)).toEqual({ ok: false, code: 'E-AI-NO-DATA' })
    expect(deps.callClaude).not.toHaveBeenCalled()
    expect(deps.saveReport).not.toHaveBeenCalled()
    expect(deps.addUsage).not.toHaveBeenCalled()
  })

  it('AC-511.1 비교 달이 검사를 못 넘으면 그 달은 없는 달로 본다', async () => {
    const months = { ...fixtureMonths(), prev: { month: '2026-09', broken: true }, lastYear: { month: '2025-10', totals: 'x' } }
    const { deps } = setup({ months })
    const res = await generateReport(MONTH, deps)
    expect(res.ok).toBe(true)
    const expected = buildReportInput({
      selected: validateMonthPayload(months.selected)!,
      prev: null,
      lastYear: null,
      groupNames: months.groupNames,
    })
    expect(expected.hasPrev).toBe(false)
    expect(expected.hasLastYear).toBe(false)
    const { user } = deps.callClaude.mock.calls[0][0]
    expect(user).toBe(userMessage(expected))
    expect(user).not.toContain('broken')
  })

  it('AC-511.1 고른 달 자료의 month가 요청한 달과 다르면 Claude를 부르지 않고 E-AI-NO-DATA', async () => {
    const { deps } = setup({ months: monthsFor('2026-09') })
    expect(await generateReport(MONTH, deps)).toEqual({ ok: false, code: 'E-AI-NO-DATA' })
    expect(deps.callClaude).not.toHaveBeenCalled()
    expect(deps.saveReport).not.toHaveBeenCalled()
  })

  it('AC-511.1 비교 달 자료의 month가 한 달 전·12달 전이 아니면 그 달은 없는 달로 본다', async () => {
    const base = fixtureMonths()
    const months = { ...base, prev: base.lastYear, lastYear: base.prev } // 서로 바뀐 달
    const { deps } = setup({ months })
    const res = await generateReport(MONTH, deps)
    expect(res.ok).toBe(true)
    const expected = buildReportInput({
      selected: validateMonthPayload(base.selected)!,
      prev: null,
      lastYear: null,
      groupNames: base.groupNames,
    })
    expect(deps.callClaude.mock.calls[0][0].user).toBe(userMessage(expected))
  })

  it('AC-511.1 loadMonths가 undefined를 줘도 Claude를 부르지 않고 E-AI-FAILED', async () => {
    const { deps } = setup({ months: (async () => undefined) as unknown as () => Promise<ReportMonths> })
    expect(await generateReport(MONTH, deps)).toEqual({ ok: false, code: 'E-AI-FAILED' })
    expect(deps.callClaude).not.toHaveBeenCalled()
  })

  it('AC-511.1 입력 만들기에서 던져도(groupNames가 null) Claude를 부르지 않고 E-AI-FAILED', async () => {
    const { deps } = setup({ months: { ...fixtureMonths(), groupNames: null as unknown as Record<string, string> } })
    expect(await generateReport(MONTH, deps)).toEqual({ ok: false, code: 'E-AI-FAILED' })
    expect(deps.callClaude).not.toHaveBeenCalled()
    expect(deps.saveReport).not.toHaveBeenCalled()
    expect(deps.addUsage).not.toHaveBeenCalled()
  })

  it('AC-511.1 loadMonths가 던지면 Claude를 부르지 않고 E-AI-FAILED', async () => {
    const { deps } = setup({
      months: async () => {
        throw new Error('db')
      },
    })
    expect(await generateReport(MONTH, deps)).toEqual({ ok: false, code: 'E-AI-FAILED' })
    expect(deps.callClaude).not.toHaveBeenCalled()
  })

  it('AC-511.2 차례는 loadMonths → callClaude → saveReport → addUsage이고 저장한 리포트를 돌려준다', async () => {
    const months = fixtureMonths()
    const usage = { ...USAGE, model: 'claude-fallback-x' }
    const { deps, order } = setup({ months, claude: { ok: true, text: goodText, usage } })
    const res = await generateReport(MONTH, deps)
    expect(order).toEqual(['loadMonths', 'callClaude', 'saveReport', 'addUsage'])
    if (!res.ok) throw new Error('성공이어야 한다')
    const input = inputOf(months)
    const parsed = parseAiReport(goodText, input)!
    expect(deps.loadMonths).toHaveBeenCalledWith(MONTH)
    expect(deps.callClaude).toHaveBeenCalledWith({
      system: systemPrompt(),
      user: userMessage(input),
      schema: reportJsonSchema(),
    })
    expect(res.report).toBe(deps.saveReport.mock.calls[0][0])
    expect(res.report).toEqual({
      month: MONTH,
      partial: input.partial,
      summary: parsed.summary,
      cards: parsed.cards,
      model: 'claude-fallback-x',
      inputHash: await reportFingerprint(input),
      createdAt: NOW.toISOString(),
    })
    expect(res.report.cards.every((c) => c.basis !== '')).toBe(true)
    expect(res.usage).toEqual(usage)
    expect(deps.addUsage).toHaveBeenCalledWith({ ...usage, costMicroUsd: costMicroUsd(usage) })
  })

  it('AC-511.2 자료가 집계 중(partial)이면 리포트도 partial', async () => {
    const base = fixtureMonths()
    const months = { ...base, selected: { ...(base.selected as Record<string, unknown>), partial: true } }
    const { deps } = setup({ months })
    const res = await generateReport(MONTH, deps)
    if (!res.ok) throw new Error('성공이어야 한다')
    expect(inputOf(months).partial).toBe(true)
    expect(res.report.partial).toBe(true)
  })

  it('AC-511.2 다른 달을 골라도 그 달로 읽고 그 달 리포트로 저장한다', async () => {
    const months = monthsFor('2026-11')
    const { deps } = setup({ months })
    const res = await generateReport('2026-11', deps)
    if (!res.ok) throw new Error('성공이어야 한다')
    expect(deps.loadMonths).toHaveBeenCalledWith('2026-11')
    expect(res.report.month).toBe('2026-11')
    expect(deps.callClaude.mock.calls[0][0].user).toBe(userMessage(inputOf(months)))
  })

  it('AC-511.5 createdAt을 못 만들면(now가 던짐) 사용량은 기록하고 E-AI-FAILED', async () => {
    const { deps, order } = setup()
    deps.now = () => {
      throw new Error('clock')
    }
    expect(await generateReport(MONTH, deps)).toEqual({ ok: false, code: 'E-AI-FAILED' })
    expect(order).toEqual(['loadMonths', 'callClaude', 'addUsage'])
    expect(deps.saveReport).not.toHaveBeenCalled()
  })

  it('AC-511.5 now가 잘못된 날짜를 줘도 사용량은 기록하고 E-AI-FAILED', async () => {
    const { deps, order } = setup()
    deps.now = () => new Date('nope')
    expect(await generateReport(MONTH, deps)).toEqual({ ok: false, code: 'E-AI-FAILED' })
    expect(order).toEqual(['loadMonths', 'callClaude', 'addUsage'])
  })

  it('AC-511.3 답 검사가 null이면 저장하지 않고 사용량은 기록하고 E-AI-FAILED', async () => {
    const bad = JSON.stringify({ summary: '신환이 12명 늘었습니다.', cards: JSON.parse(goodText).cards })
    const { deps, order } = setup({ claude: { ok: true, text: bad, usage: USAGE } })
    expect(await generateReport(MONTH, deps)).toEqual({ ok: false, code: 'E-AI-FAILED' })
    expect(order).toEqual(['loadMonths', 'callClaude', 'addUsage'])
    expect(deps.addUsage).toHaveBeenCalledWith({ ...USAGE, costMicroUsd: costMicroUsd(USAGE) })
  })

  it('AC-511.3 검사 null일 때 사용량 기록도 실패하면 E-AI-FAILED', async () => {
    const { deps } = setup({ claude: { ok: true, text: 'not json', usage: USAGE }, usage: false })
    expect(await generateReport(MONTH, deps)).toEqual({ ok: false, code: 'E-AI-FAILED' })
    expect(deps.saveReport).not.toHaveBeenCalled()
  })

  it('AC-511.4 사용량 없는 Claude 오류는 저장·기록 없이 그 오류 번호', async () => {
    const { deps, order } = setup({ claude: { ok: false, code: 'E-AI-BUSY', usage: null } })
    expect(await generateReport(MONTH, deps)).toEqual({ ok: false, code: 'E-AI-BUSY' })
    expect(order).toEqual(['loadMonths', 'callClaude'])
  })

  it('AC-511.4 사용량 있는 Claude 오류(refusal)는 사용량만 기록하고 그 오류 번호', async () => {
    const { deps, order } = setup({ claude: { ok: false, code: 'E-AI-FAILED', usage: USAGE } })
    expect(await generateReport(MONTH, deps)).toEqual({ ok: false, code: 'E-AI-FAILED' })
    expect(order).toEqual(['loadMonths', 'callClaude', 'addUsage'])
    expect(deps.addUsage).toHaveBeenCalledWith({ ...USAGE, costMicroUsd: costMicroUsd(USAGE) })
  })

  it('AC-511.4 사용량 있는 E-AI-LIMIT은 기록하고 그 번호 그대로', async () => {
    const { deps } = setup({ claude: { ok: false, code: 'E-AI-LIMIT', usage: USAGE } })
    expect(await generateReport(MONTH, deps)).toEqual({ ok: false, code: 'E-AI-LIMIT' })
    expect(deps.addUsage).toHaveBeenCalledWith({ ...USAGE, costMicroUsd: costMicroUsd(USAGE) })
  })

  it('AC-511.4 사용량 있는 오류에서 기록이 실패하면 E-AI-FAILED', async () => {
    const code: AiErrorCode = 'E-AI-LIMIT'
    const { deps } = setup({ claude: { ok: false, code, usage: USAGE }, usage: false })
    expect(await generateReport(MONTH, deps)).toEqual({ ok: false, code: 'E-AI-FAILED' })
  })

  it('AC-511.4 callClaude가 던지면 E-AI-FAILED이고 저장·기록 없음', async () => {
    const { deps } = setup({
      claude: async () => {
        throw new Error('x')
      },
    })
    expect(await generateReport(MONTH, deps)).toEqual({ ok: false, code: 'E-AI-FAILED' })
    expect(deps.saveReport).not.toHaveBeenCalled()
    expect(deps.addUsage).not.toHaveBeenCalled()
  })

  it('AC-511.5 저장이 실패하면 사용량은 기록하고 E-AI-FAILED', async () => {
    const { deps, order } = setup({ save: false })
    expect(await generateReport(MONTH, deps)).toEqual({ ok: false, code: 'E-AI-FAILED' })
    expect(order).toEqual(['loadMonths', 'callClaude', 'saveReport', 'addUsage'])
  })

  it('AC-511.5 저장이 던져도 사용량은 기록하고 E-AI-FAILED', async () => {
    const { deps } = setup({ save: 'throw' })
    expect(await generateReport(MONTH, deps)).toEqual({ ok: false, code: 'E-AI-FAILED' })
    expect(deps.addUsage).toHaveBeenCalledTimes(1)
  })

  it('AC-511.5 사용량 기록이 실패하면 E-AI-FAILED(리포트를 돌려주지 않는다)', async () => {
    const { deps } = setup({ usage: false })
    expect(await generateReport(MONTH, deps)).toEqual({ ok: false, code: 'E-AI-FAILED' })
  })

  it('AC-511.5 사용량 기록이 던져도 E-AI-FAILED', async () => {
    const { deps } = setup({ usage: 'throw' })
    expect(await generateReport(MONTH, deps)).toEqual({ ok: false, code: 'E-AI-FAILED' })
  })
})

describe('isReportStale', () => {
  type Case = [string, () => ReportMonths]

  // 진짜 generateReport를 가짜 callClaude·saveReport로 돌려 저장 지문을 받는다(지문을 손으로 적지 않는다)
  async function savedHash(months: ReportMonths = fixtureMonths(), month: string = MONTH): Promise<string> {
    const { deps } = setup({ months })
    const res = await generateReport(month, deps)
    if (!res.ok) throw new Error('성공이어야 한다')
    return deps.saveReport.mock.calls[0][0].inputHash
  }

  // 그 달의 동네 환자 수 하나만 바꾼다. 다른 칸과 맞춰야 하는 칸(합계·재방문 등)을 건드리면 검사를 못 넘어 "없는 달"로 빠진다
  function withOneNumberChanged(month: unknown): unknown {
    const m = month as { regions: { name: string; patients: number }[] }
    return { ...m, regions: m.regions.map((r, i) => (i === 0 ? { ...r, patients: r.patients + 1 } : r)) }
  }

  const withPartial = (months: ReportMonths): ReportMonths => ({
    ...months,
    selected: { ...(months.selected as Record<string, unknown>), partial: true },
  })

  it('AC-705.1 generateReport가 저장한 지문과 같은 세 달 자료면 false', async () => {
    const hash = await savedHash()
    const loadMonths = vi.fn<GenerateDeps['loadMonths']>(async () => fixtureMonths())
    expect(await isReportStale(MONTH, hash, loadMonths)).toBe(false)
    expect(loadMonths).toHaveBeenCalledTimes(1)
    expect(loadMonths).toHaveBeenCalledWith(MONTH)
  })

  it.each<Case>([
    ['비교 달이 둘 다 없음', () => ({ ...fixtureMonths(), prev: null, lastYear: null })],
    ['지난달만 없음', () => ({ ...fixtureMonths(), prev: null })],
    ['작년 같은 달만 없음', () => ({ ...fixtureMonths(), lastYear: null })],
    ['집계 중(partial)', () => withPartial(fixtureMonths())],
  ])('AC-705.1 %s인 자료로 저장한 지문도 같은 자료면 false', async (_name, months) => {
    const hash = await savedHash(months())
    expect(await isReportStale(MONTH, hash, async () => months())).toBe(false)
  })

  it('AC-705.1 해가 넘어가는 달을 골라도 같은 자료면 false', async () => {
    const hash = await savedHash(monthsFor('2026-01'), '2026-01')
    expect(await isReportStale('2026-01', hash, async () => monthsFor('2026-01'))).toBe(false)
  })

  it.each([
    ['고른 달', 'selected'],
    ['지난달', 'prev'],
    ['작년 같은 달', 'lastYear'],
  ] as const)('AC-705.2 %s의 숫자 하나가 바뀌면 true', async (_name, which) => {
    const hash = await savedHash()
    const base = fixtureMonths()
    const changed = { ...base, [which]: withOneNumberChanged(base[which]) }
    // 검사를 그대로 넘기고 지표 하나만 달라진다: "없는 달"로 빠져서 지문이 달라진 것이 아니다
    const before = inputOf(base)
    const after = inputOf(changed)
    expect(after.hasPrev).toBe(true)
    expect(after.hasLastYear).toBe(true)
    expect(after.metrics.filter((m, i) => JSON.stringify(m) !== JSON.stringify(before.metrics[i]))).toHaveLength(1)
    expect(await isReportStale(MONTH, hash, async () => changed)).toBe(true)
  })

  it.each<Case>([
    ['고른 달이 없음', () => ({ ...fixtureMonths(), selected: null })],
    ['고른 달이 검사를 못 넘음', () => ({ ...fixtureMonths(), selected: { month: MONTH, totals: 'x' } })],
    ['고른 달이 다른 달 자료임', () => monthsFor('2026-09')],
    ['입력 만들기가 던짐(groupNames가 null)', () => ({ ...fixtureMonths(), groupNames: null as unknown as Record<string, string> })],
    ['읽은 값이 undefined임', () => undefined as unknown as ReportMonths],
  ])('AC-705.3 %s이면 false', async (_name, months) => {
    const hash = await savedHash()
    await expect(isReportStale(MONTH, hash, async () => months())).resolves.toBe(false)
  })

  it('AC-705.3 읽기가 던지면 false(비동기·동기 모두 던지지 않는다)', async () => {
    const hash = await savedHash()
    const rejects = async (): Promise<ReportMonths> => {
      throw new Error('db')
    }
    const throwsNow = (): Promise<ReportMonths> => {
      throw new Error('db')
    }
    await expect(isReportStale(MONTH, hash, rejects)).resolves.toBe(false)
    await expect(isReportStale(MONTH, hash, throwsNow)).resolves.toBe(false)
  })

  it('AC-705.3 지문 만들기가 던지면 false', async () => {
    const hash = await savedHash()
    const digest = vi.spyOn(globalThis.crypto.subtle, 'digest').mockRejectedValue(new Error('crypto'))
    try {
      await expect(isReportStale(MONTH, hash, async () => fixtureMonths())).resolves.toBe(false)
      expect(digest).toHaveBeenCalledTimes(1)
    } finally {
      digest.mockRestore()
    }
  })

  it.each<[string, (base: ReportMonths) => Partial<ReportMonths>, Partial<ReportMonths>]>([
    ['지난달이 다른 달 자료', (base) => ({ prev: base.lastYear }), { prev: null }],
    ['작년 같은 달이 다른 달 자료', (base) => ({ lastYear: base.prev }), { lastYear: null }],
    ['지난달이 검사를 못 넘음', () => ({ prev: { month: '2026-09', broken: true } }), { prev: null }],
    ['작년 같은 달이 검사를 못 넘음', () => ({ lastYear: { month: '2025-10', totals: 'x' } }), { lastYear: null }],
  ])('AC-705.3 %s이면 만들 때처럼 없는 달로 보아 그 달 없이 저장한 지문과 같으니 false', async (_name, now, atSave) => {
    const base = fixtureMonths()
    const hash = await savedHash({ ...base, ...atSave })
    expect(await isReportStale(MONTH, hash, async () => ({ ...base, ...now(base) }))).toBe(false)
  })

  it('AC-705.3 저장 때 있던 지난달이 지금 다른 달 자료면 없는 달로 보아 지문이 달라 true', async () => {
    const base = fixtureMonths()
    const hash = await savedHash(base)
    expect(await isReportStale(MONTH, hash, async () => ({ ...base, prev: base.lastYear }))).toBe(true)
  })
})
