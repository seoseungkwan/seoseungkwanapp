// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultProfile, downloadLogo, loadClinicProfile, loadSignup, loadSignupEmr } from '@/lib/storage/clinicProfile'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { ClinicProfile } from '@/types/clinicProfile'
import { useClinicProfile } from './useClinicProfile'

// 병원 정보 공용 훅(spec clinic-profile design.md 2절, TASK-2 · 가입 EMR 기본값은 spec emr-signup design.md 2절). 서식·문자·통계·대시보드·설정이 쓴다.
// 저장 코드는 가짜다(기본값 defaultProfile만 진짜). 이름·전화·로고는 모두 지어낸 값이다

vi.mock('@/lib/storage/clinicProfile', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/clinicProfile')>()),
  loadClinicProfile: vi.fn(),
  loadSignup: vi.fn(),
  loadSignupEmr: vi.fn(),
  downloadLogo: vi.fn(),
}))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: vi.fn(() => ({ fake: true })) }))

const LOGO_PATH = '11111111-2222-4333-8444-555555555555/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.png'
const DATA_URL = 'data:image/png;base64,iVBORw0KGgo='
const SAVED: ClinicProfile = { ...defaultProfile(), displayName: '가짜정형외과의원', phone: '0212345678', honorific: '선생님', logoPath: LOGO_PATH }
const SIGNUP = { name: '가짜의원(가입)', phone: '01012345678' }

beforeEach(() => {
  vi.mocked(loadClinicProfile).mockReset()
  vi.mocked(loadSignup).mockReset()
  vi.mocked(loadSignupEmr).mockReset()
  vi.mocked(downloadLogo).mockReset()
  vi.mocked(supabaseBrowser).mockClear()
  vi.mocked(loadClinicProfile).mockResolvedValue(SAVED)
  vi.mocked(loadSignup).mockResolvedValue(SIGNUP)
  vi.mocked(loadSignupEmr).mockResolvedValue(null)
  vi.mocked(downloadLogo).mockResolvedValue(DATA_URL)
})
afterEach(cleanup)

describe('AC-6602.2·AC-6602.7 병원 정보 공용 훅 useClinicProfile', () => {
  it('AC-6602.7: 읽는 동안 loading(기본값), 다 읽으면 ready와 저장한 값·가입 이름. 이름은 병원 정보 이름이 먼저다', async () => {
    const { result } = renderHook(() => useClinicProfile())
    expect(result.current.state).toBe('loading')
    expect(result.current.profile).toEqual(defaultProfile())
    await waitFor(() => expect(result.current.state).toBe('ready'))
    expect(result.current.profile).toEqual(SAVED)
    expect(result.current.saved).toBe(true)
    expect(result.current.signupName).toBe('가짜의원(가입)')
    expect(result.current.signupPhone).toBe('01012345678')
    expect(result.current.name).toBe('가짜정형외과의원')
    expect(loadClinicProfile).toHaveBeenCalledWith({ fake: true })
    expect(loadSignup).toHaveBeenCalledWith({ fake: true })
  })

  it('AC-6602.2: 줄이 없으면 ready·saved 거짓·기본값이고, 이름은 가입 이름이다', async () => {
    vi.mocked(loadClinicProfile).mockResolvedValue(null)
    const { result } = renderHook(() => useClinicProfile())
    await waitFor(() => expect(result.current.state).toBe('ready'))
    expect(result.current.saved).toBe(false)
    expect(result.current.profile).toEqual(defaultProfile())
    expect(result.current.name).toBe('가짜의원(가입)')
    expect(result.current.logoDataUrl).toBeNull()
  })

  it('AC-6602.2: 병원 정보 이름이 비었으면 가입 이름, 가입 이름도 못 읽으면 빈 글자다', async () => {
    vi.mocked(loadClinicProfile).mockResolvedValue({ ...SAVED, displayName: null })
    vi.mocked(loadSignup).mockResolvedValue(null)
    const { result } = renderHook(() => useClinicProfile())
    await waitFor(() => expect(result.current.state).toBe('ready'))
    expect(result.current.name).toBe('')
    expect(result.current.signupName).toBe('')
    expect(result.current.signupPhone).toBeNull()
  })

  it('AC-6602.7: 읽기 실패는 failed(기본값·saved 거짓, 쓰는 쪽은 줄 없음처럼)이고 [다시 불러오기](reload)로 다시 읽는다', async () => {
    vi.mocked(loadClinicProfile).mockResolvedValueOnce('failed')
    const { result } = renderHook(() => useClinicProfile())
    await waitFor(() => expect(result.current.state).toBe('failed'))
    expect(result.current.saved).toBe(false)
    expect(result.current.profile).toEqual(defaultProfile())
    expect(result.current.name).toBe('가짜의원(가입)')
    act(() => result.current.reload())
    expect(result.current.state).toBe('loading')
    await waitFor(() => expect(result.current.state).toBe('ready'))
    expect(result.current.profile).toEqual(SAVED)
    expect(loadClinicProfile).toHaveBeenCalledTimes(2)
  })

  it('AC-6602.7: 클라이언트를 만들다 던지거나 읽기가 거절돼도 failed다', async () => {
    vi.mocked(supabaseBrowser).mockImplementationOnce(() => {
      throw new Error('no env')
    })
    const first = renderHook(() => useClinicProfile())
    await waitFor(() => expect(first.result.current.state).toBe('failed'))
    vi.mocked(loadClinicProfile).mockRejectedValueOnce(new Error('boom'))
    const second = renderHook(() => useClinicProfile())
    await waitFor(() => expect(second.result.current.state).toBe('failed'))
  })

  it('AC-6604.2: 로고를 달라고 하면 로고까지 받은 뒤에 ready이고 logoDataUrl에 data: 글이 온다', async () => {
    let finish!: (url: string | null) => void
    vi.mocked(downloadLogo).mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
    const { result } = renderHook(() => useClinicProfile({ logo: true }))
    await waitFor(() => expect(downloadLogo).toHaveBeenCalledWith({ fake: true }, LOGO_PATH))
    expect(result.current.state).toBe('loading')
    await act(async () => finish(DATA_URL))
    expect(result.current.state).toBe('ready')
    expect(result.current.logoDataUrl).toBe(DATA_URL)
  })

  it('AC-6604.2: 로고 받기가 실패하면 ready이고 logoDataUrl은 null(이름 글자로 그린다)', async () => {
    vi.mocked(downloadLogo).mockResolvedValueOnce(null)
    const { result } = renderHook(() => useClinicProfile({ logo: true }))
    await waitFor(() => expect(result.current.state).toBe('ready'))
    expect(result.current.logoDataUrl).toBeNull()
    vi.mocked(downloadLogo).mockRejectedValueOnce(new Error('boom'))
    const again = renderHook(() => useClinicProfile({ logo: true }))
    await waitFor(() => expect(again.result.current.state).toBe('ready'))
    expect(again.result.current.logoDataUrl).toBeNull()
  })

  it('AC-6604.2: 로고를 달라고 하지 않거나 로고가 없으면 받지 않는다', async () => {
    const plain = renderHook(() => useClinicProfile())
    await waitFor(() => expect(plain.result.current.state).toBe('ready'))
    expect(plain.result.current.logoDataUrl).toBeNull()
    vi.mocked(loadClinicProfile).mockResolvedValue({ ...SAVED, logoPath: null })
    const none = renderHook(() => useClinicProfile({ logo: true }))
    await waitFor(() => expect(none.result.current.state).toBe('ready'))
    expect(downloadLogo).not.toHaveBeenCalled()
  })
})

describe('AC-7302.3 병원 정보 줄이 없을 때 가입 때 고른 EMR', () => {
  it('AC-7302.3: 줄이 없고(ready, saved 거짓) 가입 EMR이 있으면 profile.emr이 그 EMR이고, 다른 칸·이름은 지금 기본값 그대로다', async () => {
    vi.mocked(loadClinicProfile).mockResolvedValue(null)
    vi.mocked(loadSignupEmr).mockResolvedValue('egis')
    const { result } = renderHook(() => useClinicProfile())
    await waitFor(() => expect(result.current.state).toBe('ready'))
    expect(result.current.saved).toBe(false)
    expect(result.current.profile).toEqual({ ...defaultProfile(), emr: 'egis' })
    expect(result.current.name).toBe('가짜의원(가입)')
    expect(loadSignupEmr).toHaveBeenCalledExactlyOnceWith({ fake: true })
  })

  it.each(['bit', 'uisarang'] as const)("AC-7302.3: 줄이 있으면 줄의 emr('%s')이 이긴다(가입 EMR은 함께 읽어도 쓰지 않는다)", async (emr) => {
    vi.mocked(loadClinicProfile).mockResolvedValue({ ...SAVED, emr })
    vi.mocked(loadSignupEmr).mockResolvedValue('egis')
    const { result } = renderHook(() => useClinicProfile())
    await waitFor(() => expect(result.current.state).toBe('ready'))
    expect(result.current.saved).toBe(true)
    expect(result.current.profile).toEqual({ ...SAVED, emr })
    expect(loadSignupEmr).toHaveBeenCalledExactlyOnceWith({ fake: true })
  })

  it("AC-7302.3: 읽기 실패(failed)면 가입 EMR이 있어도 'bit'(기본값)다", async () => {
    vi.mocked(loadClinicProfile).mockResolvedValue('failed')
    vi.mocked(loadSignupEmr).mockResolvedValue('egis')
    const { result } = renderHook(() => useClinicProfile())
    await waitFor(() => expect(result.current.state).toBe('failed'))
    expect(result.current.saved).toBe(false)
    expect(result.current.profile).toEqual(defaultProfile())
  })

  it("AC-7302.3: 줄이 없고 가입 EMR이 null이거나 가입 EMR 읽기가 거절되면 'bit'이고 상태는 ready다", async () => {
    vi.mocked(loadClinicProfile).mockResolvedValue(null)
    const none = renderHook(() => useClinicProfile())
    await waitFor(() => expect(none.result.current.state).toBe('ready'))
    expect(none.result.current.profile).toEqual(defaultProfile())
    vi.mocked(loadSignupEmr).mockRejectedValueOnce(new Error('boom'))
    const thrown = renderHook(() => useClinicProfile())
    await waitFor(() => expect(thrown.result.current.state).toBe('ready'))
    expect(thrown.result.current.profile).toEqual(defaultProfile())
    expect(thrown.result.current.saved).toBe(false)
  })

  it('AC-7302.3: 세 읽기를 함께 시작한다 — 병원 정보 줄을 기다리지 않고 가입 이름·가입 EMR을 부르고, 읽는 동안은 기본값이다', async () => {
    let finish!: (value: ClinicProfile | null) => void
    vi.mocked(loadClinicProfile).mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
    vi.mocked(loadSignupEmr).mockResolvedValue('other')
    const { result } = renderHook(() => useClinicProfile())
    await waitFor(() => expect(loadSignupEmr).toHaveBeenCalledWith({ fake: true }))
    expect(loadSignup).toHaveBeenCalledWith({ fake: true })
    expect(result.current.state).toBe('loading')
    expect(result.current.profile).toEqual(defaultProfile())
    await act(async () => finish(null))
    expect(result.current.state).toBe('ready')
    expect(result.current.profile.emr).toBe('other')
  })

  it('AC-7302.3: 다시 그려도 같은 읽기 결과면 같은 값을 주고, [다시 불러오기]는 가입 EMR도 다시 읽는다', async () => {
    vi.mocked(loadClinicProfile).mockResolvedValue(null)
    vi.mocked(loadSignupEmr).mockResolvedValueOnce('egis').mockResolvedValue('uisarang')
    const { result, rerender } = renderHook(() => useClinicProfile())
    await waitFor(() => expect(result.current.state).toBe('ready'))
    const first = result.current
    expect(first.profile.emr).toBe('egis')
    rerender()
    expect(result.current).toBe(first)
    expect(result.current.profile).toBe(first.profile)
    act(() => result.current.reload())
    await waitFor(() => expect(result.current.profile.emr).toBe('uisarang'))
    expect(loadSignupEmr).toHaveBeenCalledTimes(2)
  })
})
