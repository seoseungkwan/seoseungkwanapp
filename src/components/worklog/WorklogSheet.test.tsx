// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { useState, type ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import {
  CELL_MAX,
  emptyWorklogDay,
  MEMO_MAX,
  NAME_MAX,
  NOTE_MAX,
  WORKLOG_CELL_KEYS,
  WORKLOG_COUNT_KEYS,
  WORKLOG_DEFAULT_NAMES,
  WORKLOG_LABELS,
  WORKLOG_NAME_KEYS,
  WORKLOG_NOTE_KEYS,
  WORKLOG_SUM_KEYS,
  WORKLOG_WON_KEYS,
  type WorklogCellKey,
  type WorklogDay,
} from '@/types/worklog'
import { BIT_LEGEND_ID } from './BitNotice'
import s from './sheet.module.css'
import { WorklogSheet } from './WorklogSheet'

// 엑셀 양식 칸은 받은 값을 그리기만 한다(design.md 11-1절). 숫자는 둥근 가짜 값이고 환자·의원 자료가 없다
type Props = ComponentProps<typeof WorklogSheet>

const YMD = '2026-10-28'
const dayWith = (cells: Partial<WorklogDay> = {}): WorklogDay => ({ ...emptyWorklogDay(), ...cells })

function setup(cells: Partial<WorklogDay> = {}, overrides: Partial<Props> = {}) {
  const props: Props = {
    ymd: YMD,
    day: dayWith(cells),
    readOnly: false,
    blockedCells: [],
    onCell: vi.fn(),
    onFocusCell: vi.fn(),
    ...overrides,
  }
  const view = render(<WorklogSheet {...props} />)
  return {
    onCell: props.onCell as Mock,
    onFocusCell: props.onFocusCell as Mock,
    update: (next: Partial<Props>) => view.rerender(<WorklogSheet {...props} {...next} />),
  }
}

// 화면처럼 값을 들고 있는 부모. 치면 그날 값이 바뀌고 자동 칸이 다시 계산된다
function LiveSheet({ initial, onCell }: { initial: WorklogDay; onCell: Props['onCell'] }) {
  const [day, setDay] = useState(initial)
  return (
    <WorklogSheet
      ymd={YMD}
      day={day}
      readOnly={false}
      blockedCells={[]}
      onFocusCell={() => {}}
      onCell={(key, value) => {
        setDay((current) => ({ ...current, [key]: value }))
        onCell(key, value)
      }}
    />
  )
}
function setupLive(cells: Partial<WorklogDay> = {}) {
  const onCell = vi.fn()
  render(<LiveSheet initial={dayWith(cells)} onCell={onCell} />)
  return onCell
}

const field = (key: WorklogCellKey) => screen.getByLabelText<HTMLInputElement>(WORKLOG_LABELS[key])
const table = () => screen.getByRole<HTMLTableElement>('table', { name: '업무일지' })
const allFields = () => [...table().querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')]
const tdOf = (key: WorklogCellKey) => field(key).closest('td') as HTMLTableCellElement

// 표를 엑셀 자리로 읽는다. 합친 칸을 건너뛰며 'A1' → 칸, 'A1:I1' 범위를 만든다
const COLUMNS = 'ABCDEFGHI'
type Placed = { address: string; range: string; td: HTMLTableCellElement }
function placedCells(t: HTMLTableElement): Placed[] {
  const taken = new Set<string>()
  const placed: Placed[] = []
  ;[...t.rows].forEach((tr, y) => {
    let x = 0
    for (const td of tr.cells) {
      while (taken.has(`${x},${y}`)) x += 1
      for (let dx = 0; dx < td.colSpan; dx += 1) {
        for (let dy = 0; dy < td.rowSpan; dy += 1) {
          const at = `${x + dx},${y + dy}`
          if (taken.has(at)) throw new Error(`칸이 겹친다: ${at}`)
          taken.add(at)
        }
      }
      const address = `${COLUMNS[x]}${y + 1}`
      const end = `${COLUMNS[x + td.colSpan - 1]}${y + td.rowSpan}`
      placed.push({ address, range: address === end ? address : `${address}:${end}`, td })
      x += td.colSpan
    }
  })
  return placed
}
const cellAt = (address: string) => {
  const found = placedCells(table()).find((cell) => cell.address === address)
  if (!found) throw new Error(`칸이 없다: ${address}`)
  return found.td
}
const addressesWith = (className: string) =>
  placedCells(table())
    .filter((cell) => cell.td.classList.contains(className))
    .map((cell) => cell.address)
    .sort()
const sorted = (list: readonly string[]) => [...list].sort()

const nb = (n: number) => ' '.repeat(n)

// design.md 2절 표의 합친 칸 46개
const MERGED_46 = [
  'A1:I1',
  'A2:E3',
  'F2:F3',
  'A4:A6',
  'E4:F6',
  'G4:I6',
  'A7:A15',
  ...[7, 8, 9, 10, 11, 12, 13, 14, 15].flatMap((row) => [`B${row}:D${row}`, `E${row}:I${row}`]),
  'A16:A22',
  'B16:D16',
  'E16:G16',
  'H16:I16',
  'B17:D18',
  'E17:G18',
  'H17:I18',
  ...[19, 20, 21, 22].flatMap((row) => [`B${row}:D${row}`, `E${row}:G${row}`, `H${row}:I${row}`]),
  'A23:D23',
  'E23:I23',
]
const CELLS_PER_ROW = [1, 5, 3, 6, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 4, 3, 0, 3, 3, 3, 3, 2]

// 입력 칸이 놓이는 엑셀 자리(시안 그대로). 여기 없는 칸은 입력 칸이 아니다
const FIELD_AT: Readonly<Record<string, WorklogCellKey>> = {
  G4: 'memo',
  C5: 'newPatients',
  C6: 'returnPatients',
  B7: 'nameTotalFee',
  E7: 'totalFee',
  B8: 'nameClaimAmount',
  E8: 'claimAmount',
  B9: 'nameCashIn',
  E9: 'cashIn',
  B10: 'nameCardIn',
  E10: 'cardIn',
  B11: 'nameTransferIn',
  E11: 'transferIn',
  B12: 'nameLocalCurrencyIn',
  E12: 'localCurrencyIn',
  B13: 'nameUnpaidNew',
  E13: 'unpaidNew',
  B14: 'nameUnpaidPaid',
  E14: 'unpaidPaid',
  B17: 'nameSpendCash',
  E17: 'spendCash',
  H17: 'noteCash',
  B19: 'nameSpendCard',
  E19: 'spendCard',
  H19: 'noteCard',
  B20: 'nameSpendRefund',
  E20: 'spendRefund',
  H20: 'noteRefund',
  B21: 'nameSpendFree',
  E21: 'spendFree',
  H21: 'noteFree',
  H22: 'noteTotal',
}

// 입력 아닌 칸의 글자(엑셀·시안 그대로, 빈칸 수까지)
const FIXED_TEXT: Readonly<Record<string, string>> = {
  A1: '업무일지',
  F2: '결재',
  G2: `담${nb(4)}당`,
  H2: `팀${nb(4)}장`,
  I2: `원${nb(4)}장`,
  G3: '',
  H3: '',
  I3: '',
  A4: '환 자현 황',
  B4: '외래',
  C4: '',
  D4: '',
  E4: '업무사항',
  B5: '신 환',
  D5: `합${nb(2)}계`,
  B6: '재 진',
  A7: `수${nb(3)}입`,
  B15: '수납액',
  A16: '지 출',
  B16: `${nb(1)}항${nb(10)}목`,
  E16: `금${nb(8)}액`,
  H16: `비${nb(8)}고`,
  B22: '총 지 불 액',
  A23: `합${nb(3)}계`,
}

const ROOT = process.cwd()
const readRepoFile = (path: string) => readFileSync(join(ROOT, path), 'utf8')
const sheetCss = () => readRepoFile('src/components/worklog/sheet.module.css').replace(/\/\*[\s\S]*?\*\//g, '')
const compact = (css: string) => css.replace(/\s+/g, '')

const EXCLUDED_TEXT = '오전 30 오후 20' // 숫자 덩이가 둘이라 합계 제외로 읽힌다
const FLAG_TEXT = '합계에서 빠졌어요'

afterEach(cleanup)

describe('AC-008.1: 엑셀 A1:I23과 같은 표', () => {
  it('AC-008.1: 23줄이고 줄마다 칸 수가 엑셀과 같으며 9칸 × 23줄을 빈틈없이 채운다', () => {
    setup()
    const t = table()
    expect(t.rows.length).toBe(23)
    expect([...t.rows].map((tr) => tr.cells.length)).toEqual(CELLS_PER_ROW)
    const covered = placedCells(t).reduce((sum, { td }) => sum + td.colSpan * td.rowSpan, 0)
    expect(covered).toBe(9 * 23)
  })

  it('AC-008.1: 합친 칸 46개가 design.md 2절 표의 자리와 같다', () => {
    setup()
    expect(MERGED_46).toHaveLength(46)
    const merged = placedCells(table())
      .filter((cell) => cell.range.includes(':'))
      .map((cell) => cell.range)
    expect(sorted(merged)).toEqual(sorted(MERGED_46))
  })

  it('AC-008.1: 9칸 너비가 14.5·10.6·10.6·10.6·8.4·5.8·12·11.8·15.7%다', () => {
    setup()
    const widths = [...table().querySelectorAll('col')].map((col) => col.style.width)
    expect(widths).toEqual(['14.5%', '10.6%', '10.6%', '10.6%', '8.4%', '5.8%', '12%', '11.8%', '15.7%'])
  })

  it('AC-008.1: 표가 승인 시안(text-cells.html)과 줄·칸·합친 칸·클래스·글자·칸 이름까지 같다', () => {
    setup()
    const mock = new DOMParser().parseFromString(readRepoFile('docs/mockups/worklog/text-cells.html'), 'text/html').querySelector<HTMLTableElement>('table.sheet')
    expect(mock, '시안 표가 없다').not.toBeNull()
    const mockRows = [...mock!.rows]
    const rows = [...table().rows]
    expect(rows.length).toBe(mockRows.length)
    mockRows.forEach((mockRow, y) => {
      expect(sorted([...rows[y].classList]), `${y + 1}행 클래스`).toEqual(sorted([...mockRow.classList].map((name) => s[name])))
      const mockCells = [...mockRow.cells]
      const cells = [...rows[y].cells]
      expect(cells.length, `${y + 1}행 칸 수`).toBe(mockCells.length)
      mockCells.forEach((mockCell, x) => {
        const where = `${y + 1}행 ${x + 1}째 칸`
        const cell = cells[x]
        expect([cell.colSpan, cell.rowSpan], `${where} 합침`).toEqual([mockCell.colSpan, mockCell.rowSpan])
        expect(sorted([...cell.classList]), `${where} 클래스`).toEqual(sorted([...mockCell.classList].map((name) => s[name])))
        expect(cell.querySelectorAll('br').length, `${where} 줄바꿈`).toBe(mockCell.querySelectorAll('br').length)
        // 시안의 날짜·자동 칸은 스크립트가 채우므로 글자는 따로 본다
        if (!mockCell.hasAttribute('data-date') && !mockCell.hasAttribute('data-auto')) {
          expect(cell.textContent, `${where} 글자`).toBe(mockCell.textContent)
        }
        const mockField = mockCell.querySelector('input, textarea')
        expect(cell.querySelector('input, textarea')?.getAttribute('aria-label') ?? null, `${where} 칸 이름`).toBe(mockField?.getAttribute('aria-label') ?? null)
      })
    })
  })

  it('AC-008.1: 입력 아닌 칸의 글자가 엑셀 그대로이고, 결재·환자 현황은 시안처럼 줄을 바꾼다', () => {
    setup()
    for (const [address, text] of Object.entries(FIXED_TEXT)) {
      expect(cellAt(address).textContent, address).toBe(text)
    }
    expect(cellAt('F2').innerHTML).toBe('결<br><br>재')
    expect(cellAt('A4').innerHTML).toBe('환 자<br>현 황')
  })

  it('AC-008.1: 안 고친 항목 이름은 기본 글자이고 지출 넷째 줄은 "free"다', () => {
    setup()
    for (const key of WORKLOG_NAME_KEYS) expect(field(key).value, key).toBe(WORKLOG_DEFAULT_NAMES[key])
    expect(field('nameSpendFree').value).toBe('free')
  })
})

describe('AC-008.2: 칸 색과 바깥 선', () => {
  it('AC-008.2: 연보라는 날짜·결재 띠, 환자 합계 이름·값, 수납액 이름·값, 맨 아래 합계 값이다', () => {
    setup()
    expect(addressesWith(s.lav)).toEqual(sorted(['A2', 'F2', 'G2', 'H2', 'I2', 'G3', 'H3', 'I3', 'D5', 'D6', 'B15', 'E15', 'E23']))
  })

  it('AC-008.2: 회색은 총진료비·조합청구액 줄과 총지불액 줄이다', () => {
    setup()
    expect(addressesWith(s.gray)).toEqual(sorted(['B7', 'E7', 'B8', 'E8', 'B22', 'E22', 'H22']))
  })

  it('AC-008.2: 바깥 굵은 선 자리가 시안과 같다', () => {
    setup()
    expect(addressesWith(s.L)).toEqual(sorted(['A1', 'A2', 'A4', 'A7', 'A16', 'A23']))
    expect(addressesWith(s.R)).toEqual(
      sorted(['A1', 'I2', 'I3', 'G4', 'E7', 'E8', 'E9', 'E10', 'E11', 'E12', 'E13', 'E14', 'E15', 'H16', 'H17', 'H19', 'H20', 'H21', 'H22', 'E23']),
    )
    expect(addressesWith(s.B)).toEqual(sorted(['A23', 'E23']))
  })

  it('AC-008.2: 바깥 종이는 paper 클래스와 1px line 테두리(border border-line)다. line 색은 CSS Module 허용 색 밖이라 여기서 붙인다', () => {
    setup()
    const paper = table().parentElement as HTMLElement
    expect(paper.tagName).toBe('DIV')
    expect(paper.classList.contains(s.paper)).toBe(true)
    expect(paper.classList.contains('border')).toBe(true)
    expect(paper.classList.contains('border-line')).toBe(true)
  })

  it('AC-008.2: 칸에 쓴 클래스는 모두 sheet.module.css에 있다', () => {
    const css = sheetCss()
    const used = new Set([...readRepoFile('src/components/worklog/WorklogSheet.tsx').matchAll(/\bs\.(\w+)/g)].map((match) => match[1]))
    expect(used.size).toBeGreaterThan(10)
    for (const name of used) expect(css, name).toMatch(new RegExp(`\\.${name}(?![\\w-])`))
  })
})

describe('AC-008.3: 입력 칸', () => {
  it('AC-008.3: 입력 칸은 32개이고 엑셀 자리마다 정해진 칸이다(결재·외래 빈칸·자동 칸·수납액·총 지 불 액 이름은 입력이 아니다)', () => {
    setup()
    expect(allFields()).toHaveLength(32)
    const found: Record<string, string> = {}
    for (const { address, td } of placedCells(table())) {
      const inside = td.querySelector('input, textarea')
      if (inside) found[address] = inside.getAttribute('aria-label') ?? ''
    }
    expect(found).toEqual(Object.fromEntries(Object.entries(FIELD_AT).map(([address, key]) => [address, WORKLOG_LABELS[key]])))
    expect(new Set(Object.values(FIELD_AT)).size).toBe(WORKLOG_CELL_KEYS.length)
  })

  it('AC-008.3: 숫자 칸 14개는 inputmode가 없고 50자까지다', () => {
    setup()
    for (const key of [...WORKLOG_COUNT_KEYS, ...WORKLOG_WON_KEYS]) {
      expect(field(key).tagName, key).toBe('INPUT')
      expect(field(key).hasAttribute('inputmode'), key).toBe(false)
      expect(field(key).maxLength, key).toBe(CELL_MAX)
    }
  })

  it('AC-008.3: 비고 5개는 100자, 업무사항은 2,000자 textarea, 항목 이름 12개는 20자까지다', () => {
    setup()
    for (const key of WORKLOG_NOTE_KEYS) expect(field(key).maxLength, key).toBe(NOTE_MAX)
    expect(field('memo').tagName).toBe('TEXTAREA')
    expect(field('memo').maxLength).toBe(MEMO_MAX)
    for (const key of WORKLOG_NAME_KEYS) expect(field(key).maxLength, key).toBe(NAME_MAX)
  })

  it('AC-008.3: 입력 칸은 모두 맞춤법 검사와 자동 완성을 끈다', () => {
    setup()
    for (const el of allFields()) {
      expect(el.getAttribute('spellcheck'), el.getAttribute('aria-label') ?? '').toBe('false')
      expect(el.getAttribute('autocomplete'), el.getAttribute('aria-label') ?? '').toBe('off')
    }
  })

  it('AC-008.3: 항목 이름을 고쳐도 숫자 칸 이름(aria-label)은 그대로다', () => {
    setup({ nameCashIn: '가상 수납', nameSpendFree: '가상 지출' })
    expect(field('cashIn').value).toBe('')
    expect(field('spendFree').getAttribute('aria-label')).toBe('지출 free 금액')
    expect(field('nameCashIn').getAttribute('aria-label')).toBe('현금수납 항목 이름')
    expect(field('nameCashIn').value).toBe('가상 수납')
  })

  it('AC-008.3: [저장] 단추·날짜 시트 탭·그 밖의 단추가 없다', () => {
    const { container } = render(<WorklogSheet ymd={YMD} day={dayWith()} readOnly={false} blockedCells={[]} onCell={() => {}} onFocusCell={() => {}} />)
    expect(screen.queryAllByRole('button')).toEqual([])
    expect(screen.queryAllByRole('tab')).toEqual([])
    expect(container.querySelector('[role="group"]')).toBeNull()
    expect(container.textContent).not.toContain('저장')
    expect(container.textContent).not.toContain('10.01')
  })

  it('AC-008.3: 칸보다 긴 글자는 마우스를 올리면 전체가 뜨고, 짧은 글자에는 뜨지 않는다(승인 시안)', () => {
    setup({ noteCard: '가상 비고가 칸보다 긴 경우', noteFree: '짧은 글' })
    const long = field('noteCard')
    Object.defineProperty(long, 'scrollWidth', { configurable: true, value: 300 })
    Object.defineProperty(long, 'clientWidth', { configurable: true, value: 100 })
    fireEvent.mouseEnter(long)
    expect(long.title).toBe('가상 비고가 칸보다 긴 경우')

    const short = field('noteFree')
    Object.defineProperty(short, 'scrollWidth', { configurable: true, value: 100 })
    Object.defineProperty(short, 'clientWidth', { configurable: true, value: 100 })
    fireEvent.mouseEnter(short)
    expect(short.hasAttribute('title')).toBe(false)
  })

  it('AC-008.3: 업무사항 칸은 초점이 나가면 긴 글을 맨 위부터 보인다(승인 시안)', async () => {
    const user = userEvent.setup()
    setup({ memo: '가상 업무사항' })
    await user.click(field('memo'))
    field('memo').scrollTop = 40
    await user.tab()
    expect(field('memo').scrollTop).toBe(0)
  })

  it('AC-008.3: 비고·업무사항은 값으로 받고 친 글자를 onCell로 알린다', async () => {
    const user = userEvent.setup()
    const onCell = setupLive()
    await user.click(field('noteCash'))
    await user.keyboard('가')
    expect(onCell).toHaveBeenLastCalledWith('noteCash', '가')
    expect(field('noteCash').value).toBe('가')
    await user.click(field('memo'))
    await user.keyboard('나 ')
    expect(onCell).toHaveBeenLastCalledWith('memo', '나 ')
    expect(field('memo').value).toBe('나 ')
  })

  it('AC-008.3: 그리기만 한다 — 저장·supabase·브라우저 저장소·ds를 부르지 않는다', () => {
    const source = readRepoFile('src/components/worklog/WorklogSheet.tsx')
    expect(source).not.toMatch(/supabase|localStorage|sessionStorage|indexedDB|autosave|fetch\(|components\/ui\/classes/)
    expect(source).toMatch(/^'use client'/)
  })
})

describe('AC-008.4: 날짜와 자동 칸', () => {
  it('AC-008.4: 날짜 칸은 "2026/10/28 수" 모양이다', () => {
    setup()
    expect(cellAt('A2').textContent).toBe('2026/10/28 수')
    expect(cellAt('A2').classList.contains(s.date)).toBe(true)
  })

  it('AC-008.4: 수납액은 받은 값을 읽어 계산한다(글자 섞인 칸 포함, 총진료비는 빠진다)', () => {
    setup({ cashIn: '100,000', cardIn: '가상 200,000 별도', totalFee: '900,000' })
    expect(cellAt('E15').textContent).toBe('300,000원')
    expect(cellAt('E23').textContent).toBe('300,000원')
  })

  it('AC-008.4: 총지불액과 합계는 수납액 − 총지불액이고 음수는 그대로다', () => {
    setup({ cashIn: '100,000', spendCash: '50,000', spendCard: '100,000' })
    expect(cellAt('E22').textContent).toBe('150,000원')
    expect(cellAt('E23').textContent).toBe('-50,000원')
  })

  it('AC-008.4: 값이 없으면 금액 자동 칸은 "원"만, 환자 합계는 "0"이고 인원 칸은 비어 있다', () => {
    setup({ newPatients: '0', returnPatients: '' })
    expect(cellAt('D6').textContent).toBe('0')
    expect(field('newPatients').value).toBe('')
    expect(field('returnPatients').value).toBe('')
    for (const address of ['E15', 'E22', 'E23']) expect(cellAt(address).textContent, address).toBe('원')
  })

  it('AC-008.4: 환자 합계는 신환 + 재진이다', () => {
    setup({ newPatients: '10', returnPatients: '40' })
    expect(cellAt('D6').textContent).toBe('50')
  })

  it('AC-008.4: 치면 자동 칸이 바로 다시 계산된다', async () => {
    const user = userEvent.setup()
    setupLive({ cardIn: '200,000' })
    await user.click(field('cashIn'))
    await user.keyboard('100000')
    expect(cellAt('E15').textContent).toBe('300,000원')
  })
})

describe('AC-008.5: 숫자 칸 치기', () => {
  it('AC-008.5: 친 글자를 그대로 알리고 치는 동안 칸 글자를 바꾸지 않는다', async () => {
    const user = userEvent.setup()
    const onCell = setupLive()
    await user.click(field('cashIn'))
    await user.keyboard('100000')
    expect(onCell).toHaveBeenLastCalledWith('cashIn', '100000')
    expect(field('cashIn').value).toBe('100000') // 쉼표를 다시 넣지 않는다
  })

  it('AC-008.5: 글자를 섞어 치고 끝 공백을 쳐도 친 그대로다', async () => {
    const user = userEvent.setup()
    const onCell = setupLive()
    await user.click(field('cashIn'))
    await user.keyboard('12,000 ')
    expect(onCell).toHaveBeenLastCalledWith('cashIn', '12,000 ')
    expect(field('cashIn').value).toBe('12,000 ')
    await user.keyboard('별도')
    expect(onCell).toHaveBeenLastCalledWith('cashIn', '12,000 별도')
    expect(field('cashIn').value).toBe('12,000 별도')
  })

  it('AC-008.5: 초점이 나가면 화면 글자, 다시 들어오면 원을 뺀 글자다', async () => {
    const user = userEvent.setup()
    setupLive()
    await user.click(field('cashIn'))
    await user.keyboard('100000')
    await user.tab()
    expect(field('cashIn').value).toBe('100,000원')
    await user.click(field('cashIn'))
    expect(field('cashIn').value).toBe('100,000')
  })

  it('AC-008.5: 글자가 섞인 칸은 초점이 나가도 친 글자 그대로다', async () => {
    const user = userEvent.setup()
    setupLive()
    await user.click(field('cardIn'))
    await user.keyboard('2건 12,000')
    await user.tab()
    expect(field('cardIn').value).toBe('2건 12,000')
  })

  it('AC-008.5: 인원 칸은 초점이 나가도 쉼표·원이 없고, 0은 빈 칸이다', async () => {
    const user = userEvent.setup()
    setupLive()
    await user.click(field('newPatients'))
    await user.keyboard('1000')
    await user.tab()
    expect(field('newPatients').value).toBe('1000')
    await user.click(field('returnPatients'))
    await user.keyboard('0')
    expect(field('returnPatients').value).toBe('0')
    await user.tab()
    expect(field('returnPatients').value).toBe('')
  })

  it('AC-008.5: 치지 않고 초점만 오가면 onCell을 부르지 않는다', async () => {
    const user = userEvent.setup()
    const { onCell } = setup({ cashIn: '100,000' })
    await user.click(field('cashIn'))
    await user.tab()
    expect(onCell).not.toHaveBeenCalled()
    expect(field('cashIn').value).toBe('100,000원')
  })

  it('AC-008.5: 부모가 값을 아직 바꾸지 않아도 친 글자는 칸에 남는다', async () => {
    const user = userEvent.setup()
    const { onCell } = setup()
    await user.click(field('cashIn'))
    await user.keyboard('12')
    expect(onCell).toHaveBeenLastCalledWith('cashIn', '12')
    expect(field('cashIn').value).toBe('12')
  })

  it('AC-008.5: 탭으로 들어와 칸 글자가 통째로 골린 상태면 원을 뺀 뒤에도 통째로 골려 있다(승인 시안)', () => {
    setup({ cashIn: '100,000' })
    const el = field('cashIn')
    el.setSelectionRange(0, el.value.length)
    act(() => el.focus())
    expect(el.value).toBe('100,000')
    expect([el.selectionStart, el.selectionEnd]).toEqual([0, 7])
  })

  it('AC-008.5: 글자 일부에 커서만 있었으면 통째로 고르지 않는다', () => {
    setup({ cashIn: '100,000' })
    const el = field('cashIn')
    el.setSelectionRange(2, 2)
    act(() => el.focus())
    expect(el.value).toBe('100,000')
    expect(el.selectionStart).toBe(el.selectionEnd)
  })
})

describe('AC-008.6: 보기만', () => {
  const FILLED = { cashIn: '100,000', noteCash: '가상 비고', memo: '가상 업무사항', nameCashIn: '가상 수납' }

  it('AC-008.6: 항목 이름을 포함한 모든 칸이 읽기 전용이다', () => {
    setup(FILLED, { readOnly: true })
    expect(allFields()).toHaveLength(32)
    for (const el of allFields()) expect(el.readOnly, el.getAttribute('aria-label') ?? '').toBe(true)
  })

  it('AC-008.6: 값(업무사항 포함)은 그대로 보인다', () => {
    setup(FILLED, { readOnly: true })
    expect(field('cashIn').value).toBe('100,000원')
    expect(field('noteCash').value).toBe('가상 비고')
    expect(field('memo').value).toBe('가상 업무사항')
    expect(field('nameCashIn').value).toBe('가상 수납')
    expect(field('nameCardIn').value).toBe('카드수납')
  })

  it('AC-008.6: 쳐도 칸 글자와 값이 바뀌지 않는다', async () => {
    const user = userEvent.setup()
    const { onCell } = setup(FILLED, { readOnly: true })
    for (const key of ['cashIn', 'noteCash', 'memo', 'nameCashIn'] as const) {
      await user.click(field(key))
      await user.keyboard('5')
    }
    expect(onCell).not.toHaveBeenCalled()
    expect(field('memo').value).toBe('가상 업무사항')
  })

  it('AC-008.6: 고칠 수 있으면 읽기 전용이 아니다', () => {
    setup(FILLED)
    for (const el of allFields()) expect(el.readOnly, el.getAttribute('aria-label') ?? '').toBe(false)
  })
})

describe('AC-008.7: 흐린 안내', () => {
  it('AC-008.7: 고칠 수 있는 빈 업무사항 칸에 "환자 이름·차트번호는 적지 않아요"가 보인다', () => {
    setup()
    expect(field('memo').getAttribute('placeholder')).toBe('환자 이름·차트번호는 적지 않아요')
  })

  it('AC-008.7: 보기만이면 안내가 없다', () => {
    setup({}, { readOnly: true })
    expect(field('memo').hasAttribute('placeholder')).toBe(false)
  })

  it('AC-008.7: 안내는 시안대로 --muted 색의 보통 굵기다', () => {
    expect(compact(sheetCss())).toContain('.sheet.memotextarea::placeholder{color:var(--muted);font-weight:400;}')
  })
})

describe('AC-008.8: 막힌 칸', () => {
  it.each<[string, WorklogCellKey]>([
    ['인원 칸', 'newPatients'],
    ['금액 칸', 'cashIn'],
    ['지출 금액 칸', 'spendRefund'],
    ['비고', 'noteCash'],
    ['업무사항', 'memo'],
    ['항목 이름', 'nameCashIn'],
  ])('AC-008.8: %s가 막히면 aria-invalid이고 빨갛다', (_kind, key) => {
    setup({}, { blockedCells: [key] })
    expect(field(key).getAttribute('aria-invalid')).toBe('true')
    expect(tdOf(key).classList.contains(s.blocked)).toBe(true)
    const others = allFields().filter((el) => el !== field(key))
    for (const el of others) {
      expect(el.hasAttribute('aria-invalid'), el.getAttribute('aria-label') ?? '').toBe(false)
      expect((el.closest('td') as HTMLElement).classList.contains(s.blocked), el.getAttribute('aria-label') ?? '').toBe(false)
    }
  })

  it('AC-008.8: 칸 32개 모두 막힘을 보일 수 있다', () => {
    setup({}, { blockedCells: WORKLOG_CELL_KEYS })
    for (const key of WORKLOG_CELL_KEYS) {
      expect(field(key).getAttribute('aria-invalid'), key).toBe('true')
      expect(tdOf(key).classList.contains(s.blocked), key).toBe(true)
    }
  })

  it('AC-008.8: 빨강은 --negative 테두리·--negative-soft 바탕이고 초점 때 바탕은 남는다(시안 그대로)', () => {
    const css = compact(sheetCss())
    expect(css).toContain('.sheettd.blocked>input,.sheettd.blocked>textarea{background:var(--negative-soft);box-shadow:inset0002pxvar(--negative);}')
    expect(css).toContain('.sheettd.blocked>input:focus,.sheettd.blocked>textarea:focus{box-shadow:inset0002pxvar(--xl-focus);}')
  })
})

describe('AC-008.9: 항목 이름 고치기', () => {
  it('AC-008.9: 고치면 친 글자를 그대로 알린다', async () => {
    const user = userEvent.setup()
    const onCell = setupLive()
    await user.clear(field('nameCashIn'))
    await user.keyboard('택배비 ')
    expect(onCell).toHaveBeenLastCalledWith('nameCashIn', '택배비 ')
    expect(field('nameCashIn').value).toBe('택배비 ')
  })

  it('AC-008.9: 비우고 나가면 기본 이름이 보인다', async () => {
    const user = userEvent.setup()
    const onCell = setupLive({ nameSpendFree: '택배비' })
    await user.clear(field('nameSpendFree'))
    expect(onCell).toHaveBeenLastCalledWith('nameSpendFree', '')
    expect(field('nameSpendFree').value).toBe('') // 지우는 동안은 빈 칸
    await user.tab()
    expect(field('nameSpendFree').value).toBe('free')
  })

  it('AC-008.9: 그날 값에 이름이 있으면 그 이름이 보인다', () => {
    setup({ nameSpendCard: '가상 이름' })
    expect(field('nameSpendCard').value).toBe('가상 이름')
  })

  it('AC-008.9: 빈 값이면 초점이 들어와도 기본 이름에서 시작하고, 치지 않고 나가면 알리지 않는다', async () => {
    const user = userEvent.setup()
    const { onCell } = setup()
    await user.click(field('nameCashIn'))
    expect(field('nameCashIn').value).toBe('현금수납')
    await user.tab()
    expect(field('nameCashIn').value).toBe('현금수납')
    expect(onCell).not.toHaveBeenCalled()
  })

  it('AC-008.9: 기본 이름 뒤에 이어 치면 이어진 글자를 알린다', async () => {
    const user = userEvent.setup()
    const onCell = setupLive()
    await user.click(field('nameCashIn'))
    await user.keyboard('2')
    expect(onCell).toHaveBeenLastCalledWith('nameCashIn', '현금수납2')
  })
})

describe('AC-008.10: 합계에서 빠졌어요', () => {
  it.each(WORKLOG_SUM_KEYS)('AC-008.10: %s가 합계 제외로 읽히면 칸에 표시가 있고 aria-describedby로 이어진다', (key) => {
    setup({ [key]: EXCLUDED_TEXT })
    const describedBy = field(key).getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    const flag = document.getElementById(describedBy!)
    expect(flag?.textContent).toBe(FLAG_TEXT)
    expect(flag?.classList.contains(s.flag)).toBe(true)
    expect(flag?.closest('td')).toBe(tdOf(key))
    expect(tdOf(key).classList.contains(s.flagged)).toBe(true)
    expect(screen.getAllByText((_, el) => el?.textContent === FLAG_TEXT && el.classList.contains(s.flag))).toHaveLength(1)
  })

  it.each<WorklogCellKey>(['totalFee', 'claimAmount', 'unpaidNew', 'unpaidPaid', 'noteCash', 'noteCard', 'noteRefund', 'noteFree', 'noteTotal', 'memo', 'nameCashIn', 'nameSpendFree'])(
    'AC-008.10: %s에는 표시가 없다',
    (key) => {
      setup({ [key]: EXCLUDED_TEXT })
      expect(field(key).hasAttribute('aria-describedby')).toBe(false)
      expect(tdOf(key).classList.contains(s.flagged)).toBe(false)
      expect(table().textContent).not.toContain('빠졌어요')
    },
  )

  it('AC-008.10: 숫자로 읽히거나 빈 칸이면 표시가 없다', () => {
    setup({ cashIn: '12,000 별도', cardIn: '100,000' })
    expect(table().textContent).not.toContain('빠졌어요')
    expect(field('cashIn').hasAttribute('aria-describedby')).toBe(false)
  })

  it('AC-008.10: 신환·재진 칸은 "합계에서"를 눈에서만 숨기고 온전한 글자를 마우스 올리기(title)에 둔다', () => {
    setup({ newPatients: EXCLUDED_TEXT, returnPatients: EXCLUDED_TEXT, cashIn: EXCLUDED_TEXT, spendCash: EXCLUDED_TEXT })
    for (const key of WORKLOG_COUNT_KEYS) {
      expect(tdOf(key).classList.contains(s.cnt), key).toBe(true)
      expect(field(key).title, key).toBe(FLAG_TEXT)
      expect(tdOf(key).querySelector(`.${s.flagHead}`)?.textContent, key).toBe('합계에서')
      expect(document.getElementById(field(key).getAttribute('aria-describedby')!)?.textContent, key).toBe(FLAG_TEXT)
    }
    expect(field('cashIn').hasAttribute('title')).toBe(false)
    expect(field('spendCash').hasAttribute('title')).toBe(false)
  })

  it('AC-008.10: 좁은 칸의 긴 글자는 마우스를 올리면 글자와 표시가 함께 뜬다(승인 시안)', () => {
    setup({ newPatients: EXCLUDED_TEXT })
    const el = field('newPatients')
    Object.defineProperty(el, 'scrollWidth', { configurable: true, value: 300 })
    Object.defineProperty(el, 'clientWidth', { configurable: true, value: 50 })
    fireEvent.mouseEnter(el)
    expect(el.title).toBe(`${EXCLUDED_TEXT} · ${FLAG_TEXT}`)
  })

  it('AC-008.10: 칸 자리별 표시 클래스가 시안과 같다(수입 넷 wide, 지출 금액 넷 mid, 신환·재진 cnt)', () => {
    setup()
    for (const key of ['cashIn', 'cardIn', 'transferIn', 'localCurrencyIn'] as const) expect(tdOf(key).classList.contains(s.wide), key).toBe(true)
    for (const key of ['spendCash', 'spendCard', 'spendRefund', 'spendFree'] as const) expect(tdOf(key).classList.contains(s.mid), key).toBe(true)
  })

  it('AC-008.10: 합계 제외 칸은 합계에 더하지 않는다', () => {
    setup({ cashIn: EXCLUDED_TEXT, cardIn: '100,000' })
    expect(cellAt('E15').textContent).toBe('100,000원')
  })

  it('AC-008.10: 표시는 칸 높이를 늘리지 않게 겹쳐 두고, 좁은 칸은 앞말을 눈에서만 뺀다(시안 값 그대로, 폰 값 포함)', () => {
    const css = compact(sheetCss())
    for (const rule of [
      '.sheet.flag{position:absolute;display:flex;align-items:center;gap:0.3em;white-space:nowrap;line-height:1;font-weight:400;color:var(--negative);pointer-events:none;}',
      '.sheettd.wide.flag{top:0;bottom:0;right:6px;font-size:12px;}',
      '.sheettd.wide.flagged>input{padding:0108px;}',
      '.sheettd.mid.flag,.sheettd.cnt.flag{left:0;right:0;justify-content:center;}',
      '.sheettd.mid.flag{bottom:4px;font-size:11px;}',
      '.sheettd.mid.flagged>input{padding:04px13px;}',
      '.sheettd.cnt.flag{bottom:1px;font-size:10px;}',
      '.sheettd.cnt.flagHead{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);}',
      '.sheettd.cnt.flagged>input{padding:02px11px;}',
      // 768px 미만
      '.sheettd.wide.flag{right:3px;font-size:9px;}',
      '.sheettd.wide.flagged>input{padding:080px02px;}',
      '.sheettd.mid.flag{bottom:2px;font-size:9px;}',
      '.sheettd.mid.flagged>input{padding:02px10px;}',
      '.sheettd.cnt.flag{bottom:1px;font-size:8px;}',
      '.sheettd.cnt.flagged>input{padding:01px8px;}',
    ]) {
      expect(css, rule).toContain(rule)
    }
  })
})

describe('AC-008.11: 치기 전에 값이 바뀜', () => {
  it('AC-008.11: 읽기 전용 숫자 칸에 초점을 둔 채 값이 오고 풀리면 새 값이 보이고, 그 뒤 치면 새 값에서 이어진다', async () => {
    const user = userEvent.setup()
    const { onCell, update } = setup({}, { readOnly: true })
    await user.click(field('cashIn'))
    expect(field('cashIn').value).toBe('')
    update({ readOnly: false, day: dayWith({ cashIn: '100000' }) })
    expect(field('cashIn').value).toBe('100,000')
    await user.keyboard('5')
    expect(onCell).toHaveBeenLastCalledWith('cashIn', '100,0005')
    expect(field('cashIn').value).toBe('100,0005')
  })

  it('AC-008.11: 읽기 전용 항목 이름 칸에 초점을 둔 채 값이 오고 풀리면 새 값이 보이고, 그 뒤 치면 새 값에서 이어진다', async () => {
    const user = userEvent.setup()
    const { onCell, update } = setup({}, { readOnly: true })
    await user.click(field('nameCashIn'))
    expect(field('nameCashIn').value).toBe('현금수납')
    update({ readOnly: false, day: dayWith({ nameCashIn: '가상 이름' }) })
    expect(field('nameCashIn').value).toBe('가상 이름')
    await user.keyboard('5')
    expect(onCell).toHaveBeenLastCalledWith('nameCashIn', '가상 이름5')
    expect(field('nameCashIn').value).toBe('가상 이름5')
  })

  it('AC-008.11: 고칠 수 있는 칸도 치기 전이면 값이 바뀔 때 초점 글자가 따라온다', async () => {
    const user = userEvent.setup()
    const { update } = setup({ cashIn: '100000' })
    await user.click(field('cashIn'))
    expect(field('cashIn').value).toBe('100,000')
    update({ day: dayWith({ cashIn: '200000' }) })
    expect(field('cashIn').value).toBe('200,000')
  })

  it('AC-008.11: 친 뒤에는 값이 바뀌어도 숫자 칸의 친 글자를 그대로 둔다', async () => {
    const user = userEvent.setup()
    const { update } = setup()
    await user.click(field('cashIn'))
    await user.keyboard('12')
    update({ day: dayWith({ cashIn: '900000' }) })
    expect(field('cashIn').value).toBe('12')
    await user.tab()
    expect(field('cashIn').value).toBe('900,000원') // 초점이 나가면 값으로 돌아간다
  })

  it('AC-008.11: 친 뒤에는 값이 바뀌어도 항목 이름 칸의 친 글자를 그대로 둔다', async () => {
    const user = userEvent.setup()
    const { update } = setup()
    await user.clear(field('nameCashIn'))
    await user.keyboard('가상')
    update({ day: dayWith({ nameCashIn: '다른 이름' }) })
    expect(field('nameCashIn').value).toBe('가상')
  })

  it('AC-008.11: 다시 들어오면 앞서 친 글자가 남아 있지 않고 값에서 시작한다', async () => {
    const user = userEvent.setup()
    const { update } = setup()
    await user.click(field('cashIn'))
    await user.keyboard('12')
    await user.tab()
    update({ day: dayWith({ cashIn: '900000' }) })
    await user.click(field('cashIn'))
    expect(field('cashIn').value).toBe('900,000')
  })

  it('AC-008.11: 입력 칸 초점이 들어오고 나갈 때 onFocusCell로 알린다(다시 읽기가 그 칸을 건너뛴다)', async () => {
    const user = userEvent.setup()
    const { onFocusCell } = setup()
    for (const key of ['cashIn', 'noteCash', 'memo', 'nameCashIn'] as const) {
      await user.click(field(key))
      expect(onFocusCell, key).toHaveBeenLastCalledWith(key)
    }
    await user.click(document.body)
    expect(onFocusCell).toHaveBeenLastCalledWith(null)
  })
})

// ── 비트 칸 표시 (worklog REQ-017 AC-017.2, design.md 20-5절, 시안 docs/mockups/worklog/bitfill.html ①):
// 비트에서 불러온 칸(bitFields)은 칸 오른쪽 위 작은 세모(엑셀 메모 표시처럼 --xl-focus)이고, 양식 아래 설명 줄(BitNotice)을 가리킨다. 인쇄에는 없다
describe('AC-017.2: 비트 칸 표시', () => {
  const css = () => readFileSync(join(process.cwd(), 'src/components/worklog/sheet.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

  it('AC-017.2: bitFields의 숫자 칸에만 표시 클래스가 붙고, 그 칸은 설명 줄을 가리킨다', () => {
    setup({ newPatients: '12', cashIn: '125000', cardIn: '300000', spendCash: '20000' }, { bitFields: ['newPatients', 'cashIn'] })
    for (const key of ['newPatients', 'cashIn'] as const) {
      expect(tdOf(key).classList.contains(s.bit), key).toBe(true)
      expect(field(key).getAttribute('aria-describedby'), key).toBe(BIT_LEGEND_ID)
    }
    for (const key of ['returnPatients', 'cardIn', 'spendCash', 'localCurrencyIn', 'nameCashIn', 'noteCash', 'memo'] as const) {
      expect(field(key).closest('td')?.classList.contains(s.bit), key).toBe(false)
    }
    expect(field('cardIn').getAttribute('aria-describedby')).toBeNull()
  })

  it('AC-017.2: bitFields가 없거나 비면 표시가 없다(지금 모양 그대로)', () => {
    setup({ cashIn: '125000' })
    expect(tdOf('cashIn').classList.contains(s.bit)).toBe(false)
    cleanup()
    setup({ cashIn: '125000' }, { bitFields: [] })
    expect(tdOf('cashIn').classList.contains(s.bit)).toBe(false)
    expect(field('cashIn').getAttribute('aria-describedby')).toBeNull()
  })

  it('AC-017.2: 합계에서 빠진 비트 칸은 설명 줄과 "합계에서 빠졌어요"를 함께 가리킨다', () => {
    setup({ cashIn: EXCLUDED_TEXT }, { bitFields: ['cashIn'] })
    expect(field('cashIn').getAttribute('aria-describedby')).toBe(`${BIT_LEGEND_ID} worklog-flag-cashIn`)
  })

  it('AC-017.2: 보기만(터치 기기)에서도 저장된 표시가 보인다', () => {
    setup({ cashIn: '125000' }, { bitFields: ['cashIn'], readOnly: true })
    expect(tdOf('cashIn').classList.contains(s.bit)).toBe(true)
  })

  it('AC-017.2: 표시는 칸 오른쪽 위 세모(--xl-focus)이고 칸을 가리지 않는다(sheet.module.css)', () => {
    const screenCss = css().slice(0, css().search(/@media\s+print\s*\{/))
    const rule = screenCss.match(/\.sheet td\.bit::after\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(rule).toMatch(/content:\s*""/)
    expect(rule).toMatch(/position:\s*absolute/)
    expect(rule).toMatch(/top:\s*0/)
    expect(rule).toMatch(/right:\s*0/)
    expect(rule).toMatch(/pointer-events:\s*none/)
    expect(rule).toMatch(/border-color:\s*transparent var\(--xl-focus\) transparent transparent/)
  })

  it('AC-017.2·AC-011.3: 인쇄에는 표시가 없다(@media print에서 세모를 그리지 않는다)', () => {
    const printCss = css().slice(css().search(/@media\s+print\s*\{/))
    expect(printCss).toMatch(/\.sheet td\.bit::after\s*\{\s*content:\s*none;?\s*\}/)
  })
})
