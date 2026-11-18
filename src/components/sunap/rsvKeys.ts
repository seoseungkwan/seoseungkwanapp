import type { HandRsvKind, LedgerRow, RsvKindDef } from '@/types/sunap'
import { RSV_NONE, type LedgerPatch } from './labels'

// 수납일지 다음 예약 번호 고르기(spec desk-feedback REQ-6301, 시안 docs/mockups/desk-feedback ①).
// 환자 값을 받지 않는 순수 함수만 둔다(labels.ts와 같은 자리) → 장부 줄 화면(rows)도 쓴다. 네트워크·저장소·supabase 없음

/** 고르기 판 선택지 값: bit = 비트 따라가기(직접 고른 값을 지움), 나머지는 직접 고른 값(none 또는 종류 id) */
export type RsvChoice = 'bit' | HandRsvKind
export type RsvKeyChoice = { key: string; choice: RsvChoice; label: string }

export const RSV_BIT = '비트 따라가기'
export const RSV_KEY_TIP = '판이 열려 있을 때도 숫자 키를 치면 바로 고르고 닫혀요.'
// 2~9번 = 설정 목록 첫째~여덟째 종류(아홉째 종류부터는 번호 없음)
const KIND_KEYS = 8

/** 번호와 값: 0 = 비트 따라가기, 1 = 예약 안 하고 가심, 2~9 = 설정 목록 차례대로 첫째~여덟째 종류(이름은 설정 이름) */
export function rsvKeyChoices(kinds: readonly RsvKindDef[]): RsvKeyChoice[] {
  return [
    { key: '0', choice: 'bit', label: RSV_BIT },
    { key: '1', choice: 'none', label: RSV_NONE },
    ...kinds.slice(0, KIND_KEYS).map((kind, index) => ({ key: String(index + 2), choice: kind.id, label: kind.label })),
  ]
}

/** 지금 값(고르기 판과 같다): 직접 고른 값이 목록에 있으면(예약 안 하고 가심 포함) 그 값, 아니면 비트 따라가기 */
export function rsvNow(row: LedgerRow, kinds: readonly RsvKindDef[]): RsvChoice {
  const { kind, source } = row.rsv
  const listed = kind === 'none' || kinds.some((item) => item.id === kind)
  return source === 'hand' && listed ? kind : 'bit'
}

/** 고른 값으로 고칠 값. 지금 값과 같으면 null */
export function rsvPatchFor(row: LedgerRow, kinds: readonly RsvKindDef[], choice: RsvChoice): LedgerPatch | null {
  if (choice === rsvNow(row, kinds)) return null
  return choice === 'bit' ? { revert: 'rsv' } : { rsv: choice }
}

/** 번호 키로 고칠 값. 번호가 없는 키이거나 지금 값과 같으면 null */
export function rsvKeyPatch(row: LedgerRow, kinds: readonly RsvKindDef[], key: string): LedgerPatch | null {
  const hit = rsvKeyChoices(kinds).find((item) => item.key === key)
  return hit === undefined ? null : rsvPatchFor(row, kinds, hit.choice)
}
