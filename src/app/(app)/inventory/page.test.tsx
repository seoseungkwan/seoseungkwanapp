// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen, within } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { lastCountDay, listCountLines, listReceiptLines, loadInventory } from '@/lib/storage/inventory'
import type { InvInventory, InvItem } from '@/types/inventory'
import InventoryPage, { dynamic, metadata } from './page'

// /inventory 재고 탭 (spec inventory REQ-7512 AC-7512.1·AC-7512.3, design.md 6절 TASK-15). 문지기와 앱 틀은 (app)/layout이 준다.
// 준비 중 화면이 아니라 진짜 재고 화면(InventoryScreen)이 요청 때의 한국 날짜로 열린다. 도구 부품은 진짜이고 저장 모듈만 가짜다(진짜 Supabase에 붙지 않는다)
const search = vi.hoisted(() => ({ value: '' }))
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(search.value),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/lib/storage/inventory', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/storage/inventory')>()
  return {
    ...real,
    loadInventory: vi.fn(),
    lastCountDay: vi.fn(),
    listCountLines: vi.fn(),
    listReceiptLines: vi.fn(),
    listReceipts: vi.fn(async () => []),
    listAliases: vi.fn(async () => []),
  }
})

const item = (over: Partial<InvItem> & Pick<InvItem, 'id' | 'name'>): InvItem => ({
  categoryId: 'c1',
  unit: '개',
  minQty: null,
  qty: 0,
  lastCountQty: null,
  lastCountedAt: null,
  expiry: null,
  vendor: null,
  unitPrice: null,
  bitCode: null,
  sortOrder: 0,
  hidden: false,
  orderedAt: null,
  ...over,
})
// 지어낸 물품 둘: 하나는 최소 수량보다 적어 '주문하세요'
const INVENTORY: InvInventory = {
  categories: [{ id: 'c1', name: '약품', sortOrder: 0 }],
  items: [item({ id: 'a', name: '히알루론산 주사 2mL', qty: 4, minQty: 10 }), item({ id: 'b', name: '알코올 솜', unit: '통', qty: 8, minQty: 2, sortOrder: 1 })],
}

const SOURCE = readFileSync(join(process.cwd(), 'src/app/(app)/inventory/page.tsx'), 'utf8')

beforeEach(() => {
  search.value = ''
  vi.mocked(loadInventory).mockReset()
  vi.mocked(loadInventory).mockResolvedValue(INVENTORY)
  vi.mocked(lastCountDay).mockReset()
  vi.mocked(lastCountDay).mockResolvedValue(null)
  vi.mocked(listCountLines).mockReset()
  vi.mocked(listCountLines).mockResolvedValue([])
  vi.mocked(listReceiptLines).mockReset()
  vi.mocked(listReceiptLines).mockResolvedValue([])
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('/inventory 페이지', () => {
  it('AC-7512.1: 탭 이름은 "재고"이고 날짜는 요청 때 계산한다(force-dynamic)', () => {
    expect(metadata).toEqual({ title: '재고' })
    expect(dynamic).toBe('force-dynamic')
  })

  it('AC-7512.1: 소스는 준비 중 화면이 아니라 InventoryScreen에 todayInKorea()를 넘긴다', () => {
    expect(SOURCE).not.toMatch(/NotReadyScreen|notReadyFeature/)
    expect(SOURCE).toMatch(/from '@\/components\/inventory\/InventoryScreen'/)
    expect(SOURCE).toMatch(/<InventoryScreen today=\{todayInKorea\(\)\} \/>/)
    expect(SOURCE).not.toMatch(/supabase|guard\.server|\bfetch\s*\(/)
  })

  it('AC-7512.1: 서버 그림의 h1은 "재고" 하나이고 준비 중 글자가 없다', () => {
    const html = renderToStaticMarkup(<InventoryPage />)
    expect([...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => m[1])).toEqual(['재고'])
    expect(html).not.toContain('준비 중')
    expect(html).not.toContain('대시보드로 돌아가기')
  })

  it('AC-7512.1·AC-7512.3: 브라우저에서 처음은 목록 도구 — 맨 위 챙길 것(주문하세요 1) 다음 물품 목록이다', async () => {
    render(<InventoryPage />)
    const alerts = await screen.findByRole('region', { name: '챙길 것' })
    expect(await within(alerts).findByText('히알루론산 주사 2mL')).toBeTruthy()
    const list = await screen.findByRole('heading', { name: '물품 목록' })
    expect(alerts.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['재고'])
    expect(document.body.textContent).not.toContain('준비 중이에요')
  })

  it('AC-7512.1: 한국 자정 경계 — UTC 10월 31일 15:30(한국 11월 1일 00:30)이면 세기의 센 날 기본값은 2026-11-01이다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-31T15:30:00Z'))
    search.value = '?tool=count'
    render(<InventoryPage />)
    const day = (await screen.findByLabelText('센 날')) as HTMLInputElement
    expect(day.value).toBe('2026-11-01')
    expect(day.max).toBe('2026-11-01')
    expect(screen.queryByRole('region', { name: '챙길 것' })).toBeNull()
  })
})
