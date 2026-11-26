// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { todayInKorea } from '@/lib/analytics/dates'
import SunapPage, { dynamic, metadata } from './page'

// /sunap 수납일지 페이지 (specs/sunap-ilji REQ-4907, google-link REQ-8514). 화면 자체는 components/gsheet/SunapTab·components/sunap 시험이 본다.
// 여기서는 서버 페이지가 탭 묶음(SunapTab — 탭 머리 [구글 시트]|[웹앱 수납일지])을 그리고 요청 때의 한국 날짜만 넘기는지, 제목이 '수납일지'인지 본다.
// 문지기와 앱 틀은 (app)/layout이 준다
const { SunapTab } = vi.hoisted(() => ({
  SunapTab: vi.fn<(props: Record<string, unknown>) => null>(() => null),
}))
vi.mock('@/components/gsheet/SunapTab', () => ({ SunapTab }))

const SOURCE = readFileSync(join(process.cwd(), 'src/app/(app)/sunap/page.tsx'), 'utf8')

const renderAt = (iso: string) => {
  vi.setSystemTime(new Date(iso))
  render(<SunapPage />)
  expect(SunapTab).toHaveBeenCalledTimes(1)
  return SunapTab.mock.calls[0]![0]
}

describe('/sunap 페이지 (AC-4907.2·AC-8514.1)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    SunapTab.mockClear()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('AC-4907.2: 제목은 수납일지다', () => {
    expect(metadata.title).toBe('수납일지')
  })

  it('AC-8514.1: 수납일지 탭 묶음(SunapTab)을 그리고 오늘은 todayInKorea() 값이다(웹앱 수납일지 화면은 그 안의 [웹앱 수납일지])', () => {
    const props = renderAt('2026-11-16T03:00:00Z')
    expect(props.initialToday).toBe(todayInKorea())
    expect(props.initialToday).toBe('2026-11-16')
    expect(SOURCE).toContain("import { SunapTab } from '@/components/gsheet/SunapTab'")
    expect(SOURCE).not.toContain('SunapScreen')
  })

  it.each([
    ['2026-11-16T14:59:59Z', '2026-11-16'], // 한국 23:59:59
    ['2026-11-16T15:00:00Z', '2026-11-17'], // 한국 00:00:00
  ])('AC-4907.2: 오늘은 요청 때의 한국 날짜다(%s → %s)', (iso, ymd) => {
    expect(renderAt(iso).initialToday).toBe(ymd)
  })

  it('AC-4907.2: 요청마다 날짜를 다시 정한다(빌드 때 미리 그리지 않는다)', () => {
    expect(dynamic).toBe('force-dynamic')
  })

  it('AC-4907.2·AC-8514.1: 화면이 받는 값은 initialToday 하나다(병원 id 없음)', () => {
    const props = renderAt('2026-11-16T03:00:00Z')
    expect(Object.keys(props)).toEqual(['initialToday'])
    expect(SOURCE).not.toMatch(/hospital/i)
  })
})
