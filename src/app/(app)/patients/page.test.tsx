// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBridge } from '@/components/claim/useBridge'
import PatientsPage, { metadata } from './page'

// /patients 환자 탭(AC-610.1·610.2·610.5). 주소에서 읽는 것은 ?tool= 하나이고, 그 값도 정해 둔 도구 이름으로만 쓴다
vi.mock('@/components/claim/useBridge', () => ({ useBridge: vi.fn() }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => ({}) }))
vi.mock('@/lib/storage/contactCounts', () => ({ readContactCount: () => Promise.resolve(null) }))

class FakeWorker {
  postMessage() {}
  addEventListener() {}
  removeEventListener() {}
  terminate() {}
}

const open = async (tool?: string | string[]) => {
  const page = (await PatientsPage({ searchParams: Promise.resolve(tool === undefined ? {} : { tool }) })) as ReactElement
  return render(page)
}
const toolNav = () => screen.findByRole('navigation', { name: '환자 도구' })

beforeEach(() => {
  vi.stubGlobal('Worker', FakeWorker)
  vi.mocked(useBridge).mockReturnValue({
    state: 'no-extension',
    hello: null,
    helloError: null,
    helperUpdateAvailable: false,
    call: vi.fn(),
    stream: vi.fn(),
    onProgress: vi.fn(),
    retry: vi.fn(),
  } as unknown as ReturnType<typeof useBridge>)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('/patients 페이지', () => {
  it('AC-610.1·AC-610.5: 브라우저 탭 이름은 "환자"이고 고정 글자다(이름·전화·차트번호가 들어갈 길이 없다)', () => {
    expect(metadata.title).toBe('환자')
    const source = readFileSync(join(process.cwd(), 'src/app/(app)/patients/page.tsx'), 'utf8')
    expect(source).not.toMatch(/generateMetadata/)
  })

  it('AC-610.1: 준비 중 화면이 아니라 환자 탭이 열린다(h1 "환자")', async () => {
    await open()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('환자')
    expect(document.body.textContent).not.toContain('준비 중이에요')
  })

  it.each([
    ['followup', 'F/U 명단'],
    ['recall', '정기 주사 문자 명단'],
    ['messages', '문자 문구'],
  ])('AC-610.2: ?tool=%s이면 [%s]에 aria-current가 붙는다', async (tool, label) => {
    await open(tool)
    const current = within(await toolNav())
      .getAllByRole('link')
      .filter((a) => a.getAttribute('aria-current') === 'page')
    expect(current.map((a) => a.textContent)).toEqual([label])
  })

  it.each([
    ['없음', undefined],
    ['모르는 값', 'stats'],
    ['여러 값', ['recall', 'messages']],
  ])('AC-610.2: ?tool이 %s이면 F/U 명단이다', async (_name, tool) => {
    await open(tool)
    const current = within(await toolNav())
      .getAllByRole('link')
      .filter((a) => a.getAttribute('aria-current') === 'page')
    expect(current.map((a) => a.textContent)).toEqual(['F/U 명단'])
  })

  it('AC-610.5: 도구 링크의 주소에는 도구 이름만 있고, 주소로 받은 글자를 다시 쓰지 않는다', async () => {
    const { container } = await open('가상환자01 010-0000-0101')
    const links = within(await toolNav()).getAllByRole('link')
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/patients?tool=followup', '/patients?tool=recall', '/patients?tool=messages'])
    await waitFor(() => expect(screen.getByText('자료 없음')).toBeTruthy())
    expect(container.innerHTML).not.toContain('가상환자01')
    expect(container.innerHTML).not.toContain('010-0000-0101')
  })

  it('AC-610.5: 페이지는 서버 컴포넌트이고 searchParams에서 tool만 읽는다', () => {
    const source = readFileSync(join(process.cwd(), 'src/app/(app)/patients/page.tsx'), 'utf8')
    expect(source).not.toMatch(/['"]use client['"]/)
    expect(source).toMatch(/\btoolFrom\(/)
  })
})
