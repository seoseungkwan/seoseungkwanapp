import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { NotReadyScreen } from '@/components/common/NotReadyScreen'
import { notReadyFeature, type NotReadyPath } from '@/components/common/notReadyFeatures'
import { decideRoute, type HospitalState } from '@/lib/auth/gate'
import AiReportPage from './ai-report/page'
import ContactsPage from './contacts/page'
import FormsPage from './forms/page'
import InventoryPage from './inventory/page'
import NoticesPage from './notices/page'
import PatientsPage from './patients/page'
import RevenuePage from './revenue/page'
import StaffPage from './staff/page'
import StatsPage from './stats/page'
import WorklogPage from './worklog/page'

// 준비 중 주소 10개의 페이지 (tab-frame REQ-305 AC-305.5·AC-305.6, design.md '준비 중 화면' 한 줄 페이지·'데이터 흐름').
// 페이지는 (app) 묶음 안이라 앱 틀과 승인 검사((app)/layout)를 저절로 받는다. 문지기 규칙은 바꾸지 않는다

const ROOT = process.cwd()
const APP_GROUP = 'src/app/(app)'

// 주소 · 표의 이름 · 페이지 (탭 순서)
const PAGES: Array<{ path: NotReadyPath; name: string; Page: ComponentType }> = [
  { path: '/stats', name: '통계', Page: StatsPage },
  { path: '/notices', name: '고시·공지', Page: NoticesPage },
  { path: '/patients', name: '환자', Page: PatientsPage },
  { path: '/revenue', name: '매출', Page: RevenuePage },
  { path: '/ai-report', name: 'AI 리포트', Page: AiReportPage },
  { path: '/forms', name: '서식', Page: FormsPage },
  { path: '/staff', name: '직원', Page: StaffPage },
  { path: '/worklog', name: '업무일지', Page: WorklogPage },
  { path: '/inventory', name: '재고', Page: InventoryPage },
  { path: '/contacts', name: '주소록', Page: ContactsPage },
]

const pageFile = (path: string) => `${APP_GROUP}${path}/page.tsx`
const h1Texts = (markup: string) =>
  [...markup.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => m[1]!.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())

describe('AC-305.5: 준비 중 주소 10개의 페이지 = notReadyFeature(주소)를 준 NotReadyScreen', () => {
  it.each(PAGES)('AC-305.5: $path 페이지는 notReadyFeature("$path")를 준 NotReadyScreen과 같다', ({ path, Page }) => {
    expect(renderToStaticMarkup(<Page />)).toBe(renderToStaticMarkup(<NotReadyScreen feature={notReadyFeature(path)} />))
  })

  it.each(PAGES)('AC-305.5: $path 페이지의 h1은 하나이고 표의 이름 "$name"이다', ({ Page, name }) => {
    expect(h1Texts(renderToStaticMarkup(<Page />))).toEqual([name])
  })

  it.each(PAGES)('AC-305.5: $path 페이지 소스는 자기 주소의 준비 중 자료만 꺼내 넘긴다(한 줄 페이지)', ({ path }) => {
    const source = readFileSync(join(ROOT, pageFile(path)), 'utf8')
    expect(source).toContain(`notReadyFeature('${path}')`)
    expect([...source.matchAll(/notReadyFeature\(/g)]).toHaveLength(1)
    expect(source).toMatch(/from '@\/components\/common\/NotReadyScreen'/)
    expect(source).not.toMatch(/['"]use client['"]|supabase|guard\.server|\bfetch\s*\(/)
  })

  it('AC-305.5: 10개 주소가 모두 다르다', () => {
    expect(new Set(PAGES.map((p) => p.path)).size).toBe(10)
  })
})

describe('AC-305.6: 준비 중 주소 10개는 문지기(decideRoute) 규칙 그대로 · 페이지 파일은 (app) 아래', () => {
  const HOSPITALS: HospitalState[] = ['none', 'pending', 'approved', 'rejected', 'unknown']

  it.each(PAGES)('AC-305.6: $path — 로그인 안 함 → /login', ({ path }) => {
    for (const hospital of HOSPITALS) {
      for (const isAdmin of [false, true]) expect(decideRoute({ path, signedIn: false, hospital, isAdmin })).toBe('/login')
    }
  })

  it.each(PAGES)('AC-305.6: $path — 병원 줄 없음 → /signup', ({ path }) => {
    for (const isAdmin of [false, true]) expect(decideRoute({ path, signedIn: true, hospital: 'none', isAdmin })).toBe('/signup')
  })

  it.each(PAGES)('AC-305.6: $path — 대기·거절 → /pending', ({ path }) => {
    for (const hospital of ['pending', 'rejected'] as const) {
      for (const isAdmin of [false, true]) expect(decideRoute({ path, signedIn: true, hospital, isAdmin })).toBe('/pending')
    }
  })

  it.each(PAGES)('AC-305.6: $path — 승인 → 그대로 연다(null, 관리자 아니어도)', ({ path }) => {
    for (const isAdmin of [false, true]) expect(decideRoute({ path, signedIn: true, hospital: 'approved', isAdmin })).toBeNull()
  })

  it.each(PAGES)('AC-305.6: $path 페이지 파일은 src/app/(app)/ 아래에 있다', ({ path }) => {
    expect(existsSync(join(ROOT, pageFile(path))), pageFile(path)).toBe(true)
  })

  it('AC-305.6: (app) 묶음의 layout이 앱 틀(AppShell)과 승인 검사(guardPage)를 준다', () => {
    const layout = readFileSync(join(ROOT, APP_GROUP, 'layout.tsx'), 'utf8')
    expect(layout).toMatch(/guardPage\(/)
    expect(layout).toMatch(/<AppShell\b/)
  })
})
