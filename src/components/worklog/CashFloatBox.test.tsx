// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CASH_COUNT_KEYS, emptyWorklogCash, emptyWorklogDay, type WorklogCash, type WorklogDay } from '@/types/worklog'
import { CashFloatBox, type CashFloatBoxProps, type CashGuessMode } from './CashFloatBox'

// 현금 시재 상자 (specs/worklog-cash-float REQ-1605·REQ-1606·REQ-1607, design.md '상자', 승인 시안 docs/mockups/worklog/cash-float.html).
// 받은 값을 그리기만 한다. 숫자는 시안의 지어낸 예시다: 일지 현금수납 147,000 · 지출 현금 12,000 · 환불 8,000 · 미수입금 5,000, 비트 현금 142,000, 시재 300,000
const PIECE_NAMES = ['5만원권', '1만원권', '5천원권', '1천원권', '500원', '100원', '50원', '10원']
const SHORT = [6, 11, 1, 10, 6, 20, 0, 0] // 430,000원 → 5,000원 모자라요
const MATCH = [6, 11, 2, 10, 6, 20, 0, 0] // 435,000원 → 맞아요
const OVER = [6, 11, 3, 10, 6, 20, 0, 0] // 440,000원 → 5,000원 많아요
const ZERO = [0, 0, 0, 0, 0, 0, 0, 0]
const SAVE_TEXT = '저장했어요 · 18:05'
const BIT: CashGuessMode = { kind: 'bit', bitCashIn: 142000 }

const dayWith = (cells: Partial<WorklogDay> = {}): WorklogDay => ({ ...emptyWorklogDay(), ...cells })
const DAY = dayWith({ cashIn: '147,000원', spendCash: '12000', spendRefund: '8,000', unpaidPaid: '5000' })

function cashOf(counts: number[], rest: Partial<WorklogCash> = {}): WorklogCash {
  const cash = emptyWorklogCash()
  CASH_COUNT_KEYS.forEach((key, i) => {
    cash[key] = counts[i]
  })
  return { ...cash, floatWon: 300000, ...rest }
}

type Options = Partial<Omit<CashFloatBoxProps, 'floatWon' | 'onCash' | 'onTakeBitCash' | 'onReloadFloat'>> & { setting?: number }

// 화면처럼 시재를 들고 있는 감싸개: onCash가 오면 그 값으로 다시 그린다. floatWon은 화면 규칙(그날 시재 ?? 설정 금액, 휴대폰은 그날 시재)
function box(options: Options = {}) {
  const onCash = vi.fn<(next: WorklogCash) => void>()
  const onTakeBitCash = vi.fn()
  const onReloadFloat = vi.fn()
  const mode = options.mode ?? 'edit'
  const floatSetting = options.floatSetting ?? 'ready'
  const setting = options.setting ?? 300000
  function Stateful() {
    const [cash, setCash] = useState<WorklogCash>(options.cash ?? cashOf(SHORT))
    const floatWon = mode === 'view' ? cash.floatWon : (cash.floatWon ?? (floatSetting === 'ready' ? setting : null))
    return (
      <CashFloatBox
        mode={mode}
        day={options.day ?? DAY}
        cash={cash}
        floatWon={floatWon}
        floatSetting={floatSetting}
        guess={options.guess ?? { kind: 'none' }}
        saveText={options.saveText ?? SAVE_TEXT}
        onCash={(next) => {
          onCash(next)
          setCash(next)
        }}
        onTakeBitCash={onTakeBitCash}
        onReloadFloat={onReloadFloat}
      />
    )
  }
  const view = render(<Stateful />)
  return { onCash, onTakeBitCash, onReloadFloat, root: view.container.firstElementChild as HTMLElement }
}

const countInput = (name: string) => screen.getByLabelText<HTMLInputElement>(`${name} 장수`)
const countInputs = () => PIECE_NAMES.map((name) => countInput(name))
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } })
const countTable = () => screen.getByRole('table', { name: '세어 본 현금' })
// 표 몸 줄: [종류, 장수 칸 값, 금액]
const countRows = () =>
  within(countTable())
    .getAllByRole('row')
    .slice(1, 1 + PIECE_NAMES.length)
    .map((row) => [row.querySelector('th')?.textContent, row.querySelector('input')?.value, row.lastElementChild?.textContent])
const sumText = () => countTable().querySelector('tfoot')?.textContent
// 있어야 할 돈 줄: [왼쪽 글, 오른쪽 금액]
const calc = () => screen.getByRole('group', { name: '있어야 할 돈' })
const calcRows = () => [...calc().querySelectorAll(':scope > div')].map((row) => [row.firstElementChild?.textContent, row.lastElementChild?.textContent])
const calcValue = (label: string) => calcRows().find(([text]) => text?.startsWith(label))?.[1]
const expectedText = () => calcRows().at(-1)?.[1]
const refundBox = () => screen.queryByRole<HTMLInputElement>('checkbox', { name: '현금으로 돌려줌' })
const unpaidBox = () => screen.queryByRole<HTMLInputElement>('checkbox', { name: '현금으로 받음' })
const reasonField = () => screen.queryByLabelText<HTMLTextAreaElement>('차이 이유 (선택)')
const resultBox = (text: string) => screen.getByText(text).closest('[aria-live="polite"]')?.parentElement
const guessItems = () => screen.queryAllByRole('listitem').map((item) => item.textContent)
const buttonNames = () => screen.queryAllByRole('button').map((el) => el.textContent)
const fixFloatButton = () => screen.queryByRole('button', { name: '이 날만 고치기' })

const GUESS_TITLE = '이렇게 생겼을 수 있어요'
const OTHER_PC = '비트 PC에서 열면 무엇이 틀렸을지 추측해 드려요'
const NOT_COUNTED = '장수를 적으면 맞는지 보여 드려요'
const NO_REASON = '비트 기록으로는 이유를 찾지 못했어요. 영수증과 지출을 다시 봐 주세요.'
const FLOAT_LOADING = '시재 금액을 불러오는 중이에요'
const FLOAT_FAILED = '시재 금액을 불러오지 못했어요. 장수를 적으려면 다시 불러와 주세요.'

afterEach(cleanup)

describe('AC-1605.1 차례·글', () => {
  it('AC-1605.1: 제목 "현금 시재"와 날짜 줄과 같은 저장 상태 글(aria-hidden)이 머리에 있다', () => {
    box()
    expect(screen.getByRole('heading', { name: '현금 시재' })).toBeTruthy()
    const save = screen.getByText(SAVE_TEXT)
    expect(save.getAttribute('aria-hidden')).toBe('true')
  })

  it('AC-1605.1: 표 "세어 본 현금"은 종류·장수·금액 머리와 5만원권…10원 여덟 줄, 장수 칸 이름 "5만원권 장수" 등, 쉼표 금액, 합계다', () => {
    box()
    const head = within(countTable()).getAllByRole('columnheader').map((th) => th.textContent)
    expect(head).toEqual(['종류', '장수', '금액'])
    expect(countRows()).toEqual([
      ['5만원권', '6', '300,000원'],
      ['1만원권', '11', '110,000원'],
      ['5천원권', '1', '5,000원'],
      ['1천원권', '10', '10,000원'],
      ['500원', '6', '3,000원'],
      ['100원', '20', '2,000원'],
      ['50원', '', ''],
      ['10원', '', ''],
    ])
    expect(countInputs()).toHaveLength(8)
    expect(sumText()).toBe('합계430,000원')
  })

  it('AC-1605.1: "있어야 할 돈"은 시재 설정 금액 · + 현금수납 일지 · − 지출 현금 일지 · − 환불 · + 미수입금 · 있어야 할 돈 차례이고 쉼표와 원이다', () => {
    box({ cash: cashOf(SHORT, { floatWon: null }) })
    expect(calcRows()).toEqual([
      ['시재 설정 금액', '300,000원'],
      ['+ 현금수납 일지', '147,000원'],
      ['− 지출 현금 일지', '12,000원'],
      ['− 환불 현금으로 돌려줌', '8,000원'],
      ['+ 미수입금 현금으로 받음', '5,000원'],
      ['있어야 할 돈', '435,000원'],
    ])
  })

  it('AC-1605.1: 상자 차례는 머리 → 세어 본 현금 → 있어야 할 돈 → 결과다', () => {
    const { root } = box()
    const text = root.textContent ?? ''
    const at = (part: string) => text.indexOf(part)
    expect(at('현금 시재')).toBe(0)
    expect(at('현금 시재')).toBeLessThan(at('세어 본 현금'))
    expect(at('세어 본 현금')).toBeLessThan(at('시재 설정 금액') === -1 ? at('시재 이 날 금액') : at('시재 설정 금액'))
    expect(at('합계')).toBeLessThan(at('있어야 할 돈'))
    expect(at('있어야 할 돈')).toBeLessThan(at('5,000원 모자라요'))
  })
})

describe('AC-1605.2 장수 치기', () => {
  it('AC-1605.2: 숫자만 남고(앞 4자리) 금액·합계·있어야 할 돈과의 결과가 바로 바뀌며 onCash가 한 번 불린다', () => {
    const { onCash } = box()
    type(countInput('1만원권'), '12a3')
    expect(onCash).toHaveBeenCalledTimes(1)
    expect(onCash).toHaveBeenLastCalledWith({ ...cashOf(SHORT), count10000: 123 })
    expect(countInput('1만원권').value).toBe('123')
    expect(countRows()[1]).toEqual(['1만원권', '123', '1,230,000원'])
    expect(sumText()).toBe('합계1,550,000원')
    expect(screen.getByText('1,115,000원 많아요')).toBeTruthy()

    type(countInput('10원'), '123456')
    expect(onCash).toHaveBeenCalledTimes(2)
    expect(onCash.mock.calls[1][0].count10).toBe(1234)
    expect(countInput('10원').value).toBe('1234')
  })

  it('AC-1605.2: 맞는 장수로 바꾸면 결과가 "맞아요"가 된다', () => {
    box()
    type(countInput('5천원권'), '2')
    expect(screen.getByText('맞아요')).toBeTruthy()
    expect(screen.getByText('세어 본 돈 435,000원 · 있어야 할 돈 435,000원')).toBeTruthy()
  })

  it('AC-1605.2: 0장은 빈 칸이고, 지우면 0장으로 onCash가 불린다. 숫자가 없는 글자만 치면 부르지 않는다', () => {
    const { onCash } = box()
    expect(countInput('50원').value).toBe('')
    type(countInput('50원'), 'a')
    expect(onCash).not.toHaveBeenCalled()
    expect(countInput('50원').value).toBe('')

    type(countInput('5만원권'), '')
    expect(onCash).toHaveBeenCalledTimes(1)
    expect(onCash).toHaveBeenLastCalledWith({ ...cashOf(SHORT), count50000: 0 })
    expect(countInput('5만원권').value).toBe('')
    expect(countRows()[0]).toEqual(['5만원권', '', ''])
  })
})

describe('AC-1605.3 환불·미수입금 확인란', () => {
  it('AC-1605.3: 금액이 있으면 "현금으로 돌려줌"·"현금으로 받음"이 보이고 처음에는 꺼져 있으며, 꺼진 줄은 흐리다', () => {
    box()
    expect(refundBox()?.checked).toBe(false)
    expect(unpaidBox()?.checked).toBe(false)
    const refundValue = refundBox()!.closest('div')!.lastElementChild!
    expect(refundValue.className).toContain('text-muted')
    expect(refundValue.className).toContain('line-through')
  })

  it('AC-1605.3: 켜고 끄면 있어야 할 돈이 바뀌고 onCash가 불린다(환불 켬 427,000 · 미수입금도 켬 432,000 · 환불 끔 440,000)', () => {
    const { onCash } = box()
    expect(expectedText()).toBe('435,000원')

    fireEvent.click(refundBox()!)
    expect(onCash).toHaveBeenCalledTimes(1)
    expect(onCash).toHaveBeenLastCalledWith({ ...cashOf(SHORT), refundCash: true })
    expect(refundBox()?.checked).toBe(true)
    expect(expectedText()).toBe('427,000원')
    const refundValue = refundBox()!.closest('div')!.lastElementChild!
    expect(refundValue.className).not.toContain('line-through')

    fireEvent.click(unpaidBox()!)
    expect(onCash).toHaveBeenLastCalledWith({ ...cashOf(SHORT), refundCash: true, unpaidCash: true })
    expect(expectedText()).toBe('432,000원')

    fireEvent.click(refundBox()!)
    expect(onCash).toHaveBeenCalledTimes(3)
    expect(onCash).toHaveBeenLastCalledWith({ ...cashOf(SHORT), unpaidCash: true })
    expect(expectedText()).toBe('440,000원')
  })

  it.each([
    ['빈 칸', ''],
    ['0', '0'],
    ['숫자 아님', '가상'],
  ])('AC-1605.3: 금액이 %s이면 확인란이 없고 그 줄은 0원이다', (_, text) => {
    box({ day: dayWith({ ...DAY, spendRefund: text, unpaidPaid: text }) })
    expect(refundBox()).toBeNull()
    expect(unpaidBox()).toBeNull()
    expect(calcValue('− 환불')).toBe('0원')
    expect(calcValue('+ 미수입금')).toBe('0원')
    expect(expectedText()).toBe('435,000원')
  })

  it('AC-1605.3: 켜 둔 확인란은 금액이 지워져도 계산에 0이다', () => {
    box({ cash: cashOf(SHORT, { refundCash: true }), day: dayWith({ ...DAY, spendRefund: '' }) })
    expect(refundBox()).toBeNull()
    expect(expectedText()).toBe('435,000원')
  })
})

describe('AC-1605.4 결과 네 가지', () => {
  it('AC-1605.4: 안 셌으면 "장수를 적으면 맞는지 보여 드려요"만 있고 세어 본 돈 줄·추측·이유 칸이 없다', () => {
    box({ cash: cashOf(ZERO, { floatWon: null }), guess: BIT })
    expect(screen.getByText(NOT_COUNTED)).toBeTruthy()
    expect(screen.queryByText(/^세어 본 돈 /)).toBeNull()
    expect(screen.queryByText(GUESS_TITLE)).toBeNull()
    expect(reasonField()).toBeNull()
  })

  it('AC-1605.4: 같으면 초록(positive) "맞아요"와 세어 본 돈 · 있어야 할 돈이고 추측·이유 칸이 없다', () => {
    box({ cash: cashOf(MATCH, { reason: '가상 이유' }), guess: BIT })
    const verdict = screen.getByText('맞아요')
    expect(verdict.className).toContain('text-positive')
    expect(resultBox('맞아요')?.className).toContain('bg-positive-soft')
    expect(screen.getByText('세어 본 돈 435,000원 · 있어야 할 돈 435,000원')).toBeTruthy()
    expect(screen.queryByText(GUESS_TITLE)).toBeNull()
    expect(reasonField()).toBeNull()
  })

  it('AC-1605.4: 모자라면 주황(negative) "5,000원 모자라요"와 세어 본 돈 430,000원 · 있어야 할 돈 435,000원이다', () => {
    box()
    const verdict = screen.getByText('5,000원 모자라요')
    expect(verdict.className).toContain('text-negative')
    expect(resultBox('5,000원 모자라요')?.className).toContain('bg-negative-soft')
    expect(screen.getByText('세어 본 돈 430,000원 · 있어야 할 돈 435,000원')).toBeTruthy()
  })

  it('AC-1605.4: 많으면 주황(negative) "5,000원 많아요"다', () => {
    box({ cash: cashOf(OVER) })
    const verdict = screen.getByText('5,000원 많아요')
    expect(verdict.className).toContain('text-negative')
    expect(resultBox('5,000원 많아요')?.className).toContain('bg-negative-soft')
    expect(screen.getByText('세어 본 돈 440,000원 · 있어야 할 돈 435,000원')).toBeTruthy()
  })

  it('AC-1605.4: 결과 글 자리는 aria-live="polite"이고 역할이 없다', () => {
    box()
    const live = screen.getByText('5,000원 모자라요').closest('[aria-live="polite"]')
    expect(live).not.toBeNull()
    expect(live?.getAttribute('role')).toBeNull()
  })
})

describe('AC-1605.5 차이 이유', () => {
  it('AC-1605.5: 다르면 "차이 이유 (선택)" 칸(최대 200자)과 안내 "환자 이름·차트번호는 적지 않아요"가 있고 치면 onCash가 불린다', () => {
    const { onCash } = box()
    const field = reasonField()!
    expect(field.maxLength).toBe(200)
    expect(screen.getByText('환자 이름·차트번호는 적지 않아요')).toBeTruthy()
    expect(field.getAttribute('aria-invalid')).not.toBe('true')
    type(field, '택배비 영수증')
    expect(onCash).toHaveBeenCalledTimes(1)
    expect(onCash).toHaveBeenLastCalledWith({ ...cashOf(SHORT), reason: '택배비 영수증' })
    expect(reasonField()!.value).toBe('택배비 영수증')
  })

  it('AC-1605.5: 개인정보 모양이면 칸이 빨갛고(aria-invalid → negative 테두리) aria-invalid다', () => {
    box({ cash: cashOf(SHORT, { reason: '가상 010-0000-1234' }) })
    const field = reasonField()!
    expect(field.getAttribute('aria-invalid')).toBe('true')
    expect(field.className).toContain('aria-invalid:border-negative')
  })

  it('AC-1605.5: 맞게 되면 이유 칸은 숨지만 적어 둔 글은 지우지 않는다', () => {
    const { onCash } = box({ cash: cashOf(SHORT, { reason: '가상 이유' }) })
    type(countInput('5천원권'), '2')
    expect(reasonField()).toBeNull()
    expect(onCash).toHaveBeenLastCalledWith({ ...cashOf(MATCH), reason: '가상 이유' })
  })
})

describe('AC-1605.6 시재 설정을 모를 때 잠김', () => {
  it('AC-1605.6: 안 센 날 설정을 불러오는 중이면 장수 칸·확인란이 잠기고 "시재 금액을 불러오는 중이에요"이며 다시 불러오기 단추가 없다', () => {
    const { onCash } = box({ cash: cashOf(ZERO, { floatWon: null }), floatSetting: 'loading' })
    expect(screen.getByText(FLOAT_LOADING)).toBeTruthy()
    expect(countInputs().every((el) => el.disabled)).toBe(true)
    expect(refundBox()?.disabled).toBe(true)
    expect(unpaidBox()?.disabled).toBe(true)
    expect(screen.queryByRole('button', { name: '시재 금액 다시 불러오기' })).toBeNull()
    type(countInput('5만원권'), '3')
    fireEvent.click(refundBox()!)
    expect(onCash).not.toHaveBeenCalled()
    expect(screen.queryAllByRole('alert')).toHaveLength(0)
  })

  it('AC-1605.6: 못 불러왔으면 안내 줄과 [시재 금액 다시 불러오기](→ onReloadFloat)이고 오류 카드가 아니다', () => {
    const { onCash, onReloadFloat } = box({ cash: cashOf(ZERO, { floatWon: null }), floatSetting: 'error' })
    expect(screen.getByText(FLOAT_FAILED)).toBeTruthy()
    expect(countInputs().every((el) => el.disabled)).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '시재 금액 다시 불러오기' }))
    expect(onReloadFloat).toHaveBeenCalledTimes(1)
    type(countInput('5만원권'), '3')
    expect(onCash).not.toHaveBeenCalled()
    expect(screen.queryAllByRole('alert')).toHaveLength(0)
  })

  it('AC-1605.6: 센 날(그날 시재가 있음)은 설정을 못 불러와도 잠기지 않고 안내 줄이 없다', () => {
    const { onCash } = box({ floatSetting: 'error' })
    expect(screen.queryByText(FLOAT_FAILED)).toBeNull()
    expect(countInputs().every((el) => !el.disabled)).toBe(true)
    type(countInput('5만원권'), '7')
    expect(onCash).toHaveBeenCalledTimes(1)
  })

  it('AC-1605.6: locked(그날 읽기가 끝나지 않음)면 장수·확인란·이유·추측 단추가 모두 잠기고 [이 날만 고치기]가 없다', () => {
    const { onCash, onTakeBitCash } = box({ mode: 'locked', guess: BIT })
    expect(countInputs().every((el) => el.disabled)).toBe(true)
    expect(refundBox()?.disabled).toBe(true)
    expect(unpaidBox()?.disabled).toBe(true)
    expect(reasonField()?.disabled).toBe(true)
    expect(fixFloatButton()).toBeNull()
    const fix = screen.getByRole<HTMLButtonElement>('button', { name: '비트 숫자로 고치기' })
    expect(fix.disabled).toBe(true)
    type(countInput('5만원권'), '7')
    fireEvent.click(refundBox()!)
    type(reasonField()!, '가상')
    fireEvent.click(fix)
    expect(onCash).not.toHaveBeenCalled()
    expect(onTakeBitCash).not.toHaveBeenCalled()
  })
})

describe('AC-1605.7 인쇄·역할·앱 규칙', () => {
  it.each(['edit', 'locked', 'view'] as const)('AC-1605.7: %s 상자 맨 바깥이 print:hidden이다', (mode) => {
    const { root } = box({ mode })
    expect(root.classList.contains('print:hidden')).toBe(true)
  })

  it.each([
    ['PC 안 셈', { cash: cashOf(ZERO, { floatWon: null }) }],
    ['PC 다름(비트 추측)', { guess: BIT }],
    ['PC 설정 실패', { cash: cashOf(ZERO, { floatWon: null }), floatSetting: 'error' as const }],
    ['휴대폰 센 날', { mode: 'view' as const, cash: cashOf(SHORT, { reason: '가상 이유' }) }],
    ['휴대폰 안 센 날', { mode: 'view' as const, cash: cashOf(ZERO, { floatWon: null }) }],
  ])('AC-1605.7: %s에 role="status"·output·role="alert"가 없다', (_, options) => {
    const { root } = box(options)
    expect(screen.queryAllByRole('status')).toHaveLength(0)
    expect(screen.queryAllByRole('alert')).toHaveLength(0)
    expect(root.querySelector('output')).toBeNull()
  })

  it.each([
    ['PC', 'edit'],
    ['휴대폰', 'view'],
  ] as const)('AC-1605.7: %s 안 센 날에는 목록(li)이 없다', (_, mode) => {
    box({ mode, cash: cashOf(ZERO, { floatWon: null }), guess: BIT })
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })

  it('AC-1605.7: 양식 CSS Module을 쓰지 않는다', () => {
    const source = readFileSync(join(process.cwd(), 'src/components/worklog/CashFloatBox.tsx'), 'utf8')
    expect(source).not.toMatch(/\.module\.css/)
  })

  it('AC-1605.7: 장수 칸은 숫자 자판·4자리·오른쪽 맞춤이고 768px 미만에서 44px(max-md:h-11)이다', () => {
    box()
    for (const el of countInputs()) {
      expect(el.inputMode).toBe('numeric')
      expect(el.maxLength).toBe(4)
      expect(el.className).toContain('text-right')
      expect(el.className).toContain('max-md:h-11')
    }
  })
})

describe('AC-1605.8 이 날만 고치기', () => {
  it('AC-1605.8: 센 날 edit에는 시재 줄 옆에 [이 날만 고치기]가 있고 작은 글이 "이 날 금액"이다', () => {
    box()
    expect(fixFloatButton()).not.toBeNull()
    expect(calcRows()[0]).toEqual(['시재 이 날 금액이 날만 고치기', '300,000원'])
  })

  it('AC-1605.8: 안 센 날에는 단추가 없고 작은 글이 "설정 금액"이다', () => {
    box({ cash: cashOf(ZERO, { floatWon: null }) })
    expect(fixFloatButton()).toBeNull()
    expect(calcRows()[0]).toEqual(['시재 설정 금액', '300,000원'])
  })

  it.each(['locked', 'view'] as const)('AC-1605.8: %s에는 단추가 없다', (mode) => {
    box({ mode })
    expect(fixFloatButton()).toBeNull()
  })

  it('AC-1605.8: 누르면 칸 "이 날 시재 금액"(지금 금액 쉼표)·[저장]·[취소]가 되고, [저장]은 floatWon만 바꾼 onCash 한 번 뒤 칸을 닫는다', () => {
    const { onCash } = box({ setting: 250000 })
    fireEvent.click(fixFloatButton()!)
    const field = screen.getByLabelText<HTMLInputElement>('이 날 시재 금액')
    expect(field.value).toBe('300,000')
    expect(screen.getByRole('button', { name: '저장' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '취소' })).toBeTruthy()
    expect(fixFloatButton()).toBeNull()

    type(field, '280,000')
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(onCash).toHaveBeenCalledTimes(1)
    expect(onCash).toHaveBeenLastCalledWith({ ...cashOf(SHORT), floatWon: 280000 })
    expect(screen.queryByLabelText('이 날 시재 금액')).toBeNull()
    expect(calcRows()[0]).toEqual(['시재 이 날 금액이 날만 고치기', '280,000원'])
    expect(expectedText()).toBe('415,000원')
    expect(screen.getByText('15,000원 많아요')).toBeTruthy()
  })

  it('AC-1605.8: Enter도 [저장]과 같다', () => {
    const { onCash } = box()
    fireEvent.click(fixFloatButton()!)
    const field = screen.getByLabelText<HTMLInputElement>('이 날 시재 금액')
    type(field, '0원')
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(onCash).toHaveBeenCalledTimes(1)
    expect(onCash).toHaveBeenLastCalledWith({ ...cashOf(SHORT), floatWon: 0 })
  })

  it.each([
    ['30만', '금액을 숫자로 적어 주세요.'],
    ['', '금액을 숫자로 적어 주세요.'],
    ['10,000,001', '시재 금액은 10,000,000원까지 적을 수 있어요.'],
  ])('AC-1605.8: "%s"이면 저장하지 않고 "%s"이며 칸이 열려 있다', (text, message) => {
    const { onCash } = box()
    fireEvent.click(fixFloatButton()!)
    const field = screen.getByLabelText<HTMLInputElement>('이 날 시재 금액')
    type(field, text)
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(onCash).not.toHaveBeenCalled()
    expect(screen.getByText(message)).toBeTruthy()
    expect(field.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByLabelText('이 날 시재 금액')).toBe(field)
    expect(screen.queryAllByRole('alert')).toHaveLength(0)
  })

  it('AC-1605.8: [취소]는 아무것도 부르지 않고 칸을 닫는다', () => {
    const { onCash, onTakeBitCash, onReloadFloat } = box()
    fireEvent.click(fixFloatButton()!)
    type(screen.getByLabelText('이 날 시재 금액'), '1')
    fireEvent.click(screen.getByRole('button', { name: '취소' }))
    expect(onCash).not.toHaveBeenCalled()
    expect(onTakeBitCash).not.toHaveBeenCalled()
    expect(onReloadFloat).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('이 날 시재 금액')).toBeNull()
    expect(calcRows()[0][1]).toBe('300,000원')
  })
})

describe('AC-1606.1·AC-1606.2·AC-1606.3 추측', () => {
  it('AC-1606.1: 비트 PC이고 다르면 "이렇게 생겼을 수 있어요" 아래 비트 현금 다름 + [비트 숫자로 고치기], 거스름돈 차례다', () => {
    box({ guess: BIT })
    expect(screen.getByText(GUESS_TITLE)).toBeTruthy()
    expect(guessItems()).toEqual([
      '일지 현금수납(147,000원)이 비트(142,000원)보다 5,000원 많아요.비트 숫자로 고치기',
      '5천원권 1장을 거스름돈으로 더 줬을 수 있어요.',
    ])
    expect(screen.getByRole('list', { name: GUESS_TITLE })).toBeTruthy()
  })

  it('AC-1606.1: 적은 현금수납이 비트보다 적으면 "적어요.", 많으면 "덜", 1만원권 2장 같은 권종·장수가 글에 그대로다', () => {
    box({ guess: { kind: 'bit', bitCashIn: 160000 }, cash: cashOf([6, 11, 1, 12, 6, 20, 0, 0]) })
    // 세어 본 돈 432,000 − 있어야 할 돈 435,000 = −3,000 → 거스름돈 추측 없음
    expect(guessItems()).toEqual(['일지 현금수납(147,000원)이 비트(160,000원)보다 13,000원 적어요.비트 숫자로 고치기'])
    cleanup()
    box({ guess: BIT, day: dayWith({ ...DAY, cashIn: '142,000' }), cash: cashOf([6, 11, 2, 10, 6, 20, 0, 0]) })
    // 있어야 할 돈 430,000 · 세어 본 돈 435,000 → 5,000원 많아요
    expect(guessItems()).toEqual(['5천원권 1장을 거스름돈으로 덜 줬을 수 있어요.'])
    cleanup()
    box({ guess: BIT, day: dayWith({ ...DAY, cashIn: '142,000' }), cash: cashOf([6, 13, 1, 10, 6, 20, 0, 0]) })
    // 있어야 할 돈 430,000 · 세어 본 돈 450,000 → 20,000원 많아요 → 1만원권 2장 덜
    expect(guessItems()).toEqual(['1만원권 2장을 거스름돈으로 덜 줬을 수 있어요.'])
  })

  it('AC-1606.1: 둘 다 없으면 "비트 기록으로는 이유를 찾지 못했어요…" 한 줄이고, 비트 현금이 없으면 비트 다름 줄이 없다', () => {
    const odd = cashOf([6, 11, 1, 13, 6, 20, 0, 0]) // 433,000 − 있어야 할 돈 430,000 → 3,000원 많아요 → 거스름돈 추측 없음
    box({ guess: BIT, day: dayWith({ ...DAY, cashIn: '142,000' }), cash: odd })
    expect(guessItems()).toEqual([NO_REASON])
    expect(screen.queryByRole('button', { name: '비트 숫자로 고치기' })).toBeNull()
    cleanup()
    box({ guess: { kind: 'bit', bitCashIn: undefined } })
    expect(guessItems()).toEqual(['5천원권 1장을 거스름돈으로 더 줬을 수 있어요.'])
  })

  it('AC-1606.1: 일지 현금수납이 숫자가 아니면 비트 다름 줄이 없다', () => {
    box({ guess: BIT, day: dayWith({ ...DAY, cashIn: '가상' }), cash: cashOf([6, 11, 0, 3, 6, 20, 0, 0]) })
    // 있어야 할 돈 288,000 · 세어 본 돈 418,000 → 130,000원 많아요 → 추측 없음
    expect(guessItems()).toEqual([NO_REASON])
  })

  it('AC-1606.2: [비트 숫자로 고치기]를 누르면 onTakeBitCash가 한 번 불리고 onCash는 불리지 않는다', () => {
    const { onCash, onTakeBitCash } = box({ guess: BIT })
    fireEvent.click(screen.getByRole('button', { name: '비트 숫자로 고치기' }))
    expect(onTakeBitCash).toHaveBeenCalledTimes(1)
    expect(onCash).not.toHaveBeenCalled()
  })

  it('AC-1606.3: 다른 PC이고 다르면 목록 대신 "비트 PC에서 열면 무엇이 틀렸을지 추측해 드려요" 한 줄이다', () => {
    box({ guess: { kind: 'other-pc' } })
    expect(screen.getByText(OTHER_PC)).toBeTruthy()
    expect(screen.queryByText(GUESS_TITLE)).toBeNull()
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })

  it('AC-1606.3: 모드 none이면 추측 자리가 없다', () => {
    box({ guess: { kind: 'none' } })
    expect(screen.queryByText(GUESS_TITLE)).toBeNull()
    expect(screen.queryByText(OTHER_PC)).toBeNull()
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
    expect(reasonField()).not.toBeNull()
  })

  it('AC-1606.3: 맞으면 비트 PC·다른 PC 모두 추측 자리가 없다', () => {
    box({ guess: BIT, cash: cashOf(MATCH) })
    expect(screen.queryByText(GUESS_TITLE)).toBeNull()
    cleanup()
    box({ guess: { kind: 'other-pc' }, cash: cashOf(MATCH) })
    expect(screen.queryByText(OTHER_PC)).toBeNull()
  })
})

describe('AC-1607.1·AC-1607.2 휴대폰(view)', () => {
  it('AC-1607.1: 센 날은 세어 본 돈·있어야 할 돈·결과·적어 둔 이유만 있고 장수표·확인란·추측·입력 칸·단추가 없다', () => {
    const { onCash } = box({ mode: 'view', guess: BIT, cash: cashOf(SHORT, { reason: '가상 택배비 영수증' }), saveText: '휴대폰에서는 보기만 할 수 있어요' })
    expect(screen.getByRole('heading', { name: '현금 시재' })).toBeTruthy()
    expect(screen.getByText('휴대폰에서는 보기만 할 수 있어요').getAttribute('aria-hidden')).toBe('true')
    const summary = screen.getByRole('group', { name: '현금 시재 결과' })
    expect([...summary.querySelectorAll(':scope > div')].map((row) => [row.firstElementChild?.textContent, row.lastElementChild?.textContent])).toEqual([
      ['세어 본 돈', '430,000원'],
      ['있어야 할 돈', '435,000원'],
    ])
    expect(screen.getByText('5,000원 모자라요')).toBeTruthy()
    expect(screen.getByText('가상 택배비 영수증')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    expect(screen.queryAllByRole('textbox')).toHaveLength(0)
    expect(buttonNames()).toEqual([])
    expect(screen.queryByText(GUESS_TITLE)).toBeNull()
    expect(screen.queryByText(OTHER_PC)).toBeNull()
    expect(onCash).not.toHaveBeenCalled()
  })

  it('AC-1607.1: 맞는 날이나 이유 글이 없는 날은 이유가 보이지 않는다', () => {
    box({ mode: 'view', cash: cashOf(MATCH, { reason: '가상 이유' }) })
    expect(screen.getByText('맞아요')).toBeTruthy()
    expect(screen.queryByText('가상 이유')).toBeNull()
    cleanup()
    box({ mode: 'view', cash: cashOf(SHORT) })
    expect(screen.queryByText('차이 이유')).toBeNull()
  })

  it('AC-1607.1: 그날 시재가 없는 줄(있으면 안 되지만)은 결과를 보이지 않는다(no-float)', () => {
    box({ mode: 'view', cash: cashOf(SHORT, { floatWon: null }) })
    expect(screen.queryByText(/모자라요|많아요|맞아요/)).toBeNull()
    expect(screen.getByText('430,000원')).toBeTruthy()
  })

  it('AC-1607.2: 안 센 날은 "아직 센 돈을 적지 않았어요" 한 줄만 있다', () => {
    const { root } = box({ mode: 'view', cash: cashOf(ZERO, { floatWon: null }), guess: BIT })
    expect(screen.getByText('아직 센 돈을 적지 않았어요')).toBeTruthy()
    expect(screen.queryByText('세어 본 돈')).toBeNull()
    expect(screen.queryByText('있어야 할 돈')).toBeNull()
    expect(screen.queryByText(NOT_COUNTED)).toBeNull()
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    expect(screen.queryAllByRole('textbox')).toHaveLength(0)
    expect(buttonNames()).toEqual([])
    expect(root.textContent).toBe(`현금 시재${SAVE_TEXT}아직 센 돈을 적지 않았어요`)
  })
})
