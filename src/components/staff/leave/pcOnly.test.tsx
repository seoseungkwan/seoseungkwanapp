// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStaffBase } from '@/components/staff/useStaffBase'
import { LeaveScreen } from './LeaveScreen'
import { TODAY, makeBase } from './testData'

// 휴가 화면은 폰 전용 모양이 없다 (staff AC-7611.4, design.md 6절 '폰 모양 없음'). 폰에서도 PC 화면 그대로이고 넓은 표·달력만 그 칸이 옆으로 밀린다.
// ① 이 폴더 소스(시험 파일 밖)에 폭 경계 접두와 ds 단추 묶음 틀(폰에서 칸 나눔)이 없다
// ② 연차 현황·달력·휴가 넣기 칸(고르기 단추 묶음 넷)·연차 규칙·한 사람 기록을 그려 모든 요소 class에 폭 경계 접두 + 모양 클래스가 없다(ds 손가락 크기는 괜찮다)

vi.mock('@/components/staff/useStaffBase', () => ({ useStaffBase: vi.fn() }))

beforeEach(() => vi.mocked(useStaffBase).mockReset())
afterEach(cleanup)

const DIR = join(process.cwd(), 'src', 'components', 'staff', 'leave')
// 폭 경계 접두: sm: md: lg: xl: 2xl: max-sm: max-md: max-lg: max-xl: min-[…]: max-[…]:
const BREAKPOINT_IN_SOURCE = /(?<![\w-])(?:2xl|xl|lg|md|sm|max-(?:sm|md|lg|xl)|min-\[[^\]\s]*\]|max-\[[^\]\s]*\]):/
const BREAKPOINT = /^(?:2xl|xl|lg|md|sm|max-(?:sm|md|lg|xl)|min-\[.*\]|max-\[.*\])$/
// 폭에 따라 칸 나눔·쌓임·폭이 바뀌는 모양 클래스
const SHAPE = /^(?:grid|grid-cols-.+|flex|flex-col|flex-row|block|hidden|w-full|col-span-.+)$/

/** 그린 화면에서 폭 경계 접두 + 모양 클래스를 모은다(ds 손가락 크기 max-md:h-11 같은 것은 모양이 아니라 통과) */
function phoneShapes(): string[] {
  const found: string[] = []
  for (const el of document.body.querySelectorAll('[class]')) {
    for (const token of (el.getAttribute('class') ?? '').split(/\s+/)) {
      const parts = token.split(':')
      if (parts.length < 2) continue
      const base = parts[parts.length - 1]!.replace(/^!/, '')
      if (parts.slice(0, -1).some((v) => BREAKPOINT.test(v)) && SHAPE.test(base)) found.push(`<${el.tagName.toLowerCase()}> ${token}`)
    }
  }
  return found
}

async function show() {
  vi.mocked(useStaffBase).mockReturnValue(makeBase() as never)
  render(<LeaveScreen today={TODAY} />)
  return screen.findByRole('table', { name: '연차 현황' })
}

describe('AC-7611.4: 휴가 화면은 폰 전용 모양이 없다', () => {
  it('AC-7611.4: 휴가 폴더 소스(시험 밖)에 폭 경계 접두와 ds 단추 묶음 틀(ds.segment.group)이 없다', () => {
    const files = readdirSync(DIR).filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
    expect(files.length).toBeGreaterThan(5)
    for (const name of files) {
      const text = readFileSync(join(DIR, name), 'utf8')
      expect(BREAKPOINT_IN_SOURCE.exec(text)?.[0] ?? null, name).toBeNull()
      expect(text.includes('segment.group'), name).toBe(false)
    }
  })

  it('AC-7611.4: 연차 현황·휴가 달력에 폭 경계 + 모양 클래스가 없다', async () => {
    await show()
    expect(phoneShapes()).toEqual([])
  })

  it('AC-7611.4: 휴가 넣기 칸의 고르기 단추 묶음(종류·하루/여러 날·오전/오후·유급/무급)은 PC 모양 그대로다', async () => {
    await show()
    fireEvent.click(screen.getByRole('button', { name: '휴가 넣기' }))
    const dialog = within(screen.getByRole('dialog', { name: '휴가 넣기' }))
    fireEvent.change(dialog.getByRole('combobox', { name: '사람' }), { target: { value: 'm-lee' } })
    expect(phoneShapes()).toEqual([])
    fireEvent.click(dialog.getByRole('button', { name: '반차' }))
    expect(dialog.getByRole('group', { name: '오전·오후' })).toBeTruthy()
    expect(phoneShapes()).toEqual([])
    fireEvent.click(dialog.getByRole('button', { name: '병가' }))
    fireEvent.click(dialog.getByRole('button', { name: '여러 날 (시작~끝)' }))
    expect(dialog.getByRole('group', { name: '유급·무급' })).toBeTruthy()
    expect(phoneShapes()).toEqual([])
  })

  it('AC-7611.4: 연차 규칙 칸과 한 사람 기록에 폭 경계 + 모양 클래스가 없다', async () => {
    const table = await show()
    fireEvent.click(screen.getByRole('button', { name: '연차 규칙' }))
    expect(screen.getByRole('dialog', { name: '연차 규칙' })).toBeTruthy()
    expect(phoneShapes()).toEqual([])
    fireEvent.click(within(screen.getByRole('dialog', { name: '연차 규칙' })).getByRole('button', { name: '취소' }))
    fireEvent.click(within(table).getByRole('button', { name: '이도윤' }))
    await screen.findByRole('region', { name: '이도윤 휴가 기록' })
    expect(phoneShapes()).toEqual([])
  })
})
