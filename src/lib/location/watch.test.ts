import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { DeptId, DeptRule } from '@/types/location'
import { distM } from './coords'
import { DEFAULT_DEPT_RULE } from './depts'
import * as watch from './watch'
import {
  WATCH_EVERY_DAYS,
  WATCH_LAG_DAYS,
  WATCH_MAX_CANDIDATES,
  dueCandidates,
  pickEvents,
  type LicenseRow,
  type WatchCandidate,
} from './watch'

// 새 경쟁 의원 알림 판정(design.md 12절). 오늘은 부르는 쪽이 한국 날짜로 넘긴다. 이름은 모두 지어낸 것
// 경쟁 의원 = 인허가 줄의 대표 과목(depts.ts deptOfText)이 설정(dept_rule)의 경쟁 과목인 의원
const TODAY = '2026-11-22'
const CENTER = { lat: 37.5, lng: 127 }
const RULE = DEFAULT_DEPT_RULE
const ruleOf = (rival: DeptId[], hide: DeptId[] = []): DeptRule => ({ v: 1, rival, hide })

const cand = (id: string, over: Partial<WatchCandidate> = {}): WatchCandidate => ({
  id,
  name: `예시후보${id}`,
  status: 'watching',
  lat: CENTER.lat,
  lng: CENTER.lng,
  radiusM: 1000,
  watchCheckedOn: null,
  createdAt: `2026-11-01T00:00:0${id.length % 10}+00:00`,
  ...over,
})

const row = (name: string, over: Partial<LicenseRow> = {}): LicenseRow => ({
  name,
  dept: '정형외과',
  openedOn: '2026-11-10',
  closedOn: null,
  point: { lat: CENTER.lat + 0.0045, lng: CENTER.lng },
  ...over,
})

describe('AC-7915.1 dueCandidates', () => {
  it('AC-7915.1: 한 번에 5곳, 30일마다, 자료가 2일 늦어 기간 끝은 오늘 − 2일이다', () => {
    expect(WATCH_MAX_CANDIDATES).toBe(5)
    expect(WATCH_EVERY_DAYS).toBe(30)
    expect(WATCH_LAG_DAYS).toBe(2)
  })

  it('AC-7915.1: 확인한 적 없는 후보는 (오늘 − 30) + 1일 ~ 오늘 − 2일을 본다', () => {
    expect(dueCandidates([cand('a')], TODAY)).toEqual([{ from: '2026-10-24', to: '2026-11-20', candidates: [cand('a')] }])
  })

  it('AC-7915.1: 마지막 확인이 30일 넘으면 확인하고, 30일째까지는 하지 않는다', () => {
    expect(dueCandidates([cand('a', { watchCheckedOn: '2026-10-23' })], TODAY)).toEqual([])
    expect(dueCandidates([cand('a', { watchCheckedOn: '2026-11-21' })], TODAY)).toEqual([])
    expect(dueCandidates([cand('a', { watchCheckedOn: '2026-10-22' })], TODAY)).toHaveLength(1)
    expect(dueCandidates([cand('a', { watchCheckedOn: '2025-01-01' })], TODAY)).toHaveLength(1)
  })

  it('AC-7915.1: 지난 확인의 기간 끝(확인 날 − 2일) 다음 날부터 보아 빠지는 날이 없다', () => {
    // 2026-10-22에 확인했으면 그때 기간 끝은 10-20 → 이번은 10-21부터(겹친 줄은 DB unique로 한 번)
    expect(dueCandidates([cand('a', { watchCheckedOn: '2026-10-22' })], TODAY)).toEqual([
      { from: '2026-10-21', to: '2026-11-20', candidates: [cand('a', { watchCheckedOn: '2026-10-22' })] },
    ])
  })

  it('AC-7915.1: 내려놓은 후보는 확인하지 않는다', () => {
    expect(dueCandidates([cand('a', { status: 'dropped' })], TODAY)).toEqual([])
    for (const status of ['watching', 'contacted', 'visited', 'reviewing'] as const) {
      expect(dueCandidates([cand('a', { status })], TODAY)).toHaveLength(1)
    }
  })

  it('AC-7915.1: 만든 차례 앞 5곳만 고른다(같은 시각이면 id 차례)', () => {
    const rows = [
      cand('f', { createdAt: '2026-11-06T00:00:00+00:00' }),
      cand('b', { createdAt: '2026-11-02T00:00:00+00:00' }),
      cand('x', { createdAt: '2026-11-01T00:00:00+00:00', status: 'dropped' }),
      cand('e', { createdAt: '2026-11-05T00:00:00+00:00' }),
      cand('a', { createdAt: '2026-11-01T00:00:00+00:00' }),
      cand('d2', { createdAt: '2026-11-04T00:00:00+00:00' }),
      cand('d1', { createdAt: '2026-11-04T00:00:00+00:00' }),
      cand('c', { createdAt: '2026-11-03T00:00:00+00:00', watchCheckedOn: '2026-11-10' }),
    ]
    const picked = dueCandidates(rows, TODAY).flatMap((group) => group.candidates.map((c) => c.id))
    expect(picked).toEqual(['a', 'b', 'd1', 'd2', 'e'])
  })

  it('AC-7915.1: 같은 기간 후보는 한 묶음으로 모아 clinic-license를 기간마다 한 번만 받게 한다', () => {
    const a = cand('a', { createdAt: '2026-11-01T00:00:00+00:00' })
    const b = cand('b', { createdAt: '2026-11-02T00:00:00+00:00', watchCheckedOn: '2026-10-01' })
    const c = cand('c', { createdAt: '2026-11-03T00:00:00+00:00' })
    expect(dueCandidates([c, b, a], TODAY)).toEqual([
      { from: '2026-10-24', to: '2026-11-20', candidates: [a, c] },
      { from: '2026-09-30', to: '2026-11-20', candidates: [b] },
    ])
  })

  it('AC-7915.1: 고를 후보가 없으면 빈 목록이다', () => {
    expect(dueCandidates([], TODAY)).toEqual([])
  })
})

describe('AC-7915.1 pickEvents', () => {
  const PERIOD = { from: '2026-10-24', to: '2026-11-20' }

  it('AC-7915.1: 고정한 과목 목록(WATCH_DEPTS)은 없다 — 경쟁 과목은 설정(dept_rule)이 정한다', () => {
    expect('WATCH_DEPTS' in watch).toBe(false)
    const code = readFileSync(new URL('./watch.ts', import.meta.url), 'utf8')
    expect(code).toMatch(/import \{[^}]*\bdeptOfText\b[^}]*\} from '\.\/depts'/)
  })

  it('AC-7915.1: 처음 설정이면 대표 과목이 정형외과·신경외과·마취통증의학과·재활의학과인 의원의 개업을 줄로 만든다', () => {
    const rows = [
      row('예시정형외과의원'),
      row('예시가람의원', { dept: '마취통증의학과' }),
      row('예시재활의학과의원', { dept: '' }),
      row('예시바른의원', { dept: '내과, 신경외과' }),
      row('예시다온내과의원', { dept: '내과' }),
      row('예시소아청소년과의원', { dept: '소아청소년과, 가정의학과' }),
      row('예시튼튼의원', { dept: '' }),
    ]
    expect(pickEvents({ kind: 'open', ...PERIOD, rows }, cand('a'), RULE)).toEqual([
      { candidateId: 'a', kind: 'open', clinicName: '예시정형외과의원', dept: '정형외과', eventOn: '2026-11-10', distM: 500 },
      { candidateId: 'a', kind: 'open', clinicName: '예시가람의원', dept: '마취통증의학과', eventOn: '2026-11-10', distM: 500 },
      { candidateId: 'a', kind: 'open', clinicName: '예시재활의학과의원', dept: '', eventOn: '2026-11-10', distM: 500 },
      { candidateId: 'a', kind: 'open', clinicName: '예시바른의원', dept: '내과, 신경외과', eventOn: '2026-11-10', distM: 500 },
    ])
  })

  it('AC-7921.4: 대표 과목은 이름에 든 과목이 먼저다 — 과목 글에 정형외과가 있어도 이름이 내과인 의원은 알리지 않는다', () => {
    const rows = [row('예시하늘내과의원', { dept: '내과, 정형외과' }), row('예시하늘의원', { dept: '내과, 정형외과' })]
    expect(pickEvents({ kind: 'open', ...PERIOD, rows }, cand('a'), RULE).map((e) => e.clinicName)).toEqual(['예시하늘의원'])
  })

  it('AC-7921.4: 이름의 과목이 안 보기면 과목 글 가운데 경쟁 과목으로 세고, 모두 안 보기면 알리지 않는다', () => {
    const rows = [row('예시하늘내과의원', { dept: '내과, 정형외과' }), row('예시다온내과의원', { dept: '내과' })]
    expect(pickEvents({ kind: 'open', ...PERIOD, rows }, cand('a'), ruleOf(['ortho'], ['im'])).map((e) => e.clinicName)).toEqual([
      '예시하늘내과의원',
    ])
  })

  it('AC-7921.4: 인허가 줄의 업태 글(type)을 대표 과목에 넘긴다 — 치과의원·한의원을 경쟁으로 고르면 새 의원 알림에 잡힌다', () => {
    const rows = [
      row('예시미소치과의원', { dept: '구강악안면외과', type: '치과의원' }),
      row('예시다온한의원', { dept: '한방내과, 침구과', type: '한의원' }),
      row('예시바른정형외과의원', { type: '의원' }),
      // 업태 글이 없는 줄(옛 모양)은 이름 낱말·과목 글로만 센다 — 치과·한의원은 업태로만 가른다
      row('예시솔빛치과의원', { dept: '구강악안면외과' }),
    ]
    const found = { kind: 'open' as const, ...PERIOD, rows }
    expect(pickEvents(found, cand('a'), ruleOf(['dental', 'korean'])).map((e) => [e.clinicName, e.dept])).toEqual([
      ['예시미소치과의원', '구강악안면외과'],
      ['예시다온한의원', '한방내과, 침구과'],
    ])
    // 업태로 가른 치과의원은 과목 글(구강악안면외과)의 외과로 세지 않는다
    expect(pickEvents(found, cand('a'), ruleOf(['gs', 'ortho'])).map((e) => e.clinicName)).toEqual(['예시바른정형외과의원', '예시솔빛치과의원'])
    // 업태로 가른 과목이 안 보기면 알리지 않는다
    expect(pickEvents(found, cand('a'), ruleOf(['korean'], ['dental'])).map((e) => e.clinicName)).toEqual(['예시다온한의원'])
  })

  it('AC-7915.1: 경쟁 과목은 설정을 따른다 — 내과만 고르면 내과 의원만 알린다', () => {
    const rows = [row('예시정형외과의원'), row('예시다온내과의원', { dept: '내과' }), row('예시하늘의원', { dept: '정형외과, 내과' })]
    expect(pickEvents({ kind: 'open', ...PERIOD, rows }, cand('a'), ruleOf(['im'])).map((e) => e.clinicName)).toEqual([
      '예시다온내과의원',
      '예시하늘의원',
    ])
  })

  it('AC-7915.1: 경쟁 과목이 하나도 없으면 빈 목록이다', () => {
    const rows = [row('예시정형외과의원'), row('예시다온내과의원', { dept: '내과' })]
    expect(pickEvents({ kind: 'open', ...PERIOD, rows }, cand('a'), ruleOf([]))).toEqual([])
    expect(pickEvents({ kind: 'close', ...PERIOD, rows: [row('예시정형외과의원', { closedOn: '2026-11-03' })] }, cand('a'), ruleOf([]))).toEqual([])
  })

  it('AC-7915.1: 설정을 넘기지 않으면 처음 설정(DEFAULT_DEPT_RULE)으로 센다', () => {
    const rows = [row('예시정형외과의원'), row('예시다온내과의원', { dept: '내과' }), row('예시바른의원', { dept: '신경외과' })]
    const found = { kind: 'open' as const, ...PERIOD, rows }
    expect(pickEvents(found, cand('a'))).toEqual(pickEvents(found, cand('a'), DEFAULT_DEPT_RULE))
    expect(pickEvents(found, cand('a')).map((e) => e.clinicName)).toEqual(['예시정형외과의원', '예시바른의원'])
  })

  it('AC-7915.1: 후보 범위 안(버린 거리 ≤ 범위)만 넣고, 점이 없으면 뺀다', () => {
    const rows = [
      row('예시안쪽정형외과', { point: { lat: CENTER.lat + 0.008993, lng: CENTER.lng } }), // 999.97m
      row('예시경계정형외과', { point: { lat: CENTER.lat + 0.009, lng: CENTER.lng } }), // 1000.75m → 1000
      row('예시바깥정형외과', { point: { lat: CENTER.lat + 0.0091, lng: CENTER.lng } }), // 1011.87m
      row('예시점없는정형외과', { point: null }),
    ]
    expect(pickEvents({ kind: 'open', ...PERIOD, rows }, cand('a'), RULE).map((e) => [e.clinicName, e.distM])).toEqual([
      ['예시안쪽정형외과', 999],
      ['예시경계정형외과', 1000],
    ])
    const small = cand('s', { radiusM: 300 })
    expect(pickEvents({ kind: 'open', ...PERIOD, rows: [row('예시정형외과')] }, small, RULE)).toEqual([])
    expect(
      pickEvents({ kind: 'open', ...PERIOD, rows: [row('예시정형외과', { point: { lat: CENTER.lat, lng: CENTER.lng } })] }, small, RULE),
    ).toEqual([{ candidateId: 's', kind: 'open', clinicName: '예시정형외과', dept: '정형외과', eventOn: '2026-11-10', distM: 0 }])
  })

  it('AC-7915.1: 거리는 coords.ts의 distM 하나로 센다(watch.ts 안에 거리 식을 다시 두지 않는다)', () => {
    const points = [
      { lat: CENTER.lat + 0.0031, lng: CENTER.lng + 0.0042 },
      { lat: CENTER.lat - 0.0057, lng: CENTER.lng - 0.0013 },
      { lat: CENTER.lat + 0.0002, lng: CENTER.lng - 0.0088 },
    ]
    const rows = points.map((point, i) => row(`예시${i}정형외과`, { point }))
    expect(pickEvents({ kind: 'open', ...PERIOD, rows }, cand('a'), RULE).map((e) => e.distM)).toEqual(points.map((p) => distM(CENTER, p)))
    const code = readFileSync(new URL('./watch.ts', import.meta.url), 'utf8')
    expect(code).toMatch(/import \{[^}]*\bdistM\b[^}]*\} from '\.\/coords'/)
    expect(code).not.toMatch(/Math\.asin|6_?371_?008/)
  })

  it('AC-7915.1: 폐업은 폐업일로 줄을 만들고, 그 날짜가 없으면 뺀다', () => {
    const rows = [
      row('예시닫은정형외과', { openedOn: '2015-03-02', closedOn: '2026-11-03' }),
      row('예시연정형외과', { openedOn: '2026-11-03', closedOn: null }),
    ]
    expect(pickEvents({ kind: 'close', ...PERIOD, rows }, cand('a'), RULE)).toEqual([
      { candidateId: 'a', kind: 'close', clinicName: '예시닫은정형외과', dept: '정형외과', eventOn: '2026-11-03', distM: 500 },
    ])
  })

  it('AC-7915.1: 개업·폐업일이 확인 기간 밖이면 넣지 않는다(기간 처음·끝 날은 넣는다)', () => {
    const rows = [
      row('예시처음날정형외과', { openedOn: '2026-10-24' }),
      row('예시끝날정형외과', { openedOn: '2026-11-20' }),
      row('예시앞정형외과', { openedOn: '2026-10-23' }),
      row('예시뒤정형외과', { openedOn: '2026-11-21' }),
      row('예시오래된정형외과', { openedOn: '2019-05-01' }),
      row('예시날짜틀린정형외과', { openedOn: '2026-11-31' }),
    ]
    expect(pickEvents({ kind: 'open', ...PERIOD, rows }, cand('a'), RULE).map((e) => e.clinicName)).toEqual([
      '예시처음날정형외과',
      '예시끝날정형외과',
    ])
  })

  it('AC-7915.1: 같은 줄(종류·이름·날짜)은 한 번만 넣는다', () => {
    const rows = [row('예시정형외과의원'), row('예시정형외과의원', { dept: '정형외과, 재활의학과' }), row('예시정형외과의원', { openedOn: '2026-11-11' })]
    expect(pickEvents({ kind: 'open', ...PERIOD, rows }, cand('a'), RULE).map((e) => [e.clinicName, e.eventOn])).toEqual([
      ['예시정형외과의원', '2026-11-10'],
      ['예시정형외과의원', '2026-11-11'],
    ])
  })

  it('AC-7915.1: 이름은 앞뒤 빈칸을 빼고 100자, 과목은 50자까지 줄이며, 이름이 비면 뺀다(DB 칸 제약)', () => {
    const longName = `예시${'가'.repeat(120)}정형외과`
    const longDept = `정형외과, ${'나'.repeat(80)}`
    const rows = [row(`  ${longName}  `, { dept: longDept }), row('   ', { dept: '정형외과' })]
    const events = pickEvents({ kind: 'open', ...PERIOD, rows }, cand('a'), RULE)
    expect(events).toHaveLength(1)
    expect(events[0].clinicName).toBe(longName.slice(0, 100))
    expect(events[0].dept).toBe(longDept.slice(0, 50))
  })

  it('AC-7915.1: 받은 줄이 없으면 빈 목록이다', () => {
    expect(pickEvents({ kind: 'open', ...PERIOD, rows: [] }, cand('a'), RULE)).toEqual([])
  })
})
