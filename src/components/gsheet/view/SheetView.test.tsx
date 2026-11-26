// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FillOutcome } from '@/lib/gsheet/runner'
import type { FillJob, FillReply } from '@/lib/gsheet/shapes'
import { fillStatus, type FillDone } from '@/lib/gsheet/status'
import { DEFAULT_GSHEET_SETTINGS, type GsheetMonth, type GsheetRun, type GsheetSaved } from '@/types/gsheet'
import { reloadForFrame } from './frameReload'
import { SheetView, type SheetViewProps } from './SheetView'

// 수납일지 탭 [구글 시트] 보기(spec google-link REQ-8514·8515·8541, TASK-15, 시안 notes-sunap 상태 none·sheet·filling·done·done-warn·
// newmonth·pastmonth·nobit·err-google·err-frame·overwrite). 기대 글은 notes 글자를 그대로 적었다(labels.ts 상수를 쓰지 않는다).
// 넣기는 받은 onFill(TASK-23이 runFill을 잇는다), 띠·결과 줄은 lib/gsheet/status(fillStatus)를 듣는다.
// 새로 불러오기(frameReload)는 모듈을 흉내 내 화면 시험에서 부르지 않게 하고, 셈 자체는 진짜 모듈로 시험한다(가짜 주소는 전체 주소)

vi.mock('./frameReload', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./frameReload')>()
  return { ...actual, reloadForFrame: vi.fn(() => false) }
})
const real = await vi.importActual<typeof import('./frameReload')>('./frameReload')

const NOW = new Date('2026-11-26T05:37:00Z') // 한국 2026-11-26 (목) 14:37
const TODAY = '2026-11-26'
const FILE = (tag: string) => `FakeFile${tag}xxxxxxxxxxxxxxxx`
const NOV = FILE('Nov2026')
const OCT = FILE('Oct2026')
const DEC = FILE('Dec2026')
const MONTHS: GsheetMonth[] = [
  { ym: '2026-10', fileId: OCT, gids: { '1': 222, '26': 999 } },
  { ym: '2026-11', fileId: NOV, gids: { '1': 111, '26': 123456 } },
]
const SAVED: GsheetSaved = {
  settings: { ...DEFAULT_GSHEET_SETTINGS, templateUrl: 'https://docs.google.com/spreadsheets/d/FakeTemplatexxxxxxxxxxxxxxxx/edit' },
  secretTag: 'a1b2c3d4e5f60718',
}
const NOV_FRAME = `https://docs.google.com/spreadsheets/d/${NOV}/edit?rm=minimal#gid=123456`

const norm = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
const frame = () => screen.queryByTitle('구글 시트') as HTMLIFrameElement | null
const UNDER = '시트가 비어 보이거나 구글 로그인 화면이 나오면 [새 창으로 열기]로 열어 주세요. 여기서 고친 칸은 구글 시트에 바로 저장돼요.'

function run(over: Partial<GsheetRun> = {}): GsheetRun {
  return { at: '2026-11-26T05:35:00Z', day: TODAY, via: 'auto', mode: 'fillEmpty', outcome: 'ok', code: null, rows: 12, counts: {}, cells: [], ...over }
}
function done(over: Partial<FillDone> = {}): FillDone {
  return { at: '2026-11-26T05:41:00Z', day: TODAY, via: 'hand', mode: 'fillEmpty', outcome: 'ok', code: null, rows: 12, ...over }
}
function reply(over: Partial<FillReply> = {}): FillReply {
  return {
    rows: 12, patients: 10, added: 2, filled: 1, overwritten: 0, skipped: 0, full: false, cancelCleared: 0, cancelKept: 0, freeFixed: 0, inserted: 0,
    cleaned: 0, shareFailed: 0, created: false, ratioFixed: 0, ratioSkipped: [], ratioSkippedCount: 0, ratioFailed: false, split: 0, free: 0,
    paidOnly: 0, notes: 0, notPut: { noName: 0, unlinked: 0, negative: 0, noChart: 0 }, fileId: null, sheetGid: null, version: '8', oldCode: false,
    ...over,
  }
}

function renderView(over: Partial<SheetViewProps> = {}) {
  const props: SheetViewProps = {
    saved: SAVED,
    months: MONTHS,
    runs: [],
    hospitalName: '샘플정형외과의원',
    shareCount: null,
    onFill: vi.fn(async (): Promise<FillOutcome> => ({ kind: 'viewer' })),
    onOpenSettings: vi.fn(),
    onOpenGuide: vi.fn(),
    now: () => NOW,
    ...over,
  }
  const utils = render(<SheetView {...props} />)
  return { ...utils, props }
}
const asFiller = () => act(() => fillStatus.setPc('filler'))
const trigger = () => screen.getByRole('button', { name: /^달 고르기 — 지금/ })
const pickMonth = (name: string) => {
  fireEvent.click(trigger())
  fireEvent.click(within(screen.getByRole('list')).getByRole('button', { name }))
}

beforeEach(() => {
  fillStatus.reset()
  vi.mocked(reloadForFrame).mockClear()
  vi.mocked(reloadForFrame).mockReturnValue(false)
  localStorage.clear()
  sessionStorage.clear()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  fillStatus.reset()
})

describe('AC-8514.2: 구글 연결 전(none)', () => {
  it.each([
    ['넣는 PC 표시가 없음', { ...SAVED, secretTag: null }],
    ['원본 시트 주소가 빔', { ...SAVED, settings: { ...SAVED.settings, templateUrl: '' } }],
    ['원본 시트 주소가 빈칸뿐', { ...SAVED, settings: { ...SAVED.settings, templateUrl: '   ' } }],
  ])('AC-8514.2: %s — notes none 글이 그대로 보이고 틀이 없다', (_why, saved) => {
    renderView({ saved })
    expect(screen.getByRole('heading', { name: '수납일지 시트를 아직 연결하지 않았어요' })).toBeTruthy()
    expect(
      screen.getByText("병원 구글 계정의 '일일 수납일지' 시트를 이 탭 안에 띄우고, 비트에서 그날 수납을 5분마다 저절로 넣어요. 처음 한 번만 하면 돼요(20분쯤)."),
    ).toBeTruthy()
    const steps = screen.getAllByRole('listitem')
    expect(steps).toHaveLength(4)
    const want = [
      ['1', '병원 구글 계정에 원본 시트 두기', "원장님 개인 계정이 아니라 병원 구글 계정의 드라이브에 '일일 수납일지' 원본 시트가 있어야 해요. 달마다 이 원본을 복사해 새 달 파일을 만들어요."],
      ['2', '구글에 코드 붙이기', '비트 PC에서 [설정] › 구글 연결 › [구글에 붙일 코드 복사]를 누르고, 병원 구글 계정의 구글 자동 실행 도구(script.google.com)에 붙여 넣은 뒤 배포해요. 순서는 안내문에 그림과 함께 있어요.'],
      ['3', '주소 두 개 넣기', '구글이 준 주소와 원본 시트 주소를 설정에 넣고 [연결 시험]을 눌러요.'],
      ['4', '끝', '이 탭에 시트가 바로 떠요. 비트 PC에서 웹앱이 열려 있는 동안 5분마다 저절로 넣어요. 다른 PC에서는 시트를 보고 고치기만 해요.'],
    ]
    steps.forEach((li, i) => {
      const [no, title, text] = want[i]
      expect(within(li).getByText(no)).toBeTruthy()
      expect(within(li).getByText(title).tagName).toBe('B')
      expect(within(li).getByText(text)).toBeTruthy()
    })
    expect(
      screen.getByText('비트시트 프로그램을 쓰고 있었다면 설정 화면 맨 위 [그대로 가져오기]로 그 설정을 옮길 수 있어요. 설정은 비트 PC에서 해요(비트 진료과·처방 목록을 그 PC에서 읽어요).'),
    ).toBeTruthy()
    expect(frame()).toBeNull()
    expect(screen.queryByTestId('sheet-band')).toBeNull()
    expect(reloadForFrame).not.toHaveBeenCalled()
  })

  it('AC-8514.2: [설정 열기](파란)는 onOpenSettings, [안내문 보기]는 onOpenGuide', () => {
    const { props } = renderView({ saved: { ...SAVED, secretTag: null } })
    const open = screen.getByRole('button', { name: '설정 열기' })
    expect(open.className).toContain('bg-accent')
    fireEvent.click(open)
    fireEvent.click(screen.getByRole('button', { name: '안내문 보기' }))
    expect(props.onOpenSettings).toHaveBeenCalledTimes(1)
    expect(props.onOpenGuide).toHaveBeenCalledTimes(1)
  })
})

describe('AC-8514.3: 연결된 병원 — 띠 · 틀 · 틀 아래 작은 글', () => {
  it('AC-8514.3: 띠는 "샘플정형외과의원 일일수납일지 [2026년 11월] · 26일 시트"', () => {
    renderView()
    expect(norm(screen.getByTestId('sheet-band')).startsWith('샘플정형외과의원 일일수납일지 2026년 11월 · 26일 시트')).toBe(true)
  })

  it('AC-8514.3: 병원 이름 칸을 채웠으면 그 이름이 {병원} 자리에 든다', () => {
    renderView({ saved: { ...SAVED, settings: { ...SAVED.settings, hospitalLabel: '예시의원' } } })
    expect(norm(screen.getByTestId('sheet-band')).startsWith('예시의원 일일수납일지 2026년 11월 · 26일 시트')).toBe(true)
  })

  it('AC-8514.3: 파일 이름 틀에 달이 끝에 없으면 이름 뒤에 달 고르기를 둔다', () => {
    renderView({ saved: { ...SAVED, settings: { ...SAVED.settings, namePattern: '{yyyy}-{mm} {병원} 수납' } } })
    expect(norm(screen.getByTestId('sheet-band')).startsWith('2026-11 샘플정형외과의원 수납 2026년 11월 · 26일 시트')).toBe(true)
  })

  it('AC-8514.3: 틀은 이번 달 파일의 오늘 시트(rm=minimal, gid), 바깥 주소 안 보냄·클립보드만 허락·sandbox 없음', () => {
    renderView()
    const iframe = frame()
    expect(iframe).not.toBeNull()
    expect(iframe?.getAttribute('src')).toBe(NOV_FRAME)
    expect(iframe?.getAttribute('referrerpolicy')).toBe('no-referrer')
    expect(iframe?.getAttribute('allow')).toBe('clipboard-read; clipboard-write')
    expect(iframe?.hasAttribute('sandbox')).toBe(false)
    expect(screen.getByText(UNDER)).toBeTruthy()
  })

  it('AC-8514.3: [새 창으로 열기 ↗]는 같은 시트를 메뉴가 있는 모양으로 새 창(noopener)에', () => {
    renderView()
    const link = screen.getByRole('link', { name: '새 창으로 열기' })
    expect(link.getAttribute('href')).toBe(`https://docs.google.com/spreadsheets/d/${NOV}/edit#gid=123456`)
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  it.each([
    ['음수', -1],
    ['소수', 1.5],
  ])('AC-8514.3: gid가 %s면 주소에 넣지 않는다(파일 첫 시트로 열림)', (_why, gid) => {
    renderView({ months: [{ ym: '2026-11', fileId: NOV, gids: { '26': gid } }] })
    expect(frame()?.getAttribute('src')).toBe(`https://docs.google.com/spreadsheets/d/${NOV}/edit?rm=minimal`)
  })

  it('AC-8514.3: 그날 gid가 없으면(옛 구글 코드) 파일 첫 시트로 연다', () => {
    renderView({ months: [{ ym: '2026-11', fileId: NOV, gids: {} }] })
    expect(frame()?.getAttribute('src')).toBe(`https://docs.google.com/spreadsheets/d/${NOV}/edit?rm=minimal`)
  })

  it.each(['../evil', 'short', `${'x'.repeat(101)}`, 'abc"onload="x'.padEnd(24, 'y')])('AC-8514.3: 파일 id 모양이 틀리면(%s) 주소를 만들지 않는다', (fileId) => {
    renderView({ months: [{ ym: '2026-11', fileId, gids: { '26': 1 } }] })
    expect(frame()).toBeNull()
    expect(document.body.innerHTML).not.toContain('docs.google.com')
    expect(screen.queryByRole('link', { name: '새 창으로 열기' })).toBeNull()
  })

  it('AC-8514.3: 이번 달 파일이 아직 없으면 틀 대신 "2026년 11월 파일 없음"', () => {
    renderView({ months: [] })
    expect(frame()).toBeNull()
    expect(screen.getByText('2026년 11월 파일 없음')).toBeTruthy()
  })
})

describe('AC-8514.3: 다른 주소에서 연 문서는 틀을 그리기 전에 한 번 새로 불러온다(/sunap CSP)', () => {
  const MARK = real.RELOAD_MARK
  type Store = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void; data: Map<string, string> }
  const store = (): Store => {
    const data = new Map<string, string>()
    return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) }
  }
  function env(url: string | null, s: Store | 'blocked') {
    const marks: (string | null)[] = []
    const replace = vi.fn(() => {
      marks.push(s === 'blocked' ? null : s.getItem(MARK))
    })
    return {
      env: {
        navigation: () => (url === null ? undefined : { name: url }),
        storage: () => {
          if (s === 'blocked') throw new Error('SecurityError')
          return s
        },
        location: { href: 'https://example.test/sunap', replace },
      },
      replace,
      marks,
    }
  }

  it('AC-8514.3: https://example.test/dashboard에서 연 문서 → 한 번, 표시는 location.replace 전에 적힌다', () => {
    const s = store()
    const e = env('https://example.test/dashboard', s)
    expect(real.reloadForFrame(e.env)).toBe(true)
    expect(e.replace).toHaveBeenCalledTimes(1)
    expect(e.replace).toHaveBeenCalledWith('https://example.test/sunap')
    expect(e.marks).toEqual(['1'])
    expect(s.getItem(MARK)).toBe('1')
  })

  it('AC-8514.3: https://example.test/sunap에서 연 문서 → 안 부름(아래 주소도)', () => {
    for (const url of ['https://example.test/sunap', 'https://example.test/sunap/settings?x=1']) {
      const e = env(url, store())
      expect(real.reloadForFrame(e.env)).toBe(false)
      expect(e.replace).not.toHaveBeenCalled()
    }
  })

  it('AC-8514.3: 항목 없음 → 안 부름', () => {
    const e = env(null, store())
    expect(real.reloadForFrame(e.env)).toBe(false)
    expect(e.replace).not.toHaveBeenCalled()
  })

  it('AC-8514.3: 표시가 있는 채 https://example.test/dashboard 문서 → 안 부름', () => {
    const s = store()
    s.setItem(MARK, '1')
    const e = env('https://example.test/dashboard', s)
    expect(real.reloadForFrame(e.env)).toBe(false)
    expect(e.replace).not.toHaveBeenCalled()
  })

  it('AC-8514.3: 표시가 있는 채 https://example.test/sunap 문서 → 표시 지움, 그 뒤 https://example.test/dashboard 문서 → 다시 한 번', () => {
    const s = store()
    s.setItem(MARK, '1')
    const atSunap = env('https://example.test/sunap', s)
    expect(real.reloadForFrame(atSunap.env)).toBe(false)
    expect(atSunap.replace).not.toHaveBeenCalled()
    expect(s.getItem(MARK)).toBeNull()
    const atDashboard = env('https://example.test/dashboard', s)
    expect(real.reloadForFrame(atDashboard.env)).toBe(true)
    expect(atDashboard.replace).toHaveBeenCalledTimes(1)
    expect(atDashboard.marks).toEqual(['1'])
  })

  it('AC-8514.3: 저장소가 막히면 안 부름(틀이 막히면 err-frame 안내)', () => {
    const blocked = env('https://example.test/dashboard', 'blocked')
    expect(real.reloadForFrame(blocked.env)).toBe(false)
    expect(blocked.replace).not.toHaveBeenCalled()
    const s = store()
    s.setItem = () => {
      throw new Error('QuotaExceededError')
    }
    const full = env('https://example.test/dashboard', s)
    expect(real.reloadForFrame(full.env)).toBe(false)
    expect(full.replace).not.toHaveBeenCalled()
  })

  it('AC-8514.3: 항목 주소를 읽지 못하면 안 부름', () => {
    const e = env('not a url', store())
    expect(real.reloadForFrame(e.env)).toBe(false)
    expect(e.replace).not.toHaveBeenCalled()
  })

  it('AC-8514.3: 화면은 틀을 그리기 전에 한 번 묻고, 새로 불러오면 틀을 그리지 않는다', () => {
    vi.mocked(reloadForFrame).mockReturnValue(true)
    renderView()
    expect(reloadForFrame).toHaveBeenCalledTimes(1)
    expect(frame()).toBeNull()
  })

  it('AC-8514.3: 새로 불러오지 않으면 틀을 그린다(다시 그려도 한 번만 묻는다)', () => {
    const { rerender, props } = renderView()
    rerender(<SheetView {...props} runs={[run()]} />)
    expect(reloadForFrame).toHaveBeenCalledTimes(1)
    expect(frame()).not.toBeNull()
  })
})

describe('AC-8514.4: 지난 달 파일 보기(pastmonth)', () => {
  it('AC-8514.4: 지난 달을 고르면 그 달 1일 시트 + 주황 줄 + [이번 달로]', () => {
    renderView()
    pickMonth('2026년 10월')
    expect(frame()?.getAttribute('src')).toBe(`https://docs.google.com/spreadsheets/d/${OCT}/edit?rm=minimal#gid=222`)
    expect(norm(screen.getByTestId('sheet-band')).startsWith('샘플정형외과의원 일일수납일지 2026년 10월 · 1일 시트')).toBe(true)
    const past = screen.getByTestId('past-month')
    expect(norm(past)).toBe('지난 달 파일을 보고 있어요 · 저절로 넣기는 이번 달 파일에만 해요. 여기서 고친 칸은 10월 파일에 바로 저장돼요. 이번 달로')
    expect(within(past).getByText('지난 달 파일을 보고 있어요').tagName).toBe('B')
    expect(within(past).getByRole('button', { name: '이번 달로' }).className).toContain('bg-accent')
  })

  it('AC-8514.4: [이번 달로]를 누르면 이번 달 오늘 시트로 돌아온다', () => {
    renderView()
    pickMonth('2026년 10월')
    fireEvent.click(screen.getByRole('button', { name: '이번 달로' }))
    expect(frame()?.getAttribute('src')).toBe(NOV_FRAME)
    expect(screen.queryByTestId('past-month')).toBeNull()
  })

  it('AC-8514.4: 탭을 다시 열면 이번 달이다(저장 안 함)', () => {
    const first = renderView()
    pickMonth('2026년 10월')
    first.unmount()
    renderView()
    expect(frame()?.getAttribute('src')).toBe(NOV_FRAME)
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })

  it('AC-8514.4: 지난 달을 보는 중에도 띠의 넣기 상태는 이번 달 그대로', () => {
    renderView({ runs: [run()] })
    asFiller()
    pickMonth('2026년 10월')
    expect(norm(screen.getByTestId('sheet-band-status'))).toBe('저절로 넣기 켜짐 웹앱이 열려 있는 동안 5분마다 · 마지막 14:35 (12줄)')
  })
})

describe('AC-8514.5: 틀이 20초 안에 열리지 않음(err-frame)', () => {
  const PANEL = '시트를 이 화면 안에서 열지 못했어요'

  it('AC-8514.5: 20초 load가 없으면 err-frame 판(글 notes 그대로), 띠는 그대로', () => {
    vi.useFakeTimers()
    renderView()
    act(() => {
      vi.advanceTimersByTime(19_999)
    })
    expect(screen.queryByText(PANEL)).toBeNull()
    act(() => {
      vi.advanceTimersByTime(1)
    })
    const panel = screen.getByTestId('frame-failed')
    expect(within(panel).getByRole('heading', { name: PANEL })).toBeTruthy()
    const ps = [...panel.querySelectorAll('p')].map((p) => norm(p))
    expect(ps).toEqual([
      '이 인터넷 창이 병원 구글 계정에 로그인되어 있지 않거나, 로그인한 계정에 이 시트를 볼 권한이 없을 때 그래요. 비트에서 넣기는 그대로 돌아요.',
      '그래도 안 열리면 새 창에서 그대로 쓰셔도 돼요. 이 탭(또는 웹앱 아무 탭)이 열려 있으면 넣기는 계속돼요.',
    ])
    expect(within(panel).getByText('비트에서 넣기는 그대로 돌아요.').tagName).toBe('B')
    expect([...panel.querySelectorAll('li')].map((li) => norm(li))).toEqual([
      '[새 창으로 열기]를 눌러 병원 구글 계정으로 로그인해요.',
      '시트가 열리면 이 화면으로 돌아와 [다시 열기]를 눌러요.',
    ])
    expect(frame()).toBeNull()
    expect(screen.queryByText(UNDER)).toBeNull()
    expect(screen.getByTestId('sheet-band')).toBeTruthy()
  })

  it('AC-8514.5: [새 창으로 열기 ↗](파란)은 새 창(noopener), [다시 열기]는 틀을 다시 연다', () => {
    vi.useFakeTimers()
    renderView()
    act(() => {
      vi.advanceTimersByTime(20_000)
    })
    const panel = screen.getByTestId('frame-failed')
    const open = within(panel).getByRole('link', { name: '새 창으로 열기' })
    expect(open.getAttribute('href')).toBe(`https://docs.google.com/spreadsheets/d/${NOV}/edit#gid=123456`)
    expect(open.getAttribute('target')).toBe('_blank')
    expect(open.getAttribute('rel')).toContain('noopener')
    expect(open.className).toContain('bg-accent')
    fireEvent.click(within(panel).getByRole('button', { name: '다시 열기' }))
    expect(frame()?.getAttribute('src')).toBe(NOV_FRAME)
    expect(screen.queryByTestId('frame-failed')).toBeNull()
    act(() => {
      vi.advanceTimersByTime(20_000)
    })
    expect(screen.getByTestId('frame-failed')).toBeTruthy()
  })

  it('AC-8514.5: 20초 안에 열리면(load) 판이 뜨지 않는다', () => {
    vi.useFakeTimers()
    renderView()
    fireEvent.load(frame() as HTMLIFrameElement)
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(screen.queryByTestId('frame-failed')).toBeNull()
    expect(frame()).not.toBeNull()
  })

  it('AC-8514.5: 넣기는 그대로 돈다(판이 떠도 [지금 넣기]가 있다)', async () => {
    vi.useFakeTimers()
    const { props } = renderView()
    asFiller()
    act(() => {
      vi.advanceTimersByTime(20_000)
    })
    fireEvent.click(screen.getByRole('button', { name: '지금 넣기' }))
    expect(props.onFill).toHaveBeenCalledTimes(1)
  })
})

describe('AC-8514.6: 새 달 파일 만든 날(newmonth)', () => {
  const DEC1 = new Date('2026-12-01T00:07:00Z') // 한국 12월 1일 09:07
  const MADE = run({ at: '2026-12-01T00:05:00Z', day: '2026-12-01', rows: 3, counts: { created: true, cleaned: 9, ratioFixed: 128, shareFailed: 0, rows: 3 } })
  const WITH_DEC: GsheetMonth[] = [...MONTHS, { ym: '2026-12', fileId: DEC, gids: { '1': 333 } }]
  const notice = () => screen.queryByTestId('new-month')

  it('AC-8514.6: 파란 알림 글(원본과 같은 폴더·지운 칸·비율 식·공유)이 notes 그대로 + [11월 파일 열기 ↗] [확인]', () => {
    renderView({ now: () => DEC1, runs: [MADE], months: WITH_DEC, shareCount: 2 })
    const el = notice()
    expect(norm(el)).toBe(
      "12월 파일을 새로 만들었어요. 원본 시트를 복사해 '샘플정형외과의원 일일수납일지 2026년 12월'을 원본과 같은 폴더에 만들었어요. 새 파일 날짜 시트에 남아 있던 글자 9칸을 지웠어요(원본은 그대로) · 비율 식(초진·90일초진·Block·물리치료 %) 128칸을 차트번호로 세게 고쳤어요 · 함께 쓸 직원 메일 2개에 편집 권한을 줬어요. 11월 파일은 그대로 있어요. 11월 파일 열기 확인",
    )
    expect(within(el as HTMLElement).getByText('12월 파일을 새로 만들었어요.').tagName).toBe('B')
    const prev = within(el as HTMLElement).getByRole('link', { name: '11월 파일 열기' })
    expect(prev.getAttribute('href')).toBe(`https://docs.google.com/spreadsheets/d/${NOV}/edit`)
    expect(prev.getAttribute('rel')).toContain('noopener')
    expect(norm(screen.getByTestId('sheet-band')).startsWith('샘플정형외과의원 일일수납일지 2026년 12월 · 1일 시트')).toBe(true)
  })

  it('AC-8514.6: 폴더를 정했으면 "정한 폴더에", 지운 칸 0·비율 식 0이면 그 글을 빼고, 공유 실패 글', () => {
    const made = run({ ...MADE, counts: { created: true, cleaned: 0, ratioFixed: 0, shareFailed: 1 } })
    renderView({
      now: () => DEC1,
      runs: [made],
      months: WITH_DEC,
      shareCount: 2,
      saved: { ...SAVED, settings: { ...SAVED.settings, folderUrl: 'https://drive.google.com/drive/folders/FakeFolderxxxxxxxxxxxx' } },
    })
    expect(norm(notice())).toBe(
      "12월 파일을 새로 만들었어요. 원본 시트를 복사해 '샘플정형외과의원 일일수납일지 2026년 12월'을 정한 폴더에 만들었어요. 함께 쓸 직원 메일 1개에는 권한을 주지 못했어요 — 설정 › 시트에서 메일을 확인해 주세요. 11월 파일은 그대로 있어요. 11월 파일 열기 확인",
    )
  })

  it('AC-8514.6: 함께 쓸 메일 수를 모르면(이 PC가 넣는 PC가 아님) 공유 글은 뺀다', () => {
    renderView({ now: () => DEC1, runs: [MADE], months: WITH_DEC, shareCount: null })
    expect(norm(notice())).not.toContain('함께 쓸 직원 메일')
  })

  it('AC-8514.6: [확인]을 누르면 그날은 다시 뜨지 않는다(탭을 다시 열어도)', () => {
    const first = renderView({ now: () => DEC1, runs: [MADE], months: WITH_DEC })
    fireEvent.click(within(notice() as HTMLElement).getByRole('button', { name: '확인' }))
    expect(notice()).toBeNull()
    first.unmount()
    renderView({ now: () => DEC1, runs: [MADE], months: WITH_DEC })
    expect(notice()).toBeNull()
  })

  it('AC-8514.6: 다음 날은 뜨지 않는다', () => {
    renderView({ now: () => new Date('2026-12-02T00:07:00Z'), runs: [MADE], months: WITH_DEC })
    expect(notice()).toBeNull()
  })

  it('AC-8514.6: 새 달 파일을 만들지 않은 기록·실패 기록에는 뜨지 않는다', () => {
    renderView({ now: () => DEC1, runs: [run({ ...MADE, counts: { created: false } }), run({ ...MADE, outcome: 'fail', code: 'E-GSHEET-NET' })], months: WITH_DEC })
    expect(notice()).toBeNull()
  })

  it('AC-8514.6: 이 화면에서 넣은 답이 새 달 파일을 만들었어도 뜬다', () => {
    renderView({ now: () => DEC1, months: WITH_DEC })
    asFiller()
    act(() => fillStatus.finish(done({ at: '2026-12-01T00:06:00Z', day: '2026-12-01', via: 'auto', reply: reply({ created: true, cleaned: 9, ratioFixed: 0 }) })))
    expect(norm(notice())).toContain('12월 파일을 새로 만들었어요.')
    expect(norm(notice())).toContain('새 파일 날짜 시트에 남아 있던 글자 9칸을 지웠어요(원본은 그대로).')
  })

  it('AC-8514.6: 지난 달 파일이 없으면 [11월 파일 열기 ↗]가 없다', () => {
    renderView({ now: () => DEC1, runs: [MADE], months: [{ ym: '2026-12', fileId: DEC, gids: {} }] })
    expect(within(notice() as HTMLElement).queryByRole('link')).toBeNull()
  })
})

describe('AC-8514.7·AC-8541.2: 넣는 PC가 아님(nobit)', () => {
  it('AC-8514.7: 아직 모름·보기만 PC는 [보기만] 띠 + 비트 PC 마지막 넣기(서버 기록) + [새 창으로 열기 ↗]만', () => {
    renderView({ runs: [run()] })
    expect(norm(screen.getByTestId('sheet-band-status'))).toBe(
      '보기만 이 PC에서는 넣기를 못 해요. 비트 PC에서 웹앱이 열려 있으면 저절로 넣어요. · 비트 PC 마지막 넣기 14:35 (12줄)',
    )
    for (const name of ['지금 넣기', '덮어쓰기…', '설정']) expect(screen.queryByRole('button', { name })).toBeNull()
    expect(screen.getByRole('link', { name: '새 창으로 열기' })).toBeTruthy()
  })

  it('AC-8541.2: 옛 도우미·옛 확장 PC는 nobit 띠 아래 두 줄 + [비트 PC 연결]', () => {
    renderView()
    act(() => fillStatus.setPc('viewer', { helper: true, extension: true }))
    expect(screen.getByText('이 PC의 도우미가 옛 판이라 넣지 못해요. 비트 PC 연결 화면에서 새 도우미를 받아 설치해 주세요.')).toBeTruthy()
    expect(screen.getByText('이 PC의 크롬 확장이 옛 판이라 넣지 못해요. 비트 PC 연결 화면에서 새 확장을 받아 바꾼 뒤 웹앱을 새로 고쳐 주세요.')).toBeTruthy()
    expect(screen.getByRole('link', { name: '비트 PC 연결' }).getAttribute('href')).toBe('/claim/setup')
    expect(screen.queryByRole('button', { name: '지금 넣기' })).toBeNull()
  })

  it('AC-8541.2: 새 판 PC에는 옛 판 안내가 없다', () => {
    renderView()
    act(() => fillStatus.setPc('viewer'))
    expect(screen.queryByRole('link', { name: '비트 PC 연결' })).toBeNull()
  })
})

describe('AC-8515.2: [지금 넣기]', () => {
  it('AC-8515.2: 오늘을 빈 칸만 채우기로(손 넣기) onFill', () => {
    const { props } = renderView()
    asFiller()
    fireEvent.click(screen.getByRole('button', { name: '지금 넣기' }))
    expect(props.onFill).toHaveBeenCalledWith({ day: TODAY, mode: 'fillEmpty', via: 'hand', auto: false } satisfies FillJob)
  })

  it('AC-8515.2: 지난 달을 보는 중에도 오늘(이번 달 파일)', () => {
    const { props } = renderView()
    asFiller()
    pickMonth('2026년 10월')
    fireEvent.click(screen.getByRole('button', { name: '지금 넣기' }))
    expect(props.onFill).toHaveBeenCalledWith({ day: TODAY, mode: 'fillEmpty', via: 'hand', auto: false })
  })

  it('AC-8515.2: 넣는 동안 filling 띠·[지금 넣기][덮어쓰기…] 잠김', () => {
    renderView()
    asFiller()
    act(() => {
      fillStatus.start({ day: TODAY, mode: 'fillEmpty', via: 'auto', auto: true })
    })
    expect(norm(screen.getByTestId('sheet-band-status'))).toBe('넣는 중… 26일 시트 · 빈 칸만 채우기 · 비트에서 읽어 구글 시트에 넣고 있어요')
    expect(screen.getByRole('button', { name: '지금 넣기' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: '덮어쓰기…' })).toHaveProperty('disabled', true)
  })

  it('AC-8515.2: 다른 넣기가 돌고 있으면 "다른 넣기가 아직 돌고 있어요. 조금 뒤 다시 해 보세요."', async () => {
    const onFill = vi.fn(async (): Promise<FillOutcome> => ({ kind: 'busy' }))
    renderView({ onFill })
    asFiller()
    fireEvent.click(screen.getByRole('button', { name: '지금 넣기' }))
    expect(await screen.findByText('다른 넣기가 아직 돌고 있어요. 조금 뒤 다시 해 보세요.')).toBeTruthy()
  })

  it('AC-8515.2: 도우미에 묻지 못하면 까닭 글(비트 번호 = 비트 도우미 연결)', async () => {
    const onFill = vi.fn(async (): Promise<FillOutcome> => ({ kind: 'unreachable', code: 'E-BRIDGE-DISCONNECTED' }))
    renderView({ onFill })
    asFiller()
    fireEvent.click(screen.getByRole('button', { name: '지금 넣기' }))
    const note = await screen.findByTestId('fill-note')
    expect(norm(note)).toBe('비트를 읽지 못했어요 비트 도우미 연결을 확인해 주세요.')
  })

  it('AC-8515.2: 다음 넣기를 누르면 앞 안내 글은 지운다', async () => {
    const onFill = vi.fn(async (): Promise<FillOutcome> => ({ kind: 'busy' }))
    renderView({ onFill })
    asFiller()
    fireEvent.click(screen.getByRole('button', { name: '지금 넣기' }))
    await screen.findByTestId('fill-note')
    onFill.mockImplementationOnce(() => new Promise(() => undefined))
    fireEvent.click(screen.getByRole('button', { name: '지금 넣기' }))
    await waitFor(() => expect(screen.queryByTestId('fill-note')).toBeNull())
  })
})

describe('AC-8515.3: [덮어쓰기…]', () => {
  it('AC-8515.3: 창은 오늘에서 시작하고, [덮어쓰기]를 누르면 창이 닫히고 onFill(그날, 덮어쓰기)', () => {
    const { props } = renderView()
    asFiller()
    fireEvent.click(screen.getByRole('button', { name: '덮어쓰기…' }))
    expect(norm(screen.getByTestId('overwrite-day'))).toBe('2026년 11월 26일 (목)')
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '덮어쓰기' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(props.onFill).toHaveBeenCalledWith({ day: TODAY, mode: 'overwrite', via: 'hand', auto: false })
  })

  it('AC-8515.3: 지난 달을 보는 중이면 그 달 1일에서 시작, [빈 칸만 채우기]도 창에서', () => {
    const { props } = renderView()
    asFiller()
    pickMonth('2026년 10월')
    fireEvent.click(screen.getByRole('button', { name: '덮어쓰기…' }))
    expect(norm(screen.getByTestId('overwrite-day'))).toBe('2026년 10월 1일 (목)')
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '빈 칸만 채우기' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(props.onFill).toHaveBeenCalledWith({ day: '2026-10-01', mode: 'fillEmpty', via: 'hand', auto: false })
  })

  it('AC-8515.3: [취소]는 창만 닫는다', () => {
    const { props } = renderView()
    asFiller()
    fireEvent.click(screen.getByRole('button', { name: '덮어쓰기…' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '취소' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(props.onFill).not.toHaveBeenCalled()
  })

  it('AC-8515.3: [설정]은 onOpenSettings', () => {
    const { props } = renderView()
    asFiller()
    fireEvent.click(screen.getByRole('button', { name: '설정' }))
    expect(props.onOpenSettings).toHaveBeenCalledTimes(1)
  })
})

describe('AC-8515.4: 결과 줄', () => {
  it('AC-8515.4: 손으로 넣은 결과는 띠 아래 결과 줄, [✕]로 닫는다', () => {
    renderView()
    asFiller()
    act(() => fillStatus.finish(done({ reply: reply() })))
    expect(screen.getByText('✔ 넣었어요')).toBeTruthy()
    expect(screen.getByText('— 11월 26일 시트 · 빈 칸만 채우기 · 14:41')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '결과 닫기' }))
    expect(screen.queryByText('✔ 넣었어요')).toBeNull()
  })

  it('AC-8515.4: 저절로 넣은 보통 결과는 줄을 띄우지 않고 마지막 시각 (n줄)만 바뀐다', () => {
    renderView()
    asFiller()
    act(() => fillStatus.finish(done({ at: '2026-11-26T05:50:00Z', via: 'auto', rows: 13, reply: reply({ rows: 13 }) })))
    expect(screen.queryByText('✔ 넣었어요')).toBeNull()
    expect(norm(screen.getByTestId('sheet-band-status'))).toBe('저절로 넣기 켜짐 웹앱이 열려 있는 동안 5분마다 · 마지막 14:50 (13줄)')
  })

  it('AC-8515.4: 저절로 넣은 확인 필요 결과는 줄을 띄운다', () => {
    renderView()
    asFiller()
    act(() => fillStatus.finish(done({ at: '2026-11-26T05:40:00Z', via: 'auto', outcome: 'warn', reply: reply({ skipped: 1, added: 1, filled: 0 }) })))
    expect(screen.getByText('⚠ 넣었어요 · 확인 필요')).toBeTruthy()
    expect(screen.getByText('저절로 넣기 켜짐 · 확인 필요')).toBeTruthy()
  })

  it('AC-8515.4: 다음 넣기에 결과 줄이 바뀐다', () => {
    renderView()
    asFiller()
    act(() => fillStatus.finish(done({ reply: reply() })))
    act(() => fillStatus.finish(done({ at: '2026-11-26T05:45:00Z', mode: 'overwrite', reply: reply({ overwritten: 4 }) })))
    expect(screen.getByText('— 11월 26일 시트 · 덮어쓰기 · 14:45')).toBeTruthy()
    expect(screen.queryByText('— 11월 26일 시트 · 빈 칸만 채우기 · 14:41')).toBeNull()
  })
})

describe('AC-8515.5: 구글이나 비트에 닿지 못한 넣기(err-google)', () => {
  it('AC-8515.5: 넣기 멈춤 띠 + 주황 알림 + [다시 해 보기]는 오늘 빈 칸만 채우기로 다시', () => {
    const { props } = renderView({ runs: [run()] })
    asFiller()
    act(() => fillStatus.finish(done({ at: '2026-11-26T05:40:00Z', via: 'auto', outcome: 'fail', code: 'E-GSHEET-NET', rows: 0 })))
    expect(norm(screen.getByTestId('sheet-band-status'))).toBe('넣기 멈춤 구글 코드에 닿지 못했어요 · 14:40 · 5분 뒤 다시 해요')
    expect(norm(screen.getByRole('alert'))).toBe(
      '구글 연결 안 됨: 인터넷 연결을 확인해 주세요. 14:35까지 넣은 줄은 시트에 그대로 있어요. 인터넷이 되는데도 계속 이러면 [설정] › 구글 연결에서 [연결 시험]을 눌러 보세요.',
    )
    fireEvent.click(screen.getByRole('button', { name: '다시 해 보기' }))
    expect(props.onFill).toHaveBeenCalledWith({ day: TODAY, mode: 'fillEmpty', via: 'hand', auto: false })
  })

  it('AC-8515.5: 서버 기록의 마지막 넣기가 실패여도(다른 탭에서 연 뒤) 멈춤으로 보인다', () => {
    renderView({ runs: [run(), run({ at: '2026-11-26T05:40:00Z', outcome: 'fail', code: 'E-GSHEET-TIMEOUT', rows: 0 })] })
    asFiller()
    expect(screen.getByText('넣기 멈춤')).toBeTruthy()
    expect(screen.getByRole('alert').querySelector('.font-semibold')?.textContent).toBe('구글이 제때 답하지 않았어요. 잠시 뒤 다시 해 보세요.')
  })

  it('AC-8515.5: 다음 넣기가 되면 멈춤이 풀린다', () => {
    renderView()
    asFiller()
    act(() => fillStatus.finish(done({ at: '2026-11-26T05:40:00Z', via: 'auto', outcome: 'fail', code: 'E-GSHEET-NET', rows: 0 })))
    act(() => fillStatus.finish(done({ at: '2026-11-26T05:45:00Z', via: 'auto', reply: reply() })))
    expect(screen.queryByText('넣기 멈춤')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
