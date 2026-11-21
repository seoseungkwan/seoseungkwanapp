// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import * as XLSX from 'xlsx'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CONTACT_HEADERS, EQUIPMENT_HEADERS } from '@/lib/contacts/sheet'
import { look } from '../parts/look'
import { UploadButton } from './UploadButton'

// [엑셀 올리기]·[다른 파일 고르기](specs/contacts AC-6506.2, design.md '화면' import/UploadButton.tsx).
// 숨은 파일 고르기 칸(.xlsx만 보이게) → 고른 파일을 브라우저에서 읽어 onRead({ fileName, result }). 그때까지 네트워크가 없다. 업체는 지어낸 것이다

vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: vi.fn(() => ({})) }))

function xlsxFile(name: string, rows: unknown[][]): File {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[...CONTACT_HEADERS], ...rows]), '연락처')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[...EQUIPMENT_HEADERS]]), '장비')
  return new File([XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer], name)
}

function pick(input: HTMLInputElement, file: File) {
  Object.defineProperty(input, 'files', { configurable: true, value: [file] })
  fireEvent.change(input)
}

const fileInput = (container: HTMLElement) => {
  const input = container.querySelector('input[type="file"]')
  if (!(input instanceof HTMLInputElement)) throw new Error('파일 고르기 칸이 없다')
  return input
}

const fetchSpy = vi.fn()
beforeEach(() => {
  vi.stubGlobal('fetch', fetchSpy)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('AC-6506.2 UploadButton', () => {
  it('AC-6506.2: [엑셀 올리기] 단추와 숨은 파일 고르기 칸(.xlsx만 보이게)이 있고, 단추를 누르면 파일 고르기 창을 연다', () => {
    const { container } = render(<UploadButton onRead={vi.fn()} />)
    const button = screen.getByRole('button', { name: '엑셀 올리기' })
    expect(button.className).toBe(look.button) // 보조 단추에서 폰 전용 줄을 뺀 묶음(AC-6505.1)
    const input = fileInput(container)
    expect(input.accept).toBe('.xlsx')
    expect(input.hidden).toBe(true)
    expect(input.multiple).toBe(false)
    const open = vi.spyOn(input, 'click').mockImplementation(() => {})
    fireEvent.click(button)
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('AC-6506.2: 고른 파일을 읽어 onRead({ fileName, result })로 넘기고, 같은 파일을 다시 고를 수 있게 칸을 비운다', async () => {
    const onRead = vi.fn()
    const { container } = render(<UploadButton onRead={onRead} />)
    const input = fileInput(container)
    pick(input, xlsxFile('주소록-양식.xlsx', [['거래처', '예시메디칼']]))
    await waitFor(() => expect(onRead).toHaveBeenCalledTimes(1))
    const [{ fileName, result }] = onRead.mock.calls[0]
    expect(fileName).toBe('주소록-양식.xlsx')
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts[0].row).toBe(2)
    expect(result.contacts[0].cells.name).toBe('예시메디칼')
    expect(input.value).toBe('')
  })

  it("AC-6506.2: .xlsx가 아니거나 양식이 아니면 그 결과('not-xlsx'·'empty' 등)를 넘긴다", async () => {
    const onRead = vi.fn()
    const { container } = render(<UploadButton onRead={onRead} />)
    pick(fileInput(container), new File(['분류,업체 이름'], '거래처정리.csv'))
    await waitFor(() => expect(onRead).toHaveBeenCalledWith({ fileName: '거래처정리.csv', result: 'not-xlsx' }))
    pick(fileInput(container), xlsxFile('빈 양식.xlsx', []))
    await waitFor(() => expect(onRead).toHaveBeenCalledWith({ fileName: '빈 양식.xlsx', result: 'empty' }))
  })

  it('AC-6506.2: 고르기 창을 닫아 파일이 없으면 아무것도 하지 않는다', () => {
    const onRead = vi.fn()
    const { container } = render(<UploadButton onRead={onRead} />)
    const input = fileInput(container)
    Object.defineProperty(input, 'files', { configurable: true, value: [] })
    fireEvent.change(input)
    expect(onRead).not.toHaveBeenCalled()
  })

  it('AC-6506.2: [다른 파일 고르기]는 같은 부품의 주 단추 모양이다', () => {
    render(<UploadButton onRead={vi.fn()} label="다른 파일 고르기" primary />)
    expect(screen.getByRole('button', { name: '다른 파일 고르기' }).className).toBe(look.primary)
  })

  it('AC-6506.2: 파일을 읽는 동안·읽은 뒤에도 네트워크·Supabase를 부르지 않는다', async () => {
    const { supabaseBrowser } = await import('@/lib/supabase/browser')
    const onRead = vi.fn()
    const { container } = render(<UploadButton onRead={onRead} />)
    pick(fileInput(container), xlsxFile('주소록.xlsx', [['거래처', '예시메디칼']]))
    await waitFor(() => expect(onRead).toHaveBeenCalled())
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(supabaseBrowser).not.toHaveBeenCalled()
  })
})
