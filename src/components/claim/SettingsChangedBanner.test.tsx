// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ds } from '@/components/ui/classes'
import { SettingsChangedBanner } from './SettingsChangedBanner'

// 설정이 바뀌었을 때의 띠(AC-013.6, design.md 6-5, 목업 화면 3 '설정이 바뀜')

afterEach(cleanup)

describe('AC-013.6 설정 바뀜 띠', () => {
  it('AC-013.6: 안내 글과 [다시 점검]이 보이고 누르면 다시 점검한다', async () => {
    const onRecheck = vi.fn()
    render(<SettingsChangedBanner onRecheck={onRecheck} busy={false} />)
    const banner = screen.getByRole('status')
    expect(banner.textContent).toContain('설정이 바뀌었어요, 다시 점검하세요')
    expect(banner.textContent).toContain('지금 보이는 결과는 바뀌기 전 기준이에요.')
    const button = screen.getByRole('button', { name: '다시 점검' })
    expect(button.getAttribute('class')).toContain(ds.button.primarySmall)
    await userEvent.setup().click(button)
    expect(onRecheck).toHaveBeenCalledTimes(1)
  })

  it('AC-013.6: 다시 점검하는 동안은 기다림 모양이고 다시 눌러도 또 부르지 않는다', async () => {
    const onRecheck = vi.fn()
    render(<SettingsChangedBanner onRecheck={onRecheck} busy />)
    const button = screen.getByRole('button', { name: '다시 점검하는 중…' })
    expect(button.getAttribute('aria-busy')).toBe('true')
    await userEvent.setup().click(button)
    expect(onRecheck).not.toHaveBeenCalled()
  })
})
