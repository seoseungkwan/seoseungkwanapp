// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuleSummary } from '@/types/precheck'
import SettingsRoute, { metadata } from './page'

// 시험 내용과 상관없이, PC가 바쁠 때 기본 5초를 넘겨 실패하는 일만 막는다
vi.setConfig({ testTimeout: 60_000 })

// /settings 설정 화면 (precheck REQ-012 AC-012.6, 목업 화면 10). 문지기와 앱 틀은 (app)/layout이 준다.
// 실제 Supabase·실제 Worker에 붙지 않는다
const { supabaseBrowser } = vi.hoisted(() => {
  const client = { from: () => ({ select: () => ({ then: (ok: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok) }) }) }
  return { supabaseBrowser: () => client }
})
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser }))

const RULE: RuleSummary = {
  id: 'LA-01',
  title: '신경차단술 12개월 횟수',
  domain: '신경차단술',
  grade: '확인필요',
  basis: [{ doc: '문서', number: '고시 제2025-001호' }],
  enabled_default: true,
}

class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror = null
  onmessageerror = null
  postMessage() {
    queueMicrotask(() => this.onmessage?.({ data: { type: 'ruleList', ok: true, rules: [RULE] } } as MessageEvent))
  }
  terminate() {}
}

beforeEach(() => vi.stubGlobal('Worker', FakeWorker))
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('/settings 페이지', () => {
  it('AC-012.6: 브라우저 탭 이름은 설정이다', () => {
    expect(metadata.title).toBe('설정')
  })

  it('AC-012.6: 제목 "설정"과 안쪽 메뉴 — [청구·연락]은 지금 화면, [비트 PC 연결]은 /claim/setup 링크', async () => {
    render(<SettingsRoute />)
    expect(screen.getByRole('heading', { level: 1, name: '설정' })).toBeTruthy()
    const sub = screen.getByRole('navigation', { name: '설정 안 메뉴' })
    const here = within(sub).getByRole('link', { name: '청구·연락' })
    expect(here.getAttribute('href')).toBe('/settings')
    expect(here.getAttribute('aria-current')).toBe('page')
    const setup = within(sub).getByRole('link', { name: '비트 PC 연결' })
    expect(setup.getAttribute('href')).toBe('/claim/setup')
    expect(setup.hasAttribute('aria-current')).toBe(false)
    await screen.findByText('LA-01')
  })

  it("AC-012.6: '청구·연락'에 '점검 규칙' 칸이 있고 규칙 줄이 나온다", async () => {
    render(<SettingsRoute />)
    expect(screen.getByRole('heading', { level: 2, name: '점검 규칙' })).toBeTruthy()
    expect(await screen.findByText('신경차단술 12개월 횟수')).toBeTruthy()
  })

  it('AC-012.6: 새 서버 경로 없음 — 페이지는 화면을 그리기만 한다(문지기는 레이아웃, DB는 브라우저 + RLS)', () => {
    const source = readFileSync(join(process.cwd(), 'src/app/(app)/settings/page.tsx'), 'utf8')
    expect(source).not.toMatch(/use server|supabase|\bfetch\(/)
  })
})
