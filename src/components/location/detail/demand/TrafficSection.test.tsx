// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Got } from '@/types/location'
import type { Near, NearReply } from './near'
import { TrafficSection, type TrafficFacts } from './TrafficSection'

// 후보 자세히 › 교통·둘레 시설 묶음(spec location AC-7909.6 · AC-7909.1 · AC-7908.4, 시안 ?s=candidate #sec-traffic)

afterEach(cleanup)

const AT = '2026-11-15'
const ok = <T,>(v: T, src: string): Got<T> => ({ ok: true, v, src, asOf: AT })
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
  station: ok({ name: '예시역', line: '예시1호선', distM: 180 }, 'rail-stations'),
  bus: ok(4, 'bus-stops'),
  flow: ok(FLOW, 'flow-volume'),
  market: ok({ name: '예시시장', distM: 450 }, 'market'),
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
    const { container } = render(<TrafficSection snapshot={facts()} near={NEAR} />)
    const section = container.querySelector('section#sec-traffic')
    expect(section).not.toBeNull()
    expect(within(section as HTMLElement).getByRole('heading', { level: 3 }).textContent).toBe('교통·둘레 시설')
    expect(screen.getByText('범위 1km 안')).toBeTruthy()
  })

  it('AC-7909.1: 줄 차례는 시안 그대로(역 · 정류장 · 사람 흐름 · 시장 · 약국 · 마트 · 큰 병원)', () => {
    const { container } = render(<TrafficSection snapshot={facts()} near={NEAR} />)
    expect([...container.querySelectorAll('dt')].map((dt) => dt.textContent)).toEqual([
      '가장 가까운 역',
      '버스 정류장',
      '사람 흐름',
      '시장',
      '약국',
      '마트',
      '큰 병원',
    ])
  })
})

describe('AC-7909.6: 역(출구 없음) · 정류장', () => {
  it('AC-7909.6: 가장 가까운 역 이름·거리·노선과 출처 줄, 출구 글은 없다', () => {
    render(<TrafficSection snapshot={facts()} near={NEAR} />)
    const el = row('가장 가까운 역')
    expect(el.textContent).toContain('예시역 · 180m · 예시1호선')
    expect(el.textContent).not.toContain('출구')
    expect(within(el).getByRole('link').textContent).toBe('공공데이터포털 전국도시철도역사정보표준데이터 · 기준 2026년 11월 15일')
  })

  it('AC-7909.6: 400m 안 정류장 수', () => {
    render(<TrafficSection snapshot={facts()} near={NEAR} />)
    const el = row('버스 정류장')
    expect(el.textContent).toContain('400m 안 4곳')
    expect(within(el).getByRole('link').getAttribute('href')).toBe('/location?tab=sources#src-bus-stops')
  })

  it('AC-7909.6: 가까운 역이 없으면(none) SOURCES 없음 글', () => {
    render(<TrafficSection snapshot={facts({ station: { ok: false, why: 'none', src: 'rail-stations' } })} near={NEAR} />)
    expect(row('가장 가까운 역').textContent).toContain('가까운 도시철도역이 없어요.')
  })
})

describe('AC-7909.6: 사람 흐름(역·정류장마다 하루 평균 승하차)', () => {
  it('AC-7909.6: 합·자료 달 · 역마다 하루 평균 · 정류장 합 · 교통카드 안내 · 출처 줄', () => {
    render(<TrafficSection snapshot={facts()} near={NEAR} />)
    const el = row('사람 흐름')
    expect(el.textContent).toContain('하루 평균 타고 내린 사람 23,000명 · 2026년 10월 자료')
    expect(el.textContent).toContain(
      '예시역(예시1호선) 180m · 하루 15,200명 · 예시중앙역(예시2호선) 905m · 하루 4,100명 · 정류장 3곳 합계 하루 3,700명',
    )
    expect(el.textContent).toContain('교통카드 찍은 사람 수예요(걷는 사람 수와 달라요) · 현금으로 타거나 내릴 때 카드를 안 찍는 곳은 적게 잡혀요')
    expect(within(el).getByRole('link').textContent).toBe('국토교통부 정류장별 이용량 · 기준 2026년 11월 15일')
  })

  it('AC-7909.6: 범위 안에 역·정류장이 없으면 그 글', () => {
    render(<TrafficSection snapshot={facts({ flow: ok({ ...FLOW, stations: [], stops: [], total: 0 }, 'flow-volume') })} near={NEAR} />)
    expect(row('사람 흐름').textContent).toContain('범위 안에 역이 없어요 · 범위 안에 정류장이 없어요')
  })

  it('AC-7909.6: 자료 없는 지역은 그 칸만 `이 지역은 자료 없음`이고 다른 칸은 그대로다', () => {
    render(<TrafficSection snapshot={facts({ flow: { ok: false, why: 'outside', src: 'flow-volume' } })} near={NEAR} />)
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
    render(<TrafficSection snapshot={facts({ flow: ok({ ...FLOW, stops }, 'flow-volume') })} near={NEAR} />)
    const el = row('사람 흐름')
    expect(el.textContent).toContain('정류장 60곳 합계 하루 6,000명')
    expect(el.textContent).toContain('60곳 넘게 있어요. 가까운 60곳만 셌어요.')
  })
})

describe('AC-7909.6: 시장', () => {
  it('AC-7909.6: 범위 안이면 가장 가까운 시장·거리, 범위 밖이면 `범위 안에 시장이 없어요`', () => {
    const { rerender } = render(<TrafficSection snapshot={facts()} near={NEAR} />)
    expect(row('시장').textContent).toContain('예시시장 · 450m')
    rerender(<TrafficSection snapshot={facts({ market: ok({ name: '예시시장', distM: 1800 }, 'market') })} near={NEAR} />)
    expect(row('시장').textContent).toContain('범위 안에 시장이 없어요')
    expect(within(row('시장')).getByRole('link').getAttribute('href')).toBe('/location?tab=sources#src-market')
  })
})

describe('AC-7909.6 · AC-7908.4: 약국·마트·큰 병원(카카오, 볼 때만)', () => {
  it('AC-7909.6: 약국·마트는 범위 안 수와 가장 가까운 곳, 큰 병원은 범위와 상관없이 가장 가까운 곳', () => {
    render(<TrafficSection snapshot={facts()} near={NEAR} />)
    expect(row('약국').textContent).toContain('3곳 · 가장 가까운 곳 예시약국 40m')
    expect(row('마트').textContent).toContain('1곳 · 가장 가까운 곳 예시대형마트 600m')
    expect(row('큰 병원').textContent).toContain('예시의료원 · 1.2km · 범위와 상관없이 가장 가까운 곳(수술 보낼 곳)')
  })

  it('AC-7908.4: 카카오 줄의 출처 줄은 `열 때마다 새로 불러와요, 저장하지 않아요`(기준 날짜 없음)', () => {
    render(<TrafficSection snapshot={facts()} near={NEAR} />)
    for (const label of ['약국', '마트', '큰 병원']) {
      const link = within(row(label)).getByRole('link')
      expect(link.textContent).toBe(KAKAO_LINE)
      expect(link.getAttribute('href')).toBe('/location?tab=sources#src-kakao-local')
    }
  })

  it('AC-7909.6: 범위 안에 없으면 `범위 안에 약국이 없어요`·`범위 안에 마트가 없어요`, 큰 병원을 못 찾으면 SOURCES 없음 글', () => {
    render(
      <TrafficSection
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
    render(<TrafficSection snapshot={facts()} near={{ ...NEAR, pharmacy: places(many, true) }} />)
    expect(row('약국').textContent).toContain('45곳 · 가장 가까운 곳 예시약국0 20m')
    expect(row('약국').textContent).toContain('45곳 넘게 있어요. 가까운 45곳만 셌어요.')
    expect(row('마트').textContent).not.toContain('넘게 있어요')
  })

  it('AC-7909.6: 한도에 걸렸어도 마지막 곳이 범위 밖이면 범위 안은 다 센 것이라 capped 글이 없다', () => {
    const many = Array.from({ length: 45 }, (_, i): [string, number] => [`예시약국${i}`, 100 + i * 50])
    render(<TrafficSection snapshot={facts()} near={{ ...NEAR, pharmacy: places(many, true) }} />)
    expect(row('약국').textContent).toContain('19곳 · 가장 가까운 곳 예시약국0 100m')
    expect(row('약국').textContent).not.toContain('넘게 있어요')
  })

  it('AC-7908.4: 카카오 값이 아직 오지 않으면 `불러오는 중이에요`, 공공 자료 줄은 그대로', () => {
    render(<TrafficSection snapshot={facts()} near={{}} />)
    for (const label of ['약국', '마트', '큰 병원']) expect(row(label).textContent).toContain('불러오는 중이에요')
    expect(row('가장 가까운 역').textContent).toContain('예시역 · 180m')
  })

  it('AC-7908.4: 카카오 열쇠 없음 · 받지 못함([다시 받기]는 종류만 넘긴다)', () => {
    const onRetryNear = vi.fn()
    render(
      <TrafficSection
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
