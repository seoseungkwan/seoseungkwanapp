import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LogoMark } from '@/components/common/LogoMark'
import base from './base.module.css'
import HeroChart from './HeroChart'
import styles from './HeroChart.module.css'

const html = renderToStaticMarkup(<HeroChart />)
const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('AC-003.3: 서버 그림은 틱 0 값', () => {
  it('AC-003.3: 오늘 외래 128명, 신환율 18.2%', () => {
    expect(text).toMatch(/오늘 외래 128 명/)
    expect(text).toMatch(/신환율 18\.2%/)
  })

  it('AC-003.3: 도넛은 18%', () => {
    expect(html).toMatch(/stroke-dasharray="18 100"/)
    expect(text).toContain('18%')
  })

  it('AC-003.3: 막대 6개 높이 22%~74%와 같은 숫자 글자', () => {
    const heights = [...html.matchAll(/style="height:(\d+)%"/g)].map((m) => Number(m[1]))
    expect(heights).toEqual([22, 35, 41, 52, 60, 74])
    for (const n of heights) expect(text).toContain(`${n}%`)
  })

  it('AC-003.3: "숫자는 예시" 칩과 떠 있는 카드 3개가 있다', () => {
    expect(text).toContain('숫자는 예시')
    for (const title of ['오늘 외래', '신환율', 'AI 한 줄 요약']) expect(text).toContain(title)
    expect(text).toContain('도수치료 처방이 지난달보다 늘었어요.')
  })
})

describe('AC-008.1: svg는 꾸밈', () => {
  it('AC-008.1: 모든 svg가 aria-hidden="true"다', () => {
    const svgs = html.match(/<svg[^>]*>/g) ?? []
    expect(svgs.length).toBeGreaterThan(0)
    for (const svg of svgs) expect(svg).toContain('aria-hidden="true"')
  })
})

// ---------- specs/landing-v2 REQ-107: 앱 화면 미리보기 ----------

// 여는 태그의 class 목록
const classesOf = (openTag: string) => (/\bclass="([^"]*)"/.exec(openTag)?.[1] ?? '').split(/\s+/).filter(Boolean)
const textOf = (part: string) => part.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
const openTags = [...html.matchAll(/<[a-z][a-z0-9]*\b[^>]*>/g)].map((m) => m[0])
const withClass = (cls: string) => openTags.filter((tag) => classesOf(tag).includes(cls))
const cssOf = (name: string) =>
  readFileSync(join(process.cwd(), 'src/components/landing', name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const logo20 = renderToStaticMarkup(<LogoMark size={20} />)

// .app > .top(aria-hidden) · .tabs(aria-hidden) · .body( .title · .grid )
const APP = html.match(
  /^(<div\b[^>]*>)(<div\b[^>]*>)([\s\S]*?)<\/div>(<div\b[^>]*>)([\s\S]*?)<\/div>(<div\b[^>]*>)(<div\b[^>]*>)([\s\S]*?)<\/div>(<div\b[^>]*>)([\s\S]*)<\/div><\/div><\/div>$/,
)
const [, app, top, topIn, tabs, tabsIn, body, title, titleIn, grid, gridIn] = APP ?? []

describe('AC-107.3: 앱 화면 미리보기(서버 그림, 틱 0)', () => {
  it('AC-107.3: .app 하나 안에 위쪽 띠 · 탭 줄 · 본문(.title + .grid)이 이 순서로 있다', () => {
    expect(APP, '.app > .top · .tabs · .body(.title · .grid)').not.toBeNull()
    expect(classesOf(app)).toContain(styles.app)
    expect(classesOf(top)).toContain(styles.top)
    expect(classesOf(tabs)).toContain(styles.tabs)
    expect(classesOf(body)).toContain(styles.body)
    expect(classesOf(title)).toContain(styles.title)
    expect(classesOf(grid)).toContain(styles.grid)
  })

  it('AC-107.3: 위쪽 띠는 aria-hidden이고 LogoMark 20 + [서비스 이름] + 계정 아이콘(svg 하나)이다', () => {
    expect(top).toMatch(/aria-hidden="true"/)
    const parts = topIn.match(/^(<span\b[^>]*>)([\s\S]*?)<\/span>(<span\b[^>]*>)(<svg\b[\s\S]*?<\/svg>)<\/span>$/)
    expect(parts, '.top > span.logo + span.acct').not.toBeNull()
    expect(classesOf(parts![1])).toContain(styles.logo)
    expect(parts![2]).toBe(`${logo20}[서비스 이름]`)
    expect(classesOf(parts![3])).toContain(styles.acct)
    expect(parts![4].match(/<svg\b/g)).toHaveLength(1)
  })

  it('AC-107.3: 탭 줄은 aria-hidden이고 span 8개 "대시보드 … 월간 PDF", 첫째 "대시보드"만 지금 탭(.tabOn)이다', () => {
    expect(tabs).toMatch(/aria-hidden="true"/)
    const spans = [...tabsIn.matchAll(/(<span\b[^>]*>)([^<]*)<\/span>/g)]
    expect(spans.map((m) => m[2])).toEqual(['대시보드', '통계', 'AI 리포트', '매출', '재고', '급여', '일일마감·보고', '월간 PDF'])
    expect(spans.map((m) => m[0]).join('')).toBe(tabsIn)
    spans.forEach(([, open], i) => {
      expect(classesOf(open), `탭 ${i}`).toContain(styles.tab)
      expect(classesOf(open).includes(styles.tabOn), `탭 ${i} .tabOn`).toBe(i === 0)
    })
  })

  it('AC-107.3: 제목 "대시보드" + .chip·.chipSample "숫자는 예시"', () => {
    const parts = titleIn.match(/^(<span\b[^>]*>)([^<]*)<\/span>(<span\b[^>]*>)([^<]*)<\/span>$/)
    expect(parts, '.title > span + span').not.toBeNull()
    expect(classesOf(parts![1])).toContain(styles.heading)
    expect(parts![2]).toBe('대시보드')
    expect(classesOf(parts![3])).toEqual(expect.arrayContaining([base.chip, base.chipSample]))
    expect(parts![4]).toBe('숫자는 예시')
  })

  it('AC-107.3: .grid 안에 KPI 3장(오늘 외래 · 신환율 · AI 한 줄 요약) 다음 패널 "월별 추이"가 있다', () => {
    expect(withClass(styles.kpi)).toHaveLength(3)
    expect(withClass(styles.kpiAi)).toHaveLength(1)
    expect(classesOf(withClass(styles.kpiAi)[0])).toContain(styles.kpi)
    expect(withClass(styles.panel)).toHaveLength(1)
    const gridText = textOf(gridIn)
    const at = ['오늘 외래', '신환율', 'AI 한 줄 요약', '월별 추이'].map((label) => gridText.indexOf(label))
    expect(at.every((i) => i >= 0), at.join(',')).toBe(true)
    expect(at).toEqual([...at].sort((a, b) => a - b))
  })

  it('AC-107.3: 오늘 외래는 값 128 + "명", 아래 줄은 강조색 span "▲" + "지난주 같은 요일보다"', () => {
    expect(html).toContain(`<div class="${styles.kpiValue}">128<span class="${styles.unit}">명</span></div>`)
    expect(html).toContain(`<span class="${styles.up}">▲</span> 지난주 같은 요일보다`)
  })

  it('AC-107.3: 신환율은 한 덩어리 글자 18.2%이고, aria-hidden 막대의 채움이 style="width:18.2%"다', () => {
    expect(html).toContain(`<div class="${styles.kpiValue}">18.2%</div>`)
    const meter = html.match(/(<div\b[^>]*>)(<i\b[^>]*>)<\/i><\/div>/)
    expect(meter, 'div.meter > i').not.toBeNull()
    expect(classesOf(meter![1])).toContain(styles.meter)
    expect(meter![1]).toMatch(/aria-hidden="true"/)
    expect(classesOf(meter![2])).toContain(styles.meterFill)
    expect(meter![2]).toMatch(/style="width:18\.2%"/)
  })

  it('AC-107.3: AI 한 줄 요약은 글 + span "근거 숫자 보기 →"(링크 아님)', () => {
    expect(html).toContain(`<div class="${styles.aiText}">도수치료 처방이 지난달보다 늘었어요.</div>`)
    expect(html).toContain(`<span class="${styles.link}">근거 숫자 보기 →</span>`)
  })

  it('AC-107.3: 도넛은 pathLength 100 · stroke-dasharray "18 100"이고 가운데 글자가 18%다', () => {
    const svg = html.match(/<svg\b[^>]*viewBox="0 0 120 120"[^>]*>([\s\S]*?)<\/svg>/)
    expect(svg, '도넛 svg').not.toBeNull()
    const circles = svg![1].match(/<circle\b[^>]*>/g) ?? []
    expect(circles).toHaveLength(2)
    const [track = '', value = ''] = circles
    expect(classesOf(track)).toContain(styles.ringTrack)
    expect(classesOf(value)).toContain(styles.ringValue)
    expect(value).toMatch(/pathLength="100"/)
    expect(value).toMatch(/stroke-dasharray="18 100"/)
    expect(svg![1]).toMatch(/<text\b[^>]*>18%<\/text>/)
  })

  it('AC-107.3: 막대 6개는 style="height:N%" 안에 "N%" 글자를 품고, 마지막 막대만 .barLast다', () => {
    const bars = [...html.matchAll(/(<div\b[^>]*style="height:(\d+)%"[^>]*>)<span\b[^>]*>(\d+)%<\/span><\/div>/g)]
    expect(bars.map((m) => Number(m[2]))).toEqual([22, 35, 41, 52, 60, 74])
    bars.forEach(([, open, height, label], i) => {
      expect(label).toBe(height)
      expect(classesOf(open)).toContain(styles.bar)
      expect(classesOf(open).includes(styles.barLast), `막대 ${i} .barLast`).toBe(i === bars.length - 1)
    })
  })

  it('AC-107.3: 월 줄은 aria-hidden이고 "5월 6월 7월 8월 9월 10월"이다', () => {
    const months = html.match(/(<div\b[^>]*>)((?:<span>[^<]*<\/span>){6})<\/div>/)
    expect(months, 'div.months > span×6').not.toBeNull()
    expect(classesOf(months![1])).toContain(styles.months)
    expect(months![1]).toMatch(/aria-hidden="true"/)
    expect(textOf(months![2])).toBe('5월 6월 7월 8월 9월 10월')
  })

  it('AC-107.3: 미리보기 안에 a·header·main·footer·section·nav와 입력 원소·tabindex가 없다', () => {
    expect(html).not.toMatch(/<(a|header|main|footer|section|nav|button|input|select|textarea|form|label)\b/)
    expect(html).not.toMatch(/tabindex/i)
  })

  it('AC-107.3: inline style은 % 값의 높이·폭·눈금선 위치(bottom)뿐이다', () => {
    const styleValues = [...html.matchAll(/\bstyle="([^"]*)"/g)].map((m) => m[1])
    expect(styleValues.length).toBeGreaterThan(0)
    for (const value of styleValues) expect(value).toMatch(/^(height|width|bottom):\d+(\.\d+)?%$/)
  })
})

describe('AC-107.4: 미리보기 색은 CSS가 정한다', () => {
  it('AC-107.4: 로고 마크 밖의 마크업에 색 글자(#…)·반짝이가 없다', () => {
    const own = html.replace(logo20, '')
    expect(own).not.toMatch(/="#[0-9a-f]{3,8}"/i)
    expect(own).not.toContain('M8 1.5l1.6 4.2')
  })

  it('AC-107.4: 미리보기에 붙은 클래스가 모두 base.module.css·HeroChart.module.css에 정의돼 있다', () => {
    const files = new Map([
      [base.chip.slice(-6), ['base.module.css', cssOf('base.module.css')]],
      [styles.app.slice(-6), ['HeroChart.module.css', cssOf('HeroChart.module.css')]],
    ])
    const missing: string[] = []
    for (const cls of new Set(openTags.flatMap(classesOf))) {
      const m = /^_(\w+)_([0-9a-f]{6})$/.exec(cls)
      const file = m && files.get(m[2])
      if (!m || !file) continue
      if (!new RegExp(`\\.${m[1]}(?![\\w-])`).test(file[1])) missing.push(`${file[0]} .${m[1]}`)
    }
    expect(missing).toEqual([])
  })
})
