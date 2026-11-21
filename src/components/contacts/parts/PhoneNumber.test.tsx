// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installClipboard, installMatchMedia, TOUCH_QUERY } from './book.test.data'
import { CopyButton } from './CopyButton'
import { COPIED_MS, PhoneNumber } from './PhoneNumber'

// 번호(spec contacts AC-6505.3, 시안 기본값 7): 마우스 기기는 누르면 복사 + 1.6초 '복사했어요', 터치 기기는 tel: 링크.
// 기기는 matchMedia('(hover: none) and (pointer: coarse)') 하나로만 가른다(폭은 보지 않는다). 번호 모양은 phoneText

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  Reflect.deleteProperty(window, 'matchMedia')
  Reflect.deleteProperty(navigator, 'clipboard')
})

// 복사 약속(Promise)이 풀리게 한 번 돌린다
const flush = () => act(async () => {})

describe('AC-6505.3: 마우스 기기 — 누르면 보이는 번호를 복사하고 1.6초 동안 복사했어요', () => {
  it('AC-6505.3: 대표 전화(big)는 번호와 누르면 복사돼요가 늘 보이고, 누르면 그 번호를 복사한다', async () => {
    installMatchMedia(false)
    const writeText = installClipboard()
    render(<PhoneNumber value="02-000-0001" big />)
    const button = screen.getByRole('button', { name: /02-000-0001/ })
    expect(button.textContent).toContain('누르면 복사돼요')
    // 늘 보임: 올렸을 때만 보이게 하는 숨김 클래스가 없다
    expect(screen.getByText('누르면 복사돼요').className).not.toMatch(/(^|\s)hidden(\s|$)/)
    fireEvent.click(button)
    await flush()
    expect(writeText).toHaveBeenCalledWith('02-000-0001')
    expect(button.textContent).toContain('복사했어요')
    expect(button.textContent).not.toContain('누르면 복사돼요')
  })

  it('AC-6505.3: 복사했어요는 1.6초 뒤 사라지고 누르면 복사돼요로 돌아온다', async () => {
    installMatchMedia(false)
    installClipboard()
    render(<PhoneNumber value="02-000-0001" big />)
    fireEvent.click(screen.getByRole('button', { name: /02-000-0001/ }))
    await flush()
    expect(COPIED_MS).toBe(1600)
    act(() => vi.advanceTimersByTime(1599))
    expect(screen.getByText('복사했어요')).toBeTruthy()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.queryByText('복사했어요')).toBeNull()
    expect(screen.getByText('누르면 복사돼요')).toBeTruthy()
  })

  it('AC-6505.3: 숫자만 적힌 번호는 phoneText 모양으로 보이고 그 모양 그대로 복사한다', async () => {
    installMatchMedia(false)
    const writeText = installClipboard()
    render(<PhoneNumber value="0212345678" big />)
    const button = screen.getByRole('button', { name: /02-1234-5678/ })
    fireEvent.click(button)
    await flush()
    expect(writeText).toHaveBeenCalledWith('02-1234-5678')
  })

  it('AC-6505.3: 담당자 번호(big 아님)는 누르면 복사돼요를 마우스를 올렸을 때만 보인다(숨김 + 올림 때 보임 클래스)', async () => {
    installMatchMedia(false)
    installClipboard()
    render(<PhoneNumber value="010-0000-0001" />)
    const hint = screen.getByText('누르면 복사돼요')
    expect(hint.className.split(/\s+/)).toContain('hidden')
    expect(hint.className.split(/\s+/)).toContain('group-hover:inline-flex')
    fireEvent.click(screen.getByRole('button', { name: /010-0000-0001/ }))
    await flush()
    // 복사한 뒤 글은 올리지 않아도 보인다
    expect(screen.getByText('복사했어요').closest('span')?.className.split(/\s+/)).not.toContain('hidden')
  })

  it('AC-6505.3: 복사가 막히면(clipboard 거부) 복사했어요를 보이지 않는다', async () => {
    installMatchMedia(false)
    installClipboard('fail')
    render(<PhoneNumber value="02-000-0001" big />)
    fireEvent.click(screen.getByRole('button', { name: /02-000-0001/ }))
    await flush()
    expect(screen.queryByText('복사했어요')).toBeNull()
  })

  it('AC-6505.3: matchMedia가 없는 브라우저는 마우스 기기로 본다(복사 단추)', () => {
    Reflect.deleteProperty(window, 'matchMedia')
    render(<PhoneNumber value="02-000-0001" big />)
    expect(screen.getByRole('button', { name: /02-000-0001/ })).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })
})

describe('AC-6505.3: 터치 기기 — 누르면 전화(tel: 링크), 누르면 복사돼요 없음', () => {
  it('AC-6505.3: 터치 기기에서는 숫자와 맨 앞 +만 남긴 tel: 링크이고 복사 글이 없다', () => {
    installMatchMedia(true)
    const writeText = installClipboard()
    render(<PhoneNumber value="02-000-0001" big />)
    const link = screen.getByRole('link', { name: '02-000-0001' })
    expect(link.getAttribute('href')).toBe('tel:020000001')
    expect(screen.queryByText('누르면 복사돼요')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    fireEvent.click(link)
    expect(writeText).not.toHaveBeenCalled()
  })

  it('AC-6505.3: 터치 기기 링크도 phoneText 모양으로 보인다', () => {
    installMatchMedia(true)
    render(<PhoneNumber value="01012345678" />)
    const link = screen.getByRole('link', { name: '010-1234-5678' })
    expect(link.getAttribute('href')).toBe('tel:01012345678')
  })

  it('AC-6505.3: 기기는 터치 질문 하나로만 가른다 — matchMedia에 폭 질문을 하지 않는다', () => {
    const matchMedia = installMatchMedia(true)
    render(<PhoneNumber value="02-000-0001" big />)
    expect(matchMedia).toHaveBeenCalled()
    for (const [query] of matchMedia.mock.calls) expect(query).toBe(TOUCH_QUERY)
  })
})

describe('AC-6505.2: [복사] — 값을 그대로 복사하고 1.6초 동안 복사했어요', () => {
  it('AC-6505.2: [복사]를 누르면 받은 값을 그대로 복사하고 단추 글이 복사했어요로 바뀐다', async () => {
    const writeText = installClipboard()
    render(<CopyButton value="서울시 예시구 예시로 12, 3층" label="주소 복사" />)
    const button = screen.getByRole('button', { name: '주소 복사' })
    expect(button.textContent).toBe('복사')
    fireEvent.click(button)
    await flush()
    expect(writeText).toHaveBeenCalledWith('서울시 예시구 예시로 12, 3층')
    expect(button.textContent).toBe('복사했어요')
    act(() => vi.advanceTimersByTime(COPIED_MS))
    expect(button.textContent).toBe('복사')
  })
})
