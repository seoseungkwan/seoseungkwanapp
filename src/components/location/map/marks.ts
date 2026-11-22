// 작은 지도의 의원 점과 범례 글(specs/location AC-7916.1 · AC-7921.4, design.md 13·18절, 시안 miniMap). 순수 함수 — 읽기·저장·fetch 없음.
// 점은 그날 값 의원(심평원 목록, 공공 자료)의 좌표 at. 대표 과목은 lib/location/depts.ts deptOf, 경쟁·둘레로 보기·안 보기는 과목 고르기(DeptRule)
import { deptOf, deptRole } from '@/lib/location/depts'
import type { DeptRule, Rival } from '@/types/location'
import type { MapMark } from './KakaoMap'

type ClinicPoint = Pick<Rival, 'name' | 'depts' | 'at' | 'distM'>

/**
 * 의원마다 점 하나: 대표 과목이 경쟁 = 주황(rival) · 한의원(둘레로 보기) = 회색(korean) · 그 밖 둘레로 보기 = 연보라 작은 점(other).
 * 대표 과목이 없으면(과목이 모두 안 보기) 찍지 않는다. 거리가 범위 반지름보다 멀면 흐리게(outside). label = 의원 이름(마우스를 올리면 보임)
 */
export function clinicMarks(clinics: readonly ClinicPoint[], rule: DeptRule, radiusM: number): MapMark[] {
  const marks: MapMark[] = []
  clinics.forEach((clinic, i) => {
    const dept = deptOf(clinic, rule)
    if (dept === null) return
    const kind = deptRole(dept, rule) === 'rival' ? 'rival' : dept === 'korean' ? 'korean' : 'other'
    marks.push({ id: `clinic-${i}`, kind, at: clinic.at, label: clinic.name, ...(clinic.distM > radiusM ? { outside: true } : {}) })
  })
  return marks
}

/** 지도 아래 범례 글(시안 그대로). 회색 점 = 한의원은 한의원이 둘레로 보기일 때만 */
export function mapLegend(rule: DeptRule): string {
  return [
    '파란 표시 = 후보',
    '주황 점 = 경쟁 의원',
    ...(deptRole('korean', rule) === 'around' ? ['회색 점 = 한의원(따로 셈)'] : []),
    '연보라 작은 점 = 둘레 다른 과 의원',
    '검은 네모 = 역',
    '흐린 점 = 범위 밖',
  ].join(' · ')
}
