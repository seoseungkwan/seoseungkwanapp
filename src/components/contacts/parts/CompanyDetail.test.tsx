// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Company } from '@/types/contacts'
import { BOOK, FACILITY, installClipboard, installMatchMedia, IT, MEDICAL, PHYSIO, TAX, TODAY } from './book.test.data'
import { CompanyDetail } from './CompanyDetail'
import type { SaveResult } from './types'

// 업체 자세히(spec contacts AC-6505.2·AC-6505.5·AC-6505.6·AC-6505.7, 시안 기본값 5·6·9·10·11·14·15·16, ?s=detail·pw-shown·repair-add·delete-confirm).
// 부품은 book·고른 업체·오늘을 받아 그리고, 고치기·지우기는 콜백(Promise<SaveResult>)으로 넘긴다. 저장·읽기·Supabase는 화면(TASK-7)이 한다

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  Reflect.deleteProperty(window, 'matchMedia')
  Reflect.deleteProperty(navigator, 'clipboard')
})
beforeEach(() => {
  installMatchMedia(false)
})

const OK: SaveResult = { ok: true }
const FAILED: SaveResult = { ok: false, reason: 'failed' }
const DUPLICATE: SaveResult = { ok: false, reason: 'duplicate' }

function handlers() {
  return {
    onEdit: vi.fn(),
    onDeleteCompany: vi.fn(async (): Promise<SaveResult> => OK),
    onSavePerson: vi.fn(async (): Promise<SaveResult> => OK),
    onDeletePerson: vi.fn(async (): Promise<SaveResult> => OK),
    onSaveEquipment: vi.fn(async (): Promise<SaveResult> => OK),
    onDeleteEquipment: vi.fn(async (): Promise<SaveResult> => OK),
    onSaveRepair: vi.fn(async (): Promise<SaveResult> => OK),
    onDeleteRepair: vi.fn(async (): Promise<SaveResult> => OK),
    onNotice: vi.fn(),
  }
}

function draw(company: Company = MEDICAL, over: Partial<ReturnType<typeof handlers>> = {}) {
  const h = { ...handlers(), ...over }
  const view = render(<CompanyDetail book={BOOK} company={company} today={TODAY} {...h} />)
  const redraw = (next: Company) => view.rerender(<CompanyDetail book={BOOK} company={next} today={TODAY} {...h} />)
  return { ...view, h, redraw }
}

const section = (name: string) => screen.getByRole('region', { name })
const flush = () => act(async () => {})
const before = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

describe('AC-6505.2: 자세히 — 차례·글', () => {
  it('AC-6505.2: 분류 칩·h2 업체 이름·하는 일·품목·[고치기][지우기] → 대표 전화 → 담당자 → 업체 정보 → 장비 차례', () => {
    draw()
    const chip = screen.getByText('거래처')
    const title = screen.getByRole('heading', { level: 2, name: '예시메디칼' })
    const work = screen.getByText('의료기기 판매·수리, 충격파 기계, 초음파 진단기, 물리치료 소모품')
    const edit = screen.getByRole('button', { name: '예시메디칼 고치기' })
    const del = screen.getByRole('button', { name: '예시메디칼 지우기' })
    const tel = screen.getByText('대표 전화')
    const people = section('담당자')
    const info = section('업체 정보')
    const equipment = section('장비')
    const order = [chip, title, work, edit, del, tel, people, info, equipment]
    for (let i = 1; i < order.length; i++) expect(before(order[i - 1]!, order[i]!), `${i}`).toBe(true)
    expect(edit.textContent).toBe('고치기')
    expect(del.textContent).toBe('지우기')
  })

  it('AC-6505.2: 자세히 두 칸은 화면 폭 1200px 이상에서만(왼쪽 담당자·업체 정보, 오른쪽 장비)', () => {
    draw()
    const grid = section('담당자').parentElement!.parentElement!
    expect(grid.className.split(/\s+/)).toContain('min-[1200px]:grid-cols-2')
    expect(section('업체 정보').parentElement).toBe(section('담당자').parentElement)
    expect(section('장비').parentElement).not.toBe(section('담당자').parentElement)
  })

  it('AC-6505.2: 대표 전화는 큰 번호이고(마우스 기기) 누르면 복사돼요가 늘 보인다', () => {
    draw()
    const tel = screen.getByText('대표 전화').parentElement!
    expect(within(tel).getByRole('button', { name: /02-000-0001/ }).textContent).toContain('누르면 복사돼요')
  })

  it('AC-6505.2: 담당자 {n} · 줄 = 이름 · 맡은 일 · 휴대폰(phoneText) · [고치기]', () => {
    draw()
    const people = section('담당자')
    expect(within(people).getByRole('heading', { level: 3 }).textContent).toBe('담당자 2')
    const rows = within(people).getAllByRole('listitem')
    expect(rows.map((r) => r.textContent?.replace('누르면 복사돼요', ''))).toEqual(['김예시영업·주문010-0000-0001고치기', '박예시수리 기사010-0000-0002고치기'])
    expect(within(people).getByRole('button', { name: '담당자 더하기' }).textContent).toBe('담당자')
  })

  it('AC-6505.2: 업체 정보 칸은 주소·홈페이지·사업자번호·계좌·사이트 아이디·사이트 비밀번호·업체 메모 차례, [고치기]는 판을 연다', () => {
    const { h } = draw()
    const info = section('업체 정보')
    expect(within(info).getAllByRole('term').map((t) => t.textContent)).toEqual(['주소', '홈페이지', '사업자번호', '계좌', '사이트 아이디', '사이트 비밀번호', '업체 메모'])
    fireEvent.click(within(info).getByRole('button', { name: '업체 정보 고치기' }))
    expect(h.onEdit).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: '예시메디칼 고치기' }))
    expect(h.onEdit).toHaveBeenCalledTimes(2)
  })

  it('AC-6505.2: 업체 메모는 줄바꿈을 그대로 보인다', () => {
    draw()
    const memo = within(section('업체 정보')).getByText(/소모품 주문은/)
    expect(memo.textContent).toBe(MEDICAL.memo)
    expect(memo.className).toContain('whitespace-pre-line')
  })

  it('AC-6505.2: 주소·사업자번호·사이트 아이디에 [복사], 홈페이지·업체 메모에는 없다', async () => {
    const writeText = installClipboard()
    draw()
    const info = section('업체 정보')
    expect(within(info).getAllByRole('button', { name: /복사$/ }).map((b) => b.getAttribute('aria-label'))).toEqual([
      '주소 복사',
      '사업자번호 복사',
      '계좌 복사',
      '사이트 아이디 복사',
      '사이트 비밀번호 복사',
    ])
    fireEvent.click(within(info).getByRole('button', { name: '사업자번호 복사' }))
    await flush()
    expect(writeText).toHaveBeenCalledWith('000-00-00001')
  })

  it('AC-6505.2: 홈페이지는 https://를 붙인 새 탭 링크(rel=noopener noreferrer), 이미 http(s)://면 그대로', () => {
    const { redraw } = draw()
    const link = within(section('업체 정보')).getByRole('link', { name: 'www.example.com' })
    expect(link.getAttribute('href')).toBe('https://www.example.com')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    redraw(PHYSIO)
    expect(within(section('업체 정보')).getByRole('link', { name: 'https://www.example.org' }).getAttribute('href')).toBe('https://www.example.org')
  })
})

describe('AC-6505.2: 빈 칸은 줄째 감추고, 없으면 빈 칸 글', () => {
  it('AC-6505.2: 적힌 칸만 보인다(예시설비: 주소 하나), 하는 일·품목이 없으면 그 줄도 없다', () => {
    draw(FACILITY)
    expect(within(section('업체 정보')).getAllByRole('term').map((t) => t.textContent)).toEqual(['주소'])
    const { container } = render(<CompanyDetail book={BOOK} company={{ ...TAX, phone: '' }} today={TODAY} {...handlers()} />)
    expect(container.querySelector('[data-work]')).toBeNull()
  })

  it('AC-6505.2: 담당자·업체 정보·장비가 모두 없으면 각 빈 칸 글, 대표 전화가 없으면 그 줄도 없다', () => {
    draw(TAX)
    expect(within(section('담당자')).getByText('담당자가 없어요.')).toBeTruthy()
    expect(within(section('담당자')).getByRole('heading', { level: 3 }).textContent).toBe('담당자 0')
    expect(within(section('업체 정보')).getByText('적힌 정보가 없어요. [고치기]로 채워요.')).toBeTruthy()
    expect(within(section('장비')).getByText('장비가 없어요. 수리·관리하는 기계가 있으면 더해요.')).toBeTruthy()
    expect(screen.queryByText('대표 전화')).toBeNull()
  })
})

describe('AC-6505.2: 가림 — 계좌·사이트 비밀번호', () => {
  it('AC-6505.2: 계좌·사이트 비밀번호는 길이와 상관없이 ●●●●●●이고 값은 화면에 없다', () => {
    const { container } = draw()
    const info = section('업체 정보')
    expect(within(info).getAllByText('●●●●●●')).toHaveLength(2)
    expect(container.textContent).not.toContain(MEDICAL.account)
    expect(container.textContent).not.toContain(MEDICAL.sitePw)
  })

  it('AC-6505.2: [보기]를 누른 칸만 값과 [가리기], [가리기]로 다시 가린다', () => {
    const { container } = draw()
    const show = screen.getByRole('button', { name: '사이트 비밀번호 보기' })
    expect(show.textContent).toBe('보기')
    expect(show.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(show)
    expect(container.textContent).toContain('Yesi2026!')
    expect(container.textContent).not.toContain(MEDICAL.account)
    const hide = screen.getByRole('button', { name: '사이트 비밀번호 보기' })
    expect(hide.textContent).toBe('가리기')
    expect(hide.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(hide)
    expect(container.textContent).not.toContain('Yesi2026!')
  })

  it('AC-6505.2: [복사]는 가린 채로도 값을 복사하고 복사했어요', async () => {
    const writeText = installClipboard()
    draw()
    const copy = screen.getByRole('button', { name: '계좌 복사' })
    fireEvent.click(copy)
    await flush()
    expect(writeText).toHaveBeenCalledWith(MEDICAL.account)
    expect(copy.textContent).toBe('복사했어요')
    expect(within(section('업체 정보')).getAllByText('●●●●●●')).toHaveLength(2)
  })

  it('AC-6505.2: 다른 업체를 고르면 다시 가리고, 돌아와도 가린 채다', () => {
    const { container, redraw } = draw()
    fireEvent.click(screen.getByRole('button', { name: '사이트 비밀번호 보기' }))
    expect(container.textContent).toContain('Yesi2026!')
    redraw(IT)
    expect(container.textContent).not.toContain(IT.sitePw)
    expect(within(section('업체 정보')).getAllByText('●●●●●●')).toHaveLength(1)
    redraw(MEDICAL)
    expect(container.textContent).not.toContain('Yesi2026!')
  })
})

describe('AC-6505.6: 장비 줄 — 무상 수리 칩·흐림·날짜', () => {
  it('AC-6505.6: 장비 {n}, 줄 = 장비 이름 [칩] [고치기] / 일련번호 · 들여온 날 · 무상 수리 끝나는 날', () => {
    draw()
    const equipment = section('장비')
    expect(within(equipment).getByRole('heading', { level: 3 }).textContent).toBe('장비 2')
    const shock = within(equipment).getByRole('article', { name: '충격파 기계' })
    expect(within(shock).getByText('무상 수리 12일 남음')).toBeTruthy()
    expect(shock.querySelector('[data-meta]')!.textContent).toBe('일련번호 ESW-0000-01들여온 날 2025-12-03무상 수리 끝나는 날 2026-12-03')
    expect(within(shock).getByRole('button', { name: '충격파 기계 고치기' })).toBeTruthy()
    expect(within(equipment).getByRole('button', { name: '장비 더하기' }).textContent).toBe('장비')
  })

  it('AC-6505.6: 끝난 장비는 무상 수리 끝남(회색)이고 장비 이름도 흐리다, 남은 날 칩은 주황', () => {
    draw()
    const echo = screen.getByRole('article', { name: '초음파 진단기' })
    const ended = within(echo).getByText('무상 수리 끝남')
    expect(ended.className).toContain('text-muted')
    expect(within(echo).getByText('초음파 진단기').className).toContain('text-ink-2')
    const soon = within(screen.getByRole('article', { name: '충격파 기계' })).getByText('무상 수리 12일 남음')
    expect(soon.className).toContain('text-warning')
    expect(within(screen.getByRole('article', { name: '충격파 기계' })).getByText('충격파 기계').className).toContain('text-ink')
  })

  it('AC-6505.6: 오늘 끝나면 무상 수리 오늘 끝나요(주황 + 테두리), 31일 이상 남으면 칩 없이 날짜만', () => {
    const { redraw } = draw(IT)
    const today = within(screen.getByRole('article', { name: '원내 서버 PC' })).getByText('무상 수리 오늘 끝나요')
    expect(today.className).toContain('text-warning')
    expect(today.className).toContain('border-warning/40')
    redraw(FACILITY)
    const aircon = screen.getByRole('article', { name: '천장형 냉난방기' })
    expect(aircon.querySelector('[data-warranty]')).toBeNull()
    expect(aircon.textContent).toContain('무상 수리 끝나는 날 2027-06-10')
  })
})

describe('AC-6505.5: 수리 기록 줄', () => {
  it('AC-6505.5: 수리 기록 {n} · 날짜 늦은 것이 위(같은 날은 나중에 넣은 것이 위) · 비용 {n}원(비면 –)', () => {
    draw()
    const shock = screen.getByRole('article', { name: '충격파 기계' })
    expect(shock.querySelector('[data-repair-head]')!.textContent).toBe('수리 기록 3수리 기록')
    const rows = within(within(shock).getByRole('list', { name: '충격파 기계 수리 기록' })).getAllByRole('listitem')
    expect(rows.map((r) => r.textContent)).toEqual([
      '2026-10-02젤 보충3,000원고치기',
      '2026-10-02헤드 교체 (무상)–고치기',
      '2026-06-18출력이 약해져 점검 · 출장비50,000원고치기',
    ])
    expect(within(rows[1]!).getByText('–').className).toContain('text-muted')
  })

  it('AC-6505.5: 수리 기록이 없으면 수리 기록이 없어요.', () => {
    draw(FACILITY)
    expect(within(screen.getByRole('article', { name: '천장형 냉난방기' })).getByText('수리 기록이 없어요.')).toBeTruthy()
  })
})

describe('AC-6505.5: 그 자리에서 고치는 칸 — 담당자', () => {
  it('AC-6505.5: [+ 담당자] → 담당자 더하기 칸(이름 필수·휴대폰·맡은 일, 자리표시), [지우기] 없음, 담당자가 없어요. 대신', () => {
    draw(TAX)
    fireEvent.click(screen.getByRole('button', { name: '담당자 더하기' }))
    const form = screen.getByRole('form', { name: '담당자 더하기' })
    expect(within(form).getByRole('heading', { level: 4, name: '담당자 더하기' })).toBeTruthy()
    const name = within(form).getByLabelText(/^이름/) as HTMLInputElement
    expect(name.placeholder).toBe('예: 김예시')
    expect(name.maxLength).toBe(20)
    expect(within(form).getByText('필수')).toBeTruthy()
    expect((within(form).getByLabelText('휴대폰') as HTMLInputElement).placeholder).toBe('010-0000-0000')
    expect((within(form).getByLabelText('휴대폰') as HTMLInputElement).maxLength).toBe(30)
    expect((within(form).getByLabelText('맡은 일') as HTMLInputElement).placeholder).toBe('예: 영업·주문')
    expect((within(form).getByLabelText('맡은 일') as HTMLInputElement).maxLength).toBe(40)
    expect(within(form).queryByRole('button', { name: '지우기' })).toBeNull()
    expect(within(form).getAllByRole('button').map((b) => b.textContent)).toEqual(['그만두기', '저장'])
    expect(screen.queryByText('담당자가 없어요.')).toBeNull()
    expect(document.activeElement).toBe(name)
  })

  it('AC-6505.5: 이름이 빈 채 [저장]이면 이름을 적어 주세요.이고 보내지 않는다', () => {
    const { h } = draw()
    fireEvent.click(screen.getByRole('button', { name: '담당자 더하기' }))
    const form = screen.getByRole('form', { name: '담당자 더하기' })
    fireEvent.change(within(form).getByLabelText('휴대폰'), { target: { value: '010-0000-0009' } })
    fireEvent.click(within(form).getByRole('button', { name: '저장' }))
    expect(within(form).getByText('이름을 적어 주세요.')).toBeTruthy()
    expect(within(form).getByLabelText(/^이름/).getAttribute('aria-invalid')).toBe('true')
    expect(h.onSavePerson).not.toHaveBeenCalled()
  })

  it('AC-6505.5: 같은 업체에 같은 이름(앞뒤 빈칸 무시)이면 같은 이름의 담당자가 이미 있어요.이고 보내지 않는다', () => {
    const { h } = draw()
    fireEvent.click(screen.getByRole('button', { name: '담당자 더하기' }))
    const form = screen.getByRole('form', { name: '담당자 더하기' })
    fireEvent.change(within(form).getByLabelText(/^이름/), { target: { value: ' 김예시 ' } })
    fireEvent.click(within(form).getByRole('button', { name: '저장' }))
    expect(within(form).getByText('같은 이름의 담당자가 이미 있어요.')).toBeTruthy()
    expect(h.onSavePerson).not.toHaveBeenCalled()
  })

  it('AC-6505.5: 저장되면 칸을 닫고 저장했어요., 콜백은 (업체 id, null, 칸)', async () => {
    const { h } = draw()
    fireEvent.click(screen.getByRole('button', { name: '담당자 더하기' }))
    const form = screen.getByRole('form', { name: '담당자 더하기' })
    fireEvent.change(within(form).getByLabelText(/^이름/), { target: { value: '오예시' } })
    fireEvent.change(within(form).getByLabelText('휴대폰'), { target: { value: '010-0000-0005' } })
    fireEvent.change(within(form).getByLabelText('맡은 일'), { target: { value: '소모품 배송' } })
    fireEvent.click(within(form).getByRole('button', { name: '저장' }))
    await flush()
    expect(h.onSavePerson).toHaveBeenCalledWith(MEDICAL.id, null, { name: '오예시', mobile: '010-0000-0005', role: '소모품 배송' })
    expect(screen.queryByRole('form', { name: '담당자 더하기' })).toBeNull()
    expect(h.onNotice).toHaveBeenCalledWith('저장했어요.')
  })

  it('AC-6505.5: DB가 겹침이라 하면 같은 이름 글, 실패면 E-CONTACTS-SAVE-FAILED 카드이고 적은 값은 그대로', async () => {
    const onSavePerson = vi.fn<() => Promise<SaveResult>>().mockResolvedValueOnce(DUPLICATE).mockResolvedValueOnce(FAILED)
    const { h } = draw(MEDICAL, { onSavePerson })
    fireEvent.click(screen.getByRole('button', { name: '담당자 더하기' }))
    const form = screen.getByRole('form', { name: '담당자 더하기' })
    fireEvent.change(within(form).getByLabelText(/^이름/), { target: { value: '오예시' } })
    fireEvent.click(within(form).getByRole('button', { name: '저장' }))
    await flush()
    expect(within(form).getByText('같은 이름의 담당자가 이미 있어요.')).toBeTruthy()
    fireEvent.click(within(form).getByRole('button', { name: '저장' }))
    await flush()
    expect(within(form).getByRole('alert').textContent).toContain('E-CONTACTS-SAVE-FAILED')
    expect(within(form).getByRole('alert').textContent).toContain('주소록을 바꾸지 못했어요')
    expect((within(form).getByLabelText(/^이름/) as HTMLInputElement).value).toBe('오예시')
    expect(h.onNotice).not.toHaveBeenCalled()
  })

  it('AC-6505.5: 콜백이 던져도 실패 카드다', async () => {
    const onSavePerson = vi.fn(async (): Promise<SaveResult> => {
      throw new Error('boom')
    })
    draw(MEDICAL, { onSavePerson })
    fireEvent.click(screen.getByRole('button', { name: '담당자 더하기' }))
    const form = screen.getByRole('form', { name: '담당자 더하기' })
    fireEvent.change(within(form).getByLabelText(/^이름/), { target: { value: '오예시' } })
    fireEvent.click(within(form).getByRole('button', { name: '저장' }))
    await flush()
    expect(within(form).getByRole('alert').textContent).toContain('E-CONTACTS-SAVE-FAILED')
    expect(within(form).getByRole('alert').textContent).not.toContain('boom')
  })

  it('AC-6505.5: [고치기] → 그 줄 자리에 담당자 고치기(값 채움, [지우기] 있음), 자기 이름은 겹침이 아니다', async () => {
    const { h } = draw()
    fireEvent.click(screen.getByRole('button', { name: '김예시 고치기' }))
    const form = screen.getByRole('form', { name: '담당자 고치기' })
    expect((within(form).getByLabelText(/^이름/) as HTMLInputElement).value).toBe('김예시')
    expect((within(form).getByLabelText('휴대폰') as HTMLInputElement).value).toBe('010-0000-0001')
    expect(within(form).getAllByRole('button').map((b) => b.textContent)).toEqual(['지우기', '그만두기', '저장'])
    // 그 줄 자리: 박예시 줄보다 위
    expect(before(form, screen.getByText('박예시'))).toBe(true)
    fireEvent.change(within(form).getByLabelText('맡은 일'), { target: { value: '부장' } })
    fireEvent.click(within(form).getByRole('button', { name: '저장' }))
    await flush()
    expect(h.onSavePerson).toHaveBeenCalledWith(MEDICAL.id, 'p1', { name: '김예시', mobile: '010-0000-0001', role: '부장' })
  })

  it('AC-6505.5: [그만두기]는 보내지 않고 칸을 닫는다', () => {
    const { h } = draw()
    fireEvent.click(screen.getByRole('button', { name: '김예시 고치기' }))
    fireEvent.click(within(screen.getByRole('form', { name: '담당자 고치기' })).getByRole('button', { name: '그만두기' }))
    expect(screen.queryByRole('form')).toBeNull()
    expect(h.onSavePerson).not.toHaveBeenCalled()
  })

  it('AC-6505.7: 담당자 [지우기]는 묻지 않고 지운 뒤 담당자를 지웠어요.', async () => {
    const { h } = draw()
    fireEvent.click(screen.getByRole('button', { name: '김예시 고치기' }))
    fireEvent.click(within(screen.getByRole('form', { name: '담당자 고치기' })).getByRole('button', { name: '지우기' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    await flush()
    expect(h.onDeletePerson).toHaveBeenCalledWith('p1')
    expect(h.onNotice).toHaveBeenCalledWith('담당자를 지웠어요.')
    expect(screen.queryByRole('form')).toBeNull()
  })

  it('AC-6505.7: 담당자 지우기가 실패하면 칸에 실패 카드', async () => {
    const { h } = draw(MEDICAL, { onDeletePerson: vi.fn(async (): Promise<SaveResult> => FAILED) })
    fireEvent.click(screen.getByRole('button', { name: '김예시 고치기' }))
    const form = screen.getByRole('form', { name: '담당자 고치기' })
    fireEvent.click(within(form).getByRole('button', { name: '지우기' }))
    await flush()
    expect(within(form).getByRole('alert').textContent).toContain('E-CONTACTS-SAVE-FAILED')
    expect(h.onNotice).not.toHaveBeenCalled()
  })
})

describe('AC-6505.5: 그 자리에서 고치는 칸 — 장비', () => {
  it('AC-6505.5: [+ 장비] → 장비 더하기(장비 이름 필수·일련번호·날짜 고르기 둘·알림 도움 글)', () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: '장비 더하기' }))
    const form = screen.getByRole('form', { name: '장비 더하기' })
    const name = within(form).getByLabelText(/^장비 이름/) as HTMLInputElement
    expect(name.placeholder).toBe('예: 충격파 기계')
    expect(name.maxLength).toBe(60)
    expect((within(form).getByLabelText('일련번호') as HTMLInputElement).placeholder).toBe('기계 뒷면 이름표')
    expect((within(form).getByLabelText('일련번호') as HTMLInputElement).maxLength).toBe(60)
    expect((within(form).getByLabelText('들여온 날') as HTMLInputElement).type).toBe('date')
    expect((within(form).getByLabelText(/^무상 수리 끝나는 날/) as HTMLInputElement).type).toBe('date')
    expect(within(form).getByText('끝나기 30일 전부터 주소록과 대시보드에 알려 줘요.')).toBeTruthy()
  })

  it('AC-6505.5: 장비 이름이 빈 채 [저장]이면 장비 이름을 적어 주세요., 빈 날짜는 null로 보낸다', async () => {
    const { h } = draw()
    fireEvent.click(screen.getByRole('button', { name: '장비 더하기' }))
    const form = screen.getByRole('form', { name: '장비 더하기' })
    fireEvent.click(within(form).getByRole('button', { name: '저장' }))
    expect(within(form).getByText('장비 이름을 적어 주세요.')).toBeTruthy()
    expect(h.onSaveEquipment).not.toHaveBeenCalled()
    fireEvent.change(within(form).getByLabelText(/^장비 이름/), { target: { value: '견인 치료기' } })
    fireEvent.change(within(form).getByLabelText('들여온 날'), { target: { value: '2026-11-10' } })
    fireEvent.click(within(form).getByRole('button', { name: '저장' }))
    await flush()
    expect(h.onSaveEquipment).toHaveBeenCalledWith(MEDICAL.id, null, { name: '견인 치료기', serial: '', boughtOn: '2026-11-10', warrantyUntil: null })
    expect(h.onNotice).toHaveBeenCalledWith('저장했어요.')
  })

  it('AC-6505.5: 장비 [고치기]는 그 장비 자리에 값 채운 장비 고치기', async () => {
    const { h } = draw()
    fireEvent.click(screen.getByRole('button', { name: '충격파 기계 고치기' }))
    const form = screen.getByRole('form', { name: '장비 고치기' })
    expect((within(form).getByLabelText(/^무상 수리 끝나는 날/) as HTMLInputElement).value).toBe('2026-12-03')
    fireEvent.change(within(form).getByLabelText(/^무상 수리 끝나는 날/), { target: { value: '' } })
    fireEvent.click(within(form).getByRole('button', { name: '저장' }))
    await flush()
    expect(h.onSaveEquipment).toHaveBeenCalledWith(MEDICAL.id, 'e1', { name: '충격파 기계', serial: 'ESW-0000-01', boughtOn: '2025-12-03', warrantyUntil: null })
  })
})

describe('AC-6505.5: 그 자리에서 고치는 칸 — 수리 기록', () => {
  it('AC-6505.5: [+ 수리 기록] → 그 장비 수리 기록 맨 위에 수리 기록 더하기, 날짜 기본값 오늘·내용 필수·비용(비워도 돼요, 원)', () => {
    draw()
    const shock = screen.getByRole('article', { name: '충격파 기계' })
    fireEvent.click(within(shock).getByRole('button', { name: '충격파 기계 수리 기록 더하기' }))
    const form = within(shock).getByRole('form', { name: '수리 기록 더하기' })
    const day = within(form).getByLabelText(/^날짜/) as HTMLInputElement
    expect(day.type).toBe('date')
    expect(day.value).toBe(TODAY)
    const content = within(form).getByLabelText(/^내용/) as HTMLInputElement
    expect(content.placeholder).toBe('예: 헤드 교체')
    expect(content.maxLength).toBe(200)
    const cost = within(form).getByLabelText('비용') as HTMLInputElement
    expect(cost.placeholder).toBe('비워도 돼요')
    expect(cost.inputMode).toBe('numeric')
    expect(within(form).getByText('원')).toBeTruthy()
    expect(before(form, within(shock).getByText('젤 보충'))).toBe(true)
  })

  it('AC-6505.5: 비용은 숫자만 받고 치는 동안 천 단위 쉼표', () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: '충격파 기계 수리 기록 더하기' }))
    const cost = screen.getByLabelText('비용') as HTMLInputElement
    fireEvent.change(cost, { target: { value: '1234567' } })
    expect(cost.value).toBe('1,234,567')
    fireEvent.change(cost, { target: { value: '1,234,5678원' } })
    expect(cost.value).toBe('12,345,678')
    fireEvent.change(cost, { target: { value: 'abc' } })
    expect(cost.value).toBe('')
    fireEvent.change(cost, { target: { value: '0050000' } })
    expect(cost.value).toBe('50,000')
    // 9,999,999,999원(10자리)까지
    fireEvent.change(cost, { target: { value: '123456789012' } })
    expect(cost.value).toBe('1,234,567,890')
  })

  it('AC-6505.5: 내용이 빈 채 [저장]이면 내용을 적어 주세요., 비용 비우면 null', async () => {
    const { h } = draw()
    fireEvent.click(screen.getByRole('button', { name: '충격파 기계 수리 기록 더하기' }))
    const form = screen.getByRole('form', { name: '수리 기록 더하기' })
    fireEvent.click(within(form).getByRole('button', { name: '저장' }))
    expect(within(form).getByText('내용을 적어 주세요.')).toBeTruthy()
    expect(h.onSaveRepair).not.toHaveBeenCalled()
    fireEvent.change(within(form).getByLabelText(/^내용/), { target: { value: '헤드 교체' } })
    fireEvent.click(within(form).getByRole('button', { name: '저장' }))
    await flush()
    expect(h.onSaveRepair).toHaveBeenCalledWith('e1', null, { day: TODAY, content: '헤드 교체', cost: null })
    expect(h.onNotice).toHaveBeenCalledWith('저장했어요.')
  })

  it('AC-6505.5: 날짜 칸을 비우면 오늘로 저장하고, 비용은 원 정수로 보낸다', async () => {
    const { h } = draw()
    fireEvent.click(screen.getByRole('button', { name: '충격파 기계 수리 기록 더하기' }))
    const form = screen.getByRole('form', { name: '수리 기록 더하기' })
    fireEvent.change(within(form).getByLabelText(/^날짜/), { target: { value: '' } })
    fireEvent.change(within(form).getByLabelText(/^내용/), { target: { value: '점검' } })
    fireEvent.change(within(form).getByLabelText('비용'), { target: { value: '120000' } })
    fireEvent.click(within(form).getByRole('button', { name: '저장' }))
    await flush()
    expect(h.onSaveRepair).toHaveBeenCalledWith('e1', null, { day: TODAY, content: '점검', cost: 120000 })
  })

  it('AC-6505.5: 수리 기록 [고치기]는 그 줄 자리에 값 채운 수리 기록 고치기(비용 쉼표)', async () => {
    const { h } = draw()
    fireEvent.click(screen.getByRole('button', { name: '2026-06-18 출력이 약해져 점검 · 출장비 고치기' }))
    const form = screen.getByRole('form', { name: '수리 기록 고치기' })
    expect((within(form).getByLabelText(/^날짜/) as HTMLInputElement).value).toBe('2026-06-18')
    expect((within(form).getByLabelText('비용') as HTMLInputElement).value).toBe('50,000')
    fireEvent.change(within(form).getByLabelText('비용'), { target: { value: '' } })
    fireEvent.click(within(form).getByRole('button', { name: '저장' }))
    await flush()
    expect(h.onSaveRepair).toHaveBeenCalledWith('e1', 'r1', { day: '2026-06-18', content: '출력이 약해져 점검 · 출장비', cost: null })
  })

  it('AC-6505.7: 수리 기록 [지우기]는 묻지 않고 지운 뒤 수리 기록을 지웠어요.', async () => {
    const { h } = draw()
    fireEvent.click(screen.getByRole('button', { name: '2026-10-02 헤드 교체 (무상) 고치기' }))
    fireEvent.click(within(screen.getByRole('form', { name: '수리 기록 고치기' })).getByRole('button', { name: '지우기' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    await flush()
    expect(h.onDeleteRepair).toHaveBeenCalledWith('r2')
    expect(h.onNotice).toHaveBeenCalledWith('수리 기록을 지웠어요.')
  })

  it('AC-6505.5: 칸은 한 번에 하나만 열린다(다른 [고치기]를 누르면 앞 칸은 닫힌다)', () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: '김예시 고치기' }))
    fireEvent.click(screen.getByRole('button', { name: '충격파 기계 수리 기록 더하기' }))
    expect(screen.getAllByRole('form').map((f) => f.getAttribute('aria-label'))).toEqual(['수리 기록 더하기'])
  })
})

describe('AC-6505.7: 지우기 확인 — 업체·장비는 한 번 더 묻는다', () => {
  it('AC-6505.7: 업체 [지우기] → {이름}을(를) 지울까요? · 함께 지워져요 · 수 글, [그만두기]는 지우지 않는다', () => {
    const { h } = draw()
    fireEvent.click(screen.getByRole('button', { name: '예시메디칼 지우기' }))
    const dialog = screen.getByRole('alertdialog', { name: '예시메디칼을 지울까요?' })
    expect(within(dialog).getByText('담당자·장비·수리 기록도 함께 지워져요.')).toBeTruthy()
    expect(within(dialog).getByText('이 업체에는 담당자 2명 · 장비 2대 · 수리 기록 4줄이 있어요. 지우면 되돌릴 수 없어요.')).toBeTruthy()
    expect(within(dialog).getAllByRole('button').map((b) => b.textContent)).toEqual(['그만두기', '지우기'])
    fireEvent.click(within(dialog).getByRole('button', { name: '그만두기' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(h.onDeleteCompany).not.toHaveBeenCalled()
  })

  it('AC-6505.7: 업체 [지우기]를 누를 때만 지우고 {이름}을(를) 지웠어요.', async () => {
    const { h } = draw()
    fireEvent.click(screen.getByRole('button', { name: '예시메디칼 지우기' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '지우기' }))
    await flush()
    expect(h.onDeleteCompany).toHaveBeenCalledOnce()
    expect(h.onNotice).toHaveBeenCalledWith('예시메디칼을 지웠어요.')
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('AC-6505.7: 없는 것은 수 글에서 빼고(마지막 말 받침으로 이/가), 다 없으면 지우면 되돌릴 수 없어요., 받침 없는 이름은 를', () => {
    const { redraw } = draw(FACILITY)
    fireEvent.click(screen.getByRole('button', { name: '예시설비 지우기' }))
    expect(within(screen.getByRole('alertdialog', { name: '예시설비를 지울까요?' })).getByText('이 업체에는 담당자 1명 · 장비 1대가 있어요. 지우면 되돌릴 수 없어요.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '그만두기' }))
    redraw(TAX)
    fireEvent.click(screen.getByRole('button', { name: '예시세무회계 지우기' }))
    const dialog = screen.getByRole('alertdialog', { name: '예시세무회계를 지울까요?' })
    expect(within(dialog).getByText('지우면 되돌릴 수 없어요.')).toBeTruthy()
    expect(dialog.textContent).not.toContain('이 업체에는')
  })

  it('AC-6505.7: 업체 지우기가 실패하면 확인 창에 E-CONTACTS-SAVE-FAILED 카드, 창은 그대로', async () => {
    const { h } = draw(MEDICAL, { onDeleteCompany: vi.fn(async (): Promise<SaveResult> => FAILED) })
    fireEvent.click(screen.getByRole('button', { name: '예시메디칼 지우기' }))
    const dialog = screen.getByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: '지우기' }))
    await flush()
    expect(within(dialog).getByRole('alert').textContent).toContain('E-CONTACTS-SAVE-FAILED')
    expect(screen.getByRole('alertdialog')).toBe(dialog)
    expect(h.onNotice).not.toHaveBeenCalled()
  })

  it('AC-6505.7: 장비 고치기 [지우기] → {장비 이름}을(를) 지울까요? · 수리 기록 {n}줄도 함께 지워져요. · 지우면 되돌릴 수 없어요.', async () => {
    const { h } = draw()
    fireEvent.click(screen.getByRole('button', { name: '충격파 기계 고치기' }))
    fireEvent.click(within(screen.getByRole('form', { name: '장비 고치기' })).getByRole('button', { name: '지우기' }))
    const dialog = screen.getByRole('alertdialog', { name: '충격파 기계를 지울까요?' })
    expect(within(dialog).getByText('수리 기록 3줄도 함께 지워져요.')).toBeTruthy()
    expect(within(dialog).getByText('지우면 되돌릴 수 없어요.')).toBeTruthy()
    expect(h.onDeleteEquipment).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: '지우기' }))
    await flush()
    expect(h.onDeleteEquipment).toHaveBeenCalledWith('e1')
    expect(h.onNotice).toHaveBeenCalledWith('충격파 기계를 지웠어요.')
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.queryByRole('form')).toBeNull()
  })

  it('AC-6505.7: 수리 기록이 없는 장비는 이 장비를 주소록에서 지워요.', () => {
    draw(FACILITY)
    fireEvent.click(screen.getByRole('button', { name: '천장형 냉난방기 고치기' }))
    fireEvent.click(within(screen.getByRole('form', { name: '장비 고치기' })).getByRole('button', { name: '지우기' }))
    const dialog = screen.getByRole('alertdialog', { name: '천장형 냉난방기를 지울까요?' })
    expect(within(dialog).getByText('이 장비를 주소록에서 지워요.')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: '그만두기' }))
    // 그만두면 장비 고치기 칸은 그대로
    expect(screen.getByRole('form', { name: '장비 고치기' })).toBeTruthy()
  })
})
