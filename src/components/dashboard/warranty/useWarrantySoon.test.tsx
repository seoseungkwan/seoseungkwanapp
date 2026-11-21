// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ContactsStorageError, listWarrantySoon } from '@/lib/storage/contacts'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { WarrantyItem } from '@/types/contacts'
import { useWarrantySoon, WARRANTY_READ_TIMEOUT_MS } from './useWarrantySoon'

// 대시보드 무상 수리 알림 읽기 훅 (contacts REQ-6507, design.md '대시보드 알림'). 저장 함수(listWarrantySoon)와 Supabase 클라이언트는 잡아 두고
// 답을 시험이 정한다. 진짜 Supabase에 붙지 않는다. 업체·장비는 모두 지어낸 값이다
vi.mock('@/lib/storage/contacts', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/storage/contacts')>()
  return { ...real, listWarrantySoon: vi.fn() }
})
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: vi.fn() }))

const TODAY = '2026-11-21'
const CLIENT = { from: vi.fn(), rpc: vi.fn() } as unknown as SupabaseClient
const ITEMS: WarrantyItem[] = [
  { equipmentId: 'e-server', companyId: 'c-pc', companyName: '예시전산', name: '원내 서버 PC', warrantyUntil: '2026-11-21' },
  { equipmentId: 'e-shock', companyId: 'c-medi', companyName: '예시메디칼', name: '충격파 기계', warrantyUntil: '2026-12-03' },
]

// ── 잡아 둔 읽기: 부른 차례대로 쌓이고, 시험이 답을 준다 ──
type Held = { client: unknown; today: string; resolve(items: WarrantyItem[]): void; reject(error: unknown): void }
const held: Held[] = []
const answer = (items: WarrantyItem[], i = held.length - 1) =>
  act(async () => {
    held[i]!.resolve(items)
  })
const fail = (error: unknown, i = held.length - 1) =>
  act(async () => {
    held[i]!.reject(error)
  })
const wait = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
const flush = () => act(async () => {})
const draw = (today = TODAY) => renderHook(({ day }) => useWarrantySoon(day), { initialProps: { day: today } })

const consoleSpies = () => ['error', 'warn', 'log', 'info', 'debug'].map((name) => vi.spyOn(console, name as 'error'))

beforeEach(() => {
  held.length = 0
  vi.mocked(supabaseBrowser).mockReset()
  vi.mocked(supabaseBrowser).mockReturnValue(CLIENT)
  vi.mocked(listWarrantySoon).mockReset()
  vi.mocked(listWarrantySoon).mockImplementation(
    (client, today) =>
      new Promise<WarrantyItem[]>((resolve, reject) => {
        held.push({ client, today, resolve, reject })
      }),
  )
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useWarrantySoon: 한 번 읽기 (AC-6507.1)', () => {
  it('AC-6507.1: 처음 한 번 supabaseBrowser()의 클라이언트와 받은 오늘로 listWarrantySoon을 부르고, 답의 줄을 그대로 돌려준다(그 전에는 빈 목록)', async () => {
    const { result } = draw()
    expect(result.current).toEqual([])
    await flush()
    expect(listWarrantySoon).toHaveBeenCalledTimes(1)
    expect(held.map((h) => [h.client, h.today])).toEqual([[CLIENT, TODAY]])
    await answer(ITEMS)
    expect(result.current).toEqual(ITEMS)
  })

  it('AC-6507.1: 10초 한도 안에 온 답은 쓴다', async () => {
    expect(WARRANTY_READ_TIMEOUT_MS).toBe(10_000)
    const { result } = draw()
    await flush()
    await wait(WARRANTY_READ_TIMEOUT_MS - 1)
    await answer(ITEMS)
    expect(result.current).toEqual(ITEMS)
  })

  it('AC-6507.2: 다시 그려도·오늘이 바뀌어도 다시 읽지 않는다(다음에 대시보드를 열 때 새로 읽음)', async () => {
    const { result, rerender, unmount } = draw()
    await flush()
    await answer(ITEMS)
    rerender({ day: TODAY })
    rerender({ day: '2026-11-22' })
    await flush()
    expect(listWarrantySoon).toHaveBeenCalledTimes(1)
    expect(result.current).toEqual(ITEMS)
    // 대시보드를 떠났다가 다시 열면 그때 새로 읽는다
    unmount()
    draw('2026-11-22')
    await flush()
    expect(held.map((h) => h.today)).toEqual([TODAY, '2026-11-22'])
  })
})

describe('useWarrantySoon: 조용히 비움 (AC-6507.2)', () => {
  it('AC-6507.2: 10초 한도를 넘기면 빈 목록이고, 한도 뒤 늦게 온 답은 버린다', async () => {
    const { result } = draw()
    await flush()
    await wait(WARRANTY_READ_TIMEOUT_MS)
    expect(result.current).toEqual([])
    await answer(ITEMS)
    expect(result.current).toEqual([])
  })

  it.each([
    ['ContactsStorageError offline', new ContactsStorageError('offline')],
    ['ContactsStorageError failed', new ContactsStorageError('failed')],
    ['그 밖의 던짐', new Error('알 수 없는 실패')],
  ])('AC-6507.2: 읽기 실패(%s)면 빈 목록이고, 오류를 밖으로 던지지 않으며 console을 쓰지 않는다', async (_name, error) => {
    const spies = consoleSpies()
    const { result } = draw()
    await flush()
    await fail(error)
    await wait(WARRANTY_READ_TIMEOUT_MS)
    expect(result.current).toEqual([])
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })

  it('AC-6507.2: supabaseBrowser가 던지면(Supabase 설정 없음) 읽지 않고 빈 목록이다', async () => {
    const spies = consoleSpies()
    vi.mocked(supabaseBrowser).mockImplementation(() => {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL이 비었어요')
    })
    const { result } = draw()
    await flush()
    await wait(WARRANTY_READ_TIMEOUT_MS)
    expect(listWarrantySoon).not.toHaveBeenCalled()
    expect(result.current).toEqual([])
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })

  it('AC-6507.2: 클라이언트에 from이 없으면(다른 시험이 { auth }만 흉내 냄) 읽지 않고 빈 목록이다', async () => {
    vi.mocked(supabaseBrowser).mockReturnValue({ auth: { signOut: vi.fn() } } as unknown as SupabaseClient)
    const { result } = draw()
    await flush()
    await wait(WARRANTY_READ_TIMEOUT_MS)
    expect(listWarrantySoon).not.toHaveBeenCalled()
    expect(result.current).toEqual([])
  })

  it('AC-6507.2: 떠난 뒤 온 답은 쓰지 않는다(오류·console 없음)', async () => {
    const spies = consoleSpies()
    const { result, unmount } = draw()
    await flush()
    unmount()
    await answer(ITEMS)
    expect(result.current).toEqual([])
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })
})

describe('useWarrantySoon: 소스 (AC-6507.2)', () => {
  const text = () => readFileSync(join(process.cwd(), 'src/components/dashboard/warranty/useWarrantySoon.ts'), 'utf8')

  it("AC-6507.2: 'use client' 훅이고, 읽기는 listWarrantySoon 하나·클라이언트는 supabaseBrowser뿐이다 — console·fetch·브라우저 저장소가 없다", () => {
    const source = text()
    expect(source).toMatch(/^'use client'/)
    expect(source).toMatch(/import \{[^}]*\blistWarrantySoon\b[^}]*\} from '@\/lib\/storage\/contacts'/)
    expect(source).toMatch(/import \{[^}]*\bsupabaseBrowser\b[^}]*\} from '@\/lib\/supabase\/browser'/)
    expect(source).not.toMatch(/console\.|\bfetch\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|indexedDB|document\.cookie/)
    expect(source).not.toMatch(/loadContacts|contacts_companies|contacts_equipment|\.from\(/)
  })
})
