// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CalSettings } from '@/types/calendar'
import { CalendarSettings } from './CalendarSettings'

// 예약 설정 판 (spec clinic-calendar AC-5905.5, 시안 ?s=settings).
// 종류(▲▼·이름·기본 길이·색 또는 시행자 색 따름·지우기, 하나 이상)·시행자(이름·한 글자·색, 한 글자 겹침 막음)·보이는 시간(1시간 단위)·일요일 보기.
// 검사는 lib/storage checkCalendarSettings. [저장]은 onSave로 고친 설정만 넘긴다(저장은 화면이 한다)

afterEach(cleanup)

const SETTINGS: CalSettings = {
  kinds: [
    { id: 'dosu', name: '도수', len: 30, color: null },
    { id: 'jabo', name: '자보도수', len: 30, color: null },
    { id: 'inj', name: '주사', len: 10, color: 'pink' },
  ],
  staff: [
    { id: 'ga', name: '한○○', mark: '가', color: 'blue' },
    { id: 'na', name: '윤○○', mark: '나', color: 'teal' },
  ],
  openHour: 8,
  closeHour: 20,
  sunday: false,
}

function draw(settings: CalSettings = SETTINGS) {
  const calls = { save: vi.fn(), close: vi.fn() }
  render(<CalendarSettings settings={settings} onSave={calls.save} onClose={calls.close} />)
  return calls
}

const kindRows = () => within(screen.getByRole('list', { name: '종류' })).getAllByRole('listitem')
const staffRows = () => within(screen.getByRole('list', { name: '시행자' })).getAllByRole('listitem')
const kindNames = () => screen.getAllByRole('textbox', { name: '종류 이름' }).map((input) => (input as HTMLInputElement).value)
const saveButton = () => screen.getByRole('button', { name: '저장' }) as HTMLButtonElement
const problem = () => document.querySelector('[data-problem]')?.textContent ?? ''
const saved = (calls: ReturnType<typeof draw>) => calls.save.mock.calls[0]![0] as CalSettings
const paletteNames = (palette: HTMLElement) => within(palette).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)

// 20색 색판 차례(calendar-colors AC-6001.1): 옛 아홉(파랑~갈색) → 새 열 → 회색(맨 끝)
const PALETTE_20 = [
  '파랑',
  '청록',
  '보라',
  '주황',
  '분홍',
  '연두',
  '남색',
  '하늘',
  '갈색',
  '빨강',
  '노랑',
  '초록',
  '민트',
  '자주',
  '와인',
  '진초록',
  '연보라',
  '산호',
  '검정',
  '회색',
]

describe('AC-5905.5: 설정 판 — 글', () => {
  it('AC-5905.5: 제목·세 칸 제목·설명·알아 둘 글 세 줄이 시안 그대로', () => {
    draw()
    expect(screen.getByRole('dialog', { name: '예약 설정' })).toBeTruthy()
    for (const name of ['종류', '시행자', '보이는 시간']) expect(screen.getByRole('heading', { name })).toBeTruthy()
    expect(screen.getByText("종류마다 기본 길이와 색을 정해요. 색은 고정 색이나 '시행자 색 따름' 중 하나예요. 위에 있을수록 예약 더하기에서 앞에 보여요.")).toBeTruthy()
    expect(screen.getByText('예약 칸 끝에 (가)처럼 한 글자로 보여요. 담당 색을 따르는 종류는 이 색으로 칠해요.')).toBeTruthy()
    expect(screen.getByText('예약표에 보이는 시간이에요. 칸은 10분 단위예요.')).toBeTruthy()
    expect(screen.getByText('지운 종류의 지난 예약은 그 이름 그대로 남아요')).toBeTruthy()
    for (const line of [
      '지난 예약은 1년 뒤 자동으로 지워져요.',
      '환자 이름과 차트번호는 서버에 저장되고, 의원 계정으로 로그인해야만 보여요.',
      '다른 PC에서 고친 것도 몇 초 안에 이 화면에 보여요.',
    ]) {
      expect(screen.getByText(line)).toBeTruthy()
    }
  })

  it('AC-5905.5: 고치지 않고 [저장]하면 받은 설정 그대로, [취소]·닫기는 onClose', () => {
    const calls = draw()
    fireEvent.click(saveButton())
    expect(saved(calls)).toEqual(SETTINGS)
    fireEvent.click(screen.getByRole('button', { name: '취소' }))
    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(calls.close).toHaveBeenCalledTimes(2)
  })
})

describe('AC-5905.5: 종류', () => {
  it('AC-5905.5: ▲▼로 차례를 바꾼다(첫 줄 ▲·끝 줄 ▼는 막힘)', () => {
    const calls = draw()
    expect((screen.getByRole('button', { name: '1번째 종류 위로' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '3번째 종류 아래로' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '3번째 종류 위로' }))
    expect(kindNames()).toEqual(['도수', '주사', '자보도수'])
    fireEvent.click(screen.getByRole('button', { name: '1번째 종류 아래로' }))
    expect(kindNames()).toEqual(['주사', '도수', '자보도수'])
    fireEvent.click(saveButton())
    expect(saved(calls).kinds.map((k) => k.id)).toEqual(['inj', 'dosu', 'jabo'])
  })

  it('AC-5905.5: 이름(10자)·기본 길이(5~120분, 5분씩)를 고친다', () => {
    const calls = draw()
    const name = screen.getAllByRole('textbox', { name: '종류 이름' })[1] as HTMLInputElement
    expect(name.maxLength).toBe(10)
    fireEvent.change(name, { target: { value: '자보' } })
    const len = within(kindRows()[1]!).getByRole('combobox', { name: '기본 길이' }) as HTMLSelectElement
    expect([...len.options].map((o) => o.textContent).slice(0, 3)).toEqual(['5분', '10분', '15분'])
    expect(len.options[len.options.length - 1]!.textContent).toBe('120분')
    fireEvent.change(len, { target: { value: '45' } })
    fireEvent.click(saveButton())
    expect(saved(calls).kinds[1]).toEqual({ id: 'jabo', name: '자보', len: 45, color: null })
  })

  it('AC-5905.5·AC-6001.3: 색 단추를 누르면 색판 — 시행자 색 따름 또는 20색', () => {
    const calls = draw()
    const injColor = within(kindRows()[2]!).getByRole('button', { name: /색/ })
    expect(injColor.textContent).toContain('분홍')
    expect(within(kindRows()[0]!).getByRole('button', { name: /색/ }).textContent).toContain('시행자 색 따름')
    fireEvent.click(injColor)
    expect(injColor.getAttribute('aria-expanded')).toBe('true')
    const palette = within(kindRows()[2]!).getByRole('group', { name: '색 고르기' })
    expect(paletteNames(palette)).toEqual(['시행자 색 따름', ...PALETTE_20])
    fireEvent.click(within(palette).getByRole('button', { name: '시행자 색 따름' }))
    fireEvent.click(within(kindRows()[0]!).getByRole('button', { name: /색/ }))
    fireEvent.click(within(within(kindRows()[0]!).getByRole('group', { name: '색 고르기' })).getByRole('button', { name: '하늘' }))
    fireEvent.click(saveButton())
    expect(saved(calls).kinds.map((k) => k.color)).toEqual(['sky', null, null])
  })

  it("AC-6001.3: 새 색(빨강)을 골라 [저장]하면 색 이름 'red'로 저장되고, 색 단추 글도 빨강이다", () => {
    const calls = draw()
    const dosuColor = within(kindRows()[0]!).getByRole('button', { name: /색/ })
    fireEvent.click(dosuColor)
    fireEvent.click(within(within(kindRows()[0]!).getByRole('group', { name: '색 고르기' })).getByRole('button', { name: '빨강' }))
    expect(within(kindRows()[0]!).getByRole('button', { name: /색/ }).textContent).toContain('빨강')
    fireEvent.click(saveButton())
    expect(saved(calls).kinds.map((k) => k.color)).toEqual(['red', null, 'pink'])
  })

  it('AC-5905.5: 지우기는 종류가 하나 남으면 막히고, 더하기는 빈 이름 줄 → 이름을 적어야 저장된다', () => {
    const calls = draw({ ...SETTINGS, kinds: SETTINGS.kinds.slice(0, 2) })
    fireEvent.click(within(kindRows()[0]!).getByRole('button', { name: '지우기' }))
    expect(kindNames()).toEqual(['자보도수'])
    expect((within(kindRows()[0]!).getByRole('button', { name: '지우기' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '종류 더하기' }))
    expect(kindNames()).toEqual(['자보도수', ''])
    expect(problem()).toBe('종류 이름을 적어 주세요')
    expect(saveButton().disabled).toBe(true)
    fireEvent.change(screen.getAllByRole('textbox', { name: '종류 이름' })[1]!, { target: { value: '체외충격파' } })
    expect(problem()).toBe('')
    fireEvent.click(saveButton())
    const kinds = saved(calls).kinds
    expect(kinds.map((k) => k.name)).toEqual(['자보도수', '체외충격파'])
    expect(kinds[1]!.id).not.toBe('jabo')
    expect(kinds[1]!.id).not.toBe('dosu')
  })

  it('AC-5905.5: 같은 종류 이름이 있으면 저장할 수 없다', () => {
    draw()
    fireEvent.change(screen.getAllByRole('textbox', { name: '종류 이름' })[1]!, { target: { value: '도수' } })
    expect(problem()).toBe('같은 종류 이름이 있어요')
    expect(saveButton().disabled).toBe(true)
  })
})

describe('AC-5905.5: 시행자', () => {
  it('AC-5905.5: 이름·한 글자·색을 고치고 더한다(새 시행자는 아직 안 쓴 색)', () => {
    const calls = draw()
    fireEvent.click(screen.getByRole('button', { name: '시행자 더하기' }))
    const row = staffRows()[2]!
    fireEvent.change(within(row).getByRole('textbox', { name: '시행자 이름' }), { target: { value: '조○○' } })
    fireEvent.change(within(row).getByRole('textbox', { name: '표시 한 글자' }), { target: { value: '다' } })
    fireEvent.click(within(staffRows()[0]!).getByRole('button', { name: '색 고르기' }))
    fireEvent.click(within(within(staffRows()[0]!).getByRole('group', { name: '색 고르기' })).getByRole('button', { name: '남색' }))
    fireEvent.click(saveButton())
    const staff = saved(calls).staff
    expect(staff.map((s) => [s.name, s.mark, s.color])).toEqual([
      ['한○○', '가', 'navy'],
      ['윤○○', '나', 'teal'],
      ['조○○', '다', 'purple'],
    ])
  })

  it('AC-5905.5·AC-6001.3: 시행자 색판에는 시행자 색 따름이 없고 20색만 있다', () => {
    draw()
    fireEvent.click(within(staffRows()[0]!).getByRole('button', { name: '색 고르기' }))
    const palette = within(staffRows()[0]!).getByRole('group', { name: '색 고르기' })
    expect(within(palette).queryByRole('button', { name: '시행자 색 따름' })).toBeNull()
    expect(within(palette).getAllByRole('button')).toHaveLength(20)
    expect(paletteNames(palette)).toEqual(PALETTE_20)
  })

  it("AC-6001.3: 시행자 색판에서 새 색(빨강)을 골라 [저장]하면 'red'로 저장된다", () => {
    const calls = draw()
    fireEvent.click(within(staffRows()[1]!).getByRole('button', { name: '색 고르기' }))
    fireEvent.click(within(within(staffRows()[1]!).getByRole('group', { name: '색 고르기' })).getByRole('button', { name: '빨강' }))
    fireEvent.click(saveButton())
    expect(saved(calls).staff.map((s) => s.color)).toEqual(['blue', 'red'])
  })

  it('AC-6001.4: [+ 시행자 더하기]의 새 색은 안 쓴 색 가운데 20색 차례로 첫 색 — 파랑~갈색 아홉을 다 쓰면 빨강(회색 아님)', () => {
    const nine = ['blue', 'teal', 'purple', 'orange', 'pink', 'lime', 'navy', 'sky', 'brown'] as const
    const marks = ['가', '나', '다', '라', '마', '바', '사', '아', '자']
    const staff = nine.map((color, i) => ({ id: `s${i}`, name: `시행자${i}`, mark: marks[i]!, color }))
    const calls = draw({ ...SETTINGS, staff })
    fireEvent.click(screen.getByRole('button', { name: '시행자 더하기' }))
    const row = staffRows()[9]!
    fireEvent.change(within(row).getByRole('textbox', { name: '시행자 이름' }), { target: { value: '새○○' } })
    fireEvent.change(within(row).getByRole('textbox', { name: '표시 한 글자' }), { target: { value: '차' } })
    fireEvent.click(saveButton())
    expect(saved(calls).staff[9]!.color).toBe('red')
  })

  it('AC-6001.4: 회색은 맨 끝 — 회색 말고 열아홉 색을 다 쓰면 그때 새 시행자 색이 회색이다', () => {
    const nineteen = ['blue', 'teal', 'purple', 'orange', 'pink', 'lime', 'navy', 'sky', 'brown', 'red', 'yellow', 'green', 'mint', 'magenta', 'wine', 'forest', 'lavender', 'coral', 'black'] as const
    const marks = [...'가나다라마바사아자차카타파하ABCDE']
    const staff = nineteen.map((color, i) => ({ id: `s${i}`, name: `시행자${i}`, mark: marks[i]!, color }))
    const calls = draw({ ...SETTINGS, staff })
    fireEvent.click(screen.getByRole('button', { name: '시행자 더하기' }))
    const row = staffRows()[19]!
    fireEvent.change(within(row).getByRole('textbox', { name: '시행자 이름' }), { target: { value: '새○○' } })
    fireEvent.change(within(row).getByRole('textbox', { name: '표시 한 글자' }), { target: { value: 'F' } })
    fireEvent.click(saveButton())
    expect(saved(calls).staff[19]!.color).toBe('gray')
  })

  it('AC-5905.5: 한 글자 표시가 겹치거나 한 글자가 아니면 저장할 수 없다', () => {
    draw()
    const mark = within(staffRows()[1]!).getByRole('textbox', { name: '표시 한 글자' })
    fireEvent.change(mark, { target: { value: '가' } })
    expect(problem()).toBe('같은 표시가 있어요')
    expect(saveButton().disabled).toBe(true)
    fireEvent.change(mark, { target: { value: '나다' } })
    expect(problem()).toBe('표시는 한 글자예요')
    fireEvent.change(mark, { target: { value: '나' } })
    expect(problem()).toBe('')
    expect(saveButton().disabled).toBe(false)
  })

  it('AC-5905.5: 이름이 빈 시행자는 저장할 수 없고, 시행자를 모두 지울 수 있다', () => {
    const calls = draw()
    fireEvent.change(within(staffRows()[0]!).getByRole('textbox', { name: '시행자 이름' }), { target: { value: ' ' } })
    expect(problem()).toBe('시행자 이름을 적어 주세요')
    fireEvent.click(within(staffRows()[1]!).getByRole('button', { name: '지우기' }))
    fireEvent.click(within(staffRows()[0]!).getByRole('button', { name: '지우기' }))
    expect(screen.queryAllByRole('textbox', { name: '시행자 이름' })).toHaveLength(0)
    fireEvent.click(saveButton())
    expect(saved(calls).staff).toEqual([])
  })
})

describe('AC-5905.5: 보이는 시간·일요일', () => {
  it('AC-5905.5: 보이는 시간은 1시간 단위(시작 05:00~12:00, 끝 12:00~24:00)', () => {
    const calls = draw()
    const open = screen.getByRole('combobox', { name: '시작 시간' }) as HTMLSelectElement
    const close = screen.getByRole('combobox', { name: '끝 시간' }) as HTMLSelectElement
    expect([...open.options].map((o) => o.textContent)).toEqual(['05:00', '06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00'])
    expect(close.options[0]!.textContent).toBe('12:00')
    expect(close.options[close.options.length - 1]!.textContent).toBe('24:00')
    fireEvent.change(open, { target: { value: '12' } })
    fireEvent.change(close, { target: { value: '12' } })
    expect(problem()).toBe('끝 시간이 시작 시간보다 늦어야 해요')
    expect(saveButton().disabled).toBe(true)
    fireEvent.change(open, { target: { value: '9' } })
    fireEvent.change(close, { target: { value: '21' } })
    fireEvent.click(saveButton())
    expect(saved(calls)).toMatchObject({ openHour: 9, closeHour: 21 })
  })

  it('AC-5905.5: 주 보기 요일 [월~토]·[월~일]', () => {
    const calls = draw()
    const group = screen.getByRole('group', { name: '주 보기 요일' })
    expect(within(group).getByRole('button', { name: '월~토' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(within(group).getByRole('button', { name: '월~일' }))
    expect(within(group).getByRole('button', { name: '월~일' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(saveButton())
    expect(saved(calls).sunday).toBe(true)
  })

  it('AC-5905.5: 저장 실패 글은 판 아래에 보인다', () => {
    render(<CalendarSettings settings={SETTINGS} onSave={vi.fn()} onClose={vi.fn()} error="저장하지 못했어요" />)
    expect(screen.getByText('저장하지 못했어요')).toBeTruthy()
  })
})
