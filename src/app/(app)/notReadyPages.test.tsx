import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { NotReadyScreen } from '@/components/common/NotReadyScreen'
import { NOT_READY_FEATURES, notReadyFeature, type NotReadyPath } from '@/components/common/notReadyFeatures'
import { decideRoute, type HospitalState } from '@/lib/auth/gate'
import AiReportPage from './ai-report/page'
import ContactsPage from './contacts/page'
import FormsPage from './forms/page'
import InventoryPage from './inventory/page'
import NoticesPage from './notices/page'
import RevenuePage from './revenue/page'
import StaffPage from './staff/page'
import StatsPage from './stats/page'

// 준비 중 주소의 페이지 (tab-frame REQ-305 AC-305.5·AC-305.6, ui-90 AC-415.5, design.md '준비 중 화면' 한 줄 페이지·'데이터 흐름').
// 페이지는 (app) 묶음 안이라 앱 틀과 승인 검사((app)/layout)를 저절로 받는다. 문지기 규칙은 바꾸지 않는다

const ROOT = process.cwd()
const APP_GROUP = 'src/app/(app)'

// 주소 · 표의 이름 · h1(title) · 페이지 (탭 순서)
const PAGES: Array<{ path: NotReadyPath; name: string; title: string; Page: ComponentType }> = [
  { path: '/stats', name: '통계', title: '통계는 준비 중이에요', Page: StatsPage },
  { path: '/notices', name: '고시·공지', title: '고시·공지는 준비 중이에요', Page: NoticesPage },
  { path: '/revenue', name: '매출', title: '매출은 준비 중이에요', Page: RevenuePage },
  { path: '/ai-report', name: 'AI 리포트', title: 'AI 리포트는 준비 중이에요', Page: AiReportPage },
  { path: '/forms', name: '서식', title: '서식은 준비 중이에요', Page: FormsPage },
  { path: '/staff', name: '직원', title: '직원은 준비 중이에요', Page: StaffPage },
  { path: '/inventory', name: '재고', title: '재고는 준비 중이에요', Page: InventoryPage },
  { path: '/contacts', name: '주소록', title: '주소록은 준비 중이에요', Page: ContactsPage },
]

const pageFile = (path: string) => `${APP_GROUP}${path}/page.tsx`
const h1Texts = (markup: string) =>
  [...markup.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => m[1]!.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())

describe('AC-305.5: 준비 중 주소의 페이지 = notReadyFeature(주소)를 준 NotReadyScreen', () => {
  it.each(PAGES)('AC-305.5: $path 페이지는 notReadyFeature("$path")를 준 NotReadyScreen과 같다', ({ path, Page }) => {
    expect(renderToStaticMarkup(<Page />)).toBe(renderToStaticMarkup(<NotReadyScreen feature={notReadyFeature(path)} />))
  })

  it.each(PAGES)('AC-415.5: $path 페이지의 h1은 하나이고 그 항목의 title "$title"이다(이름 "$name"만이 아니다)', ({ path, Page, name, title }) => {
    expect(h1Texts(renderToStaticMarkup(<Page />))).toEqual([title])
    expect(notReadyFeature(path).title).toBe(title)
    expect(title).not.toBe(name)
  })

  it.each(PAGES)('AC-415.5: $path 페이지는 "그동안 쓸 수 있어요"와 [대시보드로 돌아가기]를 그린다', ({ Page }) => {
    const html = renderToStaticMarkup(<Page />)
    expect(html).toContain('그동안 쓸 수 있어요')
    expect(html).toContain('대시보드로 돌아가기')
    expect(html).not.toContain('준비 중인 기능입니다')
  })

  it.each(PAGES)('AC-305.5: $path 페이지 소스는 자기 주소의 준비 중 자료만 꺼내 넘긴다(한 줄 페이지)', ({ path }) => {
    const source = readFileSync(join(ROOT, pageFile(path)), 'utf8')
    expect(source).toContain(`notReadyFeature('${path}')`)
    expect([...source.matchAll(/notReadyFeature\(/g)]).toHaveLength(1)
    expect(source).toMatch(/from '@\/components\/common\/NotReadyScreen'/)
    expect(source).not.toMatch(/['"]use client['"]|supabase|guard\.server|\bfetch\s*\(/)
  })

  it('AC-305.5: 주소가 모두 다르다', () => {
    expect(new Set(PAGES.map((p) => p.path)).size).toBe(PAGES.length)
  })

  it('AC-305.5·AC-012.4: 이 표의 주소는 준비 중 목록(NOT_READY_FEATURES)과 같고(화면이 생긴 탭은 양쪽에서 빠진다) /worklog는 없다', () => {
    expect(PAGES.map((p) => p.path)).toEqual(NOT_READY_FEATURES.map((f) => f.path))
    expect(PAGES.map((p) => p.path as string)).not.toContain('/worklog')
  })

  it('AC-610.1: /patients 페이지는 준비 중 화면을 쓰지 않는 환자 탭이다', () => {
    const source = readFileSync(join(ROOT, pageFile('/patients')), 'utf8')
    expect(source).not.toMatch(/NotReadyScreen|notReadyFeature/)
    expect(source).toMatch(/from '@\/components\/patients\/PatientsEntry'/)
  })
})

describe('AC-305.6: 준비 중 주소는 문지기(decideRoute) 규칙 그대로 · 페이지 파일은 (app) 아래', () => {
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
