// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ParseCtx } from '@/lib/calendar/gshapes'
import { DEFAULT_CAL_SETTINGS } from '@/types/calendar'
import { DEFAULT_GCAL_LOOK, type GcalFix } from '@/types/gcal'
import { FixPanel } from './FixPanel'

// 고쳐야 할 구글 예약 판(spec google-link AC-8534.2·AC-8534.3, 시안 calendar.html ?s=fix, notes-calendar `fix`).
// 판은 구글 제목 원문을 다시 읽어(parseGoogleEvent) 고를 거리(needs)마다 고르기를 그린다. [예약표에 넣기]·[가져오지 않기]는 화면에 알리고(onPut·onSkip),
// 된 줄은 판에 '✓ 넣었어요'·'가져오지 않음'으로 남는다(화면이 목록을 다시 읽어 그 줄이 빠져도). 환자 이름은 지어낸 가짜다

afterEach(cleanup)

const CTX: ParseCtx = {
  staff: [
    { id: 'ho', name: '정호연', mark: '호', color: 'lavender' },
    { id: 'won', name: '박지원', mark: '원', color: 'banana' },
    { id: 'hyun', name: '이수현', mark: '현', color: 'flamingo' },
    { id: 'jang', name: '원장님', mark: '장', color: 'blueberry' },
  ],
  kinds: DEFAULT_CAL_SETTINGS.kinds,
  look: { ...DEFAULT_GCAL_LOOK },
  people: [],
  arrival: 'off',
  linkedOn: '2026-11-23',
}

const NO_GUESS: GcalFix['guess'] = { chart: null, name: null, kindId: null, kindHow: null, staffId: null, staffHow: null, memo: null, word: null }

// 시안 FIXQ 두 개 + 고를 거리가 둘인 것(종류 글도 시행자 글도 모름)
const F1: GcalFix = {
  id: 'f1',
  gEventId: 'gev6402a',
  day: '2026-11-26',
  start: 960,
  len: 15,
  allDay: false,
  gColor: 'sage',
  gTitle: '6402 윤모의 (4000타)',
  reason: 'no-staff',
  guess: { ...NO_GUESS, chart: '6402', name: '윤모의', kindId: 'shock', kindHow: 'title', memo: '4000타' },
  state: 'open',
  gUpdated: '2026-11-26T05:31:00.000Z',
}
const F2: GcalFix = {
  id: 'f2',
  gEventId: 'gev1185b',
  day: '2026-11-27',
  start: 600,
  len: 15,
  allDay: false,
  gColor: 'flamingo',
  gTitle: '1185 곽모의 체외충격 (현)',
  reason: 'bad-kind',
  guess: { ...NO_GUESS, chart: '1185', name: '곽모의', staffId: 'hyun', staffHow: 'title', word: '체외충격' },
  state: 'open',
  gUpdated: '2026-11-26T05:33:00.000Z',
}
const F3: GcalFix = {
  ...F2,
  id: 'f3',
  gEventId: 'gev7001c',
  day: '2026-11-28',
  start: 660,
  len: 30,
  gColor: null,
  gTitle: '7001 문모의 체외충격',
  guess: { ...NO_GUESS, chart: '7001', name: '문모의', word: '체외충격' },
  gUpdated: '2026-11-25T08:02:00.000Z',
}

const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
const item = (id: string) => document.querySelector(`[data-fix="${id}"]`) as HTMLElement

function draw(fixes: GcalFix[] = [F1, F2], over: Partial<Parameters<typeof FixPanel>[0]> = {}) {
  const onPut = vi.fn(async () => true)
  const onSkip = vi.fn(async () => true)
  const onClose = vi.fn()
  const view = render(<FixPanel fixes={fixes} ctx={CTX} today="2026-11-26" onPut={onPut} onSkip={onSkip} onClose={onClose} {...over} />)
  return { onPut, onSkip, onClose, view }
}

describe('AC-8534.2 판 글 (notes-calendar fix)', () => {
  it('AC-8534.2: 제목·설명·하나마다 색 점·제목·때·까닭·알아본 것·들어온 때, 안내 두 줄, [닫기]', () => {
    const { onClose } = draw()
    const panel = screen.getByRole('dialog', { name: '고쳐야 할 구글 예약 2개' })
    expect(
      within(panel).getByText('구글 캘린더에 새로 들어온 일정 가운데 웹앱이 알아보지 못한 거예요. 고르고 [예약표에 넣기]를 누르면 웹앱 예약이 돼요. 구글 일정은 그대로 둬요.'),
    ).toBeTruthy()

    const one = item('f1')
    expect(one.querySelector('[data-swatch="sage"]')).not.toBeNull()
    expect(text(one.querySelector('[data-fix-title]'))).toBe('6402 윤모의 (4000타)')
    expect(text(one.querySelector('[data-fix-when]'))).toBe('11/26 (목) 16:00–16:15 · 15분')
    expect(text(one.querySelector('[data-fix-why]'))).toBe('시행자 글이 없어요. 충격파는 그때그때 하는 사람이 달라 색으로는 몰라요')
    expect(text(one.querySelector('[data-fix-got]'))).toBe('알아본 것: 차트번호 6402 · 이름 윤모의 · 종류 충격파 · 메모 4000타 · 구글에서 14:31에 들어옴')

    const two = item('f2')
    expect(text(two.querySelector('[data-fix-when]'))).toBe('11/27 (금) 10:00–10:15 · 15분')
    expect(text(two.querySelector('[data-fix-why]'))).toBe("'체외충격'을 종류로 알아보지 못했어요 (고르면 '체외충격'은 메모로 남아요)")
    expect(text(two.querySelector('[data-fix-got]'))).toBe('알아본 것: 차트번호 1185 · 이름 곽모의 · 시행자 (현) 이수현 · 구글에서 14:33에 들어옴')

    expect(within(panel).getByText('고르지 않고 둬도 돼요. 예약표에 노란 빗금 칸으로 남고, 누가 구글에서 제목을 고치면 다시 알아봐요.')).toBeTruthy()
    expect(
      within(panel).getByText("같은 꼴이 자주 나오면 설정 › 구글 캘린더 › 시행자·종류에서 '제목에서 알아볼 글'을 더해 주세요(예: 충격파에 '체외충격')."),
    ).toBeTruthy()
    fireEvent.click(within(panel).getAllByRole('button', { name: '닫기' }).at(-1)!)
    expect(onClose).toHaveBeenCalled()
  })

  it('AC-8534.2: 고르기는 시행자면 시행자 단추, 종류면 종류 단추(길이 함께)이고 끝에 [가져오지 않기][예약표에 넣기]', () => {
    draw()
    const staff = within(item('f1')).getByRole('group', { name: '시행자' })
    expect(within(staff).getAllByRole('button').map(text)).toEqual(['(호) 정호연', '(원) 박지원', '(현) 이수현', '(장) 원장님'])
    const kind = within(item('f2')).getByRole('group', { name: '종류' })
    expect(within(kind).getAllByRole('button').map(text)).toEqual(['도수 30분', '자보도수 30분', '충격파 15분', '주사 10분', '진료 10분'])
    expect(within(item('f1')).queryByRole('group', { name: '종류' })).toBeNull()
    for (const id of ['f1', 'f2']) {
      expect(within(item(id)).getByRole('button', { name: '가져오지 않기' })).toBeTruthy()
      expect(within(item(id)).getByRole('button', { name: '예약표에 넣기' })).toBeTruthy()
    }
  })

  it('AC-8534.2: 고를 거리가 둘이면(종류·시행자) 고르기도 둘이고, 둘 다 골라야 [예약표에 넣기]가 된다', () => {
    const { onPut } = draw([F3])
    const one = item('f3')
    expect(text(one.querySelector('[data-fix-when]'))).toBe('11/28 (토) 11:00–11:30 · 30분')
    expect(text(one.querySelector('[data-fix-got]'))).toBe('알아본 것: 차트번호 7001 · 이름 문모의 · 구글에서 11/25 (수) 17:02에 들어옴')
    const put = within(one).getByRole('button', { name: '예약표에 넣기' }) as HTMLButtonElement
    expect(put.disabled).toBe(true)
    fireEvent.click(within(within(one).getByRole('group', { name: '종류' })).getByRole('button', { name: '충격파 15분' }))
    expect(put.disabled).toBe(true)
    fireEvent.click(within(within(one).getByRole('group', { name: '시행자' })).getByRole('button', { name: '(원) 박지원' }))
    expect(put.disabled).toBe(false)
    fireEvent.click(put)
    expect(onPut).toHaveBeenCalledWith(F3, ['kind:shock', 'staff:won'])
  })
})

describe('AC-8534.3 넣기·가져오지 않기', () => {
  it('AC-8534.3: 고르기 전에는 [예약표에 넣기]가 막혀 있고, 고르면 그 값으로 onPut. 되면 ✓ 넣었어요 + 날짜·시작 글, 제목 수가 준다', async () => {
    const { onPut } = draw()
    const put = within(item('f1')).getByRole('button', { name: '예약표에 넣기' }) as HTMLButtonElement
    expect(put.disabled).toBe(true)
    const choice = within(within(item('f1')).getByRole('group', { name: '시행자' })).getByRole('button', { name: '(호) 정호연' })
    fireEvent.click(choice)
    expect(choice.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(put)
    expect(onPut).toHaveBeenCalledWith(F1, ['staff:ho'])
    await waitFor(() => expect(text(item('f1').querySelector('[data-fix-state]'))).toBe('✓ 넣었어요'))
    expect(text(item('f1').querySelector('[data-fix-done]'))).toBe('11/26 (목) 16:00 예약표에 넣었어요. 구글 제목은 그대로 둬요.')
    expect(within(item('f1')).queryByRole('button', { name: '예약표에 넣기' })).toBeNull()
    expect(screen.getByRole('dialog', { name: '고쳐야 할 구글 예약 1개' })).toBeTruthy()
  })

  it('AC-8534.3: 종류를 고르면 그 종류 키로 넣는다(체외충격은 메모로 남는 일은 넣기가 한다)', () => {
    const { onPut } = draw()
    fireEvent.click(within(within(item('f2')).getByRole('group', { name: '종류' })).getByRole('button', { name: '충격파 15분' }))
    fireEvent.click(within(item('f2')).getByRole('button', { name: '예약표에 넣기' }))
    expect(onPut).toHaveBeenCalledWith(F2, ['kind:shock'])
  })

  it('AC-8534.3: [가져오지 않기]는 onSkip, 되면 가져오지 않음 + 구글에만 두고 웹앱은 건드리지 않아요.', async () => {
    const { onSkip, onPut } = draw()
    fireEvent.click(within(item('f2')).getByRole('button', { name: '가져오지 않기' }))
    expect(onSkip).toHaveBeenCalledWith(F2)
    expect(onPut).not.toHaveBeenCalled()
    await waitFor(() => expect(text(item('f2').querySelector('[data-fix-state]'))).toBe('가져오지 않음'))
    expect(text(item('f2').querySelector('[data-fix-done]'))).toBe('구글에만 두고 웹앱은 건드리지 않아요.')
  })

  it('AC-8534.3: 넣기가 안 되면(onPut false) 고르기가 그대로 남는다', async () => {
    const onPut = vi.fn(async () => false)
    draw([F1, F2], { onPut })
    fireEvent.click(within(within(item('f1')).getByRole('group', { name: '시행자' })).getByRole('button', { name: '(호) 정호연' }))
    fireEvent.click(within(item('f1')).getByRole('button', { name: '예약표에 넣기' }))
    await waitFor(() => expect(onPut).toHaveBeenCalled())
    expect(item('f1').querySelector('[data-fix-state]')).toBeNull()
    expect((within(item('f1')).getByRole('button', { name: '예약표에 넣기' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('AC-8534.3: 넣은 뒤 화면이 목록을 다시 읽어 그 줄이 빠져도 판에는 ✓ 넣었어요로 남는다', async () => {
    const { view } = draw()
    fireEvent.click(within(within(item('f1')).getByRole('group', { name: '시행자' })).getByRole('button', { name: '(호) 정호연' }))
    fireEvent.click(within(item('f1')).getByRole('button', { name: '예약표에 넣기' }))
    await waitFor(() => expect(text(item('f1').querySelector('[data-fix-state]'))).toBe('✓ 넣었어요'))
    view.rerender(<FixPanel fixes={[F2]} ctx={CTX} today="2026-11-26" onPut={vi.fn()} onSkip={vi.fn()} onClose={vi.fn()} />)
    expect(text(item('f1').querySelector('[data-fix-state]'))).toBe('✓ 넣었어요')
    expect(item('f2')).not.toBeNull()
    expect(screen.getByRole('dialog', { name: '고쳐야 할 구글 예약 1개' })).toBeTruthy()
  })
})
