import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LogoMark } from '@/components/common/LogoMark'
import base from './base.module.css'
import Hero from './Hero'
import heroStyles from './Hero.module.css'
import HeroChart from './HeroChart'
import { START_HREF } from './links'
import PromiseBand from './PromiseBand'
import bandStyles from './PromiseBand.module.css'
import SiteHeader from './SiteHeader'
import headerStyles from './SiteHeader.module.css'

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
    const logo = linksOf(header).find((l) => l.text === '맨 위로')
    expect(logo?.href).toBe('#top')
    expect(hero).toMatch(/<section\b[^>]*id="top"/)
  })
})

// 여는 태그의 class 목록
const classesOf = (openTag: string) => (/\bclass="([^"]*)"/.exec(openTag)?.[1] ?? '').split(/\s+/).filter(Boolean)
// Vitest의 CSS Module은 없는 이름에도 클래스를 돌려준다 → 붙인 클래스가 base.module.css에 정의돼 있는지 짝으로 본다(design.md)
const baseCss = readFileSync(join(process.cwd(), 'src/components/landing/base.module.css'), 'utf8')

describe('AC-207.1: 위쪽 메뉴의 짜임', () => {
  it('AC-207.1: header > .wrap 안이 로고 링크(#top) · 주요 메뉴 nav · [구글로 시작하기](/login) 이 순서다', () => {
    const parts = header.match(
      /^<header\b[^>]*>(<div\b[^>]*>)(<a\b[^>]*href="#top"[^>]*>[\s\S]*?<\/a>)(<nav\b[^>]*aria-label="주요 메뉴"[^>]*>[\s\S]*?<\/nav>)(<a\b[^>]*href="\/login"[^>]*>[\s\S]*?<\/a>)<\/div><\/header>$/,
    )
    expect(parts, 'header > div > a#top · nav · a/login').not.toBeNull()
    expect(classesOf(parts![1])).toContain(base.wrap)
    expect(baseCss).toMatch(/^\.wrap\s*\{/m)
  })

  it('AC-207.1: 로고 링크 안은 LogoMark 24와 화면 읽기 전용(.srOnly) "맨 위로"뿐이고 보이는 글자가 없다', () => {
    const logo = header.match(/<a\b[^>]*href="#top"[^>]*>([\s\S]*?)<\/a>/)
    expect(logo).not.toBeNull()
    expect(logo![1]).toBe(`${renderToStaticMarkup(<LogoMark size={24} />)}<span class="${base.srOnly}">맨 위로</span>`)
    expect(baseCss, 'base.module.css .srOnly').toMatch(/^\.srOnly\s*\{/m)
  })

  it('AC-207.1: header 안의 svg는 로고 하나다', () => {
    expect(header.match(/<svg\b/g) ?? []).toHaveLength(1)
  })

  it('AC-207.1: [구글로 시작하기]는 주 단추(.btn·.btnMd·.btnPrimary)이고 안에 글자만 있다', () => {
    const cta = header.match(/(<a\b[^>]*href="\/login"[^>]*>)([\s\S]*?)<\/a>/)
    expect(cta).not.toBeNull()
    const classes = classesOf(cta![1])
    for (const name of ['btn', 'btnMd', 'btnPrimary'] as const) {
      expect(classes, name).toContain(base[name])
      expect(baseCss, `base.module.css .${name}`).toMatch(new RegExp(`^\\.${name}\\s*\\{`, 'm'))
    }
    expect(cta![2]).toBe('구글로 시작하기')
  })

  it('AC-207.1: [서비스 이름]·button·input·tabindex가 없다(메뉴를 여닫는 단추 없음)', () => {
    expect(textOf(header)).not.toContain('[서비스 이름]')
    expect(header).not.toMatch(/<(button|input|select|textarea|form|label)\b/)
    expect(header).not.toMatch(/tabindex/i)
  })

  it('AC-207.1: 메뉴에 붙은 클래스가 모두 base.module.css·SiteHeader.module.css에 정의돼 있다', () => {
    expect(headerCss.trim().length).toBeGreaterThan(0)
    expect(checkClasses(header, HEADER_MODULES).problems).toEqual([])
  })
})

// Vitest의 CSS Module 이름은 `_이름_파일해시6자`다 → 마크업에 붙은 클래스마다 그 파일 CSS에 `.이름`이 정의돼 있는지 본다
const cssOf = (name: string) =>
  readFileSync(join(process.cwd(), 'src/components/landing', name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
type Modules = Array<[sample: string, file: string]>
// checked: 파일마다 실제로 확인한 클래스 수. problems: CSS에 정의되지 않은 클래스 + 견본 해시 키가 겹친 파일 +
// 확인한 클래스가 0개인 파일. 해시 대응이 깨져도 헛돌며 통과하지 않게 한다(AC-113.4)
function checkClasses(html: string, modules: Modules): { checked: Record<string, number>; problems: string[] } {
  const problems: string[] = []
  const files = new Map<string, readonly [file: string, css: string]>()
  for (const [sample, file] of modules) {
    const key = sample.slice(-6)
    const taken = files.get(key)
    if (taken) problems.push(`${taken[0]}·${file}: 견본 해시 키 ${key}가 겹친다`)
    else files.set(key, [file, cssOf(file)])
  }
  const checked: Record<string, number> = Object.fromEntries(modules.map(([, file]) => [file, 0]))
  for (const cls of new Set([...html.matchAll(/\bclass="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/).filter(Boolean)))) {
    const m = /^_(\w+)_([0-9a-f]{6})$/.exec(cls)
    const file = m && files.get(m[2])
    if (!m || !file) continue
    checked[file[0]]++
    if (!new RegExp(`\\.${m[1]}(?![\\w-])`).test(file[1])) problems.push(`${file[0]} .${m[1]}`)
  }
  for (const [file, n] of Object.entries(checked)) if (n === 0) problems.push(`${file}: 확인한 클래스가 0개다`)
  return { checked, problems }
}
const heroCss = cssOf('Hero.module.css')
const bandCss = cssOf('PromiseBand.module.css')
const headerCss = cssOf('SiteHeader.module.css')
// 견본 클래스 하나로 모듈 파일의 해시를 알린다
const HEADER_MODULES: Modules = [
  [base.wrap, 'base.module.css'],
  [headerStyles.header, 'SiteHeader.module.css'],
]
const HERO_MODULES: Modules = [
  [base.wrap, 'base.module.css'],
  [heroStyles.hero, 'Hero.module.css'],
]
const BAND_MODULES: Modules = [
  [base.wrap, 'base.module.css'],
  [bandStyles.band, 'PromiseBand.module.css'],
]
const chart = renderToStaticMarkup(<HeroChart />)

// 히어로에서 미리보기(HeroChart)를 표시 하나로 바꾼 마크업
const heroOwn = hero.replace(chart, '@@CHART@@')
// section#top > .wrap > .grid( .text(kicker p · h1) / .side(lead p · 단추 2 · 개인정보 p) ) + .shot(HeroChart)
const HERO_SHAPE = new RegExp(
  [
    '^(<section\\b[^>]*>)(<div\\b[^>]*>)(<div\\b[^>]*>)',
    '(<div\\b[^>]*>)(<p\\b[^>]*>)([\\s\\S]*?)</p>(<h1\\b[^>]*>)([\\s\\S]*?)</h1></div>',
    '(<div\\b[^>]*>)(<p\\b[^>]*>)([\\s\\S]*?)</p>',
    '(<div\\b[^>]*>)(<a\\b[^>]*>)([\\s\\S]*?)</a>(<a\\b[^>]*>)([\\s\\S]*?)</a></div>',
    '(<p\\b[^>]*>)([\\s\\S]*?)</p></div></div>',
    '(<div\\b[^>]*>)@@CHART@@</div></div></section>$',
  ].join(''),
)

describe('AC-107.1: 히어로의 짜임', () => {
  const parts = heroOwn.match(HERO_SHAPE)
  const [, section, wrap, grid, text, kicker, kickerIn, h1, h1In, side, lead, leadIn, actions, start, startIn, ai, aiIn, privacy, privacyIn, shot] =
    parts ?? []

  it('AC-107.1: section#top > .wrap > .grid(.text · .side) + .shot(HeroChart) 순서다', () => {
    expect(hero, '히어로 안에 HeroChart 그림이 그대로 있다').toContain(chart)
    expect(parts, 'section#top > .wrap > .grid(text: p·h1 / side: p·단추 2·p) + .shot').not.toBeNull()
    expect(section).toMatch(/\bid="top"/)
    expect(classesOf(section)).toContain(heroStyles.hero)
    expect(classesOf(wrap)).toContain(base.wrap)
    expect(classesOf(grid)).toContain(heroStyles.grid)
    expect(classesOf(text)).toContain(heroStyles.text)
    expect(classesOf(side)).toContain(heroStyles.side)
    expect(classesOf(actions)).toContain(heroStyles.actions)
    expect(classesOf(shot)).toContain(heroStyles.shot)
  })

  it('AC-107.1: 소개 줄은 <p> 글자만(칩·svg 없음), h1은 .tDisplay이고 안이 "숫자로 보는<br/>우리 의원"뿐이다', () => {
    expect(classesOf(kicker)).toContain(heroStyles.kicker)
    expect(kickerIn).toBe('통증 의원 관리자를 위한 AI 업무 도구')
    expect(classesOf(h1)).toContain(base.tDisplay)
    expect(h1In, '색 강조 span 없음').toBe('숫자로 보는<br/>우리 의원')
  })

  it('AC-107.1: 안내 <p>는 .tLead이고 문구가 그대로다', () => {
    expect(classesOf(lead)).toContain(base.tLead)
    expect(textOf(leadIn)).toBe(
      '환자 통계, 급여·인센티브, 매출·재고, 일일마감과 원장님 보고까지 한 화면에서. 이번 달 숫자는 AI가 읽고 근거와 함께 설명합니다.',
    )
  })

  it('AC-107.1: [구글로 시작하기]는 .btn·.btnLg·.btnPrimary, [AI 분석 보기]는 .btn·.btnLg·.btnSecondary이고 둘 다 글자만 있다', () => {
    expect(start).toMatch(/href="\/login"/)
    expect(startIn).toBe('구글로 시작하기')
    expect(ai).toMatch(/href="#ai"/)
    expect(aiIn, '반짝이 svg 없음').toBe('AI 분석 보기')
    for (const name of ['btn', 'btnLg', 'btnPrimary'] as const) expect(classesOf(start), name).toContain(base[name])
    for (const name of ['btn', 'btnLg', 'btnSecondary'] as const) expect(classesOf(ai), name).toContain(base[name])
  })

  it('AC-107.1: 개인정보 줄은 방패 svg 하나(currentColor) + 문구다', () => {
    expect(classesOf(privacy)).toContain(heroStyles.privacy)
    const svgs = privacyIn.match(/<svg\b[^>]*>/g) ?? []
    expect(svgs).toHaveLength(1)
    expect(svgs[0]).toMatch(/stroke="currentColor"/)
    expect(privacyIn).toContain('d="M11 2l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V5l7-3z"')
    expect(textOf(privacyIn)).toBe('환자 개인정보는 병원 PC 밖으로 나가지 않습니다')
  })

  it('AC-107.1: 배경 장식(격자·원형 빛·점)·반짝이·색 글자가 없다 — 미리보기 밖 svg는 방패 하나, aria-hidden도 그 하나뿐이다', () => {
    expect(heroOwn.match(/<svg\b/g) ?? []).toHaveLength(1)
    expect(heroOwn.match(/aria-hidden=/g) ?? []).toHaveLength(1)
    expect(heroOwn).not.toMatch(/\bstyle="/)
    expect(heroOwn).not.toMatch(/="#[0-9a-f]{3,8}"/i)
    expect(heroOwn).not.toContain('M8 1.5l1.6 4.2')
  })

  it('AC-107.1: 히어로에 붙은 클래스가 모두 base.module.css·Hero.module.css에 정의돼 있다', () => {
    expect(heroCss.trim().length).toBeGreaterThan(0)
    expect(checkClasses(heroOwn, HERO_MODULES).problems).toEqual([])
  })
})

describe('AC-107.5: 약속 띠의 짜임', () => {
  const parts = band.match(/^(<section\b[^>]*>)(<div\b[^>]*>)((?:<div\b[^>]*>[\s\S]*?<\/div>){3})<\/div><\/section>$/)
  const items = [...(parts?.[3] ?? '').matchAll(/(<div\b[^>]*>)(<svg\b[^>]*>)([\s\S]*?)<\/svg>([^<]*)<\/div>/g)]

  it('AC-107.5: section[aria-label="핵심 약속"].band > .wrap.inner 안에 항목 3개가 있다', () => {
    expect(parts, 'section > div > div×3').not.toBeNull()
    expect(parts![1]).toMatch(/aria-label="핵심 약속"/)
    expect(classesOf(parts![1])).toContain(bandStyles.band)
    expect(classesOf(parts![2])).toContain(base.wrap)
    expect(classesOf(parts![2])).toContain(bandStyles.inner)
    expect(items.map((m) => m[4].trim())).toEqual([
      '환자 개인정보 서버 전송 0건',
      '환자 파일은 브라우저 안에서만 계산',
      'AI에는 합계 숫자만',
    ])
  })

  it('AC-107.5: 각 항목은 .bandItem이고 20px svg(stroke="currentColor", 굵기 1.5) + 글자다', () => {
    expect(items).toHaveLength(3)
    for (const [, open, svg] of items) {
      expect(classesOf(open)).toContain(bandStyles.bandItem)
      expect(svg).toMatch(/\bwidth="20"/)
      expect(svg).toMatch(/\bheight="20"/)
      expect(svg).toMatch(/\bstroke="currentColor"/)
      expect(svg).toMatch(/\bstroke-width="1\.5"/)
      expect(svg).toMatch(/aria-hidden="true"/)
    }
  })

  it('AC-107.5: AI 항목 아이콘은 반짝이 대신 합계 기호(Σ)이고, 띠에 색 글자가 없다', () => {
    expect(items[2]?.[3]).toContain('d="M14.5 4h-9l5 6-5 6h9"')
    expect(band).not.toContain('M8 1.5l1.6 4.2')
    expect(band).not.toMatch(/="#[0-9a-f]{3,8}"/i)
  })

  it('AC-107.5: 띠에 붙은 클래스가 모두 base.module.css·PromiseBand.module.css에 정의돼 있다', () => {
    expect(bandCss.trim().length).toBeGreaterThan(0)
    expect(checkClasses(band, BAND_MODULES).problems).toEqual([])
  })
})

describe('AC-113.4: 클래스 확인 도우미가 헛돌며 통과하지 않는다', () => {
  it.each([
    ['위쪽 메뉴', () => header, HEADER_MODULES],
    ['히어로', () => heroOwn, HERO_MODULES],
    ['약속 띠', () => band, BAND_MODULES],
  ] as Array<[string, () => string, Modules]>)(
    'AC-113.4: %s — 넘겨받은 모듈 파일마다 확인한 클래스가 하나 이상이고 문제가 없다',
    (_, markup, modules) => {
      const { checked, problems } = checkClasses(markup(), modules)
      expect(Object.keys(checked)).toEqual(modules.map(([, file]) => file))
      for (const [file, n] of Object.entries(checked)) expect(n, `${file} 확인한 클래스 수`).toBeGreaterThan(0)
      expect(problems).toEqual([])
    },
  )

  // 일부러 틀린 마크업·견본을 넣어 도우미가 실패를 알리는지 본다(영구 음성 시험)
  it('AC-113.4: 한 파일이라도 확인한 클래스가 0개면 실패로 알린다', () => {
    const { checked, problems } = checkClasses(`<div class="${base.wrap}"></div>`, HERO_MODULES)
    expect(checked).toEqual({ 'base.module.css': 1, 'Hero.module.css': 0 })
    expect(problems).toEqual(['Hero.module.css: 확인한 클래스가 0개다'])
  })

  it('AC-113.4: 견본 해시 키가 겹치면(같은 모듈의 견본 둘) 실패로 알린다', () => {
    const key = base.wrap.slice(-6)
    const { problems } = checkClasses(`<div class="${base.wrap} ${heroStyles.hero}"></div>`, [
      [base.wrap, 'base.module.css'],
      [base.btn, 'Hero.module.css'],
    ])
    expect(problems).toContain(`base.module.css·Hero.module.css: 견본 해시 키 ${key}가 겹친다`)
  })

  it('AC-113.4: CSS에 정의되지 않은 클래스를 실패로 알린다', () => {
    const fake = `_noSuchClass_${base.wrap.slice(-6)}`
    expect(checkClasses(`<div class="${base.wrap} ${fake}"></div>`, [[base.wrap, 'base.module.css']]).problems).toEqual([
      'base.module.css .noSuchClass',
    ])
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
