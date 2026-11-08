// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyText } from './copyMemo'

// 우리 메모를 클립보드에(AC-3103.1·AC-3103.3). 브라우저 클립보드가 안 되면 숨긴 글 칸 + execCommand('copy')로 한 번 더 한다. 글은 지어낸 것이다

const TEXT = '◈가상 메모 첫 줄\n◈둘째 줄'

function setClipboard(clipboard: unknown) {
  Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true })
}
function setExec(impl: (command: string) => boolean) {
  const exec = vi.fn(impl)
  Object.defineProperty(document, 'execCommand', { value: exec, configurable: true })
  return exec
}

afterEach(() => {
  setClipboard(undefined)
  Object.defineProperty(document, 'execCommand', { value: undefined, configurable: true })
  vi.restoreAllMocks()
})

describe('AC-3103.1·AC-3103.3 copyText', () => {
  it('AC-3103.1: 클립보드가 받으면 그 글 그대로 넣고 true다(예비 방법은 쓰지 않는다)', async () => {
    const writeText = vi.fn(async () => {})
    setClipboard({ writeText })
    const exec = setExec(() => true)
    await expect(copyText(TEXT)).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith(TEXT)
    expect(exec).not.toHaveBeenCalled()
  })

  it('AC-3103.1: 클립보드가 거절하면 숨긴 글 칸으로 한 번 더 하고, 되면 true이며 칸을 남기지 않는다', async () => {
    setClipboard({ writeText: vi.fn(async () => Promise.reject(new Error('막힘'))) })
    let copied = ''
    const exec = setExec((command) => {
      const area = document.activeElement as HTMLTextAreaElement
      copied = area.value
      return command === 'copy'
    })
    await expect(copyText(TEXT)).resolves.toBe(true)
    expect(exec).toHaveBeenCalledWith('copy')
    expect(copied).toBe(TEXT)
    expect(document.querySelectorAll('textarea')).toHaveLength(0)
  })

  it('AC-3103.1: 클립보드가 없어도 예비 방법이 되면 true다', async () => {
    setClipboard(undefined)
    setExec(() => true)
    await expect(copyText(TEXT)).resolves.toBe(true)
  })

  it('AC-3103.3: 클립보드도 예비 방법도 안 되면 false이고 오류를 밖으로 던지지 않는다', async () => {
    setClipboard({ writeText: vi.fn(async () => Promise.reject(new Error(TEXT))) })
    setExec(() => false)
    await expect(copyText(TEXT)).resolves.toBe(false)
    expect(document.querySelectorAll('textarea')).toHaveLength(0)
  })

  it('AC-3103.3: 예비 방법이 던져도 false이고 칸을 남기지 않는다', async () => {
    setClipboard(undefined)
    setExec(() => {
      throw new Error(TEXT)
    })
    await expect(copyText(TEXT)).resolves.toBe(false)
    expect(document.querySelectorAll('textarea')).toHaveLength(0)
  })

  it('AC-3103.3: 예비 방법조차 없으면 false다', async () => {
    setClipboard(undefined)
    await expect(copyText(TEXT)).resolves.toBe(false)
  })
})
