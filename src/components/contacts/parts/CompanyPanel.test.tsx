// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { Company, CompanyFields } from '@/types/contacts'
import { BOOK, FACILITY, MEDICAL } from './book.test.data'
import { CompanyPanel } from './CompanyPanel'
import type { ChipValue, SaveResult } from './types'

// 업체 고치기·더하기 판(spec contacts AC-6505.4, 시안 기본값 9·11·12·13, ?s=edit·new). 오른쪽 판이고 업체 칸만 다룬다.
// 빈 이름·겹침(손에 든 주소록)은 보내지 않고, 콜백 답이 duplicate면 겹침 글, failed면 E-CONTACTS-SAVE-FAILED이고 적은 값은 그대로다

afterEach(cleanup)

const flush = () => act(async () => {})

type Save = (fields: CompanyFields) => Promise<SaveResult>

function draw({ company = null, category = 'all', onSave = vi.fn(async (): Promise<SaveResult> => ({ ok: true })) }: { company?: Company | null; category?: ChipValue; onSave?: Save } = {}) {
  const onClose = vi.fn()
  const onNotice = vi.fn()
  const view = render(
    <CompanyPanel mode={company ? 'edit' : 'new'} company={company} category={category} companies={BOOK.companies} onSave={onSave} onClose={onClose} onNotice={onNotice} />,
  )
  return { ...view, onSave: onSave as Mock<Save>, onClose, onNotice, panel: screen.getByRole('dialog') }
}

const pressed = () =>
  within(screen.getByRole('group', { name: '분류' }))
    .getAllByRole('button')
    .filter((b) => b.getAttribute('aria-pressed') === 'true')
    .map((b) => b.textContent)
const input = (label: string | RegExp) => screen.getByLabelText(label) as HTMLInputElement

describe('AC-6505.4: 업체 더하기 판 — 글·칸·도움', () => {
  it('AC-6505.4: 제목 업체 더하기 · 닫기 단추 · 칸 차례 · 자리표시 · 도움 · 바닥 글이 시안 그대로', () => {
    const { panel } = draw()
    expect(panel.getAttribute('aria-modal')).toBe('true')
    expect(within(panel).getByRole('heading', { name: '업체 더하기' })).toBeTruthy()
    expect(screen.getByRole('dialog', { name: '업체 더하기' })).toBe(panel)
    expect(within(panel).getByRole('button', { name: '닫기' })).toBeTruthy()
    expect(within(screen.getByRole('group', { name: '분류' })).getAllByRole('button').map((b) => b.textContent)).toEqual(['거래처', '수리·관리', '기관·보험', '기타'])
    const labels = Array.from(panel.querySelectorAll('label')).map((l) => l.textContent)
    expect(labels).toEqual(['업체 이름필수', '대표 전화', '하는 일·품목', '주소', '홈페이지', '사업자번호', '계좌', '사이트 아이디', '사이트 비밀번호', '업체 메모'])
    expect(input(/^업체 이름/).placeholder).toBe('예: 예시메디칼')
    expect(input('대표 전화').placeholder).toBe('02-000-0000')
    expect(input('하는 일·품목').placeholder).toBe('예: 의료기기 판매·수리, 충격파 기계')
    expect(input('홈페이지').placeholder).toBe('예: www.example.com')
    expect(input('사업자번호').placeholder).toBe('000-00-00000')
    expect(input('계좌').placeholder).toBe('예: 예시은행 000-000000-00-000 (예금주)')
    expect(input('사이트 아이디').placeholder).toBe('주문·수리 접수 사이트')
    expect((screen.getByLabelText('업체 메모') as HTMLTextAreaElement).placeholder).toBe('예: 주문은 오후 3시 전에')
    for (const help of [
      '엑셀로 고칠 때 업체 이름으로 찾아요. 같은 이름의 업체는 하나만 둘 수 있어요.',
      '숫자만 적어도 02-000-0000 모양으로 바꿔 보여 줘요.',
      '찾기에 쓰여요.',
      '담당자·장비는 저장한 뒤 자세히 화면에서 더해요.',
      '업체 이름만 꼭 적어요. 나머지는 비워도 돼요.',
    ]) {
      expect(within(panel).getByText(help)).toBeTruthy()
    }
    expect(within(panel).queryByText('담당자·장비·수리 기록은 자세히 화면에서 줄마다 바로 고쳐요.')).toBeNull()
    const foot = within(panel).getByText('업체 이름만 꼭 적어요. 나머지는 비워도 돼요.').parentElement!
    expect(within(foot).getAllByRole('button').map((b) => b.textContent)).toEqual(['그만두기', '저장'])
    expect(document.activeElement).toBe(input(/^업체 이름/))
  })

  it('AC-6505.4: 칸은 DB 글자 수 한도를 넘게 칠 수 없다(maxLength = CONTACT_LIMITS)', () => {
    draw()
    expect(input(/^업체 이름/).maxLength).toBe(40)
    expect(input('대표 전화').maxLength).toBe(30)
    expect(input('하는 일·품목').maxLength).toBe(100)
    expect(input('주소').maxLength).toBe(200)
    expect(input('홈페이지').maxLength).toBe(200)
    expect(input('사업자번호').maxLength).toBe(20)
    expect(input('계좌').maxLength).toBe(100)
    expect(input('사이트 아이디').maxLength).toBe(100)
    expect(input('사이트 비밀번호').maxLength).toBe(100)
    expect((screen.getByLabelText('업체 메모') as HTMLTextAreaElement).maxLength).toBe(1000)
  })

  it('AC-6505.4: 분류는 늘 하나가 골라져 있다 — 더하기는 지금 칩, 전체면 거래처, 누르면 그것 하나', () => {
    draw()
    expect(pressed()).toEqual(['거래처'])
    fireEvent.click(screen.getByRole('button', { name: '기관·보험' }))
    expect(pressed()).toEqual(['기관·보험'])
    cleanup()
    draw({ category: 'repair' })
    expect(pressed()).toEqual(['수리·관리'])
  })

  it('AC-6505.4: 계좌·사이트 비밀번호 칸은 가린 채(password) 열리고 [보기]/[가리기]로 바뀐다', () => {
    draw({ company: MEDICAL })
    expect(input('계좌').type).toBe('password')
    expect(input('사이트 비밀번호').type).toBe('password')
    const show = screen.getByRole('button', { name: '계좌 보기' })
    expect(show.textContent).toBe('보기')
    fireEvent.click(show)
    expect(input('계좌').type).toBe('text')
    expect(show.textContent).toBe('가리기')
    expect(show.getAttribute('aria-pressed')).toBe('true')
    expect(input('사이트 비밀번호').type).toBe('password')
    fireEvent.click(show)
    expect(input('계좌').type).toBe('password')
  })
})

describe('AC-6505.4: 업체 고치기 판', () => {
  it('AC-6505.4: 제목 업체 고치기 · 지금 값이 칸에 · 분류는 그 업체 것 · 고치기 도움 글', () => {
    const { panel } = draw({ company: MEDICAL, category: 'agency' })
    expect(screen.getByRole('dialog', { name: '업체 고치기' })).toBe(panel)
    expect(pressed()).toEqual(['거래처'])
    expect(input(/^업체 이름/).value).toBe('예시메디칼')
    expect(input('대표 전화').value).toBe('02-000-0001')
    expect(input('계좌').value).toBe(MEDICAL.account)
    expect(input('사이트 비밀번호').value).toBe('Yesi2026!')
    expect((screen.getByLabelText('업체 메모') as HTMLTextAreaElement).value).toBe(MEDICAL.memo)
    expect(within(panel).getByText('담당자·장비·수리 기록은 자세히 화면에서 줄마다 바로 고쳐요.')).toBeTruthy()
    expect(within(panel).queryByText('담당자·장비는 저장한 뒤 자세히 화면에서 더해요.')).toBeNull()
  })

  it('AC-6505.4: 저장되면 고친 칸 전부를 onSave로 보내고 저장했어요. 뒤 판을 닫는다', async () => {
    const { onSave, onClose, onNotice } = draw({ company: FACILITY })
    fireEvent.change(input('주소'), { target: { value: '서울시 예시구 예시로 99' } })
    fireEvent.click(screen.getByRole('button', { name: '기타' }))
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await flush()
    expect(onSave).toHaveBeenCalledWith({ ...FACILITY, id: undefined, category: 'other', address: '서울시 예시구 예시로 99' })
    expect(Object.keys(onSave.mock.calls[0]![0] as object)).not.toContain('id')
    expect(onNotice).toHaveBeenCalledWith('저장했어요.')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('AC-6505.4: 자기 이름 그대로 저장하는 것은 겹침이 아니다', async () => {
    const { onSave } = draw({ company: MEDICAL })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await flush()
    expect(onSave).toHaveBeenCalledOnce()
  })
})

describe('AC-6505.4: 빈 이름·겹침·실패', () => {
  it('AC-6505.4: 업체 이름이 빈 채 [저장]이면 칸 아래 업체 이름을 적어 주세요.와 바닥 업체 이름을 적으면 저장할 수 있어요., 보내지 않는다', () => {
    const { onSave, panel } = draw()
    fireEvent.change(input('대표 전화'), { target: { value: '02-000-0099' } })
    fireEvent.change(input(/^업체 이름/), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(within(panel).getByText('업체 이름을 적어 주세요.')).toBeTruthy()
    expect(within(panel).getByText('업체 이름을 적으면 저장할 수 있어요.').className).toContain('text-negative')
    expect(within(panel).queryByText('업체 이름만 꼭 적어요. 나머지는 비워도 돼요.')).toBeNull()
    expect(input(/^업체 이름/).getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(input(/^업체 이름/))
    expect(onSave).not.toHaveBeenCalled()
  })

  it('AC-6505.4: 손에 든 주소록에 같은 이름(앞뒤 빈칸 무시)이 있으면 같은 이름의 업체가 이미 있어요.이고 보내지 않는다', () => {
    const { onSave, panel } = draw()
    fireEvent.change(input(/^업체 이름/), { target: { value: ' 예시약품 ' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(within(panel).getByText('같은 이름의 업체가 이미 있어요.')).toBeTruthy()
    expect(onSave).not.toHaveBeenCalled()
    cleanup()
    const edit = draw({ company: MEDICAL })
    fireEvent.change(input(/^업체 이름/), { target: { value: '예시설비' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(within(edit.panel).getByText('같은 이름의 업체가 이미 있어요.')).toBeTruthy()
    expect(edit.onSave).not.toHaveBeenCalled()
  })

  it('AC-6505.4: 콜백이 duplicate면 같은 이름 글이고 판은 열려 있다', async () => {
    const onSave = vi.fn(async (): Promise<SaveResult> => ({ ok: false, reason: 'duplicate' }))
    const { onClose, onNotice, panel } = draw({ onSave })
    fireEvent.change(input(/^업체 이름/), { target: { value: '예시재활기기' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await flush()
    expect(within(panel).getByText('같은 이름의 업체가 이미 있어요.')).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
    expect(onNotice).not.toHaveBeenCalled()
  })

  it('AC-6505.4: 실패면 E-CONTACTS-SAVE-FAILED 카드(판 바닥)이고 적은 값은 판에 그대로다', async () => {
    const onSave = vi.fn(async (): Promise<SaveResult> => ({ ok: false, reason: 'failed' }))
    const { onClose, panel } = draw({ onSave })
    fireEvent.change(input(/^업체 이름/), { target: { value: '예시재활기기' } })
    fireEvent.change(input('계좌'), { target: { value: '예시은행 000-000000-00-040' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await flush()
    const alert = within(panel).getByRole('alert')
    expect(alert.textContent).toBe('주소록을 바꾸지 못했어요적은 값은 그대로예요. 인터넷 연결을 확인하고 다시 눌러 주세요오류 번호 E-CONTACTS-SAVE-FAILED')
    expect(input(/^업체 이름/).value).toBe('예시재활기기')
    expect(input('계좌').value).toBe('예시은행 000-000000-00-040')
    expect(onClose).not.toHaveBeenCalled()
    // 다시 누르면 다시 보낸다(되면 카드가 사라짐)
    onSave.mockResolvedValueOnce({ ok: true })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await flush()
    expect(onSave).toHaveBeenCalledTimes(2)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('AC-6505.4: 보내는 동안 [저장]을 또 눌러도 한 번만 보낸다', async () => {
    let finish: (r: SaveResult) => void = () => {}
    const onSave = vi.fn(() => new Promise<SaveResult>((resolve) => (finish = resolve)))
    draw({ onSave })
    fireEvent.change(input(/^업체 이름/), { target: { value: '예시재활기기' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(screen.getByRole('button', { name: '저장' }).getAttribute('aria-busy')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(onSave).toHaveBeenCalledOnce()
    await act(async () => finish({ ok: true }))
  })
})

describe('AC-6505.4: 닫기', () => {
  it('AC-6505.4: [닫기]·[그만두기]·Esc·바탕 누름은 보내지 않고 onClose', () => {
    const { onClose, onSave, container } = draw()
    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    fireEvent.click(screen.getByRole('button', { name: '그만두기' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(container.ownerDocument.querySelector('[data-scrim]')!)
    expect(onClose).toHaveBeenCalledTimes(4)
    expect(onSave).not.toHaveBeenCalled()
  })
})
