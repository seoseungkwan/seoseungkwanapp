// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ViewingProvider, type Viewing } from '@/components/shell/viewing'
import type { ReportView, ShownReport } from '@/types/aiReport'
import { AiReportScreen } from './AiReportScreen'
import { analyzeMonth, loadMonth } from './reportClient'

// 보는 중 AI 리포트 (admin-view REQ-8011 AC-8011.2, design.md '탭마다 읽기만' AI 리포트 줄).
// 관리자가 다른 의원을 보는 중이면 [AI 분석]·[다시 분석]이 없고, 저장된 보는 의원 리포트(GET 읽기 — 서버가 보기 머리로 그 의원 줄을 읽는다)는 보인다.
// [복사]·달 옮기기는 읽기라 그대로다. viewing={null}이면 지금과 같다.
// 부르기(reportClient)와 병원 정보 훅은 흉내다(실제 서버·Supabase에 붙지 않는다). 숫자·문장은 지어낸 것이다

vi.mock('./reportClient', () => ({ loadMonth: vi.fn(), analyzeMonth: vi.fn() }))
vi.mock('@/components/clinic/useClinicProfile', () => ({ useClinicProfile: () => ({ profile: { honorific: '원장님' } }) }))

const TODAY = '2026-11-18'
const OCT = '2026-10'
const VIEWING: Viewing = { hospitalId: '22222222-2222-4222-8222-222222222222', name: '가짜다른의원' }
const REPORT: ShownReport = {
  month: OCT,
  partial: false,
  summary: '가짜 요약: 다른 의원 10월 신환이 늘었어요',
  cards: [{ tag: 'up', text: '가짜 문장: 신환이 늘었어요', metric: 'total.newPatients', basis: '근거 · 가짜 신환 100명 → 120명' }],
  model: 'claude-opus-5-5',
  createdAt: '2026-11-02T00:12:00.000Z',
}
const viewOf = (report: ShownReport | null, stale = false): ReportView => ({ report, stale, usage: { calls: 1, tokens: 100, costMicroUsd: 1000 } })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-18T05:20:00.000Z'))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
})

const inView = (viewing: Viewing | null, children: ReactNode) => <ViewingProvider viewing={viewing}>{children}</ViewingProvider>
const head = () => screen.getByRole('group', { name: '달 고르기' }).parentElement as HTMLElement

describe('AC-8011.2: 보는 중 AI 리포트', () => {
  it('AC-8011.2: 저장된 보는 의원 리포트는 보이고 [다시 분석]이 없다 — [복사]·달 옮기기는 그대로', async () => {
    vi.mocked(loadMonth).mockResolvedValue({ kind: 'ok', view: viewOf(REPORT) })
    render(inView(VIEWING, <AiReportScreen today={TODAY} />))
    expect(await screen.findByRole('heading', { level: 2, name: REPORT.summary })).toBeTruthy()
    expect(screen.getByText('가짜 문장: 신환이 늘었어요')).toBeTruthy()
    expect(within(head()).queryByRole('button', { name: '다시 분석' })).toBeNull()
    expect(screen.queryByRole('button', { name: /분석/ })).toBeNull()
    expect(screen.getByRole('button', { name: '복사' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '이전 달' })).toBeTruthy()
    expect(loadMonth).toHaveBeenCalledWith(OCT)
  })

  it('AC-8011.2: 숫자가 바뀐 리포트(stale)여도 [다시 분석]이 없다', async () => {
    vi.mocked(loadMonth).mockResolvedValue({ kind: 'ok', view: viewOf(REPORT, true) })
    render(inView(VIEWING, <AiReportScreen today={TODAY} />))
    await screen.findByRole('heading', { level: 2, name: REPORT.summary })
    expect(screen.queryByRole('button', { name: /분석/ })).toBeNull()
  })

  it('AC-8011.2: 리포트가 없는 달이면 [AI 분석]이 없다(빈 달 글만)', async () => {
    vi.mocked(loadMonth).mockResolvedValue({ kind: 'ok', view: viewOf(null) })
    render(inView(VIEWING, <AiReportScreen today={TODAY} />))
    expect(await screen.findByRole('heading', { level: 2, name: '10월 리포트를 아직 만들지 않았어요' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'AI 분석' })).toBeNull()
    expect(screen.queryByRole('button', { name: /분석/ })).toBeNull()
  })

  it('AC-8011.2: 보는 중에는 분석(POST)을 한 번도 부르지 않는다', async () => {
    vi.mocked(loadMonth).mockResolvedValue({ kind: 'ok', view: viewOf(REPORT) })
    render(inView(VIEWING, <AiReportScreen today={TODAY} />))
    await screen.findByRole('heading', { level: 2, name: REPORT.summary })
    expect(analyzeMonth).not.toHaveBeenCalled()
  })
})

describe('AC-8011.2: viewing={null}이면 지금과 같다', () => {
  it('AC-8011.2: 리포트가 있으면 [다시 분석], 없으면 [AI 분석]이 있다', async () => {
    vi.mocked(loadMonth).mockResolvedValue({ kind: 'ok', view: viewOf(REPORT) })
    const first = render(inView(null, <AiReportScreen today={TODAY} />))
    await screen.findByRole('heading', { level: 2, name: REPORT.summary })
    expect(within(head()).getByRole('button', { name: '다시 분석' })).toBeTruthy()
    first.unmount()
    vi.mocked(loadMonth).mockResolvedValue({ kind: 'ok', view: viewOf(null) })
    render(inView(null, <AiReportScreen today={TODAY} />))
    expect(await screen.findByRole('button', { name: 'AI 분석' })).toBeTruthy()
  })
})
