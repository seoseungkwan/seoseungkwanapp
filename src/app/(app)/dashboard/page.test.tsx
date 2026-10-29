import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardEmpty } from '@/components/dashboard/DashboardEmpty'
import DashboardPage, { dynamic } from './page'

// /dashboard 페이지 (REQ-009, design.md '대시보드 범위'). 문지기와 앱 틀(위쪽 띠·탭·<main>)은 (app)/layout이 준다(layout.test.tsx).
// 여기서는 오늘 한국 날짜로 제목을 만들어 빈 자리를 그리는지만 본다. 데이터는 읽지 않는다

const SOURCE = readFileSync(fileURLToPath(new URL('./page.tsx', import.meta.url)), 'utf8')
const h1Text = (markup: string) =>
  (/<h1\b[^>]*>([\s\S]*?)<\/h1>/.exec(markup)?.[1] ?? '')
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

  it('AC-009.1: 제목은 "오늘" + 지금의 한국 날짜 — "오늘 2026년 10월 29일 (목)"', () => {
    expect(h1Text(renderAt('2026-10-29T00:42:00Z'))).toBe('오늘 2026년 10월 29일 (목)')
    expect(h1Text(renderAt('2027-01-01T03:00:00Z'))).toBe('오늘 2027년 1월 1일 (금)')
  })

  it('AC-009.1: 한국 자정 경계 — 서버 시간대가 UTC여도 한국 날짜(todayInKorea)다', () => {
    process.env.TZ = 'UTC'
    expect(new Date('2026-10-28T15:30:00Z').getHours()).toBe(15) // 이 시험 안에서 정말 UTC로 바뀌었다
    expect(h1Text(renderAt('2026-10-28T15:00:00Z'))).toBe('오늘 2026년 10월 29일 (목)')
    expect(h1Text(renderAt('2026-10-28T14:59:59Z'))).toBe('오늘 2026년 10월 28일 (수)')
  })

  it('AC-009.1: 날짜는 요청 때 계산한다 — 빌드 때 그린 날짜로 굳지 않는다(force-dynamic)', () => {
    expect(dynamic).toBe('force-dynamic')
  })

  it('AC-009.2: 화면은 빈 자리(제목 + 안내 상자 하나) 그대로다 — 다른 칸을 더하지 않는다', () => {
    expect(renderAt('2026-10-29T00:42:00Z')).toBe(renderToStaticMarkup(<DashboardEmpty title="2026년 10월 29일 (목)" />))
  })

  it('AC-009.2: 앱 틀을 한 번 더 그리지 않는다 — 위쪽 띠·탭·<main>·.app-ui는 (app)/layout 몫', () => {
    const html = renderAt('2026-10-29T00:42:00Z')
    for (const mark of [/<main\b/, /<header\b/, /<nav\b/, /\bapp-ui\b/]) expect(html).not.toMatch(mark)
  })

  it('AC-009.2: 숫자·자료를 읽지 않는다 — Supabase·문지기·fetch를 쓰지 않는다(대시보드 내용은 별도 명세)', () => {
    expect(SOURCE).not.toMatch(/@\/lib\/supabase|guard\.server|hospital\.server|\bfetch\(|'use client'/)
    expect(SOURCE).toMatch(/from '@\/lib\/analytics\/dates'/) // 날짜는 dates.ts 한 곳
  })
})
