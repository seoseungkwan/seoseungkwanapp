// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { statsRange } from '@/components/stats/view'
import { formatDoctors } from '@/lib/analytics/doctorStats'
import { VISIT_HOURS } from '@/lib/analytics/visitHours'
import type { BitSectionsView, DoctorRow, DoctorsView, DoctorTable, PatientMix } from '@/types/stats'
import { DoctorsSection } from './DoctorsSection'
import type { BitSectionsShown } from './PatientMixSection'

// 원장님별 칸 (stats-bit-sections AC-2706.1·AC-2706.4·AC-2706.5·AC-2706.6·AC-2705.5·AC-2705.6·AC-2707.2, 시안 docs/mockups/stats-bit-sections).
// 이름·숫자는 모두 시험 안에서 지은 가짜다

const HOSPITAL = '튼튼의원'
const TODAY = '2026-11-13'
const R30 = statsRange(TODAY, '30d')

const doctor = (label: string, patients: number, newPatients: number, visits: number, amount: number, perVisit: number | null, share: number | null): DoctorRow => ({
  label,
  patients,
  newPatients,
  visits,
  amount,
  perVisit,
  share,
})
const TABLE: DoctorTable = {
  kind: 'table',
  rows: [
    doctor('김원장', 702, 104, 1268, 48320500, 38107, 48320500 / 88191700),
    doctor('이원장', 591, 82, 1042, 39871200, 38264, 39871200 / 88191700),
    doctor('진료의 미지정', 0, 0, 0, 0, null, 0),
  ],
  total: doctor('합계', 1248, 186, 2310, 88191700, 38178, 1),
}
const MIX: PatientMix = { total: { people: 1248, visits: 2310 }, compared: false, age: [], insurance: [], city: [], town: [] }
const HOURS = { hours: [...VISIT_HOURS], rows: [], unknown: 0, peak: null }
const ready = (doctors: DoctorsView = TABLE, mix: PatientMix = MIX): BitSectionsView => ({ kind: 'ready', mix: { all: mix, new: mix }, hours: HOURS, doctors })

const draw = (view: BitSectionsShown) => render(<DoctorsSection view={view} range={R30} hospitalName={HOSPITAL} className="col-span-12" />)
const section = () => screen.getByRole('heading', { level: 2, name: '원장님별' }).closest('section')!
const table = () => screen.getByRole('table', { name: '원장님별 환자·신환·매출' })
const bodyRows = () => within(table()).getAllByRole('row').slice(1)
const texts = (tr: HTMLElement) => within(tr).getAllByRole('cell').map((td) => td.textContent)

const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
afterEach(() => {
  cleanup()
  if (original) Object.defineProperty(navigator, 'clipboard', original)
  else Reflect.deleteProperty(navigator, 'clipboard')
})

describe('AC-2706.4 원장님별 칸', () => {
  it('AC-2706.1: h2 "원장님별" + 옆 설명 "원장님마다 환자·신환·매출 · {기간 이름}"이고 칸 폭은 놓는 쪽이 준다', () => {
    draw(ready())
    expect(screen.getByText('원장님마다 환자·신환·매출 · 최근 30일')).toBeTruthy()
    expect(section().className.split(' ')).toContain('col-span-12')
  })

  it('AC-2706.4: 표 머리는 원장님 | 실환자 | 신환 | 내원 | 매출 | 1인당 진료비 | 비중이다', () => {
    draw(ready())
    expect(within(table()).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['원장님', '실환자', '신환', '내원', '매출', '1인당 진료비', '비중'])
  })

  it('AC-2706.4·AC-2705.6: 줄은 N명·N건·N원(천 단위 쉼표), 1인당 진료비, 비중 백분율이고 내원 0이면 1인당 진료비가 "–"다', () => {
    draw(ready())
    expect(bodyRows().map(texts)).toEqual([
      ['김원장', '702명', '104명', '1,268건', '48,320,500원', '38,107원', '54.8%'],
      ['이원장', '591명', '82명', '1,042건', '39,871,200원', '38,264원', '45.2%'],
      ['진료의 미지정', '0명', '0명', '0건', '0원', '–', '0.0%'],
      ['합계', '1,248명', '186명', '2,310건', '88,191,700원', '38,178원', '100%'],
    ])
  })

  it('AC-2706.4: 첫 칸 밖의 숫자는 오른쪽 맞춤이다', () => {
    draw(ready())
    const [head, ...rows] = within(table()).getAllByRole('row')
    const headCells = within(head!).getAllByRole('columnheader')
    expect(headCells[0]!.className).toContain('text-left')
    for (const th of headCells.slice(1)) expect(th.className).toContain('text-right')
    for (const tr of rows) {
      const cells = within(tr).getAllByRole('cell')
      expect(cells[0]!.className).toContain('text-left')
      for (const td of cells.slice(1)) expect(td.className).toContain('text-right')
    }
  })

  it('AC-2706.4: 비중은 작은 막대 + 백분율이고 휴대폰은 백분율만이다(막대는 꾸밈)', () => {
    draw(ready())
    const share = within(bodyRows()[0]!).getAllByRole('cell')[6]!
    const bar = share.querySelector('[aria-hidden="true"]') as HTMLElement
    expect(bar.className.split(' ')).toContain('max-md:hidden')
    expect((bar.firstElementChild as HTMLElement).style.width).toBe('54.79%')
    expect((bar.firstElementChild as HTMLElement).className).toContain('bg-accent')
  })

  it('AC-2706.4: 합계 줄은 마지막이고 위에 진한 선·굵은 글자, 비중은 막대 없이 100%다', () => {
    draw(ready())
    const total = bodyRows().at(-1)!
    for (const td of within(total).getAllByRole('cell')) {
      expect(td.className).toContain('border-t')
      expect(td.className).toContain('border-line-strong')
      expect(td.className).toContain('font-semibold')
    }
    expect(within(total).getAllByRole('cell')[6]!.querySelector('[aria-hidden="true"]')).toBeNull()
  })

  it('AC-2706.4: 합계 매출이 0이면 비중이 모두 "–"다', () => {
    const zero: DoctorTable = {
      kind: 'table',
      rows: [doctor('김원장', 1, 0, 1, 0, 0, null), doctor('이원장', 1, 0, 1, 0, 0, null)],
      total: doctor('합계', 2, 0, 2, 0, 0, null),
    }
    draw(ready(zero))
    expect(bodyRows().map((tr) => within(tr).getAllByRole('cell')[6]!.textContent)).toEqual(['–', '–', '–'])
  })

  it('AC-2706.4: 휴대폰은 표 글자가 작고 칸 사이가 좁으며, 표만 옆으로 밀린다', () => {
    draw(ready())
    expect(table().className.split(' ')).toContain('max-md:text-small')
    expect(table().parentElement!.className.split(' ')).toContain('overflow-x-auto')
    expect(within(table()).getAllByRole('columnheader')[1]!.className).toContain('max-md:px-1.5')
  })

  it('AC-2706.4: 아래 글이 시안 그대로다', () => {
    draw(ready())
    expect(
      screen.getByText(
        '환자 수는 접수할 때 정한 진료의, 매출은 수납할 때 적힌 진료의로 나눠요. 두 원장님께 진료받은 분은 양쪽에 세요(합계는 한 번). 매출은 수납한 날의 총진료비(공단 + 본인부담 + 비급여)예요. 1인당 진료비는 매출 ÷ 내원 건수예요.',
      ),
    ).toBeTruthy()
  })

  it('AC-2707.2: [표 복사]는 formatDoctors(병원 이름, 기간 글자, 표) 글이고 복사되면 "복사했어요"다', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    draw(ready())
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '표 복사' }))
    })
    expect(writeText).toHaveBeenCalledWith(formatDoctors(HOSPITAL, R30.label, TABLE))
    expect(screen.getAllByText('복사했어요').length).toBeGreaterThan(0)
  })

  it('AC-2705.5: 원장님이 한 분이면 표·[표 복사] 대신 한 줄 안내이고 옆 설명은 그대로다', () => {
    draw(ready({ kind: 'single' }))
    expect(screen.getByText('원장님이 한 분이라 나누어 볼 것이 없어요.')).toBeTruthy()
    expect(screen.getByText('원장님마다 환자·신환·매출 · 최근 30일')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })
})

// ── stats-pc-ux: 표 아래 [어떻게 세나요?] · [표 복사] 줄 (REQ-4004 AC-4004.2 ⑧, REQ-4005 AC-4005.1) ─────────────────
describe('AC-4004.2 ⑧·AC-4005.1: 원장님별 표 아래 줄과 접는 설명', () => {
  const FOOT =
    '환자 수는 접수할 때 정한 진료의, 매출은 수납할 때 적힌 진료의로 나눠요. 두 원장님께 진료받은 분은 양쪽에 세요(합계는 한 번). 매출은 수납한 날의 총진료비(공단 + 본인부담 + 비급여)예요. 1인당 진료비는 매출 ÷ 내원 건수예요.'
  const howButton = () => screen.getByRole('button', { name: '어떻게 세나요?' })
  const howBody = () => document.getElementById(howButton().getAttribute('aria-controls')!)!
  const copyButton = () => screen.getByRole('button', { name: '표 복사' })

  it('AC-4005.1: 표 바로 다음 줄이 왼쪽 [어떻게 세나요?] · 오른쪽 끝 [표 복사] 한 줄(flex-wrap justify-between)이다', () => {
    draw(ready())
    const line = howButton().parentElement!
    expect(table().parentElement!.nextElementSibling).toBe(line.parentElement)
    expect(line.parentElement!.firstElementChild).toBe(line)
    expect(line.className.split(' ')).toEqual(expect.arrayContaining(['flex', 'flex-wrap', 'items-center', 'justify-between']))
    expect(line.firstElementChild).toBe(howButton())
    expect(line.lastElementChild!.contains(copyButton())).toBe(true)
  })

  it('AC-4005.1: 768px 미만은 [표 복사]가 줄 전체 폭이고 [어떻게 세나요?]가 그 아래다(order)', () => {
    draw(ready())
    expect(howButton().classList.contains('max-md:order-2')).toBe(true)
    expect(howButton().parentElement!.lastElementChild!.classList.contains('max-md:w-full')).toBe(true)
    expect(copyButton().classList.contains('max-md:w-full')).toBe(true)
  })

  it('AC-4004.2: 아래 글은 "어떻게 세나요?" 칸 안에 있고 처음에는 접혀(hidden) 있어 그 자리에 보이지 않으며, 펼친 글은 그 줄 아래다', () => {
    draw(ready())
    expect(howButton().getAttribute('aria-expanded')).toBe('false')
    expect(howBody().hidden).toBe(true)
    expect(screen.getByText(FOOT).closest('[hidden]')).toBe(howBody())
    expect(howBody().textContent).toBe(FOOT)
    expect(howButton().parentElement!.nextElementSibling).toBe(howBody())
    fireEvent.click(howButton())
    expect(howBody().hidden).toBe(false)
  })

  it('AC-4004.2·AC-2705.5: 원장님이 한 분이면 접는 칸·[표 복사]가 없다(지금처럼)', () => {
    draw(ready({ kind: 'single' }))
    expect(screen.queryByRole('button', { name: '어떻게 세나요?' })).toBeNull()
    expect(screen.queryByRole('button', { name: '표 복사' })).toBeNull()
    expect(screen.queryByText(FOOT)).toBeNull()
  })
})

describe('AC-2706.5·AC-2706.6 숫자가 없을 때', () => {
  it.each<[string, BitSectionsShown, string]>([
    ['이 기기에서 불러오지 않음', null, '비트 PC에서 불러오면 보여요 · 진료 줄은 서버에 저장하지 않아서, 비트 PC에서 불러온 화면에서만 볼 수 있어요.'],
    ['불러온 범위 밖(none)', { kind: 'none' }, '이 기간은 아직 불러오지 않았어요 · 이 기간을 고른 채 [비트에서 불러오기]를 누르면 보여요.'],
    [
      '옛 도우미(old-helper)',
      { kind: 'old-helper' },
      '도우미를 업데이트하면 보여요 · 새 도우미가 나이·보험·동네·접수 시각·원장님을 함께 읽어 와요. 비트 PC 연결 화면에서 업데이트할 수 있어요.',
    ],
  ])('AC-2706.5: %s → 제목만 두고 안내 한 줄이다', (_name, view, text) => {
    draw(view)
    expect(section().querySelector('p')!.textContent).toBe(text)
    expect(section().textContent).not.toContain('원장님마다')
    expect(within(section()).queryByRole('table')).toBeNull()
    expect(within(section()).queryByRole('button')).toBeNull()
  })

  it('AC-2706.6: 고른 기간에 접수가 하나도 없으면 "이 기간에 불러온 접수가 없어요."다(매출만 있어도)', () => {
    draw(ready(TABLE, { ...MIX, total: { people: 0, visits: 0 } }))
    expect(section().querySelector('p')!.textContent).toBe('자료 없음 · 이 기간에 불러온 접수가 없어요.')
    expect(within(section()).queryByRole('table')).toBeNull()
  })

  it('AC-2706.1: 이 기간 답을 기다리는 동안은 제목·설명만이다', () => {
    draw('waiting')
    expect(section().textContent).toBe('원장님별원장님마다 환자·신환·매출 · 최근 30일')
  })
})
