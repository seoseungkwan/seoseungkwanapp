// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { errorInfo } from '@/lib/errors'
import { FakeLatLng, failSdk, finishSdk, makeFakeKakao, resetSdk, sdkScripts } from './fakeKakao.test.data'
import { NO_MAP_KEY } from './MapFallback'
import { NO_ROADVIEW, Roadview } from './Roadview'

// 로드뷰(거리 사진) 부품(specs/location REQ-7916 AC-7916.1, design.md 13절): RoadviewClient.getNearestPanoId(점, 50),
// 없으면 '이 자리 50m 안에는 거리 사진이 없어요'. 가짜 window.kakao로만 본다

const KEY = 'fakejskey0000test'
const AT = { lat: 37.501234, lng: 127.034567 }

beforeEach(() => {
  resetSdk()
  vi.stubEnv('NEXT_PUBLIC_KAKAO_MAP_KEY', KEY)
})
afterEach(() => {
  cleanup()
  resetSdk()
  vi.unstubAllEnvs()
})

describe('AC-7916.1 Roadview', () => {
  it('AC-7916.1 그 점 50m 안 가장 가까운 거리 사진을 찾아 띄운다', async () => {
    const fake = makeFakeKakao({ pano: 1234567 })
    render(<Roadview at={AT} />)
    await act(async () => finishSdk(fake))
    expect(fake.made.panoAsks).toHaveLength(1)
    expect(fake.made.panoAsks[0]!.radius).toBe(50)
    expect(fake.made.panoAsks[0]!.at).toEqual(new FakeLatLng(AT.lat, AT.lng))
    expect(fake.made.roadviews).toHaveLength(1)
    expect(fake.made.roadviews[0]!.pano).toEqual({ id: 1234567, at: new FakeLatLng(AT.lat, AT.lng) })
    expect(screen.getByRole('group', { name: '거리 사진' }).contains(fake.made.roadviews[0]!.container)).toBe(true)
    expect(screen.queryByText(NO_ROADVIEW)).toBeNull()
  })

  it('AC-7916.1 50m 안에 거리 사진이 없으면 그 자리에 없음 글', async () => {
    const fake = makeFakeKakao({ pano: null })
    render(<Roadview at={AT} />)
    await act(async () => finishSdk(fake))
    expect(NO_ROADVIEW).toBe('이 자리 50m 안에는 거리 사진이 없어요')
    expect(screen.getByText(NO_ROADVIEW)).toBeTruthy()
    expect(fake.made.roadviews).toHaveLength(0)
  })

  it('AC-7916.1 점이 바뀌면 그 점으로 다시 찾는다', async () => {
    const fake = makeFakeKakao({ pano: null })
    const view = render(<Roadview at={AT} />)
    await act(async () => finishSdk(fake))
    expect(screen.getByText(NO_ROADVIEW)).toBeTruthy()
    fake.made.panoAsks.length = 0
    view.rerender(<Roadview at={{ lat: 35.1, lng: 129.04 }} />)
    await act(async () => {})
    expect(fake.made.panoAsks.map((a) => a.at)).toEqual([new FakeLatLng(35.1, 129.04)])
    act(() => fake.made.panoAsks[0]!.done(99))
    expect(screen.queryByText(NO_ROADVIEW)).toBeNull()
    expect(fake.made.roadviews.at(-1)!.pano).toEqual({ id: 99, at: new FakeLatLng(35.1, 129.04) })
  })

  it('AC-7916.1 찾는 사이 부품이 사라지면 늦게 온 답은 버린다', async () => {
    const fake = makeFakeKakao()
    const view = render(<Roadview at={AT} />)
    await act(async () => finishSdk(fake))
    view.unmount()
    fake.made.panoAsks[0]!.done(5)
    expect(fake.made.roadviews).toHaveLength(0)
  })

  it('AC-7916.1 열쇠가 비면 SDK를 부르지 않고 지도 열쇠 안내 글', () => {
    vi.stubEnv('NEXT_PUBLIC_KAKAO_MAP_KEY', '')
    render(<Roadview at={AT} />)
    expect(sdkScripts()).toHaveLength(0)
    expect(screen.getByText(NO_MAP_KEY)).toBeTruthy()
  })

  it('AC-7916.1 SDK를 받지 못하면 E-LOC-MAP 오류 카드', async () => {
    render(<Roadview at={AT} />)
    await act(async () => failSdk())
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain(errorInfo('E-LOC-MAP').what)
    expect(alert.textContent).toContain('E-LOC-MAP')
  })
})
