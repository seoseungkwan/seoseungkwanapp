// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ourClinicPhrases } from '@/lib/precheck/memo'
import { DxLinks } from './DxLinks'

// 설정의 '상병 연결표' 칸(AC-018.7·AC-018.18). 저장은 phrases(NOT NULL)를 함께 쓰므로 문구 없는 병원은 저장 단추가 없다

const db = vi.hoisted(() => ({ row: null as { phrases: unknown; dx_links: unknown[] } | null, upserts: [] as unknown[], failWrite: false }))
vi.mock('@/lib/supabase/browser', () => ({
  supabaseBrowser: () => ({
    from: () => ({
      select: () => ({ maybeSingle: () => Promise.resolve({ data: db.row, error: null }) }),
      upsert: (value: unknown) => {
        if (db.failWrite) return Promise.resolve({ data: null, error: { message: 'x' } })
        db.upserts.push(value)
        return Promise.resolve({ data: null, error: null })
      },
    }),
  }),
}))

beforeEach(() => {
  db.row = { phrases: ourClinicPhrases(), dx_links: [['LA358', 'M751', '가상 상병', 0, 's']] }
  db.upserts = []
  db.failWrite = false
})
afterEach(cleanup)

describe('AC-018.18 상병 연결표', () => {
  it.each([
    ['줄 없음', null],
    ['빈 {}', { phrases: {}, dx_links: [] }],
  ])('AC-018.18: %s면 저장 단추가 없고 아래 글이 있으며 쓰지 않는다', async (_, row) => {
    db.row = row
    render(<DxLinks />)
    expect(await screen.findByText('처음 질문을 먼저 하면 저장할 수 있어요.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '저장' })).toBeNull()
    expect(db.upserts).toEqual([])
  })

  it('AC-018.7: 줄을 고쳐 저장하면 문구는 그대로이고 연결표만 바뀐다', async () => {
    const user = userEvent.setup()
    render(<DxLinks />)
    const code = await screen.findByLabelText('1번 줄 상병코드')
    await user.clear(code)
    await user.type(code, 'M170')
    await user.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(db.upserts).toHaveLength(1))
    expect(db.upserts[0]).toEqual({ phrases: ourClinicPhrases(), dx_links: [['LA358', 'M170', '가상 상병', 0, 's']] })
  })

  it('AC-018.7: 줄을 더하고 뺄 수 있다', async () => {
    const user = userEvent.setup()
    render(<DxLinks />)
    await screen.findByLabelText('1번 줄 상병코드')
    await user.click(screen.getByRole('button', { name: '줄 더하기' }))
    await user.type(screen.getByLabelText('2번 줄 처방코드'), 'KK090')
    await user.type(screen.getByLabelText('2번 줄 상병코드'), 'M170')
    await user.click(screen.getByRole('button', { name: '1번 줄 빼기' }))
    await user.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(db.upserts).toHaveLength(1))
    expect((db.upserts[0] as { dx_links: unknown[] }).dx_links).toEqual([['KK090', 'M170', '', 0, 's']])
  })

  it('AC-018.7: 저장 실패면 값을 그대로 두고 [다시 저장]이다', async () => {
    const user = userEvent.setup()
    db.failWrite = true
    render(<DxLinks />)
    const code = (await screen.findByLabelText('1번 줄 상병코드')) as HTMLInputElement
    await user.clear(code)
    await user.type(code, 'M170')
    await user.click(screen.getByRole('button', { name: '저장' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(code.value).toBe('M170')
    expect(screen.getByRole('button', { name: '다시 저장' })).toBeTruthy()
  })
})
