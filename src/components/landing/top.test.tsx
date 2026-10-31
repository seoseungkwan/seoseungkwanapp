import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Icon, type IconName } from '@/components/common/Icon'
import { LogoMark } from '@/components/common/LogoMark'
import { DashboardPreview } from '@/components/preview/DashboardPreview'
import base from './base.module.css'
import Hero from './Hero'
import heroStyles from './Hero.module.css'
import { START_HREF } from './links'
import SiteHeader from './SiteHeader'
import headerStyles from './SiteHeader.module.css'

const header = renderToStaticMarkup(<SiteHeader />)
const hero = renderToStaticMarkup(<Hero />)

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
const preview = renderToStaticMarkup(<DashboardPreview />)

// 히어로에서 미리보기(DashboardPreview)를 표시 하나로 바꾼 마크업
const heroOwn = hero.replace(preview, '@@PREVIEW@@')
// section#top > .wrap > .grid( .text(소개 p · h1 · 안내 p · 단추 줄 · 약속 ul · 휴대폰 한 줄 p) → .shot(DashboardPreview) ).
// 소개·제목·안내는 [^<]*라 안에 태그(br·span)가 없다
const HERO_SHAPE = new RegExp(
  [
    '^(<section\\b[^>]*>)(<div\\b[^>]*>)(<div\\b[^>]*>)',
    '(<div\\b[^>]*>)(<p\\b[^>]*>)([^<]*)</p>(<h1\\b[^>]*>)([^<]*)</h1>(<p\\b[^>]*>)([^<]*)</p>',
    '(<div\\b[^>]*>)(<a\\b[^>]*>)([^<]*)</a>(<a\\b[^>]*>)([^<]*)</a></div>',
    '(<ul\\b[^>]*>)((?:<li\\b[^>]*>[\\s\\S]*?</li>)*)</ul>',
    '(<p\\b[^>]*>)([\\s\\S]*?)</p></div>',
    '(<div\\b[^>]*>)@@PREVIEW@@</div></div></div></section>$',
  ].join(''),
)
const icon = (name: IconName, size?: number, className?: string) =>
  renderToStaticMarkup(<Icon name={name} size={size} className={className} />)

describe('AC-208.1: 히어로의 짜임', () => {
  const parts = heroOwn.match(HERO_SHAPE)
  const [, section, wrap, grid, text, kicker, kickerIn, h1, h1In, lead, leadIn, actions, start, startIn, ai, aiIn, promises, promisesIn, phone, phoneIn, shot] =
    parts ?? []
  const promiseItems = [...(promisesIn ?? '').matchAll(/(<li\b[^>]*>)([\s\S]*?)<\/li>/g)]

  it('AC-208.1: section#top > .wrap > .grid 안이 글 덩어리(.text) → 미리보기(.shot 안 DashboardPreview 하나) 순서다', () => {
    expect(hero, '히어로 안에 DashboardPreview가 그대로 하나 있다').toContain(preview)
    expect(hero.split(preview)).toHaveLength(2)
    expect(parts, 'section#top > .wrap > .grid(.text: p·h1·p·단추 2·ul·p → .shot: 미리보기)').not.toBeNull()
    expect(section).toMatch(/\bid="top"/)
    expect(classesOf(section)).toEqual([heroStyles.hero])
    expect(classesOf(wrap)).toEqual([base.wrap])
    expect(classesOf(grid)).toEqual([base.grid, heroStyles.layout])
    expect(classesOf(text)).toEqual([heroStyles.text])
    expect(classesOf(shot)).toEqual([heroStyles.shot])
  })

  it('AC-208.1: 글 덩어리 — 소개 <p>(.tSmall·.kicker) → <h1>(.tDisplay) "숫자로 보는 우리 의원" → 안내 <p>(.lead, 지금 문구), 셋 다 태그 없는 글자다', () => {
    expect(classesOf(kicker)).toEqual([base.tSmall, heroStyles.kicker])
    expect(kickerIn).toBe('통증 의원 관리자를 위한 AI 업무 도구')
    expect(classesOf(h1)).toEqual([base.tDisplay])
    expect(h1In, '줄바꿈 태그·색 강조 span 없음').toBe('숫자로 보는 우리 의원')
    expect(classesOf(lead)).toEqual([heroStyles.lead])
    expect(leadIn, 'nowrap span 없음').toBe(
      '환자 통계, 급여·인센티브, 매출·재고, 일일마감과 원장님 보고까지 한 화면에서. 이번 달 숫자는 AI가 읽고 근거와 함께 설명합니다.',
    )
  })

  it('AC-208.1: 단추 줄 — [구글로 시작하기](/login, 주·44px .btnLg, .start) · [AI 분석 보기](#ai, 보조·44px, 768px 미만 숨김 .pcOnly), 안에 글자만 있다', () => {
    expect(classesOf(actions)).toEqual([heroStyles.actions])
    expect(start).toMatch(/href="\/login"/)
    expect(startIn).toBe('구글로 시작하기')
    expect(classesOf(start)).toEqual([base.btn, base.btnLg, base.btnPrimary, heroStyles.start])
    expect(ai).toMatch(/href="#ai"/)
    expect(aiIn, '반짝이 svg 없음').toBe('AI 분석 보기')
    expect(classesOf(ai)).toEqual([base.btn, base.btnLg, base.btnSecondary, base.pcOnly])
  })

  it('AC-208.1: 약속(768px 이상, ul.promises.pcOnly) — li 3개가 방패 · 모니터 · 합계 기호 Icon 16(.icon) + 문구이고 "0건"만 .zero다', () => {
    expect(classesOf(promises)).toEqual([heroStyles.promises, base.pcOnly])
    expect(promiseItems).toHaveLength(3)
    for (const [, open] of promiseItems) expect(classesOf(open)).toEqual([heroStyles.promise])
    expect(promiseItems.map((m) => m[2])).toEqual([
      `${icon('shield', undefined, heroStyles.icon)}<span>환자 개인정보 서버 전송 <span class="${heroStyles.zero}">0건</span></span>`,
      `${icon('monitor', undefined, heroStyles.icon)}<span>환자 파일은 브라우저 안에서만 계산</span>`,
      `${icon('sigma', undefined, heroStyles.icon)}<span>AI에는 합계 숫자만</span>`,
    ])
    for (const [, , inner] of promiseItems) {
      const svg = inner.match(/<svg\b[^>]*>/)![0]
      expect(svg).toMatch(/\bwidth="16"/)
      expect(svg).toMatch(/\bheight="16"/)
      expect(svg).toMatch(/\bstroke="currentColor"/)
    }
  })

  it('AC-208.1: 휴대폰 한 줄(768px 미만만, p.tSmall.phoneLine.phoneOnly) — 방패 14px + "환자 개인정보는 병원 PC 밖으로 나가지 않습니다"', () => {
    expect(classesOf(phone)).toEqual([base.tSmall, heroStyles.phoneLine, base.phoneOnly])
    expect(phoneIn).toBe(`${icon('shield', 14)}환자 개인정보는 병원 PC 밖으로 나가지 않습니다`)
  })

  it('AC-208.1: 장식이 없다 — 미리보기 밖 svg는 Icon 4개(모두 aria-hidden)뿐이고, inline style·색 글자·반짝이가 없으며 Hero.tsx는 svg를 직접 그리지 않는다', () => {
    expect(heroOwn.match(/<svg\b/g) ?? []).toHaveLength(4)
    expect(heroOwn.match(/aria-hidden="true"/g) ?? []).toHaveLength(4)
    expect(heroOwn).not.toMatch(/\bstyle="/)
    expect(heroOwn).not.toMatch(/="#[0-9a-f]{3,8}"/i)
    expect(heroOwn).not.toContain('M8 1.5l1.6 4.2')
    const src = readFileSync(join(process.cwd(), 'src/components/landing/Hero.tsx'), 'utf8')
    expect(src).not.toMatch(/<svg\b/)
    expect(src).toMatch(/^import \{ Icon(?:, type IconName)? \} from '@\/components\/common\/Icon'$/m)
    expect(src).toMatch(/^import \{ DashboardPreview \} from '@\/components\/preview\/DashboardPreview'$/m)
  })

  it('AC-208.1: 히어로에 붙은 클래스가 모두 base.module.css·Hero.module.css에 정의돼 있다', () => {
    expect(heroCss.trim().length).toBeGreaterThan(0)
    expect(checkClasses(heroOwn, HERO_MODULES).problems).toEqual([])
  })
})

describe('AC-113.4: 클래스 확인 도우미가 헛돌며 통과하지 않는다', () => {
  it.each([
    ['위쪽 메뉴', () => header, HEADER_MODULES],
    ['히어로', () => heroOwn, HERO_MODULES],
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

describe('AC-001.3: 제목', () => {
  it('AC-001.3: 히어로에 h1이 하나이고 글자는 "숫자로 보는 우리 의원"이다', () => {
    const h1s = [...hero.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)]
    expect(h1s).toHaveLength(1)
    expect(textOf(h1s[0][1])).toBe('숫자로 보는 우리 의원')
    expect(h1s[0][1]).toBe('숫자로 보는 우리 의원')
    expect(header).not.toMatch(/<h1\b/)
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
  it('AC-005.2: 히어로 오른쪽은 DashboardPreview이고 "예시 숫자" 칩이 있다', () => {
    expect(hero).toContain(preview)
    expect(textOf(hero)).toContain('예시 숫자')
  })
})

describe('AC-008.1: svg는 꾸밈', () => {
  it('AC-008.1: 메뉴·히어로·약속 띠의 svg가 모두 aria-hidden="true"다', () => {
    for (const html of [header, hero]) {
      const svgs = html.match(/<svg\b[^>]*>/g) ?? []
      expect(svgs.length).toBeGreaterThan(0)
      for (const svg of svgs) expect(svg).toContain('aria-hidden="true"')
    }
  })
})

describe('AC-007.1: 아무것도 받지 않는다', () => {
  it('AC-007.1: 메뉴·히어로·약속 띠에 form·input·textarea·button이 없다', () => {
    for (const html of [header, hero]) expect(html).not.toMatch(/<(form|input|textarea|button)\b/)
  })
})
