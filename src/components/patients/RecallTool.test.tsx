// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_TEMPLATES } from '@/lib/patientMessages/defaults'
import { fillTemplate } from '@/lib/patientMessages/fill'
import type { RecallCoverage, RecallFilters, RecallRow, RecallView } from '@/types/patients'
import { filterRecall } from '@/workers/patients/jobs'
import { RecallTool } from './RecallTool'
import type { ToolReply, ToolRequest } from './usePatientsWorker'

// 정기 주사 문자 명단 도구(AC-612.1~612.4, 목업 rcTool). 가짜 Worker: filter는 진짜 filterRecall로 답하고(화면은 거르지 않는다), mark 답은 시험이 정한다.
// 이름·전화는 모두 지어낸 것이다

const sb = vi.hoisted(() => ({ result: { data: [] as unknown[] | null, error: null as unknown }, reads: 0, gate: null as Promise<void> | null }))
vi.mock('@/lib/supabase/browser', () => ({
  supabaseBrowser: () => ({
    from: () => ({
      select: () => ({
        order: () => ({
          order: async () => {
            sb.reads += 1
            if (sb.gate) await sb.gate
            return sb.result
          },
        }),
      }),
    }),
  }),
}))

// 환자 줄 부품을 비워 도구 몸통에 환자 값이 남지 않는지 본다
const stub = vi.hoisted(() => ({ rows: false }))
vi.mock('./rows/RecallRows', async (importOriginal) => {
  const real = await importOriginal<typeof import('./rows/RecallRows')>()
  const { createElement } = await import('react')
  return {
    ...real,
    RecallRows: (props: Parameters<typeof real.RecallRows>[0]) => (stub.rows ? null : createElement(real.RecallRows, props)),
  }
})

const TODAY = '2026-11-04' // 수요일
const TOMORROW_LABEL = '11월 5일 (목)'
const IN_30 = '2026-12-04'
const EMPTY = '이 기간에 주사 날짜가 다가온 분이 없어요. 기간을 넓혀 보세요.'
const HELP = '처음에는 오늘부터 30일 뒤까지예요 · 지난 예정: 주사 날짜가 지났는데 아직 안 오신 분'
const STORE_FAILED = '기록을 이 PC에 저장하지 못했어요. 명단은 그대로 볼 수 있어요.'
const COPY_FAILED = '복사하지 못했어요. 다시 눌러 주세요. 계속되면 크롬에서 이 사이트의 클립보드 쓰기를 허용해 주세요.'
const TPL_FAILED = '문자 문구를 불러오지 못해 [문구 복사]를 쓸 수 없어요.'
const NO_NUMBERS = '복사할 번호가 없어요. 모두 번호 없는 분이에요.'
const TPL_INJECTION = { id: 'a', kind: 'injection', name: '주사 알림', body: '주사 글\n<<DATE>>', sort_order: 1 }
const TPL_INJECTION_2 = { id: 'c', kind: 'injection', name: '주사 알림 둘', body: '둘째 글\n<<DATE>>', sort_order: 2 }
const TPL_FOLLOWUP = { id: 'b', kind: 'followup', name: '진료 알림', body: '진료 글\n<<DATE>>', sort_order: 0 }

const row = (name: string, due: string, status: string, over: Partial<RecallRow> = {}): RecallRow => ({
  key: `r|cartilage|c-${name}|${due}`,
  ruleId: 'cartilage',
  label: '연골주사',
  months: 6,
  chart: `c-${name}`,
  name,
  phone: `010-0000-${name}`,
  last: '2026-05-20',
  due,
  status,
  evidence: `근거-${name}`,
  contacted: false,
  ...over,
})

const ROWS = [
  row('지난분', '2026-10-30', '지남 5일', { phone: '010-1111-0001' }),
  row('오늘분', TODAY, '오늘', { phone: '010-1111-0002' }),
  row('이달분', '2026-11-20', '16일 남음', { phone: '010-1111-0003' }),
  row('번호없는분', '2026-11-25', '21일 남음', { phone: '' }),
  row('먼분', '2027-01-10', '67일 남음', { phone: '010-1111-0005' }),
]
const COVERAGE: RecallCoverage = { records: 1234, from: '2026-04-01', short: [], trimmed: 0 }
const VIEW: RecallView = { rows: ROWS, coverage: COVERAGE }
const SHOWN = ['지난분', '오늘분', '이달분', '번호없는분']

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

type SetupOptions = { view?: RecallView; storeCode?: string; active?: boolean; manualFilter?: boolean }

function setup(options: SetupOptions = {}) {
  let view = options.view ?? VIEW
  let storeCode = options.storeCode
  const listeners = new Set<(message: ToolReply) => void>()
  const posted: ToolRequest[] = []
  const reply = (message: ToolReply) => {
    for (const listener of [...listeners]) listener(message)
  }
  const send = (message: ToolReply) => act(() => reply(message))
  const post = (message: ToolRequest) => {
    posted.push(message)
    if (!options.manualFilter && message.type === 'filter' && message.tool === 'recall') {
      reply({ type: 'filtered', tool: 'recall', ...filterRecall(view, message.filters, TODAY) })
    }
  }
  const listen = (listener: (message: ToolReply) => void) => {
    listeners.add(listener)
    return () => void listeners.delete(listener)
  }
  const reload = vi.fn()
  const element = (active: boolean) => (
    <RecallTool view={view} storeCode={storeCode} today={TODAY} active={active} post={post} listen={listen} reload={reload} head={(summary) => <div data-testid="head">{summary}</div>} />
  )
  const utils = render(element(options.active ?? true))
  const filters = () => posted.flatMap((m) => (m.type === 'filter' && m.tool === 'recall' ? [m.filters as RecallFilters] : []))
  const marks = () => posted.flatMap((m) => (m.type === 'mark' ? [m] : []))
  return {
    ...utils,
    posted,
    send,
    reload,
    filters,
    marks,
    lastFilter: () => filters().at(-1),
    /** views가 새로 온 것처럼 다시 그린다 */
    setView(next: RecallView, code?: string) {
      view = next
      storeCode = code
      utils.rerender(element(true))
    },
    setActive: (active: boolean) => utils.rerender(element(active)),
  }
}

function setupUser(writeText = vi.fn<(text: string) => Promise<void>>(async () => {})) {
  const user = userEvent.setup()
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  return { user, writeText }
}

const button = (name: string) => screen.getByRole('button', { name })
const mainTable = () => within(screen.getByRole('table'))
const box = (name: string) => mainTable().getByRole('checkbox', { name: `${name} 연락함` }) as HTMLInputElement
const shownNames = () =>
  mainTable()
    .getAllByRole('row')
    .slice(1)
    .map((tr) => tr.querySelectorAll('td')[2]?.textContent)
const status = () => screen.getByRole('status').textContent
const from = () => screen.getByLabelText('시작 날짜') as HTMLInputElement
const to = () => screen.getByLabelText('끝 날짜') as HTMLInputElement
const pastBox = () => screen.getByRole('checkbox', { name: '지난 예정 포함' }) as HTMLInputElement
const notInBox = (text: string) => expect(screen.queryByText(text, { exact: false })).toBeNull()

beforeEach(() => {
  sb.result = { data: [TPL_FOLLOWUP, TPL_INJECTION, TPL_INJECTION_2], error: null }
  sb.reads = 0
  sb.gate = null
  stub.rows = false
})

afterEach(cleanup)

describe('AC-612.1 고르기', () => {
  it('AC-612.1 처음 값: 오늘 ~ 30일 뒤 · 지난 예정 포함 켬을 Worker에 보낸다', () => {
    const t = setup()
    expect(t.filters()).toEqual([{ from: TODAY, to: IN_30, overdue: true }])
    expect(from().value).toBe(TODAY)
    expect(to().value).toBe(IN_30)
    expect(pastBox().checked).toBe(true)
  })

  it('AC-612.1 목업 글자: 칸 이름·안내 줄·표 머리', () => {
    setup()
    expect(screen.getByText('다음 예정일', { selector: 'span' })).toBeTruthy()
    expect(screen.getByText(HELP)).toBeTruthy()
    expect(mainTable().getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['연락함', '종류', '이름', '전화', '마지막 주사', '다음 예정일', '상태', '근거 문구'])
  })

  it('AC-612.1 Worker가 거른 줄만 그린다: 30일 안 + 지난 줄이고, 먼 줄은 없다', () => {
    setup()
    expect(shownNames()).toEqual(SHOWN)
  })

  it('AC-612.1 화면은 거르지 않는다: Worker 답이 기간 밖이어도 그대로 그린다', () => {
    const t = setup({ manualFilter: true })
    t.send({ type: 'filtered', tool: 'recall', rows: [ROWS[4]!], copy: { list: '', phones: '', missingPhones: 0 } })
    expect(shownNames()).toEqual(['먼분'])
  })

  it('AC-612.1 F/U 답은 이 도구와 상관없다', () => {
    const t = setup()
    t.send({ type: 'filtered', tool: 'followup', rows: [], undecided: [], copy: { list: '', listWithDate: '' } })
    expect(shownNames()).toEqual(SHOWN)
  })

  it('AC-612.1 날짜를 고치면 그 기간을 다시 보낸다. 다시 읽지 않고 filter만 나간다', () => {
    const t = setup()
    fireEvent.change(to(), { target: { value: '2027-01-31' } })
    expect(t.lastFilter()).toEqual({ from: TODAY, to: '2027-01-31', overdue: true })
    expect(shownNames()).toEqual([...SHOWN, '먼분'])
    fireEvent.change(from(), { target: { value: '2026-11-10' } })
    expect(t.lastFilter()).toEqual({ from: '2026-11-10', to: '2027-01-31', overdue: true })
    expect(t.posted.every((m) => m.type === 'filter')).toBe(true)
    expect(t.reload).not.toHaveBeenCalled()
  })

  it('AC-612.1 끝이 시작보다 앞이면 시작 하루다', () => {
    const t = setup()
    fireEvent.change(from(), { target: { value: '2026-11-20' } })
    fireEvent.change(to(), { target: { value: '2026-11-10' } })
    expect(t.lastFilter()).toEqual({ from: '2026-11-20', to: '2026-11-20', overdue: true })
  })

  it('AC-612.1 지난 예정 포함을 끄면 Worker에 그대로 보내고 지난 줄이 사라진다. 켜면 돌아온다', async () => {
    const { user } = setupUser()
    const t = setup()
    await user.click(pastBox())
    expect(t.lastFilter()).toEqual({ from: TODAY, to: IN_30, overdue: false })
    expect(shownNames()).toEqual(['오늘분', '이달분', '번호없는분'])
    await user.click(pastBox())
    expect(t.lastFilter()).toEqual({ from: TODAY, to: IN_30, overdue: true })
    expect(shownNames()).toEqual(SHOWN)
  })

  it('AC-612.1 머리 요약: 고른 줄 수와 아직 연락 안 한 수. 답이 오기 전에는 없다', () => {
    const contacted = [ROWS[0]!, { ...ROWS[1]!, contacted: true }, ROWS[2]!, ROWS[3]!, ROWS[4]!]
    setup({ view: { ...VIEW, rows: contacted } })
    expect(screen.getByTestId('head').textContent).toBe('4명 · 아직 연락 안 한 분 3명')
    cleanup()
    setup({ manualFilter: true })
    expect(screen.getByTestId('head').textContent).toBe('')
  })

  // 크롬 날짜 칸은 연도 첫 자리를 치는 순간 0002-11-02 같은 값을 낸다. 이런 값은 Worker·문구로 가지 않는다
  for (const bad of ['0002-11-02', '0020-11-02', '']) {
    for (const [name, field, kept] of [
      ['시작', from, TODAY],
      ['끝', to, IN_30],
    ] as const) {
      it(`AC-612.1 ${name} 날짜에 잘못된 값("${bad}")을 쳐도 던지지 않고 마지막으로 맞았던 날짜를 유지한다`, async () => {
        const { user, writeText } = setupUser()
        const t = setup()
        await flush()
        const sent = t.filters().length

        fireEvent.change(field(), { target: { value: bad } })
        // 고치는 중인 글자는 되돌리지 않는다(되돌리면 연도를 칠 수 없다)
        expect(field().value).toBe(bad)
        // 잘못된 날짜는 Worker로 가지 않는다
        expect(t.filters()).toHaveLength(sent)
        expect(shownNames()).toEqual(SHOWN)

        // 문구 날짜는 고른 기간과 상관없다
        await user.click(button('문구 복사'))
        expect(writeText).toHaveBeenCalledExactlyOnceWith(fillTemplate(TPL_INJECTION.body, '2026-11-05'))

        // 칸을 떠나면 쓰고 있는 날짜로 돌아온다
        fireEvent.blur(field())
        expect(field().value).toBe(kept)
        expect(t.filters()).toHaveLength(sent)

        // 맞는 값을 치면 다시 Worker로 간다
        fireEvent.change(field(), { target: { value: '2026-11-15' } })
        expect(t.filters()).toHaveLength(sent + 1)
      })
    }
  }

  it('AC-612.1 다시 그려도 저절로 다시 불러오지 않는다', async () => {
    const t = setup()
    await flush()
    t.setActive(false)
    t.setActive(true)
    await flush()
    expect(t.reload).not.toHaveBeenCalled()
  })

  it('AC-612.1 표시가 바뀌어 새 보기 모양이 오면 Worker에 다시 묻는다', () => {
    const t = setup()
    const sent = t.filters().length
    t.setView({ ...VIEW, rows: VIEW.rows.map((r) => ({ ...r })) })
    expect(t.filters()).toHaveLength(sent + 1)
    expect(t.lastFilter()).toEqual({ from: TODAY, to: IN_30, overdue: true })
  })
})

describe('AC-612.2 쌓인 기록 안내', () => {
  const coverage = (over: Partial<RecallCoverage>) => ({ view: { ...VIEW, coverage: { ...COVERAGE, ...over } } })

  it('AC-612.2 기록 건수·시작 날짜를 목업 글자로 보인다', () => {
    setup()
    expect(screen.getByText('1,234건').closest('p')!.textContent).toBe('이 PC에 쌓인 정기 주사 기록 1,234건 · 2026년 4월 1일 (수)부터')
  })

  it('AC-612.2 기록이 간격보다 짧은 규칙마다 이름·간격과 "그보다 오래전에 맞은 분은 아직 명단에 없어요"를 보인다', () => {
    setup(
      coverage({
        short: [
          { label: '연골주사', months: 6 },
          { label: '비타민D', months: 3 },
        ],
      }),
    )
    expect(screen.getByText('연골주사는 6개월마다 맞는데, 쌓인 기록이 아직 그만큼 길지 않아요. 그보다 오래전에 맞은 분은 아직 명단에 없어요.')).toBeTruthy()
    expect(screen.getByText('비타민D는 3개월마다 맞는데, 쌓인 기록이 아직 그만큼 길지 않아요. 그보다 오래전에 맞은 분은 아직 명단에 없어요.')).toBeTruthy()
  })

  it('AC-612.2 짧은 규칙이 없으면 그 글이 없다', () => {
    setup()
    notInBox('아직 명단에 없어요')
  })

  it('AC-612.2 coverage.trimmed가 0보다 크면 "기록이 많아 오래된 N건을 뺐어요" 한 줄을 보인다', () => {
    setup(coverage({ trimmed: 1500 }))
    expect(screen.getByText('기록이 많아 오래된 1,500건을 뺐어요.')).toBeTruthy()
  })

  it('AC-612.2 coverage.trimmed가 0이면 그 글이 없다', () => {
    setup()
    notInBox('오래된')
  })

  it('AC-612.2 기록이 0건이어도 읽은 시작 날짜가 있으면 안내를 보인다(빈 명단의 까닭이다)', () => {
    setup({ view: { rows: [], coverage: { records: 0, from: '2026-03-01', short: [{ label: '연골주사', months: 6 }], trimmed: 0 } } })
    expect(screen.getByText('0건').closest('p')!.textContent).toBe('이 PC에 쌓인 정기 주사 기록 0건 · 2026년 3월 1일 (일)부터')
    expect(screen.getByText('연골주사는 6개월마다 맞는데, 쌓인 기록이 아직 그만큼 길지 않아요. 그보다 오래전에 맞은 분은 아직 명단에 없어요.')).toBeTruthy()
  })

  it('AC-612.2 읽은 기록이 아예 없으면(시작 날짜 없음) 안내가 없다. "null부터" 같은 글이 없다', () => {
    const { container } = setup({ view: { rows: [], coverage: { records: 0, from: null, short: [], trimmed: 0 } } })
    notInBox('쌓인 정기 주사 기록')
    expect(container.textContent).not.toContain('null')
  })

  it('AC-612.2 오래된 기록을 다 빼서 시작 날짜가 없어져도 뺀 건수는 보이고 날짜 글자는 없다', () => {
    const { container } = setup({ view: { rows: [], coverage: { records: 0, from: null, short: [], trimmed: 7 } } })
    expect(screen.getByText('0건').closest('p')!.textContent).toBe('이 PC에 쌓인 정기 주사 기록 0건')
    expect(screen.getByText('기록이 많아 오래된 7건을 뺐어요.')).toBeTruthy()
    expect(container.textContent).not.toContain('null')
  })
})

describe('AC-612.3 복사', () => {
  it('AC-612.3 [명단 복사]는 Worker가 준 글(recallCopyLines)을 그대로 넣고 번호 없는 분 수를 함께 알린다', async () => {
    const { user, writeText } = setupUser()
    setup()
    await user.click(button('명단 복사'))
    expect(writeText).toHaveBeenCalledExactlyOnceWith(filterRecall(VIEW, { from: TODAY, to: IN_30, overdue: true }, TODAY).copy.list)
    expect(writeText.mock.calls[0]![0]).toContain('번호없는분')
    expect(status()).toBe('복사했어요 · 4명 (번호 없는 분 1명)')
  })

  it('AC-612.3 번호 없는 분이 없으면 [명단 복사] 글에 그 말이 없다', async () => {
    const { user } = setupUser()
    setup({ view: { ...VIEW, rows: ROWS.slice(0, 3) } })
    await user.click(button('명단 복사'))
    expect(status()).toBe('복사했어요 · 3명')
  })

  it('AC-612.3 [번호 복사]는 Worker가 준 번호(recallPhones)를 그대로 넣고 번호 없는 분 수를 함께 알린다', async () => {
    const { user, writeText } = setupUser()
    setup()
    await user.click(button('번호 복사'))
    expect(writeText).toHaveBeenCalledExactlyOnceWith('01011110001\n01011110002\n01011110003')
    expect(status()).toBe('번호 3개를 복사했어요 · 번호 없는 분 1명은 빠졌어요')
  })

  it('AC-612.3 번호 없는 분이 없으면 [번호 복사] 글에 그 말이 없다. 같은 번호는 한 번이다', async () => {
    const { user, writeText } = setupUser()
    setup({ view: { ...VIEW, rows: [ROWS[1]!, row('같은번호', '2026-11-06', '2일 남음', { phone: '010-1111-0002' })] } })
    await user.click(button('번호 복사'))
    expect(writeText).toHaveBeenCalledExactlyOnceWith('01011110002')
    expect(status()).toBe('번호 1개를 복사했어요')
  })

  it('AC-612.3 모두 번호가 없으면 [번호 복사]는 빈 글로 클립보드를 덮어쓰지 않고 알린다. 고른 것이 바뀌면 그 글을 지운다', async () => {
    const { user, writeText } = setupUser()
    setup({ view: { ...VIEW, rows: [ROWS[3]!] } })
    await user.click(button('번호 복사'))
    expect(writeText).not.toHaveBeenCalled()
    expect(status()).toBe(NO_NUMBERS)

    fireEvent.change(to(), { target: { value: '2026-12-31' } })
    expect(status()).toBe('')
  })

  it('AC-612.3 "복사했어요"는 지난 누름의 결과라 고르기를 바꿔도 남는다', async () => {
    const { user } = setupUser()
    setup()
    await user.click(button('명단 복사'))
    fireEvent.change(to(), { target: { value: '2026-12-31' } })
    expect(status()).toBe('복사했어요 · 4명 (번호 없는 분 1명)')
  })

  it('AC-612.3 지난 예정 포함을 끄면 복사 글에서도 지난 줄이 빠진다', async () => {
    const { user, writeText } = setupUser()
    setup()
    await user.click(pastBox())
    await user.click(button('번호 복사'))
    expect(writeText).toHaveBeenCalledExactlyOnceWith('01011110002\n01011110003')
    expect(status()).toBe('번호 2개를 복사했어요 · 번호 없는 분 1명은 빠졌어요')
  })

  it('AC-612.3 고르기를 바꾼 뒤 답이 오기 전에는 옛 기간의 글을 복사하지 못한다', async () => {
    const { user, writeText } = setupUser()
    const t = setup({ manualFilter: true })
    const answer = filterRecall(VIEW, { from: TODAY, to: IN_30, overdue: true }, TODAY)
    t.send({ type: 'filtered', tool: 'recall', ...answer })
    fireEvent.change(to(), { target: { value: '2026-12-31' } })
    expect(button('명단 복사').getAttribute('aria-disabled')).toBe('true')
    expect(button('번호 복사').getAttribute('aria-disabled')).toBe('true')
    await user.click(button('명단 복사'))
    expect(writeText).not.toHaveBeenCalled()

    t.send({ type: 'filtered', tool: 'recall', ...answer })
    expect(button('명단 복사').getAttribute('aria-disabled')).toBeNull()
    await user.click(button('명단 복사'))
    expect(writeText).toHaveBeenCalledTimes(1)
  })

  it('AC-612.3 답을 여럿 기다리면 마지막 답까지 막는다', () => {
    const t = setup({ manualFilter: true })
    const answer = filterRecall(VIEW, { from: TODAY, to: IN_30, overdue: true }, TODAY)
    fireEvent.change(to(), { target: { value: '2026-12-31' } })
    t.send({ type: 'filtered', tool: 'recall', ...answer })
    expect(button('명단 복사').getAttribute('aria-disabled')).toBe('true')
    t.send({ type: 'filtered', tool: 'recall', ...answer })
    expect(button('명단 복사').getAttribute('aria-disabled')).toBeNull()
  })

  it('AC-612.4 줄이 없으면 [명단 복사]·[번호 복사]는 눌러도 복사하지 않는다', async () => {
    const { user, writeText } = setupUser()
    setup({ view: { ...VIEW, rows: [] } })
    expect(button('명단 복사').getAttribute('aria-disabled')).toBe('true')
    expect(button('번호 복사').getAttribute('aria-disabled')).toBe('true')
    await user.click(button('명단 복사'))
    await user.click(button('번호 복사'))
    expect(writeText).not.toHaveBeenCalled()
    expect(status()).toBe('')
  })

  it('AC-612.3 복사가 막히면 결과 줄에 안내를 보인다', async () => {
    const { user } = setupUser(vi.fn(async () => Promise.reject(new Error('blocked'))))
    setup()
    await user.click(button('명단 복사'))
    expect(status()).toBe(COPY_FAILED)
  })

  it('AC-612.3 다른 도구로 가면 복사 결과 줄을 지운다(목업 setTool)', async () => {
    const { user } = setupUser()
    const t = setup()
    await user.click(button('명단 복사'))
    t.setActive(false)
    t.setActive(true)
    expect(status()).toBe('')
    await flush()
  })
})

describe('AC-612.3 [문구 복사]', () => {
  it('AC-612.3 주사 안내 첫 문구를 내일 날짜로 채워 넣고, 이름·날짜를 알린다', async () => {
    const { user, writeText } = setupUser()
    setup()
    await flush()
    await user.click(button('문구 복사'))
    expect(writeText).toHaveBeenCalledExactlyOnceWith('주사 글\n* 11월 5일 목요일 *')
    expect(status()).toBe(`복사했어요 · 주사 알림 · ${TOMORROW_LABEL}`)
  })

  it('AC-612.3 단추 옆에 "주사 안내 · 문구 날짜 내일"을 보인다. 고른 기간이 바뀌어도 내일이다', async () => {
    setup()
    await flush()
    expect(screen.getByText(`주사 안내 · 문구 날짜 ${TOMORROW_LABEL}`)).toBeTruthy()
    fireEvent.change(from(), { target: { value: '2026-11-20' } })
    expect(screen.getByText(`주사 안내 · 문구 날짜 ${TOMORROW_LABEL}`)).toBeTruthy()
  })

  it('AC-612.3 저장한 문구가 없으면 기본 주사 안내 문구를 쓴다', async () => {
    sb.result = { data: [], error: null }
    const { user, writeText } = setupUser()
    setup()
    await flush()
    await user.click(button('문구 복사'))
    const body = DEFAULT_TEMPLATES.find((tpl) => tpl.kind === 'injection')!.body
    expect(writeText).toHaveBeenCalledExactlyOnceWith(fillTemplate(body, '2026-11-05'))
    expect(status()).toBe(`복사했어요 · 주사 안내 · ${TOMORROW_LABEL}`)
  })

  it('AC-612.3 저장한 문구에 주사 안내가 없으면 눌리지 않는다(목업 aria-disabled). 진료 문구를 대신 쓰지 않는다', async () => {
    sb.result = { data: [TPL_FOLLOWUP], error: null }
    const { user, writeText } = setupUser()
    setup()
    await flush()
    expect(button('문구 복사').getAttribute('aria-disabled')).toBe('true')
    await user.click(button('문구 복사'))
    expect(writeText).not.toHaveBeenCalled()
  })

  it('AC-612.3 문구를 읽는 동안에는 눌리지 않는다', async () => {
    let open = () => {}
    sb.gate = new Promise((resolve) => {
      open = resolve
    })
    const { user, writeText } = setupUser()
    setup()
    expect(button('문구 복사').getAttribute('aria-disabled')).toBe('true')
    await user.click(button('문구 복사'))
    expect(writeText).not.toHaveBeenCalled()
    open()
    await flush()
    expect(button('문구 복사').getAttribute('aria-disabled')).toBeNull()
  })

  it('AC-612.3 문구 읽기가 실패하면 단추 대신 오류 줄과 [다시 불러오기]. 그 단추는 문구만 다시 읽고 명단을 다시 읽지 않는다', async () => {
    sb.result = { data: null, error: { message: 'x' } }
    const { user } = setupUser()
    const t = setup()
    await flush()
    expect(screen.getByText(TPL_FAILED)).toBeTruthy()
    expect(screen.getByText('오류 번호 E-PATIENTS-TEMPLATES-READ')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '문구 복사' })).toBeNull()
    // 명단 복사는 그대로 쓴다
    expect(button('명단 복사').getAttribute('aria-disabled')).toBeNull()

    sb.result = { data: [TPL_INJECTION], error: null }
    await user.click(button('다시 불러오기'))
    await flush()
    expect(sb.reads).toBe(2)
    expect(t.reload).not.toHaveBeenCalled()
    expect(button('문구 복사')).toBeTruthy()
  })

  it('AC-612.3 문구는 이 도구가 보일 때만 읽고, 다시 열 때마다 다시 읽는다(문자 문구 도구에서 고친 글)', async () => {
    const t = setup({ active: false })
    await flush()
    expect(sb.reads).toBe(0)
    t.setActive(true)
    await flush()
    expect(sb.reads).toBe(1)
    t.setActive(false)
    await flush()
    expect(sb.reads).toBe(1)
    t.setActive(true)
    await flush()
    expect(sb.reads).toBe(2)
  })
})

describe('AC-612.3 [연락함]', () => {
  const key = ROWS[0]!.key

  it('AC-612.3 누르면 mark를 오늘 날짜로 보내고 답을 기다린다(체크는 답이 와야 바뀐다)', async () => {
    const { user } = setupUser()
    const t = setup()
    await user.click(box('지난분'))
    expect(t.marks()).toEqual([{ type: 'mark', key, on: true, today: TODAY }])
    expect(box('지난분').getAttribute('aria-busy')).toBe('true')
    expect(box('지난분').checked).toBe(false)
    expect(screen.getAllByText('저장 중').length).toBeGreaterThan(0)

    t.send({ type: 'marked', key, ok: true, counts: null })
    expect(box('지난분').getAttribute('aria-busy')).toBeNull()
    expect(box('지난분').checked).toBe(true)
    expect(screen.getByTestId('head').textContent).toBe('4명 · 아직 연락 안 한 분 3명')
  })

  it('AC-612.3 저장 답을 기다리는 그 줄은 다시 보내지 않고, 다른 줄은 잇따라 누를 수 있다', async () => {
    const { user } = setupUser()
    const t = setup()
    await user.click(box('지난분'))
    await user.click(box('지난분'))
    await user.click(box('오늘분'))
    expect(t.marks().map((m) => m.key)).toEqual([key, ROWS[1]!.key])
  })

  it('AC-612.3 끄는 것도 같은 길이다', async () => {
    const { user } = setupUser()
    const t = setup({ view: { ...VIEW, rows: [{ ...ROWS[0]!, contacted: true }] } })
    await user.click(box('지난분'))
    expect(t.marks()).toEqual([{ type: 'mark', key, on: false, today: TODAY }])
    t.send({ type: 'marked', key, ok: true, counts: null })
    expect(box('지난분').checked).toBe(false)
  })

  it('AC-612.3 저장이 실패하면 그 줄에 오류 번호를 보이고 체크는 그대로다. 다시 누르면 오류 줄이 지워진다', async () => {
    const { user } = setupUser()
    const t = setup()
    await user.click(box('지난분'))
    t.send({ type: 'marked', key, ok: false, code: 'E-STORE-FAILED', counts: null })
    expect(box('지난분').checked).toBe(false)
    expect(mainTable().getByText('오류 번호 E-STORE-FAILED')).toBeTruthy()

    await user.click(box('지난분'))
    expect(t.marks()).toHaveLength(2)
    expect(mainTable().queryByText('오류 번호 E-STORE-FAILED')).toBeNull()
  })

  it('AC-612.3 답에 번호가 없어도 실패는 실패다', async () => {
    const { user } = setupUser()
    const t = setup()
    await user.click(box('지난분'))
    t.send({ type: 'marked', key, ok: false, counts: null })
    expect(mainTable().getByText('오류 번호 E-STORE-FAILED')).toBeTruthy()
  })

  it('AC-612.3 이 도구가 보내지 않은 줄(F/U)의 답은 상관없다', () => {
    const t = setup()
    t.send({ type: 'marked', key: 'f|1|2|2026-11-05', ok: false, code: 'E-STORE-FAILED', counts: null })
    expect(screen.queryByText('오류 번호 E-STORE-FAILED')).toBeNull()
  })

  it('AC-612.3 연락 표시는 브라우저 저장소에 두지 않는다', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const { user } = setupUser()
    const t = setup()
    await user.click(box('지난분'))
    t.send({ type: 'marked', key, ok: true, counts: null })
    expect(setItem).not.toHaveBeenCalled()
    setItem.mockRestore()
  })
})

describe('AC-612.4 빈 상태·저장 실패', () => {
  it('AC-612.4 대상이 없으면 빈 상태 글을 표와 휴대폰 줄에 보인다', () => {
    setup({ view: { ...VIEW, rows: [] } })
    expect(screen.getAllByText(EMPTY)).toHaveLength(2)
    expect(screen.getByTestId('head').textContent).toBe('0명 · 아직 연락 안 한 분 0명')
  })

  it('AC-612.4 Worker 답이 오기 전에는 지어낸 줄도 빈 상태 글도 없다', () => {
    setup({ manualFilter: true })
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByText(EMPTY)).toBeNull()
  })

  it('AC-612.4 기록 저장 실패 번호가 오면 명단은 보이고 오류 줄 + [다시 불러오기]. 누를 때만 다시 불러온다', async () => {
    const { user } = setupUser()
    const t = setup({ storeCode: 'E-STORE-FAILED' })
    expect(shownNames()).toEqual(SHOWN)
    expect(screen.getByText(STORE_FAILED)).toBeTruthy()
    expect(screen.getByText('오류 번호 E-STORE-FAILED')).toBeTruthy()
    await flush()
    expect(t.reload).not.toHaveBeenCalled()

    await user.click(button('다시 불러오기'))
    expect(t.reload).toHaveBeenCalledTimes(1)
  })

  it('AC-612.4 도우미가 준 번호를 그대로 보인다. 다음 저장이 되어 번호가 없어지면 줄도 없어진다', () => {
    const t = setup({ storeCode: 'E-HELPER-NEW-CODE' })
    expect(screen.getByText('오류 번호 E-HELPER-NEW-CODE')).toBeTruthy()
    t.setView(VIEW)
    expect(screen.queryByText(STORE_FAILED)).toBeNull()
    expect(screen.queryByRole('button', { name: '다시 불러오기' })).toBeNull()
  })

  it('AC-612.4 저장 실패가 없으면 오류 줄이 없다', () => {
    setup()
    expect(screen.queryByText(STORE_FAILED)).toBeNull()
  })
})

describe('AC-612.1 환자 값은 환자 줄 부품에서만', () => {
  it('AC-612.1 환자 줄 부품을 비우면 도구 어디에도 이름·전화·차트번호·근거 문구가 없다(글자·속성·복사 결과 모두)', async () => {
    stub.rows = true
    const { user } = setupUser()
    const { container } = setup({ storeCode: 'E-STORE-FAILED' })
    await flush()
    await user.click(pastBox())
    await user.click(button('명단 복사'))
    expect(status()).toContain('복사했어요')
    await user.click(button('번호 복사'))
    expect(status()).toContain('복사했어요')
    await user.click(button('문구 복사'))
    expect(status()).toContain('복사했어요')
    const html = container.innerHTML
    for (const value of ROWS.flatMap((r) => [r.name, r.phone, r.chart, r.evidence, r.key]).filter(Boolean)) {
      expect(html).not.toContain(value)
    }
    expect(html).not.toContain('01011110')
  })
})
