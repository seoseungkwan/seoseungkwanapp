import { describe, expect, it } from 'vitest'
import type { Equipment } from '@/types/contacts'
import { WARRANTY_SOON_DAYS, soonestWarranty, warrantyState } from './warranty'

const TODAY = '2026-11-21'
const equipment = (id: string, warrantyUntil: string | null): Equipment => ({
  id,
  companyId: 'c1',
  name: `장비 ${id}`,
  serial: '',
  boughtOn: null,
  warrantyUntil,
})

// 무상 수리 남은 날(시안 기본값 16, design.md '예' warrantyState)
describe('AC-6503.8 warrantyState', () => {
  it('AC-6503.8: 알리는 기간은 30일이다', () => {
    expect(WARRANTY_SOON_DAYS).toBe(30)
  })

  it('AC-6503.8: 끝나는 날이 없으면 none, 지났으면 ended, 0~30일이면 soon, 31일 이상이면 later', () => {
    expect(warrantyState(null, TODAY)).toEqual({ kind: 'none' })
    expect(warrantyState('2026-11-20', TODAY)).toEqual({ kind: 'ended' })
    expect(warrantyState('2026-11-21', TODAY)).toEqual({ kind: 'soon', days: 0 })
    expect(warrantyState('2026-12-03', TODAY)).toEqual({ kind: 'soon', days: 12 })
    expect(warrantyState('2026-12-21', TODAY)).toEqual({ kind: 'soon', days: 30 })
    expect(warrantyState('2026-12-22', TODAY)).toEqual({ kind: 'later', days: 31 })
    expect(warrantyState('2020-01-01', TODAY)).toEqual({ kind: 'ended' })
  })

  it('AC-6503.8: 해·달을 넘겨도 한국 날짜 글자로 센다(윤년 포함)', () => {
    expect(warrantyState('2027-01-01', '2026-12-31')).toEqual({ kind: 'soon', days: 1 })
    expect(warrantyState('2028-03-01', '2028-02-28')).toEqual({ kind: 'soon', days: 2 })
  })

  it('AC-6503.8: 날짜 모양이 아닌 끝나는 날은 none이다(던지지 않는다)', () => {
    expect(warrantyState('', TODAY)).toEqual({ kind: 'none' })
    expect(warrantyState('2026-13-01', TODAY)).toEqual({ kind: 'none' })
  })
})

describe('AC-6503.8 soonestWarranty', () => {
  it('AC-6503.8: soon 가운데 남은 날이 가장 적은 하나다([12일, 0일, 끝남] → 0)', () => {
    const list = [equipment('a', '2026-12-03'), equipment('b', '2026-11-21'), equipment('c', '2026-11-01')]
    expect(soonestWarranty(list, TODAY)).toEqual({ days: 0 })
  })

  it('AC-6503.8: soon이 없으면 null이다(끝남·later·none만)', () => {
    expect(soonestWarranty([], TODAY)).toBeNull()
    expect(soonestWarranty([equipment('a', '2026-11-01'), equipment('b', '2027-06-01'), equipment('c', null)], TODAY)).toBeNull()
  })

  it('AC-6503.8: 30일째도 soon이라 고른다', () => {
    expect(soonestWarranty([equipment('a', '2027-06-01'), equipment('b', '2026-12-21')], TODAY)).toEqual({ days: 30 })
  })
})
