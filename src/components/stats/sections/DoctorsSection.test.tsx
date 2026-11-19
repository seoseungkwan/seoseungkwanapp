// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { statsRange } from '@/components/stats/view'
import { formatDoctors } from '@/lib/analytics/doctorStats'
import { VISIT_HOURS } from '@/lib/analytics/visitHours'
import type { BitSectionsView, DoctorRow, DoctorsView, DoctorTable, PatientMix } from '@/types/stats'
import { DoctorsSection } from './DoctorsSection'
import { StatsCard } from './parts'
import type { BitSectionsShown } from './PatientMixSection'

// 원장님별 칸 (stats-bit-sections AC-2706.1·AC-2706.4·AC-2706.5·AC-2706.6·AC-2705.5·AC-2705.6·AC-2707.2, first90 REQ-4414 AC-4414.4, bit-total AC-6907.2,
// 시안 docs/mockups/first90/redesign.html .s-tbl·.s-docs). 이름·숫자는 모두 시험 안에서 지은 가짜다

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
const tokens = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)
const DESC = '원장님마다 환자·신환·내원·매출'
// 옛 칸 맨 끝 줄(first90 AC-4414.4) — bit-total AC-6907.2로 없어졌다
const FOOT_NOW = '확인 필요한 날도 더해서 셌어요. 그래서 위 매출 요약과 다를 수 있어요.'
// 768px 미만 원장님 카드: [이름, 매출] + 아래 다섯 칸 [이름표, 값]
const cards = () => screen.getByRole('list', { name: '원장님별 카드' })
const cardOf = (li: HTMLElement) => ({
  head: [...li.firstElementChild!.children].map((el) => el.textContent),
  cells: [...li.querySelectorAll('dl > div')].map((div) => [div.querySelector('dt')!.textContent, div.querySelector('dd')!.textContent]),
})
const inCard = (view: BitSectionsShown) => (
  <StatsCard id="stats-ops" title="진료 운영" desc="언제 붐비는지 · 원장님마다">
    <DoctorsSection view={view} range={R30} hospitalName={HOSPITAL} />
  </StatsCard>
)

const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
afterEach(() => {
  cleanup()
  if (original) Object.defineProperty(navigator, 'clipboard', original)
  else Reflect.deleteProperty(navigator, 'clipboard')
})

describe('AC-2706.4·AC-4414.4 원장님별 칸', () => {
  it('AC-4414.4: 진료 운영 카드 안에서는 h3 "원장님별" + 옆 글 "원장님마다 환자·신환·내원·매출"이고 윗줄 아래 전체 폭이다', () => {
    render(inCard(ready()))
    const heading = screen.getByRole('heading', { level: 3, name: '원장님별' })
    expect(screen.getByText(DESC)).toBeTruthy()
    expect(tokens(heading.closest('section')!).filter((t) => t.includes('basis-'))).toEqual([])
  })

  it('AC-2706.1·AC-4414.4: h2 "원장님별" + 옆 설명 "원장님마다 환자·신환·내원·매출"이고 칸 폭은 놓는 쪽이 준다', () => {
    draw(ready())
    expect(screen.getByText(DESC)).toBeTruthy()
    expect(screen.queryByText(/최근 30일/)).toBeNull()
    expect(section().className.split(' ')).toContain('col-span-12')
  })

  it('AC-2706.4·AC-4109.2: 표 머리는 원장님 | 실환자 | 신환 | 내원 | 매출 | 건당 진료비 | 비중이다', () => {
    draw(ready())
    expect(within(table()).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['원장님', '실환자', '신환', '내원', '매출', '건당 진료비', '비중'])
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

  it('AC-4414.4: 비중은 백분율 글자만이다(시안 표에 작은 막대가 없다)', () => {
    draw(ready())
    for (const tr of bodyRows()) expect(within(tr).getAllByRole('cell')[6]!.querySelector('[aria-hidden="true"]')).toBeNull()
  })

  it('AC-4414.4: 내원·매출 칸은 16px 굵게(text-lead font-semibold)이고 다른 숫자 칸은 보통 굵기다', () => {
    draw(ready())
    const [, patients, newPatients, visits, amount, perVisit, share] = within(bodyRows()[0]!).getAllByRole('cell')
    for (const key of [visits!, amount!]) expect(tokens(key)).toEqual(expect.arrayContaining(['text-lead', 'font-semibold', 'text-st-ink']))
    for (const plain of [patients!, newPatients!, perVisit!, share!]) {
      expect(tokens(plain)).not.toContain('text-lead')
      expect(tokens(plain)).not.toContain('font-semibold')
    }
  })

  it('AC-2706.4·AC-4414.4: 끝 줄 "합계"는 마지막이고 위에 진한 선·굵은 글자, 비중은 100%다', () => {
    draw(ready())
    const total = bodyRows().at(-1)!
    expect(within(total).getAllByRole('cell')[0]!.textContent).toBe('합계')
    for (const td of within(total).getAllByRole('cell')) {
      expect(tokens(td)).toEqual(expect.arrayContaining(['border-t', 'border-st-line-2', 'font-semibold']))
    }
    expect(within(total).getAllByRole('cell')[6]!.textContent).toBe('100%')
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

  it('AC-4414.4: 표는 768px 이상에서만(옆으로 밀리는 칸), 768px 미만은 원장님 카드 목록이다', () => {
    draw(ready())
    expect(tokens(table().parentElement!)).toEqual(expect.arrayContaining(['overflow-x-auto', 'max-md:hidden']))
    expect(tokens(cards())).toContain('md:hidden')
  })

  it('AC-4414.4: 768px 미만 카드는 원장님마다 이름과 매출을 크게, 아래 "내원" · "건당 진료비" · "실환자" · "신환" · "비중" 다섯 칸이고 합계 카드도 같다', () => {
    draw(ready())
    const items = within(cards()).getAllByRole('listitem')
    expect(items.map(cardOf)).toEqual([
      {
        head: ['김원장', '48,320,500원'],
        cells: [
          ['내원', '1,268건'],
          ['건당 진료비', '38,107원'],
          ['실환자', '702명'],
          ['신환', '104명'],
          ['비중', '54.8%'],
        ],
      },
      {
        head: ['이원장', '39,871,200원'],
        cells: [
          ['내원', '1,042건'],
          ['건당 진료비', '38,264원'],
          ['실환자', '591명'],
          ['신환', '82명'],
          ['비중', '45.2%'],
        ],
      },
      {
        head: ['진료의 미지정', '0원'],
        cells: [
          ['내원', '0건'],
          ['건당 진료비', '–'],
          ['실환자', '0명'],
          ['신환', '0명'],
          ['비중', '0.0%'],
        ],
      },
      {
        head: ['합계', '88,191,700원'],
        cells: [
          ['내원', '2,310건'],
          ['건당 진료비', '38,178원'],
          ['실환자', '1,248명'],
          ['신환', '186명'],
          ['비중', '100%'],
        ],
      },
    ])
    const [name, amount] = [...items[0]!.firstElementChild!.children]
    expect(tokens(name!)).toEqual(expect.arrayContaining(['text-lead', 'font-semibold']))
    expect(tokens(amount!)).toEqual(expect.arrayContaining(['text-title', 'font-semibold']))
    expect(tokens(items.at(-1)!)).toEqual(expect.arrayContaining(['border-t', 'border-st-line-2']))
  })

  it('AC-4414.4: 합계 매출이 0이면 카드 비중도 모두 "–"다', () => {
    const zero: DoctorTable = {
      kind: 'table',
      rows: [doctor('김원장', 1, 0, 1, 0, 0, null), doctor('이원장', 1, 0, 1, 0, 0, null)],
      total: doctor('합계', 2, 0, 2, 0, 0, null),
    }
    draw(ready(zero))
    expect(within(cards()).getAllByRole('listitem').map((li) => cardOf(li).cells.at(-1))).toEqual([
      ['비중', '–'],
      ['비중', '–'],
      ['비중', '–'],
    ])
  })

  it('AC-6907.2: 칸 맨 끝 줄 "확인 필요한 날도 더해서 셌어요. 그래서 위 매출 요약과 다를 수 있어요."가 없고 칸 맨 끝은 [어떻게 세나요?] · [표 복사] 칸이다', () => {
    draw(ready())
    expect(screen.queryByText(FOOT_NOW)).toBeNull()
    expect(section().lastElementChild!.contains(screen.getByRole('button', { name: '어떻게 세나요?' }))).toBe(true)
    expect(section().textContent).not.toContain('확인 필요')
  })

  it('AC-6907.2·AC-2706.4·AC-4109.2: [어떻게 세나요?] 글이 새 시안 그대로다(건당 진료비 문장으로 끝나고 확인 필요한 날 문장이 없다)', () => {
    draw(ready())
    expect(
      screen.getByText(
        '환자 수는 접수할 때 정한 진료의, 매출은 수납할 때 적힌 진료의로 나눠요. 두 원장님께 진료받은 분은 양쪽에 세요(합계는 한 번). 매출은 수납한 날의 총진료비(공단 + 본인부담 + 비급여)예요. 건당 진료비는 매출 ÷ 내원 건수예요.',
      ),
    ).toBeTruthy()
    expect(screen.queryByText(/확인 필요한 날\(환불 등\)/)).toBeNull()
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

  it('AC-2705.5·AC-4414.4: 원장님이 한 분이면 표·카드·[표 복사]·아래 글 대신 한 줄 안내이고 옆 글은 같다', () => {
    draw(ready({ kind: 'single' }))
    expect(screen.getByText('원장님이 한 분이라 나누어 볼 것이 없어요.')).toBeTruthy()
    expect(screen.getByText(DESC)).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByRole('list')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByText(FOOT_NOW)).toBeNull()
  })
})

// ── stats-pc-ux: 표 아래 [어떻게 세나요?] · [표 복사] 줄 (REQ-4004 AC-4004.2 ⑧, REQ-4005 AC-4005.1) ─────────────────
describe('AC-4004.2 ⑧·AC-4005.1: 원장님별 표 아래 줄과 접는 설명', () => {
  // bit-total AC-6907.2: 끝 문장 '확인 필요한 날(환불 등)도 …'이 빠진 글
  const FOOT =
    '환자 수는 접수할 때 정한 진료의, 매출은 수납할 때 적힌 진료의로 나눠요. 두 원장님께 진료받은 분은 양쪽에 세요(합계는 한 번). 매출은 수납한 날의 총진료비(공단 + 본인부담 + 비급여)예요. 건당 진료비는 매출 ÷ 내원 건수예요.'
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

  it('AC-4004.2·AC-4109.2·AC-6907.2: 아래 글은 "어떻게 세나요?" 칸 안에 있고 처음에는 접혀(hidden) 있어 그 자리에 보이지 않으며, 펼친 글은 그 줄 아래다', () => {
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

  it('AC-2706.1·AC-4414.4: 이 기간 답을 기다리는 동안은 제목·설명만이다', () => {
    draw('waiting')
    expect(section().textContent).toBe('원장님별원장님마다 환자·신환·내원·매출')
  })
})
