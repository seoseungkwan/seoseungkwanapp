import { describe, expect, it } from 'vitest'
import type { DeptId, DeptRule } from '@/types/location'
import { DEFAULT_DEPT_RULE, DEPTS, checkDeptRule, deptOf, deptOfText, deptRole, fillDeptRule, rivalShortText } from './depts'

// 의원 과목 고르기(specs/location REQ-7921 AC-7921.4, design.md 18절). 과목 스물하나 · 처음 설정 · 검사 · 대표 과목 한 곳.
// 이름·코드는 18절 표, 의원 이름은 지어낸 것

const rule = (rival: DeptId[], hide: DeptId[] = []): DeptRule => ({ v: 1, rival, hide })
const DEFAULT = rule(['ortho', 'ns', 'pain', 'rehab'])

describe('AC-7921.4 과목 목록 DEPTS', () => {
  it('AC-7921.4: 18절 표 차례 스물하나 — id · 이름 · 짧은 이름 · 종별 · 과목 코드 · 확인', () => {
    expect(DEPTS.map((d) => [d.id, d.name, d.short, d.clCd, d.dgsbjtCd, d.checked])).toEqual([
      ['im', '내과', '내과', '31', '01', false],
      ['neuro', '신경과', '신경과', '31', '02', false],
      ['psy', '정신건강의학과', '정신건강의학과', '31', '03', false],
      ['gs', '외과', '외과', '31', '04', false],
      ['ortho', '정형외과', '정형외과', '31', '05', true],
      ['ns', '신경외과', '신경외과', '31', '06', false],
      ['cs', '흉부외과', '흉부외과', '31', '07', false],
      ['plastic', '성형외과', '성형외과', '31', '08', false],
      ['pain', '마취통증의학과', '마취통증', '31', '09', true],
      ['obgy', '산부인과', '산부인과', '31', '10', false],
      ['ped', '소아청소년과', '소아청소년과', '31', '11', false],
      ['eye', '안과', '안과', '31', '12', false],
      ['ent', '이비인후과', '이비인후과', '31', '13', false],
      ['derm', '피부과', '피부과', '31', '14', false],
      ['uro', '비뇨의학과', '비뇨의학과', '31', '15', false],
      ['rad', '영상의학과', '영상의학과', '31', '16', false],
      ['rehab', '재활의학과', '재활', '31', '21', true],
      ['fm', '가정의학과', '가정의학과', '31', '23', false],
      ['oem', '직업환경의학과', '직업환경의학과', '31', '25', false],
      ['dental', '치과의원', '치과', '51', null, false],
      ['korean', '한의원', '한의원', '93', null, true],
    ])
  })

  it('AC-7921.4: 이름 낱말은 18절 표 그대로다', () => {
    expect(Object.fromEntries(DEPTS.map((d) => [d.id, d.words]))).toEqual({
      im: ['내과'],
      neuro: ['신경과'],
      psy: ['정신건강의학', '정신과'],
      gs: ['외과'],
      ortho: ['정형외과'],
      ns: ['신경외과'],
      cs: ['흉부외과'],
      plastic: ['성형외과'],
      pain: ['마취통증', '통증의학'],
      obgy: ['산부인과', '여성의원'],
      ped: ['소아청소년', '소아과'],
      eye: ['안과'],
      ent: ['이비인후과'],
      derm: ['피부과'],
      uro: ['비뇨의학', '비뇨기과'],
      rad: ['영상의학'],
      rehab: ['재활의학'],
      fm: ['가정의학'],
      oem: ['직업환경의학'],
      dental: ['치과'],
      korean: ['한의원'],
    })
  })

  it('AC-7921.4: id는 types DeptId 스물하나와 같고 겹치지 않으며, 의원 과목 열아홉만 과목 코드가 있다(겹침 없음)', () => {
    // Record<DeptId, …>는 tsc가 빠짐·더함을 본다
    const ALL: Record<DeptId, true> = {
      im: true,
      neuro: true,
      psy: true,
      gs: true,
      ortho: true,
      ns: true,
      cs: true,
      plastic: true,
      pain: true,
      obgy: true,
      ped: true,
      eye: true,
      ent: true,
      derm: true,
      uro: true,
      rad: true,
      rehab: true,
      fm: true,
      oem: true,
      dental: true,
      korean: true,
    }
    const ids = DEPTS.map((d) => d.id)
    expect(new Set(ids).size).toBe(21)
    expect([...ids].sort()).toEqual(Object.keys(ALL).sort())
    const clinic = DEPTS.filter((d) => d.clCd === '31')
    expect(clinic).toHaveLength(19)
    expect(clinic.every((d) => d.dgsbjtCd !== null && /^\d\d$/.test(d.dgsbjtCd))).toBe(true)
    expect(new Set(clinic.map((d) => d.dgsbjtCd)).size).toBe(19)
    expect(DEPTS.filter((d) => d.dgsbjtCd === null).map((d) => d.id)).toEqual(['dental', 'korean'])
  })

  it('AC-7921.4: 목록은 고칠 수 없게 얼려 둔다', () => {
    expect(Object.isFrozen(DEPTS)).toBe(true)
    expect(DEPTS.every((d) => Object.isFrozen(d) && Object.isFrozen(d.words))).toBe(true)
  })
})

describe('AC-7921.4 처음 설정 · 검사 · 채우기', () => {
  it('AC-7921.4: 처음 설정은 경쟁 = 정형외과·신경외과·마취통증의학과·재활의학과, 안 보기 없음 — JSON 글자가 SQL 처음 값과 같다', () => {
    expect(JSON.stringify(DEFAULT_DEPT_RULE)).toBe('{"v":1,"rival":["ortho","ns","pain","rehab"],"hide":[]}')
    expect(Object.isFrozen(DEFAULT_DEPT_RULE) && Object.isFrozen(DEFAULT_DEPT_RULE.rival) && Object.isFrozen(DEFAULT_DEPT_RULE.hide)).toBe(true)
    expect(checkDeptRule(DEFAULT_DEPT_RULE)).toEqual([])
  })

  it('AC-7921.4: checkDeptRule — 처음 값·경쟁 0개·모든 과목 안 보기는 문제 없음', () => {
    expect(checkDeptRule(rule([]))).toEqual([])
    expect(checkDeptRule(rule([], DEPTS.map((d) => d.id)))).toEqual([])
    expect(checkDeptRule(rule(['korean', 'dental'], ['im']))).toEqual([])
  })

  it('AC-7921.4: checkDeptRule — 모르는 id · 경쟁과 안 보기 겹침 · 같은 id 두 번을 문제로 돌려준다', () => {
    expect(checkDeptRule({ v: 1, rival: ['ortho', 'orthopedics'], hide: [] })).toEqual([{ code: 'unknown', id: 'orthopedics' }])
    expect(checkDeptRule({ v: 1, rival: ['ortho'], hide: ['ORTHO', 7] })).toEqual([
      { code: 'unknown', id: 'ORTHO' },
      { code: 'unknown', id: '7' },
    ])
    expect(checkDeptRule({ v: 1, rival: ['ortho', 'pain'], hide: ['pain'] })).toEqual([{ code: 'both', id: 'pain' }])
    expect(checkDeptRule({ v: 1, rival: ['ortho', 'ortho'], hide: ['im', 'im'] })).toEqual([
      { code: 'repeat', id: 'ortho' },
      { code: 'repeat', id: 'im' },
    ])
  })

  it('AC-7921.4: checkDeptRule — 모양이 틀리면(객체 아님·판 번호·배열 아님·모르는 칸) shape 하나', () => {
    for (const raw of [
      null,
      undefined,
      'ortho',
      [],
      {},
      { v: 2, rival: [], hide: [] },
      { v: '1', rival: [], hide: [] },
      { v: 1, rival: 'ortho', hide: [] },
      { v: 1, rival: [] },
      { v: 1, hide: [] },
      { v: 1, rival: [], hide: null },
      { v: 1, rival: [], hide: [], around: [] },
    ])
      expect(checkDeptRule(raw), JSON.stringify(raw) ?? String(raw)).toEqual([{ code: 'shape' }])
  })

  it('AC-7921.4: fillDeptRule — 못 읽으면 처음 값(새 객체, 고쳐도 처음 값은 그대로)', () => {
    for (const raw of [null, undefined, 'x', 1, [], {}, { v: 2, rival: ['im'], hide: [] }, { v: 1, rival: 'im', hide: [] }]) {
      const filled = fillDeptRule(raw)
      expect(filled, JSON.stringify(raw) ?? String(raw)).toEqual(DEFAULT)
      expect(filled).not.toBe(DEFAULT_DEPT_RULE)
      filled.rival.push('im')
      expect(DEFAULT_DEPT_RULE.rival).toEqual(['ortho', 'ns', 'pain', 'rehab'])
    }
  })

  it('AC-7921.4: fillDeptRule — 맞는 설정은 그대로, 모르는 id는 버리고 되풀이는 하나로, 차례는 목록 차례', () => {
    expect(fillDeptRule({ v: 1, rival: ['korean'], hide: ['im', 'dental'] })).toEqual(rule(['korean'], ['im', 'dental']))
    expect(fillDeptRule({ v: 1, rival: [], hide: [] })).toEqual(rule([]))
    expect(fillDeptRule({ v: 1, rival: ['rehab', 'x', 'ortho', 'rehab', 3], hide: ['dental', 'im', 'im'] })).toEqual(rule(['ortho', 'rehab'], ['im', 'dental']))
  })

  it('AC-7921.4: fillDeptRule — 겹치면 경쟁으로 두고, 빠진 경쟁 칸은 처음 경쟁 · 빠진 안 보기 칸은 없음', () => {
    expect(fillDeptRule({ v: 1, rival: ['ortho', 'pain'], hide: ['pain', 'derm'] })).toEqual(rule(['ortho', 'pain'], ['derm']))
    expect(fillDeptRule({ v: 1, hide: ['derm', 'ortho'] })).toEqual(rule(['ortho', 'ns', 'pain', 'rehab'], ['derm']))
    expect(fillDeptRule({ v: 1, rival: ['im'] })).toEqual(rule(['im']))
    for (const raw of [{ v: 1, rival: ['ortho', 'pain'], hide: ['pain', 'derm', 'zz'] }, { v: 1, hide: ['ortho'] }])
      expect(checkDeptRule(fillDeptRule(raw)), JSON.stringify(raw)).toEqual([])
  })

  it('AC-7921.4: deptRole — 경쟁 rival · 안 보기 hide · 둘 다 아니면 둘레로 보기 around', () => {
    expect(deptRole('ortho', DEFAULT_DEPT_RULE)).toBe('rival')
    expect(deptRole('ns', DEFAULT_DEPT_RULE)).toBe('rival')
    expect(deptRole('korean', DEFAULT_DEPT_RULE)).toBe('around')
    expect(deptRole('im', DEFAULT_DEPT_RULE)).toBe('around')
    expect(deptRole('derm', rule(['ortho'], ['derm']))).toBe('hide')
  })

  it('AC-7921.4: rivalShortText — 경쟁 과목 짧은 이름을 목록 차례로 ·로 잇고, 없으면 고른 과목 없음', () => {
    expect(rivalShortText(DEFAULT_DEPT_RULE)).toBe('정형외과·신경외과·마취통증·재활')
    expect(rivalShortText(rule(['rehab', 'ortho']))).toBe('정형외과·재활')
    expect(rivalShortText(rule(['korean', 'dental', 'im']))).toBe('내과·치과·한의원')
    expect(rivalShortText(rule([]))).toBe('고른 과목 없음')
  })
})

describe('AC-7921.4 대표 과목 deptOf(심평원 의원 목록 한 줄)', () => {
  it('AC-7921.4: 이름에 든 과목이 찾은 과목에 있고 안 보기가 아니면 그 과목이 먼저다(경쟁 과목보다 먼저)', () => {
    expect(deptOf({ name: '지어낸재활의학과의원', depts: ['ortho', 'rehab'] }, DEFAULT_DEPT_RULE)).toBe('rehab')
    expect(deptOf({ name: '바른내과의원', depts: ['im', 'ortho'] }, DEFAULT_DEPT_RULE)).toBe('im')
    expect(deptOf({ name: '하늘소아과의원', depts: ['ped', 'fm'] }, DEFAULT_DEPT_RULE)).toBe('ped')
    expect(deptOf({ name: '지어낸여성의원', depts: ['im', 'obgy'] }, DEFAULT_DEPT_RULE)).toBe('obgy')
    expect(deptOf({ name: '편한통증의학과의원', depts: ['ortho', 'pain'] }, DEFAULT_DEPT_RULE)).toBe('pain')
    expect(deptOf({ name: '맑은비뇨기과의원', depts: ['im', 'uro'] }, DEFAULT_DEPT_RULE)).toBe('uro')
    expect(deptOf({ name: '마음정신과의원', depts: ['neuro', 'psy'] }, DEFAULT_DEPT_RULE)).toBe('psy')
  })

  it('AC-7921.4: 이름 낱말은 긴 것 먼저 — 신경외과·정형외과 이름이 외과로 잡히지 않는다', () => {
    expect(deptOf({ name: '우리신경외과의원', depts: ['gs', 'ns'] }, DEFAULT_DEPT_RULE)).toBe('ns')
    expect(deptOf({ name: '바른정형외과의원', depts: ['gs', 'ortho'] }, DEFAULT_DEPT_RULE)).toBe('ortho')
    // 이름의 과목이 찾은 과목에 없어도 그 안의 '외과'로 잡지 않고 다음 차례(둘레로 보기 목록 차례 첫째 = 내과)로 간다
    expect(deptOf({ name: '바른정형외과의원', depts: ['gs', 'im'] }, DEFAULT_DEPT_RULE)).toBe('im')
    expect(deptOf({ name: '우리신경외과의원', depts: ['im', 'gs'] }, rule(['im']))).toBe('im')
    expect(deptOf({ name: '하나외과의원', depts: ['im', 'gs'] }, DEFAULT_DEPT_RULE)).toBe('gs')
  })

  it('AC-7921.4: 이름에 과목이 둘이면 이름에서 앞에 나온 과목', () => {
    expect(deptOf({ name: '정형외과재활의학과의원', depts: ['ortho', 'rehab'] }, DEFAULT_DEPT_RULE)).toBe('ortho')
    expect(deptOf({ name: '재활의학과정형외과의원', depts: ['ortho', 'rehab'] }, DEFAULT_DEPT_RULE)).toBe('rehab')
  })

  it('AC-7921.4: 이름 과목이 안 보기면 건너뛰고 찾은 과목 가운데 경쟁 → 둘레로 보기', () => {
    expect(deptOf({ name: '맑은피부과의원', depts: ['derm', 'fm'] }, rule(['ortho'], ['derm']))).toBe('fm')
    expect(deptOf({ name: '맑은피부과의원', depts: ['derm', 'fm', 'ortho'] }, rule(['ortho'], ['derm']))).toBe('ortho')
  })

  it('AC-7921.4: 이름에 과목이 없으면 찾은 과목 가운데 경쟁 과목(목록 차례 첫째) → 둘레로 보기(목록 차례 첫째)', () => {
    expect(deptOf({ name: '하나의원', depts: ['rehab', 'ortho', 'im'] }, DEFAULT_DEPT_RULE)).toBe('ortho')
    expect(deptOf({ name: '하나의원', depts: ['fm', 'im'] }, DEFAULT_DEPT_RULE)).toBe('im')
    expect(deptOf({ name: '하나의원', depts: ['fm', 'im'] }, rule(['fm']))).toBe('fm')
  })

  it('AC-7921.4: 이름에 든 과목이 찾은 과목에 없으면 이름으로 셈하지 않는다', () => {
    expect(deptOf({ name: '지어낸안과의원', depts: ['im'] }, DEFAULT_DEPT_RULE)).toBe('im')
    expect(deptOf({ name: '대한의원', depts: ['im'] }, DEFAULT_DEPT_RULE)).toBe('im')
  })

  it('AC-7921.4: 모두 안 보기거나 찾은 과목이 없으면 어디에도 세지 않는다(null)', () => {
    expect(deptOf({ name: '바른내과의원', depts: ['im'] }, rule(['ortho'], ['im']))).toBeNull()
    expect(deptOf({ name: '하나의원', depts: ['im', 'fm'] }, rule([], ['im', 'fm']))).toBeNull()
    expect(deptOf({ name: '바른정형외과의원', depts: [] }, DEFAULT_DEPT_RULE)).toBeNull()
  })

  it('AC-7921.4: 치과의원·한의원은 종별 목록이라 찾은 과목이 하나 — 안 보기면 null', () => {
    expect(deptOf({ name: '미소치과의원', depts: ['dental'] }, DEFAULT_DEPT_RULE)).toBe('dental')
    expect(deptOf({ name: '튼튼한의원', depts: ['korean'] }, DEFAULT_DEPT_RULE)).toBe('korean')
    expect(deptOf({ name: '미소치과의원', depts: ['dental'] }, rule(['ortho'], ['dental']))).toBeNull()
  })
})

describe('AC-7921.4 대표 과목 deptOfText(행안부 의원 인허가 한 줄)', () => {
  it('AC-7921.4: 업태 글에 치과가 들면 dental, 한의가 들면 korean — 과목 글의 외과·내과로 잡지 않는다', () => {
    expect(deptOfText({ name: '바른치과의원', subjects: '구강악안면외과, 치과교정과', type: '치과의원' }, DEFAULT_DEPT_RULE)).toBe('dental')
    expect(deptOfText({ name: '한빛한의원', subjects: '한방내과, 침구과', type: '한의원' }, DEFAULT_DEPT_RULE)).toBe('korean')
    expect(deptOfText({ name: '지어낸의원', subjects: '구강악안면외과', type: '치과의원' }, rule(['gs']))).toBe('dental')
  })

  it('AC-7921.4: 업태로 가른 치과·한의원이 안 보기면 어디에도 세지 않는다', () => {
    expect(deptOfText({ name: '바른치과의원', subjects: '구강악안면외과', type: '치과의원' }, rule(['gs'], ['dental']))).toBeNull()
    expect(deptOfText({ name: '한빛한의원', subjects: '한방내과', type: '한의원' }, rule(['im'], ['korean']))).toBeNull()
  })

  it('AC-7921.4: 그 밖은 이름 낱말 → 과목 글 가운데 경쟁 과목(목록 차례) → 둘레로 보기(목록 차례)', () => {
    expect(deptOfText({ name: '서울재활의학과의원', subjects: '정형외과, 재활의학과', type: '의원' }, DEFAULT_DEPT_RULE)).toBe('rehab')
    expect(deptOfText({ name: '하나의원', subjects: '내과, 신경외과, 정형외과', type: '의원' }, DEFAULT_DEPT_RULE)).toBe('ortho')
    expect(deptOfText({ name: '하나의원', subjects: '내과 가정의학과', type: '의원' }, DEFAULT_DEPT_RULE)).toBe('im')
    expect(deptOfText({ name: '하나의원', subjects: '가정의학과,내과', type: '' }, rule(['fm']))).toBe('fm')
  })

  it('AC-7921.4: 과목 글도 긴 낱말 먼저 — 신경외과는 외과가 아니다', () => {
    expect(deptOfText({ name: '하나의원', subjects: '신경외과', type: '의원' }, rule(['gs']))).toBe('ns')
    expect(deptOfText({ name: '하나의원', subjects: '마취통증의학과, 외과', type: '의원' }, rule(['gs']))).toBe('gs')
  })

  it('AC-7921.4: 이름 과목은 과목 글에 있을 때만(과목 글이 비면 이름만으로) — 대한의원의 한의원 글자로 잡지 않는다', () => {
    expect(deptOfText({ name: '서울통증의학과의원', subjects: '정형외과', type: '의원' }, DEFAULT_DEPT_RULE)).toBe('ortho')
    expect(deptOfText({ name: '대한의원', subjects: '내과', type: '의원' }, DEFAULT_DEPT_RULE)).toBe('im')
    expect(deptOfText({ name: '바른정형외과의원', subjects: '', type: '의원' }, DEFAULT_DEPT_RULE)).toBe('ortho')
    // 치과·한의원은 업태로만 가른다
    expect(deptOfText({ name: '대한의원', subjects: '', type: '의원' }, DEFAULT_DEPT_RULE)).toBeNull()
    expect(deptOfText({ name: '미소치과의원', subjects: '', type: '의원' }, DEFAULT_DEPT_RULE)).toBeNull()
  })

  it('AC-7921.4: 이름 과목이 안 보기면 과목 글로, 아무것도 없거나 모두 안 보기면 null', () => {
    expect(deptOfText({ name: '맑은피부과의원', subjects: '피부과, 가정의학과', type: '의원' }, rule(['ortho'], ['derm']))).toBe('fm')
    expect(deptOfText({ name: '하나의원', subjects: '결핵과, 병리과', type: '의원' }, DEFAULT_DEPT_RULE)).toBeNull()
    expect(deptOfText({ name: '하나의원', subjects: '', type: '' }, DEFAULT_DEPT_RULE)).toBeNull()
    expect(deptOfText({ name: '하나의원', subjects: '내과', type: '의원' }, rule(['ortho'], ['im']))).toBeNull()
  })
})
