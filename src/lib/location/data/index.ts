import type { Snapshot } from '@/types/location'
import income from './income.json'
import industry from './industry.json'

// 파일로 받아 앱에 둔 시군구 값(specs/location AC-7918.2, design.md 2·4절). 순수 함수만 둔다(부르기 없음).
//  - income.json: 국세청 국세통계 4-2-15 시·군·구별 근로소득 연말정산 신고현황(주소지). 평균 = 총급여 금액 ÷ 인원(원 미만 버림),
//    `year` = 귀속 연도. 동 단위 자료는 없다. `sidos` = 시·도 평균(같은 표의 시·도 소계 줄: 합계 금액 ÷ 합계 인원, 원 미만 버림,
//    키는 동 경계 목록의 시도 코드 2자리·이름 — 전남광주통합특별시는 옛 광주·전남 소계를 더해 나눈다, 사용자 2026-11-23)
//  - industry.json: 한국산업단지공단 전국산업단지현황통계_일반(15085886). 단지 소재 시·군으로 묶은 고용 인원 합·단지 수(고용이 공표된 단지만),
//    `quarter` = 기준 분기. 단지 위치가 없어 시군구 단위다
// 키는 동 경계 목록(public/location/dongs/index.json)의 시군구 코드 5자리(행안부 2026 체계)다. 일반구(수원시 장안구 등)는 원본이 시 단위라 그 시 값을 그대로 적었다.
// 두 원본은 옛 체계라 이름이 같은 옛 시·군 값을 새 코드에 적었고(광주 동구 → 12210, 화성시 → 일반구 4곳), 옛 구를 나눠 새로 짠
// 인천 제물포·영종·서해·검단구는 값을 나눌 수 없어 적지 않았다(자료 없음).
// 파일은 사람이 새 판을 받아 저장소 밖 스크립트로 다시 만든다(하루 이용률 파일은 두지 않음)

export type IncomeFile = {
  src: 'income'
  year: number
  asOf: string
  sggs: Record<string, { name: string; won: number }>
  sidos: Record<string, { name: string; won: number }>
}
export type IndustryFile = {
  src: 'industry'
  quarter: string
  asOf: string
  sggs: Record<string, { name: string; employees: number; parks: number }>
}

export const INCOME = income as IncomeFile
export const INDUSTRY = industry as IndustryFile

// 객체에 원래 있는 이름('constructor' 등)은 자료가 아니다
const own = <T>(table: Record<string, T>, code: string, shape = /^\d{5}$/): T | undefined =>
  shape.test(code) && Object.hasOwn(table, code) ? table[code] : undefined

/** 시군구 평균 소득(그날 값 income 칸)과 그 시·도 평균(시군구 코드 앞 2자리, 없으면 null). 그 시군구 자료가 없으면 none(`이 시·군·구의 소득 자료가 없어요`) */
export function incomeOf(code5: string): Snapshot['income'] {
  const v = own(INCOME.sggs, code5)
  if (!v) return { ok: false, why: 'none', src: INCOME.src }
  const sido = own(INCOME.sidos, code5.slice(0, 2), /^\d{2}$/) ?? null
  return {
    ok: true,
    v: { sggName: v.name, won: v.won, year: INCOME.year, sidoName: sido?.name ?? null, sidoWon: sido?.won ?? null },
    src: INCOME.src,
    asOf: INCOME.asOf,
  }
}

/** 시군구 산업단지 고용 인원 합(그날 값 industry 칸). 산업단지가 없는 시군구는 none(`이 시·군·구에는 산업단지 고용 자료가 없어요`) */
export function industryOf(code5: string): Snapshot['industry'] {
  const v = own(INDUSTRY.sggs, code5)
  if (!v) return { ok: false, why: 'none', src: INDUSTRY.src }
  return {
    ok: true,
    v: { sggName: v.name, employees: v.employees, parks: v.parks, quarter: INDUSTRY.quarter },
    src: INDUSTRY.src,
    asOf: INDUSTRY.asOf,
  }
}
