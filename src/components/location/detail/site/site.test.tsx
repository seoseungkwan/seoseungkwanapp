// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { areaText } from '@/lib/location/area'
import { eumUrl, IROS_URL } from '@/lib/location/links'
import { filledHow, type HowCtx } from '@/lib/location/method'
import type { Snapshot, SourceId } from '@/types/location'
import { FakeLatLng, finishSdk, makeFakeKakao, resetSdk } from '../../map/fakeKakao.test.data'
import { BuildingDocs, LandUse, StreetPhotos, Vacancy } from './index'

// 후보 자세히 — 거리 사진·건물 서류·빈 칸 짐작·땅 쓰임(specs/location REQ-7909 AC-7909.4·AC-7909.5, REQ-7920 AC-7920.2, 시안 ?s=candidate,
// 글은 requirements '화면 글 기본값'). 부품은 props·콜백만 받는다. 지도·로드뷰는 map/ 부품을 가짜 window.kakao로 본다

const KEY = 'fakejskey0000test'
const AT = { lat: 37.501234, lng: 127.034567 }
const PNU = '1168010100107360012'
const TODAY = '2026-11-22'

// '이렇게 봤어요' 채울 값(그 후보 그날 값의 출처별 기준 날짜 · 범위 · 설정) — 부르는 쪽이 넘긴다
const ASOF: Partial<Record<SourceId, string>> = { building: '2026-11-15', stores: '2026-10-31' }
const ctxOf = (asOf: Partial<Record<SourceId, string>> = ASOF, radiusM = 1000): HowCtx => ({
  asOf: (src) => asOf[src] ?? null,
  radiusM,
  sggName: '강남구',
  rivalShort: '정형외과·신경외과·마취통증·재활',
})
const CTX = ctxOf()
/** 펼침은 부르는 쪽이 쥔다 — 시험마다 닫힌 채로 넘김 */
const HOW = { howCtx: CTX, howOpen: false, onHow: () => {} }

type BuildingGot = Snapshot['building']
type StoresGot = Snapshot['stores']
type BuildingV = Extract<BuildingGot, { ok: true }>['v']

const BLD: BuildingV = {
  usage: '제1종근린생활시설',
  structure: '철근콘크리트구조',
  above: 4,
  below: 2,
  totalM2: 3980,
  approvedOn: '2009-05-20',
  elevators: 2,
  parking: 42,
  floors: [
    { label: '지2', usage: '주차장', m2: 380 },
    { label: '지1', usage: '주차장', m2: 380 },
    { label: '1', usage: '소매점', m2: 380 },
    { label: '2', usage: '의원', m2: 412 },
    { label: '3', usage: '의원', m2: 412 },
    { label: '4', usage: '사무소', m2: 412 },
  ],
}
const BUILDING: BuildingGot = { ok: true, v: BLD, src: 'building', asOf: '2026-11-15' }
const STORES: StoresGot = {
  ok: true,
  v: [
    { floor: '1', count: 2 },
    { floor: '2', count: 1 },
    { floor: '층 모름', count: 3 },
  ],
  src: 'stores',
  asOf: '2026-10-31',
}

beforeEach(() => {
  resetSdk()
  vi.stubEnv('NEXT_PUBLIC_KAKAO_MAP_KEY', KEY)
})
afterEach(() => {
  cleanup()
  resetSdk()
  vi.unstubAllEnvs()
})

const pressed = (group: HTMLElement) =>
  within(group)
    .getAllByRole('button')
    .filter((b) => b.getAttribute('aria-pressed') === 'true')
    .map((b) => b.textContent)

describe('AC-7909.5: 거리 사진', () => {
  it('AC-7909.5: 후보 점 50m 안 가장 가까운 로드뷰와 하늘 사진(지도 부품, 하늘 사진 보기)이 보인다', async () => {
    const fake = makeFakeKakao({ pano: 777 })
    render(<StreetPhotos {...HOW} at={AT} markLabel="A" sign={null} onSign={() => {}} />)
    await act(async () => finishSdk(fake))
    expect(screen.getByRole('heading', { name: '거리 사진' })).toBeTruthy()
    // 로드뷰: 50m 안 가장 가까운 사진
    expect(fake.made.panoAsks).toHaveLength(1)
    expect(fake.made.panoAsks[0]!.radius).toBe(50)
    expect(fake.made.panoAsks[0]!.at).toEqual(new FakeLatLng(AT.lat, AT.lng))
    expect(fake.made.roadviews).toHaveLength(1)
    expect(fake.made.roadviews[0]!.pano).toEqual({ id: 777, at: new FakeLatLng(AT.lat, AT.lng) })
    // 하늘 사진: 후보 점 가운데, 하늘 사진 보기, 후보 표시
    expect(fake.made.maps).toHaveLength(1)
    expect(fake.made.maps[0]!.center).toEqual(new FakeLatLng(AT.lat, AT.lng))
    expect(fake.made.maps[0]!.typeId).toBe(fake.maps.MapTypeId.HYBRID)
    const marks = fake.live(fake.made.overlays).map((o) => o.options.content)
    expect(marks.map((m) => [m.dataset.kind, m.textContent])).toEqual([['candidate', 'A']])
    expect(screen.getByRole('group', { name: '하늘 사진' })).toBeTruthy()
    expect(screen.getByRole('group', { name: '로드뷰' })).toBeTruthy()
    // 출처 줄(카카오 지도 — 볼 때마다 새로 받아 날짜 없음)
    expect(screen.getByRole('link', { name: '카카오 지도(하늘 사진·로드뷰)' }).getAttribute('href')).toBe('/location?tab=sources#src-kakao-map')
  })

  it('AC-7909.5: 간판 보임 고르기 셋(보여요·가려요·모르겠어요) — 저장된 값이 눌려 있다', () => {
    const { rerender } = render(<StreetPhotos {...HOW} at={AT} sign={null} onSign={() => {}} />)
    expect(screen.getByText('길에서 간판 자리가 보이나요?')).toBeTruthy()
    expect(screen.getByText('로드뷰나 보러 가서 직접 골라요')).toBeTruthy()
    const group = screen.getByRole('group', { name: '간판 보임' })
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['보여요', '가려요', '모르겠어요'])
    expect(pressed(group)).toEqual([])
    rerender(<StreetPhotos {...HOW} at={AT} sign="no" onSign={() => {}} />)
    expect(pressed(screen.getByRole('group', { name: '간판 보임' }))).toEqual(['가려요'])
    rerender(<StreetPhotos {...HOW} at={AT} sign="unknown" onSign={() => {}} />)
    expect(pressed(screen.getByRole('group', { name: '간판 보임' }))).toEqual(['모르겠어요'])
  })

  it('AC-7909.5: 고르면 저장 콜백에 yes·no·unknown을 넘기고, 이미 고른 값을 다시 누르면 부르지 않는다', () => {
    const onSign = vi.fn()
    render(<StreetPhotos {...HOW} at={AT} sign="yes" onSign={onSign} />)
    const group = screen.getByRole('group', { name: '간판 보임' })
    fireEvent.click(within(group).getByRole('button', { name: '가려요' }))
    fireEvent.click(within(group).getByRole('button', { name: '모르겠어요' }))
    fireEvent.click(within(group).getByRole('button', { name: '보여요' }))
    expect(onSign.mock.calls).toEqual([['no'], ['unknown']])
  })

  it('AC-7909.5: 지도 열쇠가 없으면 사진 자리에 안내 글이고 간판 고르기는 그대로다', () => {
    vi.stubEnv('NEXT_PUBLIC_KAKAO_MAP_KEY', '')
    render(<StreetPhotos {...HOW} at={AT} sign={null} onSign={() => {}} />)
    expect(screen.getAllByText('카카오 지도 열쇠를 넣으면 지도가 보여요. 숫자는 지도 없이도 볼 수 있어요.')).toHaveLength(2)
    expect(screen.getByRole('group', { name: '간판 보임' })).toBeTruthy()
  })
})

describe('AC-7909.4: 건물 서류', () => {
  const docs = (over: Partial<Parameters<typeof BuildingDocs>[0]> = {}) => (
    <BuildingDocs {...HOW} building={BUILDING} floorLabel="3층" areaM2={171.9} today={TODAY} violation={null} onViolation={() => {}} {...over} />
  )

  // 이름·값 줄(dt → dd)
  const infoRows = () => screen.getAllByRole('term').map((dt) => [dt.textContent, dt.nextElementSibling?.textContent])
  const valueOf = (name: string) => screen.getAllByRole('term').find((dt) => dt.textContent === name)!.nextElementSibling as HTMLElement

  it('AC-7909.4: 건축물대장 표제 — 지은 해·구조·층수·연면적(평과 ㎡)·엘리베이터·주차·용도와 출처 줄', () => {
    render(docs())
    expect(screen.getByRole('heading', { name: '건물 서류' })).toBeTruthy()
    expect(infoRows().slice(0, 6)).toEqual([
      ['지은 해', '2009년 · 17년 됐어요'],
      ['구조 · 층수', '철근콘크리트구조 · 지하 2층 · 지상 4층'],
      ['연면적', areaText(3980)],
      ['엘리베이터', '2대'],
      ['주차', '42대'],
      ['용도', '제1종근린생활시설법 근거'],
    ])
    expect(screen.getByRole('link', { name: '국토교통부 건축물대장정보 서비스 · 기준 2026년 11월 15일' })).toBeTruthy()
    // 용도의 법 근거(건축법 시행령 별표 1)
    expect(within(valueOf('용도')).getByRole('link', { name: '법 근거' }).getAttribute('href')).toBe('/location?tab=sources#law-use')
  })

  it('AC-7909.4: 모르는 값은 –, 사용승인일이 없으면 지은 해도 –', () => {
    render(docs({ building: { ...BUILDING, v: { ...BLD, approvedOn: null, elevators: null, parking: null, structure: '', below: 0, totalM2: 0 } } }))
    expect(infoRows().slice(0, 5)).toEqual([
      ['지은 해', '–'],
      ['구조 · 층수', '지상 4층'],
      ['연면적', '–'],
      ['엘리베이터', '–'],
      ['주차', '–'],
    ])
  })

  it('AC-7909.4: 층별 — 위층부터 층·용도·넓이, 후보 층에 이 자리 표시와 전용 넓이 글', () => {
    render(docs())
    const table = screen.getByRole('table', { name: '층별 개요' })
    const body = within(table).getAllByRole('row').slice(1)
    expect(body.map((r) => within(r).getAllByRole('cell').map((c) => c.textContent))).toEqual([
      ['4층', '사무소', areaText(412)],
      ['3층이 자리', '의원', areaText(412)],
      ['2층', '의원', areaText(412)],
      ['1층', '소매점', areaText(380)],
      ['지하 1층', '주차장', areaText(380)],
      ['지하 2층', '주차장', areaText(380)],
    ])
    expect(screen.getByText(`이 자리는 3층 가운데 전용 ${areaText(171.9)}이에요.`)).toBeTruthy()
  })

  it('AC-7909.4: 후보 층을 안 적었으면 이 자리 표시·전용 넓이 글이 없다', () => {
    render(docs({ floorLabel: '', areaM2: null }))
    expect(screen.queryByText('이 자리')).toBeNull()
    expect(screen.queryByText(/가운데 전용/)).toBeNull()
  })

  it('AC-7909.4: 건축물대장을 못 받으면 그 칸만 자료 없음 글·[다시 받기], 위반 건축물 칸은 그대로', () => {
    const onRetry = vi.fn()
    render(docs({ building: { ok: false, why: 'failed', src: 'building' }, onRetry }))
    expect(screen.queryByRole('table', { name: '층별 개요' })).toBeNull()
    expect(screen.getByText('지금 받지 못했어요.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '다시 받기' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('group', { name: '위반 건축물' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '인터넷등기소 바로 가기' })).toBeTruthy()
  })

  it('AC-7909.4: 이 지번에 건축물대장이 없으면 SOURCES 없음 글', () => {
    render(docs({ building: { ok: false, why: 'none', src: 'building' } }))
    expect(screen.getByText('이 지번에 건축물대장이 없어요.')).toBeTruthy()
  })

  it('AC-7909.4: 받다가 실패했지만 지난 값이 있으면 지난 값과 `지난 값 · 기준 {날짜}`', () => {
    render(docs({ building: { ok: false, why: 'failed', src: 'building', prev: { v: BLD, asOf: '2026-10-01' } } }))
    expect(screen.getByRole('table', { name: '층별 개요' })).toBeTruthy()
    expect(screen.getByText('지난 값 · 기준 2026년 10월 1일')).toBeTruthy()
    expect(screen.getByRole('link', { name: '국토교통부 건축물대장정보 서비스 · 기준 2026년 10월 1일' })).toBeTruthy()
  })

  it('AC-7909.4: 인터넷등기소 링크 — 첫 화면을 새 창(noopener noreferrer)으로, 안내 글', () => {
    render(docs())
    const link = screen.getByRole('link', { name: '인터넷등기소 바로 가기' })
    expect(link.getAttribute('href')).toBe(IROS_URL)
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(
      screen.getByText(
        '인터넷등기소 첫 화면이 새 창으로 열려요(주소는 거기서 직접 넣어요). 이 앱은 등기부를 받아 오지 않고 링크만 걸어요. 첫 화면에서 보안 프로그램을 깔라고 할 수 있어요.',
      ),
    ).toBeTruthy()
  })

  it("AC-7909.4: 위반 건축물 칸 — 곁글, [있음]·[없음]·[모름], 고른 값마다 아래 글 + 늘 '개설 신고가 막힐 수 있어요' + 법 근거", () => {
    const { rerender } = render(docs())
    expect(screen.getByText('위반 건축물인가요?')).toBeTruthy()
    expect(screen.getByText('건축물대장을 떼어 확인하세요 · 공개 자료가 없어 직접 골라요')).toBeTruthy()
    const group = () => screen.getByRole('group', { name: '위반 건축물' })
    expect(within(group()).getAllByRole('button').map((b) => b.textContent)).toEqual(['있음', '없음', '모름'])
    const help = () => screen.getByTestId('violation-help').textContent
    const ALWAYS = '위반 건축물이면 의원 개설 신고가 막힐 수 있어요.'
    expect(pressed(group())).toEqual([])
    expect(help()).toBe(`아직 안 골랐어요 — 위험 신호에 '확인 필요'로 떠요. ${ALWAYS} 법 근거`)
    rerender(docs({ violation: 'unknown' }))
    expect(pressed(group())).toEqual(['모름'])
    expect(help()).toBe(`'모름'이면 위험 신호에 '확인 필요'로 떠요. ${ALWAYS} 법 근거`)
    rerender(docs({ violation: 'yes' }))
    expect(pressed(group())).toEqual(['있음'])
    expect(help()).toBe(`'있음'이면 위험 신호에 빨간 깃발로 떠요. ${ALWAYS} 법 근거`)
    rerender(docs({ violation: 'no' }))
    expect(pressed(group())).toEqual(['없음'])
    expect(help()).toBe(`${ALWAYS} 법 근거`)
    const law = within(screen.getByTestId('violation-help')).getByRole('link', { name: '법 근거' })
    expect(law.getAttribute('href')).toBe('/location?tab=sources#law-violation')
  })

  it('AC-7906.2: 건물 서류의 법 근거 링크는 밑줄이 없고(시안) 마우스를 올리면 밑줄', () => {
    render(docs())
    const links = screen.getAllByRole('link', { name: '법 근거' })
    expect(links.length).toBeGreaterThan(0)
    for (const a of links) {
      const classes = a.className.split(/\s+/)
      expect(classes).toContain('no-underline')
      expect(classes).toContain('hover:underline')
    }
  })

  it('AC-7909.4: 위반 건축물을 고르면 저장 콜백(yes·no·unknown), 고른 값을 다시 누르면 부르지 않는다', () => {
    const onViolation = vi.fn()
    render(docs({ violation: 'no', onViolation }))
    const group = screen.getByRole('group', { name: '위반 건축물' })
    for (const name of ['있음', '모름', '없음']) fireEvent.click(within(group).getByRole('button', { name }))
    expect(onViolation.mock.calls).toEqual([['yes'], ['unknown']])
  })

  it('AC-7909.4: 법 근거 여는 콜백을 주면 누를 때 그 법 id로 부르고 주소 이동은 막는다', () => {
    const onOpenLaw = vi.fn()
    render(docs({ onOpenLaw }))
    const law = within(screen.getByTestId('violation-help')).getByRole('link', { name: '법 근거' })
    expect(fireEvent.click(law)).toBe(false)
    expect(onOpenLaw).toHaveBeenCalledWith('violation')
  })
})

describe('AC-7909.4: 빈 칸 짐작', () => {
  const vac = (over: Partial<Parameters<typeof Vacancy>[0]> = {}) => <Vacancy {...HOW} building={BUILDING} stores={STORES} floorLabel="3층" {...over} />

  it('AC-7909.4: 층마다 들어선 가게 수와 가게 없는 층(빈 층 같아요) — 주차장 층은 빼고 위층부터, 이 자리 표시', () => {
    render(vac())
    expect(screen.getByRole('heading', { name: '빈 칸 짐작' })).toBeTruthy()
    expect(screen.getByText('층마다 들어선 가게로 빈 층을 짐작해요')).toBeTruthy()
    const table = screen.getByRole('table', { name: '층마다 가게' })
    expect(within(table).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['층', '지금 가게', '짐작'])
    const body = within(table).getAllByRole('row').slice(1)
    expect(body.map((r) => within(r).getAllByRole('cell').map((c) => c.textContent))).toEqual([
      ['4층', '가게 없음', '빈 층 같아요'],
      ['3층', '가게 없음', '빈 층 같아요이 자리'],
      ['2층', '가게 1곳', '쓰는 중'],
      ['1층', '가게 2곳', '쓰는 중'],
    ])
    expect(screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === '4개 층 가운데 2개 층이 빈 것 같아요.')).toBeTruthy()
    expect(screen.getByText('층이 적히지 않은 가게 3곳은 세지 않았어요.')).toBeTruthy()
    expect(screen.getByRole('link', { name: '소상공인시장진흥공단 상가(상권)정보 · 기준 2026년 10월 31일' })).toBeTruthy()
    expect(
      screen.getByText('가게 정보에 없는 층은 빈 층일 수도 있고, 가게 정보가 늦게 고쳐졌을 수도 있어요. 로드뷰와 함께 보고, 보러 가서 확인해요.'),
    ).toBeTruthy()
  })

  it('AC-7909.4: 상가정보만으로 짐작한다 — 공실률·임대료 글이 없다', () => {
    const { container } = render(vac())
    expect(container.textContent).not.toMatch(/공실|임대료|임대동향/)
  })

  it('AC-7909.4: 상가정보를 못 받으면 그 칸 자리에 자료 없음 글([다시 받기])', () => {
    const onRetry = vi.fn()
    render(vac({ stores: { ok: false, why: 'not-applied', src: 'stores' }, onRetry }))
    expect(screen.queryByRole('table', { name: '층마다 가게' })).toBeNull()
    expect(screen.getByText("공공데이터포털에서 '상가(상권)정보' 활용신청을 하면 보여요.")).toBeTruthy()
  })

  it('AC-7909.4: 건축물대장이 없으면 층을 몰라 짐작하지 않고 그 자료 없음 글', () => {
    render(vac({ building: { ok: false, why: 'none', src: 'building' } }))
    expect(screen.queryByRole('table', { name: '층마다 가게' })).toBeNull()
    expect(screen.getByText('이 지번에 건축물대장이 없어요.')).toBeTruthy()
  })

  it('AC-7909.4: 지난 값으로 짐작하면 `지난 값 · 기준 {날짜}`를 붙인다', () => {
    const prev = { v: [{ floor: '3', count: 1 }], asOf: '2026-09-30' }
    render(vac({ stores: { ok: false, why: 'failed', src: 'stores', prev } }))
    expect(screen.getByText('지난 값 · 기준 2026년 9월 30일')).toBeTruthy()
    expect(screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === '4개 층 가운데 3개 층이 빈 것 같아요.')).toBeTruthy()
  })

  it('AC-7917.2: 건축물대장을 지난 값으로 세면 그 자리에 못 받은 글([다시 받기])과 `지난 값 · 기준 {날짜}` — 짐작 표는 그대로', () => {
    const onRetry = vi.fn()
    render(vac({ building: { ok: false, why: 'failed', src: 'building', prev: { v: BLD, asOf: '2026-10-01' } }, onRetry }))
    expect(screen.getByRole('table', { name: '층마다 가게' })).toBeTruthy()
    expect(screen.getByText('지금 받지 못했어요.')).toBeTruthy()
    expect(screen.getByText('지난 값 · 기준 2026년 10월 1일')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '다시 받기' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('AC-7917.2: 건축물대장·상가정보 둘 다 지난 값이면 줄도 둘(날짜마다)', () => {
    render(
      vac({
        building: { ok: false, why: 'failed', src: 'building', prev: { v: BLD, asOf: '2026-10-01' } },
        stores: { ok: false, why: 'failed', src: 'stores', prev: { v: [{ floor: '3', count: 1 }], asOf: '2026-09-30' } },
      }),
    )
    expect(screen.getByText('지난 값 · 기준 2026년 10월 1일')).toBeTruthy()
    expect(screen.getByText('지난 값 · 기준 2026년 9월 30일')).toBeTruthy()
  })
})

describe('AC-7909.4: 땅 쓰임·계획', () => {
  it('AC-7909.4: 안내 글과 [토지이음에서 이 땅 보기] — 그 필지(PNU)를 새 창(noopener noreferrer)으로, 출처 줄', () => {
    render(<LandUse {...HOW} pnu={PNU} />)
    expect(screen.getByRole('heading', { name: '땅 쓰임·계획' })).toBeTruthy()
    expect(screen.getByText('토지이음 링크로 봐요')).toBeTruthy()
    expect(
      screen.getByText('땅 쓰임(용도지역)·지구단위계획·도로 계획·재개발은 이 앱이 받아 오지 않아요. 토지이음에서 이 땅을 열어 직접 봐요.'),
    ).toBeTruthy()
    const link = screen.getByRole('link', { name: '토지이음에서 이 땅 보기' })
    expect(link.getAttribute('href')).toBe(eumUrl(PNU))
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(screen.getByRole('link', { name: '국토교통부 토지이음(토지이용계획)' }).getAttribute('href')).toBe('/location?tab=sources#src-land')
  })

  it('AC-7909.4: 필지 번호를 못 만들면(null·틀린 모양) 링크 대신 SOURCES 없음 글', () => {
    const { rerender } = render(<LandUse {...HOW} pnu={null} />)
    expect(screen.queryByRole('link', { name: '토지이음에서 이 땅 보기' })).toBeNull()
    expect(screen.getByText('이 자리의 필지 번호를 만들지 못해 링크가 없어요.')).toBeTruthy()
    rerender(<LandUse {...HOW} pnu="12345" />)
    expect(screen.queryByRole('link', { name: '토지이음에서 이 땅 보기' })).toBeNull()
    expect(screen.getByText('이 자리의 필지 번호를 만들지 못해 링크가 없어요.')).toBeTruthy()
  })

  it('AC-7909.4: 필지 번호를 찾는 중(undefined)이면 단추가 막혀 있고 링크가 아니다', () => {
    render(<LandUse {...HOW} pnu={undefined} />)
    expect(screen.queryByRole('link', { name: '토지이음에서 이 땅 보기' })).toBeNull()
    expect(screen.getByText('토지이음에서 이 땅 보기').closest('[aria-disabled="true"]')).toBeTruthy()
  })
})

describe('AC-7909.4·AC-7909.5: 네 묶음 공통', () => {
  it('AC-7909.4·AC-7909.5: 묶음 머리와 목차 닻(sec-photo·bld·vac·land), head={false}면 머리 없이 몸만', () => {
    const all = (head?: boolean) => (
      <>
        <StreetPhotos {...HOW} at={AT} sign={null} onSign={() => {}} head={head} />
        <BuildingDocs {...HOW} building={BUILDING} floorLabel="" areaM2={null} today={TODAY} violation={null} onViolation={() => {}} head={head} />
        <Vacancy {...HOW} building={BUILDING} stores={STORES} floorLabel="" head={head} />
        <LandUse {...HOW} pnu={PNU} head={head} />
      </>
    )
    const { container, rerender } = render(all())
    expect([...container.querySelectorAll('section')].map((s) => s.id)).toEqual(['sec-photo', 'sec-bld', 'sec-vac', 'sec-land'])
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['거리 사진', '건물 서류', '빈 칸 짐작', '땅 쓰임·계획'])
    expect(screen.getByText('가지 않고 둘레를 봐요')).toBeTruthy()
    expect(screen.getByText('건축물대장')).toBeTruthy()
    rerender(all(false))
    expect(container.querySelectorAll('section')).toHaveLength(0)
    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0)
    expect(screen.getByRole('group', { name: '간판 보임' })).toBeTruthy()
  })

  // 출처 줄(SOURCES 기관·자료 이름)과 '이렇게 봤어요'(펼친 네 줄까지)도 함께 본다 — TASK-63에서 건축물대장 자료 이름의 영어 낱말이 빠졌다
  it('AC-7909.4·AC-7909.5·AC-7920.2: 화면 글에 영어 낱말이 없다(출처 줄·이렇게 봤어요 포함)', () => {
    vi.stubEnv('NEXT_PUBLIC_KAKAO_MAP_KEY', '')
    const open = { ...HOW, howOpen: true }
    const { container } = render(
      <>
        <StreetPhotos {...open} at={AT} sign="yes" onSign={() => {}} />
        <BuildingDocs {...open} building={BUILDING} floorLabel="3층" areaM2={171.9} today={TODAY} violation={null} onViolation={() => {}} />
        <Vacancy {...open} building={BUILDING} stores={STORES} floorLabel="3층" />
        <LandUse {...open} pnu={PNU} />
        <LandUse {...open} pnu={null} />
      </>,
    )
    // 카카오 지도 · 건축물대장 · 상가정보 · 토지이음 둘
    expect(container.querySelectorAll('a[href^="/location?tab=sources#src-"]')).toHaveLength(5)
    expect(screen.getAllByText('이렇게 봤어요')).toHaveLength(5)
    expect(container.textContent).not.toMatch(/[A-Za-z]/)
  })
})

// ── '이렇게 봤어요'(AC-7920.2): 묶음 넷 제목 바로 아래 HowLine — 글은 method.ts HOW를 부르는 쪽이 준 값(howCtx)으로 채움, 펼침은 부르는 쪽이 쥠 ──

const lineOf = (box: HTMLElement) => within(box).getByText('이렇게 봤어요').closest('p')!
const howBoxOf = (box: HTMLElement) => lineOf(box).parentElement!

type Group = 'photo' | 'bld' | 'vac' | 'land'
const GROUPS: readonly Group[] = ['photo', 'bld', 'vac', 'land']
const one = (g: Group, how: Partial<typeof HOW> = {}, head?: boolean) => {
  const p = { ...HOW, ...how, head }
  if (g === 'photo') return <StreetPhotos {...p} at={AT} sign={null} onSign={() => {}} />
  if (g === 'bld') return <BuildingDocs {...p} building={BUILDING} floorLabel="3층" areaM2={171.9} today={TODAY} violation={null} onViolation={() => {}} />
  if (g === 'vac') return <Vacancy {...p} building={BUILDING} stores={STORES} floorLabel="3층" />
  return <LandUse {...p} pnu={PNU} />
}

// requirements '화면 글 기본값' 승인 3 표 그대로(채운 뒤 — [[bld]]·[[store]]는 '기준 {그 출처 기준 날짜}')
const LINE: Record<Group, string> = {
  photo:
    '이렇게 봤어요 카카오맵 로드뷰·하늘 사진(열 때마다 불러와요) · 간판 보임(내가 고른 값) · 사진으로 입구·간판 자리·주차장 길을 보고 간판이 보이는지 직접 골라요 · 처음 오는 환자는 간판을 보고 찾아오고, 어르신은 입구에 턱이 없어야 들어와요',
  bld: '이렇게 봤어요 국토교통부 건축물대장(기준 2026년 11월 15일) · 위반 건축물(내가 고른 값) · 지은 해·층수·넓이·엘리베이터·주차·층마다 용도를 그대로 옮겼어요 · 건물이 의원을 들일 수 있는지, 개설 신고에 걸림이 없는지 봐요',
  vac: "이렇게 봤어요 소상공인시장진흥공단 상가정보(기준 2026년 10월 31일) · 건축물대장 층별개요 · 층마다 들어선 가게를 세어 가게가 없는 층을 '빈 층 같아요'로 적었어요 · 빈 층이 많은 건물은 사람이 덜 오는 건물일 수 있어요",
  land: '이렇게 봤어요 국토교통부 토지이음(링크만) · 앱이 받아 오지 않고, 이 땅의 필지 번호로 토지이음 화면을 새 창에 열어요 · 앞으로 도로·재개발로 둘레가 바뀔 수 있어 계약 전에 봐 둬요',
}
// 근거 칩: 거리 사진 = 법 근거 + 흔히 보는 기준(칩 둘), 건물 서류 = 법 근거, 빈 칸·땅 = 흔히 보는 기준
const CHIPS: Record<Group, string[]> = {
  photo: ['법 근거', '흔히 보는 기준'],
  bld: ['법 근거'],
  vac: ['흔히 보는 기준'],
  land: ['흔히 보는 기준'],
}
const TITLE: Record<Group, string> = { photo: '거리 사진', bld: '건물 서류', vac: '빈 칸 짐작', land: '땅 쓰임·계획' }

const rowsOf = (box: HTMLElement) =>
  [...howBoxOf(box).querySelectorAll('dl > div')].map((d) => [d.querySelector('dt')!.textContent, d.querySelector('dd')!.textContent])

describe("AC-7920.2: 네 묶음 '이렇게 봤어요'", () => {
  it.each(GROUPS)('AC-7920.2: %s — 묶음 제목 바로 아래(몸보다 먼저) 한 줄 `이렇게 봤어요 {무엇} · {어떻게} · {왜}` + 근거 칩 + [더 보기]', (g) => {
    const { container } = render(one(g))
    const section = container.querySelector(`section#sec-${g}`) as HTMLElement
    expect(section).toBeTruthy()
    // 차례: 머리(h3) → 이렇게 봤어요 → 몸
    expect(section.children).toHaveLength(3)
    expect(within(section.children[0] as HTMLElement).getByRole('heading', { level: 3 }).textContent).toBe(TITLE[g])
    expect(section.children[1]).toBe(howBoxOf(section))
    const p = lineOf(section)
    const chips = [...p.querySelectorAll('[data-chip]')].map((c) => c.textContent)
    expect(chips).toEqual(CHIPS[g])
    expect(p.textContent).toBe(`${LINE[g]}${CHIPS[g].join('')}더 보기`)
    expect(within(p).getByRole('button', { name: '더 보기' }).getAttribute('aria-expanded')).toBe('false')
  })

  it.each(GROUPS)('AC-7920.2: %s — [더 보기] 네 줄(무엇을 봤나·어떻게 셌나·왜 중요한가·근거)은 method.ts HOW를 받은 값으로 채운 글', (g) => {
    const { container } = render(one(g, { howOpen: true }))
    const section = container.querySelector(`section#sec-${g}`) as HTMLElement
    const more = filledHow(g, CTX).more
    expect(rowsOf(section)).toEqual([
      ['무엇을 봤나', more.what],
      ['어떻게 셌나', more.how],
      ['왜 중요한가', more.why],
      ['근거', more.basis],
    ])
    expect(within(lineOf(section)).getByRole('button', { name: '접기' }).getAttribute('aria-expanded')).toBe('true')
  })

  it('AC-7920.2: 건물 서류 [더 보기] 네 줄 — 화면 글 기본값 그대로, 법 근거 셋', () => {
    const { container } = render(one('bld', { howOpen: true }))
    expect(rowsOf(container)).toEqual([
      ['무엇을 봤나', '국토교통부 건축물대장정보(표제부·층별개요, 기준 2026년 11월 15일) · 위반 건축물(있음·없음·모름 가운데 내가 고른 값)'],
      ['어떻게 셌나', '건축물대장 표제부(건물 전체)와 층별개요(층마다)를 그대로 옮겨요. 위반 건축물인지는 공개 자료가 없어 건축물대장을 떼어 보고 직접 골라요.'],
      ['왜 중요한가', '의원은 제1종 근린생활시설에 들어가야 하고, 위반 건축물이면 개설 신고가 막힐 수 있어요. 2층 넘는 자리는 엘리베이터가 있어야 어르신이 와요.'],
      [
        '근거',
        '법 근거 — 의원은 넓이와 상관없이 제1종 근린생활시설이에요(건축법 시행령 별표 1 제3호 라목). 구청은 위반 건축물에 다른 법의 신고를 해 주지 말라고 요청할 수 있어요(건축법 제79조 · 의료법 시행규칙 제25조 제3항 제4호). 500㎡ 이상 의원은 계단이나 엘리베이터 같은 편의시설이 꼭 있어야 해요(장애인등편의법 시행령 별표 2).',
      ],
    ])
  })

  it('AC-7920.2: 빈 칸 짐작 [더 보기] 무엇을 봤나 — 상가정보·건축물대장 두 출처의 기준 날짜를 각각 채움', () => {
    const { container } = render(one('vac', { howOpen: true }))
    expect(rowsOf(container)[0]).toEqual([
      '무엇을 봤나',
      '소상공인시장진흥공단 상가(상권)정보(기준 2026년 10월 31일) · 국토교통부 건축물대장 층별개요(기준 2026년 11월 15일)',
    ])
  })

  it('AC-7920.2: 기준 날짜가 없는 출처는 그 조각(괄호째)을 뺀다', () => {
    const none = ctxOf({})
    const { container, rerender } = render(one('bld', { howCtx: none, howOpen: true }))
    expect(lineOf(container).textContent).toContain('이렇게 봤어요 국토교통부 건축물대장 · 위반 건축물(내가 고른 값) · ')
    expect(rowsOf(container)[0]![1]).toBe('국토교통부 건축물대장정보(표제부·층별개요) · 위반 건축물(있음·없음·모름 가운데 내가 고른 값)')
    rerender(one('vac', { howCtx: none, howOpen: true }))
    expect(lineOf(container).textContent).toContain('이렇게 봤어요 소상공인시장진흥공단 상가정보 · 건축물대장 층별개요 · ')
    expect(rowsOf(container)[0]![1]).toBe('소상공인시장진흥공단 상가(상권)정보 · 국토교통부 건축물대장 층별개요')
  })

  it.each(GROUPS)('AC-7920.2: %s — 펼침은 부르는 쪽이 쥔다: 누르면 onHow만 부르고, 받은 howOpen대로 그린다', (g) => {
    const onHow = vi.fn()
    const { container, rerender } = render(one(g, { onHow }))
    const list = () => howBoxOf(container).querySelector('dl')!
    expect(list().hidden).toBe(true)
    fireEvent.click(within(lineOf(container)).getByRole('button', { name: '더 보기' }))
    expect(onHow).toHaveBeenCalledTimes(1)
    // 제 상태로 펼치지 않음
    expect(list().hidden).toBe(true)
    rerender(one(g, { onHow, howOpen: true }))
    expect(list().hidden).toBe(false)
    fireEvent.click(within(lineOf(container)).getByRole('button', { name: '접기' }))
    expect(onHow).toHaveBeenCalledTimes(2)
    expect(list().hidden).toBe(false)
  })

  it('AC-7920.2: 범위·그날 값을 바꿔 다시 그려도 펼친 것은 그대로이고 글만 새 값으로 바뀐다', () => {
    const { container, rerender } = render(one('bld', { howOpen: true }))
    expect(rowsOf(container)[0]![1]).toContain('기준 2026년 11월 15일')
    rerender(one('bld', { howOpen: true, howCtx: ctxOf({ building: '2026-11-22', stores: '2026-11-01' }, 500) }))
    expect(howBoxOf(container).querySelector('dl')!.hidden).toBe(false)
    expect(within(lineOf(container)).getByRole('button', { name: '접기' })).toBeTruthy()
    expect(lineOf(container).textContent).toContain('국토교통부 건축물대장(기준 2026년 11월 22일)')
    expect(rowsOf(container)[0]![1]).toContain('기준 2026년 11월 22일')
  })

  it("AC-7920.2: head={false}일 때도 '이렇게 봤어요'는 묶음 안 맨 위(몸보다 먼저)에 있고, 닻 id(sec-…)는 그리지 않는다", () => {
    const { container } = render(
      <>
        {GROUPS.map((g) => (
          <div key={g} data-testid={`box-${g}`}>
            {one(g, {}, false)}
          </div>
        ))}
      </>,
    )
    for (const g of GROUPS) {
      const box = screen.getByTestId(`box-${g}`)
      const root = box.firstElementChild as HTMLElement
      // 묶음 하나 = 감싸개 하나, 그 첫 칸이 이렇게 봤어요
      expect(box.children).toHaveLength(1)
      expect(root.firstElementChild).toBe(howBoxOf(box))
      expect(lineOf(box).textContent).toBe(`${LINE[g]}${CHIPS[g].join('')}더 보기`)
    }
    expect(container.querySelectorAll('[id^="sec-"]')).toHaveLength(0)
    expect(container.querySelectorAll('section')).toHaveLength(0)
  })

  it('AC-7920.2·AC-7909.1: 묶음 넷이 닻 id를 한 번씩만 그린다(이렇게 봤어요가 sec- id를 더하지 않음)', () => {
    const { container } = render(
      <>
        {GROUPS.map((g) => (
          <div key={g}>{one(g, { howOpen: true })}</div>
        ))}
      </>,
    )
    const ids = [...container.querySelectorAll('[id^="sec-"]')].map((e) => e.id)
    expect(ids).toEqual(['sec-photo', 'sec-photo-title', 'sec-bld', 'sec-bld-title', 'sec-vac', 'sec-vac-title', 'sec-land', 'sec-land-title'])
    expect(new Set([...container.querySelectorAll('[id]')].map((e) => e.id)).size).toBe(container.querySelectorAll('[id]').length)
  })
})
