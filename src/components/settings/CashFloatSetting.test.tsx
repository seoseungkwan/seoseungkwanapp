// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorklogStorageError } from '@/lib/storage/worklogDays'
import { CashFloatSetting } from './CashFloatSetting'

// 설정 탭 '현금 시재' 칸 (specs/worklog-cash-float REQ-1608, design.md '설정 칸', 시안 '설정 · 시재 금액').
// 읽기·저장은 worklogSettings.ts를 가짜로 바꾼다. 줄이 없을 때 300,000을 주는 것은 그 모듈의 일이라(AC-1603.3) 여기서는 받은 숫자를 그대로 쓴다

const store = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }))
vi.mock('@/lib/storage/worklogSettings', () => ({ loadCashFloatSetting: store.load, saveCashFloatSetting: store.save }))
const client = vi.hoisted(() => ({ client: 'browser' }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => client }))

const DESCRIPTION = '마감 때 서랍에 남겨 두는 돈이에요. 업무일지의 시재 칸이 이 금액으로 계산해요.'
const NOTE = '이미 센 날은 그때 금액 그대로예요.'
const INVALID = '금액을 숫자로 적어 주세요.'
const TOO_BIG = '시재 금액은 10,000,000원까지 적을 수 있어요.'

const saveButton = () => screen.getByRole('button', { name: '저장' })

function deferred() {
  let resolve!: () => void
  let reject!: (error: unknown) => void
  const promise = new Promise<void>((ok, fail) => {
    resolve = ok
    reject = fail
  })
  return { promise, resolve, reject }
}

async function typeAndSave(text: string) {
  const user = userEvent.setup()
  render(<CashFloatSetting />)
  const input = (await screen.findByLabelText('시재 금액')) as HTMLInputElement
  await user.clear(input)
  if (text !== '') await user.type(input, text)
  await user.click(saveButton())
  return { user, input }
}

beforeEach(() => {
  store.load.mockReset().mockResolvedValue(300000)
  store.save.mockReset().mockResolvedValue(undefined)
})
afterEach(cleanup)

describe('AC-1608.1 설정 탭 현금 시재 칸', () => {
  it('AC-1608.1: 제목 "현금 시재"·설명·칸 이름 "시재 금액"·쉼표 금액·"원"·[저장]·안내 글이 있고 처음 값은 읽은 설정(줄 없음 → 300,000)이다', async () => {
    render(<CashFloatSetting />)
    expect(screen.getByRole('heading', { name: '현금 시재' })).toBeTruthy()
    expect(screen.getByText(DESCRIPTION)).toBeTruthy()
    expect(((await screen.findByLabelText('시재 금액')) as HTMLInputElement).value).toBe('300,000')
    expect(screen.getByText('원')).toBeTruthy()
    expect(saveButton()).toBeTruthy()
    expect(screen.getByText(NOTE)).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(store.load).toHaveBeenCalledTimes(1)
    expect(store.load).toHaveBeenCalledWith(client)
    expect(store.save).not.toHaveBeenCalled()
  })

  it.each([
    [250000, '250,000'],
    [1250000, '1,250,000'],
    [0, '0'],
  ])('AC-1608.1: 읽은 설정 %d은 칸에 "%s"로 보인다', async (won, shown) => {
    store.load.mockResolvedValue(won)
    render(<CashFloatSetting />)
    expect(((await screen.findByLabelText('시재 금액')) as HTMLInputElement).value).toBe(shown)
  })

  it('AC-1608.1: 읽는 동안에는 칸이 없고 읽는 중 글이 보인다', () => {
    store.load.mockReturnValue(new Promise(() => {}))
    render(<CashFloatSetting />)
    expect(screen.getByText('시재 금액을 읽는 중이에요…')).toBeTruthy()
    expect(screen.queryByLabelText('시재 금액')).toBeNull()
    expect(screen.queryByRole('button', { name: '저장' })).toBeNull()
  })

  it("AC-1608.1: 설정 화면은 '청구·연락' 패널들(상병 연결표 DxLinks) 바로 아래에 이 칸을 둔다", () => {
    const page = readFileSync(join(process.cwd(), 'src/components/settings/SettingsPage.tsx'), 'utf8')
    expect(page).toMatch(/import \{ CashFloatSetting \} from '\.\/CashFloatSetting'/)
    expect(page).toMatch(/<DxLinks \/>\n\s*<CashFloatSetting \/>\n/)
  })
})

describe('AC-1608.2 저장', () => {
  it('AC-1608.2: 금액을 고쳐 [저장]하면 saveCashFloatSetting이 숫자로 한 번 불리고 안내 글이 나오며 칸 글은 쉼표 금액이 된다', async () => {
    const { input } = await typeAndSave('250000')
    const status = await screen.findByRole('status')
    expect(status.textContent).toBe('저장했어요. 이제부터 세는 날은 250,000원으로 계산해요.')
    expect(store.save).toHaveBeenCalledTimes(1)
    expect(store.save).toHaveBeenCalledWith(client, 250000)
    expect(input.value).toBe('250,000')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it.each([
    ['1,250,000원', 1250000, '1,250,000'],
    ['0', 0, '0'],
  ])('AC-1608.2: "%s"도 숫자 %d로 저장하고 칸은 "%s"가 된다', async (typed, won, shown) => {
    const { input } = await typeAndSave(typed)
    expect((await screen.findByRole('status')).textContent).toBe(`저장했어요. 이제부터 세는 날은 ${shown}원으로 계산해요.`)
    expect(store.save.mock.calls).toEqual([[client, won]])
    expect(input.value).toBe(shown)
  })

  it.each([
    ['빈 칸', '', INVALID],
    ['글자', '삼십만', INVALID],
    ['음수', '-5000', INVALID],
    ['소수', '1000.5', INVALID],
    ['1천만원 넘음', '10,000,001', TOO_BIG],
  ])('AC-1608.2: 틀린 값(%s)은 저장하지 않고 안내가 나온다', async (_, typed, message) => {
    const { input } = await typeAndSave(typed)
    expect(screen.getByText(message)).toBeTruthy()
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.value).toBe(typed)
    expect(store.save).not.toHaveBeenCalled()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('AC-1608.2: 10,000,000원은 저장된다(끝 값)', async () => {
    await typeAndSave('10000000')
    expect((await screen.findByRole('status')).textContent).toBe('저장했어요. 이제부터 세는 날은 10,000,000원으로 계산해요.')
    expect(store.save.mock.calls).toEqual([[client, 10000000]])
  })

  it('AC-1608.2: 틀린 값 안내는 칸을 고치면 사라진다', async () => {
    const { user, input } = await typeAndSave('삼십만')
    expect(screen.getByText(INVALID)).toBeTruthy()
    await user.type(input, '1')
    expect(screen.queryByText(INVALID)).toBeNull()
    expect(input.getAttribute('aria-invalid')).toBeNull()
  })

  it('AC-1608.2: 저장 중에는 [저장]이 눌리지 않는다(기다림 표시, 다시 눌러도 한 번만 저장)', async () => {
    const pending = deferred()
    store.save.mockReturnValue(pending.promise)
    const { user } = await typeAndSave('250000')
    expect(saveButton().getAttribute('aria-busy')).toBe('true')
    await user.click(saveButton())
    await user.click(saveButton())
    expect(store.save).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('status')).toBeNull()
    pending.resolve()
    expect((await screen.findByRole('status')).textContent).toBe('저장했어요. 이제부터 세는 날은 250,000원으로 계산해요.')
    expect(saveButton().getAttribute('aria-busy')).toBeNull()
  })
})

describe('AC-1608.3 읽기·저장 실패', () => {
  it.each(['failed', 'offline'] as const)(
    'AC-1608.3: 읽기 실패(%s)면 E-SETTINGS-FAILED 카드와 [다시 불러오기]가 있고, 누르면 다시 읽어 칸이 나온다',
    async (kind) => {
      const user = userEvent.setup()
      store.load.mockRejectedValueOnce(new WorklogStorageError(kind)).mockResolvedValueOnce(250000)
      render(<CashFloatSetting />)
      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toContain('오류 번호 E-SETTINGS-FAILED')
      expect(screen.queryByLabelText('시재 금액')).toBeNull()
      expect(screen.queryByRole('button', { name: '저장' })).toBeNull()
      await user.click(screen.getByRole('button', { name: '다시 불러오기' }))
      expect(((await screen.findByLabelText('시재 금액')) as HTMLInputElement).value).toBe('250,000')
      expect(store.load).toHaveBeenCalledTimes(2)
      expect(screen.queryByRole('alert')).toBeNull()
      expect(screen.queryByRole('button', { name: '다시 불러오기' })).toBeNull()
    },
  )

  it('AC-1608.3: 저장 실패면 E-SETTINGS-FAILED 카드이고 적은 값은 칸에 그대로이며, 다시 [저장]하면 저장된다', async () => {
    store.save.mockRejectedValueOnce(new WorklogStorageError('failed'))
    const { user, input } = await typeAndSave('250000')
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('오류 번호 E-SETTINGS-FAILED')
    expect(input.value).toBe('250000')
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('button', { name: '다시 불러오기' })).toBeNull()
    expect(saveButton().getAttribute('aria-busy')).toBeNull()

    await user.click(saveButton())
    expect((await screen.findByRole('status')).textContent).toBe('저장했어요. 이제부터 세는 날은 250,000원으로 계산해요.')
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(store.save.mock.calls).toEqual([
      [client, 250000],
      [client, 250000],
    ])
  })
})
