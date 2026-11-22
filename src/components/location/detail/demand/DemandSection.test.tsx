// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HowCtx } from '@/lib/location/method'
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

// '이렇게 봤어요' 채울 값·펼침은 부르는 쪽이 쥔다(그날 값의 출처별 기준 날짜 · 범위 · 시군구 · 고른 경쟁 과목)
const ctxOf = (dates: Partial<Record<string, string>>, radiusM = 1000): HowCtx => ({
  asOf: (src) => dates[src] ?? null,
  radiusM,
  sggName: '예시구',
  rivalShort: '정형외과·신경외과·마취통증·재활',
})
const CTX = ctxOf({ 'pop-age': AT, senior: AT, gym: AT, accident: AT, industry: AT })
const HOW = { howCtx: CTX, howOpen: false, onHow: () => {} }

// 칸(시안 .kbox) 하나: 이름 글자로 찾는다
const box = (label: string) => {
  const el = screen.getByText(label, { selector: 'p' }).parentElement
  if (!el) throw new Error(`${label} 칸이 없어요`)
  return el
}

// 묶음 제목 줄(시안 .sh) 바로 다음 조각 = '이렇게 봤어요'
const howOf = (container: HTMLElement) => {
  const head = container.querySelector('section#sec-demand h3')?.parentElement
  const how = head?.nextElementSibling
  if (!(how instanceof HTMLElement)) throw new Error('제목 줄 아래 조각이 없어요')
  return how
}

describe('AC-7909.1: 정형외과 수요 묶음 자리', () => {
  it('AC-7909.1: 목차가 건너뛰는 닻 sec-demand · 제목 `정형외과 수요` · 곁글 `범위 {거리} 안`', () => {
    const { container } = render(<DemandSection {...HOW} snapshot={facts()} bands={FORTY_UP} near={{ industryPark: park }} />)
    const section = container.querySelector('section#sec-demand')
    expect(section).not.toBeNull()
    expect(within(section as HTMLElement).getByRole('heading', { level: 3 }).textContent).toBe('정형외과 수요')
    expect(screen.getByText('범위 1km 안')).toBeTruthy()
  })

  it('AC-7909.1: 범위가 1km 아래면 m로(살필 범위 300m)', () => {
    render(<DemandSection {...HOW} snapshot={facts({ radiusM: 300 })} bands={FORTY_UP} near={{ industryPark: park }} />)
    expect(screen.getByText('범위 300m 안')).toBeTruthy()
  })
})

describe('AC-7909.6: 고른 나이대 인구·1km²당 밀도', () => {
  it('AC-7909.6: 처음 설정(40세 이상)이면 `40세 이상` 인구와 사는 사람 대비 %, 밀도와 범위 넓이', () => {
    render(<DemandSection {...HOW} snapshot={facts()} bands={FORTY_UP} near={{ industryPark: park }} />)
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
    const { rerender } = render(<DemandSection {...HOW} snapshot={facts()} bands={[6, 7, 8, 9, 10]} near={{ industryPark: park }} />)
    expect(box('60세 이상').textContent).toContain('3,500명')
    expect(box('60세 이상').textContent).toContain('사는 사람의 31%')
    expect(box('1km²당 밀도(60세 이상)').textContent).toContain('1,114명') // 3,500 ÷ 3.1415…
    rerender(<DemandSection {...HOW} snapshot={facts()} bands={[0, 1, 6, 7, 8, 9, 10]} near={{ industryPark: park }} />)
    expect(box('0~19세 · 60세 이상').textContent).toContain('5,600명')
  })

  it('AC-7909.6: 하루 환자 수 어림은 없다(예상 환자·하루 몇 명 글 없음)', () => {
    const { container } = render(<DemandSection {...HOW} snapshot={facts()} bands={FORTY_UP} near={{ industryPark: park }} />)
    // 숫자 칸만 본다('이렇게 봤어요' 근거 글의 '환자 수를 이은 연구는 찾지 못해'는 승인 글)
    const how = howOf(container)
    const text = [...(container.querySelector('section#sec-demand')?.children ?? [])]
      .filter((el) => el !== how)
      .map((el) => el.textContent)
      .join(' ')
    expect(text).toContain('6,400명')
    expect(text).not.toMatch(/예상|환자 수|하루 [\d,]+명|어림/)
  })

  it('AC-7909.6: 사는 사람을 못 받으면 두 칸 모두 그 칸 글(design.md 15절), 다른 칸은 그대로', () => {
    render(
      <DemandSection {...HOW} snapshot={facts({ people: { ok: false, why: 'not-applied', src: 'pop-age' } })} bands={FORTY_UP} near={{ industryPark: park }} />,
    )
    const applied = "공공데이터포털에서 '행정동별(통반단위) 성/연령별 주민등록 인구수' 활용신청을 하면 보여요."
    expect(box('40세 이상').textContent).toContain(applied)
    expect(box('1km²당 밀도(40세 이상)').textContent).toContain(applied)
    expect(box('경로당').textContent).toContain('12곳')
  })
})

describe('AC-7909.6: 경로당·체력단련장·교통사고 다발·학교(공공 자료)', () => {
  it('AC-7909.6: 값·곁글·출처 줄(기준 날짜)', () => {
    render(<DemandSection {...HOW} snapshot={facts()} bands={FORTY_UP} near={{ industryPark: park }} />)
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
    render(<DemandSection {...HOW} snapshot={facts({ accidents: ok({ spots: 0, cases: 0 }, 'accident') })} bands={FORTY_UP} near={{}} />)
    expect(box('교통사고 다발 지점').textContent).toContain('범위 안에 다발 지점이 없어요')
  })

  it('AC-7909.6: 받지 못한 칸만 `지금 받지 못했어요.` + [다시 받기](그 칸 이름으로 부름), 옛 값이 있으면 `지난 값 · 기준 {날짜}`', () => {
    const onRetry = vi.fn()
    render(
      <DemandSection
        {...HOW}
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
    render(<DemandSection {...HOW} snapshot={facts({ schools: { ok: false, why: 'none', src: 'school' } })} bands={FORTY_UP} near={{}} />)
    expect(box('학교').textContent).toContain('범위 안에 초·중·고가 없어요.')
  })

  it('AC-7909.6: 경로당·학교·교통사고 다발이 진짜 답에서 실패로 와도(시도 이름 없이 부름) 그 칸만 `지금 받지 못했어요.` + [다시 받기]', () => {
    const onRetry = vi.fn()
    render(
      <DemandSection
        {...HOW}
        snapshot={facts({
          seniors: { ok: false, why: 'failed', src: 'senior' },
          schools: { ok: false, why: 'failed', src: 'school' },
          accidents: { ok: false, why: 'failed', src: 'accident' },
        })}
        bands={FORTY_UP}
        near={{ industryPark: park }}
        onRetry={onRetry}
      />,
    )
    for (const [label, key] of [
      ['경로당', 'seniors'],
      ['학교', 'schools'],
      ['교통사고 다발 지점', 'accidents'],
    ] as const) {
      const el = box(label)
      expect(el.textContent).toContain('지금 받지 못했어요.')
      fireEvent.click(within(el).getByRole('button', { name: '다시 받기' }))
      expect(onRetry).toHaveBeenLastCalledWith(key)
    }
    expect(within(box('학교')).getByRole('link').getAttribute('href')).toBe('/location?tab=sources#src-school')
    expect(box('체력단련장').textContent).toContain('7곳')
    expect(box('40세 이상').textContent).toContain('6,400명')
  })
})

describe("AC-7920.2: 정형외과 수요 '이렇게 봤어요'", () => {
  const LINE =
    '이렇게 봤어요 주민등록 인구(40세 이상) · 경로당·체력단련장·학교·교통사고 다발 지점·산업단지 · 범위 안에 있는 곳의 수를 세고, 40세 이상은 1km²당으로 나눴어요 · 나이 든 사람·다친 사람이 많을수록 정형외과에 올 사람이 많아요'

  it('AC-7920.2: 묶음 제목 바로 아래 한 줄 + 회색 칩 `흔히 보는 기준` + [더 보기](닫힘), 숫자 칸은 그 아래', () => {
    const { container } = render(<DemandSection {...HOW} snapshot={facts()} bands={FORTY_UP} near={{ industryPark: park }} />)
    const how = howOf(container)
    expect(how.querySelector('p')?.textContent).toContain(LINE)
    const chip = within(how).getByText('흔히 보는 기준')
    expect(chip.getAttribute('data-chip')).toBe('neutral')
    const button = within(how).getByRole('button', { name: '더 보기' })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(how.querySelector('dl')?.hidden).toBe(true)
    expect(how.nextElementSibling?.textContent).toContain('6,400명')
  })

  it('AC-7920.2: 펼침은 부르는 쪽이 쥔다 — [더 보기]는 onHow만 부르고, howOpen이면 네 줄과 [접기]', () => {
    const onHow = vi.fn()
    const { container, rerender } = render(
      <DemandSection snapshot={facts()} bands={FORTY_UP} near={{ industryPark: park }} howCtx={CTX} howOpen={false} onHow={onHow} />,
    )
    fireEvent.click(within(howOf(container)).getByRole('button', { name: '더 보기' }))
    expect(onHow).toHaveBeenCalledTimes(1)
    expect(howOf(container).querySelector('dl')?.hidden).toBe(true) // 제 상태로 펼치지 않는다
    rerender(<DemandSection snapshot={facts()} bands={FORTY_UP} near={{ industryPark: park }} howCtx={CTX} howOpen onHow={onHow} />)
    const how = howOf(container)
    expect(how.querySelector('dl')?.hidden).toBe(false)
    expect(within(how).getByRole('button', { name: '접기' }).getAttribute('aria-expanded')).toBe('true')
    expect([...how.querySelectorAll('dt')].map((dt) => dt.textContent)).toEqual(['무엇을 봤나', '어떻게 셌나', '왜 중요한가', '근거'])
    const dd = [...how.querySelectorAll('dd')].map((d) => d.textContent)
    expect(dd[0]).toBe(
      '행정안전부 주민등록 인구(기준 2026년 11월 15일) · 전국마을회관및경로당표준데이터(기준 2026년 11월 15일) · 행정안전부 체력단련장업(기준 2026년 11월 15일) · 전국초중등학교위치표준데이터 · 전국교통사고다발지역표준데이터(기준 2026년 11월 15일) · 한국산업단지공단 전국산업단지현황통계(기준 2026년 11월 15일)',
    )
    expect(dd[1]).toMatch(/^범위 안에 있는 곳의 수를 세요\. 40세 이상 밀도 = 범위 안 40세 이상 ÷ 범위 넓이\(km²\)예요\./)
    expect(dd[3]).toMatch(/^흔히 보는 기준이에요\./)
  })

  it('AC-7920.2: [[출처]]는 받은 채울 값(howCtx)의 출처별 기준 날짜로 채우고, 기준 날짜가 없는 출처는 그 조각을 뺀다', () => {
    // 경로당은 받지 못해 기준 날짜가 없고, 체력단련장은 옛 값 날짜
    const howCtx = ctxOf({ 'pop-age': AT, gym: '2026-09-01', accident: AT, industry: AT })
    const { container } = render(
      <DemandSection
        snapshot={facts({
          seniors: { ok: false, why: 'failed', src: 'senior' },
          gyms: { ok: false, why: 'failed', src: 'gym', prev: { v: 5, asOf: '2026-09-01' } },
        })}
        bands={FORTY_UP}
        near={{ industryPark: park }}
        howCtx={howCtx}
        howOpen
        onHow={() => {}}
      />,
    )
    const what = howOf(container).querySelector('dd')?.textContent ?? ''
    expect(what).toContain('행정안전부 주민등록 인구(기준 2026년 11월 15일) · 전국마을회관및경로당표준데이터 · 행정안전부 체력단련장업(기준 2026년 9월 1일)')
    expect(what).not.toContain('()')
  })

  it('AC-7920.2 · AC-7909.1: 범위를 바꿔 다시 그려도 펼친 것은 그대로, 닻 id는 묶음이 한 번만 그린다', () => {
    const { container, rerender } = render(
      <DemandSection snapshot={facts()} bands={FORTY_UP} near={{ industryPark: park }} howCtx={CTX} howOpen onHow={() => {}} />,
    )
    rerender(
      <DemandSection
        snapshot={facts({ radiusM: 300 })}
        bands={FORTY_UP}
        near={{ industryPark: park }}
        howCtx={ctxOf({ 'pop-age': AT }, 300)}
        howOpen
        onHow={() => {}}
      />,
    )
    expect(howOf(container).querySelector('dl')?.hidden).toBe(false)
    expect(screen.getByText('범위 300m 안')).toBeTruthy()
    expect([...container.querySelectorAll('[id]')].map((el) => el.id).filter((id) => id.startsWith('sec-'))).toEqual(['sec-demand'])
  })
})

describe('AC-7909.6 · AC-7908.4: 산업단지 — 이름·위치는 카카오(볼 때만), 고용 인원은 시군구 합', () => {
  it('AC-7909.6: 가장 가까운 단지 이름·거리, 범위 밖이면 `범위 밖`, 고용 인원은 시군구 합이라고 적는다', () => {
    render(<DemandSection {...HOW} snapshot={facts()} bands={FORTY_UP} near={{ industryPark: park }} />)
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
    render(<DemandSection {...HOW} snapshot={facts()} bands={FORTY_UP} near={{ industryPark: near }} />)
    expect(box('산업단지').textContent).toContain('가장 가까운 곳 예시일반산업단지 · 800m')
    expect(box('산업단지').textContent).not.toContain('범위 밖')
  })

  it('AC-7908.4: 카카오 값이 아직 오지 않으면 `불러오는 중이에요`, 고용 인원은 그대로', () => {
    render(<DemandSection {...HOW} snapshot={facts()} bands={FORTY_UP} near={{}} />)
    const el = box('산업단지')
    expect(el.textContent).toContain('불러오는 중이에요')
    expect(el.textContent).toContain('일하는 사람 15,230명(예시구 산업단지 2곳 합)')
  })

  it('AC-7908.4: 카카오 열쇠 없음 · 받지 못함([다시 받기]는 종류만 넘긴다) · 찾은 곳 없음', () => {
    const onRetryNear = vi.fn()
    const { rerender } = render(
      <DemandSection {...HOW} snapshot={facts()} bands={FORTY_UP} near={{ industryPark: { ok: false, code: 'no-key', key: 'kakao' } }} />,
    )
    expect(box('산업단지').textContent).toContain('카카오 장소 찾기 열쇠: 열쇠를 넣으면 보여요.')
    rerender(
      <DemandSection
        {...HOW}
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
        {...HOW}
        snapshot={facts()}
        bands={FORTY_UP}
        near={{ industryPark: { ok: true, value: { places: [], capped: false }, src: 'kakao-local', asOf: AT } }}
      />,
    )
    expect(box('산업단지').textContent).toContain('이 범위에서 찾은 곳이 없어요.')
  })

  it('AC-7909.6: 고용 자료가 없으면 그 글만 SOURCES 없음 글', () => {
    render(
      <DemandSection {...HOW} snapshot={facts({ industry: { ok: false, why: 'none', src: 'industry' } })} bands={FORTY_UP} near={{ industryPark: park }} />,
    )
    const el = box('산업단지')
    expect(el.textContent).toContain('가장 가까운 곳 예시일반산업단지 · 2.4km')
    expect(el.textContent).toContain('이 시·군·구에는 산업단지 고용 자료가 없어요.')
  })
})
