import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_DEPT_RULE } from '@/lib/location/depts'
import type { DeptRule, LocationEvent } from '@/types/location'
import { alertLines } from './alertLines'

// 대시보드 알림 줄 만들기 (specs/location REQ-7915 AC-7915.2, REQ-7921 AC-7921.4, design.md 12·18절,
// requirements '화면 글 기본값' 새 경쟁 의원 알림). 안 본 알림 줄 + 후보 이름 + 대표 과목 짧은 이름, 지금 설정의 경쟁 과목만.
// 후보·의원은 모두 지어낸 값이다

const CAND_A = '11111111-1111-4111-8111-111111111111'
const CAND_B = '22222222-2222-4222-8222-222222222222'
const CANDS = [
  { id: CAND_A, name: '예시빌딩 3층' },
  { id: CAND_B, name: '예시타워 1층' },
]
let n = 0
const event = (candidateId: string, clinicName: string, dept: string, kind: 'open' | 'close' = 'open'): LocationEvent => {
  n += 1
  return {
    id: `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    candidateId,
    kind,
    clinicName,
    dept,
    eventOn: '2026-11-10',
    distM: 950,
    seenAt: null,
    createdAt: '2026-11-22T01:00:00.000Z',
  }
}
const rule = (rival: DeptRule['rival'], hide: DeptRule['hide'] = []): DeptRule => ({ v: 1, rival, hide })

describe('alertLines: 후보 이름 (AC-7915.2)', () => {
  it('AC-7915.2: 줄마다 그 후보의 이름을 붙이고, 줄의 다른 칸은 그대로 둔다', () => {
    const a = event(CAND_A, '예시★★정형외과의원', '정형외과')
    const b = event(CAND_B, '예시▼▼정형외과의원', '정형외과', 'close')
    const lines = alertLines([a, b], CANDS, DEFAULT_DEPT_RULE)
    expect(lines).toEqual([
      { ...a, candidateName: '예시빌딩 3층', deptShort: '정형외과' },
      { ...b, candidateName: '예시타워 1층', deptShort: '정형외과' },
    ])
  })

  it('AC-7915.2: 후보를 못 찾으면(후보 읽기 실패 등) 후보 이름은 null이고 줄은 그대로 보인다', () => {
    const a = event(CAND_A, '예시★★정형외과의원', '정형외과')
    expect(alertLines([a], [], DEFAULT_DEPT_RULE)).toEqual([{ ...a, candidateName: null, deptShort: '정형외과' }])
  })

  it('AC-7915.2: 받은 줄 차례를 바꾸지 않고, 받은 목록을 고치지 않는다', () => {
    const list = [event(CAND_B, '예시가정형외과', '정형외과'), event(CAND_A, '예시나정형외과', '정형외과')]
    const copy = structuredClone(list)
    expect(alertLines(list, CANDS, DEFAULT_DEPT_RULE).map((l) => l.id)).toEqual(list.map((e) => e.id))
    expect(list).toEqual(copy)
  })
})

describe('alertLines: 고른 과목 — 대표 과목 짧은 이름, 경쟁 과목만 (AC-7915.2·AC-7921.4)', () => {
  it('AC-7921.4: 과목은 대표 과목(deptOfText)의 짧은 이름이다 — 마취통증의학과 → 마취통증, 재활의학과 → 재활, 신경외과', () => {
    const lines = alertLines(
      [event(CAND_A, '예시◆◆통증의원', '마취통증의학과'), event(CAND_A, '예시■■의원', '재활의학과'), event(CAND_A, '예시▲▲의원', '신경외과')],
      CANDS,
      DEFAULT_DEPT_RULE,
    )
    expect(lines.map((l) => l.deptShort)).toEqual(['마취통증', '재활', '신경외과'])
  })

  it('AC-7921.4: 과목 글이 여럿이면 이름에 든 과목이 먼저다(정형외과·신경외과 의원 이름이 신경외과면 신경외과)', () => {
    const [line] = alertLines([event(CAND_A, '예시신경외과의원', '정형외과,신경외과')], CANDS, DEFAULT_DEPT_RULE)
    expect(line!.deptShort).toBe('신경외과')
  })

  it('AC-7915.2: 지금 설정의 경쟁 과목인 줄만 남는다 — 정형외과를 둘레로 보기나 안 보기로 바꾸면 그 줄은 빠진다', () => {
    const ortho = event(CAND_A, '예시★★정형외과의원', '정형외과')
    const pain = event(CAND_B, '예시◆◆통증의원', '마취통증의학과')
    expect(alertLines([ortho, pain], CANDS, rule(['pain'])).map((l) => l.id)).toEqual([pain.id]) // 정형외과 = 둘레로 보기
    expect(alertLines([ortho, pain], CANDS, rule(['pain'], ['ortho'])).map((l) => l.id)).toEqual([pain.id]) // 정형외과 = 안 보기
    expect(alertLines([ortho, pain], CANDS, rule(['ortho'])).map((l) => l.id)).toEqual([ortho.id])
  })

  it('AC-7915.2: 새로 경쟁으로 고른 과목(치과)도 그 짧은 이름으로 보인다', () => {
    const [line] = alertLines([event(CAND_A, '예시치과의원', '치과')], CANDS, rule(['dental']))
    expect(line!.deptShort).toBe('치과')
  })

  it("AC-7915.2: 대표 과목을 모르면(과목 글·이름에 든 과목이 없음) 과목은 null('경쟁 의원이 …')이고 줄은 보인다", () => {
    const e = event(CAND_A, '예시의원', '')
    expect(alertLines([e], CANDS, DEFAULT_DEPT_RULE)).toEqual([{ ...e, candidateName: '예시빌딩 3층', deptShort: null }])
  })

  it('AC-7915.2: 경쟁 과목이 하나도 없으면 줄이 없다(모르는 과목 줄도)', () => {
    expect(alertLines([event(CAND_A, '예시★★정형외과의원', '정형외과'), event(CAND_A, '예시의원', '')], CANDS, rule([]))).toEqual([])
  })

  it('AC-7915.2: 소스는 순수 함수다 — 대표 과목은 lib/location/depts 한 곳, 읽기·저장·Supabase·console을 쓰지 않는다', () => {
    const text = readFileSync(join(process.cwd(), 'src/components/dashboard/location/alertLines.ts'), 'utf8')
    expect(text).toMatch(/import \{[^}]*\bdeptOfText\b[^}]*\} from '@\/lib\/location\/depts'/)
    expect(text).not.toMatch(/lib\/supabase|lib\/storage|components\/location\/clients|\bfetch\(|localStorage|sessionStorage|console\.|^'use client'/m)
  })
})
