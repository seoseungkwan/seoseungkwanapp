// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ds } from '@/components/ui/classes'
import { errorInfo } from '@/lib/errors'
import { OutsideCounts } from './OutsideCounts'

// 밖에서 보는 건수(AC-019.5). ui-90 화면의 '준비 중' 칩 자리에 넣는 것: 마지막으로 바뀐 시각 줄과 '메모 입력 현황' 패널 하나(표 모양은 목업 화면 11, 끝난 날은 뺀다).
// 자리와 h1은 page.test.tsx가 본다. 숫자·날짜·시각뿐이다. 실제 DB에 붙지 않는다

type Close = { visit_date: string; closed_at: string }
type Sent = { table: string; method: string; payload: unknown; options: unknown; filters: unknown[][] }

const db = vi.hoisted(() => ({
  days: [] as unknown[],
  months: [] as unknown[],
  contact: [] as unknown[],
  /** 완료 표시 표(claim_day_closes)의 줄. 저장·지우기가 성공하면 서버처럼 바뀐다 */
  closes: [] as Close[],
  /** 모든 표 읽기 실패 */
  error: null as null | { code: string; message: string },
  status: 200,
  /** 완료 표시 읽기만 실패 */
  closesError: null as null | { code: string; message: string },
  closesStatus: 200,
  reads: 0,
  selects: [] as string[],
  /** 보낸 쓰기 전부(표·방법·값·조건). 어느 표든 적는다(AC-2803.1) */
  writes: [] as Sent[],
  /** 쓰기 답: 서버 오류·표 없음·연결 끊김(던짐). null이면 성공 */
  writeFail: null as null | 'error' | 'no-table' | 'throw',
  /** 서버가 정하는 완료 시각(closed_at 기본 now()) */
  serverNow: '',
  noClient: false,
  /** 있으면 그때 시작한 읽기가 이것을 기다린다 */
  gate: null as Promise<void> | null,
  /** 있으면 쓰기가 이것을 기다린다 */
  writeGate: null as Promise<void> | null,
}))

vi.mock('@/lib/supabase/browser', () => ({
  supabaseBrowser: () => {
    if (db.noClient) throw new Error('env secret')
    return {
    from(table: string) {
      // 쓰기: 적고, 성공하면 완료 표시 표만 서버처럼 바꾼다(넣기는 on conflict do nothing만 되고 고치기 권한은 없다)
      const write = (method: string, payload: unknown, options?: unknown) => {
        const sent: Sent = { table, method, payload, options, filters: [] }
        db.writes.push(sent)
        const answer = async () => {
          if (db.writeGate) await db.writeGate
          if (db.writeFail === 'throw') throw new Error('network secret')
          if (db.writeFail === 'no-table') return { data: null, error: { code: 'PGRST205', message: 'relation secret' }, status: 404 }
          if (db.writeFail === 'error') return { data: null, error: { code: '500', message: 'relation secret' }, status: 500 }
          if (table !== 'claim_day_closes') return { data: null, error: null, status: 201 }
          const has = (date: string) => db.closes.some((close) => close.visit_date === date)
          if (method === 'upsert') {
            const rows = payload as { visit_date: string }[]
            if (rows.some((r) => has(r.visit_date)) && !(options as { ignoreDuplicates?: boolean } | undefined)?.ignoreDuplicates) {
              return { data: null, error: { code: '42501', message: 'update secret' }, status: 403 }
            }
            db.closes = [...db.closes, ...rows.filter((r) => !has(r.visit_date)).map((r) => ({ visit_date: r.visit_date, closed_at: db.serverNow }))]
          }
          if (method === 'delete') {
            const gone = sent.filters.filter(([op, column]) => op === 'in' && column === 'visit_date').flatMap(([, , values]) => values as string[])
            db.closes = db.closes.filter((close) => !gone.includes(close.visit_date))
          }
          return { data: null, error: null, status: 201 }
        }
        const query = {
          in: (column: string, values: unknown) => {
            sent.filters.push(['in', column, values])
            return query
          },
          eq: (column: string, value: unknown) => {
            sent.filters.push(['eq', column, value])
            return query
          },
          then: (ok: (value: unknown) => unknown, bad?: (reason: unknown) => unknown) => answer().then(ok, bad),
        }
        return query
      }
      return {
        select(columns: string) {
          db.reads += 1
          db.selects.push(columns)
          const closes = table === 'claim_day_closes'
          const data = table === 'claim_day_counts' ? db.days : table === 'claim_month_counts' ? db.months : closes ? db.closes.map((close) => ({ ...close })) : db.contact
          const error = db.error ?? (closes ? db.closesError : null)
          const reply = error ? { data: null, error, status: db.error ? db.status : db.closesStatus } : { data, error: null, status: 200 }
          const gate = db.gate
          const query = {
            order: () => query,
            limit: () => query,
            gte: () => query,
            lte: () => query,
            then: (ok: (value: unknown) => unknown) => (gate ? gate.then(() => reply) : Promise.resolve(reply)).then(ok),
          }
          return query
        },
        upsert: (rows: unknown, options?: unknown) => write('upsert', rows, options),
        insert: (rows: unknown, options?: unknown) => write('insert', rows, options),
        update: (values: unknown) => write('update', values),
        delete: () => write('delete', undefined),
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
  db.closes = []
  db.error = null
  db.status = 200
  db.closesError = null
  db.closesStatus = 200
  db.reads = 0
  db.selects = []
  db.writes = []
  db.writeFail = null
  db.serverNow = '2026-11-08T00:12:00+00:00' // 한국 시각 11월 8일 (일) 09:12
  db.noClient = false
  db.gate = null
  db.writeGate = null
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const memoPanel = async () => (await screen.findByRole('heading', { level: 2, name: '메모 입력 현황' })).closest('section') as HTMLElement

describe('AC-019.5 밖에서 보는 건수', () => {
  it('AC-019.5: 남은 날만 날짜·메모 필요·입력함·상태와 그 줄의 마지막 바뀐 시각으로 보인다. 끝난 날은 없다', async () => {
    render(<OutsideCounts />)
    const panel = await memoPanel()
    const table = within(panel).getByRole('table', { name: '메모 입력 현황' })
    // 첫 칸은 체크 칸이다(claim-day-done AC-2806.3: 칸 하나만큼 늘었다)
    expect(within(table).getAllByRole('columnheader').map(textOf)).toEqual(['', '날짜', '메모 필요', '입력함', '상태'])
    const lines = within(table).getAllByRole('row').slice(1)
    expect(lines).toHaveLength(2)

    const near = within(lines[0]).getAllByRole('cell')
    expect(textOf(near[1])).toContain('11/2 (월)')
    expect(within(near[1]).getByText('11월 3일 (화) 10:05에 바뀜')).toBeTruthy()
    expect(textOf(near[2])).toBe('6')
    expect(textOf(near[3])).toBe('5')
    expect(textOf(near[5])).toContain('진행중 5/6')
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
    // 첫 칸은 체크 칸이라 칸 차례가 하나씩 밀렸다(claim-day-done AC-2806.3)
    const cells = within(line).getAllByRole('cell')
    // 폰 칸: 입력 / 필요. 큰 화면에서는 숨겨 머리 줄과 칸이 맞는다
    expect(textOf(cells[4])).toBe('5 / 6')
    expectClasses(cells[4], 'md:hidden')
    // 큰 화면 칸과 머리 줄은 폰에서 숨긴다(목업 폰 표에는 머리 줄이 없다)
    for (const index of [2, 3]) expectClasses(cells[index], 'max-md:hidden')
    expectClasses(within(panel).getByRole('table').querySelector('thead'), 'max-md:hidden')
    // 바뀐 시각은 어느 폭에서나 날짜 아래에 있다(숨기지 않는다)
    const stamp = within(cells[1]).getByText('11월 3일 (화) 10:05에 바뀜')
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
    await waitFor(() => expect(db.reads).toBe(4)) // 옛 읽기가 정말 시작해 그 답을 기다린다(건수 표 셋 + 완료 표시 표, claim-day-done AC-2806.3)

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

// ── 날짜를 골라 완료로 저장(spec claim-day-done REQ-2801~2803, 시안 docs/mockups/claim-day-done B) ──

// 남은 날 다섯과 끝난 날 하나. 주석은 한국 시각
const OCT = [
  row('2026-10-08', 4, 4, '2026-10-08T09:00:00+00:00'), // 끝난 날. 10월 8일 (목) 18:00 — 건수 표에서 가장 늦은 시각
  row('2026-10-07', 5, 2, '2026-10-08T02:00:00+00:00'),
  row('2026-10-06', 8, 0, '2026-10-07T02:00:00+00:00'),
  row('2026-10-05', 3, 1, '2026-10-06T02:00:00+00:00'),
  row('2026-10-02', 7, 6, '2026-10-05T02:00:00+00:00'),
  row('2026-10-01', 4, 0, '2026-10-02T02:00:00+00:00'),
]
const OCT_LEFT = ['10/7 (수)', '10/6 (화)', '10/5 (월)', '10/2 (금)', '10/1 (목)']
const AT_1107 = '2026-11-07T06:44:00+00:00' // 11월 7일 (토) 15:44
const AT_1106 = '2026-11-06T04:34:00+00:00' // 11월 6일 (금) 13:34
const close = (visit_date: string, closed_at: string): Close => ({ visit_date, closed_at })

type User = ReturnType<typeof userEvent.setup>
const listTable = (panel: HTMLElement) => within(panel).queryByRole('table', { name: '메모 입력 현황' })
/** 위 목록의 날짜 글자(최근 날부터). 목록이 없으면 빈 배열 */
const listDates = (panel: HTMLElement) => {
  const table = listTable(panel)
  return table ? within(table).getAllByRole('row').slice(1).map((line) => textOf(within(line).getAllByRole('cell')[1]).match(/^\d+\/\d+ \(.\)/)?.[0]) : []
}
const listBoxes = (panel: HTMLElement) => within(listTable(panel) as HTMLElement).getAllByRole('checkbox') as HTMLInputElement[]
const leftText = (panel: HTMLElement) => textOf(within(panel).getByText('일 남음').parentElement)
const box = (panel: HTMLElement, label: string) => within(panel).getByRole('checkbox', { name: `${label} 고르기` }) as HTMLInputElement
const pickBar = (panel: HTMLElement) => within(panel).getByRole('status')
const saveButton = (panel: HTMLElement) => within(pickBar(panel)).getByRole('button', { name: /^(완료로 저장|저장 중…)$/ }) as HTMLButtonElement
const doneBox = (panel: HTMLElement) => panel.querySelector('details') as HTMLDetailsElement
const doneSummary = (panel: HTMLElement) => textOf(doneBox(panel).querySelector('summary'))
const openDone = async (user: User, panel: HTMLElement) => {
  await user.click(doneBox(panel).querySelector('summary') as HTMLElement)
  expect(doneBox(panel).open).toBe(true)
}
const doneLines = (panel: HTMLElement) => {
  const table = within(doneBox(panel)).queryByRole('table', { name: '완료로 바꾼 날' })
  return table ? within(table).getAllByRole('row') : []
}
const doneLine = (panel: HTMLElement, label: string) => doneLines(panel).find((line) => textOf(line).startsWith(label))
const undoButton = (panel: HTMLElement, label: string) => within(doneBox(panel)).getByRole('button', { name: `${label} 되돌리기` }) as HTMLButtonElement
/** el에서 패널까지 올라가며 어느 폭에서 숨기는 클래스 */
const hidingClasses = (el: Element, panel: Element) => {
  const found: string[] = []
  for (let node: Element | null = el; node && node !== panel.parentElement; node = node.parentElement) found.push(...classesOf(node).filter((name) => /^((max-)?md:)?hidden$/.test(name)))
  return found
}
const opener = () => {
  let open = () => {}
  const gate = new Promise<void>((resolve) => {
    open = resolve
  })
  return { gate, open: () => open() }
}
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
/** 두 날을 골라 저장하고 알림을 기다린다 */
const saveTwo = async (user: User, panel: HTMLElement) => {
  await user.click(box(panel, '10/6 (화)'))
  await user.click(box(panel, '10/2 (금)'))
  await user.click(saveButton(panel))
  await waitFor(() => expect(within(pickBar(panel)).getByText('2일을 완료로 바꿨어요')).toBeTruthy())
}

describe('claim-day-done 날짜를 골라 완료로 저장·되돌리기', () => {
  beforeEach(() => {
    db.days = OCT
  })

  it('AC-2801.1: 남은 날 줄마다 날짜 앞 첫 칸에 "{M/D (요일)} 고르기" 체크 칸이 있고, 표 위 고르기 줄은 "완료로 바꿀 날을 골라 주세요"와 막힌 [완료로 저장]이다', async () => {
    render(<OutsideCounts />)
    const panel = await memoPanel()
    const table = listTable(panel) as HTMLElement
    // 머리 첫 칸은 비어 있고 읽기 프로그램용 이름만 있다
    const head = within(table).getAllByRole('columnheader')[0]
    expect(textOf(head)).toBe('')
    expect(head.getAttribute('aria-label')).toBe('고르기')
    const lines = within(table).getAllByRole('row').slice(1)
    expect(lines.map((line) => within(within(line).getAllByRole('cell')[0]).getByRole('checkbox').getAttribute('aria-label'))).toEqual(OCT_LEFT.map((label) => `${label} 고르기`))
    expect(listDates(panel)).toEqual(OCT_LEFT) // 체크 칸 다음 칸이 날짜
    for (const input of listBoxes(panel)) {
      expect(input.checked).toBe(false)
      expect(input.disabled).toBe(false)
    }
    expect(within(panel).queryByRole('checkbox', { name: '10/8 (목) 고르기' })).toBeNull() // 끝난 날은 줄이 없다

    const bar = pickBar(panel)
    expect(within(bar).getByText('완료로 바꿀 날을 골라 주세요')).toBeTruthy()
    const save = saveButton(panel)
    expect(textOf(save)).toBe('완료로 저장')
    expect(save.disabled).toBe(true)
    expectClasses(save, ds.button.primarySmall)
    expectClasses(bar, 'bg-accent-soft')
    // 차례: 'N일 남음' → 고르기 줄 → 표
    expect(within(panel).getByText('일 남음').compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(bar.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // 390px: 체크 칸·고르기 줄·단추는 어느 폭에서나 보이고, 폰의 '입력 / 필요' 한 칸은 그대로다
    for (const el of [bar, save, within(lines[0]).getAllByRole('cell')[0], box(panel, '10/7 (수)')]) expect(hidingClasses(el, panel)).toEqual([])
    const phone = within(lines[0]).getAllByRole('cell')[4]
    expect(textOf(phone)).toBe('2 / 5')
    expectClasses(phone, 'md:hidden')
  })

  it('AC-2801.2: 체크 칸을 하나씩 켜고 끄면 "{N}일 골랐어요"가 바로 바뀌고, 1일부터 [완료로 저장]이 풀리며 0이면 처음 글과 막힘으로 돌아간다', async () => {
    const user = userEvent.setup()
    render(<OutsideCounts />)
    const panel = await memoPanel()
    await user.click(box(panel, '10/6 (화)'))
    expect(box(panel, '10/6 (화)').checked).toBe(true)
    expect(within(pickBar(panel)).getByText('1일 골랐어요')).toBeTruthy()
    expect(saveButton(panel).disabled).toBe(false)
    await user.click(box(panel, '10/1 (목)'))
    expect(within(pickBar(panel)).getByText('2일 골랐어요')).toBeTruthy()
    await user.click(box(panel, '10/6 (화)'))
    expect(within(pickBar(panel)).getByText('1일 골랐어요')).toBeTruthy()
    expect(saveButton(panel).disabled).toBe(false)
    await user.click(box(panel, '10/1 (목)'))
    expect(within(pickBar(panel)).getByText('완료로 바꿀 날을 골라 주세요')).toBeTruthy()
    expect(textOf(pickBar(panel))).not.toContain('골랐어요')
    expect(saveButton(panel).disabled).toBe(true)
    // 고르기만으로는 서버에 보내지 않는다
    expect(db.writes).toEqual([])
    expect(leftText(panel)).toBe('5일 남음')
  })

  it('AC-2801.3·AC-2803.1: 두 날을 골라 [완료로 저장]을 누르면 요청은 claim_day_closes 하나에 한 번이고 줄마다 visit_date 하나뿐이다. 기다리는 동안 "저장 중…"으로 막히고 체크 칸이 모두 막힌다', async () => {
    const user = userEvent.setup()
    render(<OutsideCounts />)
    const panel = await memoPanel()
    const writing = opener()
    db.writeGate = writing.gate
    await user.click(box(panel, '10/6 (화)'))
    await user.click(box(panel, '10/2 (금)'))
    await user.click(saveButton(panel))

    await waitFor(() => expect(db.writes).toHaveLength(1))
    const [sent] = db.writes
    expect(sent.table).toBe('claim_day_closes')
    expect(sent.method).toBe('upsert')
    const rows = sent.payload as Record<string, unknown>[]
    expect(rows.map((r) => Object.keys(r))).toEqual([['visit_date'], ['visit_date']])
    expect(rows.map((r) => r.visit_date).sort()).toEqual(['2026-10-02', '2026-10-06'])
    // 답을 기다리는 동안
    const busy = saveButton(panel)
    expect(textOf(busy)).toBe('저장 중…')
    expect(busy.disabled).toBe(true)
    for (const input of listBoxes(panel)) expect(input.disabled).toBe(true)
    await user.click(busy)
    expect(db.writes).toHaveLength(1)

    writing.open()
    await waitFor(() => expect(within(pickBar(panel)).getByText('2일을 완료로 바꿨어요')).toBeTruthy())
    // 건수 표에는 쓰지 않는다
    expect(db.writes.map((w) => w.table)).toEqual(['claim_day_closes'])
  })

  it('AC-2801.4: 저장이 성공하면 두 날이 위 목록에서 빠지고 N일 남음이 2 줄며 "완료로 바꾼 날"이 2 는다. 고른 것은 비고 고르기 줄은 "2일을 완료로 바꿨어요"와 [되돌리기]다', async () => {
    db.closes = [close('2026-09-28', AT_1106)]
    const user = userEvent.setup()
    render(<OutsideCounts />)
    const panel = await memoPanel()
    expect(leftText(panel)).toBe('5일 남음')
    expect(doneSummary(panel)).toBe('완료로 바꾼 날 1')

    await saveTwo(user, panel)
    expect(listDates(panel)).toEqual(['10/7 (수)', '10/5 (월)', '10/1 (목)'])
    expect(leftText(panel)).toBe('3일 남음')
    expect(doneSummary(panel)).toBe('완료로 바꾼 날 3')
    for (const input of listBoxes(panel)) {
      expect(input.checked).toBe(false)
      expect(input.disabled).toBe(false)
    }
    const bar = pickBar(panel)
    expect(within(bar).getByRole('button', { name: '되돌리기' })).toBeTruthy()
    expect(within(bar).queryByRole('button', { name: '완료로 저장' })).toBeNull()
    expectClasses(bar, 'bg-positive-soft')
    expect(within(panel).queryByRole('alert')).toBeNull()
  })

  it('AC-2801.4·AC-2803.1: 알림 줄의 [되돌리기]는 방금 저장한 두 날을 지우는 요청 하나로 함께 되돌린다', async () => {
    const user = userEvent.setup()
    render(<OutsideCounts />)
    const panel = await memoPanel()
    await saveTwo(user, panel)
    await user.click(within(pickBar(panel)).getByRole('button', { name: '되돌리기' }))

    await waitFor(() => expect(listDates(panel)).toEqual(OCT_LEFT))
    expect(db.writes).toHaveLength(2)
    const undo = db.writes[1]
    expect(undo.table).toBe('claim_day_closes')
    expect(undo.method).toBe('delete')
    expect(undo.filters).toHaveLength(1)
    const [op, column, values] = undo.filters[0]
    expect([op, column]).toEqual(['in', 'visit_date'])
    expect((values as string[]).slice().sort()).toEqual(['2026-10-02', '2026-10-06'])
    expect(leftText(panel)).toBe('5일 남음')
    expect(doneSummary(panel)).toBe('완료로 바꾼 날 0')
    expect(within(pickBar(panel)).getByText('완료로 바꿀 날을 골라 주세요')).toBeTruthy()
    expect(db.writes.map((w) => w.table)).toEqual(['claim_day_closes', 'claim_day_closes'])
  })

  it('AC-2801.4: 저장 뒤 체크 칸을 다시 켜면 알림이 사라지고 "1일 골랐어요"와 [완료로 저장]으로 돌아간다', async () => {
    const user = userEvent.setup()
    render(<OutsideCounts />)
    const panel = await memoPanel()
    await saveTwo(user, panel)
    await user.click(box(panel, '10/1 (목)'))
    const bar = pickBar(panel)
    expect(textOf(bar)).not.toContain('완료로 바꿨어요')
    expect(within(bar).getByText('1일 골랐어요')).toBeTruthy()
    expect(within(bar).queryByRole('button', { name: '되돌리기' })).toBeNull()
    expect(saveButton(panel).disabled).toBe(false)
    expectClasses(bar, 'bg-accent-soft')
  })

  it('AC-2801.4: 저장이 성공하면 화면을 바로 고치고(시각은 지금 시각) 다시 읽어 서버 시각으로 맞춘다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-08T07:30:00+09:00'))
    const user = userEvent.setup()
    render(<OutsideCounts />)
    const panel = await memoPanel()
    await openDone(user, panel)
    await user.click(box(panel, '10/6 (화)'))
    const reading = opener()
    db.gate = reading.gate // 저장 뒤 다시 읽기가 답을 기다린다
    const before = db.reads
    await user.click(saveButton(panel))

    await waitFor(() => expect(within(pickBar(panel)).getByText('1일을 완료로 바꿨어요')).toBeTruthy())
    expect(listDates(panel)).toEqual(['10/7 (수)', '10/5 (월)', '10/2 (금)', '10/1 (목)'])
    expect(textOf(doneLine(panel, '10/6 (화)'))).toContain('완료로 바꿈 · 11월 8일 (일) 07:30')
    await waitFor(() => expect(db.reads).toBe(before + 4)) // 네 표를 다시 읽는다

    reading.open()
    await waitFor(() => expect(textOf(doneLine(panel, '10/6 (화)'))).toContain('완료로 바꿈 · 11월 8일 (일) 09:12'))
    expect(doneLines(panel)).toHaveLength(1)
  })

  it('AC-2801.4: 저장 뒤 다시 읽기가 실패해도 고친 화면을 둔다(저장은 이미 됐다)', async () => {
    const user = userEvent.setup()
    render(<OutsideCounts />)
    const panel = await memoPanel()
    await user.click(box(panel, '10/6 (화)'))
    db.error = { code: '500', message: 'relation secret' }
    db.status = 500
    const before = db.reads
    await user.click(saveButton(panel))

    await waitFor(() => expect(db.reads).toBe(before + 4))
    await settle()
    expect(panel.isConnected).toBe(true)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(within(pickBar(panel)).getByText('1일을 완료로 바꿨어요')).toBeTruthy()
    expect(listDates(panel)).toEqual(['10/7 (수)', '10/5 (월)', '10/2 (금)', '10/1 (목)'])
    expect(leftText(panel)).toBe('4일 남음')
    expect(doneSummary(panel)).toBe('완료로 바꾼 날 1')
  })

  it.each([
    ['서버 오류', 'error'],
    ['연결 끊김', 'throw'],
    ['표가 아직 없음', 'no-table'],
  ] as const)('AC-2801.5: 저장이 실패하면(%s) 목록·고른 것·N일 남음은 그대로이고 패널 안에 E-DAYCLOSE-FAILED 안내다. 원래 오류 글은 없고 [완료로 저장]을 다시 누를 수 있다', async (_name, fail) => {
    db.writeFail = fail
    const user = userEvent.setup()
    const { container } = render(<OutsideCounts />)
    const panel = await memoPanel()
    await user.click(box(panel, '10/6 (화)'))
    await user.click(box(panel, '10/2 (금)'))
    await user.click(saveButton(panel))

    const alert = await within(panel).findByRole('alert')
    const info = errorInfo('E-DAYCLOSE-FAILED')
    expect(alert.textContent).toContain(info.what)
    expect(alert.textContent).toContain(info.fix)
    expect(alert.textContent).toContain('오류 번호 E-DAYCLOSE-FAILED')
    expect(container.textContent).not.toContain('secret')
    // 고르기 줄 아래·표 위
    expect(pickBar(panel).compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(alert.compareDocumentPosition(listTable(panel) as HTMLElement) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // 그대로다
    expect(listDates(panel)).toEqual(OCT_LEFT)
    expect(leftText(panel)).toBe('5일 남음')
    expect(doneSummary(panel)).toBe('완료로 바꾼 날 0')
    expect(box(panel, '10/6 (화)').checked).toBe(true)
    expect(box(panel, '10/2 (금)').checked).toBe(true)
    expect(within(pickBar(panel)).getByText('2일 골랐어요')).toBeTruthy()
    const again = saveButton(panel)
    expect(textOf(again)).toBe('완료로 저장')
    expect(again.disabled).toBe(false)

    // 다시 누르면 다시 보낸다
    db.writeFail = null
    await user.click(again)
    await waitFor(() => expect(within(pickBar(panel)).getByText('2일을 완료로 바꿨어요')).toBeTruthy())
    expect(db.writes).toHaveLength(2)
    expect(within(panel).queryByRole('alert')).toBeNull()
  })

  it('AC-2801.6: 다른 창에서 이미 완료로 저장된 날을 다시 저장해도 실패하지 않고, 그 날은 한 줄이며 처음 저장한 시각이 남는다', async () => {
    const user = userEvent.setup()
    render(<OutsideCounts />)
    const panel = await memoPanel()
    expect(listDates(panel)).toContain('10/6 (화)')
    db.closes = [close('2026-10-06', AT_1107)] // 다른 창이 먼저 저장했다. 이 화면은 아직 모른다
    await user.click(box(panel, '10/6 (화)'))
    await user.click(saveButton(panel))

    await waitFor(() => expect(within(pickBar(panel)).getByText('1일을 완료로 바꿨어요')).toBeTruthy())
    expect(within(panel).queryByRole('alert')).toBeNull()
    expect(db.writes[0].options).toMatchObject({ ignoreDuplicates: true })
    expect(db.closes).toEqual([close('2026-10-06', AT_1107)])
    await openDone(user, panel)
    await waitFor(() => expect(textOf(doneLine(panel, '10/6 (화)'))).toContain('완료로 바꿈 · 11월 7일 (토) 15:44'))
    expect(doneLines(panel)).toHaveLength(1)
    expect(doneSummary(panel)).toBe('완료로 바꾼 날 1')
  })

  it('AC-2801.7: 남은 날이 하나도 없으면 고르기 줄은 없고 "완료로 바꾼 날"은 그대로 있다', async () => {
    db.days = [OCT[0]]
    db.closes = [close('2026-10-06', AT_1107)]
    render(<OutsideCounts />)
    const panel = await memoPanel()
    expect(leftText(panel)).toBe('0일 남음')
    expect(within(panel).getByText('남은 메모가 없어요')).toBeTruthy()
    expect(within(panel).queryByRole('status')).toBeNull()
    expect(within(panel).queryByRole('button', { name: '완료로 저장' })).toBeNull()
    expect(within(panel).queryAllByRole('checkbox')).toEqual([])
    expect(textOf(panel)).not.toContain('완료로 바꿀 날을 골라 주세요')
    expect(doneSummary(panel)).toBe('완료로 바꾼 날 1')
  })

  it('AC-2801.7: 남은 날을 모두 저장해 0일이 되면 고르기 줄이 없어지고 "완료로 바꾼 날"은 남는다', async () => {
    db.days = DAYS // 남은 날 둘
    const user = userEvent.setup()
    render(<OutsideCounts />)
    const panel = await memoPanel()
    await user.click(box(panel, '11/2 (월)'))
    await user.click(box(panel, '10/30 (금)'))
    await user.click(saveButton(panel))

    await waitFor(() => expect(leftText(panel)).toBe('0일 남음'))
    expect(within(panel).getByText('남은 메모가 없어요')).toBeTruthy()
    expect(within(panel).queryByRole('status')).toBeNull()
    expect(doneSummary(panel)).toBe('완료로 바꾼 날 2')
  })

  it('AC-2801.7·AC-2802.1: 올린 건수가 하나도 없으면 지금 그대로 빈 안내이고 고르기 줄·"완료로 바꾼 날"이 없다', async () => {
    db.days = []
    db.closes = [close('2026-10-06', AT_1107)]
    render(<OutsideCounts />)
    const panel = await memoPanel()
    expect(within(panel).getByText('아직 올린 건수가 없어요')).toBeTruthy()
    expect(within(panel).queryByRole('status')).toBeNull()
    expect(panel.querySelector('details')).toBeNull()
    expect(textOf(panel)).not.toContain('완료로 바꾼 날')
  })

  it('AC-2802.1: 패널 맨 아래 접힌 "완료로 바꾼 날 {N}"을 펼치면 안내 한 줄과 최근 날짜부터 날짜·"완료로 바꿈 · 시각"·입력함 / 메모 필요·완료 칩·[되돌리기]다', async () => {
    db.closes = [close('2026-10-02', AT_1106), close('2026-10-06', AT_1107)]
    const user = userEvent.setup()
    render(<OutsideCounts />)
    const panel = await memoPanel()
    const details = doneBox(panel)
    expect(details.open).toBe(false)
    expect(panel.lastElementChild).toBe(details)
    expect(doneSummary(panel)).toBe('완료로 바꾼 날 2')

    await openDone(user, panel)
    expect(within(details).getByText('숫자는 비트에서 올라온 그대로예요. [되돌리기]를 누르면 위 목록으로 돌아가요.')).toBeTruthy()
    const lines = doneLines(panel)
    expect(lines).toHaveLength(2)
    const [near, far] = lines.map((line) => within(line).getAllByRole('cell'))
    expect(textOf(near[0])).toMatch(/^10\/6 \(화\)/)
    expect(within(near[0]).getByText('완료로 바꿈 · 11월 7일 (토) 15:44')).toBeTruthy()
    expect(textOf(near[1])).toBe('0 / 8')
    expectClasses(within(near[2]).getByText('완료'), ds.chip.positive)
    const undo = within(near[3]).getByRole('button', { name: '10/6 (화) 되돌리기' })
    expect(textOf(undo)).toBe('되돌리기')
    expect(textOf(far[0])).toMatch(/^10\/2 \(금\)/)
    expect(within(far[0]).getByText('완료로 바꿈 · 11월 6일 (금) 13:34')).toBeTruthy()
    expect(textOf(far[1])).toBe('6 / 7')
    // 위 목록에서는 빠졌다
    expect(listDates(panel)).toEqual(['10/7 (수)', '10/5 (월)', '10/1 (목)'])
    expect(leftText(panel)).toBe('3일 남음')
  })

  it('AC-2802.1: 완료 표시가 없으면 "완료로 바꾼 날 0"이고 펼치면 "아직 없어요"다', async () => {
    const user = userEvent.setup()
    render(<OutsideCounts />)
    const panel = await memoPanel()
    expect(doneSummary(panel)).toBe('완료로 바꾼 날 0')
    await openDone(user, panel)
    expect(within(doneBox(panel)).getByText('아직 없어요')).toBeTruthy()
    expect(doneLines(panel)).toEqual([])
  })

  it('AC-2802.2·AC-2803.1: 한 줄의 [되돌리기]는 claim_day_closes에서 그 날짜 하나를 지우는 요청 하나다. 기다리는 동안 그 줄 단추만 막히고, 성공하면 위 목록의 날짜 차례 자리로 돌아가며 N일 남음이 1 는다', async () => {
    db.closes = [close('2026-10-06', AT_1107), close('2026-10-02', AT_1106)]
    const user = userEvent.setup()
    render(<OutsideCounts />)
    const panel = await memoPanel()
    await openDone(user, panel)
    expect(leftText(panel)).toBe('3일 남음')
    const writing = opener()
    db.writeGate = writing.gate
    await user.click(undoButton(panel, '10/6 (화)'))

    await waitFor(() => expect(db.writes).toHaveLength(1))
    expect(db.writes[0]).toEqual({ table: 'claim_day_closes', method: 'delete', payload: undefined, options: undefined, filters: [['in', 'visit_date', ['2026-10-06']]] })
    expect(undoButton(panel, '10/6 (화)').disabled).toBe(true)
    expect(undoButton(panel, '10/2 (금)').disabled).toBe(false)

    writing.open()
    await waitFor(() => expect(listDates(panel)).toEqual(['10/7 (수)', '10/6 (화)', '10/5 (월)', '10/1 (목)']))
    expect(leftText(panel)).toBe('4일 남음')
    expect(doneSummary(panel)).toBe('완료로 바꾼 날 1')
    expect(doneLine(panel, '10/6 (화)')).toBeUndefined()
    expect(db.writes.map((w) => w.table)).toEqual(['claim_day_closes'])
  })

  it('AC-2802.3: [되돌리기]가 실패하면 그 줄은 아래 칸에 그대로이고 AC-2801.5와 같은 E-DAYCLOSE-FAILED 안내다', async () => {
    db.closes = [close('2026-10-06', AT_1107)]
    db.writeFail = 'error'
    const user = userEvent.setup()
    const { container } = render(<OutsideCounts />)
    const panel = await memoPanel()
    await openDone(user, panel)
    await user.click(undoButton(panel, '10/6 (화)'))

    const alert = await within(panel).findByRole('alert')
    expect(alert.textContent).toContain(errorInfo('E-DAYCLOSE-FAILED').what)
    expect(alert.textContent).toContain('오류 번호 E-DAYCLOSE-FAILED')
    expect(container.textContent).not.toContain('secret')
    expect(doneLine(panel, '10/6 (화)')).toBeTruthy()
    expect(undoButton(panel, '10/6 (화)').disabled).toBe(false)
    expect(listDates(panel)).not.toContain('10/6 (화)')
    expect(leftText(panel)).toBe('4일 남음')
    expect(doneSummary(panel)).toBe('완료로 바꾼 날 1')
  })

  it('AC-2802.4: 남은 메모가 없는 날·읽은 건수에 없는 날의 줄은 날짜·바꾼 시각·칩·[되돌리기]만 있고 숫자 칸은 비어 있다. 되돌려도 위 목록에 생기지 않는다', async () => {
    db.closes = [close('2026-10-08', AT_1107), close('2026-09-15', AT_1106)]
    const user = userEvent.setup()
    render(<OutsideCounts />)
    const panel = await memoPanel()
    await openDone(user, panel)
    const lines = doneLines(panel)
    expect(lines).toHaveLength(2)
    for (const [line, label] of [
      [lines[0], '10/8 (목)'],
      [lines[1], '9/15 (화)'],
    ] as const) {
      const cells = within(line).getAllByRole('cell')
      expect(textOf(cells[0])).toMatch(new RegExp(`^${label.replace(/[()]/g, '\\$&')}완료로 바꿈 · `))
      expect(textOf(cells[1])).toBe('')
      expect(textOf(cells[2])).toBe('완료')
      expect(within(cells[3]).getByRole('button', { name: `${label} 되돌리기` })).toBeTruthy()
    }
    expect(leftText(panel)).toBe('5일 남음')

    await user.click(undoButton(panel, '10/8 (목)'))
    await waitFor(() => expect(doneSummary(panel)).toBe('완료로 바꾼 날 1'))
    expect(listDates(panel)).toEqual(OCT_LEFT)
    expect(leftText(panel)).toBe('5일 남음')
  })

  it('AC-2803.2: 완료 표시가 건수 표보다 늦게 생겨도 "마지막으로 바뀐 시각"은 건수 표 세 개의 시각만으로 정한다', async () => {
    db.closes = [close('2026-10-06', AT_1107)]
    const user = userEvent.setup()
    const { container } = render(<OutsideCounts />)
    const panel = await memoPanel()
    const line = '마지막으로 바뀐 시각 10월 8일 (목) 18:00 · 비트 PC에서 올라옴'
    expect(textOf(container)).toContain(line)
    // 저장한 뒤에도 그대로다(완료 시각을 섞지 않는다)
    await user.click(box(panel, '10/7 (수)'))
    await user.click(saveButton(panel))
    await waitFor(() => expect(within(pickBar(panel)).getByText('1일을 완료로 바꿨어요')).toBeTruthy())
    await settle()
    expect(textOf(container)).toContain(line)
  })

  it('AC-2803.3: 남은 메모가 있는 날 5개 가운데 2개에 완료 표시가 있으면 3일 남음이고 위 목록은 그 3일이다', async () => {
    db.closes = [close('2026-10-07', AT_1107), close('2026-10-02', AT_1106)]
    render(<OutsideCounts />)
    const panel = await memoPanel()
    expect(leftText(panel)).toBe('3일 남음')
    expect(listDates(panel)).toEqual(['10/6 (화)', '10/5 (월)', '10/1 (목)'])
    expect(db.selects).toContain('visit_date, closed_at')
  })

  it('AC-2803.3: 완료 표시 읽기만 실패해도 패널 대신 E-COUNTS-FAILED이고 원래 오류 글이 없다', async () => {
    db.closesError = { code: '500', message: 'closes secret' }
    db.closesStatus = 500
    render(<OutsideCounts />)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('오류 번호 E-COUNTS-FAILED')
    expect(alert.textContent).not.toContain('secret')
    expect(screen.queryByRole('heading', { level: 2, name: '메모 입력 현황' })).toBeNull()
  })

  it('AC-2803.3: 완료 표시 표가 아직 없으면(마이그레이션 전) 완료 표시 없음으로 보고 지금 화면과 같다', async () => {
    db.closesError = { code: 'PGRST205', message: 'relation secret' }
    db.closesStatus = 404
    render(<OutsideCounts />)
    const panel = await memoPanel()
    expect(leftText(panel)).toBe('5일 남음')
    expect(listDates(panel)).toEqual(OCT_LEFT)
    expect(doneSummary(panel)).toBe('완료로 바꾼 날 0')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-2803.3: 창 초점이 오면 완료 표시도 다시 읽는다(다른 창에서 완료로 바꾼 날이 빠진다)', async () => {
    render(<OutsideCounts />)
    const panel = await memoPanel()
    expect(leftText(panel)).toBe('5일 남음')
    db.closes = [close('2026-10-05', AT_1107)]
    window.dispatchEvent(new Event('focus'))
    await waitFor(() => expect(leftText(panel)).toBe('4일 남음'))
    expect(listDates(panel)).not.toContain('10/5 (월)')
    expect(doneSummary(panel)).toBe('완료로 바꾼 날 1')
  })

  it('AC-2801.1: 휴대폰에서 상자 둘레 칸 전체(44px)를 눌러도 그 날이 골라진다', async () => {
    const user = userEvent.setup()
    render(<OutsideCounts />)
    const panel = await memoPanel()
    const cell = box(panel, '10/6 (화)').closest('td') as HTMLElement
    const area = cell.querySelector('label') as HTMLLabelElement
    expect(area).toBeTruthy()
    expectClasses(area, 'absolute inset-0')
    expect(area.htmlFor).toBe(box(panel, '10/6 (화)').id)
    await user.click(area)
    expect(box(panel, '10/6 (화)').checked).toBe(true)
    expect(within(pickBar(panel)).getByText('1일 골랐어요')).toBeTruthy()
  })

  it('AC-2801.4: 알림의 날을 아래 칸에서 모두 되돌린 뒤 다른 창이 그 날을 다시 완료로 바꿔도, 옛 알림이 돌아오지 않고 고르기 줄이다', async () => {
    const user = userEvent.setup()
    render(<OutsideCounts />)
    const panel = await memoPanel()
    await saveTwo(user, panel)
    await openDone(user, panel)
    await user.click(undoButton(panel, '10/6 (화)'))
    await user.click(undoButton(panel, '10/2 (금)'))
    await waitFor(() => expect(listDates(panel)).toEqual(OCT_LEFT))
    db.closes = [close('2026-10-06', AT_1107), close('2026-10-02', AT_1107)]
    window.dispatchEvent(new Event('focus'))
    await waitFor(() => expect(leftText(panel)).toBe('3일 남음'))
    expect(within(pickBar(panel)).queryByText(/완료로 바꿨어요/)).toBeNull()
    expect(within(pickBar(panel)).getByText('완료로 바꿀 날을 골라 주세요')).toBeTruthy()
  })

  it('AC-2801.2: 골라 둔 날이 다른 창에서 완료돼 목록에서 빠졌다가 되돌아오면 골라진 채로 돌아오지 않는다', async () => {
    const user = userEvent.setup()
    render(<OutsideCounts />)
    const panel = await memoPanel()
    await user.click(box(panel, '10/5 (월)'))
    expect(within(pickBar(panel)).getByText('1일 골랐어요')).toBeTruthy()
    db.closes = [close('2026-10-05', AT_1107)]
    window.dispatchEvent(new Event('focus'))
    await waitFor(() => expect(leftText(panel)).toBe('4일 남음'))
    await openDone(user, panel)
    await user.click(undoButton(panel, '10/5 (월)'))
    await waitFor(() => expect(listDates(panel)).toEqual(OCT_LEFT))
    expect(box(panel, '10/5 (월)').checked).toBe(false)
    expect(within(pickBar(panel)).getByText('완료로 바꿀 날을 골라 주세요')).toBeTruthy()
  })

  it('AC-2806.2: 화면은 환자 자료 구역(lib/precheck·lib/bridge·workers·components/claim/rows)을 불러오지 않는다', () => {
    const source = readFileSync(join(process.cwd(), 'src/components/claim/OutsideCounts.tsx'), 'utf8')
    const imports = [...source.matchAll(/from '([^']+)'/g)].map((m) => m[1])
    expect(imports).toContain('@/lib/storage/claimDayCloses')
    for (const from of imports) expect(from, from).not.toMatch(/lib\/(precheck|bridge|parsers|payload|patients)|workers|claim\/rows/)
  })
})
