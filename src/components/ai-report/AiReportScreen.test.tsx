// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { StrictMode, type ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ViewingProvider } from '@/components/shell/viewing'
import { ds } from '@/components/ui/classes'
import { reportCopyText } from '@/lib/ai/reportScreen'
import { errorInfo } from '@/lib/errors'
import type { AiErrorCode, AiUsageView, ReportView, ShownReport } from '@/types/aiReport'
import { AiReportScreen } from './AiReportScreen'

// 병원 정보 훅(specs/uisarang-upload AC-8816.7 · §10-0): 화면이 쓰는 EMR(보는 중이면 보는 의원 EMR)만 이 파일 안에서 정한다.
// 처음은 지금 시험 환경과 같은 '읽기 실패'(Supabase 설정 없음 → 기본값 · 원장님 · 비트)라 다른 시험은 그대로다
const clinic = vi.hoisted(() => ({ state: 'failed' as 'loading' | 'ready' | 'failed', emr: 'bit' as 'bit' | 'uisarang' }))
vi.mock('@/components/clinic/useClinicProfile', () => ({
  useClinicProfile: () => ({
    state: clinic.state,
    profile: { displayName: null, phone: null, address: null, honorific: '원장님', hours: [], closedDates: [], staff: [], logoPath: null, emr: clinic.emr },
    saved: clinic.state === 'ready',
    signupName: '',
    signupPhone: null,
    name: '',
    logoDataUrl: null,
    reload: () => undefined,
  }),
}))

// AI 리포트 화면의 상태와 동작(spec ai-report-screen REQ-708~711·713, design.md '화면 상태', 시안 docs/mockups/ai-report/index.html).
// fetch만 가짜다. reportClient는 진짜를 지난다. 시계도 가짜고 오늘은 prop으로 준다. 숫자는 이 파일 안에서만 지어낸다

const TODAY = '2026-11-18'
const NOW = new Date('2026-11-18T05:20:00.000Z')
const SEP = '2026-09'
const OCT = '2026-10' // 첫 달(지난달)
const NOV = '2026-11' // 이번 달(끝 달)

const USAGE: AiUsageView = { calls: 3, tokens: 12400, costMicroUsd: 1234567 }
const USAGE_TEXT = ['3회', '12,400개', '$1.23']
const USAGE_AFTER: AiUsageView = { calls: 4, tokens: 15000, costMicroUsd: 2500000 }
const USAGE_AFTER_TEXT = ['4회', '15,000개', '$2.50']
const NO_USAGE_TEXT = ['—', '—', '—']

const reportFor = (month: string, over: Partial<ShownReport> = {}): ShownReport => ({
  month,
  partial: false,
  summary: `가짜 요약: ${month} 신환이 늘었어요`,
  cards: [
    { tag: 'up', text: '가짜 문장: 신환이 늘었어요', metric: 'total.newPatients', basis: '근거 · 가짜 신환 486명 → 524명' },
    { tag: 'watch', text: '가짜 문장: 재방문율을 볼 만해요', metric: 'revisit.within7', basis: '근거 · 가짜 재방문율 41.2% → 38.6%' },
  ],
  model: 'claude-opus-5-5',
  createdAt: '2026-11-02T00:12:00.000Z', // 한국 시각 11월 2일 오전 9:12
  ...over,
})
const OCT_REPORT = reportFor(OCT)
// 방금 받은 리포트: 지금 시각에 만들어졌다
const NEW_REPORT = reportFor(OCT, { summary: '가짜 요약: 새로 만든 리포트', createdAt: NOW.toISOString() })

const viewOf = (report: ShownReport | null, over: Partial<ReportView> = {}): ReportView => ({
  report,
  stale: false,
  usage: USAGE,
  ...over,
})

// ── 가짜 fetch ───────────────────────────────────────────

type Answer = Response | Promise<Response>
const answerGet = vi.fn<(month: string) => Answer>()
const answerPost = vi.fn<(month: string) => Answer>()
const fetchSpy = vi.fn<typeof fetch>()
const reload = vi.fn()

const jsonAnswer = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })
const viewAnswer = (view: ReportView) => jsonAnswer(view)
const reportAnswer = (report: ShownReport) => jsonAnswer({ report })
const codeAnswer = (code: AiErrorCode) => jsonAnswer({ code }, 503)
// 진짜 브라우저가 redirect: 'manual'에서 주는 돌려보내는 답. Response 생성자로는 status 0을 못 만든다
const redirected = () => ({ type: 'opaqueredirect', status: 0 }) as unknown as Response

// 달마다 정해 둔 답. 없는 달은 '리포트 없음'
function serve(views: Record<string, ReportView> = {}) {
  answerGet.mockImplementation((month) => viewAnswer(views[month] ?? viewOf(null)))
}

// 답을 시험이 정한 때에 풀어 준다
function later<T = Response>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const callsOf = (method: string) => fetchSpy.mock.calls.filter(([, init]) => init?.method === method)
const gets = () => callsOf('GET').map(([url]) => String(url))
const posts = () => callsOf('POST').map(([, init]) => String(init?.body))
const urlOf = (month: string) => `/api/ai/report?month=${month}`

// ── 그리기·시계 ──────────────────────────────────────────

let user: UserEvent

// 시계를 움직이지 않고 밀린 약속만 푼다
const settle = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })

async function draw(ui: ReactElement = <AiReportScreen today={TODAY} />) {
  const view = render(ui)
  await settle()
  return view
}

async function click(element: HTMLElement) {
  await user.click(element)
  await settle()
}

// ── 찾기 ─────────────────────────────────────────────────

const monthGroup = () => screen.getByRole('group', { name: '달 고르기' })
const headActions = () => monthGroup().parentElement as HTMLElement
const headRedo = () => within(headActions()).getByRole('button', { name: '다시 분석' })
const queryHeadRedo = () => within(headActions()).queryByRole('button', { name: '다시 분석' })
const headBusy = () => within(headActions()).getByRole('button', { name: '분석 중' })
const queryHeadBusy = () => within(headActions()).queryByRole('button', { name: '분석 중' })
const prevButton = () => screen.getByRole('button', { name: '이전 달' })
const nextButton = () => screen.getByRole('button', { name: '다음 달' })
const aiButton = () => screen.getByRole('button', { name: 'AI 분석' })
const queryAiButton = () => screen.queryByRole('button', { name: 'AI 분석' })
const copyButton = () => screen.getByRole('button', { name: '복사' })
const queryCopied = () => screen.queryByRole('button', { name: '복사했어요' })
const usageValues = () =>
  Array.from(screen.getByRole('complementary', { name: 'AI 사용량과 보내는 자료' }).querySelectorAll('dd')).map((dd) => dd.textContent)
const queryReading = () => screen.queryByText(/리포트를 읽고 있어요/)
const summaryOf = (report: ShownReport) => screen.getByRole('heading', { level: 2, name: report.summary })
const querySummary = (report: ShownReport) => screen.queryByRole('heading', { level: 2, name: report.summary })
const emptyTitle = (name: string) => screen.getByRole('heading', { level: 2, name: `${name} 리포트를 아직 만들지 않았어요` })

function expectErrorCard(code: AiErrorCode | 'E-AI-READ') {
  const card = screen.getByRole('alert')
  const { what, fix } = errorInfo(code)
  within(card).getByText(what)
  within(card).getByText(fix)
  within(card).getByText(`오류 번호 ${code}`)
}

const expectNoError = () => expect(screen.queryByRole('alert')).toBeNull()

// 창을 띄워 그 안의 [다시 분석]을 눌러 분석을 시작한다
async function confirmRedo() {
  await click(headRedo())
  await click(within(screen.getByRole('dialog')).getByRole('button', { name: '다시 분석' }))
}

// ── 복사 ─────────────────────────────────────────────────

const COPY_FAILED = '복사하지 못했어요. 문장을 길게 눌러 직접 복사해 주세요.'

// user-event가 setup 때 가짜 clipboard를 달아 둔다 → 그 뒤에 덮어쓴다
function stubClipboard(value: { writeText: (text: string) => Promise<void> } | undefined) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value })
}
const copyWorks = () => {
  const writeText = vi.fn(async () => undefined)
  stubClipboard({ writeText })
  return writeText
}
const copyFails = () =>
  stubClipboard({
    writeText: async () => {
      throw new Error('가짜 막힘')
    },
  })

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  // Testing Library는 jest 전역이 있어야 가짜 시계를 알아본다. 없으면 user-event가 끝나지 않는 setTimeout을 기다린다
  vi.stubGlobal('jest', { advanceTimersByTime: vi.advanceTimersByTime })
  reload.mockReset()
  answerGet.mockReset()
  answerPost.mockReset()
  fetchSpy.mockReset()
  fetchSpy.mockImplementation(async (input, init) => {
    if (init?.method === 'POST') return answerPost((JSON.parse(String(init.body)) as { month: string }).month)
    return answerGet(new URLSearchParams(String(input).split('?')[1]).get('month') ?? '')
  })
  vi.stubGlobal('fetch', fetchSpy)
  // jsdom의 location.reload는 바꿔 끼울 수 없다 → location을 통째로 가짜로
  vi.stubGlobal('location', { origin: 'http://localhost:3000', href: 'http://localhost:3000/ai-report', reload })
  serve()
  answerPost.mockImplementation(() => reportAnswer(NEW_REPORT))
  user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  Reflect.deleteProperty(navigator, 'clipboard')
})

describe('시안 9상태', () => {
  it("AC-709.1 시안 '리포트가 있는 달': 보고 줄·만든 때·요약·카드, 머리 [다시 분석]은 보조, [AI 분석]·안내 상자 없음", async () => {
    serve({ [OCT]: viewOf(OCT_REPORT) })
    await draw()
    screen.getByText('2026년 10월 보고')
    screen.getByText('11월 2일 오전 9:12에 만들었어요 · Claude Opus 5.5')
    summaryOf(OCT_REPORT)
    const items = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining(OCT_REPORT.cards[0].text),
      expect.stringContaining(OCT_REPORT.cards[1].text),
    ])
    expect(headRedo().className).toContain(ds.button.secondary)
    expect(headRedo().getAttribute('aria-busy')).toBeNull()
    expect(queryAiButton()).toBeNull()
    expect(screen.queryByText('이 리포트를 만든 뒤 숫자가 바뀌었어요')).toBeNull()
    expect(usageValues()).toEqual(USAGE_TEXT)
    expectNoError()
  })

  it("AC-710.1 시안 '아직 안 만든 달': 빈 화면과 큰 [AI 분석], 머리에 [다시 분석] 없음", async () => {
    await draw()
    emptyTitle('10월')
    screen.getByText('[AI 분석]을 누르면 9월, 작년 10월과 견줘 원장님께 드릴 보고를 1분쯤 걸려 써 드려요.')
    expect(aiButton().className).toContain(ds.button.primaryLarge)
    expect(queryHeadRedo()).toBeNull()
    expect(queryHeadBusy()).toBeNull()
    expect(usageValues()).toEqual(USAGE_TEXT)
    expectNoError()
  })

  it("AC-710.2 시안 '분석 중': 글·aria-busy·초가 늘어남·이전 다음 막힘, POST 몸통이 정확히 그 달", async () => {
    answerPost.mockReturnValueOnce(later().promise)
    await draw()
    await click(aiButton())
    screen.getByRole('heading', { level: 2, name: '10월 숫자를 읽고 있어요' })
    expect(screen.getByText('1분쯤 걸려요. 이 화면을 그대로 두고 기다려 주세요.').getAttribute('role')).toBe('status')
    expect(screen.getByRole('button', { name: '분석 중' }).getAttribute('aria-busy')).toBe('true')
    screen.getByText('지금까지 0초')
    expect(prevButton()).toHaveProperty('disabled', true)
    expect(nextButton()).toHaveProperty('disabled', true)
    await advance(3000)
    screen.getByText('지금까지 3초')
    expect(queryHeadRedo()).toBeNull()
    expect(queryHeadBusy()).toBeNull()
    expect(posts()).toEqual([`{"month":"${OCT}"}`])
  })

  it("AC-709.4 시안 '진행 중인 달': 이번 달 리포트에 '진행 중' 칩과 안내 상자, 끝 달이라 다음 단추가 막힘", async () => {
    const report = reportFor(NOV, { partial: true })
    serve({ [NOV]: viewOf(report) })
    await draw()
    await click(nextButton())
    screen.getByText('2026년 11월 보고')
    screen.getByText('진행 중')
    screen.getByText('11월은 아직 끝나지 않은 달이에요')
    screen.getByText('숫자가 적게 보일 수 있어요. 달이 끝난 뒤 다시 분석하면 다 찬 숫자로 써요.')
    expect(nextButton()).toHaveProperty('disabled', true)
  })

  it("AC-709.5 시안 '숫자가 바뀐 리포트': 안내 상자와 주 단추 [다시 분석]", async () => {
    serve({ [OCT]: viewOf(OCT_REPORT, { stale: true }) })
    await draw()
    screen.getByText('이 리포트를 만든 뒤 숫자가 바뀌었어요')
    screen.getByText('[다시 분석]을 누르면 새 숫자로 다시 써요.')
    expect(headRedo().className).toContain(ds.button.primary)
    expect(headRedo().className).not.toContain(ds.button.secondary)
  })

  it.each<[string, AiErrorCode]>([
    ['AI가 바쁠 때', 'E-AI-BUSY'],
    ['사용 한도에 닿았을 때', 'E-AI-LIMIT'],
    ['만들지 못했을 때', 'E-AI-FAILED'],
  ])("AC-710.6 시안 '%s': %s 오류 상자가 옛 리포트 위에 있고 머리는 [다시 분석]", async (_, code) => {
    serve({ [OCT]: viewOf(OCT_REPORT) })
    answerPost.mockImplementationOnce(() => codeAnswer(code))
    await draw()
    await confirmRedo()
    expectErrorCard(code)
    const summary = summaryOf(OCT_REPORT)
    expect(screen.getByRole('alert').compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(headRedo()).toBeTruthy()
    expect(queryAiButton()).toBeNull()
  })

  it("AC-710.5 시안 '통계가 없는 달': 글·링크·번호, [AI 분석] 없음, 옮겼다 돌아오면 '아직 만들지 않았어요'", async () => {
    answerPost.mockImplementationOnce(() => codeAnswer('E-AI-NO-DATA'))
    await draw()
    await click(aiButton())
    screen.getByRole('heading', { level: 2, name: '이 달 통계가 아직 없어요' })
    screen.getByText('통계 탭에서 그 달 비트 자료를 먼저 넣어 주세요.')
    expect(screen.getByRole('link', { name: '통계 탭으로' }).getAttribute('href')).toBe('/stats')
    screen.getByText('오류 번호 E-AI-NO-DATA')
    expect(queryAiButton()).toBeNull()
    expect(queryHeadRedo()).toBeNull()
    expectNoError()

    await click(prevButton())
    emptyTitle('9월')
    await click(nextButton())
    emptyTitle('10월')
    expect(screen.queryByRole('link', { name: '통계 탭으로' })).toBeNull()
    expect(queryAiButton()).not.toBeNull()
  })
})

describe('추가 상태', () => {
  it("AC-708.4 '읽는 중': role=status 글, [AI 분석]·[다시 분석] 없음, 사용량 '—', 움직임 클래스 없음", async () => {
    answerGet.mockReturnValueOnce(later().promise)
    const { container } = await draw()
    expect(screen.getByText('10월 리포트를 읽고 있어요').getAttribute('role')).toBe('status')
    expect(queryAiButton()).toBeNull()
    expect(queryHeadRedo()).toBeNull()
    expect(usageValues()).toEqual(NO_USAGE_TEXT)
    expect(container.querySelectorAll('[class*="animate-"], [class*="transition"]')).toHaveLength(0)
  })

  it("AC-708.5 '읽기 실패': 오류 상자·[다시 읽기], [AI 분석]·[다시 분석] 없음, 사용량 '—', [다시 읽기]가 같은 달을 다시 부른다", async () => {
    answerGet.mockImplementationOnce(() => jsonAnswer({ code: 'E-AI-READ' }, 500))
    answerGet.mockImplementationOnce(() => viewAnswer(viewOf(OCT_REPORT)))
    await draw()
    expectErrorCard('E-AI-READ')
    expect(queryAiButton()).toBeNull()
    expect(queryHeadRedo()).toBeNull()
    expect(usageValues()).toEqual(NO_USAGE_TEXT)

    await click(screen.getByRole('button', { name: '다시 읽기' }))
    expect(gets()).toEqual([urlOf(OCT), urlOf(OCT)])
    summaryOf(OCT_REPORT)
    expect(usageValues()).toEqual(USAGE_TEXT)
    expectNoError()
  })

  it("AC-708.5 '읽기 실패': [다시 읽기]를 누르면 답이 올 때까지 읽는 중으로 간다", async () => {
    answerGet.mockImplementationOnce(() => jsonAnswer({}, 500))
    const second = later()
    answerGet.mockReturnValueOnce(second.promise)
    await draw()
    await click(screen.getByRole('button', { name: '다시 읽기' }))
    screen.getByText('10월 리포트를 읽고 있어요')
    expectNoError()
    second.resolve(viewAnswer(viewOf(null)))
    await settle()
    emptyTitle('10월')
  })

  it("AC-2008.3 '달 지난 partial': 덜 찬 숫자로 만든 지난 달 리포트에 '덜 찬 숫자' 칩과 통계 탭 다시 불러오기 안내 상자", async () => {
    serve({ [OCT]: viewOf(reportFor(OCT, { partial: true })) })
    await draw()
    screen.getByText('덜 찬 숫자')
    screen.getByText('이 리포트는 10월 숫자가 다 차기 전에 만들었어요')
    screen.getByText('숫자가 적게 잡혀 있을 수 있어요. 통계 탭에서 그 달을 다시 불러온 뒤 [다시 분석]을 눌러 주세요.')
    expect(screen.queryByText('달 끝나기 전')).toBeNull()
    expect(screen.queryByText(/끝나기 전에 만들었어요/)).toBeNull()
  })

  it("AC-711.4 '리포트 위 NO-DATA 오류': 옛 리포트가 그대로이고 그 위에 오류 상자, 통계 탭 빈 화면으로 안 간다", async () => {
    serve({ [OCT]: viewOf(OCT_REPORT) })
    answerPost.mockImplementationOnce(() => codeAnswer('E-AI-NO-DATA'))
    await draw()
    await confirmRedo()
    expectErrorCard('E-AI-NO-DATA')
    summaryOf(OCT_REPORT)
    expect(screen.queryByRole('link', { name: '통계 탭으로' })).toBeNull()
    expect(headRedo()).toBeTruthy()
  })
})

describe('AC-708.1: 머리와 첫 달', () => {
  it('AC-708.1: 제목·견주는 글·달 고르기가 있고 첫 달은 지난달, 첫 GET이 그 달을 부른다', async () => {
    await draw()
    screen.getByRole('heading', { level: 1, name: 'AI 리포트' })
    screen.getByText('2026년 10월을 9월, 작년 10월과 견줘요')
    const output = within(monthGroup()).getByRole('status')
    expect(output.tagName).toBe('OUTPUT')
    expect(output.getAttribute('aria-live')).toBe('polite')
    expect(output.textContent).toBe('2026년 10월')
    expect(gets()).toEqual([urlOf(OCT)])
  })

  it('AC-708.1: 이전 단추는 왼쪽, 다음 단추는 오른쪽으로 돌린 chev다', async () => {
    await draw()
    expect(prevButton().querySelector('svg')?.getAttribute('class')?.split(/\s+/)).toContain('rotate-90')
    expect(nextButton().querySelector('svg')?.getAttribute('class')?.split(/\s+/)).toContain('-rotate-90')
  })

  it('AC-708.1: 끝 달(이번 달)에서 다음 단추가 막히고, 앞으로 갈 수 있으면 이전 단추는 열려 있다', async () => {
    await draw()
    expect(nextButton()).toHaveProperty('disabled', false)
    await click(nextButton())
    expect(nextButton()).toHaveProperty('disabled', true)
    expect(prevButton()).toHaveProperty('disabled', false)
  })

  it('AC-708.1: 처음 달(2026-01)에서 이전 단추가 막힌다', async () => {
    await draw(<AiReportScreen today="2026-02-10" />)
    expect(gets()).toEqual([urlOf('2026-01')])
    expect(prevButton()).toHaveProperty('disabled', true)
    expect(nextButton()).toHaveProperty('disabled', false)
  })

  it('AC-708.1: 머리 아래 선과 8:4 칸, 좁은 폭에서 한 줄로 내려오는 클래스를 옮겼다', async () => {
    const { container } = await draw()
    const head = headActions().parentElement as HTMLElement
    expect(head.className).toContain('border-b border-line-strong')
    const aside = screen.getByRole('complementary')
    const side = aside.parentElement as HTMLElement
    const grid = side.parentElement as HTMLElement
    expect(grid.className).toContain('grid-cols-12')
    expect(side.className).toContain('col-span-full')
    expect(side.className).toContain('lg:col-span-4')
    expect(side.className).toContain('lg:border-l')
    expect((side.previousElementSibling as HTMLElement).className).toContain('lg:col-span-8')
    expect(container.contains(grid)).toBe(true)
  })
})

describe('AC-708.2: 달을 옮기면', () => {
  it('AC-708.2: 그 달을 새로 부르고 읽는 동안 읽는 중이다', async () => {
    await draw()
    const nextRead = later()
    answerGet.mockReturnValueOnce(nextRead.promise)
    await click(prevButton())
    expect(gets()).toEqual([urlOf(OCT), urlOf(SEP)])
    screen.getByText('2026년 9월을 8월, 작년 9월과 견줘요')
    screen.getByText('9월 리포트를 읽고 있어요')
    expect(usageValues()).toEqual(NO_USAGE_TEXT)
    nextRead.resolve(viewAnswer(viewOf(null)))
    await settle()
    emptyTitle('9월')
  })

  it('AC-708.2: 앞 달의 오류가 사라지고 돌아와도 다시 뜨지 않는다', async () => {
    answerPost.mockImplementationOnce(() => codeAnswer('E-AI-BUSY'))
    await draw()
    await click(aiButton())
    expectErrorCard('E-AI-BUSY')
    await click(prevButton())
    expectNoError()
    await click(nextButton())
    expectNoError()
  })

  it('AC-708.2: 앞 달의 "복사했어요"가 사라진다', async () => {
    serve({ [OCT]: viewOf(OCT_REPORT), [SEP]: viewOf(reportFor(SEP)) })
    await draw()
    copyWorks()
    await click(copyButton())
    expect(queryCopied()).not.toBeNull()
    await click(prevButton())
    expect(queryCopied()).toBeNull()
    copyButton()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('AC-708.2: 앞 달의 복사 실패 글이 사라진다', async () => {
    serve({ [OCT]: viewOf(OCT_REPORT), [SEP]: viewOf(reportFor(SEP)) })
    await draw()
    copyFails()
    await click(copyButton())
    screen.getByText(COPY_FAILED)
    await click(prevButton())
    expect(screen.queryByText(COPY_FAILED)).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('AC-708.3: 늦게 온 답', () => {
  it('AC-708.3: 앞 달 답을 뒤에 풀어 주어도 마지막 달 내용만 보인다', async () => {
    serve({ [OCT]: viewOf(OCT_REPORT) })
    await draw()
    const sepRead = later()
    const augRead = later()
    answerGet.mockReturnValueOnce(sepRead.promise).mockReturnValueOnce(augRead.promise)
    await click(prevButton())
    await click(prevButton())
    const augReport = reportFor('2026-08')
    augRead.resolve(viewAnswer(viewOf(augReport)))
    await settle()
    summaryOf(augReport)
    sepRead.resolve(viewAnswer(viewOf(reportFor(SEP), { usage: USAGE_AFTER })))
    await settle()
    summaryOf(augReport)
    expect(usageValues()).toEqual(USAGE_TEXT)
  })

  it('AC-708.3: 앞 달의 늦은 실패·reauth 답도 버린다', async () => {
    await draw()
    const sepRead = later()
    const augRead = later()
    answerGet.mockReturnValueOnce(sepRead.promise).mockReturnValueOnce(augRead.promise)
    await click(prevButton())
    await click(prevButton())
    sepRead.resolve(jsonAnswer({}, 401))
    await settle()
    expect(reload).not.toHaveBeenCalled()
    screen.getByText('8월 리포트를 읽고 있어요')
    augRead.resolve(viewAnswer(viewOf(null)))
    await settle()
    emptyTitle('8월')
  })

  it('AC-708.3: 조용한 읽기 답이 달을 옮긴 뒤 와도 버린다', async () => {
    const sepReport = reportFor(SEP)
    serve({ [OCT]: viewOf(OCT_REPORT), [SEP]: viewOf(sepReport) })
    await draw()
    const quiet = later()
    answerGet.mockReturnValueOnce(quiet.promise)
    await confirmRedo()
    summaryOf(NEW_REPORT)
    await click(prevButton())
    summaryOf(sepReport)
    quiet.resolve(viewAnswer(viewOf(NEW_REPORT, { stale: true, usage: USAGE_AFTER })))
    await settle()
    summaryOf(sepReport)
    expect(screen.queryByText('이 리포트를 만든 뒤 숫자가 바뀌었어요')).toBeNull()
    expect(usageValues()).toEqual(USAGE_TEXT)
  })

  it('AC-708.3: 조용한 읽기의 늦은 reauth도 달을 옮긴 뒤면 버린다', async () => {
    serve({ [OCT]: viewOf(OCT_REPORT) })
    await draw()
    const quiet = later()
    answerGet.mockReturnValueOnce(quiet.promise)
    await confirmRedo()
    await click(prevButton())
    quiet.resolve(jsonAnswer({}, 401))
    await settle()
    expect(reload).not.toHaveBeenCalled()
  })

  it('AC-709.6: 복사 도중 달을 옮기면 늦은 성공·실패 결과를 버린다', async () => {
    serve({ [OCT]: viewOf(OCT_REPORT), [SEP]: viewOf(reportFor(SEP)), ['2026-08']: viewOf(reportFor('2026-08')) })
    await draw()
    const okWrite = later<void>()
    stubClipboard({ writeText: () => okWrite.promise })
    await click(copyButton())
    await click(prevButton())
    okWrite.resolve()
    await settle()
    expect(queryCopied()).toBeNull()
    expect(vi.getTimerCount()).toBe(0)

    const badWrite = later<void>()
    stubClipboard({ writeText: () => badWrite.promise })
    await click(copyButton())
    await click(prevButton())
    badWrite.reject(new Error('가짜 막힘'))
    await settle()
    expect(screen.queryByText(COPY_FAILED)).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('AC-709.5: 머리 단추 모양', () => {
  it.each([
    [true, ds.button.primary, ds.button.secondary],
    [false, ds.button.secondary, ds.button.primary],
  ])('AC-709.5: stale이 %s이면 머리 단추 클래스가 맞다', async (stale, wanted, other) => {
    serve({ [OCT]: viewOf(OCT_REPORT, { stale }) })
    await draw()
    expect(headRedo().className).toContain(wanted)
    expect(headRedo().className).not.toContain(other)
  })

  it('AC-709.5: 바뀐 리포트를 다시 분석하면 안내가 사라지고 보조 단추로 돌아온다', async () => {
    answerGet.mockImplementationOnce(() => viewAnswer(viewOf(OCT_REPORT, { stale: true })))
    await draw()
    await confirmRedo()
    expect(screen.queryByText('이 리포트를 만든 뒤 숫자가 바뀌었어요')).toBeNull()
    expect(headRedo().className).toContain(ds.button.secondary)
  })
})

describe('AC-709.6: 복사', () => {
  beforeEach(() => {
    serve({ [OCT]: viewOf(OCT_REPORT) })
  })

  it('AC-709.6: 복사할 글이 reportCopyText 결과와 같고 1999ms에는 "복사했어요", 2000ms 뒤 "복사"', async () => {
    await draw()
    const writeText = copyWorks()
    await click(copyButton())
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText).toHaveBeenCalledWith(reportCopyText(OCT_REPORT))
    expect(queryCopied()).not.toBeNull()
    await advance(1999)
    expect(queryCopied()).not.toBeNull()
    await advance(1)
    expect(queryCopied()).toBeNull()
    copyButton()
  })

  it('AC-709.6: 복사가 실패하면 role=status 글이 2199ms에 있고 2200ms 뒤 없다', async () => {
    await draw()
    copyFails()
    await click(copyButton())
    const status = screen.getByText(COPY_FAILED)
    expect(status.getAttribute('role')).toBe('status')
    expect(queryCopied()).toBeNull()
    await advance(2199)
    screen.getByText(COPY_FAILED)
    await advance(1)
    expect(screen.queryByText(COPY_FAILED)).toBeNull()
  })

  it('AC-709.6: clipboard가 없어도 실패 글이 뜬다', async () => {
    await draw()
    stubClipboard(undefined)
    await click(copyButton())
    screen.getByText(COPY_FAILED)
  })

  it('AC-709.6: 실패 글은 시안 .toast 모양을 토큰으로 옮겼다', async () => {
    await draw()
    copyFails()
    await click(copyButton())
    const { className } = screen.getByText(COPY_FAILED)
    for (const token of ['fixed', 'bottom-6', 'left-1/2', '-translate-x-1/2', 'z-30', 'rounded-float', 'bg-ink', 'px-4', 'py-2', 'text-small', 'text-surface', 'whitespace-nowrap']) {
      expect(className.split(/\s+/)).toContain(token)
    }
  })

  it('AC-709.6: 다시 복사하면 앞 타이머를 끄고 2000ms를 새로 잰다', async () => {
    await draw()
    copyWorks()
    await click(copyButton())
    await advance(1500)
    await click(screen.getByRole('button', { name: '복사했어요' }))
    await advance(1999)
    expect(queryCopied()).not.toBeNull()
    await advance(1)
    expect(queryCopied()).toBeNull()
  })

  it('AC-709.6: 다시 실패하면 앞 타이머를 끄고 2200ms를 새로 잰다', async () => {
    await draw()
    copyFails()
    await click(copyButton())
    await advance(1500)
    await click(copyButton())
    await advance(2199)
    screen.getByText(COPY_FAILED)
    await advance(1)
    expect(screen.queryByText(COPY_FAILED)).toBeNull()
  })

  it('AC-709.6: 실패 뒤 성공하면 실패 글이 사라지고, 성공 뒤 실패하면 "복사했어요"가 사라진다', async () => {
    await draw()
    copyFails()
    await click(copyButton())
    copyWorks()
    await click(copyButton())
    expect(screen.queryByText(COPY_FAILED)).toBeNull()
    expect(queryCopied()).not.toBeNull()
    copyFails()
    await click(screen.getByRole('button', { name: '복사했어요' }))
    screen.getByText(COPY_FAILED)
    expect(queryCopied()).toBeNull()
    expect(vi.getTimerCount()).toBe(1)
  })
})

describe('AC-710.3: 기다리는 중 다시 안 보낸다', () => {
  it('AC-710.3: "분석 중"을 눌러도 POST가 한 번', async () => {
    answerPost.mockReturnValueOnce(later().promise)
    await draw()
    await click(aiButton())
    await click(screen.getByRole('button', { name: '분석 중' }))
    expect(posts()).toHaveLength(1)
  })

  it('AC-710.3: [AI 분석]을 같은 틱에 두 번 눌러도 POST가 한 번', async () => {
    answerPost.mockReturnValueOnce(later().promise)
    await draw()
    const button = aiButton()
    act(() => {
      fireEvent.click(button)
      fireEvent.click(button)
    })
    await settle()
    expect(posts()).toHaveLength(1)
  })

  it('AC-710.3: 분석이 끝나면 다시 누를 수 있다', async () => {
    answerPost.mockImplementationOnce(() => codeAnswer('E-AI-BUSY'))
    answerPost.mockReturnValueOnce(later().promise)
    await draw()
    await click(aiButton())
    await click(aiButton())
    expect(posts()).toHaveLength(2)
    expectNoError()
  })
})

describe('AC-710.4: 분석 성공', () => {
  it('AC-710.4: 받은 리포트와 "방금 만들었어요", 이어서 GET 한 번, 사용량이 새 값', async () => {
    await draw()
    answerGet.mockImplementationOnce(() => viewAnswer(viewOf(NEW_REPORT, { usage: USAGE_AFTER })))
    await click(aiButton())
    summaryOf(NEW_REPORT)
    screen.getByText('방금 만들었어요 · Claude Opus 5.5')
    expect(gets()).toEqual([urlOf(OCT), urlOf(OCT)])
    expect(usageValues()).toEqual(USAGE_AFTER_TEXT)
    expect(screen.queryByText(/지금까지/)).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
    expectNoError()
  })

  it('AC-710.4: 다시 읽기를 기다리는 동안 받은 리포트가 보이고 "읽고 있어요"가 나타나지 않는다', async () => {
    await draw()
    const quiet = later()
    const post = later()
    answerPost.mockReturnValueOnce(post.promise)
    answerGet.mockReturnValueOnce(quiet.promise)
    await click(aiButton())
    post.resolve(reportAnswer(NEW_REPORT))
    await settle()
    summaryOf(NEW_REPORT)
    expect(queryReading()).toBeNull()
    expect(usageValues()).toEqual(USAGE_TEXT)
    expect(prevButton()).toHaveProperty('disabled', false)
    quiet.resolve(viewAnswer(viewOf(NEW_REPORT, { usage: USAGE_AFTER })))
    await settle()
    expect(queryReading()).toBeNull()
    expect(usageValues()).toEqual(USAGE_AFTER_TEXT)
  })

  it.each<[string, () => Answer]>([
    ['500 답', () => jsonAnswer({}, 500)],
    ['fetch 거절', () => Promise.reject(new TypeError('Failed to fetch'))],
  ])('AC-710.4: 그 GET이 실패해도(%s) 리포트가 그대로이고 alert가 없다', async (_, answer) => {
    await draw()
    answerGet.mockImplementationOnce(answer)
    await click(aiButton())
    summaryOf(NEW_REPORT)
    expectNoError()
    expect(queryReading()).toBeNull()
    expect(usageValues()).toEqual(USAGE_TEXT)
  })

  it('AC-710.4: 바뀐 리포트를 다시 분석해 성공하면 다시 읽기 답을 기다리지 않고 바뀜 안내가 사라지고, 그 읽기가 실패해도 그대로다', async () => {
    serve({ [OCT]: viewOf(OCT_REPORT, { stale: true }) })
    await draw()
    const quiet = later()
    answerGet.mockReturnValueOnce(quiet.promise)
    await confirmRedo()
    summaryOf(NEW_REPORT)
    expect(screen.queryByText('이 리포트를 만든 뒤 숫자가 바뀌었어요')).toBeNull()
    expect(headRedo().className).toContain(ds.button.secondary)
    quiet.resolve(jsonAnswer({}, 500))
    await settle()
    expect(screen.queryByText('이 리포트를 만든 뒤 숫자가 바뀌었어요')).toBeNull()
    expectNoError()
  })

  it('AC-710.4: 조용한 읽기가 stale을 새로 한다', async () => {
    await draw()
    answerGet.mockImplementationOnce(() => viewAnswer(viewOf(NEW_REPORT, { stale: true })))
    await click(aiButton())
    screen.getByText('이 리포트를 만든 뒤 숫자가 바뀌었어요')
    expect(headRedo().className).toContain(ds.button.primary)
  })

  it('AC-710.4: 조용한 읽기 답의 report가 null이면 지금 리포트를 지키고 사용량만 바꾼다', async () => {
    await draw()
    answerGet.mockImplementationOnce(() => viewAnswer(viewOf(null, { usage: USAGE_AFTER })))
    await click(aiButton())
    summaryOf(NEW_REPORT)
    expect(usageValues()).toEqual(USAGE_AFTER_TEXT)
  })
})

describe('AC-710.6: 분석 오류', () => {
  it.each<AiErrorCode>(['E-AI-BUSY', 'E-AI-LIMIT', 'E-AI-FAILED'])(
    'AC-710.6: 리포트 없는 달의 %s는 오류 상자와 [AI 분석] 빈 화면, 끝난 뒤 GET이 다시 불려 사용량이 바뀐다',
    async (code) => {
      await draw()
      answerPost.mockImplementationOnce(() => codeAnswer(code))
      answerGet.mockImplementationOnce(() => viewAnswer(viewOf(null, { usage: USAGE_AFTER })))
      await click(aiButton())
      expectErrorCard(code)
      emptyTitle('10월')
      expect(queryAiButton()).not.toBeNull()
      expect(queryHeadRedo()).toBeNull()
      expect(gets()).toEqual([urlOf(OCT), urlOf(OCT)])
      expect(usageValues()).toEqual(USAGE_AFTER_TEXT)
      expect(vi.getTimerCount()).toBe(0)
    },
  )

  it.each<AiErrorCode>(['E-AI-BUSY', 'E-AI-LIMIT', 'E-AI-FAILED'])(
    'AC-710.6: 리포트 있는 달의 %s는 오류 상자와 리포트, 끝난 뒤 사용량이 바뀐다',
    async (code) => {
      serve({ [OCT]: viewOf(OCT_REPORT) })
      await draw()
      answerPost.mockImplementationOnce(() => codeAnswer(code))
      answerGet.mockImplementationOnce(() => viewAnswer(viewOf(OCT_REPORT, { usage: USAGE_AFTER })))
      await confirmRedo()
      expectErrorCard(code)
      summaryOf(OCT_REPORT)
      expect(usageValues()).toEqual(USAGE_AFTER_TEXT)
    },
  )

  it('AC-710.6: 응답을 못 받았지만(fetch 거절 → BUSY) 다시 읽으니 리포트가 있으면 오류 상자와 새 리포트가 함께 보인다(위험 3번)', async () => {
    await draw()
    answerPost.mockImplementationOnce(() => Promise.reject(new TypeError('Failed to fetch')))
    answerGet.mockImplementationOnce(() => viewAnswer(viewOf(NEW_REPORT, { usage: USAGE_AFTER })))
    await click(aiButton())
    expectErrorCard('E-AI-BUSY')
    summaryOf(NEW_REPORT)
    expect(headRedo()).toBeTruthy()
    expect(queryAiButton()).toBeNull()
    expect(usageValues()).toEqual(USAGE_AFTER_TEXT)
  })

  it('AC-710.6: 오류가 난 뒤 다시 읽기도 실패하면 오류 상자는 분석 오류 하나뿐이다', async () => {
    await draw()
    answerPost.mockImplementationOnce(() => codeAnswer('E-AI-FAILED'))
    answerGet.mockImplementationOnce(() => jsonAnswer({}, 500))
    await click(aiButton())
    expectErrorCard('E-AI-FAILED')
    emptyTitle('10월')
    expect(usageValues()).toEqual(USAGE_TEXT)
  })

  it('AC-710.6: 리포트 있는 달에서 다시 분석을 시작하면 앞 오류 상자가 바로 사라진다', async () => {
    serve({ [OCT]: viewOf(OCT_REPORT) })
    answerPost.mockImplementationOnce(() => codeAnswer('E-AI-BUSY'))
    await draw()
    await confirmRedo()
    expectErrorCard('E-AI-BUSY')
    answerPost.mockReturnValueOnce(later().promise)
    await confirmRedo()
    expectNoError()
    screen.getByText('새 리포트를 만들고 있어요')
  })

  it('AC-710.6: 오류 상자는 다음 동작까지 남고, 다시 분석을 시작하면 사라진다', async () => {
    await draw()
    answerPost.mockImplementationOnce(() => codeAnswer('E-AI-BUSY'))
    await click(aiButton())
    await advance(60_000)
    expectErrorCard('E-AI-BUSY')
    answerPost.mockReturnValueOnce(later().promise)
    await click(aiButton())
    expectNoError()
    screen.getByText('지금까지 0초')
  })
})

describe('AC-711: 다시 분석', () => {
  beforeEach(() => {
    serve({ [OCT]: viewOf(OCT_REPORT) })
  })

  it('AC-711.1: 머리 [다시 분석]은 창을 띄우고 POST는 아직 없다, 초점은 창의 [다시 분석]', async () => {
    await draw()
    await click(headRedo())
    const dialog = screen.getByRole('dialog', { name: '10월 리포트를 다시 만들까요?' })
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: '다시 분석' }))
    expect(posts()).toEqual([])
  })

  it.each<[string, () => Promise<void>]>([
    ['취소', () => user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '취소' }))],
    ['Esc', () => user.keyboard('{Escape}')],
    ['가림막', () => user.click(screen.getByRole('dialog').parentElement as HTMLElement)],
  ])('AC-711.2: %s 뒤 창이 닫히고 초점이 머리 단추, POST 없음', async (_, close) => {
    await draw()
    const button = headRedo()
    await click(button)
    await close()
    await settle()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(button)
    expect(posts()).toEqual([])
  })

  it('AC-711.3: 확인 뒤 옛 리포트 + 안내 + 머리 "분석 중"(aria-busy, 보조), 초가 늘어남, 초점이 같은 머리 단추', async () => {
    answerPost.mockReturnValueOnce(later().promise)
    serve({ [OCT]: viewOf(OCT_REPORT, { stale: true }) })
    await draw()
    const button = headRedo()
    await confirmRedo()
    expect(screen.queryByRole('dialog')).toBeNull()
    summaryOf(OCT_REPORT)
    expect(screen.getByText('새 리포트를 만들고 있어요').closest('[role="status"]')).not.toBeNull()
    screen.getByText(/1분쯤 걸려요\. 다 되면 아래 리포트가 바뀌어요\./)
    screen.getByText('지금까지 0초')
    expect(headBusy()).toBe(button)
    expect(button.getAttribute('aria-busy')).toBe('true')
    expect(button.className).toContain(ds.button.secondary)
    expect(button.className).not.toContain(ds.button.primary)
    expect(document.activeElement).toBe(button)
    expect(prevButton()).toHaveProperty('disabled', true)
    expect(nextButton()).toHaveProperty('disabled', true)
    await advance(2000)
    screen.getByText('지금까지 2초')
    expect(posts()).toEqual([`{"month":"${OCT}"}`])
  })

  it('AC-711.3: "분석 중" 머리 단추를 또 눌러도 창이 뜨지 않고 POST가 한 번', async () => {
    answerPost.mockReturnValueOnce(later().promise)
    await draw()
    await confirmRedo()
    await click(headBusy())
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(posts()).toHaveLength(1)
  })

  it('AC-711.3: 끝나면 같은 머리 단추가 [다시 분석]으로 돌아오고 초점이 그대로다', async () => {
    const post = later()
    answerPost.mockReturnValueOnce(post.promise)
    await draw()
    answerGet.mockImplementationOnce(() => viewAnswer(viewOf(NEW_REPORT)))
    const button = headRedo()
    await confirmRedo()
    post.resolve(reportAnswer(NEW_REPORT))
    await settle()
    expect(headRedo()).toBe(button)
    expect(document.activeElement).toBe(button)
    expect(button.getAttribute('aria-busy')).toBeNull()
    summaryOf(NEW_REPORT)
    expect(querySummary(OCT_REPORT)).toBeNull()
  })
})

describe('옮긴 달과 앞선 조용한 읽기', () => {
  it('AC-708.3: 조용한 읽기 중에 분석을 다시 시작하면 그 읽기의 늦은 답을 버린다', async () => {
    await draw()
    answerPost.mockImplementationOnce(() => codeAnswer('E-AI-BUSY'))
    const quiet = later()
    answerGet.mockReturnValueOnce(quiet.promise)
    await click(aiButton())
    expectErrorCard('E-AI-BUSY')
    answerPost.mockReturnValueOnce(later().promise)
    await click(aiButton())
    quiet.resolve(viewAnswer(viewOf(NEW_REPORT, { usage: USAGE_AFTER })))
    await settle()
    screen.getByRole('heading', { level: 2, name: '10월 숫자를 읽고 있어요' })
    expect(querySummary(NEW_REPORT)).toBeNull()
    expect(usageValues()).toEqual(USAGE_TEXT)
  })

  it('AC-710.2: 옮긴 달을 분석하면 POST와 뒤따르는 GET이 그 달이다', async () => {
    await draw()
    await click(prevButton())
    await click(aiButton())
    expect(posts()).toEqual([`{"month":"${SEP}"}`])
    expect(gets()).toEqual([urlOf(OCT), urlOf(SEP), urlOf(SEP)])
  })

  it('AC-711.1: 옮긴 달의 창 제목과 POST가 그 달이다', async () => {
    serve({ [OCT]: viewOf(OCT_REPORT), [SEP]: viewOf(reportFor(SEP)) })
    await draw()
    await click(prevButton())
    await click(headRedo())
    screen.getByRole('dialog', { name: '9월 리포트를 다시 만들까요?' })
    await click(within(screen.getByRole('dialog')).getByRole('button', { name: '다시 분석' }))
    expect(posts()).toEqual([`{"month":"${SEP}"}`])
  })

  it('AC-708.5: 옮긴 달의 [다시 읽기]는 그 달을 다시 부른다', async () => {
    await draw()
    answerGet.mockImplementationOnce(() => jsonAnswer({}, 500))
    await click(prevButton())
    await click(screen.getByRole('button', { name: '다시 읽기' }))
    expect(gets()).toEqual([urlOf(OCT), urlOf(SEP), urlOf(SEP)])
  })
})

describe('AC-712.1: 옆 칸', () => {
  it('AC-712.1: 지난달을 골라도 옆 칸 값은 응답의 usage다(화면이 달로 고르지 않음)', async () => {
    serve({ [OCT]: viewOf(OCT_REPORT, { usage: USAGE }), [SEP]: viewOf(null, { usage: USAGE_AFTER }) })
    await draw()
    expect(usageValues()).toEqual(USAGE_TEXT)
    await click(prevButton())
    expect(usageValues()).toEqual(USAGE_AFTER_TEXT)
  })
})

describe('AC-713.1: 로그인이 끊겼을 때', () => {
  it.each<[string, () => Response]>([
    ['GET 401', () => jsonAnswer({}, 401)],
    ['GET 403', () => jsonAnswer({}, 403)],
    ['GET 돌려보냄', redirected],
  ])('AC-713.1: %s에서 reload가 한 번 불리고 alert가 없다', async (_, answer) => {
    answerGet.mockImplementation(() => answer())
    await draw()
    expect(reload).toHaveBeenCalledTimes(1)
    expectNoError()
  })

  it.each<[string, () => Response]>([
    ['POST 401', () => jsonAnswer({}, 401)],
    ['POST 돌려보냄', redirected],
  ])('AC-713.1: %s에서 reload가 한 번 불리고 alert가 없고 다시 읽지 않는다', async (_, answer) => {
    answerPost.mockImplementation(() => answer())
    await draw()
    await click(aiButton())
    expect(reload).toHaveBeenCalledTimes(1)
    expectNoError()
    expect(gets()).toHaveLength(1)
  })

  it.each<[string, () => Response]>([
    ['분석 성공 뒤', () => reportAnswer(NEW_REPORT)],
    ['분석 오류 뒤', () => codeAnswer('E-AI-BUSY')],
  ])('AC-713.1: %s 조용한 읽기의 401에서 reload가 한 번 불린다', async (_, answer) => {
    await draw()
    answerPost.mockImplementationOnce(() => answer())
    answerGet.mockImplementationOnce(() => jsonAnswer({}, 401))
    await click(aiButton())
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('AC-713.1: 조용한 읽기의 401에는 읽기 오류 상자가 없다', async () => {
    await draw()
    answerGet.mockImplementationOnce(() => jsonAnswer({}, 401))
    await click(aiButton())
    expectNoError()
  })
})

describe('타이머 정리: 화면을 떠날 때', () => {
  it('AC-710.2: 분석 중 언마운트하면 초 타이머가 꺼진다', async () => {
    answerPost.mockReturnValueOnce(later().promise)
    const { unmount } = await draw()
    await click(aiButton())
    expect(vi.getTimerCount()).toBe(1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('AC-709.6: "복사했어요" 표시 중 언마운트하면 타이머가 꺼진다', async () => {
    serve({ [OCT]: viewOf(OCT_REPORT) })
    const { unmount } = await draw()
    copyWorks()
    await click(copyButton())
    expect(vi.getTimerCount()).toBe(1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('AC-709.6: 복사 실패 글 표시 중 언마운트하면 타이머가 꺼진다', async () => {
    serve({ [OCT]: viewOf(OCT_REPORT) })
    const { unmount } = await draw()
    copyFails()
    await click(copyButton())
    expect(vi.getTimerCount()).toBe(1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('AC-709.6: 복사 도중 언마운트하면 늦은 결과가 타이머를 새로 걸지 않는다', async () => {
    serve({ [OCT]: viewOf(OCT_REPORT) })
    const { unmount } = await draw()
    const write = later<void>()
    stubClipboard({ writeText: () => write.promise })
    await click(copyButton())
    unmount()
    write.resolve()
    await settle()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each<[string, () => Response]>([
    ['성공', () => reportAnswer(NEW_REPORT)],
    ['오류', () => codeAnswer('E-AI-BUSY')],
    ['reauth', () => jsonAnswer({}, 401)],
  ])('AC-713.1: 분석 중 언마운트 뒤 온 답(%s)에 reload·GET이 없다', async (_, answer) => {
    const post = later()
    answerPost.mockReturnValueOnce(post.promise)
    const { unmount } = await draw()
    await click(aiButton())
    unmount()
    post.resolve(answer())
    await settle()
    expect(reload).not.toHaveBeenCalled()
    expect(gets()).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('AC-713.1: 읽는 중 언마운트 뒤 온 reauth에 reload가 없다', async () => {
    const read = later()
    answerGet.mockReturnValueOnce(read.promise)
    const { unmount } = await draw()
    unmount()
    read.resolve(jsonAnswer({}, 401))
    await settle()
    expect(reload).not.toHaveBeenCalled()
  })

  it('AC-713.1: 조용한 읽기 중 언마운트 뒤 온 reauth에 reload가 없다', async () => {
    const { unmount } = await draw()
    const quiet = later()
    answerGet.mockReturnValueOnce(quiet.promise)
    await click(aiButton())
    unmount()
    quiet.resolve(jsonAnswer({}, 401))
    await settle()
    expect(reload).not.toHaveBeenCalled()
  })
})

describe('StrictMode: effect가 두 번 돌아도', () => {
  const strict = (
    <StrictMode>
      <AiReportScreen today={TODAY} />
    </StrictMode>
  )

  it('AC-708.1: 첫 읽기가 끝나 리포트가 보인다', async () => {
    serve({ [OCT]: viewOf(OCT_REPORT) })
    await draw(strict)
    summaryOf(OCT_REPORT)
    expect(queryReading()).toBeNull()
  })

  it('AC-710.3: [AI 분석]이 POST를 한 번 보내고, 끝나면 리포트가 보인다', async () => {
    const post = later()
    answerPost.mockReturnValueOnce(post.promise)
    await draw(strict)
    await click(aiButton())
    screen.getByText('지금까지 0초')
    await advance(1000)
    screen.getByText('지금까지 1초')
    expect(posts()).toEqual([`{"month":"${OCT}"}`])
    post.resolve(reportAnswer(NEW_REPORT))
    await settle()
    summaryOf(NEW_REPORT)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('AC-713.1: 언마운트 뒤 온 reauth에 reload가 없다', async () => {
    const post = later()
    answerPost.mockReturnValueOnce(post.promise)
    const { unmount } = await draw(strict)
    await click(aiButton())
    unmount()
    post.resolve(jsonAnswer({}, 401))
    await settle()
    expect(reload).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})

// ── 의사랑 의원: 리포트 아래 셀 수 없음 안내 (specs/uisarang-upload AC-8816.7, requirements '화면 글자' AI 경영 리포트, 시안 ?s=ai) ──
describe('AC-8816.7: 의사랑 의원 셀 수 없음 안내', () => {
  const NOTE_TITLE = '의사랑 엑셀로는 셀 수 없어요'
  const NOTE_WHY = '신환 재방문율 · 처방별 환자 수 · 동네 · 보험 · 원장님별 · 시간대별 접수는 이 리포트에 넣지 않았어요.'
  const NOTE_TEXT = `${NOTE_TITLE} · ${NOTE_WHY}`
  const queryNote = () => screen.queryByText((_, element) => element?.tagName === 'P' && element.textContent === NOTE_TEXT)

  afterEach(() => {
    clinic.state = 'failed'
    clinic.emr = 'bit'
  })

  it('AC-8816.7: 의사랑 의원이고 리포트가 있으면 리포트 아래에 굵은 제목 + " · " + 까닭 한 줄이 있다', async () => {
    clinic.state = 'ready'
    clinic.emr = 'uisarang'
    serve({ [OCT]: viewOf(OCT_REPORT) })
    await draw()
    summaryOf(OCT_REPORT)
    const note = queryNote()
    expect(note).not.toBeNull()
    const title = within(note as HTMLElement).getByText(NOTE_TITLE)
    expect(title.tagName).not.toBe('P')
    expect(title.className).toContain('font-semibold')
    // 리포트 본문(요약·카드·복사) 뒤에 온다
    const copy = copyButton()
    expect(copy.compareDocumentPosition(note as HTMLElement) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(summaryOf(OCT_REPORT).compareDocumentPosition(note as HTMLElement) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // 사용량 칸 안이 아니다
    expect(within(screen.getByRole('complementary', { name: 'AI 사용량과 보내는 자료' })).queryByText(NOTE_TITLE)).toBeNull()
  })

  it('AC-8816.7: 의사랑 의원이어도 리포트가 없는 달이면 안내가 없다', async () => {
    clinic.state = 'ready'
    clinic.emr = 'uisarang'
    serve()
    await draw()
    emptyTitle('10월')
    expect(queryNote()).toBeNull()
    expect(screen.queryByText(NOTE_TITLE)).toBeNull()
  })

  it('AC-8816.7: 의사랑 의원이 분석 중이어도 리포트가 있으면 안내는 그대로 남는다', async () => {
    clinic.state = 'ready'
    clinic.emr = 'uisarang'
    serve({ [OCT]: viewOf(OCT_REPORT) })
    answerPost.mockReturnValueOnce(later().promise)
    await draw()
    await confirmRedo()
    headBusy()
    expect(queryNote()).not.toBeNull()
  })

  it('AC-8816.7: 비트 의원 · 병원 정보를 읽는 중·읽지 못함이면 리포트가 있어도 안내가 없다', async () => {
    serve({ [OCT]: viewOf(OCT_REPORT) })
    for (const [state, emr] of [['ready', 'bit'], ['loading', 'uisarang'], ['failed', 'uisarang']] as const) {
      clinic.state = state
      clinic.emr = emr
      const view = await draw()
      summaryOf(OCT_REPORT)
      expect(queryNote(), `${state}·${emr}`).toBeNull()
      view.unmount()
    }
  })

  it('AC-8816.7: 보는 중이면 보는 의원 EMR로 정한다 — 의사랑 의원을 보는 중이면 안내가 있고 [다시 분석]은 없다', async () => {
    clinic.state = 'ready'
    clinic.emr = 'uisarang'
    serve({ [OCT]: viewOf(OCT_REPORT) })
    await draw(
      <ViewingProvider viewing={{ hospitalId: '22222222-2222-4222-8222-222222222222', name: '가짜다른의원' }}>
        <AiReportScreen today={TODAY} />
      </ViewingProvider>,
    )
    summaryOf(OCT_REPORT)
    expect(queryNote()).not.toBeNull()
    expect(queryHeadRedo()).toBeNull()
  })

  it('AC-8816.7: 안내 줄에 폰 폭 클래스가 없다(PC 화면만)', async () => {
    clinic.state = 'ready'
    clinic.emr = 'uisarang'
    serve({ [OCT]: viewOf(OCT_REPORT) })
    await draw()
    const note = queryNote() as HTMLElement
    expect(note.outerHTML).not.toMatch(/max-md:|max-sm:/)
  })
})
