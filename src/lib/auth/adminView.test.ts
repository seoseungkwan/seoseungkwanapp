import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AdminViewError,
  listViewHospitals,
  readViewLog,
  setHospitalRegion,
  startAdminView,
  stopAdminView,
  type ViewHospital,
  type ViewLogRow,
} from './adminView'

// 다른 의원 보기·관리자 화면의 브라우저 → DB 함수 부르기(spec admin-view REQ-8005, design.md '브라우저 함수').
// 실제 Supabase에 붙지 않는다. 어느 함수에 어떤 값이 몇 번 나가는지와 답을 바꾼 모양만 본다. 권한은 supabase/adminView.rls.test.ts가 증명한다
const { from, rpc, supabaseBrowser } = vi.hoisted(() => {
  const from = vi.fn()
  const rpc = vi.fn()
  const supabaseBrowser = vi.fn(() => ({ from, rpc }))
  return { from, rpc, supabaseBrowser }
})
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser }))

const RAW = 'permission denied for function start_admin_view (secret detail)'
const KEY = '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b'
const H1 = '11111111-1111-4111-8111-111111111111'
const H2 = '22222222-2222-4222-8222-222222222222'

const HOSPITAL_ROWS = [
  { hospital_id: H1, name: '가짜 정형외과의원', address: '서울 가짜구 가짜로 1', region_set: false, region: null, is_me: true },
  { hospital_id: H2, name: '예시 정형외과의원', address: null, region_set: true, region: null, is_me: false },
  { hospital_id: 'h3', name: '보기 정형외과의원', address: '경기도 예시시 예시로 45', region_set: true, region: '경기', is_me: false },
]

const LOG_ROWS = [
  { started_at: '2026-11-24T00:12:00+00:00', viewer_name: '가짜 정형외과의원', viewer_email: 'boss@fake.test', hospital_id: H2, hospital_name: '예시 정형외과의원' },
  { started_at: '2026-11-23T05:00:00+00:00', viewer_name: null, viewer_email: null, hospital_id: 'h3', hospital_name: '보기 정형외과의원' },
]

beforeEach(() => {
  from.mockReset()
  rpc.mockReset()
  rpc.mockResolvedValue({ data: null, error: null, status: 204 })
  supabaseBrowser.mockClear()
})

/** 다섯 함수 모두: 실패 셋(오류 답·던짐·클라이언트 만들기 실패)은 AdminViewError, 원래 글은 cause에만, 다시 부르지 않는다 */
const CALLS = [
  ['startAdminView', () => startAdminView(H2)],
  ['stopAdminView', () => stopAdminView()],
  ['listViewHospitals', () => listViewHospitals()],
  ['readViewLog', () => readViewLog()],
  ['setHospitalRegion', () => setHospitalRegion(H2, '서울')],
] as const

async function caught(run: () => Promise<unknown>): Promise<Error> {
  const thrown = await run().then(
    () => undefined,
    (e: unknown) => e,
  )
  expect(thrown).toBeInstanceOf(AdminViewError)
  return thrown as Error
}

describe('startAdminView(): 보기 시작(rpc start_admin_view → 보기 열쇠)', () => {
  it('AC-8005.1: start_admin_view({ p_hospital_id })를 한 번만 부르고 표는 쓰지 않으며 열쇠 uuid를 준다', async () => {
    rpc.mockResolvedValue({ data: KEY, error: null, status: 200 })
    await expect(startAdminView(H2)).resolves.toBe(KEY)
    expect(rpc).toHaveBeenCalledExactlyOnceWith('start_admin_view', { p_hospital_id: H2 })
    expect(from).not.toHaveBeenCalled()
  })

  it('AC-8005.1: 대문자로 온 열쇠는 소문자로 준다(쿠키 열쇠 모양과 같게)', async () => {
    rpc.mockResolvedValue({ data: KEY.toUpperCase(), error: null, status: 200 })
    await expect(startAdminView(H2)).resolves.toBe(KEY)
  })

  it.each([
    ['null', null],
    ['빈 글', ''],
    ['uuid 모양이 아닌 글', 'not-a-key'],
    ['숫자', 12],
    ['목록', [KEY]],
    ['줄 객체', { start_admin_view: KEY }],
  ] as const)('AC-8005.1: 답이 %s이면 AdminViewError', async (_name, data) => {
    rpc.mockResolvedValue({ data, error: null, status: 200 })
    await caught(() => startAdminView(H2))
    expect(rpc).toHaveBeenCalledTimes(1)
  })
})

describe('stopAdminView(): 보기 끝(rpc stop_admin_view)', () => {
  it('AC-8005.1: stop_admin_view를 인자 없이 한 번만 부르고 표는 쓰지 않는다', async () => {
    await expect(stopAdminView()).resolves.toBeUndefined()
    expect(rpc).toHaveBeenCalledExactlyOnceWith('stop_admin_view')
    expect(from).not.toHaveBeenCalled()
  })
})

describe('listViewHospitals(): 보는 의원 판·의원 비교의 의원 목록(rpc admin_view_hospitals)', () => {
  it('AC-8005.1: admin_view_hospitals를 인자 없이 한 번만 부르고 표는 쓰지 않는다', async () => {
    rpc.mockResolvedValue({ data: HOSPITAL_ROWS, error: null, status: 200 })
    await listViewHospitals()
    expect(rpc).toHaveBeenCalledExactlyOnceWith('admin_view_hospitals')
    expect(from).not.toHaveBeenCalled()
  })

  it('AC-8005.1: 줄을 ViewHospital 모양으로 바꾸고 받은 차례 그대로 둔다(정했는데 region null = 지역 모름으로 정함)', async () => {
    rpc.mockResolvedValue({ data: HOSPITAL_ROWS, error: null, status: 200 })
    const expected: ViewHospital[] = [
      { hospitalId: H1, name: '가짜 정형외과의원', address: '서울 가짜구 가짜로 1', regionSet: false, region: null, mine: true },
      { hospitalId: H2, name: '예시 정형외과의원', address: null, regionSet: true, region: null, mine: false },
      { hospitalId: 'h3', name: '보기 정형외과의원', address: '경기도 예시시 예시로 45', regionSet: true, region: '경기', mine: false },
    ]
    await expect(listViewHospitals()).resolves.toEqual(expected)
  })

  it('AC-8005.1: 승인된 의원이 없으면 빈 목록', async () => {
    rpc.mockResolvedValue({ data: [], error: null, status: 200 })
    await expect(listViewHospitals()).resolves.toEqual([])
  })

  const good = HOSPITAL_ROWS[0]
  it.each([
    ['답이 목록이 아님', { rows: null }],
    ['답이 객체 하나', { rows: good }],
    ['줄이 null', { rows: [good, null] }],
    ['줄이 글', { rows: ['h1'] }],
    ['hospital_id 없음', { rows: [{ ...good, hospital_id: undefined }] }],
    ['hospital_id 빈 글', { rows: [{ ...good, hospital_id: '' }] }],
    ['name 숫자', { rows: [{ ...good, name: 1 }] }],
    ['name null', { rows: [{ ...good, name: null }] }],
    ['address 숫자', { rows: [{ ...good, address: 3 }] }],
    ['address 칸 없음', { rows: [{ ...good, address: undefined }] }],
    ['region_set 글', { rows: [{ ...good, region_set: 'true' }] }],
    ['region 숫자', { rows: [{ ...good, region: 11 }] }],
    ['region 칸 없음', { rows: [{ ...good, region: undefined }] }],
    ['is_me null', { rows: [{ ...good, is_me: null }] }],
  ] as const)('AC-8005.1: %s이면 반쪽 목록 대신 AdminViewError', async (_name, { rows }) => {
    rpc.mockResolvedValue({ data: rows, error: null, status: 200 })
    await caught(() => listViewHospitals())
    expect(rpc).toHaveBeenCalledTimes(1)
  })
})

describe('readViewLog(): 본 기록(rpc admin_view_log)', () => {
  it('AC-8005.1: admin_view_log를 인자 없이 한 번만 부르고 표는 쓰지 않는다', async () => {
    rpc.mockResolvedValue({ data: LOG_ROWS, error: null, status: 200 })
    await readViewLog()
    expect(rpc).toHaveBeenCalledExactlyOnceWith('admin_view_log')
    expect(from).not.toHaveBeenCalled()
  })

  it('AC-8005.1: 줄을 ViewLogRow 모양으로 바꾸고 받은 차례(최근 먼저) 그대로 둔다', async () => {
    rpc.mockResolvedValue({ data: LOG_ROWS, error: null, status: 200 })
    const expected: ViewLogRow[] = [
      { startedAt: '2026-11-24T00:12:00+00:00', viewerName: '가짜 정형외과의원', viewerEmail: 'boss@fake.test', hospitalId: H2, hospitalName: '예시 정형외과의원' },
      { startedAt: '2026-11-23T05:00:00+00:00', viewerName: null, viewerEmail: null, hospitalId: 'h3', hospitalName: '보기 정형외과의원' },
    ]
    await expect(readViewLog()).resolves.toEqual(expected)
  })

  it('AC-8005.1: 기록이 없으면 빈 목록', async () => {
    rpc.mockResolvedValue({ data: [], error: null, status: 200 })
    await expect(readViewLog()).resolves.toEqual([])
  })

  const good = LOG_ROWS[0]
  it.each([
    ['답이 목록이 아님', { rows: null }],
    ['줄이 null', { rows: [null] }],
    ['started_at 없음', { rows: [{ ...good, started_at: undefined }] }],
    ['started_at 빈 글', { rows: [{ ...good, started_at: '' }] }],
    ['viewer_name 숫자', { rows: [{ ...good, viewer_name: 0 }] }],
    ['viewer_email 칸 없음', { rows: [{ ...good, viewer_email: undefined }] }],
    ['hospital_id null', { rows: [{ ...good, hospital_id: null }] }],
    ['hospital_name null', { rows: [{ ...good, hospital_name: null }] }],
  ] as const)('AC-8005.1: %s이면 반쪽 목록 대신 AdminViewError', async (_name, { rows }) => {
    rpc.mockResolvedValue({ data: rows, error: null, status: 200 })
    await caught(() => readViewLog())
    expect(rpc).toHaveBeenCalledTimes(1)
  })
})

describe('setHospitalRegion(): 지역 고치기(rpc set_hospital_region)', () => {
  it('AC-8005.1: set_hospital_region({ p_hospital_id, p_sido })를 한 번만 부르고 표는 쓰지 않는다', async () => {
    await expect(setHospitalRegion(H2, '전남')).resolves.toBeUndefined()
    expect(rpc).toHaveBeenCalledExactlyOnceWith('set_hospital_region', { p_hospital_id: H2, p_sido: '전남' })
    expect(from).not.toHaveBeenCalled()
  })

  it("AC-8005.1: '지역 모름'은 p_sido null로 보낸다", async () => {
    await setHospitalRegion(H1, null)
    expect(rpc).toHaveBeenCalledExactlyOnceWith('set_hospital_region', { p_hospital_id: H1, p_sido: null })
  })
})

describe('다섯 함수의 실패: 모두 AdminViewError, 원래 글은 cause에만, 저절로 다시 부르지 않는다', () => {
  it.each(CALLS)('AC-8005.1: %s — 답 오류', async (_name, run) => {
    const error = { code: '42501', message: RAW }
    rpc.mockResolvedValue({ data: null, error, status: 403 })
    const thrown = await caught(run)
    expect(thrown.message).not.toContain('secret detail')
    expect(thrown.cause).toBe(error)
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it.each(CALLS)('AC-8005.1: %s — 요청이 던짐', async (_name, run) => {
    const cause = new Error(`fetch failed ${RAW}`)
    rpc.mockRejectedValue(cause)
    const thrown = await caught(run)
    expect(thrown.message).not.toContain('secret detail')
    expect(thrown.cause).toBe(cause)
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it.each(CALLS)('AC-8005.1: %s — 클라이언트를 만들지 못함', async (_name, run) => {
    const cause = new Error(`NEXT_PUBLIC_SUPABASE_URL 없음 ${RAW}`)
    supabaseBrowser.mockImplementationOnce(() => {
      throw cause
    })
    const thrown = await caught(run)
    expect(thrown.message).not.toContain('secret detail')
    expect(thrown.cause).toBe(cause)
    expect(rpc).not.toHaveBeenCalled()
  })
})
