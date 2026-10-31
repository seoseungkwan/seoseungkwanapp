// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { RankedBars, type RankedItem } from './RankedBars'

// 순위 막대 (b2b-redesign REQ-205 AC-205.6, design.md '차트 부품'(HTML 막대·접근성), UI_GUIDE '차트'·'순위 막대').
// 서버에서 그대로 그리는 부품 → renderToStaticMarkup으로 그린 마크업을 jsdom에 넣어 짜임·클래스·글자·inline style을 본다(보이는 모양은 Phase 끝 사진).
// 예시 값은 시안 docs/mockups/b2b-redesign/parts.mjs의 REGIONS 7개(rest 2개, 합 714명, rest 아닌 최대 168명)를 이 시험 안에 적은 것이다

const REGIONS: RankedItem[] = [
  { name: '중앙동', value: 168 },
  { name: '신정동', value: 131 },
  { name: '남산동', value: 97 },
  { name: '서부동', value: 74 },
  { name: '동림동', value: 58 },
  { name: '그 밖 동네', value: 164, rest: true },
  { name: '주소 없음', value: 22, rest: true },
]
const byName = (name: string) => REGIONS.find((r) => r.name === name)!
// 받은 순서를 섞는다: rest가 앞·가운데에 있고, '주소 없음'(22)이 '그 밖 동네'(164)보다 먼저 온다
const SHUFFLED = ['주소 없음', '남산동', '동림동', '그 밖 동네', '중앙동', '서부동', '신정동'].map(byName)
const RANKED = ['중앙동', '신정동', '남산동', '서부동', '동림동', '그 밖 동네', '주소 없음']
const MAX = 168 // rest 아닌 최대 값
const TOTAL = 714 // 전체 합(rest 포함)

const pct = (v: number, max: number) => Number(((v / max) * 100).toFixed(2))

const mount = (element: ReactElement) => {
  const root = document.createElement('div')
  root.innerHTML = renderToStaticMarkup(element)
  return root
}
const ranked = (props: Partial<Parameters<typeof RankedBars>[0]> = {}) =>
  mount(<RankedBars title="동네별 환자 수" unit="명" items={REGIONS} {...props} />)

const classesOf = (el: Element | null | undefined) => (el?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)
const expectClasses = (el: Element | null | undefined, ...wanted: string[]) =>
  expect(classesOf(el)).toEqual(expect.arrayContaining(wanted))
const expectNoClasses = (el: Element | null | undefined, ...unwanted: string[]) =>
  expect(classesOf(el).filter((c) => unwanted.includes(c))).toEqual([])
const textOf = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
const all = (root: Element) => Array.from(root.querySelectorAll('*'))
// 자식 요소가 없는 요소(글자가 직접 든 곳)
const leaves = (root: Element) => all(root).filter((el) => el.children.length === 0)
// 줄의 보이는 글자 조각(빈 막대 빼고): ['중앙동', '168명', '23.5%']
const partsOf = (row: Element) => leaves(row).map(textOf).filter(Boolean)
const oneLeaf = (root: Element, text: string) => {
  const found = leaves(root).filter((el) => textOf(el) === text)
  expect(found, text).toHaveLength(1)
  return found[0]!
}

const listOf = (root: Element) => {
  const list = root.querySelector('ol')
  expect(list).toBeTruthy()
  return list!
}
const rowsOf = (root: Element) => Array.from(listOf(root).children)
// 줄 하나의 막대: inline style이 있는 요소 하나
const barOf = (row: Element) => {
  const styled = all(row).filter((el) => el.hasAttribute('style'))
  expect(styled, textOf(row)).toHaveLength(1)
  return styled[0]!
}
const widthOf = (row: Element) => barOf(row).getAttribute('style')

describe('AC-205.6: RankedBars — <ol aria-label="제목"> 안 <li> 순서(값 큰 순, 같으면 받은 순서, rest는 뒤에 받은 순서)', () => {
  it('AC-205.6: 바깥은 aria-label이 제목인 <ol> 하나이고, 자식은 항목마다 <li> 하나다', () => {
    const root = ranked()
    expect(root.querySelectorAll('ol')).toHaveLength(1)
    const list = listOf(root)
    expect(list.getAttribute('aria-label')).toBe('동네별 환자 수')
    const rows = rowsOf(root)
    expect(rows).toHaveLength(7)
    for (const row of rows) expect(row.tagName).toBe('LI')
  })

  it('AC-205.6: 시안 REGIONS 7개 — rest 아닌 항목이 값 큰 순, 그 뒤 rest 항목(그 밖 동네 → 주소 없음)', () => {
    const rows = rowsOf(ranked())
    expect(rows.map((row) => partsOf(row)[0])).toEqual(RANKED)
  })

  it('AC-205.6: 섞어서 받아도 같은 순서 — rest는 값이 커도(164) 뒤에 가고, rest끼리는 받은 순서(주소 없음 → 그 밖 동네)다', () => {
    const rows = rowsOf(ranked({ items: SHUFFLED }))
    expect(rows.map((row) => partsOf(row)[0])).toEqual([
      '중앙동',
      '신정동',
      '남산동',
      '서부동',
      '동림동',
      '주소 없음',
      '그 밖 동네',
    ])
  })

  it('AC-205.6: 값이 같으면 받은 순서다', () => {
    const items: RankedItem[] = [
      { name: '가동', value: 50 },
      { name: '나동', value: 80 },
      { name: '그 밖', value: 80, rest: true },
      { name: '다동', value: 50 },
      { name: '라동', value: 80 },
    ]
    const rows = rowsOf(ranked({ items }))
    expect(rows.map((row) => partsOf(row)[0])).toEqual(['나동', '라동', '가동', '다동', '그 밖'])
  })

  it('AC-205.6: 받은 배열을 바꾸지 않는다(정렬은 복사본에서)', () => {
    const items = [...SHUFFLED]
    ranked({ items })
    expect(items.map((i) => i.name)).toEqual(SHUFFLED.map((i) => i.name))
  })
})

describe('AC-205.6: RankedBars 줄 — 이름 · 막대(aria-hidden, 10px, accent/line-strong, 폭 %) · 값 · 몫', () => {
  it('AC-205.6: 이름은 small ink-2이고 rest는 muted다', () => {
    const root = ranked()
    for (const name of RANKED) {
      const leaf = oneLeaf(listOf(root), name)
      expectClasses(leaf, 'text-small')
      if (byName(name).rest) {
        expectClasses(leaf, 'text-muted')
        expectNoClasses(leaf, 'text-ink-2')
      } else {
        expectClasses(leaf, 'text-ink-2')
        expectNoClasses(leaf, 'text-muted')
      }
    }
  })

  it('AC-205.6: 막대는 aria-hidden 안에 있고 높이 10px(h-2.5)·rest 아닌 항목 accent·rest line-strong이다', () => {
    const rows = rowsOf(ranked())
    rows.forEach((row, i) => {
      const bar = barOf(row)
      expect(bar.closest('[aria-hidden="true"]'), RANKED[i]).toBeTruthy()
      expectClasses(bar, 'h-2.5')
      if (byName(RANKED[i]!).rest) {
        expectClasses(bar, 'bg-line-strong')
        expectNoClasses(bar, 'bg-accent')
      } else {
        expectClasses(bar, 'bg-accent')
        expectNoClasses(bar, 'bg-line-strong')
      }
    })
  })

  it('AC-205.6: 막대 폭 = 값/rest 아닌 최대 값(168) % — Number(v.toFixed(2))', () => {
    const rows = rowsOf(ranked())
    expect(rows.map(widthOf)).toEqual(RANKED.map((name) => `width:${pct(byName(name).value, MAX)}%`))
    // 손으로 적은 값: 168 → 100, 131 → 77.98, 22 → 13.1(끝 0 없음), rest 164 → 97.62
    expect(widthOf(rows[0]!)).toBe('width:100%')
    expect(widthOf(rows[1]!)).toBe('width:77.98%')
    expect(widthOf(rows[5]!)).toBe('width:97.62%')
    expect(widthOf(rows[6]!)).toBe('width:13.1%')
  })

  it('AC-205.6: rest 값이 rest 아닌 최대 값보다 크면 막대는 100%에서 자른다', () => {
    const items: RankedItem[] = [
      { name: '가동', value: 40 },
      { name: '그 밖', value: 100, rest: true },
    ]
    expect(rowsOf(ranked({ items })).map(widthOf)).toEqual(['width:100%', 'width:100%'])
  })

  it('AC-205.6: 값 "168명"은 small 600 ink 고정폭 숫자다(단위는 unit)', () => {
    const root = ranked()
    for (const name of RANKED) {
      const leaf = oneLeaf(listOf(root), `${byName(name).value}명`)
      expectClasses(leaf, 'text-small', 'font-semibold', 'text-ink', 'tabular-nums')
    }
    const other = ranked({ unit: '건', items: [{ name: '가동', value: 12000 }] })
    oneLeaf(listOf(other), '12,000건')
  })

  it('AC-205.6: showShare면 몫 "23.5%"(전체 합 714 대비, 소수 첫째 자리까지 버림)이 small muted 고정폭으로 붙는다', () => {
    const root = ranked({ showShare: true })
    const rows = rowsOf(root)
    // 168/714 = 23.52… · 97/714 = 13.58…(반올림이면 13.6) · 164/714 = 22.96…(반올림이면 23.0) · 22/714 = 3.08…
    const shares = ['23.5%', '18.3%', '13.5%', '10.3%', '8.1%', '22.9%', '3.0%']
    rows.forEach((row, i) => {
      const leaf = oneLeaf(row, shares[i]!)
      expectClasses(leaf, 'text-small', 'text-muted', 'tabular-nums')
      expectNoClasses(leaf, 'font-semibold')
    })
    expect(partsOf(rows[0]!)).toEqual(['중앙동', '168명', '23.5%'])
    expect(TOTAL).toBe(REGIONS.reduce((sum, r) => sum + r.value, 0))
  })

  it('AC-205.6: showShare가 없으면 몫 글자가 없다', () => {
    const root = ranked()
    expect(textOf(root)).not.toMatch(/%/)
    expect(partsOf(rowsOf(root)[0]!)).toEqual(['중앙동', '168명'])
  })

  it('AC-205.6: 최대 값이 0이면 막대 폭은 모두 0%다(rest에 값이 있어도)', () => {
    const items: RankedItem[] = [
      { name: '가동', value: 0 },
      { name: '나동', value: 0 },
      { name: '그 밖', value: 5, rest: true },
    ]
    const root = ranked({ items, showShare: true })
    expect(rowsOf(root).map(widthOf)).toEqual(['width:0%', 'width:0%', 'width:0%'])
    expect(rowsOf(root).map(partsOf)).toEqual([
      ['가동', '0명', '0.0%'],
      ['나동', '0명', '0.0%'],
      ['그 밖', '5명', '100.0%'],
    ])
  })

  it('AC-205.6: 모두 0이면 막대 0%이고 몫은 "0.0%"다(NaN 없음)', () => {
    const items: RankedItem[] = [
      { name: '가동', value: 0 },
      { name: '그 밖', value: 0, rest: true },
    ]
    const root = ranked({ items, showShare: true })
    expect(rowsOf(root).map(widthOf)).toEqual(['width:0%', 'width:0%'])
    expect(textOf(root)).not.toMatch(/NaN|Infinity/)
    expect(rowsOf(root).map(partsOf)).toEqual([
      ['가동', '0명', '0.0%'],
      ['그 밖', '0명', '0.0%'],
    ])
  })

  it('AC-205.6: inline style은 막대 width % 하나뿐이다(줄마다 하나, 0~100)', () => {
    const root = ranked({ items: SHUFFLED, showShare: true })
    const styled = all(root).filter((el) => el.hasAttribute('style'))
    expect(styled).toHaveLength(7)
    for (const el of styled) {
      const match = el.getAttribute('style')!.match(/^width:(\d+(?:\.\d{1,2})?)%$/)
      expect(match, el.getAttribute('style')!).toBeTruthy()
      const value = Number(match![1])
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(100)
    }
  })

  it('AC-205.6: 막대는 HTML이다(svg 없음)', () => {
    expect(ranked({ showShare: true }).querySelectorAll('svg')).toHaveLength(0)
  })
})
