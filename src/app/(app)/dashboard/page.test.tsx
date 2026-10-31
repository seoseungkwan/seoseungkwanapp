import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardHome } from '@/components/dashboard/briefing/DashboardHome'
import DashboardPage, { dynamic } from './page'

// /dashboard 페이지 (tab-frame REQ-306, design.md '대시보드 짜임'·'대시보드 페이지 조립'). 문지기와 앱 틀(위쪽 띠·탭·<main>)은 (app)/layout이 준다(layout.test.tsx).
// 여기서는 오늘 한국 날짜로 연결 전 대시보드(DashboardHome)를 그리는지만 본다. 데이터는 읽지 않는다(분석·보고 문장 끼우기는 TASK-9)

const SOURCE = readFileSync(fileURLToPath(new URL('./page.tsx', import.meta.url)), 'utf8')
// 날짜 줄 글자: 그린 마크업의 첫 <p>(브리핑 왼쪽 칸 맨 위)
const dateLineText = (markup: string) =>
  (/<p\b[^>]*>([\s\S]*?)<\/p>/.exec(markup)?.[1] ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
const renderAt = (iso: string) => {
  vi.setSystemTime(new Date(iso))
  return renderToStaticMarkup(<DashboardPage />)
}

describe('/dashboard 화면', () => {
  const originalTz = process.env.TZ

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    process.env.TZ = originalTz
  })

  it('AC-306.1: 날짜 줄은 지금의 한국 날짜 — "10월 29일 목요일"', () => {
    expect(dateLineText(renderAt('2026-10-29T00:42:00Z'))).toBe('10월 29일 목요일')
    expect(dateLineText(renderAt('2027-01-01T03:00:00Z'))).toBe('1월 1일 금요일')
  })

  it('AC-306.1: 한국 자정 경계 — 서버 시간대가 UTC여도 한국 날짜(todayInKorea)다', () => {
    process.env.TZ = 'UTC'
    expect(new Date('2026-10-28T15:30:00Z').getHours()).toBe(15) // 이 시험 안에서 정말 UTC로 바뀌었다
    expect(dateLineText(renderAt('2026-10-28T15:00:00Z'))).toBe('10월 29일 목요일')
    expect(dateLineText(renderAt('2026-10-28T14:59:59Z'))).toBe('10월 28일 수요일')
  })

  it('AC-306.1: 날짜는 요청 때 계산한다 — 빌드 때 그린 날짜로 굳지 않는다(force-dynamic)', () => {
    expect(dynamic).toBe('force-dynamic')
  })

  it('AC-306.2: 화면은 연결 전 대시보드 — <DashboardHome today="2026-10-29" report={null} /> 그대로다', () => {
    expect(renderAt('2026-10-29T00:42:00Z')).toBe(renderToStaticMarkup(<DashboardHome today="2026-10-29" report={null} />))
  })

  it('AC-306.8: 앱 틀을 한 번 더 그리지 않는다 — 위쪽 띠·탭·<main>·.app-ui는 (app)/layout 몫', () => {
    const html = renderAt('2026-10-29T00:42:00Z')
    for (const mark of [/<main\b/, /<header\b/, /<nav\b/, /\bapp-ui\b/]) expect(html).not.toMatch(mark)
  })

  it('AC-306.8: 숫자·자료를 읽지 않는다 — Supabase·문지기·fetch를 쓰지 않는다(대시보드 내용은 별도 명세)', () => {
    expect(SOURCE).not.toMatch(/@\/lib\/supabase|guard\.server|hospital\.server|\bfetch\(|'use client'/)
    expect(SOURCE).toMatch(/from '@\/lib\/analytics\/dates'/) // 날짜는 dates.ts 한 곳
  })
})
