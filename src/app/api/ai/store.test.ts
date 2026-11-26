import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GROUP_KEY, groupKey } from '@/components/stats/treatmentView'
import { toUisDayPayload } from '@/lib/payload/uisarang'
import { validateMonthPayload } from '@/lib/payload/validate'
import type { ReportInput, SavedReport } from '@/types/aiReport'
import { generateReport, isReportStale, type GenerateDeps } from './generate'
import { addUsage, loadHonorific, loadReportMonths, readSavedReport, readUsage, saveReport, takeAiImage } from './store'

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

// loadReportMonths(통계 세 달·묶음 이름 읽기) 시험은 이 파일 끝 'loadReportMonths' 묶음에 있다(spec ai-report-stats REQ-2001·2002)

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

  it('AC-511.2·AC-6606.4 store.ts는 첫 줄이 server-only이고, 직접 쓰기·service role·console이 없다', () => {
    const source = readFileSync(fileURLToPath(new URL('./store.ts', import.meta.url)), 'utf8')
    expect(source.split(/\r?\n/)[0]).toBe("import 'server-only'")
    expect(source).not.toMatch(/\.insert\s*\(|\.upsert\s*\(|\.update\s*\(|\.delete\s*\(/)
    // from은 읽기만 쓴다: 호출이 정확히 9개이고, 표 이름은 글자 그대로 ai_reports·ai_usage·clinic_profiles(호칭 한 칸, clinic-profile AC-6606.4)·stats_months·stats_rx_groups와
    // 의사랑 AI 리포트 읽기 넷 sales_days·stats_coverage·stats_days·uis_periods다(specs/uisarang-upload AC-8816.1 — 쓰기는 여전히 없다)
    const fromCalls = source.match(/\.from\s*\([^)]*\)?/g) ?? []
    expect(fromCalls).toHaveLength(9)
    expect([...fromCalls].sort()).toEqual([
      ".from('ai_reports')",
      ".from('ai_usage')",
      ".from('clinic_profiles')",
      ".from('sales_days')",
      ".from('stats_coverage')",
      ".from('stats_days')",
      ".from('stats_months')",
      ".from('stats_rx_groups')",
      ".from('uis_periods')",
    ])
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
    expect(storeSource()).not.toMatch(/\bDate\b|todayInKorea|monthOf/)
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

// ---------- loadReportMonths: 통계 세 달 + 처방별 추세 묶음 이름 (spec ai-report-stats REQ-2001·2002·2007) ----------

type Answer = () => RpcResult | Promise<RpcResult>

// 통계 읽기 시험의 가짜 클라이언트. from('stats_months') → select → in, from('stats_rx_groups') → select 사슬만 있고
// 사슬 끝은 then으로 답한다(묶음 읽기는 select 결과를 바로 기다린다). 표 이름·select 글자·in 인자를 남긴다.
// 그 밖의 이름(eq·match·filter·rpc·insert …)·다른 표를 꺼내면 touched에 남기고 부르면 던진다 — 병원 조건·쓰기가 끼면 시험이 실패한다
function fakeStatsClient(answers: { months?: Answer; groups?: Answer } = {}) {
  const monthsAnswer = answers.months ?? (async () => ({ data: [], error: null }))
  const groupsAnswer = answers.groups ?? (async () => ({ data: [], error: null }))
  const from: unknown[][] = []
  const select: unknown[][] = []
  const inArgs: unknown[][] = []
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
  const answerWith = (answer: Answer) =>
    link({
      then: (resolve, reject) => {
        let result: Promise<RpcResult>
        try {
          result = Promise.resolve(answer())
        } catch (error) {
          result = Promise.reject(error)
        }
        return result.then(resolve as (v: RpcResult) => unknown, reject as (e: unknown) => unknown)
      },
    })
  const monthsTable = link({
    select: (...args) => {
      select.push(['stats_months', ...args])
      return link({
        in: (...args2) => {
          inArgs.push(args2)
          return answerWith(monthsAnswer)
        },
      })
    },
  })
  const groupsTable = link({
    select: (...args) => {
      select.push(['stats_rx_groups', ...args])
      return answerWith(groupsAnswer)
    },
  })
  const client = link({
    from: (...args) => {
      from.push(args)
      if (args[0] === 'stats_months') return monthsTable
      if (args[0] === 'stats_rx_groups') return groupsTable
      throw new Error(`읽으면 안 되는 표: ${String(args[0])}`)
    },
  }) as SupabaseClient
  return { client, from, select, in: inArgs, touched }
}

const answer = (data: unknown): Answer => async () => ({ data, error: null })

// 세 칸이 없는 세 달(spec stats-bit-ai AC-2906.3 ②: 답 전체를 견주는 시험에 더하는 값)
const NO_SECTIONS = { selected: null, prev: null, lastYear: null }

// 시험 안에서 만든 가짜 달 줄(fixtures를 읽지 않는다). 처방코드는 FAKE-…, 묶음 열쇠는 groupKey(코드)
const MANUAL_CODES = ['FAKE-G1', 'FAKE-G2']
const PT_CODES = ['FAKE-G3']
const MANUAL_KEY = groupKey(MANUAL_CODES)
const PT_KEY = groupKey(PT_CODES)

function monthRow(month: string, patients: number, partial = false) {
  return {
    month,
    payload: {
      schemaVersion: 2,
      quality: 'valid',
      month,
      partial,
      totals: { patients, newPatients: 10, returning: patients - 12, unknown: 2 },
      rx: [{ code: 'FAKE-R1', name: '가짜 처방', type: '가짜', patients: 5, newPatients: 1, returning: 4, followup: [5, 0, 0, 0] }],
      groups: [
        { id: MANUAL_KEY, patients: 8, newPatients: 2, returning: 6, followup: [8, 0, 0, 0] },
        { id: PT_KEY, patients: 6, newPatients: 1, returning: 5, followup: [6, 0, 0, 0] },
      ],
      revisit: { cohort: 0, within7: 0, within14: 0 },
      regions: [],
    },
  }
}

const GROUP_ROWS = [
  { name: '도수치료', codes: ['fake-g2', 'FAKE-G1'], sort_order: 0 },
  { name: '물리치료', codes: PT_CODES, sort_order: 1 },
]

const expectThrowsWithoutSecret = async (run: Promise<unknown>) => {
  const error = await run.then(
    () => null,
    (e: unknown) => e,
  )
  expect(error, '던져야 한다').toBeInstanceOf(Error)
  expect(String(error)).not.toContain(SECRET)
  expect(JSON.stringify(error)).not.toContain(SECRET)
  expectNoConsole()
}

describe('loadReportMonths — 통계 세 달 (REQ-2001)', () => {
  it('AC-2001.1 stats_months에서 고른 달·지난달·작년 같은 달을 읽기 한 번(select month, payload, sections + in)으로 읽고 payload를 그대로 세 칸에 넣는다', async () => {
    const sel = monthRow('2026-10', 120)
    const prev = monthRow('2026-09', 110)
    const lastYear = monthRow('2025-10', 100)
    const fake = fakeStatsClient({ months: answer([prev, lastYear, sel]), groups: answer(GROUP_ROWS) })
    const months = await loadReportMonths(fake.client, '2026-10')
    expect(months.selected).toBe(sel.payload)
    expect(months.prev).toBe(prev.payload)
    expect(months.lastYear).toBe(lastYear.payload)
    expect(fake.select.filter((s) => s[0] === 'stats_months')).toEqual([['stats_months', 'month, payload, sections']])
    expect(fake.in).toEqual([['month', ['2026-10', '2026-09', '2025-10']]])
    expectNoConsole()
  })

  it('AC-2001.1 줄이 없는 달은 null이다(고른 달만 있음·아무 줄 없음)', async () => {
    const sel = monthRow('2026-10', 120)
    const only = await loadReportMonths(fakeStatsClient({ months: answer([sel]) }).client, '2026-10')
    expect(only).toEqual({ selected: sel.payload, prev: null, lastYear: null, groupNames: {}, sections: NO_SECTIONS })
    const none = await loadReportMonths(fakeStatsClient({ months: answer([]) }).client, '2026-10')
    expect(none).toEqual({ selected: null, prev: null, lastYear: null, groupNames: {}, sections: NO_SECTIONS })
  })

  it('AC-2001.1 해가 바뀌는 달: 2026-01이면 지난달 2025-12·작년 같은 달 2025-01을 읽는다', async () => {
    const sel = monthRow('2026-01', 50)
    const prev = monthRow('2025-12', 40)
    const lastYear = monthRow('2025-01', 30)
    const fake = fakeStatsClient({ months: answer([sel, prev, lastYear]) })
    const months = await loadReportMonths(fake.client, '2026-01')
    expect(fake.in).toEqual([['month', ['2026-01', '2025-12', '2025-01']]])
    expect(months.prev).toBe(prev.payload)
    expect(months.lastYear).toBe(lastYear.payload)
  })

  it('AC-2001.2 병원 조건·쓰기·rpc·다른 표가 없다: from은 stats_months·stats_rx_groups 한 번씩, 꺼낸 이름은 from·select·in·then뿐', async () => {
    const fake = fakeStatsClient({ months: answer([monthRow('2026-10', 120)]), groups: answer(GROUP_ROWS) })
    await loadReportMonths(fake.client, '2026-10')
    expect([...fake.from].sort()).toEqual([['stats_months'], ['stats_rx_groups']])
    expect([...new Set(fake.touched)].sort()).toEqual(['from', 'in', 'select', 'then'])
    expect(JSON.stringify({ from: fake.from, select: fake.select, in: fake.in })).not.toMatch(/hospital/)
    expect(storeSource()).not.toContain('hospital_id')
  })

  it('AC-2001.3 받은 줄의 month가 세 달 밖이거나 글자가 아니면 버린다(다른 달 칸에 넣지 않는다)', async () => {
    const sel = monthRow('2026-10', 120)
    const outside = monthRow('2026-08', 90)
    const numberMonth = { month: 202609, payload: monthRow('2026-09', 80).payload }
    const noMonth = { payload: monthRow('2025-10', 70).payload }
    const months = await loadReportMonths(fakeStatsClient({ months: answer([outside, numberMonth, noMonth, null, sel]) }).client, '2026-10')
    expect(months).toEqual({ selected: sel.payload, prev: null, lastYear: null, groupNames: {}, sections: NO_SECTIONS })
  })

  it('AC-2001.3 같은 달 줄이 둘이면 앞 줄을 쓴다', async () => {
    const first = monthRow('2026-10', 120)
    const second = monthRow('2026-10', 130)
    const months = await loadReportMonths(fakeStatsClient({ months: answer([first, second]) }).client, '2026-10')
    expect(months.selected).toBe(first.payload)
  })

  it.each<[string, Answer]>([
    ['error가 있음', async () => ({ data: null, error: READ_ERROR })],
    ['error와 줄이 같이 옴', async () => ({ data: [monthRow('2026-10', 120)], error: READ_ERROR })],
    ['거절', async () => boom()],
    ['바로 던짐', () => boom()],
    ['답이 배열이 아님', answer({ month: '2026-10', payload: SECRET })],
    ['답이 null', answer(null)],
  ])('AC-2001.4 stats_months 읽기가 %s이면 던지고 오류 글에 받은 오류 내용이 없다', async (_name, months) => {
    await expectThrowsWithoutSecret(loadReportMonths(fakeStatsClient({ months, groups: answer(GROUP_ROWS) }).client, '2026-10'))
  })

  it('AC-2001.4 from에서 던져도 던진다', async () => {
    await expectThrowsWithoutSecret(loadReportMonths(fakeClient().client, '2026-10'))
  })

  it("AC-2001.4 읽기가 실패하면 리포트 만들기는 E-AI-FAILED('자료 없음'이 아님)이고 숫자 바뀜 비교는 false", async () => {
    const failing = () => fakeStatsClient({ months: async () => ({ data: null, error: READ_ERROR }) }).client
    const callClaude = vi.fn<GenerateDeps['callClaude']>()
    const deps: GenerateDeps = {
      loadMonths: (m) => loadReportMonths(failing(), m),
      callClaude,
      saveReport: async () => true,
      addUsage: async () => true,
      now: () => new Date('2026-11-02T01:02:03.000Z'),
    }
    await expect(generateReport('2026-10', deps)).resolves.toEqual({ ok: false, code: 'E-AI-FAILED' })
    expect(callClaude).not.toHaveBeenCalled()
    await expect(isReportStale('2026-10', 'a'.repeat(64), (m) => loadReportMonths(failing(), m))).resolves.toBe(false)
  })

  it('AC-2001.5 같은 달로 두 번 부르면 부를 때마다 새 값이다(첫 값의 groupNames를 고쳐도 둘째 값에 번지지 않는다)', async () => {
    const fake = fakeStatsClient({ months: answer([monthRow('2026-10', 120)]), groups: answer(GROUP_ROWS) })
    const a = await loadReportMonths(fake.client, '2026-10')
    a.groupNames['t0000000000000000'] = '바꾼 이름'
    a.groupNames[MANUAL_KEY] = '고친 이름'
    const b = await loadReportMonths(fake.client, '2026-10')
    expect(b).not.toBe(a)
    expect(b.groupNames).not.toBe(a.groupNames)
    expect(b.groupNames).toEqual({ [MANUAL_KEY]: '도수치료', [PT_KEY]: '물리치료' })
  })
})

describe('loadReportMonths — 묶음 이름 (REQ-2002)', () => {
  const namesOf = async (rows: unknown) => (await loadReportMonths(fakeStatsClient({ groups: answer(rows) }).client, '2026-10')).groupNames

  // ai-report-stats AC-2002.1의 select 글자('name, codes, sort_order')를 group-exclude AC-3702.4가 대신한다
  it("AC-2002.1 · AC-3702.4 stats_rx_groups를 select('name, codes, out_codes, cond, sort_order')로 읽어 처방이 든 묶음마다 groupKey(codes) → 이름", async () => {
    const fake = fakeStatsClient({ groups: answer(GROUP_ROWS) })
    const { groupNames } = await loadReportMonths(fake.client, '2026-10')
    expect(fake.select.filter((s) => s[0] === 'stats_rx_groups')).toEqual([['stats_rx_groups', 'name, codes, out_codes, cond, sort_order']])
    expect(groupNames).toEqual({ [MANUAL_KEY]: '도수치료', [PT_KEY]: '물리치료' })
    for (const key of Object.keys(groupNames)) expect(key).toMatch(GROUP_KEY)
  })

  it('AC-2002.1 열쇠는 통계 탭과 같은 groupKey다: 코드 대소문자·차례가 달라도 같은 열쇠', async () => {
    const names = await namesOf([{ name: '도수치료', codes: ['fake-g2', 'FAKE-G1', 'fake-G1'], sort_order: 0 }])
    expect(Object.keys(names)).toEqual([groupKey(['FAKE-G1', 'FAKE-G2'])])
    expect(Object.keys(names)).toEqual([MANUAL_KEY])
  })

  it('AC-2002.1 처방이 빈 묶음은 빠진다', async () => {
    const names = await namesOf([{ name: '빈 묶음', codes: [], sort_order: 0 }, ...GROUP_ROWS])
    expect(names).toEqual({ [MANUAL_KEY]: '도수치료', [PT_KEY]: '물리치료' })
    expect(Object.values(names)).not.toContain('빈 묶음')
  })

  it('AC-2002.2 처방 모음이 같아 열쇠가 같은 묶음이 둘이면 sort_order가 작은 묶음의 이름(줄 차례와 상관없이)', async () => {
    const names = await namesOf([
      { name: '나중 이름', codes: ['FAKE-G3'], sort_order: 4 },
      { name: '먼저 이름', codes: ['fake-g3'], sort_order: 1 },
    ])
    expect(names).toEqual({ [PT_KEY]: '먼저 이름' })
  })

  it('AC-2002.2 sort_order도 같으면 이름의 글자 코드 차례로 앞선 것(대문자가 소문자보다 앞, localeCompare가 아님)', async () => {
    const names = await namesOf([
      { name: 'b-묶음', codes: ['FAKE-G3'], sort_order: 2 },
      { name: 'B-묶음', codes: ['FAKE-G3'], sort_order: 2 },
    ])
    expect(names).toEqual({ [PT_KEY]: 'B-묶음' })
  })

  it.each<[string, Answer]>([
    ['error가 있음', async () => ({ data: null, error: READ_ERROR })],
    ['error와 줄이 같이 옴', async () => ({ data: GROUP_ROWS, error: READ_ERROR })],
    ['거절', async () => boom()],
    ['바로 던짐', () => boom()],
    ['답이 배열이 아님', answer({ name: SECRET, codes: [], sort_order: 0 })],
    ['답이 null', answer(null)],
    ['name이 글자가 아님', answer([{ name: 7, codes: ['FAKE-G1'], sort_order: 0 }])],
    ['name이 없음', answer([{ codes: ['FAKE-G1'], sort_order: 0 }])],
    ['codes가 배열이 아님', answer([{ name: '도수치료', codes: 'FAKE-G1', sort_order: 0 }])],
    ['codes에 글자가 아닌 값', answer([{ name: '도수치료', codes: ['FAKE-G1', 3], sort_order: 0 }])],
    ['codes가 null', answer([{ name: '도수치료', codes: null, sort_order: 0 }])],
    ['sort_order가 정수가 아님', answer([{ name: '도수치료', codes: ['FAKE-G1'], sort_order: 1.5 }])],
    ['sort_order가 글자', answer([{ name: '도수치료', codes: ['FAKE-G1'], sort_order: '0' }])],
    ['줄이 null', answer([null])],
  ])('AC-2002.3 stats_rx_groups 읽기가 %s이면 던지고(이름 없이 만들지 않는다) 오류 글에 받은 오류 내용이 없다', async (_name, groups) => {
    await expectThrowsWithoutSecret(loadReportMonths(fakeStatsClient({ months: answer([monthRow('2026-10', 120)]), groups }).client, '2026-10'))
  })

  it('AC-2002.4 돌려주는 값에는 열쇠와 이름만 있고 처방 코드 목록은 없다', async () => {
    const months = await loadReportMonths(fakeStatsClient({ months: answer([monthRow('2026-10', 120)]), groups: answer(GROUP_ROWS) }).client, '2026-10')
    expect(Object.keys(months)).toEqual(['selected', 'prev', 'lastYear', 'groupNames', 'sections'])
    const text = JSON.stringify(months.groupNames)
    expect(text).not.toContain('codes')
    for (const code of ['FAKE-G1', 'FAKE-G2', 'FAKE-G3', 'fake-g2']) expect(text).not.toContain(code)
    expect(JSON.stringify(months)).not.toContain('"codes"')
  })

  it('AC-2002.5 연락처·식별 번호 모양 이름(010-1234-5678·메일 주소)의 묶음은 빠지고 다른 묶음은 그대로다', async () => {
    const names = await namesOf([
      { name: '010-1234-5678', codes: ['FAKE-P1'], sort_order: 0 },
      { name: 'doctor@example.com', codes: ['FAKE-P2'], sort_order: 1 },
      ...GROUP_ROWS,
    ])
    expect(names).toEqual({ [MANUAL_KEY]: '도수치료', [PT_KEY]: '물리치료' })
    expect(JSON.stringify(names)).not.toMatch(/010-1234-5678|@/)
  })

  it('AC-2002.5 같은 열쇠의 앞 묶음 이름이 검사를 못 넘으면 그 묶음만 빠지고 다음 묶음 이름을 쓴다', async () => {
    const names = await namesOf([
      { name: '010-1234-5678', codes: ['FAKE-G3'], sort_order: 0 },
      { name: '물리치료', codes: ['FAKE-G3'], sort_order: 1 },
    ])
    expect(names).toEqual({ [PT_KEY]: '물리치료' })
  })
})

// ---------- 빼는 처방(out_codes)·조건(cond) 든 묶음의 이름 (spec group-exclude REQ-3702 · AC-3702.4) ----------
describe('loadReportMonths — 빼는 처방·조건 든 묶음 이름 (AC-3702.4)', () => {
  const namesOf = async (rows: unknown) => (await loadReportMonths(fakeStatsClient({ groups: answer(rows) }).client, '2026-10')).groupNames

  // 지어낸 기본 PT 묶음: 넣는 처방 둘, 빼는 처방 하나, 넣는 처방 하나에 조건 하나
  const BASIC_CODES = ['FAKE-P1', 'FAKE-P2']
  const BASIC_OUT = ['FAKE-X1']
  const BASIC_COND = [{ code: 'FAKE-P1', unless: ['FAKE-Y1'] }]
  const BASIC_KEY = groupKey(BASIC_CODES, { out: BASIC_OUT, cond: BASIC_COND })

  it('AC-3702.4 빼는 처방·조건 든 줄의 이름은 groupKey(codes, { out: out_codes, cond })에 붙는다(넣는 처방만의 열쇠가 아님)', async () => {
    const names = await namesOf([{ name: '기본 PT', codes: BASIC_CODES, out_codes: BASIC_OUT, cond: BASIC_COND, sort_order: 0 }])
    expect(BASIC_KEY).not.toBe(groupKey(BASIC_CODES))
    expect(names).toEqual({ [BASIC_KEY]: '기본 PT' })
    expect(BASIC_KEY).toMatch(GROUP_KEY)
  })

  it('AC-3702.4 빼는 처방만·조건만 든 줄도 각자 groupKey(codes, { out, cond }) 열쇠에 이름이 붙는다', async () => {
    const names = await namesOf([
      { name: '빼는 처방만', codes: ['FAKE-Q1'], out_codes: ['FAKE-X2'], cond: [], sort_order: 0 },
      { name: '조건만', codes: ['FAKE-Q2', 'FAKE-Q3'], out_codes: [], cond: [{ code: 'fake-q3', unless: ['FAKE-Y2', 'FAKE-Y3'] }], sort_order: 1 },
    ])
    expect(names).toEqual({
      [groupKey(['FAKE-Q1'], { out: ['FAKE-X2'], cond: [] })]: '빼는 처방만',
      [groupKey(['FAKE-Q2', 'FAKE-Q3'], { out: [], cond: [{ code: 'fake-q3', unless: ['FAKE-Y2', 'FAKE-Y3'] }] })]: '조건만',
    })
    expect(Object.keys(names)).not.toContain(groupKey(['FAKE-Q1']))
    expect(Object.keys(names)).not.toContain(groupKey(['FAKE-Q2', 'FAKE-Q3']))
  })

  it('AC-3702.4 out_codes·cond가 null이거나 빈 배열인 줄은 빈 것으로 보아 지금 열쇠 groupKey(codes) 그대로다', async () => {
    const names = await namesOf([
      { name: '도수치료', codes: ['fake-g2', 'FAKE-G1'], out_codes: null, cond: null, sort_order: 0 },
      { name: '물리치료', codes: PT_CODES, out_codes: [], cond: [], sort_order: 1 },
    ])
    expect(names).toEqual({ [MANUAL_KEY]: '도수치료', [PT_KEY]: '물리치료' })
  })

  it('AC-3702.4 넣는 처방이 같아도 빼는 처방이 다르면 열쇠가 달라 두 이름이 따로 붙는다', async () => {
    const names = await namesOf([
      { name: '물리치료', codes: PT_CODES, out_codes: null, cond: null, sort_order: 0 },
      { name: '물리치료(도수 뺌)', codes: PT_CODES, out_codes: ['FAKE-G1'], cond: null, sort_order: 1 },
    ])
    expect(names).toEqual({ [PT_KEY]: '물리치료', [groupKey(PT_CODES, { out: ['FAKE-G1'] })]: '물리치료(도수 뺌)' })
  })

  it.each<[string, Record<string, unknown>]>([
    ['out_codes가 배열이 아님', { out_codes: SECRET }],
    ['out_codes에 글자가 아닌 값', { out_codes: ['FAKE-X1', 3] }],
    ['out_codes에 null', { out_codes: [null] }],
    ['cond가 배열이 아님', { cond: { code: 'FAKE-P1', unless: [SECRET] } }],
    ['cond가 글자', { cond: SECRET }],
    ['cond 항목이 null', { cond: [null] }],
    ['cond 항목이 글자', { cond: ['FAKE-P1'] }],
    ['cond 항목 code가 글자가 아님', { cond: [{ code: 7, unless: ['FAKE-Y1'] }] }],
    ['cond 항목 code가 없음', { cond: [{ unless: ['FAKE-Y1'] }] }],
    ['cond 항목 unless가 배열이 아님', { cond: [{ code: 'FAKE-P1', unless: SECRET }] }],
    ['cond 항목 unless에 글자가 아닌 값', { cond: [{ code: 'FAKE-P1', unless: ['FAKE-Y1', 3] }] }],
    ['cond 항목 unless가 없음', { cond: [{ code: 'FAKE-P1' }] }],
    ['cond 항목 unless가 null', { cond: [{ code: 'FAKE-P1', unless: null }] }],
  ])('AC-3702.4 stats_rx_groups 줄의 %s이면 지금처럼 모양 오류로 던지고(이름 없이 만들지 않는다) 오류 글에 받은 내용이 없다', async (_name, parts) => {
    const row = { name: '기본 PT', codes: BASIC_CODES, out_codes: BASIC_OUT, cond: BASIC_COND, sort_order: 0, ...parts }
    await expectThrowsWithoutSecret(
      loadReportMonths(fakeStatsClient({ months: answer([monthRow('2026-10', 120)]), groups: answer([row, ...GROUP_ROWS]) }).client, '2026-10'),
    )
  })

  it('AC-3702.4 돌려주는 값에는 열쇠와 이름만 있고 넣는·빼는·조건 처방 코드는 없다', async () => {
    const rows = [{ name: '기본 PT', codes: BASIC_CODES, out_codes: BASIC_OUT, cond: BASIC_COND, sort_order: 0 }, ...GROUP_ROWS]
    const months = await loadReportMonths(fakeStatsClient({ months: answer([monthRow('2026-10', 120)]), groups: answer(rows) }).client, '2026-10')
    expect(months.groupNames).toEqual({ [BASIC_KEY]: '기본 PT', [MANUAL_KEY]: '도수치료', [PT_KEY]: '물리치료' })
    const text = JSON.stringify(months.groupNames)
    for (const word of ['codes', 'out_codes', 'cond', 'unless', 'FAKE-P1', 'FAKE-P2', 'FAKE-X1', 'FAKE-Y1']) expect(text).not.toContain(word)
    for (const word of ['"out_codes"', '"cond"', '"unless"', 'FAKE-X1', 'FAKE-Y1']) expect(JSON.stringify(months)).not.toContain(word)
  })
})

describe('generateReport에 loadReportMonths를 이어 부름 (REQ-2007)', () => {
  const goodText = JSON.stringify({
    summary: '접수 건수와 신환이 함께 늘었습니다.',
    cards: [
      { tag: 'up', text: '접수 건수가 지난달보다 늘었습니다.', metric: 'total.patients' },
      { tag: 'up', text: '신환이 늘었습니다.', metric: 'total.newPatients' },
      { tag: 'watch', text: '도수치료 묶음은 지켜볼 만합니다.', metric: `group:${MANUAL_KEY}.patients` },
    ],
  })

  it('AC-2007.2 Claude 입력의 지표가 저장된 숫자에서 나오고(total.patients = 줄의 totals.patients), 입력 JSON에 codes가 없다', async () => {
    const sel = monthRow('2026-10', 120)
    const prev = monthRow('2026-09', 110)
    const lastYear = monthRow('2025-10', 100)
    for (const row of [sel, prev, lastYear]) expect(validateMonthPayload(row.payload), row.month).not.toBeNull()
    const fake = fakeStatsClient({ months: answer([sel, prev, lastYear]), groups: answer(GROUP_ROWS) })
    const callClaude = vi.fn<GenerateDeps['callClaude']>(async () => ({
      ok: true as const,
      text: goodText,
      usage: { inputTokens: 1000, outputTokens: 500, model: 'claude-opus-5-5' },
    }))
    const deps: GenerateDeps = {
      loadMonths: (m) => loadReportMonths(fake.client, m),
      callClaude,
      saveReport: async () => true,
      addUsage: async () => true,
      now: () => new Date('2026-11-02T01:02:03.000Z'),
    }
    const res = await generateReport('2026-10', deps)
    expect(res.ok).toBe(true)
    expect(callClaude).toHaveBeenCalledTimes(1)
    const { user } = callClaude.mock.calls[0][0]
    const input = JSON.parse((user as string).slice('<data>\n'.length, (user as string).length - '\n</data>'.length)) as ReportInput
    const total = input.metrics.find((m) => m.id === 'total.patients')
    expect(total?.values).toEqual({
      selected: sel.payload.totals.patients,
      prev: prev.payload.totals.patients,
      lastYear: lastYear.payload.totals.patients,
    })
    expect(total?.label).toBe('접수 건수')
    expect(input.metrics.find((m) => m.id === `group:${MANUAL_KEY}.patients`)?.label).toBe("처방 그룹 '도수치료' 환자")
    expect(user).not.toContain('"codes"')
    for (const code of ['FAKE-G1', 'FAKE-G2', 'FAKE-G3', 'fake-g2']) expect(user).not.toContain(code)
  })
})

// ── 세 칸(sections) 읽기 (spec stats-bit-ai AC-2903.1) ──
describe('loadReportMonths — 세 칸 sections (AC-2903.1)', () => {
  it('AC-2903.1 같은 읽기 한 번에 sections도 읽고, 세 달마다 검사하지 않고 그대로 넘긴다(칸이 없거나 null인 달은 null)', async () => {
    const odd = { anything: '검사는 generate.ts가 한다' }
    const sel = { ...monthRow('2026-10', 120), sections: odd }
    const prev = { ...monthRow('2026-09', 110), sections: null }
    const lastYear = monthRow('2025-10', 100) // sections 칸이 없음
    const fake = fakeStatsClient({ months: answer([sel, prev, lastYear]), groups: answer(GROUP_ROWS) })
    const months = await loadReportMonths(fake.client, '2026-10')
    expect(months.sections?.selected).toBe(odd)
    expect(months.sections).toEqual({ selected: odd, prev: null, lastYear: null })
    expect(fake.select.filter((s) => s[0] === 'stats_months')).toEqual([['stats_months', 'month, payload, sections']])
    expect(fake.from.filter((f) => f[0] === 'stats_months')).toHaveLength(1)
    expectNoConsole()
  })

  it('AC-2903.1 sections는 그 달 줄의 것이다(같은 달 줄이 둘이면 payload와 같은 앞 줄, 세 달 밖 줄의 sections는 버린다)', async () => {
    const first = { ...monthRow('2026-10', 120), sections: { from: 'first' } }
    const second = { ...monthRow('2026-10', 130), sections: { from: 'second' } }
    const outside = { ...monthRow('2026-08', 90), sections: { from: 'outside' } }
    const months = await loadReportMonths(fakeStatsClient({ months: answer([outside, first, second]) }).client, '2026-10')
    expect(months.selected).toBe(first.payload)
    expect(months.sections).toEqual({ selected: { from: 'first' }, prev: null, lastYear: null })
  })
})

// 휴진 안내 AI 배경의 하루 한도(specs/forms-themes REQ-4607 AC-4607.2, design.md 4-5절). DB 함수 take_ai_image()가 세고, 여기는 부르기만 한다
describe('takeAiImage 하루 한도 부르기 (AC-4607.2)', () => {
  it("AC-4607.2 rpc('take_ai_image')를 인자 없이 한 번 부르고, 답 true면 true·false면 false", async () => {
    for (const answer of [true, false]) {
      const { client, rpc, touched } = fakeClient(async () => ({ data: answer, error: null }))
      await expect(takeAiImage(client)).resolves.toBe(answer)
      expect(rpc).toHaveBeenCalledTimes(1)
      expect(rpc.mock.calls[0]).toEqual(['take_ai_image'])
      expect(touched).toEqual(['rpc'])
    }
    expectNoConsole()
  })

  it("AC-4607.2 error가 있으면(승인 안 됨 42501 등, data가 true여도) 정확히 'failed'이고 오류 글자가 답에 없다", async () => {
    for (const data of [true, false, null]) {
      const { client } = fakeClient(async () => ({ data, error: { ...READ_ERROR, message: `hospital not approved ${SECRET}` } }))
      const result = await takeAiImage(client)
      expect(result).toBe('failed')
      expect(JSON.stringify(result)).not.toContain(SECRET)
    }
    expectNoConsole()
  })

  it("AC-4607.2 부름이 던지면(거절·바로 던짐) 'failed'", async () => {
    const rejecting = fakeClient(async () => boom())
    await expect(takeAiImage(rejecting.client)).resolves.toBe('failed')
    const throwing = fakeClient(boom as never)
    await expect(takeAiImage(throwing.client)).resolves.toBe('failed')
    expectNoConsole()
  })

  it("AC-4607.2 답이 불리언이 아니면(null·글자·숫자·객체·배열) 'failed'", async () => {
    for (const data of [null, undefined, 'true', 1, 0, {}, [true]]) {
      const { client } = fakeClient(async () => ({ data, error: null }))
      await expect(takeAiImage(client), JSON.stringify(data)).resolves.toBe('failed')
    }
    expectNoConsole()
  })

  it('AC-4607.2 store.ts는 take_ai_image를 rpc 글자 하나로만 부른다(병원 칸·인자 없음)', () => {
    const calls = storeSource().match(/\.rpc\(\s*'take_ai_image'[^)]*\)/g) ?? []
    expect(calls).toEqual([".rpc('take_ai_image')"])
  })
})

// ── clinic-profile: AI 시스템 글의 호칭을 서버가 DB에서 읽는다 (REQ-6606 AC-6606.4, design.md 8절) ──
describe('loadHonorific — 병원 정보 호칭 한 칸 (AC-6606.4)', () => {
  it.each(['원장님', '대표원장님', '선생님'] as const)("AC-6606.4: clinic_profiles에서 honorific 한 칸만 읽어(병원 조건 없이, RLS 세션) '%s'를 돌려준다", async (honorific) => {
    const fake = rowClient({ honorific })
    await expect(loadHonorific(fake.client)).resolves.toBe(honorific)
    expect(fake.from).toEqual([['clinic_profiles']])
    expect(fake.select).toEqual([['honorific']])
    expect(fake.eq).toEqual([])
    expect([...new Set(fake.touched)].sort()).toEqual(['from', 'maybeSingle', 'select'])
    expectNoConsole()
  })

  it.each<[string, () => RpcResult | Promise<RpcResult>]>([
    ['줄 없음', async () => ({ data: null, error: null })],
    ['세 가지 밖의 값', async () => ({ data: { honorific: '관리자님' }, error: null })],
    ['값이 글자가 아님', async () => ({ data: { honorific: 3 }, error: null })],
    ['칸 없음', async () => ({ data: {}, error: null })],
    ['답이 객체가 아님', async () => ({ data: '선생님', error: null })],
    ['읽기 오류(표가 아직 없음 등)', async () => ({ data: null, error: READ_ERROR })],
    ['거절', async () => boom()],
    ['바로 던짐', () => boom()],
  ])("AC-6606.4: %s이면 '원장님'이고 던지지 않으며 아무것도 남기지 않는다", async (_name, reply) => {
    await expect(loadHonorific(fakeReadClient(reply).client)).resolves.toBe('원장님')
    expectNoConsole()
  })

  it("AC-6606.4: from에서 던져도 '원장님'이다", async () => {
    await expect(loadHonorific(fakeClient().client)).resolves.toBe('원장님')
  })
})

// ---------- 의사랑 AI 경영 리포트 읽기 (specs/uisarang-upload REQ-8816 · AC-8816.1, design.md §10-5) ----------
// 가짜 DB 클라이언트: 표마다 줄 목록을 두고, 읽기 사슬(select·eq·gte·lte·in·order·limit·range)을 적어 두었다가 then에서 그 거르기대로 줄을 골라 준다.
// 표 대신 함수를 주면 그 답을 그대로 준다(오류·거절·던짐). 그 밖의 이름(insert·rpc·match …)·없는 표는 던진다. 실제 Supabase에 붙지 않는다
type DbStep = [method: string, ...args: unknown[]]
type DbCall = { table: string; steps: DbStep[] }
type DbTable = Record<string, unknown>[] | ((call: DbCall) => RpcResult | Promise<RpcResult>)

const DB_CHAIN = ['select', 'eq', 'gte', 'lte', 'in', 'order', 'limit', 'range']

function pick(rows: Record<string, unknown>[], steps: DbStep[]): Record<string, unknown>[] {
  let out = rows
  let columns: string[] | null = null
  const text = (value: unknown) => String(value)
  for (const [method, ...args] of steps) {
    const column = String(args[0])
    if (method === 'select') columns = String(args[0]).split(',').map((name) => name.trim())
    else if (method === 'eq') out = out.filter((row) => row[column] === args[1])
    else if (method === 'in') out = out.filter((row) => (args[1] as unknown[]).includes(row[column]))
    else if (method === 'gte') out = out.filter((row) => text(row[column]) >= text(args[1]))
    else if (method === 'lte') out = out.filter((row) => text(row[column]) <= text(args[1]))
    else if (method === 'limit') out = out.slice(0, args[0] as number)
    else if (method === 'range') out = out.slice(args[0] as number, (args[1] as number) + 1)
  }
  return out.map((row) => (columns === null ? row : Object.fromEntries(columns.filter((name) => name in row).map((name) => [name, row[name]]))))
}

function fakeDbClient(tables: Record<string, DbTable>) {
  const calls: DbCall[] = []
  const touched: string[] = []
  const guard = (methods: Record<string, (...args: unknown[]) => unknown>): unknown =>
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
  const chain = (call: DbCall): unknown => {
    const methods: Record<string, (...args: unknown[]) => unknown> = {
      then: (resolve, reject) => {
        const table = tables[call.table]
        let result: Promise<RpcResult>
        try {
          result = Promise.resolve(typeof table === 'function' ? table(call) : { data: pick(table, call.steps), error: null })
        } catch (error) {
          result = Promise.reject(error)
        }
        return result.then(resolve as (v: RpcResult) => unknown, reject as (e: unknown) => unknown)
      },
    }
    for (const name of DB_CHAIN) {
      methods[name] = (...args) => {
        call.steps.push([name, ...args])
        return chain(call)
      }
    }
    return guard(methods)
  }
  const client = guard({
    from: (table) => {
      if (typeof table !== 'string' || !(table in tables)) throw new Error(`읽으면 안 되는 표: ${String(table)}`)
      const call: DbCall = { table, steps: [] }
      calls.push(call)
      return chain(call)
    },
  }) as SupabaseClient
  return { client, calls, touched, tablesCalled: () => calls.map((call) => call.table) }
}

const uisDay = (day: string, patients: number, newPatients: number, source = 'uisarang') => ({
  day,
  partial: false,
  source,
  payload: toUisDayPayload({ day, patients, newPatients }),
  updated_at: '2026-11-01T00:00:00.000Z',
})
const uisCov = (from: string, to: string, source = 'uisarang') => ({ from_day: from, to_day: to, source, created_at: '2026-11-01T00:00:00.000Z' })
const sale = (day: string, total: number | null, rough: number | null = null) => ({ day, total, rough_total: rough, visits: 1, unconfirmed: false })
const period = (kind: 'rx' | 'age', from: string, to: string, payload: unknown) => ({ kind, from_day: from, to_day: to, payload, updated_at: '2026-11-02T00:00:00.000Z' })
const RX_OCT = { v: 1, rows: [{ code: 'FAKE-G1', name: '가짜 도수', qty: 12.5, amount: 600_000 }], total: 600_000 }
const AGE_DAY = { v: 1, patients: 3, newPatients: 1, bands: [0, 0, 0, 0, 1, 1, 1, 0, 0, 0], newBands: [0, 0, 0, 0, 0, 1, 0, 0, 0, 0] }

// 세 달(2026-10 · 2026-09 · 2025-10)과 그 밖 달 · 다른 출처 줄이 섞인 가짜 DB
function uisTables(over: Record<string, DbTable> = {}): Record<string, DbTable> {
  return {
    stats_months: [],
    stats_rx_groups: GROUP_ROWS,
    stats_days: [
      uisDay('2026-10-01', 3, 1),
      uisDay('2026-10-02', 4, 0),
      uisDay('2026-09-15', 5, 2),
      uisDay('2025-10-10', 6, 1),
      uisDay('2026-08-31', 9, 9), // 세 달 밖
      uisDay('2026-10-03', 7, 7, 'bit'), // 다른 출처
    ],
    stats_coverage: [uisCov('2026-09-01', '2026-10-31'), uisCov('2025-10-01', '2025-10-31'), uisCov('2026-10-01', '2026-10-31', 'bit'), uisCov('2026-07-01', '2026-07-31')],
    sales_days: [sale('2026-10-01', 100_000), sale('2026-10-02', null, 50_000), sale('2026-09-15', 70_000), sale('2025-10-10', 60_000), sale('2026-11-01', 1)],
    uis_periods: [
      period('rx', '2026-10-01', '2026-10-31', RX_OCT),
      period('rx', '2026-09-15', '2026-09-15', RX_OCT),
      period('rx', '2026-07-01', '2026-07-31', RX_OCT),
      period('age', '2026-10-01', '2026-10-01', AGE_DAY),
      period('age', '2025-10-10', '2025-10-10', AGE_DAY),
      period('age', '2026-11-02', '2026-11-02', AGE_DAY),
    ],
    ...over,
  }
}

const RANGES = [
  ['2026-10-01', '2026-10-31'],
  ['2026-09-01', '2026-09-30'],
  ['2025-10-01', '2025-10-31'],
] as const
const callsOf = (fake: ReturnType<typeof fakeDbClient>, table: string) => fake.calls.filter((call) => call.table === table).map((call) => call.steps)
const uisDeps = (loadMonths: GenerateDeps['loadMonths'], callClaude = vi.fn<GenerateDeps['callClaude']>()) => ({
  callClaude,
  deps: {
    loadMonths,
    callClaude,
    saveReport: async () => true,
    addUsage: async () => true,
    now: () => new Date('2026-11-27T03:00:00.000Z'),
  } satisfies GenerateDeps,
})

describe('loadReportMonths — 의사랑 날 줄이 있는지 먼저 본다 (AC-8816.1)', () => {
  it('AC-8816.1: 비트 의원 빈 달 — 고른 달 stats_months·uisarang 날 줄이 없으면 stats_days를 한 번(고른 달·uisarang·한 줄)만 읽고 멈춘다(uis_periods를 부르지 않음 · 값은 지금 그대로)', async () => {
    const prev = monthRow('2026-09', 110)
    const fake = fakeDbClient(uisTables({ stats_months: [prev], stats_days: [uisDay('2026-10-03', 7, 7, 'bit')] }))
    const months = await loadReportMonths(fake.client, '2026-10')
    expect(fake.tablesCalled().sort()).toEqual(['stats_days', 'stats_months', 'stats_rx_groups'])
    expect(callsOf(fake, 'stats_days')).toEqual([[['select', 'day'], ['eq', 'source', 'uisarang'], ['gte', 'day', '2026-10-01'], ['lte', 'day', '2026-10-31'], ['limit', 1]]])
    expect(months).toEqual({
      selected: null,
      prev: prev.payload,
      lastYear: null,
      groupNames: { [MANUAL_KEY]: '도수치료', [PT_KEY]: '물리치료' },
      sections: { selected: null, prev: null, lastYear: null },
    })
    expect(Object.keys(months)).not.toContain('uis')
    expectNoConsole()
  })

  it('AC-8816.1: 비트 의원 빈 달이면 리포트 만들기는 지금처럼 E-AI-NO-DATA이고 Claude를 부르지 않는다', async () => {
    const fake = fakeDbClient(uisTables({ stats_days: [] }))
    const { deps, callClaude } = uisDeps((m) => loadReportMonths(fake.client, m))
    await expect(generateReport('2026-10', deps)).resolves.toEqual({ ok: false, code: 'E-AI-NO-DATA' })
    expect(callClaude).not.toHaveBeenCalled()
    expect(fake.tablesCalled()).not.toContain('uis_periods')
  })

  it.each<[string, DbTable]>([
    ['error가 있음', () => ({ data: null, error: READ_ERROR })],
    ['거절', async () => boom()],
    ['바로 던짐', () => boom()],
    ['답이 배열이 아님', () => ({ data: { day: '2026-10-01' }, error: null })],
  ])('AC-8816.1: 그 먼저 읽기가 %s이면(새 SQL·망 문제) 비트 결과 그대로 — 던지지 않아 E-AI-NO-DATA(E-AI-FAILED 아님)', async (_name, days) => {
    const fake = fakeDbClient(uisTables({ stats_days: days, uis_periods: () => boom() }))
    const months = await loadReportMonths(fake.client, '2026-10')
    expect(months.selected).toBeNull()
    expect(Object.keys(months)).not.toContain('uis')
    expect(fake.tablesCalled()).not.toContain('uis_periods')
    expect(JSON.stringify(months)).not.toContain(SECRET)
    const { deps, callClaude } = uisDeps((m) => loadReportMonths(fakeDbClient(uisTables({ stats_days: days })).client, m))
    await expect(generateReport('2026-10', deps)).resolves.toEqual({ ok: false, code: 'E-AI-NO-DATA' })
    expect(callClaude).not.toHaveBeenCalled()
    expectNoConsole()
  })

  it('AC-8816.1: 고른 달 stats_months 줄이 있으면 의사랑 날 줄이 있어도 의사랑 표를 읽지 않는다(비트 길 그대로)', async () => {
    const fake = fakeDbClient(uisTables({ stats_months: [monthRow('2026-10', 120)] }))
    const months = await loadReportMonths(fake.client, '2026-10')
    expect(fake.tablesCalled().sort()).toEqual(['stats_months', 'stats_rx_groups'])
    expect(Object.keys(months)).toEqual(['selected', 'prev', 'lastYear', 'groupNames', 'sections'])
  })
})

describe('loadReportMonths — 의사랑 세 달 읽기 loadUisReportRaw (AC-8816.1)', () => {
  it('AC-8816.1: 의사랑 날 줄이 있으면 세 달마다 stats_days(uisarang)·stats_coverage(uisarang)·sales_days·uis_periods(rx 겹침·age 안)를 읽는다 — 칸·거르기·차례', async () => {
    const fake = fakeDbClient(uisTables())
    await loadReportMonths(fake.client, '2026-10')
    const page = ['range', 0, 999]
    expect(callsOf(fake, 'stats_days')).toEqual([
      [['select', 'day'], ['eq', 'source', 'uisarang'], ['gte', 'day', '2026-10-01'], ['lte', 'day', '2026-10-31'], ['limit', 1]],
      ...RANGES.map(([from, to]) => [['select', 'day, payload'], ['eq', 'source', 'uisarang'], ['gte', 'day', from], ['lte', 'day', to], ['order', 'day'], page]),
    ])
    expect(callsOf(fake, 'stats_coverage')).toEqual(
      RANGES.map(([from, to]) => [
        ['select', 'from_day, to_day'],
        ['eq', 'source', 'uisarang'],
        ['lte', 'from_day', to],
        ['gte', 'to_day', from],
        ['order', 'from_day'],
        ['order', 'to_day'],
        page,
      ]),
    )
    expect(callsOf(fake, 'sales_days')).toEqual(RANGES.map(([from, to]) => [['select', 'day, total, rough_total'], ['gte', 'day', from], ['lte', 'day', to], ['order', 'day'], page]))
    expect(callsOf(fake, 'uis_periods')).toEqual([
      ...RANGES.map(([from, to]) => [
        ['select', 'from_day, to_day, payload, updated_at'],
        ['eq', 'kind', 'rx'],
        ['lte', 'from_day', to],
        ['gte', 'to_day', from],
        ['order', 'from_day'],
        ['order', 'to_day'],
        page,
      ]),
      ...RANGES.map(([from, to]) => [
        ['select', 'from_day, to_day, payload, updated_at'],
        ['eq', 'kind', 'age'],
        ['gte', 'from_day', from],
        ['lte', 'to_day', to],
        ['order', 'from_day'],
        ['order', 'to_day'],
        page,
      ]),
    ])
    // 병원 조건·쓰기·rpc가 없다
    expect([...new Set(fake.touched)].sort()).toEqual(['eq', 'from', 'gte', 'in', 'limit', 'lte', 'order', 'range', 'select', 'then'])
    expect(JSON.stringify(fake.calls)).not.toMatch(/hospital/)
  })

  it('AC-8816.1: 읽은 줄은 검사하지 않고 고른 칸만 세 달 차례(고른 달·지난달·작년 같은 달)로 uis에 둔다 · 다른 출처·세 달 밖 줄은 거르기로 빠진다', async () => {
    const fake = fakeDbClient(uisTables())
    const months = await loadReportMonths(fake.client, '2026-10')
    const days = uisTables().stats_days as ReturnType<typeof uisDay>[]
    const day = (row: ReturnType<typeof uisDay>) => ({ day: row.day, payload: row.payload })
    expect(months.uis).toEqual({
      days: [day(days[0]), day(days[1]), day(days[2]), day(days[3])],
      coverage: [
        { from_day: '2026-09-01', to_day: '2026-10-31' },
        { from_day: '2026-09-01', to_day: '2026-10-31' },
        { from_day: '2025-10-01', to_day: '2025-10-31' },
      ],
      sales: [
        { day: '2026-10-01', total: 100_000, rough_total: null },
        { day: '2026-10-02', total: null, rough_total: 50_000 },
        { day: '2026-09-15', total: 70_000, rough_total: null },
        { day: '2025-10-10', total: 60_000, rough_total: null },
      ],
      rx: [
        { from_day: '2026-10-01', to_day: '2026-10-31', payload: RX_OCT, updated_at: '2026-11-02T00:00:00.000Z' },
        { from_day: '2026-09-15', to_day: '2026-09-15', payload: RX_OCT, updated_at: '2026-11-02T00:00:00.000Z' },
      ],
      age: [
        { from_day: '2026-10-01', to_day: '2026-10-01', payload: AGE_DAY, updated_at: '2026-11-02T00:00:00.000Z' },
        { from_day: '2025-10-10', to_day: '2025-10-10', payload: AGE_DAY, updated_at: '2026-11-02T00:00:00.000Z' },
      ],
      groups: [
        { key: MANUAL_KEY, name: '도수치료', codes: ['fake-g2', 'FAKE-G1'], out: [], cond: [] },
        { key: PT_KEY, name: '물리치료', codes: PT_CODES, out: [], cond: [] },
      ],
    })
    // 비트 길 칸은 지금 그대로(stats_months 줄 없음)
    expect(months.selected).toBeNull()
    expect(months.groupNames).toEqual({ [MANUAL_KEY]: '도수치료', [PT_KEY]: '물리치료' })
  })

  it('AC-8816.1: 1,000줄씩 모두 읽는다(1,500줄 → 0~999 · 1000~1999 두 번)', async () => {
    const many = Array.from({ length: 1500 }, () => uisCov('2026-10-01', '2026-10-31'))
    const fake = fakeDbClient(uisTables({ stats_coverage: many }))
    const months = await loadReportMonths(fake.client, '2026-10')
    const october = callsOf(fake, 'stats_coverage').filter((steps) => steps.some(([method, , value]) => method === 'gte' && value === '2026-10-01'))
    expect(october.map((steps) => steps.at(-1))).toEqual([
      ['range', 0, 999],
      ['range', 1000, 1999],
    ])
    // 고른 달 1,500줄 + 지난달·작년 같은 달과는 겹치지 않아 0줄
    expect(months.uis?.coverage).toHaveLength(1500)
  })

  it('AC-8816.1: 묶음은 groupDefsOf — groupNamesOf와 같은 거르기·차례·열쇠에 이름·넣는·빼는·조건 처방을 남긴다(같은 열쇠는 앞 묶음 하나)', async () => {
    const cond = [{ code: 'FAKE-P1', unless: ['FAKE-Y1'] }]
    const rows = [
      { name: '나중', codes: ['fake-g3'], out_codes: null, cond: null, sort_order: 5 },
      { name: '기본 PT', codes: ['FAKE-P1', 'FAKE-P2'], out_codes: ['FAKE-X1'], cond, sort_order: 0 },
      { name: '빈 묶음', codes: [], sort_order: 0 },
      { name: '010-1234-5678', codes: ['FAKE-Q1'], sort_order: 0 },
      { name: '물리치료', codes: PT_CODES, sort_order: 1 },
    ]
    const months = await loadReportMonths(fakeDbClient(uisTables({ stats_rx_groups: rows })).client, '2026-10')
    expect(months.uis?.groups).toEqual([
      { key: groupKey(['FAKE-P1', 'FAKE-P2'], { out: ['FAKE-X1'], cond }), name: '기본 PT', codes: ['FAKE-P1', 'FAKE-P2'], out: ['FAKE-X1'], cond },
      { key: PT_KEY, name: '물리치료', codes: PT_CODES, out: [], cond: [] },
    ])
    expect(Object.keys(months.groupNames)).toEqual(months.uis?.groups.map((group) => group.key))
  })

  it.each([['stats_days'], ['stats_coverage'], ['sales_days'], ['uis_periods']])(
    'AC-8816.1: 의사랑 세 달 읽기 가운데 %s 읽기가 실패하면 고정 글로 던진다 → 리포트 만들기 E-AI-FAILED · 숫자 바뀜 비교 false',
    async (table) => {
      // 먼저 읽기(stats_days 한 줄)는 지나고 나머지 읽기만 실패하게: limit가 있는 부름만 줄을 준다
      const failing: DbTable = (call) =>
        call.table === 'stats_days' && call.steps.some(([method]) => method === 'limit') ? { data: [{ day: '2026-10-01' }], error: null } : { data: null, error: READ_ERROR }
      const client = () => fakeDbClient(uisTables({ [table]: failing })).client
      await expectThrowsWithoutSecret(loadReportMonths(client(), '2026-10'))
      const { deps, callClaude } = uisDeps((m) => loadReportMonths(client(), m))
      await expect(generateReport('2026-10', deps)).resolves.toEqual({ ok: false, code: 'E-AI-FAILED' })
      expect(callClaude).not.toHaveBeenCalled()
      await expect(isReportStale('2026-10', 'a'.repeat(64), (m) => loadReportMonths(client(), m))).resolves.toBe(false)
    },
  )

  it('AC-8816.1: 읽기가 던져도(거절·바로 던짐) 고정 글로 던진다', async () => {
    await expectThrowsWithoutSecret(loadReportMonths(fakeDbClient(uisTables({ sales_days: async () => boom() })).client, '2026-10'))
    await expectThrowsWithoutSecret(loadReportMonths(fakeDbClient(uisTables({ uis_periods: () => boom() })).client, '2026-10'))
  })
})

describe('generateReport에 의사랑 loadReportMonths를 이어 부름 (AC-8816.1·AC-8816.5)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-27T03:00:00.000Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('AC-8816.1: Claude 입력은 서버가 읽은 의사랑 날 숫자로 만들고(source uisarang) 시스템 글 끝에 의사랑 묶음이 붙는다 · 묶음 처방 코드 목록은 보내지 않는다', async () => {
    const fake = fakeDbClient(uisTables())
    const goodText = JSON.stringify({
      summary: '접수 건수와 총진료비가 함께 늘었습니다.',
      cards: [
        { tag: 'up', text: '접수 건수가 늘었습니다.', metric: 'total.patients' },
        { tag: 'up', text: '총진료비가 늘었습니다.', metric: 'sales.total' },
        { tag: 'watch', text: '신환은 지켜볼 만합니다.', metric: 'total.newPatients' },
      ],
    })
    const callClaude = vi.fn<GenerateDeps['callClaude']>(async () => ({
      ok: true as const,
      text: goodText,
      usage: { inputTokens: 1000, outputTokens: 500, model: 'claude-opus-5-5' },
    }))
    const { deps } = uisDeps((m) => loadReportMonths(fake.client, m), callClaude)
    const res = await generateReport('2026-10', deps)
    expect(res.ok).toBe(true)
    const { system } = callClaude.mock.calls[0][0]
    const user = callClaude.mock.calls[0][0].user as string
    expect(system).toContain('[의사랑 엑셀 자료]')
    const input = JSON.parse(user.slice('<data>\n'.length, user.length - '\n</data>'.length)) as ReportInput
    expect(input.source).toBe('uisarang')
    expect(input.metrics.find((m) => m.id === 'total.patients')?.values).toEqual({ selected: 7, prev: 5, lastYear: 6 })
    expect(input.metrics.find((m) => m.id === 'sales.total')?.values).toEqual({ selected: 150_000, prev: 70_000, lastYear: 60_000 })
    expect(user).not.toContain('"codes"')
    expect(user).not.toContain('fake-g2')
  })
})
