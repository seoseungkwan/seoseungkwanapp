import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import HeroChart from './HeroChart'

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
