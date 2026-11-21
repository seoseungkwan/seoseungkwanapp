// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LeavePage, { dynamic, metadata } from '@/app/(app)/staff/leave/page'
import { todayInKorea } from '@/lib/analytics/dates'

// /staff/leave 휴가 페이지 (staff AC-7611.2, design.md 6절). 화면 자체는 LeaveScreen 시험이 본다.
// 여기서는 서버 페이지가 요청 때의 한국 날짜만 넘기는지, 탭 이름이 '직원'인지, 제목 h1을 또 그리지 않는지 본다(제목·작은 메뉴·데스크 막기는 staff/layout)
const { LeaveScreen } = vi.hoisted(() => ({ LeaveScreen: vi.fn<(props: Record<string, unknown>) => null>(() => null) }))
vi.mock('@/components/staff/leave/LeaveScreen', () => ({ LeaveScreen }))

const SOURCE = readFileSync(join(process.cwd(), 'src/app/(app)/staff/leave/page.tsx'), 'utf8')

const renderAt = (iso: string) => {
  vi.setSystemTime(new Date(iso))
  render(<LeavePage />)
  expect(LeaveScreen).toHaveBeenCalledTimes(1)
  return LeaveScreen.mock.calls[0]![0]
}

describe('/staff/leave 페이지 (AC-7611.2)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    LeaveScreen.mockClear()
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('AC-7611.2: 브라우저 탭 이름은 직원이고 요청마다 다시 그린다', () => {
    expect(metadata.title).toBe('직원')
    expect(dynamic).toBe('force-dynamic')
  })

  it('AC-7614.1: 휴가 화면을 그리고 오늘은 요청 때의 한국 날짜 하나만 넘긴다', () => {
    const props = renderAt('2026-11-21T01:00:00Z')
    expect(props).toEqual({ today: '2026-11-21' })
    expect(props.today).toBe(todayInKorea())
  })

  it.each([
    ['2026-11-21T14:59:59Z', '2026-11-21'],
    ['2026-11-21T15:00:00Z', '2026-11-22'],
  ])('AC-7614.1: 오늘은 한국 날짜다(%s → %s)', (iso, ymd) => {
    expect(renderAt(iso).today).toBe(ymd)
  })

  it('AC-7611.2: 페이지는 h1을 그리지 않고 병원 id를 넘기지 않는다', () => {
    expect(SOURCE).not.toMatch(/<h1/)
    expect(SOURCE).not.toMatch(/hospital/i)
  })
})
