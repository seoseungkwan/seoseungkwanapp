// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ParseCtx } from '@/lib/calendar/gshapes'
import { DEFAULT_CAL_SETTINGS } from '@/types/calendar'
import { DEFAULT_GCAL_LOOK, type GcalFix } from '@/types/gcal'
import { FixPanel } from './FixPanel'

// 고쳐야 할 구글 예약 판(spec google-link AC-8534.2·AC-8534.3, 시안 calendar.html ?s=fix, notes-calendar `fix`).
// 판은 구글 제목 원문을 다시 읽어(parseGoogleEvent) 고를 거리(needs)마다 고르기를 그린다. [예약표에 넣기]·[가져오지 않기]는 화면에 알리고(onPut·onSkip),
// 된 줄은 판에 '✓ 넣었어요'·'가져오지 않음'으로 남는다(화면이 목록을 다시 읽어 그 줄이 빠져도). 환자 이름은 지어낸 가짜다

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear() // 판이 기억한 기간(google-link AC-8550.1)을 시험마다 지운다
})

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
  const onSkipAll = vi.fn<(list: GcalFix[]) => Promise<boolean>>(async () => true)
  const onClose = vi.fn()
  const view = render(
    <FixPanel fixes={fixes} ctx={CTX} today="2026-11-26" onPut={onPut} onSkip={onSkip} onSkipAll={onSkipAll} onClose={onClose} {...over} />,
  )
  return { onPut, onSkip, onSkipAll, onClose, view }
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
    view.rerender(<FixPanel fixes={[F2]} ctx={CTX} today="2026-11-26" onPut={vi.fn()} onSkip={vi.fn()} onSkipAll={vi.fn()} onClose={vi.fn()} />)
    expect(text(item('f1').querySelector('[data-fix-state]'))).toBe('✓ 넣었어요')
    expect(item('f2')).not.toBeNull()
    expect(screen.getByRole('dialog', { name: '고쳐야 할 구글 예약 1개' })).toBeTruthy()
  })
})

// ── 2차 고침 (REQ-8550·REQ-8551, 시안 ?s=fix-range·fix-skipall, notes-calendar '2차 고침 › fix-range·fix-skipall' 글 그대로) ──
// 오늘 = 2026-11-26. 기간 처음 값은 오늘 ~ 비움(앞으로 전부). 지난해 줄 하나(P1)와 다음 달 줄 하나(L1)를 더한다

const P1: GcalFix = {
  ...F2,
  id: 'p1',
  gEventId: 'gevpast01',
  day: '2025-11-24',
  start: 625,
  len: 30,
  gColor: 'lavender',
  gTitle: '2214 서보기 체외 30분 (호)',
  guess: { ...NO_GUESS, chart: '2214', name: '서보기', staffId: 'ho', staffHow: 'title', word: '체외' },
  gUpdated: '2025-11-21T01:50:00.000Z', // 한국 2025-11-21 (금) 10:50
}
const L1: GcalFix = {
  ...F1,
  id: 'l1',
  gEventId: 'gevlate01',
  day: '2026-12-03',
  start: 540,
  gTitle: '5876 모연습(3천',
  guess: { ...NO_GUESS, chart: '5876', name: '모연습', kindId: 'shock', kindHow: 'title', memo: '3000타' },
}
const FIVE = [P1, F1, F2, F3, L1]
const KEY = 'ssk-gcal-fix-range'

const rangeBox = () => screen.getByRole('region', { name: '기간 고르기' })
const fromInput = () => within(rangeBox()).getByLabelText('시작') as HTMLInputElement
const toInput = () => within(rangeBox()).getByLabelText(/^끝/) as HTMLInputElement
const shownIds = () => [...document.querySelectorAll('[data-fix]')].map((el) => el.getAttribute('data-fix'))
const skipAllButton = () => screen.queryByRole('button', { name: '이 기간 모두 가져오지 않기' })
const ask = () => screen.getByRole('alertdialog')
function setRange(from: string, to: string) {
  fireEvent.change(fromInput(), { target: { value: from } })
  fireEvent.change(toInput(), { target: { value: to } })
}

describe('AC-8550.1 기간 칸 (fix-range)', () => {
  it('AC-8550.1: 판 맨 위에 시작 · ~ · 끝(비우면 앞으로 전부) 날짜 칸, 그 아래 작은 글, 그 아래는 지금 글 그대로', () => {
    draw(FIVE)
    const box = rangeBox()
    expect(fromInput().type).toBe('date')
    expect(toInput().type).toBe('date')
    expect(text(fromInput().labels![0]!)).toBe('시작')
    expect(text(toInput().labels![0]!)).toBe('끝 비우면 앞으로 전부')
    expect(within(box).getByText('~')).toBeTruthy()
    expect(within(box).getByText('고른 기간은 이 PC에서 기억해요.')).toBeTruthy()
    const lead = screen.getByText(
      '구글 캘린더에 새로 들어온 일정 가운데 웹앱이 알아보지 못한 거예요. 고르고 [예약표에 넣기]를 누르면 웹앱 예약이 돼요. 구글 일정은 그대로 둬요.',
    )
    expect(box.compareDocumentPosition(lead) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText('고르지 않고 둬도 돼요. 예약표에 노란 빗금 칸으로 남고, 누가 구글에서 제목을 고치면 다시 알아봐요.')).toBeTruthy()
  })

  it('AC-8550.1: 기억이 없으면 시작 = 오늘 · 끝 = 비움', () => {
    draw(FIVE)
    expect(fromInput().value).toBe('2026-11-26')
    expect(toInput().value).toBe('')
  })

  it('AC-8550.1: 이 브라우저에 기억한 기간이 처음 값이고, 날짜를 바꾸면 이 브라우저 저장소에만 기억한다', () => {
    localStorage.setItem(KEY, JSON.stringify({ from: '2025-11-01', to: '2025-11-30' }))
    draw(FIVE)
    expect(fromInput().value).toBe('2025-11-01')
    expect(toInput().value).toBe('2025-11-30')
    fireEvent.change(toInput(), { target: { value: '' } })
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ from: '2025-11-01', to: '' })
    fireEvent.change(fromInput(), { target: { value: '2026-11-23' } })
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ from: '2026-11-23', to: '' })
  })

  it('AC-8550.1: 저장소 읽기·쓰기가 던져도 판은 오늘 ~ 비움으로 그리고, 날짜를 바꾸면 목록이 바뀐다', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    draw(FIVE)
    expect(fromInput().value).toBe('2026-11-26')
    expect(toInput().value).toBe('')
    setRange('2025-11-01', '2025-11-30')
    expect(shownIds()).toEqual(['p1'])
  })
})

describe('AC-8550.2 기간 줄·판 제목 수', () => {
  it('AC-8550.2: 목록은 기간(두 날 포함, 끝 비움 = 앞으로 전부) 줄만이고 판 제목은 기간 수 + 작은 글 · 전체 수', () => {
    draw(FIVE)
    expect(shownIds()).toEqual(['f1', 'f2', 'f3', 'l1'])
    expect(screen.getByRole('dialog', { name: '고쳐야 할 구글 예약 4개 · 전체 5개' })).toBeTruthy()
    expect(screen.getByText('· 전체 5개')).toBeTruthy()
    setRange('2026-11-26', '2026-11-27')
    expect(shownIds()).toEqual(['f1', 'f2'])
    expect(screen.getByRole('dialog', { name: '고쳐야 할 구글 예약 2개 · 전체 5개' })).toBeTruthy()
    setRange('2025-11-01', '2025-11-30')
    expect(shownIds()).toEqual(['p1'])
    expect(screen.getByRole('dialog', { name: '고쳐야 할 구글 예약 1개 · 전체 5개' })).toBeTruthy()
  })

  it('AC-8550.2: 기간 수와 전체 수가 같으면 작은 글이 없다', () => {
    draw([F1, F2, F3])
    expect(screen.getByRole('dialog', { name: '고쳐야 할 구글 예약 3개' })).toBeTruthy()
    expect(document.body.textContent).not.toContain('· 전체')
  })

  it('AC-8550.2: 하루 종일 여러 날 일정은 시작 날로 거른다(시작 날이 기간 밖이면 그 일정 줄이 모두 빠짐)', () => {
    const A1: GcalFix = { ...F3, id: 'a1', gEventId: 'gevmulti01', day: '2026-11-25', start: 0, len: 1440, allDay: true, gColor: null, gTitle: '학회 준비' }
    const A2: GcalFix = { ...A1, id: 'a2', day: '2026-11-26' }
    draw([A1, A2, F1])
    expect(shownIds()).toEqual(['f1'])
    fireEvent.change(fromInput(), { target: { value: '2026-11-25' } })
    expect(shownIds()).toEqual(['a1', 'a2', 'f1'])
  })
})

describe('AC-8550.3 올해가 아닌 날짜', () => {
  it('AC-8550.3: 때 글과 들어온 때 글의 날짜 앞에 해를 붙인다', () => {
    draw(FIVE)
    setRange('2025-11-01', '2025-11-30')
    const one = item('p1')
    expect(text(one.querySelector('[data-fix-when]'))).toBe('2025. 11/24 (월) 10:25–10:55 · 30분')
    expect(text(one.querySelector('[data-fix-got]'))).toBe('알아본 것: 차트번호 2214 · 이름 서보기 · 시행자 (호) 정호연 · 구글에서 2025. 11/21 (금) 10:50에 들어옴')
  })
})

describe('AC-8550.4 판에 보이는 줄이 없음', () => {
  it('AC-8550.4: 그 기간에 남은 것이 없으면 빈 글 + 다른 기간에 남은 수, 단추 없음', () => {
    draw(FIVE)
    fireEvent.change(fromInput(), { target: { value: '2026-12-10' } })
    expect(shownIds()).toEqual([])
    expect(screen.getByText('이 기간에는 고쳐야 할 구글 예약이 없어요.')).toBeTruthy()
    expect(screen.getByText('다른 기간에 5개 남아 있어요.')).toBeTruthy()
    expect(skipAllButton()).toBeNull()
  })

  it('AC-8550.4: 다른 기간에도 남은 것이 없으면 빈 글만', () => {
    draw([])
    expect(screen.getByText('이 기간에는 고쳐야 할 구글 예약이 없어요.')).toBeTruthy()
    expect(document.body.textContent).not.toContain('다른 기간에')
  })

  it('AC-8550.4: 이 판에서 하나씩 뺀 줄이 남아 있으면 빈 글이 아니고, 남은 것이 없어 단추도 없다', async () => {
    draw([F1])
    expect(skipAllButton()).not.toBeNull()
    fireEvent.click(within(item('f1')).getByRole('button', { name: '가져오지 않기' }))
    await waitFor(() => expect(text(item('f1').querySelector('[data-fix-state]'))).toBe('가져오지 않음'))
    expect(screen.queryByText('이 기간에는 고쳐야 할 구글 예약이 없어요.')).toBeNull()
    expect(skipAllButton()).toBeNull()
    expect(screen.getByRole('dialog', { name: '고쳐야 할 구글 예약 0개' })).toBeTruthy()
  })
})

describe('AC-8550.5 기간 오류', () => {
  it('AC-8550.5: 시작을 비우면 빨간 글 · 목록 비움 · 단추 숨김', () => {
    draw(FIVE)
    fireEvent.change(fromInput(), { target: { value: '' } })
    expect(text(within(rangeBox()).getByRole('alert'))).toBe('시작 날짜를 골라 주세요.')
    expect(shownIds()).toEqual([])
    expect(skipAllButton()).toBeNull()
    expect(screen.queryByText('이 기간에는 고쳐야 할 구글 예약이 없어요.')).toBeNull()
    expect(fromInput().getAttribute('aria-invalid')).toBe('true')
  })

  it('AC-8550.5: 끝이 시작보다 앞이면 빨간 글 · 목록 비움 · 단추 숨김', () => {
    draw(FIVE)
    setRange('2026-11-27', '2026-11-26')
    expect(text(within(rangeBox()).getByRole('alert'))).toBe('끝 날짜는 시작 날짜보다 앞일 수 없어요.')
    expect(shownIds()).toEqual([])
    expect(skipAllButton()).toBeNull()
    expect(toInput().getAttribute('aria-invalid')).toBe('true')
    fireEvent.change(toInput(), { target: { value: '2026-11-27' } })
    expect(within(rangeBox()).queryByRole('alert')).toBeNull()
    expect(shownIds()).toEqual(['f2'])
  })
})

describe('AC-8551.1 이 기간 모두 가져오지 않기 — 확인 창 (fix-skipall)', () => {
  it('AC-8551.1: 작은 글 옆 가는 단추 → 확인 창 제목·글·기간·[취소][가져오지 않기], 첫 초점 [취소]', () => {
    draw(FIVE)
    const button = skipAllButton()!
    expect(rangeBox().contains(button)).toBe(true)
    fireEvent.click(button)
    const box = ask()
    expect(box.getAttribute('aria-modal')).toBe('true')
    expect(screen.getByRole('alertdialog', { name: '4개를 가져오지 않을까요?' })).toBe(box)
    expect(within(box).getByText('구글 일정은 그대로예요.')).toBeTruthy()
    expect(within(box).getByText('기간 11/26 (목) – 앞으로 전부')).toBeTruthy()
    expect(within(box).getAllByRole('button').map(text)).toEqual(['취소', '가져오지 않기'])
    expect(document.activeElement).toBe(within(box).getByRole('button', { name: '취소' }))
  })

  it('AC-8551.1: 끝을 고르면 기간 두 날, 올해가 아닌 날짜는 앞에 해를 붙인다', () => {
    draw(FIVE)
    setRange('2026-11-23', '2026-11-29')
    fireEvent.click(skipAllButton()!)
    expect(screen.getByRole('alertdialog', { name: '3개를 가져오지 않을까요?' })).toBeTruthy()
    expect(within(ask()).getByText('기간 11/23 (월) – 11/29 (일)')).toBeTruthy()
    fireEvent.click(within(ask()).getByRole('button', { name: '취소' }))
    setRange('2025-11-01', '2025-11-30')
    fireEvent.click(skipAllButton()!)
    expect(screen.getByRole('alertdialog', { name: '1개를 가져오지 않을까요?' })).toBeTruthy()
    expect(within(ask()).getByText('기간 2025. 11/1 (토) – 2025. 11/30 (일)')).toBeTruthy()
  })

  it('AC-8551.1: Esc와 [취소]는 창만 닫는다(판은 열린 채, 아무것도 바뀌지 않음). 창이 닫힌 뒤 Esc는 판을 닫는다', () => {
    const { onClose, onSkipAll } = draw(FIVE)
    fireEvent.click(skipAllButton()!)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.getByRole('dialog', { name: '고쳐야 할 구글 예약 4개 · 전체 5개' })).toBeTruthy()
    fireEvent.click(skipAllButton()!)
    fireEvent.keyDown(ask(), { key: 'Escape' })
    expect(screen.queryByRole('alertdialog')).toBeNull()
    fireEvent.click(skipAllButton()!)
    fireEvent.click(within(ask()).getByRole('button', { name: '취소' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
    expect(onSkipAll).not.toHaveBeenCalled()
    expect(shownIds()).toEqual(['f1', 'f2', 'f3', 'l1'])
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('AC-8551.2 한꺼번에 가져오지 않기', () => {
  it('AC-8551.2: [가져오지 않기] → 기간에 남은 줄로 onSkipAll 한 번 · 초록 줄 · 뺀 줄은 판에 남지 않고 수가 준다 · 하나씩 뺀 줄은 그대로', async () => {
    const { onSkipAll, view } = draw(FIVE)
    fireEvent.click(within(item('f2')).getByRole('button', { name: '가져오지 않기' }))
    await waitFor(() => expect(text(item('f2').querySelector('[data-fix-state]'))).toBe('가져오지 않음'))
    fireEvent.click(skipAllButton()!)
    expect(screen.getByRole('alertdialog', { name: '3개를 가져오지 않을까요?' })).toBeTruthy()
    fireEvent.click(within(ask()).getByRole('button', { name: '가져오지 않기' }))
    expect(onSkipAll).toHaveBeenCalledTimes(1)
    expect(onSkipAll).toHaveBeenCalledWith([F1, F3, L1])
    expect(await screen.findByText('3개를 가져오지 않기로 했어요. 구글에만 남아요.')).toBeTruthy()
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(shownIds()).toEqual(['f2'])
    expect(text(item('f2').querySelector('[data-fix-state]'))).toBe('가져오지 않음')
    expect(screen.getByRole('dialog', { name: '고쳐야 할 구글 예약 0개 · 전체 1개' })).toBeTruthy()
    expect(skipAllButton()).toBeNull()
    // 화면이 목록을 다시 읽어 뺀 줄이 빠져도 그대로
    view.rerender(<FixPanel fixes={[P1]} ctx={CTX} today="2026-11-26" onPut={vi.fn()} onSkip={vi.fn()} onSkipAll={onSkipAll} onClose={vi.fn()} />)
    expect(shownIds()).toEqual(['f2'])
    expect(screen.getByText('3개를 가져오지 않기로 했어요. 구글에만 남아요.')).toBeTruthy()
  })

  it('AC-8551.2: 초록 줄은 기간을 바꾸면 사라진다', async () => {
    draw(FIVE)
    fireEvent.click(skipAllButton()!)
    fireEvent.click(within(ask()).getByRole('button', { name: '가져오지 않기' }))
    expect(await screen.findByText('4개를 가져오지 않기로 했어요. 구글에만 남아요.')).toBeTruthy()
    expect(screen.getByText('이 기간에는 고쳐야 할 구글 예약이 없어요.')).toBeTruthy()
    expect(screen.getByText('다른 기간에 1개 남아 있어요.')).toBeTruthy()
    fireEvent.change(fromInput(), { target: { value: '2025-11-01' } })
    expect(screen.queryByText('4개를 가져오지 않기로 했어요. 구글에만 남아요.')).toBeNull()
    expect(shownIds()).toEqual(['p1'])
  })

  it('AC-8551.2: 도는 동안 [가져오지 않기]는 막혀 두 번 부르지 않는다', async () => {
    let finish: (ok: boolean) => void = () => undefined
    const onSkipAll = vi.fn(() => new Promise<boolean>((resolve) => (finish = resolve)))
    draw(FIVE, { onSkipAll })
    fireEvent.click(skipAllButton()!)
    const go = within(ask()).getByRole('button', { name: '가져오지 않기' })
    fireEvent.click(go)
    fireEvent.click(go)
    expect(onSkipAll).toHaveBeenCalledTimes(1)
    expect(go.getAttribute('aria-busy')).toBe('true')
    await act(async () => finish(true))
    expect(screen.getByText('4개를 가져오지 않기로 했어요. 구글에만 남아요.')).toBeTruthy()
  })
})

describe('AC-8551.3 한꺼번에 저장 실패', () => {
  it('AC-8551.3: onSkipAll이 거짓이면 판은 그대로(줄·수·단추 그대로, 초록 줄 없음)', async () => {
    const onSkipAll = vi.fn(async () => false)
    draw(FIVE, { onSkipAll })
    fireEvent.click(skipAllButton()!)
    fireEvent.click(within(ask()).getByRole('button', { name: '가져오지 않기' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(onSkipAll).toHaveBeenCalledTimes(1)
    expect(shownIds()).toEqual(['f1', 'f2', 'f3', 'l1'])
    expect(screen.getByRole('dialog', { name: '고쳐야 할 구글 예약 4개 · 전체 5개' })).toBeTruthy()
    expect(skipAllButton()).not.toBeNull()
    expect(document.body.textContent).not.toContain('가져오지 않기로 했어요')
  })
})
