// @vitest-environment jsdom
// TASK-7 REQ-3609: ERP 화면 오른쪽 아래 [비트 값 채우기] 단추와 결과 안내(panel.ts). 글은 승인된 목업
// docs/mockups/erp-closing-fill/ ①~⑪과 design.md 5절 그대로다. 숫자는 가짜(환자 정보 없음)
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sampleDay } from './__tests__/erpPage'
import type { FillResult } from './fill'
import { createDock, HOST_ID, TEXT, warningLines, type Dock, type View } from './panel'
import type { ClosingDay } from './types'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const MOCKUP = readFileSync(path.join(ROOT, 'docs', 'mockups', 'erp-closing-fill', 'index.html'), 'utf8')
const DESIGN = readFileSync(path.join(ROOT, 'specs', 'erp-closing-fill', 'design.md'), 'utf8')
const REQUIREMENTS = readFileSync(path.join(ROOT, 'specs', 'erp-closing-fill', 'requirements.md'), 'utf8')

const END = '확인한 뒤 업무일지 1 [전체 저장]과 업무일지 2 [일일 상세 저장]을 눌러 주세요.'
const W = {
  moneyUnconfirmed:
    '환불·변경수납 등이 있는 날이에요. 외래 수입 8칸(총매출·청구액·비급여·미수입금·진료수납액·카드·현금·계좌)은 비트 수납 줄을 그대로 더한 값이라 다를 수 있어요. 확인해 주세요.',
  splitUnconfirmed: '청구액·비급여는 비트에서 딱 나눠지지 않아 그대로 더한 값이에요. 확인해 주세요.',
  unpaidVisits: (n: number) => `수납이 끝나지 않은 진료 ${n}건이 있어요.`,
  refund: (won: string) => `환불 ${won}원이 있어요. 금액을 확인해 주세요.`,
  unknownAge: (n: number) => `생년월일이 없는 환자 ${n}명은 연령별 표에 넣지 않았어요.`,
  noHistory: '예전 자료가 따로 있어 주사1회환자는 채우지 않았어요.',
  inpatient: '입원 접수가 있어 입원수입 칸은 채우지 않았어요.',
}

/** 보류 줄(requirements 기본값 (아), design.md 5절) */
const HELD = '씨암·SONO 치료별 매출은 채우지 않았어요. 직접 넣어 주세요.'

const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()

/** 경고 없는 답(refund 0) */
function quietDay(): ClosingDay {
  const day = sampleDay()
  day.money.refund = 0
  return day
}
const result = (o: Partial<FillResult> = {}): FillResult => ({ filled: 93, missing: [], unpicked: 38, unknown: 0, held: 0, ...o })
const done = (o: { day?: ClosingDay; result?: Partial<FillResult> } = {}): View => ({
  kind: 'done',
  date: '2026-11-09',
  result: result(o.result),
  day: o.day ?? quietDay(),
})

let dock: Dock | null = null
function open() {
  const onFill = vi.fn()
  const onOpenSettings = vi.fn()
  dock = createDock(document, { onFill, onOpenSettings })
  document.body.append(dock.host)
  const shadow = dock.host.shadowRoot
  if (!shadow) throw new Error('shadowRoot 없음')
  const $ = <T extends Element = HTMLElement>(sel: string) => shadow.querySelector<T>(sel)
  const $$ = (sel: string) => [...shadow.querySelectorAll(sel)]
  const button = () => $<HTMLButtonElement>('.fill-btn') as HTMLButtonElement
  const panel = () => $<HTMLElement>('.panel') as HTMLElement
  const body = () => $<HTMLElement>('.panel .pb') as HTMLElement
  return { dock, shadow, $, $$, button, panel, body, onFill, onOpenSettings }
}

afterEach(() => {
  dock?.host.remove()
  dock = null
  document.body.innerHTML = ''
})

describe('AC-3609.1 단추', () => {
  it("AC-3609.1: 오른쪽 아래에 [비트 값 채우기] 단추 하나가 있고 안내는 처음에 숨어 있다", () => {
    const p = open()
    expect(p.dock.host.id).toBe(HOST_ID)
    expect(p.$$('button.fill-btn')).toHaveLength(1)
    expect(text(p.button())).toBe('비트 값 채우기')
    expect(p.button().disabled).toBe(false)
    expect(p.button().type).toBe('button')
    expect(p.panel().hidden).toBe(true)
    // ERP 화면의 글꼴·색이 스며들지 않게 그림자 뿌리 안에서 그린다. 자리는 오른쪽 아래
    const css = text(p.$('style'))
    expect(css).toContain(':host{all:initial}')
    expect(css).toMatch(/\.dock\{[^}]*position:fixed;right:24px;bottom:24px/)
  })

  it('AC-3609.1: 단추를 누르면 onFill을 부른다', () => {
    const p = open()
    p.button().click()
    expect(p.onFill).toHaveBeenCalledTimes(1)
  })

  it("AC-3609.2: 읽는 중이면 단추 글이 '비트에서 읽는 중…'이고 막히며 안내는 숨는다", () => {
    const p = open()
    p.dock.show({ kind: 'errDate' })
    p.dock.setReading(true)
    expect(text(p.button())).toBe('비트에서 읽는 중…')
    expect(p.button().disabled).toBe(true)
    expect(p.panel().hidden).toBe(true)
    p.button().click()
    expect(p.onFill).not.toHaveBeenCalled()
    p.dock.setReading(false)
    expect(text(p.button())).toBe('비트 값 채우기')
    expect(p.button().disabled).toBe(false)
  })
})

describe('AC-3609.4 채운 뒤 안내', () => {
  it("AC-3609.4: '{날짜} 비트 값으로 {N}칸을 채웠어요. 저장은 하지 않았어요.' · 건너뛴 칸 수 · 끝 줄 · [설정 열기]", () => {
    const p = open()
    p.dock.show(done())
    expect(p.panel().hidden).toBe(false)
    expect(p.panel().getAttribute('role')).toBe('status')
    expect(text(p.$('.pt'))).toBe('비트 값 채우기')
    expect(p.$('.x')?.getAttribute('aria-label')).toBe('안내 닫기')
    expect(text(p.$('.lead'))).toBe('2026-11-09 비트 값으로 93칸을 채웠어요. 저장은 하지 않았어요.')
    expect(p.$('.lead')?.classList.contains('err')).toBe(false)
    const blocks = p.$$('.blk')
    expect(blocks).toHaveLength(1)
    expect(text(blocks[0].querySelector('p'))).toBe('고르지 않아 건너뛴 칸 38칸')
    expect(text(blocks[0].querySelector('b'))).toBe('38칸')
    expect(text(blocks[0].querySelector('.small'))).toBe('설정에서 코드를 고르지 않은 항목이라 그대로 두었어요.')
    expect(p.$('.warns')).toBeNull()
    expect(text(p.$('.end'))).toBe(END)
    const acts = p.$$('.acts button')
    expect(acts.map(text)).toEqual(['설정 열기'])
    // 차례: 머리글 → 못 찾은 칸 → 건너뛴 칸 → 경고 → 끝 줄 → [설정 열기]
    expect([...p.body().children].map((c) => c.className)).toEqual(['lead', 'blk', 'end', 'acts'])
  })

  it('AC-3609.4: 못 찾은 칸이 있으면 갯수와 목록, 직접 넣으라는 글이 건너뛴 칸 앞에 있다', () => {
    const p = open()
    const missing = ['업무일지 1 › 진료 · 치료현황 › 도수치료', '업무일지 1 › 진료 · 치료현황 › 충격파(체충)']
    p.dock.show(done({ result: { filled: 91, missing } }))
    expect(text(p.$('.lead'))).toBe('2026-11-09 비트 값으로 91칸을 채웠어요. 저장은 하지 않았어요.')
    const [miss, skip] = p.$$('.blk')
    expect(text(miss.querySelector('.h'))).toBe('못 찾은 칸 2칸')
    expect([...miss.querySelectorAll('li')].map(text)).toEqual(missing)
    expect(text(miss.querySelector('.small'))).toBe('ERP 화면에서 찾지 못해 그대로 둔 칸이에요. 직접 넣어 주세요.')
    expect(text(skip.querySelector('p'))).toBe('고르지 않아 건너뛴 칸 38칸')
  })

  it('AC-3609.4: 건너뛴 칸이 없으면 그 줄을 보이지 않는다', () => {
    const p = open()
    p.dock.show(done({ result: { unpicked: 0, filled: 131 } }))
    expect(p.$$('.blk')).toHaveLength(0)
    expect(text(p.$('.lead'))).toBe('2026-11-09 비트 값으로 131칸을 채웠어요. 저장은 하지 않았어요.')
  })

  it("AC-3609.4: 보류 칸이 있으면(held > 0) 고르지 않은 칸 줄 바로 아래에 '씨암·SONO 치료별 매출은 채우지 않았어요. 직접 넣어 주세요.' 한 줄", () => {
    const p = open()
    const missing = ['업무일지 1 › 진료 · 치료현황 › 도수치료']
    const day = quietDay()
    day.warnings.unpaidVisits = 1
    p.dock.show(done({ day, result: { filled: 90, missing, held: 2 } }))
    const blocks = p.$$('.blk')
    expect(blocks).toHaveLength(3)
    expect(text(blocks[1].querySelector('p'))).toBe('고르지 않아 건너뛴 칸 38칸')
    expect(text(blocks[2])).toBe(HELD)
    expect(blocks[2].classList.contains('held')).toBe(true)
    expect([...p.body().children].map((c) => c.className)).toEqual(['lead', 'blk', 'blk', 'blk held', 'warns', 'end', 'acts'])
    // 보류 칸은 채운 칸·못 찾은 칸·고르지 않은 칸 수에 들지 않는다
    expect(text(p.$('.lead'))).toBe('2026-11-09 비트 값으로 90칸을 채웠어요. 저장은 하지 않았어요.')
    expect(text(blocks[0].querySelector('.h'))).toBe('못 찾은 칸 1칸')
  })

  it('AC-3609.4: 고르지 않은 칸이 없어도 보류 줄은 보이고, 보류 칸이 없으면(held 0) 보류 줄이 없다', () => {
    const p = open()
    p.dock.show(done({ result: { unpicked: 0, filled: 129, held: 2 } }))
    expect(p.$$('.blk').map(text)).toEqual([HELD])
    expect([...p.body().children].map((c) => c.className)).toEqual(['lead', 'blk held', 'end', 'acts'])
    p.dock.show(done({ result: { held: 0 } }))
    expect(p.$$('.held')).toHaveLength(0)
    expect(p.body().textContent).not.toContain('치료별 매출은 채우지 않았어요')
  })

  it('AC-3609.4: [설정 열기]는 onOpenSettings를 부르고, [×]는 안내를 닫는다', () => {
    const p = open()
    p.dock.show(done())
    p.$<HTMLButtonElement>('.acts button')?.click()
    expect(p.onOpenSettings).toHaveBeenCalledTimes(1)
    p.$<HTMLButtonElement>('.x')?.click()
    expect(p.panel().hidden).toBe(true)
    p.dock.hide()
    expect(p.panel().hidden).toBe(true)
  })
})

describe('AC-3609.4 경고 줄(design.md 5절)', () => {
  it('AC-3609.4: 해당하는 것이 없으면 경고 줄이 없다', () => {
    expect(warningLines(quietDay())).toEqual([])
  })

  it('AC-3609.4: 경고마다 design.md 5절 글 그대로이고, 차례도 5절 차례다', () => {
    const day = quietDay()
    day.warnings = { moneyUnconfirmed: true, splitUnconfirmed: true, unpaidVisits: 2, unknownAge: 1, noHistory: true }
    day.money.refund = 33_000
    day.inpatientVisits = 3
    expect(warningLines(day)).toEqual([
      W.moneyUnconfirmed,
      W.splitUnconfirmed,
      W.unpaidVisits(2),
      W.refund('33,000'),
      W.unknownAge(1),
      W.noHistory,
      W.inpatient,
    ])
  })

  it.each([
    ['moneyUnconfirmed', (d: ClosingDay) => (d.warnings.moneyUnconfirmed = true), W.moneyUnconfirmed],
    ['splitUnconfirmed', (d: ClosingDay) => (d.warnings.splitUnconfirmed = true), W.splitUnconfirmed],
    ['unpaidVisits 5', (d: ClosingDay) => (d.warnings.unpaidVisits = 5), W.unpaidVisits(5)],
    ['refund 1,234,000', (d: ClosingDay) => (d.money.refund = 1_234_000), W.refund('1,234,000')],
    ['unknownAge 4', (d: ClosingDay) => (d.warnings.unknownAge = 4), W.unknownAge(4)],
    ['noHistory', (d: ClosingDay) => (d.warnings.noHistory = true), W.noHistory],
    ['inpatientVisits 1', (d: ClosingDay) => (d.inpatientVisits = 1), W.inpatient],
  ])('AC-3609.4: %s 하나만 있으면 그 줄 하나다', (_name, set, line) => {
    const day = quietDay()
    set(day)
    expect(warningLines(day)).toEqual([line])
  })

  it('AC-3609.4: 환불이 0·null이면 환불 줄이 없다', () => {
    const day = quietDay()
    day.money.refund = null
    expect(warningLines(day)).toEqual([])
    day.money.refund = 0
    expect(warningLines(day)).toEqual([])
  })

  it('AC-3609.4: 경고는 건너뛴 칸 뒤, 끝 줄 앞에 줄마다 하나씩 그린다', () => {
    const p = open()
    const day = quietDay()
    day.warnings.moneyUnconfirmed = true
    day.warnings.unpaidVisits = 2
    day.money.refund = 33_000
    p.dock.show(done({ day }))
    expect(p.$$('.warns li').map(text)).toEqual([W.moneyUnconfirmed, W.unpaidVisits(2), W.refund('33,000')])
    expect([...p.body().children].map((c) => c.className)).toEqual(['lead', 'blk', 'warns', 'end', 'acts'])
  })
})

describe('AC-3609.2·3609.3·3609.5 안내 글', () => {
  it("AC-3609.2: 설정 저장 전이면 처음 안내와 '설정 화면을 새 탭으로 열었어요…' · [설정 열기]", () => {
    const p = open()
    p.dock.show({ kind: 'first' })
    expect(text(p.$('.lead'))).toBe('처음 한 번 설정 화면에서 코드를 확인하고 [저장]을 눌러 주세요.')
    expect(text(p.$('.small'))).toBe('설정 화면을 새 탭으로 열었어요. 아무 칸도 바꾸지 않았어요.')
    expect(p.$$('.acts button').map(text)).toEqual(['설정 열기'])
    p.$<HTMLButtonElement>('.acts button')?.click()
    expect(p.onOpenSettings).toHaveBeenCalledTimes(1)
  })

  it("AC-3609.2: 날짜가 없으면 '마감 일자를 먼저 골라 주세요.' 하나다", () => {
    const p = open()
    p.dock.show({ kind: 'errDate' })
    expect([...p.body().children].map(text)).toEqual(['마감 일자를 먼저 골라 주세요.'])
    expect(p.$('.lead')?.classList.contains('err')).toBe(false)
  })

  it("AC-3609.3: 읽는 동안 날짜가 바뀌면 '읽는 동안 마감 일자가 바뀌어 채우지 않았어요. 다시 눌러 주세요.' 하나다", () => {
    const p = open()
    p.dock.show({ kind: 'dateChanged' })
    expect([...p.body().children].map(text)).toEqual(['읽는 동안 마감 일자가 바뀌어 채우지 않았어요. 다시 눌러 주세요.'])
  })

  it.each<[string, View, string]>([
    ['ERP 도우미 없음', { kind: 'errHelper' }, 'ERP 도우미를 설치해 주세요.'],
    ['이 PC 등록 안 됨', { kind: 'errNotRegistered' }, '이 PC가 아직 등록되지 않았어요. ERP 도우미 설치 파일을 다시 실행해 주세요.'],
    ['도우미 오류 번호', { kind: 'errBit', code: 'E-BIT-READ-FAILED' }, '비트에서 읽지 못했어요 (E-BIT-READ-FAILED)'],
    ['120초', { kind: 'errTimeout' }, '도우미가 답하지 않아요. 잠시 뒤 다시 눌러 주세요.'],
  ])("AC-3609.5: %s 이면 오류 머리글과 '아무 칸도 바꾸지 않았어요.'이고 [설정 열기]는 없다", (_name, view, lead) => {
    const p = open()
    p.dock.show(view)
    expect(text(p.$('.lead'))).toBe(lead)
    expect(p.$('.lead')?.classList.contains('err')).toBe(true)
    expect([...p.body().children].map(text)).toEqual([lead, '아무 칸도 바꾸지 않았어요.'])
    expect(p.$$('.acts')).toHaveLength(0)
  })

  it('AC-3609.5: 오류 번호는 줄바꿈 없는 글자로만 그린다(HTML로 읽지 않는다)', () => {
    const p = open()
    p.dock.show({ kind: 'errBit', code: '<img src=x>' })
    expect(p.$('.lead img')).toBeNull()
    expect(text(p.$('.lead .nw'))).toBe('(<img src=x>)')
  })

  it('AC-3609.5: 다음 안내를 보이면 앞 안내 글은 남지 않는다', () => {
    const p = open()
    p.dock.show(done())
    p.dock.show({ kind: 'errTimeout' })
    expect(p.$$('.blk')).toHaveLength(0)
    expect(p.$$('.end')).toHaveLength(0)
    expect(text(p.$('.lead'))).toBe('도우미가 답하지 않아요. 잠시 뒤 다시 눌러 주세요.')
  })
})

describe('AC-3609.4·3609.5 글은 승인된 목업·명세 그대로', () => {
  /** 기본값 (바): 목업과 다르게 바꾼 두 줄(ERP 도우미 없음·이 PC 등록 안 됨). 명세 글이 이긴다 */
  const CHANGED_FROM_MOCKUP: string[] = ['helperMissing', 'notRegistered']

  it('AC-3609.4: 고정 글은 기본값 (바)의 두 줄 말고 모두 목업 파일에 그대로 있다', () => {
    for (const [name, value] of Object.entries(TEXT)) {
      if (typeof value === 'string' && !CHANGED_FROM_MOCKUP.includes(name)) expect(MOCKUP, name).toContain(value)
    }
  })

  it('AC-3609.5: 기본값 (바)의 두 줄은 requirements (바)·AC-3609.5 글 그대로이고 옛 글은 쓰지 않는다', () => {
    expect(TEXT.helperMissing).toBe('ERP 도우미를 설치해 주세요.')
    expect(TEXT.notRegistered).toBe('이 PC가 아직 등록되지 않았어요. ERP 도우미 설치 파일을 다시 실행해 주세요.')
    const defaultBa = REQUIREMENTS.split('\n').find((line) => line.startsWith('- (바)')) ?? ''
    const ac = REQUIREMENTS.split('\n').find((line) => line.startsWith('- AC-3609.5:')) ?? ''
    for (const name of CHANGED_FROM_MOCKUP) {
      const value = TEXT[name as keyof typeof TEXT]
      expect(defaultBa, name).toContain(`'${String(value)}'`)
      expect(ac, name).toContain(`'${String(value)}'`)
    }
    expect(Object.values(TEXT)).not.toContain('도우미를 새 판으로 설치해 주세요.')
  })

  it("AC-3609.4: 보류 줄은 requirements 기본값 (아)·design.md 5절 글 그대로이고, 미수납 경고는 '치료별 매출이 적게 나왔을 수 있어요.'를 뗀 새 글이다", () => {
    const defaultAh = REQUIREMENTS.split('\n').find((line) => line.startsWith('- (아)')) ?? ''
    expect(defaultAh).toContain(`'${HELD}'`)
    expect(DESIGN).toContain(`'${HELD}'`)
    expect(TEXT.held(['씨암', 'SONO'])).toBe(HELD)
    expect(DESIGN).toContain("'수납이 끝나지 않은 진료 N건이 있어요.'(TASK-14)")
    const day = quietDay()
    day.warnings.unpaidVisits = 3
    expect(warningLines(day)).toEqual(['수납이 끝나지 않은 진료 3건이 있어요.'])
    expect(warningLines(day).join('')).not.toContain('치료별 매출이 적게 나왔을 수 있어요')
  })

  it('AC-3609.4: 경고 고정 글은 design.md 5절에, 오류·처음 안내 글은 requirements AC-3609.2·3609.3·3609.5에 그대로 있다', () => {
    for (const line of [W.moneyUnconfirmed, W.splitUnconfirmed, W.noHistory, W.inpatient, END]) expect(DESIGN).toContain(line)
    for (const value of [TEXT.first, TEXT.noDate, TEXT.dateChanged, TEXT.helperMissing, TEXT.notRegistered, TEXT.timeout]) {
      expect(REQUIREMENTS).toContain(value)
    }
  })
})
