// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ds } from '@/components/ui/classes'
import { errorInfo } from '@/lib/errors'
import type { AiErrorCode, ReportCard, ReportView, ShownReport } from '@/types/aiReport'
import { AiBrief } from './AiBrief'

// 대시보드 AI 경영 리포트 요약의 그림(dashboard-ux REQ-2704·AC-2707.3, 시안 docs/mockups/dashboard-ux/index.html ai()).
// 상태 바꾸기의 자세한 시험은 useAiBrief.test.tsx가 맡고, 여기서는 상태마다 무엇을 그리는지와 누름 → 요청을 본다.
// 유료 AI는 부르지 않는다: fetch만 가짜로 바꿔 지어낸 답을 준다. 글자는 requirements.md(사용자 반영 ③)가 기준이다

const TODAY = '2026-11-07'
const NOW = new Date('2026-11-07T01:00:00.000Z')
const OCT = '2026-10'

const card = (tag: ReportCard['tag'], n: number): ReportCard => ({
  tag,
  text: `가짜 문장 ${tag} ${n}`,
  metric: `metric.${n}`,
  basis: `가짜 근거 ${tag} ${n}`,
})
const REPORT: ShownReport = {
  month: OCT,
  partial: false,
  summary: '가짜 요약: 10월은 신환이 늘었어요',
  cards: [card('up', 1), card('watch', 2), card('down', 3), card('guess', 4), card('up', 5), card('up', 6), card('watch', 7), card('watch', 8), card('guess', 9), card('guess', 10)],
  model: 'claude-opus-5-5',
  createdAt: '2026-11-02T00:12:00.000Z', // 한국 11월 2일 오전 9:12
}
const viewOf = (report: ShownReport | null, stale = false): ReportView => ({ report, stale, usage: { calls: 1, tokens: 10, costMicroUsd: 0 } })

type Answer = Response | Promise<Response>
const answerGet = vi.fn<() => Answer>()
const answerPost = vi.fn<() => Answer>()
const fetchSpy = vi.fn<typeof fetch>()
const reload = vi.fn()
const jsonAnswer = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })
const codeAnswer = (code: AiErrorCode) => jsonAnswer({ code }, 503)
const posts = () => fetchSpy.mock.calls.filter(([, init]) => init?.method === 'POST')
const gets = () => fetchSpy.mock.calls.filter(([, init]) => init?.method === 'GET')

function later() {
  let resolve!: (value: Response) => void
  const promise = new Promise<Response>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

const settle = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
async function draw() {
  const view = render(<AiBrief today={TODAY} />)
  await settle()
  return view
}
async function press(element: HTMLElement) {
  await act(async () => {
    fireEvent.click(element)
  })
  await settle()
}

const tokens = (classes: string | null) => (classes ?? '').split(/\s+/).filter(Boolean)
const hasAll = (el: Element, classes: string) => expect(tokens(el.getAttribute('class'))).toEqual(expect.arrayContaining(tokens(classes)))
const box = () => screen.getByRole('region', { name: '우리 병원 AI 경영 리포트' })
const title = () => screen.getByRole('heading', { level: 2, name: '우리 병원 AI 경영 리포트' })
const group = (name: string) => screen.getByRole('heading', { level: 3, name }).parentElement as HTMLElement
const cardTexts = (name: string) => within(group(name)).getAllByRole('listitem').map((li) => li.textContent)
const button = (name: string) => screen.getByRole('button', { name })
function expectErrorCard(code: AiErrorCode | 'E-AI-READ') {
  const alert = screen.getByRole('alert')
  const { what, fix } = errorInfo(code)
  within(alert).getByText(what)
  within(alert).getByText(fix)
  within(alert).getByText(`오류 번호 ${code}`)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  reload.mockReset()
  fetchSpy.mockReset()
  answerGet.mockReset()
  answerPost.mockReset()
  fetchSpy.mockImplementation(async (_input, init) => (init?.method === 'POST' ? answerPost() : answerGet()))
  vi.stubGlobal('fetch', fetchSpy)
  vi.stubGlobal('location', { origin: 'http://localhost:3000', href: 'http://localhost:3000/dashboard', reload })
  answerGet.mockImplementation(() => jsonAnswer(viewOf(null)))
  answerPost.mockImplementation(() => jsonAnswer({ report: REPORT }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('리포트 있음 (AC-2704.2·AC-2704.3·AC-2707.3)', () => {
  it('AC-2704.2·AC-2704.3·AC-2707.3: 제목 옆 "지난달 분석 · 10월" · 머리 글 · 분석 기간·견준 달·만든 때·Claude Opus 기반 분석 · 요약(title 600) · 묶음 셋(앞 3·2·2) · 꼬리 두 줄 · [전체 리포트 보기] · 토큰만 쓴 상자', async () => {
    answerGet.mockImplementation(() => jsonAnswer(viewOf(REPORT)))
    await draw()
    const section = box()
    expect(section.tagName).toBe('SECTION')
    hasAll(section, 'bg-canvas rounded-float p-6 max-md:p-4')
    expect(section.className).not.toMatch(/gradient|shadow|bg-\[|from-|to-/)
    const chip = within(section).getByText('지난달 분석 · 10월')
    expect(chip.parentElement).toBe(title().parentElement)
    expect(title().nextElementSibling).toBe(chip)
    within(section).getByText('위 기준일과 상관없이 지난달 한 달을 분석해요')
    within(section).getByText('지난달 병원 숫자를 읽고 달라진 점과 살펴볼 지표를 짚어 드려요.')
    for (const text of ['분석 기간 2026년 10월', '9월, 작년 10월과 견줘요', '11월 2일 오전 9:12에 만들었어요', 'Claude Opus 기반 분석']) within(section).getByText(text)
    expect(within(section).queryByText(/Claude Opus 5\.5|claude-opus-5-5/)).toBeNull()
    hasAll(within(section).getByText(REPORT.summary), 'text-title font-semibold')
    expect(cardTexts('핵심 변화')).toEqual(['늘었어요가짜 문장 up 1가짜 근거 up 1', '줄었어요가짜 문장 down 3가짜 근거 down 3', '늘었어요가짜 문장 up 5가짜 근거 up 5'])
    expect(cardTexts('주의할 지표')).toEqual(['살펴볼 것가짜 문장 watch 2가짜 근거 watch 2', '살펴볼 것가짜 문장 watch 7가짜 근거 watch 7'])
    expect(cardTexts('원인 짐작')).toEqual(['추정가짜 문장 guess 4가짜 근거 guess 4', '추정가짜 문장 guess 9가짜 근거 guess 9'])
    hasAll(within(group('원인 짐작')).getAllByText('추정')[0]!, ds.chip.neutral)
    within(section).getByText('근거 줄의 숫자는 앱이 저장된 통계에서 붙였어요. AI 문장에는 숫자가 없어요.')
    within(section).getByText("'추정'은 자료에 없는 원인을 짐작한 글이라 확정된 사실이 아니에요.")
    const link = within(section).getByRole('link', { name: '전체 리포트 보기' })
    expect(link.getAttribute('href')).toBe('/ai-report')
    hasAll(link, `${ds.button.primary} no-underline`)
    // 리포트에 없는 칸·다른 상태 글은 없다
    expect(within(section).queryByText(/추천|이 리포트를 만든 뒤|아직 끝나지 않은 달/)).toBeNull()
    expect(within(section).queryByRole('button')).toBeNull()
    expect(section.querySelector('[style]')).toBeNull()
  })

  it('AC-2704.2·AC-2704.3: 카드가 없는 묶음은 그리지 않고, 대신 답한 모델은 "{이름} 분석", 진행 중인 달·stale이면 안내가 붙는다', async () => {
    const report: ShownReport = { ...REPORT, month: '2026-11', partial: true, model: 'claude-fable-5-1', cards: [card('watch', 1)] }
    answerGet.mockImplementation(() => jsonAnswer(viewOf(report, true)))
    vi.setSystemTime(new Date('2026-12-01T01:00:00.000Z'))
    render(<AiBrief today="2026-12-01" />)
    await settle()
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['주의할 지표'])
    screen.getByText('claude-fable-5-1 분석')
    expect(screen.queryByText('Claude Opus 기반 분석')).toBeNull()
    screen.getByText('이 리포트는 11월 숫자가 다 차기 전에 만들었어요')
    screen.getByText('이 리포트를 만든 뒤 숫자가 바뀌었어요')
    screen.getByText('전체 리포트에서 [다시 분석]을 누르면 새 숫자로 다시 써요.')
  })
})

describe('리포트 없음 → 만들기 (AC-2704.4·AC-2704.5)', () => {
  it('AC-2704.4: 아직 안 만든 달 — 제목·가치 글·받는 것 셋·[AI 리포트 만들기]·보내는 자료 글, 저절로 POST하지 않는다', async () => {
    await draw()
    const section = box()
    within(section).getByText('지난달 분석 · 10월')
    within(section).getByRole('heading', { level: 3, name: '10월 리포트를 아직 만들지 않았어요' })
    within(section).getByText('10월 숫자를 9월, 작년 10월과 견줘, 원장님께 드릴 짧은 보고를 써 드려요. 1분쯤 걸려요.')
    expect(within(section).getAllByRole('listitem').map((li) => li.firstElementChild!.textContent)).toEqual(['핵심 변화', '주의할 지표', '추정'])
    hasAll(button('AI 리포트 만들기'), ds.button.primary)
    within(section).getByText('병원 집계 숫자만 보내요. 환자 이름·차트번호는 보내지 않아요.')
    expect(within(section).queryByRole('link', { name: '전체 리포트 보기' })).toBeNull()
    await advance(10 * 60_000)
    expect(posts()).toHaveLength(0)
    expect(gets()).toHaveLength(1)
  })

  it('AC-2704.5: 누르면 같은 단추가 "만드는 중"(aria-busy)·"지금까지 N초"가 오르고, 기다리는 동안 두 번 눌러도 POST 하나 → 받은 리포트를 그린다', async () => {
    const post = later()
    answerPost.mockReturnValueOnce(post.promise)
    await draw()
    const make = button('AI 리포트 만들기')
    await act(async () => {
      fireEvent.click(make)
      fireEvent.click(make)
    })
    expect(make.textContent).toBe('만드는 중')
    expect(make.getAttribute('aria-busy')).toBe('true')
    screen.getByText('지금까지 0초')
    await advance(2000)
    screen.getByText('지금까지 2초')
    await press(make)
    expect(posts()).toHaveLength(1)
    expect(posts()[0]![1]?.body).toBe(JSON.stringify({ month: OCT }))
    post.resolve(jsonAnswer({ report: { ...REPORT, createdAt: NOW.toISOString() } }))
    await settle()
    screen.getByText(REPORT.summary)
    screen.getByText('방금 만들었어요')
    expect(screen.queryByText(/지금까지 \d+초/)).toBeNull()
  })

  it('AC-2704.5: 실패(E-AI-BUSY)면 lib/errors 글·번호 상자와 [다시 분석]이고, 누르기 전에는 다시 부르지 않는다', async () => {
    answerPost.mockImplementationOnce(() => codeAnswer('E-AI-BUSY'))
    await draw()
    await press(button('AI 리포트 만들기'))
    expectErrorCard('E-AI-BUSY')
    hasAll(button('다시 분석'), ds.button.primary)
    await advance(10 * 60_000)
    expect(posts()).toHaveLength(1)
    await press(button('다시 분석'))
    expect(posts()).toHaveLength(2)
    screen.getByText(REPORT.summary)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('통계 없음·읽는 중·읽기 실패 (AC-2704.6·AC-2704.7)', () => {
  it('AC-2704.6: E-AI-NO-DATA면 "이 달 통계가 아직 없어요" · 필요한 자료 · [통계 탭으로](/stats) · 오류 번호', async () => {
    answerPost.mockImplementationOnce(() => codeAnswer('E-AI-NO-DATA'))
    await draw()
    await press(button('AI 리포트 만들기'))
    const { what, fix } = errorInfo('E-AI-NO-DATA')
    expect(what).toBe('이 달 통계가 아직 없어요')
    expect(fix).toBe('통계 탭에서 그 달 비트 자료를 먼저 넣어 주세요.')
    screen.getByRole('heading', { level: 3, name: what })
    screen.getByText(fix)
    expect(screen.getByRole('link', { name: '통계 탭으로' }).getAttribute('href')).toBe('/stats')
    screen.getByText('오류 번호 E-AI-NO-DATA')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('AC-2704.7: 읽는 중은 aria-hidden 뼈대 + role=status "10월 AI 리포트를 읽고 있어요"(숫자 없음), 읽기 실패는 E-AI-READ 상자 + [리포트 다시 읽기](대시보드 [다시 읽기]와 다른 이름) — 누를 때만 다시 GET', async () => {
    const get = later()
    answerGet.mockReturnValueOnce(get.promise)
    answerGet.mockImplementationOnce(() => jsonAnswer(viewOf(REPORT)))
    render(<AiBrief today={TODAY} />)
    await settle()
    const section = box()
    expect(section.getAttribute('aria-busy')).toBe('true')
    expect(within(section).getByRole('status').textContent).toBe('10월 AI 리포트를 읽고 있어요')
    const bones = section.querySelector('[aria-hidden="true"]')!
    expect(bones).not.toBeNull()
    expect(bones.textContent).toBe('')
    get.resolve(jsonAnswer({}, 500))
    await settle()
    expect(section.getAttribute('aria-busy')).toBeNull()
    expectErrorCard('E-AI-READ')
    await advance(10 * 60_000)
    expect(gets()).toHaveLength(1)
    await press(button('리포트 다시 읽기'))
    expect(gets()).toHaveLength(2)
    screen.getByText(REPORT.summary)
    expect(posts()).toHaveLength(0)
  })

  it('AC-2704.7: 로그인이 끊긴 답이면 페이지를 다시 읽는다', async () => {
    answerGet.mockImplementationOnce(() => new Response('', { status: 401 }))
    await draw()
    expect(reload).toHaveBeenCalledTimes(1)
  })
})

describe('글자로만 그리기·요청·불러오기 (AC-2704.8)', () => {
  it('AC-2704.8: AI 글(summary·text·basis)에 든 태그 모양 글자는 글자 그대로 보이고 요소가 되지 않는다', async () => {
    const html = '<img src=x onerror=alert(1)><b>굵게</b>'
    answerGet.mockImplementation(() =>
      jsonAnswer(viewOf({ ...REPORT, summary: `요약 ${html}`, cards: [{ tag: 'up', text: `문장 ${html}`, metric: 'm', basis: `근거 ${html}` }] })),
    )
    await draw()
    const section = box()
    expect(section.querySelector('img, b')).toBeNull()
    within(section).getByText(`요약 ${html}`)
    within(section).getByText(`문장 ${html}`)
    within(section).getByText(`근거 ${html}`)
  })

  it('AC-2704.8: 소스에 innerHTML이 없고, AI는 reportClient·lib/ai/reportScreen·lib/ai/markdown만 가져온다(AI 리포트 화면 부품 없음)', () => {
    const dir = join(process.cwd(), 'src/components/dashboard/ai')
    for (const file of ['AiBrief.tsx', 'useAiBrief.ts']) {
      const code = readFileSync(join(dir, file), 'utf8')
      expect(code, file).not.toMatch(/dangerouslySetInnerHTML|innerHTML/)
      expect(code, file).not.toMatch(/AiReportScreen|ReportBody|RedoDialog|UsageAside|components\/stats/)
      const imports = [...code.matchAll(/from '([^']+)'/g)].map((m) => m[1]!).filter((p) => /ai/i.test(p))
      for (const path of imports) expect(['@/components/ai-report/reportClient', '@/lib/ai/reportScreen', '@/lib/ai/markdown', '@/types/aiReport', './useAiBrief'], file).toContain(path)
    }
  })
})
