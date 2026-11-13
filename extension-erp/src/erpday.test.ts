// @vitest-environment jsdom
// TASK-2 REQ-3702·3703·3705: ERP 화면 다루기(erpday.ts, design.md 2절)를 넓힌 가짜 ERP 화면(__tests__/erpPage.ts, design.md 7절)으로 시험한다.
// 날짜 바꾸기(setDate)·다 불러옴(waitLoaded)·멈출 일(blocker)·되살린 입력 띠(draftNotice)·마감일지 있음·상태(readJournal)·저장(save).
// 시계는 가짜(vi.useFakeTimers)라 30초 기다림도 바로 끝난다. 숫자는 가짜(환자 정보 없음)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountErpPage, type ErpPageOptions } from './__tests__/erpPage'
import { blocker, draftNotice, readDate, readJournal, save, setDate, todayOnly, waitLoaded } from './erpday'
import { readDate as mainReadDate } from './main'
import { FALLBACK_MS, LOAD_TIMEOUT_MS, SAVE_TIMEOUT_MS, STABLE_MS } from './rangeTypes'

/** 가짜 화면의 처음 마감 일자 */
const D0 = '2026-11-09'
const D1 = '2026-11-03'

beforeEach(() => {
  vi.useFakeTimers()
  history.replaceState({ key: 'k1', idx: 3, usr: { from: 'calendar' } }, '', '/h/closing')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  document.body.innerHTML = ''
  history.replaceState(null, '', '/')
})

const open = (o: ErpPageOptions = {}) => mountErpPage(document, o)
const dateInput = () =>
  [...document.querySelectorAll<HTMLInputElement>('input.datepicker-input')].find((i) => i.getAttribute('aria-label') !== '연도 선택') as HTMLInputElement
const tidy = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()
const buttonByText = (label: string) => [...document.querySelectorAll('button')].find((b) => tidy(b.textContent) === label) as HTMLButtonElement
/** 사람이 고른 것처럼(React가 받는 길) 날짜 칸을 바꾼다: 기본 value 설정 함수 + bubbles input */
function pick(date: string) {
  const input = dateInput()
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, date)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
/** 약속이 끝났는지 보기 */
function track<T>(promise: Promise<T>) {
  const seen: { done: boolean; value?: T } = { done: false }
  void promise.then((value) => {
    seen.done = true
    seen.value = value
  })
  return seen
}
const tick = (ms = 0) => vi.advanceTimersByTimeAsync(ms)
/** 화면에 붙인 쪽지(ERP 쪽지 모양) */
function addToast(kind: 'success' | 'error') {
  const el = document.createElement('div')
  el.className = `toast toast-${kind}`
  el.innerHTML = `<span class="toast-message">${kind === 'success' ? '저장되었습니다.' : '저장 중 오류가 발생했습니다.'}</span>`
  document.body.append(el)
  return el
}
function addLoadingOut() {
  const el = document.createElement('div')
  el.className = 'closing-pdf-out'
  el.textContent = '불러오는 중입니다.'
  document.body.append(el)
  return el
}

describe('AC-3702.1 readDate는 erpday.ts로 옮겼다', () => {
  it('AC-3702.1: main.ts가 다시 내보내는 readDate는 erpday.ts의 것 그대로다', () => {
    expect(mainReadDate).toBe(readDate)
    open()
    expect(readDate(document)).toBe(D0)
  })
})

describe('AC-3702.1 AC-3703.1 setDate: 마감 일자 바꾸기', () => {
  it('AC-3702.1: 날짜 칸에 기본 value 설정 + bubbles input 이벤트로 그날로 바뀌고, focus는 주지 않으며(달력 창) 둘째 길은 쓰지 않는다', async () => {
    const page = open({ days: { [D1]: { status: 'draft' } } })
    const input = dateInput()
    const focused = vi.fn()
    input.addEventListener('focus', focused)
    const replace = vi.spyOn(history, 'replaceState')
    const pops = vi.fn()
    window.addEventListener('popstate', pops)
    try {
      const done = track(setDate(document, D1))
      await tick()
      expect(page.date()).toBe(D1)
      expect(readDate(document)).toBe(D1)
      await tick(FALLBACK_MS)
      expect(done.done).toBe(true)
      expect(focused).not.toHaveBeenCalled()
      expect(document.activeElement).not.toBe(input)
      expect(replace).not.toHaveBeenCalled()
      expect(pops).not.toHaveBeenCalled()
      expect(page.clicks).toEqual([])
    } finally {
      window.removeEventListener('popstate', pops)
    }
  })

  it('AC-3702.1: 날짜 칸으로 안 바뀌면 1초 뒤 history.state.usr.selectDate + popstate로 바꾼다(기록은 안 쌓이고, 주소·다른 state는 그대로)', async () => {
    const page = open({ dateInputOff: true })
    const length = history.length
    const pops = vi.fn()
    window.addEventListener('popstate', pops)
    try {
      const done = track(setDate(document, D1))
      await tick(FALLBACK_MS - 1)
      expect(readDate(document)).toBe(D0)
      expect(history.state).toEqual({ key: 'k1', idx: 3, usr: { from: 'calendar' } })
      expect(pops).not.toHaveBeenCalled()
      await tick(1)
      await tick()
      expect(done.done).toBe(true)
      expect(history.state).toEqual({ key: 'k1', idx: 3, usr: { from: 'calendar', selectDate: D1 } })
      expect(history.length).toBe(length)
      expect(location.pathname).toBe('/h/closing')
      expect(pops).toHaveBeenCalledTimes(1)
      expect(page.date()).toBe(D1)
      expect(readDate(document)).toBe(D1)
    } finally {
      window.removeEventListener('popstate', pops)
    }
  })

  it('AC-3705.2: 화면을 떠났으면(주소가 /h/closing이 아님) 1초 뒤에도 둘째 길을 쓰지 않는다(state·popstate·날 그대로)', async () => {
    const page = open({ dateInputOff: true })
    history.replaceState({ key: 'k2', usr: { from: 'menu' } }, '', '/h/closing-calendar')
    const replace = vi.spyOn(history, 'replaceState')
    const pops = vi.fn()
    window.addEventListener('popstate', pops)
    try {
      const done = track(setDate(document, D1))
      await tick(FALLBACK_MS)
      await tick(FALLBACK_MS)
      expect(done.done).toBe(true)
      expect(replace).not.toHaveBeenCalled()
      expect(pops).not.toHaveBeenCalled()
      expect(history.state).toEqual({ key: 'k2', usr: { from: 'menu' } })
      expect(location.pathname).toBe('/h/closing-calendar')
      expect(page.date()).toBe(D0)
    } finally {
      window.removeEventListener('popstate', pops)
    }
  })

  it('AC-3703.1: history.state가 비어 있어도 둘째 길이 돈다', async () => {
    history.replaceState(null, '', '/h/closing')
    const page = open({ dateInputOff: true })
    await setDateNow(D1)
    expect(history.state).toEqual({ usr: { selectDate: D1 } })
    expect(page.date()).toBe(D1)
  })
})

async function setDateNow(date: string) {
  const done = track(setDate(document, date))
  await tick(FALLBACK_MS)
  await tick()
  expect(done.done).toBe(true)
}

/** 가짜 시계를 돌리며 waitLoaded 결과를 받는다(한도 2초) */
async function runWait(date: string) {
  const result = track(waitLoaded(document, date, 2000))
  await tick(2100)
  expect(result.done).toBe(true)
  return result.value
}

describe('AC-3702.1 AC-3703.1 waitLoaded: 다 불러옴 기다리기', () => {
  it('AC-3702.1: 새 날이 다 그려진 뒤 그 신호가 400ms 이어져야 ok다', async () => {
    open({ loadMs: 1000, days: { [D1]: { status: 'draft' } } })
    pick(D1)
    expect(document.querySelector('.closing-w1-box')).toBeNull()
    const result = track(waitLoaded(document, D1))
    await tick(1000 + STABLE_MS - 1)
    expect(result.done).toBe(false)
    await tick(100)
    expect(result.value).toBe('ok')
  })

  it('AC-3702.1: 다 그려졌다가 다시 불러오는 표시가 나오면 그 뒤로 다시 400ms를 센다', async () => {
    open()
    const result = track(waitLoaded(document, D0))
    await tick(200)
    const out = addLoadingOut()
    await tick(800)
    expect(result.done).toBe(false)
    out.remove()
    await tick(STABLE_MS)
    expect(result.done).toBe(false)
    await tick(200)
    expect(result.value).toBe('ok')
  })

  it.each<[string, () => void]>([
    ['날짜가 고른 날과 다름', () => {}],
    ["'.closing-pdf-out' 안에 '불러오는 중입니다.'", () => void addLoadingOut()],
    ["'전체 저장'이 막힘(불러온 날 ≠ 고른 날)", () => void (buttonByText('전체 저장').disabled = true)],
    ["업무일지 2 '로딩 중...'", () => {
      const empty = document.createElement('div')
      empty.className = 'cdf-empty'
      empty.textContent = '로딩 중...'
      document.querySelector('#closing-panel-w2')?.append(empty)
    }],
    ['업무일지 1 탭인데 칸 묶음(.closing-w1-box)이 없음', () => document.querySelectorAll('.closing-w1-box').forEach((el) => el.remove())],
  ])('AC-3702.1: %s이면 ok가 아니라 시간이 넘어 timeout이다', async (name, spoil) => {
    open()
    spoil()
    const date = name.startsWith('날짜') ? D1 : D0
    const result = track(waitLoaded(document, date, 2000))
    await tick(1999)
    expect(result.done).toBe(false)
    await tick(100)
    expect(result.value).toBe('timeout')
  })

  it('AC-3703.4: 끝내 안 그려지면(loadMs never) 30초 뒤 timeout이다', async () => {
    open({ loadMs: 'never' })
    pick(D1)
    expect(LOAD_TIMEOUT_MS).toBe(30_000)
    const result = track(waitLoaded(document, D1))
    await tick(LOAD_TIMEOUT_MS - 1)
    expect(result.done).toBe(false)
    await tick(100)
    expect(result.value).toBe('timeout')
  })

  it('AC-3703.4: 불러오기 오류(.load-state-error)가 400ms 이어지면 error다', async () => {
    open({ days: { [D1]: { loadError: true } } })
    pick(D1)
    const result = track(waitLoaded(document, D1))
    await tick(STABLE_MS + 200)
    expect(document.querySelector('.load-state-error')).not.toBeNull()
    expect(result.value).toBe('error')
  })

  it('AC-3702.1: 업무일지 2 탭이면 1 탭을 누르고, 1 칸이 그려진 뒤 ok다', async () => {
    const page = open({ tab: 'w2' })
    const result = track(waitLoaded(document, D0))
    await tick(STABLE_MS + 200)
    expect(page.clicks).toEqual(['closing-tab-w1'])
    expect(page.tab()).toBe('w1')
    expect(result.value).toBe('ok')
  })

  it('AC-3702.1: 1 탭이면 아무것도 누르지 않는다', async () => {
    const page = open()
    const result = track(waitLoaded(document, D0))
    await tick(STABLE_MS + 200)
    expect(result.value).toBe('ok')
    expect(page.clicks).toEqual([])
  })
})

describe('AC-3705.2 blocker: 멈출 일과 차례', () => {
  it('AC-3705.2: 보통 화면이면 없음이다', () => {
    open()
    expect(blocker(document)).toBeNull()
  })

  it('AC-3705.2: ERP 안내 창(.dialog-overlay, 크기 있음)이 보이면 dialog, 크기 없는 것은 세지 않는다', () => {
    const page = open()
    const hidden = document.createElement('div')
    hidden.className = 'dialog-overlay'
    document.body.append(hidden)
    expect(blocker(document)).toBeNull()
    const shown = page.showDialog()
    expect(blocker(document)).toEqual({ kind: 'dialog' })
    shown.remove()
    expect(blocker(document)).toBeNull()
  })

  it("AC-3705.2: 날짜 칸 없이 '(오늘)' 글자(원무 권한)이면 todayOnly", () => {
    open({ todayOnly: true, date: '2026-11-10' })
    expect(blocker(document)).toEqual({ kind: 'todayOnly' })
  })

  it('AC-3705.2: 칸 묶음·표를 품은 fieldset[disabled](본사 열람)이면 readOnly — 저장 줄이 없어도 readOnly가 먼저', () => {
    open({ readOnly: true })
    expect(document.querySelector('.cdf-save-bar')).toBeNull()
    expect(blocker(document)).toEqual({ kind: 'readOnly' })
  })

  it('AC-3705.2: 업무일지 2 저장 줄(.cdf-save-bar)이 없으면 noSaveBar', () => {
    open({ noSaveBar: true })
    expect(blocker(document)).toEqual({ kind: 'noSaveBar' })
  })

  it('AC-3705.2: 차례는 dialog → todayOnly → readOnly → noSaveBar', () => {
    const page = open({ todayOnly: true, readOnly: true, noSaveBar: true })
    const dialog = page.showDialog()
    expect(blocker(document)).toEqual({ kind: 'dialog' })
    dialog.remove()
    expect(blocker(document)).toEqual({ kind: 'todayOnly' })
    document.body.innerHTML = ''
    open({ readOnly: true, noSaveBar: true })
    expect(blocker(document)).toEqual({ kind: 'readOnly' })
  })

  const saveCount = (label: string, inside: (b: HTMLButtonElement) => boolean) =>
    [...document.querySelectorAll('button')].filter((b) => tidy(b.textContent) === label && inside(b)).length
  const w1Count = () => saveCount('전체 저장', (b) => !b.closest('#closing-panel-w2'))
  const w2Count = () => saveCount('일일 상세 저장', (b) => Boolean(b.closest('.cdf-save-bar')))

  it.each<[string, ErpPageOptions['saveButtons'], number, number]>([
    ["'전체 저장' 0개", { w1: 0 }, 0, 1],
    ["'전체 저장' 2개", { w1: 2 }, 2, 1],
    ["'일일 상세 저장' 0개(저장 줄은 있음)", { w2: 0 }, 1, 0],
    ["'일일 상세 저장' 2개", { w2: 2 }, 1, 2],
  ])('AC-3705.2: %s이면 noSaveButton(저장 단추가 하나씩이 아님), 그래도 다 불러옴은 ok다', async (_name, saveButtons, w1, w2) => {
    const page = open({ saveButtons })
    expect([w1Count(), w2Count()]).toEqual([w1, w2])
    expect(document.querySelector('.cdf-save-bar')).not.toBeNull()
    expect(await runWait(D0)).toBe('ok')
    expect(blocker(document)).toEqual({ kind: 'noSaveButton' })
    expect(page.clicks).toEqual([])
  })

  it("AC-3705.2: 업무일지 2 영역 안 '전체 저장'·저장 줄 밖 '일일 상세 저장'은 세지 않고, 글자는 앞뒤 공백을 정리해 똑같을 때만 센다", () => {
    open()
    const w2Panel = document.querySelector('#closing-panel-w2') as HTMLElement
    const extra = (label: string, into: Element) => {
      const b = document.createElement('button')
      b.textContent = label
      into.append(b)
    }
    extra('전체 저장', w2Panel)
    extra('일일 상세 저장', document.body)
    extra('  전체 저장 다시  ', document.body)
    expect(blocker(document)).toBeNull()
    document.body.innerHTML = ''
    open({ saveButtons: { w1: 0 } })
    extra('전체 저장', document.querySelector('#closing-panel-w2') as HTMLElement)
    expect(blocker(document)).toEqual({ kind: 'noSaveButton' })
    document.body.innerHTML = ''
    open({ saveButtons: { w1: 0 } })
    extra('\n  전체 저장  ', document.body)
    expect(blocker(document)).toBeNull()
  })

  it('AC-3705.2: noSaveButton은 차례 맨 끝이다(dialog·todayOnly·readOnly·noSaveBar가 먼저)', () => {
    const page = open({ saveButtons: { w1: 2, w2: 0 } })
    const dialog = page.showDialog()
    expect(blocker(document)).toEqual({ kind: 'dialog' })
    dialog.remove()
    expect(blocker(document)).toEqual({ kind: 'noSaveButton' })
    document.body.innerHTML = ''
    open({ todayOnly: true, saveButtons: { w1: 0 } })
    expect(blocker(document)).toEqual({ kind: 'todayOnly' })
    document.body.innerHTML = ''
    open({ readOnly: true, saveButtons: { w1: 2 } })
    expect(blocker(document)).toEqual({ kind: 'readOnly' })
    document.body.innerHTML = ''
    open({ noSaveBar: true, saveButtons: { w1: 0 } })
    expect(blocker(document)).toEqual({ kind: 'noSaveBar' })
  })
})

describe('AC-3705.2 todayOnly: 원무 권한 화면', () => {
  it("AC-3705.2: 날짜 칸 없이 '(오늘)' 글자면 true, 날짜 칸 화면·날짜를 아직 안 고른 화면이면 false", () => {
    open({ todayOnly: true, date: '2026-11-10' })
    expect(todayOnly(document)).toBe(true)
    document.body.innerHTML = ''
    open()
    expect(todayOnly(document)).toBe(false)
    document.body.innerHTML = ''
    open({ date: null })
    expect(readDate(document)).toBeNull()
    expect(todayOnly(document)).toBe(false)
    document.body.innerHTML = ''
    expect(todayOnly(document)).toBe(false)
  })

  it('AC-3705.2: ERP 안내 창이 떠 있어도 true다(blocker는 dialog가 먼저)', () => {
    const page = open({ todayOnly: true, date: '2026-11-10' })
    page.showDialog()
    expect(todayOnly(document)).toBe(true)
    expect(blocker(document)).toEqual({ kind: 'dialog' })
  })
})

describe('AC-3703.4 draftNotice: 되살린 입력 띠', () => {
  it("AC-3703.4: '저장하지 않은 입력을 되살렸습니다' 띠(.journal-draft-notice)가 있으면 true, 없으면 false", async () => {
    open({ days: { [D0]: { status: 'draft', draftNotice: true } } })
    expect(draftNotice(document)).toBe(true)
    pick(D1)
    expect(await runWait(D1)).toBe('ok')
    expect(draftNotice(document)).toBe(false)
  })

  it('AC-3703.4: hidden인 띠는 세지 않는다', () => {
    open({ days: { [D0]: { draftNotice: true } } })
    ;(document.querySelector('.journal-draft-notice') as HTMLElement).hidden = true
    expect(draftNotice(document)).toBe(false)
  })
})

describe('AC-3702.1 readJournal: 그날 마감일지 있음·상태', () => {
  it("AC-3702.1: '마감일지 삭제' 단추가 없으면 없는 날(상태 null)", () => {
    open({ days: {} })
    expect(readJournal(document)).toEqual({ exists: false, status: null })
  })

  it("AC-3702.1: 있으면 '상태' select 값(작성중 draft · 확정 confirmed)", () => {
    open({ days: { [D0]: { status: 'draft' } } })
    expect(readJournal(document)).toEqual({ exists: true, status: 'draft' })
    document.body.innerHTML = ''
    open({ days: { [D0]: { status: 'confirmed' } } })
    expect(readJournal(document)).toEqual({ exists: true, status: 'confirmed' })
  })

  it('AC-3702.1: 상태 값이 둘 밖이면 null', () => {
    open({ days: { [D0]: { status: 'draft' } } })
    const select = document.querySelector('select') as HTMLSelectElement
    select.append(new Option('보류', 'hold'))
    select.value = 'hold'
    expect(readJournal(document)).toEqual({ exists: true, status: null })
  })

  it('AC-3702.1: 날을 바꾸면 그날 것으로 읽는다(옮긴 날 마감일지 있음·확정, 돌아온 날 없음)', async () => {
    const page = open({ days: { [D1]: { status: 'confirmed', values: { NEW_PATIENT: '5' } } } })
    expect(readJournal(document)).toEqual({ exists: false, status: null })
    await setDateNow(D1)
    expect(await runWait(D1)).toBe('ok')
    expect(readJournal(document)).toEqual({ exists: true, status: 'confirmed' })
    expect(page.state.NEW_PATIENT).toBe('5')
    expect(page.dom('NEW_PATIENT')).toEqual(['5'])
    await setDateNow(D0)
    expect(await runWait(D0)).toBe('ok')
    expect(readJournal(document)).toEqual({ exists: false, status: null })
    expect(page.state.NEW_PATIENT).toBe('')
    expect(page.changes).toEqual([])
  })
})

describe('AC-3703.3 save: 저장 단추 누르고 쪽지 보기', () => {
  it("AC-3703.3: w1은 '전체 저장'을 한 번 누르고, 새 성공 쪽지 + 단추 글자가 돌아오면 ok다", async () => {
    const page = open({ days: { [D0]: { status: 'confirmed' } }, saveMs: 3000 })
    const result = track(save(document, 'w1'))
    await tick(2900)
    expect(result.done).toBe(false)
    expect(buttonByText('저장 중...')).toBeDefined()
    await tick(300)
    expect(result.value).toBe('ok')
    expect(page.clicks).toEqual(['전체 저장'])
    expect(page.saves).toEqual([{ which: 'w1', date: D0, state: expect.objectContaining({ STATUS: 'confirmed' }) }])
    expect(page.state.STATUS).toBe('confirmed')
    expect(page.changes).toEqual([])
  })

  it("AC-3703.1: w1은 누르기 전에 업무일지 1 탭으로 간다(1 저장 카드는 1 탭에만)", async () => {
    const page = open({ tab: 'w2' })
    expect(buttonByText('전체 저장')).toBeUndefined()
    expect(await runSave('w1')).toBe('ok')
    expect(page.clicks).toEqual(['closing-tab-w1', '전체 저장'])
  })

  it("AC-3703.3: w2는 숨은 2 탭의 '일일 상세 저장'을 누른다(탭은 그대로)", async () => {
    const page = open()
    expect((document.querySelector('#closing-panel-w2') as HTMLElement).hidden).toBe(true)
    expect(await runSave('w2')).toBe('ok')
    expect(page.clicks).toEqual(['일일 상세 저장'])
    expect(page.tab()).toBe('w1')
    expect(page.saves.map((s) => [s.which, s.date])).toEqual([['w2', D0]])
  })

  it.each(['w1', 'w2'] as const)('AC-3703.3: %s 오류 쪽지(.toast-error)면 error다', async (which) => {
    const page = open({ saveResult: (w) => (w === which ? 'error' : 'ok') })
    const result = track(save(document, which))
    await tick(200)
    expect(result.value).toBe('error')
    expect(document.querySelector('.toast-error')).not.toBeNull()
    expect(page.saves.map((s) => s.which)).toEqual([which])
  })

  it.each(['w1', 'w2'] as const)('AC-3703.3: %s 30초 안에 답이 없으면 timeout이다', async (which) => {
    open({ saveResult: () => 'never' })
    expect(SAVE_TIMEOUT_MS).toBe(30_000)
    const result = track(save(document, which))
    await tick(SAVE_TIMEOUT_MS - 1)
    expect(result.done).toBe(false)
    await tick(100)
    expect(result.value).toBe('timeout')
  })

  it('AC-3703.3: 누르기 전부터 있던 쪽지(성공·오류)는 세지 않는다', async () => {
    open({ saveResult: () => 'never' })
    addToast('success')
    addToast('error')
    const result = track(save(document, 'w1', 2000))
    await tick(2100)
    expect(result.value).toBe('timeout')
  })

  it("AC-3703.3: 성공 쪽지가 떠도 단추 글자가 '저장 중...'인 동안은 ok가 아니다", async () => {
    open({ saveResult: () => 'never' })
    const result = track(save(document, 'w1'))
    await tick(200)
    const busy = buttonByText('저장 중...')
    expect(busy).toBeDefined()
    addToast('success')
    await tick(1000)
    expect(result.done).toBe(false)
    busy.textContent = '전체 저장'
    await tick(200)
    expect(result.value).toBe('ok')
  })

  it('AC-3703.3: 성공과 오류 쪽지가 함께 새로 뜨면 error다', async () => {
    open({ saveResult: () => 'never' })
    const result = track(save(document, 'w2'))
    await tick(100)
    buttonByText('저장 중...').textContent = '일일 상세 저장'
    addToast('success')
    addToast('error')
    await tick(200)
    expect(result.value).toBe('error')
  })

  it("AC-3703.3: 저장 단추가 없으면(저장 줄 없음) missing이고 아무것도 누르지 않는다", async () => {
    const page = open({ noSaveBar: true })
    expect(await runSave('w2')).toBe('missing')
    expect(page.clicks).toEqual([])
    expect(page.saves).toEqual([])
  })

  it.each([
    ['w1', '전체 저장'],
    ['w2', '일일 상세 저장'],
  ] as const)('AC-3703.3: %s 단추(%s)가 막혀 있으면 missing이고 누르지 않는다', async (which, label) => {
    const page = open()
    const btn = buttonByText(label)
    btn.disabled = true
    const click = vi.spyOn(btn, 'click')
    expect(await runSave(which)).toBe('missing')
    expect(click).not.toHaveBeenCalled()
    expect(page.clicks).toEqual([])
  })

  it('AC-3703.3: 읽기 전용(fieldset[disabled] 안 단추·저장 줄 없음)이면 둘 다 missing이고 누르지 않는다', async () => {
    const page = open({ readOnly: true })
    const click = vi.spyOn(buttonByText('전체 저장'), 'click')
    expect(await runSave('w1')).toBe('missing')
    expect(await runSave('w2')).toBe('missing')
    expect(click).not.toHaveBeenCalled()
    expect(page.clicks).toEqual([])
  })
})

async function runSave(which: 'w1' | 'w2') {
  const result = track(save(document, which))
  await tick(3000)
  expect(result.done).toBe(true)
  return result.value
}

describe('AC-3703.2 누르는 단추는 탭·두 저장뿐', () => {
  it('AC-3703.2: 2 탭 화면에서 하루를 다 돌아도 누른 것은 1 탭·전체 저장·일일 상세 저장뿐이고 상태 select는 바뀌지 않는다', async () => {
    const page = open({ tab: 'w2', loadMs: 500, days: { [D1]: { status: 'confirmed', values: { NEW_PATIENT: '3' } } } })
    await setDateNow(D1)
    expect(await runWait(D1)).toBe('ok')
    expect(blocker(document)).toBeNull()
    expect(draftNotice(document)).toBe(false)
    expect(readJournal(document)).toEqual({ exists: true, status: 'confirmed' })
    expect(await runSave('w1')).toBe('ok')
    expect(await runSave('w2')).toBe('ok')
    // 2 저장 뒤 ERP가 다시 불러온다: 끝날 때까지 기다릴 수 있다
    expect(await runWait(D1)).toBe('ok')
    expect(readJournal(document)).toEqual({ exists: true, status: 'confirmed' })
    expect(page.clicks.every((c) => ['closing-tab-w1', 'closing-tab-w2', '전체 저장', '일일 상세 저장'].includes(c))).toBe(true)
    expect(page.clicks.filter((c) => c.endsWith('저장'))).toEqual(['전체 저장', '일일 상세 저장'])
    expect(page.saves.map((s) => [s.which, s.date, s.state.STATUS, s.state.NEW_PATIENT])).toEqual([
      ['w1', D1, 'confirmed', '3'],
      ['w2', D1, 'confirmed', '3'],
    ])
    expect(page.changes).toEqual([])
    expect(page.state.STATUS).toBe('confirmed')
  })

  it('AC-3703.2: 처음 저장한 날은 그 뒤 마감일지가 있는 날(작성중)로 읽힌다', async () => {
    const page = open({ days: {} })
    expect(readJournal(document)).toEqual({ exists: false, status: null })
    expect(await runSave('w1')).toBe('ok')
    expect(readJournal(document)).toEqual({ exists: true, status: 'draft' })
    expect(page.clicks).toEqual(['전체 저장'])
  })
})
