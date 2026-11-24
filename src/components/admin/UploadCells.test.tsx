// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ds } from '@/components/ui/classes'
import { FILL_CHOICES, type UploadRow } from '@/lib/autoUpload/range'
import { FillSelect, selectBox, UploadState } from './UploadCells'

// 가입 승인 '승인' 표의 새 두 칸(spec admin-view REQ-8022 AC-8022.3·AC-8022.4, design.md '가입 승인 표 2차',
// 시안 docs/mockups/admin-view ?s=admin-list 2차 — .sel · .au). props만 받는다(네트워크 없음). 오늘은 props로 넘긴다(한국 날짜).
// 자료는 지어낸 값이다. jsdom은 CSS를 계산하지 않는다 → 모양은 클래스로 본다
const TODAY = '2026-11-24' // 화요일

const row = (over: Partial<UploadRow>): UploadRow => ({
  months: 2,
  throughDay: null,
  filledFrom: null,
  lastOkAt: null,
  errorCode: null,
  errorAt: null,
  ...over,
})
// 시안 AUTO의 다라(다 올라옴)·마바(채우는 중)·카타(실패)·러머(아직 없음)와 같은 모양
const DONE = row({ months: 2, throughDay: '2026-11-23', filledFrom: '2026-09-01', lastOkAt: '2026-11-23T23:52:00.000Z' })
const FILLING = row({ months: 12, throughDay: '2026-11-23', filledFrom: '2026-02-01', lastOkAt: '2026-11-24T00:30:00.000Z' })
const FAILED = row({ months: 3, throughDay: '2026-11-20', filledFrom: '2026-08-01', lastOkAt: '2026-11-20T23:47:00.000Z', errorCode: 'E-HELPER-OLD', errorAt: '2026-11-21T00:10:00.000Z' })

const tokens = (classes: string) => classes.split(/\s+/).filter(Boolean)
const classesOf = (el: Element) => tokens(el.getAttribute('class') ?? '')
const hasAll = (el: Element, classes: string) => expect(classesOf(el)).toEqual(expect.arrayContaining(tokens(classes)))
const phoneOnly = (el: Element) => classesOf(el).filter((t) => t.startsWith('max-md:'))

afterEach(() => {
  cleanup()
})

// 저절로 올림 칸: 두 줄 묶음(첫 자식)과 그 안 줄들
const box = (container: HTMLElement) => container.firstElementChild as HTMLElement
const lines = (container: HTMLElement) => Array.from(box(container).children) as HTMLElement[]

describe('AC-8022.3 채울 기간 고르기(FillSelect)', () => {
  it('AC-8022.3: 고르기 = FILL_CHOICES 아홉(값 = months, 글 = 시안 `1달`~`10년`), 고른 값 = 그 의원 months, 읽기용 이름 `{의원} 채울 기간`', () => {
    render(<FillSelect name="다라 정형외과의원" months={12} onChange={() => {}} />)
    const select = screen.getByRole<HTMLSelectElement>('combobox', { name: '다라 정형외과의원 채울 기간' })
    expect(Array.from(select.options).map((o) => [o.value, o.textContent])).toEqual([
      ['1', '1달'],
      ['2', '2달'],
      ['3', '3달'],
      ['6', '6달'],
      ['12', '1년'],
      ['24', '2년'],
      ['36', '3년'],
      ['60', '5년'],
      ['120', '10년'],
    ])
    expect(Array.from(select.options).map((o) => Number(o.value))).toEqual(FILL_CHOICES.map((c) => c.months))
    expect(select.selectedOptions[0]?.textContent).toBe('1년')
  })

  it('AC-8022.3: 지역 고르기와 같은 32px 상자(시안 .sel — 1px line-strong·surface·좌우 6px·small ink·초점 고리), 마우스 글 없음, 폰 전용 클래스 없음', () => {
    render(<FillSelect name="다라 정형외과의원" months={2} onChange={() => {}} />)
    const select = screen.getByRole('combobox')
    expect(classesOf(select)).toEqual(tokens(`${selectBox} text-ink`))
    hasAll(select, `h-8 cursor-pointer rounded-control border border-line-strong bg-surface px-1.5 text-small text-ink ${ds.focusRing}`)
    hasAll(select, 'not-disabled:hover:border-muted disabled:cursor-not-allowed disabled:opacity-40')
    expect(select.getAttribute('title')).toBeNull()
    expect(phoneOnly(select)).toEqual([])
  })

  it('AC-8022.3: 바꾸면 확인 창 없이 고른 months(숫자)와 그 상자로 onChange 한 번 — 값은 부르는 쪽이 고친다(props 그대로면 그대로)', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<FillSelect name="가나 정형외과의원" months={120} onChange={onChange} />)
    const select = screen.getByRole<HTMLSelectElement>('combobox')
    await user.selectOptions(select, '2달')
    expect(onChange).toHaveBeenCalledExactlyOnceWith(2, select)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(select.selectedOptions[0]?.textContent).toBe('10년')
  })

  it('AC-8022.3: disabled면 막힌다(보내는 동안)', () => {
    render(<FillSelect name="다라 정형외과의원" months={2} disabled onChange={() => {}} />)
    expect(screen.getByRole<HTMLSelectElement>('combobox').disabled).toBe(true)
  })
})

describe('AC-8022.4 저절로 올림 칸(UploadState)', () => {
  it('AC-8022.4: 다 올라옴 — 한 줄 `{M월 D일}까지`(small ink), 마우스 글 `마지막으로 올린 때 {M월 D일 (요일) HH:mm}`(한국 시각)', () => {
    const { container } = render(<UploadState row={DONE} months={2} today={TODAY} />)
    expect(lines(container).map((el) => el.textContent)).toEqual(['11월 23일까지'])
    hasAll(lines(container)[0], 'truncate text-small text-ink')
    expect(box(container).getAttribute('title')).toBe('마지막으로 올린 때 11월 24일 (화) 08:52')
  })

  it('AC-8022.4: 채우는 중 — 첫 줄 `{M월 D일}까지`(ink) + 둘째 줄 `{YYYY년 M월}까지 채움`(caption accent-strong), 마우스 글에 채울 기간 덧붙임', () => {
    const { container } = render(<UploadState row={FILLING} months={12} today={TODAY} />)
    const [first, second] = lines(container)
    expect(lines(container).map((el) => el.textContent)).toEqual(['11월 23일까지', '2026년 2월까지 채움'])
    hasAll(first, 'truncate text-small text-ink')
    hasAll(second, 'truncate text-caption text-accent-strong')
    expect(classesOf(second)).not.toContain('text-muted')
    expect(box(container).getAttribute('title')).toBe(
      '마지막으로 올린 때 11월 24일 (화) 09:30 · 채울 기간 1년 가운데 2026년 2월까지 채웠어요. 앱을 열 때마다 5분쯤씩 더 채워요.',
    )
  })

  it('AC-8022.4: 실패 — 첫 줄 오류 글(lib/errors.ts what, negative 500) + 둘째 줄 `{번호} · {M월 D일}까지`(caption muted), 마우스 글은 마지막으로 올린 때', () => {
    const { container } = render(<UploadState row={FAILED} months={3} today={TODAY} />)
    const [first, second] = lines(container)
    expect(lines(container).map((el) => el.textContent)).toEqual(['도우미를 업데이트하세요', 'E-HELPER-OLD · 11월 20일까지'])
    hasAll(first, 'truncate text-small font-medium text-negative')
    expect(classesOf(first)).not.toContain('text-ink')
    hasAll(second, 'truncate text-caption text-muted')
    expect(box(container).getAttribute('title')).toBe('마지막으로 올린 때 11월 21일 (토) 08:47')
  })

  it('AC-8022.4: 시안 다른 실패 예(E-STATS-SAVE-FAILED)도 그 번호의 what', () => {
    const { container } = render(<UploadState row={{ ...FAILED, errorCode: 'E-STATS-SAVE-FAILED', throughDay: '2026-11-21' }} months={6} today={TODAY} />)
    expect(lines(container).map((el) => el.textContent)).toEqual(['통계 숫자를 저장하지 못했어요', 'E-STATS-SAVE-FAILED · 11월 21일까지'])
  })

  it('AC-8022.4: 한 번도 없음(줄 없음·올라온 날 없음) — `아직 없음`(small muted) 한 줄, 마우스 글 `이 의원 비트 PC에서 아직 올라온 날이 없어요.`', () => {
    for (const value of [undefined, row({})]) {
      const { container, unmount } = render(<UploadState row={value} months={2} today={TODAY} />)
      expect(lines(container).map((el) => el.textContent)).toEqual(['아직 없음'])
      hasAll(lines(container)[0], 'truncate text-small text-muted')
      expect(classesOf(lines(container)[0])).not.toContain('text-ink')
      expect(box(container).getAttribute('title')).toBe('이 의원 비트 PC에서 아직 올라온 날이 없어요.')
      unmount()
    }
  })

  it('AC-8022.4: 마지막으로 올린 때가 없으면 마우스 글 자리를 두지 않는다(빈 title 없음)', () => {
    const { container } = render(<UploadState row={{ ...DONE, lastOkAt: null }} months={2} today={TODAY} />)
    expect(box(container).hasAttribute('title')).toBe(false)
  })

  it('AC-8022.4: 손에 든 months가 바뀌면 다시 읽지 않고 그 값으로 글이 바로 바뀐다 — 1년(채우는 중) → 6달(다 올라옴, 둘째 줄 사라짐)', () => {
    const { container, rerender } = render(<UploadState row={FILLING} months={12} today={TODAY} />)
    expect(lines(container)).toHaveLength(2)
    rerender(<UploadState row={FILLING} months={6} today={TODAY} />)
    expect(lines(container).map((el) => el.textContent)).toEqual(['11월 23일까지'])
    expect(box(container).getAttribute('title')).toBe('마지막으로 올린 때 11월 24일 (화) 09:30')
    rerender(<UploadState row={FILLING} months={120} today={TODAY} />)
    expect(lines(container).map((el) => el.textContent)).toEqual(['11월 23일까지', '2026년 2월까지 채움'])
    expect(box(container).getAttribute('title')).toContain('채울 기간 10년 가운데 2026년 2월까지 채웠어요.')
  })

  it('AC-8022.4: 두 줄 묶음은 세로(flex-col·min-w-0)이고 줄마다 말줄임 — 새 색·폰 전용 클래스 없음, 단추·고르기 없음', () => {
    for (const [value, months] of [[DONE, 2], [FILLING, 12], [FAILED, 3], [undefined, 2]] as const) {
      const { container, unmount } = render(<UploadState row={value} months={months} today={TODAY} />)
      hasAll(box(container), 'flex min-w-0 flex-col')
      for (const el of [box(container), ...lines(container)]) {
        expect(phoneOnly(el)).toEqual([])
        const colors = classesOf(el).filter((t) => /^text-(?!small$|caption$)/.test(t))
        for (const c of colors) expect(['text-ink', 'text-accent-strong', 'text-negative', 'text-muted']).toContain(c)
      }
      expect(container.querySelectorAll('button, select')).toHaveLength(0)
      unmount()
    }
  })
})
