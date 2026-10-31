import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Icon } from '@/components/common/Icon'
import { LogoMark } from '@/components/common/LogoMark'
import base from './base.module.css'
import HowSection from './HowSection'
import howStyles from './HowSection.module.css'
import PrivacySection from './PrivacySection'
import privStyles from './PrivacySection.module.css'
import SiteFooter from './SiteFooter'
import footStyles from './SiteFooter.module.css'

const privacy = renderToStaticMarkup(<PrivacySection />)
const how = renderToStaticMarkup(<HowSection />)
const footer = renderToStaticMarkup(<SiteFooter />)
const all = privacy + how + footer

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
  it('AC-001.1: section#privacy · section#how · footer다', () => {
    expect(privacy).toMatch(/^<section\b[^>]*id="privacy"/)
    expect(how).toMatch(/^<section\b[^>]*id="how"/)
    expect(footer).toMatch(/^<footer\b/)
  })
})

describe('AC-005.1: 개인정보 문구', () => {
  it('AC-005.1: 개인정보 섹션 제목은 "환자 개인정보는 절대 병원 PC 밖으로 나가지 않습니다"', () => {
    const h2 = privacy.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/)
    expect(h2).not.toBeNull()
    expect(textOf(h2![1])).toBe('환자 개인정보는 절대 병원 PC 밖으로 나가지 않습니다')
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
  it('AC-002.1: #how에 하나 있고 /login으로 간다', () => {
    expect(linksOf(how)).toEqual([{ href: '/login', text: '구글로 시작하기' }])
  })

  it('AC-002.1: #how의 링크는 [구글로 시작하기](/login) 하나이고, 단계 h3 "구글로 시작하기"는 링크가 아니다', () => {
    expect(linksOf(how)).toEqual([{ href: '/login', text: '구글로 시작하기' }])
    const h3 = [...how.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/g)].map((m) => m[1])
    expect(h3, '단계 h3 글자에 태그가 없다(링크가 아니다)').toContain('구글로 시작하기')
    expect(how).not.toMatch(/<a\b[^>]*>[^<]*<h3\b/)
    expect(how).not.toMatch(/<h3\b[^>]*><a\b/)
    expect(linksOf(privacy + footer)).toEqual([])
  })
})

describe('AC-001.1: 시작 3단계', () => {
  it('AC-001.1: 시작 3단계는 ol 안의 1·2·3이다', () => {
    const items = [...how.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((m) => textOf(m[1]))
    expect(how).toMatch(/<ol\b/)
    expect(items).toHaveLength(3)
    expect(items[0]).toMatch(/^1 구글로 시작하기/)
    expect(items[1]).toMatch(/^2 가입 신청/)
    expect(items[2]).toMatch(/^3 승인 후 바로 사용/)
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

// ---------- 개인정보 · 시작 3단계 · 푸터의 짜임 (specs/b2b-redesign AC-210.2 · AC-211.1 · AC-207.3, 시안 #privacy · #how · footer) ----------

// 여는 태그의 class 목록
const classesOf = (openTag: string | undefined) =>
  (/\bclass="([^"]*)"/.exec(openTag ?? '')?.[1] ?? '').split(/\s+/).filter(Boolean)
// Vitest의 CSS Module 이름은 `_이름_파일해시6자`다(없는 이름에도 돌려준다) → 붙인 클래스마다 그 파일 CSS에 `.이름`이 정의돼 있는지 본다.
// 하나도 못 봤다면(이름 꼴이 바뀌었거나 클래스가 없음) 시험이 헛돈 것이니 checked도 함께 돌려준다 (middle.test.tsx와 같은 방식)
const LANDING_DIR = join(process.cwd(), 'src/components/landing')
const cssOf = (name: string) => readFileSync(join(LANDING_DIR, name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
function classCheck(html: string, modules: Array<[sample: string, file: string]>): { checked: number; missing: string[] } {
  const files = new Map(modules.map(([sample, file]) => [sample.slice(-6), [file, cssOf(file)] as const]))
  const missing: string[] = []
  let checked = 0
  for (const cls of new Set([...html.matchAll(/\bclass="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/).filter(Boolean)))) {
    const m = /^_(\w+)_([0-9a-f]{6})$/.exec(cls)
    const file = m && files.get(m[2])
    if (!m || !file) continue
    checked++
    if (!new RegExp(`\\.${m[1]}(?![\\w-])`).test(file[1])) missing.push(`${file[0]} .${m[1]}`)
  }
  return { checked, missing }
}

// ---------- 개인정보 섹션의 짜임 (specs/b2b-redesign AC-210.2, 시안 screens.mjs landingPC·landingPhone #privacy) ----------

// 여는 태그 하나: 태그 이름 · aria-hidden · class 목록 (middle.test.tsx와 같은 방식)
const openTags = (html: string) =>
  [...html.matchAll(/<([a-z][\w-]*)\b([^>]*)>/g)].map((m) => ({
    tag: m[1],
    hidden: /\baria-hidden="true"/.test(m[2]),
    classes: classesOf(m[0]),
  }))
// 모듈 CSS에서 네 변 테두리(border: 1px …)를 주는 클래스 이름
const fourSideBorderClasses = (css: string) =>
  [...css.matchAll(/\.(\w+)\s*\{[^{}]*?(?:^|[;{\s])border\s*:\s*1px\b/gm)].map((m) => m[1])
// 상자가 될 수 있는 태그(src/testing/boxes.ts BOX_TAGS와 같다)
const BOX_TAGS = new Set(['div', 'section', 'article', 'ul', 'ol', 'li', 'dl', 'table', 'aside', 'form'])

// section#privacy(canvas 띠) > .wrap > .grid.top(.text(h2 + p) + .zero(p 0건 + p 설명)) + .flow + dl(약속 4개)
const PRIV_SHAPE =
  /^(<section\b[^>]*>)(<div\b[^>]*>)(<div\b[^>]*>)(<div\b[^>]*>)(<h2\b[^>]*>)([^<]*)<\/h2>(<p\b[^>]*>)([^<]*)<\/p><\/div>(<div\b[^>]*>)(<p\b[^>]*>)([\s\S]*?)<\/p>(<p\b[^>]*>)([^<]*)<\/p><\/div><\/div>(<div\b[^>]*>)([\s\S]*)<\/div>(<dl\b[^>]*>)([\s\S]*?)<\/dl><\/div><\/section>$/
// 흐름 칸: .node > h3(svg + 글) + 설명 p (+ 첫 칸만 멈춤 줄 p(svg + b + span))
const NODE_SRC =
  '<div\\b[^>]*><h3\\b[^>]*><svg\\b[^>]*>[\\s\\S]*?</svg>[^<]*</h3><p\\b[^>]*>[^<]*</p>' +
  '(?:<p\\b[^>]*><svg\\b[^>]*>[\\s\\S]*?</svg><b\\b[^>]*>[^<]*</b><span\\b[^>]*>[^<]*</span></p>)?</div>'
// 연결: .edge(aria-hidden) > 글 span + 화살표 svg
const EDGE_SRC = '<div\\b[^>]*><span\\b[^>]*>[^<]*</span><svg\\b[^>]*>[\\s\\S]*?</svg></div>'
const FLOW_SHAPE = new RegExp(`^(${NODE_SRC})(${EDGE_SRC})(${NODE_SRC})(${EDGE_SRC})(${NODE_SRC})$`)
const NODE_PARTS = new RegExp(
  '^(<div\\b[^>]*>)(<h3\\b[^>]*>)(<svg\\b[^>]*>[\\s\\S]*?</svg>)([^<]*)</h3>(<p\\b[^>]*>)([^<]*)</p>' +
    '(?:(<p\\b[^>]*>)(<svg\\b[^>]*>[\\s\\S]*?</svg>)(<b\\b[^>]*>)([^<]*)</b>(<span\\b[^>]*>)([^<]*)</span></p>)?</div>$',
)
const EDGE_PARTS = /^(<div\b[^>]*>)(<span\b[^>]*>)([^<]*)<\/span>(<svg\b[^>]*>[\s\S]*?<\/svg>)<\/div>$/
// 약속 하나: div(dt + dd), 안에 태그 없음
const RULE = /(<div\b[^>]*>)(<dt\b[^>]*>)([^<]*)<\/dt>(<dd\b[^>]*>)([^<]*)<\/dd><\/div>/g

describe('AC-210.2: 개인정보 섹션의 짜임', () => {
  const parts = privacy.match(PRIV_SHAPE)
  const [, section, wrap, top, text, h2, h2In, lead, leadIn, zero, zeroNum, zeroNumIn, zeroCap, zeroCapIn, flow, flowIn, dl, dlIn] =
    parts ?? []
  const flowParts = (flowIn ?? '').match(FLOW_SHAPE)
  const [, node1, edge1, node2, edge2, node3] = flowParts ?? []
  const nodes = [node1, node2, node3].map((n) => (n ?? '').match(NODE_PARTS))
  const edges = [edge1, edge2].map((e) => (e ?? '').match(EDGE_PARTS))
  const rules = [...(dlIn ?? '').matchAll(RULE)]

  it('AC-210.2: section#privacy(.sec·.secCanvas 띠) > .wrap 안이 윗부분(.grid .top: .text(h2 + p) + .zero) → 흐름(.flow) → 약속 dl(.rules·.pcOnly) 순서다', () => {
    expect(parts, 'section > .wrap > .top(.text + .zero) + .flow + dl').not.toBeNull()
    expect(section).toMatch(/\bid="privacy"/)
    expect(classesOf(section)).toEqual(expect.arrayContaining([base.sec, base.secCanvas]))
    expect(classesOf(wrap)).toEqual([base.wrap])
    expect(classesOf(top)).toEqual(expect.arrayContaining([base.grid, privStyles.top]))
    expect(classesOf(text)).toContain(privStyles.text)
    expect(classesOf(zero)).toContain(privStyles.zero)
    expect(classesOf(flow)).toContain(privStyles.flow)
    expect(classesOf(dl), '약속은 768px 이상만').toEqual(expect.arrayContaining([privStyles.rules, base.pcOnly]))
  })

  it('AC-210.2: h2는 .tHeading "환자 개인정보는 절대 병원 PC 밖으로 나가지 않습니다"(태그 없음)이고 안내 p(.lead)는 지금 문구다', () => {
    expect(classesOf(h2)).toContain(base.tHeading)
    expect(h2In).toBe('환자 개인정보는 절대 병원 PC 밖으로 나가지 않습니다')
    expect(classesOf(lead)).toContain(privStyles.lead)
    expect(leadIn).toBe('환자 이름·주민번호·차트번호는 서버에도, AI에도 가지 않습니다. 처음부터 그렇게 설계했습니다.')
  })

  it('AC-210.2: 0건 덩어리는 <p class="tDisplay zeroNum">0<span class="unit">건</span></p> + "서버와 AI로 보내는 환자 개인정보"(.tSmall .zeroCaption, 태그 없음)다', () => {
    expect(classesOf(zeroNum)).toEqual(expect.arrayContaining([base.tDisplay, privStyles.zeroNum]))
    expect(zeroNumIn).toBe(`0<span class="${privStyles.unit}">건</span>`)
    expect(classesOf(zeroCap)).toEqual(expect.arrayContaining([base.tSmall, privStyles.zeroCaption]))
    expect(zeroCapIn).toBe('서버와 AI로 보내는 환자 개인정보')
  })

  it('AC-210.2: 흐름은 칸 3개(병원 PC · 브라우저 → 서버 → AI 분석) 사이에 연결 2개가 끼인 순서이고, 칸 h3(.tSubtitle .nodeTitle)는 16px 아이콘(.nodeIcon) + 이름, 설명 p(.nodeDesc·.pcOnly)는 지금 문구다', () => {
    expect(flowParts, '.node · .edge · .node · .edge · .node').not.toBeNull()
    for (const [i, n] of nodes.entries()) expect(n, `칸 ${i + 1}`).not.toBeNull()
    expect(nodes.map((n) => n?.[4])).toEqual(['병원 PC · 브라우저', '서버', 'AI 분석'])
    expect(nodes.map((n) => n?.[6])).toEqual([
      '환자 파일을 여기서만 열고 계산합니다.',
      '통계·매출 합계만 저장합니다. 원본 파일은 올라가지 않습니다.',
      '서버가 꺼낸 합계 숫자로만 리포트를 씁니다.',
    ])
    const icons = ['monitor', 'server', 'doc'] as const
    nodes.forEach((n, i) => {
      const [, node, h3, svg, , desc] = n ?? []
      expect(classesOf(node)).toContain(privStyles.node)
      expect(classesOf(h3)).toEqual(expect.arrayContaining([base.tSubtitle, privStyles.nodeTitle]))
      expect(svg).toBe(renderToStaticMarkup(<Icon name={icons[i]} className={privStyles.nodeIcon} />))
      expect(classesOf(desc)).toEqual(expect.arrayContaining([privStyles.nodeDesc, base.pcOnly]))
    })
  })

  it('AC-210.2: 첫 칸에만 멈춤 줄 p(.stop)가 있다 — 멈춤 아이콘 14px(색은 줄 글자색) + "여기서 멈춤"(b .stopTitle) + "환자 이름 · 주민번호 · 차트번호 · 파일 이름"(.stopItems)', () => {
    const [, , , , , , , stop, stopSvg, stopTitle, stopTitleIn, stopItems, stopItemsIn] = nodes[0] ?? []
    expect(classesOf(stop)).toContain(privStyles.stop)
    expect(stopSvg).toBe(renderToStaticMarkup(<Icon name="stop" size={14} />))
    expect(classesOf(stopTitle)).toContain(privStyles.stopTitle)
    expect(stopTitleIn).toBe('여기서 멈춤')
    expect(classesOf(stopItems)).toContain(privStyles.stopItems)
    expect(stopItemsIn).toBe('환자 이름 · 주민번호 · 차트번호 · 파일 이름')
    expect(nodes[1]?.[7], '서버 칸에는 멈춤 줄이 없다').toBeUndefined()
    expect(nodes[2]?.[7], 'AI 분석 칸에는 멈춤 줄이 없다').toBeUndefined()
  })

  it('AC-210.2: 연결 2개는 aria-hidden .edge > 글(.tCaption .edgeLabel) "합계 숫자만" / "집계만" + 화살표 svg(.edgeArrow) 하나다', () => {
    for (const [i, e] of edges.entries()) expect(e, `연결 ${i + 1}`).not.toBeNull()
    expect(edges.map((e) => e?.[3])).toEqual(['합계 숫자만', '집계만'])
    for (const e of edges) {
      const [, edge, label, , svg] = e ?? []
      expect(edge).toMatch(/\baria-hidden="true"/)
      expect(classesOf(edge)).toContain(privStyles.edge)
      expect(classesOf(label)).toEqual(expect.arrayContaining([base.tCaption, privStyles.edgeLabel]))
      expect(svg).toBe(renderToStaticMarkup(<Icon name="arrow" className={privStyles.edgeArrow} />))
    }
  })

  it('AC-210.2: 약속 <dl>은 div(.rule) 4개 — dt(.ruleTitle) + dd(.ruleDesc)이고 지금 문구다(줄바꿈 태그·nowrap span 없음)', () => {
    expect(rules).toHaveLength(4)
    expect((dlIn ?? '').replace(RULE, ''), 'div(dt + dd) 밖의 다른 원소가 없다').toBe('')
    expect(rules.map((m) => m[3])).toEqual([
      '필요한 칸만 읽습니다',
      '주민번호가 보이면 멈춥니다',
      'AI에는 합계 숫자만',
      '승인한 사람만, 공용 PC도 안심',
    ])
    expect(rules.map((m) => textOf(m[5]))).toEqual([
      '계산에 쓰는 칸을 정해 두고 그 칸만 읽습니다. 차트번호는 계산하는 동안 메모리 안에서만 씁니다.',
      "'-' 없이 붙여 쓴 13자리까지 잡아서, 섞여 있으면 계산하지 않고 알려 줍니다.",
      '통계·매출 합계와 인건비 총액만 보냅니다. 직원 이름·개인별 급여도 보내지 않습니다.',
      '구글 로그인 뒤 관리자가 승인한 계정만 들어옵니다. 30분 동안 움직임이 없으면 자동으로 로그아웃합니다.',
    ])
    for (const [, row, dt, , dd] of rules) {
      expect(classesOf(row)).toContain(privStyles.rule)
      expect(classesOf(dt)).toContain(privStyles.ruleTitle)
      expect(classesOf(dd)).toContain(privStyles.ruleDesc)
    }
  })

  it('AC-210.2: "PRIVACY FIRST"·방패·줄바꿈 태그·nowrap span·옛 카드·색 글자·inline style이 없고 svg는 칸 아이콘 3 + 멈춤 1 + 화살표 2개다', () => {
    expect(textOf(privacy)).not.toMatch(/PRIVACY FIRST/i)
    expect(textOf(privacy), '영문 대문자 소제목이 없다').not.toMatch(/[A-Z]{3,}/)
    expect(privacy).not.toContain('M11 2l7 3v5')
    expect(privacy).not.toMatch(/<(br|ul|li|article|figure)\b/)
    const allClasses = [...privacy.matchAll(/\bclass="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/))
    for (const old of [base.card, base.nowrap, base.items, base.item, base.itemsFour, base.tH2, base.tH3, base.tLead, base.tBody, base.stack, base.head, base.chip]) {
      expect(allClasses).not.toContain(old)
    }
    expect(privacy.match(/<svg\b/g) ?? []).toHaveLength(6)
    expect(privacy).not.toMatch(/="#[0-9a-f]{3,8}"/i)
    expect(privacy).not.toMatch(/\bstyle="/)
  })

  it('AC-210.2: 상자는 흐름 하나다(두 겹 상자 없음) — 네 변 테두리 클래스는 .flow 하나이고 마크업에서 div 하나에만 붙는다', () => {
    expect(fourSideBorderClasses(cssOf('PrivacySection.module.css'))).toEqual(['flow'])
    const bordered = openTags(privacy).filter((t) => t.classes.includes(privStyles.flow))
    expect(bordered.map((t) => `${t.tag}${t.hidden ? '[aria-hidden]' : ''}`)).toEqual(['div'])
    const baseBoxes = openTags(privacy).filter((t) => BOX_TAGS.has(t.tag) && t.classes.includes(base.card))
    expect(baseBoxes).toEqual([])
  })

  it('AC-210.2: 개인정보 섹션에 붙은 클래스가 모두 base.module.css·PrivacySection.module.css에 정의돼 있다', () => {
    const { checked, missing } = classCheck(privacy, [
      [base.wrap, 'base.module.css'],
      [privStyles.flow, 'PrivacySection.module.css'],
    ])
    expect(checked, '본 클래스 수').toBeGreaterThan(0)
    expect(missing).toEqual([])
  })
})

// ---------- 시작 3단계의 짜임 (specs/b2b-redesign AC-211.1, 시안 screens.mjs landingPC·landingPhone #how) ----------

// section#how(.sec, 흰 바탕) > .wrap > .grid.layout 안이 글(.text: h2 + 안내 p) → [구글로 시작하기](a.start) → 단계 ol(.steps).
// 휴대폰에서 단추가 단계 뒤로 가는 것은 같은 DOM에서 CSS order로 한다(design.md '#how의 단추')
const HOW_SHAPE =
  /^(<section\b[^>]*>)(<div\b[^>]*>)(<div\b[^>]*>)(<div\b[^>]*>)(<h2\b[^>]*>)([^<]*)<\/h2>(<p\b[^>]*>)([^<]*)<\/p><\/div>(<a\b[^>]*>)([^<]*)<\/a>(<ol\b[^>]*>)([\s\S]*?)<\/ol><\/div><\/div><\/section>$/
// 단계 하나: li > 번호 span + h3 + p (사이 감싸개 없음)
const STEP_ITEM = /(<li\b[^>]*>)(<span\b[^>]*>)([^<]*)<\/span>(<h3\b[^>]*>)([^<]*)<\/h3>(<p\b[^>]*>)([^<]*)<\/p><\/li>/g

describe('AC-211.1: 시작 3단계의 짜임', () => {
  const parts = how.match(HOW_SHAPE)
  const [, section, wrap, grid, text, h2, h2In, lead, leadIn, a, aIn, ol, olIn] = parts ?? []
  const steps = [...(olIn ?? '').matchAll(STEP_ITEM)]

  it('AC-211.1: section#how(.sec, 흰 바탕 — canvas 띠 아님) > .wrap > .grid(.layout) 안이 글(.text: h2 + 안내 p) → [구글로 시작하기] → 단계 ol 순서다', () => {
    expect(parts, 'section > .wrap > .grid(.text(h2 + p) + a + ol)').not.toBeNull()
    expect(section).toMatch(/\bid="how"/)
    expect(classesOf(section)).toEqual([base.sec])
    expect(classesOf(wrap)).toEqual([base.wrap])
    expect(classesOf(grid)).toEqual(expect.arrayContaining([base.grid, howStyles.layout]))
    expect(classesOf(text)).toEqual([howStyles.text])
    expect(classesOf(ol)).toEqual([howStyles.steps])
    expect(how.match(/<h2\b/g)).toHaveLength(1)
  })

  it('AC-211.1: h2는 .tHeading "시작은 3단계면 충분합니다"(태그 없음), 안내 p(.lead)는 "처음이면 가입 신청 후 관리자 승인을 받습니다."다', () => {
    expect(classesOf(h2)).toEqual([base.tHeading])
    expect(h2In).toBe('시작은 3단계면 충분합니다')
    expect(classesOf(lead)).toEqual([howStyles.lead])
    expect(leadIn).toBe('처음이면 가입 신청 후 관리자 승인을 받습니다.')
  })

  it('AC-211.1: [구글로 시작하기]는 /login으로 가는 주 단추(.btn·.btnLg 44px·.btnPrimary) 글자뿐이고, 자리 클래스(.start)가 휴대폰 순서·폭을 정한다', () => {
    expect(a).toMatch(/\bhref="\/login"/)
    expect(classesOf(a)).toEqual([base.btn, base.btnLg, base.btnPrimary, howStyles.start])
    expect(aIn).toBe('구글로 시작하기')
  })

  it('AC-211.1: 단계 ol 안은 li(.step) 3개 — 번호 span(.num) "1"·"2"·"3" + h3(.tSubtitle .stepTitle) + p(.desc, 768px 미만 숨김 .pcOnly)이고 지금 단계 문구다', () => {
    expect(steps).toHaveLength(3)
    expect((olIn ?? '').replace(STEP_ITEM, ''), 'li 밖의 다른 원소가 없다').toBe('')
    expect(steps.map((m) => m[3])).toEqual(['1', '2', '3'])
    expect(steps.map((m) => m[5])).toEqual(['구글로 시작하기', '가입 신청', '승인 후 바로 사용'])
    expect(steps.map((m) => m[7])).toEqual([
      '쓰던 구글 계정으로 로그인합니다. 새 비밀번호를 만들 필요가 없습니다.',
      '처음 한 번만 의원 이름을 적어 신청합니다.',
      '관리자가 승인하면 대시보드가 열립니다.',
    ])
    for (const [, li, num, , h3, , p] of steps) {
      expect(classesOf(li)).toEqual([howStyles.step])
      expect(classesOf(num)).toEqual([howStyles.num])
      expect(classesOf(h3)).toEqual([base.tSubtitle, howStyles.stepTitle])
      expect(classesOf(p)).toEqual([howStyles.desc, base.pcOnly])
    }
  })

  it('AC-211.1: 영문 대문자 소제목·svg·aria-hidden 장식·inline style·줄바꿈 태그·옛 클래스(.stack·.head·.item·.tH2·.tH3·.tBody·.secCanvas)가 없다', () => {
    expect(textOf(how), '영문 대문자 소제목이 없다').not.toMatch(/[A-Z]{3,}/)
    expect(how).not.toMatch(/<svg\b/)
    expect(how).not.toMatch(/aria-hidden/)
    expect(how).not.toMatch(/\bstyle="/)
    expect(how).not.toMatch(/<br\b/)
    const allClasses = [...how.matchAll(/\bclass="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/))
    for (const old of [base.stack, base.head, base.item, base.tH2, base.tH3, base.tBody, base.secCanvas]) {
      expect(allClasses).not.toContain(old)
    }
  })

  it('AC-211.1: 시작 3단계에 붙은 클래스가 모두 base.module.css·HowSection.module.css에 정의돼 있다', () => {
    const { checked, missing } = classCheck(how, [
      [base.wrap, 'base.module.css'],
      [howStyles.steps, 'HowSection.module.css'],
    ])
    expect(checked, '본 클래스 수').toBeGreaterThan(0)
    expect(missing).toEqual([])
  })
})

// footer > .wrap.inner > .brand(LogoMark 18 + p 소개) + p ©
const FOOTER_SHAPE =
  /^(<footer\b[^>]*>)(<div\b[^>]*>)(<div\b[^>]*>)(<svg\b[^>]*>[\s\S]*?<\/svg>)(<p\b[^>]*>)([^<]*)<\/p><\/div>(<p\b[^>]*>)([^<]*)<\/p><\/div><\/footer>$/

// 모듈 CSS의 맨 위(@media 밖) 규칙에서 선택자 하나의 선언 { 속성: 값 }. 같은 속성은 뒤에 온 것이 이긴다
function topLevelDecls(css: string, selector: string): Record<string, string> {
  const flat = css.replace(/@[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '')
  const out: Record<string, string> = {}
  for (const [, head, body] of flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!head.split(',').map((s) => s.trim()).includes(selector)) continue
    for (const decl of body.split(';')) {
      const colon = decl.indexOf(':')
      if (colon > 0) out[decl.slice(0, colon).trim()] = decl.slice(colon + 1).trim().replace(/\s+/g, ' ')
    }
  }
  return out
}

describe('AC-207.3: 바닥글의 짜임', () => {
  const parts = footer.match(FOOTER_SHAPE)
  const [, foot, inner, brand, logo, introTag, intro, copyTag, copy] = parts ?? []

  it('AC-207.3: footer > .wrap 안이 왼쪽 LogoMark 18 + "통증 의원 관리자를 위한 AI 업무 도구" · 오른쪽 "© 2026"이고 두 글은 .tCaption이다', () => {
    expect(parts, 'footer > .wrap.inner > .brand(svg + p) + p').not.toBeNull()
    expect(classesOf(foot)).toEqual([footStyles.footer])
    expect(classesOf(inner)).toEqual(expect.arrayContaining([base.wrap, footStyles.inner]))
    expect(classesOf(brand)).toEqual([footStyles.brand])
    expect(logo).toBe(renderToStaticMarkup(<LogoMark size={18} />))
    expect(intro).toBe('통증 의원 관리자를 위한 AI 업무 도구')
    expect(copy).toBe('© 2026')
    for (const tag of [introTag, copyTag]) expect(classesOf(tag)).toEqual([base.tCaption])
  })

  it('AC-207.3: 바닥글에 링크·[서비스 이름]·[이메일 주소]·inline style이 없고 svg는 로고 하나다', () => {
    expect(footer).not.toMatch(/<a\b/)
    expect(footer.match(/<svg\b/g) ?? []).toHaveLength(1)
    expect(footer).not.toMatch(/\bstyle="/)
    for (const blank of ['[서비스 이름]', '[이메일 주소]', '문의']) expect(textOf(footer)).not.toContain(blank)
  })

  it('AC-207.3: 바닥글 CSS — footer는 위 1px line·위아래 24px이고, 글자는 muted, .tCaption은 caption 토큰이다', () => {
    const css = cssOf('SiteFooter.module.css')
    expect(topLevelDecls(css, '.footer')).toMatchObject({ 'border-top': '1px solid var(--line)', 'padding-block': '24px' })
    expect(topLevelDecls(css, '.inner')).toMatchObject({ color: 'var(--muted)' })
    expect(topLevelDecls(cssOf('base.module.css'), '.tCaption')).toMatchObject({
      'font-size': 'var(--fs-caption)',
      'line-height': 'var(--lh-caption)',
    })
    // 바닥글은 폭마다 바뀌지 않는다(@media 없음) → 위의 맨 위 규칙 값이 모든 폭의 값이다
    expect(css).not.toMatch(/@media/)
  })

  it('AC-207.3: 바닥글 CSS 읽기 도우미가 @media 안 규칙을 빼고 맨 위 규칙만 읽는다', () => {
    const sample = '.a, .b { color: var(--ink); padding: 0 } @media (min-width: 768px) { .a { color: var(--muted) } } .a { padding: 4px }'
    expect(topLevelDecls(sample, '.a')).toEqual({ color: 'var(--ink)', padding: '4px' })
    expect(topLevelDecls(sample, '.c')).toEqual({})
  })

  it('AC-207.3: 바닥글에 붙은 클래스가 모두 base.module.css·SiteFooter.module.css에 정의돼 있다', () => {
    const { checked, missing } = classCheck(footer, [
      [base.wrap, 'base.module.css'],
      [footStyles.footer, 'SiteFooter.module.css'],
    ])
    expect(checked, '본 클래스 수').toBeGreaterThan(0)
    expect(missing).toEqual([])
  })
})

describe('AC-210.2 · AC-211.1 · AC-207.3: 아무것도 받지 않는다', () => {
  it('AC-210.2 · AC-211.1 · AC-207.3: 세 부분에 받는 칸·누르는 칸·초점 받는 원소가 없다', () => {
    expect(all).not.toMatch(/<(form|input|textarea|button|select|label|details|summary|dialog)\b/)
    expect(all).not.toMatch(/contenteditable|tabindex|role="button"|\bon[a-z]+=/i)
  })
})
