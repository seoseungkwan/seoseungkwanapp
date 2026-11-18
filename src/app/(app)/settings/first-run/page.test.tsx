// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FirstRunScreen } from '@/components/settings/firstRun/FirstRunScreen'
import { DeskGate } from '@/components/shell/DeskGate'
import { isDeskPath } from '@/components/shell/menu'
import FirstRunRoute, { metadata } from './page'

// /settings/first-run 처음 질문 (clinic-profile AC-6614.1, design.md 16절). 문지기는 /settings와 같다:
// (app)/layout이 승인된 원장·데스크만 앱 틀에 들이고, 데스크는 앱 틀의 DeskGate가 세 탭 밖 주소를 막는다. 실제 Supabase에 붙지 않는다

const { pathname } = vi.hoisted(() => ({ pathname: vi.fn(() => '/settings/first-run') }))
vi.mock('next/navigation', () => ({ usePathname: pathname, useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }))
const reads = vi.hoisted(() => ({ count: 0 }))
vi.mock('@/lib/supabase/browser', () => ({
  supabaseBrowser: () => ({
    from: () => ({
      select: () => ({
        maybeSingle: () => {
          reads.count += 1
          return Promise.resolve({ data: null, error: null })
        },
      }),
    }),
  }),
}))

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

afterEach(cleanup)

describe('/settings/first-run 페이지', () => {
  it('AC-6614.1: 페이지는 처음 질문 화면(FirstRunScreen)을 그리고 브라우저 탭 이름은 처음 질문이다', () => {
    const page = FirstRunRoute()
    expect(page.type).toBe(FirstRunScreen)
    expect(metadata.title).toBe('처음 질문')
  })

  it("AC-6614.1: 원장은 제목 '우리 병원 메모 모양 맞추기'와 시작 단추 셋을 본다", async () => {
    render(<FirstRunRoute />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('우리 병원 메모 모양 맞추기')
    for (const name of ['예전 메모 붙여 넣기', '예시에서 고르기', '비슷한 게 없어요']) expect(await screen.findByRole('button', { name })).toBeTruthy()
  })

  it('AC-6614.1: 데스크는 이 주소를 열지 못한다 — 설정과 같은 문지기(DeskGate)가 막힌 화면을 그리고 처음 질문 화면은 그리지 않는다', () => {
    expect(isDeskPath('/settings/first-run')).toBe(false)
    expect(isDeskPath('/settings')).toBe(false)
    reads.count = 0
    render(
      <DeskGate>
        <FirstRunRoute />
      </DeskGate>,
    )
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('데스크 계정은 볼 수 없는 화면이에요')
    expect(screen.queryByText('우리 병원 메모 모양 맞추기')).toBeNull()
    expect(reads.count).toBe(0)
  })

  it('AC-6614.1: /settings와 같은 문지기 — 페이지는 따로 guard를 부르거나 서버에서 읽지 않는다(문지기는 (app)/layout, DB는 브라우저 + RLS)', () => {
    const source = read('src/app/(app)/settings/first-run/page.tsx')
    expect(source).not.toMatch(/use server|supabase|\bfetch\(|guardPage|currentMe/)
    const settings = read('src/app/(app)/settings/page.tsx')
    expect(settings).not.toMatch(/guardPage|currentMe/)
  })
})
