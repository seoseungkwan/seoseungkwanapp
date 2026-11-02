// @vitest-environment jsdom
import { cleanup, render, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ds } from '@/components/ui/classes'
import type { RecallRow } from '@/types/patients'
import { RecallRows } from './RecallRows'

// 정기 주사 환자 줄(AC-612.1, 목업 rcTool 표·휴대폰 줄). 이름·전화·차트번호는 여기서만 그린다. 줄은 props로만 받는다. 값은 모두 지어낸 것이다
afterEach(cleanup)

const EMPTY = '이 기간에 주사 날짜가 다가온 분이 없어요. 기간을 넓혀 보세요.'
const KEY = 'r|cartilage|100|2026-11-20'

const row = (over: Partial<RecallRow> = {}): RecallRow => ({
  key: KEY,
  ruleId: 'cartilage',
  label: '연골주사',
  months: 6,
  chart: '100',
  name: '시험가',
  phone: '010-0000-0001',
  last: '2026-05-20',
  due: '2026-11-20',
  status: '16일 남음',
  evidence: '연골주사 3차 맞음',
  contacted: false,
  ...over,
})

function draw(rows: RecallRow[], over: Partial<Parameters<typeof RecallRows>[0]> = {}) {
  const onMark = vi.fn()
  const view = render(<RecallRows rows={rows} onMark={onMark} busyKeys={new Set()} markErrors={new Map()} emptyText={EMPTY} {...over} />)
  return { ...view, onMark, table: within(view.getByRole('table')), list: within(view.getByRole('list')) }
}

describe('RecallRows: PC 표', () => {
  it('AC-612.1 칸은 연락함·종류·이름·전화·마지막 주사·다음 예정일·상태·근거 문구 차례다. props로 받은 값만 그린다', () => {
    const t = draw([row()])
    expect(t.table.getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['연락함', '종류', '이름', '전화', '마지막 주사', '다음 예정일', '상태', '근거 문구'])
    const cells = t.table.getAllByRole('row')[1]!.querySelectorAll('td')
    expect([...cells].slice(1).map((td) => td.textContent)).toEqual([
      '연골주사 6개월마다',
      '시험가',
      '010-0000-0001',
      '5월 20일 (수)',
      '11월 20일 (금)',
      '16일 남음',
      '연골주사 3차 맞음',
    ])
    expect(within(cells[0]!).getByRole('checkbox', { name: '시험가 연락함' })).toBeTruthy()
  })

  it('AC-612.1 차트번호는 목업에 칸이 없어 그리지 않는다(글자·속성 모두)', () => {
    const t = draw([row({ chart: '987654', key: 'r|cartilage|x|2026-11-20' })])
    expect(t.container.innerHTML).not.toContain('987654')
  })

  it('AC-612.1 근거 문구는 전체를 title로 둔다(길면 줄임)', () => {
    const long = '연골주사 3차 맞고 다음에 다시 보기로 함'
    const t = draw([row({ evidence: long })])
    const cell = t.table.getByText(long)
    expect(cell.getAttribute('title')).toBe(long)
    expect(cell.className).toContain('text-ellipsis')
  })

  it('AC-612.1 근거 문구 칸은 넘침을 overflow-clip으로 자른다(overflow-hidden 아님, 프로젝트 규칙)', () => {
    const t = draw([row()])
    const classes = t.table.getByText('연골주사 3차 맞음').className.split(/\s+/)
    expect(classes).toContain('overflow-clip')
    expect(classes).not.toContain('overflow-hidden')
  })

  it('AC-612.1 상태는 Worker 글자 그대로 보이고 색만으로 나타내지 않는다: 지남 N일은 주의, 오늘은 강조, N일 남음은 글자만', () => {
    const t = draw([row({ key: 'a', status: '지남 5일' }), row({ key: 'b', status: '오늘' }), row({ key: 'c', status: '16일 남음' })])
    expect(t.table.getByText('지남 5일').className).toBe(ds.chip.warning)
    expect(t.table.getByText('오늘').className).toBe(ds.chip.accent)
    const plain = t.table.getByText('16일 남음')
    expect(plain.className).not.toContain('bg-')
  })

  it('AC-612.1 전화가 없으면 "번호 없음"', () => {
    const t = draw([row({ phone: '' })])
    const cells = t.table.getAllByRole('row')[1]!.querySelectorAll('td')
    expect(cells[3]!.textContent).toBe('번호 없음')
  })

  it('AC-612.3 체크는 Worker 값 그대로다. 누르면 줄 열쇠와 반대 값으로 onMark를 부르고, 저절로 바뀌지 않는다', async () => {
    const user = userEvent.setup()
    const t = draw([row(), row({ key: 'b', name: '연락한분', contacted: true })])
    const off = t.table.getByRole('checkbox', { name: '시험가 연락함' }) as HTMLInputElement
    const on = t.table.getByRole('checkbox', { name: '연락한분 연락함' }) as HTMLInputElement
    expect(off.checked).toBe(false)
    expect(on.checked).toBe(true)
    await user.click(off)
    expect(t.onMark).toHaveBeenLastCalledWith(KEY, true)
    expect(off.checked).toBe(false)
    await user.click(on)
    expect(t.onMark).toHaveBeenLastCalledWith('b', false)
  })

  it('AC-612.3 글자: 안 된 줄은 없고 연락함은 "연락함", 기다리는 줄은 "저장 중"과 aria-busy', () => {
    const t = draw([row({ key: 'a', name: '안된분' }), row({ key: 'b', name: '된분', contacted: true }), row({ key: 'c', name: '기다리는분' })], { busyKeys: new Set(['c']) })
    const [, none, done, busy] = t.table.getAllByRole('row')
    expect(none!.querySelectorAll('td')[0]!.textContent).toBe('')
    expect(done!.querySelectorAll('td')[0]!.textContent).toBe('연락함')
    expect(busy!.querySelectorAll('td')[0]!.textContent).toBe('저장 중')
    expect(within(busy!).getByRole('checkbox').getAttribute('aria-busy')).toBe('true')
    expect(within(none!).getByRole('checkbox').getAttribute('aria-busy')).toBeNull()
  })

  it('AC-612.3 저장 실패 줄은 그 줄 바로 아래에 글과 오류 번호를 보인다', () => {
    const t = draw([row({ key: 'a', name: '실패분' }), row({ key: 'b', name: '다른분' })], { markErrors: new Map([['a', 'E-STORE-FAILED']]) })
    const [, first, error, second] = t.table.getAllByRole('row')
    expect(first!.textContent).toContain('실패분')
    expect(error!.textContent).toContain('연락함을 저장하지 못했어요. 다시 눌러 주세요.')
    expect(error!.textContent).toContain('오류 번호 E-STORE-FAILED')
    expect(second!.textContent).toContain('다른분')
    expect(error!.querySelectorAll('td')[1]!.getAttribute('colspan')).toBe('7')
  })

  it('AC-612.4 줄이 없으면 안내 한 줄뿐이다', () => {
    const t = draw([])
    const cells = t.table.getAllByRole('row')[1]!.querySelectorAll('td')
    expect(cells).toHaveLength(1)
    expect(cells[0]!.textContent).toBe(EMPTY)
    expect(cells[0]!.getAttribute('colspan')).toBe('8')
  })
})

describe('RecallRows: 휴대폰 줄', () => {
  it('AC-612.1 이름, 종류 · 다음 예정일 · 상태, 전화 · 마지막 주사, 근거 문구', () => {
    const t = draw([row({ status: '지남 5일' })])
    const item = t.list.getByRole('listitem')
    expect(item.textContent).toContain('시험가')
    expect([...item.querySelectorAll('p')].map((p) => p.textContent)).toEqual(['연골주사 · 다음 11월 20일 (금)지남 5일', '010-0000-0001 · 마지막 주사 5월 20일 (수)', '연골주사 3차 맞음'])
    expect(within(item).getByText('지남 5일').className).toBe(ds.chip.warning)
  })

  it('AC-612.1 전화가 없으면 "번호 없음"', () => {
    const t = draw([row({ phone: '' })])
    expect(t.list.getByRole('listitem').textContent).toContain('번호 없음 · 마지막 주사')
  })

  it('AC-612.3 "연락함" 글자가 늘 있고 줄을 눌러도 onMark, 기다리면 "저장 중". 실패 줄이 보인다', async () => {
    const user = userEvent.setup()
    const t = draw([row({ key: 'a' }), row({ key: 'b', name: '기다리는분' })], { busyKeys: new Set(['b']), markErrors: new Map([['a', 'E-STORE-FAILED']]) })
    const [first, second] = t.list.getAllByRole('listitem')
    expect(first!.textContent).toContain('오류 번호 E-STORE-FAILED')
    expect(within(second!).getByRole('checkbox', { name: '기다리는분 연락함' }).getAttribute('aria-busy')).toBe('true')
    expect(second!.textContent).toContain('저장 중')
    await user.click(within(first!).getByText('연락함'))
    expect(t.onMark).toHaveBeenCalledExactlyOnceWith('a', true)
  })

  it('AC-612.4 줄이 없으면 안내 한 줄뿐이다', () => {
    const t = draw([])
    expect(t.list.getByRole('listitem').textContent).toBe(EMPTY)
  })
})
