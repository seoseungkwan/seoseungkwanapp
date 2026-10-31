import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LogoMark } from '@/components/common/LogoMark'
import base from '@/components/landing/base.module.css'
import Home from './page'

const html = renderToStaticMarkup(<Home />)

// 태그를 빈칸으로 바꾸고 빈칸을 하나로 모은 글자 (React가 바꾼 &#x27; 같은 글자는 되돌린다)
const ENTITIES: Record<string, string> = { '&#x27;': "'", '&quot;': '"', '&lt;': '<', '&gt;': '>', '&amp;': '&' }
const textOf = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&quot;|&lt;|&gt;|&amp;/g, (e) => ENTITIES[e])
    .replace(/\s+/g, ' ')
    .trim()
const text = textOf(html)
// <a> 링크 목록: href와 글자
const links = [...html.matchAll(/<a\b[^>]*?href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => ({
  href: m[1],
  text: textOf(m[2]),
}))
const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])
const ROOT = process.cwd()

describe('AC-001.1: 섹션 순서', () => {
  it('AC-001.1: header → #top → 핵심 약속 → #ai → #ortho → #features → #privacy → #how → #start → footer', () => {
    const marks = [
      /<header\b/,
      /<section\b[^>]*id="top"/,
      /<section\b[^>]*aria-label="핵심 약속"/,
      /<section\b[^>]*id="ai"/,
      /<section\b[^>]*id="ortho"/,
      /<section\b[^>]*id="features"/,
      /<section\b[^>]*id="privacy"/,
      /<section\b[^>]*id="how"/,
      /<section\b[^>]*id="start"/,
      /<footer\b/,
    ]
    const positions = marks.map((re) => html.search(re))
    for (const [i, pos] of positions.entries()) expect(pos, String(marks[i])).toBeGreaterThanOrEqual(0)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })

  it('AC-001.1: 섹션은 main 하나 안에 있고, 메뉴 띠는 main 앞·푸터는 main 뒤에 있다', () => {
    expect(html.match(/<main\b/g)).toHaveLength(1)
    const main = html.match(/<main\b[^>]*>([\s\S]*)<\/main>/)
    expect(main).not.toBeNull()
    expect(main![1].match(/<section\b/g)).toHaveLength(8)
    expect(html.search(/<header\b/)).toBeLessThan(html.search(/<main\b/))
    expect(html.search(/<footer\b/)).toBeGreaterThan(html.search(/<\/main>/))
    expect(html.match(/<header\b/g)).toHaveLength(1)
    expect(html.match(/<footer\b/g)).toHaveLength(1)
  })
})

describe('AC-105.1: 랜딩 뿌리 감싸개', () => {
  it('AC-105.1: base.module.css의 .root 클래스 <div> 하나가 header·main·footer를 감싼다', () => {
    // 페이지 전체가 <div class="…">header main footer</div> 하나다
    const wrapper = html.match(/^<div class="([^"]+)">([\s\S]*)<\/div>$/)
    expect(wrapper, '맨 바깥 <div>').not.toBeNull()
    const [, className, inner] = wrapper!
    expect(className.split(/\s+/)).toHaveLength(1)
    expect(className).toMatch(/root/)
    expect(inner).toMatch(/^<header\b[\s\S]*<\/header><main\b[\s\S]*<\/main><footer\b[\s\S]*<\/footer>$/)
    // 그 클래스는 base.module.css의 .root다(CSS 쪽 값은 styles.test.ts가 본다)
    const page = readFileSync(join(ROOT, 'src/app/page.tsx'), 'utf8')
    expect(page).toMatch(/^import base from '@\/components\/landing\/base\.module\.css'$/m)
    expect(page).toMatch(/<div className=\{base\.root\}>/)
  })
})

describe('AC-001.2: 메뉴와 # 링크', () => {
  it('AC-001.2: 주요 메뉴에 AI 분석·기능·개인정보 보호·시작 방법 4개가 있다', () => {
    const nav = html.match(/<nav\b[^>]*aria-label="주요 메뉴"[^>]*>([\s\S]*?)<\/nav>/)
    expect(nav).not.toBeNull()
    const navLinks = [...nav![1].matchAll(/href="([^"]*)"/g)].map((m) => m[1])
    expect(navLinks).toEqual(['#ai', '#features', '#privacy', '#how'])
  })

  it('AC-001.2: 페이지 안의 모든 # 링크는 페이지에 있는 id를 가리킨다', () => {
    const hashLinks = links.filter((l) => l.href.startsWith('#'))
    expect(hashLinks.length).toBeGreaterThanOrEqual(6)
    for (const { href } of hashLinks) expect(ids, href).toContain(href.slice(1))
  })

  it('AC-001.2: id가 겹치지 않는다', () => {
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('AC-001.3: 제목', () => {
  it('AC-001.3: h1은 하나이고 글자는 "숫자로 보는 우리 의원"이다', () => {
    const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)]
    expect(h1s).toHaveLength(1)
    expect(textOf(h1s[0][1])).toBe('숫자로 보는 우리 의원')
  })
})

describe('AC-002.1: [구글로 시작하기]', () => {
  it('AC-002.1: 메뉴·히어로·시작하기 섹션에 하나씩 모두 3개, 셋 다 href="/login"', () => {
    const starts = links.filter((l) => l.text === '구글로 시작하기')
    expect(starts).toHaveLength(3)
    for (const s of starts) expect(s.href).toBe('/login')
    const header = html.match(/<header\b[\s\S]*?<\/header>/)![0]
    const hero = html.match(/<section\b[^>]*id="top"[\s\S]*?(?=<section\b[^>]*aria-label="핵심 약속")/)![0]
    const start = html.match(/<section\b[^>]*id="start"[\s\S]*?<\/section>/)![0]
    for (const part of [header, hero, start]) expect(part).toMatch(/<a\b[^>]*href="\/login"[^>]*>구글로 시작하기<\/a>/)
  })
})

describe('AC-002.2: [AI 분석 보기]', () => {
  it('AC-002.2: [AI 분석 보기]는 하나이고 #ai로 간다', () => {
    expect(links.filter((l) => l.text === 'AI 분석 보기')).toEqual([{ href: '#ai', text: 'AI 분석 보기' }])
  })
})

describe('AC-005.1: 정한 문구', () => {
  it('AC-005.1: 사용자가 정한 문구가 그대로 있다', () => {
    for (const line of [
      '통증 의원 관리자를 위한 AI 업무 도구',
      '환자 개인정보는 병원 PC 밖으로 나가지 않습니다',
      '환자 개인정보는 절대 병원 PC 밖으로 나가지 않습니다',
      'EMR',
      '주사 치료 수와 F/U',
      '물리치료 내원 환자 수',
      '비급여 치료 내역',
      '한 장으로 받는 월간 보고',
    ]) {
      expect(text, line).toContain(line)
    }
  })

  it('AC-005.1: 개인정보 섹션 제목과 큰 숫자 "0"·단위 "건"', () => {
    const privacy = html.match(/<section\b[^>]*id="privacy"[\s\S]*?<\/section>/)![0]
    expect(textOf(privacy.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/)![1])).toBe(
      '환자 개인정보는 절대 병원 PC 밖으로 나가지 않습니다',
    )
    expect(privacy).toMatch(/>0<span\b[^>]*>건<\/span>/)
  })
})

// 2026-10-30 사용자 결정 "F/U 기록을 그냥 F/U로 바꾸자" (specs/landing-v2 REQ-114)
describe('AC-114.1: "F/U 기록" → "F/U"', () => {
  it('AC-114.1: 페이지 글자와 마크업 어디에도 "F/U 기록"이 없고, "주사 치료 수와 F/U"는 있다', () => {
    expect(text).not.toContain('F/U 기록')
    expect(html).not.toContain('F/U 기록')
    expect(text).toContain('주사 치료 수와 F/U')
  })
})

describe('AC-005.2: 빈칸과 예시 표시', () => {
  it('AC-005.2: [서비스 이름]은 메뉴 로고와 푸터에, 문의 메일은 [이메일 주소]', () => {
    const header = html.match(/<header\b[\s\S]*?<\/header>/)![0]
    const footer = html.match(/<footer\b[\s\S]*?<\/footer>/)![0]
    expect(textOf(header)).toContain('[서비스 이름]')
    expect(textOf(footer)).toContain('[서비스 이름]')
    expect(textOf(footer)).toContain('문의 [이메일 주소]')
  })

  it('AC-005.2: 예시 숫자 영역에 "숫자는 예시"(히어로)·"방금 생성 · 예시"(AI 리포트) 표시가 있다', () => {
    const hero = html.match(/<section\b[^>]*id="top"[\s\S]*?(?=<section\b[^>]*aria-label="핵심 약속")/)![0]
    const ai = html.match(/<section\b[^>]*id="ai"[\s\S]*?(?=<section\b[^>]*id="ortho")/)![0]
    expect(textOf(hero)).toContain('숫자는 예시')
    expect(textOf(ai)).toContain('방금 생성 · 예시')
  })
})

describe('AC-005.3: 금지한 장식', () => {
  it('AC-005.3: "Powered by AI" 글자가 없고, 인라인 그라데이션 글자도 없다', () => {
    expect(html).not.toMatch(/powered\s*by\s*ai/i)
    expect(html).not.toMatch(/background-clip:\s*text/i)
  })
})

// 지운 그림 6장의 이름. 승인 기록(docs/mockups/landing/images/)에는 남는다
const LANDING_JPGS = [
  'feature-payroll.jpg',
  'feature-stats.jpg',
  'tile-injection.jpg',
  'tile-noncovered.jpg',
  'tile-physio.jpg',
  'tile-report.jpg',
]

describe('AC-104.1: 그림을 모두 뺀다', () => {
  it('AC-104.1: 페이지 전체에 img·picture·video가 0개이고, http로 시작하는 바깥 주소 그림이 없다', () => {
    expect(html).not.toMatch(/<(img|picture|video)\b/i)
    expect(html).not.toMatch(/\ssrc(set)?="https?:/i)
  })
})

describe('AC-104.2: 그림 파일이 없다', () => {
  it('AC-104.2: public/landing/ 그림과 images.ts·images.test.ts가 없고, 승인 기록 그림 6장은 남는다', () => {
    const served = join(ROOT, 'public/landing')
    const servedJpgs = existsSync(served) ? readdirSync(served).filter((name) => /\.jpe?g$/i.test(name)) : []
    expect(servedJpgs).toEqual([])
    expect(existsSync(join(ROOT, 'src/components/landing/images.ts'))).toBe(false)
    expect(existsSync(join(ROOT, 'src/components/landing/images.test.ts'))).toBe(false)
    for (const name of LANDING_JPGS) {
      expect(existsSync(join(ROOT, 'docs/mockups/landing/images', name)), name).toBe(true)
    }
  })
})

describe('AC-007.1: 랜딩은 아무것도 받지 않는다', () => {
  it('AC-007.1: form·input·textarea·button이 없다', () => {
    expect(html).not.toMatch(/<(form|input|textarea|button|select)\b/)
  })
})

describe('AC-008.1: 접근성', () => {
  it('AC-008.1: 모든 svg가 aria-hidden="true"다', () => {
    const svgs = html.match(/<svg\b[^>]*>/g) ?? []
    expect(svgs.length).toBeGreaterThan(10)
    for (const svg of svgs) expect(svg).toContain('aria-hidden="true"')
  })
})

describe('AC-110.6: 회색 바탕 섹션', () => {
  it('AC-110.6: .secCanvas는 #ai · #features · #how 세 섹션에만 있다', () => {
    const sections = [...html.matchAll(/<section\b[^>]*>/g)].map((m) => ({
      id: /\sid="([^"]+)"/.exec(m[0])?.[1] ?? m[0],
      classes: (/\bclass="([^"]*)"/.exec(m[0])?.[1] ?? '').split(/\s+/),
    }))
    expect(sections).toHaveLength(8)
    expect(sections.filter((s) => s.classes.includes(base.secCanvas)).map((s) => s.id)).toEqual(['ai', 'features', 'how'])
    // 섹션 밖(메뉴·푸터·미리보기 안)에도 붙지 않는다
    const all = [...html.matchAll(/\bclass="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/))
    expect(all.filter((c) => c === base.secCanvas)).toHaveLength(3)
  })
})

// ---------- AC-105.8: 랜딩 TSX의 색 글자·inline style 범위 ----------

const LANDING_DIR = join(ROOT, 'src/components/landing')
const landingTsx = readdirSync(LANDING_DIR)
  .filter((name) => name.endsWith('.tsx') && !/\.test\.tsx$/.test(name))
  .map((name) => ({ name, body: readFileSync(join(LANDING_DIR, name), 'utf8') }))
// '#' + 16진수 3·4·6·8자리 색 글자 (#features·#ai 같은 # 링크는 뒤에 글자가 이어져 걸리지 않는다)
const HEX_COLOR = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])/i
// 로고 마크 출력(고정 두 색)을 뺀 페이지 마크업. 메뉴(22)와 히어로 미리보기(20)에 하나씩 있다
const LOGOS = [renderToStaticMarkup(<LogoMark size={22} />), renderToStaticMarkup(<LogoMark size={20} />)]
const withoutLogos = LOGOS.reduce((markup, logo) => markup.split(logo).join(''), html)

describe('AC-105.8: 랜딩 TSX의 색과 inline style', () => {
  it('AC-105.8: 랜딩 폴더의 *.tsx(시험 제외)에 색 글자(# + 16진수)가 없다', () => {
    expect(landingTsx.map((f) => f.name)).toEqual(
      expect.arrayContaining(['PrivacySection.tsx', 'HowSection.tsx', 'StartSection.tsx', 'SiteFooter.tsx', 'HeroChart.tsx']),
    )
    for (const { name, body } of landingTsx) expect(body, name).not.toMatch(HEX_COLOR)
  })

  it('AC-105.8: 로고는 <LogoMark />를 부르기만 한다(메뉴 22 · 미리보기 20), 그 밖의 페이지 마크업에는 색 글자가 없다', () => {
    for (const logo of LOGOS) expect(html.split(logo).length - 1, logo).toBe(1)
    for (const { name, body } of landingTsx) {
      expect(body, `${name}: 로고 십자 경로를 따로 그리지 않는다`).not.toContain('M13.5 8h3a1')
      if (/<LogoMark\b/.test(body)) expect(body, name).toMatch(/^import \{ LogoMark \} from '@\/components\/common\/LogoMark'$/m)
    }
    expect(withoutLogos).not.toMatch(HEX_COLOR)
  })

  it('AC-105.8: 로고 밖 svg의 선·채움은 currentColor나 none뿐이다(색은 CSS 클래스가 정한다)', () => {
    const paints = [...withoutLogos.matchAll(/\s(fill|stroke)="([^"]*)"/g)].map((m) => `${m[1]}="${m[2]}"`)
    expect(paints.length).toBeGreaterThan(0)
    for (const paint of paints) expect(paint).toMatch(/^(fill|stroke)="(currentColor|none)"$/)
  })

  it('AC-105.8: inline style은 % 값의 높이·폭·위치 하나씩뿐이다(히어로 막대 높이 6 · 신환율·처방 그룹 막대 폭 5 · 눈금선 위치 4)', () => {
    const styles = [...html.matchAll(/\sstyle="([^"]*)"/g)].map((m) => m[1])
    for (const style of styles) expect(style).toMatch(/^(height|width|bottom):\d+(\.\d+)?%$/)
    const count = (prop: string) => styles.filter((s) => s.startsWith(`${prop}:`)).length
    expect({ height: count('height'), width: count('width'), bottom: count('bottom') }).toEqual({ height: 6, width: 5, bottom: 4 })
    // style을 쓰는 랜딩 TSX는 미리보기 둘뿐이다
    const withStyle = landingTsx.filter((f) => /\bstyle=\{/.test(f.body)).map((f) => f.name)
    expect(withStyle.sort()).toEqual(['FeaturesSection.tsx', 'HeroChart.tsx'])
  })
})
