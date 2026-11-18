import { beforeAll, describe, expect, it } from 'vitest'
import type { CatalogCode, DrugInfoEntry, Tables } from '@/types/precheck'
import { loadTables } from '@/workers/precheck/tables'
import { chosenRole, drugRole, drugRoles } from './drugRoles'
import type { MemoCode } from './memo/types'

// 약 역할을 성분으로(REQ-6608, design.md 10절). 약 표 줄은 약제급여목록(drugInfo.json)에 있는 값을 그대로 옮겼다

let tables: Tables
beforeAll(async () => {
  const loaded = await loadTables()
  if (!loaded.ok) throw new Error(loaded.code)
  tables = loaded.value
}, 60_000) // 약 표 JSON이 커서 바쁜 기계에서는 첫 읽기가 10초를 넘는다

const ROW: Record<string, DrugInfoEntry> = {
  triamcinolone: ['245', '243335BIJ', 'triamcinolone acetonide 40mg(40mg/mL)'],
  dexamethasone: ['245', '142232BIJ', 'dexamethasone disodium phosphate 5mg(5mg/mL)'],
  methylprednisolone: ['245', '193601BIJ', 'methylprednisolone sodium succinate (as methylprednisolone 0.125g)'],
  betamethasone: ['245', '116530BIJ', 'betamethasone sodium phosphate (as betamethasone 4mg(4mg/mL))'],
  lidocaine: ['121', '183935BIJ', 'lidocaine hydrochloride 0.4g(20mg/mL)'],
  lidocaineEpinephrine: ['121', '314300BIJ', 'epinephrine bitartrate (as epinephrine 18μg(10μg/mL)), lidocaine hydrochloride 36mg(20mg/mL)'],
  bupivacaine: ['121', '120131BIJ', 'bupivacaine hydrochloride 50mg(2.5mg/mL)'],
  ropivacaine: ['121', '225031BIJ', 'ropivacaine hydrochloride 40mg(2mg/mL)'],
  mepivacaine: ['121', '190431BIJ', 'mepivacaine hydrochloride 0.4g(20mg/mL)'],
  hyaluronate: ['399', '530045BIJ', 'sodium hyaluronate 20mg(10mg/mL)'],
  crosslinked: ['399', '526030BIJ', 'BDDE bridged sodium hyaluronate gel (as butanediol diglycidyl ether bridged sodium hyaluronate 60mg(20mg/mL))'],
  // 분류 245(부신피질호르몬)에도 성분이 아닌 약이 있다
  epinephrine: ['245', '152630BIJ', 'epinephrine hydrochloride (as epinephrine 1mg(1mg/mL))'],
  iohexol: ['721', '176331BIJ', 'iohexol 6.47g(0.647g/mL)'],
  ketorolac: ['114', '180033BIJ', 'ketorolac tromethamine 30mg(30mg/mL)'],
  // 눈(131·132)
  eyeTriamcinolone: ['131', '243340BIJ', 'triamcinolone acetonide 40mg(1mg/g)'],
  eyeHyaluronate: ['131', '530024BIJ', 'sodium hyaluronate 8.5mg(10mg/mL)'],
  // 먹는 약(A)·바르는 약(C)
  dexamethasoneTablet: ['245', '141904ATB', 'dexamethasone 4mg'],
  lidocainePatch: ['264', '183806CPO', 'lidocaine 0.7g'],
}

describe('AC-6608.1 약 표 한 줄 → 역할(drugRole)', () => {
  it.each(['triamcinolone', 'dexamethasone', 'methylprednisolone', 'betamethasone'])('AC-6608.1: 주사 %s는 스테로이드', (name) => {
    expect(drugRole(ROW[name])).toBe('steroid')
  })

  it('AC-6608.1: 주사 hydrocortisone·prednisolone도 스테로이드(약 표에 지금은 주사가 없어 만든 줄)', () => {
    expect(drugRole(['245', '170901BIJ', 'hydrocortisone sodium succinate 100mg'])).toBe('steroid')
    expect(drugRole(['245', '217001BIJ', 'prednisolone sodium phosphate 20mg'])).toBe('steroid')
  })

  it.each(['lidocaine', 'lidocaineEpinephrine', 'bupivacaine', 'ropivacaine', 'mepivacaine'])('AC-6608.1: 주사 %s는 마취약', (name) => {
    expect(drugRole(ROW[name])).toBe('localAnesthetic')
  })

  it('AC-6608.1: 주사 levobupivacaine도 마취약(만든 줄)', () => {
    expect(drugRole(['121', '183001BIJ', 'levobupivacaine hydrochloride 37.5mg(5mg/mL)'])).toBe('localAnesthetic')
  })

  it.each(['hyaluronate', 'crosslinked'])('AC-6608.1: 주사 %s는 연골주사', (name) => {
    expect(drugRole(ROW[name])).toBe('cartilage')
  })

  it('AC-6608.1: 분류번호만으로 정하지 않는다 — 245의 에피네프린·조영제·소염진통 주사는 역할이 없다', () => {
    for (const name of ['epinephrine', 'iohexol', 'ketorolac']) expect(drugRole(ROW[name]), name).toBeNull()
  })

  it('AC-6608.1: 눈(분류 131·132) 주사는 성분이 맞아도 역할이 없다', () => {
    expect(drugRole(ROW.eyeTriamcinolone)).toBeNull()
    expect(drugRole(ROW.eyeHyaluronate)).toBeNull()
    expect(drugRole(['132', '243399BIJ', 'triamcinolone acetonide 4mg'])).toBeNull()
  })

  it('AC-6608.1: 주사가 아니면(주성분코드 7번째 글자가 B가 아님) 역할이 없다', () => {
    expect(drugRole(ROW.dexamethasoneTablet)).toBeNull()
    expect(drugRole(ROW.lidocainePatch)).toBeNull()
    expect(drugRole(['245', '2433', 'triamcinolone acetonide 40mg'])).toBeNull() // 짧은 주성분코드
  })

  it('AC-6608.1: 약 표 줄이 없으면 역할이 없다', () => {
    expect(drugRole(null)).toBeNull()
    expect(drugRole(undefined)).toBeNull()
  })

  it('AC-6608.1: 히알루로니다아제(효소)는 연골주사가 아니다', () => {
    expect(drugRole(['399', '171001BIJ', 'hyaluronidase 1500IU'])).toBeNull()
  })

  it('AC-6608.1: 우리 의원 다섯 보험코드는 약 표에서 마취약·스테로이드·스테로이드·없음·연골주사다(2026-11-18 비트 DB 확인)', () => {
    const roleOf = (code: string) => drugRole(tables.drugInfo.map[code])
    expect(['670603485', '650500301', '645903001', '650100641', '645902041'].map(roleOf)).toEqual(['localAnesthetic', 'steroid', 'steroid', null, 'cartilage'])
  })
})

describe('AC-6608.2 처방코드 탭에서 고른 역할(chosenRole)', () => {
  it('AC-6608.2: 깃발이 켜진 역할을 준다', () => {
    expect(chosenRole({ steroid: true })).toBe('steroid')
    expect(chosenRole({ localAnesthetic: true })).toBe('localAnesthetic')
    expect(chosenRole({ cartilage: true, steroid: false, localAnesthetic: false })).toBe('cartilage')
  })

  it("AC-6608.2: 세 깃발이 모두 꺼져 있으면 [아님]('none')이다", () => {
    expect(chosenRole({ steroid: false, localAnesthetic: false, cartilage: false })).toBe('none')
  })

  it('AC-6608.2: 깃발이 없거나 일부만 꺼져 있으면 [자동](null)이다', () => {
    expect(chosenRole({})).toBeNull()
    expect(chosenRole({ cartilage: false })).toBeNull()
    expect(chosenRole(null)).toBeNull()
    expect(chosenRole(undefined)).toBeNull()
  })
})

describe('AC-6608.2 처방코드마다 역할(drugRoles)', () => {
  const row = (code: string, standardCode: string, extra: Partial<CatalogCode> = {}): CatalogCode => ({ code, name: '가상주사', kind: 'drug', active: true, standardCode, ...extra })
  const map: Record<string, DrugInfoEntry> = { '670603485': ROW.lidocaine, '645902041': ROW.hyaluronate, '645100741': ROW.epinephrine, '650100641': ROW.iohexol }
  const drugInfo = { map }

  it('AC-6608.2: 고른 역할이 없으면 비트 처방 목록의 보험코드로 찾은 성분 역할이고, 그것도 없으면 역할이 없다(목록에 넣지 않음)', () => {
    const roles = drugRoles({ codes: [row('A15', '670603485'), row('X7', '645902041'), row('A41', '650100641'), row('Z1', '')] }, drugInfo, {})
    expect([...roles].sort()).toEqual([
      ['A15', 'localAnesthetic'],
      ['X7', 'cartilage'],
    ])
  })

  it('AC-6608.2: 병원이 처방코드 탭에서 정한 역할이 먼저다', () => {
    const roles = drugRoles({ codes: [row('A15', '670603485'), row('X7', '645902041')] }, drugInfo, {
      A15: { steroid: true },
      X7: { steroid: false, localAnesthetic: false, cartilage: false },
    })
    expect(roles.get('A15')).toBe('steroid')
    expect(roles.get('X7')).toBe('none')
  })

  it('AC-6608.2: [자동](깃발 없음)인 줄은 보험코드 성분을 쓴다', () => {
    const line: MemoCode = { n: '리도카인', k: 'drug', rg: null }
    const roles = drugRoles({ codes: [row('A15', '670603485')] }, drugInfo, { A15: line })
    expect(roles.get('A15')).toBe('localAnesthetic')
  })

  it('AC-6608.2: 코드는 대문자로 맞춘다 — 목록·처방코드 탭의 대소문자가 달라도 같은 줄이다', () => {
    const roles = drugRoles({ codes: [row('a49', '645902041'), row('Zm5', '670603485')] }, drugInfo, { zM5: { cartilage: true } })
    expect(roles.get('A49')).toBe('cartilage')
    expect(roles.get('ZM5')).toBe('cartilage')
    expect(roles.has('a49')).toBe(false)
  })

  it('AC-6608.2: 처방 목록에 없는 코드도 처방코드 탭에서 정한 역할은 남는다', () => {
    expect(drugRoles({ codes: [] }, drugInfo, { Q1: { localAnesthetic: true } }).get('Q1')).toBe('localAnesthetic')
  })

  it('AC-6608.2: 약 표에 없는 보험코드·약 표의 글자가 아닌 열쇠는 역할이 없다', () => {
    const roles = drugRoles({ codes: [row('Z2', '999999999'), row('Z3', 'constructor'), row('Z4', '645100741')] }, drugInfo, {})
    expect(roles.size).toBe(0)
  })
})
