// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Costs } from '@/lib/location/costs'
import { HomeEswt } from './HomeEswt'
import { OpenCosts, type OpenCostsProps } from './OpenCosts'
import { OpenSchedule, type OpenScheduleProps } from './OpenSchedule'

// 개원 준비 — 지금 의원 체외충격파 값·개원 비용 계산·손익분기·개원 일정표
// (spec location REQ-7913 AC-7913.1·AC-7913.2, design.md 11절, 시안 ?s=plan·?s=plan-filled, 글은 requirements '화면 글 기본값').
// 부품은 props·콜백만 받는다. 값은 칸을 떠날 때(blur) 저장 콜백으로 넘긴다

afterEach(cleanup)

const box = (name: string) => screen.getByRole('textbox', { name }) as HTMLInputElement
const typeIn = (name: string, value: string) => fireEvent.change(box(name), { target: { value } })
const fill = (name: string, value: string) => {
  typeIn(name, value)
  fireEvent.blur(box(name))
}
const allText = () => document.body.textContent ?? ''

// ── 개원 비용 계산 ──

const COST_LABELS = [
  '보증금',
  '권리금',
  '인테리어(평당)',
  '장비',
  '그 밖의 준비 비용',
  '월세(한 달)',
  '관리비(한 달)',
  '직원 인건비(한 달 합계)',
  '그 밖의 운영비(한 달)',
  '대출',
  '대출 이자(해마다)',
  '환자 1명당 평균 수입',
  '한 달 진료일',
] as const

// 시안 ?s=plan-filled 예시 숫자(실제 화면은 늘 빈칸에서 시작) — 전용 52평
const EXAMPLE: readonly (readonly [string, string])[] = [
  ['보증금', '10,000'],
  ['권리금', '0'],
  ['인테리어(평당)', '250'],
  ['장비', '32,000'],
  ['그 밖의 준비 비용', '1,500'],
  ['월세(한 달)', '520'],
  ['관리비(한 달)', '78'],
  ['직원 인건비(한 달 합계)', '2,600'],
  ['그 밖의 운영비(한 달)', '400'],
  ['대출', '30,000'],
  ['대출 이자(해마다)', '5.2'],
  ['환자 1명당 평균 수입', '42,000'],
  ['한 달 진료일', '26'],
]
const M2_52_PYEONG = 171.9 // 화면 평 52.0

function costs(over: Partial<OpenCostsProps> = {}) {
  const onSave = vi.fn<(costs: Costs) => void>()
  const props: OpenCostsProps = { costs: {}, areaM2: M2_52_PYEONG, listing: null, onSave, ...over }
  const view = render(<OpenCosts {...props} />)
  return { onSave, props, ...view }
}

const sumBox = () => screen.getByRole('complementary', { name: '합계' })
const sumValue = (label: string) => within(sumBox()).getByText(label, { exact: true }).nextElementSibling?.textContent
const lineOf = (start: RegExp) => screen.getByText(start).textContent

describe('AC-7913.1: 개원 비용 칸 — 빈칸으로 열리고 원 정수만 받는다', () => {
  it('AC-7913.1: 제목·곁글과 칸 열셋이 시안 차례·이름·단위로 있다', () => {
    costs()
    expect(screen.getByRole('heading', { name: '개원 비용 계산' })).toBeTruthy()
    expect(screen.getByText('빈칸에서 직접 적어요 · 금액은 만 원')).toBeTruthy()
    expect(screen.getByRole('heading', { name: '손익분기에 쓰는 두 칸' })).toBeTruthy()
    expect(screen.getAllByRole('textbox').map((el) => (el as HTMLInputElement).labels?.[0]?.textContent)).toEqual([...COST_LABELS])
    const unitOf = (name: string) => document.getElementById(box(name).getAttribute('aria-describedby')!.split(' ')[0]!)?.textContent
    expect(COST_LABELS.map(unitOf)).toEqual(['만 원', '만 원', '만 원', '만 원', '만 원', '만 원', '만 원', '만 원', '만 원', '만 원', '%', '원', '일'])
  })

  it('AC-7913.1: 처음 열면 열세 칸이 모두 빈칸이다(기본 숫자·숫자 자리 글이 없음)', () => {
    costs()
    for (const label of COST_LABELS) {
      expect(box(label).value).toBe('')
      expect(box(label).getAttribute('placeholder') ?? '').not.toMatch(/\d/)
    }
  })

  it('AC-7913.1: 칸마다 도움말이 화면 글 기본값 그대로다', () => {
    costs({ areaM2: M2_52_PYEONG })
    for (const help of [
      '× 전용 52평',
      '엑스레이·충격파·물리치료 기계 등 합계',
      '간판·가구·전산·첫 소모품 등',
      '물리치료사·간호조무사·접수 직원 월급 합계를 직접 적어요',
      '소모품·약·전기·보험·광고 등',
      '처음에 드는 돈에서 빼요',
      '한 달 이자로 바꿔 고정비에 넣어요',
      '(월세 + 관리비 + 직원 인건비 + 그 밖의 운영비 + 한 달 이자) × 6',
      '직접 적어요(건강보험에서 받는 돈 + 환자가 내는 돈)',
      '예: 평일 22일 + 토요일 4일',
    ]) {
      expect(screen.getByText(help, { exact: true })).toBeTruthy()
    }
    expect(screen.getByText('6개월 고정비', { selector: 'form *' })).toBeTruthy()
  })

  it('AC-7913.1: 직원 인건비는 직접 적는 빈칸이고 월급 수준 안내가 없다', () => {
    costs()
    expect(box('직원 인건비(한 달 합계)').value).toBe('')
    expect(allText()).not.toMatch(/월급 수준|평균 월급|시세|실태조사|구인/)
  })

  it('AC-7913.1: 적은 값은 칸을 떠날 때 원 정수로 저장된다(만 원 × 10,000, 이자는 0.01% 단위)', () => {
    const { onSave } = costs()
    fill('보증금', '10,000')
    expect(onSave).toHaveBeenLastCalledWith({ deposit: 100_000_000 })
    expect(box('보증금').value).toBe('10,000')
    fill('대출 이자(해마다)', '5.2')
    expect(onSave).toHaveBeenLastCalledWith({ deposit: 100_000_000, rateBp: 520 })
    fill('환자 1명당 평균 수입', '42000')
    expect(onSave).toHaveBeenLastCalledWith({ deposit: 100_000_000, rateBp: 520, perPatient: 42_000 })
    expect(box('환자 1명당 평균 수입').value).toBe('42,000')
    fill('한 달 진료일', '26')
    expect(onSave).toHaveBeenLastCalledWith({ deposit: 100_000_000, rateBp: 520, perPatient: 42_000, workDays: 26 })
    expect(onSave).toHaveBeenCalledTimes(4)
  })

  it('AC-7913.1: 값이 그대로면 칸을 떠나도 저장하지 않고, 비우면 그 열쇠를 뺀다', () => {
    const { onSave } = costs({ costs: { deposit: 100_000_000, rent: 5_200_000 } })
    expect(box('보증금').value).toBe('10,000')
    expect(box('월세(한 달)').value).toBe('520')
    fireEvent.blur(box('보증금'))
    fill('보증금', '10000')
    expect(onSave).not.toHaveBeenCalled()
    fill('보증금', '')
    expect(onSave).toHaveBeenLastCalledWith({ rent: 5_200_000 })
  })

  it.each([
    ['보증금', '12.5', '숫자만 적어 주세요. 금액은 만 원 단위 정수예요.'],
    ['월세(한 달)', '-3', '숫자만 적어 주세요. 금액은 만 원 단위 정수예요.'],
    ['장비', '삼천', '숫자만 적어 주세요. 금액은 만 원 단위 정수예요.'],
    ['대출', '1,000,000', '숫자만 적어 주세요. 금액은 만 원 단위 정수예요.'],
    ['환자 1명당 평균 수입', '42000.5', '숫자만 적어 주세요. 금액은 원 단위 정수예요.'],
    ['대출 이자(해마다)', '5.255', '0부터 30까지, 소수 둘째 자리까지 적어 주세요.'],
    ['대출 이자(해마다)', '31', '0부터 30까지, 소수 둘째 자리까지 적어 주세요.'],
    ['한 달 진료일', '0', '1부터 31까지 정수로 적어 주세요.'],
    ['한 달 진료일', '32', '1부터 31까지 정수로 적어 주세요.'],
  ])('AC-7913.1: 정수만 — %s 칸에 %s를 적으면 틀린 칸 글이 보이고 저장하지 않는다', (label, value, message) => {
    const { onSave } = costs()
    fill(label, value)
    expect(box(label).getAttribute('aria-invalid')).toBe('true')
    const describedBy = box(label).getAttribute('aria-describedby')!.split(' ')
    expect(describedBy.map((id) => document.getElementById(id)?.textContent)).toContain(message)
    expect(onSave).not.toHaveBeenCalled()
    fill(label, '')
    expect(box(label).getAttribute('aria-invalid')).toBeNull()
  })

  it('AC-7913.1: 틀린 칸은 저장한 값을 그대로 두고 다른 칸은 저장된다', () => {
    const { onSave } = costs({ costs: { deposit: 100_000_000 } })
    fill('보증금', '1만')
    fill('월세(한 달)', '520')
    expect(onSave).toHaveBeenLastCalledWith({ deposit: 100_000_000, rent: 5_200_000 })
  })

  it('AC-7913.1: 매물의 보증금·권리금·월세·관리비는 칸 옆 참고 글로만 보이고 칸을 채우지 않는다', () => {
    const { onSave } = costs({ listing: { deposit: 100_000_000, premium: null, rent: 5_200_000, mgmt: 780_000 } })
    expect(screen.getAllByText(/^매물에 적은 값: /).map((el) => el.textContent)).toEqual([
      '매물에 적은 값: 1억 원',
      '매물에 적은 값: –',
      '매물에 적은 값: 520만 원',
      '매물에 적은 값: 780,000원',
    ])
    for (const label of ['보증금', '권리금', '월세(한 달)', '관리비(한 달)']) expect(box(label).value).toBe('')
    expect(sumValue('처음에 드는 돈')).toBe('–')
    expect(onSave).not.toHaveBeenCalled()
  })

  it('AC-7913.1: 매물이 없으면 참고 글이 없다', () => {
    costs({ listing: null })
    expect(screen.queryByText(/매물에 적은 값/)).toBeNull()
  })

  it('AC-7913.1: 다른 후보의 비용이 오면 그 값으로 다시 그리고, 넘긴 값이 되돌아오면 칸을 그대로 둔다', () => {
    const { onSave, props, rerender } = costs()
    fill('보증금', '10000')
    expect(box('보증금').value).toBe('10,000')
    rerender(<OpenCosts {...props} costs={{ deposit: 100_000_000 }} />)
    expect(box('보증금').value).toBe('10,000')
    rerender(<OpenCosts {...props} costs={{ rent: 3_000_000 }} />)
    expect(box('보증금').value).toBe('')
    expect(box('월세(한 달)').value).toBe('300')
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('AC-7913.1: 저장된 칸 범위 밖 값·모르는 열쇠·글자는 빈칸으로 본다', () => {
    costs({ costs: { deposit: 12_345, rent: -10_000, mgmt: '780000', other: 5, workDays: 26 } as unknown as Costs })
    expect(box('보증금').value).toBe('')
    expect(box('월세(한 달)').value).toBe('')
    expect(box('관리비(한 달)').value).toBe('')
    expect(box('한 달 진료일').value).toBe('26')
  })
})

describe('AC-7913.1: 합계·손익분기 — design.md 식, 빈칸 수, 원장 몫 글', () => {
  it('AC-7913.1: 다 비면 금액은 –이고 `칸을 채우면 여기서 더해요.`, 손익분기는 – 와 안내 글', () => {
    costs()
    expect(within(sumBox()).getByRole('heading', { name: '합계' })).toBeTruthy()
    for (const label of ['보증금 + 권리금', '인테리어', '장비 · 그 밖의 준비', '6개월 고정비', '처음에 드는 돈', '대출 빼면 내 돈', '한 달 고정비']) {
      expect(sumValue(label)).toBe('–')
    }
    expect(within(sumBox()).getByText('칸을 채우면 여기서 더해요.')).toBeTruthy()
    expect(within(sumBox()).getByText('손익분기')).toBeTruthy()
    expect(within(sumBox()).getByText('고정비 칸과 아래 두 칸을 채우면 계산돼요.')).toBeTruthy()
    expect(within(sumBox()).getByText('원장 몫은 들어 있지 않아요')).toBeTruthy()
    expect(within(sumBox()).queryByText(/^하루/)).toBeNull()
    expect(lineOf(/^인테리어 합계$/)).toBe('인테리어 합계 –')
    expect(lineOf(/^한 달 이자$/)).toBe('한 달 이자 –')
  })

  it('AC-7913.1: 시안 예시 숫자 — 처음에 드는 돈 7억 8,868만 원 · 내 돈 4억 8,868만 원 · 하루 34.1명', () => {
    costs()
    for (const [label, value] of EXAMPLE) typeIn(label, value)
    expect(sumValue('보증금 + 권리금')).toBe('1억 원')
    expect(sumValue('인테리어')).toBe('1억 3,000만 원')
    expect(sumValue('장비 · 그 밖의 준비')).toBe('3억 3,500만 원')
    expect(sumValue('6개월 고정비')).toBe('2억 2,368만 원')
    expect(sumValue('처음에 드는 돈')).toBe('7억 8,868만 원')
    expect(sumValue('대출 빼면 내 돈')).toBe('4억 8,868만 원')
    expect(sumValue('한 달 고정비')).toBe('3,728만 원')
    expect(within(sumBox()).getByText(/^하루/).textContent).toBe('하루 34.1명')
    expect(within(sumBox()).getByText('이만큼 와야 한 달 고정비를 넘겨요.')).toBeTruthy()
    expect(within(sumBox()).getByText('빈칸 0개는 0으로 더했어요.')).toBeTruthy()
    expect(within(sumBox()).getByText('원장 몫은 들어 있지 않아요')).toBeTruthy()
    expect(lineOf(/^인테리어 합계$/)).toBe('인테리어 합계 1억 3,000만 원')
    expect(lineOf(/^한 달 이자$/)).toBe('한 달 이자 130만 원')
  })

  it('AC-7913.1: 빈칸 수가 보이고 빈칸은 0으로 더한다', () => {
    costs()
    fill('보증금', '10,000')
    fill('월세(한 달)', '520')
    expect(within(sumBox()).getByText('빈칸 11개는 0으로 더했어요.')).toBeTruthy()
    expect(sumValue('보증금 + 권리금')).toBe('1억 원')
    expect(sumValue('인테리어')).toBe('–')
    expect(sumValue('장비 · 그 밖의 준비')).toBe('–')
    expect(sumValue('6개월 고정비')).toBe('3,120만 원')
    expect(sumValue('처음에 드는 돈')).toBe('1억 3,120만 원')
    expect(sumValue('대출 빼면 내 돈')).toBe('1억 3,120만 원')
    expect(sumValue('한 달 고정비')).toBe('520만 원')
  })

  it('AC-7913.1: 손익분기는 한 달 고정비와 환자 1명당 평균 수입·한 달 진료일로만 센다(둘 중 하나 비면 –)', () => {
    costs()
    fill('직원 인건비(한 달 합계)', '2,600')
    fill('환자 1명당 평균 수입', '42,000')
    expect(within(sumBox()).queryByText(/^하루/)).toBeNull()
    expect(within(sumBox()).getByText('고정비 칸과 아래 두 칸을 채우면 계산돼요.')).toBeTruthy()
    fill('한 달 진료일', '26')
    // 버림(26,000,000 × 10 ÷ (42,000 × 26)) ÷ 10 = 23.8
    expect(within(sumBox()).getByText(/^하루/).textContent).toBe('하루 23.8명')
  })

  it('AC-7913.1: 대출이 처음에 드는 돈보다 많으면 `대출이 더 많아요`', () => {
    costs()
    fill('보증금', '1,000')
    fill('대출', '5,000')
    expect(sumValue('처음에 드는 돈')).toBe('1,000만 원')
    expect(sumValue('대출 빼면 내 돈')).toBe('대출이 더 많아요')
  })

  it('AC-7913.1: 넓이를 모르면 인테리어 합계를 내지 않는다', () => {
    costs({ areaM2: null })
    fill('인테리어(평당)', '250')
    expect(screen.getByText('× 전용 –평')).toBeTruthy()
    expect(lineOf(/^인테리어 합계$/)).toBe('인테리어 합계 –')
    expect(sumValue('인테리어')).toBe('–')
  })

  it('AC-7913.1: 예상 환자 칸·견주는 글이 없다(칸은 열셋뿐)', () => {
    costs()
    for (const [label, value] of EXAMPLE) typeIn(label, value)
    expect(screen.getAllByRole('textbox')).toHaveLength(13)
    expect(allText()).not.toMatch(/예상|견줘|견주/)
  })

  it('AC-7913.1: 화면 글에 영어 낱말이 없다', () => {
    costs({ listing: { deposit: 100_000_000, premium: 0, rent: 5_200_000, mgmt: 780_000 } })
    for (const [label, value] of EXAMPLE) typeIn(label, value)
    expect(allText()).not.toMatch(/[A-Za-z]/)
  })
})

// ── 지금 의원 체외충격파 값 ──

describe('AC-7913.1: 지금 의원 체외충격파 값 칸(개원 준비 맨 위)', () => {
  const eswt = (value: number | null = null) => {
    const onSave = vi.fn<(won: number | null) => void>()
    const view = render(<HomeEswt value={value} onSave={onSave} />)
    return { onSave, ...view }
  }

  it('AC-7913.1: 제목·곁글·도움말이 화면 글 기본값 그대로이고 빈칸으로 열린다', () => {
    eswt()
    expect(screen.getByRole('heading', { name: '지금 의원 체외충격파 값' })).toBeTruthy()
    expect(screen.getByText('후보 자세히 › 경쟁 의원 진료비에서 둘레 의원 값과 견줘요 · 모든 후보에 같이 써요')).toBeTruthy()
    expect(screen.getByText('지금 의원에서 받는 값을 직접 적어요. 비우면 견주지 않아요.')).toBeTruthy()
    expect(box('체외충격파 1회 값').value).toBe('')
    expect(screen.getByText('원')).toBeTruthy()
  })

  it('AC-7913.1: 원 정수를 적고 칸을 떠나면 저장하고, 비우면 null로 저장한다', () => {
    const { onSave, rerender } = eswt()
    fill('체외충격파 1회 값', '80,000')
    expect(onSave).toHaveBeenLastCalledWith(80_000)
    expect(box('체외충격파 1회 값').value).toBe('80,000')
    rerender(<HomeEswt value={80_000} onSave={onSave} />)
    fireEvent.blur(box('체외충격파 1회 값'))
    expect(onSave).toHaveBeenCalledTimes(1)
    fill('체외충격파 1회 값', '')
    expect(onSave).toHaveBeenLastCalledWith(null)
  })

  it('AC-7913.1: 저장한 값으로 열리고, 소수·글자는 틀린 칸 글이 보이고 저장하지 않는다', () => {
    const { onSave } = eswt(80_000)
    expect(box('체외충격파 1회 값').value).toBe('80,000')
    fill('체외충격파 1회 값', '8.5')
    expect(box('체외충격파 1회 값').getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText('숫자만 적어 주세요. 금액은 원 단위 정수예요.')).toBeTruthy()
    expect(onSave).not.toHaveBeenCalled()
  })
})

// ── 개원 일정표 ──

function schedule(over: Partial<OpenScheduleProps> = {}) {
  const onOpenOn = vi.fn<(openOn: string | null) => void>()
  const onDone = vi.fn<(done: string[]) => void>()
  const props: OpenScheduleProps = { openOn: '2027-05-03', today: '2026-11-22', done: [], onOpenOn, onDone, ...over }
  const view = render(<OpenSchedule {...props} />)
  return { onOpenOn, onDone, props, ...view }
}

const rowOf = (task: string) => screen.getByText(task, { exact: true }).closest('tr')!
const cells = (task: string) => within(rowOf(task)).getAllByRole('cell').map((c) => c.textContent)
const done = (task: string) => screen.getByRole('checkbox', { name: `${task} 했음` }) as HTMLInputElement

describe('AC-7913.2: 개원 일정표 — 개원일에서 거꾸로 센 할 일·날짜, 다 함 표시', () => {
  it('AC-7913.2: 제목·곁글·남은 날 글이 화면 글 기본값 그대로다', () => {
    schedule()
    expect(screen.getByRole('heading', { name: '개원 일정표' })).toBeTruthy()
    expect(screen.getByText('개원일에서 거꾸로 세요 · 차례는 조문에서 끌어낸 어림이에요(보통 3~6개월)')).toBeTruthy()
    expect((screen.getByLabelText('개원일') as HTMLInputElement).value).toBe('2027-05-03')
    expect(screen.getByText('오늘(2026년 11월 22일)부터 162일 남았어요.')).toBeTruthy()
    expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['했음', '할 일', '날짜', '개원까지', '메모'])
  })

  it('AC-7913.2: 할 일 열넷이 차례대로, 날짜는 개원일 − 날수(요일 함께)', () => {
    schedule()
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows).toHaveLength(14)
    expect(rows.map((r) => within(r).getAllByRole('cell')[1]!.textContent)).toEqual([
      '자리 정하고 계약하기',
      '대출 상담·받기',
      '인테리어 설계 맡기기',
      '장비 고르고 주문하기',
      '인테리어 공사 시작',
      '전기 용량 늘리기 신청',
      '직원 뽑기 공고',
      '간판·홍보물·홈페이지',
      '방사선 장비 설치 신고 준비',
      '의원 개설 신고(보건소)',
      '요양기관 신고(심평원)',
      '방사선 장비 검사 받고 신고',
      '직원 교육·모의 진료',
      '개원',
    ])
    expect(cells('자리 정하고 계약하기').slice(1)).toEqual([
      '자리 정하고 계약하기',
      '2026년 12월 4일 (금)',
      '150일 전',
      '특약: 의원 개설 신고가 안 되면 계약을 없던 일로',
    ])
    expect(cells('장비 고르고 주문하기').slice(2, 4)).toEqual(['2027년 1월 3일 (일)', '120일 전'])
    expect(cells('방사선 장비 검사 받고 신고').slice(2, 4)).toEqual(['2027년 4월 28일 (수)', '5일 전'])
    expect(cells('개원').slice(1, 4)).toEqual(['개원', '2027년 5월 3일 (월)', '당일'])
  })

  it('AC-7913.2: 법 근거가 있는 할 일은 그 법 근거 줄로 가는 링크가 있다', () => {
    schedule()
    const lawOf = (task: string) => within(rowOf(task)).queryByRole('link', { name: '법 근거' })?.getAttribute('href') ?? null
    expect(lawOf('의원 개설 신고(보건소)')).toBe('/location?tab=sources#law-open')
    expect(lawOf('요양기관 신고(심평원)')).toBe('/location?tab=sources#law-nhis')
    expect(lawOf('방사선 장비 검사 받고 신고')).toBe('/location?tab=sources#law-xray')
    expect(lawOf('대출 상담·받기')).toBeNull()
    expect(screen.getAllByRole('link', { name: '법 근거' })).toHaveLength(3)
  })

  it('AC-7913.2: 지난 할 일 가운데 안 한 것에 `날짜가 지났어요`가 붙는다', () => {
    schedule({ openOn: '2027-01-01', done: ['contract'] })
    expect(screen.getByText('오늘(2026년 11월 22일)부터 40일 남았어요.')).toBeTruthy()
    expect(done('자리 정하고 계약하기').checked).toBe(true)
    expect(within(rowOf('자리 정하고 계약하기')).queryByText('날짜가 지났어요')).toBeNull()
    expect(within(rowOf('대출 상담·받기')).getByText('날짜가 지났어요')).toBeTruthy()
    expect(within(rowOf('직원 뽑기 공고')).getByText('날짜가 지났어요')).toBeTruthy()
    expect(within(rowOf('간판·홍보물·홈페이지')).queryByText('날짜가 지났어요')).toBeNull()
    expect(screen.getAllByText('날짜가 지났어요')).toHaveLength(6)
  })

  it('AC-7913.2: 다 함 표시를 켜고 끄면 할 일 id 배열을 저장 콜백으로 넘긴다', () => {
    const { onDone, props, rerender } = schedule({ done: ['contract'] })
    fireEvent.click(done('대출 상담·받기'))
    expect(onDone).toHaveBeenLastCalledWith(['contract', 'loan'])
    rerender(<OpenSchedule {...props} done={['contract', 'loan']} />)
    expect(done('대출 상담·받기').checked).toBe(true)
    fireEvent.click(done('자리 정하고 계약하기'))
    expect(onDone).toHaveBeenLastCalledWith(['loan'])
  })

  it('AC-7913.2: 개원일을 고르면 그 날짜를, 비우면 null을 저장 콜백으로 넘기고 다시 센다', () => {
    const { onOpenOn, props, rerender } = schedule()
    fireEvent.change(screen.getByLabelText('개원일'), { target: { value: '2027-06-01' } })
    expect(onOpenOn).toHaveBeenLastCalledWith('2027-06-01')
    rerender(<OpenSchedule {...props} openOn="2027-06-01" />)
    expect(cells('개원').slice(1, 4)).toEqual(['개원', '2027년 6월 1일 (화)', '당일'])
    fireEvent.change(screen.getByLabelText('개원일'), { target: { value: '' } })
    expect(onOpenOn).toHaveBeenLastCalledWith(null)
  })

  it('AC-7913.2: 개원일을 안 골랐으면 표 대신 안내 글이 보인다', () => {
    schedule({ openOn: null })
    expect((screen.getByLabelText('개원일') as HTMLInputElement).value).toBe('')
    expect(screen.getByText('개원일을 고르면 그날에서 거꾸로 센 할 일과 날짜가 나와요.')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('AC-7913.2: 개원일이 지났으면 지난 날 수를 적는다', () => {
    schedule({ openOn: '2026-11-01' })
    expect(screen.getByText('개원일이 21일 지났어요.')).toBeTruthy()
  })

  it('AC-7913.2: 화면 글에 영어 낱말이 없다', () => {
    schedule({ openOn: '2027-01-01', done: ['contract'] })
    expect(allText()).not.toMatch(/[A-Za-z]/)
  })
})
