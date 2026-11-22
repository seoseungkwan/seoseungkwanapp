import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_DEPT_RULE, DEPTS, deptOfText } from '@/lib/location/depts'
import { pickEvents } from '@/lib/location/watch'
import type { DeptRule, LicenseRow, LocationEvent, WatchCandidate, WatchEvent } from '@/types/location'
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

  it('AC-7915.1·AC-7921.4: 업태로 가른 한의원(과목 글 한방내과·한방재활의학과·침구과)은 경쟁이 한의원·정형외과일 때 내과로 세지 않고 한의원으로 보인다(줄이 사라지지 않음)', () => {
    const [line] = alertLines([event(CAND_A, '예시다온한의원', '한의원,한방내과,한방재활의학과,침구과')], CANDS, rule(['korean', 'ortho']))
    expect(line?.deptShort).toBe('한의원')
    // 과목 글이 빈 한의원·치과의원도 과목 이름이 보인다
    expect(alertLines([event(CAND_A, '예시한결의원', '한의원')], CANDS, rule(['korean'])).map((l) => l.deptShort)).toEqual(['한의원'])
    expect(alertLines([event(CAND_A, '예시미소의원', '치과의원')], CANDS, rule(['dental'])).map((l) => l.deptShort)).toEqual(['치과'])
  })

  it('AC-7915.2: 소스는 순수 함수다 — 대표 과목은 lib/location/depts 한 곳, 읽기·저장·Supabase·console을 쓰지 않는다', () => {
    const text = readFileSync(join(process.cwd(), 'src/components/dashboard/location/alertLines.ts'), 'utf8')
    expect(text).toMatch(/import \{[^}]*\bdeptOfText\b[^}]*\} from '@\/lib\/location\/depts'/)
    expect(text).not.toMatch(/lib\/supabase|lib\/storage|components\/location\/clients|\bfetch\(|localStorage|sessionStorage|console\.|^'use client'/m)
  })
})

// 넣는 셈(watch.ts pickEvents — 인허가 줄의 이름·과목 글·업태 글로 deptOfText)과 그리는 셈(alertLines — 저장한 줄로 다시 셈)이
// 같은 과목을 내는지 본다(design.md 12절, TASK-87). 넣은 줄은 그날 설정이면 반드시 보이고, 보이는 과목은 넣을 때 센 과목이다
describe('alertLines: 넣는 셈과 그리는 셈이 같다 (AC-7915.1·AC-7921.4)', () => {
  const PERIOD = { from: '2026-10-24', to: '2026-11-20' }
  const CAND: WatchCandidate = {
    id: CAND_A,
    name: '예시빌딩 3층',
    status: 'watching',
    lat: 37.5,
    lng: 127,
    radiusM: 1000,
    watchCheckedOn: null,
    createdAt: '2026-11-01T00:00:00+00:00',
    place: { sidoName: '서울특별시', sggName: '예시구' },
  }
  const license = (name: string, dept: string, type?: string): LicenseRow => ({
    name,
    dept,
    openedOn: '2026-11-10',
    closedOn: null,
    point: { lat: 37.5045, lng: 127 },
    ...(type === undefined ? {} : { type }),
  })
  const ROWS: [string, LicenseRow][] = [
    ['한의원(업태 한의원)', license('예시다온한의원', '한방내과,한방재활의학과,침구과', '한의원')],
    ['한의원(과목 글 빔)', license('예시한결의원', '', '한의원')],
    ['치과의원(업태 치과의원)', license('예시미소치과의원', '구강악안면외과,구강내과', '치과의원')],
    ['치과의원(과목 글 빔)', license('예시가람의원', '', '치과의원')],
    ['의원(업태 의원)', license('예시바른의원', '정형외과, 재활의학과', '의원')],
    ['업태 없는 옛 줄(한방 과목 글)', license('예시솔빛한의원', '한방내과, 침구과')],
    ['업태 없는 옛 줄(치과 과목 글)', license('예시하늘치과의원', '치과보철과,치주과')],
    ['업태 없는 옛 줄(정형외과)', license('예시튼튼정형외과의원', '정형외과,마취통증의학과')],
  ]
  const RULES: [string, DeptRule][] = [
    ['처음 설정', DEFAULT_DEPT_RULE],
    ['한의원·정형외과', rule(['korean', 'ortho'])],
    ['재활·한의원', rule(['rehab', 'korean'])],
    ['내과·외과·치과', rule(['im', 'gs', 'dental'])],
    ['한의원(치과 안 보기)', rule(['korean'], ['dental'])],
    ['정형외과·재활(한의원 안 보기)', rule(['ortho', 'rehab'], ['korean'])],
  ]
  const SHORT = new Map(DEPTS.map((d) => [d.id, d.short]))
  const stored = (e: WatchEvent): LocationEvent => ({ ...e, id: 'e0000000-0000-4000-8000-0000000000ff', seenAt: null, createdAt: '2026-11-22T01:00:00.000Z' })

  it.each(ROWS.flatMap(([rowName, r]) => RULES.map(([ruleName, rl]) => [rowName, ruleName, r, rl] as const)))(
    'AC-7915.1·AC-7921.4: %s · 경쟁 %s — 넣은 줄은 넣을 때 센 과목으로 보인다',
    (_rowName, _ruleName, r, rl) => {
      const id = deptOfText({ name: r.name, subjects: r.dept, type: r.type ?? '' }, rl) // 넣는 셈(design.md 18절)
      const events = pickEvents({ kind: 'open', ...PERIOD, rows: [r] }, CAND, rl)
      if (id === null || !rl.rival.includes(id)) {
        expect(events).toEqual([])
        return
      }
      expect(events).toHaveLength(1)
      const lines = alertLines(events.map(stored), CANDS, rl)
      expect(lines.map((l) => l.deptShort)).toEqual([SHORT.get(id)])
    },
  )

  it('AC-7915.1·AC-7921.4: 표 시험의 넣는 셈이 뜻한 과목이다 — 업태로 가른 줄은 업태, 옛 줄은 과목 글', () => {
    const idOf = (r: LicenseRow, rl: DeptRule) => deptOfText({ name: r.name, subjects: r.dept, type: r.type ?? '' }, rl)
    const byName = new Map(ROWS)
    expect(idOf(byName.get('한의원(업태 한의원)')!, rule(['rehab', 'korean']))).toBe('korean')
    expect(idOf(byName.get('치과의원(업태 치과의원)')!, rule(['im', 'gs', 'dental']))).toBe('dental')
    expect(idOf(byName.get('업태 없는 옛 줄(한방 과목 글)')!, rule(['im']))).toBe('im')
    expect(idOf(byName.get('업태 없는 옛 줄(치과 과목 글)')!, rule(['dental']))).toBe('dental')
  })
})
