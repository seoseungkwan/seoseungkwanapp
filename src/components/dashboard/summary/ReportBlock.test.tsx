// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import type { DayPayload } from '@/types/payload'
import { ReportBlock } from './ReportBlock'
import { reportSentence, todayView } from './view'

// 원장님 보고 문장 (tab-frame REQ-317, design.md '원장님 보고 문장'·'보고 문장 틀'·'복사'·'오늘 자료 없음(연결 뒤)', 메모 §3·§4).
// dashboard-ux AC-2705.1이 바꾼 것: 이름 줄 "{오늘|M월 D일} 보고 문장" + 칩 "자동 집계 요약"(AI 요약과 구분), 문장은 h1이 아니라 body 크기 한 단락
// (첫 문장 · 나머지 문장 두 조각). h1은 머리 줄 "대시보드" 하나라 이 블록에는 h1이 없다. [복사]·복사 결과·막힘 툴팁은 그대로다.
// navigator.clipboard는 가짜(성공·실패·없음), 2초 뒤 되돌림은 가짜 시계로 본다. 가짜 DayPayload는 이 시험 파일 안에서만 만든다

const TODAY = '2026-10-31' // 토요일

type Rx = DayPayload['rx'][number]
function day(ymd: string, o: { partial?: boolean; newPatients?: number; returning?: number; rx?: Rx[] } = {}): DayPayload {
  const newPatients = o.newPatients ?? 2
  const returning = o.returning ?? 8
  return {
    schemaVersion: 2,
    quality: 'valid',
    day: ymd,
    partial: o.partial ?? false,
    totals: { patients: newPatients + returning, newPatients, returning, unknown: 0 },
    rx: o.rx ?? [],
    groups: [],
    revisit: { cohort: newPatients, within7: null, within14: null },
  }
}

// 오늘 끝남 13명(신환 4 · 재진 9) · 지난주 토요일 끝남 10명. 처방 이름·코드는 문장에 들면 안 된다
const DAYS = [
  day(TODAY, { newPatients: 4, returning: 9, rx: [{ code: 'MM042', name: '홍길동 처방', type: '처치', patients: 13, newPatients: 4, returning: 9 }] }),
  day('2026-10-24'),
]
const FULL = '오늘 환자 13명이 왔습니다. 신환 4명, 재진 9명입니다. 지난주 토요일보다 3명 많습니다.'
const FAILED = '복사하지 못했어요. 문장을 길게 눌러 직접 복사해 주세요.'

const tokens = (classes: string | null) => (classes ?? '').split(/\s+/).filter(Boolean)
const classesOf = (el: Element) => tokens(el.getAttribute('class'))
const hasAll = (el: Element, classes: string) => expect(classesOf(el)).toEqual(expect.arrayContaining(tokens(classes)))

function markupOf(node: ReactElement): string {
  const host = document.createElement('div')
  const root = createRoot(host)
  act(() => root.render(node))
  const html = host.innerHTML
  act(() => root.unmount())
  return html
}

// 가짜 클립보드(값이 undefined면 navigator.clipboard 없음)
function setClipboard(value: { writeText: (text: string) => Promise<void> } | undefined) {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true })
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  setClipboard(undefined)
})

const draw = (days: readonly DayPayload[] = DAYS) => render(<ReportBlock today={TODAY} days={days} />)
const copyButton = () => screen.getByRole('button')
// 보고 문장 한 단락(AC-2705.1): 이름 줄 다음 단락. 첫 조각 = 첫 문장, 둘째 조각 = 나머지
const sentence = (container: HTMLElement = document.body) => {
  expect(container.querySelectorAll('h1')).toHaveLength(0)
  const name = screen.getByText(/^(오늘|\d+월 \d+일) 보고 문장$/)
  const paragraph = name.parentElement!.nextElementSibling!
  expect(paragraph.tagName).toBe('P')
  return paragraph
}
const firstOf = (container?: HTMLElement) => sentence(container).children[0]!
const restOf = (container?: HTMLElement) => sentence(container).children[1]!
const live = (container: HTMLElement) => {
  const el = container.querySelector('[aria-live="polite"]')
  if (!el) throw new Error('aria-live 자리가 없다')
  return el
}
const press = async () => {
  await act(async () => {
    fireEvent.click(copyButton())
  })
}

describe('보고 문장 — 오늘 줄이 있음', () => {
  it('AC-317.1·AC-2705.1: 머리 줄 "오늘 보고 문장"(small 600 ink) + 칩 "자동 집계 요약"(보조) 왼쪽 · [복사] 오른쪽, 아래 1px line', () => {
    draw()
    const name = screen.getByText('오늘 보고 문장')
    hasAll(name, 'text-small font-semibold text-ink')
    const chip = screen.getByText('자동 집계 요약')
    expect(chip.parentElement).toBe(name)
    hasAll(chip, ds.chip.neutral)
    const head = name.parentElement!
    hasAll(head, 'mt-3 flex items-center justify-between gap-3 border-b border-line pb-2')
    expect(head.contains(copyButton())).toBe(true)
    expect(head.firstElementChild).toBe(name)
    expect(screen.queryByText(/원장님 보고 문장|AI|Claude/)).toBeNull()
  })

  it('AC-2705.1: 문장은 h1이 아니라 body 크기 한 단락(ink-2) — 첫 문장 조각(600 ink) · 나머지 조각, display·lead 크기가 없다', () => {
    const { container } = draw()
    const made = reportSentence(todayView(TODAY, DAYS))!
    expect(made.full).toBe(FULL)
    const paragraph = sentence(container)
    expect(paragraph.textContent).toBe(FULL)
    hasAll(paragraph, 'mt-2 text-body text-ink-2')
    expect(paragraph.className).not.toMatch(/text-(display|heading|lead|title)/)
    expect(paragraph.children).toHaveLength(2)
    expect(firstOf(container).textContent).toBe('오늘 환자 13명이 왔습니다.')
    hasAll(firstOf(container), 'font-semibold text-ink')
    expect(restOf(container).textContent).toBe('신환 4명, 재진 9명입니다. 지난주 토요일보다 3명 많습니다.')
    expect(container.querySelectorAll('h1, h2, h3')).toHaveLength(0)
  })

  it('AC-317.1·AC-2705.1: 덜 끝난 날은 "오늘 지금까지 …" 틀이다', () => {
    const { container } = draw([day(TODAY, { partial: true, newPatients: 1, returning: 2 })])
    expect(firstOf(container).textContent).toBe('오늘 지금까지 환자 3명이 왔습니다.')
    expect(restOf(container).textContent).toBe('신환 1명, 재진 2명입니다.')
  })

  it('AC-317.1: 안심 줄 "보고 문장은 숫자만 쓰고 환자 이름은 쓰지 않아요."(caption muted, 앞에 꾸밈 shield 14 positive)', () => {
    draw()
    const text = screen.getByText('보고 문장은 숫자만 쓰고 환자 이름은 쓰지 않아요.')
    const line = text.parentElement!
    hasAll(line, 'mt-4 flex items-start gap-1.5 text-caption text-muted')
    expect(line.querySelector('svg')!.outerHTML).toBe(markupOf(<Icon name="shield" size={14} className="mt-px shrink-0 text-positive" />))
  })

  it('AC-317.1: 처방 이름·코드·차트번호는 화면에 없다(totals만으로 만든다)', () => {
    const { container } = draw()
    expect(container.textContent).not.toContain('홍길동')
    expect(container.textContent).not.toContain('MM042')
  })
})

describe('[복사]', () => {
  it('AC-317.2: [복사]는 ds.button.secondarySmall + 꾸밈 copy 14 + "복사", 최소 폭 112px, 누름 1px · transition', () => {
    draw()
    const button = copyButton()
    expect(button.getAttribute('type')).toBe('button')
    hasAll(button, `${ds.button.secondarySmall} min-w-28 transition not-disabled:not-aria-disabled:active:translate-y-px`)
    expect(button.textContent).toBe('복사')
    expect(button.querySelector('svg')!.outerHTML).toBe(markupOf(<Icon name="copy" size={14} className="text-ink-2" />))
    expect(button.getAttribute('aria-disabled')).toBeNull()
  })

  it('AC-317.2: 누르면 보고 문장 전부가 writeText로 가고, 2초 동안 check 14(positive) + "복사했어요", 화면 읽기 자리에도 "복사했어요" → 2초 뒤 "복사"', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    setClipboard({ writeText })
    const { container } = draw()
    await press()
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText).toHaveBeenCalledWith(FULL)
    const button = copyButton()
    expect(button.textContent).toBe('복사했어요')
    expect(button.querySelector('svg')!.outerHTML).toBe(markupOf(<Icon name="check" size={14} className="text-positive" />))
    expect(live(container).textContent).toBe('복사했어요')
    hasAll(live(container).firstElementChild!, 'sr-only')
    act(() => vi.advanceTimersByTime(1999))
    expect(copyButton().textContent).toBe('복사했어요')
    act(() => vi.advanceTimersByTime(1))
    expect(copyButton().textContent).toBe('복사')
    expect(live(container).textContent).toBe('')
  })

  it('AC-317.2: 쓰기가 실패하면 aria-live 자리에 "복사하지 못했어요. …"가 보이고 단추는 "복사" 그대로다(오류 내용은 보이지 않는다)', async () => {
    setClipboard({ writeText: vi.fn<(text: string) => Promise<void>>().mockRejectedValue(new Error('denied')) })
    const { container } = draw()
    await press()
    expect(live(container).textContent).toBe(FAILED)
    expect(copyButton().textContent).toBe('복사')
    expect(container.textContent).not.toContain('denied')
  })

  it('AC-317.2: navigator.clipboard가 없으면 같은 안내가 보인다', async () => {
    setClipboard(undefined)
    const { container } = draw()
    await press()
    expect(live(container).textContent).toBe(FAILED)
  })

  it('AC-317.2: 복사에 성공한 뒤 2초 안에 다시 눌러 실패하면, 남은 되돌림 타이머가 실패 안내를 지우지 않는다', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const writeText = vi
      .fn<(text: string) => Promise<void>>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('denied'))
    setClipboard({ writeText })
    const { container } = draw()
    await press()
    expect(copyButton().textContent).toBe('복사했어요')
    act(() => vi.advanceTimersByTime(500))
    await press()
    expect(live(container).textContent).toBe(FAILED)
    expect(copyButton().textContent).toBe('복사')
    expect(vi.getTimerCount()).toBe(0)
    act(() => vi.advanceTimersByTime(2000))
    expect(live(container).textContent).toBe(FAILED)
  })

  it('AC-317.2: 2초가 지나기 전에 사라지면 되돌림 타이머를 지운다', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    setClipboard({ writeText: vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined) })
    const { unmount } = draw()
    await press()
    expect(vi.getTimerCount()).toBe(1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('AC-317.2: 다시 누르면 2초를 새로 센다(타이머는 하나)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    setClipboard({ writeText: vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined) })
    draw()
    await press()
    act(() => vi.advanceTimersByTime(1500))
    await press()
    expect(vi.getTimerCount()).toBe(1)
    act(() => vi.advanceTimersByTime(1500))
    expect(copyButton().textContent).toBe('복사했어요')
    act(() => vi.advanceTimersByTime(500))
    expect(copyButton().textContent).toBe('복사')
  })
})

describe('연결 뒤 · 오늘 자료 없음', () => {
  const NO_TODAY = [day('2026-10-30'), day('2026-10-24')]

  it('AC-317.3·AC-2705.1: 한 단락 "오늘 받은 진료 자료가 아직 없어요"(600 ink) + 안내(body ink-2), h1이 없다', () => {
    const { container } = draw(NO_TODAY)
    expect(firstOf(container).textContent).toBe('오늘 받은 진료 자료가 아직 없어요')
    expect(restOf(container).textContent).toBe('오늘 자료가 들어오면 이 자리에 보고 문장이 올라와요.')
    hasAll(sentence(container), 'text-body text-ink-2')
    expect(screen.getByText('오늘 보고 문장')).toBeTruthy()
    expect(screen.getByText('보고 문장은 숫자만 쓰고 환자 이름은 쓰지 않아요.')).toBeTruthy()
  })

  it('AC-317.3: [복사]는 막힘(aria-disabled="true") — 눌러도 클립보드를 부르지 않는다', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    setClipboard({ writeText })
    const { container } = draw(NO_TODAY)
    expect(copyButton().getAttribute('aria-disabled')).toBe('true')
    expect(copyButton().hasAttribute('disabled')).toBe(false)
    await press()
    expect(writeText).not.toHaveBeenCalled()
    expect(copyButton().textContent).toBe('복사')
    expect(live(container).textContent).toBe('')
  })

  it('AC-317.3: aria-describedby → 툴팁(role="tooltip") "문장이 생기면 복사할 수 있어요", 올림·초점에 보이고 나타날 때만 아래 2px에서 150ms', () => {
    draw(NO_TODAY)
    const id = copyButton().getAttribute('aria-describedby')
    expect(id).toBeTruthy()
    const tip = document.getElementById(id!)!
    expect(tip.getAttribute('role')).toBe('tooltip')
    expect(tip.textContent).toBe('문장이 생기면 복사할 수 있어요')
    expect(screen.getByRole('tooltip', { hidden: true })).toBe(tip)
    hasAll(tip, ds.layer)
    hasAll(tip, 'invisible opacity-0 translate-y-0.5 pointer-events-none whitespace-nowrap text-caption')
    hasAll(tip, 'group-hover:visible group-hover:opacity-100 group-hover:translate-y-0 group-hover:transition')
    hasAll(tip, 'group-focus-within:visible group-focus-within:opacity-100 group-focus-within:translate-y-0 group-focus-within:transition')
    // 닫힐 때는 바로(맨 transition이 없다)
    expect(classesOf(tip)).not.toContain('transition')
    const wrap = tip.parentElement!
    hasAll(wrap, 'group relative inline-flex')
    expect(wrap.contains(copyButton())).toBe(true)
  })

  it('AC-317.3: 오늘 줄이 있으면 툴팁·aria-describedby가 없다', () => {
    draw()
    expect(copyButton().getAttribute('aria-describedby')).toBeNull()
    expect(screen.queryByRole('tooltip', { hidden: true })).toBeNull()
  })
})

describe('소스 (AC-317.4)', () => {
  const DIR = join(process.cwd(), 'src/components/dashboard/summary')
  const code = (file: string) =>
    readFileSync(join(DIR, file), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')

  it('AC-317.4: 문장 만들기는 순수 함수 reportSentence(view.ts, React 없음)이고 숫자는 formatCount, 요일은 lib/analytics/dates.ts', () => {
    const view = code('view.ts')
    expect(view).not.toMatch(/from 'react'|from "react"|'use client'/)
    expect(view).toMatch(/export function reportSentence\(/)
    expect(view).toMatch(/import \{[^}]*\bformatCount\b[^}]*\} from '@\/components\/charts\/format'/)
    expect(view).toMatch(/import \{[^}]*\bweekdayOf\b[^}]*\} from '@\/lib\/analytics\/dates'/)
    const block = code('ReportBlock.tsx')
    expect(block).toMatch(/^'use client'/)
    expect(block).toMatch(/import \{[^}]*\breportSentence\b[^}]*\} from '\.\/view'/)
  })

  it('AC-317.4: 복사 결과 문구는 이 파일 안에 있고 lib/errors.ts를 쓰지 않는다, 브라우저 저장소·네트워크 없음', () => {
    const block = code('ReportBlock.tsx')
    expect(block).toContain(FAILED)
    expect(block).toContain('복사했어요')
    expect(block).not.toMatch(/@\/lib\/errors/)
    expect(block).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB|document\.cookie|supabase/)
  })
})

// 날짜 고르기 (bit-dashboard REQ-605, design.md '### 날짜 고르기', 시안 docs/mockups/bit-dashboard/gen.py applyDay)
describe('고른 날 (selected)', () => {
  const LATER = '2026-11-02' // 지난 토요일(2026-10-31)을 고를 수 있는 오늘
  const PAST_FULL = '10월 31일 환자 13명이 왔습니다. 신환 4명, 재진 9명입니다. 지난주 토요일보다 3명 많습니다.'
  const NO_DATA_FIRST = '이 날은 진료 자료가 없어요'
  const NO_DATA_REST = '진료가 없었거나 비트에 접수 기록이 없는 날이에요.'
  const pick = (selected: string | undefined, days: readonly DayPayload[] = DAYS, today = LATER) => render(<ReportBlock today={today} days={days} selected={selected} />)

  it('AC-605.2·AC-2705.1: 지난 날짜를 고르면 이름 줄이 "10월 31일 보고 문장"이고 문장은 "{월}월 {일}일 환자 N명이 왔습니다."로 시작하며, 블록 안에 "오늘" 글자가 없다', () => {
    const { container } = pick(TODAY)
    expect(screen.getByText('10월 31일 보고 문장')).toBeTruthy()
    expect(firstOf(container).textContent).toBe('10월 31일 환자 13명이 왔습니다.')
    expect(restOf(container).textContent).toBe('신환 4명, 재진 9명입니다. 지난주 토요일보다 3명 많습니다.')
    expect(container.textContent).not.toContain('오늘')
  })

  it('AC-605.2: [복사]는 고른 날의 문장을 복사한다', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    setClipboard({ writeText })
    pick(TODAY)
    await act(async () => {
      fireEvent.click(copyButton())
    })
    expect(writeText.mock.calls).toEqual([[PAST_FULL]])
  })

  it('AC-605.4: 자료가 없는 지난 날짜면 AC-605.4 문구이고 [복사]가 막힌다(누르면 아무 일도 없다)', () => {
    const writeText = vi.fn(() => Promise.resolve())
    setClipboard({ writeText })
    const { container } = pick('2026-10-29')
    expect(firstOf(container).textContent).toBe(NO_DATA_FIRST)
    expect(restOf(container).textContent).toBe(NO_DATA_REST)
    expect(copyButton().getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(copyButton())
    expect(writeText).not.toHaveBeenCalled()
    expect(container.textContent).not.toContain('오늘')
  })

  it('AC-605.4: 그 날은 앞으로도 문장이 생기지 않으므로 "문장이 생기면" 툴팁을 달지 않는다(시안은 단추만 막는다)', () => {
    pick('2026-10-29')
    expect(screen.queryByRole('tooltip', { hidden: true })).toBeNull()
    expect(copyButton().getAttribute('aria-describedby')).toBeNull()
  })

  it('AC-605.4: 오늘 자료가 아직 없을 때는 고른 날이 오늘이어도 지금 문구 그대로다', () => {
    pick(LATER)
    expect(firstOf().textContent).toBe('오늘 받은 진료 자료가 아직 없어요')
    expect(restOf().textContent).toBe('오늘 자료가 들어오면 이 자리에 보고 문장이 올라와요.')
    expect(screen.getByRole('tooltip', { hidden: true }).textContent).toBe('문장이 생기면 복사할 수 있어요')
  })

  it('AC-605.2: selected가 없거나 오늘이면 지금처럼 오늘 문장이다', () => {
    const none = pick(undefined, DAYS, TODAY)
    expect(firstOf().textContent).toBe('오늘 환자 13명이 왔습니다.')
    const html = none.container.innerHTML.replace(/_r_\w*_|:r\w*:|«r\w*»/g, '')
    none.unmount()
    const same = pick(TODAY, DAYS, TODAY)
    expect(same.container.innerHTML.replace(/_r_\w*_|:r\w*:|«r\w*»/g, '')).toBe(html)
  })

  it('AC-605.9·AC-2705.1: 고른 지난 날이 partial: true면 첫 문장 "{월}월 {일}일 환자 N명까지 확인됐어요.", 이어서 "그날 자료가 중간까지만 저장돼 있어요."(한 단락)', () => {
    const { container } = pick(TODAY, [day(TODAY, { partial: true }), day('2026-10-24')])
    expect(firstOf(container).textContent).toBe('10월 31일 환자 10명까지 확인됐어요.')
    expect(restOf(container).textContent).toBe('그날 자료가 중간까지만 저장돼 있어요.')
    expect(restOf(container).previousElementSibling).toBe(firstOf(container))
    expect(container.textContent).not.toMatch(/신환|재진|지난주|오늘/)
  })

  it('AC-605.9: [복사]는 막히지 않고 두 줄을 빈칸 하나로 이은 글을 복사한다(툴팁 없음)', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    setClipboard({ writeText })
    pick(TODAY, [day(TODAY, { partial: true }), day('2026-10-24')])
    expect(copyButton().getAttribute('aria-disabled')).toBeNull()
    expect(screen.queryByRole('tooltip', { hidden: true })).toBeNull()
    await act(async () => {
      fireEvent.click(copyButton())
    })
    expect(writeText.mock.calls).toEqual([['10월 31일 환자 10명까지 확인됐어요. 그날 자료가 중간까지만 저장돼 있어요.']])
  })

  it('AC-605.9: 고른 날이 오늘이면 partial: true여도 지금처럼 "오늘 지금까지 …" 틀이다', () => {
    pick(TODAY, [day(TODAY, { partial: true, newPatients: 1, returning: 2 })], TODAY)
    expect(firstOf().textContent).toBe('오늘 지금까지 환자 3명이 왔습니다.')
    expect(restOf().textContent).toBe('신환 1명, 재진 2명입니다.')
  })
})

// 의사랑 의원(uisarang-upload AC-8811.4, requirements.md '시안에 없어 이 명세가 정한 글'): 그날 줄이 없을 때 두 글만 의사랑 글이고 나머지는 지금 그대로다
describe('의사랑 · 그날 줄 없음 (uisarang-upload AC-8811.4)', () => {
  const LATER = '2026-11-02'
  const pick = (selected: string | undefined, uis: boolean | undefined, days: readonly DayPayload[] = DAYS, today = LATER) =>
    render(<ReportBlock today={today} days={days} selected={selected} uis={uis} />)

  it('AC-8811.4: 오늘 줄이 없으면 "오늘 받은 진료 자료가 아직 없어요" / "오늘 엑셀을 올리면 이 자리에 보고 문장이 올라와요."이고 [복사] 막힘·툴팁은 그대로다', () => {
    const { container } = pick(undefined, true)
    expect(firstOf(container).textContent).toBe('오늘 받은 진료 자료가 아직 없어요')
    expect(restOf(container).textContent).toBe('오늘 엑셀을 올리면 이 자리에 보고 문장이 올라와요.')
    expect(copyButton().getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByRole('tooltip', { hidden: true }).textContent).toBe('문장이 생기면 복사할 수 있어요')
    expect(container.textContent).not.toContain('오늘 자료가 들어오면')
  })

  it('AC-8811.4: 지난 날 줄이 없으면 "이 날은 진료 자료가 없어요" / "진료가 없었거나 그날 의사랑 엑셀을 아직 올리지 않은 날이에요."이고 비트 글이 없다', () => {
    const { container } = pick('2026-10-29', true)
    expect(firstOf(container).textContent).toBe('이 날은 진료 자료가 없어요')
    expect(restOf(container).textContent).toBe('진료가 없었거나 그날 의사랑 엑셀을 아직 올리지 않은 날이에요.')
    expect(container.textContent).not.toContain('비트')
    expect(copyButton().getAttribute('aria-disabled')).toBe('true')
  })

  it('AC-8811.4: 그날 줄이 있으면 uis와 상관없이 지금 문장 그대로다', () => {
    const strip = (html: string) => html.replace(/_r_\w*_|:r\w*:|«r\w*»/g, '')
    for (const selected of [TODAY, undefined]) {
      const today = selected === undefined ? TODAY : LATER
      const plain = pick(selected, undefined, DAYS, today)
      const html = strip(plain.container.innerHTML)
      plain.unmount()
      const uis = pick(selected, true, DAYS, today)
      expect(strip(uis.container.innerHTML)).toBe(html)
      uis.unmount()
    }
  })

  it('AC-8811.4: uis가 거짓이거나 없으면 지금 글 그대로다', () => {
    for (const uis of [false, undefined]) {
      const { container, unmount } = pick('2026-10-29', uis)
      expect(restOf(container).textContent).toBe('진료가 없었거나 비트에 접수 기록이 없는 날이에요.')
      unmount()
    }
  })
})
