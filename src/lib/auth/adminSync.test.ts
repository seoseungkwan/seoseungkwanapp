import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminSyncError, listUploadStatus, readCompareFirstMonth, setUploadMonths } from './adminSync'

// 저절로 올리기 — 관리자 쪽 브라우저 함수(spec admin-view REQ-8020 AC-8020.3, design.md '저절로 올리기 — 셈 · 글 · 브라우저 함수').
// 본보기 lib/auth/admin.ts·adminView.ts. 실제 Supabase에 붙지 않는다. 어느 rpc에 어떤 값이 몇 번 나가는지와 답을 바꾼 모양만 본다.
// 권한(관리자만·승인된 병원만·아홉 값만)은 supabase/adminSync.rls.test.ts가 증명한다
const { from, rpc, supabaseBrowser } = vi.hoisted(() => {
  const from = vi.fn()
  const rpc = vi.fn()
  const supabaseBrowser = vi.fn(() => ({ from, rpc }))
  return { from, rpc, supabaseBrowser }
})
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser }))

const RAW = 'permission denied for function set_auto_upload_months (secret detail)'
const H1 = '11111111-1111-4111-8111-111111111111'
const H2 = '22222222-2222-4222-8222-222222222222'

const LIST_ROWS = [
  {
    hospital_id: H1,
    months: 120,
    through_day: '2026-11-23',
    filled_from: '2024-03-01',
    last_ok_at: '2026-11-23T23:05:00+00:00',
    error_code: null,
    error_at: null,
  },
  { hospital_id: H2, months: 2, through_day: null, filled_from: null, last_ok_at: null, error_code: 'E-HELPER-OLD', error_at: '2026-11-21T00:00:00+00:00' },
]

beforeEach(() => {
  from.mockReset()
  rpc.mockReset()
  rpc.mockResolvedValue({ data: null, error: null, status: 204 })
  supabaseBrowser.mockClear()
})

async function caught(run: () => Promise<unknown>): Promise<Error> {
  const thrown = await run().then(
    () => undefined,
    (e: unknown) => e,
  )
  expect(thrown).toBeInstanceOf(AdminSyncError)
  expect(String((thrown as Error).message)).not.toContain('secret')
  return thrown as Error
}

describe('listUploadStatus(): rpc admin_auto_upload_list → Map<병원 id, UploadRow>', () => {
  it('AC-8020.3: admin_auto_upload_list를 인자 없이 한 번만 부르고 표는 읽지 않으며 병원 id마다 한 줄을 준다', async () => {
    rpc.mockResolvedValue({ data: LIST_ROWS, error: null })
    const map = await listUploadStatus()
    expect(rpc).toHaveBeenCalledExactlyOnceWith('admin_auto_upload_list')
    expect(from).not.toHaveBeenCalled()
    expect([...map.keys()]).toEqual([H1, H2])
    expect(map.get(H1)).toEqual({
      months: 120,
      throughDay: '2026-11-23',
      filledFrom: '2024-03-01',
      lastOkAt: '2026-11-23T23:05:00+00:00',
      errorCode: null,
      errorAt: null,
    })
    expect(map.get(H2)).toEqual({ months: 2, throughDay: null, filledFrom: null, lastOkAt: null, errorCode: 'E-HELPER-OLD', errorAt: '2026-11-21T00:00:00+00:00' })
  })

  it('AC-8020.3: 빈 목록이면 빈 Map', async () => {
    rpc.mockResolvedValue({ data: [], error: null })
    expect((await listUploadStatus()).size).toBe(0)
  })

  it.each([
    ['목록 아님', LIST_ROWS[0]],
    ['병원 id 없음', [{ ...LIST_ROWS[0], hospital_id: '' }]],
    ['아홉 밖 달 수', [{ ...LIST_ROWS[0], months: 7 }]],
    ['날 모양 아님', [{ ...LIST_ROWS[0], through_day: '11월 23일' }]],
    ['채운 달 1일 아님', [{ ...LIST_ROWS[0], filled_from: '2024-03-02' }]],
    ['시각 숫자', [{ ...LIST_ROWS[0], last_ok_at: 1 }]],
    ['오류 번호 숫자', [{ ...LIST_ROWS[0], error_code: 42 }]],
    ['같은 병원 두 줄', [LIST_ROWS[0], LIST_ROWS[0]]],
  ])('AC-8020.3: 답 모양이 틀리면(%s) 반쪽 목록 대신 AdminSyncError', async (_label, data) => {
    rpc.mockResolvedValue({ data, error: null })
    await caught(() => listUploadStatus())
  })
})

describe('setUploadMonths(): rpc set_auto_upload_months', () => {
  it('AC-8020.3: set_auto_upload_months({ p_hospital_id, p_months })를 한 번만 부른다', async () => {
    await expect(setUploadMonths(H2, 12)).resolves.toBeUndefined()
    expect(rpc).toHaveBeenCalledExactlyOnceWith('set_auto_upload_months', { p_hospital_id: H2, p_months: 12 })
    expect(from).not.toHaveBeenCalled()
  })
})

describe('readCompareFirstMonth(): rpc admin_compare_first_month → YYYY-MM | null', () => {
  it("AC-8020.3: admin_compare_first_month를 인자 없이 한 번만 부르고 그 달 1일을 'YYYY-MM'으로 준다", async () => {
    rpc.mockResolvedValue({ data: '2024-11-01', error: null })
    await expect(readCompareFirstMonth()).resolves.toBe('2024-11')
    expect(rpc).toHaveBeenCalledExactlyOnceWith('admin_compare_first_month')
    expect(from).not.toHaveBeenCalled()
  })

  it('AC-8020.3: 저장된 줄이 하나도 없으면 null', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    await expect(readCompareFirstMonth()).resolves.toBeNull()
  })

  it.each([['2024-11-15'], ['2024-11'], ['2024/11/01'], [20241101], [['2024-11-01']]])('AC-8020.3: 답이 달 1일 모양이 아니면(%j) AdminSyncError', async (data) => {
    rpc.mockResolvedValue({ data, error: null })
    await caught(() => readCompareFirstMonth())
  })
})

describe('실패: Supabase 글 없이 AdminSyncError · 다시 부르지 않음', () => {
  const CALLS = [
    ['listUploadStatus', () => listUploadStatus()],
    ['setUploadMonths', () => setUploadMonths(H1, 2)],
    ['readCompareFirstMonth', () => readCompareFirstMonth()],
  ] as const

  it.each(CALLS)('AC-8020.3: %s — 오류 답·던짐·클라이언트 만들기 실패 모두 AdminSyncError(원래 글은 cause에만, 한 번만 부름)', async (_name, run) => {
    rpc.mockResolvedValue({ data: null, error: { message: RAW, code: '42501' } })
    const fromReply = await caught(run)
    expect(fromReply.cause).toEqual({ message: RAW, code: '42501' })
    expect(rpc).toHaveBeenCalledTimes(1)
    rpc.mockReset()
    rpc.mockRejectedValue(new Error(RAW))
    await caught(run)
    expect(rpc).toHaveBeenCalledTimes(1)
    supabaseBrowser.mockImplementationOnce(() => {
      throw new Error(RAW)
    })
    await caught(run)
  })

  it('AC-8020.3: setUploadMonths 실패 글은 E-AUTO-MONTHS의 무엇이(채울 기간을 바꾸지 못했어요)다', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: RAW } })
    expect((await caught(() => setUploadMonths(H1, 5))).message).toBe('채울 기간을 바꾸지 못했어요')
  })
})
