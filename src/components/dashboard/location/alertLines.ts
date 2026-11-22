import { DEPTS, deptOfText } from '@/lib/location/depts'
import type { DeptRule, LocationEvent, WatchCandidate } from '@/types/location'

// 대시보드 새 경쟁 의원 알림 줄 만들기 (specs/location REQ-7915 AC-7915.2, REQ-7921 AC-7921.4, design.md 12·18절,
// requirements '화면 글 기본값' 새 경쟁 의원 알림). 순수 함수: 안 본 알림 줄에 후보 이름과 대표 과목 짧은 이름을 붙이고,
// 지금 과목 고르기 설정의 경쟁 과목인 줄만 남긴다('알림은 경쟁 과목만' — 시안도 고른 경쟁 과목만 그린다).
// 대표 과목은 넣을 때(watch.ts pickEvents)와 같은 deptOfText — 알림 줄에는 업태 글이 없어 비운다.
// 대표 과목을 아예 모르면(과목 글·이름에 든 과목이 없음) 과목 없이('경쟁 의원이 …') 보이고, 찾은 과목이 모두 안 보기면 빠진다.
// 경쟁 과목이 0개면 줄이 없다

/** 알림 한 줄: 안 본 알림 줄 + 후보 이름(후보를 못 읽었으면 null) + 대표 과목 짧은 이름(모르면 null — '경쟁 의원이 …') */
export type AlertLine = LocationEvent & { candidateName: string | null; deptShort: string | null }

const SHORT = new Map(DEPTS.map((d) => [d.id, d.short]))

/** 남기면 대표 과목 짧은 이름(모르면 null), 빼면 undefined */
function deptShortOf(e: LocationEvent, rule: DeptRule): string | null | undefined {
  const row = { name: e.clinicName, subjects: e.dept, type: '' }
  const id = deptOfText(row, rule)
  if (id !== null) return rule.rival.includes(id) ? (SHORT.get(id) ?? null) : undefined
  // 안 보기를 비우고도 못 찾으면 모르는 과목, 찾으면 모두 안 보기라 뺀다
  return deptOfText(row, { ...rule, hide: [] }) === null ? null : undefined
}

export function alertLines(
  events: readonly LocationEvent[],
  candidates: readonly Pick<WatchCandidate, 'id' | 'name'>[],
  rule: DeptRule,
): AlertLine[] {
  if (rule.rival.length === 0) return []
  const names = new Map(candidates.map((c) => [c.id, c.name]))
  return events.flatMap((e) => {
    const deptShort = deptShortOf(e, rule)
    return deptShort === undefined ? [] : [{ ...e, candidateName: names.get(e.candidateId) ?? null, deptShort }]
  })
}
