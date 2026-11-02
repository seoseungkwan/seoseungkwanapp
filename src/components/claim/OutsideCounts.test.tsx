// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ds } from '@/components/ui/classes'
import { errorInfo } from '@/lib/errors'
import { OutsideCounts } from './OutsideCounts'

// 밖에서 보는 건수(AC-019.5). ui-90 화면의 '준비 중' 칩 자리에 넣는 것: 마지막으로 바뀐 시각 줄과 '메모 입력 현황' 패널 하나(표 모양은 목업 화면 11, 끝난 날은 뺀다).
// 자리와 h1은 page.test.tsx가 본다. 숫자·날짜·시각뿐이다. 실제 DB에 붙지 않는다

const db = vi.hoisted(() => ({
  days: [] as unknown[],
  months: [] as unknown[],
  contact: [] as unknown[],
  error: null as null | { code: string; message: string },
  status: 200,
  reads: 0,
  selects: [] as string[],
  noClient: false,
  /** 있으면 그때 시작한 읽기가 이것을 기다린다 */
  gate: null as Promise<void> | null,
}))

vi.mock('@/lib/supabase/browser', () => ({
  supabaseBrowser: () => {
    if (db.noClient) throw new Error('env secret')
    return {
    from(table: string) {
      db.reads += 1
      return {
        select(columns: string) {
          db.selects.push(columns)
          const data = table === 'claim_day_counts' ? db.days : table === 'claim_month_counts' ? db.months : db.contact
          const reply = db.error ? { data: null, error: db.error, status: db.status } : { data, error: null, status: 200 }
          const gate = db.gate
          const query = {
            order: () => query,
            limit: () => query,
            then: (ok: (value: unknown) => unknown) => (gate ? gate.then(() => reply) : Promise.resolve(reply)).then(ok),
          }
          return query
        },
      }
    },
    }
  },
}))

const row = (visit_date: string, need_memo: number, entered: number, updated_at: string) => ({ visit_date, visits: 9, need_memo, entered, needs_check: 0, skipped: 0, updated_at })
const DAYS = [
  row('2026-11-03', 4, 4, '2026-11-04T07:41:00+00:00'), // 끝난 날. 한국 시각 11월 4일 (수) 16:41
  row('2026-11-02', 6, 5, '2026-11-03T01:05:00+00:00'), // 한국 시각 11월 3일 (화) 10:05
  row('2026-10-30', 3, 0, '2026-10-30T09:00:00+00:00'), // 한국 시각 10월 30일 (금) 18:00
]

const classesOf = (el: Element | null | undefined) => (el?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)
const expectClasses = (el: Element | null | undefined, ...wanted: string[]) => expect(classesOf(el)).toEqual(expect.arrayContaining(wanted.flatMap((c) => c.split(/\s+/).filter(Boolean))))
const textOf = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()

beforeEach(() => {
  db.days = DAYS
  db.months = []
  db.contact = []
  db.error = null
  db.status = 200
  db.reads = 0
  db.selects = []
  db.noClient = false
  db.gate = null
})
afterEach(cleanup)

const memoPanel = async () => (await screen.findByRole('heading', { level: 2, name: '메모 입력 현황' })).closest('section') as HTMLElement

describe('AC-019.5 밖에서 보는 건수', () => {
  it('AC-019.5: 남은 날만 날짜·메모 필요·입력함·상태와 그 줄의 마지막 바뀐 시각으로 보인다. 끝난 날은 없다', async () => {
    render(<OutsideCounts />)
    const panel = await memoPanel()
    const table = within(panel).getByRole('table', { name: '메모 입력 현황' })
    expect(within(table).getAllByRole('columnheader').map(textOf)).toEqual(['날짜', '메모 필요', '입력함', '상태'])
    const lines = within(table).getAllByRole('row').slice(1)
    expect(lines).toHaveLength(2)

    const near = within(lines[0]).getAllByRole('cell')
    expect(textOf(near[0])).toContain('11/2 (월)')
    expect(within(near[0]).getByText('11월 3일 (화) 10:05에 바뀜')).toBeTruthy()
    expect(textOf(near[1])).toBe('6')
    expect(textOf(near[2])).toBe('5')
    expect(textOf(near[4])).toContain('진행중 5/6')
    expect(textOf(lines[1])).toContain('10/30 (금)')
    expect(textOf(lines[1])).toContain('입력 전')
    expect(textOf(lines[1])).toContain('10월 30일 (금) 18:00에 바뀜')

    expect(textOf(table)).not.toContain('11/3 (화)')
    expect(textOf(table)).not.toContain('완료')
  })

  it('AC-019.5: 큰 숫자는 남은 날 수이고, 머리 줄의 마지막으로 바뀐 시각은 끝난 날까지 넣어 가장 늦은 시각이다', async () => {
    const { container } = render(<OutsideCounts />)
    const panel = await memoPanel()
    expect(textOf(within(panel).getByText('일 남음').parentElement)).toBe('2일 남음')
    expect(within(panel).getByText('날짜별')).toBeTruthy()
    expect(textOf(container)).toContain('마지막으로 바뀐 시각 11월 4일 (수) 16:41 · 비트 PC에서 올라옴')
    // 폰은 시각 앞에서 줄을 바꾼다(목업)
    expectClasses(screen.getByText('11월 4일 (수) 16:41').previousElementSibling, 'md:hidden')
  })

  it('AC-019.5: 숫자·날짜 칸만 읽고 환자 글자가 없다. 목업 화면 11의 안내 글은 이 자리에 넣지 않는다', async () => {
    const { container } = render(<OutsideCounts />)
    await memoPanel()
    expect(screen.queryByText('환자 정보와 삭감 경고는 비트 PC에서만 볼 수 있어요.')).toBeNull()
    expect(screen.queryByText('비트 PC가 아닌 곳에서 보는 화면이에요')).toBeNull()
    expect(db.selects.join(' ')).not.toMatch(/\*|name|chart|hospital_id/)
    expect(container.textContent).not.toContain('가상환자')
  })

  it('AC-019.5: 폰(폭 390)에서는 표가 "5 / 6"과 짧은 상태 칩이고 줄마다 바뀐 시각이 함께 있다. 큰 화면용 칸은 숨긴다', async () => {
    render(<OutsideCounts />)
    const panel = await memoPanel()
    const line = within(panel).getAllByRole('row')[1]
    const cells = within(line).getAllByRole('cell')
    // 폰 칸: 입력 / 필요. 큰 화면에서는 숨겨 머리 줄과 칸이 맞는다
    expect(textOf(cells[3])).toBe('5 / 6')
    expectClasses(cells[3], 'md:hidden')
    // 큰 화면 칸과 머리 줄은 폰에서 숨긴다(목업 폰 표에는 머리 줄이 없다)
    for (const index of [1, 2]) expectClasses(cells[index], 'max-md:hidden')
    expectClasses(within(panel).getByRole('table').querySelector('thead'), 'max-md:hidden')
    // 바뀐 시각은 어느 폭에서나 날짜 아래에 있다(숨기지 않는다)
    const stamp = within(cells[0]).getByText('11월 3일 (화) 10:05에 바뀜')
    expect(classesOf(stamp)).not.toContain('md:hidden')
    expect(classesOf(stamp)).not.toContain('max-md:hidden')
    // 칩: 큰 화면 '진행중 5/6', 폰 '진행중'
    expectClasses(within(line).getByText('진행중 5/6'), 'max-md:hidden')
    expectClasses(within(line).getByText('진행중'), 'md:hidden')
    // 숫자가 없는 '입력 전'은 폰에서도 그대로다(잘려서 '입력'이 되지 않는다)
    const untouched = within(panel).getAllByRole('row')[2]
    expect(within(untouched).getAllByText('입력 전')).toHaveLength(2)
    expect(within(untouched).queryByText('입력')).toBeNull()
  })

  it('AC-019.5: 패널은 메모 입력 현황 하나다. 월말 마감 남은 일·연락 남은 건수 칸은 아직 없다(TASK-22·TASK-26이 아래에 더하며 이 시험을 바꾼다)', async () => {
    const { container } = render(<OutsideCounts />)
    const panel = await memoPanel()
    expectClasses(panel, ds.panel)
    expect(screen.getAllByRole('heading', { level: 2 }).map(textOf)).toEqual(['메모 입력 현황'])
    expect(container.textContent).not.toContain('월말 마감 남은 일')
    expect(container.textContent).not.toContain('연락 남은 건수')
    // 칸을 나란히 놓는 틀이 없고 자리 전체 폭을 쓴다
    expect(container.querySelector('.grid')).toBeNull()
    expect(classesOf(panel).filter((name) => /^(max-w|w|col-span|md:col-span)-/.test(name))).toEqual([])
  })

  it('AC-019.5: 올린 건수가 없으면 빈 안내 한 줄이고 표·큰 숫자·바뀐 시각이 없다', async () => {
    db.days = []
    const { container } = render(<OutsideCounts />)
    const panel = await memoPanel()
    expect(within(panel).getByText('아직 올린 건수가 없어요')).toBeTruthy()
    expect(screen.getAllByText('아직 올린 건수가 없어요')).toHaveLength(1) // 빈 칸마다 되풀이되지 않는다
    expect(within(panel).queryByRole('table')).toBeNull()
    expect(within(panel).queryByText('일 남음')).toBeNull()
    expect(container.textContent).not.toContain('마지막으로 바뀐 시각')
  })

  it('AC-019.5: 표가 아직 없어도(마이그레이션 전) 오류가 아니라 빈 안내다', async () => {
    db.error = { code: 'PGRST205', message: 'relation does not exist' }
    db.status = 404
    render(<OutsideCounts />)
    const panel = await memoPanel()
    expect(within(panel).getByText('아직 올린 건수가 없어요')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-019.5: 건수는 있는데 남은 날이 없으면 0일 남음과 남은 메모가 없다는 안내다', async () => {
    db.days = [row('2026-11-03', 4, 4, '2026-11-04T07:41:00+00:00')]
    render(<OutsideCounts />)
    const panel = await memoPanel()
    expect(textOf(within(panel).getByText('일 남음').parentElement)).toBe('0일 남음')
    expect(within(panel).getByText('남은 메모가 없어요')).toBeTruthy()
    expect(within(panel).queryByRole('table')).toBeNull()
  })

  it('AC-019.5: 읽지 못하면 E-COUNTS-FAILED 카드이고 원래 오류 글이 없다. 창 초점이 오면 다시 읽는다', async () => {
    db.error = { code: '500', message: '서버 비밀 relation' }
    db.status = 500
    render(<OutsideCounts />)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain(errorInfo('E-COUNTS-FAILED').what)
    expect(alert.textContent).toContain('오류 번호 E-COUNTS-FAILED')
    expect(alert.textContent).not.toContain('relation')

    db.error = null
    window.dispatchEvent(new Event('focus'))
    await memoPanel()
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })

  it('AC-019.5: 먼저 시작한 읽기가 늦게 답해도 새 읽기의 답을 덮지 않는다(ask === last)', async () => {
    let openOld: () => void = () => {}
    db.gate = new Promise((resolve) => {
      openOld = resolve
    })
    db.days = [row('2026-10-30', 3, 0, '2026-10-30T09:00:00+00:00')] // 옛 답: 10/30이 남음
    const { container } = render(<OutsideCounts />)
    await waitFor(() => expect(db.reads).toBe(3)) // 옛 읽기가 정말 시작해 그 답을 기다린다

    db.gate = null
    db.days = [row('2026-11-02', 6, 5, '2026-11-03T01:05:00+00:00')] // 새 답: 11/2가 남음
    window.dispatchEvent(new Event('focus'))
    const panel = await memoPanel()
    expect(textOf(panel)).toContain('11/2 (월)')

    openOld()
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(textOf(panel)).toContain('11/2 (월)')
    expect(textOf(panel)).not.toContain('10/30 (금)')
    expect(textOf(container)).toContain('마지막으로 바뀐 시각 11월 3일 (화) 10:05')
  })

  it('AC-019.5: 클라이언트를 만들지 못해도 던지지 않고 E-COUNTS-FAILED 카드다(둘레 화면이 깨지지 않는다)', async () => {
    db.noClient = true
    render(<OutsideCounts />)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('오류 번호 E-COUNTS-FAILED')
    expect(alert.textContent).not.toContain('env secret')
  })

  it('AC-013.8·AC-019.5: 읽은 뒤에도 [설치·연결 확인]·[설정 열기] 링크가 없다([이 PC를 비트 PC로 연결]이 맡는다)', async () => {
    render(<OutsideCounts />)
    await memoPanel()
    expect(screen.queryAllByRole('link')).toEqual([])
    expect(screen.queryByText(/설치·연결 확인/)).toBeNull()
    expect(screen.queryByText(/설정 열기/)).toBeNull()
  })

  it('AC-019.5: h1이 없다(자리를 내주는 화면의 h1이 하나뿐이어야 한다)', async () => {
    render(<OutsideCounts />)
    await memoPanel()
    expect(screen.queryAllByRole('heading', { level: 1 })).toEqual([])
    expect(screen.queryByText('청구')).toBeNull()
  })

  it('AC-019.5: 읽는 동안 안내 한 줄만 보인다', () => {
    render(<OutsideCounts />)
    expect(screen.getByText('건수를 읽는 중이에요…')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })
})
