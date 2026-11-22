import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { oldGroupOf } from '@/lib/location/regions'
import { welfareRate } from '@/lib/location/snapshot'
import { BANDS, SNAP } from './fixture.test.data'
import { ageGroups, changeText, countShort, promoOrder, rateText, tenthsText, trendChange, welfareLines, welfareNote } from './text'

describe('AC-7909.2: 나이대 넷 · 60세 이상 비율', () => {
  it('AC-7909.2: 10세 나이대 11칸을 0~19·20~39·40~59·60세 이상 넷으로 묶고 % 는 버림 정수', () => {
    expect(ageGroups({ total: 10520, bands: BANDS })).toEqual([
      { label: '0~19세', count: 1700, pct: 16 },
      { label: '20~39세', count: 2500, pct: 23 },
      { label: '40~59세', count: 3100, pct: 29 },
      { label: '60세 이상', count: 3220, pct: 30 },
    ])
  })

  it('AC-7909.2: 사는 사람이 0이면 % 는 없음(null), 11칸이 아니면 묶지 않음', () => {
    expect(ageGroups({ total: 0, bands: Array(11).fill(0) })?.map((g) => g.pct)).toEqual([null, null, null, null])
    expect(ageGroups({ total: 100, bands: [1, 2, 3] })).toBeNull()
  })
})

describe('AC-7909.2: 4년 추세', () => {
  it('AC-7909.2: 처음 해(2022-10)와 마지막 해 사이 늘어난 비율을 소수 첫째 자리까지 버림', () => {
    expect(trendChange(SNAP.trend.ok ? SNAP.trend.v : [])).toEqual({ fromYm: '2022-10', toYm: '2026-10', years: 4, tenths: 52 })
  })

  it('AC-7909.2: 줄면 음수(0 쪽으로 버림), 차례가 섞여 와도 연월 차례로 본다', () => {
    const rows = [
      { ym: '2026-10', total: 9763 },
      { ym: '2022-10', total: 10000 },
    ]
    expect(trendChange(rows)).toEqual({ fromYm: '2022-10', toYm: '2026-10', years: 4, tenths: -23 })
  })

  it('AC-7909.2: 해가 하나뿐이거나 처음 값이 0이면 견주지 않는다', () => {
    expect(trendChange([{ ym: '2026-10', total: 100 }])).toBeNull()
    expect(
      trendChange([
        { ym: '2022-10', total: 0 },
        { ym: '2026-10', total: 100 },
      ]),
    ).toBeNull()
  })

  it('AC-7909.2: 글자 — +5.2% · −2.3% · +0% · 끝 .0은 뺀다', () => {
    expect(changeText(52)).toBe('+5.2%')
    expect(changeText(-23)).toBe('−2.3%')
    expect(changeText(0)).toBe('+0%')
    expect(changeText(40)).toBe('+4%')
    expect(tenthsText(12345)).toBe('1,234.5')
  })

  it('AC-7909.2: 막대 위 숫자 — 1만 넘으면 `{0.1만 버림}만`, 아니면 쉼표', () => {
    expect(countShort(18420)).toBe('1.8만')
    expect(countShort(10000)).toBe('1만')
    expect(countShort(9999)).toBe('9,999')
  })
})

describe('AC-7909.2: 홍보할 아파트 차례(가까움 · 세대 수 · 지은 해)', () => {
  it('AC-7909.2: 가까운 법정동 차례 → 세대가 많은 차례 → 오래된 차례(지은 해 모름은 뒤)', () => {
    const rows = promoOrder(SNAP.apts.ok ? SNAP.apts.v : [])
    expect(rows.map((r) => r.apt.name)).toEqual(['예시힐', '예시숲', '예시마을', '예시파크', '예시들'])
  })

  it('AC-7909.2: 까닭 — 가장 가까운 법정동이면 `가까워요`, 1,500세대 넘으면 `세대가 많아요`, 2005년까지 지었으면 `오래돼 어르신이 오래 살아요`(둘까지)', () => {
    const rows = promoOrder(SNAP.apts.ok ? SNAP.apts.v : [])
    expect(rows.map((r) => r.why)).toEqual([
      '가까워요 · 세대가 많아요',
      '가까워요 · 오래돼 어르신이 오래 살아요',
      '가까워요',
      '세대가 많아요',
      '범위 안 단지',
    ])
  })
})

describe('AC-7909.7: 의료급여·차상위 세 줄과 비율', () => {
  it('AC-7909.7: 의료급여(기초)·기초생활보장 합계·차상위 3종 합계와 주민등록 인구 대비 비율(소수 첫째 자리 버림 %)', () => {
    const v = SNAP.welfare.ok ? SNAP.welfare.v : null
    expect(welfareLines(v!)).toEqual([
      { label: '의료급여(기초) 수급권자', count: 9876, rate: 2.3 },
      { label: '기초생활보장 수급권자 합계', count: 14321, rate: 3.4 },
      { label: '차상위 3종 합계', count: 5432, rate: 1.3 },
    ])
  })

  it('AC-7909.7: 비율은 snapshot.ts welfareRate 한 곳으로 센다 — 줄마다 welfareRate와 같은 값', () => {
    for (const population of [412_345, 7, 1_000_000, 3]) {
      const v = { sggName: '가상구', ym: '2025-12', medical: 9876, basic: 14321, nearPoor: 5432, population, basis: null }
      const [medical, basic, nearPoor] = welfareLines(v).map((l) => l.rate)
      expect(medical).toBe(welfareRate({ medical: 9876, nearPoor: 0, population }))
      expect(basic).toBe(welfareRate({ medical: 14321, nearPoor: 0, population }))
      expect(nearPoor).toBe(welfareRate({ medical: 0, nearPoor: 5432, population }))
    }
  })

  it('AC-7909.7: text.ts에는 비율 셈이 따로 없다(welfareRate를 부른다)', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/location/detail/people/text.ts'), 'utf8')
    expect(src).toMatch(/import \{[^}]*\bwelfareRate\b[^}]*\} from '@\/lib\/location\/snapshot'/)
    expect(src).not.toMatch(/\/ ?v\.population|population\s*>\s*0/)
  })

  it('AC-7909.7: 인구가 없거나 0이면 비율은 없고 글자는 `–`', () => {
    for (const population of [null, 0]) {
      const lines = welfareLines({ sggName: '가상구', ym: '2025-12', medical: 10, basic: 20, nearPoor: 30, population, basis: null })
      expect(lines.map((l) => l.rate)).toEqual([null, null, null])
    }
    expect(rateText(null)).toBe('–')
    expect(rateText(2.3)).toBe('2.3%')
    expect(rateText(3)).toBe('3%')
    expect(rateText(0)).toBe('0%')
    expect(rateText(welfareRate({ medical: 1, nearPoor: 0, population: 3 }))).toBe('33.3%')
  })

  it('AC-7909.7: 머리 글 — 옛 구 묶음 값이 아니면 `시군구 기준 · 기초생활보장 의료급여 기준 · 겹칠 수 있어요`', () => {
    expect(welfareNote(null)).toBe('시군구 기준 · 기초생활보장 의료급여 기준 · 겹칠 수 있어요')
    expect(welfareNote('')).toBe('시군구 기준 · 기초생활보장 의료급여 기준 · 겹칠 수 있어요')
  })

  it('AC-7909.7: 머리 글 — 옛 구 묶음 값(basis)이면 끝에 ` · 옛 {구} 기준`(design.md 5절 표 셋)', () => {
    const head = '시군구 기준 · 기초생활보장 의료급여 기준 · 겹칠 수 있어요'
    expect(welfareNote(oldGroupOf('28125')!.label)).toBe(`${head} · 옛 중구·동구 기준`)
    expect(welfareNote(oldGroupOf('28155')!.label)).toBe(`${head} · 옛 중구·동구 기준`)
    expect(welfareNote(oldGroupOf('28275')!.label)).toBe(`${head} · 옛 서구 기준`)
    expect(welfareNote(oldGroupOf('28290')!.label)).toBe(`${head} · 옛 서구 기준`)
    expect(welfareNote(oldGroupOf('41593')!.label)).toBe(`${head} · 옛 화성시 기준`)
    // '옛'이 빠진 이름이 와도 글 모양은 같다
    expect(welfareNote('중구·동구')).toBe(`${head} · 옛 중구·동구 기준`)
  })
})
