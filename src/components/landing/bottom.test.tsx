import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LogoMark } from '@/components/common/LogoMark'
import base from './base.module.css'
import HowSection from './HowSection'
import howStyles from './HowSection.module.css'
import PrivacySection from './PrivacySection'
import privStyles from './PrivacySection.module.css'
import SiteFooter from './SiteFooter'
import footStyles from './SiteFooter.module.css'
import StartSection from './StartSection'
import startStyles from './StartSection.module.css'

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
// 태그를 빈칸 없이 지운 글자 (&#x27; 같은 글자는 textOf처럼 되돌린다). 빈칸을 모으지 않는다
// → <span> 앞뒤 띄어쓰기가 사라지거나 늘면 걸린다(AC-112.2)
const plainOf = (html: string) =>
  html.replace(/<[^>]+>/g, '').replace(/&#x27;|&quot;|&lt;|&gt;|&amp;/g, (e) => ENTITIES[e])
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

// ---------- 개인정보 · 시작 3단계 · 시작하기 · 푸터의 짜임 (specs/landing-v2 REQ-110, 시안 #privacy · #how · #start · footer) ----------

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

// section#privacy > .wrap.stack > .top(.head(h2 · p) + .card.zero(p 0건 · p 설명)) + .flow + ul(약속 4개)
const PRIV_SHAPE =
  /^(<section\b[^>]*>)(<div\b[^>]*>)(<div\b[^>]*>)(<div\b[^>]*>)(<h2\b[^>]*>)([\s\S]*?)<\/h2>(<p\b[^>]*>)([^<]*)<\/p><\/div>(<div\b[^>]*>)(<p\b[^>]*>)([\s\S]*?)<\/p>(<p\b[^>]*>)([\s\S]*?)<\/p><\/div><\/div>(<div\b[^>]*>)([\s\S]*)<\/div>(<ul\b[^>]*>)([\s\S]*?)<\/ul><\/div><\/section>$/
// 흐름 카드: .node > .nodeHead(svg + h3) + p (+ 첫 카드만 .stop(제목 span(svg + 글) + 항목 span))
const NODE_SRC =
  '<div\\b[^>]*><div\\b[^>]*><svg\\b[^>]*>[\\s\\S]*?</svg><h3\\b[^>]*>[^<]*</h3></div><p\\b[^>]*>[^<]*</p>' +
  '(?:<div\\b[^>]*><span\\b[^>]*><svg\\b[^>]*>[\\s\\S]*?</svg>[^<]*</span><span\\b[^>]*>[^<]*</span></div>)?</div>'
// 연결: .link(aria-hidden) > 화살표 선 span + 칩 span
const LINK_SRC = '<div\\b[^>]*><span\\b[^>]*></span><span\\b[^>]*>[^<]*</span></div>'
const FLOW_SHAPE = new RegExp(`^(${NODE_SRC})(${LINK_SRC})(${NODE_SRC})(${LINK_SRC})(${NODE_SRC})$`)
const NODE_PARTS = new RegExp(
  '^(<div\\b[^>]*>)(<div\\b[^>]*>)(<svg\\b[^>]*>)[\\s\\S]*?</svg>(<h3\\b[^>]*>)([^<]*)</h3></div>(<p\\b[^>]*>)([^<]*)</p>' +
    '(?:(<div\\b[^>]*>)(<span\\b[^>]*>)(<svg\\b[^>]*>)[\\s\\S]*?</svg>([^<]*)</span>(<span\\b[^>]*>)([^<]*)</span></div>)?</div>$',
)
const LINK_PARTS = /^(<div\b[^>]*>)(<span\b[^>]*>)<\/span>(<span\b[^>]*>)([^<]*)<\/span><\/div>$/
// 약속 하나: <li>(h3 + p). p 안에는 줄바꿈을 막는 <span> 하나까지만 받는다(<br> 등 다른 태그는 없다).
// <span>은 약속 3에만 있고 나머지 세 <p>는 태그 없는 글자뿐이다(AC-112.2에서 따로 본다)
const LIST_ITEM =
  /(<li\b[^>]*>)(<h3\b[^>]*>)([^<]*)<\/h3>(<p\b[^>]*>)([^<]*(?:<span\b[^>]*>[^<]*<\/span>[^<]*)?)<\/p><\/li>/g

describe('AC-110.1: 개인정보 섹션의 짜임', () => {
  const parts = privacy.match(PRIV_SHAPE)
  const [, section, wrap, top, head, h2, h2In, lead, leadIn, zero, zeroNum, zeroNumIn, zeroCap, zeroCapIn, flow, flowIn, list, listIn] =
    parts ?? []
  const flowParts = (flowIn ?? '').match(FLOW_SHAPE)
  const [, node1, link1, node2, link2, node3] = flowParts ?? []
  const nodes = [node1, node2, node3].map((n) => (n ?? '').match(NODE_PARTS))
  const links = [link1, link2].map((l) => (l ?? '').match(LINK_PARTS))
  const rules = [...(listIn ?? '').matchAll(LIST_ITEM)]

  it('AC-110.1: section#privacy(.sec, 흰 바탕) > .wrap.stack 안이 윗부분(제목 덩어리 + 0건 카드) → 흐름 → 약속 목록 순서다', () => {
    expect(parts, 'section > .wrap > .top(.head + .zero) + .flow + ul').not.toBeNull()
    expect(section).toMatch(/\bid="privacy"/)
    expect(classesOf(section)).toEqual([base.sec])
    expect(classesOf(wrap)).toEqual(expect.arrayContaining([base.wrap, base.stack]))
    expect(classesOf(top)).toEqual([privStyles.top])
    expect(classesOf(head)).toEqual([base.head])
    expect(classesOf(flow)).toEqual([privStyles.flow])
  })

  it('AC-110.1: h2는 .tH2이고 "환자 개인정보는<br/>절대 병원 PC 밖으로 나가지 않습니다"뿐이다(강조 span 없음), 안내 글은 .tLead다', () => {
    expect(classesOf(h2)).toEqual([base.tH2])
    expect(h2In).toBe('환자 개인정보는<br/>절대 병원 PC 밖으로 나가지 않습니다')
    expect(classesOf(lead)).toEqual([base.tLead])
    expect(textOf(leadIn ?? '')).toBe('환자 이름·주민번호·차트번호는 서버에도, AI에도 가지 않습니다. 처음부터 그렇게 설계했습니다.')
  })

  it('AC-110.1: 0건 카드는 .card.zero 안의 <p>0<span>건</span></p> + "서버와 AI로 보내는<br/>환자 개인정보"다', () => {
    expect(classesOf(zero)).toEqual(expect.arrayContaining([base.card, privStyles.zero]))
    expect(classesOf(zeroNum)).toEqual([privStyles.zeroNum])
    expect(zeroNumIn).toBe('0<span>건</span>')
    expect(classesOf(zeroCap)).toEqual([privStyles.zeroCaption])
    expect(zeroCapIn).toBe('서버와 AI로 보내는<br/>환자 개인정보')
  })

  it('AC-110.1: 흐름은 카드 3개(병원 PC · 브라우저 → 서버 → AI 분석) 사이에 연결 2개가 끼인 순서다', () => {
    expect(flowParts, '.node · .link · .node · .link · .node').not.toBeNull()
    for (const [i, n] of nodes.entries()) expect(n, `카드 ${i + 1}`).not.toBeNull()
    expect(nodes.map((n) => n?.[5])).toEqual(['병원 PC · 브라우저', '서버', 'AI 분석'])
    expect(nodes.map((n) => n?.[7])).toEqual([
      '환자 파일을 여기서만 열고 계산합니다.',
      '통계·매출 합계만 저장합니다. 원본 파일은 올라가지 않습니다.',
      '서버가 꺼낸 합계 숫자로만 리포트를 씁니다.',
    ])
    for (const n of nodes) {
      const [, card, , , h3, , p] = n ?? []
      expect(classesOf(card)).toEqual([privStyles.node])
      expect(classesOf(h3)).toEqual([base.tH3])
      expect(classesOf(p)).toEqual([base.tBody])
    }
  })

  it('AC-110.1: 흐름 카드의 h3 머리는 가운데 정렬 클래스 없이 .nodeHead 하나이고, 20px currentColor 아이콘이 앞에 붙는다', () => {
    for (const n of nodes) {
      const [, , nodeHead, svg] = n ?? []
      expect(classesOf(nodeHead)).toEqual([privStyles.nodeHead])
      expect(svg).toMatch(/\baria-hidden="true"/)
      expect(svg).toMatch(/\bwidth="20"/)
      expect(svg).toMatch(/\bheight="20"/)
      expect(svg).toMatch(/\bstroke="currentColor"/)
    }
  })

  it('AC-110.1: 첫 카드에만 "여기서 멈춤" 상자(.stop > .stopTitle(svg + 글) + .stopItems)가 있다', () => {
    const [, , , , , , , , stop, stopTitle, stopSvg, stopText, stopItems, stopItemsIn] = nodes[0] ?? []
    expect(classesOf(stop)).toEqual([privStyles.stop])
    expect(classesOf(stopTitle)).toEqual([privStyles.stopTitle])
    expect(stopSvg).toMatch(/\baria-hidden="true"/)
    expect(stopSvg).toMatch(/\bstroke="currentColor"/)
    expect(stopText).toBe('여기서 멈춤')
    expect(classesOf(stopItems)).toEqual([privStyles.stopItems])
    expect(stopItemsIn).toBe('환자 이름 · 주민번호 · 차트번호 · 파일 이름')
    expect(nodes[1]?.[8], '서버 카드에는 멈춤 상자가 없다').toBeUndefined()
    expect(nodes[2]?.[8], 'AI 분석 카드에는 멈춤 상자가 없다').toBeUndefined()
  })

  it('AC-110.1: 연결 2개는 aria-hidden .link > 화살표 선 .linkLine + .chip·.chipNeutral("합계 숫자만" / "집계만")이다', () => {
    for (const [i, l] of links.entries()) expect(l, `연결 ${i + 1}`).not.toBeNull()
    expect(links.map((l) => l?.[4])).toEqual(['합계 숫자만', '집계만'])
    for (const l of links) {
      const [, link, line, chip] = l ?? []
      expect(link).toMatch(/\baria-hidden="true"/)
      expect(classesOf(link)).toEqual([privStyles.link])
      expect(classesOf(line)).toEqual([privStyles.linkLine])
      expect(classesOf(chip)).toEqual(expect.arrayContaining([base.chip, base.chipNeutral, privStyles.linkChip]))
    }
  })

  it('AC-110.1: 약속은 <ul class="items itemsFour"> 안의 <li class="item"> 4개(h3 .tH3 + p .tBody)이고 약속 2 설명에 <br>가 없다', () => {
    expect(classesOf(list)).toEqual(expect.arrayContaining([base.items, base.itemsFour]))
    expect(rules).toHaveLength(4)
    expect((listIn ?? '').replace(LIST_ITEM, ''), 'li 밖의 다른 원소가 없다').toBe('')
    expect(rules.map((m) => textOf(m[3]))).toEqual([
      '필요한 칸만 읽습니다',
      '주민번호가 보이면 멈춥니다',
      'AI에는 합계 숫자만',
      '승인한 사람만, 공용 PC도 안심',
    ])
    expect(rules.map((m) => plainOf(m[5]))).toEqual([
      '계산에 쓰는 칸을 정해 두고 그 칸만 읽습니다. 차트번호는 계산하는 동안 메모리 안에서만 씁니다.',
      "'-' 없이 붙여 쓴 13자리까지 잡아서, 섞여 있으면 계산하지 않고 알려 줍니다.",
      '통계·매출 합계와 인건비 총액만 보냅니다. 직원 이름·개인별 급여도 보내지 않습니다.',
      '구글 로그인 뒤 관리자가 승인한 계정만 들어옵니다. 30분 동안 움직임이 없으면 자동으로 로그아웃합니다.',
    ])
    for (const [, li, h3, , p] of rules) {
      expect(classesOf(li)).toEqual([base.item])
      expect(classesOf(h3)).toEqual([base.tH3])
      expect(classesOf(p)).toEqual([base.tBody])
    }
  })

  it('AC-110.1: "PRIVACY FIRST"·방패 아이콘·색 글자·inline style이 없고 svg는 흐름 아이콘 3개 + 멈춤 아이콘 1개다', () => {
    expect(textOf(privacy)).not.toMatch(/PRIVACY FIRST/i)
    expect(textOf(privacy), '영문 대문자 소제목이 없다').not.toMatch(/[A-Z]{3,}/)
    expect(privacy).not.toContain('M11 2l7 3v5')
    expect(privacy.match(/<svg\b/g) ?? []).toHaveLength(4)
    expect(privacy).not.toMatch(/="#[0-9a-f]{3,8}"/i)
    expect(privacy).not.toMatch(/\bstyle="/)
  })

  it('AC-110.1: 개인정보 섹션에 붙은 클래스가 모두 base.module.css·PrivacySection.module.css에 정의돼 있다', () => {
    const { checked, missing } = classCheck(privacy, [
      [base.wrap, 'base.module.css'],
      [privStyles.flow, 'PrivacySection.module.css'],
    ])
    expect(checked, '본 클래스 수').toBeGreaterThan(0)
    expect(missing).toEqual([])
  })
})

describe('AC-112.2: 약속 3 "이름·개인별" 줄바꿈 막기', () => {
  const listIn = privacy.match(PRIV_SHAPE)?.[17] ?? ''
  const descs = [...listIn.matchAll(LIST_ITEM)].map((m) => m[5])

  it('AC-112.2: 약속 3 설명 <p>는 "이름·개인별"만 base.nowrap <span> 하나에 넣고, 앞뒤 띄어쓰기는 그대로다', () => {
    expect(descs).toHaveLength(4)
    expect(descs[2]).toBe(
      `통계·매출 합계와 인건비 총액만 보냅니다. 직원 <span class="${base.nowrap}">이름·개인별</span> 급여도 보내지 않습니다.`,
    )
    expect(plainOf(descs[2] ?? '')).toBe('통계·매출 합계와 인건비 총액만 보냅니다. 직원 이름·개인별 급여도 보내지 않습니다.')
  })

  it('AC-112.2: 다른 약속 세 개(1·2·4)의 설명 <p>에는 태그가 없다(약속 2에 <br> 없음, AC-110.1)', () => {
    expect(descs).toHaveLength(4)
    for (const i of [0, 1, 3]) expect(descs[i], `약속 ${i + 1}`).not.toMatch(/</)
  })

  it('AC-112.2: base.module.css에 .nowrap { white-space: nowrap }이 정의돼 있다(CSS Module은 없는 이름에도 값을 준다)', () => {
    expect(cssOf('base.module.css')).toMatch(/(?:^|\})\s*\.nowrap\s*\{\s*white-space:\s*nowrap\s*;?\s*\}/)
  })
})

// section#how(.sec.secCanvas) > .wrap.stack > .head(h2) + ol.steps(li.item × 3)
const HOW_SHAPE =
  /^(<section\b[^>]*>)(<div\b[^>]*>)(<div\b[^>]*>)(<h2\b[^>]*>)([^<]*)<\/h2><\/div>(<ol\b[^>]*>)([\s\S]*?)<\/ol><\/div><\/section>$/
// 단계 하나: li > 번호 span + h3 + p
const STEP_ITEM = /(<li\b[^>]*>)(<span\b[^>]*>)([^<]*)<\/span>(<h3\b[^>]*>)([^<]*)<\/h3>(<p\b[^>]*>)([^<]*)<\/p><\/li>/g

describe('AC-110.3: 시작 3단계의 짜임', () => {
  const parts = how.match(HOW_SHAPE)
  const [, section, wrap, head, h2, h2In, ol, olIn] = parts ?? []
  const steps = [...(olIn ?? '').matchAll(STEP_ITEM)]

  it('AC-110.3: section#how(.sec·.secCanvas) > .wrap.stack 안에 h2 하나(.head) + <ol class="steps">뿐이다(흐르는 선 없음)', () => {
    expect(parts, 'section > .wrap > .head(h2) + ol').not.toBeNull()
    expect(section).toMatch(/\bid="how"/)
    expect(classesOf(section)).toEqual(expect.arrayContaining([base.sec, base.secCanvas]))
    expect(classesOf(wrap)).toEqual(expect.arrayContaining([base.wrap, base.stack]))
    expect(classesOf(head)).toEqual([base.head])
    expect(classesOf(h2)).toEqual([base.tH2])
    expect(h2In).toBe('시작은 3단계면 충분합니다')
    expect(classesOf(ol)).toEqual([howStyles.steps])
    expect(how.match(/<h2\b/g)).toHaveLength(1)
  })

  it('AC-110.3: <ol> 안은 <li class="item"> 3개이고 각각 번호 span(.stepNum, 한 가지 색) + h3 .tH3 + p .tBody다', () => {
    expect(steps).toHaveLength(3)
    expect((olIn ?? '').replace(STEP_ITEM, ''), 'li 밖의 다른 원소가 없다').toBe('')
    expect(steps.map((m) => m[3])).toEqual(['01', '02', '03'])
    expect(steps.map((m) => m[5])).toEqual(['구글로 시작하기', '가입 신청', '승인 후 바로 사용'])
    expect(steps.map((m) => m[7])).toEqual([
      '쓰던 구글 계정으로 로그인합니다. 새 비밀번호를 만들 필요가 없습니다.',
      '처음 한 번만 의원 이름을 적어 신청합니다.',
      '관리자가 승인하면 대시보드가 열립니다.',
    ])
    for (const [, li, num, , h3, , p] of steps) {
      expect(classesOf(li)).toEqual([base.item])
      expect(classesOf(num)).toEqual([howStyles.stepNum])
      expect(classesOf(h3)).toEqual([base.tH3])
      expect(classesOf(p)).toEqual([base.tBody])
    }
  })

  it('AC-110.3: "HOW IT STARTS"·svg·aria-hidden 장식·inline style이 없다', () => {
    expect(textOf(how)).not.toMatch(/HOW IT STARTS/i)
    expect(textOf(how), '영문 대문자 소제목이 없다').not.toMatch(/[A-Z]{3,}/)
    expect(how).not.toMatch(/<svg\b/)
    expect(how).not.toMatch(/aria-hidden/)
    expect(how).not.toMatch(/\bstyle="/)
  })

  it('AC-110.3: 시작 3단계에 붙은 클래스가 모두 base.module.css·HowSection.module.css에 정의돼 있다', () => {
    const { checked, missing } = classCheck(how, [
      [base.wrap, 'base.module.css'],
      [howStyles.steps, 'HowSection.module.css'],
    ])
    expect(checked, '본 클래스 수').toBeGreaterThan(0)
    expect(missing).toEqual([])
  })
})

// section#start(.sec) > .wrap > .start(.text(h2 + p) + a)
const START_SHAPE =
  /^(<section\b[^>]*>)(<div\b[^>]*>)(<div\b[^>]*>)(<div\b[^>]*>)(<h2\b[^>]*>)([\s\S]*?)<\/h2>(<p\b[^>]*>)([^<]*)<\/p><\/div>(<a\b[^>]*>)([^<]*)<\/a><\/div><\/div><\/section>$/

describe('AC-110.4: 시작하기 섹션의 짜임', () => {
  const parts = start.match(START_SHAPE)
  const [, section, wrap, grid, text, h2, h2In, lead, leadIn, a, aIn] = parts ?? []

  it('AC-110.4: section#start(.sec, 흰 바탕) > .wrap > .start 안이 글 덩어리(.text) → 단추 순서다(원형 빛 없음)', () => {
    expect(parts, 'section > .wrap > .start(.text(h2 + p) + a)').not.toBeNull()
    expect(section).toMatch(/\bid="start"/)
    expect(classesOf(section)).toEqual([base.sec])
    expect(classesOf(wrap)).toEqual([base.wrap])
    expect(classesOf(grid)).toEqual([startStyles.start])
    expect(classesOf(text)).toEqual([startStyles.text])
    expect(start).not.toMatch(/aria-hidden/)
  })

  it('AC-110.4: h2는 .tH2 "우리 의원도<br/>숫자로 운영해 보세요", 안내 글은 .tLead다', () => {
    expect(classesOf(h2)).toEqual([base.tH2])
    expect(h2In).toBe('우리 의원도<br/>숫자로 운영해 보세요')
    expect(classesOf(lead)).toEqual([base.tLead])
    expect(leadIn).toBe('처음이면 가입 신청 후 관리자 승인을 받습니다.')
  })

  it('AC-110.4: [구글로 시작하기]는 /login으로 가는 .btn·.btnLg·.btnPrimary 글자 단추다', () => {
    expect(a).toMatch(/\bhref="\/login"/)
    expect(classesOf(a)).toEqual([base.btn, base.btnLg, base.btnPrimary])
    expect(aIn).toBe('구글로 시작하기')
  })

  it('AC-110.4: 시작하기 섹션에 붙은 클래스가 모두 base.module.css·StartSection.module.css에 정의돼 있다', () => {
    const { checked, missing } = classCheck(start, [
      [base.wrap, 'base.module.css'],
      [startStyles.start, 'StartSection.module.css'],
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

describe('AC-110.1 · AC-110.3 · AC-110.4 · AC-110.5: 아무것도 받지 않는다', () => {
  it('AC-110.1 · AC-110.3 · AC-110.4 · AC-110.5: 네 부분에 받는 칸·누르는 칸·초점 받는 원소가 없다', () => {
    expect(all).not.toMatch(/<(form|input|textarea|button|select|label|details|summary|dialog)\b/)
    expect(all).not.toMatch(/contenteditable|tabindex|role="button"|\bon[a-z]+=/i)
  })
})
