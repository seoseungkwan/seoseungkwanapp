import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Me } from '@/lib/auth/hospital.server'
import StatsPage, { dynamic, metadata } from './page'

// /stats 페이지 (stats REQ-515, design.md 'TASK-15 탭 연결'). 화면 자체는 components/stats 시험이 본다.
// 여기서는 서버 페이지가 문지기가 읽은 내 병원 이름과 요청 때의 한국 날짜만 넘기는지 본다. 문지기와 앱 틀은 (app)/layout이 준다(layout.test.tsx)
const { currentMe, StatsScreen } = vi.hoisted(() => ({
  currentMe: vi.fn<() => Promise<Me>>(),
  StatsScreen: vi.fn<(props: { hospitalName: string; today: string }) => null>(() => null),
}))
vi.mock('../currentMe.server', () => ({ currentMe }))
vi.mock('@/components/stats/StatsScreen', () => ({ StatsScreen }))

const SOURCE = readFileSync(join(process.cwd(), 'src/app/(app)/stats/page.tsx'), 'utf8')

const ME: Me = {
  email: 'manager@example.com',
  isAdmin: false,
  hospital: {
    id: 'h1',
    name: '가나 정형외과의원',
    applicantName: '홍길동',
    phone: null,
    email: 'manager@example.com',
    status: 'approved',
    createdAt: '2026-10-28T01:23:45+00:00',
  },
}

// 그린 뒤 화면이 받은 값
const renderAt = async (iso: string) => {
  vi.setSystemTime(new Date(iso))
  const html = renderToStaticMarkup(await StatsPage())
  expect(StatsScreen).toHaveBeenCalledTimes(1)
  return { html, props: StatsScreen.mock.calls[0]![0] }
}

describe('/stats 페이지 (AC-515.4)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    StatsScreen.mockClear()
    currentMe.mockReset()
    currentMe.mockResolvedValue(ME)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('AC-515.4: StatsScreen에 currentMe()가 준 내 병원 이름과 오늘만 넘긴다', async () => {
    const { props } = await renderAt('2026-11-02T03:00:00Z')
    expect(props).toEqual({ hospitalName: '가나 정형외과의원', today: '2026-11-02' })
    expect(currentMe).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['2026-10-31T14:59:59Z', '2026-10-31'], // 한국 23:59:59
    ['2026-10-31T15:00:00Z', '2026-11-01'], // 한국 00:00:00 — 서버 시계(UTC)는 아직 10월 31일
  ])('AC-515.4: 오늘은 요청 때의 한국 날짜다(%s → %s)', async (iso, ymd) => {
    expect((await renderAt(iso)).props.today).toBe(ymd)
  })

  it('AC-515.4: 요청마다 날짜를 다시 정한다(빌드 때 미리 그리지 않는다)', () => {
    expect(dynamic).toBe('force-dynamic')
  })

  it('AC-515.4: 브라우저 탭 이름은 "통계"다', () => {
    expect(metadata.title).toBe('통계')
  })

  it('AC-515.4: 준비 중 화면이 아니다 — NotReadyScreen·준비 중 자료를 쓰지 않는다', async () => {
    const { html } = await renderAt('2026-11-02T03:00:00Z')
    expect(html).not.toContain('준비 중')
    expect(SOURCE).not.toMatch(/NotReadyScreen|notReadyFeature/)
  })

  it('AC-515.4: 병원 줄이 없으면(문지기가 막아 오지 않는 길) 빈 이름으로 그리지 않고 던진다', async () => {
    currentMe.mockResolvedValue({ ...ME, hospital: null })
    await expect(StatsPage()).rejects.toThrow()
    expect(StatsScreen).not.toHaveBeenCalled()
  })

  it('AC-515.4: 페이지는 통계 표를 읽지 않고 새 서버 경로를 만들지 않는다 — 화면을 놓기만 한다(ADR-004)', () => {
    expect(SOURCE).toMatch(/from '@\/components\/stats\/StatsScreen'/)
    expect(SOURCE).not.toMatch(/['"]use client['"]|['"]use server['"]|supabase|guard\.server|stats_days|stats_months|readDays|\bfetch\s*\(/)
  })
})
