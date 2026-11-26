import { addDays, monthRange } from '@/lib/analytics/dates'
import { AGE_BANDS, NO_BIRTH } from '@/lib/analytics/patientMix'
import { sumAges, sumRxCodes, sumRxGroups, tileRx, type UisKnown } from '@/lib/analytics/uisarang'
import { uisUnitOf, validateUisAgePayload, validateUisRxPayload } from '@/lib/payload/uisarang'
import type { UisAgePayload, UisGroupDef, UisPeriodKind, UisPeriodRow, UisRxPayload } from '@/types/uisarang'
import type { CompareRaw } from './load'

// 의원 비교 — 의사랑 의원 숫자(spec uisarang-upload REQ-8813 AC-8813.1·AC-8813.3·AC-8813.4, design.md §10-4). 순수 함수.
// 줄은 admin_uis_rows jsonb 그대로(clinic_emr {emr} · uis_periods {kind, from_day, to_day, payload}). 저장 모양은 저장소 읽기
// (lib/storage/uisarang readUisPeriods)와 같은 검사(validateUisRxPayload·validateUisAgePayload·기간 모양)로 고르고,
// 셈은 통계 탭과 같은 의사랑 셈(lib/analytics/uisarang — tileRx·sumRxCodes·sumRxGroups·sumAges)을 그대로 쓴다. 새 공식을 두지 않는다.
// 새 두 종류는 열쇠가 없을 수 있다(열여덟 종류만 만든 값) — 늘 `?? []`로 읽는다

type Row = Record<string, unknown>

/** 나이대 열 줄 이름(AGE_BANDS 아홉 + 생년월일 없음) — 저장 모양 bands와 같은 차례 */
const AGE_NAMES: readonly string[] = [...AGE_BANDS, NO_BIRTH]

/** 의사랑 의원인지: admin_uis_rows('clinic_emr') 줄의 emr이 uisarang. 줄이 없으면(함수가 아직 없는 DB 포함) 비트 의원처럼 그린다 */
export function isUisClinic(raw: CompareRaw): boolean {
  return (raw.clinic_emr ?? []).some((row) => row.emr === 'uisarang')
}

// uis_periods 한 종류: 저장 모양 검사 + 기간 모양(처방은 하루·한 주·한 달, 나이대는 하루). updated_at은 함수가 주지 않는다(기본 키가 같은 기간 둘을 막는다)
function periodRows<P>(raw: CompareRaw, kind: UisPeriodKind, check: (value: unknown) => P | null): UisPeriodRow<P>[] {
  return (raw.uis_periods ?? []).flatMap((row: Row) => {
    const { kind: rowKind, from_day: from, to_day: to } = row
    if (rowKind !== kind || typeof from !== 'string' || typeof to !== 'string') return []
    const unit = uisUnitOf(from, to)
    if (unit === null || (kind === 'age' && unit !== 'day')) return []
    const payload = check(row.payload)
    return payload === null ? [] : [{ kind, from, to, payload, updatedAt: '' }]
  })
}

export const uisRxRows = (raw: CompareRaw): UisPeriodRow<UisRxPayload>[] => periodRows(raw, 'rx', validateUisRxPayload)
export const uisAgeRows = (raw: CompareRaw): UisPeriodRow<UisAgePayload>[] => periodRows(raw, 'age', validateUisAgePayload)

/** 그달 나이대(내원 건): 나이대 열 줄 {name, people}와 합(열 칸 모두). 그달 나이대 하루 줄이 없으면 null */
export type UisAgeMix = { people: number; age: { name: string; people: number }[] }

export function uisAgeMix(raw: CompareRaw, month: string, worked: ReadonlySet<string>): UisAgeMix | null {
  const sums = sumAges(uisAgeRows(raw), monthRange(month), worked)
  if (sums.days === 0) return null
  const age = AGE_NAMES.map((name, i) => ({ name, people: sums.bands[i] ?? 0 }))
  return { people: age.reduce((total, row) => total + row.people, 0), age }
}

/** 처방 묶음(통계 처방 묶음 줄에서 고른 것): 이름 + 의사랑 셈이 받는 정의 */
export type UisGroup = UisGroupDef & { name: string }

/**
 * 그달 묶음별 처방량(묶음 차례 그대로). 그달이 처방 줄로 다 덮일 때만(tileRx ok — 휴진·덮은 날 밖은 통계 탭과 같은 규칙), 아니면 null.
 * 오늘 = 다음 달 1일(통계 탭이 끝난 달을 고른 것과 같다)
 */
export function uisGroupQty(raw: CompareRaw, month: string, known: UisKnown, groups: readonly UisGroup[]): { name: string; qty: number }[] | null {
  const range = monthRange(month)
  const tile = tileRx(range, uisRxRows(raw), known, addDays(range.to, 1))
  if (!tile.ok) return null
  const sums = sumRxGroups(sumRxCodes(tile.used), groups)
  return groups.map((group, i) => ({ name: group.name, qty: sums.groups[i]?.qty ?? 0 }))
}
