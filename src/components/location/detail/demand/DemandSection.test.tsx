// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Got } from '@/types/location'
import { DemandSection, type DemandFacts } from './DemandSection'
import type { NearReply } from './near'

// 후보 자세히 › 정형외과 수요 묶음(spec location AC-7909.6 · AC-7909.1 · AC-7908.4, 시안 ?s=candidate #sec-demand)

afterEach(cleanup)

const AT = '2026-11-15'
const ok = <T,>(v: T, src: string): Got<T> => ({ ok: true, v, src, asOf: AT })
const BANDS = [1000, 1100, 1200, 1300, 1400, 1500, 1600, 1000, 600, 200, 100] // 합 11,000 · 40세 이상 6,400 · 60세 이상 3,500
const FORTY_UP = [4, 5, 6, 7, 8, 9, 10]

const facts = (over: Partial<DemandFacts> = {}): DemandFacts => ({
  radiusM: 1000,
  people: ok({ total: 11000, bands: BANDS, households: 5000, unmatched: 0 }, 'pop-age'),
  seniors: ok(12, 'senior'),
  gyms: ok(7, 'gym'),
  accidents: ok({ spots: 2, cases: 31 }, 'accident'),
  industry: ok({ sggName: '예시구', employees: 15230, parks: 2, quarter: '2025-2' }, 'industry'),
  schools: ok(6, 'school'),
  ...over,
})
const park: NearReply = {
  ok: true,
  value: { places: [{ name: '예시일반산업단지', distM: 2400 }, { name: '예시제2산업단지', distM: 5200 }], capped: false },
  src: 'kakao-local',
  asOf: AT,
}

// 칸(시안 .kbox) 하나: 이름 글자로 찾는다
const box = (label: string) => {
  const el = screen.getByText(label, { selector: 'p' }).parentElement
  if (!el) throw new Error(`${label} 칸이 없어요`)
  return el
}

describe('AC-7909.1: 정형외과 수요 묶음 자리', () => {
  it('AC-7909.1: 목차가 건너뛰는 닻 sec-demand · 제목 `정형외과 수요` · 곁글 `범위 {거리} 안`', () => {
    const { container } = render(<DemandSection snapshot={facts()} bands={FORTY_UP} near={{ industryPark: park }} />)
    const section = container.querySelector('section#sec-demand')
    expect(section).not.toBeNull()
    expect(within(section as HTMLElement).getByRole('heading', { level: 3 }).textContent).toBe('정형외과 수요')
    expect(screen.getByText('범위 1km 안')).toBeTruthy()
  })

  it('AC-7909.1: 범위가 1km 아래면 m로(살필 범위 300m)', () => {
    render(<DemandSection snapshot={facts({ radiusM: 300 })} bands={FORTY_UP} near={{ industryPark: park }} />)
    expect(screen.getByText('범위 300m 안')).toBeTruthy()
  })
})

describe('AC-7909.6: 고른 나이대 인구·1km²당 밀도', () => {
  it('AC-7909.6: 처음 설정(40세 이상)이면 `40세 이상` 인구와 사는 사람 대비 %, 밀도와 범위 넓이', () => {
    render(<DemandSection snapshot={facts()} bands={FORTY_UP} near={{ industryPark: park }} />)
    const people = box('40세 이상')
    expect(people.textContent).toContain('6,400명')
    expect(people.textContent).toContain('사는 사람의 58%')
    expect(within(people).getByRole('link').textContent).toBe(
      '행정안전부 행정동별(통반단위) 성/연령별 주민등록 인구수 · 기준 2026년 11월 15일',
    )
    const density = box('1km²당 밀도(40세 이상)')
    expect(density.textContent).toContain('2,037명')
    expect(density.textContent).toContain('범위 넓이 3.1km²')
  })

  it('AC-7909.6: 점수 설정에서 고른 나이대를 따른다(60세 이상 · 떨어진 나이대)', () => {
    const { rerender } = render(<DemandSection snapshot={facts()} bands={[6, 7, 8, 9, 10]} near={{ industryPark: park }} />)
    expect(box('60세 이상').textContent).toContain('3,500명')
    expect(box('60세 이상').textContent).toContain('사는 사람의 31%')
    expect(box('1km²당 밀도(60세 이상)').textContent).toContain('1,114명') // 3,500 ÷ 3.1415…
    rerender(<DemandSection snapshot={facts()} bands={[0, 1, 6, 7, 8, 9, 10]} near={{ industryPark: park }} />)
    expect(box('0~19세 · 60세 이상').textContent).toContain('5,600명')
  })

  it('AC-7909.6: 하루 환자 수 어림은 없다(예상 환자·하루 몇 명 글 없음)', () => {
    const { container } = render(<DemandSection snapshot={facts()} bands={FORTY_UP} near={{ industryPark: park }} />)
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/예상|환자 수|하루 [\d,]+명|어림/)
  })

  it('AC-7909.6: 사는 사람을 못 받으면 두 칸 모두 그 칸 글(design.md 15절), 다른 칸은 그대로', () => {
    render(
      <DemandSection snapshot={facts({ people: { ok: false, why: 'not-applied', src: 'pop-age' } })} bands={FORTY_UP} near={{ industryPark: park }} />,
    )
    const applied = "공공데이터포털에서 '행정동별(통반단위) 성/연령별 주민등록 인구수' 활용신청을 하면 보여요."
    expect(box('40세 이상').textContent).toContain(applied)
    expect(box('1km²당 밀도(40세 이상)').textContent).toContain(applied)
    expect(box('경로당').textContent).toContain('12곳')
  })
})

describe('AC-7909.6: 경로당·체력단련장·교통사고 다발·학교(공공 자료)', () => {
  it('AC-7909.6: 값·곁글·출처 줄(기준 날짜)', () => {
    render(<DemandSection snapshot={facts()} bands={FORTY_UP} near={{ industryPark: park }} />)
    const seniors = box('경로당')
    expect(seniors.textContent).toContain('12곳')
    expect(seniors.textContent).toContain('어르신이 모이는 곳이에요 · 노인복지관은 전국 목록이 없어 경로당으로 대신해요')
    expect(within(seniors).getByRole('link').textContent).toBe('공공데이터포털 전국마을회관및경로당표준데이터 · 기준 2026년 11월 15일')
    const gyms = box('체력단련장')
    expect(gyms.textContent).toContain('7곳')
    expect(gyms.textContent).toContain('운동하다 다친 사람이 와요 · 필라테스는 빠질 수 있어요')
    expect(within(gyms).getByRole('link').getAttribute('href')).toBe('/location?tab=sources#src-gym')
    const accidents = box('교통사고 다발 지점')
    expect(accidents.textContent).toContain('2곳 · 사고 31건')
    expect(accidents.textContent).toContain('교통사고 환자도 정형외과에 와요')
    const schools = box('학교')
    expect(schools.textContent).toContain('6곳')
    expect(within(schools).getByRole('link').getAttribute('href')).toBe('/location?tab=sources#src-school')
  })

  it('AC-7909.6: 다발 지점이 0곳이면 `범위 안에 다발 지점이 없어요`', () => {
    render(<DemandSection snapshot={facts({ accidents: ok({ spots: 0, cases: 0 }, 'accident') })} bands={FORTY_UP} near={{}} />)
    expect(box('교통사고 다발 지점').textContent).toContain('범위 안에 다발 지점이 없어요')
  })

  it('AC-7909.6: 받지 못한 칸만 `지금 받지 못했어요.` + [다시 받기](그 칸 이름으로 부름), 옛 값이 있으면 `지난 값 · 기준 {날짜}`', () => {
    const onRetry = vi.fn()
    render(
      <DemandSection
        snapshot={facts({
          seniors: { ok: false, why: 'failed', src: 'senior' },
          gyms: { ok: false, why: 'failed', src: 'gym', prev: { v: 5, asOf: '2026-09-01' } },
        })}
        bands={FORTY_UP}
        near={{ industryPark: park }}
        onRetry={onRetry}
      />,
    )
    const seniors = box('경로당')
    expect(seniors.textContent).toContain('지금 받지 못했어요.')
    fireEvent.click(within(seniors).getByRole('button', { name: '다시 받기' }))
    expect(onRetry).toHaveBeenCalledWith('seniors')
    const gyms = box('체력단련장')
    expect(gyms.textContent).toContain('5곳')
    expect(gyms.textContent).toContain('지난 값 · 기준 2026년 9월 1일')
    expect(within(gyms).getByRole('link').textContent).toContain('기준 2026년 9월 1일')
    expect(box('학교').textContent).toContain('6곳')
  })

  it('AC-7909.6: 자료가 비면(none) SOURCES 없음 글', () => {
    render(<DemandSection snapshot={facts({ schools: { ok: false, why: 'none', src: 'school' } })} bands={FORTY_UP} near={{}} />)
    expect(box('학교').textContent).toContain('범위 안에 초·중·고가 없어요.')
  })
})

describe('AC-7909.6 · AC-7908.4: 산업단지 — 이름·위치는 카카오(볼 때만), 고용 인원은 시군구 합', () => {
  it('AC-7909.6: 가장 가까운 단지 이름·거리, 범위 밖이면 `범위 밖`, 고용 인원은 시군구 합이라고 적는다', () => {
    render(<DemandSection snapshot={facts()} bands={FORTY_UP} near={{ industryPark: park }} />)
    const el = box('산업단지')
    expect(el.textContent).toContain('가장 가까운 곳 예시일반산업단지 · 2.4km')
    expect(el.textContent).toContain('범위 밖 · 일하는 사람 15,230명(예시구 산업단지 2곳 합) · 일하다 다친 사람(산재)이 와요')
    const links = within(el).getAllByRole('link').map((a) => a.textContent)
    expect(links).toEqual([
      '카카오 로컬(주소·장소 찾기) · 열 때마다 새로 불러와요, 저장하지 않아요 · 이름·위치',
      '한국산업단지공단 전국산업단지현황통계 · 기준 2026년 11월 15일 · 고용 인원',
    ])
  })

  it('AC-7909.6: 범위 안이면 `범위 밖` 글이 없다', () => {
    const near: NearReply = { ...park, value: { places: [{ name: '예시일반산업단지', distM: 800 }], capped: false } } as NearReply
    render(<DemandSection snapshot={facts()} bands={FORTY_UP} near={{ industryPark: near }} />)
    expect(box('산업단지').textContent).toContain('가장 가까운 곳 예시일반산업단지 · 800m')
    expect(box('산업단지').textContent).not.toContain('범위 밖')
  })

  it('AC-7908.4: 카카오 값이 아직 오지 않으면 `불러오는 중이에요`, 고용 인원은 그대로', () => {
    render(<DemandSection snapshot={facts()} bands={FORTY_UP} near={{}} />)
    const el = box('산업단지')
    expect(el.textContent).toContain('불러오는 중이에요')
    expect(el.textContent).toContain('일하는 사람 15,230명(예시구 산업단지 2곳 합)')
  })

  it('AC-7908.4: 카카오 열쇠 없음 · 받지 못함([다시 받기]는 종류만 넘긴다) · 찾은 곳 없음', () => {
    const onRetryNear = vi.fn()
    const { rerender } = render(
      <DemandSection snapshot={facts()} bands={FORTY_UP} near={{ industryPark: { ok: false, code: 'no-key', key: 'kakao' } }} />,
    )
    expect(box('산업단지').textContent).toContain('카카오 장소 찾기 열쇠: 열쇠를 넣으면 보여요.')
    rerender(
      <DemandSection
        snapshot={facts()}
        bands={FORTY_UP}
        near={{ industryPark: { ok: false, code: 'failed' } }}
        onRetryNear={onRetryNear}
      />,
    )
    expect(box('산업단지').textContent).toContain('지금 받지 못했어요.')
    fireEvent.click(within(box('산업단지')).getByRole('button', { name: '다시 받기' }))
    expect(onRetryNear).toHaveBeenCalledWith('industryPark')
    rerender(
      <DemandSection
        snapshot={facts()}
        bands={FORTY_UP}
        near={{ industryPark: { ok: true, value: { places: [], capped: false }, src: 'kakao-local', asOf: AT } }}
      />,
    )
    expect(box('산업단지').textContent).toContain('이 범위에서 찾은 곳이 없어요.')
  })

  it('AC-7909.6: 고용 자료가 없으면 그 글만 SOURCES 없음 글', () => {
    render(
      <DemandSection snapshot={facts({ industry: { ok: false, why: 'none', src: 'industry' } })} bands={FORTY_UP} near={{ industryPark: park }} />,
    )
    const el = box('산업단지')
    expect(el.textContent).toContain('가장 가까운 곳 예시일반산업단지 · 2.4km')
    expect(el.textContent).toContain('이 시·군·구에는 산업단지 고용 자료가 없어요.')
  })
})
