// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { todayInKorea } from '@/lib/analytics/dates'
import WorklogPage, { dynamic, metadata } from './page'

// /worklog 페이지 (specs/worklog REQ-012, design.md 14절). 화면 자체는 components/worklog 시험이 본다.
// 여기서는 서버 페이지가 요청 때의 한국 날짜만 넘기는지 본다. 문지기와 앱 틀은 (app)/layout이 준다(layout.test.tsx)
const { WorklogScreen } = vi.hoisted(() => ({
  WorklogScreen: vi.fn<(props: Record<string, unknown>) => null>(() => null),
}))
vi.mock('@/components/worklog/WorklogScreen', () => ({ WorklogScreen }))

const SOURCE = readFileSync(join(process.cwd(), 'src/app/(app)/worklog/page.tsx'), 'utf8')

// 그린 뒤 화면이 받은 값
const renderAt = (iso: string) => {
  vi.setSystemTime(new Date(iso))
  const { container } = render(<WorklogPage />)
  expect(WorklogScreen).toHaveBeenCalledTimes(1)
  return { container, props: WorklogScreen.mock.calls[0]![0] }
}

describe('/worklog 페이지 (AC-012.1)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    WorklogScreen.mockClear()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('AC-012.1: 업무일지 화면(WorklogScreen)을 그리고 오늘은 todayInKorea() 값이다', () => {
    const { props } = renderAt('2026-11-01T03:00:00Z')
    expect(props.initialToday).toBe(todayInKorea())
    expect(props.initialToday).toBe('2026-11-01')
  })

  it.each([
    ['2026-10-31T14:59:59Z', '2026-10-31'], // 한국 23:59:59
    ['2026-10-31T15:00:00Z', '2026-11-01'], // 한국 00:00:00 — 서버 시계(UTC)는 아직 10월 31일
  ])('AC-012.1: 오늘은 요청 때의 한국 날짜다(%s → %s)', (iso, ymd) => {
    expect(renderAt(iso).props.initialToday).toBe(ymd)
  })

  it('AC-012.1: 요청마다 날짜를 다시 정한다(빌드 때 미리 그리지 않는다)', () => {
    expect(dynamic).toBe('force-dynamic')
  })

  it('AC-012.1: 병원 id를 넘기지 않는다 — 화면이 받는 값은 initialToday 하나다', () => {
    const { props } = renderAt('2026-11-01T03:00:00Z')
    expect(Object.keys(props)).toEqual(['initialToday'])
    expect(props).not.toHaveProperty('hospitalId')
    expect(SOURCE).not.toMatch(/hospital/i)
  })

  it('AC-012.1: 탭 이름(metadata)은 "업무일지"다', () => {
    expect(metadata.title).toBe('업무일지')
  })

  it('AC-012.1: 준비 중 화면이 아니다 — "준비 중이에요" 글자도 준비 중 자료도 없다', () => {
    const { container } = renderAt('2026-11-01T03:00:00Z')
    expect(container.textContent).not.toContain('준비 중이에요')
    expect(SOURCE).not.toMatch(/NotReadyScreen|notReadyFeature/)
  })

  it('AC-012.1: 페이지는 서버 컴포넌트이고 승인 확인을 직접 하지 않는다((app)/layout이 한다)', () => {
    expect(SOURCE).not.toMatch(/['"]use client['"]/)
    expect(SOURCE).not.toMatch(/guard\.server|guardPage|supabase/)
  })
})
