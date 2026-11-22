import { describe, expect, it } from 'vitest'
import {
  BUILDING_CHECKS,
  CHECK_VALUES,
  NO_LAW_TEXT,
  RISK_CHECKS,
  VISIT_CHECKS,
  checkOf,
  cleanChecks,
  countChecks,
  nextCheck,
} from './checklist'

// 개원 준비 점검 셋(design.md 11절 checklist.ts, 줄 글은 승인된 시안 docs/mockups/location/ 개원 준비)
// 법 근거 id는 LAW_BASIS(TASK-3) id 글자다. 시안 LAWS의 열쇠(open·xray·bf·use)를 쓴다 — 목록 대조는 합친 뒤 TASK-3 시험
const LAW_IDS = ['open', 'xray', 'bf', 'use']
const ALL = [...BUILDING_CHECKS, ...RISK_CHECKS, ...VISIT_CHECKS]

describe('AC-7913.3 건물 요건 표', () => {
  it('AC-7913.3: 건물 요건은 시안 차례 열 줄이고 줄마다 있어야 하는 것과 법 근거 id(없으면 null)를 가진다', () => {
    expect(BUILDING_CHECKS.map((c) => [c.id, c.label, c.law])).toEqual([
      ['b-xray', '엑스레이실 방사선 막는 벽', 'xray'],
      ['b-power', '전기 용량', null],
      ['b-ceiling', '천장 높이', null],
      ['b-load', '바닥이 견디는 무게', null],
      ['b-ramp', '장애인 경사로·출입구', 'bf'],
      ['b-bf-toilet', '장애인 화장실', 'bf'],
      ['b-toilet', '화장실', null],
      ['b-elevator', '엘리베이터', null],
      ['b-use', '건물 용도', 'use'],
      ['b-report', '보건소 신고 조건', 'open'],
    ])
    for (const c of BUILDING_CHECKS) expect(c.need.length).toBeGreaterThan(0)
  })

  it('AC-7913.3: 있어야 하는 것은 조사 3 B의 법 기준을 따른다(방어벽·제어실, 장애인 화장실은 500㎡ 이상, 제1종 근린생활시설)', () => {
    const need = (id: string) => BUILDING_CHECKS.find((c) => c.id === id)?.need ?? ''
    expect(need('b-xray')).toContain('제어실 1.5㎡ 이상')
    expect(need('b-xray')).toContain('검사대와 2m 이상')
    expect(need('b-bf-toilet')).toContain('500㎡ 이상')
    expect(need('b-ramp')).toBe('건물 입구에 턱이 없거나 경사로')
    expect(need('b-use')).toBe('제1종 근린생활시설(의원) 또는 의료시설')
    expect(need('b-report')).toBe('진료실·처치실·엑스레이실·물리치료실을 나눔, 위반 건축물이 아님')
  })

  it("AC-7913.3: 법 근거가 없는 줄에 쓰는 글은 '법 기준 없음 — 관리사무소에 물어요'다", () => {
    expect(NO_LAW_TEXT).toBe('법 기준 없음 — 관리사무소에 물어요')
  })
})

describe('AC-7913.3 계약 전 위험 · 보러 갈 때 점검표', () => {
  it('AC-7913.3: 계약 전 위험은 시안의 계약서에 꼭 넣을 것 다섯 줄이고 특약 줄만 의원 개설 신고 근거를 가진다', () => {
    expect(RISK_CHECKS.map((c) => [c.id, c.label, c.law])).toEqual([
      ['r-cancel', '의원 개설 신고가 안 되면 계약을 없던 일로 해요(특약)', 'open'],
      ['r-free-rent', '무상 기간이 공사 기간과 장비 설치까지 들어가요', null],
      ['r-restore', '나갈 때 원상 복구 범위(방사선 벽·바닥)를 적어요', null],
      ['r-premium', '권리금 계약서를 따로 써요', null],
      ['r-power', '전기 용량 늘리는 공사를 누가 하고 누가 내는지 적어요', null],
    ])
  })

  it('AC-7913.3: 보러 갈 때 점검표는 시안 차례 열 줄이고 입구 턱 줄만 장애인 편의 근거를 가진다', () => {
    expect(VISIT_CHECKS.map((c) => [c.id, c.label, c.law])).toEqual([
      ['v-sign', '길 건너에서 간판 자리가 보여요', null],
      ['v-entrance', '1층 입구에 턱이 없거나 경사로가 있어요', 'bf'],
      ['v-elevator', '엘리베이터에 휠체어·들것이 들어가요', null],
      ['v-toilet', '층 안에 남녀 화장실이 따로 있어요', null],
      ['v-ceiling', '천장 높이를 쟀어요(엑스레이 기계)', null],
      ['v-panel', '배전반 사진을 찍었어요(전기 용량)', null],
      ['v-window', '창문 방향·햇빛·바깥 소리를 봤어요', null],
      ['v-parking', '주차장 들어가는 길이 어르신에게 쉬워요', null],
      ['v-passers', '평일 낮과 저녁에 지나가는 사람을 봤어요', null],
      ['v-mgmt', '같은 건물 가게에 관리비·관리 상태를 물어봤어요', null],
    ])
  })

  it('AC-7913.3: 세 목록의 id는 한 checks 칸에 같이 담기므로 모두 다르고 짧은 영문이며, 법 근거 id는 정해 둔 것만 쓴다', () => {
    const ids = ALL.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[brv]-[a-z]+(-[a-z]+)*$/)
    for (const c of ALL) {
      expect(c.label.length).toBeGreaterThan(0)
      if (c.law !== null) expect(LAW_IDS).toContain(c.law)
    }
  })
})

describe('AC-7913.3 값 세 가지', () => {
  it('AC-7913.3: 값은 yes · no · unknown 셋이고 안 고른 칸은 unknown(모름)이다', () => {
    expect(CHECK_VALUES).toEqual(['yes', 'no', 'unknown'])
    expect(checkOf({ 'b-xray': 'yes', 'b-power': 'no' }, 'b-xray')).toBe('yes')
    expect(checkOf({ 'b-xray': 'yes', 'b-power': 'no' }, 'b-power')).toBe('no')
    expect(checkOf({ 'b-xray': 'yes' }, 'b-use')).toBe('unknown')
    expect(checkOf({ 'b-xray': 'maybe' }, 'b-xray')).toBe('unknown')
    expect(checkOf({ 'b-xray': true }, 'b-xray')).toBe('unknown')
    expect(checkOf(null, 'b-xray')).toBe('unknown')
    expect(checkOf(undefined, 'b-xray')).toBe('unknown')
    expect(checkOf(['yes'], '0')).toBe('unknown')
  })

  it('AC-7913.3: 칸을 누르면 모름 → ○ → ✕ → 모름 차례로 바뀐다(시안)', () => {
    expect(nextCheck('unknown')).toBe('yes')
    expect(nextCheck('yes')).toBe('no')
    expect(nextCheck('no')).toBe('unknown')
  })

  it('AC-7913.3: 저장할 checks는 세 목록에 있는 id와 세 값만 남긴다', () => {
    expect(
      cleanChecks({ 'b-xray': 'yes', 'r-cancel': 'no', 'v-sign': 'unknown', 'b-gone': 'yes', 'v-panel': 'ok', 'b-use': 1 }),
    ).toEqual({ 'b-xray': 'yes', 'r-cancel': 'no', 'v-sign': 'unknown' })
    expect(cleanChecks(null)).toEqual({})
    expect(cleanChecks('yes')).toEqual({})
    expect(cleanChecks(['yes'])).toEqual({})
    // 프로토타입 열쇠는 id가 아니다
    expect(cleanChecks(JSON.parse('{"__proto__":"yes","constructor":"no"}'))).toEqual({})
  })

  it('AC-7913.3: 목록마다 ○ · ✕ · 모름 개수를 센다(안 고른 줄은 모름)', () => {
    const checks = { 'b-xray': 'yes', 'b-power': 'no', 'b-use': 'yes', 'v-sign': 'yes', 'b-load': 'bad' }
    expect(countChecks(checks, BUILDING_CHECKS)).toEqual({ yes: 2, no: 1, unknown: 7 })
    expect(countChecks(checks, VISIT_CHECKS)).toEqual({ yes: 1, no: 0, unknown: 9 })
    expect(countChecks(null, RISK_CHECKS)).toEqual({ yes: 0, no: 0, unknown: 5 })
  })
})
