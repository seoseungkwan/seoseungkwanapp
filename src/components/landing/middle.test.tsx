import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import AiSection from './AiSection'
import aiStyles from './AiSection.module.css'
import base from './base.module.css'
import FeaturesSection from './FeaturesSection'
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
    for (const line of ['주사 치료 수와 F/U 기록', '물리치료 내원 환자 수', '비급여 치료 내역', '한 장으로 받는 월간 보고']) {
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

  it('AC-005.2: 모르는 값은 [ ] 빈칸 그대로다', () => {
    expect(textOf(ai)).toContain('근거 · 신환 [지난달]명 → [이번 달]명')
    expect(textOf(ai)).toContain("근거 · 처방 그룹 '도수' [지난달]건 → [이번 달]건")
    const text = textOf(features)
    for (const name of ['[직원 A]', '[직원 B]', '[직원 C]', '[직원 D]']) expect(text).toContain(name)
    expect(text.match(/\[금액\]/g)).toHaveLength(8)
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

// section#ai > .wrap.stack > .head(h2 · p) + .rep(리포트 패널) + ul(약속 4개)
const AI_SHAPE =
  /^(<section\b[^>]*>)(<div\b[^>]*>)(<div\b[^>]*>)(<h2\b[^>]*>)([\s\S]*?)<\/h2>(<p\b[^>]*>)([\s\S]*?)<\/p><\/div>(<div\b[^>]*>)([\s\S]*)<\/div>(<ul\b[^>]*>)([\s\S]*?)<\/ul><\/div><\/section>$/
// .rep > .repHead(h3 + 칩) + .repBody(.repItems(항목 3줄) + .chat)
const REP_SHAPE =
  /^(<div\b[^>]*>)(<h3\b[^>]*>)([\s\S]*?)<\/h3>(<span\b[^>]*>)([\s\S]*?)<\/span><\/div>(<div\b[^>]*>)(<div\b[^>]*>)((?:<div\b[^>]*>[\s\S]*?<\/div>){3})<\/div>(<div\b[^>]*>)([\s\S]*)<\/div><\/div>$/
// 항목 한 줄: 칩 + 글 + 근거(근거 안에는 줄바꿈 막는 span만 있다)
const REP_ITEM =
  /(<div\b[^>]*>)(<span\b[^>]*>)([^<]*)<\/span>(<span\b[^>]*>)([^<]*)<\/span>(<span\b[^>]*>)((?:[^<]|<span\b[^>]*>[^<]*<\/span>)*)<\/span><\/div>/g
// 채팅 칸: 질문 말풍선 + 점 3개 + 칩 2개 + 물어보기 칸(글 + 보내기 아이콘)
const CHAT_SHAPE =
  /^(<div\b[^>]*>)([^<]*)<\/div>(<span\b[^>]*>)((?:<i><\/i>){3})<\/span>(<div\b[^>]*>)((?:<span\b[^>]*>[^<]*<\/span>){2})<\/div>(<div\b[^>]*>)<span>([^<]*)<\/span>(<span\b[^>]*>)(<svg\b[^>]*>)([\s\S]*?)<\/svg><\/span><\/div>$/
// 약속 하나: <li>(h3 + p)
const LIST_ITEM = /(<li\b[^>]*>)(<h3\b[^>]*>)([^<]*)<\/h3>(<p\b[^>]*>)([^<]*)<\/p><\/li>/g

describe('AC-108.1: AI 섹션의 짜임', () => {
  const parts = ai.match(AI_SHAPE)
  const [, section, wrap, head, h2, h2In, lead, leadIn, rep, repIn, list, listIn] = parts ?? []
  const repParts = (repIn ?? '').match(REP_SHAPE)
  const [, repHead, h3, h3In, sample, sampleIn, repBody, repItems, itemsIn, chat, chatIn] = repParts ?? []
  const items = [...(itemsIn ?? '').matchAll(REP_ITEM)]
  const chatParts = (chatIn ?? '').match(CHAT_SHAPE)
  const [, question, questionIn, typing, dots, chips, chipsIn, ask, askText, send, svg, svgIn] = chatParts ?? []
  const points = [...(listIn ?? '').matchAll(LIST_ITEM)]

  it('AC-108.1: section#ai(.sec·.secCanvas) > .wrap.stack 안이 제목 덩어리 → 리포트 패널 → 약속 목록 순서다', () => {
    expect(parts, 'section > .wrap > .head(h2 · p) + .rep + ul').not.toBeNull()
    expect(section).toMatch(/\bid="ai"/)
    expect(classesOf(section)).toEqual(expect.arrayContaining([base.sec, base.secCanvas]))
    expect(classesOf(wrap)).toEqual(expect.arrayContaining([base.wrap, base.stack]))
    expect(classesOf(head)).toContain(base.head)
    expect(classesOf(rep)).toContain(aiStyles.rep)
  })

  it('AC-108.1: h2는 .tH2이고 "버튼 한 번이면,<br/>AI가 이번 달을 읽어 줍니다"뿐이다(강조 span 없음), 안내 글은 .tLead다', () => {
    expect(classesOf(h2)).toContain(base.tH2)
    expect(h2In).toBe('버튼 한 번이면,<br/>AI가 이번 달을 읽어 줍니다')
    expect(classesOf(lead)).toContain(base.tLead)
    expect(textOf(leadIn ?? '')).toBe(
      '숫자를 늘어놓는 데서 끝나지 않습니다. 무엇이 달라졌는지, 왜 그런지, 다음 달 무엇을 봐야 하는지 말로 정리합니다.',
    )
  })

  it('AC-108.1: 리포트 머리는 h3 "10월 AI 리포트" + .chip·.chipSample "방금 생성 · 예시"다', () => {
    expect(repParts, '.rep > .repHead(h3 + 칩) + .repBody(.repItems + .chat)').not.toBeNull()
    expect(classesOf(repHead)).toContain(aiStyles.repHead)
    expect(classesOf(h3)).toContain(base.tH3)
    expect(h3In).toBe('10월 AI 리포트')
    expect(classesOf(sample)).toEqual(expect.arrayContaining([base.chip, base.chipSample]))
    expect(sampleIn).toBe('방금 생성 · 예시')
    expect(classesOf(repBody)).toContain(aiStyles.repBody)
    expect(classesOf(repItems)).toContain(aiStyles.repItems)
    expect(classesOf(chat)).toContain(aiStyles.chat)
  })

  it('AC-108.1: 리포트 항목 3줄은 칩(늘었어요 chipOk · 살펴볼 것 chipAttn · 추정 chipWait) + 글 + 근거다', () => {
    expect(items).toHaveLength(3)
    const tones = [base.chipOk, base.chipAttn, base.chipWait]
    expect(items.map((m) => m[3])).toEqual(['늘었어요', '살펴볼 것', '추정'])
    expect(items.map((m) => textOf(m[5]))).toEqual([
      '신환이 지난달보다 늘었습니다.',
      '인건비율이 지난달보다 올랐습니다.',
      '도수치료 증가는 신환 증가와 함께 움직인 것으로 보입니다.',
    ])
    expect(items.map((m) => textOf(m[7]))).toEqual([
      '근거 · 신환 [지난달]명 → [이번 달]명',
      '근거 · 인건비 총액 ÷ 매출',
      "근거 · 처방 그룹 '도수' [지난달]건 → [이번 달]건",
    ])
    items.forEach(([, row, chip, , text, , basis], i) => {
      expect(classesOf(row)).toContain(aiStyles.repItem)
      expect(classesOf(chip)).toEqual(expect.arrayContaining([base.chip, tones[i], aiStyles.repTag]))
      expect(classesOf(text)).toContain(aiStyles.repText)
      expect(classesOf(basis)).toContain(aiStyles.repBasis)
    })
  })

  it('AC-108.1: 채팅 칸은 질문 말풍선 → 움직이지 않는 점 3개(role="img") → .chipNeutral span 칩 2개 → aria-hidden 물어보기 칸이다', () => {
    expect(chatParts, '질문 div + 점 span(i×3) + 칩 div(span×2) + 물어보기 div(span + 보내기 span>svg)').not.toBeNull()
    expect(classesOf(question)).toContain(aiStyles.question)
    expect(questionIn).toBe('다음 달엔 뭘 보면 좋을까?')
    expect(typing).toMatch(/\brole="img"/)
    expect(typing).toMatch(/\baria-label="AI가 답을 쓰는 중"/)
    expect(classesOf(typing)).toContain(aiStyles.typing)
    expect(dots).toBe('<i></i><i></i><i></i>')
    expect(classesOf(chips)).toContain(base.chips)
    const chipTags = [...(chipsIn ?? '').matchAll(/(<span\b[^>]*>)([^<]*)<\/span>/g)]
    expect(chipTags.map((m) => m[2])).toEqual(['재방문율이 낮은 처방은?', '인건비율 괜찮아?'])
    for (const [, open] of chipTags) expect(classesOf(open)).toEqual(expect.arrayContaining([base.chip, base.chipNeutral]))
    expect(ask).toMatch(/\baria-hidden="true"/)
    expect(classesOf(ask)).toContain(aiStyles.ask)
    expect(askText).toBe('AI에게 물어보기')
    expect(classesOf(send)).toContain(aiStyles.send)
    expect(svg).toMatch(/\baria-hidden="true"/)
    expect(svg).toMatch(/\bstroke="currentColor"/)
    expect(svgIn).toContain('d="M3 9h11M10 4.5L14.5 9 10 13.5"')
  })

  it('AC-108.1: 약속은 <ul class="items itemsFour"> 안의 <li class="item"> 4개(h3 .tH3 + p .tBody)이고 순서가 정해져 있다', () => {
    expect(classesOf(list)).toEqual(expect.arrayContaining([base.items, base.itemsFour]))
    expect(points).toHaveLength(4)
    expect((listIn ?? '').replace(LIST_ITEM, ''), 'li 밖의 다른 원소가 없다').toBe('')
    expect(points.map((m) => textOf(m[3]))).toEqual([
      '근거 숫자와 함께',
      "짐작은 '추정'이라고",
      '이어서 채팅으로 질문',
      '환자 정보 없이',
    ])
    expect(points.map((m) => textOf(m[5]))).toEqual([
      '모든 문장에 어떤 숫자를 보고 말했는지 붙입니다.',
      '원인을 짐작할 때는 추정이라고 분명히 밝힙니다.',
      '리포트를 보다가 궁금한 점을 바로 물어봅니다.',
      'AI에는 합계 숫자만 보내고, 채팅 기록은 저장하지 않습니다.',
    ])
    for (const [, li, h3Tag, , p] of points) {
      expect(classesOf(li)).toContain(base.item)
      expect(classesOf(h3Tag)).toContain(base.tH3)
      expect(classesOf(p)).toContain(base.tBody)
    }
  })

  it('AC-108.1: 영문 소제목·번호 상자·반짝이·방패·색 글자·inline style이 없고 svg는 보내기 하나다', () => {
    expect(textOf(ai)).not.toMatch(/AI ANALYSIS/i)
    expect(textOf(ai), '영문 대문자 소제목이 없다').not.toMatch(/[A-Z]{3,}/)
    expect(ai).not.toContain('M8 1.5l1.6 4.2')
    expect(ai).not.toContain('M11 2l7 3v5')
    expect(ai.match(/<svg\b/g) ?? []).toHaveLength(1)
    expect(ai).not.toMatch(/="#[0-9a-f]{3,8}"/i)
    expect(ai).not.toMatch(/\bstyle="/)
  })

  it('AC-108.1: AI 섹션에 붙은 클래스가 모두 base.module.css·AiSection.module.css에 정의돼 있다', () => {
    const { checked, missing } = classCheck(ai, [
      [base.wrap, 'base.module.css'],
      [aiStyles.rep, 'AiSection.module.css'],
    ])
    expect(checked, '본 클래스 수').toBeGreaterThan(0)
    expect(missing).toEqual([])
  })
})

// section#ortho > .wrap.stack > .head(h2 · p) + ul.grid4.group(li.card × 4)
const ORTHO_SHAPE =
  /^(<section\b[^>]*>)(<div\b[^>]*>)(<div\b[^>]*>)(<h2\b[^>]*>)([^<]*)<\/h2>(<p\b[^>]*>)([^<]*)<\/p><\/div>(<ul\b[^>]*>)([\s\S]*?)<\/ul><\/div><\/section>$/
// 카드 하나: li > .text(h3 + p) + .snip(머리: 기간 · 예시 / 두 줄: 이름 · 값)
const ORTHO_CARD = new RegExp(
  [
    '(<li\\b[^>]*>)',
    '(<div\\b[^>]*>)(<h3\\b[^>]*>)([^<]*)</h3>(<p\\b[^>]*>)([^<]*)</p></div>',
    '(<div\\b[^>]*>)(<div\\b[^>]*>)<span>([^<]*)</span><span>([^<]*)</span></div>',
    '((?:<div\\b[^>]*><span>[^<]*</span><b>[^<]*</b></div>){2})</div>',
    '</li>',
  ].join(''),
  'g',
)

describe('AC-108.3: 정형외과 섹션의 짜임', () => {
  const parts = ortho.match(ORTHO_SHAPE)
  const [, section, wrap, head, h2, h2In, lead, leadIn, list, listIn] = parts ?? []
  const cards = [...(listIn ?? '').matchAll(ORTHO_CARD)]

  it('AC-108.3: section#ortho(흰 바탕 .sec) > .wrap.stack 안이 제목 덩어리(h2 .tH2 + p .tLead) → ul.grid4.group 순서다', () => {
    expect(parts, 'section > .wrap > .head(h2 · p) + ul').not.toBeNull()
    expect(section).toMatch(/\bid="ortho"/)
    expect(classesOf(section)).toContain(base.sec)
    expect(classesOf(section), '흰 바탕(회색 .secCanvas 아님)').not.toContain(base.secCanvas)
    expect(classesOf(wrap)).toEqual(expect.arrayContaining([base.wrap, base.stack]))
    expect(classesOf(head)).toContain(base.head)
    expect(classesOf(h2)).toContain(base.tH2)
    expect(h2In).toBe('정형외과·통증 의원을 위해 만들었습니다')
    expect(classesOf(lead)).toContain(base.tLead)
    expect(leadIn).toBe('척추·관절 환자 흐름, 도수·물리치료 처방, 치료사 생산성까지. 정형외과에서 매일 보는 숫자에 맞췄습니다.')
    expect(classesOf(list)).toEqual(expect.arrayContaining([base.grid4, base.group]))
  })

  it('AC-108.3: <li class="card orthoCard"> 4개이고, 카드마다 .text(h3 .tH3 제목 → p .tBody 설명)가 먼저 온다', () => {
    expect(cards).toHaveLength(4)
    expect((listIn ?? '').replace(ORTHO_CARD, ''), 'li 카드 밖의 다른 원소가 없다').toBe('')
    expect(cards.map((m) => [m[4], m[6]])).toEqual([
      ['주사', '주사 치료 수와 F/U 기록'],
      ['물리치료', '물리치료 내원 환자 수'],
      ['비급여', '비급여 치료 내역'],
      ['월말 보고', '한 장으로 받는 월간 보고'],
    ])
    for (const [, li, text, h3, , p] of cards) {
      expect(classesOf(li)).toEqual(expect.arrayContaining([base.card, orthoStyles.orthoCard]))
      expect(classesOf(text)).toContain(orthoStyles.text)
      expect(classesOf(h3)).toContain(base.tH3)
      expect(classesOf(p)).toContain(base.tBody)
    }
  })

  it('AC-108.3: 카드마다 aria-hidden 숫자 조각(기간 + "예시" + 두 줄)이 있고 값은 시안 그대로다', () => {
    expect(cards).toHaveLength(4)
    const snips = cards.map(([, , , , , , , snip, snipHead, period, mark, rows]) => {
      expect(snip).toMatch(/\baria-hidden="true"/)
      expect(classesOf(snip)).toContain(orthoStyles.snip)
      expect(classesOf(snipHead)).toContain(orthoStyles.snipHead)
      expect(mark).toBe('예시')
      const lines = [...rows.matchAll(/(<div\b[^>]*>)<span>([^<]*)<\/span><b>([^<]*)<\/b><\/div>/g)]
      for (const [, row] of lines) expect(classesOf(row)).toContain(orthoStyles.snipRow)
      return [period, lines.map((m) => `${m[2]} ${m[3]}`).join(' · ')]
    })
    expect(snips).toEqual([
      ['이번 달', '주사 치료 142건 · F/U 기록 37건'],
      ['오늘', '오전 21명 · 오후 17명'],
      ['이번 달', '도수치료 86건 · 체외충격파 31건'],
      ['10월', '보고서 PDF 1장 · AI 분석 포함'],
    ])
  })

  it('AC-108.3: <figure>·figcaption·그림·svg·"FOR ORTHO & PAIN CLINICS"·색 글자·inline style이 없다', () => {
    expect(ortho).not.toMatch(/<(figure|figcaption|img|picture|svg)\b/)
    expect(textOf(ortho)).not.toMatch(/FOR ORTHO/i)
    expect(ortho).not.toMatch(/="#[0-9a-f]{3,8}"/i)
    expect(ortho).not.toMatch(/\bstyle="/)
  })

  it('AC-108.3: 정형외과 섹션에 붙은 클래스가 모두 base.module.css·OrthoSection.module.css에 정의돼 있다', () => {
    const { checked, missing } = classCheck(ortho, [
      [base.wrap, 'base.module.css'],
      [orthoStyles.orthoCard, 'OrthoSection.module.css'],
    ])
    expect(checked, '본 클래스 수').toBeGreaterThan(0)
    expect(missing).toEqual([])
  })
})
