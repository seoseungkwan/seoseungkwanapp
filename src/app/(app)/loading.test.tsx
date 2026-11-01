// @vitest-environment jsdom
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen, within } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import Loading from './loading'

// 앱 화면을 여는 동안 본문 (ui-90 REQ-405 AC-405.1, design.md '앱 틀 본문 (TASK-3)', UI_GUIDE '누른 탭 먼저 + 불러오기 줄').
// 시안에는 없다(design.md 결정 4) → 화면 읽기 글자 "화면을 여는 중이에요" 하나만. 보이는 기다림은 탭 줄의 불러오기 줄이 맡는다

const FILE = 'src/app/(app)/loading.tsx'
const TEXT = '화면을 여는 중이에요'

const source = () => readFileSync(join(process.cwd(), FILE), 'utf8')

afterEach(cleanup)

describe('(app)/loading.tsx', () => {
  it('AC-405.1: role="status" 요소 하나 안에 sr-only 화면 읽기 글자 "화면을 여는 중이에요"만 있다', () => {
    const { container } = render(<Loading />)
    const statuses = screen.getAllByRole('status')
    expect(statuses).toHaveLength(1)
    const status = statuses[0]!
    expect(container.children).toHaveLength(1)
    expect(container.firstElementChild).toBe(status)
    expect(status.children).toHaveLength(1)
    const text = status.firstElementChild as HTMLElement
    expect(text.tagName).toBe('SPAN')
    expect(text.getAttribute('class')).toBe('sr-only')
    expect(text.textContent).toBe(TEXT)
    expect(container.textContent).toBe(TEXT)
    expect(within(status).queryAllByRole('heading')).toHaveLength(0)
  })

  it('AC-405.1: 그린 글자가 정해 둔 한 줄 그대로다(h1·움직임 클래스 없음)', () => {
    const html = renderToStaticMarkup(<Loading />)
    expect(html).toBe(`<div role="status"><span class="sr-only">${TEXT}</span></div>`)
    expect(html).not.toMatch(/<h1\b/)
    expect(html).not.toMatch(/\b(?:animate-|transition|duration-|ease-|delay-)/)
  })

  it("AC-405.1: 서버 컴포넌트다 — 'use client'가 없고 기본 내보내기 하나다", () => {
    expect(existsSync(join(process.cwd(), FILE)), FILE).toBe(true)
    const text = source()
    expect(text).not.toMatch(/['"]use client['"]/)
    expect(text).toMatch(/export default function \w+\(/)
    expect(text).not.toMatch(/\b(?:animate-|transition|duration-|ease-|delay-)/)
  })
})
