import { describe, expect, it } from 'vitest'
import { DEFAULT_RSV_KINDS, type LedgerRow, type RsvKindDef } from '@/types/sunap'
import { RSV_KEY_TIP, rsvKeyChoices, rsvKeyPatch, rsvNow, rsvPatchFor } from './rsvKeys'

// 수납일지 다음 예약 번호 고르기(spec desk-feedback REQ-6301, 시안 docs/mockups/desk-feedback ①). 순수 함수. 줄은 지어낸 값

const base: LedgerRow = {
  chart: '10231',
  name: '김○○',
  time: '09:02',
  kind: 're',
  cash: 0,
  card: 15000,
  transfer: 0,
  unpaid: 0,
  health: 0,
  free: false,
  block: false,
  pt: false,
  rsv: { kind: 'none', source: 'bit', at: null },
  note: '',
  edited: [],
  doctor: null,
}
const row = (rsv: LedgerRow['rsv']): LedgerRow => ({ ...base, rsv })

// 종류 10개(설정에 둘 수 있는 만큼): 기본 셋 + 새 종류 일곱. 9번까지 번호, 아홉째·열째 종류는 번호 없음
const TEN_KINDS: RsvKindDef[] = [
  ...DEFAULT_RSV_KINDS,
  ...Array.from({ length: 7 }, (_, i) => ({ id: `kmore0${i}`, label: `새 종류 ${i + 1}`, counts: false, words: [`말${i}`] })),
]
// 이름을 바꾸고 차례를 바꾼 목록
const MY_KINDS: RsvKindDef[] = [
  { id: 'visit', label: '경과 보기', counts: true, words: ['경과'] },
  { id: 'kdosu01', label: '도수치료', counts: true, words: ['도수'] },
  { id: 'inj', label: '신경주사', counts: true, words: ['주사'] },
  { id: 'etc', label: '기타', counts: false, words: ['기타'] },
]

describe('AC-6301.1 rsvKeyChoices — 번호와 값', () => {
  it("AC-6301.1: 0 = 비트 따라가기, 1 = '예약 안 하고 가심', 2부터 설정 목록 차례 그대로(이름은 설정 이름)", () => {
    expect(rsvKeyChoices(DEFAULT_RSV_KINDS)).toEqual([
      { key: '0', choice: 'bit', label: '비트 따라가기' },
      { key: '1', choice: 'none', label: '예약 안 하고 가심' },
      { key: '2', choice: 'inj', label: '주사치료' },
      { key: '3', choice: 'visit', label: '진료(경과)' },
      { key: '4', choice: 'etc', label: '기타' },
    ])
    expect(rsvKeyChoices(MY_KINDS).map(({ key, choice, label }) => `${key} ${choice} ${label}`)).toEqual([
      '0 bit 비트 따라가기',
      '1 none 예약 안 하고 가심',
      '2 visit 경과 보기',
      '3 kdosu01 도수치료',
      '4 inj 신경주사',
      '5 etc 기타',
    ])
  })

  it('AC-6301.1: 9 = 여덟째 종류이고 아홉째 종류부터는 번호가 없다', () => {
    const choices = rsvKeyChoices(TEN_KINDS)
    expect(choices.map(({ key }) => key)).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'])
    expect(choices[9]).toEqual({ key: '9', choice: TEN_KINDS[7]!.id, label: TEN_KINDS[7]!.label })
    expect(choices.some(({ choice }) => choice === TEN_KINDS[8]!.id || choice === TEN_KINDS[9]!.id)).toBe(false)
  })

  it('AC-6301.1: 종류가 하나도 없으면 0·1만', () => {
    expect(rsvKeyChoices([]).map(({ key }) => key)).toEqual(['0', '1'])
  })
})

describe('AC-6301.1 rsvNow — 지금 값(고르기 판과 같다)', () => {
  it('AC-6301.1: 비트 값을 따라가는 줄은 종류와 상관없이 비트 따라가기', () => {
    expect(rsvNow(row({ kind: 'inj', source: 'bit', at: '202611191030' }), DEFAULT_RSV_KINDS)).toBe('bit')
    expect(rsvNow(row({ kind: 'none', source: 'bit', at: null }), DEFAULT_RSV_KINDS)).toBe('bit')
    expect(rsvNow(row({ kind: 'unknown', source: 'bit', at: '202611210930' }), DEFAULT_RSV_KINDS)).toBe('bit')
  })

  it('AC-6301.1: 직접 고른 값이 목록에 있으면 그 값(예약 안 하고 가심 포함), 목록에 없으면 비트 따라가기', () => {
    expect(rsvNow(row({ kind: 'inj', source: 'hand', at: null }), DEFAULT_RSV_KINDS)).toBe('inj')
    expect(rsvNow(row({ kind: 'none', source: 'hand', at: null }), DEFAULT_RSV_KINDS)).toBe('none')
    expect(rsvNow(row({ kind: 'kgone01', source: 'hand', at: null }), DEFAULT_RSV_KINDS)).toBe('bit')
  })
})

describe('AC-6301.1 rsvKeyPatch·rsvPatchFor — 고칠 값', () => {
  const bitInj = row({ kind: 'inj', source: 'bit', at: '202611191030' })
  const handInj = row({ kind: 'inj', source: 'hand', at: null })

  it('AC-6301.1: 비트 따라가는 줄에서 2 → {rsv: 첫째 종류}, 1 → {rsv: none}, 0 → 같아서 null', () => {
    expect(rsvKeyPatch(bitInj, DEFAULT_RSV_KINDS, '2')).toEqual({ rsv: 'inj' })
    expect(rsvKeyPatch(bitInj, DEFAULT_RSV_KINDS, '1')).toEqual({ rsv: 'none' })
    expect(rsvKeyPatch(bitInj, DEFAULT_RSV_KINDS, '4')).toEqual({ rsv: 'etc' })
    expect(rsvKeyPatch(bitInj, DEFAULT_RSV_KINDS, '0')).toBeNull()
  })

  it('AC-6301.1: 직접 고른 줄에서 0 → {revert: rsv}, 지금 값과 같은 번호 → null', () => {
    expect(rsvKeyPatch(handInj, DEFAULT_RSV_KINDS, '0')).toEqual({ revert: 'rsv' })
    expect(rsvKeyPatch(handInj, DEFAULT_RSV_KINDS, '2')).toBeNull()
    expect(rsvKeyPatch(handInj, DEFAULT_RSV_KINDS, '3')).toEqual({ rsv: 'visit' })
    expect(rsvKeyPatch(row({ kind: 'none', source: 'hand', at: null }), DEFAULT_RSV_KINDS, '1')).toBeNull()
  })

  it('AC-6301.1: 목록에 없는 직접 값은 비트 따라가기로 보므로 0은 null', () => {
    const gone = row({ kind: 'kgone01', source: 'hand', at: null })
    expect(rsvKeyPatch(gone, DEFAULT_RSV_KINDS, '0')).toBeNull()
    expect(rsvKeyPatch(gone, DEFAULT_RSV_KINDS, '2')).toEqual({ rsv: 'inj' })
  })

  it('AC-6301.1: 번호가 없는 키는 null', () => {
    for (const key of ['5', '9', 'a', 'Enter', 'ArrowDown', '', '10', '-1', ' ']) expect(rsvKeyPatch(bitInj, DEFAULT_RSV_KINDS, key), key).toBeNull()
  })

  it('AC-6301.1: 종류가 10개면 9는 여덟째 종류', () => {
    expect(rsvKeyPatch(bitInj, TEN_KINDS, '9')).toEqual({ rsv: TEN_KINDS[7]!.id })
  })

  it('AC-6301.1: rsvPatchFor는 고른 값이 지금 값과 같으면 null, 비트 따라가기는 {revert: rsv}', () => {
    expect(rsvPatchFor(handInj, DEFAULT_RSV_KINDS, 'bit')).toEqual({ revert: 'rsv' })
    expect(rsvPatchFor(handInj, DEFAULT_RSV_KINDS, 'inj')).toBeNull()
    expect(rsvPatchFor(bitInj, DEFAULT_RSV_KINDS, 'bit')).toBeNull()
    expect(rsvPatchFor(bitInj, DEFAULT_RSV_KINDS, 'visit')).toEqual({ rsv: 'visit' })
  })
})

describe('AC-6301.4 판 안 안내 글', () => {
  it('AC-6301.4: RSV_KEY_TIP 글 그대로', () => {
    expect(RSV_KEY_TIP).toBe('판이 열려 있을 때도 숫자 키를 치면 바로 고르고 닫혀요.')
  })
})
