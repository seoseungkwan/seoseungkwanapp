import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isSourceId, sourceOf } from '@/lib/location/sources'
import type { QueryOf } from '@/types/location'
import { FLOOR_UNKNOWN, STORES_MAX, STORES_PAGE_ROWS, STORES_PAGES, STORES_URL, storeFloor, storesAdapter } from './stores'

// 상가(상권)정보 반경 안 가게(TASK-21, REQ-7904). 가짜 답은 fixtures/location/api/stores/ — 지어낸 시·도 '가상도' '가람구'(99110)의
// 지어낸 가게들이다. 바깥은 부르지 않는다(요청은 만들기만 하고, 답은 파일 글자를 읽는다)

const fixture = (name: string) => readFileSync(join(process.cwd(), 'fixtures/location/api/stores', name), 'utf8')
const TODAY = '2026-11-22'
const Q: QueryOf<'stores'> = { kind: 'stores', at: { lat: 37.510123, lng: 127.010456 }, r: 30 }
// 10쪽을 부르면 답도 10개다: 앞에 준 쪽 + 남은 쪽은 '자료 없음'(03) 답
const tenPages = (first: string[]) => [...first, ...Array.from({ length: STORES_PAGES - first.length }, () => fixture('nodata.json'))]
const parse = (texts: string[]) => storesAdapter.parse(texts, Q, TODAY)

type Item = Record<string, unknown>
const page1 = JSON.parse(fixture('page1.json')) as { header: Item; body: { items: Item[] } }
// 쪽 하나를 지어낸다: page1 첫 가게를 본떠 가게 번호·이름만 바꾼다
const bigPage = (page: number, rows: number, total: number) =>
  JSON.stringify({
    header: page1.header,
    body: {
      items: Array.from({ length: rows }, (_, i) => ({
        ...page1.body.items[0],
        bizesId: `FAKE${String(page * 1000 + i).padStart(16, '0')}`,
        bizesNm: `가람가게 ${page}-${i}`,
      })),
      numOfRows: STORES_PAGE_ROWS,
      pageNo: page,
      totalCount: total,
    },
  })

describe('AC-7904.1: 상가정보(stores) 요청', () => {
  it('AC-7904.1: 종류·열쇠·출처가 맞고 출처 id가 SOURCES에 있다(소상공인시장진흥공단 15012005)', () => {
    expect(storesAdapter.kind).toBe('stores')
    expect(storesAdapter.key).toBe('data')
    expect(storesAdapter.src).toBe('stores')
    expect(isSourceId(storesAdapter.src)).toBe(true)
    expect(sourceOf(storesAdapter.src)?.org).toBe('소상공인시장진흥공단')
    expect(sourceOf(storesAdapter.src)?.url).toContain('15012005')
  })

  it('AC-7904.1: 반경 안 가게를 100개씩 10쪽(1,000곳까지) 정해 둔 주소·칸으로 부르고 주소에 열쇠가 없다', () => {
    expect(STORES_URL).toBe('https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInRadius')
    expect(STORES_PAGE_ROWS).toBe(100)
    expect(STORES_PAGES).toBe(10)
    expect(STORES_MAX).toBe(1_000)
    const reqs = storesAdapter.requests(Q)
    expect(reqs).toHaveLength(10)
    reqs.forEach((req, i) => {
      const url = new URL(req.url)
      expect(`${url.origin}${url.pathname}`).toBe(STORES_URL)
      expect(Object.fromEntries(url.searchParams)).toEqual({
        radius: '30',
        cx: '127.010456',
        cy: '37.510123',
        numOfRows: '100',
        pageNo: String(i + 1),
        type: 'json',
      })
      expect(req.url.toLowerCase()).not.toContain('servicekey')
    })
  })

  it('AC-7904.1: 범위(r)와 점은 받은 그대로 싣는다 — 2,000m', () => {
    const [first] = storesAdapter.requests({ kind: 'stores', at: { lat: 37.5, lng: 127.03 }, r: 2_000 })
    const url = new URL(first.url)
    expect(url.searchParams.get('radius')).toBe('2000')
    expect(url.searchParams.get('cx')).toBe('127.03')
    expect(url.searchParams.get('cy')).toBe('37.5')
  })
})

describe('AC-7904.1: 상가정보(stores) 답 읽기', () => {
  it('AC-7904.1: 가게 이름·업종 대·중분류·층·점(소수 6자리)을 돌려주고, 기준 날짜는 자료의 기준 연월 말일이다', () => {
    const got = parse(tenPages([fixture('page1.json')]))
    expect(got).toEqual({
      ok: true,
      asOf: '2025-09-30',
      value: {
        stores: [
          { name: '가람분식', big: '음식', mid: '한식', floor: '1', at: { lat: 37.510123, lng: 127.010123 } },
          { name: '나래약국', big: '소매', mid: '의약·화장품 소매', floor: FLOOR_UNKNOWN, at: { lat: 37.5102, lng: 127.0102 } },
          { name: '다온헬스 누리점', big: '예술·스포츠', mid: '스포츠 서비스', floor: '지1', at: { lat: 37.5103, lng: 127.0103 } },
          { name: '라온필라테스', big: '예술·스포츠', mid: '스포츠 서비스', floor: '3', at: { lat: 37.5104, lng: 127.0104 } },
          { name: '마루미용실', big: '수리·개인', mid: '이용·미용', floor: FLOOR_UNKNOWN, at: { lat: 37.5105, lng: 127.0105 } },
        ],
        total: 8,
        capped: false,
        fitness: { gym: 1, pilates: 1 },
        pharmacies: 1,
      },
    })
  })

  it("AC-7904.1: 층 칸이 비었거나 읽을 수 없는 가게는 '층 모름'이고, 읽히는 층은 건물 층 이름(지1·1·옥탑) 모양이다", () => {
    expect(FLOOR_UNKNOWN).toBe('층 모름')
    for (const raw of ['', '   ', null, undefined, '0', '1~2', '가게층', -1, {}, 1.5]) expect(storeFloor(raw), String(raw)).toBe('층 모름')
    expect(storeFloor('1')).toBe('1')
    expect(storeFloor(' 2층 ')).toBe('2')
    expect(storeFloor('12F')).toBe('12')
    expect(storeFloor(3)).toBe('3')
    expect(storeFloor('B1')).toBe('지1')
    expect(storeFloor('b2')).toBe('지2')
    expect(storeFloor('지하1')).toBe('지1')
    expect(storeFloor('지하 2층')).toBe('지2')
    expect(storeFloor('지1')).toBe('지1')
    expect(storeFloor('옥탑')).toBe('옥탑')
    expect(storeFloor('옥상')).toBe('옥탑')
  })

  it('AC-7904.1: 헬스장·필라테스 업종은 따로 세고(헬스클럽·체력단련 포함), 약국 업종도 센다', () => {
    const got = parse(tenPages([fixture('page1.json'), fixture('page2.json')]))
    expect(got.ok).toBe(true)
    if (!got.ok) return
    const value = got.value as { fitness: unknown; pharmacies: unknown }
    expect(value.fitness).toEqual({ gym: 2, pilates: 1 })
    expect(value.pharmacies).toBe(1)
  })

  it('AC-7904.1: 여러 쪽을 차례대로 합치고 같은 가게 번호는 한 번만, 좌표가 없는 가게는 뺀다', () => {
    const got = parse(tenPages([fixture('page1.json'), fixture('page2.json')]))
    expect(got.ok).toBe(true)
    if (!got.ok) return
    const value = got.value as { stores: { name: string; floor: string }[]; total: number }
    expect(value.stores.map((s) => s.name)).toEqual(['가람분식', '나래약국', '다온헬스 누리점', '라온필라테스', '마루미용실', '사랑체력단련원'])
    expect(value.stores.at(-1)?.floor).toBe('지2')
    expect(value.total).toBe(8)
  })

  it('AC-7904.1: 자료에 기준 연월이 없으면 받은 한국 날짜(today)가 기준 날짜다', () => {
    const got = parse(tenPages([fixture('no-month.json')]))
    expect(got).toMatchObject({ ok: true, asOf: TODAY })
    if (!got.ok) return
    expect((got.value as { stores: unknown[] }).stores).toEqual([
      { name: '아라꽃집', big: '소매', mid: '식물 소매', floor: '층 모름', at: { lat: 37.5109, lng: 127.0109 } },
    ])
  })
})

describe('AC-7904.2: 빈 답 · 활용신청 안 됨 · 모양 틀림', () => {
  const EMPTY = { stores: [], total: 0, capped: false, fitness: { gym: 0, pilates: 0 }, pharmacies: 0 }

  it("AC-7904.2: 가게가 없으면('자료 없음' 03 · 빈 목록) 실패가 아니라 빈 목록이다", () => {
    expect(parse(tenPages([]))).toEqual({ ok: true, asOf: TODAY, value: EMPTY })
    expect(parse(tenPages([fixture('empty.json')]))).toEqual({ ok: true, asOf: '2025-09-30', value: EMPTY })
  })

  it('AC-7904.2: 미등록 열쇠 답(XML·JSON)은 어느 쪽에 있어도 not-applied다', () => {
    expect(parse(tenPages([fixture('not-registered.json')]))).toEqual({ ok: false, code: 'not-applied' })
    expect(parse(tenPages([fixture('page1.json'), fixture('not-registered.json')]))).toEqual({ ok: false, code: 'not-applied' })
  })

  it('AC-7904.2: 모양이 틀리면 failed다', () => {
    const header = { stdrYm: '202509', resultCode: '00' }
    const bad = [
      fixture('bad-shape.json'), // 목록 칸이 목록이 아님
      fixture('bad-request.json'), // 요청 칸 오류(10)
      '<html><body>점검 중</body></html>',
      '',
      'null',
      '[]',
      '{}',
      JSON.stringify({ header: { resultMsg: 'NORMAL SERVICE.' }, body: { items: [], totalCount: 0 } }), // 결과 번호 없음
      JSON.stringify({ header }), // 정상인데 몸통 없음
      JSON.stringify({ header, body: { items: [] } }), // 전체 수 없음
      JSON.stringify({ header, body: { items: ['가게'], totalCount: 1 } }), // 가게 줄이 객체가 아님
    ]
    for (const text of bad) expect(parse(tenPages([text])), text).toEqual({ ok: false, code: 'failed' })
    // 정상 쪽 뒤에 틀린 쪽이 와도 failed
    expect(parse(tenPages([fixture('page1.json'), fixture('bad-shape.json')]))).toEqual({ ok: false, code: 'failed' })
  })

  it('AC-7904.2: 받은 답이 하나도 없으면 failed다', () => {
    expect(parse([])).toEqual({ ok: false, code: 'failed' })
  })
})

describe('AC-7904.3: 쪽 한도 · capped', () => {
  it('AC-7904.3: 10쪽(1,000곳)보다 많으면 1,000곳과 capped: true다(전체 수는 자료가 말한 수)', () => {
    const texts = Array.from({ length: 10 }, (_, i) => bigPage(i + 1, 100, 2_500))
    const got = parse(texts)
    expect(got.ok).toBe(true)
    if (!got.ok) return
    const value = got.value as { stores: unknown[]; total: number; capped: boolean }
    expect(value.stores).toHaveLength(1_000)
    expect(value.total).toBe(2_500)
    expect(value.capped).toBe(true)
  })

  it('AC-7904.3: 딱 1,000곳이면 capped: false다', () => {
    const got = parse(Array.from({ length: 10 }, (_, i) => bigPage(i + 1, 100, 1_000)))
    expect(got).toMatchObject({ ok: true, value: { total: 1_000, capped: false } })
    if (got.ok) expect((got.value as { stores: unknown[] }).stores).toHaveLength(1_000)
  })

  it('AC-7904.3: 한 쪽에 100곳보다 많이 와도 1,000곳까지만 돌려주고 capped: true다', () => {
    const got = parse(Array.from({ length: 10 }, (_, i) => bigPage(i + 1, 120, 1_200)))
    expect(got).toMatchObject({ ok: true, value: { total: 1_200, capped: true } })
    if (got.ok) expect((got.value as { stores: unknown[] }).stores).toHaveLength(1_000)
  })

  it('AC-7904.3: 요청은 정해 둔 쪽 수(10)를 넘지 않는다 — 가장 넓은 범위에서도', () => {
    const reqs = storesAdapter.requests({ kind: 'stores', at: { lat: 37.5, lng: 127.0 }, r: 2_000 })
    expect(reqs).toHaveLength(STORES_PAGES)
    expect(reqs.map((r) => new URL(r.url).searchParams.get('pageNo'))).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'])
  })
})

describe('AC-7904.1: 서버 파일 규칙(소스 글자)', () => {
  const source = readFileSync(join(process.cwd(), 'src/app/api/ai/location/sources/stores.ts'), 'utf8').replace(/\r\n/g, '\n')
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1')

  it("AC-7904.1: 첫 줄이 import 'server-only'이고 console·supabase·fetch·메모리 보관이 없다", () => {
    expect(source.split('\n')[0]).toBe("import 'server-only'")
    expect(code).not.toMatch(/\bconsole\s*\./)
    expect(code).not.toMatch(/supabase/i)
    expect(code).not.toMatch(/\bfetch\s*\(/)
    expect(code).not.toMatch(/^(?:export\s+)?(?:let|var)\s/m)
    expect(code).not.toMatch(/\bnew\s+(?:Map|Set|WeakMap|WeakSet|WeakRef)\b/)
  })
})
