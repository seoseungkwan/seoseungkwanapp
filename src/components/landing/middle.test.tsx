import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Icon } from '@/components/common/Icon'
import AiSection from './AiSection'
import aiStyles from './AiSection.module.css'
import base from './base.module.css'
import FeaturesSection from './FeaturesSection'
import featStyles from './FeaturesSection.module.css'
import OrthoSection from './OrthoSection'
import orthoStyles from './OrthoSection.module.css'

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
// 랜딩 폴더의 시험이 아닌 소스 파일(ts·tsx·css)과 그 글자
const LANDING_DIR = join(process.cwd(), 'src/components/landing')
const landingSources = readdirSync(LANDING_DIR)
  .filter((name) => /\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name))
  .map((name) => ({ name, body: readFileSync(join(LANDING_DIR, name), 'utf8') }))

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

  // 카드 짜임(옛 figcaption 확인)은 AC-108.3 시험으로 옮겼다(specs/landing-v2 design.md '옛 시험 다루기')
  it('AC-005.1: 정형외과 타일 4개의 설명 문구', () => {
    const text = textOf(ortho)
    for (const line of ['주사 치료 수와 F/U', '물리치료 내원 환자 수', '비급여 치료 내역', '한 장으로 받는 월간 보고']) {
      expect(text).toContain(line)
    }
  })
})

describe('AC-005.2: 예시 표시와 빈칸', () => {
  it('AC-005.2: AI 리포트 카드에 "방금 생성 · 예시" 표시가 있다', () => {
    const text = textOf(ai)
    expect(text).toContain('10월 AI 리포트')
    expect(text).toContain('방금 생성 · 예시')
  })
})

describe('AC-104.1: 그림을 모두 뺀다', () => {
  it('AC-104.1: ai·ortho·features 마크업에 img·picture·video가 0개다', () => {
    for (const html of [ai, ortho, features]) {
      expect(html).not.toMatch(/<(img|picture|video)\b/i)
    }
  })

  it('AC-104.1: 랜딩 폴더 소스에 next/image import와 CSS url(이 없다', () => {
    expect(landingSources.length).toBeGreaterThan(0)
    for (const { name, body } of landingSources) {
      expect(body, name).not.toMatch(/['"]next\/image['"]/)
      expect(body, name).not.toMatch(/url\(/i)
    }
  })

  it('AC-104.1: http로 시작하는 바깥 주소 그림이 없다', () => {
    expect(all).not.toMatch(/src(set)?="https?:/i)
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

// ---------- AI 섹션 · 정형외과 섹션의 짜임 (specs/landing-v2 REQ-108, 시안 #ai · #ortho) ----------

// 여는 태그의 class 목록
const classesOf = (openTag: string | undefined) =>
  (/\bclass="([^"]*)"/.exec(openTag ?? '')?.[1] ?? '').split(/\s+/).filter(Boolean)
// Vitest의 CSS Module 이름은 `_이름_파일해시6자`다(없는 이름에도 돌려준다) → 붙인 클래스마다 그 파일 CSS에 `.이름`이 정의돼 있는지 본다.
// 하나도 못 봤다면(이름 꼴이 바뀌었거나 클래스가 없음) 시험이 헛돈 것이니 checked도 함께 돌려준다
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

// AiSection.module.css에서 네 변 테두리(border: 1px …)를 주는 클래스 이름. 모듈 해시 이름으로 바꿔 마크업에서 찾는다
const fourSideBorderClasses = (css: string) =>
  [...css.matchAll(/\.(\w+)\s*\{[^{}]*?(?:^|[;{\s])border\s*:\s*1px\b/gm)].map((m) => m[1])
// 여는 태그 하나: 태그 이름 · aria-hidden · class 목록
const openTags = (html: string) =>
  [...html.matchAll(/<([a-z][\w-]*)\b([^>]*)>/g)].map((m) => ({
    tag: m[1],
    hidden: /\baria-hidden="true"/.test(m[2]),
    classes: classesOf(m[0]),
  }))
// 상자가 될 수 있는 태그(src/testing/boxes.ts BOX_TAGS와 같다)
const BOX_TAGS = new Set(['div', 'section', 'article', 'ul', 'ol', 'li', 'dl', 'table', 'aside', 'form'])

// section#ai(띠) > .wrap > .grid > 글(h2 · p · dl) + 리포트 패널 (specs/b2b-redesign AC-209.1, 시안 screens.mjs landingPC #ai)
const AI_SHAPE =
  /^(<section\b[^>]*>)(<div\b[^>]*>)(<div\b[^>]*>)(<div\b[^>]*>)(<h2\b[^>]*>)([\s\S]*?)<\/h2>(<p\b[^>]*>)([\s\S]*?)<\/p>(<dl\b[^>]*>)([\s\S]*?)<\/dl><\/div>(<div\b[^>]*>)([\s\S]*)<\/div><\/div><\/div><\/section>$/
// 약속 하나: div(dt + dd)
const POINT = /(<div\b[^>]*>)(<dt\b[^>]*>)([^<]*)<\/dt>(<dd\b[^>]*>)([^<]*)<\/dd><\/div>/g
// 리포트 패널 안: 머리(h3 + 칩) + 몸(항목 ol + 채팅 칸)
const REPORT_SHAPE =
  /^(<div\b[^>]*>)(<h3\b[^>]*>)([^<]*)<\/h3>(<span\b[^>]*>)([\s\S]*?)<\/span><\/div>(<div\b[^>]*>)(<ol\b[^>]*>)([\s\S]*?)<\/ol>(<div\b[^>]*>)([\s\S]*)<\/div><\/div>$/
// 항목 하나: li > 칩 span + div(글 p + 근거 p)
const REPORT_ITEM =
  /(<li\b[^>]*>)(<span\b[^>]*>)([^<]*)<\/span>(<div\b[^>]*>)(<p\b[^>]*>)([^<]*)<\/p>(<p\b[^>]*>)([^<]*)<\/p><\/div><\/li>/g
// 채팅 칸 안: 말풍선 p → 답 쓰는 중 p → 칩 div(span × 2) → 물어보기 div(글 span + 보내기 span > svg)
const CHAT_SHAPE =
  /^(<p\b[^>]*>)([^<]*)<\/p>(<p\b[^>]*>)([^<]*)<\/p>(<div\b[^>]*>)((?:<span\b[^>]*>[^<]*<\/span>){2})<\/div>(<div\b[^>]*>)(<span\b[^>]*>)([^<]*)<\/span>(<span\b[^>]*>)(<svg\b[^>]*>[\s\S]*?<\/svg>)<\/span><\/div>$/

describe('AC-209.1: AI 섹션의 짜임', () => {
  const parts = ai.match(AI_SHAPE)
  const [, section, wrap, grid, text, h2, h2In, lead, leadIn, dl, dlIn, report, reportIn] = parts ?? []
  const points = [...(dlIn ?? '').matchAll(POINT)]
  const reportParts = (reportIn ?? '').match(REPORT_SHAPE)
  const [, head, h3, h3In, chip, chipIn, body, list, listIn, chat, chatIn] = reportParts ?? []
  const items = [...(listIn ?? '').matchAll(REPORT_ITEM)]
  const chatParts = (chatIn ?? '').match(CHAT_SHAPE)
  const [, bubble, bubbleIn, typing, typingIn, chips, chipsIn, ask, askLabel, askText, send, sendSvg] = chatParts ?? []

  it('AC-209.1: section#ai(.sec·.secCanvas 띠) > .wrap > .grid 안이 글 덩어리(.text) → 리포트 패널(.report) 순서다', () => {
    expect(parts, 'section > .wrap > .grid > .text(h2 · p · dl) + .report').not.toBeNull()
    expect(section).toMatch(/\bid="ai"/)
    expect(classesOf(section)).toEqual(expect.arrayContaining([base.sec, base.secCanvas]))
    expect(classesOf(wrap)).toContain(base.wrap)
    expect(classesOf(grid)).toEqual(expect.arrayContaining([base.grid, aiStyles.layout]))
    expect(classesOf(text)).toContain(aiStyles.text)
    expect(classesOf(report)).toContain(aiStyles.report)
  })

  it('AC-209.1: h2는 .tHeading이고 "버튼 한 번이면 AI가 이번 달을 읽어 줍니다"(태그 없음), 안내 p(.lead)는 지금 문구다', () => {
    expect(classesOf(h2)).toContain(base.tHeading)
    expect(h2In).toBe('버튼 한 번이면 AI가 이번 달을 읽어 줍니다')
    expect(classesOf(lead)).toContain(aiStyles.lead)
    expect(leadIn).toBe(
      '숫자를 늘어놓는 데서 끝나지 않습니다. 무엇이 달라졌는지, 왜 그런지, 다음 달 무엇을 봐야 하는지 말로 정리합니다.',
    )
  })

  it('AC-209.1: 약속 <dl>(.points)은 div(.point) 4개 — dt(.pointTitle) + dd(.pointDesc)이고 지금 제목·설명 문구다', () => {
    expect(classesOf(dl)).toContain(aiStyles.points)
    expect(points).toHaveLength(4)
    expect((dlIn ?? '').replace(POINT, ''), 'div(dt + dd) 밖의 다른 원소가 없다').toBe('')
    expect(points.map((m) => textOf(m[3]))).toEqual([
      '근거 숫자와 함께',
      "짐작은 '추정'이라고",
      '이어서 채팅으로 질문',
      '환자 정보 없이',
    ])
    expect(points.map((m) => m[5])).toEqual([
      '모든 문장에 어떤 숫자를 보고 말했는지 붙입니다.',
      '원인을 짐작할 때는 추정이라고 분명히 밝힙니다.',
      '리포트를 보다가 궁금한 점을 바로 물어봅니다.',
      'AI에는 합계 숫자만 보내고, 채팅 기록은 저장하지 않습니다.',
    ])
    for (const [, row, dt, , dd] of points) {
      expect(classesOf(row)).toContain(aiStyles.point)
      expect(classesOf(dt)).toContain(aiStyles.pointTitle)
      expect(classesOf(dd)).toContain(aiStyles.pointDesc)
    }
  })

  it('AC-209.1: 리포트 머리(.reportHead)는 h3 .tSubtitle "10월 AI 리포트" + 칩(.chip·.chipNeutral) "방금 생성 · 예시"이고, 768px 미만은 "예시"만 보인다("방금 생성 ·"만 .pcOnly)', () => {
    expect(reportParts, '.report > .reportHead(h3 + 칩) + .reportBody(ol + .chat)').not.toBeNull()
    expect(classesOf(head)).toContain(aiStyles.reportHead)
    expect(classesOf(h3)).toContain(base.tSubtitle)
    expect(h3In).toBe('10월 AI 리포트')
    expect(classesOf(chip)).toEqual(expect.arrayContaining([base.chip, base.chipNeutral]))
    expect(chipIn).toBe(`<span class="${base.pcOnly}">방금 생성 ·</span> 예시`)
    expect(textOf(chipIn ?? '')).toBe('방금 생성 · 예시')
    expect(classesOf(body)).toContain(aiStyles.reportBody)
  })

  it('AC-209.1: 항목 <ol>(.items)은 <li> 3개 — 칩(늘었어요 .chipPositive · 살펴볼 것 .chipWarning · 추정 .chipNeutral) + 글 + 근거(.tSmall .basis)이고 셋째 근거만 .pcOnly다', () => {
    expect(classesOf(list)).toContain(aiStyles.items)
    expect(items).toHaveLength(3)
    expect((listIn ?? '').replace(REPORT_ITEM, ''), 'li 밖의 다른 원소가 없다').toBe('')
    expect(items.map((m) => m[3])).toEqual(['늘었어요', '살펴볼 것', '추정'])
    expect(items.map((m) => m[6])).toEqual([
      '신환이 지난달보다 늘었습니다.',
      '인건비율이 지난달보다 올랐습니다.',
      '도수치료 증가는 신환 증가와 함께 움직인 것으로 보입니다.',
    ])
    expect(items.map((m) => m[8])).toEqual([
      '근거 · 신환 9월 486명 → 10월 524명',
      '근거 · 인건비 총액 ÷ 매출',
      '근거 · 처방 그룹 ‘도수’ 9월 312건 → 10월 356건',
    ])
    const tones = [base.chipPositive, base.chipWarning, base.chipNeutral]
    items.forEach(([, li, tag, , itemBody, , , basis], i) => {
      expect(classesOf(li)).toContain(aiStyles.item)
      expect(classesOf(tag)).toEqual(expect.arrayContaining([base.chip, tones[i], aiStyles.tag]))
      expect(classesOf(itemBody)).toContain(aiStyles.itemBody)
      expect(classesOf(basis)).toEqual(expect.arrayContaining([base.tSmall, aiStyles.basis]))
      expect(classesOf(basis).includes(base.pcOnly), `근거 ${i + 1} .pcOnly`).toBe(i === 2)
    })
  })

  it('AC-209.1: 채팅 칸(.chat·.pcOnly)은 말풍선 <p> "다음 달엔 뭘 보면 좋을까?" → "AI가 답을 쓰는 중…"(.tSmall) → 칩 span 2개 → aria-hidden 물어보기 칸(글 + 보내기 화살표)이다', () => {
    expect(chatParts, '말풍선 p + 답 쓰는 중 p + 칩 div(span × 2) + 물어보기 div(span + 보내기 span > svg)').not.toBeNull()
    expect(classesOf(chat)).toEqual(expect.arrayContaining([aiStyles.chat, base.pcOnly]))
    expect(classesOf(bubble)).toContain(aiStyles.bubble)
    expect(bubbleIn).toBe('다음 달엔 뭘 보면 좋을까?')
    expect(classesOf(typing)).toEqual(expect.arrayContaining([base.tSmall, aiStyles.typing]))
    expect(typingIn).toBe('AI가 답을 쓰는 중…')
    expect(classesOf(chips)).toContain(base.chips)
    const chipTags = [...(chipsIn ?? '').matchAll(/(<span\b[^>]*>)([^<]*)<\/span>/g)]
    expect(chipTags.map((m) => m[2])).toEqual(['재방문율이 낮은 처방은?', '인건비율 괜찮아?'])
    for (const [, open] of chipTags) expect(classesOf(open)).toEqual(expect.arrayContaining([base.chip, base.chipNeutral]))
    expect(ask).toMatch(/\baria-hidden="true"/)
    expect(classesOf(ask)).toContain(aiStyles.ask)
    expect(classesOf(askLabel)).toContain(aiStyles.askText)
    expect(askText).toBe('AI에게 물어보기')
    expect(classesOf(send)).toContain(aiStyles.send)
    expect(sendSvg).toBe(renderToStaticMarkup(<Icon name="arrow" size={14} />))
  })

  it('AC-209.1: 상자는 리포트 패널 하나다 — 네 변 테두리 클래스는 패널(div)·말풍선(<p>)·물어보기 칸(aria-hidden)에만 있다', () => {
    const boxNames = fourSideBorderClasses(cssOf('AiSection.module.css'))
    expect(boxNames.sort()).toEqual(['ask', 'bubble', 'report'])
    const hashed = new Set(boxNames.map((name) => aiStyles[name]))
    const bordered = openTags(ai).filter((t) => t.classes.some((c) => hashed.has(c)))
    expect(bordered.map((t) => `${t.tag}${t.hidden ? '[aria-hidden]' : ''}`)).toEqual(['div', 'p', 'div[aria-hidden]'])
    const boxes = bordered.filter((t) => BOX_TAGS.has(t.tag) && !t.hidden)
    expect(boxes.map((t) => t.classes)).toEqual([expect.arrayContaining([aiStyles.report])])
  })

  it('AC-209.1: [지난달]·[이번 달]·영문 소제목·반짝이·방패·움직이는 점(role="img")·줄바꿈 태그·색 글자·inline style이 없고 svg는 보내기 화살표 하나다', () => {
    const all = textOf(ai)
    expect(all).not.toContain('[지난달]')
    expect(all).not.toContain('[이번 달]')
    expect(all, '빈칸 [ ]').not.toMatch(/\[[^\]]*\]/)
    expect(all, '영문 대문자 소제목이 없다').not.toMatch(/[A-Z]{3,}/)
    expect(ai).not.toContain('M8 1.5l1.6 4.2')
    expect(ai).not.toContain('M11 2l7 3v5')
    expect(ai).not.toMatch(/role="img"|<br\s*\/?>/)
    expect(ai.match(/<svg\b/g) ?? []).toHaveLength(1)
    expect(ai).not.toMatch(/="#[0-9a-f]{3,8}"/i)
    expect(ai).not.toMatch(/\bstyle="/)
  })

  it('AC-209.1: AI 섹션에 붙은 클래스가 모두 base.module.css·AiSection.module.css에 정의돼 있다', () => {
    const { checked, missing } = classCheck(ai, [
      [base.wrap, 'base.module.css'],
      [aiStyles.report, 'AiSection.module.css'],
    ])
    expect(checked, '본 클래스 수').toBeGreaterThan(0)
    expect(missing).toEqual([])
  })
})

// section#ortho(흰 바탕) > .wrap > 머리(.grid: h2 + p) + PC 표 + 휴대폰 표 (specs/b2b-redesign AC-209.2, 시안 #ortho · landingPhone)
const ORTHO_SHAPE =
  /^(<section\b[^>]*>)(<div\b[^>]*>)(<div\b[^>]*>)(<h2\b[^>]*>)([^<]*)<\/h2>(<p\b[^>]*>)([^<]*)<\/p><\/div>(<table\b[^>]*>)([\s\S]*?)<\/table>(<table\b[^>]*>)([\s\S]*?)<\/table><\/div><\/section>$/
// PC 표 안: thead(빈 모서리 칸 + th × 4) + tbody(줄 × 3)
const PC_TABLE = /^<thead><tr>(<td\b[^>]*>)<\/td>((?:<th\b[^>]*>[^<]*<\/th>){4})<\/tr><\/thead><tbody>((?:<tr>[\s\S]*?<\/tr>){3})<\/tbody>$/
// PC 표 줄 하나: th + td × 4
const PC_ROW = /<tr>(<th\b[^>]*>)([^<]*)<\/th>((?:<td\b[^>]*>[\s\S]*?<\/td>){4})<\/tr>/g
// 휴대폰 표 안: caption + tbody(줄 × 4)
const PHONE_TABLE = /^(<caption\b[^>]*>)([^<]*)<\/caption><tbody>((?:<tr\b[^>]*>[\s\S]*?<\/tr>){4})<\/tbody>$/
// 휴대폰 표 줄 하나: th(이름 + 기준 span) + td(값 쌍)
const PHONE_ROW = /(<tr\b[^>]*>)(<th\b[^>]*>)([^<]*)(<span\b[^>]*>)([^<]*)<\/span><\/th>(<td\b[^>]*>)([\s\S]*?)<\/td><\/tr>/g
// 칸 하나
const CELL = /(<td\b[^>]*>)([\s\S]*?)<\/td>/g
// 값 쌍 하나: span(.kv) > span 이름 + b 값
const PAIR = /(<span\b[^>]*>)<span>([^<]*)<\/span>(<b\b[^>]*>)([^<]*)<\/b><\/span>/g
// 값 쌍 칸 글자: '주사 치료 142건 · F/U 37건'. 쌍 밖에 다른 원소가 있으면 null
const pairsOf = (cell: string) => {
  const pairs = [...cell.matchAll(PAIR)]
  if (pairs.length === 0 || cell.replace(PAIR, '') !== '') return null
  for (const [, kv, , value] of pairs) {
    expect(classesOf(kv)).toContain(orthoStyles.kv)
    expect(classesOf(value)).toContain(orthoStyles.value)
  }
  return pairs.map((m) => `${m[2]} ${m[4]}`).join(' · ')
}
const ORTHO_NAMES = ['주사', '물리치료', '비급여', '월말 보고']
const ORTHO_BASIS = ['이번 달', '오늘', '이번 달', '10월']
const ORTHO_PAIRS = [
  '주사 치료 142건 · F/U 37건',
  '오전 21명 · 오후 17명',
  '도수치료 86건 · 체외충격파 31건',
  '보고서 PDF 1장 · AI 분석 포함',
]

describe('AC-209.2: 정형외과 섹션의 짜임', () => {
  const parts = ortho.match(ORTHO_SHAPE)
  const [, section, wrap, head, h2, h2In, lead, leadIn, pcTable, pcIn, phoneTable, phoneIn] = parts ?? []
  const pc = (pcIn ?? '').match(PC_TABLE)
  const [, corner, colsIn, rowsIn] = pc ?? []
  const rows = [...(rowsIn ?? '').matchAll(PC_ROW)]
  const phone = (phoneIn ?? '').match(PHONE_TABLE)
  const [, caption, captionIn, phoneRowsIn] = phone ?? []
  const phoneRows = [...(phoneRowsIn ?? '').matchAll(PHONE_ROW)]

  it('AC-209.2: section#ortho(흰 바탕 .sec, .secCanvas 아님) > .wrap 안이 머리(.grid .head: h2 .tHeading .title + 안내 p .lead) → PC 표(.pcOnly) → 휴대폰 표(.phoneOnly) 순서다', () => {
    expect(parts, 'section > .wrap > .head(h2 + p) + table + table').not.toBeNull()
    expect(section).toMatch(/\bid="ortho"/)
    expect(classesOf(section)).toContain(base.sec)
    expect(classesOf(section), '흰 바탕(canvas 띠 .secCanvas 아님)').not.toContain(base.secCanvas)
    expect(classesOf(wrap)).toContain(base.wrap)
    expect(classesOf(head)).toEqual(expect.arrayContaining([base.grid, orthoStyles.head]))
    expect(classesOf(h2)).toEqual(expect.arrayContaining([base.tHeading, orthoStyles.title]))
    expect(h2In).toBe('정형외과·통증 의원을 위해 만들었습니다')
    expect(classesOf(lead)).toContain(orthoStyles.lead)
    expect(leadIn).toBe('척추·관절 환자 흐름, 도수·물리치료 처방, 치료사 생산성까지. 정형외과에서 매일 보는 숫자에 맞췄습니다.')
    expect(classesOf(pcTable)).toEqual(expect.arrayContaining([orthoStyles.table, base.pcOnly]))
    expect(classesOf(phoneTable)).toEqual(expect.arrayContaining([orthoStyles.mobile, base.phoneOnly]))
  })

  it('AC-209.2: PC 표 thead는 빈 모서리 칸(.corner) + th(scope="col", .colHead) 주사 · 물리치료 · 비급여 · 월말 보고다', () => {
    expect(pc, 'thead(td + th × 4) + tbody(tr × 3)').not.toBeNull()
    expect(classesOf(corner)).toContain(orthoStyles.corner)
    const cols = [...(colsIn ?? '').matchAll(/(<th\b[^>]*>)([^<]*)<\/th>/g)]
    expect(cols.map((m) => m[2])).toEqual(ORTHO_NAMES)
    for (const [, th] of cols) {
      expect(th).toMatch(/\bscope="col"/)
      expect(classesOf(th)).toContain(orthoStyles.colHead)
    }
  })

  it('AC-209.2: PC 표 tbody는 th(scope="row", .rowHead) 보는 숫자 · 기준 · 예시 세 줄이고, 칸(.cell)은 보는 숫자 · 기준 · 값 쌍(.kv)이다', () => {
    expect(rows).toHaveLength(3)
    expect(rows.map((m) => m[2])).toEqual(['보는 숫자', '기준', '예시'])
    for (const [, th] of rows) {
      expect(th).toMatch(/\bscope="row"/)
      expect(classesOf(th)).toContain(orthoStyles.rowHead)
    }
    const cells = rows.map((m) => [...m[3].matchAll(CELL)])
    for (const row of cells) for (const [, td] of row) expect(classesOf(td)).toContain(orthoStyles.cell)
    expect(cells[0].map((c) => c[2])).toEqual(['주사 치료 수와 F/U', '물리치료 내원 환자 수', '비급여 치료 내역', '한 장으로 받는 월간 보고'])
    expect(cells[1].map((c) => c[2])).toEqual(ORTHO_BASIS)
    expect(cells[2].map((c) => pairsOf(c[2]))).toEqual(ORTHO_PAIRS)
  })

  it('AC-209.2: 휴대폰 표는 caption(.caption) "예시 값" + 줄(.mRow) 4개 — th(scope="row", .mRowHead)는 이름 아래 기준(.mBasis), 칸(.mCell)은 같은 값 쌍이다', () => {
    expect(phone, 'caption + tbody(tr × 4)').not.toBeNull()
    expect(classesOf(caption)).toContain(orthoStyles.caption)
    expect(captionIn).toBe('예시 값')
    expect(phoneRows).toHaveLength(4)
    expect(phoneRows.map((m) => [m[3], m[5]])).toEqual(ORTHO_NAMES.map((name, i) => [name, ORTHO_BASIS[i]]))
    expect(phoneRows.map((m) => pairsOf(m[7]))).toEqual(ORTHO_PAIRS)
    for (const [, tr, th, , basis, , td] of phoneRows) {
      expect(classesOf(tr)).toContain(orthoStyles.mRow)
      expect(th).toMatch(/\bscope="row"/)
      expect(classesOf(th)).toContain(orthoStyles.mRowHead)
      expect(classesOf(basis)).toContain(orthoStyles.mBasis)
      expect(classesOf(td)).toContain(orthoStyles.mCell)
    }
  })

  it('AC-209.2: 두 표는 OrthoSection.tsx의 ORTHO 배열 하나에서 그린다 — 배열은 하나이고, 이름·보는 숫자·기준·예시 값 글자가 소스에 한 번씩만 있다', () => {
    const source = readFileSync(join(LANDING_DIR, 'OrthoSection.tsx'), 'utf8')
    expect(source.match(/^const ORTHO\b/gm) ?? []).toHaveLength(1)
    expect(source.match(/^const [A-Z_]+\s*[:=]/gm) ?? [], '대문자 상수 배열은 ORTHO 하나').toHaveLength(1)
    const once = [
      '주사 치료 수와 F/U',
      '물리치료 내원 환자 수',
      '비급여 치료 내역',
      '한 장으로 받는 월간 보고',
      "'오늘'",
      "'10월'",
      "'142건'",
      "'37건'",
      "'21명'",
      "'17명'",
      "'86건'",
      "'31건'",
      "'PDF 1장'",
      "'포함'",
    ]
    for (const word of once) expect(source.split(word).length - 1, word).toBe(1)
  })

  it('AC-209.2: "F/U 기록"·<figure>·카드(.card·li)·그림·svg·"FOR ORTHO"·색 글자·inline style이 없다', () => {
    expect(ortho).not.toContain('F/U 기록')
    expect(ortho).not.toMatch(/<(figure|figcaption|img|picture|svg|ul|ol|li|article)\b/)
    const allClasses = [...ortho.matchAll(/\bclass="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/))
    expect(allClasses).not.toContain(base.card)
    expect(textOf(ortho)).not.toMatch(/FOR ORTHO/i)
    expect(ortho).not.toMatch(/="#[0-9a-f]{3,8}"/i)
    expect(ortho).not.toMatch(/\bstyle="/)
  })

  it('AC-209.2: 정형외과 섹션에 붙은 클래스가 모두 base.module.css·OrthoSection.module.css에 정의돼 있다', () => {
    const { checked, missing } = classCheck(ortho, [
      [base.wrap, 'base.module.css'],
      [orthoStyles.table, 'OrthoSection.module.css'],
    ])
    expect(checked, '본 클래스 수').toBeGreaterThan(0)
    expect(missing).toEqual([])
  })
})

// ---------- 주사 열 문구 (specs/landing-v2 REQ-114, 2026-10-30 사용자 결정 "F/U 기록을 그냥 F/U로 바꾸자") ----------

describe('AC-114.1: 주사 "F/U 기록" → "F/U"', () => {
  const pcIn = ortho.match(ORTHO_SHAPE)?.[9] ?? ''
  const rows = [...(pcIn.match(PC_TABLE)?.[3] ?? '').matchAll(PC_ROW)]
  // PC 표 주사 열(첫 칸): 줄마다 첫 td
  const injection = rows.map((m) => [m[2], m[3].match(/<td\b[^>]*>([\s\S]*?)<\/td>/)?.[1] ?? ''] as const)
  const cellOf = (row: string) => injection.find(([name]) => name === row)?.[1]

  it('AC-114.1: #ortho의 글자와 마크업 어디에도 "F/U 기록"이 없다', () => {
    expect(textOf(ortho)).not.toContain('F/U 기록')
    expect(ortho).not.toContain('F/U 기록')
  })

  it('AC-114.1: PC 표 주사 열의 "보는 숫자" 칸은 정확히 "주사 치료 수와 F/U"다', () => {
    expect(rows).toHaveLength(3)
    expect(cellOf('보는 숫자')).toBe('주사 치료 수와 F/U')
  })

  it('AC-114.1: PC 표 주사 열의 기준은 이번 달, 예시 줄은 주사 치료 142건 · F/U 37건이다', () => {
    expect(cellOf('기준')).toBe('이번 달')
    const pairs = [...(cellOf('예시') ?? '').matchAll(/<span>([^<]*)<\/span><b\b[^>]*>([^<]*)<\/b>/g)].map((r) => [r[1], r[2]])
    expect(pairs).toEqual([
      ['주사 치료', '142건'],
      ['F/U', '37건'],
    ])
  })
})


// ---------- 기능 섹션의 짜임 (specs/b2b-redesign AC-210.1, 시안 screens.mjs landingPC·landingPhone #features) ----------

// section#features(흰 바탕) > .wrap(.inner: 위 1px line) > h2 + .grid(급여 덩어리 div + 기능 목록 ol)
const FEATURES_SHAPE =
  /^(<section\b[^>]*>)(<div\b[^>]*>)(<h2\b[^>]*>)([^<]*)<\/h2>(<div\b[^>]*>)(<div\b[^>]*>)([\s\S]*)<\/div>(<ol\b[^>]*>)([\s\S]*)<\/ol><\/div><\/div><\/section>$/
// 급여 덩어리 안: 소개 p → h3 → 설명 p → 패널(머리(제목 p + 칩(svg + 글)) + 표)
const PAY_SHAPE =
  /^(<p\b[^>]*>)([^<]*)<\/p>(<h3\b[^>]*>)([^<]*)<\/h3>(<p\b[^>]*>)([^<]*)<\/p>(<div\b[^>]*>)(<div\b[^>]*>)(<p\b[^>]*>)([\s\S]*?)<\/p>(<span\b[^>]*>)(<svg\b[^>]*>[\s\S]*?<\/svg>)([^<]*)<\/span><\/div>(<table\b[^>]*>)([\s\S]*?)<\/table><\/div>$/
// 급여표 안: thead(th × 4) + tbody(줄 × 4, td × 4) + tfoot(줄 하나, td × 2)
const PAY_TABLE =
  /^<thead><tr>((?:<th\b[^>]*>[^<]*<\/th>){4})<\/tr><\/thead><tbody>((?:<tr\b[^>]*>(?:<td\b[^>]*>[^<]*<\/td>){4}<\/tr>){4})<\/tbody><tfoot><tr>((?:<td\b[^>]*>[^<]*<\/td>){2})<\/tr><\/tfoot>$/
// 칸 하나(th·td)
const TCELL = /(<t[hd]\b[^>]*>)([^<]*)<\/t[hd]>/g
// 기능 목록 한 줄: li > 번호 span + h3 + 설명 p 1~2개
const FEATURE_ITEM =
  /(<li\b[^>]*>)(<span\b[^>]*>)([^<]*)<\/span>(<h3\b[^>]*>)([^<]*)<\/h3>((?:<p\b[^>]*>[^<]*<\/p>){1,2})<\/li>/g
const PARA = /(<p\b[^>]*>)([^<]*)<\/p>/g
const PAY_ROWS = [
  ['직원 1', '물리치료사', '420,000원', '3,120,000원'],
  ['직원 2', '도수치료사', '680,000원', '3,480,000원'],
  ['직원 3', '간호조무사', '120,000원', '2,510,000원'],
  ['직원 4', '방사선사', '150,000원', '2,890,000원'],
]
// 기능 목록 다섯 줄: PC 긴 설명(지금 문구)과 휴대폰 짧은 설명(시안 landingPhone 문구). 02는 PC에서 왼쪽 급여 덩어리가 대신한다
const FEATURE_ROWS = [
  {
    num: '01',
    title: '환자 통계',
    pc: 'EMR에서 내려받은 통계 파일을 올리면 신환율·재진율, 7일·14일 재방문, 처방 그룹별 환자 수가 바로 계산됩니다.',
    phone: '통계 파일을 올리면 신환율·재진율, 재방문이 바로 계산됩니다.',
  },
  { num: '02', title: '급여·인센티브', pc: null, phone: '월 실적만 넣으면 급여 계산이 끝납니다.' },
  {
    num: '03',
    title: '매출·재고',
    pc: '매출 흐름을 보고, 재고가 떨어지면 대시보드에 발주 알림을 띄웁니다.',
    phone: '재고가 떨어지면 발주 알림을 띄웁니다.',
  },
  {
    num: '04',
    title: '일일마감·보고',
    pc: '일일마감, 일일보고, 월말보고를 정해진 양식에 맞춰 빠르게 씁니다.',
    phone: '정해진 양식에 맞춰 빠르게 씁니다.',
  },
  {
    num: '05',
    title: '원장님 월간 보고',
    pc: '월말보고·통계 그래프·AI 분석을 한 장에 모아 PDF로 저장합니다.',
    phone: '한 장에 모아 PDF로 저장합니다.',
  },
]
const won = (text: string) => Number(text.replace(/[^\d]/g, ''))

describe('AC-210.1: 기능 섹션의 짜임', () => {
  const parts = features.match(FEATURES_SHAPE)
  const [, section, wrap, h2, h2In, layout, pay, payIn, list, listIn] = parts ?? []
  const payParts = (payIn ?? '').match(PAY_SHAPE)
  const [, kicker, kickerIn, payTitle, payTitleIn, payLead, payLeadIn, panel, panelHead, panelTitle, panelTitleIn, chip, chipSvg, chipText, table, tableIn] =
    payParts ?? []
  const tableParts = (tableIn ?? '').match(PAY_TABLE)
  const [, headIn, bodyIn, footIn] = tableParts ?? []
  const items = [...(listIn ?? '').matchAll(FEATURE_ITEM)]

  it('AC-210.1: section#features(흰 바탕 .sec, .secCanvas 아님) > .wrap(.inner, 위 1px line) 안이 h2(.tHeading .title) → .grid(.layout) 순서이고, 칸 안이 급여 덩어리(.pay·.pcOnly) → 기능 목록 ol(.list)이다', () => {
    expect(parts, 'section > .wrap > h2 + .grid(div + ol)').not.toBeNull()
    expect(section).toMatch(/\bid="features"/)
    expect(classesOf(section)).toContain(base.sec)
    expect(classesOf(section), '흰 바탕(canvas 띠 .secCanvas 아님)').not.toContain(base.secCanvas)
    expect(classesOf(wrap)).toEqual(expect.arrayContaining([base.wrap, featStyles.inner]))
    expect(classesOf(h2)).toEqual(expect.arrayContaining([base.tHeading, featStyles.title]))
    expect(classesOf(layout)).toEqual(expect.arrayContaining([base.grid, featStyles.layout]))
    expect(classesOf(pay), '급여 덩어리는 768px 이상만').toEqual(expect.arrayContaining([featStyles.pay, base.pcOnly]))
    expect(classesOf(list)).toContain(featStyles.list)
  })

  it('AC-210.1: h2는 "매일 하던 일, 이제 숫자가 알아서 움직입니다"이고 태그(줄바꿈 등)가 없다', () => {
    expect(h2In).toBe('매일 하던 일, 이제 숫자가 알아서 움직입니다')
  })

  it('AC-210.1: 급여 덩어리는 소개 p(.tSmall .kicker) "02 · 급여·인센티브" → h3(.tTitle .payTitle) → 설명 p(.payLead, 지금 문구) → 패널(.panel) 순서다', () => {
    expect(payParts, '소개 p + h3 + 설명 p + 패널(머리 + 표)').not.toBeNull()
    expect(classesOf(kicker)).toEqual(expect.arrayContaining([base.tSmall, featStyles.kicker]))
    expect(kickerIn).toBe('02 · 급여·인센티브')
    expect(classesOf(payTitle)).toEqual(expect.arrayContaining([base.tTitle, featStyles.payTitle]))
    expect(payTitleIn).toBe('월 실적만 넣으면 급여 계산이 끝납니다')
    expect(classesOf(payLead)).toContain(featStyles.payLead)
    expect(payLeadIn).toBe(
      '직원별 인센티브 규칙을 한 번 정해 두면, 월 실적으로 급여를 계산하고 확정합니다. 세무사 전달표와 인건비율·치료사 생산성도 함께 나옵니다.',
    )
    expect(classesOf(panel)).toContain(featStyles.panel)
  })

  it('AC-210.1: 패널 머리(.panelHead)는 제목 p(.tSubtitle) "10월 급여" + "예시"(.tSmall .sample) · 칩(.chip .chipPositive) 체크 12px + "10월 확정됨"이다', () => {
    expect(classesOf(panelHead)).toContain(featStyles.panelHead)
    expect(classesOf(panelTitle)).toContain(base.tSubtitle)
    expect(panelTitleIn).toBe(`10월 급여 <span class="${base.tSmall} ${featStyles.sample}">예시</span>`)
    expect(classesOf(chip)).toEqual(expect.arrayContaining([base.chip, base.chipPositive]))
    expect(chipSvg).toBe(renderToStaticMarkup(<Icon name="check" size={12} />))
    expect(chipText).toBe('10월 확정됨')
  })

  it('AC-210.1: 급여표(.table)는 머리 직원·직종·인센티브·합계(th scope="col" .head), 줄 직원 1~4(.row, 예시 금액), 바닥 줄 "합계 4명"(colspan 3) · "12,000,000원"(.sum)이고 금액 칸만 .amount다', () => {
    expect(classesOf(table)).toContain(featStyles.table)
    expect(tableParts, 'thead(th × 4) + tbody(tr × 4) + tfoot(td × 2)').not.toBeNull()
    const heads = [...(headIn ?? '').matchAll(TCELL)]
    expect(heads.map((m) => m[2])).toEqual(['직원', '직종', '인센티브', '합계'])
    for (const [, th] of heads) {
      expect(th).toMatch(/\bscope="col"/)
      expect(classesOf(th)).toContain(featStyles.head)
    }
    expect(heads.map((m) => classesOf(m[1]).includes(featStyles.amount))).toEqual([false, false, true, true])
    const rows = [...(bodyIn ?? '').matchAll(/(<tr\b[^>]*>)([\s\S]*?)<\/tr>/g)]
    expect(rows.map((r) => [...r[2].matchAll(TCELL)].map((c) => c[2]))).toEqual(PAY_ROWS)
    for (const [, tr, cellsIn] of rows) {
      expect(classesOf(tr)).toContain(featStyles.row)
      const cells = [...cellsIn.matchAll(TCELL)]
      for (const [, td] of cells) expect(classesOf(td)).toContain(featStyles.cell)
      expect(cells.map((c) => classesOf(c[1]).includes(featStyles.amount))).toEqual([false, false, true, true])
    }
    const foot = [...(footIn ?? '').matchAll(TCELL)]
    expect(foot.map((c) => c[2])).toEqual(['합계 4명', '12,000,000원'])
    expect(foot[0]?.[1]).toMatch(/\bcolSpan="3"/i)
    for (const [, td] of foot) expect(classesOf(td)).toEqual(expect.arrayContaining([featStyles.cell, featStyles.sum]))
    expect(classesOf(foot[1]?.[1])).toContain(featStyles.amount)
    expect(classesOf(foot[0]?.[1])).not.toContain(featStyles.amount)
  })

  it('AC-210.1: 바닥 줄 합계는 줄 합계 금액의 합이고 사람 수는 줄 수다(plan.md §5 합계는 항목의 합)', () => {
    const totals = PAY_ROWS.map((r) => won(r[3]))
    expect(totals.reduce((a, b) => a + b, 0)).toBe(12_000_000)
    const source = readFileSync(join(LANDING_DIR, 'FeaturesSection.tsx'), 'utf8')
    expect(source, '합계 금액을 글자로 박지 않는다').not.toMatch(/12,000,000|12000000|12_000_000/)
    expect(source, '사람 수를 글자로 박지 않는다').not.toContain('4명')
  })

  it('AC-210.1: 기능 목록 ol(.list)은 li(.item) 5개 — 번호 span(.num) + h3(.tSubtitle .itemTitle) + 설명이고, 02 급여·인센티브 줄만 .phoneOnly다', () => {
    expect(items).toHaveLength(5)
    expect((listIn ?? '').replace(FEATURE_ITEM, ''), 'li 밖의 다른 원소가 없다').toBe('')
    expect(items.map((m) => m[3])).toEqual(FEATURE_ROWS.map((r) => r.num))
    expect(items.map((m) => m[5])).toEqual(FEATURE_ROWS.map((r) => r.title))
    items.forEach(([, li, num, , h3], i) => {
      expect(classesOf(li)).toContain(featStyles.item)
      expect(classesOf(li).includes(base.phoneOnly), `${FEATURE_ROWS[i].num} .phoneOnly`).toBe(FEATURE_ROWS[i].pc === null)
      expect(classesOf(num)).toContain(featStyles.num)
      expect(classesOf(h3)).toEqual(expect.arrayContaining([base.tSubtitle, featStyles.itemTitle]))
    })
  })

  it('AC-210.1: 긴 설명 p(.desc·.pcOnly)는 01·03·04·05의 지금 문구이고, 짧은 설명 p(.short·.phoneOnly)는 다섯 줄 모두 시안 휴대폰 문구다', () => {
    expect(items).toHaveLength(5)
    items.forEach((m, i) => {
      const paras = [...m[6].matchAll(PARA)]
      const want = FEATURE_ROWS[i]
      const long = paras.filter((p) => classesOf(p[1]).includes(featStyles.desc))
      const short = paras.filter((p) => classesOf(p[1]).includes(featStyles.short))
      expect(paras, `${want.num} 설명 p 개수`).toHaveLength(want.pc === null ? 1 : 2)
      expect(long.map((p) => p[2]), `${want.num} 긴 설명`).toEqual(want.pc === null ? [] : [want.pc])
      expect(short.map((p) => p[2]), `${want.num} 짧은 설명`).toEqual([want.phone])
      for (const p of long) expect(classesOf(p[1])).toContain(base.pcOnly)
      for (const p of short) expect(classesOf(p[1])).toContain(base.phoneOnly)
    })
  })

  it('AC-210.1: [직원 A]~[직원 D]·[금액]·통계 미리보기·"통계 파일을 여기에 놓기"·작은 카드·줄바꿈 태그·색 글자·inline style이 없고 svg는 확정 칩의 체크 하나다', () => {
    const text = textOf(features)
    for (const gone of ['[직원', '[금액]', '통계 파일을 여기에 놓기', '처방 그룹 · 환자 수', '18.2%', '확정하면 잠금', '파일을 끌어다 놓으면']) {
      expect(text, gone).not.toContain(gone)
    }
    expect(text, '빈칸 [ ]').not.toMatch(/\[[^\]]*\]/)
    expect(text, '영문 대문자 소제목이 없다').not.toMatch(/[A-Z]{4,}/)
    expect(features).not.toMatch(/<(br|ul|article|figure|img)\b/)
    const allClasses = [...features.matchAll(/\bclass="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/))
    for (const old of [base.card, base.group, base.grid3, base.nowrap, base.tH2, base.tH3, base.tH3l, base.stack, base.head]) {
      expect(allClasses).not.toContain(old)
    }
    expect(features.match(/<svg\b/g) ?? []).toHaveLength(1)
    expect(features.match(/aria-hidden/g) ?? [], 'aria-hidden은 체크 svg 하나').toHaveLength(1)
    expect(features).not.toMatch(/="#[0-9a-f]{3,8}"/i)
    expect(features).not.toMatch(/\bstyle="/)
  })

  it('AC-210.1: 상자는 급여 패널 하나다 — 네 변 테두리 클래스는 .panel 하나이고 마크업에서 div 하나에만 붙는다', () => {
    const boxNames = fourSideBorderClasses(cssOf('FeaturesSection.module.css'))
    expect(boxNames).toEqual(['panel'])
    const bordered = openTags(features).filter((t) => t.classes.includes(featStyles.panel))
    expect(bordered.map((t) => `${t.tag}${t.hidden ? '[aria-hidden]' : ''}`)).toEqual(['div'])
    const baseBoxes = openTags(features).filter((t) => BOX_TAGS.has(t.tag) && t.classes.some((c) => [base.card, base.group].includes(c)))
    expect(baseBoxes).toEqual([])
  })

  it('AC-210.1: 기능 섹션에 붙은 클래스가 모두 base.module.css·FeaturesSection.module.css에 정의돼 있다', () => {
    const { checked, missing } = classCheck(features, [
      [base.wrap, 'base.module.css'],
      [featStyles.panel, 'FeaturesSection.module.css'],
    ])
    expect(checked, '본 클래스 수').toBeGreaterThan(0)
    expect(missing).toEqual([])
  })
})
