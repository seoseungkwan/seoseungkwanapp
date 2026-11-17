// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CalAllDay, CalAppt, CalSettings } from '@/types/calendar'
import { AddPanel, draftOf, newDraft, type AddDraft } from './AddPanel'

// 예약 더하기·고치기 판 (spec clinic-calendar AC-5905.2·AC-5905.6, 시안 ?s=new·phone-new·overlap-warn·off-warn).
// 판은 draft를 받아 onDraft로 돌려주고(화면이 쥔다), [저장]은 onSave로 칸만 넘긴다(저장은 화면이 한다).
// 비트 찾기 자리는 화면이 넣는 lookup 칸이다(비트 자료를 props로 쥐지 않는다). 경고는 lib/calendar warnings

afterEach(cleanup)

const SETTINGS: CalSettings = {
  kinds: [
    { id: 'dosu', name: '도수', len: 30, color: null },
    { id: 'jabo', name: '자보도수', len: 30, color: null },
    { id: 'shock', name: '충격파', len: 15, color: null },
    { id: 'inj', name: '주사', len: 10, color: 'pink' },
    { id: 'visit', name: '진료', len: 10, color: 'lime' },
  ],
  staff: [
    { id: 'ga', name: '한○○', mark: '가', color: 'blue' },
    { id: 'na', name: '윤○○', mark: '나', color: 'teal' },
    { id: 'da', name: '조○○', mark: '다', color: 'purple' },
    { id: 'ra', name: '강○○', mark: '라', color: 'orange' },
    { id: 'won', name: '원장님', mark: '원', color: 'gray' },
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

describe('AC-5905.2: 예약 더하기 — 칸·꼭 채울 칸·저장', () => {
  it('AC-5905.2: 판 제목·칸 이름이 시안 그대로이고 날짜 아래 요일, 시작은 10분 단위 고르기', () => {
    draw()
    expect(screen.getByRole('dialog', { name: '예약 더하기' })).toBeTruthy()
    expect((screen.getByLabelText('날짜') as HTMLInputElement).value).toBe('2026-11-18')
    expect(screen.getByText('11월 18일 (수)')).toBeTruthy()
    const start = screen.getByLabelText('시작') as HTMLSelectElement
    expect(start.value).toBe('900')
    expect(start.options[0]!.textContent).toBe('08:00')
    expect(start.options[1]!.textContent).toBe('08:10')
    expect(start.options[start.options.length - 1]!.textContent).toBe('19:50')
    expect(screen.getByText('10분 단위')).toBeTruthy()
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
    fireEvent.change(screen.getByLabelText('시작'), { target: { value: '620' } })
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
