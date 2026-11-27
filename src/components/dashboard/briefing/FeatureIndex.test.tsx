// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DASHBOARD_FEATURES, type DashboardFeature, type FeatureStatus } from './features'
import { FeatureIndex } from './FeatureIndex'

// 기능 목차 · 의사랑 의원 (uisarang-upload REQ-8818 AC-8818.3·AC-8818.4, design.md §10-7).
// 의사랑이면(uis) 머리 옆 글과 비트 연결로 정해지는 칸(connect-first)의 상태 글자만 그리지 않는다. ready·soon 칸 글·칸 이름·설명·링크·차례는 그대로다.
// 지금 목차 자료에는 준비 중(soon) 칸이 없어, 지금 자료 뒤에 시험 안 가짜 준비 중 칸 하나를 붙여 세 상태를 모두 그린다(features.ts는 고치지 않는다)
vi.mock('./features', async (importOriginal) => {
  const real = await importOriginal<typeof import('./features')>()
  const soon: DashboardFeature = { name: '가짜 준비 중 칸', desc: '시험 안에서만 쓰는 준비 중 칸', href: '/fake-soon', status: 'soon' }
  return { ...real, DASHBOARD_FEATURES: [...real.DASHBOARD_FEATURES, soon] }
})

const textOf = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
const countOf = (status: FeatureStatus) => DASHBOARD_FEATURES.filter((f) => f.status === status).length
const SIDE = `${DASHBOARD_FEATURES.length}개 가운데 ${countOf('ready')}개는 지금, ${countOf('connect-first')}개는 연결하면 쓸 수 있어요`
const section = () => screen.getByRole('heading', { level: 2, name: '기능 목차' }).closest('section') as HTMLElement
const head = () => screen.getByRole('heading', { level: 2, name: '기능 목차' }).parentElement as HTMLElement
const links = () => Array.from(within(screen.getByRole('list', { name: '기능' })).getAllByRole('link'))
// 칸 하나: 첫 줄(이름 + 상태) · 둘째 줄(설명)
const lineOf = (link: Element) => link.children[0] as HTMLElement
const nameOf = (link: Element) => textOf(lineOf(link).children[0])
const statusOf = (link: Element) => lineOf(link).children[1] as HTMLElement | undefined

afterEach(cleanup)

describe('FeatureIndex: 의사랑 의원 (AC-8818.3)', () => {
  it('AC-8818.3: 시험 자료에는 세 상태가 모두 있다(준비 중 칸은 시험 안 가짜)', () => {
    for (const status of ['ready', 'connect-first', 'soon'] as const) expect(countOf(status), status).toBeGreaterThan(0)
  })

  it.each([true, false])('AC-8818.3: uis · connected %s — 제목 "기능 목차" 옆 글이 없고 머리에는 h2 하나뿐이다', (connected) => {
    render(<FeatureIndex connected={connected} uis />)
    expect(Array.from(head().children).map((el) => el.tagName.toLowerCase())).toEqual(['h2'])
    expect(textOf(section())).not.toContain('개 가운데')
    expect(textOf(section())).not.toContain('연결하면 쓸 수 있어요')
  })

  it.each([true, false])('AC-8818.3: uis · connected %s — connect-first 칸은 상태 글자(연결 먼저·사용 가능)를 그리지 않고 첫 줄은 이름 하나뿐이다', (connected) => {
    render(<FeatureIndex connected={connected} uis />)
    const firsts = links().filter((_, i) => DASHBOARD_FEATURES[i]!.status === 'connect-first')
    expect(firsts).toHaveLength(countOf('connect-first'))
    for (const link of firsts) {
      expect(lineOf(link).children, nameOf(link)).toHaveLength(1)
      expect(statusOf(link), nameOf(link)).toBeUndefined()
      expect(textOf(link), nameOf(link)).not.toMatch(/연결 먼저|사용 가능/)
      expect(link.querySelector('svg'), nameOf(link)).toBeNull()
    }
    expect(within(section()).queryAllByText('연결 먼저')).toHaveLength(0)
  })

  it.each([true, false])('AC-8818.3: uis · connected %s — ready 칸은 "사용 가능", soon 칸은 "준비 중"이 그대로다(글·모양이 uis 없음과 같다)', (connected) => {
    const plain = renderToStaticMarkup(<FeatureIndex connected={connected} />)
    const holder = document.createElement('div')
    holder.innerHTML = plain
    const plainLinks = Array.from(holder.querySelectorAll('ul a'))
    render(<FeatureIndex connected={connected} uis />)
    links().forEach((link, i) => {
      const feature = DASHBOARD_FEATURES[i]!
      if (feature.status === 'connect-first') return
      expect(statusOf(link)!.outerHTML, feature.name).toBe((plainLinks[i]!.children[0]!.children[1] as Element).outerHTML)
      expect(textOf(statusOf(link)), feature.name).toBe(feature.status === 'ready' ? '사용 가능' : '준비 중')
    })
    expect(within(section()).getAllByText('사용 가능')).toHaveLength(countOf('ready'))
    expect(within(section()).getAllByText('준비 중')).toHaveLength(countOf('soon'))
  })

  it.each([true, false])('AC-8818.3: uis · connected %s — 칸 이름·설명·링크·차례는 그대로다', (connected) => {
    render(<FeatureIndex connected={connected} uis />)
    const all = links()
    expect(all).toHaveLength(DASHBOARD_FEATURES.length)
    expect(all.map(nameOf)).toEqual(DASHBOARD_FEATURES.map((f) => f.name))
    expect(all.map((a) => a.getAttribute('href'))).toEqual(DASHBOARD_FEATURES.map((f) => f.href))
    expect(all.map((a) => textOf(a.children[1]))).toEqual(DASHBOARD_FEATURES.map((f) => f.desc))
    // 칸 모양(링크·이름·설명의 클래스)도 그대로다
    const holder = document.createElement('div')
    holder.innerHTML = renderToStaticMarkup(<FeatureIndex connected={connected} />)
    const plainLinks = Array.from(holder.querySelectorAll('ul a'))
    all.forEach((a, i) => {
      expect(a.getAttribute('class')).toBe(plainLinks[i]!.getAttribute('class'))
      expect(lineOf(a).children[0]!.outerHTML).toBe(plainLinks[i]!.children[0]!.children[0]!.outerHTML)
      expect(a.children[1]!.outerHTML).toBe(plainLinks[i]!.children[1]!.outerHTML)
    })
  })
})

describe('FeatureIndex: uis 없음은 지금 그대로 (AC-8818.4)', () => {
  it.each([true, false])('AC-8818.4: connected %s — uis를 주지 않은 그림과 uis 거짓인 그림이 같다', (connected) => {
    expect(renderToStaticMarkup(<FeatureIndex connected={connected} uis={false} />)).toBe(renderToStaticMarkup(<FeatureIndex connected={connected} />))
  })

  it('AC-8818.4: 연결 전 — 머리 옆 글이 있고 connect-first 칸은 "연결 먼저", ready "사용 가능", soon "준비 중"이다', () => {
    render(<FeatureIndex connected={false} />)
    expect(textOf(head().querySelector('p'))).toBe(SIDE)
    links().forEach((link, i) => {
      const feature = DASHBOARD_FEATURES[i]!
      const want = feature.status === 'connect-first' ? '연결 먼저' : feature.status === 'ready' ? '사용 가능' : '준비 중'
      expect(textOf(statusOf(link)), feature.name).toBe(want)
    })
  })

  it('AC-8818.4: 연결 뒤 — 머리 옆 글이 있고 connect-first 칸도 "사용 가능"이다', () => {
    render(<FeatureIndex connected />)
    expect(textOf(head().querySelector('p'))).toBe(SIDE)
    links().forEach((link, i) => {
      const feature = DASHBOARD_FEATURES[i]!
      expect(textOf(statusOf(link)), feature.name).toBe(feature.status === 'soon' ? '준비 중' : '사용 가능')
    })
  })
})
