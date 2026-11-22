import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { samplePoints } from './coords'
import {
  dongOf,
  dongShares,
  landCodes,
  rangeValue,
  sggOf,
  sggsTouching,
  type Dong,
  type DongFile,
  type DongIndex,
} from './regions'

// 지역 찾기·동 몫·코드(specs/location REQ-7905, design.md 5절)
// 견본 fixtures/location/dongs/: 지어낸 시·도 '가상도'의 '가람구'(99110) 동 셋과 index.json. 동은 경도·위도 네모로 그렸다
//   하늘동: 127.000~127.010 × 37.500~37.520 + 떨어진 조각 127.025~127.030 × 37.500~37.505
//   바다동: 127.010~127.025 × 37.500~37.520, 가운데 구멍 127.015~127.020 × 37.508~37.512
//   별빛동: 바다동 구멍 자리
//   127.025~127.030 × 37.505~37.520은 어느 동도 아니다(경계 밖)
const fixture = <T>(name: string): T =>
  JSON.parse(readFileSync(new URL(`../../../fixtures/location/dongs/${name}`, import.meta.url), 'utf8')) as T
const INDEX = fixture<DongIndex>('index.json')
const GARAM = fixture<DongFile>('99110.json')
const DONGS = GARAM.dongs
const HANEUL = '9911051000'
const BADA = '9911052000'
const BYEOL = '9911053000'
const areaOf = (code10: string) => DONGS.find((d) => d.code10 === code10)!.areaM2

describe('AC-7905.2 동 경계 견본', () => {
  it('AC-7905.2: 견본은 design.md 5절 모양이다(index의 시군구 네모, 동마다 행정동 코드 10자리·넓이·가운데·경계)', () => {
    expect(INDEX.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    for (const sido of INDEX.sidos) {
      expect(sido.code2).toMatch(/^\d{2}$/)
      for (const sgg of sido.sggs) {
        expect(sgg.code5.startsWith(sido.code2)).toBe(true)
        expect(sgg.bbox).toHaveLength(4)
      }
    }
    expect(DONGS.map((d) => d.name)).toEqual(['하늘동', '바다동', '별빛동'])
    for (const d of DONGS) {
      expect(d.code10).toMatch(/^99110\d{5}$/)
      expect(d.areaM2).toBeGreaterThan(0)
      expect(d.center).toHaveLength(2)
      expect(dongOf({ lat: d.center[1], lng: d.center[0] }, DONGS)?.code10).toBe(d.code10)
    }
  })
})

describe('AC-7905.2 dongOf', () => {
  it('AC-7905.2: 점마다 들어 있는 행정동을 찾는다(떨어진 조각·구멍 안 동 포함)', () => {
    expect(dongOf({ lat: 37.51, lng: 127.003 }, DONGS)?.code10).toBe(HANEUL)
    expect(dongOf({ lat: 37.5025, lng: 127.0275 }, DONGS)?.code10).toBe(HANEUL) // 떨어진 조각
    expect(dongOf({ lat: 37.515, lng: 127.012 }, DONGS)?.code10).toBe(BADA)
    expect(dongOf({ lat: 37.51, lng: 127.0175 }, DONGS)?.code10).toBe(BYEOL) // 바다동 구멍 안
  })

  it('AC-7905.2: 경계 밖 점은 없음(null)이다', () => {
    expect(dongOf({ lat: 37.51, lng: 127.0275 }, DONGS)).toBeNull()
    expect(dongOf({ lat: 37.53, lng: 127.005 }, DONGS)).toBeNull()
    expect(dongOf({ lat: 37.51, lng: 127.003 }, [])).toBeNull()
  })

  it('AC-7905.2: 경계가 없는 동(rings: null)은 고르지 않는다', () => {
    const noRings: Dong = { code10: '9911059000', name: '구름동', areaM2: 1000, center: [127.003, 37.51], rings: null, unmatched: true }
    expect(dongOf({ lat: 37.51, lng: 127.003 }, [noRings])).toBeNull()
    expect(dongOf({ lat: 37.51, lng: 127.003 }, [noRings, ...DONGS])?.code10).toBe(HANEUL)
  })
})

describe('AC-7905.2 sggsTouching', () => {
  const codes = (c: { lat: number; lng: number }, r: number) => sggsTouching(INDEX, c, r).map((s) => s.code5)

  it('AC-7905.2: 범위 원을 감싼 네모와 겹치는 시군구만 고른다', () => {
    expect(codes({ lat: 37.51, lng: 127.005 }, 300)).toEqual(['99110'])
    expect(codes({ lat: 37.51, lng: 127.027 }, 500)).toEqual(['99110', '99120'])
    expect(codes({ lat: 37.51, lng: 127.045 }, 300)).toEqual(['99120'])
    expect(codes({ lat: 36.05, lng: 128.05 }, 1000)).toEqual(['98110'])
    expect(codes({ lat: 35.0, lng: 126.0 }, 3000)).toEqual([])
  })

  it('AC-7905.2: 고른 시군구는 index 줄 그대로(이름·네모)다', () => {
    expect(sggsTouching(INDEX, { lat: 37.51, lng: 127.005 }, 300)).toEqual([
      { code5: '99110', name: '가람구', bbox: [127.0, 37.5, 127.03, 37.52] },
    ])
  })
})

describe('AC-7905.3 dongShares', () => {
  it('AC-7905.3: 동 몫 = min(1, 그 동 점 수 × 점 하나 넓이 ÷ 동 넓이), 경계 밖 점은 어느 동에도 넣지 않는다', () => {
    const points = [
      { lat: 37.51, lng: 127.003 }, // 하늘동
      { lat: 37.512, lng: 127.006 }, // 하늘동
      { lat: 37.51, lng: 127.0175 }, // 별빛동
      { lat: 37.51, lng: 127.0275 }, // 경계 밖
    ]
    const r = 500
    const unit = (Math.PI * r * r) / points.length // 점 하나 넓이 = πr² ÷ 점 수
    const shares = dongShares(points, DONGS, r)
    expect(shares.map((s) => s.code10)).toEqual([HANEUL, BYEOL])
    expect(shares[0].share).toBeCloseTo((2 * unit) / areaOf(HANEUL), 12)
    // 별빛동: 196,349㎡ ÷ 196,160㎡ > 1 → 1
    expect((1 * unit) / areaOf(BYEOL)).toBeGreaterThan(1)
    expect(shares[1].share).toBe(1)
  })

  it('AC-7905.3: 표본 점을 넣으면 점 수 합이 경계 안 점 수와 같고 몫은 0~1이다', () => {
    const c = { lat: 37.51, lng: 127.0175 }
    for (const r of [500, 1000]) {
      const pts = samplePoints(c, r)
      const unit = (Math.PI * r * r) / pts.length
      const shares = dongShares(pts, DONGS, r)
      const counted = new Map<string, number>()
      for (const p of pts) {
        const d = dongOf(p, DONGS)
        if (d) counted.set(d.code10, (counted.get(d.code10) ?? 0) + 1)
      }
      expect(shares.map((s) => s.code10).sort()).toEqual([...counted.keys()].sort())
      for (const s of shares) {
        expect(s.share).toBeGreaterThan(0)
        expect(s.share).toBeLessThanOrEqual(1)
        expect(s.share).toBeCloseTo(Math.min(1, (counted.get(s.code10)! * unit) / areaOf(s.code10)), 12)
      }
    }
  })

  it('AC-7905.3: 점이 하나도 동 안에 없으면 빈 목록이다', () => {
    expect(dongShares([{ lat: 37.51, lng: 127.0275 }], DONGS, 300)).toEqual([])
    expect(dongShares([], DONGS, 300)).toEqual([])
  })
})

describe('AC-7905.3 rangeValue', () => {
  it('AC-7905.3: 범위 값 = Σ(동 값 × 몫)을 버린 정수다', () => {
    const shares = [
      { code10: HANEUL, share: 0.5 },
      { code10: BYEOL, share: 0.25 },
    ]
    // 1,001 × 0.5 + 1 × 0.25 = 500.75 → 500(반올림이면 501)
    expect(rangeValue(shares, { [HANEUL]: 1001, [BYEOL]: 1 })).toBe(500)
    expect(rangeValue(shares, { [HANEUL]: 1000, [BYEOL]: 400 })).toBe(600)
  })

  it('AC-7905.3: 값이 없는 동은 빼고 더한다', () => {
    const shares = [
      { code10: HANEUL, share: 0.5 },
      { code10: BADA, share: 1 },
    ]
    expect(rangeValue(shares, { [BADA]: 321 })).toBe(321)
    expect(rangeValue(shares, {})).toBe(0)
    expect(rangeValue([], { [BADA]: 321 })).toBe(0)
  })

  it('AC-7905.3: 소수 계산의 작은 어긋남으로 한 명이 모자라지 않는다', () => {
    // 자바스크립트에서 0.29 × 100 = 28.999999999999996, 0.29 × 100 + 0.57 × 100 = 85.99999999999999
    expect(rangeValue([{ code10: 'a', share: 0.29 }], { a: 100 })).toBe(29)
    expect(rangeValue([{ code10: 'a', share: 0.29 }, { code10: 'b', share: 0.57 }], { a: 100, b: 100 })).toBe(86)
    // 그래도 진짜 소수는 버린다: 0.2899 × 100 = 28.99 → 28
    expect(rangeValue([{ code10: 'a', share: 0.2899 }], { a: 100 })).toBe(28)
  })
})

describe('AC-7905.4 코드 만들기', () => {
  it('AC-7905.4: 시군구 5자리 = 행정동·법정동 코드 앞 5자리', () => {
    expect(sggOf('9911051000')).toBe('99110')
    expect(sggOf('9911010100')).toBe('99110')
    expect(sggOf('99110')).toBeNull()
    expect(sggOf('99110a1000')).toBeNull()
  })

  it('AC-7905.4: 건축물대장 열쇠(시군구 5·법정동 5·번 4·지 4·대지 구분)와 PNU 19자리', () => {
    expect(landCodes({ bcode: '9911010100', main: 123, sub: 4, san: false })).toEqual({
      sigunguCd: '99110',
      bjdongCd: '10100',
      bun: '0123',
      ji: '0004',
      platGbCd: '0',
      pnu: '9911010100101230004',
    })
  })

  it('AC-7905.4: 산이면 대지 구분 1·PNU 열한째 자리 2, 부번이 없으면 0000', () => {
    const got = landCodes({ bcode: '9911010100', main: 7, sub: 0, san: true })!
    expect(got.platGbCd).toBe('1')
    expect(got.ji).toBe('0000')
    expect(got.pnu).toBe('9911010100200070000')
    expect(got.pnu).toHaveLength(19)
    expect(landCodes({ bcode: '9911010100', main: 9999, sub: 9999, san: false })!.pnu).toBe('9911010100199999999')
  })

  it('AC-7905.4: 법정동 코드가 10자리 숫자가 아니거나 번지가 0~9,999 정수가 아니면 null', () => {
    expect(landCodes({ bcode: '99110101', main: 1, sub: 0, san: false })).toBeNull()
    expect(landCodes({ bcode: '991101010a', main: 1, sub: 0, san: false })).toBeNull()
    expect(landCodes({ bcode: '9911010100', main: 10000, sub: 0, san: false })).toBeNull()
    expect(landCodes({ bcode: '9911010100', main: -1, sub: 0, san: false })).toBeNull()
    expect(landCodes({ bcode: '9911010100', main: 1.5, sub: 0, san: false })).toBeNull()
    expect(landCodes({ bcode: '9911010100', main: 1, sub: Number.NaN, san: false })).toBeNull()
  })
})
