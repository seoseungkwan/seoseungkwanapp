import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LogoMark } from '@/components/common/LogoMark'
import base from './base.module.css'
import Hero from './Hero'
import { START_HREF } from './links'
import PromiseBand from './PromiseBand'
import SiteHeader from './SiteHeader'

const header = renderToStaticMarkup(<SiteHeader />)
const hero = renderToStaticMarkup(<Hero />)
const band = renderToStaticMarkup(<PromiseBand />)

// 태그를 빈칸으로 바꾸고 빈칸을 하나로 모은 글자
const textOf = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
// <a> 링크 목록: href와 글자
const linksOf = (html: string) =>
  [...html.matchAll(/<a\b[^>]*?href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => ({ href: m[1], text: textOf(m[2]) }))

describe('AC-001.2: 위쪽 메뉴', () => {
  it('AC-001.2: nav aria-label="주요 메뉴" 안에 섹션 링크 4개가 순서대로 있다', () => {
    const nav = header.match(/<nav\b[^>]*aria-label="주요 메뉴"[^>]*>([\s\S]*?)<\/nav>/)
    expect(nav).not.toBeNull()
    expect(linksOf(nav![1])).toEqual([
      { href: '#ai', text: 'AI 분석' },
      { href: '#features', text: '기능' },
      { href: '#privacy', text: '개인정보 보호' },
      { href: '#how', text: '시작 방법' },
    ])
  })

  it('AC-001.2: 로고는 #top(히어로)으로 가고, 히어로 섹션 id가 top이다', () => {
    const logo = linksOf(header).find((l) => l.text.includes('[서비스 이름]'))
    expect(logo?.href).toBe('#top')
    expect(hero).toMatch(/<section\b[^>]*id="top"/)
  })
})

// 여는 태그의 class 목록
const classesOf = (openTag: string) => (/\bclass="([^"]*)"/.exec(openTag)?.[1] ?? '').split(/\s+/).filter(Boolean)
// Vitest의 CSS Module은 없는 이름에도 클래스를 돌려준다 → 붙인 클래스가 base.module.css에 정의돼 있는지 짝으로 본다(design.md)
const baseCss = readFileSync(join(process.cwd(), 'src/components/landing/base.module.css'), 'utf8')

describe('AC-106.1: 위쪽 메뉴의 짜임', () => {
  it('AC-106.1: header 안은 .wrap 틀 하나에 로고 링크 · 주요 메뉴 nav · [구글로 시작하기]가 이 순서로 있다', () => {
    const parts = header.match(
      /^<header\b[^>]*>(<div\b[^>]*>)(<a\b[^>]*href="#top"[^>]*>[\s\S]*?<\/a>)(<nav\b[^>]*aria-label="주요 메뉴"[^>]*>[\s\S]*?<\/nav>)(<a\b[^>]*href="\/login"[^>]*>[\s\S]*?<\/a>)<\/div><\/header>$/,
    )
    expect(parts, 'header > div > a#top · nav · a/login').not.toBeNull()
    expect(classesOf(parts![1])).toContain(base.wrap)
    expect(baseCss).toMatch(/^\.wrap\s*\{/m)
  })

  it('AC-106.1: 로고 링크 안은 LogoMark 22와 [서비스 이름]뿐이다', () => {
    const logo = header.match(/<a\b[^>]*href="#top"[^>]*>([\s\S]*?)<\/a>/)
    expect(logo).not.toBeNull()
    expect(logo![1]).toBe(`${renderToStaticMarkup(<LogoMark size={22} />)}<span>[서비스 이름]</span>`)
  })

  it('AC-106.1: header 안의 svg는 로고 하나다', () => {
    expect(header.match(/<svg\b/g) ?? []).toHaveLength(1)
  })

  it('AC-106.1: [구글로 시작하기]는 .btn·.btnMd·.btnPrimary 클래스이고 안에 글자만 있다', () => {
    const cta = header.match(/(<a\b[^>]*href="\/login"[^>]*>)([\s\S]*?)<\/a>/)
    expect(cta).not.toBeNull()
    const classes = classesOf(cta![1])
    for (const name of ['btn', 'btnMd', 'btnPrimary'] as const) {
      expect(classes, name).toContain(base[name])
      expect(baseCss, `base.module.css .${name}`).toMatch(new RegExp(`^\\.${name}\\s*\\{`, 'm'))
    }
    expect(cta![2]).toBe('구글로 시작하기')
  })

  it('AC-106.1: 메뉴를 여닫는 단추가 없다 — header에 button·input·tabindex가 없다', () => {
    expect(header).not.toMatch(/<(button|input|select|textarea|form|label)\b/)
    expect(header).not.toMatch(/tabindex/i)
  })
})

describe('AC-001.1: 약속 띠', () => {
  it('AC-001.1: 핵심 약속 띠는 section aria-label="핵심 약속"이고 약속 3개가 있다', () => {
    expect(band).toMatch(/^<section\b[^>]*aria-label="핵심 약속"/)
    const text = textOf(band)
    for (const line of ['환자 개인정보 서버 전송 0건', '환자 파일은 브라우저 안에서만 계산', 'AI에는 합계 숫자만']) {
      expect(text).toContain(line)
    }
  })
})

describe('AC-001.3: 제목', () => {
  it('AC-001.3: 히어로에 h1이 하나이고 글자는 "숫자로 보는 우리 의원"이다', () => {
    const h1s = [...hero.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)]
    expect(h1s).toHaveLength(1)
    expect(textOf(h1s[0][1])).toBe('숫자로 보는 우리 의원')
    expect(h1s[0][1]).toMatch(/숫자로 보는<br\/>/)
    expect(header + band).not.toMatch(/<h1\b/)
  })
})

describe('AC-002.1: [구글로 시작하기]', () => {
  it('AC-002.1: START_HREF는 /login이다', () => {
    expect(START_HREF).toBe('/login')
  })

  it('AC-002.1: 메뉴와 히어로에 하나씩 있고 둘 다 /login으로 간다', () => {
    for (const html of [header, hero]) {
      const starts = linksOf(html).filter((l) => l.text === '구글로 시작하기')
      expect(starts).toEqual([{ href: '/login', text: '구글로 시작하기' }])
    }
  })
})

describe('AC-002.2: [AI 분석 보기]', () => {
  it('AC-002.2: 히어로의 [AI 분석 보기]는 #ai로 간다', () => {
    expect(linksOf(hero).filter((l) => l.text === 'AI 분석 보기')).toEqual([{ href: '#ai', text: 'AI 분석 보기' }])
  })
})

describe('AC-005.1: 정한 문구', () => {
  it('AC-005.1: 히어로 칩 "통증 의원 관리자를 위한 AI 업무 도구"', () => {
    expect(textOf(hero)).toContain('통증 의원 관리자를 위한 AI 업무 도구')
  })

  it('AC-005.1: 히어로 아래 문장 "환자 개인정보는 병원 PC 밖으로 나가지 않습니다"', () => {
    expect(textOf(hero)).toContain('환자 개인정보는 병원 PC 밖으로 나가지 않습니다')
  })
})

describe('AC-005.2: 빈칸과 예시 표시', () => {
  it('AC-005.2: 메뉴 로고의 서비스 이름은 [서비스 이름]이다', () => {
    expect(textOf(header)).toContain('[서비스 이름]')
  })

  it('AC-005.2: 히어로 오른쪽은 HeroChart이고 "숫자는 예시" 칩이 있다', () => {
    const text = textOf(hero)
    expect(text).toContain('숫자는 예시')
    expect(text).toContain('오늘 외래')
  })
})

describe('AC-008.1: svg는 꾸밈', () => {
  it('AC-008.1: 메뉴·히어로·약속 띠의 svg가 모두 aria-hidden="true"다', () => {
    for (const html of [header, hero, band]) {
      const svgs = html.match(/<svg\b[^>]*>/g) ?? []
      expect(svgs.length).toBeGreaterThan(0)
      for (const svg of svgs) expect(svg).toContain('aria-hidden="true"')
    }
  })
})

describe('AC-007.1: 아무것도 받지 않는다', () => {
  it('AC-007.1: 메뉴·히어로·약속 띠에 form·input·textarea·button이 없다', () => {
    for (const html of [header, hero, band]) expect(html).not.toMatch(/<(form|input|textarea|button)\b/)
  })
})
