// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { StaffFileUpload } from '@/lib/storage/staffFiles'
import { payDb, renderPay } from './payTestKit'

// '세무사 파일' 칸 (staff AC-7615.8, 시안 pay.html ⑥). 가짜 파일 저장 층 · 파일은 8월~11월(지어낸 이름)

afterEach(cleanup)

const monthBlocks = () => screen.getAllByRole('group').filter((g) => /^\d{4}-\d{2} 세무사 파일$/.test(g.getAttribute('aria-label') ?? ''))
const blockOf = (month: string) => screen.getByRole('group', { name: `${month} 세무사 파일` })
const picker = () => screen.getByLabelText('세무사 파일 고르기') as HTMLInputElement
const pick = async (...files: File[]) => {
  await act(async () => {
    fireEvent.change(picker(), { target: { files } })
  })
}

describe('AC-7615.8: 세무사 파일 보관', () => {
  it('AC-7615.8: 안내·올릴 달(보는 달)·[파일 올리기]·여러 파일 안내가 보인다', async () => {
    renderPay({ part: 'files' })
    expect(screen.getByText('세무사가 보낸 급여대장·명세서를 달마다 올려 두세요.')).toBeTruthy()
    expect((screen.getByRole('combobox', { name: '올릴 달' }) as HTMLSelectElement).value).toBe('2026-11')
    expect(screen.getByRole('button', { name: '파일 올리기' })).toBeTruthy()
    expect(screen.getByText('여러 파일을 한 번에 골라도 돼요. 이 칸으로 끌어다 놓아도 올라가요.')).toBeTruthy()
    expect(picker().multiple).toBe(true)
  })

  it('AC-7615.8: 새 달부터 세 달 묶음(머리 YYYY-MM · 파일 n개)과 줄(종류·이름·크기·올린 날·[받기]·[지우기])이 보인다', async () => {
    renderPay({ part: 'files' })
    await waitFor(() => expect(monthBlocks()).toHaveLength(3))
    expect(monthBlocks().map((g) => g.getAttribute('aria-label'))).toEqual(['2026-11 세무사 파일', '2026-10 세무사 파일', '2026-09 세무사 파일'])
    const nov = blockOf('2026-11')
    expect(within(nov).getByText('2026-11')).toBeTruthy()
    expect(within(nov).getByText('파일 2개')).toBeTruthy()
    const rows = within(nov).getAllByRole('listitem')
    expect(rows.map((li) => [...li.querySelectorAll('[data-cell]')].map((c) => c.textContent))).toEqual([
      ['PDF', '급여대장_11월.pdf', '214KB · 11월 20일 올림'],
      ['ZIP', '명세서_11월.zip', '1.3MB · 11월 20일 올림'],
    ])
    for (const li of rows) {
      expect(within(li).getByRole('button', { name: '받기' })).toBeTruthy()
      expect(within(li).getByRole('button', { name: '지우기' })).toBeTruthy()
    }
    expect(within(blockOf('2026-10')).getByText('파일 3개')).toBeTruthy()
  })

  it('AC-7615.8: [더 지난 달 보기]로 더 지난 달이 보인다', async () => {
    renderPay({ part: 'files' })
    await waitFor(() => expect(monthBlocks()).toHaveLength(3))
    fireEvent.click(screen.getByRole('button', { name: '더 지난 달 보기' }))
    expect(monthBlocks().map((g) => g.getAttribute('aria-label'))).toContain('2026-08 세무사 파일')
    expect(screen.queryByRole('button', { name: '더 지난 달 보기' })).toBeNull()
  })

  it('AC-7615.8: 고른 파일들을 고른 달로 올리고 목록을 다시 읽는다', async () => {
    const { callsOf } = renderPay({ part: 'files' })
    await waitFor(() => expect(monthBlocks()).toHaveLength(3))
    fireEvent.change(screen.getByRole('combobox', { name: '올릴 달' }), { target: { value: '2026-10' } })
    await pick(new File(['a'], '급여대장_보충.pdf', { type: 'application/pdf' }), new File(['b'], '명세서.xlsx'))
    await waitFor(() => expect(callsOf('uploadFile')).toHaveLength(2))
    expect(callsOf('uploadFile').map(([input]) => [(input as StaffFileUpload).kind, (input as { month: string }).month, (input as StaffFileUpload).file.name])).toEqual([
      ['tax', '2026-10', '급여대장_보충.pdf'],
      ['tax', '2026-10', '명세서.xlsx'],
    ])
    await waitFor(() => expect(within(blockOf('2026-10')).getByText('파일 5개')).toBeTruthy())
  })

  it('AC-7615.8: 끌어다 놓아도 올라간다. 받지 않는 종류·10MB 넘는 파일은 올리지 않고 E-STAFF-FILE-FAILED를 보인다', async () => {
    const { callsOf } = renderPay({ part: 'files' })
    await waitFor(() => expect(monthBlocks()).toHaveLength(3))
    const zone = screen.getByRole('group', { name: '세무사 파일 올리기' })
    const big = new File(['x'], '큰파일.pdf')
    Object.defineProperty(big, 'size', { value: 10_000_001 })
    await act(async () => {
      fireEvent.drop(zone, { dataTransfer: { files: [new File(['a'], '메모.txt'), big, new File(['c'], '대장.pdf')] } })
    })
    await waitFor(() => expect(callsOf('uploadFile')).toHaveLength(1))
    expect((callsOf('uploadFile')[0][0] as StaffFileUpload).file.name).toBe('대장.pdf')
    expect(screen.getByText('오류 번호 E-STAFF-FILE-FAILED')).toBeTruthy()
  })

  it('AC-7615.8: [지우기]는 "이 파일을 지울까요?"를 한 번 묻고 지운다. [받기]는 받는다', async () => {
    const { callsOf } = renderPay({ part: 'files' })
    await waitFor(() => expect(monthBlocks()).toHaveLength(3))
    const first = within(blockOf('2026-11')).getAllByRole('listitem')[0]
    await act(async () => {
      fireEvent.click(within(first).getByRole('button', { name: '받기' }))
    })
    expect(callsOf('downloadFile')).toHaveLength(1)
    fireEvent.click(within(first).getByRole('button', { name: '지우기' }))
    expect(within(first).getByText('이 파일을 지울까요?')).toBeTruthy()
    fireEvent.click(within(first).getByRole('button', { name: '그만두기' }))
    expect(callsOf('deleteFile')).toHaveLength(0)
    fireEvent.click(within(first).getByRole('button', { name: '지우기' }))
    await act(async () => {
      fireEvent.click(within(first).getAllByRole('button', { name: '지우기' }).at(-1)!)
    })
    await waitFor(() => expect(callsOf('deleteFile')).toHaveLength(1))
    await waitFor(() => expect(within(blockOf('2026-11')).getByText('파일 1개')).toBeTruthy())
  })

  it('AC-7615.8: 목록을 못 읽으면 E-STAFF-READ-FAILED, 지우기가 실패하면 E-STAFF-FILE-FAILED다', async () => {
    const db = payDb()
    db.failing.add('listFiles')
    renderPay({ db, part: 'files' })
    expect(await screen.findByText('오류 번호 E-STAFF-READ-FAILED')).toBeTruthy()
    cleanup()
    const db2 = payDb()
    db2.failing.add('deleteFile')
    renderPay({ db: db2, part: 'files' })
    await waitFor(() => expect(monthBlocks()).toHaveLength(3))
    const first = within(blockOf('2026-11')).getAllByRole('listitem')[0]
    fireEvent.click(within(first).getByRole('button', { name: '지우기' }))
    await act(async () => {
      fireEvent.click(within(first).getAllByRole('button', { name: '지우기' }).at(-1)!)
    })
    expect(await screen.findByText('오류 번호 E-STAFF-FILE-FAILED')).toBeTruthy()
  })
})
