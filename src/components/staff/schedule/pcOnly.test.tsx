// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDialog, openMonth, openPlan, renderWeek, resetKit } from './scheduleTestKit'

// 근무표 화면은 폰 전용 모양이 없다 (staff AC-7611.4·AC-7613.2, design.md 6절 '폰 모양 없음'). 폰에서도 PC 화면 그대로이고
// 넓은 표·달력(주 근무표·달 달력·더 일한 시간 표)만 그 칸이 옆으로 밀린다.
// ① 이 폴더 소스(시험 파일 밖)에 폭 경계 접두와 ds 단추 묶음 틀(폰에서 칸 나눔)이 없다
// ② 주 보기·달 보기·그날만 바꾸기 창·기본 근무를 그려 모든 요소 class에 폭 경계 접두 + 모양 클래스가 없다(ds 손가락 크기는 괜찮다)

vi.mock('@/components/staff/useStaffBase', () => ({ useStaffBase: vi.fn() }))

beforeEach(resetKit)
afterEach(cleanup)

const DIR = join(process.cwd(), 'src', 'components', 'staff', 'schedule')
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

describe('AC-7611.4: 근무표 화면은 폰 전용 모양이 없다', () => {
  it('AC-7611.4: 근무표 폴더 소스(시험 밖)에 폭 경계 접두와 ds 단추 묶음 틀(ds.segment.group)이 없다', () => {
    const files = readdirSync(DIR).filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
    expect(files.length).toBeGreaterThan(5)
    for (const name of files) {
      const text = readFileSync(join(DIR, name), 'utf8')
      expect(BREAKPOINT_IN_SOURCE.exec(text)?.[0] ?? null, name).toBeNull()
      expect(text.includes('segment.group'), name).toBe(false)
    }
  })

  it('AC-7611.4: 주 보기와 그날만 바꾸기 창에 폭 경계 + 모양 클래스가 없다', async () => {
    await renderWeek()
    expect(phoneShapes()).toEqual([])
    await openDialog('이도윤', '11월 18일 (수)')
    expect(phoneShapes()).toEqual([])
  })

  it('AC-7611.4·AC-7613.2: 달 보기에 폭 경계 + 모양 클래스가 없고, 달 달력은 옆으로 밀리는 칸 안이다', async () => {
    await openMonth()
    expect(phoneShapes()).toEqual([])
    const grid = screen.getByRole('region', { name: '달 근무표' })
    expect(grid.parentElement?.closest('[role="region"]')?.getAttribute('aria-label')).toBe('달 근무표 칸')
  })

  it('AC-7611.4: 기본 근무 칸에 폭 경계 + 모양 클래스가 없다', async () => {
    await openPlan()
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(phoneShapes()).toEqual([])
  })
})
