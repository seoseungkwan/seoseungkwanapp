// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_DEPT_RULE } from '@/lib/location/depts'
import type { HowCtx } from '@/lib/location/method'
import type { DeptId, DeptRule, Got, Rival } from '@/types/location'
import type { Near, NearReply } from './near'
import { TrafficSection, type TrafficFacts } from './TrafficSection'

// 후보 자세히 › 교통·둘레 시설 묶음(spec location AC-7909.6 · AC-7909.1 · AC-7908.4 · AC-7921.6 · AC-7920.2, 시안 ?s=candidate #sec-traffic)

afterEach(cleanup)

const AT = '2026-11-15'
const ok = <T,>(v: T, src: string): Got<T> => ({ ok: true, v, src, asOf: AT })

// 그날 값 의원(안 보기가 아닌 모든 과목). 대표 과목은 부품이 설정(deptRule)으로 센다
const clinic = (name: string, depts: DeptId[], distM: number): Rival => ({
  name,
  depts,
  at: { lat: 37.5, lng: 127 },
  distM,
  sameBuilding: distM <= 30,
  address: '',
  doctors: null,
  openedYear: null,
})
const CLINICS: Rival[] = [
  clinic('예시정형외과의원', ['ortho'], 120), // 경쟁
  clinic('예시신경외과의원', ['ns'], 300), // 경쟁
  clinic('예시통증의학과의원', ['pain', 'im'], 500), // 이름에 든 과목(마취통증) = 경쟁
  clinic('예시내과의원', ['im'], 25), // 둘레로 보기
  clinic('예시튼튼치과의원', ['dental'], 25), // 둘레로 보기
  clinic('예시가정의학과의원', ['fm', 'im'], 640), // 이름에 든 과목(가정의학과) = 둘레로 보기
  clinic('예시피부과의원', ['derm'], 700), // 둘레로 보기
  clinic('예시한의원', ['korean'], 400), // 둘레로 보기지만 한의원은 뺀다
  clinic('예시먼내과의원', ['im'], 1300), // 범위 밖
]
// '이렇게 봤어요' 채울 값(그날 값의 출처별 기준 날짜 · 범위 · 시군구 · 고른 경쟁 과목)
const ctxOf = (dates: Partial<Record<string, string>>, radiusM = 1000): HowCtx => ({
  asOf: (src) => dates[src] ?? null,
  radiusM,
  sggName: '예시구',
  rivalShort: '정형외과·신경외과·마취통증·재활',
})
const CTX = ctxOf({ 'rail-stations': AT, 'bus-stops': AT, 'flow-volume': AT, market: AT, 'hosp-list': AT })
// 채울 값·펼침은 부르는 쪽이 쥔다 · 과목 고르기는 처음 값(경쟁 = 정형외과·신경외과·마취통증·재활)
const BASE: { deptRule: DeptRule; howCtx: HowCtx; howOpen: boolean; onHow: () => void } = {
  deptRule: DEFAULT_DEPT_RULE,
  howCtx: CTX,
  howOpen: false,
  onHow: () => {},
}
const FLOW = {
  ym: '2026-10',
  stations: [
    { name: '예시역', line: '예시1호선', distM: 180, perDay: 15200 },
    { name: '예시중앙역', line: '예시2호선', distM: 905, perDay: 4100 },
  ],
  stops: [
    { name: '예시정류장', distM: 60, perDay: 1500 },
    { name: '예시시장앞', distM: 240, perDay: 1200 },
    { name: '예시학교앞', distM: 980, perDay: 1000 },
  ],
  total: 23000,
  unmatched: 2,
}
const facts = (over: Partial<TrafficFacts> = {}): TrafficFacts => ({
  radiusM: 1000,
  station: ok({ name: '예시역', line: '예시1호선', distM: 180, at: { lat: 37.5016, lng: 127.0016 } }, 'rail-stations'),
  bus: ok(4, 'bus-stops'),
  flow: ok(FLOW, 'flow-volume'),
  market: ok({ name: '예시시장', distM: 450 }, 'market'),
  rivals: ok(CLINICS, 'hosp-list'),
  ...over,
})
const places = (list: [string, number][], capped = false): NearReply => ({
  ok: true,
  value: { places: list.map(([name, distM]) => ({ name, distM })), capped },
  src: 'kakao-local',
  asOf: AT,
})
const NEAR: Near = {
  pharmacy: places([
    ['예시약국', 40],
    ['예시가람약국', 200],
    ['예시한빛약국', 380],
    ['예시큰약국', 1100], // 범위 밖
  ]),
  mart: places([['예시대형마트', 600]]),
  bigHospital: places([
    ['예시의료원', 1200],
    ['예시시립병원', 4800],
  ]),
}
const KAKAO_LINE = '카카오 로컬(주소·장소 찾기) · 열 때마다 새로 불러와요, 저장하지 않아요'

// 줄(시안 .info > div) 하나: 이름(dt)으로 찾는다
const row = (label: string) => {
  const el = screen.getByText(label, { selector: 'dt' }).parentElement
  if (!el) throw new Error(`${label} 줄이 없어요`)
  return el
}

describe('AC-7909.1: 교통·둘레 시설 묶음 자리', () => {
  it('AC-7909.1: 목차가 건너뛰는 닻 sec-traffic · 제목 `교통·둘레 시설` · 곁글 `범위 {거리} 안`', () => {
    const { container } = render(<TrafficSection {...BASE} snapshot={facts()} near={NEAR} />)
    const section = container.querySelector('section#sec-traffic')
    expect(section).not.toBeNull()
    expect(within(section as HTMLElement).getByRole('heading', { level: 3 }).textContent).toBe('교통·둘레 시설')
    expect(screen.getByText('범위 1km 안')).toBeTruthy()
  })

  it('AC-7909.1 · AC-7921.6: 줄 차례는 시안 그대로(역 · 정류장 · 사람 흐름 · 시장 · 약국 · 마트 · 큰 병원 · 다른 과 의원)', () => {
    render(<TrafficSection {...BASE} snapshot={facts()} near={NEAR} />)
    const list = row('가장 가까운 역').closest('dl') as HTMLElement
    expect([...list.querySelectorAll(':scope > div > dt')].map((dt) => dt.textContent)).toEqual([
      '가장 가까운 역',
      '버스 정류장',
      '사람 흐름',
      '시장',
      '약국',
      '마트',
      '큰 병원',
      '다른 과 의원',
    ])
  })
})

describe('AC-7909.6: 역(출구 없음) · 정류장', () => {
  it('AC-7909.6: 가장 가까운 역 이름·거리·노선과 출처 줄, 출구 글은 없다', () => {
    render(<TrafficSection {...BASE} snapshot={facts()} near={NEAR} />)
    const el = row('가장 가까운 역')
    expect(el.textContent).toContain('예시역 · 180m · 예시1호선')
    expect(el.textContent).not.toContain('출구')
    expect(within(el).getByRole('link').textContent).toBe('공공데이터포털 전국도시철도역사정보표준데이터 · 기준 2026년 11월 15일')
  })

  it('AC-7909.6: 400m 안 정류장 수', () => {
    render(<TrafficSection {...BASE} snapshot={facts()} near={NEAR} />)
    const el = row('버스 정류장')
    expect(el.textContent).toContain('400m 안 4곳')
    expect(within(el).getByRole('link').getAttribute('href')).toBe('/location?tab=sources#src-bus-stops')
  })

  it('AC-7909.6: 가까운 역이 없으면(none) SOURCES 없음 글', () => {
    render(<TrafficSection {...BASE} snapshot={facts({ station: { ok: false, why: 'none', src: 'rail-stations' } })} near={NEAR} />)
    expect(row('가장 가까운 역').textContent).toContain('가까운 도시철도역이 없어요.')
  })
})

describe('AC-7909.6: 사람 흐름(역·정류장마다 하루 평균 승하차)', () => {
  it('AC-7909.6: 합·자료 달 · 역마다 하루 평균 · 정류장 합 · 교통카드 안내 · 출처 줄', () => {
    render(<TrafficSection {...BASE} snapshot={facts()} near={NEAR} />)
    const el = row('사람 흐름')
    expect(el.textContent).toContain('하루 평균 타고 내린 사람 23,000명 · 2026년 10월 자료')
    expect(el.textContent).toContain(
      '예시역(예시1호선) 180m · 하루 15,200명 · 예시중앙역(예시2호선) 905m · 하루 4,100명 · 정류장 3곳 합계 하루 3,700명',
    )
    expect(el.textContent).toContain('교통카드 찍은 사람 수예요(걷는 사람 수와 달라요) · 현금으로 타거나 내릴 때 카드를 안 찍는 곳은 적게 잡혀요')
    expect(within(el).getByRole('link').textContent).toBe('국토교통부 정류장별 이용량 · 기준 2026년 11월 15일')
  })

  it('AC-7909.6: 범위 안에 역·정류장이 없으면 그 글', () => {
    render(<TrafficSection {...BASE} snapshot={facts({ flow: ok({ ...FLOW, stations: [], stops: [], total: 0 }, 'flow-volume') })} near={NEAR} />)
    expect(row('사람 흐름').textContent).toContain('범위 안에 역이 없어요 · 범위 안에 정류장이 없어요')
  })

  it('AC-7909.6: 자료 없는 지역은 그 칸만 `이 지역은 자료 없음`이고 다른 칸은 그대로다', () => {
    render(<TrafficSection {...BASE} snapshot={facts({ flow: { ok: false, why: 'outside', src: 'flow-volume' } })} near={NEAR} />)
    const el = row('사람 흐름')
    expect(el.textContent).toContain('이 지역은 자료 없음')
    expect(el.textContent).not.toContain('교통카드')
    expect(row('가장 가까운 역').textContent).toContain('예시역 · 180m')
    expect(row('버스 정류장').textContent).toContain('400m 안 4곳')
    expect(row('약국').textContent).toContain('3곳')
  })

  it('AC-7909.6: 받지 못했으면 옛 값과 `지난 값 · 기준 {날짜}` · [다시 받기]는 칸 이름만 넘긴다', () => {
    const onRetry = vi.fn()
    render(
      <TrafficSection
        {...BASE}
        snapshot={facts({ flow: { ok: false, why: 'failed', src: 'flow-volume', prev: { v: FLOW, asOf: '2026-10-02' } } })}
        near={NEAR}
        onRetry={onRetry}
      />,
    )
    const el = row('사람 흐름')
    expect(el.textContent).toContain('하루 평균 타고 내린 사람 23,000명')
    expect(el.textContent).toContain('지난 값 · 기준 2026년 10월 2일')
    fireEvent.click(within(el).getByRole('button', { name: '다시 받기' }))
    expect(onRetry).toHaveBeenCalledWith('flow')
  })

  it('AC-7909.6: 목록이 60개 한도에 닿으면 capped 글', () => {
    const stops = Array.from({ length: 60 }, (_, i) => ({ name: `예시정류장${i}`, distM: i * 10, perDay: 100 }))
    render(<TrafficSection {...BASE} snapshot={facts({ flow: ok({ ...FLOW, stops }, 'flow-volume') })} near={NEAR} />)
    const el = row('사람 흐름')
    expect(el.textContent).toContain('정류장 60곳 합계 하루 6,000명')
    expect(el.textContent).toContain('60곳 넘게 있어요. 가까운 60곳만 셌어요.')
  })
})

describe('AC-7909.6: 시장', () => {
  it('AC-7909.6: 범위 안이면 가장 가까운 시장·거리, 범위 밖이면 `범위 안에 시장이 없어요`', () => {
    const { rerender } = render(<TrafficSection {...BASE} snapshot={facts()} near={NEAR} />)
    expect(row('시장').textContent).toContain('예시시장 · 450m')
    rerender(<TrafficSection {...BASE} snapshot={facts({ market: ok({ name: '예시시장', distM: 1800 }, 'market') })} near={NEAR} />)
    expect(row('시장').textContent).toContain('범위 안에 시장이 없어요')
    expect(within(row('시장')).getByRole('link').getAttribute('href')).toBe('/location?tab=sources#src-market')
  })
})

describe('AC-7909.6 · AC-7908.4: 약국·마트·큰 병원(카카오, 볼 때만)', () => {
  it('AC-7909.6: 약국·마트는 범위 안 수와 가장 가까운 곳, 큰 병원은 범위와 상관없이 가장 가까운 곳', () => {
    render(<TrafficSection {...BASE} snapshot={facts()} near={NEAR} />)
    expect(row('약국').textContent).toContain('3곳 · 가장 가까운 곳 예시약국 40m')
    expect(row('마트').textContent).toContain('1곳 · 가장 가까운 곳 예시대형마트 600m')
    expect(row('큰 병원').textContent).toContain('예시의료원 · 1.2km · 범위와 상관없이 가장 가까운 곳(수술 보낼 곳)')
  })

  it('AC-7908.4: 카카오 줄의 출처 줄은 `열 때마다 새로 불러와요, 저장하지 않아요`(기준 날짜 없음)', () => {
    render(<TrafficSection {...BASE} snapshot={facts()} near={NEAR} />)
    for (const label of ['약국', '마트', '큰 병원']) {
      const link = within(row(label)).getByRole('link')
      expect(link.textContent).toBe(KAKAO_LINE)
      expect(link.getAttribute('href')).toBe('/location?tab=sources#src-kakao-local')
    }
  })

  it('AC-7909.6: 범위 안에 없으면 `범위 안에 약국이 없어요`·`범위 안에 마트가 없어요`, 큰 병원을 못 찾으면 SOURCES 없음 글', () => {
    render(
      <TrafficSection
        {...BASE}
        snapshot={facts()}
        near={{ pharmacy: places([['예시큰약국', 1100]]), mart: places([]), bigHospital: places([]) }}
      />,
    )
    expect(row('약국').textContent).toContain('범위 안에 약국이 없어요')
    expect(row('마트').textContent).toContain('범위 안에 마트가 없어요')
    expect(row('큰 병원').textContent).toContain('이 범위에서 찾은 곳이 없어요.')
  })

  it('AC-7909.6: 카카오 목록이 한도에 걸리면(capped) `{n}곳 넘게 있어요. 가까운 {n}곳만 셌어요.`', () => {
    const many = Array.from({ length: 45 }, (_, i): [string, number] => [`예시약국${i}`, 20 + i * 10])
    render(<TrafficSection {...BASE} snapshot={facts()} near={{ ...NEAR, pharmacy: places(many, true) }} />)
    expect(row('약국').textContent).toContain('45곳 · 가장 가까운 곳 예시약국0 20m')
    expect(row('약국').textContent).toContain('45곳 넘게 있어요. 가까운 45곳만 셌어요.')
    expect(row('마트').textContent).not.toContain('넘게 있어요')
  })

  it('AC-7909.6: 한도에 걸렸어도 마지막 곳이 범위 밖이면 범위 안은 다 센 것이라 capped 글이 없다', () => {
    const many = Array.from({ length: 45 }, (_, i): [string, number] => [`예시약국${i}`, 100 + i * 50])
    render(<TrafficSection {...BASE} snapshot={facts()} near={{ ...NEAR, pharmacy: places(many, true) }} />)
    expect(row('약국').textContent).toContain('19곳 · 가장 가까운 곳 예시약국0 100m')
    expect(row('약국').textContent).not.toContain('넘게 있어요')
  })

  it('AC-7908.4: 카카오 값이 아직 오지 않으면 `불러오는 중이에요`, 공공 자료 줄은 그대로', () => {
    render(<TrafficSection {...BASE} snapshot={facts()} near={{}} />)
    for (const label of ['약국', '마트', '큰 병원']) expect(row(label).textContent).toContain('불러오는 중이에요')
    expect(row('가장 가까운 역').textContent).toContain('예시역 · 180m')
  })

  it('AC-7908.4: 카카오 열쇠 없음 · 받지 못함([다시 받기]는 종류만 넘긴다)', () => {
    const onRetryNear = vi.fn()
    render(
      <TrafficSection
        {...BASE}
        snapshot={facts()}
        near={{ pharmacy: { ok: false, code: 'no-key', key: 'kakao' }, mart: { ok: false, code: 'failed' }, bigHospital: NEAR.bigHospital }}
        onRetryNear={onRetryNear}
      />,
    )
    expect(row('약국').textContent).toContain('카카오 장소 찾기 열쇠: 열쇠를 넣으면 보여요.')
    expect(within(row('약국')).queryByRole('button')).toBeNull()
    expect(row('마트').textContent).toContain('지금 받지 못했어요.')
    fireEvent.click(within(row('마트')).getByRole('button', { name: '다시 받기' }))
    expect(onRetryNear).toHaveBeenCalledWith('mart')
  })

  it('AC-7908.4: 저장하지 않는다 — 단추·링크를 다 눌러도 콜백에 카카오 장소 이름·거리가 넘어가지 않는다', () => {
    const onRetry = vi.fn()
    const onRetryNear = vi.fn()
    const onOpenSource = vi.fn()
    render(
      <TrafficSection
        {...BASE}
        snapshot={facts({ bus: { ok: false, why: 'failed', src: 'bus-stops' } })}
        near={{ ...NEAR, mart: { ok: false, code: 'failed' } }}
        onRetry={onRetry}
        onRetryNear={onRetryNear}
        onOpenSource={onOpenSource}
      />,
    )
    for (const button of screen.getAllByRole('button')) fireEvent.click(button)
    for (const link of screen.getAllByRole('link')) fireEvent.click(link)
    const passed = JSON.stringify([onRetry.mock.calls, onRetryNear.mock.calls, onOpenSource.mock.calls])
    expect(onRetry).toHaveBeenCalledWith('bus')
    expect(onRetryNear).toHaveBeenCalledWith('mart')
    expect(onOpenSource).toHaveBeenCalledWith('kakao-local')
    for (const kakao of ['예시약국', '예시의료원', '40', '1200']) expect(passed).not.toContain(kakao)
  })
})

describe('AC-7909.6: 시장(진짜 답)', () => {
  it('AC-7909.6: 시장을 받지 못하면 그 줄만 `지금 받지 못했어요.` + [다시 받기](칸 이름), 다른 줄은 그대로', () => {
    const onRetry = vi.fn()
    render(<TrafficSection {...BASE} snapshot={facts({ market: { ok: false, why: 'failed', src: 'market' } })} near={NEAR} onRetry={onRetry} />)
    const el = row('시장')
    expect(el.textContent).toContain('지금 받지 못했어요.')
    fireEvent.click(within(el).getByRole('button', { name: '다시 받기' }))
    expect(onRetry).toHaveBeenCalledWith('market')
    expect(within(el).getByRole('link').getAttribute('href')).toBe('/location?tab=sources#src-market')
    expect(row('가장 가까운 역').textContent).toContain('예시역 · 180m')
  })
})

describe("AC-7921.6: 교통·둘레 시설의 '다른 과 의원' 줄", () => {
  const OTHERS_NOTE = "· 과목마다 수는 위 '둘레 다른 과 의원'에 있어요"

  it("AC-7921.6: `{n}곳 · 과목마다 수는 위 '둘레 다른 과 의원'에 있어요` — n = 범위 안 둘레로 보기 의원(대표 과목으로 셈, 한의원 뺌)", () => {
    render(<TrafficSection {...BASE} snapshot={facts()} near={NEAR} />)
    const el = row('다른 과 의원')
    // 내과(25m) · 치과(25m) · 가정의학과(이름에 든 과목) · 피부과 = 4곳. 경쟁 셋·한의원·범위 밖 내과는 뺌
    expect(el.textContent).toContain(`4곳 ${OTHERS_NOTE}`)
    expect(within(el).getByText('4곳').tagName).toBe('B')
    expect(within(el).getByRole('link').textContent).toBe('건강보험심사평가원 병원정보서비스 · 기준 2026년 11월 15일')
    expect(within(el).getByRole('link').getAttribute('href')).toBe('/location?tab=sources#src-hosp-list')
  })

  it('AC-7921.6: 과목 고르기를 바꾸면 다시 부르지 않고 바로 다시 센다(경쟁으로 넣은 과목·안 보기 과목은 빠짐)', () => {
    const { rerender } = render(<TrafficSection {...BASE} snapshot={facts()} near={NEAR} />)
    expect(row('다른 과 의원').textContent).toContain('4곳')
    // 내과를 경쟁으로, 피부과를 안 보기로 → 치과 · 가정의학과 = 2곳
    const rule: DeptRule = { v: 1, rival: ['im', 'ortho', 'ns', 'pain', 'rehab'], hide: ['derm'] }
    rerender(<TrafficSection {...BASE} deptRule={rule} snapshot={facts()} near={NEAR} />)
    expect(row('다른 과 의원').textContent).toContain(`2곳 ${OTHERS_NOTE}`)
    // 경쟁 = 한의원뿐 → 정형외과·신경외과·통증·내과·치과·가정의학과·피부과 = 7곳(한의원은 어느 쪽이든 이 줄에 들지 않음)
    rerender(<TrafficSection {...BASE} deptRule={{ v: 1, rival: ['korean'], hide: [] }} snapshot={facts()} near={NEAR} />)
    expect(row('다른 과 의원').textContent).toContain(`7곳 ${OTHERS_NOTE}`)
  })

  it('AC-7921.6: 범위 끝(거리 = 범위)까지 세고, 범위를 줄이면 그 안만 센다', () => {
    const { rerender } = render(<TrafficSection {...BASE} snapshot={facts({ radiusM: 700 })} near={NEAR} />)
    expect(row('다른 과 의원').textContent).toContain('4곳') // 피부과 700m는 범위 끝이라 셈
    rerender(<TrafficSection {...BASE} snapshot={facts({ radiusM: 300 })} near={NEAR} />)
    expect(row('다른 과 의원').textContent).toContain(`2곳 ${OTHERS_NOTE}`) // 내과·치과(25m)
  })

  it('AC-7921.6: 범위 안에 다른 과 의원이 없으면 `0곳 · …`', () => {
    render(<TrafficSection {...BASE} snapshot={facts({ rivals: ok([CLINICS[0]!, CLINICS[7]!], 'hosp-list') })} near={NEAR} />)
    expect(row('다른 과 의원').textContent).toContain(`0곳 ${OTHERS_NOTE}`)
  })

  it('AC-7921.6: 의원 목록을 받지 못하면 그 줄만 `지금 받지 못했어요.` + [다시 받기](rivals), 옛 값이 있으면 옛 값으로 센다', () => {
    const onRetry = vi.fn()
    const { rerender } = render(
      <TrafficSection {...BASE} snapshot={facts({ rivals: { ok: false, why: 'failed', src: 'hosp-list' } })} near={NEAR} onRetry={onRetry} />,
    )
    const el = row('다른 과 의원')
    expect(el.textContent).toContain('지금 받지 못했어요.')
    expect(el.textContent).not.toContain('과목마다 수는')
    fireEvent.click(within(el).getByRole('button', { name: '다시 받기' }))
    expect(onRetry).toHaveBeenCalledWith('rivals')
    expect(row('약국').textContent).toContain('3곳')
    rerender(
      <TrafficSection
        {...BASE}
        snapshot={facts({ rivals: { ok: false, why: 'failed', src: 'hosp-list', prev: { v: CLINICS.slice(3, 5), asOf: '2026-10-02' } } })}
        near={NEAR}
        onRetry={onRetry}
      />,
    )
    expect(row('다른 과 의원').textContent).toContain(`2곳 ${OTHERS_NOTE}`)
    expect(row('다른 과 의원').textContent).toContain('지난 값 · 기준 2026년 10월 2일')
  })
})

describe("AC-7920.2: 교통·둘레 시설 '이렇게 봤어요'", () => {
  // 제목 줄(시안 .sh) 바로 다음 조각
  const howOf = (container: HTMLElement) => {
    const how = container.querySelector('section#sec-traffic h3')?.parentElement?.nextElementSibling
    if (!(how instanceof HTMLElement)) throw new Error('제목 줄 아래 조각이 없어요')
    return how
  }
  // 출처마다 기준 날짜를 다르게 둬 [[열쇠]] → 출처 id가 맞는지 본다
  const DATED = ctxOf({ 'rail-stations': '2026-11-09', 'bus-stops': '2026-11-01', 'flow-volume': AT, market: AT, 'hosp-list': AT })

  it('AC-7920.2: 묶음 제목 바로 아래 한 줄 + 회색 칩 `흔히 보는 기준` + [더 보기](닫힘), 줄 목록은 그 아래', () => {
    const { container } = render(<TrafficSection {...BASE} howCtx={DATED} snapshot={facts()} near={NEAR} />)
    const how = howOf(container)
    expect(how.querySelector('p')?.textContent).toContain(
      '이렇게 봤어요 도시철도역 위치(기준 2026년 11월 9일) · 버스정류장 위치 · 정류장별 이용량(기준 2026년 11월 15일) · 카카오맵 · 가장 가까운 역까지 곧은 거리, 400m 안 정류장 수, 범위 안 하루 타고 내린 사람을 셌어요 · 무릎·허리가 아픈 환자는 멀리 걷기 힘들어요',
    )
    expect(within(how).getByText('흔히 보는 기준').getAttribute('data-chip')).toBe('neutral')
    expect(within(how).getByRole('button', { name: '더 보기' }).getAttribute('aria-expanded')).toBe('false')
    expect(how.querySelector('dl')?.hidden).toBe(true)
    expect(how.nextElementSibling?.textContent).toContain('예시역 · 180m')
  })

  it('AC-7920.2: [더 보기]는 onHow만 부르고, howOpen이면 네 줄(출처 기준 날짜 채움)과 [접기]', () => {
    const onHow = vi.fn()
    const { container, rerender } = render(<TrafficSection {...BASE} howCtx={DATED} snapshot={facts()} near={NEAR} onHow={onHow} />)
    fireEvent.click(within(howOf(container)).getByRole('button', { name: '더 보기' }))
    expect(onHow).toHaveBeenCalledTimes(1)
    expect(howOf(container).querySelector('dl')?.hidden).toBe(true) // 제 상태로 펼치지 않는다
    rerender(<TrafficSection {...BASE} howCtx={DATED} snapshot={facts()} near={NEAR} howOpen onHow={onHow} />)
    const how = howOf(container)
    expect(how.querySelector('dl')?.hidden).toBe(false)
    expect(within(how).getByRole('button', { name: '접기' })).toBeTruthy()
    const dd = [...how.querySelectorAll('dd')].map((d) => d.textContent)
    expect(dd[0]).toBe(
      '전국도시철도역사정보표준데이터(기준 2026년 11월 9일) · 국토교통부 전국 버스정류장 위치정보(기준 2026년 11월 1일) · 국토교통부 정류장별 이용량(교통카드, 기준 2026년 11월 15일) · 전국전통시장표준데이터 · 카카오맵(약국·마트·큰 병원, 열 때마다 새로 불러와요)',
    )
    expect(dd[3]).toContain('이선경 외, 가정의학회지 2009')
  })

  it('AC-7920.2: 자료가 없는 지역(사람 흐름 기준 날짜 없음)이면 그 출처 조각만 뺀다', () => {
    const howCtx = ctxOf({ 'rail-stations': AT, 'bus-stops': AT, market: AT, 'hosp-list': AT })
    const { container } = render(
      <TrafficSection
        {...BASE}
        howCtx={howCtx}
        snapshot={facts({ flow: { ok: false, why: 'outside', src: 'flow-volume' } })}
        near={NEAR}
        howOpen
      />,
    )
    const how = howOf(container)
    expect(how.querySelector('p')?.textContent).toContain('도시철도역 위치(기준 2026년 11월 15일) · 버스정류장 위치 · 정류장별 이용량 · 카카오맵')
    expect(how.querySelector('dd')?.textContent).toContain('국토교통부 정류장별 이용량(교통카드) · 전국전통시장표준데이터')
  })

  it('AC-7920.2 · AC-7909.1: 범위를 바꿔 다시 그려도 펼친 것은 그대로, 닻 id는 묶음이 한 번만 그린다', () => {
    const { container, rerender } = render(<TrafficSection {...BASE} snapshot={facts()} near={NEAR} howOpen />)
    rerender(<TrafficSection {...BASE} howCtx={ctxOf({ 'rail-stations': AT }, 500)} snapshot={facts({ radiusM: 500 })} near={NEAR} howOpen />)
    expect(howOf(container).querySelector('dl')?.hidden).toBe(false)
    expect(screen.getByText('범위 500m 안')).toBeTruthy()
    expect([...container.querySelectorAll('[id]')].map((el) => el.id).filter((id) => id.startsWith('sec-'))).toEqual(['sec-traffic'])
  })
})
