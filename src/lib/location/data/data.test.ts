import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { BusFile, RailFile, TransitIndex } from '../flow'
import { dongOf, sggsTouching, type DongFile, type DongIndex } from '../regions'
import { sourceOf } from '../sources'

// 진짜 자료 파일(specs/location TASK-30, REQ-7918, design.md 2·5절).
// 원본은 저장소 밖에서 받아 저장소 밖 스크립트로 줄였다(원본·스크립트는 넣지 않음):
//   동 경계 = 국가데이터처 SGIS 행정구역 경계(15129688) · 소득 = 국세청 TASIS 4-2-15 · 산업단지 고용 = 15085886 ·
//   버스 정류장 = 국토교통부 전국 버스정류장 위치정보(15067528) · 도시철도역 = 전국도시철도역사정보표준데이터(15013205)
//   행정동 코드 = 행정안전부 지역별(행정동) 성별 연령별 주민등록 인구수(15097972) 2026-10-31 판의 행정기관코드
//   (경계는 2025-06-30이라 그 뒤 나뉘거나 다시 짠 동은 못 이은 동으로 남는다)
// 이 시험은 받은 자료가 바뀌어도(새 판·못 받은 원본) 모양·범위가 맞는지만 본다. 없는 시군구는 파일이 없거나 'none'이다
const ROOT = process.cwd()
const read = <T>(rel: string): T => JSON.parse(readFileSync(join(ROOT, rel), 'utf8')) as T
const DONGS_DIR = 'public/location/dongs'
const TRANSIT_DIR = 'public/location/transit'
const DATA_DIR = 'src/lib/location/data'

const YMD = /^\d{4}-\d{2}-\d{2}$/
// 파일 수백 개(동 경계 257·정류장 239)를 처음 읽는 시험은 PC가 바쁘면 5초를 넘을 수 있다
const HEAVY = 30_000
// 나라 안 점(design.md 4절 점 범위)
const inKorea = (lng: number, lat: number) =>
  Number.isFinite(lng) && Number.isFinite(lat) && lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132
const inBox = ([w, s, e, n]: number[], lng: number, lat: number, pad = 0) =>
  lng >= w - pad && lng <= e + pad && lat >= s - pad && lat <= n + pad

// 파일은 시험 안에서 읽는다(파일이 없으면 그 시험이 실패한다)
const once = <T>(make: () => T): (() => T) => {
  let v: { value: T } | null = null
  return () => (v ??= { value: make() }).value
}
const index = once(() => read<DongIndex>(`${DONGS_DIR}/index.json`))
const sggs = once(() => index().sidos.flatMap((sido) => sido.sggs))
const sggCodes = once(() => new Set(sggs().map((g) => g.code5)))
const dongFile = (code5: string) => read<DongFile>(`${DONGS_DIR}/${code5}.json`)
const allDongFiles = once(() => sggs().map((g) => ({ sgg: g, file: dongFile(g.code5) })))
const data = () => import('./index')

describe('AC-7918.1 동 경계 파일(public/location/dongs)', () => {
  it('AC-7918.1: index.json — 기준 날짜, 시도(코드 2자리·이름)마다 시군구(코드 5자리·이름·네모 범위)', () => {
    expect(index().asOf).toMatch(YMD)
    expect(index().sidos.length).toBeGreaterThanOrEqual(16) // 2026-07 광주·전남이 하나(전남광주통합특별시)가 되어 16
    const code2s = index().sidos.map((s) => s.code2)
    expect(new Set(code2s).size).toBe(code2s.length)
    for (const sido of index().sidos) {
      expect(sido.code2).toMatch(/^\d{2}$/)
      expect(sido.name.trim()).not.toBe('')
      expect(sido.sggs.length).toBeGreaterThan(0)
      for (const sgg of sido.sggs) {
        expect(sgg.code5).toMatch(/^\d{5}$/)
        expect(sgg.code5.startsWith(sido.code2), sgg.code5).toBe(true)
        expect(sgg.name.trim()).not.toBe('')
        const [w, s, e, n] = sgg.bbox
        expect(sgg.bbox).toHaveLength(4)
        expect(w < e && s < n, sgg.code5).toBe(true)
        expect(inKorea(w, s) && inKorea(e, n), sgg.code5).toBe(true)
      }
    }
    expect(sggCodes().size).toBe(sggs().length)
  })

  it('AC-7918.1: 시군구 수 — 목록의 시군구마다 <code5>.json이 하나씩 있고 남는 파일이 없다', () => {
    expect(sggs().length).toBeGreaterThanOrEqual(250)
    const files = readdirSync(join(ROOT, DONGS_DIR)).sort()
    expect(files).toEqual(['index.json', ...[...sggCodes()].map((c) => `${c}.json`)].sort())
  })

  it('AC-7918.1: 동마다 행정동 코드(시군구 코드로 시작, 겹침 없음)·이름·넓이 > 0·가운데·200점 안으로 줄인 경계', () => {
    // 점이 많아(50만여 개) 틀린 곳을 모아 한 번에 본다
    const bad: string[] = []
    let dongs = 0
    for (const { sgg, file } of allDongFiles()) {
      if (file.asOf !== index().asOf) bad.push(`${sgg.code5} 기준 날짜`)
      if (file.dongs.length === 0) bad.push(`${sgg.code5} 동 없음`)
      const codes = file.dongs.map((d) => d.code10)
      if (new Set(codes).size !== codes.length) bad.push(`${sgg.code5} 코드 겹침`)
      for (const dong of file.dongs) {
        const at = `${sgg.code5} ${dong.code10} ${dong.name}`
        dongs += 1
        if (!/^\d{10}$/.test(dong.code10) || !dong.code10.startsWith(sgg.code5)) bad.push(`${at} 코드`)
        if (dong.name.trim() === '') bad.push(`${at} 이름`)
        if (!Number.isInteger(dong.areaM2) || dong.areaM2 <= 0) bad.push(`${at} 넓이`)
        if (dong.center.length !== 2 || !inBox(sgg.bbox, dong.center[0], dong.center[1])) bad.push(`${at} 가운데`)
        if (dong.rings === null) continue
        let points = 0
        for (const ring of dong.rings) {
          const [first, last] = [ring[0], ring[ring.length - 1]]
          if (ring.length < 4 || first[0] !== last[0] || first[1] !== last[1]) bad.push(`${at} 닫히지 않은 고리`)
          if (ring.some(([lng, lat]) => !inBox(sgg.bbox, lng, lat))) bad.push(`${at} 네모 범위 밖 점`)
          points += ring.length
        }
        if (points > 200) bad.push(`${at} 점 ${points}개`)
      }
    }
    expect(bad).toEqual([])
    expect(dongs).toBeGreaterThanOrEqual(3500)
  }, HEAVY)

  it('AC-7918.1: 동 넓이를 모두 더하면 나라 넓이(약 10만 ㎢)와 1% 안으로 같다', () => {
    const km2 = allDongFiles().reduce((sum, { file }) => sum + file.dongs.reduce((s, d) => s + d.areaM2, 0), 0) / 1e6
    expect(km2).toBeGreaterThan(99_000)
    expect(km2).toBeLessThan(102_000)
  })

  it('AC-7918.1: 동은 행안부 행정동 코드로 잇고(코드 6째 자리 9 없음), 못 이은 동만 unmatched: true(코드 = 시군구 5 + 9 + 경계 3 + 0), 1% 아래', () => {
    // 행안부 행정동 코드(15097972, 2026-10-31)의 6째 자리는 2~8이라, 못 이은 동에 9를 써 진짜 코드와 겹치지 않게 한다
    const bad: string[] = []
    let matched = 0
    let unmatched = 0
    for (const { sgg, file } of allDongFiles()) {
      for (const dong of file.dongs) {
        const at = `${sgg.code5} ${dong.code10} ${dong.name}`
        if ('unmatched' in dong) {
          if (dong.unmatched !== true) bad.push(`${at} unmatched 값`)
          if (!/^\d{5}9\d{3}0$/.test(dong.code10)) bad.push(`${at} 못 이은 코드`)
          unmatched += 1
        } else {
          if (dong.code10[5] === '9') bad.push(`${at} 이은 코드`)
          matched += 1
        }
      }
    }
    expect(bad).toEqual([])
    const total = allDongFiles().reduce((sum, { file }) => sum + file.dongs.length, 0)
    expect(matched + unmatched).toBe(total)
    expect(unmatched * 100).toBeLessThan(total)
  })

  it('AC-7918.1: 시군구는 행안부 2026 체계 — 전남광주통합특별시(12)·인천 제물포·영종·서해·검단구·화성시 일반구 4곳, 옛 코드는 없다', () => {
    const sido12 = index().sidos.find((s) => s.code2 === '12')
    expect(sido12?.name).toBe('전남광주통합특별시')
    expect(sido12?.sggs.length).toBe(27) // 광주 구 5 + 전남 시·군 22
    expect(index().sidos.map((s) => s.code2)).not.toContain('29')
    expect(index().sidos.map((s) => s.code2)).not.toContain('46')
    const names = new Map(sggs().map((g) => [g.code5, g.name]))
    expect(names.get('12210')).toBe('동구') // 옛 광주 동구 29110
    expect(names.get('12110')).toBe('목포시') // 옛 전남 목포시 46110
    expect(['28125', '28155', '28275', '28290'].map((c) => names.get(c))).toEqual(['제물포구', '영종구', '서해구', '검단구'])
    expect(['41591', '41593', '41595', '41597'].map((c) => names.get(c))).toEqual([
      '화성시 만세구',
      '화성시 효행구',
      '화성시 병점구',
      '화성시 동탄구',
    ])
    for (const old of ['28110', '28140', '28260', '41590']) expect(names.has(old), old).toBe(false)
  })

  it('AC-7918.1: 실제 자리 — 시청·도청 점이 맞는 시군구(행안부 코드)·행정동에 든다(좌표 바꾸기·코드 잇기 확인)', () => {
    // code10은 행안부 15097972(2026-10-31)의 행정기관코드(연산제5동 = 경계 이름 연산5동)
    const places = [
      { at: { lat: 37.566295, lng: 126.977945 }, code5: '11140', dong: null }, // 서울시청 → 서울 중구
      { at: { lat: 35.179813, lng: 129.075017 }, code5: '26470', dong: ['2647069000', '연산5동'] }, // 부산시청 → 연제구
      { at: { lat: 36.350412, lng: 127.384548 }, code5: '30170', dong: ['3017063000', '둔산1동'] }, // 대전시청 → 대전 서구
      { at: { lat: 33.48892, lng: 126.498262 }, code5: '50110', dong: ['5011065000', '연동'] }, // 제주도청 → 제주시
      { at: { lat: 35.160032, lng: 126.851338 }, code5: '12240', dong: ['1224074500', '치평동'] }, // 광주시청 → 전남광주 서구
    ]
    for (const { at, code5, dong } of places) {
      expect(sggsTouching(index(), at, 50).map((g) => g.code5)).toContain(code5)
      const found = dongOf(at, dongFile(code5).dongs)
      expect(found?.code10.startsWith(code5), code5).toBe(true)
      expect(found && 'unmatched' in found, code5).toBe(false)
      if (dong) expect([found?.code10, found?.name]).toEqual(dong)
    }
  })
})

describe('AC-7918.2 시군구 평균 소득·산업단지 고용 인원(src/lib/location/data)', () => {
  it('AC-7918.2: income.json — 출처 id income·귀속 연도·기준 날짜, 시군구 코드 5자리마다 이름·평균 소득(원 정수)', async () => {
    const { INCOME } = await data()
    expect(INCOME.src).toBe('income')
    expect(sourceOf(INCOME.src)).toBeDefined()
    expect(Number.isInteger(INCOME.year) && INCOME.year >= 2020 && INCOME.year <= 2035).toBe(true)
    expect(INCOME.asOf).toMatch(YMD)
    const entries = Object.entries(INCOME.sggs)
    expect(entries.length).toBeGreaterThanOrEqual(200)
    for (const [code5, v] of entries) {
      expect(code5).toMatch(/^\d{5}$/)
      expect(sggCodes().has(code5), code5).toBe(true)
      expect(v.name.trim(), code5).not.toBe('')
      expect(Number.isInteger(v.won) && v.won >= 10_000_000 && v.won <= 200_000_000, code5).toBe(true)
    }
  })

  it('AC-7918.2: industry.json — 출처 id industry·기준 분기·기준 날짜, 시군구 코드 5자리마다 이름·고용 인원·단지 수', async () => {
    const { INDUSTRY } = await data()
    expect(INDUSTRY.src).toBe('industry')
    expect(sourceOf(INDUSTRY.src)).toBeDefined()
    expect(INDUSTRY.quarter).toMatch(/^\d{4}년 [1-4]분기$/)
    expect(INDUSTRY.asOf).toMatch(YMD)
    const entries = Object.entries(INDUSTRY.sggs)
    expect(entries.length).toBeGreaterThan(0)
    for (const [code5, v] of entries) {
      expect(code5).toMatch(/^\d{5}$/)
      expect(sggCodes().has(code5), code5).toBe(true)
      expect(v.name.trim(), code5).not.toBe('')
      expect(Number.isInteger(v.employees) && v.employees > 0, code5).toBe(true)
      expect(Number.isInteger(v.parks) && v.parks >= 1, code5).toBe(true)
    }
  })

  it('AC-7918.2: incomeOf·industryOf — 있는 시군구는 값·출처 id·기준 날짜, 없는 시군구는 none(자료 없음)', async () => {
    const { INCOME, INDUSTRY, incomeOf, industryOf } = await data()
    const [code5, v] = Object.entries(INCOME.sggs)[0]
    expect(incomeOf(code5)).toEqual({ ok: true, v: { sggName: v.name, won: v.won, year: INCOME.year }, src: 'income', asOf: INCOME.asOf })
    expect(incomeOf('99999')).toEqual({ ok: false, why: 'none', src: 'income' })
    expect(incomeOf('abc')).toEqual({ ok: false, why: 'none', src: 'income' })

    const [icode, iv] = Object.entries(INDUSTRY.sggs)[0]
    expect(industryOf(icode)).toEqual({
      ok: true,
      v: { sggName: iv.name, employees: iv.employees, parks: iv.parks, quarter: INDUSTRY.quarter },
      src: 'industry',
      asOf: INDUSTRY.asOf,
    })
    expect(industryOf('99999')).toEqual({ ok: false, why: 'none', src: 'industry' })
    const noPark = [...sggCodes()].find((c) => !(c in INDUSTRY.sggs))
    if (noPark) expect(industryOf(noPark)).toEqual({ ok: false, why: 'none', src: 'industry' })
    // 'constructor'처럼 객체에 원래 있는 이름도 자료 없음이다
    expect(incomeOf('constructor')).toEqual({ ok: false, why: 'none', src: 'income' })
  })

  it('AC-7918.2: 일반구(이름에 빈칸, 예: 수원시 장안구)는 같은 시의 다른 구와 소득·고용 값이 같다(원본이 시 단위)', async () => {
    const { INCOME, INDUSTRY } = await data()
    const byCity = new Map<string, string[]>()
    for (const sido of index().sidos)
      for (const sgg of sido.sggs) {
        if (!sgg.name.includes(' ')) continue
        const key = `${sido.code2} ${sgg.name.split(' ')[0]}`
        byCity.set(key, [...(byCity.get(key) ?? []), sgg.code5])
      }
    for (const codes of byCity.values()) {
      const incomes = codes.map((c) => JSON.stringify(INCOME.sggs[c] ?? null))
      expect(new Set(incomes).size, codes.join()).toBe(1)
      const jobs = codes.map((c) => JSON.stringify(INDUSTRY.sggs[c] ?? null))
      expect(new Set(jobs).size, codes.join()).toBe(1)
    }
  })

  it('AC-7918.2: 2026년에 바뀐 시군구 — 이름이 같은 옛 시·군 값을 새 코드에 적고(광주 동구 → 12210, 화성시 → 일반구 4곳), 다시 짠 인천 구 4곳은 none', async () => {
    // 소득(2024 귀속)·고용(2025-06-30)은 옛 체계 자료다. 옛 구를 나눈 새 구는 값을 나눌 수 없어 자료 없음으로 둔다
    const { INCOME, incomeOf, industryOf } = await data()
    expect(INCOME.sggs['12210']?.name).toBe('동구')
    expect(INCOME.sggs['12110']?.name).toBe('목포시')
    for (const c of ['41591', '41593', '41595', '41597']) expect(INCOME.sggs[c]?.name, c).toBe('화성시')
    for (const c of ['28125', '28155', '28275', '28290']) {
      expect(incomeOf(c), c).toEqual({ ok: false, why: 'none', src: 'income' })
      expect(industryOf(c), c).toEqual({ ok: false, why: 'none', src: 'industry' })
    }
    for (const old of ['29110', '46110', '28110', '41590']) expect(Object.hasOwn(INCOME.sggs, old), old).toBe(false)
  })

  it('AC-7918.2: 폴더에는 소득·산업단지 파일과 읽기·시험만 있다(하루 이용률 파일은 없음)', () => {
    expect(readdirSync(join(ROOT, DATA_DIR)).sort()).toEqual(['data.test.ts', 'income.json', 'index.ts', 'industry.json'])
  })
})

describe('AC-7918.5 정류장·역 좌표 파일(public/location/transit)', () => {
  const tindex = once(() => read<TransitIndex>(`${TRANSIT_DIR}/index.json`))

  it('AC-7918.5: index.json — 기준 날짜, 정류장 파일이 있는 시군구 목록(동 경계 목록 안, 차례대로, 겹침 없음)', () => {
    expect(tindex().asOf).toMatch(YMD)
    expect(tindex().sggs.length).toBeGreaterThan(0)
    expect([...tindex().sggs].sort()).toEqual(tindex().sggs)
    expect(new Set(tindex().sggs).size).toBe(tindex().sggs.length)
    for (const code5 of tindex().sggs) expect(sggCodes().has(code5), code5).toBe(true)
    expect(readdirSync(join(ROOT, TRANSIT_DIR)).sort()).toEqual(['bus', 'index.json', 'rail.json'])
    expect(readdirSync(join(ROOT, TRANSIT_DIR, 'bus')).sort()).toEqual(tindex().sggs.map((c) => `${c}.json`))
  })

  it('AC-7918.5: bus/<시군구>.json — 출처 id bus-stops, 정류장 번호·이름·ARS(없으면 null)·점(33~39·124~132), 동 경계로 나눠 그 시군구 안', () => {
    const bySgg = new Map(sggs().map((g) => [g.code5, g]))
    const bad: string[] = []
    for (const code5 of tindex().sggs) {
      const file = read<BusFile>(`${TRANSIT_DIR}/bus/${code5}.json`)
      expect(file.asOf, code5).toBe(tindex().asOf)
      expect(file.src, code5).toBe('bus-stops')
      expect(sourceOf(file.src)).toBeDefined()
      expect(file.stops.length, code5).toBeGreaterThan(0)
      const box = bySgg.get(code5)!.bbox
      for (const stop of file.stops) {
        const at = `${code5} ${stop.no} ${stop.name}`
        if (stop.no.trim() === '' || stop.name.trim() === '') bad.push(`${at} 번호·이름`)
        if (!(stop.ars === null || (typeof stop.ars === 'string' && stop.ars.trim() !== ''))) bad.push(`${at} ARS`)
        if (!inKorea(stop.lng, stop.lat)) bad.push(`${at} 점`)
        // 경계에 닿은 몇 곳은 가장 가까운 동에 넣어(300m 안) 네모 범위를 조금 넘을 수 있다
        else if (!inBox(box, stop.lng, stop.lat, 0.005)) bad.push(`${at} 시군구 밖`)
      }
    }
    expect(bad).toEqual([])
  }, HEAVY)

  it('AC-7918.5: rail.json — 출처 id rail-stations·기준 날짜, 전국 도시철도역 이름·노선·점(33~39·124~132), 이름+노선 겹침 없음', () => {
    const rail = read<RailFile>(`${TRANSIT_DIR}/rail.json`)
    expect(rail.asOf).toMatch(YMD)
    expect(rail.src).toBe('rail-stations')
    expect(sourceOf(rail.src)).toBeDefined()
    expect(rail.stations.length).toBeGreaterThanOrEqual(500)
    const keys = rail.stations.map((s) => `${s.name}|${s.line}`)
    expect(new Set(keys).size).toBe(keys.length)
    const bad = rail.stations.filter((s) => s.name.trim() === '' || s.line.trim() === '' || !inKorea(s.lng, s.lat))
    expect(bad).toEqual([])
  })
})

describe('AC-7918.1·AC-7918.2·AC-7918.5 크기', () => {
  const files = (dir: string): { rel: string; size: number }[] =>
    readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
      const rel = `${dir}/${e.name}`
      return e.isDirectory() ? files(rel) : [{ rel, size: statSync(join(ROOT, rel)).size }]
    })

  it('AC-7918.1·AC-7918.2·AC-7918.5: 파일 하나는 2MB 안, 동 경계·좌표·소득·산업단지 파일을 모두 합쳐 40MB 안', () => {
    const all = [...files('public/location'), ...files(DATA_DIR)]
    for (const f of all) expect(f.size, f.rel).toBeLessThanOrEqual(2 * 1024 * 1024)
    expect(all.reduce((sum, f) => sum + f.size, 0)).toBeLessThanOrEqual(40 * 1024 * 1024)
  })
})
