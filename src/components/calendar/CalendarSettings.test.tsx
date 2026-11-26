// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RoleProvider } from '@/components/shell/role'
import type { CalSettings } from '@/types/calendar'
import { CalendarSettings } from './CalendarSettings'

// 예약 설정 판 (spec clinic-calendar AC-5905.5, 시안 ?s=settings).
// 종류(▲▼·이름·기본 길이·색 또는 시행자 색 따름·지우기, 하나 이상). 검사는 lib/storage checkCalendarKinds. [저장]은 onSave로 고친 설정만 넘긴다(저장은 화면이 한다).
// 시행자·보이는 시간·주 보기 요일은 설정 → 병원 정보에서 고친다(spec clinic-profile AC-6603.4): 서랍에는 안내 글 + 원장만 [병원 정보로 가기]

afterEach(cleanup)

const SETTINGS: CalSettings = {
  kinds: [
    { id: 'dosu', name: '도수', len: 30, color: null, words: ['도수'] },
    { id: 'jabo', name: '자보도수', len: 30, color: null, words: ['자보도수'] },
    { id: 'inj', name: '주사', len: 10, color: 'flamingo', words: ['주사'] },
  ],
  staff: [
    { id: 'ga', name: '한○○', mark: '가', color: 'blueberry' },
    { id: 'na', name: '윤○○', mark: '나', color: 'basil' },
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
const kindNames = () => screen.getAllByRole('textbox', { name: '종류 이름' }).map((input) => (input as HTMLInputElement).value)
const saveButton = () => screen.getByRole('button', { name: '저장' }) as HTMLButtonElement
const problem = () => document.querySelector('[data-problem]')?.textContent ?? ''
const saved = (calls: ReturnType<typeof draw>) => calls.save.mock.calls[0]![0] as CalSettings
const paletteNames = (palette: HTMLElement) => within(palette).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)

// 색판 차례(google-link AC-8503.2): 시행자 색 따름 · 캘린더 기본 색 · 구글 일정 11색(colorId 1~11 차례, 시안 이름)
const PALETTE_11 = ['라벤더', '세이지', '포도', '플라밍고', '바나나', '귤', '공작', '흑연', '블루베리', '바질', '토마토']
const OLD_20 = ['파랑', '청록', '보라', '주황', '분홍', '연두', '남색', '하늘', '갈색', '빨강', '노랑', '초록', '민트', '자주', '와인', '진초록', '연보라', '산호', '검정', '회색']

describe('AC-5905.5: 설정 판 — 글', () => {
  it('AC-5905.5·AC-6603.4: 제목·종류 칸 제목·설명·알아 둘 글 세 줄이 시안 그대로(시행자·보이는 시간 칸은 병원 정보로 옮김)', () => {
    draw()
    expect(screen.getByRole('dialog', { name: '예약 설정' })).toBeTruthy()
    expect(screen.getAllByRole('heading').map((h) => h.textContent)).toEqual(['예약 설정', '종류'])
    expect(screen.getByText("종류마다 기본 길이와 색을 정해요. 색은 고정 색이나 '시행자 색 따름' 중 하나예요. 위에 있을수록 예약 더하기에서 앞에 보여요.")).toBeTruthy()
    expect(screen.queryByText('예약 칸 끝에 (가)처럼 한 글자로 보여요. 담당 색을 따르는 종류는 이 색으로 칠해요.')).toBeNull()
    expect(screen.queryByText('예약표에 보이는 시간이에요. 칸은 10분 단위예요.')).toBeNull()
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
    expect(saved(calls).kinds[1]).toEqual({ id: 'jabo', name: '자보', len: 45, color: null, words: ['자보도수'] }) // 알아볼 글은 그대로 둔다(고치는 곳은 구글 캘린더 설정)
  })

  it('AC-5905.5·AC-8503.2: 색 단추를 누르면 색판 — 시행자 색 따름 · 캘린더 기본 색 · 11색(시안 이름), 옛 20색 이름은 없다', () => {
    const calls = draw()
    const injColor = within(kindRows()[2]!).getByRole('button', { name: /색/ })
    expect(injColor.textContent).toContain('플라밍고')
    expect(within(kindRows()[0]!).getByRole('button', { name: /색/ }).textContent).toContain('시행자 색 따름')
    fireEvent.click(injColor)
    expect(injColor.getAttribute('aria-expanded')).toBe('true')
    const palette = within(kindRows()[2]!).getByRole('group', { name: '색 고르기' })
    expect(paletteNames(palette)).toEqual(['시행자 색 따름', '캘린더 기본 색', ...PALETTE_11])
    for (const old of OLD_20) expect(within(palette).queryByRole('button', { name: old }), old).toBeNull()
    fireEvent.click(within(palette).getByRole('button', { name: '시행자 색 따름' }))
    fireEvent.click(within(kindRows()[0]!).getByRole('button', { name: /색/ }))
    fireEvent.click(within(within(kindRows()[0]!).getByRole('group', { name: '색 고르기' })).getByRole('button', { name: '공작' }))
    fireEvent.click(saveButton())
    expect(saved(calls).kinds.map((k) => k.color)).toEqual(['peacock', null, null])
  })

  it("AC-8503.2: 토마토를 골라 [저장]하면 색 이름 'tomato'로 저장되고, 색 단추 글도 토마토다", () => {
    const calls = draw()
    const dosuColor = within(kindRows()[0]!).getByRole('button', { name: /색/ })
    fireEvent.click(dosuColor)
    fireEvent.click(within(within(kindRows()[0]!).getByRole('group', { name: '색 고르기' })).getByRole('button', { name: '토마토' }))
    expect(within(kindRows()[0]!).getByRole('button', { name: /색/ }).textContent).toContain('토마토')
    fireEvent.click(saveButton())
    expect(saved(calls).kinds.map((k) => k.color)).toEqual(['tomato', null, 'flamingo'])
  })

  it("AC-8503.2: '캘린더 기본 색'을 고르면 색 이름 'default'로 저장되고 색 단추 글도 캘린더 기본 색이다", () => {
    const calls = draw()
    fireEvent.click(within(kindRows()[1]!).getByRole('button', { name: /색/ }))
    fireEvent.click(within(within(kindRows()[1]!).getByRole('group', { name: '색 고르기' })).getByRole('button', { name: '캘린더 기본 색' }))
    expect(within(kindRows()[1]!).getByRole('button', { name: /색/ }).textContent).toContain('캘린더 기본 색')
    fireEvent.click(saveButton())
    expect(saved(calls).kinds.map((k) => k.color)).toEqual([null, 'default', 'flamingo'])
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
    expect(kinds.map((k) => k.words)).toEqual([['자보도수'], ['체외충격파']]) // 새 종류의 알아볼 글은 이름 하나
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

describe('AC-6603.4: 시행자·보이는 시간은 설정 → 병원 정보에서 고친다', () => {
  // 병원 정보를 합친 설정(useCalendarData → mergeClinic): 오후 진료 병원이라 시간 줄이 13~21시여도 서랍은 막지 않는다
  const MERGED: CalSettings = {
    ...SETTINGS,
    openHour: 13,
    closeHour: 21,
    sunday: true,
    days: [
      { open: 780, close: 1260, lunchFrom: null, lunchTo: null },
      { open: 780, close: 1260, lunchFrom: null, lunchTo: null },
      null,
      { open: 780, close: 1260, lunchFrom: null, lunchTo: null },
      { open: 780, close: 1260, lunchFrom: null, lunchTo: null },
      { open: 780, close: 1080, lunchFrom: null, lunchTo: null },
      { open: 780, close: 1080, lunchFrom: null, lunchTo: null },
    ],
    closedDates: ['2026-11-20'],
  }

  it("AC-6603.4: '시행자'·'보이는 시간' 구역 대신 안내 글이 보이고, 시행자·시간 칸이 없다", () => {
    draw()
    expect(screen.getByText('시행자와 진료시간은 설정 → 병원 정보에서 고쳐요.')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: '시행자' })).toBeNull()
    expect(screen.queryByRole('heading', { name: '보이는 시간' })).toBeNull()
    expect(screen.queryByRole('list', { name: '시행자' })).toBeNull()
    for (const name of ['시행자 이름', '표시 한 글자']) expect(screen.queryByRole('textbox', { name })).toBeNull()
    for (const name of ['시작 시간', '끝 시간']) expect(screen.queryByRole('combobox', { name })).toBeNull()
    expect(screen.queryByRole('group', { name: '주 보기 요일' })).toBeNull()
    expect(screen.queryByRole('button', { name: '시행자 더하기' })).toBeNull()
  })

  it('AC-6603.4: 원장에게는 [병원 정보로 가기] 링크(/settings)가 있다', () => {
    draw()
    const link = screen.getByRole('link', { name: '병원 정보로 가기' })
    expect(link.getAttribute('href')).toBe('/settings')
  })

  it('AC-6603.4: 데스크 계정에는 링크가 없고 안내 글만 있다(병원 정보는 원장만 고친다)', () => {
    render(
      <RoleProvider desk>
        <CalendarSettings settings={SETTINGS} onSave={vi.fn()} onClose={vi.fn()} />
      </RoleProvider>,
    )
    expect(screen.getByText('시행자와 진료시간은 설정 → 병원 정보에서 고쳐요.')).toBeTruthy()
    expect(screen.queryByRole('link', { name: '병원 정보로 가기' })).toBeNull()
    expect(screen.getByRole('list', { name: '종류' })).toBeTruthy()
  })

  it('AC-6603.4: 종류만 고쳐 저장한다 — 받은 시행자·시간·요일 진료시간·휴진일은 그대로 넘긴다', () => {
    const calls = draw(MERGED)
    fireEvent.change(screen.getAllByRole('textbox', { name: '종류 이름' })[0]!, { target: { value: '도수치료' } })
    fireEvent.click(saveButton())
    expect(saved(calls)).toEqual({ ...MERGED, kinds: [{ ...MERGED.kinds[0]!, name: '도수치료' }, ...MERGED.kinds.slice(1)] })
  })

  it('AC-6603.4: 옛 보이는 시간 검사(5~12시 시작) 밖이거나 시행자 표시가 겹쳐도 종류가 맞으면 저장할 수 있다', () => {
    const calls = draw({ ...MERGED, staff: [SETTINGS.staff[0]!, { ...SETTINGS.staff[1]!, mark: '가' }] })
    expect(problem()).toBe('')
    expect(saveButton().disabled).toBe(false)
    fireEvent.click(saveButton())
    expect(calls.save).toHaveBeenCalledTimes(1)
  })

  it('AC-5905.5: 저장 실패 글은 판 아래에 보인다', () => {
    render(<CalendarSettings settings={SETTINGS} onSave={vi.fn()} onClose={vi.fn()} error="저장하지 못했어요" />)
    expect(screen.getByText('저장하지 못했어요')).toBeTruthy()
  })
})
