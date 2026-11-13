// @vitest-environment jsdom
// TASK-4 (spec erp-closing-range design.md 6절): [기간 채우기] → 기간 고르기 → 살펴보기 → 승인 → 하루씩 채우고 저장 → 끝·멈춤 안내를
// 가짜 chrome(runtime.sendMessage·storage.local)과 시험용 ERP 화면(__tests__/erpPage.ts)으로 시험한다. 숫자는 가짜(환자 정보 없음).
// '오늘'은 가짜 시계 2026-11-10(한국 시간)이다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ETC_NAMES, mountErpPage, sampleDay, settingsFirst, type ErpPage, type ErpPageOptions } from './__tests__/erpPage'
import { explain } from './errors'
import { startPage, WATCH_MS } from './main'
import { HOST_ID } from './panel'
import { SETTINGS_KEY, type ClosingDay, type Settings } from './types'

const OPEN_OPTIONS = { open: 'options' }
const ok = (data: unknown) => ({ type: 'result', data })
const fail = (code: string) => ({ type: 'error', code })

/** 그날 비트 값(sampleDay 숫자에 날짜·진료 수·함께 있는 진료만 바꿈) */
function bitDay(date: string, total = 84, overlap: ClosingDay['overlap'] = null): ClosingDay {
  const day = sampleDay()
  return { ...day, date, patients: { ...day.patients, total }, overlap }
}

type Answer = (date: string) => unknown

function fakeChrome(stored: Settings | null, answer: Answer) {
  const data: Record<string, unknown> = {}
  if (stored) data[SETTINGS_KEY] = JSON.parse(JSON.stringify(stored))
  const local = {
    get: vi.fn(async (key: string) => (key in data ? { [key]: JSON.parse(JSON.stringify(data[key])) } : {})),
    set: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    clear: vi.fn(async () => {}),
  }
  const session = { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) }
  const sendMessage = vi.fn(async (msg: unknown) => {
    if (JSON.stringify(msg) === JSON.stringify(OPEN_OPTIONS)) return ok(null)
    const date = (msg as { args?: { date?: string } }).args?.date ?? ''
    return answer(date)
  })
  vi.stubGlobal('chrome', {
    runtime: { id: 'erp-test', sendMessage, getURL: (p: string) => `chrome-extension://erp-test/${p}` },
    storage: { local, session },
  })
  return { local, session, sendMessage }
}

let handle: { stop(): void } | null = null

function start(o: { page?: ErpPageOptions; stored?: Settings | null; answer?: Answer } = {}) {
  history.replaceState(null, '', '/h/closing')
  const page = mountErpPage(document, { etcNames: ETC_NAMES, ...o.page })
  const c = fakeChrome('stored' in o ? (o.stored ?? null) : settingsFirst(), o.answer ?? ((date) => ok(bitDay(date))))
  handle = startPage(document)
  return {
    page,
    ...c,
    /** closing.day를 부른 날짜(차례대로) */
    asked: () =>
      c.sendMessage.mock.calls
        .map(([m]) => m as { cmd?: string; args?: { date: string } })
        .filter((m) => m.cmd === 'closing.day')
        .map((m) => m.args?.date),
  }
}

const shadow = () => {
  const root = document.getElementById(HOST_ID)?.shadowRoot
  if (!root) throw new Error('단추가 없다')
  return root
}
const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
const fillButton = () => shadow().querySelector<HTMLButtonElement>('.fill-btn') as HTMLButtonElement
const rangeButton = () => shadow().querySelector<HTMLButtonElement>('.fill-btn2') as HTMLButtonElement
const panel = () => shadow().querySelector<HTMLElement>('.panel') as HTMLElement
const lead = () => text(shadow().querySelector('.pb .lead'))
/** 안내 몸통의 글 줄들(p·li) */
const lines = () => [...shadow().querySelectorAll('.pb p, .pb li')].map(text)
const actLabels = () => [...shadow().querySelectorAll('.pb .acts button')].map(text)
const act = (label: string) => {
  const found = [...shadow().querySelectorAll<HTMLButtonElement>('.pb .acts button')].find((b) => text(b) === label)
  if (!found) throw new Error(`[${label}] 단추가 없다: ${actLabels().join(', ')}`)
  return found
}
const dates = () => [...shadow().querySelectorAll<HTMLInputElement>('.pb input[type="date"]')]
const flush = async () => {
  await vi.advanceTimersByTimeAsync(0)
  await vi.advanceTimersByTimeAsync(0)
}
/** 기간을 고르고 [살펴보기] */
async function scan(from: string, to: string) {
  rangeButton().click()
  await flush()
  const [a, b] = dates()
  a.value = from
  a.dispatchEvent(new Event('input', { bubbles: true }))
  b.value = to
  b.dispatchEvent(new Event('input', { bubbles: true }))
  act('살펴보기').click()
  await flush()
}
/** 눌린 저장(어느 저장 · 그날) */
const saved = (page: ErpPage) => page.saves.map((s) => `${s.which} ${s.date}`)
/** 시험 기간의 날들 */
const N2 = '2026-11-02'
const N3 = '2026-11-03'
const N4 = '2026-11-04'
const N5 = '2026-11-05'

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

describe('AC-3701.3 [기간 채우기]를 누르면', () => {
  it("AC-3701.3: 원무 권한 화면이면 '오늘 마감일지만 열 수 있는 계정' 안내만 보이고 도우미·설정 화면을 부르지 않는다", async () => {
    const t = start({ page: { date: '2026-11-10', todayOnly: true }, stored: null })
    rangeButton().click()
    await flush()
    expect(lead()).toBe('이 계정은 오늘 마감일지만 열 수 있어 기간 채우기를 쓸 수 없어요.')
    expect(lines()).toContain('날짜를 고를 수 있는 계정으로 열어 주세요. 아무 칸도 바꾸지 않았어요.')
    expect(dates()).toHaveLength(0)
    expect(actLabels()).toEqual(['닫기'])
    expect(t.sendMessage).not.toHaveBeenCalled()
    expect(t.page.clicks).toEqual([])
    act('닫기').click()
    expect(panel().hidden).toBe(true)
    expect(rangeButton().disabled).toBe(false)
  })

  it("AC-3701.3: 설정을 한 번도 저장하지 않았으면 [비트 값 채우기]처럼 설정 화면을 열고 '처음 한 번' 안내를 보인다", async () => {
    const t = start({ stored: null })
    rangeButton().click()
    await flush()
    expect(t.sendMessage.mock.calls.map(([m]) => m)).toEqual([OPEN_OPTIONS])
    expect(lead()).toBe('처음 한 번 설정 화면에서 코드를 확인하고 [저장]을 눌러 주세요.')
    expect(dates()).toHaveLength(0)
    expect(rangeButton().disabled).toBe(false)
  })

  it('AC-3701.3 (AC-3701.1 처음 값): 아니면 기간 고르기가 열리고 시작일·끝일은 마감 일자 달 1일 · 마감 일자, max는 오늘이다', async () => {
    const t = start({ page: { date: '2026-11-09' } })
    rangeButton().click()
    await flush()
    expect(lead()).toBe('채울 기간을 골라 주세요.')
    expect(dates().map((d) => d.value)).toEqual(['2026-11-01', '2026-11-09'])
    expect(dates().map((d) => d.max)).toEqual(['2026-11-10', '2026-11-10'])
    expect(t.asked()).toEqual([])
  })

  it('AC-3701.3 (AC-3701.1 처음 값): 마감 일자가 오늘보다 뒤면 끝일은 오늘, 못 읽으면 둘 다 오늘이다', async () => {
    start({ page: { date: '2026-11-12' } })
    rangeButton().click()
    await flush()
    expect(dates().map((d) => d.value)).toEqual(['2026-11-01', '2026-11-10'])
    handle?.stop()
    document.body.innerHTML = ''

    start({ page: { date: null } })
    rangeButton().click()
    await flush()
    expect(dates().map((d) => d.value)).toEqual(['2026-11-10', '2026-11-10'])
  })
})

describe('AC-3702.1 AC-3703.1 사흘(새로·작성중·진료 0건): 살펴보기 → 승인 → 두 날만 저장', () => {
  const page: ErpPageOptions = { date: '2026-11-09', days: { [N4]: { status: 'draft', values: { TOTAL_FEE: '5', NEW_PATIENT: '1' } } } }
  const answer: Answer = (date) => ok(bitDay(date, date === N5 ? 0 : 84))

  it('AC-3702.1 AC-3701.4: 살펴보는 동안 진행 안내가 있고 두 단추·[지난 결과]가 막히며, 칸을 바꾸지 않고 아무 단추도 누르지 않는다', async () => {
    const t = start({ page, answer })
    await scan(N3, N5)
    expect(lead()).toBe('기간 안 날을 살펴보는 중이에요.')
    expect(lines()).toContain('3일 중 0일')
    expect(actLabels()).toEqual(['그만두기'])
    expect(rangeButton().disabled).toBe(true)
    expect(fillButton().disabled).toBe(true)
    await vi.advanceTimersByTimeAsync(1_800)
    expect(lines()).toContain('3일 중 1일')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(t.asked()).toEqual([N3, N4, N5])
    expect(t.page.log).toEqual([])
    expect(t.page.clicks).toEqual([])
    expect(t.page.saves).toEqual([])
    expect(t.page.changes).toEqual([])
    expect(lead()).toBe('11월 3일~5일 중 2일을 비트 값으로 덮어쓰고 저장해요.')
    expect(lines()).toEqual(
      expect.arrayContaining([
        '새로 채울 날 1일',
        '이미 적어 둔 날 1일 — 작성중 1일 · 확정 0일 (11/4)',
        '진료 0건이라 건너뛸 날 1일 (11/5)',
        '이미 적어 둔 1일도 비트 값으로 바뀌어요.',
      ]),
    )
    expect(actLabels()).toEqual(['닫기', '덮어쓰고 저장 시작'])
    // 승인 안내가 열려 있는 동안에도 두 단추는 막혀 있다(닫을 때 풀림)
    expect(fillButton().disabled).toBe(true)
  })

  it('AC-3703.1 AC-3703.2 AC-3705.1: [덮어쓰고 저장 시작]이면 두 날만 w1 → w2 차례로 저장하고(그때 기억이 비트 값), 상태 select는 바꾸지 않는다', async () => {
    const t = start({ page, answer })
    await scan(N3, N5)
    await vi.advanceTimersByTimeAsync(10_000)
    act('덮어쓰고 저장 시작').click()
    await flush()
    expect(lead()).toBe('2일 중 0일 저장했어요.')
    expect(lines()).toContain('지금: 11월 3일 채우는 중')
    expect(actLabels()).toEqual(['멈추기'])
    await vi.advanceTimersByTimeAsync(20_000)
    expect(saved(t.page)).toEqual([`w1 ${N3}`, `w2 ${N3}`, `w1 ${N4}`, `w2 ${N4}`])
    for (const s of t.page.saves) {
      expect(s.state).toMatchObject({ NEW_PATIENT: '7', TOTAL_PATIENT: '84', TOTAL_FEE: '11668530', CARM_CNT: '400', STATUS: 'draft' })
    }
    // 누른 단추는 두 저장뿐(탭은 이미 1 탭), 상태 select는 바뀌지 않았다
    expect(t.page.clicks).toEqual(['전체 저장', '일일 상세 저장', '전체 저장', '일일 상세 저장'])
    expect(t.page.changes).toEqual([])
    // 채울 때 도우미를 다시 부른다(진료 0건 날은 다시 부르지 않음)
    expect(t.asked()).toEqual([N3, N4, N5, N3, N4])
    expect(lead()).toBe('2일을 비트 값으로 저장했어요.')
    expect(lines()).toEqual(
      expect.arrayContaining(['건너뛴 날 1일 — 진료 0건 (11/5)', '직접 넣는 칸(담당자·지출·특이사항 등)은 건드리지 않았어요.']),
    )
    expect(actLabels()).toEqual(['닫기'])
    expect(fillButton().disabled).toBe(true)
    act('닫기').click()
    expect(panel().hidden).toBe(true)
    expect(fillButton().disabled).toBe(false)
    expect(rangeButton().disabled).toBe(false)
  })

  it('AC-3703.5: 도는 동안 chrome.storage에 쓰는 것이 없다(도우미 답·결과는 화면 기억에만)', async () => {
    const t = start({ page, answer })
    await scan(N3, N5)
    await vi.advanceTimersByTimeAsync(10_000)
    act('덮어쓰고 저장 시작').click()
    await vi.advanceTimersByTimeAsync(20_000)
    expect(lead()).toBe('2일을 비트 값으로 저장했어요.')
    expect(t.local.set).not.toHaveBeenCalled()
    expect(t.local.remove).not.toHaveBeenCalled()
    expect(t.local.clear).not.toHaveBeenCalled()
    expect(t.session.set).not.toHaveBeenCalled()
  })

  it('AC-3702.1: [그만두기]면 지금 날을 끝낸 뒤 아무것도 바꾸지 않고 닫으며 단추가 풀린다', async () => {
    const t = start({ page, answer })
    await scan(N3, N5)
    await vi.advanceTimersByTimeAsync(500)
    act('그만두기').click()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(t.asked()).toEqual([N3])
    expect(panel().hidden).toBe(true)
    expect(rangeButton().disabled).toBe(false)
    expect(fillButton().disabled).toBe(false)
    expect(t.page.log).toEqual([])
    expect(t.page.saves).toEqual([])
  })

  it('AC-3703.6: [비트 값 채우기](하루)는 여전히 저장 단추를 누르지 않는다', async () => {
    const t = start({ page: { date: '2026-11-09' }, answer: () => ok(sampleDay()) })
    fillButton().click()
    await flush()
    expect(lead()).toBe('2026-11-09 비트 값으로 93칸을 채웠어요. 저장은 하지 않았어요.')
    expect(t.page.saves).toEqual([])
    expect(t.page.clicks).toEqual([])
  })
})

describe('AC-3702.3 함께 있는 진료', () => {
  const OVERLAP = { visits: 2, carm: 400_000, sono: 300_000 }
  const answer: Answer = (date) => ok(bitDay(date, 84, date === N4 ? OVERLAP : null))
  const writes = (local: { set: { mock: { calls: unknown[][] } } }) =>
    local.set.mock.calls.map(([items]) => (items as Record<string, Settings>)[SETTINGS_KEY])
  const pick = (c: string) => shadow().querySelector<HTMLButtonElement>(`.pb button[data-choice="${c}"]`) as HTMLButtonElement

  it('AC-3702.3: 지난번 고른 것이 없으면 묻고, 고른 것(SONO)을 saveOverlap으로 기억한 뒤 그대로 채운다', async () => {
    const t = start({ answer })
    await scan(N3, N4)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(lines()).toContain('씨암·SONO를 같이 받은 진료가 2건 있어요. 어디에 넣을까요?')
    expect(act('덮어쓰고 저장 시작').disabled).toBe(true)
    pick('sono').click()
    expect(act('덮어쓰고 저장 시작').disabled).toBe(false)
    act('덮어쓰고 저장 시작').click()
    await vi.advanceTimersByTimeAsync(20_000)
    expect(writes(t.local)).toHaveLength(1)
    expect(writes(t.local)[0]).toMatchObject({ v: 1, overlap: 'sono', picks: settingsFirst().picks })
    const n4 = t.page.saves.find((s) => s.which === 'w1' && s.date === N4)
    expect(n4?.state.CARM_AMT).toBe(String(1_001_234 - 400_000))
    expect(n4?.state.SONO_AMT).toBe('2001234')
    expect(lead()).toBe('2일을 비트 값으로 저장했어요.')
  })

  it('AC-3702.3: 지난번 고른 것(씨암)이 있으면 그 줄이 보이고 바로 시작할 수 있으며, 다시 기억하지 않는다', async () => {
    const t = start({ stored: { ...settingsFirst(), overlap: 'carm' }, answer })
    await scan(N3, N4)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(lines()).toContain('씨암·SONO를 같이 받은 진료는 지난번 고른 대로 씨암에 넣어요.')
    act('덮어쓰고 저장 시작').click()
    await vi.advanceTimersByTimeAsync(20_000)
    expect(t.local.set).not.toHaveBeenCalled()
    const n4 = t.page.saves.find((s) => s.which === 'w1' && s.date === N4)
    expect(n4?.state.CARM_AMT).toBe('1001234')
    expect(n4?.state.SONO_AMT).toBe(String(2_001_234 - 300_000))
  })
})

describe('AC-3704.2 [멈추기]·[이어서 하기]', () => {
  it('AC-3704.2: [멈추기]면 지금 날을 저장까지 끝내고 멈추며, [이어서 하기]는 다시 묻지 않고 남은 날부터 간다(확정은 확정 그대로)', async () => {
    const t = start({ page: { days: { [N3]: { status: 'confirmed', values: { TOTAL_FEE: '9' } } } } })
    await scan(N2, N4)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(lines()).toContain('이미 적어 둔 1일도 비트 값으로 바뀌어요. 확정한 날도 바뀌어요.')
    act('덮어쓰고 저장 시작').click()
    await vi.advanceTimersByTimeAsync(500)
    act('멈추기').click()
    expect(text(shadow().querySelector('.pb .acts button'))).toBe('멈추는 중…')
    await vi.advanceTimersByTimeAsync(20_000)
    expect(saved(t.page)).toEqual([`w1 ${N2}`, `w2 ${N2}`])
    expect(lead()).toBe('멈췄어요. 1일 저장했어요.')
    expect(lines()).toContain('남은 날 2일 (11/3 · 11/4)')
    expect(actLabels()).toEqual(['닫기', '이어서 하기'])
    expect(fillButton().disabled).toBe(true)

    act('이어서 하기').click()
    await flush()
    expect(lead()).toBe('3일 중 1일 저장했어요.')
    expect(lines()).toContain('지금: 11월 3일 채우는 중')
    await vi.advanceTimersByTimeAsync(20_000)
    expect(saved(t.page)).toEqual([`w1 ${N2}`, `w2 ${N2}`, `w1 ${N3}`, `w2 ${N3}`, `w1 ${N4}`, `w2 ${N4}`])
    expect(t.page.saves.find((s) => s.date === N3)?.state.STATUS).toBe('confirmed')
    expect(t.page.changes).toEqual([])
    // 다시 살펴보지 않는다: 살펴보기 셋 + 채우기 셋
    expect(t.asked()).toEqual([N2, N3, N4, N2, N3, N4])
    expect(lead()).toBe('3일을 비트 값으로 저장했어요.')
  })
})

describe('AC-3703.3 AC-3703.4 AC-3705.1 저장 못 한 날·건너뛴 날', () => {
  it('AC-3703.3 AC-3703.4 AC-3705.1: 되살린 입력 띠는 건너뛰고, w1 오류면 w2를 누르지 않고, 불러오지 못한 날은 저장 못 한 날이다', async () => {
    const t = start({
      page: {
        days: { [N3]: { draftNotice: true }, [N5]: { loadError: true } },
        saveResult: (which, date) => (which === 'w1' && date === N4 ? 'error' : 'ok'),
      },
    })
    await scan(N2, N5)
    await vi.advanceTimersByTimeAsync(15_000)
    expect(lead()).toBe('11월 2일~5일 중 4일을 비트 값으로 덮어쓰고 저장해요.')
    expect(lines()).toContain('확인하지 못한 날 1일 — 채울 때 다시 불러와요 (11/5)')
    act('덮어쓰고 저장 시작').click()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(saved(t.page)).toEqual([`w1 ${N2}`, `w2 ${N2}`, `w1 ${N4}`])
    expect(lead()).toBe('1일을 비트 값으로 저장했어요.')
    expect(lines()).toEqual(
      expect.arrayContaining([
        '건너뛴 날 1일 — 저장하지 않은 입력이 남은 날 (11/3)',
        '저장 못 한 날 2일',
        '11/4: ERP가 업무일지 1 저장 오류를 알렸어요. 그날을 열어 [비트 값 채우기]로 다시 해 주세요.',
        '11/5: ERP가 그날을 불러오지 못했어요. 그날을 열어 [비트 값 채우기]로 다시 해 주세요.',
      ]),
    )
  })
})

describe('AC-3705.2 AC-3702.5 멈추는 경우', () => {
  it('AC-3705.2: 채우는 도중 새 판 안내 창이 뜨면 다음 날로 가지 않고 멈추고, 창을 닫고 [이어서 하기]면 남은 날부터 간다', async () => {
    let page: ErpPage | null = null
    const t = start({
      page: {
        saveResult: (which, date) => {
          if (which === 'w2' && date === N3) page?.showDialog()
          return 'ok'
        },
      },
    })
    page = t.page
    await scan(N3, N4)
    await vi.advanceTimersByTimeAsync(10_000)
    act('덮어쓰고 저장 시작').click()
    await vi.advanceTimersByTimeAsync(20_000)
    expect(saved(t.page)).toEqual([`w1 ${N3}`, `w2 ${N3}`])
    expect(lead()).toBe('ERP 화면에 안내 창이 떠서 멈췄어요.')
    expect(lines()).toEqual(
      expect.arrayContaining(['ERP 창을 보고 닫은 뒤 [이어서 하기]를 눌러 주세요.', '1일 저장했어요. 남은 1일은 하지 않았어요.']),
    )
    expect(actLabels()).toEqual(['닫기', '이어서 하기'])
    expect(t.page.clicks).not.toContain('지금 업데이트')
    expect(t.page.clicks).not.toContain('현 화면 유지')

    document.querySelector('.dialog-overlay')?.remove()
    act('이어서 하기').click()
    await vi.advanceTimersByTimeAsync(20_000)
    expect(saved(t.page)).toEqual([`w1 ${N3}`, `w2 ${N3}`, `w1 ${N4}`, `w2 ${N4}`])
    expect(lead()).toBe('2일을 비트 값으로 저장했어요.')
  })

  it('AC-3702.5: 살펴보는 중 멈출 일(안내 창)이 생기면 그 까닭 안내이고 승인 안내로 가지 않으며 도우미를 부르지 않는다', async () => {
    const t = start()
    t.page.showDialog()
    await scan(N3, N4)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(lead()).toBe('ERP 화면에 안내 창이 떠서 멈췄어요.')
    expect(lines()).toContain('0일 저장했어요. 남은 2일은 하지 않았어요.')
    expect(actLabels()).toEqual(['닫기', '이어서 하기'])
    expect(t.asked()).toEqual([])
    // 창을 닫고 [이어서 하기]면 다시 살펴보고 승인 안내로 간다
    document.querySelector('.dialog-overlay')?.remove()
    act('이어서 하기').click()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(lead()).toBe('11월 3일~4일 중 2일을 비트 값으로 덮어쓰고 저장해요.')
    expect(t.page.saves).toEqual([])
  })

  it('AC-3702.5 AC-3705.2: 업무일지 2 저장 줄이 없으면 그 까닭으로 멈춘다', async () => {
    start({ page: { noSaveBar: true } })
    await scan(N3, N4)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(lead()).toBe('업무일지 2 저장 줄이 없어 멈췄어요.')
    expect(actLabels()).toEqual(['닫기', '이어서 하기'])
  })

  it('AC-3702.5 AC-3705.2: 읽기 전용(본사 열람)이면 그 까닭으로 멈추고 [이어서 하기]가 없다', async () => {
    start({ page: { readOnly: true } })
    await scan(N3, N4)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(lead()).toBe('이 화면은 읽기 전용이라 저장할 수 없어요(본사 열람 등).')
    expect(actLabels()).toEqual(['닫기'])
  })

  it('AC-3705.2: 도우미 오류면 errors.ts 글로 멈추고 [이어서 하기]가 있다', async () => {
    const t = start({ answer: (date) => (date === N4 ? fail('E-BIT-READ-FAILED') : ok(bitDay(date))) })
    await scan(N3, N4)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(lead()).toBe(explain('E-BIT-READ-FAILED').what)
    expect(actLabels()).toEqual(['닫기', '이어서 하기'])
    expect(t.page.saves).toEqual([])
  })
})

describe('AC-3704.3 화면을 떠나면', () => {
  it('AC-3704.3: 채우는 도중 화면을 떠나면 조용히 끝나 더 저장하지 않고, 돌아오면 [살펴보기]부터다', async () => {
    const t = start()
    await scan(N2, N5)
    await vi.advanceTimersByTimeAsync(10_000)
    act('덮어쓰고 저장 시작').click()
    await vi.advanceTimersByTimeAsync(3_000)
    const before = t.page.saves.length
    expect(before).toBeGreaterThan(0)
    history.pushState(null, '', '/h/closing-calendar')
    t.page.root.remove()
    await vi.advanceTimersByTimeAsync(WATCH_MS)
    expect(document.getElementById(HOST_ID)).toBeNull()

    history.pushState(null, '', '/h/closing')
    const back = mountErpPage(document, { etcNames: ETC_NAMES })
    await vi.advanceTimersByTimeAsync(WATCH_MS)
    expect(document.getElementById(HOST_ID)).not.toBeNull()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(t.page.saves).toHaveLength(before)
    expect(back.saves).toEqual([])
    expect(back.clicks).toEqual([])
    expect(panel().hidden).toBe(true)
    expect(rangeButton().disabled).toBe(false)
    expect(fillButton().disabled).toBe(false)
    rangeButton().click()
    await flush()
    expect(lead()).toBe('채울 기간을 골라 주세요.')
  })
})
