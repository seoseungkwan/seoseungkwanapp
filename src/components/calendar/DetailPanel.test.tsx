// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CalAppt, CalSettings } from '@/types/calendar'
import { DetailPanel } from './DetailPanel'

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
