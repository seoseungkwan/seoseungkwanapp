// @vitest-environment jsdom
// TASK-7 REQ-3609: ERP 마감일지 화면의 단추 → 날짜 읽기 → 서비스 워커에 closing.day → 칸 채우기 → 안내(main.ts)를
// 가짜 chrome(runtime.sendMessage·storage.local)과 시험용 ERP 화면(__tests__/erpPage.ts)으로 시험한다. 숫자는 가짜(환자 정보 없음)
// TASK-17 REQ-3612~3614: 오늘 뒤 날짜·진료 0건 멈춤·이미 적힌 칸 묻기·되돌리기·읽기 전용·맞춰 볼 숫자·까닭별 칸·지난 결과·Esc·오류 표 글.
// '오늘'은 가짜 시계 2026-11-10(한국 시간)이다
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ETC_NAMES, mountErpPage, sampleDay, settingsFirst, type ErpPage, type ErpPageOptions } from './__tests__/erpPage'
import { putValue } from './fill'
import { READ_TIMEOUT_MS, readDate, startPage, WATCH_MS } from './main'
import { HOST_ID } from './panel'
import { toGroups } from './settings'
import { SETTINGS_KEY, type Settings } from './types'

const SRC = path.dirname(fileURLToPath(import.meta.url))
const EXT = path.resolve(SRC, '..')
const OPEN_OPTIONS = { open: 'options' }

type Reply = unknown | ((msg: unknown) => unknown)

function deferred<T = unknown>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok
    reject = fail
  })
  return { promise, resolve, reject }
}

const ok = (data: unknown) => ({ type: 'result', data })
const fail = (code: string) => ({ type: 'error', code })

function fakeChrome(opts: { stored?: Settings | null; reply?: Reply }) {
  const data: Record<string, unknown> = {}
  if (opts.stored) data[SETTINGS_KEY] = JSON.parse(JSON.stringify(opts.stored))
  const local = {
    get: vi.fn(async (key: string) => (key in data ? { [key]: JSON.parse(JSON.stringify(data[key])) } : {})),
    set: vi.fn(async () => {}),
  }
  const reply = 'reply' in opts ? opts.reply : ok(sampleDay())
  const sendMessage = vi.fn(async (msg: unknown) => {
    if (JSON.stringify(msg) === JSON.stringify(OPEN_OPTIONS)) return ok(null)
    return typeof reply === 'function' ? (reply as (m: unknown) => unknown)(msg) : reply
  })
  vi.stubGlobal('chrome', {
    runtime: { id: 'erp-test', sendMessage, getURL: (p: string) => `chrome-extension://erp-test/${p}` },
    storage: { local },
  })
  return { local, sendMessage }
}

let handle: { stop(): void } | null = null

function start(o: { path?: string; page?: ErpPageOptions | null; stored?: Settings | null; reply?: Reply } = {}) {
  history.replaceState(null, '', o.path ?? '/h/closing')
  const page = o.page === null ? null : mountErpPage(document, { etcNames: ETC_NAMES, ...o.page })
  const c = fakeChrome({ stored: 'stored' in o ? o.stored : settingsFirst(), ...('reply' in o ? { reply: o.reply } : {}) })
  handle = startPage(document)
  return { page: page as ErpPage, ...c, dayCalls: () => c.sendMessage.mock.calls.filter(([m]) => (m as { cmd?: string }).cmd === 'closing.day') }
}

const host = () => document.getElementById(HOST_ID)
const shadow = () => {
  const root = host()?.shadowRoot
  if (!root) throw new Error('단추가 없다')
  return root
}
const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
const button = () => shadow().querySelector<HTMLButtonElement>('.fill-btn') as HTMLButtonElement
const panel = () => shadow().querySelector<HTMLElement>('.panel') as HTMLElement
const lead = () => text(shadow().querySelector('.lead'))
const lines = () => [...shadow().querySelectorAll('.pb > *')].map(text)
const flush = async () => {
  await vi.advanceTimersByTimeAsync(0)
  await vi.advanceTimersByTimeAsync(0)
}
/** 안내 단추(글자로 찾음) */
const act = (label: string) => {
  const found = [...shadow().querySelectorAll<HTMLButtonElement>('.acts button')].find((b) => text(b) === label)
  if (!found) throw new Error(`[${label}] 단추가 없다: ${[...shadow().querySelectorAll('.acts button')].map(text).join(', ')}`)
  return found
}
const actLabels = () => [...shadow().querySelectorAll('.acts button')].map(text)
/** 단추 옆 [지난 결과] */
const lastButton = () => shadow().querySelector<HTMLButtonElement>('.last') as HTMLButtonElement
const dateInput = () =>
  [...document.querySelectorAll<HTMLInputElement>('input.datepicker-input')].find((i) => i.getAttribute('aria-label') !== '연도 선택') as HTMLInputElement

/** 시험 속 오늘(이 PC 날짜, 기본값 (카)) */
const NOW = new Date('2026-11-10T10:00:00+09:00')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  handle?.stop()
  handle = null
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  vi.useRealTimers()
  history.replaceState(null, '', '/')
})

describe('AC-3609.1 단추는 /h/closing + 마감 일자일 때만', () => {
  it('AC-3609.1: /h/closing이고 마감 일자가 있으면 오른쪽 아래 [비트 값 채우기]가 하나 생긴다(ERP 뿌리 밖)', () => {
    const t = start()
    expect(host()).not.toBeNull()
    expect(host()?.parentElement).toBe(document.body)
    expect(t.page.root.contains(host())).toBe(false)
    expect(document.querySelectorAll(`#${HOST_ID}`)).toHaveLength(1)
    expect(text(button())).toBe('비트 값 채우기')
    expect(panel().hidden).toBe(true)
  })

  it.each(['/h/closing-calendar', '/h/closing-daily', '/h/dashboard', '/closing', '/h/closing/x'])(
    'AC-3609.1: 주소가 %s 이면 단추가 없다',
    (p) => {
      start({ path: p })
      expect(host()).toBeNull()
    },
  )

  it('AC-3609.1: /h/closing이어도 마감 일자가 아직 없으면 단추가 없고, 생기면 0.5초 안에 나온다', async () => {
    start({ page: null })
    expect(host()).toBeNull()
    mountErpPage(document, { etcNames: ETC_NAMES })
    await vi.advanceTimersByTimeAsync(WATCH_MS)
    expect(host()).not.toBeNull()
  })

  it('AC-3609.1: 화면 안 이동(주소만 바뀜)으로 떠나면 사라지고 돌아오면 다시 하나 생긴다', async () => {
    const t = start()
    expect(WATCH_MS).toBe(500)
    history.pushState(null, '', '/h/closing-calendar')
    t.page.root.remove()
    await vi.advanceTimersByTimeAsync(WATCH_MS)
    expect(host()).toBeNull()
    history.pushState(null, '', '/h/closing')
    mountErpPage(document, { etcNames: ETC_NAMES })
    await vi.advanceTimersByTimeAsync(WATCH_MS)
    expect(host()).not.toBeNull()
    expect(document.querySelectorAll(`#${HOST_ID}`)).toHaveLength(1)
    expect(text(button())).toBe('비트 값 채우기')
  })

  it('AC-3609.1: 읽는 중에 떠나면 늦게 온 답으로 칸을 채우지 않고, 돌아오면 단추는 처음 모양이다', async () => {
    const answer = deferred()
    const t = start({ reply: () => answer.promise })
    button().click()
    await flush()
    expect(text(button())).toBe('비트에서 읽는 중…')
    const before = { ...t.page.state }
    history.pushState(null, '', '/h/closing-calendar')
    await vi.advanceTimersByTimeAsync(WATCH_MS)
    expect(host()).toBeNull()
    answer.resolve(ok(sampleDay()))
    await flush()
    expect(t.page.state).toEqual(before)
    expect(t.page.log).toEqual([])
    history.pushState(null, '', '/h/closing')
    await vi.advanceTimersByTimeAsync(WATCH_MS)
    expect(text(button())).toBe('비트 값 채우기')
    expect(button().disabled).toBe(false)
    expect(panel().hidden).toBe(true)
  })

  it('AC-3609.1: stop()하면 단추를 떼고 더는 보지 않는다', async () => {
    start()
    handle?.stop()
    expect(host()).toBeNull()
    await vi.advanceTimersByTimeAsync(WATCH_MS * 4)
    expect(host()).toBeNull()
  })
})

describe('AC-3609.2 날짜 읽기', () => {
  it("AC-3609.2: '마감 일자' 옆 날짜 칸(yyyy-MM-dd)을 읽는다. '연도 선택' 칸은 보지 않는다", () => {
    mountErpPage(document, { date: '2026-11-09' })
    expect(readDate(document)).toBe('2026-11-09')
    dateInput().value = ' 2026-11-08 '
    expect(readDate(document)).toBe('2026-11-08')
  })

  it("AC-3609.2: 원무 권한 화면의 'YYYY-MM-DD (오늘)' 글자를 읽는다", () => {
    mountErpPage(document, { date: '2026-11-10', todayOnly: true })
    expect(readDate(document)).toBe('2026-11-10')
  })

  it('AC-3609.2: 날짜 칸이 비었거나 날짜가 아니면 없음이다(연도 선택 칸에 2026이 있어도)', () => {
    mountErpPage(document, { date: null })
    expect(readDate(document)).toBeNull()
    document.body.innerHTML = ''
    mountErpPage(document, { date: '2026-11-09' })
    for (const bad of ['2026-13-01', '2026-02-30', '20261109', '2026-11-9', 'abc']) {
      dateInput().value = bad
      expect(readDate(document), bad).toBeNull()
    }
  })

  it("AC-3609.2: '마감 일자' 글자가 없으면 없음이다", () => {
    document.body.innerHTML = '<div><label>다른 날짜</label><input class="datepicker-input" value="2026-11-09"></div>'
    expect(readDate(document)).toBeNull()
  })
})

describe('AC-3609.2 누르면', () => {
  it("AC-3609.2: 날짜가 없으면 '마감 일자를 먼저 골라 주세요.'이고 도우미를 부르지 않는다", async () => {
    const t = start({ page: { date: null } })
    button().click()
    await flush()
    expect(lines()).toEqual(['마감 일자를 먼저 골라 주세요.'])
    expect(panel().hidden).toBe(false)
    expect(t.sendMessage).not.toHaveBeenCalled()
    expect(text(button())).toBe('비트 값 채우기')
  })

  it('AC-3609.2: 설정을 저장한 적이 없으면 설정 화면을 열고 처음 안내를 보이며, 도우미를 부르지 않고 칸을 바꾸지 않는다', async () => {
    const t = start({ stored: null })
    const before = { ...t.page.state }
    button().click()
    await flush()
    expect(t.sendMessage.mock.calls.map(([m]) => m)).toEqual([OPEN_OPTIONS])
    expect(lead()).toBe('처음 한 번 설정 화면에서 코드를 확인하고 [저장]을 눌러 주세요.')
    expect(lines()).toContain('설정 화면을 새 탭으로 열었어요. 아무 칸도 바꾸지 않았어요.')
    expect(t.page.state).toEqual(before)
    expect(text(button())).toBe('비트 값 채우기')
    expect(button().disabled).toBe(false)
  })

  it("AC-3609.2: 아니면 '비트에서 읽는 중…'(단추 막힘)으로 closing.day { date, groups }를 한 번 부른다", async () => {
    const answer = deferred()
    const stored = settingsFirst()
    const t = start({ stored, reply: () => answer.promise })
    button().click()
    await flush()
    expect(t.dayCalls()).toHaveLength(1)
    expect(t.dayCalls()[0][0]).toEqual({ cmd: 'closing.day', args: { date: '2026-11-09', groups: toGroups(stored) } })
    // 매출 규칙이 없는 예전 저장값도 처음 값 규칙(LA)으로 씨암·SONO에 붙어 간다(AC-3607.6)
    const sent = (t.dayCalls()[0][0] as { args: { groups: { key: string; amountPrefixes?: string[]; amountCodes?: string[] }[] } }).args.groups
    expect(sent.slice(0, 2)).toEqual([
      { key: 'carm', codes: ['CARM1'], amountPrefixes: ['LA'], amountCodes: [] },
      { key: 'sono', codes: ['SONO1'], amountPrefixes: ['LA'], amountCodes: [] },
    ])
    expect(text(button())).toBe('비트에서 읽는 중…')
    expect(button().disabled).toBe(true)
    expect(panel().hidden).toBe(true)
    button().click()
    button().dispatchEvent(new MouseEvent('click'))
    await flush()
    expect(t.dayCalls()).toHaveLength(1)
    answer.resolve(fail('E-BIT-READ-FAILED'))
    await flush()
    expect(text(button())).toBe('비트 값 채우기')
    expect(button().disabled).toBe(false)
  })

  it("AC-3609.2: 원무 권한 화면이면 'YYYY-MM-DD (오늘)'의 날짜로 부른다", async () => {
    const t = start({ page: { date: '2026-11-10', todayOnly: true }, reply: () => new Promise(() => {}) })
    button().click()
    await flush()
    expect((t.dayCalls()[0][0] as { args: { date: string } }).args.date).toBe('2026-11-10')
  })
})

describe('AC-3609.3 답 온 뒤 날짜가 바뀌었으면', () => {
  it("AC-3609.3: 채우지 않고 '읽는 동안 마감 일자가 바뀌어 채우지 않았어요. 다시 눌러 주세요.'다", async () => {
    const answer = deferred()
    const t = start({ reply: () => answer.promise })
    const before = { ...t.page.state }
    button().click()
    await flush()
    dateInput().value = '2026-11-08'
    answer.resolve(ok(sampleDay()))
    await flush()
    expect(lines()).toEqual(['읽는 동안 마감 일자가 바뀌어 채우지 않았어요. 다시 눌러 주세요.'])
    expect(t.page.state).toEqual(before)
    expect(t.page.log).toEqual([])
    expect(text(button())).toBe('비트 값 채우기')
  })
})

describe('AC-3609.4 채운 뒤 안내', () => {
  it('AC-3609.4: 칸을 채우고 실제로 채운 칸 수·건너뛴 칸 수·끝 줄·[설정 열기]를 보인다(저장 단추는 누르지 않는다)', async () => {
    const day = sampleDay()
    day.money.refund = 0
    const t = start({ reply: ok(day) })
    button().click()
    await flush()
    // 처음 값 + 예약 도수·충격파: 131칸 가운데 고르지 않은 38칸을 빼고 93칸(씨암·SONO 치료별 매출 보류는 TASK-15에서 끝남)
    expect(lead()).toBe('2026-11-09 비트 값으로 93칸을 채웠어요. 저장은 하지 않았어요.')
    const skipped = shadow().querySelector('.blk')
    expect(text(skipped?.querySelector('p'))).toBe('고르지 않아 건너뛴 칸 38칸')
    expect(text(skipped?.querySelector('.small'))).toBe('설정에서 코드를 고르지 않은 항목이라 그대로 두었어요.')
    // 보류 줄은 없다
    expect(shadow().querySelector('.held')).toBeNull()
    expect(lines().join('\n')).not.toContain('치료별 매출은 채우지 않았어요')
    expect(lines()).toContain('확인한 뒤 업무일지 1 [전체 저장]과 업무일지 2 [일일 상세 저장]을 눌러 주세요.')
    expect(shadow().querySelector('.warns')).toBeNull()
    expect(t.page.state).toMatchObject({ NEW_PATIENT: '7', TOTAL_PATIENT: '84', TOTAL_FEE: '11668530', CARM_CNT: '400' })
    // 씨암·SONO 치료별 매출 칸도 묶음 total로 채운다(overlap 없음 → 묻지 않음)
    expect(t.page.state.CARM_AMT).toBe('1001234')
    expect(t.page.state.SONO_AMT).toBe('2001234')
    expect(shadow().querySelector('.ovl')).toBeNull()
    expect(t.page.state.INJ_CARM_NEW).toBe('100')
    expect(t.page.clicks).toEqual([])
    expect(text(button())).toBe('비트 값 채우기')
    expect(button().disabled).toBe(false)
  })

  it('AC-3609.4 AC-3613.2: 치료사별 입력 줄은 까닭별 묶음으로, 경고는 design.md 5절 글로 보인다', async () => {
    const day = sampleDay()
    day.warnings.moneyUnconfirmed = true
    day.warnings.unpaidVisits = 2
    start({ page: { therapistRows: true }, reply: ok(day) })
    button().click()
    await flush()
    expect(lead()).toBe('2026-11-09 비트 값으로 91칸을 채웠어요. 저장은 하지 않았어요.')
    const miss = shadow().querySelector('.blk')
    expect(text(miss?.querySelector('.h'))).toBe('치료사별 입력 줄 2칸')
    expect(text(miss?.querySelector('.rows'))).toBe('치료현황 도수치료 · 치료현황 충격파(체충)')
    expect(text(miss?.querySelector('.small'))).toBe('치료사별로 넣는 줄이라 그대로 두었어요. 치료사별 칸에 직접 넣어 주세요.')
    expect([...shadow().querySelectorAll('.warns li')].map(text)).toEqual([
      '환불·변경수납 등이 있는 날이에요. 외래 수입 8칸(총매출·청구액·비급여·미수입금·진료수납액·카드·현금·계좌)은 비트 수납 줄을 그대로 더한 값이라 다를 수 있어요. 확인해 주세요.',
      '수납이 끝나지 않은 진료 2건이 있어요.',
      '환불 33,000원이 있어요. 금액을 확인해 주세요.',
    ])
  })

  it('AC-3609.4: [설정 열기]는 서비스 워커에 설정 화면을 열어 달라고만 한다', async () => {
    const t = start()
    button().click()
    await flush()
    act('설정 열기').click()
    await flush()
    expect(t.sendMessage.mock.calls.at(-1)?.[0]).toEqual(OPEN_OPTIONS)
  })

  it('AC-3609.4: 다시 누르면 앞 안내를 닫고 다시 읽는다', async () => {
    const t = start()
    button().click()
    await flush()
    expect(panel().hidden).toBe(false)
    button().click()
    await flush()
    expect(t.dayCalls()).toHaveLength(2)
    expect(panel().hidden).toBe(false)
  })
})

describe('AC-3609.7 함께 있는 진료 묻기 → 누름 → 날짜 확인 → saveOverlap → 채움', () => {
  // sampleDay 씨암 total 1,001,234 · SONO total 2,001,234. 함께 있는 진료 9건: 씨암 쪽 400,000 · SONO 쪽 300,000
  const OVERLAP = { visits: 9, carm: 400_000, sono: 300_000 }
  const dayWith = (overlap: unknown) => ({ ...sampleDay(), overlap })
  const ASK = '씨암·SONO 코드가 함께 있는 진료가 9건 있어요(씨암 쪽 400,000원 · SONO 쪽 300,000원). 어디에 넣을까요?'
  const choice = (c: string) => shadow().querySelector<HTMLButtonElement>(`.acts button[data-choice="${c}"]`) as HTMLButtonElement
  const labels = () => [...shadow().querySelectorAll('.acts button')].map(text)
  /** saveOverlap이 쓴 erpClosing 값들 */
  const writes = (local: { set: { mock: { calls: unknown[][] } } }) =>
    local.set.mock.calls.map(([items]) => (items as Record<string, Settings>)[SETTINGS_KEY])

  it('AC-3609.7: overlap.visits > 0이면 칸을 채우기 전에 묻는 줄과 세 단추가 나오고, 아직 아무 칸도 바꾸지 않는다', async () => {
    const t = start({ reply: ok(dayWith(OVERLAP)) })
    const before = { ...t.page.state }
    button().click()
    await flush()
    expect(lead()).toBe(ASK)
    expect(labels()).toEqual(['씨암에 넣기', 'SONO에 넣기', '둘 다 넣기', '안내 닫기'])
    expect(t.page.state).toEqual(before)
    expect(t.page.log).toEqual([])
    expect(t.local.set).not.toHaveBeenCalled()
    expect(text(button())).toBe('비트 값 채우기')
  })

  it("AC-3609.7: [SONO에 넣기]를 누르면 overlap 'sono'를 기억하고 씨암에서 씨암 쪽 금액을 빼 채우며, 채운 뒤 함께 있는 진료 줄이 있다", async () => {
    const t = start({ reply: ok(dayWith(OVERLAP)) })
    button().click()
    await flush()
    choice('sono').click()
    await flush()
    expect(writes(t.local)).toHaveLength(1)
    expect(writes(t.local)[0]).toMatchObject({ v: 1, overlap: 'sono', picks: settingsFirst().picks })
    expect(t.page.state.CARM_AMT).toBe(String(1_001_234 - 400_000))
    expect(t.page.state.SONO_AMT).toBe('2001234')
    expect(lead()).toBe('2026-11-09 비트 값으로 93칸을 채웠어요. 저장은 하지 않았어요.')
    expect(text(shadow().querySelector('.ovl'))).toBe('함께 있는 진료 9건은 SONO에 넣었어요.')
  })

  it("AC-3609.7: [씨암에 넣기]면 SONO에서 SONO 쪽 금액을 빼고, [둘 다 넣기]면 두 칸 모두 묶음 total이다", async () => {
    let t = start({ reply: ok(dayWith(OVERLAP)) })
    button().click()
    await flush()
    choice('carm').click()
    await flush()
    expect([t.page.state.CARM_AMT, t.page.state.SONO_AMT]).toEqual(['1001234', String(2_001_234 - 300_000)])
    expect(text(shadow().querySelector('.ovl'))).toBe('함께 있는 진료 9건은 씨암에 넣었어요.')
    expect(writes(t.local)[0].overlap).toBe('carm')
    handle?.stop()
    document.body.innerHTML = ''

    t = start({ reply: ok(dayWith(OVERLAP)) })
    button().click()
    await flush()
    choice('both').click()
    await flush()
    expect([t.page.state.CARM_AMT, t.page.state.SONO_AMT]).toEqual(['1001234', '2001234'])
    expect(text(shadow().querySelector('.ovl'))).toBe('함께 있는 진료 9건은 씨암·SONO 둘 다에 넣었어요.')
    expect(writes(t.local)[0].overlap).toBe('both')
  })

  it("AC-3609.7: 지난번 고른 것(저장된 overlap)은 ' (지난번)'이 붙고 먼저 포커스를 받는다", async () => {
    start({ stored: { ...settingsFirst(), overlap: 'sono' } as Settings, reply: ok(dayWith(OVERLAP)) })
    button().click()
    await flush()
    expect(labels()).toEqual(['씨암에 넣기', 'SONO에 넣기 (지난번)', '둘 다 넣기', '안내 닫기'])
    expect(shadow().activeElement).toBe(choice('sono'))
  })

  it('AC-3609.7: 누르기 전에 마감 일자가 바뀌었으면 채우지 않고 기억도 바꾸지 않는다(AC-3609.3과 같은 글)', async () => {
    const t = start({ reply: ok(dayWith(OVERLAP)) })
    const before = { ...t.page.state }
    button().click()
    await flush()
    dateInput().value = '2026-11-08'
    choice('carm').click()
    await flush()
    expect(lines()).toEqual(['읽는 동안 마감 일자가 바뀌어 채우지 않았어요. 다시 눌러 주세요.'])
    expect(t.page.state).toEqual(before)
    expect(t.local.set).not.toHaveBeenCalled()
  })

  it('AC-3618.3 AC-3609.7: [안내 닫기] 단추면 안내가 닫히고 아무 칸도·기억(overlap)도 바꾸지 않으며, 다시 누르면 다시 묻는다', async () => {
    const t = start({ stored: { ...settingsFirst(), overlap: 'carm' } as Settings, reply: ok(dayWith(OVERLAP)) })
    const before = { ...t.page.state }
    button().click()
    await flush()
    act('안내 닫기').click()
    await flush()
    expect(panel().hidden).toBe(true)
    expect(t.page.state).toEqual(before)
    expect(t.page.log).toEqual([])
    expect(t.local.set).not.toHaveBeenCalled()
    expect(button().disabled).toBe(false)
    button().click()
    await flush()
    expect(t.dayCalls()).toHaveLength(2)
    expect(lead()).toBe(ASK)
  })

  it('AC-3609.7: [안내 닫기]면 아무 칸도 바꾸지 않고 기억도 바꾸지 않으며, 다시 누르면 다시 묻는다', async () => {
    const t = start({ reply: ok(dayWith(OVERLAP)) })
    const before = { ...t.page.state }
    button().click()
    await flush()
    shadow().querySelector<HTMLButtonElement>('.x')?.click()
    await flush()
    expect(panel().hidden).toBe(true)
    expect(t.page.state).toEqual(before)
    expect(t.page.log).toEqual([])
    expect(t.local.set).not.toHaveBeenCalled()
    expect(button().disabled).toBe(false)
    button().click()
    await flush()
    expect(t.dayCalls()).toHaveLength(2)
    expect(lead()).toBe(ASK)
  })

  it.each<[string, unknown]>([
    ['overlap null', null],
    ['overlap 0건', { visits: 0, carm: 0, sono: 0 }],
  ])('AC-3609.7: %s 이면 묻지 않고 바로 채운다', async (_name, overlap) => {
    const t = start({ reply: ok(dayWith(overlap)) })
    button().click()
    await flush()
    expect(lead()).toBe('2026-11-09 비트 값으로 93칸을 채웠어요. 저장은 하지 않았어요.')
    expect([t.page.state.CARM_AMT, t.page.state.SONO_AMT]).toEqual(['1001234', '2001234'])
    expect(shadow().querySelector('.ovl')).toBeNull()
    expect(t.local.set).not.toHaveBeenCalled()
  })

  it('AC-3609.7: 묻는 동안 화면을 떠나면 늦게 누른 단추로 채우지 않는다', async () => {
    const t = start({ reply: ok(dayWith(OVERLAP)) })
    const before = { ...t.page.state }
    button().click()
    await flush()
    const stale = choice('carm')
    history.pushState(null, '', '/h/closing-calendar')
    await vi.advanceTimersByTimeAsync(WATCH_MS)
    stale.click()
    await flush()
    expect(t.page.state).toEqual(before)
    expect(t.local.set).not.toHaveBeenCalled()
  })
})

describe('AC-3609.5 AC-3614.1 오류 때 칸 그대로, 글은 errors.ts(design.md 5-2 표)', () => {
  /** 오류 안내: 굵은 '무엇이' · '어떻게' · 작은 줄 '아무 칸도 바꾸지 않았어요. (번호 …)' */
  async function failsWith(reply: Reply) {
    const t = start({ reply })
    const before = { ...t.page.state }
    button().click()
    await flush()
    expect(t.page.state).toEqual(before)
    expect(t.page.log).toEqual([])
    expect(text(button())).toBe('비트 값 채우기')
    expect(button().disabled).toBe(false)
    expect(shadow().querySelector('.lead')?.classList.contains('err')).toBe(true)
    expect(shadow().querySelector('.acts')).toBeNull()
    return lines()
  }
  const shown = (code: string, what: string, how: string) => [what, how, `아무 칸도 바꾸지 않았어요. (번호 ${code})`]
  const again = () => {
    handle?.stop()
    document.body.innerHTML = ''
  }

  it.each<[string, string, string]>([
    ['E-HELPER-MISSING', 'ERP 도우미가 이 PC에 없어요.', 'ERP 도우미를 설치해 주세요. 받은 zip을 풀고 install.cmd를 두 번 누르면 돼요.'],
    [
      'E-HELPER-STOPPED',
      'ERP 도우미가 읽는 도중 멈췄어요.',
      '잠시 뒤 다시 해 주세요. 계속되면 ERP 도우미 설치 파일(install.cmd)을 다시 실행해 주세요.',
    ],
    ['E-HELPER-TIMEOUT', '도우미가 답하지 않아요(120초).', '잠시 뒤 다시 해 주세요.'],
    [
      'E-BIT-NOT-REGISTERED',
      '이 PC가 아직 등록되지 않았어요.',
      'ERP 도우미 설치 파일을 다시 실행해 주세요(비트 로그인 → PC 확인 창 [확인]).',
    ],
    [
      'E-BIT-HOSPITAL-MISMATCH',
      '이 PC의 비트가 등록할 때와 달라요(병원·설치 위치·서버).',
      '우리 병원 비트가 맞으면 ERP 도우미 설치 파일을 다시 실행해 다시 등록해 주세요.',
    ],
    ['E-BIT-READ-FAILED', '비트 자료를 읽지 못했어요.', '잠시 뒤 다시 해 주세요. 계속되면 이 번호를 알려 주세요.'],
    ['E-STORE-BROKEN', '이 PC의 ERP 도우미 등록 파일이 깨졌어요.', 'ERP 도우미 설치 파일을 다시 실행해 다시 등록해 주세요.'],
  ])('AC-3609.5: 도우미 오류 %s 이면 그 번호의 무엇이·어떻게와 번호 줄이고 칸은 그대로다', async (code, what, how) => {
    expect(await failsWith(fail(code))).toEqual(shown(code, what, how))
  })

  it.each(['E-HELPER-BAD-MESSAGE', 'E-HELPER-UNKNOWN-COMMAND'])(
    "AC-3614.3: %s(새 확장 + 옛 도우미)이면 'ERP 도우미가 예전 판이에요.'와 같이 바꾸라는 글이다",
    async (code) => {
      expect(await failsWith(fail(code))).toEqual(
        shown(code, 'ERP 도우미가 예전 판이에요.', '새 판을 설치해 주세요. 확장과 ERP 도우미는 꼭 같이 바꿔요.'),
      )
    },
  )

  it("AC-3609.5: 표에 없는 번호는 '그 밖' 글과 그 번호다", async () => {
    expect(await failsWith(fail('E-BIT-SOMETHING-NEW'))).toEqual(
      shown('E-BIT-SOMETHING-NEW', '비트에서 읽지 못했어요.', '잠시 뒤 다시 해 주세요. 계속되면 이 번호를 알려 주세요.'),
    )
  })

  it('AC-3609.5: 120초 안에 답이 없으면 E-HELPER-TIMEOUT 글이고, 그 뒤에 온 답으로 채우지 않는다', async () => {
    const answer = deferred()
    const t = start({ reply: () => answer.promise })
    const before = { ...t.page.state }
    expect(READ_TIMEOUT_MS).toBe(120_000)
    button().click()
    await flush()
    await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS - 1)
    expect(text(button())).toBe('비트에서 읽는 중…')
    expect(panel().hidden).toBe(true)
    await vi.advanceTimersByTimeAsync(1)
    expect(lines()).toEqual(shown('E-HELPER-TIMEOUT', '도우미가 답하지 않아요(120초).', '잠시 뒤 다시 해 주세요.'))
    expect(text(button())).toBe('비트 값 채우기')
    answer.resolve(ok(sampleDay()))
    await flush()
    expect(t.page.state).toEqual(before)
    expect(lead()).toBe('도우미가 답하지 않아요(120초).')
  })

  it.each<[string, Reply]>([
    ['답 없음(undefined)', undefined],
    ['모양 틀린 답', { type: 'what' }],
    ['data 모양 틀림', ok({ date: '2026-11-09' })],
    ['groups가 배열 아님', ok({ ...sampleDay(), groups: {} })],
    ['money 칸이 글자', ok({ ...sampleDay(), money: { ...sampleDay().money, total: '11668530' } })],
    ['다른 날짜의 답', ok({ ...sampleDay(), date: '2026-11-08' })],
    ['overlap 모양 틀림', ok({ ...sampleDay(), overlap: { visits: '9', carm: 0, sono: 0 } })],
    ['overlap이 배열', ok({ ...sampleDay(), overlap: [] })],
    ['오류 번호 모양 틀림', fail('<b>x</b>')],
  ])('AC-3614.1: %s 이면 E-BRIDGE-BAD-REPLY 글이다(받은 글자는 보이지 않는다)', async (_name, reply) => {
    const got = await failsWith(reply)
    expect(got).toEqual(
      shown(
        'E-BRIDGE-BAD-REPLY',
        '도우미 답의 모양이 맞지 않아 쓰지 않았어요.',
        '확장과 ERP 도우미를 같은 새 판으로 바꿔 주세요. 계속되면 이 번호를 알려 주세요.',
      ),
    )
    expect(got.join('')).not.toContain('<b>')
  })

  it('AC-3609.5 AC-3614.1: 서비스 워커에 닿지 못하면(확장을 다시 읽어 끊김) E-BRIDGE-DISCONNECTED 새로고침(F5) 글이다', async () => {
    const lost = () => Promise.reject(new Error('Extension context invalidated.'))
    expect(await failsWith(lost)).toEqual(
      shown('E-BRIDGE-DISCONNECTED', '확장이 새로 읽혀 이 화면과 끊겼어요.', '이 화면을 새로고침(F5)한 뒤 다시 해 주세요.'),
    )
    again()
    // 설정을 읽다 끊겨도 같다
    const t = start()
    t.local.get.mockRejectedValueOnce(new Error('Extension context invalidated.'))
    button().click()
    await flush()
    expect(lines()).toEqual(
      shown('E-BRIDGE-DISCONNECTED', '확장이 새로 읽혀 이 화면과 끊겼어요.', '이 화면을 새로고침(F5)한 뒤 다시 해 주세요.'),
    )
    expect(t.dayCalls()).toHaveLength(0)
  })
})

describe('AC-3612.1 오늘보다 뒤 날짜', () => {
  const FUTURE = (date: string) => [`마감 일자(${date})가 오늘보다 뒤예요.`, '날짜를 확인해 주세요.', '아무 칸도 바꾸지 않았어요.']

  it('AC-3612.1: 마감 일자가 오늘(2026-11-10)보다 뒤면 도우미를 부르지 않고 future 글이며 칸은 그대로다', async () => {
    const t = start({ page: { date: '2026-11-11' } })
    const before = { ...t.page.state }
    button().click()
    await flush()
    expect(lines()).toEqual(FUTURE('2026-11-11'))
    expect(t.sendMessage).not.toHaveBeenCalled()
    expect(t.page.state).toEqual(before)
    expect(t.page.log).toEqual([])
    expect(text(button())).toBe('비트 값 채우기')
    expect(button().disabled).toBe(false)
  })

  it('AC-3612.1: 도우미가 E-CLOSING-FUTURE-DATE로 답해도 같은 글이다(도우미 PC 날짜가 다를 때)', async () => {
    const t = start({ reply: fail('E-CLOSING-FUTURE-DATE') })
    const before = { ...t.page.state }
    button().click()
    await flush()
    expect(lines()).toEqual(FUTURE('2026-11-09'))
    expect(t.page.state).toEqual(before)
  })

  it('AC-3612.1: 오늘 날짜는 채운다(진료 중 중간 확인)', async () => {
    const day = { ...sampleDay(), date: '2026-11-10' }
    const t = start({ page: { date: '2026-11-10' }, reply: ok(day) })
    button().click()
    await flush()
    expect(t.dayCalls()).toHaveLength(1)
    expect(lead()).toBe('2026-11-10 비트 값으로 93칸을 채웠어요. 저장은 하지 않았어요.')
  })

  it("AC-3612.1: '오늘'은 이 PC의 지역 날짜다(한국 0시 30분 = 세계 시각으로는 전날이어도 오늘은 2026-11-10)", async () => {
    vi.setSystemTime(new Date('2026-11-10T00:30:00+09:00'))
    const t = start({ page: { date: '2026-11-10' }, reply: ok({ ...sampleDay(), date: '2026-11-10' }) })
    button().click()
    await flush()
    expect(t.dayCalls()).toHaveLength(1)
    vi.setSystemTime(new Date('2026-11-10T23:59:00+09:00'))
    dateInput().value = '2026-11-11'
    button().click()
    await flush()
    expect(t.dayCalls()).toHaveLength(1)
    expect(lead()).toBe('마감 일자(2026-11-11)가 오늘보다 뒤예요.')
  })
})

describe('AC-3612.2 진료 0건인 날은 멈춘다', () => {
  const zeroDay = () => {
    const day = sampleDay()
    day.patients = { new: 0, first90: 0, return: 0, ptVisit: 0, noExamFee: 0, total: 0 }
    return day
  }
  const ZERO = [
    '2026-11-09에는 비트 진료가 한 건도 없어요.',
    '마감 일자가 맞는지 확인해 주세요. 맞으면 [그래도 채우기]로 채울 수 있어요(쉬는 날 예약 칸 등).',
    '아직 아무 칸도 바꾸지 않았어요.',
  ]

  it('AC-3612.2: patients.total 0이면 칸을 바꾸기 전에 멈추고 [그래도 채우기]·[안내 닫기]([안내 닫기] 먼저 포커스)가 나온다', async () => {
    const t = start({ reply: ok(zeroDay()) })
    const before = { ...t.page.state }
    button().click()
    await flush()
    expect([...shadow().querySelectorAll('.pb > p')].map(text)).toEqual(ZERO)
    expect(actLabels()).toEqual(['그래도 채우기', '안내 닫기'])
    expect(shadow().activeElement).toBe(act('안내 닫기'))
    expect(t.page.state).toEqual(before)
    expect(t.page.log).toEqual([])
  })

  it('AC-3612.2: [안내 닫기]면 어느 칸도 바꾸지 않는다', async () => {
    const t = start({ reply: ok(zeroDay()) })
    const before = { ...t.page.state }
    button().click()
    await flush()
    act('안내 닫기').click()
    await flush()
    expect(panel().hidden).toBe(true)
    expect(t.page.state).toEqual(before)
    expect(t.page.log).toEqual([])
    expect(button().disabled).toBe(false)
  })

  it('AC-3612.2: [그래도 채우기]면 채운다(예약 칸 등)', async () => {
    const t = start({ reply: ok(zeroDay()) })
    button().click()
    await flush()
    act('그래도 채우기').click()
    await flush()
    expect(lead()).toBe('2026-11-09 비트 값으로 93칸을 채웠어요. 저장은 하지 않았어요.')
    expect(t.page.state.TOTAL_PATIENT).toBe('0')
    expect(t.page.state['RSV:manual:reserved']).toBe('93')
  })

  it('AC-3612.2: [그래도 채우기]를 누를 때 마감 일자가 바뀌었으면 채우지 않는다(AC-3609.3)', async () => {
    const t = start({ reply: ok(zeroDay()) })
    const before = { ...t.page.state }
    button().click()
    await flush()
    dateInput().value = '2026-11-08'
    act('그래도 채우기').click()
    await flush()
    expect(lines()).toEqual(['읽는 동안 마감 일자가 바뀌어 채우지 않았어요. 다시 눌러 주세요.'])
    expect(t.page.state).toEqual(before)
  })

  it('AC-3612.2: [그래도 채우기] 다음에 겹친 진료 묻기 → 이미 적힌 칸 묻기를 거쳐 채운다', async () => {
    const t = start({
      page: { values: { NEW_PATIENT: '3' } },
      reply: ok({ ...zeroDay(), overlap: { visits: 2, carm: 10, sono: 20 } }),
    })
    button().click()
    await flush()
    act('그래도 채우기').click()
    await flush()
    expect(lead()).toContain('씨암·SONO 코드가 함께 있는 진료가 2건 있어요')
    act('둘 다 넣기').click()
    await flush()
    expect(lead()).toBe('이미 적힌 칸 1개가 비트 값으로 바뀌어요.')
    act('바꾸기').click()
    await flush()
    expect(t.page.state.NEW_PATIENT).toBe('0')
    expect(lead()).toBe('2026-11-09 비트 값으로 93칸을 채웠어요. 저장은 하지 않았어요.')
  })
})

describe('AC-3612.3 이미 적힌 칸이 바뀌면 먼저 묻는다', () => {
  /** 다른 값 둘(신환 3 · 외래 총매출 1,234) + 같은 값(진료수납액 5,571,630) + 빈 칸으로 보는 값(카드 0) */
  const HAND = { NEW_PATIENT: '3', TOTAL_FEE: '1234', RECEIVED: '5571630', CARD_AMOUNT: '0' }
  const ASK = [
    '이미 적힌 칸 2개가 비트 값으로 바뀌어요.',
    '바뀌는 칸: 환자현황 신환 · 외래 수입 외래 총매출',
    '[빈 칸만]을 누르면 적힌 칸은 그대로 두고 빈 칸만 채워요.',
  ]

  it('AC-3612.3: 적힌 칸 N개와 바뀌는 칸 짧은 이름, [바꾸기]·[빈 칸만]([빈 칸만] 먼저 포커스)·[안내 닫기]가 나오고 아직 칸은 그대로다', async () => {
    const t = start({ page: { values: HAND } })
    const before = { ...t.page.state }
    button().click()
    await flush()
    expect([...shadow().querySelectorAll('.pb > p')].map(text)).toEqual(ASK)
    expect(actLabels()).toEqual(['바꾸기', '빈 칸만', '안내 닫기'])
    expect(shadow().activeElement).toBe(act('빈 칸만'))
    expect(t.page.state).toEqual(before)
    expect(t.page.log).toEqual([])
  })

  it('AC-3612.3: [바꾸기]면 적힌 칸도 모두 바꾸고 그대로 둔 칸 줄은 없다', async () => {
    const t = start({ page: { values: HAND } })
    button().click()
    await flush()
    act('바꾸기').click()
    await flush()
    expect(t.page.state.NEW_PATIENT).toBe('7')
    expect(t.page.state.TOTAL_FEE).toBe('11668530')
    expect(lead()).toBe('2026-11-09 비트 값으로 93칸을 채웠어요. 저장은 하지 않았어요.')
    expect(shadow().querySelector('.kept')).toBeNull()
  })

  it("AC-3612.3: [빈 칸만]이면 적힌 칸은 그대로, 빈 칸(0 포함)·같은 값 칸만 채우고 '이미 적힌 2칸은 그대로 두었어요.'", async () => {
    const t = start({ page: { values: HAND } })
    button().click()
    await flush()
    act('빈 칸만').click()
    await flush()
    expect(t.page.state.NEW_PATIENT).toBe('3')
    expect(t.page.state.TOTAL_FEE).toBe('1234')
    expect(t.page.state.CARD_AMOUNT).toBe('4012330')
    expect(t.page.state.RECEIVED).toBe('5571630')
    expect(lead()).toBe('2026-11-09 비트 값으로 91칸을 채웠어요. 저장은 하지 않았어요.')
    expect(text(shadow().querySelector('.kept'))).toBe('이미 적힌 2칸은 그대로 두었어요.')
  })

  it('AC-3612.3: [안내 닫기](단추·×)면 아무 칸도 바꾸지 않는다', async () => {
    for (const close of [() => act('안내 닫기').click(), () => shadow().querySelector<HTMLButtonElement>('.x')?.click()]) {
      const t = start({ page: { values: HAND } })
      const before = { ...t.page.state }
      button().click()
      await flush()
      close()
      await flush()
      expect(panel().hidden).toBe(true)
      expect(t.page.state).toEqual(before)
      expect(t.page.log).toEqual([])
      expect(button().disabled).toBe(false)
      handle?.stop()
      document.body.innerHTML = ''
    }
  })

  it('AC-3612.3: 누를 때 마감 일자가 바뀌었으면 채우지 않는다(AC-3609.3)', async () => {
    const t = start({ page: { values: HAND } })
    const before = { ...t.page.state }
    button().click()
    await flush()
    dateInput().value = '2026-11-08'
    act('바꾸기').click()
    await flush()
    expect(lines()).toEqual(['읽는 동안 마감 일자가 바뀌어 채우지 않았어요. 다시 눌러 주세요.'])
    expect(t.page.state).toEqual(before)
  })

  it('AC-3612.3: 적힌 칸이 0개면(비었거나 0인 칸·같은 값만) 묻지 않고 채운다', async () => {
    const t = start({ page: { values: { RECEIVED: '5571630', CARD_AMOUNT: '0', NEW_PATIENT: '7' } } })
    button().click()
    await flush()
    expect(lead()).toBe('2026-11-09 비트 값으로 93칸을 채웠어요. 저장은 하지 않았어요.')
    expect(t.page.state.CARD_AMOUNT).toBe('4012330')
  })

  it('AC-3612.3: 바뀌는 칸이 10줄을 넘으면 10줄 + 외 K줄이다(같은 줄은 한 번)', async () => {
    const pre = Object.fromEntries(
      ['NEW_PATIENT', 'FIRST90_PATIENT', 'RETURN_PATIENT', 'PT_VISIT_PATIENT', 'NO_EXAM_FEE_PATIENT', 'TOTAL_PATIENT']
        .concat(['CARM_CNT', 'CLOSING_SONO_CNT', 'ARTHROGRAPHY_CNT', 'TOTAL_FEE', 'CLAIM_AMOUNT', 'UNPAID_IN'])
        .map((k) => [k, '1']),
    )
    // 예약 도수 줄 네 칸은 한 줄로 센다
    for (const c of ['reserved', 'visited', 'changed', 'canceled']) pre[`RSV:manual:${c}`] = '1'
    start({ page: { values: pre } })
    button().click()
    await flush()
    expect(lead()).toBe('이미 적힌 칸 16개가 비트 값으로 바뀌어요.')
    expect(lines()[1]).toBe(
      '바뀌는 칸: 환자현황 신환 · 환자현황 90일초진 · 환자현황 재진 · 환자현황 물리치료내원 · 환자현황 진찰료 산정안함 · 환자현황 합계 · 치료현황 씨암 · 치료현황 SONO · 치료현황 관절조영술 · 외래 수입 외래 총매출 외 3줄',
    )
  })

  it('AC-3612.3 AC-3609.7: 겹친 진료 묻기가 먼저이고, 고른 값으로 견주어 묻는다', async () => {
    // 씨암 매출 칸에 SONO에 넣기로 고른 값(1,001,234 − 400,000)이 이미 적혀 있다
    const t = start({
      page: { values: { CARM_AMT: '601234' } },
      reply: ok({ ...sampleDay(), overlap: { visits: 9, carm: 400_000, sono: 300_000 } }),
    })
    button().click()
    await flush()
    expect(lead()).toContain('씨암·SONO 코드가 함께 있는 진료가 9건')
    act('SONO에 넣기').click()
    await flush()
    // 같은 값이라 묻지 않고 채움
    expect(lead()).toBe('2026-11-09 비트 값으로 93칸을 채웠어요. 저장은 하지 않았어요.')
    expect(t.page.state.CARM_AMT).toBe('601234')
    handle?.stop()
    document.body.innerHTML = ''

    start({
      page: { values: { CARM_AMT: '601234' } },
      reply: ok({ ...sampleDay(), overlap: { visits: 9, carm: 400_000, sono: 300_000 } }),
    })
    button().click()
    await flush()
    act('둘 다 넣기').click()
    await flush()
    expect(lines().slice(0, 2)).toEqual(['이미 적힌 칸 1개가 비트 값으로 바뀌어요.', '바뀌는 칸: 치료별 매출 씨암'])
  })

  it('AC-3612.3 AC-3608.5: 2 탭에서 누르면 업무일지 1 탭을 잠깐 바꿔 세고, 채운 뒤에도 2 탭으로 돌아온다', async () => {
    const t = start({ page: { tab: 'w2', values: HAND } })
    button().click()
    await vi.advanceTimersByTimeAsync(200)
    expect(lead()).toBe('이미 적힌 칸 2개가 비트 값으로 바뀌어요.')
    expect(t.page.tab()).toBe('w2')
    act('바꾸기').click()
    await vi.advanceTimersByTimeAsync(200)
    expect(lead()).toBe('2026-11-09 비트 값으로 93칸을 채웠어요. 저장은 하지 않았어요.')
    expect(t.page.tab()).toBe('w2')
    expect(t.page.clicks).toEqual(['closing-tab-w1', 'closing-tab-w2', 'closing-tab-w1', 'closing-tab-w2'])
  })
})

describe('AC-3612.5 읽기 전용 화면', () => {
  it("AC-3612.5: 채울 칸이 모두 잠겼으면 '읽기 전용' 한 줄만 보이고(넣지 못한 칸 목록 없음) 칸은 그대로다", async () => {
    const t = start({ page: { readOnly: true } })
    const before = { ...t.page.state }
    button().click()
    await flush()
    expect(lines()).toEqual(['이 화면은 읽기 전용이라 채울 수 없어요(본사 열람 등).', '아무 칸도 바꾸지 않았어요.'])
    expect(shadow().querySelector('.blk')).toBeNull()
    expect(t.page.state).toEqual(before)
    expect(t.page.log).toEqual([])
    expect(lastButton().hidden).toBe(true)
  })

  it("AC-3612.5 AC-3613.2: 일부만 잠겼으면 채우고 '읽기 전용 칸' 묶음으로 알린다", async () => {
    start({ page: { lockedKeys: ['NEW_PATIENT', 'TOTAL_FEE'] } })
    button().click()
    await flush()
    expect(lead()).toBe('2026-11-09 비트 값으로 91칸을 채웠어요. 저장은 하지 않았어요.')
    const blk = shadow().querySelector('.blk')
    expect(text(blk?.querySelector('.h'))).toBe('읽기 전용 칸 2칸')
    expect(text(blk?.querySelector('.rows'))).toBe('환자현황 신환 · 외래 수입 외래 총매출')
    expect(text(blk?.querySelector('.small'))).toBe('잠긴 칸이라 그대로 두었어요.')
  })
})

describe('AC-3613.1 AC-3613.2 채운 뒤 안내', () => {
  it("AC-3613.1: 맨 위에 '비트와 맞춰 볼 숫자'와 외래 총매출·진료수납액·환자 합계 3줄(쉼표)이 있다", async () => {
    start()
    button().click()
    await flush()
    const check = shadow().querySelector('.pb > .check')
    expect(shadow().querySelector('.pb')?.firstElementChild).toBe(check)
    expect([...(check?.children ?? [])].map(text)).toEqual([
      '비트와 맞춰 볼 숫자',
      '외래 총매출 11,668,530원',
      '진료수납액 5,571,630원',
      '환자 합계 84명',
      '비트 화면의 같은 숫자와 먼저 견주어 보세요.',
    ])
  })

  it("AC-3613.1: 값이 null이면 '—'다", async () => {
    const day = sampleDay()
    day.money.total = null
    day.money.received = null
    start({ reply: ok(day) })
    button().click()
    await flush()
    expect([...(shadow().querySelector('.check')?.children ?? [])].map(text).slice(1, 4)).toEqual([
      '외래 총매출 —',
      '진료수납액 —',
      '환자 합계 84명',
    ])
  })

  it('AC-3613.2: 코드를 골랐는데 ERP 줄 이름이 빈 기타 줄은 고르지 않은 칸과 따로 알린다', async () => {
    const stored = settingsFirst()
    stored.picks.etc2 = ['TAPING']
    start({ stored, page: { etcNames: ['크라이오', '기타2', '기타3', '기타4'] } })
    button().click()
    await flush()
    const blocks = [...shadow().querySelectorAll('.blk')]
    expect(blocks.map((b) => text(b.querySelector('.h')))).toEqual(['ERP 줄 이름이 빈 기타 줄 4칸', '고르지 않아 건너뛴 칸 34칸'])
    expect(text(blocks[0].querySelector('.rows'))).toBe('치료별 건수 기타2 · 치료별 매출 기타2')
    expect(text(blocks[0].querySelector('.small'))).toBe(
      '설정 화면에서 그 기타 줄의 ERP 줄 이름을 업무일지 2 줄 이름과 똑같이 넣어 주세요.',
    )
  })

  it('AC-3609.4 AC-3612.4: 채운 뒤 [되돌리기]·[설정 열기]가 있다', async () => {
    start()
    button().click()
    await flush()
    expect(actLabels()).toEqual(['되돌리기', '설정 열기'])
  })
})

describe('AC-3612.4 [되돌리기]', () => {
  it("AC-3612.4: 넣은 칸만 채우기 전 글자로 돌리고 '되돌렸어요' 글이다(금액칸은 '' → 값 → blur)", async () => {
    const t = start({ page: { values: { NEW_PATIENT: '3', TOTAL_FEE: '1234' } } })
    const before = { ...t.page.state }
    button().click()
    await flush()
    act('바꾸기').click()
    await flush()
    expect(t.page.state.TOTAL_FEE).toBe('11668530')
    t.page.log.length = 0
    act('되돌리기').click()
    await flush()
    expect(t.page.state).toEqual(before)
    expect(t.page.dom('TOTAL_FEE')).toEqual(['1,234'])
    expect(t.page.log.filter((x) => x.key === 'TOTAL_FEE').map((x) => x.ev)).toEqual(['input', 'input', 'blur'])
    expect(lines()).toEqual(['되돌렸어요. 93칸을 채우기 전 값으로 돌렸어요. 저장은 하지 않았어요.'])
    expect(t.page.clicks).toEqual([])
  })

  it('AC-3612.4: [빈 칸만]으로 그대로 둔 칸은 되돌릴 때도 건드리지 않는다', async () => {
    const t = start({ page: { values: { NEW_PATIENT: '3' } } })
    button().click()
    await flush()
    act('빈 칸만').click()
    await flush()
    act('되돌리기').click()
    await flush()
    expect(t.page.state.NEW_PATIENT).toBe('3')
    expect(t.page.state.TOTAL_FEE).toBe('')
    expect(lead()).toBe('되돌렸어요. 92칸을 채우기 전 값으로 돌렸어요. 저장은 하지 않았어요.')
  })

  it('AC-3612.4: 마감 일자가 채울 때와 다르면 아무 칸도 바꾸지 않는다', async () => {
    const t = start()
    button().click()
    await flush()
    const filled = { ...t.page.state }
    dateInput().value = '2026-11-08'
    act('되돌리기').click()
    await flush()
    expect(lines()).toEqual(['마감 일자가 바뀌어 되돌리지 않았어요.', '아무 칸도 바꾸지 않았어요.'])
    expect(t.page.state).toEqual(filled)
  })

  it("AC-3612.4: 화면에서 없어진 칸은 건너뛰고 '화면이 바뀌어 K칸은 되돌리지 못했어요.'", async () => {
    const t = start()
    button().click()
    await flush()
    ;[...document.querySelectorAll('td.rowlabel')].find((td) => td.textContent === '물리치료')?.closest('tr')?.remove()
    act('되돌리기').click()
    await flush()
    expect(lines()).toEqual(['되돌렸어요. 92칸을 채우기 전 값으로 돌렸어요. 저장은 하지 않았어요.', '화면이 바뀌어 1칸은 되돌리지 못했어요.'])
    expect(t.page.state.NEW_PATIENT).toBe('')
  })

  it('AC-3612.4: 되돌린 뒤에는 기억이 없어 [지난 결과]도 없다', async () => {
    start()
    button().click()
    await flush()
    act('되돌리기').click()
    await flush()
    shadow().querySelector<HTMLButtonElement>('.x')?.click()
    expect(lastButton().hidden).toBe(true)
  })

  it('AC-3612.4: 다음 채우기 뒤에는 그 채우기 전 값으로만 돌린다(앞 기억은 지움)', async () => {
    const t = start({ page: { values: { NEW_PATIENT: '3' } } })
    button().click()
    await flush()
    act('바꾸기').click()
    await flush()
    expect(t.page.state.NEW_PATIENT).toBe('7')
    const day = sampleDay()
    day.patients.new = 8
    t.sendMessage.mockImplementation(async () => ok(day))
    button().click()
    await flush()
    act('바꾸기').click()
    await flush()
    expect(t.page.state.NEW_PATIENT).toBe('8')
    act('되돌리기').click()
    await flush()
    expect(t.page.state.NEW_PATIENT).toBe('7')
  })

  it('AC-3612.4 AC-3601.5: 되돌릴 기억은 화면에만 두고 chrome.storage에 쓰지 않는다', async () => {
    const t = start({ page: { values: { NEW_PATIENT: '3' } } })
    button().click()
    await flush()
    act('바꾸기').click()
    await flush()
    act('되돌리기').click()
    await flush()
    expect(t.local.set).not.toHaveBeenCalled()
  })

  it('AC-3612.4: 화면을 떠났다 돌아오면 기억이 없다([지난 결과] 없음)', async () => {
    const t = start()
    button().click()
    await flush()
    history.pushState(null, '', '/h/closing-calendar')
    await vi.advanceTimersByTimeAsync(WATCH_MS)
    history.pushState(null, '', '/h/closing')
    await vi.advanceTimersByTimeAsync(WATCH_MS)
    expect(host()).not.toBeNull()
    expect(panel().hidden).toBe(true)
    expect(lastButton().hidden).toBe(true)
    expect(t.page.state.NEW_PATIENT).toBe('7')
  })
})

describe('AC-3618.2 [되돌리기]는 채운 뒤 손으로 고친 칸을 그대로 둔다', () => {
  it("AC-3618.2: 손으로 고친 칸은 그 값 그대로, 나머지는 채우기 전 글자로 돌리고 '채운 뒤 손으로 고친 K칸은 그대로 두었어요.'", async () => {
    const t = start({ page: { values: { NEW_PATIENT: '3', TOTAL_FEE: '1234' } } })
    button().click()
    await flush()
    act('바꾸기').click()
    await flush()
    expect(t.page.state.NEW_PATIENT).toBe('7')
    // 직원이 채운 뒤 두 칸을 손으로 고친다
    putValue(t.page.inputs('NEW_PATIENT')[0] as HTMLInputElement, '9')
    putValue(t.page.inputs('RETURN_PATIENT')[0] as HTMLInputElement, '50')
    act('되돌리기').click()
    await flush()
    expect(t.page.state.NEW_PATIENT).toBe('9')
    expect(t.page.state.RETURN_PATIENT).toBe('50')
    expect(t.page.state.TOTAL_FEE).toBe('1234')
    expect(t.page.state.FIRST90_PATIENT).toBe('')
    expect(lines()).toEqual([
      '되돌렸어요. 91칸을 채우기 전 값으로 돌렸어요. 저장은 하지 않았어요.',
      '채운 뒤 손으로 고친 2칸은 그대로 두었어요.',
    ])
  })

  it('AC-3618.2: 손으로 고친 칸이 없으면 그 줄이 없다(금액칸 쉼표 꼴은 고친 것이 아님)', async () => {
    const t = start()
    button().click()
    await flush()
    expect(t.page.dom('TOTAL_FEE')).toEqual(['11,668,530'])
    act('되돌리기').click()
    await flush()
    expect(lines()).toEqual(['되돌렸어요. 93칸을 채우기 전 값으로 돌렸어요. 저장은 하지 않았어요.'])
  })

  it('AC-3618.2 AC-3612.4: 손으로 고친 칸과 화면에서 없어진 칸이 함께 있으면 두 줄 모두 보인다', async () => {
    const t = start()
    button().click()
    await flush()
    putValue(t.page.inputs('NEW_PATIENT')[0] as HTMLInputElement, '9')
    ;[...document.querySelectorAll('td.rowlabel')].find((td) => td.textContent === '물리치료')?.closest('tr')?.remove()
    act('되돌리기').click()
    await flush()
    expect(lines()).toEqual([
      '되돌렸어요. 91칸을 채우기 전 값으로 돌렸어요. 저장은 하지 않았어요.',
      '채운 뒤 손으로 고친 1칸은 그대로 두었어요.',
      '화면이 바뀌어 1칸은 되돌리지 못했어요.',
    ])
    expect(t.page.state.NEW_PATIENT).toBe('9')
    expect(t.local.set).not.toHaveBeenCalled()
  })
})

describe('AC-3613.3 [지난 결과]와 Esc', () => {
  it('AC-3613.3: 안내를 닫으면 단추 옆 [지난 결과]가 나오고, 누르면 마지막 채운 안내를 칸을 다시 채우지 않고 다시 연다', async () => {
    const t = start()
    expect(lastButton().hidden).toBe(true)
    button().click()
    await flush()
    const shownBefore = lines()
    // 안내가 열려 있을 때는 숨어 있다
    expect(lastButton().hidden).toBe(true)
    shadow().querySelector<HTMLButtonElement>('.x')?.click()
    expect(lastButton().hidden).toBe(false)
    expect(text(lastButton())).toBe('지난 결과')
    const logged = t.page.log.length
    lastButton().click()
    await flush()
    expect(panel().hidden).toBe(false)
    expect(lines()).toEqual(shownBefore)
    expect(actLabels()).toEqual(['되돌리기', '설정 열기'])
    expect(t.page.log).toHaveLength(logged)
    expect(t.dayCalls()).toHaveLength(1)
    // 다시 연 안내의 [되돌리기]도 된다
    act('되돌리기').click()
    await flush()
    expect(t.page.state.NEW_PATIENT).toBe('')
  })

  it('AC-3613.3: 읽는 중엔 [지난 결과]가 막힌다', async () => {
    const answer = deferred()
    const t = start()
    button().click()
    await flush()
    t.sendMessage.mockImplementation(() => answer.promise)
    button().click()
    await flush()
    expect(lastButton().hidden).toBe(false)
    expect(lastButton().disabled).toBe(true)
    answer.resolve(fail('E-BIT-READ-FAILED'))
    await flush()
    // 다음 읽기가 실패하면 지난 결과는 그대로 남는다
    shadow().querySelector<HTMLButtonElement>('.x')?.click()
    expect(lastButton().disabled).toBe(false)
    lastButton().click()
    expect(lead()).toBe('2026-11-09 비트 값으로 93칸을 채웠어요. 저장은 하지 않았어요.')
  })

  it('AC-3613.3: 채운 적이 없거나 오류만 났으면 [지난 결과]가 없다', async () => {
    start({ reply: fail('E-BIT-READ-FAILED') })
    button().click()
    await flush()
    shadow().querySelector<HTMLButtonElement>('.x')?.click()
    expect(lastButton().hidden).toBe(true)
  })

  it('AC-3613.3: 안내가 열려 있을 때 Esc는 안내를 닫고, ERP 화면 쪽도 그 키를 그대로 받는다', async () => {
    const t = start()
    button().click()
    await flush()
    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true, cancelable: true })
    ;(shadow().activeElement ?? shadow().querySelector('button'))?.dispatchEvent(esc)
    expect(panel().hidden).toBe(true)
    expect(esc.defaultPrevented).toBe(false)
    expect(t.page.keys).toContain('Escape')
    expect(lastButton().hidden).toBe(false)
  })

  it('AC-3613.3: 묻는 안내도 Esc로 닫히고 아무 칸도 바꾸지 않는다. 다른 키는 닫지 않는다', async () => {
    const t = start({ page: { values: { NEW_PATIENT: '3' } } })
    const before = { ...t.page.state }
    button().click()
    await flush()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(panel().hidden).toBe(false)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flush()
    expect(panel().hidden).toBe(true)
    expect(t.page.state).toEqual(before)
    expect(t.page.log).toEqual([])
    expect(button().disabled).toBe(false)
  })

  it('AC-3613.3: 안내가 닫혀 있으면 Esc는 아무것도 하지 않는다', async () => {
    const t = start()
    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    document.dispatchEvent(esc)
    expect(esc.defaultPrevented).toBe(false)
    expect(panel().hidden).toBe(true)
    expect(t.page.keys).toEqual(['Escape'])
  })
})

describe('AC-3609.1 내용 스크립트와 모듈 파일', () => {
  const IMPORT = /^\s*(?:import|export)\s[^;]*?from\s+['"]([^'"]+)['"]/gm

  it("AC-3609.1: content.ts는 일반 스크립트이고 import(chrome.runtime.getURL('main.js'))로 불러 startPage만 부른다", () => {
    const code = readFileSync(path.join(SRC, 'content.ts'), 'utf8')
    expect(code).not.toMatch(/^\s*(?:import|export)\s/m)
    expect(code).toContain("import(chrome.runtime.getURL('main.js'))")
    expect(code).toMatch(/\.startPage\(\)/)
  })

  it('AC-3609.1: main.js가 불러오는 모듈은 모두 manifest web_accessible_resources에 있다(.js로 부른다)', () => {
    const manifest = JSON.parse(readFileSync(path.join(EXT, 'manifest.json'), 'utf8')) as {
      web_accessible_resources: { resources: string[] }[]
    }
    const open = new Set(manifest.web_accessible_resources.flatMap((w) => w.resources))
    const seen = new Set<string>()
    const walk = (file: string) => {
      if (seen.has(file)) return
      seen.add(file)
      expect(open, file).toContain(file)
      const code = readFileSync(path.join(SRC, file.replace(/\.js$/, '.ts')), 'utf8')
      for (const [, spec] of code.matchAll(IMPORT)) {
        expect(spec, `${file}: ${spec}`).toMatch(/^\.\/[a-z]+\.js$/)
        walk(spec.slice(2))
      }
    }
    walk('main.js')
    expect([...seen].sort()).toEqual(['cells.js', 'errors.js', 'fill.js', 'main.js', 'panel.js', 'settings.js', 'types.js'])
  })
})

