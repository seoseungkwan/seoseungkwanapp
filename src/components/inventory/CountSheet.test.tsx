// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { InvCategory, InvItem } from '@/types/inventory'
import { CountSheet } from './CountSheet'

// 세기 종이 미리 보기 (spec inventory REQ-7507 AC-7507.4, design.md 6절, 시안 docs/mockups/inventory ?s=print).
// A4 세로 종이 한 장(위 센 날·센 사람 빈칸, 병원 이름·인쇄 날짜, 세기 표와 같은 물품·차례) + [세기로 돌아가기]·[인쇄](window.print 가짜).
// 물품 이름·숫자는 시험 안에서 지은 가짜다

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const C_MED = 'c-med'
const C_SUP = 'c-sup'
// 일부러 분류 차례를 거꾸로 준다(sort_order로 다시 맞추는지 본다)
const CATEGORIES: InvCategory[] = [
  { id: C_SUP, name: '치료 소모품', sortOrder: 1 },
  { id: C_MED, name: '약품', sortOrder: 0 },
]

function item(over: Partial<InvItem> & Pick<InvItem, 'id' | 'categoryId' | 'name' | 'unit' | 'qty' | 'sortOrder'>): InvItem {
  return {
    minQty: null,
    lastCountQty: over.qty,
    lastCountedAt: '2026-11-14T01:00:00.000Z',
    expiry: null,
    vendor: null,
    unitPrice: null,
    bitCode: null,
    hidden: false,
    orderedAt: null,
    ...over,
  }
}

const ITEMS: InvItem[] = [
  item({ id: 'i-hya', categoryId: C_MED, name: '히알루론산 주사 2mL', unit: '개', qty: 4, sortOrder: 1, expiry: '2027-03-31' }),
  item({ id: 'i-lido', categoryId: C_MED, name: '리도카인 주사 2% 20mL', unit: '병', qty: 26, sortOrder: 0, expiry: '2026-12-05' }),
  item({ id: 'i-syr5', categoryId: C_SUP, name: '주사기 5cc', unit: '개', qty: 0, sortOrder: 2, hidden: true }),
  item({ id: 'i-syr3', categoryId: C_SUP, name: '주사기 3cc', unit: '개', qty: 1240, sortOrder: 0 }),
  item({ id: 'i-cast', categoryId: C_SUP, name: '반깁스 재료 4인치', unit: '개', qty: -2, lastCountQty: null, sortOrder: 1 }),
]

function draw(over: { clinicName?: string } = {}) {
  const onBack = vi.fn()
  render(<CountSheet items={ITEMS} categories={CATEGORIES} clinicName={over.clinicName ?? '튼튼정형외과의원'} printedOn="2026-11-21" onBack={onBack} />)
  return { onBack }
}

const paper = () => screen.getByRole('article', { name: '세기 종이' })
const cellTexts = (row: HTMLElement) => within(row).getAllByRole('cell').map((cell) => cell.textContent)
const itemRows = () => within(paper()).getAllByRole('row').filter((row) => row.hasAttribute('data-item'))
const printCss = () => document.querySelector('style')?.textContent ?? ''

describe('AC-7507.4: 세기 종이 미리 보기 — 머리와 단추', () => {
  it('AC-7507.4: 제목 "세기 종이 미리 보기"와 안내 글, [세기로 돌아가기]·[인쇄]가 있다', () => {
    draw()
    expect(screen.getByRole('heading', { level: 2, name: '세기 종이 미리 보기' })).toBeTruthy()
    expect(screen.getByText('A4 한 장에 세기 표와 같은 차례로 나와요. 안 쓰는 물품은 빠져요. 물품이 많으면 다음 장으로 넘어가요.')).toBeTruthy()
    expect(screen.getByRole('button', { name: '세기로 돌아가기' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '인쇄' })).toBeTruthy()
  })

  it('AC-7507.4: [인쇄]는 window.print()를 한 번 부른다', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined)
    draw()
    fireEvent.click(screen.getByRole('button', { name: '인쇄' }))
    expect(print).toHaveBeenCalledTimes(1)
  })

  it('AC-7507.4: [세기로 돌아가기]는 onBack을 부르고 인쇄하지 않는다', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined)
    const { onBack } = draw()
    fireEvent.click(screen.getByRole('button', { name: '세기로 돌아가기' }))
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(print).not.toHaveBeenCalled()
  })

  it('AC-7507.4: 단추와 머리는 종이 밖에 있다(인쇄에 나오지 않는다)', () => {
    draw()
    expect(within(paper()).queryByRole('button')).toBeNull()
    expect(within(paper()).queryByRole('heading', { name: '세기 종이 미리 보기' })).toBeNull()
  })
})

describe('AC-7507.4: 종이 위쪽 — 센 날·센 사람 빈칸, 병원 이름·인쇄 날짜', () => {
  it('AC-7507.4: 종이 제목 "재고 세기"와 센 날·센 사람 빈칸', () => {
    draw()
    const sheet = within(paper())
    expect(sheet.getByRole('heading', { name: '재고 세기' })).toBeTruthy()
    const blanks = paper().querySelector('[data-blanks]')!
    expect(blanks.textContent?.replace(/\s+/g, ' ').trim()).toBe('센 날 센 사람')
    expect(blanks.querySelectorAll('[data-blank]').length).toBe(2)
  })

  it('AC-7507.4: 병원 이름 · 인쇄 날짜 · 적는 법 한 줄', () => {
    draw()
    expect(within(paper()).getByText('튼튼정형외과의원 · 인쇄 2026-11-21 · 센 수량을 적어요. 못 센 물품은 비워 두면 지난 수량 그대로예요. 가장 빠른 유통기한이 바뀌었을 때만 적어요.')).toBeTruthy()
  })

  it('AC-7507.4: 병원 이름을 아직 못 읽었으면(빈 글) 이름 없이 인쇄 날짜부터', () => {
    draw({ clinicName: '' })
    expect(within(paper()).getByText('인쇄 2026-11-21 · 센 수량을 적어요. 못 센 물품은 비워 두면 지난 수량 그대로예요. 가장 빠른 유통기한이 바뀌었을 때만 적어요.')).toBeTruthy()
  })
})

describe('AC-7507.4: 종이 표 — 칸과 물품·차례', () => {
  it('AC-7507.4: 칸은 물품 이름 · 단위 · 지금 수량 · 센 수량 · 지금 유통기한 · 가장 빠른 유통기한', () => {
    draw()
    const heads = within(paper()).getAllByRole('columnheader').map((th) => th.textContent)
    expect(heads).toEqual(['물품 이름', '단위', '지금 수량', '센 수량', '지금 유통기한', '가장 빠른 유통기한'])
  })

  it('AC-7507.4: 숨긴 물품은 빠지고, 분류 차례 → 물품 차례(세기 표와 같은 sortItems 차례)다', () => {
    draw()
    expect(itemRows().map((row) => cellTexts(row)[0])).toEqual(['리도카인 주사 2% 20mL', '히알루론산 주사 2mL', '주사기 3cc', '반깁스 재료 4인치'])
    expect(within(paper()).queryByText('주사기 5cc')).toBeNull()
  })

  it('AC-7507.4: 분류 머리 줄이 그 분류 물품 앞에 온다', () => {
    draw()
    const rows = within(paper()).getAllByRole('row').slice(1)
    const labels = rows.map((row) => (row.hasAttribute('data-item') ? `· ${cellTexts(row)[0]}` : row.textContent))
    expect(labels).toEqual(['약품', '· 리도카인 주사 2% 20mL', '· 히알루론산 주사 2mL', '치료 소모품', '· 주사기 3cc', '· 반깁스 재료 4인치'])
  })

  it('AC-7507.4: 줄마다 이름 · 단위 · 지금 수량(쉼표, 음수는 −) · 빈 네모 · 지금 유통기한(없으면 빈칸) · 빈 네모', () => {
    draw()
    const [lido, , syr3, cast] = itemRows()
    expect(cellTexts(lido).slice(0, 3)).toEqual(['리도카인 주사 2% 20mL', '병', '26'])
    expect(cellTexts(lido)[4]).toBe('2026-12-05')
    expect(cellTexts(syr3).slice(0, 3)).toEqual(['주사기 3cc', '개', '1,240'])
    expect(cellTexts(syr3)[4]).toBe('')
    expect(cellTexts(cast)[2]).toBe('−2')
    for (const row of itemRows()) {
      const cells = within(row).getAllByRole('cell')
      expect(cells[3].querySelectorAll('[data-blank]').length).toBe(1)
      expect(cells[5].querySelectorAll('[data-blank]').length).toBe(1)
      expect(cells[3].textContent).toBe('')
    }
  })
})

describe('AC-7507.4: 인쇄 규칙 — A4 세로, 종이만', () => {
  it('AC-7507.4: @media print 안에 @page A4 세로', () => {
    draw()
    expect(printCss()).toMatch(/^@media print \{/)
    expect(printCss()).toMatch(/@page \{ size: A4 portrait; margin: 12mm; \}/)
  })

  it('AC-7507.4: 종이·그 안·종이를 품은 바깥 틀 밖은 모두 숨기고, 바깥 틀의 여백·테두리·바탕을 없앤다', () => {
    draw()
    const css = printCss()
    expect(css).toContain(
      'body:has([data-print-count-sheet]) *:not([data-print-count-sheet], [data-print-count-sheet] *, :has([data-print-count-sheet])) { display: none !important; }',
    )
    expect(css).toMatch(/body:has\(\[data-print-count-sheet\]\) :has\(\[data-print-count-sheet\]\) \{[^}]*margin: 0;[^}]*padding: 0;[^}]*border: 0;[^}]*box-shadow: none;[^}]*background: none;/)
    expect(css).toMatch(/\[data-print-count-sheet\] \{[^}]*width: auto;[^}]*min-height: 0;[^}]*padding: 0;[^}]*border: 0;/)
    expect(paper().hasAttribute('data-print-count-sheet')).toBe(true)
  })

  it('AC-7507.4: 줄이 장 사이에서 갈라지지 않는다(물품이 많으면 다음 장)', () => {
    draw()
    expect(printCss()).toMatch(/\[data-print-count-sheet\] tr \{ break-inside: avoid; \}/)
  })

  it('AC-7507.4: 규칙 글자에 HTML로 바뀌는 글자(<·>·&)가 없다', () => {
    draw()
    expect(printCss()).not.toMatch(/[<>&]/)
  })
})
