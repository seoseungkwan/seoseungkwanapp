// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CAL_SETTINGS, type CalAppt, type CalSettings } from '@/types/calendar'
import { DEFAULT_GCAL_LOOK } from '@/types/gcal'
import { DetailPanel, type DetailGoogle } from './DetailPanel'

// 예약 자세히 판 (spec clinic-calendar AC-5905.3·AC-5906.2, 시안 ?s=detail).
// 도착(자동 (비트 따라)·왔음·안 옴)·[다음 주에도]·[고치기]·[예약 취소]/[취소 되돌리기]·[지우기](한 번 더 물음). 저장은 화면이 한다(콜백만)

afterEach(cleanup)

const SETTINGS: CalSettings = {
  kinds: [
    { id: 'dosu', name: '도수', len: 30, color: null, words: ['도수'] },
    { id: 'inj', name: '주사', len: 10, color: 'flamingo', words: ['주사'] },
  ],
  staff: [
    { id: 'ga', name: '한○○', mark: '가', color: 'blueberry' },
    { id: 'won', name: '원장님', mark: '원', color: 'graphite' },
  ],
  openHour: 8,
  closeHour: 20,
  sunday: false,
}

// 시안 fix-detail: 11/17 09:30 30분, 11/18 (수) 15:00에서 옮겨 옴, 비트 접수로 왔음
const DETAIL: CalAppt = {
  id: 'fix-detail',
  day: '2026-11-17',
  start: 570,
  len: 30,
  name: '김○○',
  chart: '10231',
  staffId: 'ga',
  staffName: '한○○',
  staffMark: '가',
  kindId: 'dosu',
  kindName: '도수',
  memo: '허리 · 3회차',
  status: 'auto',
  auto: 'came',
  origDay: '2026-11-18',
  origStart: 900,
  gEventId: null,
  gUpdated: null,
  gTitle: null,
  gColor: null,
  colorFrom: 'app',
  gKeepTitle: false,
  gMoved: false,
  gGone: false,
  gWait: null,
  gWaitAt: null,
  gNote: null,
  gFrom: null,
  gHow: null,
  createdAt: '2026-11-01T00:00:00+00:00',
}

function draw(appt: CalAppt = DETAIL, over: { copied?: boolean } = {}) {
  const calls = { close: vi.fn(), arrival: vi.fn(), nextWeek: vi.fn(), edit: vi.fn(), toggleCancel: vi.fn(), remove: vi.fn() }
  render(
    <DetailPanel
      appt={appt}
      settings={SETTINGS}
      copied={over.copied}
      onClose={calls.close}
      onArrival={calls.arrival}
      onNextWeek={calls.nextWeek}
      onEdit={calls.edit}
      onToggleCancel={calls.toggleCancel}
      onDelete={calls.remove}
    />,
  )
  return calls
}

const dl = () => {
  const list = screen.getByRole('dialog').querySelector('dl')!
  return [...list.querySelectorAll('dt')].map((dt) => [dt.textContent, dt.nextElementSibling?.textContent])
}

describe('AC-5906.2: 자세히 판 — 예약 칸과 처음 자리', () => {
  it('AC-5906.2: 차트번호·이름·종류·담당, 날짜·시간·메모, 옮긴 예약은 "원래 11/18 (수) 15:00"', () => {
    draw()
    expect(screen.getByRole('dialog', { name: '예약' })).toBeTruthy()
    expect(screen.getByText('10231')).toBeTruthy()
    expect(screen.getByText('김○○')).toBeTruthy()
    expect(screen.getByText('도수 · (가) 한○○')).toBeTruthy()
    expect(dl()).toEqual([
      ['날짜', '11월 17일 (화)'],
      ['시간', '09:30 – 10:00 · 30분'],
      ['메모', '허리 · 3회차'],
      ['변경', '원래 11/18 (수) 15:00'],
    ])
  })

  it('AC-5906.2: 처음 자리가 없으면 변경 줄이 없고, 메모·차트번호가 없으면 "없음"·"차트번호 없음"', () => {
    draw({ ...DETAIL, origDay: null, origStart: null, memo: '', chart: null })
    expect(dl()).toEqual([
      ['날짜', '11월 17일 (화)'],
      ['시간', '09:30 – 10:00 · 30분'],
      ['메모', '없음'],
    ])
    expect(screen.getByText('차트번호 없음')).toBeTruthy()
  })
})

describe('AC-5905.3: 도착', () => {
  it('AC-5905.3: 비트가 정한 왔음 + 자동 안내, 세 단추 중 [자동 (비트 따라)]가 눌려 있다', () => {
    draw()
    const section = screen.getByRole('region', { name: '도착' })
    const now = section.querySelector<HTMLElement>('[data-now]')!
    expect(within(now).getByText('왔음')).toBeTruthy()
    expect(within(now).getByText('비트 접수가 있어요 · 자동')).toBeTruthy()
    const group = within(section).getByRole('group', { name: '도착 바꾸기' })
    const buttons = within(group).getAllByRole('button')
    expect(buttons.map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([
      ['자동 (비트 따라)', 'true'],
      ['왔음', 'false'],
      ['안 옴', 'false'],
    ])
    expect(
      within(section).getByText('자동: 같은 날 같은 차트번호로 비트 접수가 있으면 왔음, 예약 시간이 끝나도 없으면 안 옴. 손으로 고르면 그 값이 먼저예요.'),
    ).toBeTruthy()
  })

  it('AC-5905.3: 단추를 누르면 그 상태로 부른다', () => {
    const calls = draw()
    const group = screen.getByRole('group', { name: '도착 바꾸기' })
    fireEvent.click(within(group).getByRole('button', { name: '안 옴' }))
    fireEvent.click(within(group).getByRole('button', { name: '왔음' }))
    fireEvent.click(within(group).getByRole('button', { name: '자동 (비트 따라)' }))
    expect(calls.arrival.mock.calls).toEqual([['noshow'], ['came'], ['auto']])
  })

  it('AC-5905.3: 자동 안 옴·손으로 고른 값·아직·차트번호 없는 예약의 안내', () => {
    draw({ ...DETAIL, auto: 'noshow' })
    expect(screen.getByText('예약 시간이 끝나도 비트 접수가 없어요 · 자동')).toBeTruthy()
    cleanup()
    draw({ ...DETAIL, status: 'came', auto: null })
    expect(screen.getByText('손으로 바꿈')).toBeTruthy()
    expect(within(screen.getByRole('group', { name: '도착 바꾸기' })).getByRole('button', { name: '왔음' }).getAttribute('aria-pressed')).toBe('true')
    cleanup()
    draw({ ...DETAIL, auto: null })
    expect(screen.getByText('아직')).toBeTruthy()
    expect(screen.getByText('비트 접수가 생기면 저절로 왔음이 돼요')).toBeTruthy()
    cleanup()
    draw({ ...DETAIL, auto: null, chart: null })
    expect(screen.getByText('차트번호가 없어 저절로 바뀌지 않아요 · 손으로 골라요')).toBeTruthy()
  })

  it('AC-5905.3: 취소한 예약은 "취소한 예약"·"칸은 흐리게 남아요"이고 도착 단추가 없으며 [취소 되돌리기]', () => {
    const calls = draw({ ...DETAIL, status: 'cancel' })
    expect(screen.getByText('취소한 예약')).toBeTruthy()
    expect(screen.getByText('칸은 흐리게 남아요')).toBeTruthy()
    expect(screen.queryByRole('group', { name: '도착 바꾸기' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '취소 되돌리기' }))
    expect(calls.toggleCancel).toHaveBeenCalledTimes(1)
  })
})

describe('AC-5905.3: [다음 주에도]·[고치기]·[예약 취소]·[지우기]', () => {
  it('AC-5905.3: [다음 주에도]는 7일 뒤 같은 시각 안내, 누르면 부르고 넣은 뒤에는 막히고 "넣었어요 ✓"', () => {
    const calls = draw()
    expect(screen.getByText('11월 24일 (화) 09:30에 같은 담당·종류·길이로 하나 더 넣어요')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '다음 주에도' }))
    expect(calls.nextWeek).toHaveBeenCalledTimes(1)
    cleanup()
    draw(DETAIL, { copied: true })
    expect((screen.getByRole('button', { name: '다음 주에도' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('11월 24일 (화) 09:30에 넣었어요 ✓')).toBeTruthy()
  })

  it('AC-5905.3: [고치기]·[예약 취소]·닫기', () => {
    const calls = draw()
    fireEvent.click(screen.getByRole('button', { name: '고치기' }))
    fireEvent.click(screen.getByRole('button', { name: '예약 취소' }))
    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(calls.edit).toHaveBeenCalledTimes(1)
    expect(calls.toggleCancel).toHaveBeenCalledTimes(1)
    expect(calls.close).toHaveBeenCalledTimes(1)
  })

  it('AC-5905.3: [지우기]는 한 번 더 묻는다 — [아니요]는 돌아가고, 확인 [지우기]만 onDelete', () => {
    const calls = draw()
    fireEvent.click(screen.getByRole('button', { name: '지우기' }))
    expect(screen.getByText('이 예약을 지울까요? 되돌릴 수 없어요.')).toBeTruthy()
    expect(calls.remove).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '아니요' }))
    expect(screen.queryByText('이 예약을 지울까요? 되돌릴 수 없어요.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '지우기' }))
    fireEvent.click(screen.getByRole('button', { name: '지우기' }))
    expect(calls.remove).toHaveBeenCalledTimes(1)
  })
})

// ── 구글 캘린더 구역 (spec google-link AC-8533.1, 시안 ?s=detail, notes-calendar `detail`) ──
// 이은 병원의 짝 있는 예약(g_event_id)만 구역이 있다. 글은 notes-calendar 글자를 여기 따로 적어 견준다. 환자 이름은 지어낸 가짜다

const GSET: CalSettings = {
  ...DEFAULT_CAL_SETTINGS,
  staff: [
    { id: 'ho', name: '정호연', mark: '호', color: 'lavender' },
    { id: 'won', name: '박지원', mark: '원', color: 'banana' },
  ],
}
const CAL_ID = 'abc123@group.calendar.google.com'
const GOOGLE: DetailGoogle = { look: DEFAULT_GCAL_LOOK, arrival: 'off', calendarId: CAL_ID, lastOkAt: '2026-11-26 05:35:10.5+00', waiting: false }

// 시안 det: 처음 가져오기로 온 예약(구글 색 바나나 = (원) 박지원, 종류 글 없음 → 설정 '종류 글이 없는 예약' 도수, 괄호 안 글 = 메모)
const FROM_GOOGLE: CalAppt = {
  ...DETAIL,
  id: 'det',
  day: '2026-11-26',
  start: 630,
  len: 30,
  chart: '7345',
  name: '한예제',
  staffId: 'won',
  staffName: '박지원',
  staffMark: '원',
  kindId: 'dosu',
  kindName: '도수',
  memo: '1부위만 해 주세요',
  status: 'auto',
  auto: 'came',
  origDay: null,
  origStart: null,
  gEventId: 'gev7345abc',
  gUpdated: '2026-11-22T23:50:00.000Z',
  gTitle: '7345 한예제(1부위만 해 주세요',
  gColor: 'banana',
  colorFrom: 'google',
  gKeepTitle: true,
  gFrom: 'import',
  gHow: { staff: 'color', kind: 'setting', memo: true, gStart: '10:30', gEnd: '11:00' },
  createdAt: '2026-11-22T23:55:00+00:00',
}
// 웹앱에서 넣고 구글에 보낸 예약
const FROM_WEB: CalAppt = {
  ...DETAIL,
  origDay: null,
  origStart: null,
  gEventId: 'ssk0123456789abcdef0123456789abcdef',
  gFrom: 'web',
  colorFrom: 'app',
  createdAt: '2026-11-24T08:12:00+00:00',
}

function drawLinked(appt: CalAppt, google: DetailGoogle | null = GOOGLE, settings: CalSettings = GSET) {
  render(
    <DetailPanel
      appt={appt}
      settings={settings}
      google={google}
      onClose={vi.fn()}
      onArrival={vi.fn()}
      onNextWeek={vi.fn()}
      onEdit={vi.fn()}
      onToggleCancel={vi.fn()}
      onDelete={vi.fn()}
    />,
  )
}
const squash = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
const gsec = () => document.querySelector('[data-gcal-detail]') as HTMLElement | null
const gdl = () => [...gsec()!.querySelectorAll('dt')].map((dt) => [squash(dt), squash(dt.nextElementSibling)])
const lines = (term: string) => {
  const dt = [...gsec()!.querySelectorAll('dt')].find((d) => squash(d) === term)
  return [...(dt?.nextElementSibling?.querySelectorAll('[data-line]') ?? [])].map(squash)
}
const ARRIVAL_NOTE = '도착은 구글에 보내지 않아요(설정 › 맞춤 방법).'
const COLOR_NOTE =
  '[예약 취소]하면 구글 일정 색이 취소 색(토마토)으로 바뀌고, 웹앱에는 흐린 칸으로 남아요. [취소 되돌리기]하면 원래 색으로 돌려요. 날짜·시작을 옮기면 구글 일정 색이 변경 색(흑연)으로 바뀌어요. [지우기]는 둘 다에서 지워요.'

describe('AC-8533.1: 자세히의 구글 캘린더 구역', () => {
  it('AC-8533.1: 구글에서 온 예약 — 꼬리표·제목 원문·색 출처·알아본 것·들어온 때·맞춤·고치기·취소 풀이·이 일정 열기가 notes-calendar detail 그대로다', () => {
    drawLinked(FROM_GOOGLE)
    const sec = gsec()!
    expect(squash(within(sec).getByRole('heading'))).toBe('구글 캘린더 구글에서 옴')
    expect(gdl().map(([dt]) => dt)).toEqual(['구글 제목 원문', '색', '알아본 것', '들어온 때', '맞춤'])
    const rows = Object.fromEntries(gdl())
    expect(rows['구글 제목 원문']).toBe('7345 한예제(1부위만 해 주세요')
    expect(rows['색']).toBe('바나나 구글 일정 색 그대로')
    expect(lines('알아본 것')).toEqual([
      '시행자 (원) 박지원 구글 색 바나나',
      "종류 도수 설정 '종류 글이 없는 예약'",
      "메모 '1부위만 해 주세요' 괄호 안 글",
      '길이 30분 구글 시간 10:30–11:00',
    ])
    expect(rows['들어온 때']).toBe('11/23 (월) 08:55 처음 가져오기')
    expect(rows['맞춤']).toBe('마지막 맞춤 14:35 · 구글과 같아요')
    expect(
      within(sec).getByText(
        '[고치기]로 바꾸면 구글 제목이 7345 한예제 도수 30분 (원) 1부위만 해 주세요로 다시 적혀요. 시행자·종류를 바꾸면 색도 설정 색으로 바꿔요. 그 전에는 원문·색 그대로 둬요.',
      ),
    ).toBeTruthy()
    expect(within(sec).getByText(COLOR_NOTE)).toBeTruthy()
    const open = within(sec).getByRole('link', { name: /^구글 캘린더에서 이 일정 열기/ })
    const eid = Buffer.from(`gev7345abc ${CAL_ID}`).toString('base64').replace(/=+$/, '')
    expect(open.getAttribute('href')).toBe(`https://www.google.com/calendar/event?eid=${encodeURIComponent(eid)}`)
    expect(open.getAttribute('target')).toBe('_blank')
    expect(screen.getByText(ARRIVAL_NOTE)).toBeTruthy()
  })

  it("AC-8533.1: 웹앱에서 만든 예약 — '웹앱에서 만듦 · 구글에 있음', 구글 제목 = 웹앱이 적는 제목, 설정 색, 알아본 것·고치기 풀이 없음", () => {
    drawLinked(FROM_WEB, GOOGLE, SETTINGS)
    expect(squash(within(gsec()!).getByRole('heading'))).toBe('구글 캘린더 웹앱에서 만듦 · 구글에 있음')
    expect(gdl()).toEqual([
      ['구글 제목', '10231 김○○ 도수 30분 (가) 허리 · 3회차'],
      ['색', '블루베리 설정의 시행자·종류 색'],
      ['들어온 때', '11/24 (화) 17:12 웹앱에서 넣음'],
      ['맞춤', '마지막 맞춤 14:35 · 구글과 같아요'],
    ])
    expect(gsec()!.textContent).not.toContain('[고치기]로 바꾸면')
    expect(within(gsec()!).getByText(COLOR_NOTE)).toBeTruthy()
  })

  it('AC-8533.1: 받아 온 예약(맞추는 중 구글에서 새로 들어옴)의 들어온 때는 "구글에서 들어옴"', () => {
    drawLinked({ ...FROM_GOOGLE, gFrom: 'pull', createdAt: '2026-11-26T05:31:00+00:00' })
    expect(Object.fromEntries(gdl())['들어온 때']).toBe('11/26 (목) 14:31 구글에서 들어옴')
  })

  it('AC-8533.1: 구글에서 변경 색이 된 예약은 위 칸 목록에 변경 글 둘, 색은 변경 색 / 취소한 예약은 취소 색', () => {
    drawLinked({ ...FROM_GOOGLE, gMoved: true })
    expect(dl().at(-1)).toEqual(['변경', '구글에서 변경 색으로 바뀜 처음 시간은 몰라요'])
    expect(Object.fromEntries(gdl())['색']).toBe('흑연 변경 색')
    cleanup()
    drawLinked({ ...FROM_GOOGLE, status: 'cancel' })
    expect(Object.fromEntries(gdl())['색']).toBe('토마토 취소 색')
    expect(screen.queryByText(ARRIVAL_NOTE)).toBeNull()
  })

  it('AC-8533.1: 웹앱에서 옮긴 예약은 "원래 {11/18 (수) 15:00}" 그대로이고 색은 변경 색', () => {
    drawLinked({ ...FROM_WEB, origDay: '2026-11-18', origStart: 900 }, GOOGLE, SETTINGS)
    expect(dl().at(-1)).toEqual(['변경', '원래 11/18 (수) 15:00'])
    expect(Object.fromEntries(gdl())['색']).toBe('흑연 변경 색')
  })

  it('AC-8533.1: 아직 못 보낸 예약의 맞춤은 "구글에 아직 못 보냈어요 · 다시 닿으면 보내요", g_note는 맞춤 아래 한 줄', () => {
    drawLinked({ ...FROM_GOOGLE, gNote: '구글에서 지운 일정이라 취소로 뒀어요' }, { ...GOOGLE, waiting: true })
    const dd = [...gsec()!.querySelectorAll('dt')].find((d) => squash(d) === '맞춤')!.nextElementSibling!
    expect(squash(dd.querySelector('[data-sync]'))).toBe('구글에 아직 못 보냈어요 · 다시 닿으면 보내요')
    expect(squash(dd.querySelector('[data-gnote]'))).toBe('구글에서 지운 일정이라 취소로 뒀어요')
  })

  it("AC-8533.1·AC-8526.5: 맞춤 방법이 '구글 제목 앞에 붙여요'면 도착 끝 글이 없다. 이은 병원이 아니거나 짝 없는 예약은 구역이 없다", () => {
    drawLinked(FROM_GOOGLE, { ...GOOGLE, arrival: 'title' })
    expect(gsec()).not.toBeNull()
    expect(screen.queryByText(ARRIVAL_NOTE)).toBeNull()
    cleanup()
    drawLinked(FROM_GOOGLE, null)
    expect(gsec()).toBeNull()
    expect(screen.queryByText(ARRIVAL_NOTE)).toBeNull()
    cleanup()
    drawLinked({ ...FROM_WEB, gEventId: null }, GOOGLE, SETTINGS)
    expect(gsec()).toBeNull()
  })
})
