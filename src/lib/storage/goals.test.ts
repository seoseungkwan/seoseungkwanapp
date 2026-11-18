import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import type { Goal } from '@/types/goals'
import { GoalStoreError, loadGoal, saveGoal } from './goals'

// 이번 달 목표 읽기·저장(stats-insights REQ-6102 AC-6102.2, TASK-1). 시험은 실제 Supabase에 붙지 않는다.
// 숫자는 지어낸 값이다. 보내는 값은 달과 세 숫자뿐이고 hospital_id는 DB가 정한다

const SECRET = 'relation "public.stats_goals" does not exist'
const TABLE = 'stats_goals'
const MONTH = '2026-11'
const FULL: Goal = { visits: 3200, newPatients: 180, revenue: 120_000_000 }

type Answer = { data?: unknown; error?: unknown; status?: number } | 'reject' | 'throw'

/** 부른 표·메서드·보낸 값·옵션을 차례로 적는다 */
function fakeSb(answer: Answer = {}) {
  const calls: unknown[][] = []
  const query = {
    eq(...args: unknown[]) {
      calls.push(['eq', ...args])
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
function realClient(status = 201, body: unknown = null) {
  const requests: { url: URL; method: string; body: string; prefer: string | null }[] = []
  const sb = createClient('https://fake-project.supabase.test', 'fake-anon-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: async (input, init) => {
        requests.push({ url: new URL(String(input)), method: init?.method ?? 'GET', body: String(init?.body ?? ''), prefer: new Headers(init?.headers).get('Prefer') })
        return new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
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

/** 번호만 싣고 받은 오류 글·값은 옮기지 않았다 */
function expectGoalError(error: unknown, code: 'E-STATS-READ-FAILED' | 'E-STATS-SAVE-FAILED') {
  expect(error).toBeInstanceOf(GoalStoreError)
  expect((error as GoalStoreError).code).toBe(code)
  expect((error as Error).cause).toBeUndefined()
  expect(String((error as Error).message)).not.toContain('relation')
}

const FAILURES: [string, Answer][] = [
  ['표가 아직 없음(SQL 전, PGRST205)', { error: { code: 'PGRST205', message: SECRET }, status: 404 }],
  ['권한 없음(승인 안 된 병원)', { error: { code: '42501', message: SECRET }, status: 403 }],
  ['검사 제약에 걸림', { error: { code: '23514', message: SECRET }, status: 400 }],
  ['서버 오류', { error: { code: '500', message: SECRET }, status: 500 }],
  ['연결 끊김', 'reject'],
  ['클라이언트가 그 자리에서 던짐', 'throw'],
]

const BAD_MONTHS: [string, unknown][] = [
  ['13월', '2026-13'],
  ['한 자리 달', '2026-1'],
  ['날짜', '2026-11-01'],
  ['빈 글자', ''],
  ['수', 202611],
  ['null', null],
]

// ── 읽기 ──────────

describe('AC-6102.2 loadGoal: 그 달 목표 읽기', () => {
  it('AC-6102.2: stats_goals에서 그 달 줄의 세 숫자 칸만 골라 Goal로 바꾼다(new_patients → newPatients)', async () => {
    const { sb, calls } = fakeSb({ data: [{ visits: 3200, new_patients: 180, revenue: 120_000_000 }] })
    await expect(loadGoal(sb, MONTH)).resolves.toEqual(FULL)
    expect(calls).toEqual([
      ['from', TABLE],
      ['select', 'visits, new_patients, revenue'],
      ['eq', 'month', MONTH],
    ])
  })

  it('AC-6102.2: 비워 둔 칸은 null 그대로다', async () => {
    const { sb } = fakeSb({ data: [{ visits: null, new_patients: 150, revenue: null }] })
    await expect(loadGoal(sb, MONTH)).resolves.toEqual({ visits: null, newPatients: 150, revenue: null })
  })

  it.each<[string, unknown]>([
    ['빈 목록', []],
    ['null', null],
  ])('AC-6102.2: 줄이 없으면(%s) 세 값 모두 null이다', async (_name, data) => {
    await expect(loadGoal(fakeSb({ data }).sb, MONTH)).resolves.toEqual({ visits: null, newPatients: null, revenue: null })
  })

  it.each(FAILURES)('AC-6102.2: %s면 읽기 실패(E-STATS-READ-FAILED)로 던지고 원래 오류 글을 싣지 않는다', async (_name, answer) => {
    expectGoalError(await caught(loadGoal(fakeSb(answer).sb, MONTH)), 'E-STATS-READ-FAILED')
  })

  it.each<[string, unknown]>([
    ['음수', { visits: -1, new_patients: null, revenue: null }],
    ['소수', { visits: 1.5, new_patients: null, revenue: null }],
    ['글자', { visits: null, new_patients: '180', revenue: null }],
    ['범위 밖', { visits: null, new_patients: null, revenue: 100_000_000_001 }],
    ['줄 목록이 아님', 'oops'],
  ])('AC-6102.2: 받은 줄 모양이 틀리면(%s) 읽기 실패로 던진다', async (_name, row) => {
    const data = Array.isArray(row) || typeof row !== 'object' ? row : [row]
    expectGoalError(await caught(loadGoal(fakeSb({ data }).sb, MONTH)), 'E-STATS-READ-FAILED')
  })

  it.each(BAD_MONTHS)('AC-6102.2: 달이 YYYY-MM이 아니면(%s) 아무것도 보내지 않고 읽기 실패로 던진다', async (_name, month) => {
    const { sb, calls } = fakeSb({ data: [] })
    expectGoalError(await caught(loadGoal(sb, month as string)), 'E-STATS-READ-FAILED')
    expect(calls).toEqual([])
  })

  it('AC-6102.2: 진짜 클라이언트는 GET /rest/v1/stats_goals?select=…&month=eq.2026-11 하나를 보낸다', async () => {
    const { sb, requests } = realClient(200, [{ visits: 3200, new_patients: null, revenue: null }])
    await expect(loadGoal(sb, MONTH)).resolves.toEqual({ visits: 3200, newPatients: null, revenue: null })
    expect(requests).toHaveLength(1)
    const [request] = requests
    expect(request!.method).toBe('GET')
    expect(request!.url.pathname).toBe('/rest/v1/stats_goals')
    expect(request!.url.searchParams.get('select')).toBe('visits,new_patients,revenue')
    expect(request!.url.searchParams.get('month')).toBe(`eq.${MONTH}`)
  })
})

// ── 저장 ──────────

describe('AC-6102.2 saveGoal: 그 달 목표 저장', () => {
  it('AC-6102.2: 그 달 줄 하나를 upsert하고 칸은 month·visits·new_patients·revenue뿐이다(hospital_id 없음)', async () => {
    const { sb, calls } = fakeSb({ status: 201 })
    await expect(saveGoal(sb, MONTH, FULL)).resolves.toBeUndefined()
    expect(calls).toEqual([
      ['from', TABLE],
      ['upsert', { month: MONTH, visits: 3200, new_patients: 180, revenue: 120_000_000 }, { onConflict: 'hospital_id,month' }],
    ])
  })

  it('AC-6102.2: 비운 칸은 null로 보내 그 지표 목표를 지운다', async () => {
    const { sb, calls } = fakeSb({ status: 201 })
    await saveGoal(sb, MONTH, { visits: null, newPatients: 150, revenue: null })
    expect(calls[1]).toEqual(['upsert', { month: MONTH, visits: null, new_patients: 150, revenue: null }, { onConflict: 'hospital_id,month' }])
  })

  it('AC-6102.2: 세 값이 모두 빈 값이면 upsert 대신 그 달 줄을 지운다', async () => {
    const { sb, calls } = fakeSb({ status: 204 })
    await expect(saveGoal(sb, MONTH, { visits: null, newPatients: null, revenue: null })).resolves.toBeUndefined()
    expect(calls).toEqual([
      ['from', TABLE],
      ['delete'],
      ['eq', 'month', MONTH],
    ])
  })

  it('AC-6102.2: 받은 목표에 다른 열쇠가 섞여 있어도 정해 둔 네 칸만 보낸다', async () => {
    const { sb, calls } = fakeSb({ status: 201 })
    await saveGoal(sb, MONTH, { ...FULL, hospital_id: 'someone-else', name: '가상환자A' } as unknown as Goal)
    expect(calls[1]![1]).toEqual({ month: MONTH, visits: 3200, new_patients: 180, revenue: 120_000_000 })
  })

  it.each<[string, Goal]>([
    ['0', { visits: 0, newPatients: 0, revenue: 0 }],
    ['위 끝', { visits: 1_000_000, newPatients: 1_000_000, revenue: 100_000_000_000 }],
  ])('AC-6102.2: 경계 값(%s)은 보낸다', async (_name, goal) => {
    const { sb, calls } = fakeSb({ status: 201 })
    await saveGoal(sb, MONTH, goal)
    expect(calls[1]![0]).toBe('upsert')
  })

  it.each<[string, Partial<Record<keyof Goal, unknown>>]>([
    ['내원 음수', { visits: -1 }],
    ['내원 소수', { visits: 3200.5 }],
    ['내원 범위 밖', { visits: 1_000_001 }],
    ['신환 음수', { newPatients: -3 }],
    ['신환 범위 밖', { newPatients: 1_000_001 }],
    ['매출 소수', { revenue: 0.5 }],
    ['매출 범위 밖', { revenue: 100_000_000_001 }],
    ['NaN', { visits: Number.NaN }],
    ['무한', { revenue: Number.POSITIVE_INFINITY }],
    ['글자', { visits: '3200' }],
    ['undefined', { newPatients: undefined }],
  ])('AC-6102.2: 모양이 틀린 값(%s)은 보내지 않고 저장 실패(E-STATS-SAVE-FAILED)로 던진다', async (_name, bad) => {
    const { sb, calls } = fakeSb({ status: 201 })
    expectGoalError(await caught(saveGoal(sb, MONTH, { ...FULL, ...bad } as Goal)), 'E-STATS-SAVE-FAILED')
    expect(calls).toEqual([])
  })

  it.each(BAD_MONTHS)('AC-6102.2: 달이 YYYY-MM이 아니면(%s) 보내지 않고 저장 실패로 던진다', async (_name, month) => {
    const { sb, calls } = fakeSb({ status: 201 })
    expectGoalError(await caught(saveGoal(sb, month as string, FULL)), 'E-STATS-SAVE-FAILED')
    expectGoalError(await caught(saveGoal(sb, month as string, { visits: null, newPatients: null, revenue: null })), 'E-STATS-SAVE-FAILED')
    expect(calls).toEqual([])
  })

  it.each(FAILURES)('AC-6102.2: upsert가 %s면 저장 실패로 던지고 원래 오류 글을 싣지 않는다', async (_name, answer) => {
    expectGoalError(await caught(saveGoal(fakeSb(answer).sb, MONTH, FULL)), 'E-STATS-SAVE-FAILED')
  })

  it.each(FAILURES)('AC-6102.2: 지우기가 %s면 저장 실패로 던진다', async (_name, answer) => {
    expectGoalError(await caught(saveGoal(fakeSb(answer).sb, MONTH, { visits: null, newPatients: null, revenue: null })), 'E-STATS-SAVE-FAILED')
  })

  it('AC-6102.2: 진짜 클라이언트 upsert는 POST /rest/v1/stats_goals?on_conflict=hospital_id,month + merge-duplicates이고 몸은 네 칸뿐이다', async () => {
    const { sb, requests } = realClient(201)
    await saveGoal(sb, MONTH, { visits: 3200, newPatients: null, revenue: 120_000_000 })
    expect(requests).toHaveLength(1)
    const [request] = requests
    expect(request!.method).toBe('POST')
    expect(request!.url.pathname).toBe('/rest/v1/stats_goals')
    expect(request!.url.searchParams.get('on_conflict')).toBe('hospital_id,month')
    expect(request!.prefer).toContain('resolution=merge-duplicates')
    expect(JSON.parse(request!.body)).toEqual({ month: MONTH, visits: 3200, new_patients: null, revenue: 120_000_000 })
  })

  it('AC-6102.2: 진짜 클라이언트 지우기는 DELETE /rest/v1/stats_goals?month=eq.2026-11 하나다', async () => {
    const { sb, requests } = realClient(204)
    await saveGoal(sb, MONTH, { visits: null, newPatients: null, revenue: null })
    expect(requests).toHaveLength(1)
    expect(requests[0]!.method).toBe('DELETE')
    expect(requests[0]!.url.pathname).toBe('/rest/v1/stats_goals')
    expect([...requests[0]!.url.searchParams.entries()]).toEqual([['month', `eq.${MONTH}`]])
  })
})
