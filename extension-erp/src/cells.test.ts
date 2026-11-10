// TASK-4 REQ-3608: 도우미 답 + 설정 → design.md 4절 칸 표(planCells). 화면은 보지 않는다
import { describe, expect, it } from 'vitest'
import { ETC_NAMES, sampleDay, settingsAll, settingsFirst } from './__tests__/erpPage'
import { ETC_CLASH_ROWS, HELD_SALES, planCells, type Planned } from './cells'
import type { ClosingDay, Settings } from './types'

/** 칸 하나를 글자 열쇠로: 1|구역|줄 · 2|묶음|줄|열 · 2|낱칸 */
function cellKey(p: Planned): string {
  const w = p.where
  if (w.j === 1) return `1|${w.box}|${w.row}`
  if ('field' in w) return `2|${w.field}`
  return `2|${w.card}|${w.row}|${w.col}`
}
/** 칸 → 값 글자, 건너뛴 칸은 그 까닭 */
function sheet(plan: Planned[]): Record<string, string> {
  return Object.fromEntries(plan.map((p) => [cellKey(p), p.why ?? (p.value as string)]))
}
function pick(all: Record<string, string>, prefix: string): Record<string, string> {
  return Object.fromEntries(Object.entries(all).filter(([k]) => k.startsWith(prefix)))
}
const count = (plan: Planned[], why?: NonNullable<Planned['why']>) =>
  plan.filter((p) => (why ? p.why === why : p.value !== null && !p.why)).length

// sampleDay 묶음 i번째(GROUP_KEYS 차례) 값
const G = { new: (i: number) => String(100 + i), f90: (i: number) => String(200 + i), ret: (i: number) => String(300 + i) }
const pts = (i: number) => String(400 + i)
const total = (i: number) => String((i + 1) * 1_000_000 + 1_234)

describe('AC-3608.3 planCells: design.md 4절 칸 표 그대로', () => {
  const plan = planCells(sampleDay(), settingsAll())
  const all = sheet(plan)

  it('AC-3608.3 AC-3608.4: 모두 고르면 업무일지 1은 32칸, 업무일지 2는 99칸이고, 보류가 끝나(HELD_SALES = []) 건너뛴 칸이 없다', () => {
    expect(plan).toHaveLength(131)
    expect(plan.filter((p) => p.where.j === 1)).toHaveLength(32)
    expect(plan.filter((p) => p.where.j === 2)).toHaveLength(99)
    expect(count(plan)).toBe(131)
    expect(count(plan, 'held')).toBe(0)
    expect(count(plan, 'unpicked')).toBe(0)
    expect(count(plan, 'unknown')).toBe(0)
    // 같은 칸이 두 번 나오지 않는다
    expect(new Set(plan.map(cellKey)).size).toBe(131)
  })

  it('AC-3608.2: 값은 모두 쉼표 없는 정수 글자다(보류 칸은 값이 없다)', () => {
    for (const p of plan) {
      if (p.why) expect(p.value, cellKey(p)).toBeNull()
      else expect(p.value, cellKey(p)).toMatch(/^-?\d+$/)
    }
  })

  it('AC-3608.3: 업무일지 1 환자현황·진료 · 치료현황·외래 수입·입원수입(입원 0이면 0)', () => {
    expect(pick(all, '1|')).toEqual({
      '1|환자현황|신환': '7',
      '1|환자현황|90일초진': '10',
      '1|환자현황|재진': '52',
      '1|환자현황|물리치료내원': '11',
      '1|환자현황|진찰료 산정안함': '4',
      '1|환자현황|합계': '84',
      '1|진료 · 치료현황|씨암': pts(0),
      '1|진료 · 치료현황|SONO': pts(1),
      '1|진료 · 치료현황|도수상담': pts(10),
      '1|진료 · 치료현황|도수치료': pts(3),
      '1|진료 · 치료현황|충격파(체충)': pts(4),
      '1|진료 · 치료현황|관절조영술': pts(2),
      '1|진료 · 치료현황|리푸스': pts(11),
      '1|진료 · 치료현황|손발톱케어': pts(12),
      '1|진료 · 치료현황|CT': pts(13),
      '1|진료 · 치료현황|수술': pts(14),
      '1|외래 수입|외래 총매출': '11668530',
      '1|외래 수입|청구액(-)': '6120400',
      '1|외래 수입|미수입금(+)': '35000',
      '1|외래 수입|미수발생(-)': '12000',
      '1|외래 수입|비급여': '2410300',
      '1|외래 수입|감액': '8000',
      '1|외래 수입|장애인기금(-)': '1500',
      '1|외래 수입|진료수납액': '5571630',
      '1|외래 수입|카드수납액(-)': '4012330',
      '1|외래 수입|현금수납액(-)': '1208300',
      '1|외래 수입|계좌이체액(-)': '351000',
      '1|외래 수입|현불/환불(-)': '33000',
      '1|입원수입|청구': '0',
      '1|입원수입|비급여': '0',
      '1|입원수입|본인부담금': '0',
      '1|입원수입|수납액': '0',
    })
  })

  it('AC-3608.3: 업무일지 2 예약 = 줄마다 고른 메모 번호들의 합, 실예약환자수 = 첫 열', () => {
    expect(pick(all, '2|예약|')).toEqual({
      // 주사 = 3번
      '2|예약|주사|총갯수': '51',
      '2|예약|주사|내원': '52',
      '2|예약|주사|변경': '53',
      '2|예약|주사|취소': '54',
      // 경과 = 7번
      '2|예약|경과|총갯수': '61',
      '2|예약|경과|내원': '62',
      '2|예약|경과|변경': '63',
      '2|예약|경과|취소': '64',
      // 도수 = 14 + 20 + 22번
      '2|예약|도수|총갯수': String(21 + 31 + 41),
      '2|예약|도수|내원': String(22 + 32 + 42),
      '2|예약|도수|변경': String(23 + 33 + 43),
      '2|예약|도수|취소': String(24 + 34 + 44),
      // 충격파 = 1번
      '2|예약|충격파|총갯수': '11',
      '2|예약|충격파|내원': '12',
      '2|예약|충격파|변경': '13',
      '2|예약|충격파|취소': '14',
      // 그날 예약이 없는 메모(9번·5번)를 고른 줄은 0
      '2|예약|진료예약|총갯수': '0',
      '2|예약|진료예약|내원': '0',
      '2|예약|진료예약|변경': '0',
      '2|예약|진료예약|취소': '0',
      '2|예약|기타(수액,드레싱등)|총갯수': '0',
      '2|예약|기타(수액,드레싱등)|내원': '0',
      '2|예약|기타(수액,드레싱등)|변경': '0',
      '2|예약|기타(수액,드레싱등)|취소': '0',
      '2|예약|실예약환자수|총갯수': '77',
    })
  })

  it('AC-3608.3: 업무일지 2 치료별 건수 = 씨암·SONO·관절조영·도수·충격파·{기타 이름} × 신환·90일초진·재진', () => {
    const rows: [string, number][] = [
      ['씨암(주사)', 0],
      ['SONO(주사)', 1],
      ['관절조영', 2],
      ['도수', 3],
      ['충격파', 4],
      [ETC_NAMES[0], 6],
      [ETC_NAMES[1], 7],
      [ETC_NAMES[2], 8],
      [ETC_NAMES[3], 9],
    ]
    const card = '2|치료별 신환/90일초진/재진 건수|'
    expect(pick(all, card)).toEqual(
      Object.fromEntries(
        rows.flatMap(([row, i]) => [
          [`${card}${row}|신환`, G.new(i)],
          [`${card}${row}|90일초진`, G.f90(i)],
          [`${card}${row}|재진`, G.ret(i)],
        ]),
      ),
    )
  })

  it('AC-3608.3: 업무일지 2 연령별 = 10대미만·10대·…·90대 × 신환·90일초진·재진(ages 0…90)', () => {
    const bands = ['10대미만', '10대', '20대', '30대', '40대', '50대', '60대', '70대', '80대', '90대']
    const card = '2|연령별 신환/90일초진/재진|'
    expect(pick(all, card)).toEqual(
      Object.fromEntries(
        bands.flatMap((row, k) => [
          [`${card}${row}|신환`, String(500 + k)],
          [`${card}${row}|90일초진`, String(600 + k)],
          [`${card}${row}|재진`, String(700 + k)],
        ]),
      ),
    )
  })

  it('AC-3608.3: 업무일지 2 운영 지표 낱칸, 도수·충격파 총금액 = 치료별 매출 도수·충격파 값', () => {
    const fields = Object.fromEntries(Object.entries(all).filter(([k]) => k.split('|').length === 2))
    expect(fields).toEqual({
      '2|도수 총금액': total(3),
      '2|충격파 총금액': total(4),
      '2|ESWT Standard': pts(15),
      '2|ESWT Radial': pts(16),
      '2|주사1회환자': '9',
      '2|신환주사환자': '3',
      '2|신환주사건수': '4',
    })
    expect(all['2|도수 총금액']).toBe(all['2|치료별 매출|도수|금액(원)'])
    expect(all['2|충격파 총금액']).toBe(all['2|치료별 매출|충격파|금액(원)'])
  })

  it('AC-3608.3 AC-3608.4: 업무일지 2 치료별 매출 = 씨암·SONO·관절조영·도수·충격파·물리치료·{기타 이름} 금액(원), 씨암·SONO도 묶음 total(보류 끝남)', () => {
    expect(pick(all, '2|치료별 매출|')).toEqual({
      '2|치료별 매출|씨암|금액(원)': total(0),
      '2|치료별 매출|SONO|금액(원)': total(1),
      '2|치료별 매출|관절조영|금액(원)': total(2),
      '2|치료별 매출|도수|금액(원)': total(3),
      '2|치료별 매출|충격파|금액(원)': total(4),
      '2|치료별 매출|물리치료|금액(원)': total(5),
      [`2|치료별 매출|${ETC_NAMES[0]}|금액(원)`]: total(6),
      [`2|치료별 매출|${ETC_NAMES[1]}|금액(원)`]: total(7),
      [`2|치료별 매출|${ETC_NAMES[2]}|금액(원)`]: total(8),
      [`2|치료별 매출|${ETC_NAMES[3]}|금액(원)`]: total(9),
    })
  })

  it('AC-3608.3: 업무일지 1 칸을 먼저, 표 차례(구역·줄·열)대로 낸다', () => {
    const firstW2 = plan.findIndex((p) => p.where.j === 2)
    expect(plan.slice(firstW2).every((p) => p.where.j === 2)).toBe(true)
    expect(plan.slice(0, 6).map(cellKey)).toEqual([
      '1|환자현황|신환',
      '1|환자현황|90일초진',
      '1|환자현황|재진',
      '1|환자현황|물리치료내원',
      '1|환자현황|진찰료 산정안함',
      '1|환자현황|합계',
    ])
  })

  it('AC-3608.4: 직접 입력 칸(이미 정한 것 8)·기본단가·특이사항·상태는 칸 표에 없다', () => {
    const keys = plan.map(cellKey).join('\n')
    for (const word of [
      '담당',
      '휴무자',
      '팀장',
      '원장',
      '신환경로',
      '상담-전환률',
      '지출',
      '이벤트',
      '특이사항',
      '상태',
      'MOU 감액',
      '기본단가',
      '김도수',
    ]) {
      expect(keys, word).not.toContain(word)
    }
    // 운영 지표 치료사 표 칸도 없다(낱칸만)
    expect(plan.some((p) => p.where.j === 2 && 'card' in p.where && p.where.card.startsWith('운영 지표'))).toBe(false)
  })
})

describe('AC-3608.4 planCells: 고르지 않은 항목(unpicked)·셀 수 없는 칸(unknown)은 값이 null', () => {
  it('AC-3608.4: 처음 값 + 예약 도수·충격파를 고르면 131칸 가운데 93칸, 고르지 않아 건너뛴 칸 38칸, 보류 0칸', () => {
    const plan = planCells(sampleDay(), settingsFirst())
    expect(plan).toHaveLength(131)
    expect(count(plan)).toBe(93)
    expect(count(plan, 'unpicked')).toBe(38)
    expect(count(plan, 'held')).toBe(0)
    expect(count(plan, 'unknown')).toBe(0)
    for (const p of plan) if (p.why) expect(p.value, cellKey(p)).toBeNull()
  })

  it('AC-3608.4: 고르지 않은 묶음·예약 줄·이름 없는 기타 줄은 unpicked', () => {
    const all = sheet(planCells(sampleDay(), settingsFirst()))
    expect(all['1|진료 · 치료현황|리푸스']).toBe('unpicked')
    expect(all['1|진료 · 치료현황|씨암']).toBe(pts(0))
    expect(all['2|예약|주사|총갯수']).toBe('unpicked')
    expect(all['2|예약|도수|총갯수']).toBe(String(21 + 31 + 41))
    // 실예약환자수는 고름과 상관없이 채운다
    expect(all['2|예약|실예약환자수|총갯수']).toBe('77')
    expect(all['2|ESWT Standard']).toBe('unpicked')
    expect(all['2|주사1회환자']).toBe('unpicked')
    expect(all['2|신환주사환자']).toBe('unpicked')
    expect(all['2|신환주사건수']).toBe('unpicked')
    // 기타1 = '크라이오'(고름), 기타2~4는 이름이 비어 있어 기본 이름 줄로 적고 건너뜀
    expect(all['2|치료별 매출|크라이오|금액(원)']).toBe(total(6))
    expect(all['2|치료별 매출|기타2|금액(원)']).toBe('unpicked')
    expect(all['2|치료별 신환/90일초진/재진 건수|기타4|재진']).toBe('unpicked')
  })

  it('AC-3608.4: 물리치료내원 묶음을 고르지 않으면(ptVisit null) unpicked, 골랐는데 null이면 unknown', () => {
    const day = sampleDay()
    day.patients.ptVisit = null
    day.groups = day.groups.filter((g) => g.key !== 'ptVisit')
    const settings = settingsAll()
    delete settings.picks.ptVisit
    expect(sheet(planCells(day, settings))['1|환자현황|물리치료내원']).toBe('unpicked')
    expect(sheet(planCells(day, settingsAll()))['1|환자현황|물리치료내원']).toBe('unknown')
    // 다른 환자현황 칸은 그대로 채운다
    expect(sheet(planCells(day, settings))['1|환자현황|재진']).toBe('52')
  })

  it('AC-3608.4: 코드가 빈 글자뿐인 고름은 고르지 않은 것으로 본다', () => {
    const settings = settingsAll()
    settings.picks.lipus = ['', '  ']
    expect(sheet(planCells(sampleDay(), settings))['1|진료 · 치료현황|리푸스']).toBe('unpicked')
  })

  it('AC-3608.4: 금액이 null이면 그 칸만 unknown', () => {
    const day = sampleDay()
    day.money.refund = null
    day.money.discount = null
    const all = sheet(planCells(day, settingsAll()))
    expect(all['1|외래 수입|현불/환불(-)']).toBe('unknown')
    expect(all['1|외래 수입|감액']).toBe('unknown')
    expect(all['1|외래 수입|외래 총매출']).toBe('11668530')
  })

  it('AC-3608.3: 입원 접수가 있으면(inpatientVisits > 0) 입원수입 4칸은 unknown', () => {
    const day = sampleDay()
    day.inpatientVisits = 2
    const all = sheet(planCells(day, settingsAll()))
    for (const row of ['청구', '비급여', '본인부담금', '수납액']) expect(all[`1|입원수입|${row}`], row).toBe('unknown')
    expect(all['1|외래 수입|비급여']).toBe('2410300')
  })

  it('AC-3608.4: 주사1회환자가 null(옛 자료 있음)이면 그 칸만 unknown, 주사를 골랐는데 injection이 없으면 셋 다 unknown', () => {
    const day = sampleDay()
    day.injection = { firstTime: null, newPatients: 3, newLines: 4 }
    let all = sheet(planCells(day, settingsAll()))
    expect(all['2|주사1회환자']).toBe('unknown')
    expect(all['2|신환주사환자']).toBe('3')
    expect(all['2|신환주사건수']).toBe('4')
    day.injection = null
    all = sheet(planCells(day, settingsAll()))
    expect([all['2|주사1회환자'], all['2|신환주사환자'], all['2|신환주사건수']]).toEqual(['unknown', 'unknown', 'unknown'])
  })

  it('AC-3608.4: 골랐는데 답에 묶음이 없거나 연령 줄이 빠지면 그 칸은 unknown', () => {
    const day = sampleDay()
    day.groups = day.groups.filter((g) => g.key !== 'sono')
    day.ages = day.ages.filter((a) => a.band !== '90')
    const all = sheet(planCells(day, settingsAll()))
    expect(all['1|진료 · 치료현황|SONO']).toBe('unknown')
    expect(all['2|치료별 매출|SONO|금액(원)']).toBe('unknown')
    expect(all['2|치료별 신환/90일초진/재진 건수|SONO(주사)|신환']).toBe('unknown')
    expect(all['2|연령별 신환/90일초진/재진|90대|재진']).toBe('unknown')
    expect(all['2|연령별 신환/90일초진/재진|80대|재진']).toBe('708')
  })
})

describe('AC-3608.4 planCells: 보류 묶음 HELD_SALES(기본값 (아) → TASK-15에서 비움)', () => {
  /** 보류 장치가 그대로 도는지 보려고 HELD_SALES를 잠깐 씨암·SONO로 둔다. 끝나면 되돌린다 */
  function withHeld<T>(run: () => T): T {
    const saved = HELD_SALES.splice(0, HELD_SALES.length, 'carm', 'sono')
    try {
      return run()
    } finally {
      HELD_SALES.splice(0, HELD_SALES.length, ...saved)
    }
  }

  it('AC-3608.4: 보류 묶음은 cells.ts HELD_SALES 한 곳이고 TASK-15에서 비웠다(씨암·SONO 보류 끝, 이미 정한 것 10)', () => {
    expect(HELD_SALES).toEqual([])
  })

  it('AC-3608.4: 보류 묶음의 치료별 매출 칸은 코드를 골랐으면 held(값 없음)이고, 같은 묶음의 건수 칸은 그대로 채운다', () => {
    const plan = withHeld(() => planCells(sampleDay(), settingsFirst()))
    const held = plan.filter((p) => p.why === 'held')
    expect(held.map(cellKey)).toEqual(['2|치료별 매출|씨암|금액(원)', '2|치료별 매출|SONO|금액(원)'])
    for (const p of held) expect(p.value).toBeNull()
    const all = sheet(plan)
    expect(all['1|진료 · 치료현황|씨암']).toBe(pts(0))
    expect(all['1|진료 · 치료현황|SONO']).toBe(pts(1))
    expect(all['2|치료별 신환/90일초진/재진 건수|씨암(주사)|신환']).toBe(G.new(0))
    expect(all['2|치료별 신환/90일초진/재진 건수|SONO(주사)|재진']).toBe(G.ret(1))
    // 다른 묶음의 치료별 매출은 그대로
    expect(all['2|치료별 매출|관절조영|금액(원)']).toBe(total(2))
    expect(all['2|치료별 매출|물리치료|금액(원)']).toBe(total(5))
  })

  it('AC-3608.4: 보류 묶음이라도 코드를 고르지 않았으면 지금처럼 unpicked다', () => {
    const settings = settingsFirst()
    delete settings.picks.carm
    const plan = withHeld(() => planCells(sampleDay(), settings))
    const all = sheet(plan)
    expect(all['2|치료별 매출|씨암|금액(원)']).toBe('unpicked')
    expect(all['2|치료별 매출|SONO|금액(원)']).toBe('held')
    expect(count(plan, 'held')).toBe(1)
    expect(HELD_SALES).toEqual([])
  })

  it('AC-3608.4: HELD_SALES가 비어 있으면(지금) 씨암·SONO 치료별 매출도 묶음 total로 채운다', () => {
    const plan = planCells(sampleDay(), settingsAll())
    const all = sheet(plan)
    expect(all['2|치료별 매출|씨암|금액(원)']).toBe(total(0))
    expect(all['2|치료별 매출|SONO|금액(원)']).toBe(total(1))
    expect(count(plan)).toBe(131)
    expect(count(plan, 'held')).toBe(0)
  })
})

describe('AC-3609.7 planCells: 함께 있는 진료 선택 셋(design.md 4절 식)', () => {
  // 씨암 total = 1,001,234 · SONO total = 2,001,234(sampleDay). 함께 있는 진료 9건: 씨암 쪽 400,000 · SONO 쪽 300,000
  const withOverlap = (overlap: ClosingDay['overlap']): ClosingDay => ({ ...sampleDay(), overlap })
  const sales = (plan: Planned[]) => {
    const all = sheet(plan)
    return [all['2|치료별 매출|씨암|금액(원)'], all['2|치료별 매출|SONO|금액(원)']]
  }
  const OVERLAP = { visits: 9, carm: 400_000, sono: 300_000 }

  it("AC-3609.7: '씨암에 넣기'(carm)면 SONO에서 overlap.sono를 빼고 씨암은 그대로다", () => {
    expect(sales(planCells(withOverlap(OVERLAP), settingsFirst(), 'carm'))).toEqual([total(0), String(2_001_234 - 300_000)])
  })

  it("AC-3609.7: 'SONO에 넣기'(sono)면 씨암에서 overlap.carm을 빼고 SONO는 그대로다", () => {
    expect(sales(planCells(withOverlap(OVERLAP), settingsFirst(), 'sono'))).toEqual([String(1_001_234 - 400_000), total(1)])
  })

  it("AC-3609.7: '둘 다 넣기'(both)·고르지 않음·overlap null·0건이면 두 칸 모두 묶음 total 그대로다", () => {
    expect(sales(planCells(withOverlap(OVERLAP), settingsFirst(), 'both'))).toEqual([total(0), total(1)])
    expect(sales(planCells(withOverlap(OVERLAP), settingsFirst()))).toEqual([total(0), total(1)])
    expect(sales(planCells(withOverlap(null), settingsFirst(), 'carm'))).toEqual([total(0), total(1)])
    expect(sales(planCells(withOverlap({ visits: 0, carm: 0, sono: 0 }), settingsFirst(), 'sono'))).toEqual([total(0), total(1)])
    // 예전 답처럼 overlap 칸이 없어도 그대로
    expect(sales(planCells(sampleDay(), settingsFirst(), 'carm'))).toEqual([total(0), total(1)])
  })

  it('AC-3609.7: 선택은 치료별 매출 씨암·SONO 두 칸만 바꾼다(건수·다른 매출·운영 지표 칸은 그대로)', () => {
    const base = sheet(planCells(withOverlap(OVERLAP), settingsAll(), 'both'))
    for (const choice of ['carm', 'sono'] as const) {
      const got = sheet(planCells(withOverlap(OVERLAP), settingsAll(), choice))
      const changed = Object.keys(base).filter((k) => base[k] !== got[k])
      expect(changed, choice).toEqual([choice === 'carm' ? '2|치료별 매출|SONO|금액(원)' : '2|치료별 매출|씨암|금액(원)'])
    }
  })

  it('AC-3609.7: 씨암·SONO 묶음이 답에 없거나 고르지 않았으면 그 칸은 지금처럼 unknown·unpicked다', () => {
    const day = withOverlap(OVERLAP)
    day.groups = day.groups.filter((g) => g.key !== 'sono')
    expect(sales(planCells(day, settingsFirst(), 'carm'))).toEqual([total(0), 'unknown'])
    const settings = settingsFirst()
    delete settings.picks.carm
    expect(sales(planCells(withOverlap(OVERLAP), settings, 'sono'))).toEqual(['unpicked', total(1)])
  })
})

describe('AC-3608.3 planCells: 기타 이름 줄·예약 메모 합 세부', () => {
  it('AC-3608.3 AC-3613.2: 기타 줄 이름은 설정의 기타 이름(앞뒤 공백 뗌)이고, 코드를 골랐는데 이름이 비면 noName(기본 이름 기타N 줄)이다', () => {
    const settings: Settings = settingsAll()
    settings.etcNames = { etc1: '  크라이오 ', etc2: '', etc3: '수액', etc4: ' ' }
    const plan = planCells(sampleDay(), settings)
    const all = sheet(plan)
    expect(all['2|치료별 매출|크라이오|금액(원)']).toBe(total(6))
    expect(all['2|치료별 신환/90일초진/재진 건수|크라이오|90일초진']).toBe(G.f90(6))
    expect(all['2|치료별 매출|기타2|금액(원)']).toBe('noName')
    expect(all['2|치료별 매출|수액|금액(원)']).toBe(total(8))
    expect(all['2|치료별 매출|기타4|금액(원)']).toBe('noName')
    expect(all['2|치료별 신환/90일초진/재진 건수|기타2|신환']).toBe('noName')
    expect(all['2|치료별 신환/90일초진/재진 건수|기타4|재진']).toBe('noName')
    // 기타2·기타4 줄마다 건수 3칸 + 매출 1칸, 고르지 않은 칸에 섞지 않는다
    expect(count(plan, 'noName')).toBe(8)
    expect(count(plan, 'unpicked')).toBe(0)
    for (const p of plan.filter((x) => x.why === 'noName')) expect(p.value).toBeNull()
    expect(plan).toHaveLength(131)
  })

  it('AC-3613.2: 코드를 고르지 않은 기타 줄은 이름이 있든 없든 unpicked다(noName은 고른 줄만)', () => {
    const settings: Settings = settingsAll()
    delete settings.picks.etc2
    delete settings.picks.etc3
    settings.etcNames = { etc1: '크라이오', etc2: '', etc3: '수액', etc4: '테이핑' }
    const all = sheet(planCells(sampleDay(), settings))
    expect(all['2|치료별 매출|기타2|금액(원)']).toBe('unpicked')
    expect(all['2|치료별 매출|수액|금액(원)']).toBe('unpicked')
    expect(all['2|치료별 매출|테이핑|금액(원)']).toBe(total(9))
    expect(Object.values(all)).not.toContain('noName')
  })

  it('AC-3608.3: 예약 메모 번호는 앞뒤 공백을 떼고 같은 번호를 두 번 더하지 않는다', () => {
    const settings = settingsAll()
    settings.reservations.manual = [' 14', '14', '20 ']
    const day: ClosingDay = sampleDay()
    day.reservations.kinds.push({ kind: ' 30 ', total: 1000, visited: 0, changed: 0, canceled: 0 })
    settings.reservations.etc = ['30']
    const all = sheet(planCells(day, settings))
    expect(all['2|예약|도수|총갯수']).toBe(String(21 + 31))
    expect(all['2|예약|기타(수액,드레싱등)|총갯수']).toBe('1000')
  })

  it('AC-3608.2: 정수가 아닌 값은 원 미만을 버리고(반올림 없음), -0은 0이다', () => {
    const day = sampleDay()
    day.money.total = 1234.9
    day.money.cash = -0
    const all = sheet(planCells(day, settingsAll()))
    expect(all['1|외래 수입|외래 총매출']).toBe('1234')
    expect(all['1|외래 수입|현금수납액(-)']).toBe('0')
  })
})

describe('AC-3615.7 ETC_CLASH_ROWS: 업무일지 2 치료별 건수·치료별 매출의 고정 줄 이름(TASK-18이 [저장]에서 막는다)', () => {
  it('AC-3615.7: design.md 4절 차례 그대로 씨암(주사)·SONO(주사)·관절조영·도수·충격파·씨암·SONO·물리치료다(같은 이름은 한 번)', () => {
    expect([...ETC_CLASH_ROWS]).toEqual(['씨암(주사)', 'SONO(주사)', '관절조영', '도수', '충격파', '씨암', 'SONO', '물리치료'])
    expect(Object.isFrozen(ETC_CLASH_ROWS)).toBe(true)
  })

  it('AC-3615.7: 칸 계획의 치료별 건수·치료별 매출 고정 줄은 모두 이 목록에 있다(기타 줄 말고)', () => {
    const fixed = planCells(sampleDay(), settingsAll())
      .map((p) => p.where)
      .filter((w): w is Extract<Planned['where'], { card: string }> => 'card' in w)
      .filter((w) => w.card === '치료별 신환/90일초진/재진 건수' || w.card === '치료별 매출')
      .map((w) => w.row)
      .filter((row) => !ETC_NAMES.includes(row))
    expect([...new Set(fixed)].sort()).toEqual([...ETC_CLASH_ROWS].sort())
  })

  it("AC-3615.7: 기타 이름을 고정 줄 이름('도수')으로 두면 그 고정 줄과 같은 칸 자리가 두 번 나온다(그래서 [저장]에서 막는다)", () => {
    const settings = settingsAll()
    settings.etcNames.etc2 = '도수'
    const keys = planCells(sampleDay(), settings).map(cellKey)
    expect(keys.filter((k) => k === '2|치료별 매출|도수|금액(원)')).toHaveLength(2)
  })
})
