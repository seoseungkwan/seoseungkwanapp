// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ViewingProvider, type Viewing } from '@/components/shell/viewing'
import {
  addCompany,
  addEquipment,
  addPerson,
  addRepair,
  deleteCompany,
  deleteEquipment,
  deletePerson,
  deleteRepair,
  importContacts,
  loadContacts,
  updateCompany,
  updateEquipment,
  updatePerson,
  updateRepair,
} from '@/lib/storage/contacts'
import { ContactsScreen } from './ContactsScreen'
import { BOOK, installClipboard, installMatchMedia, MEDICAL } from './parts/book.test.data'

// 보는 중 주소록 (admin-view REQ-8011 AC-8011.1, design.md '탭마다 읽기만' 주소록 줄).
// 관리자가 다른 의원을 보는 중(ViewingProvider viewing={가짜})이면 [엑셀 올리기]·[업체 더하기]·[고치기]·[지우기]·더하기 단추가 없고
// 목록·자세히·[양식 받기]·[복사]는 그대로, 사이트 비밀번호도 [보기]로 보인다(사용자 "비밀번호도 보이기"). viewing={null}이면 지금과 같다.
// 저장 함수·supabaseBrowser는 흉내다(실제 Supabase에 붙지 않는다). 업체·사람·번호는 모두 지어낸 것이다(parts/book.test.data.ts)

const CLIENT = vi.hoisted(() => ({ fake: 'client' }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => CLIENT }))
vi.mock('@/lib/storage/contacts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/contacts')>()),
  loadContacts: vi.fn(),
  addCompany: vi.fn(),
  updateCompany: vi.fn(),
  deleteCompany: vi.fn(),
  addPerson: vi.fn(),
  updatePerson: vi.fn(),
  deletePerson: vi.fn(),
  addEquipment: vi.fn(),
  updateEquipment: vi.fn(),
  deleteEquipment: vi.fn(),
  addRepair: vi.fn(),
  updateRepair: vi.fn(),
  deleteRepair: vi.fn(),
  importContacts: vi.fn(),
}))

const VIEWING: Viewing = { hospitalId: '22222222-2222-4222-8222-222222222222', name: '가짜다른의원' }
const WRITES = [addCompany, updateCompany, deleteCompany, addPerson, updatePerson, deletePerson, addEquipment, updateEquipment, deleteEquipment, addRepair, updateRepair, deleteRepair, importContacts]
/** 쓰기로 이어지는 단추 이름 */
const WRITE_WORDS = /고치기|지우기|더하기|올리기|저장|넣기/

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-21T01:40:00Z')) // 한국 2026-11-21 10:40
  installMatchMedia(false)
  installClipboard()
  vi.mocked(loadContacts).mockResolvedValue(BOOK)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
  Reflect.deleteProperty(window, 'matchMedia')
  Reflect.deleteProperty(navigator, 'clipboard')
})

const inView = (viewing: Viewing | null, children: ReactNode) => <ViewingProvider viewing={viewing}>{children}</ViewingProvider>

async function open(viewing: Viewing | null, initialCompanyId?: string) {
  render(inView(viewing, <ContactsScreen initialCompanyId={initialCompanyId} />))
  await screen.findByRole('searchbox', { name: '업체·담당자·품목·장비 찾기' })
}
const writeButtons = () => screen.queryAllByRole('button').filter((b) => WRITE_WORDS.test(b.textContent ?? '') || WRITE_WORDS.test(b.getAttribute('aria-label') ?? ''))

describe('AC-8011.1: 보는 중 주소록 — 쓰기 단추 없음', () => {
  it('AC-8011.1: 목록 화면에 [엑셀 올리기]·[업체 더하기]가 없고 [양식 받기]·찾기·목록은 그대로다', async () => {
    await open(VIEWING)
    expect(screen.queryByRole('button', { name: '엑셀 올리기' })).toBeNull()
    expect(screen.queryByRole('button', { name: '업체 더하기' })).toBeNull()
    expect(document.querySelector('input[type="file"]')).toBeNull()
    expect(screen.getByRole('link', { name: '양식 받기' })).toBeTruthy()
    expect(screen.getByText('업체 8곳')).toBeTruthy()
    expect(document.querySelectorAll('[data-contacts-list] [data-company]')).toHaveLength(8)
    expect(writeButtons()).toEqual([])
  })

  it('AC-8011.1: 업체 자세히에 [고치기]·[지우기]·담당자·장비·수리 기록 더하기가 없고, 적힌 칸·담당자·장비·수리 기록 글은 보인다', async () => {
    await open(VIEWING, MEDICAL.id)
    expect(screen.getByRole('heading', { level: 2, name: MEDICAL.name })).toBeTruthy()
    expect(writeButtons()).toEqual([])
    const people = screen.getByRole('region', { name: '담당자' })
    expect(within(people).getByText('김예시')).toBeTruthy()
    expect(within(people).getByText('박예시')).toBeTruthy()
    const equipment = screen.getByRole('region', { name: '장비' })
    expect(within(equipment).getByText('충격파 기계')).toBeTruthy()
    expect(within(equipment).getByText('출력이 약해져 점검 · 출장비')).toBeTruthy()
    const info = screen.getByRole('region', { name: '업체 정보' })
    expect(within(info).getByText(MEDICAL.address)).toBeTruthy()
    expect(within(info).getByText(MEDICAL.memo, { normalizer: (s) => s })).toBeTruthy()
    // [복사]는 읽기라 그대로다
    expect(within(info).getByRole('button', { name: '주소 복사' })).toBeTruthy()
  })

  it('AC-8011.1: 사이트 비밀번호(site_pw)는 보는 중에도 [보기]로 보인다', async () => {
    await open(VIEWING, MEDICAL.id)
    const info = screen.getByRole('region', { name: '업체 정보' })
    expect(within(info).queryByText(MEDICAL.sitePw)).toBeNull()
    fireEvent.click(within(info).getByRole('button', { name: '사이트 비밀번호 보기' }))
    expect(within(info).getByText(MEDICAL.sitePw)).toBeTruthy()
    expect(within(info).getByRole('button', { name: '사이트 비밀번호 복사' })).toBeTruthy()
  })

  it('AC-8011.1: 빈 주소록이면 [양식 받기]만 있고 [엑셀 올리기]·[업체 더하기]가 없다', async () => {
    vi.mocked(loadContacts).mockResolvedValue({ companies: [], people: [], equipment: [], repairs: [] })
    render(inView(VIEWING, <ContactsScreen />))
    const empty = await screen.findByRole('region', { name: '빈 주소록' })
    expect(within(empty).getByRole('link', { name: '양식 받기' })).toBeTruthy()
    expect(within(empty).queryAllByRole('button')).toEqual([])
    expect(document.querySelector('input[type="file"]')).toBeNull()
  })

  it('AC-8011.1: 보는 중에는 저장 함수를 하나도 부르지 않는다(읽기 한 번뿐)', async () => {
    await open(VIEWING, MEDICAL.id)
    expect(loadContacts).toHaveBeenCalledTimes(1)
    for (const write of WRITES) expect(write).not.toHaveBeenCalled()
  })
})

describe('AC-8011.1: viewing={null}이면 지금과 같다', () => {
  it('AC-8011.1: 쓰기 단추가 모두 그대로 있다', async () => {
    await open(null, MEDICAL.id)
    expect(screen.getByRole('button', { name: '엑셀 올리기' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '업체 더하기' })).toBeTruthy()
    expect(screen.getByRole('button', { name: `${MEDICAL.name} 고치기` })).toBeTruthy()
    expect(screen.getByRole('button', { name: `${MEDICAL.name} 지우기` })).toBeTruthy()
    expect(screen.getByRole('button', { name: '업체 정보 고치기' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '담당자 더하기' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '장비 더하기' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '김예시 고치기' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '충격파 기계 고치기' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '충격파 기계 수리 기록 더하기' })).toBeTruthy()
  })
})
