// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { errorInfo } from '@/lib/errors'
import { downloadTemplate } from './ExcelImport'
import { INVENTORY_TOOLS, InventoryScreen, inventoryToolFrom, inventoryToolHref } from './InventoryScreen'

// 재고 화면 조립 (spec inventory REQ-7512 AC-7512.3, design.md 6절 TASK-15, 시안 docs/mockups/inventory ?s=list·count·in-list·month·excel·bit).
// 도구 부품은 저마다 시험이 있다 → 여기서는 가짜로 바꿔, 화면이 받은 props(today·reloadKey·alerts·startManual)와
// 부품이 부르는 되부름(onTemplate·onUpload·onBitPick·onManualReceipt·onChanged·onDone·onCancel·onAdded·onClose)을 어떻게 잇는지만 본다.
// 주소 ?tool=은 next/navigation 가짜(useSearchParams·useRouter.push)가 들고, push하면 화면이 새 주소로 다시 그린다

const nav = vi.hoisted(() => {
  let search = ''
  const listeners = new Set<() => void>()
  return {
    get: () => search,
    set(next: string) {
      search = next
      for (const listener of listeners) listener()
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    push: vi.fn(),
  }
})
vi.mock('next/navigation', async () => {
  const { useSyncExternalStore } = await import('react')
  return {
    useSearchParams: () => new URLSearchParams(useSyncExternalStore(nav.subscribe, nav.get, nav.get)),
    useRouter: () => ({ push: nav.push, replace: vi.fn() }),
  }
})

// 가짜 도구: 받은 값은 data-* 로, 되부름은 단추로 내놓는다. 마운트 수는 mounts가 센다
const mounts = vi.hoisted(() => ({ count: 0 }))
vi.mock('./ItemsTool', () => ({
  ItemsTool: (p: {
    today: string
    reloadKey?: number
    onChanged?: () => void
    alerts?: React.ReactNode
    onTemplate?: () => void
    onUpload?: (file: File) => void
    onBitPick?: () => void
  }) => (
    <div data-testid="items" data-today={p.today} data-reload={p.reloadKey}>
      <div data-testid="items-alerts">{p.alerts}</div>
      <h2>물품 목록</h2>
      <button type="button" onClick={() => p.onTemplate?.()}>
        양식 받기
      </button>
      <button type="button" onClick={() => p.onUpload?.(new File(['x'], '재고.xlsx'))}>
        엑셀 올리기
      </button>
      <button type="button" onClick={() => p.onBitPick?.()}>
        비트 코드에서 고르기
      </button>
      <button type="button" onClick={() => p.onChanged?.()}>
        목록 저장
      </button>
    </div>
  ),
}))
vi.mock('./AlertBar', () => ({
  AlertBar: (p: { today: string; reloadKey?: number; onChanged?: () => void }) => (
    <section data-testid="alerts" data-today={p.today} data-reload={p.reloadKey}>
      <h2>챙길 것</h2>
      <button type="button" onClick={() => p.onChanged?.()}>
        주문함
      </button>
    </section>
  ),
}))
vi.mock('./CountTool', async () => {
  const { useEffect } = await import('react')
  return {
    CountTool: (p: { today: string; reloadKey?: number; onChanged?: () => void; onManualReceipt?: () => void }) => {
      useEffect(() => {
        mounts.count += 1
      }, [])
      return (
        <div data-testid="count" data-today={p.today} data-reload={p.reloadKey}>
          <h2>수량 세기</h2>
          <button type="button" onClick={() => p.onManualReceipt?.()}>
            입고 적기
          </button>
          <button type="button" onClick={() => p.onChanged?.()}>
            세기 저장
          </button>
        </div>
      )
    },
  }
})
vi.mock('./ReceiptsTool', () => ({
  ReceiptsTool: (p: { today: string; startManual?: boolean; onChanged?: () => void }) => (
    <div data-testid="receipts" data-today={p.today} data-manual={String(p.startManual === true)}>
      <h2>들어온 기록</h2>
      <button type="button" onClick={() => p.onChanged?.()}>
        입고 저장
      </button>
    </div>
  ),
}))
vi.mock('./MonthlyTool', () => ({
  MonthlyTool: (p: { today: string }) => (
    <div data-testid="month" data-today={p.today}>
      <h2>달별</h2>
    </div>
  ),
}))
vi.mock('./ExcelImport', () => ({
  downloadTemplate: vi.fn(),
  ExcelPreview: (p: { file: File; onDone: () => void; onCancel: () => void }) => (
    <div data-testid="excel" data-file={p.file.name}>
      <h2>엑셀로 물품 넣기</h2>
      <button type="button" onClick={p.onDone}>
        넣기
      </button>
      <button type="button" onClick={p.onCancel}>
        취소
      </button>
    </div>
  ),
}))
vi.mock('./BitCodePicker', () => ({
  BitCodePicker: (p: { onAdded: () => void; onClose: () => void }) => (
    <div role="dialog" aria-label="비트 코드에서 고르기 판">
      <button
        type="button"
        onClick={() => {
          p.onAdded()
          p.onClose()
        }}
      >
        2개 더하기
      </button>
      <button type="button" onClick={p.onClose}>
        닫기
      </button>
    </div>
  ),
}))

const TODAY = '2026-11-21'
const template = vi.mocked(downloadTemplate)

const draw = (search = '') => {
  nav.set(search)
  return render(<InventoryScreen today={TODAY} />)
}
const tool = (id: string) => screen.queryByTestId(id)
const reloadOf = (id: string) => Number(screen.getByTestId(id).getAttribute('data-reload'))
const toolNav = () => screen.getByRole('navigation', { name: '재고 도구' })
const button = (name: string) => screen.getByRole('button', { name })
const go = (search: string) =>
  act(() => {
    nav.set(search)
  })

beforeEach(() => {
  mounts.count = 0
  nav.push.mockReset()
  nav.push.mockImplementation((href: string) => nav.set(new URL(href, 'http://localhost').search))
  template.mockReset()
  template.mockResolvedValue(true)
})

afterEach(() => {
  cleanup()
})

describe('AC-7512.3: 재고 화면 짜임 — h1 → 도구 단추 줄 → 고른 도구', () => {
  it('AC-7512.1·AC-7512.3: h1은 "재고" 하나이고 그 아래 도구 단추 줄(목록·세기·들어온 기록·달별), 그 아래 도구 자리다', () => {
    draw()
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['재고'])
    const links = within(toolNav()).getAllByRole('link')
    expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['목록', '/inventory?tool=list'],
      ['세기', '/inventory?tool=count'],
      ['들어온 기록', '/inventory?tool=in'],
      ['달별', '/inventory?tool=month'],
    ])
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1.compareDocumentPosition(toolNav()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(toolNav().compareDocumentPosition(tool('items')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // 시안 아이콘: 목록 doc · 세기 check · 들어온 기록 arrowDown · 달별 cal
    expect(INVENTORY_TOOLS.map((t) => [t.id, t.label, t.icon])).toEqual([
      ['list', '목록', 'doc'],
      ['count', '세기', 'check'],
      ['in', '들어온 기록', 'arrowDown'],
      ['month', '달별', 'cal'],
    ])
  })

  it.each([
    ['', 'items', '목록'],
    ['?tool=list', 'items', '목록'],
    ['?tool=count', 'count', '세기'],
    ['?tool=in', 'receipts', '들어온 기록'],
    ['?tool=month', 'month', '달별'],
    ['?tool=nope', 'items', '목록'],
    ['?tool=count&tool=in', 'items', '목록'],
  ])('AC-7512.3: 주소 "%s" → 도구 %s, 도구 단추 [%s]만 aria-current="page"', (search, id, label) => {
    draw(search)
    for (const other of ['items', 'count', 'receipts', 'month']) {
      if (other === id) expect(tool(other), other).not.toBeNull()
      else expect(tool(other), other).toBeNull()
    }
    expect(screen.getByTestId(id).getAttribute('data-today')).toBe(TODAY)
    const current = within(toolNav())
      .getAllByRole('link')
      .filter((a) => a.getAttribute('aria-current') === 'page')
    expect(current.map((a) => a.textContent)).toEqual([label])
  })

  it('AC-7512.3: inventoryToolFrom·inventoryToolHref — 모르는 값·여러 값·없음은 목록, 주소는 /inventory?tool=…', () => {
    expect(inventoryToolFrom([])).toBe('list')
    expect(inventoryToolFrom(['count'])).toBe('count')
    expect(inventoryToolFrom(['in'])).toBe('in')
    expect(inventoryToolFrom(['month'])).toBe('month')
    expect(inventoryToolFrom(['x'])).toBe('list')
    expect(inventoryToolFrom(['count', 'in'])).toBe('list')
    expect(inventoryToolHref('in')).toBe('/inventory?tool=in')
  })

  it('AC-7512.3: 주소가 바뀌면(도구 단추) 그 도구로 바뀐다', () => {
    draw()
    expect(tool('items')).not.toBeNull()
    go('?tool=month')
    expect(tool('items')).toBeNull()
    expect(tool('month')).not.toBeNull()
  })
})

describe('AC-7512.3: 챙길 것은 목록 도구 맨 위에만', () => {
  it('AC-7512.3: 목록 도구는 ItemsTool의 alerts 자리에 AlertBar(today)를 받는다', () => {
    draw()
    const alerts = within(screen.getByTestId('items-alerts')).getByTestId('alerts')
    expect(alerts.getAttribute('data-today')).toBe(TODAY)
    expect(screen.getAllByTestId('alerts')).toHaveLength(1)
  })

  it.each(['?tool=count', '?tool=in', '?tool=month'])('AC-7512.3: %s에는 챙길 것이 없다', (search) => {
    draw(search)
    expect(screen.queryByTestId('alerts')).toBeNull()
    expect(screen.queryByText('챙길 것')).toBeNull()
  })
})

describe('AC-7512.3: [양식 받기]·[엑셀 올리기]', () => {
  it('AC-7509.1·AC-7512.3: [양식 받기]는 downloadTemplate을 부르고, 성공하면 오류 카드가 없다', async () => {
    const user = userEvent.setup()
    draw()
    await user.click(button('양식 받기'))
    expect(template).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-7512.3: downloadTemplate이 거짓이면 E-INV-READ-FAILED 오류 카드가 목록 자리 위에 보이고, 다시 눌러 성공하면 거둔다', async () => {
    const user = userEvent.setup()
    template.mockResolvedValueOnce(false)
    draw()
    await user.click(button('양식 받기'))
    const card = screen.getByRole('alert')
    expect(card.textContent).toContain(errorInfo('E-INV-READ-FAILED').what)
    expect(card.compareDocumentPosition(tool('items')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await user.click(button('양식 받기'))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-7512.3: [엑셀 올리기]로 고른 파일은 목록 자리(챙길 것 포함)에 엑셀 미리 보기를 연다 — [넣기] 뒤 목록으로 돌아와 다시 읽는다', async () => {
    const user = userEvent.setup()
    draw()
    const before = { items: reloadOf('items'), alerts: reloadOf('alerts') }
    await user.click(button('엑셀 올리기'))
    expect(screen.getByTestId('excel').getAttribute('data-file')).toBe('재고.xlsx')
    expect(tool('items')).toBeNull()
    expect(screen.queryByTestId('alerts')).toBeNull()
    expect(within(toolNav()).getByRole('link', { name: '목록' }).getAttribute('aria-current')).toBe('page')
    await user.click(button('넣기'))
    expect(tool('excel')).toBeNull()
    expect(reloadOf('items')).toBeGreaterThan(before.items)
    expect(reloadOf('alerts')).toBeGreaterThan(before.alerts)
  })

  it('AC-7512.3: 엑셀 미리 보기 [취소]는 저장 없이 목록으로 돌아온다(다시 읽기 표시는 그대로)', async () => {
    const user = userEvent.setup()
    draw()
    const before = reloadOf('items')
    await user.click(button('엑셀 올리기'))
    await user.click(button('취소'))
    expect(tool('excel')).toBeNull()
    expect(reloadOf('items')).toBe(before)
  })

  it('AC-7512.3: 미리 보기를 연 채 다른 도구로 갔다 오면 미리 보기는 닫혀 있다(같은 파일을 다시 읽지 않는다)', async () => {
    const user = userEvent.setup()
    draw()
    await user.click(button('엑셀 올리기'))
    go('?tool=count')
    go('?tool=list')
    expect(tool('excel')).toBeNull()
    expect(tool('items')).not.toBeNull()
  })
})

describe('AC-7512.3·AC-7514.4: [비트 코드에서 고르기]', () => {
  it('AC-7512.3: 누르면 고르기 판을 열고, 닫으면 판이 사라지고 초점이 [비트 코드에서 고르기]로 돌아온다', async () => {
    const user = userEvent.setup()
    draw()
    expect(screen.queryByRole('dialog')).toBeNull()
    const opener = button('비트 코드에서 고르기')
    await user.click(opener)
    const dialog = screen.getByRole('dialog', { name: '비트 코드에서 고르기 판' })
    const before = reloadOf('items')
    await user.click(within(dialog).getByRole('button', { name: '닫기' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener)
    expect(reloadOf('items')).toBe(before)
  })

  it('AC-7514.4·AC-7512.3: [n개 더하기]가 성공하면(onAdded → onClose) 목록과 챙길 것을 다시 읽는다', async () => {
    const user = userEvent.setup()
    draw()
    const before = { items: reloadOf('items'), alerts: reloadOf('alerts') }
    await user.click(button('비트 코드에서 고르기'))
    await user.click(button('2개 더하기'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(reloadOf('items')).toBeGreaterThan(before.items)
    expect(reloadOf('alerts')).toBeGreaterThan(before.alerts)
    expect(document.activeElement).toBe(button('비트 코드에서 고르기'))
  })
})

describe('AC-7512.3: 세기 경고의 [입고 적기] → 들어온 기록 "사진 없이 적기"', () => {
  it('AC-7507.2·AC-7512.3: [입고 적기]는 주소를 ?tool=in으로 바꾸고 ReceiptsTool을 startManual로 연다', async () => {
    const user = userEvent.setup()
    draw('?tool=count')
    await user.click(button('입고 적기'))
    expect(nav.push).toHaveBeenCalledWith('/inventory?tool=in')
    expect(screen.getByTestId('receipts').getAttribute('data-manual')).toBe('true')
    expect(within(toolNav()).getByRole('link', { name: '들어온 기록' }).getAttribute('aria-current')).toBe('page')
  })

  it('AC-7512.3: 도구 단추로 들어온 기록에 가면 startManual이 아니다 — [입고 적기]로 연 뒤 다른 도구로 갔다 와도', async () => {
    const user = userEvent.setup()
    draw('?tool=in')
    expect(screen.getByTestId('receipts').getAttribute('data-manual')).toBe('false')
    go('?tool=count')
    await user.click(button('입고 적기'))
    expect(screen.getByTestId('receipts').getAttribute('data-manual')).toBe('true')
    go('?tool=list')
    go('?tool=in')
    expect(screen.getByTestId('receipts').getAttribute('data-manual')).toBe('false')
  })

  it('AC-7512.3: 세기에서 [입고 적기]로 갔다 돌아와도 세기 도구는 그대로다(적던 값이 남게 다시 만들지 않는다) — 입고를 저장하면 세기도 다시 읽는다', async () => {
    const user = userEvent.setup()
    draw('?tool=count')
    expect(mounts.count).toBe(1)
    const before = reloadOf('count')
    await user.click(button('입고 적기'))
    expect(screen.getByTestId('count').closest('[hidden]')).not.toBeNull()
    expect(screen.queryByRole('heading', { name: '수량 세기' })).toBeNull()
    await user.click(button('입고 저장'))
    go('?tool=count')
    expect(mounts.count).toBe(1)
    expect(screen.getByTestId('count').closest('[hidden]')).toBeNull()
    expect(reloadOf('count')).toBeGreaterThan(before)
  })
})

describe('AC-7512.3: 저장하면 목록과 챙길 것을 다시 읽는다', () => {
  it('AC-7511.2·AC-7512.3: 챙길 것 [주문함] 저장(AlertBar onChanged) → 목록(ItemsTool)을 다시 읽는다. 챙길 것은 스스로 고쳐 그려 다시 읽지 않는다', async () => {
    const user = userEvent.setup()
    draw()
    const before = { items: reloadOf('items'), alerts: reloadOf('alerts') }
    await user.click(button('주문함'))
    expect(reloadOf('items')).toBe(before.items + 1)
    expect(reloadOf('alerts')).toBe(before.alerts)
  })

  it('AC-7512.3: 목록 저장(ItemsTool onChanged) → 챙길 것(AlertBar)을 다시 읽는다. 목록은 스스로 다시 읽어 두 번 읽지 않는다', async () => {
    const user = userEvent.setup()
    draw()
    const before = { items: reloadOf('items'), alerts: reloadOf('alerts') }
    await user.click(button('목록 저장'))
    expect(reloadOf('alerts')).toBe(before.alerts + 1)
    expect(reloadOf('items')).toBe(before.items)
  })

  it('AC-7512.3: 세기 저장·입고 저장 뒤 목록으로 가면 목록·챙길 것이 다시 읽는 표시(reloadKey)가 올라 있다', async () => {
    const user = userEvent.setup()
    draw()
    const before = { items: reloadOf('items'), alerts: reloadOf('alerts') }
    go('?tool=count')
    await user.click(button('세기 저장'))
    go('?tool=in')
    await user.click(button('입고 저장'))
    go('?tool=list')
    expect(reloadOf('items')).toBe(before.items + 2)
    expect(reloadOf('alerts')).toBe(before.alerts + 2)
  })
})
