// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CHIP_TEXT, HOW_TEXT, type HowChip } from '@/lib/location/method'
import { HowLine, type HowLineProps } from './HowLine'

afterEach(cleanup)

// 부르는 쪽(묶음)이 method.ts `HOW` 글을 `fillHow`로 채워 넘긴 모양 — 부품은 받은 글만 그린다
const line = {
  what: '행정안전부 주민등록 인구·세대(기준 2026년 10월 31일) · 아파트 단지·입주 예정',
  how: '살필 범위에 걸친 동마다 겹친 넓이만큼 나눠 더한 어림이에요',
  why: '정형외과 자리는 낮에 오가는 사람보다 사는 사람과 더 관련이 있었어요',
}
const more = {
  what: '행정안전부 주민등록 인구·세대(행정동, 기준 2026년 10월 31일)',
  how: '살필 범위(1km)에 걸친 행정동마다 범위와 겹친 넓이 비율만큼 인구·세대를 나눠 더해요.',
  why: '의원에 다닐 환자는 대부분 둘레에 사는 사람이에요.',
  basis: '연구 근거 — 이선경 외, 가정의학회지 2009;30(4):292-300(초록)',
}

const props = (over: Partial<HowLineProps> = {}): HowLineProps => ({
  chip: 'research',
  line,
  more,
  open: false,
  onToggle: () => {},
  ...over,
})

const lineOf = () => screen.getByText('이렇게 봤어요').closest('p')!
const listOf = (container: HTMLElement) => container.querySelector('dl')!

describe("AC-7920.2: '이렇게 봤어요' 한 줄 HowLine", () => {
  it('AC-7920.2: 한 줄 `이렇게 봤어요 {무엇을 봤나} · {어떻게 셌나} · {왜 중요한가}` — 머리 글은 굵게, 세 조각은 받은 차례 그대로', () => {
    render(<HowLine {...props()} />)
    const p = lineOf()
    const head = screen.getByText('이렇게 봤어요')
    expect(head.tagName).toBe('B')
    expect(p.firstElementChild).toBe(head)
    expect(p.textContent).toContain(`이렇게 봤어요 ${line.what} · ${line.how} · ${line.why}`)
  })

  it.each<[HowChip, string[], ('accent' | 'neutral')[]]>([
    ['research', ['연구 근거'], ['accent']],
    ['law', ['법 근거'], ['accent']],
    ['law-common', ['법 근거', '흔히 보는 기준'], ['accent', 'neutral']],
    ['common', ['흔히 보는 기준'], ['neutral']],
  ])('AC-7920.2: 근거 칩 %s → %j (연구·법 = 파란 칩, 흔히 보는 기준 = 회색 칩)', (chip, labels, tones) => {
    render(<HowLine {...props({ chip })} />)
    const p = lineOf()
    const chips = Array.from(p.querySelectorAll('[data-chip]'))
    expect(chips.map((c) => c.textContent)).toEqual(labels)
    chips.forEach((c, i) => {
      expect(c.getAttribute('data-chip')).toBe(tones[i])
      expect(c.className).toContain(tones[i] === 'accent' ? 'bg-accent-soft' : 'bg-canvas')
      expect(c.className).toContain(tones[i] === 'accent' ? 'text-accent-strong' : 'text-ink-2')
    })
    // 칩은 한 줄 끝(왜 중요한가 다음), [더 보기] 단추 앞
    const button = screen.getByRole('button', { name: '더 보기' })
    expect(p.contains(button)).toBe(true)
    expect(chips.at(-1)!.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(p.textContent!.indexOf(line.why)).toBeLessThan(p.textContent!.indexOf(labels[0]))
  })

  it('AC-7920.2: 접힌 때 — [더 보기](aria-expanded=false)이고 네 줄은 숨어 있다', () => {
    const { container } = render(<HowLine {...props({ open: false })} />)
    const button = screen.getByRole('button', { name: '더 보기' })
    expect(button.getAttribute('type')).toBe('button')
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('button', { name: '접기' })).toBeNull()
    expect(listOf(container).hidden).toBe(true)
  })

  it('AC-7920.2: 펼친 때 — [접기](aria-expanded=true)이고 네 줄(무엇을 봤나·어떻게 셌나·왜 중요한가·근거)이 차례로 보인다', () => {
    const { container } = render(<HowLine {...props({ open: true })} />)
    const button = screen.getByRole('button', { name: '접기' })
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(screen.queryByRole('button', { name: '더 보기' })).toBeNull()
    const dl = listOf(container)
    expect(dl.hidden).toBe(false)
    expect(button.getAttribute('aria-controls')).toBe(dl.id)
    expect(dl.id).not.toBe('')
    const rows = Array.from(dl.querySelectorAll('dt')).map((dt) => [dt.textContent, dt.nextElementSibling?.textContent])
    expect(rows).toEqual([
      ['무엇을 봤나', more.what],
      ['어떻게 셌나', more.how],
      ['왜 중요한가', more.why],
      ['근거', more.basis],
    ])
    expect(Array.from(dl.querySelectorAll('dt')).every((dt) => dt.nextElementSibling?.tagName === 'DD')).toBe(true)
  })

  it('AC-7920.2: 단추를 누르면 onToggle을 한 번 부르고, 부품은 스스로 펼치지 않는다(펼침은 props)', () => {
    const onToggle = vi.fn()
    const { container } = render(<HowLine {...props({ open: false, onToggle })} />)
    fireEvent.click(screen.getByRole('button', { name: '더 보기' }))
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: '더 보기' })).toBeTruthy()
    expect(listOf(container).hidden).toBe(true)
  })

  it('AC-7920.2: 펼친 것은 범위를 바꿔 다시 그려도(받은 글이 바뀌어도) 그대로다', () => {
    const { container, rerender } = render(<HowLine {...props({ open: true })} />)
    const wider = { ...more, how: '살필 범위(2km)에 걸친 행정동마다 범위와 겹친 넓이 비율만큼 인구·세대를 나눠 더해요.' }
    rerender(<HowLine {...props({ open: true, more: wider })} />)
    expect(screen.getByRole('button', { name: '접기' })).toBeTruthy()
    expect(listOf(container).hidden).toBe(false)
    expect(screen.getByText(wider.how)).toBeTruthy()
    expect(screen.queryByText(more.how)).toBeNull()
    rerender(<HowLine {...props({ open: false, more: wider })} />)
    expect(screen.getByRole('button', { name: '더 보기' })).toBeTruthy()
    expect(listOf(container).hidden).toBe(true)
  })

  it('AC-7920.2: 글을 만들지 않고 받은 글만 그린다 — 채우지 않은 `[[열쇠]]`·`{범위}`도 받은 글자 그대로', () => {
    const raw = { what: '주민등록 인구([[pop]])', how: '살필 범위({범위})를 세요', why: '{시군구} 평균' }
    render(<HowLine {...props({ line: raw, more: { ...raw, basis: '{경쟁}' }, open: true })} />)
    expect(lineOf().textContent).toContain('주민등록 인구([[pop]]) · 살필 범위({범위})를 세요 · {시군구} 평균')
    expect(screen.getByText('{경쟁}')).toBeTruthy()
  })

  it('AC-7920.2: 정해 둔 화면 글(머리·단추·네 줄 이름·칩)에 영어 낱말이 없다', () => {
    for (const chip of ['research', 'law', 'law-common', 'common'] as const) {
      for (const open of [false, true]) {
        const { container } = render(<HowLine {...props({ chip, open })} />)
        // 허용 목록(AC-7917.1): 거리 단위 km·m는 된다
        const text = (container.textContent ?? '').replace(/\d(?:[\d.,]*)\s?(?:km|m)\b/g, '')
        expect(text).not.toMatch(/[A-Za-z]/)
        cleanup()
      }
    }
  })

  it('AC-7920.2: 칩 종류·칩 글·머리·단추·네 줄 이름은 method.ts 한 곳(HowChip·CHIP_TEXT·HOW_TEXT) — HowLine 소스에 따로 적지 않고, 그린 글이 그 값 그대로다', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/location/common/HowLine.tsx'), 'utf8')
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1')
    expect(code).toMatch(/from '@\/lib\/location\/method'/)
    expect(code).not.toMatch(/export type HowChip\b|type HowChip\s*=/)
    for (const own of ['연구 근거', '법 근거', '흔히 보는 기준', '이렇게 봤어요', '더 보기', '접기', '무엇을 봤나', '어떻게 셌나', '왜 중요한가', "'근거'"]) {
      expect(code, own).not.toContain(own)
    }
    for (const chip of Object.keys(CHIP_TEXT) as HowChip[]) {
      render(<HowLine {...props({ chip, open: true })} />)
      expect(Array.from(lineOf().querySelectorAll('[data-chip]')).map((c) => c.textContent), chip).toEqual(CHIP_TEXT[chip])
      expect(screen.getByText(HOW_TEXT.label).tagName).toBe('B')
      expect(screen.getByRole('button').textContent).toBe(HOW_TEXT.less)
      expect(Array.from(document.querySelectorAll('dt')).map((dt) => dt.textContent)).toEqual(Object.values(HOW_TEXT.rows))
      cleanup()
    }
  })

  it('AC-7920.2: 소스는 props·콜백만 — 제 상태·저장·부르기·폰 전용 모양(max-md:)·ds.textButton·토큰 밖 색이 없다', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/location/common/HowLine.tsx'), 'utf8')
    expect(src).not.toMatch(/useState|useReducer|useEffect/)
    expect(src).not.toMatch(/supabase|fetch\(|localStorage|sessionStorage|console\./)
    expect(src).not.toContain('max-md:')
    expect(src).not.toMatch(/ds\.textButton/)
    expect(src).not.toMatch(/#[0-9A-Fa-f]{3,8}\b|rgb\(/)
  })
})
