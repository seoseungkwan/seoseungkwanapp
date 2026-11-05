// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FollowupRow, UndecidedRow } from '@/types/patients'
import { ErrorLine, FollowupRows, UndecidedRows } from './FollowupRows'

// F/U 환자 줄(AC-611.5, 목업 fuTool 표·휴대폰 줄). 이름·전화·차트번호는 여기서만 그린다. 줄은 props로만 받는다. 값은 모두 지어낸 것이다
afterEach(cleanup)

const TODAY = '2026-11-04'
const EMPTY = '이 기간에 오실 분이 없어요.'
const KEY = 'f|1|100|2026-11-05'
// 이름·빈 줄은 글자 크기를 따로 주지 않고 목록에서 물려받는다
const TEXT_SIZE = /\btext-(caption|small|body|lead)\b/

const row = (over: Partial<FollowupRow> = {}): FollowupRow => ({
  key: KEY,
  chart: '100',
  name: '시험가',
  phone: '010-0000-0001',
  lastVisit: '2026-10-22',
  next: '2026-11-05',
  nextLabel: '11/5',
  plan: '예정',
  visitKind: 'F/U',
  site: '',
  tx: '',
  evidence: '2주 뒤 재진',
  contacted: false,
  ...over,
})

function draw(rows: FollowupRow[], over: Partial<Parameters<typeof FollowupRows>[0]> = {}) {
  const onMark = vi.fn()
  const view = render(
    <FollowupRows rows={rows} today={TODAY} onMark={onMark} busyKeys={new Set()} markErrors={new Map()} marksBlocked={false} emptyText={EMPTY} {...over} />,
  )
  return { ...view, onMark, table: within(screen.getByRole('table')), list: within(screen.getByRole('list')) }
}

describe('FollowupRows: PC 표', () => {
  it('AC-611.5 칸은 연락함·이름·전화·마지막 진료·다음 날짜(요일)·구분·근거 문구 차례다. props로 받은 값만 그린다', () => {
    const t = draw([row()])
    expect(t.table.getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['연락함', '이름', '전화', '마지막 진료', '다음 날짜', '구분', '근거 문구'])
    const cells = t.table.getAllByRole('row')[1]!.querySelectorAll('td')
    expect([...cells].slice(1).map((td) => td.textContent)).toEqual(['시험가', '010-0000-0001', '10월 22일 (목)', '11월 5일 (목)', 'F/U', '2주 뒤 재진'])
    expect(within(cells[0]!).getByRole('checkbox', { name: '시험가 연락함' })).toBeTruthy()
  })

  it('AC-611.5 차트번호는 목업에 칸이 없어 그리지 않는다', () => {
    const t = draw([row({ chart: '987654' })])
    expect(t.container.textContent).not.toContain('987654')
  })

  it('AC-611.5 근거 문구는 전체를 title로 둔다(길면 줄임)', () => {
    const long = '물리치료 2주 더 받고 다시 찍어 보기로 함'
    const t = draw([row({ evidence: long })])
    const cell = t.table.getByText(long)
    expect(cell.getAttribute('title')).toBe(long)
    expect(cell.className).toContain('text-ellipsis')
  })

  it('AC-611.5 근거 문구 칸은 넘침을 overflow-clip으로 자른다(overflow-hidden 아님, 프로젝트 규칙)', () => {
    const t = draw([row()])
    const classes = t.table.getByText('2주 뒤 재진').className.split(/\s+/)
    expect(classes).toContain('overflow-clip')
    expect(classes).not.toContain('overflow-hidden')
  })

  it('AC-611.5 지난 예정은 글자 "지남"으로도 보인다(색만 쓰지 않는다). 오늘·앞날은 아니다', () => {
    const t = draw([row({ key: 'a', name: '지난분', next: '2026-11-03' }), row({ key: 'b', name: '오늘분', next: TODAY }), row({ key: 'c', name: '내일분' })])
    const [, past, today, tomorrow] = t.table.getAllByRole('row')
    expect(within(past!).getByText('지남')).toBeTruthy()
    expect(within(today!).queryByText('지남')).toBeNull()
    expect(within(tomorrow!).queryByText('지남')).toBeNull()
  })

  it('AC-611.5 조건부는 글자로 보이고 예정은 표시가 없다', () => {
    const t = draw([row({ key: 'a', plan: '조건부' }), row({ key: 'b' })])
    const [, cond, plain] = t.table.getAllByRole('row')
    expect(within(cond!).getByText('조건부')).toBeTruthy()
    expect(within(plain!).queryByText('조건부')).toBeNull()
  })

  it('AC-611.5 전화가 없으면 "번호 없음"', () => {
    const t = draw([row({ phone: '' })])
    expect(t.table.getByText('번호 없음')).toBeTruthy()
  })

  it('AC-611.5 마지막 진료가 날짜가 아니어도 던지지 않고 그린다', () => {
    const t = draw([row({ lastVisit: '' })])
    expect(t.table.getByRole('checkbox', { name: '시험가 연락함' })).toBeTruthy()
  })

  it('AC-611.2 줄이 없으면 머리는 두고 안내 한 줄뿐이다(지어낸 줄 없음)', () => {
    const t = draw([])
    expect(t.table.getAllByRole('columnheader')).toHaveLength(7)
    const rows = t.table.getAllByRole('row')
    expect(rows).toHaveLength(2)
    const cell = within(rows[1]!).getByRole('cell')
    expect(cell.textContent).toBe(EMPTY)
    expect(cell.getAttribute('colspan')).toBe('7')
    expect(t.table.queryByRole('checkbox')).toBeNull()
  })
})

describe('FollowupRows: [연락함]', () => {
  it('AC-611.3 누르면 onMark(key, 켜기). 표시된 줄은 끄기', async () => {
    const user = userEvent.setup()
    const t = draw([row({ key: 'on', name: '켜진분', contacted: true }), row({ key: 'off', name: '꺼진분' })])
    const off = t.table.getByRole('checkbox', { name: '꺼진분 연락함' }) as HTMLInputElement
    const on = t.table.getByRole('checkbox', { name: '켜진분 연락함' }) as HTMLInputElement
    expect(off.checked).toBe(false)
    expect(on.checked).toBe(true)
    await user.click(off)
    expect(t.onMark).toHaveBeenLastCalledWith('off', true)
    await user.click(on)
    expect(t.onMark).toHaveBeenLastCalledWith('on', false)
  })

  it('AC-611.3 표시는 Worker 값 그대로다: 눌러도 답이 오기 전에는 체크가 바뀌지 않는다', async () => {
    const user = userEvent.setup()
    const t = draw([row()])
    const box = t.table.getByRole('checkbox', { name: '시험가 연락함' }) as HTMLInputElement
    await user.click(box)
    expect(box.checked).toBe(false)
  })

  it('AC-611.3 답을 기다리는 줄마다 "저장 중"과 aria-busy. 표에서 표시된 줄은 "연락함", 안 된 줄은 글자 없음', () => {
    const t = draw(
      [row({ key: 'a', name: '기다림1' }), row({ key: 'b', name: '기다림2', contacted: true }), row({ key: 'c', name: '된분', contacted: true }), row({ key: 'd', name: '안된분' })],
      { busyKeys: new Set(['a', 'b']) },
    )
    const [, one, two, done, none] = t.table.getAllByRole('row')
    expect(one!.querySelector('td')!.textContent).toBe('저장 중')
    expect(two!.querySelector('td')!.textContent).toBe('저장 중')
    expect(t.table.getByRole('checkbox', { name: '기다림1 연락함' }).getAttribute('aria-busy')).toBe('true')
    expect(done!.querySelector('td')!.textContent).toBe('연락함')
    expect(t.table.getByRole('checkbox', { name: '된분 연락함' }).getAttribute('aria-busy')).toBeNull()
    expect(none!.querySelector('td')!.textContent).toBe('')
  })

  it('AC-611.3 실패한 줄 아래에 받은 오류 번호 줄을 보인다', () => {
    const t = draw([row({ key: 'bad', name: '실패분' }), row({ key: 'ok', name: '그냥분' })], { markErrors: new Map([['bad', 'E-BRIDGE-DISCONNECTED']]) })
    const rows = t.table.getAllByRole('row')
    expect(rows).toHaveLength(4)
    expect(rows[1]!.textContent).toContain('실패분')
    expect(rows[2]!.textContent).toContain('연락함을 저장하지 못했어요. 다시 눌러 주세요.')
    expect(rows[2]!.textContent).toContain('오류 번호 E-BRIDGE-DISCONNECTED')
    expect(rows[3]!.textContent).toContain('그냥분')
  })

  it('AC-604.8 연락 표시를 못 불러왔으면 체크 칸이 막혀 눌러도 onMark가 없다', async () => {
    const user = userEvent.setup()
    const t = draw([row()], { marksBlocked: true })
    const box = t.table.getByRole('checkbox', { name: '시험가 연락함' }) as HTMLInputElement
    expect(box.disabled).toBe(true)
    await user.click(box)
    expect(t.onMark).not.toHaveBeenCalled()
  })
})

describe('FollowupRows: 휴대폰 줄', () => {
  it('AC-611.5 이름·연락함, 다음 날짜 · 구분, 전화 · 마지막 진료, 근거 문구 차례다', () => {
    const t = draw([row({ plan: '조건부', next: '2026-11-03' })])
    const item = t.list.getByRole('listitem')
    const texts = [...item.querySelectorAll('p')].map((p) => p.textContent)
    expect(texts).toEqual(['11월 3일 (화) · F/U지남조건부', '010-0000-0001 · 마지막 진료 10월 22일 (목)', '2주 뒤 재진'])
    expect(within(item).getByText('시험가')).toBeTruthy()
    expect(within(item).getByRole('checkbox', { name: '시험가 연락함' })).toBeTruthy()
  })

  it('AC-611.3 휴대폰 줄은 늘 "연락함" 글자를 두고(상자 옆 이름), 기다리면 "저장 중"이다', () => {
    const t = draw([row({ key: 'a', name: '안된분' }), row({ key: 'b', name: '기다림' })], { busyKeys: new Set(['b']) })
    const [first, second] = t.list.getAllByRole('listitem')
    expect(within(first!).getByText('연락함')).toBeTruthy()
    expect(within(second!).getByText('저장 중')).toBeTruthy()
  })

  it('AC-611.3 휴대폰 줄에서도 누르면 onMark, 실패 줄이 보인다', async () => {
    const user = userEvent.setup()
    const t = draw([row({ key: 'bad' })], { markErrors: new Map([['bad', 'E-STORE-FAILED']]) })
    expect(t.list.getByRole('listitem').textContent).toContain('오류 번호 E-STORE-FAILED')
    await user.click(t.list.getByRole('checkbox', { name: '시험가 연락함' }))
    expect(t.onMark).toHaveBeenCalledExactlyOnceWith('bad', true)
  })

  it('AC-611.2 줄이 없으면 안내 한 줄뿐이다', () => {
    const t = draw([])
    expect(t.list.getByRole('listitem').textContent).toBe(EMPTY)
  })

  it('AC-611.5 목록은 점이 없고 글자는 14/22다(목업 .pl). 이름은 크기를 물려받는다', () => {
    const t = draw([row()])
    const list = screen.getByRole('list')
    expect(list.classList.contains('list-none')).toBe(true)
    expect(list.classList.contains('text-body')).toBe(true)
    expect(t.list.getByText('시험가').className).not.toMatch(TEXT_SIZE)
  })

  it('AC-611.2 안내 한 줄도 점 없이 14/22를 물려받는다(목업 .pl > li.empty)', () => {
    const t = draw([])
    const list = screen.getByRole('list')
    expect(list.classList.contains('list-none')).toBe(true)
    expect(list.classList.contains('text-body')).toBe(true)
    expect(t.list.getByRole('listitem').className).not.toMatch(TEXT_SIZE)
  })
})

describe('UndecidedRows', () => {
  const und = (over: Partial<UndecidedRow> = {}): UndecidedRow => ({
    key: 'f|2|200|',
    chart: '200',
    name: '미정분',
    phone: '010-0000-0002',
    lastVisit: '2026-10-29',
    nextLabel: '12월 초',
    evidence: '12월 초에 다시 보기로',
    ...over,
  })

  it('AC-611.1 날짜 미정 명단은 따로 제목·안내를 두고 이름·전화·마지막 진료·근거 문구를 보인다(연락함 칸 없음)', () => {
    render(<UndecidedRows rows={[und()]} />)
    const section = screen.getByRole('region', { name: '날짜 미정 1명' })
    expect(within(section).getByText('다시 오라고 적었지만 날짜가 없는 분이에요. 전화로 날짜를 잡아 주세요.')).toBeTruthy()
    const table = within(within(section).getByRole('table'))
    expect(table.getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['이름', '전화', '마지막 진료', '근거 문구'])
    const cells = table.getAllByRole('row')[1]!.querySelectorAll('td')
    expect([...cells].map((td) => td.textContent)).toEqual(['미정분', '010-0000-0002', '10월 29일 (목)', '12월 초에 다시 보기로'])
    expect(cells[3]!.getAttribute('title')).toBe('12월 초에 다시 보기로')
    expect(within(section).queryByRole('checkbox')).toBeNull()
  })

  it('AC-611.1 휴대폰 목록은 점이 없고 글자는 14/22다(목업 .pl). 이름은 크기를 물려받는다', () => {
    render(<UndecidedRows rows={[und()]} />)
    const list = screen.getByRole('list')
    expect(list.classList.contains('list-none')).toBe(true)
    expect(list.classList.contains('text-body')).toBe(true)
    expect(within(list).getByText('미정분').className).not.toMatch(TEXT_SIZE)
  })

  it('AC-611.1 휴대폰 줄: 이름, 전화 · 마지막 진료, 근거 문구. 전화가 없으면 "번호 없음"', () => {
    render(<UndecidedRows rows={[und({ phone: '' })]} />)
    const item = within(screen.getByRole('list')).getByRole('listitem')
    expect([...item.querySelectorAll('p')].map((p) => p.textContent)).toEqual(['미정분', '번호 없음 · 마지막 진료 10월 29일 (목)', '12월 초에 다시 보기로'])
  })
})

describe('ErrorLine', () => {
  it('AC-611.3 글과 오류 번호를 한 줄에 보인다. [다시 불러오기]는 줄 때만', () => {
    const { rerender } = render(<ErrorLine text="저장하지 못했어요." code="E-STORE-FAILED" />)
    expect(screen.getByText('저장하지 못했어요.')).toBeTruthy()
    expect(screen.getByText('오류 번호 E-STORE-FAILED')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
    rerender(<ErrorLine text="저장하지 못했어요." code="E-STORE-FAILED" onReload={() => {}} />)
    expect(screen.getByRole('button', { name: '다시 불러오기' })).toBeTruthy()
  })
})
