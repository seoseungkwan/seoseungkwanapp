// 치료 묶음 계산·제안·이름 고치기(TASK-6, REQ-006 · AC-006.1~AC-006.4, 매출 묶음 화면의 고치기 셋은 지움 AC-4110.4). 코드·금액은 모두 가짜다
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { REVENUE_REST_CODE, type RevenueCodeRow } from '@/types/revenue'
import { RX_GROUP_CODES_MAX, RX_GROUP_NAME_MAX, RX_GROUPS_MAX, type RxGroup } from '@/types/rxGroups'
import { groupTreatments, renameGroup, SUGGESTED_GROUPS, suggestGroups } from './treatments'

const REST_NAME = '그 밖 처방'
const FIVE_NAMES = ['도수치료', '체외충격파', 'C-arm 주사', '초음파', '냉동치료']

const row = (code: string, count: number, amount: number | null): RevenueCodeRow => ({ code, name: null, count, amount })
const group = (name: string, codes: string[], sortOrder: number, id: string | null = null): RxGroup => ({
  id,
  name,
  codes,
  sortOrder,
})
const named = (name: string, amount: number, count: number, missing = false) => ({ name, amount, count, missing, rest: false })
const rest = (amount: number, count: number, missing = false) => ({ name: REST_NAME, amount, count, missing, rest: true })

// 받은 목록을 건드리면 던지게 얼린다(ESM은 strict라 얼린 값을 바꾸면 TypeError)
function frozen(groups: RxGroup[]): RxGroup[] {
  for (const g of groups) {
    Object.freeze(g.codes)
    Object.freeze(g)
  }
  return Object.freeze(groups) as RxGroup[]
}

describe('AC-006.1 코드는 그 코드를 품은 첫 묶음 하나에만 든다', () => {
  it('AC-006.1 한 코드가 두 묶음에 있으면 sortOrder가 앞선 묶음에서만 센다(목록 자리가 아니라 sortOrder)', () => {
    const groups = [group('뒤 묶음', ['A1'], 1), group('앞 묶음', ['A1', 'B1'], 0)]
    expect(groupTreatments([row('A1', 2, 1000), row('B1', 1, 500)], groups)).toEqual([named('앞 묶음', 1500, 3)])
  })

  it('AC-006.1 어느 묶음에도 없는 코드는 그 밖 처방이다', () => {
    const groups = [group('주사', ['A1'], 0)]
    expect(groupTreatments([row('A1', 1, 700), row('Z9', 4, 300)], groups)).toEqual([named('주사', 700, 1), rest(300, 4)])
  })

  it('AC-006.1 _REST는 묶음에 적혀 있어도 그 밖 처방이다', () => {
    const groups = [group('주사', ['A1', REVENUE_REST_CODE], 0)]
    expect(groupTreatments([row('A1', 1, 700), row(REVENUE_REST_CODE, 5, 900)], groups)).toEqual([
      named('주사', 700, 1),
      rest(900, 5),
    ])
  })

  it('AC-006.1 묶음에 적혀 있지만 이번 달 자료에 없는 코드는 건너뛴다', () => {
    const groups = [group('주사', ['A1', '없는코드'], 0)]
    expect(groupTreatments([row('A1', 1, 700)], groups)).toEqual([named('주사', 700, 1)])
  })

  it('AC-006.1 받은 줄과 묶음을 바꾸지 않는다', () => {
    const groups = frozen([group('뒤', ['A1'], 1), group('앞', ['B1'], 0)])
    const codes = Object.freeze([row('A1', 1, 100), row('B1', 1, 200)]) as RevenueCodeRow[]
    expect(() => groupTreatments(codes, groups)).not.toThrow()
    expect(groups.map((g) => g.name)).toEqual(['뒤', '앞'])
  })
})

describe('AC-4105.5 코드는 대소문자를 가리지 않고 묶음에 든다(통계 codeKey와 같은 규칙)', () => {
  it('AC-4105.5 대소문자만 다른 코드는 같은 묶음으로 들어간다', () => {
    const groups = [group('물리치료', ['mm101'], 0)]
    expect(groupTreatments([row('MM101', 2, 1000), row('Mm101', 1, 500), row('mm101', 1, 250)], groups)).toEqual([named('물리치료', 1750, 4)])
  })

  it('AC-4105.5 대소문자만 다른 코드가 두 묶음에 있으면 sortOrder가 앞선 묶음에서만 센다', () => {
    const groups = [group('뒤 묶음', ['ESWT1'], 1), group('앞 묶음', ['eswt1'], 0)]
    expect(groupTreatments([row('Eswt1', 3, 900)], groups)).toEqual([named('앞 묶음', 900, 3)])
  })

  it('AC-4105.5 _REST는 그대로 그 밖 처방이다', () => {
    expect(groupTreatments([row(REVENUE_REST_CODE, 2, 400)], [group('주사', ['_rest'], 0)])).toEqual([rest(400, 2)])
  })
})

describe('AC-006.2 묶음마다 합을 내고 금액 큰 순으로 놓는다', () => {
  it('AC-006.2 금액·건수 합을 내고 금액 큰 순이다', () => {
    const groups = [group('작은', ['A1'], 0), group('큰', ['B1', 'B2'], 1)]
    const codes = [row('A1', 9, 100), row('B1', 1, 2000), row('B2', 2, 3000)]
    expect(groupTreatments(codes, groups)).toEqual([named('큰', 5000, 3), named('작은', 100, 9)])
  })

  it('AC-006.2 금액이 같으면 sortOrder 순이다', () => {
    const groups = [group('둘째', ['A1'], 1), group('첫째', ['B1'], 0), group('셋째', ['C1'], 2)]
    const codes = [row('C1', 1, 500), row('A1', 1, 500), row('B1', 1, 500)]
    expect(groupTreatments(codes, groups).map((t) => t.name)).toEqual(['첫째', '둘째', '셋째'])
  })

  it('AC-006.2 그 밖 처방은 금액이 가장 커도 맨 뒤다', () => {
    const groups = [group('주사', ['A1'], 0)]
    expect(groupTreatments([row('Z9', 1, 99_000), row('A1', 1, 10)], groups)).toEqual([named('주사', 10, 1), rest(99_000, 1)])
  })

  it('AC-006.2 금액이 null인 코드는 금액 합에서 빼고 missing을 단다(건수는 센다)', () => {
    const groups = [group('주사', ['A1', 'A2'], 0)]
    expect(groupTreatments([row('A1', 2, 1000), row('A2', 3, null)], groups)).toEqual([named('주사', 1000, 5, true)])
  })

  it('AC-006.2 그 밖 처방에도 missing을 단다', () => {
    expect(groupTreatments([row('Z9', 3, null)], [])).toEqual([rest(0, 3, true)])
  })

  it('AC-006.2 금액이 모두 null이어도 건수가 있으면 묶음을 남긴다', () => {
    const groups = [group('주사', ['A1'], 0)]
    expect(groupTreatments([row('A1', 2, null)], groups)).toEqual([named('주사', 0, 2, true)])
  })

  it('AC-006.2 금액·건수가 모두 0인 묶음과 그 밖 처방은 뺀다', () => {
    const groups = [group('영', ['A1'], 0), group('빈 묶음', [], 1), group('주사', ['B1'], 2)]
    expect(groupTreatments([row('A1', 0, 0), row('Z9', 0, 0), row('B1', 1, 100)], groups)).toEqual([named('주사', 100, 1)])
  })

  it('AC-006.2 금액 0이어도 건수가 있으면 남긴다', () => {
    const groups = [group('무료', ['A1'], 0)]
    expect(groupTreatments([row('A1', 2, 0)], groups)).toEqual([named('무료', 0, 2)])
  })

  it('AC-006.2 코드가 없으면 빈 목록이다', () => {
    expect(groupTreatments([], [group('주사', ['A1'], 0)])).toEqual([])
  })
})

describe('AC-006.3 저장된 묶음이 없을 때의 제안 다섯 개', () => {
  it('AC-006.3 제안 표는 원본 다섯 가지이고, 제안은 이름·순서·저장 안 함 표시를 단다', () => {
    expect(SUGGESTED_GROUPS.map((s) => s.name)).toEqual(FIVE_NAMES)
    const groups = suggestGroups(['도수', 'ESWT1', 'CARM1', 'SONO1', 'CRYO'])
    expect(groups).toEqual([
      { id: null, name: '도수치료', codes: ['도수'], sortOrder: 0, suggested: true },
      { id: null, name: '체외충격파', codes: ['ESWT1'], sortOrder: 1, suggested: true },
      { id: null, name: 'C-arm 주사', codes: ['CARM1'], sortOrder: 2, suggested: true },
      { id: null, name: '초음파', codes: ['SONO1'], sortOrder: 3, suggested: true },
      { id: null, name: '냉동치료', codes: ['CRYO'], sortOrder: 4, suggested: true },
    ])
  })

  it.each([
    ['도수', '도수치료'],
    ['도수 ', '도수치료'],
    [' 도수', '도수치료'],
    ['ESWT', '체외충격파'],
    ['eswt-2', '체외충격파'],
    ['X.Eswt1', '체외충격파'],
    ['CARM1', 'C-arm 주사'],
    ['carm1', 'C-arm 주사'],
    ['carm1 ', 'C-arm 주사'],
    ['SONO1', '초음파'],
    ['sono1', '초음파'],
    ['CRYO', '냉동치료'],
    ['cryo', '냉동치료'],
  ])('AC-006.3 코드 %j는 %s 제안 하나에만 글자 그대로 든다', (code, name) => {
    const groups = suggestGroups([code])
    expect(groups.filter((g) => g.codes.length > 0)).toHaveLength(1)
    expect(groups.find((g) => g.name === name)?.codes).toEqual([code])
  })

  it.each(['도수치료', '도수1', 'CARM12', 'XCARM1', 'SONO', 'SONO12', 'CRYO1', 'ESW', 'TX100', REVENUE_REST_CODE])(
    'AC-006.3 코드 %j는 어느 제안에도 들지 않는다',
    (code) => {
      expect(suggestGroups([code]).every((g) => g.codes.length === 0)).toBe(true)
    },
  )

  it('AC-006.3 같은 코드가 여러 번 와도 한 번만 든다', () => {
    expect(suggestGroups(['CRYO', 'CRYO']).find((g) => g.name === '냉동치료')?.codes).toEqual(['CRYO'])
  })

  it('AC-006.3 맞는 코드가 하나도 없어도 제안 다섯 개(처방 0개)가 나오고 그 코드는 그 밖 처방이다', () => {
    const groups = suggestGroups(['TX100', 'TX200'])
    expect(groups.map((g) => g.name)).toEqual(FIVE_NAMES)
    expect(groups.every((g) => g.codes.length === 0 && g.suggested)).toBe(true)
    expect(groupTreatments([row('TX100', 3, 30_000)], groups)).toEqual([rest(30_000, 3)])
  })

  it('AC-006.3 아는 코드가 없어도 제안 다섯 개다', () => {
    expect(suggestGroups([]).map((g) => g.name)).toEqual(FIVE_NAMES)
  })

  it('AC-006.3 제안으로 그대로 셀 수 있다', () => {
    const codes = [row('eswt-2', 2, 8000), row('carm1', 1, 9000)]
    const groups = suggestGroups(codes.map((c) => c.code))
    expect(groupTreatments(codes, groups)).toEqual([named('C-arm 주사', 9000, 1), named('체외충격파', 8000, 2)])
  })
})

describe('AC-006.4 묶음 고치기', () => {
  it('AC-006.4 한도 값은 묶음 50개·이름 30자·코드 1,000개다', () => {
    expect([RX_GROUPS_MAX, RX_GROUP_NAME_MAX, RX_GROUP_CODES_MAX]).toEqual([50, 30, 1000])
  })

  describe('이름 검사', () => {
    const REJECTED: [string, string][] = [
      ['', 'empty'],
      ['   ', 'empty'],
      ['가'.repeat(31), 'tooLong'],
      ['기존', 'duplicate'],
      ['  기존 ', 'duplicate'],
      ['a\u0007b', 'badChars'],
      ['a\nb', 'badChars'],
      ['a\u007fb', 'badChars'],
      ['a\u0085b', 'badChars'],
      ['a\u009fb', 'badChars'],
      ['900101-1234567', 'digits'],
      ['01012345678', 'digits'],
      ['123456', 'digits'],
    ]
    const ACCEPTED = ['12345', '가'.repeat(30), `  ${'가'.repeat(30)}  `, '😀'.repeat(30), '기존2', '기존 묶음', 'abc']

    it.each(REJECTED)('AC-006.4 renameGroup은 이름 %j를 %s로 거부한다', (name, error) => {
      expect(renameGroup([group('기존', [], 0), group('바꿀 것', [], 1)], 1, name)).toBe(error)
    })

    it.each(ACCEPTED)('AC-006.4 renameGroup은 이름 %j를 받는다', (name) => {
      const out = renameGroup([group('기존', [], 0), group('바꿀 것', [], 1)], 1, name)
      expect((out as RxGroup[])[1].name).toBe(name.trim())
    })
  })

  describe('renameGroup', () => {
    it('AC-006.4 그 자리의 이름만 바꾼 새 목록을 돌려준다(id·코드는 그대로)', () => {
      const groups = frozen([group('가', ['A1'], 0, 'g-1'), group('나', ['B1'], 1, 'g-2')])
      expect(renameGroup(groups, 1, ' 다 ')).toEqual([group('가', ['A1'], 0, 'g-1'), group('다', ['B1'], 1, 'g-2')])
      expect(groups[1].name).toBe('나')
    })

    it('AC-006.4 자기 이름 그대로는 겹침이 아니다', () => {
      expect(renameGroup([group('가', [], 0)], 0, '가')).toEqual([group('가', [], 0)])
    })

    it('AC-006.4 없는 자리면 목록 그대로다', () => {
      const groups = [group('가', [], 0)]
      expect(renameGroup(groups, 3, '나')).toBe(groups)
      expect(renameGroup(groups, -1, '나')).toBe(groups)
    })
  })

  // 매출 묶음 화면이 쓰던 addGroup·deleteGroup·moveCode와 그 시험은 지웠다(stats-revenue TASK-8, AC-4110.4). 통계 묶음 고치기가 쓰는 renameGroup·suggestGroups는 남는다
  it('AC-4110.4 treatments.ts는 addGroup·deleteGroup·moveCode를 내보내지 않고 renameGroup·suggestGroups·groupTreatments는 남는다', async () => {
    const treatments = await import('./treatments')
    expect(Object.keys(treatments).sort()).toEqual(['SUGGESTED_GROUPS', 'groupTreatments', 'renameGroup', 'suggestGroups'])
    const source = readFileSync(join(process.cwd(), 'src/lib/revenue/treatments.ts'), 'utf8')
    for (const name of ['addGroup', 'deleteGroup', 'moveCode']) expect(source, name).not.toMatch(new RegExp(`\\b${name}\\b`))
  })
})
