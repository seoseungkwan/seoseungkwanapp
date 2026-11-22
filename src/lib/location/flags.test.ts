import { describe, expect, it } from 'vitest'
import { FLAG_LAW, FLAG_ORDER, pickFlags, type FlagInput, type FlagRival } from './flags'

// 위험 신호(specs/location design.md 9절, AC-7911.3). 오늘은 2026-11-22로 고정, 3년 전 = 2023-11-22
const TODAY = '2026-11-22'

// 40㎡ = 12.1평이라 월세 = 평당 월세 × 12.1 (평당 월세는 10원 단위로 주면 월세가 정수)
const at40 = (perPy: number) => ({ areaM2: 40, rent: (perPy * 121) / 10 })

const rival = (distM: number, kind: FlagRival['kind'] = 'ortho', name = `예시${distM}정형외과`): FlagRival => ({
  name,
  kind,
  distM,
  doctors: null,
  openedYear: null,
})

// 11칸(10세 나이대) 가운데 60세 이상(뒤 다섯 칸)이 seniors명, 전체 total명
const peopleOf = (total: number, seniors: number) => ({
  total,
  bands: [total - seniors, 0, 0, 0, 0, 0, seniors, 0, 0, 0, 0],
})

// 아무 위험도 없는 후보(위반 건축물은 '없음'으로 고름)
const SAFE: FlagInput = {
  today: TODAY,
  radiusM: 1000,
  violation: 'no',
  floorLabel: '1층',
  rivals: [],
  history: [],
  listing: null,
  listings: [],
  building: { approvedOn: '2000-01-01', totalM2: 300, elevators: 1 },
  people: peopleOf(1000, 300),
  station: { name: '예시역', line: '예시선', distM: 300 },
}
const ids = (input: Partial<FlagInput>) => pickFlags({ ...SAFE, ...input }).map((f) => f.id)
const flagOf = (input: Partial<FlagInput>, id: string) => pickFlags({ ...SAFE, ...input }).find((f) => f.id === id)

// 열 가지가 다 맞는 후보(위반 건축물 '있음')
const ALL: FlagInput = {
  today: TODAY,
  radiusM: 1000,
  violation: 'yes',
  floorLabel: '3층',
  rivals: [rival(12), rival(200, 'pain'), rival(400, 'rehab'), rival(600), rival(900), rival(50, 'korean', '예시한의원')],
  history: [{ kind: 'close', name: '예시가정의원', dept: '가정의학과', on: '2024-03-15', distM: 10 }],
  listing: { ...at40(130_010), premium: 50_000_000 },
  listings: [at40(130_010), at40(85_000), at40(85_000)],
  building: { approvedOn: '2025-06-01', totalM2: 820.5, elevators: 0 },
  people: peopleOf(1000, 110),
  station: { name: '예시역', line: '예시선', distM: 1400 },
}

describe('AC-7911.3 위험 신호 고르기', () => {
  it('AC-7911.3: 차례는 design.md 9절 열 가지 그대로다', () => {
    expect(FLAG_ORDER).toEqual([
      'violation-yes',
      'violation-check',
      'same-building',
      'closed-here',
      'rent-high',
      'premium-new',
      'many-rivals',
      'few-seniors',
      'far-station',
      'barrier',
    ])
  })

  it('AC-7911.3: 다 맞으면 9절 차례대로 나온다(위반 건축물 있음이면 확인 필요는 없다)', () => {
    expect(pickFlags(ALL).map((f) => f.id)).toEqual([
      'violation-yes',
      'same-building',
      'closed-here',
      'rent-high',
      'premium-new',
      'many-rivals',
      'few-seniors',
      'far-station',
      'barrier',
    ])
    expect(pickFlags({ ...ALL, violation: null }).map((f) => f.id)).toEqual([
      'violation-check',
      'same-building',
      'closed-here',
      'rent-high',
      'premium-new',
      'many-rivals',
      'few-seniors',
      'far-station',
      'barrier',
    ])
  })

  it('AC-7911.3: 맞는 것만 나온다 — 위험 없는 후보는 빈 목록, 자료가 모두 없으면 위반 건축물 확인 필요 하나뿐', () => {
    expect(pickFlags(SAFE)).toEqual([])
    const none: FlagInput = {
      today: TODAY,
      radiusM: 1000,
      violation: null,
      floorLabel: null,
      rivals: null,
      history: null,
      listing: null,
      listings: [],
      building: null,
      people: null,
      station: null,
    }
    expect(pickFlags(none).map((f) => f.id)).toEqual(['violation-check'])
  })
})

describe('AC-7911.3 위반 건축물', () => {
  it('AC-7911.3: 있음이면 빨간 깃발(건축법 79조), 안 고름·모름이면 확인 필요, 없음이면 아무것도 없다', () => {
    const yes = flagOf({ violation: 'yes' }, 'violation-yes')
    expect(yes).toMatchObject({ level: 'red', title: '건축물대장에 위반 건축물로 올라 있어요', law: FLAG_LAW.violation })
    expect(yes?.detail).toContain('막힐 수 있어요')
    for (const violation of [null, 'unknown'] as const) {
      const check = pickFlags({ ...SAFE, violation })
      expect(check.map((f) => f.id), String(violation)).toEqual(['violation-check'])
      expect(check[0]).toMatchObject({ level: 'check', title: '위반 건축물 확인 필요', law: FLAG_LAW.violation })
      expect(check[0].detail).toContain('건축물대장을 떼어')
    }
    expect(ids({ violation: 'no' })).toEqual([])
  })

  it('AC-7911.3: 근거 id는 LAW_BASIS id 글자다(위반 건축물 = 건축법 79조, 승강기 = 장애인등편의법 별표 2)', () => {
    expect(FLAG_LAW).toEqual({ violation: 'building-79', barrier: 'accessibility' })
    const byId = Object.fromEntries(pickFlags(ALL).map((f) => [f.id, f.law]))
    expect(byId).toEqual({
      'violation-yes': 'building-79',
      'same-building': null,
      'closed-here': null,
      'rent-high': null,
      'premium-new': null,
      'many-rivals': null,
      'few-seniors': null,
      'far-station': null,
      barrier: 'accessibility',
    })
    expect(pickFlags(ALL).filter((f) => f.id !== 'violation-yes').every((f) => f.level === 'red')).toBe(true)
  })
})

describe('AC-7911.3 경쟁 의원 30m 안(same-building)', () => {
  it('AC-7911.3: 30m면 나오고 31m면 안 나온다', () => {
    expect(ids({ rivals: [rival(30)] })).toEqual(['same-building'])
    expect(ids({ rivals: [rival(31)] })).toEqual([])
  })

  it('AC-7911.3: 한의원은 경쟁 의원이 아니라 30m 안이어도 안 나온다', () => {
    expect(ids({ rivals: [rival(5, 'korean', '예시한의원')] })).toEqual([])
  })

  it('AC-7911.3: 글은 가장 가까운 의원의 과목·이름·문 연 해·의사 수·거리', () => {
    const flag = flagOf(
      {
        rivals: [
          { name: '예시재활의학과의원', kind: 'rehab', distM: 25, doctors: null, openedYear: null },
          { name: '예시○○정형외과', kind: 'ortho', distM: 8, doctors: 2, openedYear: 2021 },
        ],
      },
      'same-building',
    )
    expect(flag).toMatchObject({
      level: 'red',
      title: '같은 건물에 정형외과가 있어요',
      detail: '예시○○정형외과 · 2021년 문 엶 · 의사 2명 · 8m · 30m 안 2곳',
      law: null,
    })
    expect(flagOf({ rivals: [rival(20, 'pain', '예시통증의원')] }, 'same-building')).toMatchObject({
      title: '같은 건물에 마취통증의학과가 있어요',
      detail: '예시통증의원 · 20m',
    })
  })
})

describe('AC-7911.3 3년 안 30m 안 의원 폐업(closed-here)', () => {
  const close = (on: string, distM = 10) => ({ kind: 'close' as const, name: '예시▣▣의원', dept: '가정의학과', on, distM })

  it('AC-7911.3: 3년 전 오늘(2023-11-22)이면 나오고 그 전날이면 안 나온다', () => {
    expect(ids({ history: [close('2023-11-22')] })).toEqual(['closed-here'])
    expect(ids({ history: [close('2023-11-21')] })).toEqual([])
  })

  it('AC-7911.3: 30m면 나오고 31m면 안 나온다. 개업 줄은 세지 않는다', () => {
    expect(ids({ history: [close('2024-03-15', 30)] })).toEqual(['closed-here'])
    expect(ids({ history: [close('2024-03-15', 31)] })).toEqual([])
    expect(ids({ history: [{ ...close('2024-03-15'), kind: 'open' }] })).toEqual([])
  })

  it('AC-7911.3: 글은 가장 최근 폐업의 해·달·이름·과목·거리', () => {
    const flag = flagOf({ history: [close('2024-03-15', 12), { ...close('2025-01-09', 20), name: '예시◇◇의원', dept: '' }] }, 'closed-here')
    expect(flag).toMatchObject({
      level: 'red',
      title: '이 자리에서 2025년 1월에 의원이 문을 닫았어요',
      detail: '예시◇◇의원 외 1곳 · 20m. 왜 닫았는지 중개사에게 물어봐요.',
      law: null,
    })
    expect(flagOf({ history: [close('2024-03-15', 12)] }, 'closed-here')?.detail).toBe(
      '예시▣▣의원(가정의학과) · 12m. 왜 닫았는지 중개사에게 물어봐요.',
    )
  })
})

describe('AC-7911.3 평당 월세 1.3배(rent-high)', () => {
  // 세 매물 평당 월세 130,000 · 85,000 · 85,000 → 평균 100,000, 후보 = 정확히 1.3배
  const others = [at40(85_000), at40(85_000)]

  it('AC-7911.3: 저장한 매물 평균의 1.3배와 같으면 안 나오고 넘으면 나온다', () => {
    expect(ids({ listing: { ...at40(130_000), premium: null }, listings: [at40(130_000), ...others] })).toEqual([])
    const flag = flagOf({ listing: { ...at40(130_010), premium: null }, listings: [at40(130_010), ...others] }, 'rent-high')
    expect(flag).toMatchObject({
      level: 'red',
      title: '평당 월세가 저장한 매물 평균보다 30% 비싸요',
      detail: '이 매물 130,010원 · 저장한 매물 평균 100,003원',
      law: null,
    })
  })

  it('AC-7911.3: 넓이·월세가 있는 저장 매물이 2개 미만이면 rent-high는 없다', () => {
    const high = { ...at40(900_000), premium: null }
    expect(ids({ listing: high, listings: [at40(900_000)] })).toEqual([])
    expect(ids({ listing: high, listings: [at40(900_000), { areaM2: null, rent: 1_000_000 }, { areaM2: 50, rent: null }] })).toEqual([])
    expect(ids({ listing: high, listings: [at40(900_000), at40(100_000)] })).toEqual(['rent-high'])
  })

  it('AC-7911.3: 후보 매물이 없거나 넓이·월세가 비면 rent-high는 없다', () => {
    expect(ids({ listing: null, listings: [at40(900_000), at40(100_000)] })).toEqual([])
    expect(ids({ listing: { areaM2: null, rent: 9_000_000, premium: null }, listings: [at40(900_000), at40(100_000)] })).toEqual([])
  })
})

describe('AC-7911.3 새 건물 권리금(premium-new)', () => {
  const listing = { ...at40(100_000), premium: 50_000_000 }
  const built = (approvedOn: string | null) => ({ approvedOn, totalM2: 300, elevators: 1 })

  it('AC-7911.3: 사용승인 3년 전 오늘(2023-11-22)이면 나오고 그 전날이면 안 나온다', () => {
    expect(ids({ listing, building: built('2023-11-22') })).toEqual(['premium-new'])
    expect(ids({ listing, building: built('2023-11-21') })).toEqual([])
    expect(ids({ listing, building: built(null) })).toEqual([])
  })

  it('AC-7911.3: 권리금이 0·빈칸이면 안 나온다', () => {
    expect(ids({ listing: { ...listing, premium: 0 }, building: built('2025-06-01') })).toEqual([])
    expect(ids({ listing: { ...listing, premium: null }, building: built('2025-06-01') })).toEqual([])
  })

  it('AC-7911.3: 글은 권리금 돈 글자와 사용승인 해·달', () => {
    expect(flagOf({ listing, building: built('2025-06-01') }, 'premium-new')).toMatchObject({
      level: 'red',
      title: '새 건물인데 권리금 5,000만 원을 달라고 해요',
      detail: '2025년 6월 사용승인한 건물이에요. 깎을 수 있는지 협상표에 적어 둬요.',
      law: null,
    })
    expect(flagOf({ listing: { ...listing, premium: 150_000_000 }, building: built('2025-06-01') }, 'premium-new')?.title).toBe(
      '새 건물인데 권리금 1억 5,000만 원을 달라고 해요',
    )
    expect(flagOf({ listing: { ...listing, premium: 2_345_678 }, building: built('2025-06-01') }, 'premium-new')?.title).toBe(
      '새 건물인데 권리금 2,345,678원을 달라고 해요',
    )
  })
})

describe('AC-7911.3 범위 안 경쟁 의원 5곳(many-rivals)', () => {
  const far = [rival(100), rival(200), rival(300), rival(400)]

  it('AC-7911.3: 범위 안 정형외과·마취통증의학과·재활의학과가 5곳이면 나오고 4곳이면 안 나온다', () => {
    expect(ids({ rivals: [...far, rival(500, 'pain')] })).toEqual(['many-rivals'])
    expect(ids({ rivals: far })).toEqual([])
  })

  it('AC-7911.3: 한의원·범위 밖 의원은 세지 않는다', () => {
    expect(ids({ rivals: [...far, rival(500, 'korean', '예시한의원')] })).toEqual([])
    expect(ids({ radiusM: 700, rivals: [...far, rival(701)] })).toEqual([])
    expect(ids({ radiusM: 700, rivals: [...far, rival(700)] })).toEqual(['many-rivals'])
  })

  it('AC-7911.3: 글은 범위와 과목마다 수', () => {
    expect(flagOf({ radiusM: 1500, rivals: [...far, rival(500, 'pain'), rival(900, 'rehab')] }, 'many-rivals')).toMatchObject({
      level: 'red',
      title: '1.5km 안에 경쟁 의원이 6곳 있어요',
      detail: '정형외과 4곳 · 마취통증의학과 1곳 · 재활의학과 1곳 · 한의원은 빼고 셌어요.',
      law: null,
    })
  })
})

describe('AC-7911.3 60세 이상 15%(few-seniors)', () => {
  it('AC-7911.3: 60세 이상이 15%면 안 나오고 15% 아래면 나온다', () => {
    expect(ids({ people: peopleOf(1000, 150) })).toEqual([])
    expect(ids({ people: peopleOf(1000, 149) })).toEqual(['few-seniors'])
  })

  it('AC-7911.3: 사람 수가 0이거나 나이대가 11칸이 아니면 안 나온다', () => {
    expect(ids({ people: { total: 0, bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] } })).toEqual([])
    expect(ids({ people: { total: 1000, bands: [] } })).toEqual([])
  })

  it('AC-7911.3: 글은 60대 이상 몫(버림)과 범위 안 사람 수', () => {
    expect(flagOf({ radiusM: 500, people: peopleOf(31_400, 3_454) }, 'few-seniors')).toMatchObject({
      level: 'red',
      title: '60대 이상이 11%뿐이에요',
      detail: '500m 안 31,400명 가운데 3,454명이에요. 무릎·허리로 오래 다니는 환자가 적을 수 있어요.',
      law: null,
    })
  })
})

describe('AC-7911.3 역 1,000m(far-station)', () => {
  const station = (distM: number) => ({ name: '예시역', line: '예시선', distM })

  it('AC-7911.3: 가장 가까운 역이 1,000m면 안 나오고 넘으면 나온다', () => {
    expect(ids({ station: station(1000) })).toEqual([])
    expect(ids({ station: station(1001) })).toEqual(['far-station'])
    expect(ids({ station: null })).toEqual([])
  })

  it('AC-7911.3: 글은 시안 모양(km 소수 한 자리 버림 · 걸어서 분, 시속 4km 올림)', () => {
    expect(flagOf({ station: station(1400) }, 'far-station')).toMatchObject({
      level: 'red',
      title: '역까지 1.4km예요 — 걸어서 21분',
      detail: '가장 가까운 역은 예시역(예시선)이에요. 어르신은 차나 버스로 와야 해요.',
      law: null,
    })
    expect(flagOf({ station: station(2099) }, 'far-station')?.title).toBe('역까지 2.0km예요 — 걸어서 32분')
  })
})

describe('AC-7911.3 승강기 없음(barrier)', () => {
  const building = (totalM2: number | null, elevators: number | null) => ({ approvedOn: '2000-01-01', totalM2, elevators })

  it('AC-7911.3: 연면적 500㎡·2층·승강기 0이면 나오고 499.99㎡면 안 나온다', () => {
    expect(ids({ floorLabel: '2층', building: building(500, 0) })).toEqual(['barrier'])
    expect(ids({ floorLabel: '2층', building: building(499.99, 0) })).toEqual([])
  })

  it('AC-7911.3: 연면적이 작아도 매물 넓이가 500㎡ 이상이면 나온다', () => {
    const listing = { areaM2: 500, rent: null, premium: null }
    expect(ids({ floorLabel: '2층', building: building(300, 0), listing })).toEqual(['barrier'])
    expect(ids({ floorLabel: '2층', building: building(300, 0), listing: { ...listing, areaM2: 499.99 } })).toEqual([])
    expect(ids({ floorLabel: '2층', building: building(null, 0), listing })).toEqual(['barrier'])
  })

  it('AC-7911.3: 1층·지하·층 모름·승강기 있음·승강기 모름·건물 자료 없음이면 안 나온다', () => {
    for (const floorLabel of ['1층', '지1층', 'B1', null]) expect(ids({ floorLabel, building: building(900, 0) }), String(floorLabel)).toEqual([])
    expect(ids({ floorLabel: '3층', building: building(900, 1) })).toEqual([])
    expect(ids({ floorLabel: '3층', building: building(900, null) })).toEqual([])
    expect(ids({ floorLabel: '3층', building: null, listing: { areaM2: 900, rent: null, premium: null } })).toEqual([])
  })

  it('AC-7911.3: 글은 층과 장애인 편의시설 안내, 근거는 장애인등편의법', () => {
    expect(flagOf({ floorLabel: '3층', building: building(820.5, 0) }, 'barrier')).toMatchObject({
      level: 'red',
      title: '3층인데 승강기가 없어요',
      detail: '넓이 500㎡ 이상 의원은 장애인 편의시설(계단 또는 승강기 등)을 갖춰야 해요. 휠체어·보행기 환자가 올라오기 어려워요.',
      law: 'accessibility',
    })
  })
})
