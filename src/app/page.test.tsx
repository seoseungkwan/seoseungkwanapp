// @vitest-environment jsdom
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LogoMark } from '@/components/common/LogoMark'
import aiStyles from '@/components/landing/AiSection.module.css'
import base from '@/components/landing/base.module.css'
import featStyles from '@/components/landing/FeaturesSection.module.css'
import heroStyles from '@/components/landing/Hero.module.css'
import howStyles from '@/components/landing/HowSection.module.css'
import orthoStyles from '@/components/landing/OrthoSection.module.css'
import privStyles from '@/components/landing/PrivacySection.module.css'
import footStyles from '@/components/landing/SiteFooter.module.css'
import headStyles from '@/components/landing/SiteHeader.module.css'
import { DashboardPreview } from '@/components/preview/DashboardPreview'
import { BOX_TAGS, isBorderBox, nestedBoxes } from '@/testing/boxes'
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
// 히어로(section#top부터 #ai 앞까지)의 마크업
const HERO = html.match(/<section\b[^>]*id="top"[\s\S]*?(?=<section\b[^>]*id="ai")/)?.[0] ?? ''

// 서버 마크업을 jsdom에 넣은 페이지(상자 검사·섹션 찾기용)
const doc = (() => {
  const host = document.createElement('div')
  host.innerHTML = html
  return host
})()
const mainSections = () => Array.from(doc.querySelectorAll('main > section'))

describe('AC-211.2: 페이지 짜임', () => {
  it('AC-211.2: .root 감싸개 하나 안에 header → main(#top · #ai · #ortho · #features · #privacy · #how) → footer 순서다(약속 띠·#start 없음)', () => {
    expect(html, '약속 띠는 히어로 안 약속 목록이 됐다').not.toMatch(/aria-label="핵심 약속"/)
    expect(html, '시작하기 섹션은 #how에 합쳤다').not.toMatch(/\bid="start"/)
    const marks = [
      /<header\b/,
      /<section\b[^>]*id="top"/,
      /<section\b[^>]*id="ai"/,
      /<section\b[^>]*id="ortho"/,
      /<section\b[^>]*id="features"/,
      /<section\b[^>]*id="privacy"/,
      /<section\b[^>]*id="how"/,
      /<footer\b/,
    ]
    const positions = marks.map((re) => html.search(re))
    for (const [i, pos] of positions.entries()) expect(pos, String(marks[i])).toBeGreaterThanOrEqual(0)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    expect(mainSections().map((s) => s.id)).toEqual(['top', 'ai', 'ortho', 'features', 'privacy', 'how'])
    const root = doc.firstElementChild!
    expect(doc.children).toHaveLength(1)
    expect(root.getAttribute('class')).toBe(base.root)
    expect(Array.from(root.children).map((el) => el.tagName.toLowerCase())).toEqual(['header', 'main', 'footer'])
  })

  it('AC-211.2: 섹션 6개는 main 하나 안에 있고, 메뉴 띠는 main 앞·푸터는 main 뒤에 있다', () => {
    expect(html.match(/<main\b/g)).toHaveLength(1)
    const main = html.match(/<main\b[^>]*>([\s\S]*)<\/main>/)
    expect(main).not.toBeNull()
    expect(main![1].match(/<section\b/g)).toHaveLength(6)
    expect(html.match(/<section\b/g)).toHaveLength(6)
    expect(html.search(/<header\b/)).toBeLessThan(html.search(/<main\b/))
    expect(html.search(/<footer\b/)).toBeGreaterThan(html.search(/<\/main>/))
    expect(html.match(/<header\b/g)).toHaveLength(1)
    expect(html.match(/<footer\b/g)).toHaveLength(1)
  })

  it('AC-211.2: canvas 띠(.secCanvas)는 #ai·#privacy 두 섹션뿐이다(#how는 흰 바탕)', () => {
    const banded = Array.from(doc.querySelectorAll('*'))
      .filter((el) => (el.getAttribute('class') ?? '').split(/\s+/).includes(base.secCanvas))
      .map((el) => `${el.tagName.toLowerCase()}#${el.id}`)
    expect(banded).toEqual(['section#ai', 'section#privacy'])
  })

  it('AC-211.2: [구글로 시작하기]는 메뉴·히어로·#how에 하나씩 3개이고 모두 href="/login"에 글자만 있다. [AI 분석 보기]는 하나이고 #ai로 간다', () => {
    const starts = Array.from(doc.querySelectorAll('a')).filter((a) => (a.textContent ?? '').trim() === '구글로 시작하기')
    expect(starts).toHaveLength(3)
    for (const a of starts) {
      expect(a.getAttribute('href')).toBe('/login')
      expect(a.children, '안에 글자만 있다').toHaveLength(0)
    }
    const placeOf = (a: Element) => {
      const part = a.closest('header, section')
      return part ? `${part.tagName.toLowerCase()}${part.id ? `#${part.id}` : ''}` : '(밖)'
    }
    expect(starts.map(placeOf)).toEqual(['header', 'section#top', 'section#how'])
    expect(links.filter((l) => l.text === 'AI 분석 보기')).toEqual([{ href: '#ai', text: 'AI 분석 보기' }])
  })

  it('AC-211.2: 메뉴의 # 링크는 모두 페이지의 id를 가리키고 id는 겹치지 않는다', () => {
    const navLinks = Array.from(doc.querySelectorAll('nav[aria-label="주요 메뉴"] a')).map((a) => a.getAttribute('href') ?? '')
    expect(navLinks).toEqual(['#ai', '#features', '#privacy', '#how'])
    for (const href of links.filter((l) => l.href.startsWith('#')).map((l) => l.href)) expect(ids, href).toContain(href.slice(1))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('AC-211.2: StartSection.tsx·StartSection.module.css가 없다', () => {
    for (const name of ['StartSection.tsx', 'StartSection.module.css']) {
      expect(existsSync(join(ROOT, 'src/components/landing', name)), name).toBe(false)
    }
    expect(readFileSync(join(ROOT, 'src/app/page.tsx'), 'utf8')).not.toMatch(/StartSection/)
  })
})

// ---------- AC-211.3: 빈칸이 없다 ----------

describe('AC-211.3: 페이지 글자에 빈칸이 없다', () => {
  it('AC-211.3: 보이는 글자에 [ … ] 꼴 빈칸이 없고 "서비스 이름"·"이메일 주소"·"[금액]"·"[직원"·"[지난달]"·"[이번 달]"이 없다', () => {
    const visible = doc.textContent ?? ''
    expect(visible.length).toBeGreaterThan(500)
    expect(visible).not.toMatch(/\[[^\]]*\]/)
    for (const blank of ['서비스 이름', '이메일 주소', '[금액]', '[직원', '[지난달]', '[이번 달]']) {
      expect(visible, blank).not.toContain(blank)
      expect(html, blank).not.toContain(blank)
    }
  })

  it('AC-211.3: "예시" 표시가 미리보기("예시 숫자")·AI 리포트("방금 생성 · 예시")·비교표("예시" 줄·"예시 값")·급여 패널("예시")에 있다', () => {
    const section = (id: string) => doc.querySelector(`section#${id}`)!
    const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
    expect(text(section('top'))).toContain('예시 숫자')
    expect(text(section('ai'))).toContain('방금 생성 · 예시')
    const ortho = section('ortho')
    expect(Array.from(ortho.querySelectorAll('tbody th')).map(text), '비교표 "예시" 줄').toContain('예시')
    expect(Array.from(ortho.querySelectorAll('caption')).map(text), '휴대폰 표 "예시 값"').toContain('예시 값')
    const panels = Array.from(section('features').querySelectorAll('p')).filter((p) => text(p).startsWith('10월 급여'))
    expect(panels.map(text), '급여 패널 머리').toEqual(['10월 급여 예시'])
  })

  it('AC-211.3: "Powered by AI"·그라데이션 글자가 없다', () => {
    expect(html).not.toMatch(/powered\s*by\s*ai/i)
    expect(html).not.toMatch(/gradient\(|background-clip:\s*text/i)
  })
})

// ---------- AC-212.3: 상자 안 상자가 없고 섹션마다 맨 바깥 상자는 하나 이하 ----------

// 랜딩 모듈(폴더 전체)과 그 CSS: 네 변 테두리(border: 1px …)를 주는 클래스는 해시 이름으로 바꿔 상자 판단에 더한다(design.md '상자 겹침 시험 도우미')
const LANDING_MODULES: Record<string, Record<string, string>> = {
  'base.module.css': base,
  'SiteHeader.module.css': headStyles,
  'Hero.module.css': heroStyles,
  'AiSection.module.css': aiStyles,
  'OrthoSection.module.css': orthoStyles,
  'FeaturesSection.module.css': featStyles,
  'PrivacySection.module.css': privStyles,
  'HowSection.module.css': howStyles,
  'SiteFooter.module.css': footStyles,
}
// 규칙 { … } 하나마다 선택자 끝 클래스(.a > .b:hover → b)를 모은다. @media 안 규칙도 본다
function fourSideBorderClasses(css: string): string[] {
  const names: string[] = []
  for (const [, head, body] of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/(?:^|[;\s])border\s*:\s*1px\b/.test(body)) continue
    for (const selector of head.split(',')) {
      const last = /\.([a-zA-Z][\w-]*)[^.\s>+~]*$/.exec(selector.trim())
      if (last) names.push(last[1])
    }
  }
  return [...new Set(names)]
}
const LANDING_CSS_DIR = join(ROOT, 'src/components/landing')
const moduleBoxClasses = new Set(
  Object.entries(LANDING_MODULES).flatMap(([file, mod]) =>
    fourSideBorderClasses(readFileSync(join(LANDING_CSS_DIR, file), 'utf8')).map((name) => mod[name]),
  ),
)
const isLandingBox = (el: Element) =>
  isBorderBox(el) ||
  (BOX_TAGS.has(el.tagName.toLowerCase()) && (el.getAttribute('class') ?? '').split(/\s+/).some((c) => moduleBoxClasses.has(c)))
// aria-hidden 밖 상자 가운데 바깥에 다른 상자가 없는 것
function outerBoxes(root: Element): Element[] {
  const found: Element[] = []
  const visit = (el: Element) => {
    if (el.getAttribute('aria-hidden') === 'true') return
    if (isLandingBox(el)) {
      found.push(el)
      return
    }
    for (const child of Array.from(el.children)) visit(child)
  }
  visit(root)
  return found
}

describe('AC-212.3: 페이지 전체 상자 검사', () => {
  it('AC-212.3: 상자 판단에 랜딩 폴더의 모든 모듈을 넣었고, 네 변 테두리 클래스(리포트·급여 패널·흐름)를 찾는다', () => {
    const files = readdirSync(LANDING_CSS_DIR).filter((name) => name.endsWith('.module.css'))
    expect(Object.keys(LANDING_MODULES).sort()).toEqual(files.sort())
    expect(fourSideBorderClasses('.a { border: 1px solid var(--line); } @media (min-width: 768px) { .b > .c:hover { border: 1px solid var(--line); } } .d { border-top: 1px solid var(--line); }')).toEqual(['a', 'c'])
    for (const name of [aiStyles.report, featStyles.panel, privStyles.flow]) expect(moduleBoxClasses.has(name), name).toBe(true)
  })

  it('AC-212.3: 페이지 어디에도 상자 안 상자가 없다(nestedBoxes, aria-hidden 안은 건너뜀)', () => {
    expect(nestedBoxes(doc, isLandingBox)).toEqual([])
  })

  it('AC-212.3: 섹션마다 맨 바깥 상자는 하나 이하다(미리보기·AI 리포트·급여 패널·개인정보 흐름 각 하나)', () => {
    const counts = Object.fromEntries(mainSections().map((s) => [s.id, outerBoxes(s).length]))
    for (const [id, count] of Object.entries(counts)) expect(count, `#${id}`).toBeLessThanOrEqual(1)
    // 검사가 헛돌지 않는다: 미리보기(Tailwind border)와 모듈 상자를 실제로 찾는다
    expect(counts).toEqual({ top: 1, ai: 1, ortho: 0, features: 1, privacy: 1, how: 0 })
    expect(outerBoxes(doc.querySelector('header')!), '메뉴 띠').toEqual([])
    expect(outerBoxes(doc.querySelector('footer')!), '바닥글').toEqual([])
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
    // 그 클래스는 base.module.css의 .root다(CSS 쪽 값은 src/components/landing/rules.test.ts의 AC-212.2가 본다)
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
    expect(h1s[0][1], '태그 없는 글자').toBe('숫자로 보는 우리 의원')
  })
})

describe('AC-002.1: [구글로 시작하기]', () => {
  it('AC-002.1: 메뉴·히어로·#how에 하나씩 모두 3개, 셋 다 href="/login"', () => {
    const starts = links.filter((l) => l.text === '구글로 시작하기')
    expect(starts).toHaveLength(3)
    for (const s of starts) expect(s.href).toBe('/login')
    const header = html.match(/<header\b[\s\S]*?<\/header>/)![0]
    const hero = HERO
    const how = html.match(/<section\b[^>]*id="how"[\s\S]*?<\/section>/)![0]
    for (const part of [header, hero, how]) expect(part).toMatch(/<a\b[^>]*href="\/login"[^>]*>구글로 시작하기<\/a>/)
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
  it('AC-005.2: 예시 숫자 영역에 "예시 숫자"(히어로)·"방금 생성 · 예시"(AI 리포트) 표시가 있다', () => {
    const ai = html.match(/<section\b[^>]*id="ai"[\s\S]*?(?=<section\b[^>]*id="ortho")/)![0]
    expect(textOf(HERO)).toContain('예시 숫자')
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

// ---------- AC-105.8: 랜딩 TSX의 색 글자·inline style 범위 ----------

const LANDING_DIR = join(ROOT, 'src/components/landing')
const landingTsx = readdirSync(LANDING_DIR)
  .filter((name) => name.endsWith('.tsx') && !/\.test\.tsx$/.test(name))
  .map((name) => ({ name, body: readFileSync(join(LANDING_DIR, name), 'utf8') }))
// '#' + 16진수 3·4·6·8자리 색 글자 (#features·#ai 같은 # 링크는 뒤에 글자가 이어져 걸리지 않는다)
const HEX_COLOR = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])/i
// 로고 마크 svg(고정 두 색). 크기·class는 여는 태그에만 있으므로 그 뒤 그림이 LogoMark와 같은 svg를 찾는다.
// 메뉴(24)·히어로 미리보기(18, components/preview가 부름)·바닥글(18)에 하나씩 있다
const LOGO_BODY = renderToStaticMarkup(<LogoMark size={1} />).replace(/^<svg\b[^>]*>/, '')
const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const LOGO_SVG = new RegExp(`<svg\\b[^>]*>${escapeRe(LOGO_BODY)}`, 'g')
const logoSizes = (markup: string) => [...markup.matchAll(LOGO_SVG)].map((m) => Number(/\swidth="(\d+)"/.exec(m[0])?.[1]))
// 로고 마크 출력을 뺀 페이지 마크업
const withoutLogos = html.replace(LOGO_SVG, '')

describe('AC-105.8: 랜딩 TSX의 색과 inline style', () => {
  it('AC-105.8: 랜딩 폴더의 *.tsx(시험 제외)에 색 글자(# + 16진수)가 없다', () => {
    expect(landingTsx.map((f) => f.name)).toEqual(
      expect.arrayContaining(['PrivacySection.tsx', 'HowSection.tsx', 'SiteFooter.tsx']),
    )
    for (const { name, body } of landingTsx) expect(body, name).not.toMatch(HEX_COLOR)
  })

  it('AC-105.8: 로고는 <LogoMark />를 부르기만 한다(메뉴 24 한 번 · 18은 바닥글·미리보기에 두 번, 미리보기는 components/preview 소스), 그 밖의 페이지 마크업에는 색 글자가 없다', () => {
    // 페이지 순서: 메뉴 → 히어로 미리보기 → 바닥글
    expect(logoSizes(html)).toEqual([24, 18, 18])
    expect(logoSizes(HERO), '히어로의 로고는 미리보기 안 하나').toEqual([18])
    expect(logoSizes(renderToStaticMarkup(<DashboardPreview />))).toEqual([18])
    // 랜딩 TSX가 부르는 크기는 메뉴 24·바닥글 18뿐이다. 미리보기의 18은 components/preview/DashboardPreview.tsx가 부른다
    const calls = landingTsx.flatMap((f) => [...f.body.matchAll(/<LogoMark\b[^>]*?\bsize=\{(\d+)\}/g)].map((m) => `${f.name} ${m[1]}`))
    expect(calls.sort()).toEqual(['SiteFooter.tsx 18', 'SiteHeader.tsx 24'])
    expect(readFileSync(join(ROOT, 'src/components/preview/DashboardPreview.tsx'), 'utf8')).toMatch(/<LogoMark\b[^>]*?\bsize=\{18\}/)
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

  it('AC-212.4: 랜딩 TSX(시험 제외)에 inline style이 하나도 없다(빼 두는 파일 없음). 미리보기·차트의 % 값은 components/charts 안에 있다', () => {
    expect(landingTsx.length, '랜딩 TSX를 실제로 읽었다').toBeGreaterThan(5)
    const withStyle = landingTsx.filter((f) => /\bstyle=\{/.test(f.body)).map((f) => f.name)
    expect(withStyle).toEqual([])
    // 히어로의 inline style은 모두 미리보기(차트 부품) 안에서 온다
    const preview = renderToStaticMarkup(<DashboardPreview />)
    expect(HERO).toContain(preview)
    expect(HERO.replace(preview, '')).not.toMatch(/\sstyle="/)
    // 페이지에 남는 inline style은 % 값의 높이·폭·위치 하나씩뿐이다
    for (const style of [...html.matchAll(/\sstyle="([^"]*)"/g)].map((m) => m[1])) {
      expect(style).toMatch(/^(height|width|bottom|left):\d+(\.\d+)?%$/)
    }
  })
})

// ---------- AC-208.3: 숫자 순환이 없다 ----------

describe('AC-208.3: 히어로 숫자 순환이 없다', () => {
  it('AC-208.3: heroFrames·HeroChart·PromiseBand 파일(시험·CSS 포함)이 없다', () => {
    for (const name of [
      'heroFrames.ts',
      'heroFrames.test.ts',
      'HeroChart.tsx',
      'HeroChart.module.css',
      'HeroChart.test.tsx',
      'PromiseBand.tsx',
      'PromiseBand.module.css',
    ]) {
      expect(existsSync(join(LANDING_DIR, name)), name).toBe(false)
    }
  })

  it("AC-208.3: 시험 파일 밖 src/components/landing/에 'use client'·useEffect·useState·setInterval·setTimeout·requestAnimationFrame이 없다", () => {
    const sources = readdirSync(LANDING_DIR).filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
    expect(sources).toEqual(expect.arrayContaining(['Hero.tsx', 'SiteHeader.tsx', 'links.ts']))
    for (const name of sources) {
      expect(readFileSync(join(LANDING_DIR, name), 'utf8'), name).not.toMatch(
        /['"]use client['"]|\b(?:useEffect|useState|setInterval|setTimeout|requestAnimationFrame)\b/,
      )
    }
  })
})
