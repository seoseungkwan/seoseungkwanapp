// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { todayInKorea } from '@/lib/analytics/dates'
import CalendarPage, { dynamic, metadata } from './page'

// /calendar 예약 페이지 (spec clinic-calendar AC-5905.1·AC-5905.10). 화면 자체는 components/calendar 시험이 본다.
// 여기서는 서버 페이지가 요청 때의 한국 날짜만 넘기는지, 제목이 '예약'인지 본다. 문지기와 앱 틀은 (app)/layout이 준다
const { CalendarScreen } = vi.hoisted(() => ({
  CalendarScreen: vi.fn<(props: Record<string, unknown>) => null>(() => null),
}))
vi.mock('@/components/calendar/CalendarScreen', () => ({ CalendarScreen }))

const SOURCE = readFileSync(join(process.cwd(), 'src/app/(app)/calendar/page.tsx'), 'utf8')

const renderAt = (iso: string) => {
  vi.setSystemTime(new Date(iso))
  render(<CalendarPage />)
  expect(CalendarScreen).toHaveBeenCalledTimes(1)
  return CalendarScreen.mock.calls[0]![0]
}

describe('/calendar 페이지 (AC-5905.10)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    CalendarScreen.mockClear()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('AC-5905.10: 제목은 예약이다', () => {
    expect(metadata.title).toBe('예약')
  })

  it('AC-5905.1: 예약 화면(CalendarScreen)을 그리고 오늘은 todayInKorea() 값이다', () => {
    const props = renderAt('2026-11-17T01:40:00Z')
    expect(props.initialToday).toBe(todayInKorea())
    expect(props.initialToday).toBe('2026-11-17')
  })

  it.each([
    ['2026-11-17T14:59:59Z', '2026-11-17'], // 한국 23:59:59
    ['2026-11-17T15:00:00Z', '2026-11-18'], // 한국 00:00:00
  ])('AC-5905.1: 오늘은 요청 때의 한국 날짜다(%s → %s)', (iso, ymd) => {
    expect(renderAt(iso).initialToday).toBe(ymd)
  })

  it('AC-5905.1: 요청마다 날짜를 다시 정한다(빌드 때 미리 그리지 않는다)', () => {
    expect(dynamic).toBe('force-dynamic')
  })

  it('AC-5905.10: 화면이 받는 값은 initialToday 하나다(병원 id 없음)', () => {
    const props = renderAt('2026-11-17T01:40:00Z')
    expect(Object.keys(props)).toEqual(['initialToday'])
    expect(SOURCE).not.toMatch(/hospital/i)
  })
})
