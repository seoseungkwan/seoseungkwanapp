// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import type { Delta } from '@/types/analysis'
import { isBorderBox, nestedBoxes } from '@/testing/boxes'
import { KpiStat, type KpiStatProps } from './KpiStat'
import { Sparkline } from './Sparkline'

// 작은 선 그래프 Sparkline과 숫자 칸 KpiStat (b2b-redesign REQ-205 AC-205.2·AC-205.3, design.md '차트 부품', UI_GUIDE '차트').
// 서버에서 그대로 그리는 부품 → renderToStaticMarkup으로 그린 마크업을 jsdom에 넣어 짜임·클래스·글자를 본다(보이는 모양은 Phase 끝 사진)
// 예시 값은 시안 parts.mjs의 KPI(환자 수 714명, 그 전 주 697명)를 이 시험 안에 적은 것이다

const MINUS = '−'
const mount = (element: ReactElement) => {
  const root = document.createElement('div')
  root.innerHTML = renderToStaticMarkup(element)
  return root
}
const classesOf = (el: Element | null | undefined) => (el?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)
const expectClasses = (el: Element | null | undefined, ...wanted: string[]) =>
  expect(classesOf(el)).toEqual(expect.arrayContaining(wanted))
const textOf = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
// 화면에 보이는 글자(sr-only 빼고)
const visibleText = (el: Element) => {
  const copy = el.cloneNode(true) as Element
  for (const sr of Array.from(copy.querySelectorAll('.sr-only'))) sr.remove()
  return textOf(copy)
}

// ── Sparkline (AC-205.2)

const spark = (values: number[], size?: 'md' | 'sm') => mount(<Sparkline values={values} size={size} />)
const svgOf = (root: Element) => {
  const svgs = root.querySelectorAll('svg')
  expect(svgs).toHaveLength(1)
  return svgs[0]!
}

describe('AC-205.2: Sparkline — aria-hidden svg 하나, 면 → 선 → 끝점', () => {
  it('AC-205.2: [1, 3, 2]는 aria-hidden="true"인 88×28 svg 하나다', () => {
    const root = spark([1, 3, 2])
    expect(root.children).toHaveLength(1)
    const svg = svgOf(root)
    expect(root.firstElementChild).toBe(svg)
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.getAttribute('width')).toBe('88')
    expect(svg.getAttribute('height')).toBe('28')
    expect(svg.getAttribute('viewBox')).toBe('0 0 88 28')
  })

  it('AC-205.2: size="sm"은 56×22다', () => {
    const svg = svgOf(spark([1, 3, 2], 'sm'))
    expect(svg.getAttribute('width')).toBe('56')
    expect(svg.getAttribute('height')).toBe('22')
    expect(svg.getAttribute('viewBox')).toBe('0 0 56 22')
  })

  it('AC-205.2: 안은 면 path(fill-accent-soft) → 선 polyline(stroke-accent·1.5·채움 없음) → 끝점 circle(r 2.75·fill-accent·stroke-surface 1.5) 순서다', () => {
    const svg = svgOf(spark([1, 3, 2]))
    expect(Array.from(svg.children).map((el) => el.tagName.toLowerCase())).toEqual(['path', 'polyline', 'circle'])
    const [area, line, dot] = Array.from(svg.children)
    expectClasses(area, 'fill-accent-soft')
    expectClasses(line, 'stroke-accent')
    expect(line!.getAttribute('stroke-width')).toBe('1.5')
    expect(line!.getAttribute('fill')).toBe('none')
    expectClasses(dot, 'fill-accent', 'stroke-surface')
    expect(dot!.getAttribute('r')).toBe('2.75')
    expect(dot!.getAttribute('stroke-width')).toBe('1.5')
  })

  it('AC-205.2: [1, 3, 2]의 점은 "3,25 44,3 85,14"이고 끝점이 마지막 점, 면은 바닥에서 바닥으로 닫힌다', () => {
    const svg = svgOf(spark([1, 3, 2]))
    expect(svg.querySelector('polyline')!.getAttribute('points')).toBe('3,25 44,3 85,14')
    expect(svg.querySelector('path')!.getAttribute('d')).toBe('M3,28 L3,25 L44,3 L85,14 L85,28 Z')
    const dot = svg.querySelector('circle')!
    expect([dot.getAttribute('cx'), dot.getAttribute('cy')]).toEqual(['85', '14'])
  })

  it('AC-205.2: size="sm"의 [1, 3, 2]는 "3,19 28,3 53,11"이다', () => {
    expect(svgOf(spark([1, 3, 2], 'sm')).querySelector('polyline')!.getAttribute('points')).toBe('3,19 28,3 53,11')
  })

  it('AC-205.2: 좌표는 Number(v.toFixed(1))로 적는다', () => {
    // x 간격 82/7 = 11.71…, y(1) = 25 − (1/3)·22 = 17.66…
    const points = svgOf(spark([0, 1, 3, 3, 3, 3, 3, 3])).querySelector('polyline')!.getAttribute('points')
    expect(points).toBe('3,25 14.7,17.7 26.4,3 38.1,3 49.9,3 61.6,3 73.3,3 85,3')
  })

  it('AC-205.2: 값이 모두 같으면 가운데 가로줄이다', () => {
    expect(svgOf(spark([5, 5, 5])).querySelector('polyline')!.getAttribute('points')).toBe('3,14 44,14 85,14')
    expect(svgOf(spark([5, 5], 'sm')).querySelector('polyline')!.getAttribute('points')).toBe('3,11 53,11')
  })

  it('AC-205.2: 값이 2개 미만이면 아무것도 그리지 않는다', () => {
    expect(renderToStaticMarkup(<Sparkline values={[]} />)).toBe('')
    expect(renderToStaticMarkup(<Sparkline values={[7]} />)).toBe('')
  })

  it('AC-205.2: 그림 색은 클래스로만 준다 — fill·stroke 속성 값은 none·currentColor뿐이다', () => {
    for (const el of Array.from(svgOf(spark([1, 3, 2])).querySelectorAll('*'))) {
      for (const name of ['fill', 'stroke']) {
        const value = el.getAttribute(name)
        if (value !== null) expect(['none', 'currentColor'], `${el.tagName} ${name}`).toContain(value)
      }
    }
  })
})

// ── KpiStat (AC-205.3)

const UP: Delta = { kind: 'change', diff: 17, pct: (17 / 697) * 100 }
const BASE: KpiStatProps = {
  label: '환자 수',
  value: 714,
  format: 'count',
  unit: '명',
  delta: UP,
  deltaUnit: '명',
  compareLabel: '그 전 주 대비',
  spark: [636, 656, 523, 677, 630, 697, 714],
}
const kpi = (props: Partial<KpiStatProps> = {}) => {
  const root = mount(<KpiStat {...BASE} {...props} />)
  expect(root.children).toHaveLength(1)
  return root.firstElementChild!
}
// 짜임: [이름 줄, 값 줄, 증감 줄]
const parts = (stat: Element) => {
  const [top, value, delta] = Array.from(stat.children)
  return { top: top!, value: value!, delta }
}

describe('AC-205.3: KpiStat 짜임 — 이름 + Sparkline → 값 + 단위 → 증감 줄', () => {
  it('AC-205.3: 세 줄이 이 순서다', () => {
    const stat = kpi()
    expect(stat.children).toHaveLength(3)
    const { top, value, delta } = parts(stat)
    expect(textOf(top)).toBe('환자 수')
    expect(visibleText(value)).toBe('714명')
    expect(visibleText(delta!)).toBe('17명 (+2.4%) 그 전 주 대비')
  })

  it('AC-205.3: 이름은 small muted, 그 오른쪽에 Sparkline(88×28)이 있다', () => {
    const { top } = parts(kpi())
    const [name, wrap] = Array.from(top.children)
    expect(textOf(name)).toBe('환자 수')
    expectClasses(name, 'text-small', 'text-muted')
    expectClasses(top, 'flex', 'justify-between')
    const svg = wrap!.querySelector('svg')!
    expect(svg.getAttribute('width')).toBe('88')
    expect(svg.querySelectorAll('polyline')).toHaveLength(1)
    expect(svg.querySelector('polyline')!.getAttribute('points')!.split(' ')).toHaveLength(7)
  })

  it('AC-205.3: 값은 metric 600 고정폭 ink, 단위는 body 500 muted', () => {
    const { value } = parts(kpi())
    expectClasses(value, 'text-metric', 'font-semibold', 'tabular-nums', 'text-ink')
    const unit = value.querySelector('span')!
    expect(textOf(unit)).toBe('명')
    expectClasses(unit, 'text-body', 'font-medium', 'text-muted')
  })

  it('AC-205.3: format "count"는 formatCount, "percent"는 formatRate다', () => {
    expect(visibleText(parts(kpi({ value: 12000000 })).value)).toBe('12,000,000명')
    expect(visibleText(parts(kpi({ value: 131 / 714, format: 'percent', unit: '%' })).value)).toBe('18.3%')
  })

  it('AC-205.3: size="sm"은 값이 heading-m 600이고 Sparkline이 56×22, 비교 이름이 없다', () => {
    const stat = kpi({ size: 'sm' })
    const { top, value, delta } = parts(stat)
    expectClasses(value, 'text-heading-m', 'font-semibold', 'tabular-nums')
    expect(classesOf(value)).not.toContain('text-metric')
    const svg = top.querySelector('svg')!
    expect([svg.getAttribute('width'), svg.getAttribute('height')]).toEqual(['56', '22'])
    expect(visibleText(delta!)).toBe('17명 (+2.4%)')
    expect(stat.textContent).not.toContain('그 전 주 대비')
  })
})

describe('AC-205.3: KpiStat 증감 줄 — 화살표(늘어남·줄어듦만) + 화면 읽기 글자 + 증감 글자 + 비교 이름', () => {
  const arrowOf = (delta: Element) => {
    const svgs = delta.querySelectorAll('svg')
    expect(svgs).toHaveLength(1)
    return svgs[0]!
  }

  it('AC-205.3: up은 positive 색, 위 화살표 svg(aria-hidden), 화면 읽기 "늘어남"', () => {
    const { delta } = parts(kpi())
    expectClasses(delta, 'text-positive')
    const arrow = arrowOf(delta!)
    expect(arrow.getAttribute('aria-hidden')).toBe('true')
    const sr = delta!.querySelectorAll('.sr-only')
    expect(sr).toHaveLength(1)
    expect(textOf(sr[0])).toBe('늘어남')
    expect(textOf(delta)).toBe('늘어남 17명 (+2.4%) 그 전 주 대비')
  })

  it('AC-205.3: 증감 글자는 고정폭, 비교 이름은 muted', () => {
    const { delta } = parts(kpi())
    const spans = Array.from(delta!.querySelectorAll('span'))
    const text = spans.find((s) => textOf(s) === '17명 (+2.4%)')
    expectClasses(text, 'tabular-nums')
    const compare = spans.find((s) => textOf(s) === '그 전 주 대비')
    expectClasses(compare, 'text-muted')
  })

  it('AC-205.3: down은 negative 색, 아래 화살표, 화면 읽기 "줄어듦"', () => {
    const { delta } = parts(kpi({ delta: { kind: 'change', diff: -12, pct: -2.19 } }))
    expectClasses(delta, 'text-negative')
    expect(classesOf(delta)).not.toContain('text-positive')
    expect(textOf(delta!.querySelector('.sr-only'))).toBe('줄어듦')
    expect(visibleText(delta!)).toBe(`12명 (${MINUS}2.1%) 그 전 주 대비`)
    const down = arrowOf(delta!)
    const up = arrowOf(parts(kpi()).delta!)
    expect(down.getAttribute('aria-hidden')).toBe('true')
    expect(down.innerHTML).not.toBe(up.innerHTML)
  })

  it.each<[string, Delta, string]>([
    ['flat', { kind: 'change', diff: 0, pct: 0 }, '변화 없음'],
    ['new', { kind: 'new' }, '새로 생김'],
    ['in-progress', { kind: 'in-progress' }, '집계 중'],
    ['unavailable', { kind: 'unavailable' }, '비교할 수 없음'],
  ])('AC-205.3: %s는 화살표 없이 muted "%s"', (_name, deltaValue, text) => {
    const { delta } = parts(kpi({ delta: deltaValue }))
    expect(delta!.querySelector('svg')).toBeNull()
    expect(delta!.querySelector('.sr-only')).toBeNull()
    expectClasses(delta, 'text-muted')
    expect(classesOf(delta).filter((c) => /^text-(?:positive|negative)$/.test(c))).toEqual([])
    expect(visibleText(delta!)).toBe(`${text} 그 전 주 대비`)
  })

  it('AC-205.3: 신환율(%p) — 값 18.3%, 증감 "0.2%p"', () => {
    const stat = kpi({
      label: '신환율',
      value: 131 / 714,
      format: 'percent',
      unit: '%',
      delta: { kind: 'change', diff: 131 / 714 - 126 / 697, pct: null },
      deltaUnit: '%p',
    })
    const { value, delta } = parts(stat)
    expect(visibleText(value)).toBe('18.3%')
    expect(visibleText(delta!)).toBe('0.2%p 그 전 주 대비')
  })

  it('AC-205.3: 비교 이름이 없으면 증감 글자만 있다', () => {
    const { delta } = parts(kpi({ compareLabel: undefined }))
    expect(visibleText(delta!)).toBe('17명 (+2.4%)')
  })

  it('AC-205.3: 증감이 없으면(null·생략) 증감 줄이 없다', () => {
    expect(kpi({ delta: null }).children).toHaveLength(2)
    expect(kpi({ delta: undefined }).children).toHaveLength(2)
  })
})

describe('AC-205.3: KpiStat 값 없음·Sparkline 없음·휴대폰', () => {
  it('AC-205.3·AC-407.2: 값이 null이면 "–"(muted)와 "자료 없음"(small muted)만 있고 Sparkline·증감 줄이 없다', () => {
    const stat = kpi({ value: null })
    expect(stat.querySelector('svg')).toBeNull()
    expect(stat.querySelector('.sr-only')).toBeNull()
    expect(stat.children).toHaveLength(3)
    const [top, dash, none] = Array.from(stat.children)
    expect(textOf(top)).toBe('환자 수')
    expect(textOf(dash)).toBe('–')
    expectClasses(dash, 'text-metric', 'text-muted')
    expect(classesOf(dash)).not.toContain('text-faint')
    expect(textOf(none)).toBe('자료 없음')
    expectClasses(none, 'text-small', 'text-muted')
    expect(Array.from(stat.children).map(textOf)).toEqual(['환자 수', '–', '자료 없음'])
    expect(stat.textContent).not.toMatch(/[0-9]/)
  })

  it('AC-205.3·AC-407.2: size="sm"의 값 없음은 heading-m "–"(muted)', () => {
    const [, dash] = Array.from(kpi({ value: null, size: 'sm' }).children)
    expectClasses(dash, 'text-heading-m', 'text-muted')
    expect(classesOf(dash)).not.toContain('text-faint')
  })

  it('AC-205.3: spark가 없거나(null·생략) 2개 미만이면 이름만 있다', () => {
    for (const sparkValues of [null, undefined, [714]]) {
      const { top } = parts(kpi({ spark: sparkValues }))
      expect(top.querySelector('svg')).toBeNull()
      expect(top.children).toHaveLength(1)
    }
  })

  it('AC-205.3: sparkOnPhone={false}면 Sparkline 감싸개가 768px 미만에서 숨는다(기본은 보인다)', () => {
    const hidden = parts(kpi({ size: 'sm', sparkOnPhone: false })).top.children[1]
    expect(hidden!.querySelector('svg')).not.toBeNull()
    expectClasses(hidden, 'max-md:hidden')
    for (const props of [{}, { sparkOnPhone: true }]) {
      const shown = parts(kpi(props)).top.children[1]
      expect(shown!.querySelector('svg')).not.toBeNull()
      expect(classesOf(shown)).not.toContain('max-md:hidden')
    }
  })
})

describe('AC-205.3·AC-204.7: KpiStat은 상자가 아니다 — 패널 안에 놓아도 상자 안 상자가 없다', () => {
  it.each<[string, Partial<KpiStatProps>]>([
    ['기본', {}],
    ['작은', { size: 'sm', sparkOnPhone: false }],
    ['값 없음', { value: null }],
  ])('AC-205.3: %s KpiStat', (_name, props) => {
    const panel = document.createElement('div')
    panel.className = 'rounded-control border border-line'
    panel.innerHTML = renderToStaticMarkup(<KpiStat {...BASE} {...props} />)
    expect(nestedBoxes(panel)).toEqual([])
    expect(Array.from(panel.querySelectorAll('*')).filter(isBorderBox)).toEqual([])
  })

  it('AC-205.3: 모든 svg는 aria-hidden="true"이고 role="img"가 없다', () => {
    const stat = kpi()
    const svgs = Array.from(stat.querySelectorAll('svg'))
    expect(svgs).toHaveLength(2) // Sparkline + 화살표
    for (const svg of svgs) expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(stat.querySelector('[role="img"]')).toBeNull()
  })
})

// ── KpiStat 빈 값 아래 글 emptyText (tab-frame REQ-314 AC-314.1, design.md '차트 부품').
// 예시 글 "연결하면 보여요"는 requirements.md AC-314.1의 것이다. 옵션을 주지 않으면 마크업이 REQ-314 전과 한 글자도 같다

const EMPTY_TEXT = '연결하면 보여요'
const markup = (props: Partial<KpiStatProps> = {}) => renderToStaticMarkup(<KpiStat {...BASE} {...props} />)
const sha256 = async (text: string) => (await import('node:crypto')).createHash('sha256').update(text).digest('hex')
// REQ-314 전 마크업의 sha256(BASE · 값 null · 값 null 작은 크기)
const BEFORE_REQ_314 = {
  base: '0e10e1b00d1bd17fda85c8b36ebc8b0679713d7beb28de8040e9ba0bf4e5b935',
  empty: '3aa8e05ea1326241091b6f1dec040c5cee68c269871d6afe4817de80a2239399',
  emptySmall: 'ee8b5536ad86cc995642bf5ceafc96c8923834eb220d5de08a85edbbffe54faa',
}

describe('AC-314.1: KpiStat emptyText — 값이 null일 때 "–" 아래 글', () => {
  it('AC-314.1·AC-407.2: emptyText를 주면 "–"(muted) 아래 글이 그 글(small muted)이고 "자료 없음"이 없다', () => {
    const stat = kpi({ value: null, emptyText: EMPTY_TEXT })
    expect(Array.from(stat.children).map(textOf)).toEqual(['환자 수', '–', EMPTY_TEXT])
    const [, dash, note] = Array.from(stat.children)
    expectClasses(dash, 'text-metric', 'text-muted')
    expectClasses(note, 'text-small', 'text-muted')
    expect(stat.textContent).not.toContain('자료 없음')
    expect(stat.querySelector('svg')).toBeNull()
  })

  it('AC-314.1: emptyText는 글자만 바꾼다 — 마크업이 기본 빈 값에서 "자료 없음"만 그 글로 바뀐 것이다(기본·작은 크기)', () => {
    for (const size of ['md', 'sm'] as const) {
      expect(markup({ value: null, size, emptyText: EMPTY_TEXT }), size).toBe(
        markup({ value: null, size }).replace('자료 없음', EMPTY_TEXT),
      )
    }
  })

  it('AC-314.1: emptyText를 주지 않으면 지금처럼 "자료 없음"이다', () => {
    expect(textOf(kpi({ value: null }).lastElementChild)).toBe('자료 없음')
    expect(markup({ value: null, emptyText: undefined })).toBe(markup({ value: null }))
  })

  it('AC-314.1: 값이 있으면(0 포함) emptyText가 보이지 않고 마크업이 주지 않은 것과 같다', () => {
    for (const props of [{}, { value: 0 }, { size: 'sm' as const }, { delta: null }]) {
      expect(kpi({ ...props, emptyText: EMPTY_TEXT }).textContent).not.toContain(EMPTY_TEXT)
      expect(markup({ ...props, emptyText: EMPTY_TEXT })).toBe(markup(props))
    }
  })

  // ui-90 AC-407.2가 빈 값 "–"의 글자색 하나(faint → muted)를 바꿨다 → 그 한 클래스만 되돌리면 REQ-314 전 마크업과 한 글자도 같다
  const DASH_NOW = 'text-muted">–<'
  const DASH_BEFORE = 'text-faint">–<'
  it('AC-314.1·AC-407.2: emptyText를 주지 않은 마크업은 REQ-314 전과 한 글자도 같다(sha256, 빈 값은 "–" 글자색 faint → muted 하나만 다르다)', async () => {
    expect(await sha256(markup())).toBe(BEFORE_REQ_314.base)
    for (const [props, before] of [
      [{ value: null }, BEFORE_REQ_314.empty],
      [{ value: null, size: 'sm' as const }, BEFORE_REQ_314.emptySmall],
    ] as const) {
      const now = markup(props)
      expect(now.split(DASH_NOW)).toHaveLength(2)
      expect(now).not.toContain('text-faint')
      expect(await sha256(now.replace(DASH_NOW, DASH_BEFORE))).toBe(before)
    }
  })
})
