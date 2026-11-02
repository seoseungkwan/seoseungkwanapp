// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ds } from '@/components/ui/classes'
import { RedoDialog } from './RedoDialog'

// 다시 분석 확인 창(spec ai-report-screen REQ-711, 틀은 AdminApplications 확인 창, 글은 AC-711.1).
// 머리 단추로 초점을 돌려주는 일(AC-711.2 뒷부분)과 요청 보내기는 TASK-9가 시험한다

afterEach(cleanup)

const BODY = '지금 리포트를 덮어써요. 옛 리포트는 남지 않고, AI 비용이 한 번 더 들어요.'

function draw(month = '2026-10') {
  const onCancel = vi.fn()
  const onConfirm = vi.fn()
  const view = render(<RedoDialog month={month} onCancel={onCancel} onConfirm={onConfirm} />)
  return {
    ...view,
    onCancel,
    onConfirm,
    user: userEvent.setup(),
    dialog: screen.getByRole('dialog'),
    cancel: screen.getByRole('button', { name: '취소' }),
    confirm: screen.getByRole('button', { name: '다시 분석' }),
  }
}

describe('AC-711.1: 확인 창', () => {
  it.each([
    ['2026-10', '10월 리포트를 다시 만들까요?'],
    ['2026-01', '1월 리포트를 다시 만들까요?'],
  ])('AC-711.1: %s의 제목은 "%s"이고 aria-labelledby가 그 제목을 가리킨다', (month, title) => {
    const { dialog } = draw(month)
    const heading = screen.getByRole('heading', { name: title })
    expect(dialog.getAttribute('aria-labelledby')).toBe(heading.id)
    expect(heading.id).not.toBe('')
    screen.getByRole('dialog', { name: title })
  })

  it('AC-711.1: dialog이고 aria-modal이며 본문을 aria-describedby가 가리킨다', () => {
    const { dialog } = draw()
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    const body = screen.getByText(BODY)
    expect(dialog.getAttribute('aria-describedby')).toBe(body.id)
    expect(body.id).not.toBe('')
  })

  it('AC-711.1: 단추는 [취소] 보조 · [다시 분석] 주 단추 둘이고 위험 모양이 아니다', () => {
    const { cancel, confirm } = draw()
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['취소', '다시 분석'])
    expect(cancel.getAttribute('class')).toContain(ds.button.secondary)
    expect(confirm.getAttribute('class')).toContain(ds.button.primary)
    expect(confirm.getAttribute('class')).not.toContain(ds.button.danger)
  })

  it('AC-711.1: 창이 열리면 초점은 [다시 분석]에 있다', () => {
    const { confirm } = draw()
    expect(document.activeElement).toBe(confirm)
  })

  it('AC-711.1: 떠 있는 층과 뒤 가림막 모양이 확인 창 틀과 같다', () => {
    const { dialog } = draw()
    const classes = dialog.getAttribute('class') ?? ''
    expect(classes).toContain(ds.layer)
    expect(classes.split(' ')).toContain('max-w-100')
    expect(dialog.parentElement?.getAttribute('class')?.split(' ')).toEqual(expect.arrayContaining(['fixed', 'inset-0', 'z-30', 'bg-ink/36', 'p-4']))
  })

  it('AC-711.1: 휴대폰 폭에서 두 단추가 나란히 반씩이다', () => {
    const { cancel, confirm } = draw()
    expect(cancel.getAttribute('class')?.split(' ')).toContain('max-md:flex-1')
    expect(confirm.getAttribute('class')?.split(' ')).toContain('max-md:flex-1')
  })

  it('AC-711.1: 그리기만으로는 onConfirm·onCancel을 부르지 않는다', () => {
    const { onCancel, onConfirm } = draw()
    expect(onCancel).not.toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('AC-711.1: [다시 분석]을 누르면 onConfirm이 한 번이고 onCancel은 안 불린다', async () => {
    const { user, confirm, onCancel, onConfirm } = draw()
    await user.click(confirm)
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
  })

  // 머리 [다시 분석]에서 Enter를 누른 채면 창이 열리자마자 자동 반복이 초점 받은 [다시 분석]에 닿는다.
  // fireEvent는 기본 동작이 막히면 false를 돌려준다(브라우저는 그때 단추를 누르지 않는다)
  it('AC-711.1: 누른 채인 Enter의 자동 반복은 [다시 분석]을 누르지 못한다', () => {
    const { confirm, cancel } = draw()
    expect(fireEvent.keyDown(confirm, { key: 'Enter', repeat: true })).toBe(false)
    expect(fireEvent.keyDown(cancel, { key: 'Enter', repeat: true })).toBe(false)
  })

  it('AC-711.1: 새로 한 번 누른 Enter는 막지 않는다', () => {
    const { confirm, cancel } = draw()
    expect(fireEvent.keyDown(confirm, { key: 'Enter' })).toBe(true)
    expect(fireEvent.keyDown(cancel, { key: 'Enter' })).toBe(true)
  })
})

describe('AC-711.2: 닫기', () => {
  it('AC-711.2: [취소]는 onCancel만 한 번 부른다', async () => {
    const { user, cancel, onCancel, onConfirm } = draw()
    await user.click(cancel)
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('AC-711.2: Esc는 onCancel만 한 번 부른다', async () => {
    const { user, onCancel, onConfirm } = draw()
    await user.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('AC-711.2: 다른 글자 키는 닫지 않는다', async () => {
    const { user, onCancel } = draw()
    await user.keyboard('a')
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('AC-711.2: 뒤 가림막을 직접 누르면 onCancel만 한 번 부른다', async () => {
    const { user, dialog, onCancel, onConfirm } = draw()
    await user.click(dialog.parentElement as HTMLElement)
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('AC-711.2: 창 안 제목·본문·빈 곳을 눌러도 닫히지 않는다', async () => {
    const { user, dialog, onCancel, onConfirm } = draw()
    await user.click(screen.getByRole('heading'))
    await user.click(screen.getByText(BODY))
    await user.click(dialog)
    expect(onCancel).not.toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('AC-711.2: 언마운트 뒤 Esc는 부르지 않는다', () => {
    const { unmount, onCancel } = draw()
    unmount()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('AC-711.2: 부모가 다시 그려 onCancel이 바뀌어도 초점을 빼앗지 않고 Esc는 새 함수를 부른다', async () => {
    const { user, rerender, cancel, onCancel, onConfirm } = draw()
    await user.tab()
    expect(document.activeElement).toBe(cancel)
    const nextCancel = vi.fn()
    rerender(<RedoDialog month="2026-10" onCancel={nextCancel} onConfirm={onConfirm} />)
    expect(document.activeElement).toBe(cancel)
    await user.keyboard('{Escape}')
    expect(nextCancel).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
  })
})

describe('AC-711.1: 초점이 창 밖으로 나가지 않는다', () => {
  function drawBetween() {
    const onCancel = vi.fn()
    render(
      <>
        <button type="button">창 밖 앞</button>
        <RedoDialog month="2026-10" onCancel={onCancel} onConfirm={vi.fn()} />
        <button type="button">창 밖 뒤</button>
      </>,
    )
    return {
      user: userEvent.setup(),
      dialog: screen.getByRole('dialog'),
      cancel: screen.getByRole('button', { name: '취소' }),
      confirm: screen.getByRole('button', { name: '다시 분석' }),
    }
  }

  it('AC-711.1: Tab은 [다시 분석] → [취소] → [다시 분석]으로 돈다', async () => {
    const { user, cancel, confirm } = drawBetween()
    expect(document.activeElement).toBe(confirm)
    await user.tab()
    expect(document.activeElement).toBe(cancel)
    await user.tab()
    expect(document.activeElement).toBe(confirm)
  })

  it('AC-711.1: Shift+Tab은 [다시 분석] → [취소] → [다시 분석]으로 돈다', async () => {
    const { user, cancel, confirm } = drawBetween()
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(cancel)
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(confirm)
  })

  it('AC-711.1: 창 안 빈 곳을 눌러 초점이 창에 있어도 Tab·Shift+Tab이 창 안에 머문다', async () => {
    const { user, dialog, cancel, confirm } = drawBetween()
    await user.click(dialog)
    expect(document.activeElement).toBe(dialog)
    await user.tab()
    expect(document.activeElement).toBe(cancel)
    await user.click(dialog)
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(confirm)
  })
})
