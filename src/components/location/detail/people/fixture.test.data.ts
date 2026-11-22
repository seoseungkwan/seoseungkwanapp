// 사는 사람·소득·앞으로 바뀔 것 시험용 그날 값(지어낸 이름만). 시험 파일만 부른다
import type { Snapshot } from '@/types/location'

// 10세 나이대 11칸: 0~19 = 1,700 · 20~39 = 2,500 · 40~59 = 3,100 · 60세 이상 = 3,220 (합 10,520)
export const BANDS = [800, 900, 1200, 1300, 1500, 1600, 1400, 1000, 600, 200, 20]

export const SNAP: Pick<
  Snapshot,
  'radiusM' | 'people' | 'trend' | 'apts' | 'presale' | 'income' | 'aptPrice' | 'bizPrice' | 'welfare'
> = {
  radiusM: 1000,
  people: { ok: true, v: { total: 10520, bands: BANDS, households: 4800, unmatched: 0 }, src: 'pop-age', asOf: '2026-10-31' },
  trend: {
    ok: true,
    v: [
      { ym: '2022-10', total: 10000 },
      { ym: '2023-10', total: 10100 },
      { ym: '2024-10', total: 10250 },
      { ym: '2025-10', total: 10400 },
      { ym: '2026-10', total: 10520 },
    ],
    src: 'pop-age',
    asOf: '2026-10-31',
  },
  // 가까운 법정동 차례(모으기가 가운데 점부터 법정동을 찾아 그 차례로 단지를 넣는다)
  apts: {
    ok: true,
    v: [
      { name: '예시마을', households: 640, builtYear: 2012, bdongName: '가온동' },
      { name: '예시힐', households: 1820, builtYear: 1998, bdongName: '가온동' },
      { name: '예시파크', households: 2400, builtYear: 2019, bdongName: '나래동' },
      { name: '예시숲', households: 640, builtYear: 2004, bdongName: '가온동' },
      { name: '예시들', households: 300, builtYear: null, bdongName: '나래동' },
    ],
    src: 'apt-list',
    asOf: '2026-11-15',
  },
  presale: {
    ok: true,
    v: [
      { name: '예시새빛', households: 1120, moveIn: '2027-03' },
      { name: '예시하늘 2차', households: 640, moveIn: '2028-09' },
    ],
    src: 'presale',
    asOf: '2026-11-15',
  },
  income: { ok: true, v: { sggName: '가상구', won: 45_120_000, year: 2024 }, src: 'income', asOf: '2024-12-31' },
  aptPrice: { ok: true, v: { perM2: 8_123_456, deals: 37 }, src: 'apt-trade', asOf: '2026-11-15' },
  bizPrice: { ok: true, v: { perM2: 5_000_000, deals: 4 }, src: 'biz-trade', asOf: '2026-11-15' },
  welfare: {
    ok: true,
    v: { sggName: '가상구', ym: '2025-12', medical: 9876, basic: 14321, nearPoor: 5432, population: 412_345, basis: null },
    src: 'welfare',
    asOf: '2025-12-31',
  },
}
