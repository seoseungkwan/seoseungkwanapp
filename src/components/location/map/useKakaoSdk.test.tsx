// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { failSdk, finishSdk, makeFakeKakao, resetSdk, sdkScripts } from './fakeKakao.test.data'
import { SDK_TIMEOUT_MS, sdkUrl, useKakaoSdk } from './useKakaoSdk'

// 카카오 지도 SDK 불러오기(specs/location REQ-7916 AC-7916.1, design.md 13절).
// 열쇠는 NEXT_PUBLIC_KAKAO_MAP_KEY에서만 읽는다(시험 값은 지어낸 글자). 바깥 사이트는 부르지 않는다 — jsdom은 script를 받지 않고
// 시험이 load·error를 보낸다(fakeKakao.test.data.ts)

const KEY = 'fakejskey0000test'

function Probe({ id }: { id: string }) {
  const sdk = useKakaoSdk()
  return <p data-testid={id}>{sdk.state}</p>
}

beforeEach(() => {
  resetSdk()
  vi.stubEnv('NEXT_PUBLIC_KAKAO_MAP_KEY', KEY)
})
afterEach(() => {
  cleanup()
  resetSdk()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe('AC-7916.1 useKakaoSdk', () => {
  it('AC-7916.1 불러오기만 해서는 script를 넣지 않는다(지도를 그리는 화면에서만 부른다)', () => {
    expect(sdkScripts()).toHaveLength(0)
  })

  it('AC-7916.1 열쇠로 SDK 주소를 한 번 넣는다: dapi.kakao.com · appkey · autoload=false', () => {
    render(<Probe id="a" />)
    const scripts = sdkScripts()
    expect(scripts).toHaveLength(1)
    expect(scripts[0]!.src).toBe(`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KEY}&autoload=false`)
    expect(scripts[0]!.src).toBe(sdkUrl(KEY))
    expect(screen.getByTestId('a').textContent).toBe('loading')
  })

  it('AC-7916.1 열쇠 앞뒤 빈칸은 떼고, 주소에 넣을 때 글자를 감싼다', () => {
    expect(sdkUrl('a b&c')).toBe('https://dapi.kakao.com/v2/maps/sdk.js?appkey=a%20b%26c&autoload=false')
    vi.stubEnv('NEXT_PUBLIC_KAKAO_MAP_KEY', `  ${KEY}\n`)
    render(<Probe id="a" />)
    expect(sdkScripts()[0]!.src).toBe(sdkUrl(KEY))
  })

  it('AC-7916.1 여러 곳이 함께 써도 SDK는 한 번만 넣고 kakao.maps.load도 한 번만 부른다', async () => {
    const fake = makeFakeKakao()
    render(
      <>
        <Probe id="a" />
        <Probe id="b" />
        <Probe id="c" />
      </>,
    )
    expect(sdkScripts()).toHaveLength(1)
    await act(async () => finishSdk(fake))
    expect(fake.made.load).toBe(1)
    for (const id of ['a', 'b', 'c']) expect(screen.getByTestId(id).textContent).toBe('ready')
  })

  it('AC-7916.1 다 받은 뒤 새로 그려도 script를 또 넣지 않는다', async () => {
    const fake = makeFakeKakao()
    const first = render(<Probe id="a" />)
    await act(async () => finishSdk(fake))
    first.unmount()
    render(<Probe id="b" />)
    await act(async () => {})
    expect(sdkScripts()).toHaveLength(1)
    expect(fake.made.load).toBe(1)
    expect(screen.getByTestId('b').textContent).toBe('ready')
  })

  it.each(['', '   '])('AC-7916.1 열쇠가 비면(%j) SDK를 부르지 않고 no-key다', (key) => {
    vi.stubEnv('NEXT_PUBLIC_KAKAO_MAP_KEY', key)
    render(<Probe id="a" />)
    expect(sdkScripts()).toHaveLength(0)
    expect(document.querySelectorAll('script')).toHaveLength(0)
    expect(screen.getByTestId('a').textContent).toBe('no-key')
  })

  it('AC-7916.1 열쇠 환경 변수가 없어도 SDK를 부르지 않는다', () => {
    vi.stubEnv('NEXT_PUBLIC_KAKAO_MAP_KEY', undefined)
    render(<Probe id="a" />)
    expect(sdkScripts()).toHaveLength(0)
    expect(screen.getByTestId('a').textContent).toBe('no-key')
  })

  it('AC-7916.1 script 받기가 실패하면 failed(E-LOC-MAP)이고, 실패한 script는 지워 다음에 다시 부를 수 있다', async () => {
    const first = render(<Probe id="a" />)
    await act(async () => failSdk())
    expect(screen.getByTestId('a').textContent).toBe('failed')
    expect(sdkScripts()).toHaveLength(0)
    first.unmount()
    render(<Probe id="b" />)
    expect(sdkScripts()).toHaveLength(1)
    expect(screen.getByTestId('b').textContent).toBe('loading')
  })

  it('AC-7916.1 script는 받았는데 window.kakao가 없으면 failed다', async () => {
    render(<Probe id="a" />)
    await act(async () => {
      for (const s of sdkScripts()) s.dispatchEvent(new Event('load'))
    })
    expect(screen.getByTestId('a').textContent).toBe('failed')
  })

  it(`AC-7916.1 kakao.maps.load가 ${SDK_TIMEOUT_MS / 1000}초 안에 끝나지 않으면 failed다(지도 본체가 막힘)`, async () => {
    vi.useFakeTimers()
    const fake = makeFakeKakao()
    fake.maps.load = () => {
      fake.made.load += 1 // 부르기만 하고 끝내지 않는다
    }
    render(<Probe id="a" />)
    await act(async () => finishSdk(fake))
    expect(screen.getByTestId('a').textContent).toBe('loading')
    await act(async () => {
      vi.advanceTimersByTime(SDK_TIMEOUT_MS - 1)
    })
    expect(screen.getByTestId('a').textContent).toBe('loading')
    await act(async () => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.getByTestId('a').textContent).toBe('failed')
  })
})
