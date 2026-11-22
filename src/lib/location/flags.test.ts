import { describe, expect, it } from 'vitest'
import type { FlagFacts } from '@/types/location'
import { FLAG_LAW, FLAG_ORDER, pickFlags, type FlagInput } from './flags'
import { isLawId, isSourceId } from './sources'

// 위험 신호(specs/location design.md 9절, AC-7911.3·AC-7911.4). 오늘은 2026-11-22로 고정, 3년 전 = 2023-11-22.
// 제목·설명 글은 requirements '화면 글 기본값' 그대로다
const TODAY = '2026-11-22'

type FlagRival = NonNullable<FlagFacts['rivals']>[number]

// 40㎡ = 화면 12.1평이라 월세 = 평당 월세 × 12.1 (평당 월세는 10원 단위로 주면 월세가 정수)
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
  bus: 5,
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
  bus: 3,
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
      bus: null,
    }
    expect(pickFlags(none).map((f) => f.id)).toEqual(['violation-check'])
  })
})

describe('AC-7911.3·AC-7911.4 위반 건축물', () => {
  it("AC-7911.3: 있음이면 빨간 깃발, 안 고름·모름이면 '확인 필요', 없음이면 아무것도 없다(글은 화면 글 기본값)", () => {
    expect(flagOf({ violation: 'yes' }, 'violation-yes')).toEqual({
      id: 'violation-yes',
      level: 'red',
      title: '위반 건축물이라고 골랐어요',
      detail: '위반 건축물이면 의원 개설 신고가 막힐 수 있어요. 무엇을 어겼는지, 고칠 수 있는지 계약 전에 구청에 물어봐요.',
      law: 'violation',
      src: null,
    })
    expect(pickFlags({ ...SAFE, violation: null })).toEqual([
      {
        id: 'violation-check',
        level: 'check',
        title: '위반 건축물인지',
        detail: '건축물대장을 떼어 확인하세요. 위반 건축물이면 의원 개설 신고가 막힐 수 있어요. 확인한 뒤 건물 서류에서 골라요(아직 안 고름).',
        law: 'violation',
        src: null,
      },
    ])
    expect(pickFlags({ ...SAFE, violation: 'unknown' }).map((f) => [f.id, f.level, f.detail])).toEqual([
      [
        'violation-check',
        'check',
        '건축물대장을 떼어 확인하세요. 위반 건축물이면 의원 개설 신고가 막힐 수 있어요. 확인한 뒤 건물 서류에서 골라요(지금은 모름).',
      ],
    ])
    expect(ids({ violation: 'no' })).toEqual([])
  })

  it('AC-7911.4: 법 근거 id는 LAW_BASIS id다(위반 건축물 = violation, 엘리베이터 = bf)', () => {
    expect(FLAG_LAW).toEqual({ violation: 'violation', barrier: 'bf' })
    for (const id of Object.values(FLAG_LAW)) expect(isLawId(id), id).toBe(true)
  })

  it('AC-7911.4: 근거는 법 id 또는 출처 id 하나다(위반 건축물·엘리베이터는 법, 나머지는 출처 줄)', () => {
    const byId = Object.fromEntries(pickFlags(ALL).map((f) => [f.id, [f.law, f.src]]))
    expect(byId).toEqual({
      'violation-yes': ['violation', null],
      'same-building': [null, 'hosp-list'],
      'closed-here': [null, 'clinic-license'],
      'rent-high': [null, 'user'],
      'premium-new': [null, 'user'],
      'many-rivals': [null, 'hosp-list'],
      'few-seniors': [null, 'pop-age'],
      'far-station': [null, 'rail-stations'],
      barrier: ['bf', null],
    })
    for (const f of [...pickFlags(ALL), ...pickFlags({ ...ALL, violation: null })]) {
      expect((f.law === null) !== (f.src === null), f.id).toBe(true)
      if (f.law !== null) expect(isLawId(f.law), f.id).toBe(true)
      if (f.src !== null) expect(isSourceId(f.src), f.id).toBe(true)
    }
  })

  it("AC-7911.4: '확인 필요' 수준은 위반 건축물 확인 하나뿐이고 나머지는 빨간 깃발이다", () => {
    const flags = pickFlags({ ...ALL, violation: 'unknown' })
    expect(flags.filter((f) => f.level === 'check').map((f) => f.id)).toEqual(['violation-check'])
    expect(flags.filter((f) => f.id !== 'violation-check').every((f) => f.level === 'red')).toBe(true)
    expect(pickFlags(ALL).every((f) => f.level === 'red')).toBe(true)
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

  it('AC-7911.4: 글은 가장 가까운 의원의 과목·이름·문 연 해·의사 수(모르는 값은 뺌)', () => {
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
      title: '30m 안에 정형외과가 있어요',
      detail: '예시○○정형외과 · 2021년 문 엶 · 의사 2명',
      law: null,
      src: 'hosp-list',
    })
    expect(flagOf({ rivals: [rival(20, 'pain', '예시통증의원')] }, 'same-building')).toMatchObject({
      title: '30m 안에 마취통증의학과가 있어요',
      detail: '예시통증의원',
    })
    expect(
      flagOf({ rivals: [{ name: '예시재활의원', kind: 'rehab', distM: 3, doctors: 1, openedYear: null }] }, 'same-building'),
    ).toMatchObject({ title: '30m 안에 재활의학과가 있어요', detail: '예시재활의원 · 의사 1명' })
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

  it('AC-7911.4: 글은 가장 최근 폐업의 해·달과 후보 층·의원 이름', () => {
    const flag = flagOf({ history: [close('2024-03-15', 12), { ...close('2025-01-09', 20), name: '예시◇◇의원', dept: '' }] }, 'closed-here')
    expect(flag).toMatchObject({
      level: 'red',
      title: '이 자리(1층)에서 2025년 1월에 의원이 문을 닫았어요',
      detail: '예시◇◇의원 · 왜 닫았는지 중개사에게 물어봐요.',
      law: null,
      src: 'clinic-license',
    })
  })

  it("AC-7911.4: 후보 층을 안 적었으면 '이 자리에서'다", () => {
    for (const floorLabel of ['', '  ', null])
      expect(flagOf({ floorLabel, history: [close('2024-03-15', 12)] }, 'closed-here')?.title, String(floorLabel)).toBe(
        '이 자리에서 2024년 3월에 의원이 문을 닫았어요',
      )
    expect(flagOf({ floorLabel: ' 지1층 ', history: [close('2024-03-15', 12)] }, 'closed-here')?.title).toBe(
      '이 자리(지1층)에서 2024년 3월에 의원이 문을 닫았어요',
    )
  })
})

describe('AC-7911.3 평당 월세 1.3배(rent-high)', () => {
  // 세 매물 평당 월세 130,000 · 85,000 · 85,000 → 평균 100,000, 후보 = 정확히 1.3배
  const others = [at40(85_000), at40(85_000)]

  it('AC-7911.3: 저장한 매물 평균의 1.3배와 같으면 안 나오고 넘으면 나온다', () => {
    expect(ids({ listing: { ...at40(130_000), premium: null }, listings: [at40(130_000), ...others] })).toEqual([])
    expect(ids({ listing: { ...at40(130_010), premium: null }, listings: [at40(130_010), ...others] })).toEqual(['rent-high'])
  })

  it('AC-7911.4: 글은 차이 %(버림)·이 매물 평당 값·저장한 매물 수와 평균(돈 글자)', () => {
    const flag = flagOf({ listing: { ...at40(130_010), premium: null }, listings: [at40(130_010), ...others] }, 'rent-high')
    expect(flag).toMatchObject({
      level: 'red',
      title: '월세가 저장한 매물 평균보다 30% 비싸요',
      detail: '이 매물 평당 130,010원 · 저장한 매물 3개 평균 100,003원 · 30% 넘게 비싸면 알려 드려요',
      law: null,
      src: 'user',
    })
    // 평당 값이 만 원으로 나눠떨어지면 '만 원' 글자(wonText)
    expect(
      flagOf({ listing: { ...at40(2_000_000), premium: null }, listings: [at40(2_000_000), at40(1_000_000), at40(1_000_000)] }, 'rent-high')
        ?.detail,
    ).toBe('이 매물 평당 200만 원 · 저장한 매물 3개 평균 1,333,333원 · 30% 넘게 비싸면 알려 드려요')
  })

  it('AC-7911.4: 평당 월세의 평은 화면 평(m2ToPyeong, 0.1평 버림)이다 — 99.17㎡는 30평', () => {
    // 99.17㎡ = 화면 30평 → 3,900,000 ÷ 30 = 130,000 · 다른 둘은 100,000 → 평균 110,000 → 1.3배 안 넘음
    const listing = { areaM2: 99.17, rent: 3_900_000, premium: null }
    const listings = [listing, { areaM2: 99.17, rent: 3_000_000 }, { areaM2: 99.17, rent: 3_000_000 }]
    expect(ids({ listing, listings })).toEqual([])
    const high = { areaM2: 99.17, rent: 4_500_000, premium: null } // 150,000 → 평균 116,666 → 28%
    expect(ids({ listing: high, listings: [high, ...listings.slice(1)] })).toEqual([])
    const higher = { areaM2: 99.17, rent: 4_800_000, premium: null } // 160,000 → 평균 120,000 → 33%
    expect(flagOf({ listing: higher, listings: [higher, ...listings.slice(1)] }, 'rent-high')?.title).toBe(
      '월세가 저장한 매물 평균보다 33% 비싸요',
    )
  })

  it('AC-7911.3: 넓이·월세가 있는 저장 매물이 2개 미만이면 rent-high는 없다', () => {
    const high = { ...at40(900_000), premium: null }
    expect(ids({ listing: high, listings: [at40(900_000)] })).toEqual([])
    expect(ids({ listing: high, listings: [at40(900_000), { areaM2: null, rent: 1_000_000 }, { areaM2: 50, rent: null }] })).toEqual([])
    expect(ids({ listing: high, listings: [at40(900_000), at40(100_000)] })).toEqual(['rent-high'])
  })

  it('AC-7911.3: 후보 매물이 없거나 넓이·월세가 비면 rent-high는 없다(0.1평이 안 되는 넓이도 없음으로 본다)', () => {
    expect(ids({ listing: null, listings: [at40(900_000), at40(100_000)] })).toEqual([])
    expect(ids({ listing: { areaM2: null, rent: 9_000_000, premium: null }, listings: [at40(900_000), at40(100_000)] })).toEqual([])
    const tiny = { areaM2: 0.01, rent: 9_000_000, premium: null }
    expect(ids({ listing: tiny, listings: [tiny, at40(900_000), at40(100_000)] })).toEqual([])
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

  it('AC-7911.4: 글은 권리금 돈 글자(wonText)와 사용승인 해', () => {
    expect(flagOf({ listing, building: built('2025-06-01') }, 'premium-new')).toMatchObject({
      level: 'red',
      title: '새 건물인데 권리금 5,000만 원을 달라고 해요',
      detail: '2025년에 사용승인 난 건물이에요. 깎을 수 있는지 협상표에 적어 둬요.',
      law: null,
      src: 'user',
    })
    expect(flagOf({ listing: { ...listing, premium: 150_000_000 }, building: built('2025-06-01') }, 'premium-new')?.title).toBe(
      '새 건물인데 권리금 1억 5,000만 원을 달라고 해요',
    )
    expect(flagOf({ listing: { ...listing, premium: 2_345_678 }, building: built('2025-06-01') }, 'premium-new')?.title).toBe(
      '새 건물인데 권리금 2,345,678원을 달라고 해요',
    )
    expect(flagOf({ listing: { ...listing, premium: 780_000 }, building: built('2025-06-01') }, 'premium-new')?.title).toBe(
      '새 건물인데 권리금 780,000원을 달라고 해요',
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

  it('AC-7911.4: 글은 경쟁 의원 수와 1곳당 사는 사람(버림), 사는 사람을 모르면 그 부분은 뺀다', () => {
    expect(flagOf({ radiusM: 1500, rivals: [...far, rival(500, 'pain'), rival(900, 'rehab')] }, 'many-rivals')).toMatchObject({
      level: 'red',
      title: '범위 안에 정형외과·통증·재활 의원이 6곳이에요',
      detail: '5곳 이상이면 알려 드려요 · 1곳당 사는 사람 166명',
      law: null,
      src: 'hosp-list',
    })
    expect(flagOf({ people: peopleOf(31_400, 10_000), rivals: [...far, rival(500)] }, 'many-rivals')?.detail).toBe(
      '5곳 이상이면 알려 드려요 · 1곳당 사는 사람 6,280명',
    )
    expect(flagOf({ people: null, rivals: [...far, rival(500)] }, 'many-rivals')?.detail).toBe('5곳 이상이면 알려 드려요')
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

  it('AC-7911.4: 글은 60세 이상 몫(버림 정수 %)과 사는 사람 수(쉼표)', () => {
    expect(flagOf({ radiusM: 500, people: peopleOf(31_400, 3_454) }, 'few-seniors')).toMatchObject({
      level: 'red',
      title: '60세 이상이 11%뿐이에요',
      detail: '사는 사람 31,400명 가운데 3,454명 · 15%보다 적으면 알려 드려요',
      law: null,
      src: 'pop-age',
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

  it('AC-7911.4: 거리 글은 AC-7905.6(distText) 모양이고 설명은 역 이름·400m 안 정류장 수', () => {
    expect(flagOf({ station: station(1400) }, 'far-station')).toMatchObject({
      level: 'red',
      title: '역까지 1.4km예요',
      detail: '가장 가까운 역 예시역 · 400m 안 정류장 5곳 · 1km 넘게 멀면 알려 드려요',
      law: null,
      src: 'rail-stations',
    })
    expect(flagOf({ station: station(2099) }, 'far-station')?.title).toBe('역까지 2km예요')
    expect(flagOf({ station: station(1001), bus: 0 }, 'far-station')?.detail).toBe(
      '가장 가까운 역 예시역 · 400m 안 정류장 0곳 · 1km 넘게 멀면 알려 드려요',
    )
    expect(flagOf({ station: station(1001), bus: null }, 'far-station')?.detail).toBe('가장 가까운 역 예시역 · 1km 넘게 멀면 알려 드려요')
  })
})

describe('AC-7911.3 엘리베이터 없음(barrier)', () => {
  const building = (totalM2: number, elevators: number | null) => ({ approvedOn: '2000-01-01', totalM2, elevators })

  it('AC-7911.3: 연면적 500㎡·2층·엘리베이터 0이면 나오고 499.99㎡면 안 나온다', () => {
    expect(ids({ floorLabel: '2층', building: building(500, 0) })).toEqual(['barrier'])
    expect(ids({ floorLabel: '2층', building: building(499.99, 0) })).toEqual([])
  })

  it('AC-7911.3: 연면적이 작아도 매물 넓이가 500㎡ 이상이면 나온다', () => {
    const listing = { areaM2: 500, rent: null, premium: null }
    expect(ids({ floorLabel: '2층', building: building(300, 0), listing })).toEqual(['barrier'])
    expect(ids({ floorLabel: '2층', building: building(300, 0), listing: { ...listing, areaM2: 499.99 } })).toEqual([])
    expect(ids({ floorLabel: '2층', building: building(0, 0), listing })).toEqual(['barrier'])
  })

  it('AC-7911.3: 후보 층은 2층 이상만 — 층 읽기는 score.ts floorNumber(지상 2층은 2층, 지하·B1은 뺌)', () => {
    expect(ids({ floorLabel: '지상 2층', building: building(900, 0) })).toEqual(['barrier'])
    expect(ids({ floorLabel: '12층', building: building(900, 0) })).toEqual(['barrier'])
    for (const floorLabel of ['1층', '지1층', '지하 3층', 'B2', '옥탑', '', null])
      expect(ids({ floorLabel, building: building(900, 0) }), String(floorLabel)).toEqual([])
  })

  it('AC-7911.3: 엘리베이터 있음·엘리베이터 모름·건물 자료 없음이면 안 나온다', () => {
    expect(ids({ floorLabel: '3층', building: building(900, 1) })).toEqual([])
    expect(ids({ floorLabel: '3층', building: building(900, null) })).toEqual([])
    expect(ids({ floorLabel: '3층', building: null, listing: { areaM2: 900, rent: null, premium: null } })).toEqual([])
  })

  it('AC-7911.4: 글은 화면 글 기본값 그대로, 근거는 장애인등편의법(bf)', () => {
    expect(flagOf({ floorLabel: '3층', building: building(820.5, 0) }, 'barrier')).toEqual({
      id: 'barrier',
      level: 'red',
      title: '2층 이상 자리인데 엘리베이터가 없어요',
      detail: '넓이가 500㎡ 이상인 의원은 계단이나 엘리베이터 같은 장애인 편의시설이 꼭 있어야 해요.',
      law: 'bf',
      src: null,
    })
  })
})
