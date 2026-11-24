// @vitest-environment jsdom
// TASK-14 (spec erp-uisarang) design.md 8-9 main·9-3·9-4: ERP 화면(startPage)에서 자료원을 정해 단추 줄을 잇는 것과,
// 비트 자료원 화면이 이 기능 전과 같은 것(AC-4215.3)을 가짜 chrome(runtime.sendMessage·storage.local)·시험용 ERP 화면·진짜 panel로 본다.
// 숫자는 지은 값이다(환자 정보 없음). '오늘'은 가짜 시계 2026-11-10(한국 시간)이다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ETC_NAMES, mountErpPage, sampleDay, settingsFirst, type ErpPage, type ErpPageOptions } from './__tests__/erpPage'
import { startPage, WATCH_MS } from './main'
import { createDock, HOST_ID } from './panel'
import { toGroups } from './settings'
import { SETTINGS_KEY, type Settings } from './types'
import { toUisArgs } from './uisSettings'
import { UIS_KINDS, UIS_SETTINGS_KEY } from './uisTypes'
import type { UisDay, UisKind, UisReport, UisSettings } from './uisTypes'

const DAY = '2026-11-09'
const NOW = new Date('2026-11-10T10:00:00+09:00')
const OPEN_OPTIONS = { open: 'options' }
const ok = (data: unknown) => ({ type: 'result', data })
const fail = (code: string) => ({ type: 'error', code })

function deferred<T = unknown>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

// --- 의사랑 답(design.md 3-2)과 설정 ---

const N = { unpaidVisits: null, new: null, first90: null, return: null }
const BANDS = ['0', '10', '20', '30', '40', '50', '60', '70', '80', '90'] as const

function uisDay(states: Partial<Record<UisKind, Partial<UisReport>>> = {}): UisDay {
  return {
    date: DAY,
    patients: { new: 7, first90: null, return: 57, ptVisit: 31, noExamFee: 2, total: 97 },
    groups: [
      { key: 'carm', patients: 18, total: 482_000, ...N },
      { key: 'sono', patients: 21, total: 731_500, ...N },
      { key: 'ptVisit', patients: 31, total: null, ...N },
    ],
    ages: BANDS.map((band, i) => ({ band, new: i % 2, first90: null, return: i + 3 })),
    money: {
      total: 5_182_300,
      insurer: 3_441_200,
      receivableIn: null,
      unpaidNew: null,
      noncovered: 1_206_000,
      discount: null,
      disabledFund: null,
      received: 1_741_100,
      card: 1_388_600,
      cash: 352_500,
      transfer: null,
      refund: null,
    },
    inpatientVisits: null,
    reservations: { kinds: [], patients: 33 },
    injection: null,
    overlap: null,
    warnings: { moneyUnconfirmed: false, splitUnconfirmed: false, unpaidVisits: 0, unknownAge: 0, noHistory: false },
    source: 'uisarang',
    uis: {
      folder: 'desktop',
      reports: UIS_KINDS.map((kind) => ({ kind, state: 'ok', cached: false, from: DAY, to: DAY, value: null, columns: [], ...states[kind] })),
      open: [],
      deleted: 6,
      kept: 0,
      deleteFailed: 0,
      unknownFiles: 0,
      checks: {
        totalFee: null,
        received: null,
        headcount: null,
        rxTotal: null,
        visitRows: null,
        visitNew: null,
        rsvRows: null,
        rsvVisited: null,
        noDate: false,
      },
      fractional: [],
      negative: [],
      reservations: { total: 34, visited: 29 },
    },
  }
}

function uisSettings(): UisSettings {
  return {
    v: 1,
    counts: { carm: ['CA1'], sono: ['SO1'], ptVisit: ['AA222'] },
    sales: { carm: ['CA1'], sono: ['SO1'] },
    etcNames: { etc1: '', etc2: '', etc3: '', etc4: '' },
  }
}

// --- 가짜 chrome ---

type Reply = unknown | ((msg: { cmd?: string; args?: unknown }) => unknown)

function fakeChrome(o: { bit?: Settings | null; uis?: UisSettings | null; source?: Reply; day?: Reply }) {
  const data: Record<string, unknown> = {}
  if (o.bit) data[SETTINGS_KEY] = JSON.parse(JSON.stringify(o.bit))
  if (o.uis) data[UIS_SETTINGS_KEY] = JSON.parse(JSON.stringify(o.uis))
  const local = {
    get: vi.fn(async (key: string) => (key in data ? { [key]: JSON.parse(JSON.stringify(data[key])) } : {})),
    set: vi.fn(async () => {}),
  }
  const answer = (reply: Reply, msg: { cmd?: string }) => (typeof reply === 'function' ? (reply as (m: unknown) => unknown)(msg) : reply)
  const sendMessage = vi.fn(async (msg: { cmd?: string; args?: unknown; open?: string }) => {
    if (JSON.stringify(msg) === JSON.stringify(OPEN_OPTIONS)) return ok(null)
    if (msg.cmd === 'closing.source') return answer('source' in o ? o.source : ok({ source: 'bit' }), msg)
    return answer('day' in o ? o.day : ok(sampleDay()), msg)
  })
  vi.stubGlobal('chrome', {
    runtime: { id: 'erp-test', sendMessage, getURL: (p: string) => `chrome-extension://erp-test/${p}` },
    storage: { local },
  })
  return { local, sendMessage, data }
}

let handle: { stop(): void } | null = null

function start(
  o: { page?: ErpPageOptions; bit?: Settings | null; uis?: UisSettings | null; source?: Reply; day?: Reply } = {},
) {
  history.replaceState(null, '', '/h/closing')
  const page = mountErpPage(document, { etcNames: ETC_NAMES, ...o.page })
  const c = fakeChrome(o)
  handle = startPage(document)
  const calls = () => c.sendMessage.mock.calls.map(([m]) => m)
  return {
    page: page as ErpPage,
    ...c,
    calls,
    sourceCalls: () => calls().filter((m) => m.cmd === 'closing.source'),
    dayCalls: () => calls().filter((m) => m.cmd === 'closing.day'),
  }
}

const shadow = () => {
  const root = document.getElementById(HOST_ID)?.shadowRoot
  if (!root) throw new Error('단추가 없다')
  return root
}
const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
/** 단추 줄([지난 결과]는 숨어 있어도 DOM에 있다) */
const row = () => [...shadow().querySelectorAll<HTMLButtonElement>('.dock > .row > button')]
const rowLabels = () => row().map(text)
const rowButton = (label: string) => {
  const found = row().find((b) => text(b) === label)
  if (!found) throw new Error(`단추 줄에 [${label}]가 없다: ${rowLabels().join(', ')}`)
  return found
}
const panel = () => shadow().querySelector<HTMLElement>('.panel') as HTMLElement
const head = () => text(shadow().querySelector('.pt'))
const lead = () => text(shadow().querySelector('.pb .lead'))
const lines = () => [...shadow().querySelectorAll('.pb > *')].map(text)
const actLabels = () => [...shadow().querySelectorAll('.pb .acts button')].map(text)
const act = (label: string) => {
  const found = [...shadow().querySelectorAll<HTMLButtonElement>('.pb .acts button')].find((b) => text(b) === label)
  if (!found) throw new Error(`[${label}] 단추가 없다: ${actLabels().join(', ')}`)
  return found
}
const flush = async () => {
  await vi.advanceTimersByTimeAsync(0)
  await vi.advanceTimersByTimeAsync(0)
}
const dateInput = () =>
  [...document.querySelectorAll<HTMLInputElement>('input.datepicker-input')].find((i) => i.getAttribute('aria-label') !== '연도 선택') as HTMLInputElement

const BIT_ROW = ['지난 결과', '기간 채우기', '비트 값 채우기']
const UIS_ROW = ['지난 결과', '기간 채우기', '엑셀로 받기', '의사랑 값 채우기']

// 받기 보기
const blobs: Blob[] = []
const revoked: string[] = []
const anchors: string[] = []
const realCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
const realRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')
document.addEventListener(
  'click',
  (e) => {
    if (e.target instanceof HTMLAnchorElement) {
      anchors.push(e.target.download)
      e.preventDefault()
    }
  },
  true,
)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  blobs.length = 0
  revoked.length = 0
  anchors.length = 0
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: vi.fn((blob: Blob) => {
      blobs.push(blob)
      return `blob:erp-test/${blobs.length}`
    }),
  })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: vi.fn((url: string) => void revoked.push(url)) })
})

afterEach(() => {
  handle?.stop()
  handle = null
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  vi.useRealTimers()
  history.replaceState(null, '', '/')
  for (const [name, d] of [
    ['createObjectURL', realCreate],
    ['revokeObjectURL', realRevoke],
  ] as const) {
    if (d) Object.defineProperty(URL, name, d)
    else delete (URL as unknown as Record<string, unknown>)[name]
  }
})

describe('AC-4211.1 단추 이름 정하기(startPage)', () => {
  it('AC-4211.1 AC-4215.3: 비트 설정만 저장돼 있으면 도우미를 부르지 않고 단추 줄은 지금 그대로다(DOM이 setSource 전 Dock과 같다)', async () => {
    const t = start({ bit: settingsFirst() })
    await flush()
    await vi.advanceTimersByTimeAsync(WATCH_MS * 3)
    expect(t.sendMessage).not.toHaveBeenCalled()
    expect(rowLabels()).toEqual(BIT_ROW)
    const fresh = createDock(document, { onFill() {}, onOpenSettings() {}, onUndo() {} })
    expect(shadow().innerHTML).toBe(fresh.host.shadowRoot?.innerHTML)
  })

  it('AC-4211.1: 의사랑 설정만 저장돼 있으면 도우미를 부르지 않고 [기간 채우기] [엑셀로 받기] [의사랑 값 채우기]다', async () => {
    const t = start({ uis: uisSettings() })
    await flush()
    expect(t.sendMessage).not.toHaveBeenCalled()
    expect(rowLabels()).toEqual(UIS_ROW)
  })

  it("AC-4211.1: 둘 다 저장돼 있으면 closing.source를 한 번 묻고 { source: 'uisarang' }이면 의사랑 단추 줄이다", async () => {
    const t = start({ bit: settingsFirst(), uis: uisSettings(), source: ok({ source: 'uisarang' }) })
    await flush()
    expect(t.calls()).toEqual([{ cmd: 'closing.source', args: {} }])
    expect(rowLabels()).toEqual(UIS_ROW)
    // 화면 안 이동으로 떠났다 돌아와도 다시 묻지 않는다
    history.replaceState(null, '', '/h/other')
    await vi.advanceTimersByTimeAsync(WATCH_MS)
    history.replaceState(null, '', '/h/closing')
    await vi.advanceTimersByTimeAsync(WATCH_MS)
    expect(t.sourceCalls()).toHaveLength(1)
    expect(rowLabels()).toEqual(UIS_ROW)
  })

  it.each([
    ['비트 답', () => ok({ source: 'bit' })],
    ['옛 도우미', () => fail('E-HELPER-UNKNOWN-COMMAND')],
    ['도우미 없음', () => fail('E-HELPER-MISSING')],
    ['서비스 워커와 끊김', () => Promise.reject(new Error('Extension context invalidated.'))],
  ])('AC-4211.1 AC-4215.3: 둘 다 저장돼 있고 closing.source가 %s이면 비트 단추 줄이고, 채우기는 지금 closing.day args 그대로다', async (_, source) => {
    const stored = settingsFirst()
    const t = start({ bit: stored, uis: uisSettings(), source })
    await flush()
    expect(rowLabels()).toEqual(BIT_ROW)
    rowButton('비트 값 채우기').click()
    await flush()
    expect(t.dayCalls()).toEqual([{ cmd: 'closing.day', args: { date: DAY, groups: toGroups(stored) } }])
    expect(lead()).toBe('2026-11-09 비트 값으로 93칸을 채웠어요. 저장은 하지 않았어요.')
  })

  it('AC-4211.1: 둘 다 저장돼 있고 closing.source가 5초 넘게 답하지 않으면 비트 단추 줄이다', async () => {
    const t = start({ bit: settingsFirst(), uis: uisSettings(), source: () => new Promise(() => {}) })
    await vi.advanceTimersByTimeAsync(4_999)
    expect(rowLabels()).toEqual(BIT_ROW)
    await vi.advanceTimersByTimeAsync(1)
    await flush()
    expect(rowLabels()).toEqual(BIT_ROW)
    expect(t.sourceCalls()).toHaveLength(1)
  })

  it('AC-4211.1 (명세와 다름) AC-4215.3: 둘 다 없으면 도우미를 부르지 않고 비트 단추 줄이며, 누르면 지금처럼 설정 화면만 연다', async () => {
    const t = start({})
    await flush()
    expect(t.sendMessage).not.toHaveBeenCalled()
    expect(rowLabels()).toEqual(BIT_ROW)
    rowButton('비트 값 채우기').click()
    await flush()
    expect(t.calls()).toEqual([OPEN_OPTIONS])
    expect(lead()).toBe('처음 한 번 설정 화면에서 코드를 확인하고 [저장]을 눌러 주세요.')
  })

  it('AC-4211.1: 둘 다 없던 화면에서 그사이 설정 화면이 의사랑 설정을 저장했으면, 다음 누름에 의사랑으로 정하고 의사랑 흐름으로 간다', async () => {
    const t = start({ day: ok(uisDay()) })
    await flush()
    rowButton('비트 값 채우기').click()
    await flush()
    t.data[UIS_SETTINGS_KEY] = uisSettings()
    rowButton('비트 값 채우기').click()
    await flush()
    expect(rowLabels()).toEqual(UIS_ROW)
    expect(t.dayCalls()).toEqual([{ cmd: 'closing.day', args: toUisArgs(DAY, uisSettings()) }])
    expect(lead()).toMatch(/^2026-11-09 의사랑 값으로 \d+칸을 채웠어요\. 저장은 하지 않았어요\.$/)
    // [기간 채우기]도 같다(비트 설정 없음 → 의사랑이면 ⑬)
    rowButton('기간 채우기').click()
    await flush()
    expect(head()).toBe('기간 채우기')
    expect(lead()).toBe('의사랑 자료로는 하루씩만 채울 수 있어요.')
  })

  it('AC-4211.1: 정해지기 전에 누르면 정해진 뒤 그 흐름으로 간다(의사랑으로 정해짐)', async () => {
    const source = deferred()
    const t = start({ bit: settingsFirst(), uis: uisSettings(), source: () => source.promise, day: ok(uisDay()) })
    await flush()
    expect(rowLabels()).toEqual(BIT_ROW)
    row().at(-1)?.click()
    await flush()
    expect(t.dayCalls()).toEqual([])
    source.resolve(ok({ source: 'uisarang' }))
    await flush()
    expect(rowLabels()).toEqual(UIS_ROW)
    expect(t.dayCalls()).toEqual([{ cmd: 'closing.day', args: toUisArgs(DAY, uisSettings()) }])
  })

  it('AC-4211.1 AC-4215.3: 정해지기 전에 누르면 정해진 뒤 그 흐름으로 간다(비트로 정해짐 → 지금 args)', async () => {
    const source = deferred()
    const stored = settingsFirst()
    const t = start({ bit: stored, uis: uisSettings(), source: () => source.promise })
    await flush()
    rowButton('기간 채우기').click()
    rowButton('비트 값 채우기').click()
    await flush()
    expect(t.dayCalls()).toEqual([])
    source.resolve(fail('E-HELPER-UNKNOWN-COMMAND'))
    await flush()
    expect(rowLabels()).toEqual(BIT_ROW)
    expect(t.dayCalls()).toEqual([{ cmd: 'closing.day', args: { date: DAY, groups: toGroups(stored) } }])
  })
})

describe('AC-4215.3 비트 설정만 저장된 화면은 이 기능 전과 같다', () => {
  it('AC-4215.3: [비트 값 채우기]는 closing.day { date, groups }만 보내고(sales 없음) 안내 머리·글이 비트 그대로다', async () => {
    const stored = settingsFirst()
    const t = start({ bit: stored })
    rowButton('비트 값 채우기').click()
    await flush()
    expect(t.calls()).toEqual([{ cmd: 'closing.day', args: { date: DAY, groups: toGroups(stored) } }])
    expect(head()).toBe('비트 값 채우기')
    expect(lead()).toBe('2026-11-09 비트 값으로 93칸을 채웠어요. 저장은 하지 않았어요.')
    expect(actLabels()).toEqual(['되돌리기', '설정 열기'])
  })

  it('AC-4215.3: [기간 채우기]는 지금 기간 고르기를 열고 도우미를 부르지 않는다', async () => {
    const t = start({ bit: settingsFirst() })
    rowButton('기간 채우기').click()
    await flush()
    expect(head()).toBe('기간 채우기')
    expect(shadow().querySelectorAll('.dates input')).toHaveLength(2)
    expect(t.sendMessage).not.toHaveBeenCalled()
  })

  it('AC-4215.3: 도우미 오류 글은 비트 글(explain) 그대로다', async () => {
    start({ bit: settingsFirst(), day: fail('E-SOMETHING-NEW') })
    rowButton('비트 값 채우기').click()
    await flush()
    expect(head()).toBe('비트 값 채우기')
    expect(lines().join('\n')).not.toContain('의사랑')
  })
})

describe('AC-4211.2 AC-4212.3 AC-4213.3 의사랑 단추 줄 흐름(진짜 안내)', () => {
  it("AC-4211.2: [의사랑 값 채우기] → '의사랑 엑셀 읽는 중…'(세 단추 막힘) → 채움 → 결과 안내 · [되돌리기]", async () => {
    const answer = deferred()
    const t = start({ uis: uisSettings(), day: () => answer.promise })
    const before = { ...t.page.state }
    await flush()
    rowButton('의사랑 값 채우기').click()
    await flush()
    expect(t.dayCalls()).toEqual([{ cmd: 'closing.day', args: toUisArgs(DAY, uisSettings()) }])
    expect(rowLabels()).toEqual(['지난 결과', '기간 채우기', '엑셀로 받기', '의사랑 엑셀 읽는 중…'])
    expect(row().slice(1).map((b) => b.disabled)).toEqual([true, true, true])
    answer.resolve(ok(uisDay()))
    await flush()
    expect(head()).toBe('의사랑 값 채우기')
    expect(lead()).toMatch(/^2026-11-09 의사랑 값으로 \d+칸을 채웠어요\. 저장은 하지 않았어요\.$/)
    expect(actLabels()).toEqual(['되돌리기', '엑셀로 받기', '설정 열기'])
    expect(t.page.state).toMatchObject({ TOTAL_FEE: '5182300', NEW_PATIENT: '7', TOTAL_PATIENT: '97', RSV_PATIENTS: '33' })
    expect(rowLabels()).toEqual(UIS_ROW)
    act('되돌리기').click()
    await flush()
    expect(t.page.state).toEqual(before)
    expect(lead()).toMatch(/^되돌렸어요\. \d+칸을 채우기 전 값으로 돌렸어요\. 저장은 하지 않았어요\.$/)
  })

  it('AC-4211.2: 의사랑 설정을 저장한 적 없는 의사랑 화면(둘 다 저장 + 도우미가 의사랑)은 설정 화면을 열고 ⑭이다', async () => {
    const t = start({ bit: settingsFirst(), uis: uisSettings(), source: ok({ source: 'uisarang' }) })
    await flush()
    delete t.data[UIS_SETTINGS_KEY]
    rowButton('의사랑 값 채우기').click()
    await flush()
    expect(t.calls()).toEqual([{ cmd: 'closing.source', args: {} }, OPEN_OPTIONS])
    expect(lead()).toBe('처음 한 번 설정 화면에서 코드를 고르고 [저장]을 눌러 주세요.')
    expect(actLabels()).toEqual(['설정 열기'])
  })

  it('AC-4211.2: 답에 source가 없으면(비트 도우미) E-CLOSING-WRONG-SOURCE 의사랑 오류 글이다', async () => {
    const t = start({ uis: uisSettings(), day: ok(sampleDay()) })
    const before = { ...t.page.state }
    await flush()
    rowButton('의사랑 값 채우기').click()
    await flush()
    expect(lead()).toBe('이 PC의 ERP 도우미가 다른 차트 프로그램으로 등록되어 있어요.')
    expect(lines().join('\n')).toContain('E-CLOSING-WRONG-SOURCE')
    expect(t.page.state).toEqual(before)
  })

  it('AC-4212.3 AC-4211.5: ⑦ [안내 닫기] [엑셀로 받기] [있는 엑셀로 채우기] — 안내 안 두 단추는 다시 읽지 않는다', async () => {
    const day = uisDay({ rsvPatients: { state: 'missing', from: null, to: null } })
    const t = start({ uis: uisSettings(), day: ok(day) })
    const before = { ...t.page.state }
    await flush()
    rowButton('의사랑 값 채우기').click()
    await flush()
    expect(lead()).toBe('의사랑 통계에서 예약환자통계 아래쪽 표를 엑셀로 저장해 주세요.')
    expect(actLabels()).toEqual(['안내 닫기', '엑셀로 받기', '있는 엑셀로 채우기'])
    expect(t.page.state).toEqual(before)
    act('엑셀로 받기').click()
    await flush()
    expect(head()).toBe('엑셀로 받기')
    expect(anchors).toEqual(['ERP마감-의사랑-2026-11-09.xlsx'])
    expect(t.page.state).toEqual(before)
    act('의사랑 값 채우기').click()
    await flush()
    // 들고 있는 답이 ⑦이라 채우기 차례대로 다시 ⑦
    expect(actLabels()).toEqual(['안내 닫기', '엑셀로 받기', '있는 엑셀로 채우기'])
    act('있는 엑셀로 채우기').click()
    await flush()
    expect(lead()).toMatch(/^2026-11-09 의사랑 값으로 \d+칸을 채웠어요\./)
    expect(t.page.state.TOTAL_FEE).toBe('5182300')
    expect(t.page.state.RSV_PATIENTS).toBe('')
    expect(t.dayCalls()).toHaveLength(1)
    expect(t.local.set).not.toHaveBeenCalled()
  })

  it('AC-4211.5: 마감 일자를 바꾸면 들고 있는 답을 버려 ⑦ [있는 엑셀로 채우기]가 칸을 바꾸지 않는다', async () => {
    const day = uisDay({ rsvPatients: { state: 'missing', from: null, to: null } })
    const t = start({ uis: uisSettings(), day: ok(day) })
    const before = { ...t.page.state }
    await flush()
    rowButton('의사랑 값 채우기').click()
    await flush()
    dateInput().value = '2026-11-08'
    act('있는 엑셀로 채우기').click()
    await flush()
    expect(lines()).toEqual(['읽는 동안 마감 일자가 바뀌어 채우지 않았어요. 다시 눌러 주세요.'])
    expect(t.page.state).toEqual(before)
    expect(t.dayCalls()).toHaveLength(1)
  })

  it('AC-4213.3 AC-4213.4: 단추 줄 [엑셀로 받기]는 늘 다시 읽고 받은 뒤 받았어요 안내, 그 안 [의사랑 값 채우기]는 다시 읽지 않고 채운다', async () => {
    const t = start({ uis: uisSettings(), day: ok(uisDay()) })
    const before = { ...t.page.state }
    await flush()
    rowButton('엑셀로 받기').click()
    await flush()
    expect(t.dayCalls()).toHaveLength(1)
    rowButton('엑셀로 받기').click()
    await flush()
    expect(t.dayCalls()).toHaveLength(2)
    expect(head()).toBe('엑셀로 받기')
    expect(lead()).toBe('2026-11-09 의사랑 값을 엑셀 파일로 받았어요. ERP 칸은 바꾸지 않았어요.')
    expect(actLabels()).toEqual(['닫기', '의사랑 값 채우기'])
    expect(anchors).toEqual(['ERP마감-의사랑-2026-11-09.xlsx', 'ERP마감-의사랑-2026-11-09.xlsx'])
    expect(t.page.state).toEqual(before)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(revoked).toEqual(['blob:erp-test/1', 'blob:erp-test/2'])
    expect(t.local.set).not.toHaveBeenCalled()
    act('의사랑 값 채우기').click()
    await flush()
    expect(t.dayCalls()).toHaveLength(2)
    expect(t.page.state.TOTAL_FEE).toBe('5182300')
  })

  it('AC-4213.3: 단추 줄 [엑셀로 받기]는 읽는 동안 그 단추 글이 바뀌고 세 단추가 막힌다', async () => {
    const answer = deferred()
    start({ uis: uisSettings(), day: () => answer.promise })
    await flush()
    rowButton('엑셀로 받기').click()
    await flush()
    expect(rowLabels()).toEqual(['지난 결과', '기간 채우기', '의사랑 엑셀 읽는 중…', '의사랑 값 채우기'])
    expect(row().slice(1).map((b) => b.disabled)).toEqual([true, true, true])
    answer.resolve(ok(uisDay({ income: { state: 'twice' } })))
    await flush()
    expect(head()).toBe('엑셀로 받기')
    expect(lead()).toBe('일일수입통계 엑셀이 여러 개 있어요.')
    expect(actLabels()).toEqual([])
    expect(blobs).toHaveLength(0)
    expect(rowLabels()).toEqual(UIS_ROW)
  })

  it('AC-4212.5: 의사랑 [기간 채우기]는 ⑬(머리 기간 채우기 · [닫기])만이고 기간 고르기·도우미 부름이 없다', async () => {
    const t = start({ uis: uisSettings() })
    await flush()
    rowButton('기간 채우기').click()
    await flush()
    expect(head()).toBe('기간 채우기')
    expect(lead()).toBe('의사랑 자료로는 하루씩만 채울 수 있어요.')
    expect(actLabels()).toEqual(['닫기'])
    expect(shadow().querySelectorAll('.dates input')).toHaveLength(0)
    expect(t.sendMessage).not.toHaveBeenCalled()
    act('닫기').click()
    expect(panel().hidden).toBe(true)
  })

  it('AC-4211.5: 화면을 떠나면 들고 있는 답·[지난 결과]를 버린다', async () => {
    const t = start({ uis: uisSettings(), day: ok(uisDay()) })
    await flush()
    rowButton('의사랑 값 채우기').click()
    await flush()
    shadow().querySelector<HTMLButtonElement>('.x')?.click()
    expect(row()[0].hidden).toBe(false)
    history.replaceState(null, '', '/h/other')
    await vi.advanceTimersByTimeAsync(WATCH_MS)
    history.replaceState(null, '', '/h/closing')
    await vi.advanceTimersByTimeAsync(WATCH_MS)
    expect(rowLabels()).toEqual(UIS_ROW)
    expect(row()[0].hidden).toBe(true)
    expect(t.dayCalls()).toHaveLength(1)
  })
})
