// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DeleteDialog, deleteNotice } from './DeleteDialog'
import type { SaveResult } from './types'

// 지우기 확인 창(spec contacts AC-6505.7, 시안 ?s=delete-confirm). 업체·장비만 묻는다. 을(를)·이(가)는 받침으로 하나만

afterEach(cleanup)

const flush = () => act(async () => {})

describe('AC-6505.7: 지우기 확인 창', () => {
  it('AC-6505.7: 업체 창 — 제목·함께 지워짐·수 글(담당자 {n}명 · 장비 {n}대 · 수리 기록 {n}줄), 가림막 위 alertdialog', () => {
    render(<DeleteDialog target={{ kind: 'company', name: '예시메디칼', people: 2, equipment: 2, repairs: 4 }} onCancel={() => {}} onConfirm={async () => ({ ok: true })} onDone={() => {}} />)
    const dialog = screen.getByRole('alertdialog', { name: '예시메디칼을 지울까요?' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(Array.from(dialog.querySelectorAll('p')).map((p) => p.textContent)).toEqual([
      '담당자·장비·수리 기록도 함께 지워져요.',
      '이 업체에는 담당자 2명 · 장비 2대 · 수리 기록 4줄이 있어요. 지우면 되돌릴 수 없어요.',
    ])
  })

  it('AC-6505.7: 수 글은 있는 것만, 마지막 말 받침으로 이/가를 고른다', () => {
    const { rerender } = render(
      <DeleteDialog target={{ kind: 'company', name: 'ABC', people: 0, equipment: 3, repairs: 0 }} onCancel={() => {}} onConfirm={async () => ({ ok: true })} onDone={() => {}} />,
    )
    // 한글이 아니면 받침 있음으로 본다(을)
    expect(screen.getByRole('alertdialog', { name: 'ABC을 지울까요?' })).toBeTruthy()
    expect(screen.getByText('이 업체에는 장비 3대가 있어요. 지우면 되돌릴 수 없어요.')).toBeTruthy()
    rerender(
      <DeleteDialog target={{ kind: 'company', name: '예시상사', people: 1, equipment: 0, repairs: 0 }} onCancel={() => {}} onConfirm={async () => ({ ok: true })} onDone={() => {}} />,
    )
    expect(screen.getByText('이 업체에는 담당자 1명이 있어요. 지우면 되돌릴 수 없어요.')).toBeTruthy()
  })

  it('AC-6505.7: 장비 창 — 수리 기록 {n}줄도 함께 지워져요. / 없으면 이 장비를 주소록에서 지워요. · 지우면 되돌릴 수 없어요.', () => {
    const { rerender } = render(<DeleteDialog target={{ kind: 'equipment', name: '충격파 기계', repairs: 3 }} onCancel={() => {}} onConfirm={async () => ({ ok: true })} onDone={() => {}} />)
    const dialog = screen.getByRole('alertdialog', { name: '충격파 기계를 지울까요?' })
    expect(Array.from(dialog.querySelectorAll('p')).map((p) => p.textContent)).toEqual(['수리 기록 3줄도 함께 지워져요.', '지우면 되돌릴 수 없어요.'])
    rerender(<DeleteDialog target={{ kind: 'equipment', name: '견인 치료기', repairs: 0 }} onCancel={() => {}} onConfirm={async () => ({ ok: true })} onDone={() => {}} />)
    expect(Array.from(screen.getByRole('alertdialog').querySelectorAll('p')).map((p) => p.textContent)).toEqual(['이 장비를 주소록에서 지워요.', '지우면 되돌릴 수 없어요.'])
  })

  it('AC-6505.7: 열리면 초점은 [그만두기], Esc·가림막·[그만두기]는 지우지 않고 onCancel', () => {
    const onCancel = vi.fn()
    const onConfirm = vi.fn(async (): Promise<SaveResult> => ({ ok: true }))
    render(<DeleteDialog target={{ kind: 'equipment', name: '충격파 기계', repairs: 0 }} onCancel={onCancel} onConfirm={onConfirm} onDone={() => {}} />)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '그만두기' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(document.querySelector('[data-scrim]')!)
    fireEvent.click(screen.getByRole('button', { name: '그만두기' }))
    expect(onCancel).toHaveBeenCalledTimes(3)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('AC-6505.7: [지우기] → onConfirm 한 번, 되면 onDone, 실패면 창 안에 E-CONTACTS-SAVE-FAILED 카드(다시 누를 수 있음)', async () => {
    const onDone = vi.fn()
    const onConfirm = vi.fn<() => Promise<SaveResult>>().mockResolvedValueOnce({ ok: false, reason: 'failed' }).mockResolvedValueOnce({ ok: true })
    render(<DeleteDialog target={{ kind: 'equipment', name: '충격파 기계', repairs: 0 }} onCancel={() => {}} onConfirm={onConfirm} onDone={onDone} />)
    const dialog = screen.getByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: '지우기' }))
    await flush()
    expect(within(dialog).getByRole('alert').textContent).toContain('오류 번호 E-CONTACTS-SAVE-FAILED')
    expect(onDone).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: '지우기' }))
    await flush()
    expect(onConfirm).toHaveBeenCalledTimes(2)
    expect(onDone).toHaveBeenCalledOnce()
  })

  it('AC-6505.7: 지운 뒤 알림 글 {이름}을(를) 지웠어요.', () => {
    expect(deleteNotice('예시메디칼')).toBe('예시메디칼을 지웠어요.')
    expect(deleteNotice('충격파 기계')).toBe('충격파 기계를 지웠어요.')
  })
})
