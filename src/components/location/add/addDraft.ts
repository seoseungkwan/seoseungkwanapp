import type { Point, RadiusM } from '@/types/location'

// 후보 더하기 판의 저장 몸통 만들기(spec location AC-7908.1·AC-7908.2, design.md 6·7절, ADR-044). 순수 함수만.
// 몸통 칸은 사용자가 고른 점 · 적은 이름 · 적은 주소 글 · 범위 · 적은 층 · 메모 · 고른 매물 id뿐이다.
// 카카오에서 받은 주소 글은 이 파일로 들어오지 않는다(판이 점만 넘긴다) — 시험이 이 파일 글자로 본다

/** 살필 범위 일곱 값(m, location_candidates.radius_m 제약과 같음) */
export const RADII: readonly RadiusM[] = [300, 500, 700, 1000, 1500, 2000, 3000]
/** 처음 범위 1,000m */
export const DEFAULT_RADIUS_INDEX = RADII.indexOf(1000)

// 글자 수 한도(DB 칸 제약과 같음): 이름 1~40 · 적은 주소 글 ≤ 100 · 층 ≤ 20 · 메모(location_notes.body) ≤ 500 · 주소 찾기 글 2~100(k-address)
export const NAME_MAX = 40
export const NOTE_MAX = 100
export const FLOOR_MAX = 20
export const MEMO_MAX = 500
export const QUERY_MIN = 2
export const QUERY_MAX = 100

/** 저장 콜백에 넘기는 몸통(ADR-044 — 카카오 글 없음). memo가 빈칸이 아니면 부르는 쪽이 그날 메모 한 줄로 저장한다 */
export type CandidateDraft = {
  name: string
  addressNote: string
  lat: number
  lng: number
  radiusM: RadiusM
  floorLabel: string
  memo: string
  listingId: string | null
}

// 글자 수는 DB(char_length)처럼 코드 포인트로 센다
const length = (text: string) => Array.from(text).length
const clip = (text: string, max: number) => Array.from(text).slice(0, max).join('')

/** 이름: 앞뒤 빈칸을 뺀 1~40자 */
export function nameOk(name: string): boolean {
  const n = length(name.trim())
  return n >= 1 && n <= NAME_MAX
}

/** 주소 찾기 글: 앞뒤 빈칸을 뺀 2~100자 */
export function queryOk(q: string): boolean {
  const n = length(q.trim())
  return n >= QUERY_MIN && n <= QUERY_MAX
}

/** 처음 이름: 사용자 글 조각(적은 주소 글·매물 이름·층)을 빈칸 하나로 잇고 40자에서 자른다 */
export function suggestName(...parts: readonly string[]): string {
  return clip(parts.map((p) => p.trim()).filter(Boolean).join(' '), NAME_MAX).trim()
}

/** 막대 칸(0~6) → 범위. 밖이면 처음 값 */
export function radiusAt(index: number): RadiusM {
  return RADII[index] ?? RADII[DEFAULT_RADIUS_INDEX]!
}

// 점 범위(location_candidates 제약과 같음): 위도 33~39 · 경도 124~132, 소수 6자리
const round6 = (x: number) => Math.round(x * 1e6) / 1e6
function pointOk(p: Point | null): p is Point {
  return p !== null && Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.lat >= 33 && p.lat <= 39 && p.lng >= 124 && p.lng <= 132
}

export type DraftFields = {
  point: Point | null
  name: string
  addressNote: string
  radiusM: RadiusM
  floorLabel: string
  memo: string
  listingId: string | null
}

/** 저장할 몸통. 점이 없거나 이름이 틀리면 null(저장 단추가 막힌다). 글은 앞뒤 빈칸을 빼고 칸 한도에서 자른다 */
export function makeDraft(f: DraftFields): CandidateDraft | null {
  if (!pointOk(f.point) || !nameOk(f.name) || !RADII.includes(f.radiusM)) return null
  return {
    name: f.name.trim(),
    addressNote: clip(f.addressNote.trim(), NOTE_MAX),
    lat: round6(f.point.lat),
    lng: round6(f.point.lng),
    radiusM: f.radiusM,
    floorLabel: clip(f.floorLabel.trim(), FLOOR_MAX),
    memo: clip(f.memo.trim(), MEMO_MAX),
    listingId: f.listingId,
  }
}
