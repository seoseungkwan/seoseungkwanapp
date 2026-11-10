// @vitest-environment jsdom
// TASK-7 REQ-3609: ERP 마감일지 화면의 단추 → 날짜 읽기 → 서비스 워커에 closing.day → 칸 채우기 → 안내(main.ts)를
// 가짜 chrome(runtime.sendMessage·storage.local)과 시험용 ERP 화면(__tests__/erpPage.ts)으로 시험한다. 숫자는 가짜(환자 정보 없음)
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ETC_NAMES, mountErpPage, sampleDay, settingsFirst, type ErpPage, type ErpPageOptions } from './__tests__/erpPage'
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
const dateInput = () =>
  [...document.querySelectorAll<HTMLInputElement>('input.datepicker-input')].find((i) => i.getAttribute('aria-label') !== '연도 선택') as HTMLInputElement

beforeEach(() => {
  vi.useFakeTimers()
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
    // 처음 값 + 예약 도수·충격파: 131칸 가운데 고르지 않은 38칸을 빼고 93칸
    expect(lead()).toBe('2026-11-09 비트 값으로 93칸을 채웠어요. 저장은 하지 않았어요.')
    const skipped = shadow().querySelector('.blk')
    expect(text(skipped?.querySelector('p'))).toBe('고르지 않아 건너뛴 칸 38칸')
    expect(text(skipped?.querySelector('.small'))).toBe('설정에서 코드를 고르지 않은 항목이라 그대로 두었어요.')
    expect(lines()).toContain('확인한 뒤 업무일지 1 [전체 저장]과 업무일지 2 [일일 상세 저장]을 눌러 주세요.')
    expect(shadow().querySelector('.warns')).toBeNull()
    expect(t.page.state).toMatchObject({ NEW_PATIENT: '7', TOTAL_PATIENT: '84', TOTAL_FEE: '11668530', CARM_CNT: '400' })
    expect(t.page.clicks).toEqual([])
    expect(text(button())).toBe('비트 값 채우기')
    expect(button().disabled).toBe(false)
  })

  it('AC-3609.4: 못 찾은 칸은 목록으로, 경고는 design.md 5절 글로 보인다', async () => {
    const day = sampleDay()
    day.warnings.moneyUnconfirmed = true
    day.warnings.unpaidVisits = 2
    start({ page: { therapistRows: true }, reply: ok(day) })
    button().click()
    await flush()
    expect(lead()).toBe('2026-11-09 비트 값으로 91칸을 채웠어요. 저장은 하지 않았어요.')
    const miss = shadow().querySelector('.blk')
    expect(text(miss?.querySelector('.h'))).toBe('못 찾은 칸 2칸')
    expect([...(miss?.querySelectorAll('li') ?? [])].map(text)).toEqual([
      '업무일지 1 › 진료 · 치료현황 › 도수치료',
      '업무일지 1 › 진료 · 치료현황 › 충격파(체충)',
    ])
    expect([...shadow().querySelectorAll('.warns li')].map(text)).toEqual([
      '환불·변경수납 등이 있는 날이에요. 외래 수입 8칸(총매출·청구액·비급여·미수입금·진료수납액·카드·현금·계좌)은 비트 수납 줄을 그대로 더한 값이라 다를 수 있어요. 확인해 주세요.',
      '수납이 끝나지 않은 진료 2건이 있어요. 치료별 매출이 적게 나왔을 수 있어요.',
      '환불 33,000원이 있어요. 금액을 확인해 주세요.',
    ])
  })

  it('AC-3609.4: [설정 열기]는 서비스 워커에 설정 화면을 열어 달라고만 한다', async () => {
    const t = start()
    button().click()
    await flush()
    shadow().querySelector<HTMLButtonElement>('.acts button')?.click()
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

describe('AC-3609.5 오류 때 칸 그대로', () => {
  async function failsWith(reply: Reply) {
    const t = start({ reply })
    const before = { ...t.page.state }
    button().click()
    await flush()
    expect(t.page.state).toEqual(before)
    expect(t.page.log).toEqual([])
    expect(text(button())).toBe('비트 값 채우기')
    expect(button().disabled).toBe(false)
    expect(lines().at(-1)).toBe('아무 칸도 바꾸지 않았어요.')
    return lead()
  }

  it("AC-3609.5: ERP 도우미가 없어 연결이 끊기면(E-HELPER-MISSING) 'ERP 도우미를 설치해 주세요.'", async () => {
    expect(await failsWith(fail('E-HELPER-MISSING'))).toBe('ERP 도우미를 설치해 주세요.')
  })

  it("AC-3609.5: 이 PC가 등록되지 않았으면(E-BIT-NOT-REGISTERED) '이 PC가 아직 등록되지 않았어요. ERP 도우미 설치 파일을 다시 실행해 주세요.'", async () => {
    expect(await failsWith(fail('E-BIT-NOT-REGISTERED'))).toBe(
      '이 PC가 아직 등록되지 않았어요. ERP 도우미 설치 파일을 다시 실행해 주세요.',
    )
  })

  it("AC-3609.5: 그 밖의 도우미 오류 번호면 '비트에서 읽지 못했어요 ({번호})'", async () => {
    expect(await failsWith(fail('E-BIT-READ-FAILED'))).toBe('비트에서 읽지 못했어요 (E-BIT-READ-FAILED)')
    handle?.stop()
    document.body.innerHTML = ''
    expect(await failsWith(fail('E-HELPER-UNKNOWN-COMMAND'))).toBe('비트에서 읽지 못했어요 (E-HELPER-UNKNOWN-COMMAND)')
    handle?.stop()
    document.body.innerHTML = ''
    expect(await failsWith(fail('E-BIT-HOSPITAL-MISMATCH'))).toBe('비트에서 읽지 못했어요 (E-BIT-HOSPITAL-MISMATCH)')
  })

  it("AC-3609.5: 서비스 워커가 120초를 넘겨 E-HELPER-TIMEOUT으로 답하면 '도우미가 답하지 않아요. 잠시 뒤 다시 눌러 주세요.'", async () => {
    expect(await failsWith(fail('E-HELPER-TIMEOUT'))).toBe('도우미가 답하지 않아요. 잠시 뒤 다시 눌러 주세요.')
  })

  it('AC-3609.5: 120초 안에 답이 없으면 시간 초과 안내이고, 그 뒤에 온 답으로 채우지 않는다', async () => {
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
    expect(lines()).toEqual(['도우미가 답하지 않아요. 잠시 뒤 다시 눌러 주세요.', '아무 칸도 바꾸지 않았어요.'])
    expect(text(button())).toBe('비트 값 채우기')
    answer.resolve(ok(sampleDay()))
    await flush()
    expect(t.page.state).toEqual(before)
    expect(lead()).toBe('도우미가 답하지 않아요. 잠시 뒤 다시 눌러 주세요.')
  })

  it.each<[string, Reply]>([
    ['답 없음(undefined)', undefined],
    ['모양 틀린 답', { type: 'what' }],
    ['data 모양 틀림', ok({ date: '2026-11-09' })],
    ['groups가 배열 아님', ok({ ...sampleDay(), groups: {} })],
    ['money 칸이 글자', ok({ ...sampleDay(), money: { ...sampleDay().money, total: '11668530' } })],
    ['다른 날짜의 답', ok({ ...sampleDay(), date: '2026-11-08' })],
    ['오류 번호 모양 틀림', fail('<b>x</b>')],
  ])("AC-3609.5: %s 이면 '비트에서 읽지 못했어요 (E-BRIDGE-BAD-REPLY)'", async (_name, reply) => {
    expect(await failsWith(reply)).toBe('비트에서 읽지 못했어요 (E-BRIDGE-BAD-REPLY)')
  })

  it("AC-3609.5: 서비스 워커에 닿지 못하면(확장을 다시 읽어 끊김 등) '비트에서 읽지 못했어요 (E-BRIDGE-DISCONNECTED)'", async () => {
    const lost = () => Promise.reject(new Error('Extension context invalidated.'))
    expect(await failsWith(lost)).toBe('비트에서 읽지 못했어요 (E-BRIDGE-DISCONNECTED)')
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
    expect([...seen].sort()).toEqual(['cells.js', 'fill.js', 'main.js', 'panel.js', 'settings.js', 'types.js'])
  })
})

