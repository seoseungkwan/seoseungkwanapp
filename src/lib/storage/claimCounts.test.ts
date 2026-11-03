import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { ourClinicPhrases } from '@/lib/precheck/memo'
import { readCountsMessage } from '@/lib/precheck/counts'
import type { MemoScreenView, PrecheckFromScreen, PrecheckToScreen } from '@/types/precheck'
import { createPrecheckJobs } from '@/workers/precheck/jobs'
import { loadTables } from '@/workers/precheck/tables'
import { checkDayCount, CountsReadError, CountsUploadError, readDayCounts, readOutsideCounts, upsertDayCounts } from './claimCounts'

// 건수 표 읽기·쓰기(precheck AC-013.1·REQ-019, design.md 8-2). 시험은 실제 Supabase에 붙지 않는다.
// 마이그레이션을 붙여 넣기 전에는 표가 없다: 읽기는 빈 목록으로 보고, 올리기는 실패(E-COUNTS-FAILED)로 던진다

const SECRET = 'relation "public.claim_day_counts" does not exist'

type Answer = { data?: unknown; error?: unknown; status?: number } | 'throw'

function fakeSb(answer: Answer) {
  const calls: unknown[][] = []
  const query = {
    gte(...args: unknown[]) {
      calls.push(['gte', ...args])
      return query
    },
    lte(...args: unknown[]) {
      calls.push(['lte', ...args])
      return query
    },
    then(ok: (value: unknown) => unknown, no: (reason: unknown) => unknown) {
      const reply = answer === 'throw' ? Promise.reject(new Error(SECRET)) : Promise.resolve({ data: answer.data ?? null, error: answer.error ?? null, status: answer.status ?? 200 })
      return reply.then(ok, no)
    },
  }
  const sb = {
    from(table: string) {
      calls.push(['from', table])
      return {
        select(...args: unknown[]) {
          calls.push(['select', ...args])
          return query
        },
      }
    },
  }
  return { sb: sb as unknown as SupabaseClient, calls }
}

const ROW = { visit_date: '2026-10-28', visits: 51, need_memo: 7, entered: 2, needs_check: 1, skipped: 0, updated_at: '2026-10-28T02:00:00+00:00' }

describe('AC-013.1 readDayCounts: claim_day_counts 읽기', () => {
  it('AC-013.1: 기간 안 줄을 그 표에서 읽고 숫자·날짜 칸만 고른다', async () => {
    const { sb, calls } = fakeSb({ data: [ROW] })
    await expect(readDayCounts(sb, '2026-09-01', '2026-10-31')).resolves.toEqual([ROW])
    expect(calls).toEqual([
      ['from', 'claim_day_counts'],
      ['select', 'visit_date, visits, need_memo, entered, needs_check, skipped, updated_at'],
      ['gte', 'visit_date', '2026-09-01'],
      ['lte', 'visit_date', '2026-10-31'],
    ])
  })

  it.each([
    ['PGRST205', 404],
    ['42P01', 400],
    ['', 404],
  ])('AC-013.1: 표가 없으면(마이그레이션 전, 번호 %s·상태 %s) 빈 목록이다', async (code, status) => {
    const { sb } = fakeSb({ error: { code, message: SECRET }, status })
    await expect(readDayCounts(sb, '2026-09-01', '2026-10-31')).resolves.toEqual([])
  })

  it('AC-013.1: 답이 비어도 빈 목록이다', async () => {
    const { sb } = fakeSb({ data: null })
    await expect(readDayCounts(sb, '2026-09-01', '2026-10-31')).resolves.toEqual([])
  })

  it.each([
    ['권한 오류', { error: { code: '42501', message: SECRET }, status: 403 } as Answer],
    ['네트워크 실패', 'throw' as Answer],
  ])('AC-013.1: %s면 CountsReadError를 던지고 원래 오류 글을 싣지 않는다', async (_name, answer) => {
    const { sb } = fakeSb(answer)
    const error = await readDayCounts(sb, '2026-09-01', '2026-10-31').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(CountsReadError)
    expect(String((error as Error).message)).not.toContain('relation')
  })
})

// ── 올리기(AC-019.3·AC-019.4·AC-019.6) ──────────

const GOOD = { visit_date: '2026-10-28', visits: 51, need_memo: 7, entered: 2, needs_check: 1, skipped: 0 }

describe('AC-019.3 checkDayCount: 정해 둔 6칸 밖이면 보내지 않는다', () => {
  it('AC-019.3: 맞는 줄은 그 6칸만 든 새 줄로 돌려준다', () => {
    const checked = checkDayCount(GOOD)
    expect(checked).toEqual(GOOD)
    expect(checked).not.toBe(GOOD)
  })

  it.each<[string, unknown]>([
    ['이름 칸이 더 있음', { ...GOOD, name: '가상환자A' }],
    ['차트번호 칸이 더 있음', { ...GOOD, chart: '900019' }],
    ['메모 글 칸이 더 있음', { ...GOOD, memo: '메모 글' }],
    ['hospital_id 칸이 더 있음', { ...GOOD, hospital_id: '00000000-0000-4000-8000-00000000000a' }],
    ['updated_at 칸이 더 있음', { ...GOOD, updated_at: '2026-10-28T00:00:00Z' }],
    ['칸이 빠짐', { visit_date: GOOD.visit_date, visits: 1, need_memo: 1, entered: 0, needs_check: 0 }],
    ['진료 수가 없음(Worker 줄 5칸 그대로)', { visit_date: GOOD.visit_date, need_memo: 1, entered: 0, needs_check: 0, skipped: 0 }],
    ['진료 수 음수', { ...GOOD, visits: -1 }],
    ['진료 수 100,000 넘음', { ...GOOD, visits: 100_001 }],
    ['진료 수가 글자', { ...GOOD, visits: '51' }],
    ['진료 수가 소수', { ...GOOD, visits: 1.5 }],
    ['값이 undefined(칸 수는 맞음)', { ...GOOD, skipped: undefined }],
    ['수가 글자', { ...GOOD, need_memo: '7' }],
    ['수에 글자로 된 이름', { ...GOOD, skipped: '가상환자A' }],
    ['소수', { ...GOOD, need_memo: 1.5 }],
    ['음수', { ...GOOD, needs_check: -1 }],
    ['100,000 넘음', { ...GOOD, skipped: 100_001 }],
    ['입력 수 > 메모 필요 수', { ...GOOD, need_memo: 1, entered: 2 }],
    ['NaN', { ...GOOD, entered: Number.NaN }],
    ['날짜가 글자', { ...GOOD, visit_date: '가상환자A' }],
    ['날짜가 없는 날', { ...GOOD, visit_date: '2026-02-30' }],
    ['날짜가 수', { ...GOOD, visit_date: 20261028 }],
    ['배열', [GOOD]],
    ['null', null],
    ['글자', 'x'],
  ])('AC-019.3: %s면 던진다', (_name, row) => {
    expect(() => checkDayCount(row)).toThrow(CountsUploadError)
  })

  it('AC-019.3: 끝값 0·100,000과 입력 수 = 메모 필요 수는 지난다', () => {
    const edge = { visit_date: GOOD.visit_date, visits: 100_000, need_memo: 100_000, entered: 100_000, needs_check: 0, skipped: 100_000 }
    expect(checkDayCount(edge)).toEqual(edge)
  })

  it('AC-019.3: 던지는 오류에 받은 값이 실리지 않는다', () => {
    const error = (() => {
      try {
        checkDayCount({ ...GOOD, name: '가상환자A' })
      } catch (e) {
        return e as CountsUploadError
      }
    })()
    expect(error?.code).toBe('E-COUNTS-FAILED')
    expect(error?.message).not.toContain('가상환자')
  })
})

/** 진짜 supabase-js가 보내는 요청을 그대로 잡는다. 인터넷으로 나가지 않는다 */
function realClient(status = 201, body: string | null = null) {
  const requests: { url: URL; method: string; body: string; prefer: string | null }[] = []
  const sb = createClient('https://fake-project.supabase.test', 'fake-anon-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: async (input, init) => {
        requests.push({ url: new URL(String(input)), method: init?.method ?? 'GET', body: String(init?.body ?? ''), prefer: new Headers(init?.headers).get('Prefer') })
        return new Response(body, { status, headers: { 'Content-Type': 'application/json' } })
      },
    },
  })
  return { sb, requests }
}

describe('AC-019.4 upsertDayCounts', () => {
  it('AC-019.4: 그 표에 (병원, 날짜)로 upsert한다. 칸 목록에 hospital_id·updated_at이 없다', async () => {
    const { sb, requests } = realClient()
    await upsertDayCounts(sb, [GOOD])
    expect(requests).toHaveLength(1)
    const [request] = requests
    expect(request.method).toBe('POST')
    expect(request.url.pathname).toBe('/rest/v1/claim_day_counts')
    expect(request.url.searchParams.get('on_conflict')).toBe('hospital_id,visit_date')
    expect(request.prefer).toContain('resolution=merge-duplicates')
    const columns = request.url.searchParams.get('columns') ?? ''
    expect(columns.replaceAll('"', '').split(',').sort()).toEqual(['entered', 'need_memo', 'needs_check', 'skipped', 'visit_date', 'visits'])
  })

  it('AC-019.4: 줄이 없으면 아무것도 보내지 않는다', async () => {
    const { sb, requests } = realClient()
    await upsertDayCounts(sb, [])
    expect(requests).toEqual([])
  })

  it('AC-019.3: 틀린 줄이 하나라도 있으면 하나도 보내지 않는다', async () => {
    const { sb, requests } = realClient()
    await expect(upsertDayCounts(sb, [GOOD, { ...GOOD, visit_date: '2026-10-29', name: '가상환자A' } as never])).rejects.toBeInstanceOf(CountsUploadError)
    expect(requests).toEqual([])
  })

  it.each<[string, number, string]>([
    ['표 없음(마이그레이션 전, PGRST205)', 404, JSON.stringify({ code: 'PGRST205', message: SECRET })],
    ['표 없음(42P01)', 400, JSON.stringify({ code: '42P01', message: SECRET })],
    ['권한 없음(승인 안 된 병원)', 403, JSON.stringify({ code: '42501', message: SECRET })],
    ['서버 오류', 500, JSON.stringify({ message: SECRET })],
  ])('AC-019.4: %s면 E-COUNTS-FAILED를 던지고 원래 오류 글을 싣지 않는다', async (_name, status, body) => {
    const { sb } = realClient(status, body)
    const error = await upsertDayCounts(sb, [GOOD]).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(CountsUploadError)
    expect((error as CountsUploadError).code).toBe('E-COUNTS-FAILED')
    expect((error as Error).message).not.toContain('relation')
  })

  it('AC-019.4: 네트워크가 끊겨도 E-COUNTS-FAILED다', async () => {
    const sb = createClient('https://fake-project.supabase.test', 'fake-anon-key', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        fetch: async () => {
          throw new Error(SECRET)
        },
      },
    })
    const error = await upsertDayCounts(sb, [GOOD]).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(CountsUploadError)
    expect((error as Error).message).not.toContain('relation')
  })
})

// ── AC-019.6: 진짜 Worker 일 → 진짜 supabase-js가 만든 요청 몸통. 손으로 만든 줄이 아니다 ──────────

const FAKE_MONTH = readFileSync(fileURLToPath(new URL('../../../fixtures/precheck/fake/claim-month-memo.json', import.meta.url)), 'utf-8')
const DAY = { from: '2026-10-12', to: '2026-10-12' }
const SELECT = { mode: 'date', from: DAY.from, to: DAY.to, typed: '', chip: '', kind: 'range', day: DAY.from, rangeFrom: DAY.from, rangeTo: DAY.to } as const

describe('AC-019.6 서버에 보내는 요청 몸통', { timeout: 60_000 }, () => {
  async function workerOutput() {
    const posts: unknown[] = []
    const jobs = createPrecheckJobs({ post: (message) => posts.push(message), loadTables, toPort: () => {} })
    const give = async (id: string, text: string) => {
      const data = text
      await jobs.fromPort({ type: 'chunk', id, seq: 0, data })
      await jobs.fromPort({ type: 'end', id, count: 1, bytes: Buffer.byteLength(text, 'utf8'), sha256: createHash('sha256').update(text, 'utf8').digest('hex') })
    }
    await jobs.fromScreen({ type: 'loadStart', load: 1 } satisfies PrecheckFromScreen)
    await give('month', FAKE_MONTH)
    await jobs.fromScreen({ type: 'month', id: 'month', load: 1 } satisfies PrecheckFromScreen)
    // 비트 메모에 다른 글이 든 사람도 넣어 입력·이미 있음이 함께 세어지게 한다
    await give('memos', JSON.stringify({ version: 1, period: DAY, truncated: false, invalidRows: 0, rows: [{ v: 'm04', p: '900019', d: DAY.from, m: '비트에 있던 다른 메모 글' }] }))
    await jobs.fromScreen({ type: 'loadPart', part: 'memos', id: 'memos', load: 1 } satisfies PrecheckFromScreen)
    await jobs.fromScreen({ type: 'check', check: 1, load: 1, visible: DAY, settings: { rules: { schema: 1, off: [], on: [], grade: [] }, phrases: ourClinicPhrases(), dxLinks: [] } } satisfies PrecheckFromScreen)
    await jobs.fromScreen({ type: 'memoView', ask: 1, selection: SELECT } satisfies PrecheckFromScreen)
    const view = (posts as PrecheckToScreen[]).find((m) => m.type === 'memoView' && m.ok) as Extract<PrecheckToScreen, { type: 'memoView'; ok: true }> | undefined
    const rows = posts.map(readCountsMessage).find((found) => found !== null)?.rows
    if (!view || !rows) throw new Error('Worker 답이 없다')
    return { rows, table: view.view.table as MemoScreenView['table'] }
  }

  it('AC-019.6: 몸통에는 정해 둔 칸과 정수·날짜만 있고 Worker가 가진 이름·차트번호·메모 글·내원번호가 없다', async () => {
    const { rows, table } = await workerOutput()
    // 시험이 헛돌지 않게: Worker가 진짜 환자 글자를 들고 있었다
    expect(table.length).toBeGreaterThan(0)
    expect(table.every((row) => row.name.length > 0 && row.chart.length > 0)).toBe(true)
    expect(table.some((row) => row.text.length > 0)).toBe(true)

    const { sb, requests } = realClient()
    // 화면(useCountsUpload)이 받은 줄에 하는 일과 같다: claim.dates의 진료 수를 붙이고 검사한다
    const toSend = rows.map((row) => checkDayCount({ ...(row as object), visits: 76 }))
    await upsertDayCounts(sb, toSend)
    expect(requests).toHaveLength(1)
    const { body, url } = requests[0]

    const sent = JSON.parse(body) as Record<string, unknown>[]
    expect(sent).toEqual(toSend)
    expect(sent.length).toBeGreaterThan(0)
    // 비트에 다른 글이 든 사람 한 명이 건너뜀으로 세어졌다: 그 글을 쓴 뒤에도 몸통에는 수뿐이다
    expect(sent[0]).toMatchObject({ visit_date: DAY.from, skipped: 1 })
    for (const row of sent) {
      expect(Object.keys(row).sort()).toEqual(['entered', 'need_memo', 'needs_check', 'skipped', 'visit_date', 'visits'])
      expect(row.visit_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      for (const key of ['visits', 'need_memo', 'entered', 'needs_check', 'skipped']) expect(Number.isInteger(row[key])).toBe(true)
    }

    const everything = `${url.toString()} ${body}`
    for (const row of table) {
      expect(everything).not.toContain(row.name)
      expect(everything).not.toContain(row.chart)
      expect(everything).not.toContain(row.key)
      if (row.text) expect(everything).not.toContain(row.text)
      if (row.inBit) expect(everything).not.toContain(row.inBit)
      for (const name of row.rxNames) expect(everything).not.toContain(name)
    }
    expect(everything).not.toContain('가상환자')
    expect(everything).not.toContain('비트에 있던 다른 메모 글')
    expect(everything).not.toMatch(/9\d{5}/)
  })
})

// ── 밖에서 보기(AC-019.5) ──────────

type Tables = Record<string, Answer>
function fakeReads(tables: Tables) {
  const calls: { table: string; select: unknown }[] = []
  const sb = {
    from(table: string) {
      return {
        select(columns: unknown) {
          calls.push({ table, select: columns })
          const answer = tables[table] ?? { data: [] }
          const query = {
            order: () => query,
            limit: () => query,
            then(ok: (value: unknown) => unknown, no: (reason: unknown) => unknown) {
              const reply = answer === 'throw' ? Promise.reject(new Error(SECRET)) : Promise.resolve({ data: answer.data ?? null, error: answer.error ?? null, status: answer.status ?? 200 })
              return reply.then(ok, no)
            },
          }
          return query
        },
      }
    },
  }
  return { sb: sb as unknown as SupabaseClient, calls }
}

const DAY_ROW = (visit_date: string, need_memo: number, entered: number, updated_at: string) => ({ visit_date, visits: 9, need_memo, entered, needs_check: 0, skipped: 0, updated_at })

describe('AC-019.5 readOutsideCounts', () => {
  it('AC-019.5: 숫자·날짜 칸만 고르고, 남은 날만 최근 날부터 준다. 마지막 바뀐 시각은 끝난 날까지 넣어 가장 늦은 시각이다', async () => {
    const { sb, calls } = fakeReads({
      claim_day_counts: {
        data: [
          DAY_ROW('2026-10-27', 5, 5, '2026-10-30T07:41:00+00:00'),
          DAY_ROW('2026-10-28', 5, 3, '2026-10-29T07:41:00+00:00'),
          DAY_ROW('2026-10-29', 2, 0, '2026-10-28T07:41:00+00:00'),
        ],
      },
    })
    const counts = await readOutsideCounts(sb)
    expect(counts.days.map((day) => day.visit_date)).toEqual(['2026-10-29', '2026-10-28'])
    expect(counts.total).toBe(3)
    expect(counts.updatedAt).toBe('2026-10-30T07:41:00+00:00')
    expect(counts.months).toEqual([])
    expect(counts.contact).toBeNull()
    expect(calls.map((call) => call.table).sort()).toEqual(['claim_day_counts', 'claim_month_counts', 'contact_counts'])
    for (const call of calls) expect(String(call.select)).not.toMatch(/\*|hospital_id|name|chart|memo_text/)
  })

  it('AC-019.5: 달·연락 건수도 함께 읽고 가장 늦은 시각에 넣는다', async () => {
    const month = { claim_month: '2026-10-01', incomplete: 2, missing: 3, flagged: 1, updated_at: '2026-11-01T00:00:00+00:00' }
    const contact = { followup_left: 4, injection_left: 3, updated_at: '2026-11-02T00:00:00+00:00' }
    const { sb } = fakeReads({ claim_month_counts: { data: [month] }, contact_counts: { data: [contact] } })
    const counts = await readOutsideCounts(sb)
    expect(counts.months).toEqual([month])
    expect(counts.contact).toEqual(contact)
    expect(counts.updatedAt).toBe(contact.updated_at)
  })

  it.each([
    ['PGRST205', 404],
    ['42P01', 400],
    ['', 404],
  ])('AC-019.5: 표가 없으면(마이그레이션 전, 번호 %s·상태 %s) 올린 건수가 없는 것과 같다', async (code, status) => {
    const missing = { error: { code, message: SECRET }, status }
    const { sb } = fakeReads({ claim_day_counts: missing, claim_month_counts: missing, contact_counts: missing })
    await expect(readOutsideCounts(sb)).resolves.toEqual({ days: [], total: 0, months: [], contact: null, updatedAt: null })
  })

  it.each<[string, Tables]>([
    ['건수 표 권한 오류', { claim_day_counts: { error: { code: '42501', message: SECRET }, status: 403 } }],
    ['달 표 네트워크 실패', { claim_month_counts: 'throw' }],
    ['연락 표 서버 오류', { contact_counts: { error: { code: '500', message: SECRET }, status: 500 } }],
  ])('AC-019.5: %s면 CountsReadError를 던지고 원래 오류 글을 싣지 않는다', async (_name, tables) => {
    const { sb } = fakeReads(tables)
    const error = await readOutsideCounts(sb).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(CountsReadError)
    expect(String((error as Error).message)).not.toContain('relation')
  })
})
