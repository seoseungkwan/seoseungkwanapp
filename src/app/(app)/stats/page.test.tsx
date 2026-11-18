import { readdirSync, readFileSync } from 'node:fs'
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

  // desk-feedback AC-6305.4: 데스크는 앱 틀(DeskGate)이 막힌 화면을 그린다. 페이지가 던지면 앱 틀 대신 오류 화면이 뜬다 → 아무것도 그리지 않는다
  it('AC-6305.4: 데스크(병원 줄 없음 + desk)면 던지지 않고 아무것도 그리지 않는다 — StatsScreen을 부르지 않는다', async () => {
    currentMe.mockResolvedValue({
      email: 'desk@example.com',
      isAdmin: false,
      hospital: null,
      desk: { hospitalId: 'h1', hospitalName: '가나 정형외과의원' },
    })
    await expect(StatsPage()).resolves.toBeNull()
    expect(StatsScreen).not.toHaveBeenCalled()
  })

  it('AC-6305.4: 원장은 지금과 같다 — 병원 이름과 오늘로 StatsScreen을 그린다', async () => {
    const { props } = await renderAt('2026-11-18T03:00:00Z')
    expect(props).toEqual({ hospitalName: '가나 정형외과의원', today: '2026-11-18' })
  })

  it('AC-515.4: 페이지는 통계 표를 읽지 않고 새 서버 경로를 만들지 않는다 — 화면을 놓기만 한다(ADR-004)', () => {
    expect(SOURCE).toMatch(/from '@\/components\/stats\/StatsScreen'/)
    expect(SOURCE).not.toMatch(/['"]use client['"]|['"]use server['"]|supabase|guard\.server|stats_days|stats_months|readDays|\bfetch\s*\(/)
  })
})

// 통계 화면 바탕(first90 AC-4411.1, design.md 5-5 '화면 바탕'): StatsScreen 맨 바깥의 data-st-canvas 표시를 보고 globals.css의
// #main:has([data-st-canvas])가 앱 본문 바탕을 칠한다. 페이지·앱 틀은 고치지 않는다 → 다른 탭·대시보드의 흰 바탕은 그대로다
describe('/stats 바탕 (AC-4411.1)', () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

  it('AC-4411.1: 페이지·앱 틀(layout·AppShell)은 통계 바탕 토큰을 쓰지 않는다', () => {
    for (const path of ['src/app/(app)/stats/page.tsx', 'src/app/(app)/layout.tsx', 'src/components/shell/AppShell.tsx']) {
      expect(read(path), path).not.toContain('st-canvas')
    }
  })

  it('AC-4411.1: 통계 부품 가운데 바탕 표시(data-st-canvas)를 두는 파일은 StatsScreen 하나뿐이다', () => {
    const files = (readdirSync(join(process.cwd(), 'src/components/stats'), { recursive: true }) as string[])
      .map((file) => file.split('\\').join('/'))
      .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
    expect(files.filter((file) => read(`src/components/stats/${file}`).includes('data-st-canvas'))).toEqual(['StatsScreen.tsx'])
  })
})
