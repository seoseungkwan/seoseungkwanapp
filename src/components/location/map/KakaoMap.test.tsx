// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { errorInfo } from '@/lib/errors'
import { FakeLatLng, failSdk, finishSdk, makeFakeKakao, resetSdk, sdkScripts, type FakeKakao } from './fakeKakao.test.data'
import { KakaoMap, type MapArea, type MapMark } from './KakaoMap'
import { NO_MAP_KEY } from './MapFallback'

// 카카오 지도 부품(specs/location REQ-7916 AC-7916.1, design.md 13절): 가운데·범위 원·표시(후보 파랑·경쟁 의원 주황·한의원 회색·둘레 다른 과 의원 연보라 작은 점·역 검은 네모)·
// 동 다각형·찍기·지도/하늘 사진. 열쇠가 비면 지도 자리에 안내 글, 실패는 E-LOC-MAP. 가짜 window.kakao로만 본다(바깥 사이트 안 부름).
// 색은 앱 토큰(:root CSS 변수)에서 읽는다 — 시험은 토큰 값을 이름 글자로 넣어 어느 토큰을 썼는지 본다

const KEY = 'fakejskey0000test'
const CENTER = { lat: 37.5, lng: 127.03 }
const TOKENS = ['--accent', '--negative', '--muted', '--ink', '--surface', '--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5']

const MARKS: MapMark[] = [
  { id: 'cand', kind: 'candidate', at: CENTER, label: 'A' },
  { id: 'r1', kind: 'rival', at: { lat: 37.501, lng: 127.031 }, label: '예시정형외과의원' },
  { id: 'k1', kind: 'korean', at: { lat: 37.499, lng: 127.029 }, label: '예시한의원' },
  { id: 's1', kind: 'station', at: { lat: 37.502, lng: 127.028 }, label: '예시중앙역' },
  { id: 'r2', kind: 'rival', at: { lat: 37.52, lng: 127.05 }, label: '예시재활의학과의원', outside: true },
  { id: 'o1', kind: 'other', at: { lat: 37.4995, lng: 127.0305 }, label: '예시내과의원' },
  { id: 'o2', kind: 'other', at: { lat: 37.53, lng: 127.06 }, label: '예시치과의원', outside: true },
]
const AREAS: MapArea[] = [
  {
    id: '1111051500',
    name: '가람동',
    rings: [
      [
        [127.0, 37.5],
        [127.01, 37.5],
        [127.01, 37.51],
        [127.0, 37.5],
      ],
    ],
    center: [127.005, 37.503],
    tone: 4,
    text: '82점',
  },
  {
    id: '1111052000',
    name: '하늘동',
    rings: [
      [
        [127.02, 37.52],
        [127.03, 37.52],
        [127.03, 37.53],
        [127.02, 37.52],
      ],
    ],
    center: [127.025, 37.523],
    tone: 0,
    selected: true,
  },
]

let fake: FakeKakao

async function ready(ui: React.ReactElement) {
  const view = render(ui)
  await act(async () => finishSdk(fake))
  return view
}
const lastMap = () => fake.made.maps.at(-1)!
const liveOverlays = () => fake.live(fake.made.overlays)
const markEl = (id: string) => liveOverlays().map((o) => o.options.content).find((el) => el.dataset.mark === id)!

beforeEach(() => {
  resetSdk()
  vi.stubEnv('NEXT_PUBLIC_KAKAO_MAP_KEY', KEY)
  fake = makeFakeKakao()
  for (const t of TOKENS) document.documentElement.style.setProperty(t, `tok${t}`)
})
afterEach(() => {
  cleanup()
  resetSdk()
  vi.unstubAllEnvs()
  document.documentElement.removeAttribute('style')
})

describe('AC-7916.1 KakaoMap 열쇠 없음·실패', () => {
  it('AC-7916.1 열쇠가 비면 SDK를 부르지 않고 지도 자리에 안내 글이다', () => {
    vi.stubEnv('NEXT_PUBLIC_KAKAO_MAP_KEY', '')
    render(<KakaoMap label="후보 둘레 지도" center={CENTER} />)
    expect(sdkScripts()).toHaveLength(0)
    expect(NO_MAP_KEY).toBe('카카오 지도 열쇠를 넣으면 지도가 보여요. 숫자는 지도 없이도 볼 수 있어요.')
    expect(screen.getByText(NO_MAP_KEY)).toBeTruthy()
    expect(screen.queryByRole('button', { name: '하늘 사진' })).toBeNull()
  })

  it('AC-7916.1 SDK를 받지 못하면 지도 자리에 E-LOC-MAP 오류 카드(무엇이·어떻게·번호)', async () => {
    render(<KakaoMap label="후보 둘레 지도" center={CENTER} />)
    await act(async () => failSdk())
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain(errorInfo('E-LOC-MAP').what)
    expect(alert.textContent).toContain(errorInfo('E-LOC-MAP').fix)
    expect(alert.textContent).toContain('E-LOC-MAP')
  })

  it('AC-7916.1 지도 만들기가 던지면 E-LOC-MAP 오류 카드', async () => {
    fake = makeFakeKakao({ mapThrows: true })
    await ready(<KakaoMap label="후보 둘레 지도" center={CENTER} />)
    expect(screen.getByRole('alert').textContent).toContain('E-LOC-MAP')
  })

  it('AC-7916.1 받는 동안은 기다림 표시(aria-busy)이고 지도는 아직 없다', () => {
    render(<KakaoMap label="후보 둘레 지도" center={CENTER} />)
    expect(screen.getByRole('group', { name: '후보 둘레 지도' }).getAttribute('aria-busy')).toBe('true')
    expect(fake.made.maps).toHaveLength(0)
  })
})

describe('AC-7916.1 KakaoMap 그리기', () => {
  it('AC-7916.1 지도 하나를 부품 안 칸에 가운데 점으로 만든다', async () => {
    await ready(<KakaoMap label="후보 둘레 지도" center={CENTER} />)
    expect(fake.made.maps).toHaveLength(1)
    const group = screen.getByRole('group', { name: '후보 둘레 지도' })
    expect(group.contains(lastMap().container)).toBe(true)
    expect(lastMap().center).toEqual(new FakeLatLng(CENTER.lat, CENTER.lng))
    expect(group.getAttribute('aria-busy')).toBeNull()
  })

  it('AC-7916.1 개발 StrictMode(효과 두 번)에서도 한 칸에 지도·표시는 하나씩이다', async () => {
    await ready(
      <StrictMode>
        <KakaoMap label="후보 둘레 지도" center={CENTER} radiusM={1000} marks={MARKS.slice(0, 1)} />
      </StrictMode>,
    )
    expect(fake.made.maps).toHaveLength(1)
    expect(fake.live(fake.made.circles)).toHaveLength(1)
    expect(liveOverlays()).toHaveLength(1)
  })

  it('AC-7916.1 지도 두 개·로드뷰가 같이 있어도 SDK script는 하나다', async () => {
    render(
      <>
        <KakaoMap label="하나" center={CENTER} />
        <KakaoMap label="둘" center={CENTER} view="sky" />
      </>,
    )
    expect(sdkScripts()).toHaveLength(1)
    await act(async () => finishSdk(fake))
    expect(fake.made.maps).toHaveLength(2)
    expect(fake.made.load).toBe(1)
  })

  it('AC-7916.1 범위 원: 가운데·반지름(m)·파란 토큰 색, 범위에 맞춰 지도를 맞춘다', async () => {
    await ready(<KakaoMap label="후보 둘레 지도" center={CENTER} radiusM={1000} />)
    const circles = fake.live(fake.made.circles)
    expect(circles).toHaveLength(1)
    expect(circles[0]!.options.center).toEqual(new FakeLatLng(CENTER.lat, CENTER.lng))
    expect(circles[0]!.options.radius).toBe(1000)
    expect(circles[0]!.options.strokeColor).toBe('tok--accent')
    expect(circles[0]!.options.fillColor).toBe('tok--accent')
    const pts = lastMap().bounds!.points
    // 원을 감싼 네모: 남서·북동이 가운데에서 1km 안팎(위도 1도 ≈ 111km)
    expect(Math.min(...pts.map((p) => p.lat))).toBeCloseTo(CENTER.lat - 1000 / 111_320, 4)
    expect(Math.max(...pts.map((p) => p.lat))).toBeCloseTo(CENTER.lat + 1000 / 111_320, 4)
    expect(Math.max(...pts.map((p) => p.lng))).toBeGreaterThan(CENTER.lng + 1000 / 111_320)
  })

  it('AC-7916.1 범위를 바꾸면 옛 원을 지우고 새 원 하나만 남는다', async () => {
    const view = await ready(<KakaoMap label="후보 둘레 지도" center={CENTER} radiusM={1000} />)
    view.rerender(<KakaoMap label="후보 둘레 지도" center={CENTER} radiusM={500} />)
    const circles = fake.live(fake.made.circles)
    expect(circles).toHaveLength(1)
    expect(circles[0]!.options.radius).toBe(500)
    view.rerender(<KakaoMap label="후보 둘레 지도" center={CENTER} radiusM={null} />)
    expect(fake.live(fake.made.circles)).toHaveLength(0)
  })

  it('AC-7916.1 표시: 후보 파랑(accent)·경쟁 의원 주황(negative)·한의원 회색(muted)·역 검은 네모(ink, 모서리 없음)', async () => {
    await ready(<KakaoMap label="후보 둘레 지도" center={CENTER} radiusM={1000} marks={MARKS} />)
    expect(liveOverlays().filter((o) => o.options.content.dataset.mark)).toHaveLength(MARKS.length)

    const cand = markEl('cand')
    expect(cand.dataset.kind).toBe('candidate')
    expect(cand.className).toContain('bg-accent')
    expect(cand.textContent).toBe('A')

    const rival = markEl('r1')
    expect(rival.className).toContain('bg-negative')
    expect(rival.className).toContain('rounded-full')
    expect(rival.title).toBe('예시정형외과의원')

    const korean = markEl('k1')
    expect(korean.className).toContain('bg-muted')
    expect(korean.className).toContain('rounded-full')

    const station = markEl('s1')
    const box = station.querySelector('[data-shape="square"]')!
    expect(box.className).toContain('bg-ink')
    expect(box.className).not.toContain('rounded')
    expect(station.textContent).toBe('예시중앙역')

    // 자리: 표시마다 그 점
    const at = (id: string) => liveOverlays().find((o) => o.options.content.dataset.mark === id)!.options.position
    expect(at('r1')).toEqual(new FakeLatLng(37.501, 127.031))
  })

  it('AC-7916.1 둘레 다른 과 의원(other): 연보라(cal-lavender 토큰) 작은 점 — 경쟁 의원 주황·한의원 회색보다 작고 그 아래에 깔린다', async () => {
    await ready(<KakaoMap label="후보 둘레 지도" center={CENTER} radiusM={1000} marks={MARKS} />)
    const other = markEl('o1')
    expect(other.dataset.kind).toBe('other')
    expect(other.className).toContain('bg-cal-lavender')
    expect(other.className).toContain('rounded-full')
    expect(other.className).not.toContain('bg-negative')
    expect(other.className).not.toContain('bg-muted')
    expect(other.title).toBe('예시내과의원')
    expect(other.textContent).toBe('')
    // 색은 토큰 클래스만(색 글자를 안에 적지 않음)
    expect(other.getAttribute('style')).toBeNull()

    // 작게: 점 크기(size-n)가 경쟁 의원·한의원 점보다 작다
    const size = (el: HTMLElement) => Number(/(?:^|\s)size-([\d.]+)(?:\s|$)/.exec(el.className)?.[1])
    expect(size(other)).toBeGreaterThan(0)
    expect(size(other)).toBeLessThan(size(markEl('r1')))
    expect(size(other)).toBeLessThan(size(markEl('k1')))

    // 겹치면 경쟁 의원·한의원·역·후보가 위(다른 과 점이 가장 아래)
    const z = (id: string) => liveOverlays().find((o) => o.options.content.dataset.mark === id)!.options.zIndex!
    for (const id of ['r1', 'k1', 's1', 'cand']) expect(z('o1')).toBeLessThan(z(id))

    // 자리 = 그 점(심평원 좌표)
    const at = liveOverlays().find((o) => o.options.content.dataset.mark === 'o1')!.options.position
    expect(at).toEqual(new FakeLatLng(37.4995, 127.0305))
  })

  it('AC-7916.1 종류마다 하나씩 그려진다: 후보·경쟁 의원·한의원·둘레 다른 과 의원·역', async () => {
    await ready(<KakaoMap label="후보 둘레 지도" center={CENTER} marks={MARKS} />)
    const kinds = liveOverlays()
      .map((o) => o.options.content.dataset.kind)
      .filter(Boolean)
    expect(new Set(kinds)).toEqual(new Set(['candidate', 'rival', 'korean', 'other', 'station']))
  })

  it('AC-7916.1 범위 밖 표시는 흐리게, 범위 안은 그대로', async () => {
    await ready(<KakaoMap label="후보 둘레 지도" center={CENTER} marks={MARKS} />)
    expect(markEl('r2').className).toContain('opacity-40')
    expect(markEl('r1').className).not.toContain('opacity-40')
    expect(markEl('o2').className).toContain('opacity-40')
    expect(markEl('o1').className).not.toContain('opacity-40')
  })

  it('AC-7916.1 표시 글은 글자로만 넣는다(HTML로 읽지 않음)', async () => {
    const marks: MapMark[] = [{ id: 'x', kind: 'station', at: CENTER, label: '<img src=x onerror=alert(1)>역' }]
    await ready(<KakaoMap label="후보 둘레 지도" center={CENTER} marks={marks} />)
    const el = markEl('x')
    expect(el.querySelector('img')).toBeNull()
    expect(el.textContent).toBe('<img src=x onerror=alert(1)>역')
  })

  it('AC-7916.1 표시가 바뀌면 옛 표시를 지우고, 부품이 사라지면 모두 지운다', async () => {
    const view = await ready(<KakaoMap label="후보 둘레 지도" center={CENTER} radiusM={1000} marks={MARKS} />)
    view.rerender(<KakaoMap label="후보 둘레 지도" center={CENTER} radiusM={1000} marks={MARKS.slice(0, 2)} />)
    expect(liveOverlays().filter((o) => o.options.content.dataset.mark).map((o) => o.options.content.dataset.mark)).toEqual(['cand', 'r1'])
    view.unmount()
    expect(liveOverlays()).toHaveLength(0)
    expect(fake.live(fake.made.circles)).toHaveLength(0)
  })

  it('AC-7916.1 같은 값으로 다시 그리면(새 배열이어도) 표시를 다시 만들지 않는다', async () => {
    const view = await ready(<KakaoMap label="후보 둘레 지도" center={CENTER} radiusM={1000} marks={MARKS} />)
    const before = fake.made.overlays.length
    view.rerender(<KakaoMap label="후보 둘레 지도" center={{ ...CENTER }} radiusM={1000} marks={MARKS.map((m) => ({ ...m }))} />)
    expect(fake.made.overlays.length).toBe(before)
    expect(fake.made.circles).toHaveLength(1)
  })

  it('AC-7916.1 동 다각형: [경도, 위도] 고리를 카카오 점으로, 점수 칸 색(chart 토큰)·고른 동은 진한 선, 이름·글은 글자로', async () => {
    await ready(<KakaoMap label="예시구 동 점수 지도" center={CENTER} areas={AREAS} />)
    const polys = fake.live(fake.made.polygons)
    expect(polys).toHaveLength(2)
    expect(polys[0]!.options.path).toEqual([
      [new FakeLatLng(37.5, 127.0), new FakeLatLng(37.5, 127.01), new FakeLatLng(37.51, 127.01), new FakeLatLng(37.5, 127.0)],
    ])
    expect(polys[0]!.options.fillColor).toBe('tok--chart-5')
    expect(polys[1]!.options.fillColor).toBe('tok--chart-1')
    expect(polys[0]!.options.strokeColor).toBe('tok--surface')
    expect(polys[1]!.options.strokeColor).toBe('tok--ink')
    expect(polys[1]!.options.strokeWeight).toBeGreaterThan(polys[0]!.options.strokeWeight!)

    const label = liveOverlays().find((o) => o.options.content.dataset.area === '1111051500')!
    expect(label.options.position).toEqual(new FakeLatLng(37.503, 127.005))
    expect(label.options.content.textContent).toBe('가람동82점')
    // 동이 있으면 동 전체에 맞춘다
    const lats = lastMap().bounds!.points.map((p) => p.lat)
    expect(Math.min(...lats)).toBe(37.5)
    expect(Math.max(...lats)).toBe(37.53)
  })

  it('AC-7916.1 동 다각형을 누르면 onArea(동 코드)', async () => {
    const onArea = vi.fn()
    await ready(<KakaoMap label="예시구 동 점수 지도" center={CENTER} areas={AREAS} onArea={onArea} />)
    fake.click(fake.live(fake.made.polygons)[1]!)
    expect(onArea).toHaveBeenCalledWith('1111052000')
  })

  it('AC-7916.1 찍기: 지도를 누르면 onPick(위도·경도, 소수 6자리)', async () => {
    const onPick = vi.fn()
    await ready(<KakaoMap label="지도에서 찍기" center={CENTER} onPick={onPick} />)
    fake.click(lastMap(), new FakeLatLng(37.123456789, 127.987654321))
    expect(onPick).toHaveBeenCalledWith({ lat: 37.123457, lng: 127.987654 })
  })

  it('AC-7916.1 찍기가 없으면 지도 누르기를 듣지 않고, 사라지면 듣기를 뗀다', async () => {
    const view = await ready(<KakaoMap label="지도에서 찍기" center={CENTER} onPick={() => {}} />)
    expect(fake.made.listeners.filter((l) => l.target === lastMap())).toHaveLength(1)
    view.unmount()
    expect(fake.made.listeners).toHaveLength(0)
    await ready(<KakaoMap label="그냥 지도" center={CENTER} />)
    expect(fake.made.listeners.filter((l) => l.target === lastMap())).toHaveLength(0)
  })

  it('AC-7916.1 [지도]·[하늘 사진]으로 바꾼다(하늘 사진 = 길 이름이 얹힌 하늘 사진)', async () => {
    const user = userEvent.setup()
    await ready(<KakaoMap label="후보 둘레 지도" center={CENTER} />)
    const group = screen.getByRole('group', { name: '후보 둘레 지도' })
    const mapBtn = within(group).getByRole('button', { name: '지도' })
    const skyBtn = within(group).getByRole('button', { name: '하늘 사진' })
    expect(mapBtn.getAttribute('aria-pressed')).toBe('true')
    expect(skyBtn.getAttribute('aria-pressed')).toBe('false')
    expect(lastMap().typeId).toBe(fake.maps.MapTypeId.ROADMAP)

    await user.click(skyBtn)
    expect(lastMap().typeId).toBe(fake.maps.MapTypeId.HYBRID)
    expect(skyBtn.getAttribute('aria-pressed')).toBe('true')
    expect(mapBtn.getAttribute('aria-pressed')).toBe('false')

    await user.click(mapBtn)
    expect(lastMap().typeId).toBe(fake.maps.MapTypeId.ROADMAP)
  })

  it('AC-7916.1 view="sky"면 처음부터 하늘 사진', async () => {
    await ready(<KakaoMap label="하늘에서 본 사진" center={CENTER} view="sky" />)
    expect(lastMap().typeId).toBe(fake.maps.MapTypeId.HYBRID)
    expect(screen.getByRole('button', { name: '하늘 사진' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('AC-7916.1 가운데가 바뀌면 지도를 다시 만들지 않고 옮긴다', async () => {
    const view = await ready(<KakaoMap label="후보 둘레 지도" center={CENTER} />)
    view.rerender(<KakaoMap label="후보 둘레 지도" center={{ lat: 35.1, lng: 129.04 }} />)
    expect(fake.made.maps).toHaveLength(1)
    expect(lastMap().center).toEqual(new FakeLatLng(35.1, 129.04))
  })
})
