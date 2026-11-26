// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RoleProvider } from '@/components/shell/role'
import type { GEvent } from '@/lib/calendar/gshapes'
import { GcalCallError, type GcalReply } from '@/lib/gcal/client'
import { createMemoryStore, type GcalCaller, type GcalDeps } from '@/lib/gcal/deps'
import { DEFAULT_GCAL_RULES, type GcalLink } from '@/types/gcal'
import { ImportPreview, type ImportPreviewProps } from './ImportPreview'
import { CAL_NAME, EVENTS, KINDS, LOOK, NOW_ISO, PEOPLE, STAFF } from './testData'

// 설정 › 구글 캘린더 › 처음 가져오기 미리 보기(처음 잇기 ③) (spec google-link REQ-8530 AC-8530.1~AC-8530.4, notes-calendar `import`, 시안 calendar.html ?s=import·import-past).
// 읽기·적기는 lib/gcal/importRead(TASK-12)를 그대로 부른다 — 구글은 가짜 부르기(list 한 쪽), DB는 메모리 저장(createMemoryStore).
// 글은 notes-calendar 글자를 그대로 적고 { } 자리에만 이 시험 자료의 숫자·낱말을 넣어 견준다. 환자 이름은 지어낸 값

afterEach(cleanup)

const SCRIPT = 'https://script.google.com/macros/s/AKfycbFake0123456789abc/exec'
const LINK: GcalLink = {
  scriptUrl: SCRIPT,
  secret: 'FakeKey_0123456789-abcdefABCDEF-xyz',
  calendarId: 'cal-yangji@group.calendar.google.com',
  calendarName: CAL_NAME,
  defaultHex: '#3366CC',
  linkedOn: null,
  rules: { ...DEFAULT_GCAL_RULES },
  look: LOOK,
}

const wire = (e: GEvent) => ({ ...e })

function rig(events: GEvent[] = EVENTS, fail: GcalCallError | null = null) {
  const now = () => new Date(NOW_ISO)
  const mem = createMemoryStore({ now, link: LINK, parts: { staff: STAFF, kinds: KINDS, people: PEOPLE } })
  const calls: { action: string; body: Record<string, unknown> }[] = []
  let failNext = fail
  const call: GcalCaller = async (_link, action, body = {}) => {
    calls.push({ action, body })
    if (failNext) {
      const err = failNext
      failNext = null
      throw err
    }
    const reply: GcalReply = { ok: true, version: '1', now: NOW_ISO }
    if (action === 'list') return { ...reply, events: events.map(wire), next: null }
    return reply
  }
  const deps: GcalDeps = { hospitalId: '00000000-0000-4000-8000-000000000001', call, store: mem.store, now }
  return { mem, deps, calls }
}

function setup(over: Partial<ImportPreviewProps> = {}, wrap: (node: ReactNode) => ReactNode = (n) => n, r = rig()) {
  const onBack = vi.fn()
  const onDone = vi.fn()
  const props: ImportPreviewProps = { deps: r.deps, onBack, onDone, ...over }
  const view = render(<>{wrap(<ImportPreview {...props} />)}</>)
  return { ...view, ...r, onBack, onDone }
}

const ready = () => screen.findByRole('heading', { name: '처음 가져오기 미리 보기' }).then(() => screen.findByTestId('import-rows-scroll'))
const flat = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
// 칸 안 줄들(자식 요소마다)을 한 칸 띄어 잇는다
const parts = (el: Element | null | undefined) => [...(el?.children ?? [])].map((c) => flat(c)).join(' ')
const card = (k: string) => parts(document.querySelector(`[data-card="${k}"]`))
const bar = () => flat(document.querySelector('[data-import-bar] p'))
const line = (key: string) => document.querySelector<HTMLTableRowElement>(`tr[data-row="${key}"]`)
const pick = (key: string, index: number, value: string) => {
  const select = line(key)!.querySelectorAll('select')[index]!
  fireEvent.change(select, { target: { value } })
}

describe('AC-8530.1 처음 가져오기 미리 보기 화면 글', () => {
  it('AC-8530.1: 제목 · 읽은 때 · 설명이 notes-calendar `import` 그대로다({ }는 고른 캘린더·읽은 시각·지난 1년 첫날)', async () => {
    const { calls } = setup()
    await ready()
    const head = screen.getByRole('heading', { name: '처음 가져오기 미리 보기' }).parentElement
    expect(flat(head)).toBe('처음 가져오기 미리 보기2026 양지바른정형외과 · 11/23 (월) 08:52에 읽음')
    expect(flat(document.querySelector('[data-import-lead]'))).toBe(
      '고른 캘린더에 있는 지난 1년(2025-11-23부터 어제까지)과 앞으로(오늘 0시부터)의 구글 일정을 웹앱 칸으로 알아봤어요. 웹앱은 1년 지난 예약을 저절로 지우니 그보다 오래된 일정은 가져오지 않아요. [가져오기]를 누르기 전에는 웹앱도 구글도 바뀌지 않아요. 가져와도 구글 일정의 제목·색은 그대로 둬요.',
    )
    // 읽기만 했다(구글에는 list만)
    expect(calls.map((c) => c.action)).toEqual(['list'])
  })

  it('AC-8530.1: 카드 다섯 — 지난 1년 · 앞으로 · 알아봄 · 고쳐야 함 · 가져오지 않음', async () => {
    setup()
    await ready()
    expect(card('past')).toBe('지난 1년 6개 예약 6 · 하루 종일 0 한 번만 옮겨 와요 · 도착은 비트 PC가 채움')
    expect(card('future')).toBe('앞으로 13개 예약 9 · 하루 종일 4 가져온 뒤 양쪽으로 맞춰요')
    expect(card('known')).toBe('알아봄 11개 그대로 가져와요 구글 색·설정으로 알아본 1개 포함')
    expect(card('fix')).toBe('고쳐야 함 8개 노란 칸에서 골라요 안 골라도 가져오기는 돼요')
    expect(card('skip')).toBe('가져오지 않음 0개 구글에만 남아요')
  })

  it('AC-8530.1: 파란 안내 띠와 [고쳐야 할 것만 보기]', async () => {
    setup()
    await ready()
    const band = document.querySelector('[data-nostaff-band]')
    expect(parts(band?.querySelector('[data-band-text]'))).toBe(
      "시행자 글이 없는 예약 · 지난 1년 3개(충격파 2개 등)는 시행자 없이 가져와요 — 고쳐야 할 것에 넣지 않아요. 앞으로의 예약 2개(충격파, 도수)는 아래 표에서 하나씩 시행자를 골라요. '시행자 글이 없는 종류'는 ② 시행자·종류에서 정해요(지금: 충격파).",
    )
    fireEvent.click(within(band as HTMLElement).getByRole('button', { name: '고쳐야 할 것만 보기' }))
    expect(screen.getByRole('button', { name: '고쳐야 할 것 8' }).getAttribute('aria-pressed')).toBe('true')
    const shown = [...document.querySelectorAll('tr[data-row]')].map((tr) => tr.getAttribute('data-row'))
    expect(shown.sort()).toEqual(['evfut02', 'evfut04', 'evfut05', 'evfut06', 'evfut07', 'evfut08', 'evfut11', 'evfut13'])
  })

  it("AC-8530.1: 거르기 넷(기본 '앞으로')과 '어디서 알아봤나' 안내", async () => {
    setup()
    await ready()
    const filters = screen.getByRole('group', { name: '거르기' })
    expect(within(filters).getAllByRole('button').map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([
      ['앞으로 13', 'true'],
      ['지난 1년 6', 'false'],
      ['고쳐야 할 것 8', 'false'],
      ['하루 종일 4', 'false'],
    ])
    expect(parts(document.querySelector('[data-legend]'))).toBe('어디서 알아봤나 표시 없음 = 제목 글 구글 색 일정 색 설정 종류 글이 없는 예약 고름 여기서 고름')
    // 앞으로 = 오늘 0시부터의 줄만
    const shown = [...document.querySelectorAll('tr[data-row]')].map((tr) => tr.getAttribute('data-row'))
    expect(shown).toHaveLength(13)
    expect(shown.every((k) => k!.startsWith('evfut'))).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '하루 종일 4' }))
    expect([...document.querySelectorAll('tr[data-row]')].map((tr) => tr.getAttribute('data-row'))).toEqual(['evfut09', 'evfut10', 'evfut11', 'evfut12'])
  })

  it('AC-8530.1: 표 아래 글 · 아래 띠 · [← 시행자·종류 고치기][가져오기]', async () => {
    const { onBack } = setup()
    await ready()
    expect(flat(document.querySelector('[data-table-hint]'))).toBe(
      "길이는 구글 일정의 시작·끝 시각으로 정해요(제목의 '50분' 같은 글은 보지 않아요). 시작은 5분 단위로 받아요(09:15처럼). 여러 날 하루 종일 일정은 날마다 따로 넣어요. 괄호 안 글은 메모로 넣어요. 취소 색(토마토) 일정은 '취소'로, 변경 색(흑연) 일정은 '변경' 표시를 붙여 가져와요.",
    )
    expect(bar()).toBe(
      "가져오면 알아본 11개(지난 1년 + 앞으로)를 웹앱에 넣어요. 지난 1년은 한 번만 옮기고, 앞으로의 예약은 그때부터 2분마다 양쪽으로 맞춰요. 지난 예약의 도착은 비트 PC가 그날 비트 접수를 보고 최근 날부터 채워요. 고쳐야 할 8개는 가져오지 않고 예약 탭 '고쳐야 할 구글 예약'에 남겨요(나중에 골라도 돼요).",
    )
    // '… 아래로 {n}개 더 있어요'는 시안 전용 글이라 없다(design.md 2절 표 14)
    expect(document.body.textContent).not.toContain('더 있어요')
    fireEvent.click(screen.getByRole('button', { name: '← 시행자·종류 고치기' }))
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: '가져오기' })).toBeTruthy()
  })

  it('AC-8530.1: 읽는 동안은 불러오는 중, 읽지 못하면 오류 카드와 [다시 시도]', async () => {
    const r = rig(EVENTS, new GcalCallError('E-GCAL-KEY'))
    setup({}, (n) => n, r)
    expect(screen.getByText('불러오는 중')).toBeTruthy()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('E-GCAL-KEY')
    expect(screen.queryByRole('button', { name: '가져오기' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    await ready()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(r.calls.map((c) => c.action)).toEqual(['list', 'list'])
  })

  it('AC-8530.1: 데스크는 보기만 — 고르기·[가져오기]가 막힌다', async () => {
    setup({}, (n) => <RoleProvider desk>{n}</RoleProvider>)
    await ready()
    expect([...line('evfut02')!.querySelectorAll('select')].every((s) => s.disabled)).toBe(true)
    expect((screen.getByRole('button', { name: '가져오기' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('AC-8530.2 [지난 1년] 거르기', () => {
  it("AC-8530.2: [지난 1년]을 누르면 파란 상자 글과 날짜 줄 '지난 예약 · 한 번만 옮겨 와요'가 보인다", async () => {
    setup()
    await ready()
    expect(document.querySelector('[data-past-note]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '지난 1년 6' }))
    expect(screen.getByRole('button', { name: '지난 1년 6' }).getAttribute('aria-pressed')).toBe('true')
    expect(flat(document.querySelector('[data-past-note]'))).toBe(
      '지난 예약은 처음 한 번만 옮겨 와요. 그 뒤로는 구글과 맞추지 않아요(웹앱에서 고쳐도 구글로 보내지 않고, 구글에서 고쳐도 받아 오지 않아요). 도착(왔음·안 옴)은 가져온 뒤 비트 PC가 그날 비트 접수를 보고 저절로 채워요 — 최근 날부터 조금씩 채우고, 다 채우면 예약 탭에 알려요. 차트번호가 없는 예약(신환)은 비트 접수와 맞출 수 없어 도착을 비워 둬요. 시행자 글이 없는 지난 예약 3개는 시행자 없이 가져와요(고쳐야 할 것에 넣지 않아요).',
    )
    const days = [...document.querySelectorAll('tr[data-day]')].map((tr) => tr.textContent)
    expect(days).toEqual([
      '2025년 12월 1일 (월) · 지난 예약 · 한 번만 옮겨 와요',
      '1월 2일 (금) · 지난 예약 · 한 번만 옮겨 와요',
      '11월 20일 (금) · 지난 예약 · 한 번만 옮겨 와요',
      '11월 21일 (토) · 지난 예약 · 한 번만 옮겨 와요',
    ])
    expect([...document.querySelectorAll('tr[data-row]')]).toHaveLength(6)
    // 다른 거르기로 가면 파란 상자는 닫힌다
    fireEvent.click(screen.getByRole('button', { name: '앞으로 13' }))
    expect(document.querySelector('[data-past-note]')).toBeNull()
  })
})

describe('AC-8530.3 노란 칸 고르기 · 가져오지 않기 · 되돌리기', () => {
  it("AC-8530.3: 노란 칸을 고르면 '✓ 고름'이 되고 알아봄·고쳐야 함·아래 띠 숫자가 바뀐다", async () => {
    setup()
    await ready()
    pick('evfut02', 0, 'staff:won')
    expect(flat(line('evfut02')!.querySelector('td'))).toBe('✓ 고름')
    expect(card('known')).toBe('알아봄 12개 그대로 가져와요 구글 색·설정으로 알아본 1개 포함')
    expect(card('fix')).toBe('고쳐야 함 7개 노란 칸에서 골라요 안 골라도 가져오기는 돼요')
    expect(bar()).toContain('가져오면 알아본 12개(지난 1년 + 앞으로)를 웹앱에 넣어요.')
    expect(bar()).toContain('고쳐야 할 7개는 가져오지 않고')
    // 고를 거리가 둘인 줄은 둘 다 골라야 고름
    pick('evfut13', 0, 'len:30')
    expect(flat(line('evfut13')!.querySelector('td'))).toBe('! 고쳐야 함')
    pick('evfut13', 1, 'staff:ho')
    expect(flat(line('evfut13')!.querySelector('td'))).toBe('✓ 고름')
    expect(card('fix')).toBe('고쳐야 함 6개 노란 칸에서 골라요 안 골라도 가져오기는 돼요')
  })

  it("AC-8530.3: '가져오지 않기'를 고르면 '구글에만 두고 웹앱은 건드리지 않아요'이고 아래 띠에 '가져오지 않기로 한 {n}개는 구글에만 둬요.'가 더해지며, 되돌리기가 된다", async () => {
    setup()
    await ready()
    pick('evfut05', 0, 'skip')
    expect(flat(line('evfut05')!.querySelector('td'))).toBe('가져오지 않음')
    expect(flat(line('evfut05')!.querySelector('[data-skip]'))).toBe('구글에만 두고 웹앱은 건드리지 않아요')
    expect(card('skip')).toBe('가져오지 않음 1개 구글에만 남아요')
    expect(card('fix')).toBe('고쳐야 함 7개 노란 칸에서 골라요 안 골라도 가져오기는 돼요')
    expect(bar().endsWith("(나중에 골라도 돼요). 가져오지 않기로 한 1개는 구글에만 둬요.")).toBe(true)
    // 되돌리기: '고르기'로 돌리면 다시 고쳐야 함
    pick('evfut05', 0, '')
    expect(flat(line('evfut05')!.querySelector('td'))).toBe('! 고쳐야 함')
    expect(card('skip')).toBe('가져오지 않음 0개 구글에만 남아요')
    expect(bar()).not.toContain('가져오지 않기로 한')
    // 고른 값도 '고르기'로 되돌린다
    pick('evfut02', 0, 'staff:won')
    pick('evfut02', 0, '')
    expect(flat(line('evfut02')!.querySelector('td'))).toBe('! 고쳐야 함')
    expect(card('fix')).toBe('고쳐야 함 8개 노란 칸에서 골라요 안 골라도 가져오기는 돼요')
  })

  it('AC-8530.3: 고쳐야 할 것만 보기에서 고른 줄도 그 자리에 남는다(거르기 숫자는 처음 숫자 그대로)', async () => {
    setup()
    await ready()
    fireEvent.click(screen.getByRole('button', { name: '고쳐야 할 것 8' }))
    pick('evfut02', 0, 'staff:hyun')
    pick('evfut05', 0, 'skip')
    expect(line('evfut02')).not.toBeNull()
    expect(line('evfut05')).not.toBeNull()
    expect(screen.getByRole('button', { name: '고쳐야 할 것 8' }).getAttribute('aria-pressed')).toBe('true')
  })
})

describe('AC-8530.4 [가져오기]', () => {
  it('AC-8530.4: 누르면 고른 것과 함께 가져오고 알림이 notes-calendar 글 그대로다', async () => {
    const { mem, onDone } = setup()
    await ready()
    pick('evfut02', 0, 'staff:won')
    pick('evfut05', 0, 'skip')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '가져오기' }))
    })
    const text = '가져왔어요. 12개를 넣었어요 · 고쳐야 할 6개는 예약 탭에 남겼어요. 이제 2분마다 맞추고, 지난 예약 도착은 비트 PC가 채워요.'
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe(text))
    // 적기는 lib/gcal/importRead applyImport — 고른 시행자로 넣고, 가져오지 않기는 넣지 않는다
    const shock = mem.db.appts.find((a) => a.gEventId === 'evfut02')
    expect(shock).toMatchObject({ staffId: 'won', staffName: '박지원', staffMark: '원', gFrom: 'import' })
    expect(mem.db.appts.some((a) => a.gEventId === 'evfut05')).toBe(false)
    expect(mem.db.fixes.map((f) => f.gEventId).sort()).toEqual(['evfut04', 'evfut06', 'evfut07', 'evfut08', 'evfut11', 'evfut13'])
    expect(mem.db.link.linkedOn).toBe('2026-11-23')
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onDone.mock.calls[0]![0]).toMatchObject({ notice: text, result: { ok: true, fixes: 6, skipped: 1 } })
    // 한 번 가져온 뒤에는 다시 누를 수 없다
    expect((screen.getByRole('button', { name: '가져오기' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('AC-8530.4: 고쳐야 할 것이 없으면 알림에 고쳐야 할 줄을 붙이지 않는다', async () => {
    const plain = EVENTS.filter((e) => ['evfut01', 'evfut03', 'evfut09', 'evpast01'].includes(e.id))
    setup({}, (n) => n, rig(plain))
    await ready()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '가져오기' }))
    })
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('가져왔어요. 4개를 넣었어요. 이제 2분마다 맞추고, 지난 예약 도착은 비트 PC가 채워요.'),
    )
  })

  it('AC-8530.4: 가져오다 구글에 닿지 못하면 오류 카드이고 다시 누를 수 있다', async () => {
    const r = rig()
    setup({}, (n) => n, r)
    await ready()
    // 가져오기 끝의 보내기는 실패해도 가져오기는 된다 — 여기서는 처음 읽기(loadLink)를 막아 실패를 만든다
    r.mem.db.link.calendarId = null
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '가져오기' }))
    })
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('E-SETTINGS-FAILED')
    expect((screen.getByRole('button', { name: '가져오기' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('AC-8530.4: 4,000줄이 넘어도 표는 보이는 줄만 그린다', async () => {
    const many: GEvent[] = Array.from({ length: 4200 }, (_, i) => {
      const day = new Date(Date.UTC(2026, 10, 23 + Math.floor(i / 42))).toISOString().slice(0, 10)
      const min = 540 + (i % 42) * 10
      const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
      return { ...EVENTS[0]!, id: `evbig${String(i).padStart(4, '0')}`, summary: `${4000 + i} 가상${i % 10} 도수 30분 (호)`, start: `${day}T${hm(min)}`, end: `${day}T${hm(min + 10)}` }
    })
    setup({}, (n) => n, rig(many))
    await ready()
    expect(card('future')).toBe('앞으로 4,200개 예약 4,200 · 하루 종일 0 가져온 뒤 양쪽으로 맞춰요')
    expect(document.querySelectorAll('tr[data-row]').length).toBeLessThan(40)
  })
})
