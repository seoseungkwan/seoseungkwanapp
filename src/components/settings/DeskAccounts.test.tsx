// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RoleProvider } from '@/components/shell/role'
import type { DeskMember } from '@/types/desk'
import { DeskAccounts } from './DeskAccounts'

// 설정 '데스크 계정' 칸 (specs/desk-feedback REQ-6304 AC-6304.2·AC-6304.3, design.md '③ 설정 데스크 계정 칸', 시안 ③).
// 저장 함수(lib/storage/desk.ts)는 가짜로 바꾼다. 실제 Supabase에 붙지 않는다. 메일은 모두 지어낸 example.com 주소다

const store = vi.hoisted(() => ({ list: vi.fn(), add: vi.fn(), remove: vi.fn() }))
vi.mock('@/lib/storage/desk', () => ({ listDeskMembers: store.list, addDeskMember: store.add, removeDeskMember: store.remove }))
const client = vi.hoisted(() => ({ client: 'browser' }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => client }))

const DESCRIPTION = '데스크 계정은 업무일지 · 수납일지 · 예약만 볼 수 있어요. 통계·매출·청구·환자·설정은 서버가 보여 주지 않아요.'
const NOTE =
  '데스크 PC에서 이 구글 메일로 로그인하면 바로 이 병원의 데스크 계정이 됩니다(가입 승인 없음). [빼기]를 누르면 그 PC는 다음 화면부터 아무것도 볼 수 없어요. 데스크 계정은 5개까지.'
const PLACEHOLDER = '데스크가 로그인할 구글 메일'

const member = (n: number, signedInAt: string | null = null): DeskMember => ({
  id: `m-${n}`,
  email: `desk${n}@example.com`,
  addedAt: '2026-11-17T01:00:00Z',
  signedInAt,
})

const emailInput = () => screen.getByRole('textbox', { name: '데스크 구글 메일' }) as HTMLInputElement
const addButton = () => screen.getByRole('button', { name: '더하기' }) as HTMLButtonElement
const rowOf = (email: string) => screen.getByText(email).closest('li') as HTMLElement
const removeButton = (email: string) => within(rowOf(email)).getByRole('button', { name: /빼기/ })
const shownEmails = () =>
  within(screen.getByRole('list', { name: '데스크 계정 목록' }))
    .getAllByRole('listitem')
    .map((li) => li.firstElementChild?.textContent)

async function renderReady(members: DeskMember[]) {
  store.list.mockResolvedValue(members)
  const user = userEvent.setup()
  render(<DeskAccounts />)
  await screen.findByRole('textbox', { name: '데스크 구글 메일' })
  return user
}

async function typeAndAdd(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.type(emailInput(), text)
  await user.click(addButton())
}

beforeEach(() => {
  store.list.mockReset().mockResolvedValue([])
  store.add.mockReset().mockResolvedValue('added')
  store.remove.mockReset().mockResolvedValue(undefined)
})
afterEach(cleanup)

describe('AC-6304.2 설정 데스크 계정 칸 — 글·칸·목록', () => {
  it('AC-6304.2: 제목·설명·메일 칸(자리표시·화면 읽기 이름)·[더하기]·맨 아래 글이 보이고 목록은 저장 함수로 한 번 읽는다', async () => {
    await renderReady([member(1)])
    const section = screen.getByRole('region', { name: '데스크 계정' })
    expect(within(section).getByRole('heading', { level: 2, name: '데스크 계정' })).toBeTruthy()
    // 시안처럼 '업무일지 · 수납일지 · 예약'만 굵게 → 글이 두 마디로 나뉘어 문단 전체 글자로 찾는다
    const description = within(section).getByText((_, element) => element?.tagName === 'P' && element.textContent === DESCRIPTION)
    expect(description.querySelector('strong')?.textContent).toBe('업무일지 · 수납일지 · 예약')
    expect(emailInput().placeholder).toBe(PLACEHOLDER)
    expect(emailInput().value).toBe('')
    expect(addButton().disabled).toBe(false)
    expect(section.lastElementChild?.textContent).toBe(NOTE)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(store.list).toHaveBeenCalledTimes(1)
    expect(store.list).toHaveBeenCalledWith(client)
    expect(store.add).not.toHaveBeenCalled()
    expect(store.remove).not.toHaveBeenCalled()
  })

  it('AC-6304.2: 줄마다 메일 · "로그인함 · M/D"(한국 날짜, positive 600) 또는 "아직 로그인 안 함"(muted) · [빼기], 받은 차례 그대로', async () => {
    // 2026-11-17T16:30Z는 한국 11월 18일 01:30이다(UTC 날짜를 쓰면 11/17로 틀린다)
    await renderReady([member(1, '2026-11-17T16:30:00Z'), member(2), member(3, '2026-03-05T00:00:00Z')])
    expect(shownEmails()).toEqual(['desk1@example.com', 'desk2@example.com', 'desk3@example.com'])

    const signed = within(rowOf('desk1@example.com')).getByText('로그인함 · 11/18')
    expect(signed.className).toContain('text-positive')
    expect(signed.className).toContain('font-semibold')
    expect(within(rowOf('desk3@example.com')).getByText('로그인함 · 3/5')).toBeTruthy()

    const never = within(rowOf('desk2@example.com')).getByText('아직 로그인 안 함')
    expect(never.className).toContain('text-muted')
    expect(within(rowOf('desk2@example.com')).queryByText(/로그인함/)).toBeNull()

    for (const n of [1, 2, 3]) expect(removeButton(`desk${n}@example.com`).textContent).toBe('빼기')
  })

  it('AC-6304.2: 데스크 계정이 하나도 없으면 목록 줄이 없고 메일 칸·[더하기]·맨 아래 글은 그대로다', async () => {
    await renderReady([])
    expect(screen.queryByRole('list', { name: '데스크 계정 목록' })).toBeNull()
    expect(addButton().disabled).toBe(false)
    expect(screen.getByText(NOTE)).toBeTruthy()
  })

  it('AC-6304.2: 데스크 계정(RoleProvider desk)에게는 이 칸을 그리지 않고 목록도 읽지 않는다(원장 계정에서만)', () => {
    const { container } = render(
      <RoleProvider desk>
        <DeskAccounts />
      </RoleProvider>,
    )
    expect(container.textContent).toBe('')
    expect(store.list).not.toHaveBeenCalled()
  })

  it('AC-6304.2: 설정 화면은 현금 시재(CashFloatSetting) 바로 다음, 맨 아래에 이 칸을 둔다', () => {
    const page = readFileSync(join(process.cwd(), 'src/components/settings/SettingsPage.tsx'), 'utf8')
    expect(page).toMatch(/import \{ DeskAccounts \} from '\.\/DeskAccounts'/)
    expect(page).toMatch(/<CashFloatSetting \/>\n\s*<DeskAccounts \/>\n/)
  })
})

describe('AC-6304.3 [더하기] — 다섯 답', () => {
  it("AC-6304.3: 'added'면 메일 칸을 비우고 목록을 다시 읽어 새 줄을 보인다", async () => {
    const user = await renderReady([member(1)])
    store.list.mockResolvedValue([member(1), member(2)])
    await typeAndAdd(user, 'desk2@example.com')
    await waitFor(() => expect(shownEmails()).toEqual(['desk1@example.com', 'desk2@example.com']))
    expect(store.add).toHaveBeenCalledTimes(1)
    expect(store.add).toHaveBeenCalledWith(client, 'desk2@example.com')
    expect(store.list).toHaveBeenCalledTimes(2)
    expect(emailInput().value).toBe('')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-6304.3: 메일 칸에서 Enter를 쳐도 더한다(적은 글자 그대로 저장 함수에 넘긴다)', async () => {
    const user = await renderReady([])
    await user.type(emailInput(), '  Desk2@Example.com {Enter}')
    await waitFor(() => expect(store.add).toHaveBeenCalledWith(client, '  Desk2@Example.com '))
  })

  it.each([
    ['bad', 'E-DESK-EMAIL-BAD', '메일 주소 모양이 아니에요'],
    ['taken', 'E-DESK-EMAIL-TAKEN', '이미 병원 계정으로 가입된 메일이에요'],
    ['used', 'E-DESK-EMAIL-USED', '이미 데스크 계정으로 더한 메일이에요'],
    ['limit', 'E-DESK-LIMIT', '데스크 계정은 5개까지예요'],
  ])("AC-6304.3: '%s'면 메일 칸 값을 그대로 두고 오류 카드 %s를 보인다", async (answer, code, what) => {
    const user = await renderReady([member(1)])
    store.add.mockResolvedValue(answer)
    await typeAndAdd(user, 'owner@example.com')
    const card = await screen.findByRole('alert')
    expect(within(card).getByText(what)).toBeTruthy()
    expect(within(card).getByText(`오류 번호 ${code}`)).toBeTruthy()
    expect(emailInput().value).toBe('owner@example.com')
    expect(store.list).toHaveBeenCalledTimes(1)
    expect(shownEmails()).toEqual(['desk1@example.com'])
  })

  it('AC-6304.3: 저장 함수가 던지면(연결 실패·Supabase 오류) E-DESK-SAVE-FAILED이고 메일 칸 값은 그대로다', async () => {
    const user = await renderReady([])
    store.add.mockRejectedValue(new Error('desk storage failed'))
    await typeAndAdd(user, 'desk1@example.com')
    const card = await screen.findByRole('alert')
    expect(within(card).getByText('데스크 계정을 바꾸지 못했어요')).toBeTruthy()
    expect(within(card).getByText('오류 번호 E-DESK-SAVE-FAILED')).toBeTruthy()
    expect(emailInput().value).toBe('desk1@example.com')
  })

  it('AC-6304.3: 오류 카드는 다음에 더해서 되면 사라진다', async () => {
    const user = await renderReady([])
    store.add.mockResolvedValueOnce('bad').mockResolvedValueOnce('added')
    await typeAndAdd(user, 'desk1')
    await screen.findByRole('alert')
    store.list.mockResolvedValue([member(1)])
    await user.clear(emailInput())
    await typeAndAdd(user, 'desk1@example.com')
    await waitFor(() => expect(shownEmails()).toEqual(['desk1@example.com']))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-6304.3: 답을 기다리는 동안 [더하기]를 다시 눌러도 한 번만 보낸다', async () => {
    const user = await renderReady([])
    let answer!: (value: string) => void
    store.add.mockReturnValue(new Promise((ok) => (answer = ok)))
    await typeAndAdd(user, 'desk1@example.com')
    expect(addButton().getAttribute('aria-busy')).toBe('true')
    await user.click(addButton())
    expect(store.add).toHaveBeenCalledTimes(1)
    answer('added')
    await waitFor(() => expect(emailInput().value).toBe(''))
  })
})

describe('AC-6304.3 5줄이면 메일 칸·[더하기]가 꺼진다', () => {
  it('AC-6304.3: 목록이 5줄이면 메일 칸과 [더하기]가 꺼진다', async () => {
    await renderReady([1, 2, 3, 4, 5].map((n) => member(n)))
    expect(emailInput().disabled).toBe(true)
    expect(addButton().disabled).toBe(true)
  })

  it('AC-6304.3: 4줄이면 켜져 있고, 더해서 5줄이 되면 꺼진다', async () => {
    const user = await renderReady([1, 2, 3, 4].map((n) => member(n)))
    expect(emailInput().disabled).toBe(false)
    expect(addButton().disabled).toBe(false)
    store.list.mockResolvedValue([1, 2, 3, 4, 5].map((n) => member(n)))
    await typeAndAdd(user, 'desk5@example.com')
    await waitFor(() => expect(addButton().disabled).toBe(true))
    expect(emailInput().disabled).toBe(true)
  })
})

describe('AC-6304.3 [빼기]', () => {
  it('AC-6304.3: [빼기]는 묻지 않고 바로 그 줄 id로 지운 뒤 목록을 다시 읽는다', async () => {
    const user = await renderReady([member(1), member(2)])
    store.list.mockResolvedValue([member(2)])
    await user.click(removeButton('desk1@example.com'))
    await waitFor(() => expect(shownEmails()).toEqual(['desk2@example.com']))
    expect(store.remove).toHaveBeenCalledTimes(1)
    expect(store.remove).toHaveBeenCalledWith(client, 'm-1')
    expect(store.list).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('AC-6304.3: 5줄에서 하나를 빼면 메일 칸·[더하기]가 다시 켜진다', async () => {
    const user = await renderReady([1, 2, 3, 4, 5].map((n) => member(n)))
    store.list.mockResolvedValue([2, 3, 4, 5].map((n) => member(n)))
    await user.click(removeButton('desk1@example.com'))
    await waitFor(() => expect(addButton().disabled).toBe(false))
    expect(emailInput().disabled).toBe(false)
  })

  it('AC-6304.3: 지우기에 실패하면 E-DESK-SAVE-FAILED이고 그 줄은 그대로다', async () => {
    const user = await renderReady([member(1)])
    store.remove.mockRejectedValue(new Error('desk storage offline'))
    await user.click(removeButton('desk1@example.com'))
    const card = await screen.findByRole('alert')
    expect(within(card).getByText('오류 번호 E-DESK-SAVE-FAILED')).toBeTruthy()
    expect(shownEmails()).toEqual(['desk1@example.com'])
    expect(store.list).toHaveBeenCalledTimes(1)
  })
})

describe('AC-6304.3 목록 읽기 실패', () => {
  it('AC-6304.3: 목록을 못 읽으면 E-DESK-READ-FAILED와 [다시 불러오기]가 보이고 메일 칸·목록은 없다', async () => {
    store.list.mockRejectedValue(new Error('desk storage failed'))
    render(<DeskAccounts />)
    const card = await screen.findByRole('alert')
    expect(within(card).getByText('데스크 계정 목록을 불러오지 못했어요')).toBeTruthy()
    expect(within(card).getByText('오류 번호 E-DESK-READ-FAILED')).toBeTruthy()
    expect(screen.getByRole('button', { name: '다시 불러오기' })).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: '데스크 구글 메일' })).toBeNull()
    expect(screen.queryByRole('list', { name: '데스크 계정 목록' })).toBeNull()
    expect(screen.getByText(NOTE)).toBeTruthy()
  })

  it('AC-6304.3: [다시 불러오기]를 누르면 다시 읽어 목록이 보인다', async () => {
    store.list.mockRejectedValueOnce(new Error('desk storage offline')).mockResolvedValue([member(1)])
    const user = userEvent.setup()
    render(<DeskAccounts />)
    await user.click(await screen.findByRole('button', { name: '다시 불러오기' }))
    await waitFor(() => expect(shownEmails()).toEqual(['desk1@example.com']))
    expect(store.list).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-6304.3: 더한 뒤 다시 읽기에 실패해도 E-DESK-READ-FAILED와 [다시 불러오기]다', async () => {
    const user = await renderReady([])
    store.list.mockRejectedValue(new Error('desk storage failed'))
    await typeAndAdd(user, 'desk1@example.com')
    const card = await screen.findByRole('alert')
    expect(within(card).getByText('오류 번호 E-DESK-READ-FAILED')).toBeTruthy()
    expect(screen.getByRole('button', { name: '다시 불러오기' })).toBeTruthy()
  })
})
