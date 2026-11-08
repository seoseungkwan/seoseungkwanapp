// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFitHeight } from './useFitHeight'

// 두 칸 높이 훅(memo-split AC-3101.1, design.md '두 칸 높이'). jsdom은 배치를 하지 않아 위 끝·창 크기·스크롤·ResizeObserver를 가짜로 둔다

/** 도구 줄 아래 두 칸 바깥 상자(split)의 높이를 훅으로 정한다. 훅이 준 값은 data-height에 적는다 */
function Box({ enabled = true }: { enabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const height = useFitHeight(ref, enabled)
  return (
    <div data-testid="column">
      <section data-testid="bar">도구 줄</section>
      <div ref={ref} data-testid="split" data-height={height ?? 'none'} />
    </div>
  )
}
const heightOf = () => screen.getByTestId('split').getAttribute('data-height')

/** 상자의 위 끝(창 기준)과 크기. 0×0이면 배치되지 않은 것이다 */
const at = { top: 0, width: 1200, height: 400 }
const WINDOW = ['innerWidth', 'innerHeight', 'scrollY'] as const
const saved = Object.fromEntries(WINDOW.map((name) => [name, Object.getOwnPropertyDescriptor(window, name)]))
const setWindow = (values: Partial<Record<(typeof WINDOW)[number], number>>) => {
  for (const [name, value] of Object.entries(values)) Object.defineProperty(window, name, { configurable: true, writable: true, value })
}
const resize = (values: Partial<Record<(typeof WINDOW)[number], number>>) =>
  act(async () => {
    setWindow(values)
    window.dispatchEvent(new Event('resize'))
  })

/** 가짜 ResizeObserver: 지켜보는 상자와 부를 함수를 적어 둔다 */
const observers: { fn: () => void; boxes: Element[]; disconnected: boolean }[] = []
class FakeResizeObserver {
  private entry: (typeof observers)[number]
  constructor(fn: () => void) {
    this.entry = { fn, boxes: [], disconnected: false }
    observers.push(this.entry)
  }
  observe(box: Element) {
    this.entry.boxes.push(box)
  }
  unobserve() {}
  disconnect() {
    this.entry.disconnected = true
  }
}

beforeEach(() => {
  Object.assign(at, { top: 0, width: 1200, height: 400 })
  observers.length = 0
  setWindow({ innerWidth: 1440, innerHeight: 900, scrollY: 0 })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ x: 0, y: at.top, top: at.top, left: 0, right: at.width, bottom: at.top + at.height, width: at.width, height: at.height, toJSON: () => ({}) }))
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.documentElement.style.fontSize = ''
  for (const name of WINDOW) {
    const descriptor = saved[name]
    if (descriptor) Object.defineProperty(window, name, descriptor)
    else Reflect.deleteProperty(window, name)
  }
})

describe('AC-3101.1 두 칸 높이(useFitHeight)', () => {
  it('AC-3101.1: 1024px 이상이면 창 높이 - 두 칸 위 끝(창 기준 위 끝 + 스크롤) - 16px를 px로 돌려준다', () => {
    at.top = 150
    setWindow({ scrollY: 100 })
    render(<Box />)
    expect(heightOf()).toBe(`${900 - 250 - 16}px`)
  })

  it('AC-3101.1: 1440×900 창에서 위 끝이 262px이면 622px라 두 칸 아래 끝이 창 아래 16px 위다', () => {
    at.top = 262
    render(<Box />)
    expect(heightOf()).toBe('622px')
  })

  it('AC-3101.1: 소수 px는 버려 아래 끝이 창 밖으로 나가지 않는다', () => {
    at.top = 262.6
    render(<Box />)
    expect(heightOf()).toBe('621px')
  })

  it('AC-3101.1: 가장 작게 20rem이다(뿌리 글자 크기로 셈)', () => {
    at.top = 300
    setWindow({ innerHeight: 500 })
    render(<Box />)
    expect(heightOf()).toBe('320px')
    cleanup()
    document.documentElement.style.fontSize = '20px'
    render(<Box />)
    expect(heightOf()).toBe('400px')
  })

  it('AC-3101.1: 창 크기가 바뀌면 다시 센다. 1024px보다 좁아지면 없고 다시 넓어지면 센다', async () => {
    at.top = 262
    render(<Box />)
    expect(heightOf()).toBe('622px')
    await resize({ innerHeight: 1000 })
    expect(heightOf()).toBe('722px')
    await resize({ innerWidth: 1023 })
    expect(heightOf()).toBe('none')
    await resize({ innerWidth: 1024, innerHeight: 800 })
    expect(heightOf()).toBe('522px')
  })

  it('AC-3101.1: 위 도구 줄 높이가 바뀌면(불러옴 줄이 생기는 등) ResizeObserver로 다시 센다', async () => {
    at.top = 262
    render(<Box />)
    expect(heightOf()).toBe('622px')
    const watching = observers.filter((observer) => !observer.disconnected)
    expect(watching).toHaveLength(1)
    expect(watching[0].boxes.some((box) => box.contains(screen.getByTestId('bar')))).toBe(true)
    at.top = 300
    await act(async () => watching[0].fn())
    expect(heightOf()).toBe('584px')
  })

  it('AC-3101.1: 1024px보다 좁으면 없다(위아래로 쌓인다)', () => {
    at.top = 262
    setWindow({ innerWidth: 1023 })
    render(<Box />)
    expect(heightOf()).toBe('none')
  })

  it('AC-3101.1: enabled가 아니면 없고 듣지도 않는다. 켜지면 센다', () => {
    at.top = 262
    const view = render(<Box enabled={false} />)
    expect(heightOf()).toBe('none')
    expect(observers).toHaveLength(0)
    view.rerender(<Box enabled />)
    expect(heightOf()).toBe('622px')
  })

  it('AC-3101.1: 잴 수 없으면(배치되지 않아 0×0) 없다. 그때는 부른 쪽의 예전 높이 class가 맡는다', () => {
    Object.assign(at, { top: 0, width: 0, height: 0 })
    render(<Box />)
    expect(heightOf()).toBe('none')
  })

  it('AC-3101.1: ResizeObserver가 없는 브라우저에서도 창 크기로 센다', async () => {
    vi.unstubAllGlobals()
    vi.stubGlobal('ResizeObserver', undefined)
    at.top = 262
    render(<Box />)
    expect(heightOf()).toBe('622px')
    await resize({ innerHeight: 1000 })
    expect(heightOf()).toBe('722px')
  })

  it('AC-3101.1: 내려가면 창 크기·ResizeObserver 듣기를 뗀다', () => {
    const remove = vi.spyOn(window, 'removeEventListener')
    at.top = 262
    const view = render(<Box />)
    view.unmount()
    expect(observers.every((observer) => observer.disconnected)).toBe(true)
    expect(remove.mock.calls.some(([type]) => type === 'resize')).toBe(true)
  })
})
