import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import type { CodeMap, DrugInfo, DxFlags, RulesFile, Tables } from '@/types/precheck'

// 원본에서 옮긴 표 네 개(src/lib/precheck/data, REQ-007)가 원본(seoseungkwan/shared@2a1069b)과 같은지 본다.
// 원본은 저장소 밖이라 시험은 원본에서 따로 센 개수·값과 지문(SHA-256)을 상수로 둔다.
// 지문은 옮기기 스크립트가 아니라 원본 파일을 직접 읽어 셌다: JSON.stringify(JSON.parse(원본)) 그대로(규칙표·처방코드 사전),
// 상병은 원본 precheck_dx_flags()의 I·N 목록, 약은 원본 drug_info.lookup()이 화면에 넘기는 [분류번호, 주성분코드, 주성분명(200자까지)]
// 표 파일은 node:fs로 읽는다(이 시험은 번들에 들어가지 않는다. 표를 import하는 곳은 workers/precheck/tables.ts 하나, AC-007.4)

const DATA_DIR = fileURLToPath(new URL('./data/', import.meta.url))
// 시험 안에서 읽는다(파일이 없으면 그 시험만 실패한다). 한 번 읽은 표는 기억한다
const cache = new Map<string, unknown>()
function readTable(name: string): unknown {
  if (!cache.has(name)) cache.set(name, JSON.parse(readFileSync(join(DATA_DIR, name), 'utf-8')))
  return cache.get(name)
}
const sha256 = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

// 원본 tools/precheck_rules.json (2a1069b)
const RULES_VERSION = '2026-10-19'
const RULES_SHA256 = '3cce01ec46873ece7fb931e48edc770877ebe239fafcd952906c33f342a8915a'
const RULE_FIELDS = [
  'id', 'domain', 'title', 'type', 'params', 'grade', 'message', 'basis', 'confidence',
  'data_needed', 'automatable', 'stage', 'enabled_default', 'effective_from', 'effective_to', 'notes',
]
// design.md 8-1 claim_rule_settings.rule_id 제약과 같다
const RULE_ID = /^[A-Z]{2}-[0-9]{2,3}[a-z]?$/

// 원본 assets/knowledge/dx_flags.json → precheck_dx_flags()
const DX_VERSION = '배포용 상병마스터_260329'
const DX_DATE = '2026-04-07'
const DX_SOURCE = '건강보험심사평가원 상병마스터(배포용 상병마스터_260329)'
const DX_I_COUNT = 3186
const DX_N_COUNT = 130
const DX_I_SHA256 = '9617133fb62553da9735e445777c67d66796f3798cb37d3f2a07d5bdd3205c6b'
const DX_N_SHA256 = '03aa76fb7a34ae32989cfc1b2935dd3b81450a68a05a130f420382b9dc7150ac'

// 원본 assets/knowledge/drug_class_map.json → drug_info.lookup()
const DRUG_VERSION = '2026.10.01. 현재 약제급여목록및급여상한금액표(10.2.수정)'
const DRUG_BASE_DATE = '2026-10-01'
const DRUG_SOURCE = '건강보험심사평가원 약제급여목록 및 급여상한금액표(공개용)'
const DRUG_COUNT = 22062
const DRUG_MAP_SHA256 = '6eec5854d2c655bdb68fcb2e31caaa29b47b5c001336ca9958eef021ef608c6f'

// 원본 assets/mx999_v22.html 2157줄 `let CODEMAP = {…}` (CODEMAP_DEF = JSON 왕복)
const CODEMAP_COUNT = 42
const CODEMAP_SHA256 = 'f0ba9996545b23706af23fdfe91e27781274eab140bf522e952e9954be43a839'

const loadChecker = () => import('./tables')

describe('AC-007.1 rules.json은 원본 규칙표와 같다', () => {
  let rules: RulesFile
  beforeEach(() => {
    rules = readTable('rules.json') as RulesFile
  })

  it('AC-007.1: 원본과 같은 version, code_groups 76개, drug_classes 27개, regions 16키, 규칙 262개', () => {
    expect(Object.keys(rules)).toEqual(['version', 'meta', 'code_groups', 'drug_classes', 'regions', 'rules'])
    expect(rules.version).toBe(RULES_VERSION)
    expect(Object.keys(rules.code_groups)).toHaveLength(76)
    expect(Object.keys(rules.drug_classes)).toHaveLength(27)
    expect(Object.keys(rules.regions)).toHaveLength(16)
    expect(rules.rules).toHaveLength(262)
  })

  it('AC-007.1: 규칙마다 원본 16칸이 원본 순서대로 있다', () => {
    for (const rule of rules.rules) expect(Object.keys(rule), rule.id).toEqual(RULE_FIELDS)
  })

  it('AC-007.1: id가 겹치지 않고 모두 ^[A-Z]{2}-[0-9]{2,3}[a-z]?$ 모양이다(DB 제약과 같다)', () => {
    const ids = rules.rules.map((rule) => rule.id)
    expect(new Set(ids).size).toBe(262)
    for (const id of ids) expect(id).toMatch(RULE_ID)
  })

  it('AC-007.1: grade는 확인필요·알림·참고 중 하나다', () => {
    for (const rule of rules.rules) expect(['확인필요', '알림', '참고'], rule.id).toContain(rule.grade)
  })

  it('AC-007.1: basis마다 doc·number가 비지 않은 글자다', () => {
    for (const rule of rules.rules) {
      expect(Array.isArray(rule.basis), rule.id).toBe(true)
      for (const basis of rule.basis) {
        expect(typeof basis.doc === 'string' && basis.doc.trim() !== '', rule.id).toBe(true)
        expect(typeof basis.number === 'string' && basis.number.trim() !== '', rule.id).toBe(true)
      }
    }
  })

  it('AC-007.1: 규칙 내용(문구·근거·등급·조건)을 고치지 않았다 — 원본 전체와 지문이 같다', () => {
    expect(sha256(rules)).toBe(RULES_SHA256)
    const dx01 = rules.rules.find((rule) => rule.id === 'DX-01')
    expect(dx01?.title).toBe('불완전코드·마스터에 없는 상병')
    expect(dx01?.grade).toBe('확인필요')
    expect(dx01?.type).toBe('dx_master')
  })
})

describe('AC-007.2 상병·약·처방코드 표는 원본과 줄 수·값이 같다', () => {
  it('AC-007.2: dxFlags.json은 원본 상병마스터의 불완전코드(I)·주상병 불가(N, V~Y 대분류 뺌) 목록이다', () => {
    const dx = readTable('dxFlags.json') as DxFlags
    expect(Object.keys(dx)).toEqual(['version', 'date', 'source', 'I', 'N'])
    expect([dx.version, dx.date, dx.source]).toEqual([DX_VERSION, DX_DATE, DX_SOURCE])
    expect(dx.I).toHaveLength(DX_I_COUNT)
    expect(dx.N).toHaveLength(DX_N_COUNT)
    expect(sha256(dx.I)).toBe(DX_I_SHA256)
    expect(sha256(dx.N)).toBe(DX_N_SHA256)
    expect([...dx.I].sort()).toEqual(dx.I)
    expect(dx.N.filter((code) => 'VWXY'.includes(code.slice(0, 1)))).toEqual([])
    // 원본 시험 test_claim_precheck.py: 요통 M54.5는 하위 코드로 청구(불완전코드)
    expect(dx.I).toContain('M545')
    expect(dx.I).not.toContain('M5456')
  })

  it('AC-007.2: drugInfo.json은 edi → [분류번호, 주성분코드, 주성분명]이고 원본이 화면에 넘기는 값과 같다', () => {
    const drug = readTable('drugInfo.json') as DrugInfo
    expect(Object.keys(drug)).toEqual(['version', 'base_date', 'source', 'fields', 'map'])
    expect([drug.version, drug.base_date, drug.source]).toEqual([DRUG_VERSION, DRUG_BASE_DATE, DRUG_SOURCE])
    expect(drug.fields).toEqual(['분류번호', '주성분코드', '주성분명'])
    expect(Object.keys(drug.map)).toHaveLength(DRUG_COUNT)
    expect(sha256(drug.map)).toBe(DRUG_MAP_SHA256)
    // 2만 줄이라 expect를 줄마다 부르지 않고 어긋난 줄만 모은다
    const odd = Object.entries(drug.map).filter(
      ([edi, info]) => !/^\d{9}$/.test(edi) || info.length !== 3 || Array.from(info[2]).length > 200,
    )
    expect(odd).toEqual([])
    expect(drug.map['645302132']).toEqual(['112', '130830ASY', 'chloral hydrate 9.5g(0.1g/mL)'])
  })

  it('AC-007.2: codeMap.json은 원본 기본 CODEMAP(처방코드 → 이름·종류·부위·메모)과 같다', () => {
    const codeMap = readTable('codeMap.json') as CodeMap
    expect(Object.keys(codeMap)).toHaveLength(CODEMAP_COUNT)
    expect(sha256(codeMap)).toBe(CODEMAP_SHA256)
    expect(codeMap.LA247).toEqual({ n: 'SSNB', k: 'proc', rg: 'shoulder' })
    expect(codeMap.EB422).toEqual({
      n: '흉부초음파',
      k: 'note',
      rg: null,
      memo: 'x-ray에서 확인되지 않는 골절 여부 확인 위해 초음파 시행. {골절}',
    })
  })
})

// 모양이 맞는 아주 작은 표(가짜 값). 시험마다 한 곳만 망가뜨려 checkTables가 던지는지 본다
function tinyTables(): Tables {
  return {
    rules: {
      version: '2099-01-01',
      meta: { title: '가짜' },
      code_groups: {},
      drug_classes: {},
      regions: {},
      rules: [
        {
          id: 'ZZ-01',
          domain: '가짜',
          title: '가짜 규칙',
          type: 'claim_code',
          params: {},
          grade: '알림',
          message: '가짜 안내',
          basis: [{ doc: '가짜 고시', number: '제0000-0호', effective: '2099-01-01', url: 'https://example.invalid/' }],
          confidence: '상',
          data_needed: ['rx_lines'],
          automatable: 'yes',
          stage: ['memo'],
          enabled_default: true,
          effective_from: null,
          effective_to: null,
          notes: '',
        },
      ],
    },
    dxFlags: { version: '가짜', date: '2099-01-01', source: '가짜', I: ['Z99'], N: ['Z990'] },
    drugInfo: {
      version: '가짜',
      base_date: '2099-01-01',
      source: '가짜',
      fields: ['분류번호', '주성분코드', '주성분명'],
      map: { '999000010': ['114', '999901ATB', '가짜성분 100mg'] },
    },
    codeMap: { ZZ001: { n: '가짜차단', k: 'proc', rg: null }, ZZ002: { n: '가짜처치', k: 'note', rg: null, memo: '{부위} 가짜' } },
  }
}

// 망가뜨린 표를 만든다. 타입 밖 값을 넣으려고 느슨한 기록으로 다룬다(rule = 첫 규칙, basis = 그 규칙의 첫 근거)
type Rec = Record<string, unknown>
type Loose = { rules: Rec & { rules: Rec[] }; dxFlags: Rec; drugInfo: Rec & { map: Rec }; codeMap: Record<string, Rec> }
function broken(change: (t: Loose, rule: Rec, basis: Rec) => void): unknown {
  const t = structuredClone(tinyTables()) as unknown as Loose
  const rule = t.rules.rules[0]
  change(t, rule, (rule.basis as Rec[])[0])
  return t
}

describe('AC-007.1·AC-007.5 checkTables는 표 모양을 검사한다', () => {
  it('AC-007.1: 원본에서 옮긴 네 표는 통과하고 그대로 돌려준다', async () => {
    const { checkTables } = await loadChecker()
    const real = {
      rules: readTable('rules.json'),
      dxFlags: readTable('dxFlags.json'),
      drugInfo: readTable('drugInfo.json'),
      codeMap: readTable('codeMap.json'),
    }
    const tables = checkTables(real)
    expect(tables.rules).toBe(real.rules)
    expect(tables.codeMap).toBe(real.codeMap)
  })

  it('AC-007.1: 모양이 맞는 작은 표는 통과한다', async () => {
    const { checkTables } = await loadChecker()
    expect(checkTables(tinyTables()).rules.rules[0].id).toBe('ZZ-01')
  })

  it.each([
    ['표가 객체가 아님', () => null],
    ['네 표 중 하나가 없음', () => broken((t) => Reflect.deleteProperty(t, 'codeMap'))],
    ['규칙이 하나도 없음', () => broken((t) => (t.rules.rules = []))],
    ['규칙 id가 겹침', () => broken((t, rule) => t.rules.rules.push({ ...rule }))],
    ['규칙 id 모양이 다름(LA-1)', () => broken((_t, rule) => (rule.id = 'LA-1'))],
    ['규칙 id 모양이 다름(끝 소문자 둘)', () => broken((_t, rule) => (rule.id = 'ZZ-01ab'))],
    ['등급이 셋 밖', () => broken((_t, rule) => (rule.grade = '나쁨'))],
    ['조건 종류가 18가지 밖', () => broken((_t, rule) => (rule.type = 'unknown_kind'))],
    ['basis에 number가 없음', () => broken((_t, _rule, basis) => delete basis.number)],
    ['basis doc이 빈 글자', () => broken((_t, _rule, basis) => (basis.doc = ' '))],
    ['16칸 중 하나가 빠짐', () => broken((_t, rule) => delete rule.notes)],
    ['16칸 밖의 칸이 있음', () => broken((_t, rule) => (rule.extra = 1))],
    ['enabled_default가 참거짓이 아님', () => broken((_t, rule) => (rule.enabled_default = 'true'))],
    ['effective_from이 날짜 모양이 아님', () => broken((_t, rule) => (rule.effective_from = '2026/01/01'))],
    ['상병 I 목록이 글자 목록이 아님', () => broken((t) => (t.dxFlags.I = 'M545'))],
    ['약 성분이 세 칸이 아님', () => broken((t) => (t.drugInfo.map['999000010'] = ['114', '999901ATB']))],
    ['처방코드 이름이 없음', () => broken((t) => delete t.codeMap.ZZ001.n)],
    ['처방코드 부위가 글자·null이 아님', () => broken((t) => (t.codeMap.ZZ001.rg = 3))],
  ])('AC-007.1·AC-007.5: %s이면 던진다', async (_name, make) => {
    const { checkTables } = await loadChecker()
    expect(() => checkTables(make())).toThrow()
  })
})
