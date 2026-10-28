import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import AiSection from './AiSection'
import FeaturesSection from './FeaturesSection'
import { LANDING_IMAGES } from './images'
import OrthoSection from './OrthoSection'

const ai = renderToStaticMarkup(<AiSection />)
const ortho = renderToStaticMarkup(<OrthoSection />)
const features = renderToStaticMarkup(<FeaturesSection />)
const all = ai + ortho + features

// 태그를 빈칸으로 바꾸고 빈칸을 하나로 모은 글자 (React가 바꾼 &#x27; 같은 글자는 되돌린다)
const ENTITIES: Record<string, string> = { '&#x27;': "'", '&quot;': '"', '&lt;': '<', '&gt;': '>', '&amp;': '&' }
const textOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&quot;|&lt;|&gt;|&amp;/g, (e) => ENTITIES[e])
    .replace(/\s+/g, ' ')
    .trim()
// <img> 태그마다 속성 묶음
const imgsOf = (html: string) =>
  [...html.matchAll(/<img\b([^>]*?)\/?>/g)].map((m) =>
    Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]])),
  )

describe('AC-001.1: 섹션 id', () => {
  it('AC-001.1: 세 섹션이 각각 section#ai · section#ortho · section#features다', () => {
    expect(ai).toMatch(/^<section\b[^>]*id="ai"/)
    expect(ortho).toMatch(/^<section\b[^>]*id="ortho"/)
    expect(features).toMatch(/^<section\b[^>]*id="features"/)
  })
})

describe('AC-005.1: 정한 문구', () => {
  it('AC-005.1: 기능 01 설명에 "EMR"이 있다', () => {
    expect(textOf(features)).toContain('EMR에서 내려받은 통계 파일을 올리면')
  })

  it('AC-005.1: 정형외과 타일 4개의 설명 문구', () => {
    const text = textOf(ortho)
    for (const line of ['주사 치료 수와 F/U 기록', '물리치료 내원 환자 수', '비급여 치료 내역', '한 장으로 받는 월간 보고']) {
      expect(text).toContain(line)
    }
    const captions = [...ortho.matchAll(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/g)].map((m) => textOf(m[1]))
    expect(captions).toEqual([
      '주사 주사 치료 수와 F/U 기록',
      '물리치료 물리치료 내원 환자 수',
      '비급여 비급여 치료 내역',
      '월말 보고 한 장으로 받는 월간 보고',
    ])
  })
})

describe('AC-005.2: 예시 표시와 빈칸', () => {
  it('AC-005.2: AI 리포트 카드에 "방금 생성 · 예시" 표시가 있다', () => {
    const text = textOf(ai)
    expect(text).toContain('10월 AI 리포트')
    expect(text).toContain('방금 생성 · 예시')
  })

  it('AC-005.2: 모르는 값은 [ ] 빈칸 그대로다', () => {
    expect(textOf(ai)).toContain('근거 · 신환 [지난달]명 → [이번 달]명')
    expect(textOf(ai)).toContain("근거 · 처방 그룹 '도수' [지난달]건 → [이번 달]건")
    const text = textOf(features)
    for (const name of ['[직원 A]', '[직원 B]', '[직원 C]', '[직원 D]']) expect(text).toContain(name)
    expect(text.match(/\[금액\]/g)).toHaveLength(8)
  })
})

describe('AC-006.1: 그림', () => {
  it('AC-006.1: 정형외과 4장 + 기능 2장, AI 섹션은 0장', () => {
    expect(imgsOf(ortho)).toHaveLength(4)
    expect(imgsOf(features)).toHaveLength(2)
    expect(imgsOf(ai)).toHaveLength(0)
  })

  it('AC-006.1: 6장 모두 LANDING_IMAGES의 src·alt·width·height 그대로, /landing/ 경로(최적화 주소 아님)', () => {
    const imgs = imgsOf(ortho + features)
    const expected = [
      LANDING_IMAGES.tileInjection,
      LANDING_IMAGES.tilePhysio,
      LANDING_IMAGES.tileNoncovered,
      LANDING_IMAGES.tileReport,
      LANDING_IMAGES.featureStats,
      LANDING_IMAGES.featurePayroll,
    ]
    expect(imgs.map((img) => img.src)).toEqual(expected.map((e) => e.src))
    imgs.forEach((img, i) => {
      expect(img.alt).toBe(expected[i].alt)
      expect(img.alt.length).toBeGreaterThan(0)
      expect(img.width).toBe(String(expected[i].width))
      expect(img.height).toBe(String(expected[i].height))
      expect(img.src).toMatch(/^\/landing\/[\w-]+\.jpg$/)
      expect(img.srcset).toBeUndefined()
    })
  })

  it('AC-006.1: http로 시작하는 바깥 주소 그림이 없다', () => {
    for (const img of imgsOf(all)) expect(img.src).not.toMatch(/^https?:/)
    expect(all).not.toMatch(/src="https?:/)
  })
})

describe('AC-007.1: 아무것도 받지 않는다', () => {
  it('AC-007.1: form·input·textarea·button·label이 없다', () => {
    expect(all).not.toMatch(/<(form|input|textarea|button|label)\b/)
    expect(all).not.toMatch(/contenteditable|tabindex|role="button"/i)
  })

  it('AC-007.1: 질문 칩·질문 칸·보내기는 그림처럼 보이기만 한다(span·div)', () => {
    for (const chip of ['재방문율이 낮은 처방은?', '인건비율 괜찮아?']) {
      expect(ai).toMatch(new RegExp(`<span\\b[^>]*>${chip.replace(/\?/g, '\\?')}</span>`))
    }
    expect(textOf(ai)).toContain('AI에게 물어보기')
    expect(ai).not.toMatch(/placeholder=/)
  })

  it('AC-007.1: "통계 파일을 여기에 놓기"는 받는 칸이 아니다(div 글자)', () => {
    expect(features).toMatch(/<div\b[^>]*>(<svg\b[\s\S]*?<\/svg>)?통계 파일을 여기에 놓기<\/div>/)
  })
})

describe('AC-008.1: svg는 꾸밈', () => {
  it('AC-008.1: 세 섹션의 svg가 모두 aria-hidden="true"다', () => {
    for (const html of [ai, features]) {
      const svgs = html.match(/<svg\b[^>]*>/g) ?? []
      expect(svgs.length).toBeGreaterThan(0)
      for (const svg of svgs) expect(svg).toContain('aria-hidden="true"')
    }
    for (const svg of ortho.match(/<svg\b[^>]*>/g) ?? []) expect(svg).toContain('aria-hidden="true"')
  })
})
