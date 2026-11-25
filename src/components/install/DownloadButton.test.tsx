// @vitest-environment jsdom
// 설치 파일 받기 단추 (specs/helper-download TASK-2, REQ-5103 · AC-5103.1·AC-5103.3, design.md '화면', 시안 docs/mockups/helper-download ?s=setup·none).
// library TASK-5(AC-8109.4): 단추는 자료실의 그 종류 최신 판을 준다 — 코드는 그대로이고 옆 글 크기만 자료실과 같은 sizeText(1KB = 1,024바이트)다.
// 목록은 가짜다: latestInstallFiles·downloadInstallFile만 바꾸고 옆 글(installMeta)은 진짜 함수를 쓴다. 파일 이름·크기·날짜는 지어낸 값이다
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ds } from '@/components/ui/classes'
import { errorInfo } from '@/lib/errors'
import type { InstallFile, InstallKind } from '@/lib/storage/installFiles'
import type { ErrorCode } from '@/types/errors'
import { DownloadButton } from './DownloadButton'

const store = vi.hoisted(() => ({ latest: vi.fn(), download: vi.fn() }))
vi.mock('@/lib/storage/installFiles', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/storage/installFiles')>()
  return { ...real, latestInstallFiles: store.latest, downloadInstallFile: store.download }
})
const { InstallFilesError } = await import('@/lib/storage/installFiles')

const CREATED = '2026-11-17T01:00:00.000Z' // 한국 11월 17일 10시
const HELPER: InstallFile = { kind: 'helper', version: [0, 9, 0], name: 'precheck-helper-0.9.0.zip', path: 'helper/precheck-helper-0.9.0.zip', size: 889_612, uploadedAt: CREATED }
const EXTENSION: InstallFile = { kind: 'extension', version: [0, 3, 0], name: 'precheck-extension-0.3.0.zip', path: 'extension/precheck-extension-0.3.0.zip', size: 6_480, uploadedAt: CREATED }
const BOTH: Record<InstallKind, InstallFile | null> = { helper: HELPER, extension: EXTENSION }
const HELPER_META = '0.9.0 · 869KB · 11월 17일 올림' // 889,612바이트 = 868.8KB → 869KB
const EXTENSION_META = '0.3.0 · 6KB · 11월 17일 올림'
const NONE = '아직 받을 파일이 없어요. 관리자에게 알려 주세요.'
const SECRET = 'StorageApiError secret detail'

/** 바로 답하지 않는 약속(끝내기를 밖에서 부른다) */
function later<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const tokens = (classes: string) => classes.split(/\s+/).filter(Boolean)
const hasAll = (el: Element, classes: string) => expect(tokens(el.getAttribute('class') ?? '')).toEqual(expect.arrayContaining(tokens(classes)))
const hasNone = (el: Element, classes: string) => {
  for (const t of tokens(classes)) expect(tokens(el.getAttribute('class') ?? ''), t).not.toContain(t)
}
function expectInfo(el: HTMLElement, code: ErrorCode) {
  const info = errorInfo(code)
  expect(el.textContent).toContain(info.what)
  expect(el.textContent).toContain(info.fix)
  expect(el.textContent).toContain(`오류 번호 ${code}`)
}

/** 단추 줄 하나(StepGuide의 단추 줄처럼 flex)에 단추를 놓는다 */
function renderRow(props: Parameters<typeof DownloadButton>[0]) {
  render(
    <div data-testid="row" className="flex flex-wrap gap-2">
      <DownloadButton {...props} />
      <button type="button">다시 확인</button>
    </div>,
  )
  return screen.getByTestId('row')
}
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement

beforeEach(() => {
  store.latest.mockReset().mockResolvedValue(BOTH)
  store.download.mockReset().mockResolvedValue(undefined)
})
afterEach(() => cleanup())

describe('AC-5103.1 받기 단추와 옆 글', () => {
  it('AC-5103.1·AC-8109.4: 파일이 있으면 [도우미 내려받기](주 단추, 링크 아님)가 눌리고 바로 옆에 installMeta 글 "판 · 크기 · M월 D일 올림"(크기는 자료실 sizeText)이 보인다', async () => {
    const row = renderRow({ kind: 'helper', label: '도우미 내려받기', variant: 'primary' })
    const meta = await within(row).findByText(HELPER_META)
    const get = button('도우미 내려받기')
    expect(get.tagName).toBe('BUTTON')
    expect(get.getAttribute('type')).toBe('button')
    expect(get.disabled).toBe(false)
    expect(get.getAttribute('href')).toBeNull()
    expect(within(row).queryByRole('link')).toBeNull()
    hasAll(get, ds.button.primary)
    // 단추 → 옆 글 → (다음 단추) 차례, 단추 글은 이름 그대로
    expect(get.textContent).toBe('도우미 내려받기')
    expect(get.nextElementSibling).toBe(meta)
    hasAll(meta, 'text-small text-muted')
    expect(row.textContent).not.toContain(NONE)
  })

  it('AC-5103.1: 보조 단추(variant secondary)는 ds 보조 모양이고, 확장은 확장 파일의 옆 글이다', async () => {
    const row = renderRow({ kind: 'extension', label: '확장 내려받기', variant: 'secondary' })
    await within(row).findByText(EXTENSION_META)
    const get = button('확장 내려받기')
    hasAll(get, ds.button.secondary)
    hasNone(get, 'bg-accent text-surface')
    expect(row.textContent).not.toContain(HELPER_META)
  })

  it('AC-5103.1·AC-8109.4: 그 종류 파일이 없으면 단추는 눌리지 않고 옆에 "아직 받을 파일이 없어요. 관리자에게 알려 주세요."가 보인다', async () => {
    store.latest.mockResolvedValue({ helper: null, extension: EXTENSION })
    const row = renderRow({ kind: 'helper', label: '도우미 내려받기', variant: 'primary' })
    const none = await within(row).findByText(NONE)
    const get = button('도우미 내려받기')
    expect(get.disabled).toBe(true)
    expect(get.nextElementSibling).toBe(none)
    await userEvent.setup().click(get)
    expect(store.download).not.toHaveBeenCalled()
    expect(row.textContent).not.toContain('올림')
  })

  it('AC-5103.1: 목록을 읽는 동안은 단추가 눌리지 않고 옆 글·없음 안내가 없다', () => {
    store.latest.mockReturnValue(new Promise(() => {}))
    const row = renderRow({ kind: 'helper', label: '도우미 내려받기', variant: 'primary' })
    expect(button('도우미 내려받기').disabled).toBe(true)
    expect(row.textContent).toBe('도우미 내려받기다시 확인')
  })

  it('AC-5103.1: 누르면 그 파일로 downloadInstallFile을 한 번 부르고, 받는 동안 기다림(aria-busy) 모양이며 다시 눌러도 또 부르지 않는다', async () => {
    const pending = later<void>()
    store.download.mockReturnValue(pending.promise)
    renderRow({ kind: 'helper', label: '도우미 내려받기', variant: 'primary' })
    await screen.findByText(HELPER_META)
    const user = userEvent.setup()
    await user.click(button('도우미 내려받기'))
    expect(store.download).toHaveBeenCalledTimes(1)
    expect(store.download).toHaveBeenCalledWith(HELPER)
    expect(button('도우미 내려받기').getAttribute('aria-busy')).toBe('true')
    await user.click(button('도우미 내려받기'))
    expect(store.download).toHaveBeenCalledTimes(1)
    await act(async () => pending.resolve())
    await waitFor(() => expect(button('도우미 내려받기').getAttribute('aria-busy')).toBeNull())
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-5103.1: 화면 하나의 두 단추는 목록을 한 번만 읽고, 화면을 닫았다 다시 열면 새로 읽는다', async () => {
    render(
      <div>
        <DownloadButton kind="extension" label="확장 내려받기" variant="secondary" />
        <DownloadButton kind="helper" label="도우미 내려받기" variant="secondary" />
      </div>,
    )
    await screen.findByText(HELPER_META)
    expect(screen.getByText(EXTENSION_META)).toBeTruthy()
    expect(store.latest).toHaveBeenCalledTimes(1)
    cleanup()
    renderRow({ kind: 'helper', label: '도우미 내려받기', variant: 'primary' })
    await screen.findByText(HELPER_META)
    expect(store.latest).toHaveBeenCalledTimes(2)
  })

  it('AC-5103.1: 768px 미만은 44px 전체 폭이다(ds 단추의 max-md:h-11 + max-md:w-full)', async () => {
    renderRow({ kind: 'helper', label: '도우미 내려받기', variant: 'primary' })
    await screen.findByText(HELPER_META)
    hasAll(button('도우미 내려받기'), 'max-md:h-11 max-md:w-full')
    cleanup()
    renderRow({ kind: 'extension', label: '확장 내려받기', variant: 'secondary' })
    await screen.findByText(EXTENSION_META)
    hasAll(button('확장 내려받기'), 'max-md:h-11 max-md:w-full')
  })
})

describe('AC-5103.3 받기·목록 실패', () => {
  it('AC-5103.3: 받기가 실패하면 단추 바로 아래 같은 줄에 E-INSTALL-DOWNLOAD-FAILED 안내(무엇이·어떻게·번호)가 보이고, 원래 오류 글은 없다', async () => {
    store.download.mockRejectedValue(new InstallFilesError('E-INSTALL-DOWNLOAD-FAILED'))
    const row = renderRow({ kind: 'helper', label: '도우미 내려받기', variant: 'primary' })
    await screen.findByText(HELPER_META)
    await userEvent.setup().click(button('도우미 내려받기'))
    const alert = await within(row).findByRole('alert')
    expectInfo(alert, 'E-INSTALL-DOWNLOAD-FAILED')
    // 무엇이 글에 마침표가 하나만
    expect(alert.textContent).not.toContain('..')
    // 단추 줄 안, 단추 뒤
    expect(row.contains(alert)).toBe(true)
    expect(button('도우미 내려받기').compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // 다시 누를 수 있다
    expect(button('도우미 내려받기').disabled).toBe(false)
  })

  it('AC-5103.3: 다시 눌러 받으면 실패 안내가 사라진다', async () => {
    store.download.mockRejectedValueOnce(new Error(SECRET)).mockResolvedValueOnce(undefined)
    const row = renderRow({ kind: 'helper', label: '도우미 내려받기', variant: 'primary' })
    await screen.findByText(HELPER_META)
    const user = userEvent.setup()
    await user.click(button('도우미 내려받기'))
    const alert = await within(row).findByRole('alert')
    // 다른 모양의 실패도 받기 실패 번호 하나로 보이고 원래 글은 없다
    expectInfo(alert, 'E-INSTALL-DOWNLOAD-FAILED')
    expect(document.body.textContent).not.toContain(SECRET)
    await user.click(button('도우미 내려받기'))
    await waitFor(() => expect(within(row).queryByRole('alert')).toBeNull())
    expect(store.download).toHaveBeenCalledTimes(2)
  })

  it('AC-5103.3: 목록 읽기가 실패하면 단추는 눌리지 않고 그 자리에 E-INSTALL-READ-FAILED 안내가 보인다(원래 오류 글 없음)', async () => {
    store.latest.mockRejectedValue(new Error(SECRET))
    const row = renderRow({ kind: 'helper', label: '도우미 내려받기', variant: 'primary' })
    const alert = await within(row).findByRole('alert')
    expectInfo(alert, 'E-INSTALL-READ-FAILED')
    expect(button('도우미 내려받기').disabled).toBe(true)
    expect(document.body.textContent).not.toContain(SECRET)
    expect(row.textContent).not.toContain(NONE)
  })
})
