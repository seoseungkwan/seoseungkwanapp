// 시험용 가짜 카카오 지도 SDK(window.kakao). 바깥 사이트는 부르지 않는다 — jsdom은 <script src>를 받지 않고,
// 시험이 그 script에 load·error를 직접 보낸다(sdkScripts·finishSdk·failSdk). 만든 것·부른 것을 기록해 시험이 본다
import type { KakaoWindow } from './kakao'

export class FakeLatLng {
  constructor(
    readonly lat: number,
    readonly lng: number,
  ) {}
  getLat() {
    return this.lat
  }
  getLng() {
    return this.lng
  }
}

class FakeBounds {
  readonly points: FakeLatLng[] = []
  extend(p: FakeLatLng) {
    this.points.push(p)
  }
}

class FakeLayer<O> {
  map: unknown = null
  constructor(readonly options: O) {}
  setMap(map: unknown) {
    this.map = map
  }
}

export type FakeOverlayOptions = { position: FakeLatLng; content: HTMLElement; xAnchor?: number; yAnchor?: number; zIndex?: number }
export type FakeCircleOptions = { center: FakeLatLng; radius: number; strokeColor?: string; fillColor?: string }
export type FakePolygonOptions = { path: FakeLatLng[][]; fillColor?: string; strokeColor?: string; strokeWeight?: number }

type Listener = { target: object; type: string; fn: (e: { latLng: FakeLatLng }) => void }

export function makeFakeKakao(opts: { pano?: number | null; mapThrows?: boolean } = {}) {
  const made = {
    load: 0,
    maps: [] as FakeMap[],
    circles: [] as FakeLayer<FakeCircleOptions>[],
    overlays: [] as FakeLayer<FakeOverlayOptions>[],
    polygons: [] as FakeLayer<FakePolygonOptions>[],
    listeners: [] as Listener[],
    roadviews: [] as FakeRoadview[],
    panoAsks: [] as { at: FakeLatLng; radius: number; done: (id: number | null) => void }[],
  }

  class FakeMap {
    center: FakeLatLng
    level: number
    typeId = 1
    bounds: FakeBounds | null = null
    constructor(
      readonly container: HTMLElement,
      options: { center: FakeLatLng; level: number },
    ) {
      if (opts.mapThrows) throw new Error('fake map failed')
      this.center = options.center
      this.level = options.level
      made.maps.push(this)
    }
    setCenter(p: FakeLatLng) {
      this.center = p
    }
    setLevel(level: number) {
      this.level = level
    }
    setBounds(b: FakeBounds) {
      this.bounds = b
    }
    setMapTypeId(id: number) {
      this.typeId = id
    }
    relayout() {}
  }

  class FakeRoadview {
    pano: { id: number; at: FakeLatLng } | null = null
    constructor(readonly container: HTMLElement) {
      made.roadviews.push(this)
    }
    setPanoId(id: number, at: FakeLatLng) {
      this.pano = { id, at }
    }
  }

  const maps = {
    load(done: () => void) {
      made.load += 1
      done()
    },
    LatLng: FakeLatLng,
    LatLngBounds: FakeBounds,
    Map: FakeMap,
    Circle: class extends FakeLayer<FakeCircleOptions> {
      constructor(o: FakeCircleOptions) {
        super(o)
        made.circles.push(this)
      }
    },
    Polygon: class extends FakeLayer<FakePolygonOptions> {
      constructor(o: FakePolygonOptions) {
        super(o)
        made.polygons.push(this)
      }
    },
    CustomOverlay: class extends FakeLayer<FakeOverlayOptions> {
      constructor(o: FakeOverlayOptions) {
        super(o)
        made.overlays.push(this)
      }
      setPosition(p: FakeLatLng) {
        this.options.position = p
      }
    },
    MapTypeId: { ROADMAP: 1, SKYVIEW: 2, HYBRID: 3 },
    event: {
      addListener(target: object, type: string, fn: Listener['fn']) {
        made.listeners.push({ target, type, fn })
      },
      removeListener(target: object, type: string, fn: Listener['fn']) {
        const i = made.listeners.findIndex((l) => l.target === target && l.type === type && l.fn === fn)
        if (i >= 0) made.listeners.splice(i, 1)
      },
    },
    Roadview: FakeRoadview,
    RoadviewClient: class {
      getNearestPanoId(at: FakeLatLng, radius: number, done: (id: number | null) => void) {
        made.panoAsks.push({ at, radius, done })
        if (opts.pano !== undefined) done(opts.pano)
      }
    },
  }

  /** 지도·다각형에 걸린 click 듣기를 부른다 */
  const click = (target: object, at?: FakeLatLng) => {
    for (const l of made.listeners.filter((x) => x.target === target && x.type === 'click')) l.fn({ latLng: at ?? new FakeLatLng(0, 0) })
  }
  /** 지도·다각형에 걸린 type(mouseover·mousemove·mouseout 등) 듣기를 부른다 */
  const fire = (target: object, type: string, at?: FakeLatLng) => {
    for (const l of made.listeners.filter((x) => x.target === target && x.type === type)) l.fn({ latLng: at ?? new FakeLatLng(0, 0) })
  }
  const live = <O>(list: FakeLayer<O>[]) => list.filter((x) => x.map !== null)

  return { maps, made, click, fire, live }
}

export type FakeKakao = ReturnType<typeof makeFakeKakao>

const SDK_PREFIX = 'https://dapi.kakao.com/v2/maps/sdk.js'

export const sdkScripts = () =>
  [...document.querySelectorAll('script')].filter((s) => s.src.startsWith(SDK_PREFIX))

/** SDK script가 다 받아졌다고 알린다: window.kakao를 채우고 load를 보낸다 */
export function finishSdk(fake: FakeKakao) {
  ;(window as KakaoWindow).kakao = { maps: fake.maps as unknown as NonNullable<KakaoWindow['kakao']>['maps'] }
  for (const s of sdkScripts()) s.dispatchEvent(new Event('load'))
}

/** SDK script 받기가 실패했다고 알린다(사이트 등록 안 됨·CSP 막힘 등) */
export function failSdk() {
  for (const s of sdkScripts()) s.dispatchEvent(new Event('error'))
}

/** 시험 사이 정리: script·window.kakao를 지운다 */
export function resetSdk() {
  for (const s of document.querySelectorAll('script')) s.remove()
  delete (window as KakaoWindow).kakao
}
