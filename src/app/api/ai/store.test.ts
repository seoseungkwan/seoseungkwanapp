import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SavedReport } from '@/types/aiReport'
import { addUsage, loadReportMonths, readSavedReport, readUsage, saveReport } from './store'

// 실제 Supabase에 붙지 않는다. 쓰기 시험의 가짜 클라이언트는 rpc 하나만 있고, 그 밖의 이름(from·auth·storage …)을 꺼내면
// touched에 남기고 부르면 던진다 — 쓰기를 직접(from('ai_reports').insert 등) 하면 시험이 실패한다. 읽기 시험의 가짜는 아래 fakeReadClient다
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

// 읽기 시험의 가짜 클라이언트. from → select → eq → maybeSingle 사슬만 있고, 표 이름·select 글자·eq 인자를 기록한다.
// 그 밖의 이름(rpc·match·filter·insert …)을 꺼내면 touched에 남기고 부르면 던진다 — 병원 조건이나 쓰기가 끼면 시험이 실패한다
function fakeReadClient(answer: () => RpcResult | Promise<RpcResult>) {
  const from: unknown[][] = []
  const select: unknown[][] = []
  const eq: unknown[][] = []
  const touched: string[] = []
  const link = (methods: Record<string, (...args: unknown[]) => unknown>): unknown =>
    new Proxy(
      {},
      {
        get(_target, key) {
          if (typeof key !== 'string') return undefined
          touched.push(key)
          return (
            methods[key] ??
            (() => {
              throw new Error(`쓰면 안 되는 Supabase 메서드: ${key}`)
            })
          )
        },
      },
    )
  const chain: unknown = link({
    select: (...args) => {
      select.push(args)
      return chain
    },
    eq: (...args) => {
      eq.push(args)
      return chain
    },
    maybeSingle: () => answer(),
  })
  const client = link({
    from: (...args) => {
      from.push(args)
      return chain
    },
  }) as SupabaseClient
  return { client, from, select, eq, touched }
}

const rowClient = (data: unknown) => fakeReadClient(async () => ({ data, error: null }))

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
    expect(source).not.toMatch(/\.insert\s*\(|\.upsert\s*\(|\.update\s*\(|\.delete\s*\(/)
    // from은 읽기 둘만 쓴다: 호출이 정확히 2개이고, 표 이름은 글자 그대로 ai_reports·ai_usage다
    const fromCalls = source.match(/\.from\s*\([^)]*\)?/g) ?? []
    expect(fromCalls).toHaveLength(2)
    expect([...fromCalls].sort()).toEqual([".from('ai_reports')", ".from('ai_usage')"])
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

const storeSource = () => readFileSync(fileURLToPath(new URL('./store.ts', import.meta.url)), 'utf8')

// 오류 객체·던진 오류에 든 글자. 답에 새어 나오면 안 된다
const SECRET = '신환 140'
const READ_ERROR = { code: '42501', message: `permission denied ${SECRET}`, details: SECRET, hint: null }
const boom = (): never => {
  throw new Error(`fetch failed ${SECRET}`)
}

// 진짜 Postgres 시각 모양(마이크로초 + 시간대)
const ROW = {
  month: '2026-10',
  report: { partial: false, summary: REPORT.summary, cards: REPORT.cards },
  input_hash: REPORT.inputHash,
  model: REPORT.model,
  created_at: '2026-11-01T12:34:56.123456+00:00',
}

describe('readSavedReport 읽기 (AC-704.1)', () => {
  it('AC-704.1 진짜 Postgres 시각 모양의 줄이 SavedReport로 나온다', async () => {
    const { client } = rowClient(ROW)
    await expect(readSavedReport(client, '2026-10')).resolves.toEqual({ ...REPORT, createdAt: ROW.created_at })
    expectNoConsole()
  })

  it('AC-704.1 줄이 없으면 null', async () => {
    const { client } = rowClient(null)
    await expect(readSavedReport(client, '2026-10')).resolves.toBeNull()
  })

  it('AC-704.1 ai_reports에서 정해 둔 칸을 달 조건 하나로 한 줄 읽는다(eq는 month 한 번뿐, 다른 조건·쓰기 없음)', async () => {
    const { client, from, select, eq, touched } = rowClient(ROW)
    await readSavedReport(client, '2026-10')
    expect(from).toEqual([['ai_reports']])
    expect(select).toEqual([['month, report, input_hash, model, created_at']])
    expect(eq).toEqual([['month', '2026-10']])
    expect(touched).toEqual(['from', 'select', 'eq', 'maybeSingle'])
  })

  it('AC-704.1 hospital_id는 어디에도 없다(부른 인자·소스·답)', async () => {
    const { client, from, select, eq } = rowClient({ ...ROW, hospital_id: 'h-1' })
    const result = await readSavedReport(client, '2026-10')
    expect(JSON.stringify({ from, select, eq })).not.toContain('hospital_id')
    expect(storeSource()).not.toContain('hospital_id')
    expect(result).not.toBe('failed')
    expect(JSON.stringify(result)).not.toContain('h-1')
  })
})

describe('readSavedReport 실패 (AC-704.2)', () => {
  async function expectFailed(client: SupabaseClient) {
    const result = await readSavedReport(client, '2026-10')
    expect(result).toBe('failed')
    expect(JSON.stringify(result)).not.toContain(SECRET)
    expectNoConsole()
  }

  it('AC-704.2 error가 있으면 줄이 없든 있든 정확히 failed이고 오류 글자가 답에 없다', async () => {
    await expectFailed(fakeReadClient(async () => ({ data: null, error: READ_ERROR })).client)
    await expectFailed(fakeReadClient(async () => ({ data: ROW, error: READ_ERROR })).client)
  })

  it('AC-704.2 부름이 던지면(거절·바로 던짐·from에서 던짐) 정확히 failed이고 오류 글자가 답에 없다', async () => {
    await expectFailed(fakeReadClient(async () => boom()).client)
    await expectFailed(fakeReadClient(() => boom()).client)
    await expectFailed(fakeClient().client)
  })

  it.each<[string, unknown]>([
    ['report 칸 없음', { ...ROW, report: undefined }],
    ['report가 배열', { ...ROW, report: [] }],
    ['카드 태그가 틀림', { ...ROW, report: { ...ROW.report, cards: [{ ...REPORT.cards[0], tag: 'nope' }] } }],
    ['지문이 글자가 아님', { ...ROW, input_hash: 1 }],
    ['읽히지 않는 시각', { ...ROW, created_at: '어제' }],
    ['달 모양이 틀림', { ...ROW, month: '2026-13' }],
    ['줄이 배열', [ROW]],
    ['줄이 글자', SECRET],
    ['줄이 0', 0],
    ['data가 undefined', undefined],
  ])('AC-704.2 검사를 못 넘는 줄(%s)은 정확히 failed', async (_name, row) => {
    await expectFailed(rowClient(row).client)
  })

  it('AC-704.2 모양이 맞아도 요청한 달과 다른 달 줄이면 정확히 failed', async () => {
    await expectFailed(rowClient({ ...ROW, month: '2026-09' }).client)
  })
})

describe('readUsage (AC-704.3)', () => {
  const USAGE_ROW = { calls: 3, input_tokens: 1200, output_tokens: 800, cost_micro_usd: 20800 }

  async function expectFailed(client: SupabaseClient) {
    const result = await readUsage(client, '2026-11')
    expect(result).toBe('failed')
    expect(JSON.stringify(result)).not.toContain(SECRET)
    expectNoConsole()
  }

  it('AC-704.3 횟수·비용은 그대로, 토큰은 입력+출력 합이다', async () => {
    const { client } = rowClient(USAGE_ROW)
    await expect(readUsage(client, '2026-11')).resolves.toEqual({ calls: 3, tokens: 2000, costMicroUsd: 20800 })
    expectNoConsole()
  })

  it('AC-704.3 줄이 없으면 모두 0', async () => {
    const { client } = rowClient(null)
    await expect(readUsage(client, '2026-11')).resolves.toEqual({ calls: 0, tokens: 0, costMicroUsd: 0 })
  })

  it('AC-704.3 칸이 모두 0인 줄은 실패가 아니라 0이다', async () => {
    const { client } = rowClient({ calls: 0, input_tokens: 0, output_tokens: 0, cost_micro_usd: 0 })
    await expect(readUsage(client, '2026-11')).resolves.toEqual({ calls: 0, tokens: 0, costMicroUsd: 0 })
  })

  it('AC-704.3 ai_usage에서 정해 둔 칸을 thisMonth 조건 하나로 한 줄 읽고 hospital_id는 없다', async () => {
    for (const thisMonth of ['2026-11', '2020-01']) {
      const { client, from, select, eq, touched } = rowClient(USAGE_ROW)
      await readUsage(client, thisMonth)
      expect(from).toEqual([['ai_usage']])
      expect(select).toEqual([['calls, input_tokens, output_tokens, cost_micro_usd']])
      expect(eq).toEqual([['month', thisMonth]])
      expect(touched).toEqual(['from', 'select', 'eq', 'maybeSingle'])
      expect(JSON.stringify({ from, select, eq })).not.toContain('hospital_id')
    }
  })

  it('AC-704.3 이번 달은 인자로만 받는다(store.ts에서 오늘 날짜를 구하지 않는다)', () => {
    expect(storeSource()).not.toMatch(/\bDate\b|analytics\/dates/)
  })

  it('AC-704.3 error가 있으면 줄이 없든 있든 정확히 failed이고 오류 글자가 답에 없다', async () => {
    await expectFailed(fakeReadClient(async () => ({ data: null, error: READ_ERROR })).client)
    await expectFailed(fakeReadClient(async () => ({ data: USAGE_ROW, error: READ_ERROR })).client)
  })

  it('AC-704.3 부름이 던지면(거절·바로 던짐·from에서 던짐) 정확히 failed이고 오류 글자가 답에 없다', async () => {
    await expectFailed(fakeReadClient(async () => boom()).client)
    await expectFailed(fakeReadClient(() => boom()).client)
    await expectFailed(fakeClient().client)
  })

  describe.each(['calls', 'input_tokens', 'output_tokens', 'cost_micro_usd'])('칸 %s', (column) => {
    it.each<[string, unknown]>([
      ['문자', '100'],
      ['음수', -1],
      ['null', null],
      ['NaN', NaN],
      ['무한대', Infinity],
      ['칸 없음', undefined],
    ])('AC-704.3 값이 %s이면 정확히 failed', async (_name, value) => {
      await expectFailed(rowClient({ ...USAGE_ROW, [column]: value }).client)
    })
  })

  it.each<[string, unknown]>([
    ['줄이 배열', [USAGE_ROW]],
    ['줄이 글자', SECRET],
    ['줄이 0', 0],
    ['data가 undefined', undefined],
  ])('AC-704.3 줄 모양이 틀리면(%s) 정확히 failed', async (_name, row) => {
    await expectFailed(rowClient(row).client)
  })
})
