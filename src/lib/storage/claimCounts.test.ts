import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { CountsReadError, readDayCounts } from './claimCounts'

// 건수 표 읽기(precheck AC-013.1, design.md 8-2). 쓰기는 TASK-19. 시험은 실제 Supabase에 붙지 않는다.
// 표는 TASK-19 마이그레이션이 만들므로 그 전에는 표가 없다: 빈 목록으로 본다

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

const ROW = { visit_date: '2026-10-28', need_memo: 7, entered: 2, needs_check: 1, skipped: 0, updated_at: '2026-10-28T02:00:00+00:00' }

describe('AC-013.1 readDayCounts: claim_day_counts 읽기', () => {
  it('AC-013.1: 기간 안 줄을 그 표에서 읽고 숫자·날짜 칸만 고른다', async () => {
    const { sb, calls } = fakeSb({ data: [ROW] })
    await expect(readDayCounts(sb, '2026-09-01', '2026-10-31')).resolves.toEqual([ROW])
    expect(calls).toEqual([
      ['from', 'claim_day_counts'],
      ['select', 'visit_date, need_memo, entered, needs_check, skipped, updated_at'],
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
