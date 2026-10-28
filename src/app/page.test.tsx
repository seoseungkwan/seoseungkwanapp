import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
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
const imgs = [...html.matchAll(/<img\b([^>]*?)\/?>/g)].map((m) =>
  Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]])),
)

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
      '주사 치료 수와 F/U 기록',
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

describe('AC-006.1: 그림', () => {
  it('AC-006.1: img는 6장이고 승인본 6개 경로로 나온다', () => {
    expect(imgs).toHaveLength(6)
    expect(imgs.map((img) => img.src).sort()).toEqual(
      [
        '/landing/feature-payroll.jpg',
        '/landing/feature-stats.jpg',
        '/landing/tile-injection.jpg',
        '/landing/tile-noncovered.jpg',
        '/landing/tile-physio.jpg',
        '/landing/tile-report.jpg',
      ].sort(),
    )
  })

  it('AC-006.1: 모두 빈칸 아닌 alt가 있고, http로 시작하는 바깥 주소 그림이 없다', () => {
    for (const img of imgs) {
      expect(img.alt?.trim().length, img.src).toBeGreaterThan(0)
      expect(img.src).not.toMatch(/^https?:/i)
    }
    expect(html).not.toMatch(/\ssrc(set)?="https?:/i)
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
