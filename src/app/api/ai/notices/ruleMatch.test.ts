import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadTables } from '@/workers/precheck/tables'
import { createRuleIndexLoader, defaultRuleIndex, matchRules, ruleBasisIndex, type RuleBasisIndex } from './ruleMatch'

// 점검 규칙 연결(specs/notices requirements REQ-7409 AC-7409.4·AC-7409.5, design 7절).
// 규칙표는 workers/precheck/tables.ts의 loadTables로만 부른다(AC-007.4: 표 파일을 import하는 곳은 그 파일 하나).
// 시험은 실제 파일 내용을 앞뒤로 읽어 바뀌지 않았는지만 본다

const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url))
const RULES_PATH = join(ROOT, 'src', 'lib', 'precheck', 'data', 'rules.json')
const readRulesText = () => readFileSync(RULES_PATH, 'utf-8')

const rulesFile = (rules: unknown[]) => ({ version: 't', meta: {}, code_groups: {}, drug_classes: {}, regions: {}, rules })
const rule = (id: string, title: string, numbers: string[]) => ({ id, title, basis: numbers.map((number) => ({ doc: '근거', number })) })

// 작은 가짜 규칙표
const SMALL = ruleBasisIndex(
  rulesFile([
    rule('PT-02', '물리치료 하루 횟수', ['보건복지부 고시 제2023-56호(구 제2011-37호)']),
    rule('DX-01', '불완전코드', ['data.go.kr 15067467', '보건복지부 고시 제2026-183호']),
    rule('CL-03', '청구 서식', ['보건복지부 고시 제2026-183호', '심평원 공고 제2025-210호']),
    rule('IN-01', '주사 기준', ['보건복지부 고시 제2024-297호']),
    rule('EX-01', '통계 분류', ['질병관리청 고시 제2025-5호']),
  ]),
)

describe('AC-7409.4 ruleBasisIndex', () => {
  it("AC-7409.4: 실제 rules.json의 basis[].number 고시 번호마다 규칙 { id, title } 목록이고 '2026-183'에 DX-01이 있다", () => {
    const raw = JSON.parse(readRulesText()) as { rules: { id: string; title: string }[] }
    const index = ruleBasisIndex(raw)
    const dx01 = raw.rules.find((r) => r.id === 'DX-01')
    expect(dx01).toBeDefined()
    expect(index.get('2026-183')).toContainEqual({ id: 'DX-01', title: dx01?.title })
    // 목록 안 규칙은 id 차례이고 겹침이 없다
    for (const [no, hits] of index) {
      expect(no).toMatch(/^\d{4}-[1-9]\d{0,3}$|^\d{4}-0$/)
      const ids = hits.map((h) => h.id)
      expect(ids).toEqual([...new Set(ids)].sort())
      for (const h of hits) expect(Object.keys(h).sort()).toEqual(['id', 'title'])
    }
    // 공고·다른 기관 번호는 열쇠가 아니다(심평원 공고 제2025-210호)
    expect(index.has('2025-210')).toBe(false)
    // 이어 적은 번호도 열쇠다(보건복지부 고시 제2026-134호·제2026-135호·제2026-136호·제2026-137호)
    for (const no of ['2026-134', '2026-135', '2026-136', '2026-137']) expect(index.get(no)?.length ?? 0).toBeGreaterThan(0)
  })

  it('AC-7409.4: 작은 규칙표에서 번호마다 규칙을 모으고, 다른 기관 고시·공고는 빼며 id 차례다', () => {
    expect(SMALL.get('2026-183')).toEqual([
      { id: 'CL-03', title: '청구 서식' },
      { id: 'DX-01', title: '불완전코드' },
    ])
    expect(SMALL.get('2023-56')).toEqual([{ id: 'PT-02', title: '물리치료 하루 횟수' }])
    expect(SMALL.has('2011-37')).toBe(false)
    expect(SMALL.has('2025-5')).toBe(false)
    expect(SMALL.has('2025-210')).toBe(false)
    expect([...SMALL.keys()].sort()).toEqual(['2023-56', '2024-297', '2026-183'])
  })

  it('AC-7409.4: 모양이 다른 표(규칙 없음·칸 빠짐)는 빈 색인이거나 그 줄만 건너뛴다', () => {
    expect(ruleBasisIndex(null).size).toBe(0)
    expect(ruleBasisIndex({}).size).toBe(0)
    expect(ruleBasisIndex({ rules: 'x' }).size).toBe(0)
    const partial = ruleBasisIndex(
      rulesFile([{ id: 'A-01', basis: [{ number: '고시 제2026-1호' }] }, { id: 'A-02', title: '둘', basis: 'x' }, rule('A-03', '셋', ['고시 제2026-1호'])]),
    )
    expect([...partial]).toEqual([['2026-1', [{ id: 'A-03', title: '셋' }]]])
  })

  it('AC-7409.4: defaultRuleIndex는 loadTables의 실제 규칙표로 한 번 만들어 기억한다', async () => {
    const first = await defaultRuleIndex()
    expect(first).not.toBeNull()
    expect(first?.get('2026-183')?.some((h) => h.id === 'DX-01')).toBe(true)
    expect(await defaultRuleIndex()).toBe(first)
  }, 30_000) // 표 네 개를 처음 변환하느라 느릴 수 있다

  it('AC-7409.4: 규칙표 불러오기가 실패하면 null이고, 다음에 다시 부른다', async () => {
    const tables = await loadTables()
    expect(tables.ok).toBe(true)
    let calls = 0
    const load = createRuleIndexLoader(async () => {
      calls += 1
      return calls === 1 ? { ok: false, code: 'E-RULES-LOAD-FAILED' } : tables
    })
    expect(await load()).toBeNull()
    const again = await load()
    expect(again?.get('2026-183')?.some((h) => h.id === 'DX-01')).toBe(true)
    expect(await load()).toBe(again)
    expect(calls).toBe(2)
  }, 30_000)
})

describe('AC-7409.5 matchRules', () => {
  it("AC-7409.5: AI가 준 번호와 본문의 '변경 전 고시 (고시 제…호' 번호를 합쳐 규칙과 맞춘다(겹침 없음, id 차례)", () => {
    const body = '고시 신설/개정 전체내용 …\n☞ 변경 전 고시 (고시 제2024-297호, 2025.1.1.시행)\n「건강보험 행위 급여·비급여 목록표」 …'
    expect(matchRules(['2026-183', '2023-56'], body, '2026-234', SMALL)).toEqual([
      { id: 'CL-03', title: '청구 서식' },
      { id: 'DX-01', title: '불완전코드' },
      { id: 'IN-01', title: '주사 기준' },
      { id: 'PT-02', title: '물리치료 하루 횟수' },
    ])
    // 같은 번호가 두 번 와도 한 번
    expect(matchRules(['2026-183', '제2026-183호'], '변경 전 고시 (고시 제2026-183호, 2026.8.31.)', null, SMALL)).toEqual([
      { id: 'CL-03', title: '청구 서식' },
      { id: 'DX-01', title: '불완전코드' },
    ])
  })

  it('AC-7409.5: 글 자신의 번호는 넣지 않는다', () => {
    expect(matchRules(['2026-183'], '', '2026-183', SMALL)).toEqual([])
    expect(matchRules([], '변경 전 고시 (고시 제2026-183호)', '2026-183', SMALL)).toEqual([])
    expect(matchRules(['2026-183', '2024-297'], '', '2026-183', SMALL)).toEqual([{ id: 'IN-01', title: '주사 기준' }])
  })

  it('AC-7409.5: AI 번호는 여러 꼴(제…호·고시 제…호·앞 0)을 읽고, 다른 기관 고시·번호 아닌 글은 버린다', () => {
    expect(matchRules(['고시 제2024-297호'], '', null, SMALL)).toEqual([{ id: 'IN-01', title: '주사 기준' }])
    expect(matchRules(['보건복지부 고시 제2024-0297호'], '', null, SMALL)).toEqual([{ id: 'IN-01', title: '주사 기준' }])
    expect(matchRules(['2023-056'], '', null, SMALL)).toEqual([{ id: 'PT-02', title: '물리치료 하루 횟수' }])
    expect(matchRules(['질병관리청 고시 제2025-5호', '없음', '', '공고 제2026-183호'], '', null, SMALL)).toEqual([])
    // 본문의 다른 번호(변경 전 고시가 아닌 것)는 보지 않는다
    expect(matchRules([], '보건복지부 고시 제2026-183호에 따라', null, SMALL)).toEqual([])
    expect(matchRules([], '', null, SMALL)).toEqual([])
  })

  it('AC-7409.5: 맞춘 규칙은 DB 한도 50개까지만 돌려준다(id 차례 앞부터)', () => {
    const many = ruleBasisIndex(rulesFile(Array.from({ length: 60 }, (_, i) => rule(`R-${String(i).padStart(3, '0')}`, `규칙 ${i}`, ['고시 제2026-9호']))))
    const hits = matchRules(['2026-9'], '', null, many)
    expect(hits).toHaveLength(50)
    expect(hits[0].id).toBe('R-000')
    expect(hits[49].id).toBe('R-049')
  })

  it('AC-7409.5: rules.json은 바뀌지 않는다(시험 앞뒤 파일 내용이 같고, 돌려준 값을 고쳐도 색인이 그대로다)', async () => {
    const before = readRulesText()
    const tables = await loadTables()
    expect(tables.ok).toBe(true)
    if (!tables.ok) return
    const snapshot = JSON.stringify(tables.value.rules)
    const index: RuleBasisIndex = ruleBasisIndex(tables.value.rules)
    const hits = matchRules(['2026-183'], '변경 전 고시 (고시 제2024-297호, 2025.1.1.시행)', '2026-234', index)
    expect(hits.some((h) => h.id === 'DX-01')).toBe(true)
    hits[0].title = '바꿈'
    hits.length = 0
    expect(matchRules(['2026-183'], '변경 전 고시 (고시 제2024-297호, 2025.1.1.시행)', '2026-234', index)[0].title).not.toBe('바꿈')
    const def = await defaultRuleIndex()
    if (def) matchRules(['2026-183', '2024-297', '2023-56'], '', null, def)
    expect(JSON.stringify(tables.value.rules)).toBe(snapshot)
    expect(readRulesText()).toBe(before)
  }, 30_000)
})
