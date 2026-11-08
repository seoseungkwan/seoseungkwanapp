import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { costMicroUsd } from '@/lib/ai/cost'
import { buildReportInput, reportFingerprint } from '@/lib/ai/input'
import { parseAiReport } from '@/lib/ai/output'
import { reportJsonSchema, systemPrompt, userMessage } from '@/lib/ai/prompt'
import { addMonths } from '@/lib/analytics/dates'
import { validateMonthPayload, validateMonthSections } from '@/lib/payload/validate'
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

// 덜 불러온(partial) 비교 달은 견주지 않는다(spec ai-report-stats REQ-2005). 검사는 통과한 달이다
const asPartial = (value: unknown): unknown => ({ ...(value as Record<string, unknown>), partial: true })

describe('비교 달이 덜 불러온 달이면 없는 달 (REQ-2005, REQ-2007)', () => {
  const claudeInput = (deps: ReturnType<typeof setup>['deps']): ReportInput => {
    const { user } = deps.callClaude.mock.calls[0][0]
    return JSON.parse(user.slice('<data>\n'.length, user.length - '\n</data>'.length)) as ReportInput
  }

  it('AC-2005.1 지난달 줄이 검사는 통과했지만 partial: true면 Claude 입력의 hasPrev가 false이고 지난달 값은 모두 null', async () => {
    const base = fixtureMonths()
    const months = { ...base, prev: asPartial(base.prev) }
    expect(validateMonthPayload(months.prev)).not.toBeNull()
    const { deps } = setup({ months })
    const res = await generateReport(MONTH, deps)
    expect(res.ok).toBe(true)
    const input = claudeInput(deps)
    expect(input.hasPrev).toBe(false)
    expect(input.hasLastYear).toBe(true)
    for (const metric of input.metrics) expect(metric.values.prev, metric.id).toBeNull()
    expect(deps.callClaude.mock.calls[0][0].user).toBe(userMessage(inputOf({ ...base, prev: null })))
  })

  it('AC-2005.1 작년 같은 달 줄이 partial: true여도 같다(hasLastYear false, 작년 값 모두 null)', async () => {
    const base = fixtureMonths()
    const months = { ...base, lastYear: asPartial(base.lastYear) }
    expect(validateMonthPayload(months.lastYear)).not.toBeNull()
    const { deps } = setup({ months })
    expect((await generateReport(MONTH, deps)).ok).toBe(true)
    const input = claudeInput(deps)
    expect(input.hasPrev).toBe(true)
    expect(input.hasLastYear).toBe(false)
    for (const metric of input.metrics) expect(metric.values.lastYear, metric.id).toBeNull()
    expect(deps.callClaude.mock.calls[0][0].user).toBe(userMessage(inputOf({ ...base, lastYear: null })))
  })

  it('AC-2005.1 비교 달 둘 다 partial: false면 지금처럼 견준다', async () => {
    const base = fixtureMonths()
    const { deps } = setup({ months: base })
    expect((await generateReport(MONTH, deps)).ok).toBe(true)
    const input = claudeInput(deps)
    expect(input.hasPrev).toBe(true)
    expect(input.hasLastYear).toBe(true)
    expect(input.metrics.find((m) => m.id === 'total.patients')?.values).toEqual({ selected: 2615, prev: 2480, lastYear: 2310 })
  })

  it('AC-2005.2 고른 달이 partial: true면 지금처럼 리포트를 만들고 Claude 입력의 partial이 true(비교 달은 그대로 견준다)', async () => {
    const base = fixtureMonths()
    const { deps } = setup({ months: { ...base, selected: asPartial(base.selected) } })
    const res = await generateReport(MONTH, deps)
    if (!res.ok) throw new Error('성공이어야 한다')
    expect(res.report.partial).toBe(true)
    const input = claudeInput(deps)
    expect(input.partial).toBe(true)
    expect(input.hasPrev).toBe(true)
    expect(input.hasLastYear).toBe(true)
  })

  it('AC-2005.1 숫자 바뀜 비교도 같은 규칙: 저장 때 지난달이 partial: true였다가 지금 false면 지문이 달라 true', async () => {
    const base = fixtureMonths()
    const { deps } = setup({ months: { ...base, prev: asPartial(base.prev) } })
    const res = await generateReport(MONTH, deps)
    if (!res.ok) throw new Error('성공이어야 한다')
    const hash = deps.saveReport.mock.calls[0][0].inputHash
    // 지난달이 여전히 덜 불러온 달이면 같은 지문(false), 다 불러오면 견줄 수 있게 되어 지문이 달라진다(true)
    expect(await isReportStale(MONTH, hash, async () => ({ ...base, prev: asPartial(base.prev) }))).toBe(false)
    expect(await isReportStale(MONTH, hash, async () => base)).toBe(true)
    // 지난달 없이 만든 리포트와 같은 지문이다
    expect(hash).toBe(await reportFingerprint(inputOf({ ...base, prev: null })))
  })

  it('AC-2005.1 숫자 바뀜 비교: 작년 같은 달이 partial: true로 바뀌면 그 달은 없는 달이라 지문이 달라 true', async () => {
    const base = fixtureMonths()
    const { deps } = setup({ months: base })
    const res = await generateReport(MONTH, deps)
    if (!res.ok) throw new Error('성공이어야 한다')
    const hash = deps.saveReport.mock.calls[0][0].inputHash
    expect(await isReportStale(MONTH, hash, async () => ({ ...base, lastYear: asPartial(base.lastYear) }))).toBe(true)
  })

  it('AC-2007.1 고른 달 줄이 없으면 지금처럼 Claude를 부르지 않고 E-AI-NO-DATA(비교 달이 있어도)', async () => {
    const { deps, order } = setup({ months: { ...fixtureMonths(), selected: null } })
    expect(await generateReport(MONTH, deps)).toEqual({ ok: false, code: 'E-AI-NO-DATA' })
    expect(order).toEqual(['loadMonths'])
    expect(deps.callClaude).not.toHaveBeenCalled()
    expect(deps.saveReport).not.toHaveBeenCalled()
    expect(deps.addUsage).not.toHaveBeenCalled()
  })
})

// ── 세 칸(sections) 읽기와 검사 (spec stats-bit-ai REQ-2903·AC-2906.2) ──
// DB에서 읽은 sections는 unknown이다. 시험 자료는 손으로 만든 가짜 숫자이고 원장님 이름도 가짜다
const AGE_NAMES = ['10세 미만', '10대', '20대', '30대', '40대', '50대', '60대', '70대', '80세 이상', '생년월일 없음']

function sectionsRow(month: string, doctor = 60): Record<string, unknown> {
  return {
    v: 1,
    month,
    partial: false,
    mix: {
      people: 100,
      age: AGE_NAMES.map((name) => ({ name, people: name === '40대' ? 55 : 5 })),
      insurance: [
        { name: '건강보험', people: 80 },
        { name: '의료급여 1종', people: 10 },
      ],
      town: [{ name: '매탄1동', people: 12 }],
    },
    hours: { openDays: [4, 4, 4, 4, 4, 0, 0], weekdays: [20, 20, 20, 20, 20, 0, 0], hours: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 0, 0, 0], unknown: 0 },
    doctors: [
      { name: '김가상', patients: doctor, newPatients: 5, amount: 12345000 },
      { name: '이가상', patients: 30, newPatients: 3, amount: 6000000 },
    ],
  }
}

const withSections = (sections: { selected: unknown; prev: unknown; lastYear: unknown }, base: ReportMonths = fixtureMonths()): ReportMonths => ({ ...base, sections })

const ALL_SECTIONS = () => ({ selected: sectionsRow('2026-10'), prev: sectionsRow('2026-09', 50), lastYear: sectionsRow('2025-10', 40) })

// Claude에게 간 입력(<data> 안 JSON)
const sentInput = (deps: ReturnType<typeof setup>['deps']): ReportInput => {
  const { user } = deps.callClaude.mock.calls[0][0]
  return JSON.parse(user.slice('<data>\n'.length, user.length - '\n</data>'.length)) as ReportInput
}

const SECTION_ID = /^(age|insurance|town|weekday|hour|doctor):/
const sectionIds = (input: ReportInput) => input.metrics.map((m) => m.id).filter((id) => SECTION_ID.test(id))
const valueOf = (input: ReportInput, id: string) => input.metrics.find((m) => m.id === id)?.values

describe('세 칸 sections 검사 (REQ-2903)', () => {
  it('AC-2903.2 세 달 sections가 검사를 넘고 그 달과 같은 달이면 Claude 입력이 그 sections로 만든 입력과 같다', async () => {
    const { deps } = setup({ months: withSections(ALL_SECTIONS()) })
    const res = await generateReport(MONTH, deps)
    expect(res.ok).toBe(true)
    const base = fixtureMonths()
    const expected = buildReportInput({
      selected: validateMonthPayload(base.selected)!,
      prev: validateMonthPayload(base.prev),
      lastYear: validateMonthPayload(base.lastYear),
      groupNames: base.groupNames,
      sections: {
        selected: validateMonthSections(sectionsRow('2026-10')),
        prev: validateMonthSections(sectionsRow('2026-09', 50)),
        lastYear: validateMonthSections(sectionsRow('2025-10', 40)),
      },
    })
    expect(deps.callClaude.mock.calls[0][0].user).toBe(userMessage(expected))
    expect(valueOf(sentInput(deps), 'doctor:김가상.patients')).toEqual({ selected: 60, prev: 50, lastYear: 40 })
    if (!res.ok) throw new Error('성공이어야 한다')
    expect(res.report.inputHash).toBe(await reportFingerprint(expected))
  })

  it.each<[string, unknown]>([
    ['모르는 열쇠가 있음', { ...sectionsRow('2026-10'), chart: 'C-0001234' }],
    ['v가 2', { ...sectionsRow('2026-10'), v: 2 }],
    ['다른 달', sectionsRow('2026-09')],
    ['글자', '{"v":1}'],
    ['null', null],
  ])('AC-2903.2·AC-2904.1 고른 달 sections가 %s이면 그 달 sections만 없고 리포트는 만든다 — 입력과 지문이 sections 없을 때와 같다', async (_name, selected) => {
    const { deps } = setup({ months: withSections({ ...ALL_SECTIONS(), selected }) })
    const res = await generateReport(MONTH, deps)
    expect(res.ok).toBe(true)
    const plain = inputOf(fixtureMonths())
    expect(deps.callClaude.mock.calls[0][0].user).toBe(userMessage(plain))
    if (!res.ok) throw new Error('성공이어야 한다')
    expect(res.report.inputHash).toBe(await reportFingerprint(plain))
  })

  it.each<[string, unknown]>([
    ['검사를 못 넘음', { ...sectionsRow('2026-09'), mix: 'x' }],
    ['다른 달(작년 같은 달 것)', sectionsRow('2025-10')],
  ])('AC-2903.2 지난달 sections가 %s이면 지난달 세 칸 값만 null이고 고른 달·작년 값은 그대로다', async (_name, prev) => {
    const { deps } = setup({ months: withSections({ ...ALL_SECTIONS(), prev }) })
    expect((await generateReport(MONTH, deps)).ok).toBe(true)
    const input = sentInput(deps)
    expect(input.hasPrev).toBe(true)
    expect(valueOf(input, 'doctor:김가상.patients')).toEqual({ selected: 60, prev: null, lastYear: 40 })
    expect(valueOf(input, 'age:40대')).toEqual({ selected: 55, prev: null, lastYear: 55 })
  })

  it('AC-2903.2 비교 달 줄이 덜 불러온 달(partial)이면 그 달 sections가 맞아도 쓰지 않는다', async () => {
    const base = fixtureMonths()
    const { deps } = setup({ months: withSections(ALL_SECTIONS(), { ...base, prev: asPartial(base.prev) }) })
    expect((await generateReport(MONTH, deps)).ok).toBe(true)
    const input = sentInput(deps)
    expect(input.hasPrev).toBe(false)
    expect(valueOf(input, 'doctor:김가상.patients')).toEqual({ selected: 60, prev: null, lastYear: 40 })
  })

  it('AC-2903.2 비교 달 줄(payload)이 없거나 검사를 못 넘으면 그 달 sections가 맞아도 쓰지 않는다', async () => {
    const { deps } = setup({ months: withSections(ALL_SECTIONS(), { ...fixtureMonths(), prev: null, lastYear: { month: '2025-10', broken: true } }) })
    expect((await generateReport(MONTH, deps)).ok).toBe(true)
    const input = sentInput(deps)
    expect(valueOf(input, 'doctor:김가상.patients')).toEqual({ selected: 60, prev: null, lastYear: null })
    expect(valueOf(input, 'weekday:1')).toEqual({ selected: 5, prev: null, lastYear: null })
  })

  it('AC-2903.2 loadMonths 답에 sections 칸이 없으면(옛 모양) 세 칸 지표 없이 지금처럼 만든다', async () => {
    const { deps } = setup()
    expect((await generateReport(MONTH, deps)).ok).toBe(true)
    expect(sectionIds(sentInput(deps))).toEqual([])
    expect(deps.callClaude.mock.calls[0][0].user).toBe(userMessage(inputOf(fixtureMonths())))
  })

  it('AC-2903.2·AC-2904.1 숫자 바뀜 비교: 세 칸이 없는 달은 지문이 지금과 같아 false, 고른 달에 세 칸이 생기면 true', async () => {
    const { deps } = setup()
    const res = await generateReport(MONTH, deps)
    if (!res.ok) throw new Error('성공이어야 한다')
    const hash = res.report.inputHash
    const none = withSections({ selected: null, prev: null, lastYear: null })
    expect(await isReportStale(MONTH, hash, async () => none)).toBe(false)
    expect(await isReportStale(MONTH, hash, async () => withSections(ALL_SECTIONS()))).toBe(true)
  })

  it('AC-2903.3 세 칸 숫자는 loadMonths(DB에서 읽은 값)에서만 온다: generateReport는 달과 deps만 받고 loadMonths를 그 달로 한 번 부른다', async () => {
    expect(generateReport.length).toBe(2)
    const { deps } = setup({ months: withSections(ALL_SECTIONS()) })
    await generateReport(MONTH, deps)
    expect(deps.loadMonths).toHaveBeenCalledTimes(1)
    expect(deps.loadMonths).toHaveBeenCalledWith(MONTH)
    expect(valueOf(sentInput(deps), 'doctor:김가상.amount')).toEqual({ selected: 12345000, prev: 12345000, lastYear: 12345000 })
  })
})

describe('Claude 요청 몸에 환자 정보가 없다 (AC-2906.2)', () => {
  it('AC-2906.2 sections가 있는 달로 만든 요청 몸에는 묶음 이름·원장님 이름·수만 있고 차트번호·생년월일·주소 앞부분·접수 줄이 없다', async () => {
    // 지난달 sections에 환자 정보 칸을 섞으면 검사가 그 달 sections를 통째로 버린다
    const leaked = { ...sectionsRow('2026-09'), rows: [['C-0001234', '1980-01-02', '경기도 수원시 영통구', '202609011030']] }
    const { deps } = setup({ months: withSections({ ...ALL_SECTIONS(), prev: leaked }) })
    expect((await generateReport(MONTH, deps)).ok).toBe(true)
    const body = JSON.stringify(deps.callClaude.mock.calls[0][0])
    for (const word of ['C-0001234', '1980-01-02', '수원시', '영통구', '202609011030', '"rows"', 'chart']) expect(body, word).not.toContain(word)
    // 세 칸 지표 이름은 sections의 묶음 이름·원장님 이름·요일·시간뿐이다
    const input = sentInput(deps)
    const names = new Set([...AGE_NAMES, '건강보험', '의료급여 1종', '매탄1동', '김가상', '이가상'])
    for (const id of sectionIds(input)) {
      const name = id.replace(SECTION_ID, '').replace(/\.(patients|newPatients|amount)$/, '')
      if (/^(weekday|hour):/.test(id)) expect(name, id).toMatch(/^\d{1,2}$/)
      else expect(names.has(name), id).toBe(true)
    }
    for (const metric of input.metrics) {
      for (const value of Object.values(metric.values)) expect(value === null || typeof value === 'number', metric.id).toBe(true)
    }
  })
})
