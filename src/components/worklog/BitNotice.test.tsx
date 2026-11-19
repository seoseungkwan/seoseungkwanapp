// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RoleProvider } from '@/components/shell/role'
import { ds } from '@/components/ui/classes'
import type { BitDiffer } from '@/lib/worklog/bitFill'
import { emptyWorklogDay, type WorklogDay, type WorklogNumberKey } from '@/types/worklog'
import { BIT_LEGEND_ID, BitNotice, BitSheetNotes } from './BitNotice'
import type { BitFillStatus } from './useBitFill'

// 비트 안내 줄·[지금 불러오기]·설명 줄·'다름' 목록 (worklog REQ-017, design.md 20-5절, 시안 docs/mockups/worklog/bitfill.html v2).
// 그리기만 한다. 숫자는 둥근 가짜 값이고 "가상" 글자다
const AT_1420 = new Date('2026-11-05T05:20:00Z') // 한국 시각 14:20

const TEXT = {
  notConnected: '비트 PC가 연결되지 않아 직접 적어요',
  setup: '비트 PC 연결을 마치면 숫자를 저절로 채워요',
  reading: '비트 숫자를 불러오는 중이에요',
  failed: '비트 숫자를 불러오지 못했어요. 직접 적어도 돼요',
  unconfirmed: '이 날은 비트 금액을 채우지 못했어요. 금액은 직접 적어 주세요', // bit-total AC-6910.2
}

const dayWith = (cells: Partial<WorklogDay> = {}): WorklogDay => ({ ...emptyWorklogDay(), ...cells })

function line(status: BitFillStatus, lastReadAt: Date | null = AT_1420) {
  const onReload = vi.fn()
  const view = render(<BitNotice status={status} lastReadAt={lastReadAt} onReload={onReload} />)
  return { onReload, root: view.container.firstElementChild as HTMLElement | null }
}

function notes(props: { day?: WorklogDay; bitFields?: WorklogNumberKey[]; differs?: BitDiffer[] }) {
  const onTake = vi.fn()
  const view = render(<BitSheetNotes day={props.day ?? dayWith()} bitFields={props.bitFields ?? []} differs={props.differs ?? []} onTake={onTake} />)
  return { onTake, root: view.container.firstElementChild as HTMLElement | null }
}

const loadButton = () => screen.queryByRole<HTMLButtonElement>('button', { name: /지금 불러오기|불러오는 중/ })
const rowTexts = () => screen.queryAllByRole('listitem').map((item) => item.firstElementChild?.textContent)
const printHidden = (el: Element | null) => el?.classList.contains('print:hidden') === true
// 공용 아이콘 그림(Icon.tsx): info는 r=6 원, reload는 M13.33 8에서 시작하는 호
const isInfo = (el: Element | null | undefined) => el?.tagName.toLowerCase() === 'svg' && el.querySelector('circle[r="6"]') !== null
const isReload = (el: Element | null | undefined) => el?.tagName.toLowerCase() === 'svg' && el.querySelector('path[d^="M13.33 8"]') !== null

afterEach(cleanup)

describe('AC-017.9 날짜 줄 아래 한 줄 (BitNotice)', () => {
  it('AC-017.9: ready면 왼쪽 "비트 숫자를 14:20에 불러왔어요"(마지막 성공 읽기의 한국 시각), 오른쪽 [지금 불러오기]이고 누르면 onReload다', () => {
    const { onReload } = line('ready')
    expect(screen.getByText('비트 숫자를 14:20에 불러왔어요')).toBeTruthy()
    const button = loadButton()!
    expect(button.textContent).toBe('지금 불러오기')
    expect(button.disabled).toBe(false)
    expect(button.className).toBe(ds.button.secondarySmall)
    fireEvent.click(button)
    expect(onReload).toHaveBeenCalledTimes(1)
  })

  it('AC-017.9: reading이면 "비트 숫자를 불러오는 중이에요"이고 단추는 눌리지 않는 "불러오는 중"이다', () => {
    const { onReload } = line('reading', null)
    expect(screen.getByText(TEXT.reading)).toBeTruthy()
    const button = loadButton()!
    expect(button.textContent).toBe('불러오는 중')
    expect(button.disabled).toBe(true)
    fireEvent.click(button)
    expect(onReload).not.toHaveBeenCalled()
  })

  it.each([
    ['unconfirmed', TEXT.unconfirmed],
    ['failed', TEXT.failed],
  ] as const)('AC-017.4·AC-017.9: %s면 그 안내 글과 [지금 불러오기]가 한 줄에 있다', (status, text) => {
    const { onReload } = line(status)
    expect(screen.getByText(text)).toBeTruthy()
    expect(screen.queryByText(/에 불러왔어요$/)).toBeNull()
    fireEvent.click(loadButton()!)
    expect(onReload).toHaveBeenCalledTimes(1)
  })

  it('AC-6910.2: unconfirmed 안내는 "이 날은 비트 금액을 채우지 못했어요. 금액은 직접 적어 주세요"이고 옛 "확인이 필요해요" 글은 없다', () => {
    line('unconfirmed')
    expect(screen.getByText('이 날은 비트 금액을 채우지 못했어요. 금액은 직접 적어 주세요')).toBeTruthy()
    expect(screen.queryByText(/확인이 필요해요/)).toBeNull()
    expect(loadButton()?.textContent).toBe('지금 불러오기')
  })

  it('AC-017.4·AC-017.9: 연결 안 됨은 "비트 PC가 연결되지 않아 직접 적어요"만 있고 단추·링크가 없다', () => {
    line('not-connected')
    expect(screen.getByText(TEXT.notConnected)).toBeTruthy()
    expect(loadButton()).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('AC-017.4·AC-017.9: 확장/도우미 없음·옛 판은 "비트 PC 연결을 마치면 숫자를 저절로 채워요" 끝에 글자 링크 "연결하러 가기"(/claim/setup)이고 단추가 없다', () => {
    line('setup-needed')
    expect(screen.getByText(TEXT.setup)).toBeTruthy()
    const link = screen.getByRole('link', { name: '연결하러 가기' })
    expect(link.getAttribute('href')).toBe('/claim/setup')
    expect(link.parentElement?.lastElementChild).toBe(link)
    expect(loadButton()).toBeNull()
  })

  it('AC-017.5·AC-017.9: 터치 기기(off)면 아무 줄도 그리지 않는다', () => {
    const { root } = line('off')
    expect(root).toBeNull()
    expect(loadButton()).toBeNull()
  })

  it.each(['reading', 'ready', 'unconfirmed', 'failed', 'not-connected', 'setup-needed'] as const)(
    'AC-017.9: %s의 안내 줄은 글 앞에 info 아이콘(16·text-muted·shrink-0)이 있다',
    (status) => {
      line(status)
      const text = screen.getByText(/비트|이 날은/)
      const icon = text.previousElementSibling
      expect(isInfo(icon)).toBe(true)
      expect(icon?.getAttribute('width')).toBe('16')
      for (const name of ['text-muted', 'shrink-0']) expect(icon?.classList.contains(name), name).toBe(true)
    },
  )

  it.each(['reading', 'ready', 'unconfirmed', 'failed'] as const)('AC-017.9: %s의 단추는 글자 앞에 reload 아이콘(16)이 있다(읽는 중에도 그대로)', (status) => {
    line(status)
    const button = loadButton()!
    expect(isReload(button.firstElementChild)).toBe(true)
    expect(button.firstElementChild?.getAttribute('width')).toBe('16')
  })

  it.each(['reading', 'ready', 'unconfirmed', 'failed', 'not-connected', 'setup-needed'] as const)(
    'AC-017.9·AC-011.3: %s의 줄 전체가 인쇄에서 숨는다(print:hidden)',
    (status) => {
      const { root } = line(status)
      expect(printHidden(root)).toBe(true)
    },
  )

  it('AC-017.9: 안내 글은 모두 "~요"로 끝난다', () => {
    for (const text of [...Object.values(TEXT), '비트 숫자를 14:20에 불러왔어요']) expect(text.endsWith('요'), text).toBe(true)
  })
})

describe('AC-017.2 설명 줄', () => {
  it('AC-017.2: 비트 칸이 있으면 "표시한 칸은 비트에서 불러온 숫자예요" 한 줄(칸이 가리키는 id)이 있고 인쇄에서 숨는다', () => {
    const { root } = notes({ bitFields: ['cashIn'] })
    const legend = screen.getByText('표시한 칸은 비트에서 불러온 숫자예요')
    expect(legend.closest(`#${BIT_LEGEND_ID}`)).not.toBeNull()
    expect(printHidden(root)).toBe(true)
  })

  it('AC-017.2: 비트 칸도 다른 칸도 없으면 아무것도 그리지 않는다', () => {
    const { root } = notes({})
    expect(root).toBeNull()
  })
})

describe('AC-017.3 비트 숫자와 다른 칸 목록', () => {
  const differs: BitDiffer[] = [
    { key: 'newPatients', typed: '11', bit: 12 },
    { key: 'cashIn', typed: '120,000 별도', bit: 125000 },
    { key: 'cardIn', typed: '300000', bit: 0 },
  ]

  it('AC-017.3: 제목 "비트 숫자와 다른 칸이 있어요" 밑 목록에 칸 이름·적은 글자·비트 값이 있다(신환·재진은 숫자만, 금액은 쉼표와 원, 0은 0원)', () => {
    notes({ day: dayWith({ newPatients: '11', cashIn: '120,000 별도', cardIn: '300000' }), differs })
    const title = screen.getByText('비트 숫자와 다른 칸이 있어요')
    expect(screen.getByRole('list').getAttribute('aria-labelledby')).toBe(title.id)
    expect(rowTexts()).toEqual(['신환 · 적은 값 11 · 비트 12', '현금수납 · 적은 값 120,000 별도 · 비트 125,000원', '카드수납 · 적은 값 300,000원 · 비트 0원'])
  })

  it('AC-017.3: 칸 이름은 그날 항목 이름이고, 비어 있으면 기본 이름이다', () => {
    notes({ day: dayWith({ nameCashIn: '가상 현금', cashIn: '120000' }), differs: [{ key: 'cashIn', typed: '120000', bit: 125000 }] })
    expect(rowTexts()).toEqual(['가상 현금 · 적은 값 120,000원 · 비트 125,000원'])
  })

  it('AC-017.3: 줄마다 [비트 숫자로 바꾸기](작은 보조 단추, 칸 이름을 담은 이름)가 있고 누르면 그 칸으로 onTake다', () => {
    const { onTake } = notes({ day: dayWith({ newPatients: '11', cashIn: '120,000 별도', cardIn: '300000' }), differs })
    const take = screen.getByRole('button', { name: '현금수납 칸을 비트 숫자로 바꾸기' })
    expect(take.textContent).toBe('비트 숫자로 바꾸기')
    expect(take.className).toBe(ds.button.secondarySmall)
    fireEvent.click(take)
    expect(onTake).toHaveBeenCalledWith('cashIn')
    expect(screen.getAllByRole('button', { name: /칸을 비트 숫자로 바꾸기$/ })).toHaveLength(3)
  })

  it('AC-017.3·AC-011.3: 목록과 그 단추도 인쇄에서 숨고, 다른 칸이 없으면 목록이 없다', () => {
    const { root } = notes({ bitFields: ['cashIn'], day: dayWith({ newPatients: '11' }), differs: [differs[0]] })
    expect(printHidden(root)).toBe(true)
    expect(root?.contains(screen.getByText('비트 숫자와 다른 칸이 있어요'))).toBe(true)
    cleanup()
    notes({ bitFields: ['cashIn'] })
    expect(screen.queryByText('비트 숫자와 다른 칸이 있어요')).toBeNull()
    expect(screen.queryByRole('list')).toBeNull()
  })
})

// desk-feedback AC-6306.4: 데스크는 비트 PC 연결 화면(/claim/setup)을 못 연다 → 그리로 가는 링크만 숨기고 나머지는 그대로
describe('AC-6306.4 데스크 — 연결 링크 숨김', () => {
  const deskLine = (status: BitFillStatus, desk = true) => {
    const onReload = vi.fn()
    render(
      <RoleProvider desk={desk}>
        <BitNotice status={status} lastReadAt={AT_1420} onReload={onReload} />
      </RoleProvider>,
    )
    return { onReload }
  }

  it('AC-6306.4: 데스크면 setup-needed 안내 글은 그대로이고 "연결하러 가기"(/claim/setup) 링크가 없다', () => {
    deskLine('setup-needed')
    expect(screen.getByText(TEXT.setup)).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByText('연결하러 가기')).toBeNull()
    expect(document.querySelector('a[href="/claim/setup"]')).toBeNull()
    expect(loadButton()).toBeNull()
  })

  it.each([
    ['ready', '비트 숫자를 14:20에 불러왔어요'],
    ['failed', TEXT.failed],
    ['unconfirmed', TEXT.unconfirmed],
  ] as const)('AC-6306.4: 데스크도 %s의 글과 [지금 불러오기]는 그대로다', (status, text) => {
    const { onReload } = deskLine(status)
    expect(screen.getByText(text)).toBeTruthy()
    fireEvent.click(loadButton()!)
    expect(onReload).toHaveBeenCalledTimes(1)
  })

  it('AC-6306.4: 원장(RoleProvider desk={false})은 지금처럼 "연결하러 가기"(/claim/setup) 링크가 있다', () => {
    deskLine('setup-needed', false)
    expect(screen.getByRole('link', { name: '연결하러 가기' }).getAttribute('href')).toBe('/claim/setup')
  })
})
