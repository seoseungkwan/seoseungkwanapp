import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { formatCount, formatDelta, formatRate } from '@/components/charts/format'
import { MENU } from '@/components/shell/menu'
import { PREVIEW_TABS, SAMPLE_CLINIC, SAMPLE_KPIS, SAMPLE_SERIES, SAMPLE_WEEKS } from './sample'

// 미리보기 예시 자료 (b2b-redesign REQ-206 AC-206.1, design.md '미리보기', UI_GUIDE '미리보기').
// 값은 승인 시안 docs/mockups/b2b-redesign/parts.mjs의 WEEKS 8주다. 이 시험 안에 그대로 적고, 시안 파일과도 하나하나 맞춰 본다.
// KPI는 마지막 완료 주(10.19)와 그 전 주(10.12)에서 나온다. 증감 글자는 버림 규칙(format.ts) 때문에 시안과 둘이 다르다(+4.0% → +3.9%, 0.3%p → 0.2%p)

const ROOT = process.cwd()

const WEEKS: [key: string, range: string, newPatients: number, returning: number, note?: string][] = [
  ['9.7', '9월 7일 – 13일', 112, 524],
  ['9.14', '9월 14일 – 20일', 118, 538],
  ['9.21', '9월 21일 – 27일', 92, 431, '추석 연휴'],
  ['9.28', '9월 28일 – 10월 4일', 121, 556],
  ['10.5', '10월 5일 – 11일', 109, 521, '한글날'],
  ['10.12', '10월 12일 – 18일', 126, 571],
  ['10.19', '10월 19일 – 25일', 131, 583],
  ['10.26', '10월 26일 – 11월 1일', 98, 452],
]
const DONE = WEEKS.slice(0, 7) // 완료된 7주

type MockWeek = { key: string; range: string; n: number; r: number; note?: string; inprog?: boolean }
type MockKpi = { label: string; value: string; unit: string; diff: string; spark: number[] }
// 시안 파일을 그대로 불러온다(경로를 글자로 만들어 타입 검사가 시안 JS를 따라가지 않게 한다)
const mockup = async () =>
  (await import(/* @vite-ignore */ pathToFileURL(join(ROOT, 'docs/mockups/b2b-redesign/parts.mjs')).href)) as {
    WEEKS: MockWeek[]
    KPI: MockKpi[]
  }

const kpi = (label: string) => {
  const found = SAMPLE_KPIS.filter((k) => k.label === label)
  expect(found, label).toHaveLength(1)
  return found[0]!
}

describe('AC-206.1: 예시 8주 — 시안 parts.mjs의 WEEKS와 같다', () => {
  it('AC-206.1: 8주 키는 9.7 · 9.14 · 9.21 · 9.28 · 10.5 · 10.12 · 10.19 · 10.26이고 눈금 글자(label)도 같은 키다', () => {
    expect(SAMPLE_WEEKS.map((w) => w.key)).toEqual(WEEKS.map(([key]) => key))
    expect(SAMPLE_WEEKS.map((w) => w.label)).toEqual(WEEKS.map(([key]) => key))
  })

  it('AC-206.1: 신환 112·118·92·121·109·126·131·98, 재진 524·538·431·556·521·571·583·452 (계열 순서 신환 → 재진)', () => {
    expect(SAMPLE_WEEKS.map((w) => w.values)).toEqual(WEEKS.map(([, , n, r]) => [n, r]))
    expect(SAMPLE_SERIES).toEqual([
      { name: '신환', tone: 'accent' },
      { name: '재진', tone: 'chart-3' },
    ])
  })

  it('AC-206.1: 마지막 주(10.26)만 in-progress이고 나머지 7주는 complete다', () => {
    expect(SAMPLE_WEEKS.map((w) => w.state)).toEqual([...Array(7).fill('complete'), 'in-progress'])
  })

  it('AC-206.1: 메모는 "추석 연휴"(9.21)·"한글날"(10.5) 둘뿐이고, 기간 글자는 시안과 같다', () => {
    expect(SAMPLE_WEEKS.filter((w) => w.note).map((w) => [w.key, w.note])).toEqual([
      ['9.21', '추석 연휴'],
      ['10.5', '한글날'],
    ])
    expect(SAMPLE_WEEKS.map((w) => w.rangeLabel)).toEqual(WEEKS.map(([, range]) => range))
  })

  it('AC-206.1: 시안 parts.mjs의 WEEKS(키·기간·신환·재진·메모·집계 중)와 하나하나 같다', async () => {
    const { WEEKS: mock } = await mockup()
    expect(mock).toHaveLength(8)
    expect(
      SAMPLE_WEEKS.map((w) => ({ key: w.key, range: w.rangeLabel, n: w.values[0], r: w.values[1], note: w.note, inprog: w.state === 'in-progress' })),
    ).toEqual(mock.map((m) => ({ key: m.key, range: m.range, n: m.n, r: m.r, note: m.note, inprog: m.inprog === true })))
  })
})

describe('AC-206.1: KPI 4개 — 마지막 완료 주(10.19)와 그 전 주(10.12)에서 나온 값', () => {
  it('AC-206.1: 이름·차례는 환자 수 · 신환 · 재진 · 신환율이다', () => {
    expect(SAMPLE_KPIS.map((k) => k.label)).toEqual(['환자 수', '신환', '재진', '신환율'])
  })

  it('AC-206.1: 환자 수 714명, 그 전 주 697명 대비 +17명(pct 17/697×100)', () => {
    const k = kpi('환자 수')
    expect(k).toMatchObject({ value: 714, format: 'count', unit: '명', deltaUnit: '명' })
    expect(k.delta).toEqual({ kind: 'change', diff: 17, pct: expect.closeTo((17 / 697) * 100, 10) })
  })

  it('AC-206.1: 신환 131명, 그 전 주 126명 대비 +5명(pct 5/126×100)', () => {
    const k = kpi('신환')
    expect(k).toMatchObject({ value: 131, format: 'count', unit: '명', deltaUnit: '명' })
    expect(k.delta).toEqual({ kind: 'change', diff: 5, pct: expect.closeTo((5 / 126) * 100, 10) })
  })

  it('AC-206.1: 재진 583명, 그 전 주 571명 대비 +12명(pct 12/571×100)', () => {
    const k = kpi('재진')
    expect(k).toMatchObject({ value: 583, format: 'count', unit: '명', deltaUnit: '명' })
    expect(k.delta).toEqual({ kind: 'change', diff: 12, pct: expect.closeTo((12 / 571) * 100, 10) })
  })

  it('AC-206.1: 신환율 131/714(0~1 비율), 증감은 131/714 − 126/697(%p, pct 없음)', () => {
    const k = kpi('신환율')
    expect(k).toMatchObject({ format: 'percent', unit: '%', deltaUnit: '%p' })
    expect(k.value).toBeCloseTo(131 / 714, 12)
    expect(k.delta).toEqual({ kind: 'change', diff: expect.closeTo(131 / 714 - 126 / 697, 12), pct: null })
  })

  it('AC-206.1: 보이는 글자는 버림 규칙대로 714 · 17명 (+2.4%) · 131 · 5명 (+3.9%) · 583 · 12명 (+2.1%) · 18.3 · 0.2%p', () => {
    const shown = SAMPLE_KPIS.map((k) => [
      k.format === 'percent' ? formatRate(k.value!) : formatCount(k.value!),
      formatDelta(k.delta!, k.deltaUnit!).text,
    ])
    expect(shown).toEqual([
      ['714', '17명 (+2.4%)'],
      ['131', '5명 (+3.9%)'],
      ['583', '12명 (+2.1%)'],
      ['18.3', '0.2%p'],
    ])
  })

  it('AC-206.1: Sparkline은 완료된 7주 값이다(환자 수 = 신환 + 재진, 신환율 = 신환 / 환자 수)', () => {
    expect(kpi('환자 수').spark).toEqual(DONE.map(([, , n, r]) => n + r))
    expect(kpi('신환').spark).toEqual(DONE.map(([, , n]) => n))
    expect(kpi('재진').spark).toEqual(DONE.map(([, , , r]) => r))
    const rates = kpi('신환율').spark!
    expect(rates).toHaveLength(7)
    DONE.forEach(([, , n, r], i) => expect(rates[i], `${i}`).toBeCloseTo(n / (n + r), 12))
  })

  it('AC-206.1: 시안 parts.mjs의 KPI와 이름·값·단위·증감 크기·Sparkline 모양이 같다(증감 비율 글자만 버림 규칙으로 다르다)', async () => {
    const { KPI: mock } = await mockup()
    expect(SAMPLE_KPIS.map((k) => k.label)).toEqual(mock.map((m) => m.label))
    expect(SAMPLE_KPIS.map((k) => (k.format === 'percent' ? formatRate(k.value!) : formatCount(k.value!)))).toEqual(mock.map((m) => m.value))
    expect(SAMPLE_KPIS.map((k) => k.unit)).toEqual(mock.map((m) => m.unit))
    // 신환율 증감은 시안 반올림 0.3%p, 여기는 버림 0.2%p(design.md '시안과 다른 점')
    expect(SAMPLE_KPIS.slice(0, 3).map((k) => formatDelta(k.delta!, k.deltaUnit!).text.split(' ')[0])).toEqual(mock.slice(0, 3).map((m) => m.diff))
    // 같은 7주이고, 신환율 Sparkline은 0~1 비율(시안은 ×100) — 모양(최소~최대 사이 자리)은 같다
    expect(SAMPLE_KPIS.slice(0, 3).map((k) => k.spark)).toEqual(mock.slice(0, 3).map((m) => m.spark))
    kpi('신환율').spark!.forEach((v, i) => expect(v * 100, `${i}`).toBeCloseTo(mock[3]!.spark[i]!, 9))
  })
})

describe('AC-206.1·AC-421.2: 병원 이름·탭 (예시)', () => {
  it('AC-206.1: 병원 이름은 "예시정형외과의원"이다', () => {
    expect(SAMPLE_CLINIC).toBe('예시정형외과의원')
  })

  it('AC-421.2·AC-4110.1·AC-4907.1·AC-5801.4·AC-5905.10: 탭은 실제 앱 탭 14개 — PREVIEW_TABS가 MENU의 이름·순서와 같다(매출·급여·일일마감 같은 없는 탭 없음)', () => {
    expect(PREVIEW_TABS).toHaveLength(14)
    expect([...PREVIEW_TABS]).toEqual(MENU.map((item) => item.label))
    expect([...PREVIEW_TABS]).toEqual(['대시보드', '통계', '청구', '고시·공지', '환자', '업무일지', '수납일지', '예약', 'AI 리포트', '서식', '직원', '재고', '주소록', '설정'])
    expect(PREVIEW_TABS as readonly string[]).not.toContain('매출')
    expect(PREVIEW_TABS).not.toContain('급여')
    expect(readFileSync(join(ROOT, 'src/components/preview/sample.ts'), 'utf8'), '옛 탭 6개 목록은 없다').not.toMatch(/SAMPLE_TABS/)
  })

  it('AC-421.2: 미리보기 소스는 components/shell을 불러오지 않는다(탭 이름은 시험이 MENU와 견준다)', () => {
    for (const file of ['src/components/preview/sample.ts', 'src/components/preview/DashboardPreview.tsx']) {
      const imports = [...readFileSync(join(ROOT, file), 'utf8').matchAll(/^import\s[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1])
      expect(imports.length, file).toBeGreaterThan(0)
      for (const from of imports) expect(from, file).not.toMatch(/(?:^@\/components\/shell|\/shell)(?:\/|$)/)
    }
  })

  it('AC-206.1: 실제 자료를 읽지 않는다 — sample.ts는 타입만 불러온다(import type)', () => {
    const src = readFileSync(join(ROOT, 'src/components/preview/sample.ts'), 'utf8')
    const imports = [...src.matchAll(/^import\s.*$/gm)].map((m) => m[0])
    expect(imports.length).toBeGreaterThan(0)
    for (const line of imports) expect(line, line).toMatch(/^import type /)
  })
})
