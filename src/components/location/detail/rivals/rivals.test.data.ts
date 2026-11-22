// 경쟁 의원 묶음 넷(경쟁 의원 · 둘레 다른 과 의원 · 진료비 · 진료 시간 빈틈) 시험이 같이 쓰는 지어낸 그날 값(시안 후보 A와 비슷하게, 범위 1km).
// 이름은 모두 '예시…'로 지어냈다. Rival은 design.md 6절 새 모양(depts·at·address·detail) — detail은 모을 때 경쟁 과목이던 의원만
import { DEFAULT_DEPT_RULE, rivalShortText } from '@/lib/location/depts'
import type { HowCtx } from '@/lib/location/method'
import type { DeptId, DeptRule, Got, Rival, SnapshotValue } from '@/types/location'

export type Detail = NonNullable<Rival['detail']>
/** 받은 그날 값(ok) — `{ ...okRivals, v }`로 바꿔 써도 ok 모양 그대로 */
type Ok<T> = Extract<Got<T>, { ok: true }>
type Cell = [number, number] | null

const h = (hhmm: number) => Math.floor(hhmm / 100) * 60 + (hhmm % 100)
export const span = (from: number, to: number): [number, number] => [h(from), h(to)]
/** 월~금 같은 시간(over로 요일마다 바꿈) + 토 + 일 + 공휴일 */
export const weekOf = (weekday: Cell, sat: Cell = null, sun: Cell = null, over: Record<number, Cell> = {}): Cell[] => {
  const days: Cell[] = [weekday, weekday, weekday, weekday, weekday, sat, sun, null]
  for (const [d, c] of Object.entries(over)) days[Number(d)] = c
  return days
}

export const detail = (over: Partial<Detail> = {}): Detail => ({
  therapists: null,
  mri: null,
  ct: null,
  week: null,
  priced: true,
  eswt: null,
  manual: null,
  ...over,
})

export const clinic = (over: Partial<Rival> & { name: string; depts: DeptId[]; distM: number }): Rival => ({
  at: { lat: 37.5, lng: 127.0 },
  sameBuilding: over.distM <= 30,
  address: '',
  doctors: 1,
  openedYear: null,
  ...over,
})

// 후보 도로명(카카오 k-point, 볼 때만) — 같은 건물 = 도로명 + 건물 번호가 같음
export const ROAD = '서울 예시구 예시로 12'

// 가까운 차례. 범위 안 경쟁 의원(처음 설정) 7곳: 정형외과 5(바른의원은 찾은 과목 내과·정형외과 → 대표 과목 정형외과) · 신경외과 1 · 마취통증의학과 1
export const CLINICS: Rival[] = [
  clinic({ name: '예시가정형외과', depts: ['ortho'], distM: 20, address: '서울특별시 예시구 예시로 12, 2층 (가람동)', doctors: 2, openedYear: 2021,
    detail: detail({ therapists: 4, mri: true, ct: false, week: weekOf(span(900, 1830), span(900, 1300), null, { 2: span(900, 2000) }), eswt: 90000 }) }),
  clinic({ name: '예시하내과의원', depts: ['im'], distM: 25, address: '서울특별시 예시구 예시로 14 (가람동)', openedYear: 2012 }),
  clinic({ name: '예시거치과의원', depts: ['dental'], distM: 28, address: '서울특별시 예시구 예시로 12, 1층', openedYear: 2016 }),
  clinic({ name: '예시머피부과', depts: ['derm'], distM: 300, openedYear: 2020 }),
  clinic({ name: '예시나정형외과', depts: ['ortho'], distM: 350, openedYear: 2026,
    detail: detail({ therapists: 3, mri: false, ct: false, week: weekOf(span(900, 1800), span(900, 1300)), eswt: 70000 }) }),
  clinic({ name: '예시다한의원', depts: ['korean'], distM: 400, openedYear: 2018 }),
  clinic({ name: '예시너내과', depts: ['im'], distM: 500, openedYear: 2010 }),
  clinic({ name: '예시라마취통증의학과', depts: ['pain'], distM: 600, openedYear: 2019,
    detail: detail({ therapists: 2, mri: false, ct: false, week: weekOf(span(900, 1800), span(900, 1400), null, { 0: span(900, 2000), 3: span(900, 2000) }), eswt: 60000 }) }),
  clinic({ name: '예시더이비인후과', depts: ['ent'], distM: 650, openedYear: 2014 }),
  clinic({ name: '예시아신경외과', depts: ['ns'], distM: 700, openedYear: 2019, detail: detail({ therapists: 1, mri: false, ct: true }) }),
  clinic({ name: '예시바른의원', depts: ['im', 'ortho'], distM: 800, detail: detail() }),
  clinic({ name: '예시마정형외과', depts: ['ortho'], distM: 850, doctors: 3, openedYear: 2015,
    detail: detail({ therapists: 6, mri: true, ct: true, week: weekOf(span(830, 1800), span(830, 1300)), eswt: 100000 }) }),
  clinic({ name: '예시사정형외과', depts: ['ortho'], distM: 900, doctors: null, detail: detail({ priced: false }) }),
  clinic({ name: '예시러내과의원', depts: ['im'], distM: 1200 }),
  clinic({ name: '예시바재활의학과', depts: ['rehab'], distM: 1300, doctors: 2, openedYear: 2025,
    detail: detail({ therapists: 5, week: weekOf(span(700, 2300), span(700, 2300), span(700, 2300)), eswt: 200000 }) }),
]

export const okRivals: Ok<Rival[]> = { ok: true, v: CLINICS, src: 'hosp-list', asOf: '2026-11-15' }

export const HISTORY: SnapshotValue<'history'> = [
  { kind: 'close', name: '예시자정형외과', dept: '정형외과', on: '2025-05-12', distM: 700 },
  { kind: 'open', name: '예시나정형외과', dept: '정형외과', on: '2026-11-03', distM: 350 },
  { kind: 'close', name: '예시차의원', dept: '재활의학과', on: '2024-02-01', distM: 1500 },
  { kind: 'close', name: '예시카내과의원', dept: '내과', on: '2024-03-29', distM: 0 },
  { kind: 'open', name: '예시타내과', dept: '내과', on: '2025-01-01', distM: 400 },
]
export const okHistory: Ok<SnapshotValue<'history'>> = { ok: true, v: HISTORY, src: 'clinic-license', asOf: '2026-11-14' }
export const okPeople: Ok<{ total: number }> = { ok: true, v: { total: 48210 }, src: 'pop-age', asOf: '2026-10-31' }

export const RULE: DeptRule = { v: 1, rival: [...DEFAULT_DEPT_RULE.rival], hide: [] }
export const rule = (over: Partial<Pick<DeptRule, 'rival' | 'hide'>>): DeptRule => ({ ...RULE, ...over })
/** 경쟁 과목 0개 */
export const NO_RIVAL: DeptRule = { v: 1, rival: [], hide: [] }

// '이렇게 봤어요' 채울 값(method.ts HowCtx — 부르는 쪽이 그 후보 그날 값·설정으로 만들어 넘긴다)
const AS_OF: Readonly<Record<string, string>> = {
  'hosp-list': '2026-11-15',
  'hosp-detail': '2026-11-15',
  'hosp-hours': '2026-11-15',
  nonpay: '2026-11-15',
  'clinic-license': '2026-11-14',
}
export const CTX: HowCtx = { asOf: (src) => AS_OF[src] ?? null, radiusM: 1000, sggName: '예시구', rivalShort: rivalShortText(RULE) }
/** 묶음 넷이 받는 '이렇게 봤어요' props 기본값(접힘) */
export const HOW = { howCtx: CTX, howOpen: false, onHow: () => {} }

/** 카카오 30m 안 약국(볼 때만) — 같은 건물 하나 · 옆 건물 하나 · 30m 밖 하나 */
export const PHARMACIES = [
  { name: '예시하늘약국', distM: 10, road: '서울 예시구 예시로 12' },
  { name: '예시별약국', distM: 26, road: '서울 예시구 예시로 16' },
  { name: '예시먼약국', distM: 300, road: '서울 예시구 예시로 40' },
]

/** 경쟁 의원 n곳(정형외과, 가까운 차례) — 비급여 20곳 한도 시험 */
export const manyOrtho = (n: number, over: (i: number) => Partial<Detail> = () => ({})): Rival[] =>
  Array.from({ length: n }, (_, i) =>
    clinic({ name: `예시${i + 1}정형외과`, depts: ['ortho'], distM: 100 + i * 10, detail: detail({ eswt: 50000, ...over(i) }) }),
  )

export const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
