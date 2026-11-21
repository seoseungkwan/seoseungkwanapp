// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { errorInfo } from '@/lib/errors'
import type { ReadProblem } from '@/lib/contacts/workbook'
import type { ErrorCode } from '@/types/errors'
import { FileProblemDialog } from './FileProblemDialog'

// 올린 파일을 못 쓸 때 확인 창(specs/contacts AC-6506.2, requirements.md '화면 글자' 오류 6~9·파일 큼, design.md '오류 번호').
// 제목 = what, 파일 이름, 본문 = fix('form'만 한 줄 더). 오류 번호 줄은 그리지 않는다(시안). [닫기]·[양식 받기]·[다른 파일 고르기]

vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: vi.fn(() => ({})) }))

const CASES: [ReadProblem, ErrorCode][] = [
  ['form', 'E-CONTACTS-FILE-FORM'],
  ['not-xlsx', 'E-CONTACTS-FILE-NOT-XLSX'],
  ['locked', 'E-CONTACTS-FILE-LOCKED'],
  ['empty', 'E-CONTACTS-FILE-EMPTY'],
  ['big', 'E-CONTACTS-FILE-BIG'],
]
const FORM_EXTRA = '시트 이름(연락처·장비)과 첫 줄 칸 이름은 바꾸지 말아 주세요.'

const fetchSpy = vi.fn()
const stopNavigation = (e: Event) => e.preventDefault()
beforeEach(() => {
  vi.stubGlobal('fetch', fetchSpy)
  document.addEventListener('click', stopNavigation)
})
afterEach(() => {
  cleanup()
  document.removeEventListener('click', stopNavigation)
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

function draw(problem: ReadProblem, fileName = '거래처정리_최종.xlsx') {
  const handlers = { onClose: vi.fn(), onDownloaded: vi.fn(), onRead: vi.fn() }
  const view = render(<FileProblemDialog problem={problem} fileName={fileName} {...handlers} />)
  return { ...view, ...handlers, dialog: screen.getByRole('alertdialog') }
}

describe('AC-6506.2 FileProblemDialog', () => {
  it.each(CASES)("AC-6506.2: '%s' → 제목·파일 이름·본문이 %s 글 그대로이고 오류 번호 줄은 없다", (problem, code) => {
    const { dialog } = draw(problem)
    const info = errorInfo(code)
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(screen.getByRole('alertdialog', { name: info.what })).toBe(dialog)
    expect(within(dialog).getByRole('heading', { name: info.what })).toBeTruthy()
    expect(within(dialog).getByText('거래처정리_최종.xlsx')).toBeTruthy()
    expect(within(dialog).getByText(info.fix)).toBeTruthy()
    expect(dialog.textContent).not.toContain(code)
    expect(dialog.textContent).not.toContain('오류 번호')
    if (problem === 'form') expect(within(dialog).getByText(FORM_EXTRA)).toBeTruthy()
    else expect(dialog.textContent).not.toContain(FORM_EXTRA)
  })

  it('AC-6506.2: 시안 글 — 양식이 아님·xlsx 아님·비밀번호·적힌 줄 없음·파일 큼', () => {
    const texts = (problem: ReadProblem) => {
      const { dialog, unmount } = draw(problem, '예시.xlsx')
      const all = dialog.textContent
      unmount()
      return all
    }
    expect(texts('form')).toContain(
      '주소록 양식이 아니에요예시.xlsx이 엑셀에서 주소록 양식의 시트와 칸 이름을 찾지 못했어요. [양식 받기]로 받은 엑셀에 적어서 올려 주세요.' + FORM_EXTRA,
    )
    expect(texts('not-xlsx')).toContain('엑셀 파일만 올릴 수 있어요예시.xlsx.xlsx 파일을 골라 주세요. [양식 받기]로 받은 파일에 적으면 돼요.')
    expect(texts('locked')).toContain('비밀번호가 걸린 엑셀이에요예시.xlsx엑셀에서 비밀번호를 푼 뒤 다시 올려 주세요.')
    expect(texts('empty')).toContain("엑셀에 적힌 업체가 없어요예시.xlsx'연락처' 시트에 사람마다 한 줄씩 적은 뒤 올려 주세요.")
    expect(texts('big')).toContain('엑셀 파일이 너무 커요예시.xlsx5MB, 연락처 2,000줄, 장비 1,000줄까지 올릴 수 있어요. 나눠서 올려 주세요.')
  })

  it('AC-6506.2: 단추는 [닫기]·[양식 받기]·[다른 파일 고르기] 차례다', () => {
    const { dialog } = draw('form')
    const controls = [...dialog.querySelectorAll('button, a')].map((el) => el.textContent?.trim())
    expect(controls).toEqual(['닫기', '양식 받기', '다른 파일 고르기'])
    const link = within(dialog).getByRole('link', { name: '양식 받기' })
    expect(link.getAttribute('href')).toBe('/contacts/contacts-template.xlsx')
    expect(link.getAttribute('download')).toBe('주소록-양식.xlsx')
  })

  it('AC-6506.2: [닫기]·Esc·뒤 가림막을 누르면 onClose, 창 안을 누르면 닫지 않는다', () => {
    const { dialog, onClose } = draw('empty')
    fireEvent.click(dialog)
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: '닫기' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    const backdrop = dialog.parentElement
    if (!backdrop) throw new Error('가림막이 없다')
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('AC-6506.2: 열리면 초점이 창 안 [닫기]에 있고 Tab은 창 안에서만 돈다', () => {
    const { dialog } = draw('form')
    const close = within(dialog).getByRole('button', { name: '닫기' })
    const again = within(dialog).getByRole('button', { name: '다른 파일 고르기' })
    expect(document.activeElement).toBe(close)
    again.focus()
    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(document.activeElement).toBe(close)
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(again)
  })

  it('AC-6506.2: [양식 받기]는 onDownloaded, [다른 파일 고르기]로 고른 파일은 onRead로 간다', async () => {
    const { dialog, container, onDownloaded, onRead } = draw('not-xlsx')
    fireEvent.click(within(dialog).getByRole('link', { name: '양식 받기' }))
    expect(onDownloaded).toHaveBeenCalledTimes(1)
    const input = (container.ownerDocument.querySelector('input[type="file"]') as HTMLInputElement | null) ?? null
    if (!input) throw new Error('파일 고르기 칸이 없다')
    expect(input.accept).toBe('.xlsx')
    Object.defineProperty(input, 'files', { configurable: true, value: [new File(['x'], '다른 파일.csv')] })
    fireEvent.change(input)
    await waitFor(() => expect(onRead).toHaveBeenCalledWith({ fileName: '다른 파일.csv', result: 'not-xlsx' }))
  })

  it('AC-6506.2: 창을 그리고 누르는 동안 네트워크·Supabase를 부르지 않는다', async () => {
    const { supabaseBrowser } = await import('@/lib/supabase/browser')
    const { dialog } = draw('locked')
    fireEvent.click(within(dialog).getByRole('link', { name: '양식 받기' }))
    fireEvent.click(within(dialog).getByRole('button', { name: '닫기' }))
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(supabaseBrowser).not.toHaveBeenCalled()
  })
})
