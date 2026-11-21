// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStaffBase } from '@/components/staff/useStaffBase'
import { StaffStoreError } from '@/lib/storage/staff'
import { HAN, JUNG, KIM, LEAVES, LEE, MEMBERS, TODAY, clinicProfile, leave, makeBase, member, run } from './testData'
import { LeaveScreen } from './LeaveScreen'

// 휴가 화면 (staff REQ-7614, 시안 docs/mockups/staff/leave.html ①·②·④·⑤·⑥ '나'). 폰 장면 ⑦은 만들지 않는다.
// 공용 읽기 훅(useStaffBase)만 흉내 낸다 — 연차 셈(lib/staff/leave)·근무표 셈(lib/staff/schedule)은 진짜를 쓴다.
// 보기 자료는 requirements.md '보기 자료'(오늘 2026-11-21 토, 입사일 기준 · 못 쓴 연차는 수당으로 정산)

vi.mock('@/components/staff/useStaffBase', () => ({ useStaffBase: vi.fn() }))

afterEach(cleanup)

type Base = ReturnType<typeof makeBase>
let base: Base

function show(next: Base = makeBase(), today = TODAY) {
  base = next
  vi.mocked(useStaffBase).mockReturnValue(base as never)
  return render(<LeaveScreen today={today} />)
}

const flat = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
const statusTable = () => screen.findByRole('table', { name: '연차 현황' })
async function rowOf(name: string) {
  const table = await statusTable()
  const row = within(table)
    .getAllByRole('row')
    .find((r) => within(r).queryByRole('button', { name }) !== null)
  if (!row) throw new Error(`${name} 줄이 없어요`)
  return row
}
const cellsOf = (row: HTMLElement) => within(row).getAllByRole('cell')

beforeEach(() => {
  vi.mocked(useStaffBase).mockReset()
})

describe('AC-7614.1: 연차 현황 표', () => {
  it('AC-7614.1: 머리 줄 — 연차 기준·못 쓴 연차·오늘 기준, [휴가 넣기]·[연차 규칙]', async () => {
    show()
    const head = await screen.findByRole('heading', { name: '연차 현황' })
    expect(flat(head.parentElement)).toContain('연차 기준 입사일 기준 · 못 쓴 연차는 수당으로 정산 · 2026-11-21 (토) 기준')
    expect(screen.getByRole('button', { name: '휴가 넣기' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '연차 규칙' })).toBeTruthy()
  })

  it('AC-7614.1: 1월 1일 기준 · 다음 해로 넘김이면 머리 글도 그 말이다', async () => {
    const next = makeBase()
    next.settings = { ...next.settings, leaveBasis: 'jan1', leftover: 'carry' }
    show(next)
    const head = await screen.findByRole('heading', { name: '연차 현황' })
    expect(flat(head.parentElement)).toContain('연차 기준 1월 1일 기준 · 못 쓴 연차는 다음 해로 넘김 · 2026-11-21 (토) 기준')
  })

  it('AC-7614.1: 칸 머리는 이름 · 직종 · 이번 연차 기간 · 생긴 · 쓴 · 남은 · 남은 비율 · 다음 새 연차', async () => {
    show()
    const table = await statusTable()
    expect(within(table).getAllByRole('columnheader').map(flat)).toEqual(['이름 · 직종', '이번 연차 기간', '생긴', '쓴', '남은', '남은 비율', '다음 새 연차'])
  })

  it('AC-7614.1: 재직자만 보인다(퇴사한 오세린·문태호는 없다)', async () => {
    show()
    const table = await statusTable()
    const names = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((r) => flat(within(r).getAllByRole('button')[0]))
    expect(names).toEqual(['최민준', '김하늘', '이도윤', '정유나', '박서연', '한지우'])
    expect(within(table).queryByText('오세린')).toBeNull()
    expect(within(table).queryByText('문태호')).toBeNull()
  })

  it.each([
    ['김하늘', '2026-03-02 ~ 2027-03-01', '17일', '9.5일', '7.5일', '44%', '2027-03-02 · 17일'],
    ['이도윤', '2026-07-17 ~ 2027-07-16', '16일', '6일', '10일', '63%', '2027-07-17 · 16일'],
    ['박서연', '2026-01-06 ~ 2027-01-05', '15일', '3일', '12일', '80%', '2027-01-06 · 15일'],
    ['정유나', '2026-09-02 ~ 2027-09-01', '9일', '2일', '7일', '78%', '2027-09-02 · 10일'],
    ['한지우', '2026-02-02 ~ 2027-02-01', '9일', '4일', '5일', '56%', '2026-12-02 · 1일 더'],
  ])('AC-7614.1: %s 줄 — 기간 %s · 생긴 %s · 쓴 %s · 남은 %s · %s · 다음 %s', async (name, period, granted, used, left, ratio, next) => {
    show()
    const cells = cellsOf(await rowOf(name))
    expect(flat(cells[1])).toBe(period)
    expect([flat(cells[2]), flat(cells[3]), flat(cells[4])]).toEqual([granted, used, left])
    expect(flat(cells[5])).toBe(ratio)
    expect(flat(cells[6])).toBe(next)
  })

  it('AC-7614.1: 최민준 — 이번 달에 끝나요 꼬리, 남은 비율 18%는 주황 막대, 다음 새 연차 4일 뒤', async () => {
    show()
    const cells = cellsOf(await rowOf('최민준'))
    expect(flat(cells[1])).toBe('2025-11-25 ~ 2026-11-24 11-24에 끝나요 — 남은 3일은 수당으로 정산')
    expect([flat(cells[2]), flat(cells[3]), flat(cells[4])]).toEqual(['17일', '14일', '3일'])
    expect(flat(cells[5])).toBe('18%')
    expect(cells[5].querySelector('[data-meter]')?.getAttribute('data-low')).toBe('true')
    expect(flat(cells[6])).toBe('2026-11-25 · 18일 4일 뒤')
  })

  it('AC-7614.1: 25% 이상이면 막대가 주황이 아니고, 막대 길이는 남은 ÷ 생긴이다', async () => {
    show()
    const meter = cellsOf(await rowOf('김하늘'))[5].querySelector<HTMLElement>('[data-meter]')
    expect(meter?.getAttribute('data-low')).toBe('false')
    expect(meter?.querySelector<HTMLElement>('i, span')?.style.width).toBe('44%')
  })

  it('AC-7614.1: 다음 해로 넘김이면 생긴 칸 아래에 넘어온 일수, 남은 비율은 남은 ÷ (생긴 + 넘어옴)', async () => {
    const next = makeBase()
    next.settings = { ...next.settings, leftover: 'carry' }
    show(next)
    const cells = cellsOf(await rowOf('이도윤'))
    expect([flat(cells[2]), flat(cells[3]), flat(cells[4])]).toEqual(['16일 넘어옴 28일', '6일', '38일'])
    expect(flat(cells[5])).toBe('86%')
    // 수당으로 정산이면 넘어옴 줄이 없다
    cleanup()
    show()
    expect(flat(cellsOf(await rowOf('이도윤'))[2])).toBe('16일')
  })

  it('AC-7614.1: 이름 칸 — 직종 · 근무 형태, 이어진 사람 예약 (표시), 파트타임·1년 미만 꼬리', async () => {
    show()
    expect(flat(cellsOf(await rowOf('김하늘'))[0])).toBe('김하늘 간호조무사 · 정규직')
    expect(flat(cellsOf(await rowOf('이도윤'))[0])).toBe('이도윤 예약 (이) 물리치료사 · 정규직')
    expect(flat(cellsOf(await rowOf('박서연'))[0])).toBe('박서연 예약 (박) 물리치료사 · 정규직')
    expect(flat(cellsOf(await rowOf('정유나'))[0])).toBe('정유나 원무 · 파트타임 파트타임 — 주 24시간 비례')
    expect(flat(cellsOf(await rowOf('한지우'))[0])).toBe('한지우 원무 · 계약직 1년 미만 — 달마다 1일씩 생겨요')
  })

  it('AC-7614.1: 남은 연차가 음수면 빨갛다', async () => {
    const next = makeBase()
    const extra = run('m-han', '2026-11-02', '2026-11-07') // 6일 더 → 9 − 10 = −1
    next.store.listLeaves.mockResolvedValue([...LEAVES, ...extra])
    show(next)
    const left = cellsOf(await rowOf('한지우'))[4]
    expect(flat(left)).toBe('-1일')
    expect(within(left).getByText('-1일').className).toContain('text-negative')
    expect(within(cellsOf(await rowOf('김하늘'))[4]).getByText('7.5일').className).not.toContain('text-negative')
  })

  it("AC-7614.1: 표 아래 글 — '쓴'은 연차·반차만 셉니다 …", async () => {
    show()
    await statusTable()
    expect(
      screen.getByText(
        "'쓴'은 연차·반차만 셉니다. 경조사·병가·출산·육아휴직·무급(결근)은 연차에서 빼지 않습니다. 막대 = 남은 ÷ 생긴. 남은 비율이 25% 밑이면 막대가 주황입니다. 퇴사한 직원은 이 표에 없습니다.",
      ),
    ).toBeTruthy()
  })

  it("AC-7614.1: 다음 해로 넘김이면 표 아래 글이 '막대 = 남은 ÷ (생긴 + 넘어옴).'이고 막대 길이도 그 비율이다", async () => {
    const next = makeBase()
    next.settings = { ...next.settings, leftover: 'carry' }
    show(next)
    await statusTable()
    expect(
      screen.getByText(
        "'쓴'은 연차·반차만 셉니다. 경조사·병가·출산·육아휴직·무급(결근)은 연차에서 빼지 않습니다. 막대 = 남은 ÷ (생긴 + 넘어옴). 남은 비율이 25% 밑이면 막대가 주황입니다. 퇴사한 직원은 이 표에 없습니다.",
      ),
    ).toBeTruthy()
    expect(screen.queryByText(/막대 = 남은 ÷ 생긴\./)).toBeNull()
    // 이도윤 남은 38 ÷ (16 + 28) = 86%
    expect(cellsOf(await rowOf('이도윤'))[5].querySelector<HTMLElement>('[data-meter] span')?.style.width).toBe('86%')
  })

  it('AC-7614.1: 휴가는 직원들 입사일부터 2년 뒤까지 한 번에 읽고, 기간 셈에는 근무표 바뀐 날도 함께 읽는다', async () => {
    show()
    await statusTable()
    expect(base.store.listLeaves).toHaveBeenCalledWith({ from: '2019-04-01', to: '2028-11-21' })
    expect(base.store.listChanges).toHaveBeenCalledWith({ from: '2019-04-01', to: '2028-11-21' })
  })

  it('AC-7614.1: 재직자가 없으면 표 대신 안내 줄이고 [휴가 넣기]는 막힌다', async () => {
    const next = makeBase()
    next.members = [member('m-old', '옛사람', { hiredOn: '2018-01-02', leftOn: '2020-01-31' })]
    show(next)
    expect(await screen.findByText('재직 중인 직원이 없어요. 명단에서 직원을 더하면 여기에 연차가 보여요.')).toBeTruthy()
    expect(screen.queryByRole('table', { name: '연차 현황' })).toBeNull()
    expect((screen.getByRole('button', { name: '휴가 넣기' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('AC-7610.1: 읽기 실패', () => {
  it('AC-7610.1: 휴가를 못 읽으면 E-STAFF-READ-FAILED와 [다시 불러오기] — 누르면 다시 읽는다', async () => {
    const next = makeBase()
    next.store.listLeaves.mockRejectedValueOnce(new StaffStoreError('E-STAFF-READ-FAILED'))
    show(next)
    const alert = await screen.findByRole('alert')
    expect(flat(alert)).toContain('E-STAFF-READ-FAILED')
    fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }))
    await statusTable()
    expect(next.store.listLeaves).toHaveBeenCalledTimes(2)
  })

  it('AC-7610.1: 직원 자료를 못 읽으면 E-STAFF-READ-FAILED — [다시 불러오기]는 공용 읽기를 다시 부른다', async () => {
    const next = makeBase()
    next.state = 'failed'
    show(next)
    expect(flat(screen.getByRole('alert'))).toContain('E-STAFF-READ-FAILED')
    fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }))
    expect(next.reload).toHaveBeenCalledTimes(1)
    expect(next.store.listLeaves).not.toHaveBeenCalled()
  })

  it('AC-7610.1: 읽는 중에는 안내 글만 보인다', () => {
    const next = makeBase()
    next.state = 'loading'
    show(next)
    expect(screen.getByText('휴가를 불러오는 중이에요')).toBeTruthy()
  })
})

describe('AC-7614.6: 이번 달 연차 기간이 끝나는 직원 안내(시안 ⑥ 나)', () => {
  it('AC-7614.6: 수당 정산 — 최민준 11-24에 끝나요 3일, 가장 이른 끝날 전에 쓰면 일수가 줄어요', async () => {
    show()
    const box = await screen.findByRole('region', { name: '이번 달 연차 기간이 끝나는 직원 1명 — 11월 세무사 자료에 일수가 들어가요.' })
    const items = within(box).getAllByRole('listitem').map(flat)
    expect(items).toEqual(['최민준 11-24에 끝나요 3일'])
    expect(flat(box)).toContain('금액은 세무사가 계산해요. 11-24 전에 쓰면 일수가 줄어요.')
  })

  it('AC-7614.6: 안내는 연차 현황 위에 있다', async () => {
    show()
    const box = await screen.findByRole('region', { name: /이번 달 연차 기간이 끝나는 직원/ })
    const head = screen.getByRole('heading', { name: '연차 현황' })
    expect(box.compareDocumentPosition(head) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("AC-7614.6: 다음 해로 넘김이면 그 칸 대신 '남은 일수를 다음 기간에 더했어요' 한 줄", async () => {
    const next = makeBase()
    next.settings = { ...next.settings, leftover: 'carry' }
    show(next)
    await statusTable()
    expect(screen.getByText('남은 일수를 다음 기간에 더했어요')).toBeTruthy()
    expect(screen.queryByRole('region', { name: /이번 달 연차 기간이 끝나는 직원/ })).toBeNull()
  })

  it('AC-7614.6: 이번 달에 끝나는 사람이 없으면 칸이 없다', async () => {
    show(makeBase(), '2026-10-15')
    await statusTable()
    expect(screen.queryByRole('region', { name: /연차 기간이 끝나는 직원/ })).toBeNull()
    expect(screen.queryByText('남은 일수를 다음 기간에 더했어요')).toBeNull()
  })

  it('AC-7614.6: 1월 1일 기준이면 12월에 재직자 모두가 뜨고 끝날은 12-31이다', async () => {
    const next = makeBase()
    next.settings = { ...next.settings, leaveBasis: 'jan1' }
    show(next, '2026-12-10')
    const box = await screen.findByRole('region', { name: '이번 달 연차 기간이 끝나는 직원 6명 — 12월 세무사 자료에 일수가 들어가요.' })
    const items = within(box).getAllByRole('listitem').map(flat)
    expect(items).toHaveLength(6)
    for (const item of items) expect(item).toContain('12-31에 끝나요')
    expect(flat(box)).toContain('금액은 세무사가 계산해요. 12-31 전에 쓰면 일수가 줄어요.')
  })

  it('AC-7614.6: 이번 달에 이미 끝난 사람도 그달 안에는 남는다(끝났어요)', async () => {
    show(makeBase(), '2026-11-27')
    const box = await screen.findByRole('region', { name: '이번 달 연차 기간이 끝나는 직원 1명 — 11월 세무사 자료에 일수가 들어가요.' })
    expect(within(box).getAllByRole('listitem').map(flat)).toEqual(['최민준 11-24에 끝났어요 3일'])
    expect(flat(box)).toContain('금액은 세무사가 계산해요.')
    expect(flat(box)).not.toContain('전에 쓰면')
  })
})

describe('AC-7614.2: 휴가 달력', () => {
  const calendar = () => screen.findByRole('region', { name: '휴가 달력' })
  const dayCell = (cal: HTMLElement, day: string) => {
    const cell = cal.querySelector<HTMLElement>(`[data-day="${day}"]`)
    if (!cell) throw new Error(`${day} 칸이 없어요`)
    return cell
  }

  it('AC-7614.2: ‹ 2026년 11월 › · [이번 달] · 색 안내', async () => {
    show()
    const cal = await calendar()
    expect(within(cal).getByRole('heading', { name: '2026년 11월' })).toBeTruthy()
    expect(within(cal).getByRole('button', { name: '지난달' }).textContent).toBe('‹')
    expect(within(cal).getByRole('button', { name: '다음 달' }).textContent).toBe('›')
    expect(within(cal).getByRole('button', { name: '이번 달' })).toBeTruthy()
    const legend = within(cal).getByRole('list', { name: '색 안내' })
    expect(within(legend).getAllByRole('listitem').map(flat)).toEqual([
      '연차',
      '반차',
      '경조사',
      '병가',
      '출산·육아휴직',
      '무급(결근)',
      '예약 휴무',
      '공휴일·휴진일',
    ])
  })

  it('AC-7614.2: 월~일 머리와 칸 — 날짜 칸에 {이름} {종류} 칩, 반차는 오전·오후 반차', async () => {
    show()
    const cal = await calendar()
    expect(within(cal).getAllByRole('columnheader').map(flat)).toEqual(['월', '화', '수', '목', '금', '토', '일'])
    expect(flat(dayCell(cal, '2026-11-07'))).toContain('김하늘 연차')
    expect(flat(dayCell(cal, '2026-11-18'))).toContain('정유나 병가')
    expect(flat(dayCell(cal, '2026-11-05'))).toContain('정유나 오전 반차')
    expect(flat(dayCell(cal, '2026-11-20'))).toContain('한지우 오후 반차')
  })

  it("AC-7614.2: 이어진 사람 휴가에는 '예약 휴무'(반차면 '예약 휴무 · 오후')가 붙고, 안 이어진 사람에게는 없다", async () => {
    const next = makeBase()
    next.store.listLeaves.mockResolvedValue([...LEAVES, leave('m-lee', '2026-11-26')])
    show(next)
    const cal = await calendar()
    expect(flat(dayCell(cal, '2026-11-13'))).toContain('박서연 오후 반차 예약 휴무 · 오후')
    expect(flat(dayCell(cal, '2026-11-26'))).toContain('이도윤 연차 예약 휴무')
    expect(flat(dayCell(cal, '2026-11-07'))).not.toContain('예약 휴무')
  })

  it('AC-7614.2: 휴가 종류마다 색이 다르다(연차 파랑·반차 청록·병가 분홍 — 예약 달력 색)', async () => {
    show()
    const cal = await calendar()
    expect(within(cal).getByRole('button', { name: '김하늘 연차' }).className).toContain('bg-cal-blue-soft')
    expect(within(cal).getByRole('button', { name: '정유나 오전 반차' }).className).toContain('bg-cal-teal-soft')
    expect(within(cal).getByRole('button', { name: '정유나 병가' }).className).toContain('bg-cal-pink-soft')
  })

  it('AC-7614.2: 휴진일(일요일)은 회색 칸에 휴진, 오늘 칸 표시, 달 첫날은 11/1', async () => {
    show()
    const cal = await calendar()
    const sunday = dayCell(cal, '2026-11-08')
    expect(sunday.getAttribute('data-off')).toBe('true')
    expect(flat(sunday)).toContain('휴진')
    expect(dayCell(cal, '2026-11-09').getAttribute('data-off')).toBeNull()
    expect(flat(dayCell(cal, '2026-11-01'))).toContain('11/1')
    expect(within(dayCell(cal, TODAY)).getByRole('button', { name: /11월 21일 \(토\)/ }).getAttribute('aria-current')).toBe('date')
  })

  it('AC-7614.2: 공휴일은 회색 칸에 공휴일(12-25)', async () => {
    show()
    const cal = await calendar()
    fireEvent.click(within(cal).getByRole('button', { name: '다음 달' }))
    expect(within(cal).getByRole('heading', { name: '2026년 12월' })).toBeTruthy()
    const christmas = dayCell(cal, '2026-12-25')
    expect(christmas.getAttribute('data-off')).toBe('true')
    expect(flat(christmas)).toContain('공휴일')
  })

  it('AC-7614.2: ‹ › 로 달을 옮기고 [이번 달]로 돌아온다', async () => {
    show()
    const cal = await calendar()
    fireEvent.click(within(cal).getByRole('button', { name: '지난달' }))
    expect(within(cal).getByRole('heading', { name: '2026년 10월' })).toBeTruthy()
    expect(flat(dayCell(cal, '2026-10-23'))).toContain('이도윤 오후 반차')
    fireEvent.click(within(cal).getByRole('button', { name: '이번 달' }))
    expect(within(cal).getByRole('heading', { name: '2026년 11월' })).toBeTruthy()
  })

  it('AC-7614.2: 날짜 칸을 누르면 그날로 휴가 넣기가 열린다', async () => {
    show()
    const cal = await calendar()
    fireEvent.click(within(cal).getByRole('button', { name: '11월 26일 (목) 휴가 넣기' }))
    const dialog = screen.getByRole('dialog', { name: '휴가 넣기' })
    expect((within(dialog).getByLabelText('날짜') as HTMLInputElement).value).toBe('2026-11-26')
  })

  it('AC-7614.2: 칩을 누르면 그 휴가 고치기가 열린다', async () => {
    show()
    const cal = await calendar()
    fireEvent.click(within(cal).getByRole('button', { name: '박서연 오후 반차' }))
    const dialog = screen.getByRole('dialog', { name: '휴가 고치기' })
    expect((within(dialog).getByRole('combobox', { name: '사람' }) as HTMLSelectElement).value).toBe('m-park')
    expect(within(dialog).getByRole('button', { name: '반차' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(dialog).getByRole('button', { name: '오후' }).getAttribute('aria-pressed')).toBe('true')
    expect((within(dialog).getByLabelText('날짜') as HTMLInputElement).value).toBe('2026-11-13')
  })

  it('AC-7605.3: 공휴일 목록이 없는 해의 달에는 안내 글이 보인다', async () => {
    show(makeBase(), '2028-03-10')
    const cal = await calendar()
    expect(within(cal).getByText('2028년 공휴일 목록이 아직 없어요. 쉬는 날은 설정 → 병원 정보 휴진일로 넣어 주세요.')).toBeTruthy()
  })

  it('AC-7611.4: 달력은 넓은 칸 하나만 옆으로 밀린다(TableScroll)', async () => {
    show()
    const cal = await calendar()
    expect(within(cal).getByRole('region', { name: '휴가 달력 칸' }).className).toContain('overflow-x-auto')
  })
})

describe('AC-7614.4: 한 사람 휴가 기록', () => {
  async function openLee() {
    show()
    fireEvent.click(within(await statusTable()).getByRole('button', { name: '이도윤' }))
    return screen.findByRole('region', { name: '이도윤 휴가 기록' })
  }
  const recordTable = (rec: HTMLElement) => within(rec).getByRole('table', { name: '쓴 휴가' })

  it('AC-7614.4: 이름을 누르면 ‹ 연차 현황 · 이름 · 직종 · 근무 형태 · 주 시간 · 입사 · 예약 (표시) · [휴가 넣기]', async () => {
    const rec = await openLee()
    expect(within(rec).getByRole('button', { name: '‹ 연차 현황' })).toBeTruthy()
    expect(within(rec).getByRole('heading', { name: '이도윤' })).toBeTruthy()
    expect(flat(rec)).toContain('물리치료사 · 정규직 · 주 40시간 · 입사 2023-07-17')
    expect(within(rec).getByText('예약 (이)')).toBeTruthy()
    expect(within(rec).getByRole('button', { name: '이도윤 님 휴가 넣기' })).toBeTruthy()
    expect(screen.queryByRole('table', { name: '연차 현황' })).toBeNull()
  })

  it('AC-7614.4: 생긴·쓴·남은·다음 새 연차 네 칸', async () => {
    const rec = await openLee()
    const tile = (key: string) => flat(within(rec).getByText(key).nextElementSibling)
    expect([tile('생긴 연차'), tile('쓴 연차'), tile('남은 연차'), tile('다음 새 연차')]).toEqual(['16일', '6일', '10일', '2027-07-17 · 16일'])
  })

  it('AC-7614.4: 쓴 휴가 — 이번 연차 기간, 최근 날부터, 여러 날은 한 줄, 연차·반차 밖은 연차에서 안 뺌', async () => {
    const rec = await openLee()
    expect(flat(rec)).toContain('쓴 휴가 이번 연차 기간 2026-07-17 ~ 2027-07-16')
    const table = recordTable(rec)
    expect(within(table).getAllByRole('columnheader').map(flat).slice(0, 4)).toEqual(['날짜', '종류', '일수', '메모'])
    const rows = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((r) => cellsOf(r).slice(0, 4).map(flat))
    expect(rows).toEqual([
      ['2026-10-23 (금)', '오후 반차', '0.5일', '—'],
      ['2026-10-12 (월)', '오전 반차', '0.5일', '병원 진료'],
      ['2026-09-18 (금)', '경조사', '1일 연차에서 안 뺌', '형 결혼'],
      ['2026-09-07 (월)', '연차', '1일', '이사'],
      ['2026-08-03 (월) ~ 08-05 (수)', '연차', '3일', '여름 휴가'],
      ['2026-07-31 (금)', '연차', '1일', '—'],
    ])
    for (const r of within(table).getAllByRole('row').slice(1)) {
      expect(within(r).getByRole('button', { name: '고치기' })).toBeTruthy()
      expect(within(r).getByRole('button', { name: '지우기' })).toBeTruthy()
    }
  })

  it('AC-7614.4: 합계 줄과 지난 연차 기간 줄(수당으로 정산)', async () => {
    const rec = await openLee()
    expect(within(rec).getByText('연차·반차 합계 6일 · 경조사 1일')).toBeTruthy()
    expect(flat(rec)).toContain(
      '지난 연차 기간 2025-07-17 ~ 2026-07-16 15일 생김 · 13일 씀 · 남은 2일 → 수당으로 정산 (2026년 7월 세무사 자료에 2일이 들어갔어요)',
    )
  })

  it("AC-7614.4: 다음 해로 넘김이면 지난 기간 줄은 '→ 다음 기간에 더함'", async () => {
    const next = makeBase()
    next.settings = { ...next.settings, leftover: 'carry' }
    show(next)
    fireEvent.click(within(await statusTable()).getByRole('button', { name: '이도윤' }))
    const rec = await screen.findByRole('region', { name: '이도윤 휴가 기록' })
    // 넘김이면 앞 기간들 남은 일수가 차례로 넘어온다(첫해 11 → 둘째 해 26 → 지난 기간 15 + 26 − 13 = 28)
    expect(flat(rec)).toContain('지난 연차 기간 2025-07-17 ~ 2026-07-16 15일 생김 · 26일 넘어옴 · 13일 씀 · 남은 28일 → 다음 기간에 더함')
    expect(flat(rec)).not.toContain('세무사 자료에')
    const granted = within(rec).getByText('생긴 연차').nextElementSibling
    expect(flat(granted)).toBe('16일')
    expect(flat(granted?.nextElementSibling ?? null)).toBe('넘어옴 28일')
    expect(flat(within(rec).getByText('남은 연차').nextElementSibling)).toBe('38일')
  })

  it('AC-7614.4: 올해 이미 쓴 연차는 합계 줄에 따로 보인다(최민준 쓴 14 = 웹앱 4 + 10)', async () => {
    show()
    fireEvent.click(within(await statusTable()).getByRole('button', { name: '최민준' }))
    const rec = await screen.findByRole('region', { name: '최민준 휴가 기록' })
    expect(flat(within(rec).getByText('쓴 연차').nextElementSibling)).toBe('14일')
    expect(within(rec).getByText('연차·반차 합계 4일 · 올해 이미 쓴 연차 10일')).toBeTruthy()
  })

  it('AC-7614.4: 1년 미만이면 지난 기간 줄이 없고 다음 새 연차는 · 1일 더', async () => {
    show()
    fireEvent.click(within(await statusTable()).getByRole('button', { name: '한지우' }))
    const rec = await screen.findByRole('region', { name: '한지우 휴가 기록' })
    expect(flat(within(rec).getByText('다음 새 연차').nextElementSibling)).toBe('2026-12-02 · 1일 더')
    expect(flat(rec)).not.toContain('지난 연차 기간')
  })

  it('AC-7614.4: [지우기]는 한 번 묻고, 예면 그 묶음을 지운 뒤 다시 읽는다', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const rec = await openLee()
    const row = within(recordTable(rec))
      .getAllByRole('row')
      .find((r) => flat(r).includes('여름 휴가'))!
    fireEvent.click(within(row).getByRole('button', { name: '지우기' }))
    expect(confirm).toHaveBeenCalledWith('이 휴가를 지울까요? 남은 연차가 다시 늘어나요.')
    await waitFor(() => expect(base.store.deleteLeaveGroup).toHaveBeenCalledWith('run-m-lee-2026-08-03'))
    await waitFor(() => expect(base.store.listLeaves).toHaveBeenCalledTimes(2))
    confirm.mockRestore()
  })

  it('AC-7614.4: [지우기]에서 아니요면 지우지 않는다', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const rec = await openLee()
    fireEvent.click(within(recordTable(rec)).getAllByRole('button', { name: '지우기' })[0])
    expect(base.store.deleteLeaveGroup).not.toHaveBeenCalled()
    confirm.mockRestore()
  })

  it('AC-7614.4: 지우기가 실패하면 E-STAFF-SAVE-FAILED가 보인다', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const rec = await openLee()
    base.store.deleteLeaveGroup.mockRejectedValueOnce(new StaffStoreError('E-STAFF-SAVE-FAILED'))
    fireEvent.click(within(recordTable(rec)).getAllByRole('button', { name: '지우기' })[0])
    expect(flat(await within(rec).findByRole('alert'))).toContain('E-STAFF-SAVE-FAILED')
    confirm.mockRestore()
  })

  it('AC-7614.4: [고치기]는 그 휴가 고치기, [이름 님 휴가 넣기]는 그 사람으로 휴가 넣기를 연다', async () => {
    const rec = await openLee()
    const row = within(recordTable(rec))
      .getAllByRole('row')
      .find((r) => flat(r).includes('여름 휴가'))!
    fireEvent.click(within(row).getByRole('button', { name: '고치기' }))
    let dialog = screen.getByRole('dialog', { name: '휴가 고치기' })
    expect(within(dialog).getByRole('button', { name: '여러 날 (시작~끝)' }).getAttribute('aria-pressed')).toBe('true')
    expect((within(dialog).getByLabelText('시작 날짜') as HTMLInputElement).value).toBe('2026-08-03')
    expect((within(dialog).getByLabelText('끝 날짜') as HTMLInputElement).value).toBe('2026-08-05')
    expect((within(dialog).getByLabelText('메모') as HTMLInputElement).value).toBe('여름 휴가')
    fireEvent.click(within(dialog).getByRole('button', { name: '취소' }))
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(within(rec).getByRole('button', { name: '이도윤 님 휴가 넣기' }))
    dialog = screen.getByRole('dialog', { name: '휴가 넣기' })
    expect((within(dialog).getByRole('combobox', { name: '사람' }) as HTMLSelectElement).value).toBe('m-lee')
  })

  it('AC-7614.4: 이번 기간 밖 날까지 이어진 묶음의 [고치기]는 묶음 전체를 열고, 저장해도 기간 밖 날이 지워지지 않는다(달력 칩과 같다)', async () => {
    // 이도윤 이번 연차 기간은 2027-07-16까지. 07-15(목)·07-16(금) + 07-20(화)(07-17 토·07-18 일·07-19 대체공휴일은 셀 날이 아님)
    const group = ['2027-07-15', '2027-07-16', '2027-07-20'].map((day) => leave('m-lee', day, 'annual', { groupId: 'g-cross', memo: '여름' }))
    const next = makeBase()
    next.store.listLeaves.mockResolvedValue([...LEAVES, ...group])
    show(next)
    fireEvent.click(within(await statusTable()).getByRole('button', { name: '이도윤' }))
    const rec = await screen.findByRole('region', { name: '이도윤 휴가 기록' })
    const row = within(recordTable(rec))
      .getAllByRole('row')
      .find((r) => flat(r).includes('여름'))!
    // 표 줄은 이번 기간에 든 날만 센다
    expect(cellsOf(row).slice(0, 3).map(flat)).toEqual(['2027-07-15 (목) ~ 07-16 (금)', '연차', '2일'])
    fireEvent.click(within(row).getByRole('button', { name: '고치기' }))
    const dialog = within(screen.getByRole('dialog', { name: '휴가 고치기' }))
    expect((dialog.getByLabelText('시작 날짜') as HTMLInputElement).value).toBe('2027-07-15')
    expect((dialog.getByLabelText('끝 날짜') as HTMLInputElement).value).toBe('2027-07-20')
    fireEvent.click(dialog.getByRole('button', { name: '저장' }))
    await waitFor(() =>
      expect(next.store.replaceLeaveGroup).toHaveBeenCalledWith(
        'g-cross',
        ['2027-07-15', '2027-07-16', '2027-07-20'].map((day) => ({ staffId: 'm-lee', day, kind: 'annual', part: null, paid: true, memo: '여름' })),
      ),
    )
  })

  it('AC-7614.4: ‹ 연차 현황 을 누르면 표로 돌아간다', async () => {
    const rec = await openLee()
    fireEvent.click(within(rec).getByRole('button', { name: '‹ 연차 현황' }))
    expect(await statusTable()).toBeTruthy()
  })
})

describe('AC-7614.5: 연차 규칙', () => {
  const openRules = async (next = makeBase()) => {
    show(next)
    await statusTable()
    fireEvent.click(screen.getByRole('button', { name: '연차 규칙' }))
    return screen.getByRole('dialog', { name: '연차 규칙' })
  }

  it('AC-7614.5: 연차 기준 두 가지·못 쓴 연차 두 가지와 설명, 지금 설정이 골라져 있다', async () => {
    const dialog = await openRules()
    const basis = within(dialog).getByRole('radiogroup', { name: '연차 기준' })
    const leftover = within(dialog).getByRole('radiogroup', { name: '못 쓴 연차' })
    expect((within(basis).getByRole('radio', { name: /^입사일 기준/ }) as HTMLInputElement).checked).toBe(true)
    expect((within(basis).getByRole('radio', { name: /1월 1일 기준/ }) as HTMLInputElement).checked).toBe(false)
    expect((within(leftover).getByRole('radio', { name: /수당으로 정산/ }) as HTMLInputElement).checked).toBe(true)
    expect(flat(basis)).toContain('입사일 기준 사람마다 입사한 날부터 1년씩 세요. 입사 기념일에 새 연차가 생겨요.')
    expect(flat(basis)).toContain(
      '1월 1일 기준 모두 1월 1일에 한꺼번에 새 연차가 생겨요. 입사한 해는 일한 날만큼 나눠 주고, 퇴사할 때 입사일 기준보다 적으면 차이를 알려 드려요.',
    )
    expect(flat(leftover)).toContain('수당으로 정산 연차 기간이 끝날 때 남은 일수를 세무사 자료에 넣어요. 금액은 세무사가 계산해요.')
    expect(flat(leftover)).toContain('다음 해로 넘김 남은 일수를 다음 연차 기간에 더해요.')
    expect(within(dialog).getByRole('button', { name: '저장' })).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: '취소' })).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: '닫기' }).textContent).toBe('×')
  })

  it('AC-7614.5: 법으로 정해진 셈법 다섯 줄과 파트타임 보기', async () => {
    const dialog = await openRules()
    const law = within(dialog).getByRole('list', { name: '법으로 정해진 셈법' })
    expect(within(law).getAllByRole('listitem').map(flat)).toEqual([
      '1년 미만: 한 달 다 나오면 1일씩 (최대 11일)',
      '1년 이상: 15일, 3년째부터 2년마다 1일 더 (최대 25일)',
      '파트타임: 15일 × 주 근무시간 ÷ 40 (가산 일수도 같은 비율, 주 15시간 밑이면 연차 없음)',
      '쓰는 단위: 하루 · 반차(오전/오후)',
      '직원 5명 이상 의원 규칙이에요.',
    ])
    expect(within(dialog).getByText('예: 정유나 님 주 24시간 → 15 × 24 ÷ 40 = 9일.')).toBeTruthy()
  })

  it('AC-7614.5: 파트타임이 없으면 보기 줄이 없다', async () => {
    const next = makeBase()
    next.members = next.members.filter((m) => m.id !== JUNG.id)
    const dialog = await openRules(next)
    expect(within(dialog).queryByText(/^예: /)).toBeNull()
  })

  it('AC-7614.5: 파트타임 보기는 0.5일 단위로 올린다(주 25시간 → 9.5일)', async () => {
    const next = makeBase()
    next.members = next.members.map((m) => (m.id === JUNG.id ? { ...m, weeklyHours: 25 } : m))
    const dialog = await openRules(next)
    expect(within(dialog).getByText('예: 정유나 님 주 25시간 → 15 × 25 ÷ 40 = 9.5일.')).toBeTruthy()
  })

  it('AC-7614.5: 골라 [저장]하면 설정을 저장하고 공용 자료를 다시 읽고 닫힌다', async () => {
    const next = makeBase()
    const dialog = await openRules(next)
    fireEvent.click(within(dialog).getByRole('radio', { name: /1월 1일 기준/ }))
    fireEvent.click(within(dialog).getByRole('radio', { name: /다음 해로 넘김/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }))
    await waitFor(() => expect(next.store.saveSettings).toHaveBeenCalledWith({ ...next.settings, leaveBasis: 'jan1', leftover: 'carry' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(next.reload).toHaveBeenCalledTimes(1)
  })

  it('AC-7614.5: [취소]·×는 저장하지 않고 닫는다', async () => {
    const next = makeBase()
    let dialog = await openRules(next)
    fireEvent.click(within(dialog).getByRole('button', { name: '취소' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '연차 규칙' }))
    dialog = screen.getByRole('dialog', { name: '연차 규칙' })
    fireEvent.click(within(dialog).getByRole('button', { name: '닫기' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(next.store.saveSettings).not.toHaveBeenCalled()
  })

  it('AC-7614.5: 저장이 실패하면 칸은 열린 채 E-STAFF-SAVE-FAILED', async () => {
    const next = makeBase()
    next.store.saveSettings.mockRejectedValueOnce(new StaffStoreError('E-STAFF-SAVE-FAILED'))
    const dialog = await openRules(next)
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }))
    expect(flat(await within(dialog).findByRole('alert'))).toContain('E-STAFF-SAVE-FAILED')
    expect(next.reload).not.toHaveBeenCalled()
  })
})

// 보기 자료가 requirements.md '보기 자료'와 같은지(시험 자료 오타 막기)
it('AC-7614.1: 보기 자료 — 재직 여섯 명', () => {
  expect(MEMBERS.filter((m) => m.leftOn === null).map((m) => m.name)).toEqual(['최민준', '김하늘', '이도윤', '정유나', '박서연', '한지우'])
  expect([KIM, LEE, HAN].every((m) => m.leftOn === null)).toBe(true)
  expect(clinicProfile().staff.map((s) => s.mark)).toEqual(['이', '박'])
})
