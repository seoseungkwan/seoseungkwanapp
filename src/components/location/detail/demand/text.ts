// 후보 자세히 › 정형외과 수요·교통·둘레 시설 묶음의 글자(spec location AC-7909.6, requirements '화면 글 기본값' 후보 자세히).
// 거리는 coords의 distText, 쉼표는 money의 commaText만 쓴다. 하루 예상 환자 수는 세지 않는다(사용자가 뺌 2026-11-22)
import { distText } from '@/lib/location/coords'
import { deptOf, deptRole } from '@/lib/location/depts'
import { FLOW_LIST_MAX, type FlowValue } from '@/lib/location/flow'
import { commaText } from '@/lib/location/money'
import type { DeptRule, Rival } from '@/types/location'

const BAND_LAST = 10 // 10세 나이대 11칸(0~9세 … 100세 이상)

const runName = (first: number, last: number) => (last === BAND_LAST ? `${first * 10}세 이상` : `${first * 10}~${last * 10 + 9}세`)

/** 셀 나이대(점수 설정 ScoreRule.bands, 칸 번호 0~10) → `40세 이상` · `20~39세` · `0~19세 · 60세 이상`. 고른 칸이 없으면 `고른 나이대` */
export function bandsLabel(bands: readonly number[]): string {
  const picked = [...new Set(bands)].filter((i) => Number.isInteger(i) && i >= 0 && i <= BAND_LAST).sort((a, b) => a - b)
  if (picked.length === 0) return '고른 나이대'
  if (picked.length === BAND_LAST + 1) return '모든 나이'
  const runs: [number, number][] = []
  for (const i of picked) {
    const run = runs.at(-1)
    if (run && run[1] === i - 1) run[1] = i
    else runs.push([i, i])
  }
  return runs.map(([a, b]) => runName(a, b)).join(' · ')
}

/** 10세 나이대 11칸 인구에서 고른 칸만 더한다(겹친 칸은 한 번, 틀린 칸은 뺌) */
export function pickedPeople(people: readonly number[], bands: readonly number[]): number {
  return [...new Set(bands)].reduce((sum, i) => sum + (Number.isFinite(people[i]) ? people[i]! : 0), 0)
}

const areaKm2 = (radiusM: number) => (Math.PI * radiusM * radiusM) / 1_000_000

/** 1km²당 밀도 = 인구 ÷ 범위(π × 반지름²) 버림 */
export function densityPerKm2(people: number, radiusM: number): number {
  return Math.floor(people / areaKm2(radiusM))
}

/** 범위 넓이 km² 소수 첫째 자리 버림(끝 .0 뺌): 1km → '3.1' */
export function areaKm2Text(radiusM: number): string {
  return String(Math.floor(areaKm2(radiusM) * 10) / 10)
}

/** 버림 정수 %. 전체가 0 이하면 null */
export function sharePct(part: number, total: number): number | null {
  return total > 0 ? Math.floor((part * 100) / total) : null
}

type Station = FlowValue['stations'][number]
type Stop = FlowValue['stops'][number]

/** `{역}({노선}) {거리} · 하루 {n}명`을 ` · `로 잇는다. 없으면 `범위 안에 역이 없어요` */
export function stationsText(stations: readonly Station[]): string {
  if (stations.length === 0) return '범위 안에 역이 없어요'
  return stations.map((s) => `${s.name}(${s.line}) ${distText(s.distM)} · 하루 ${commaText(s.perDay)}명`).join(' · ')
}

/** `정류장 {n}곳 합계 하루 {n}명`. 없으면 `범위 안에 정류장이 없어요` */
export function stopsText(stops: readonly Stop[]): string {
  if (stops.length === 0) return '범위 안에 정류장이 없어요'
  const sum = stops.reduce((a, s) => a + s.perDay, 0)
  return `정류장 ${commaText(stops.length)}곳 합계 하루 ${commaText(sum)}명`
}

/** 역·정류장 목록이 한도(가까운 60개)에 닿았으면 그 한도 수(capped 글), 아니면 null */
export function flowCapped(v: Pick<FlowValue, 'stations' | 'stops'>): number | null {
  return v.stations.length >= FLOW_LIST_MAX || v.stops.length >= FLOW_LIST_MAX ? FLOW_LIST_MAX : null
}

export const FLOW_NOTE = '교통카드 찍은 사람 수예요(걷는 사람 수와 달라요) · 현금으로 타거나 내릴 때 카드를 안 찍는 곳은 적게 잡혀요'

/** 묶음 머리 곁글 `범위 {거리} 안` */
export const rangeText = (radiusM: number) => `범위 ${distText(radiusM)} 안`

/** 교통·둘레 시설 '다른 과 의원' 수(AC-7921.6, design.md 18절): 범위 안 의원 가운데 대표 과목(deptOf, 지금 설정)이 둘레로 보기이고
 * 한의원이 아닌 곳. 경쟁·안 보기 과목은 세지 않는다 — 설정을 바꾸면 다시 부르지 않고 이 셈만 다시 한다 */
export function othersCount(clinics: readonly Pick<Rival, 'name' | 'depts' | 'distM'>[], rule: DeptRule, radiusM: number): number {
  return clinics.filter((c) => {
    if (c.distM > radiusM) return false
    const id = deptOf(c, rule)
    return id !== null && id !== 'korean' && deptRole(id, rule) === 'around'
  }).length
}

/** 다른 과 의원 줄 곁글(시안 그대로, 앞의 `{n}곳`은 굵게) */
export const OTHERS_NOTE = "· 과목마다 수는 위 '둘레 다른 과 의원'에 있어요"

/** 카카오 값(볼 때만)의 출처 줄 덧붙임 — 기준 날짜 대신(시안 카카오맵 출처 줄) */
export const KAKAO_FRESH = '열 때마다 새로 불러와요, 저장하지 않아요'
export const LOADING = '불러오는 중이에요'
