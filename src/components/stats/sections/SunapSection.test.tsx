// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sunapPct, sunapSpan, workedDays } from '@/components/stats/sunapView'
import { statsRange } from '@/components/stats/view'
import { VISIT_HOURS } from '@/lib/analytics/visitHours'
import type { SunapDay } from '@/lib/storage/sunap'
import type { DayPayload } from '@/types/payload'
import type { BitSectionsView, PatientMix } from '@/types/stats'
import { SUNAP_TOTAL_KEYS, type DoctorBreakdown, type SunapRates, type SunapTotals } from '@/types/sunap'
import { StatsCard } from './parts'
import type { BitSectionsShown } from './PatientMixSection'
import { SunapSection, type SunapClosed, type SunapGroupsState } from './SunapSection'

// 통계 '예약·전환' 칸 (spec sunap-ilji REQ-4906 AC-4906.2·AC-4906.3, 시안 docs/mockups/sunap-ilji/index.html ?s=stats).
// 글은 시안 그대로이고 원장님별 표는 뺐다(design.md '시안과 다른 곳'). 숫자는 시안의 지어낸 숫자다

const TODAY = '2026-11-16'
const ZERO = Object.fromEntries(SUNAP_TOTAL_KEYS.map((key) => [key, 0])) as SunapTotals
const closedDay = (day: string, over: Partial<SunapTotals>, late = false): SunapDay => ({ day, closedAt: `${day}T09:52:00Z`, late, totals: { ...ZERO, ...over } })
// 진료한 날 14일(11월 2일 ~ 15일) 중 마감한 날 12일, 그중 늦은 마감 1일. 합 = 초진 112명 중 예약 71명 · 90일초진 82명 중 예약 42명
const DATES = Array.from({ length: 14 }, (_, i) => `2026-11-${String(i + 2).padStart(2, '0')}`)
const CLOSED: SunapDay[] = DATES.slice(0, 12).map((day, i) =>
  i < 11 ? closedDay(day, { first_n: 9, rsv_first: 6, d90_n: 7, rsv_d90: 3 }) : closedDay(day, { first_n: 13, rsv_first: 5, d90_n: 5, rsv_d90: 9 }, true),
)
// 비트에서 바로 센 기간 전체(시안 Block 전환 칸)
const RATES: SunapRates = { visits: 1388, first_n: 131, d90_n: 95, ret_n: 1162, block_n: 302, pt_n: 829, first_block: 58, d90_block: 31, ret_block: 213 }
const MIX: PatientMix = { total: { people: 900, visits: 1388 }, compared: false, age: [], insurance: [], city: [], town: [] }
const ready = (sunap?: SunapRates, visits = 1388, sunapDoctors?: DoctorBreakdown | null): BitSectionsView => ({
  kind: 'ready',
  mix: { all: { ...MIX, total: { people: 900, visits } }, new: MIX },
  hours: { hours: [...VISIT_HOURS], rows: [], unknown: 0, peak: null },
  doctors: { kind: 'single' },
  ...(sunap === undefined ? {} : { sunap }),
  ...(sunapDoctors === undefined ? {} : { sunapDoctors }),
})
// 원장님별(spec sunap-doctors AC-5004.2): RATES를 두 분으로 나눈 지어낸 숫자. Worker는 진료의 코드를 비워 보낸다(AC-2702.4)
const DOCTORS: DoctorBreakdown = {
  rows: [
    { code: null, label: '김가상', rates: { visits: 800, first_n: 80, d90_n: 55, ret_n: 665, block_n: 180, pt_n: 480, first_block: 35, d90_block: 18, ret_block: 127 } },
    { code: null, label: '이가상', rates: { visits: 588, first_n: 51, d90_n: 40, ret_n: 497, block_n: 122, pt_n: 349, first_block: 23, d90_block: 13, ret_block: 86 } },
  ],
  total: RATES,
}
const DOCTOR_HINT = '비트에서 바로 · 수납일지에서 고친 체크는 안 들어가요'

const RSV_FIRST = '초진 예약률'
const RSV_D90 = '90일 예약률'
const BLOCK = 'Block 전환'
const NO_CLOSED = '수납일지를 마감한 날이 없어요'
const NO_GROUPS = '수납일지 설정에서 Block·물리치료 묶음을 고르면 보여요'

type Drawn = { closed?: SunapClosed; groups?: SunapGroupsState; bit?: BitSectionsShown; worked?: readonly string[]; onReread?: () => void }
function draw({ closed = CLOSED, groups = 'chosen', bit = ready(RATES), worked = DATES, onReread = () => undefined }: Drawn = {}) {
  return render(
    <StatsCard id="stats-sunap" title="예약·전환">
      <SunapSection closed={closed} groups={groups} bit={bit} worked={worked} onReread={onReread} />
    </StatsCard>,
  )
}
const cell = (title: string) => screen.getByRole('heading', { level: 3, name: title }).closest('section')!
// 칸 안 줄: [이름, 가운데 글, 값]
const rowsOf = (title: string) => [...cell(title).querySelectorAll('dl > div')].map((row) => [...row.children].map((el) => el.textContent))
const tokens = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)

afterEach(() => {
  cleanup()
})

describe('AC-4906.2 초진·90일 예약률(수납일지 마감한 날만)', () => {
  it('AC-4906.2: 마감한 날 합으로 센 비율과 시안 글 그대로의 줄이다(마감한 날 n일 · 늦은 마감 섞임 n일)', () => {
    draw()
    expect(within(cell(RSV_FIRST)).getByText('수납일지 마감한 날만')).toBeTruthy()
    expect(within(cell(RSV_FIRST)).getByText('63.4%')).toBeTruthy()
    expect(rowsOf(RSV_FIRST)).toEqual([
      ['초진', '', '112명'],
      ['주사치료·진료(경과) 예약', '', '71명'],
      ['마감한 날', '진료한 날 14일 중', '12일'],
      ['늦은 마감 섞임', '', '1일'],
    ])
    expect(within(cell(RSV_D90)).getByText('수납일지 마감한 날만')).toBeTruthy()
    expect(within(cell(RSV_D90)).getByText('51.2%')).toBeTruthy()
    expect(rowsOf(RSV_D90)).toEqual([
      ['90일초진', '', '82명'],
      ['주사치료·진료(경과) 예약', '', '42명'],
      ['마감 안 한 날 2일은 빼고 셈', '', ''],
    ])
  })

  it('AC-4906.2: 늦은 마감이 섞인 날 수는 경고 색이고, 없으면 0일이다', () => {
    const { unmount } = draw()
    const late = within(cell(RSV_FIRST)).getByText('1일')
    expect(tokens(late)).toContain('text-st-warn-ink')
    unmount()
    draw({ closed: CLOSED.map((day) => ({ ...day, late: false })) })
    expect(rowsOf(RSV_FIRST).at(-1)).toEqual(['늦은 마감 섞임', '', '0일'])
  })

  it('AC-4906.2: 마감한 날이 없으면 두 칸 모두 "수납일지를 마감한 날이 없어요"이고 비율·줄이 없다', () => {
    draw({ closed: [] })
    for (const title of [RSV_FIRST, RSV_D90]) {
      expect(within(cell(title)).getByText(NO_CLOSED)).toBeTruthy()
      expect(rowsOf(title)).toEqual([])
      expect(cell(title).textContent).not.toContain('%')
    }
  })

  it('AC-4906.2: 분모가 0이면 비율은 – 다', () => {
    draw({ closed: [closedDay('2026-11-02', { rsv_first: 0, first_n: 0, d90_n: 0, rsv_d90: 0 })], worked: ['2026-11-02'] })
    expect(within(cell(RSV_FIRST)).getByText('–')).toBeTruthy()
    expect(within(cell(RSV_D90)).getByText('–')).toBeTruthy()
    expect(rowsOf(RSV_FIRST)[0]).toEqual(['초진', '', '0명'])
  })

  it('AC-4906.2: 진료한 날을 모르면(이 기간 저장된 날 숫자 없음) "진료한 날 n일 중"과 마감 안 한 날 줄이 없다. 모두 마감했으면 마감 안 한 날 줄이 없다', () => {
    const { unmount } = draw({ worked: [] })
    expect(rowsOf(RSV_FIRST)[2]).toEqual(['마감한 날', '', '12일'])
    expect(rowsOf(RSV_D90)).toHaveLength(2)
    unmount()
    draw({ worked: DATES.slice(0, 12) })
    expect(rowsOf(RSV_FIRST)[2]).toEqual(['마감한 날', '진료한 날 12일 중', '12일'])
    expect(rowsOf(RSV_D90)).toHaveLength(2)
  })
})

describe('AC-4906.3 Block 전환(비트에서 바로 · 기간 전체)', () => {
  it('AC-4906.3: sunapRates로 비율을 보이고 재진+Block은 Block 중이다(시안 글 그대로)', () => {
    draw()
    expect(within(cell(BLOCK)).getByText('비트에서 바로 · 기간 전체')).toBeTruthy()
    expect(rowsOf(BLOCK)).toEqual([
      ['초진+Block', '58/131', '44.3%'],
      ['90일+Block', '31/95', '32.6%'],
      ['재진+Block (Block 중)', '213/302', '70.5%'],
      ['Block', '302/1,388', '21.8%'],
      ['물리치료', '829/1,388', '59.7%'],
    ])
    // 위 셋과 아래 둘 사이에 선이 있다(시안 hr)
    const lists = cell(BLOCK).querySelectorAll('dl')
    expect([...lists].map((dl) => dl.querySelectorAll(':scope > div').length)).toEqual([3, 2])
    expect(tokens(lists[1]!)).toEqual(expect.arrayContaining(['border-t', 'border-st-line']))
  })

  it('AC-4906.3: 분모가 0이면 – 다', () => {
    draw({ bit: ready({ ...RATES, d90_n: 0, d90_block: 0 }) })
    expect(rowsOf(BLOCK)[1]).toEqual(['90일+Block', '0/0', '–'])
  })

  it('AC-4906.3: 묶음 설정이 없으면 "수납일지 설정에서 Block·물리치료 묶음을 고르면 보여요"이고 줄이 없다(비트 답이 있어도·불러오지 않았어도)', () => {
    for (const bit of [ready(RATES), ready(), null] as const) {
      const { unmount } = draw({ groups: 'none', bit })
      expect(within(cell(BLOCK)).getByText(NO_GROUPS)).toBeTruthy()
      expect(rowsOf(BLOCK)).toEqual([])
      expect(screen.queryByText('비트 PC에서 불러오면 보여요')).toBeNull()
      unmount()
    }
  })

  it('AC-4906.3: 이 기기에서 불러오지 않았으면 비트 PC 안내, 이 기간을 불러오지 않았으면 그 안내, 옛 도우미면 업데이트 안내다', () => {
    const cases: [BitSectionsShown, string][] = [
      [null, '비트 PC에서 불러오면 보여요'],
      [{ kind: 'none' }, '이 기간은 아직 불러오지 않았어요'],
      [{ kind: 'old-helper' }, '도우미를 업데이트하면 보여요'],
      [ready(RATES, 0), '자료 없음'],
    ]
    for (const [bit, note] of cases) {
      const { unmount } = draw({ bit })
      expect(within(cell(BLOCK)).getByText(note)).toBeTruthy()
      expect(rowsOf(BLOCK)).toEqual([])
      unmount()
    }
  })

  it('AC-4906.3: 이 기간 답을 기다리거나 묶음을 넘긴 답이 아직 없으면 제목·옆 글만 있다', () => {
    for (const bit of ['waiting', ready()] as const) {
      const { unmount } = draw({ bit })
      expect(rowsOf(BLOCK)).toEqual([])
      expect(cell(BLOCK).textContent).toBe(`${BLOCK}비트에서 바로 · 기간 전체`)
      unmount()
    }
  })
})

describe('AC-4906.2·AC-4906.3 읽는 중 · 읽기 실패', () => {
  it('AC-4906.2: 마감한 날·설정을 읽는 동안은 세 칸 모두 제목·옆 글만이고 "불러오는 중"·오류가 없다', () => {
    draw({ closed: 'reading', groups: 'reading' })
    expect(cell(RSV_FIRST).textContent).toBe(`${RSV_FIRST}수납일지 마감한 날만`)
    expect(cell(RSV_D90).textContent).toBe(`${RSV_D90}수납일지 마감한 날만`)
    expect(cell(BLOCK).textContent).toBe(`${BLOCK}비트에서 바로 · 기간 전체`)
    expect(screen.queryByText('불러오는 중')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-4906.2: 읽기에 실패하면 오류 카드(E-STATS-READ-FAILED) 하나와 [다시 읽기]이고, 누르면 다시 읽는다', () => {
    const onReread = vi.fn()
    draw({ closed: 'failed', groups: 'failed', onReread })
    const alerts = screen.getAllByRole('alert')
    expect(alerts).toHaveLength(1)
    expect(alerts[0]!.textContent).toContain('오류 번호 E-STATS-READ-FAILED')
    expect(rowsOf(RSV_FIRST)).toEqual([])
    expect(rowsOf(BLOCK)).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: '다시 읽기' }))
    expect(onReread).toHaveBeenCalledTimes(1)
  })

  it('AC-4906.2: 설정만 실패해도 오류 카드 하나이고 예약률은 그대로 보인다', () => {
    draw({ groups: 'failed' })
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(within(cell(RSV_FIRST)).getByText('63.4%')).toBeTruthy()
    expect(rowsOf(BLOCK)).toEqual([])
  })
})

describe('AC-4906.2·AC-4906.3 칸 모양 · 시안과 다른 곳', () => {
  it('AC-4906.2·AC-4906.3: 칸 셋(초진 예약률 · 90일 예약률 · Block 전환)이 h3 차례로 넓은 화면 세 열, 휴대폰 한 열이다', () => {
    draw()
    expect(screen.getAllByRole('heading', { level: 3 }).map((node) => node.textContent)).toEqual([RSV_FIRST, RSV_D90, BLOCK])
    const grid = cell(RSV_FIRST).parentElement!
    expect(tokens(grid)).toEqual(expect.arrayContaining(['grid', 'grid-cols-3', 'max-md:grid-cols-1']))
    expect([...grid.children]).toEqual([cell(RSV_FIRST), cell(RSV_D90), cell(BLOCK)])
  })

  it('AC-4906.3: 원장님별 표·시안 꼬리표(새 칸)는 없다', () => {
    draw()
    expect(screen.queryByRole('table')).toBeNull()
    for (const word of ['원장님', '새 칸', '진료실']) expect(document.body.textContent, word).not.toContain(word)
  })

  it('AC-4906.2·AC-4906.3: [어떻게 세나요?]를 펴면 세는 법이 보인다(재진+Block은 Block 받은 사람 중, 고친 체크는 안 들어감)', () => {
    draw()
    const button = screen.getByRole('button', { name: '어떻게 세나요?' })
    const body = document.getElementById(button.getAttribute('aria-controls')!)!
    expect(body.hidden).toBe(true)
    fireEvent.click(button)
    expect(body.hidden).toBe(false)
    expect(body.textContent).toContain('초진+Block % = 초진 중 · 90일+Block % = 90일초진 중 · 재진+Block % = Block 받은 사람 중(엑셀과 같음)')
    expect(body.textContent).toContain('비트에서 바로 · 수납일지에서 고친 체크는 안 들어가요')
    expect(body.textContent).toContain('주사치료·진료(경과) 예약만')
  })
})

describe('AC-4906.2·AC-4906.3 셈 도우미(sunapView)', () => {
  it('AC-4906.2·AC-4906.3: 비율은 소수 첫째 자리(시안과 같이 반올림)이고 분모 0이면 –', () => {
    expect(sunapPct(71, 112)).toBe('63.4%')
    expect(sunapPct(302, 1388)).toBe('21.8%')
    expect(sunapPct(58, 131)).toBe('44.3%')
    expect(sunapPct(0, 5)).toBe('0.0%')
    expect(sunapPct(3, 3)).toBe('100.0%')
    expect(sunapPct(0, 0)).toBe('–')
  })

  it('AC-4906.2: 셀 기간은 고른 기간 첫날 ~ 기간 끝과 오늘 가운데 이른 날이다', () => {
    const r30 = statsRange(TODAY, '30d')
    const r12 = statsRange(TODAY, '12m')
    expect(sunapSpan(r30)).toEqual({ from: r30.current.from, to: r30.current.to })
    expect(r12.current.to > TODAY).toBe(true)
    expect(sunapSpan(r12)).toEqual({ from: r12.current.from, to: TODAY })
  })

  it('AC-4906.2: 진료한 날 = 기간 안 저장된 날 숫자에서 환자가 있는 날(같은 날은 한 번, 날짜 차례)', () => {
    const day = (ymd: string, patients: number) => ({ day: ymd, totals: { patients, newPatients: 0, returning: patients, unknown: 0 } }) as DayPayload
    const days = [day('2026-11-03', 5), day('2026-11-01', 0), day('2026-11-02', 7), day('2026-11-02', 7), day('2026-10-31', 9), day('2026-11-17', 4)]
    expect(workedDays(days, { from: '2026-11-01', to: TODAY })).toEqual(['2026-11-02', '2026-11-03'])
  })
})

describe('AC-5004.2 원장님별 표(세 칸 아래, 비트에서 바로)', () => {
  const panel = () => screen.queryByRole('region', { name: '원장님별' })

  it('AC-5004.2: 답에 sunapDoctors가 있으면 세 칸 아래·[어떻게 세나요?] 위에 원장님별 표와 hint가 있다', () => {
    draw({ bit: ready(RATES, 1388, DOCTORS) })
    const table = panel()
    if (table === null) throw new Error('원장님별 표가 없다')
    expect(within(table).getByText(DOCTOR_HINT)).toBeTruthy()
    const names = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) => row.firstElementChild?.textContent)
    expect(names).toEqual(['김가상', '이가상', '합계'])
    expect(within(table).getAllByRole('row').at(-1)?.textContent).toContain('1,388명')
    // 세 칸 묶음 바로 다음, 세 칸 안이 아니다
    const grid = cell(RSV_FIRST).parentElement!
    expect(grid.contains(table)).toBe(false)
    expect(grid.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const how = screen.getByRole('button', { name: '어떻게 세나요?' })
    expect(table.compareDocumentPosition(how) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // 세 칸 글은 그대로다
    expect(rowsOf(BLOCK)[0]).toEqual(['초진+Block', '58/131', '44.3%'])
  })

  it('AC-5004.2: sunapDoctors가 null(원장님 한 분 이하)이거나 없으면 표가 없다', () => {
    for (const bit of [ready(RATES, 1388, null), ready(RATES)]) {
      const { unmount } = draw({ bit })
      expect(panel()).toBeNull()
      expect(screen.queryByRole('table')).toBeNull()
      expect(document.body.textContent).not.toContain('원장님별')
      unmount()
    }
  })

  it('AC-5004.2: 빈 상태 갈래는 그대로다 — 묶음 설정이 없거나 읽는 중·실패, 접수가 없으면 답에 표가 있어도 그리지 않는다', () => {
    const cases: [SunapGroupsState, BitSectionsShown][] = [
      ['none', ready(RATES, 1388, DOCTORS)],
      ['reading', ready(RATES, 1388, DOCTORS)],
      ['failed', ready(RATES, 1388, DOCTORS)],
      ['chosen', ready(RATES, 0, DOCTORS)],
    ]
    for (const [groups, bit] of cases) {
      const { unmount } = draw({ groups, bit })
      expect(panel()).toBeNull()
      unmount()
    }
  })
})
