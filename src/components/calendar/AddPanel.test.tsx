// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CalAllDay } from '@/lib/calendar/shapes'
import type { CalAppt, CalSettings } from '@/types/calendar'
import { AddPanel, draftOf, newDraft, type AddDraft } from './AddPanel'

// 예약 더하기·고치기 판 (spec clinic-calendar AC-5905.2·AC-5905.6, 시안 ?s=new·phone-new·overlap-warn·off-warn).
// 판은 draft를 받아 onDraft로 돌려주고(화면이 쥔다), [저장]은 onSave로 칸만 넘긴다(저장은 화면이 한다).
// 비트 찾기 자리는 화면이 넣는 lookup 칸이다(비트 자료를 props로 쥐지 않는다). 경고는 lib/calendar warnings

afterEach(cleanup)

const SETTINGS: CalSettings = {
  kinds: [
    { id: 'dosu', name: '도수', len: 30, color: null, words: ['도수'] },
    { id: 'jabo', name: '자보도수', len: 30, color: null, words: ['자보도수', '자보'] },
    { id: 'shock', name: '충격파', len: 15, color: null, words: ['충격파', '타'] },
    { id: 'inj', name: '주사', len: 10, color: 'flamingo', words: ['주사'] },
    { id: 'visit', name: '진료', len: 10, color: 'sage', words: ['진료'] },
  ],
  staff: [
    { id: 'ga', name: '한○○', mark: '가', color: 'blueberry' },
    { id: 'na', name: '윤○○', mark: '나', color: 'basil' },
    { id: 'da', name: '조○○', mark: '다', color: 'grape' },
    { id: 'ra', name: '강○○', mark: '라', color: 'tangerine' },
    { id: 'won', name: '원장님', mark: '원', color: 'graphite' },
  ],
  openHour: 8,
  closeHour: 20,
  sunday: false,
}

const appt = (over: Partial<CalAppt>): CalAppt => ({
  id: 'a1',
  day: '2026-11-18',
  start: 840,
  len: 30,
  name: '박○○',
  chart: '10457',
  staffId: 'ga',
  staffName: '한○○',
  staffMark: '가',
  kindId: 'dosu',
  kindName: '도수',
  memo: '목·어깨',
  status: 'auto',
  auto: null,
  origDay: null,
  origStart: null,
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
  ...over,
})
const APPTS = [appt({}), appt({ id: 'a2', start: 900, staffId: 'na', staffName: '윤○○', staffMark: '나', status: 'cancel' })]
const ALLDAY: CalAllDay[] = [{ id: 'd1', day: '2026-11-18', type: 'off', memo: null, staffId: 'na', staffName: '윤○○' }]

type Drawn = Partial<Parameters<typeof AddPanel>[0]> & { start?: AddDraft }

// 화면처럼 draft를 쥐고 onDraft로 바꾼다
function draw({ start = newDraft('2026-11-18', 900), ...over }: Drawn = {}) {
  const onSave = vi.fn()
  const onClose = vi.fn()
  const onSettings = vi.fn()
  function Harness() {
    const [draft, setDraft] = useState(start)
    return (
      <AddPanel
        mode="new"
        draft={draft}
        onDraft={setDraft}
        settings={SETTINGS}
        appts={APPTS}
        allday={ALLDAY}
        bit
        onSave={onSave}
        onClose={onClose}
        onSettings={onSettings}
        {...over}
      />
    )
  }
  render(<Harness />)
  return { onSave, onClose, onSettings }
}

const saveButton = () => screen.getByRole('button', { name: /저장$/ })
const need = () => document.querySelector('[data-need]')?.textContent ?? ''
const startInput = () => screen.getByLabelText('시작') as HTMLInputElement
// '시작' 칸이 가리키는 고르기 목록(datalist)의 값들
const startOptions = () => {
  const id = startInput().getAttribute('list')
  const list = id ? document.getElementById(id) : null
  return list?.tagName === 'DATALIST' ? Array.from(list.querySelectorAll('option')).map((o) => o.value) : []
}
// 이름·담당·종류를 채운 판(시작만 보면 되게)
const READY: AddDraft = { ...newDraft('2026-11-18', 900), name: '이○○', staffId: 'ga', staffName: '한○○', staffMark: '가', kindId: 'inj', kindName: '주사', len: 10 }

describe('AC-5905.2: 예약 더하기 — 칸·꼭 채울 칸·저장', () => {
  it('AC-5905.2·AC-6002.2: 판 제목·칸 이름이 시안 그대로이고 날짜 아래 요일, 시작은 HH:MM 글 칸(5분 단위 고르기 목록, AC-8503.6)', () => {
    draw()
    expect(screen.getByRole('dialog', { name: '예약 더하기' })).toBeTruthy()
    expect((screen.getByLabelText('날짜') as HTMLInputElement).value).toBe('2026-11-18')
    expect(screen.getByText('11월 18일 (수)')).toBeTruthy()
    const start = screen.getByLabelText('시작') as HTMLInputElement
    expect(start.value).toBe('15:00')
    const list = startOptions()
    expect(list[0]).toBe('08:00')
    expect(list[1]).toBe('08:05')
    expect(list[list.length - 1]).toBe('19:55')
    expect(screen.getByText('1430처럼 쳐도 돼요 · 5분 단위')).toBeTruthy()
    expect(screen.getByText('신환이면 비워요')).toBeTruthy()
    expect(screen.getByRole('group', { name: '담당' })).toBeTruthy()
    expect(screen.getByRole('group', { name: '종류' })).toBeTruthy()
    expect(screen.getByText('종류를 고르면 그 종류의 기본 길이가 들어가요 · 5분씩 바꿔요')).toBeTruthy()
    expect((screen.getByLabelText(/메모/) as HTMLTextAreaElement).placeholder).toBe('예: 허리, 3회차')
  })

  it('AC-5905.2: 이름·담당·종류가 비면 [저장]이 막히고 무엇을 채울지 알린다', () => {
    const { onSave } = draw()
    expect(need()).toBe('이름·담당·종류 칸을 채우면 저장할 수 있어요')
    expect((saveButton() as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('이름'), { target: { value: '김' } })
    expect(need()).toBe('담당·종류 칸을 채우면 저장할 수 있어요')
    fireEvent.click(saveButton())
    expect(onSave).not.toHaveBeenCalled()
  })

  it('AC-5905.2: 담당·종류를 고르면 눌림 표시, 종류를 고르면 길이가 그 종류 기본이 되고 저장하면 칸이 넘어간다', () => {
    const { onSave } = draw()
    fireEvent.change(screen.getByLabelText('이름'), { target: { value: ' 이○○ ' } })
    fireEvent.change(screen.getByLabelText(/차트번호/), { target: { value: '10318' } })
    const staff = screen.getByRole('button', { name: '(가) 한○○' })
    fireEvent.click(staff)
    expect(staff.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: '충격파 15분' }))
    expect(screen.getByText('15분', { selector: 'output' })).toBeTruthy()
    expect(screen.getByText('15:00 – 15:15')).toBeTruthy()
    fireEvent.change(screen.getByLabelText(/메모/), { target: { value: '  무릎 ' } })
    expect(need()).toBe('')
    expect(saveButton().textContent).toBe('저장')
    fireEvent.click(saveButton())
    expect(onSave).toHaveBeenCalledWith({
      day: '2026-11-18',
      start: 900,
      len: 15,
      name: '이○○',
      chart: '10318',
      staffId: 'ga',
      staffName: '한○○',
      staffMark: '가',
      kindId: 'shock',
      kindName: '충격파',
      memo: '무릎',
    })
  })

  it('AC-5905.2: 차트번호는 숫자만(10자리까지), 비우면 null로 넘어간다(신환)', () => {
    const { onSave } = draw({ start: { ...newDraft('2026-11-18', 900), name: '홍○○', staffId: 'ga', staffName: '한○○', staffMark: '가', kindId: 'inj', kindName: '주사', len: 10 } })
    const chart = screen.getByLabelText(/차트번호/) as HTMLInputElement
    fireEvent.change(chart, { target: { value: 'a12b3' } })
    expect(chart.value).toBe('123')
    fireEvent.change(chart, { target: { value: '123456789012' } })
    expect(chart.value).toBe('1234567890')
    fireEvent.change(chart, { target: { value: '' } })
    fireEvent.click(saveButton())
    expect(onSave.mock.calls[0]![0].chart).toBeNull()
  })

  it('AC-5905.2: 길이는 5분씩 5~240분', () => {
    draw({ start: { ...newDraft('2026-11-18', 900), len: 10 } })
    const less = screen.getByRole('button', { name: '5분 줄이기' })
    const more = screen.getByRole('button', { name: '5분 늘리기' })
    fireEvent.click(less)
    fireEvent.click(less)
    expect(screen.getByText('5분', { selector: 'output' })).toBeTruthy()
    fireEvent.click(more)
    expect(screen.getByText('10분', { selector: 'output' })).toBeTruthy()
    cleanup()
    draw({ start: { ...newDraft('2026-11-18', 900), len: 235 } })
    fireEvent.click(screen.getByRole('button', { name: '5분 늘리기' }))
    fireEvent.click(screen.getByRole('button', { name: '5분 늘리기' }))
    expect(screen.getByText('240분', { selector: 'output' })).toBeTruthy()
  })

  it('AC-5905.2: 날짜·시작을 바꾸면 draft가 바뀐다', () => {
    draw()
    fireEvent.change(screen.getByLabelText('날짜'), { target: { value: '2026-11-19' } })
    expect(screen.getByText('11월 19일 (목)')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('시작'), { target: { value: '1020' } })
    expect(screen.getByText('10:20 – 10:50')).toBeTruthy()
  })

  it('AC-5905.2: [취소]·닫기는 onClose, 저장 실패 글은 판 안에 보인다', () => {
    const { onClose } = draw({ error: '저장하지 못했어요' })
    expect(screen.getByText('저장하지 못했어요')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '취소' }))
    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('AC-5905.2: 시행자가 없으면 설정에서 먼저 더하라는 글과 [설정]', () => {
    const { onSettings } = draw({ settings: { ...SETTINGS, staff: [] } })
    expect(screen.getByText('설정에서 시행자를 먼저 더해 주세요')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '설정' }))
    expect(onSettings).toHaveBeenCalledTimes(1)
  })
})

describe('AC-5905.2: 경고(저장은 됨) — 담당 겹침·휴무인 담당', () => {
  it('AC-5905.2: 같은 담당의 취소 아닌 예약과 겹치면 경고 글과 [그래도 저장](시안 ?s=overlap-warn)', () => {
    const start: AddDraft = { ...newDraft('2026-11-18', 860), name: '이○○', chart: '10318', staffId: 'ga', staffName: '한○○', staffMark: '가', kindId: 'dosu', kindName: '도수' }
    const { onSave } = draw({ start })
    const alerts = screen.getAllByRole('alert')
    expect(alerts.map((a) => a.textContent)).toEqual(['(가) 한○○ 담당에게 같은 시간 예약이 있어요: 14:00–14:30 10457 박○○ 도수. 겹쳐도 저장할 수 있어요.'])
    expect(saveButton().textContent).toBe('그래도 저장')
    fireEvent.click(saveButton())
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('AC-5905.2: 그날 휴무인 담당을 고르면 경고 글, 담당 단추에 휴무 꼬리표(시안 ?s=off-warn)', () => {
    const start: AddDraft = { ...newDraft('2026-11-18', 660), name: '최○○', chart: '20944', staffId: 'na', staffName: '윤○○', staffMark: '나', kindId: 'jabo', kindName: '자보도수' }
    draw({ start })
    expect(screen.getByRole('button', { name: /^\(나\) 윤○○/ }).textContent).toContain('휴무')
    expect(screen.getByRole('button', { name: /^\(가\) 한○○/ }).textContent).not.toContain('휴무')
    expect(screen.getAllByRole('alert').map((a) => a.textContent)).toEqual(['(나) 윤○○ 담당은 11월 18일 (수) 휴무예요. 그래도 저장할 수 있어요.'])
    expect(saveButton().textContent).toBe('그래도 저장')
  })

  it('AC-5905.2: 취소한 예약·끝이 시작과 같은 예약·고치는 예약 자신과는 겹침이 아니다', () => {
    const start: AddDraft = { ...newDraft('2026-11-18', 870), name: '이○○', chart: '', staffId: 'ga', staffName: '한○○', staffMark: '가', kindId: 'dosu', kindName: '도수' }
    draw({ start })
    expect(screen.queryByRole('alert')).toBeNull()
    cleanup()
    draw({ mode: 'edit', editId: 'a1', start: draftOf(appt({})) })
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('AC-7616.1·AC-7616.2: 반차 휴무인 담당', () => {
  // 11/18(수): (나) 오전 반차 휴무 · (다) 오후 반차 휴무 · (라) 종일 휴무(part null)
  const HALF: CalAllDay[] = [
    { id: 'h1', day: '2026-11-18', type: 'off', memo: null, staffId: 'na', staffName: '윤○○', part: 'am' },
    { id: 'h2', day: '2026-11-18', type: 'off', memo: null, staffId: 'da', staffName: '조○○', part: 'pm' },
    { id: 'h3', day: '2026-11-18', type: 'off', memo: null, staffId: 'ra', staffName: '강○○', part: null },
  ]
  const pick = (start: number, staffId: string, staffName: string, staffMark: string): AddDraft => ({
    ...newDraft('2026-11-18', start),
    name: '최○○',
    chart: '20944',
    staffId,
    staffName,
    staffMark,
    kindId: 'dosu',
    kindName: '도수',
  })
  // 담당 단추(이름이 '(표시) '로 시작) 안 휴무 칩 글
  const tag = (mark: string) => {
    const group = screen.getByRole('group', { name: '담당' })
    const button = within(group)
      .getAllByRole('button')
      .find((b) => (b.textContent ?? '').startsWith(`(${mark}) `))
    return button?.querySelector('span:last-child')?.textContent
  }
  const alerts = () => screen.queryAllByRole('alert').map((a) => a.textContent)

  it("AC-7616.1: 담당 단추의 휴무 칩은 반차면 '오전 휴무'·'오후 휴무', part 없으면 지금 그대로 '휴무'다", () => {
    draw({ allday: HALF })
    expect(tag('나')).toBe('오전 휴무')
    expect(tag('다')).toBe('오후 휴무')
    expect(tag('라')).toBe('휴무')
    expect(screen.getByRole('button', { name: /^\(가\) 한○○/ }).textContent).not.toContain('휴무')
  })

  it('AC-7616.2: 오전 휴무 담당은 시작이 13:00(기본 경계) 앞일 때만 휴무 경고다 — 저장은 막지 않는다', () => {
    draw({ allday: HALF, start: pick(720, 'na', '윤○○', '나') })
    expect(alerts()).toEqual(['(나) 윤○○ 담당은 11월 18일 (수) 휴무예요. 그래도 저장할 수 있어요.'])
    expect(saveButton().textContent).toBe('그래도 저장')
    cleanup()
    draw({ allday: HALF, start: pick(780, 'na', '윤○○', '나') })
    expect(alerts()).toEqual([])
  })

  it('AC-7616.2: 오후 휴무 담당은 끝이 경계 뒤일 때만 휴무 경고다', () => {
    draw({ allday: HALF, start: pick(750, 'da', '조○○', '다') }) // 12:30–13:00
    expect(alerts()).toEqual([])
    cleanup()
    draw({ allday: HALF, start: pick(760, 'da', '조○○', '다') }) // 12:40–13:10
    expect(alerts()).toEqual(['(다) 조○○ 담당은 11월 18일 (수) 휴무예요. 그래도 저장할 수 있어요.'])
  })

  it('AC-7616.2: 경계는 화면이 넘긴 noon(그 요일 병원 점심 시작)이다. 종일 휴무는 시간과 상관없이 지금 그대로 경고다', () => {
    draw({ allday: HALF, noon: 720, start: pick(750, 'na', '윤○○', '나') }) // 점심 12:00이면 12:30 시작은 오후 일
    expect(alerts()).toEqual([])
    cleanup()
    draw({ allday: HALF, noon: 720, start: pick(750, 'da', '조○○', '다') })
    expect(alerts()).toEqual(['(다) 조○○ 담당은 11월 18일 (수) 휴무예요. 그래도 저장할 수 있어요.'])
    cleanup()
    draw({ allday: HALF, noon: 720, start: pick(1020, 'ra', '강○○', '라') })
    expect(alerts()).toEqual(['(라) 강○○ 담당은 11월 18일 (수) 휴무예요. 그래도 저장할 수 있어요.'])
  })
})

describe('AC-5905.6: 비트 찾기 자리·비트 없는 기기', () => {
  it('AC-5905.6: 비트 PC는 안내 상자와 화면이 넣은 lookup 칸을 그린다. 채운 칸은 옅은 초록 표시', () => {
    draw({ lookup: <p>찾기 자리</p>, filled: 'chart' })
    expect(screen.getByText('비트 PC예요. 이름이나 차트번호를 적으면 비트에서 찾아 나머지 하나를 채워요.')).toBeTruthy()
    expect(screen.getByText('찾기 자리')).toBeTruthy()
    expect((screen.getByLabelText(/차트번호/) as HTMLInputElement).placeholder).toBe('이름을 고르면 채워져요')
    expect(screen.getByLabelText(/차트번호/).getAttribute('data-filled')).toBe('true')
    expect(screen.getByLabelText('이름').getAttribute('data-filled')).toBeNull()
    expect(document.body.textContent).not.toContain('비트 PC에서는 자동으로 채워져요')
  })

  it('AC-5905.6: 이름·차트번호를 고치면 onDraft로 화면에 알린다(화면이 400ms 뒤 찾는다)', () => {
    const onDraft = vi.fn()
    render(
      <AddPanel mode="new" draft={newDraft('2026-11-18', 900)} onDraft={onDraft} settings={SETTINGS} appts={[]} allday={[]} bit onSave={vi.fn()} onClose={vi.fn()} />,
    )
    fireEvent.change(screen.getByLabelText('이름'), { target: { value: '김○' } })
    expect(onDraft).toHaveBeenLastCalledWith(expect.objectContaining({ name: '김○' }))
    fireEvent.change(screen.getByLabelText(/차트번호/), { target: { value: '10231' } })
    expect(onDraft).toHaveBeenLastCalledWith(expect.objectContaining({ chart: '10231' }))
  })

  it('AC-5905.6: 비트 없는 기기(폰)는 손으로 적는다 — 안내 상자·lookup 없이 "비트 PC에서는 자동으로 채워져요"(시안 ?s=phone-new)', () => {
    draw({ bit: false, lookup: <p>찾기 자리</p> })
    expect(screen.getByText('비트 PC에서는 자동으로 채워져요')).toBeTruthy()
    expect(screen.queryByText('찾기 자리')).toBeNull()
    expect(document.body.textContent).not.toContain('비트 PC예요.')
    expect((screen.getByLabelText('이름') as HTMLInputElement).placeholder).toBe('이름')
    expect((screen.getByLabelText(/차트번호/) as HTMLInputElement).placeholder).toBe('차트번호')
  })
})

describe('AC-5905.2·AC-5906.2: 고치기', () => {
  it('AC-5906.2: 고치기 판은 제목이 "예약 고치기"이고 변경 안내에 지금 처음 자리를 적는다', () => {
    const moved = appt({ id: 'a9', day: '2026-11-17', start: 570, origDay: '2026-11-18', origStart: 900 })
    draw({ mode: 'edit', editId: moved.id, orig: { day: '2026-11-18', start: 900 }, start: draftOf(moved) })
    expect(screen.getByRole('dialog', { name: '예약 고치기' })).toBeTruthy()
    expect(
      screen.getByText(
        "날짜나 시작 시간을 바꾸면 예약표에 '변경'으로 보이고 처음 시간이 남아요 (지금: 원래 11/18 (수) 15:00). 길이·담당·종류·메모만 바꾸면 표시하지 않아요.",
      ),
    ).toBeTruthy()
  })

  it('AC-5905.2: draftOf는 예약 칸을 그대로 옮기고 차트번호 null은 빈 글자다', () => {
    expect(draftOf(appt({ chart: null }))).toEqual({
      day: '2026-11-18',
      start: 840,
      len: 30,
      name: '박○○',
      chart: '',
      staffId: 'ga',
      staffName: '한○○',
      staffMark: '가',
      kindId: 'dosu',
      kindName: '도수',
      memo: '목·어깨',
    })
  })

  it('AC-5905.2: 목록에서 지운 시행자·종류의 예약을 고치면 저장된 이름 그대로 눌린 단추로 보인다', () => {
    const old = appt({ staffId: 'gone', staffName: '퇴사○○', staffMark: '퇴', kindId: 'old', kindName: '옛종류' })
    draw({ mode: 'edit', editId: old.id, start: draftOf(old) })
    expect(within(screen.getByRole('group', { name: '담당' })).getByRole('button', { name: '(퇴) 퇴사○○' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(screen.getByRole('group', { name: '종류' })).getByRole('button', { name: /^옛종류/ }).getAttribute('aria-pressed')).toBe('true')
  })
})

// 시행자 없는 예약(구글에서 시행자 없이 가져온 지난 예약, spec google-link AC-8532.5 뒤쪽 — TASK-21): 고치기 판의 담당 고르기에만 '없음'
describe("AC-8532.5: 시행자 없는 예약의 고치기 판 '없음'", () => {
  const NO_STAFF = appt({ id: 'a7', staffId: null, staffName: null, staffMark: null })

  it("AC-8532.5: 시행자 없는 예약을 고치면 담당 맨 앞에 '없음'이 눌려 있고, 그대로 저장하면 시행자 세 칸이 비어(null) 간다", () => {
    const { onSave } = draw({ mode: 'edit', editId: NO_STAFF.id, allowNoStaff: true, start: draftOf(NO_STAFF) })
    const group = within(screen.getByRole('group', { name: '담당' }))
    const buttons = group.getAllByRole('button')
    expect(buttons[0]!.textContent).toBe('없음')
    expect(buttons[0]!.getAttribute('aria-pressed')).toBe('true')
    expect(need()).toBe('')
    fireEvent.click(saveButton())
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ staffId: null, staffName: null, staffMark: null }))
  })

  it("AC-8532.5: '없음' 판에서 시행자를 고르면 그 시행자로, 다시 '없음'을 누르면 비운다", () => {
    const { onSave } = draw({ mode: 'edit', editId: NO_STAFF.id, allowNoStaff: true, start: draftOf(NO_STAFF) })
    const group = () => within(screen.getByRole('group', { name: '담당' }))
    fireEvent.click(group().getByRole('button', { name: /^\(나\) 윤○○/ })) // 11/18 휴무 칩이 붙는다
    expect(group().getByRole('button', { name: '없음' }).getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(saveButton())
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ staffId: 'na', staffName: '윤○○', staffMark: '나' }))
    fireEvent.click(group().getByRole('button', { name: '없음' }))
    fireEvent.click(saveButton())
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ staffId: null, staffName: null, staffMark: null }))
  })

  it("AC-8532.5: 시행자 있는 예약의 고치기·새 예약 판에는 '없음'이 없고 담당을 골라야 저장된다", () => {
    draw({ mode: 'edit', editId: 'a1', start: draftOf(appt({})) })
    expect(within(screen.getByRole('group', { name: '담당' })).queryByRole('button', { name: '없음' })).toBeNull()
    cleanup()
    draw()
    expect(within(screen.getByRole('group', { name: '담당' })).queryByRole('button', { name: '없음' })).toBeNull()
    expect(need()).toContain('담당')
  })

  it('AC-8529.3: 시행자가 없을 때 [설정]은 구글 캘린더 설정의 시행자·종류로 가는 링크다(settingsHref)', () => {
    draw({ settings: { ...SETTINGS, staff: [] }, settingsHref: '/settings/google-calendar?tab=colors' })
    expect(screen.getByRole('link', { name: '설정' }).getAttribute('href')).toBe('/settings/google-calendar?tab=colors')
  })
})

describe('AC-6002: 시작 시간 쳐서 넣기 (spec calendar-colors, 시안 ④)', () => {
  it('AC-6002.2·AC-8503.6: 시작은 글 칸 — 이름표 시작, placeholder "예: 1430", 숫자 자판, 자동 채움 끔, 고르기 목록은 보이는 시간 안 5분 칸 HH:MM', () => {
    draw()
    const start = startInput()
    expect(start.tagName).toBe('INPUT')
    expect(start.type).toBe('text')
    expect(start.placeholder).toBe('예: 1430')
    expect(start.getAttribute('inputmode')).toBe('numeric')
    expect(start.getAttribute('autocomplete')).toBe('off')
    expect(start.value).toBe('15:00')
    const list = startOptions()
    expect(list).toHaveLength(144) // 8시~20시, 5분 칸
    expect(list.slice(0, 3)).toEqual(['08:00', '08:05', '08:10'])
    expect(list).toContain('09:15')
    expect(list).toContain('15:00')
    expect(list.every((v) => /^\d{2}:\d{2}$/.test(v))).toBe(true)
    expect(screen.getByText('1430처럼 쳐도 돼요 · 5분 단위')).toBeTruthy()
    expect(start.getAttribute('aria-invalid')).toBeNull()
  })

  it('AC-6002.2: 지금 시각이 보이는 시간 밖이면 그 값도 고르기 목록에 있고, 칸을 들어갔다 나와도 시각이 바뀌지 않는다', () => {
    const { onSave } = draw({ start: { ...READY, start: 430 } }) // 07:10 (보이는 시간 8~20시 밖)
    expect(startInput().value).toBe('07:10')
    expect(startOptions()[0]).toBe('07:10')
    fireEvent.focus(startInput())
    fireEvent.blur(startInput())
    expect(startInput().value).toBe('07:10')
    expect(screen.getByText('07:10 – 07:20')).toBeTruthy()
    fireEvent.click(saveButton())
    expect(onSave.mock.calls[0]![0].start).toBe(430)
  })

  it('AC-6002.2: 쳐서 읽히면 바로 판 시각(draft.start)이 바뀌고, 칸을 벗어나면 글이 HH:MM 모양이 된다', () => {
    const onDraft = vi.fn()
    render(<AddPanel mode="new" draft={READY} onDraft={onDraft} settings={SETTINGS} appts={[]} allday={[]} bit={false} onSave={vi.fn()} onClose={vi.fn()} />)
    fireEvent.change(startInput(), { target: { value: '14시30분' } })
    expect(onDraft).toHaveBeenLastCalledWith({ ...READY, start: 870 })
    cleanup()

    const { onSave } = draw({ start: READY })
    fireEvent.change(startInput(), { target: { value: '1430' } })
    expect(startInput().value).toBe('1430') // 치는 동안은 친 글 그대로
    expect(screen.getByText('14:30 – 14:40')).toBeTruthy()
    fireEvent.blur(startInput())
    expect(startInput().value).toBe('14:30')
    fireEvent.change(startInput(), { target: { value: '230' } }) // 보이는 8~20시에서 오후로 봄
    fireEvent.blur(startInput())
    expect(startInput().value).toBe('14:30')
    fireEvent.change(startInput(), { target: { value: '09:30' } }) // 고르기 목록에서 고름
    expect(screen.getByText('09:30 – 09:40')).toBeTruthy()
    fireEvent.click(saveButton())
    expect(onSave.mock.calls[0]![0].start).toBe(570)
  })

  it('AC-8503.6: 5분 단위 시작(0915 · 14:35)을 받아 판 시각이 바뀌고 저장된다', () => {
    const { onSave } = draw({ start: READY })
    fireEvent.change(startInput(), { target: { value: '0915' } })
    expect(screen.getByText('09:15 – 09:25')).toBeTruthy()
    fireEvent.blur(startInput())
    expect(startInput().value).toBe('09:15')
    expect(startInput().getAttribute('aria-invalid')).toBeNull()
    fireEvent.change(startInput(), { target: { value: '14:35' } })
    fireEvent.blur(startInput())
    expect(screen.getByText('1430처럼 쳐도 돼요 · 5분 단위')).toBeTruthy()
    fireEvent.click(saveButton())
    expect(onSave.mock.calls[0]![0].start).toBe(875)
  })

  it("AC-6002.3: 못 읽는 글이 있는 동안 판 시각은 그대로, 저장 줄은 '시작 칸을 채우면 저장할 수 있어요'이고 [저장]이 막힌다. 치는 동안에는 오류 글이 없다", () => {
    const { onSave } = draw({ start: READY })
    fireEvent.change(startInput(), { target: { value: '1432' } })
    expect(screen.getByText('15:00 – 15:10')).toBeTruthy()
    expect(need()).toBe('시작 칸을 채우면 저장할 수 있어요')
    expect((saveButton() as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(saveButton())
    expect(onSave).not.toHaveBeenCalled()
    expect(document.body.textContent).not.toContain('5분 단위로 적어 주세요')
    expect(startInput().getAttribute('aria-invalid')).toBeNull()
    expect(screen.getByText('1430처럼 쳐도 돼요 · 5분 단위')).toBeTruthy()
  })

  it("AC-6002.3: 이름·담당·종류도 비었으면 '시작'이 맨 앞이다", () => {
    draw()
    fireEvent.change(startInput(), { target: { value: '' } })
    expect(need()).toBe('시작·이름·담당·종류 칸을 채우면 저장할 수 있어요')
  })

  it('AC-6002.3: 못 읽는 글을 두고 칸을 벗어나면 칸 아래 오류 글과 aria-invalid, 바르게 고치면 오류가 사라지고 저장된다', () => {
    const { onSave } = draw({ start: READY })
    const start = startInput()
    fireEvent.change(start, { target: { value: '1432' } })
    fireEvent.blur(start)
    expect(start.value).toBe('1432')
    const step = screen.getByText('5분 단위로 적어 주세요 (예: 14:30)')
    expect(step.className).toContain('text-negative')
    expect(start.getAttribute('aria-invalid')).toBe('true')
    expect(start.getAttribute('aria-describedby')).toBe(step.id)
    expect(screen.queryByText('1430처럼 쳐도 돼요 · 5분 단위')).toBeNull()

    fireEvent.change(start, { target: { value: '25시' } })
    fireEvent.blur(start)
    expect(screen.getByText('시간을 14:30처럼 적어 주세요')).toBeTruthy()
    expect(start.getAttribute('aria-invalid')).toBe('true')
    expect(need()).toBe('시작 칸을 채우면 저장할 수 있어요')

    fireEvent.change(start, { target: { value: '1440' } })
    expect(screen.queryByText('시간을 14:30처럼 적어 주세요')).toBeNull()
    expect(start.getAttribute('aria-invalid')).toBeNull()
    fireEvent.blur(start)
    expect(start.value).toBe('14:40')
    expect(screen.getByText('1430처럼 쳐도 돼요 · 5분 단위')).toBeTruthy()
    expect(need()).toBe('')
    fireEvent.click(saveButton())
    expect(onSave.mock.calls[0]![0].start).toBe(880)
  })

  it('AC-6002.4: 판이 열린 채 판 밖에서 draft 시각이 바뀌면 시작 글도 그 시각 HH:MM이 되고 오류가 지워진다', () => {
    function Outside() {
      const [draft, setDraft] = useState(READY)
      return (
        <>
          <button type="button" onClick={() => setDraft((d) => ({ ...d, start: 660 }))}>
            빈 칸 11:00
          </button>
          <AddPanel mode="new" draft={draft} onDraft={setDraft} settings={SETTINGS} appts={[]} allday={[]} bit={false} onSave={vi.fn()} onClose={vi.fn()} />
        </>
      )
    }
    render(<Outside />)
    fireEvent.change(startInput(), { target: { value: 'abc' } })
    fireEvent.blur(startInput())
    expect(screen.getByText('시간을 14:30처럼 적어 주세요')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '빈 칸 11:00' }))
    expect(startInput().value).toBe('11:00')
    expect(screen.queryByText('시간을 14:30처럼 적어 주세요')).toBeNull()
    expect(startInput().getAttribute('aria-invalid')).toBeNull()
    expect(need()).toBe('')

    fireEvent.change(startInput(), { target: { value: '1430' } }) // 판이 친 글을 따라간 것은 바깥 바뀜이 아니다
    expect(startInput().value).toBe('1430')
    fireEvent.click(screen.getByRole('button', { name: '빈 칸 11:00' }))
    expect(startInput().value).toBe('11:00')
  })
})
