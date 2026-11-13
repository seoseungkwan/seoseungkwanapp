// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FoldButton, HowCounted } from './HowCounted'

// 접는 단추·"어떻게 세나요?" 접는 설명 (stats-pc-ux TASK-1, design.md 'sections/HowCounted.tsx', 시안 notes.md §5·§6(c)). 글은 시험 안에서 지은 가짜다

afterEach(cleanup)

const classesOf = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)
const howButtons = () => screen.getAllByRole('button', { name: '어떻게 세나요?' })
const controlled = (button: HTMLElement) => document.getElementById(button.getAttribute('aria-controls') ?? '')!
const chevOf = (button: HTMLElement) => button.querySelector('svg')!

describe('AC-4004.1: FoldButton — 글자 단추 + 꺾쇠', () => {
  function Fold({ onClick = () => {} }: { onClick?: () => void }) {
    const [open, setOpen] = useState(false)
    return (
      <>
        <FoldButton
          label="가짜 설정"
          open={open}
          controls="fake-fold"
          onClick={() => {
            onClick()
            setOpen(!open)
          }}
        />
        <div id="fake-fold" hidden={!open}>
          펼친 글
        </div>
      </>
    )
  }

  it('AC-4004.1: 글자 단추(ds.textButton, min-h-8, 휴대폰 44px)이고 aria-expanded·aria-controls를 단다. 꺾쇠는 꾸밈(aria-hidden)이다', () => {
    render(<Fold />)
    const button = screen.getByRole('button', { name: '가짜 설정' })
    expect(button.getAttribute('type')).toBe('button')
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(button.getAttribute('aria-controls')).toBe('fake-fold')
    expect(classesOf(button)).toEqual(expect.arrayContaining(['text-accent', 'text-body', 'min-h-8', 'max-md:min-h-11']))
    expect(chevOf(button).getAttribute('aria-hidden')).toBe('true')
    expect(classesOf(chevOf(button))).not.toContain('rotate-180')
  })

  it('AC-4004.1: 누르면 onClick을 부르고, 펼친 상태면 aria-expanded="true"·꺾쇠가 180° 돈다', () => {
    const onClick = vi.fn()
    render(<Fold onClick={onClick} />)
    const button = screen.getByRole('button', { name: '가짜 설정' })
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(classesOf(chevOf(button))).toContain('rotate-180')
    fireEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(classesOf(chevOf(button))).not.toContain('rotate-180')
  })
})

describe('AC-4004.1: HowCounted — "어떻게 세나요?" 접는 설명', () => {
  it('AC-4004.1: 처음에는 접혀 있다: aria-expanded="false"이고 aria-controls가 가리키는 칸은 hidden이지만 안 글은 DOM에 있다', () => {
    render(
      <HowCounted>
        <p>가짜 설명 글</p>
      </HowCounted>,
    )
    const [button] = howButtons()
    expect(button!.getAttribute('aria-expanded')).toBe('false')
    const body = controlled(button!)
    expect(body).not.toBeNull()
    expect(body.hidden).toBe(true)
    expect(body.textContent).toBe('가짜 설명 글')
    expect(screen.getByText('가짜 설명 글')).toBeTruthy()
  })

  it('AC-4004.1: 누르면 펼치고(aria-expanded="true", 꺾쇠 180°) 다시 누르면 접는다', () => {
    render(
      <HowCounted>
        <p>가짜 설명 글</p>
      </HowCounted>,
    )
    const [button] = howButtons()
    fireEvent.click(button!)
    expect(button!.getAttribute('aria-expanded')).toBe('true')
    expect(controlled(button!).hidden).toBe(false)
    expect(classesOf(chevOf(button!))).toContain('rotate-180')
    fireEvent.click(button!)
    expect(button!.getAttribute('aria-expanded')).toBe('false')
    expect(controlled(button!).hidden).toBe(true)
    expect(classesOf(chevOf(button!))).not.toContain('rotate-180')
  })

  it('AC-4004.1: 단추는 작은 글자 단추(시안 .mk-how-btn: small 글자, min-h-8, 휴대폰 44px)이고 같은 속성 클래스를 겹치지 않는다', () => {
    render(
      <HowCounted>
        <p>가짜 설명 글</p>
      </HowCounted>,
    )
    const classes = classesOf(howButtons()[0]!)
    expect(classes).toEqual(expect.arrayContaining(['text-small', 'text-accent', 'min-h-8', 'max-md:min-h-11']))
    expect(classes).not.toContain('text-body')
  })

  it('AC-4004.1: 칸마다 따로 움직인다(하나를 펼쳐도 다른 칸은 접힌 채, aria-controls가 서로 다르다)', () => {
    render(
      <>
        <HowCounted>
          <p>첫째 설명</p>
        </HowCounted>
        <HowCounted>
          <p>둘째 설명</p>
        </HowCounted>
      </>,
    )
    const [first, second] = howButtons()
    expect(first!.getAttribute('aria-controls')).not.toBe(second!.getAttribute('aria-controls'))
    fireEvent.click(second!)
    expect(first!.getAttribute('aria-expanded')).toBe('false')
    expect(controlled(first!).hidden).toBe(true)
    expect(second!.getAttribute('aria-expanded')).toBe('true')
    expect(controlled(second!).hidden).toBe(false)
    expect(controlled(second!).textContent).toBe('둘째 설명')
  })

  it('AC-4004.1: side가 없으면 단추 바로 아래가 펼친 글 칸이고 한 감싸개 안에 있다', () => {
    const { container } = render(
      <HowCounted>
        <p>가짜 설명 글</p>
      </HowCounted>,
    )
    const [button] = howButtons()
    const body = controlled(button!)
    expect(container.children).toHaveLength(1)
    expect(button!.nextElementSibling).toBe(body)
    expect(body.parentElement).toBe(container.firstElementChild)
  })
})

describe('AC-4005.1: HowCounted side — [어떻게 세나요?] · 오른쪽 끝 [표 복사] 한 줄', () => {
  function drawWithSide() {
    return render(
      <HowCounted
        side={
          <button type="button" className="max-md:w-full">
            가짜 표 복사
          </button>
        }
      >
        <p>가짜 설명 글</p>
      </HowCounted>,
    )
  }

  it('AC-4005.1: 단추와 side가 한 줄(flex-wrap justify-between)이고 단추가 왼쪽, side가 오른쪽 끝이다', () => {
    drawWithSide()
    const [button] = howButtons()
    const side = screen.getByRole('button', { name: '가짜 표 복사' })
    const row = button!.parentElement!
    expect(row.contains(side)).toBe(true)
    expect(classesOf(row)).toEqual(expect.arrayContaining(['flex', 'flex-wrap', 'items-center', 'justify-between']))
    expect(row.firstElementChild).toBe(button)
    expect(row.lastElementChild!.contains(side)).toBe(true)
  })

  it('AC-4005.1: 펼친 설명은 그 줄 아래다(줄 다음 형제, 한 감싸개 안)', () => {
    const { container } = drawWithSide()
    const [button] = howButtons()
    const row = button!.parentElement!
    const body = controlled(button!)
    expect(row.nextElementSibling).toBe(body)
    expect(row.contains(body)).toBe(false)
    expect(container.children).toHaveLength(1)
    fireEvent.click(button!)
    expect(body.hidden).toBe(false)
  })

  it('AC-4005.1: 768px 미만은 side가 먼저(줄 전체 폭) 오고 [어떻게 세나요?]가 그 아래다(order)', () => {
    drawWithSide()
    const [button] = howButtons()
    const row = button!.parentElement!
    expect(classesOf(button!)).toContain('max-md:order-2')
    expect(classesOf(row.lastElementChild!)).toContain('max-md:w-full')
  })

  it('AC-4005.1: side가 null·false면 side 없는 모양이다(빈 줄을 만들지 않는다)', () => {
    for (const side of [null, false]) {
      const { container } = render(
        <HowCounted side={side}>
          <p>가짜 설명 글</p>
        </HowCounted>,
      )
      const [button] = howButtons()
      expect(classesOf(button!.parentElement!)).not.toContain('justify-between')
      expect(button!.nextElementSibling).toBe(controlled(button!))
      expect(container.querySelectorAll('.justify-between')).toHaveLength(0)
      cleanup()
    }
  })
})

describe('AC-4006.2: 새 부품 파일과 규칙 시험', () => {
  const ROOT = process.cwd()
  const DIR = 'src/components/stats/sections'
  const code = (name: string) =>
    readFileSync(join(ROOT, DIR, name), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|\s)\/\/.*$/gm, '$1')

  it('AC-4006.2: 새 파일은 섹션 소스 규칙·클래스 규칙이 읽는 폴더(sections)에 있고, 펼침·고른 탭을 브라우저 저장소·주소에 남기지 않는다', () => {
    for (const name of ['HowCounted.tsx', 'RxSection.tsx', 'parts.tsx']) {
      const text = code(name)
      expect(text, name).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/)
      expect(text, name).not.toMatch(/history\.|location\.|useSearchParams|useRouter/)
      expect(text, name).not.toMatch(/\bfetch\s*\(|supabase/i)
    }
  })

  it('AC-4006.2: 새 파일은 그림자·화면 폭 예외 접두사(xl:·min-[…]:)를 쓰지 않는다(목차 띠·탭 밑줄은 2px 막대)', () => {
    for (const name of ['HowCounted.tsx', 'RxSection.tsx']) {
      const text = code(name)
      expect(text, name).not.toMatch(/\bshadow-/)
      expect(text, name).not.toMatch(/\b(?:xl|2xl|sm|max-sm|max-xl):|\b(?:min|max)-\[/)
    }
  })
})
