// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { errorInfo } from '@/lib/errors'
import { readContactCount } from '@/lib/storage/contactCounts'
import { PatientsStorageError } from '@/lib/storage/messageTemplates'
import { supabaseBrowser } from '@/lib/supabase/browser'
import { CountsOnly } from './CountsOnly'

// 확장 없는 곳·휴대폰(AC-610.3, 목업 countsView). 숫자는 서버 줄의 값만 그린다. 가짜 Supabase만 쓴다
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: vi.fn(() => ({ fake: 'client' })) }))
vi.mock('@/lib/storage/contactCounts', () => ({ readContactCount: vi.fn() }))

const read = vi.mocked(readContactCount)
const client = vi.mocked(supabaseBrowser)
const failure = () => new PatientsStorageError('E-PATIENTS-COUNTS-READ')
const ROW = { followup_left: 5, injection_left: 2, updated_at: '2026-11-03T23:42:00+00:00' }
const NO_DATA = '자료 없음'
const NO_DATA_HELP = '비트 PC에서 환자 탭을 열면 건수가 생겨요'

beforeEach(() => {
  read.mockReset()
  client.mockClear()
})
afterEach(cleanup)

describe('CountsOnly', () => {
  it('AC-610.3: 줄이 있으면 두 수와 마지막 바뀐 시각(한국 시각)을 보인다', async () => {
    read.mockResolvedValue(ROW)
    render(<CountsOnly />)
    expect(await screen.findByText('5')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: '이 PC에서는 남은 건수만 볼 수 있어요' })).toBeTruthy()
    expect(screen.getByText('환자 이름과 전화는 비트 PC(비트가 깔린 의원 PC)에서만 보여요.')).toBeTruthy()
    expect(screen.getByText('F/U 명단').parentElement?.textContent).toBe('F/U 명단5명내일 오실 분 중 아직 연락 안 한 분')
    expect(screen.getByText('정기 주사 문자 명단').parentElement?.textContent).toBe('정기 주사 문자 명단2명주사 날짜가 오늘까지 왔는데 아직 연락 안 한 분')
    // 2026-11-03 23:42 UTC = 한국 11월 4일 (수) 08:42
    expect(screen.getByText('마지막으로 바뀐 때 2026년 11월 4일 (수) 08:42 · 비트 PC에서 환자 탭을 열 때마다 새로 바뀌어요.')).toBeTruthy()
    expect(screen.queryByText(NO_DATA)).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-610.3: 줄이 있고 수가 0이면 "자료 없음"이 아니라 0명이다', async () => {
    read.mockResolvedValue({ ...ROW, followup_left: 0, injection_left: 0 })
    render(<CountsOnly />)
    await screen.findByText('F/U 명단')
    expect(screen.getAllByText('0')).toHaveLength(2)
    expect(screen.queryByText(NO_DATA)).toBeNull()
  })

  it('AC-610.3: 줄이 없으면 숫자 없이 "자료 없음"과 안내만 보인다', async () => {
    read.mockResolvedValue(null)
    const { container } = render(<CountsOnly />)
    expect(await screen.findByText(NO_DATA)).toBeTruthy()
    expect(container.textContent).toContain(NO_DATA_HELP)
    expect(container.textContent).not.toMatch(/\d/)
    expect(screen.queryByText('F/U 명단')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-610.3: 읽기 실패는 오류 카드(errors.ts 글·번호)와 [다시 불러오기]이고 "자료 없음"도 숫자도 없다', async () => {
    read.mockRejectedValue(failure())
    const { container } = render(<CountsOnly />)
    const alert = await screen.findByRole('alert')
    const info = errorInfo('E-PATIENTS-COUNTS-READ')
    expect(alert.textContent).toContain(info.what)
    expect(alert.textContent).toContain(info.fix)
    expect(alert.textContent).toContain('오류 번호 E-PATIENTS-COUNTS-READ')
    expect(screen.getByRole('button', { name: '다시 불러오기' })).toBeTruthy()
    expect(screen.queryByText(NO_DATA)).toBeNull()
    expect(container.textContent).not.toContain(NO_DATA_HELP)
    expect(screen.queryByText('F/U 명단')).toBeNull()
    expect(container.textContent?.replace('오류 번호 E-PATIENTS-COUNTS-READ', '')).not.toMatch(/\d/)
  })

  it('AC-610.3: [다시 불러오기]는 한 번 더 읽고 결과로 바꾼다', async () => {
    const user = userEvent.setup()
    read.mockRejectedValueOnce(failure()).mockResolvedValueOnce(ROW)
    render(<CountsOnly />)
    await user.click(await screen.findByRole('button', { name: '다시 불러오기' }))
    expect(await screen.findByText('5')).toBeTruthy()
    expect(read).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('button', { name: '다시 불러오기' })).toBeNull()
  })

  it('AC-610.3: 다시 읽어도 줄이 없으면 그때 "자료 없음"이다(읽는 동안은 숫자도 "자료 없음"도 없다)', async () => {
    const user = userEvent.setup()
    let answer: (value: null) => void = () => {}
    read.mockRejectedValueOnce(failure()).mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
    render(<CountsOnly />)
    await user.click(await screen.findByRole('button', { name: '다시 불러오기' }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByText(NO_DATA)).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('남은 건수를 불러오는 중이에요')
    answer(null)
    expect(await screen.findByText(NO_DATA)).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('AC-610.3: 읽는 동안은 숫자·"자료 없음"·오류를 보이지 않는다', () => {
    read.mockReturnValue(new Promise(() => {}))
    const { container } = render(<CountsOnly />)
    expect(container.textContent).not.toMatch(/\d/)
    expect(screen.queryByText(NO_DATA)).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-610.3: 클라이언트를 만들지 못해도 "자료 없음"이 아니라 오류 카드다', async () => {
    client.mockImplementationOnce(() => {
      throw new Error('환경 변수 없음')
    })
    render(<CountsOnly />)
    expect((await screen.findByRole('alert')).textContent).toContain('오류 번호 E-PATIENTS-COUNTS-READ')
    expect(screen.queryByText(NO_DATA)).toBeNull()
    expect(screen.queryByText(/환경 변수/)).toBeNull()
  })

  it('AC-610.3: 문자 문구는 여기서도 열 수 있다(주소에는 도구 이름만)', async () => {
    read.mockResolvedValue(null)
    render(<CountsOnly />)
    await screen.findByText(NO_DATA)
    expect(screen.getByText('문자 문구는 여기서도 고칠 수 있어요')).toBeTruthy()
    expect(screen.getByRole('link', { name: '문자 문구 열기' }).getAttribute('href')).toBe('/patients?tool=messages')
  })

  it('AC-610.4: 다른 창 작업 중에서 왔으면 받은 단추를 건수와 문자 문구 줄 사이에 그린다', async () => {
    read.mockResolvedValue(ROW)
    render(<CountsOnly action={<button type="button">다시 확인</button>} />)
    await screen.findByText('5')
    const action = screen.getByRole('button', { name: '다시 확인' })
    const counts = screen.getByText(/마지막으로 바뀐 때/)
    const more = screen.getByText('문자 문구는 여기서도 고칠 수 있어요')
    expect(counts.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(action.compareDocumentPosition(more) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('AC-610.3: 건수 읽기를 화면을 떠난 뒤 끝내도 아무 일도 없다', async () => {
    let answer: (value: typeof ROW) => void = () => {}
    read.mockReturnValue(new Promise((resolve) => (answer = resolve)))
    const { unmount } = render(<CountsOnly />)
    unmount()
    answer(ROW)
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('5')).toBeNull()
  })
})
