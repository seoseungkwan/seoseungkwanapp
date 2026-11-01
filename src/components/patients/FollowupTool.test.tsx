// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { errorInfo } from '@/lib/errors'
import { DEFAULT_TEMPLATES } from '@/lib/patientMessages/defaults'
import { fillTemplate } from '@/lib/patientMessages/fill'
import type { FollowupFilters, FollowupRow, FollowupView } from '@/types/patients'
import { filterFollowup } from '@/workers/patients/jobs'
import { FollowupTool } from './FollowupTool'
import type { ToolReply, ToolRequest } from './usePatientsWorker'

// F/U 명단 도구(AC-611.1~611.4, 목업 fuTool). 가짜 Worker: filter는 진짜 filterFollowup으로 답하고(화면은 거르지 않는다), mark 답은 시험이 정한다.
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

// AC-611.5: 환자 줄 부품을 비워 도구 몸통에 환자 값이 남지 않는지 본다
const stub = vi.hoisted(() => ({ rows: false }))
vi.mock('./rows/FollowupRows', async (importOriginal) => {
  const real = await importOriginal<typeof import('./rows/FollowupRows')>()
  const { createElement } = await import('react')
  return {
    ...real,
    FollowupRows: (props: Parameters<typeof real.FollowupRows>[0]) => (stub.rows ? null : createElement(real.FollowupRows, props)),
    UndecidedRows: (props: Parameters<typeof real.UndecidedRows>[0]) => (stub.rows ? null : createElement(real.UndecidedRows, props)),
  }
})

const TODAY = '2026-11-04' // 수요일
const TOMORROW = '2026-11-05'
const EMPTY = '이 기간에 오실 분이 없어요. 기간을 바꾸거나 ‘조건부 포함’ · ‘지난 예정 포함’을 켜 보세요.'
const COPY_FAILED = '복사하지 못했어요. 다시 눌러 주세요. 계속되면 크롬에서 이 사이트의 클립보드 쓰기를 허용해 주세요.'
const TPL_FAILED = '문자 문구를 불러오지 못해 [문구 복사]를 쓸 수 없어요.'
const TPL_INJECTION = { id: 'a', kind: 'injection', name: '주사 알림', body: '주사 글\n<<DATE>>', sort_order: 0 }
const TPL_FOLLOWUP = { id: 'b', kind: 'followup', name: '진료 알림', body: '진료 글\n<<DATE>>', sort_order: 1 }

const row = (name: string, next: string, over: Partial<FollowupRow> = {}): FollowupRow => ({
  key: `f|${name}|${name}|${next}`,
  chart: `c-${name}`,
  name,
  phone: `010-0000-${name}`,
  lastVisit: '2026-10-22',
  next,
  nextLabel: next,
  plan: '예정',
  visitKind: 'F/U',
  site: '',
  tx: '',
  evidence: `근거-${name}`,
  contacted: false,
  ...over,
})

const ROWS = [
  row('내일분', TOMORROW),
  row('내일주사', TOMORROW, { visitKind: '주사', site: '무릎' }),
  row('내일조건', TOMORROW, { plan: '조건부' }),
  row('이번주분', '2026-11-07'),
  row('다음주분', '2026-11-10'),
  row('지난분', '2026-11-03'),
]
const VIEW: FollowupView = {
  read: { from: '2026-07-08', to: TODAY },
  base: TODAY,
  rows: ROWS,
  undecided: [{ key: 'f|미정분||', chart: 'c-미정분', name: '미정분', phone: '010-0000-9999', lastVisit: '2026-10-29', nextLabel: '12월 초', evidence: '12월 초에 보기로' }],
  phoneLoaded: true,
  marksLoaded: true,
}

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

type SetupOptions = { view?: FollowupView; storeCode?: string; active?: boolean; manualFilter?: boolean }

function setup(options: SetupOptions = {}) {
  let view = options.view ?? VIEW
  const listeners = new Set<(message: ToolReply) => void>()
  const posted: ToolRequest[] = []
  const reply = (message: ToolReply) => {
    for (const listener of [...listeners]) listener(message)
  }
  const send = (message: ToolReply) => act(() => reply(message))
  const post = (message: ToolRequest) => {
    posted.push(message)
    if (!options.manualFilter && message.type === 'filter' && message.tool === 'followup') {
      reply({ type: 'filtered', tool: 'followup', ...filterFollowup(view, message.filters) })
    }
  }
  const listen = (listener: (message: ToolReply) => void) => {
    listeners.add(listener)
    return () => void listeners.delete(listener)
  }
  const reload = vi.fn()
  const element = (active: boolean) => (
    <FollowupTool view={view} storeCode={options.storeCode} active={active} post={post} listen={listen} reload={reload} head={(summary) => <div data-testid="head">{summary}</div>} />
  )
  const utils = render(element(options.active ?? true))
  const filters = () => posted.flatMap((m) => (m.type === 'filter' && m.tool === 'followup' ? [m.filters as FollowupFilters] : []))
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
    setView(next: FollowupView) {
      view = next
      utils.rerender(element(true))
    },
    setActive: (active: boolean) => utils.rerender(element(active)),
    filteredReply: (filters: FollowupFilters) => ({ type: 'filtered' as const, tool: 'followup' as const, ...filterFollowup(view, filters) }),
  }
}

function setupUser(writeText = vi.fn<(text: string) => Promise<void>>(async () => {})) {
  const user = userEvent.setup()
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  return { user, writeText }
}

const button = (name: string) => screen.getByRole('button', { name })
const group = (name: string) => within(screen.getByRole('group', { name }))
const mainTable = () => within(screen.getAllByRole('table')[0]!)
const box = (name: string) => mainTable().getByRole('checkbox', { name: `${name} 연락함` }) as HTMLInputElement
const shownNames = () =>
  mainTable()
    .getAllByRole('row')
    .slice(1)
    .map((tr) => tr.querySelectorAll('td')[1]?.textContent)
const status = () => screen.getByRole('status').textContent
// 기간 단추 옆 글. 표에도 같은 날짜 글이 있어 자리를 찍어 본다
const rangeText = () => screen.getByRole('group', { name: '기간' }).nextElementSibling!.textContent

beforeEach(() => {
  sb.result = { data: [TPL_INJECTION, TPL_FOLLOWUP], error: null }
  sb.reads = 0
  sb.gate = null
  stub.rows = false
})

afterEach(cleanup)

describe('AC-611.1 고르기', () => {
  it('AC-611.1 처음 고르기: 내일 · 조건부 끔 · 지난 예정 끔 · 구분 전체를 Worker에 보낸다', () => {
    const t = setup()
    expect(t.filters()).toEqual([{ kind: '', from: TOMORROW, to: TOMORROW, includeCond: false, includePast: false }])
    expect(button('내일').getAttribute('aria-pressed')).toBe('true')
    expect(group('구분').getByRole('button', { name: '전체' }).getAttribute('aria-pressed')).toBe('true')
    expect((screen.getByRole('checkbox', { name: '조건부 포함' }) as HTMLInputElement).checked).toBe(false)
    expect((screen.getByRole('checkbox', { name: '지난 예정 포함' }) as HTMLInputElement).checked).toBe(false)
    expect(rangeText()).toBe('11월 5일 (목)')
  })

  it('AC-611.1 목업 글자: 안내 줄·표 머리', () => {
    setup()
    expect(screen.getByText('조건부: ‘아프면 오세요’처럼 조건을 달아 둔 분 · 지난 예정: 날짜가 지났는데 아직 안 오신 분')).toBeTruthy()
    expect(mainTable().getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['연락함', '이름', '전화', '마지막 진료', '다음 날짜', '구분', '근거 문구'])
  })

  it('AC-611.1 Worker가 거른 줄만 그린다: 내일 예정만, 조건부·앞날·지난 줄은 없다', () => {
    setup()
    expect(shownNames()).toEqual(['내일분', '내일주사'])
  })

  it('AC-611.1 화면은 거르지 않는다: Worker 답이 기간 밖이어도 그대로 그린다', () => {
    const t = setup({ manualFilter: true })
    t.send({ type: 'filtered', tool: 'followup', rows: [ROWS[4]!], undecided: [], copy: { list: '', listWithDate: '' } })
    expect(shownNames()).toEqual(['다음주분'])
  })

  it('AC-611.1 이번 주·다음 주(월~일)를 고르면 그 기간을 다시 보낸다. 다시 읽지 않고 filter만 나간다', async () => {
    const { user } = setupUser()
    const t = setup()
    await user.click(button('이번 주'))
    expect(t.lastFilter()).toMatchObject({ from: '2026-11-02', to: '2026-11-08' })
    expect(button('이번 주').getAttribute('aria-pressed')).toBe('true')
    expect(button('내일').getAttribute('aria-pressed')).toBe('false')
    expect(rangeText()).toBe('11월 2일 (월) ~ 11월 8일 (일)')
    // 지난분(11월 3일)은 이번 주 안이지만 지난 예정이라 Worker가 뺀다
    expect(shownNames()).toEqual(['내일분', '내일주사', '이번주분'])

    await user.click(button('다음 주'))
    expect(t.lastFilter()).toMatchObject({ from: '2026-11-09', to: '2026-11-15' })
    expect(shownNames()).toEqual(['다음주분'])
    expect(t.posted.every((m) => m.type === 'filter')).toBe(true)
  })

  it('AC-611.1 조건부 포함·지난 예정 포함을 켜면 Worker에 그대로 보낸다', async () => {
    const { user } = setupUser()
    const t = setup()
    await user.click(screen.getByRole('checkbox', { name: '조건부 포함' }))
    expect(t.lastFilter()).toMatchObject({ includeCond: true, includePast: false })
    expect(shownNames()).toEqual(['내일분', '내일조건', '내일주사'])
    await user.click(screen.getByRole('checkbox', { name: '지난 예정 포함' }))
    expect(t.lastFilter()).toMatchObject({ includeCond: true, includePast: true })
    expect(shownNames()).toEqual(['지난분', '내일분', '내일조건', '내일주사'])
  })

  it('AC-611.1 지난 예정 포함을 켜면 내일을 골라도 지난 줄이 "지남" 표시와 함께 보이고, 끄면 사라진다', async () => {
    const { user } = setupUser()
    setup()
    expect(shownNames()).not.toContain('지난분')

    await user.click(screen.getByRole('checkbox', { name: '지난 예정 포함' }))
    expect(shownNames()).toEqual(['지난분', '내일분', '내일주사'])
    const past = box('지난분').closest('tr')!
    expect(within(past).getByText('지남')).toBeTruthy()
    expect(within(past).getByText('11월 3일 (화)')).toBeTruthy()
    expect(within(box('내일분').closest('tr')!).queryByText('지남')).toBeNull()
    // 기간 글자와 문구 날짜는 고른 기간 그대로다
    expect(rangeText()).toBe('11월 5일 (목)')
    expect(screen.getByTestId('head').textContent).toBe('3명 · 아직 연락 안 한 분 3명')

    await user.click(screen.getByRole('checkbox', { name: '지난 예정 포함' }))
    expect(shownNames()).toEqual(['내일분', '내일주사'])
  })

  it('AC-611.1 지난 예정 포함을 켜면 복사 글에도 지난 줄이 들어간다', async () => {
    const { user, writeText } = setupUser()
    setup()
    await user.click(screen.getByRole('checkbox', { name: '지난 예정 포함' }))
    await user.click(screen.getByRole('checkbox', { name: '날짜 제목 줄 넣기' }))
    await user.click(button('명단 복사'))
    expect(writeText.mock.calls[0]![0]).toContain('지난분')
    expect(status()).toBe('복사했어요 · 3명')
  })

  it('AC-611.1 다음 주를 골라도 지난 예정 포함을 켜면 지난 줄이 보인다. 오늘부터 시작일 전 줄은 더하지 않는다', async () => {
    const { user } = setupUser()
    setup()
    await user.click(button('다음 주'))
    expect(shownNames()).toEqual(['다음주분'])
    await user.click(screen.getByRole('checkbox', { name: '지난 예정 포함' }))
    expect(shownNames()).toEqual(['지난분', '다음주분'])
  })

  it('AC-611.1 구분: 주사·F/U를 고르면 그 값, 전체는 빈 값이다', async () => {
    const { user } = setupUser()
    const t = setup()
    await user.click(group('구분').getByRole('button', { name: '주사' }))
    expect(t.lastFilter()).toMatchObject({ kind: '주사' })
    expect(shownNames()).toEqual(['내일주사'])
    await user.click(group('구분').getByRole('button', { name: 'F/U' }))
    expect(t.lastFilter()).toMatchObject({ kind: 'F/U' })
    expect(shownNames()).toEqual(['내일분'])
    await user.click(group('구분').getByRole('button', { name: '전체' }))
    expect(t.lastFilter()).toMatchObject({ kind: '' })
  })

  it('AC-611.1 날짜 미정 명단은 기간과 상관없이 따로 보인다', async () => {
    const { user } = setupUser()
    setup()
    expect(screen.getByRole('region', { name: '날짜 미정 1명' })).toBeTruthy()
    await user.click(button('다음 주'))
    expect(screen.getByRole('region', { name: '날짜 미정 1명' })).toBeTruthy()
  })

  it('AC-611.1 날짜 미정이 없으면 그 자리를 그리지 않는다', () => {
    setup({ view: { ...VIEW, undecided: [] } })
    expect(screen.queryByRole('region')).toBeNull()
  })

  it('AC-611.1 도구 머리 오른쪽에 몇 명 · 아직 연락 안 한 분 수(목업 summary)', () => {
    setup({ view: { ...VIEW, rows: [row('내일분', TOMORROW, { contacted: true }), row('내일둘', TOMORROW)] } })
    expect(screen.getByTestId('head').textContent).toBe('2명 · 아직 연락 안 한 분 1명')
  })
})

describe('AC-611.1 직접 기간', () => {
  const from = () => screen.getByLabelText('시작 날짜') as HTMLInputElement
  const to = () => screen.getByLabelText('끝 날짜') as HTMLInputElement

  it('AC-611.1 직접을 누르면 날짜 칸 둘이 나온다. 처음은 내일 ~ 6일 뒤(목업)', async () => {
    const { user } = setupUser()
    const t = setup()
    expect(screen.queryByLabelText('시작 날짜')).toBeNull()
    await user.click(button('직접'))
    expect(from().value).toBe(TOMORROW)
    expect(to().value).toBe('2026-11-11')
    expect(t.lastFilter()).toMatchObject({ from: TOMORROW, to: '2026-11-11' })
    expect(rangeText()).toBe('11월 5일 (목) ~ 11월 11일 (수)')
  })

  it('AC-611.1 날짜를 고치면 Worker에 보낸다. 끝이 시작보다 앞이면 시작 하루다', async () => {
    const { user } = setupUser()
    const t = setup()
    await user.click(button('직접'))
    fireEvent.change(from(), { target: { value: '2026-11-07' } })
    expect(t.lastFilter()).toMatchObject({ from: '2026-11-07', to: '2026-11-11' })
    fireEvent.change(to(), { target: { value: '2026-11-06' } })
    expect(t.lastFilter()).toMatchObject({ from: '2026-11-07', to: '2026-11-07' })
    expect(rangeText()).toBe('11월 7일 (토)')
  })

  // 크롬 날짜 칸은 연도 첫 자리를 치는 순간 0002-11-02 같은 값을 낸다. dateLine·fillTemplate이 던지면 전체 오류 화면으로 간다
  for (const bad of ['0002-11-02', '0020-11-02', '']) {
    it(`AC-611.1 시작 날짜에 잘못된 값("${bad}")을 쳐도 던지지 않고 마지막으로 맞았던 날짜를 유지한다`, async () => {
      const { user, writeText } = setupUser()
      const t = setup()
      await user.click(button('직접'))
      fireEvent.change(from(), { target: { value: '2026-11-06' } })
      const sent = t.filters().length

      fireEvent.change(from(), { target: { value: bad } })
      // 고치는 중인 글자는 되돌리지 않는다(되돌리면 연도를 칠 수 없다)
      expect(from().value).toBe(bad)
      // 잘못된 날짜는 Worker로 가지 않는다
      expect(t.filters()).toHaveLength(sent)
      expect(rangeText()).toBe('11월 6일 (금) ~ 11월 11일 (수)')
      expect(screen.getByText('문구 날짜 11월 6일 (금)')).toBeTruthy()

      // 문구 날짜도 마지막으로 맞았던 시작일이다
      await flush()
      await user.click(button('문구 복사'))
      expect(writeText).toHaveBeenCalledExactlyOnceWith(fillTemplate(TPL_INJECTION.body, '2026-11-06'))
      expect(status()).toContain('복사했어요')

      // 칸을 떠나면 쓰고 있는 날짜로 돌아온다
      fireEvent.blur(from())
      expect(from().value).toBe('2026-11-06')

      // 맞는 값을 치면 다시 Worker로 간다
      fireEvent.change(from(), { target: { value: '2026-11-08' } })
      expect(t.lastFilter()).toMatchObject({ from: '2026-11-08' })
    })

    it(`AC-611.1 끝 날짜에 잘못된 값("${bad}")을 쳐도 던지지 않고 마지막으로 맞았던 날짜를 유지한다`, async () => {
      const { user } = setupUser()
      const t = setup()
      await user.click(button('직접'))
      const sent = t.filters().length
      fireEvent.change(to(), { target: { value: bad } })
      expect(to().value).toBe(bad)
      expect(t.filters()).toHaveLength(sent)
      expect(rangeText()).toBe('11월 5일 (목) ~ 11월 11일 (수)')
      fireEvent.blur(to())
      expect(to().value).toBe('2026-11-11')
    })
  }

  it('AC-611.1 없는 날(2026-02-30)도 쓰지 않는다', async () => {
    const { user } = setupUser()
    const t = setup()
    await user.click(button('직접'))
    const sent = t.filters().length
    fireEvent.change(from(), { target: { value: '2026-02-30' } })
    expect(t.filters()).toHaveLength(sent)
    expect(rangeText()).toBe('11월 5일 (목) ~ 11월 11일 (수)')
  })

  it('AC-611.1 다른 단추로 갔다 돌아와도 직접 기간은 마지막 값이다', async () => {
    const { user } = setupUser()
    setup()
    await user.click(button('직접'))
    fireEvent.change(from(), { target: { value: '2026-11-06' } })
    await user.click(button('내일'))
    expect(screen.queryByLabelText('시작 날짜')).toBeNull()
    await user.click(button('직접'))
    expect(from().value).toBe('2026-11-06')
  })
})

describe('AC-611.2 빈 상태', () => {
  it('AC-611.2 대상이 없으면 목업 빈 문구뿐이고 지어낸 줄이 없다. [명단 복사]는 막힌다', () => {
    setup({ view: { ...VIEW, rows: [], undecided: [] } })
    expect(within(screen.getByRole('table')).getByRole('cell').textContent).toBe(EMPTY)
    expect(within(screen.getByRole('table')).queryByRole('checkbox')).toBeNull()
    expect(button('명단 복사').getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByTestId('head').textContent).toBe('0명 · 아직 연락 안 한 분 0명')
  })

  it('AC-611.2 첫 답이 오기 전에는 줄도 빈 문구도 없다(없다고 말하지 않는다)', () => {
    const t = setup({ manualFilter: true })
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByText(EMPTY)).toBeNull()
    expect(screen.getByTestId('head').textContent).toBe('')
    expect(button('명단 복사').getAttribute('aria-disabled')).toBe('true')
    t.send(t.filteredReply(t.lastFilter()!))
    expect(shownNames()).toEqual(['내일분', '내일주사'])
  })
})

describe('AC-611.3 [연락함]', () => {
  const KEY = ROWS[0]!.key
  const OTHER = ROWS[1]!.key

  it('AC-611.3 누르면 mark를 보내고 "저장 중". 답이 오기 전에는 표시가 그대로다', async () => {
    const { user } = setupUser()
    const t = setup()
    await user.click(box('내일분'))
    expect(t.marks()).toEqual([{ type: 'mark', key: KEY, on: true, today: TODAY }])
    expect(box('내일분').checked).toBe(false)
    expect(box('내일분').getAttribute('aria-busy')).toBe('true')
    expect(box('내일분').closest('td')!.textContent).toBe('저장 중')
  })

  it('AC-611.3 marked ok면 그 줄이 연락함이 되고 "저장 중"이 풀린다. 아직 연락 안 한 수도 줄어든다', async () => {
    const { user } = setupUser()
    const t = setup()
    await user.click(box('내일분'))
    t.send({ type: 'marked', key: KEY, ok: true, counts: null })
    expect(box('내일분').checked).toBe(true)
    expect(box('내일분').getAttribute('aria-busy')).toBeNull()
    expect(box('내일분').closest('td')!.textContent).toBe('연락함')
    expect(screen.getByTestId('head').textContent).toBe('2명 · 아직 연락 안 한 분 1명')
  })

  it('AC-611.3 표시된 줄을 누르면 끄기(on: false)를 보낸다', async () => {
    const { user } = setupUser()
    const t = setup({ view: { ...VIEW, rows: [row('내일분', TOMORROW, { contacted: true })] } })
    await user.click(box('내일분'))
    expect(t.marks()).toEqual([{ type: 'mark', key: KEY, on: false, today: TODAY }])
    t.send({ type: 'marked', key: KEY, ok: true, counts: null })
    expect(box('내일분').checked).toBe(false)
  })

  it('AC-611.3 실패면 그대로 두고 받은 오류 번호 줄을 보인다. 다시 누르면 줄이 지워지고 다시 보낸다', async () => {
    const { user } = setupUser()
    const t = setup()
    await user.click(box('내일분'))
    t.send({ type: 'marked', key: KEY, ok: false, code: 'E-BRIDGE-DISCONNECTED', counts: null })
    expect(box('내일분').checked).toBe(false)
    expect(box('내일분').getAttribute('aria-busy')).toBeNull()
    expect(mainTable().getByText('연락함을 저장하지 못했어요. 다시 눌러 주세요.')).toBeTruthy()
    expect(mainTable().getByText('오류 번호 E-BRIDGE-DISCONNECTED')).toBeTruthy()

    await user.click(box('내일분'))
    expect(t.marks()).toHaveLength(2)
    expect(mainTable().queryByText('오류 번호 E-BRIDGE-DISCONNECTED')).toBeNull()
  })

  it('AC-611.3 여러 줄을 잇따라 눌러도 막지 않는다: 둘 다 나가고 각자 답을 기다린다', async () => {
    const { user } = setupUser()
    const t = setup()
    await user.click(box('내일분'))
    await user.click(box('내일주사'))
    expect(t.marks().map((m) => m.key)).toEqual([KEY, OTHER])
    expect(box('내일분').closest('td')!.textContent).toBe('저장 중')
    expect(box('내일주사').closest('td')!.textContent).toBe('저장 중')

    t.send({ type: 'marked', key: KEY, ok: true, counts: null })
    expect(box('내일분').closest('td')!.textContent).toBe('연락함')
    expect(box('내일주사').closest('td')!.textContent).toBe('저장 중')

    t.send({ type: 'marked', key: OTHER, ok: false, code: 'E-STORE-FAILED', counts: null })
    expect(box('내일분').checked).toBe(true)
    expect(box('내일주사').checked).toBe(false)
    expect(mainTable().getByText('오류 번호 E-STORE-FAILED')).toBeTruthy()
  })

  it('AC-611.3 기다리는 그 줄을 또 눌러도 다시 보내지 않는다(목업 mark)', async () => {
    const { user } = setupUser()
    const t = setup()
    await user.click(box('내일분'))
    await user.click(box('내일분'))
    expect(t.marks()).toHaveLength(1)
  })

  it('AC-611.3 정기 주사 줄의 marked는 이 도구와 상관없다', async () => {
    const { user } = setupUser()
    const t = setup()
    await user.click(box('내일분'))
    t.send({ type: 'marked', key: 'r|rule|c|2026-11-05', ok: true, counts: null })
    expect(box('내일분').closest('td')!.textContent).toBe('저장 중')
  })

  it('AC-611.3 views가 새로 오면 그 줄을 Worker에 다시 물어 Worker 값으로 그린다', async () => {
    const { user } = setupUser()
    const t = setup()
    await user.click(box('내일분'))
    t.send({ type: 'marked', key: KEY, ok: true, counts: null })
    const sent = t.filters().length
    t.setView({ ...VIEW, rows: ROWS.map((r) => (r.key === KEY ? { ...r, contacted: true } : r)) })
    expect(t.filters()).toHaveLength(sent + 1)
    expect(t.lastFilter()).toEqual(t.filters()[0])
    expect(box('내일분').checked).toBe(true)
  })

  it('AC-611.3 브라우저 저장소를 쓰지 않는다', async () => {
    const { user } = setupUser()
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const t = setup()
    await user.click(box('내일분'))
    t.send({ type: 'marked', key: KEY, ok: true, counts: null })
    await user.click(button('이번 주'))
    expect(setItem).not.toHaveBeenCalled()
    setItem.mockRestore()
  })
})

describe('AC-604.8 store.load 실패: 연락 표시 없이 보이고 [연락함]은 막힌다', () => {
  const VIEW_NO_MARKS: FollowupView = { ...VIEW, marksLoaded: false }
  const BLOCKED = '연락 표시를 불러오지 못해 [연락함]을 쓸 수 없어요.'

  it('AC-604.8 명단은 보이고 체크 칸은 막혀 눌러도 mark가 나가지 않는다', async () => {
    const { user } = setupUser()
    const t = setup({ view: VIEW_NO_MARKS, storeCode: 'E-STORE-BROKEN' })
    expect(shownNames()).toEqual(['내일분', '내일주사'])
    expect(box('내일분').disabled).toBe(true)
    expect(box('내일분').checked).toBe(false)
    await user.click(box('내일분'))
    expect(t.marks()).toEqual([])
  })

  it('AC-604.8 views.codes의 번호와 errors.ts 글을 보인다. 경고 상자(alert)가 아니다 — 명단은 그대로 쓴다', () => {
    setup({ view: VIEW_NO_MARKS, storeCode: 'E-STORE-BROKEN' })
    const info = errorInfo('E-STORE-BROKEN')
    const line = screen.getByText((text) => text.startsWith(BLOCKED))
    expect(line.textContent).toContain(info.what)
    expect(line.textContent).toContain(info.fix)
    expect(screen.getByText('오류 번호 E-STORE-BROKEN')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-604.8 errors.ts에 없는 번호면 고정 글과 번호만이다', () => {
    setup({ view: VIEW_NO_MARKS, storeCode: 'E-HELPER-NEW-CODE' })
    expect(screen.getByText(BLOCKED)).toBeTruthy()
    expect(screen.getByText('오류 번호 E-HELPER-NEW-CODE')).toBeTruthy()
  })

  it('AC-604.8 번호가 없어도 E-STORE-FAILED로 알린다', () => {
    setup({ view: VIEW_NO_MARKS })
    expect(screen.getByText('오류 번호 E-STORE-FAILED')).toBeTruthy()
  })

  it('AC-604.8 표시를 모르니 "아직 연락 안 한 분"은 세지 않는다', () => {
    setup({ view: VIEW_NO_MARKS, storeCode: 'E-STORE-FAILED' })
    expect(screen.getByTestId('head').textContent).toBe('2명')
  })

  it('AC-604.8 다시 불러오기는 누를 때만 부른다(저절로 부르지 않는다)', async () => {
    const { user } = setupUser()
    const t = setup({ view: VIEW_NO_MARKS, storeCode: 'E-STORE-BROKEN' })
    await flush()
    await user.click(button('이번 주'))
    t.setView({ ...VIEW_NO_MARKS })
    expect(t.reload).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '다시 불러오기' }))
    expect(t.reload).toHaveBeenCalledTimes(1)
  })

  it('AC-604.8 표시를 불러왔으면 정기 주사 번호가 있어도 막지 않는다', () => {
    setup({ storeCode: 'E-BIT-READ-FAILED' })
    expect(box('내일분').disabled).toBe(false)
    expect(screen.queryByText('오류 번호 E-BIT-READ-FAILED')).toBeNull()
    expect(screen.queryByRole('button', { name: '다시 불러오기' })).toBeNull()
  })
})

describe('AC-611.4 [명단 복사]', () => {
  it('AC-611.4 처음은 날짜 제목 줄을 넣은 글(listWithDate)을 복사하고 몇 명인지 알린다', async () => {
    const { user, writeText } = setupUser()
    const t = setup()
    await user.click(button('명단 복사'))
    expect(writeText).toHaveBeenCalledExactlyOnceWith(filterFollowup(VIEW, t.lastFilter()!).copy.listWithDate)
    expect(status()).toBe('복사했어요 · 2명 · 날짜 제목 줄 포함')
  })

  it('AC-611.4 날짜 제목 줄을 끄면 list를 복사한다', async () => {
    const { user, writeText } = setupUser()
    const t = setup()
    await user.click(screen.getByRole('checkbox', { name: '날짜 제목 줄 넣기' }))
    await user.click(button('명단 복사'))
    expect(writeText).toHaveBeenCalledExactlyOnceWith(filterFollowup(VIEW, t.lastFilter()!).copy.list)
    expect(status()).toBe('복사했어요 · 2명')
  })

  it('AC-611.4 복사 글은 Worker가 준 것 그대로다(화면이 만들지 않는다)', async () => {
    const { user, writeText } = setupUser()
    const t = setup({ manualFilter: true })
    t.send({ type: 'filtered', tool: 'followup', rows: [ROWS[0]!], undecided: [], copy: { list: 'Worker 글', listWithDate: 'Worker 머리 글' } })
    await user.click(button('명단 복사'))
    expect(writeText).toHaveBeenCalledExactlyOnceWith('Worker 머리 글')
  })

  it('AC-611.4 번호 없는 분은 복사 글에 없으므로(pasteRows) 알리는 수도 복사된 수다', async () => {
    const { user } = setupUser()
    setup({ view: { ...VIEW, rows: [row('내일분', TOMORROW), row('번호없음', TOMORROW, { phone: '' })] } })
    await user.click(button('명단 복사'))
    expect(status()).toBe('복사했어요 · 1명 · 날짜 제목 줄 포함')
  })

  it('AC-611.4 전화 자료를 못 읽었으면(phoneLoaded 거짓) 다 복사되므로 다 센다', async () => {
    const { user } = setupUser()
    setup({ view: { ...VIEW, phoneLoaded: false, rows: [row('내일분', TOMORROW, { phone: '' }), row('내일둘', TOMORROW, { phone: '' })] } })
    await user.click(button('명단 복사'))
    expect(status()).toBe('복사했어요 · 2명 · 날짜 제목 줄 포함')
  })

  it('AC-611.4 고른 줄 모두 번호가 없으면(복사 글이 빈 글) 클립보드를 건드리지 않고 까닭을 알린다', async () => {
    const { user, writeText } = setupUser()
    setup({ view: { ...VIEW, rows: [row('내일분', TOMORROW, { phone: '' }), row('내일둘', TOMORROW, { phone: '' })] } })
    expect(shownNames()).toEqual(['내일둘', '내일분'])
    await user.click(button('명단 복사'))
    expect(writeText).not.toHaveBeenCalled()
    expect(status()).toBe('복사할 명단이 없어요. 모두 번호 없는 분이에요.')

    // 날짜 제목 줄을 꺼도 같다
    await user.click(screen.getByRole('checkbox', { name: '날짜 제목 줄 넣기' }))
    await user.click(button('명단 복사'))
    expect(writeText).not.toHaveBeenCalled()
  })

  describe('"복사할 명단이 없어요" 줄은 지금 고른 줄을 말한다', () => {
    const NO_PHONES = '복사할 명단이 없어요. 모두 번호 없는 분이에요.'
    const mixed = {
      ...VIEW,
      rows: [
        row('번호없음', TOMORROW, { phone: '' }),
        row('조건번호', TOMORROW, { plan: '조건부' }),
        row('지난번호', '2026-11-03'),
        row('이번주번호', '2026-11-07'),
      ],
      undecided: [],
    }
    const pressedWithNoPhones = async () => {
      const used = setupUser()
      const t = setup({ view: mixed })
      await used.user.click(button('명단 복사'))
      expect(status()).toBe(NO_PHONES)
      return { ...used, ...t }
    }

    it('AC-611.4 기간을 바꾸면 지워지고, 번호 있는 분은 그대로 복사된다', async () => {
      const { user, writeText } = await pressedWithNoPhones()
      await user.click(button('이번 주'))
      expect(shownNames()).toEqual(['번호없음', '이번주번호'])
      expect(status()).toBe('')
      await user.click(button('명단 복사'))
      expect(writeText).toHaveBeenCalledOnce()
      expect(status()).toBe('복사했어요 · 1명 · 날짜 제목 줄 포함')
    })

    it('AC-611.4 조건부 포함을 바꾸면 지워진다', async () => {
      const { user } = await pressedWithNoPhones()
      await user.click(screen.getByRole('checkbox', { name: '조건부 포함' }))
      expect(status()).toBe('')
    })

    it('AC-611.4 지난 예정 포함을 바꾸면 지워진다', async () => {
      const { user } = await pressedWithNoPhones()
      await user.click(screen.getByRole('checkbox', { name: '지난 예정 포함' }))
      expect(status()).toBe('')
    })

    it('AC-611.4 구분을 바꾸면 지워진다', async () => {
      const { user } = await pressedWithNoPhones()
      await user.click(group('구분').getByRole('button', { name: '주사' }))
      expect(status()).toBe('')
    })

    it('AC-611.4 직접 기간의 날짜를 바꾸면 지워진다. 잘못된 날짜를 치는 중에는 고른 줄이 그대로라 남는다', async () => {
      const { user } = setupUser()
      setup({ view: { ...mixed, rows: [row('번호없음', TOMORROW, { phone: '' })] } })
      await user.click(button('직접'))
      await user.click(button('명단 복사'))
      expect(status()).toBe(NO_PHONES)
      fireEvent.change(screen.getByLabelText('끝 날짜'), { target: { value: '0002-11-02' } })
      expect(status()).toBe(NO_PHONES)
      fireEvent.change(screen.getByLabelText('끝 날짜'), { target: { value: '2026-11-07' } })
      expect(status()).toBe('')
    })

    it('AC-611.4 고른 줄이 그대로면 남는다: 날짜 제목 줄을 바꾸거나 [연락함]을 눌러도 여전히 맞는 말이다', async () => {
      const { user, send, setView } = await pressedWithNoPhones()
      await user.click(screen.getByRole('checkbox', { name: '날짜 제목 줄 넣기' }))
      expect(status()).toBe(NO_PHONES)
      const key = mixed.rows[0]!.key
      await user.click(box('번호없음'))
      send({ type: 'marked', key, ok: true, counts: null })
      setView({ ...mixed, rows: mixed.rows.map((r) => (r.key === key ? { ...r, contacted: true } : r)) })
      expect(box('번호없음').checked).toBe(true)
      expect(status()).toBe(NO_PHONES)
    })

    it('AC-611.4 "복사했어요"·복사 실패 줄은 지난 누름의 결과라 고르기를 바꿔도 맞는 말이고 그대로 남는다(목업)', async () => {
      const copied = setupUser()
      setup()
      await copied.user.click(button('명단 복사'))
      expect(status()).toBe('복사했어요 · 2명 · 날짜 제목 줄 포함')
      await copied.user.click(button('이번 주'))
      expect(status()).toBe('복사했어요 · 2명 · 날짜 제목 줄 포함')
      cleanup()

      const failed = setupUser(vi.fn(async () => Promise.reject(new Error('막힘'))))
      setup()
      await failed.user.click(button('명단 복사'))
      expect(status()).toBe(COPY_FAILED)
      await failed.user.click(button('이번 주'))
      expect(status()).toBe(COPY_FAILED)
    })
  })

  it('AC-611.4 고르기를 바꾸고 답이 오기 전에는 막혀 옛 기간 글을 복사하지 않는다', async () => {
    const { user, writeText } = setupUser()
    const t = setup({ manualFilter: true })
    t.send(t.filteredReply(t.lastFilter()!))
    expect(button('명단 복사').getAttribute('aria-disabled')).toBeNull()
    await user.click(button('이번 주'))
    expect(button('명단 복사').getAttribute('aria-disabled')).toBe('true')
    await user.click(button('명단 복사'))
    expect(writeText).not.toHaveBeenCalled()
    t.send(t.filteredReply(t.lastFilter()!))
    expect(button('명단 복사').getAttribute('aria-disabled')).toBeNull()
    await user.click(button('명단 복사'))
    expect(writeText).toHaveBeenCalledExactlyOnceWith(filterFollowup(VIEW, t.lastFilter()!).copy.listWithDate)
  })

  it('AC-611.4 잇따라 고르면 마지막 답이 올 때까지 막혀 있다', async () => {
    const { user } = setupUser()
    const t = setup({ manualFilter: true })
    t.send(t.filteredReply(t.lastFilter()!))
    await user.click(button('이번 주'))
    await user.click(button('다음 주'))
    const [, first, second] = t.filters()
    t.send(t.filteredReply(first!))
    expect(button('명단 복사').getAttribute('aria-disabled')).toBe('true')
    t.send(t.filteredReply(second!))
    expect(button('명단 복사').getAttribute('aria-disabled')).toBeNull()
    expect(shownNames()).toEqual(['다음주분'])
  })

  it('AC-611.4 복사가 막히면 실패 글을 보인다', async () => {
    const { user } = setupUser(vi.fn(async () => Promise.reject(new Error('막힘'))))
    setup()
    await user.click(button('명단 복사'))
    expect(status()).toBe(COPY_FAILED)
  })

  it('AC-611.4 문자를 보내는 단추는 없다', async () => {
    setup()
    await flush()
    expect(screen.queryByRole('button', { name: /보내기|발송|전송/ })).toBeNull()
  })
})

describe('AC-611.4 [문구 복사]', () => {
  it('AC-611.4 처음은 주사 안내의 첫 문구를 기간 시작일로 채워 복사한다', async () => {
    const { user, writeText } = setupUser()
    setup()
    await flush()
    expect(group('복사할 문구').getByRole('button', { name: '주사 안내' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('문구 날짜 11월 5일 (목)')).toBeTruthy()
    await user.click(button('문구 복사'))
    expect(writeText).toHaveBeenCalledExactlyOnceWith(fillTemplate(TPL_INJECTION.body, TOMORROW))
    expect(status()).toBe('복사했어요 · 주사 알림 · 11월 5일 (목)')
  })

  it('AC-611.4 진료 안내를 고르면 그 종류 문구다. 기간을 바꾸면 문구 날짜도 바뀐다', async () => {
    const { user, writeText } = setupUser()
    setup()
    await flush()
    await user.click(group('복사할 문구').getByRole('button', { name: '진료 안내' }))
    await user.click(button('다음 주'))
    expect(screen.getByText('문구 날짜 11월 9일 (월)')).toBeTruthy()
    await user.click(button('문구 복사'))
    expect(writeText).toHaveBeenCalledExactlyOnceWith(fillTemplate(TPL_FOLLOWUP.body, '2026-11-09'))
    expect(status()).toBe('복사했어요 · 진료 알림 · 11월 9일 (월)')
  })

  it('AC-611.4 수요일에 이번 주를 보면 줄은 수~일이어도 기간 글자와 문구 날짜는 그 주 월요일부터다(지난 예정을 켜도 같다)', async () => {
    const { user, writeText } = setupUser()
    setup({
      view: {
        ...VIEW,
        rows: [row('월요일분', '2026-11-02'), row('화요일분', '2026-11-03'), row('수요일분', TODAY), row('일요일분', '2026-11-08'), row('다음월분', '2026-11-09')],
      },
    })
    await flush()
    await user.click(button('이번 주'))
    expect(shownNames()).toEqual(['수요일분', '일요일분'])
    expect(rangeText()).toBe('11월 2일 (월) ~ 11월 8일 (일)')
    expect(screen.getByText('문구 날짜 11월 2일 (월)')).toBeTruthy()
    await user.click(button('문구 복사'))
    expect(writeText).toHaveBeenLastCalledWith(fillTemplate(TPL_INJECTION.body, '2026-11-02'))
    expect(status()).toBe('복사했어요 · 주사 알림 · 11월 2일 (월)')

    await user.click(screen.getByRole('checkbox', { name: '지난 예정 포함' }))
    expect(shownNames()).toEqual(['월요일분', '화요일분', '수요일분', '일요일분'])
    expect(rangeText()).toBe('11월 2일 (월) ~ 11월 8일 (일)')
    expect(screen.getByText('문구 날짜 11월 2일 (월)')).toBeTruthy()
    await user.click(button('문구 복사'))
    expect(writeText).toHaveBeenLastCalledWith(fillTemplate(TPL_INJECTION.body, '2026-11-02'))
  })

  it('AC-611.4 그 종류의 첫 줄을 쓴다(읽은 차례)', async () => {
    const { user, writeText } = setupUser()
    sb.result = { data: [TPL_FOLLOWUP, { ...TPL_INJECTION, id: 'x', name: '첫째', body: '첫째 글' }, { ...TPL_INJECTION, id: 'y', name: '둘째', body: '둘째 글' }], error: null }
    setup()
    await flush()
    await user.click(button('문구 복사'))
    expect(writeText).toHaveBeenCalledExactlyOnceWith('첫째 글')
  })

  it('AC-611.4 읽기는 됐고 줄이 없을 때만 기본 문구를 쓴다', async () => {
    const { user, writeText } = setupUser()
    sb.result = { data: [], error: null }
    setup()
    await flush()
    await user.click(button('문구 복사'))
    const injection = DEFAULT_TEMPLATES.find((t) => t.kind === 'injection')!
    expect(writeText).toHaveBeenCalledExactlyOnceWith(fillTemplate(injection.body, TOMORROW))
    expect(status()).toBe('복사했어요 · 주사 안내 · 11월 5일 (목)')
  })

  it('AC-611.4 저장한 줄이 있는데 그 종류가 없으면 기본 문구로 대신하지 않고 목업 글을 보인다', async () => {
    const { user, writeText } = setupUser()
    sb.result = { data: [TPL_INJECTION], error: null }
    setup()
    await flush()
    await user.click(group('복사할 문구').getByRole('button', { name: '진료 안내' }))
    await user.click(button('문구 복사'))
    expect(writeText).not.toHaveBeenCalled()
    expect(status()).toBe('복사할 문구가 없어요. 문자 문구에서 먼저 만들어 주세요.')
  })

  it('AC-611.4 "복사할 문구가 없어요" 줄은 고른 종류를 말한다: 문구가 있는 종류로 바꾸면 지워지고, 기간을 바꿔서는 지워지지 않는다', async () => {
    const { user, writeText } = setupUser()
    sb.result = { data: [TPL_INJECTION], error: null }
    setup()
    await flush()
    await user.click(group('복사할 문구').getByRole('button', { name: '진료 안내' }))
    await user.click(button('문구 복사'))
    const missing = '복사할 문구가 없어요. 문자 문구에서 먼저 만들어 주세요.'
    expect(status()).toBe(missing)
    await user.click(button('이번 주'))
    expect(status()).toBe(missing)
    await user.click(group('복사할 문구').getByRole('button', { name: '주사 안내' }))
    expect(status()).toBe('')
    await user.click(button('문구 복사'))
    expect(writeText).toHaveBeenCalledOnce()
  })

  it('AC-611.4 읽는 동안에는 막혀 있다(기본 문구를 복사하지 않는다)', async () => {
    const { user, writeText } = setupUser()
    let open = () => {}
    sb.gate = new Promise((resolve) => {
      open = resolve
    })
    setup()
    await flush()
    expect(button('문구 복사').getAttribute('aria-disabled')).toBe('true')
    await user.click(button('문구 복사'))
    expect(writeText).not.toHaveBeenCalled()
    expect(status()).toBe('')
    open()
    await flush()
    expect(button('문구 복사').getAttribute('aria-disabled')).toBeNull()
  })

  it('AC-611.4 읽기가 실패하면 그 자리에 오류 번호와 [다시 불러오기]뿐이고 기본 문구로 대신하지 않는다', async () => {
    const { user, writeText } = setupUser()
    sb.result = { data: null, error: { message: '실패' } }
    const t = setup()
    await flush()
    expect(screen.getByText(TPL_FAILED)).toBeTruthy()
    expect(screen.getByText('오류 번호 E-PATIENTS-TEMPLATES-READ')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '문구 복사' })).toBeNull()
    expect(screen.queryByRole('group', { name: '복사할 문구' })).toBeNull()
    expect(writeText).not.toHaveBeenCalled()
    // [명단 복사]는 그대로 쓴다
    expect(button('명단 복사').getAttribute('aria-disabled')).toBeNull()

    // [다시 불러오기]는 문구만 다시 읽는다. 명단을 다시 읽지 않는다(store.load가 또 나가면 안 된다)
    sb.result = { data: [TPL_INJECTION], error: null }
    const reads = sb.reads
    await user.click(screen.getByRole('button', { name: '다시 불러오기' }))
    await flush()
    expect(sb.reads).toBe(reads + 1)
    expect(t.reload).not.toHaveBeenCalled()
    expect(screen.queryByText(TPL_FAILED)).toBeNull()
    expect(button('문구 복사').getAttribute('aria-disabled')).toBeNull()
  })

  it('AC-611.4 Supabase를 부르다 던져도 같은 실패로 보인다', async () => {
    sb.result = null as unknown as typeof sb.result
    setup()
    await flush()
    expect(screen.getByText('오류 번호 E-PATIENTS-TEMPLATES-READ')).toBeTruthy()
  })

  it('AC-611.4 도구가 열려 있지 않으면 읽지 않고, 열 때마다 다시 읽는다(문자 문구에서 고친 글을 복사한다)', async () => {
    const { user, writeText } = setupUser()
    const t = setup({ active: false })
    await flush()
    expect(sb.reads).toBe(0)

    t.setActive(true)
    await flush()
    expect(sb.reads).toBe(1)

    t.setActive(false)
    sb.result = { data: [{ ...TPL_INJECTION, body: '고친 글' }], error: null }
    t.setActive(true)
    expect(button('문구 복사').getAttribute('aria-disabled')).toBe('true')
    await flush()
    expect(sb.reads).toBe(2)
    await user.click(button('문구 복사'))
    expect(writeText).toHaveBeenCalledExactlyOnceWith('고친 글')
  })

  it('AC-611.4 다른 도구로 갔다 오면 복사 결과 줄이 지워진다(목업 setTool)', async () => {
    const { user } = setupUser()
    const t = setup()
    await user.click(button('명단 복사'))
    expect(status()).toContain('복사했어요')
    t.setActive(false)
    t.setActive(true)
    expect(status()).toBe('')
    await flush()
  })
})

describe('AC-611.5 환자 값', () => {
  it('AC-611.5 환자 줄 부품을 비우면 도구 어디에도 이름·전화·차트번호·근거 문구가 없다(글자·속성 모두)', async () => {
    stub.rows = true
    const { user } = setupUser()
    const { container } = setup()
    await flush()
    await user.click(screen.getByRole('checkbox', { name: '조건부 포함' }))
    await user.click(screen.getByRole('checkbox', { name: '지난 예정 포함' }))
    await user.click(button('명단 복사'))
    expect(status()).toContain('복사했어요')
    const html = container.innerHTML
    for (const value of [...ROWS, ...VIEW.undecided].flatMap((r) => [r.name, r.phone, r.chart, r.evidence])) {
      expect(html).not.toContain(value)
    }
  })
})
