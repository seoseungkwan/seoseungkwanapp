import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import HowSection from './HowSection'
import PrivacySection from './PrivacySection'
import SiteFooter from './SiteFooter'
import StartSection from './StartSection'

const privacy = renderToStaticMarkup(<PrivacySection />)
const how = renderToStaticMarkup(<HowSection />)
const start = renderToStaticMarkup(<StartSection />)
const footer = renderToStaticMarkup(<SiteFooter />)
const all = privacy + how + start + footer

// 태그를 빈칸으로 바꾸고 빈칸을 하나로 모은 글자 (React가 바꾼 &#x27; 같은 글자는 되돌린다)
const ENTITIES: Record<string, string> = { '&#x27;': "'", '&quot;': '"', '&lt;': '<', '&gt;': '>', '&amp;': '&' }
const textOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&quot;|&lt;|&gt;|&amp;/g, (e) => ENTITIES[e])
    .replace(/\s+/g, ' ')
    .trim()
// <a> 링크 목록: href와 글자
const linksOf = (html: string) =>
  [...html.matchAll(/<a\b[^>]*?href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => ({ href: m[1], text: textOf(m[2]) }))

describe('AC-001.1: 섹션과 푸터', () => {
  it('AC-001.1: section#privacy · section#how · section#start · footer다', () => {
    expect(privacy).toMatch(/^<section\b[^>]*id="privacy"/)
    expect(how).toMatch(/^<section\b[^>]*id="how"/)
    expect(start).toMatch(/^<section\b[^>]*id="start"/)
    expect(footer).toMatch(/^<footer\b/)
  })
})

describe('AC-005.1: 개인정보 문구', () => {
  it('AC-005.1: 개인정보 섹션 제목은 "환자 개인정보는 절대 병원 PC 밖으로 나가지 않습니다"', () => {
    const h2 = privacy.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/)
    expect(h2).not.toBeNull()
    expect(textOf(h2![1])).toBe('환자 개인정보는 절대 병원 PC 밖으로 나가지 않습니다')
    expect(h2![1]).toMatch(/^환자 개인정보는<br\/>/)
  })

  it('AC-005.1: 큰 숫자 "0"과 단위 "건"', () => {
    expect(privacy).toMatch(/>0<span\b[^>]*>건<\/span>/)
    expect(textOf(privacy)).toContain('서버와 AI로 보내는 환자 개인정보')
  })

  it('AC-005.1: 흐름 카드 제목 "병원 PC · 브라우저"와 멈추는 항목', () => {
    const text = textOf(privacy)
    expect(text).toContain('병원 PC · 브라우저')
    expect(text).toContain('여기서 멈춤')
    expect(text).toContain('환자 이름 · 주민번호 · 차트번호 · 파일 이름')
  })
})

describe('AC-002.1: [구글로 시작하기]', () => {
  it('AC-002.1: 시작하기 섹션에 하나 있고 /login으로 간다(목업의 #top 아님)', () => {
    expect(linksOf(start)).toEqual([{ href: '/login', text: '구글로 시작하기' }])
  })

  it('AC-002.1: 시작 3단계의 "구글로 시작하기"는 링크가 아닌 단계 제목이다', () => {
    expect(linksOf(how)).toEqual([])
    expect(how).toMatch(/<h3\b[^>]*>구글로 시작하기<\/h3>/)
    expect(linksOf(privacy + footer)).toEqual([])
  })
})

describe('AC-005.2: 빈칸', () => {
  it('AC-005.2: 푸터의 서비스 이름은 [서비스 이름], 문의 메일은 [이메일 주소]', () => {
    const text = textOf(footer)
    expect(text).toContain('[서비스 이름]')
    expect(text).toContain('문의 [이메일 주소]')
  })
})

describe('AC-001.1: 시작 3단계', () => {
  it('AC-001.1: 시작 3단계는 ol 안의 01·02·03이다', () => {
    const items = [...how.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((m) => textOf(m[1]))
    expect(how).toMatch(/<ol\b/)
    expect(items).toHaveLength(3)
    expect(items[0]).toMatch(/^01 구글로 시작하기/)
    expect(items[1]).toMatch(/^02 가입 신청/)
    expect(items[2]).toMatch(/^03 승인 후 바로 사용/)
  })
})

describe('AC-007.1: 아무것도 받지 않는다', () => {
  it('AC-007.1: form·input·textarea·button이 없다', () => {
    expect(all).not.toMatch(/<(form|input|textarea|button)\b/)
  })
})

describe('AC-008.1: svg는 꾸밈', () => {
  it('AC-008.1: 개인정보·시작 3단계·시작하기·푸터의 svg가 모두 aria-hidden="true"다', () => {
    const svgs = all.match(/<svg\b[^>]*>/g) ?? []
    expect(svgs.length).toBeGreaterThan(0)
    for (const svg of svgs) expect(svg).toContain('aria-hidden="true"')
  })
})
