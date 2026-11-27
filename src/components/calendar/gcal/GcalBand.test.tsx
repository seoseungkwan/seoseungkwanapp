// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CAL_SETTINGS, type CalAppt, type CalSettings } from '@/types/calendar'
import { DEFAULT_GCAL_LOOK } from '@/types/gcal'
import { GcalBand, type GcalBandProps } from './GcalBand'

// 예약 탭 위 구글 띠(spec google-link AC-8532.1·AC-8534.1·AC-8535.1·AC-8535.2, 시안 calendar.html ?s=week·fix·err).
// 글은 notes-calendar `week`·`fix`·`err` 글자를 여기 따로 적어 견준다(labels.ts 상수를 쓰지 않는다 — design.md 4절).
// 띠는 props로만 그린다(상태 듣기·[지금 맞추기] 부르기는 화면이 한다). 환자 이름은 지어낸 가짜다

afterEach(cleanup)

const SETTINGS: Pick<CalSettings, 'kinds' | 'staff'> = {
  kinds: DEFAULT_CAL_SETTINGS.kinds,
  staff: [
    { id: 'ho', name: '정호연', mark: '호', color: 'lavender' },
    { id: 'won', name: '박지원', mark: '원', color: 'banana' },
    { id: 'hyun', name: '이수현', mark: '현', color: 'flamingo' },
  ],
}

const appt = (id: string, over: Partial<CalAppt>): CalAppt => ({
  id,
  day: '2026-11-26',
  start: 940,
  len: 30,
  name: '오가짜',
  chart: '1290',
  staffId: 'ho',
  staffName: '정호연',
  staffMark: '호',
  kindId: 'dosu',
  kindName: '도수',
  memo: '',
  status: 'auto',
  auto: null,
  origDay: null,
  origStart: null,
  gEventId: 'ssk0123456789abcdef0123456789abcdef',
  gUpdated: null,
  gTitle: null,
  gColor: null,
  colorFrom: 'app',
  gKeepTitle: false,
  gMoved: false,
  gGone: false,
  gWait: 'new',
  gWaitAt: '2026-11-26 05:33:00.123456+00',
  gNote: null,
  gFrom: 'web',
  gHow: null,
  createdAt: '2026-11-26T05:33:00+00:00',
  ...over,
})

// 시안 err: 새로 넣음 · 시간 바꿈(원래 10:00) · 취소(가져온 예약, 구글 제목 그대로)
const PENDING: CalAppt[] = [
  appt('p1', {}),
  // google-link AC-8545.1: 웹앱에서 옮기면 같은 쓰기에 g_moved 참
  appt('p2', { start: 660, chart: '3150', name: '박가상', staffId: 'won', staffName: '박지원', staffMark: '원', kindId: 'jabo', kindName: '자보도수', gWait: 'move', origDay: '2026-11-27', origStart: 600, gMoved: true }),
  appt('p3', {
    start: 990,
    chart: '5590',
    name: '신시안',
    staffId: 'hyun',
    staffName: '이수현',
    staffMark: '현',
    status: 'cancel',
    gWait: 'cancel',
    gKeepTitle: true,
    gTitle: '5590 신시안 도수 30분 (현)',
    gFrom: 'import',
  }),
]

const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()

function draw(over: Partial<GcalBandProps> = {}) {
  const onSync = vi.fn()
  const onRetry = vi.fn()
  const onOpenFix = vi.fn()
  render(
    <GcalBand
      calendarName="2026 양지바른정형외과"
      calendarId="abc123@group.calendar.google.com"
      pullMin={2}
      lastOkAt="2026-11-26 05:35:10.123456+00"
      fail={null}
      waiting={0}
      pending={[]}
      look={DEFAULT_GCAL_LOOK}
      settings={SETTINGS}
      fixes={0}
      onSync={onSync}
      onRetry={onRetry}
      onOpenFix={onOpenFix}
      {...over}
    />,
  )
  return { onSync, onRetry, onOpenFix }
}

const band = () => document.querySelector('[data-gcal-band]')

describe('AC-8532.1 이어진 병원의 초록 띠 (시안 ?s=week)', () => {
  it("AC-8532.1: 띠 글은 '구글 캘린더 {이름}와 이어짐 · 마지막 맞춤 {HH:mm} · 2분마다 맞춰요'이고 [구글 캘린더 열기 ↗]·[지금 맞추기]가 있다", () => {
    const { onSync } = draw()
    expect(band()?.getAttribute('data-gcal-band')).toBe('ok')
    expect(text(band()!.querySelector('[data-band-text]'))).toBe('구글 캘린더 2026 양지바른정형외과와 이어짐 · 마지막 맞춤 14:35 · 2분마다 맞춰요')
    const open = screen.getByRole('link', { name: /^구글 캘린더 열기/ })
    expect(open.getAttribute('href')).toBe('https://calendar.google.com/calendar/r?cid=abc123%40group.calendar.google.com')
    expect(open.getAttribute('target')).toBe('_blank')
    expect(open.getAttribute('rel')).toBe('noopener noreferrer')
    fireEvent.click(screen.getByRole('button', { name: '지금 맞추기' }))
    expect(onSync).toHaveBeenCalledTimes(1)
  })

  it('AC-8532.1: [구글 캘린더 열기]는 평소 밑줄이 없고 올렸을 때만 밑줄(시안 — TASK-23 (아))', () => {
    draw()
    const cls = screen.getByRole('link', { name: /^구글 캘린더 열기/ }).className.split(/\s+/)
    expect(cls).toContain('no-underline')
    expect(cls).toContain('hover:underline')
  })

  it('AC-8532.1: 받아 오는 간격이 5분이면 "5분마다 맞춰요", 캘린더 이름 끝 받침에 맞춰 와/과를 고른다(design.md 2절 표 7)', () => {
    draw({ calendarName: '양지 예약', pullMin: 5 })
    expect(text(band()!.querySelector('[data-band-text]'))).toBe('구글 캘린더 양지 예약과 이어짐 · 마지막 맞춤 14:35 · 5분마다 맞춰요')
  })

  it('AC-8532.1: 아직 한 번도 맞추지 않았으면 마지막 맞춤 글 없이 그린다', () => {
    draw({ lastOkAt: null })
    expect(text(band()!.querySelector('[data-band-text]'))).toBe('구글 캘린더 2026 양지바른정형외과와 이어짐 · 2분마다 맞춰요')
  })
})

describe('AC-8534.1 고쳐야 할 구글 예약 단추 (시안 ?s=fix)', () => {
  it('AC-8534.1: 열린 고쳐야 할 것이 있으면 띠에 노란 [고쳐야 할 구글 예약 {n}개]가 있고 누르면 판을 연다', () => {
    const { onOpenFix } = draw({ fixes: 2 })
    fireEvent.click(screen.getByRole('button', { name: '고쳐야 할 구글 예약 2개' }))
    expect(onOpenFix).toHaveBeenCalledTimes(1)
  })

  it('AC-8534.1: 0개면 단추가 없다', () => {
    draw({ fixes: 0 })
    expect(screen.queryByRole('button', { name: /고쳐야 할 구글 예약/ })).toBeNull()
  })
})

describe('AC-8535 구글에 닿지 못함 (시안 ?s=err)', () => {
  const FAIL = { since: '2026-11-26 05:29:03.5+00', code: 'E-GCAL-REACH', nextTryAt: '2026-11-26T05:38:00.000Z' }

  it('AC-8535.1: 주황 띠 글·[접기]·[다시 시도], 아래 못 보낸 목록·안내·오류 상자가 notes-calendar err 그대로다', () => {
    draw({ fail: FAIL, waiting: 3, pending: PENDING })
    const b = band()!
    expect(b.getAttribute('data-gcal-band')).toBe('err')
    expect(b.getAttribute('role')).toBe('alert')
    expect(text(b.querySelector('[data-band-text]'))).toBe(
      '구글 캘린더에 닿지 못했어요 · 14:29부터 · 웹앱에는 저장돼요 · 구글로 보낼 것 3개 · 1분 뒤(14:38) 다시 해 볼게요',
    )
    expect(screen.getByRole('button', { name: '접기' }).getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeTruthy()
    const detail = document.querySelector('[data-gcal-pending]')!
    expect(text(within(detail as HTMLElement).getByRole('heading'))).toBe('구글로 아직 못 보낸 것 3개')
    expect(Array.from(detail.querySelectorAll('li')).map(text)).toEqual([
      '11/26 (목) 15:40 새로 넣음 1290 오가짜 도수 30분 (호) 기다림',
      '11/26 (목) 11:00 시간 바꿈 3150 박가상 자보도수 30분 (원) · 원래 10:00 · 구글에서 흑연 색으로 기다림',
      '11/26 (목) 16:30 취소 5590 신시안 도수 30분 (현) · 구글에서 토마토 색으로 바꿀 것 기다림',
    ])
    expect(
      screen.getByText(
        '다시 닿으면 넣은 차례대로 보내요. 그동안 구글에서 바뀐 것은 받아 오지 못해요 — 다시 닿으면 한꺼번에 받아 와요. 30분 넘게 이어지면 원장님께 알려 주세요.',
      ),
    ).toBeTruthy()
    const box = document.querySelector('[data-gcal-error]')!
    expect(text(box)).toBe('구글 캘린더에 닿지 못했어요. 인터넷이 되는지 확인해 주세요. 계속되면 설정 › 구글 캘린더에서 [연결 시험]을 눌러 보세요. 번호 E-GCAL-REACH')
  })

  it('AC-8535.1: [접기]를 누르면 아래가 접히고 [자세히]가 된다. 다시 누르면 펼친다', () => {
    draw({ fail: FAIL, waiting: 3, pending: PENDING })
    fireEvent.click(screen.getByRole('button', { name: '접기' }))
    expect(document.querySelector('[data-gcal-pending]')).toBeNull()
    const more = screen.getByRole('button', { name: '자세히' })
    expect(more.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(more)
    expect(document.querySelector('[data-gcal-pending]')).not.toBeNull()
  })

  it('AC-8535.2: [다시 시도]는 화면에 알린다(결과 글은 화면 알림)', () => {
    const { onRetry, onSync } = draw({ fail: FAIL, waiting: 3, pending: PENDING })
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(onSync).not.toHaveBeenCalled()
  })

  it('AC-8535.1: 다른 오류 번호면 오류 상자가 그 번호의 글이다(E-GCAL-KEY)', () => {
    draw({ fail: { ...FAIL, code: 'E-GCAL-KEY' }, waiting: 1, pending: PENDING.slice(0, 1) })
    expect(text(document.querySelector('[data-gcal-error]'))).toBe('비밀 글자가 맞지 않아요. 설정에서 코드를 다시 복사해 붙여 주세요. 번호 E-GCAL-KEY')
  })

  it('AC-8535.1: 실패 중에는 초록 띠 글·[지금 맞추기]가 없다', () => {
    draw({ fail: FAIL, waiting: 0, pending: [] })
    expect(screen.queryByRole('button', { name: '지금 맞추기' })).toBeNull()
    expect(text(band())).not.toContain('이어짐')
  })
})

describe("AC-8545.1 못 보낸 줄의 '원래 …'는 g_moved일 때만", () => {
  const FAIL = { since: '2026-11-26 05:29:03.5+00', code: 'E-GCAL-REACH', nextTryAt: '2026-11-26T05:38:00.000Z' }
  const rows = () => Array.from(document.querySelectorAll('[data-gcal-pending] li')).map(text)

  it("AC-8545.1: 처음 자리가 있어도 g_moved가 거짓이면(원래 자리로 되돌림) '· 원래 … · 구글에서 {변경 색} 색으로'를 붙이지 않는다", () => {
    const back = appt('p4', { start: 600, chart: '3150', name: '박가상', staffId: 'won', staffName: '박지원', staffMark: '원', gWait: 'move', origDay: '2026-11-26', origStart: 660, gMoved: false })
    draw({ fail: FAIL, waiting: 1, pending: [back] })
    expect(rows()).toEqual(['11/26 (목) 10:00 시간 바꿈 3150 박가상 도수 30분 (원) 기다림'])
  })

  it("AC-8545.1: g_moved가 참이어도 처음 시각(orig_start)이 없으면 '원래 …'를 붙이지 않는다", () => {
    const gOnly = appt('p5', { start: 600, chart: '3150', name: '박가상', staffId: 'won', staffName: '박지원', staffMark: '원', gWait: 'edit', gMoved: true })
    draw({ fail: FAIL, waiting: 1, pending: [gOnly] })
    expect(rows()).toEqual(['11/26 (목) 10:00 고침 3150 박가상 도수 30분 (원) 기다림'])
  })
})
