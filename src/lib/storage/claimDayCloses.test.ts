import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { CountsReadError } from './claimCounts'
import { closeDays, DayCloseError, readClosedDays, reopenDays } from './claimDayCloses'

// 날짜별 완료 표시 읽기·저장·지우기(spec claim-day-done TASK-2). 시험은 실제 Supabase에 붙지 않는다.
// 날짜·숫자는 지어낸 값이다. 마이그레이션 전에는 표가 없다: 읽기는 완료 표시 없음, 저장·지우기는 E-DAYCLOSE-FAILED

const SECRET = 'relation "public.claim_day_closes" does not exist'
const TABLE = 'claim_day_closes'

type Answer = { data?: unknown; error?: unknown; status?: number } | 'reject' | 'throw'

/** 부른 표·메서드·보낸 값·옵션을 차례로 적는다 */
function fakeSb(answer: Answer = {}) {
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
    order(...args: unknown[]) {
      calls.push(['order', ...args])
      return query
    },
    limit(...args: unknown[]) {
      calls.push(['limit', ...args])
      return query
    },
    in(...args: unknown[]) {
      calls.push(['in', ...args])
      return query
    },
    then(ok: (value: unknown) => unknown, no: (reason: unknown) => unknown) {
      const reply =
        answer === 'reject' || answer === 'throw'
          ? Promise.reject(new Error(SECRET))
          : Promise.resolve({ data: answer.data ?? null, error: answer.error ?? null, status: answer.status ?? 200 })
      return reply.then(ok, no)
    },
  }
  const sb = {
    from(table: string) {
      calls.push(['from', table])
      // 클라이언트가 그 자리에서 던지는 경우
      if (answer === 'throw') throw new Error(SECRET)
      return {
        select(...args: unknown[]) {
          calls.push(['select', ...args])
          return query
        },
        upsert(...args: unknown[]) {
          calls.push(['upsert', ...args])
          return query
        },
        delete(...args: unknown[]) {
          calls.push(['delete', ...args])
          return query
        },
      }
    },
  }
  return { sb: sb as unknown as SupabaseClient, calls }
}

/** 진짜 supabase-js가 보내는 요청을 그대로 잡는다. 인터넷으로 나가지 않는다 */
function realClient(status = 201) {
  const requests: { url: URL; method: string; body: string; prefer: string | null }[] = []
  const sb = createClient('https://fake-project.supabase.test', 'fake-anon-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: async (input, init) => {
        requests.push({ url: new URL(String(input)), method: init?.method ?? 'GET', body: String(init?.body ?? ''), prefer: new Headers(init?.headers).get('Prefer') })
        return new Response(null, { status, headers: { 'Content-Type': 'application/json' } })
      },
    },
  })
  return { sb, requests }
}

async function caught(work: Promise<unknown>): Promise<unknown> {
  return work.then(
    () => 'no error',
    (e: unknown) => e,
  )
}

/** E-DAYCLOSE-FAILED이고 받은 오류 글·값을 싣지 않았다 */
function expectDayCloseError(error: unknown, ...hidden: string[]) {
  expect(error).toBeInstanceOf(DayCloseError)
  expect((error as DayCloseError).code).toBe('E-DAYCLOSE-FAILED')
  expect((error as Error).cause).toBeUndefined()
  for (const text of ['relation', SECRET, ...hidden]) expect(String((error as Error).message)).not.toContain(text)
}

const CLOSED = [
  { visit_date: '2026-09-29', closed_at: '2026-11-08T01:20:00+00:00' },
  { visit_date: '2026-09-28', closed_at: '2026-11-08T01:19:00+00:00' },
]

const NO_TABLE: [string, number][] = [
  ['PGRST205', 404],
  ['42P01', 400],
  ['', 404],
]

const FAILURES: [string, Answer][] = [
  ['표가 아직 없음(마이그레이션 전, PGRST205)', { error: { code: 'PGRST205', message: SECRET }, status: 404 }],
  ['표가 아직 없음(42P01)', { error: { code: '42P01', message: SECRET }, status: 400 }],
  ['권한 없음(승인 안 된 병원)', { error: { code: '42501', message: SECRET }, status: 403 }],
  ['서버 오류', { error: { code: '500', message: SECRET }, status: 500 }],
  ['연결 끊김', 'reject'],
  ['클라이언트가 그 자리에서 던짐', 'throw'],
]

const NOT_DATES: [string, unknown][] = [
  ['없는 날', '2026-02-30'],
  ['빗금 날짜', '2026/09/28'],
  ['붙여 쓴 날짜', '20260928'],
  ['시각이 붙음', '2026-09-28T00:00:00Z'],
  ['앞에 빈칸', ' 2026-09-28'],
  ['빈 글자', ''],
  ['이름 글자', '가상환자A'],
  ['수', 20260928],
  ['null', null],
  ['undefined', undefined],
  ['객체', { visit_date: '2026-09-28' }],
]

// ── 읽기 ──────────

describe('AC-2803.3 readClosedDays: claim_day_closes 읽기', () => {
  it('AC-2803.3: 기간이 있으면 그 기간의 완료 표시를 그 표에서 읽고 날짜·시각 칸만 고른다', async () => {
    const { sb, calls } = fakeSb({ data: CLOSED })
    await expect(readClosedDays(sb, { from: '2025-10-04', to: '2026-11-08' })).resolves.toEqual(CLOSED)
    expect(calls).toEqual([
      ['from', TABLE],
      ['select', 'visit_date, closed_at'],
      ['gte', 'visit_date', '2025-10-04'],
      ['lte', 'visit_date', '2026-11-08'],
    ])
  })

  it('AC-2803.3: 기간이 없으면 최근 날부터 400줄을 읽는다', async () => {
    const { sb, calls } = fakeSb({ data: CLOSED })
    await expect(readClosedDays(sb)).resolves.toEqual(CLOSED)
    expect(calls).toEqual([
      ['from', TABLE],
      ['select', 'visit_date, closed_at'],
      ['order', 'visit_date', { ascending: false }],
      ['limit', 400],
    ])
  })

  it.each(NO_TABLE)('AC-2803.3: 표가 아직 없으면(번호 %s·상태 %s) 완료 표시 없음(빈 목록)이다', async (code, status) => {
    const missing = { error: { code, message: SECRET }, status }
    await expect(readClosedDays(fakeSb(missing).sb)).resolves.toEqual([])
    await expect(readClosedDays(fakeSb(missing).sb, { from: '2025-10-04', to: '2026-11-08' })).resolves.toEqual([])
  })

  it('AC-2803.3: 답이 비어도 빈 목록이다', async () => {
    await expect(readClosedDays(fakeSb({ data: null }).sb)).resolves.toEqual([])
  })

  it.each<[string, Answer]>([
    ['권한 오류', { error: { code: '42501', message: SECRET }, status: 403 }],
    ['서버 오류', { error: { code: '500', message: SECRET }, status: 500 }],
    ['연결 끊김', 'reject'],
  ])('AC-2803.3: %s면 읽기 실패(CountsReadError → E-COUNTS-FAILED)로 던지고 원래 오류 글을 싣지 않는다', async (_name, answer) => {
    const error = await caught(readClosedDays(fakeSb(answer).sb))
    expect(error).toBeInstanceOf(CountsReadError)
    expect(String((error as Error).message)).not.toContain('relation')
  })

  it.each<[string, unknown, unknown]>([
    ['시작이 날짜 모양이 아님', '가상환자A', '2026-11-08'],
    ['끝이 없는 날', '2025-10-04', '2026-02-30'],
    ['끝이 수', '2025-10-04', 20261108],
  ])('AC-2806.1: 읽는 기간의 %s이면 아무것도 보내지 않고 E-DAYCLOSE-FAILED로 던진다', async (_name, from, to) => {
    const { sb, calls } = fakeSb({ data: CLOSED })
    const error = await caught(readClosedDays(sb, { from, to } as never))
    expectDayCloseError(error, '가상환자')
    expect(calls).toEqual([])
  })
})

// ── 완료로 저장 ──────────

describe('AC-2801.3 closeDays: [완료로 저장]', () => {
  it('AC-2801.3: 고른 두 날을 claim_day_closes 하나에 한 번 보내고 줄마다 칸은 visit_date 하나뿐이다', async () => {
    const { sb, calls } = fakeSb({ status: 201 })
    await expect(closeDays(sb, ['2026-09-28', '2026-09-29'])).resolves.toBeUndefined()
    expect(calls).toEqual([
      ['from', TABLE],
      ['upsert', [{ visit_date: '2026-09-28' }, { visit_date: '2026-09-29' }], { onConflict: 'hospital_id,visit_date', ignoreDuplicates: true }],
    ])
    const rows = calls[1][1] as Record<string, unknown>[]
    for (const row of rows) expect(Object.keys(row)).toEqual(['visit_date'])
  })

  it('AC-2801.3: 같은 날이 두 번 들어와도 한 줄로 보낸다', async () => {
    const { sb, calls } = fakeSb({ status: 201 })
    await closeDays(sb, ['2026-09-28', '2026-09-29', '2026-09-28'])
    expect(calls.filter((call) => call[0] === 'upsert')).toEqual([
      ['upsert', [{ visit_date: '2026-09-28' }, { visit_date: '2026-09-29' }], { onConflict: 'hospital_id,visit_date', ignoreDuplicates: true }],
    ])
  })

  it('AC-2801.3: 고른 날이 없으면 아무것도 보내지 않는다', async () => {
    const { sb, calls } = fakeSb()
    await expect(closeDays(sb, [])).resolves.toBeUndefined()
    expect(calls).toEqual([])
  })

  it('AC-2801.3·AC-2801.6: 진짜 supabase-js로는 그 표에 POST 한 번, 칸은 visit_date뿐이고 (병원, 날짜)가 있으면 그대로 둔다(ignore-duplicates)', async () => {
    const { sb, requests } = realClient()
    await closeDays(sb, ['2026-09-28', '2026-09-29'])
    expect(requests).toHaveLength(1)
    const [request] = requests
    expect(request.method).toBe('POST')
    expect(request.url.pathname).toBe(`/rest/v1/${TABLE}`)
    expect(request.url.searchParams.get('on_conflict')).toBe('hospital_id,visit_date')
    expect(request.url.searchParams.get('columns')?.replaceAll('"', '')).toBe('visit_date')
    expect(request.prefer).toContain('resolution=ignore-duplicates')
    expect(request.prefer).not.toContain('merge-duplicates')
    expect(JSON.parse(request.body)).toEqual([{ visit_date: '2026-09-28' }, { visit_date: '2026-09-29' }])
  })

  it('AC-2801.6: 다른 창에서 이미 완료로 저장된 날을 다시 저장해도 실패하지 않는다(서버는 처음 줄·처음 시각을 둔다)', async () => {
    const { sb, calls } = fakeSb({ data: null, status: 201 })
    await expect(closeDays(sb, ['2026-09-28'])).resolves.toBeUndefined()
    expect(calls[1]).toEqual(['upsert', [{ visit_date: '2026-09-28' }], { onConflict: 'hospital_id,visit_date', ignoreDuplicates: true }])
  })

  it.each(FAILURES)('AC-2801.5: %s면 E-DAYCLOSE-FAILED로 던지고 원래 오류 글을 싣지 않는다', async (_name, answer) => {
    const error = await caught(closeDays(fakeSb(answer).sb, ['2026-09-28', '2026-09-29']))
    expectDayCloseError(error)
  })

  it.each(NOT_DATES)('AC-2806.1: %s 값이 있으면 아무것도 보내지 않고 E-DAYCLOSE-FAILED로 던진다', async (_name, value) => {
    const { sb, calls } = fakeSb({ status: 201 })
    const error = await caught(closeDays(sb, ['2026-09-28', value] as never))
    expectDayCloseError(error, '가상환자')
    expect(calls).toEqual([])
  })
})

// ── 되돌리기 ──────────

describe('AC-2802.2 reopenDays: [되돌리기]', () => {
  it('AC-2802.2: claim_day_closes에서 그 날짜 하나를 지우는 요청 하나다', async () => {
    const { sb, calls } = fakeSb({ status: 204 })
    await expect(reopenDays(sb, ['2026-09-28'])).resolves.toBeUndefined()
    expect(calls).toEqual([
      ['from', TABLE],
      ['delete'],
      ['in', 'visit_date', ['2026-09-28']],
    ])
  })

  it('AC-2802.2: 방금 저장한 여러 날도 요청 하나로 지운다(같은 날은 하나로)', async () => {
    const { sb, calls } = fakeSb({ status: 204 })
    await reopenDays(sb, ['2026-09-28', '2026-09-29', '2026-09-28'])
    expect(calls).toEqual([
      ['from', TABLE],
      ['delete'],
      ['in', 'visit_date', ['2026-09-28', '2026-09-29']],
    ])
  })

  it('AC-2802.2: 진짜 supabase-js로는 그 표에 DELETE 한 번이고 조건은 그 날짜뿐이다', async () => {
    const { sb, requests } = realClient(204)
    await reopenDays(sb, ['2026-09-28'])
    expect(requests).toHaveLength(1)
    const [request] = requests
    expect(request.method).toBe('DELETE')
    expect(request.url.pathname).toBe(`/rest/v1/${TABLE}`)
    expect([...request.url.searchParams.entries()]).toEqual([['visit_date', 'in.(2026-09-28)']])
    expect(request.body).toBe('')
  })

  it('AC-2802.2: 지울 날이 없으면 아무것도 보내지 않는다', async () => {
    const { sb, calls } = fakeSb()
    await expect(reopenDays(sb, [])).resolves.toBeUndefined()
    expect(calls).toEqual([])
  })

  it.each(FAILURES)('AC-2801.5: 되돌리기가 %s면 E-DAYCLOSE-FAILED로 던지고 원래 오류 글을 싣지 않는다', async (_name, answer) => {
    const error = await caught(reopenDays(fakeSb(answer).sb, ['2026-09-28']))
    expectDayCloseError(error)
  })

  it.each(NOT_DATES)('AC-2806.1: 되돌릴 날에 %s 값이 있으면 아무것도 보내지 않고 E-DAYCLOSE-FAILED로 던진다', async (_name, value) => {
    const { sb, calls } = fakeSb({ status: 204 })
    const error = await caught(reopenDays(sb, ['2026-09-28', value] as never))
    expectDayCloseError(error, '가상환자')
    expect(calls).toEqual([])
  })
})
