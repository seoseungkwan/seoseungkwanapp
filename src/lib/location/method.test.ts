import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CHIP_TEXT,
  HOW,
  HOW_FRAME,
  HOW_IDS,
  HOW_KEYS,
  HOW_TEXT,
  METHOD,
  REPORT,
  bulletText,
  fillHow,
  fillWeights,
  filledHow,
  reportHead,
  reportRows,
  weightsText,
  type HowCtx,
  type HowId,
} from './method'
import { DEFAULT_SCORE_RULE } from './score'
import { LAW_BASIS, isLawId, isSourceId, lawOf } from './sources'

// 분석 방법 글 한 곳(specs/location REQ-7920 AC-7920.1·2·5·6, design.md 19절).
// 글은 requirements '화면 글 기본값' 승인 3 표 그대로라, 시험이 requirements.md 표를 읽어 한 글자씩 견준다.
// 명세가 더하라고 한 것(소득·쓸 힘 줄의 한국사회보장정보원 한 마디)만 표 글에 그 말을 붙여 견준다

const ROOT = process.cwd()
const REQ = readFileSync(join(ROOT, 'specs/location/requirements.md'), 'utf8').replace(/\r\n/g, '\n')
const RESEARCH = readFileSync(join(ROOT, 'specs/location/research/3-medical-and-law.md'), 'utf8')

/** marker 다음에 처음 나오는 표의 본문 줄(머리·가름 줄 뺌)을 칸으로 */
function tableAfter(marker: string): string[][] {
  const at = REQ.indexOf(marker)
  if (at < 0) throw new Error(`requirements.md에 '${marker}'가 없어요`)
  const lines = REQ.slice(at).split('\n')
  const start = lines.findIndex((l) => l.startsWith('|'))
  const rows: string[][] = []
  for (const line of lines.slice(start + 2)) {
    if (!line.startsWith('|')) break
    rows.push(
      line
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim()),
    )
  }
  return rows
}

const METHOD_TABLE = tableAfter("**처음 안내 '이 탭은 이렇게 분석해요'**")
const ORG_TABLE = tableAfter('1번 줄 아래 묶음별 기관 표:')
const LINE_TABLE = tableAfter('근거 나눔:')
const MORE_TABLE = tableAfter('[더 보기] 네 줄:')
const REPORT_TABLE = tableAfter("**한 장 보고서 둘째 장 '이렇게 분석했어요'**")

// 명세(requirements 승인 3 '소득·쓸 힘 묶음 줄의 한국사회보장정보원은 이렇게 봤어요·보고서 둘째 장에도 한 마디 더한다')가 더한 말.
// 기준 날짜 열쇠 [[welfare]](출처 welfare)는 tasks.md TASK-48 (c)가 더했다 — 한 줄·[더 보기]·보고서 기준 날짜 칸에 의료급여 날짜가 나온다
const WELFARE_LINE = ' · 한국사회보장정보원 의료급여·차상위([[welfare]])'
const WELFARE_MORE = ' · 한국사회보장정보원 복지사업 시군구별 수급권자 현황(의료급여·차상위, 시·군·구, [[welfare]])'
const WELFARE_ORG = ' · 한국사회보장정보원'
const WELFARE_DATE = ' · [[welfare:d]]'

const RIVAL4 = '정형외과·신경외과·마취통증·재활'
const ctxOf = (over: Partial<HowCtx> = {}): HowCtx => ({
  asOf: () => null,
  radiusM: 1000,
  sggName: '예시구',
  rivalShort: RIVAL4,
  ...over,
})

// 글 묶음 모두(시험이 훑는 화면 글) — id·칩·출처 id 같은 열쇠 칸은 뺀다
function screenTexts(): string[] {
  const out: string[] = []
  const walk = (v: unknown, key = '') => {
    if (['id', 'chip', 'cites', 'example'].includes(key)) return
    if (typeof v === 'string') out.push(v)
    else if (Array.isArray(v)) v.forEach((x) => walk(x))
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, k)
  }
  walk(HOW)
  walk(METHOD)
  walk(REPORT)
  walk(HOW_TEXT)
  walk(CHIP_TEXT)
  return out
}

const MARK = /\[\[(\w+)(:d)?\]\]/g

describe('AC-7920.2 묶음 열셋 — 이렇게 봤어요 한 줄·[더 보기] 네 줄', () => {
  it('AC-7920.2: 묶음 열셋 id 차례와 틀 칸 이름(comp→rivals·bld→building·vac→vacancy·others→others)', () => {
    expect(HOW_IDS).toEqual(['people', 'income', 'demand', 'comp', 'others', 'price', 'hours', 'traffic', 'photo', 'bld', 'vac', 'land', 'future'])
    expect(Object.keys(HOW)).toEqual(HOW_IDS)
    expect(HOW_FRAME).toEqual({
      people: 'people',
      income: 'income',
      demand: 'demand',
      comp: 'rivals',
      others: 'others',
      price: 'price',
      hours: 'hours',
      traffic: 'traffic',
      photo: 'photo',
      bld: 'building',
      vac: 'vacancy',
      land: 'land',
      future: 'future',
    })
  })

  it('AC-7920.2: 칩 글 — 연구 근거·법 근거·흔히 보는 기준, law-common은 둘', () => {
    expect(CHIP_TEXT).toEqual({
      research: ['연구 근거'],
      law: ['법 근거'],
      'law-common': ['법 근거', '흔히 보는 기준'],
      common: ['흔히 보는 기준'],
    })
    expect(HOW_IDS.map((id) => HOW[id].chip)).toEqual([
      'research',
      'common',
      'common',
      'common',
      'common',
      'common',
      'common',
      'common',
      'law-common',
      'law',
      'common',
      'common',
      'common',
    ])
  })

  it('AC-7920.2: 한 줄 머리·[더 보기] 네 줄 이름·단추 글', () => {
    expect(HOW_TEXT).toEqual({
      label: '이렇게 봤어요',
      more: '더 보기',
      less: '접기',
      rows: { what: '무엇을 봤나', how: '어떻게 셌나', why: '왜 중요한가', basis: '근거' },
    })
  })

  it('AC-7920.2: 한 줄 셋(무엇 · 어떻게 · 왜)과 칩이 requirements 표 열셋 그대로(소득·쓸 힘만 한국사회보장정보원 한 마디 더함)', () => {
    expect(LINE_TABLE).toHaveLength(13)
    for (const [nameCell, chipCell, lineCell] of LINE_TABLE) {
      const m = /^(.+) \(`(\w+)`\)$/.exec(nameCell)
      expect(m, nameCell).not.toBeNull()
      const id = m![2] as HowId
      const h = HOW[id]
      expect(h, id).toBeDefined()
      expect(h.name).toBe(m![1])
      expect(CHIP_TEXT[h.chip].join(' + ')).toBe(chipCell)
      const want = id === 'income' ? lineCell.replace('국토교통부 실거래가([[deal]])', `국토교통부 실거래가([[deal]])${WELFARE_LINE}`) : lineCell
      expect([h.line.what, h.line.how, h.line.why].join(' · '), id).toBe(want)
    }
  })

  it('AC-7920.2: 한 줄 글자 하나 그대로 — 사는 사람', () => {
    expect(HOW.people.line).toEqual({
      what: '행정안전부 주민등록 인구·세대([[pop]]) · 아파트 단지·입주 예정',
      how: '살필 범위에 걸친 동마다 겹친 넓이만큼 나눠 더한 어림이에요',
      why: '정형외과 자리는 낮에 오가는 사람보다 사는 사람과 더 관련이 있었어요',
    })
  })

  it('AC-7920.2: [더 보기] 네 줄(무엇을 봤나·어떻게 셌나·왜 중요한가·근거)이 requirements 표 열셋 그대로', () => {
    expect(MORE_TABLE).toHaveLength(13)
    const byName = new Map(HOW_IDS.map((id) => [HOW[id].name, id]))
    for (const [name, what, how, why, basis] of MORE_TABLE) {
      const id = byName.get(name)
      expect(id, name).toBeDefined()
      const want = id === 'income' ? `${what}${WELFARE_MORE}` : what
      expect(HOW[id!].more, name).toEqual({ what: want, how, why, basis })
    }
  })

  it('AC-7920.2: 소득·쓸 힘 줄에 한국사회보장정보원(의료급여·차상위) 한 마디 — 한 줄·[더 보기]·보고서', () => {
    expect(HOW.income.line.what).toContain('한국사회보장정보원')
    expect(HOW.income.more.what).toContain('한국사회보장정보원')
    expect(REPORT.rows.find((r) => r.id === 'income')!.orgs).toBe(`국세청 · 국토교통부${WELFARE_ORG}`)
  })

  it('AC-7920.2·AC-7920.5: 의료급여·차상위 기준 날짜 — [[welfare]]는 welfare 출처 날짜로 채워 소득·쓸 힘 한 줄·[더 보기]·보고서 기준 날짜 칸에 나오고, 날짜가 없으면 표시만 빠진다', () => {
    const asked: string[] = []
    const ctx = ctxOf({
      asOf: (src) => {
        asked.push(src)
        return src === 'welfare' ? '2025-12-01' : null
      },
    })
    const h = filledHow('income', ctx)
    expect(asked).toContain('welfare')
    expect(h.line.what).toBe('국세청 근로소득 · 국토교통부 실거래가 · 한국사회보장정보원 의료급여·차상위(기준 2025년 12월 1일)')
    expect(h.more.what).toContain('한국사회보장정보원 복지사업 시군구별 수급권자 현황(의료급여·차상위, 시·군·구, 기준 2025년 12월 1일)')
    expect(reportRows(ctx).find((r) => r.id === 'income')!.dates).toBe('2025년 12월 1일')
    const all = ctxOf({ asOf: (src) => ({ income: '2024-12-31', 'apt-trade': '2026-10-31', welfare: '2025-12-01' })[src as string] ?? null })
    expect(reportRows(all).find((r) => r.id === 'income')!.dates).toBe('2024년 12월 31일 · 2026년 10월 31일 · 2025년 12월 1일')
    const none = filledHow('income', ctxOf())
    expect(none.line.what).toBe('국세청 근로소득 · 국토교통부 실거래가 · 한국사회보장정보원 의료급여·차상위')
    expect(none.more.what).toContain('(의료급여·차상위, 시·군·구)')
  })
})

describe('AC-7920.2 fillHow — 출처 기준 날짜·범위·시군구·경쟁 채우기', () => {
  it('AC-7920.2: [[열쇠]]는 그 출처 id로 기준 날짜를 물어 `기준 {날짜}`, [[열쇠:d]]는 날짜만(2026년 11월 15일 모양)', () => {
    const asked: string[] = []
    const ctx = ctxOf({
      asOf: (src) => {
        asked.push(src)
        const at: Record<string, string> = { 'pop-age': '2026-10-31', 'apt-trade': '2026-10', income: '2024년 귀속' }
        return at[src] ?? null
      },
    })
    expect(fillHow('인구([[pop]])', ctx)).toBe('인구(기준 2026년 10월 31일)')
    expect(fillHow('[[pop:d]]', ctx)).toBe('2026년 10월 31일')
    expect(fillHow('거래([[deal]])', ctx)).toBe('거래(기준 2026년 10월)')
    expect(fillHow('[[income:d]] · [[deal:d]]', ctx)).toBe('2024년 귀속 · 2026년 10월')
    expect(asked).toEqual(['pop-age', 'pop-age', 'apt-trade', 'income', 'apt-trade'])
  })

  it('AC-7920.2: 기준 날짜가 없으면 그 표시와 바로 둘레 괄호·쉼표·` · `를 뺀다(빈 괄호 없음)', () => {
    const ctx = ctxOf()
    expect(fillHow(HOW.people.line.what, ctx)).toBe('행정안전부 주민등록 인구·세대 · 아파트 단지·입주 예정')
    expect(fillHow('인구·세대(행정동, [[pop]]) · 동 경계(동 넓이, [[sgis]])', ctx)).toBe('인구·세대(행정동) · 동 경계(동 넓이)')
    expect(fillHow('실거래가([[deal]], 지난 6달)', ctx)).toBe('실거래가(지난 6달)')
    expect(fillHow('[[income:d]] · [[deal:d]]', ctxOf({ asOf: (s) => (s === 'apt-trade' ? '2026-10' : null) }))).toBe('2026년 10월')
    expect(fillHow('[[income:d]] · [[deal:d]]', ctxOf({ asOf: (s) => (s === 'income' ? '2024년 귀속' : null) }))).toBe('2024년 귀속')
    expect(fillHow('[[income:d]] · [[deal:d]]', ctx)).toBe('')
    expect(fillHow('주민등록 인구(2022년 10월 ~ [[pop:d]])', ctx)).toBe('주민등록 인구(2022년 10월 ~)')
    expect(fillHow('인구([[pop]])', ctxOf({ asOf: () => '' }))).toBe('인구')
  })

  it('AC-7920.2: 열셋 글 모두 기준 날짜가 없어도 빈 괄호·쉼표 끝·겹친 가름이 남지 않는다', () => {
    const ctx = ctxOf()
    for (const id of HOW_IDS) {
      const f = filledHow(id, ctx)
      for (const t of [...Object.values(f.line), ...Object.values(f.more)]) {
        expect(t, id).not.toMatch(/\(\s*\)|\(\s*,|,\s*\)|\( | \)| · · |^ · | · $| {2}|\[\[|\{/)
      }
    }
  })

  it('AC-7920.2: {범위}는 distText 글(1km·1.5km·300m), {시군구}는 후보 시·군·구(없으면 시·군·구)', () => {
    expect(fillHow('살필 범위({범위})', ctxOf({ radiusM: 1000 }))).toBe('살필 범위(1km)')
    expect(fillHow('살필 범위({범위})', ctxOf({ radiusM: 1500 }))).toBe('살필 범위(1.5km)')
    expect(fillHow('살필 범위({범위})', ctxOf({ radiusM: 300 }))).toBe('살필 범위(300m)')
    expect(fillHow(HOW.income.more.how, ctxOf({ sggName: '수원시 팔달구' }))).toContain('없어 수원시 팔달구 평균을 그대로')
    expect(fillHow(HOW.income.more.how, ctxOf({ sggName: null }))).toContain('없어 시·군·구 평균을 그대로')
  })

  it('AC-7920.2: {경쟁}은 고른 과목 짧은 이름, 없으면 `고른 과목 없음`', () => {
    expect(fillHow(HOW.comp.line.how, ctxOf())).toBe(`범위 안 경쟁 의원(${RIVAL4})을 세고 사는 사람을 의원 수로 나눴어요`)
    expect(fillHow(HOW.comp.line.how, ctxOf({ rivalShort: '' }))).toBe('범위 안 경쟁 의원(고른 과목 없음)을 세고 사는 사람을 의원 수로 나눴어요')
    expect(fillHow(HOW.comp.more.how, ctxOf({ rivalShort: '정형외과' }))).toContain('(지금: 정형외과)')
    expect(fillHow(HOW.price.more.how, ctxOf())).toContain(`범위 안 경쟁 의원(${RIVAL4})이 올린`)
  })

  it('AC-7920.2: filledHow는 HowLine이 받는 모양({ chip, line, more })으로 채운다', () => {
    const at = (src: string) => (src === 'pop-age' ? '2026-10-31' : null)
    const f = filledHow('people', ctxOf({ asOf: at, radiusM: 700 }))
    expect(f.chip).toBe('research')
    expect(f.line.what).toBe('행정안전부 주민등록 인구·세대(기준 2026년 10월 31일) · 아파트 단지·입주 예정')
    expect(f.more.what).toBe(
      '행정안전부 주민등록 인구·세대(행정동, 기준 2026년 10월 31일) · 국가데이터처 SGIS 동 경계(동 넓이) · 국토교통부 공동주택 기본 정보(법정동) · 한국부동산원 청약홈 분양정보(입주 예정)',
    )
    expect(f.more.how.startsWith('살필 범위(700m)에 걸친')).toBe(true)
    expect(Object.keys(f.more)).toEqual(['what', 'how', 'why', 'basis'])
  })
})

describe('AC-7920.1 처음 안내 — 이 탭은 이렇게 분석해요', () => {
  it('AC-7920.1: 제목·머리 한 줄·맨 아래 단추와 곁글·판 아래 글', () => {
    expect(METHOD.title).toBe('이 탭은 이렇게 분석해요')
    expect(METHOD.lead).toBe('공개 자료로 동네를 넓게 훑고, 고른 자리를 깊게 본 뒤 점수를 매겨요. 숫자마다 어디서 왔는지 적어 두어 직접 확인할 수 있어요.')
    expect(METHOD.sourcesButton).toBe('근거와 출처 모두 보기')
    expect(METHOD.sourcesHelp).toBe('자료 이름·기준 날짜·법 근거 아홉 줄·없는 자료가 다 있어요')
    expect(LAW_BASIS).toHaveLength(9)
    expect(METHOD.panelNote).toBe('처음 화면(후보 없음)에도 같은 안내가 있어요.')
    expect(METHOD.button).toBe('분석 방법')
  })

  it('AC-7920.1: 다섯 줄 — 줄 제목과 글이 requirements 표 그대로(셋째 줄 무게는 처음 무게일 때)', () => {
    expect(METHOD.rows).toHaveLength(5)
    expect(METHOD_TABLE).toHaveLength(5)
    METHOD_TABLE.forEach(([n, title, body], i) => {
      const row = METHOD.rows[i]
      expect(String(i + 1)).toBe(n)
      expect(row.title).toBe(title)
      if (i === 0) {
        expect(row.text).toBe(body)
        expect(row.bullets).toEqual([])
        return
      }
      expect(row.text).toBeNull()
      const want = body.split('<br>').map((b) => b.replace(/^· /, '').replace(/^\*\*(.+?)\*\* — /, '$1 — ').replace(/ \(예: 출처 글씨 하나\)$/, ''))
      const got = row.bullets.map((b) => fillWeights(bulletText(b), DEFAULT_SCORE_RULE.weights))
      expect(got, title).toEqual(want)
    })
  })

  it('AC-7920.1: 굵은 머리 글은 lead로 따로(넓게·깊게·굳혀 두기 …), 다섯째 줄 첫 줄에 예시 출처 pop-age', () => {
    expect(METHOD.rows[1].bullets.map((b) => b.lead)).toEqual(['넓게', '깊게', '굳혀 두기'])
    expect(METHOD.rows[2].bullets.map((b) => b.lead)).toEqual(['다섯 항목', null, '무게와 만점 기준은 내가 정해요', '경쟁 의원 과목도 내가 골라요', null, null])
    expect(METHOD.rows[3].bullets.map((b) => b.lead)).toEqual(['걷는 사람 수', '위반 건축물', '실제 임대료', null])
    expect(METHOD.rows[4].bullets.map((b) => b.example ?? null)).toEqual(['pop-age', null, null])
    expect(METHOD.exampleLabel).toBe('예:')
    expect(bulletText({ lead: '넓게', text: '가' })).toBe('넓게 — 가')
    expect(bulletText({ lead: null, text: '가' })).toBe('가')
  })

  it('AC-7920.1: 첫 줄 아래 묶음별 기관 표 여섯이 requirements 표 그대로', () => {
    expect(ORG_TABLE).toHaveLength(6)
    expect(METHOD.rows[0].orgs.map((o) => [o.group, o.orgs])).toEqual(ORG_TABLE)
    for (const r of METHOD.rows.slice(1)) expect(r.orgs).toEqual([])
  })

  it('AC-7920.1: 무게 숫자는 지금 설정 값 — 처음 무게면 `(처음 무게)`, 바꾸면 그 말을 뺀다', () => {
    expect(weightsText(DEFAULT_SCORE_RULE.weights)).toBe('사는 사람·수요 30 · 경쟁 25 · 교통·흐름 20 · 자리 15 · 비용 10')
    const bullet = bulletText(METHOD.rows[2].bullets[0])
    expect(fillWeights(bullet, DEFAULT_SCORE_RULE.weights)).toBe('다섯 항목 — 사는 사람·수요 30 · 경쟁 25 · 교통·흐름 20 · 자리 15 · 비용 10(처음 무게).')
    const mine = { people: 40, rivals: 20, transit: 20, site: 10, cost: 10 }
    expect(fillWeights(bullet, mine)).toBe('다섯 항목 — 사는 사람·수요 40 · 경쟁 20 · 교통·흐름 20 · 자리 10 · 비용 10.')
  })
})

describe('AC-7920.5 보고서 둘째 장 — 이렇게 분석했어요', () => {
  it('AC-7920.5: 머리 세 줄(후보·이름 · 제목 · 저장한 날·범위)', () => {
    expect(reportHead({ id: 'A', name: '가람역 앞 상가', saved: '2026-11-15', radiusM: 1000 })).toEqual({
      kicker: '입지 분석 보고서 · 둘째 장 · 후보 A 가람역 앞 상가',
      title: '이렇게 분석했어요',
      sub: "자료는 2026년 11월 15일(저장한 날) 값 · 살필 범위 1km · 기관 자료 이름과 이용 조건은 앱의 '근거와 출처'에 모두 있어요",
    })
    expect(reportHead({ id: 'B', name: '나래', saved: null, radiusM: 500 }).sub).toBe(
      "살필 범위 500m · 기관 자료 이름과 이용 조건은 앱의 '근거와 출처'에 모두 있어요",
    )
  })

  it('AC-7920.5: 점수 매기는 법 세 줄(무게는 지금 설정 + (무게는 내가 정해요))', () => {
    expect(REPORT.scoringTitle).toBe('점수 매기는 법')
    expect(REPORT.scoring.map((s) => s.label)).toEqual(['다섯 항목', '매기는 법', '근거'])
    const mine = { people: 35, rivals: 25, transit: 15, site: 15, cost: 10 }
    expect(fillWeights(REPORT.scoring[0].text, mine)).toBe('사는 사람·수요 35 · 경쟁 25 · 교통·흐름 15 · 자리 15 · 비용 10 (무게는 내가 정해요)')
    expect(fillWeights(REPORT.scoring[0].text, DEFAULT_SCORE_RULE.weights)).toBe('사는 사람·수요 30 · 경쟁 25 · 교통·흐름 20 · 자리 15 · 비용 10 (무게는 내가 정해요)')
    expect(REPORT.scoring[1].text).toBe(
      '세부 항목마다 만점 기준으로 0~100점 → 세부 무게로 섞어 항목 점수 → 항목 무게로 섞어 100점 만점. 자료가 없는 것은 빼고 남은 무게로 매겨요.',
    )
    expect(REPORT.scoring[2].text).toBe(
      '사는 사람을 가장 무겁게 둔 것은 연구(이선경 외, 가정의학회지 2009: 정형외과 자리는 낮에 오가는 사람보다 사는 사람과 더 관련)에 기대요. 건물 요건은 법 조문(건축법 시행령 별표 1 · 건축법 제79조 · 의료법 시행규칙 제25조 · 장애인등편의법 시행령 별표 1·2)에 기대요. 나머지 처음 무게·기준은 흔히 보는 기준이에요.',
    )
  })

  it('AC-7920.5: 묶음마다 본 자료 표 열넷(열셋 + 매물·비용) — 묶음·자료(기관)·방법 한 줄·못 본 것이 requirements 표 그대로', () => {
    expect(REPORT.tableTitle).toBe('묶음마다 본 자료')
    expect(REPORT.columns).toEqual(['묶음', '자료(기관)', '기준 날짜', '방법 한 줄', '못 본 것'])
    expect(REPORT.rows.map((r) => r.id)).toEqual([...HOW_IDS, 'cost'])
    expect(REPORT_TABLE).toHaveLength(14)
    REPORT_TABLE.forEach(([name, orgs, , method, missing], i) => {
      const r = REPORT.rows[i]
      expect(r.name).toBe(name)
      if (r.id !== 'cost') expect(r.name).toBe(HOW[r.id].name)
      expect(r.orgs, name).toBe(r.id === 'income' ? `${orgs}${WELFARE_ORG}` : orgs)
      expect(fillHow(r.method, ctxOf()), name).toBe(method)
      expect(r.missing, name).toBe(missing)
    })
  })

  it('AC-7920.5: 기준 날짜 칸은 그 후보 그날 값의 출처별 기준 날짜(같은 묶음 여럿은 ` · `), 없으면 `–`', () => {
    expect(REPORT.rows.map((r) => r.dates)).toEqual([
      '[[pop:d]]',
      `[[income:d]] · [[deal:d]]${WELFARE_DATE}`,
      '[[acc:d]] · [[ind:d]]',
      '[[hira:d]] · [[permit:d]]',
      '[[hira:d]]',
      '[[price:d]]',
      '[[nmc:d]]',
      '[[bus:d]] · [[flow:d]]',
      '열 때마다',
      '[[bld:d]]',
      '[[store:d]]',
      '링크만',
      '[[subscr:d]]',
      '적은 날',
    ])
    const at: Record<string, string> = { 'pop-age': '2026-10-31', 'hosp-list': '2026-11-15', 'clinic-license': '2026-11-20', 'bus-stops': '2026-11-09' }
    const rows = reportRows(ctxOf({ asOf: (s) => at[s] ?? null, rivalShort: '' }))
    expect(rows).toHaveLength(14)
    const byId = new Map(rows.map((r) => [r.id, r]))
    expect(byId.get('people')!.dates).toBe('2026년 10월 31일')
    expect(byId.get('comp')!.dates).toBe('2026년 11월 15일 · 2026년 11월 20일')
    expect(byId.get('traffic')!.dates).toBe('2026년 11월 9일')
    expect(byId.get('income')!.dates).toBe('–')
    expect(byId.get('photo')!.dates).toBe('열 때마다')
    expect(byId.get('cost')!.dates).toBe('적은 날')
    expect(byId.get('comp')!.method).toBe('범위 안 경쟁 의원(고른 과목 없음) 수, 1곳당 사는 사람, 3년 개폐업')
  })

  it('AC-7920.5: 표 아래 늘 못 보는 셋 한 줄·첫 장 끝 문장', () => {
    expect(REPORT.always).toBe(
      "늘 못 보는 것: 걷는 사람 수(교통카드 승하차로 대신) · 위반 건축물(건축물대장을 떼어 직접 확인) · 실제 임대료(붙여 넣은 매물끼리만 견줌). 그 밖의 없는 자료는 앱의 '근거와 출처 › 없는 자료'에 있어요.",
    )
    expect(REPORT.firstPageEnd).toBe('어떻게 분석했는지는 둘째 장에 있어요.')
  })
})

describe('AC-7920.6 글 한 곳 — 출처 표시·근거·영어 낱말', () => {
  it('AC-7920.6: 열쇠 → 출처 id 표가 requirements 그대로(+ TASK-48 (c)의 welfare)이고 모두 SOURCES에 있다', () => {
    expect(HOW_KEYS).toEqual({
      // 의료급여·차상위 기준 날짜(tasks.md TASK-48 (c))
      welfare: 'welfare',
      pop: 'pop-age',
      sgis: 'dongs',
      apt: 'apt-info',
      subscr: 'presale',
      income: 'income',
      deal: 'apt-trade',
      kyung: 'senior',
      gym: 'gym',
      acc: 'accident',
      ind: 'industry',
      hira: 'hosp-list',
      nmc: 'hosp-hours',
      price: 'nonpay',
      permit: 'clinic-license',
      station: 'rail-stations',
      bus: 'bus-stops',
      flow: 'flow-volume',
      bld: 'building',
      store: 'stores',
      listing: 'user',
    })
    for (const id of Object.values(HOW_KEYS)) expect(isSourceId(id), id).toBe(true)
  })

  it('AC-7920.6: 글 속 [[열쇠]]는 모두 표에 있는 열쇠라 SOURCES id로 바뀐다', () => {
    const keys = screenTexts().flatMap((t) => [...t.matchAll(MARK)].map((m) => m[1]))
    expect(keys.length).toBeGreaterThan(30)
    for (const k of keys) {
      expect(Object.keys(HOW_KEYS), k).toContain(k)
      expect(isSourceId(HOW_KEYS[k]), k).toBe(true)
    }
    const asked = new Set<string>()
    const ctx = ctxOf({
      asOf: (s) => {
        asked.add(s)
        return null
      },
    })
    for (const id of HOW_IDS) filledHow(id, ctx)
    reportRows(ctx)
    for (const s of asked) expect(isSourceId(s), s).toBe(true)
  })

  // 법 조문·연구 이름 모양 — '건축법 시행령 별표 1 제3호 라목' · '건축법 제79조' · '장애인등편의법 시행령 별표 1·2' · '이선경 외, 가정의학회지 2009'
  const LAW_CITE = /[가-힣]+법(?: 시행령| 시행규칙)? (?:별표 [\d·]+(?: 제\d+호 [가-힣]목)?|제\d+조(?: 제\d+항)?(?: 제\d+호)?)/g
  const STUDY_CITE = /[가-힣]{2,4} 외, [가-힣]+ \d{4}/g
  // 글에 나와도 되는 조문·연구 → LAW_BASIS id와 그 줄에 있어야 할 글
  const ALLOWED: Record<string, [string, string]> = {
    '건축법 시행령 별표 1 제3호 라목': ['use', '별표 1 제3호 라목'],
    '건축법 시행령 별표 1': ['use', '별표 1'],
    '건축법 제79조': ['violation', '제79조'],
    '의료법 시행규칙 제25조 제3항 제4호': ['violation', '의료법 시행규칙 제25조 제3항 제4호'],
    '의료법 시행규칙 제25조': ['violation', '의료법 시행규칙 제25조'],
    '장애인등편의법 시행령 별표 2': ['bf', '별표 2'],
    '장애인등편의법 시행령 별표 1·2': ['bf', '별표 1'],
    '이선경 외, 가정의학회지 2009': ['catchment', '이선경 외, 가정의학회지 2009'],
  }
  const citesIn = (texts: string[]) => texts.flatMap((t) => [...(t.match(LAW_CITE) ?? []), ...(t.match(STUDY_CITE) ?? [])])
  const textsOf = (id: HowId) => [...Object.values(HOW[id].line), ...Object.values(HOW[id].more)]

  it('AC-7920.6: 글에 나오는 조문·연구는 LAW_BASIS 줄(이선경 외 2009 포함)에 있는 것뿐', () => {
    const found = citesIn(screenTexts())
    expect(found.length).toBeGreaterThan(5)
    for (const c of found) {
      expect(Object.keys(ALLOWED), c).toContain(c)
      const [lawId, part] = ALLOWED[c]
      const law = lawOf(lawId)!
      expect(`${law.law} ${law.article}`, c).toContain(part)
    }
    expect(RESEARCH).toContain('이선경 외, 가정의학회지 2009')
  })

  it('AC-7920.6: 연구 근거·법 근거 칩 줄은 LAW_BASIS id(cites)를 대고, 글의 조문과 cites가 같다', () => {
    for (const id of HOW_IDS) {
      const h = HOW[id]
      for (const c of h.cites) expect(isLawId(c), `${id} ${c}`).toBe(true)
      const fromText = [...new Set(citesIn(textsOf(id)).map((c) => ALLOWED[c][0]))].sort()
      expect([...h.cites].sort(), id).toEqual(fromText)
      if (h.chip === 'research') {
        expect(h.cites, id).toEqual(['catchment'])
        expect(h.more.basis.startsWith('연구 근거 — 이선경 외, 가정의학회지 2009')).toBe(true)
      }
      if (h.chip === 'law') {
        expect(h.cites.length, id).toBeGreaterThan(0)
        expect(h.more.basis.startsWith('법 근거 — ')).toBe(true)
      }
      if (h.chip === 'law-common') {
        expect(h.cites, id).toEqual(['bf'])
        expect(h.more.basis).toContain('법 근거')
        expect(h.more.basis).toContain('흔히 보는 기준이에요')
      }
      if (h.chip === 'common') expect(h.more.basis.startsWith('흔히 보는 기준이에요'), id).toBe(true)
    }
    expect(HOW.bld.cites).toEqual(['use', 'violation', 'bf'])
    expect(HOW.traffic.cites).toEqual(['catchment'])
  })

  it('AC-7920.6: 화면 글에 영어 낱말이 없다(SGIS·TASIS·KTX·MRI·CT·km·m·PDF·A4만)', () => {
    const allowed = new Set(['SGIS', 'TASIS', 'KTX', 'MRI', 'CT', 'km', 'm', 'PDF', 'A'])
    const ctx = ctxOf({ asOf: () => '2026-11-15' })
    const filled = [
      ...screenTexts().map((t) => t.replace(MARK, '')),
      ...HOW_IDS.flatMap((id) => {
        const f = filledHow(id, ctx)
        return [...Object.values(f.line), ...Object.values(f.more)]
      }),
      ...reportRows(ctx).flatMap((r) => [r.name, r.orgs, r.dates, r.method, r.missing]),
    ]
    const words = filled.flatMap((t) => t.match(/[A-Za-z]+/g) ?? [])
    expect(words.filter((w) => !allowed.has(w))).toEqual([])
  })
})
