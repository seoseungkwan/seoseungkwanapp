// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useClinicProfile, type ClinicProfileView } from '@/components/clinic/useClinicProfile'
import { createStaffStore, defaultStaffSettings, StaffStoreError, type StaffStore } from '@/lib/storage/staff'
import { createStaffFileStore, type StaffFileStore } from '@/lib/storage/staffFiles'
import { defaultProfile } from '@/lib/storage/clinicProfile'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { StaffMember, StaffSettings, WeekPlan } from '@/types/staff'
import { useStaffBase } from './useStaffBase'

// 직원 탭 공용 읽기 훅(spec staff design.md 6절 '공용', AC-7610.1). 직원·설정·기본 근무를 함께 읽고 병원 정보는 useClinicProfile을 그대로 준다.
// 저장 층·병원 정보 훅은 가짜다(기본 설정 defaultStaffSettings만 진짜). 사람은 지어낸 값이다

vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: vi.fn() }))
vi.mock('@/components/clinic/useClinicProfile', () => ({ useClinicProfile: vi.fn() }))
vi.mock('@/lib/storage/staff', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/storage/staff')>()
  return { ...real, createStaffStore: vi.fn(real.createStaffStore) }
})
vi.mock('@/lib/storage/staffFiles', () => ({ createStaffFileStore: vi.fn() }))

const CLIENT = { fake: 'client' } as unknown as ReturnType<typeof supabaseBrowser>
const MEMBER: StaffMember = {
  id: 'm1',
  name: '김하늘',
  job: '간호사',
  jobOther: null,
  employment: 'regular',
  weeklyHours: 40,
  hiredOn: '2021-03-02',
  leftOn: null,
  phone: null,
  birthday: null,
  address: null,
  bank: null,
  accountNo: null,
  calendarStaffId: null,
  memo: null,
  usedBefore: 0,
  usedBeforeFrom: null,
}
const SETTINGS: StaffSettings = { ...defaultStaffSettings(), leaveBasis: 'jan1' }
const PLAN: WeekPlan = { id: 'p1', staffId: 'm1', from: '2021-03-02', week: [null, null, null, null, null, null, null], sat: 'every' }

const listMembers = vi.fn<StaffStore['listMembers']>()
const loadSettings = vi.fn<StaffStore['loadSettings']>()
const listPlans = vi.fn<StaffStore['listPlans']>()
const STORE = { listMembers, loadSettings, listPlans } as unknown as StaffStore
const FILES = { listFiles: vi.fn() } as unknown as StaffFileStore
const clinicReload = vi.fn()
const CLINIC: ClinicProfileView = {
  state: 'ready',
  profile: defaultProfile(),
  saved: true,
  signupName: '가짜의원',
  signupPhone: null,
  name: '가짜의원',
  logoDataUrl: null,
  reload: clinicReload,
}

beforeEach(() => {
  vi.mocked(supabaseBrowser).mockReset()
  vi.mocked(supabaseBrowser).mockReturnValue(CLIENT)
  vi.mocked(useClinicProfile).mockReset()
  vi.mocked(useClinicProfile).mockReturnValue(CLINIC)
  vi.mocked(createStaffStore).mockClear()
  vi.mocked(createStaffStore).mockReturnValue(STORE)
  vi.mocked(createStaffFileStore).mockReset()
  vi.mocked(createStaffFileStore).mockReturnValue(FILES)
  clinicReload.mockReset()
  listMembers.mockReset()
  loadSettings.mockReset()
  listPlans.mockReset()
  listMembers.mockResolvedValue([MEMBER])
  loadSettings.mockResolvedValue(SETTINGS)
  listPlans.mockResolvedValue([PLAN])
})
afterEach(cleanup)

describe('AC-7610.1 직원 탭 공용 읽기 useStaffBase', () => {
  it('AC-7610.1: 읽는 동안 loading(빈 명단·기본 설정), 다 읽으면 ready와 직원·설정·기본 근무. 저장 층과 병원 정보를 함께 준다', async () => {
    const { result } = renderHook(() => useStaffBase())
    expect(result.current.state).toBe('loading')
    expect(result.current.members).toEqual([])
    expect(result.current.plans).toEqual([])
    expect(result.current.settings).toEqual(defaultStaffSettings())
    await waitFor(() => expect(result.current.state).toBe('ready'))
    expect(result.current.members).toEqual([MEMBER])
    expect(result.current.settings).toEqual(SETTINGS)
    expect(result.current.plans).toEqual([PLAN])
    expect(result.current.store).toBe(STORE)
    expect(result.current.files).toBe(FILES)
    expect(result.current.clinic).toBe(CLINIC)
    expect(createStaffStore).toHaveBeenCalledTimes(1)
    expect(createStaffStore).toHaveBeenCalledWith(CLIENT)
    expect(createStaffFileStore).toHaveBeenCalledWith(CLIENT)
    expect(listMembers).toHaveBeenCalledTimes(1)
  })

  it('AC-7610.1: 셋 중 하나라도 실패하면 failed(빈 명단)이고 reload로 셋을 다시 읽는다 — 병원 정보도 다시 읽는다', async () => {
    loadSettings.mockRejectedValueOnce(new StaffStoreError('E-STAFF-READ-FAILED'))
    const { result } = renderHook(() => useStaffBase())
    await waitFor(() => expect(result.current.state).toBe('failed'))
    expect(result.current.members).toEqual([])
    act(() => result.current.reload())
    expect(result.current.state).toBe('loading')
    expect(clinicReload).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(result.current.state).toBe('ready'))
    expect(result.current.settings).toEqual(SETTINGS)
    expect(listMembers).toHaveBeenCalledTimes(2)
    expect(loadSettings).toHaveBeenCalledTimes(2)
    expect(listPlans).toHaveBeenCalledTimes(2)
  })

  it('AC-7610.1: 저장 뒤 reload하는 동안은 앞서 읽은 값을 그대로 보이고(화면이 비지 않게) 새 답이 오면 바꾼다', async () => {
    const { result } = renderHook(() => useStaffBase())
    await waitFor(() => expect(result.current.state).toBe('ready'))
    let finish!: (members: StaffMember[]) => void
    listMembers.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
    act(() => result.current.reload())
    expect(result.current.state).toBe('ready')
    expect(result.current.members).toEqual([MEMBER])
    const renamed = { ...MEMBER, name: '김하늘2' }
    await act(async () => finish([renamed]))
    expect(result.current.members).toEqual([renamed])
  })

  it('AC-7610.1: 늦게 온 앞 읽기의 답은 버린다', async () => {
    let first!: (members: StaffMember[]) => void
    listMembers.mockImplementationOnce(() => new Promise((resolve) => (first = resolve)))
    const { result } = renderHook(() => useStaffBase())
    act(() => result.current.reload())
    await waitFor(() => expect(result.current.state).toBe('ready'))
    await act(async () => first([{ ...MEMBER, name: '옛값' }]))
    expect(result.current.members).toEqual([MEMBER])
  })

  it('AC-7610.1: 클라이언트를 만들다 던지면(설정 없는 환경) failed이고, 저장 층은 번호(E-STAFF-*)로만 거절한다', async () => {
    vi.mocked(supabaseBrowser).mockImplementation(() => {
      throw new Error('no env')
    })
    vi.mocked(createStaffStore).mockImplementation((await vi.importActual<typeof import('@/lib/storage/staff')>('@/lib/storage/staff')).createStaffStore)
    const { result } = renderHook(() => useStaffBase())
    await waitFor(() => expect(result.current.state).toBe('failed'))
    await expect(result.current.store.listMembers()).rejects.toMatchObject({ code: 'E-STAFF-READ-FAILED' })
    await expect(result.current.store.saveMember(MEMBER)).rejects.toMatchObject({ code: 'E-STAFF-SAVE-FAILED' })
  })

  it('AC-7610.1: 같은 읽기 결과면 다시 그려도 같은 값을 준다(쓰는 쪽 effect가 그릴 때마다 돌지 않게)', async () => {
    const { result, rerender } = renderHook(() => useStaffBase())
    await waitFor(() => expect(result.current.state).toBe('ready'))
    const before = result.current
    rerender()
    expect(result.current).toBe(before)
  })
})
