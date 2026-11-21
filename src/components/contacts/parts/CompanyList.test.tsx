// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ContactBook } from '@/types/contacts'
import { BOOK, FACILITY, IT, MEDICAL, TAX, TODAY } from './book.test.data'
import { CompanyList } from './CompanyList'
import { AddCompanyButton, ContactsHeader } from './ContactsHeader'
import { FindRow } from './FindRow'
import { NoSelection } from './NoSelection'
import type { ChipValue } from './types'

// 머리 줄·찾기 줄·목록·오른쪽 빈 자리(spec contacts AC-6505.1·AC-6505.6, 시안 기본값 1~4, ?s=list·search).
// 목록·칩 수는 lib/contacts의 searchCompanies·countByCategory·highlightParts·soonestWarranty 그대로다(부품은 book·찾는 말·칩을 props로 받는다)

afterEach(cleanup)

const rowsOf = (container: HTMLElement) => Array.from(container.querySelectorAll<HTMLButtonElement>('button[data-company]'))
const namesOf = (container: HTMLElement) => rowsOf(container).map((row) => row.dataset.company)

function drawList(over: Partial<Parameters<typeof CompanyList>[0]> = {}) {
  const onSelect = vi.fn()
  const view = render(<CompanyList book={BOOK} query="" category="all" today={TODAY} selectedId={null} onSelect={onSelect} {...over} />)
  return { ...view, onSelect }
}

describe('AC-6505.1: 머리 줄 — h1 주소록 · 업체 {n}곳 · 단추 자리', () => {
  it('AC-6505.1: 업체가 있으면 h1 주소록 옆에 업체 {n}곳, 단추 자리(actions)를 그린다', () => {
    render(<ContactsHeader count={8} actions={<button type="button">엑셀 올리기</button>} />)
    expect(screen.getByRole('heading', { level: 1, name: '주소록' })).toBeTruthy()
    expect(screen.getByText('업체 8곳')).toBeTruthy()
    expect(screen.getByRole('button', { name: '엑셀 올리기' })).toBeTruthy()
  })

  it('AC-6505.8: 업체가 0곳이면 업체 {n}곳이 없다(h1만)', () => {
    const { container } = render(<ContactsHeader count={0} />)
    expect(screen.getByRole('heading', { level: 1, name: '주소록' })).toBeTruthy()
    expect(container.textContent).toBe('주소록')
  })

  it('AC-6505.4: [+ 업체 더하기]는 주 단추이고 누르면 onClick', () => {
    const onClick = vi.fn()
    render(<AddCompanyButton onClick={onClick} />)
    const button = screen.getByRole('button', { name: '업체 더하기' })
    expect(button.querySelector('svg')).toBeTruthy()
    expect(button.className).toContain('bg-accent')
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledOnce()
  })
})

describe('AC-6505.1: 찾기 칸 · 분류 칩', () => {
  function Harness({ book = BOOK, start = '' }: { book?: ContactBook; start?: string }) {
    const [query, setQuery] = useState(start)
    const [category, setCategory] = useState<ChipValue>('all')
    return (
      <>
        <FindRow book={book} query={query} onQuery={setQuery} category={category} onCategory={setCategory} />
        <CompanyList book={book} query={query} category={category} today={TODAY} selectedId={null} onSelect={() => {}} />
      </>
    )
  }

  it('AC-6505.1: 찾기 칸 자리표시는 업체·담당자·품목·장비 찾기이고, 빈 칸에는 [×]가 없다', () => {
    render(<Harness />)
    const box = screen.getByRole('searchbox', { name: '업체·담당자·품목·장비 찾기' })
    expect(box.getAttribute('placeholder')).toBe('업체·담당자·품목·장비 찾기')
    expect(screen.queryByRole('button', { name: '찾기 지우기' })).toBeNull()
  })

  it('AC-6505.1: 칩은 전체·거래처·수리·관리·기관·보험·기타 차례로 수와 함께 있고, 전체가 눌려 있다', () => {
    render(<Harness />)
    const group = screen.getByRole('group', { name: '분류' })
    const chips = within(group).getAllByRole('button')
    expect(chips.map((chip) => chip.textContent)).toEqual(['전체 8', '거래처 3', '수리·관리 3', '기관·보험 1', '기타 1'])
    expect(screen.getByRole('button', { name: '전체 8' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: '거래처 3' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('AC-6505.1: 치는 대로 바로 걸러지고 칩 숫자도 찾은 결과 수다(시안 search: 충격파 → 2곳)', () => {
    render(<Harness />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '충격파' } })
    expect(screen.getByRole('button', { name: '전체 2' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '거래처 2' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '수리·관리 0' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '기관·보험 0' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '기타 0' })).toBeTruthy()
  })

  it('AC-6505.1: [×](찾기 지우기)를 누르면 찾는 말이 비고 찾기 칸에 초점이 간다', () => {
    render(<Harness start="충격파" />)
    fireEvent.click(screen.getByRole('button', { name: '찾기 지우기' }))
    const box = screen.getByRole('searchbox') as HTMLInputElement
    expect(box.value).toBe('')
    expect(document.activeElement).toBe(box)
    expect(screen.getByRole('button', { name: '전체 8' })).toBeTruthy()
  })

  it('AC-6505.1: 칩을 누르면 그 칩만 눌리고 목록은 묶음 머리 없이 그 분류만', () => {
    const { container } = render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: '수리·관리 3' }))
    expect(screen.getByRole('button', { name: '수리·관리 3' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: '전체 8' }).getAttribute('aria-pressed')).toBe('false')
    expect(namesOf(container)).toEqual(['예시설비', '예시전산', '예시정비'])
    expect(container.querySelectorAll('[data-group]')).toHaveLength(0)
  })
})

describe('AC-6505.1: 목록 — 분류 묶음·가나다·한 줄 모양', () => {
  it('AC-6505.1: 전체일 때 거래처 → 수리·관리 → 기관·보험 → 기타 묶음(머리에 수), 묶음 안은 업체 이름 가나다', () => {
    const { container } = drawList()
    const groups = Array.from(container.querySelectorAll<HTMLElement>('[data-group]'))
    expect(groups.map((g) => g.textContent)).toEqual(['거래처 3', '수리·관리 3', '기관·보험 1', '기타 1'])
    expect(namesOf(container)).toEqual(['예시메디칼', '예시물리치료기', '예시약품', '예시설비', '예시전산', '예시정비', '예시배상보험', '예시세무회계'])
  })

  it('AC-6505.1: 줄 = 업체 이름 / 하는 일·품목 · 대표 전화(phoneText 모양), 하는 일·품목만 말줄임', () => {
    const { container } = drawList()
    const row = container.querySelector<HTMLElement>('[data-company="예시약품"]')!
    expect(row.textContent).toBe('예시약품주사제, 수액, 소독약 · 02-000-0002')
    const work = within(row).getByText('주사제, 수액, 소독약')
    expect(work.className).toContain('truncate')
    expect(within(row).getByText('02-000-0002').className).toContain('shrink-0')
    // 숫자만 적힌 대표 전화는 phoneText 모양, 하는 일·품목이 없으면 번호만
    expect(container.querySelector('[data-company="예시정비"]')!.textContent).toBe('예시정비02-1234-5678')
    // 둘 다 없으면 이름만
    expect(container.querySelector('[data-company="예시세무회계"]')!.textContent).toBe('예시세무회계')
  })

  it('AC-6505.1: 줄을 누르면 onSelect(업체 id), 고른 줄은 aria-current', () => {
    const { container, onSelect } = drawList({ selectedId: MEDICAL.id })
    const rows = rowsOf(container)
    expect(rows.filter((r) => r.getAttribute('aria-current') === 'true').map((r) => r.dataset.company)).toEqual(['예시메디칼'])
    fireEvent.click(container.querySelector('[data-company="예시설비"]')!)
    expect(onSelect).toHaveBeenCalledWith(FACILITY.id)
  })

  it('AC-6505.6: 목록 줄 무상 수리 칩은 그 업체에서 가장 급한 것 하나(끝남은 붙이지 않음, 30일보다 많이 남으면 없음)', () => {
    const { container } = drawList()
    const chipOf = (name: string) => container.querySelector(`[data-company="${name}"] [data-warranty]`)?.textContent ?? null
    expect(chipOf('예시메디칼')).toBe('무상 수리 12일 남음') // 12일 남음 + 끝남 → 12일 남음만
    expect(chipOf('예시전산')).toBe('무상 수리 오늘 끝나요')
    expect(chipOf('예시설비')).toBeNull() // 31일보다 많이 남음
    expect(chipOf('예시약품')).toBeNull() // 장비 없음
  })
})

describe('AC-6505.1: 찾기 결과 — 찾은 글자·찾은 곳 줄·결과 없음', () => {
  it('AC-6505.1: 업체 이름·하는 일·품목에서 찾은 글자는 그 줄에서 노랗게(mark), 띄어쓰기·대소문자 무시', () => {
    const { container } = drawList({ query: '충격 파' })
    expect(namesOf(container)).toEqual(['예시메디칼', '예시물리치료기'])
    const marks = Array.from(container.querySelectorAll('[data-company="예시물리치료기"] mark')).map((m) => m.textContent)
    expect(marks).toEqual(['충격파'])
    const mark = container.querySelector('mark')!
    expect(mark.className).toContain('bg-warning-soft')
    // 영문 대소문자 무시
    const { container: pc } = render(<CompanyList book={BOOK} query="pc" category="all" today={TODAY} selectedId={null} onSelect={() => {}} />)
    expect(Array.from(pc.querySelectorAll('mark')).map((m) => m.textContent)).toContain('PC')
  })

  it('AC-6505.1: 담당자·장비에서 찾았으면 줄 아래 담당자: …·장비: …(둘까지, · 로 이음)', () => {
    const { container } = drawList({ query: '충격파' })
    const hit = container.querySelector('[data-company="예시메디칼"] [data-hits]')!
    expect(hit.textContent).toBe('장비: 충격파 기계')
    // 업체 이름·하는 일·품목에서만 찾은 줄에는 찾은 곳 줄이 없다
    expect(container.querySelector('[data-company="예시물리치료기"] [data-hits]')).toBeNull()
    const { container: who } = render(<CompanyList book={BOOK} query="예시" category="all" today={TODAY} selectedId={null} onSelect={() => {}} />)
    // 예시메디칼: 담당자 김예시·박예시 → 둘까지(장비는 '예시'가 없음)
    expect(who.querySelector('[data-company="예시메디칼"] [data-hits]')!.textContent).toBe('담당자: 김예시 · 담당자: 박예시')
  })

  it('AC-6505.1: 담당자 이름에서 찾은 글자도 찾은 곳 줄에서 노랗다', () => {
    const { container } = drawList({ query: '김예' })
    expect(namesOf(container)).toEqual(['예시메디칼'])
    const hit = container.querySelector('[data-company="예시메디칼"] [data-hits]')!
    expect(hit.textContent).toBe('담당자: 김예시')
    expect(hit.querySelector('mark')?.textContent).toBe('김예')
  })

  it("AC-6505.1: 찾은 업체가 없으면 '{찾는 말}'에 맞는 업체가 없어요. / 업체 이름·담당자 이름·하는 일·품목·장비 이름으로 찾아요.", () => {
    const { container } = drawList({ query: ' 02-000 ' })
    expect(rowsOf(container)).toHaveLength(0)
    expect(container.textContent).toBe("'02-000'에 맞는 업체가 없어요.업체 이름·담당자 이름·하는 일·품목·장비 이름으로 찾아요.")
  })

  it('AC-6505.1: 찾는 말 없이 고른 분류에 업체가 없으면 이 분류에는 업체가 없어요.', () => {
    const book: ContactBook = { ...BOOK, companies: BOOK.companies.filter((c) => c.id !== TAX.id) }
    const { container } = drawList({ book, category: 'other' })
    expect(container.textContent).toBe('이 분류에는 업체가 없어요.')
  })

  it('AC-6505.1: 찾는 말이 있고 고른 분류에 맞는 업체가 없으면 결과 없음 글이다', () => {
    const { container } = drawList({ query: '충격파', category: 'agency' })
    expect(container.textContent).toContain("'충격파'에 맞는 업체가 없어요.")
  })

  it('AC-6505.1: 고른 업체가 찾기에서 빠져도 목록은 결과만 그린다(고른 표시는 남은 줄에만)', () => {
    const { container } = drawList({ query: '설비', selectedId: IT.id })
    expect(namesOf(container)).toEqual(['예시설비'])
    expect(rowsOf(container).some((r) => r.getAttribute('aria-current') === 'true')).toBe(false)
  })
})

describe('AC-6505.1: 오른쪽 빈 자리', () => {
  it('AC-6505.1: 아무것도 안 고르면 업체를 골라 주세요 / 왼쪽에서 업체를 누르면 연락처·담당자·장비가 여기에 보여요.', () => {
    const { container } = render(<NoSelection />)
    expect(container.textContent).toBe('업체를 골라 주세요왼쪽에서 업체를 누르면 연락처·담당자·장비가 여기에 보여요.')
  })
})
