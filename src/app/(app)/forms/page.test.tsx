// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FormsPage, { metadata } from './page'

// /forms 페이지 (specs/forms REQ-3501, design.md 14절). 화면 자체([휴진 안내] 단추 줄 등)는 components/forms 시험이 본다.
// 여기서는 페이지가 탭 이름 '서식'을 적고 서식 화면(FormsScreen)을 그리는지만 본다. 문지기와 앱 틀은 (app)/layout이 준다(layout.test.tsx)
const { FormsScreen } = vi.hoisted(() => ({
  FormsScreen: vi.fn<(props: Record<string, unknown>) => null>(() => null),
}))
vi.mock('@/components/forms/FormsScreen', () => ({ FormsScreen }))

const SOURCE = readFileSync(join(process.cwd(), 'src/app/(app)/forms/page.tsx'), 'utf8')

describe('/forms 페이지 (AC-3501.1·AC-3501.3)', () => {
  beforeEach(() => {
    FormsScreen.mockClear()
  })

  afterEach(() => {
    cleanup()
  })

  it('AC-3501.3: 탭 이름(metadata)은 "서식"이다', () => {
    expect(metadata).toEqual({ title: '서식' })
  })

  it('AC-3501.1·AC-3501.3: 페이지는 서식 화면 <FormsScreen />을 한 번, 받는 값 없이 그린다', () => {
    render(<FormsPage />)
    expect(FormsScreen).toHaveBeenCalledTimes(1)
    expect(FormsScreen.mock.calls[0]![0]).toEqual({})
  })

  it('AC-3501.1: 준비 중 화면이 아니다 — "준비 중이에요" 글자도 준비 중 자료도 없고, 서식 화면을 이름 있는 내보내기로 불러온다', () => {
    const { container } = render(<FormsPage />)
    expect(container.textContent).not.toContain('준비 중이에요')
    expect(SOURCE).not.toMatch(/NotReadyScreen|notReadyFeature/)
    expect(SOURCE).toMatch(/import \{ FormsScreen \} from '@\/components\/forms\/FormsScreen'/)
  })

  it('AC-3501.1: 페이지는 서버 컴포넌트이고 승인 확인·DB·네트워크를 직접 하지 않는다((app)/layout이 한다)', () => {
    expect(SOURCE).not.toMatch(/['"]use client['"]/)
    expect(SOURCE).not.toMatch(/guard\.server|guardPage|supabase|\bfetch\s*\(/)
  })
})
