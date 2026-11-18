// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readMemo, READ_KEYS } from '@/lib/precheck/memo/onboarding/readMemo'
import { PasteBox } from './PasteBox'

// 처음 질문의 붙여 넣기 칸(clinic-profile AC-6614.2, design.md 16절). 붙인 글은 이 칸의 상태에만 있고 위로는 readMemo 결과만 간다.
// 이 파일도 붙여 넣기 울타리(네트워크·저장소·console 금지) 아래 있다 → 전역은 이름 글자로만 바꿔 끼워 본다(vi.stubGlobal)

const NOTE = '환자 이름·번호는 빼고 붙여 주세요. 이 글은 이 PC 밖으로 나가지 않아요.'
/** 붙이는 예전 메모. '홍길동'은 메모 모양과 상관없는 표시 글자다 — 어디에도 나가면 안 된다 */
const MARKER = '홍길동'
const PASTED = ['◈MBB L4,5,S1 both 홍길동', '◈SNB 우측', '◈IA injection of - Rt shoulder', '◈K-L grade (3)/(3)'].join('\n')

type User = ReturnType<typeof userEvent.setup>
const box = () => screen.getByRole('textbox', { name: '예전 메모' }) as HTMLTextAreaElement
async function paste(user: User, text = PASTED) {
  await user.click(box())
  await user.paste(text)
}
const rowOf = (item: string) => screen.getByRole('row', { name: new RegExp(`^${item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) })

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('AC-6614.2 붙여 넣기 칸(PasteBox)', () => {
  it("AC-6614.2: 칸 위에 '환자 이름·번호는 빼고 붙여 주세요. 이 글은 이 PC 밖으로 나가지 않아요.'가 보이고 [읽기]가 있다", () => {
    render(<PasteBox onStart={vi.fn()} />)
    const note = screen.getByText(NOTE)
    // 칸보다 앞(위)에 있다
    expect(note.compareDocumentPosition(box()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(box().getAttribute('aria-describedby')).toBe(note.id)
    expect(screen.getByRole('button', { name: '읽기' })).toBeTruthy()
    // 아직 읽기 전이라 표와 [이 답으로 시작]이 없다
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByRole('button', { name: '이 답으로 시작' })).toBeNull()
  })

  it("AC-6614.2: [읽기]를 누르면 표('항목' · '읽은 값' · '결과')에 항목마다 '읽었어요' · '섞여 있어요. 질문에서 골라요' · '못 찾았어요' 중 하나가 보인다", async () => {
    const user = userEvent.setup()
    render(<PasteBox onStart={vi.fn()} />)
    await paste(user)
    await user.click(screen.getByRole('button', { name: '읽기' }))
    const table = screen.getByRole('table')
    expect(within(table).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['항목', '읽은 값', '결과'])
    const body = within(table).getAllByRole('row').slice(1)
    expect(body).toHaveLength(READ_KEYS.length)
    for (const row of body) expect(['읽었어요', '섞여 있어요. 질문에서 골라요', '못 찾았어요']).toContain(row.lastElementChild?.textContent)
    // Rt·both와 우측이 섞였다 / 레벨은 쉼표 / 줄 머리 ◈ / C-arm 글자는 없다
    expect(rowOf('좌우 모양').lastElementChild?.textContent).toBe('섞여 있어요. 질문에서 골라요')
    expect([...rowOf('레벨').children].map((td) => td.textContent)).toEqual(['레벨', 'L4,5,S1', '읽었어요'])
    expect([...rowOf('줄 머리 기호').children].map((td) => td.textContent)).toEqual(['줄 머리 기호', '◈', '읽었어요'])
    expect(rowOf('K-L 문장').children[1].textContent).toBe('K-L grade (n)/(n)')
    expect(rowOf('신경차단술 C-arm 글자').lastElementChild?.textContent).toBe('못 찾았어요')
    expect(screen.getByRole('button', { name: '이 답으로 시작' })).toBeTruthy()
  })

  it('AC-6614.2: [이 답으로 시작]은 readMemo 결과만 위로 올린다 — 붙인 글은 올라가지 않는다', async () => {
    const user = userEvent.setup()
    const onStart = vi.fn()
    render(<PasteBox onStart={onStart} />)
    await paste(user)
    await user.click(screen.getByRole('button', { name: '읽기' }))
    await user.click(screen.getByRole('button', { name: '이 답으로 시작' }))
    expect(onStart).toHaveBeenCalledTimes(1)
    expect(onStart.mock.calls[0]).toEqual([readMemo(PASTED)])
    expect(JSON.stringify(onStart.mock.calls)).not.toContain(MARKER)
  })

  it('AC-6614.2: 읽은 뒤 글을 고치면 옛 표는 사라지고 다시 [읽기]를 눌러야 한다. 빈 칸이면 [읽기]가 막혀 있다', async () => {
    const user = userEvent.setup()
    render(<PasteBox onStart={vi.fn()} />)
    expect((screen.getByRole('button', { name: '읽기' }) as HTMLButtonElement).disabled).toBe(true)
    await paste(user)
    await user.click(screen.getByRole('button', { name: '읽기' }))
    expect(screen.getByRole('table')).toBeTruthy()
    await user.type(box(), 'x')
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByRole('button', { name: '이 답으로 시작' })).toBeNull()
  })

  it('AC-6614.2: 칸은 맞춤법 검사·자동 완성을 끈다(브라우저가 글을 밖의 맞춤법 서버로 보내지 않게)', () => {
    render(<PasteBox onStart={vi.fn()} />)
    expect(box().getAttribute('spellcheck')).toBe('false')
    expect(box().getAttribute('autocomplete')).toBe('off')
  })

  describe('AC-6614.2: 붙인 글은 보내지도, 저장하지도, 기록하지도 않으며 이 화면을 떠나면 사라진다', () => {
    const sent = { http: vi.fn(), xhr: vi.fn(), socket: vi.fn(), source: vi.fn() }
    const stored = { local: vi.fn(), session: vi.fn(), idb: vi.fn() }
    const logs = { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn() }
    const storage = (setItem: ReturnType<typeof vi.fn>) => ({ setItem, getItem: () => null, removeItem: vi.fn(), clear: vi.fn(), key: () => null, length: 0 })

    beforeEach(() => {
      for (const fn of [...Object.values(sent), ...Object.values(stored), ...Object.values(logs)]) fn.mockReset()
      vi.stubGlobal('fetch', sent.http)
      vi.stubGlobal('XMLHttpRequest', sent.xhr)
      vi.stubGlobal('WebSocket', sent.socket)
      vi.stubGlobal('EventSource', sent.source)
      vi.stubGlobal('localStorage', storage(stored.local))
      vi.stubGlobal('sessionStorage', storage(stored.session))
      vi.stubGlobal('indexedDB', { open: stored.idb })
      vi.stubGlobal('console', logs)
    })

    it('AC-6614.2: 붙이고 · 읽고 · 시작하고 · 화면을 떠나도 네트워크·저장소·console로 가지 않는다', async () => {
      const user = userEvent.setup()
      const { unmount } = render(<PasteBox onStart={vi.fn()} />)
      await paste(user)
      await user.click(screen.getByRole('button', { name: '읽기' }))
      await user.click(screen.getByRole('button', { name: '이 답으로 시작' }))
      unmount()
      for (const fn of Object.values(sent)) expect(fn).not.toHaveBeenCalled()
      for (const fn of Object.values(stored)) expect(fn).not.toHaveBeenCalled()
      for (const fn of Object.values(logs)) expect(JSON.stringify(fn.mock.calls)).not.toContain(MARKER)
      expect(document.cookie).not.toContain(MARKER)
      expect(document.body.textContent).not.toContain(MARKER)
    })

    it('AC-6614.2: 다시 열면 칸은 빈 칸이다(글은 그 칸의 상태에만 있었다)', async () => {
      const user = userEvent.setup()
      const first = render(<PasteBox onStart={vi.fn()} />)
      await paste(user)
      expect(box().value).toContain(MARKER)
      first.unmount()
      render(<PasteBox onStart={vi.fn()} />)
      expect(box().value).toBe('')
      expect(document.body.textContent).not.toContain(MARKER)
    })
  })
})
