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
  it('AC-005.1: 기능 02(환자 통계) 설명에 "EMR"이 있다', () => {
    expect(textOf(features)).toContain('EMR에서 내려받은 통계 파일을 올리면')
  })

  // 카드 짜임(옛 figcaption 확인)은 AC-108.3 시험으로 옮겼다(specs/landing-v2 design.md '옛 시험 다루기')
  it('AC-005.1: 정형외과 타일 4개의 설명 문구', () => {
    const text = textOf(ortho)
    for (const line of ['주사 치료 수와 재방문', '물리치료 내원 환자 수', '비급여 치료 내역', '한 장으로 받는 월간 보고']) {
      expect(text).toContain(line)
    }
  })
})

describe('AC-005.2·AC-421.4: 예시 표시와 빈칸', () => {
  it('AC-005.2·AC-421.4: AI 리포트 카드에 "예시" 칩이 있고 "방금 생성"은 없다', () => {
    const text = textOf(ai)
    expect(text).toContain('10월 AI 리포트')
    expect(ai).toMatch(/<span\b[^>]*>예시<\/span>/)
    expect(text).not.toContain('방금 생성')
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

  it('AC-007.1·AC-421.4: 앱에 없는 채팅 칸(말풍선·질문 칩·물어보기 칸)이 없다', () => {
    const text = textOf(ai)
    for (const gone of ['다음 달엔 뭘 보면 좋을까?', 'AI가 답을 쓰는 중', '재방문율이 낮은 처방은?', '인건비율 괜찮아?', 'AI에게 물어보기', '채팅']) {
      expect(text, gone).not.toContain(gone)
    }
    expect(ai).not.toMatch(/placeholder=/)
  })
})

describe('AC-008.1: svg는 꾸밈', () => {
  it('AC-008.1: 세 섹션의 svg가 모두 aria-hidden="true"다', () => {
    const svgs = features.match(/<svg\b[^>]*>/g) ?? []
    expect(svgs.length).toBeGreaterThan(0)
    for (const svg of [...svgs, ...(ai.match(/<svg\b[^>]*>/g) ?? []), ...(ortho.match(/<svg\b[^>]*>/g) ?? [])]) {
      expect(svg).toContain('aria-hidden="true"')
    }
  })

  it('AC-421.9: 세 섹션 글자에 "니다."로 끝나는 문장과 "F/U"가 없다', () => {
    for (const html of [ai, ortho, features]) {
      expect(textOf(html)).not.toMatch(/니다\./)
      expect(html).not.toContain('F/U')
    }
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

// section#ai(띠) > .wrap > .grid > 글(머리 줄 · h2 · p) → 리포트 패널 → 약속 dl
// (specs/ui-90 AC-421.4, 시안 docs/mockups/ui-90/entry/screens.mjs landingPC·landingPhone #ai — 휴대폰은 패널 뒤에 약속).
// 머리 줄의 "준비 중" 칩은 뺐다(specs/ai-report-stats AC-2006.1)
const AI_SHAPE =
  /^(<section\b[^>]*>)(<div\b[^>]*>)(<div\b[^>]*>)(<div\b[^>]*>)(<p\b[^>]*>)(<span\b[^>]*>)([^<]*)<\/span><\/p>(<h2\b[^>]*>)([^<]*)<\/h2>(<p\b[^>]*>)([^<]*)<\/p><\/div>(<div\b[^>]*>)([\s\S]*?)<\/div>(<dl\b[^>]*>)([\s\S]*?)<\/dl><\/div><\/div><\/section>$/
// 약속 하나: div(dt + dd)
const POINT = /(<div\b[^>]*>)(<dt\b[^>]*>)([^<]*)<\/dt>(<dd\b[^>]*>)([^<]*)<\/dd><\/div>/g
// 리포트 패널 안: 머리(h3 + 칩) + 항목 ol. 몸 두 칸·채팅 칸이 없다
const REPORT_SHAPE = /^(<div\b[^>]*>)(<h3\b[^>]*>)([^<]*)<\/h3>(<span\b[^>]*>)([^<]*)<\/span><\/div>(<ol\b[^>]*>)([\s\S]*?)<\/ol>$/
// 항목 하나: li > 칩 span + div(글 p + 근거 p)
const REPORT_ITEM =
  /(<li\b[^>]*>)(<span\b[^>]*>)([^<]*)<\/span>(<div\b[^>]*>)(<p\b[^>]*>)([^<]*)<\/p>(<p\b[^>]*>)([^<]*)<\/p><\/div><\/li>/g
// 시안 AI_POINTS · AI_ITEMS 그대로
const AI_POINTS = [
  ['근거 숫자와 함께', '모든 문장에 어떤 숫자를 보고 말했는지 붙여요.'],
  ["짐작은 '추정'이라고", '원인을 짐작할 때는 추정이라고 분명히 밝혀요.'],
  ['정해 둔 양식 그대로', '월간보고 발표 자료를 우리 의원 양식에 맞춰 채워요.'],
  ['환자 정보 없이', 'AI에는 합계 숫자만 보내요.'],
]
const AI_ITEMS = [
  ['늘었어요', '신환이 지난달보다 늘었어요.', '근거 · 신환 9월 486명 → 10월 524명'],
  ['살펴볼 것', '인건비율이 지난달보다 올랐어요.', '근거 · 인건비 총액 ÷ 매출'],
  ['추정', '도수치료 증가는 신환 증가와 함께 움직인 것으로 보여요.', '근거 · 처방 그룹 ‘도수’ 9월 312건 → 10월 356건'],
]

describe('AC-209.1·AC-421.4: AI 섹션의 짜임', () => {
  const parts = ai.match(AI_SHAPE)
  const [, section, wrap, grid, text, kick, tab, tabIn, h2, h2In, lead, leadIn, report, reportIn, dl, dlIn] = parts ?? []
  const points = [...(dlIn ?? '').matchAll(POINT)]
  const reportParts = (reportIn ?? '').match(REPORT_SHAPE)
  const [, head, h3, h3In, chip, chipIn, list, listIn] = reportParts ?? []
  const items = [...(listIn ?? '').matchAll(REPORT_ITEM)]

  it('AC-421.4: section#ai(.sec·.secCanvas 띠) > .wrap > .grid 안이 글 덩어리(.text) → 리포트 패널(.report) → 약속 dl(.points) 순서다', () => {
    expect(parts, 'section > .wrap > .grid > .text(p · h2 · p) + .report + dl').not.toBeNull()
    expect(section).toMatch(/\bid="ai"/)
    expect(classesOf(section)).toEqual(expect.arrayContaining([base.sec, base.secCanvas]))
    expect(classesOf(wrap)).toContain(base.wrap)
    expect(classesOf(grid)).toEqual(expect.arrayContaining([base.grid, aiStyles.layout]))
    expect(classesOf(text)).toEqual([aiStyles.text])
    expect(classesOf(report)).toEqual([aiStyles.report])
    expect(classesOf(dl)).toEqual([aiStyles.points])
  })

  it('AC-2006.1: 머리 줄(p.kick)에는 칩이 없고 "AI 리포트 탭"(.tSmall .tab)만 있다. "준비 중"은 AI 칸 어디에도 없다', () => {
    expect(parts, '머리 줄 p.kick 안은 span 하나').not.toBeNull()
    expect(classesOf(kick)).toEqual([aiStyles.kick])
    expect(classesOf(tab)).toEqual([base.tSmall, aiStyles.tab])
    expect(classesOf(tab)).not.toContain(base.chip)
    expect(tabIn).toBe('AI 리포트 탭')
    expect(textOf(ai)).not.toContain('준비 중')
    expect(ai).not.toContain('준비 중')
  })

  it('AC-421.4: h2(.tHeading .title)는 "버튼 한 번이면 AI가 이번 달을 읽어 줘요"(태그 없음), 안내 p(.tLead .lead)는 시안 문구다', () => {
    expect(classesOf(h2)).toEqual([base.tHeading, aiStyles.title])
    expect(h2In).toBe('버튼 한 번이면 AI가 이번 달을 읽어 줘요')
    expect(classesOf(lead)).toEqual([base.tLead, aiStyles.lead])
    expect(leadIn).toBe('숫자를 늘어놓는 데서 끝나지 않아요. 무엇이 달라졌는지, 왜 그런지, 다음 달 무엇을 봐야 하는지 말로 정리해요.')
  })

  it('AC-421.4: 약속 <dl>(.points)은 div(.point) 4개 — dt(.pointTitle) + dd(.pointDesc)이고 시안 AI_POINTS 그대로다', () => {
    expect(points).toHaveLength(4)
    expect((dlIn ?? '').replace(POINT, ''), 'div(dt + dd) 밖의 다른 원소가 없다').toBe('')
    expect(points.map((m) => [textOf(m[3]), m[5]])).toEqual(AI_POINTS)
    for (const [, row, dt, , dd] of points) {
      expect(classesOf(row)).toEqual([aiStyles.point])
      expect(classesOf(dt)).toEqual([aiStyles.pointTitle])
      expect(classesOf(dd)).toEqual([aiStyles.pointDesc])
    }
  })

  it('AC-421.4: 리포트 머리(.reportHead)는 h3 .tSubtitle "10월 AI 리포트" + neutral 칩 "예시"(모든 폭 같은 글자)이고, 머리 바로 아래가 항목 목록이다(몸 두 칸·채팅 칸 없음)', () => {
    expect(reportParts, '.report > .reportHead(h3 + 칩) + ol').not.toBeNull()
    expect(classesOf(head)).toEqual([aiStyles.reportHead])
    expect(classesOf(h3)).toEqual([base.tSubtitle])
    expect(h3In).toBe('10월 AI 리포트')
    expect(classesOf(chip)).toEqual([base.chip, base.chipNeutral])
    expect(chipIn).toBe('예시')
    expect(classesOf(list)).toEqual([aiStyles.items])
  })

  it('AC-421.4: 항목 <ol>(.items)은 <li> 3개 — 칩(늘었어요 .chipPositive · 살펴볼 것 .chipWarning · 추정 .chipNeutral) + 글 + 근거(.tSmall .basis)이고 시안 AI_ITEMS 그대로, 셋째 근거만 .pcOnly다', () => {
    expect(items).toHaveLength(3)
    expect((listIn ?? '').replace(REPORT_ITEM, ''), 'li 밖의 다른 원소가 없다').toBe('')
    expect(items.map((m) => [m[3], m[6], m[8]])).toEqual(AI_ITEMS)
    const tones = [base.chipPositive, base.chipWarning, base.chipNeutral]
    items.forEach(([, li, tag, , itemBody, , , basis], i) => {
      expect(classesOf(li)).toEqual([aiStyles.item])
      expect(classesOf(tag)).toEqual([base.chip, tones[i], aiStyles.tag])
      expect(classesOf(itemBody)).toEqual([aiStyles.itemBody])
      expect(classesOf(basis)).toEqual(expect.arrayContaining([base.tSmall, aiStyles.basis]))
      expect(classesOf(basis).includes(base.pcOnly), `근거 ${i + 1} .pcOnly`).toBe(i === 2)
    })
  })

  it('AC-421.4: 상자는 리포트 패널 하나다 — 네 변 테두리 클래스는 .report 하나이고 마크업에서 div 하나에만 붙는다', () => {
    const boxNames = fourSideBorderClasses(cssOf('AiSection.module.css'))
    expect(boxNames).toEqual(['report'])
    const bordered = openTags(ai).filter((t) => t.classes.includes(aiStyles.report))
    expect(bordered.map((t) => `${t.tag}${t.hidden ? '[aria-hidden]' : ''}`)).toEqual(['div'])
    expect(openTags(ai).filter((t) => BOX_TAGS.has(t.tag) && t.classes.some((c) => c === base.card))).toEqual([])
  })

  it('AC-209.1·AC-421.4: [지난달]·[이번 달]·영문 소제목·반짝이·방패·움직이는 점(role="img")·줄바꿈 태그·색 글자·inline style·svg·aria-hidden 그림이 없다', () => {
    const all = textOf(ai)
    expect(all).not.toContain('[지난달]')
    expect(all).not.toContain('[이번 달]')
    expect(all, '빈칸 [ ]').not.toMatch(/\[[^\]]*\]/)
    expect(all, '영문 대문자 소제목이 없다').not.toMatch(/[A-Z]{3,}/)
    expect(ai).not.toMatch(/role="img"|<br\s*\/?>/)
    expect(ai).not.toMatch(/<svg\b/)
    expect(ai).not.toMatch(/aria-hidden/)
    expect(ai).not.toMatch(/="#[0-9a-f]{3,8}"/i)
    expect(ai).not.toMatch(/\bstyle="/)
    const source = readFileSync(join(LANDING_DIR, 'AiSection.tsx'), 'utf8')
    expect(source, '채팅 칸을 그리던 Icon을 부르지 않는다').not.toMatch(/components\/common\/Icon/)
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
// 값 쌍 칸 글자: '주사 치료 142건 · 재방문 37건'. 쌍 밖에 다른 원소가 있으면 null
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
  '주사 치료 142건 · 재방문 37건',
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

  it('AC-209.2·AC-421.5: section#ortho(흰 바탕 .sec, .secCanvas 아님) > .wrap 안이 머리(.grid .head: h2 .tHeading .title + 안내 p .tLead .lead) → PC 표(.pcOnly) → 휴대폰 표(.phoneOnly) 순서다', () => {
    expect(parts, 'section > .wrap > .head(h2 + p) + table + table').not.toBeNull()
    expect(section).toMatch(/\bid="ortho"/)
    expect(classesOf(section)).toContain(base.sec)
    expect(classesOf(section), '흰 바탕(canvas 띠 .secCanvas 아님)').not.toContain(base.secCanvas)
    expect(classesOf(wrap)).toContain(base.wrap)
    expect(classesOf(head)).toEqual(expect.arrayContaining([base.grid, orthoStyles.head]))
    expect(classesOf(h2)).toEqual(expect.arrayContaining([base.tHeading, orthoStyles.title]))
    expect(h2In).toBe('정형외과·통증 의원을 위해 만들었어요')
    expect(classesOf(lead)).toEqual([base.tLead, orthoStyles.lead])
    expect(leadIn).toBe('척추·관절 환자 흐름, 도수·물리치료 처방, 치료사 생산성까지. 정형외과에서 매일 보는 숫자에 맞췄어요.')
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
    expect(cells[0].map((c) => c[2])).toEqual(['주사 치료 수와 재방문', '물리치료 내원 환자 수', '비급여 치료 내역', '한 장으로 받는 월간 보고'])
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
      '주사 치료 수와 재방문',
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

  it('AC-209.2·AC-421.5: "F/U"·<figure>·카드(.card·li)·그림·svg·"FOR ORTHO"·색 글자·inline style이 없다', () => {
    expect(ortho).not.toContain('F/U')
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

// ---------- 주사 열 문구 (specs/ui-90 AC-421.5, UI_GUIDE '문구' "F/U" 대신 "재방문". landing-v2 AC-114.1을 대신한다) ----------

describe('AC-114.1·AC-421.5: 주사 "F/U 기록" → "F/U" → "재방문"(시안 ORTHO)', () => {
  const pcIn = ortho.match(ORTHO_SHAPE)?.[9] ?? ''
  const rows = [...(pcIn.match(PC_TABLE)?.[3] ?? '').matchAll(PC_ROW)]
  // PC 표 주사 열(첫 칸): 줄마다 첫 td
  const injection = rows.map((m) => [m[2], m[3].match(/<td\b[^>]*>([\s\S]*?)<\/td>/)?.[1] ?? ''] as const)
  const cellOf = (row: string) => injection.find(([name]) => name === row)?.[1]

  it('AC-114.1·AC-421.5: #ortho의 글자와 마크업, OrthoSection.tsx 어디에도 "F/U"(옛 "F/U 기록" 포함)가 없다', () => {
    expect(textOf(ortho)).not.toContain('F/U')
    expect(ortho).not.toContain('F/U')
    expect(readFileSync(join(LANDING_DIR, 'OrthoSection.tsx'), 'utf8')).not.toContain('F/U')
  })

  it('AC-421.5: PC 표 주사 열의 "보는 숫자" 칸은 정확히 "주사 치료 수와 재방문"이다', () => {
    expect(rows).toHaveLength(3)
    expect(cellOf('보는 숫자')).toBe('주사 치료 수와 재방문')
  })

  it('AC-421.5: PC 표 주사 열의 기준은 이번 달, 예시 줄은 주사 치료 142건 · 재방문 37건이다', () => {
    expect(cellOf('기준')).toBe('이번 달')
    const pairs = [...(cellOf('예시') ?? '').matchAll(/<span>([^<]*)<\/span><b\b[^>]*>([^<]*)<\/b>/g)].map((r) => [r[1], r[2]])
    expect(pairs).toEqual([
      ['주사 치료', '142건'],
      ['재방문', '37건'],
    ])
  })
})


// ---------- 기능 섹션의 짜임 (specs/ui-90 AC-421.6, 시안 docs/mockups/ui-90/entry/screens.mjs landingPC·landingPhone #features) ----------

// section#features(흰 바탕) > .wrap(.inner: 위 1px line) > h2 + 안내 p + .grid(사전점검 덩어리 div + 기능 목록 ol)
const FEATURES_SHAPE =
  /^(<section\b[^>]*>)(<div\b[^>]*>)(<h2\b[^>]*>)([^<]*)<\/h2>(<p\b[^>]*>)([^<]*)<\/p>(<div\b[^>]*>)(<div\b[^>]*>)([\s\S]*)<\/div>(<ol\b[^>]*>)([\s\S]*)<\/ol><\/div><\/div><\/section>$/
// 사전점검 덩어리 안: 소개 줄 p(글 span + 칩) → h3 → 설명 p(글 + .nw span) → 패널(머리(제목 p + 건수 p) + 표)
const PRE_SHAPE =
  /^(<p\b[^>]*>)(<span\b[^>]*>)([^<]*)<\/span>(<span\b[^>]*>)(<svg\b[^>]*>[\s\S]*?<\/svg>)([^<]*)<\/span><\/p>(<h3\b[^>]*>)([^<]*)<\/h3>(<p\b[^>]*>)((?:[^<]|<span\b[^>]*>[^<]*<\/span>)*)<\/p>(<div\b[^>]*>)(<div\b[^>]*>)(<p\b[^>]*>)([\s\S]*?)<\/p>(<p\b[^>]*>)([^<]*)<\/p><\/div>(<table\b[^>]*>)([\s\S]*?)<\/table><\/div>$/
// 점검 표 안: thead(th × 3) + tbody(줄 × 3)
const CHECK_TABLE = /^<thead><tr>((?:<th\b[^>]*>[^<]*<\/th>){3})<\/tr><\/thead><tbody>((?:<tr\b[^>]*>[\s\S]*?<\/tr>){3})<\/tbody>$/
// 점검 줄 하나: 환자 td · 결과 td(칩 span) · 내용 td(글 + 근거 span 0~1)
const CHECK_ROW =
  /(<tr\b[^>]*>)(<td\b[^>]*>)([^<]*)<\/td>(<td\b[^>]*>)(<span\b[^>]*>)([^<]*)<\/span><\/td>(<td\b[^>]*>)([^<]*)(?:(<span\b[^>]*>)([^<]*)<\/span>)?<\/td><\/tr>/g
// 칸 하나(th·td)
const TCELL = /(<t[hd]\b[^>]*>)([^<]*)<\/t[hd]>/g
// 기능 목록 한 줄: li > 번호 span + h3(이름 + 칩) + 설명 p 1~2개
const FEATURE_ITEM =
  /(<li\b[^>]*>)(<span\b[^>]*>)([^<]*)<\/span>(<h3\b[^>]*>)([^<]*)(<span\b[^>]*>)((?:<svg\b[^>]*>[\s\S]*?<\/svg>)?)([^<]*)<\/span><\/h3>((?:<p\b[^>]*>[^<]*<\/p>){1,2})<\/li>/g
const PARA = /(<p\b[^>]*>)([^<]*)<\/p>/g
// 시안 FEATURES 그대로. 01은 PC에서 왼쪽 사전점검 덩어리가 대신하므로 목록에서는 휴대폰에만 보인다(pc 없음)
const FEATURE_ROWS = [
  { num: '01', title: '청구 · 삭감 예방 사전점검', ready: true, pc: null, phone: '청구하기 전에 삭감될 만한 처방을 미리 찾아 줘요.' },
  {
    num: '02',
    title: '환자 통계',
    ready: false,
    pc: 'EMR에서 내려받은 통계 파일을 올리면 신환율·재진율, 7일·14일 재방문, 처방 그룹별 환자 수를 바로 계산해요.',
    phone: '통계 파일을 올리면 신환율·재진율, 재방문을 바로 계산해요.',
  },
  {
    num: '03',
    title: '매출·재고',
    ready: false,
    pc: '매출 흐름을 보고, 재고가 떨어지면 대시보드에 발주 알림을 띄워요.',
    phone: '재고가 떨어지면 발주 알림을 띄워요.',
  },
  {
    num: '04',
    title: '직원·업무일지',
    ready: false,
    pc: '직원 명단과 급여 계산, 엑셀 양식 그대로의 업무일지를 한곳에서 써요.',
    phone: '급여 계산과 엑셀 양식 그대로의 업무일지를 써요.',
  },
]
// 시안 사전점검 예시 패널 표 세 줄: 환자 · 칩 색 · 결과 · 내용 · 근거
const CHECK_ROWS: [string, string, string, string, string | undefined][] = [
  ['환자 1', base.chipWarning, '확인 필요', '도수치료 처방에 맞는 상병이 없어요', '근거 · 고시 기준'],
  ['환자 2', base.chipAccent, '알림', '같은 주 물리치료 횟수가 기준보다 많아요', '근거 · 고시 기준'],
  ['환자 3', base.chipNeutral, '참고', '추천 상병이 하나 있어요', undefined],
]
const readyChip = () => `<span class="${base.chip} ${base.chipPositive}">${renderToStaticMarkup(<Icon name="check" size={12} />)}쓸 수 있어요</span>`

describe('AC-210.1·AC-421.6: 기능 섹션의 짜임', () => {
  const parts = features.match(FEATURES_SHAPE)
  const [, section, wrap, h2, h2In, lead, leadIn, layout, pre, preIn, list, listIn] = parts ?? []
  const preParts = (preIn ?? '').match(PRE_SHAPE)
  const [, kicker, kickerText, kickerTextIn, chip, chipSvg, chipText, preTitle, preTitleIn, preLead, preLeadIn, panel, panelHead, panelTitle, panelTitleIn, count, countIn, table, tableIn] =
    preParts ?? []
  const tableParts = (tableIn ?? '').match(CHECK_TABLE)
  const [, headIn, bodyIn] = tableParts ?? []
  const checks = [...(bodyIn ?? '').matchAll(CHECK_ROW)]
  const items = [...(listIn ?? '').matchAll(FEATURE_ITEM)]

  it('AC-421.6: section#features(흰 바탕 .sec) > .wrap(.inner, 위 1px line) 안이 h2(.tHeading .title) → 안내 p(.tLead .lead) → .grid(.layout) 순서이고, 칸 안이 사전점검 덩어리(.pre·.pcOnly) → 기능 목록 ol(.list)이다', () => {
    expect(parts, 'section > .wrap > h2 + p + .grid(div + ol)').not.toBeNull()
    expect(section).toMatch(/\bid="features"/)
    expect(classesOf(section)).toEqual([base.sec])
    expect(classesOf(wrap)).toEqual([base.wrap, featStyles.inner])
    expect(classesOf(h2)).toEqual([base.tHeading, featStyles.title])
    expect(classesOf(lead)).toEqual([base.tLead, featStyles.lead])
    expect(classesOf(layout)).toEqual([base.grid, featStyles.layout])
    expect(classesOf(pre), '사전점검 덩어리는 768px 이상만').toEqual([featStyles.pre, base.pcOnly])
    expect(classesOf(list)).toEqual([featStyles.list])
  })

  it('AC-421.6: h2는 "매일 하던 일을 한곳에 모아요", 안내는 "지금은 청구 사전점검을 쓸 수 있고, 나머지 기능은 차례로 열려요."(태그 없음)다', () => {
    expect(h2In).toBe('매일 하던 일을 한곳에 모아요')
    expect(leadIn).toBe('지금은 청구 사전점검을 쓸 수 있고, 나머지 기능은 차례로 열려요.')
  })

  it('AC-421.6: 사전점검 덩어리는 소개 줄 p(.kicker) "01 · 청구 · 삭감 예방 사전점검"(.tSmall .kickerText) + positive 칩(Icon check 12 + "쓸 수 있어요") → h3(.tTitle .preTitle) → 설명 p(.preLead) → 패널(.panel) 순서다', () => {
    expect(preParts, '소개 p(글 + 칩) + h3 + 설명 p + 패널(머리 + 표)').not.toBeNull()
    expect(classesOf(kicker)).toEqual([featStyles.kicker])
    expect(classesOf(kickerText)).toEqual([base.tSmall, featStyles.kickerText])
    expect(kickerTextIn).toBe('01 · 청구 · 삭감 예방 사전점검')
    expect(classesOf(chip)).toEqual([base.chip, base.chipPositive])
    expect(chipSvg).toBe(renderToStaticMarkup(<Icon name="check" size={12} />))
    expect(chipText).toBe('쓸 수 있어요')
    expect(classesOf(preTitle)).toEqual([base.tTitle, featStyles.preTitle])
    expect(preTitleIn).toBe('청구하기 전에 삭감될 만한 처방을 미리 찾아 줘요')
    expect(classesOf(preLead)).toEqual([featStyles.preLead])
    expect((preLeadIn ?? '').replace(/<[^>]+>/g, '')).toBe(
      '비트 PC의 크롬에서 열면 환자마다 점검 결과와 고시 근거, 추천 상병을 보여 줘요. 환자 자료는 그 PC 안에서만 점검해요.',
    )
    expect([...(preLeadIn ?? '').matchAll(/(<span\b[^>]*>)([^<]*)<\/span>/g)].map((m) => [classesOf(m[1]), m[2]])).toEqual([
      [[base.nw], '그 PC 안에서만'],
    ])
    expect(classesOf(panel)).toEqual([featStyles.panel])
  })

  it('AC-421.6: 패널 머리(.panelHead)는 제목 p(.tSubtitle) "10월 28일 사전점검" + "예시"(.tSmall .sample) · "환자 32명 점검"(.tSmall .count)이다', () => {
    expect(classesOf(panelHead)).toEqual([featStyles.panelHead])
    expect(classesOf(panelTitle)).toEqual([base.tSubtitle])
    expect(panelTitleIn).toBe(`10월 28일 사전점검 <span class="${base.tSmall} ${featStyles.sample}">예시</span>`)
    expect(classesOf(count)).toEqual([base.tSmall, featStyles.count])
    expect(countIn).toBe('환자 32명 점검')
  })

  it('AC-421.6: 점검 표(.table)는 머리 환자·점검 결과·내용(th scope="col" .head), 줄 3개(.row) — 환자(.patient) · 칩(확인 필요 warning · 알림 accent · 참고 neutral, .result 칸) · 내용 + 근거(.tCaption .basis)다', () => {
    expect(classesOf(table)).toEqual([featStyles.table])
    expect(tableParts, 'thead(th × 3) + tbody(tr × 3)').not.toBeNull()
    const heads = [...(headIn ?? '').matchAll(TCELL)]
    expect(heads.map((m) => m[2])).toEqual(['환자', '점검 결과', '내용'])
    for (const [, th] of heads) {
      expect(th).toMatch(/\bscope="col"/)
      expect(classesOf(th)).toEqual([featStyles.head])
    }
    expect(checks).toHaveLength(3)
    expect((bodyIn ?? '').replace(CHECK_ROW, ''), '줄 밖의 다른 원소가 없다').toBe('')
    expect(checks.map((m) => [m[3], classesOf(m[5])[1], m[6], m[8], m[10]])).toEqual(CHECK_ROWS)
    for (const [, tr, patient, , result, tag, , body, , basis] of checks) {
      expect(classesOf(tr)).toEqual([featStyles.row])
      expect(classesOf(patient)).toEqual([featStyles.cell, featStyles.patient])
      expect(classesOf(result)).toEqual([featStyles.cell, featStyles.result])
      expect(classesOf(tag)[0]).toBe(base.chip)
      expect(classesOf(body)).toEqual([featStyles.cell])
      if (basis) expect(classesOf(basis)).toEqual([base.tCaption, featStyles.basis])
    }
  })

  it('AC-421.6: 기능 목록 ol(.list)은 li(.item) 4개 — 번호 span(.num) 01~04 + h3(.tSubtitle .itemTitle: 이름 + 칩) + 설명이고, 01 줄만 .phoneOnly다', () => {
    expect(items).toHaveLength(4)
    expect((listIn ?? '').replace(FEATURE_ITEM, ''), 'li 밖의 다른 원소가 없다').toBe('')
    expect(items.map((m) => m[3])).toEqual(['01', '02', '03', '04'])
    expect(items.map((m) => m[5])).toEqual(FEATURE_ROWS.map((r) => r.title))
    items.forEach(([, li, num, , h3], i) => {
      expect(classesOf(li)).toEqual(FEATURE_ROWS[i].pc === null ? [featStyles.item, base.phoneOnly] : [featStyles.item])
      expect(classesOf(num)).toEqual([featStyles.num])
      expect(classesOf(h3)).toEqual([base.tSubtitle, featStyles.itemTitle])
    })
  })

  it('AC-421.6: 768px 이상 첫 보이는 줄은 02다 — 01 줄만 .phoneOnly이고, 목록 위 선은 숨는 줄이 아닌 목록(ol .list)에 있다', () => {
    const visibleAtPc = items.filter(([, li]) => !classesOf(li).includes(base.phoneOnly)).map((m) => m[3])
    expect(visibleAtPc).toEqual(['02', '03', '04'])
    expect(classesOf(items[0]?.[1])).toContain(base.phoneOnly)
    expect(cssOf('FeaturesSection.module.css')).toMatch(/^\.list\s*\{[^}]*border-top:\s*1px solid var\(--line\)/m)
  })

  it('AC-421.6: 01은 positive 칩(Icon check 12 + "쓸 수 있어요"), 02 환자 통계 · 03 매출·재고 · 04 직원·업무일지는 neutral 칩 "준비 중"을 h3 안 이름 뒤에 단다', () => {
    items.forEach((m, i) => {
      const chipMarkup = `${m[6]}${m[7]}${m[8]}</span>`
      if (FEATURE_ROWS[i].ready) expect(chipMarkup, FEATURE_ROWS[i].num).toBe(readyChip())
      else expect(chipMarkup, FEATURE_ROWS[i].num).toBe(`<span class="${base.chip} ${base.chipNeutral}">준비 중</span>`)
    })
  })

  it('AC-421.6·AC-421.8: 긴 설명 p(.desc·.pcOnly)는 02~04의 시안 PC 글이고, 짧은 설명 p(.short·.phoneOnly)는 네 줄 모두 시안 휴대폰 글이다(휴대폰은 01~04 목록 하나)', () => {
    items.forEach((m, i) => {
      const paras = [...m[9].matchAll(PARA)]
      const want = FEATURE_ROWS[i]
      const long = paras.filter((p) => classesOf(p[1]).includes(featStyles.desc))
      const short = paras.filter((p) => classesOf(p[1]).includes(featStyles.short))
      expect(paras, `${want.num} 설명 p 개수`).toHaveLength(want.pc === null ? 1 : 2)
      expect(long.map((p) => p[2]), `${want.num} 긴 설명`).toEqual(want.pc === null ? [] : [want.pc])
      expect(short.map((p) => p[2]), `${want.num} 짧은 설명`).toEqual([want.phone])
      for (const p of long) expect(classesOf(p[1])).toEqual([featStyles.desc, base.pcOnly])
      for (const p of short) expect(classesOf(p[1])).toEqual([featStyles.short, base.phoneOnly])
    })
  })

  it('AC-421.6: 급여 패널(10월 급여·직원 1~4·금액·확정됨)·옛 기능(급여·인센티브·일일마감·원장님 월간 보고)·줄바꿈 태그·색 글자·inline style이 없고 svg는 "쓸 수 있어요" 칩의 체크 둘이다', () => {
    const text = textOf(features)
    for (const gone of ['10월 급여', '직원 1', '3,120,000원', '확정됨', '급여·인센티브', '일일마감', '원장님 월간 보고', '05', '[직원', '[금액]', '통계 파일을 여기에 놓기']) {
      expect(text, gone).not.toContain(gone)
    }
    expect(text, '빈칸 [ ]').not.toMatch(/\[[^\]]*\]/)
    expect(text, '영문 대문자 소제목이 없다').not.toMatch(/[A-Z]{4,}/)
    expect(features).not.toMatch(/<(br|ul|article|figure|img|tfoot)\b/)
    expect(features.match(/<svg\b/g) ?? []).toHaveLength(2)
    expect(features.match(/aria-hidden/g) ?? [], 'aria-hidden은 체크 svg 둘').toHaveLength(2)
    expect(features).not.toMatch(/="#[0-9a-f]{3,8}"/i)
    expect(features).not.toMatch(/\bstyle="/)
  })

  it('AC-421.6: 상자는 사전점검 패널 하나다 — 네 변 테두리 클래스는 .panel 하나이고 마크업에서 div 하나에만 붙는다', () => {
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
