// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ds } from '@/components/ui/classes'
import { errorInfo } from '@/lib/errors'
import { InstallFilesError, latestInstallFiles, uploadInstallFile, type InstallFile, type InstallKind } from '@/lib/storage/installFiles'
import { nestedBoxes } from '@/testing/boxes'
import type { ErrorCode } from '@/types/errors'
import { InstallFilesAdmin } from './InstallFilesAdmin'

// 관리자 '설치 파일' 칸 (specs/helper-download TASK-3, REQ-5104 · AC-5104.1~5104.2, design.md '화면', 시안 ?s=admin·uploading·bad·done).
// 목록 읽기·올리기 함수만 가짜로 바꾼다. 판·크기·날짜 글자(installMeta)와 오류 종류(InstallFilesError)·안내 글(errors.ts)은 진짜를 쓴다.
// jsdom은 CSS를 계산하지 않는다 → 폰 모양은 클래스로 본다. 파일 이름·크기는 지어낸 값이다
vi.mock('@/lib/storage/installFiles', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/installFiles')>()),
  latestInstallFiles: vi.fn(),
  uploadInstallFile: vi.fn(),
}))
// 진짜 함수가 Supabase에 닿지 않게 한다(가짜로 바꾼 두 함수만 부르므로 불리면 안 된다)
const { supabaseBrowser } = vi.hoisted(() => ({ supabaseBrowser: vi.fn() }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser }))

const latest = vi.mocked(latestInstallFiles)
const upload = vi.mocked(uploadInstallFile)

const DESC = '비트 PC 연결 화면의 [내려받기] 단추가 여기 올린 파일을 줘요. 로그인하고 승인된 사람만 받을 수 있어요.'
const HINT =
  '새 판이 나오면 Claude가 바탕화면 도우미-설치파일 폴더에 zip을 놓아 둬요. 그 파일을 [새 파일 올리기]로 고르세요. 이름은 precheck-helper-0.9.0.zip·precheck-extension-0.3.0.zip 모양만 받아요(5MB까지). 예전 판은 지우지 않고 남겨 두고, 받기 단추는 가장 높은 판을 줘요.'
const DONE_BODY = '이제 모든 병원의 비트 PC 연결 화면에서 이 판을 받아요.'

const file = (kind: InstallKind, version: [number, number, number], size: number, uploadedAt: string): InstallFile => {
  const name = `precheck-${kind}-${version.join('.')}.zip`
  return { kind, version, name, path: `${kind}/${name}`, size, uploadedAt }
}
// 한국 11월 17일 01:30(UTC로는 16일) — 날짜 칸은 한국 날짜여야 한다
const HELPER = file('helper', [0, 9, 0], 912_345, '2026-11-16T16:30:00.000Z')
const EXT = file('extension', [0, 3, 0], 1_234_567, '2026-11-10T03:00:00.000Z')
const NEW_HELPER = file('helper', [0, 9, 1], 889_999, '2026-11-17T05:00:00.000Z')
const NEW_EXT = file('extension', [0, 3, 1], 950_000, '2026-11-17T05:00:00.000Z')

const zip = (name: string) => new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], name, { type: 'application/x-zip-compressed' })

const tokens = (classes: string) => classes.split(/\s+/).filter(Boolean)
const hasAll = (el: Element, classes: string) =>
  expect(tokens(el.getAttribute('class') ?? '')).toEqual(expect.arrayContaining(tokens(classes)))

const card = () => screen.getByRole('region', { name: '설치 파일' })
const table = () => within(card()).getByRole('table')
const rowOf = (label: '도우미' | '크롬 확장') => {
  const tr = within(table()).getByText(label).closest('tr')
  if (tr === null) throw new Error(`${label} 줄 없음`)
  return tr
}
const cellTexts = (tr: HTMLElement) => within(tr).getAllByRole('cell').map((c) => c.textContent)
const buttonOf = (label: '도우미' | '크롬 확장') => within(rowOf(label)).getByRole('button')
const inputOf = (label: '도우미' | '크롬 확장') => {
  const input = rowOf(label).querySelector('input[type="file"]')
  if (!(input instanceof HTMLInputElement)) throw new Error(`${label} 파일 고르기 없음`)
  return input
}
const choose = (label: '도우미' | '크롬 확장', chosen: File) => fireEvent.change(inputOf(label), { target: { files: [chosen] } })

async function renderLoaded() {
  render(<InstallFilesAdmin />)
  await waitFor(() => expect(within(rowOf('도우미')).getAllByRole('cell')[1].textContent).toBe('0.9.0'))
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const expectErrorCard = (code: ErrorCode) => {
  const alert = screen.getByRole('alert')
  expect(alert.textContent).toContain(errorInfo(code).what)
  expect(alert.textContent).toContain(errorInfo(code).fix)
  expect(alert.textContent).toContain(`오류 번호 ${code}`)
  // 안내 글의 마침표를 하나 더 붙이지 않는다
  expect(alert.textContent).not.toContain('..')
}

beforeEach(() => {
  latest.mockReset()
  latest.mockResolvedValue({ helper: HELPER, extension: EXT })
  upload.mockReset()
  supabaseBrowser.mockReset()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('InstallFilesAdmin: 처음 그리기', () => {
  it("AC-5104.1: 제목 '설치 파일'·설명 글이 시안 그대로이고, 머리는 종류·지금 판·크기·올린 날, 줄은 도우미·크롬 확장 차례다", async () => {
    await renderLoaded()
    expect(within(card()).getByRole('heading', { level: 2 }).textContent).toBe('설치 파일')
    expect(within(card()).getByText(DESC)).toBeTruthy()
    const heads = within(table()).getAllByRole('columnheader').map((th) => th.textContent)
    expect(heads).toEqual(['종류', '지금 판', '크기', '올린 날', ''])
    const kinds = within(table()).getAllByRole('row').slice(1).map((tr) => within(tr).getAllByRole('cell')[0].textContent)
    expect(kinds).toEqual(['도우미', '크롬 확장'])
  })

  it("AC-5104.1: 줄마다 지금 판·크기(1MB 아래는 KB 버림, 이상은 소수 한 자리 MB)·올린 날(한국 날짜, installMeta와 같은 글자)과 [새 파일 올리기]가 있다", async () => {
    await renderLoaded()
    expect(cellTexts(rowOf('도우미'))).toEqual(['도우미', '0.9.0', '912KB', '11월 17일', '새 파일 올리기'])
    expect(cellTexts(rowOf('크롬 확장'))).toEqual(['크롬 확장', '0.3.0', '1.2MB', '11월 10일', '새 파일 올리기'])
    for (const label of ['도우미', '크롬 확장'] as const) {
      const button = buttonOf(label)
      expect(button.textContent).toBe('새 파일 올리기')
      expect((button as HTMLButtonElement).disabled).toBe(false)
    }
    expect(latest).toHaveBeenCalledTimes(1)
  })

  it("AC-5104.1: 표 아래 안내 글이 design.md 글자 그대로다", async () => {
    await renderLoaded()
    const hint = within(card()).getByText((_, el) => el?.tagName === 'P' && el.textContent === HINT)
    expect(hint).toBeTruthy()
  })

  it('AC-5104.1: 파일 고르기는 줄마다 하나, 숨겨 두고 .zip만 보인다', async () => {
    await renderLoaded()
    const inputs = card().querySelectorAll('input[type="file"]')
    expect(inputs).toHaveLength(2)
    for (const label of ['도우미', '크롬 확장'] as const) {
      const input = inputOf(label)
      expect(input.accept).toBe('.zip')
      expect(input.hidden).toBe(true)
      expect(input.multiple).toBe(false)
    }
  })

  it('AC-5104.1: [새 파일 올리기]를 누르면 그 줄의 파일 고르기가 열린다', async () => {
    const user = userEvent.setup()
    await renderLoaded()
    const clicks = vi.spyOn(inputOf('크롬 확장'), 'click')
    const helperClicks = vi.spyOn(inputOf('도우미'), 'click')
    await user.click(buttonOf('크롬 확장'))
    expect(clicks).toHaveBeenCalledTimes(1)
    expect(helperClicks).not.toHaveBeenCalled()
  })

  it('AC-5104.1: 아직 올린 파일이 없는 종류는 판 칸에 "아직 없어요"이고, [새 파일 올리기]는 눌린다', async () => {
    latest.mockResolvedValue({ helper: HELPER, extension: null })
    await renderLoaded()
    expect(cellTexts(rowOf('크롬 확장'))).toEqual(['크롬 확장', '아직 없어요', '', '', '새 파일 올리기'])
    expect((buttonOf('크롬 확장') as HTMLButtonElement).disabled).toBe(false)
  })

  it('AC-5104.1: 목록을 읽지 못하면 E-INSTALL-READ-FAILED 안내(무엇이·어떻게·번호)가 칸 안에 보이고, 올리기 단추는 그대로 눌린다', async () => {
    latest.mockRejectedValue(new InstallFilesError('E-INSTALL-READ-FAILED'))
    render(<InstallFilesAdmin />)
    await within(card()).findByRole('alert')
    expectErrorCard('E-INSTALL-READ-FAILED')
    expect((buttonOf('도우미') as HTMLButtonElement).disabled).toBe(false)
  })

  it('AC-5104.1: 휴대폰(768px 미만)에서는 크기·올린 날 칸을 숨기고 단추는 44px 전체 폭이다', async () => {
    await renderLoaded()
    const heads = within(table()).getAllByRole('columnheader')
    for (const i of [2, 3]) hasAll(heads[i], 'max-md:hidden')
    for (const label of ['도우미', '크롬 확장'] as const) {
      const cells = within(rowOf(label)).getAllByRole('cell')
      for (const i of [2, 3]) hasAll(cells[i], 'max-md:hidden')
      for (const i of [0, 1, 4]) expect(cells[i].className).not.toMatch(/max-md:hidden/)
      hasAll(buttonOf(label), `${ds.button.secondary} max-md:w-full`)
      hasAll(buttonOf(label), 'max-md:h-11')
    }
  })

  it('AC-5104.1: 상자 안 상자가 없다(UI_GUIDE)', async () => {
    const { container } = render(<InstallFilesAdmin />)
    await waitFor(() => expect(cellTexts(rowOf('도우미'))[1]).toBe('0.9.0'))
    expect(nestedBoxes(container)).toEqual([])
  })
})

describe('InstallFilesAdmin: 올리기', () => {
  it("AC-5104.2: 파일을 고르면 uploadInstallFile을 그 파일로 부르고, 그동안 그 단추는 '올리는 중…'으로 눌리지 않는다", async () => {
    await renderLoaded()
    const pending = deferred<InstallFile>()
    upload.mockReturnValue(pending.promise)
    const chosen = zip('precheck-helper-0.9.1.zip')
    choose('도우미', chosen)
    expect(upload).toHaveBeenCalledExactlyOnceWith(chosen)
    const button = buttonOf('도우미') as HTMLButtonElement
    expect(button.textContent).toBe('올리는 중…')
    expect(button.disabled).toBe(true)
    // 다른 줄 단추는 그대로(시안 ?s=uploading)
    expect(buttonOf('크롬 확장').textContent).toBe('새 파일 올리기')
    await act(async () => {
      latest.mockResolvedValue({ helper: NEW_HELPER, extension: EXT })
      pending.resolve(NEW_HELPER)
      await pending.promise
    })
    await waitFor(() => expect(buttonOf('도우미').textContent).toBe('새 파일 올리기'))
    expect((buttonOf('도우미') as HTMLButtonElement).disabled).toBe(false)
  })

  it("AC-5104.2: 성공하면 '도우미 0.9.1을 올렸어요' 상자와 안내가 보이고 목록을 다시 읽어 새 판이 보인다", async () => {
    await renderLoaded()
    upload.mockResolvedValue(NEW_HELPER)
    latest.mockResolvedValue({ helper: NEW_HELPER, extension: EXT })
    choose('도우미', zip('precheck-helper-0.9.1.zip'))
    const status = await screen.findByText('도우미 0.9.1을 올렸어요')
    const box = status.closest('[role="status"]')
    expect(box?.textContent).toContain(DONE_BODY)
    await waitFor(() => expect(cellTexts(rowOf('도우미'))).toEqual(['도우미', '0.9.1', '889KB', '11월 17일', '새 파일 올리기']))
    expect(latest).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it("AC-5104.2: 상자의 종류 이름은 올린 파일의 종류를 따른다 — '크롬 확장 0.3.1을 올렸어요'", async () => {
    await renderLoaded()
    upload.mockResolvedValue(NEW_EXT)
    latest.mockResolvedValue({ helper: HELPER, extension: NEW_EXT })
    choose('크롬 확장', zip('precheck-extension-0.3.1.zip'))
    expect(await screen.findByText('크롬 확장 0.3.1을 올렸어요')).toBeTruthy()
    await waitFor(() => expect(cellTexts(rowOf('크롬 확장'))[1]).toBe('0.3.1'))
  })

  it.each([['E-INSTALL-FILE-NAME'], ['E-INSTALL-FILE-SIZE'], ['E-INSTALL-FILE-EXISTS'], ['E-INSTALL-UPLOAD-FAILED']] as const)(
    'AC-5104.2: 실패(%s)면 errors.ts 안내(무엇이·어떻게)와 번호가 보이고, 단추는 다시 눌리며 목록은 다시 읽지 않는다',
    async (code) => {
      await renderLoaded()
      upload.mockRejectedValue(new InstallFilesError(code))
      choose('도우미', zip('helper.zip'))
      await screen.findByRole('alert')
      expectErrorCard(code)
      expect(screen.queryByText(/을 올렸어요$/)).toBeNull()
      expect(buttonOf('도우미').textContent).toBe('새 파일 올리기')
      expect((buttonOf('도우미') as HTMLButtonElement).disabled).toBe(false)
      expect(latest).toHaveBeenCalledTimes(1)
      expect(cellTexts(rowOf('도우미'))[1]).toBe('0.9.0')
    },
  )

  it('AC-5104.2: 번호 없는 뜻밖의 실패는 E-INSTALL-UPLOAD-FAILED로 안내하고 원래 오류 글은 보이지 않는다', async () => {
    await renderLoaded()
    upload.mockRejectedValue(new Error('secret raw detail'))
    choose('도우미', zip('precheck-helper-0.9.1.zip'))
    await screen.findByRole('alert')
    expectErrorCard('E-INSTALL-UPLOAD-FAILED')
    expect(document.body.textContent).not.toContain('secret raw detail')
  })

  it('AC-5104.2: 다시 올리면 앞의 결과 상자는 지운다(실패 뒤 성공 → 오류 안내가 사라지고 성공 상자만)', async () => {
    await renderLoaded()
    upload.mockRejectedValueOnce(new InstallFilesError('E-INSTALL-FILE-EXISTS'))
    choose('도우미', zip('precheck-helper-0.9.0.zip'))
    await screen.findByRole('alert')
    upload.mockResolvedValueOnce(NEW_HELPER)
    latest.mockResolvedValue({ helper: NEW_HELPER, extension: EXT })
    choose('도우미', zip('precheck-helper-0.9.1.zip'))
    expect(await screen.findByText('도우미 0.9.1을 올렸어요')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-5104.2: 같은 파일을 다시 고를 수 있게 고른 뒤 파일 고르기를 비운다', async () => {
    await renderLoaded()
    upload.mockResolvedValue(NEW_HELPER)
    const input = inputOf('도우미')
    let cleared = false
    Object.defineProperty(input, 'value', {
      configurable: true,
      get: () => '',
      set: (v: string) => {
        if (v === '') cleared = true
      },
    })
    choose('도우미', zip('precheck-helper-0.9.1.zip'))
    expect(cleared).toBe(true)
    await screen.findByText('도우미 0.9.1을 올렸어요')
  })
})
