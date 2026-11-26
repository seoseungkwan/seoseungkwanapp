// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import GoogleCalendarPage, { dynamic, metadata } from './page'

// /settings/google-calendar 설정 › 구글 캘린더 (spec google-link REQ-8528·REQ-8540 AC-8540.3·AC-8540.4, design.md 15절).
// 화면 묶음(GcalSettingsScreen — 안 메뉴 틀·잇기·시행자·종류·가져오기 미리 보기·맞춤 방법)은 components/gcalSettings 시험이 본다.
// 여기서는 탭 이름, 요청마다 그리기, 주소 ?tab=만 화면에 넘기는지(병원 id·비밀 글자 없음) 본다. 문지기·앱 틀(데스크는 DeskGate)은 (app)/layout이 준다
const { GcalSettingsScreen } = vi.hoisted(() => ({
  GcalSettingsScreen: vi.fn<(props: Record<string, unknown>) => null>(() => null),
}))
vi.mock('@/components/gcalSettings/GcalSettingsScreen', () => ({ GcalSettingsScreen }))

const SOURCE = readFileSync(join(process.cwd(), 'src/app/(app)/settings/google-calendar/page.tsx'), 'utf8')

async function propsFor(tab: string | string[] | undefined) {
  const params = tab === undefined ? {} : { tab }
  render((await GoogleCalendarPage({ searchParams: Promise.resolve(params) })) as ReactElement)
  expect(GcalSettingsScreen).toHaveBeenCalledTimes(1)
  return GcalSettingsScreen.mock.calls[0]![0]
}

beforeEach(() => GcalSettingsScreen.mockClear())
afterEach(cleanup)

describe('/settings/google-calendar 페이지 (AC-8540.4)', () => {
  it("AC-8540.4: 브라우저 탭 이름은 '구글 캘린더'다", () => {
    expect(metadata.title).toBe('구글 캘린더')
  })

  it('AC-8540.4: 주소(?tab=)로 고르므로 요청마다 그린다', () => {
    expect(dynamic).toBe('force-dynamic')
  })

  it.each([
    ['connect', 'connect'],
    ['colors', 'colors'],
    ['import', 'import'],
    ['rules', 'rules'],
  ] as const)('AC-8540.4: ?tab=%s는 화면 묶음에 initialTab %s로 넘긴다', async (tab, initialTab) => {
    const props = await propsFor(tab)
    expect(props).toEqual({ initialTab })
  })

  it.each([[undefined], ['bogus'], [['rules', 'colors']], ['']])('AC-8540.4: ?tab=%j(없음·모르는 값·여럿)는 initialTab null — 화면이 처음 칸을 고른다', async (tab) => {
    const props = await propsFor(tab)
    expect(props).toEqual({ initialTab: null })
  })

  it('AC-8540.3: 페이지는 병원 id·비밀 글자·세션을 읽지 않는다(데스크·원장 모두 같은 페이지, 자료는 브라우저가 RLS로 읽음)', () => {
    expect(SOURCE).toContain("import { GcalSettingsScreen } from '@/components/gcalSettings/GcalSettingsScreen'")
    expect(SOURCE).not.toMatch(/hospital|secret|currentMe|supabase/i)
  })
})
