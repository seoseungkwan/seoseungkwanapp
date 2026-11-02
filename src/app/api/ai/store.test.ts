import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SavedReport } from '@/types/aiReport'
import { addUsage, loadReportMonths, saveReport } from './store'

// 실제 Supabase에 붙지 않는다. 가짜 클라이언트는 rpc 하나만 있고, 그 밖의 이름(from·auth·storage …)을 꺼내면
// touched에 남기고 부르면 던진다 — 직접 읽기·쓰기(from('ai_reports').insert 등)를 하면 시험이 실패한다
type RpcResult = { data: unknown; error: unknown }

function fakeClient(rpcImpl: (name: string, args: unknown) => Promise<RpcResult> = async () => ({ data: null, error: null })) {
  const rpc = vi.fn(rpcImpl)
  const touched: string[] = []
  const client = new Proxy(
    {},
    {
      get(_target, key) {
        if (typeof key !== 'string') return undefined
        touched.push(key)
        if (key === 'rpc') return rpc
        return () => {
          throw new Error(`쓰면 안 되는 Supabase 메서드: ${key}`)
        }
      },
    },
  ) as unknown as SupabaseClient
  return { client, rpc, touched }
}

const REPORT: SavedReport = {
  month: '2026-10',
  partial: false,
  summary: '신환이 지난달보다 늘었다.',
  cards: [
    { tag: 'up', text: '신환이 늘었다.', metric: 'total.newPatients', basis: '신환 120명 → 140명 (+20명, +17%)' },
    { tag: 'guess', text: '원인은 추정이다.', metric: 'total.newPatients', basis: '신환 120명 → 140명 (+20명, +17%)' },
  ],
  model: 'claude-opus-5-5',
  inputHash: 'a'.repeat(64),
  createdAt: '2026-11-01T01:00:00.000Z',
}

const USAGE = { inputTokens: 1200, outputTokens: 800, model: 'claude-opus-5-5', costMicroUsd: 20800 }

let consoleSpies: ReturnType<typeof vi.spyOn>[] = []
beforeEach(() => {
  consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}))
})
afterEach(() => {
  for (const s of consoleSpies) s.mockRestore()
})
function expectNoConsole() {
  for (const s of consoleSpies) expect(s).not.toHaveBeenCalled()
}

describe('loadReportMonths (AC-511.6)', () => {
  it('AC-511.6 loadReportMonths는 지금 늘 세 달 모두 없음이고 DB를 읽지 않는다', async () => {
    const { client, rpc, touched } = fakeClient()
    const months = await loadReportMonths(client, '2026-10')
    expect(months).toEqual({ selected: null, prev: null, lastYear: null, groupNames: {} })
    expect(rpc).not.toHaveBeenCalled()
    expect(touched).toEqual([])
  })

  it('AC-511.6 다른 달도 늘 없음이고, 부를 때마다 새 값을 돌려준다(groupNames를 고쳐도 다음 값에 번지지 않는다)', async () => {
    const { client, touched } = fakeClient()
    const a = await loadReportMonths(client, '2026-11')
    a.groupNames['g1'] = '도수치료'
    const b = await loadReportMonths(client, '2020-01')
    expect(b).toEqual({ selected: null, prev: null, lastYear: null, groupNames: {} })
    expect(b).not.toBe(a)
    expect(touched).toEqual([])
  })
})

describe('saveReport · addUsage 저장 쪽 (AC-511.2)', () => {
  it("AC-511.2 saveReport는 rpc('save_ai_report')를 한 번, 달·리포트·지문·모델 인자로 부르고 true", async () => {
    const { client, rpc, touched } = fakeClient()
    await expect(saveReport(client, REPORT)).resolves.toBe(true)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('save_ai_report', {
      p_month: '2026-10',
      p_report: { partial: false, summary: REPORT.summary, cards: REPORT.cards },
      p_input_hash: REPORT.inputHash,
      p_model: 'claude-opus-5-5',
    })
    expect(touched).toEqual(['rpc'])
  })

  it('AC-511.2 p_report에는 partial·summary·cards만 있고 month·model·inputHash·createdAt은 없다', async () => {
    const { client, rpc } = fakeClient()
    await saveReport(client, { ...REPORT, partial: true })
    const args = rpc.mock.calls[0]?.[1] as { p_report: Record<string, unknown> }
    expect(Object.keys(args).sort()).toEqual(['p_input_hash', 'p_model', 'p_month', 'p_report'])
    expect(Object.keys(args.p_report).sort()).toEqual(['cards', 'partial', 'summary'])
    expect(args.p_report).not.toHaveProperty('month')
    expect(args.p_report).not.toHaveProperty('model')
    expect(args.p_report).not.toHaveProperty('inputHash')
    expect(args.p_report).not.toHaveProperty('createdAt')
    expect(args.p_report.partial).toBe(true)
  })

  it("AC-511.2 addUsage는 rpc('add_ai_usage')를 한 번, 토큰·비용 인자로 부르고 true (달·모델은 보내지 않는다)", async () => {
    const { client, rpc, touched } = fakeClient()
    await expect(addUsage(client, USAGE)).resolves.toBe(true)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('add_ai_usage', { p_input: 1200, p_output: 800, p_cost: 20800 })
    const args = rpc.mock.calls[0]?.[1] as Record<string, unknown>
    expect(Object.keys(args).sort()).toEqual(['p_cost', 'p_input', 'p_output'])
    expect(touched).toEqual(['rpc'])
  })

  it('AC-511.2 store.ts는 첫 줄이 server-only이고, 직접 쓰기·service role·console이 없다', () => {
    const source = readFileSync(fileURLToPath(new URL('./store.ts', import.meta.url)), 'utf8')
    expect(source.split(/\r?\n/)[0]).toBe("import 'server-only'")
    expect(source).not.toMatch(/\.from\s*\(|\.insert\s*\(|\.upsert\s*\(|\.update\s*\(|\.delete\s*\(/)
    expect(source).not.toMatch(/service[_-]?role|SERVICE_ROLE|createClient|createServerClient|supabaseServer/)
    expect(source).not.toMatch(/console\./)
    expect(source).not.toMatch(/fixtures|fake-ai/)
  })
})

describe('저장·사용량 기록 실패 (AC-511.5)', () => {
  const DB_ERROR = { code: '42501', message: 'hospital not approved', details: '신환 140', hint: null }

  it('AC-511.5 save_ai_report가 error를 돌려주면 saveReport는 false', async () => {
    const { client } = fakeClient(async () => ({ data: null, error: DB_ERROR }))
    await expect(saveReport(client, REPORT)).resolves.toBe(false)
    expectNoConsole()
  })

  it('AC-511.5 save_ai_report 부름이 던지면(거절·바로 던짐) saveReport는 false', async () => {
    const rejecting = fakeClient(async () => {
      throw new Error('fetch failed 신환 140')
    })
    await expect(saveReport(rejecting.client, REPORT)).resolves.toBe(false)
    const throwing = fakeClient((() => {
      throw new Error('boom')
    }) as never)
    await expect(saveReport(throwing.client, REPORT)).resolves.toBe(false)
    expectNoConsole()
  })

  it('AC-511.5 add_ai_usage가 error를 돌려주면 addUsage는 false', async () => {
    const { client } = fakeClient(async () => ({ data: null, error: { ...DB_ERROR, code: '22023' } }))
    await expect(addUsage(client, USAGE)).resolves.toBe(false)
    expectNoConsole()
  })

  it('AC-511.5 add_ai_usage 부름이 던지면(거절·바로 던짐) addUsage는 false', async () => {
    const rejecting = fakeClient(async () => {
      throw new Error('fetch failed 1200')
    })
    await expect(addUsage(rejecting.client, USAGE)).resolves.toBe(false)
    const throwing = fakeClient((() => {
      throw new Error('boom')
    }) as never)
    await expect(addUsage(throwing.client, USAGE)).resolves.toBe(false)
    expectNoConsole()
  })
})
