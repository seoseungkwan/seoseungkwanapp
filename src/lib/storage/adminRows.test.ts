import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ADMIN_ROW_KINDS, AdminRowsError, readAdminRows, type AdminRowKind } from './adminRows'

// 의원 비교 읽기(spec admin-view REQ-8005 AC-8005.2, design.md '브라우저 함수'·'비교 읽기 ⑧ admin_rows').
// 실제 Supabase에 붙지 않는다. rpc('admin_rows', …)에 나가는 인자·range 쪽·횟수와 답을 바꾼 모양만 본다.
// 칸·한도·권한은 supabase/adminView.rls.test.ts가 증명한다
const { rpc, range, from, supabaseBrowser } = vi.hoisted(() => {
  const range = vi.fn()
  const rpc = vi.fn(() => ({ range }))
  const from = vi.fn()
  const supabaseBrowser = vi.fn(() => ({ rpc, from }))
  return { rpc, range, from, supabaseBrowser }
})
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser }))

// design.md '비교 읽기' 표의 종류 열여덟(표 차례)
const KINDS = [
  'stats_days',
  'stats_months',
  'stats_day_totals',
  'stats_coverage',
  'stats_rx_groups',
  'stats_goals',
  'sales_days',
  'sales_code_totals',
  'sales_codes',
  'sunap_settings',
  'sunap_days',
  'calendar_settings',
  'calendar_allday',
  'calendar_counts',
  'clinic_profiles',
  'staff_members',
  'staff_pay',
  'staff_settings',
] as const satisfies readonly AdminRowKind[]

const RAW = 'permission denied for function admin_rows (secret detail)'
const H1 = '11111111-1111-4111-8111-111111111111'
const H2 = '22222222-2222-4222-8222-222222222222'
const IDS = [H1, H2] as const

const dbRow = (i: number) => ({ hospital_id: i % 2 === 0 ? H1 : H2, row: { day: '2026-10-01', n: i } })
const dbRows = (start: number, count: number) => Array.from({ length: count }, (_, k) => dbRow(start + k))
const page = (data: unknown) => ({ data, error: null, status: 200 })

beforeEach(() => {
  range.mockReset()
  range.mockResolvedValue(page([]))
  rpc.mockClear()
  from.mockReset()
  supabaseBrowser.mockClear()
})

describe('readAdminRows(): rpc admin_rows를 1,000줄씩 range로 다 읽기', () => {
  it('AC-8005.2: 종류는 design.md 표의 열여덟과 같다', () => {
    expect([...ADMIN_ROW_KINDS].sort()).toEqual([...KINDS].sort())
    expect(ADMIN_ROW_KINDS).toHaveLength(18)
  })

  it.each(KINDS)("AC-8005.2: 종류 '%s'는 rpc('admin_rows', { p_kind, p_hospital_ids, p_from, p_to })로 그대로 보낸다", async (kind) => {
    await readAdminRows(kind, IDS, '2026-10-01', '2026-10-31')
    expect(rpc).toHaveBeenCalledExactlyOnceWith('admin_rows', {
      p_kind: kind,
      p_hospital_ids: [H1, H2],
      p_from: '2026-10-01',
      p_to: '2026-10-31',
    })
    expect(range).toHaveBeenCalledExactlyOnceWith(0, 999)
    expect(from).not.toHaveBeenCalled()
  })

  it('AC-8005.2: 0줄이면 한 번만 부르고 빈 목록', async () => {
    range.mockResolvedValueOnce(page([]))
    await expect(readAdminRows('stats_days', IDS, '2026-10-01', '2026-10-31')).resolves.toEqual([])
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(range.mock.calls).toEqual([[0, 999]])
  })

  it('AC-8005.2: 답이 null이어도 빈 목록이 아니라 실패다(목록이 아닌 답)', async () => {
    range.mockResolvedValueOnce(page(null))
    await expect(readAdminRows('stats_days', IDS, '2026-10-01', '2026-10-31')).rejects.toBeInstanceOf(AdminRowsError)
  })

  it('AC-8005.2: 999줄이면 짧은 쪽이라 한 번만 부른다', async () => {
    range.mockResolvedValueOnce(page(dbRows(0, 999)))
    const rows = await readAdminRows('stats_days', IDS, '2026-10-01', '2026-10-31')
    expect(rows).toHaveLength(999)
    expect(range.mock.calls).toEqual([[0, 999]])
  })

  it('AC-8005.2: 1,000줄이면 쪽이 꽉 차 다음 쪽(1000~1999)을 한 번 더 읽고, 빈 쪽에서 멈춘다', async () => {
    range.mockResolvedValueOnce(page(dbRows(0, 1000))).mockResolvedValueOnce(page([]))
    const rows = await readAdminRows('stats_days', IDS, '2026-10-01', '2026-10-31')
    expect(rows).toHaveLength(1000)
    expect(range.mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
    ])
    expect(rpc).toHaveBeenCalledTimes(2)
    for (const call of rpc.mock.calls as unknown[][]) {
      expect(call).toEqual(['admin_rows', { p_kind: 'stats_days', p_hospital_ids: [H1, H2], p_from: '2026-10-01', p_to: '2026-10-31' }])
    }
  })

  it('AC-8005.2: 1,001줄이면 두 쪽(1,000 + 1)을 읽고 모자란 쪽에서 멈춘다 — 받은 차례 그대로 이어 붙인다', async () => {
    range.mockResolvedValueOnce(page(dbRows(0, 1000))).mockResolvedValueOnce(page(dbRows(1000, 1)))
    const rows = await readAdminRows('calendar_counts', IDS, '2026-10-01', '2026-10-31')
    expect(rows).toHaveLength(1001)
    expect(range.mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
    ])
    expect(rows[0]).toEqual({ hospitalId: H1, row: { day: '2026-10-01', n: 0 } })
    expect(rows[999]).toEqual({ hospitalId: H2, row: { day: '2026-10-01', n: 999 } })
    expect(rows[1000]).toEqual({ hospitalId: H1, row: { day: '2026-10-01', n: 1000 } })
  })

  it('AC-8005.2: 줄을 { hospitalId, row } 모양으로 바꾼다(row는 받은 jsonb 그대로)', async () => {
    const row = { day: '2026-10-02', partial: false, source: 'bit', payload: { totals: { visits: 3 } }, updated_at: '2026-10-03T00:00:00+00:00' }
    range.mockResolvedValueOnce(page([{ hospital_id: H2, row }]))
    await expect(readAdminRows('stats_days', [H2], '2026-10-01', '2026-10-31')).resolves.toEqual([{ hospitalId: H2, row }])
  })

  it('AC-8005.2: 넘겨받은 병원 목록은 고치지 않는다', async () => {
    const ids = [H1, H2]
    await readAdminRows('staff_pay', ids, '2026-10-01', '2026-10-31')
    expect(ids).toEqual([H1, H2])
  })

  it('AC-8005.2: deps.client가 있으면 그 클라이언트로 부르고 브라우저 클라이언트를 만들지 않는다', async () => {
    const ownRange = vi.fn().mockResolvedValue(page(dbRows(0, 2)))
    const ownRpc = vi.fn(() => ({ range: ownRange }))
    const client = { rpc: ownRpc } as unknown as SupabaseClient
    const rows = await readAdminRows('sales_days', IDS, '2026-10-01', '2026-10-31', { client })
    expect(rows).toHaveLength(2)
    expect(ownRpc).toHaveBeenCalledExactlyOnceWith('admin_rows', {
      p_kind: 'sales_days',
      p_hospital_ids: [H1, H2],
      p_from: '2026-10-01',
      p_to: '2026-10-31',
    })
    expect(supabaseBrowser).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('AC-8005.2: 열여덟 밖의 종류는 부르지 않고 AdminRowsError', async () => {
    const thrown = await readAdminRows('calendar_appts' as AdminRowKind, IDS, '2026-10-01', '2026-10-31').catch((e: unknown) => e)
    expect(thrown).toBeInstanceOf(AdminRowsError)
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('readAdminRows(): 실패는 AdminRowsError(원래 글은 cause에만), 반쪽 목록을 주지 않는다', () => {
  it('AC-8005.2: 답 오류 → AdminRowsError, 메시지에 원래 글이 없고 cause에 있다, 다시 부르지 않는다', async () => {
    const error = { code: '42501', message: RAW }
    range.mockResolvedValueOnce({ data: null, error, status: 403 })
    const thrown = await readAdminRows('stats_days', IDS, '2026-10-01', '2026-10-31').catch((e: unknown) => e)
    expect(thrown).toBeInstanceOf(AdminRowsError)
    expect((thrown as Error).message).not.toContain('secret detail')
    expect((thrown as Error).cause).toBe(error)
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('AC-8005.2: 요청이 던지면 AdminRowsError, cause에 원래 오류', async () => {
    const cause = new Error(`fetch failed ${RAW}`)
    range.mockRejectedValueOnce(cause)
    const thrown = await readAdminRows('stats_days', IDS, '2026-10-01', '2026-10-31').catch((e: unknown) => e)
    expect(thrown).toBeInstanceOf(AdminRowsError)
    expect((thrown as Error).message).not.toContain('secret detail')
    expect((thrown as Error).cause).toBe(cause)
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('AC-8005.2: 클라이언트를 만들지 못하면 AdminRowsError', async () => {
    const cause = new Error(`NEXT_PUBLIC_SUPABASE_URL 없음 ${RAW}`)
    supabaseBrowser.mockImplementationOnce(() => {
      throw cause
    })
    const thrown = await readAdminRows('stats_days', IDS, '2026-10-01', '2026-10-31').catch((e: unknown) => e)
    expect(thrown).toBeInstanceOf(AdminRowsError)
    expect((thrown as Error).message).not.toContain('secret detail')
    expect((thrown as Error).cause).toBe(cause)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('AC-8005.2: 둘째 쪽이 실패하면 첫 쪽 1,000줄을 주지 않고 AdminRowsError', async () => {
    range.mockResolvedValueOnce(page(dbRows(0, 1000))).mockResolvedValueOnce({ data: null, error: { message: RAW }, status: 500 })
    await expect(readAdminRows('stats_days', IDS, '2026-10-01', '2026-10-31')).rejects.toBeInstanceOf(AdminRowsError)
    expect(rpc).toHaveBeenCalledTimes(2)
  })

  const good = dbRow(0)
  it.each([
    ['답이 객체 하나', { hospital_id: H1, row: {} }],
    ['답이 글', 'rows'],
    ['줄이 null', [good, null]],
    ['줄이 글', [good, 'x']],
    ['hospital_id 없음', [{ row: {} }]],
    ['hospital_id 빈 글', [{ hospital_id: '', row: {} }]],
    ['hospital_id 숫자', [{ hospital_id: 1, row: {} }]],
    ['row 없음', [{ hospital_id: H1 }]],
    ['row null', [{ hospital_id: H1, row: null }]],
    ['row 목록', [{ hospital_id: H1, row: [1, 2] }]],
    ['row 글', [{ hospital_id: H1, row: '{}' }]],
  ] as const)('AC-8005.2: 답 줄 모양이 틀리면(%s) AdminRowsError', async (_name, data) => {
    range.mockResolvedValueOnce(page(data))
    await expect(readAdminRows('stats_days', IDS, '2026-10-01', '2026-10-31')).rejects.toBeInstanceOf(AdminRowsError)
    expect(rpc).toHaveBeenCalledTimes(1)
  })
})
