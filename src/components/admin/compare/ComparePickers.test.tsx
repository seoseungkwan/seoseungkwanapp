// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { compareMonths } from '@/lib/admin/compare/months'
import { SIDO_LIST } from '@/lib/admin/region'
import { COMPARE_SECTIONS, ComparePickers, type RegionPick } from './ComparePickers'

// 의원 비교 고르기(spec admin-view REQ-8015 AC-8015.1, REQ-8023 AC-8023.2, design.md '화면 글자' 의원 비교·2차 의원 비교 달 10년).
// 글은 승인된 시안(docs/mockups/admin-view ?s=compare) 그대로다. 부품은 props·콜백만 — 달 범위는 compareMonths로 만든 값을 받는다. 오늘 = 2026년 11월 24일(지어낸 날)

afterEach(cleanup)

const RANGE = compareMonths('2023-11', '2026-11-24') // 2023년 11월 ~ 2026년 10월

function draw(over: Partial<{ region: RegionPick; month: string; count: number; unknownRegion: boolean }> = {}) {
  const onChange = vi.fn()
  const props = { region: '전체' as RegionPick, month: '2026-10', count: 10, unknownRegion: false, ...over }
  const view = render(<ComparePickers {...props} months={RANGE} onChange={onChange} nav={<nav aria-label="관리자 안 메뉴">안쪽 메뉴</nav>} />)
  return { ...view, onChange }
}

const optionTexts = (select: HTMLElement) => within(select).getAllByRole('option').map((option) => option.textContent)

describe('AC-8015.1 고르기 — 제목·안내·지역·달·아래 줄·바로가기', () => {
  it('AC-8015.1: 제목 `의원 비교`와 안내 글(시안 글 그대로), 안쪽 메뉴 자리는 제목 아래', () => {
    draw()
    const heading = screen.getByRole('heading', { level: 1, name: '의원 비교' })
    expect(screen.getByText('관리자')).toBeTruthy()
    expect(screen.getByText('승인한 의원들의 한 달 숫자를 나란히 봐요. 의원마다 저장된 숫자로 세고, 환자 이름 같은 개인정보는 없어요.')).toBeTruthy()
    const nav = screen.getByRole('navigation', { name: '관리자 안 메뉴' })
    expect(heading.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('AC-8015.1: 지역 고르기 = `전체`(첫 값) + SIDO_LIST 17개, 지역 모름인 의원이 없으면 `지역 모름` 없음', () => {
    draw()
    const select = screen.getByRole('combobox', { name: '지역' })
    expect(optionTexts(select)).toEqual(['전체', ...SIDO_LIST])
    expect((select as HTMLSelectElement).value).toBe('전체')
  })

  it('AC-8015.1: 지역 모름인 의원이 있으면 끝에 `지역 모름`', () => {
    draw({ unknownRegion: true, region: '지역 모름' })
    const select = screen.getByRole('combobox', { name: '지역' })
    expect(optionTexts(select)).toEqual(['전체', ...SIDO_LIST, '지역 모름'])
    expect((select as HTMLSelectElement).value).toBe('지역 모름')
  })

  it('AC-8015.1: 지역을 바꾸면 onChange로 알린다(달은 그대로)', async () => {
    const { onChange } = draw()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: '지역' }), '서울')
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({ region: '서울', month: '2026-10' })
  })

  it('AC-8015.1: 고르기 이름은 `지역`·`달`', () => {
    draw()
    expect(screen.getByText('지역', { selector: 'p' })).toBeTruthy()
    expect(screen.getByText('달', { selector: 'p' })).toBeTruthy()
  })

  it('AC-8015.1: 아래 줄 `{YYYY년 M월} · M월 1일 – M월 말일 · 의원 {n}곳`(전체)', () => {
    draw()
    expect(screen.getByText((_, node) => node?.tagName === 'P' && node.textContent === '2026년 10월 · 10월 1일 – 10월 31일 · 의원 10곳')).toBeTruthy()
  })

  it('AC-8015.1: 지역을 고르면 `{지역} 의원 {n}곳`, 2월은 말일까지(윤년 29일)', () => {
    draw({ region: '서울', count: 5, month: '2024-02' })
    expect(screen.getByText((_, node) => node?.tagName === 'P' && node.textContent === '2024년 2월 · 2월 1일 – 2월 29일 · 서울 의원 5곳')).toBeTruthy()
  })

  it('AC-8015.1: 바로가기 알약 넷(의원 순위·통계 나란히 보기·직군별 월급·매출·환자 수)이 붙어 있고 처음은 의원 순위', () => {
    draw()
    const toc = screen.getByRole('navigation', { name: '의원 비교 바로가기' })
    const links = within(toc).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual(['의원 순위', '통계 나란히 보기', '직군별 월급', '매출·환자 수'])
    expect(links.map((link) => link.getAttribute('href'))).toEqual(COMPARE_SECTIONS.map((section) => `#${section.id}`))
    expect(COMPARE_SECTIONS.map((section) => section.id)).toEqual(['cmp-rank', 'cmp-side', 'cmp-pay', 'cmp-sales'])
    expect(links[0]!.getAttribute('aria-current')).toBe('true')
    expect(links.slice(1).every((link) => link.getAttribute('aria-current') === null)).toBe(true)
    expect(toc.className.split(' ')).toContain('sticky')
  })

  it('AC-8015.1: 바로가기를 누르면 그 칸으로 옮기고(주소는 그대로) 누른 알약이 지금 칸', async () => {
    const target = document.createElement('section')
    target.id = 'cmp-pay'
    const scrollIntoView = vi.fn()
    target.scrollIntoView = scrollIntoView
    document.body.append(target)
    draw()
    const toc = screen.getByRole('navigation', { name: '의원 비교 바로가기' })
    await userEvent.click(within(toc).getByRole('link', { name: '직군별 월급' }))
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(window.location.hash).toBe('')
    expect(within(toc).getByRole('link', { name: '직군별 월급' }).getAttribute('aria-current')).toBe('true')
    expect(within(toc).getByRole('link', { name: '의원 순위' }).getAttribute('aria-current')).toBeNull()
    target.remove()
  })
})

describe('AC-8023.2 달 고르기 — ◀ [연도 ▾] [월 ▾] ▶, 10년까지', () => {
  it('AC-8023.2: 읽기용 이름 `달 고르기`·`앞 달`·`연도`·`월`·`다음 달` 차례', () => {
    draw()
    const group = screen.getByRole('group', { name: '달 고르기' })
    const controls = [...group.querySelectorAll('button, select')]
    expect(controls.map((control) => control.getAttribute('aria-label'))).toEqual(['앞 달', '연도', '월', '다음 달'])
    expect(within(group).getAllByRole('button')).toHaveLength(2)
    expect(within(group).getAllByRole('combobox')).toHaveLength(2)
  })

  it('AC-8023.2: 연도는 최근 해가 위, 월은 그 해에 고를 수 있는 달만', () => {
    draw()
    expect(optionTexts(screen.getByRole('combobox', { name: '연도' }))).toEqual(['2026년', '2025년', '2024년', '2023년'])
    expect(optionTexts(screen.getByRole('combobox', { name: '월' }))).toEqual(['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월'])
    expect((screen.getByRole('combobox', { name: '연도' }) as HTMLSelectElement).value).toBe('2026')
    expect((screen.getByRole('combobox', { name: '월' }) as HTMLSelectElement).value).toBe('10')
  })

  it('AC-8023.2: 첫 해는 첫 달부터만(2023년 = 11월·12월)', () => {
    draw({ month: '2023-12' })
    expect(optionTexts(screen.getByRole('combobox', { name: '월' }))).toEqual(['11월', '12월'])
  })

  it('AC-8023.2: 옆 글 `{첫 달}부터 {지난달}까지 고를 수 있어요 · 저장된 숫자가 있는 달, 10년까지`', () => {
    draw()
    expect(screen.getByText('2023년 11월부터 2026년 10월까지 고를 수 있어요 · 저장된 숫자가 있는 달, 10년까지')).toBeTruthy()
  })

  it('AC-8023.2: 처음 값(지난달)에서 ▶가 막히고 ◀는 열림', () => {
    draw()
    expect((screen.getByRole('button', { name: '다음 달' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '앞 달' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('AC-8023.2: 첫 달에서 ◀가 막힘', () => {
    draw({ month: '2023-11' })
    expect((screen.getByRole('button', { name: '앞 달' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '다음 달' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('AC-8023.2: ◀ 한 달 앞, ▶ 한 달 뒤 — 1월에서 ◀는 지난해 12월', async () => {
    const first = draw({ month: '2026-01', region: '부산' })
    await userEvent.click(screen.getByRole('button', { name: '앞 달' }))
    expect(first.onChange).toHaveBeenLastCalledWith({ region: '부산', month: '2025-12' })
    await userEvent.click(screen.getByRole('button', { name: '다음 달' }))
    expect(first.onChange).toHaveBeenLastCalledWith({ region: '부산', month: '2026-02' })
  })

  it('AC-8023.2: 연도를 바꾸면 그 해의 같은 달, 없으면 가장 가까운 고를 수 있는 달(2023년 → 11월)', async () => {
    const { onChange } = draw()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: '연도' }), '2023')
    expect(onChange).toHaveBeenLastCalledWith({ region: '전체', month: '2023-11' })
    await userEvent.selectOptions(screen.getByRole('combobox', { name: '연도' }), '2024')
    expect(onChange).toHaveBeenLastCalledWith({ region: '전체', month: '2024-10' })
  })

  it('AC-8023.2: 월을 고르면 그 해 그 달', async () => {
    const { onChange } = draw()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: '월' }), '3')
    expect(onChange).toHaveBeenLastCalledWith({ region: '전체', month: '2026-03' })
  })

  it('AC-8023.2: 고를 달이 지난달 하나뿐이면 ◀▶ 둘 다 막힘', () => {
    const onChange = vi.fn()
    render(<ComparePickers region="전체" month="2026-10" months={compareMonths(null, '2026-11-24')} count={0} unknownRegion={false} onChange={onChange} />)
    expect((screen.getByRole('button', { name: '앞 달' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '다음 달' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('2026년 10월부터 2026년 10월까지 고를 수 있어요 · 저장된 숫자가 있는 달, 10년까지')).toBeTruthy()
  })
})
